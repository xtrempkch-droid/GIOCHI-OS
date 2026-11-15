// Escrita de um overlay dentro de um rootfs ext4, sem montar e sem root.
//
// ## Por que isto existe
//
// A decisão registrada é: os apps entram no rootfs **antes** do Buildroot gerar
// a imagem. Esse é o caminho normal, e é o que roda quando o Giochi os monta o
// overlay e o build o consome.
//
// O CI não tem esse caminho: o GIOCHI-SYSTEM constrói a imagem sem ver o
// catálogo do Giochi app, e o artefato chega pronto. Aqui é a ponte.
//
// ## Dois formatos de entrada
//
//   ext4 cru      `rootfs.ext4` do alvo virtual. É o próprio disco, sem tabela
//                 de partição: `debugfs -w` escreve direto nele.
//   imagem de cartão  `.img` com MBR/GPT. O ext4 está atrás da tabela e o
//                 `debugfs` não aceita deslocamento — então a partição é
//                 extraída, alterada, conferida com `e2fsck` e devolvida ao
//                 offset de origem.
//
// ## O que a injeção SEMPRE recusa
//
// Overlay cujo binário precise de uma biblioteca que a imagem não tem. Medido
// em 13/11/2026: o launcher entrava na imagem e morria com
//
//   error while loading shared libraries: libSDL2-2.0.so.0
//
// O manifesto anunciava 6 apps e o console mostrava laço de queda. Descobrir
// isso no boot é tarde; descobrir na injeção custa uma linha.
//
// Também recusa quando o espaço livre do rootfs não cobre o overlay — encher um
// ext4 no meio da escrita produz um arquivo truncado, e o app passa a falhar de
// um jeito que não parece falta de espaço.
import { spawnSync } from "node:child_process";
import { mkdtempSync, openSync, readSync, closeSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { isFile, sizeOf, walk } from "./fs.mjs";
import { readRootfsApps } from "./rootfs.mjs";

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

/**
 * Tamanho, em bytes, de um arquivo dentro do ext4. `null` se não deu para ler.
 *
 * O primeiro `Size:` do `stat` é o do inode; o `Size:` do `Fragment:` vem depois
 * e é sempre 0 — por isso a busca é pela PRIMEIRA ocorrência, não por qualquer.
 */
export function sizeInImage(imagePath, target) {
  const result = runDebugfs(imagePath, `stat ${target}`);
  if (!result.ok) return null;
  if (/file not found|not found by/i.test(result.stderr)) return null;
  const match = /Size:\s*(\d+)/.exec(result.stdout);
  return match ? Number(match[1]) : null;
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
  // Só ELF: o overlay agora leva `assets/` junto do binário (`.png`, `.bmp`,
  // `.obj`), e spawnar `readelf` para cada textura seria dezenas de processos
  // para ouvir sempre a mesma resposta.
  const magic = Buffer.alloc(4);
  const fd = openSync(binaryPath, "r");
  try {
    readSync(fd, magic, 0, 4, 0);
  } finally {
    closeSync(fd);
  }
  if (magic.toString("latin1") !== "\x7fELF") return null;

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
    // `mkdir` num diretório existente NÃO é inofensivo: o debugfs aloca um
    // inode, imprime "Ext2 directory already exists" e o inode fica órfão —
    // medido com `e2fsck -fn`, que passou a acusar "Pasta de inode N não
    // ligada". Uma injeção repetia `mkdir` de `/opt/giochi/apps` para cada
    // arquivo do overlay e publicava um ext4 já sujo. Só cria o que falta.
    if (existsInImage(imagePath, current)) continue;
    runDebugfs(imagePath, `mkdir ${current}`, { write: true });
  }
}

/**
 * Espaço livre do ext4, em bytes. `null` quando não deu para ler.
 *
 * O `debugfs` imprime `Block size:` e `Free blocks:` no `stats`. Ler os dois é a
 * única forma de saber, sem montar, se o overlay cabe — e encher um ext4 no meio
 * da escrita produz arquivo truncado, não erro.
 */
