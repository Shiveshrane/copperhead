/**
 * Bottom-of-viewport dock built on DECSTBM scroll regions: content is fenced
 * into rows [1, H - dockHeight] and the dock is painted with absolute cursor
 * addressing below the scroll margin, so no amount of content output (or
 * mouse wheel) can ever move it. Runs inside the alternate screen buffer the
 * REPL enters at startup. This is the FrankenTUI/ratatui-inline technique;
 * see also DECSTBM (CSI r).
 */

import { truncateVisible } from '../agent/box.js';

const HIDE = '\x1b[?25l';
const SHOW = '\x1b[?25h';
/** Synchronized-output guards; terminals without support ignore them. */
const SYNC_ON = '\x1b[?2026h';
const SYNC_OFF = '\x1b[?2026l';
/** Reset the scroll region to the full screen. Homes the cursor (hence DECSC/DECRC around it). */
const REGION_RESET = '\x1b[r';
const SAVE = '\x1b7';
const RESTORE = '\x1b8';

export class TerminalDock {
  /** Rows the dock currently occupies at the bottom of the screen. */
  private dockH = 0;

  constructor(private readonly out: NodeJS.WriteStream) {}

  cols(): number {
    return typeof this.out.columns === 'number' && this.out.columns ? this.out.columns : 80;
  }

  rows(): number {
    return typeof this.out.rows === 'number' && this.out.rows ? this.out.rows : 24;
  }

  /**
   * Replace the docked region. On a height change the content scroll region
   * is re-fenced; same-height repaints are pure absolute-addressed writes and
   * can never scroll anything.
   */
  set(lines: string[]): void {
    if (!lines.length) {
      this.release();
      return;
    }
    const h = this.rows();
    const shown = lines.slice(0, Math.max(1, h - 3)).map((l) => truncateVisible(l, this.cols() - 1));
    const newH = shown.length;

    let seq = SYNC_ON + HIDE;
    if (this.dockH === 0) {
      // First activation: free the bottom rows by scrolling exactly as much
      // as needed (preserves the banner above), then fence content into
      // [1, h - newH]. DECSTBM homes the cursor; save/restore keeps it.
      seq += SAVE + REGION_RESET + RESTORE;
      seq += '\n'.repeat(newH) + `\x1b[${newH}A`;
      seq += SAVE + `\x1b[1;${h - newH}r` + RESTORE;
    } else if (newH !== this.dockH) {
      // Height change while active (menu open/close): overlay mode. Re-fence
      // and clear any rows freed by a shrink; never scroll content.
      seq += SAVE + `\x1b[1;${h - newH}r`;
      for (let r = h - Math.max(this.dockH, newH) + 1; r <= h - newH; r++) {
        seq += `\x1b[${r};1H\x1b[2K`;
      }
      seq += RESTORE;
    }
    seq += SAVE;
    for (let i = 0; i < newH; i++) {
      seq += `\x1b[${h - newH + 1 + i};1H\x1b[2K${shown[i]!}`;
    }
    seq += RESTORE + SYNC_OFF;
    this.out.write(seq);
    this.dockH = newH;
  }

  /**
   * Write a scrollback line above the dock. With the fence in place a plain
   * write cannot touch the dock rows, so no repaint is needed.
   */
  log(line: string): void {
    this.out.write(line + '\n');
  }

  /** Drop the fence, clear the dock rows, and restore the cursor. */
  release(): void {
    if (!this.dockH) {
      this.out.write(SHOW);
      return;
    }
    const h = this.rows();
    let seq = SYNC_ON;
    seq += SAVE + REGION_RESET + RESTORE;
    seq += SAVE;
    for (let r = h - this.dockH + 1; r <= h; r++) seq += `\x1b[${r};1H\x1b[2K`;
    seq += RESTORE + SHOW + SYNC_OFF;
    this.out.write(seq);
    this.dockH = 0;
  }
}
