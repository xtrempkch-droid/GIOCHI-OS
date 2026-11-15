# AGENTS.md — Giochi os

> Handoff técnico deste repositório. Leia antes de continuar o trabalho.
> Atualizado em: 15/11/2026.

## 1. Objetivo

Duas funções, uma pasta:

1. **Juntar** o sistema (Giochi System) e os apps (Giochi app) numa imagem de
   cartão publicável.
2. **Publicar** o site de download das imagens.

| Repositório | Função |
| --- | --- |
| Giochi System | Cria o Linux limpo: kernel, rootfs, boot, drivers, painel |
| Giochi app | Apps e jogos, com manifesto de requisitos |
| **Giochi os** (este) | Junta e publica |

Cada pasta é repositório Git independente. **Nada é importado dos outros dois** —
o caminho entra por argumento e o único acoplamento é o contrato em JSON.

## 2. Localização

```text
C:\Users\Jussara dias\Desktop\plataforma sistema\Giochi os
```

Repositório no GitHub: `https://github.com/xtrempkch-droid/GIOCHI-OS`.

## 3. Estado atual

### Concluído

- `scripts/assemble.mjs` com as duas fases (`apps`, `package`), `--compress` e
  `--inject-apps`; `--apps` aceita mais de um catálogo (repetido ou vírgula).
- `scripts/build-site.mjs` gerando site autocontido, e
  `scripts/flatten-release.mjs` desdobrando os anexos de vários aparelhos.
- `scripts/lib/` com os módulos `fs`, `system`, `apps`, `pipeline`, `site`,
  `compress`, `rootfs`, `inject`, `qemu`, `names` e `release-assets`.
- `site/template.html` + `site/assets/style.css`, com card próprio para alvo
  virtual (bloco "Como iniciar no QEMU" e download do kernel).
- 79 testes em `tests/pipeline.test.mjs`.
- Workflows: `validate.yml` (testes) e `release.yml` (`discover` → `package`
  matriz → `publish` → `deploy`).
- Documentação em `docs/` (3 páginas).

### Validado nesta sessão

- `node tests/run-all.mjs` passou: **79/79**.
- **O `release.yml` rodou de verdade** (tag `v0.1.1`): publicou
  `giochi-powkiddy-x55-0.1.1.img.xz` (46,1 MB),
  `giochi-qemu-aarch64-0.1.1.img.xz` e `-Image.xz` na release do GitHub, e o
  site ficou no artefato `giochi-os-site` porque o Pages está em `legacy`.
- **A imagem do QEMU boota**, medida dentro do QEMU com a imagem publicada:
  login, rede, sshd e `giochi-init`; `giochi-launcher --listar` responde
  `catálogo: 6 app(s)`; `giochi-tower` lê os `.ron` de `config/`
  (`4 classes, 5 inimigos, 6 ondas, 4 bosses, 6 tiers de nemesis, 10 itens`) e
  só morre no GLES, que não existe numa VM sem GPU.
- **Cartão do X55**: `e2fsck -fn` status 0 depois da injeção, tabela de
  partição intacta, 6 apps em `/opt/giochi/apps`.
- `sha256sum -c SHA256SUMS` confere nos dois `dist/<device>/`.
- O recorte de `sparse-checkout` do CI foi conferido contra a árvore
  commitada dos dois repositórios externos: 66/66 e 39/39 arquivos, sem sobra.

### Não executado / pendente

- **Nenhum boot do cartão em hardware real** (X55) a partir desta imagem. A
  imagem bootou no antecessor; aqui ela foi verificada por `e2fsck`, tabela de
  partição e leitura do `index.json` de dentro do ext4.
- **GitHub Pages continua em "Deploy from a branch"**: o `deploy-pages` nunca
  vai funcionar até trocar para **GitHub Actions** (Settings → Pages). O job
  `deploy` é pulado e o site fica no artefato `giochi-os-site`.
