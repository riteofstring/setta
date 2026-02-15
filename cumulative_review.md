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

## 2026-02-15T16:35:34-08:00

- Implemented all remaining review fixes from `review1.md` through `review6.md` (excluding backward-compatibility additions), including plugin manager correctness, plugin runtime/frontend UX consistency, and fixture-cache script hardening.
- Fixed plugin enable/disable missing-plugin behavior to fail before state mutation, preventing orphaned IDs in persisted plugin state.
- Split backend plugin timeouts so registration/startup budgets no longer cap long-running runtime operations (route/listener/MCP/codegen), and fixed server initialization order so backend plugin registration runs after project-manager switcher setup.
- Improved installer reliability and parity: `auto` installer now falls back from `uv` to `pip` on PyPI install failures, and MCP plugin install now accepts explicit `installer` selection (`auto`/`pip`/`uv`).
- Preserved plugin-process output fidelity by removing finalized-text trimming so leading/trailing whitespace is retained exactly.
- Hardened plugin discovery/status identity by making non-IDE redaction scope-unique, eliminating row-key collisions for same plugin IDs across scopes.
- Fixed plugin codegen cache correctness by pruning stale on-disk target dirs across restarts and including plugin implementation identity in target fingerprints so plugin updates regenerate outputs deterministically.
- Fixed frontend restart-required UX to use the union of plugin list + status entries so uninstall tombstones remain visible; removed redundant status fetch in plugin fallback open flow.
- Eliminated command-palette create-action ID collisions for plugin sections by adding stable unique plugin command IDs; improved plugin runtime selector efficiency with precomputed sorted arrays and deduped section snapshot transforms.
- Extracted shared plugin-fixture cache helpers and updated backend/Playwright scripts to rebuild when expected built fixture outputs are missing, even when signatures are unchanged.
- Added/updated backend unit/integration tests, frontend Vitest tests, and Playwright E2E coverage for all above changes; completed CDP visual verification of restart-banner and plugin-pane behavior under status-only restart tombstones.

## 2026-02-15T17:21:54-08:00

- Implemented the next review-fix batch from `review1.md` through `review6.md`, explicitly excluding backward-compatibility shim work.
- Fixed plugin external-agent correctness by normalizing/validating command overrides in preflight, normalizing whitespace-sensitive plugin adapter IDs in lookup paths, preserving streamed plain-text boundary whitespace, and treating plugin `done` events as terminal with immediate process shutdown fallback.
- Hardened plugin runtime policy and error handling by deployment-gating the restart endpoint and mapping restart callback failures to structured `PLUGIN_RESTART_FAILED` 503 responses.
- Corrected non-IDE plugin status redaction so same-scope entries from different source managers remain distinct, with stable per-source redacted identities and accurate `shadowedBySourcePath` mapping.
- Added missing plugin section Python formatting in codegen (`SectionType.Plugin`) and fixed plugin codegen fingerprint cache hits to regenerate when cached output files/directories are missing.
- Reordered IDE startup so backend plugins load before LSP writer construction, ensuring plugin language-server registrations are active on first startup.
- Removed unnecessary frontend plugin runtime churn by clearing stale plugin styles on runtime fetch failures, removing forced refresh on Plugins-tab open, and replacing expensive deep-equality subscriptions/selectors in Plugins pane + PluginArea with leaner selector patterns.
- Refactored duplicated `plugins update` / `plugins pin` CLI command flows in `start.py` into shared execution logic.
- Added/updated backend unit/integration tests, frontend Vitest coverage, and Playwright E2E checks for all changed paths; executed targeted pytest/vitest/playwright runs and completed CDP visual verification of Plugins pane + plugin pane flow.

## 2026-02-15T18:29:12-08:00

- Implemented the latest review-fix batch from top-level `review*.md` findings, excluding backward-compatibility additions.
- Fixed deployment/share plugin-root resolution so plugin manager roots use deployment runtime roots instead of host `setta_files` paths.
- Corrected scoped plugin-config behavior by keying config storage per `(scope, pluginId)`, preserving shadowed-scope intent across lifecycle operations.
- Fixed plugin status shadowing leakage so shadowed entries no longer inherit active-entry backend registrations (language servers, adapters, codegen targets).
- Added backend registration rollback snapshots during `plugin.register` to revert partially applied routes/listeners/MCP/adapters/codegen on failures.
- Improved package-manager discovery performance by replacing full plugin-directory digest walks with distribution-record fingerprinting and caching.
- Added opt-in plugin-manager startup scanning (`auto_rescan`) and wired CLI plugin restart to use no-rescan construction plus consistent `PluginManagerError` surfacing.
- Fixed listener dependency patch parsing to treat plugin payloads as control payloads only when top-level `data` exists; plain objects now remain data patches.
- Reduced worker async overhead by reusing a persistent async event loop for async route/MCP/codegen invocations and closing it on plugin shutdown.
- Fixed plugin top-nav UX so only the active async action button is disabled while other plugin actions remain clickable.
- Expanded plugin SDK/runtime exports and removed expensive/deep-equality plugin selectors in key runtime/pane paths to reduce subscription churn.
- Fixed realtime dependency event delivery so events are not dropped when coverage is unknown, only when coverage explicitly excludes the dependency key.
- Hardened fixture-cache scripts: content-based signature hashing (`cksum < file`), manifest-driven frontend output completeness checks, and macOS-compatible shell handling.
- Added/updated backend unit/integration tests, frontend unit/integration tests, and Playwright coverage for the new busy-state behavior; executed targeted pytest/vitest/playwright runs and completed CDP visual verification.

