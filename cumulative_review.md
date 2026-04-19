# Cumulative Review
## Recurring Subsystem Invariant Matrix

### Packaged Plugin Backend Launch
- Invariant: Package-managed plugins must install beneath plugin-specific roots so discovery can keep distinct distributions while backend launch still follows the manifest entrypoint type; first-party Python LSP packaging must run without requiring end-user Go builds, while Go backends still build explicitly.
- Last finding commit: 07e88451b3817b24d5eec88da876f57611a61d18
- Proof tests: `internal/plugins.TestDiscoveryServiceRescanKeepsDistinctPackageManagerRootsPerDistribution`; `internal/plugins.TestServiceRuntimeActivatesFirstPartyBasedpyrightPackageManagerPlugin`; `internal/plugins.TestServiceInitTemplateGeneratesPublishReadyScaffold`; `internal/pythonenv.TestRuntimePluginDistributionsReturnsManifestBearingDistributions`; `tests/start/test_packaged_distribution.py::test_first_party_basedpyright_plugin_wheel_packages_python_backend_only`; `tests/start/test_packaged_distribution.py::test_first_party_basedpyright_plugin_wheel_installs_under_plugin_specific_root`
- Still unverified: No manual install of a built wheel into a fresh external environment beyond automated package-manager and wheel install coverage.

### Defaults Profile Bootstrap Resilience
- Invariant: Corrupt or unreadable defaults-profile bootstrap markers must fail open and be repaired atomically; fill-only bootstrap must write the missing Python selection once whenever the highest-precedence active `setta-basedpyright` registration is available, regardless of source manager, without overwriting explicit `null` or custom selections.
- Last finding commit: 07e88451b3817b24d5eec88da876f57611a61d18
- Proof tests: `internal/plugins.TestDefaultsInstallProfileAvailableLanguageServerSelectionsRequireActiveRegistration`; `internal/plugins.TestDefaultsInstallProfileAvailableLanguageServerSelectionsAcceptsLinkedWorkspacePlugin`; `internal/app.TestBootstrapWorkspaceDefaultsInstallProfileWritesMissingPythonSelection`; `internal/app.TestBootstrapWorkspaceDefaultsInstallProfilePreservesExplicitNullSelection`; `internal/app.TestBootstrapWorkspaceDefaultsInstallProfileSelectsAvailableLinkedPlugin`; `internal/app.TestBootstrapWorkspaceDefaultsInstallProfileRunsOnlyOncePerProfileVersion`; `internal/app.TestBootstrapWorkspaceDefaultsInstallProfileRepairsInvalidMarker`
- Still unverified: No manual workspace startup observed the version-bumped bootstrap filling a previously missed linked-plugin selection; recovery remains automated-only.

### Probe-Time Language-Server Command Validation
- Invariant: Probe normalization must fail closed unless a plugin-backed language-server command is actually launchable: path-like overrides must resolve to executable targets, override argv parsing must preserve platform-native paths and quoting, and first-party default-interpreter fallbacks must prove required modules are importable before a registration is advertised.
- Last finding commit: a0d54ac7f17c08ce89c57d580176bbf2102ff427
- Proof tests: `internal/plugins.TestNormalizeBackendLanguageServerRegistrationRejectsMissingPathLikeCommands`; `internal/plugins.TestFirstPartyBasedpyrightLanguageServerContract`; `internal/plugins.TestServiceRuntimeMarksFirstPartyBasedpyrightInvalidWhenDefaultInterpreterLacksBasedpyright`; `tests/test_setta_basedpyright_plugin_backend.py::test_basedpyright_plugin_backend_probe_rejects_missing_path_override`; `tests/test_setta_basedpyright_plugin_backend.py::test_basedpyright_plugin_backend_probe_rejects_default_interpreter_without_basedpyright`; `tests/test_setta_basedpyright_plugin_backend.py::test_split_language_server_args_preserves_windows_backslash_paths`; `tests/test_setta_basedpyright_plugin_backend.py::test_split_language_server_args_preserves_quoted_windows_paths`; `internal/app.TestAppRestartLanguageServerReturnsUnconfiguredWhenDefaultInterpreterLacksBasedpyright`
- Still unverified: No Windows-host probe or packaged install exercised override args against a live editor session outside automated probe, runtime, and app coverage.

