## 2026-04-18 04:43:44 PDT

Summary:
- Consolidated review findings were valid. This branch still had three concrete issues: applied language-server plugin config writes could persist a rejected config before live reapply succeeded, packaged `setta-basedpyright` builds still ignored explicit `GO=...` command-name overrides on `PATH`, and several `internal/plugins` tests still seeded removed legacy `scope:pluginId` config keys instead of the canonical `scope:sourceManager:pluginId` format.
- I implemented the fixes directly and simplified the ownership boundaries instead of adding more post-write special cases or keeping stale legacy test scaffolding alive.

Fixes applied:
- Reworked `internal/plugins/config_write.go` so config writes now snapshot the previous `PluginsStateFile`, restore it if the post-save rescan fails, and expose a transactional `WriteConfigTransactional(...)` helper for callers that must apply live side effects after persistence.
- Updated `internal/app/plugin_backend_runtime_refresh.go` so the app-owned config write path uses that transactional helper. A failed `ReapplyAppliedLanguageServerPluginConfig(...)` call now restores the old persisted config instead of leaving the rejected config on disk for the next refresh or restart.
- Updated `internal/plugins/discovery_test.go` and `internal/plugins/runtime_test.go` so normal discovery/runtime coverage now seeds the canonical plugin-config keys. Legacy-key fixtures remain only in the explicit ignore-legacy coverage.
- Reworked `plugins/setta-basedpyright/setup.py` so `SETTA_GO_BIN` and `GO` are resolved as either explicit file paths or command names on `PATH` before falling back to bare `go`, and only then to repo `scripts/go.sh` on non-Windows hosts.

