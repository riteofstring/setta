# Cumulative Review
## Recurring Subsystem Invariant Matrix

### Plugin Backend Refresh Atomicity
- Invariant: No-restart plugin rescans and mutations must keep runtime/status/route/listener/app-capability reads pinned to the last committed snapshot until backend runtime refresh and app-handler refresh both succeed; on failure restore plugin storage and refresh state together.
- Last finding commit: 17e82652b585f3d8b80779a7d24428f3319632f5
- Proof tests: `TestPluginMutationRuntimeServiceRescanRollsBackOnHandlerRefreshError`, `TestPluginMutationRuntimeServiceRescanKeepsCommittedSnapshotOnHandlerRefreshError`, `TestPluginMutationRuntimeServiceApplyLockfileRestoresOnHandlerRefreshError`, `TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOnHandlerRefreshError`
- Still unverified: Full `internal/app` suite not rerun in this pass; no browser verification needed for this backend-only change.

### App Definition Provider-State Synchronization
- Invariant: App-definition persistence stays provider-namespaced under `Document.PluginData[pluginID]`; provider writes may update that owned slice and app-spec file state, but must not replace newer live document fields, let stale deferred persists clobber newer in-memory state, split host projectstate and app-spec file commits, or let compare-and-set no-ops bypass the projectstate queue/frontend-op completion path.
- Last finding commit: 5f2c74196ecb4feb9b41ac44fc352a03aeb7ed7b
- Proof tests: `TestBackendRuntimeSetAppDefinitionSyncsPersistedState`, `TestBackendRuntimeSetAppDefinitionPreservesNewerLiveProjectState`, `TestBackendRuntimeSetAppDefinitionRebasesBlockedDeferredPersist`, `TestBackendRuntimeSetAppDefinitionRollsBackAppSpecWhenHostPersistFails`, `TestBackendRuntimeCompareAndSetChangedRebasesBlockedDeferredPersist`, `TestBackendRuntimeCompareAndSetChangedRollsBackAppSpecWhenHostPersistFails`, `TestCompareAndSetAppDefinitionNoopWaitsBehindQueuedMutation`, `TestCompareAndSetAppDefinitionNoopCompletesFrontendOpID`, `TestBackendRuntimeCompareAndSetNoopCompletesFrontendOpID`, `TestRunAppDefinitionCompareAndSetReturnsPlannedDefinitionWithoutPersisting`
- Still unverified: No broader projectstate mutation matrix beyond the focused app-definition and local-core planning tests.

### App Subsystem Provider Backend Contract
- Invariant: A selected app-subsystem provider must expose the complete Go-owned backend listener endpoint contract and matching contract version; generated Python runtime constants and local-core command maps must derive from that owner, and app-subsystem backend calls must dispatch only to the selected provider's registered contract endpoints.
- Last finding commit: 5f2c74196ecb4feb9b41ac44fc352a03aeb7ed7b
- Proof tests: `TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithoutRequiredBackendEndpointsAsInvalid`, `TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithPartialBackendEndpointSetAsInvalid`, `TestFindRegisteredListenerEndpointMatchScopesToRequestedPlugin`, `TestFindRegisteredListenerEndpointMatchUsesAppSubsystemPrivateEndpointsForPluginScopedRequest`, `TestBackendRuntimeScopesInvocationsToProviderPluginID`, `TestBuildIncludesGoOwnedAppSubsystemBackendContract`, `TestNormalizeBackendProbeResponseValidatesAppSubsystemBackendContractVersion`, `test_plugin_backend_guardrails.py`
- Still unverified: No separate HTTP/MCP provider-unavailable integration run; verification focused on generated contracts, runtime/provider selection, packaged backend probes, and app-definition dispatch owners.

### Frontend App Subsystem Host/SDK Boundary
- Invariant: SDK contract/barrel imports must keep shared OpenAPI setup explicit and side-effect-free; plugin source, plugin tests, plugin build config, vendored SDK metadata, packaged SDK type declarations, and the source SDK package root must enforce the standalone plugin boundary without repo-local host aliases or host test utilities, and the vendored `types/index.d.ts` surface must stay aligned with the source SDK owner.
- Last finding commit: 28726165e366281e841fc9c42432111ab296e95b
- Proof tests: `src/plugins/appSubsystemSdkOpenAPI.test.ts`, `src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`, `src/plugins/importBoundaryGuardrails.test.ts`, `test_first_party_app_subsystem_plugin_frontend_builds_from_staged_source_tree`, `test_app_subsystem_frontend_sdk_source_package_builds_from_its_own_root`
- Still unverified: No separate third-party standalone-plugin matrix or browser verification was run in this pass; verification stayed at boundary/package-root checks plus focused SDK/unit coverage.