## 2026-02-15T19:20:13-08:00

- Implemented the remaining `review1.md` through `review6.md` fixes end-to-end, explicitly excluding backward-compatibility shim additions.
- Fixed plugin external-agent preflight correctness by requiring executable file commands, collapsing missing/unknown plugin-adapter errors to a single primary issue, and preventing redundant run-mode noise when adapter resolution fails.
- Hardened plugin manager mutation safety with a coarse mutation lock across mutating lifecycle/config/lockfile methods, and added structured nested host-RPC error mapping for unexpected host exceptions.
- Fixed lockfile reconcile correctness by preserving disabled state on reinstall, including invalid discovered entries in convergence scope, and batching install/uninstall operations with one final rescan.
- Fixed IDE startup correctness for register-time `read_project_state` by ensuring `app.state.setta` is populated before startup work and creating project-manager switchers before backend plugin registration, while still loading plugin language servers before LSP writer startup.
- Threaded `plugin_manager` through share session switcher/session-manager construction to support plugin codegen/read paths in deployment sessions.
- Improved plugin codegen output hygiene by tracking output roots per project config and removing stale plugin_codegen roots on project rename/delete and target-set transitions.
- Completed plugin process cancellation cleanup by awaiting post-kill process reaping and recording final return codes.
- Consolidated duplicate CLI plugin-manager builders (`auto_rescan` parameterized helper) and aligned restart command usage with the shared path.
- Removed frontend plugin runtime `readProjectState({ kind: "full" })` support and added explicit regression coverage, plus reduced Plugins pane render cost by caching sorted registration arrays per status object identity.
- Centralized fixture-cache runner logic, added robust Python interpreter resolution (`PYTHON_BIN`/`python`/`python3`), included frontend toolchain files in fixture signatures, and added Playwright local-plugin-artifact signature caching for unchanged runs.
- Added/updated backend unit/integration tests, project-state tests, frontend Vitest tests, and Playwright E2E coverage; executed targeted `pytest`, `vitest`, and `run-playwright-e2e` runs to validate all changed paths.

## 2026-02-15T20:03:36-08:00

- Implemented the next top-level `review*.md` fix batch end-to-end, explicitly excluding backward-compatibility shim additions.
- Fixed GitHub source install determinism by stripping cloned `.git` metadata before digest/install, eliminating VCS-noise digest churn and reducing install footprint.
- Hardened plugin directory digesting with a bounded/pruned cache, compact change-stamp hashing, and symlinked-file inclusion in stamp traversal.
- Removed redundant startup scan work by constructing `PluginManager` with `auto_rescan=False` in server state initialization (while retaining explicit load-path rescans).
- Made plugin codegen strict for plugin section payloads: invalid JSON now raises a clear `ValueError` instead of silently falling back to string literals.
- Reduced listener plugin update overhead by replacing unconditional deep-copy merge paths with shallow top-level dict merges for plugin section update payloads.
- Deduplicated external-agent adapter selection logic by routing plugin adapter validation through runner-owned `get_plugin_external_agent_adapter(...)` lookup.
- Removed eager worker async-loop allocation so backend plugin workers create event loops lazily only when async plugin handlers execute.
- Fixed plugin fallback UX consistency by making fallback reason computation reactive (`usePluginSectionFallbackReason`) and using canonical pane-open flow (`onOverviewTabClick(...)`) for fallback “Open Plugins”.
- Reduced frontend runtime overhead by narrowing plugin-runtime lodash usage to `lodash/throttle` instead of importing full `lodash`.
- Hardened fixture-reset script reliability: fail fast when `setta` is unavailable, surface unlink failures, and stop masking rescan failures.
- Refactored Playwright artifact seeding script to share index-env wiring and source fixture wheel name/version from fixture `pyproject.toml`, removing duplicated hard-coded metadata paths.
- Added/updated backend unit/integration tests, frontend Vitest coverage, and Playwright E2E coverage for all changed behavior (including reactive fallback-reason transitions); completed CDP visual verification for fallback-card behavior and Plugins-pane opening flow.

## 2026-02-15T20:38:30-08:00