- **`GIOCHI-GAMES` não tem `apps.json`**: o catálogo é derivado das pastas, e
  `cobrinha/assets` ainda não está commitado no repositório de jogos (aparece
  no build local, não no do CI).

## 4. Estrutura

```text
Giochi os/
├── scripts/
│   ├── assemble.mjs           # CLI da junção
│   ├── build-site.mjs         # CLI do site
│   └── lib/
│       ├── fs.mjs             # hash, JSON, listagem
│       ├── system.mjs         # lê e verifica out/<device>/
│       ├── apps.mjs           # lê e classifica o catálogo
│       ├── pipeline.mjs       # as duas fases, sem console nem exit
│       ├── site.mjs           # geração do HTML
│       ├── compress.mjs       # xz/zstd com queda para gzip
│       ├── rootfs.mjs         # lê apps de dentro do ext4 (debugfs)
│       ├── inject.mjs         # escreve overlay no ext4 sem montar
│       ├── qemu.mjs           # comando de boot do alvo virtual
│       └── names.mjs          # nome cru × nome comprimido
├── site/
│   ├── template.html
│   └── assets/style.css
├── tests/
│   ├── pipeline.test.mjs
│   └── run-all.mjs
└── docs/
    ├── README.md
    ├── juncao.md
    └── site.md
```

**CLI fino, lib testável.** `assemble.mjs` e `build-site.mjs` só leem argumentos
e imprimem; toda a lógica está em `lib/`. Isso existe porque, sob o sandbox,
spawnar o CLI falha com `EPERM` — e testar a função pura é melhor de qualquer
forma.

## 5. Contratos

### Entrada — `Giochi app/app/apps.json`

Campos usados aqui: `id`, `folder`, `status`, `distribution`. A licença vem do
`metadata.json` de cada app.

### Entrada — catálogo de jogos (`GIOCHI-GAMES`)

Não tem `apps.json` e não tem nível `app/`: cada jogo é uma pasta de primeiro
nível com `metadata.json`, `forge.json`, `bin/<entrypoint>` e `capa.png`. A
lista é **derivada** das pastas (ver `lerCatalogo` em `scripts/lib/apps.mjs`):

| Campo | Origem |
| --- | --- |
| `id` | `metadata.slug` → nome da pasta |
| `status` | `ready` se `bin/` tem conteúdo, senão `scaffold` (pulado, não erro) |
| `distribution` | `metadata.distribution` → `forge.json.distribution` → `image` |

Se a raiz tiver `apps.json`, ele manda e a derivação não acontece.

### Entrada — `Giochi System/out/<device>/`

Exige `device.json`, `build-info.txt`, `SHA256SUMS` e **um** dos dois:

- uma imagem de cartão (`.img`/`.iso`/`.sdcard`, comprimida ou não); ou
- kernel (`Image`, `bzImage`, `zImage`, `uImage`) **e** `rootfs.ext[234]` — o
  que o Buildroot entrega para alvo virtual, onde não existe `genimage`.

O `SHA256SUMS` é verificado arquivo por arquivo.

### Saída — `dist/release.json`

Manifesto `schemaVersion: 2`, consumido pelo site. Formato completo em
[docs/juncao.md](docs/juncao.md).

## 6. Comandos

```bash
node tests/run-all.mjs

node scripts/assemble.mjs apps \
  --apps ../"Giochi app"/app --out ../staging

node scripts/assemble.mjs package \
  --system ../"Giochi System"/out/qemu-aarch64 \
  --apps ../"Giochi app"/app --out dist --version 0.1.0 --compress xz

# com os jogos, que vivem em repositório próprio
node scripts/assemble.mjs package \
  --system ../"Giochi System"/out/powkiddy-x55 \
  --apps ../GIOCHI-APP/app --apps ../GIOCHI-GAMES \
  --out dist --version 0.1.1 --compress xz --inject-apps

node scripts/build-site.mjs --dist dist
```

