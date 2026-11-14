// Comando de inicialização do QEMU.
//
// Fica num módulo só porque o mesmo texto aparece no `README.txt` da release e
// no card do site. Duas cópias divergem: a primeira vez que o `-append` mudasse
// num lugar, o site passaria a publicar um comando que não boota.
import { stripCompression } from "./names.mjs";

/** Preenchimentos por arquitetura, usados quando o device.json não os declara. */
const DEFAULTS = {
  arm64: { machine: "virt", cpu: "cortex-a53", console: "ttyAMA0" },
  x86_64: { machine: "pc", cpu: "max", console: "ttyS0" },
};

/**
 * Parâmetros de boot de um alvo virtual.
 *
 * `device` é o `device.json` do Giochi System; campos que ele trouxer vencem os
 * padrões da arquitetura. O console vem de `kernelCmdline.console`, que é a
 * fonte que o build do kernel realmente usou.
 */
export function qemuBootConfig({ device, arch, imageName, kernelName }) {
  const fallback = DEFAULTS[arch] || DEFAULTS.arm64;
  const consoleName = String(device?.kernelCmdline?.console || fallback.console);

  return {
    binary: qemuBinaryFor(arch),
    machine: String(device?.qemu?.machine || fallback.machine),
    cpu: String(device?.qemu?.cpu || fallback.cpu),
    smp: Number(device?.qemu?.smp) || 2,
    memoryMiB: Number(device?.qemu?.memoryMiB) || 512,
    disk: stripCompression(String(imageName || "disco.img")),
    kernel: kernelName ? stripCompression(String(kernelName)) : null,
    cmdline: `root=/dev/vda rw console=${consoleName}`,
  };
}

/** Nome do binário do QEMU para a arquitetura. */
export function qemuBinaryFor(arch) {
  if (arch === "x86_64" || arch === "x86-64") return "qemu-system-x86_64";
  if (arch === "arm" || arch === "armv7" || arch === "armv7l") return "qemu-system-arm";
  return "qemu-system-aarch64";
}

/**
 * O comando, em linhas prontas para colar. Nomes dos arquivos já
 * descomprimidos: quem for rodar descomprime antes (ver `decompressCommand`).
 */
export function renderQemuCommand(boot) {
  const lines = [`${boot.binary || qemuBinaryFor("arm64")} \\`];
  lines.push(`  -M ${boot.machine} \\`);
  lines.push(`  -cpu ${boot.cpu} \\`);
  lines.push(`  -smp ${boot.smp} \\`);
  lines.push(`  -m ${boot.memoryMiB} \\`);
  if (boot.kernel) {
    lines.push(`  -kernel ${boot.kernel} \\`);
  }
  lines.push(`  -drive file=${boot.disk},if=virtio,format=raw \\`);
  lines.push(`  -append "${boot.cmdline}" \\`);
  lines.push("  -netdev user,id=net0 \\");
  lines.push("  -device virtio-net-device,netdev=net0 \\");
  lines.push("  -nographic");
  return lines.join("\n");
}

/** A linha que descomprime, ou null quando não há o que descomprimir. */
export function decompressCommand(fileName) {
  const name = String(fileName || "");
  if (name.endsWith(".xz")) return `xz -dk ${name}`;
  if (name.endsWith(".gz")) return `gzip -dk ${name}`;
  if (name.endsWith(".zst")) return `zstd -d ${name}`;
  return null;
}