- Implemented the follow-up `review*.md` fix batch end-to-end, excluding backward-compatibility shim additions.
- Hardened backend plugin lifecycle and runtime correctness: backend-shutdown now clears stale registration/runtime maps, package-manager source digest caching is bounded with LRU eviction, and install-time backend-presence checks no longer rely on discovered-state artifacts.
- Fixed external-agent adapter execution flow by resolving plugin adapters once per run, removing duplicate lookup races, and scoping adapter env-whitelist injection to plugin-backed tool runs only.
- Updated CLI plugin workflows for determinism and automation: `plugins install`/`plugins rescan` now construct `PluginManager` without auto-rescan, and `plugins unlink` now supports `--ignore-missing` with structured JSON output.
- Improved frontend plugin UX concurrency: top-nav and Plugins pane actions now use per-action busy keys so unrelated actions remain interactive while a specific operation is in flight.
- Tightened frontend runtime/search correctness: realtime section emits now reject non-object payloads, command palette creation now throws on duplicate command IDs with source attribution, and generated endpoints now exclude unsupported `route_plugin_asset` exports.
- Refactored duplicated project LSP/Python section behavior into a shared mixin/helper path in `project_code.py` while preserving behavior.
- Hardened plugin fixture reset automation by switching unlink handling to structured JSON parsing instead of brittle stderr pattern matching.
- Added/updated backend pytest, frontend Vitest, and Playwright E2E coverage for all above paths; executed targeted test runs and completed CDP UI verification for updated plugin panes/top-nav behavior.

## 2026-02-15T21:58:00-08:00

- Implemented the current top-level `review*.md` findings end-to-end (excluding backward-compatibility shim work), with backend startup/plugin lifecycle correctness fixes and frontend runtime/UX/performance updates.
- Made LSP startup transactional by rolling back already-started servers on startup failure and added defensive LSP cleanup in IDE startup exception handling to prevent orphan processes.
- Fixed plugin external-agent preflight command resolution by validating relative/path-like command overrides against resolved working directories.
- Improved plugin manager correctness and UX policy: redacted source tokens now use canonical enum values, backend plugin load avoids redundant full rescans, and linked-local plugin update/rollback now return explicit unavailable errors.
- Updated CLI plugin mutation commands to construct plugin manager instances with `auto_rescan=False` where lifecycle methods already rescan.
- Hardened frontend plugin runtime loading by gating frontend imports to `active`/`pending_restart` statuses and applying bounded concurrency for module loads.
- Fixed Plugins pane action behavior and affordances: action dedupe is now atomic per action key, and linked-local plugins clearly disable Update/Rollback with in-pane guidance.
- Reduced large-DOM plugin section rerender churn by memoizing effective plugin impl computation and adding stable selector equality checks for plugin section rendering.
- Repaired fixture command backend roundtrip flow to avoid traversal assumptions and to resolve backend API origin correctly in dev/CDP contexts, with robust command-summary reporting.
- Added/updated backend pytest, frontend Vitest, and Playwright coverage for all changed paths; executed targeted validation runs (`pytest` subset: 291 passed, `vitest` subset: 88 passed, Playwright targeted specs: all passing).
- Completed CDP verification and captured perf artifacts/report for the large-DOM plugin scenario (`perf/reports/frontend/2026-02-15_plugin-runtime-large-dom.md`).

## 2026-02-15T22:28:01-08:00

- Implemented the requested top-level review fix batch end-to-end, explicitly excluding backward-compatibility shim additions.
- Fixed CLI plugin mutation correctness by forcing a discovery rescan before lookup-dependent mutations (`enable`, `disable`, `update`/`pin`, `rollback`, `uninstall`, `unlink`) while keeping `auto_rescan=False` construction for deterministic command startup behavior.
- Hardened plugin backend codegen path validation by rejecting Windows absolute/drive/UNC `relativePath` values and canonicalizing equivalent path spellings before duplicate detection.
- Added write-time plugin codegen containment guards in project-state output refresh so generated/stale-prune paths are canonicalized and guaranteed to stay under each target output root.
- Resolved capability contract mismatch for `registerContextMenu` by enforcing host-policy blocking in effective capability resolution instead of advertising it as usable.
- Fixed frontend plugin runtime refresh dedupe semantics by queuing a guaranteed follow-up refresh when calls overlap.
- Fixed frontend style lifecycle so failed plugin frontend loads always unload plugin styles, preventing stale CSS leakage from failed modules.
- Updated plugin section fallback behavior to hide destructive "Delete Section" actions in read-only/user view contexts and removed deep recursive plugin-data equality from `PluginArea` render selection.
- Removed duplicated JSON object draft parse/format logic in Plugins pane by introducing shared object-draft helpers used by both plugin config and language-server settings editors.
- Added/updated backend pytest, frontend Vitest, and Playwright coverage for all changed paths (including new style-failure lifecycle E2E coverage), and completed CDP verification for updated plugin runtime/fallback UI behavior.

