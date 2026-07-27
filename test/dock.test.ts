import { describe, it, expect, beforeEach } from 'vitest';
import { TerminalDock } from '../src/util/dock.js';
import {
  boxLines,
  callout,
  inverse,
  statusBar,
  visibleWidth,
  wrapSpans,
} from '../src/agent/box.js';
import { keySequence, promptWithSlashHints, suggestionLines } from '../src/util/live-prompt.js';
import { SLASH_COMMANDS } from '../src/commands/repl.js';
import { setColorEnabled } from '../src/agent/theme.js';

function fakeOut(columns = 40): NodeJS.WriteStream & { written: string } {
  const state = { written: '', columns, rows: 24 };
  return {
    get written() {
      return state.written;
    },
    columns: state.columns,
    rows: state.rows,
    write(c: string) {
      state.written += c;
      return true;
    },
  } as unknown as NodeJS.WriteStream & { written: string };
}

beforeEach(() => setColorEnabled(false));

describe('box primitives', () => {
  it('wrapSpans slices across span boundaries at the wrap width', () => {
    expect(wrapSpans([{ text: 'abc' }, { text: 'defg' }], 5)).toEqual(['abcde', 'fg']);
    expect(wrapSpans([{ text: '' }], 5)).toEqual(['']);
  });

  it('wrapSpans applies styling per slice so SGR never spans a wrap', () => {
    setColorEnabled(true);
    try {
      const lines = wrapSpans([{ text: 'abcdef', paint: (s) => `<${s}>` }], 3);
      expect(lines).toEqual(['<abc>', '<def>']);
    } finally {
      setColorEnabled(false);
    }
  });

  it('boxLines renders rounded borders at a constant visible width', () => {
    const lines = boxLines(['hi'], 20);
    expect(lines).toHaveLength(3);
    expect(lines[0]!.startsWith('╭')).toBe(true);
    expect(lines[2]!.startsWith('╰')).toBe(true);
    for (const line of lines) expect(visibleWidth(line)).toBe(20);
    expect(lines[1]).toContain('hi');
  });

  it('statusBar right-justifies within the width and degrades when narrow', () => {
    const line = statusBar('left', 'R', 20);
    expect(visibleWidth(line)).toBe(20);
    expect(line.endsWith('R')).toBe(true);
    expect(statusBar('a very long left side', 'right', 10)).toBe('a very long left side');
  });

  it('callout carries the bar, title, and body', () => {
    const lines = callout('info', 'New repository?', ['run copperhead init']);
    expect(lines[0]).toContain('▌');
    expect(lines[0]).toContain('New repository?');
    expect(lines[1]).toContain('run copperhead init');
  });

  it('inverse is a no-op when color is off and wraps when on', () => {
    expect(inverse('x')).toBe('x');
    setColorEnabled(true);
    try {
      expect(inverse('x')).toBe('\x1b[7mx\x1b[0m');
    } finally {
      setColorEnabled(false);
    }
  });
});

describe('TerminalDock', () => {
  it('log writes the scrollback line and repaints the dock below it', () => {
    const out = fakeOut();
    const dock = new TerminalDock(out);
    dock.set(['DOCK-ROW']);
    dock.log('hello');
    const firstDock = out.written.indexOf('DOCK-ROW');
    const hello = out.written.indexOf('hello\n');
    const lastDock = out.written.lastIndexOf('DOCK-ROW');
    expect(firstDock).toBeGreaterThanOrEqual(0);
    expect(hello).toBeGreaterThan(firstDock);
    expect(lastDock).toBeGreaterThan(hello);
  });

  it('erase accounts for soft-wrapped rows', () => {
    const out = fakeOut(10);
    const dock = new TerminalDock(out);
    dock.set(['x'.repeat(25)]); // 3 physical rows at 10 cols
    dock.set(['y']);
    const ups = out.written.match(/\x1b\[1A/g) ?? [];
    expect(ups).toHaveLength(2);
  });

  it('release clears the dock and restores the cursor', () => {
    const out = fakeOut();
    const dock = new TerminalDock(out);
    dock.set(['ROW']);
    dock.release();
    expect(out.written).toContain('\x1b[?25h');
    // A release with nothing painted must not move the cursor up.
    const out2 = fakeOut();
    new TerminalDock(out2).release();
    expect(out2.written).not.toContain('\x1b[1A');
  });
});

describe('suggestionLines windowing', () => {
  it('caps long lists and reports the hidden count', () => {
    const lines = suggestionLines(SLASH_COMMANDS, 10, 8);
    const itemRows = lines.filter((l) => /  [❯ ] \//.test(l));
    expect(SLASH_COMMANDS.length).toBeGreaterThan(8);
    expect(itemRows.length).toBeLessThanOrEqual(8);
    expect(lines.join('\n')).toContain('more');
    // The hovered item stays visible inside the window.
    expect(lines.join('\n')).toContain(SLASH_COMMANDS[10]!.label);
  });

  it('keeps small lists unwindowed', () => {
    const lines = suggestionLines(SLASH_COMMANDS.slice(0, 3), 0, 8);
    expect(lines.join('\n')).not.toContain('more');
  });
});

describe('promptWithSlashHints in the dock', () => {
  it('shows the placeholder while empty and returns typed input', async () => {
    const out = fakeOut(60);
    const line = await promptWithSlashHints({
      prompt: '> ',
      commands: SLASH_COMMANDS,
      output: out,
      placeholder: 'Try "add a power LED"',
      readKey: keySequence(['a', '\r']),
    });
    expect(line).toBe('a');
    expect(out.written).toContain('Try "add a power LED"');
    // Box chrome present.
    expect(out.written).toContain('╭');
    expect(out.written).toContain('╰');
    // Submitted line committed to scrollback.
    expect(out.written).toContain('> a\n');
  });

  it('renders the status bar under the input box', async () => {
    const out = fakeOut(60);
    await promptWithSlashHints({
      prompt: '> ',
      commands: SLASH_COMMANDS,
      output: out,
      status: () => ({ left: 'hints here', right: 'model-x' }),
      readKey: keySequence(['\r']),
    });
    expect(out.written).toContain('hints here');
    expect(out.written).toContain('model-x');
  });
});
