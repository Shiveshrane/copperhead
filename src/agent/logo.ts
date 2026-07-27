/**
 * Terminal block-art mark derived from the website logo
 * (docs/public/favicon.svg and docs.copperhead.sh): a PCB fiducial, ring
 * plus crosshair ticks, copper #b87333 on dark.
 */

import { copper } from './theme.js';

/**
 * 3-row quadrant-block fiducial (Claude Code-style pixel mark). Rows are
 * equal width so a banner lockup can put text beside them.
 */
export function fiducialMark(): string[] {
  return [
    '  ▄▟▙▄  ',
    '███  ███',
    '  ▀▜▛▀  ',
  ];
}

/** The mark painted in brand copper. */
export function fiducialLines(): string[] {
  return fiducialMark().map((line) => copper(line));
}
