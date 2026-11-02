# Documentação — Giochi os

- [Junção](juncao.md) — contrato entre os dois repositórios, as duas fases e o que cada uma verifica.
- [Site](site.md) — como o site é gerado, por que sem `fetch`, e como publicar.

## Princípio

Este repositório **não compila nada**. Ele recebe dois produtos prontos e faz
duas coisas: junta e publica.

Se aparecer lógica de build aqui, está no repositório errado — build é do
Giochi System, app é do Giochi app.

## Independência entre repositórios

Nada é importado do Giochi System nem do Giochi app. O caminho das pastas entra
por argumento, e o único acoplamento é o **contrato em JSON** (`apps.json`,
`device.json`, `release.json`).

Isso é deliberado: os três repositórios são independentes, e um não pode quebrar
porque o outro mudou de estrutura interna.
