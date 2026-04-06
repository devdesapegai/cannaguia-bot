interface UserProfile {
  userId: string;
  conditions: string[];
  interests: string[];
  stage: string; // "curioso", "buscando_info", "quer_tratamento", "ja_usa"
  notes: string[];
  whatsappOffered: boolean;
  updatedAt: number;
}

const profiles = new Map<string, UserProfile>();

export function getProfile(userId: string): UserProfile {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      conditions: [],
      interests: [],
      stage: "curioso",
      notes: [],
      whatsappOffered: false,
      updatedAt: Date.now(),
    };
    profiles.set(userId, profile);
  }
  return profile;
}

export function updateProfile(userId: string, updates: Partial<UserProfile>) {
  const profile = getProfile(userId);
  Object.assign(profile, updates, { updatedAt: Date.now() });
  profiles.set(userId, profile);
}

export function markWhatsAppOffered(userId: string) {
  updateProfile(userId, { whatsappOffered: true });
}

export function profileSummary(userId: string): string {
  const p = getProfile(userId);
  const parts: string[] = [];
  if (p.conditions.length) parts.push(`Condições: ${p.conditions.join(", ")}`);
  if (p.interests.length) parts.push(`Interesses: ${p.interests.join(", ")}`);
  if (p.stage !== "curioso") parts.push(`Estágio: ${p.stage}`);
  if (p.notes.length) parts.push(`Notas: ${p.notes.join("; ")}`);
  if (p.whatsappOffered) parts.push("(WhatsApp já oferecido)");
  return parts.length ? parts.join("\n") : "";
}

// Extrai info do perfil a partir da mensagem (regex simples)
const CONDITION_PATTERNS: Record<string, RegExp> = {
  ansiedade: /\bansiedade\b/i,
  depressao: /\b(depress[aã]o|depressivo)\b/i,
  insonia: /\b(ins[oô]nia|dormir|sono)\b/i,
  dor: /\b(dor cr[oô]nica|dor|fibromialgia)\b/i,
  epilepsia: /\b(epilepsia|convuls[aã]o)\b/i,
  autismo: /\b(autis|TEA)\b/i,
  cancer: /\b(c[aâ]ncer|tumor|quimio)\b/i,
  parkinson: /\bparkinson\b/i,
};

const STAGE_PATTERNS: Record<string, RegExp> = {
  quer_tratamento: /\b(quero come[cç]ar|iniciar tratamento|como come[cç]o|preciso de orienta[cç][aã]o|quero usar)\b/i,
  ja_usa: /\b(j[aá] uso|j[aá] fa[cç]o uso|meu [oó]leo|minha plantinha|cultivo em casa)\b/i,
  buscando_info: /\b(como funciona|quero saber|me explica|o que [eé]|qual [eé])\b/i,
};

export function extractProfileFromMessage(userId: string, message: string) {
  const profile = getProfile(userId);

  for (const [condition, regex] of Object.entries(CONDITION_PATTERNS)) {
    if (regex.test(message) && !profile.conditions.includes(condition)) {
      profile.conditions.push(condition);
    }
  }

  for (const [stage, regex] of Object.entries(STAGE_PATTERNS)) {
    if (regex.test(message)) {
      profile.stage = stage;
      break;
    }
  }

  if (/\b(cultiv|grow|indoor|outdoor|semente|flora|vega)\b/i.test(message)) {
    if (!profile.interests.includes("cultivo")) profile.interests.push("cultivo");
  }
  if (/\b(medicinal|tratamento|rem[eé]dio|sa[uú]de)\b/i.test(message)) {
    if (!profile.interests.includes("uso_medicinal")) profile.interests.push("uso_medicinal");
  }

  profile.updatedAt = Date.now();
  profiles.set(userId, profile);
}
