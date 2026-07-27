import { describe, it, expect, beforeEach } from 'vitest';
import { TerminalDock } from '../src/util/dock.js';
import {
  callout,
  inverse,
  rule,
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

  it('rule spans the requested visible width', () => {
    expect(visibleWidth(rule(20))).toBe(20);
    expect(rule(20)).toContain('─');
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

describe('TerminalDock (scroll-region fence)', () => {
  it('fences content with DECSTBM and paints the dock with absolute addressing', () => {
    const out = fakeOut(40); // rows: 24
    const dock = new TerminalDock(out);
    dock.set(['DOCK-A', 'DOCK-B']);
    // Content fenced to rows 1..22; dock painted at rows 23 and 24.
    expect(out.written).toContain('\x1b[1;22r');
    expect(out.written).toContain('\x1b[23;1H');
    expect(out.written).toContain('\x1b[24;1H');
    expect(out.written).toContain('DOCK-A');
    expect(out.written).toContain('DOCK-B');
  });

  it('same-height repaints never touch the scroll region', () => {
    const out = fakeOut(40);
    const dock = new TerminalDock(out);
    dock.set(['A']);
    const before = (out.written.match(/\x1b\[1;23r/g) ?? []).length;
    dock.set(['B']);
    dock.set(['C']);
    const after = (out.written.match(/\x1b\[1;23r/g) ?? []).length;
    expect(before).toBe(1);
    expect(after).toBe(1); // fence set once, repaints are pure absolute writes
  });

  it('log is a plain write: the fence keeps the dock safe without repaints', () => {
    const out = fakeOut(40);
    const dock = new TerminalDock(out);
    dock.set(['DOCK-ROW']);
    const lenBefore = out.written.length;
    dock.log('hello');
    expect(out.written.slice(lenBefore)).toBe('hello\n');
  });

  it('truncates dock lines to the terminal width so they cannot wrap', () => {
    const out = fakeOut(40);
    const dock = new TerminalDock(out);
    dock.set(['x'.repeat(100)]);
    expect(out.written).toContain('x'.repeat(39));
    expect(out.written).not.toContain('x'.repeat(40));
  });

  it('release resets the region, clears the dock rows, and restores the cursor', () => {
    const out = fakeOut(40);
    const dock = new TerminalDock(out);
    dock.set(['ROW']);
    dock.release();
    expect(out.written).toContain('\x1b[r');
    expect(out.written).toContain('\x1b[?25h');
    expect(out.written).toContain('\x1b[24;1H\x1b[2K');
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
    // Full-width separator rules around the input line.
    expect(out.written).toContain('─'.repeat(59));
    // Submitted line committed to scrollback.
    expect(out.written).toContain('> a\n');
  });

  it('reserves menu space so opening `/` never grows the dock', async () => {
    const heights: number[] = [];
    const out = fakeOut(60);
    const dock = new TerminalDock(out);
    const origSet = dock.set.bind(dock);
    dock.set = (lines: string[]) => {
      heights.push(lines.length);
      origSet(lines);
    };
    await promptWithSlashHints({
      prompt: '> ',
      commands: SLASH_COMMANDS,
      output: out,
      dock,
      status: () => ({ left: 'l', right: 'r' }),
      readKey: keySequence(['/', '\x1b', '\r']),
    });
    // Closed prompt, open menu, dismissed menu: all the same dock height.
    expect(new Set(heights).size).toBe(1);
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

  it('requires Ctrl+C twice to exit and clears the buffer first', async () => {
    const out = fakeOut(60);
    const line = await promptWithSlashHints({
      prompt: '> ',
      commands: SLASH_COMMANDS,
      output: out,
      readKey: keySequence(['a', '\x03', '\x03']),
    });
    expect(line).toBeNull();
    expect(out.written).toContain('press ctrl+c again to exit');
  });

  it('any key after Ctrl+C disarms the exit', async () => {
    const out = fakeOut(60);
    const line = await promptWithSlashHints({
      prompt: '> ',
      commands: SLASH_COMMANDS,
      output: out,
      readKey: keySequence(['\x03', 'x', '\r']),
    });
    expect(line).toBe('x');
  });
});