## 2026-02-15T23:42:40-08:00

- Implemented the latest top-level `review*.md` fix batch end-to-end, explicitly excluding backward-compatibility additions.
- Hardened frontend plugin API path normalization to block encoded traversal segments (for example `%2e%2e%2f`) and added matching unit + E2E regression coverage.
- Fixed stale section-effective-impl reads by invalidating cached effective impl values before post-update resolution, with regression unit tests.
- Improved Plugins pane UX by adding per-row Discovery Status actions for `Enable`/`Disable`, including tested re-enable-from-status behavior.
- Hardened plugin template scaffolding by validating template plugin IDs with manifest-equivalent rules and ensuring release workflow validation installs `setta` first.
- Hardened plugin codegen target refresh correctness by caching per-output content hashes, re-generating stale/modified outputs, and handling file/dir path-shape conflicts safely.
- Reduced duplicated listener endpoint dispatch logic by centralizing listener-router payload preparation/validation.
- Improved test-runner DX by making backend plugin-fixture builds conditional for non-plugin-targeted runs and by caching Playwright workspace fixture seeding signatures.
- Updated docs to remove dead plugin-plan links and point to current plugin authoring/smoke-test guides.
- UX before/after: status-table-only plugin entries were not directly recoverable in-pane; now operators can re-enable directly from Discovery Status rows without context switching.
- DX before/after: backend/Playwright fixture setup reran expensive seed/build work on unchanged inputs; now unchanged runs skip rebuild/reseed while preserving correctness checks.

## 2026-02-16T10:01:53-08:00

- Implemented the latest top-level `review*.md` fix batch end-to-end, explicitly excluding backward-compatibility additions.
- Fixed plugin asset URL robustness by URL-encoding manifest asset path segments before serving frontend entry/style URLs.
- Added selective plugin-manager rescans for lookup-heavy CLI mutation flows so workspace/global-scope lookups can skip package-manager discovery, while full rescans remain for full-status accuracy paths.
- Consolidated backend runtime reset behavior into a single plugin-manager reset path and added startup-failure cleanup to always shut down backend plugin runtime state.
- Preserved external plugin adapter plain-text fidelity by keeping newline boundaries between fallback stdout lines.
- Hardened external-agent preflight cache behavior with expired-entry pruning plus a bounded cache size cap.
- Simplified external-agent chat continuation semantics by removing dead LLM fallback paths and reusing prefetched external runs to avoid duplicate lookups.
- Hardened frontend action handling by making top-nav actions single-flight per key and normalizing command-palette sync throws into caught promise rejections.
- Reduced plugin runtime/UI churn by making frontend runtime refresh incremental (changed/removed plugins only) and deduplicating Plugins pane enable/disable action plumbing.
- Improved fixture/test runner reliability: reset script now parses structured JSON from stdout with separate stderr handling; backend/Playwright runners now use safer target-aware fixture-build/prepare gating.
- Added/updated backend unit/integration coverage, frontend unit/integration coverage, and Playwright coverage for all changed paths; executed targeted pytest/vitest/playwright runs, plus CDP verification of the Settings/Plugins UI after changes.

## 2026-02-16T11:05:47-08:00

- Implemented the current top-level `review*.md` findings end-to-end, explicitly excluding backward-compatibility additions.
- Fixed deployment/share plugin isolation by passing deployment runtime `setta_home` to plugin manager initialization; added share-state coverage to assert host `SETTA_HOME/plugins` entries are ignored in deployment mode.
- Added a consolidated plugin runtime API contract (`/plugins/runtime`) on backend and switched frontend runtime loading to prefer the consolidated payload with fallback to legacy list/status requests.
- Deduplicated frontend plugin runtime load-error handling into a shared reset helper and clarified fallback-reason mapping to explicit `section_kind_missing`.
- Improved plugin section bootstrap UX by gating fallback error cards on runtime readiness and rendering a neutral loading card while plugin runtime is initializing.
- Prevented overlapping same-plugin card mutations in the Plugins pane by gating all card write actions on per-plugin busy state.
- Refactored repeated CLI plugin mutation command plumbing (`install`, `uninstall`, `update`/`pin`, `rollback`, `link`) behind shared scoped-mutation execution logic.
- Removed dead backend runtime reset branching by making shutdown state reset unconditionally clear registered backend MCP tools.
- Unified plugin fixture-target selection heuristics in shared script helpers and updated both backend and Playwright test runners to consume the shared logic for path/selector-aware fixture preparation.
- Added/updated backend pytest, frontend Vitest, and Playwright E2E coverage for all changed paths (including runtime endpoint assertions and new fixture-target selection tests), and completed CDP verification of plugin loading/fallback behavior.

## 2026-02-16T12:01:59-08:00

