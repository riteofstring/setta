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
- Invariant: Path-like plugin language-server commands must be rejected during probe normalization unless the resolved target exists and is executable, so invalid explicit command overrides never become active selected specs.
- Last finding commit: 07e88451b3817b24d5eec88da876f57611a61d18
- Proof tests: `internal/plugins.TestNormalizeBackendLanguageServerRegistrationRejectsMissingPathLikeCommands`; `internal/plugins.TestFirstPartyBasedpyrightLanguageServerContract`; `tests/test_setta_basedpyright_plugin_backend.py::test_basedpyright_plugin_backend_probe_rejects_missing_path_override`
- Still unverified: No manual editor restart or session exercised an invalid absolute-path override outside automated probe and contract coverage.

### Plugin-Owned Python LSP Settings And Runtime Paths
- Invariant: Python LSP remains plugin-owned and explicitly selected; effective basedpyright settings must come from plugin schema defaults plus plugin runtime config, include `settaFilesRoot` in `basedpyright.analysis.extraPaths`, refresh the live applied spec/session when the selected plugin config changes, and keep schema-less selected plugin specs on an explicit empty settings object instead of reopening global settings fallback.
- Last finding commit: 7fca823b4b9b8dadac5333d27202c3399f47bd53
- Proof tests: `internal/plugins.TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults`; `internal/plugins.TestServiceLanguageServerSpecsMergesConfiguredBasedpyrightExtraPathsWithSettaFilesRoot`; `internal/plugins.TestServiceLanguageServerSpecsSchemaLessPluginUsesEmptySettingsMap`; `internal/app.TestAppWritingSelectedBasedpyrightConfigRefreshesAppliedSpecsAndDiagnostics`; `internal/lsp.TestRouterUsesSpecOwnedSettingsWithoutReapplyingSettingsKeyLookup`; `internal/lsp.TestRouterUsesExplicitEmptySpecSettingsWithoutGlobalFallback`
- Still unverified: No manual editor session saved selected-plugin config and observed diagnostics or completions update live, and no manual session exercised schema-less selected-plugin behavior outside unit coverage.

### Plugin Config Schema Ownership
- Invariant: Plugin config schema validation, resolved-default extraction, and runtime descriptor emission must share one owner path; JSON-valid but unresolvable schemas must fail authoring/discovery before the plugin can contribute active specs or defaults, and defaults supplied through local `$ref` or `allOf` must flow into plugin-owned LSP settings.
- Last finding commit: 7fca823b4b9b8dadac5333d27202c3399f47bd53
- Proof tests: `internal/plugins.TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults`; `internal/plugins.TestServiceLanguageServerSpecsRejectsInvalidPluginConfigSchema`; `internal/plugins.TestServiceLanguageServerSpecsRejectsUnresolvablePluginConfigSchema`; `internal/plugins.TestServiceLanguageServerSpecsLoadsDefaultsFromResolvedPluginConfigSchema`; `internal/plugins.TestServiceValidateFolderRejectsManifestSchemaPathsAndVersions` (`unresolvable config schema ref` subtest); `tests/start/test_packaged_distribution.py::test_first_party_basedpyright_plugin_wheel_packages_python_backend_only`
- Still unverified: No manual packaged-plugin install or config-editor flow exercised broken schema refs or referenced defaults; schema ownership proof remains automated-only.

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
