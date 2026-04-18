## 2026-04-18 03:13:20 PDT

Summary:
- Consolidated review findings were valid. This branch still had four concrete issues: `restartLanguageServer` could admit a restart based on stale previously applied LSP specs instead of the post-refresh selection, rollback restore reused the request-scoped restart context and could strand the prior session after cancellation or timeout, the frontend restart success path never refreshed the runtime store that drives the Python language-server banner, and legacy `languageServer.basedpyright` test scaffolding still masked the canonical top-level `basedpyright` settings contract.
- I implemented the fixes directly and kept the code paths explicit rather than layering on compatibility branches or heuristic fallbacks.

Fixes applied:
- Reworked `internal/app/plugin_backend_runtime_refresh.go` so restart validation is based on the next selected language-server state per relevant project language, with explicit `null` disable still allowed as the only zero-spec transition. Previously applied specs no longer justify a restart into an unconfigured state.
- Changed workspace LSP restart wiring so the runtime refresher owns the restart callback context. Apply still uses the request context, but rollback restore now gets its own bounded internal context, which lets the previous project LSP session be restored after request cancellation or deadline expiry.
- Updated `frontend/src/state/actions/lsp.ts` so successful `restartLanguageServer()` calls also refresh plugin runtime state immediately, allowing the header banner to reflect the newly applied language-server state without a manual reload or plugin-pane refresh.
- Removed stale `languageServer.basedpyright` fixtures from `internal/lsp/router_test.go` and `internal/app/code_updates_test.go`, replacing them with the canonical top-level `basedpyright` settings shape and small focused helpers to keep that contract readable in tests.

Tests added or upgraded:
- Go unit coverage for restart rollback using an internal restore context, for rejecting stale previously applied specs when the next selection no longer configures the current project, and for allowing explicit null disable when it intentionally removes the active Python server.
- Go integration coverage for “applied Python LSP + wrong-language next selection + restart” and “applied Python LSP + missing next selection + restart,” both asserting `language_server_not_configured` and preserved completions after the rejected restart attempt.
- Frontend unit coverage for `restartLanguageServer()` refreshing plugin runtime state on `200` and not doing so on backend `409`.
- Playwright coverage for the Python banner clearing after a successful restart-triggered runtime refresh.

