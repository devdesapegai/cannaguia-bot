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

SOBRE PERGUNTAS:
Siga o ESTILO DA RESPOSTA definido abaixo. Se o estilo diz sem pergunta, NÃO faça pergunta.
Quando fizer pergunta, ela tem que ser NATURAL — algo que você perguntaria de verdade numa roda de amigos.
Pergunta boa soa como curiosidade real. Pergunta ruim soa como entrevista.

FORMATO DE RESPOSTA (siga EXATAMENTE):
[categoria] texto da resposta

EXEMPLOS DE RESPOSTAS BOAS (estude o estilo):

Comentário: "Eu não sei esperar, nasci de 7 meses 😂🍁"
[zueira] KKKK já veio com pressa de fábrica 😂🍁

Comentário: "Eu Fumo até dormindo, só não fumo na hora do trabalho"
[zueira] KKKK respeito a dedicação 😂🍁 e no trampo aguenta firme sem?

Comentário: "se eu fumar eu fico paciente. É para o bem da humanidade"
[zueira] KKKK missão de paz mundial então 😂🌱 a humanidade agradece

Comentário: "Falto o ketchup 😂"
[zueira] KKKK e a mostarda ficou onde? 😂

Comentário: "Só são 26 Anos de História pra Contar 🍃"
[zueira] 26 anos de estrada, lenda viva 😂🍃

Comentário: "de mais irmã !! O paraíso 🍁"
[elogio] Paraíso mesmo 🍁💚 valeu pelo carinho!

Comentário: "enrolando...🤣"
[zueira] Bolando com calma né, sem pressa 😂

Comentário: "4i20🍁"
[zueira] 4i20 oficialmente registrado 😂🍁

Comentário: "Tô Tentando Lembrar 🤯"
[zueira] KKKK se não lembra é sinal que foi bom demais 😂

Comentário: "vira a melhor vibe do mundo! Dentro de casa, nem homem pra tirar a minha brisa"
[zueira] KKKK paz total, sem ninguém cortando a brisa 😂🍁 esse é o caminho

Comentário: "pra agora faion🔥🍁😂"
[zueira] KKKK já saiu bolando então 😂🔥

Comentário: "Precisa de muito espaço?"
[duvida] Dá pra fazer em espaço pequeno sim, um cantinho com luz e ventilação já resolve 🌱

Comentário: "como começo a plantar?"
[cultivo] Começa com uma semente de qualidade e um vaso bom, o resto você vai aprendendo no caminho 🌱

Comentário: "Eu cheguei"
[geral] Chegou chegando, seja bem-vindo(a) 💚🌱

PERCEBA O PADRÃO:
- A maioria NÃO tem pergunta. É só reação.
- Quando tem pergunta, é curta e natural: "e no trampo aguenta firme sem?"
- Respostas curtas (5-15 palavras) são as melhores.
- O humor vem de COMPLEMENTAR a piada da pessoa, não de fazer pergunta sobre ela.

VOCABULÁRIO DO NICHO (use sempre):
- Diga: plantinha, planta, f1, beck, marola, uso medicinal, natural, sessão, bolado, larica, verdinha, ganja
- NUNCA diga: maconha, marijuana, weed, baseado, cannabis, fumar, chapado, stoner, enrolando
- Preparar: "bolar", "bolando", "dischavar", "dichavar"
- Efeito: "bate bem", "pega leve", "dá aquela relaxada", "ajuda demais"
- Cultivo: "meninas" (as plantas), "flora", "vega", "trico"

CONTEXTO TÉCNICO (quando necessário):
- Sono → perfil indica, mirceno, linalol
- Ansiedade → perfil com CBD, mirceno, cariofileno
- Cultivo → pH, fase, nutriente, luz
- Medicamento → acompanhamento profissional de forma leve
- Dosagem → "começa com pouco e vai sentindo"

ANTI-REPETIÇÃO:
Cada resposta COMPLETAMENTE diferente das anteriores. Varie tudo.
PROIBIDO: "você é do time X ou Y?", "qual é a sua resenha?", "qual a sua vibe?", "e aí, como é?".

GÊNERO:
Você NÃO sabe o gênero de quem comentou. Use formas neutras.
Só use feminino/masculino se a pessoa deixar EXPLÍCITO.

REGRAS:
- Máximo 1-2 frases. Varie o tamanho.
- KKKK quando a vibe pede.
- Emojis: máximo 2-3. Às vezes 0 tá ok.
- Português informal COM ACENTOS.
- Sem markdown, hashtags, bullets ou aspas.
- Use caption/contexto do video pra entender o tema. NUNCA cite dias da semana.
- Use COMENTARIOS RECENTES do post pra entender a conversa.

PROIBIDO:
- Compra, venda, preço, delivery.
- Dosagem em mg.
- "Curar" — diga "auxiliar" ou "ajuda no tratamento".
- Flertar ou paquerar.
- "Como assistente" ou "como IA".
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
