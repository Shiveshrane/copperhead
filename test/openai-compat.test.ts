import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeProvider } from '../src/agent/loop.js';
import { OpenAIProvider } from '../src/agent/providers/openai.js';
import {
  DEFAULT_API_KEY_ENV,
  isLocalEndpoint,
  loadConfig,
  resolveCompatSettings,
  type CopperheadConfig,
  DEFAULTS,
} from '../src/config.js';

const base: CopperheadConfig = { schematic: null, board: null, ...DEFAULTS };

async function repoWithConfig(raw: Record<string, unknown>): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ch-compat-'));
  await mkdir(path.join(dir, '.copperhead'), { recursive: true });
  await writeFile(path.join(dir, '.copperhead', 'config.json'), JSON.stringify(raw), 'utf8');
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe('compat settings resolution (D1/D2)', () => {
  it('defaults to OPENAI_API_KEY and no baseURL', () => {
    const s = resolveCompatSettings(base, {});
    expect(s.apiKeyEnv).toBe(DEFAULT_API_KEY_ENV);
    expect(s.baseURL).toBeUndefined();
  });

  it('reads baseURL and apiKeyEnv from config', async () => {
    const { dir, cleanup } = await repoWithConfig({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKeyEnv: 'GROQ_API_KEY',
    });
    try {
      const cfg = await loadConfig(dir);
      const s = resolveCompatSettings(cfg, {});
      expect(s.baseURL).toBe('https://api.groq.com/openai/v1');
      expect(s.apiKeyEnv).toBe('GROQ_API_KEY');
    } finally {
      await cleanup();
    }
  });

  it('environment overrides config, matching resolveModel precedence', () => {
    const cfg = { ...base, baseURL: 'https://from-config/v1', apiKeyEnv: 'CONFIG_KEY' };
    const s = resolveCompatSettings(cfg, {
      COPPERHEAD_BASE_URL: 'https://from-env/v1',
      COPPERHEAD_API_KEY_ENV: 'ENV_KEY',
    });
    expect(s.baseURL).toBe('https://from-env/v1');
    expect(s.apiKeyEnv).toBe('ENV_KEY');
  });

  it('ignores blank values rather than treating them as configured', async () => {
    const { dir, cleanup } = await repoWithConfig({ baseURL: '   ', apiKeyEnv: '' });
    try {
      const cfg = await loadConfig(dir);
      expect(cfg.baseURL).toBeUndefined();
      expect(resolveCompatSettings(cfg, {}).apiKeyEnv).toBe(DEFAULT_API_KEY_ENV);
    } finally {
      await cleanup();
    }
  });

  it('isLocalEndpoint recognises loopback hosts only', () => {
    for (const u of ['http://localhost:11434/v1', 'http://127.0.0.1:8080/v1', 'http://ollama.local/v1']) {
      expect(isLocalEndpoint(u), u).toBe(true);
    }
    for (const u of ['https://api.groq.com/openai/v1', 'https://openrouter.ai/api/v1', undefined, 'not a url']) {
      expect(isLocalEndpoint(u as string | undefined), String(u)).toBe(false);
    }
  });
});