Verification run:
- `./scripts/go.sh test ./internal/app -run 'Test(WorkspaceLSPAdmin|PluginBackendRuntimeRefresher|AppRestartLanguageServer)' -count=1`
- `./scripts/go.sh test ./internal/lsp -run 'TestRouterConfiguredPython|TestBuildBasedpyrightSettingsRoot|TestCloneLanguageServerSpecsDeepClonesSettings' -count=1`
- `pnpm -C frontend exec vitest run src/state/actions/lsp.test.ts`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/header/language-server-status-banner.spec.ts --grep 'header python language server banner clears after a successful restart refresh'` was attempted, but the disposable E2E environment failed before the project became ready, surfacing `Project Not Found` plus frontend `Failed to fetch` / `ERR_ALPN_NEGOTIATION_FAILED` bootstrap errors. The new assertion did not get a usable browser surface in this shell.

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- Repo formatting and the requested quality verification completed successfully after this review pass.

## 2026-04-18 02:35:18 PDT

Summary:
- Consolidated review findings were valid. This branch still had six concrete issues: `restartLanguageServer` validation was not scoped to the current project and could reject valid disable transitions or report success for the wrong language, restart failure could leave the active project without its prior LSP session, selected-language-server status still derived future state from stale live plugin rows, legacy plugin-config persistence still accepted ambiguous same-scope `scope:pluginId` keys, the frontend restart action discarded the new backend `409 language_server_not_configured` contract, and generated frontend settings helpers could emit an invalid empty `languageServer` object on partial overrides.
- I implemented the fixes directly and removed superseded compatibility/dead-code paths rather than layering on more fallback behavior.

Fixes applied:
- Reworked plugin-runtime restart in `internal/app/plugin_backend_runtime_refresh.go` so restart validation is based on the current project’s effective languages, explicit per-language disable is allowed when it removes an already-applied server, rollback restores the prior live session if the restart callback fails, and selected-language-server status classification uses preview runtime state plus live applied specs instead of inferring future truth from stale rows.
- Removed the dead `HasConfiguredLanguageServers` abstraction from `internal/app/lsp_admin.go` and its test stubs, keeping the runtime/admin interface aligned with actual production use.
- Removed the legacy plugin-config dual-read/migration path from `internal/plugins/service.go`; persisted plugin config is now canonical `scope:sourceManager:pluginId` only, which prevents same-scope Setta and package-manager plugins from ambiguously sharing config.
- Updated `frontend/src/state/actions/lsp.ts` so restart waits for the backend response, shows success only on `200`, and surfaces backend guidance for `409 language_server_not_configured` as an error notification.
- Added an authoritative frontend default provider for `SettingsLanguageServer`, regenerated the frontend binding surface, and aligned `frontend/src/utils/idNameCreation.ts` with the generated helper imports. Partial `languageServer` overrides now preserve a valid `{ selectedByLanguage: {} }` shape.

Tests added or upgraded:
- Go unit coverage for current-project restart validation, rollback restoring the previous project LSP session, and truthful selected-language-server status classification for pending install/disable/uninstall states.
- Go app integration coverage for explicit Python-language-server disable applying only after restart and for rejecting wrong-language selections against the active project with `language_server_not_configured`.
- Go plugin persistence/runtime coverage proving legacy same-scope plugin-config keys are ignored and not migrated back into canonical config.
- Frontend unit coverage for `restartLanguageServer()` handling backend `409 language_server_not_configured` responses and for generated settings defaults preserving nested `languageServer` structure.
- Playwright coverage for the restart-language-server shortcut surfacing backend guidance, although the test remained environment-blocked locally because the required bootstrap/browser target was not available in this shell.

Verification run:
- `./scripts/go.sh test ./internal/app -run 'TestPluginBackendRuntimeRefresher|TestWorkspaceLSPAdmin|TestAppRestartLanguageServer' -count=1`
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceRescanLeavesLegacyPluginConfigKeysUnmigrated|TestServiceRuntimeIgnoresLegacyPluginConfigKeysForSameScopeDuplicates' -count=1`
- `./scripts/go.sh test ./internal/frontendbindings ./internal/settingsstate ./cmd/setta-gen-frontend-bindings -count=1`
- `pnpm -C frontend exec vitest run src/state/actions/lsp.test.ts src/utils/generatedTypes.settings.test.ts`
- `pnpm -C frontend gcf`
- `./check_quality.sh`

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- No unresolved findings from this review pass remain recorded here.

## 2026-04-18 01:54 PDT

Summary:
- Consolidated review findings were valid. This branch still had six concrete issues: config writes for applied selected language-server plugins did not flow back into the live LSP spec path, `restartLanguageServer` committed plugin-runtime refresh too early and could clear pending state on restart failure, selected-language-server status could lie about `applied` state and misclassify invalid plugins as “wrong language,” persisted plugin config keys still collapsed same-scope Setta and package-manager sources, the Python distribution build wrapper still misread `python -m build` flags passed after `--`, and the header banner copy still treated every unavailable state as already unapplied.
- I implemented the fixes directly and kept the design explicit: transactional restart stays in the existing refresh transition path, config-write reapplication updates only already-applied specs, and config persistence now uses source-aware keys instead of another compatibility layer.

Fixes applied:
- Added live config reapplication for currently applied selected language-server plugins in `internal/app/plugin_backend_runtime_refresh.go`. Successful config writes now rebuild authoritative specs from current discovery/settings and replace only the specs that are already applied, so config saves do not silently leave the live server stale or accidentally apply unrelated selection changes early.
- Added a transactional restart path on `pluginBackendRuntimeRefresher` and switched `workspaceLSPAdmin` to use it. `restartLanguageServer` now stages runtime/spec replacement, runs project restart, commits on success, and rolls back on failure instead of clearing `pending_restart` before the project restart boundary is crossed.
- Tightened selected-language-server status derivation so `applied` remains tied to the live applied spec, not just discovery state, and so invalid or otherwise non-active plugins are classified as `selected_plugin_unavailable` before any wrong-language check runs.
- Reworked plugin config persistence to use source-aware keys keyed by `scope + sourceManager + pluginId`, added legacy-key migration during rescans, and updated config read/write/remove flows so same-scope Setta and package-manager plugins no longer overwrite each other.
- Simplified `scripts/build_python_distribution_with_go_binaries.sh` argument handling so it always derives wheel/sdist/outdir behavior from the final `build_args` array, making direct flags and separator-passed flags behave identically.
- Updated the Python language-server banner to distinguish “plugin is unavailable now” from “the currently applied server will remain available until restart,” and added unit/Playwright coverage for the new banner states.

