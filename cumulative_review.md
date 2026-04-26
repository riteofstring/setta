# Cumulative Review

## Recurring Subsystem Invariant Matrix

### Watch Code Plugin Mutations
- Invariant: Watch Code plugin routes and backend UI settings may keep plugin-owned public surfaces, but provider-owned Watch Code settings must fail closed unless exactly one probed provider is active; accepted live mutations and reads must pass strict owner decoding, use the current `folders`/`files` route payload contract, be scoped to an existing project, and write through the app-owned Go runtime so persisted state, live snapshots, websocket updates, frontend op status, Watch Code service config, and ignored-root policy share one canonical writer. Field-specific setting writes must preserve sibling input fields through owner-level mutations rather than stale read-modify-write snapshots, and the plugin UI must disable input editing while an inputs save is pending and reset project-scoped staged input buffers when the active project changes.
- Last finding commit: abe15c05524d59b39ff43b886fff8581e06ac550
- Proof tests: `TestAppWatchCodePluginRouteMutatesLiveRuntimeAndPreservesDataAcrossSave`; `TestAppWatchCodePluginRouteRejectsUnsupportedFolderPropertiesWithoutMutation`; `TestAppWatchCodePluginRouteRejectsLegacyInputFieldNamesWithoutMutation`; `TestWatchCodeBackendRouteInterceptorFailsClosedForUnavailableProviderCandidates`; `TestAppIDEMCPToolCallRouteWritesActiveWatchCodeUISettingThroughLiveRuntime`; `TestAppIDEMCPToolCallRouteRejectsUnsupportedWatchCodeFolderPropertiesWithoutMutation`; `TestAppIDEMCPToolCallRouteHidesWatchCodeUISettingsForPendingRestartProvider`; `TestAppIDEMCPToolCallRouteHidesWatchCodeUISettingsDuringProviderConflict`; `TestRuntimeSetWatchCodeFoldersPreservesNewerFiles`; `TestRuntimeSetWatchCodeFilesPreservesNewerFolders`; `TestAppIDEMCPToolCallRouteMergesSplitWatchCodeInputSettings`; `TestWatchCodeBackendUISettingRejectsMissingProjectWithoutNoOpSuccess`; `plugins/setta-watch-code/frontend/tests/register.test.ts`; `frontend/tests/e2e/overview/layout/watch-code-pane.spec.ts`; `tests/plugin_runtime/test_watch_code_plugin_backend.py`
- Still unverified: Full Playwright suite was not run; no browser/CDP project-switch flow was run for staged Watch Code inputs.

### Project-Scoped Plugin Data Lifecycle
- Invariant: Generic project-scoped plugin payloads under `Document.PluginData[pluginID].projects[projectID]` must follow project lifecycle operations: clone and save-as copy the source project's payload to the new project ID, while delete removes deleted project IDs without dropping sibling project payloads, non-project fields, or opaque non-project plugin data. Project view projection must use the same Go-owned envelope parser and must ignore payload roots that are not project-scoped.
- Last finding commit: 9768435332fe357b6bb4e80248569984f930946c
- Proof tests: `TestDocumentCloneProjectCopiesProjectScopedPluginData`; `TestDocumentSaveAsNewProjectConfigCopiesProjectScopedPluginData`; `TestDocumentDeleteProjectsRemovesProjectScopedPluginData`; `TestSingleConfigByProjectIDIncludesGenericProjectPluginData`; `TestSingleConfigByProjectIDRejectsMalformedProjectPluginData`
- Still unverified: Only generic projectstate and projectview unit paths were exercised; no browser flow uses the lifecycle directly in this iteration.

