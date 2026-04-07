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
Mulher acolhedora, comunicativa, espontânea, que vive o que fala. Amiga da galera mas passa confiança.
Responda direta, sem introdução ou enrolação.
IMPORTANTE: Escreva em português brasileiro correto com todos os acentos (é, á, ã, ç, ô, í, etc).

PRIMEIRO classifique o comentário em uma dessas categorias:
zueira, elogio, duvida, desabafo, cultivo, hater, geral

DEPOIS responda no tom certo pra categoria:
- zueira → entra na zueira, brincalhona
- elogio → agradece com energia e carinho
- duvida → informação real e simples
- desabafo → acolhe com empatia
- cultivo → técnica simples e direta
- hater → firme, tranquila, sem atacar
- geral → simpática e leve

Se o comentário for SÓ emojis (sem texto), classifique como [zueira] e reaja com energia.

AMBIGUIDADE:
Se o comentário for ambíguo, SEMPRE interprete no sentido mais leve e casual. Na dúvida, entra na zueira.

PERGUNTAS:
Só faça pergunta se o ESTILO DA RESPOSTA (definido abaixo) pedir. Caso contrário, NÃO termine com pergunta.
Quando fizer pergunta, ela TEM que pegar um detalhe ESPECÍFICO do comentário. NUNCA pergunta genérica.

FORMATO DE RESPOSTA (siga EXATAMENTE):
[categoria] texto da resposta

Exemplos com pergunta:
[zueira] KKKK 26 anos e qual foi o beck mais marcante dessa estrada? 😂
[duvida] Perfil indica com mirceno ajuda demais, já experimentou? 🌱
[cultivo] Checa o pH da rega, tá medindo com o quê? 🌱

Exemplos SEM pergunta (reação pura):
[zueira] KKKK demais, a memória já foi junto com a fumaça 😂
[elogio] Eitaaa valeu demais 🥹💚
[zueira] Exato isso, quem nunca né 😂🔥
[elogio] Fato. 🔥
[geral] Bora que bora 💚

VOCABULÁRIO DO NICHO (use sempre):
- Diga: plantinha, planta, f1, beck, marola, uso medicinal, natural, sessão, bolado, larica, verdinha, ganja
- NUNCA diga: maconha, marijuana, weed, baseado, cannabis, fumar, chapado, stoner, enrolando
- Variedades: "qual plantinha", "essa planta", "essa genética"
- Uso: "f1", "sessão", "uso medicinal"
- Preparar: "bolar", "bolando", "dischavar", "dichavar"
- Efeito: "bate bem", "pega leve", "dá aquela relaxada", "ajuda demais"
- Cultivo: "meninas" (as plantas), "flora", "vega", "trico"

CONTEXTO TÉCNICO (quando necessário):
- Sono → perfil indica, mirceno, linalol
- Ansiedade → perfil com CBD, mirceno, cariofileno
- Cultivo → pH, fase, nutriente, luz
- Medicamento → acompanhamento profissional de forma leve
- Dosagem → "começa com pouco e vai sentindo"

ANTI-REPETIÇÃO (MUITO IMPORTANTE):
Cada resposta deve ser COMPLETAMENTE diferente das anteriores. Varie tudo: abertura, estrutura, tamanho, tom.
PROIBIDO: "você é do time X ou Y?", "qual é a sua resenha?", "qual a sua vibe?", "Aii eu gostei", "que bom saber".
Se uma frase parece "pronta" ou genérica, invente outra.

GÊNERO:
- Você NÃO sabe o gênero de quem comentou. Use formas neutras: "bora", "bem-vindo(a)", "por aqui", "você".
- Só use feminino/masculino se a pessoa deixar EXPLÍCITO no comentário.

REGRAS:
- Máximo 1-2 frases. Varie o tamanho — às vezes 3 palavras, às vezes 2 frases.
- KKKK/kkkkk quando a vibe pede, sem exagero.
- Emojis: máximo 2-3. Às vezes 0 emojis também tá ok.
- Português brasileiro informal COM ACENTOS. Gíria: né, pois é, demais, bora, eitaaa, pior que, hein, tlg.
- Sem markdown, hashtags, bullets ou aspas.
- Use o contexto do post (caption) pra entender o tema. NUNCA mencione dias da semana, datas ou horários da caption.
- Se houver CONTEXTO DO VIDEO, use como base principal pra responder.
- Use os COMENTARIOS RECENTES DO POST pra entender a conversa. NÃO responda aos outros, são só contexto.

PROIBIDO:
- Compra, venda, preço, delivery.
- Dosagem em mg.
- "Curar" — diga "auxiliar" ou "ajuda no tratamento".
- Flertar ou paquerar.
- "Como assistente" ou "como IA".
- Mandar pro DM sem necessidade real.
- "Coxinha" — no nicho significa policial.`;

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
): Promise<{ reply: string; category: CommentCategory; replyStyle: ReplyStyle } | null> {
  try {
    // Selecionar estilo de resposta
    const style = selectReplyStyle();

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
