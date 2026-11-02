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

Repositório no GitHub: `https://github.com/xtrempkch-droid/GIOCHI-OS` (a criar).

## 3. Estado atual

### Concluído

- Estrutura de repositório pronta para GitHub.
- `scripts/assemble.mjs` com as duas fases (`apps`, `package`).
- `scripts/build-site.mjs` gerando site autocontido.
- `scripts/lib/` com 5 módulos: `fs`, `system`, `apps`, `pipeline`, `site`.
- `site/template.html` + `site/assets/style.css`.
- 20 testes em `tests/pipeline.test.mjs`.
- Workflow de validação.
- Documentação em `docs/` (3 páginas).

### Validado nesta sessão

- `node tests/run-all.mjs` passou: **20/20**.
- Site gerado de verdade a partir de uma release de demonstração:
  `site/dist/index.html` contém o card, o link `downloads/<device>/<img>` e o CSS;
  todos os `href` são relativos e existem.
- Rodei o fluxo completo (fase `package` → `build-site`) com uma imagem de
  demonstração e conferi o HTML produzido.

### Não executado / pendente

- **Nenhuma execução com imagem real** do Giochi System — o build nunca rodou.
- **Nenhuma fase `apps` com app pronto**: todos os apps do Giochi app estão em
  `scaffold`, então a fase `apps` hoje só produz overlay vazio (com aviso).
- **Sem repositório Git.** `git` não está instalado neste ambiente.
- **Sem CI real.** O workflow está escrito, nunca rodou.

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
│       └── site.mjs           # geração do HTML
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

Exige `device.json`, `build-info.txt`, `SHA256SUMS` e ao menos uma imagem
(`.img`/`.iso`). O `SHA256SUMS` é verificado arquivo por arquivo.

### Saída — `dist/release.json`

Manifesto consumido pelo site. Formato completo em
[docs/juncao.md](docs/juncao.md).

## 6. Comandos

```bash
node tests/run-all.mjs

node scripts/assemble.mjs apps \
  --apps ../"Giochi app"/app --out ../staging

node scripts/assemble.mjs package \
  --system ../"Giochi System"/out/qemu-aarch64 \
  --apps ../"Giochi app"/app --out dist --version 0.1.0

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

## 8. O que este repositório não faz

- **Não compila** nada. Se aparecer lógica de build aqui, está no lugar errado.
- **Não roda `genimage`** — a montagem do cartão é do Giochi System.
- **Não assina** a imagem — a chave é do Giochi System.
- **Não hospeda a loja** — ela roda no PC do usuário (ver Giochi app).

## 9. Ambiente desta sessão

Windows, sem toolchain de desenvolvimento. O que está disponível e o que não:

| Ferramenta | Estado |
| --- | --- |
| `node` | **disponível** (runtime do DSH) — tudo aqui roda e é testado |
| `git` / `bash` | ausentes |
| `rustc` / `cargo` | ausentes (não são usados neste repositório) |

Como este repositório é **só Node**, tudo nele é verificável nesta máquina — ao
contrário do Giochi System (shell) e do launcher (Rust), que nunca foram
executados.

## 10. Como retomar

```bash
cd "C:\Users\Jussara dias\Desktop\plataforma sistema\Giochi os"
node tests/run-all.mjs
```

Fluxo completo, quando houver imagem do sistema:

```bash
node scripts/assemble.mjs apps --apps ../"Giochi app"/app --out ../staging
# ... rodar o build do Giochi System com o overlay ...
node scripts/assemble.mjs package --system ../"Giochi System"/out/qemu-aarch64 \
  --apps ../"Giochi app"/app --out dist --version 0.1.0
node scripts/build-site.mjs --dist dist
# abrir site/dist/index.html
```

Para publicar no GitHub:

```bash
git init
git add .
git commit -m "Initial Giochi os: junção e site"
git branch -M main
git remote add origin https://github.com/xtrempkch-droid/GIOCHI-OS.git
git push -u origin main
```

## 11. Arquivos que não devem ser commitados

`dist/`, `site/dist/`, `node_modules/`, e imagens `*.img` / `*.iso` / `*.sdcard`.

Imagem de cartão é artefato grande e é publicada no site ou em release — nunca no
Git. O `.gitignore` cobre isso.
