# Regras de engenharia — como elas valem na junção

Este repositório **adota** as regras de engenharia do Giochi, publicadas em
[`GIOCHI-SYSTEM/docs/regras-para-outras-equipes.md`][base] (commit
`7eef035797aecd7c643defb7ad66b9c8c3688009`). O texto base é a fonte da verdade;
aqui fica **o que elas mudam no trabalho da junção**, sem paráfrase que envelhece
separado.

[base]: https://github.com/xtrempkch-droid/GIOCHI-SYSTEM/blob/main/docs/regras-para-outras-equipes.md

Adotado em 26/11/2026 (issue #6), na mesma sessão em que a `v0.1.4` foi publicada
com a verificação de entrada (`release.json#input`).

## Por que a junção precisa delas mais que as outras

A junção é onde os artefatos do sistema, do app e dos jogos se encontram. Um erro
de qualquer um dos três aparece **aqui**, e a tentação é sempre a mesma: repetir
o que outro repositório declarou. As regras existem para trocar "o sistema diz
que tem" por "a imagem tem, e eu li de dentro dela".

Não há import entre os repositórios: a comunicação é por **artefato declarado**.
Quando a imagem sai sem uma capacidade, a pergunta não é "quem esqueceu" — é "o
artefato declarou isso?".

## O que já está aplicado, com a medição

| Regra | Como aparece neste repo |
| --- | --- |
| **R3 — pergunte pela consequência** | `apps.imageVerified`, `input.virtualGamepad` e `input.portmaster` são lidos do ext4 **publicado** com `debugfs`, não do catálogo nem do `device.json`. O `README.txt` do aparelho repete o veredito em texto. `scripts/lib/{gamepad,portmaster,rootfs}.mjs` |
| **R2 — verde não é correto** | A imagem do R35S de 15/11 bootava e os jogos abriam — e publicava `gamepad_incompleto` + `mapa_sem_calibracao`. O aviso aparece no build, onde dá para ler |
| **R6 — uma fonte da verdade** | A escolha do artefato, os nomes dos anexos e o texto do QEMU saem de uma função só (`lib/system.mjs`, `lib/names.mjs`, `lib/qemu.mjs`); o site e o `README.txt` consomem o mesmo `release.json` |
| **R8 — licença antes de recurso** | GPL/AGPL/LGPL é recusado na fase `apps`, aqui também, sem depender do validador de outro repo. O pacote do PortMaster (GPL-2.0 + LGPL-2.1) é **barrado da imagem** e vive em `/user`; o que a imagem leva é o runtime |
| **R10 — registre o que não foi medido** | `docs/juncao.md` diz explicitamente que a junção **não** verifica `CONFIG_INPUT_UINPUT`, `CONFIG_USER_NS`, `/dev/uinput` nem o pacote em `/user` — e que isso é do `giochi-selftest` no aparelho. `input.*.checked: false` marca "não olhei", diferente de "não tem" |
| **R12 — estado que sobra mente** | A fase `apps` **recria** o diretório de saída a cada execução: app removido do catálogo não sobrevive no overlay. A injeção apaga antes de escrever (o `debugfs write` não sobrescreve e devolve 0) |
| **R9 — não confie no relatório** | A conferência da `v0.1.4` foi feita **baixando o anexo do GitHub** e descomprimindo, não no `dist/` local |

## O que a junção continua não podendo provar

Escrito aqui porque omitir seria a R10 ao contrário:

- **o kernel tem a config que o `fragment` pede** — `CONFIG_INPUT_UINPUT`,
  `CONFIG_USER_NS` e `CONFIG_INPUT_JOYDEV` não vêm em `out/<device>/`;
- **o daemon funciona** — a junção vê o arquivo e o bit de execução, não o evento
  chegando (`EV_SYN/SYN_REPORT` foi exatamente esse caso);
- **o port roda** — o pacote do PortMaster é instalado depois, em `/user`.

A resposta honesta para os três é o `giochi-selftest` no aparelho, com `SKIP`
onde ele não pode provar. Um `SKIP` justificado vale mais que "tudo ok".

## Checklist local (o do documento base, aplicado)

Antes de fechar commit ou release:

- [ ] Rodei o comando que sustenta cada afirmação — e, quando a afirmação é sobre
      a imagem, o comando lê **a imagem**.
- [ ] Estraguei de propósito o que a verificação protege, e ela ficou vermelha:
      os testes de `inspectGamepad`/`inspectPortmaster` têm o caso negativo
      (peça ausente, `+x` faltando, mapa sem `axis_*`).
- [ ] Cada verificação responde *"isto prova que ___"* em uma frase.
- [ ] O dado que duas partes conhecem mora em um lugar só (`release.json`).
- [ ] Defeito em repo de outra equipe vira **issue com medição**, não patch.
- [ ] Licença antes de recurso.
- [ ] Escrevi o que **não** foi medido.
- [ ] Cito o **commit do build** da imagem que medi (ver `AGENTS.md` §11).
