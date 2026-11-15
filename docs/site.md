# Site

A página de download das imagens: **um arquivo**, `index.html`, na raiz.

## Como é gerado

```bash
node scripts/build-site.mjs --dist dist --single-file --out index.html
```

1. Varre `dist/` procurando `release.json` em **qualquer profundidade** — o CI
   baixa artefatos em subpastas com nome do device.
2. Ordena com cartão antes de máquina virtual, e depois por nome.
3. Injeta os cards no `site/template.html`.
4. Escreve **um** `index.html`: CSS no `<style>`, marca em SVG inline, logo em
   base64, e os downloads apontando para a release do GitHub.

Os links saem de `https://github.com/<repo>/releases/download/v<versão>/`, com a
versão lida do próprio `release.json` — a mesma que nomeia os arquivos. Base
diferente: `--download-base <url>`.

## Por que um arquivo

- O GitHub Pages publica o **repositório**. Com `index.html` na raiz, a página
  existe sem job de deploy, sem artefato de site e sem configuração de origem.
- Nada é carregado de fora: sem `<link>`, sem `src` relativo. Um teste percorre
  todo `img`/`link` e recusa subrecurso que não seja `data:`.
- O diff da página fica no histórico, junto do commit que a mudou.

## Por que sem `fetch`

A página é gerada com os dados **embutidos**. Buscar JSON no navegador seria
bloqueado por CORS em `file://` e passaria a depender de rede (e de rate limit)
para mostras a lista. Quem abre o arquivo vê a lista.

## Modo local

```bash
node scripts/build-site.mjs --dist dist            # site/dist/ com as imagens ao lado
```

Gera `site/dist/index.html` + `assets/` + `downloads/` com as imagens copiadas,
para conferir a página com os arquivos de verdade. **Não** é o que é publicado —
e `site/dist/` é ignorado pelo git.

## Observações por aparelho

Alguns aparelhos precisam de um aviso antes do download. O R35S é o caso: sai de
fábrica com **cinco painéis** diferentes e nenhum EDID para descobrir qual é —
esta imagem referencia o `panel4`, e unidade com outro painel precisa de outra
build. A mesma placa é usada no R36S, então a imagem roda em algumas unidades
dele.

O aviso aparece no card, **fora do `<details>`**, entre o sha256 e os botões: é
aviso, não detalhe.

| Onde | O quê |
| --- | --- |
| `scripts/lib/device-notes.mjs` | o **dado** (`panel4`, `["R36S","R33S"]`) |
| `scripts/lib/i18n.mjs` | a **frase**, nos dez idiomas, com `{modelo}`/`{outros}`/`{lista}` |
| `release.json` → `device.observations` | o que o site consome (lista, `[]` quando não há) |

A frase é traduzida e o dado não: escrever a frase inteira no dado a deixaria em
português no meio de uma página em árabe.

## Idiomas

O mesmo `index.html` fala os dez idiomas mais falados do mundo: inglês, chinês,
híndi, espanhol, francês, árabe, bengali, português, russo e urdu.

O texto de todos eles vai embutido no arquivo
(`<script type="application/json" id="i18n-dados">`) e a troca acontece no
navegador. O dicionário fica em `scripts/lib/i18n.mjs`.

| Aspecto | Como funciona |
| --- | --- |
| Padrão | inglês, **escrito no HTML** pelo gerador |
| Sem JavaScript | página completa no idioma padrão + `<noscript>` avisando |
| Detecção | `navigator.languages`; idioma fora da lista fica no inglês |
| Escolha manual | guardada em `localStorage` |
| Árabe e urdu | `dir="rtl"` no `<html>`; CSS em propriedades lógicas |
| Código e caminhos | continuam LTR mesmo em RTL |

O dicionário é **dado**, não código: `<script type="application/json">` não é
executado e `<` é escapado na serialização. `validarTraducoes()` recusa tag fora
de `<code>`/`<strong>`/`<em>` — o gerador falha antes de escrever a página.

Para acrescentar um idioma: adicionar a entrada em `IDIOMAS` e o bloco em
`TEXTOS` com as mesmas chaves. O teste "nenhum idioma tem chave faltando" cobra
a lista completa, e "o dicionário e o template falam das mesmas chaves" cobra o
contrário — nenhuma chave sobrando.

