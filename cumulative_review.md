# Cumulative Review
## Recurring Subsystem Invariant Matrix

### Plugin Backend Refresh Atomicity
- Invariant: No-restart plugin rescans and mutations must keep runtime/status/route/listener/app-capability reads pinned to the last committed snapshot until backend runtime refresh and app-handler refresh both succeed; on failure restore plugin storage and refresh state together.
- Last finding commit: 17e82652b585f3d8b80779a7d24428f3319632f5
- Proof tests: `TestPluginMutationRuntimeServiceRescanRollsBackOnHandlerRefreshError`, `TestPluginMutationRuntimeServiceRescanKeepsCommittedSnapshotOnHandlerRefreshError`, `TestPluginMutationRuntimeServiceApplyLockfileRestoresOnHandlerRefreshError`, `TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOnHandlerRefreshError`
- Still unverified: Full `internal/app` suite not rerun in this pass; no browser verification needed for this backend-only change.

### App Definition Provider-State Synchronization
- Invariant: App-definition persistence stays provider-namespaced under `Document.PluginData[pluginID]`; provider writes and app-publish serialization must validate app-definition/app-spec pairs through the Go-owned persisted-write validator, run through the projectstate queue, snapshot definition/spec coherently, and must not replace newer live document fields, let stale deferred persists clobber newer in-memory state, split host projectstate and app-spec file commits, or let compare-and-set no-ops bypass frontend-op completion.
- Last finding commit: ee182e5c27de73bcc8e114879b0a0a15992dafc3
- Proof tests: `TestBackendRuntimeRejectsInvalidProviderMutationResults`, `TestBackendRuntimeSetAppDefinitionSyncsPersistedState`, `TestBackendRuntimeSetAppDefinitionPreservesNewerLiveProjectState`, `TestBackendRuntimeSetAppDefinitionRebasesBlockedDeferredPersist`, `TestBackendRuntimeSetAppDefinitionRollsBackAppSpecWhenHostPersistFails`, `TestBackendRuntimeCompareAndSetChangedRebasesBlockedDeferredPersist`, `TestBackendRuntimeCompareAndSetChangedRollsBackAppSpecWhenHostPersistFails`, `TestBackendRuntimeCompareAndSetRejectsStaleProviderPlan`, `TestBackendRuntimeReplansProviderMutationAgainstQueuedDocument`, `TestCompareAndSetAppDefinitionNoopWaitsBehindQueuedMutation`, `TestCompareAndSetAppDefinitionNoopCompletesFrontendOpID`, `TestBackendRuntimeCompareAndSetNoopCompletesFrontendOpID`, `TestRunAppDefinitionCompareAndSetReturnsPlannedDefinitionWithoutPersisting`, `TestPublishSerializesAppDefinitionAndAppSpecWithProjectStateRevision`
- Still unverified: No broader projectstate mutation matrix beyond the focused app-definition, app-publish, and local-core planning tests; full repo and full `internal/app` suites were not rerun in the final implementation pass.

### App Subsystem Provider Backend Contract
- Invariant: A selected app-subsystem provider must expose the complete Go-owned backend listener endpoint contract and matching contract version through `appSubsystemBackend.listenerEndpoints`, not the generic top-level listener endpoint surface; generated Python runtime constants, local-core command maps, and plugin backend entrypoints must derive from that owner, app-subsystem backend calls must dispatch only to the selected provider's private contract endpoints, and duplicate generic/private publication must fail closed.
- Last finding commit: c103c165e955c9188914f409fdcff5a5f256d7f0
- Proof tests: `TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithoutRequiredBackendEndpointsAsInvalid`, `TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithPartialBackendEndpointSetAsInvalid`, `TestFindRegisteredListenerEndpointMatchScopesToRequestedPlugin`, `TestFindRegisteredListenerEndpointMatchUsesAppSubsystemPrivateEndpointsForPluginScopedRequest`, `TestServiceAppSubsystemPrivateListenerEndpointsArePluginScoped`, `TestBackendRuntimeScopesInvocationsToProviderPluginID`, `TestBuildIncludesGoOwnedAppSubsystemBackendContract`, `TestNormalizeBackendProbeResponseValidatesAppSubsystemBackendContractVersion`, `TestNormalizeBackendProbeResponseRejectsDuplicateGenericAndAppSubsystemListenerEndpoint`, `TestAppSubsystemOnlyProviderManifestsDoNotRequestGenericListenerEndpoint`, `TestEnsureRuntimeManagedPluginFrontendAssetsBuildsUnknownIDFixtureFromSource`, `test_app_subsystem_backend_entrypoints_delegate_to_packaged_runtime_dispatcher`, `test_app_subsystem_backend_entrypoints_advertise_real_probe_contract`
- Still unverified: No separate HTTP/MCP provider-unavailable integration run; verification focused on generated contracts, runtime/provider selection, packaged backend probes, and app-definition dispatch owners.