describe('OpenAIProvider — compatible endpoints', () => {
  it('reads the key from the configured variable name, not always OPENAI_API_KEY', () => {
    const p = new OpenAIProvider(
      'qwen-3-coder',
      { baseURL: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY' },
      { GROQ_API_KEY: 'gsk-test' },
    );
    expect(p.name).toBe('openai');
  });

  // The headline claim of this change is "point it anywhere and it works", so
  // verify the request really lands on the configured endpoint rather than
  // asserting on a constructed object. A loopback server keeps it hermetic:
  // no egress, no key, deterministic.
  it('actually issues its request to the configured baseURL, with the model and key', async () => {
    const seen: { url?: string; auth?: string; body?: Record<string, unknown> } = {};
    const server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        seen.url = req.url;
        seen.auth = req.headers.authorization;
        seen.body = JSON.parse(raw) as Record<string, unknown>;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: 'pong', tool_calls: [] } }],
            usage: { prompt_tokens: 7, completion_tokens: 3 },
          }),
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    try {
      const p = new OpenAIProvider(
        'qwen-3-coder',
        { baseURL: `http://127.0.0.1:${port}/v1`, apiKeyEnv: 'GROQ_API_KEY' },
        { GROQ_API_KEY: 'gsk-test' },
      );
      const turn = await p.chat([{ role: 'user', content: 'ping' }], []);
      expect(seen.url).toBe('/v1/chat/completions'); // baseURL honoured, path appended
      expect(seen.auth).toBe('Bearer gsk-test'); // key from GROQ_API_KEY, not OPENAI_API_KEY
      expect(seen.body?.model).toBe('qwen-3-coder'); // model id passed through
      expect(turn.text).toBe('pong');
      expect(turn.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('a keyless loopback endpoint still sends a request the server accepts (Ollama shape)', async () => {
    let hit = false;
    const server = createServer((req, res) => {
      hit = true;
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: {} }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    try {
      const p = new OpenAIProvider('llama3', { baseURL: `http://localhost:${port}/v1`, apiKeyEnv: 'UNUSED' }, {});
      const turn = await p.chat([{ role: 'user', content: 'hi' }], []);
      expect(hit).toBe(true);
      expect(turn.text).toBe('ok');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('a remote endpoint without its key throws, naming the variable it expected', () => {
    expect(
      () =>
        new OpenAIProvider('qwen-3-coder', { baseURL: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY' }, {}),
    ).toThrow('GROQ_API_KEY is not set');
  });

  it('a loopback endpoint constructs with no key at all (D4: Ollama)', () => {
    expect(
      () => new OpenAIProvider('llama3', { baseURL: 'http://localhost:11434/v1', apiKeyEnv: 'UNUSED' }, {}),
    ).not.toThrow();
  });

  it('defaults cleanly with no options, resolving the key only through env (never a literal)', () => {
    // OpenAIProviderOptions has no `apiKey` field: a key can only ever reach
    // the provider by being present under the configured env var name,
    // enforced at compile time (an `apiKey` property here would not typecheck).
    expect(() => new OpenAIProvider('gpt-5', undefined, { OPENAI_API_KEY: 'sk-test' })).not.toThrow();
    expect(() => new OpenAIProvider('gpt-5', undefined, {})).toThrow('OPENAI_API_KEY is not set');
  });
});

describe('makeProvider — compat routing', () => {
  const groq = { baseURL: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY' };
  const withKey = <T>(fn: () => T): T => {
    process.env.GROQ_API_KEY = 'gsk-test';
    try {
      return fn();
    } finally {
      delete process.env.GROQ_API_KEY;
    }
  };

  it('routes compat:<model-id> to the OpenAI provider', async () => {
    await withKey(async () => {
      const p = await makeProvider('compat:qwen-3-coder', false, groq);
      expect(p).toBeInstanceOf(OpenAIProvider);
      expect(p.name).toBe('openai');
    });
  });

  it('rejects an empty override, like every other prefixed route', async () => {
    await expect(makeProvider('compat:', false, groq)).rejects.toThrow('compat model override cannot be empty');
  });

  it('refuses bare `compat` with no endpoint configured', async () => {
    await expect(makeProvider('compat', false, { apiKeyEnv: DEFAULT_API_KEY_ENV })).rejects.toThrow(
      /requires a model id and an endpoint/,
    );
  });

  it('refuses bare `compat` even when an endpoint IS configured — no silent default model (regression)', async () => {
    // Bug: `if (!compatModel && !settings.baseURL)` only threw when BOTH were
    // missing, so bare `compat` with a configured baseURL fell through to
    // `new OpenAIProvider(undefined, ...)`, which silently defaulted to the
    // literal model id "gpt-5" — sent to whatever host baseURL pointed at.
    // Unlike gpt-5/claude, a compat endpoint has no id that is ever correct to
    // assume, so this must throw regardless of whether baseURL is set.
    await withKey(async () => {
      await expect(makeProvider('compat', false, groq)).rejects.toThrow(/requires a model id/);
    });
  });

  it('refuses compat:<model-id> with no endpoint configured — no silent fallback to real OpenAI (regression)', async () => {
    // Bug: a model id alone skipped the guard entirely, so `new OpenAIProvider`
    // was built with no baseURL and fell back to its own default client —
    // silently hitting real api.openai.com with a non-OpenAI model id and
    // whatever key apiKeyEnv resolved to.
    await withKey(async () => {
      await expect(makeProvider('compat:llama-3.1-8b-instant', false, { apiKeyEnv: 'GROQ_API_KEY' })).rejects.toThrow(
        /requires an endpoint/,
      );
    });
  });

  it('surfaces the missing key for a remote endpoint', async () => {
    await expect(makeProvider('compat:qwen-3-coder', false, groq)).rejects.toThrow('GROQ_API_KEY is not set');
  });

  it('a stray COPPERHEAD_BASE_URL never redirects a plain gpt-5 run (D2)', async () => {
    // resolveCompatSettings correctly reports the env base URL — that alone
    // does not prove makeProvider ignores it. Route through the real makeProvider,
    // passing the resolved settings through exactly as loop.ts/create.ts do, so a
    // future regression that accidentally threads `compat` into the non-compat
    // fallback branch would actually fail this test.
    const s = resolveCompatSettings(base, { COPPERHEAD_BASE_URL: 'https://evil.example/v1' });
    expect(s.baseURL).toBe('https://evil.example/v1');
    process.env.OPENAI_API_KEY = 'sk-test';
    try {
      const p = await makeProvider('gpt-5', false, s);
      expect(JSON.stringify(p)).not.toContain('evil.example');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});
