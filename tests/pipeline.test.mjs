#!/usr/bin/env node
// Testes das duas funções do Giochi os: junção e site.
//
// Importa as libs em vez de spawnar os CLIs: sob o sandbox, spawnar falha com
// EPERM, e a função pura é o que interessa testar.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { loadApps, loadAppsFromRoots, pngSize } from "../scripts/lib/apps.mjs";
import { ehDeDesenvolvimento, faltandoNoCheckout } from "../scripts/lib/checkout.mjs";
import { observacoesDe, TIPOS_DE_OBSERVACAO } from "../scripts/lib/device-notes.mjs";
import { IDIOMAS, PADRAO, TEXTOS, validarTraducoes } from "../scripts/lib/i18n.mjs";
import { isFile, walk } from "../scripts/lib/fs.mjs";
import { runAppsPhase, runPackagePhase } from "../scripts/lib/pipeline.mjs";
import {
  injectIntoCardImage,
  injectOverlay,
  listPartitions,
  readAppsFromCardImage,
  readFromImage,
} from "../scripts/lib/inject.mjs";
import { inspectGamepad, lerCalibracaoDoMapa } from "../scripts/lib/gamepad.mjs";
import { flattenReleaseAssets, normalizeDeviceDirs } from "../scripts/lib/release-assets.mjs";
import { readRootfsApps } from "../scripts/lib/rootfs.mjs";
import { generateSite } from "../scripts/lib/site.mjs";
import { inspectSystemBuild, parseChecksums } from "../scripts/lib/system.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── helpers ──────────────────────────────────────────────────

function withTempDir(run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "giochi-os-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withTempDirAsync(run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "giochi-os-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** PNG sintético: assinatura + IHDR bastam para ler a dimensão. */
function fakePng(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function write(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function makeApp(appsRoot, { id, status = "ready", distribution = "image", license = "Proprietary" }) {
  const dir = path.join(appsRoot, id);
  write(
    path.join(dir, "metadata.json"),
    JSON.stringify(
      {
        title: id,
        developer: "Teste",
        version: "1.0.0",
        arch: "aarch64",
        runtime: "native",
        entrypoint: "bin/tool",
        license,
      },
      null,
      2,
    ),
  );
  write(path.join(dir, "bin", "tool"), "#!/bin/sh\necho ok\n");
  write(path.join(dir, "capa.png"), fakePng(320, 320));
  write(path.join(dir, "README.md"), "# app\n");
  return { dir, id, status, distribution, license };
}

function makeRegistry(appsRoot, entries) {
  write(
    path.join(appsRoot, "apps.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        apps: entries.map((entry) => ({
          id: entry.id,
          folder: entry.id,
          runtime: "native",
          status: entry.status,
          distribution: entry.distribution,
        })),
      },
      null,
      2,
    ),
  );
}

function makeSystemOutput(
  dir,
  { imageName = "test.img", tamper = false, partitionTable = false, deviceId = "qemu-aarch64", deviceName = "QEMU AArch64 Virt" } = {},
) {
  // `partitionTable` escreve a assinatura 0x55AA em 510, que é o que separa um
  // disco de um blob de boot. Sem ela, o arquivo é "uma imagem sem tabela" — o
  // que continua sendo aceito, por queda.
  let image = Buffer.from("imagem de teste do cartao");
  if (partitionTable) {
    image = Buffer.alloc(1024, 0);
    image.write("IMAGEM DE TESTE", 0, "ascii");
    image[510] = 0x55;
    image[511] = 0xaa;
  }
  write(path.join(dir, imageName), image);
  write(
    path.join(dir, "device.json"),
    JSON.stringify({ id: deviceId, name: deviceName, arch: "arm64", buildroot: "2024.02" }),
  );
  write(path.join(dir, "build-info.txt"), "name=Giochi System\nbuildroot=2024.02\n");
  write(path.join(dir, "SHA256SUMS"), `${sha256(image)}  ${imageName}\n`);
  if (tamper) {
    write(path.join(dir, imageName), Buffer.from("conteudo trocado depois do checksum"));
  }
  return { imageName, image };
}

// ── lib: checksums e png ─────────────────────────────────────

test("parseChecksums lê o formato do sha256sum", () => {
  const text = [
    "a".repeat(64) + "  giochi-x.img",
    "b".repeat(64) + " *arquivo com espaco.img",
    "linha invalida",
    "",
  ].join("\n");
  const map = parseChecksums(text);
  assert.equal(map.size, 2);
  assert.equal(map.get("giochi-x.img"), "a".repeat(64));
  assert.equal(map.get("arquivo com espaco.img"), "b".repeat(64));
});

test("pngSize lê dimensões", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "capa.png");
    writeFileSync(file, fakePng(320, 320));
    assert.deepEqual(pngSize(file), { width: 320, height: 320 });
  });
});

test("pngSize devolve null para não-PNG", () => {
  withTempDir((dir) => {
    const file = path.join(dir, "x.png");
    writeFileSync(file, "nao sou png");
    assert.equal(pngSize(file), null);
  });
});

// ── lib: catálogo de apps ────────────────────────────────────

test("scaffold é pulado, não reprova", async () => {
  await withTempDirAsync(async (dir) => {
    const app = makeApp(dir, { id: "em-obras", status: "scaffold", distribution: "image" });
    makeRegistry(dir, [app]);
    const result = await loadApps(dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.embedded.length, 0);
    assert.equal(result.skipped.length, 1);
  });
});

test("app pronto e completo vai para a imagem", async () => {
  await withTempDirAsync(async (dir) => {
    const app = makeApp(dir, { id: "pronto" });
    makeRegistry(dir, [app]);
    const result = await loadApps(dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.embedded.length, 1);
    assert.equal(result.embedded[0].id, "pronto");
    assert.ok(result.embedded[0].hashes["bin/tool"], "hash por arquivo deve existir");
  });
});

test("app distribuído pela loja vai para external", async () => {
  await withTempDirAsync(async (dir) => {
    const app = makeApp(dir, { id: "loja", distribution: "store", license: "GPL-3.0-only" });
    makeRegistry(dir, [app]);
    const result = await loadApps(dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.external.length, 1);
    assert.equal(result.embedded.length, 0);
  });
});

test("GPL na imagem é recusada mesmo com o app pronto", async () => {
  await withTempDirAsync(async (dir) => {
    const app = makeApp(dir, { id: "gpl", distribution: "image", license: "GPL-3.0-only" });
    makeRegistry(dir, [app]);
    const result = await loadApps(dir);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === "licenca_gpl_na_imagem"));
  });
});

test("app de imagem sem bin/ reprova", async () => {
  await withTempDirAsync(async (dir) => {
    const app = makeApp(dir, { id: "vazio" });
    rmSync(path.join(app.dir, "bin"), { recursive: true, force: true });
    mkdirSync(path.join(app.dir, "bin"), { recursive: true });
    makeRegistry(dir, [app]);
    const result = await loadApps(dir);
    assert.ok(result.errors.some((error) => error.code === "bin_vazio"));
  });
});

test("capa fora de 320x320 reprova", async () => {
  await withTempDirAsync(async (dir) => {
    const app = makeApp(dir, { id: "capa-ruim" });
    write(path.join(app.dir, "capa.png"), fakePng(100, 100));
    makeRegistry(dir, [app]);
    const result = await loadApps(dir);
    assert.ok(result.errors.some((error) => error.code === "capa_dimensao"));
  });
});

test("host é ignorado sem erro", async () => {
  await withTempDirAsync(async (dir) => {
    const app = makeApp(dir, { id: "loja-do-pc", distribution: "host" });
    makeRegistry(dir, [app]);
    const result = await loadApps(dir);
    assert.equal(result.ok, true);
    assert.equal(result.skipped.some((item) => item.id === "loja-do-pc"), true);
  });
});

// ── lib: saída do sistema ────────────────────────────────────

test("inspectSystemBuild aceita saída coerente", async () => {
  await withTempDirAsync(async (dir) => {
    makeSystemOutput(dir);
    const result = await inspectSystemBuild(dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.images.length, 1);
    assert.equal(result.device.id, "qemu-aarch64");
  });
});

test("inspectSystemBuild recusa hash divergente", async () => {
  await withTempDirAsync(async (dir) => {
    makeSystemOutput(dir, { tamper: true });
    const result = await inspectSystemBuild(dir);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === "hash_divergente"));
  });
});

test("inspectSystemBuild recusa pasta inexistente", async () => {
  const result = await inspectSystemBuild(path.join(os.tmpdir(), "nao-existe-giochi"));
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "pasta_ausente");
});

// ── componente de boot × cartão ─────────────────────────────
//
// `.img` não é sinônimo de cartão: o RK3566 entrega `idbloader.img` na mesma
// pasta da imagem. Publicar o blob como se fosse o cartão daria um download que
// não inicializa nada.

test("inspectSystemBuild não confunde idbloader.img com o cartão", async () => {
  await withTempDirAsync(async (dir) => {
    const { imageName, image } = makeSystemOutput(dir, { partitionTable: true });
    // Componente de boot: 182 KB de código em offset fixo, sem tabela.
    const blob = Buffer.alloc(4096, 0xab);
    write(path.join(dir, "idbloader.img"), blob);
    write(
      path.join(dir, "SHA256SUMS"),
      `${sha256(image)}  ${imageName}\n${sha256(blob)}  idbloader.img\n`,
    );

    const result = await inspectSystemBuild(dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.images.map((i) => i.name), [imageName]);
    assert.ok(
      result.warnings.some((w) => w.code === "componente_de_boot" && /idbloader\.img/.test(w.message)),
      JSON.stringify(result.warnings),
    );
  });
});

test("inspectSystemBuild aceita imagem sem tabela de partição (queda)", async () => {
  // Cartão cru renomeado, ou imagem montada sem MBR: nenhum candidato tem
  // tabela, então nenhum é descartado e a heurística de tamanho decide.
  await withTempDirAsync(async (dir) => {
    makeSystemOutput(dir);
    write(path.join(dir, "outro.img"), Buffer.from("sem tabela tambem"));
    const result = await inspectSystemBuild(dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.images.length, 2);
    assert.equal(result.warnings.some((w) => w.code === "componente_de_boot"), false);
  });
});

test("inspectSystemBuild mantém o comprimido quando o cru também existe", async () => {
  // `card.img` + `card.img.xz` é o formato de publicação, e o comprimido é o
  // que deve sair. Ele não dá para inspecionar sem descomprimir 2 GiB, então
  // fica como desconhecido — e desconhecido não é descartado.
  await withTempDirAsync(async (dir) => {
    const { image, imageName } = makeSystemOutput(dir, { imageName: "card.img", partitionTable: true });
    const gz = Buffer.from("comprimido de mentira");
    write(path.join(dir, "card.img.gz"), gz);
    write(
      path.join(dir, "SHA256SUMS"),
      `${sha256(image)}  ${imageName}\n${sha256(gz)}  card.img.gz\n`,
    );

    const result = await inspectSystemBuild(dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.images.map((i) => i.name).sort(), ["card.img", "card.img.gz"]);
    assert.equal(result.images.find((i) => i.name === "card.img.gz").hasPartitionTable, null);
    assert.equal(result.warnings.some((w) => w.code === "componente_de_boot"), false);
  });
});

test("inspectSystemBuild não descarta o cartão declarado em artifacts", async () => {
  // `generic-x64`, `powkiddy-x35s` e `steamdeck` declaram o PRÓPRIO cartão em
  // `artifacts` (`disk.img`, `sdcard.img`, `*.img`). Excluir por esse campo —
  // que só diz o que subir — apagaria o cartão desses três aparelhos.
  await withTempDirAsync(async (dir) => {
    const { imageName } = makeSystemOutput(dir, { imageName: "sdcard.img", partitionTable: true });
    write(
      path.join(dir, "device.json"),
      JSON.stringify({ id: "powkiddy-x35s", artifacts: ["sdcard.img", "Image", "rootfs.ext4", "*.img"] }),
    );

    const result = await inspectSystemBuild(dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.images.map((i) => i.name), [imageName]);
  });
});

// ── fase 1: overlay ──────────────────────────────────────────

test("fase apps monta overlay com index.json e bin copiado", async () => {
  await withTempDirAsync(async (dir) => {
    const appsRoot = path.join(dir, "apps");
    const app = makeApp(appsRoot, { id: "pronto" });
    makeRegistry(appsRoot, [app]);
    const outDir = path.join(dir, "staging");

    const result = await runAppsPhase({ appsRoot, outDir });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const target = path.join(outDir, "rootfs-overlay", "opt", "giochi", "apps");
    assert.equal(isFile(path.join(target, "pronto", "bin", "tool")), true);
    assert.equal(isFile(path.join(target, "pronto", "metadata.json")), true);
    assert.equal(isFile(path.join(target, "index.json")), true);

    const index = JSON.parse(readFileSync(path.join(target, "index.json"), "utf8"));
    assert.equal(index.apps.length, 1);
    assert.equal(index.apps[0].id, "pronto");
    assert.equal(index.apps[0].dir, "/opt/giochi/apps/pronto");
  });
});

// ── fase 2: release ──────────────────────────────────────────

test("fase package gera release com nome canônico e checksum", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "qemu-aarch64");
    const { image } = makeSystemOutput(systemDir);
    const outDir = path.join(dir, "dist");

    const result = await runPackagePhase({ systemDir, outDir, version: "1.0.0" });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const release = JSON.parse(readFileSync(path.join(outDir, "release.json"), "utf8"));
    assert.equal(release.device.id, "qemu-aarch64");
    assert.equal(release.system.image, "giochi-qemu-aarch64-1.0.0.img");
    assert.equal(release.system.imageSha256, sha256(image));
    assert.equal(isFile(path.join(outDir, release.system.image)), true);

    const sums = readFileSync(path.join(outDir, "SHA256SUMS"), "utf8");
    assert.match(sums, /giochi-qemu-aarch64-1\.0\.0\.img/);
    assert.equal(isFile(path.join(outDir, "README.txt")), true);
  });
});

test("fase package recusa sistema com hash quebrado", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "dev");
    makeSystemOutput(systemDir, { tamper: true });
    const result = await runPackagePhase({ systemDir, outDir: path.join(dir, "dist") });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === "hash_divergente"));
  });
});

test("fase package inclui apps de loja no manifesto, sem embutir", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "dev");
    makeSystemOutput(systemDir);
    const appsRoot = path.join(dir, "apps");
    makeRegistry(appsRoot, [
      makeApp(appsRoot, { id: "na-imagem" }),
      makeApp(appsRoot, { id: "na-loja", distribution: "store", license: "GPL-3.0-only" }),
    ]);

    const result = await runPackagePhase({
      systemDir,
      appsRoot,
      outDir: path.join(dir, "dist"),
      version: "2.0.0",
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.release.apps.embedded.length, 1);
    assert.equal(result.release.apps.store.length, 1);
    assert.equal(result.release.apps.store[0].embedded, false);
  });
});

// ── site ─────────────────────────────────────────────────────

test("generateSite produz html com o device e link da imagem", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "qemu-aarch64");
    makeSystemOutput(systemDir);
    const distDir = path.join(dir, "dist");
    await runPackagePhase({ systemDir, outDir: distDir, version: "1.0.0" });

    const outDir = path.join(dir, "site");
    const result = generateSite({
      distDir,
      outDir,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const html = readFileSync(result.indexPath, "utf8");
    assert.match(html, /QEMU AArch64 Virt/);
    assert.match(html, /downloads\/qemu-aarch64\/giochi-qemu-aarch64-1\.0\.0\.img/);
    // O idioma padrão é o inglês (ver i18n.mjs). O texto vem do dicionário,
    // não de uma cópia aqui: se a tradução mudar, o teste acompanha.
    assert.ok(html.includes(TEXTOS[PADRAO]["hero.count"].split("{n}").join("1").split("{data}")[0]),
      "contagem de releases no idioma padrão");
    assert.equal(
      isFile(path.join(outDir, "downloads", "qemu-aarch64", "giochi-qemu-aarch64-1.0.0.img")),
      true,
    );
    assert.equal(isFile(path.join(outDir, "assets", "style.css")), true);
  });
});