### Generic Plugin UI Settings
- Invariant: Backend-registered plugin UI settings are capability-gated by `registerUISettings`, do not require synthetic `paneId` metadata, and may reveal through pane-less plugin handlers when no plugin pane can exist; schema-defined plugin settings remain pane-backed and require `registerPane`.
- Last finding commit: 9d855bf595dd6cf6b0af2d7cfe1dc097f9f1a20f
- Proof tests: `TestNormalizeBackendUISettingRegistrationAllowsPaneLessBackendSetting`; `TestNewScopedRegistryIncludesBackendRegisteredSettingWithRegisterUISettingsOnly`; `TestRevealServiceDispatchesBackendOnlyPluginSettingAsPaneLessTarget`; `TestNewScopedRegistryOmitsSchemaDefinedSettingWithoutRegisterPane`; `frontend/src/plugins/runtime.test.ts`; `tests/plugin_runtime/test_watch_code_plugin_backend.py`; `tests/start/test_packaged_distribution.py -k first_party_watch_code_plugin_backend_runs_without_developer_go_toolchain`
- Still unverified: No browser reveal flow for pane-less backend settings was rerun in this iteration.

### Watch Code Provider Registry
- Invariant: When an active Watch Code provider exists, project mutations that can change callable membership must update the provider's pluginData registry in the same document revision; providerless project paths must not recreate core Watch Code fields.
- Last finding commit: 0317ff3f3ff9a601f43097511f5a85e0b32337c0
- Proof tests: `TestAppSetCallableRouteSyncsActiveWatchCodeProviderRegistry`; `TestRuntimeDeleteSectionVariantPrunesWatchCodeProviderRegistryMembership`; `TestRuntimeDeleteSectionVariantKeepsWatchCodeProviderRegistryMembershipForRemainingVariant`
- Still unverified: No separate negative no-provider callable test was added in this iteration.

### Watch Code Provider Service Lifecycle
- Invariant: Watch Code service lifecycle has one mutable owner, `watchCodeServiceRef`; provider unavailability must stop the service without fallback raw pointers or stored-data processing. Active provider changes must replace the running service even when language-server specs are unchanged. Launcher mode must not host `registerWatchCodeBackend` providers. Plugin backend refresh transitions that fail after commit must roll back runtime, capability, LSP, and pending-restart metadata together so the service does not stay on a half-applied provider state.
- Last finding commit: 9d855bf595dd6cf6b0af2d7cfe1dc097f9f1a20f
- Proof tests: Existing app tests assert `app.watchCodeRef.Current()` across startup, enable, no-provider, launcher, and core-route absence paths; `TestAppWatchCodeProviderChangeReplacesRunningService`; `TestAppLauncherModeBlocksWatchCodeProviderHost`; `TestServiceRuntimeWatchCodeCapabilitiesBlockHostlessLauncherProvider`; `TestAppIDEMCPToolCallRouteHidesWatchCodeUISettingsForPendingRestartProvider`; `TestAppIDEMCPToolCallRouteHidesWatchCodeUISettingsDuringProviderConflict`; `TestPluginBackendRuntimeRefresherReconcilesProjectDocumentWhenWatchCodeProviderStateChanges`; `TestPluginBackendRuntimeRefresherSkipsProjectReconcileWhenSpecsAndProviderAreUnchanged`; `TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOnHandlerRefreshError`; `TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOnProjectReconcileError`
- Still unverified: No full generated diagnostics or callable callback E2E was run.

### Watch Code Provider Metadata Ownership
- Invariant: Watch Code provider language support and language-server requirement are backend probe-owned runtime facts; public plugin manifests must not mirror them and should only retain static or frontend-facing knobs such as `canvasControlsUi`.
- Last finding commit: 31c328225e75ea04f37a505962cec54a109915b1
- Proof tests: `TestServiceRuntimeWatchCodeCapabilitiesFollowBackendProbedProvider`; `TestServiceRuntimeWatchCodeCapabilitiesUseProbedLanguageServerRequirement`; `TestServiceRuntimeWatchCodeCapabilitiesTreatBackendProbeWithoutPythonAsInvalid`; `TestPluginManifestSchemaTracksRuntimeContract`
- Still unverified: No separate JSON Schema validator was run; schema shape is covered by the Go schema contract test.

