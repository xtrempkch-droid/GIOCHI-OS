#!/usr/bin/env node
// Desdobra os anexos de uma release com mais de um aparelho.
// Lógica em scripts/lib/release-assets.mjs.
//
// Uso:
//   node scripts/flatten-release.mjs --dist <pasta de releases>
import path from "node:path";
import { fileURLToPath } from "node:url";

import { flattenReleaseAssets } from "./lib/release-assets.mjs";

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

const result = flattenReleaseAssets(distDir);

console.log(`aparelhos: ${result.devices.join(", ") || "(nenhum)"}`);
for (const nome of result.attachments) console.log(`  ${nome}`);

for (const error of result.errors) console.error(`  [erro] ${error.message}`);

if (!result.ok) {
  console.error("FALHOU: os anexos da release têm nomes repetidos.");
  process.exit(1);
}

console.log(`${result.attachments.length} nome(s) desdobrado(s), sem colisão.`);
