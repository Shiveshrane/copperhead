/**
 * Minimal arrow-key select menu for TTY prompts (no extra deps).
 * Renders an in-place "dropdown" navigable with ↑/↓ + Enter.
 */

import { copper, dim } from '../agent/theme.js';

export interface SelectItem {
  value: string;
  label: string;
  description?: string;
}

export interface SelectOptions {
  title?: string;
  items: SelectItem[];
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  /** Injected key stream for tests. */
  keys?: AsyncIterable<string>;
}

const HIDE = '\x1b[?25l';
const SHOW = '\x1b[?25h';
const CLEAR_LINE = '\r\x1b[2K';

function menuLines(title: string, items: SelectItem[], index: number): string[] {
  const width = Math.max(...items.map((i) => i.label.length), 8);
  return [
    copper(`  ${title}`),
    dim('  ↑/↓ move · Enter select · Esc cancel'),
    '',
    ...items.map((item, i) => {
      const cursor = i === index ? copper('❯') : ' ';
      const label = i === index ? copper(item.label.padEnd(width)) : dim(item.label.padEnd(width));
      const desc = item.description ? dim(`  ${item.description}`) : '';
      return `  ${cursor} ${label}${desc}`;
    }),
    '',
  ];
}

async function* stdinKeys(input: NodeJS.ReadStream): AsyncGenerator<string> {
  const wasRaw = input.isRaw;
  if (typeof input.setRawMode === 'function') input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  try {
    for await (const chunk of input) {
      const s = String(chunk);
      let i = 0;
      while (i < s.length) {
        if (s[i] === '\x1b' && s[i + 1] === '[') {
          yield s.slice(i, i + 3);
          i += 3;
          continue;
        }
        // Lone Esc
        if (s[i] === '\x1b') {
          yield '\x1b';
          i += 1;
          continue;
        }
        yield s[i]!;
        i += 1;
      }
    }
  } finally {
    if (typeof input.setRawMode === 'function') input.setRawMode(wasRaw ?? false);
  }
}

/**
 * Show a selectable list. Resolves to the chosen value, or null if cancelled.
 */
export async function selectMenu(opts: SelectOptions): Promise<string | null> {
  const items = opts.items;
  if (!items.length) return null;

  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const title = opts.title ?? 'Select';
  let index = 0;
  let lineCount = 0;

  const paint = (): void => {
    const lines = menuLines(title, items, index);
    if (lineCount > 0) {
      // Move to the first line of the previous paint and rewrite in place.
      output.write(`\x1b[${lineCount}A`);
    }
    output.write(HIDE);
    for (const line of lines) {
      output.write(CLEAR_LINE + line + '\n');
    }
    lineCount = lines.length;
  };

  const erase = (): void => {
    if (lineCount <= 0) {
      output.write(SHOW);
      return;
    }
    output.write(`\x1b[${lineCount}A`);
    for (let i = 0; i < lineCount; i++) output.write(CLEAR_LINE + (i < lineCount - 1 ? '\n' : ''));
    if (lineCount > 1) output.write(`\x1b[${lineCount - 1}A`);
    output.write('\r' + SHOW);
    lineCount = 0;
  };

  paint();

  const keys = opts.keys ?? stdinKeys(input);
  try {
    for await (const key of keys) {
      if (key === '\x03' || key === '\x1b') {
        erase();
        return null;
      }
      if (key === '\r' || key === '\n') {
        const chosen = items[index]!.value;
        erase();
        return chosen;
      }
      if (key === '\x1b[A' || key === 'k') {
        index = (index - 1 + items.length) % items.length;
        paint();
        continue;
      }
      if (key === '\x1b[B' || key === 'j') {
        index = (index + 1) % items.length;
        paint();
        continue;
      }
      if (key >= '1' && key <= '9') {
        const n = Number(key) - 1;
        if (n >= 0 && n < items.length) {
          index = n;
          paint();
        }
      }
    }
  } finally {
    erase();
  }
  return null;
}