Não use `node --test tests/`: spawna um processo por arquivo e falha com
`spawn EPERM`. O runner próprio existe por isso.

## 7. Decisões (02/11/2026)

- **Duas fases, não uma.** Apps precisam estar no rootfs **antes** do Buildroot
  gerar a imagem. Inserir depois exigiria remontar o ext4 e reverter a assinatura,
  desfazendo o que protege o sistema.
- **Verificar hash depois de copiar, além de antes.** A cópia é onde a falha
  acontece: disco cheio no meio de um `copyFileSync` produz arquivo truncado sem
  erro. Só o recálculo sobre a cópia prova o que será publicado.
- **Maior imagem quando há várias.** Kernel e rootfs avulsos são menores que a
  imagem completa do cartão; pegar a maior é a heurística que acerta. Mas `.img`
  não é sinônimo de cartão: o RK3566 entrega `idbloader.img` na mesma pasta, e
  tamanho só não prova nada. Ver §7.5.
- **Regra de licença duplicada aqui.** O validador do Giochi app já recusa GPL em
  `image`, mas o empacotamento não pode depender de outro repositório ter rodado
  o validador antes.
- **Site sem `fetch`.** Os dados são embutidos no HTML na geração. `fetch` de JSON
  local é bloqueado por CORS em `file://`, e um site de download que exige
  servidor não funciona para quem só quer clicar.
- **Links relativos.** Permite publicar em qualquer caminho — raiz, subpasta,
  GitHub Pages — sem configuração.

## 7.1 Decisões (13/11/2026)

- **Alvo virtual publica disco + kernel, não um "cartão".** O Buildroot não roda
  `genimage` no `qemu-aarch64`: entrega `Image` e `rootfs.ext4`. Renomear o
  `rootfs.ext4` para `.img` é honesto — é um disco cru que o QEMU abre com
  `-drive` — mas chamá-lo de cartão SD seria mentira: gravar num cartão não
  produz aparelho que inicializa. O `release.json` carrega `kind: "virtual"` e o
  site mostra o comando do QEMU em vez do `dd`.
- **Kernel é download separado.** Sem ele o disco não inicia. Publicar só o
  `.img` daria um botão que baixa um arquivo inútil sozinho.
- **`release.json` sobe para `schemaVersion: 2`.** Campos novos: `system.kind`,
  `system.kernel`, `system.artifacts[]`, `boot` e `apps.imageVerified`. O site é
  tolerante: release sem esses campos continua renderizando como cartão.
- **Compressão é opcional e explícita (`--compress`).** O padrão continua
  publicar o que veio do build; quando ligada, o `.img` cru **não** fica ao lado
  do comprimido — dois arquivos com o mesmo conteúdo dobram o download e
  convidam a baixar o errado. Se `xz`/`zstd` não existirem na máquina, cai para
  `gz` do `node:zlib` e o nome publicado diz `gz`, não `xz`.
- **"Apps na imagem" é lido de dentro da imagem.** `debugfs` lê
  `/opt/giochi/apps/index.json` do `rootfs.ext4` sem root. Se o overlay ficou de
  fora do build, a release **não** anuncia os apps do catálogo — avisa
  `overlay_ausente` e publica a verdade. Era o defeito mais fácil de passar
  despercebido: manifesto bonito, aparelho sem app.

## 8. O que este repositório não faz

- **Não compila** nada. Se aparecer lógica de build aqui, está no lugar errado.
- **Não roda `genimage`** — a montagem do cartão é do Giochi System. No alvo
  virtual não há cartão para montar: o `rootfs.ext4` do build **é** o disco.
- **Não assina** a imagem — a chave é do Giochi System.
- **Não hospeda a loja** — ela roda no PC do usuário (ver Giochi app).

## 9. Ambiente desta sessão

Linux, com Docker, Buildroot em cache e `qemu-img`/`debugfs`/`xz` disponíveis.
O que é usado:

