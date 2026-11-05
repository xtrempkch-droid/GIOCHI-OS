// Geração do site a partir das releases.
//
// Por que gerar HTML em vez de buscar JSON no navegador: o site precisa abrir
// direto do disco (`file://`), sem servidor e sem CORS. Com os dados embutidos,
// `index.html` é o site inteiro.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { humanSize, isDir, isFile, listDir, readJson, walk } from "./fs.mjs";

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

  const appList = [...(apps.embedded || []), ...(apps.store || [])]
    .map((app) => `<li><span>${escapeHtml(app.id)}</span><em>${escapeHtml(app.version)}</em></li>`)
    .join("");

  const button = available
    ? `<a class="btn" href="${escapeHtml(href)}" download>Baixar imagem</a>`
    : `<span class="btn btn-off">imagem indisponível</span>`;

  const size = system.sizeHuman || (system.sizeBytes ? humanSize(system.sizeBytes) : "—");

  return `
    <article class="card">
      <header>
        <div>
          <h2>${escapeHtml(device.name || device.id || "Dispositivo")}</h2>
          <p class="muted">${escapeHtml(device.id || "?")} · ${escapeHtml(device.arch || "?")}</p>
        </div>
        <span class="badge">${escapeHtml(system.version || "dev")}</span>
      </header>

      <dl class="specs">
        <div><dt>Tamanho</dt><dd>${escapeHtml(size)}</dd></div>
        <div><dt>Buildroot</dt><dd>${escapeHtml(system.buildroot || "—")}</dd></div>
        <div><dt>SHA-256</dt><dd class="mono">${escapeHtml(shaShort)}</dd></div>
      </dl>

      ${
        appList
          ? `<details><summary>${apps.embedded?.length || 0} app(s) na imagem · ${apps.store?.length || 0} na loja</summary><ul class="apps">${appList}</ul></details>`
          : ""
      }

      <footer>
        ${button}
        <span class="muted mono">${escapeHtml(system.image || "")}</span>
      </footer>
    </article>`;
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

    const sourceImage = path.join(release.__dir, imageName);
    if (!isFile(sourceImage)) {
      warnings.push({
        message: `${deviceId}: imagem não encontrada em ${release.__dir}; o card sai sem link`,
      });
      release.__href = null;
      continue;
    }

    if (copyImages) {
      const targetDir = path.join(outDir, "downloads", deviceId);
      mkdirSync(targetDir, { recursive: true });
      copyFileSync(sourceImage, path.join(targetDir, imageName));
      release.__href = `downloads/${deviceId}/${imageName}`;

      const sums = path.join(release.__dir, "SHA256SUMS");
      if (isFile(sums)) {
        copyFileSync(sums, path.join(targetDir, "SHA256SUMS"));
      }
    } else {
      release.__href = `${release.__relative}/${imageName}`;
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
        apps: release.apps,
        generatedAt: release.generatedAt,
        href: release.__href,
      })),
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { ok: true, releases, errors, warnings, indexPath };
}
