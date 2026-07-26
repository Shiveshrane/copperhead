import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULTS, loadConfig, resolveModel, type CopperheadConfig } from '../config.js';
import { kicadCliVersion } from '../kicad/cli.js';

const execFileP = promisify(execFile);

/**
 * `copperhead doctor` (env preflight): a fast, LLM-free, network-free check of
 * whether this machine can actually run a copperhead command — the gap `check`
 * leaves (it verifies kicad-cli but is contractually LLM-free, so it never looks
 * at the model provider). Each probe fails soft: a missing tool is a reported
 * `fail`, never a thrown error, so `doctor` still prints the rest of the report.
 */
export type DoctorStatus = 'ok' | 'fail' | 'info';

export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
  hint?: string;
}

export interface DoctorReport {
  /** true when no *critical* check failed (info-only checks never block). */
  ok: boolean;
  checks: DoctorCheck[];
}

/** Probes are injectable so tests never depend on the host's tools. */
export interface DoctorDeps {
  nodeVersion: string;
  kicadVersion: () => Promise<string>;
  gitVersion: () => Promise<string>;
  env: NodeJS.ProcessEnv;
}

function defaultDeps(): DoctorDeps {
  return {
    nodeVersion: process.version,
    kicadVersion: kicadCliVersion,
    gitVersion: async () => (await execFileP('git', ['--version'])).stdout.trim(),
    env: process.env,
  };
}

const MIN_NODE_MAJOR = 20; // package.json engines: ">=20"

function nodeCheck(version: string): DoctorCheck {
  const major = Number(version.replace(/^v/, '').split('.')[0]);
  if (Number.isFinite(major) && major >= MIN_NODE_MAJOR) {
    return { name: 'node', status: 'ok', detail: `${version} (>= ${MIN_NODE_MAJOR})` };
  }
  return {
    name: 'node',
    status: 'fail',
    detail: `${version} (< ${MIN_NODE_MAJOR})`,
    hint: `copperhead needs Node >= ${MIN_NODE_MAJOR}; upgrade Node.`,
  };
}

async function kicadCheck(probe: () => Promise<string>): Promise<DoctorCheck> {
  try {
    return { name: 'kicad-cli', status: 'ok', detail: await probe() };
  } catch {
    return {
      name: 'kicad-cli',
      status: 'fail',
      detail: 'not found on PATH',
      hint: 'install KiCad >= 9 (bundles kicad-cli); ERC/DRC gates need it.',
    };
  }
}

async function gitCheck(probe: () => Promise<string>): Promise<DoctorCheck> {
  try {
    return { name: 'git', status: 'ok', detail: await probe() };
  } catch {
    return {
      name: 'git',
      status: 'fail',
      detail: 'not found on PATH',
      hint: 'install git; copperhead snapshots and commits its work.',
    };
  }
}

/**
 * Map a resolved model to the credential its provider needs, mirroring
 * makeProvider's prefix routing (agent/loop.ts). Presence-only: it checks that a
 * required API key is set, never that it authenticates (that would need network).
 * Saved-login providers (codex, claude-code) need no key and can't be verified
 * offline, so they report `info` (which does not block `ok`).
 */
export function checkCredential(model: string, env: NodeJS.ProcessEnv): DoctorCheck {
  if (model === 'codex' || model.startsWith('codex:')) {
    return {
      name: 'provider',
      status: 'info',
      detail: `${model} -> codex: uses your local Codex CLI login (no API key; not verified offline)`,
    };
  }
  if (model === 'claude-code' || model.startsWith('claude-code:')) {
    return {
      name: 'provider',
      status: 'info',
      detail: `${model} -> claude-code: uses Claude Code saved login (no API key; not verified offline)`,
    };
  }
  if (model === 'claude' || model.startsWith('claude')) {
    return env.ANTHROPIC_API_KEY
      ? { name: 'provider', status: 'ok', detail: `${model} -> anthropic: ANTHROPIC_API_KEY set` }
      : {
          name: 'provider',
          status: 'fail',
          detail: `${model} -> anthropic: ANTHROPIC_API_KEY not set`,
          hint: 'export ANTHROPIC_API_KEY=... (or use --model claude-code for saved login).',
        };
  }
  return env.OPENAI_API_KEY
    ? { name: 'provider', status: 'ok', detail: `${model} -> openai: OPENAI_API_KEY set` }
    : {
        name: 'provider',
        status: 'fail',
        detail: `${model} -> openai: OPENAI_API_KEY not set`,
        hint: 'export OPENAI_API_KEY=... (or use --model codex for saved login).',
      };
}

