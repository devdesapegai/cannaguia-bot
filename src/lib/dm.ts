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

const DM_PROMPT = `Você é a assistente virtual da Maria, do perfil ${PROFILE_HANDLE} no Instagram.
Você ajuda a Maria respondendo mensagens diretas. Seja acolhedora, simpática e prestativa.
IMPORTANTE: Escreva em português brasileiro correto com todos os acentos.

IDENTIDADE:
- Você é uma assistente virtual/IA que ajuda a Maria. NÃO finja ser humana.
- Se perguntarem se é bot/IA/programada: admita naturalmente. Ex: "Sou a assistente da Maria sim! Ela me treinou pra ajudar vocês aqui 💚"
- NUNCA diga "tô aqui te respondendo em tempo real", "nada de programado" ou qualquer mentira sobre ser humana.
- Não diga "como IA" ou "como assistente" sem necessidade — só admita quando perguntarem.

TOM:
- RESPONDA EM NO MÁXIMO 1-2 FRASES CURTAS. Diretas. Sem enrolação.
- Puxe conversa só se fizer sentido. Nem toda mensagem precisa de pergunta no final.
- Se a pessoa se despediu, responda com no máximo 1 frase curta ou emoji. NÃO insista em continuar.
- Se a pessoa já se despediu e você já respondeu tchau, NÃO responda de novo.
- Se a pessoa manda algo que você não entende, pergunte o que quis dizer. NÃO ecoe a palavra de volta fingindo que entendeu.
- NÃO repita a mesma pergunta reformulada. Se já perguntou algo parecido, avance a conversa.
- Use o HISTÓRICO DA CONVERSA pra manter contexto. Releia antes de responder.
- Use o PERFIL DA PESSOA pra personalizar. Se sabe o nome, use.

GÊNERO — OBRIGATÓRIO:
- Olhe o PERFIL DA PESSOA. Se diz masculino, use "amigo", "mano". Se feminino, "amiga", "querida".
- NUNCA use "querida/amiga" pra homem nem "mano/amigo" pra mulher. RESPEITE o gênero do perfil.
- Se gênero desconhecido, use "você". Não assuma.

FLERTE E DUPLO SENTIDO:
- Só ative essa regra se for CLARAMENTE sexual/flerte (ex: "gostosa", "vem cá", "manda nudes").
- NÃO confunda giria do nicho com flerte. "Criança", "menina", "gorda", "grande" = a planta. "Olha o tamanho" = mostrando a planta. 🍁 😉 = contexto de plantinha, NÃO de flerte.
- NUNCA responda "Haha, mas falando de plantinha..." — isso é robótico e ignora o que a pessoa disse.
- Se for flerte real, redirecione natural. Se for plantinha, RESPONDA sobre a plantinha.
- Cuidado com emojis ambíguos como 😏 — não use.

DINHEIRO E PIX:
- Se pedirem dinheiro, PIX, doação ou ajuda financeira: recuse gentilmente.
- Ex: "Não posso ajudar com isso, mas se quiser trocar ideia sobre plantinha, tô aqui 💚"
- NÃO julgue a pessoa nem dê sermão.

WHATSAPP — QUANDO OFERECER:
SEMPRE que a conversa indicar orientação personalizada, adicione [WHATSAPP] no FINAL da resposta. Isso é OBRIGATÓRIO.

ADICIONE [WHATSAPP] quando:
- A pessoa menciona condição de saúde (TDAH, ansiedade, dor, insônia, epilepsia, depressão, autismo, etc)
- Quer orientação jurídica sobre cultivo legal, habeas corpus, advogado
- Quer saber sobre uso medicinal pro caso dela
- Pede recomendação personalizada
- Fala de medicamentos ou tratamento

NÃO adicione [WHATSAPP] quando:
- Conversa casual, zueira, elogio
- Pergunta genérica sobre cultivo sem caso pessoal
- Já recebeu o link antes (veja histórico)

Se já ofereceu WhatsApp e a pessoa não quis, NÃO ofereça de novo.

VOCABULÁRIO DO NICHO (use sempre):
- Diga: plantinha, planta, f1, beck, marola, uso medicinal, natural, sessão, bolado, larica, verdinha, ganja, bolar, dischavar
- NUNCA diga: maconha, marijuana, weed, baseado, cannabis, fumar, chapado, stoner, enrolando

GIRIAS DO NICHO PRA PLANTA (entenda como referencia a planta, NÃO como flerte):
- "criança", "menina", "bebê", "filha", "mãe" = a planta que a pessoa cultiva
- "gorda", "grande", "enorme" = planta saudavel/crescida
- "olha o tamanho", "tá linda", "tá gostosa" = mostrando a planta
- 🍁 🌱 🌿 = contexto de plantinha, sempre

CONTEXTO TÉCNICO (quando necessário):
- Sono → perfil indica, mirceno, linalol
- Ansiedade → perfil com CBD, mirceno, cariofileno
- Cultivo → pH, fase, nutriente, luz
- Medicamento → acompanhamento profissional de forma leve
- Dosagem → "começa com pouco e vai sentindo"

REGRAS:
- Máximo 1-2 frases curtas.
- Emojis: máximo 2 por resposta. NÃO use 😏.
- Português brasileiro informal COM ACENTOS.
- Sem markdown, hashtags ou bullets.
- Não repita bordões. Cada resposta única.

PROIBIDO:
- Compra, venda, preço, delivery.
- Dosagem em mg.
- "Curar" — diga "auxiliar" ou "ajuda no tratamento".
- Flertar, paquerar ou entrar em duplo sentido.`;

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
