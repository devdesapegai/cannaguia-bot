import { pool } from "./supabase";

export interface UserProfile {
  userId: string;
  name: string | null;
  gender: "m" | "f" | null;
  age: number | null;
  weight: string | null;
  conditions: string[];
  currentMedications: string[];
  cannabisUse: "nao_usa" | "ja_usa" | "quer_comecar" | "ja_usou" | null;
  cannabisProducts: string[]; // oleo, flor, fitinho, etc
  interests: string[];
  stage: "curioso" | "buscando_info" | "quer_tratamento" | "ja_usa";
  whatsappOffered: boolean;
  updatedAt: number;
}

function defaultProfile(userId: string): UserProfile {
  return {
    userId,
    name: null,
    gender: null,
    age: null,
    weight: null,
    conditions: [],
    currentMedications: [],
    cannabisUse: null,
    cannabisProducts: [],
    interests: [],
    stage: "curioso",
    whatsappOffered: false,
    updatedAt: Date.now(),
  };
}

export async function getProfile(userId: string): Promise<UserProfile> {
  try {
    const { rows } = await pool.query(
      `SELECT profile_data FROM user_profiles WHERE user_id = $1`,
      [userId],
    );
    if (rows.length > 0 && rows[0].profile_data) {
      return { ...defaultProfile(userId), ...rows[0].profile_data, userId };
    }
  } catch {}
  return defaultProfile(userId);
}

export async function updateProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
  try {
    const current = await getProfile(userId);
    const merged = { ...current, ...updates, updatedAt: Date.now() };
    await pool.query(
      `INSERT INTO user_profiles (user_id, profile_data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         profile_data = $2::jsonb,
         updated_at = now()`,
      [userId, JSON.stringify(merged)],
    );
  } catch (e) {
    console.error("[user-profile] updateProfile error:", e);
  }
}

export async function markWhatsAppOffered(userId: string): Promise<void> {
  await updateProfile(userId, { whatsappOffered: true });
}

export async function profileSummary(userId: string): Promise<string> {
  const p = await getProfile(userId);
  const parts: string[] = [];
  if (p.name) parts.push(`Nome: ${p.name}`);
  if (p.gender) parts.push(`Gênero: ${p.gender === "f" ? "feminino" : "masculino"}`);
  if (p.age) parts.push(`Idade: ${p.age}`);
  if (p.weight) parts.push(`Peso: ${p.weight}`);
  if (p.conditions.length) parts.push(`Condições: ${p.conditions.join(", ")}`);
  if (p.currentMedications.length) parts.push(`Medicamentos atuais: ${p.currentMedications.join(", ")}`);
  if (p.cannabisUse) {
    const labels: Record<string, string> = {
      nao_usa: "nunca usou",
      ja_usa: "já usa",
      quer_comecar: "quer começar",
      ja_usou: "já usou mas parou",
    };
    parts.push(`Uso de plantinha: ${labels[p.cannabisUse]}`);
  }
  if (p.cannabisProducts.length) parts.push(`Produtos: ${p.cannabisProducts.join(", ")}`);
  if (p.interests.length) parts.push(`Interesses: ${p.interests.join(", ")}`);
  if (p.stage !== "curioso") parts.push(`Estágio: ${p.stage}`);
  if (p.whatsappOffered) parts.push("(WhatsApp já oferecido)");
  return parts.length ? parts.join("\n") : "";
}

function addUnique(arr: string[], value: string) {
  if (!arr.includes(value)) arr.push(value);
}