## Navegação

Quatro submenus, feitos com `<details>`: abrem sem JavaScript, respondem ao
teclado e não dependem de hover (que não existe em tela de toque).

| Submenu | Conteúdo |
| --- | --- |
| Baixar | um item por aparelho + "conferir o checksum" |
| Instalar | cartão SD, máquina virtual, checksum |
| Aparelhos | lista, tabela de requisitos e um item por aparelho |
| Projeto | como é feito, repositórios, licenças |
| — | seletor de idioma, com os dez nomes no próprio alfabeto |

## Publicar

O workflow `.github/workflows/release.yml` faz o caminho completo, e é **uma
execução para todos os aparelhos**:

```text
discover  → lê device/devices.json do GIOCHI-SYSTEM, devolve os habilitados
   ↓
package   (matriz) → baixa o artefato de cada device, empacota com
                     --inject-apps, sobe um dist/<device> por artefato
   ↓
publish   → reúne os dist, desdobra os nomes repetidos, cria a release,
            gera index.html e commita no main
```

O `discover` não é enfeite. Publicar um device por execução parece simples e tem
um defeito que só aparece depois: cada execução gera a **sua** página, e a
segunda sobrescreveria a primeira com um card só. Com a matriz, todos entram na
mesma release e na mesma página.

Dispara por tag `v*` ou por `workflow_dispatch`. Inputs:

| Input | Uso |
| --- | --- |
| `devices` | lista separada por vírgula; vazio = habilitados no GIOCHI-SYSTEM |
| `version` | versão publicada; vazio = nome da tag |
| `system_run_id` | run específico do GIOCHI-SYSTEM; vazio = último verde |
| `app_repo`, `games_repo`, `system_repo` | repositórios de origem (`-` desliga os jogos) |

O `publish` confere que recebeu **um `release.json` por device** antes de gerar a
página. Sem isso, um download incompleto publicaria uma página com menos cards.

## O que o card mostra

| Campo | Origem |
| --- | --- |
| Nome e id do device | `release.device` |
| Tipo (cartão SD ou máquina virtual) | `release.device.kind` |
| Versão | `release.system.version` |
| Tamanho | `release.system.sizeHuman` |
| Buildroot | `release.system.buildroot` |
| SHA-256 completo | `release.system.imageSha256` |
| Botões de checksum e instruções | anexos `<aparelho>-SHA256SUMS` e `<aparelho>-README.txt` |
| Kernel e tamanho | `release.system.kernel` |
| Apps embutidos e de loja | `release.apps` |

O hash aparece completo porque é para copiar e comparar, não para ler. Quem
prefere o comando tem o botão do `SHA256SUMS` do aparelho no mesmo card.

## Dois tipos de card

O site não trata todos os aparelhos igual, porque publicar igual seria errado:

| Tipo | Botão | O que o card ensina |
| --- | --- | --- |
| `card` (handheld) | "Baixar imagem" | os três passos do `dd` |
| `virtual` (QEMU) | "Baixar disco" + "Kernel" | descomprimir e o comando do QEMU |

No alvo virtual o kernel é um download separado — sem ele o disco não inicia. O
comando exibido vem de `scripts/lib/qemu.mjs`, a mesma função que gera o
`README.txt` da release.

O CSS separa os dois com `.card-vm` (borda e badge em violeta), para ninguém
confundir um disco de VM com uma imagem de cartão.

## Estado

O que os testes conferem na página publicada:

- é **um** arquivo: nenhum subrecurso fora de `data:`;
- cada aparelho aparece nos submenus, no card e na tabela;
- o link de cada anexo usa o nome que o `flatten` publica
  (`<aparelho>-SHA256SUMS`, `<aparelho>-README.txt`);
- sem `--download-base`, a URL sai da versão do próprio `release.json`;
- toda âncora `href="#x"` tem `id="x"` — submenu que não rola é menu quebrado;
- placeholder esquecido no template faz a geração **falhar**;
- alvo virtual mostra o comando do QEMU; alvo de cartão mostra o passo de
  descomprimir;
- release sem imagem gera aviso, não link quebrado.

Não há CDN, cache, analytics, formulário nem JavaScript. É uma página de
download.
