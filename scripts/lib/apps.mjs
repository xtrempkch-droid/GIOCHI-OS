// Leitura do catálogo do Giochi app.
//
// Este repositório não importa código do Giochi app: recebe o **caminho** da
// pasta `app/` como argumento. Os dois repositórios continuam independentes, e
// a única coisa compartilhada é o contrato em JSON.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { isDir, isFile, listDir, readJson, sha256File } from "./fs.mjs";

const CAPA_SIZE = 320;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Dimensões de um PNG, ou null se não for PNG. */
export function pngSize(filePath) {
  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    return null;
  }
  if (buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function hasContent(dirPath) {
  if (!isDir(dirPath)) return false;
  return listDir(dirPath).some((name) => name !== ".gitkeep");
}

/**
 * Carrega e classifica os apps.
 *
 * `image`  — entra na imagem assinada; precisa estar completo.
 * `store`  — vai ao lado, instalado em /user; precisa só do metadata.
 * `host`   — roda no PC; ignorado aqui.
 * scaffold — ainda não migrado; pulado com aviso, não reprova.
 */
export async function loadApps(appsRoot) {
  const errors = [];
  const warnings = [];
  const embedded = [];
  const external = [];
  const skipped = [];

  const indexPath = path.join(appsRoot, "apps.json");
  if (!isFile(indexPath)) {
    return {
      ok: false,
      embedded,
      external,
      skipped,
      errors: [{ code: "indice_ausente", message: `apps.json não encontrado em ${appsRoot}` }],
      warnings,
    };
  }

  let index;
  try {
    index = readJson(indexPath, "apps.json");
  } catch (error) {
    return {
      ok: false,
      embedded,
      external,
      skipped,
      errors: [{ code: "indice_invalido", message: error.message }],
      warnings,
    };
  }

  const entries = Array.isArray(index.apps) ? index.apps : [];
  if (entries.length === 0) {
    warnings.push({ code: "catalogo_vazio", message: "apps.json não declara nenhum app" });
  }

  for (const entry of entries) {
    const id = String(entry.id || "");
    const folder = String(entry.folder || id);
    const appDir = path.join(appsRoot, folder);
    const distribution = entry.distribution || "image";
    const status = entry.status || "ready";

    if (distribution === "host") {
      skipped.push({ id, reason: "host: roda no PC, não entra na imagem" });
      continue;
    }

    if (!isDir(appDir)) {
      errors.push({
        code: "pasta_ausente",
        message: `${id}: pasta não existe (${appDir})`,
      });
      continue;
    }

    const metadataPath = path.join(appDir, "metadata.json");
    let metadata = null;
    if (isFile(metadataPath)) {
      try {
        metadata = readJson(metadataPath, `${id}/metadata.json`);
      } catch (error) {
        errors.push({ code: "metadata_invalido", message: `${id}: ${error.message}` });
        continue;
      }
    } else {
      errors.push({ code: "metadata_ausente", message: `${id}: metadata.json é obrigatório` });
      continue;
    }

    // Regra de licença: defesa em profundidade. O validador do Giochi app já
    // recusa, mas o empacotamento não pode depender de o outro repositório ter
    // rodado o validador.
    const license = String(metadata.license || "");
    if (distribution === "image" && /^(A?GPL|LGPL)/i.test(license)) {
      errors.push({
        code: "licenca_gpl_na_imagem",
        message:
          `${id}: "${license}" não pode entrar na imagem assinada (GPL §6 + raiz assinada). ` +
          `Mude distribution para "store".`,
      });
      continue;
    }

    if (distribution === "store") {
      external.push({
        id,
        version: String(metadata.version || ""),
        license,
        folder,
        dir: appDir,
      });
      continue;
    }

    // Daqui para baixo: distribution === "image".
    if (status === "scaffold") {
      skipped.push({ id, reason: "scaffold: fonte não migrada ou binário não exportado" });
      continue;
    }

    const binDir = path.join(appDir, "bin");
    if (!hasContent(binDir)) {
      errors.push({
        code: "bin_vazio",
        message: `${id}: app marcado como pronto para a imagem, mas bin/ está vazio`,
      });
      continue;
    }

    const entrypoint = String(metadata.entrypoint || "");
    const entryPath = path.resolve(appDir, entrypoint);
    if (!entrypoint.startsWith("bin/") || !isFile(entryPath)) {
      errors.push({
        code: "entrypoint_ausente",
        message: `${id}: entrypoint "${entrypoint}" não existe dentro de bin/`,
      });
      continue;
    }

    const capa = path.join(appDir, "capa.png");
    if (!isFile(capa)) {
      errors.push({ code: "capa_ausente", message: `${id}: capa.png é obrigatória na imagem` });
      continue;
    }
    const size = pngSize(capa);
    if (!size) {
      errors.push({ code: "capa_invalida", message: `${id}: capa.png não é PNG válido` });
      continue;
    }
    if (size.width !== CAPA_SIZE || size.height !== CAPA_SIZE) {
      errors.push({
        code: "capa_dimensao",
        message: `${id}: capa.png precisa ser ${CAPA_SIZE}x${CAPA_SIZE}, tem ${size.width}x${size.height}`,
      });
      continue;
    }

    const files = [];
    const walkDir = (dir, base) => {
      for (const name of listDir(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          walkDir(full, base);
        } else if (isFile(full)) {
          files.push(path.relative(appDir, full).split(path.sep).join("/"));
        }
      }
    };
    walkDir(binDir, appDir);

    const hashes = {};
    for (const relative of files.sort()) {
      hashes[relative] = await sha256File(path.join(appDir, relative));
    }

    embedded.push({
      id,
      version: String(metadata.version || ""),
      license,
      folder,
      dir: appDir,
      entrypoint,
      files,
      hashes,
    });
  }

  if (embedded.length === 0 && external.length === 0 && errors.length === 0) {
    warnings.push({
      code: "nada_para_empacotar",
      message: "nenhum app pronto para a imagem e nenhum app de loja",
    });
  }

  return {
    ok: errors.length === 0,
    embedded,
    external,
    skipped,
    errors,
    warnings,
  };
}