- Implemented the remaining review findings end-to-end, excluding backward-compatibility shims.
- Hardened plugin backend worker transport by reserving protocol stdout for JSON-RPC and redirecting plugin stdout logs to stderr, preventing import/register `print(...)` noise from corrupting host-worker framing.
- Fixed CLI plugin command error handling so lookup-rescan failures are consistently wrapped as structured `ClickException` output across shared scoped mutation flows and direct `enable`/`disable`/`unlink` commands.
- Removed the redundant `/plugins/restart-capability` API route and generated frontend endpoint surface; restart capability now stays sourced from runtime/list/status payloads.
- Simplified frontend runtime loading to a single authoritative `/plugins/runtime` contract (removed list/status fallback), and made runtime errors fail fast with one clear status surface.
- Corrected runtime semantics by requiring an explicit plugin status row before frontend module load, and by making `computePluginSectionFallbackReason(...)` return `null` when no fallback condition applies.
- Reduced Plugins pane refresh overhead by removing redundant client-side status sorting and consuming backend-provided ordering directly.
- Optimized backend runtime response assembly with a single runtime snapshot build path instead of constructing list/status independently via duplicated top-level calls.
- Improved fixture/test-runner target gating: pytest selector handling now avoids forced plugin-fixture builds for explicit non-plugin targets, and Playwright fixture/artifact seeding now follows one shared target-aware gating decision.
- Added/updated backend unit/integration tests, frontend Vitest tests, and Playwright E2E coverage for all changed paths (including no-fallback runtime error behavior); verified with targeted runs (`pytest` subset: 357 passed, `vitest` subset: 89 passed, targeted Playwright spec: passing) and completed CDP visual verification of the Plugins pane runtime error/loaded states.

## 2026-02-16T12:53:16-08:00

- Implemented the latest top-level `review*.md` findings end-to-end, explicitly excluding backward-compatibility additions.
- Preserved FastAPI-like backend plugin route invocation semantics by adding typed parameter coercion and `Request` injection support in worker route calls, with host-forwarded request context in route proxy RPC payloads.
- Removed duplicated plugin list projection logic in plugin manager by extracting shared list-entry assembly for list/runtime responses.
- Fixed plugin mutation ordering so `install_plugin` and `link_plugin` now fail fast on target conflicts before backend runtime preparation, avoiding unnecessary side effects.
- Standardized plugin API shaping by making `/plugins/list` and `/plugins/status` thin projections from `/plugins/runtime`.
- Hardened plugin codegen cache determinism/performance by enforcing exact output file-set matching, pruning unexpected stale outputs, and using metadata (size/mtime) fast paths before content rehashing.
- Improved restart UX in frontend header/plugins pane by skipping immediate runtime refresh on accepted restart requests, adding explicit partial-success messaging when post-action runtime refresh fails, and hiding restart banner controls outside IDE/deployment-inappropriate contexts.
- Improved plugin section runtime UX by showing an explicit runtime error card (with status message and `Open Plugins`) instead of indefinite loading when runtime state is `error`.
- Removed dead frontend plugin SDK surface (`frontend/src/plugins/sdk.ts` and its test) and updated fixture frontend command backend roundtrip to consume runtime endpoint payloads.
- Added/updated backend pytest, frontend Vitest, and Playwright coverage for all changed paths; validated with targeted runs (`pytest` subset: 5 passed, `vitest` subset: 37 passed, Playwright targeted specs: 22 passed) and completed CDP verification of restart-banner visibility gating and plugin runtime error-card rendering.

## 2026-02-16T13:27:40-08:00

- Implemented the next top-level `review*.md` fixes end-to-end while explicitly excluding backward-compatibility additions.
- Removed legacy plugin read routes/contracts (`/plugins/list`, `/plugins/status`) from backend route enums/routers and frontend generated endpoint/type surface; `/plugins/runtime` is now the single canonical read contract.
- Refactored plugin manager read response assembly behind shared list/status builders and added mutation-lock protection to runtime/list/status snapshot reads for consistent concurrent behavior.
- Removed duplicated listener-router payload conversion/`projectConfigId` validation in websocket endpoint dispatch, keeping one normalization/validation stage.
- Optimized frontend plugin runtime refresh reuse by indexing prior section-kind keys by `pluginId` once per refresh, eliminating repeated full-map scans for unchanged plugins.
- Reduced plugin project-state cloning overhead by introducing scalar/array fast paths and cloning only when mutation isolation requires deep copy semantics.
- Removed dead frontend runtime helper/API surface (`getPluginSectionKindsForCreateMenu` and related `EMPTY_RECORD` usage).
- Hardened fixture-target detection and artifact seeding: Playwright `--grep` plugin hint checks are now case-insensitive/conservative, and seeded fixture wheels now emit a populated standards-compliant `RECORD` manifest.
- Added/updated backend pytest, frontend Vitest, and Playwright coverage for all changed paths (including new lock, runtime, fixture-selection, route-removal, and websocket temporary-ID regressions), and appended before/after runtime refresh perf results under `perf/reports/frontend/2026-02-16_plugin-runtime-refresh-indexing.md`.

