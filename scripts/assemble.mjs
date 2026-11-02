#!/usr/bin/env node
// Junta os dois repositórios. Lógica em scripts/lib/pipeline.mjs; aqui só
// argumentos e saída de console.
//
// Uso:
//   node scripts/assemble.mjs apps    --apps <Giochi app/app> --out <staging>
//   node scripts/assemble.mjs package --system <out/device> --apps <...> --out <dist> [--version v]
import path from "node:path";

import { runAppsPhase, runPackagePhase } from "./lib/pipeline.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = value;
      index += 1;
    }
  }
  return args;
}

function printIssues(errors, warnings) {
  for (const error of errors) console.error(`  [${error.code}] ${error.message}`);
  for (const warning of warnings) console.log(`  aviso [${warning.code}] ${warning.message}`);
}

const args = parseArgs(process.argv.slice(2));

if (args.command === "apps") {
  if (!args.apps) {
    console.error("ERRO: faltou --apps <caminho do app/ do Giochi app>");
    process.exit(2);
  }
  if (!args.out) {
    console.error("ERRO: faltou --out <diretório de staging>");
    process.exit(2);
  }

  const appsRoot = path.resolve(args.apps);
  const outDir = path.resolve(args.out);

  console.log("Giochi os — fase apps");
  console.log(`  catálogo: ${appsRoot}`);
  console.log(`  saída:    ${outDir}`);
  console.log();

  const result = await runAppsPhase({ appsRoot, outDir });
  printIssues(result.errors, result.warnings ?? []);
  for (const item of result.skipped ?? []) console.log(`  pulado ${item.id}: ${item.reason}`);

  if (!result.ok) {
    console.error(`FALHOU: ${result.errors.length} erro(s)`);
    process.exit(1);
  }

  for (const app of result.embedded) console.log(`  + ${app.id} ${app.version}`);
  console.log();
  console.log(`Overlay pronto: ${result.overlayDir}`);
  console.log(`  ${result.embedded.length} app(s) na imagem, ${result.external.length} de loja.`);
  console.log();
  console.log("Próximo passo: passar o overlay ao build do Giochi System");
  process.exit(0);
}

if (args.command === "package") {
  if (!args.system) {
    console.error("ERRO: faltou --system <saída out/<device> do Giochi System>");
    process.exit(2);
  }
  if (!args.out) {
    console.error("ERRO: faltou --out <diretório de release>");
    process.exit(2);
  }

  console.log("Giochi os — fase package");
  console.log(`  sistema: ${path.resolve(args.system)}`);
  console.log(`  saída:   ${path.resolve(args.out)}`);
  console.log();

  const result = await runPackagePhase({
    systemDir: path.resolve(args.system),
    appsRoot: args.apps ? path.resolve(args.apps) : null,
    outDir: path.resolve(args.out),
    version: args.version && args.version !== true ? String(args.version) : undefined,
  });
  printIssues(result.errors, result.warnings);

  if (!result.ok) {
    console.error(`FALHOU: ${result.errors.length} erro(s)`);
    process.exit(1);
  }

  const release = result.release;
  console.log(`  + ${release.system.image} (${release.system.sizeHuman})`);
  console.log();
  console.log(`Release pronta em ${path.resolve(args.out)}`);
  console.log(`  sha256: ${release.system.imageSha256}`);
  console.log(`  apps na imagem: ${release.apps.embedded.length}`);
  console.log(`  apps de loja:   ${release.apps.store.length}`);
  console.log();
  console.log("Próximo passo: node scripts/build-site.mjs --dist <pasta de releases>");
  process.exit(0);
}

console.error("Uso:");
console.error("  node scripts/assemble.mjs apps    --apps <app/> --out <staging>");
console.error("  node scripts/assemble.mjs package --system <out/device> --apps <app/> --out <dist>");
process.exit(2);