### Frontend App Subsystem Host/SDK Boundary
- Invariant: SDK contract/barrel imports must keep shared OpenAPI setup explicit and side-effect-free; plugin source, plugin tests, plugin build config, vendored SDK metadata, vendored `dist/index.js`, packaged SDK type declarations, and the source SDK package's package-local generated inputs must enforce the standalone plugin boundary without repo-local host aliases, host test utilities, repo-private generation paths, broad host OpenAPI clients, source-scanning SDK pruning, or broad non-HTTP generated declaration fanout.
- Last finding commit: ee182e5c27de73bcc8e114879b0a0a15992dafc3
- Proof tests: `src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts` ("publishes standalone SDK types instead of source-file types", "keeps vendored SDK declarations aligned with the source SDK contract", "keeps the source SDK package source-first and package-owned", "keeps source SDK generated non-HTTP surfaces aligned with the host owner", "keeps source SDK generated HTTP surfaces pruned to the app-subsystem SDK contract", "prunes source SDK sidecar from owner metadata instead of SDK source reads"), `src/plugins/importBoundaryGuardrails.test.ts` ("rejects SDK source imports of host source aliases", "rejects SDK source relative imports that escape the SDK package root", "rejects SDK declaration imports of host source aliases", "rejects vendored SDK declaration imports of repo-local plugin paths", "rejects frontend/src imports"), `plugins/setta-json-render-app-gen/frontend/tests/state/actions/app.openapi.test.ts`, `TestBuildFrontendHTTPOpenAPIDocumentMarksAppSubsystemSDKSurface`, `TestBuildSemanticSidecarIncludesAppSubsystemSDKScopeMetadata`, `test_app_subsystem_frontend_sdk_source_package_builds_from_its_own_root`, `test_vendored_app_subsystem_frontend_sdk_matches_source_package_build`, package-root `tsc --noEmit` for `frontend/plugin-sdk/app-subsystem` and `plugins/setta-json-render-app-gen/frontend`
- Still unverified: No separate third-party standalone-plugin matrix or CDP visual verification was run in this pass; verification stayed at boundary/package-root checks, source-SDK and vendored-SDK alignment, plugin-owned OpenAPI initialization coverage, package-root typecheck, and the affected Playwright app-mode flow.

### Frontend SDK Helper Ownership
- Invariant: Package-safe frontend helpers shared by the host and the app-subsystem SDK must have one SDK owner; host entrypoints may re-export that owner or add host-only wrappers, but must not carry parallel copies of run-capability, deployment-policy, project-state selector, or binary-download transport logic.
- Last finding commit: ee182e5c27de73bcc8e114879b0a0a15992dafc3
- Proof tests: `src/plugins/appSubsystemSdk.test.ts` ("exposes plugin-safe project-state helpers through the SDK", "keeps host helper entrypoints wired to SDK-owned implementations", "keeps the source SDK package detached from host-private imports", "builds binary download urls from explicit server-mode input"), `src/plugins/appSubsystem.test.tsx`, `src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts` ("rejects host binary-download transport shims"), `plugins/setta-json-render-app-gen/frontend/tests/state/actions/app.openapi.test.ts`, `src/utils/runCapabilities.test.ts`, `src/utils/deploymentPolicies.test.ts`, package-root `tsc --noEmit` for `frontend/plugin-sdk/app-subsystem` and `plugins/setta-json-render-app-gen/frontend`
- Still unverified: CDP visual verification was not run; helper coverage stayed focused on runtime-host scoping, SDK/host wiring, source/vendored package boundaries, and package-root typecheck.

### App Deployment Frontend Project-State Queueing
- Invariant: App-deployment websocket project-state updates, buffered app-definition/app-spec mutations, and app-session initialization waiters must route through the app-subsystem queue keyed by stable provider/capability identity, remain queued across same-provider frontend refresh-signature churn, never let a stale load completion overwrite a newer selected-provider load, and initialize provider-owned deployment session/state before the `/app` route opens its websocket or renders ready UI.
- Last finding commit: ee182e5c27de73bcc8e114879b0a0a15992dafc3
- Proof tests: `src/state/actions/websocketReceive.test.ts` ("routes app deployment project-state updates through the app-subsystem queue before server mode resolves"), `src/plugins/appSubsystem.test.tsx` ("queues project-state updates until app-subsystem registration finishes loading", app deployment session/state initialization), `src/plugins/runtime.test.ts` ("buffers app-subsystem updates during same-provider frontend reloads", "preserves buffered app-subsystem updates queued before a same-provider reload starts", "keeps app-session initialization waiting across same-provider reloads"), `plugins/setta-json-render-app-gen/frontend/tests/state/actions/app.openapi.test.ts`, `src/components/Pages/router.appMode.test.tsx`, `frontend/tests/e2e/app/app-mode-load.spec.ts`
- Still unverified: CDP visual verification and the full app-mode Playwright matrix were not run; the affected `/app` load flow passed through Playwright E2E and the plugin-owned OpenAPI initialization path has focused unit coverage.

