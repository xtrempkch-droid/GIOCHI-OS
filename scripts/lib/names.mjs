// Nomes dos artefatos publicados.
//
// Moram aqui, e não dentro do pipeline, porque o site também precisa saber qual
// é o nome "cru" por trás de um `.img.xz` para montar o comando do QEMU.

/** Remove a extensão de compressão: `x.img.xz` → `x.img`. */
export function stripCompression(fileName) {
  return String(fileName || "").replace(/\.(xz|gz|zst)$/i, "");
}

/** Primeiro nome do arquivo sem diretório. */
export function baseName(filePath) {
  const text = String(filePath || "");
  const index = Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\"));
  return index === -1 ? text : text.slice(index + 1);
}
