import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import {
  parseSlash,
  runRepl,
  shortPath,
  helpText,
  banner,
  examplesText,
  completeSlash,
} from '../src/commands/repl.js';
import { demoTourText, scaffoldDemoRepo, defaultBriefPath } from '../src/commands/demo.js';
import { selectMenu } from '../src/util/select.js';
import {
  keySequence,
  inputRowRows,
  promptWithSlashHints,
  pushKeys,
  suggestionLines,
} from '../src/util/live-prompt.js';
import { fiducialBootFrames, prefersAnimation } from '../src/agent/animate.js';
import { plainRenderer } from '../src/agent/render.js';
import { setColorEnabled } from '../src/agent/theme.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { PassThrough as NodePassThrough } from 'node:stream';
import { SLASH_COMMANDS } from '../src/commands/repl.js';

function fakeTty(): { input: PassThrough; output: PassThrough; lines: string[] } {
  const input = new PassThrough();
  const output = new PassThrough();
  (input as unknown as { isTTY: boolean }).isTTY = true;
  (output as unknown as { isTTY: boolean }).isTTY = true;
  const lines: string[] = [];
  return { input, output, lines };
}

function baseOpts(extra: Partial<Parameters<typeof runRepl>[0]> = {}) {
  const { input, output, lines } = fakeTty();
  return {
    input,
    output,
    lines,
    opts: {
      repoRoot: '/tmp/repo',
      model: 'gpt-5',
      modelSource: 'flag' as const,
      version: '0.7.0',
      kicadCliVersion: '9.0.0',
      renderer: plainRenderer((l) => lines.push(l)),
      log: (l: string) => lines.push(l),
      input,
      output,
      runRequest: vi.fn(async () => ({ outcome: 'success' as const })),
      runCheckCmd: vi.fn(async () => {
        lines.push('check ok');
      }),
      ...extra,
    },
  };
}

describe('parseSlash', () => {
  it('detects slash commands and leaves normal requests alone', () => {
    expect(parseSlash('add an LED')).toBeNull();
    expect(parseSlash('/')).toEqual({ cmd: '/', args: '' });
    expect(parseSlash('/quit')).toEqual({ cmd: '/quit', args: '' });
    expect(parseSlash('/help me')).toEqual({ cmd: '/help', args: 'me' });
  });

  it('maps bare quit/clear/help so they never start an agent run', () => {
    expect(parseSlash('quit')).toEqual({ cmd: '/quit', args: '' });
    expect(parseSlash('clear')).toEqual({ cmd: '/clear', args: '' });
    expect(parseSlash('help')).toEqual({ cmd: '/help', args: '' });
    expect(parseSlash('EXIT')).toEqual({ cmd: '/quit', args: '' });
  });

  it('maps bare quit/clear/help so they never start an agent run', () => {
    expect(parseSlash('quit')).toEqual({ cmd: '/quit', args: '' });
    expect(parseSlash('clear')).toEqual({ cmd: '/clear', args: '' });
    expect(parseSlash('help')).toEqual({ cmd: '/help', args: '' });
    expect(parseSlash('EXIT')).toEqual({ cmd: '/quit', args: '' });
  });

  it('tab-completes slash commands', () => {
    expect(completeSlash('/d')).toContain('/demo');
    expect(completeSlash('/d')).toContain('/drift');
    expect(completeSlash('/st')).toEqual(['/status']);
    expect(completeSlash('/sy')).toEqual(['/sync']);
    expect(completeSlash('/con')).toEqual(expect.arrayContaining(['/config', '/constraints']));
    expect(completeSlash('add')).toEqual([]);
  });

  it('lists the new inspect slash commands', () => {
    const values = SLASH_COMMANDS.map((c) => c.value);
    for (const cmd of [
      '/sync',
      '/drift',
      '/constraints',
      '/config',
      '/git',
      '/runs',
      '/parts',
      '/nets',
      '/bom',
      '/openspec',
      '/last',
    ]) {
      expect(values).toContain(cmd);
      expect(helpText()).toContain(cmd);
    }
  });
});

describe('selectMenu', () => {
  it('returns the item selected with Enter after ↓', async () => {
    setColorEnabled(false);
    const output = new NodePassThrough();
    async function* keys() {
      yield '\x1b[B'; // down
      yield '\r';
    }
    const chosen = await selectMenu({
      title: 'Commands',
      items: [
        { value: '/demo', label: '/demo' },
        { value: '/quit', label: '/quit' },
      ],
      output: output as unknown as NodeJS.WriteStream,
      keys: keys(),
    });
    expect(chosen).toBe('/quit');
  });

  it('cancels on Esc', async () => {
    setColorEnabled(false);
    const output = new NodePassThrough();
    async function* keys() {
      yield '\x1b';
    }
    const chosen = await selectMenu({
      title: 'Commands',
      items: [{ value: '/demo', label: '/demo' }],
      output: output as unknown as NodeJS.WriteStream,
      keys: keys(),
    });
    expect(chosen).toBeNull();
  });
});

