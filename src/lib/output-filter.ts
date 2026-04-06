const BANNED_WORDS = ["maconha","marijuana","weed","erva","baseado","beck","fumar","chapado","brisa","larica","stoner","420","comprar","compre","vender","venda","preco","preço","delivery","entrega","pix","curar","cura ","prescrevo","receito","mg/kg","mg por kg","miligrama"];
export function validateOutput(text: string): { safe: boolean; flagged: string[] } {
  const lower = text.toLowerCase();
  const flagged = BANNED_WORDS.filter((word) => lower.includes(word));
  return { safe: flagged.length === 0, flagged };
}
