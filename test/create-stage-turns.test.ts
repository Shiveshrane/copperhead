import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { RunOptions } from '../src/agent/loop.js';
import { tempFixtureRepo } from './helpers.js';

const mockRunAgentLoop = vi.hoisted(() =>
  vi.fn(async (_opts: RunOptions) => ({
    outcome: 'success' as const,
    summary: 'mocked',
    transcriptDir: '',
    filesTouched: [],
    commit: null,
  })),
);

vi.mock('../src/agent/loop.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runAgentLoop: mockRunAgentLoop,
}));
vi.mock('../src/openspec/cli.js', () => ({
  openspecInit: async () => ({ ok: true, output: 'mocked' }),
}));
vi.mock('../src/commands/check.js', () => ({
  runCheck: async () => ({ ok: true }),
}));

import { runCreate } from '../src/commands/create.js';

describe('create pipeline per-stage turn budgets (AC-15.18, AC-15.19)', () => {
  it('a stage with a stageMaxTurns entry gets that budget; others get the default', async () => {
    const { repo, cleanup } = await tempFixtureRepo();
    try {
      await mkdir(path.join(repo, '.copperhead'), { recursive: true });
      await writeFile(
        path.join(repo, '.copperhead', 'config.json'),
        JSON.stringify({ stageMaxTurns: { 'spec-seed': 60 } }),
        'utf8',
      );
      const briefPath = path.join(repo, 'brief.md');
      await writeFile(briefPath, '# A tiny device\n', 'utf8');

      const res = await runCreate({ repoRoot: repo, briefPath, model: 'gpt-5', log: () => {} });
      expect(res.ok).toBe(true);

      const calls = mockRunAgentLoop.mock.calls.map(([opts]) => opts);
      const specSeed = calls.find((o) => o.request.includes('spec-seed'));
      const architecture = calls.find((o) => o.request.includes('architecture'));
      expect(specSeed?.maxTurns).toBe(60);
      expect(architecture?.maxTurns).toBeUndefined();
    } finally {
      await cleanup();
    }
  });
});
