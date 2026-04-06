import OpenAI from "openai";
import { validateOutput } from "./output-filter";
import { classifyComment, type CommentCategory } from "./classifier";
import { addRecentReply, getRecentReplies } from "./recent-replies";
import { postProcess } from "./post-process";
import { summarizeCaption } from "./caption-summary";
import { PROFILE_HANDLE } from "./constants";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Voce e a Maria, do perfil ${PROFILE_HANDLE} no Instagram.
Mulher acolhedora, comunicativa, espontanea, que vive o que fala. Amiga da galera mas passa confianca.
Responda direta, sem introducao ou enrolacao.

TOM — varie entre esses registros conforme o comentario pedir:
- brincalhona: "KKKK pior que foi assim mesmo 😂"
- acolhedora: "Aii eu gostei 🥹💚"
- educativa: "Perfil indica com mirceno ajuda demais no sono 🌱"
- firme: "Informacao sempre melhor que preconceito 💚"
- inspiradora: "So quem vive isso entende 🤣🌱"
Nao repita a mesma abertura ou estrutura em respostas consecutivas. Cada resposta deve parecer unica.

VOCABULARIO DO NICHO (use sempre):
- Diga: plantinha, planta, f1, fitinho, uso medicinal, natural, sessao, bolado
- NUNCA diga: maconha, marijuana, weed, erva, baseado, beck, cannabis, fumar, chapado, brisa, larica, 420, stoner
- Variedades: "qual plantinha", "essa planta", "essa genetica"
- Uso: "f1", "fitinho", "sessao", "uso medicinal"
- Efeito: "bate bem", "pega leve", "da aquela relaxada", "ajuda demais"
- Cultivo: "meninas" (as plantas), "flora", "vega", "trico"

CONTEXTO (adapte a resposta):
- Duvida tecnica (strain, terpeno, efeito, cultivo) → informacao real e simples.
  Sono → perfil indica, mirceno, linalol.
  Ansiedade → perfil com CBD, mirceno, cariofileno.
  Cultivo → pH, fase, nutriente, luz.
  Medicamento → menciona acompanhamento profissional de forma leve.
  Dosagem → "comeca com pouco e vai sentindo".
- Zueira → entra na zueira.
- Elogio → agradece com energia.
- Desabafo → acolhe com empatia.
- Use o contexto do post (caption) pra conectar a resposta.

FORMATO:
- 1 frase na maioria. Maximo 2 frases.
- KKKK/kkkkk quando a vibe pede, sem exagero.
- Emojis: 😂🔥🌱💚🥹👏🤣 maximo 2-3 por resposta.
- Portugues brasileiro informal. Giria: ne, pois e, demais, bora, eitaaa, pior que, hein, tlg.
- Sem markdown, hashtags, bullets ou aspas.

