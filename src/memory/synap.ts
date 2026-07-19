/**
 * Cross-run memory via Synap (https://docs.maximem.ai).
 *
 * copperhead's own memory is per-repo and file-based: docs/DECISIONS.md, the
 * constraint registry, the drift checker. Synap is the layer above that — what
 * this user tends to want across every board they've ever asked about. It
 * complements the docs; it does not replace them, and nothing here is a source
 * of truth. Recalled text is advisory context in the system prompt, while
 * as-built facts still come from the KiCad files.
 *
 * Three properties are load-bearing:
 *
 * 1. Opt-in. Inactive unless SYNAP_API_KEY is set, so the default install is
 *    unchanged and `check` stays network-free (it never constructs this).
 * 2. Optional at runtime. @maximem/synap-js-sdk is an optionalDependency and is
 *    imported lazily through a non-literal specifier, so a missing package (or
 *    a host without the Python 3.11+ runtime its bridge needs) degrades to
 *    "no memory" instead of breaking the CLI.
 * 3. Fail-soft on read, loud on write. A recall failure must never cost someone
 *    a design run; a record failure is reported, because silently losing writes
 *    lets memory drift away from what actually happened.
 */
import { randomUUID } from 'node:crypto';
import { execa } from 'execa';
import { redactSecrets } from '../util/redact.js';

/** Wall-clock ceiling on any single Synap call. The bridge is a Python subprocess. */
const RECALL_TIMEOUT_MS = 10_000;
const RECORD_TIMEOUT_MS = 15_000;
const MAX_RECALLED = 8;

/**
 * Structural subset of @maximem/synap-js-sdk's surface. Declared locally rather
 * than imported so `tsc` succeeds when the optional dependency is absent.
 */
interface SynapSearchItem {
  memory: string;
  score?: number;
  contextType?: string;
}
interface SynapClientLike {
  init(): Promise<void>;
  searchMemory(input: {
    userId: string;
    customerId?: string;
    query: string;
    maxResults?: number;
  }): Promise<{ results: SynapSearchItem[] }>;
  addMemory(input: {
    userId: string;
    customerId: string;
    conversationId?: string;
    messages: Array<{ role?: 'user' | 'assistant'; content: string }>;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean }>;
  shutdown(): Promise<void>;
}

export interface RunRecord {
  request: string;
  outcome: 'success' | 'refused';
  summary: string;
  changeId: string | null;
  filesTouched: string[];
  decisions: string[];
  verification: string;
}

export interface SynapMemory {
  /** Prior context relevant to this request, as a prompt-ready markdown block. */
  recall(request: string): Promise<string | null>;
  /** Persist a finished run. Rejects if the write fails. */
  record(run: RunRecord): Promise<void>;
  /** Stop the bridge subprocess. Always call this, or the CLI will not exit. */
  close(): Promise<void>;
}

export function synapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SYNAP_API_KEY);
}

/**
 * Identity for memory scoping. The git committer email is the natural stable
 * user id here: it is already the identity every run is attributed to.
 */
async function resolveUserId(repoRoot: string, env: NodeJS.ProcessEnv): Promise<string> {
  if (env.SYNAP_USER_ID) return env.SYNAP_USER_ID;
  try {
    const { stdout } = await execa('git', ['config', 'user.email'], { cwd: repoRoot });
    if (stdout.trim()) return stdout.trim();
  } catch {
    // not configured; fall through
  }
  return 'copperhead-local';
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Returns null when memory is disabled or unavailable — every caller treats
 * null as "run without cross-run memory".
 */
export async function openSynapMemory(opts: {
  repoRoot: string;
  log?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
}): Promise<SynapMemory | null> {
  const env = opts.env ?? process.env;
  const log = opts.log ?? (() => {});
  if (!synapEnabled(env)) return null;

  let client: SynapClientLike;
  try {
    // Non-literal specifier: keeps tsc from resolving an optional dependency at
    // build time, so the package may legitimately be absent.
    const specifier = '@maximem/synap-js-sdk';
    const mod = (await import(specifier)) as {
      createClient?: (o?: Record<string, unknown>) => SynapClientLike;
      default?: { createClient?: (o?: Record<string, unknown>) => SynapClientLike };
    };
    const createClient = mod.createClient ?? mod.default?.createClient;
    if (!createClient) throw new Error('createClient not exported');
    client = createClient({ apiKey: env.SYNAP_API_KEY, requestTimeoutMs: RECORD_TIMEOUT_MS });
    await withTimeout(client.init(), RECORD_TIMEOUT_MS, 'synap init');
  } catch (err) {
    // Missing package, missing Python runtime, bad key: all non-fatal.
    log(`synap memory unavailable (${(err as Error).message}); continuing without it`);
    return null;
  }

  const userId = await resolveUserId(opts.repoRoot, env);
  const customerId = env.SYNAP_CUSTOMER_ID ?? 'copperhead';
  const conversationId = randomUUID();

  return {
    async recall(request) {
      try {
        const res = await withTimeout(
          client.searchMemory({
            userId,
            customerId,
            query: redactSecrets(request),
            maxResults: MAX_RECALLED,
          }),
          RECALL_TIMEOUT_MS,
          'synap recall',
        );
        const items = (res.results ?? []).filter((r) => r.memory?.trim());
        if (!items.length) return null;
        const lines = items.map((r) => `- ${r.memory.trim()}${r.contextType ? ` _(${r.contextType})_` : ''}`);
        return [
          '## Recalled from prior runs (Synap)',
          '',
          'Context from earlier work by this user, possibly on other boards. Advisory only:',
          'the KiCad files and this repo’s docs remain the source of truth. If any of this',
          'conflicts with what you read in the repo, the repo wins — say so rather than',
          'acting on a stale memory.',
          '',
          ...lines,
        ].join('\n');
      } catch (err) {
        log(`synap recall failed (${(err as Error).message}); continuing without it`);
        return null;
      }
    },

    async record(run) {
      const assistant = [
        `Outcome: ${run.outcome}`,
        `Summary: ${run.summary}`,
        `OpenSpec change: ${run.changeId ?? 'n/a'}`,
        `Verification: ${run.verification}`,
        run.filesTouched.length ? `Files: ${run.filesTouched.join(', ')}` : null,
        run.decisions.length ? `Decisions:\n${run.decisions.map((d) => `- ${d}`).join('\n')}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      await withTimeout(
        client.addMemory({
          userId,
          customerId,
          conversationId,
          messages: [
            { role: 'user', content: redactSecrets(run.request) },
            { role: 'assistant', content: redactSecrets(assistant) },
          ],
          metadata: { source: 'copperhead', outcome: run.outcome, changeId: run.changeId },
        }),
        RECORD_TIMEOUT_MS,
        'synap record',
      );
    },

    async close() {
      try {
        await withTimeout(client.shutdown(), RECORD_TIMEOUT_MS, 'synap shutdown');
      } catch {
        // Best effort: a failed shutdown must not change the run's outcome.
      }
    },
  };
}
