# How it works

It is a loop, and it looks a lot like pair programming, except the codebase is a circuit board.

1. **Start from the docs.** Every decision lives in the design docs, so the agent reads those first and knows the whole design, not just the part in front of it.
2. **Talk through the change.** Describe what you want. The agent proposes the parts and the circuit; you push back until the reasoning holds up.
3. **Edit the real files.** Changes go straight into the KiCad schematic and the design docs, using the same part names and net names everywhere so nothing drifts.
4. **Propagate.** Change one value, like a charge current or a pin assignment, and it carries across every doc and schematic that references it. The boring, easy-to-get-wrong step is the one the agent is best at.
5. **Check the work.** The agent runs ERC and DRC, reads the errors back, and fixes them.
6. **Write down why.** Every real decision gets a one-line reason next to it, so the next change does not quietly undo it.

## The two invariants

Everything else in the design follows from these.

### Spec-gated in

The agent cannot touch a KiCad file until a validated OpenSpec proposal for the change exists. This is not a prompt asking it to behave. The `edit_file` and `write_file` tools are structurally absent from the tool list the model sees until the proposal validates, so an ungated edit is not something the model can attempt and fail at: it is not expressible.

### Verification-gated out

No file mutation counts as done until `kicad-cli` ERC passes, plus DRC if the board changed. On failure the agent reads the normalized report back and repairs, up to `maxRepairCycles` attempts. If it still cannot get clean, the run rolls back to the git snapshot taken before the first edit.

Spec-gated in, verification-gated out: the design cannot drift from its requirements, because drift is a build failure.

## How edits are made

KiCad files are edited by anchored exact-match text replacement. copperhead includes an s-expression parser, but it is strictly read-only: it never serializes back out. Nothing round-trips through a data model that might reformat or drop something KiCad cared about, so the diff you review is exactly the change that was intended.

## The sync-obligations ledger

Post-tool-call hooks feed a ledger of open obligations: a drift check that has not run, a constraint written to one place but not its counterpart, a missing `DECISIONS.md` or `CHANGELOG.md` entry. Commit refuses while any obligation is open. The agent cannot finish a run having done the interesting half of a change and skipped the bookkeeping.

## Truth precedence

`sync` reconciles the whole design state, and it has a fixed notion of which source wins:

- **KiCad files are as-built facts.** What the schematic and board actually say is what is true.
- **Specs and budgets are requirements.** What the design is supposed to satisfy.

When a doc disagrees with the schematic, that is drift, and the resolve phase fixes it. When the schematic violates a requirement, that is a violation, and `sync` never silently resolves it: it reports and exits non-zero, because the fix is an engineering decision, not a bookkeeping one.

## What it is not

- **Not an autorouter.** Routing stays human or delegated. copperhead produces the DRC-clean draft that layout tools optimize from.
- **Not a new editor.** No walled garden. Your KiCad install remains the editor.
- **Not the engineer of record.** A human signs off. The agent never claims a design is fab-ready beyond "ERC and DRC clean".
