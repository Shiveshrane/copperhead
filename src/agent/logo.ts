/**
 * Terminal block-art mark rasterized from the actual website logo geometry
 * (docs/public/favicon.svg: ring r=5.25 stroke=2.25 + four crosshair ticks),
 * copper #b87333 on dark. Generated with `node scripts/gen-logo.mjs 3`;
 * regenerate at other sizes with the same script.
 */

import { copper } from './theme.js';

/** 3-row quadrant-block fiducial, exact favicon geometry (aspect-corrected). */
export function fiducialMark(): string[] {
  return [
    '  ▗▟▙▖  ',
    ' ▐█▌▐█▌ ',
    '  ▝▜▛▘  ',
  ];
}

/** The mark painted in brand copper. */
export function fiducialLines(): string[] {
  return fiducialMark().map((line) => copper(line));
}