### Frontend SDK Helper Ownership
- Invariant: Package-safe frontend helpers shared by the host and the app-subsystem SDK must have one SDK owner; host entrypoints may re-export that owner or add host-only wrappers, but must not carry parallel copies of the same run-capability or deployment-policy logic.
- Last finding commit: 28726165e366281e841fc9c42432111ab296e95b
- Proof tests: `src/plugins/appSubsystemSdk.test.ts` ("keeps host helper entrypoints wired to SDK-owned implementations"), `src/utils/runCapabilities.test.ts`, `src/utils/deploymentPolicies.test.ts`
- Still unverified: Host-only cached project-state selector behavior remains separate and was not consolidated into the SDK owner in this pass; no browser verification was needed for these non-visual helper changes.

### App Deployment Frontend Project-State Queueing
- Invariant: App-deployment websocket project-state updates, buffered app-definition/app-spec mutations, and app-session initialization waiters must route through the app-subsystem queue keyed by stable provider/capability identity, remain queued across same-provider frontend refresh-signature churn, and never let a stale load completion overwrite a newer selected-provider load.
- Last finding commit: 28726165e366281e841fc9c42432111ab296e95b
- Proof tests: `src/state/actions/websocketReceive.test.ts` ("routes app deployment project-state updates through the app-subsystem queue before server mode resolves"), `src/plugins/appSubsystem.test.tsx` ("queues project-state updates until app-subsystem registration finishes loading"), `src/plugins/runtime.test.ts` ("buffers app-subsystem updates during same-provider frontend reloads", "preserves buffered app-subsystem updates queued before a same-provider reload starts", "keeps app-session initialization waiting across same-provider reloads")
- Still unverified: No Playwright or CDP app-deployment flow was run in this pass; verification stayed at unit/integration level because no visual UI surface changed.

### Standalone Plugin Packaging Pipeline
- Invariant: The first-party app-subsystem plugin frontend and the source app-subsystem SDK package must install, typecheck, test, and build from their own package roots using package-owned source, configs, and declared Setta runtime/SDK dependencies; runtime-managed frontend builds and packaged deployment/wheel paths must not depend on tracked `frontend/dist/*`, repo checkout `backend/setta`, repo-local host frontend aliases, or a host-side first-party wrapper script or hardcoded plugin path.
- Last finding commit: 28726165e366281e841fc9c42432111ab296e95b
- Proof tests: `TestServiceValidateFolderRejectsRuntimeManagedFrontendBuildWithoutPackageJSON`, `TestEnsureRuntimeManagedPluginFrontendAssetsRejectsMissingPackageJSON`, `TestPackagePluginSourceForDeploymentBuildsRuntimeManagedFrontendAssets`, `TestServiceRuntimeActivatesFirstPartyAppSubsystemPackageManagerPlugin`, `test_first_party_app_subsystem_plugin_frontend_builds_from_staged_source_tree`, `test_app_subsystem_frontend_sdk_source_package_builds_from_its_own_root`, `test_first_party_app_subsystem_plugin_backend_runs_without_developer_go_toolchain`
- Still unverified: No full clean-checkout packaged-deployment smoke or third-party standalone-plugin matrix was rerun in this pass; verification covered package-root install/typecheck/test/build and focused owner packaging tests.

### App Subsystem Capability-To-Surface Gating
- Invariant: App-subsystem frontend, deployment-runtime, MCP-tool, and scoped UI-setting surfaces may be published only when a single selected provider both registers the backend contract and declares the corresponding feature bits; frontend-facing feature bits additionally require a loadable frontend entrypoint, and host-contributed catalog/app-definition surfaces must not leak behind `PluginEnabled` alone.
- Last finding commit: 54fb75e9e35f63a70c06701ca3e54788f887c0ac
- Proof tests: `TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithoutFrontendEntrypointAsInvalid`, `TestServiceRuntimeAppSubsystemCapabilitiesIgnoreShadowedInvalidProviders`, `TestBuildScopedUISettingEntriesUsesBackendRuntime`, `TestBuildScopedUISettingEntriesRequiresAppAuthoringUI`, `TestBuildMCPToolRegistrationsFollowAppSubsystemFeatureBits`, `src/plugins/appSubsystem.test.tsx`
- Still unverified: No HTTP/MCP provider-unavailable integration or browser `/app` flow was rerun in this pass; verification focused on runtime capability selection and frontend gating/unit coverage.

