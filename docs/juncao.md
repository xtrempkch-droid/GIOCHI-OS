# Junção

Como o Giochi os junta o sistema e os apps.

## Por que duas fases

Uma fase só não funciona, e a razão é de ordem física: **os apps precisam estar
dentro do rootfs antes do Buildroot gerar a imagem**.

```text
fase 1 (apps)     → overlay de rootfs
                      ↓
                    Giochi System compila
                      ↓
fase 2 (package)  → imagem + manifesto + checksum
```

Se o empacotamento tentasse inserir apps depois, teria que remontar a imagem
ext4 e reverter a assinatura — desfazendo justamente o que protege o sistema.

## Fase 1 — `apps`

**Entrada:** um ou mais catálogos (ver "Mais de um catálogo" abaixo)
**Saída:** `staging/rootfs-overlay/opt/giochi/apps/`

O que faz, para cada app de distribuição `image`:

1. Confere `status`. Em `scaffold`, pula com aviso.
2. Confere a licença. GPL/AGPL/LGPL em `image` é recusado.
3. Exige `bin/` com conteúdo, `entrypoint` existente e `capa.png` 320×320.
4. Copia `bin/` para `opt/giochi/apps/<slug>/bin/`.
5. Calcula SHA-256 de cada arquivo copiado.
6. Escreve `index.json` — é o que o launcher lê para montar a grade de apps.

O overlay é consumido pelo Giochi System como `BR2_ROOTFS_OVERLAY` adicional.

## Fase 2 — `package`

**Entrada:** `Giochi System/out/<device>/`
**Saída:** `dist/<device>/` com imagem renomeada, `release.json`, `SHA256SUMS`,
`README.txt`

Os três últimos têm o mesmo nome em todo aparelho. Isso vale dentro de
`dist/<device>/`, mas **não** na release do GitHub, onde os anexos são planos e
um sobrescreveria o outro: antes de publicar, `scripts/flatten-release.mjs` os
renomeia para `<device>-SHA256SUMS`, `<device>-README.txt` e
`<device>-release.json`, e ajusta o `sha256sum -c` citado no README.

O que faz:

1. Exige `device.json`, `build-info.txt` e `SHA256SUMS`.
2. **Verifica cada arquivo listado no `SHA256SUMS`.** Hash divergente aborta.
3. Escolhe o artefato principal:
   - havendo imagem de cartão, a **comprimida** tem preferência; entre as cruas,
     a **maior** (kernel e rootfs avulsos são menores que a imagem do cartão);
   - não havendo, usa o `rootfs.ext*` como disco e leva o kernel junto.
4. Copia para `giochi-<device>-<versão>.img` (ou `.img.xz` com `--compress`).
5. Recalcula o SHA-256 do arquivo copiado (não confia no hash de origem: a cópia
   pode ter falhado).
6. Lê o que está dentro da imagem, quando dá.
7. Escreve o manifesto e o `README.txt` com o comando certo para o tipo de alvo.

## Alvo virtual (QEMU)

O `qemu-aarch64` não passa por `genimage`: o Buildroot entrega `Image` (kernel) e
`rootfs.ext4`. Não existe "cartão" para montar, e inventar um seria pior — gravar
num cartão SD não produz um aparelho que inicializa.

O empacotamento então publica:

| Arquivo | Papel |
| --- | --- |
| `giochi-qemu-aarch64-0.1.0.img` | o `rootfs.ext4` renomeado; é o disco (`-drive`) |
| `giochi-qemu-aarch64-0.1.0-Image` | o kernel (`-kernel`) |
| `SHA256SUMS` | as duas linhas |
| `README.txt` | comando do QEMU pronto, `root=/dev/vda` e o console do build |

O `release.json` ganha `system.kind: "virtual"` e o bloco `boot` com
`machine`, `cpu`, `smp`, `memoryMiB`, `disk`, `kernel` e `cmdline`. O comando é
gerado por `scripts/lib/qemu.mjs`, a mesma função que monta o `README.txt` e o
bloco do site — assim o texto publicado não diverge sozinho.

## Compressão (`--compress`)

```bash
node scripts/assemble.mjs package ... --compress xz
```

Formatos: `xz` (padrão quando ligado), `zst` e `gz`. Se o binário não existir, o
`gz` sai do `node:zlib` e o nome publicado diz `gz` — o nome nunca mente sobre o
conteúdo.

