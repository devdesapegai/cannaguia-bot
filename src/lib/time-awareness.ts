function getSaoPauloHour(): number {
  const now = new Date();
  const spTime = now.toLocaleString("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  });
  return parseInt(spTime, 10);
}

export function isNightMode(): boolean {
  const hour = getSaoPauloHour();
  return hour >= 23 || hour < 7;
}

/** Retorna true se deve pular (80% de chance no modo noturno) */
export function shouldSkipNight(): boolean {
  if (!isNightMode()) return false;
  return Math.random() < 0.80;
}