### Plugin-Owned Python LSP Settings And Runtime Paths
- Invariant: Python LSP remains plugin-owned and explicitly selected; effective basedpyright settings must come from plugin schema defaults plus plugin runtime config, include `settaFilesRoot` in `basedpyright.analysis.extraPaths`, live config writes may refresh only already-applied selected specs, and schema-less selected plugin specs must stay on an explicit empty settings object instead of reopening global settings fallback.
- Last finding commit: a0d54ac7f17c08ce89c57d580176bbf2102ff427
- Proof tests: `internal/plugins.TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults`; `internal/plugins.TestServiceLanguageServerSpecsMergesConfiguredBasedpyrightExtraPathsWithSettaFilesRoot`; `internal/plugins.TestServiceLanguageServerSpecsSchemaLessPluginUsesEmptySettingsMap`; `internal/app.TestAppWritingSelectedBasedpyrightConfigRefreshesAppliedSpecsAndStatus`; `internal/app.TestAppWritingConfigForAppliedLanguageServerRefreshesProjectSyncOnce`; `internal/lsp.TestRouterUsesSpecOwnedSettingsWithoutReapplyingSettingsKeyLookup`; `internal/lsp.TestRouterUsesExplicitEmptySpecSettingsWithoutGlobalFallback`
- Still unverified: No manual editor session saved selected-plugin config and observed diagnostics or completions update live, and no manual session exercised schema-less selected-plugin behavior outside automated coverage.

### Plugin Config Schema Ownership
- Invariant: Plugin config schema validation, resolved-default extraction, and runtime descriptor emission must share one owner path, including platform-correct `file:` URI resolution; JSON-valid but unresolvable schemas must fail authoring/discovery before the plugin can contribute active specs or defaults, and defaults supplied through local `$ref` or `allOf` must flow into plugin-owned LSP settings.
- Last finding commit: a0d54ac7f17c08ce89c57d580176bbf2102ff427
- Proof tests: `internal/plugins.TestPluginConfigSchemaPathFromFileURIForOS`; `internal/plugins.TestServiceLanguageServerSpecsKeepsFirstPartyBasedpyrightActiveOnWindowsSchemaPaths`; `internal/plugins.TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults`; `internal/plugins.TestServiceLanguageServerSpecsRejectsInvalidPluginConfigSchema`; `internal/plugins.TestServiceLanguageServerSpecsRejectsUnresolvablePluginConfigSchema`; `internal/plugins.TestServiceLanguageServerSpecsLoadsDefaultsFromResolvedPluginConfigSchema`; `internal/plugins.TestServiceValidateFolderRejectsManifestSchemaPathsAndVersions` (`unresolvable config schema ref` subtest); `tests/start/test_packaged_distribution.py::test_first_party_basedpyright_plugin_wheel_packages_python_backend_only`
- Still unverified: The Windows schema-path integration proof is automated-only and skipped on non-Windows hosts; no manual packaged-plugin install or config-editor flow exercised schema loading on Windows.

### Plugin Backend Refresh Rollback Fidelity
- Invariant: Plugin backend refresh snapshots must deep-clone `lsp.LanguageServerSpec.Settings` so rollback restores the exact pre-refresh spec state.
- Last finding commit: aa25246aabf24ddfa2da138200f38912c4e8e627
- Proof tests: `internal/app.TestCloneLanguageServerSpecsDeepCopiesSettings`; `internal/app.TestRollbackRefreshTransitionRestoresLanguageServerSettings`
- Still unverified: No manual restart/disable cycle was forced outside unit coverage.

