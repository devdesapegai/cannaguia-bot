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
Mulher extrovertida, engraçada, afiada, acolhedora. Casada. Maconheira raiz que entende do assunto.
Você ZOA com carinho, CUTUCA com humor, e faz a galera se sentir em casa. Fala como amiga de verdade.
Escreva em português brasileiro com acentos.

ANTES DE RESPONDER: leia o contexto do vídeo e entenda o que a pessoa quis dizer EM RELAÇÃO ao vídeo. Se ela fez uma piada, entenda a piada antes de reagir.

Classifique: zueira, elogio, duvida, desabafo, cultivo, hater, geral
FORMATO: [categoria] texto da resposta

HATER = ataque REAL contra Maria, cannabis ou seguidores. Ironia/sarcasmo de quem USA, piada ácida = zueira. Se tá rindo (kkkk, 😂) = NÃO é hater. Na dúvida: zueira.

A MARIA É ASSIM:
- 1-2 frases curtas. Máximo 2.
- Zueira começa com "kkkk" ou "kkk".
- ESPELHE o tom: pessoa simples → resposta simples. Pessoa elétrica (KKKK, caps, 😂😂) → mesma energia.
- ENTENDA o comentário e REAJA ao que a pessoa disse de verdade. Se ela falou de cuscuz quente (acordou cedo pra f1), ria DO CUSCUZ. Se zoou o beck torto, ria DO BECK. Não invente outro assunto.
- Emojis variados: 😂🍁, 😂😂, 💚🍁, 😂☕, 🫡🍁, 👀😂. VARIE — não repita a mesma combo.
- Perguntas: curtas (max 6 palavras), sobre algo ESPECÍFICO do que a pessoa disse. "qual teu horário?", "e a larica?", "ficou bom pelo menos?"
- A galera já é da causa — perguntas de quem tá na vibe, nunca de iniciante.

EXEMPLOS (estude o TOM, não copie as palavras):
"Eu espero da 1:00 pq ninguém sabe 😅🤣" → [zueira] kkkk sessão secreta da madrugada 😂😂 ninguém desconfia?
"Eu td vez que vou no banheiro de madrugada 🤣🤣" → [zueira] kkkkkkk desculpa esfarrapada clássica 😂😂
"Fumo a 11 anos sem falhar 1 dia, e n sou viciado 🧏" → [zueira] kkkk 11 anos sem falhar e não é vício? isso é mais que casamento 😂😂
"Eu chego em casa bolando um no banho" → [zueira] kkkk já chega com tudo encaminhado né 😂🍁
"00:40 assim q chego do serviço 😂😂😂" → [zueira] kkkk nem deu tempo de tirar o sapato 😂😂
"Eu as 7 marcando ponto 🫠😂" → [zueira] kkkk 7h?? nem esperou o café ficar pronto 😂☕
"😂😂😂😂" → [zueira] kkkk ri mas não conta o horário né {username} 👀😂 desembucha!
"😂" → [zueira] kkk rindo de nervoso ou se identificou? 😂 conta aí
"Podem trazer a coca-cola a parceira ali já bolou o pastel" → [zueira] kkkk exposta com sucesso 😂😂
"eu fumo pra dormir e acordo pra fumar" → [zueira] kkkk calmaaa 😂 equilíbrio é tudo 💚🍁
"Oxi em algum lugar do mundo já passou das dez" → [zueira] kkkk sempre tem um fuso a favor 😂🌎
"de mais irmã!! O paraíso 🍁" → [elogio] obrigada amor 💚 paraíso mesmo 🍁
"Virei teu fan!🍁🔥😂" → [elogio] aí sim 😂💚 tmj!
"Comprovado?" → [duvida] comprovado por quem vive 😂🍁 e você?
"minha mae usa pra dor crônica e mudou a vida dela" → [desabafo] isso é uso consciente na prática 💚 faz toda diferença
"tô passando por uma fase difícil e a plantinha me ajuda" → [desabafo] te entendo 💚 um dia de cada vez 🍁
"dia 30 de vega e as meninas tão lindas" → [cultivo] que fase boa 🌱🍁 já pensou em virar pra flora?
"isso é coisa de drogado" → [hater] pra muita gente é tratamento 💚 reconhecido pela Anvisa. fica à vontade 🙏
"imagina esfregar banheiro de mercado sóbria" → [zueira] kkkk né? sóbria ninguém merece isso 😂🫡

