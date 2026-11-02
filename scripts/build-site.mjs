#!/usr/bin/env node
// Gera o site. Lógica em scripts/lib/site.mjs.
//
// Uso:
//   node scripts/build-site.mjs --dist <pasta de releases> [--out site/dist] [--no-copy]
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateSite } from "./lib/site.mjs";

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
const outDir = path.resolve(args.out || path.join(ROOT, "site", "dist"));

const result = generateSite({
  distDir,
  outDir,
  templatePath: path.join(ROOT, "site", "template.html"),
  stylePath: path.join(ROOT, "site", "assets", "style.css"),
  copyImages: !args["no-copy"],
});

for (const error of result.errors) console.error(`  [erro] ${error.message}`);
for (const warning of result.warnings) console.log(`  aviso ${warning.message}`);

if (!result.ok) {
  console.error("FALHOU ao gerar o site.");
  process.exit(1);
}

console.log(`Site gerado em ${outDir}`);
console.log(`  ${result.releases.length} release(s)`);
for (const release of result.releases) {
  console.log(`  ${release.device?.id} ${release.system?.version} → ${release.__href ?? "sem link"}`);
}
console.log();
console.log("Abra index.html direto no navegador — não precisa de servidor.");
