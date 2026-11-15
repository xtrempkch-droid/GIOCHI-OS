// Observações por aparelho mostradas na página de download.
//
// ## O que entra aqui, e o que não entra
//
// Entra o que muda a decisão de quem vai baixar: "esta imagem foi testada com
// este painel", "também roda neste outro aparelho", "o hardware desta unidade
// ainda não foi ligado". Não entra detalhe de build — `device.json` do
// Giochi System já tem `bootNotes`, e é texto técnico demais para uma página de
// download: quem chega aqui quer saber se serve no aparelho dele.
//
// ## Por que aqui e não em `device.json`
//
// A nota é sobre o que foi PUBLICADO e testado, não sobre o hardware em
// abstract. O `device.json` descreve o aparelho — e descreveria "panel4" mesmo
// que o build passasse a usar outro painel de referência, sem que ninguém
// reescrevesse a frase.
//
// O custo é que esta lista envelhece junto com o build: quando o painel de
// referência mudar no Giochi System, o `painel` aqui tem de mudar também. Está
// documentado em AGENTS.md §7.11; é uma linha, e o teste de catálogo recusa
// aparelho desconhecido.
//
// ## Texto e dado separados
//
// A frase é traduzida (`i18n.mjs`); o valor (`panel4`, `R36S`) é dado daqui. Se
// a frase fosse escrita inteira aqui, ela existiria só em português e a página
// em árabe teria um parágrafo em português no meio.

/**
 * Tipos de observação. Cada um tem uma frase em cada idioma, com marcadores.
 *
 * - `painel`: qual painel esta imagem usa como referência, e o que fazer com os
 *   outros. Marcadores: `{modelo}`, `{outros}`.
 * - `compat`: em que outros aparelhos a imagem roda. Marcador: `{lista}`.
 */
export const TIPOS_DE_OBSERVACAO = ["painel", "compat"];

/**
 * Observações por aparelho.
 *
 * `painel` e `compat` convivem; a ordem em que aparecem na página é a ordem
 * desta lista de tipos, não a ordem das chaves aqui.
 */
export const OBSERVACOES_POR_APARELHO = {
  r35s: {
    // O mesmo aparelho sai de fábrica com cinco painéis medidos e nenhum EDID
    // para descobrir qual é (DSI não tem). A imagem referencia o panel4.
    painel: { modelo: "panel4", outros: ["panel1", "panel2", "panel3"] },
    // Mesma placa RK3326 do R36S; a nota fala em "algumas unidades" porque a
    // variante com outro painel cai na observação acima.
    compat: { lista: ["R36S", "R33S"] },
  },
};

/**
 * Observações de um aparelho, na ordem dos tipos. Vazio quando não há nada a
 * avisar — a maioria dos aparelhos não precisa de nota nenhuma.
 */
export function observacoesDe(deviceId) {
  const notas = OBSERVACOES_POR_APARELHO[String(deviceId || "")];
  if (!notas) return [];
  return TIPOS_DE_OBSERVACAO.filter((tipo) => notas[tipo]).map((tipo) => ({
    tipo,
    vars: notas[tipo],
  }));
}

/** Aparelhos que têm observação declarada. Usado por teste e por relatório. */
export function aparelhosComObservacao() {
  return Object.keys(OBSERVACOES_POR_APARELHO).sort();
}
