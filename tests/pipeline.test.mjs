#!/usr/bin/env node
// Testes das duas funções do Giochi os: junção e site.
//
// Importa as libs em vez de spawnar os CLIs: sob o sandbox, spawnar falha com
// EPERM, e a função pura é o que interessa testar.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadApps, pngSize } from "../scripts/lib/apps.mjs";
import { isFile } from "../scripts/lib/fs.mjs";
import { runAppsPhase, runPackagePhase } from "../scripts/lib/pipeline.mjs";
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

function makeSystemOutput(dir, { imageName = "test.img", tamper = false } = {}) {
  const image = Buffer.from("imagem de teste do cartao");
  write(path.join(dir, imageName), image);
  write(
    path.join(dir, "device.json"),
    JSON.stringify({ id: "qemu-aarch64", name: "QEMU AArch64 Virt", arch: "arm64", buildroot: "2024.02" }),
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
    assert.match(html, /1 release\(s\) publicada\(s\)/);
    assert.equal(
      isFile(path.join(outDir, "downloads", "qemu-aarch64", "giochi-qemu-aarch64-1.0.0.img")),
      true,
    );
    assert.equal(isFile(path.join(outDir, "assets", "style.css")), true);
  });
});

test("generateSite falha sem release.json", async () => {
  await withTempDirAsync(async (dir) => {
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