| Ferramenta | Uso |
| --- | --- |
| `node` 20+ | tudo: pipeline, site, testes |
| `git` | versionamento (o repositório é real, com `origin`) |
| `docker` + `giochi-builder:2` | build do Giochi System, quando a imagem não existe |
| `debugfs` | ler o `index.json` de dentro do `rootfs.ext4` |
| `xz` / `zstd` / `gzip` | compressão dos artefatos publicados |

Este repositório é **só Node**: tudo nele roda e é testado. O `debugfs` e o
`xz` são opcionais — sem eles a fase 2 avisa e cai para `gzip`, ou marca
`apps.imageVerified: false`.

## 10. Como retomar

```bash
node tests/run-all.mjs
```

Fluxo completo, com a saída do sistema já construída:

```bash
node scripts/assemble.mjs apps --apps ../"Giochi app"/app --out ../staging
# ... rodar o build do Giochi System com o overlay ...
node scripts/assemble.mjs package --system ../"Giochi System"/out/qemu-aarch64 \
  --apps ../"Giochi app"/app --out dist --version 0.1.0 --compress xz
node scripts/build-site.mjs --dist dist
# abrir site/dist/index.html
```

Build do sistema nesta máquina (Linux, container):

```bash
cd ../GIOCHI-SYSTEM
GIOCHI_SYSTEM_KEEP_WORK=1 GIOCHI_SYSTEM_GROWTH_LIMIT_MIB=65536 \
  ROOT_PASSWORD=giochi-system JOBS=12 \
  bash scripts/build-in-container.sh qemu-aarch64
```

O `GIOCHI_SYSTEM_GROWTH_LIMIT_MIB` alto é necessário: o monitor de disco padrão
(4 GiB/20 s) confunde a compilação paralela do `host-gcc-initial` com cópia
recursiva e aborta o build com "consumiu 9 GiB em 20s".

## 11. Publicar

Dois caminhos:

**Manual**, com os artefatos em `dist/`:

```bash
# crie a release no GitHub e anexe dist/*
gh release create v0.1.0 dist/* --title "Giochi OS 0.1.0" --notes-file dist/README.txt
# publique o conteúdo de site/dist (Pages, rsync, S3…)
```

**Workflow** `.github/workflows/release.yml` — **uma execução para todos os
aparelhos**, em quatro jobs:

| Job | O que faz |
| --- | --- |
| `discover` | lê `device/devices.json` do GIOCHI-SYSTEM e devolve os habilitados |
| `package` | matriz: baixa o artefato de cada device, empacota com `--inject-apps` |
| `publish` | reúne os dist, gera o site **uma vez**, cria a release, sobe o Pages |
| `deploy` | publica no GitHub Pages |

Publicar um device por execução parece mais simples e tem um defeito que só
aparece depois: cada execução gera o seu site, e a segunda sobrescreve o Pages
com uma página de um card só.

Dispara por tag `v*` ou por `workflow_dispatch` (`devices`, `version`,
`system_run_id`). Requer Pages configurado com "GitHub Actions" como origem.

O workflow depende de um run **verde** do GIOCHI-SYSTEM: sem artefato ele para
no passo "Resolver o build do sistema". Se o `workflow_dispatch` for usado, o
input `system_run_id` permite apontar um run específico em vez do último.

### Estado da publicação (15/11/2026)

`v0.1.6` é a release boa, publicada pelo `release.yml` sem intervenção:

| Anexo | O que é |
| --- | --- |
| `giochi-powkiddy-x55-0.1.6.img.xz` | cartão SD do X55, 46 MB, 2 GiB descomprimido |
| `giochi-qemu-aarch64-0.1.6.img.xz` | disco da VM, 15 MB |
| `giochi-qemu-aarch64-0.1.6-Image.xz` | kernel da VM, 3,7 MB |
| `<aparelho>-SHA256SUMS` | checksum daquele aparelho |
| `<aparelho>-README.txt` | instruções daquele aparelho |

