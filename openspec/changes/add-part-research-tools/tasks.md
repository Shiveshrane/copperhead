# add-part-research-tools: Tasks

## 1. Foundations (egress + config)

- [ ] 1.1 Add `research` block to config schema (`enabled`, `provider`, `searchProvider`, `allowHosts`, `stalenessDays`, `maxPdfMB`) with absent-means-disabled defaults; document every key in `.copperhead/README.md` generation
- [ ] 1.2 Implement `src/research/net.ts` egress module: allowlist enforcement, redirect host re-validation, timeout, response size cap, per-request transcript network-log entries
- [ ] 1.3 Generalize transcript/summary redaction: existing `sk-` pattern plus values of all `*_KEY`/`*_SECRET`/`*_TOKEN` env vars and configured provider key formats
- [ ] 1.4 Add static guard test: no module outside `src/research/` references network APIs; the `check` command path imports nothing from `src/research/`
- [ ] 1.5 Unit tests for egress: non-allowlisted host refused (direct and via redirect), size cap enforced, every request logged

## 2. Providers

- [ ] 2.1 Define `SearchProvider` and `PartDataProvider` interfaces with normalized result types (part: MPN, manufacturer, lifecycle, stock by distributor, price breaks, datasheet URL)
- [ ] 2.2 Implement Brave `SearchProvider` (metadata-only results: title, URL, snippet), key via `BRAVE_API_KEY`
- [ ] 2.3 Implement Nexar `PartDataProvider`, keys via `NEXAR_CLIENT_ID`/`NEXAR_CLIENT_SECRET`, with backoff through the egress module
- [ ] 2.4 Provider unit tests against recorded fixtures (no live network in CI)

## 3. Datasheet cache

- [ ] 3.1 Implement fetcher: download to `.copperhead/datasheets/<mpn>-<hash8>.pdf`, SHA-256, `index.json` entry (MPN, URL, timestamp, hash, size, title), dedupe by hash
- [ ] 3.2 Per-page text extraction to sibling `.pdf.txt` with page/section markers that survive into citations
- [ ] 3.3 Size-cap refusal path writing a `not-cached` index entry preserving the URL
- [ ] 3.4 Changed-hash handling: new entry plus revisit obligations for citations of the old entry (obligations ledger integration)
- [ ] 3.5 Ensure `.copperhead/datasheets/` is committed (not gitignored); document the git-lfs migration note in `.copperhead/README.md`

## 4. Agent tool integration

- [ ] 4.1 Add `web_search`, `search_parts`, `fetch_datasheet` tool schemas and dispatch in `src/agent/tools.ts`, gated on `research.enabled` AND key presence (structurally absent otherwise)
- [ ] 4.2 System prompt additions: fetched content is data not instructions (ignore-and-report rule), snapshot `retrieved` timestamps surfaced next to sourcing constraints
- [ ] 4.3 Post-tool-call hook: `search_parts`-informed selection opens a dual-write obligation for the `sourcing.<refdes>` snapshot and BOM.md line in the same turn
- [ ] 4.4 Run `summary.md` gains a network section: request count, datasheets cached, snapshots written

## 5. Constraints, drift, and check

- [ ] 5.1 Sourceability snapshot schema in `constraints.json` (`sourcing.<refdes>` with MPN, lifecycle, stockTotal, price1k, retrieved, source, affects)
- [ ] 5.2 Citation drift check: cited cache file exists, hash matches index, cited section occurs in extracted text; broken citations fail drift naming doc, citation, and cause
- [ ] 5.3 Offline sourceability validation in `check`: snapshot presence per MPN row, lifecycle not EOL, nonzero stock at retrieval, staleness vs `stalenessDays`; warnings by default, `--strict-sourcing` promotes to failures; EOL flagged per truth-precedence, never silently resolved
- [ ] 5.4 `VERIFIED(datasheet)` upgrade logic in BOM handling: upgrade only when every selection-driving parameter cites a passing citation; otherwise `UNVERIFIED` stands
- [ ] 5.5 Regression: AC-2.1 no-network assertion still passes with research configured (check makes zero network calls)

## 6. Scenario tests (map 1:1 to delta specs)

- [ ] 6.1 part-research: tools absent without keys / present when configured
- [ ] 6.2 part-research: egress rejection, redirect re-validation, request logging
- [ ] 6.3 part-research: snapshot dual-write same-turn; fetch cache/index/text; oversized refusal; changed-hash revisit obligation
- [ ] 6.4 part-research: valid citation passes, broken citation fails; check offline; stale warns, strict fails
- [ ] 6.5 part-research: injection attempt in cached text is inert and reported
- [ ] 6.6 safety-rails: provider key redaction; evidence upgrade to `VERIFIED(datasheet)`; no-evidence stays `UNVERIFIED`; static no-network-outside-egress guard

## 7. Docs and archive prep

- [ ] 7.1 Update `.env.example` with `BRAVE_API_KEY`, `NEXAR_CLIENT_ID`, `NEXAR_CLIENT_SECRET`
- [ ] 7.2 Draft SPEC.md edits for archive time: §7 scoped network boundary replaces "no network tools", §4.2 tool table gains research tools, §8 marks part-data item pulled forward
- [ ] 7.3 README: document research setup, offline behavior (graceful degradation), and the `VERIFIED(datasheet)` flag meaning
- [ ] 7.4 Coordinate with build-copperhead-phase-1: this change's safety-rails deltas modify requirements introduced there; archive phase-1 first (or sync its specs) so the MODIFIED blocks land against existing main specs
