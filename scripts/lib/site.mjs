// Geração da página de download a partir das releases.
//
// Por que gerar HTML em vez de buscar JSON no navegador: a página precisa abrir
// direto do disco (`file://`), sem servidor e sem CORS. Com os dados embutidos,
// `index.html` é a página inteira.
//
// ## Um arquivo, dois destinos
//
// `singleFile: true` produz UM `index.html` autocontido — CSS no `<style>`, marca
// em SVG, logo embutido — e os downloads apontando para a release do GitHub. É o
// que fica na raiz do repositório: o GitHub Pages publica o repositório, então a
// página existe sem depender de nenhum job de deploy.
//
// `singleFile: false` mantém o modo antigo: `index.html` + `assets/` +
// `downloads/`, para abrir uma cópia local com as imagens ao lado. A estrutura da
// página é a MESMA nos dois casos — um template só, senão as duas versões
// divergem, e a que ninguém abre é a que quebra.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { humanSize, isDir, isFile, listDir, readJson, walk } from "./fs.mjs";
import { IDIOMAS, PADRAO, TEXTOS, validarTraducoes } from "./i18n.mjs";
import { decompressCommand, renderQemuCommand } from "./qemu.mjs";
import { nomeComAparelho } from "./release-assets.mjs";

export const DEFAULT_REPO = "xtrempkch-droid/GIOCHI-OS";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]),
  );
}

/**
 * Marca do cabeçalho, em SVG.
 *
 * Embutida em vez de ser o PNG de 126 KB reduzido a 28×28: o arquivo não
 * carrega informação que justifique o peso, e SVG inline não é um segundo arquivo.
 */
const MARK_SVG = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <defs><linearGradient id="giochi-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8ed0f8"/><stop offset="1" stop-color="#1f6feb"/>
        </linearGradient></defs>
        <rect width="32" height="32" rx="8" fill="url(#giochi-mark)"/>
        <circle cx="12.4" cy="16" r="4.5" fill="none" stroke="#04121d" stroke-width="2.2"/>
        <path d="M19.6 11.7l5.6 8.6M25.2 11.7l-5.6 8.6" stroke="#04121d" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;

/** Favicon como data URI: um arquivo a menos, nenhuma requisição. */
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="8" fill="#1f6feb"/>
<circle cx="12.4" cy="16" r="4.5" fill="none" stroke="#04121d" stroke-width="2.6"/>
<path d="M19.6 11.7l5.6 8.6M25.2 11.7l-5.6 8.6" stroke="#04121d" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;

function faviconUri() {
  return `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG.replace(/\n/g, ""))}`;
}

/** Raiz dos anexos de uma versão, com a barra final. */
function releaseBase(repo, version) {
  const tag = `v${String(version || "").replace(/^v/, "")}`;
  return `https://github.com/${repo}/releases/download/${tag}/`;
}

/** Coleta `release.json` em qualquer profundidade. */
export function collectReleases(distDir) {
  const releases = [];
  const problems = [];

  if (!isDir(distDir)) {
    return { releases, problems: [{ message: `pasta não encontrada: ${distDir}` }] };
  }

  for (const relative of walk(distDir)) {
    // Dois layouts, e os dois acontecem de verdade:
    //
    //   dist/<device>/release.json      saída da fase `package`
    //   dist/<device>-release.json      depois do `flatten`, que tira o
    //                                   manifesto de dentro da pasta para os
    //                                   anexos não colidirem na release
    //
    // Aceitar só o primeiro fazia `--single-file` falhar no CI com "nenhum
    // release.json encontrado" — depois de a release já ter sido publicada.
    const base = path.basename(relative);
    if (base !== "release.json" && !base.endsWith("-release.json")) continue;

    const full = path.join(distDir, relative);
    try {
      const release = readJson(full, "release.json");
      const holder = path.dirname(full);
      // No layout achatado o manifesto fica AO LADO da pasta do aparelho, e é
      // lá que as imagens estão.
      const irmao = path.join(holder, release.device?.id || "");
      release.__dir = isDir(irmao) ? irmao : holder;
      release.__relative = path.relative(distDir, release.__dir).split(path.sep).join("/");
      releases.push(release);
    } catch (error) {
      problems.push({ message: `${relative}: ${error.message}` });
    }
  }

  // Cartão antes de máquina virtual, e depois por nome: a ordem da página é a
  // ordem em que a maioria chega aqui — quem tem o aparelho quer o cartão.
  const peso = (release) =>
    (release.system?.kind === "virtual" || release.device?.kind === "virtual") ? 1 : 0;
  releases.sort((a, b) => {
    const porTipo = peso(a) - peso(b);
    if (porTipo !== 0) return porTipo;
    return String(a.device?.name || "").localeCompare(String(b.device?.name || ""));
  });
  return { releases, problems };
}

