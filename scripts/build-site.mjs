#!/usr/bin/env node
// Gera a página de download. Lógica em scripts/lib/site.mjs.
//
// Uso:
//   # arquivo único para a raiz do repositório (é a página publicada)
//   node scripts/build-site.mjs --dist dist --single-file --out index.html
//
//   # cópia local com as imagens ao lado, para abrir sem rede
//   node scripts/build-site.mjs --dist dist [--out site/dist] [--no-copy]
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_REPO, generateSite } from "./lib/site.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = value;
      index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const distDir = path.resolve(args.dist || path.join(ROOT, "dist"));
const singleFile = Boolean(args["single-file"]);

// Sem `--single-file`, o destino é uma PASTA; com ele, um ARQUIVO.
const outDir = singleFile
  ? path.resolve(args.out && args.out !== true ? args.out : path.join(ROOT, "index.html"))
  : path.resolve(args.out && args.out !== true ? args.out : path.join(ROOT, "site", "dist"));

/**
 * Base dos downloads.
 *
 * `--download-base` manda. Sem ela, `site.mjs` deriva
 * `https://github.com/<repo>/releases/download/v<versão>/` a partir do próprio
 * `release.json` — é o que nomeia os arquivos, então não há como a versão do
 * link discordar da versão do arquivo.
 */
const repo = String(
  args.repo && args.repo !== true ? args.repo : process.env.GITHUB_REPOSITORY || DEFAULT_REPO,
);
const downloadBase =
  args["download-base"] && args["download-base"] !== true
    ? String(args["download-base"])
    : null;

const result = generateSite({
  distDir,
  outDir,
  templatePath: path.join(ROOT, "site", "template.html"),
  stylePath: path.join(ROOT, "site", "assets", "style.css"),
  copyImages: !args["no-copy"] && !singleFile,
  singleFile,
  downloadBase,
  repo,
});

for (const error of result.errors) console.error(`  [erro] ${error.message}`);
for (const warning of result.warnings) console.log(`  aviso ${warning.message}`);

if (!result.ok) {
  console.error("FALHOU ao gerar o site.");
  process.exit(1);
}

console.log(`Página gerada em ${result.indexPath}`);
console.log(`  ${result.releases.length} release(s)`);
if (singleFile) {
  console.log(`  arquivo único: ${(result.bytes / 1024).toFixed(0)} KiB, sem dependência externa`);
} else {
  for (const release of result.releases) {
    console.log(`  ${release.device?.id} ${release.system?.version} → ${release.__href ?? "sem link"}`);
  }
  console.log();
  console.log("Abra index.html direto no navegador — não precisa de servidor.");
}
