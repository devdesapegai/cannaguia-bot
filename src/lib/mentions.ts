import OpenAI from "openai";
import { validateOutput } from "./output-filter";
import { postProcess } from "./post-process";
import { PROFILE_HANDLE } from "./constants";
import { log } from "./logger";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const GRAPH_URL = "https://graph.instagram.com/v21.0";

const MENTION_PROMPT = `Você é a Maria, do perfil ${PROFILE_HANDLE} no Instagram.
Alguém te marcou em uma publicação. Você vai comentar nessa publicação.
IMPORTANTE: Escreva em português brasileiro correto com todos os acentos.

Analise a legenda do post pra entender o contexto e responda de acordo:
- Se a pessoa te indicou/recomendou → agradeça com carinho e energia
- Se a pessoa fez post sobre plantinha/uso medicinal → comente com conhecimento
- Se a pessoa compartilhou relato pessoal → acolha com empatia
- Se é zueira/meme → entre na vibe
- Se não tem contexto claro → agradeça a marcação de forma simpática

REGRAS:
- 1 frase + gancho curto. Máximo 2 frases.
- Emojis: máximo 2-3 por resposta.
- Português brasileiro informal COM ACENTOS.
- Sem markdown, hashtags, bullets ou aspas.
- Comece mencionando @usuario pra pessoa saber que viu.
- Não repita bordões. Cada resposta única.

VOCABULÁRIO DO NICHO (use sempre):
- Diga: plantinha, planta, f1, fitinho, uso medicinal, natural, sessão
- NUNCA diga: maconha, marijuana, weed, erva, baseado, beck, cannabis, fumar, chapado, brisa, larica, 420, stoner

PROIBIDO:
- Compra, venda, preço, delivery.
- Dosagem em mg.
- "Curar" — diga "auxiliar" ou "ajuda no tratamento".
- Flertar ou paquerar.
- "Como assistente" ou "como IA".`;

export async function generateMentionReply(caption: string, username: string): Promise<string | null> {
  try {
    let userMessage = "";
    if (caption) userMessage += `Legenda do post: "${caption.slice(0, 300)}"\n`;
    userMessage += `Marcado por: @${username}`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      instructions: MENTION_PROMPT,
      input: userMessage,
      temperature: 0.9,
      max_output_tokens: 80,
    });

    const raw = response.output_text?.trim();
    if (!raw) return null;

    const processed = postProcess(raw);
    const { safe, flagged } = validateOutput(processed);
    if (!safe) {
      console.warn(`[mention] Flagged: ${flagged.join(", ")}`);
      return null;
    }

    return processed;
  } catch (error) {
    console.error("[mention] Error:", error);
    return null;
  }
}

export async function commentOnMedia(mediaId: string, message: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    log("error", { error: "INSTAGRAM_ACCESS_TOKEN not set" });
    return false;
  }

  try {
    const res = await fetch(`${GRAPH_URL}/${mediaId}/comments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      log("error", { error: `Comment API error: ${errorText.slice(0, 200)}` });
      return false;
    }

    return true;
  } catch (error) {
    log("error", { error: `Comment send error: ${String(error)}` });
    return false;
  }
}

export async function getMentionMediaInfo(mediaId: string): Promise<{ caption: string; username: string } | null> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`${GRAPH_URL}/${mediaId}?fields=caption,username`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { caption: data.caption || "", username: data.username || "" };
  } catch {
    return null;
  }
}
