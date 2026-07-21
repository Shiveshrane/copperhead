# Proposal: turn-budget-continue-and-loop-efficiency

## Why

Two consecutive `copperhead create` spec-seed runs exhausted the 40-turn budget and were hard-rolled-back, destroying ~90%-complete spec docs at a combined cost of ~500k input tokens (GitHub issue #15). Trace analysis showed the failure is structural, not model slowness: one tool call per turn, 27 of 34 revisit obligations pointed at artifacts that did not exist yet, and turn exhaustion is a silent destroy-the-work path with no human decision point.

## What Changes

- On turn-budget exhaustion, the loop asks the user whether to continue (showing turns used, files touched, open obligations, and token usage) instead of unconditionally failing. Declining, or a non-interactive/CI run, keeps today's fail-and-restore behavior.
- Before any failure rollback, the touched work is preserved as a git stash entry (`copperhead failed run <run-id>`), so budget-exhaustion failures become recoverable instead of destroyed.
- The system prompt and the 5-turns-remaining nudge instruct the model to batch independent tool calls in a single response (both providers already execute all calls in one turn).
- `record_constraint` no longer opens `affects-revisit` obligations for artifacts that do not exist yet (no schematic/board configured, doc file absent); they are recorded as deferred and surfaced in the tool result and run summary.
- `resolve_affected` accepts an array form (`resolutions: [...]`) so one call can clear a backlog.
- The Anthropic provider sends `cache_control` breakpoints (system prompt, last tool definition, final message block), cutting repeated-prefix input cost on Claude runs by roughly an order of magnitude.
- Smaller dials: `record_constraint` returns the running open-obligation count; `maxTurns` is configurable per create-pipeline stage via `stageMaxTurns` in config; `search` rejects empty patterns with a corrective hint; `run_erc`/`run_drc` without a configured artifact say the check is not applicable yet so the model stops retrying.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-core`: turn-budget exhaustion becomes a continue-or-fail decision with token usage visible; prompts instruct tool-call batching; obligation bookkeeping skips nonexistent artifacts; `resolve_affected` gains an array form; tool results gain convergence feedback (open-obligation count, not-applicable verification, empty-pattern rejection); the Anthropic provider uses prompt caching.
- `safety-rails`: rollback on failure preserves the failed work in a git stash entry before restoring the snapshot.
- `create-pipeline`: per-stage turn budgets via `stageMaxTurns` config.

## Impact

- `src/agent/loop.ts`: turn loop becomes extendable, budget-exhaustion prompt, stash preservation in `fail()`, batching line in the convergence nudge.
- `src/agent/tools.ts`: `record_constraint` deferral + obligation count, `resolve_affected` array form, `search`/`run_erc`/`run_drc` message fixes.
- `src/agent/ledger.ts`: deferred-obligation tracking.
- `src/agent/prompts.ts`: batching instruction in WORKFLOW.
- `src/agent/providers/anthropic.ts`: `cache_control` breakpoints.
- `src/util/git.ts`: `preserveFailedRun` helper.
- `src/config.ts`, `src/commands/create.ts`: `stageMaxTurns`.
- `src/cli.ts`: TTY continue-prompt wiring for `do` and `create`.
- Tests: unit tests for all of the above in `test/`; no live-LLM tests required.