Conferido baixando do GitHub com o `curl`: o `sha256sum -c` do X55 confere, o
imagem tem tabela de partição válida, `e2fsck -fn` limpo e os 6 apps em
`/opt/giochi/apps/index.json`.

As releases `v0.1.1` e `v0.1.2` ficaram com os anexos colidindo (`SHA256SUMS`
de um aparelho no lugar do outro) — são anteriores às correções de §7.7. Use a
`v0.1.6` ou mais nova.

**O site ainda não está no ar.** O Pages deste repositório está em
"Deploy from a branch" e nesse modo `actions/deploy-pages` sempre falha. O
`publish` tenta trocar via `PUT /pages` com o `GITHUB_TOKEN`, mas o endpoint
exige permissão de administrador e a troca não acontece. Falta um clique:

> Settings → Pages → Source: **GitHub Actions**

Enquanto isso, o site gerado está no artefato `giochi-os-site` de cada
execução do `Release` (30 dias de retenção), e o job `Publicar o site` aparece
como *skipped* — não como sucesso.

## 12. Arquivos que não devem ser commitados

`dist/`, `site/dist/`, `node_modules/`, e imagens `*.img` / `*.iso` / `*.sdcard`
(mais os comprimidos `*.img.xz`, `*.img.gz`, `*.img.zst`).

Imagem de cartão é artefato grande e é publicada no site ou em release — nunca no
Git. O `.gitignore` cobre isso.

## 7.2 Decisões (13/11/2026, segunda rodada)

- **`--inject-apps` existe porque o CI não vê o catálogo.** O caminho normal
  continua sendo a fase `apps` antes do build. A injeção escreve no `ext4` cru
  com `debugfs -w` (sem root, sem montar) e é recusada em imagem de cartão.
  Toda execução avisa `apps_injetados`: a imagem não passou pelo `post-build`
  com esses arquivos.
- **A injeção confere biblioteca antes de escrever.** Lê as `DT_NEEDED` de cada
  binário e procura cada uma dentro da imagem. Foi essa checagem que pegou
  `SDL2_image`/`SDL2_mixer` faltando — e o defeito anterior era exatamente
  esse: manifesto anunciando 6 apps, launcher morrendo com `error while loading
  shared libraries`.
- **`readelf` precisa de `LC_ALL=C`.** Nesta máquina ele fala português
  ("Biblioteca Compartilhada"); um regex preso ao inglês devolveria lista vazia
  em silêncio e a checagem nunca dispararia.
- **Buildroot fica em 2024.02 neste build.** Outra sessão subiu o
  `buildroot.version` para 2025.02 no meio do trabalho; retomar com a versão
  nova forçaria toolchain do zero. A release 0.1.0 foi construída em 2024.02.

## 7.3 Decisões (14/11/2026)

- **A injeção deixou de ser só do alvo virtual.** O artefato do CI é uma imagem
  de cartão, e a fase `apps` não roda antes dele. Agora o injetor extrai a
  partição do rootfs com `dd`, altera, confere com `e2fsck -fy` e devolve com
  `conv=notrunc,fsync`. A tabela e a FAT de boot não são tocadas.
- **Espaço e `e2fsck` são guardas, não zelo.** Encher o ext4 no meio da escrita
  trunca arquivo sem erro; um rootfs que não monta dá cartão que liga e não
  passa do bootloader. Os dois viram recusa com código próprio
  (`sem_espaco`, `rootfs_corrompido`).
- **Cartão comprimido é recusado.** Descomprimir 2 GiB só para alterar e
  recomprimir é trabalho dobrado; o caminho normal (fase `apps` antes do build)
  não precisa disso.
- **A fase `apps` RECRIA o diretório de saída.** `copyTree` sobrescrevia mas
  nunca apagava: app removido do catálogo continuava no overlay. Medido hoje —
  os jogos saíram do catálogo do Giochi app e as pastas deles seguiram para a
  imagem, com o `index.json` sem citá-las.