### Explicit-Spec-Only LSP Router
- Invariant: Restart and refresh must rebuild only explicit selected language-server specs, preserve spec-owned settings, remain independent from unrelated MCP runtime failures, trigger project reconciliation exactly once per explicit restart, and republish diagnostics when selected specs change without local document edits.
- Last finding commit: a0d54ac7f17c08ce89c57d580176bbf2102ff427
- Proof tests: `internal/app.TestWorkspaceLSPAdminRestartOnlyRestartsProjectSyncOnceWhenSpecsChange`; `internal/app.TestWorkspaceLSPAdminRestartOnlyRestartsProjectSyncOnceWhenSpecsDisappear`; `internal/app.TestWorkspaceLSPAdminRestartReturnsUnconfiguredWhenNoSpecsRemain`; `internal/app.TestAppRestartLanguageServerIgnoresBrokenUnrelatedMCPPlugin`; `internal/lsp.TestProjectSynchronizerMaterializeDocumentClearsUnavailablePythonDiagnostics`; `internal/lsp.TestProjectSynchronizerRestartClosesBeforeRematerializing`; `internal/lsp.TestRouterUsesSpecOwnedSettingsWithoutReapplyingSettingsKeyLookup`
- Still unverified: No manual editor restart or config-change session verified unchanged-document diagnostic refresh or the single-restart path outside automated app/LSP coverage.

### Applied LSP Lifecycle Status
- Invariant: Selected-plugin discovery, persisted pending-restart markers, config-write refresh, and applied router state must converge without leaking app-owned applied-language status into raw CLI/service status; already-applied selected plugins may refresh live, while selected-but-unapplied plugins must remain pending until explicit restart, and header UX must preserve the intentional missing vs `null` vs plugin-ID selection states while deriving pending and invalid messaging from runtime-applied languages and the primary selected-plugin status entry.
- Last finding commit: a0d54ac7f17c08ce89c57d580176bbf2102ff427
- Proof tests: `internal/app.TestPluginBackendRuntimeRefresherAppliesLanguageServerStatus`; `internal/app.TestWorkspaceLSPAdminRestartRefreshesRuntimeBeforeSync`; `internal/app.TestAppPluginRuntimeStatusTracksAppliedLanguageServerSelection`; `internal/app.TestAppRestartLanguageServerClearsPendingStateForSelectedLanguageServerOnlyPlugin`; `internal/app.TestAppWritingSelectedBasedpyrightConfigRefreshesAppliedSpecsAndStatus`; `internal/app.TestAppWritingConfigForSelectedUnappliedLanguageServerDoesNotApplyUntilRestart`; `internal/plugins.TestServiceCommitAppliedLanguageServerPluginsClearsPendingStateForLanguageServerOnlyPlugin`; `internal/plugins.TestServiceCommitAppliedLanguageServerPluginsPreservesPendingStateForMixedBackendPlugin`; `internal/settacmd.TestRunPluginsListJSONIncludesStatusPayload`; `frontend/src/components/AppHeader/LanguageServerStatusBanner.test.tsx` (`uses the primary plugin status entry from the runtime store`; `warns when Python remains applied after the selection is cleared`; `warns when the selected plugin is invalid instead of calling it non-Python`); `frontend/tests/e2e/header/language-server-status-banner.spec.ts` (`python language-server banner warns when Python is still applied after selection is cleared`)
- Still unverified: No automated browser flow covers the invalid-selected-plugin branch end-to-end, and no manual editor session exercised the full install-select-restart cycle or the selected-but-unapplied config-write path outside targeted app coverage.

## 2026-04-18 20:10:39 PDT
Fixes applied:
- Replaced the first-party basedpyright probe backend with a packaged Python entrypoint and taught backend launch/probe/runtime paths to resolve Go or Python backends from one owner path.
- Restored plugin-backed basedpyright runtime parity by merging `settaFilesRoot` into effective `analysis.extraPaths`, centralized plugin config schema default extraction, preserved refresh rollback settings fidelity, and removed dead implicit-router bootstrap scaffolding.
- Reduced `scripts/build-runtime-break-shortlist.py` complexity to satisfy the current quality gate without changing its diagnostic classification behavior.