Tests added or upgraded:
- Go service coverage for transactional config-write rollback when the post-persist apply step fails.
- Go app integration coverage for a real `/api/plugins/config` basedpyright write that fails during rematerialization, returns non-200, preserves the old runtime config, and keeps Python completions working afterward.
- Updated `internal/plugins` discovery/runtime coverage so the canonical-key tests now exercise live config loading and redaction again instead of failing or passing vacuously on ignored legacy keys.
- Python packaging coverage for `GO=go-custom` command-name overrides.
- No Playwright coverage was added in this pass because the regressions were backend transactionality, packaging resolution, and stale backend test fixtures rather than browser-only behavior.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceWriteConfigTransactionalRestoresPreviousConfigWhenApplyFails|TestDiscoveryServiceRescanMarksPersistedCorruptPluginConfigRootInvalid|TestServiceRuntimeBuildsFrontendListAndStatusPayloads|TestServiceRuntimeRedactsConfigAndSourceOutsideIDE|TestServiceRuntimeIgnoresLegacyPluginConfigKeysForSameScopeDuplicates'`
- `./scripts/go.sh test ./internal/app -run 'TestAppWriteConfigReappliesAppliedBasedpyrightSpec|TestAppWriteConfigRestoresPreviousBasedpyrightConfigWhenReapplyFails'`
- `./scripts/go.sh test ./internal/plugins`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py`
- `pnpm -C frontend gcf`
- `./check_quality.sh`

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- Canonical plugin-config coverage is aligned with production again, packaged plugin builds now honor explicit `GO` command-name overrides, and failed live LSP config reapply no longer leaves rejected config persisted.

## 2026-04-18 04:15:47 PDT

Summary:
- Consolidated review findings were valid. This branch still had four concrete issues: plugin backend refresh could advance selected-language-server state across the explicit restart boundary, `restartLanguageServer` still validated only the default project while rematerializing the full document, config writes for already-applied language-server plugins could replace the live router service without restoring tracked documents, and Windows source builds for the first-party `setta-basedpyright` package still tried to execute the repo’s Bash `go.sh` wrapper.
- I implemented the fixes directly and simplified the ownership boundaries instead of layering more preview/live-state heuristics onto the existing paths.

Fixes applied:
- Split backend plugin runtime refresh from live LSP application in `internal/app/plugin_backend_runtime_refresh.go`. `Refresh()` now only rebuilds backend plugin runtime/tooling and commits pending backend restart state; only `RestartProject()` swaps live LSP specs, so selected-language-server `Applied` remains tied to the actual restarted project session.
- Tightened restart admission to validate every project in the normalized document, matching the full-document rematerialization done by `ProjectSynchronizer.Restart()`. Non-default projects can no longer lose LSP coverage after a false-success restart.
- Reworked applied-config reapplication so replacing an already-applied plugin LSP spec now immediately rematerializes the current document and rolls back both specs and document sync if that rematerialization fails.
- Updated app wiring so the runtime refresher owns the project snapshot/materialization dependencies it needs for the config-reapply path.
- Reworked `plugins/setta-basedpyright/setup.py` so package builds prefer `SETTA_GO_BIN`, `GO`, or `PATH` and only fall back to `scripts/go.sh` on non-Windows hosts, restoring Windows source-build behavior without a shell-wrapper dependency.

Tests added or upgraded:
- Go unit coverage proving backend runtime refresh no longer mutates applied LSP specs and proving restart admission rejects unconfigured non-default project languages.
- Go integration coverage for: applied Python LSP state staying unapplied after `Refresh()` until `POST /api/restartLanguageServer`; config writes preserving live Python completions without a manual restart; and rejected restart preserving completions for a non-default Python project.
- Python packaging coverage for the Windows/native Go resolver path and `SETTA_GO_BIN` override handling.
- Playwright coverage for the Python banner path where plugin rescan makes a selected plugin ready but the banner must stay visible until explicit restart applies it.

Verification run:
- `./scripts/go.sh test ./internal/app -run 'TestPluginBackendRuntimeRefresher|TestAppWriteConfigReappliesAppliedBasedpyrightSpec|TestAppPluginRuntimeReportsSelectedLanguageServerApplyStateOnlyAfterRestart|TestAppRestartLanguageServerRejectsMissingSelectionForNonDefaultPythonProject'`
- `./scripts/go.sh test ./internal/lsp -run 'TestRouterReplaceAdditionalSpecsRefreshesPluginLanguages|TestCloneLanguageServerSpecsDeepClonesSettings|TestNewRouterAllowsNoConfiguredLanguageServers'`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -k 'basedpyright_plugin and (native_go_binary_on_windows or honors_setta_go_bin_override)'`
- `pnpm -C frontend exec vitest run src/components/AppHeader/LanguageServerStatusBanner.test.tsx`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `./scripts/go.sh test ./internal/app -run 'TestPluginBackendRuntimeRefresher|TestAppWriteConfigReappliesAppliedBasedpyrightSpec|TestAppPluginRuntimeReportsSelectedLanguageServerApplyStateOnlyAfterRestart|TestAppRestartLanguageServerRejectsMissingSelectionForNonDefaultPythonProject'` (rerun after the final `check_quality.sh` refactor to confirm the simplified config-reapply path still passes)
- Attempted: `./scripts/run-playwright-e2e.sh frontend/tests/e2e/header/language-server-status-banner.spec.ts --grep 'header python language server banner stays visible after rescan until restart applies the plugin'`
  The new spec was added, but the local harness failed before test execution during isolated-project bootstrap with frontend/backend fetch failures (`ERR_ALPN_NEGOTIATION_FAILED`, `TypeError: Failed to fetch`, resulting `Project Not Found` page), so browser E2E verification did not complete in this environment.

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- Requested frontend generation and repo-wide quality verification completed successfully.
- The remaining open item is environmental Playwright bootstrap instability in this shell session rather than an additional code defect reproduced by the new test.

## 2026-04-18 03:42:50 PDT

Summary:
- Consolidated review findings were valid. This branch still had three concrete regressions: mixed-language workspaces could get a false `language_server_not_configured` on `restartLanguageServer`, post-restart commit failure could split the live project LSP session from router/persisted plugin state, and the standard repo Python install path no longer installed the `defaults` lane that owns the first-party Python LSP plugin.
- I implemented the fixes directly and simplified the surrounding code instead of preserving extra dead paths for test convenience.

Fixes applied:
- Reworked `internal/app/plugin_backend_runtime_refresh.go` so restart validation only considers project languages the restart is actually responsible for: `python`, languages already applied, languages present in the next spec set, or languages with an explicit selection entry. That preserves the explicit `null` disable flow while allowing Python+Bash/JS projects to restart a valid Python server without a false `409`.
- Tightened the same restart path so a commit failure after a successful live restart now restores the previous project session as well as rolling runtime/spec state back. Combined with the service-side transactional commit below, the restart boundary is once again all-or-nothing.
- Reworked `internal/plugins/service.go` so `CommitBackendRuntimeRefresh()` builds the post-clear snapshot before saving `PendingRestartBackendPluginIDs`. A save failure now leaves persisted pending state untouched instead of clearing it before the refresh commit is known-good.
- Updated `init_env.sh` so the standard repo Python setup installs `--extra defaults` in addition to `source` and `dev`, matching the branch’s pluginized Python LSP ownership.
- Removed the dead `Refresh(...)` requirement from `internal/app/lsp_admin.go` and removed the unused production `Service.LanguageServerSpecs(...)` entrypoint so tests now follow the same snapshot-owned language-server-spec path as production code.

