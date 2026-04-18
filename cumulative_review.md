# Cumulative Review
## Recurring Subsystem Invariant Matrix

### Packaged Plugin Backend Launch
- Invariant: Plugin backend launch must follow the manifest entrypoint type; first-party Python LSP packaging must run without requiring end-user Go builds, while Go backends still build explicitly.
- Last finding commit: aa25246aabf24ddfa2da138200f38912c4e8e627
- Proof tests: `internal/app.TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightOnFirstOpen`; `internal/app.TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightWithoutGoToolchain`; `internal/plugins.TestServiceRuntimeActivatesFirstPartyBasedpyrightPackageManagerPlugin`; `tests/test_setta_basedpyright_plugin_backend.py`; `tests/start/test_packaged_distribution.py::test_first_party_basedpyright_plugin_wheel_packages_python_backend_only`
- Still unverified: No manual install of a built wheel into a fresh external environment beyond automated package-manager and wheel-build coverage.

### Defaults Profile Bootstrap Resilience
- Invariant: Corrupt or unreadable defaults-profile bootstrap markers must fail open and be repaired atomically; bootstrap bookkeeping must not block workspace startup or prevent the one-time missing-selection write when the default plugin is available.
- Last finding commit: ef58bfc493a93065976b75a694adeb70a3b083de
- Proof tests: `internal/app.TestBootstrapWorkspaceDefaultsInstallProfileRepairsInvalidMarker`; `internal/app.TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightOnFirstOpen`; `internal/app.TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightWithoutGoToolchain`
- Still unverified: No manual startup was run with a corrupted `defaults_install_profile_bootstrap.json`; recovery remains automated-only.

### Plugin-Owned Python LSP Settings And Runtime Paths
- Invariant: Python LSP remains plugin-owned and explicitly selected; effective basedpyright settings must come from plugin schema defaults plus plugin runtime config, include `settaFilesRoot` in `basedpyright.analysis.extraPaths`, and refresh the live applied spec/session when the selected plugin config changes.
- Last finding commit: ef58bfc493a93065976b75a694adeb70a3b083de
- Proof tests: `internal/plugins.TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults`; `internal/plugins.TestServiceLanguageServerSpecsMergesConfiguredBasedpyrightExtraPathsWithSettaFilesRoot`; `internal/app.TestAppWritingSelectedBasedpyrightConfigRefreshesAppliedSpecsAndDiagnostics`; `internal/lsp.TestRouterUsesSpecOwnedSettingsWithoutReapplyingSettingsKeyLookup`
- Still unverified: No manual editor session saved selected-plugin config and observed diagnostics or completions update live; proof is automated-only.

### Plugin Config Schema Ownership
- Invariant: Plugin config schema validation, default extraction, and runtime descriptor emission must share one owner path; a declared unreadable or invalid schema must invalidate the plugin before it can contribute active LSP specs or defaults.
- Last finding commit: 323111b0cc5369a0c99f87d1dc23d5f9690c360b
- Proof tests: `internal/plugins.TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults`; `internal/plugins.TestServiceLanguageServerSpecsRejectsInvalidPluginConfigSchema`; `tests/start/test_packaged_distribution.py::test_first_party_basedpyright_plugin_wheel_packages_python_backend_only`
- Still unverified: No manual packaged-plugin install with a corrupted or missing schema; validation coverage is automated only.

### Plugin Backend Refresh Rollback Fidelity
- Invariant: Plugin backend refresh snapshots must deep-clone `lsp.LanguageServerSpec.Settings` so rollback restores the exact pre-refresh spec state.
- Last finding commit: aa25246aabf24ddfa2da138200f38912c4e8e627
- Proof tests: `internal/app.TestCloneLanguageServerSpecsDeepCopiesSettings`; `internal/app.TestRollbackRefreshTransitionRestoresLanguageServerSettings`
- Still unverified: No manual restart/disable cycle was forced outside unit coverage.

### Explicit-Spec-Only LSP Router
- Invariant: Restart and refresh must rebuild only explicit selected language-server specs, preserve spec-owned settings, remain independent from unrelated MCP runtime failures, and republish diagnostics when selected specs change without local document edits.
- Last finding commit: ef58bfc493a93065976b75a694adeb70a3b083de
- Proof tests: `internal/app.TestWorkspaceLSPAdminRestartReturnsUnconfiguredWhenNoSpecsRemain`; `internal/app.TestAppRestartLanguageServerIgnoresBrokenUnrelatedMCPPlugin`; `internal/lsp.TestProjectSynchronizerMaterializeDocumentClearsUnavailablePythonDiagnostics`; `internal/lsp.TestProjectSynchronizerRestartClosesBeforeRematerializing`; `internal/lsp.TestRouterUsesSpecOwnedSettingsWithoutReapplyingSettingsKeyLookup`
- Still unverified: No manual editor restart or config-change session verified unchanged-document diagnostic refresh outside automated app/LSP coverage.

### Applied LSP Lifecycle Status
- Invariant: Selected-plugin discovery and applied router state must stay distinct; app-owned applied-language status must not leak into raw CLI/service status, and header UX must resolve the primary selected plugin entry instead of shadowed duplicates.
- Last finding commit: ef58bfc493a93065976b75a694adeb70a3b083de
- Proof tests: `internal/app.TestPluginBackendRuntimeRefresherAppliesLanguageServerStatus`; `internal/app.TestAppPluginRuntimeStatusTracksAppliedLanguageServerSelection`; `internal/settacmd.TestRunPluginsListJSONIncludesStatusPayload`; `frontend/src/components/AppHeader/LanguageServerStatusBanner.test.tsx` (`uses the primary plugin status entry from the runtime store`)
- Still unverified: No Playwright or browser automation covers duplicate-shadowed plugin status paths; this iteration's CDP run was limited to header behavior because some pane-level fetches failed in the reset session.

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