Tests added or upgraded:
- Added focused Go coverage for package-manager defaults bootstrap without Go, basedpyright runtime activation, `extraPaths` merging, refresh rollback cloning, and explicit-spec router initialization.
- Added pytest coverage for the first-party basedpyright plugin backend probe and for wheel contents that now package only the Python backend entrypoint.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceRuntimeActivatesFirstPartyBasedpyrightPackageManagerPlugin|TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults|TestServiceLanguageServerSpecsMergesConfiguredBasedpyrightExtraPathsWithSettaFilesRoot' -v`
- `./scripts/go.sh test ./internal/app -run 'TestBootstrapWorkspaceDefaultsInstallProfileWritesMissingPythonSelection|TestAppBootstrapsDefaultsProfilePackageManagerBasedpyright(OnFirstOpen|WithoutGoToolchain)|TestCloneLanguageServerSpecsDeepCopiesSettings|TestRollbackRefreshTransitionRestoresLanguageServerSettings' -v`
- `./scripts/go.sh test ./internal/lsp -run 'TestRouterInitializesFromExplicitSpecsOnly|TestRouterReplaceAdditionalSpecsRefreshesPluginLanguages' -v`
- `source activate.sh && pytest tests/test_setta_basedpyright_plugin_backend.py tests/start/test_packaged_distribution.py -k basedpyright`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: not run; no UI behavior changed in this iteration.

Residual risks / verification gaps:
- Packaged/defaults behavior is covered by automated package-manager and wheel tests, but not by a manual fresh-machine wheel install.
- No end-to-end manual editor session was run to observe basedpyright diagnostics/completions after selection and restart.

## 2026-04-18 21:14:26 PDT
Fixes applied:
- Added applied-language status to plugin runtime and made selected-plugin link, disable, and banner flows wait for actual router application instead of discovery-only availability.
- Scoped `/api/restartLanguageServer` to selected LSP spec refresh so unrelated broken MCP plugins no longer block language-server restart, and reconciled project diagnostics when selected specs disappear.
- Validated declared plugin config schemas during discovery and reused the same schema owner path for LSP defaults and runtime descriptor emission.

Tests added or upgraded:
- Added app coverage for selected-plugin link, disable, applied-status tracking, and restart with an unrelated broken MCP plugin.
- Added LSP/project-sync coverage for clearing unavailable Python diagnostics, plugin-runtime status overlay coverage, invalid-schema rejection coverage, frontend banner coverage, and wheel schema packaging coverage.

