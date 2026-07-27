/**
 * Subtle interactive-TTY chrome: muted hierarchy with a copper accent.
 * Plain / --json / piped output must stay free of SGR (AC-8.9), so helpers
 * no-op unless color has been explicitly enabled for this process.
 */

const ESC = '\x1b[';
const RESET = `${ESC}0m`;

/** True after makeRenderer selects the interactive path. */
let colorEnabled = false;

export function setColorEnabled(on: boolean): void {
  colorEnabled = on;
}

export function isColorEnabled(): boolean {
  return colorEnabled;
}

function paint(code: string, s: string): string {
  if (!colorEnabled || s === '') return s;
  return `${ESC}${code}m${s}${RESET}`;
}

/** Secondary metadata — dim gray. */
export const dim = (s: string): string => paint('90', s);
/** Primary content — bright white (typed input, key values). */
export const bright = (s: string): string => paint('97', s);
/** Brand/title emphasis — bold bright white. */
export const bold = (s: string): string => paint('1;97', s);
/** Brand / active accent — copper #b87333 ≈ 256-color 172. */
export const copper = (s: string): string => paint('38;5;172', s);
/** Success — PCB green. */
export const ok = (s: string): string => paint('32', s);
/** Busy / caution — amber. */
export const warn = (s: string): string => paint('33', s);
/** Failure. */
export const err = (s: string): string => paint('31', s);

/**
 * Style a create-pipeline stage line. Keeps the `stage <name>:` prefix so
 * existing log greps and operator muscle memory still work.
 */
export function stageLine(name: string, detail: string, kind: 'info' | 'ok' | 'warn' | 'err' = 'info'): string {
  const label = dim(`stage ${name}:`);
  const body =
    kind === 'ok' ? ok(detail) : kind === 'warn' ? warn(detail) : kind === 'err' ? err(detail) : detail;
  return `${label} ${body}`;
}

/** Tool-result scrollback line: short glyph + name + first line of result. */
export function toolLine(name: string, firstLine: string): string {
  const clean = /\b(clean|ok|pass(?:ed)?|success|done)\b/i.test(firstLine) && !/\b(fail|error|violat)/i.test(firstLine);
  const glyph = clean ? ok('✓') : copper('▸');
  return `  ${glyph} ${dim(name)}  ${firstLine}`;
}

/** Color the final outcome line from its exit-path token. */
export function styleOutcome(line: string): string {
  if (!colorEnabled) return line;
  const head = line.split(' · ')[0] ?? line;
  const rest = line.slice(head.length);
  if (head === 'done') return ok(head) + dim(rest);
  if (/refus|fail|error|exhaust|stall/i.test(head)) return err(head) + dim(rest);
  return copper(head) + dim(rest);
}

/** Dim secondary segments of the two-line CLI header (brand stays copper). */
export function styleHeaderLines(lines: string[]): string[] {
  if (!colorEnabled) return lines;
  return lines.map((line, i) => {
    if (i === 0) {
      // copperhead vX · rest…
      const m = line.match(/^(copperhead v\S+)(.*)$/);
      if (!m) return dim(line);
      return copper(m[1]!) + dim(m[2]!);
    }
    return dim(line);
  });
}
