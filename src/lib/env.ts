const REQUIRED_VARS = [
  "INSTAGRAM_ACCESS_TOKEN",
  "WEBHOOK_VERIFY_TOKEN",
  "OPENAI_API_KEY",
] as const;

const OPTIONAL_VARS = [
  "INSTAGRAM_APP_SECRET",
  "OPENAI_MODEL",
] as const;

for (const v of REQUIRED_VARS) {
  if (!process.env[v]) {
    console.error(`[env] MISSING: ${v} — bot nao vai funcionar corretamente sem essa variavel`);
  }
}

for (const v of OPTIONAL_VARS) {
  if (!process.env[v]) {
    console.warn(`[env] opcional nao configurada: ${v}`);
  }
}
