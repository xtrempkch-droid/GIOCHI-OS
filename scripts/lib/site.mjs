// Geração do site a partir das releases.
//
// Por que gerar HTML em vez de buscar JSON no navegador: o site precisa abrir
// direto do disco (`file://`), sem servidor e sem CORS. Com os dados embutidos,
// `index.html` é o site inteiro.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { humanSize, isDir, isFile, listDir, readJson, walk } from "./fs.mjs";
import { decompressCommand, renderQemuCommand } from "./qemu.mjs";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]),
  );
}

/** Coleta `release.json` em qualquer profundidade. */
export function collectReleases(distDir) {
  const releases = [];
  const problems = [];

  if (!isDir(distDir)) {
    return { releases, problems: [{ message: `pasta não encontrada: ${distDir}` }] };
  }

  for (const relative of walk(distDir)) {
    if (path.basename(relative) !== "release.json") continue;
    const full = path.join(distDir, relative);
    try {
      const release = readJson(full, "release.json");
      release.__dir = path.dirname(full);
      release.__relative = path.dirname(relative).split(path.sep).join("/");
      releases.push(release);
    } catch (error) {
      problems.push({ message: `${relative}: ${error.message}` });
    }
  }

  releases.sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
  return { releases, problems };
}

function renderRelease(release) {
  const device = release.device || {};
  const system = release.system || {};
  const apps = release.apps || { embedded: [], store: [] };
  const sha = String(system.imageSha256 || "");
  const shaShort = sha ? `${sha.slice(0, 12)}…` : "—";
  const href = release.__href;
  const available = Boolean(href);
  const isVirtual = system.kind === "virtual" || device.kind === "virtual";

  const appList = [...(apps.embedded || []), ...(apps.store || [])]
    .map((app) => `<li><span>${escapeHtml(app.id)}</span><em>${escapeHtml(app.version)}</em></li>`)
    .join("");

  const button = available
    ? `<a class="btn" href="${escapeHtml(href)}" download>Baixar ${isVirtual ? "disco" : "imagem"}</a>`
    : `<span class="btn btn-off">imagem indisponível</span>`;

  // O kernel é um download separado em alvo virtual, e sem ele o disco não
  // inicia. Escondê-lo transformaria o botão principal num link que não boota.
  const kernel = system.kernel;
  const kernelButton =
    kernel && release.__kernelHref
      ? `<a class="btn btn-ghost" href="${escapeHtml(release.__kernelHref)}" download>Kernel (${escapeHtml(kernel.sizeHuman || "")})</a>`
      : "";

  const size = system.sizeHuman || (system.sizeBytes ? humanSize(system.sizeBytes) : "—");
  const kindLabel = isVirtual ? "Máquina virtual" : "Cartão SD";

  return `
    <article class="card${isVirtual ? " card-vm" : ""}">
      <header>
        <div>
          <h2>${escapeHtml(device.name || device.id || "Dispositivo")}</h2>
          <p class="muted">${escapeHtml(device.id || "?")} · ${escapeHtml(device.arch || "?")} · ${escapeHtml(kindLabel)}</p>
        </div>
        <span class="badge">${escapeHtml(system.version || "dev")}</span>
      </header>

      <dl class="specs">
        <div><dt>Tamanho</dt><dd>${escapeHtml(size)}</dd></div>
        <div><dt>Buildroot</dt><dd>${escapeHtml(system.buildroot || "—")}</dd></div>
        <div><dt>SHA-256</dt><dd class="mono">${escapeHtml(shaShort)}</dd></div>
        ${kernel ? `<div><dt>Kernel</dt><dd class="mono">${escapeHtml(kernel.name)}</dd></div>` : ""}
      </dl>

      ${
        appList
          ? `<details><summary>${apps.embedded?.length || 0} app(s) na imagem · ${apps.store?.length || 0} na loja</summary><ul class="apps">${appList}</ul></details>`
          : ""
      }

      ${isVirtual ? renderRunBlock(release) : renderCardHint(system)}

      <footer>
        ${button}
        ${kernelButton}
        <span class="muted mono">${escapeHtml(system.image || "")}</span>
      </footer>
    </article>`;
}

/**
 * Aviso para imagem de cartão comprimida.
 *
 * O botão baixa um `.img.xz`; gravar isso direto no cartão produz um aparelho
 * que não inicializa, porque o `dd` copia bytes de xz. O passo de descomprimir
 * tem de estar na mesma tela do botão — a seção "Gravar" fica abaixo, e quem
 * baixou não necessariamente desce até lá.
 */
function renderCardHint(system) {
  const descomprimir = decompressCommand(system.image);
  if (!descomprimir) return "";

  return `
        <p class="muted small hint">
          Este download é comprimido. <strong>Descomprima antes de gravar</strong> —
          o <code>dd</code> copia bytes crus:
        </p>
        <pre class="hint"><code>${escapeHtml(descomprimir)}</code></pre>`;
}

/**
 * Bloco "como rodar" dos alvos virtuais.
 *
 * O comando é o mesmo do `README.txt` da release: sai de `renderQemuCommand`,
 * não de uma cópia. Se o `-append` mudar, muda nos dois lugares de uma vez.
 */
