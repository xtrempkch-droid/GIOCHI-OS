// Lógica das duas fases, sem `process.exit` e sem console.
//
// Separado do CLI para poder ser testado por import. Sob o sandbox, spawnar o
// CLI falha com EPERM — e testar a função pura é melhor de qualquer forma.
import { copyFileSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadAppsFromRoots } from "./apps.mjs";
import { compressFile } from "./compress.mjs";
import { observacoesDe } from "./device-notes.mjs";
import { humanSize, isFile, sha256File, sizeOf } from "./fs.mjs";
import { inspectGamepad } from "./gamepad.mjs";
import { injectIntoCardImage, injectOverlay, withCardRootfs } from "./inject.mjs";
import { stripCompression } from "./names.mjs";
import { decompressCommand, qemuBootConfig, renderQemuCommand } from "./qemu.mjs";
import { readRootfsApps } from "./rootfs.mjs";
import { imageExtension, inspectSystemBuild } from "./system.mjs";

export const GENERATOR_VERSION = "0.1.0";

/**
 * Fase 1 — transforma apps de distribuição "image" num overlay de rootfs.
 *
 * Roda **antes** do build do sistema: o Giochi System consome este overlay ao
 * gerar a imagem. Apps de loja e em scaffold ficam de fora.
 */
export async function runAppsPhase({ appsRoot, appsRoots, outDir }) {
  // `appsRoots` tem precedência: é a forma que suporta mais de um catálogo.
  const roots = appsRoots && appsRoots.length > 0 ? appsRoots : [appsRoot].filter(Boolean);
  const apps = await loadAppsFromRoots(roots);
  if (!apps.ok) {
    return { ok: false, apps, overlayDir: null, embedded: [], errors: apps.errors };
  }

  const overlayDir = path.join(outDir, "rootfs-overlay");
  const appsDir = path.join(overlayDir, "opt", "giochi", "apps");

  // A saída é RECRIADA a cada execução. A cópia escreve e sobrescreve, mas
  // nunca APAGA: um app removido do catálogo continuava no overlay e ia para a
  // imagem, com o `index.json` (que é regerado) sem citá-lo. Medido em
  // 14/11/2026: os jogos saíram do catálogo do Giochi app e as pastas deles
  // seguiram no overlay — 4 apps fantasma num `index.json` de 2 entradas.
  rmSync(appsDir, { recursive: true, force: true });
  mkdirSync(appsDir, { recursive: true });

  const index = [];

  for (const app of apps.embedded) {
    const target = path.join(appsDir, app.id);
    // Copia exatamente os arquivos que o catálogo declarou — `app.files` é o
    // mesmo conjunto que entrou no manifesto, com hash. Copiar a pasta `bin/`
    // inteira fazia a imagem divergir do que ela mesma anuncia: o `.gitkeep`
    // dos jogos não estava na lista e ia para dentro do ext4 de qualquer jeito.
    for (const relative of app.files || []) {
      const destino = path.join(target, relative);
      mkdirSync(path.dirname(destino), { recursive: true });
      copyFileSync(path.join(app.dir, relative), destino);
    }
    copyFileSync(path.join(app.dir, "metadata.json"), path.join(target, "metadata.json"));

    const capa = path.join(app.dir, "capa.png");
    if (isFile(capa)) {
      copyFileSync(capa, path.join(target, "capa.png"));
    }

    index.push({
      id: app.id,
      version: app.version,
      entrypoint: app.entrypoint,
      dir: `/opt/giochi/apps/${app.id}`,
    });
  }

  writeFileSync(
    path.join(appsDir, "index.json"),
    `${JSON.stringify({ schemaVersion: 1, apps: index }, null, 2)}\n`,
    "utf8",
  );

  return {
    ok: true,
    apps,
    overlayDir,
    embedded: index,
    external: apps.external,
    skipped: apps.skipped,
    warnings: apps.warnings,
    errors: [],
  };
}

/**
 * Cruza o catálogo com o que foi lido de dentro da imagem.
 *
 * A versão publicada é a da IMAGEM, não a do catálogo: é o arquivo que o
 * usuário vai rodar. Um app presente na imagem e ausente do catálogo não pode
 * desaparecer do manifesto — ele é conteúdo do sistema.
 */