### Standalone Plugin Packaging Pipeline
- Invariant: The first-party and fixture app-subsystem plugin frontends plus the source app-subsystem SDK package must install, typecheck, test, and build from their own package roots using real shipped source trees, package-owned configs, and declared Setta runtime/SDK dependencies; runtime-managed frontend source-build paths must require tracked plugin-owned build inputs, tests that validate manifest frontend assets must run the plugin-owned build instead of relying on checked-in `frontend/dist/*`, while installed package-manager and wheel paths must validate packaged frontend assets without checkout-only inputs; packaged deployment/wheel paths must not depend on tracked `frontend/dist/*`, repo checkout `backend/setta`, repo-local host frontend aliases, or a host-side first-party wrapper script or hardcoded plugin path, and vendored SDK artifacts used by the plugin package must match the source SDK owner build.
- Last finding commit: ee182e5c27de73bcc8e114879b0a0a15992dafc3
- Proof tests: `TestProductionCandidateProviderResolvePyPICandidateAcceptsFirstPartyRuntimeManagedWheelWithoutPackageJSON`, `TestServiceValidateFolderRejectsRuntimeManagedFrontendBuildWithoutPackageJSON`, `TestEnsureRuntimeManagedPluginFrontendAssetsRejectsMissingPackageJSON`, `TestEnsureRuntimeManagedPluginFrontendAssetsBuildsUnknownIDFixtureFromSource`, `TestPackagePluginSourceForDeploymentBuildsRuntimeManagedFrontendAssets`, `TestServiceRuntimeActivatesFirstPartyAppSubsystemPackageManagerPlugin`, `TestServiceRuntimeActivatesUnknownIDAppSubsystemPackageManagerPlugin`, `TestAppSubsystemPluginEnabledRestoresBackendRoutesAndTools`, `TestAppSubsystemPackageManagerPluginEnabledRestoresBackendRoutesAndTools`, `TestAppSubsystemUnknownIDPackageManagerPluginEnabledRestoresBackendRoutesAndTools`, `test_editable_install_does_not_require_packaged_go_binaries`, `test_minimal_distribution_project_uses_packaged_runtime_modules`, `test_wheel_build_requires_packaged_go_binaries`, `test_wheel_build_with_packaged_go_binaries_includes_only_packaged_boundary`, `test_wheel_metadata_limits_default_dependencies_to_packaged_boundary`, `test_first_party_app_subsystem_plugin_wheel_installs_under_plugin_specific_root`, `test_unknown_id_app_subsystem_plugin_frontend_builds_from_staged_source_tree`, `test_app_subsystem_frontend_sdk_source_package_builds_from_its_own_root`, `test_vendored_app_subsystem_frontend_sdk_matches_source_package_build`, `test_first_party_app_subsystem_plugin_backend_runs_without_developer_go_toolchain`, package-root `tsc --noEmit` for `frontend/plugin-sdk/app-subsystem` and `plugins/setta-json-render-app-gen/frontend`, `pnpm --dir plugins/setta-json-render-app-gen/frontend test -- tests/state/actions/app.test.ts`, `pnpm --dir plugins/setta-json-render-app-gen/frontend test -- tests/state/actions/app.openapi.test.ts`
- Still unverified: No full clean-checkout packaged-deployment smoke or separate third-party standalone-plugin matrix was rerun in this pass; verification covered focused candidate resolution, wheel metadata/boundary shape, minimal distribution runtime modules, package-root typecheck/build, source-SDK build, vendored-source SDK alignment, first-party plugin tests, and affected app route activation.

### App Subsystem Capability-To-Surface Gating
- Invariant: App-subsystem frontend, deployment-runtime, startup output, MCP-tool, and scoped UI-setting surfaces may be published only when a single selected provider both registers the backend contract and declares the corresponding feature bits; frontend-facing feature bits additionally require a loadable frontend entrypoint, and app-mode success paths must stage a real valid provider rather than a manifest-only placeholder.
- Last finding commit: d9aadf0eba71f80c6896538f7496d92a26b732b1
- Proof tests: `TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithoutFrontendEntrypointAsInvalid`, `TestServiceRuntimeAppSubsystemCapabilitiesIgnoreShadowedInvalidProviders`, `TestBuildScopedUISettingEntriesUsesBackendRuntime`, `TestBuildScopedUISettingEntriesRequiresAppAuthoringUI`, `TestBuildMCPToolRegistrationsFollowAppSubsystemFeatureBits`, `TestEmitAppStartupOutputWarnsForPublicHostAndPrintsURL`, `TestEmitAppStartupOutputFallsBackWhenBrowserOpenFails`, `TestEmitAppStartupOutputRejectsManifestOnlyAppSubsystemProvider`, `TestEmitAppStartupOutputSupportsUnknownIDAppSubsystemProvider`, `src/plugins/appSubsystem.test.tsx`, `src/components/Pages/router.appMode.test.tsx`, `frontend/tests/e2e/app/app-mode-load.spec.ts`
- Still unverified: No broad HTTP/MCP provider-unavailable integration or full browser matrix was rerun; verification focused on runtime capability selection, startup gating, frontend unit coverage, and one affected `/app` Playwright flow.

