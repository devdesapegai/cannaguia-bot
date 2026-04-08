export type ReplyStyle =
  | "reacao_pura"
  | "reacao_com_pergunta"
  | "humor_rotulo"
  | "pergunta_curta";

const STYLES: Array<{ name: ReplyStyle; weight: number; instruction: string }> = [
  {
    name: "reacao_pura",
    weight: 15,
    instruction: `ESTILO: reação pura SEM pergunta. Comente o que a pessoa disse de forma curta e natural.`,
  },
  {
    name: "reacao_com_pergunta",
    weight: 45,
    instruction: `ESTILO: reação curta + pergunta CURTA (max 6 palavras) sobre algo ESPECÍFICO que a pessoa disse.`,
  },
  {
    name: "humor_rotulo",
    weight: 15,
    instruction: `ESTILO: comente a situação da pessoa com humor. Sem pergunta. Curto e direto.`,
  },
  {
    name: "pergunta_curta",
    weight: 25,
    instruction: `ESTILO: reação + pergunta curta (max 6 palavras) conectada ao que a pessoa falou.`,
  },
];

const totalWeight = STYLES.reduce((sum, s) => sum + s.weight, 0);

export function selectReplyStyle(): { name: ReplyStyle; instruction: string } {
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (const style of STYLES) {
    cumulative += style.weight;
    if (roll < cumulative) {
      return { name: style.name, instruction: style.instruction };
    }
  }
  return { name: STYLES[0].name, instruction: STYLES[0].instruction };
}
