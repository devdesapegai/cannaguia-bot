const EMOJI_REGEX = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;

export type EnergyLevel = "high" | "medium" | "low";

export function detectEnergy(comment: string): EnergyLevel {
  const emojis = comment.match(EMOJI_REGEX) || [];
  const hasKKKK = /k{4,}/i.test(comment);
  const hasCaps = (comment.match(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/g) || []).length >= 2;
  const exclamations = (comment.match(/!/g) || []).length;

  if (emojis.length >= 3 || hasKKKK || hasCaps || exclamations >= 2) {
    return "high";
  }

  if (comment.length < 20 && emojis.length === 0 && !hasKKKK && exclamations === 0) {
    return "low";
  }

  return "medium";
}

export function energyInstruction(level: EnergyLevel): string {
  switch (level) {
    case "high":
      return "\n(Energia do comentário: ALTA — responda com a mesma energia, use KKKK, emojis, caps se quiser)";
    case "low":
      return "\n(Energia do comentário: BAIXA — responda de forma calma e curta, poucos emojis)";
    default:
      return "";
  }
}
