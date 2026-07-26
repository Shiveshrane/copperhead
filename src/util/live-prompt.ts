/**
 * TTY line prompt with live slash-command suggestions.
 * Typing `/` immediately shows matching commands under the caret; ↑/↓ + Enter
 * picks one — no need to press Enter on bare `/` first.
 */

import { copper, dim } from '../agent/theme.js';
import { pulsePrompt } from '../agent/animate.js';
import type { SelectItem } from './select.js';

export interface LivePromptOptions {
  prompt: string;
  /** Optional pulsing prompt frames (phase 0..n). */
  promptFrame?: (phase: number) => string;
  commands: SelectItem[];
  output?: NodeJS.WriteStream;
  /** Next keypress; null means EOF. */
  readKey: () => Promise<string | null>;
  /**
   * Sync drain of already-queued printable chars (paste coalescing).
   * Without this, a long paste repaints once per character and wrap debris
   * stacks into many fake prompt lines.
   */
  drainPrintable?: () => string;
}

const CLEAR_LINE = '\r\x1b[2K';
const HIDE = '\x1b[?25l';
const SHOW = '\x1b[?25h';
/** Inverse video for the hovered dropdown row. */
const INVERSE = '\x1b[7m';
const RESET = '\x1b[0m';

/** Visible width ignoring SGR; used for wrap-row accounting. */
export function visibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** How many terminal rows `prompt + buffer` occupies at `cols` width. */
export function inputRowRows(prompt: string, buffer: string, cols: number): number {
  const w = Math.max(1, cols || 80);
  return Math.max(1, Math.ceil(visibleLen(prompt + buffer) / w));
}

function matchesFor(buffer: string, commands: SelectItem[]): SelectItem[] {
  if (!buffer.startsWith('/')) return [];
  const p = buffer.toLowerCase();
  if (p === '/') return commands;
  return commands.filter((c) => c.value.startsWith(p));
}

/** Visible slash-menu lines (exported for tests). */
export function suggestionLines(matches: SelectItem[], index: number): string[] {
  if (!matches.length) return [dim('  (no matching commands)')];
  const clamped = Math.max(0, Math.min(index, matches.length - 1));
  const selected = matches[clamped]!;
  const width = Math.max(...matches.map((m) => m.label.length), 8);

  const detail: string[] = [];
  if (selected.description) {
    detail.push(dim('  ────────────────────────────────────────'));
    detail.push(`  ${copper(selected.label)}  ${selected.description}`);
  } else {
    detail.push(`  ${copper(selected.label)}`);
  }

  return [
    ...detail,
    '',
    dim('  ↑/↓ hover · Enter select · Esc dismiss'),
    ...matches.map((item, i) => {
      const hovered = i === clamped;
      const cursor = hovered ? copper('❯') : ' ';
      const label = item.label.padEnd(width);
      if (hovered) {
        return `  ${cursor} ${INVERSE}${copper(label)}${RESET}`;
      }
      return `  ${cursor} ${dim(label)}`;
    }),
  ];
}

/** Normalize arrow key aliases (CSI + SS3) to a small set. */
export function normalizeNavKey(key: string): string {
  // CSI: \x1b[A  SS3: \x1bOA  (common across terminals / tmux)
  if (key === '\x1b[A' || key === '\x1bOA' || key === '\x1b[1;2A') return 'up';
  if (key === '\x1b[B' || key === '\x1bOB' || key === '\x1b[1;2B') return 'down';
  if (key === '\x1b[C' || key === '\x1bOC') return 'right';
  if (key === '\x1b[D' || key === '\x1bOD') return 'left';
  return key;
}

/**
 * Push bytes through an escape-sequence assembler. Handles arrows that arrive
 * split across reads (`\x1b` then `[A`) — otherwise a lone ESC clears the menu.
 */
export function pushKeys(pending: { buf: string }, chunk: string, emit: (key: string) => void): void {
  pending.buf += chunk;
  while (pending.buf.length) {
    const s = pending.buf;
    if (s[0] !== '\x1b') {
      emit(s[0]!);
      pending.buf = s.slice(1);
      continue;
    }
    // Incomplete ESC — wait for more bytes.
    if (s.length === 1) return;

    // SS3: ESC O A/B/C/D
    if (s[1] === 'O') {
      if (s.length < 3) return;
      emit(s.slice(0, 3));
      pending.buf = s.slice(3);
      continue;
    }

    // CSI: ESC [ … letter
    if (s[1] === '[') {
      // Need at least ESC [ X
      if (s.length < 3) return;
      // Consume until a final byte (@-~) for longer sequences (e.g. \x1b[1;2A)
      let j = 2;
      while (j < s.length && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) < 0x40) j++;
      if (j >= s.length) return; // incomplete
      emit(s.slice(0, j + 1));
      pending.buf = s.slice(j + 1);
      continue;
    }

    // Lone ESC (or ESC + non-CSI) — emit Esc
    emit('\x1b');
    pending.buf = s.slice(1);
  }
}

