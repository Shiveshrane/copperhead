import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Behaviour of the Synap cross-run memory layer. The SDK is mocked: these tests
 * assert the contract copperhead depends on (opt-in, fail-soft reads, loud
 * writes, redaction) without needing an API key or the Python bridge.
 */

const searchMemory = vi.fn();
const addMemory = vi.fn();
const shutdown = vi.fn(async () => {});
const init = vi.fn(async () => {});

vi.mock('@maximem/synap-js-sdk', () => ({
  createClient: () => ({ init, searchMemory, addMemory, shutdown }),
}));

const { openSynapMemory, synapEnabled } = await import('../src/memory/synap.js');

const REPO = process.cwd();
const withKey = { SYNAP_API_KEY: 'synap_test', SYNAP_USER_ID: 'alice' } as NodeJS.ProcessEnv;

beforeEach(() => {
  vi.clearAllMocks();
  init.mockResolvedValue(undefined);
});

describe('synap memory: opt-in', () => {
  it('is inert without SYNAP_API_KEY', async () => {
    expect(synapEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    const mem = await openSynapMemory({ repoRoot: REPO, env: {} as NodeJS.ProcessEnv });
    expect(mem).toBeNull();
    expect(init).not.toHaveBeenCalled();
  });

  it('activates when the key is present', async () => {
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey });
    expect(mem).not.toBeNull();
    expect(init).toHaveBeenCalled();
  });

  it('degrades to null when the SDK cannot start', async () => {
    init.mockRejectedValue(new Error('No usable Python runtime found'));
    const logs: string[] = [];
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey, log: (l) => logs.push(l) });
    expect(mem).toBeNull();
    expect(logs.join('\n')).toMatch(/unavailable.*Python/);
  });
});

describe('synap memory: recall', () => {
  it('formats results and marks the repo as authoritative', async () => {
    searchMemory.mockResolvedValue({
      results: [
        { memory: 'Prefers TPS63020 for buck-boost', contextType: 'preference' },
        { memory: 'Sleep budget on prior boards was 10uA', contextType: 'fact' },
      ],
    });
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey });
    const out = await mem!.recall('add a buck-boost');
    expect(out).toContain('- Prefers TPS63020 for buck-boost _(preference)_');
    expect(out).toContain('- Sleep budget on prior boards was 10uA _(fact)_');
    expect(out).toContain('the repo wins');
    expect(searchMemory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'alice', query: 'add a buck-boost' }),
    );
  });

  it('returns null on no results', async () => {
    searchMemory.mockResolvedValue({ results: [] });
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey });
    expect(await mem!.recall('anything')).toBeNull();
  });

  it('never throws when the read fails: a run must not die for memory', async () => {
    searchMemory.mockRejectedValue(new Error('upstream 503'));
    const logs: string[] = [];
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey, log: (l) => logs.push(l) });
    expect(await mem!.recall('anything')).toBeNull();
    expect(logs.join('\n')).toMatch(/recall failed/);
  });

  it('redacts secrets out of the outbound query', async () => {
    searchMemory.mockResolvedValue({ results: [] });
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey });
    await mem!.recall('use key sk-abc123DEF456ghi for the fetch');
    expect(searchMemory.mock.calls[0]![0].query).toBe('use key [REDACTED] for the fetch');
  });
});

describe('synap memory: record', () => {
  const run = {
    request: 'swap the regulator',
    outcome: 'success' as const,
    summary: 'replaced AP2112 with TPS63020',
    changeId: 'swap-regulator',
    filesTouched: ['hardware/board.kicad_sch'],
    decisions: ['TPS63020 chosen for buck-boost range'],
    verification: 'ERC clean, DRC clean',
  };

  it('sends the run as a user/assistant pair with metadata', async () => {
    addMemory.mockResolvedValue({ success: true });
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey });
    await mem!.record(run);
    const payload = addMemory.mock.calls[0]![0];
    expect(payload.userId).toBe('alice');
    expect(payload.customerId).toBe('copperhead');
    expect(payload.messages[0]).toEqual({ role: 'user', content: 'swap the regulator' });
    expect(payload.messages[1].content).toContain('Outcome: success');
    expect(payload.messages[1].content).toContain('ERC clean, DRC clean');
    expect(payload.messages[1].content).toContain('TPS63020 chosen for buck-boost range');
    expect(payload.metadata).toMatchObject({ source: 'copperhead', outcome: 'success' });
  });

  it('surfaces write failures rather than swallowing them', async () => {
    addMemory.mockRejectedValue(new Error('quota exceeded'));
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey });
    await expect(mem!.record(run)).rejects.toThrow('quota exceeded');
  });

  it('redacts secrets out of the outbound record', async () => {
    addMemory.mockResolvedValue({ success: true });
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey });
    await mem!.record({ ...run, request: 'token sk-live-9f8e7d6c5b4a3210zz' });
    expect(addMemory.mock.calls[0]![0].messages[0].content).toBe('token [REDACTED]');
  });
});

describe('synap memory: lifecycle', () => {
  it('shuts the bridge down so the CLI can exit', async () => {
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey });
    await mem!.close();
    expect(shutdown).toHaveBeenCalled();
  });

  it('tolerates a failing shutdown', async () => {
    shutdown.mockRejectedValueOnce(new Error('already dead'));
    const mem = await openSynapMemory({ repoRoot: REPO, env: withKey });
    await expect(mem!.close()).resolves.toBeUndefined();
  });
});
