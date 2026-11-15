// Geração da página de download a partir das releases.
//
// Por que gerar HTML em vez de buscar JSON no navegador: a página precisa abrir
// direto do disco (`file://`), sem servidor e sem CORS. Com os dados embutidos,
// `index.html` é a página inteira.
//
// ## Um arquivo, dois destinos
//
// `singleFile: true` produz UM `index.html` autocontido — CSS no `<style>`, marca
// em SVG, logo embutido — e os downloads apontando para a release do GitHub. É o
// que fica na raiz do repositório: o GitHub Pages publica o repositório, então a
// página existe sem depender de nenhum job de deploy.
//
// `singleFile: false` mantém o modo antigo: `index.html` + `assets/` +
// `downloads/`, para abrir uma cópia local com as imagens ao lado. A estrutura da
// página é a MESMA nos dois casos — um template só, senão as duas versões
// divergem, e a que ninguém abre é a que quebra.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { humanSize, isDir, isFile, listDir, readJson, walk } from "./fs.mjs";
import { decompressCommand, renderQemuCommand } from "./qemu.mjs";
import { nomeComAparelho } from "./release-assets.mjs";

export const DEFAULT_REPO = "xtrempkch-droid/GIOCHI-OS";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]),
  );
}

/**
 * Marca do cabeçalho, em SVG.
 *
 * Embutida em vez de ser o PNG de 126 KB reduzido a 28×28: o arquivo não
 * carrega informação que justifique o peso, e SVG inline não é um segundo arquivo.
 */
const MARK_SVG = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <defs><linearGradient id="giochi-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8ed0f8"/><stop offset="1" stop-color="#1f6feb"/>
        </linearGradient></defs>
        <rect width="32" height="32" rx="8" fill="url(#giochi-mark)"/>
        <circle cx="12.4" cy="16" r="4.5" fill="none" stroke="#04121d" stroke-width="2.2"/>
        <path d="M19.6 11.7l5.6 8.6M25.2 11.7l-5.6 8.6" stroke="#04121d" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;

/** Favicon como data URI: um arquivo a menos, nenhuma requisição. */
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="8" fill="#1f6feb"/>
<circle cx="12.4" cy="16" r="4.5" fill="none" stroke="#04121d" stroke-width="2.6"/>
<path d="M19.6 11.7l5.6 8.6M25.2 11.7l-5.6 8.6" stroke="#04121d" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;

function faviconUri() {
  return `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG.replace(/\n/g, ""))}`;
}

/** Raiz dos anexos de uma versão, com a barra final. */
function releaseBase(repo, version) {
  const tag = `v${String(version || "").replace(/^v/, "")}`;
  return `https://github.com/${repo}/releases/download/${tag}/`;
}

/** Coleta `release.json` em qualquer profundidade. */
export function collectReleases(distDir) {
  const releases = [];
  const problems = [];

  if (!isDir(distDir)) {
    return { releases, problems: [{ message: `pasta não encontrada: ${distDir}` }] };
  }

  for (const relative of walk(distDir)) {
    // Dois layouts, e os dois acontecem de verdade:
    //
    //   dist/<device>/release.json      saída da fase `package`
    //   dist/<device>-release.json      depois do `flatten`, que tira o
    //                                   manifesto de dentro da pasta para os
    //                                   anexos não colidirem na release
    //
    // Aceitar só o primeiro fazia `--single-file` falhar no CI com "nenhum
    // release.json encontrado" — depois de a release já ter sido publicada.
    const base = path.basename(relative);
    if (base !== "release.json" && !base.endsWith("-release.json")) continue;

    const full = path.join(distDir, relative);
    try {
      const release = readJson(full, "release.json");
      const holder = path.dirname(full);
      // No layout achatado o manifesto fica AO LADO da pasta do aparelho, e é
      // lá que as imagens estão.
      const irmao = path.join(holder, release.device?.id || "");
      release.__dir = isDir(irmao) ? irmao : holder;
      release.__relative = path.relative(distDir, release.__dir).split(path.sep).join("/");
      releases.push(release);
    } catch (error) {
      problems.push({ message: `${relative}: ${error.message}` });
    }
  }

  // Cartão antes de máquina virtual, e depois por nome: a ordem da página é a
  // ordem em que a maioria chega aqui — quem tem o aparelho quer o cartão.
  const peso = (release) =>
    (release.system?.kind === "virtual" || release.device?.kind === "virtual") ? 1 : 0;
  releases.sort((a, b) => {
    const porTipo = peso(a) - peso(b);
    if (porTipo !== 0) return porTipo;
    return String(a.device?.name || "").localeCompare(String(b.device?.name || ""));
  });
  return { releases, problems };
}