export function freeSpaceBytes(ext4Path) {
  const stats = runDebugfs(ext4Path, "stats").stdout;
  const bloco = Number(/Block size:\s+(\d+)/.exec(stats)?.[1]);
  const livres = Number(/Free blocks:\s+(\d+)/.exec(stats)?.[1]);
  if (!Number.isFinite(bloco) || !Number.isFinite(livres)) return null;
  return bloco * livres;
}

/** Tamanho total dos arquivos regulares de um overlay. */
function overlayBytes(overlayDir) {
  let total = 0;
  for (const relative of walk(overlayDir)) {
    const full = path.join(overlayDir, relative);
    if (isFile(full)) total += sizeOf(full);
  }
  return total;
}

/** A maior partição Linux da tabela — onde o rootfs mora. */
function linuxPartition(table) {
  if (!table) return null;
  // Tipos Linux: 83 (MBR/ext4) e o GUID de "Linux filesystem" no GPT.
  const isLinux = (part) =>
    part.type === "83" || /^0fc63daf-8483-4772-8e79-3d69d8477de4$/i.test(part.type);
  const linux = table.partitions.filter(isLinux);
  const candidatos = linux.length > 0 ? linux : table.partitions;
  if (candidatos.length === 0) return null;
  return candidatos.reduce((a, b) => (b.size > a.size ? b : a));
}

/** Extrai uma partição para um arquivo. */
function extractPartition(imagePath, table, part, targetPath) {
  const copy = spawnSync(
    "dd",
    [
      `if=${imagePath}`,
      `of=${targetPath}`,
      `bs=${table.sectorSize}`,
      `skip=${part.start}`,
      `count=${part.size}`,
      "status=none",
    ],
    { encoding: "utf8" },
  );
  if (copy.error || copy.status !== 0) {
    return {
      ok: false,
      reason: `extração da partição falhou: ${(copy.stderr || copy.error || "").toString().trim()}`,
    };
  }
  return { ok: true };
}

/**
 * Devolve a partição alterada ao lugar dela.
 *
 * `conv=notrunc` é obrigatório: sem ele o `dd` TRUNCA a imagem no ponto em que a
 * escrita termina, e o que vem depois da partição (a segunda partição, a tabela
 * de backup do GPT) some. O `conv=fsync` garante que a escrita chegou ao disco
 * antes de qualquer verificação.
 */
function writeBackPartition(imagePath, table, part, sourcePath) {
  const copy = spawnSync(
    "dd",
    [
      `if=${sourcePath}`,
      `of=${imagePath}`,
      `bs=${table.sectorSize}`,
      `seek=${part.start}`,
      "count=" + String(part.size),
      "conv=notrunc,fsync",
      "status=none",
    ],
    { encoding: "utf8" },
  );
  if (copy.error || copy.status !== 0) {
    return {
      ok: false,
      reason: `devolução da partição falhou: ${(copy.stderr || copy.error || "").toString().trim()}`,
    };
  }
  return { ok: true };
}

