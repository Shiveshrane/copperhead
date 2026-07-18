# CLI reference

```text
copperhead [global options] <command>
```

Every command probes `kicad-cli` before doing anything and exits 1 if it is not on your `PATH`.

## Global options

| Option | Description |
| --- | --- |
| `--repo <path>` | Target repository. Defaults to the current directory. |
| `--json` | Machine-readable output on stdout. |
| `-V, --version` | Print the version. |

Global options go before the subcommand: `copperhead --json check`.

## `copperhead init`

Scaffolds design docs from an existing schematic. Idempotent.

```bash
copperhead init [--path <dir>] [--force] [--no-hooks]
```

| Option | Description |
| --- | --- |
| `--path <dir>` | Where to look for KiCad files. Default `.`. |
| `--force` | Overwrite generated docs that have been hand-edited. |
| `--no-hooks` | Skip installing the git pre-commit hook. |

Reports each file as `created`, `unchanged`, or `REFUSED`. Exits 1 if anything was refused, 0 otherwise.

## `copperhead do`

The core loop: propose, edit, verify, propagate, commit.

```bash
copperhead do "<change request>" [options]
```

| Option | Description |
| --- | --- |
| `--model <model>` | `gpt-5`, `claude`, or a full model id. |
| `--max-turns <n>` | Turn budget for this run. Overrides `maxTurns` from config. |
| `--allow-dirty` | Permit a dirty working tree. The snapshot is taken with `git stash create`. |
| `--dry-run` | Propose the diff and write nothing. |
| `--interactive` | Pause for approval once the proposal validates. |

Exits 1 if the run ends in failure, 0 otherwise.

## `copperhead check`

Alias: `copperhead verify`.

```bash
copperhead check
```

Runs ERC, DRC, doc-drift detection, constraint checks, and OpenSpec validation. Makes **no LLM calls and no network requests**, which is a contract, not a tendency: this is what makes it safe to run in CI and in a pre-commit hook.

ERC and DRC are skipped when no schematic or board is configured, rather than failing.

| Exit code | Meaning |
| --- | --- |
| `0` | Everything agrees. |
| `1` | At least one check failed, or `kicad-cli` is missing. |

With `--json`, prints a result object with `ok` plus per-check detail for `erc`, `drc`, `drift`, `openspec`, and `constraints`.

## `copperhead sync`

Verifies the whole design state and resolves drift. Two phases: a deterministic verify phase, then an LLM resolve phase.

```bash
copperhead sync [--model <model>] [--dry-run]
```

| Option | Description |
| --- | --- |
| `--model <model>` | Model for the resolve phase. |
| `--dry-run` | Print the inconsistency report and write nothing. |

| Exit code | Meaning |
| --- | --- |
| `0` | Clean, or drift resolved successfully. |
| `1` | The resolve phase failed. |
| `2` | Requirement violations found. |

Exit code 2 is the important one. A requirement violation means the as-built design contradicts a stated requirement, and copperhead will **never** auto-resolve that: the fix is an engineering decision. Drift, where the docs disagree with the files, is resolvable and gets resolved.

## `copperhead create`

The full pipeline from a product brief to the output package.

```bash
copperhead create --brief brief.md [--model <model>] [--interactive]
```

| Option | Description |
| --- | --- |
| `--brief <file>` | **Required.** The product brief, in markdown. |
| `--model <model>` | `gpt-5` or `claude`. |
| `--interactive` | Re-enable the human gates: spec approval, and a pause before export. |
