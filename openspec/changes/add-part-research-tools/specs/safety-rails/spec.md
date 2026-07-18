# safety-rails: Delta Spec

## MODIFIED Requirements

### Requirement: Path sandboxing
All file tools SHALL resolve paths relative to the repo root and reject any path escaping it. Network access SHALL exist only through the research tool family's single egress module (host-allowlisted, transcript-logged, per the part-research capability); every other module and the entire `check`/`verify` code path SHALL be network-free by construction.

#### Scenario: Traversal rejected (AC-4.2)
- **WHEN** a tool call targets a path outside the repo root (e.g. `../../etc/hosts`)
- **THEN** the call is rejected with an error and no file outside the repo is read or written

#### Scenario: No network outside the egress module
- **WHEN** the static import check runs over the codebase
- **THEN** no module outside `src/research/` references the network APIs, and the `check` command path imports nothing from `src/research/`

### Requirement: Secret hygiene
API keys (LLM providers, part-data providers, and search providers) SHALL exist only in environment variables; `.env` and `.copperhead/runs/` SHALL be in `.gitignore` from the first commit; transcripts and summaries SHALL redact at write time anything matching `sk-[A-Za-z0-9_-]+`, the configured providers' key formats, and the values of any environment variable whose name ends in `_KEY`, `_SECRET`, or `_TOKEN`.

#### Scenario: No keys anywhere (AC-4.1)
- **WHEN** the full test suite has run
- **THEN** no file in the repo tree, transcripts, or any commit matches `sk-[A-Za-z0-9_-]{20,}`

#### Scenario: gitignore from first commit (AC-4.3)
- **WHEN** the repo's first commit is inspected
- **THEN** `.gitignore` already includes `.env` and `.copperhead/runs/`

#### Scenario: Provider keys redacted
- **WHEN** a transcript or summary is written during a run whose environment contains part-data or search API keys
- **THEN** no value of any `*_KEY`, `*_SECRET`, or `*_TOKEN` environment variable appears in the written files

### Requirement: No invented part numbers
The agent SHALL never present an MPN as verified without evidence: any newly introduced part MUST carry a datasheet-verifiable justification in BOM.md and be flagged `UNVERIFIED` for human review. A row MAY be upgraded to `VERIFIED(datasheet)` only when every selection-driving parameter cites a cached datasheet (path and section) that passes the citation drift check; absent such evidence the `UNVERIFIED` flag SHALL remain. `VERIFIED(datasheet)` SHALL mean only "evidence attached and mechanically checkable", never engineer sign-off.

#### Scenario: New part flagged
- **WHEN** a run adds a part not previously in the BOM and no cached datasheet evidence is cited
- **THEN** its BOM.md row includes an `UNVERIFIED` flag and a one-line justification

#### Scenario: Evidence upgrades the flag
- **WHEN** a run cites a cached datasheet section for each selection-driving parameter of a part and the citations pass the drift check
- **THEN** the BOM.md row carries `VERIFIED(datasheet)` with the citation, and the run report does not claim any stronger assurance