O arquivo cru **não** fica ao lado do comprimido: dois arquivos com o mesmo
conteúdo dobram o download e convidam a baixar o errado.

## App na imagem é verificado

O manifesto diz "estes apps estão na imagem". Dizer isso a partir do catálogo é
chute: a fase 1 pode não ter entrado no build, e a release passaria a anunciar
app que não existe no aparelho.

Quando o rootfs é um arquivo solto, o `debugfs` lê
`/opt/giochi/apps/index.json` de dentro do ext4 — sem root, sem montar. Se o
índice não estiver lá:

- a release **não** anuncia os apps do catálogo como embutidos;
- emite o aviso `overlay_ausente`;
- marca `apps.imageVerified: true` — o `debugfs` olhou, e a ausência é a resposta.

Sem `debugfs` na máquina, `apps.imageVerified` fica `false` e o catálogo é usado
como antes, com aviso.

## Por que verificar hash duas vezes

A origem tem hash? Sim. Então por que recalcular depois de copiar?

Porque a cópia é onde a falha acontece: disco cheio no meio do `copyFileSync`
produz arquivo truncado **sem erro**. O hash de origem teria sido calculado sobre
o arquivo íntegro; só o recálculo sobre a cópia prova que o que será publicado é
aquilo mesmo.

## Manifesto

`release.json` é o contrato que o site consome (`schemaVersion: 2`):

```json
{
  "schemaVersion": 2,
  "product": "Giochi OS",
  "device": { "id": "qemu-aarch64", "name": "QEMU AArch64 Virt", "arch": "arm64", "kind": "virtual" },
  "system": {
    "version": "0.1.0",
    "buildroot": "2024.02",
    "kind": "virtual",
    "image": "giochi-qemu-aarch64-0.1.0.img.xz",
    "imageSha256": "…",
    "sizeBytes": 123456,
    "sizeHuman": "120.6 KB",
    "kernel": {
      "name": "giochi-qemu-aarch64-0.1.0-Image.xz",
      "sha256": "…",
      "sizeBytes": 12345,
      "sizeHuman": "12.1 KB"
    },
    "artifacts": [
      { "role": "image", "name": "…", "sha256": "…", "sizeBytes": 0, "sizeHuman": "…" },
      { "role": "kernel", "name": "…", "sha256": "…", "sizeBytes": 0, "sizeHuman": "…" }
    ]
  },
  "boot": {
    "machine": "virt",
    "cpu": "cortex-a53",
    "smp": 2,
    "memoryMiB": 512,
    "disk": "giochi-qemu-aarch64-0.1.0.img",
    "kernel": "giochi-qemu-aarch64-0.1.0-Image",
    "cmdline": "root=/dev/vda rw console=ttyAMA0"
  },
  "apps": {
    "embedded": [{ "id": "launcher", "version": "0.1.0", "license": "Proprietary" }],
    "imageVerified": true,
    "store": [{ "id": "shattered-pixel-dungeon", "version": "3.0.0", "license": "GPL-3.0-only", "embedded": false }]
  },
  "generatedAt": "2026-11-13T…",
  "generator": "giochi-os assemble 0.1.0"
}
```

Para imagem de cartão, `kind` é `"card"`, não há `boot` e `kernel` é `null`.

`apps.store` existe para transparência: o site mostra o que **não** está na
imagem, então ninguém instala e conclui que o app sumiu.

O site tolera release antiga (`schemaVersion: 1`): sem `kind`, o card é tratado
como cartão.

## Casos de borda tratados

| Situação | Comportamento |
| --- | --- |
| App em `scaffold` | pulado com aviso, não reprova |
| App `host` | ignorado (roda no PC) |
| `bin/` vazio em app `ready` | erro |
| `capa.png` ausente ou fora de 320×320 em app `image` | erro |
| GPL com `distribution: image` | erro |
| Múltiplas imagens na saída | usa a maior, com aviso |
| `SHA256SUMS` citando arquivo inexistente | erro |
| Imagem ausente | erro na fase 2, aviso na geração do site |
| Só kernel + rootfs (alvo virtual) | publica disco + kernel, com aviso `sem_cartao` |
| Overlay de apps fora do build | `overlay_ausente`; manifesto não anuncia app ausente |
| `debugfs`/`xz` ausentes na máquina | aviso; cai para catálogo e `gz` |