function renderRunBlock(release) {
  const system = release.system || {};
  const boot = release.boot || {};
  if (!boot.disk) return "";

  const decompress = [system.image, system.kernel?.name]
    .filter(Boolean)
    .map((name) => decompressCommand(name))
    .filter(Boolean);

  return `
        <details class="run">
          <summary>Como iniciar no QEMU</summary>
          ${
            decompress.length > 0
              ? `<p class="muted">Descomprima primeiro:</p><pre><code>${decompress.map(escapeHtml).join("\n")}</code></pre>`
              : ""
          }
          <pre><code>${escapeHtml(renderQemuCommand(boot))}</code></pre>
          <p class="muted">
            Login <code>root</code>, senha <code>giochi-system</code>.
            Para sair do console: <code>Ctrl+A</code>, depois <code>X</code>.
            Esta imagem é headless: o console é a interface. Os apps estão em
            <code>/opt/giochi/apps</code> — rode o launcher com
            <code>SDL_VIDEODRIVER=dummy</code>.
          </p>
        </details>`;
}

/**
 * Gera `index.html` + `releases.json` em `outDir`.
 * Copia as imagens para `outDir/downloads/<device>/` quando `copyImages`.
 */
export function generateSite({
  distDir,
  outDir,
  templatePath,
  stylePath,
  copyImages = true,
}) {
  const { releases, problems } = collectReleases(distDir);
  const errors = [...problems];
  const warnings = [];

  if (releases.length === 0) {
    errors.push({
      message: "nenhum release.json encontrado; rode a fase package antes",
    });
    return { ok: false, releases: [], errors, warnings, indexPath: null };
  }

  mkdirSync(outDir, { recursive: true });
  mkdirSync(path.join(outDir, "assets"), { recursive: true });

  // `downloads/` é RECRIADA, não preenchida. `copyFileSync` sobrescreve mas
  // nunca apaga: um aparelho que sai do `dist` (ou é renomeado) deixaria a
  // imagem antiga publicada no site para sempre — link morto que ainda baixa,
  // e pior se a página antiga continuasse em cache. Só apaga quando este
  // processo é o dono da cópia (`copyImages`), senão a geração de só HTML
  // destruiria os downloads de uma rodada anterior.
  const downloadsDir = path.join(outDir, "downloads");
  if (copyImages) rmSync(downloadsDir, { recursive: true, force: true });

  // Copia a pasta `assets` inteira, não só o CSS: o site passou a ter logo
  // (`logo.jpg`), marca do cabeçalho (`logo-mark.png`) e favicon. Copiar só o
  // CSS deixa o site publicado com imagem quebrada — e o build fica verde.
  if (isFile(stylePath)) {
    const assetsDir = path.dirname(stylePath);
    for (const name of listDir(assetsDir)) {
      const origem = path.join(assetsDir, name);
      if (isFile(origem)) {
        copyFileSync(origem, path.join(outDir, "assets", name));
      }
    }
  }

  for (const release of releases) {
    const deviceId = release.device?.id || "desconhecido";
    const imageName = release.system?.image;
    if (!imageName) continue;

    const targetDir = path.join(outDir, "downloads", deviceId);

    const sourceImage = path.join(release.__dir, imageName);
    if (!isFile(sourceImage)) {
      warnings.push({
        message: `${deviceId}: imagem não encontrada em ${release.__dir}; o card sai sem link`,
      });
      release.__href = null;
    } else if (copyImages) {
      mkdirSync(targetDir, { recursive: true });
      copyFileSync(sourceImage, path.join(targetDir, imageName));
      release.__href = `downloads/${deviceId}/${imageName}`;
    } else {
      release.__href = `${release.__relative}/${imageName}`;
    }

    // O kernel é um segundo download no alvo virtual. Publicar o disco e
    // deixar o kernel para trás dá um botão que baixa um arquivo que não inicia.
    const kernelName = release.system?.kernel?.name;
    if (kernelName) {
      const sourceKernel = path.join(release.__dir, kernelName);
      if (!isFile(sourceKernel)) {
        warnings.push({
          message: `${deviceId}: kernel ${kernelName} não encontrado; o disco sai sem link de kernel`,
        });
        release.__kernelHref = null;
      } else if (copyImages) {
        mkdirSync(targetDir, { recursive: true });
        copyFileSync(sourceKernel, path.join(targetDir, kernelName));
        release.__kernelHref = `downloads/${deviceId}/${kernelName}`;
      } else {
        release.__kernelHref = `${release.__relative}/${kernelName}`;
      }
    }

    if (copyImages) {
      const sums = path.join(release.__dir, "SHA256SUMS");
      if (isFile(sums)) {
        mkdirSync(targetDir, { recursive: true });
        copyFileSync(sums, path.join(targetDir, "SHA256SUMS"));
      }
    }
  }

  const template = readFileSync(templatePath, "utf8");
  const html = template
    .replace("<!--RELEASES-->", releases.map(renderRelease).join("\n"))
    .replaceAll("<!--GENERATED-->", new Date().toISOString())
    .replaceAll("<!--COUNT-->", String(releases.length));

  const indexPath = path.join(outDir, "index.html");
  writeFileSync(indexPath, html, "utf8");

  writeFileSync(
    path.join(outDir, "releases.json"),
    `${JSON.stringify(
      releases.map((release) => ({
        device: release.device,
        system: release.system,
        boot: release.boot || null,
        apps: release.apps,
        generatedAt: release.generatedAt,
        href: release.__href,
        kernelHref: release.__kernelHref || null,
      })),
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { ok: true, releases, errors, warnings, indexPath };
}
