# Giochi os

A **junção** e a **publicação** do projeto Giochi. Duas funções, uma pasta.

| Função | Onde |
| --- | --- |
| **Juntar** o sistema e os apps numa imagem de cartão | `scripts/assemble.mjs` |
| **Publicar** o site de download | `scripts/build-site.mjs` |

| Repositório | Função |
| --- | --- |
| Giochi System | Cria o Linux limpo: kernel, rootfs, boot, drivers, painel |
| Giochi app | Apps e jogos, cada um com seu manifesto de requisitos |
| **Giochi os** (este) | Junta os dois e publica a imagem + o site |

## Como funciona a junção

Duas fases, porque a ordem importa e cada uma roda em lugar diferente.

```text
   Giochi app/app/
        │
        │  fase 1: apps  (ANTES do build)
        ▼
   staging/rootfs-overlay/opt/giochi/apps/
        │
        │  o Giochi System consome este overlay
        ▼
   Giochi System/out/<device>/     (sdcard.img  ou  Image + rootfs.ext4)
        │
        │  fase 2: package  (DEPOIS do build)
        ▼
   dist/                           release.json + imagem (+ kernel) + SHA256SUMS + README.txt
        │
        │  build-site
        ▼
   site/dist/index.html            site de download
```

### Fase 1 — `apps`

Transforma os apps de distribuição `image` num **overlay de rootfs**. Roda antes:
o Giochi System precisa do overlay para gerar a imagem.

```bash
node scripts/assemble.mjs apps \
  --apps ../"Giochi app"/app \
  --out ../staging
```

Produz:

```text
staging/rootfs-overlay/opt/giochi/apps/
├── index.json              # o que o launcher lê
└── <slug>/bin/...          # os arquivos que vão para o aparelho
```

### Fase 2 — `package`

Confere a saída do sistema, copia a imagem com nome canônico e escreve a release.

```bash
node scripts/assemble.mjs package \
  --system ../"Giochi System"/out/qemu-aarch64 \
  --apps ../"Giochi app"/app \
  --out dist \
  --version 0.1.0 \
  --compress xz
```

**Antes de copiar qualquer coisa, verifica o `SHA256SUMS` do sistema.** Um hash
divergente aborta: significa que a imagem não é a que o build registrou — disco
cheio, kill no meio, cópia interrompida.

Aceita dois tipos de saída do build:

| Saída do sistema | O que é publicado | Onde vai |
| --- | --- | --- |
| `.img` / `.iso` / `.sdcard` | a imagem do cartão | cartão SD (handheld) |
| `Image` (kernel) + `rootfs.ext4` | disco + kernel | máquina virtual (QEMU) |

O alvo virtual é o caso do `qemu-aarch64`: o Buildroot não roda `genimage` nele.
O `rootfs.ext4` vira o disco (`-drive`) e o kernel vai como download separado —
sem ele o disco não inicia. O `README.txt` e o site trazem o comando pronto.

**App na imagem é verificado, não presumido.** Quando o rootfs é um arquivo
solto, o `debugfs` lê `/opt/giochi/apps/index.json` de dentro dele. Se o overlay
da fase 1 ficou de fora do build, a release avisa `overlay_ausente` e **não**
anuncia os apps do catálogo como embutidos.

## O que não entra na imagem

| Distribuição | Destino | Por quê |
| --- | --- | --- |
| `image` | dentro da imagem assinada | precisa estar lá no primeiro boot |
| `store` | instalado em `/user` pela loja | GPL exige poder substituir |
| `host` | no PC do usuário | não roda no aparelho |

Apps em `scaffold` são **pulados com aviso**, não reprovam — senão o
empacotamento fica impossível enquanto a migração não termina.

A regra de licença é verificada **aqui também**, não só no validador do Giochi
app. Empacotamento não pode depender de outro repositório ter rodado o
validador antes.

## Site

```bash
node scripts/build-site.mjs --dist dist
```

Gera `site/dist/index.html` com os cards de download embutidos. **Abre direto do
disco**, sem servidor: sem `fetch`, sem CORS, sem build de front-end.

Cada card sabe que tipo de imagem publica: as de cartão ensinam o `dd`, as de
máquina virtual trazem o comando do QEMU e o link do kernel.

Detalhes em [docs/site.md](docs/site.md).

## Comandos

```bash
node tests/run-all.mjs                              # 31 testes
node scripts/assemble.mjs apps --apps <app/> --out <staging>
node scripts/assemble.mjs package --system <out/device> --apps <app/> --out dist \
  --version 0.1.0 --compress xz
node scripts/build-site.mjs --dist dist
```

## Estrutura

```text
Giochi os/
├── scripts/
│   ├── assemble.mjs           # CLI da junção
│   ├── build-site.mjs         # CLI do site
│   └── lib/
│       ├── apps.mjs           # catálogo do Giochi app
│       ├── system.mjs         # saída do Giochi System
│       ├── pipeline.mjs       # as duas fases, testáveis
│       ├── site.mjs           # geração do HTML
│       ├── compress.mjs       # xz/zstd com queda para gzip
│       ├── rootfs.mjs         # lê apps de dentro do ext4
│       ├── qemu.mjs           # comando de boot do alvo virtual
│       ├── names.mjs          # nome cru × nome comprimido
│       └── fs.mjs             # hash, JSON, listagem
├── site/
│   ├── template.html
│   └── assets/style.css
├── tests/
└── docs/
```

## Estado

O que está **verificado**: 31 testes passando — junção, verificação de checksum,
regra de licença, geração do site com links corretos, publicação de alvo virtual
(disco + kernel), compressão e leitura do `index.json` de dentro do `rootfs.ext4`.

O que **não** está: nenhum build de hardware rodado a partir daqui. A montagem do
cartão (`genimage`/`make-sd-image.sh`) é do Giochi System; este repositório só
empacota e publica.

Licença MIT — ver [LICENSE](LICENSE).