## O que este repositório não faz

- **Não compila** o sistema nem os apps.
- **Não roda `genimage`** — a montagem do cartão é do Giochi System.
- **Não assina** a imagem — a chave é do Giochi System.
- **Não hospeda** a loja — ela roda no PC do usuário.

## Injeção na imagem (`--inject-apps`)

```bash
node scripts/assemble.mjs package ... --inject-apps
```

A decisão deste repositório é clara: apps entram no rootfs **antes** do build.
Ainda assim existe um caso em que isso não é possível — o CI do Giochi System
constrói a imagem sem ver o catálogo do Giochi app, então ela chega pronta e sem
os apps.

`--inject-apps` fecha essa lacuna escrevendo o overlay **sem montar e sem
root**. Dois formatos, porque o artefato do sistema tem dois:

| Entrada | Como |
| --- | --- |
| `rootfs.ext4` (alvo virtual) | `debugfs -w` escreve direto no ext4 |
| `.img` de cartão (MBR/GPT) | extrai a partição com `dd`, altera, confere com `e2fsck -fy`, devolve ao offset com `conv=notrunc,fsync` |

No cartão, a tabela de partição e as demais partições (a FAT de boot, no X55)
**não são tocadas** — só a partição do rootfs é extraída e devolvida.

O que a injeção sempre recusa:

| Condição | Comportamento |
| --- | --- |
| falta biblioteca que um binário pede | recusa: `biblioteca_ausente` |
| overlay não cabe no espaço livre | recusa: `sem_espaco` (com 10% de folga) |
| `e2fsck` ausente (só cartão) | recusa: `e2fsck_ausente` |
| rootfs não passa no `e2fsck` depois | recusa: `rootfs_corrompido` |
| imagem comprimida na origem | recusa: `cartao_comprimido` |
| overlay já presente | avisa `apps_ja_presentes`, não reescreve |

A checagem de espaço não é zelo: encher um ext4 no meio da escrita trunca
arquivo **sem erro**, e o app passa a falhar de um jeito que não parece falta de
espaço. A de `e2fsck` é a mesma ideia uma camada acima — um rootfs que não monta
dá um cartão que liga e não passa do bootloader.

A checagem de biblioteca é o ponto. Ela lê as `DT_NEEDED` de cada binário do
overlay (`readelf` com `LC_ALL=C`) e procura cada uma dentro da imagem. Sem
isso, a primeira imagem do Giochi OS anunciou 6 apps e o console mostrou:

```text
giochi-launcher: error while loading shared libraries: libSDL2-2.0.so.0
giochi-init: launcher saiu com 127 (queda 1 de 5 na janela de 60s)
```

Depois dela, `SDL2_image` e `SDL2_mixer` entraram no fragmento do `qemu-aarch64`
— os dois jogos que dependem deles estavam a caminho do mesmo defeito.

A imagem injetada **não** passou pelo `post-build` com esses arquivos: o aviso
`apps_injetados` diz isso em toda execução. É o preço de fazer no lugar errado,
e é por isso que o caminho normal continua sendo a fase 1 antes do build.

## A conferência vale para cartão também

`apps.imageVerified` não é exclusivo do alvo virtual. Num `.img` de cartão o
ext4 fica **atrás da tabela de partição**, então o `debugfs` não abre direto:

1. `sfdisk -J` lê a tabela;
2. a maior partição Linux é extraída com `dd` para um temporário;
3. o `debugfs` lê o `index.json` dessa partição;
4. o temporário é apagado.

Custa ~8 s num rootfs de 1 GiB, e é leitura — a imagem original não é tocada.
O que se ganha: a release deixa de repetir o catálogo. Medido no X55 em
13/11/2026, uma imagem de cartão construída sem o overlay saía anunciando 6
apps e a imagem tinha zero; agora ela publica `apps.embedded: []`, avisa
`overlay_ausente` e o site mostra "0 app(s) na imagem".

Quando nem o `debugfs` nem o `sfdisk` existem, o catálogo é a única informação
disponível: a release o usa, marca `apps.imageVerified: false` e avisa
`apps_nao_verificados`.

## O CI precisa montar a imagem de cartão

