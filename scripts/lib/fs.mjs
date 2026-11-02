// Utilidades de arquivo e hash. Sem dependência externa: só `node:fs` e
// `node:crypto`.
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";

export function readJson(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} não encontrado: ${filePath}`);
  }
  const text = readFileSync(filePath, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} não é JSON válido: ${error.message}`);
  }
}

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function isFile(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile();
}

export function isDir(dirPath) {
  return existsSync(dirPath) && statSync(dirPath).isDirectory();
}

/** Lista recursiva de arquivos, relativa à raiz informada. */
export function walk(dirPath, base = dirPath) {
  const out = [];
  if (!isDir(dirPath)) return out;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, base));
    } else if (entry.isFile()) {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out.sort();
}

export function listDir(dirPath) {
  if (!isDir(dirPath)) return [];
  return readdirSync(dirPath).sort();
}

export function sizeOf(filePath) {
  return statSync(filePath).size;
}

export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
