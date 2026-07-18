# Configuration

## `.copperhead/config.json`

Written by `copperhead init`. Every key is optional; the defaults below apply when a key is absent or the file does not exist.

```json
{
  "schematic": "hardware/board.kicad_sch",
  "board": "hardware/board.kicad_pcb",
  "docs": "docs/",
  "model": null,
  "maxTurns": 40,
  "maxRepairCycles": 5,
  "budgets": {
    "sleep_current_uA": 25
  }
}
```

| Key | Default | Meaning |
| --- | --- | --- |
| `schematic` | `null` | Path to the `.kicad_sch`, relative to the repo root. ERC is skipped when null. |
| `board` | `null` | Path to the `.kicad_pcb`. DRC is skipped when null. |
| `docs` | `"docs/"` | The design docs directory: docs-as-memory. |
| `model` | `null` | Default model. Overridden by `--model` and `COPPERHEAD_MODEL`. |
| `maxTurns` | `40` | Turn budget per run. |
| `maxRepairCycles` | `5` | ERC/DRC repair attempts before the run rolls back to the git snapshot. |
| `budgets` | `{}` | Free-form hard constraints, surfaced verbatim into every run's system prompt. |

There is also a `generatedHashes` key, maintained by copperhead. It records content hashes of the generated docs so `init` can tell an untouched file from a hand-edited one. Do not edit it by hand.

### Budgets

Budgets are hard constraints, not hints. A change that would exceed one is refused with an explanation, rather than accepted and discovered later:

```json
{
  "budgets": {
    "sleep_current_uA": 25,
    "bom_cost_usd": 18.50
  }
}
```

The names are yours. copperhead passes them through verbatim and expects the units to be in the key, as in `sleep_current_uA`.

## `.copperhead/constraints.json`

The constraint registry: machine-readable counterparts to the constraints stated in your design docs. Constraints are dual-written, to the doc and to the registry, and the sync-obligations ledger refuses to let a run commit if one was updated without the other.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI credentials. |
| `ANTHROPIC_API_KEY` | Anthropic credentials. |
| `COPPERHEAD_MODEL` | Default model. Overrides config, overridden by `--model`. |

Keys are read from the environment only. copperhead never writes one to a config file, and redacts anything matching `sk-[A-Za-z0-9_-]+` when writing transcripts and summaries. Keep `.env` out of git; the shipped `.gitignore` already excludes it.

## Model selection

Resolved in strict precedence order:

1. The `--model` flag
2. `COPPERHEAD_MODEL`
3. `model` in `.copperhead/config.json`
4. `gpt-5` if `OPENAI_API_KEY` is set, otherwise `claude` if `ANTHROPIC_API_KEY` is set

If none of these produce a model, the command exits with an error telling you the four ways to set one. `check` never needs a model, since it makes no LLM calls at all.

## Files copperhead writes

| Path | Committed? | What it is |
| --- | --- | --- |
| `docs/*.md` | Yes | Design docs. The agent's memory and its output. |
| `.copperhead/config.json` | Yes | Configuration. |
| `.copperhead/constraints.json` | Yes | Constraint registry. |
| `.copperhead/README.md` | Yes | Self-describing docs for the above. |
| `.copperhead/runs/<ts>/` | No | JSONL transcript plus a human-readable `summary.md`. Gitignored. |
