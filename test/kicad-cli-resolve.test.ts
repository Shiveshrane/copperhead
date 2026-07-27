import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  resolveKicadCli,
  resetKicadCliCache,
  KicadCliBadOverrideError,
} from '../src/kicad/cli.js';

/**
 * Binary resolution is pure local logic (an env var plus filesystem probes),
 * so it is testable without KiCad installed. `check` depends on it, and check
 * is contractually LLM-free and network-free: nothing here reaches out.
 */
describe('kicad-cli binary resolution', () => {
  const saved = process.env.COPPERHEAD_KICAD_CLI;
  let dir: string;

  beforeEach(async () => {
    resetKicadCliCache();
    dir = await mkdtemp(path.join(tmpdir(), 'copperhead-kicad-'));
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env.COPPERHEAD_KICAD_CLI;
    else process.env.COPPERHEAD_KICAD_CLI = saved;
    resetKicadCliCache();
    await rm(dir, { recursive: true, force: true });
  });

  it('falls back to the PATH name when no override is set', () => {
    delete process.env.COPPERHEAD_KICAD_CLI;
    expect(resolveKicadCli()).toBe('kicad-cli');
  });

  it('honours COPPERHEAD_KICAD_CLI when the path exists', async () => {
    const bin = path.join(dir, 'kicad-cli');
    await writeFile(bin, '#!/bin/sh\nexit 0\n', 'utf8');
    await chmod(bin, 0o755);
    process.env.COPPERHEAD_KICAD_CLI = bin;
    expect(resolveKicadCli()).toBe(bin);
  });

  it('trims surrounding whitespace in the override', async () => {
    const bin = path.join(dir, 'kicad-cli');
    await writeFile(bin, '#!/bin/sh\nexit 0\n', 'utf8');
    process.env.COPPERHEAD_KICAD_CLI = `  ${bin}  `;
    expect(resolveKicadCli()).toBe(bin);
  });

  it('refuses, naming the bad path, when the override does not exist', () => {
    // Regression: this used to fall through to a bare PATH lookup, so a typo
    // produced "kicad-cli not found on PATH" plus advice to set the very
    // variable the user had already set.
    const missing = path.join(dir, 'typo', 'kicad-cli');
    process.env.COPPERHEAD_KICAD_CLI = missing;
    expect(() => resolveKicadCli()).toThrow(KicadCliBadOverrideError);
    try {
      resolveKicadCli();
    } catch (err) {
      const e = err as KicadCliBadOverrideError;
      expect(e.message).toContain(missing);
      // It must not tell you to set what you already set.
      expect(e.message).not.toMatch(/not found on PATH/);
    }
  });

  it('treats an empty or whitespace-only override as unset', () => {
    process.env.COPPERHEAD_KICAD_CLI = '   ';
    expect(resolveKicadCli()).toBe('kicad-cli');
  });

  it('caches the resolved binary until the cache is reset', async () => {
    delete process.env.COPPERHEAD_KICAD_CLI;
    expect(resolveKicadCli()).toBe('kicad-cli');
    // A later override is ignored while the cache stands, then honoured after
    // a reset — which is what makes these tests independent of each other.
    const bin = path.join(dir, 'kicad-cli');
    await writeFile(bin, '#!/bin/sh\nexit 0\n', 'utf8');
    process.env.COPPERHEAD_KICAD_CLI = bin;
    expect(resolveKicadCli()).toBe('kicad-cli');
    resetKicadCliCache();
    expect(resolveKicadCli()).toBe(bin);
  });
});
