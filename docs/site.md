# Site

O site de download das imagens.

## Como é gerado

```bash
node scripts/build-site.mjs --dist dist
```

1. Varre `dist/` procurando `release.json` em **qualquer profundidade** — o CI
   baixa artefatos em subpastas com nome do device.
2. Ordena por data, mais recente primeiro.
3. Copia cada imagem para `site/dist/downloads/<device>/`.
4. Injeta os cards no `site/template.html`.
5. Escreve `site/dist/index.html` e `site/dist/releases.json`.

## Por que sem `fetch`

O site precisa funcionar aberto direto do disco:

```text
file:///…/Giochi os/site/dist/index.html
```

`fetch()` de um JSON local é bloqueado por CORS em `file://`. Um site de download
que exige `python -m http.server` para mostrar a lista é um site que não funciona
para quem só quer clicar e baixar.

Solução: os dados são **embutidos no HTML** no momento da geração. O resultado é
um arquivo autocontido, com um CSS ao lado.

## Links relativos

Tudo é relativo (`assets/style.css`, `downloads/<device>/<arquivo>.img`). Isso
permite publicar em qualquer caminho — raiz do domínio, subpasta, GitHub Pages —
sem mudar configuração.

## Publicar

```bash
# gerar
node scripts/assemble.mjs package --system <out/device> --out dist --version 0.1.0 --compress xz
node scripts/build-site.mjs --dist dist

# publicar o conteúdo de site/dist
rsync -av site/dist/ usuario@servidor:/var/www/giochi/
```

Como o site é estático, serve qualquer hospedagem: Nginx, GitHub Pages, S3,
Netlify. Não há back-end.

O workflow `.github/workflows/release.yml` faz o caminho completo: baixa o
artefato `giochi-system-<device>` do GIOCHI-SYSTEM, empacota, cria a release do
GitHub com `dist/*` e publica `site/dist` no Pages. Dispara por tag `v*` ou por
`workflow_dispatch` (`device`, `version`, `system_run_id`).

Para o Pages funcionar, a origem precisa estar em **Settings → Pages → Source:
GitHub Actions**. O workflow usa `actions/upload-pages-artifact` e
`actions/deploy-pages`.

## O que o card mostra

| Campo | Origem |
| --- | --- |
| Nome e id do device | `release.device` |
| Tipo (cartão SD ou máquina virtual) | `release.device.kind` |
| Versão | `release.system.version` |
| Tamanho | `release.system.sizeHuman` |
| Buildroot | `release.system.buildroot` |
| SHA-256 (12 primeiros) | `release.system.imageSha256` |
| Kernel e tamanho | `release.system.kernel` |
| Apps embutidos e de loja | `release.apps` |

O hash completo fica no `SHA256SUMS` copiado junto da imagem — o card mostra só
o começo, porque hash completo em tela não é verificável a olho.

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

O site é gerado e os testes conferem que:

- o HTML contém o nome do device e o link da imagem;
- a imagem foi realmente copiada para `downloads/`;
- o CSS está no lugar;
- release sem imagem gera aviso, não link quebrado;
- alvo virtual copia o kernel e mostra o comando do QEMU;
- alvo de cartão **não** mostra o bloco de QEMU;
- todo `assets/*` referenciado no HTML existe no site publicado.

Não há CDN, cache, analytics nem formulário. É uma página de download.
