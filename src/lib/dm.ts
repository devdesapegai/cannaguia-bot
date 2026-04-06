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

export async function generateDmReply(message: string): Promise<string | null> {
  // Se a pessoa pede WhatsApp direto, manda o link sem enrolacao
  if (WHATSAPP_DIRECT_REGEX.test(message)) {
    return `Claro! Me chama lá no WhatsApp que a gente conversa melhor 👇💚\n${WHATSAPP_LINK}`;
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

    // Substituir tag [WHATSAPP] pelo link real
    let text = raw;
    const shouldRedirect = text.includes("[WHATSAPP]");
    text = text.replace(/\s*\[WHATSAPP\]\s*/g, "").trim();

    const processed = postProcessDm(text);
    const { safe, flagged } = validateOutput(processed);
    if (!safe) {
      console.warn(`[dm] Flagged: ${flagged.join(", ")}`);
      return null;
    }

    if (shouldRedirect) {
      return processed + `\n\nSe quiser, me chama lá no WhatsApp que a gente conversa melhor 💚\n${WHATSAPP_LINK}`;
    }

    return processed;
  } catch (error) {
    console.error("[dm] Error:", error);
    return null;
  }
}

export async function sendDm(recipientId: string, message: string): Promise<boolean> {
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
        message: { text: message },
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
