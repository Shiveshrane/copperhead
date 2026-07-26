import { describe, it, expect } from 'vitest';
import { runDoctor, checkCredential, formatDoctor, type DoctorDeps } from '../src/commands/doctor.js';
import { tempFixtureRepo } from './helpers.js';

// Deps that make every host-dependent probe deterministic.
function deps(over: Partial<DoctorDeps> = {}): Partial<DoctorDeps> {
  return {
    nodeVersion: 'v20.0.0',
    kicadVersion: async () => 'kicad-cli 9.0.0',
    gitVersion: async () => 'git version 2.43.0',
    env: {},
    ...over,
  };
}

describe('copperhead doctor', () => {
  it('all green when node/kicad/git are present and the provider credential is set', async () => {
    const { repo, cleanup } = await tempFixtureRepo();
    try {
      const r = await runDoctor({ repoRoot: repo, model: 'gpt-5', deps: deps({ env: { OPENAI_API_KEY: 'sk-x' } }) });
      expect(r.ok).toBe(true);
      const provider = r.checks.find((c) => c.name === 'provider')!;
      expect(provider.status).toBe('ok');
      expect(provider.detail).toContain('OPENAI_API_KEY set');
    } finally {
      await cleanup();
    }
  });

  it('fails (ok=false) and gives a hint when the resolved provider key is missing', async () => {
    const { repo, cleanup } = await tempFixtureRepo();
    try {
      const r = await runDoctor({ repoRoot: repo, model: 'gpt-5', deps: deps({ env: {} }) });
      expect(r.ok).toBe(false);
      const provider = r.checks.find((c) => c.name === 'provider')!;
      expect(provider.status).toBe('fail');
      expect(provider.hint).toContain('OPENAI_API_KEY');
    } finally {
      await cleanup();
    }
  });

  it('reports a missing kicad-cli as a failure with an install hint (does not throw)', async () => {
    const { repo, cleanup } = await tempFixtureRepo();
    try {
      const r = await runDoctor({
        repoRoot: repo,
        model: 'claude-code',
        deps: deps({
          kicadVersion: async () => {
            throw new Error('ENOENT');
          },
        }),
      });
      expect(r.ok).toBe(false);
      const kicad = r.checks.find((c) => c.name === 'kicad-cli')!;
      expect(kicad.status).toBe('fail');
      expect(kicad.hint).toMatch(/install KiCad/i);
    } finally {
      await cleanup();
    }
  });

  it('a saved-login provider needs no key: info, not a failure', async () => {
    const { repo, cleanup } = await tempFixtureRepo();
    try {
      const r = await runDoctor({ repoRoot: repo, model: 'claude-code', deps: deps({ env: {} }) });
      const provider = r.checks.find((c) => c.name === 'provider')!;
      expect(provider.status).toBe('info');
      expect(r.ok).toBe(true); // info never blocks
    } finally {
      await cleanup();
    }
  });

  it('an old node major fails the node check', async () => {
    const { repo, cleanup } = await tempFixtureRepo();
    try {
      const r = await runDoctor({ repoRoot: repo, model: 'claude-code', deps: deps({ nodeVersion: 'v18.19.0' }) });
      expect(r.checks.find((c) => c.name === 'node')!.status).toBe('fail');
      expect(r.ok).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('checkCredential maps each model prefix to the right credential', () => {
    expect(checkCredential('claude-3-7', { ANTHROPIC_API_KEY: 'x' }).status).toBe('ok');
    expect(checkCredential('claude-3-7', {}).status).toBe('fail');
    expect(checkCredential('o3', { OPENAI_API_KEY: 'x' }).status).toBe('ok');
    expect(checkCredential('o3', {}).status).toBe('fail');
    expect(checkCredential('codex:gpt-5', {}).status).toBe('info');
    expect(checkCredential('claude-code:opus', {}).status).toBe('info');
  });

  it('formatDoctor renders a ready/not-ready footer', () => {
    const ready = formatDoctor({ ok: true, checks: [] });
    expect(ready[ready.length - 1]).toBe('ready');
    const notReady = formatDoctor({ ok: false, checks: [] });
    expect(notReady[notReady.length - 1]).toMatch(/not ready/);
  });
});