Tests added or upgraded:
- Go unit coverage for mixed-language restart admission, restore-after-commit-failure, and the trimmed workspace LSP admin/runtime interface.
- Go integration coverage for `POST /api/restartLanguageServer` succeeding in a Python+Bash project with a valid selected Python plugin.
- Go plugin service coverage for transactional backend-runtime commit behavior when saving plugins state fails.
- Python script-wiring coverage for repo Python installs and dependency refreshes now requiring `--extra defaults`.
- No Playwright coverage was added in this pass because the regressions were backend/runtime and install-path issues rather than browser-only behavior; the real restart regression is covered at the Go HTTP integration layer.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceCommitBackendRuntimeRefresh|TestServicePreviewBackendRuntimeRefreshOmitsPendingRestartState|TestServiceLanguageServerSpecs|TestServiceRuntimeClearsBackendRegistrationsAfterUninstallCommit|TestLanguageServerContracts'`
- `./scripts/go.sh test ./internal/app -run 'TestWorkspaceLSPAdmin|TestPluginBackendRuntimeRefresherRestartProject|TestAppRestartLanguageServerAllowsMixedLanguageProjectWithPythonSelection'`
- `source activate.sh && pytest tests/start/test_dev_install_script_wiring.py tests/start/test_supply_chain_scripts.py -q`
- `pnpm -C frontend gcf`
- `./check_quality.sh`

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- Requested repo generation and quality verification completed successfully after this review pass.

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

## 2026-04-18 06:13:56 PDT

Summary:
- Consolidated review findings were valid. This pass fixed three concrete issues from the temporary top-level reviews: first-open defaults could persist `python -> setta-basedpyright` from a package-manager row that would never become the live active Python provider, selected-language-server status collapsed selected-plugin state and live-session state so the header could claim Python LSP was gone even while the old session was still serving completions until restart, and the branch-review loop script still carried trailing whitespace in the branch diff.
- I implemented the fixes directly and simplified the status contract instead of layering more inference into the frontend banner.

Fixes applied:
- Tightened defaults bootstrap in `internal/plugins/defaults_profile.go` so a package-manager default is only accepted when the effective primary plugin instance for that plugin ID is active and actually registers the requested language server. Shadowed or `pending_restart` package-manager rows no longer cause a sticky unusable default to be written on first open.
- Simplified selected-language-server runtime state in `internal/plugins/status.go` and `internal/app/plugin_backend_runtime_refresh.go` by replacing the overloaded `Applied` flag with explicit `SelectedPluginApplied` and `LiveServerAvailable` fields. That keeps the backend contract truthful at the restart boundary without extra frontend heuristics.
- Updated `frontend/src/components/AppHeader/LanguageServerStatusBanner.tsx` and related runtime helpers/tests so banner copy is driven by the explicit backend fields and correctly distinguishes “the new selection is invalid or not yet applied” from “the previously live Python server remains available until restart.”
- Removed the reviewed trailing whitespace from `scripts/run-codex-branch-review-loop.sh`.

Tests added or upgraded:
- Go defaults-profile unit coverage for shadowed packaged defaults whose effective primary plugin is unusable and for `pending_restart` package-manager copies.
- Go app/bootstrap coverage for first-open defaults bootstrap refusing to persist an unusable shadowed packaged Python default.
- Go runtime and app integration coverage for the restart-boundary states where a selected plugin is invalid or not yet applied while the current Python server is still live, including missing-selection, wrong-language, and ready-but-not-live cases.
- Frontend unit coverage for the same banner states.
- Playwright coverage for the wrong-language banner case where the current Python server remains live until restart, although local execution remained blocked by the existing isolated-project bootstrap failure.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestDefaultsInstallProfile' -count=1`
- `./scripts/go.sh test ./internal/app -run 'Test(BuildSelectedLanguageServerStatuses|BootstrapWorkspaceDefaultsInstallProfile|AppSelectedPythonLanguageServerStaysUnappliedAfterPluginRestartUntilPythonStarts|AppRestartLanguageServerRejectsWrongLanguageSelectionAfterPythonServerWasApplied|AppRestartLanguageServerRejectsMissingSelectionAfterPythonServerWasApplied)' -count=1`
- `pnpm -C frontend exec vitest run src/components/AppHeader/LanguageServerStatusBanner.test.tsx`
- `./scripts/run-playwright-e2e.sh -g 'wrong-language selection leaves the current Python server live until restart' frontend/tests/e2e/header/language-server-status-banner.spec.ts` was attempted, but the disposable environment failed before the test body ran because isolated-project bootstrap never became ready (`ERR_ALPN_NEGOTIATION_FAILED`, then `Project Not Found`).
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