export async function extractProfileFromMessage(userId: string, message: string): Promise<void> {
  const profile = await getProfile(userId);
  const lower = message.toLowerCase();

  // Nome
  const nameMatch = message.match(/(?:me chamo|meu nome [eé]|sou (?:o |a )?|pode me chamar de )(\w+)/i);
  if (nameMatch) profile.name = nameMatch[1];

  // Genero
  if (/\b(sou mulher|sou m[aã]e|gestante|gr[aá]vida|minha filha)\b/i.test(message)) profile.gender = "f";
  if (/\b(sou homem|sou pai|meu filho)\b/i.test(message)) profile.gender = "m";
  if (!profile.gender && /\b(obrigada|cansada|animada|preocupada)\b/i.test(message)) profile.gender = "f";
  if (!profile.gender && /\b(obrigado|cansado|animado|preocupado)\b/i.test(message)) profile.gender = "m";

  // Idade
  const ageMatch = message.match(/\b(\d{1,2})\s*anos\b/i);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if (age >= 10 && age <= 99) profile.age = age;
  }

  // Peso
  const weightMatch = message.match(/\b(\d{2,3})\s*(?:kg|quilos?|kilos?)\b/i);
  if (weightMatch) profile.weight = `${weightMatch[1]}kg`;

  // Condicoes de saude
  const conditionMap: Record<string, RegExp> = {
    ansiedade: /\bansiedade\b/i,
    depressao: /\b(depress[aã]o|depressiv[oa])\b/i,
    insonia: /\b(ins[oô]nia|n[aã]o consigo dormir|problema.* sono)\b/i,
    dor: /\b(dor cr[oô]nica|dor|fibromialgia)\b/i,
    epilepsia: /\b(epilepsia|convuls[aã]o)\b/i,
    autismo: /\b(autis|TEA)\b/i,
    cancer: /\b(c[aâ]ncer|tumor|quimio)\b/i,
    parkinson: /\bparkinson\b/i,
    enxaqueca: /\b(enxaqueca|migr[aâ]nea)\b/i,
    tdah: /\b(tdah|tdh|d[eé]ficit de aten[cç][aã]o)\b/i,
    estresse: /\b(estress|stress)\b/i,
  };

  for (const [condition, regex] of Object.entries(conditionMap)) {
    if (regex.test(message)) addUnique(profile.conditions, condition);
  }

  // Medicamentos
  const medMatch = message.match(/\b(?:tomo|uso|fa[cç]o uso de|tomando)\s+(.+?)(?:\.|,|$)/i);
  if (medMatch) {
    const meds = medMatch[1].split(/[,e]/).map(m => m.trim()).filter(m => m.length > 2 && m.length < 30);
    for (const med of meds) addUnique(profile.currentMedications, med);
  }

  // Uso de cannabis
  if (/\b(j[aá] uso|j[aá] fa[cç]o uso|uso h[aá]|tenho meu [oó]leo|minha plantinha|cultivo)\b/i.test(lower)) {
    profile.cannabisUse = "ja_usa";
  } else if (/\b(quero come[cç]ar|como come[cç]o|quero iniciar|penso em usar|pensando em)\b/i.test(lower)) {
    profile.cannabisUse = "quer_comecar";
  } else if (/\b(j[aá] usei|parei|usei.*tempo|fazia uso)\b/i.test(lower)) {
    profile.cannabisUse = "ja_usou";
  } else if (/\b(nunca usei|n[aã]o uso|n[aã]o conhe[cç]o|primeiro contato)\b/i.test(lower)) {
    profile.cannabisUse = "nao_usa";
  }

  // Produtos cannabis
  if (/\b([oó]leo|oil)\b/i.test(message)) addUnique(profile.cannabisProducts, "óleo");
  if (/\b(flor|bud|prensad)\b/i.test(message)) addUnique(profile.cannabisProducts, "flor");
  if (/\b(vape|vaporizador)\b/i.test(message)) addUnique(profile.cannabisProducts, "vape");
  if (/\b(comest[ií]vel|edible|bolo|brownie)\b/i.test(message)) addUnique(profile.cannabisProducts, "comestível");
  if (/\b(pomada|t[oó]pico|creme)\b/i.test(message)) addUnique(profile.cannabisProducts, "tópico");

  // Interesses
  if (/\b(cultiv|grow|indoor|outdoor|semente|flora|vega)\b/i.test(message)) addUnique(profile.interests, "cultivo");
  if (/\b(medicinal|tratamento|rem[eé]dio|sa[uú]de|terap)\b/i.test(message)) addUnique(profile.interests, "uso_medicinal");
  if (/\b(recreativ|lazer|sess[aã]o|fitinho)\b/i.test(message)) addUnique(profile.interests, "recreativo");

  // Estagio
  if (/\b(quero come[cç]ar|iniciar tratamento|como come[cç]o|preciso de orienta[cç][aã]o|quero usar)\b/i.test(lower)) {
    profile.stage = "quer_tratamento";
  } else if (/\b(j[aá] uso|j[aá] fa[cç]o uso|meu [oó]leo|minha plantinha|cultivo em casa)\b/i.test(lower)) {
    profile.stage = "ja_usa";
  } else if (/\b(como funciona|quero saber|me explica|o que [eé]|qual [eé])\b/i.test(lower)) {
    profile.stage = "buscando_info";
  }

  await updateProfile(userId, profile);
}
