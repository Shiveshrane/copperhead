# docs-memory — Delta Spec

## ADDED Requirements

### Requirement: `init` scaffolds docs from the real schematic
`copperhead init` SHALL detect the KiCad project, parse symbols/footprints/nets, and generate `docs/SPEC.md`, `BOM.md`, `PINOUT.md`, `SUBSYSTEMS.md`, `LAYOUT.md`, and `.copperhead/config.json` pre-filled with real extracted data, not placeholders.

#### Scenario: Skeleton created (AC-1.1)
- **WHEN** `init` runs on a KiCad repo with no `docs/`
- **THEN** all five docs and `.copperhead/config.json` exist

#### Scenario: BOM reflects the schematic (AC-1.2)
- **WHEN** `init` completes
- **THEN** BOM.md contains one row per schematic symbol with real refdes, value, and footprint, and its row count equals the `list_symbols` count

#### Scenario: Pinout reflects the schematic (AC-1.3)
- **WHEN** `init` completes on a schematic containing an MCU
- **THEN** PINOUT.md contains the MCU's actual pin-to-net assignments parsed from the schematic

#### Scenario: No schematic present (AC-1.5)
- **WHEN** `init` runs on a repo with no `.kicad_sch`
- **THEN** it exits non-zero with a clear message and no stack trace

### Requirement: `init` is idempotent and protects hand edits
Re-running `init` SHALL exit 0 and change no hand-edited file; with modified docs and no `--force`, it SHALL refuse and list what it would overwrite.

#### Scenario: Idempotent re-run (AC-1.4)
- **WHEN** `init` runs twice on the same unchanged repo
- **THEN** the second run exits 0 and no file content changes

#### Scenario: Refusal without --force (AC-1.4)
- **WHEN** a generated doc has been hand-edited and `init` runs without `--force`
- **THEN** it refuses and lists the files it would overwrite

### Requirement: Drift check
`check_drift` SHALL compare the BOM.md and PINOUT.md tables against the parsed schematic and report each mismatch as `{ doc, claim, actual }`; any `do` run that changes a value referenced by a doc MUST update that doc in the same run.

#### Scenario: Doc disagrees with schematic (AC-2.3)
- **WHEN** a BOM.md value is edited to disagree with the schematic (e.g. wrong resistor value) and the drift check runs
- **THEN** it fails and names the doc, the claimed value, and the actual value

#### Scenario: Clean state
- **WHEN** docs and schematic agree
- **THEN** `check_drift` returns an empty list

### Requirement: User-viewable decision log
The system SHALL maintain an append-only, human-readable `docs/DECISIONS.md` scaffolded by `init`; every run SHALL append one entry per non-trivial decision containing the date, run id, decision, one-line rationale, and what it affects. Entries SHALL never be rewritten or deleted by the agent.

#### Scenario: Decision appended during a run
- **WHEN** a `do` run makes a non-trivial decision (e.g. picks a pin, chooses a part, refuses a request)
- **THEN** `docs/DECISIONS.md` gains an appended entry with date, run id, decision, rationale, and affected refdes/nets/docs, and no earlier entry is modified

#### Scenario: Log survives across runs
- **WHEN** a second `do` run completes after a first
- **THEN** the first run's entries are intact and the second run's entries appear after them

### Requirement: Design changelog
The system SHALL maintain an append-only `docs/CHANGELOG.md` scaffolded by `init`; every committed run SHALL append one entry (date, OpenSpec change id, request, files touched, verification result), newest first, as the human-readable narrative companion to git history.

#### Scenario: Entry per committed run
- **WHEN** a `do` run commits successfully
- **THEN** `docs/CHANGELOG.md` contains a new entry for that run with its change id, request, files touched, and ERC/DRC result, and the entry is part of the same commit

#### Scenario: Failed run adds no entry
- **WHEN** a run rolls back after exhausting repair cycles
- **THEN** `docs/CHANGELOG.md` is unchanged (restored with the snapshot)

### Requirement: Git pre-commit hook keeps human edits in sync
`init` SHALL install a git pre-commit hook that runs `copperhead check`, so hand edits that desync docs, constraints, or the schematic fail at commit time; `--no-hooks` skips installation, and the hook SHALL be a thin call to the installed CLI, not copied logic.

#### Scenario: Hook installed at init
- **WHEN** `init` runs without `--no-hooks` in a git repo
- **THEN** a pre-commit hook exists that invokes `copperhead check`

#### Scenario: Desynced hand edit blocked
- **WHEN** a user hand-edits a resistor value in the schematic without updating BOM.md and attempts `git commit`
- **THEN** the pre-commit hook fails with the drift violation naming the doc, claim, and actual value

### Requirement: Self-describing memory directory
`init` SHALL generate `.copperhead/README.md` documenting every config.json key, the meaning of `budgets`, the `constraints.json` format including `affects`, and the `runs/` layout, so `.copperhead/` is understandable without reading source code. This file is generated documentation: it is regenerated on re-runs and exempt from the hand-edit `--force` refusal.

#### Scenario: README generated at init
- **WHEN** `init` completes
- **THEN** `.copperhead/README.md` exists and names every key present in the generated config.json

### Requirement: Rationale lines
Every non-trivial agent decision SHALL be recorded as a one-line "why" in the relevant doc, including intentional absences (e.g. a deliberately omitted pullup).

#### Scenario: Removal records intent
- **WHEN** a `do` run removes a part
- **THEN** the relevant doc records why the absence is intentional