### Generic Plugin Canvas Controls
- Invariant: Canvas-control placement definitions and ordering have one shared SDK/runtime owner for placement, order, label, plugin ID, and control ID so standalone plugins, registration-time validation, and runtime-store sorting cannot drift; feature-provider frontends that are pending restart, conflicting, disabled, invalid, or non-selected must not run registration side effects for controls or setting reveal handlers.
- Last finding commit: a1ab5007a9537bfee64932cabb4cf2adf085040e
- Proof tests: `frontend/src/plugins/runtime.test.ts`; `frontend/src/plugins/appSubsystemSdk.test.ts`; `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`
- Still unverified: Browser/CDP visual check not run; registration gating is covered by runtime unit tests.

### Plugin Frontend Host Contracts
- Invariant: Generic plugin frontend host, canvas-control, setting-reveal, and project-state selector contracts have one app-subsystem SDK-owned exported surface; the core runtime, browser E2E helpers, docs, and standalone plugins import that surface or a test-owned helper over it, while plugins keep only plugin-specific capability gating. Project-scoped plugin-data subscriptions must invalidate on active project identity changes while still delivering only the selected plugin payload to listeners. Deleted host shim paths must stay absent from app code, E2E tests, docs, and retired host utility tests.
- Last finding commit: abe15c05524d59b39ff43b886fff8581e06ac550
- Proof tests: `frontend/src/plugins/appSubsystemSdk.test.ts`; `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts` scans deleted host shim and retired host utility test paths; `frontend/src/plugins/runtime.test.ts`; `plugins/setta-watch-code/frontend/tests/register.test.ts`; app-subsystem SDK and Watch Code frontend typechecks.
- Still unverified: Targeted Playwright was not rerun for project-scoped plugin-data subscriptions; no CDP visual verification was run because no rendered layout or style changed.

### App-Subsystem SDK Helper Ownership
- Invariant: Shared frontend helper behavior and proof tests belong with the app-subsystem SDK owner after host utility shims are deleted; host `frontend/src/utils` must not retain ghost tests for deleted helper modules or reach into SDK internals.
- Last finding commit: abe15c05524d59b39ff43b886fff8581e06ac550
- Proof tests: `pnpm -C frontend exec vitest run --config plugin-sdk/app-subsystem/vitest.config.mjs`; `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`
- Still unverified: Packaged SDK build was not rerun in this iteration; SDK unit tests and typecheck were run.

### Extracted Watch Code Surface Contracts
- Invariant: After Watch Code extraction, docs and tests target plugin-owned routes, DOM IDs, `plugin::<provider>::*` settings, and the `folders`/`files` route payload contract; stale core route names, core selectors, compatibility aliases, superseded CAS-shaped Watch Code mutation shims, duplicate Python/local-core Watch Code mutation backends, dead branch-added helper APIs, legacy `watchCodeFolders`/`watchCodeFiles` payload names, and generated local-core command constants stay deleted. Watch Code backend route suffixes, backend UI-setting IDs, handler IDs, shared route errors, backend contract versions, and first-party plugin frontend route/setting constants have one Go-owned generated contract.
- Last finding commit: abe15c05524d59b39ff43b886fff8581e06ac550
- Proof tests: `TestWatchCodeBackendContractDrivesRouteAndUISettingMatching`; `TestWatchCodeBackendRouteInterceptorDeclinesUnownedRoutes`; `TestWatchCodeBackendRouteInterceptorFailsClosedForUnavailableProviderCandidates`; `TestAppWatchCodePluginRouteRejectsLegacyInputFieldNamesWithoutMutation`; `TestBuildIncludesGoOwnedWatchCodeBackendContract`; `TestBuildEmitsWatchCodeBackendContractForFrontend`; `tests/plugin_runtime/test_watch_code_plugin_backend.py`; `tests/start/test_packaged_distribution.py -k first_party_watch_code_plugin_backend_runs_without_developer_go_toolchain`; `frontend/tests/e2e/overview/layout/watch-code-pane.spec.ts`; `plugins/setta-watch-code/frontend/tests/register.test.ts`; `TestScopedRegistryDoesNotExposeCoreWatchCodeSettings`; `tests/plugin_runtime/test_local_core.py`; Go build coverage after deleting `CompareAndSetWatchCode*`, `Project.SetWatchCode*`, `WatchCodePluginSettingID`, `mustWatchCodePluginSettingID`, and Watch Code local-core commands.
- Still unverified: Full Playwright suite was not run; no browser/CDP project-switch flow was run in this iteration.

