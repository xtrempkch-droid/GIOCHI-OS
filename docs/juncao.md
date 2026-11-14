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

**Entrada:** `Giochi app/app/` (catálogo + pastas dos apps)
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
**Saída:** `dist/` com imagem renomeada, `release.json`, `SHA256SUMS`, `README.txt`

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

## Injeção no ext4 (`--inject-apps`)

```bash
node scripts/assemble.mjs package ... --inject-apps
```

A decisão deste repositório é clara: apps entram no rootfs **antes** do build.
Ainda assim existe um caso em que isso não é possível — o CI do Giochi System
constrói a imagem sem ver o catálogo do Giochi app, então ela chega pronta e sem
os apps.

`--inject-apps` fecha essa lacuna escrevendo o overlay dentro do `rootfs.ext4`
com `debugfs -w`, **sem montar e sem root**. Ele é estreito de propósito:

| Condição | Comportamento |
| --- | --- |
| imagem de cartão (MBR/partição) | recusa: `nao_ext4` |
| falta biblioteca que um binário pede | recusa: `biblioteca_ausente` |
| `debugfs` ausente | recusa: `debugfs_ausente` |
| overlay já presente | avisa `apps_ja_presentes`, não reescreve |

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
