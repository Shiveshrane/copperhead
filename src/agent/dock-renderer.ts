/**
 * REPL-session renderer: the single owner of the bottom dock during agent
 * turns. Durable output (tool lines, turn markers, the outcome) flows into
 * the content region through `emit`, which the REPL also records as
 * scrollable history; the live observability line (spinner, turn, tokens,
 * elapsed, busy text) is painted inside the dock, pinned to the bottom of
 * the screen no matter how much output scrolls above it.
 */

import { rule, statusBar } from './box.js';
import { copper, dim, styleOutcome, toolLine, warn } from './theme.js';
import { fmtDuration, fmtTokens, turnMarker, type ProgressRenderer } from './render.js';
import type { TerminalDock } from '../util/dock.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Claude Code-style working words, board-shop edition. One per turn. */
const WORKING = [
  'Routing',
  'Etching',
  'Reflowing',
  'Soldering',
  'Drilling',
  'Plating',
  'Probing',
  'Fluxing',
  'Tinning',
  'Laminating',
  'Silkscreening',
  'Panelizing',
];

/** Fixed word-slot width: longest word plus the static dots. */
const WORD_SLOT = Math.max(...WORKING.map((w) => w.length)) + 3;

export class DockRenderer implements ProgressRenderer {
  private turn = 0;
  private maxTurns = 0;
  private tokensIn = 0;
  private tokensOut = 0;
  private streamedChars = 0;
  private busy: string | null = null;
  private frame = 0;
  private runSeed = 0;
  private startMs = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly dock: TerminalDock,
    /** Durable line sink: content region + session history. */
    private readonly emit: (line: string) => void,
    /** Dock chrome around the status row (meta right, bottom hints). */
    private readonly chrome: () => { meta: string | null; hints: string | null },
  ) {}

  log(line: string): void {
    this.emit(line);
  }

  toolResult(name: string, firstLine: string): void {
    this.emit(toolLine(name, firstLine));
  }

  private turnStartMs = Date.now();

  turnStart(turn: number, maxTurns: number, tokensIn: number, tokensOut: number): void {
    if (turn === 1) {
      this.startMs = Date.now();
      this.runSeed++;
    }
    this.turnStartMs = Date.now();
    this.turn = turn;
    this.maxTurns = maxTurns;
    this.tokensIn = tokensIn;
    this.tokensOut = tokensOut;
    this.emit(dim(turnMarker(turn, maxTurns, tokensIn, tokensOut)));
    this.arm();
    this.paint();
  }

  status(text: string | null): void {
    this.busy = text;
    if (text === null) this.streamedChars = 0;
    this.paint();
  }

  heartbeat(info: { elapsedMs: number; streamedChars: number }): void {
    this.streamedChars = info.streamedChars;
    this.paint();
  }

  finish(line: string): void {
    this.disarm();
    this.busy = null;
    this.emit(styleOutcome(line));
    // The next prompt's renderDock() takes the dock back over.
  }

  /** Currently displayed working word; morphs letter by letter on change. */
  private shownWord = '';
  private targetWord = '';
  /** -1 = settled; otherwise progress through erase-then-type transition. */
  private morph = -1;

  private arm(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.frame++;
      if (this.morph >= 0) this.morph++;
      this.paint();
    }, 120);
    this.timer.unref?.();
  }

  private disarm(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Pinned observability row painted inside the dock (same layout as the prompt). */
  private paint(): void {
    const w = Math.max(10, this.dock.cols() - 1);
    const spinner = copper(FRAMES[this.frame % FRAMES.length]!);
    // Claude Code-style working word, board-shop themed: rotates every ~6s
    // while a turn runs, with a shimmering highlight sweeping the letters.
    // A word change morphs letter by letter: the old word is erased into
    // `_` slots left to right, then the new word types over them.
    const wordIdx =
      (this.runSeed + this.turn + Math.floor((Date.now() - this.turnStartMs) / 6000)) %
      WORKING.length;
    const target = WORKING[wordIdx]!;
    if (this.shownWord === '') this.shownWord = target;
    if (target !== this.targetWord) {
      this.targetWord = target;
      if (target !== this.shownWord) this.morph = 0;
    }
    let plain = this.shownWord;
    if (this.morph >= 0) {
      const oldW = this.shownWord;
      const newW = this.targetWord;
      if (this.morph < oldW.length) {
        plain = '_'.repeat(this.morph + 1) + oldW.slice(this.morph + 1);
      } else if (this.morph < oldW.length + newW.length) {
        const typed = this.morph - oldW.length + 1;
        plain = newW.slice(0, typed) + '_'.repeat(Math.max(0, newW.length - typed));
      } else {
        this.shownWord = newW;
        this.morph = -1;
        plain = newW;
      }
    }
    // Fixed-width slot (longest word + dots) so the stats after it never
    // shift; dots are static and share the word's copper. Underscore slots
    // from the morph render dim.
    const padded = `${plain}...`.padEnd(WORD_SLOT);
    const word = padded
      .split('')
      .map((ch) => (ch === '_' ? dim(ch) : copper(ch)))
      .join('');
    const parts = [
      dim(`turn ${this.turn}/${this.maxTurns}`),
      dim(`${fmtTokens(this.tokensIn)} in / ${fmtTokens(this.tokensOut)} out`),
      dim(fmtDuration(Date.now() - this.startMs)),
    ];
    if (this.busy) {
      parts.push(
        warn(this.streamedChars ? `${this.busy} ~${fmtTokens(this.streamedChars)} ch` : this.busy),
      );
    }
    const { meta, hints } = this.chrome();
    this.dock.set([
      ...(meta ? [statusBar('', `${meta} `, w)] : []),
      rule(w),
      `${spinner} ${word} ${dim('· ')}${parts.join(dim(' · '))}`,
      rule(w),
      ...(hints ? [statusBar(`  ${hints}`, '', w)] : []),
    ]);
  }
}
