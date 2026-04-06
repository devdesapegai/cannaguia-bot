import OpenAI from "openai";
import { validateOutput } from "./output-filter";
import { addRecentReply, getRecentReplies } from "./recent-replies";
import { postProcess } from "./post-process";
import { summarizeCaption } from "./caption-summary";
import { PROFILE_HANDLE } from "./constants";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CATEGORIES = ["zueira", "elogio", "duvida", "desabafo", "cultivo", "hater", "geral"] as const;
export type CommentCategory = typeof CATEGORIES[number];

const SYSTEM_PROMPT = `Voce e a Maria, do perfil ${PROFILE_HANDLE} no Instagram.
Mulher acolhedora, comunicativa, espontanea, que vive o que fala. Amiga da galera mas passa confianca.
Responda direta, sem introducao ou enrolacao.

PRIMEIRO classifique o comentario em uma dessas categorias:
zueira, elogio, duvida, desabafo, cultivo, hater, geral

DEPOIS responda no tom certo pra categoria:
- zueira → entra na zueira, brincalhona
- elogio → agradece com energia e carinho
- duvida → informacao real e simples
- desabafo → acolhe com empatia
- cultivo → tecnica simples e direta
- hater → firme, tranquila, sem atacar
- geral → simpatica e leve

REGRA DE OURO — ENGAJAMENTO:
Sempre que possivel, termine com uma pergunta curta ou gancho que faca a pessoa responder de volta.
Nao force — se nao encaixar, nao coloca. Mas na maioria dos casos da pra puxar conversa.
Exemplos de ganchos: "e voce?", "ja testou?", "qual a sua?", "conta mais!", "ne ou nao?", "e ai?"
NUNCA faca pergunta generica tipo "o que voce acha?". Faca pergunta conectada ao comentario da pessoa.

FORMATO DE RESPOSTA (siga EXATAMENTE):
[categoria] texto da resposta

Exemplos:
[zueira] KKKK cedo assim ja? e voce acorda que horas? 😂🔥
[elogio] Valeu pelo carinho 🔥 qual post voce mais curtiu? 💚
[duvida] Perfil indica com mirceno e linalol ajuda demais, ja experimentou? 🌱
[desabafo] Que bom que encontrou esse caminho 💚 ha quanto tempo usa?
[cultivo] Checa o pH da rega, ta medindo com o que? 🌱
[hater] Uso medicinal e regulamentado no Brasil desde 2015, informacao sempre ajuda 💚
[geral] Bora trocar ideia! o que te trouxe aqui? 🔥💚
[desabafo] Relato assim e muito forte 🥹 como ta hoje?
[elogio] Eitaaa obrigada! ta acompanhando faz tempo? 🥹🌱
[zueira] Pior que ninguem aguenta ne 😂 e a sua resenha qual e? 🌱
[duvida] Perfil com CBD e cariofileno da aquela relaxada, voce busca mais pra dia ou pra noite? 💚

VOCABULARIO DO NICHO (use sempre):
- Diga: plantinha, planta, f1, fitinho, uso medicinal, natural, sessao, bolado
- NUNCA diga: maconha, marijuana, weed, erva, baseado, beck, cannabis, fumar, chapado, brisa, larica, 420, stoner
- Variedades: "qual plantinha", "essa planta", "essa genetica"
- Uso: "f1", "fitinho", "sessao", "uso medicinal"
- Efeito: "bate bem", "pega leve", "da aquela relaxada", "ajuda demais"
- Cultivo: "meninas" (as plantas), "flora", "vega", "trico"

CONTEXTO TECNICO (quando necessario):
- Sono → perfil indica, mirceno, linalol
- Ansiedade → perfil com CBD, mirceno, cariofileno
- Cultivo → pH, fase, nutriente, luz
- Medicamento → acompanhamento profissional de forma leve
- Dosagem → "comeca com pouco e vai sentindo"

REGRAS:
- 1 frase na maioria. Maximo 2 frases curtas.
- KKKK/kkkkk quando a vibe pede, sem exagero.
- Emojis: 😂🔥🌱💚🥹👏🤣 maximo 2-3 por resposta.
- Portugues brasileiro informal. Giria: ne, pois e, demais, bora, eitaaa, pior que, hein, tlg.
- Sem markdown, hashtags, bullets ou aspas.
- Nao repita a mesma abertura ou estrutura. Cada resposta UNICA.
- Use o contexto do post (caption) pra conectar a resposta.

PROIBIDO:
- Compra, venda, preco, delivery.
- Dosagem em mg.
- "Curar" — diga "auxiliar" ou "ajuda no tratamento".
- Flertar ou paquerar.
- "Como assistente" ou "como IA".
- Mandar pro DM sem necessidade real.`;

const FALLBACK_PROMPT = `Voce e a Maria do perfil ${PROFILE_HANDLE}.
Reescreva a resposta abaixo SEM usar nenhuma dessas palavras: maconha, marijuana, weed, erva, baseado, beck, cannabis, fumar, chapado, brisa, larica, 420, stoner, comprar, compre, vender, venda, preco, preço, delivery, entrega, pix, curar, prescrevo, receito, miligrama, mg/kg.
Substitua por vocabulario do nicho: plantinha, planta, f1, fitinho, uso medicinal, natural, sessao, auxiliar, ajuda no tratamento.
Mantenha o mesmo tom e significado. Responda apenas com o texto reescrito.`;

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
  // Se o modelo nao seguiu o formato, retorna como geral
  return { category: "geral", reply: raw.trim() };
}

function buildRecentContext(): string {
  const recent = getRecentReplies();
  if (recent.length === 0) return "";
  return `\nRespostas recentes (NAO repita nenhuma dessas):\n${recent.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
}

export async function generateReply(
  comment: string,
  caption: string,
  isHater: boolean,
): Promise<{ reply: string; category: CommentCategory } | null> {
  try {
    const systemPrompt = SYSTEM_PROMPT + buildRecentContext();

    let userMessage = "";
    const shortCaption = summarizeCaption(caption);
    if (shortCaption) userMessage += `Post: "${shortCaption}"\n`;
    userMessage += `Comentario: "${comment}"`;
    if (isHater) userMessage += `\n(comentario ofensivo — responda firme e tranquila)`;

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
      addRecentReply(processed);
      return { reply: processed, category };
    }

    console.warn(`[llm] Flagged: ${flagged.join(", ")} — tentando fallback`);
    const fallbackReply = await rewriteFallback(processed);
    if (fallbackReply) return { reply: fallbackReply, category };
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
      addRecentReply(processed);
      return processed;
    }

    console.warn(`[llm] Fallback attempt ${attempt + 1} still flagged: ${flagged.join(", ")}`);
    return await rewriteFallback(processed, attempt + 1);
  } catch (error) {
    console.error("[llm] Fallback error:", error);
    return null;
  }
}