test("generateSite apaga download de aparelho que saiu do dist", async () => {
  // `copyFileSync` nunca apaga: um aparelho que sai do `dist` (ou é renomeado)
  // deixaria a imagem antiga publicada no site para sempre — link que ainda
  // baixa, apontando para um build que não existe mais.
  await withTempDirAsync(async (dir) => {
    const outDir = path.join(dir, "site");
    const ghost = path.join(outDir, "downloads", "powkiddy-x35s", "velho.img");
    write(ghost, "imagem de um aparelho que nao existe mais");

    const systemDir = path.join(dir, "out", "qemu-aarch64");
    makeSystemOutput(systemDir);
    const distDir = path.join(dir, "dist");
    await runPackagePhase({ systemDir, outDir: distDir, version: "1.0.0" });

    const result = generateSite({
      distDir,
      outDir,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(isFile(ghost), false, "download fantasma continuou no site");
    assert.equal(isFile(path.join(outDir, "downloads", "qemu-aarch64", "giochi-qemu-aarch64-1.0.0.img")), true);
  });
});

test("generateSite sem cópia de imagens não destrói os downloads", async () => {
  // A geração de só HTML não é dona da pasta: apagá-la destruiria os downloads
  // de uma rodada anterior.
  await withTempDirAsync(async (dir) => {
    const outDir = path.join(dir, "site");
    const existente = path.join(outDir, "downloads", "qemu-aarch64", "imagem.img");
    write(existente, "download de uma rodada anterior");

    const systemDir = path.join(dir, "out", "qemu-aarch64");
    makeSystemOutput(systemDir);
    const distDir = path.join(dir, "dist");
    await runPackagePhase({ systemDir, outDir: distDir, version: "1.0.0" });

    const result = generateSite({
      distDir,
      outDir,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
      copyImages: false,
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(isFile(existente), true);
  });
});

test("generateSite falha sem release.json", async () => {  await withTempDirAsync(async (dir) => {
    const result = generateSite({
      distDir: path.join(dir, "vazio"),
      outDir: path.join(dir, "site"),
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
    });
    assert.equal(result.ok, false);
  });
});

test("generateSite avisa quando a imagem sumiu do release", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "dev");
    makeSystemOutput(systemDir);
    const distDir = path.join(dir, "dist");
    await runPackagePhase({ systemDir, outDir: distDir, version: "1.0.0" });

    // Simula release cuja imagem foi apagada (artefato expirado no CI).
    rmSync(path.join(distDir, "giochi-qemu-aarch64-1.0.0.img"), { force: true });

    const result = generateSite({
      distDir,
      outDir: path.join(dir, "site"),
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
    });
    assert.equal(result.ok, true);
    assert.ok(result.warnings.length >= 1);
  });
});

test("fase package usa a imagem comprimida quando existe", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "dev");
    const image = Buffer.from("imagem crua grande");
    const packed = Buffer.from("xz bem menor");
    write(path.join(systemDir, "sdcard.img"), image);
    write(path.join(systemDir, "sdcard.img.xz"), packed);
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({ id: "qemu-aarch64", name: "QEMU", arch: "arm64", buildroot: "2024.02" }),
    );
    write(path.join(systemDir, "build-info.txt"), "buildroot=2024.02\n");
    write(
      path.join(systemDir, "SHA256SUMS"),
      `${sha256(image)}  sdcard.img\n${sha256(packed)}  sdcard.img.xz\n`,
    );

    const result = await runPackagePhase({
      systemDir,
      outDir: path.join(dir, "dist"),
      version: "1.0.0",
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    // O cru é maior; sem a regra de preferência o código pegaria ele.
    assert.equal(result.release.system.image, "giochi-qemu-aarch64-1.0.0.img.xz");
    assert.equal(result.release.system.imageSha256, sha256(packed));
  });
});

test("fase package avisa quando só existe imagem crua", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "dev");
    makeSystemOutput(systemDir);

    const result = await runPackagePhase({
      systemDir,
      outDir: path.join(dir, "dist"),
      version: "1.0.0",
    });

    assert.equal(result.ok, true);
    assert.ok(
      result.warnings.some((warning) => warning.code === "imagem_crua"),
      "publicar .img cru deve avisar",
    );
  });
});

test("todo asset referenciado pelo site é publicado", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "dev");
    makeSystemOutput(systemDir);
    const distDir = path.join(dir, "dist");
    await runPackagePhase({ systemDir, outDir: distDir, version: "1.0.0" });

    const outDir = path.join(dir, "site");
    const result = generateSite({
      distDir,
      outDir,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    // O site referencia logo, marca e favicon. Se `generateSite` copiar só o
    // CSS, a imagem quebra em produção e o build continua verde — que é
    // exatamente o tipo de falha silenciosa que este teste fecha.
    const html = readFileSync(result.indexPath, "utf8");
    const referencias = [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(referencias.length > 0, "o template não referencia nenhum asset");

    for (const ref of new Set(referencias)) {
      assert.equal(
        isFile(path.join(outDir, ref)),
        true,
        `asset referenciado mas não publicado: ${ref}`,
      );
    }
  });
});

// ── alvo virtual: kernel + rootfs, sem cartão ────────────────

/** Saída do Buildroot para QEMU: `Image` e `rootfs.ext4`, nada de .img. */
function makeVirtualSystemOutput(dir, { console: consoleName = "ttyAMA0" } = {}) {
  const kernel = Buffer.from("kernel arm64 de teste");
  const rootfs = Buffer.from("rootfs ext4 de teste");
  write(path.join(dir, "Image"), kernel);
  write(path.join(dir, "rootfs.ext4"), rootfs);
  write(
    path.join(dir, "device.json"),
    JSON.stringify({
      id: "qemu-aarch64",
      name: "QEMU AArch64 Virt",
      arch: "arm64",
      buildroot: "2024.02",
      buildrootDefconfig: "qemu_aarch64_virt_defconfig",
      kernelCmdline: { console: consoleName },
    }),
  );
  write(path.join(dir, "build-info.txt"), "name=Giochi System\nbuildroot=2024.02\n");
  write(
    path.join(dir, "SHA256SUMS"),
    [
      `${sha256(kernel)}  Image`,
      `${sha256(rootfs)}  rootfs.ext4`,
      `${sha256(readFileSync(path.join(dir, "device.json")))}  device.json`,
      `${sha256(readFileSync(path.join(dir, "build-info.txt")))}  build-info.txt`,
      "",
    ].join("\n"),
  );
  return { kernel, rootfs };
}

test("inspectSystemBuild reconhece kernel + rootfs de alvo virtual", async () => {
  await withTempDirAsync(async (dir) => {
    makeVirtualSystemOutput(dir);
    const result = await inspectSystemBuild(dir);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.images.length, 0);
    assert.equal(result.kernel.name, "Image");
    assert.equal(result.rootfs.name, "rootfs.ext4");
    assert.equal(result.virtual, true);
    // Sem cartão mas com kernel+rootfs não é problema: é o normal do QEMU.
    assert.equal(
      result.warnings.some((warning) => warning.code === "sem_imagem"),
      false,
    );
  });
});

test("fase package publica disco + kernel de alvo virtual", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "qemu-aarch64");
    const { kernel, rootfs } = makeVirtualSystemOutput(systemDir);
    const outDir = path.join(dir, "dist");

    const result = await runPackagePhase({ systemDir, outDir, version: "0.1.0" });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const release = JSON.parse(readFileSync(path.join(outDir, "release.json"), "utf8"));
    assert.equal(release.system.kind, "virtual");
    assert.equal(release.system.image, "giochi-qemu-aarch64-0.1.0.img");
    assert.equal(release.system.imageSha256, sha256(rootfs));
    assert.equal(release.system.kernel.name, "giochi-qemu-aarch64-0.1.0-Image");
    assert.equal(release.system.kernel.sha256, sha256(kernel));
    assert.equal(isFile(path.join(outDir, release.system.kernel.name)), true);

    // O comando do QEMU tem de citar o kernel e o disco publicados, com o
    // console que o kernel realmente usou.
    assert.equal(release.boot.kernel, release.system.kernel.name);
    assert.equal(release.boot.disk, release.system.image);
    assert.match(release.boot.cmdline, /root=\/dev\/vda/);
    assert.match(release.boot.cmdline, /console=ttyAMA0/);

    const sums = readFileSync(path.join(outDir, "SHA256SUMS"), "utf8").trim().split("\n");
    assert.equal(sums.length, 2, "o manifesto tem de cobrir disco e kernel");

    const readme = readFileSync(path.join(outDir, "README.txt"), "utf8");
    assert.match(readme, /qemu-system-aarch64/);
    assert.match(readme, /-kernel giochi-qemu-aarch64-0\.1\.0-Image/);
    assert.doesNotMatch(readme, /dd if=/, "imagem de VM não se grava em cartão");
  });
});

test("fase package comprime a imagem e o kernel quando pedido", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "qemu-aarch64");
    makeVirtualSystemOutput(systemDir);
    const outDir = path.join(dir, "dist");

    const result = await runPackagePhase({
      systemDir,
      outDir,
      version: "0.1.0",
      compress: "gz",
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const release = JSON.parse(readFileSync(path.join(outDir, "release.json"), "utf8"));
    assert.equal(release.system.image, "giochi-qemu-aarch64-0.1.0.img.gz");
    assert.equal(release.system.kernel.name, "giochi-qemu-aarch64-0.1.0-Image.gz");

    // O hash publicado é o do arquivo comprimido — é ele que o usuário baixa.
    const packed = readFileSync(path.join(outDir, release.system.image));
    assert.equal(release.system.imageSha256, sha256(packed));
    assert.equal(zlib.gunzipSync(packed).toString(), "rootfs ext4 de teste");

    // O cru não fica ao lado: dois arquivos com o mesmo conteúdo dobram o
    // download e convidam a baixar o errado.
    assert.equal(isFile(path.join(outDir, "giochi-qemu-aarch64-0.1.0.img")), false);
  });
});

test("site de alvo virtual linka kernel e traz o comando do QEMU", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "qemu-aarch64");
    makeVirtualSystemOutput(systemDir);
    const distDir = path.join(dir, "dist");
    await runPackagePhase({ systemDir, outDir: distDir, version: "0.1.0" });

    const outDir = path.join(dir, "site");
    const result = generateSite({
      distDir,
      outDir,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const html = readFileSync(result.indexPath, "utf8");
    assert.match(html, /Máquina virtual/);
    assert.match(html, /class="card card-vm"/);
    assert.match(html, /downloads\/qemu-aarch64\/giochi-qemu-aarch64-0\.1\.0-Image/);
    assert.match(html, /qemu-system-aarch64/);
    assert.match(html, /-append &quot;root=\/dev\/vda rw console=ttyAMA0&quot;/);

    // O kernel é um download de verdade, não só um link no HTML.
    assert.equal(
      isFile(path.join(outDir, "downloads", "qemu-aarch64", "giochi-qemu-aarch64-0.1.0-Image")),
      true,
    );
  });
});

test("site de cartão não mostra bloco de QEMU", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "r35s");
    makeSystemOutput(systemDir);
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({ id: "r35s", name: "R35S", arch: "arm64", buildroot: "2024.02" }),
    );
    const distDir = path.join(dir, "dist");
    await runPackagePhase({ systemDir, outDir: distDir, version: "0.1.0" });

    const result = generateSite({
      distDir,
      outDir: path.join(dir, "site"),
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const html = readFileSync(result.indexPath, "utf8");
    assert.doesNotMatch(html, /qemu-system-aarch64/);
    assert.match(html, /Cartão SD/);
  });
});

// ── o que está dentro do rootfs ──────────────────────────────

function binaryAvailable(name) {
  // Cada ferramenta responde a uma flag diferente: `readelf --version`,
  // `debugfs -V`, e o `mkfs.ext4` não tem flag de versão nenhuma (ele imprime o
  // uso e sai com 0). Por isso o teste é "existe e responde", não "responde
  // com --version" — foi assim que a checagem passou a pular sete testes em
  // silêncio.
  for (const flag of ["--version", "-V"]) {
    const result = spawnSync(name, [flag], { stdio: "ignore" });
    if (!result.error && result.status === 0) return true;
  }
  // Sem flag de versão: basta o binário existir.
  const probe = spawnSync(name, [], { stdio: "ignore" });
  return !probe.error;
}

/** ext4 de verdade, populado a partir de uma pasta, sem root. */
function makeExt4(dir, rootContent, { executables = [] } = {}) {
  const source = path.join(dir, "rootdir");
  for (const [relative, content] of Object.entries(rootContent)) {
    write(path.join(source, relative), content);
  }
  // `mkfs.ext4 -d` herda o modo do arquivo de origem: sem o chmod, o serviço
  // entraria no ext4 sem bit de execução. Só o que existe — o teste do mapa
  // vale tanto com as quatro peças quanto sem nenhuma.
  for (const relative of executables) {
    if (existsSync(path.join(source, relative))) chmodSync(path.join(source, relative), 0o755);
  }
  const image = path.join(dir, "rootfs.ext4");
  const result = spawnSync(
    "mkfs.ext4",
    ["-q", "-F", "-b", "1024", "-d", source, image, "16384"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return image;
}

test("readRootfsApps lê o índice de dentro do ext4", (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs")) {
    return t.skip("mkfs.ext4/debugfs ausentes");
  }
  withTempDir((dir) => {
    const index = { schemaVersion: 1, apps: [{ id: "launcher", version: "0.1.0" }] };
    const image = makeExt4(dir, {
      "opt/giochi/apps/index.json": JSON.stringify(index),
      "etc/motd": "oi\n",
    });

    const result = readRootfsApps(image);
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(result.apps, index.apps);
  });
});

test("readRootfsApps não inventa app quando o overlay ficou de fora", (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs")) {
    return t.skip("mkfs.ext4/debugfs ausentes");
  }
  withTempDir((dir) => {
    const image = makeExt4(dir, { "etc/motd": "sem overlay\n" });
    const result = readRootfsApps(image);
    assert.equal(result.ok, false);
    assert.ok(result.reason);
  });
});

test("fase package não anuncia app que não está no rootfs", async (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs")) {
    return t.skip("mkfs.ext4/debugfs ausentes");
  }
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "qemu-aarch64");
    const kernel = Buffer.from("kernel");
    write(path.join(systemDir, "Image"), kernel);
    const rootfsPath = makeExt4(dir, { "etc/motd": "sem overlay\n" });
    writeFileSync(path.join(systemDir, "rootfs.ext4"), readFileSync(rootfsPath));
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({ id: "qemu-aarch64", name: "QEMU", arch: "arm64", buildroot: "2024.02" }),
    );
    write(path.join(systemDir, "build-info.txt"), "buildroot=2024.02\n");
    const rootfsBytes = readFileSync(path.join(systemDir, "rootfs.ext4"));
    write(
      path.join(systemDir, "SHA256SUMS"),
      `${sha256(kernel)}  Image\n${sha256(rootfsBytes)}  rootfs.ext4\n`,
    );

    const appsRoot = path.join(dir, "apps");
    makeRegistry(appsRoot, [makeApp(appsRoot, { id: "launcher" })]);

    const result = await runPackagePhase({
      systemDir,
      appsRoot,
      outDir: path.join(dir, "dist"),
      version: "0.1.0",
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.release.apps.embedded.length, 0);
    assert.equal(result.release.apps.imageVerified, true);
    assert.ok(result.warnings.some((warning) => warning.code === "overlay_ausente"));
  });
});

// ── injeção de overlay no ext4 ───────────────────────────────

