# Cumulative Review

## Recurring Subsystem Invariant Matrix

### Watch Code Plugin Mutations
- Invariant: Watch Code plugin routes and backend UI settings may keep plugin-owned public surfaces, but provider-owned Watch Code settings must fail closed unless exactly one probed provider is active; accepted live mutations must pass strict owner decoding and write through the app-owned Go runtime so persisted state, live snapshots, websocket updates, frontend op status, Watch Code service config, and ignored-root policy share one canonical writer.
- Last finding commit: a1f566beb5a4e34b2675bdbbe4f8a2a9132914d6
- Proof tests: `TestAppWatchCodePluginRouteMutatesLiveRuntimeAndPreservesDataAcrossSave`; `TestAppWatchCodePluginRouteRejectsUnsupportedFolderPropertiesWithoutMutation`; `TestAppIDEMCPToolCallRouteWritesActiveWatchCodeUISettingThroughLiveRuntime`; `TestAppIDEMCPToolCallRouteRejectsUnsupportedWatchCodeFolderPropertiesWithoutMutation`; `TestAppIDEMCPToolCallRouteHidesWatchCodeUISettingsForPendingRestartProvider`; `TestAppIDEMCPToolCallRouteHidesWatchCodeUISettingsDuringProviderConflict`; `tests/plugin_runtime/test_watch_code_plugin_backend.py`
- Still unverified: Browser/CDP flow not run; no rendered UI behavior changed.

### Watch Code Provider Registry
- Invariant: When an active Watch Code provider exists, project mutations that can change callable membership must update the provider's pluginData registry in the same document revision; providerless project paths must not recreate core Watch Code fields.
- Last finding commit: 0317ff3f3ff9a601f43097511f5a85e0b32337c0
- Proof tests: `TestAppSetCallableRouteSyncsActiveWatchCodeProviderRegistry`; `TestRuntimeDeleteSectionVariantPrunesWatchCodeProviderRegistryMembership`; `TestRuntimeDeleteSectionVariantKeepsWatchCodeProviderRegistryMembershipForRemainingVariant`
- Still unverified: No separate negative no-provider callable test was added in this iteration.

### Watch Code Provider Service Lifecycle
- Invariant: Watch Code service lifecycle has one mutable owner, `watchCodeServiceRef`; provider unavailability must stop the service without fallback raw pointers or stored-data processing.
- Last finding commit: 83049c7b9c80a423262e5085d0e9c3f72ef0ff56
- Proof tests: Existing app tests assert `app.watchCodeRef.Current()` across startup, enable, no-provider, launcher, and core-route absence paths; `TestAppIDEMCPToolCallRouteHidesWatchCodeUISettingsForPendingRestartProvider`; `TestAppIDEMCPToolCallRouteHidesWatchCodeUISettingsDuringProviderConflict`
- Still unverified: No new dedicated shutdown-count test was added in this iteration.

### Generic Plugin Canvas Controls
- Invariant: Canvas-control ordering has one shared comparator for placement, order, label, plugin ID, and control ID so registration-time and runtime-store sorting cannot drift; feature-provider frontends that are pending restart, conflicting, disabled, invalid, or non-selected must not run registration side effects for controls or setting reveal handlers.
- Last finding commit: a1f566beb5a4e34b2675bdbbe4f8a2a9132914d6
- Proof tests: `frontend/src/plugins/runtime.test.ts`
- Still unverified: Browser/CDP visual check not run; registration gating is covered by runtime unit tests.

### Extracted Watch Code Surface Contracts
- Invariant: After Watch Code extraction, docs and tests target plugin-owned routes, DOM IDs, and `plugin::<provider>::*` settings; stale core route names, core selectors, compatibility aliases, superseded CAS-shaped Watch Code mutation shims, duplicate Python/local-core Watch Code mutation backends, and generated local-core command constants stay deleted.
- Last finding commit: a1f566beb5a4e34b2675bdbbe4f8a2a9132914d6
- Proof tests: `frontend/tests/e2e/overview/layout/watch-code-pane.spec.ts`; `plugins/setta-watch-code/frontend/tests/register.test.ts`; `TestScopedRegistryDoesNotExposeCoreWatchCodeSettings`; `tests/plugin_runtime/test_local_core.py`; `tests/start/test_packaged_distribution.py`; Go build coverage after deleting `CompareAndSetWatchCode*`, `Project.SetWatchCode*`, and Watch Code local-core commands.
- Still unverified: Updated Playwright spec was not rerun in this iteration because no rendered UI behavior changed.

