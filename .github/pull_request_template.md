<!--
Fill in the sections that apply and delete the rest, including this comment.
Keep prose em-dash-free (use colons, commas, or parentheses).
Reference files as clickable relative links, e.g. [loop.ts](src/agent/loop.ts).
-->

## What

<!-- One or two sentences: what this PR changes, from the user's point of view. -->

## Why

<!-- The gap or problem this closes. Link the issue if there is one. -->

## Design

<!-- Only if the change is non-trivial. How it works and the load-bearing decisions.
     If it touches the agent loop, safety gates, providers, or the KiCad layer, say how the
     invariants below are preserved. Link to design.md decisions where relevant. -->

## Spec / OpenSpec

<!-- If this changes spec-level behavior, SPEC.md and the active change artifacts must move together.
     List the OpenSpec change, the affected acceptance criteria (AC-x.y), and any delta specs.
     Delete this section for a pure refactor or docs-only PR. -->

## Testing

<!-- What you ran and what it produced (real results, not assumed):
     - new or changed tests, and pass/skip counts
     - `npm run typecheck` / `npm run build` / `npm test` status
     - any live-LLM verification, and how it was keyed
     - known pre-existing failures unrelated to this PR -->

## Docs

<!-- README, configuration reference, .env.example, doc comments, or CHANGELOG/DECISIONS entries touched. -->

---

## Invariant checklist

<!-- These are hard requirements from SPEC.md. Check the boxes this PR is responsible for;
     mark N/A for the ones it does not touch. A reviewer will verify each. -->

- [ ] **Spec-gated in**: `edit_file`/`write_file` stay structurally absent from the agent tool list until an OpenSpec proposal validates (gated by omission, not prompt text).
- [ ] **Verification-gated out**: mutations still end in ERC (and DRC when the board changed) passing, with repair up to `maxRepairCycles` then rollback to the git snapshot.
- [ ] **`check`/`verify` stays LLM-free and network-free**: nothing reachable from `src/commands/check` touches a provider, an API key, or the network.
- [ ] **No sexp serialization**: the `src/kicad/` parser stays read-only; KiCad files are edited only via anchored exact-match text replace (no round-tripping).
- [ ] **Sync-obligations ledger**: post-tool-call hooks keep feeding the ledger, and commit keeps refusing while obligations are open.
- [ ] **Secrets**: transcripts and summaries redact `sk-[A-Za-z0-9_-]+` at write time; keys live only in env vars; `.gitignore` keeps `.env` and `.copperhead/runs/`.
- [ ] **Spec coherence**: if spec-level behavior changed, SPEC.md and the change artifacts (`proposal.md`, `design.md`, delta specs, `tasks.md`) moved together and `openspec validate <change>` passes.