test("injectOverlay escreve arquivos com bit de execução", (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs")) {
    return t.skip("mkfs.ext4/debugfs ausentes");
  }
  withTempDir((dir) => {
    const image = path.join(dir, "blank.ext4");
    const rootdir = path.join(dir, "rootdir");
    write(path.join(rootdir, "etc/motd"), "oi\n");
    const made = spawnSync("mkfs.ext4", ["-q", "-F", "-d", rootdir, image, "16384"]);
    assert.equal(made.status, 0, String(made.stderr));

    const overlayDir = path.join(dir, "overlay");
    write(path.join(overlayDir, "opt/giochi/apps/index.json"), '{"schemaVersion":1,"apps":[]}');
    write(path.join(overlayDir, "opt/giochi/apps/launcher/bin/giochi-launcher"), "#!/bin/sh\necho oi\n");

    const result = injectOverlay({ imagePath: image, overlayDir });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.written, 2);

    const index = readFromImage(image, "/opt/giochi/apps/index.json");
    assert.match(String(index), /schemaVersion/);

    const stat = spawnSync("debugfs", ["-R", "stat /opt/giochi/apps/launcher/bin/giochi-launcher", image], {
      encoding: "utf8",
    });
    assert.match(stat.stdout, /Mode:\s+0?755/, "o binário tem de sair executável");
  });
});

test("injectOverlay sobrescreve arquivo que já existe na imagem", (t) => {
  // `debugfs write` recusa sobrescrever do jeito pior: imprime o erro no stderr
  // e SAI COM 0. Confiar no status dava injeção "bem-sucedida" com o conteúdo
  // antigo no lugar — foi assim que o `index.json` de um rootfs com overlay
  // velho continuou anunciando o catálogo anterior.
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs")) {
    return t.skip("mkfs.ext4/debugfs ausentes");
  }
  withTempDir((dir) => {
    const image = path.join(dir, "com-apps.ext4");
    const rootdir = path.join(dir, "rootdir");
    write(path.join(rootdir, "opt/giochi/apps/index.json"), '{"schemaVersion":1,"apps":[{"id":"velho"}]}');
    write(path.join(rootdir, "opt/giochi/apps/velho/bin/tool"), "antigo\n");
    const made = spawnSync("mkfs.ext4", ["-q", "-F", "-d", rootdir, image, "16384"]);
    assert.equal(made.status, 0, String(made.stderr));

    const overlayDir = path.join(dir, "overlay");
    write(path.join(overlayDir, "opt/giochi/apps/index.json"), '{"schemaVersion":1,"apps":[{"id":"novo"}]}');
    write(path.join(overlayDir, "opt/giochi/apps/novo/bin/tool"), "novo mesmo\n");

    const result = injectOverlay({ imagePath: image, overlayDir });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    assert.match(String(readFromImage(image, "/opt/giochi/apps/index.json")), /novo/);
  });
});

test("injectOverlay falha quando a escrita não cabe no ext4", (t) => {
  // Sem checar tamanho, um `write` truncado por disco cheio passa por sucesso.
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs")) {
    return t.skip("mkfs.ext4/debugfs ausentes");
  }
  withTempDir((dir) => {
    const image = path.join(dir, "cheio.ext4");
    const rootdir = path.join(dir, "rootdir");
    write(path.join(rootdir, "etc/motd"), "oi\n");
    const made = spawnSync("mkfs.ext4", ["-q", "-F", "-d", rootdir, image, "8192"]);
    assert.equal(made.status, 0, String(made.stderr));

    // 4 MiB para um ext4 de 8 MiB já com metadados: não cabe.
    const overlayDir = path.join(dir, "overlay");
    write(path.join(overlayDir, "opt/giochi/apps/grande.bin"), Buffer.alloc(4 * 1024 * 1024, 0x61));

    const result = injectOverlay({ imagePath: image, overlayDir });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((error) => ["sem_espaco", "escrita_falhou", "escrita_truncada"].includes(error.code)),
      JSON.stringify(result.errors),
    );
  });
});

test("injectOverlay deixa o ext4 montável, sem inode órfão", (t) => {
  // `debugfs mkdir` num diretório que já existe ALOCA um inode e o deixa
  // órfão. Como `ensureDirectory` repetia o `mkdir` de `/opt/giochi/apps` para
  // cada arquivo do overlay, toda injeção publicava um ext4 que `e2fsck -fn`
  // reprovava — com o build verde.
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs") || !binaryAvailable("e2fsck")) {
    return t.skip("mkfs.ext4/debugfs/e2fsck ausentes");
  }
  withTempDir((dir) => {
    const image = path.join(dir, "sujo.ext4");
    const rootdir = path.join(dir, "rootdir");
    write(path.join(rootdir, "opt/giochi/apps/index.json"), '{"schemaVersion":1,"apps":[]}');
    write(path.join(rootdir, "opt/giochi/apps/launcher/bin/tool"), "antigo\n");
    const made = spawnSync("mkfs.ext4", ["-q", "-F", "-d", rootdir, image, "16384"]);
    assert.equal(made.status, 0, String(made.stderr));

    // Vários arquivos no MESMO diretório: é o que repetia o `mkdir`.
    const overlayDir = path.join(dir, "overlay");
    write(path.join(overlayDir, "opt/giochi/apps/index.json"), '{"schemaVersion":1,"apps":[{"id":"a"}]}');
    for (const nome of ["um", "dois", "tres"]) {
      write(path.join(overlayDir, `opt/giochi/apps/a/bin/${nome}`), "#!/bin/sh\necho a\n");
    }

    const result = injectOverlay({ imagePath: image, overlayDir });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.written, 4);

    // `-fn` não conserta: só relata. Status 0 significa que não há nada a
    // consertar, que é a garantia de que o aparelho vai montar.
    const fsck = spawnSync("e2fsck", ["-fn", image], { encoding: "utf8" });
    assert.equal(fsck.status, 0, `${fsck.stdout}\n${fsck.stderr}`);
  });
});

test("injectOverlay recusa quando falta biblioteca que o app pede", (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs") || !binaryAvailable("readelf")) {
    return t.skip("mkfs.ext4/debugfs/readelf ausentes");
  }
  withTempDir((dir) => {
    const image = path.join(dir, "vazia.ext4");
    const rootdir = path.join(dir, "rootdir");
    write(path.join(rootdir, "etc/motd"), "oi\n");
    assert.equal(spawnSync("mkfs.ext4", ["-q", "-F", "-d", rootdir, image, "16384"]).status, 0);

    // Cópia de um ELF de verdade, que pede libc: a imagem vazia não tem libc.
    const overlayDir = path.join(dir, "overlay");
    mkdirSync(path.join(overlayDir, "opt/giochi/apps/x/bin"), { recursive: true });
    writeFileSync(path.join(overlayDir, "opt/giochi/apps/x/bin/x"), readFileSync("/bin/sh"));

    const result = injectOverlay({ imagePath: image, overlayDir });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === "biblioteca_ausente"));
  });
});

test("injectOverlay recusa imagem que não é ext4 cru", (t) => {
  if (!binaryAvailable("debugfs")) return t.skip("debugfs ausente");
  withTempDir((dir) => {
    const image = path.join(dir, "cartao.img");
    writeFileSync(image, Buffer.alloc(4096, 0)); // setor zero de MBR, sem ext4
    const overlayDir = path.join(dir, "overlay");
    write(path.join(overlayDir, "opt/x"), "x");

    const result = injectOverlay({ imagePath: image, overlayDir });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === "nao_ext4"));
  });
});

test("fase package injeta apps quando pedido e a imagem permite", (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs") || !binaryAvailable("readelf")) {
    return t.skip("mkfs.ext4/debugfs/readelf ausentes");
  }
  return withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "qemu-aarch64");
    const kernel = Buffer.from("kernel de teste");

    // Imagem com o mínimo que o binário do app pede: o próprio `/bin/sh` do
    // host, copiado, e as libs que ele referencia. Recortar isso à mão é
    // frágil; o teste que importa aqui é o caminho feliz da injeção, então o
    // app é um script — sem ELF, sem dependência.
    const rootdir = path.join(dir, "rootdir");
    write(path.join(rootdir, "etc/motd"), "sem apps\n");
    const rootfs = path.join(systemDir, "rootfs.ext4");
    mkdirSync(systemDir, { recursive: true });
    assert.equal(
      spawnSync("mkfs.ext4", ["-q", "-F", "-d", rootdir, rootfs, "32768"]).status,
      0,
    );
    write(path.join(systemDir, "Image"), kernel);
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({
        id: "qemu-aarch64",
        name: "QEMU",
        arch: "arm64",
        buildroot: "2024.02",
        buildrootDefconfig: "qemu_aarch64_virt_defconfig",
      }),
    );
    write(path.join(systemDir, "build-info.txt"), "buildroot=2024.02\n");
    write(
      path.join(systemDir, "SHA256SUMS"),
      `${sha256(kernel)}  Image\n${sha256(readFileSync(rootfs))}  rootfs.ext4\n`,
    );

    const appsRoot = path.join(dir, "apps");
    const app = makeApp(appsRoot, { id: "so-um" });
    write(path.join(app.dir, "bin", "tool"), "#!/bin/sh\necho ok\n");
    makeRegistry(appsRoot, [app]);

    const result = await runPackagePhase({
      systemDir,
      appsRoot,
      outDir: path.join(dir, "dist"),
      version: "0.1.0",
      injectApps: true,
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.release.apps.embedded.length, 1);
    assert.equal(result.release.apps.embedded[0].id, "so-um");
    assert.equal(result.release.apps.imageVerified, true);

    // O app está mesmo dentro do arquivo publicado, não só no manifesto.
    const inside = readFromImage(
      path.join(dir, "dist", result.release.system.image),
      "/opt/giochi/apps/so-um/bin/tool",
    );
    assert.match(String(inside), /echo ok/);
  });
});

test("fase package injeta quando a imagem traz um catálogo antigo", (t) => {
  // Medido no QEMU: o rootfs tinha 2 apps de um build anterior e a injeção foi
  // pulada porque "já tinha app". Os 4 jogos novos do catálogo nunca entraram e
  // o manifesto anunciou 2. Ter app não é prova de estar completo — o critério
  // é o catálogo.
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs") || !binaryAvailable("readelf")) {
    return t.skip("mkfs.ext4/debugfs/readelf ausentes");
  }
  return withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "qemu-aarch64");
    const kernel = Buffer.from("kernel de teste");

    // O rootfs já chega com um app de um build antigo.
    const rootdir = path.join(dir, "rootdir");
    write(
      path.join(rootdir, "opt/giochi/apps/index.json"),
      JSON.stringify({ schemaVersion: 1, apps: [{ id: "antigo", version: "0.0.1" }] }),
    );
    write(path.join(rootdir, "opt/giochi/apps/antigo/bin/tool"), "#!/bin/sh\necho velho\n");

    const rootfs = path.join(systemDir, "rootfs.ext4");
    mkdirSync(systemDir, { recursive: true });
    assert.equal(spawnSync("mkfs.ext4", ["-q", "-F", "-d", rootdir, rootfs, "32768"]).status, 0);
    write(path.join(systemDir, "Image"), kernel);
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({
        id: "qemu-aarch64",
        name: "QEMU",
        arch: "arm64",
        buildroot: "2024.02",
        buildrootDefconfig: "qemu_aarch64_virt_defconfig",
      }),
    );
    write(path.join(systemDir, "build-info.txt"), "buildroot=2024.02\n");
    write(
      path.join(systemDir, "SHA256SUMS"),
      `${sha256(kernel)}  Image\n${sha256(readFileSync(rootfs))}  rootfs.ext4\n`,
    );

    const appsRoot = path.join(dir, "apps");
    const novo = makeApp(appsRoot, { id: "jogo-novo" });
    makeRegistry(appsRoot, [novo]);

    const result = await runPackagePhase({
      systemDir,
      appsRoot,
      outDir: path.join(dir, "dist"),
      version: "0.1.0",
      injectApps: true,
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.ok(
      result.warnings.some((w) => w.code === "apps_incompletos"),
      JSON.stringify(result.warnings),
    );

    // O app do catálogo entrou de verdade no arquivo publicado…
    const image = path.join(dir, "dist", result.release.system.image);
    assert.match(String(readFromImage(image, "/opt/giochi/apps/jogo-novo/bin/tool")), /echo ok/);
    // …e o `index.json` passou a anunciar o catálogo, não o overlay velho.
    const index = String(readFromImage(image, "/opt/giochi/apps/index.json"));
    assert.match(index, /jogo-novo/);
    assert.doesNotMatch(index, /"antigo"/);
  });
});

// ── leitura do ext4 dentro de imagem particionada ────────────
/** Imagem de cartão mínima: tabela MBR + uma partição ext4 com conteúdo. */
function makeCardImage(dir, rootContent, { executables = [] } = {}) {
  const rootdir = path.join(dir, "rootdir");
  for (const [relative, content] of Object.entries(rootContent)) {
    write(path.join(rootdir, relative), content);
  }
  for (const relative of executables) {
    if (existsSync(path.join(rootdir, relative))) chmodSync(path.join(rootdir, relative), 0o755);
  }
  const partition = path.join(dir, "particao.img");
  assert.equal(
    spawnSync("mkfs.ext4", ["-q", "-F", "-b", "1024", "-d", rootdir, partition, "8192"]).status,
    0,
  );

  const image = path.join(dir, "cartao.img");
  // 1 MiB de folga + partição de 8 MiB: 18 MiB no total.
  assert.equal(spawnSync("truncate", ["-s", "18M", image]).status, 0);
  const table = spawnSync(
    "sfdisk",
    [image],
    { input: "label: dos\nstart=2048, size=16384, type=83\n", encoding: "utf8" },
  );
  assert.equal(table.status, 0, table.stderr);

  const copy = spawnSync("dd", [
    `if=${partition}`,
    `of=${image}`,
    "bs=512",
    "seek=2048",
    "conv=notrunc",
    "status=none",
  ]);
  assert.equal(copy.status, 0);
  return image;
}

test("readAppsFromCardImage lê o índice atrás da tabela de partição", (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs") || !binaryAvailable("sfdisk")) {
    return t.skip("mkfs.ext4/debugfs/sfdisk ausentes");
  }
  withTempDir((dir) => {
    const index = { schemaVersion: 1, apps: [{ id: "launcher", version: "0.1.0" }] };
    const image = makeCardImage(dir, { "opt/giochi/apps/index.json": JSON.stringify(index) });

    const result = readAppsFromCardImage(image);
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.inspected, true);
    assert.deepEqual(result.apps, index.apps);
  });
});

test("readAppsFromCardImage não inventa app quando o overlay não entrou", (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs") || !binaryAvailable("sfdisk")) {
    return t.skip("mkfs.ext4/debugfs/sfdisk ausentes");
  }
  withTempDir((dir) => {
    const image = makeCardImage(dir, { "etc/motd": "sem overlay\n" });
    const result = readAppsFromCardImage(image);
    assert.equal(result.ok, false);
    assert.equal(result.inspected, true);
    assert.ok(result.reason);
  });
});

test("fase package não anuncia app do catálogo em cartão sem overlay", (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs") || !binaryAvailable("sfdisk")) {
    return t.skip("mkfs.ext4/debugfs/sfdisk ausentes");
  }
  return withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "r35s");
    const image = makeCardImage(systemDir, { "etc/motd": "sem overlay\n" });
    const bytes = readFileSync(image);
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({ id: "r35s", name: "R35S", arch: "arm64", buildroot: "2024.02" }),
    );
    write(path.join(systemDir, "build-info.txt"), "buildroot=2024.02\n");
    write(path.join(systemDir, "SHA256SUMS"), `${sha256(bytes)}  cartao.img\n`);

    const appsRoot = path.join(dir, "apps");
    makeRegistry(appsRoot, [makeApp(appsRoot, { id: "launcher" })]);

    const result = await runPackagePhase({
      systemDir,
      appsRoot,
      outDir: path.join(dir, "dist"),
      version: "0.1.0",
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    // O catálogo tem 1 app; a imagem não tem nenhum. O manifesto diz zero.
    assert.equal(result.release.apps.embedded.length, 0);
    assert.equal(result.release.apps.imageVerified, true);
    assert.ok(result.warnings.some((warning) => warning.code === "overlay_ausente"));
  });
});