### App Subsystem MCP Tool Ownership
- Invariant: App-subsystem MCP tool schemas, handlers, argument parsing, and catalog/definition registrations have one owner under `internal/appsubsystem/mcptools`; HTTP and `mcpx` transports may use thin adapters and generic fixtures, but must not copy app tool definitions or feature-gating behavior.
- Last finding commit: d9aadf0eba71f80c6896538f7496d92a26b732b1
- Proof tests: `TestBuildMCPToolRegistrationsFollowAppSubsystemFeatureBits`; focused Go proof `./scripts/go.sh test ./internal/tools ./internal/appsubsystem ./internal/appsubsystem/mcptools ./internal/appsubsystemproviders/builtin ./internal/httpapi ./internal/mcpx -run 'AppDefinition|MCPTool|ToolError|BuildMCPToolRegistrations' -count=1`
- Still unverified: Full HTTP and MCP suites were not rerun beyond the focused app-definition/MCP ownership paths.

### Local Core Packaged Runtime Boundary
- Invariant: The published plugin-runtime local-core helper and lightweight runtime clients must share one packaged boundary, include all lightweight runtime modules in the Setta wheel/test fixture, derive SDK contract constants from the authoritative owner, expose generated app-subsystem backend contract constants, keep typed app-subsystem helper logic out of the lightweight `LocalCoreClient`, centralize app-subsystem backend probe/runtime dispatch in `setta.plugin_runtime`, and avoid repo-owned `setta.api.*` shim boundaries or heavyweight generated SDK imports in packaged plugin backends.
- Last finding commit: ee182e5c27de73bcc8e114879b0a0a15992dafc3
- Proof tests: `test_lightweight_sdk_contract_version_matches_generated_owner`, `test_run_local_core_command_dispatches_through_packaged_boundary`, `test_run_local_core_command_surfaces_structured_errors`, `test_run_local_core_command_rejects_sdk_version_mismatch`, `test_run_local_core_command_rejects_sdk_contract_mismatch`, `test_local_core_client_keeps_source_only_typed_helpers_out_of_packaged_boundary`, `test_plugin_runtime_test_setta_wheel_keeps_local_core_boundary_packaged_only`, `test_app_subsystem_backend_entrypoints_delegate_to_packaged_runtime_dispatcher`, `test_minimal_distribution_project_uses_packaged_runtime_modules`, `test_editable_install_does_not_require_packaged_go_binaries`, `test_wheel_build_requires_packaged_go_binaries`, `test_wheel_build_with_packaged_go_binaries_includes_only_packaged_boundary`, `test_wheel_metadata_limits_default_dependencies_to_packaged_boundary`, `test_first_party_app_subsystem_plugin_backend_runs_without_developer_go_toolchain`
- Still unverified: The full top-level packaged `setta` wheel with real `backend/setta/go_bin` payload was not built in this pass; verification used focused packaged-distribution wheel/boundary tests plus lightweight runtime-compat and local-core owners. No separate deployment-mode local-core smoke was run.

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
- Invariant: Published app deployments must package the active provider plugin and provider state, serialize app-definition/app-spec content from one projectstate revision/snapshot, and deployment-mode app/plugin discovery must resolve only deployment-scoped packaged providers instead of host-global or package-manager plugin state.
- Last finding commit: 6d022ad8280a4b15abcf1a52e79c10edca128311
- Proof tests: `TestServicePackageActivePluginForDeploymentPackagesInstalledFirstPartyAppSubsystemPlugin`, `TestPublishSerializesAppDefinitionAndAppSpecWithProjectStateRevision`, `TestNewAppPublishServicePublishesWithGoOwnedValidation`, `TestDiscoveryServiceDeploymentScopedIgnoresHostGlobalAndPackageManagerPlugins`, `TestLoadAppSubsystemCapabilitiesIgnoresGlobalScopeInDeploymentMode`, `TestAppModePluginRuntimeIgnoresHostGlobalAppSubsystemProviders`
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

