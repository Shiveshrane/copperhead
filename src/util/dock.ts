/**
 * Bottom-of-viewport dock: owns the last rows of the terminal and repaints
 * them in place while normal output scrolls into scrollback above. This is
 * the Claude Code model: no alternate screen, scrollback stays intact, and
 * exactly one owner repaints the bottom region.
 */

import { visibleWidth } from '../agent/box.js';

const HIDE = '\x1b[?25l';
const SHOW = '\x1b[?25h';
/** Synchronized-output guards; terminals without support ignore them. */
const SYNC_ON = '\x1b[?2026h';
const SYNC_OFF = '\x1b[?2026l';
const CLEAR = '\r\x1b[2K';

export class TerminalDock {
  private lines: string[] = [];
  /** Physical rows the current paint occupies (wrap-aware). */
  private paintedRows = 0;

  constructor(private readonly out: NodeJS.WriteStream) {}

  cols(): number {
    return typeof this.out.columns === 'number' && this.out.columns ? this.out.columns : 80;
  }

  private rowsOf(line: string): number {
    return Math.max(1, Math.ceil(visibleWidth(line) / this.cols()));
  }

  private erase(): void {
    if (!this.paintedRows) return;
    this.out.write(CLEAR);
    for (let i = 1; i < this.paintedRows; i++) this.out.write('\x1b[1A' + CLEAR);
    this.paintedRows = 0;
  }

  private paint(): void {
    if (!this.lines.length) return;
    this.out.write(HIDE + this.lines.join('\n'));
    this.paintedRows = this.lines.reduce((n, l) => n + this.rowsOf(l), 0);
  }

  /** Replace the docked region with new rows. */
  set(lines: string[]): void {
    this.out.write(SYNC_ON);
    this.erase();
    this.lines = lines;
    this.paint();
    this.out.write(SYNC_OFF);
  }

  /** Write a scrollback line above the dock, keeping the dock pinned. */
  log(line: string): void {
    this.out.write(SYNC_ON);
    this.erase();
    this.out.write(line + '\n');
    this.paint();
    this.out.write(SYNC_OFF);
  }

  /** Clear the dock and restore the cursor (before agent turns / on exit). */
  release(): void {
    this.out.write(SYNC_ON);
    this.erase();
    this.lines = [];
    this.out.write(SHOW + SYNC_OFF);
  }
}