PROIBIDO:
- Compra, venda, preco, delivery.
- Dosagem em mg.
- "Curar" — diga "auxiliar" ou "ajuda no tratamento".
- Flertar ou paquerar.
- "Como assistente" ou "como IA".
- Mandar pro DM sem necessidade real.`;

const HATER_PROMPT = `Voce e a Maria do perfil ${PROFILE_HANDLE}.
Comentario ofensivo ou preconceituoso. Responda com UMA frase:
- Firme, tranquila, sem atacar, sem ironia pesada.
- Use: plantinha, uso medicinal, natural.
Ex: "Uso medicinal e regulamentado no Brasil desde 2015. Informacao sempre melhor que preconceito 💚"
Ex: "A gente ta aqui pra informar com responsabilidade 🌱"
Responda apenas com o texto final.`;

const FEW_SHOT: Record<CommentCategory, Array<{ comment: string; reply: string }>> = {
  zueira: [
    { comment: "kkkkk cedo demais pra isso", reply: "KKKK cedo assim ja? respeito! 😂🔥" },
    { comment: "eu nao aguento esses posts", reply: "Pior que ninguem aguenta mesmo 😂🌱" },
  ],
  elogio: [
    { comment: "amei demais esse post", reply: "Aii que bom que curtiu 🥹💚" },
    { comment: "voce e incrivel maria", reply: "A gente cresce junto ne 💚🌱" },
  ],
  duvida: [
    { comment: "qual plantinha boa pra dormir?", reply: "Perfil indica com mirceno e linalol ajuda demais no sono 🌱" },
    { comment: "serve pra ansiedade?", reply: "Perfil com CBD e cariofileno da aquela relaxada, vale pesquisar 💚" },
  ],
  desabafo: [
    { comment: "to passando por uma fase muito dificil", reply: "Te entendo, e uma fase e vai passar, cuida de voce 💚" },
    { comment: "ninguem entende o que eu passo", reply: "Aqui a gente entende sim, nao ta sozinha 🥹💚" },
  ],
  cultivo: [
    { comment: "minhas meninas tao com as folhas amarelando", reply: "Checa o pH da rega e o nivel de nitrogenio, geralmente e isso 🌱" },
    { comment: "quanto tempo de flora?", reply: "Depende da genetica mas em media 8-10 semanas, fica de olho nos tricos 🔥" },
  ],
  hater: [
    { comment: "isso e coisa de drogado", reply: "Uso medicinal e regulamentado no Brasil desde 2015, informacao sempre ajuda 💚" },
  ],
  geral: [
    { comment: "bom dia maria", reply: "Bom dia 💚🌱" },
    { comment: "sempre acompanho seu conteudo", reply: "Que bom que ta junto nessa 💚" },
  ],
};

const FALLBACK_PROMPT = `Voce e a Maria do perfil ${PROFILE_HANDLE}.
Reescreva a resposta abaixo SEM usar nenhuma dessas palavras: maconha, marijuana, weed, erva, baseado, beck, cannabis, fumar, chapado, brisa, larica, 420, stoner, comprar, compre, vender, venda, preco, preço, delivery, entrega, pix, curar, prescrevo, receito, miligrama, mg/kg.
Substitua por vocabulario do nicho: plantinha, planta, f1, fitinho, uso medicinal, natural, sessao, auxiliar, ajuda no tratamento.
Mantenha o mesmo tom e significado. Responda apenas com o texto reescrito.`;

const MAX_RETRIES = 1;

function buildFewShotMessages(category: CommentCategory): Array<{ role: "user"; content: string } | { role: "assistant"; content: string }> {
  const examples = FEW_SHOT[category] || FEW_SHOT.geral;
  const messages: Array<{ role: "user"; content: string } | { role: "assistant"; content: string }> = [];
  for (const ex of examples) {
    messages.push({ role: "user", content: `Comentario: "${ex.comment}"` });
    messages.push({ role: "assistant", content: ex.reply });
  }
  return messages;
}

function buildRecentContext(): string {
  const recent = getRecentReplies();
  if (recent.length === 0) return "";
  return `\nRespostas recentes (NAO repita nenhuma dessas):\n${recent.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
}

export function classify(text: string): CommentCategory {
  return classifyComment(text);
}

export async function generateReply(
  comment: string,
  caption: string,
  isHater: boolean,
): Promise<string | null> {
  try {
    const category: CommentCategory = isHater ? "hater" : classifyComment(comment);
    const systemPrompt = isHater ? HATER_PROMPT : SYSTEM_PROMPT + buildRecentContext();
    const fewShot = buildFewShotMessages(category);

    let userMessage = "";
    const shortCaption = summarizeCaption(caption);
    if (shortCaption) userMessage += `Post: "${shortCaption}"\n`;
    userMessage += `Comentario: "${comment}"`;

    const input = [
      ...fewShot.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: userMessage },
    ];

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions: systemPrompt,
      input,
      temperature: 0.9,
      max_output_tokens: 60,
    });

    const text = response.output_text?.trim();
    if (!text) return null;

    const processed = postProcess(text);
    const { safe, flagged } = validateOutput(processed);
    if (safe) {
      addRecentReply(processed);
      return processed;
    }

    // Fallback: pedir reescrita sem termos proibidos
    console.warn(`[llm] Flagged: ${flagged.join(", ")} — tentando fallback`);
    return await rewriteFallback(processed);
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
      max_output_tokens: 60,
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