## 2026-04-23 16:31:47 PDT
Fixes applied:
- Removed the source-only typed realtime dependency helper from `setta.local_core_client` and moved that typed command path into the app-subsystem listener owner so the lightweight packaged runtime boundary no longer imports omitted generated SDK/types modules.
- Switched the source app-subsystem SDK and first-party plugin frontend package `typecheck` scripts to real shipped source trees, added the missing package-owned `@types/uuid` / `@types/lodash` declarations, and fixed the remaining package-root TypeScript errors in the SDK and plugin frontend.
- Synced the vendored app-subsystem frontend SDK declarations and runtime bundle to the source SDK owner build and kept the standalone plugin boundary rooted in package-owned artifacts rather than repo-local host aliases.

Tests added or upgraded:
- Added `test_local_core_client_keeps_source_only_typed_helpers_out_of_packaged_boundary` in `tests/plugin_runtime/test_local_core.py`.
- Upgraded `tests/start/test_packaged_distribution.py` to cover `test_plugin_runtime_test_setta_wheel_keeps_local_core_boundary_packaged_only`, real staged package-root typecheck/build for the SDK and plugin frontend, and `test_vendored_app_subsystem_frontend_sdk_matches_source_package_build`.

Verification run:
- `pnpm --dir frontend/plugin-sdk/app-subsystem exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `source activate.sh && pytest tests/plugin_runtime/test_local_core.py -q -k 'keeps_source_only_typed_helpers_out_of_packaged_boundary'`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'first_party_app_subsystem_plugin_frontend_builds_from_staged_source_tree or app_subsystem_frontend_sdk_source_package_builds_from_its_own_root or vendored_app_subsystem_frontend_sdk_matches_source_package_build or plugin_runtime_test_setta_wheel_keeps_local_core_boundary_packaged_only'`
- `pnpm -C frontend gcf`
- `./check_quality.sh`

Residual risks / verification gaps:
- Browser/CDP and Playwright were not run because no user-facing UI behavior changed in this iteration, and no active `./aireset.sh` session was present at metadata finalization.
- The top-level packaged `setta` wheel with real `backend/setta/go_bin` payload was not built in this iteration; lightweight packaged-runtime verification used the focused test fixture instead.
- No third-party standalone-plugin matrix or full repo suite was rerun; verification stayed focused on the local-core boundary, standalone package roots, vendored SDK alignment, and required quality gates.

## 2026-04-23 18:14:55 PDT
Fixes applied:
- Distinguished installed-package runtime-managed frontend validation from source-build validation so PyPI-installed first-party wheels no longer require checkout-only `frontend/package.json` input.
- Replaced manifest-only app startup fixtures with real deployment-runtime provider fixtures and added an explicit manifest-only invalid-provider regression.
- Synced package-owned app-subsystem SDK generated inputs from the post-cleanup owner outputs, extended import-boundary checks to `.d.ts`, and tightened frontend-binding generation so the source SDK typechecks from package-owned source without repo-local host shapes.

