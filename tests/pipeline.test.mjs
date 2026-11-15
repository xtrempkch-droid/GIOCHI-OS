#!/usr/bin/env node
// Testes das duas funções do Giochi os: junção e site.
//
// Importa as libs em vez de spawnar os CLIs: sob o sandbox, spawnar falha com
// EPERM, e a função pura é o que interessa testar.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { loadApps, loadAppsFromRoots, pngSize } from "../scripts/lib/apps.mjs";
import { isFile } from "../scripts/lib/fs.mjs";
import { runAppsPhase, runPackagePhase } from "../scripts/lib/pipeline.mjs";
import {
  injectIntoCardImage,
  injectOverlay,
  listPartitions,
  readAppsFromCardImage,
  readFromImage,
} from "../scripts/lib/inject.mjs";
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

function makeSystemOutput(dir, { imageName = "test.img", tamper = false, partitionTable = false } = {}) {
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
function makeExt4(dir, rootContent) {
  const source = path.join(dir, "rootdir");
  for (const [relative, content] of Object.entries(rootContent)) {
    write(path.join(source, relative), content);
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

// ── leitura do ext4 dentro de imagem particionada ────────────

/** Imagem de cartão mínima: tabela MBR + uma partição ext4 com conteúdo. */
function makeCardImage(dir, rootContent) {
  const rootdir = path.join(dir, "rootdir");
  for (const [relative, content] of Object.entries(rootContent)) {
    write(path.join(rootdir, relative), content);
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
    assert.match(html, /Descomprima antes de gravar/);
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
    assert.doesNotMatch(html, /Descomprima antes de gravar/);
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