// ── injeção em imagem de cartão ──────────────────────────────

/** `true` se o binário existe nesta máquina (qualquer flag de versão serve). */
function temFerramenta(nome) {
  for (const flag of ["--version", "-V"]) {
    const r = spawnSync(nome, [flag], { stdio: "ignore" });
    if (!r.error && r.status === 0) return true;
  }
  return !spawnSync(nome, [], { stdio: "ignore" }).error;
}

const CARTAO_OK = () =>
  ["mkfs.ext4", "debugfs", "sfdisk", "dd", "e2fsck"].every(temFerramenta);

test("injectIntoCardImage altera a partição sem tocar na tabela", (t) => {
  if (!CARTAO_OK()) return t.skip("mkfs.ext4/debugfs/sfdisk/e2fsck ausentes");
  withTempDir((dir) => {
    const index = { schemaVersion: 1, apps: [{ id: "launcher", version: "0.1.0" }] };
    const image = makeCardImage(dir, { "etc/motd": "sem overlay\n" });
    const antes = readFileSync(image);

    const overlayDir = path.join(dir, "overlay");
    write(path.join(overlayDir, "opt/giochi/apps/index.json"), JSON.stringify(index));
    write(path.join(overlayDir, "opt/giochi/apps/x/bin/tool"), "#!/bin/sh\necho oi\n");

    const resultado = injectIntoCardImage({ imagePath: image, overlayDir });
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));

    // A tabela de partição continua idêntica, byte a byte no primeiro setor.
    const depois = readFileSync(image);
    assert.equal(depois.length, antes.length, "a imagem não pode mudar de tamanho");
    assert.deepEqual(
      [...depois.subarray(0, 512)],
      [...antes.subarray(0, 512)],
      "o setor do MBR não pode ser tocado",
    );
    assert.deepEqual(listPartitions(image).partitions, [
      { start: 2048, size: 16384, type: "83" },
    ]);

    // E o índice está legível pela porta de quem usa a imagem.
    const read = readAppsFromCardImage(image);
    assert.equal(read.ok, true, read.reason);
    assert.equal(read.apps.length, 1);
  });
});

test("injectIntoCardImage recusa overlay maior que o espaço livre", (t) => {
  if (!CARTAO_OK()) return t.skip("mkfs.ext4/debugfs/sfdisk/e2fsck ausentes");
  withTempDir((dir) => {
    const image = makeCardImage(dir, { "etc/motd": "oi\n" });

    // 8 MiB de partição; o overlay pede 12 MiB.
    const overlayDir = path.join(dir, "overlay");
    mkdirSync(overlayDir, { recursive: true });
    writeFileSync(path.join(overlayDir, "grande.bin"), Buffer.alloc(12 * 1024 * 1024));

    const resultado = injectIntoCardImage({ imagePath: image, overlayDir });
    assert.equal(resultado.ok, false);
    assert.ok(
      resultado.errors.some((e) => e.code === "sem_espaco"),
      `esperava sem_espaco, veio: ${JSON.stringify(resultado.errors)}`,
    );
  });
});

test("fase package injeta apps em cartão quando pedido", (t) => {
  if (!CARTAO_OK()) return t.skip("mkfs.ext4/debugfs/sfdisk/e2fsck ausentes");
  return withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "r35s");
    const image = makeCardImage(systemDir, { "etc/motd": "sem overlay\n" });
    const bytes = readFileSync(image);
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({ id: "r35s", name: "R35S", arch: "arm64", buildroot: "2024.02" }),
    );
    write(path.join(systemDir, "build-info.txt"), "buildroot=2024.02\n");
    write(path.join(systemDir, "SHA256SUMS"), `${sha256(bytes)}  cartao.img\n`);

    const appsRoot = path.join(dir, "apps");
    const app = makeApp(appsRoot, { id: "launcher" });
    // Script em vez de ELF: a checagem de biblioteca não tem o que exigir, e o
    // caminho de cartão é o que este teste cobre.
    write(path.join(app.dir, "bin", "tool"), "#!/bin/sh\necho ok\n");
    makeRegistry(appsRoot, [app]);

    const result = await runPackagePhase({
      systemDir,
      appsRoot,
      outDir: path.join(dir, "dist"),
      version: "0.1.0",
      injectApps: true,
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.release.device.kind, "card");
    assert.equal(result.release.apps.embedded.length, 1);
    assert.equal(result.release.apps.imageVerified, true);
    assert.ok(result.warnings.some((w) => w.code === "apps_injetados"));

    // O arquivo publicado é o que tem os apps — não a cópia feita antes.
    const publicado = path.join(dir, "dist", result.release.system.image);
    const lido = readAppsFromCardImage(publicado);
    assert.equal(lido.ok, true, lido.reason);
    assert.equal(lido.apps[0].id, "launcher");
  });
});

test("fase package recusa injeção em cartão comprimido", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "dev");
    const cru = Buffer.from("imagem crua");
    write(path.join(systemDir, "sdcard.img.xz"), Buffer.from("xz"));
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({ id: "dev", name: "Dev", arch: "arm64", buildroot: "2024.02" }),
    );
    write(path.join(systemDir, "build-info.txt"), "buildroot=2024.02\n");
    write(path.join(systemDir, "SHA256SUMS"), `${sha256(Buffer.from("xz"))}  sdcard.img.xz\n`);
    void cru;

    const appsRoot = path.join(dir, "apps");
    makeRegistry(appsRoot, [makeApp(appsRoot, { id: "launcher" })]);

    const result = await runPackagePhase({
      systemDir,
      appsRoot,
      outDir: path.join(dir, "dist"),
      version: "0.1.0",
      injectApps: true,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "cartao_comprimido"));
  });
});

// ── README da release: o comando tem de servir para o arquivo publicado ──

test("README de cartão comprimido manda descomprimir antes do dd", async () => {
  // Defeito medido no primeiro empacotamento do X55 (14/11/2026): o README
  // dizia `dd if=giochi-...img.xz of=/dev/sdX`. Seguir isso grava bytes de xz
  // no cartão e produz um aparelho que não inicializa — e o texto está no
  // arquivo que a pessoa abre justamente para não errar.
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "cartao");
    const { image } = makeSystemOutput(systemDir);
    // Device de CARTÃO: o `makeSystemOutput` escreve `qemu-aarch64`, que é
    // detectado como alvo virtual e cairia no ramo do QEMU.
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({ id: "cartao-teste", name: "Cartão de teste", arch: "arm64", buildroot: "2024.02" }),
    );
    write(
      path.join(systemDir, "SHA256SUMS"),
      [
        `${sha256(image)}  test.img`,
        `${sha256(readFileSync(path.join(systemDir, "device.json")))}  device.json`,
        `${sha256(readFileSync(path.join(systemDir, "build-info.txt")))}  build-info.txt`,
        "",
      ].join("\n"),
    );
    const outDir = path.join(dir, "dist");

    const result = await runPackagePhase({
      systemDir,
      outDir,
      version: "1.0.0",
      compress: "gz",
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const readme = readFileSync(path.join(outDir, "README.txt"), "utf8");
    assert.match(readme, /gzip -dk giochi-cartao-teste-1\.0\.0\.img\.gz/, "falta o passo de descomprimir");
    assert.match(readme, /dd if=giochi-cartao-teste-1\.0\.0\.img of=/, "o dd tem de usar o .img cru");
    assert.doesNotMatch(readme, /dd if=\S+\.(gz|xz|zst) of=/, "dd nunca aponta para o comprimido");
  });
});

test("README de cartão cru não inventa passo de descompressão", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "cartao");
    const { image } = makeSystemOutput(systemDir);
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({ id: "cartao-teste", name: "Cartão de teste", arch: "arm64", buildroot: "2024.02" }),
    );
    write(
      path.join(systemDir, "SHA256SUMS"),
      [
        `${sha256(image)}  test.img`,
        `${sha256(readFileSync(path.join(systemDir, "device.json")))}  device.json`,
        `${sha256(readFileSync(path.join(systemDir, "build-info.txt")))}  build-info.txt`,
        "",
      ].join("\n"),
    );
    const outDir = path.join(dir, "dist");
    await runPackagePhase({ systemDir, outDir, version: "1.0.0" });

    const readme = readFileSync(path.join(outDir, "README.txt"), "utf8");
    assert.doesNotMatch(readme, /gzip -dk|xz -dk|zstd -d/);
    assert.match(readme, /dd if=giochi-cartao-teste-1\.0\.0\.img of=/);
  });
});

test("site avisa para descomprimir antes de gravar no cartão", async () => {
  // O botão baixa um `.img.xz`. Quem gravar isso com `dd` produz um cartão que
  // não inicializa — e o aviso tem de estar no card, não só na seção "Gravar",
  // que fica abaixo e nem todo mundo rola até lá.
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "cartao");
    const { image } = makeSystemOutput(systemDir);
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({ id: "cartao-teste", name: "Cartão", arch: "arm64", buildroot: "2024.02" }),
    );
    write(
      path.join(systemDir, "SHA256SUMS"),
      [
        `${sha256(image)}  test.img`,
        `${sha256(readFileSync(path.join(systemDir, "device.json")))}  device.json`,
        `${sha256(readFileSync(path.join(systemDir, "build-info.txt")))}  build-info.txt`,
        "",
      ].join("\n"),
    );

    const distDir = path.join(dir, "dist");
    await runPackagePhase({ systemDir, outDir: distDir, version: "1.0.0", compress: "xz" });

    const result = generateSite({
      distDir,
      outDir: path.join(dir, "site"),
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const html = readFileSync(result.indexPath, "utf8");
    assert.ok(html.includes(TEXTOS[PADRAO]["card.hintTitle"]), "aviso de descompressão presente");
    assert.match(html, /xz -dk giochi-cartao-teste-1\.0\.0\.img\.xz/);
  });
});

test("site de cartão cru não mostra aviso de descompressão", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "cartao");
    const { image } = makeSystemOutput(systemDir);
    write(
      path.join(systemDir, "device.json"),
      JSON.stringify({ id: "cartao-teste", name: "Cartão", arch: "arm64", buildroot: "2024.02" }),
    );
    write(
      path.join(systemDir, "SHA256SUMS"),
      [
        `${sha256(image)}  test.img`,
        `${sha256(readFileSync(path.join(systemDir, "device.json")))}  device.json`,
        `${sha256(readFileSync(path.join(systemDir, "build-info.txt")))}  build-info.txt`,
        "",
      ].join("\n"),
    );

    const distDir = path.join(dir, "dist");
    await runPackagePhase({ systemDir, outDir: distDir, version: "1.0.0" });

    const result = generateSite({
      distDir,
      outDir: path.join(dir, "site"),
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
    });
    const html = readFileSync(result.indexPath, "utf8");
    assert.ok(!html.includes(TEXTOS[PADRAO]["card.hintTitle"]), "cartão cru não avisa descompressão");
  });
});

// ── catálogo derivado (repositório de jogos sem apps.json) ──

/**
 * Repositório de jogo como o GIOCHI-GAMES é de verdade: a pasta do jogo tem
 * `metadata.json` + `bin/` e o repositório NÃO tem `apps.json`. O `makeApp`
 * acima já escreve exatamente esses arquivos, então derivar é só não chamar
 * `makeRegistry`.
 */
function makeJogo(gamesRoot, { folder, slug, binEmpty = false, metadata = {}, forge = null }) {
  const dir = path.join(gamesRoot, folder);
  write(
    path.join(dir, "metadata.json"),
    JSON.stringify(
      {
        title: folder,
        developer: "Teste",
        version: "1.0.0",
        arch: "aarch64",
        runtime: "native",
        entrypoint: "bin/jogo",
        license: "Proprietary",
        ...metadata,
        ...(slug === undefined ? {} : { slug }),
      },
      null,
      2,
    ),
  );
  if (!binEmpty) write(path.join(dir, "bin", "jogo"), "#!/bin/sh\necho jogo\n");
  write(path.join(dir, "capa.png"), fakePng(320, 320));
  if (forge) write(path.join(dir, "forge.json"), JSON.stringify(forge, null, 2));
  return dir;
}

test("catálogo derivado: pastas com metadata.json viram apps sem apps.json", async () => {
  // O contrato é um `apps.json`, mas o repositório de jogos nasceu sem ele.
  // Derivar as pastas é o que permite embutir jogo sem copiar pasta para o
  // catálogo do Giochi app.
  await withTempDirAsync(async (dir) => {
    const gamesRoot = path.join(dir, "games");
    makeJogo(gamesRoot, { folder: "cobrinha" });
    makeJogo(gamesRoot, { folder: "neon-drift" });

    const resultado = await loadApps(gamesRoot);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.embedded.map((a) => a.id).sort(), ["cobrinha", "neon-drift"]);
    assert.ok(
      resultado.warnings.some((w) => w.code === "catalogo_derivado"),
      JSON.stringify(resultado.warnings),
    );
  });
});

test("catálogo derivado: apps.json presente continua mandando", async () => {
  // A derivação é um plano B. Com `apps.json` no lugar, o arquivo decide —
  // inclusive para deixar uma pasta de fora.
  await withTempDirAsync(async (dir) => {
    makeJogo(dir, { folder: "cobrinha" });
    makeJogo(dir, { folder: "experimento" });
    makeRegistry(dir, [{ id: "cobrinha", status: "ready", distribution: "image" }]);

    const resultado = await loadApps(dir);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.embedded.map((a) => a.id), ["cobrinha"]);
    assert.equal(
      resultado.warnings.some((w) => w.code === "catalogo_derivado"),
      false,
    );
  });
});

test("catálogo derivado: só o primeiro nível é varrido", async () => {
  // `target/`, `vendor/` e `crates/` existem nos repositórios de jogo e não são
  // apps. Sem a regra de um nível, o build acharia app dentro de cache.
  await withTempDirAsync(async (dir) => {
    makeJogo(dir, { folder: "cobrinha" });
    makeJogo(path.join(dir, "target"), { folder: "release" });

    const resultado = await loadApps(dir);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.embedded.map((a) => a.id), ["cobrinha"]);
  });
});

test("catálogo derivado: pasta sem bin/ é scaffold e é pulada", async () => {
  // "ainda em fase de estruturação" não pode derrubar o release: o jogo sem
  // binário exportado é pulado com aviso, não é erro.
  await withTempDirAsync(async (dir) => {
    makeJogo(dir, { folder: "pronto" });
    makeJogo(dir, { folder: "rascunho", binEmpty: true });

    const resultado = await loadApps(dir);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.embedded.map((a) => a.id), ["pronto"]);
    assert.deepEqual(resultado.skipped.map((s) => s.id), ["rascunho"]);
    assert.match(resultado.skipped[0].reason, /scaffold/);
  });
});

test("catálogo derivado: metadata.slug vira o id do app", async () => {
  // O id vira nome de pasta em `/opt/giochi/apps/<id>`. O `slug` é o nome
  // estável que o jogo escolheu; a pasta é detalhe de organização.
  await withTempDirAsync(async (dir) => {
    makeJogo(dir, { folder: "Giochi Defender", slug: "giochi-defender" });

    const resultado = await loadApps(dir);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.embedded.map((a) => a.id), ["giochi-defender"]);
    assert.equal(resultado.embedded[0].folder, "Giochi Defender");
  });
});

test("catálogo derivado: forge.json decide a distribuição quando metadata omite", async () => {
  await withTempDirAsync(async (dir) => {
    makeJogo(dir, { folder: "loja", forge: { distribution: "store" } });

    const resultado = await loadApps(dir);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.external.map((a) => a.id), ["loja"]);
  });
});