O build do sistema entrega `Image`, `rootfs.ext4`, `idbloader.img` e
`u-boot*.bin` **soltos**. Um cartão gravado só com eles não inicializa: o
BootROM da Rockchip lê o firmware em setores fixos (64 e 16384) e o kernel vive
numa partição FAT que ninguém criou.

Quem monta o layout é `scripts/make-sd-image.sh` — e ele precisa de loop device.
Por isso o workflow do GIOCHI-SYSTEM ganhou um passo com `sudo` que roda **só
para aparelho que declara firmware de boot em `artifacts`**:

```yaml
if node -e '... artifacts.some(a => /idbloader|u-boot/i.test(a)) ...'; then
  sudo bash scripts/make-sd-image.sh <device>
  sudo chown -R "$(id -u):$(id -g)" out/<device>
fi
```

O `chown` não é detalhe: o script roda como root e o upload roda como o usuário
do runner, que não lê arquivo de outro dono.

O `qemu-aarch64` cai no `else` — não tem U-Boot nem layout de partição, e o
`rootfs.ext4` dele já é o disco.

## Mais de um catálogo (`--apps` repetido ou com vírgula)

```bash
# um catálogo
node scripts/assemble.mjs apps --apps ../GIOCHI-APP/app --out staging

# launcher num repositório, jogos em outro
node scripts/assemble.mjs apps \
  --apps ../GIOCHI-APP/app \
  --apps ../GIOCHI-GAMES \
  --out staging

# a mesma coisa, numa flag
node scripts/assemble.mjs apps --apps ../GIOCHI-APP/app,../GIOCHI-GAMES --out staging
```

Os catálogos são **juntados**: os apps de imagem dos dois entram no mesmo
overlay, os de loja na mesma lista, e o `index.json` sai único.

`id` repetido entre catálogos é **erro**, não "o último vence": dois apps com o
mesmo id escreveriam em `/opt/giochi/apps/<id>`, um apagaria o outro, e o
`index.json` anunciaria os dois.

### Catálogo declarado × catálogo derivado

| Raiz | Forma | Como a lista nasce |
| --- | --- | --- |
| `GIOCHI-APP/app` | declarada | `apps.json` lista cada app |
| `GIOCHI-GAMES` | derivada | varre as pastas de primeiro nível |

O repositório de jogos nasceu sem `apps.json`: cada jogo é uma pasta com
`metadata.json`, `bin/` e `capa.png`, que é exatamente o formato que a fase
`image` exige — só falta a lista. Derivar evita copiar pasta de jogo para o
catálogo do Giochi app, que é o acoplamento que o contrato existe para evitar.

Quando a raiz **não** tem `apps.json`, a lista é montada assim:

| Campo | Origem |
| --- | --- |
| `id` | `metadata.slug` → nome da pasta |
| `folder` | nome da pasta |
| `status` | `ready` se `bin/` tem conteúdo, senão `scaffold` |
| `distribution` | `metadata.distribution` → `forge.json.distribution` → `image` |

Três regras que existem para o repositório em estruturação não derrubar o
release:

- **Só o primeiro nível é varrido.** `target/`, `vendor/` e `crates/` existem
  nos repositórios de jogo e não são apps.
- **`scaffold` é pulado com aviso, não é erro.** Jogo sem `bin/` exportado
  simplesmente não entra na imagem.
- **Aviso `catalogo_derivado`.** Toda execução avisa que a lista foi deduzida;
  declarar um `apps.json` silencia e fixa `status`/`distribution`.

Um `apps.json` presente **manda**: a derivação é plano B, não fusão.

### As duas rotas para um app de outro repositório

| Como o app chega ao aparelho | No `apps.json` | O que a release faz |
| --- | --- | --- |
| embutido na imagem | `distribution: "image"` | copia `bin/` para o overlay |
| baixado pela loja | `distribution: "store"` | só lista em `apps.store`, não embute |

A primeira exige o app no build (mais um catálogo em `--apps`). A segunda não
toca a imagem: o aparelho baixa depois, e a release publica o app em
`apps.store` só para o site mostrar que ele existe e **não** está na imagem.

A escolha não é técnica — é de licença e de ciclo de atualização. App GPL não
pode entrar na raiz assinada (regra verificada na fase `apps`), e app que muda
toda semana não deveria exigir regravar o cartão.
