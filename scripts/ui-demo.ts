/**
 * Scripted mock REPL session: the full interactive UI with canned agent
 * output; no LLM calls, no kicad-cli, no repo mutations. This is the
 * standard take for demo recordings (asciinema / GIF):
 *
 *   npm run demo:ui
 *
 * Suggested script: let the banner settle · type `/` and hover a few
 * commands · Esc · type "rename net KEY_DAH to KEY_DASH" · Enter · let the
 * run play out · `/check` · Ctrl+C twice to exit.
 */

import { readFileSync } from 'node:fs';
import { runRepl } from '../src/commands/repl.js';
import { makeRenderer } from '../src/agent/render.js';
import { dim, ok, styleOutcome, toolLine } from '../src/agent/theme.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function say(ms: number, line: string): Promise<void> {
  await sleep(ms);
  console.log(line);
}

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

/** One canned `do`-equivalent run: propose → edit → verify → remember. */
async function mockAgentRun(_request: string): Promise<{ outcome: 'success' }> {
  console.log('');
  await say(500, dim('  turn 1/40 · drafting an OpenSpec proposal'));
  await say(1100, toolLine('read_file', 'docs/PINOUT.md (34 lines)'));
  await say(700, toolLine('read_file', 'hardware/open-key.kicad_sch (1.2k lines)'));
  await say(900, toolLine('openspec_validate', 'change valid — edit tools unlocked'));
  await say(600, dim('  turn 2/40 · applying anchored edits'));
  await say(1000, toolLine('edit_file', 'hardware/open-key.kicad_sch — replaced 3 anchored regions'));
  await say(800, toolLine('edit_file', 'docs/PINOUT.md — updated net table'));
  await say(500, dim('  turn 3/40 · verification'));
  await say(1400, toolLine('run_erc', 'clean — 0 violations'));
  await say(700, toolLine('check_drift', 'docs match schematic'));
  await say(600, toolLine('log_decision', 'DECISIONS.md +1 · CHANGELOG.md +1'));
  await say(900, styleOutcome('done · verified erc · committed 3f2c9a1 · 24s · 12.3k tokens'));
  return { outcome: 'success' };
}

async function mockCheck(): Promise<void> {
  await say(600, toolLine('run_erc', 'clean — 0 violations'));
  await say(500, toolLine('run_drc', 'clean — 0 violations'));
  await say(400, toolLine('check_drift', 'docs match schematic'));
  await say(300, ok('  check: all green'));
}

const res = await runRepl({
  repoRoot: process.cwd(),
  model: 'claude',
  modelSource: 'flag',
  version: pkg.version,
  kicadCliVersion: '9.0.4',
  renderer: makeRenderer({ json: false, plain: false }),
  runRequest: mockAgentRun,
  runCheckCmd: mockCheck,
});
process.exit(res.ok ? 0 : 1);