test("catálogo derivado: sem apps.json e sem pasta nenhuma não é erro", async () => {
  // O repositório de jogos pode estar vazio enquanto está sendo estruturado.
  await withTempDirAsync(async (dir) => {
    mkdirSync(path.join(dir, "target"), { recursive: true });

    const resultado = await loadApps(dir);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.embedded, []);
    assert.ok(resultado.warnings.some((w) => w.code === "catalogo_vazio"));
  });
});

test("catálogo derivado: .gitkeep não conta como binário nem entra na imagem", async () => {
  // Os jogos versionam `bin/.gitkeep` para a pasta existir no Git. Ele é
  // marcador de repositório, não app: com só ele, o jogo é `scaffold`; com ele
  // e um binário, o `.gitkeep` não pode ser copiado para a imagem.
  await withTempDirAsync(async (dir) => {
    makeJogo(dir, { folder: "so-marcador", binEmpty: true });
    write(path.join(dir, "so-marcador", "bin", ".gitkeep"), "");
    makeJogo(dir, { folder: "com-marcador" });
    write(path.join(dir, "com-marcador", "bin", ".gitkeep"), "");

    const resultado = await loadApps(dir);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.embedded.map((a) => a.id), ["com-marcador"]);
    assert.deepEqual(resultado.skipped.map((s) => s.id), ["so-marcador"]);
    assert.deepEqual(resultado.embedded[0].files, ["bin/jogo"]);
  });
});

// ── mais de um catálogo de apps ─────────────────────────────

test("loadAppsFromRoots junta catálogos de repositórios diferentes", async () => {
  // O caso real: launcher no catálogo do Giochi app, jogos no catálogo do
  // repositório de jogos. Sem isto, embutir um jogo exigiria copiar a pasta
  // dele para o outro repositório.
  await withTempDirAsync(async (dir) => {
    const launcherRoot = path.join(dir, "app");
    const jogosRoot = path.join(dir, "jogos-apps");

    makeRegistry(launcherRoot, [makeApp(launcherRoot, { id: "launcher" })]);
    makeRegistry(jogosRoot, [
      makeApp(jogosRoot, { id: "cobrinha" }),
      makeApp(jogosRoot, { id: "loja-gpl", distribution: "store", license: "GPL-3.0-only" }),
    ]);

    const resultado = await loadAppsFromRoots([launcherRoot, jogosRoot]);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(
      resultado.embedded.map((a) => a.id).sort(),
      ["cobrinha", "launcher"],
    );
    assert.deepEqual(resultado.external.map((a) => a.id), ["loja-gpl"]);
  });
});

test("loadAppsFromRoots recusa id repetido entre catálogos", async () => {
  // Dois apps com o mesmo id escreveriam em `/opt/giochi/apps/<id>`: um apagaria
  // o outro, e o `index.json` anunciaria os dois. Erro, não "o último vence".
  await withTempDirAsync(async (dir) => {
    const a = path.join(dir, "a");
    const b = path.join(dir, "b");
    makeRegistry(a, [makeApp(a, { id: "launcher" })]);
    makeRegistry(b, [makeApp(b, { id: "launcher" })]);

    const resultado = await loadAppsFromRoots([a, b]);
    assert.equal(resultado.ok, false);
    assert.ok(
      resultado.errors.some((e) => e.code === "id_duplicado"),
      JSON.stringify(resultado.errors),
    );
  });
});

test("fase apps monta um overlay só com dois catálogos", async () => {
  await withTempDirAsync(async (dir) => {
    const a = path.join(dir, "a");
    const b = path.join(dir, "b");
    makeRegistry(a, [makeApp(a, { id: "launcher" })]);
    makeRegistry(b, [makeApp(b, { id: "cobrinha" })]);

    const outDir = path.join(dir, "staging");
    const resultado = await runAppsPhase({ appsRoots: [a, b], outDir });
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));

    const appsDir = path.join(outDir, "rootfs-overlay", "opt", "giochi", "apps");
    const index = JSON.parse(readFileSync(path.join(appsDir, "index.json"), "utf8"));
    assert.deepEqual(index.apps.map((x) => x.id).sort(), ["cobrinha", "launcher"]);
    assert.equal(isFile(path.join(appsDir, "launcher", "bin", "tool")), true);
    assert.equal(isFile(path.join(appsDir, "cobrinha", "bin", "tool")), true);
  });
});

test("fase package inclui apps de catálogos diferentes no manifesto", async () => {
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "dev");
    makeSystemOutput(systemDir);
    const a = path.join(dir, "a");
    const b = path.join(dir, "b");
    makeRegistry(a, [makeApp(a, { id: "launcher" })]);
    makeRegistry(b, [makeApp(b, { id: "cobrinha" })]);

    const resultado = await runPackagePhase({
      systemDir,
      appsRoots: [a, b],
      outDir: path.join(dir, "dist"),
      version: "1.0.0",
    });
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(
      resultado.release.apps.embedded.map((x) => x.id).sort(),
      ["cobrinha", "launcher"],
    );
  });
});

test("o CLI aceita --apps repetido e separado por vírgula", () => {
  // O `parseArgs` guarda só o último valor de uma flag repetida — por isso há
  // um coletor dedicado. Este teste lê o código do CLI porque spawnar falha sob
  // o sandbox (ver o cabeçalho deste arquivo); a lógica em si está coberta
  // pelos testes de `loadAppsFromRoots` acima.
  const fonte = readFileSync(path.join(ROOT, "scripts", "assemble.mjs"), "utf8");
  assert.match(fonte, /function coletarApps/, "o coletor tem de existir");
  assert.match(fonte, /split\(","\)/, "aceita vírgula");
  assert.match(fonte, /runAppsPhase\(\{ appsRoots/, "a fase apps recebe as raízes");
  assert.match(fonte, /runPackagePhase\(\{[\s\S]*?appsRoots:/, "a fase package também");
});

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

// Funções que existem nas expressões do GitHub Actions. A lista é a da
// documentação de `expressions`; qualquer nome fora dela invalida o arquivo
// INTEIRO — e o GitHub reage criando uma execução sem nenhum job, com a
// mensagem escondida no HTML. Foi assim que uma `replace()` (que não existe)
// derrubou todos os releases sem aparecer em lugar nenhum.
const FUNCOES_DO_ACTIONS = new Set([
  "contains", "startswith", "endswith", "format", "join", "tojson", "fromjson",
  "hashfiles", "success", "always", "cancelled", "failure",
]);

/**
 * Devolve o corpo de cada `${{ … }}` do texto, respeitando aninhamento de
 * chaves e aspas — `format('["{0}"]', x)` não pode terminar no `}` do `{0}`.
 */
function expressoes(fonte) {
  const corpos = [];
  for (let i = fonte.indexOf("${{"); i !== -1; i = fonte.indexOf("${{", i + 1)) {
    let profundidade = 0;
    let aspa = null;
    for (let j = i + 3; j < fonte.length; j += 1) {
      const c = fonte[j];
      if (aspa) {
        if (c === aspa) aspa = null;
      } else if (c === "'" || c === '"') {
        aspa = c;
      } else if (c === "{") {
        profundidade += 1;
      } else if (c === "}") {
        if (profundidade === 0) {
          if (fonte[j + 1] === "}") {
            corpos.push(fonte.slice(i + 3, j));
            i = j + 1;
            break;
          }
        } else {
          profundidade -= 1;
        }
      }
    }
  }
  return corpos;
}

function funcoesInexistentes(fonte) {
  const achadas = [];
  for (const corpo of expressoes(fonte)) {
    for (const m of corpo.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
      const nome = m[1].toLowerCase();
      if (!FUNCOES_DO_ACTIONS.has(nome)) achadas.push(m[1]);
    }
  }
  return achadas;
}

test("as expressões dos workflows só usam funções que o Actions tem", () => {
  const dir = path.join(ROOT, ".github", "workflows");
  const arquivos = readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  assert.ok(arquivos.length > 0, "tem de haver workflow para conferir");
  for (const arquivo of arquivos) {
    const fonte = readFileSync(path.join(dir, arquivo), "utf8");
    assert.deepEqual(
      funcoesInexistentes(fonte),
      [],
      `${arquivo}: função sem equivalente no Actions invalida o arquivo inteiro`,
    );
  }
});

test("o extrator de expressões entende chave aninhada", () => {
  const corpos = expressoes(
    "a: ${{ format('[\"{0}\"]', needs.x.outputs.y) }} b: ${{ fromJSON(z) }}",
  );
  assert.equal(corpos.length, 2);
  assert.match(corpos[0], /format\('\["\{0\}"\]'/);
  assert.match(corpos[1], /fromJSON\(z\)/);
});

test("a matriz do release sai pronta do discover, sem função inventada", () => {
  // O defeito medido: a matriz montava o JSON dentro da expressão, com
  // `replace()`. Aqui o contrato é o oposto — o JSON é um output do job.
  const fonte = readFileSync(path.join(ROOT, ".github", "workflows", "release.yml"), "utf8");
  assert.match(fonte, /device:\s*\$\{\{\s*fromJSON\(needs\.discover\.outputs\.devices_json\)\s*\}\}/);
  assert.match(fonte, /devices_json=\$JSON/);
});

test("o release publica a página como arquivo no branch, sem depender do Pages", () => {
  // A página é UM `index.html` na raiz, e o GitHub Pages publica o repositório:
  // não há job de deploy, nem artefato de site, nem `build_type` a exigir. Se
  // alguém reintroduzir um deploy que depende de configuração, este teste cai.
  const fonte = readFileSync(path.join(ROOT, ".github", "workflows", "release.yml"), "utf8");
  assert.match(fonte, /build-site\.mjs --dist dist --single-file --out index\.html/);
  assert.match(fonte, /git checkout -B main origin\/main/);
  assert.match(fonte, /commit -m "site: página de download/);
  assert.doesNotMatch(fonte, /actions\/deploy-pages/);
  assert.doesNotMatch(fonte, /upload-pages-artifact/);
});

test("fase apps leva os diretórios de dados do app, e só eles", async () => {
  // Cada um destes foi descoberto no boot do QEMU, com o app falhando:
  // `assets/` deixava o jogo sem textura, `config/` fazia o tower morrer com
  // "não consegui ler config/classes.ron". `target/` e `src/` existem para
  // desenvolver, não para rodar — e são gigabytes.
  await withTempDirAsync(async (dir) => {
    const root = path.join(dir, "jogos");
    const appDir = makeJogo(root, { folder: "com-dados" });
    write(path.join(appDir, "assets", "texturas", "chao.bmp"), "BMP");
    write(path.join(appDir, "config", "classes.ron"), "(classes: [])");
    write(path.join(appDir, "target", "debug", "build.o"), "lixo");
    write(path.join(appDir, "src", "main.rs"), "fn main() {}");
    write(path.join(appDir, "vendor", "serde", "lib.rs"), "//");

    const resultado = await runAppsPhase({ appsRoots: [root], outDir: path.join(dir, "out") });
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));

    const overlay = path.join(dir, "out", "rootfs-overlay", "opt", "giochi", "apps", "com-dados");
    assert.equal(isFile(path.join(overlay, "bin", "jogo")), true);
    assert.equal(isFile(path.join(overlay, "assets", "texturas", "chao.bmp")), true);
    assert.equal(isFile(path.join(overlay, "config", "classes.ron")), true);
    assert.equal(isFile(path.join(overlay, "target", "debug", "build.o")), false);
    assert.equal(isFile(path.join(overlay, "src", "main.rs")), false);
    assert.equal(isFile(path.join(overlay, "vendor", "serde", "lib.rs")), false);
    assert.deepEqual(
      [...resultado.apps.embedded[0].files].sort(),
      ["assets/texturas/chao.bmp", "bin/jogo", "config/classes.ron"],
    );
  });
});

test("fase apps copia exatamente o que o manifesto lista, sem .gitkeep", async () => {
  // O overlay copiava a pasta `bin/` inteira, então o `.gitkeep` dos jogos ia
  // para dentro do ext4 mesmo não estando em `files` — a imagem divergia do
  // que ela mesma anunciava.
  await withTempDirAsync(async (dir) => {
    const root = path.join(dir, "jogos");
    const appDir = makeJogo(root, { folder: "com-marcador" });
    write(path.join(appDir, "bin", ".gitkeep"), "");

    const resultado = await runAppsPhase({ appsRoots: [root], outDir: path.join(dir, "out") });
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));

    const overlay = path.join(dir, "out", "rootfs-overlay", "opt", "giochi", "apps", "com-marcador");
    assert.equal(isFile(path.join(overlay, "bin", "jogo")), true);
    assert.equal(isFile(path.join(overlay, "bin", ".gitkeep")), false);
  });
});


// ── anexos da release ───────────────────────────────────────

function makeReleaseDir(distDir, devices) {
  for (const device of devices) {
    const dir = path.join(distDir, device);
    write(path.join(dir, "SHA256SUMS"), `abc  giochi-${device}.img.xz\n`);
    write(path.join(dir, "README.txt"), "Checksum:\n  sha256sum -c SHA256SUMS\n");
    write(path.join(dir, "release.json"), JSON.stringify({ device: { id: device } }));
    write(path.join(dir, `giochi-${device}.img.xz`), "xz");
  }
}

test("anexos de dois aparelhos não colidem no nível da release", () => {
  // Medido na v0.1.1: `dist/<device>/SHA256SUMS` chegava à release achatado e
  // o segundo aparelho sobrescrevia o primeiro. O publicado tinha só uma
  // linha, e metade dos usuários não conseguia conferir o download.
  withTempDir((dir) => {
    makeReleaseDir(dir, ["powkiddy-x55", "qemu-aarch64"]);
    const resultado = flattenReleaseAssets(dir);

    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.devices, ["powkiddy-x55", "qemu-aarch64"]);
    assert.deepEqual(resultado.attachments, [
      "powkiddy-x55-SHA256SUMS",
      "powkiddy-x55-README.txt",
      "powkiddy-x55-release.json",
      "qemu-aarch64-SHA256SUMS",
      "qemu-aarch64-README.txt",
      "qemu-aarch64-release.json",
    ].sort());

    const nomes = walk(dir).map((f) => path.basename(f));
    assert.equal(nomes.length, new Set(nomes).size, "nenhum nome-base se repete");
  });
});

test("cada SHA256SUMS desdobrado conserva as próprias linhas", () => {
  withTempDir((dir) => {
    makeReleaseDir(dir, ["a", "b"]);
    write(path.join(dir, "a", "SHA256SUMS"), "aaa  giochi-a.img.xz\n");
    write(path.join(dir, "b", "SHA256SUMS"), "bbb  giochi-b.img.xz\n");

    assert.equal(flattenReleaseAssets(dir).ok, true);
    assert.equal(readFileSync(path.join(dir, "a-SHA256SUMS"), "utf8"), "aaa  giochi-a.img.xz\n");
    assert.equal(readFileSync(path.join(dir, "b-SHA256SUMS"), "utf8"), "bbb  giochi-b.img.xz\n");
    assert.equal(isFile(path.join(dir, "a", "SHA256SUMS")), false, "o original sai do dist");
  });
});

test("o README desdobrado cita o arquivo de checksum que existe", () => {
  withTempDir((dir) => {
    makeReleaseDir(dir, ["powkiddy-x55"]);
    assert.equal(flattenReleaseAssets(dir).ok, true);
    const texto = readFileSync(path.join(dir, "powkiddy-x55-README.txt"), "utf8");
    assert.match(texto, /sha256sum -c powkiddy-x55-SHA256SUMS/);
    assert.doesNotMatch(texto, /sha256sum -c SHA256SUMS/);
  });
});

test("nome repetido que sobra é erro, não anexo perdido", () => {
  withTempDir((dir) => {
    makeReleaseDir(dir, ["a"]);
    // Um nome novo que passe a se repetir cai na mesma checagem — a regra não
    // é sobre os três nomes conhecidos, é sobre o conjunto achatado.
    write(path.join(dir, "outro", "NOTAS.txt"), "1");
    write(path.join(dir, "outro2", "NOTAS.txt"), "2");

    const resultado = flattenReleaseAssets(dir);
    assert.equal(resultado.ok, false);
    assert.deepEqual(resultado.collisions.map((c) => c.nome), ["NOTAS.txt"]);
    assert.equal(resultado.errors[0].code, "anexo_colide");
  });
});

// ── recorte do checkout ─────────────────────────────────────

test("o que é do pacote: diretórios de dados sim, desenvolvimento não", () => {
  // Esta regra aparece em dois lugares — a fase `apps` e o `sparse-checkout`
  // do CI — e os dois já divergiram: `assets/` e `config/` ficaram de fora um
  // de cada vez, e o app abriu quebrado dentro do QEMU.
  assert.equal(ehDeDesenvolvimento("target/debug/build.o"), true);
  assert.equal(ehDeDesenvolvimento("vendor/serde/lib.rs"), true);
  assert.equal(ehDeDesenvolvimento("src/main.rs"), true);
  assert.equal(ehDeDesenvolvimento("crates/ui-sdl/src/lib.rs"), true);
  assert.equal(ehDeDesenvolvimento("assets/texturas/chao.bmp"), false);
  assert.equal(ehDeDesenvolvimento("config/classes.ron"), false);
  // Arquivo solto na raiz do app: só os dois do contrato entram na imagem.
  assert.equal(ehDeDesenvolvimento("Cargo.toml"), true);
  assert.equal(ehDeDesenvolvimento("README.md"), true);
  assert.equal(ehDeDesenvolvimento("metadata.json"), false);
  assert.equal(ehDeDesenvolvimento("capa.png"), false);
});

test("o recorte acusa o arquivo do app que ficou fora", () => {
  const arquivos = [
    "assets/texturas/chao.bmp",
    "bin/jogo",
    "config/classes.ron",
    "target/debug/build.o",
    "Cargo.toml",
  ];
  // `config/` não veio no clone parcial — exatamente o que aconteceu com o
  // tower, que morreu com "não consegui ler config/classes.ron".
  const faltando = faltandoNoCheckout({
    arquivos,
    presentes: ["assets/texturas/chao.bmp", "bin/jogo", "target/debug/build.o", "Cargo.toml"],
  });
  assert.deepEqual(faltando, ["config/classes.ron"]);
});

test("o recorte completo não acusa nada", () => {
  const arquivos = ["bin/jogo", "config/classes.ron", "target/debug/build.o"];
  assert.deepEqual(
    faltandoNoCheckout({ arquivos, presentes: ["bin/jogo", "config/classes.ron"] }),
    [],
  );
});

test("o release.yml recorta os diretórios que a fase apps copia", () => {
  // Se os dois discordarem, o CI empacota menos que o build local.
  const fonte = readFileSync(path.join(ROOT, ".github", "workflows", "release.yml"), "utf8");
  for (const padrao of ["/app/*/assets/", "/app/*/config/", "/*/assets/", "/*/config/"]) {
    assert.ok(fonte.includes(padrao), `falta o padrão ${padrao} no sparse-checkout`);
  }
  assert.match(fonte, /check-checkout\.mjs --repo \.deps\/games/);
  assert.match(fonte, /check-checkout\.mjs --repo \.deps\/app/);
});

// ── layout dos artefatos ────────────────────────────────────

function escreverRelease(dir, id) {
  write(path.join(dir, "SHA256SUMS"), `h-${id}  giochi-${id}.img.xz\n`);
  write(path.join(dir, "README.txt"), "sha256sum -c SHA256SUMS\n");
  write(path.join(dir, "release.json"), JSON.stringify({ device: { id } }));
  write(path.join(dir, `giochi-${id}.img.xz`), "xz");
}

test("o layout do artefato não importa: o release.json diz o aparelho", () => {
  // O `download-artifact` pode entregar `dist/<device>/`, `dist/<artefato>/` ou
  // `dist/dist/<device>/`. A v0.1.2 publicou com os nomes colidindo porque o
  // desdobramento supôs o primeiro layout e recebeu outro.
  withTempDir((dir) => {
    escreverRelease(path.join(dir, "dist", "giochi-os-dist-powkiddy-x55"), "powkiddy-x55");
    escreverRelease(path.join(dir, "dist", "dist", "qemu-aarch64"), "qemu-aarch64");

    const layout = normalizeDeviceDirs(path.join(dir, "dist"));
    assert.equal(layout.ok, true, JSON.stringify(layout.errors));
    assert.deepEqual(layout.devices, ["powkiddy-x55", "qemu-aarch64"]);
    assert.equal(isFile(path.join(dir, "dist", "powkiddy-x55", "release.json")), true);
    assert.equal(isFile(path.join(dir, "dist", "qemu-aarch64", "release.json")), true);
    assert.equal(isFile(path.join(dir, "dist", "dist")), false, "a pasta intermediária vazia sai");

    // E o desdobramento acha os dois.
    const resultado = flattenReleaseAssets(path.join(dir, "dist"));
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.devices, ["powkiddy-x55", "qemu-aarch64"]);
  });
});

