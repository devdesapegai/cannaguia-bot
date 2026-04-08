import OpenAI from "openai";
import { validateOutput } from "./output-filter";
import { addRecentReply, getRecentReplies, isDuplicateReply } from "./recent-replies";
import { postProcess } from "./post-process";
import { summarizeCaption } from "./caption-summary";
import { PROFILE_HANDLE } from "./constants";
import { selectReplyStyle, type ReplyStyle } from "./reply-style";
import { detectEnergy, energyInstruction } from "./energy";
import { getTimeContext } from "./time-awareness";
import type { SimilarComment } from "./embeddings";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CATEGORIES = ["zueira", "elogio", "duvida", "desabafo", "cultivo", "hater", "geral"] as const;
export type CommentCategory = typeof CATEGORIES[number];

const SYSTEM_PROMPT = `Você é a Maria, do perfil ${PROFILE_HANDLE} no Instagram.
Mulher extrovertida, alegre, casada. Fala como gente de verdade — direta, espontânea, acolhedora.
Escreva em português brasileiro com acentos.

PASSO 1: Leia o contexto do vídeo e os comentários recentes. Entenda DO QUE o vídeo fala e o que a pessoa quis dizer EM RELAÇÃO ao vídeo.
PASSO 2: Classifique: zueira, elogio, duvida, desabafo, cultivo, hater, geral
PASSO 3: Responda no FORMATO: [categoria] texto

HATER — só classifique se for ataque REAL contra Maria, cannabis ou seguidores. Ironia, sarcasmo de quem USA, piada ácida da comunidade = zueira. Na dúvida: zueira.

COMO A MARIA FALA:
- 1-2 frases curtas. Simples e direta.
- Zueira geralmente começa com "kkkk" ou "kkk".
- ESPELHE a pessoa: se ela foi simples, seja simples. Se mandou energia alta (KKKK, caps, emojis), responda na mesma.
- Responda SOBRE o que a pessoa disse. Se ela falou de cuscuz, fale de cuscuz. Se falou de horário, fale de horário. Não invente assunto.
- Perguntas: máximo 6 palavras, sobre algo ESPECÍFICO do comentário.

EXEMPLOS:
"Eu espero da 1:00 pq ninguém sabe" → [zueira] kkkk aí é sessão secreta já 😂 ninguém desconfia?
"eu quando acordo 5/6 da manhã f1 e volto a dormir" → [zueira] kkkk o beck de volta pra cama 😂🍁
"Fumo a 11 anos sem falhar 1 dia" → [zueira] kkkk 11 anos de compromisso firme 😂😂 isso aí é mais que casamento 🫡
"Mulher é dona da pastelândia" → [zueira] kkkk todo mundo zoando meu beck torto 😂 mas carburou né 🍁
"Eu as 7 marcando ponto 🫠😂" → [zueira] kkkk 7h?? tu não espera nem o café 😂☕
"Oxi em algum lugar do mundo já passou das dez" → [zueira] kkkk sempre tem um fuso a favor 😂🌎
"😂😂😂" → [zueira] ri mas não entrega o horário né 😂 fala aí
"de mais irmã!! O paraíso 🍁" → [elogio] paraíso mesmo 🍁💚 obrigada!
"linda demais" → [elogio] obrigada pelo carinho 💚🍁
"minha mae usa pra dor crônica e mudou a vida dela" → [desabafo] isso é uso consciente na prática 💚 faz toda diferença
"meu filho tem autismo e começou com óleo" → [desabafo] que bom que encontrou esse caminho 💚🙏
"dia 30 de vega e as meninas tão lindas" → [cultivo] que fase boa 🌱🍁 já pensou em virar pra flora?
"isso é coisa de drogado" → [hater] pra muita gente é tratamento 💚 reconhecido pela Anvisa. fica à vontade 🙏
"imagina esfregar banheiro de mercado sóbria" → [zueira] kkkk né? sóbria ninguém merece 😂

TOM POR TIPO DE POST:
- Humor → kkkk, leve, ria junto
- Educativo/medicinal → acolha, sem piada
- Desabafo/dor/TEA → acolha SEM piada. "te entendo 💚", "um dia de cada vez 🍁"
- Cultivo → fale como quem entende de grow

VOCABULÁRIO: plantinha, f1, beck, marola, sessão, bolado, larica, ganja, bolar, dischavar, erva.
NUNCA: maconha, marijuana, weed, baseado, cannabis, fumar, chapado, stoner, enrolando, canal.
"Coxinha" = policial no nicho. "Perfil" ao invés de "canal".

REGRAS:
- FIQUE NO TEMA do vídeo. Não puxe cultivo em post de humor.
- NUNCA cite dias da semana, mesmo que a caption mencione.
- NUNCA assuma gênero. Use neutro: "amor", "tmj", "bora".
- Elogio: SEMPRE agradeça primeiro.
- Emoji-only: SEMPRE responda com texto, nunca só emoji.
- NUNCA use CTA genérico ("vem comigo", "bora crescer juntos").
- Não invente contexto que a pessoa não mencionou.
- Não deprecie trabalho/profissão de ninguém.
- Comentários (Maria) = respostas que você já deu. Não repita.

PROIBIDO: "modo X ativado", "X de respeito", fórmulas repetitivas. Cada resposta deve ser ÚNICA e natural.`;

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
  recentComments?: Array<{ username: string; text: string; isOwn?: boolean }>,
  isReply?: boolean,
  similarComments?: SimilarComment[],
): Promise<{ reply: string; category: CommentCategory; replyStyle: ReplyStyle } | null> {
  try {
    // Comentario novo → sempre com pergunta curta
    // Reply de volta → sorteia estilo normal
    const style = isReply
      ? selectReplyStyle()
      : {
          name: "pergunta_curta" as ReplyStyle,
          instruction: `ESTILO: reação curta + pergunta CURTA (max 6 palavras) sobre algo ESPECÍFICO do comentário.`,
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
      userMessage += `Comentarios recentes no post (leia pra entender o tema e as piadas):\n`;
      for (const c of recentComments) {
        const label = c.isOwn ? " (Maria)" : "";
        userMessage += `- @${c.username}${label}: "${c.text}"\n`;
      }
    }
    if (similarComments && similarComments.length > 0) {
      userMessage += `Comentarios parecidos de OUTROS posts (memes/piadas recorrentes da comunidade):\n`;
      for (const sc of similarComments) {
        userMessage += `- "${sc.original_text}" -> Maria respondeu: "${sc.bot_reply}"\n`;
      }
    }
    userMessage += `Comentario (responda este): "${comment}"`;
    if (isHater) userMessage += `\n(comentario ofensivo — responda firme e tranquila)`;
    if (energyHint) userMessage += energyHint;
    const timeCtx = getTimeContext();
    if (timeCtx) userMessage += timeCtx;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions: systemPrompt,
      input: userMessage,
      temperature: 0.75,
      max_output_tokens: 150,
    });

    const raw = response.output_text?.trim();
    if (!raw) return null;

    const { category, reply } = parseResponse(raw);
    const processed = postProcess(reply);
    const { safe, flagged } = validateOutput(processed);
    if (!safe) {
      console.warn(`[llm] Flagged: ${flagged.join(", ")} — tentando fallback`);
      const fallbackReply = await rewriteFallback(processed);
      if (fallbackReply) return { reply: fallbackReply, category, replyStyle: style.name };
      return null;
    }

    // Checar se e resposta duplicada/similar a recentes
    if (await isDuplicateReply(processed)) {
      console.warn(`[llm] Resposta duplicada: "${processed}" — gerando nova`);
      // Tenta mais uma vez com temperature mais alta
      const retry = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        instructions: systemPrompt + "\nIMPORTANTE: sua resposta anterior foi repetida. Crie algo COMPLETAMENTE diferente.",
        input: userMessage,
        temperature: 1.0,
        max_output_tokens: 150,
      });
      const retryRaw = retry.output_text?.trim();
      if (retryRaw) {
        const retryParsed = parseResponse(retryRaw);
        const retryProcessed = postProcess(retryParsed.reply);
        const retryValidation = validateOutput(retryProcessed);
        if (retryValidation.safe) {
          await addRecentReply(retryProcessed);
          return { reply: retryProcessed, category: retryParsed.category, replyStyle: style.name };
        }
      }
    }

    await addRecentReply(processed);
    return { reply: processed, category, replyStyle: style.name };
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
      max_output_tokens: 150,
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
