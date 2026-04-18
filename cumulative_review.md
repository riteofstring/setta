# Cumulative Review
## Recurring Subsystem Invariant Matrix

### Packaged Plugin Backend Launch
- Invariant: Plugin backend launch must follow the manifest entrypoint type; first-party Python LSP packaging must run without requiring end-user Go builds, while Go backends still build explicitly.
- Last finding commit: aa25246aabf24ddfa2da138200f38912c4e8e627
- Proof tests: `internal/app.TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightOnFirstOpen`; `internal/app.TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightWithoutGoToolchain`; `internal/plugins.TestServiceRuntimeActivatesFirstPartyBasedpyrightPackageManagerPlugin`; `tests/test_setta_basedpyright_plugin_backend.py`; `tests/start/test_packaged_distribution.py::test_first_party_basedpyright_plugin_wheel_packages_python_backend_only`
- Still unverified: No manual install of a built wheel into a fresh external environment beyond automated package-manager and wheel-build coverage.

### Plugin-Owned Python LSP Settings And Runtime Paths
- Invariant: Python LSP remains plugin-owned and explicitly selected; effective basedpyright settings come from plugin schema defaults plus plugin runtime config, and first-party selection must include `settaFilesRoot` in `basedpyright.analysis.extraPaths`.
- Last finding commit: aa25246aabf24ddfa2da138200f38912c4e8e627
- Proof tests: `internal/plugins.TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults`; `internal/plugins.TestServiceLanguageServerSpecsMergesConfiguredBasedpyrightExtraPathsWithSettaFilesRoot`; `internal/app.TestBootstrapWorkspaceDefaultsInstallProfileWritesMissingPythonSelection`
- Still unverified: No manual workspace session proving completions and diagnostics against a real selected plugin beyond the automated LSP/bootstrap coverage.

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
- Invariant: Restart and refresh must rebuild only explicit selected language-server specs, remain independent from unrelated MCP runtime failures, and reconcile project diagnostics when selected specs are removed.
- Last finding commit: 323111b0cc5369a0c99f87d1dc23d5f9690c360b
- Proof tests: `internal/app.TestWorkspaceLSPAdminRestartReturnsUnconfiguredWhenNoSpecsRemain`; `internal/app.TestAppRestartLanguageServerIgnoresBrokenUnrelatedMCPPlugin`; `internal/lsp.TestProjectSynchronizerMaterializeDocumentClearsUnavailablePythonDiagnostics`
- Still unverified: No manual disable or uninstall session was run outside automated app coverage.

### Applied LSP Lifecycle Status
- Invariant: Selected-plugin discovery and applied router state must stay distinct; runtime status and header UX should not treat a selected language server as applied until the router has actually applied that language, and project diagnostics must reconcile when selected specs appear or disappear.
- Last finding commit: 323111b0cc5369a0c99f87d1dc23d5f9690c360b
- Proof tests: `internal/app.TestPluginBackendRuntimeRefresherAppliesLanguageServerStatus`; `internal/app.TestAppPluginRuntimeStatusTracksAppliedLanguageServerSelection`; `internal/app.TestAppLinkedSelectedBasedpyrightPublishesDiagnosticsAfterLink`; `internal/app.TestAppDisablingSelectedBasedpyrightClearsDiagnosticsWithoutRestart`; `frontend/src/components/AppHeader/LanguageServerStatusBanner.test.tsx`
- Still unverified: No automated end-to-end browser test covers the pending-to-applied banner transition; coverage is unit/integration plus CDP only.

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