function reconcileEmbedded(catalogEmbedded, inImage) {
  const versions = new Map(inImage.map((app) => [String(app.id), app]));
  const embedded = catalogEmbedded
    .filter((app) => versions.has(app.id))
    .map((app) => ({ ...app, version: String(versions.get(app.id).version || app.version) }));

  for (const [id, entry] of versions) {
    if (!embedded.some((app) => app.id === id)) {
      embedded.push({ id, version: String(entry.version || ""), license: "" });
    }
  }
  return embedded;
}

/**
 * Fase 2 — empacota a saída do sistema numa release publicável.
 *
 * Roda **depois** do build. Confere checksums, copia a imagem com nome
 * canônico e escreve `release.json`, `SHA256SUMS` e `README.txt`.
 *
 * Dois tipos de saída são aceitos:
 *
 * - **cartão** — o build produziu `.img`/`.iso`/`.sdcard` (genimage ou
 *   `make-sd-image.sh`). É o caso dos handhelds; o site ensina o `dd`.
 * - **virtual** — o build produziu só kernel + rootfs, que é tudo o que um alvo
 *   QEMU entrega. O rootfs vira o disco e o kernel vai ao lado, com o comando
 *   pronto no `README.txt`.
 */
export async function runPackagePhase({
  systemDir,
  appsRoot,
  appsRoots,
  outDir,
  version,
  compress,
  injectApps = false,
}) {
  const errors = [];
  const warnings = [];

  const system = await inspectSystemBuild(systemDir);
  errors.push(...system.errors);
  warnings.push(...system.warnings);

  if (!system.ok) {
    return { ok: false, errors, warnings, release: null };
  }

  // Escolha do artefato principal.
  //
  // Preferir a comprimida: o `.img` cru tem ~920 MB quase todo zero, e o que se
  // publica é o comprimido (~40–90 MB). Escolher "a maior" pegaria o cru.
  const compressed = system.images.filter((entry) => entry.compressed);
  const candidates = compressed.length > 0 ? compressed : system.images;
  const card =
    candidates.length > 0
      ? candidates.reduce((a, b) => (b.sizeBytes > a.sizeBytes ? b : a))
      : null;

  const virtual = Boolean(system.virtual) || !card;
  const source = card || system.rootfs;

  if (!source) {
    errors.push({
      code: "sem_imagem",
      message:
        "nenhuma imagem para publicar: o build não deixou .img/.iso nem o par kernel+rootfs" +
        " (o genimage rodou?)",
    });
    return { ok: false, errors, warnings, release: null };
  }

  if (!card && !system.rootfs) {
    errors.push({
      code: "rootfs_ausente",
      message: "alvo virtual sem rootfs.ext*: não há o que usar como disco",
    });
    return { ok: false, errors, warnings, release: null };
  }

  if (card && system.images.length > 1) {
    warnings.push({
      code: "multiplas_imagens",
      message:
        `${system.images.length} imagens encontradas; usando ${card.name}` +
        (compressed.length > 0 ? " (comprimida tem preferência)" : ""),
    });
  }

  if (!card) {
    warnings.push({
      code: "sem_cartao",
      message:
        `${system.deviceId}: o build não gerou imagem de cartão; publicando o rootfs como disco` +
        (system.kernel ? ` e o kernel ${system.kernel.name} ao lado` : ", sem kernel"),
    });
  }

  if (card && !card.compressed && !compress) {
    warnings.push({
      code: "imagem_crua",
      message:
        `${card.name} não está comprimida — o artefato publicado fica com ~${Math.round(card.sizeBytes / 1024 / 1024)} MB. ` +
        "Use --compress xz, ou comprima (.xz/.gz/.zst) na origem.",
    });
  }

  let apps = { embedded: [], external: [], skipped: [], errors: [], warnings: [], ok: true };
  const roots = appsRoots && appsRoots.length > 0 ? appsRoots : [appsRoot].filter(Boolean);
  if (roots.length > 0) {
    apps = await loadAppsFromRoots(roots);
    errors.push(...apps.errors);
    warnings.push(...apps.warnings);
    if (!apps.ok) {
      return { ok: false, errors, warnings, release: null };
    }
  }

  const device = system.device || {};
  const deviceId = system.deviceId;
  const releaseVersion = String(version || readBuildrootVersion(systemDir) || "dev");

  // O que está na imagem, lido de dentro dela. Só é possível no alvo virtual,
  // onde o rootfs é um arquivo solto, e no cartão cru, cuja partição ext4 é
  // extraída. Comprimido na origem não dá para espiar sem descomprimir 2 GiB.
  let inImage = null;
  let inImageReason = null;
  let imageVerified = false;
  // Peças do controle virtual, lidas na MESMA extração do índice de apps.
  let gamepad = null;
  // Nome do artefato que foi inspecionado, para a mensagem de aviso.
  const readTarget = card ? card.name : system.rootfs?.name || "a imagem";
  if ((!card && system.rootfs) || (card && !card.compressed)) {
    const read = inspectImage({ card, target: card ? card.path : system.rootfs.path });
    imageVerified = Boolean(read.inspected);
    gamepad = read.gamepad;
    if (read.apps.ok) inImage = read.apps.apps;
    else inImageReason = read.apps.reason;
  }

  const catalogEmbedded = apps.embedded.map((app) => ({
    id: app.id,
    version: app.version,
    license: app.license,
  }));

  let embedded = catalogEmbedded;
  if (inImage) {
    embedded = reconcileEmbedded(catalogEmbedded, inImage);
  } else if (!card || imageVerified) {
    // Imagem conferida e sem apps: o manifesto publica a verdade, não o
    // catálogo. Vale para o alvo virtual e para o cartão.
    embedded = [];
    if (catalogEmbedded.length > 0 && !injectApps) {
      warnings.push({
        code: "overlay_ausente",
        message:
          `o catálogo tem ${catalogEmbedded.length} app(s) para a imagem, mas ` +
          `${readTarget} não traz /opt/giochi/apps/index.json ` +
          `(${inImageReason || "motivo desconhecido"}); ` +
          "a release não vai anunciá-los como embutidos",
      });
    }
  } else if (catalogEmbedded.length > 0) {
    // Não deu para inspecionar (sem debugfs/sfdisk, ou imagem comprimida na
    // origem). Aqui o catálogo é a única informação disponível — e por isso a
    // release marca `imageVerified: false`.
    warnings.push({
      code: "apps_nao_verificados",
      message:
        `${catalogEmbedded.length} app(s) do catálogo anunciados sem conferir a imagem ` +
        `(${inImageReason || "inspeção indisponível"}); apps.imageVerified=false`,
    });
  }

  mkdirSync(outDir, { recursive: true });

  const published = [];

  // Imagem de cartão / disco.
  const wantsCompression = Boolean(compress) && compress !== "none";
  const imageName = wantsCompression
    ? `giochi-${deviceId}-${releaseVersion}${imageExtension(source.name).replace(/\.(xz|gz|zst)$/i, "")}`
    : `giochi-${deviceId}-${releaseVersion}${imageExtension(source.name)}`;

  const imageTarget = path.join(outDir, imageName);
  copyFileSync(source.path, imageTarget);

  // Injeção opcional do overlay de apps.
  //
  // O caminho normal continua sendo a fase `apps` ANTES do build (ver
  // docs/juncao.md): a imagem sai do Buildroot já com os apps. Isto é a ponte
  // para quando a imagem chega pronta de outro lugar — o CI do Giochi System
  // constrói sem ver o catálogo.
  //
  // Dois formatos, porque o artefato do sistema tem dois:
  //
  //   ext4 cru (alvo virtual)      `debugfs -w` escreve direto
  //   imagem de cartão (partição)  extrai a partição, altera, confere com
  //                                `e2fsck` e devolve ao offset
  if (injectApps && roots.length > 0) {
    // Lê o índice e as peças do gamepad de uma vez: no cartão cada leitura
    // extrai a partição inteira, e são dois `debugfs` sobre o mesmo rootfs.
    const lerImagem = () => inspectImage({ card, target: imageTarget });
    const escrever = (overlayDir) =>
      card
        ? injectIntoCardImage({ imagePath: imageTarget, overlayDir })
        : injectOverlay({ imagePath: imageTarget, overlayDir });

    if (card && card.compressed) {
      // A injeção precisa do setor cru. Descomprimir 2 GiB para alterar e
      // recomprimir seria trabalho dobrado — e o artefato do sistema já chega
      // descomprimido no caminho normal.
      errors.push({
        code: "cartao_comprimido",
        message:
          `${card.name} está comprimida; a injeção precisa do .img cru. ` +
          "Use a fase `apps` antes do build, ou aponte --system para a pasta com o .img",
      });
      return { ok: false, errors, warnings, release: null };
    }

    const lida = lerImagem();
    const already = lida.apps;
    // Um app presente na imagem NÃO prova que a imagem está completa: ela pode
    // ter sido construída com um overlay antigo. Medido no QEMU — o rootfs
    // trazia 2 apps de um build anterior e a injeção foi pulada, deixando os 4
    // jogos do catálogo de fora, com o manifesto anunciando 2.
    //
    // O critério é o catálogo, não a contagem: pula só quando todo app de
    // distribuição `image` já está lá. App extra na imagem não impede o pulo —
    // ele é reportado pelo `reconcileEmbedded`, que publica o que existe de
    // verdade em vez de esconder.
    const naImagem = new Set(already.ok ? already.apps.map((app) => String(app.id)) : []);
    const faltando = catalogEmbedded.filter((app) => !naImagem.has(String(app.id)));

    if (already.ok && already.apps.length > 0 && faltando.length === 0) {
      warnings.push({
        code: "apps_ja_presentes",
        message: `${imageName} já traz os ${already.apps.length} app(s) do catálogo; a injeção não é necessária`,
      });
      imageVerified = true;
      gamepad = lida.gamepad;
      embedded = reconcileEmbedded(catalogEmbedded, already.apps);
    } else {
      if (already.ok && already.apps.length > 0 && faltando.length > 0) {
        warnings.push({
          code: "apps_incompletos",
          message:
            `${imageName} traz ${already.apps.length} app(s) mas faltam ${faltando.length} do catálogo ` +
            `(${faltando.map((app) => app.id).join(", ")}); injetando o catálogo inteiro`,
        });
      }
      const stagingBase = path.join(outDir, ".injeacao");
      rmSync(stagingBase, { recursive: true, force: true });
      const overlay = await runAppsPhase({ appsRoots: roots, outDir: stagingBase });
      if (!overlay.ok) {
        rmSync(stagingBase, { recursive: true, force: true });
        errors.push(...overlay.errors);
        return { ok: false, errors, warnings, release: null };
      }

      const injected = escrever(overlay.overlayDir);
      rmSync(stagingBase, { recursive: true, force: true });

      if (!injected.ok) {
        errors.push(...injected.errors);
        return { ok: false, errors, warnings, release: null };
      }

      // Relê pela porta de quem vai USAR a imagem: no cartão isso é a partição
      // extraída, não o arquivo de 2 GiB.
      const check = lerImagem();
      if (!check.apps.ok) {
        errors.push({ code: "injecao_nao_verificou", message: check.apps.reason });
        return { ok: false, errors, warnings, release: null };
      }

      imageVerified = true;
      gamepad = check.gamepad;
      embedded = reconcileEmbedded(catalogEmbedded, check.apps.apps);
      warnings.push({
        code: "apps_injetados",
        message:
          `${injected.written} arquivo(s) de ${overlay.embedded.length} app(s) escritos em ${imageName} ` +
          `depois do build — a imagem não passou pelo post-build com eles` +
          (card ? " (rootfs extraído, alterado e conferido com e2fsck)" : ""),
      });
    }
  }

  // O controle virtual é contrato de ENTRADA: existe em todo aparelho, e sem as
  // peças o aparelho continua bootando e os jogos abrem — cada um no layout
  // daquele aparelho, sem erro em lugar nenhum. A leitura acima é do artefato
  // que vai ser publicado, não do build que o prometia.
  const avaliacao = avaliarGamepad({ leitura: gamepad, expected: !virtual, artefato: imageName });
  warnings.push(...avaliacao.warnings);

  const image = await finalizeArtifact({
    sourcePath: imageTarget,
    compress: wantsCompression ? compress : null,
  });
  if (!image.ok) {
    errors.push({ code: "compressao_falhou", message: `${imageName}: ${image.reason}` });
    return { ok: false, errors, warnings, release: null };
  }
  published.push(image.artifact);

  // Kernel ao lado do disco. Sem ele o `.img` de um alvo virtual não inicia.
  let kernelArtifact = null;
  if (!card && system.kernel) {
    const kernelName = `giochi-${deviceId}-${releaseVersion}-${system.kernel.name}`;
    const kernelTarget = path.join(outDir, kernelName);
    copyFileSync(system.kernel.path, kernelTarget);
    const kernel = await finalizeArtifact({
      sourcePath: kernelTarget,
      compress: wantsCompression ? compress : null,
    });
    if (!kernel.ok) {
      errors.push({ code: "compressao_falhou", message: `${kernelName}: ${kernel.reason}` });
      return { ok: false, errors, warnings, release: null };
    }
    kernelArtifact = kernel.artifact;
    published.push(kernel.artifact);
  }

  const boot = virtual
    ? qemuBootConfig({
        device,
        arch: String(device.arch || "arm64"),
        imageName: image.artifact.name,
        kernelName: kernelArtifact?.name || null,
      })
    : null;

  const release = {
    schemaVersion: 2,
    product: "Giochi OS",
    device: {
      id: deviceId,
      name: String(device.name || deviceId),
      arch: String(device.arch || "unknown"),
      kind: virtual ? "virtual" : "card",
      // O que muda a decisão de quem vai baixar: painel de referência,
      // aparelhos compatíveis, hardware ainda não ligado. Sempre uma lista —
      // vazia quando não há nada a avisar, para o consumidor não precisar
      // testar dois formatos.
      observations: observacoesDe(deviceId),
    },
    system: {
      version: releaseVersion,
      buildroot: String(device.buildroot || readBuildrootVersion(systemDir) || ""),
      kind: virtual ? "virtual" : "card",
      image: image.artifact.name,
      imageSha256: image.artifact.sha256,
      sizeBytes: image.artifact.sizeBytes,
      sizeHuman: image.artifact.sizeHuman,
      kernel: kernelArtifact
        ? {
            name: kernelArtifact.name,
            sha256: kernelArtifact.sha256,
            sizeBytes: kernelArtifact.sizeBytes,
            sizeHuman: kernelArtifact.sizeHuman,
          }
        : null,
      artifacts: published,
    },
    boot,
    apps: {
      embedded,
      imageVerified,
      store: apps.external.map((app) => ({
        id: app.id,
        version: app.version,
        license: app.license,
        embedded: false,
      })),
    },
    input: {
      virtualGamepad: avaliacao.report,
    },
    notes: boot
      ? [
          "Esta é uma imagem de máquina virtual: ela não vai para cartão SD.",
          "Descomprima antes de usar e inicie com o comando do README.txt.",
        ]
      : [
          "Grave com dd conv=fsync e verifique o checksum antes de usar.",
          "Apps de loja não estão na imagem; instale por /user.",
        ],
    generatedAt: new Date().toISOString(),
    generator: `giochi-os assemble ${GENERATOR_VERSION}`,
  };

  writeFileSync(path.join(outDir, "release.json"), `${JSON.stringify(release, null, 2)}\n`, "utf8");
  writeFileSync(
    path.join(outDir, "SHA256SUMS"),
    published.map((entry) => `${entry.sha256}  ${entry.name}`).join("\n") + "\n",
    "utf8",
  );
  writeFileSync(path.join(outDir, "README.txt"), readmeFor(release), "utf8");

  return {
    ok: true,
    release,
    errors,
    warnings,
    image: path.join(outDir, release.system.image),
    kernel: release.system.kernel ? path.join(outDir, release.system.kernel.name) : null,
  };
}