Tests added or upgraded:
- Added `TestProductionCandidateProviderResolvePyPICandidateAcceptsFirstPartyRuntimeManagedWheelWithoutPackageJSON` in `internal/plugins/candidate_provider_test.go`.
- Added `TestEmitAppStartupOutputRejectsManifestOnlyAppSubsystemProvider` and upgraded the app startup success-path tests in `cmd/setta-server/startup_test.go`.
- Extended `frontend/src/plugins/importBoundaryGuardrails.test.ts` and `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts` for declaration-boundary and source-SDK/host-generated alignment coverage.
- Upgraded `internal/frontendbindings/render_test.go`, `internal/frontendbindings/semantic_sidecar_test.go`, and `internal/frontendbindings/type_compiler_test.go` for standalone-SDK declaration generation coverage.
- Extended `tests/start/test_packaged_distribution.py` to assert the installed first-party wheel omits `frontend/package.json`.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `./scripts/go.sh test ./internal/frontendbindings -count=1`
- `./scripts/go.sh test ./internal/plugins -run 'TestProductionCandidateProviderResolvePyPICandidateAcceptsFirstPartyRuntimeManagedWheelWithoutPackageJSON' -count=1`
- `./scripts/go.sh test ./cmd/setta-server -run 'TestEmitAppStartupOutput(WarnsForPublicHostAndPrintsURL|FallsBackWhenBrowserOpenFails|RejectsManifestOnlyAppSubsystemProvider|SupportsUnknownIDAppSubsystemProvider)$' -count=1`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'first_party_app_subsystem_plugin_wheel_installs_under_plugin_specific_root'`
- `pnpm -C frontend exec vitest run src/plugins/importBoundaryGuardrails.test.ts src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`
- `pnpm --dir frontend/plugin-sdk/app-subsystem exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`

Residual risks / verification gaps:
- Browser/CDP and Playwright were not run because no visible UI behavior changed; finalization confirmed no active `./aireset.sh` session remained.
- The full repo test suite was not rerun.
- No live end-to-end `setta plugins install pypi:...` smoke with packaged `backend/setta/go_bin` payload was rerun in this pass; confidence comes from focused Go, pytest, typecheck, and boundary coverage.

## 2026-04-23 20:58:16 PDT
Fixes applied:
- Moved shared project-state selector semantics into the app-subsystem frontend SDK owner and reduced the host selector module to SDK re-exports.
- Added Go-owned `x-setta-frontend-sdk-scopes` metadata for app-subsystem HTTP operations and generated the source SDK HTTP client from a pruned app-subsystem OpenAPI document.
- Removed the source SDK's broad non-HTTP generated tree, replaced copied host generated types with a package-owned source-first surface, and pruned the SDK sidecar to the enum/value entries and payload keys the SDK owns.
- Rebuilt and synced the first-party plugin's vendored app-subsystem frontend SDK bundle and declarations from the source SDK package.

Tests added or upgraded:
- Added Go OpenAPI scope coverage in `cmd/setta-gen-http-openapi/main_test.go` proving app-subsystem SDK routes are marked and host-only operations are not.
- Upgraded `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts` to reject broad SDK HTTP/non-HTTP generated surfaces and host-only operation names while checking pruned sidecar alignment with owner values.
- Upgraded `frontend/src/plugins/appSubsystemSdk.test.ts` to prove host helper entrypoints, including project-state selectors, are wired to SDK-owned implementations.

Verification run:
- `source activate.sh && pnpm -C frontend gcf`
- `./check_quality.sh`
- `pnpm --dir frontend/plugin-sdk/app-subsystem exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `pnpm --dir frontend/plugin-sdk/app-subsystem exec vite build --config vite.config.mjs`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystemSdk.test.ts src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts src/plugins/importBoundaryGuardrails.test.ts`
- `./scripts/go.sh test ./cmd/setta-gen-http-openapi -run 'TestBuildFrontendHTTPOpenAPIDocumentMarksAppSubsystemSDKSurface|TestBuildFrontendHTTPOpenAPIDocumentIncludesDiscoveredAppSubsystemRoutes' -v`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'vendored_app_subsystem_frontend_sdk_matches_source_package_build or app_subsystem_frontend_sdk_source_package_builds_from_its_own_root'`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP and Playwright were not run because no visible UI behavior changed; finalization stopped any DevTools browser session with `./scripts/stop-browser-mcp.sh --devtools`.
- No full clean-checkout packaged-deployment smoke, third-party standalone-plugin matrix, or full repo suite was rerun; verification stayed focused on SDK generation boundaries, package-root typecheck/build, vendored SDK alignment, and required quality gates.

## 2026-04-23 22:26:52 PDT
Fixes applied:
- Enforced Go-owned persisted app-definition validation for provider mutation results before host projectstate/app-spec writes land.
- Made app publish prepare and validate app-definition/app-spec content from one projectstate revision instead of mixing live reads with a publish snapshot.
- Moved app-subsystem backend listener endpoints to private `appSubsystemBackend.listenerEndpoints`, rejected duplicate generic/private endpoint publication, and kept app-subsystem listener invocation plugin-scoped.
- Replaced SDK sidecar pruning that scanned SDK source with Go-owned `frontendSDKScopes` sidecar metadata.
- Synced the first-party plugin's vendored app-subsystem frontend SDK bundle from the source SDK build and made copied app test plugins materialize plugin-owned frontend assets instead of relying on checked-in `frontend/dist`.

Tests added or upgraded:
- Added invalid provider-mutation coverage for app-definition `Set`, `Stream`, `Update`, and changed-CAS backend runtime paths.
- Added app-publish snapshot coherence coverage for app-definition/app-spec serialization under a blocked projectstate queue.
- Added nested/private app-subsystem listener endpoint normalization, duplicate-publication rejection, plugin-scoped invocation, manifest guardrail, and Python backend probe assertions.
- Added Go-owned app-subsystem SDK scope metadata coverage plus frontend guardrails proving SDK sidecar pruning follows owner metadata instead of source reads.
- Upgraded packaging/app route tests for vendored SDK alignment, source SDK package-root build/typecheck, plugin package-root typecheck, and plugin-owned frontend asset materialization.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `./scripts/go.sh test ./internal/appsubsystem/appdefinition ./internal/appsubsystem/apppublish ./internal/appsubsystem ./internal/appsubsystemproviders/builtin ./internal/plugins ./internal/sharedtypes ./internal/deployments ./cmd/setta-server`
- `./scripts/go.sh test ./internal/app -run '^(TestAppSubsystemPluginEnabledRestoresBackendRoutesAndTools|TestAppSubsystemPluginEnableWithoutRestartRefreshesRoutesAndTools|TestAppSubsystemPackageManagerPluginEnabledRestoresBackendRoutesAndTools|TestAppServesAppDefinitionRoutes|TestAppServesAppDefinitionRoutesWithUnknownIDPlugin)$' -count=1 -v`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts src/plugins/importBoundaryGuardrails.test.ts`
- `pnpm --dir frontend/plugin-sdk/app-subsystem exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py tests/plugin_runtime/test_plugin_backend_guardrails.py -q`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'vendored_app_subsystem_frontend_sdk_matches_source_package_build or app_subsystem_frontend_sdk_source_package_builds_from_its_own_root'`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP and Playwright were not run because no visible UI behavior changed; no active `./aireset.sh` process was present during metadata finalization.
- Full repo test suite was not run.
- A broad `./scripts/go.sh test ./internal/app` attempt was not clean in this checkout due unrelated app-startup/config/package-manager fixture failures; the affected app-subsystem route tests passed.

