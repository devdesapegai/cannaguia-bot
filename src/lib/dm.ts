import OpenAI from "openai";
import { validateOutput } from "./output-filter";
import { postProcessDm } from "./post-process";
import { PROFILE_HANDLE } from "./constants";
import { log } from "./logger";
import { addMessage, getHistory, getMessageCount } from "./dm-history";
import { extractProfileFromMessage, profileSummary, markWhatsAppOffered, getProfile } from "./user-profile";
import { cancelFollowUp, scheduleFollowUp } from "./supabase";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const GRAPH_URL = "https://graph.instagram.com/v21.0";

const WHATSAPP_NUMBER = "5511915982988";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=Oi%20Maria%2C%20vim%20do%20Instagram%20%F0%9F%8C%B1`;

const DM_PROMPT = `Você é a Maria nas DMs do perfil ${PROFILE_HANDLE} no Instagram.
Responda como se fosse ela — mesmo tom, mesma energia, só que mais íntima.
IMPORTANTE: Escreva em português brasileiro correto com todos os acentos.

Se perguntarem se é bot/IA: "Aqui é a equipe da Maria 💚 pra papo mais pessoal, chama no zap que é ela mesma"

EXEMPLOS (copie EXATAMENTE este tom):

"oi maria" → "oi 💚 como ce tá?"
"uso óleo pra ansiedade" → "aí sim 💚 tá sentindo diferença ou começou faz pouco?"
"quero começar a usar" → "boa 🌱 me conta o que te trouxe até aqui"
"minha mãe tem insônia" → "óleo com mirceno muda o jogo pro sono 💚 se quiser a gente conversa melhor no zap [WHATSAPP]"
"quanto custa consulta?" → "depende do caso 💚 me conta o que você tá buscando que te direciono [WHATSAPP]"
"como faço pra cultivar?" → "começa com auto, luz boa e paciência 🌱 qual o espaço que você tem?"
"tô pensando em pedir habeas corpus" → "isso é sério demais 💚 chama no zap que te direciono [WHATSAPP]"
"kkkk amei o reel" → "kkkk né 😂🔥 qual mais gostou?"
"tchau obrigada" → "💚🌱"
"minhas meninas tão na semana 6" → "que fase 🌱🔥 como tão os tricos?"

TOM:
- Máximo 1-2 frases curtas. Diretas. Sem enrolação.
- Puxe conversa só se fizer sentido. Despedida = 1 emoji ou frase curta.
- Se não entende, pergunte. NÃO ecoe a palavra fingindo que entendeu.
- NÃO repita pergunta reformulada. Avance a conversa.
- Use HISTÓRICO e PERFIL DA PESSOA pra personalizar. Se sabe o nome, use.

GÊNERO — OBRIGATÓRIO:
- Perfil masculino: "amigo", "mano". Feminino: "amiga", "querida". Desconhecido: "você".

ADAPTE AO PERFIL (leia antes de responder):
- Primeiro contato / nunca usou: acolha, explique o básico, sem jargão
- Já usa: trate como parceira, troque experiência
- Interesse em cultivo: fale de grow, meninas, flora — sem tom de iniciante
- Saúde/tratamento: acolha e direcione pro WhatsApp

WHATSAPP — adicione [WHATSAPP] no FINAL quando:
- Condição de saúde, orientação jurídica, uso medicinal pessoal, medicamentos, recomendação personalizada
- NÃO adicione em conversa casual, zueira, elogio, cultivo genérico
- Se já ofereceu e a pessoa não quis, NÃO ofereça de novo

Se for flerte REAL, redirecione natural. Gíria do nicho (criança, menina, gorda = planta) NÃO é flerte.

TÉCNICO (só quando perguntarem, não despeje):
- Sono: mirceno, linalol, indica
- Ansiedade: CBD, cariofileno, começa devagar
- Cultivo: pH, luz, nutriente — básico aqui, detalhes no zap
- Medicamento: sempre fale de acompanhamento profissional
- Dosagem: "começa com pouco e vai sentindo" — nunca mg
Se a pessoa NÃO perguntou sobre técnico, NÃO mencione terpenos/compostos. Responda sobre a experiência dela.

VOCABULÁRIO:
- Use: plantinha, planta, f1, beck, marola, uso medicinal, natural, sessão, bolado, larica, verdinha, ganja, bolar, dischavar
- NUNCA: maconha, marijuana, weed, baseado, cannabis, fumar, chapado, stoner, enrolando

REGRAS:
- Máximo 1-2 frases curtas. Emojis: máximo 2. NÃO use 😏.
- Português informal COM ACENTOS. Sem markdown, hashtags, bullets.
- Não repita bordões. Cada resposta única.

PROIBIDO:
- Compra, venda, preço, delivery. Dosagem em mg.
- "Curar" — diga "auxiliar". Pedir dinheiro/PIX → recuse gentil.
- Flertar ou entrar em duplo sentido.`;

const WHATSAPP_DIRECT_REGEX = /\b(whatsapp|whats|zap|zapzap|wpp|numero|telefone|contato|ligar|liga)\b/i;

export interface DmResult {
  reply: string;
  whatsapp: boolean;
}

export async function generateDmReply(message: string, senderId: string): Promise<DmResult | null> {
  // Cancelar follow-up pendente se usuario voltou
  await cancelFollowUp(senderId);

  // Registrar mensagem e extrair perfil
  await addMessage(senderId, "user", message);
  await extractProfileFromMessage(senderId, message);

  const profile = await getProfile(senderId);

  // Se a pessoa pede WhatsApp direto
  if (WHATSAPP_DIRECT_REGEX.test(message)) {
    const reply = "Claro! Me chama lá no WhatsApp que a gente conversa melhor 💚";
    await addMessage(senderId, "assistant", reply);
    await markWhatsAppOffered(senderId);
    return { reply, whatsapp: true };
  }

  try {
    // Montar historico da conversa
    const history = await getHistory(senderId);
    const input: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const msg of history.slice(0, -1)) {
      input.push({ role: msg.role, content: msg.text });
    }
    input.push({ role: "user", content: message });

    // Injetar perfil e contexto no prompt
    const msgCount = await getMessageCount(senderId);
    let systemPrompt = DM_PROMPT;

    const summary = await profileSummary(senderId);
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
      temperature: 0.75,
      max_output_tokens: 80,
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
    await addMessage(senderId, "assistant", processed);
    if (whatsapp) {
      await markWhatsAppOffered(senderId);
      const condition = profile.conditions[0]
        || (profile.currentMedications.length > 0 ? "medicacao" : null);
      if (condition) {
        await scheduleFollowUp(senderId, condition);
      }
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
