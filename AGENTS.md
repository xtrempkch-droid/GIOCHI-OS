# AGENTS.md — Giochi os

> Handoff técnico deste repositório. Leia antes de continuar o trabalho.
> Atualizado em: 02/11/2026.

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

- Estrutura de repositório pronta para GitHub.
- `scripts/assemble.mjs` com as duas fases (`apps`, `package`) e `--compress`.
- `scripts/build-site.mjs` gerando site autocontido.
- `scripts/lib/` com os módulos `fs`, `system`, `apps`, `pipeline`, `site`,
  `compress`, `rootfs`, `qemu` e `names`.
- `site/template.html` + `site/assets/style.css`, com card próprio para alvo
  virtual (bloco "Como iniciar no QEMU" e download do kernel).
- 31 testes em `tests/pipeline.test.mjs`.
- Workflows: `validate.yml` (testes) e `release.yml` (release + Pages).
- Documentação em `docs/` (3 páginas).

### Validado nesta sessão

- `node tests/run-all.mjs` passou: **31/31**.
- Fluxo completo com uma saída de sistema **virtual** (kernel `Image` +
  `rootfs.ext4`): a fase `package` publicou
  `giochi-qemu-aarch64-0.1.0.img.xz` + `giochi-qemu-aarch64-0.1.0-Image.xz`,
  `SHA256SUMS` com as duas linhas e `README.txt` com o comando do QEMU.
- O site gerado contém o card `card-vm`, o link do kernel copiado para
  `downloads/qemu-aarch64/` e o bloco "Como iniciar no QEMU".
- `readRootfsApps` foi exercitado contra um ext4 de verdade (criado com
  `mkfs.ext4 -d`, sem root): lê o `index.json` quando existe e devolve
  `ok: false` quando o overlay ficou de fora.

### Não executado / pendente

- **Nenhum build real de device de hardware** neste repositório — só o artefato
  baixado do GIOCHI-SYSTEM.
- **Nenhuma fase `apps` com app pronto para a imagem**: os apps de imagem do
  Giochi app ainda não têm `bin/` exportado, então o overlay sai vazio.
- **Sem CI real** para o `release.yml`: o workflow está escrito e validado como
  YAML, mas nunca rodou.

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
  imagem completa do cartão; pegar a maior é a heurística que acerta.
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

**Workflow** `.github/workflows/release.yml`: baixa o artefato
`giochi-system-<device>` do GIOCHI-SYSTEM, empacota, cria a release com
`dist/*` e publica `site/dist` no Pages. Dispara por tag `v*` ou por
`workflow_dispatch`. Requer Pages configurado com "GitHub Actions" como origem.

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
