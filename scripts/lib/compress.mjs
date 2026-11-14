// Compressão dos artefatos publicados.
//
// A imagem crua de um rootfs tem centenas de MB quase todos de zero; o `.xz`
// costuma cair para menos de um décimo. Quem baixa agradece, e o release fica
// pequeno o bastante para caber num anexo de release do GitHub.
//
// `xz`/`zstd` são processos externos. Quando não existem, a resposta é `gzip`
// pelo `node:zlib`: um formato pior, mas honesto e sempre disponível — melhor
// que publicar 500 MB porque faltou um binário na máquina de quem empacotou.
import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream, openSync, closeSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";

/** Formatos aceitos, do melhor para o pior. */
export const COMPRESSION_FORMATS = ["xz", "zst", "gz"];

/** Extensão do arquivo comprimido (`.xz`, `.gz`…), e "" para nenhum. */
export function extensionFor(format) {
  return format ? `.${format}` : "";
}

function hasBinary(name) {
  const result = spawnSync(name, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

/** Roda `xz`/`zstd` escrevendo direto no arquivo de destino, sem passar pela RAM. */
function runCompressor(binary, args, sourcePath, targetPath, cwd) {
  const out = openSync(targetPath, "w");
  try {
    const result = spawnSync(binary, [...args, sourcePath], {
      stdio: ["ignore", out, "inherit"],
      cwd,
    });
    if (result.error || result.status !== 0) {
      return { ok: false, reason: result.error?.message || `exit ${result.status}` };
    }
    return { ok: true };
  } finally {
    closeSync(out);
  }
}

async function gzipFile(sourcePath, targetPath) {
  await pipeline(
    createReadStream(sourcePath),
    zlib.createGzip({ level: 9 }),
    createWriteStream(targetPath),
  );
}

/**
 * Comprime `sourcePath` e devolve o caminho **real** do arquivo gerado.
 *
 * `targetBase` é o nome sem extensão de compressão. O chamador usa o `path`
 * devolvido em vez de adivinhar: quando o `xz` não existe e a resposta cai para
 * `gz`, um caminho montado a priori apontaria para um arquivo que não existe —
 * e o `SHA256SUMS` publicado descreveria o arquivo errado.
 *
 * `preferred` pode ser `"xz"`, `"zst"` ou `"gz"`.
 */
export async function compressFile({ sourcePath, targetBase, preferred = "xz" }) {
  const format = COMPRESSION_FORMATS.includes(preferred) ? preferred : "xz";

  if (format === "xz" && hasBinary("xz")) {
    const targetPath = `${targetBase}.xz`;
    const result = runCompressor("xz", ["-T0", "-9", "-c"], sourcePath, targetPath, "/");
    if (result.ok) return { ok: true, format: "xz", path: targetPath };
    return { ok: false, format: "xz", reason: result.reason };
  }

  if (format === "zst" && hasBinary("zstd")) {
    const targetPath = `${targetBase}.zst`;
    const result = runCompressor("zstd", ["-T0", "-19", "-c"], sourcePath, targetPath, "/");
    if (result.ok) return { ok: true, format: "zst", path: targetPath };
    return { ok: false, format: "zst", reason: result.reason };
  }

  const targetPath = `${targetBase}.gz`;
  await gzipFile(sourcePath, targetPath);
  return { ok: true, format: "gz", path: targetPath };
}
