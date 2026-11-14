// Escrita de um overlay dentro de uma imagem ext4, sem montar e sem root.
//
// ## Por que isto existe
//
// A decisão registrada é: os apps entram no rootfs **antes** do Buildroot gerar
// a imagem. Isso vale para o cartão — a raiz é assinada, e remontar a imagem
// depois desfaria a assinatura.
//
// O alvo virtual é outro caso, e a diferença é objetiva:
//
// - não há tabela de partição: o `rootfs.ext4` **é** o disco;
// - não há assinatura: o `qemu-aarch64` não gera imagem de cartão.
//
// Ainda assim isto é uma exceção, não o caminho normal — e é por isso que
// `injectApps` recusa:
//
// - imagem com tabela de partição (`.img`/`.iso`/`.sdcard` de cartão);
// - overlay cujo binário precise de biblioteca que a imagem não tem.
//
// A segunda recusa é a que importa. Medido em 13/11/2026: o launcher entrava na
// imagem e morria com
//
//   error while loading shared libraries: libSDL2-2.0.so.0
//
// O manifesto anunciava 6 apps e o console mostrava laço de queda. Descobrir
// isso no boot é tarde; descobrir na injeção custa uma linha.
import { spawnSync } from "node:child_process";
import { isFile, listDir, walk } from "./fs.mjs";
import path from "node:path";

/** Caminho padrão do índice, o mesmo que o launcher lê. */
const INDEX_PATH = "/opt/giochi/apps/index.json";

/** Bit de execução para arquivos que precisam dele. */
const MODE_EXEC = "0100755";
const MODE_FILE = "0100644";

