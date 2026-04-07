/**
 * Gera delay com distribuicao log-normal.
 * Mediana ~90s, range 30-300s.
 * Mais natural que distribuicao uniforme.
 */
export function calculateDelay(): number {
  // Box-Muller transform pra gerar normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  const medianSec = 60;
  const sigma = 0.4;
  const seconds = Math.exp(Math.log(medianSec) + sigma * z);

  // Clamp entre 30s e 180s (3min)
  const clamped = Math.max(30, Math.min(180, seconds));
  return Math.round(clamped * 1000);
}

/** Threshold pra decidir se faz inline ou enfileira */
export const INLINE_DELAY_MAX = 45_000; // 45s — cabe no Vercel 60s
