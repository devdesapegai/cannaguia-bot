const BANNED_PATTERNS = [
  /\bmaconha\b/i, /\bmarijuana\b/i, /\bweed\b/i,
  /\bbaseado\b/i, /\bcannabis\b/i,
  /\bfumar\b/i, /\bchapado\b/i,
  /\bstoner\b/i, /\b420\b/i,
  /\bcomprar\b/i, /\bcompre\b/i, /\bvender\b/i, /\bvenda\b/i,
  /\bpreco\b/i, /\bpreço\b/i,
  /\bdelivery\b/i, /\bentrega\b/i, /\bpix\b/i,
  /\bcurar\b/i, /\bprescrevo\b/i, /\breceito\b/i,
  /mg\/kg/i, /mg por kg/i, /\bmiligrama\b/i,
];

export function validateOutput(text: string): { safe: boolean; flagged: string[] } {
  const flagged = BANNED_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((p) => p.source);
  return { safe: flagged.length === 0, flagged };
}