Verification run:
- `./scripts/go.sh test ./internal/lsp -run 'TestProjectSynchronizerMaterializeDocumentClearsUnavailablePythonDiagnostics|TestProjectSynchronizerMaterializeDocument|TestProjectSynchronizerTypeCheckProjectLogsDebugSummary'`
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceLanguageServerSpecs(IncludesFirstPartyBasedpyrightDefaults|MergesConfiguredBasedpyrightExtraPathsWithSettaFilesRoot|RejectsInvalidPluginConfigSchema)'`
- `./scripts/go.sh test ./internal/app -run 'TestWorkspaceLSPAdminRestart|TestPluginBackendRuntimeRefresherAppliesLanguageServerStatus|TestAppLinkedSelectedBasedpyrightPublishesDiagnosticsAfterLink|TestAppDisablingSelectedBasedpyrightClearsDiagnosticsWithoutRestart|TestAppPluginRuntimeStatusTracksAppliedLanguageServerSelection|TestAppRestartLanguageServerIgnoresBrokenUnrelatedMCPPlugin'`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -k basedpyright`
- `pnpm -C frontend gcf`
- `pnpm -C frontend exec vitest run src/components/AppHeader/LanguageServerStatusBanner.test.tsx src/plugins/runtime.test.ts`
- `./check_quality.sh`
- Browser verification: `./aireset.sh` + CDP on `/home`; verified the pending-restart banner appears for selected-but-unapplied `setta-basedpyright`, verified it disappears after `/api/restartLanguageServer`, then stopped the session.

Residual risks / verification gaps:
- No Playwright coverage yet exercises the header banner transition; browser verification was CDP-only.
- No manual editor session exercised completions and diagnostics through the full install-select-restart cycle outside targeted app tests.

## 2026-04-18 22:17:06 PDT
Fixes applied:
- Made defaults-profile bootstrap fail open on invalid marker reads and rewrite the marker atomically instead of aborting workspace initialization.
- Refreshed selected-plugin LSP specs and project documents on plugin config writes, forced a post-restart document refresh for unchanged files, and kept router session settings on the spec-owned path.
- Narrowed applied-language status ownership so raw CLI/service status omits app-only applied fields, and made the header banner resolve the primary runtime status entry instead of scanning duplicates.

Tests added or upgraded:
- Added invalid-marker bootstrap recovery coverage, live selected-plugin config-write refresh coverage, spec-owned router settings coverage, project-synchronizer restart refresh coverage, raw CLI status coverage, and updated header-banner coverage for primary-entry status resolution.

Verification run:
- `./scripts/go.sh test ./internal/app -run 'TestBootstrapWorkspaceDefaultsInstallProfileRepairsInvalidMarker|TestAppWritingSelectedBasedpyrightConfigRefreshesAppliedSpecsAndDiagnostics|TestAppPluginRuntimeStatusTracksAppliedLanguageServerSelection|TestAppDisablingSelectedBasedpyrightClearsDiagnosticsWithoutRestart'`
- `./scripts/go.sh test ./internal/lsp -run 'TestProjectSynchronizerRestartClosesBeforeRematerializing|TestRouterUsesSpecOwnedSettingsWithoutReapplyingSettingsKeyLookup'`
- `./scripts/go.sh test ./internal/settacmd -run 'TestRunPluginsListJSONIncludesStatusPayload'`
- `pnpm -C frontend exec vitest run src/components/AppHeader/LanguageServerStatusBanner.test.tsx`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: `./aireset.sh` + CDP on `/home`; verified the no-selection banner in a clean workspace, then linked and selected `setta-basedpyright` in the live session and confirmed the header banner no longer rendered after reload; stopped the session afterward.

Residual risks / verification gaps:
- No Playwright coverage exercises the header/runtime transition or the live plugin-config refresh path.
- The reset-session CDP run hit unrelated pane-level fetch failures, so manual verification was limited to header behavior and did not cover a full project/editor workflow.
- No manual editor session observed diagnostics or completions after a live selected-plugin config save.

## 2026-04-18 23:02:10 PDT
Fixes applied:
- Moved first-party package-managed plugin artifacts and scaffolded plugin data files under plugin-specific roots instead of shared `site-packages` directories.
- Made defaults-profile bootstrap availability-based for active linked or package-managed `setta-basedpyright` copies and bumped the profile version so the fill-only bootstrap can rerun once for previously missed workspaces.
- Rejected missing or non-executable path-like LSP command overrides in the first-party basedpyright probe and in the core backend probe normalizer.

Tests added or upgraded:
- Added package-manager discovery and runtime coverage for distinct plugin roots, manifest-bearing distributions, and publish-ready scaffold output.
- Added defaults-profile selection coverage for linked workspace plugins and versioned one-shot bootstrap behavior.
- Added probe and pytest coverage for rejecting missing path-like command overrides, plus wheel-install coverage for plugin-specific install roots.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestDefaultsInstallProfile|TestDiscoveryServiceRescan(IncludesPackageManagerEntriesAndPrecedence|KeepsDistinctPackageManagerRootsPerDistribution)|TestNormalizeBackendLanguageServerRegistration|TestFirstPartyBasedpyrightLanguageServerContract|TestServiceRuntimeActivatesFirstPartyBasedpyrightPackageManagerPlugin|TestServiceInitTemplateGeneratesPublishReadyScaffold' -v`
- `./scripts/go.sh test ./internal/app -run 'TestBootstrapWorkspaceDefaultsInstallProfile(SelectsAvailableLinkedPlugin|WritesMissingPythonSelection|PreservesExplicitNullSelection|RunsOnlyOncePerProfileVersion|RepairsInvalidMarker)' -v`
- `./scripts/go.sh test ./internal/pythonenv -run 'TestRuntimePluginDistributionsReturnsManifestBearingDistributions' -v`
- `./scripts/go.sh test ./internal/settacmd -run 'TestRunPluginsListJSONIncludesStatusPayload' -v`
- `source activate.sh && pytest tests/test_setta_basedpyright_plugin_backend.py tests/start/test_packaged_distribution.py -k 'basedpyright or plugin_specific_root'`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: not run; no UI behavior changed in this iteration.