function isVirtualRelease(release) {
  const system = release.system || {};
  const device = release.device || {};
  return system.kind === "virtual" || device.kind === "virtual";
}

function deviceAnchor(release) {
  return `baixar-${release.device?.id || "desconhecido"}`;
}

function appsDe(release) {
  const apps = release.apps || {};
  return [...(apps.embedded || []), ...(apps.store || [])];
}

/** Card de um aparelho: o que baixar, quanto pesa, o que tem dentro. */
function renderRelease(release) {
  const device = release.device || {};
  const system = release.system || {};
  const apps = release.apps || { embedded: [], store: [] };
  const sha = String(system.imageSha256 || "");
  const virtual = isVirtualRelease(release);
  const size = system.sizeHuman || (system.sizeBytes ? humanSize(system.sizeBytes) : "—");
  const kindLabel = virtual ? "Máquina virtual" : "Cartão SD";

  const appList = appsDe(release)
    .map((app) => `<li><span>${escapeHtml(app.id)}</span><em>${escapeHtml(app.version)}</em></li>`)
    .join("");

  const botoes = [
    release.__href
      ? `<a class="btn" href="${escapeHtml(release.__href)}" download>Baixar ${virtual ? "disco" : "imagem"} (${escapeHtml(size)})</a>`
      : `<span class="btn btn-off">imagem indisponível</span>`,
    // O kernel é um download separado no alvo virtual, e sem ele o disco não
    // inicia. Escondê-lo transformaria o botão principal num link que não boota.
    release.__kernelHref
      ? `<a class="btn btn-ghost" href="${escapeHtml(release.__kernelHref)}" download>Kernel (${escapeHtml(system.kernel?.sizeHuman || "")})</a>`
      : "",
    release.__sumsHref
      ? `<a class="btn btn-ghost" href="${escapeHtml(release.__sumsHref)}" download>Checksum</a>`
      : "",
    release.__readmeHref
      ? `<a class="btn btn-ghost" href="${escapeHtml(release.__readmeHref)}" download>Instruções</a>`
      : "",
  ].filter(Boolean);

  return `
    <article class="card${virtual ? " card-vm" : ""}" id="${escapeHtml(deviceAnchor(release))}">
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
        <div><dt>Apps na imagem</dt><dd>${apps.embedded?.length || 0}</dd></div>
        <div><dt>Apps na loja</dt><dd>${apps.store?.length || 0}</dd></div>
        ${system.kernel ? `<div><dt>Kernel</dt><dd class="mono">${escapeHtml(system.kernel.name)}</dd></div>` : ""}
      </dl>

      ${sha ? `<p class="sha">sha256 ${escapeHtml(sha)}</p>` : ""}

      ${
        appList
          ? `<details><summary>Ver os ${appsDe(release).length} app(s)</summary><ul class="apps">${appList}</ul></details>`
          : ""
      }

      ${virtual ? renderRunBlock(release) : renderCardHint(system)}

      <div class="downlinks">${botoes.join("\n        ")}</div>
      <p class="muted mono small">${escapeHtml(system.image || "")}</p>
    </article>`;
}

/**
 * Aviso para imagem de cartão comprimida.
 *
 * O botão baixa um `.img.xz`; gravar isso direto no cartão produz um aparelho que
 * não inicializa, porque o `dd` copia bytes de xz. O passo de descomprimir tem de
 * estar na mesma tela do botão — a seção "Gravar" fica abaixo, e quem baixou não
 * necessariamente desce até lá.
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
 * O comando é o mesmo do `README.txt` da release: sai de `renderQemuCommand`, não
 * de uma cópia. Se o `-append` mudar, muda nos dois lugares de uma vez.
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

function renderItemList(items) {
  return items.map((item) => `<li>${item}</li>`).join("\n              ");
}

/** Itens do submenu "Baixar": um por aparelho, com o tipo ao lado. */
function renderNavDownloads(releases) {
  return releases
    .map(
      (release) => `<li><a href="#${escapeHtml(deviceAnchor(release))}">${escapeHtml(
        release.device?.name || release.device?.id || "?",
      )} <span>${isVirtualRelease(release) ? "QEMU" : "cartão"}</span></a></li>`,
    )
    .join("\n              ");
}

