// Lógica das duas fases, sem `process.exit` e sem console.
//
// Separado do CLI para poder ser testado por import. Sob o sandbox, spawnar o
// CLI falha com EPERM — e testar a função pura é melhor de qualquer forma.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadApps } from "./apps.mjs";
import { humanSize, isFile, sha256File, sizeOf, walk } from "./fs.mjs";
import { imageExtension, inspectSystemBuild } from "./system.mjs";

export const GENERATOR_VERSION = "0.1.0";

function copyTree(sourceDir, targetDir) {
  for (const relative of walk(sourceDir)) {
    const source = path.join(sourceDir, relative);
    const target = path.join(targetDir, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}

/**
 * Fase 1 — transforma apps de distribuição "image" num overlay de rootfs.
 *
 * Roda **antes** do build do sistema: o Giochi System consome este overlay ao
 * gerar a imagem. Apps de loja e em scaffold ficam de fora.
 */
export async function runAppsPhase({ appsRoot, outDir }) {
  const apps = await loadApps(appsRoot);
  if (!apps.ok) {
    return { ok: false, apps, overlayDir: null, embedded: [], errors: apps.errors };
  }

  const overlayDir = path.join(outDir, "rootfs-overlay");
  const appsDir = path.join(overlayDir, "opt", "giochi", "apps");
  const index = [];

  for (const app of apps.embedded) {
    const target = path.join(appsDir, app.id);
    copyTree(path.join(app.dir, "bin"), path.join(target, "bin"));
    copyFileSync(path.join(app.dir, "metadata.json"), path.join(target, "metadata.json"));

    const capa = path.join(app.dir, "capa.png");
    if (isFile(capa)) {
      copyFileSync(capa, path.join(target, "capa.png"));
    }

    index.push({
      id: app.id,
      version: app.version,
      entrypoint: app.entrypoint,
      dir: `/opt/giochi/apps/${app.id}`,
    });
  }

  writeFileSync(
    path.join(appsDir, "index.json"),
    `${JSON.stringify({ schemaVersion: 1, apps: index }, null, 2)}\n`,
    "utf8",
  );

  return {
    ok: true,
    apps,
    overlayDir,
    embedded: index,
    external: apps.external,
    skipped: apps.skipped,
    warnings: apps.warnings,
    errors: [],
  };
}

/**
 * Fase 2 — empacota a saída do sistema numa release publicável.
 *
 * Roda **depois** do build. Confere checksums, copia a imagem com nome
 * canônico e escreve `release.json`, `SHA256SUMS` e `README.txt`.
 */
export async function runPackagePhase({ systemDir, appsRoot, outDir, version }) {
  const errors = [];
  const warnings = [];

  const system = await inspectSystemBuild(systemDir);
  errors.push(...system.errors);
  warnings.push(...system.warnings);

  if (!system.ok) {
    return { ok: false, errors, warnings, release: null };
  }

  if (system.images.length === 0) {
    errors.push({
      code: "sem_imagem",
      message: "nenhuma imagem para publicar (o build parou antes do genimage?)",
    });
    return { ok: false, errors, warnings, release: null };
  }

  // Preferir a comprimida. O `.img` cru tem ~920 MB quase todo zero; o que se
  // publica é o comprimido (~40–90 MB). Escolher "a maior" pegaria o cru.
  const compressed = system.images.filter((entry) => entry.compressed);
  const candidates = compressed.length > 0 ? compressed : system.images;
  const image = candidates.reduce((a, b) => (b.sizeBytes > a.sizeBytes ? b : a));

  if (system.images.length > 1) {
    warnings.push({
      code: "multiplas_imagens",
      message:
        `${system.images.length} imagens encontradas; usando ${image.name}` +
        (compressed.length > 0 ? " (comprimida tem preferência)" : ""),
    });
  }

  if (!image.compressed) {
    warnings.push({
      code: "imagem_crua",
      message:
        `${image.name} não está comprimida — o artefato publicado fica com ~${Math.round(image.sizeBytes / 1024 / 1024)} MB. ` +
        "Comprimir (.xz/.gz/.zst) reduz para dezenas de MB.",
    });
  }

  let apps = { embedded: [], external: [], skipped: [], errors: [], warnings: [], ok: true };
  if (appsRoot) {
    apps = await loadApps(appsRoot);
    errors.push(...apps.errors);
    warnings.push(...apps.warnings);
    if (!apps.ok) {
      return { ok: false, errors, warnings, release: null };
    }
  }

  const device = system.device || {};
  const deviceId = String(device.id || path.basename(systemDir));
  const releaseVersion = String(version || readBuildrootVersion(systemDir) || "dev");

  mkdirSync(outDir, { recursive: true });

  const imageName = `giochi-${deviceId}-${releaseVersion}${imageExtension(image.name)}`;
  const imageTarget = path.join(outDir, imageName);
  copyFileSync(image.path, imageTarget);

  const imageHash = await sha256File(imageTarget);
  const imageSize = sizeOf(imageTarget);

  const release = {
    schemaVersion: 1,
    product: "Giochi OS",
    device: {
      id: deviceId,
      name: String(device.name || deviceId),
      arch: String(device.arch || "unknown"),
    },
    system: {
      version: releaseVersion,
      buildroot: String(device.buildroot || readBuildrootVersion(systemDir) || ""),
      image: imageName,
      imageSha256: imageHash,
      sizeBytes: imageSize,
      sizeHuman: humanSize(imageSize),
    },
    apps: {
      embedded: apps.embedded.map((app) => ({
        id: app.id,
        version: app.version,
        license: app.license,
      })),
      store: apps.external.map((app) => ({
        id: app.id,
        version: app.version,
        license: app.license,
        embedded: false,
      })),
    },
    notes: [
      "Grave com dd conv=fsync e verifique o checksum antes de usar.",
      "Apps de loja não estão na imagem; instale por /user.",
    ],
    generatedAt: new Date().toISOString(),
    generator: `giochi-os assemble ${GENERATOR_VERSION}`,
  };

  writeFileSync(path.join(outDir, "release.json"), `${JSON.stringify(release, null, 2)}\n`, "utf8");
  writeFileSync(path.join(outDir, "SHA256SUMS"), `${imageHash}  ${imageName}\n`, "utf8");
  writeFileSync(path.join(outDir, "README.txt"), readmeFor(release), "utf8");

  return { ok: true, release, errors, warnings, image: imageTarget };
}

function readBuildrootVersion(systemDir) {
  try {
    const text = readFileSync(path.join(systemDir, "build-info.txt"), "utf8");
    const match = text.match(/^buildroot=(.+)$/m);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

function readmeFor(release) {
  return [
    `Giochi OS — ${release.device.name}`,
    `device: ${release.device.id} (${release.device.arch})`,
    `buildroot: ${release.system.buildroot || "?"}`,
    `imagem: ${release.system.image}`,
    `tamanho: ${release.system.sizeHuman}`,
    `sha256: ${release.system.imageSha256}`,
    "",
    "Antes de gravar, confira o checksum:",
    "  sha256sum -c SHA256SUMS",
    "",
    "Gravar no cartão (substitua /dev/sdX pelo dispositivo certo):",
    `  sudo dd if=${release.system.image} of=/dev/sdX bs=4M conv=fsync status=progress`,
    "",
    "O cartão será apagado por completo. Confira o nome do dispositivo duas vezes.",
    "",
    `Apps embutidos: ${release.apps.embedded.length}`,
    ...release.apps.embedded.map((app) => `  - ${app.id} ${app.version} (${app.license})`),
    "",
    `Apps de loja (fora da imagem): ${release.apps.store.length}`,
    ...release.apps.store.map((app) => `  - ${app.id} ${app.version} (${app.license})`),
    "",
  ].join("\n");
}
