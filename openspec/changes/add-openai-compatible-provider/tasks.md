# Tasks — OpenAI-compatible provider

## 1. Config surface

- [ ] 1.1 Add `baseURL` and `apiKeyEnv` to `CopperheadConfig` and `loadConfig` (`src/config.ts`).
- [ ] 1.2 Add a `resolveCompatSettings(config, env)` helper: config values, overridden by `COPPERHEAD_BASE_URL` / `COPPERHEAD_API_KEY_ENV`, with `OPENAI_API_KEY` as the default variable name.

## 2. Provider

- [ ] 2.1 `OpenAIProvider` accepts `baseURL` and an `apiKeyEnv` name; pass `baseURL` to the client (`src/agent/providers/openai.ts`).
- [ ] 2.2 Require a credential only for a remote endpoint; allow a keyless loopback endpoint (D4).
- [ ] 2.3 Error message names the expected variable when a remote endpoint has no key.

## 3. Routing

- [ ] 3.1 Route `compat` / `compat:<model-id>` in `makeProvider()`, rejecting the empty override (`src/agent/loop.ts`).
- [ ] 3.2 Add the optional settings parameter and thread it from the two production call sites (`loop.ts`, `create.ts`).
- [ ] 3.3 Confirm a plain `gpt-5` run ignores `baseURL` (D2).

## 4. doctor

- [ ] 4.1 `checkCredential` handles the compat route: resolve the configured variable, report the endpoint.
- [ ] 4.2 Hostname-keyed training-risk map, emitted at `warn` (D5).

## 5. Tests

- [ ] 5.1 Routing: `compat`, `compat:<id>`, empty override rejected.
- [ ] 5.2 `baseURL` reaches the client; model id passed through.
- [ ] 5.3 Credential read from the configured variable name.
- [ ] 5.4 Keyless loopback endpoint constructs; remote without key throws naming the variable.
- [ ] 5.5 `gpt-5` unaffected by an exported `COPPERHEAD_BASE_URL`.
- [ ] 5.6 doctor: compat credential present/absent, training-risk warn does not fail, default run makes no network call.
- [ ] 5.7 Live AC-3.x: compat entry in the provider-parity matrix, skipped unless configured.

## 6. Docs

- [x] 6.1 `.env.example`, README model list, `docs/reference/cli.md`, `docs/reference/configuration.md`.
- [x] 6.2 SPEC.md provider list and AC-3.10 parity note.
