import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { runAgentLoop } from '../src/agent/loop.js';
import { runCreate } from '../src/commands/create.js';
import { tempFixtureRepo } from './helpers.js';

// The git preflight throws before the provider is constructed and before
// transcript.init(), so these run the real loop offline: no API key is read,
// no network is touched, no run dir is written.

const loopOpts = (repoRoot: string) => ({
  repoRoot,
  model: 'gpt-5',
  request: 'test request',
  log: () => {},
});

async function tempDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ch-preflight-'));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe('git preflight (unborn HEAD, AC-3.8)', () => {
  it('non-git directory: friendly error, not raw git output', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await expect(runAgentLoop(loopOpts(dir))).rejects.toThrow(
        /not a git repository; copperhead requires git/,
      );
    } finally {
      await cleanup();
    }
  });

  it('unborn HEAD: friendly error with the fix spelled out, no exit-128 noise', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await execa('git', ['init', '-q'], { cwd: dir });
      const err = await runAgentLoop(loopOpts(dir)).then(
        () => null,
        (e: Error) => e,
      );
      expect(err).not.toBeNull();
      expect(err!.message).toMatch(/repository has no commits/);
      expect(err!.message).toMatch(/git add -A && git commit/);
      expect(err!.message).not.toMatch(/exit code 128|ambiguous argument/);
    } finally {
      await cleanup();
    }
  });

  it('staged-but-uncommitted files still count as no commits', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await execa('git', ['init', '-q'], { cwd: dir });
      await writeFile(path.join(dir, 'brief.md'), 'a brief', 'utf8');
      await execa('git', ['add', '-A'], { cwd: dir });
      await expect(runAgentLoop(loopOpts(dir))).rejects.toThrow(/repository has no commits/);
    } finally {
      await cleanup();
    }
  });

  it('detection is independent of the default branch name', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await execa('git', ['init', '-q', '-b', 'main'], { cwd: dir });
      await expect(runAgentLoop(loopOpts(dir))).rejects.toThrow(/repository has no commits/);
    } finally {
      await cleanup();
    }
  });

  it('a failed preflight leaves no .copperhead footprint', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await execa('git', ['init', '-q'], { cwd: dir });
      await runAgentLoop(loopOpts(dir)).catch(() => {});
      expect(existsSync(path.join(dir, '.copperhead'))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('checks run in order repo -> commits -> dirty: a committed repo passes the commit gate', async () => {
    const { repo, cleanup } = await tempFixtureRepo();
    try {
      await writeFile(path.join(repo, 'junk.txt'), 'dirty', 'utf8');
      // reaching the dirty-tree error proves both git gates before it passed
      await expect(runAgentLoop(loopOpts(repo))).rejects.toThrow(/working tree is dirty/);
    } finally {
      await cleanup();
    }
  });
});

describe('copperhead create without a git setup (bug-report path)', () => {
  const createOpts = (repoRoot: string) => ({
    repoRoot,
    briefPath: path.join(repoRoot, 'brief.md'),
    model: 'gpt-5',
    log: () => {},
  });

  it('unborn HEAD: create fails with the no-commits message instead of crashing in spec-seed', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await writeFile(path.join(dir, 'brief.md'), 'A tiny USB macro keypad', 'utf8');
      await execa('git', ['init', '-q'], { cwd: dir });
      await expect(runCreate(createOpts(dir))).rejects.toThrow(/repository has no commits/);
    } finally {
      await cleanup();
    }
  });

  it('non-git directory: create fails with the not-a-repository message', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await writeFile(path.join(dir, 'brief.md'), 'A tiny USB macro keypad', 'utf8');
      await expect(runCreate(createOpts(dir))).rejects.toThrow(/not a git repository/);
    } finally {
      await cleanup();
    }
  });
});