describe('animation helpers', () => {
  it('fiducial boot has growing frames and respects NO_ANIM', () => {
    setColorEnabled(true);
    const prev = process.env.COPPERHEAD_NO_ANIM;
    process.env.COPPERHEAD_NO_ANIM = '1';
    expect(prefersAnimation()).toBe(false);
    if (prev === undefined) delete process.env.COPPERHEAD_NO_ANIM;
    else process.env.COPPERHEAD_NO_ANIM = prev;
    const frames = fiducialBootFrames();
    expect(frames.length).toBeGreaterThanOrEqual(3);
    expect(frames[frames.length - 1]!.join('\n')).toContain('▟');
    setColorEnabled(false);
  });
});

describe('repl chrome', () => {
  it('shortens home paths and keeps banner / help readable', () => {
    setColorEnabled(false);
    process.env.COPPERHEAD_NO_ANIM = '1';
    expect(shortPath(`${process.env.HOME}/OpenSource/circuits/copperhead`)).toMatch(/^~/);
    const text = banner({
      repoRoot: '/tmp/demo-board',
      model: 'cursor',
      modelSource: 'flag',
      version: '0.7.0',
      kicadCliVersion: '10.0.5',
      renderer: plainRenderer(() => {}),
    }).join('\n');
    expect(text).toContain('copperhead');
    expect(text).toContain('v0.7.0');
    expect(text).toContain('██▌ ▐██'); // brand via block mark (favicon.svg)
    expect(text).toContain('cursor');
    expect(text).toContain('kicad-cli');
    expect(helpText()).toContain('/check');
    expect(helpText()).toContain('/demo');
    expect(helpText()).toContain('/status');
    expect(helpText()).toContain('live command');
    expect(helpText()).toContain('<request>');
    expect(demoTourText()).toContain('What copperhead does');
    expect(examplesText()).toContain('add reverse-polarity');
  });
});

describe('promptWithSlashHints', () => {
  it('shows hovered command description above the list', () => {
    setColorEnabled(false);
    const lines = suggestionLines(
      [
        { value: '/demo', label: '/demo', description: 'tour text' },
        { value: '/quit', label: '/quit', description: 'leave the shell' },
      ],
      1,
    );
    const joined = lines.join('\n');
    expect(joined).toContain('/quit');
    expect(joined).toContain('leave the shell');
  });

  it('counts wrap rows for long pasted lines', () => {
    expect(inputRowRows('> ', 'x'.repeat(20), 10)).toBeGreaterThan(1);
  });

  it('coalesces paste via drainPrintable', async () => {
    setColorEnabled(false);
    const output = new NodePassThrough();
    (output as unknown as { columns: number }).columns = 40;
    const queued = ['p', 'p', 'e', 'n', 'd'];
    let i = 0;
    const seq = ['A', ...queued, '\r'];
    const line = await promptWithSlashHints({
      prompt: '> ',
      commands: SLASH_COMMANDS,
      output: output as unknown as NodeJS.WriteStream,
      readKey: async () => (i < seq.length ? seq[i++]! : null),
      drainPrintable: () => {
        let out = '';
        while (queued.length) out += queued.shift()!;
        i += out.length; // skip drained keys in readKey sequence
        return out;
      },
    });
    expect(line).toBe('Append');
  });

  it('shows matches as soon as / is typed and Enter picks the highlight', async () => {
    setColorEnabled(false);
    const output = new NodePassThrough();
    let painted = '';
    output.on('data', (c) => {
      painted += String(c);
    });
    const line = await promptWithSlashHints({
      prompt: '> ',
      commands: SLASH_COMMANDS,
      output: output as unknown as NodeJS.WriteStream,
      readKey: keySequence(['/', 'd', '\r']),
    });
    expect(line).toBe('/demo');
    expect(painted).toContain('/demo');
    // Final committed line in scrollback must show the selected command.
    expect(painted).toMatch(/> \/demo\n/);
  });

  it('↓ moves the highlight before Enter', async () => {
    setColorEnabled(false);
    const output = new NodePassThrough();
    let painted = '';
    output.on('data', (c) => {
      painted += String(c);
    });
    const line = await promptWithSlashHints({
      prompt: '> ',
      commands: SLASH_COMMANDS,
      output: output as unknown as NodeJS.WriteStream,
      readKey: keySequence(['/', '\x1b[B', '\r']),
    });
    expect(line).toBe('/examples');
    expect(painted).toContain('example change-request prompts');
  });

  it('assembles arrow keys that arrive split across chunks', () => {
    const pending = { buf: '' };
    const keys: string[] = [];
    pushKeys(pending, '\x1b', (k) => keys.push(k));
    expect(keys).toEqual([]); // wait for rest of sequence
    pushKeys(pending, '[B', (k) => keys.push(k));
    expect(keys).toEqual(['\x1b[B']);
  });

  it('SS3 arrow sequences work (\\x1bOA)', async () => {
    setColorEnabled(false);
    const output = new NodePassThrough();
    const line = await promptWithSlashHints({
      prompt: '> ',
      commands: SLASH_COMMANDS,
      output: output as unknown as NodeJS.WriteStream,
      readKey: keySequence(['/', '\x1bOB', '\x1bOB', '\r']),
    });
    // /demo → /examples → /status
    expect(line).toBe('/status');
  });
});