### Local Core Packaged Runtime Boundary
- Invariant: The published plugin-runtime local-core helper and lightweight runtime clients must share one packaged boundary, include all lightweight runtime modules in the Setta wheel/test fixture, derive SDK contract constants from the authoritative owner, expose generated app-subsystem backend contract constants, and avoid repo-owned `setta.api.*` shim boundaries or heavyweight generated SDK imports in packaged plugin backends.
- Last finding commit: 54fb75e9e35f63a70c06701ca3e54788f887c0ac
- Proof tests: `test_lightweight_sdk_contract_version_matches_generated_owner`, `test_run_local_core_command_dispatches_through_packaged_boundary`, `test_run_local_core_command_surfaces_structured_errors`, `test_run_local_core_command_rejects_sdk_version_mismatch`, `test_run_local_core_command_rejects_sdk_contract_mismatch`, `test_first_party_app_subsystem_plugin_backend_runs_without_developer_go_toolchain`
- Still unverified: No broader packaged-plugin runtime matrix beyond the focused runtime-compat, local-core, and packaged-distribution owners; no separate deployment-mode local-core smoke was run.

### App Generation Metadata Ownership
- Invariant: App-generation modes, slash commands, image requirements, prompts, and frontend app-chat UI metadata must come from one Go-owned registry; downstream frontend values derive from that registry rather than restating command/mode inventories.
- Last finding commit: 5f2c74196ecb4feb9b41ac44fc352a03aeb7ed7b
- Proof tests: `TestFrontendValueAppSubsystemChatUIConfigUsesAuthoritativeAppGenerationMetadata`, `TestBuildChatModeContributionsExposeReferenceImageMode`, `TestBuildChatModeContributionsRequireCurrentOrRetainedImageForImageMode`
- Still unverified: No browser/chat E2E run for slash-command UI; verification focused on Go owner metadata and generated frontend value invariants.

### Package-Manager Plugin Manifest Discovery
- Invariant: Package-manager plugin discovery must use authoritative distribution metadata only; manifest-bearing distributions are discovered from `dist.files` and `.dist-info/RECORD`, including first-party wheel data-file installs, with no package-name or `top_level.txt` root guessing. When such plugins are packaged for deployment, the Python backend dependency payload must be copied with the provider plugin snapshot.
- Last finding commit: a74b7eb1ec00a0062feb2a6c627b460302426c29
- Proof tests: `TestRuntimePluginDistributionsReturnsManifestBearingDistributions`, `TestRuntimePluginDistributionsSkipsDistributionsWithoutManifestMetadata`, `TestServiceRuntimeActivatesFirstPartyAppSubsystemPackageManagerPlugin`, `TestServiceRuntimeActivatesUnknownIDAppSubsystemPackageManagerPlugin`, `TestServicePackageActivePluginForDeploymentVendorsPackageManagerPythonPayload`, `test_first_party_app_subsystem_plugin_wheel_installs_under_plugin_specific_root`
- Still unverified: No additional third-party wheel layout matrix beyond the focused first-party and unknown-ID package-manager cases; no full packaged deployment smoke test with a real third-party wheel.

### App Deployment Provider Runtime Isolation
- Invariant: Published app deployments must package the active provider plugin and provider state, and deployment-mode app/plugin discovery must resolve only deployment-scoped packaged providers instead of host-global or package-manager plugin state.
- Last finding commit: 54fb75e9e35f63a70c06701ca3e54788f887c0ac
- Proof tests: `TestServicePackageActivePluginForDeploymentPackagesInstalledFirstPartyAppSubsystemPlugin`, `TestNewAppPublishServiceUsesBackendValidationRuntime`, `TestDiscoveryServiceDeploymentScopedIgnoresHostGlobalAndPackageManagerPlugins`, `TestLoadAppSubsystemCapabilitiesIgnoresGlobalScopeInDeploymentMode`, `TestAppModePluginRuntimeIgnoresHostGlobalAppSubsystemProviders`
- Still unverified: No end-to-end publish-and-launch smoke for an installed package-manager provider; browser/CDP and Playwright were not run because no visible UI surface changed in this pass.

### Codex Plan Loop Automation
- Invariant: Plan-loop automation keeps option parsing, managed-worktree handling, retry behavior, prompt rendering, and authority checks in one runner, with plan path, sentinel, name, and commit prefix treated as wrapper data.
- Last finding commit: 5f2c74196ecb4feb9b41ac44fc352a03aeb7ed7b
- Proof tests: `test_plan_loop_runner_renders_plan_sentinel_and_name`, `test_plan_loop_wrappers_delegate_to_shared_runner`; `bash -n` passed for the shared runner and all wrappers.
- Still unverified: No live Codex loop execution was run.

## 2026-04-22 19:42:17 PDT
Fixes applied:
- Added committed-snapshot read isolation plus mutation checkpoints for plugin backend refresh and no-restart plugin mutations.
- Switched app-definition persisted sync to a projectstate-owned merge path for provider-owned plugin data.
- Moved local-core transport/handshake logic into a lightweight shared runtime module and kept API/plugin-runtime wrappers thin.
- Tightened package-manager plugin discovery to authoritative `dist.files`/`RECORD` parsing and handled first-party wheel `data-files` RECORD paths without reintroducing root-guess heuristics.
- Consolidated repeated app-definition test scaffolding into `internal/testutil/appsubsystemtest`.