Tests added or upgraded:
- Go unit coverage for transactional restart rollback, truthful selected-language-server status derivation, and applied-spec config replacement.
- Go integration coverage for applied basedpyright config writes updating the live app-owned spec and for continued pending-restart behavior around selected Python LSP restart flows.
- Go plugin persistence coverage for same-scope Setta/package-manager config isolation.
- Python script-wiring coverage for `build_python_distribution_with_go_binaries.sh` with args passed after `--`.
- Frontend unit coverage for missing/unavailable banner copy with the new `applied` semantics.
- Playwright coverage for unavailable banner states, although the local harness remained environment-blocked before those assertions executed.

Verification run:
- `./scripts/go.sh test ./internal/app -run 'Test(AppWriteConfigReappliesAppliedBasedpyrightSpec|BuildSelectedLanguageServerStatuses|PluginBackendRuntimeRefresher|WorkspaceLSPAdmin)'`
- `./scripts/go.sh test ./internal/app -run 'Test(AppSelectedPythonLanguageServerStaysUnappliedUntilRestart|AppPluginRestartClearsPendingBackendPluginState|AppStartsWithFirstPartyBasedpyrightPluginCompletion|AppWriteConfigReappliesAppliedBasedpyrightSpec)'`
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceWriteConfig|TestServiceUninstallClearsPersistedPluginConfigBeforeRelink'`
- `pnpm -C frontend exec vitest run src/components/AppHeader/LanguageServerStatusBanner.test.tsx`
- `source activate.sh && pytest tests/start/test_distribution_script_wiring.py`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/header/language-server-status-banner.spec.ts` was attempted, but the disposable environment failed before banner assertions with frontend/backend fetch failures (`ERR_ALPN_NEGOTIATION_FAILED`) while the isolated project was bootstrapping.
- `pnpm -C frontend gcf`
- `./check_quality.sh`

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- No unresolved findings from this review pass remain recorded here.

## 2026-04-17 23:39:41 PDT

Summary:
- Consolidated review findings were valid. The branch had three real issues: broken first-party plugin packaging for package-manager discovery and `setta[defaults]`, a basedpyright interpreter-resolution regression introduced by pluginization, and lossy LSP-spec cloning during plugin-runtime refresh rollback.
- I implemented the fixes rather than carrying the review notes forward as open findings.

Fixes applied:
- Reworked `plugins/setta-basedpyright` packaging so the wheel installs a package-scoped plugin root under `setta_basedpyright/` instead of dropping plugin assets into site-packages root. This makes `importlib.metadata.distributions(...).files` expose the manifest path and gives discovery a unique plugin root.
- Updated `scripts/build_python_distribution_with_go_binaries.sh` so wheel builds also emit the first-party basedpyright plugin wheel into the same output directory. This makes the normal repo build/upload flow produce both artifacts needed by the root `defaults` extra.
- Moved interpreter ownership back to the host runtime path. Backend probing now injects the authoritative resolved `SETTA_PYTHON` when available, and the plugin backend itself now only consumes an explicit command override or configured/injected interpreter instead of maintaining a second weaker resolver.
- Centralized `LanguageServerSpec` cloning in `internal/lsp` and switched plugin-runtime refresh/rollback to use the canonical deep clone, preserving nested `Settings` across refresh failure and rollback paths.
- Removed the dead `InstallProfile.PackageSpecs` field from the defaults profile surface.

Tests added or upgraded:
- Go unit coverage for backend probe environment injection.
- Go unit coverage for canonical deep cloning of language-server specs and refresh rollback preservation.
- Go integration coverage for real first-party plugin wheel discovery via `pythonenv.Runtime.PluginDistributions`.
- Go integration coverage for defaults-profile bootstrap using a real installed plugin wheel instead of a handwritten fake site-packages layout.
- Python packaging coverage for:
  - wheel-build script wiring that now includes first-party plugin wheel output;
  - local wheelhouse installation of `setta[defaults]`;
  - continued packaged-boundary metadata assertions.

Verification run:
- Focused Go tests for `internal/app`, `internal/plugins`, `internal/lsp`, `internal/pythonenv`, and `plugins/setta-basedpyright/backend`.
- `source activate.sh && pytest tests/start/test_distribution_script_wiring.py tests/start/test_packaged_distribution.py`
- `./check_quality.sh`

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- No unresolved findings from this review pass remain recorded here.

## 2026-04-18 01:18:06 PDT

Summary:
- Consolidated review findings were valid. This branch still had eight concrete issues: packaged `setta-basedpyright` wheels still depended on host Go toolchains at runtime, live LSP selection could cross the explicit `pending_restart` boundary, selected-language-server banner state could be derived from shadowed same-ID plugins instead of the primary instance, legacy `languageServer.basedpyright` settings still affected runtime behavior, schema-invalid plugin configs lost their specific error classification on config write, the branch-review loop dropped repo cwd on `codex exec resume`, the Python distribution build helper misread attached short outdir flags like `-owheelhouse`, and an unused `LanguageServerSpecsFromSnapshot` helper remained in the plugin language-server path.
- I implemented the fixes directly and removed superseded code rather than carrying the review notes forward as open findings.

Fixes applied:
- Reworked `plugins/setta-basedpyright` wheel packaging so the plugin wheel now builds and ships a platform backend executable during wheel creation, rewrites the packaged manifest to point at that executable, and produces a platform-specific wheel instead of a runtime source-build dependency.
- Updated backend runtime/build handling so plugin backends can execute packaged binaries directly while still supporting Go-source backends in the source checkout flow.
- Tightened live language-server application so only `active` plugin state can supply live LSP specs; `pending_restart` now remains desired-but-not-applied until the explicit restart boundary.
- Simplified selected-language-server status classification to use the primary discovered plugin entry only, preventing shadowed lower-precedence copies from changing banner remediation.
- Removed the legacy nested `languageServer.basedpyright` settings fallback so basedpyright settings now come only from the current owner-defined root.
- Preserved config-schema-invalid classification through discovery and config writes by carrying explicit invalid-schema metadata instead of collapsing everything into generic manifest/config-invalid errors.
- Removed the dead `LanguageServerSpecsFromSnapshot` helper so there is only one authoritative service-owned path for language-server spec generation.
- Fixed `scripts/run-codex-branch-review-loop.sh` so resume sessions also pass `--cd "${root_dir}"`.
- Reworked short-flag tracking in `scripts/build_python_distribution_with_go_binaries.sh` so `-s`, `-w`, and attached outdir forms like `-owheelhouse` preserve the caller’s requested artifact behavior.

Tests added or upgraded:
- Go unit coverage for packaged backend executable handling.
- Go discovery/config regression coverage for schema-invalid plugin classification.
- Go unit coverage for primary-entry selected-language-server classification.
- Go app integration coverage for the `pending_restart` restart boundary with selected Python LSP state and pre/post-restart completions.
- Go `internal/lsp` coverage proving the legacy nested basedpyright settings branch is ignored.
- Python packaging coverage for first-party basedpyright wheel contents, installed manifest/backend paths, and continued local-wheelhouse `setta[defaults]` installs.
- Python script-wiring coverage for `-s -owheelhouse` and resume-session `--cd` propagation.
- Focused Playwright coverage for the wrong-language Python banner state.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestBuildGoBackendExecutableReturnsPackagedExecutableEntrypoint|TestBuildGoBackendExecutableRejectsNonExecutablePackagedEntrypoint|TestDiscoveryServiceRescanClassifiesInvalidConfigSchemaSeparately|TestServiceWriteConfigRejectsInvalidSchemaDocument' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestBuildSelectedLanguageServerStatusesUsesPrimaryPluginEntryForClassification|TestAppSelectedPythonLanguageServerStaysUnappliedUntilRestart|TestAppPluginRuntimeReportsSelectedLanguageServerApplyState' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestAppStartsWithFirstPartyBasedpyrightPluginCompletion|TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightOnFirstOpen' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestBootstrapWorkspaceDefaultsInstallProfile.*' -count=1`
- `./scripts/go.sh test ./internal/lsp -run 'TestBuildBasedpyrightSettingsRoot.*' -count=1`
- `./scripts/go.sh test ./internal/pythonenv -run 'TestRuntimePluginDistributionsDetectsFirstPartyBasedpyrightWheel' -count=1`
- `source activate.sh && pytest tests/start/test_distribution_script_wiring.py -q`
- `source activate.sh && pytest tests/start/test_run_codex_branch_review_loop_script.py -q`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'basedpyright_plugin or defaults_extra_installs_from_local_wheelhouse'`
- `pnpm -C frontend exec vitest run src/components/AppHeader/LanguageServerStatusBanner.test.tsx`
- `./check_quality.sh`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/header/language-server-status-banner.spec.ts` was attempted, but the disposable E2E environment failed before the banner assertions with `Project Not Found` / `ERR_ALPN_NEGOTIATION_FAILED`.

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- No unresolved findings from this review pass remain recorded here.

