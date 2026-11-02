// Leitura e verificação da saída de build do Giochi System.
//
// O Giochi os não compila nada: recebe a pasta `out/<device>/` produzida pelo
// Giochi System e confere se o que está lá é confiável antes de empacotar.
//
// A verificação importa porque o `SHA256SUMS` é gerado no fim do build, e um
// arquivo truncado (disco cheio, kill no meio) produz imagem que falha no
// cartão sem mensagem útil.
import { readFileSync } from "node:fs";
import path from "node:path";

import { isDir, isFile, listDir, readJson, sha256File, sizeOf } from "./fs.mjs";

/** Arquivos que o build do sistema precisa ter deixado. */
const REQUIRED_METADATA = ["device.json", "build-info.txt", "SHA256SUMS"];

/** Imagem de cartão, crua ou comprimida. */
const IMAGE_PATTERN = /\.(img|iso|sdcard)(\.(xz|gz|zst))?$/i;

/** Extensão completa da imagem, preservando `.gz`/`.xz`/`.zst`. */
export function imageExtension(name) {
  const match = name.match(/(\.(?:img|iso|sdcard)(?:\.(?:xz|gz|zst))?)$/i);
  return match ? match[1] : ".img";
}

/**
 * Lê um `SHA256SUMS` no formato `<hash>  <nome>`, usado por `sha256sum -c`.
 * Devolve Map<nome, hash>.
 */
export function parseChecksums(text) {
  const map = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (!match) continue;
    map.set(match[2].trim(), match[1].toLowerCase());
  }
  return map;
}

/**
 * Inspeciona a pasta de saída do sistema.
 * Devolve { ok, device, images, checksums, errors, warnings }.
 */
export async function inspectSystemBuild(systemDir) {
  const errors = [];
  const warnings = [];

  if (!isDir(systemDir)) {
    return {
      ok: false,
      device: null,
      images: [],
      checksums: new Map(),
      errors: [
        { code: "pasta_ausente", message: `saída do sistema não encontrada: ${systemDir}` },
      ],
      warnings,
    };
  }

  for (const required of REQUIRED_METADATA) {
    if (!isFile(path.join(systemDir, required))) {
      errors.push({
        code: "arquivo_ausente",
        message: `faltou ${required} em ${systemDir}`,
      });
    }
  }

  let device = null;
  const devicePath = path.join(systemDir, "device.json");
  if (isFile(devicePath)) {
    try {
      device = readJson(devicePath, "device.json");
    } catch (error) {
      errors.push({ code: "device_json_invalido", message: error.message });
    }
  }

  let checksums = new Map();
  if (isFile(path.join(systemDir, "SHA256SUMS"))) {
    checksums = parseChecksums(readFileSync(path.join(systemDir, "SHA256SUMS"), "utf8"));
    if (checksums.size === 0) {
      errors.push({
        code: "checksums_vazios",
        message: "SHA256SUMS existe mas não tem nenhuma linha válida",
      });
    }
  }

  // Confere cada arquivo listado. Hash divergente é falha dura: significa que a
  // imagem não é a que o build registrou.
  for (const [name, expected] of checksums) {
    const filePath = path.join(systemDir, name);
    if (!isFile(filePath)) {
      errors.push({
        code: "arquivo_listado_ausente",
        message: `SHA256SUMS cita ${name}, mas o arquivo não existe`,
      });
      continue;
    }
    const actual = await sha256File(filePath);
    if (actual !== expected) {
      errors.push({
        code: "hash_divergente",
        message: `${name}: hash não confere (esperado ${expected.slice(0, 12)}…, obtido ${actual.slice(0, 12)}…)`,
      });
    }
  }

  // Imagens candidatas a cartão.
  //
  // Aceita comprimida (`.img.xz`, `.img.gz`, `.img.zst`). Não é detalhe: a imagem
  // crua tem ~920 MB quase toda de zeros, e a convenção de publicação é entregar
  // o comprimido (~40–90 MB). Filtrar só `.img` faria o empacotamento ignorar o
  // arquivo que existe de verdade.
  const images = [];
  for (const entry of listDir(systemDir)) {
    if (!IMAGE_PATTERN.test(entry)) continue;
    const full = path.join(systemDir, entry);
    if (!isFile(full)) continue;
    images.push({
      name: entry,
      sizeBytes: sizeOf(full),
      path: full,
      compressed: /\.(xz|gz|zst)$/i.test(entry),
    });
  }

  if (images.length === 0) {
    warnings.push({
      code: "sem_imagem",
      message: "nenhum .img/.iso encontrado; o build pode ter parado antes do genimage",
    });
  }

  return {
    ok: errors.length === 0,
    device,
    images,
    checksums,
    errors,
    warnings,
  };
}