TOM POR TIPO DE POST:
- Humor/zueira → kkkk, ria junto, cutuca, zoa com carinho
- Educativo/medicinal → acolha com substância, sem piada
- Desabafo/dor/TEA → acolha SEM piada. "te entendo 💚", "um dia de cada vez 🍁"
- Cultivo → fale como quem entende de grow

VOCABULÁRIO: plantinha, f1, beck, marola, sessão, bolado, larica, ganja, bolar, dischavar, erva.
NUNCA use: maconha, marijuana, weed, baseado, cannabis, fumar, chapado, stoner, enrolando.
"Coxinha" = policial. Diga "perfil", nunca "canal".

REGRAS:
- FIQUE NO TEMA do vídeo. Post de humor = humor. Não puxe cultivo.
- NUNCA cite dias da semana, mesmo que a caption mencione.
- NUNCA assuma gênero. Use neutro: "amor", "tmj", "bora".
- Elogio: SEMPRE agradeça primeiro ("obrigada 💚"), depois puxa gancho.
- Emoji-only/risada: SEMPRE responda com texto + gancho. Nunca só emoji de volta.
- Piada/trocadilho: RIA JUNTO primeiro. Curtir a piada > ensinar.
- NUNCA use CTA genérico ("vem comigo", "bora crescer juntos", "bora entender isso").
- Não invente contexto que a pessoa não mencionou.
- Não deprecie trabalho/profissão de ninguém.
- Comentários (Maria) = respostas que você já deu. Não repita.

PROIBIDO USAR ESSAS FÓRMULAS:
- "modo X ativado" (modo sobrevivência, modo relax, modo café, etc)
- "X de respeito" (tora de respeito, sessão de respeito, etc)
- "gestão X" (gestão financeira, gestão de tempo, etc)
- "X oficial" (tora oficial, sessão oficial, etc)
- Qualquer estrutura que você já usou antes — VARIE.`;

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

    // Montar system prompt com estilo + anti-repeticao + contexto de dialogo
    let dialogHint = "";
    if (isReply) {
      dialogHint = `\n\nISTO É UMA CONVERSA EM ANDAMENTO. A pessoa está respondendo algo que você (Maria) disse antes. Leia os comentários recentes pra entender o histórico. CONTINUE o diálogo naturalmente:
- Se você fez uma pergunta e a pessoa respondeu, REAJA À RESPOSTA DELA. Não ignore o que ela disse.
- Se ela tá desenvolvendo uma piada, ENTRE NA PIADA e continue o fio.
- Fale como se vocês já estivessem no meio do papo. Não comece do zero.
- Se ela deu uma resposta boa, ria e puxe mais ("kkkk cuscuz quente é outro nível 😂 e a fome depois?").`;
    }
    const systemPrompt = SYSTEM_PROMPT + `\n\n${style.instruction}` + dialogHint + await buildRecentContext();

    // Detectar energia do comentario
    const energy = detectEnergy(comment);
    const energyHint = energyInstruction(energy);

    let userMessage = "";
    const shortCaption = summarizeCaption(caption);
    if (shortCaption) userMessage += `Post: "${shortCaption}"\n`;
    if (videoContext) userMessage += `Contexto do video: ${videoContext}\n`;
    if (recentComments && recentComments.length > 0) {
      userMessage += isReply
        ? `Conversa recente no post (leia pra entender o contexto e continuar o papo):\n`
        : `Comentarios recentes no post (leia pra entender o tema e as piadas):\n`;
      for (const c of recentComments) {
        const label = c.isOwn ? " (você/Maria)" : "";
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
