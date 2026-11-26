// O controle virtual `Giochi Gamepad` é um contrato de ENTRADA — e contrato que
// não está na imagem não existe.
//
// ## O defeito que isto pega
//
// Medido em 17/11/2026: o mesmo jogo respondia com os botões trocados no R35S e
// certo na X55. A causa não estava nos jogos: o SDL2 exige `BTN_SOUTH` **e**
// `ABS_X`/`ABS_Y` no **mesmo** nó, e o DTS da X55 separa botões e eixos em dois.
// O sistema passou a publicar um nó único (`giochi-gamepad`, subido por
// `S52gamepad`) e a traduzir o hardware de cada placa para ele.
//
// Se a imagem sair sem uma dessas peças:
//
//   - o aparelho continua bootando;
//   - os jogos continuam abrindo;
//   - e cada um responde no layout daquele aparelho, **sem erro em lugar nenhum**.
//
// É a mesma classe de falha que o `apps.imageVerified` fecha do lado dos apps:
// verde e errado. Aqui a resposta vem do arquivo que vai ser publicado, não do
// que o build prometia.
//
// ## O que dá para verificar daqui, e o que não dá
//
// | Item | Verificável na junção? |
// | --- | --- |
// | `/usr/bin/giochi-gamepad` e bit de execução | **sim** (`debugfs stat`) |
// | `/etc/init.d/S52gamepad` e bit de execução | **sim** |
// | `/etc/giochi/gamecontrollerdb.txt` | **sim** |
// | `/etc/giochi/buttons.map` e a calibração dos eixos | **sim** (lê o arquivo) |
// | `CONFIG_INPUT_UINPUT` no kernel | **não** — a config do kernel não vem em `out/` |
// | `/dev/uinput` existir | **não** — é criado no boot, por devtmpfs |
//
// Os dois últimos são runtime: quem fecha a conta no aparelho é
// `/etc/init.d/S52gamepad status` e o `giochi-selftest`. O que a junção garante
// é que a imagem **sai** com as peças, e que o manifesto não diz que saiu
// quando não saiu.
import { readFromImage } from "./inject.mjs";
import { statRootfsPath } from "./rootfs.mjs";

/**
 * As peças que o contrato exige em toda imagem de aparelho com gamepad.
 *
 * `executavel` marca o que o init precisa rodar: arquivo presente sem bit de
 * execução não sobe, e o sintoma é o mesmo do arquivo ausente.
 */
export const PECAS_DO_GAMEPAD = [
  {
    id: "daemon",
    caminho: "/usr/bin/giochi-gamepad",
    executavel: true,
    papel: "traduz o hardware da placa para o layout do contrato",
  },
  {
    id: "servico",
    caminho: "/etc/init.d/S52gamepad",
    executavel: true,
    papel: "sobe o daemon com supervisão",
  },
  {
    id: "mapeamento",
    caminho: "/etc/giochi/gamecontrollerdb.txt",
    executavel: false,
    papel: "faz o Button::A do SDL ser o `a` do mapa",
  },
  {
    id: "mapa",
    caminho: "/etc/giochi/buttons.map",
    executavel: false,
    papel: "fonte da verdade dos códigos e da calibração dos eixos",
  },
];

/** Eixos do contrato: 4, na faixa -32767..32767, no mesmo nó. */
export const EIXOS_DO_CONTRATO = ["x", "y", "rx", "ry"];

/**
 * Calibração declarada no `buttons.map`.
 *
 * O daemon só considera um eixo calibrado quando o mapa traz **os dois** lados
 * (`axis_x_min` e `axis_x_max`); um eixo sem isso tem o valor cru limitado à
 * faixa canônica — numa faixa de 15..1023 isso é curso de 1,5% do analógico, e o
 * sintoma (o carro não vira) parece física, não configuração.
 *
 * Formato no mapa: `<nome> = <valor>`, `#` inicia comentário.
 */
export function lerCalibracaoDoMapa(texto) {
  const min = new Set();
  const max = new Set();
  for (const bruta of String(texto || "").split(/\r?\n/)) {
    const linha = bruta.split("#")[0].trim();
    const match = /^axis_(x|y|rx|ry)_(min|max)\s*=\s*(-?\d+)$/i.exec(linha);
    if (!match) continue;
    (match[2].toLowerCase() === "min" ? min : max).add(match[1].toLowerCase());
  }

  const declarados = EIXOS_DO_CONTRATO.filter((eixo) => min.has(eixo) || max.has(eixo));
  const calibrados = EIXOS_DO_CONTRATO.filter((eixo) => min.has(eixo) && max.has(eixo));
  return {
    axes: declarados.length,
    calibrated: calibrados,
    uncalibrated: EIXOS_DO_CONTRATO.filter((eixo) => !calibrados.includes(eixo)),
  };
}

/**
 * Lê as peças do controle virtual de dentro de um rootfs ext4.
 *
 * Devolve fatos, não decisão: `expected` (o aparelho deveria ter controle) é
 * política de quem chama — alvo virtual não tem gamepad físico. `inspected:
 * false` é "não consegui olhar", diferente de "não tem".
 */
export function inspectGamepad(rootfsPath) {
  const present = [];
  const missing = [];
  const notExecutable = [];

  for (const peca of PECAS_DO_GAMEPAD) {
    const stat = statRootfsPath(rootfsPath, peca.caminho);
    if (!stat.inspected) {
      return {
        ok: false,
        inspected: false,
        reason: stat.reason,
        complete: null,
        present: [],
        missing: [],
        notExecutable: [],
        map: null,
      };
    }
    if (!stat.exists) {
      missing.push(peca.id);
      continue;
    }
    if (peca.executavel && !stat.executable) notExecutable.push(peca.id);
    present.push(peca.id);
  }

  // O mapa só é lido quando está lá: um aparelho sem gamepad (o alvo virtual)
  // não tem mapa, e a ausência já está em `missing`.
  let map = null;
  if (present.includes("mapa")) {
    const texto = readFromImage(rootfsPath, "/etc/giochi/buttons.map");
    map = texto === null ? null : lerCalibracaoDoMapa(texto);
  }

  return {
    ok: true,
    inspected: true,
    complete: missing.length === 0 && notExecutable.length === 0,
    present,
    missing,
    notExecutable,
    map,
  };
}