## 2026-02-16T14:05:27-08:00

- Implemented the requested top-level `review*.md` fix batch end-to-end, explicitly excluding backward-compatibility additions.
- Fixed plugin external-agent preflight/runtime command resolution mismatches by rejecting relative path-like commands for `temp_dir` strategy and preferring PATH lookup for non-path command names.
- Hardened plugin API reliability by mapping `PluginManagerError` from `/plugins/runtime` and `/plugins/rescan` into structured HTTP error payloads.
- Unified plugin CLI error handling around manager initialization so plugin commands now surface clean `ClickException` output instead of tracebacks on invalid plugin state.
- Fixed websocket listener test/dispatch drift by aligning `share_session_id` keyword usage and simplifying listener router payload preparation to return only the effective payload data.
- Hardened backend plugin route/static mount prefix validation by rejecting traversal-like segments (including encoded dot-segments), empty segments, and invalid segment characters.
- Removed redundant plugin section codegen JSON round-tripping by emitting deterministic Python literal payloads directly and consuming them directly in value codec formatting.
- Reduced frontend plugin runtime rerender churn by switching `PluginArea` and `PluginRestartBanner` runtime subscriptions from object selectors to primitive selectors.
- Corrected plugin fixture smoke docs/scripts static URL examples to `/plugin-static/...`, made fixture link/unlink rescans opt-in (`--rescan`), and added seeded fixture completeness checks before Playwright seed-skip decisions.
- Removed redundant plugin-manager list-surface method usage by dropping `get_list_response` and using `get_runtime_response().list` in tests.
- Added/updated backend unit/integration tests, frontend Vitest tests, Playwright E2E coverage, and script-structure assertions for all touched behavior; verification runs passed (`pytest` subset: 402 passed, additional targeted pytest: 24 passed, Vitest subset: 76 passed, Playwright targeted specs: 8 passed, Ruff checks clean), with CDP verification completed.

## 2026-02-16T14:45:27-08:00

- Implemented the current top-level `review*.md` findings end-to-end, explicitly excluding backward-compatibility additions.
- Fixed backend worker route contract gaps by supporting single-parameter FastAPI body-model binding, unwrapping `Query`/`Path`/`Body` defaults, and preserving raw request body fidelity via `rawBodyBase64` transport.
- Normalized backend plugin route HTTP semantics so `Response` returns and `HTTPException` map to transport-safe status/body/headers envelopes instead of collapsing into opaque transport failures.
- Hardened backend route/listener proxy correctness by forwarding worker status/headers/media type, requiring strict valid `statusCode` handling, and serializing listener invocation under mutation lock.
- Reduced backend plugin router duplication by centralizing `PluginManagerError -> HTTPException` mapping behind a shared helper.
- Improved frontend plugin runtime stability by preserving `effectiveCapabilities` reference identity for no-op runtime refreshes and deduplicating runtime reset/load-error state shaping behind one helper.
- Reduced Plugins pane render-path overhead by caching repeated discovery capability text/tooltip formatting per status-entry identity.
- Tightened fixture-runner DX for targeted loops: selector-only `pytest -k`/Playwright `--grep` runs without plugin hints now skip plugin fixture builds by default.
- Expanded backend fixture route coverage and added/updated backend unit tests, frontend Vitest coverage, and targeted Playwright E2E coverage for all changed runtime/route/fixture-gating paths.
- Verified changes with targeted runs (`pytest` subset: 352 passed, `vitest` subset: 90 passed, targeted Playwright spec: passing) and completed CDP visual verification of Plugins pane/discovery rendering.

## 2026-02-16T15:42:52-08:00

- Implemented the latest top-level `review*.md` fixes end-to-end while explicitly excluding backward-compatibility additions.
- Normalized backend worker route proxy behavior by preserving duplicate response headers (including repeated `Set-Cookie`) and returning true empty bodies for no-content responses instead of JSON `null` payloads.
- Added missing backend mutation-lock coverage for backend codegen target generation and reduced lock contention by moving plugin install/update candidate resolution work outside the mutation lock (state mutations remain serialized).
- Fixed plugin codegen refresh resilience by skipping stale/missing plugin target registrations during refresh (log + continue) instead of failing the whole refresh cycle.
- Added Run Instructions orphan-target UX for plugin codegen targets: orphaned configured targets are now surfaced and removable from the UI.
- Consolidated restart-flow response handling into shared frontend mapping, removed legacy mode coercion behavior, and aligned banner + Plugins pane restart messaging.
- Refactored Plugins pane helper logic into a dedicated helper module and tightened runtime summary typing to avoid nullable/string drift in status messaging.
- Improved plugin runtime frontend determinism/performance by preserving backend plugin ordering, adding deterministic section-kind tie-break sorting, and reusing previous section snapshots when raw section payloads are unchanged.
- Added/updated backend pytest coverage, frontend Vitest coverage, and Playwright E2E coverage for all changed paths (including orphaned codegen target lifecycle and restart messaging cases).
- UX before/after: configured plugin codegen targets that lost runtime registration were previously invisible and hard to clean up; now they are explicitly listed as orphaned and removable inline.
- DX before/after: restart result messaging and Plugins pane helper logic were split across duplicated implementations; now both use shared mapping/helpers, reducing drift and making regression tests more direct.