Residual risks / verification gaps:
- No manual fresh-machine wheel install was run beyond automated build and install coverage.
- No manual workspace startup observed the version-bumped defaults bootstrap fixing a previously missed linked-plugin selection.
- No manual editor session exercised invalid absolute-path override behavior; proof is automated-only.

## 2026-04-18 23:52:53 PDT
Fixes applied:
- Unified plugin config-schema loading so authoring validation, discovery invalidation, runtime reads, config writes, and plugin-owned default extraction all validate the same resolved schema path.
- Extended plugin-owned LSP settings handling so selected plugin specs always carry explicit settings maps, preventing schema-less plugin registrations from falling back through legacy global settings branches.

Tests added or upgraded:
- Added plugin coverage for schema-less selected-plugin empty settings, unresolvable config-schema refs, and defaults supplied through local `$ref` plus `allOf`.
- Added router coverage for explicit empty spec settings bypassing global settings fallback.
- Added authoring validation coverage for rejecting JSON-valid but unresolvable config-schema refs.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceLanguageServerSpecs|TestServiceValidateFolderRejectsManifestSchemaPathsAndVersions|TestServiceWriteConfigRejectsInvalidSchemaDocument|TestServiceRuntimeBuildsFrontendListAndStatusPayloads'`
- `./scripts/go.sh test ./internal/lsp -run 'TestRouterUsesSpecOwnedSettingsWithoutReapplyingSettingsKeyLookup|TestRouterUsesExplicitEmptySpecSettingsWithoutGlobalFallback'`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: not run; no UI behavior changed in this iteration. No `./aireset.sh` session was active at finalization.

Residual risks / verification gaps:
- No manual packaged-plugin install or plugin-config editing flow exercised broken schema refs or referenced defaults outside automated Go coverage.
- No manual editor session exercised a schema-less selected plugin through completion/diagnostic flows; the empty-settings fallback fix is unit-tested only.

## 2026-04-19 00:54:52 PDT
Fixes applied:
- Cleared persisted pending-restart markers for language-server-only plugins after successful LSP restart so runtime status, applied languages, and restart-required reporting converge again.
- Made the header banner use runtime-applied language-server state for explicit-off and missing-selection messaging, and prefer invalid/unavailable selected-plugin status over a misleading "does not provide Python" banner.
- Made the first-party basedpyright probe fail closed when the default interpreter cannot import `basedpyright.langserver`, so broken default interpreters produce invalid runtime status and `language_server_not_configured` on restart instead of late launch failure.

