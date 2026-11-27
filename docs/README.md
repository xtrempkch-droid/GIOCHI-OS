# Documentação — Giochi os

- [Junção](juncao.md) — contrato entre os dois repositórios, as duas fases, o
  contrato de entrada do controle virtual (`Giochi Gamepad`) e o que cada fase
  verifica.
- [Site](site.md) — como o site é gerado, por que sem `fetch`, e como publicar.
- [Regras](regras.md) — as regras de engenharia adotadas, e o que elas mudam na junção.

## Princípio

Este repositório **não compila nada**. Ele recebe dois produtos prontos e faz
duas coisas: junta e publica.

Se aparecer lógica de build aqui, está no repositório errado — build é do
Giochi System, app é do Giochi app.

## Independência entre repositórios

Nada é importado do Giochi System, do Giochi app nem do Giochi games. O caminho
das pastas entra por argumento, e o único acoplamento é o **contrato em JSON**
(`apps.json`, `metadata.json`, `device.json`, `release.json`). O catálogo de
jogos nem `apps.json` tem: a lista é derivada das pastas de jogo.

Isso é deliberado: os repositórios são independentes, e um não pode quebrar
porque o outro mudou de estrutura interna. No `release.yml` isso é explícito: o
checkout dos jogos é `continue-on-error`, e um catálogo que não carrega vira
aviso — a imagem sai com os apps que existem.