### UI Settings Core Registry API
- Invariant: Core UI-setting registry construction should expose only behavior it actually supports; empty option structs and `WithOptions` constructors must not be retained as speculative future plumbing.
- Last finding commit: 83049c7b9c80a423262e5085d0e9c3f72ef0ff56
- Proof tests: `TestScopedRegistryDoesNotExposeCoreWatchCodeSettings`; Go build coverage after deleting `CoreRegistryOptions` and `NewCoreRegistryWithOptions`
- Still unverified: None.

### Codex Plan Loop Tooling
- Invariant: Post-merge Codex loop tooling keeps generic reusable entrypoints and does not retain branch-specific wrapper scripts after their implementation branch.
- Last finding commit: 0317ff3f3ff9a601f43097511f5a85e0b32337c0
- Proof tests: `tests/start/test_codex_plan_loop_scripts.py`
- Still unverified: None.

## 2026-04-25 20:50:34 PDT

Fixes applied:
- Moved Watch Code plugin route and backend UI-setting writes onto the app-owned runtime path while keeping the plugin-owned `/plugins/<provider>/watch-code/*` surface.
- Made provider-aware callable and section-variant mutations sync Watch Code registry membership in provider plugin data.
- Removed split raw Watch Code service ownership, stale Watch Code caret/old route references, duplicated canvas-control sorting, and the branch-specific Codex loop wrapper.
- Returned backend UI-setting `normalizedValue` from the owner-normalized accepted value.

Tests added or upgraded:
- Added app integration coverage for live Watch Code plugin route writes, persistence across later app saves, ignored-root baselining, and setCallable provider registry sync.
- Added projectstate runtime variant-deletion registry membership tests.
- Added backend UI-setting normalization coverage.
- Updated Watch Code E2E expectations and Codex plan-loop script coverage for removed stale surfaces.

Verification run:
- `./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeDeleteSectionVariant(PrunesWatchCodeProviderRegistryMembership|KeepsWatchCodeProviderRegistryMembershipForRemainingVariant)'`
- `./scripts/go.sh test ./internal/uisettings -run TestBuildPluginBackendRuntimeEntryReturnsBackendNormalizedValue`
- `./scripts/go.sh test ./internal/app -run 'TestApp(WatchCodePluginRouteMutatesLiveRuntimeAndPreservesDataAcrossSave|SetCallableRouteSyncsActiveWatchCodeProviderRegistry|PluginEnableStartsWatchCodeService|IDEStartupSyncsWatchCodeServiceFromSavedProjectState|SetWatchCodeEnabledCoreRouteIsAbsent|MainRuntimeSaveSyncsWatchCodeServiceConfigs)'`
- `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterPluginRootRoutes'`
- `./scripts/go.sh test ./internal/uisettings`
- `./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeDeleteSectionVariant|TestProjectDeleteSectionVariant'`
- `pnpm -C frontend exec vitest run src/plugins/runtime.test.ts`
- `source activate.sh && pytest tests/start/test_codex_plan_loop_scripts.py`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP visual verification was not run; no UI behavior changed.
- The updated Playwright Watch Code spec was not rerun.
- `pnpm -C frontend gcf` emitted existing generated Python Ruff TC002/TC003 type-checking import diagnostics but completed successfully, and `./check_quality.sh` passed.

## 2026-04-25 21:50:31 PDT

Fixes applied:
- Gated Watch Code backend UI settings in the app-owned plugin mutation runtime using provider-resolution metadata, so pending-restart, conflicting, disabled, invalid, or non-selected Watch Code providers cannot fall through to generic backend/local-core setting handlers.
- Kept active Watch Code setting writes on the app-owned `Runtime.SetWatchCodeEnabled` / `Runtime.SetWatchCodeInputs` path.
- Removed superseded Watch Code `CompareAndSetWatchCode*` APIs, exported `Project.SetWatchCode*` wrappers, and the empty `CoreRegistryOptions` / `NewCoreRegistryWithOptions` wrapper.

Tests added or upgraded:
- Added app MCP route coverage for pending-restart Watch Code settings, provider-conflict Watch Code settings, and active-provider Watch Code setting writes through the live runtime.
- Updated MCP/HTTP UI-setting test providers to use canonical `Runtime.SetWatchCode*` APIs.
- Tightened existing app MCP UI-setting coverage to install the first-party Watch Code provider it asserts against, and removed projectstate CAS tests for deleted Watch Code APIs.

