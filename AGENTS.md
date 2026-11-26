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
  `compress`, `rootfs`, `inject`, `gamepad`, `portmaster`, `qemu`, `names` e
  `release-assets`.
- `site/template.html` + `site/assets/style.css`, com card próprio para alvo
  virtual (bloco "Como iniciar no QEMU" e download do kernel).
- 133 testes em `tests/pipeline.test.mjs`.
- Workflows: `validate.yml` (testes) e `release.yml` (`discover` → `package`
  matriz → `publish` → `deploy`).
- Documentação em `docs/` (3 páginas).

### Validado nesta sessão

- `node tests/run-all.mjs` passou: **79/79**.
- **O `release.yml` rodou de verdade** (tag `v0.1.1`): publicou
  `giochi-powkiddy-x55-0.1.1.img.xz` (46,1 MB),
  `giochi-qemu-aarch64-0.1.1.img.xz` e `-Image.xz` na release do GitHub, e o
  site ficou no artefato `giochi-os-site` porque o Pages está em `legacy`.
- **A imagem do QEMU boota de verdade**, medida dentro do `qemu-system-aarch64`:
  login, rede, sshd e `giochi-init`; `giochi-launcher --listar` responde
  `catálogo: 6 app(s) de /opt/giochi/apps/index.json`; `giochi-tower` lê os
  `.ron` de `config/` (`4 classes, 5 inimigos, 6 ondas, 4 bosses, 6 tiers de
  nemesis, 10 itens`) e só morre no GLES, que não existe numa VM sem GPU.
  Esse boot foi da imagem montada **nesta máquina** (Buildroot 2024.02), com o
  mesmo caminho de injeção do CI. A imagem do CI é Buildroot **2025.02** — não
  é o mesmo binário, e não foi bootada aqui.