function runDebugfs(imagePath, request, { write = false } = {}) {
  const args = [];
  if (write) args.push("-w");
  args.push("-R", request, imagePath);
  const result = spawnSync("debugfs", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return {
    ok: !result.error && result.status === 0,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error,
  };
}

export function debugfsWritable() {
  // `-w` abre para escrita. Num arquivo somente-leitura o debugfs recusa, então
  // este teste também serve de pré-voo do permissivo.
  const result = spawnSync("debugfs", ["-V"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

/** `true` se o caminho existe dentro do ext4. */
export function existsInImage(imagePath, target) {
  const result = runDebugfs(imagePath, `stat ${target}`);
  // Caminho inexistente sai com status 0 e "File not found" no stderr.
  return result.ok && !/file not found|not found by/i.test(result.stderr);
}

/** Conteúdo de um arquivo dentro do ext4, ou null. */
export function readFromImage(imagePath, target) {
  const result = runDebugfs(imagePath, `cat ${target}`);
  if (!result.ok) return null;
  if (/file not found|not found by/i.test(result.stderr)) return null;
  return result.stdout;
}

/** Bibliotecas que um ELF pede (`DT_NEEDED`). */
export function neededLibraries(binaryPath) {
  // `LC_ALL=C` porque o `readelf` desta máquina fala português
  // ("Biblioteca Compartilhada"). Um regex preso ao inglês devolveria lista
  // vazia EM SILÊNCIO — e a checagem de biblioteca ausente nunca dispararia,
  // que é exatamente a falha que ela existe para pegar.
  const result = spawnSync("readelf", ["-d", binaryPath], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  if (result.error) return null;
  const text = String(result.stdout || "");
  return [...text.matchAll(/\(NEEDED\)\s+[^[]*\[([^\]]+)\]/g)].map((match) => match[1].trim());
}

const LIB_DIRS = ["/lib", "/usr/lib", "/lib64", "/usr/lib64"];

/**
 * Procura uma biblioteca dentro do ext4 e devolve o caminho, ou null.
 *
 * Percorre os diretórios usuais e, neles, os subdiretórios de um nível — que é
 * onde o Buildroot põe (`/usr/lib`, não `/usr/lib/aarch64-...`).
 */
function findLibraryInImage(imagePath, soname) {
  for (const dir of LIB_DIRS) {
    if (existsInImage(imagePath, `${dir}/${soname}`)) return `${dir}/${soname}`;
    const listing = runDebugfs(imagePath, `ls ${dir}`).stdout;
    for (const entry of listing.split(/\s+/)) {
      if (!entry || entry === "." || entry === "..") continue;
      if (!/^[a-z0-9._-]+$/i.test(entry)) continue;
      const nested = `${dir}/${entry}`;
      const nestedListing = runDebugfs(imagePath, `ls ${nested}`).stdout;
      if (nestedListing.includes(soname)) return `${nested}/${soname}`;
    }
  }
  return null;
}

/**
 * Confere se a imagem tem tudo que os binários do overlay precisam.
 * Devolve a lista de bibliotecas ausentes (vazia = pode injetar).
 */
export function missingLibraries({ imagePath, overlayDir }) {
  const missing = new Set();
  const seen = new Set();

  for (const relative of walk(overlayDir)) {
    const full = path.join(overlayDir, relative);
    if (!isFile(full)) continue;
    const needed = neededLibraries(full);
    if (!needed) continue;
    for (const soname of needed) {
      if (seen.has(soname)) continue;
      seen.add(soname);
      if (!findLibraryInImage(imagePath, soname)) missing.add(soname);
    }
  }
  return [...missing];
}

/** Cria os diretórios de um caminho de arquivo, do mais alto para o mais baixo. */
function ensureDirectory(imagePath, targetDir) {
  const parts = targetDir.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    // `mkdir` num diretório existente devolve erro; não é falha.
    runDebugfs(imagePath, `mkdir ${current}`, { write: true });
  }
}

function isExecutable(hostPath) {
  const result = spawnSync("file", ["-b", hostPath], { encoding: "utf8" });
  const text = String(result.stdout || "");
  return /executable|ELF|shell script|Python script/.test(text);
}

/**
 * Escreve `overlayDir` dentro de `imagePath`.
 *
 * Devolve `{ ok, written, errors, missing }`. Não lança: quem chama decide o
 * que fazer com o erro, e aqui o erro tem de virar mensagem no CLI.
 */
export function injectOverlay({ imagePath, overlayDir }) {
  const errors = [];

  if (!isFile(imagePath)) {
    return { ok: false, written: 0, errors: [{ code: "imagem_ausente", message: imagePath }], missing: [] };
  }
  if (!debugfsWritable()) {
    return {
      ok: false,
      written: 0,
      errors: [{ code: "debugfs_ausente", message: "debugfs não disponível; injeção exige e2fsprogs" }],
      missing: [],
    };
  }

  // Só um ext4 cru: com tabela de partição, o primeiro setor é MBR e o debugfs
  // recusaria — mas a recusa dele é obscura, e a nossa explica.
  const probe = runDebugfs(imagePath, "ls /");
  if (!probe.ok || /bad magic|not a valid/i.test(probe.stderr)) {
    return {
      ok: false,
      written: 0,
      errors: [
        {
          code: "nao_ext4",
          message:
            `${imagePath} não abre como ext4 cru — imagem de cartão tem tabela de ` +
            "partição; injeção só vale para o disco virtual",
        },
      ],
      missing: [],
    };
  }

  const missing = missingLibraries({ imagePath, overlayDir });
  if (missing.length > 0) {
    return {
      ok: false,
      written: 0,
      missing,
      errors: [
        {
          code: "biblioteca_ausente",
          message:
            `a imagem não tem ${missing.join(", ")} — os binários do overlay não abririam. ` +
            "Ligue o pacote no fragmento do device e reconstrua, em vez de publicar app que não roda",
        },
      ],
    };
  }

  let written = 0;
  for (const relative of walk(overlayDir)) {
    const source = path.join(overlayDir, relative);
    if (!isFile(source)) continue;

    const target = `/${relative.split(path.sep).join("/")}`;
    ensureDirectory(imagePath, path.posix.dirname(target));

    const put = runDebugfs(imagePath, `write ${source} ${target}`, { write: true });
    if (!put.ok) {
      errors.push({ code: "escrita_falhou", message: `${target}: ${put.stderr.trim() || put.error}` });
      continue;
    }

    const mode = isExecutable(source) ? MODE_EXEC : MODE_FILE;
    const chmod = runDebugfs(imagePath, `sif ${target} mode ${mode}`, { write: true });
    if (!chmod.ok) {
      errors.push({ code: "modo_falhou", message: `${target}: modo não aplicado` });
    }
    written += 1;
  }

  return { ok: errors.length === 0, written, errors, missing: [] };
}

/** Confere que o índice ficou legível dentro da imagem. */
export function verifyIndex(imagePath) {
  const text = readFromImage(imagePath, INDEX_PATH);
  if (!text) return { ok: false, reason: `${INDEX_PATH} não está na imagem` };
  try {
    const index = JSON.parse(text);
    return { ok: true, apps: Array.isArray(index.apps) ? index.apps : [] };
  } catch (error) {
    return { ok: false, reason: `${INDEX_PATH} inválido: ${error.message}` };
  }
}

export { INDEX_PATH };
