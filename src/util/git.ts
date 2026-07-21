import { execa } from 'execa';

export interface GitSnapshot {
  head: string;
  stash: string | null;
}

async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd: repo });
  return stdout.trim();
}

export async function isGitRepo(repo: string): Promise<boolean> {
  try {
    await git(repo, ['rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

export async function isDirty(repo: string): Promise<boolean> {
  const status = await git(repo, ['status', '--porcelain']);
  return status.length > 0;
}

/**
 * Snapshot the working tree before a run. On a clean tree HEAD is enough;
 * with --allow-dirty we keep a `git stash create` object so uncommitted work
 * survives a rollback (SPEC §7).
 */
export async function snapshot(repo: string): Promise<GitSnapshot> {
  const head = await git(repo, ['rev-parse', 'HEAD']);
  let stash: string | null = null;
  if (await isDirty(repo)) {
    stash = (await git(repo, ['stash', 'create'])) || null;
  }
  return { head, stash };
}

/**
 * Hard-restore the working tree to a snapshot (AC-3.6). The run audit trail
 * (.copperhead/runs/) survives rollback: it is the evidence of what failed.
 */
export async function restore(repo: string, snap: GitSnapshot): Promise<void> {
  await git(repo, ['reset', '--hard', snap.head]);
  await git(repo, ['clean', '-fd', '-e', '.copperhead/runs']);
  if (snap.stash) {
    await git(repo, ['stash', 'apply', snap.stash]);
  }
}

/**
 * Preserve a failed run's work as a stash entry before rollback, so a failure
 * is recoverable instead of destroyed. `git stash create` alone ignores
 * untracked files (most of what a docs-stage run produces), so everything is
 * staged first; restore() resets the index anyway. Never throws: preservation
 * must not be able to block the rollback itself.
 */
export async function preserveFailedRun(repo: string, runId: string): Promise<string | null> {
  try {
    if (!(await isDirty(repo))) return null;
    await git(repo, ['add', '-A']);
    const sha = await git(repo, ['stash', 'create']);
    if (!sha) return null;
    await git(repo, ['stash', 'store', '-m', `copperhead failed run ${runId}`, sha]);
    return sha;
  } catch {
    return null;
  }
}

export async function commitAll(repo: string, message: string): Promise<string> {
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']);
}

export async function changedFiles(repo: string, sinceHead: string): Promise<string[]> {
  const tracked = await git(repo, ['diff', '--name-only', sinceHead]);
  const untracked = await git(repo, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...tracked.split('\n'), ...untracked.split('\n')])].filter(Boolean);
}
