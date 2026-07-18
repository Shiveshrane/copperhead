import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface CopperheadConfig {
  schematic: string | null;
  board: string | null;
  docs: string;
  model: string | null;
  maxTurns: number;
  maxRepairCycles: number;
  budgets: Record<string, number>;
  /** Content hashes of generated docs, for init idempotency (AC-1.4). */
  generatedHashes?: Record<string, string>;
}

export const CONFIG_DIR = '.copperhead';

export const DEFAULTS: Omit<CopperheadConfig, 'schematic' | 'board'> = {
  docs: 'docs/',
  model: null,
  maxTurns: 40,
  maxRepairCycles: 5,
  budgets: {},
};

export function configPath(repoRoot: string): string {
  return path.join(repoRoot, CONFIG_DIR, 'config.json');
}

export async function loadConfig(repoRoot: string): Promise<CopperheadConfig> {
  const p = configPath(repoRoot);
  if (!existsSync(p)) {
    return { schematic: null, board: null, ...DEFAULTS };
  }
  const raw = JSON.parse(await readFile(p, 'utf8')) as Partial<CopperheadConfig>;
  return {
    schematic: raw.schematic ?? null,
    board: raw.board ?? null,
    docs: raw.docs ?? DEFAULTS.docs,
    model: raw.model ?? null,
    maxTurns: raw.maxTurns ?? DEFAULTS.maxTurns,
    maxRepairCycles: raw.maxRepairCycles ?? DEFAULTS.maxRepairCycles,
    budgets: raw.budgets ?? {},
    ...(raw.generatedHashes ? { generatedHashes: raw.generatedHashes } : {}),
  };
}

/** Model selection precedence: flag > COPPERHEAD_MODEL > config > available key. */
export function resolveModel(flag: string | undefined, config: CopperheadConfig, env = process.env): string {
  if (flag) return flag;
  if (env.COPPERHEAD_MODEL) return env.COPPERHEAD_MODEL;
  if (config.model) return config.model;
  if (env.OPENAI_API_KEY) return 'gpt-5';
  if (env.ANTHROPIC_API_KEY) return 'claude';
  throw new Error(
    'no model configured: pass --model, set COPPERHEAD_MODEL, set model in .copperhead/config.json, or provide OPENAI_API_KEY/ANTHROPIC_API_KEY',
  );
}
