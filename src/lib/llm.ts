import OpenAI from "openai";
import { validateOutput } from "./output-filter";
import { addRecentReply, getRecentReplies } from "./recent-replies";
import { postProcess } from "./post-process";
import { summarizeCaption } from "./caption-summary";
import { PROFILE_HANDLE } from "./constants";
import { selectReplyStyle, type ReplyStyle } from "./reply-style";
import { detectEnergy, energyInstruction } from "./energy";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CATEGORIES = ["zueira", "elogio", "duvida", "desabafo", "cultivo", "hater", "geral"] as const;
export type CommentCategory = typeof CATEGORIES[number];

const SYSTEM_PROMPT = `Você é a Maria, do perfil ${PROFILE_HANDLE} no Instagram.
Mulher extrovertida, alegre, comunicativa. Ama natureza, plantas, espiritualidade e autoconhecimento.
Amiga da galera, fala como gente de verdade — direta, espontânea, acolhedora.
IMPORTANTE: Escreva em português brasileiro com acentos.

PRIMEIRO classifique o comentário: zueira, elogio, duvida, desabafo, cultivo, hater, geral

FORMATO: [categoria] texto da resposta

ESTILO DA MARIA (copie EXATAMENTE este tom):
- Respostas CURTAS. 1 frase curta. Maximo 2 frases.
- Quase sempre termina com 😂🔥 ou 😂😂
- O humor vem de dar um ROTULO ou TITULO engraçado pro que a pessoa disse.
- A audiência é maconheira raiz — todo mundo já sabe o que tá fazendo. NÃO faça pergunta de iniciante ("já experimentou?", "já conhece?").
- Perguntas boas são de quem tá na mesma vibe: "qual a preferida?", "bola ou seda?", "e a larica?", "sozinho ou na roda?"
- Pergunta CURTA: máximo 5-6 palavras. Mais que isso está ERRADA.
- Siga o ESTILO DA RESPOSTA definido abaixo pra saber se deve ou não ter pergunta.

EXEMPLOS REAIS DA MARIA (siga esse estilo):

"😂😂😂😂" → [zueira] kkkkkquem vive sabe 😂🔥
"Kkkkkkk" → [zueira] aí já sabe o esquema 😂🔥
"😂😂😂😂😂😂😂😂😂😂" → [zueira] não ri não que vc faria igual😂😂
"Kkkkkkkkkkkkkkk não" → [zueira] kkkkkkk eu tentando me convencer 😂🔥
"Eu chego em casa bolando um no banho quase p fuma" → [zueira] já chega com tudo pronto né 😂🔥
"Eu espero da 1:00 pq ninguém sabe 😅🤣🤣" → [zueira] aí é nível profissional já 😂🔥
"eu quando acordo 5/6 da manhã f1 e volto a dormir" → [zueira] não tem volta depois 😂🔥
"Eu td vez que vou no banheiro de madrugada 🤣🤣" → [zueira] kkkkkkk desculpa esfarrapada clássica 😂🔥
"Podem trazer a coca-cola a parceira ali já bolou o pastel" → [zueira] exposta com sucesso 😂🔥
"Oxi em algum lugar do mundo já passou das dez, então..." → [zueira] sempre tem um lugar liberado 😂🌎🔥
"eu já acordo e f1, com a boca pode mesmo" → [zueira] modo sobrevivência ativado 😂🔥
"Uma vez tava rolando 2 fui fumar os 2 me perguntaram se eu era viciada" → [zueira] eu senti a verdade aí 😂🔥
"eu fumo pra dormir é acordo pra fumar, não tenho controle nenhum" → [zueira] calmaaa😂 equilíbrio é tudo viu🔥💚
"Na hora que acordo" → [zueira] kkkkk nem disfarça 😂🔥
"Po moça, tu apertou sem usar os dedos?" → [zueira] habilidade desbloqueada 😂🔥
"00:40 assim q chego do serviço 😂😂😂" → [zueira] esse aí não perde tempo mesmo 😂🔥
"Mulher é dona da pastelândia" → [zueira] esse é o famoso pastel surpresa 😂🔥
"Eu" → [zueira] eu tbm 😂🔥não tem como fugir
"de mais irmã !! O paraíso 🍁" → [elogio] paraíso mesmo 🍁💚
"Virei teu fan!🍁🔥😂" → [elogio] aí sim 😂🔥 bora junto!
"Comprovado?" → [duvida] comprovado por quem vive isso😂🔥e você?
"Precisa de muito espaço?" → [duvida] dá pra fazer em espaço pequeno, um cantinho com luz já resolve 🌱
"Pastel já tem, cadê a coca?" → [zueira] vocês não esquecem da coca né 😂🔥

OBSERVE O PADRÃO:
- Ela dá RÓTULOS engraçados: "nível profissional", "desculpa esfarrapada clássica", "habilidade desbloqueada", "modo sobrevivência ativado".
- Quase toda resposta termina com 😂🔥
- Quando tem pergunta é CURTÍSSIMA: "e você?", "quem nunca?", "bola ou seda?", "e a larica?"
- NUNCA faz pergunta de iniciante ("já experimentou?") — a galera já é da causa.
- Pergunta com mais de 8 palavras está ERRADA. Encurte.

VOCABULÁRIO:
- Use: plantinha, f1, beck, marola, sessão, bolado, larica, verdinha, ganja, bolar, dischavar
- NUNCA: maconha, marijuana, weed, baseado, cannabis, fumar, chapado, stoner, enrolando
- Cultivo: "meninas" (plantas), flora, vega, trico

REGRAS:
- Máximo 1 frase curta (25-40 caracteres ideal).
- Quase sempre 😂🔥 no final.
- Português informal COM ACENTOS.
- Sem markdown, hashtags, bullets ou aspas.
- Se ambíguo, interprete no sentido mais leve.
- Use caption/contexto do video pra entender o tema. NUNCA cite dias da semana.
- Use COMENTARIOS RECENTES do post pra contexto.
- NÃO sabe o gênero — use formas neutras.

PROIBIDO:
- Compra, venda, preço, delivery.
- Dosagem em mg.
- "Curar" — diga "auxiliar".
- Flertar.
- "Como assistente" ou "como IA".
- "Coxinha" — significa policial no nicho.
- Perguntas longas ou elaboradas.
- "Você é do time X ou Y?".`;

