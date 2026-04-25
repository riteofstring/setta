# Cumulative Review
## Recurring Subsystem Invariant Matrix

### Plugin Backend Refresh Atomicity
- Invariant: No-restart plugin rescans and mutations must keep runtime/status/route/listener/app-capability reads pinned to the last committed snapshot until backend runtime refresh and app-handler refresh both succeed; on failure restore plugin storage and refresh state together.
- Last finding commit: 17e82652b585f3d8b80779a7d24428f3319632f5
- Proof tests: `TestPluginMutationRuntimeServiceRescanRollsBackOnHandlerRefreshError`, `TestPluginMutationRuntimeServiceRescanKeepsCommittedSnapshotOnHandlerRefreshError`, `TestPluginMutationRuntimeServiceApplyLockfileRestoresOnHandlerRefreshError`, `TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOnHandlerRefreshError`
- Still unverified: Full `internal/app` suite not rerun in this pass; no browser verification needed for this backend-only change.

### App Definition Provider-State Synchronization
- Invariant: App-definition persistence stays provider-namespaced under `Document.PluginData[pluginID]`; provider writes may update that owned slice and app-spec file state, but must not replace newer live document fields, let stale deferred persists clobber newer in-memory state, or let compare-and-set no-ops bypass the projectstate queue/frontend-op completion path.
- Last finding commit: 51c7821255e8a3eb742d8ea149f636132a63c271
- Proof tests: `TestBackendRuntimeSetAppDefinitionSyncsPersistedState`, `TestBackendRuntimeSetAppDefinitionPreservesNewerLiveProjectState`, `TestBackendRuntimeSetAppDefinitionRebasesBlockedDeferredPersist`, `TestCompareAndSetAppDefinitionNoopWaitsBehindQueuedMutation`, `TestCompareAndSetAppDefinitionNoopCompletesFrontendOpID`, `TestBackendRuntimeCompareAndSetNoopCompletesFrontendOpID`
- Still unverified: No broader projectstate mutation matrix beyond the focused app-definition tests.

### App Subsystem Provider Backend Contract
- Invariant: A selected app-subsystem provider must expose the complete required backend listener endpoint contract, and app-subsystem backend calls must dispatch only to the selected provider's registered contract endpoints; provider surfaces fail closed until that is true.
- Last finding commit: 51c7821255e8a3eb742d8ea149f636132a63c271
- Proof tests: `TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithoutRequiredBackendEndpointsAsInvalid`, `TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithPartialBackendEndpointSetAsInvalid`, `TestFindRegisteredListenerEndpointMatchScopesToRequestedPlugin`, `TestFindRegisteredListenerEndpointMatchUsesAppSubsystemPrivateEndpointsForPluginScopedRequest`, `TestBackendRuntimeScopesInvocationsToProviderPluginID`
- Still unverified: No separate HTTP/MCP provider-unavailable integration run; verification focused on runtime/provider selection and app-definition dispatch owners.

### Frontend App Subsystem Host/SDK Boundary
- Invariant: SDK contract/barrel imports must be side-effect-free for the shared OpenAPI singleton, plugin OpenAPI configuration must be explicit, shared request rebuild logic must have one owner, and required runtime host lifecycle hooks must be implemented by the runtime host rather than per-call overrides or silent no-ops.
- Last finding commit: 51c7821255e8a3eb742d8ea149f636132a63c271
- Proof tests: `src/plugins/appSubsystemSdkOpenAPI.test.ts`, `src/openapi/http/client.test.ts`, `src/plugins/appSubsystemFrontendHost.test.ts`, `src/plugins/appSubsystemSdk.test.ts`; plugin SDK and plugin frontend production builds completed.
- Still unverified: Browser/CDP and Playwright were not run because no visual rendering flow changed.

### Local Core Packaged Runtime Boundary
- Invariant: The published plugin-runtime local-core helper must share one transport and handshake-validation path without importing API-only package surfaces or Pydantic-heavy modules into packaged plugin backends.
- Last finding commit: 17e82652b585f3d8b80779a7d24428f3319632f5
- Proof tests: `test_run_local_core_command_dispatches_through_packaged_boundary`, `test_run_local_core_command_surfaces_structured_errors`, `test_run_local_core_command_rejects_sdk_version_mismatch`, `test_run_local_core_command_rejects_sdk_contract_mismatch`, `test_first_party_app_subsystem_plugin_backend_runs_without_developer_go_toolchain`
- Still unverified: No broader packaged-plugin runtime matrix beyond the focused local-core and packaged-distribution tests.

### Package-Manager Plugin Manifest Discovery
- Invariant: Package-manager plugin discovery must use authoritative distribution metadata only; manifest-bearing distributions are discovered from `dist.files` and `.dist-info/RECORD`, including first-party wheel data-file installs, with no package-name or `top_level.txt` root guessing. When such plugins are packaged for deployment, the Python backend dependency payload must be copied with the provider plugin snapshot.
- Last finding commit: a74b7eb1ec00a0062feb2a6c627b460302426c29
- Proof tests: `TestRuntimePluginDistributionsReturnsManifestBearingDistributions`, `TestRuntimePluginDistributionsSkipsDistributionsWithoutManifestMetadata`, `TestServiceRuntimeActivatesFirstPartyAppSubsystemPackageManagerPlugin`, `TestServiceRuntimeActivatesUnknownIDAppSubsystemPackageManagerPlugin`, `TestServicePackageActivePluginForDeploymentVendorsPackageManagerPythonPayload`, `test_first_party_app_subsystem_plugin_wheel_installs_under_plugin_specific_root`
- Still unverified: No additional third-party wheel layout matrix beyond the focused first-party and unknown-ID package-manager cases; no full packaged deployment smoke test with a real third-party wheel.

### App Deployment Provider Runtime Isolation
- Invariant: Published app deployments must package the active provider plugin and provider state, and deployment-mode app/plugin discovery must resolve only deployment-scoped packaged providers instead of host-global or package-manager plugin state.
- Last finding commit: a74b7eb1ec00a0062feb2a6c627b460302426c29
- Proof tests: `TestNewAppPublishServiceUsesBackendValidationRuntime`, `TestDiscoveryServiceDeploymentScopedIgnoresHostGlobalAndPackageManagerPlugins`, `TestLoadAppSubsystemCapabilitiesIgnoresGlobalScopeInDeploymentMode`, `TestAppModePluginRuntimeIgnoresHostGlobalAppSubsystemProviders`
- Still unverified: Browser/CDP and Playwright not run because no UI behavior changed; full repo test suite not run.

### Codex Plan Loop Automation
- Invariant: Plan-loop automation keeps option parsing, managed-worktree handling, retry behavior, prompt rendering, and authority checks in one runner, with plan path, sentinel, name, and commit prefix treated as wrapper data.
- Last finding commit: 51c7821255e8a3eb742d8ea149f636132a63c271
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
