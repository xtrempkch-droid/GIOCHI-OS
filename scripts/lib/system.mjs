// Leitura e verificação da saída de build do Giochi System.
//
// O Giochi os não compila nada: recebe a pasta `out/<device>/` produzida pelo
// Giochi System e confere se o que está lá é confiável antes de empacotar.
//
// A verificação importa porque o `SHA256SUMS` é gerado no fim do build, e um
// arquivo truncado (disco cheio, kill no meio) produz imagem que falha no
// cartão sem mensagem útil.
import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import path from "node:path";

import { isDir, isFile, listDir, readJson, sha256File, sizeOf } from "./fs.mjs";

/** Arquivos que o build do sistema precisa ter deixado. */
const REQUIRED_METADATA = ["device.json", "build-info.txt", "SHA256SUMS"];

/** Imagem de cartão, crua ou comprimida. */
const IMAGE_PATTERN = /\.(img|iso|sdcard)(\.(xz|gz|zst))?$/i;

/**
 * Kernel solto. O Buildroot publica nomes diferentes conforme a arquitetura:
 * `Image` no ARM64, `bzImage`/`zImage` no x86 e ARM32.
 */
const KERNEL_PATTERN = /^(Image|bzImage|zImage|uImage)$/;

/**
 * Sistema de arquivos do rootfs, ainda sem tabela de partição.
 *
 * Quando não existe imagem de cartão, é daqui que sai o "cartão" do QEMU: um
 * rootfs ext4 cru já é um disco válido para o virtio-blk.
 */
const ROOTFS_PATTERN = /^rootfs\.(ext[234]|squashfs)$/i;

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
 * O arquivo começa com uma tabela de partição?
 *
 * Toda imagem de disco — MBR ou GPT — traz a assinatura `0x55AA` nos bytes
 * 510–511 (no GPT ela existe de propósito, no MBR protetor). Um blob de boot
 * gravado em offset fixo (`idbloader.img`, `u-boot.itb`) não tem.
 *
 * Lê 512 bytes, não o arquivo: a checagem precisa ser barata porque acontece
 * sobre candidatos de 2 GiB.
 */
function hasPartitionTable(filePath) {
  let fd;
  try {
    fd = openSync(filePath, "r");
    const header = Buffer.alloc(512);
    const lido = readSync(fd, header, 0, 512, 0);
    return lido === 512 && header[510] === 0x55 && header[511] === 0xaa;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
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
  //
  // O `.img` não é exclusivo de cartão: o RK3566 entrega `idbloader.img` na mesma
  // pasta, e uma build pode ter os dois. Chamar o blob de boot de "cartão" daria
  // um download de 178 KB que não inicializa nada. Tamanho resolve este caso,
  // mas não prova nada — a diferença é factual: **cartão tem tabela de
  // partição** (0x55AA em 510), blob de boot não.
  //
  // `device.json#artifacts` NÃO serve para isso: ele diz o que subir, e em
  // `generic-x64`, `powkiddy-x35s` e `steamdeck` o cartão está lá (`disk.img`,
  // `sdcard.img`, `*.img`). Excluir por ele apagaria o próprio cartão.
  const images = [];
  for (const entry of listDir(systemDir)) {
    if (!IMAGE_PATTERN.test(entry)) continue;
    const full = path.join(systemDir, entry);
    if (!isFile(full)) continue;
    const compressed = /\.(xz|gz|zst)$/i.test(entry);
    images.push({
      name: entry,
      sizeBytes: sizeOf(full),
      path: full,
      compressed,
      // Comprimido não dá para espiar sem descomprimir 2 GiB: fica `null`
      // (desconhecido) em vez de `false`, que seria mentira.
      hasPartitionTable: compressed ? null : hasPartitionTable(full),
    });
  }

  // Só descarta candidato quando a evidência é positiva para outro: pelo menos
  // um tem tabela de partição. Se nenhum tem (cartão cru renomeado, por
  // exemplo), todos continuam e a heurística de tamanho decide.
  //
  // `null` (comprimido, não inspecionado) NUNCA é descartado: `card.img` +
  // `card.img.xz` na mesma pasta é o formato de publicação, e o comprimido é o
  // que deve ser publicado. Descartar o desconhecido apagaria o bom.
  const comTabela = images.filter((image) => image.hasPartitionTable === true);
  const candidatos =
    comTabela.length > 0
      ? images.filter((image) => image.hasPartitionTable !== false)
      : images;
  for (const image of images) {
    if (candidatos.includes(image)) continue;
    warnings.push({
      code: "componente_de_boot",
      message:
        `${image.name} casa com a extensão de imagem mas não tem tabela de partição; ` +
        "tratado como componente do boot, não como cartão",
    });
  }

  // Kernel e rootfs soltos: é o que o Buildroot entrega para um alvo virtual,
  // onde não existe `genimage` montando um cartão. Sem eles, um build de QEMU
  // não teria nada para publicar.
  let kernel = null;
  let rootfs = null;
  for (const entry of listDir(systemDir)) {
    const full = path.join(systemDir, entry);
    if (!isFile(full)) continue;
    if (!kernel && KERNEL_PATTERN.test(entry)) {
      kernel = { name: entry, sizeBytes: sizeOf(full), path: full };
    } else if (!rootfs && ROOTFS_PATTERN.test(entry)) {
      rootfs = { name: entry, sizeBytes: sizeOf(full), path: full };
    }
  }

  if (candidatos.length === 0 && !(kernel && rootfs)) {
    warnings.push({
      code: "sem_imagem",
      message:
        "nenhum .img/.iso encontrado; o build pode ter parado antes do genimage" +
        " (kernel + rootfs também são aceitos, para alvos virtuais)",
    });
  }

  return {
    ok: errors.length === 0,
    device,
    deviceId: String(device?.id || path.basename(path.resolve(systemDir))),
    virtual: isVirtualDevice(device, systemDir),
    images: candidatos,
    kernel,
    rootfs,
    checksums,
    errors,
    warnings,
  };
}

/**
 * O alvo é uma máquina virtual, não um handheld com cartão.
 *
 * O `device.json` do Giochi System ainda não declara isso, então a decisão sai
 * do que ele já traz: defconfig do QEMU ou id que nomeia uma VM. Errar para
 * "hardware" é o lado seguro — o site mostra o passo de `dd`, que só é
 * desnecessário; o contrário mandaria gravar um disco virtual num cartão.
 */
export function isVirtualDevice(device, systemDir) {
  if (!device || typeof device !== "object") {
    return /qemu|virtual|vm\b/i.test(path.basename(String(systemDir || "")));
  }
  if (device.virtual === true) return true;
  if (device.virtual === false) return false;
  const haystack = [device.id, device.name, device.buildrootDefconfig, device.arch]
    .filter(Boolean)
    .join(" ");
  return /qemu|virtual|\bvm\b/i.test(haystack);
}
