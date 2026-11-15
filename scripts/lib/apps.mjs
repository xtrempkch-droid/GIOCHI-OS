// Leitura do catálogo do Giochi app.
//
// Este repositório não importa código do Giochi app: recebe o **caminho** da
// pasta `app/` como argumento. Os dois repositórios continuam independentes, e
// a única coisa compartilhada é o contrato em JSON.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { isDir, isFile, listDir, readJson, sha256File } from "./fs.mjs";

const CAPA_SIZE = 320;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Dimensões de um PNG, ou null se não for PNG. */
export function pngSize(filePath) {
  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    return null;
  }
  if (buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function hasContent(dirPath) {
  if (!isDir(dirPath)) return false;
  return listDir(dirPath).some((name) => name !== ".gitkeep");
}

/**
 * Lê o catálogo de uma raiz, explícito ou derivado das pastas.
 *
 * ## Por que existe o modo derivado
 *
 * O contrato do projeto é um `apps.json` declarando cada app. O repositório de
 * jogos nasceu antes disso: tem `<jogo>/metadata.json` + `bin/` e mais nada, o
 * que é exatamente o formato que a fase `image` exige — só falta a lista.
 *
 * Recusar esse repositório obrigaria a copiar pasta de jogo para o catálogo do
 * Giochi app, que é o acoplamento que o contrato existe para evitar. Então:
 *
 * - `apps.json` presente  → ele MANDA (é o contrato);
 * - `apps.json` ausente   → varre os subdiretórios de um nível que tenham
 *   `metadata.json` e monta a lista, avisando que derivou.
 *
 * O derivado tem regras conservadoras:
 *
 * - `distribution`: `metadata.distribution` → `forge.json.distribution` →
 *   `"image"`. O default é `image` porque o diretório só chega aqui com `bin/`
 *   e `capa.png` no formato que a fase `image` valida; um app de loja não
 *   precisa de nada disso.
 * - `status`: `ready` quando `bin/` tem conteúdo, `scaffold` quando está vazio
 *   ou ausente — e `scaffold` é PULADO com aviso, nunca reprova o build.
 * - `id`: `metadata.slug` → nome da pasta.
 *
 * Erro de graça não existe: um `metadata.json` inválido em pasta descoberta
 * vira erro, porque publicar uma imagem com app pela metade é pior.
 */
function lerCatalogo(appsRoot) {
  const warnings = [];
  const indexPath = path.join(appsRoot, "apps.json");

  if (isFile(indexPath)) {
    try {
      const index = readJson(indexPath, "apps.json");
      return {
        ok: true,
        entries: Array.isArray(index.apps) ? index.apps : [],
        warnings,
      };
    } catch (error) {
      return { ok: false, entries: [], errors: [{ code: "indice_invalido", message: error.message }], warnings };
    }
  }

  // Modo derivado: só pastas de PRIMEIRO nível, o que evita `target/`, `vendor/`
  // e `crates/` — que existem nos repositórios de jogo e não são apps.
  const entries = [];
  for (const nome of listDir(appsRoot)) {
    const pasta = path.join(appsRoot, nome);
    if (!isDir(pasta)) continue;
    const metadataPath = path.join(pasta, "metadata.json");
    if (!isFile(metadataPath)) continue;

    let metadata;
    try {
      metadata = readJson(metadataPath, `${nome}/metadata.json`);
    } catch (error) {
      return {
        ok: false,
        entries: [],
        errors: [{ code: "metadata_invalido", message: `${nome}: ${error.message}` }],
        warnings,
      };
    }

    let forge = null;
    const forgePath = path.join(pasta, "forge.json");
    if (isFile(forgePath)) {
      try {
        forge = readJson(forgePath, `${nome}/forge.json`);
      } catch {
        // `forge.json` é declaração de REQUISITOS, não de distribuição: um
        // arquivo quebrado não impede embutir o app, e a fase `image` não o lê.
        forge = null;
      }
    }

    entries.push({
      id: String(metadata.slug || nome),
      folder: nome,
      runtime: String(metadata.runtime || "native"),
      status: hasContent(path.join(pasta, "bin")) ? "ready" : "scaffold",
      distribution: String(metadata.distribution || forge?.distribution || "image"),
      license: String(metadata.license || ""),
    });
  }

  if (entries.length > 0) {
    warnings.push({
      code: "catalogo_derivado",
      message:
        `${appsRoot} não tem apps.json; o catálogo foi derivado de ${entries.length} ` +
        "pasta(s) com metadata.json. Declare um apps.json para fixar status e distribuição",
    });
  }

  return { ok: true, entries, warnings };
}

/**
 * Carrega e classifica os apps.
 *
 * `image`  — entra na imagem assinada; precisa estar completo.
 * `store`  — vai ao lado, instalado em /user; precisa só do metadata.
 * `host`   — roda no PC; ignorado aqui.
 * scaffold — ainda não migrado; pulado com aviso, não reprova.
 */
export async function loadApps(appsRoot) {
  const errors = [];
  const warnings = [];
  const embedded = [];
  const external = [];
  const skipped = [];

  const catalogo = lerCatalogo(appsRoot);
  if (!catalogo.ok) {
    return {
      ok: false,
      embedded,
      external,
      skipped,
      errors: catalogo.errors,
      warnings,
    };
  }
  warnings.push(...catalogo.warnings);

  const entries = catalogo.entries;
  if (entries.length === 0) {
    warnings.push({ code: "catalogo_vazio", message: `${appsRoot} não declara nenhum app` });
  }

  for (const entry of entries) {
    const id = String(entry.id || "");
    const folder = String(entry.folder || id);
    const appDir = path.join(appsRoot, folder);
    const distribution = entry.distribution || "image";
    const status = entry.status || "ready";

    if (distribution === "host") {
      skipped.push({ id, reason: "host: roda no PC, não entra na imagem" });
      continue;
    }

    if (!isDir(appDir)) {
      errors.push({
        code: "pasta_ausente",
        message: `${id}: pasta não existe (${appDir})`,
      });
      continue;
    }

    const metadataPath = path.join(appDir, "metadata.json");
    let metadata = null;
    if (isFile(metadataPath)) {
      try {
        metadata = readJson(metadataPath, `${id}/metadata.json`);
      } catch (error) {
        errors.push({ code: "metadata_invalido", message: `${id}: ${error.message}` });
        continue;
      }
    } else {
      errors.push({ code: "metadata_ausente", message: `${id}: metadata.json é obrigatório` });
      continue;
    }

    // Regra de licença: defesa em profundidade. O validador do Giochi app já
    // recusa, mas o empacotamento não pode depender de o outro repositório ter
    // rodado o validador.
    const license = String(metadata.license || "");
    if (distribution === "image" && /^(A?GPL|LGPL)/i.test(license)) {
      errors.push({
        code: "licenca_gpl_na_imagem",
        message:
          `${id}: "${license}" não pode entrar na imagem assinada (GPL §6 + raiz assinada). ` +
          `Mude distribution para "store".`,
      });
      continue;
    }

    if (distribution === "store") {
      external.push({
        id,
        version: String(metadata.version || ""),
        license,
        folder,
        dir: appDir,
      });
      continue;
    }

    // Daqui para baixo: distribution === "image".
    if (status === "scaffold") {
      skipped.push({ id, reason: "scaffold: fonte não migrada ou binário não exportado" });
      continue;
    }

    const binDir = path.join(appDir, "bin");
    if (!hasContent(binDir)) {
      errors.push({
        code: "bin_vazio",
        message: `${id}: app marcado como pronto para a imagem, mas bin/ está vazio`,
      });
      continue;
    }

    const entrypoint = String(metadata.entrypoint || "");
    const entryPath = path.resolve(appDir, entrypoint);
    if (!entrypoint.startsWith("bin/") || !isFile(entryPath)) {
      errors.push({
        code: "entrypoint_ausente",
        message: `${id}: entrypoint "${entrypoint}" não existe dentro de bin/`,
      });
      continue;
    }

    const capa = path.join(appDir, "capa.png");
    if (!isFile(capa)) {
      errors.push({ code: "capa_ausente", message: `${id}: capa.png é obrigatória na imagem` });
      continue;
    }
    const size = pngSize(capa);
    if (!size) {
      errors.push({ code: "capa_invalida", message: `${id}: capa.png não é PNG válido` });
      continue;
    }
    if (size.width !== CAPA_SIZE || size.height !== CAPA_SIZE) {
      errors.push({
        code: "capa_dimensao",
        message: `${id}: capa.png precisa ser ${CAPA_SIZE}x${CAPA_SIZE}, tem ${size.width}x${size.height}`,
      });
      continue;
    }

    const files = [];
    const walkDir = (dir, base) => {
      for (const name of listDir(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          walkDir(full, base);
        } else if (isFile(full)) {
          files.push(path.relative(appDir, full).split(path.sep).join("/"));
        }
      }
    };
    walkDir(binDir, appDir);

    const hashes = {};
    for (const relative of files.sort()) {
      hashes[relative] = await sha256File(path.join(appDir, relative));
    }

    embedded.push({
      id,
      version: String(metadata.version || ""),
      license,
      folder,
      dir: appDir,
      entrypoint,
      files,
      hashes,
    });
  }

  if (embedded.length === 0 && external.length === 0 && errors.length === 0) {
    warnings.push({
      code: "nada_para_empacotar",
      message: "nenhum app pronto para a imagem e nenhum app de loja",
    });
  }

  return {
    ok: errors.length === 0,
    embedded,
    external,
    skipped,
    errors,
    warnings,
  };
}

/**
 * Carrega VÁRIOS catálogos e junta num só.
 *
 * Existe porque um projeto não cabe mais num `apps.json`: o launcher e a loja
 * vivem no repositório do Giochi app, e os jogos passam a viver no deles. Sem
 * isto, embutir um jogo exigiria copiar a pasta dele para o catálogo do outro
 * repositório — que é exatamente o acoplamento que o contrato evita.
 *
 * Cada raiz vem do `loadApps`, então aceita as duas formas: `apps.json`
 * declarado ou catálogo derivado das pastas (ver `lerCatalogo`). As
 * classificações (`embedded`, `external`, `skipped`) são concatenadas, e a
 * versão de cada app vem do `metadata.json` da própria pasta, não do índice.
 *
 * `id` repetido entre catálogos é ERRO, não "o último vence": dois apps com o
 * mesmo id escreveriam em `/opt/giochi/apps/<id>` e um apagaria o outro — com
 * o `index.json` anunciando os dois.
 */
export async function loadAppsFromRoots(roots) {
  const errors = [];
  const warnings = [];
  const embedded = [];
  const external = [];
  const skipped = [];
  const origem = new Map();

  for (const root of roots) {
    const resultado = await loadApps(root);
    errors.push(...resultado.errors);
    warnings.push(...resultado.warnings);
    skipped.push(...resultado.skipped);

    for (const app of resultado.embedded) {
      if (origem.has(app.id)) {
        errors.push({
          code: "id_duplicado",
          message: `app "${app.id}" aparece em ${origem.get(app.id)} e em ${root}`,
        });
        continue;
      }
      origem.set(app.id, root);
      embedded.push(app);
    }

    for (const app of resultado.external) {
      if (origem.has(app.id)) {
        errors.push({
          code: "id_duplicado",
          message: `app "${app.id}" aparece em ${origem.get(app.id)} e em ${root}`,
        });
        continue;
      }
      origem.set(app.id, root);
      external.push(app);
    }
  }

  return { ok: errors.length === 0, embedded, external, skipped, errors, warnings };
}