function providerCheck(
  flag: string | undefined,
  config: Awaited<ReturnType<typeof loadConfig>>,
  env: NodeJS.ProcessEnv,
): DoctorCheck {
  try {
    const { model } = resolveModel(flag, config, env);
    return checkCredential(model, env);
  } catch (err) {
    // resolveModel throws only when nothing selects a model at all.
    return {
      name: 'provider',
      status: 'fail',
      detail: 'no model configured',
      hint: (err as Error).message,
    };
  }
}

function projectCheck(config: Awaited<ReturnType<typeof loadConfig>>, repoRoot: string): DoctorCheck {
  const hasConfig = existsSync(path.join(repoRoot, '.copperhead', 'config.json'));
  if (!hasConfig) {
    return {
      name: 'project',
      status: 'info',
      detail: 'no .copperhead/config.json (run `copperhead init` or `copperhead create` to scaffold)',
    };
  }
  return {
    name: 'project',
    status: 'info',
    detail: `schematic ${config.schematic ?? 'not wired'} · board ${config.board ?? 'not wired'}`,
  };
}

export interface RunDoctorOptions {
  repoRoot: string;
  model?: string | undefined;
  deps?: Partial<DoctorDeps>;
}

// Same shape loadConfig returns when no config file exists at all: a safe
// fallback so a corrupted config.json degrades the project check, not the
// whole command (resolveModel's config.model precedence level is simply
// unavailable; --model/COPPERHEAD_MODEL/an available key still resolve).
const FALLBACK_CONFIG: CopperheadConfig = { schematic: null, board: null, ...DEFAULTS };

export async function runDoctor(opts: RunDoctorOptions): Promise<DoctorReport> {
  const deps = { ...defaultDeps(), ...opts.deps };
  let config: CopperheadConfig;
  let configError: DoctorCheck | undefined;
  try {
    config = await loadConfig(opts.repoRoot);
  } catch (err) {
    config = FALLBACK_CONFIG;
    // JSON.parse throws a bare SyntaxError for bad content; readFile throws a
    // coded Error (EACCES, EISDIR, ...) for a file that couldn't be read at
    // all. The two need different advice: content is fixed by regenerating
    // the file, unreadable is a permissions/filesystem problem regenerating
    // it will not solve.
    configError =
      err instanceof SyntaxError
        ? {
            name: 'project',
            status: 'fail',
            detail: `.copperhead/config.json is malformed: ${err.message}`,
            hint: 'fix or delete .copperhead/config.json (rerun `copperhead init`/`copperhead create` to regenerate it).',
          }
        : {
            name: 'project',
            status: 'fail',
            detail: `.copperhead/config.json could not be read: ${(err as Error).message}`,
            hint: 'check that it is a regular file (not a directory) and that you have permission to read it.',
          };
  }
  const checks: DoctorCheck[] = [
    nodeCheck(deps.nodeVersion),
    await kicadCheck(deps.kicadVersion),
    await gitCheck(deps.gitVersion),
    providerCheck(opts.model, config, deps.env),
    configError ?? projectCheck(config, opts.repoRoot),
  ];
  return { ok: checks.every((c) => c.status !== 'fail'), checks };
}

const SYMBOL: Record<DoctorStatus, string> = { ok: 'ok  ', fail: 'FAIL', info: 'info' };

export function formatDoctor(report: DoctorReport): string[] {
  const lines: string[] = [];
  for (const c of report.checks) {
    lines.push(`  [${SYMBOL[c.status]}] ${c.name.padEnd(10)} ${c.detail}`);
    if (c.hint) lines.push(`         hint: ${c.hint}`);
  }
  lines.push('');
  lines.push(report.ok ? 'ready' : 'not ready: fix the [FAIL] item(s) above');
  return lines;
}