Tests added or upgraded:
- Added plugin refresh rollback/committed-snapshot tests in `internal/app/plugin_backend_runtime_refresh_test.go`.
- Added app-definition stale-live-state and deferred-persist regression tests in `internal/appsubsystem/appdefinition/backend_runtime_test.go`.
- Extended plugin-runtime local-core tests for shared envelope handling and version/contract mismatch failures.
- Updated packaged-distribution coverage for first-party wheel packaging and minimal packaged-backend runtime execution.
- Replaced package-manager fallback coverage with explicit manifest-metadata discovery coverage.

Verification run:
- `pnpm -C frontend gcf`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend install --lockfile=false`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend build`
- `./scripts/go.sh test ./internal/app -run 'TestPluginMutationRuntimeServiceRescanRollsBackOnHandlerRefreshError|TestPluginMutationRuntimeServiceRescanKeepsCommittedSnapshotOnHandlerRefreshError|TestPluginMutationRuntimeServiceApplyLockfileRestoresOnHandlerRefreshError|TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOnHandlerRefreshError' -v`
- `./scripts/go.sh test ./internal/appsubsystem/appdefinition -run 'TestBackendRuntimeSetAppDefinition' -v`
- `./scripts/go.sh test ./internal/pythonenv ./internal/plugins -run 'TestRuntimePluginDistributions|TestServiceRuntimeActivatesFirstPartyAppSubsystemPackageManagerPlugin|TestServiceRuntimeActivatesUnknownIDAppSubsystemPackageManagerPlugin' -v`
- `source activate.sh && pytest tests/plugin_runtime/test_local_core.py tests/start/test_packaged_distribution.py -q`
- `./check_quality.sh`

Residual risks / verification gaps:
- Browser/CDP verification not run; no UI behavior was changed and no `./aireset.sh` session was active in this stage.
- Full repo test suite and full `internal/app` package suite were not rerun; verification stayed focused on touched owners and packaging paths.

## 2026-04-23 02:24:13 PDT
Fixes applied:
- Routed app deployment provider packaging through the plugin runtime owner so packaged app deployments include the active provider snapshot, provider state, and package-manager Python backend dependency payload.
- Made deployment-mode plugin/app-subsystem discovery deployment-scoped, excluding host-global plugin scope and package-manager global state from packaged app startup.
- Kept direct app-publish test fallback behavior for isolated callers while using owner-level packaging in the real app handler path.

Tests added or upgraded:
- Added package-manager Python payload packaging coverage for active provider deployment snapshots.
- Added deployment-scoped plugin discovery coverage that proves host-global and package-manager plugins are ignored in deployment mode.
- Added app-subsystem capability and app-mode runtime isolation coverage for packaged providers with conflicting host-global providers present.
- Upgraded app-publish provider validation coverage to assert the owner packager path is invoked.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestServicePackageActivePluginForDeploymentVendorsPackageManagerPythonPayload|TestDiscoveryServiceDeploymentScopedIgnoresHostGlobalAndPackageManagerPlugins' -v`
- `./scripts/go.sh test ./internal/appsubsystem -run 'TestNewAppPublishServiceUsesBackendValidationRuntime|TestLoadAppSubsystemCapabilitiesIgnoresGlobalScopeInDeploymentMode' -v`
- `./scripts/go.sh test ./internal/app -run 'TestAppModePluginRuntimeIgnoresHostGlobalAppSubsystemProviders' -v`
- `./scripts/go.sh test ./internal/appsubsystem`
- `./scripts/go.sh test ./internal/app -run 'TestAppOpensDeploymentRuntimeForAppMode|TestAppModePluginRuntimeIgnoresHostGlobalAppSubsystemProviders|TestAppRejectsAppModeWithoutAppSubsystemProvider|TestNewDeploymentTypeRegistry'`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP and Playwright verification not run; no UI behavior changed and no `./aireset.sh` session was active at finalization.
- Full repo test suite was not run; verification focused on touched backend owners and deployment packaging paths.

## 2026-04-23 03:40:23 PDT
Fixes applied:
- Required selected app-subsystem providers to expose the complete backend listener endpoint contract, retained app-subsystem-private endpoints from backend probes, and scoped app-definition backend dispatch to the selected plugin ID.
- Serialized app-definition no-op compare-and-set operations through the projectstate runtime queue and completed frontend operation IDs without adding no-op persisted writes.
- Made the app-subsystem SDK OpenAPI setup explicit, moved request rebuild logic to one shared helper, made the default runtime host own project-store reset, and deleted unused frontend re-export shims.
- Replaced duplicated plan-specific Codex loop scripts with one parameterized runner and thin data-only wrappers.