## 2026-04-18 00:34 PDT

Summary:
- Consolidated review findings were valid. This branch still had six concrete problems: stale Python-current-process test scaffolding that no longer matched pluginized LSP ownership, missing host-provided `setta_files` import roots in selected basedpyright settings, incorrect short-flag handling in the Python distribution build wrapper, header banner UX that inferred language-server readiness from plugin discovery instead of applied runtime state, lost `~` and `$HOME` expansion for explicit basedpyright launcher overrides, and soft acceptance of malformed plugin schema JSON.
- I implemented the fixes directly and removed superseded test-only and compatibility code instead of preserving the reviewed issues as open findings.

Fixes applied:
- Removed stale current-process test coverage that asserted deleted implicit-Python-LSP behavior, then rewrote router and app diagnostics tests to use explicit basedpyright specs and pluginized expectations.
- Added a focused `internal/lsp` helper for building basedpyright settings roots and updated plugin language-server selection to merge host-owned runtime `extraPaths`, including the authoritative `setta_files` root, into selected basedpyright settings.
- Reworked plugin runtime status reporting so the backend owns selected language-server desired-versus-applied state, exported that state through plugin status responses, regenerated the frontend contract surface, and simplified the header banner to render from backend truth instead of frontend inference.
- Restored explicit command-path normalization for the first-party basedpyright backend so `SETTA_LSP_COMMAND` and `SETTA_PYTHON` continue to support `~` and `$HOME` paths.
- Tightened plugin manifest loading so malformed schema JSON is treated as an invalid plugin input instead of silently dropping default settings.
- Fixed the Python distribution build wrapper so short `python -m build` flags such as `-s`, `-w`, and `-o` preserve the caller’s requested artifact behavior.