describe('demo scaffold', () => {
  it('creates a git repo with config ready for create', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'copperhead-demo-'));
    try {
      await scaffoldDemoRepo(dir);
      expect(existsSync(path.join(dir, '.git'))).toBe(true);
      expect(existsSync(path.join(dir, '.copperhead/config.json'))).toBe(true);
      expect(existsSync(defaultBriefPath())).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runRepl', () => {
  it('refuses a non-TTY shell without a seed', async () => {
    setColorEnabled(false);
    const lines: string[] = [];
    const input = new PassThrough();
    const output = new PassThrough();
    const res = await runRepl({
      repoRoot: '/tmp/repo',
      model: 'gpt-5',
      modelSource: 'flag',
      version: '0.7.0',
      kicadCliVersion: '9.0.0',
      renderer: plainRenderer(() => {}),
      log: (l) => lines.push(l),
      input,
      output,
    });
    expect(res.ok).toBe(false);
    expect(lines.join('\n')).toContain('requires a TTY');
  });

  it('runs a seed on non-TTY as a one-shot', async () => {
    setColorEnabled(false);
    const lines: string[] = [];
    const runRequest = vi.fn(async () => ({ outcome: 'success' as const }));
    const res = await runRepl({
      repoRoot: '/tmp/repo',
      model: 'gpt-5',
      modelSource: 'flag',
      version: '0.7.0',
      kicadCliVersion: '9.0.0',
      seed: 'add ESD diodes',
      renderer: plainRenderer(() => {}),
      log: (l) => lines.push(l),
      input: new PassThrough(),
      output: new PassThrough(),
      runRequest,
    });
    expect(res).toEqual({ ok: true, turns: 1 });
    expect(runRequest).toHaveBeenCalledWith('add ESD diodes');
  });

  it('handles /help /demo /examples /model /check /quit on a TTY', async () => {
    setColorEnabled(false);
    const { input, output, lines, opts } = baseOpts();
    const done = runRepl(opts);

    // Drive the prompt after the banner is written.
    await new Promise((r) => setTimeout(r, 20));
    input.write('/help\n');
    await new Promise((r) => setTimeout(r, 20));
    input.write('/demo\n');
    await new Promise((r) => setTimeout(r, 20));
    input.write('/examples\n');
    await new Promise((r) => setTimeout(r, 20));
    input.write('/model\n');
    await new Promise((r) => setTimeout(r, 20));
    input.write('/check\n');
    await new Promise((r) => setTimeout(r, 20));
    input.write('/quit\n');

    const res = await done;
    expect(res.ok).toBe(true);
    expect(res.turns).toBe(0);
    expect(lines.join('\n')).toContain('██▌ ▐██');
    expect(lines.join('\n')).toContain('/quit');
    expect(lines.join('\n')).toContain('What copperhead does');
    expect(lines.join('\n')).toContain('Example prompts');
    expect(lines.join('\n')).toContain('gpt-5');
    expect(lines.join('\n')).toContain('via flag');
    expect(lines).toContain('check ok');
    expect(lines.join('\n')).toContain('session ended');
    expect(opts.runRequest).not.toHaveBeenCalled();
  });

  it('typing /demo via live hints then /quit works end-to-end', async () => {
    setColorEnabled(false);
    const { input, lines, opts } = baseOpts();
    const done = runRepl(opts);

    await new Promise((r) => setTimeout(r, 30));
    input.write('/demo\n');
    await new Promise((r) => setTimeout(r, 40));
    input.write('/quit\n');

    const res = await done;
    expect(res.ok).toBe(true);
    expect(lines.join('\n')).toContain('What copperhead does');
    expect(lines.join('\n')).toContain('session ended');
  });


  it('runs a natural-language request then continues until /quit', async () => {
    setColorEnabled(false);
    const { input, output, lines, opts } = baseOpts();
    const done = runRepl(opts);

    await new Promise((r) => setTimeout(r, 20));
    input.write('rename net KEY_DAH to KEY_DASH\n');
    await new Promise((r) => setTimeout(r, 20));
    input.write('/quit\n');

    const res = await done;
    expect(res).toEqual({ ok: true, turns: 1 });
    expect(opts.runRequest).toHaveBeenCalledWith('rename net KEY_DAH to KEY_DASH');
    expect(lines.join('\n')).toContain('session ended');
    void output; // keep stream alive for typing
  });
});
