import { tempFixtureRepo } from './helpers.js';
import { runInit } from '../src/memory/scaffold.js';
import { saveConstraint } from '../src/memory/constraints.js';
import { runAgentLoop } from '../src/agent/loop.js';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';

const { repo, cleanup } = await tempFixtureRepo();
await runInit({ repoRoot: repo, installHooks: false });
await saveConstraint(repo, 'power.sleep_current_uA', {
  max: 25, source: 'docs/SPEC.md#budgets', affects: ['KEY_DAH', 'GPIO-pullups'],
});
await appendFile(path.join(repo, 'docs', 'SPEC.md'),
  '\n## Budgets\n\n- sleep_current_uA: 25 (hard budget; 3.3 V rail; every leakage path counts)\n');
await execa('git', ['add', '-A'], { cwd: repo });
await execa('git', ['commit', '-q', '-m', 'init docs'], { cwd: repo });
try {
  const res = await runAgentLoop({
    repoRoot: repo,
    request: 'add a 100kΩ pullup to 3V3 on KEY_DAH',
    model: 'gpt-5-nano',
    log: (l) => console.log('[loop]', l.slice(0, 200)),
  });
  console.log('OUTCOME:', res.outcome, '|', res.summary.slice(0, 300));
} finally {
  await cleanup();
}