Verification run:
- `./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPToolCallRoute(HidesWatchCodeUISettingsForPendingRestartProvider|HidesWatchCodeUISettingsDuringProviderConflict|WritesActiveWatchCodeUISettingThroughLiveRuntime)'`
- `./scripts/go.sh test ./internal/app -run 'TestApp(IDEMCPServerSupportsUISettingSearchReadWriteOverAuthenticatedSSE|IDEMCPToolCallRouteHidesWatchCodeUISettingsWithoutProvider|IDEMCPToolCallRouteHidesWatchCodeUISettingsForPendingRestartProvider|IDEMCPToolCallRouteHidesWatchCodeUISettingsDuringProviderConflict|IDEMCPToolCallRouteWritesActiveWatchCodeUISettingThroughLiveRuntime|WatchCodePluginRouteMutatesLiveRuntimeAndPreservesDataAcrossSave|SetCallableRouteSyncsActiveWatchCodeProviderRegistry)'`
- `./scripts/go.sh test ./internal/uisettings -run 'Test(ScopedRegistryDoesNotExposeCoreWatchCodeSettings|BuildPluginBackendRuntimeEntryReturnsBackendNormalizedValue)'`
- `./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsUISettingSearchReadWrite|BroadcastsProjectStateAfterUISettingWrite)'`
- `./scripts/go.sh test ./internal/mcpx -run 'TestServer(SearchUISettingsReturnsRankedWatchCodePluginResults|SetUISettingValueRejectsUnsupportedWatchCodeFolderPropertiesWithoutMutation)'`
- `./scripts/go.sh test ./internal/projectstate -run 'TestRuntime(SetWatchCodeEnabledBaselinesExistingDefs|SetWatchCodeEnabledBaselinesBoundPythonCodeSections|SetWatchCodeInputsBaselinesOnlyNewInputsWhenEnabled|SetWatchCodeEnabledBaselineScansIgnoreConfiguredRootsAndExplicitIgnoredFiles|SetWatchCodeInputsRejectsOutsideWorkspace)|TestRuntimeCompareAndSet'`
- `./scripts/go.sh test ./internal/projectstate ./internal/uisettings ./internal/mcpx`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP visual verification was not run; no visual UI behavior changed.
- `pnpm -C frontend gcf` emitted existing generated Python Ruff TC002/TC003 type-checking import diagnostics but completed successfully.
- Full `./scripts/go.sh test ./internal/httpapi` failed in unrelated deployment-overlay project-route tests and terminal-route timeout tests; focused HTTP UI-setting tests passed.

## 2026-04-25 22:47:35 PDT

Fixes applied:
- Made app-owned Watch Code plugin routes and backend UI-setting writes reject unsupported folder fields before mutating live or persisted provider plugin data.
- Suppressed Watch Code provider frontend registration side effects unless provider selection reports that plugin as the active selected provider.
- Removed the duplicate Python/local-core Watch Code mutation backend, generated local-core Watch Code command constants, packaged runtime module entry, and stale extracted helper clones.
- Left the plugin-owned Watch Code route/UI-setting declarations in place; the generic Python backend runtime now fails closed with a Go-host-required error.

Tests added or upgraded:
- Added app route and MCP UI-setting regression tests proving strict folder decoding rejects unsupported properties without mutation.
- Added frontend runtime tests for pending-restart provider suppression, provider-conflict suppression, and active selected-provider registration.
- Updated Python plugin-runtime and packaged-distribution tests to assert fail-closed Watch Code runtime behavior and absence of the deleted local-core helper module.
- Removed local-core Watch Code command tests for the deleted command surface.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`
- `./scripts/go.sh test ./internal/app -run 'TestApp(WatchCodePluginRouteMutatesLiveRuntimeAndPreservesDataAcrossSave|WatchCodePluginRouteRejectsUnsupportedFolderPropertiesWithoutMutation|IDEMCPToolCallRouteWritesActiveWatchCodeUISettingThroughLiveRuntime|IDEMCPToolCallRouteRejectsUnsupportedWatchCodeFolderPropertiesWithoutMutation|IDEMCPToolCallRouteHidesWatchCodeUISettingsForUnavailableProvider)'`
- `./scripts/go.sh test ./internal/pythonsdklocalcore ./internal/pythonsharedconstants ./internal/projectstate ./internal/mcpx -run 'TestRun|TestGenerate|TestScopedRegistryDoesNotExposeCoreWatchCodeSettings|TestServerSetUISettingValueRejectsUnsupportedWatchCodeFolderPropertiesWithoutMutation'`
- `source activate.sh && pytest tests/plugin_runtime/test_local_core.py tests/plugin_runtime/test_watch_code_plugin_backend.py -q`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -k 'minimal_distribution_project_uses_packaged_runtime_modules or first_party_watch_code_plugin_backend_runs_without_developer_go_toolchain' -q`
- `pnpm -C frontend exec vitest run src/plugins/runtime.test.ts`

Residual risks / verification gaps:
- Browser/CDP visual verification was not run; no rendered layout or style flow changed, and affected provider-registration behavior is covered by runtime tests.
- Playwright was not run in this iteration.
- Full repo test suites beyond `./check_quality.sh` and the focused regression suite above were not run.
- `pnpm -C frontend gcf` emitted existing generated Python Ruff TC002/TC003 type-checking import diagnostics but completed successfully.
