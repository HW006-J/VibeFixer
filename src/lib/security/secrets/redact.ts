const PLACEHOLDER_PATTERNS = [
  /^your[-_]?/i,
  /^xxx+$/i,
  /^changeme$/i,
  /^replace[-_]?me$/i,
  /^<[^>]+>$/,
  /^example$/i,
  /^test[-_]?key$/i,
  /^dummy$/i,
  /^placeholder$/i,
  /^\*\*\*+$/,
  /^\.{3,}$/,
];

export function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.includes("process.env.")) return true;
  if (trimmed.startsWith("${") && trimmed.endsWith("}")) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed));
}

export function redactSecretValue(value: string, variableName?: string): string {
  if (variableName) {
    return `variable ${variableName}=[REDACTED]`;
  }
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "[REDACTED]";
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-3);
  return `${prefix}…${suffix} (${trimmed.length} chars)`;
}

export function looksLikePrivateKeyBlock(content: string): boolean {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content);
}

export function looksLikeHighEntropySecret(value: string): boolean {
  if (value.length < 16) return false;
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  const variety = [hasUpper, hasLower, hasDigit].filter(Boolean).length;
  return variety >= 2 && !/\s/.test(value);
}
