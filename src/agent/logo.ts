/**
 * Terminal lockup derived from the copperhead brand mark (PCB fiducial:
 * circle + crosshairs) used on https://docs.copperhead.sh/ and
 * docs/public/favicon.svg — copper `#b87333` on dark.
 */

import { copper, dim } from './theme.js';
import { traceRule } from './animate.js';

/** Narrow 3-line fiducial glyph (no wordmark). */
export function fiducialLines(): string[] {
  return [
    '      │',
    '  ────◯────',
    '      │',
  ].map((line) => copper(line));
}

/**
 * Logo + wordmark lockup for REPL / attended startup.
 * Falls back to a one-line wordmark when the terminal is very narrow.
 */
export function logoLockup(opts: {
  version: string;
  tagline?: string;
  columns?: number;
}): string[] {
  const tag = opts.tagline ?? 'interactive shell';
  const cols = opts.columns ?? process.stdout.columns ?? 80;

  if (cols < 40) {
    return [`${copper('copperhead')}  ${dim(`v${opts.version} · ${tag}`)}`, ''];
  }

  // Side-by-side: fiducial mark | wordmark + meta (matches docs lockup layout).
  const mark = ['      │', '  ────◯────', '      │'];
  const words = [
    '',
    `${copper('copperhead')}  ${dim(`v${opts.version}`)}`,
    dim(tag),
  ];

  return [
    '',
    ...mark.map((m, i) => `${copper(m)}  ${words[i] ?? ''}`),
    traceRule(34),
    '',
  ];
}