### Frontend Tooling Generated Constants
- Invariant: Frontend build-tool defaults that are also runtime contracts, including dev frontend host and port, must come from a Go-owned Node-safe generated artifact instead of local Vite literals or generated modules with browser/runtime side effects.
- Last finding commit: abe15c05524d59b39ff43b886fff8581e06ac550
- Proof tests: `TestBuildEmitsNodeSafeToolingConstants`; `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`
- Still unverified: No dev server or browser flow was started for the Vite default constants.

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

## 2026-04-26 00:04:50 PDT

Fixes applied:
- Emitted `registerUISettings`-only backend plugin UI settings as pane-less plugin-handler reveal targets when the plugin has no effective `registerPane`.
- Moved the generic plugin frontend host, canvas-control, setting-reveal, and project-state selector contract into the app-subsystem frontend SDK, then updated the core runtime and Watch Code frontend to use that source.
- Synced the JSON Render app-subsystem plugin's vendored SDK declaration file with the source SDK contract.
- Removed unused branch-added Watch Code plugin setting ID helpers.

Tests added or upgraded:
- Added UI-settings registry and reveal-service regression tests for backend-only plugin settings with preserved plugin reveal keys and no pane/tab target.
- Extended app-subsystem SDK and plugin build-boundary coverage for the generic plugin frontend host contract.
- Updated Watch Code frontend tests and standalone typecheck coverage to consume the SDK-owned host type.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`
- `./scripts/go.sh test ./internal/uisettings ./internal/projectstate`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystemSdk.test.ts src/plugins/runtime.test.ts src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`
- `pnpm --dir frontend/plugin-sdk/app-subsystem run typecheck`
- `pnpm --dir plugins/setta-watch-code/frontend run typecheck`
- `pnpm --dir plugins/setta-watch-code/frontend run test`
- `pnpm --dir plugins/setta-watch-code/frontend run build`

Residual risks / verification gaps:
- Browser/CDP visual verification was not run because no rendered layout or style behavior changed; affected reveal payload and plugin registration behavior are covered by Go/frontend tests.
- Playwright was not run in this iteration.
- Full repo test suites beyond `./check_quality.sh` and the focused regression suite above were not run.
- `pnpm -C frontend gcf` emitted existing generated Python Ruff TC002/TC003 type-checking import diagnostics but completed successfully.

## 2026-04-26 01:04:18 PDT

Fixes applied:
- Copied and deleted generic project-scoped plugin data during project clone, save-as, and delete lifecycle operations.
- Added owner-level Watch Code folder/file mutations and routed backend UI-setting writes through them so split input settings preserve newer sibling values.
- Rematerialized project LSP documents and callbacks when the active Watch Code provider changes, including rollback to the previous provider on refresh failure.
- Removed manifest-owned Watch Code `python` and `requiresLanguageServer` metadata so runtime capability facts come from backend probes, then regenerated the affected non-HTTP frontend contract outputs.

Tests added or upgraded:
- Added projectstate lifecycle coverage for clone, save-as, and delete behavior across project-scoped plugin data.
- Added Watch Code field-level mutation tests and app MCP integration coverage for split input setting writes.
- Added plugin runtime refresher tests for Watch Code provider-change rematerialization.
- Updated plugin runtime and manifest-schema tests for probe-owned Watch Code provider metadata.