/** Itens do submenu "Aparelhos": leva à linha da tabela de cada um. */
function renderNavDevices(releases) {
  return releases
    .map(
      (release) => `<li><a href="#aparelho-${escapeHtml(
        release.device?.id || "?",
      )}">${escapeHtml(release.device?.id || "?")} <span>${escapeHtml(
        release.device?.arch || "",
      )}</span></a></li>`,
    )
    .join("\n              ");
}

/** Linhas da tabela "Aparelhos suportados". */
function renderDeviceRows(releases) {
  return releases
    .map((release) => {
      const device = release.device || {};
      const system = release.system || {};
      const size = system.sizeHuman || (system.sizeBytes ? humanSize(system.sizeBytes) : "—");
      return `            <tr id="aparelho-${escapeHtml(device.id || "?")}">
              <td><a href="#${escapeHtml(deviceAnchor(release))}">${escapeHtml(device.name || device.id || "?")}</a></td>
              <td class="mono">${escapeHtml(device.id || "?")}</td>
              <td>${escapeHtml(device.arch || "—")}</td>
              <td>${isVirtualRelease(release) ? "Máquina virtual" : "Cartão SD"}</td>
              <td>${escapeHtml(system.version || "—")}</td>
              <td>${escapeHtml(size)}</td>
              <td>${appsDe(release).length}</td>
            </tr>`;
    })
    .join("\n");
}

function linkNome(href, nome) {
  return href
    ? `<a href="${escapeHtml(href)}" download>${escapeHtml(nome)}</a>`
    : `<span class="muted mono">${escapeHtml(nome)}</span>`;
}

function renderSumsLinks(releases) {
  return renderItemList(
    releases.map((release) =>
      linkNome(release.__sumsHref, nomeComAparelho(release.device?.id || "?", "SHA256SUMS")),
    ),
  );
}

function renderReadmeLinks(releases) {
  return renderItemList(
    releases.map((release) =>
      linkNome(release.__readmeHref, nomeComAparelho(release.device?.id || "?", "README.txt")),
    ),
  );
}

/**
 * Bloco genérico do QEMU.
 *
 * Usa o primeiro alvo virtual publicado: é o mesmo comando do card daquele
 * aparelho, e uma seção "como rodar" que discorda do card é pior que não ter.
 */
function renderQemuGeneric(releases) {
  const virtual = releases.find((release) => isVirtualRelease(release));
  if (!virtual || !virtual.boot?.disk) {
    return `<p class="muted">
        Nenhuma imagem de máquina virtual publicada no momento. Quando houver, o
        comando exato aparece aqui e no card dela.
      </p>`;
  }
  return renderRunBlock(virtual);
}

/** Links dos repositórios: os três que compõem a imagem, mais este. */
function renderRepoLinks(repo, releases) {
  const itens = [
    ["GIOCHI-SYSTEM", "o Linux limpo de cada aparelho"],
    ["GIOCHI-APP", "os apps e a loja"],
    ["GIOCHI-GAMES", "os jogos"],
    ["GIOCHI-OS", "este repositório: junta e publica"],
  ].map(([nome, descricao]) => {
    const slug = nome === "GIOCHI-OS" ? repo : `${repo.split("/")[0]}/${nome}`;
    return `<li><a href="https://github.com/${escapeHtml(slug)}">${escapeHtml(nome)} <span class="muted small">— ${escapeHtml(descricao)}</span></a></li>`;
  });

  const versao = releases[0]?.system?.version;
  if (versao) {
    itens.push(
      `<li><a href="https://github.com/${escapeHtml(repo)}/releases">Todas as releases</a></li>`,
    );
  }
  return itens.join("\n        ");
}

function renderFooterLinks(repo) {
  return `<a href="https://github.com/${escapeHtml(repo)}">código</a> ·
      <a href="https://github.com/${escapeHtml(repo)}/releases">releases</a> ·
      <a href="https://github.com/${escapeHtml(repo)}/blob/main/AGENTS.md">documentação técnica</a>`;
}

/**
 * Resolve os links de cada release.
 *
 * `downloadBase` (a release do GitHub) tem precedência: é o destino real da
 * página publicada. Sem ele, aponta para as cópias locais.
 */
