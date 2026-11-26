// PortMaster na imagem: o RUNTIME, não o pacote.
//
// ## A decisão que isto documenta e confere
//
// O PortMaster é a loja de ports da comunidade (PortsMaster). Ele **não** pode
// entrar na imagem assinada: o pacote (`PortMaster.zip`, 24,6 MB) carrega
// `gptokeyb2` (GPL-2.0) e `7zzs` (LGPL-2.1), e a regra de licença desta árvore
// recusa GPL/AGPL/LGPL no artefato publicado. Ele é instalado em `/user` — pela
// loja ou à mão.
//
// O que a imagem pode levar é o **runtime** que ele exige para rodar:
//
// | Peça | Caminho | Por quê |
// | --- | --- | --- |
// | `python3` | `/usr/bin/python3` | o `pugwash` é `#!/usr/bin/env python3` |
// | `bubblewrap` | `/usr/bin/bwrap` | o port roda `.sh` de terceiro; sem sandbox o `giochi-ports` recusa |
// | `giochi-ports` | `/usr/bin/giochi-ports` | o invólucro: acha o pacote, monta o sandbox, encaminha sinal |
// | `/roms` → `/user` | symlink | 28% dos ports citam `/roms` literal (medido: 7 de 25) |
// | `/usr/lib/os-release` com `OS_NAME=Giochi` | arquivo | sem isso o `CFW_NAME` sai `Buildroot` e o PortMaster procura `mod_Buildroot.txt` |
//
// ## Por que é opt-in, e o que este módulo faz a respeito
//
// O runtime custa **22,9 MiB** medidos (python3 com a stdlib em `.pyc` é o
// grosso). É ligado no build do sistema por `GIOCHI_WITH_PORTMASTER=1`, não é
// padrão. Então a junção não pode exigir as peças em toda imagem — tem de
// publicar o que **aquela** imagem tem.
//
// O sinal é factual: `python3` presente é o runtime ligado. A partir daí, ou a
// imagem está completa ou está quebrada, e quebrada vira aviso. Ausente é um
// estado legítimo (imagem sem o runtime) e não gera aviso — só o registro.
//
// O que **não** dá para verificar daqui: `CONFIG_USER_NS` no kernel (o sandbox
// depende dele) e o próprio pacote do PortMaster, que vive em `/user` e é
// instalado depois. Isso fica para o `giochi-selftest` no aparelho, que reporta
// `[PASS] PortMaster … instalado, com python3, sandbox e /roms`.
import { readFromImage } from "./inject.mjs";
import { statRootfsPath } from "./rootfs.mjs";

/** Nome que o PortMaster lê do `os-release` antes de `NAME` e `ID`. */
export const OS_NAME_ESPERADO = "Giochi";

/** Caminho do symlink que os ports esperam. */
export const ROMS_LINK = "/roms";
export const USER_DIR = "/user";

/**
 * O runtime, em ordem de leitura. `executavel` marca o que o `giochi-ports`
 * invoca direto: arquivo presente sem `+x` falha do mesmo jeito que ausente.
 */
export const PECAS_DO_RUNTIME = [
  { id: "python3", caminho: "/usr/bin/python3", executavel: true, papel: "o pugwash é '#!/usr/bin/env python3'" },
  { id: "bwrap", caminho: "/usr/bin/bwrap", executavel: true, papel: "é o sandbox em que o port roda" },
  { id: "giochi-ports", caminho: "/usr/bin/giochi-ports", executavel: true, papel: "o invólucro que acha o pacote e monta o sandbox" },
];

/** `true` se o conteúdo do `os-release` declara o nome do produto. */
export function temOsName(texto) {
  return new RegExp(`^OS_NAME=["']?${OS_NAME_ESPERADO}["']?\\s*$`, "m").test(String(texto || ""));
}

/**
 * Lê o runtime do PortMaster de dentro de um rootfs ext4.
 *
 * Devolve fatos + o que falta quando o runtime está ligado:
 *
 * - `runtime: false` — python3 ausente: o build não ligou
 *   `GIOCHI_WITH_PORTMASTER`. Não é erro; `missing` diz o que não foi levado.
 * - `runtime: true` e `complete: false` — ligado e quebrado: é o caso que vira
 *   aviso, porque o pacote vai instalar e não vai rodar.
 */
export function inspectPortmaster(rootfsPath) {
  const present = [];
  const missing = [];
  const notExecutable = [];

  for (const peca of PECAS_DO_RUNTIME) {
    const stat = statRootfsPath(rootfsPath, peca.caminho);
    if (!stat.inspected) {
      return {
        ok: false,
        inspected: false,
        reason: stat.reason,
        runtime: null,
        complete: null,
        present: [],
        missing: [],
        notExecutable: [],
        roms: null,
        user: null,
        osName: null,
      };
    }
    if (!stat.exists) {
      missing.push(peca.id);
      continue;
    }
    if (peca.executavel && !stat.executable) notExecutable.push(peca.id);
    present.push(peca.id);
  }

  // `python3` é o sinal do opt-in: é o pacote que pesa e o que o `pugwash`
  // chama. Sem ele o PortMaster não abre, com ou sem sandbox.
  const runtime = present.includes("python3");

  const roms = statRootfsPath(rootfsPath, ROMS_LINK);
  const user = statRootfsPath(rootfsPath, USER_DIR);
  const romsLink = roms.inspected && roms.exists ? roms.linkTarget : null;
  const userDir = user.inspected && user.exists ? user.type : null;

  const osRelease = readFromImage(rootfsPath, "/usr/lib/os-release");
  const osName = temOsName(osRelease) ? OS_NAME_ESPERADO : null;

  // O que falta além dos binários: só entra na conta quando o runtime está
  // ligado — numa imagem sem python3 o `/roms` também não existe, e listar os
  // dois como "falta" faria parecer defeito o que é escolha de build.
  const faltaCaminho = [];
  if (runtime) {
    if (romsLink !== USER_DIR) faltaCaminho.push("roms");
    if (userDir !== "directory") faltaCaminho.push("user");
    if (!osName) faltaCaminho.push("os_name");
  }

  return {
    ok: true,
    inspected: true,
    runtime,
    complete: runtime && missing.length === 0 && notExecutable.length === 0 && faltaCaminho.length === 0,
    present,
    missing,
    notExecutable,
    roms: romsLink,
    user: userDir,
    osName,
    missingPaths: faltaCaminho,
  };
}
