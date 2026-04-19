# Cumulative Review
## Recurring Subsystem Invariant Matrix

### App-Generation Provenance Round-Trip
- Invariant: `appGenerationByMessageId` must preserve any non-empty provider-defined mode string across hydrate/continue/send flows; only a newly submitted turn with no requested mode defaults to `plain_chat`.
- Last finding commit: c2a1318816d510fa3f9c498bc0452bfbbc3436e8
- Proof tests: `TestNormalizeAppGenerationByMessageIDPreservesProviderDefinedModes`, `TestNormalizeSubmittedTurnAppGenerationByMessageIDPreservesExistingProviderModes`, `TestServiceStartChatPreservesProviderDefinedAppGenerationHistory`, `TestSendServicePreservesProviderDefinedAppGenerationHistory`
- Still unverified: No browser verification needed for this backend-only invariant; no live plugin-backed replay was run outside package tests.

### App-Subsystem Live Capability Dispatch
- Invariant: app-generation mode resolution, app HTTP routes, MCP tools, and app publish wiring must follow current app-subsystem capabilities after plugin/runtime mutation without restart, while still failing closed when no eligible provider is active.
- Last finding commit: c2a1318816d510fa3f9c498bc0452bfbbc3436e8
- Proof tests: `TestNewAppGenerationModeResolverTracksCapabilityChangesAfterConstruction`, `TestNewAppGenerationModeResolverUsesCurrentProviderAfterSwitch`, `TestAppSubsystemPluginEnableWithoutRestartRefreshesRoutesAndTools`
- Still unverified: No browser verification was run; install/link/disable/update flows were not separately exercised end-to-end beyond the shared backend refresh path and the enable-without-restart integration test.

## 2026-04-21 00:31:44 PDT
Fixes applied:
- Removed the legacy host whitelist from stored app-generation provenance normalization so provider-defined modes round-trip intact through hydrate and follow-up sends.
- Made app-generation mode resolution and app route/tool publish wiring rebuild from current app-subsystem capabilities after runtime/plugin mutations, with one refreshable handler path instead of stale startup-only wiring.
Tests added or upgraded:
- Added provider-defined provenance preservation coverage in `internal/agentruns/app_generation_test.go`, `internal/managedchat/service_test.go`, and `internal/externalagents/send_test.go`; upgraded hydrate assertions in `internal/externalagents/service_test.go`.
- Added live capability/provider-switch coverage in `internal/app/app_generation_modes_test.go` and enable-without-restart route/tool coverage in `internal/app/app_subsystem_plugin_test.go`.
Verification run:
- `./scripts/go.sh test ./internal/agentruns`
- `./scripts/go.sh test ./internal/managedchat`
- `./scripts/go.sh test ./internal/externalagents`
- `./scripts/go.sh test ./internal/app -run 'Test(NewAppGenerationModeResolver|AppSubsystemPluginEnableWithoutRestartRefreshesRoutesAndTools)'`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: not run; no UI code changed in this iteration.
Residual risks / verification gaps:
- No Playwright or CDP run was performed.
- The shared runtime refresh path was verified through provider-switch and enable-without-restart coverage, but other mutation entry points were not separately exercised end-to-end in this iteration.
