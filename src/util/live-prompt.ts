/**
 * Dock-based line prompt with live slash-command suggestions.
 * The input renders inside a bordered box pinned to the bottom of the
 * viewport (Claude Code-style), with an optional status bar underneath.
 * Typing `/` shows matching commands under the box; ↑/↓ + Enter picks one.
 */

import { bright, copper, dim, warn } from '../agent/theme.js';
import { prefersAnimation } from '../agent/animate.js';
import { inverse, rule, statusBar, visibleWidth, wrapSpans, type Span } from '../agent/box.js';
import { TerminalDock } from './dock.js';
import type { SelectItem } from './select.js';

export interface LivePromptOptions {
  /** Plain-text prompt prefix; the box paints it (do not pre-color). */
  prompt: string;
  commands: SelectItem[];
  output?: NodeJS.WriteStream;
  /** Next keypress; null means EOF. */
  readKey: () => Promise<string | null>;
  /**
   * Sync drain of already-queued printable chars (paste coalescing).
   * Without this, a long paste repaints once per character.
   */
  drainPrintable?: () => string;
  /** Shared dock; an internal one is created over `output` when absent. */
  dock?: TerminalDock;
  /** Dim example text shown while the buffer is empty. */
  placeholder?: string;
  /** Status-bar halves, re-read on every repaint (pre-painted strings). */
  status?: () => { left: string; right: string };
  /** Blink the caret while idle (only when animation is enabled). */
  pulse?: boolean;
}

/** Visible width ignoring SGR; kept for existing callers/tests. */
export function visibleLen(s: string): number {
  return visibleWidth(s);
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

/**
 * Visible slash-menu lines (exported for tests). Long lists are windowed to
 * `maxVisible` rows around the hovered item so the dock always fits a
 * standard 24-row terminal.
 */
export function suggestionLines(matches: SelectItem[], index: number, maxVisible = 8): string[] {
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

  let start = 0;
  if (matches.length > maxVisible) {
    start = Math.min(Math.max(0, clamped - (maxVisible >> 1)), matches.length - maxVisible);
  }
  const end = Math.min(matches.length, start + maxVisible);

  const rows = matches.slice(start, end).map((item, i0) => {
    const i = start + i0;
    const hovered = i === clamped;
    const cursor = hovered ? copper('❯') : ' ';
    const label = item.label.padEnd(width);
    if (hovered) return `  ${cursor} ${inverse(copper(label))}`;
    return `  ${cursor} ${label}`;
  });

  return [
    ...detail,
    '',
    dim('  ↑/↓ hover · Enter select · Esc dismiss'),
    ...(start > 0 ? [dim(`  ↑ ${start} more`)] : []),
    ...rows,
    ...(end < matches.length ? [dim(`  ↓ ${matches.length - end} more`)] : []),
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
 * Read one line inside the bottom dock. When the buffer starts with `/`,
 * live suggestions appear under the input box. Returns the submitted line,
 * a selected slash command, or null on Ctrl+C / EOF.
 */
export async function promptWithSlashHints(opts: LivePromptOptions): Promise<string | null> {
  const output = opts.output ?? process.stdout;
  const dock = opts.dock ?? new TerminalDock(output);
  let buffer = '';
  let index = 0;
  /** Caret blink phase (0 = visible). */
  let phase = 0;
  /** First Ctrl+C clears the input and arms; a second one exits. */
  let ctrlCArmed = false;

  const boxWidth = (): number => Math.max(10, dock.cols() - 1);

  const inputAreaLines = (): string[] => {
    const w = boxWidth();
    const spans: Span[] = [{ text: opts.prompt, paint: copper }];
    if (buffer === '' && opts.placeholder) {
      const ph = opts.placeholder;
      spans.push({ text: ph.slice(0, 1) || ' ', paint: phase % 2 ? dim : inverse });
      if (ph.length > 1) spans.push({ text: ph.slice(1), paint: dim });
    } else {
      spans.push({ text: buffer, paint: bright });
      spans.push({ text: ' ', paint: phase % 2 ? undefined : inverse });
    }
    // Claude Code-style: full-width rules above and below, no side borders.
    return [rule(w), ...wrapSpans(spans, w), rule(w)];
  };

  const renderDock = (): void => {
    const w = boxWidth();
    const inputLines = inputAreaLines();
    const menuLines: string[] = [];
    if (buffer.startsWith('/')) {
      const matches = matchesFor(buffer, opts.commands);
      if (index >= matches.length) index = Math.max(0, matches.length - 1);
      menuLines.push(...suggestionLines(matches, index));
    }
    const statusLines: string[] = [];
    if (ctrlCArmed) {
      statusLines.push(statusBar(` ${warn('press ctrl+c again to exit')}`, '', w));
    } else if (opts.status) {
      const { left, right } = opts.status();
      statusLines.push(statusBar(` ${left}`, `${right} `, w));
    }
    const rows = [...inputLines, ...menuLines, ...statusLines];
    // Reserve the menu's rows up front: opening `/` fills blank space that is
    // already part of the dock instead of growing it, so the viewport never
    // scrolls when the menu appears.
    const winRows =
      typeof (output as NodeJS.WriteStream).rows === 'number' && (output as NodeJS.WriteStream).rows
        ? (output as NodeJS.WriteStream).rows!
        : 24;
    const reserve = Math.min(14, Math.max(0, winRows - inputLines.length - statusLines.length - 2));
    const target = inputLines.length + statusLines.length + reserve;
    while (rows.length < target) rows.push('');
    dock.set(rows);
  };

  const finish = (value: string | null): string | null => {
    dock.release();
    // Commit the submitted line into scrollback so history shows what
    // actually ran (e.g. `/demo` picked from the bare-`/` dropdown).
    if (value !== null) output.write(opts.prompt + value + '\n');
    else output.write('\n');
    return value;
  };

  let blink: ReturnType<typeof setInterval> | null = null;
  if (opts.pulse && prefersAnimation()) {
    blink = setInterval(() => {
      phase = (phase + 1) % 2;
      renderDock();
    }, 650);
    blink.unref?.();
  }

  renderDock();

  try {
    for (;;) {
      const raw = await opts.readKey();
      if (raw === null) return finish(null);
      const key = normalizeNavKey(raw);

      if (key === '\x03') {
        if (ctrlCArmed) return finish(null);
        ctrlCArmed = true;
        buffer = '';
        index = 0;
        renderDock();
        continue;
      }
      if (ctrlCArmed) {
        ctrlCArmed = false;
        renderDock();
      }
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
          renderDock();
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
          renderDock();
        }
        continue;
      }

      if (key === '\t') {
        const matches = matchesFor(buffer, opts.commands);
        if (matches.length >= 1) {
          buffer = matches[index]!.value;
          renderDock();
        }
        continue;
      }

      if (key === '\x7f' || key === '\b') {
        if (buffer.length) {
          buffer = buffer.slice(0, -1);
          index = 0;
          renderDock();
        }
        continue;
      }

      if (key === '\x15') {
        buffer = '';
        index = 0;
        renderDock();
        continue;
      }

      // Printable input; coalesce paste so we paint once per burst instead of
      // once per character.
      if (key.length === 1 && key >= ' ') {
        buffer += key;
        if (opts.drainPrintable) buffer += opts.drainPrintable();
        phase = 0; // keep the caret visible while typing
        index = 0;
        renderDock();
      }
    }
  } finally {
    if (blink) clearInterval(blink);
    dock.release();
  }
}