- **O anexo publicado foi conferido baixando do GitHub** (`v0.1.6`):
  `sha256sum -c` do X55 confere contra o `powkiddy-x55-SHA256SUMS` publicado, a
  imagem tem tabela de partição válida, `e2fsck -fn` status 0 e os 6 apps em
  `/opt/giochi/apps/index.json`.
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
├── index.html                 # A PÁGINA PUBLICADA — gerada, commitada
├── scripts/
│   ├── assemble.mjs           # CLI da junção
│   ├── build-site.mjs         # CLI da página (arquivo único ou pasta local)
│   ├── flatten-release.mjs    # nomes dos anexos por aparelho
│   ├── check-checkout.mjs     # confere o recorte do CI
│   └── lib/
│       ├── fs.mjs             # hash, JSON, listagem
│       ├── system.mjs         # lê e verifica out/<device>/
│       ├── apps.mjs           # lê e classifica o catálogo
│       ├── pipeline.mjs       # as duas fases, sem console nem exit
│       ├── site.mjs           # geração do HTML
│       ├── compress.mjs       # xz/zstd com queda para gzip
│       ├── rootfs.mjs         # lê apps de dentro do ext4 (debugfs)
│       ├── gamepad.mjs        # as 4 peças do controle virtual na imagem
│       ├── portmaster.mjs     # o runtime de ports (opt-in) na imagem
│       ├── inject.mjs         # escreve overlay no ext4 sem montar
│       ├── qemu.mjs           # comando de boot do alvo virtual
│       ├── release-assets.mjs # layout + nomes dos anexos da release
│       ├── i18n.mjs           # os dez idiomas e a validação do dicionário
│       ├── device-notes.mjs   # observações por aparelho (dado, não frase)
│       ├── checkout.mjs       # o que é do app × o que é de desenvolvimento
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
node scripts/build-site.mjs --dist dist --single-file --out index.html
# a página publicada é index.html na raiz
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
node scripts/flatten-release.mjs --dist dist      # nomes por aparelho
gh release create v0.1.0 dist/* --title "Giochi OS 0.1.0"
node scripts/build-site.mjs --dist dist --single-file --out index.html
git add index.html && git commit -m "site: página da v0.1.0" && git push
```

A página é um arquivo no branch: publicar o site é commitar `index.html`.

**Workflow** `.github/workflows/release.yml` — **uma execução para todos os
aparelhos**, em três jobs:

| Job | O que faz |
| --- | --- |
| `discover` | lê `device/devices.json` do GIOCHI-SYSTEM e devolve os habilitados |
| `package` | matriz: baixa o artefato de cada device, empacota com `--inject-apps` |
| `publish` | reúne os dist, desdobra os nomes, cria a release, gera e commita `index.html` |

Não há job de deploy: o Pages publica o repositório, e a página é o
`index.html` da raiz. Nada a configurar.

Publicar um device por execução parece mais simples e tem um defeito que só
aparece depois: cada execução gera a sua página, e a segunda sobrescreveria a
primeira com um card só.

Dispara por tag `v*` ou por `workflow_dispatch` (`devices`, `version`,
`system_run_id`, `app_repo`, `games_repo`).

O workflow depende de um run **verde** do GIOCHI-SYSTEM: sem artefato ele para
no passo "Resolver o build do sistema". Se o `workflow_dispatch` for usado, o
input `system_run_id` permite apontar um run específico em vez do último.

### Estado da publicação (15/11/2026)

`v0.1.10` é a release boa: publicada pelo `release.yml` sem intervenção, com
três aparelhos (X55, R35S e QEMU) e a página em dez idiomas. Desde a `v0.1.8` o **robô commita a página** — o commit
`site: página de download da <versão>` é do `github-actions[bot]` no `main`.

Desde a `v0.1.6` os anexos têm nome por aparelho:

| Anexo | O que é |
| --- | --- |
| `giochi-powkiddy-x55-0.1.10.img.xz` | cartão SD do X55, 46 MB, 2 GiB descomprimido |
| `giochi-r35s-0.1.10.img.xz` | cartão SD do R35S, 43 MB, 7 apps |
| `giochi-qemu-aarch64-0.1.10.img.xz` | disco da VM, 15 MB |
| `giochi-qemu-aarch64-0.1.10-Image.xz` | kernel da VM, 3,7 MB |
| `<aparelho>-SHA256SUMS` | checksum daquele aparelho |
| `<aparelho>-README.txt` | instruções daquele aparelho |

Conferido baixando do GitHub com o `curl`: o `sha256sum -c` do X55 confere, a
imagem tem tabela de partição válida, `e2fsck -fn` limpo e os 6 apps em
`/opt/giochi/apps/index.json`. Na página publicada, os sete links de download
respondem 200.

As releases `v0.1.1`, `v0.1.2` e `v0.1.7` estão incompletas — anteriores às
correções de §7.7 e §7.9. A `v0.1.7`, em particular, publicou os arquivos e
falhou ao gerar a página. Use a `v0.1.10` ou mais nova.

**O site está no ar.** `https://xtrempkch-droid.github.io/GIOCHI-OS/` serve o
`index.html` da raiz — conferido com `curl`: 200 e os sete links de download da
versão publicada respondendo 200.

Isso funcionou porque o Pages deste repositório está em **"Deploy from a
branch"**: ele publica o repositório, e o `index.html` da raiz é a página. A
tentativa anterior de publicar por `actions/deploy-pages` exigia trocar para
`build_type: workflow` — configuração de administrador, que o `GITHUB_TOKEN` não
alcança. Um arquivo no branch resolve sem permissão nenhuma.

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

## 7.8 Decisões (15/11/2026, uma página na raiz)

O site deixou de ser um diretório gerado e passou a ser **um arquivo**:
`index.html`, na raiz, commitado. O GitHub Pages publica o repositório, então a
página existe sem job de deploy, sem artefato de site e sem `build_type`.

- **Arquivo único, não pasta.** `build-site.mjs --single-file` escreve um HTML
  com o CSS no `<style>`, a marca em SVG inline, o logo em base64 e os
  downloads apontando para a release. Nada é carregado de fora: nenhum `<link>`,
  nenhum `src` relativo. Um teste percorre todo `img`/`link` do arquivo e recusa
  qualquer subrecurso que não seja `data:`. 168 KiB, sem requisição extra.
- **Por que arquivo e não pasta publicada:** `site/dist` era gerado no runner e
  subia como artefato do Pages — que dependia de uma configuração do repositório
  (`build_type: workflow`) que ninguém tinha como mudar pelo código. Um arquivo no
  branch não depende de configuração nenhuma, e o diff da página fica no
  histórico junto do commit que a mudou.
- **A página é regenerada pelo `release.yml`, no mesmo run que publica os
  arquivos.** Ela cita versão, tamanho e sha256 de cada aparelho: gerar de outra
  build seria afirmar número errado. Medido: a build local é Buildroot 2024.02 e a
  do CI é 2025.02 — mesmo código, imagens diferentes, então os números daqui não
  valem lá.
- **Submenus com `<details>`, não com hover nem JS.** Hover não existe em tela de
  toque e um menu que depende de JS não abre quando o JS falha. Quatro submenus
  (Baixar, Instalar, Aparelhos, Projeto) com um item por aparelho em dois deles.
  Um teste confere que **todo** `href="#x"` tem `id="x"`: submenu que rola para
  lugar nenhum é pior que menu nenhum.
- **O nome do anexo na página é o do `flatten`.** `<aparelho>-SHA256SUMS` e
  `<aparelho>-README.txt` vêm de `nomeComAparelho`, a mesma função que renomeia os
  anexos da release. Duas regras de nome divergiriam calado, e o botão principal
  baixaria 404.
- **Placeholder que sobra no template é erro.** Um `<!--X-->` esquecido não
  aparece na página — vira buraco invisível. A geração falha e diz quais sobraram.

O `deploy` e o artefato `giochi-os-site` saíram do workflow. O que sobra é:
`package` (matriz) → `publish` (release + `index.html` commitado no `main`).

## 7.9 Decisões (15/11/2026, a página no ar)

- **O `flatten` move o manifesto para fora da pasta do aparelho.** Depois dele,
  `release.json` não está mais em `dist/<device>/`, e sim em
  `dist/<device>-release.json` — se ficasse dentro, os manifestos colidiriam na
  release como os outros anexos. O gerador da página só procurava dentro da
  pasta e falhou em produção na `v0.1.7`: a release saiu inteira e a página
  parou com "nenhum release.json encontrado". Agora aceita os dois layouts, e
  dois testes garantem que eles geram **os mesmos links**.
- **O Pages publica o repositório, não um artefato.** Com `index.html` na raiz,
  "Deploy from a branch" já serve a página. Todo o caminho `deploy-pages`
  (permissões `pages`/`id-token`, `upload-pages-artifact`, job `deploy`, troca
  de `build_type` por API) existia para publicar um diretório gerado e dependia
  de uma configuração de administrador. Foi removido.
- **O robô commita a página.** O `publish` gera `index.html` com a versão e os
  sha256 do dist que ele mesmo publicou, e empurra no `main`. Medido na
  `v0.1.8`: commit `site: página de download da 0.1.8`, de
  `github-actions[bot]`, e a página no ar passou a apontar para os anexos da
  `v0.1.8`. Antes de empurrar ele faz `checkout -B main origin/main` e, se o
  push falhar, `pull --rebase` uma vez.

## 7.10 Decisões (15/11/2026, dez idiomas)

O `index.html` passou a falar os dez idiomas mais falados do mundo: inglês,
chinês, híndi, espanhol, francês, árabe, bengali, português, russo e urdu.

- **Um arquivo, dez idiomas.** Dez páginas seriam dez arquivos para manter e um
  link diferente para cada pessoa. O conteúdo dos dez vai embutido no mesmo
  arquivo (`<script type="application/json" id="i18n-dados">`) e a troca
  acontece no navegador.
- **A página continua inteira sem JavaScript.** O gerador **escreve** o idioma
  padrão no HTML (`preencherPadrao`), então quem chega sem JS — ou um robô de
  busca — lê tudo. O script só troca textos que já estão lá; ele não cria
  conteúdo. Sem JS: `lang="en"`, página completa, seletor visível e um
  `<noscript>` avisando.
- **Padrão é inglês, detecção automática.** A página é publicada para o mundo e
  inglês é o único dos dez que a maioria dos visitantes de fora lê. Com JS, o
  navegador manda: `navigator.languages` escolhe o idioma, e um idioma fora da
  lista fica no inglês. A escolha manual fica em `localStorage`.
- **RTL não é tradução: é layout.** Árabe e urdu escrevem da direita para a
  esquerda. O script troca `dir` no `<html>` e o CSS usa propriedades lógicas
  (`margin-inline`, `inset-inline-end`, `border-inline-start`,
  `text-align:start`), então a página inteira se espelha. Código e caminhos
  continuam LTR dentro de RTL (`[dir="rtl"] pre`): inverter um comando de shell
  o torna impossível de copiar.
- **Os nomes dos idiomas ficam no próprio alfabeto.** Quem procura russo
  encontra "Русский" mesmo sem ler a página em inglês.
- **O dicionário é dado, não código.** `<script type="application/json">` não é
  executado, e `<` vira `\u003c` na serialização: uma tradução não pode fechar o
  bloco e virar script. `validarTraducoes()` recusa tag fora de
  `<code>`/`<strong>`/`<em>` — `innerHTML` com valor de tradução é execução de
  script com outro nome.

Dois defeitos medidos durante a implementação, os dois invisíveis para quem tem
JavaScript ligado e o idioma certo no navegador:

- **Elemento com `data-i18n` e `data-i18n-vars` não era preenchido.** O
  preenchimento casava `data-i18n="chave"></` — colado no fecha-tag. Com o
  atributo de variáveis depois, os botões de download, o resumo dos apps e a
  contagem de releases saíam **vazios** sem JS. Agora a varredura é da tag de
  abertura inteira.
- **`escapeHtml` no JSON das variáveis.** `{"n":6}` virava `{&quot;n&quot;:6}`,
  e o `JSON.parse` do script estourava — derrubando a troca de idioma na página
  inteira. O navegador **não** desfaz entidade em atributo lido por JS; agora
  `jsonAtributo()` escapa só `&`, `'` e `<`.

Verificado num DOM de verdade (`jsdom`, fora do repositório): os dez idiomas
aplicam, `dir` muda para RTL em árabe e urdu, a detecção pelo navegador escolhe
o idioma certo, idioma fora da lista cai no inglês, o clique troca, e nenhum dos
96 elementos traduzíveis fica vazio. 105 testes verdes.

## 7.11 Decisões (15/11/2026, observações por aparelho)

Alguns aparelhos precisam de um aviso que muda a decisão de quem vai baixar.
O R35S é o caso: o mesmo modelo sai de fábrica com **cinco painéis** medidos
(`device/r35s/panels/`), sem EDID para descobrir qual é — DSI não tem. Esta
imagem referencia o `panel4`; unidade com `panel1`/`panel2`/`panel3` precisa de
outra build. E a placa é a mesma do R36S, então a imagem roda em algumas
unidades dele e variantes.

- **A frase é traduzida, o dado não.** `device-notes.mjs` guarda o dado
  (`panel4`, `["R36S","R33S"]`); a frase vive no dicionário dos dez idiomas com
  marcadores (`{modelo}`, `{outros}`, `{lista}`). Escrever a frase inteira no
  dado a deixaria em português no meio de uma página em árabe.
- **A nota fica FORA do `<details>`.** Aviso escondido atrás de um clique é
  aviso que ninguém lê. Ela aparece entre o sha256 e os botões de download —
  antes de baixar, não depois.
- **A nota mora aqui, não no `device.json`.** Ela é sobre o que foi publicado e
  testado, não sobre o hardware em abstrato: o `device.json` diria "panel4" mesmo
  que o build passasse a usar outro painel de referência, sem reescrever a
  frase. O custo é que esta lista envelhece junto com o build — quando o painel
  de referência mudar no Giochi System, o campo `painel` aqui muda também.
- **Lista vazia, nunca `undefined`.** `release.json` sempre traz
  `device.observations` como lista; aparelho sem nota traz `[]`, para o
  consumidor não precisar testar dois formatos.

Medido no caminho: o script do navegador tinha duas listas (`data-i18n` e
`data-i18n-html`) e só a primeira substituía `{marcador}`. As notas usam a
segunda, então o texto trocava de idioma e deixava `{modelo}` cru na tela. Ficou
invisível para quem tem o idioma do navegador igual ao padrão — que é o caso de
quem testa. `comVars()` passou a servir as duas.

## 7.12 Decisões (17/11/2026, doação)

No fim da página há um espaço para quem quiser ajudar a comprar equipamentos de
teste ou cobrir os custos do projeto, com três formas:

| Forma | Valor |
| --- | --- |
| **PIX** por chave (`6fe4182f-30b3-4c35-9620-ccb8bb7341e0`) | livre |
| **Nubank** (link de cobrança) | **fixo, R$ 10,00** |
| **Mercado Pago** (cartão, boleto ou PIX) | livre |

- **O valor fixo é dito na tela.** O link do Nubank cobra R$ 10,00 e o título e
  o botão dizem isso nos dez idiomas — um botão que cobra sem dizer é cobrança
  surpresa. Um teste percorre as dez traduções exigindo o valor na frase.

- **A chave aparece como TEXTO, não só como botão.** `navigator.clipboard` exige
  contexto seguro: funciona em `https://`, **não** em `file://` — e a página é
  feita para abrir do disco também. Se o botão falhar, a chave ainda pode ser
  selecionada e copiada na mão. Botão sozinho seria um botão inútil em metade
  dos casos.
- **Três caminhos no script, um aviso.** `clipboard.writeText` (moderno),
  `select` + `execCommand("copy")` (o antigo, para `file://`) e o texto
  selecionável (quando os dois falham). O aviso é traduzido:
  `donate.copied` / `donate.copyFailed`, nos dez idiomas como o resto.
- **A chave não é traduzível.** Ela é uma string, não uma frase: o elemento tem
  `dir="ltr"` e **nenhum** `data-i18n` — traduzir, espelhar em RTL ou escapar
  quebraria a colagem no app do banco. Um teste fixa isso.
- **Link externo com `rel="noopener noreferrer"`.** `target="_blank"` sozinho
  deixa a página aberta manipulável pelo destino.
- **Tom de convite, não de pedágio.** Sem banner, sem contador, sem animação
  pedindo atenção, e a nota diz que nada no sistema muda por causa de uma
  doação. Fica depois de licenças, no fim: quem chegou até ali já sabe se o
  sistema serve.

## 7.13 Decisões (26/11/2026, o controle virtual é verificado)

O GIOCHI-SYSTEM passou a publicar o controle virtual `Giochi Gamepad` (17
botões, 4 eixos em -32767..32767, num nó só) e o pedido (`GIOCHI-OS#5`) foi:
documentar o contrato na junção **e** garantir que a imagem o carrega — porque o
defeito é silencioso: sem as peças o aparelho boota, os jogos abrem, e cada um
responde no layout daquele aparelho, sem erro em lugar nenhum.

- **A leitura é do arquivo publicado, não do build.** `scripts/lib/gamepad.mjs`
  confere as quatro peças (`/usr/bin/giochi-gamepad`, `/etc/init.d/S52gamepad`,
  `/etc/giochi/gamecontrollerdb.txt`, `/etc/giochi/buttons.map`) com `debugfs`,
  no `rootfs.ext4` do alvo virtual e na partição extraída do cartão. É a mesma
  porta do `apps.imageVerified`, pela mesma razão: o build pode ter prometido o
  que não entrou.
- **O bit de execução conta.** Arquivo presente sem `+x` não sobe, e o sintoma é
  idêntico ao do arquivo ausente — por isso `notExecutable` existe e entra no
  veredito (`complete`).
- **`expected` é política, `complete` é fato.** Alvo virtual não tem gamepad
  físico: `input.virtualGamepad.expected = false`, e a ausência das peças no
  QEMU não vira aviso. Em cartão, falta de peça é `gamepad_incompleto`.
- **Mapa sem `axis_*` vira aviso.** `mapa_sem_calibracao`: o daemon exige `min`
  **e** `max` por eixo; sem os dois ele repassa o valor cru limitado à faixa
  canônica, e numa faixa 15..1023 isso é curso de 1,5% do analógico. Foi o
  estado do R35S até 17/11/2026 — zero linhas `axis_*`, com a medição só em
  comentário.
- **`CONFIG_INPUT_UINPUT` não é verificável daqui.** A config do kernel não vem
  em `out/<device>/` e `/dev/uinput` só existe no boot; isso fica para
  `/etc/init.d/S52gamepad status` e o `giochi-selftest` no aparelho. O
  `docs/juncao.md` diz o que a junção garante e o que **não** garante, em vez de
  fingir cobertura.
- **A extração do cartão é uma só.** `withCardRootfs` entrega a partição
  extraída a um callback; ler apps e gamepad em duas chamadas pagaria o `dd` de
  1 GiB duas vezes (~8 s cada).
- **O README do aparelho diz o veredito.** Quem baixa lê o `README.txt`, não o
  `release.json`: "completo", "INCOMPLETO — falta …" ou "não se aplica".

Medido com o `assemble` nesta máquina: a imagem local do R35S de 15/11/2026
(anterior ao virtual) publica `gamepad_incompleto` + `mapa_sem_calibracao`; a do
QEMU publica `expected: false` e não avisa. 126 testes.

## 7.14 Decisões (26/11/2026, loja e PortMaster)

A loja e o PortMaster entraram no ecossistema: a loja entrega `.giochi`
assinado em `/user/apps`, e o PortMaster é um **sideload** que baixa `.zip` sem
assinatura e roda dentro do `bubblewrap`. O pacote dele tem `gptokeyb2` (GPL-2.0)
e `7zzs` (LGPL-2.1) e por isso **não** pode entrar na raiz assinada; o que a
imagem leva é o **runtime** (python3 + bubblewrap, 22,9 MiB), opt-in no build do
sistema.

- **`scripts/lib/portmaster.mjs` confere o runtime na imagem.** Cinco peças:
  `python3`, `bwrap`, `giochi-ports` (os três com `+x`), `/roms` → `/user`
  (symlink) e `OS_NAME="Giochi"` no `os-release`. É o mesmo `debugfs` do
  gamepad, e agora os três (`apps`, `gamepad`, `portmaster`) saem de **uma**
  extração da partição.
- **`python3` presente é o sinal do opt-in.** Sem ele a imagem não ligou
  `GIOCHI_WITH_PORTMASTER` — estado legítimo, registrado como `runtime: false` e
  **sem aviso**. Transformar escolha de build em alarme é o §12.34 ao contrário:
  ensina a ignorar alarme.
- **Ligado e quebrado vira `portmaster_incompleto`.** O pacote instala em
  `/user` e não roda; no aparelho o sintoma é a GUI do PortMaster não abrir.
  `missingPaths` (`roms`, `user`, `os_name`) só entra na conta quando o runtime
  está ligado — numa imagem sem python3 o `/roms` também não existe, e listar os
  dois como "falta" faria parecer defeito o que é escolha.
- **O `os-release` é contrato de terceiro.** O PortMaster resolve o nome por
  `OS_NAME` → `NAME` → `ID`; sem `OS_NAME` o `CFW_NAME` sai `Buildroot` e ele
  procura `mod_Buildroot.txt`. `temOsName` exige o valor `Giochi`, não o
  produto: `OS_NAME="Giochi OS"` não serve.
- **O CI do sistema passou a ligar o runtime nos handhelds.** O `build-device.sh`
  mantém o opt-in; o `build-linux-arm64.yml` passa
  `GIOCHI_WITH_PORTMASTER=${{ matrix.device == 'qemu-aarch64' && '0' || '1' }}`.
  Sem isso a release publicada saía sem python3 e o pacote da loja não rodava —
  e o `Giochi app` já documentava o runtime "na imagem". O QEMU fica de fora: VM
  sem GPU não roda port.
- **`docs/juncao.md` ganhou as quatro rotas** (`image`, `store`, `host`,
  sideload) e a tabela do runtime. O que a junção **não** vê está escrito lá:
  o pacote em `/user`, `CONFIG_USER_NS`, `CONFIG_INPUT_UINPUT` e `/dev/uinput`
  ficam para o `giochi-selftest` no aparelho.

Medido nas imagens locais desta máquina (15/11, anteriores ao PortMaster):
`inspectPortmaster` devolve `runtime: false` nos dois aparelhos, sem aviso — que
é exatamente o estado daquelas imagens. 133 testes.
