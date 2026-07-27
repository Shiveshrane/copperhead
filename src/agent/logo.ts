/**
 * Terminal block-art mark derived from the website logo
 * (docs/public/favicon.svg and docs.copperhead.sh): a round PCB via, an
 * annular copper ring around a drilled hole, copper #b87333 on dark.
 */

import { copper } from './theme.js';

/**
 * 3-row quadrant-block via (Claude Code-style pixel mark). Drawn as an
 * ellipse in subpixel space so it reads round at the terminal's 1:2 cell
 * aspect. Rows are equal width so a banner lockup can put text beside them.
 */
export function fiducialMark(): string[] {
  return [
    ' ▗▟██▙▖ ',
    ' ██  ██ ',
    ' ▝▜██▛▘ ',
  ];
}

/** The mark painted in brand copper. */
export function fiducialLines(): string[] {
  return fiducialMark().map((line) => copper(line));
}