function resolveLinks({ releases, downloadBase, copyImages, singleFile, repo }) {
  const warnings = [];

  for (const release of releases) {
    const deviceId = release.device?.id || "desconhecido";
    const system = release.system || {};
    const version = system.version;
    const imageName = system.image;
    const kernelName = system.kernel?.name;
    const sumsName = nomeComAparelho(deviceId, "SHA256SUMS");
    const readmeName = nomeComAparelho(deviceId, "README.txt");
    const targetDir = path.join(release.__dir, "__downloads");

    // O arquivo único não tem imagem ao lado: o destino é a release do GitHub.
    // A URL sai da MESMA versão que nomeia o arquivo, então link e nome não
    // podem discordar.
    const base = downloadBase || (singleFile && version ? releaseBase(repo, version) : null);
    const localPrefix = copyImages ? `downloads/${deviceId}` : release.__relative;

    release.__href = null;
    release.__kernelHref = null;
    release.__sumsHref = null;
    release.__readmeHref = null;

    if (base) {
      if (imageName) release.__href = `${base}${imageName}`;
      if (kernelName) release.__kernelHref = `${base}${kernelName}`;
      release.__sumsHref = `${base}${sumsName}`;
      release.__readmeHref = `${base}${readmeName}`;
      continue;
    }

    if (imageName) {
      if (!isFile(path.join(release.__dir, imageName))) {
        warnings.push({
          message: `${deviceId}: imagem não encontrada em ${release.__dir}; o card sai sem link`,
        });
      } else {
        release.__href = `${localPrefix}/${imageName}`;
      }
    }
    if (kernelName) {
      if (!isFile(path.join(release.__dir, kernelName))) {
        warnings.push({
          message: `${deviceId}: kernel ${kernelName} não encontrado; o disco sai sem link de kernel`,
        });
      } else {
        release.__kernelHref = `${localPrefix}/${kernelName}`;
      }
    }
    // Os nomes locais seguem a regra da release: `<aparelho>-SHA256SUMS`. Se
    // divergissem, a página de teste citaria um arquivo que só existe publicado.
    if (isFile(path.join(release.__dir, "SHA256SUMS"))) {
      release.__sumsHref = `${localPrefix}/${sumsName}`;
      release.__sumsSource = path.join(release.__dir, "SHA256SUMS");
      release.__sumsTarget = `${targetDir}-${sumsName}`;
    }
    if (isFile(path.join(release.__dir, "README.txt"))) {
      release.__readmeHref = `${localPrefix}/${readmeName}`;
      release.__readmeSource = path.join(release.__dir, "README.txt");
      release.__readmeTarget = `${targetDir}-${readmeName}`;
    }
  }

  // `repo` só é usado pelo chamador ao montar `downloadBase`; mantido no
  // contrato para não reabrir a assinatura em cada mudança de URL.
  return warnings;
}

/** Copia imagens, kernel e os arquivos por aparelho para `outDir/downloads/`. */
function copyDownloads({ releases, outDir }) {
  const downloadsDir = path.join(outDir, "downloads");
  // `downloads/` é RECRIADA, não preenchida: um aparelho que sai do `dist`
  // deixaria a imagem antiga publicada para sempre — link morto que ainda baixa.
  rmSync(downloadsDir, { recursive: true, force: true });

  for (const release of releases) {
    const deviceId = release.device?.id || "desconhecido";
    const targetDir = path.join(downloadsDir, deviceId);
    for (const nome of [release.system?.image, release.system?.kernel?.name]) {
      if (!nome) continue;
      const origem = path.join(release.__dir, nome);
      if (!isFile(origem)) continue;
      mkdirSync(targetDir, { recursive: true });
      copyFileSync(origem, path.join(targetDir, nome));
    }
    for (const [origem, nome] of [
      [release.__sumsSource, nomeComAparelho(deviceId, "SHA256SUMS")],
      [release.__readmeSource, nomeComAparelho(deviceId, "README.txt")],
    ]) {
      if (!origem || !isFile(origem)) continue;
      mkdirSync(targetDir, { recursive: true });
      copyFileSync(origem, path.join(targetDir, nome));
    }
  }
}

/**
 * Gera a página.
 *
 * `singleFile: true` escreve um `index.html` que carrega tudo dentro dele.
 * `singleFile: false` escreve `index.html` + `assets/` + `downloads/`.
 */
