/**
 * Subtle TTY motion for attended copperhead chrome. Disabled when color is
 * off, stdout is not a TTY, CI=1, or COPPERHEAD_NO_ANIM=1.
 */

import { copper, isColorEnabled } from './theme.js';

export function prefersAnimation(): boolean {
  return (
    isColorEnabled() &&
    Boolean(process.stdout.isTTY) &&
    !process.env.CI &&
    !process.env.COPPERHEAD_NO_ANIM
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const CLEAR = '\r\x1b[2K';
const SHOW = '\x1b[?25h';
const HIDE = '\x1b[?25l';

/** Growing fiducial frames (3 rows), converging on the block mark. Exported for tests. */
export function fiducialBootFrames(): string[][] {
  return [
    ['        ', '   ▄▄   ', '        '],
    ['  ▄▄▄▄  ', '  █  █  ', '  ▀▀▀▀  '],
    ['  ▄▟▙▄  ', ' ██  ██ ', '  ▀▜▛▀  '],
    ['  ▄▟▙▄  ', '███  ███', '  ▀▜▛▀  '],
  ].map((frame) => frame.map((row) => copper(row)));
}

/**
 * Startup reveal: quick fiducial power-on, then cascade the real banner lines.
 */
export async function revealBanner(
  lines: string[],
  write: (line: string) => void,
  opts?: { out?: NodeJS.WriteStream },
): Promise<void> {
  const out = opts?.out ?? process.stdout;

  if (!prefersAnimation()) {
    for (const line of lines) write(line);
    return;
  }

  out.write(HIDE);
  try {
    // Fiducial power-on (in-place), then erase and cascade the real banner
    // so scrollback keeps one clean lockup — not a trail of boot frames.
    const frames = fiducialBootFrames();
    out.write('\n');
    for (const row of frames[0]!) out.write(CLEAR + row + '\n');
    for (let i = 1; i < frames.length; i++) {
      await sleep(50);
      out.write(`\x1b[${frames[i]!.length}A`);
      for (const row of frames[i]!) out.write(CLEAR + row + '\n');
    }
    await sleep(90);

    // Erase boot block: leading newline + 3 mark rows.
    out.write('\x1b[4A');
    for (let i = 0; i < 4; i++) out.write(CLEAR + (i < 3 ? '\n' : ''));
    out.write('\x1b[3A\r');

    for (const line of lines) {
      write(line);
      await sleep(line.trim() === '' ? 6 : 15);
    }
  } finally {
    out.write(SHOW);
  }
}

/** Copper horizontal rule (PCB-trace vibe). */
export function traceRule(width = 32): string {
  return copper('  ' + '─'.repeat(Math.max(8, Math.min(width, 48))));
}

/** Cascade lines (help / demo sections). Instant when animation is off. */
export async function staggerWrite(
  lines: string[],
  write: (line: string) => void,
  delayMs = 12,
): Promise<void> {
  if (!prefersAnimation()) {
    for (const line of lines) write(line);
    return;
  }
  for (const line of lines) {
    write(line);
    await sleep(delayMs);
  }
}