/** `e2fsck` existe nesta máquina? */
function fsckAvailable() {
  const result = spawnSync("e2fsck", ["-V"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

/**
 * Confere (e conserta, se preciso) o ext4 alterado.
 *
 * `-fy` porque o sistema de arquivos foi escrito por fora do kernel: o contador
 * de montagens limpo é o que faz um `fsck` de boot não reclamar. Saída 0 é "nada
 * a fazer", 1 é "erros encontrados e corrigidos" — os dois servem. Acima disso é
 * corrupção, e publicar assim daria um cartão que não monta.
 */
function checkFilesystem(ext4Path) {
  const result = spawnSync("e2fsck", ["-fy", ext4Path], { encoding: "utf8" });
  const status = result.status ?? 255;
  if (result.error) return { ok: false, reason: result.error.message };
  if (status === 0 || status === 1) return { ok: true, corrected: status === 1 };
  return {
    ok: false,
    reason: `e2fsck saiu com ${status}: ${String(result.stdout || "").trim().split("\n").pop()}`,
  };
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
            `${imagePath} não abre como ext4 cru. Se for imagem de cartão, ela tem ` +
            "tabela de partição e precisa do caminho por partição (injectIntoCardImage)",
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

  // Espaço: encher o ext4 no meio da escrita trunca arquivo sem erro, e o app
  // passa a falhar de um jeito que não parece falta de espaço. 10% de folga
  // porque inode e bitmap também ocupam, e o overlay não é a última coisa que
  // vai entrar na imagem.
  const livre = freeSpaceBytes(imagePath);
  const necessario = overlayBytes(overlayDir);
  if (livre !== null && necessario > 0 && necessario * 1.1 > livre) {
    return {
      ok: false,
      written: 0,
      missing: [],
      errors: [
        {
          code: "sem_espaco",
          message:
            `o rootfs tem ${Math.round(livre / 1024)} KiB livres e o overlay pede ` +
            `${Math.round(necessario / 1024)} KiB (com 10% de folga). ` +
            "Aumente BR2_TARGET_ROOTFS_EXT2_SIZE no fragmento do device",
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

    // `debugfs write` RECUSA sobrescrever, e recusa do jeito pior: imprime
    // "write: Ext2 file already exists" no stderr e SAI COM 0. O `runDebugfs`
    // só olhava o status, então a escrita era dada como feita e o arquivo
    // antigo ficava — medido no `index.json`, que continuou anunciando o
    // catálogo velho enquanto o manifesto dizia "apps injetados".
    //
    // Apagar antes elimina o caso. `rm` num caminho ausente é o normal aqui
    // (imagem vinda do CI não tem a pasta de apps), e o erro dele é ignorado.
    runDebugfs(imagePath, `rm ${target}`, { write: true });

    const put = runDebugfs(imagePath, `write ${source} ${target}`, { write: true });
    if (!put.ok || /file already exists|no space|read-only|permission denied/i.test(put.stderr)) {
      errors.push({ code: "escrita_falhou", message: `${target}: ${put.stderr.trim() || put.error}` });
      continue;
    }

    // Prova que o que entrou é o que saiu, em vez de confiar no status do
    // `debugfs`. Disco cheio no meio do `write` trunca sem erro.
    const esperado = statSync(source).size;
    if (sizeInImage(imagePath, target) !== esperado) {
      errors.push({
        code: "escrita_truncada",
        message: `${target}: entrou com tamanho diferente de ${esperado} bytes`,
      });
      continue;
    }

    const mode = isExecutable(source) ? MODE_EXEC : MODE_FILE;
    const chmod = runDebugfs(imagePath, `sif ${target} mode ${mode}`, { write: true });
    if (!chmod.ok) {
      errors.push({ code: "modo_falhou", message: `${target}: modo não aplicado` });
    }
    written += 1;
  }

  if (errors.length > 0) return { ok: false, written, errors, missing: [] };

  // O `debugfs` é um editor de ext4 fora do kernel: uma sequência de escritas
  // pode deixar bitmap ou contador de inode pendente. O caminho do cartão já
  // roda `e2fsck -fy` de propósito (prova que a imagem alterada monta); o
  // caminho cru não rodava, e publicava um ext4 que `e2fsck -fn` reprova.
  // Estrutura de arquivo que o kernel não monta é release quebrada, mesmo com
  // todos os bytes no lugar.
  if (written > 0 && fsckAvailable()) {
    const fs = checkFilesystem(imagePath);
    if (!fs.ok) {
      return {
        ok: false,
        written,
        missing: [],
        errors: [{ code: "rootfs_corrompido", message: `${imagePath}: ${fs.reason}` }],
      };
    }
    return { ok: true, written, missing: [], corrected: Boolean(fs.corrected) };
  }

  return { ok: true, written, errors, missing: [], corrected: false };
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

/**
 * Partições da imagem, quando ela tem tabela.
 *
 * O `debugfs` não aceita deslocamento: para ler o ext4 de um `.img` de cartão é
 * preciso extrair a partição antes. `sfdisk -J` é o único jeito de obter os
 * setores sem fazer parsing de MBR/GPT à mão — e GPT em particular tem cabeçalho
 * variável demais para valer a pena reimplementar.
 */
export function listPartitions(imagePath) {
  const result = spawnSync("sfdisk", ["-J", imagePath], { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  try {
    const table = JSON.parse(result.stdout).partitiontable;
    return {
      sectorSize: Number(table.sectorsize) || 512,
      partitions: (table.partitions || []).map((part) => ({
        start: Number(part.start),
        size: Number(part.size),
        type: String(part.type || ""),
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Lê `/opt/giochi/apps/index.json` de uma imagem com tabela de partição.
 *
 * Extrai a maior partição Linux para um arquivo temporário com `dd` e roda o
 * `debugfs` nela. É leitura, não escrita: nenhuma etapa altera a imagem
 * original. Custa I/O do tamanho do rootfs — e é o preço de dizer a verdade no
 * manifesto em vez de repetir o catálogo.
 */
export function readAppsFromCardImage(imagePath, { tempDir } = {}) {
  const table = listPartitions(imagePath);
  if (!table) return { ok: false, inspected: false, reason: "tabela de partição ilegível" };

  const target = linuxPartition(table);
  if (!target) return { ok: false, inspected: false, reason: "nenhuma partição na tabela" };

  const created = !tempDir;
  const dir = tempDir || mkdtempSync(path.join(os.tmpdir(), "giochi-part-"));
  const partitionFile = path.join(dir, "particao.img");

  // `dd` em vez de `fs.readFileSync`: 1 GiB de rootfs em buffer de JS é memória
  // gasta sem motivo, e o `dd` copia por faixa sem montar nada.
  const extraida = extractPartition(imagePath, table, target, partitionFile);
  if (!extraida.ok) {
    if (created) rmSync(dir, { recursive: true, force: true });
    return { ok: false, inspected: false, reason: extraida.reason };
  }

  const read = readRootfsApps(partitionFile);
  if (created) rmSync(dir, { recursive: true, force: true });
  return read;
}

/**
 * Injeta o overlay numa imagem **com tabela de partição** (cartão SD).
 *
 * Extrai a partição do rootfs, escreve nela, confere com `e2fsck` e devolve ao
 * offset de origem. A tabela de partição e as demais partições não são tocadas.
 *
 * Devolve `{ ok, written, errors, missing, corrected }`. Sempre limpa o
 * temporário, inclusive nos caminhos de erro.
 */
export function injectIntoCardImage({ imagePath, overlayDir }) {
  const table = listPartitions(imagePath);
  if (!table) {
    return {
      ok: false,
      written: 0,
      missing: [],
      errors: [
        {
          code: "tabela_ilegivel",
          message: `${imagePath}: não consegui ler a tabela de partição (sfdisk ausente?)`,
        },
      ],
    };
  }

  const target = linuxPartition(table);
  if (!target) {
    return {
      ok: false,
      written: 0,
      missing: [],
      errors: [{ code: "sem_particao", message: `${imagePath}: nenhuma partição na tabela` }],
    };
  }

  if (!fsckAvailable()) {
    return {
      ok: false,
      written: 0,
      missing: [],
      errors: [
        {
          code: "e2fsck_ausente",
          message:
            "e2fsck não disponível — sem ele não há como provar que o rootfs alterado " +
            "continua montável, e a injeção não é publicada",
        },
      ],
    };
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), "giochi-inj-"));
  const partitionFile = path.join(dir, "particao.img");
  try {
    const extraida = extractPartition(imagePath, table, target, partitionFile);
    if (!extraida.ok) {
      return {
        ok: false,
        written: 0,
        missing: [],
        errors: [{ code: "extracao_falhou", message: extraida.reason }],
      };
    }

    const injetado = injectOverlay({ imagePath: partitionFile, overlayDir });
    if (!injetado.ok) return { ...injetado, corrected: false };

    const fs = checkFilesystem(partitionFile);
    if (!fs.ok) {
      return {
        ok: false,
        written: injetado.written,
        missing: [],
        errors: [
          {
            code: "rootfs_corrompido",
            message: `o rootfs não passou no e2fsck depois da escrita (${fs.reason}); imagem descartada`,
          },
        ],
      };
    }

    const devolvida = writeBackPartition(imagePath, table, target, partitionFile);
    if (!devolvida.ok) {
      return {
        ok: false,
        written: injetado.written,
        missing: [],
        errors: [{ code: "escrita_falhou", message: devolvida.reason }],
      };
    }

    return { ok: true, written: injetado.written, missing: [], errors: [], corrected: fs.corrected || injetado.corrected };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export { INDEX_PATH };
