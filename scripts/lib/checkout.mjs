// O que é do app e o que só existe para desenvolver.
//
// A regra aparece em dois lugares que precisam concordar: a fase `apps` copia
// do catálogo para a imagem "tudo menos desenvolvimento", e o `release.yml`
// faz `sparse-checkout` dos repositórios externos com uma lista de caminhos.
// Se as duas divergirem, o CI empacota menos do que o build local — e o
// sintoma é um app que abre no PC e não abre no aparelho.
//
// Por isso a guarda: `scripts/check-checkout.mjs` reprova quando algum arquivo
// commitado e não-desenvolvimento ficou fora do checkout recortado.
import { walk } from "./fs.mjs";

/**
 * Diretórios que existem para desenvolver o app, não para rodá-lo.
 *
 * `assets/` e `config/` foram descobertos um de cada vez, com o app falhando
 * dentro do QEMU. `target/` e `vendor/`, sozinhos, são gigabytes.
 */
export const DIRS_DE_DESENVOLVIMENTO = new Set([
  ".cargo",
  ".git",
  ".github",
  ".vscode",
  "benches",
  "build",
  "crates",
  "dist",
  "docs",
  "examples",
  "node_modules",
  "prototipo",
  "scripts",
  "src",
  "target",
  "tests",
  "vendor",
]);

/** Arquivos soltos na raiz da pasta do app que fazem parte do pacote. */
const ARQUIVOS_DA_RAIZ = new Set(["metadata.json", "capa.png"]);

/** `src/main.rs` → desenvolvimento; `config/classes.ron` → parte do app. */
export function ehDeDesenvolvimento(relativePath) {
  const [topo, ...resto] = relativePath.split("/");
  if (resto.length === 0) return !ARQUIVOS_DA_RAIZ.has(topo);
  return DIRS_DE_DESENVOLVIMENTO.has(topo);
}

/**
 * O que a fase `apps` copia para a imagem.
 *
 * É o espelho de `runAppsPhase`: os diretórios que não são de desenvolvimento,
 * mais `metadata.json` e `capa.png`. Um `Cargo.toml` na raiz do app não entra
 * na imagem — e por isso não pode faltar no checkout.
 */
export function ehDoPacote(relativePath) {
  return !ehDeDesenvolvimento(relativePath);
}

/**
 * Arquivos commitados que deveriam estar no checkout e não estão.
 *
 * Puro de propósito: recebe as duas listas prontas. Quem chama decide como
 * obtê-las (`git ls-tree` e uma varredura de disco, respectivamente).
 */
export function faltandoNoCheckout({ arquivos, presentes }) {
  const tem = new Set(presentes);
  return arquivos.filter((arquivo) => ehDoPacote(arquivo) && !tem.has(arquivo));
}

/** Lista dos arquivos materializados num diretório (caminhos com `/`). */
export function arquivosPresentes(dirPath) {
  return walk(dirPath);
}