test("nenhuma release no dist é erro, não site vazio", () => {
  withTempDir((dir) => {
    const layout = normalizeDeviceDirs(dir);
    assert.equal(layout.ok, false);
    assert.equal(layout.errors[0].code, "nenhuma_release");
  });
});

test("dois diretórios para o mesmo aparelho é erro", () => {
  // Escolher um em silêncio publicaria a metade errada.
  withTempDir((dir) => {
    escreverRelease(path.join(dir, "a"), "powkiddy-x55");
    escreverRelease(path.join(dir, "b"), "powkiddy-x55");
    const layout = normalizeDeviceDirs(dir);
    assert.equal(layout.ok, false);
    assert.ok(layout.errors.some((e) => e.code === "device_repetido"));
  });
});

test("a expectativa de releases não pode vir de um `wc -l`", () => {
  // `printf '%s' "a,b" | tr ',' '\n' | wc -l` devolve 1: `wc -l` conta
  // caracteres de nova linha, e a última linha não tem. A conferência que
  // existia para pegar aparelho perdido contava dois como um e deixou a v0.1.2
  // publicar com os nomes colidindo, verde.
  const fonte = readFileSync(path.join(ROOT, ".github", "workflows", "release.yml"), "utf8");
  assert.doesNotMatch(fonte, /tr ',' '\\n' \| wc -l/);
  assert.match(fonte, /JSON\.parse\(process\.argv\[1\]\)\.length/);
  assert.match(fonte, /needs\.discover\.outputs\.devices_json/);
});

test("o Validate roda quando um workflow muda", () => {
  // Sem isto, um `release.yml` inválido — que o GitHub transforma em execução
  // sem nenhum job — passa pelo `Validate` sem ser visto.
  const validate = readFileSync(path.join(ROOT, ".github", "workflows", "validate.yml"), "utf8");
  assert.match(validate, /\.github\/workflows\/\*\*/);
});

// ── a página de download (arquivo único) ────────────────────

function makeSiteFixture(dir) {
  const dist = path.join(dir, "dist");
  const card = path.join(dist, "powkiddy-x55");
  write(
    path.join(card, "release.json"),
    JSON.stringify({
      schemaVersion: 2,
      device: {
        id: "powkiddy-x55",
        name: "Powkiddy X55",
        arch: "arm64",
        kind: "card",
        // Observação no fixture de propósito: é o que faz as chaves `note.*` do
        // dicionário aparecerem no HTML e serem cobradas pelo teste de chaves.
        observations: [
          { tipo: "painel", vars: { modelo: "panel4", outros: ["panel1", "panel2"] } },
          { tipo: "compat", vars: { lista: ["R36S"] } },
        ],
      },
      system: {
        version: "1.2.3",
        buildroot: "2025.02",
        kind: "card",
        image: "giochi-powkiddy-x55-1.2.3.img.xz",
        imageSha256: "a".repeat(64),
        sizeHuman: "46.0 MB",
        sizeBytes: 48234496,
        kernel: null,
      },
      boot: null,
      apps: { embedded: [{ id: "launcher", version: "0.1.0", license: "MIT" }], store: [] },
    }),
  );
  const vm = path.join(dist, "qemu-aarch64");
  write(
    path.join(vm, "release.json"),
    JSON.stringify({
      schemaVersion: 2,
      device: { id: "qemu-aarch64", name: "QEMU AArch64 Virt", arch: "arm64", kind: "virtual" },
      system: {
        version: "1.2.3",
        buildroot: "2025.02",
        kind: "virtual",
        image: "giochi-qemu-aarch64-1.2.3.img.xz",
        imageSha256: "b".repeat(64),
        sizeHuman: "14.8 MB",
        sizeBytes: 15518924,
        kernel: {
          name: "giochi-qemu-aarch64-1.2.3-Image.xz",
          sha256: "c".repeat(64),
          sizeHuman: "3.7 MB",
        },
      },
      boot: {
        binary: "qemu-system-aarch64",
        machine: "virt",
        cpu: "cortex-a53",
        smp: 2,
        memoryMiB: 512,
        disk: "giochi-qemu-aarch64-1.2.3.img",
        kernel: "giochi-qemu-aarch64-1.2.3-Image",
        cmdline: "root=/dev/vda rw console=ttyAMA0",
      },
      apps: { embedded: [{ id: "launcher", version: "0.1.0", license: "MIT" }], store: [] },
    }),
  );
  return dist;
}

function buildSingleFile(dir, downloadBase) {
  const dist = makeSiteFixture(dir);
  const out = path.join(dir, "index.html");
  const resultado = generateSite({
    distDir: dist,
    outDir: out,
    templatePath: path.join(ROOT, "site", "template.html"),
    stylePath: path.join(ROOT, "site", "assets", "style.css"),
    singleFile: true,
    downloadBase,
    repo: "dono/repo",
  });
  return { resultado, html: readFileSync(out, "utf8") };
}