## 2026-02-16T16:15:06-08:00

- Implemented the requested review-fix batch end-to-end, explicitly excluding backward-compatibility additions.
- Fixed plugin install conflict ordering so `install_plugin(...)` validates target-path conflicts before backend runtime preparation, preventing side effects on conflict failures.
- Unified path-like command detection via shared helper (`setta.utils.command_paths.is_path_like_command`) and applied it to both plugin manager launch-command validation and external-agent preflight command checks.
- Fixed plugin language-server launch command resolution for explicit relative commands (`./...`) by treating them as plugin-relative paths.
- Corrected backend worker-route response transport semantics by promoting header-only `content-type` values to response `mediaType`, while only forwarding `content-type` headers when not promoted.
- Preserved duplicate backend proxy response headers (not only `Set-Cookie`) by appending all normalized headers through `raw_headers` to avoid value collapse.
- Reduced frontend plugin-runtime refresh churn by reusing previously sorted registry views when registry value references are unchanged, with explicit Vitest guard coverage.
- Added/updated backend pytest coverage (`test_plugin_manager.py`, `test_plugin_worker.py`, `test_fixture_language_server_integration.py`), frontend Vitest coverage (`runtime.test.ts`), and Playwright backend-route payload coverage for header-only content-type behavior.
- Verification summary: targeted pytest and Vitest runs passed; targeted Playwright backend-route payload spec passed. Existing `plugin-language-server.spec.ts` remained intermittently failing on prior toast-visibility assertion unrelated to these code changes.

## 2026-02-16T16:58:25-08:00

- Implemented the requested top-level `review*.md` fix batch end-to-end, explicitly excluding backward-compatibility additions.
- Fixed plugin install conflict correctness by adding in-progress target-path reservations so concurrent installs fail before duplicate backend runtime preparation side effects.
- Reduced plugin-manager runtime/status hot-path overhead by caching `plugins_state` reads (mtime/size keyed) while returning deep copies to preserve mutation isolation semantics.
- Removed redundant CLI plugin mutation rescans by threading optional `rescan` control through manager mutation methods and reusing explicit pre-lookup rescans in CLI flows.
- Fixed listener patch parsing ambiguity so plugin section payloads are treated as control envelopes only for canonical control-key shapes; mixed payloads with top-level `data` now remain plain data patches.
- Reduced backend worker route-call overhead by hoisting optional FastAPI/Pydantic imports out of per-request helper paths.
- Consolidated duplicated plugin codegen target collection logic in project manager behind one shared helper used by both regular and refresh resolution paths.
- Improved frontend plugin runtime failure UX by preserving last-known-good plugin runtime/list/status/style state on runtime load errors instead of resetting to empty.
- Reduced frontend rerender/object churn by reusing previous plugin-list entry objects when runtime payload signatures are unchanged.
- Removed duplicate Plugins pane helper/formatter logic by exporting shared config-draft formatting and shared sorted-registration caching helpers.
- Tightened local frontend registration typing by removing unused fields from `RunInstructions` plugin codegen registration mapping.
- Hardened fixture-target selection heuristics by making plugin-hint path detection case-insensitive and defaulting selector-only runs to build plugin fixtures.
- Added/updated backend pytest coverage, frontend Vitest coverage, and Playwright coverage for all changed paths; verification runs passed (`pytest` targeted subsets: 95 passed total across runs, `vitest` targeted subset: 86 passed, Playwright targeted specs: 2 passed, Ruff checks clean).
- DX before/after: install conflict failures previously could still trigger duplicate backend prep side effects under contention; now conflicts fail immediately with no second prepare path.
- UX before/after: transient `/plugins/runtime` failures previously blanked plugin runtime state; now users keep last-known plugin UI state with an explicit error status and smoother recovery on next refresh.

## 2026-02-16T18:00:28-08:00

