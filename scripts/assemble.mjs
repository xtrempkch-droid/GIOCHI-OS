#!/usr/bin/env node
// Junta os dois repositórios. Lógica em scripts/lib/pipeline.mjs; aqui só
// argumentos e saída de console.
//
// Uso:
//   node scripts/assemble.mjs apps    --apps <Giochi app/app> --out <staging>
//   node scripts/assemble.mjs package --system <out/device> --apps <...> --out <dist> [--version v]
//
// `--apps` aceita VÁRIOS catálogos, separados por vírgula ou repetindo a flag:
//
//   --apps ../GIOCHI-APP/app,../GIOCHI-GAMES/app
//
// Cada caminho precisa do seu `apps.json`. É o que permite os jogos morarem num
// repositório próprio sem copiar pasta para o catálogo do launcher.
import path from "node:path";

import { runAppsPhase, runPackagePhase } from "./lib/pipeline.mjs";

/**
 * Coleta `--apps` (repetível e/ou separado por vírgula).
 *
 * O `parseArgs` guarda só o último valor de uma flag repetida; aqui a flag é
 * acumulada, porque o uso real é "o catálogo do launcher e o dos jogos".
 */
function coletarApps(argv) {
  const caminhos = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--apps") continue;
    const valor = argv[i + 1];
    if (!valor || valor.startsWith("--")) continue;
    for (const parte of valor.split(",")) {
      const limpo = parte.trim();
      if (limpo) caminhos.push(limpo);
    }
  }
  return caminhos;
}

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

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const appsPaths = coletarApps(argv);

if (args.command === "apps") {
  if (appsPaths.length === 0) {
    console.error("ERRO: faltou --apps <caminho do app/ do Giochi app>");
    process.exit(2);
  }
  if (!args.out) {
    console.error("ERRO: faltou --out <diretório de staging>");
    process.exit(2);
  }

  const appsRoots = appsPaths.map((p) => path.resolve(p));
  const outDir = path.resolve(args.out);

  console.log("Giochi os — fase apps");
  for (const raiz of appsRoots) console.log(`  catálogo: ${raiz}`);
  console.log(`  saída:    ${outDir}`);
  console.log();

  const result = await runAppsPhase({ appsRoots, outDir });
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
    appsRoots: appsPaths.map((p) => path.resolve(p)),
    outDir: path.resolve(args.out),
    version: args.version && args.version !== true ? String(args.version) : undefined,
    compress: args.compress && args.compress !== true ? String(args.compress) : null,
    injectApps: Boolean(args["inject-apps"]),
  });
  printIssues(result.errors, result.warnings);

  if (!result.ok) {
    console.error(`FALHOU: ${result.errors.length} erro(s)`);
    process.exit(1);
  }

  const release = result.release;
  console.log(`  + ${release.system.image} (${release.system.sizeHuman})`);
  if (release.system.kernel) {
    console.log(`  + ${release.system.kernel.name} (${release.system.kernel.sizeHuman})`);
  }
  console.log();
  console.log(`Release pronta em ${path.resolve(args.out)}`);
  console.log(`  tipo: ${release.system.kind === "virtual" ? "máquina virtual" : "cartão SD"}`);
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
