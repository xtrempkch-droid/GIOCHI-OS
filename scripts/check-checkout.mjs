#!/usr/bin/env node
// Confere que o checkout recortado do CI tem o pacote inteiro de cada app.
//
// O `release.yml` faz `sparse-checkout` dos repositórios externos para não
// baixar gigabytes de `target/` e `vendor/`. O recorte é uma afirmação sobre o
// formato do repositório — e afirmação sobre repositório de terceiro envelhece.
// Quando envelhece, o `continue-on-error` do checkout de jogos transforma a
// perda em "release sem jogos, verde".
//
// A checagem compara o que está commitado DENTRO da pasta de cada app com o que
// o checkout materializou. É o escopo certo: arquivo na raiz do repositório
// (README, Cargo.toml) não faz parte do pacote e não precisa estar lá; um
// `config/` que o app lê em tempo de execução precisa, e é justamente o que
// faltou quando o `giochi-tower` morreu com `não consegui ler config/classes.ron`.
//
// Uso:
//   node scripts/check-checkout.mjs --repo .deps/games --catalog .deps/games
//   node scripts/check-checkout.mjs --repo .deps/app --catalog .deps/app/app
import { spawnSync } from "node:child_process";
import path from "node:path";

import { loadAppsFromRoots } from "./lib/apps.mjs";
import { arquivosPresentes, ehDeDesenvolvimento, faltandoNoCheckout } from "./lib/checkout.mjs";

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

function listarCommits(repoDir) {
  const resultado = spawnSync("git", ["-C", repoDir, "ls-tree", "-r", "--name-only", "HEAD"], {
    encoding: "utf8",
    // O repositório de jogos tem 26 mil caminhos; o padrão de 1 MB de buffer
    // estoura com `ENOBUFS` e o erro aparece como "não consegui listar".
    maxBuffer: 256 * 1024 * 1024,
  });
  if (resultado.error || resultado.status !== 0) {
    console.error(
      `ERRO: não consegui listar a árvore de ${repoDir}: ${resultado.stderr || resultado.error}`,
    );
    process.exit(2);
  }
  return String(resultado.stdout)
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);
}

const args = parseArgs(process.argv.slice(2));
if (!args.repo || args.repo === true || !args.catalog || args.catalog === true) {
  console.error("ERRO: uso: --repo <checkout> --catalog <pasta do catálogo>");
  process.exit(2);
}

const repoDir = path.resolve(args.repo);
const catalogoDir = path.resolve(args.catalog);

const apps = await loadAppsFromRoots([catalogoDir]);
if (!apps.ok) {
  console.error("ERRO: o catálogo não carrega a partir do checkout recortado:");
  for (const erro of apps.errors) console.error(`  ${erro.code}: ${erro.message}`);
  process.exit(1);
}

const commitados = listarCommits(repoDir);
const presentes = new Set(arquivosPresentes(repoDir));

const problemas = [];
let conferidos = 0;
for (const app of [...apps.embedded, ...apps.skipped.filter((s) => s.dir)]) {
  if (!app.dir) continue;
  const prefixo = path.relative(repoDir, path.resolve(app.dir)).split(path.sep).join("/");
  if (prefixo.startsWith("..")) continue;

  const doApp = commitados
    .filter((arquivo) => arquivo.startsWith(`${prefixo}/`))
    .map((arquivo) => arquivo.slice(prefixo.length + 1));
  const presentesDoApp = [...presentes]
    .filter((arquivo) => arquivo.startsWith(`${prefixo}/`))
    .map((arquivo) => arquivo.slice(prefixo.length + 1));

  conferidos += 1;
  const faltando = faltandoNoCheckout({ arquivos: doApp, presentes: presentesDoApp });
  for (const arquivo of faltando) problemas.push(`${prefixo}/${arquivo}`);
}

console.log(
  `${repoDir}: ${apps.embedded.length} app(s) na imagem, ${apps.skipped.length} pulado(s), ` +
    `${conferidos} pasta(s) conferida(s)`,
);

if (problemas.length > 0) {
  console.error(`ERRO: ${problemas.length} arquivo(s) do app ficaram fora do checkout recortado:`);
  for (const arquivo of problemas.slice(0, 20)) console.error(`  ${arquivo}`);
  if (problemas.length > 20) console.error(`  … e mais ${problemas.length - 20}`);
  console.error("Acrescente o diretório ao `sparse-checkout` do release.yml.");
  process.exit(1);
}

const jogados = [...presentes].filter((arquivo) => ehDeDesenvolvimento(arquivo)).length;
console.log(`  pacote completo; ${jogados} arquivo(s) de desenvolvimento no checkout (ignorados)`);