/**
 * Lê, de dentro da imagem, o índice de apps e as peças do controle virtual.
 *
 * Uma extração por imagem quando ela tem tabela de partição: no cartão o custo
 * é o `dd` da partição inteira, e olhar dois caminhos em duas chamadas pagaria
 * esse I/O duas vezes.
 *
 * `inspected: false` é "não consegui olhar" — diferente de "não tem".
 */
function inspectImage({ card, target }) {
  const ler = (ext4Path) => ({
    apps: readRootfsApps(ext4Path),
    gamepad: inspectGamepad(ext4Path),
  });

  // `inspected` continua vindo do índice de apps: é ele que decide
  // `apps.imageVerified`, e sem `debugfs` os dois lados devolvem
  // `inspected: false` — dizer `true` aqui faria a release anunciar
  // verificação que não houve.
  if (!card) {
    const lido = ler(target);
    return { inspected: Boolean(lido.apps.inspected), ...lido };
  }

  const aberta = withCardRootfs(target, ler);
  if (!aberta.ok) {
    return {
      inspected: false,
      apps: { ok: false, inspected: false, reason: aberta.reason },
      gamepad: {
        ok: false,
        inspected: false,
        reason: aberta.reason,
        complete: null,
        present: [],
        missing: [],
        notExecutable: [],
        map: null,
      },
    };
  }
  return {
    inspected: Boolean(aberta.result.apps.inspected),
    ...aberta.result,
  };
}

