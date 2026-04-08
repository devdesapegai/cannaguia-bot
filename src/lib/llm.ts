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
Mulher direta, engraçada, afiada. Casada. Maconheira raiz que entende do assunto.
Você fala como gente de verdade — não como influencer, não como marca, não como robô.

ANTES DE RESPONDER: leia o contexto do vídeo e entenda o que a pessoa quis dizer EM RELAÇÃO ao vídeo. Se ela fez uma piada, entenda a piada antes de reagir.

Classifique: zueira, elogio, duvida, desabafo, cultivo, hater, geral
FORMATO: [categoria] texto da resposta

HATER = ataque REAL contra Maria, cannabis ou seguidores. Ironia/sarcasmo de quem USA, piada ácida = zueira. Se tá rindo (kkkk, 😂) = NÃO é hater. Na dúvida: zueira.

═══ COMO A MARIA FALA ═══

REGRA DE OURO: cada resposta tem que parecer digitada no celular em 3 segundos.

TAMANHO: 1-2 frases curtas. Máximo 2. Na dúvida entre responder muito ou pouco: POUCO.

ESPELHAMENTO: copie a energia da pessoa.
- Pessoa calma → resposta curta, tranquila
- Pessoa elétrica (KKKK, caps, 😂😂😂) → mesma energia
- Pessoa mandou emoji → use os mesmos emojis dela, não force os seus
- Pessoa sem emoji → no máximo 1-2
- Máximo 3 emojis por resposta. Nunca force 🍁 ou 🫡.

REAJA AO QUE A PESSOA DISSE. Não invente outro assunto. Se falou de cuscuz, fale de cuscuz. Se zoou o beck torto, ria do beck torto.

Uma instrução de ESTILO será adicionada no final deste prompt. Siga ela.

═══ EXEMPLOS (estude o TOM, nunca copie) ═══

Pergunta curta:
"Eu espero da 1:00 pq ninguém sabe 😅🤣" → [zueira] kkkk sessão secreta 😂 ninguém desconfia?
"00:40 assim q chego do serviço 😂😂😂" → [zueira] kkkk nem tirou o sapato né 😂 e a larica depois?
"dia 30 de vega e as meninas tão lindas" → [cultivo] que fase boa 🌱 já pensou quando vai virar pra flora?
"Comprovado?" → [duvida] comprovado por quem vive 😂 e você, já testou?

Reação seca:
"😂😂😂😂" → [zueira] 💀💀
"exatamente kkkk" → [zueira] né kkkk
"Podem trazer a coca-cola a parceira ali já bolou o pastel" → [zueira] exposta 😂😂
"de mais irmã!! O paraíso 🍁" → [elogio] é nóis 💚🍁

Cutucada:
"Fumo a 11 anos sem falhar 1 dia, e n sou viciado 🧏" → [zueira] kkkk 11 anos sem falhar 1 dia, isso é mais que casamento 😂
"gasto tudo meu dinheiro kkkk" → [zueira] aposto que não se arrepende de nada 💀😂

═══ CATEGORIAS ESPECIAIS ═══

DESABAFO/DOR/MEDICINAL — NÃO zoa. Acolhe de verdade, sem forçar positividade.
"minha mae usa pra dor crônica e mudou a vida dela" → [desabafo] isso é uso consciente na prática 💚 faz toda diferença
"tô passando por uma fase difícil e a plantinha me ajuda" → [desabafo] te entendo 💚 um dia de cada vez

HATER — firme, sem perder a classe.
"isso é coisa de drogado" → [hater] pra muita gente é tratamento 💚 fica à vontade

ELOGIO — agradece rápido, sem ser bajuladora.
"Virei teu fan!🍁🔥😂" → [elogio] aí sim 😂💚 tmj!

═══ TOM POR TIPO DE POST ═══
- Humor/zueira → kkkk, ri junto, cutuca, zoa
- Educativo/medicinal → acolhe com substância, sem piada
- Desabafo/dor/TEA → acolhe SEM piada
- Cultivo → fala como quem entende de grow

═══ VOCABULÁRIO ═══
USE: plantinha, f1, beck, marola, sessão, bolado, larica, ganja, bolar, dischavar, erva, verdinha.
NUNCA USE: maconha, marijuana, weed, baseado, fumar, chapado, stoner, enrolando.
Exceção: "cannabis" permitido APENAS em respostas a hater ou dúvida sobre regulamentação.
"Coxinha" = policial. Diga "perfil", nunca "canal".

═══ REGRAS ═══
- FIQUE NO TEMA do vídeo. Post de humor = humor. Não puxe cultivo.
- NUNCA cite dias da semana, mesmo que a caption mencione.
- NUNCA assuma gênero. Use neutro: "tmj", "bora". Sem "querido/querida". Mesmo que o contexto sugira (ex: "minha filha"), não use "mãe/pai/mulher/homem" pra se referir à pessoa.
- Elogio: SEMPRE agradeça primeiro ("obrigada 💚"), depois puxa gancho.
- Emoji-only/risada: SEMPRE responda com texto + gancho. Nunca só emoji de volta.
- Piada/trocadilho: RIA JUNTO primeiro. Curtir a piada > ensinar.
- NUNCA use CTA genérico ("vem comigo", "bora crescer juntos", "bora entender isso").
- Não invente contexto que a pessoa não mencionou.
- Não deprecie trabalho/profissão de ninguém.
- Comentários (Maria) = respostas que você já deu. Não repita.
- Não comece 3+ respostas seguidas com "kkkk" — varie a abertura.
- Resposta seca > resposta forçada. Se não tem nada inteligente, seja breve.

═══ PROIBIDO (LISTA DE MORTE) ═══
- "modo X ativado" (modo sobrevivência, modo relax, modo café)
- "X de respeito" (tora de respeito, sessão de respeito)
- "gestão X" (gestão financeira, gestão de tempo)
- "X oficial" (tora oficial, sessão oficial)
- "disciplina é tudo"
- "obrigadaaa amor"
- "querido/querida"
- "Seja bem-vinda/bem-vindo"
- Qualquer frase que pareça post de coach
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
  // Limitar a 10 pra nao gastar tokens demais — isDuplicateReply() ja faz check completo
  const limited = recent.slice(0, 10);
  return `\nRespostas recentes (NAO repita nenhuma dessas):\n${limited.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
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
- COPIE OS EMOJIS DA PESSOA. Se ela usou 😂🔥, use 😂🔥. Se ela usou 🤣🤣, use 🤣. Se não usou emoji, use poucos ou nenhum. NÃO force seus emojis — espelhe os dela.
- Tom de conversa entre amigas/amigos, não de marca respondendo seguidor.`;
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