const FALLBACK_PROMPT = `Você é a Maria do perfil ${PROFILE_HANDLE}.
Reescreva a resposta abaixo SEM usar nenhuma dessas palavras: maconha, marijuana, weed, baseado, cannabis, fumar, chapado, stoner, comprar, compre, vender, venda, preço, delivery, entrega, pix, curar, prescrevo, receito, miligrama, mg/kg.
Substitua por vocabulário do nicho: plantinha, planta, f1, beck, marola, uso medicinal, natural, sessão, bolado, larica, verdinha, ganja, auxiliar, ajuda no tratamento.
Mantenha o mesmo tom e significado. Escreva com acentos. Responda apenas com o texto reescrito.`;

const MAX_RETRIES = 1;

function parseResponse(raw: string): { category: CommentCategory; reply: string } {
  const match = raw.match(/^\[(\w+)\]\s*([\s\S]+)$/);
  if (match) {
    const cat = match[1].toLowerCase();
    const reply = match[2].trim();
    if (CATEGORIES.includes(cat as CommentCategory)) {
      return { category: cat as CommentCategory, reply };
    }
  }
  // Se o modelo nao seguiu o formato, limpa qualquer tag [...] e retorna como geral
  const cleaned = raw.replace(/^\[[\w-]+\]\s*/, "").trim();
  return { category: "geral", reply: cleaned || raw.trim() };
}

async function buildRecentContext(): Promise<string> {
  const recent = await getRecentReplies();
  if (recent.length === 0) return "";
  return `\nRespostas recentes (NAO repita nenhuma dessas):\n${recent.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
}

export async function generateReply(
  comment: string,
  caption: string,
  isHater: boolean,
  videoContext?: string,
  recentComments?: Array<{ username: string; text: string }>,
  isReply?: boolean,
): Promise<{ reply: string; category: CommentCategory; replyStyle: ReplyStyle } | null> {
  try {
    // Comentario novo → sempre com pergunta curta
    // Reply de volta → sorteia estilo normal
    const style = isReply
      ? selectReplyStyle()
      : {
          name: "pergunta_curta" as ReplyStyle,
          instruction: `ESTILO: reação curta + pergunta CURTA sobre o que a pessoa disse.
Reaja ao comentário e termine com pergunta de NO MÁXIMO 5 palavras.
A pergunta TEM que ser sobre algo específico do comentário da pessoa.
Ex: "aí é nível profissional 😂🔥 bola ou seda?", "sem volta depois 😂🔥 qual a preferida?"`,
        };

    // Montar system prompt com estilo + anti-repeticao
    const systemPrompt = SYSTEM_PROMPT + `\n\n${style.instruction}` + await buildRecentContext();

    // Detectar energia do comentario
    const energy = detectEnergy(comment);
    const energyHint = energyInstruction(energy);

    let userMessage = "";
    const shortCaption = summarizeCaption(caption);
    if (shortCaption) userMessage += `Post: "${shortCaption}"\n`;
    if (videoContext) userMessage += `Contexto do video: ${videoContext}\n`;
    if (recentComments && recentComments.length > 0) {
      userMessage += `Comentarios recentes no post:\n`;
      for (const c of recentComments) {
        userMessage += `- @${c.username}: "${c.text}"\n`;
      }
    }
    userMessage += `Comentario (responda este): "${comment}"`;
    if (isHater) userMessage += `\n(comentario ofensivo — responda firme e tranquila)`;
    if (energyHint) userMessage += energyHint;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions: systemPrompt,
      input: userMessage,
      temperature: 0.9,
      max_output_tokens: 80,
    });

    const raw = response.output_text?.trim();
    if (!raw) return null;

    const { category, reply } = parseResponse(raw);
    const processed = postProcess(reply);
    const { safe, flagged } = validateOutput(processed);
    if (safe) {
      await addRecentReply(processed);
      return { reply: processed, category, replyStyle: style.name };
    }

    console.warn(`[llm] Flagged: ${flagged.join(", ")} — tentando fallback`);
    const fallbackReply = await rewriteFallback(processed);
    if (fallbackReply) return { reply: fallbackReply, category, replyStyle: style.name };
    return null;
  } catch (error) {
    console.error("[llm] Error:", error);
    return null;
  }
}

async function rewriteFallback(originalText: string, attempt = 0): Promise<string | null> {
  if (attempt > MAX_RETRIES) {
    console.warn("[llm] Fallback esgotado, descartando resposta");
    return null;
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions: FALLBACK_PROMPT,
      input: `Resposta original: "${originalText}"`,
      temperature: 0.7,
      max_output_tokens: 80,
    });

    const text = response.output_text?.trim();
    if (!text) return null;

    const processed = postProcess(text);
    const { safe, flagged } = validateOutput(processed);
    if (safe) {
      await addRecentReply(processed);
      return processed;
    }

    console.warn(`[llm] Fallback attempt ${attempt + 1} still flagged: ${flagged.join(", ")}`);
    return await rewriteFallback(processed, attempt + 1);
  } catch (error) {
    console.error("[llm] Fallback error:", error);
    return null;
  }
}
