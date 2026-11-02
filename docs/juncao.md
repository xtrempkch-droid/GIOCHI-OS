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
3. Escolhe a imagem: se houver mais de uma, a **maior** — kernel e rootfs avulsos
   são menores que a imagem completa do cartão.
4. Copia para `giochi-<device>-<versão>.img`, com nome canônico.
5. Recalcula o SHA-256 do arquivo copiado (não confia no hash de origem: a cópia
   pode ter falhado).
6. Escreve o manifesto e o `README.txt` com o comando `dd`.

## Por que verificar hash duas vezes

A origem tem hash? Sim. Então por que recalcular depois de copiar?

Porque a cópia é onde a falha acontece: disco cheio no meio do `copyFileSync`
produz arquivo truncado **sem erro**. O hash de origem teria sido calculado sobre
o arquivo íntegro; só o recálculo sobre a cópia prova que o que será publicado é
aquilo mesmo.

## Manifesto

`release.json` é o contrato que o site consome:

```json
{
  "schemaVersion": 1,
  "product": "Giochi OS",
  "device": { "id": "qemu-aarch64", "name": "QEMU AArch64 Virt", "arch": "arm64" },
  "system": {
    "version": "0.1.0",
    "buildroot": "2024.02",
    "image": "giochi-qemu-aarch64-0.1.0.img",
    "imageSha256": "…",
    "sizeBytes": 123456,
    "sizeHuman": "120.6 KB"
  },
  "apps": {
    "embedded": [{ "id": "launcher", "version": "0.1.0", "license": "Proprietary" }],
    "store": [{ "id": "shattered-pixel-dungeon", "version": "3.0.0", "license": "GPL-3.0-only", "embedded": false }]
  },
  "generatedAt": "2026-11-02T…",
  "generator": "giochi-os assemble 0.1.0"
}
```

`apps.store` existe para transparência: o site mostra o que **não** está na
imagem, então ninguém instala e conclui que o app sumiu.

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

## O que este repositório não faz

- **Não compila** o sistema nem os apps.
- **Não roda `genimage`** — a montagem do cartão é do Giochi System.
- **Não assina** a imagem — a chave é do Giochi System.
- **Não hospeda** a loja — ela roda no PC do usuário.
