// Nomes dos anexos de uma release com mais de um aparelho.
//
// Os anexos do GitHub são PLANOS: `dist/powkiddy-x55/SHA256SUMS` e
// `dist/qemu-aarch64/SHA256SUMS` chegam como dois arquivos de mesmo nome, e o
// segundo sobrescreve o primeiro. Medido na v0.1.1: o `SHA256SUMS` publicado
// tinha só a linha do X55 — quem baixasse o disco do QEMU rodava
// `sha256sum -c` contra um nome que não existia no diretório dele.
//
// A regra é do empacotamento, não do aparelho: três arquivos são *por
// aparelho* e precisam do id no nome; o resto (as imagens) já carrega o id.
import { copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { isDir, isFile, walk } from "./fs.mjs";

/** Arquivos que cada aparelho produz com o mesmo nome dos outros. */
export const NOMES_POR_APARELHO = ["SHA256SUMS", "README.txt", "release.json"];

/** Nome com o aparelho na frente: `SHA256SUMS` → `powkiddy-x55-SHA256SUMS`. */
export function nomeComAparelho(device, nome) {
  return `${device}-${nome}`;
}

/**
 * Copia os arquivos por aparelho para o nível raso de `distDir` com o id no
 * nome e apaga os originais, para que a listagem recursiva não contenha mais
 * dois arquivos de mesmo nome-base.
 *
 * O `README.txt` cita `sha256sum -c SHA256SUMS`; o texto acompanha o nome novo,
 * senão a instrução aponta para um arquivo que não existe.
 */
export function flattenReleaseAssets(distDir) {
  const devices = readdirSync(distDir)
    .filter((name) => isDir(path.join(distDir, name)))
    .sort();

  const attachments = [];
  const errors = [];

  for (const device of devices) {
    const dir = path.join(distDir, device);
    for (const nome of NOMES_POR_APARELHO) {
      const origem = path.join(dir, nome);
      if (!isFile(origem)) continue;

      const destino = path.join(distDir, nomeComAparelho(device, nome));
      if (nome === "README.txt") {
        // O nome citado é o do arquivo de checksum, não o do README.
        const alvo = nomeComAparelho(device, "SHA256SUMS");
        const texto = readFileSync(origem, "utf8").replaceAll(
          "sha256sum -c SHA256SUMS",
          `sha256sum -c ${alvo}`,
        );
        writeFileSync(destino, texto, "utf8");
      } else {
        copyFileSync(origem, destino);
      }
      rmSync(origem);
      attachments.push(path.basename(destino));
    }
  }

  // A checagem é sobre o conjunto achatado, não sobre `dist/`: o upload usa
  // `dist/**\/*`, então o que colide é o nome-base em qualquer profundidade.
  const porNome = new Map();
  for (const file of walk(distDir)) {
    const base = path.basename(file);
    porNome.set(base, [...(porNome.get(base) || []), file]);
  }
  const collisions = [...porNome.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([nome, files]) => ({ nome, files }));

  for (const { nome, files } of collisions) {
    errors.push({
      code: "anexo_colide",
      message: `"${nome}" aparece ${files.length} vezes: ${files.join(", ")}`,
    });
  }

  return {
    ok: errors.length === 0,
    devices,
    attachments: attachments.sort(),
    collisions,
    errors,
  };
}