Tests added or upgraded:
- Added provider contract and plugin-scoped listener dispatch coverage in `internal/plugins`.
- Added app-definition no-op CAS queueing and frontend-op completion coverage in `internal/appsubsystem/appdefinition`.
- Added SDK OpenAPI side-effect and default runtime-host reset coverage in `frontend/src/plugins`.
- Added shared plan-loop runner and wrapper smoke tests in `tests/start`.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceRuntimeAppSubsystemCapabilities|TestFindRegisteredListenerEndpointMatch|TestServiceInvokeRegisteredListenerEndpoint' -v`
- `./scripts/go.sh test ./internal/appsubsystem/appdefinition -run 'TestCompareAndSetAppDefinition|TestBackendRuntime' -v`
- `./scripts/go.sh test ./internal/appsubsystem -run 'TestRequireAppModeRuntimeCapabilities|TestLoadAppSubsystemCapabilities' -v`
- `./scripts/go.sh test ./internal/app -run 'TestAppOpensDeploymentRuntimeForAppMode|TestAppModePluginRuntimeIgnoresHostGlobalAppSubsystemProviders|TestNewDeploymentTypeRegistry' -v`
- `pnpm -C frontend exec vitest run src/openapi/http/client.test.ts src/plugins/appSubsystemSdkOpenAPI.test.ts src/plugins/appSubsystemFrontendHost.test.ts src/plugins/appSubsystemSdk.test.ts`
- `pnpm -C frontend exec vite build --config plugin-sdk/app-subsystem/vite.config.mjs`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend build`
- `source activate.sh && pytest tests/start/test_codex_plan_loop_scripts.py -q`
- `bash -n scripts/run-codex-plan-loop.sh scripts/run-codex-app-subsystem-backend-externalization-loop.sh scripts/run-codex-app-subsystem-real-plugin-loop.sh scripts/run-codex-first-party-plugin-standalone-loop.sh scripts/run-codex-third-party-plugin-generalization-loop.sh`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP and Playwright verification not run; no visual UI rendering changed and no `./aireset.sh` session was active.
- Full repo test suite and separate HTTP/MCP provider-unavailable integration were not run; verification focused on touched subsystem owners and build/quality gates.

## 2026-04-23 05:19:17 PDT
Fixes applied:
- Made plugin app-definition backend mutations return planned app-definition/app-spec results through local core, then persisted projectstate and app-spec file changes through the host owner with rollback and deferred-persist rebase protection.
- Moved the app-subsystem backend contract version, listener endpoint list, and listener-to-local-core command map into Go-owned generated Python constants, and kept the published plugin runtime wrapper thin.
- Consolidated app-generation mode, slash-command, image requirement, prompt, and frontend chat UI metadata into one Go registry.
- Moved plugin-owned frontend tests and package dependencies under the first-party plugin frontend package, removed host `@json-render` dependencies/aliases, and shared project-state selector helpers between host and SDK.
- Replaced the remaining duplicated Codex plan-loop scripts with data-only wrappers around the shared runner.

Tests added or upgraded:
- Added app-definition host persist rollback, changed-CAS rebase, and local-core planning coverage.
- Added generated backend-contract constant/map coverage and backend probe contract-version coverage.
- Added app-generation metadata/frontend-value invariant coverage.
- Added host import-boundary coverage for test files plus plugin-owned frontend Vitest coverage.
- Added Codex plan-loop wrapper delegation/source-shape coverage.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `./scripts/go.sh test ./internal/appsubsystem/appdefinition -run 'TestBackendRuntime|TestCompareAndSet' -v`
- `./scripts/go.sh test ./internal/pythonsdklocalcore -v`
- `./scripts/go.sh test ./internal/pythonsharedconstants ./internal/plugins ./internal/appsubsystem/frontendvalues ./internal/appsubsystem/chatmodes -v`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystemSdk.test.ts src/plugins/importBoundaryGuardrails.test.ts src/components/Chat/chatComposerControls.test.ts src/components/Chat/ChatInput.submit.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.test.ts src/state/actions/aiAppSpecApply.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend test`
- `pnpm -C frontend exec vite build --config plugin-sdk/app-subsystem/vite.config.mjs`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend build`
- `source activate.sh && pytest tests/plugin_runtime/test_local_core.py tests/plugin_runtime/test_plugin_backend_guardrails.py tests/start/test_packaged_distribution.py tests/start/test_codex_plan_loop_scripts.py -q`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py::test_first_party_app_subsystem_plugin_wheel_installs_under_plugin_specific_root -q`
- `source activate.sh && pytest tests/plugin_runtime/test_plugin_backend_guardrails.py tests/start/test_packaged_distribution.py::test_first_party_app_subsystem_plugin_backend_runs_without_developer_go_toolchain -q`
- `bash -n scripts/run-codex-plan-loop.sh scripts/run-codex-app-plugin-boundary-closure-loop.sh scripts/run-codex-first-party-plugin-finalization-loop.sh scripts/run-codex-app-subsystem-backend-externalization-loop.sh scripts/run-codex-app-subsystem-real-plugin-loop.sh scripts/run-codex-first-party-plugin-standalone-loop.sh scripts/run-codex-third-party-plugin-generalization-loop.sh`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP and Playwright verification were not run because no visible UI behavior changed; the finalization step stopped the lingering DevTools Chrome session with `./scripts/stop-browser-mcp.sh --devtools`.
- Full repo test suite was not run; verification focused on touched subsystem owners, generated artifacts, packaging paths, and plugin frontend/package boundaries.
- One packaged-distribution test initially failed on a PyPI `setuptools==80.9.0` read timeout and passed on rerun; external package-index availability remains an infrastructure risk.