// ── i18n no HTML ───────────────────────────────────────────
//
// O gerador faz duas coisas com o dicionário:
//
//   1. escreve o idioma PADRÃO dentro dos elementos marcados com `data-i18n`,
//      para a página existir inteira sem JavaScript;
//   2. embute o dicionário e um script de 2 KB que troca os textos quando o
//      visitante escolhe outro idioma.
//
// A ordem importa: preencher ANTES de injetar os dados de idioma, senão o
// próprio bloco JSON seria preenchido.

/**
 * Desfaz as entidades que `jsonAtributo` escreveu.
 *
 * O valor lido do HTML chega escapado (`&quot;`…). O navegador desfaz isso
 * sozinho ao entregar o atributo; aqui, que lemos o HTML como texto, temos de
 * desfazer na mão.
 */
function decodificarAtributo(valor) {
  return valor
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Troca `{n}`, `{size}` e `{data}` pelos valores do elemento.
 *
 * A substituição é a mesma que o script faz no navegador — se divergissem, a
 * página mudaria de texto ao clicar num idioma sem mudar de idioma.
 */
function aplicarVars(texto, varsJson) {
  if (!varsJson) return texto;
  let mapa;
  try {
    mapa = JSON.parse(decodificarAtributo(varsJson));
  } catch {
    return texto;
  }
  let saida = texto;
  for (const [chave, valor] of Object.entries(mapa)) {
    saida = saida.split(`{${chave}}`).join(String(valor));
  }
  return saida;
}

/**
 * Preenche o idioma padrão em todo elemento vazio marcado com `data-i18n`.
 *
 * O elemento pode ter OUTROS atributos depois do `data-i18n` — e tem, quando há
 * número no texto (`data-i18n-vars`). Uma primeira versão casava só
 * `data-i18n="chave"></` e deixava de fora justamente os textos com número: os
 * botões de download e o resumo dos apps apareciam VAZIOS para quem chega sem
 * JavaScript. Por isso a varredura é da tag de abertura inteira.
 *
 * Devolve o HTML e as chaves usadas — comparar com o dicionário é o que prova
 * que template e traduções falam do mesmo conjunto.
 */
export function preencherPadrao(html, textos) {
  const usadas = new Set();
  const faltando = [];

  let saida = html.replace(
    /<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?\s+data-i18n(?:-html)?="([^"]+)"(?:\s+[^<>]*?)?)>\s*<\/\1>/g,
    (todo, tag, atributos, chave) => {
      usadas.add(chave);
      const valor = textos[chave];
      if (valor == null) {
        faltando.push(chave);
        return todo;
      }
      // O atributo é escrito com aspas simples (o JSON tem aspas duplas
      // dentro), então procurar só `"` não acha nada — e o texto saía com
      // `{size}` literal na tela.
      const vars = /data-i18n-vars=(?:"([^"]*)"|'([^']*)')/.exec(atributos);
      const texto = aplicarVars(valor, vars ? vars[1] ?? vars[2] : null);
      const ehHtml = /data-i18n-html=/.test(atributos);
      return `<${tag}${atributos}>${ehHtml ? texto : escapeHtml(texto)}</${tag}>`;
    },
  );

  // `content` de `<meta>` não é conteúdo de elemento: é atributo.
  saida = saida.replace(/<meta([^<>]*\sdata-i18n-content="([^"]+)"[^<>]*)>/g, (todo, atributos, chave) => {
    usadas.add(chave);
    const valor = textos[chave];
    if (valor == null) {
      faltando.push(chave);
      return todo;
    }
    const escapado = escapeHtml(valor);
    const comConteudo = /\scontent="[^"]*"/.test(atributos)
      ? atributos.replace(/\scontent="[^"]*"/, ` content="${escapado}"`)
      : `${atributos} content="${escapado}"`;
    return `<meta${comConteudo}>`;
  });

  return { html: saida, usadas, faltando };
}

/**
 * JSON para dentro de um atributo HTML com aspas simples.
 *
 * `escapeHtml` NÃO serve aqui: ele troca `"` por `&quot;`, e o navegador não
 * desfaz isso ao ler o atributo — o `JSON.parse` do script recebia
 * `{&quot;n&quot;:6}` e estourava, derrubando a troca de idioma na página
 * inteira. Aqui só o que quebraria o atributo é escapado: `&`, `'` e `<`.
 */
