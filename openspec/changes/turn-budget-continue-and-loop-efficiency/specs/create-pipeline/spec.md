# create-pipeline delta spec

## ADDED Requirements

### Requirement: Per-stage turn budgets

`.copperhead/config.json` SHALL accept an optional `stageMaxTurns` object mapping create-pipeline stage names to turn budgets. When a stage runs and its name has an entry, that value SHALL be the run's `maxTurns`; stages without an entry use the global `maxTurns`. Unknown stage names in the map SHALL be ignored.

#### Scenario: Stage-specific budget applies (AC-15.18)

- **WHEN** config contains `"stageMaxTurns": {"spec-seed": 60}` and the spec-seed stage runs
- **THEN** that stage's run enforces a 60-turn budget while other stages keep the global `maxTurns`

#### Scenario: Absent map changes nothing (AC-15.19)

- **WHEN** config has no `stageMaxTurns`
- **THEN** every stage uses the global `maxTurns` exactly as before
