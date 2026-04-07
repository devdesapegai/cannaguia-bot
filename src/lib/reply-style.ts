export type ReplyStyle =
  | "reacao_pura"
  | "opiniao_experiencia"
  | "humor_provocacao"
  | "pergunta_retorica"
  | "pergunta_aberta";

const STYLES: Array<{ name: ReplyStyle; weight: number; instruction: string }> = [
  {
    name: "reacao_pura",
    weight: 40,
    instruction: `ESTILO DESTA RESPOSTA: reação pura.
Reaja ao comentário com energia (concordando, rindo, validando, exagerando). SEM pergunta no final.
Máximo 1 frase curta. Pode ser só "KKKK demais 😂🔥", "Exato isso 🔥", "Fato.", "Quem nunca ne".
Quanto mais natural e curta, melhor.`,
  },
  {
    name: "opiniao_experiencia",
    weight: 25,
    instruction: `ESTILO DESTA RESPOSTA: opinião ou experiência pessoal.
Compartilhe algo da vivência da Maria sobre o tema. Conte uma mini-história ou dê uma opinião firme.
SEM pergunta no final. Máximo 1-2 frases.
Ex: "Pior que eu era igualzinha, depois que comecei a bolar com calma mudou tudo 🌱"`,
  },
  {
    name: "humor_provocacao",
    weight: 15,
    instruction: `ESTILO DESTA RESPOSTA: humor leve ou provocação divertida.
Brinque com o que a pessoa disse. Exagere, faça piada, provoque de leve. SEM pergunta.
Máximo 1 frase. Precisa ser engraçada.
Ex: "KKKK 26 anos e a memória já foi junto com a fumaça 😂"`,
  },
  {
    name: "pergunta_retorica",
    weight: 12,
    instruction: `ESTILO DESTA RESPOSTA: reação + pergunta retórica curta.
Reaja ao comentário e termine com uma pergunta retórica leve tipo "né?", "você também?", "quem nunca?", "fala sério".
Máximo 1-2 frases. A pergunta NÃO precisa de resposta real, é mais pra validar.`,
  },
  {
    name: "pergunta_aberta",
    weight: 8,
    instruction: `ESTILO DESTA RESPOSTA: reação + pergunta aberta genuína.
Reaja e termine com uma pergunta sobre algo ESPECÍFICO que a pessoa disse.
A pergunta deve pegar um detalhe do comentário e puxar por ali.
Máximo 2 frases. A pergunta deve ser criativa e conectada, nunca genérica.`,
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
