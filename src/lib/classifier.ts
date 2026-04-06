export type CommentCategory = "zueira" | "elogio" | "duvida" | "desabafo" | "hater" | "cultivo" | "geral";

const PATTERNS: Array<{ category: CommentCategory; keywords: RegExp }> = [
  { category: "cultivo", keywords: /\b(cultiv|vega|flora|trico|pH|nutriente|semente|germina|poda|LST|SCROG|indoor|outdoor|led|grow|substrato|rega|fert)\w*/i },
  { category: "duvida", keywords: /\b(como|qual|quanto|pode|ajuda|serve|funciona|indica|sativa|terpeno|CBD|THC|mirceno|linalol|sono|ansiedade|dor|insonia|dosag|medicament|tratament|efeito)\w*/i },
  { category: "desabafo", keywords: /\b(dificil|sofrendo|triste|angustia|sozinha|sozinho|cansad[ao]|desanim|chorand|depressao|ansios)\w*/i },
  { category: "zueira", keywords: /\b(kkk+|hahaha|rs+|eitaaa|bora|cedo|resenha)\w*/i },
  { category: "elogio", keywords: /\b(amei|adorei|linda|lindo|maravilhos|incr[ií]vel|perfeito|perfeita|top|arrasa|parabens|parabéns|sensacional|mito|rainha|deusa|obrigad|demais)\w*/i },
];

export function classifyComment(text: string): CommentCategory {
  const lower = text.toLowerCase();
  for (const { category, keywords } of PATTERNS) {
    if (keywords.test(lower)) return category;
  }
  return "geral";
}
