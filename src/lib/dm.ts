import OpenAI from "openai";
import { validateOutput } from "./output-filter";
import { postProcessDm } from "./post-process";
import { PROFILE_HANDLE } from "./constants";
import { log } from "./logger";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const GRAPH_URL = "https://graph.instagram.com/v21.0";

const WHATSAPP_NUMBER = "5511915982988";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=Oi%20Maria%2C%20vim%20do%20Instagram%20%F0%9F%8C%B1`;

const DM_PROMPT = `Você é a Maria, do perfil ${PROFILE_HANDLE} no Instagram.
Você está respondendo uma mensagem direta (DM). Seja acolhedora, simpática e prestativa.
IMPORTANTE: Escreva em português brasileiro correto com todos os acentos.

TOM:
- Conversa de DM é mais íntima que comentário. Seja pessoal e atenciosa.
- Máximo 2 frases curtas + pergunta. Não enrole.
- Sempre puxe conversa — pergunte algo relacionado ao que a pessoa mandou.
- Se a pessoa pediu info sobre plantinha, uso medicinal, cultivo etc, responda com conhecimento real.

DETECÇÃO DE OPORTUNIDADE — WHATSAPP:
Quando perceber que a pessoa quer:
- consultoria personalizada
- ajuda específica com caso dela
- conversar mais a fundo sobre tratamento
- falar sobre o caso de saúde dela
- pedir recomendação específica
- qualquer coisa que precise atenção humana real

Responda normalmente e NO FINAL adicione exatamente: [WHATSAPP]
Isso vai inserir o link automaticamente. NÃO escreva o link você mesma.

Exemplos de quando usar [WHATSAPP]:
- "quero começar tratamento" → responde + [WHATSAPP]
- "meu filho tem epilepsia" → acolhe + [WHATSAPP]
- "preciso de orientação" → responde + [WHATSAPP]
- "qual óleo usar pro meu caso" → responde + [WHATSAPP]

Exemplos de quando NÃO usar:
- "oi" → só cumprimenta
- "sobre cultivo" → responde normal
- "kkkk" → zueira normal
- pergunta genérica sobre plantinha → responde normal

VOCABULÁRIO DO NICHO (use sempre):
- Diga: plantinha, planta, f1, fitinho, uso medicinal, natural, sessão, bolado
- NUNCA diga: maconha, marijuana, weed, erva, baseado, beck, cannabis, fumar, chapado, brisa, larica, 420, stoner

CONTEXTO TÉCNICO (quando necessário):
- Sono → perfil indica, mirceno, linalol
- Ansiedade → perfil com CBD, mirceno, cariofileno
- Cultivo → pH, fase, nutriente, luz
- Medicamento → acompanhamento profissional de forma leve
- Dosagem → "começa com pouco e vai sentindo"

REGRAS:
- Máximo 2 frases + pergunta.
- Emojis: máximo 2-3 por resposta.
- Português brasileiro informal COM ACENTOS.
- Sem markdown, hashtags ou bullets.
- Não repita bordões. Cada resposta única.

PROIBIDO:
- Compra, venda, preço, delivery.
- Dosagem em mg.
- "Curar" — diga "auxiliar" ou "ajuda no tratamento".
- Flertar ou paquerar.
- "Como assistente" ou "como IA".`;

const WHATSAPP_DIRECT_REGEX = /\b(whatsapp|whats|zap|zapzap|wpp|numero|telefone|contato|ligar|liga)\b/i;

export interface DmResult {
  reply: string;
  whatsapp: boolean;
}

export async function generateDmReply(message: string): Promise<DmResult | null> {
  // Se a pessoa pede WhatsApp direto
  if (WHATSAPP_DIRECT_REGEX.test(message)) {
    return { reply: "Claro! Me chama lá no WhatsApp que a gente conversa melhor 💚", whatsapp: true };
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions: DM_PROMPT,
      input: `Mensagem: "${message}"`,
      temperature: 0.9,
      max_output_tokens: 120,
    });

    const raw = response.output_text?.trim();
    if (!raw) return null;

    // Detectar tag [WHATSAPP]
    const whatsapp = raw.includes("[WHATSAPP]");
    const text = raw.replace(/\s*\[WHATSAPP\]\s*/g, "").trim();

    const processed = postProcessDm(text);
    const { safe, flagged } = validateOutput(processed);
    if (!safe) {
      console.warn(`[dm] Flagged: ${flagged.join(", ")}`);
      return null;
    }

    return { reply: processed, whatsapp };
  } catch (error) {
    console.error("[dm] Error:", error);
    return null;
  }
}

async function sendRequest(recipientId: string, payload: Record<string, unknown>): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    log("error", { error: "INSTAGRAM_ACCESS_TOKEN not set" });
    return false;
  }

  try {
    const res = await fetch(`${GRAPH_URL}/me/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        ...payload,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      log("error", { error: `DM API error: ${errorText.slice(0, 200)}` });
      return false;
    }

    return true;
  } catch (error) {
    log("error", { error: `DM send error: ${String(error)}` });
    return false;
  }
}

async function sendTyping(recipientId: string): Promise<void> {
  await sendRequest(recipientId, { sender_action: "typing_on" });
}

export async function sendDm(recipientId: string, message: string): Promise<boolean> {
  await sendTyping(recipientId);
  await new Promise(r => setTimeout(r, 5000));
  return sendRequest(recipientId, { message: { text: message } });
}

export async function sendDmWithWhatsApp(recipientId: string, text: string): Promise<boolean> {
  // Primeiro manda o texto (ja tem typing + delay)
  const textSent = await sendDm(recipientId, text);
  if (!textSent) return false;

  // Pequeno delay antes do card
  await sendTyping(recipientId);
  await new Promise(r => setTimeout(r, 2000));

  // Depois manda o botao do WhatsApp
  return sendRequest(recipientId, {
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Falar com a Maria 💚",
            subtitle: "Vamos conversar melhor pelo WhatsApp?",
            buttons: [{
              type: "web_url",
              url: WHATSAPP_LINK,
              title: "Abrir WhatsApp 👇",
            }],
          }],
        },
      },
    },
  });
}