Tests added or upgraded:
- Go unit and integration coverage for selected-language-server apply state, invalid schema handling, basedpyright settings merging, and updated watch-code/generated-code diagnostics expectations.
- Go plugin-backend coverage for command-path normalization with `~` and `$HOME`.
- Python script-wiring coverage for short build flags.
- Frontend unit coverage for the backend-owned language-server banner state model.
- Playwright coverage for the language-server status banner flow.

Verification run:
- `./scripts/go.sh test ./internal/lsp -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestCodeUpdateServiceSetCodePublishesMissingArgDiagnosticsForBoundWatchCodeCallable|TestCodeUpdateServiceSetCodePublishesMissingArgDiagnosticsForBoundWatchCodeCallableWithoutRematerialize|TestCodeUpdateServiceSetCodeDoesNotLeaveGeneratedImportErrorForBoundWatchCodeModule|TestCodeUpdateServiceSetCodePublishesMissingArgDiagnosticsWhenWatchCodeSignatureChangesWithoutGeneratedCodeDiff|TestAppPluginRuntimeReportsSelectedLanguageServerApplyState' -count=1`
- `./scripts/go.sh test ./internal/plugins -run 'TestValidatePluginManifestPaths|TestServiceStatusIncludesRegisteredLanguageServers|TestFirstPartyBasedpyrightLanguageServerContract/link_discovery_selection_and_lsp_features' -count=1`
- `cd plugins/setta-basedpyright/backend && ../../../scripts/go.sh test . -count=1`
- `source activate.sh && pytest tests/start/test_distribution_script_wiring.py -k 'distribution_helper and (short or skip_cleanup or cleanup_by_default)'`
- `pnpm -C frontend exec vitest run src/components/AppHeader/LanguageServerStatusBanner.test.tsx src/plugins/runtime.test.ts`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- The targeted new Playwright spec was added but the earlier direct run remained blocked by an unrelated isolated-project bootstrap failure before the banner assertions executed.

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- No unresolved findings from this review pass remain recorded here.