Verification run:
- `./scripts/go.sh test ./internal/projectstate -run 'TestDocument(CloneProjectCopiesProjectScopedPluginData|SaveAsNewProjectConfigCopiesProjectScopedPluginData|DeleteProjectsRemovesProjectScopedPluginData)|TestRuntimeSetWatchCode(FoldersPreservesNewerFiles|FilesPreservesNewerFolders)'`
- `./scripts/go.sh test ./internal/plugins -run 'Test(ServiceRuntimeWatchCodeCapabilities(FollowBackendProbedProvider|UseProbedLanguageServerRequirement|RejectBackendProbeWithoutRegistration|TreatBackendProbeWithoutPythonAsInvalid|FollowFirstPartyPluginManifest)|PluginManifestSchemaTracksRuntimeContract)'`
- `./scripts/go.sh test ./internal/app -run 'TestPluginBackendRuntimeRefresher(ReconcilesProjectDocumentWhenWatchCodeProviderStateChanges|SkipsProjectReconcileWhenSpecsAndProviderAreUnchanged)|TestAppIDEMCPToolCallRoute(MergesSplitWatchCodeInputSettings|WritesActiveWatchCodeUISettingThroughLiveRuntime|RejectsUnsupportedWatchCodeFolderPropertiesWithoutMutation)'`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP visual verification and Playwright were not run because no rendered UI behavior changed.
- No full generated diagnostics or callable callback E2E was run; provider-change behavior is covered by rematerialization restart tests.
- `pnpm -C frontend gcf` emitted existing generated Python Ruff TC002/TC003 type-checking import diagnostics but completed successfully.

## 2026-04-26 02:11:01 PDT

Fixes applied:
- Centralized generic project-scoped plugin-data envelope parsing in `projectstate`, made lifecycle copy/delete skip opaque scalar and array plugin data, and routed `projectview` projection through the same owner.
- Added a Go-owned Watch Code backend contract for route suffixes, UI-setting IDs, handler IDs, and shared route errors, then generated Python constants from that contract for the first-party plugin backend probe.
- Kept Watch Code extraction behavior intact: no old core routes, settings, host APIs, or compatibility aliases were restored.

Tests added or upgraded:
- Extended project lifecycle tests for clone, save-as, and delete to preserve scalar/array opaque plugin payloads while copying/removing only real project-scoped payloads.
- Extended `SingleConfigByProjectID` coverage to skip scalar/array plugin data and keep malformed `projects` envelopes failing through the shared parser.
- Added Watch Code contract coverage for Go host route/UI-setting matching, Python shared-constants generation, source plugin backend probe output, and packaged plugin backend execution.