function jsonAtributo(valor) {
  return JSON.stringify(valor).replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

/** Item do seletor de idioma. O nome fica no próprio alfabeto. */
function renderIdioma(idioma, atual) {
  return (
    `<li><button type="button" data-lang="${idioma.code}" lang="${idioma.bcp47}"` +
    `${idioma.code === atual ? ' aria-current="true"' : ""}>` +
    `<span>${escapeHtml(idioma.proprio)}</span>` +
    `<small>${escapeHtml(idioma.nome)}</small></button></li>`
  );
}

/**
 * Script de troca de idioma.
 *
 * Fica embutido na página (nada externo) e é o ÚNICO JavaScript do arquivo. Ele
 * não cria conteúdo: só troca textos que já estão no HTML pelo idioma embutido
 * no JSON ao lado. Se falhar, a página continua inteira no idioma padrão.
 */
const SCRIPT_IDIOMA = String.raw`
(function () {
  var dados = JSON.parse(document.getElementById("i18n-dados").textContent);
  var idiomas = dados.idiomas;
  var textos = dados.textos;
  var raiz = document.documentElement;
  var CHAVE = "giochi-idioma";

  function porCodigo(codigo) {
    for (var i = 0; i < idiomas.length; i += 1) {
      if (idiomas[i].code === codigo) return idiomas[i];
    }
    return null;
  }

  // Substitui {n}, {size}, {modelo}… pelos valores do próprio elemento.
  // Precisa valer para as duas formas de marcacao: as observacoes de aparelho
  // usam a variante HTML (tem tag code) e levam o painel e os aparelhos
  // compativeis nas variaveis — sem isto, o texto trocava de idioma e deixava
  // o marcador cru na tela.
  function comVars(elemento, texto) {
    var vars = elemento.getAttribute("data-i18n-vars");
    if (!vars) return texto;
    var mapa;
    try { mapa = JSON.parse(vars); } catch (e) { return texto; }
    for (var k in mapa) {
      texto = texto.split("{" + k + "}").join(mapa[k]);
    }
    return texto;
  }

  function aplicar(codigo) {
    var idioma = porCodigo(codigo);
    if (!idioma) return false;
    var t = textos[codigo];
    raiz.lang = idioma.bcp47;
    raiz.dir = idioma.dir;

    var alvos = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < alvos.length; i += 1) {
      var chave = alvos[i].getAttribute("data-i18n");
      var valor = t[chave];
      if (valor == null) continue;
      alvos[i].textContent = comVars(alvos[i], valor);
    }

    var comHtml = document.querySelectorAll("[data-i18n-html]");
    for (var j = 0; j < comHtml.length; j += 1) {
      var k2 = comHtml[j].getAttribute("data-i18n-html");
      if (t[k2] != null) comHtml[j].innerHTML = comVars(comHtml[j], t[k2]);
    }

    var comConteudo = document.querySelectorAll("[data-i18n-content]");
    for (var m = 0; m < comConteudo.length; m += 1) {
      var k3 = comConteudo[m].getAttribute("data-i18n-content");
      if (t[k3] != null) comConteudo[m].setAttribute("content", t[k3]);
    }

    var botoes = document.querySelectorAll("[data-lang]");
    for (var b = 0; b < botoes.length; b += 1) {
      if (botoes[b].getAttribute("data-lang") === codigo) {
        botoes[b].setAttribute("aria-current", "true");
      } else {
        botoes[b].removeAttribute("aria-current");
      }
    }

    var rotulo = document.getElementById("idioma-atual");
    if (rotulo) rotulo.textContent = idioma.proprio;

    try { localStorage.setItem(CHAVE, codigo); } catch (e) {}
    return true;
  }

  function doNavegador() {
    var lista = navigator.languages || [navigator.language || ""];
    for (var i = 0; i < lista.length; i += 1) {
      var codigo = String(lista[i]).toLowerCase().split("-")[0];
      if (porCodigo(codigo)) return codigo;
    }
    return null;
  }

  var salvo = null;
  try { salvo = localStorage.getItem(CHAVE); } catch (e) {}
  var inicial = (salvo && porCodigo(salvo))
    ? salvo
    : (doNavegador() || dados.padrao);
  aplicar(inicial);

  document.addEventListener("click", function (evento) {
    var botao = evento.target.closest("[data-lang]");
    if (!botao) return;
    aplicar(botao.getAttribute("data-lang"));
    var detalhe = botao.closest("details");
    if (detalhe) detalhe.open = false;
  });
})();
`;

// ── copiar a chave PIX ─────────────────────────────────────
//
// `navigator.clipboard` exige contexto seguro: em `https://` funciona, em
// `file://` não (e a página é feita para abrir do disco também). Por isso o
// caminho antigo (`select` + `execCommand`) existe aqui, e por isso a chave
// aparece como TEXTO ao lado do botão: se os dois caminhos falharem, ainda dá
// para selecionar e copiar na mão.
//
// As mensagens vêm do dicionário (`donate.copied` / `donate.copyFailed`), então
// o aviso também troca de idioma.
const SCRIPT_PIX = String.raw`
(function () {
  var botao = document.getElementById("copiar-pix");
  var chave = document.getElementById("chave-pix");
  var estado = document.getElementById("copiar-estado");
  var dados = JSON.parse(document.getElementById("i18n-dados").textContent);
  if (!botao || !chave || !estado) return;

  function avisar(chaveTexto) {
    var atual = document.documentElement.lang.split("-")[0];
    var textos = dados.textos[atual] || dados.textos[dados.padrao];
    estado.textContent = textos[chaveTexto];
  }

  function selecionar() {
    var faixa = document.createRange();
    faixa.selectNodeContents(chave);
    var selecao = window.getSelection();
    selecao.removeAllRanges();
    selecao.addRange(faixa);
  }

  botao.addEventListener("click", function () {
    var valor = chave.textContent.trim();
    selecionar();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(valor).then(
        function () { avisar("donate.copied"); },
        function () { avisar("donate.copyFailed"); }
      );
      return;
    }
    try {
      avisar(document.execCommand("copy") ? "donate.copied" : "donate.copyFailed");
    } catch (erro) {
      avisar("donate.copyFailed");
    }
  });

  // O aviso some quando o idioma muda? Não: ele é reescrito na próxima cópia.
  // Mas se o visitante troca de idioma com o aviso na tela, ele fica no idioma
  // antigo — então limpamos.
  document.addEventListener("click", function (evento) {
    if (evento.target.closest && evento.target.closest("[data-lang]")) estado.textContent = "";
  });
})();
`;

function renderIdiomas(atual) {
  return IDIOMAS.map((idioma) => renderIdioma(idioma, atual)).join("\n              ");
}

function isVirtualRelease(release) {
  const system = release.system || {};
  const device = release.device || {};
  return system.kind === "virtual" || device.kind === "virtual";
}

function deviceAnchor(release) {
  return `baixar-${release.device?.id || "desconhecido"}`;
}

function appsDe(release) {
  const apps = release.apps || {};
  return [...(apps.embedded || []), ...(apps.store || [])];
}

/**
 * Observações do aparelho, como lista traduzível.
 *
 * Cada item é um `<li>` com `data-i18n` e `data-i18n-vars`: a FRASE vem do
 * dicionário (traduzida nos dez idiomas) e o DADO (`panel4`, `R36S`) vem de
 * `device-notes.mjs`. Escrever a frase inteira no dado a deixaria só em
 * português no meio de uma página em árabe.
 *
 * Fica FORA do `<details>` e antes dos botões: é aviso, não detalhe. Esconder
 * "esta imagem foi testada com outro painel" atrás de um clique é o mesmo que
 * não avisar.
 */
function renderObservacoes(release) {
  const notas = release.device?.observations || [];
  if (notas.length === 0) return "";

  const itens = notas
    .map((nota) => {
      const vars = {};
      for (const [chave, valor] of Object.entries(nota.vars || {})) {
        vars[chave] = Array.isArray(valor) ? valor.join(", ") : String(valor);
      }
      return (
        `<li data-i18n-html="note.${escapeHtml(nota.tipo)}" ` +
        `data-i18n-vars='${jsonAtributo(vars)}'></li>`
      );
    })
    .join("\n          ");

  return `
      <aside class="notas">
        <h3 data-i18n="note.title"></h3>
        <ul>
          ${itens}
        </ul>
      </aside>`;
}

/** Card de um aparelho: o que baixar, quanto pesa, o que tem dentro. */
function renderRelease(release) {
  const device = release.device || {};
  const system = release.system || {};
  const apps = release.apps || { embedded: [], store: [] };
  const sha = String(system.imageSha256 || "");
  const virtual = isVirtualRelease(release);
  const size = system.sizeHuman || (system.sizeBytes ? humanSize(system.sizeBytes) : "—");
  const kindLabel = virtual ? "Máquina virtual" : "Cartão SD";

  const appList = appsDe(release)
    .map((app) => `<li><span>${escapeHtml(app.id)}</span><em>${escapeHtml(app.version)}</em></li>`)
    .join("");

  // `data-i18n-vars` leva os números para o script: o texto de cada idioma tem
  // o marcador `{size}` e o script substitui. Texto montado em JS seria texto
  // que não existe sem JS.
  const varsSize = jsonAtributo({ size });
  const botoes = [
    release.__href
      ? `<a class="btn" href="${escapeHtml(release.__href)}" download ` +
        `data-i18n="${virtual ? "card.downloadDisk" : "card.downloadCard"}" ` +
        `data-i18n-vars='${varsSize}'></a>`
      : `<span class="btn btn-off" data-i18n="card.unavailable"></span>`,
    // O kernel é um download separado no alvo virtual, e sem ele o disco não
    // inicia. Escondê-lo transformaria o botão principal num link que não boota.
    release.__kernelHref
      ? `<a class="btn btn-ghost" href="${escapeHtml(release.__kernelHref)}" download ` +
        `data-i18n="card.kernelButton" ` +
        `data-i18n-vars='${jsonAtributo({ size: system.kernel?.sizeHuman || "" })}'></a>`
      : "",
    release.__sumsHref
      ? `<a class="btn btn-ghost" href="${escapeHtml(release.__sumsHref)}" download data-i18n="card.checksum"></a>`
      : "",
    release.__readmeHref
      ? `<a class="btn btn-ghost" href="${escapeHtml(release.__readmeHref)}" download data-i18n="card.instructions"></a>`
      : "",
  ].filter(Boolean);

  return `
    <article class="card${virtual ? " card-vm" : ""}" id="${escapeHtml(deviceAnchor(release))}">
      <header>
        <div>
          <h2>${escapeHtml(device.name || device.id || "Dispositivo")}</h2>
          <p class="muted">${escapeHtml(device.id || "?")} · ${escapeHtml(device.arch || "?")} · <span data-i18n="${virtual ? "card.kindVirtual" : "card.kindCard"}"></span></p>
        </div>
        <span class="badge">${escapeHtml(system.version || "dev")}</span>
      </header>

      <dl class="specs">
        <div><dt data-i18n="card.size"></dt><dd>${escapeHtml(size)}</dd></div>
        <div><dt data-i18n="card.buildroot"></dt><dd>${escapeHtml(system.buildroot || "—")}</dd></div>
        <div><dt data-i18n="card.appsImage"></dt><dd>${apps.embedded?.length || 0}</dd></div>
        <div><dt data-i18n="card.appsStore"></dt><dd>${apps.store?.length || 0}</dd></div>
        ${system.kernel ? `<div><dt data-i18n="card.kernel"></dt><dd class="mono">${escapeHtml(system.kernel.name)}</dd></div>` : ""}
      </dl>

      ${sha ? `<p class="sha" dir="ltr">sha256 ${escapeHtml(sha)}</p>` : ""}
${renderObservacoes(release)}
      ${
        appList
          ? `<details><summary data-i18n="card.showApps" data-i18n-vars='${jsonAtributo({ n: appsDe(release).length })}'></summary><ul class="apps">${appList}</ul></details>`
          : ""
      }

      ${virtual ? renderRunBlock(release) : renderCardHint(system)}

      <div class="downlinks">${botoes.join("\n        ")}</div>
      <p class="muted mono small">${escapeHtml(system.image || "")}</p>
    </article>`;
}

/**
 * Aviso para imagem de cartão comprimida.
 *
 * O botão baixa um `.img.xz`; gravar isso direto no cartão produz um aparelho que
 * não inicializa, porque o `dd` copia bytes de xz. O passo de descomprimir tem de
 * estar na mesma tela do botão — a seção "Gravar" fica abaixo, e quem baixou não
 * necessariamente desce até lá.
 */
function renderCardHint(system) {
  const descomprimir = decompressCommand(system.image);
  if (!descomprimir) return "";

  return `
      <p class="muted small hint" data-i18n-html="card.hintTitle"></p>
      <pre class="hint"><code>${escapeHtml(descomprimir)}</code></pre>`;
}

/**
 * Bloco "como rodar" dos alvos virtuais.
 *
 * O comando é o mesmo do `README.txt` da release: sai de `renderQemuCommand`, não
 * de uma cópia. Se o `-append` mudar, muda nos dois lugares de uma vez.
 */
function renderRunBlock(release) {
  const system = release.system || {};
  const boot = release.boot || {};
  if (!boot.disk) return "";

  const decompress = [system.image, system.kernel?.name]
    .filter(Boolean)
    .map((name) => decompressCommand(name))
    .filter(Boolean);

  return `
      <details class="run">
        <summary data-i18n="card.runSummary"></summary>
        ${
          decompress.length > 0
            ? `<p class="muted" data-i18n="card.runFirst"></p><pre dir="ltr"><code>${decompress.map(escapeHtml).join("\n")}</code></pre>`
            : ""
        }
        <pre dir="ltr"><code>${escapeHtml(renderQemuCommand(boot))}</code></pre>
        <p class="muted" data-i18n-html="card.runNotes"></p>
      </details>`;
}

function renderItemList(items) {
  return items.map((item) => `<li>${item}</li>`).join("\n              ");
}

/** Itens do submenu "Baixar": um por aparelho, com o tipo ao lado. */
function renderNavDownloads(releases) {
  return releases
    .map(
      (release) =>
        `<li><a href="#${escapeHtml(deviceAnchor(release))}">${escapeHtml(
          release.device?.name || release.device?.id || "?",
        )} <span data-i18n="${isVirtualRelease(release) ? "card.kindVirtual" : "card.kindCard"}"></span></a></li>`,
    )
    .join("\n              ");
}

/** Itens do submenu "Aparelhos": leva à linha da tabela de cada um. */
function renderNavDevices(releases) {
  return releases
    .map(
      (release) => `<li><a href="#aparelho-${escapeHtml(
        release.device?.id || "?",
      )}">${escapeHtml(release.device?.id || "?")} <span>${escapeHtml(
        release.device?.arch || "",
      )}</span></a></li>`,
    )
    .join("\n              ");
}

/** Linhas da tabela "Aparelhos suportados". */
function renderDeviceRows(releases) {
  return releases
    .map((release) => {
      const device = release.device || {};
      const system = release.system || {};
      const size = system.sizeHuman || (system.sizeBytes ? humanSize(system.sizeBytes) : "—");
      return `            <tr id="aparelho-${escapeHtml(device.id || "?")}">
              <td><a href="#${escapeHtml(deviceAnchor(release))}">${escapeHtml(device.name || device.id || "?")}</a>${
                (release.device?.observations || []).length > 0
                  ? ' <span class="marca-nota" aria-hidden="true" title="observações">•</span>'
                  : ""
              }</td>
              <td class="mono">${escapeHtml(device.id || "?")}</td>
              <td>${escapeHtml(device.arch || "—")}</td>
              <td data-i18n="${isVirtualRelease(release) ? "card.kindVirtual" : "card.kindCard"}"></td>
              <td>${escapeHtml(system.version || "—")}</td>
              <td>${escapeHtml(size)}</td>
              <td>${appsDe(release).length}</td>
            </tr>`;
    })
    .join("\n");
}

function linkNome(href, nome) {
  return href
    ? `<a href="${escapeHtml(href)}" download>${escapeHtml(nome)}</a>`
    : `<span class="muted mono">${escapeHtml(nome)}</span>`;
}

function renderSumsLinks(releases) {
  return renderItemList(
    releases.map((release) =>
      linkNome(release.__sumsHref, nomeComAparelho(release.device?.id || "?", "SHA256SUMS")),
    ),
  );
}

function renderReadmeLinks(releases) {
  return renderItemList(
    releases.map((release) =>
      linkNome(release.__readmeHref, nomeComAparelho(release.device?.id || "?", "README.txt")),
    ),
  );
}

/**
 * Bloco genérico do QEMU.
 *
 * Usa o primeiro alvo virtual publicado: é o mesmo comando do card daquele
 * aparelho, e uma seção "como rodar" que discorda do card é pior que não ter.
 */
function renderQemuGeneric(releases) {
  const virtual = releases.find((release) => isVirtualRelease(release));
  if (!virtual || !virtual.boot?.disk) {
    return `<p class="muted" data-i18n="qemu.empty"></p>`;
  }
  return renderRunBlock(virtual);
}

/** Links dos repositórios: os três que compõem a imagem, mais este. */
function renderRepoLinks(repo, releases) {
  const itens = [
    ["GIOCHI-SYSTEM", "repos.system"],
    ["GIOCHI-APP", "repos.app"],
    ["GIOCHI-GAMES", "repos.games"],
    ["GIOCHI-OS", "repos.os"],
  ].map(([nome, chave]) => {
    const slug = nome === "GIOCHI-OS" ? repo : `${repo.split("/")[0]}/${nome}`;
    return (
      `<li><a href="https://github.com/${escapeHtml(slug)}">${escapeHtml(nome)} ` +
      `<span class="muted small">— <span data-i18n="${chave}"></span></span></a></li>`
    );
  });

  const versao = releases[0]?.system?.version;
  if (versao) {
    itens.push(
      `<li><a href="https://github.com/${escapeHtml(repo)}/releases" data-i18n="repos.all"></a></li>`,
    );
  }
  return itens.join("\n        ");
}

function renderFooterLinks(repo) {
  return (
    `<a href="https://github.com/${escapeHtml(repo)}" data-i18n="foot.code"></a> · ` +
    `<a href="https://github.com/${escapeHtml(repo)}/releases" data-i18n="foot.releases"></a> · ` +
    `<a href="https://github.com/${escapeHtml(repo)}/blob/main/AGENTS.md" data-i18n="foot.docs"></a>`
  );
}

/**
 * Resolve os links de cada release.
 *
 * `downloadBase` (a release do GitHub) tem precedência: é o destino real da
 * página publicada. Sem ele, aponta para as cópias locais.
 */
function resolveLinks({ releases, downloadBase, copyImages, singleFile, repo }) {
  const warnings = [];

  for (const release of releases) {
    const deviceId = release.device?.id || "desconhecido";
    const system = release.system || {};
    const version = system.version;
    const imageName = system.image;
    const kernelName = system.kernel?.name;
    const sumsName = nomeComAparelho(deviceId, "SHA256SUMS");
    const readmeName = nomeComAparelho(deviceId, "README.txt");
    const targetDir = path.join(release.__dir, "__downloads");

    // O arquivo único não tem imagem ao lado: o destino é a release do GitHub.
    // A URL sai da MESMA versão que nomeia o arquivo, então link e nome não
    // podem discordar.
    const base = downloadBase || (singleFile && version ? releaseBase(repo, version) : null);
    const localPrefix = copyImages ? `downloads/${deviceId}` : release.__relative;

    release.__href = null;
    release.__kernelHref = null;
    release.__sumsHref = null;
    release.__readmeHref = null;

    if (base) {
      if (imageName) release.__href = `${base}${imageName}`;
      if (kernelName) release.__kernelHref = `${base}${kernelName}`;
      release.__sumsHref = `${base}${sumsName}`;
      release.__readmeHref = `${base}${readmeName}`;
      continue;
    }

    if (imageName) {
      if (!isFile(path.join(release.__dir, imageName))) {
        warnings.push({
          message: `${deviceId}: imagem não encontrada em ${release.__dir}; o card sai sem link`,
        });
      } else {
        release.__href = `${localPrefix}/${imageName}`;
      }
    }
    if (kernelName) {
      if (!isFile(path.join(release.__dir, kernelName))) {
        warnings.push({
          message: `${deviceId}: kernel ${kernelName} não encontrado; o disco sai sem link de kernel`,
        });
      } else {
        release.__kernelHref = `${localPrefix}/${kernelName}`;
      }
    }
    // Os nomes locais seguem a regra da release: `<aparelho>-SHA256SUMS`. Se
    // divergissem, a página de teste citaria um arquivo que só existe publicado.
    if (isFile(path.join(release.__dir, "SHA256SUMS"))) {
      release.__sumsHref = `${localPrefix}/${sumsName}`;
      release.__sumsSource = path.join(release.__dir, "SHA256SUMS");
      release.__sumsTarget = `${targetDir}-${sumsName}`;
    }
    if (isFile(path.join(release.__dir, "README.txt"))) {
      release.__readmeHref = `${localPrefix}/${readmeName}`;
      release.__readmeSource = path.join(release.__dir, "README.txt");
      release.__readmeTarget = `${targetDir}-${readmeName}`;
    }
  }

  // `repo` só é usado pelo chamador ao montar `downloadBase`; mantido no
  // contrato para não reabrir a assinatura em cada mudança de URL.
  return warnings;
}

/** Copia imagens, kernel e os arquivos por aparelho para `outDir/downloads/`. */
function copyDownloads({ releases, outDir }) {
  const downloadsDir = path.join(outDir, "downloads");
  // `downloads/` é RECRIADA, não preenchida: um aparelho que sai do `dist`
  // deixaria a imagem antiga publicada para sempre — link morto que ainda baixa.
  rmSync(downloadsDir, { recursive: true, force: true });

  for (const release of releases) {
    const deviceId = release.device?.id || "desconhecido";
    const targetDir = path.join(downloadsDir, deviceId);
    for (const nome of [release.system?.image, release.system?.kernel?.name]) {
      if (!nome) continue;
      const origem = path.join(release.__dir, nome);
      if (!isFile(origem)) continue;
      mkdirSync(targetDir, { recursive: true });
      copyFileSync(origem, path.join(targetDir, nome));
    }
    for (const [origem, nome] of [
      [release.__sumsSource, nomeComAparelho(deviceId, "SHA256SUMS")],
      [release.__readmeSource, nomeComAparelho(deviceId, "README.txt")],
    ]) {
      if (!origem || !isFile(origem)) continue;
      mkdirSync(targetDir, { recursive: true });
      copyFileSync(origem, path.join(targetDir, nome));
    }
  }
}

/**
 * Gera a página.
 *
 * `singleFile: true` escreve um `index.html` que carrega tudo dentro dele.
 * `singleFile: false` escreve `index.html` + `assets/` + `downloads/`.
 */
export function generateSite({
  distDir,
  outDir,
  templatePath,
  stylePath,
  copyImages = true,
  singleFile = false,
  downloadBase = null,
  repo = DEFAULT_REPO,
}) {
  const { releases, problems } = collectReleases(distDir);
  const errors = [...problems];
  const warnings = [];

  if (releases.length === 0) {
    errors.push({ message: "nenhum release.json encontrado; rode a fase package antes" });
    return { ok: false, releases: [], errors, warnings, indexPath: null };
  }

  warnings.push(...resolveLinks({ releases, downloadBase, copyImages, singleFile, repo }));

  if (!singleFile && copyImages) copyDownloads({ releases, outDir });

  // O CSS é a única dependência visual que sobra. No arquivo único ele entra
  // inline; no modo com pasta, é copiado como antes.
  const css = isFile(stylePath) ? readFileSync(stylePath, "utf8") : "";
  const styleTag = singleFile
    ? `<style>\n${css}\n</style>`
    : `<link rel="stylesheet" href="assets/style.css">`;

  if (!singleFile && isFile(stylePath)) {
    const assetsDir = path.dirname(stylePath);
    mkdirSync(path.join(outDir, "assets"), { recursive: true });
    for (const name of listDir(assetsDir)) {
      const origem = path.join(assetsDir, name);
      if (isFile(origem)) copyFileSync(origem, path.join(outDir, "assets", name));
    }
  }

  // O logo é fotográfico (102 KB). No arquivo único entra em base64; no modo com
  // pasta é um arquivo ao lado. Embutir num arquivo que também tem downloads
  // locais não faria sentido.
  const logoPath = path.join(path.dirname(stylePath), "logo.jpg");
  let logoHtml;
  if (!isFile(logoPath)) {
    logoHtml = "";
  } else if (singleFile) {
    const base64 = readFileSync(logoPath).toString("base64");
    logoHtml = `<img src="data:image/jpeg;base64,${base64}"
               alt="Giochi OS: tabuleiro neon com X e O e um rastro de energia"
               width="960" height="524" decoding="async">`;
  } else {
    logoHtml = `<img src="assets/logo.jpg"
               alt="Giochi OS: tabuleiro neon com X e O e um rastro de energia"
               width="960" height="524" decoding="async">`;
  }

  // O dicionário tem de estar íntegro antes de ir para dentro da página: uma
  // chave faltando vira `undefined` na tela, e uma tag não permitida em
  // `innerHTML` é execução de script com outro nome.
  const problemasTraducao = validarTraducoes();
  if (problemasTraducao.length > 0) {
    errors.push(...problemasTraducao.map((m) => ({ code: "traducao", message: m })));
    return { ok: false, releases, errors, warnings, indexPath: null };
  }

  const geradoEm = new Date().toISOString();
  const padrao = IDIOMAS.find((idioma) => idioma.code === PADRAO);

  const template = readFileSync(templatePath, "utf8");
  let html = template
    .replace("<!--STYLE-->", styleTag)
    .replace("<!--FAVICON-->", singleFile ? faviconUri() : "assets/favicon.png")
    .replace("<!--LANG-->", escapeHtml(padrao.bcp47))
    .replace("<!--DIR-->", escapeHtml(padrao.dir))
    .replace("<!--MARK-->", MARK_SVG)
    .replace("<!--LOGO-->", logoHtml)
    .replace("<!--NAV_DOWNLOADS-->", renderNavDownloads(releases))
    .replace("<!--NAV_DEVICES-->", renderNavDevices(releases))
    .replace("<!--RELEASES-->", releases.map(renderRelease).join("\n"))
    .replace("<!--DEVICE_ROWS-->", renderDeviceRows(releases))
    .replace("<!--SUMS_LINKS-->", renderSumsLinks(releases))
    .replace("<!--README_LINKS-->", renderReadmeLinks(releases))
    .replace("<!--QEMU_GENERIC-->", renderQemuGeneric(releases))
    .replace("<!--REPO_LINKS-->", renderRepoLinks(repo, releases))
    .replace("<!--FOOTER_LINKS-->", renderFooterLinks(repo))
    .replace("<!--IDIOMAS-->", renderIdiomas(PADRAO))
    .replace("<!--IDIOMA_ATUAL-->", escapeHtml(padrao.proprio))
    .replaceAll("<!--GENERATED-->", geradoEm)
    .replaceAll("<!--DATA-->", geradoEm.slice(0, 10))
    .replaceAll("<!--COUNT-->", String(releases.length))
    .replace("<!--SCRIPT-->", `${SCRIPT_IDIOMA.trim()}\n${SCRIPT_PIX.trim()}`);

  // Preencher o idioma padrão DEPOIS de todo o resto: o bloco de dados que
  // entra abaixo já contém textos em todos os idiomas, e preenchê-lo com o
  // idioma padrão estragaria o JSON.
  const preenchido = preencherPadrao(html, TEXTOS[PADRAO]);
  html = preenchido.html;

  if (preenchido.faltando.length > 0) {
    errors.push({
      code: "traducao_ausente",
      message: `chave(s) usada(s) no template sem tradução: ${[...new Set(preenchido.faltando)].join(", ")}`,
    });
    return { ok: false, releases, errors, warnings, indexPath: null };
  }

  // O dicionário inteiro entra como dado, não como código: `<script
  // type="application/json">` não é executado, então uma tradução não pode virar
  // um `</script>` acidental. `<` vira escape unicode por segurança.
  const dadosIdioma = JSON.stringify({
    padrao: PADRAO,
    idiomas: IDIOMAS,
    textos: TEXTOS,
  }).replace(/</g, "\\u003c");
  html = html.replace(
    "</head>",
    `<script type="application/json" id="i18n-dados">${dadosIdioma}</script>\n</head>`,
  );

  // Placeholder que sobrar no HTML é uma seção que ninguém preencheu — e ela
  // aparece na página como comentário invisível, sem erro nenhum. Melhor falhar.
  const restantes = [...html.matchAll(/<!--([A-Z_]+)-->/g)].map((m) => m[1]);
  if (restantes.length > 0) {
    errors.push({
      message: `template com placeholder não preenchido: ${[...new Set(restantes)].join(", ")}`,
    });
    return { ok: false, releases, errors, warnings, indexPath: null };
  }

  const target = singleFile ? outDir : path.join(outDir, "index.html");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, html, "utf8");

  if (!singleFile) {
    writeFileSync(
      path.join(path.dirname(target), "releases.json"),
      `${JSON.stringify(
        releases.map((release) => ({
          device: release.device,
          system: release.system,
          boot: release.boot || null,
          apps: release.apps,
          generatedAt: release.generatedAt,
          href: release.__href,
          kernelHref: release.__kernelHref || null,
          sumsHref: release.__sumsHref || null,
          readmeHref: release.__readmeHref || null,
        })),
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return { ok: true, releases, errors, warnings, indexPath: target, bytes: Buffer.byteLength(html) };
}