## 2026-04-18 05:17:54 PDT

Summary:
- Consolidated review findings were valid. This branch still had four concrete issue clusters: duplicate plugin IDs were resolved through different precedence paths in selected spec generation versus defaults bootstrap, failed plugin-config reapply could replay stale snapshots over newer state, runtime source-build flows still ignored `GO` / `SETTA_GO_BIN` command names on `PATH`, and the branch-review loop could strand top-level `review*.md` files after failures while also writing unused bookkeeping artifacts.
- I implemented the fixes directly and removed superseded logic instead of preserving the reviewed behavior behind fallback paths.

Fixes applied:
- Added a small shared precedence helper in `internal/plugins` and switched selected language-server spec generation to build from the primary discovered plugin copy for each plugin ID, so selected specs now follow the same precedence path as status classification and other plugin-owner flows.
- Updated defaults-profile selection to locate the package-manager-owned default by plugin ID even when a linked or workspace copy shadows it, including the real shadowed-entry case where discovery does not populate backend registration metadata on the lower-precedence copy.
- Reworked transactional plugin-config rollback so it restores only the touched persisted config key and refuses to overwrite newer writes when the key changed again before rollback.
- Serialized `ReapplyAppliedLanguageServerPluginConfig` under the refresher lock so restart and refresh transitions cannot interleave with a stale pre-apply LSP snapshot.
- Unified Go tool resolution so runtime source builds accept both absolute paths and command names supplied through `GO` or `SETTA_GO_BIN`.
- Simplified `scripts/run-codex-branch-review-loop.sh` so non-`NO_FINDINGS` exits always clean up top-level `review*.md` files, and removed the script’s unused `.exit` and `last-observed-head.txt` writes.

Tests added or upgraded:
- Go unit coverage for duplicate-plugin selected language-server precedence.
- Go unit coverage for defaults-profile selection when a package-manager plugin is shadowed by a linked copy.
- Go unit coverage for transactional config rollback preserving later unrelated writes and preserving newer same-plugin writes on rollback conflict.
- Go unit coverage for `GO` / `SETTA_GO_BIN` command-name overrides on `PATH`.
- Go runtime coverage proving config reapply is serialized against restart transitions.
- Go defaults-bootstrap integration coverage for the real first-party basedpyright package-manager plus linked-copy shadowing case.
- Python script-wiring coverage for branch-review-loop cleanup of review docs and removal of unused bookkeeping artifacts.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'Test(ServiceWriteConfigTransactional(RestoresPreviousConfigWhenApplyFails|RollbackPreservesLaterUnrelatedMutation|RollbackKeepsNewerConfigForSamePlugin)|DefaultsInstallProfileAvailableLanguageServerSelections(RequireActiveRegistration|UsePackageManagerCopyWhenLinkedCopyShadowsIt)|LanguageServerSpecsFromSnapshotKeepsPrimaryPluginCopyForDuplicatePluginIDs|BuildGoBackendExecutable(HonorsGoCommandNameOverridesOnPath|ReturnsPackagedExecutableEntrypoint|RejectsNonExecutablePackagedEntrypoint))' -count=1`
- `./scripts/go.sh test ./internal/app -run 'Test(PluginBackendRuntimeRefresher(ReapplySerializesWithRestartProject|PrepareRestartTransitionClonesPreviousSettings|RollbackRestoresSettings)|BootstrapWorkspaceDefaultsInstallProfile(UsesPackagedBasedpyrightWhenLinkedCopyShadowsIt|WritesMissingPythonSelection|PreservesExplicitNullSelection|RunsOnlyOncePerProfileVersion))' -count=1`
- `source activate.sh && pytest tests/start/test_run_codex_branch_review_loop_script.py -q`
- `pnpm -C frontend gcf`
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