- Implemented the current top-level `review*.md` fix batch end-to-end, explicitly excluding backward-compatibility additions.
- Fixed plugin external-adapter command override execution so relative commands (for example `./fixture-adapter`) are preserved and executed exactly as provided.
- Narrowed backend plugin-worker optional import fallbacks to `ImportError` only, so non-import bootstrap failures are no longer silently masked.
- Removed unreachable listener plugin-section control-payload validation logic and kept only the effective payload checks on active code paths.
- Fixed backend plugin enable/disable idempotency so backend restart-pending state is only introduced when effective enablement actually changes.
- Updated frontend runtime error handling to clear runtime-derived plugin registries/status maps and advance `loadGeneration`, preventing stale runtime state carryover.
- Replaced plugin-list JSON-signature churn with structural reuse comparisons for runtime refreshes, reducing stringify/allocation overhead while preserving reuse correctness.
- Prioritized `PluginArea` runtime-error rendering above stale plugin-section renderer availability so runtime failure state consistently surfaces to users.
- Added plugin source-identity tokens to plugin-card keys and plugin-config editor reset dependencies so source swaps under the same plugin/version reset local UI state correctly.
- Updated shared fixture-target gating so selector-only runs without plugin hints skip plugin fixture builds, while full runs still build fixtures.
- Added/updated backend pytest coverage, frontend Vitest coverage, and Playwright E2E coverage for all changed paths; targeted validation runs passed.
- UX before/after: plugin runtime failures could still show stale section renderer output; now runtime error cards reliably replace stale plugin-renderer UI and show actionable error context.
- DX before/after: selector-only non-plugin loops still triggered plugin-fixture build overhead; now they skip fixture prep unless explicit plugin hints are present, reducing local iteration cost.

## 2026-02-16T20:15:21-08:00

- Implemented the latest requested fix batch from top-level `review*.md` findings end-to-end, explicitly excluding backward-compatibility additions.
- Fixed frontend plugin-runtime transient error recovery by clearing runtime side effects on load error (`runAllPluginCleanup`, plugin frontend signature cache, and mounted plugin stylesheet links), so unchanged-signature refreshes recover correctly instead of remaining stranded.
- Reduced frontend runtime refresh churn by introducing structural reuse for plugin status entries/primary status maps and preserving identity across no-op refreshes.
- Aligned plugin-fixture target gating with pytest semantics by parsing only real selector flags (`-k`, `-m`, `-k=...`, `-m=...`), treating `--markers` as valueless informational output, and making plugin-hint matching boundary-aware to avoid false positives like `nonplugin`.
- Added immutable cache headers for versioned plugin assets (`Cache-Control: public, max-age=31536000, immutable` when `?v=` is present) and validated header behavior in plugin route tests.
- Removed redundant legacy `/api/plugins/list` and `/api/plugins/status` Playwright route shims from runtime-only Plugins pane tests while keeping the explicit no-fallback assertion coverage.
- Added new Playwright runtime-style lifecycle coverage to verify runtime error clears plugin styles and subsequent successful refresh restores them.
- Added/updated backend pytest, frontend Vitest, and Playwright coverage for all changed paths; targeted verification passed (`pytest` subsets: 64 passed across three runs, `vitest` runtime suite: 70 passed, targeted Playwright specs: 20 passed), with CDP verification completed on the Plugins pane runtime/rescan path.

## 2026-02-16T21:11:18-08:00

- Implemented the latest top-level `review*.md` fixes end-to-end, explicitly excluding backward-compatibility additions.
- Fixed backend worker route/body binding semantics so required query parameters are no longer incorrectly satisfied from `jsonBody`, and restricted single-parameter fallback binding to required body-bound parameters.
- Preserved explicit JSON `null` response bodies in plugin route proxying while still enforcing no-body semantics for no-content status codes.
- Aligned restart capability contract with runtime mode policy by reporting manual-only restart behavior (with explicit reason) outside IDE mode.
- Added digest fields to plugin runtime/list status payloads and updated frontend runtime diffing to use digest fast paths with deep-compare fallback, reducing avoidable object churn in refresh paths.
- Tightened plugin static asset cache semantics so immutable caching applies only when `v` is a strict 64-character lowercase SHA-256 hex token.
- Fixed Playwright workspace fixture seeding/rebuild heuristics so plugin fixture artifacts are re-prepared when required outputs are missing, including selector-only plugin-targeted runs.
- Updated Plugins pane action policy/UI so `Rescan` and `Restart Setta` are disabled and hard-guarded in write-locked (non-IDE/share) contexts.
- Added/updated backend pytest coverage, frontend Vitest coverage, and Playwright E2E coverage for all changed paths; targeted verification passed (`pytest`: 398 passed, `vitest`: 95 passed, targeted Playwright: 1 passed), and CDP verification confirmed disabled plugin actions in share mode.
- UX before/after: write-locked modes previously showed actionable Rescan/Restart controls and allowed confusing attempts; now controls are visibly disabled and action handlers short-circuit immediately.
- DX before/after: plugin runtime refresh previously relied on heavier deep comparisons and could miss explicit-null response semantics; now digest-aware reuse improves refresh determinism/perf and proxy handling preserves exact JSON-null intent.