/**
 * Session-long key reader. Keeps the stream alive across many prompts
 * (unlike `for await` of a Readable, which destroys it on exit).
 */
export class KeyReader {
  private readonly queue: string[] = [];
  private readonly waiters: Array<(v: string | null) => void> = [];
  private ended = false;
  private paused = false;
  private readonly wasRaw: boolean | undefined;
  private readonly pending = { buf: '' };
  private readonly onData: (c: string | Buffer) => void;
  private readonly onEnd: () => void;

  constructor(private readonly input: NodeJS.ReadStream) {
    this.wasRaw = input.isRaw;
    if (typeof input.setRawMode === 'function') input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    this.onData = (c: string | Buffer): void => {
      // While paused (agent run in flight), let the OS deliver Ctrl+C as SIGINT
      // instead of queuing \x03 — otherwise the user cannot interrupt a turn.
      if (this.paused) return;
      pushKeys(this.pending, String(c), (key) => {
        const waiter = this.waiters.shift();
        if (waiter) waiter(key);
        else this.queue.push(key);
      });
    };
    this.onEnd = (): void => {
      // Flush a dangling ESC if the stream ends mid-sequence.
      if (this.pending.buf) {
        for (const ch of this.pending.buf) {
          const waiter = this.waiters.shift();
          if (waiter) waiter(ch);
          else this.queue.push(ch);
        }
        this.pending.buf = '';
      }
      this.ended = true;
      while (this.waiters.length) this.waiters.shift()!(null);
    };

    input.on('data', this.onData);
    input.on('end', this.onEnd);
  }

