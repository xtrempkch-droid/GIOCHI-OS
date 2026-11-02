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
   Giochi System/out/<device>/     (sdcard.img + SHA256SUMS)
        │
        │  fase 2: package  (DEPOIS do build)
        ▼
   dist/<device>/                  release.json + imagem + SHA256SUMS + README.txt
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
  --version 0.1.0
```

**Antes de copiar qualquer coisa, verifica o `SHA256SUMS` do sistema.** Um hash
divergente aborta: significa que a imagem não é a que o build registrou — disco
cheio, kill no meio, cópia interrompida.

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

Detalhes em [docs/site.md](docs/site.md).

## Comandos

```bash
node tests/run-all.mjs                              # 20 testes
node scripts/assemble.mjs apps --apps <app/> --out <staging>
node scripts/assemble.mjs package --system <out/device> --apps <app/> --out dist
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
│       └── fs.mjs             # hash, JSON, listagem
├── site/
│   ├── template.html
│   └── assets/style.css
├── tests/
└── docs/
```

## Estado

O que está **verificado**: 20 testes passando — junção, verificação de checksum,
regra de licença, geração do site com links corretos.

O que **não** está: nenhuma execução com uma imagem real do Giochi System (o build
nunca rodou) e nenhum `genimage` — a montagem do cartão é feita pelo Giochi
System, este repositório só empacota e publica.

Licença MIT — ver [LICENSE](LICENSE).
