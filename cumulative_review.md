# Cumulative Review

## 2026-02-15T12:25:41-08:00

- Standardized plugin scope naming across the stack by removing the legacy `environment` alias and using canonical scopes only: `workspace`, `setta_files`, and `global`.
- Updated backend plugin contracts and CLI flags/options accordingly, including scope normalization and scope label output (`setta_files` instead of `environment`).
- Updated frontend plugin install UI and generated API types to use `setta_files`, and aligned Playwright expectations for scope values and confirmation text.
- Updated plugin fixture smoke guidance to reflect `setta_files` scope precedence over `global`.
- Improved `scripts/run_backend_tests.sh` by caching plugin fixture build signatures under `setta_files/.cache/`, skipping unchanged rebuilds, and adding a force rebuild override via `SETTA_FORCE_PLUGIN_FIXTURE_BUILD=1`.
- Expanded test coverage to enforce the new scope behavior (including rejection of `environment`/`--environment`) and added new tests verifying backend test-runner fixture cache behavior.

## 2026-02-15T13:06:40-08:00

- Hardened plugin scope normalization to return a targeted error for the removed `environment` alias with explicit guidance to use `setta_files`.
- Updated plugin fixture helper scripts (`link.sh`, `unlink.sh`, `reset.sh`) so accepted scopes and usage text are canonical-only: `workspace`, `setta_files`, `global`.
- Removed remaining plugin-scope alias references from canonical docs and fixture docs (`plugin-authoring-golden-path`, `plugin-fixture-manual-smoke`, fixture READMEs).
- Added/updated tests to lock behavior: unit coverage for explicit `environment` rejection guidance, CLI coverage for rejecting `--scope environment` with canonical choices in help output, and Playwright coverage that install-scope UI exposes `workspace`/`setta_files`/`global` with no `environment` option.

## 2026-02-15T15:18:00-08:00

- Applied plugin runtime/manager hardening from review findings: restricted plugin asset serving to frontend roots only, removed worker pipe `select` polling in favor of timeout-based threaded reads, and propagated runtime mode/capabilities into worker context.
- Fixed plugin install/link restart semantics and lockfile determinism by persisting and honoring `installerBackend` through lockfile write/apply flows.
- Tightened deployment-mode behavior by guarding plugin rescan behind IDE mode and redacting plugin source details (`canonicalSourceKey`, `sourcePath`) from list/status responses outside IDE mode.
- Improved plugin discovery/codegen performance paths with directory digest caching, targeted plugin codegen output refresh/pruning, and deterministic local `UV_CACHE_DIR` handling.
- Removed plugin payload `literal_eval` fallback in listener dependency updates so plugin section payload strings must be valid JSON.
- Removed backward-compatibility shims around external agent runner adapter APIs and updated runtime whitelist env resolution to include live plugin adapter IDs.
- Updated frontend plugin rendering lifecycle logic to avoid unnecessary remounts and ensure update-driven refresh behavior; standardized missing-plugin fallback copy to mention `workspace` and `setta_files` scope.
- Expanded test coverage with backend unit/integration tests, frontend Vitest updates, and a new Playwright E2E test for the plugin fallback wording; completed CDP visual verification for the updated fallback UI.