## 2026-04-23 08:12:57 PDT
Fixes applied:
- Added one owner-level runtime-managed frontend build path so first-party app-subsystem plugin validation, linking, deployment snapshot packaging, and app publish staging materialize required frontend assets from plugin-owned source instead of relying on tracked `frontend/dist/*`.
- Switched the first-party plugin wheel build to a plugin-local PEP 517 backend that builds the frontend bundle when needed and kept the standalone plugin boundary rooted in plugin-owned source and declared dependencies.
- Regenerated the Go-owned Python shared constants so the packaged local-core runtime exports the full app-subsystem backend listener command set, and removed the host test's direct dependency on the repo-root first-party built bundle.

Tests added or upgraded:
- Added runtime-managed frontend asset coverage in `internal/plugins/app_plugin_packaging_test.go` for link-time builds, wheel builds with missing `frontend/dist`, and deployment snapshot packaging.
- Upgraded `internal/plugins/package_manager_test_helpers_test.go` and `tests/start/test_packaged_distribution.py` to remove staged `frontend/dist` before wheel validation.
- Expanded `internal/pythonsharedconstants/generator_test.go` and `tests/plugin_runtime/test_local_core.py` to assert the full app-subsystem listener-endpoint-to-local-core-command contract.
- Simplified `frontend/src/plugins/appSubsystemBuiltBundle.test.ts` so host-side runtime metadata coverage no longer reads the first-party plugin's repo-root built bundle.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `./scripts/go.sh test ./internal/pythonsharedconstants -run 'TestBuildIncludesGoOwnedAppSubsystemBackendContract' -v`
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceRuntimeActivatesLinkedFirstPartyAppSubsystemPluginWithRuntimeManagedComponents|TestBuildFirstPartyAppSubsystemWheelIncludesRuntimeManagedAssets|TestPackagePluginSourceForDeploymentBuildsRuntimeManagedFrontendAssets|TestServiceRuntimeActivatesFirstPartyAppSubsystemPackageManagerPlugin' -v`
- `source activate.sh && pytest tests/plugin_runtime/test_local_core.py -q`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystemBuiltBundle.test.ts`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP and Playwright verification were not run because no visible UI behavior changed; metadata finalization only ensured any lingering devtools session for this repo was stopped.
- `tests/start/test_packaged_distribution.py` was upgraded for the clean-checkout packaging path but was not rerun in this pass.
- Full repo test suite was not run; verification stayed focused on the standalone-plugin packaging owner, generated local-core contract constants, and the affected host boundary test.

## 2026-04-23 12:21:36 PDT
Fixes applied:
- Removed repo-checkout `backend/setta` injection from Python plugin backend launch roots so package-manager plugins resolve only plugin-owned and installed-package roots.
- Declared exact `setta` runtime dependencies for first-party app-subsystem plugin wheels, introduced a shared packaged-Setta test fixture under `internal/testutil/packagedsetta`, and rewired package-manager / packaged-distribution tests to install against packaged runtime inputs instead of repo-local imports.
- Generated `backend/setta/sdk_contracts/constants.py`, deleted the handwritten `backend/setta/sdk_contract_version.py`, and switched lightweight runtime callers to the generated SDK contract constant owner.
- Expanded the default quality gate to cover plugin manifests, Vite/Vitest configs, vendored SDK metadata, packaged SDK `types/*.d.ts`, and plugin frontend boundary tests; the simplified worktree also deleted one dead host-only selector helper surfaced by that pass.

Tests added or upgraded:
- Added Python backend launch-root coverage in `internal/plugins/backend_build_test.go`.
- Added packaged-runtime fixture coverage in `internal/plugins/package_manager_test_helpers_test.go`, `internal/app/app_subsystem_plugin_test.go`, and `tests/start/test_packaged_distribution.py` for declared runtime dependencies, package-owned installs, and packaged backend startup.
- Added lightweight SDK-constant owner coverage in `internal/pythonsdkcontracts/generator_test.go` and `tests/api/test_runtime_compat.py`.
- Added quality-path and frontend boundary-guard coverage in `tests/start/test_check_quality_script.py` and `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `./scripts/go.sh test ./internal/pythonsdkcontracts -v`
- `./scripts/go.sh test ./internal/plugins -run 'TestResolvePluginBackendLaunch|TestServiceRuntimeActivatesFirstPartyAppSubsystemPackageManagerPlugin|TestServiceRuntimeActivatesUnknownIDAppSubsystemPackageManagerPlugin' -v`
- `./scripts/go.sh test ./internal/app -run 'TestAppSubsystemPackageManagerPluginDisabledHidesBackendRoutesAndTools|TestAppSubsystemPackageManagerPluginEnabledRestoresBackendRoutesAndTools|TestAppSubsystemUnknownIDPackageManagerPluginEnabledRestoresBackendRoutesAndTools' -v`
- `source activate.sh && pytest tests/api/test_runtime_compat.py tests/plugin_runtime/test_local_core.py tests/plugin_runtime/test_plugin_backend_guardrails.py tests/start/test_check_quality_script.py -q`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'first_party_app_subsystem_plugin_package_declares_setta_runtime_dependency or first_party_app_subsystem_plugin_wheel_declares_setta_runtime_dependency or first_party_app_subsystem_plugin_wheel_installs_under_plugin_specific_root or first_party_app_subsystem_plugin_installed_frontend_bundle_imports_without_repo_path_assumptions or first_party_app_subsystem_plugin_backend_runs_without_developer_go_toolchain or wheel_build_with_packaged_go_binaries_includes_only_packaged_boundary'`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystemSdk.test.ts src/plugins/appSubsystemSdkOpenAPI.test.ts src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`

Residual risks / verification gaps:
- Browser/CDP and Playwright verification were not run because no visible UI behavior changed; metadata finalization stopped the lingering DevTools MCP session with `./scripts/stop-browser-mcp.sh --devtools`, and no `./aireset.sh` session remained active afterward.
- Full repo test suite and a separate third-party standalone-plugin matrix were not run; verification stayed focused on packaging, generated-constant ownership, package-manager activation, and boundary guardrails.

## 2026-04-23 13:21:40 PDT
Fixes applied:
- Made runtime-managed plugin frontend builds fail closed when `frontend.build` is declared without tracked plugin-owned build inputs such as `frontend/package.json`.
- Treated frontend-facing app-subsystem providers without a loadable frontend entrypoint as invalid before publishing runtime capabilities, and gated contributed MCP/UI-setting surfaces on the matching app-subsystem feature bits instead of `PluginEnabled` alone.
- Realigned the source app-subsystem SDK declaration surface with the vendored plugin copy so packaged `types/index.d.ts` stays authoritative and package-owned.

Tests added or upgraded:
- Added runtime-managed frontend build-input regressions in `internal/plugins/authoring_test.go` and `internal/plugins/app_plugin_packaging_test.go`.
- Added app-subsystem provider/frontend-entrypoint and feature-gating regressions in `internal/plugins/runtime_test.go`, `internal/appsubsystem/provider_test.go`, and `frontend/src/plugins/appSubsystem.test.tsx`.
- Added vendored/source SDK declaration-alignment coverage in `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceValidateFolderRejectsRuntimeManagedFrontendBuildWithoutPackageJSON|TestEnsureRuntimeManagedPluginFrontendAssetsRejectsMissingPackageJSON|TestPackagePluginSourceForDeploymentRejectsMissingPackageJSON|TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithoutFrontendEntrypointAsInvalid' -v`
- `./scripts/go.sh test ./internal/appsubsystem -run 'TestBuildScopedUISettingEntriesUsesBackendRuntime|TestBuildScopedUISettingEntriesRequiresAppAuthoringUI|TestBuildMCPToolRegistrationsFollowAppSubsystemFeatureBits|TestNewAppPublishServiceUsesBackendValidationRuntime|TestLoadAppSubsystemCapabilitiesIgnoresGlobalScopeInDeploymentMode' -v`
- `./scripts/go.sh test ./internal/app -run 'TestAppModePluginRuntimeIgnoresHostGlobalAppSubsystemProviders' -v`
- `./scripts/go.sh test ./internal/plugins`
- `./scripts/go.sh test ./internal/appsubsystem`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystem.test.tsx src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts src/plugins/appSubsystemSdk.test.ts`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend test`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend build`

Residual risks / verification gaps:
- CDP verification was attempted via `./aireset.sh` for the `/app` invalid-provider flow and the backend selection state was confirmed, but the live dev frontend could not mount because Vite served `/node_modules/.vite/deps/zustand.js?...` without a browser-visible `create` export; the temporary session was stopped with `./kill.sh`.
- No Playwright flow was added in this pass, and the full repo test suite / full `internal/app` package suite were not rerun; verification stayed focused on touched owners, boundary guards, and packaging paths.

## 2026-04-23 14:26:55 PDT
Fixes applied:
- Ignored shadowed duplicate providers during app-subsystem selection so shadowed invalid entries no longer poison capability/status resolution.
- Split runtime-managed frontend handling into source-build vs installed-package deployment paths, always refreshed plugin-owned dependencies before source builds, and allowed installed package-manager providers to package prebuilt frontend assets for deployment without requiring checkout-only build inputs.
- Routed app-deployment websocket project-state updates through the app-subsystem queue before server mode resolves, and removed the remaining host-side duplicate transport/OpenAPI helper implementations in favor of the SDK owner.
- Deleted the repo-owned `setta.api.local_core` / `setta.api.runtime_compat` shims and kept the lightweight packaged runtime boundary import-safe for installed plugin backends.

Tests added or upgraded:
- Added shadowed-provider selection and installed-package deployment packaging regressions in `internal/plugins/runtime_test.go`.
- Added runtime-managed frontend dependency-refresh coverage in `internal/plugins/app_plugin_packaging_test.go` and packaged-distribution wheel-build coverage for preexisting `node_modules`.
- Added frontend queueing regressions in `frontend/src/state/actions/websocketReceive.test.ts` and `frontend/src/plugins/appSubsystem.test.tsx`.
- Moved local-core/runtime-compat coverage to the surviving owner paths and removed the shim-only `tests/api/test_local_core.py`.

Verification run:
- `./scripts/go.sh test ./internal/plugins -count=1`
- `source activate.sh && pytest tests/api/test_runtime_compat.py tests/plugin_runtime/test_local_core.py tests/start/test_packaged_distribution.py -q`
- `pnpm -C frontend exec vitest run src/state/actions/websocketReceive.test.ts src/plugins/appSubsystem.test.tsx src/plugins/appSubsystemSdkOpenAPI.test.ts src/openapi/http/client.test.ts`
- `pnpm -C frontend gcf`
- `./check_quality.sh`

Residual risks / verification gaps:
- Browser/CDP and Playwright were not run in this pass; the changed frontend behavior was covered by unit/integration tests only, and metadata finalization stopped the lingering DevTools MCP session so no `./aireset.sh`-started session remained active afterward.
- No end-to-end installed-provider publish-and-launch smoke or full repo test suite was rerun; verification stayed focused on touched plugin-runtime, packaged-runtime, and frontend queueing owners.

## 2026-04-23 15:21:47 PDT
Fixes applied:
- Kept app-subsystem pending work and session initialization tied to stable provider/capability queue keys so same-provider frontend refreshes do not drop buffered work or let stale loads win.
- Made the source app-subsystem SDK and first-party plugin frontend package roots self-hosting with package-local build/typecheck entrypoints, and removed the remaining host-side first-party frontend build wrapper.
- Re-exported package-safe run-capability and deployment-policy helpers from the SDK owner instead of maintaining parallel host copies.

Tests added or upgraded:
- Added same-provider reload regressions in `frontend/src/plugins/runtime.test.ts` for buffered app-state handoff and session initialization continuity.
- Added package-root guardrails in `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts` and SDK-owner wiring coverage in `frontend/src/plugins/appSubsystemSdk.test.ts`.
- Upgraded `tests/start/test_packaged_distribution.py` to prove the staged first-party plugin frontend installs, typechecks, tests, and builds from its own root, and added a source-SDK package-root build/typecheck smoke.

Verification run:
- `pnpm -C frontend exec vitest run src/plugins/runtime.test.ts src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts src/plugins/appSubsystemSdk.test.ts src/utils/runCapabilities.test.ts src/utils/deploymentPolicies.test.ts`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'first_party_app_subsystem_plugin_frontend_builds_from_staged_source_tree or app_subsystem_frontend_sdk_source_package_builds_from_its_own_root'`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP and Playwright were not run because this iteration changed runtime/package-boundary behavior rather than a visual UI flow; no active `./aireset.sh` session was present at metadata finalization.
- Full repo test suites and a separate third-party standalone-plugin matrix were not rerun; verification stayed focused on the touched frontend runtime and standalone package roots.