## 2026-04-23 23:36:17 PDT
Fixes applied:
- Moved copied app-subsystem backend probe/runtime dispatch into the published `setta.plugin_runtime` boundary and reduced first-party plus unknown-ID provider backend entrypoints to thin package-runtime calls.
- Made the unknown-ID app-subsystem fixture source-first for runtime-managed frontend assets: manifest-declared `frontend.build.packageManager`, plugin-owned build script, wheel build frontend materialization, and no tracked `frontend/dist/*`.
- Materialized runtime-managed frontend assets in source/package-manager fixture staging and removed checkout-only build inputs from fake package-manager installs.
- Deleted the dead host binary-download transport shim and left binary download URL construction under the app-subsystem frontend SDK owner.

Tests added or upgraded:
- Added backend-entrypoint guardrails proving app-subsystem providers delegate to the packaged runtime dispatcher.
- Added unknown-ID fixture source-build and wheel-build coverage for runtime-managed frontend assets.
- Added frontend guardrail coverage rejecting host binary-download transport shims while preserving SDK-owned binary URL coverage.
- Updated app, plugin, and settacmd fixture staging tests to build runtime-managed provider frontend assets from plugin-owned source.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `source activate.sh && pytest tests/plugin_runtime/test_plugin_backend_guardrails.py -q`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'unknown_id_app_subsystem_plugin_frontend_builds_from_staged_source_tree or vendored_app_subsystem_frontend_sdk_matches_source_package_build'`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'first_party_app_subsystem_plugin_backend_runs_without_developer_go_toolchain'`
- `./scripts/go.sh test ./internal/plugins -run 'TestEnsureRuntimeManagedPluginFrontendAssetsBuildsUnknownIDFixtureFromSource|TestServiceRuntimeActivatesUnknownIDAppSubsystemPackageManagerPlugin|TestAppSubsystemOnlyProviderManifestsDoNotRequestGenericListenerEndpoint' -v`
- `./scripts/go.sh test ./internal/app -run 'TestAppSubsystemUnknownIDPluginEnabledRestoresBackendRoutesAndTools|TestAppSubsystemUnknownIDPackageManagerPluginEnabledRestoresBackendRoutesAndTools|TestAppServesAppDefinitionRoutesWithUnknownIDPlugin|TestPluginMutationRuntimeServiceRescanKeepsCommittedSnapshotOnHandlerRefreshError' -v`
- `./scripts/go.sh test ./internal/settacmd -run 'TestRunRoutesAppSubcommandAndDelegatesLatestDeployment' -v`
- `source activate.sh && pytest tests/plugin_runtime/test_local_core.py -q -k 'listener_endpoint or local_core_client_keeps_source_only_typed_helpers_out_of_packaged_boundary'`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts src/plugins/appSubsystemBuiltBundle.test.ts src/plugins/appSubsystemSdk.test.ts`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP and Playwright were not run because no visible UI behavior changed; metadata finalization stopped any lingering DevTools browser session with `./scripts/stop-browser-mcp.sh --devtools`.
- Full repo test suite and full clean-checkout packaged-deployment smoke were not run.
- `TestAppServesAppDefinitionRoutesWithUnknownIDPackageManagerPlugin` still fails on the existing packaged-Go-binary fixture gap: `Packaged Go Setta binary was not found`.

## 2026-04-24 01:15:07 PDT
Fixes applied:
- Routed `/app` through provider-owned app-deployment initialization before ready rendering, with first-party plugin startup loading current deployment session/state and websocket startup happening after readiness.
- Extended standalone plugin boundary checks to reject `frontend/src/*`, hardened source/vendored app-subsystem SDK declarations, and kept source/vendored package-root typecheck proofs.
- Replaced copied app MCP test builders with production app-subsystem MCP registrations by moving shared registration/error plumbing below `mcpx`.
- Updated app-mode E2E setup to enable the first-party app-subsystem provider and fixed the Vite/Zustand root import issue that blocked browser startup.

Tests added or upgraded:
- Added `frontend/src/components/Pages/router.appMode.test.tsx`.
- Extended `frontend/src/plugins/appSubsystem.test.tsx`, `frontend/src/plugins/importBoundaryGuardrails.test.ts`, and `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`.
- Added plugin frontend deployment initialization coverage in `plugins/setta-json-render-app-gen/frontend/tests/state/actions/app.test.ts`.
- Added package-root SDK typecheck coverage in source/vendored `typecheck/standalone.ts` and upgraded app-mode Playwright setup.

Verification run:
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `pnpm -C frontend exec vitest run src/components/Pages/router.appMode.test.tsx src/plugins/appSubsystem.test.tsx src/plugins/importBoundaryGuardrails.test.ts src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`
- `pnpm --dir frontend/plugin-sdk/app-subsystem exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'vendored_app_subsystem_frontend_sdk_matches_source_package_build or app_subsystem_frontend_sdk_source_package_builds_from_its_own_root'`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend test -- tests/state/actions/app.test.ts`
- `./scripts/go.sh test ./internal/tools ./internal/appsubsystem ./internal/appsubsystem/mcptools ./internal/appsubsystemproviders/builtin ./internal/httpapi ./internal/mcpx -run 'AppDefinition|MCPTool|ToolError|BuildMCPToolRegistrations' -count=1`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/app/app-mode-load.spec.ts`
- `git diff --check`

Residual risks / verification gaps:
- CDP visual verification was not run; the affected `/app` flow was covered by Playwright E2E.
- Full repo test suite, full app-mode Playwright matrix, and separate third-party standalone-plugin matrix were not run.
- `gcf` continued to print existing generated Python TC002/TC003 advisory diagnostics, but exited successfully.

## 2026-04-24 02:28:34 PDT
Fixes applied:
- Added SDK-owned scoped app-subsystem frontend host runtime activation and used it from host and first-party plugin controller initialization so pre-render app deployment OpenAPI calls run in the SDK instance that sends share-session headers.
- Reworked provider-backed app-definition mutation commits so provider results are validated but the Go owner re-plans set/stream/update/CAS against the queued live document before persisted projectstate/app-spec writes.
- Replaced duplicated packaged-distribution runtime shims with package-owned `backend/setta` runtime modules in the minimal distribution fixture and removed hardcoded wheel dist-info version assumptions.

Tests added or upgraded:
- Added plugin-owned OpenAPI initialization regression coverage in `plugins/setta-json-render-app-gen/frontend/tests/state/actions/app.openapi.test.ts`.
- Added stale provider-plan regressions in `internal/appsubsystem/appdefinition/backend_runtime_test.go` for CAS rejection and set/stream/update re-planning.
- Added minimal distribution runtime-module assertions and upgraded wheel metadata/package-boundary coverage in `tests/start/test_packaged_distribution.py`.

Verification run:
- `./scripts/go.sh test ./internal/appsubsystem/appdefinition -count=1`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend test -- tests/state/actions/app.openapi.test.ts`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystem.test.tsx src/components/Pages/router.appMode.test.tsx src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts src/plugins/importBoundaryGuardrails.test.ts`
- `pnpm --dir frontend/plugin-sdk/app-subsystem exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `pnpm --dir plugins/setta-json-render-app-gen/frontend exec tsc --noEmit -p tsconfig.typecheck.json --pretty false`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'app_subsystem_frontend_sdk_source_package_builds_from_its_own_root or vendored_app_subsystem_frontend_sdk_matches_source_package_build or minimal_distribution_project_uses_packaged_runtime_modules or wheel_build_requires_packaged_go_binaries or wheel_build_with_packaged_go_binaries_includes_only_packaged_boundary'`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/app/app-mode-load.spec.ts`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -q -k 'editable_install_does_not_require_packaged_go_binaries or minimal_distribution_project_uses_packaged_runtime_modules or wheel_build_requires_packaged_go_binaries or wheel_build_with_packaged_go_binaries_includes_only_packaged_boundary or wheel_metadata_limits_default_dependencies_to_packaged_boundary or vendored_app_subsystem_frontend_sdk_matches_source_package_build'`
- `git diff --check`

Residual risks / verification gaps:
- CDP visual verification was not run; the affected `/app` flow was covered by Playwright E2E.
- Full repo test suite, full app-mode Playwright matrix, full clean-checkout packaged-deployment smoke, and separate third-party standalone-plugin matrix were not run.
- `gcf` printed existing generated Python TC002/TC003 advisory diagnostics but exited successfully.