Tests added or upgraded:
- Added Go coverage for clearing pending restart state on language-server-only plugins while preserving mixed-backend pending state, plus app coverage for restart-state convergence and unconfigured restart behavior under a broken default interpreter.
- Added pytest coverage for rejecting the default interpreter when `basedpyright` is missing.
- Added frontend banner unit coverage for "still applied after selection cleared" and invalid selected-plugin messaging, plus Playwright coverage for the cleared-selection/applied-state banner transition.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceCommitAppliedLanguageServerPlugins|TestServiceRuntimeMarksFirstPartyBasedpyrightInvalidWhenDefaultInterpreterLacksBasedpyright' -v`
- `./scripts/go.sh test ./internal/app -run 'TestWorkspaceLSPAdminRestart|TestAppPluginRuntimeStatusTracksAppliedLanguageServerSelection|TestAppRestartLanguageServer(ClearsPendingStateForSelectedLanguageServerOnlyPlugin|ReturnsUnconfiguredWhenDefaultInterpreterLacksBasedpyright)' -v`
- `source activate.sh && pytest tests/test_setta_basedpyright_plugin_backend.py -k 'default_interpreter or missing_path_override or honors_explicit_command_override or defaults_to_running_interpreter'`
- `pnpm -C frontend exec vitest run src/components/AppHeader/LanguageServerStatusBanner.test.tsx`
- `./scripts/run-playwright-e2e.sh tests/e2e/header/language-server-status-banner.spec.ts`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: `./aireset.sh` + CDP on `/home`; verified the live banner for "Python still applied after selection cleared" and for an invalid selected plugin showing unavailable messaging, then stopped the session. Playwright covered the cleared-selection/applied-state path end-to-end.

Residual risks / verification gaps:
- No automated browser run covers the invalid-selected-plugin banner branch end-to-end; that branch was verified by unit coverage and CDP only.
- No manual editor session exercised completions or diagnostics through the full install-select-restart flow; runtime convergence remains covered by targeted Go tests rather than a live editor workflow.

## 2026-04-19 01:53:43 PDT
Fixes applied:
- Separated selected-spec refresh from project-sync restart so plugin config writes only refresh already-applied LSPs, while explicit restart remains the sole path that applies newly selected specs and now restarts project sync once.
- Shared Windows-safe `file:` URI path resolution across plugin config schema loading and default extraction so discovery and runtime keep first-party basedpyright active on Windows schema paths.
- Switched first-party basedpyright override-arg parsing to platform-aware splitting so Windows backslash and quoted paths survive probe/runtime handoff unchanged.

Tests added or upgraded:
- Added `internal/app.TestWorkspaceLSPAdminRestartOnlyRestartsProjectSyncOnceWhenSpecsChange`, `internal/app.TestWorkspaceLSPAdminRestartOnlyRestartsProjectSyncOnceWhenSpecsDisappear`, `internal/app.TestAppWritingConfigForAppliedLanguageServerRefreshesProjectSyncOnce`, and `internal/app.TestAppWritingConfigForSelectedUnappliedLanguageServerDoesNotApplyUntilRestart`; renamed the selected-basedpyright config-refresh app test to assert applied status.
- Added `internal/plugins.TestPluginConfigSchemaPathFromFileURIForOS` and Windows-only `internal/plugins.TestServiceLanguageServerSpecsKeepsFirstPartyBasedpyrightActiveOnWindowsSchemaPaths`.
- Added pytest coverage for preserving Windows override args: `tests/test_setta_basedpyright_plugin_backend.py::test_split_language_server_args_preserves_windows_backslash_paths` and `tests/test_setta_basedpyright_plugin_backend.py::test_split_language_server_args_preserves_quoted_windows_paths`.

Verification run:
- `./scripts/go.sh test ./internal/app -run 'TestWorkspaceLSPAdminRestart|TestAppWriting(ConfigFor(AppliedLanguageServerRefreshesProjectSyncOnce|SelectedUnappliedLanguageServerDoesNotApplyUntilRestart)|SelectedBasedpyrightConfigRefreshesAppliedSpecsAndStatus)' -v`
- `./scripts/go.sh test ./internal/plugins -run 'TestPluginConfigSchemaPathFromFileURIForOS|TestServiceLanguageServerSpecsKeepsFirstPartyBasedpyrightActiveOnWindowsSchemaPaths' -v`
- `source activate.sh && pytest tests/test_setta_basedpyright_plugin_backend.py`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: not run; no UI behavior changed in this iteration. No `./aireset.sh` session was active at finalization.

Residual risks / verification gaps:
- The Windows schema-path integration test is skipped on non-Windows hosts, and no Windows-host packaged-plugin or editor workflow was run manually.
- No manual editor session exercised the full install-select-restart cycle or live config-save behavior for diagnostics/completions after these lifecycle changes.
