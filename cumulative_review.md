# Cumulative Review
## Recurring Subsystem Invariant Matrix

### Plugin Backend Refresh Atomicity
- Invariant: No-restart plugin rescans and mutations must keep runtime/status/route/listener/app-capability reads pinned to the last committed snapshot until backend runtime refresh and app-handler refresh both succeed; on failure restore plugin storage and refresh state together.
- Last finding commit: 17e82652b585f3d8b80779a7d24428f3319632f5
- Proof tests: `TestPluginMutationRuntimeServiceRescanRollsBackOnHandlerRefreshError`, `TestPluginMutationRuntimeServiceRescanKeepsCommittedSnapshotOnHandlerRefreshError`, `TestPluginMutationRuntimeServiceApplyLockfileRestoresOnHandlerRefreshError`, `TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOnHandlerRefreshError`
- Still unverified: Full `internal/app` suite not rerun in this pass; no browser verification needed for this backend-only change.

### App Definition Provider-State Synchronization
- Invariant: App-definition persistence stays provider-namespaced under `Document.PluginData[pluginID]`; provider writes may update that owned slice and app-spec file state, but must not replace newer live document fields or let stale deferred persists clobber newer in-memory state.
- Last finding commit: 17e82652b585f3d8b80779a7d24428f3319632f5
- Proof tests: `TestBackendRuntimeSetAppDefinitionSyncsPersistedState`, `TestBackendRuntimeSetAppDefinitionPreservesNewerLiveProjectState`, `TestBackendRuntimeSetAppDefinitionRebasesBlockedDeferredPersist`
- Still unverified: No broader projectstate mutation matrix beyond the focused app-definition backend tests.

### Local Core Packaged Runtime Boundary
- Invariant: The published plugin-runtime local-core helper must share one transport and handshake-validation path without importing API-only package surfaces or Pydantic-heavy modules into packaged plugin backends.
- Last finding commit: 17e82652b585f3d8b80779a7d24428f3319632f5
- Proof tests: `test_run_local_core_command_dispatches_through_packaged_boundary`, `test_run_local_core_command_surfaces_structured_errors`, `test_run_local_core_command_rejects_sdk_version_mismatch`, `test_run_local_core_command_rejects_sdk_contract_mismatch`, `test_first_party_app_subsystem_plugin_backend_runs_without_developer_go_toolchain`
- Still unverified: No broader packaged-plugin runtime matrix beyond the focused local-core and packaged-distribution tests.

### Package-Manager Plugin Manifest Discovery
- Invariant: Package-manager plugin discovery must use authoritative distribution metadata only; manifest-bearing distributions are discovered from `dist.files` and `.dist-info/RECORD`, including first-party wheel data-file installs, with no package-name or `top_level.txt` root guessing.
- Last finding commit: 17e82652b585f3d8b80779a7d24428f3319632f5
- Proof tests: `TestRuntimePluginDistributionsReturnsManifestBearingDistributions`, `TestRuntimePluginDistributionsSkipsDistributionsWithoutManifestMetadata`, `TestServiceRuntimeActivatesFirstPartyAppSubsystemPackageManagerPlugin`, `TestServiceRuntimeActivatesUnknownIDAppSubsystemPackageManagerPlugin`, `test_first_party_app_subsystem_plugin_wheel_installs_under_plugin_specific_root`
- Still unverified: No additional third-party wheel layout matrix beyond the focused first-party and unknown-ID package-manager cases.

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
