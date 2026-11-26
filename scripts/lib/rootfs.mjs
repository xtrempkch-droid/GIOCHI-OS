// Leitura do rootfs ext4 sem montar.
//
// O manifesto diz "estes apps estão na imagem". Dizer isso a partir do catálogo
// é chute: o overlay da fase `apps` pode ter ficado de fora do build, e a
// release passaria a anunciar app que não existe no aparelho. O `debugfs` lê o
// `index.json` de dentro do ext4 sem precisar de root, então a resposta vem do
// arquivo que vai ser publicado.
import { spawnSync } from "node:child_process";

export const APP_INDEX_PATH = "/opt/giochi/apps/index.json";

export function debugfsAvailable() {
  const result = spawnSync("debugfs", ["-V"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

/**
 * Lê `/opt/giochi/apps/index.json` de um rootfs ext4.
 *
 * Devolve `{ ok: true, inspected: true, apps }` quando o índice existe e é JSON
 * válido. `inspected` diz se o `debugfs` chegou a olhar o arquivo: quando ele
 * olhou e o índice não está lá, a ausência é uma resposta (build sem overlay),
 * não um "não consegui verificar".
 */
/**
 * `stat` de um caminho dentro do ext4: existe? é executável?
 *
 * Serve à verificação do controle virtual (`gamepad.mjs`), que precisa saber
 * não só se o arquivo está lá, mas se o bit de execução veio junto: um
 * `S52gamepad` não executável não sobe, e o aparelho volta ao layout dele sem
 * erro nenhum.
 *
 * `inspected: false` significa "não consegui olhar" (sem `debugfs`, ext4
 * ilegível) — que é diferente de `exists: false`.
 */
export function statRootfsPath(rootfsPath, target) {
  if (!debugfsAvailable()) {
    return { ok: false, inspected: false, reason: "debugfs não disponível" };
  }

  const result = spawnSync("debugfs", ["-R", `stat ${target}`, rootfsPath], {
    encoding: "utf8",
  });
  if (result.error) return { ok: false, inspected: false, reason: result.error.message };

  // Caminho inexistente: status 0 e "File not found" no stderr.
  const stderr = String(result.stderr || "");
  if (/file not found|not found by/i.test(stderr)) {
    return { ok: true, inspected: true, exists: false, executable: false, mode: null };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      inspected: false,
      reason: (stderr || `exit ${result.status}`).trim().split("\n")[0],
    };
  }

  // `Mode:   0644` / `Mode:  0100755` conforme a versão do e2fsprogs. Os três
  // últimos dígitos são as permissões; o primeiro deles é o do dono.
  const match = /Mode:\s+0?([0-7]+)/.exec(String(result.stdout || ""));
  const mode = match ? match[1].slice(-3) : null;
  return {
    ok: true,
    inspected: true,
    exists: true,
    executable: mode ? /[1357]/.test(mode[0]) : false,
    mode,
  };
}

export function readRootfsApps(rootfsPath) {
  if (!debugfsAvailable()) {
    return { ok: false, inspected: false, reason: "debugfs não disponível" };
  }

  const result = spawnSync("debugfs", ["-R", `cat ${APP_INDEX_PATH}`, rootfsPath], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });

  if (result.error) return { ok: false, inspected: false, reason: result.error.message };
  if (result.status !== 0) {
    return {
      ok: false,
      inspected: true,
      reason: (result.stderr || `exit ${result.status}`).trim().split("\n")[0],
    };
  }

  // `debugfs -R cat` num arquivo inexistente sai com status 0 e stdout vazio,
  // escrevendo "File not found" no stderr. Confiar só no status transformaria
  // "o overlay não entrou no build" em "index.json vazio" — mesma conclusão,
  // mensagem que manda procurar no lugar errado.
  const stderr = String(result.stderr || "").trim();
  if (/file not found|not found by/i.test(stderr)) {
    return { ok: false, inspected: true, reason: `${APP_INDEX_PATH} não existe no rootfs` };
  }

  const text = String(result.stdout || "").trim();
  if (!text) return { ok: false, inspected: true, reason: "index.json vazio" };

  try {
    const index = JSON.parse(text);
    const apps = Array.isArray(index.apps) ? index.apps : [];
    return { ok: true, inspected: true, apps };
  } catch (error) {
    return { ok: false, inspected: true, reason: `index.json inválido: ${error.message}` };
  }
}