/**
 * Transforma a leitura do controle virtual em manifesto + avisos.
 *
 * `expected` é política, não fato: alvo virtual não tem gamepad físico, então
 * a ausência das peças lá é normal. Em aparelho de cartão, não ter o controle é
 * justamente o defeito silencioso que o contrato existe para evitar.
 */
function avaliarGamepad({ leitura, expected, artefato }) {
  const naoVerificado = !leitura || !leitura.inspected;
  const report = {
    expected,
    checked: !naoVerificado,
    complete: naoVerificado ? null : Boolean(leitura.complete),
    present: naoVerificado ? [] : leitura.present,
    missing: naoVerificado ? [] : leitura.missing,
    notExecutable: naoVerificado ? [] : leitura.notExecutable,
    map: naoVerificado ? null : leitura.map,
  };
  const warnings = [];

  if (naoVerificado) {
    if (expected) {
      warnings.push({
        code: "gamepad_nao_verificado",
        message:
          `${artefato} não pôde ser inspecionada (${leitura?.reason || "imagem comprimida na origem"}); ` +
          "não dá para afirmar que o controle virtual 'Giochi Gamepad' está na imagem",
      });
    }
    return { report, warnings };
  }

  if (expected && !report.complete) {
    const faltas = [
      ...report.missing,
      ...report.notExecutable.map((id) => `${id} (sem bit de execução)`),
    ];
    warnings.push({
      code: "gamepad_incompleto",
      message:
        `${artefato} não traz o controle virtual 'Giochi Gamepad': falta ${faltas.join(", ")}. ` +
        "O aparelho continua bootando e os jogos abrem, mas cada um responde no layout " +
        "deste aparelho — sem erro em lugar nenhum (GIOCHI-SYSTEM, AGENTS.md §12.74)",
    });
  }

  // Mapa sem calibração é o defeito do R35S até 17/11/2026: zero linhas
  // `axis_*`. O daemon não falha — ele repassa o valor cru limitado à faixa
  // canônica, e o analógico fica com quase nenhum curso.
  if (report.map && report.map.uncalibrated.length > 0) {
    warnings.push({
      code: "mapa_sem_calibracao",
      message:
        `${report.map.uncalibrated.length} de 4 eixo(s) sem min/max no buttons.map da imagem ` +
        `(${report.map.uncalibrated.join(", ")}); sem calibração o daemon repassa o valor cru ` +
        "limitado à faixa canônica — o analógico fica com curso mínimo e a inversão do Y se perde",
    });
  }

  return { report, warnings };
}

