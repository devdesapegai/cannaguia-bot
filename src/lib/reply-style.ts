export type ReplyStyle =
  | "reacao_pura"
  | "reacao_com_pergunta"
  | "humor_rotulo"
  | "pergunta_curta";

const STYLES: Array<{ name: ReplyStyle; weight: number; instruction: string }> = [
  {
    name: "reacao_pura",
    weight: 30,
    instruction: `ESTILO: reação pura SEM pergunta.
Dê um rótulo engraçado pro que a pessoa disse. 1 frase curta + 😂🔥
Ex: "modo sobrevivência ativado 😂🔥", "nível profissional já 😂🔥"`,
  },
  {
    name: "reacao_com_pergunta",
    weight: 35,
    instruction: `ESTILO: reação curta + pergunta CURTA no final.
1 frase de reação + pergunta de NO MÁXIMO 5 palavras.
Ex: "aí é nível profissional já 😂🔥 e você?", "não tem volta depois 😂🔥 quem nunca?", "esse aí não perde tempo 😂🔥 né?"`,
  },
  {
    name: "humor_rotulo",
    weight: 20,
    instruction: `ESTILO: rótulo/título engraçado SEM pergunta.
Dê um nome criativo pro que a pessoa fez/disse. Curto e direto.
Ex: "habilidade desbloqueada 😂🔥", "desculpa esfarrapada clássica 😂🔥", "café diferenciado 😂🔥"`,
  },
  {
    name: "pergunta_curta",
    weight: 15,
    instruction: `ESTILO: reação + pergunta curta conectada.
Reaja e termine com pergunta de NO MÁXIMO 5-6 palavras sobre algo que a pessoa disse.
Ex: "calmaaa😂 equilíbrio é tudo viu🔥 e aí, tá conseguindo segurar?", "exposta com sucesso 😂🔥 qual combo perfeito pra vc?"`,
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