Verification run:
- `./scripts/go.sh test ./internal/projectstate -run 'TestDocument(CloneProjectCopiesProjectScopedPluginData|SaveAsNewProjectConfigCopiesProjectScopedPluginData|DeleteProjectsRemovesProjectScopedPluginData)'`
- `./scripts/go.sh test ./internal/projectview -run 'TestSingleConfigByProjectID(IncludesGenericProjectPluginData|RejectsMalformedProjectPluginData)'`
- `./scripts/go.sh test ./internal/app -run TestWatchCodeBackendContractDrivesRouteAndUISettingMatching`
- `./scripts/go.sh test ./internal/pythonsharedconstants -run TestBuildIncludesGoOwnedWatchCodeBackendContract`
- `source activate.sh && pytest tests/plugin_runtime/test_watch_code_plugin_backend.py -q`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -k first_party_watch_code_plugin_backend_runs_without_developer_go_toolchain -q`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP visual verification and Playwright were not run because no rendered UI behavior changed.
- `pnpm -C frontend gcf` emitted existing generated Python Ruff TC002/TC003 type-checking import diagnostics but completed successfully.
- An extra broad `./scripts/go.sh test ./internal/projectstate ./internal/projectview ./internal/app ./internal/pythonsharedconstants ./internal/watchcodecontracts` run passed the non-app packages but failed in `internal/app` with existing environment/config-dependent failures, including missing vendored app-subsystem SDK build output, missing packaged Go binary, and unknown transcription LLM config.

## 2026-04-26 03:15:50 PDT

Fixes applied:
- Validated Watch Code backend UI-setting reads against existing project IDs before returning provider plugin data.
- Restored plugin backend refresh rollback for post-commit project reconcile, handler refresh, and Watch Code service failures.
- Tightened Watch Code backend route parsing and interceptor ownership so nested or non-selected plugin routes fall through.
- Replaced E2E browser imports of deleted host shims with a test-owned app-subsystem SDK helper, and updated stale docs/guardrails for deleted shim paths.

Tests added or upgraded:
- Added `TestWatchCodeBackendUISettingRejectsMissingProjectWithoutNoOpSuccess`.
- Added `TestWatchCodeBackendRouteInterceptorDeclinesUnownedRoutes`.
- Added `TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOnProjectReconcileError`.
- Extended `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts` to scan `frontend/tests/e2e` and `docs` for deleted host shim references.

Verification run:
- `./scripts/go.sh test ./internal/app -run 'TestWatchCodeBackendUISettingRejectsMissingProjectWithoutNoOpSuccess|TestWatchCodeBackendContractDrivesRouteAndUISettingMatching|TestWatchCodeBackendRouteInterceptorDeclinesUnownedRoutes|TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOn(ProjectReconcileError|HandlerRefreshError)'`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`
- `rg -n "src/openapi/http/result|src/utils/c_addresses|src/utils/endpointUtils" frontend/tests/e2e docs`

Residual risks / verification gaps:
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor/section-variant-single-handle.spec.ts` passed the first test, then failed at `frontend/tests/e2e/editor/section-variant-single-handle.spec.ts:295` waiting for the `Variants` heading; broader Playwright remains blocked.
- CDP visual verification was not run because no UI behavior changed.
- `pnpm -C frontend gcf` emitted existing generated Python Ruff TC002/TC003 type-checking import diagnostics but completed successfully.

## 2026-04-26 04:48:51 PDT

Fixes applied:
- Made Watch Code plugin backend routes fail closed for unavailable selected/candidate providers, blocked `registerWatchCodeBackend` in launcher mode, and replaced the running Watch Code service when the active provider ID changes.
- Changed Watch Code input mutation payloads to `folders` / `files`, rejected legacy payload names without mutation, and reused Go-owned Watch Code backend contract constants instead of duplicate probe/runtime constants.
- Made backend-registered UI-setting `paneId` optional, removed fake `paneId` values from the first-party Watch Code backend probe, and regenerated the non-HTTP frontend contract.
- Disabled Watch Code file/folder controls while an inputs save is pending, and updated the Watch Code E2E spec to link the first-party plugin explicitly and match the real `/plugins/...` backend route.

Tests added or upgraded:
- Added app/provider coverage for unavailable-provider route interception, legacy input-field rejection, provider service replacement, and launcher-mode Watch Code provider blocking.
- Added plugin runtime probe coverage for Go-owned Watch Code contract versions and pane-less backend UI settings.
- Added Watch Code frontend unit coverage and Playwright coverage for pending-save input disabling.
- Updated Python/package tests to assert first-party Watch Code backend UI settings omit `paneId`.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'Test(NormalizeBackendProbeResponseValidatesWatchCodeBackendRegistration|NormalizeBackendUISettingRegistrationAllowsPaneLessBackendSetting|ServiceRuntimeWatchCodeCapabilitiesBlockHostlessLauncherProvider)'`
- `./scripts/go.sh test ./internal/uisettings -run 'Test(NewScopedRegistryIncludesBackendRegisteredSettingWithRegisterUISettingsOnly|RevealServiceDispatchesBackendOnlyPluginSettingAsPaneLessTarget|NewScopedRegistryOmitsSchemaDefinedSettingWithoutRegisterPane)'`
- `./scripts/go.sh test ./internal/app -run 'Test(WatchCodeBackendRouteInterceptorFailsClosedForUnavailableProviderCandidates|WatchCodeBackendRouteInterceptorDeclinesUnownedRoutes|AppWatchCodeProviderChangeReplacesRunningService|AppWatchCodePluginRouteMutatesLiveRuntimeAndPreservesDataAcrossSave|AppWatchCodePluginRouteRejectsUnsupportedFolderPropertiesWithoutMutation|AppWatchCodePluginRouteRejectsLegacyInputFieldNamesWithoutMutation|AppLauncherModeBlocksWatchCodeProviderHost)'`
- `source activate.sh && pytest tests/plugin_runtime/test_watch_code_plugin_backend.py -q`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -k first_party_watch_code_plugin_backend_runs_without_developer_go_toolchain -q`
- `pnpm -C frontend exec vitest run src/plugins/runtime.test.ts`
- `pnpm --dir plugins/setta-watch-code/frontend run typecheck && pnpm --dir plugins/setta-watch-code/frontend run test`
- `SETTA_E2E_BUILD_PLUGIN_FIXTURES=1 SETTA_E2E_SEED_PLUGIN_FIXTURES=1 SETTA_E2E_SEED_PLUGIN_ARTIFACTS=1 ./scripts/run-playwright-e2e.sh tests/e2e/overview/layout/watch-code-pane.spec.ts -g "watch code input controls disable while an input save is pending"`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`

