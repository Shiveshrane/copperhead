# Tasks — OpenAI-compatible provider

## 1. Config surface

- [x] 1.1 Add `baseURL` and `apiKeyEnv` to `CopperheadConfig` and `loadConfig` (`src/config.ts`). Verified: `npx vitest run test/openai-compat.test.ts` (config-resolution cases) + `npm run typecheck`.
- [x] 1.2 Add a `resolveCompatSettings(config, env)` helper: config values, overridden by `COPPERHEAD_BASE_URL` / `COPPERHEAD_API_KEY_ENV`, with `OPENAI_API_KEY` as the default variable name. Verified: same test file, "environment overrides config" + "ignores blank values" cases.

## 2. Provider

- [x] 2.1 `OpenAIProvider` accepts `baseURL` and an `apiKeyEnv` name; pass `baseURL` to the client (`src/agent/providers/openai.ts`). Verified live: a real loopback HTTP server test asserts the actual request lands on the configured `baseURL` with the right model id and `Authorization` header (`test/openai-compat.test.ts`); also confirmed against real Groq/OpenRouter/Gemini endpoints via manual `do` runs.
- [x] 2.2 Require a credential only for a remote endpoint; allow a keyless loopback endpoint (D4). Verified live: Ollama (`http://localhost:11434/v1`) ran with no key against `phi3:latest` and `qwen2.5:0.5b`.
- [x] 2.3 Error message names the expected variable when a remote endpoint has no key. Verified unit + live (Groq/OpenRouter runs with a missing key surfaced the exact variable name).

## 3. Routing

- [x] 3.1 Route `compat:<model-id>` in `makeProvider()`, rejecting both `compat:` (empty override) and bare `compat` (no override — a compatible endpoint has no default model, unlike `codex`/`claude-code`/`cursor`) (`src/agent/loop.ts`). Verified: regression test added after finding bare `compat` previously fell through to `OpenAIProvider`'s own `'gpt-5'` default instead of throwing.
- [x] 3.2 Add the optional settings parameter and thread it from the two production call sites (`loop.ts`, `create.ts`). Verified: `npm run typecheck` (source-compatible with all existing single-argument callers) + full suite green.
- [x] 3.3 Confirm a plain `gpt-5` run ignores `baseURL` (D2). Verified unit (`test/openai-compat.test.ts`) + live (`doctor --model gpt-5` with `COPPERHEAD_BASE_URL` exported still targeted real OpenAI, not the configured compat endpoint).

## 4. doctor

- [x] 4.1 `checkCredential` handles the compat route: resolve the configured variable, report the endpoint. Verified live across Groq, Ollama, OpenRouter, and Gemini configurations.
- [x] 4.2 Hostname-keyed training-risk map, emitted at `warn` (D5). Verified live: `doctor` with Gemini configured shows `[warn] privacy ... may train on submitted prompts` and still exits `ready` (0).

## 5. Tests

- [x] 5.1 Routing: `compat:<id>`, `compat:` empty override, and bare `compat` all rejected. `npm test`: 498 passed, 0 failed.
- [x] 5.2 `baseURL` reaches the client; model id passed through. Verified via the real-HTTP-server test in 2.1.
- [x] 5.3 Credential read from the configured variable name.
- [x] 5.4 Keyless loopback endpoint constructs; remote without key throws naming the variable.
- [x] 5.5 `gpt-5` unaffected by an exported `COPPERHEAD_BASE_URL`.
- [x] 5.6 doctor: compat credential present/absent, training-risk warn does not fail, default run makes no network call.
- [~] 5.7 Live AC-3.x: compat entry added to the provider-parity matrix (`test/agent-integration.test.ts`), correctly skips unless `COPPERHEAD_TEST_COMPAT_MODEL`/`COPPERHEAD_BASE_URL` are set. **Run for real** against Gemini (`compat:gemini-2.5-flash`): the entry mechanically works — not skipped, read the credential via `apiKeyEnv`, made real requests — but the model itself passed only 1 of 3 scenarios this run (AC-3.6 rollback-integrity passed; AC-3.1 net-rename and AC-3.4 budget-refusal both returned `outcome: 'failure'`), contradicting an earlier informal single manual success on the same model. Marked partial, not done: the harness is verified, the model's pass rate is not currently reliable enough to call this task complete. Re-run before relying on Gemini as a recommended stack.

## 6. Docs

- [x] 6.1 `.env.example`, README model list, `docs/reference/cli.md`, `docs/reference/configuration.md`.
- [x] 6.2 SPEC.md provider list, AC-3.10 parity note, and new AC-3.13–3.17 (credential, locality, routing, endpoint-isolation, prompt-privacy — one per delta-spec requirement).
