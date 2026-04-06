import OpenAI from "openai";
import { validateOutput } from "./output-filter";
import { postProcessDm } from "./post-process";
import { PROFILE_HANDLE } from "./constants";
import { log } from "./logger";
import { addMessage, getHistory, getMessageCount } from "./dm-history";
import { extractProfileFromMessage, profileSummary, markWhatsAppOffered, getProfile } from "./user-profile";

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
- Use o HISTÓRICO DA CONVERSA pra manter contexto. Não repita perguntas que já fez.
- Use o PERFIL DA PESSOA pra personalizar a resposta. Se sabe o nome, use o nome.
- NUNCA use "querida", "amor", "gatinha", "gata" etc sem saber o gênero. Use "você" como neutro.
- Se sabe que é mulher, pode usar "amiga", "querida". Se homem, "amigo", "mano".
- Se não sabe o gênero, pergunte o nome antes de assumir qualquer coisa.

WHATSAPP — QUANDO OFERECER:
Quando a conversa indicar que a pessoa precisa de orientação personalizada, adicione [WHATSAPP] no final.

Ofereça na 2ª ou 3ª troca quando:
- A pessoa fala de condição de saúde específica (ansiedade, dor, insônia, epilepsia, depressão)
- Quer saber sobre uso medicinal pro caso dela
- Pede recomendação personalizada
- Quer consultoria

NÃO ofereça quando:
- Conversa casual, zueira, elogio
- Pergunta genérica sobre cultivo
- A pessoa já recebeu o link antes (veja histórico)
- A pessoa está satisfeita só conversando por ali

Se a pessoa quiser continuar no DM, continue normalmente sem forçar WhatsApp.
Se já ofereceu WhatsApp e a pessoa não quis, NÃO ofereça de novo.

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

export async function generateDmReply(message: string, senderId: string): Promise<DmResult | null> {
  // Registrar mensagem e extrair perfil
  addMessage(senderId, "user", message);
  extractProfileFromMessage(senderId, message);

  const profile = getProfile(senderId);

  // Se a pessoa pede WhatsApp direto
  if (WHATSAPP_DIRECT_REGEX.test(message)) {
    const reply = "Claro! Me chama lá no WhatsApp que a gente conversa melhor 💚";
    addMessage(senderId, "assistant", reply);
    markWhatsAppOffered(senderId);
    return { reply, whatsapp: true };
  }

  try {
    // Montar historico da conversa
    const history = getHistory(senderId);
    const input: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const msg of history.slice(0, -1)) {
      input.push({ role: msg.role, content: msg.text });
    }
    input.push({ role: "user", content: message });

    // Injetar perfil e contexto no prompt
    const msgCount = getMessageCount(senderId);
    let systemPrompt = DM_PROMPT;

    const summary = profileSummary(senderId);
    if (summary) {
      systemPrompt += `\n\nPERFIL DA PESSOA:\n${summary}`;
    }

    if (msgCount >= 2 && !profile.whatsappOffered) {
      systemPrompt += `\n\nEssa é a ${msgCount}ª mensagem. Se o assunto for pessoal/saúde, ofereça WhatsApp.`;
    }
    if (profile.whatsappOffered) {
      systemPrompt += `\n\nWhatsApp JÁ FOI OFERECIDO. NÃO ofereça novamente. Continue a conversa normalmente.`;
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions: systemPrompt,
      input,
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

    // Registrar resposta e marcar whatsapp se oferecido
    addMessage(senderId, "assistant", processed);
    if (whatsapp) markWhatsAppOffered(senderId);

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
  const textSent = await sendDm(recipientId, text);
  if (!textSent) return false;

  await sendTyping(recipientId);
  await new Promise(r => setTimeout(r, 2000));

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