Residual risks / verification gaps:
- Full Playwright suite was not run; targeted browser verification passed for the affected Watch Code pending-save flow.
- CDP visual verification was not run; no `./aireset.sh` session was started or left running.
- `pnpm -C frontend gcf` emitted existing generated Python Ruff TC002/TC003 type-checking import diagnostics but completed successfully.

## 2026-04-26 05:49:58 PDT

Fixes applied:
- Made project-scoped `pluginData` subscriptions invalidate on active project ID changes while preserving the selected payload delivered to plugin listeners.
- Reset Watch Code staged folder/file buffers from current project data when project context changes, so unsaved inputs from one project are not posted under another project ID.
- Generated Go-owned frontend constants for Watch Code backend route/UI-setting contracts and Node-safe Vite dev defaults.
- Moved deleted host utility helper tests into the app-subsystem SDK owner and added guardrail coverage for retired host test paths.

Tests added or upgraded:
- Added frontend runtime coverage for `pluginData` subscription notifications across equal-payload project switches.
- Added Watch Code frontend coverage for buffer reset on project-context changes without a separate plugin-data notification.
- Added frontendbindings tests for Node-safe tooling constants and the generated Watch Code frontend backend contract.
- Added app-subsystem SDK vitest ownership coverage and guardrails for deleted host utility tests.

Verification run:
- `./scripts/go.sh test ./internal/frontendbindings`
- `pnpm -C frontend exec vitest run src/plugins/runtime.test.ts src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`
- `pnpm -C frontend exec vitest run --config plugin-sdk/app-subsystem/vitest.config.mjs`
- `pnpm --dir plugins/setta-watch-code/frontend run test`
- `pnpm --dir plugins/setta-watch-code/frontend run typecheck`
- `pnpm --dir frontend/plugin-sdk/app-subsystem run typecheck`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP visual verification was not run because no rendered layout or style changed; no `./aireset.sh` session was started or left running.
- Playwright was not run for the project-switch Watch Code panel behavior; coverage is unit/typecheck level.
- Full repo test suites beyond `./check_quality.sh` and the focused regression suite above were not run.
- `pnpm -C frontend gcf` emitted existing generated Python Ruff TC002/TC003 type-checking import diagnostics but completed successfully.
