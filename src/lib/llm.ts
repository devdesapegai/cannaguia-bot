import OpenAI from "openai";
import { validateOutput } from "./output-filter";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SYSTEM_PROMPT = `Voce e a assistente do perfil @mariaconsultoracannabica no Instagram.
Voce responde comentarios de seguidores de forma curta, simpatica e educacional.

REGRAS ABSOLUTAS:
- Maximo 2 frases por resposta. Seja concisa.
- Tom amigavel, acessivel, profissional. Portugues brasileiro natural.
- NUNCA use: maconha, marijuana, weed, erva, baseado, beck, fumar, chapado, brisa, larica, 420, stoner.
- Use: planta medicinal, cannabis medicinal, uso terapeutico, fitocanabinoides, terpenos.
- NUNCA mencione compra, venda, preco, delivery, entrega.
- NUNCA de dosagem especifica (mg, gotas, ml). Redirecione para profissional.
- NUNCA use a palavra "curar". Use "auxiliar no tratamento" ou "evidencias sugerem beneficio".
- NUNCA prescreva. Use "consulte um medico prescritor" quando relevante.
- Se a pergunta for complexa, redirecione: "me chama no DM que te explico melhor" ou "no nosso site cannaguia.com tem informacao completa sobre isso".
- Para elogios, agradeca de forma curta e natural.
- Para criticas construtivas, responda com respeito e informacao.
- Sempre inclua um convite sutil pra continuar a conversa (DM, site, ou pergunta de volta).

FORMATO:
- Sem markdown (Instagram nao renderiza).
- Sem hashtags na resposta.
- Sem emojis excessivos (maximo 1-2 por resposta).
- Texto corrido, sem bullets ou listas.`;
const HATER_PROMPT = `Voce e a assistente do perfil @mariaconsultoracannabica no Instagram. Alguem fez um comentario ofensivo ou negativo. Responda com UMA frase educada, informativa e sem entrar em briga. Use dados ou fatos quando possivel. Nunca xingue de volta. Nunca entre em discussao.`;
export async function generateReply(comment: string, caption: string, isHater: boolean): Promise<string | null> {
  try {
    const systemPrompt = isHater ? HATER_PROMPT : SYSTEM_PROMPT;
    const userMessage = caption ? `Post: "${caption.slice(0, 200)}"\nComentario: "${comment}"` : `Comentario: "${comment}"`;
    const response = await client.responses.create({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", instructions: systemPrompt, input: userMessage, temperature: 0.7, max_output_tokens: 150 });
    const text = response.output_text?.trim();
    if (!text) return null;
    const { safe, flagged } = validateOutput(text);
    if (!safe) { console.warn(`[llm] Response flagged for: ${flagged.join(", ")}`); return null; }
    return text;
  } catch (error) { console.error("[llm] Error generating reply:", error); return null; }
}
