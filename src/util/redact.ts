/**
 * Write-time secret redaction for transcripts and summaries (AC-4.1).
 * Patterns are deliberately broad: losing a few characters of log fidelity
 * beats leaking a key.
 */
const PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._-]{16,}/g,
  // Registry and forge tokens: a transcript that quotes a publish command or a
  // failing CI log can carry these just as easily as a model API key.
  /npm_[A-Za-z0-9]{36,}/g,
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}
