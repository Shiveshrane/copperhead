# agent-core — Delta Spec

## MODIFIED Requirements

### Requirement: Provider list includes a compatible-endpoint mode
The provider list (§4.4) SHALL include the OpenAI provider's compatible-endpoint mode: `compat:<model-id>`, a keyed HTTP provider with a configurable `baseURL` and credential variable name, covering Groq, OpenRouter, Gemini's OpenAI-compatible endpoint, and a local Ollama server. `makeProvider()` SHALL accept optional compatible-endpoint settings alongside the model string; the parameter is optional, so callers that do not use the compat route are unaffected.

#### Scenario: the compat route reaches the configured endpoint
- **GIVEN** compatible-endpoint settings resolved from config or environment
- **WHEN** `makeProvider()` is called with `compat:<model-id>`
- **THEN** it returns the OpenAI provider bound to that endpoint and model id

#### Scenario: existing routes are unaffected
- **WHEN** `makeProvider()` is called with `gpt-5`, `claude`, `codex`, `claude-code`, or `cursor`
- **THEN** routing is exactly as before, and no compatible-endpoint setting is consulted

### Requirement: Provider parity covers the compatible endpoint
AC-3.10 provider parity SHALL include `--model compat:<model-id>` when a compatible endpoint and its credential are configured for the test run, and SHALL skip it otherwise so the default suite stays offline.

#### Scenario: the live matrix runs the compat provider only when configured
- **GIVEN** `COPPERHEAD_TEST_COMPAT_MODEL` and `COPPERHEAD_BASE_URL` are both set
- **WHEN** the live acceptance suite runs
- **THEN** the AC-3.x cases execute against that endpoint; absent either variable, they are skipped