test("a página é um arquivo: nada é carregado de fora", () => {
  // O repositório só precisa de um `index.html` na raiz. Qualquer `<link>` ou
  // `<img src>` relativo é uma segunda dependência — e some se alguém mexer na
  // pasta de assets.
  withTempDir((dir) => {
    const { resultado, html } = buildSingleFile(dir);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.match(html, /<style>/, "o CSS entra inline");
    assert.doesNotMatch(html, /<link rel="stylesheet"/);
    assert.doesNotMatch(html, /(?:src|href)="assets\//);
    assert.doesNotMatch(html, /(?:src|href)="downloads\//);
    // Tudo que é subrecurso é data URI ou inline.
    for (const m of html.matchAll(/<(?:img|link)[^>]*(?:src|href)="([^"]*)"/g)) {
      assert.ok(m[1].startsWith("data:"), `subrecurso externo: ${m[1].slice(0, 60)}`);
    }
  });
});

test("a página linka o anexo de cada aparelho, com o nome que o flatten publica", () => {
  // O nome tem de ser o mesmo que `flattenReleaseAssets` cria: `<aparelho>-<nome>`.
  // Se divergir, o botão da página baixa 404 — e é justamente o botão principal.
  withTempDir((dir) => {
    const { html } = buildSingleFile(dir, "https://exemplo.test/releases/download/v1.2.3/");

    for (const nome of [
      "giochi-powkiddy-x55-1.2.3.img.xz",
      "qemu-aarch64-SHA256SUMS",
      "powkiddy-x55-SHA256SUMS",
      "powkiddy-x55-README.txt",
      "qemu-aarch64-README.txt",
      "giochi-qemu-aarch64-1.2.3-Image.xz",
    ]) {
      assert.ok(html.includes(`https://exemplo.test/releases/download/v1.2.3/${nome}`), `falta ${nome}`);
    }
  });
});

test("sem base explícita, o link sai da versão do próprio release.json", () => {
  // O tag vem da mesma versão que nomeia os arquivos; não há como discordarem.
  withTempDir((dir) => {
    const { html } = buildSingleFile(dir);
    assert.ok(html.includes("https://github.com/dono/repo/releases/download/v1.2.3/"));
    assert.doesNotMatch(html, /href="downloads\//);
  });
});

test("os submenus levam a cada aparelho publicado", () => {
  // "todas as informações separadas por submenus": Baixar, Instalar, Aparelhos
  // e Projeto, com um item por aparelho em dois deles.
  withTempDir((dir) => {
    const { html } = buildSingleFile(dir);
    for (const chave of ["nav.download", "nav.install", "nav.devices", "nav.project"]) {
      assert.ok(
        html.includes(`<summary data-i18n="${chave}">${TEXTOS[PADRAO][chave]}</summary>`),
        `falta o submenu ${chave}`,
      );
    }
    assert.ok(html.includes('href="#baixar-powkiddy-x55"'));
    assert.ok(html.includes('href="#baixar-qemu-aarch64"'));
    assert.ok(html.includes('id="baixar-powkiddy-x55"'));
    assert.ok(html.includes('id="baixar-qemu-aarch64"'));
    assert.ok(html.includes('id="aparelho-powkiddy-x55"'));
  });
});

test("toda âncora da página aponta para um id que existe", () => {
  // Um submenu que rola para lugar nenhum é pior que menu nenhum.
  withTempDir((dir) => {
    const { html } = buildSingleFile(dir);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const quebradas = [...html.matchAll(/href="#([^"]+)"/g)]
      .map((m) => m[1])
      .filter((alvo) => !ids.has(alvo));
    assert.deepEqual(quebradas, []);
  });
});

test("placeholder que sobra no template é erro, não comentário invisível", () => {
  // Um `<!--X-->` esquecido não aparece na página: vira um buraco silencioso.
  withTempDir((dir) => {
    const template = path.join(dir, "template.html");
    write(template, "<html><body><!--INEXISTENTE--></body></html>");
    const resultado = generateSite({
      distDir: makeSiteFixture(dir),
      outDir: path.join(dir, "out.html"),
      templatePath: template,
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
      singleFile: true,
      downloadBase: "https://exemplo.test/",
    });
    assert.equal(resultado.ok, false);
    assert.match(resultado.errors[0].message, /INEXISTENTE/);
  });
});

test("a página carrega depois do flatten, quando o manifesto sai da pasta", () => {
  // O `flatten-release` move `dist/<device>/release.json` para
  // `dist/<device>-release.json` — se não movesse, os manifestos colidiriam na
  // release. O gerador tem de aceitar os dois layouts: no CI ele roda DEPOIS do
  // flatten, e falhou em produção com "nenhum release.json encontrado" quando
  // só aceitava o primeiro.
  withTempDir((dir) => {
    const dist = makeSiteFixture(dir);
    const antes = readFileSync(path.join(dist, "qemu-aarch64", "release.json"), "utf8");

    // Simula o flatten: manifesto para fora, com o nome da release.
    write(path.join(dist, "qemu-aarch64-release.json"), antes);
    rmSync(path.join(dist, "qemu-aarch64", "release.json"));
    write(path.join(dist, "powkiddy-x55-release.json"), readFileSync(path.join(dist, "powkiddy-x55", "release.json"), "utf8"));
    rmSync(path.join(dist, "powkiddy-x55", "release.json"));

    const out = path.join(dir, "index.html");
    const resultado = generateSite({
      distDir: dist,
      outDir: out,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
      singleFile: true,
      repo: "dono/repo",
    });

    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(resultado.releases.map((r) => r.device.id), ["powkiddy-x55", "qemu-aarch64"]);
    // O `__dir` tem de voltar para a pasta do aparelho — é de lá que o modo
    // local copia as imagens.
    assert.equal(path.basename(resultado.releases[1].__dir), "qemu-aarch64");
  });
});

test("os dois layouts produzem os mesmos links", () => {
  // Um layout que gera link diferente é uma página que muda por acidente.
  withTempDir((dir) => {
    const dist = makeSiteFixture(dir);
    const ler = (nome) => {
      const out = path.join(dir, nome);
      generateSite({
        distDir: dist,
        outDir: out,
        templatePath: path.join(ROOT, "site", "template.html"),
        stylePath: path.join(ROOT, "site", "assets", "style.css"),
        singleFile: true,
        repo: "dono/repo",
      });
      return [...readFileSync(out, "utf8").matchAll(/https:\/\/github\.com[^"]*/g)]
        .map((m) => m[0])
        .sort();
    };
    const porPasta = ler("a.html");

    for (const device of ["powkiddy-x55", "qemu-aarch64"]) {
      write(path.join(dist, `${device}-release.json`), readFileSync(path.join(dist, device, "release.json"), "utf8"));
      rmSync(path.join(dist, device, "release.json"));
    }

    assert.deepEqual(ler("b.html"), porPasta);
  });
});

// ── multi-idioma ────────────────────────────────────────────

const DEZ_IDIOMAS = ["en", "zh", "hi", "es", "fr", "ar", "bn", "pt", "ru", "ur"];

test("os dez idiomas mais falados estão publicados", () => {
  // Inglês, chinês, híndi, espanhol, francês, árabe, bengali, português, russo
  // e urdu — a lista por falantes totais. Faltar um é publicar "mundialmente"
  // deixando de fora centenas de milhões de pessoas.
  assert.deepEqual(IDIOMAS.map((i) => i.code), DEZ_IDIOMAS);
  for (const idioma of IDIOMAS) {
    // O nome próprio é o endônimo: "Русский", "العربية", "中文". Em inglês ele
    // coincide com o nome, e é isso mesmo que se espera.
    assert.ok(idioma.proprio && idioma.proprio.trim().length > 1, `${idioma.code}: nome próprio`);
    assert.ok(["ltr", "rtl"].includes(idioma.dir), `${idioma.code}: direção`);
    assert.ok(idioma.bcp47, `${idioma.code}: bcp47`);
  }
});

test("árabe e urdu são RTL, os outros oito são LTR", () => {
  // Traduzir sem inverter a página deixa o texto ilegível: em árabe a leitura
  // e o layout andam da direita para a esquerda.
  const rtl = IDIOMAS.filter((i) => i.dir === "rtl").map((i) => i.code).sort();
  assert.deepEqual(rtl, ["ar", "ur"]);
});

test("nenhum idioma tem chave faltando, vazia ou com tag perigosa", () => {
  assert.deepEqual(validarTraducoes(), []);
});

test("validarTraducoes recusa tag fora da lista permitida", () => {
  // O dicionário é nosso, mas `innerHTML` com valor de tradução é execução de
  // script com outro nome se alguém colar um `<script>` ali.
  const original = TEXTOS.pt["about.osText"];
  TEXTOS.pt["about.osText"] = "texto <script>alert(1)</script>";
  try {
    const problemas = validarTraducoes();
    assert.ok(problemas.some((p) => p.includes("script")), JSON.stringify(problemas));
  } finally {
    TEXTOS.pt["about.osText"] = original;
  }
});

test("o dicionário e o template falam das mesmas chaves", () => {
  // Chave usada no template e ausente no dicionário vira texto vazio na tela;
  // chave sobrando é tradução que ninguém usa e que ninguém nota que envelheceu.
  withTempDir((dir) => {
    const dist = makeSiteFixture(dir);
    const out = path.join(dir, "index.html");
    const resultado = generateSite({
      distDir: dist,
      outDir: out,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
      singleFile: true,
      repo: "dono/repo",
    });
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));

    const html = readFileSync(out, "utf8");
    const semComentario = html.replace(/<!--[\s\S]*?-->/g, "");
    const usadas = new Set(
      [...semComentario.matchAll(/data-i18n(?:-html|-content)?="([^"]+)"/g)].map((m) => m[1]),
    );
    // Umas aparecem só em estados excepcionais (imagem não publicada, nenhum
    // alvo virtual); outras só são escritas pelo script (o aviso de cópia da
    // chave PIX). Não usá-las no HTML estático é o esperado.
    const condicionais = new Set([
      "card.unavailable",
      "qemu.empty",
      "donate.copied",
      "donate.copyFailed",
    ]);
    const sobrando = Object.keys(TEXTOS[PADRAO]).filter(
      (chave) => !usadas.has(chave) && !condicionais.has(chave),
    );
    assert.deepEqual(sobrando, [], "chave no dicionário que o template não usa");
  });
});

test("a página sem JavaScript está inteira no idioma padrão", () => {
  // O gerador escreve o idioma padrão no HTML: quem chega sem JS (ou um robô de
  // busca) tem de ler a página toda. Um elemento vazio é um botão invisível.
  withTempDir((dir) => {
    const dist = makeSiteFixture(dir);
    const out = path.join(dir, "index.html");
    generateSite({
      distDir: dist,
      outDir: out,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
      singleFile: true,
      repo: "dono/repo",
    });

    const html = readFileSync(out, "utf8");
    assert.match(html, new RegExp(`<html lang="${PADRAO}" dir="ltr">`));
    // Nenhum `data-i18n` pode ter ficado sem texto.
    // "Vazio" é `>` seguido do fecha-tag. Conteúdo que COMEÇA com uma tag
    // (`<code>dd</code> writes…`) não é vazio — a primeira versão deste teste
    // confundia os dois e acusava texto traduzido.
    const vazios = [...html.matchAll(/data-i18n(?:-html)?="([^"]+)"[^>]*><\//g)].map((m) => m[1]);
    assert.deepEqual(vazios, [], "elemento com data-i18n e sem texto");
    // Nem marcador sem substituir.
    const corpo = html.slice(html.indexOf("<body"), html.lastIndexOf("</body>"));
    const semDados = corpo.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, "");
    assert.doesNotMatch(semDados, />[^<]*\{n\}[^<]*</);
    assert.doesNotMatch(semDados, />[^<]*\{size\}[^<]*</);
  });
});

test("o idioma escolhido manda no html: lang e dir", () => {
  // É o que o script faz. Testado aqui como contrato de dados: o `dir` de cada
  // idioma é o que o navegador recebe.
  const dom = (codigo) => IDIOMAS.find((i) => i.code === codigo);
  assert.equal(dom("ar").dir, "rtl");
  assert.equal(dom("ur").dir, "rtl");
  assert.equal(dom("zh").bcp47, "zh-CN");
  assert.equal(dom("pt").bcp47, "pt-BR");
});

test("o dicionário entra como dado, não como código executável", () => {
  // `<script type="application/json">` não é executado, e `<` é escapado: uma
  // tradução não pode fechar o bloco e virar script.
  withTempDir((dir) => {
    const dist = makeSiteFixture(dir);
    const out = path.join(dir, "index.html");
    generateSite({
      distDir: dist,
      outDir: out,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
      singleFile: true,
      repo: "dono/repo",
    });
    const html = readFileSync(out, "utf8");
    const bloco = html.match(/<script type="application\/json" id="i18n-dados">([\s\S]*?)<\/script>/);
    assert.ok(bloco, "o bloco de dados tem de existir");
    const dados = JSON.parse(bloco[1]);
    assert.equal(dados.padrao, PADRAO);
    assert.deepEqual(dados.idiomas.map((i) => i.code), DEZ_IDIOMAS);
    for (const codigo of DEZ_IDIOMAS) {
      assert.equal(Object.keys(dados.textos[codigo]).length, Object.keys(TEXTOS[PADRAO]).length);
    }
    // O `<` do JSON tem de estar escapado (ou não haver nenhum).
    assert.doesNotMatch(bloco[1], /</);
  });
});

test("o seletor lista os dez, cada um no próprio alfabeto", () => {
  withTempDir((dir) => {
    const dist = makeSiteFixture(dir);
    const out = path.join(dir, "index.html");
    generateSite({
      distDir: dist,
      outDir: out,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
      singleFile: true,
      repo: "dono/repo",
    });
    const html = readFileSync(out, "utf8");
    for (const idioma of IDIOMAS) {
      assert.ok(html.includes(`data-lang="${idioma.code}"`), `falta o botão ${idioma.code}`);
      assert.ok(html.includes(idioma.proprio), `falta o nome próprio ${idioma.proprio}`);
    }
    assert.equal([...html.matchAll(/data-lang="/g)].length, 10);
  });
});

// ── observações por aparelho ────────────────────────────────

test("o R35S publica a observação de painel e a de compatibilidade", () => {
  // O mesmo aparelho sai de fábrica com cinco painéis e nenhum EDID para
  // descobrir qual é. Quem baixa sem saber disso grava o cartão e vê tela preta
  // — e o sintoma parece build quebrada.
  const notas = observacoesDe("r35s");
  assert.deepEqual(notas.map((n) => n.tipo), ["painel", "compat"]);
  assert.equal(notas[0].vars.modelo, "panel4");
  assert.deepEqual(notas[0].vars.outros, ["panel1", "panel2", "panel3"]);
  assert.deepEqual(notas[1].vars.lista, ["R36S", "R33S"]);
});

test("aparelho sem observação devolve lista vazia, não undefined", () => {
  // O consumidor não pode ter de testar dois formatos.
  assert.deepEqual(observacoesDe("qemu-aarch64"), []);
  assert.deepEqual(observacoesDe("aparelho-que-nao-existe"), []);
  assert.deepEqual(observacoesDe(undefined), []);
});

test("todo tipo de observação tem frase nos dez idiomas", () => {
  // Um tipo sem frase apareceria como chave crua na tela.
  for (const tipo of TIPOS_DE_OBSERVACAO) {
    for (const idioma of IDIOMAS) {
      const texto = TEXTOS[idioma.code][`note.${tipo}`];
      assert.ok(texto && texto.trim(), `${idioma.code}: falta note.${tipo}`);
    }
  }
  for (const idioma of IDIOMAS) {
    assert.ok(TEXTOS[idioma.code]["note.title"], `${idioma.code}: falta note.title`);
  }
});

test("as observações chegam ao card fora do <details>", () => {
  // Aviso escondido atrás de um clique é aviso que ninguém lê.
  withTempDir((dir) => {
    const dist = makeSiteFixture(dir);
    const out = path.join(dir, "index.html");
    generateSite({
      distDir: dist,
      outDir: out,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
      singleFile: true,
      repo: "dono/repo",
    });
    const html = readFileSync(out, "utf8");
    const notas = html.slice(html.indexOf('<aside class="notas">'), html.indexOf("</aside>"));
    assert.ok(notas.length > 0, "o bloco de observações tem de existir");
    assert.ok(notas.includes('data-i18n-html="note.painel"'), "falta a nota de painel");
    assert.ok(notas.includes('data-i18n-html="note.compat"'), "falta a nota de compatibilidade");
    assert.ok(!notas.includes("<details"), "observação não fica dentro de <details>");
    // O dado do aparelho vai nas variáveis, não na frase.
    assert.ok(notas.includes("panel4"), "o modelo do painel tem de estar no HTML");
    assert.ok(notas.includes("R36S"), "a compatibilidade tem de estar no HTML");
  });
});

test("o pipeline leva as observações para o release.json", async () => {
  // Sem isto a nota existiria só neste repositório e o site não teria como saber.
  await withTempDirAsync(async (dir) => {
    const systemDir = path.join(dir, "out", "r35s");
    makeSystemOutput(systemDir, { deviceId: "r35s", deviceName: "R35S" });
    const appsRoot = path.join(dir, "app");
    makeRegistry(appsRoot, [makeApp(appsRoot, { id: "launcher" })]);

    const resultado = await runPackagePhase({
      systemDir,
      appsRoots: [appsRoot],
      outDir: path.join(dir, "dist"),
      version: "1.0.0",
    });
    assert.equal(resultado.ok, true, JSON.stringify(resultado.errors));
    assert.deepEqual(
      resultado.release.device.observations.map((n) => n.tipo),
      ["painel", "compat"],
    );
  });
});

test("o script troca de idioma substituindo as variáveis também no HTML", () => {
  // O script do navegador tem duas listas (`data-i18n` e `data-i18n-html`) e as
  // observações de aparelho usam a segunda, com variáveis. Sem isso, o texto
  // trocava de idioma e deixava `{modelo}` cru na tela — invisível para quem
  // tem o idioma do navegador igual ao padrão, que é o caso de quem testa.
  const fonte = readFileSync(path.join(ROOT, "scripts", "lib", "site.mjs"), "utf8");
  const script = fonte.slice(fonte.indexOf("const SCRIPT_IDIOMA"));
  assert.match(script, /function comVars\(/, "tem de existir uma função de substituição");
  assert.match(script, /comHtml\[j\]\.innerHTML = comVars\(comHtml\[j\], t\[k2\]\)/);
  assert.match(script, /alvos\[i\]\.textContent = comVars\(alvos\[i\], valor\)/);
});

// ── doação ──────────────────────────────────────────────────

const CHAVE_PIX = "6fe4182f-30b3-4c35-9620-ccb8bb7341e0";
const LINK_DOACAO = "https://link.mercadopago.com.br/giochios";
const LINK_NUBANK =
  "https://nubank.com.br/cobrar/i9udv/6afd249c-8e87-428a-9d53-24d16f2e51a2";

test("a página tem a seção de doação, com a chave PIX como texto", () => {
  // O botão de copiar depende de JS (e de contexto seguro); a chave como TEXTO
  // é o que salva quem abre por `file://` ou com a área de transferência
  // bloqueada. Só botão seria um botão inútil em metade dos casos.
  withTempDir((dir) => {
    const dist = makeSiteFixture(dir);
    const out = path.join(dir, "index.html");
    generateSite({
      distDir: dist,
      outDir: out,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
      singleFile: true,
      repo: "dono/repo",
    });
    const html = readFileSync(out, "utf8");

    assert.match(html, /<section id="doar"/);
    assert.ok(html.includes(CHAVE_PIX), "a chave PIX tem de estar no HTML");
    assert.ok(html.includes(`href="${LINK_DOACAO}"`), "o link de doação tem de estar no HTML");
    // A chave não pode vir de JS: se o script falhar, ela tem de estar lá.
    const semScript = html.replace(/<script[\s\S]*?<\/script>/g, "");
    assert.ok(semScript.includes(CHAVE_PIX), "a chave não pode depender do script");
  });
});

test("a chave PIX nunca é tratada como texto traduzível", () => {
  // Ela é uma string, não uma frase: traduzir, espelhar em RTL ou escapar
  // quebraria a colagem no app do banco.
  const template = readFileSync(path.join(ROOT, "site", "template.html"), "utf8");
  const inicio = template.indexOf('<code id="chave-pix"');
  const fim = template.indexOf("</code>", inicio);
  assert.ok(inicio > 0, "o elemento da chave tem de existir");
  const elemento = template.slice(inicio, fim);
  assert.ok(elemento.includes(CHAVE_PIX), "a chave literal tem de estar no elemento");
  assert.ok(elemento.includes('dir="ltr"'), "a chave tem de forçar LTR");
  // O botão ao lado TEM `data-i18n` ("Copiar chave") — é o elemento da chave
  // que não pode ter, senão o script sobrescreveria o valor.
  assert.ok(!elemento.includes("data-i18n"), "a chave não pode ter data-i18n");
});

test("a doação entra no menu e no fim da página", () => {
  // "No fim do site" e alcançável pelo submenu Projeto — quem procura não deve
  // ter de rolar até o rodapé.
  const template = readFileSync(path.join(ROOT, "site", "template.html"), "utf8");
  assert.ok(template.includes('href="#doar"'), "falta o item de menu");
  const posDoar = template.indexOf('<section id="doar"');
  const posFimMain = template.indexOf("</main>");
  assert.ok(posDoar > 0 && posDoar < posFimMain, "a seção fica antes do </main>");
  // Depois de licenças, que é a última seção de conteúdo.
  assert.ok(posDoar > template.indexOf('<section id="licencas"'));
});

test("as frases da doação existem nos dez idiomas", () => {
  for (const chave of [
    "nav.donate",
    "donate.title",
    "donate.lede",
    "donate.pixTitle",
    "donate.pixText",
    "donate.copy",
    "donate.cardTitle",
    "donate.cardText",
    "donate.cardButton",
    "donate.note",
    "donate.copied",
    "donate.copyFailed",
  ]) {
    for (const idioma of IDIOMAS) {
      const texto = TEXTOS[idioma.code][chave];
      assert.ok(texto && texto.trim(), `${idioma.code}: falta ${chave}`);
    }
  }
});

test("a doação oferece as três formas de pagamento", () => {
  // PIX (qualquer valor), Nubank (R$ 10 fixo) e Mercado Pago (qualquer valor).
  // O valor fixo tem de estar dito na tela: um botão que cobra R$ 10 sem dizer
  // é uma cobrança surpresa.
  withTempDir((dir) => {
    const dist = makeSiteFixture(dir);
    const out = path.join(dir, "index.html");
    generateSite({
      distDir: dist,
      outDir: out,
      templatePath: path.join(ROOT, "site", "template.html"),
      stylePath: path.join(ROOT, "site", "assets", "style.css"),
      singleFile: true,
      repo: "dono/repo",
    });
    const html = readFileSync(out, "utf8");

    assert.ok(html.includes(CHAVE_PIX), "PIX por chave");
    assert.ok(html.includes(LINK_NUBANK), "link do Nubank");
    assert.ok(html.includes(LINK_DOACAO), "link do Mercado Pago");

    // O valor fixo aparece no título e no botão do cartão do Nubank. O recorte
    // vai ATÉ DEPOIS do href: o `data-i18n` do botão vem depois do `href` no
    // atributo, e cortar no link deixava o botão de fora.
    const posicao = html.indexOf(LINK_NUBANK);
    const cartao = html.slice(posicao - 1200, posicao + 400);
    assert.ok(cartao.includes("R$ 10"), "o valor fixo tem de estar no cartão");
    assert.ok(
      cartao.includes("donate.nubankTitle") && cartao.includes("donate.nubankButton"),
      "título e botão do Nubank traduzíveis",
    );
  });
});

test("as frases do Nubank existem nos dez idiomas, com o valor fixo", () => {
  for (const chave of ["donate.nubankTitle", "donate.nubankText", "donate.nubankButton"]) {
    for (const idioma of IDIOMAS) {
      const texto = TEXTOS[idioma.code][chave];
      assert.ok(texto && texto.trim(), `${idioma.code}: falta ${chave}`);
      // O valor tem de estar em toda frase que o cobra — é a mesma regra do
      // botão: cobrança sem valor dito é cobrança surpresa.
      assert.ok(texto.includes("R$ 10"), `${idioma.code}/${chave}: sem o valor fixo`);
    }
  }
});

test("o link de doação abre em aba nova com rel seguro", () => {
  // `target="_blank"` sem `rel="noopener"` deixa a página aberta manipulável
  // pelo destino.
  const template = readFileSync(path.join(ROOT, "site", "template.html"), "utf8");
  for (const link of [LINK_DOACAO, LINK_NUBANK]) {
    const bloco = template.slice(template.indexOf(link) - 300, template.indexOf(link) + 300);
    assert.ok(bloco.includes('target="_blank"'), `${link}: sem target`);
    assert.match(bloco, /rel="noopener noreferrer"/, `${link}: sem rel seguro`);
  }
});

// ── controle virtual na imagem ───────────────────────────────
//
// O `Giochi Gamepad` é contrato de ENTRADA: sem as peças, o aparelho continua
// bootando e os jogos abrem — cada um no layout daquele aparelho, sem erro em
// lugar nenhum. Por isso a junção lê as peças de dentro da imagem que vai ser
// publicada, e o manifesto diz o que ela tem.

/** Mapa calibrado, no formato medido nos aparelhos (`axis_<eixo>_min/max`). */
const MAPA_CALIBRADO = [
  "a = BTN_EAST",
  "b = BTN_SOUTH",
  "axis_x_min = 15",
  "axis_x_max = 1023",
  "axis_y_min = 1023",
  "axis_y_max = 15",
  "axis_rx_min = 15",
  "axis_rx_max = 1023",
  "axis_ry_min = 1023",
  "axis_ry_max = 15",
  "",
].join("\n");

/** As quatro peças do contrato, prontas para entrar num ext4. */
function conteudoDoGamepad({ mapa = MAPA_CALIBRADO, pecas = ["daemon", "servico", "mapeamento", "mapa"] } = {}) {
  const todas = {
    daemon: ["usr/bin/giochi-gamepad", "#!/bin/sh\nexit 0\n"],
    servico: ["etc/init.d/S52gamepad", "#!/bin/sh\nexit 0\n"],
    mapeamento: [
      "etc/giochi/gamecontrollerdb.txt",
      "030000005e0400000000000000000000,Giochi Gamepad,a:b1,b:b0,\n",
    ],
    mapa: ["etc/giochi/buttons.map", mapa],
  };
  const conteudo = {};
  for (const id of pecas) {
    const [caminho, texto] = todas[id];
    conteudo[caminho] = texto;
  }
  return conteudo;
}

/** O que o build marca como executável: daemon e serviço. */
const EXECUTAVEIS_DO_GAMEPAD = ["usr/bin/giochi-gamepad", "etc/init.d/S52gamepad"];

/**
 * Pasta `out/<device>/` com rootfs ext4 de verdade.
 *
 * `card` = MBR + partição, como o `make-sd-image.sh` entrega; `virtual` =
 * `Image` + `rootfs.ext4`, como o QEMU. O resto dos metadados é o mínimo que a
 * fase `package` exige.
 */
function makeSystemWithRootfs(
  dir,
  rootContent,
  { kind = "card", executables = EXECUTAVEIS_DO_GAMEPAD } = {},
) {
  const card = kind === "card";
  const deviceId = card ? "r35s" : "qemu-aarch64";
  const systemDir = path.join(dir, "out", deviceId);
  mkdirSync(systemDir, { recursive: true });

  write(
    path.join(systemDir, "device.json"),
    JSON.stringify(
      card
        ? { id: "r35s", name: "R35S", arch: "arm64", buildroot: "2024.02" }
        : {
            id: "qemu-aarch64",
            name: "QEMU AArch64 Virt",
            arch: "arm64",
            buildroot: "2024.02",
            buildrootDefconfig: "qemu_aarch64_virt_defconfig",
          },
    ),
  );
  write(path.join(systemDir, "build-info.txt"), "name=Giochi System\nbuildroot=2024.02\n");

  const montagem = path.join(dir, `montagem-${kind}`);
  const linhas = [
    `${sha256(readFileSync(path.join(systemDir, "device.json")))}  device.json`,
    `${sha256(readFileSync(path.join(systemDir, "build-info.txt")))}  build-info.txt`,
  ];

  if (card) {
    const imageName = "giochi-system-r35s-sd.img";
    const cartao = makeCardImage(montagem, rootContent, { executables });
    writeFileSync(path.join(systemDir, imageName), readFileSync(cartao));
    linhas.unshift(`${sha256(readFileSync(path.join(systemDir, imageName)))}  ${imageName}`);
  } else {
    const kernel = Buffer.from("kernel de teste");
    const rootfs = makeExt4(montagem, rootContent, { executables });
    write(path.join(systemDir, "Image"), kernel);
    writeFileSync(path.join(systemDir, "rootfs.ext4"), readFileSync(rootfs));
    linhas.unshift(`${sha256(readFileSync(path.join(systemDir, "rootfs.ext4")))}  rootfs.ext4`);
    linhas.unshift(`${sha256(kernel)}  Image`);
  }

  write(path.join(systemDir, "SHA256SUMS"), `${linhas.join("\n")}\n`);
  return systemDir;
}

test("lerCalibracaoDoMapa exige os dois lados de cada eixo", () => {
  const completo = lerCalibracaoDoMapa(MAPA_CALIBRADO);
  assert.deepEqual(completo.calibrated, ["x", "y", "rx", "ry"]);
  assert.deepEqual(completo.uncalibrated, []);
  assert.equal(completo.axes, 4);

  // Um lado só não calibra: o daemon exige `min` E `max` (bits 1 e 2).
  const meio = lerCalibracaoDoMapa("axis_x_min = 0\naxis_x_max = 100\naxis_y_min = 0\n");
  assert.deepEqual(meio.calibrated, ["x"]);
  assert.deepEqual(meio.uncalibrated, ["y", "rx", "ry"]);

  // Comentário não calibra nada — e é o caso real do R35S até 17/11/2026,
  // cujo mapa documentava a medição em comentário e não em `axis_*`.
  const comentado = lerCalibracaoDoMapa(
    "# axis_x_min = -1800\n# axis_x_max = 1800\na = BTN_EAST\n",
  );
  assert.equal(comentado.axes, 0);
  assert.deepEqual(comentado.uncalibrated, ["x", "y", "rx", "ry"]);
});

test("inspectGamepad encontra as peças e a calibração no ext4", (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs")) {
    return t.skip("mkfs.ext4/debugfs ausentes");
  }
  withTempDir((dir) => {
    const image = makeExt4(dir, conteudoDoGamepad(), { executables: EXECUTAVEIS_DO_GAMEPAD });
    const lido = inspectGamepad(image);

    assert.equal(lido.inspected, true, lido.reason);
    assert.equal(lido.complete, true);
    assert.deepEqual(lido.missing, []);
    assert.deepEqual(lido.notExecutable, []);
    assert.deepEqual(lido.present.sort(), ["daemon", "mapa", "mapeamento", "servico"]);
    assert.deepEqual(lido.map.calibrated, ["x", "y", "rx", "ry"]);
  });
});

test("inspectGamepad acusa peça ausente e peça sem bit de execução", (t) => {
  // Arquivo presente sem bit de execução não sobe, e o sintoma é o mesmo do
  // arquivo ausente — por isso os dois entram no veredito.
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs")) {
    return t.skip("mkfs.ext4/debugfs ausentes");
  }
  withTempDir((dir) => {
    const image = makeExt4(
      dir,
      conteudoDoGamepad({ pecas: ["servico", "mapa"] }),
      { executables: [] },
    );
    const lido = inspectGamepad(image);

    assert.equal(lido.complete, false);
    assert.deepEqual(lido.missing.sort(), ["daemon", "mapeamento"]);
    assert.deepEqual(lido.notExecutable, ["servico"]);
    assert.deepEqual(lido.present.sort(), ["mapa", "servico"]);
  });
});

test("fase package publica a verdade quando o cartão sai sem o controle virtual", (t) => {
  // O defeito que isto pega: a imagem boota, os jogos abrem e cada um responde
  // no layout do aparelho — sem erro em lugar nenhum.
  if (!CARTAO_OK()) return t.skip("mkfs.ext4/debugfs/sfdisk/dd/e2fsck ausentes");
  return withTempDirAsync(async (dir) => {
    const systemDir = makeSystemWithRootfs(dir, {
      "etc/giochi/buttons.map": MAPA_CALIBRADO,
      "etc/motd": "oi\n",
    });
    const outDir = path.join(dir, "dist");

    const result = await runPackagePhase({ systemDir, outDir, version: "0.1.0" });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const gamepad = result.release.input.virtualGamepad;
    assert.equal(gamepad.expected, true);
    assert.equal(gamepad.checked, true);
    assert.equal(gamepad.complete, false);
    assert.deepEqual(gamepad.missing.sort(), ["daemon", "mapeamento", "servico"]);
    assert.ok(
      result.warnings.some((warning) => warning.code === "gamepad_incompleto"),
      JSON.stringify(result.warnings),
    );

    const readme = readFileSync(path.join(outDir, "README.txt"), "utf8");
    assert.match(readme, /Controle virtual: INCOMPLETO/);
    assert.match(readme, /falta daemon, servico, mapeamento/);
  });
});

test("fase package não avisa quando o cartão traz o controle completo", (t) => {
  if (!CARTAO_OK()) return t.skip("mkfs.ext4/debugfs/sfdisk/dd/e2fsck ausentes");
  return withTempDirAsync(async (dir) => {
    const systemDir = makeSystemWithRootfs(dir, conteudoDoGamepad());
    const outDir = path.join(dir, "dist");

    const result = await runPackagePhase({ systemDir, outDir, version: "0.1.0" });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const gamepad = result.release.input.virtualGamepad;
    assert.equal(gamepad.complete, true);
    assert.deepEqual(gamepad.missing, []);
    assert.equal(
      result.warnings.some((warning) => /^gamepad_|^mapa_/.test(warning.code)),
      false,
      JSON.stringify(result.warnings),
    );

    const readme = readFileSync(path.join(outDir, "README.txt"), "utf8");
    assert.match(readme, /Controle virtual: completo/);
    assert.match(readme, /\/etc\/init\.d\/S52gamepad status/);
  });
});

test("fase package avisa mapa sem calibração mesmo com as peças presentes", (t) => {
  // Mapa sem `axis_*` = calibração implícita errada: o daemon passa o valor
  // cru, e o analógico fica com curso mínimo (foi o estado do R35S até
  // 17/11/2026).
  if (!CARTAO_OK()) return t.skip("mkfs.ext4/debugfs/sfdisk/dd/e2fsck ausentes");
  return withTempDirAsync(async (dir) => {
    const systemDir = makeSystemWithRootfs(dir, conteudoDoGamepad({ mapa: "a = BTN_EAST\n" }));
    const result = await runPackagePhase({
      systemDir,
      outDir: path.join(dir, "dist"),
      version: "0.1.0",
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.release.input.virtualGamepad.complete, true);
    assert.deepEqual(
      result.release.input.virtualGamepad.map.uncalibrated,
      ["x", "y", "rx", "ry"],
    );
    assert.ok(
      result.warnings.some((warning) => warning.code === "mapa_sem_calibracao"),
      JSON.stringify(result.warnings),
    );
  });
});

test("alvo virtual não exige o controle e não avisa a ausência", (t) => {
  if (!binaryAvailable("mkfs.ext4") || !binaryAvailable("debugfs")) {
    return t.skip("mkfs.ext4/debugfs ausentes");
  }
  return withTempDirAsync(async (dir) => {
    const systemDir = makeSystemWithRootfs(dir, { "etc/motd": "vm\n" }, { kind: "virtual" });
    const outDir = path.join(dir, "dist");

    const result = await runPackagePhase({ systemDir, outDir, version: "0.1.0" });
    assert.equal(result.ok, true, JSON.stringify(result.errors));

    const gamepad = result.release.input.virtualGamepad;
    assert.equal(gamepad.expected, false, "VM não tem gamepad físico");
    assert.equal(gamepad.checked, true);
    assert.equal(gamepad.complete, false);
    assert.equal(
      result.warnings.some((warning) => /^gamepad_|^mapa_/.test(warning.code)),
      false,
      JSON.stringify(result.warnings),
    );

    const readme = readFileSync(path.join(outDir, "README.txt"), "utf8");
    assert.match(readme, /Controle virtual: não se aplica/);
  });
});

test("cartão comprimido na origem não é espiado, e o aviso diz isso", async () => {
  await withTempDirAsync(async (dir) => {
    makeSystemOutput(dir, { imageName: "card.img.xz", deviceId: "r35s", deviceName: "R35S" });
    const result = await runPackagePhase({
      systemDir: dir,
      outDir: path.join(dir, "dist"),
      version: "0.1.0",
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const gamepad = result.release.input.virtualGamepad;
    assert.equal(gamepad.expected, true);
    assert.equal(gamepad.checked, false);
    assert.equal(gamepad.complete, null);
    assert.ok(
      result.warnings.some((warning) => warning.code === "gamepad_nao_verificado"),
      JSON.stringify(result.warnings),
    );
  });
});
