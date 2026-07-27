/**
 * REPL-session renderer: the single owner of the bottom dock during agent
 * turns. Durable output (tool lines, turn markers, the outcome) flows into
 * the content region through `emit`, which the REPL also records as
 * scrollable history; the live observability line (spinner, turn, tokens,
 * elapsed, busy text) is painted inside the dock, pinned to the bottom of
 * the screen no matter how much output scrolls above it.
 */

import { rule, statusBar } from './box.js';
import { copper, copperLight, dim, styleOutcome, toolLine, warn } from './theme.js';
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

  private arm(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.frame++;
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
    const wordIdx =
      (this.runSeed + this.turn + Math.floor((Date.now() - this.turnStartMs) / 6000)) %
      WORKING.length;
    const plain = WORKING[wordIdx]!;
    const sweep = this.frame % (plain.length + 4);
    const word = plain
      .split('')
      .map((ch, i) => (Math.abs(i - sweep) <= 1 ? copperLight(ch) : copper(ch)))
      .join('');
    // Fixed-width dots: the cycle animates without shifting the rest of the
    // line left and right on every frame.
    const dots = '.'.repeat(1 + (this.frame % 3)).padEnd(3);
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
      `${spinner} ${word}${dots} ${dim('· ')}${parts.join(dim(' · '))}`,
      rule(w),
      ...(hints ? [statusBar(`  ${hints}`, '', w)] : []),
    ]);
  }
}
