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

## 2026-02-15T15:46:23-08:00

- Replaced per-call worker pipe timeout threads with persistent per-stream readers in plugin manager process handling, reducing thread churn and improving shutdown cleanup.
- Moved plugin link validation earlier so incompatible `settaVersionRange` and invalid plugin config schemas fail before install/link state is mutated.
- Tightened non-IDE plugin list responses by redacting config descriptor payloads and current config values while preserving schema presence metadata.
- Optimized plugin codegen refresh fingerprinting by hashing project state once per refresh and composing target fingerprints from cached project/option hashes.
- Hardened frontend plugin runtime refresh by clearing stale registry state at load start and enforcing capability/ownership checks for `readSection` and `updateSection`.
- Added explicit `section_kind_missing` fallback handling and user-facing copy for plugin sections whose kind is no longer registered.
- Fixed plugin fixture reset discovery to recurse nested fixture directories and added Playwright fixture build signature caching to skip unchanged rebuilds.
- Added/updated backend unit/integration tests, frontend Vitest coverage, and Playwright E2E coverage for the new runtime and fallback behaviors.

## 2026-02-15T15:39:26-08:00

- Fixed scoped plugin lifecycle regressions by allowing explicit scoped write operations (`install/link/uninstall/update/rollback`) to resolve shadowed entries, while keeping active/effective read behavior unchanged.
- Preserved plugin enablement intent through updates so `update_plugin` no longer re-enables previously disabled plugins.
- Hardened plugin lifecycle determinism and correctness by making history snapshots collision-proof and rejecting duplicate `(scope, pluginId)` entries during lockfile apply.
- Fixed backend plugin static route reachability by moving backend static mounts to a non-conflicting `/plugin-static/{pluginId}/...` namespace.
- Added fail-fast backend language-server command validation (path/binary launchability) and made backend boot await LSP startup so failures surface during initialization rather than after "ready".
- Addressed runtime stability/perf issues by bounding backend worker stderr buffering, guarding plugin-manager destructor cleanup during interpreter finalization, and removing dead backend startup/shutdown task scaffolding.
- Simplified external-agent adapter config persistence to store user values (not merged adapter defaults), while preserving live adapter policy at runtime; also fixed finalized plugin-process stream text to preserve exact chunk concatenation.
- Prevented frontend plugin `apiFetch` path traversal by rejecting relative traversal segments during path normalization and added new unit + Playwright regression coverage for escaped/traversal inputs.
- Resolved Python 3.13 LSP initialization issues by requiring explicit event loops in file watchers and lazily constructing the watcher under a running loop.
- Added/updated backend unit/integration tests, frontend Vitest tests, and Playwright E2E tests for all above fixes, including deployment-policy MCP gating and plugin codegen target-directory collision coverage.