export function generateSite({
  distDir,
  outDir,
  templatePath,
  stylePath,
  copyImages = true,
  singleFile = false,
  downloadBase = null,
  repo = DEFAULT_REPO,
}) {
  const { releases, problems } = collectReleases(distDir);
  const errors = [...problems];
  const warnings = [];

  if (releases.length === 0) {
    errors.push({ message: "nenhum release.json encontrado; rode a fase package antes" });
    return { ok: false, releases: [], errors, warnings, indexPath: null };
  }

  warnings.push(...resolveLinks({ releases, downloadBase, copyImages, singleFile, repo }));

  if (!singleFile && copyImages) copyDownloads({ releases, outDir });

  // O CSS é a única dependência visual que sobra. No arquivo único ele entra
  // inline; no modo com pasta, é copiado como antes.
  const css = isFile(stylePath) ? readFileSync(stylePath, "utf8") : "";
  const styleTag = singleFile
    ? `<style>\n${css}\n</style>`
    : `<link rel="stylesheet" href="assets/style.css">`;

  if (!singleFile && isFile(stylePath)) {
    const assetsDir = path.dirname(stylePath);
    mkdirSync(path.join(outDir, "assets"), { recursive: true });
    for (const name of listDir(assetsDir)) {
      const origem = path.join(assetsDir, name);
      if (isFile(origem)) copyFileSync(origem, path.join(outDir, "assets", name));
    }
  }

  // O logo é fotográfico (102 KB). No arquivo único entra em base64; no modo com
  // pasta é um arquivo ao lado. Embutir num arquivo que também tem downloads
  // locais não faria sentido.
  const logoPath = path.join(path.dirname(stylePath), "logo.jpg");
  let logoHtml;
  if (!isFile(logoPath)) {
    logoHtml = "";
  } else if (singleFile) {
    const base64 = readFileSync(logoPath).toString("base64");
    logoHtml = `<img src="data:image/jpeg;base64,${base64}"
               alt="Giochi OS: tabuleiro neon com X e O e um rastro de energia"
               width="960" height="524" decoding="async">`;
  } else {
    logoHtml = `<img src="assets/logo.jpg"
               alt="Giochi OS: tabuleiro neon com X e O e um rastro de energia"
               width="960" height="524" decoding="async">`;
  }

  const template = readFileSync(templatePath, "utf8");
  const html = template
    .replace("<!--STYLE-->", styleTag)
    .replace("<!--FAVICON-->", singleFile ? faviconUri() : "assets/favicon.png")
    .replace("<!--MARK-->", MARK_SVG)
    .replace("<!--LOGO-->", logoHtml)
    .replace("<!--NAV_DOWNLOADS-->", renderNavDownloads(releases))
    .replace("<!--NAV_DEVICES-->", renderNavDevices(releases))
    .replace("<!--RELEASES-->", releases.map(renderRelease).join("\n"))
    .replace("<!--DEVICE_ROWS-->", renderDeviceRows(releases))
    .replace("<!--SUMS_LINKS-->", renderSumsLinks(releases))
    .replace("<!--README_LINKS-->", renderReadmeLinks(releases))
    .replace("<!--SUMS_COMMAND-->", "sha256sum -c &lt;aparelho&gt;-SHA256SUMS")
    .replace("<!--QEMU_GENERIC-->", renderQemuGeneric(releases))
    .replace("<!--REPO_LINKS-->", renderRepoLinks(repo, releases))
    .replace("<!--FOOTER_LINKS-->", renderFooterLinks(repo))
    .replaceAll("<!--GENERATED-->", new Date().toISOString())
    .replaceAll("<!--COUNT-->", String(releases.length));

  // Placeholder que sobrar no HTML é uma seção que ninguém preencheu — e ela
  // aparece na página como comentário invisível, sem erro nenhum. Melhor falhar.
  const restantes = [...html.matchAll(/<!--([A-Z_]+)-->/g)].map((m) => m[1]);
  if (restantes.length > 0) {
    errors.push({
      message: `template com placeholder não preenchido: ${[...new Set(restantes)].join(", ")}`,
    });
    return { ok: false, releases, errors, warnings, indexPath: null };
  }

  const target = singleFile ? outDir : path.join(outDir, "index.html");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, html, "utf8");

  if (!singleFile) {
    writeFileSync(
      path.join(path.dirname(target), "releases.json"),
      `${JSON.stringify(
        releases.map((release) => ({
          device: release.device,
          system: release.system,
          boot: release.boot || null,
          apps: release.apps,
          generatedAt: release.generatedAt,
          href: release.__href,
          kernelHref: release.__kernelHref || null,
          sumsHref: release.__sumsHref || null,
          readmeHref: release.__readmeHref || null,
        })),
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return { ok: true, releases, errors, warnings, indexPath: target, bytes: Buffer.byteLength(html) };
}