- **O CI monta a imagem de cartão.** O build entrega `Image`, `rootfs.ext4` e o
  firmware soltos; gravar isso num cartão não inicializa. O passo novo roda
  `make-sd-image.sh` com `sudo` só para device que declara firmware em
  `artifacts`, e devolve o dono dos arquivos com `chown` (o upload roda como o
  usuário do runner).

## 7.4 Decisões (15/11/2026)

- **`--apps` aceita vários catálogos.** O launcher e a loja vivem no Giochi app;
  os jogos passam a viver em repositório próprio. Sem isso, embutir um jogo
  exigiria copiar a pasta dele para o catálogo do outro repositório — o
  acoplamento que o contrato existe para evitar. Flag repetida ou vírgula, e
  `id` repetido entre catálogos é erro (dois apps com o mesmo id escreveriam em
  `/opt/giochi/apps/<id>` e um apagaria o outro).
- **As duas rotas de distribuição continuam valendo.** `image` embute no build;
  `store` só lista em `apps.store` e o aparelho baixa depois. A escolha é de
  licença e de ciclo de atualização, não técnica: GPL não entra na raiz
  assinada, e app que muda toda semana não deveria exigir regravar o cartão.
- **A release é uma só para todos os aparelhos.** O workflow descobre os
  habilitados em `device/devices.json`, empacota em matriz e publica o site uma
  vez. Publicar um device por execução sobrescreveria o Pages com uma página de
  um card.

## 7.5 Decisões (15/11/2026, terceiro repositório)

- **O catálogo de jogos é derivado, não declarado.** `GIOCHI-GAMES` não tem
  `apps.json` e não tem nível `app/`: cada jogo é uma pasta de primeiro nível com
  `metadata.json`, `forge.json`, `bin/` e `capa.png`. Derivar das pastas evita
  copiar pasta de jogo para o catálogo do Giochi app. `id` vem de
  `metadata.slug`; `status` é `ready` se `bin/` tem conteúdo e `scaffold` se
  não — e `scaffold` é **pulado com aviso, nunca erro**, porque o repositório
  ainda está em estruturação. Toda execução avisa `catalogo_derivado`. Um
  `apps.json` presente manda e silencia o aviso: a derivação é plano B.
- **Só o primeiro nível é varrido.** `target/`, `vendor/` e `crates/` existem
  nos repositórios de jogo e não são apps.
- **`.img` não é sinônimo de cartão.** O RK3566 entrega `idbloader.img` na mesma
  pasta da imagem do cartão; publicar o blob de 178 KB daria um download que não
  inicializa nada. O sinal usado é factual: **cartão tem tabela de partição**
  (`0x55AA` nos bytes 510–511), bootstrap gravado em offset fixo não. Quando
  nenhum candidato tem tabela, nenhum é descartado e a heurística de tamanho
  decide (cartão cru renomeado continua aceito).
- **`device.json#artifacts` NÃO serve para separar cartão de componente.** O
  campo diz o que subir, e em `generic-x64`, `powkiddy-x35s` e `steamdeck` o
  próprio cartão está lá (`disk.img`, `sdcard.img`, `*.img`). Excluir por ele
  apagaria o cartão desses três aparelhos. Há teste fixando isso.
- **O workflow não deixa o repositório de jogos derrubar o release.** O checkout
  dele é `continue-on-error` e o catálogo só entra em `--apps` quando a pasta
  tem conteúdo; sem jogos a imagem sai com os apps e um `::warning::` explica.
  `games_repo` aceita `-` para desligar de vez.

## 7.6 Decisões (15/11/2026, injeção conferida de verdade)

Três defeitos silenciosos no caminho `--inject-apps`, todos só visíveis
comparando o que foi publicado com o que devia estar lá.