  async next(): Promise<string | null> {
    if (this.queue.length) return this.queue.shift()!;
    if (this.ended) return null;
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Sync: pull every already-queued printable character (paste batch). */
  drainPrintable(): string {
    let out = '';
    while (this.queue.length) {
      const k = this.queue[0]!;
      if (k.length === 1 && k >= ' ') {
        out += this.queue.shift();
      } else {
        break;
      }
    }
    return out;
  }

  /**
   * Release raw mode so Ctrl+C becomes SIGINT again (needed while an agent
   * turn owns the terminal). Drop any typed-ahead keys.
   */
  pause(): void {
    this.paused = true;
    this.queue.length = 0;
    this.pending.buf = '';
    if (typeof this.input.setRawMode === 'function') this.input.setRawMode(false);
  }

  /** Re-enter raw mode for the next prompt. */
  resume(): void {
    this.paused = false;
    if (typeof this.input.setRawMode === 'function') this.input.setRawMode(true);
    this.input.resume();
  }

  close(): void {
    this.input.off('data', this.onData);
    this.input.off('end', this.onEnd);
    this.ended = true;
    this.paused = true;
    while (this.waiters.length) this.waiters.shift()!(null);
    if (typeof this.input.setRawMode === 'function') {
      this.input.setRawMode(this.wasRaw ?? false);
    }
  }
}

/** Tiny key source for unit tests. */
export function keySequence(keys: string[]): () => Promise<string | null> {
  let i = 0;
  return async () => (i < keys.length ? keys[i++]! : null);
}

/**
 * Read one line. When the buffer starts with `/`, live suggestions appear
 * underneath. Returns the submitted line, a selected slash command, or null
 * on Ctrl+C / EOF.
 */
export async function promptWithSlashHints(opts: LivePromptOptions): Promise<string | null> {
  const output = opts.output ?? process.stdout;
  let buffer = '';
  let index = 0;
  let paintedExtra = 0;
  /** Rows occupied by the prompt+buffer (terminal wrap). */
  let paintedInputRows = 1;

  const cols = (): number =>
    typeof (output as NodeJS.WriteStream).columns === 'number' && (output as NodeJS.WriteStream).columns!
      ? (output as NodeJS.WriteStream).columns!
      : 80;

  const eraseExtra = (): void => {
    if (paintedExtra <= 0) return;
    for (let i = 0; i < paintedExtra; i++) output.write('\n' + CLEAR_LINE);
    output.write(`\x1b[${paintedExtra}A`);
    paintedExtra = 0;
  };

  /** Clear prompt+buffer including soft-wrapped continuation rows. */
  const clearInputSurface = (): void => {
    if (paintedInputRows > 1) output.write(`\x1b[${paintedInputRows - 1}A`);
    for (let i = 0; i < paintedInputRows; i++) {
      output.write(CLEAR_LINE);
      if (i < paintedInputRows - 1) output.write('\n');
    }
    if (paintedInputRows > 1) output.write(`\x1b[${paintedInputRows - 1}A`);
  };

  const writeInput = (): void => {
    const text = opts.prompt + buffer;
    output.write(CLEAR_LINE + text + SHOW);
    paintedInputRows = inputRowRows(opts.prompt, buffer, cols());
  };

  const paint = (): void => {
    const matches = matchesFor(buffer, opts.commands);
    if (index >= matches.length) index = Math.max(0, matches.length - 1);

    eraseExtra();
    clearInputSurface();
    writeInput();

    if (buffer.startsWith('/')) {
      const lines = suggestionLines(matches, index);
      output.write(HIDE);
      for (const line of lines) output.write('\n' + CLEAR_LINE + line);
      paintedExtra = lines.length;
      // Back to the last physical row of the input (immediately above suggestions).
      output.write(`\x1b[${paintedExtra}A`);
      clearInputSurface();
      writeInput();
    }
  };

  const finish = (value: string | null): string | null => {
    eraseExtra();
    clearInputSurface();
    // Commit the final value onto the prompt line so scrollback shows what
    // actually ran (e.g. `/demo` after picking from the bare-`/` dropdown),
    // not just the typed prefix.
    if (value !== null) {
      output.write(CLEAR_LINE + opts.prompt + value);
    }
    output.write('\n' + SHOW);
    return value;
  };

  paint();

  try {
    for (;;) {
      // Pulse the chevron while idle at an empty prompt (no dropdown open).
      let stopPulse: (() => void) | null = null;
      if (buffer === '' && opts.promptFrame) {
        const frameOf = opts.promptFrame;
        stopPulse = pulsePrompt(output, (phase) => frameOf(phase));
      }
      const raw = await opts.readKey();
      stopPulse?.();
      if (raw === null) return finish(null);
      const key = normalizeNavKey(raw);

      if (key === '\x03') return finish(null);
      if (key === '\x04' && buffer === '') return finish(null);

      if (key === '\r' || key === '\n') {
        const matches = matchesFor(buffer, opts.commands);
        if (buffer.startsWith('/') && matches.length > 0) {
          return finish(matches[index]!.value);
        }
        return finish(buffer);
      }

      if (key === '\x1b') {
        if (buffer.startsWith('/')) {
          buffer = '';
          index = 0;
          paint();
        }
        continue;
      }

      // Arrows (and j/k while the dropdown is open) move the hover highlight.
      const navUp =
        key === 'up' || key === 'left' || (buffer.startsWith('/') && raw === 'k');
      const navDown =
        key === 'down' || key === 'right' || (buffer.startsWith('/') && raw === 'j');
      if (navUp || navDown) {
        const matches = matchesFor(buffer, opts.commands);
        if (matches.length) {
          index = navUp
            ? (index - 1 + matches.length) % matches.length
            : (index + 1) % matches.length;
          paint();
        }
        continue;
      }

      if (key === '\t') {
        const matches = matchesFor(buffer, opts.commands);
        if (matches.length >= 1) {
          buffer = matches[index]!.value;
          paint();
        }
        continue;
      }

      if (key === '\x7f' || key === '\b') {
        if (buffer.length) {
          buffer = buffer.slice(0, -1);
          index = 0;
          paint();
        }
        continue;
      }

      if (key === '\x15') {
        buffer = '';
        index = 0;
        paint();
        continue;
      }

      // When suggestions are open, j/k navigate (already normalized). Printable
      // letters that aren't nav still type into the filter. Coalesce paste so
      // we paint once per burst instead of once per character.
      if (key.length === 1 && key >= ' ') {
        buffer += key;
        if (opts.drainPrintable) buffer += opts.drainPrintable();
        index = 0;
        paint();
      }
    }
  } finally {
    eraseExtra();
    output.write(SHOW);
  }
}