/**
 * Comprime (quando pedido) e mede o artefato já copiado.
 *
 * O hash é recalculado **sobre o arquivo que será publicado**, nunca herdado da
 * origem: `copyFileSync` num disco cheio trunca em silêncio, e o hash de origem
 * teria sido calculado sobre o arquivo íntegro.
 */
async function finalizeArtifact({ sourcePath, compress }) {
  let finalPath = sourcePath;

  if (compress) {
    const result = await compressFile({
      sourcePath,
      targetBase: sourcePath,
      preferred: compress,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    finalPath = result.path;
    // O cru não é publicado: manter os dois dobrando o download é convite a
    // baixar o arquivo errado.
    if (finalPath !== sourcePath) {
      unlinkSync(sourcePath);
    }
  }

  const sizeBytes = sizeOf(finalPath);
  const sha256 = await sha256File(finalPath);
  const name = path.basename(finalPath);
  const role = /\.(img|iso|sdcard)/i.test(stripCompression(name)) ? "image" : "kernel";

  return {
    ok: true,
    artifact: { role, name, sha256, sizeBytes, sizeHuman: humanSize(sizeBytes) },
  };
}

function readBuildrootVersion(systemDir) {
  try {
    const text = readFileSync(path.join(systemDir, "build-info.txt"), "utf8");
    const match = text.match(/^buildroot=(.+)$/m);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

function readmeFor(release) {
  const lines = [
    `Giochi OS — ${release.device.name}`,
    `device: ${release.device.id} (${release.device.arch}) · tipo: ${release.system.kind === "virtual" ? "máquina virtual" : "cartão SD"}`,
    `buildroot: ${release.system.buildroot || "?"}`,
    `imagem: ${release.system.image}`,
    `tamanho: ${release.system.sizeHuman}`,
    `sha256: ${release.system.imageSha256}`,
  ];

  if (release.system.kernel) {
    lines.push(`kernel: ${release.system.kernel.name} (${release.system.kernel.sizeHuman})`);
    lines.push(`sha256 do kernel: ${release.system.kernel.sha256}`);
  }

  lines.push("", "Antes de usar, confira o checksum:", "  sha256sum -c SHA256SUMS", "");

  if (release.boot) {
    const decompress = [release.system.image, release.system.kernel?.name]
      .filter(Boolean)
      .map((name) => decompressCommand(name))
      .filter(Boolean);

    if (decompress.length > 0) {
      lines.push("Descomprima (o QEMU lê o arquivo cru):", ...decompress.map((cmd) => `  ${cmd}`), "");
    }

    lines.push(
      "Iniciar na máquina virtual:",
      "",
      ...renderQemuCommand(release.boot)
        .split("\n")
        .map((line) => `  ${line}`),
      "",
      "Login: root (senha definida no build; o padrão é giochi-system).",
      "Para sair do console serial: Ctrl+A, depois X.",
      "",
      "Esta imagem é headless: o console serial é a interface.",
      "Os apps estão em /opt/giochi/apps e rodam à mão:",
      "  SDL_VIDEODRIVER=dummy /opt/giochi/apps/launcher/bin/giochi-launcher",
      "Os jogos 3D pedem GLES e não abrem sem pilha gráfica.",
      "",
      "Este arquivo é um disco de máquina virtual. Ele NÃO vai para cartão SD:",
      "gravar num cartão não produz um aparelho que inicializa.",
      "",
    );
  } else {
    // O `.img.xz` NÃO vai para o cartão: `dd` copiaria bytes de xz e o cartão
    // sairia com lixo. Quem publica comprimido tem de dizer isso antes do
    // comando, não depois — medido no primeiro empacotamento do X55, que
    // escrevia `dd if=giochi-...img.xz`.
    const descomprimir = decompressCommand(release.system.image);
    if (descomprimir) {
      lines.push("Descomprima primeiro (o dd grava bytes crus, não o .xz):", `  ${descomprimir}`, "");
    }
    const cru = stripCompression(release.system.image);

    lines.push(
      "Gravar no cartão (substitua /dev/sdX pelo dispositivo certo):",
      `  sudo dd if=${cru} of=/dev/sdX bs=4M conv=fsync status=progress`,
      "",
      "O cartão será apagado por completo. Confira o nome do dispositivo duas vezes.",
      "",
    );
  }

  lines.push(
    `Apps embutidos: ${release.apps.embedded.length}`,
    ...release.apps.embedded.map((app) => `  - ${app.id} ${app.version} (${app.license})`),
    "",
    `Apps de loja (fora da imagem): ${release.apps.store.length}`,
    ...release.apps.store.map((app) => `  - ${app.id} ${app.version} (${app.license})`),
    "",
  );

  // O controle virtual é o que faz o mesmo jogo responder igual em todo
  // aparelho. O README diz o que a imagem TEM — uma imagem incompleta aqui
  // continua bootando e abrindo jogo, e o sintoma só aparece no botão errado.
  const gamepad = release.input?.virtualGamepad;
  if (gamepad) {
    if (!gamepad.checked) {
      lines.push("Controle virtual: não verificado nesta imagem.", "");
    } else if (!gamepad.expected) {
      lines.push("Controle virtual: não se aplica (máquina virtual, sem gamepad físico).", "");
    } else if (gamepad.complete) {
      lines.push(
        "Controle virtual: completo (daemon, serviço, mapeamento e mapa na imagem).",
        "  no aparelho: /etc/init.d/S52gamepad status",
        "",
      );
    } else {
      const faltas = [
        ...gamepad.missing,
        ...gamepad.notExecutable.map((id) => `${id} (sem bit de execução)`),
      ];
      lines.push(
        `Controle virtual: INCOMPLETO — falta ${faltas.join(", ")}.`,
        "  Sem ele os jogos abrem, mas respondem no layout deste aparelho, sem erro na tela.",
        "",
      );
    }
  }

  return lines.join("\n");
}