- **`debugfs write` não sobrescreve, e sai com 0.** Num caminho que já existe
  ele imprime `write: Ext2 file already exists` no stderr e devolve status 0.
  Confiar no status dava injeção "bem-sucedida" com o conteúdo antigo: medido
  no `index.json`, que continuou anunciando o catálogo velho enquanto o aviso
  dizia `apps_injetados`. Agora apaga antes de escrever, e confere o tamanho
  dentro da imagem — disco cheio no meio do `write` trunca sem erro.
- **`debugfs mkdir` em diretório existente vaza um inode.** Não é falha, mas
  aloca um inode e o deixa órfão: `ensureDirectory` repetia o `mkdir` de
  `/opt/giochi/apps` para cada arquivo do overlay, e `e2fsck -fn` passou a
  acusar "Pasta de inode N não ligada". Agora só cria o que falta — e existe
  teste que roda `e2fsck -fn` depois da injeção.
- **"já tem app" não é prova de estar completo.** O pulo da injeção disparava
  com `apps.length > 0`. Medido no QEMU: o rootfs trazia 2 apps de um build
  anterior, a injeção foi pulada e os 4 jogos do catálogo nunca entraram, com o
  manifesto anunciando 2. O critério passou a ser o catálogo: pula só quando
  todo app `image` já está lá, senão injeta e avisa `apps_incompletos`.
- **O caminho do ext4 cru também roda `e2fsck -fy`.** Só o caminho do cartão
  fazia. Sem ele, um ext4 que o kernel não monta ia para a release com o build
  verde. Status 1 (consertou) é aceito e vira `corrected: true`.

Medido depois das correções: QEMU com 6 apps e `e2fsck -fn` status 0; cartão X55
com 6 apps, `e2fsck -fn` status 0 e tabela de partição intacta (3622 → 3642
inodes, exatamente os 20 arquivos).

Depois de §7.7 o overlay é maior (80 arquivos, 12 MB com os dados dos jogos) e
`e2fsck -fn` continua limpo nos dois aparelhos.

## 7.7 Decisões (15/11/2026, o release que rodou)

A `v0.1.1` foi a primeira execução do `release.yml` que chegou a criar jobs.
Ela publicou os dois aparelhos — e expôs quatro defeitos que só aparecem
quando o caminho inteiro roda de verdade.

- **`replace()` não existe nas expressões do Actions.** A matriz dos aparelhos
  era `fromJSON(format('["{0}"]', replace(...)))`. Função inexistente não falha
  no job: **invalida o arquivo inteiro**, e o GitHub cria uma execução sem
  nenhum job, com a mensagem só no HTML da página. Todos os releases anteriores
  morreram antes do primeiro passo. O JSON da matriz agora sai pronto do
  `discover`, como output. `tests/pipeline.test.mjs` lê os workflows e recusa
  qualquer função fora da lista real — e o `validate.yml` roda mesmo quando o
  `release.yml` está inválido, que é o único jeito de essa falha aparecer num
  PR em vez de num release.
- **`wc -l` conta nova linha, não linha.** A conferência que existia para
  pegar aparelho perdido era `printf '%s' "a,b" | tr ',' '\n' | wc -l` — que
  devolve **1** para dois aparelhos, porque a última linha não tem `\n`. Com o
  download achatado da v0.1.2, o contador dizia "1 de 1" e passava: a checagem
  era cega exatamente para o caso de dois. Agora a expectativa vem do mesmo
  JSON que alimenta a matriz (`devices_json`), então não há como divergir.
  O `::error::` do passo carrega a listagem do `dist`: anotação de check-run é
  pública, o `stderr` do passo não é — foi assim que o layout real apareceu.
- **O layout do artefato não é contrato.** A `v0.1.2` publicou com os nomes
  ainda colidindo: o desdobramento supôs `dist/<device>/` e o
  `download-artifact` entregou outro arranjo, então ele não achou nada para
  desdobrar e o `README-RELEASE.md` saiu só com o cabeçalho. Agora
  `normalizeDeviceDirs` percorre o `dist` até achar `release.json`, lê o
  `device.id` de dentro e renomeia a pasta para `dist/<id>/` — antes do site,
  que precisa de `SHA256SUMS` dentro da pasta do aparelho. Funciona para
  `dist/<device>/`, `dist/<artefato>/` e `dist/dist/<device>/`, e é erro se
  dois diretórios declararem o mesmo aparelho. O download passou a
  `merge-multiple: false` (uma pasta por artefato): achatado, dois
  `release.json` viram um e não há como saber quem se perdeu.
- **Anexo de release é plano.** `dist/<device>/SHA256SUMS` de um aparelho
  sobrescreve o do outro. Medido na `v0.1.1` publicada: o `SHA256SUMS` tinha só
  a linha do X55, então quem baixava o disco do QEMU rodava `sha256sum -c`
  contra um nome que não existia no diretório dele. Mesmo problema em
  `README.txt` (todo mundo lia a instrução do outro aparelho) e
  `release.json`. `scripts/lib/release-assets.mjs` desdobra os três para
  `<device>-<nome>`, corrige o `sha256sum -c` citado no README e falha se
  sobrar qualquer nome-base repetido. A lógica saiu do YAML justamente porque
  errou uma vez e ali não dava para testar.
- **O overlay copiava `bin/` inteiro e só `bin/`.** O `.gitkeep` dos jogos ia
  para dentro do ext4 mesmo não estando no manifesto, e os diretórios de dados
  ficavam de fora. Foram dois, descobertos um de cada vez no boot do QEMU:
  sem `assets/` o jogo abria sem textura; sem `config/` o tower morria com
  `não consegui ler config/classes.ron` — que parece instalação incompleta e é
  arquivo que não foi empacotado. Agora a cópia é exatamente `app.files`, e a
  varredura é "tudo menos `target`/`vendor`/`src`/`crates`/…": uma lista de
  permitidos envelhece no dia seguinte, e cada diretório esquecido custou uma
  imagem que não funcionava. O binário procura em `current_exe()/../<dir>`.

  Medido no boot do QEMU, com a imagem publicada: `giochi-launcher --listar`
  devolve `catálogo: 6 app(s)` e `giochi-tower` imprime
  `config: 4 classes, 5 inimigos, 6 ondas, 4 bosses, 6 tiers de nemesis, 10 itens`
  antes de morrer no GLES — que é o esperado numa VM sem GPU.
- **Checkout completo de repositório de jogo não cabe no runner.** Os dois
  repositórios externos versionam `target/` e `vendor/` de Rust: `GIOCHI-GAMES`
  tem 26 mil arquivos (~9 GB no checkout), `GIOCHI-APP` ~5,8 GB. O `package`
  agora faz clone parcial (`filter: blob:none`, `fetch-depth: 1`) com
  `sparse-checkout` só dos caminhos que o catálogo lê. Os padrões foram
  conferidos contra a árvore **commitada**: 66 de 66 arquivos na games, 39 de
  39 na app, sem sobra — e há um passo que falha se o recorte dos jogos não
  trouxer nenhum `metadata.json`, senão o `continue-on-error` transformaria a
  perda em "release sem jogos, verde".
- **A release não depende do Pages.** O Pages do repositório está em "Deploy
  from a branch", e nesse modo `actions/deploy-pages` sempre falha — levando
  junto a publicação dos artefatos, que é o produto. Agora o `publish` guarda o
  site no artefato `giochi-os-site` e só tenta o Pages quando
  `GET /pages` devolve `build_type: workflow`. Com o Pages em `legacy` o job
  `deploy` é pulado, o site fica no artefato e a release sai.

Estado da publicação depois disso: ver §11. A `v0.1.6` é a primeira release com
os nomes separados por aparelho, baixada e conferida de fora. O que falta para o
site ficar no ar é **uma configuração**: Settings → Pages → Source:
**GitHub Actions**. Sem isso o HTML fica no artefato `giochi-os-site`.
