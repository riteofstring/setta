# Cumulative Review
## Recurring Subsystem Invariant Matrix

### App-Generation Provenance Round-Trip
- Invariant: `appGenerationByMessageId` must preserve any non-empty provider-defined mode string across hydrate/continue/send flows; only a newly submitted turn with no requested mode defaults to `plain_chat`.
- Last finding commit: c2a1318816d510fa3f9c498bc0452bfbbc3436e8
- Proof tests: `TestNormalizeAppGenerationByMessageIDPreservesProviderDefinedModes`, `TestNormalizeSubmittedTurnAppGenerationByMessageIDPreservesExistingProviderModes`, `TestServiceStartChatPreservesProviderDefinedAppGenerationHistory`, `TestSendServicePreservesProviderDefinedAppGenerationHistory`
- Still unverified: No browser verification needed for this backend-only invariant; no live plugin-backed replay was run outside package tests.

### App-Subsystem Live Capability Dispatch
- Invariant: app-generation mode resolution, app HTTP routes, MCP tools, app publish wiring, and queued frontend app-subsystem operations must follow the current active provider without restart; `pending_restart` entries must not participate in live provider selection, and fail-closed behavior still applies when no eligible provider is active.
- Last finding commit: e4a6499edf0ecb97318cd24505fc380b3fbf9cca
- Proof tests: `TestNewAppGenerationModeResolverTracksCapabilityChangesAfterConstruction`, `TestNewAppGenerationModeResolverUsesCurrentProviderAfterSwitch`, `TestAppSubsystemPluginEnableWithoutRestartRefreshesRoutesAndTools`, `TestServiceRuntimeAppSubsystemCapabilitiesIgnorePendingRestartProviders`, `buffers app-subsystem updates while the selected provider frontend is still importing`, `drops queued app-subsystem updates when the provider changes before the first frontend load finishes`
- Still unverified: No successful browser verification. A CDP run was attempted via `./aireset.sh`, but the affected flow did not complete because backend POSTs in devtools Chrome failed with `net::ERR_ALPN_NEGOTIATION_FAILED`.

### App Deployment Packaging Self-Containment
- Invariant: published app deployments must package the selected app-subsystem provider and enabled plugin state so app mode can boot from the deployment without manual provider seeding.
- Last finding commit: e4a6499edf0ecb97318cd24505fc380b3fbf9cca
- Proof tests: `TestRegisterAppDeploymentIDERoutesPublishesAppDeployment`
- Still unverified: No end-to-end browser or standalone deployment startup run was completed after publish; packaging is covered by backend publish assertions only.

### Provider-Scoped App Persistence
- Invariant: app-definition persistence, app-spec storage/default paths, and provider-facing app metadata must derive from the selected provider id rather than a first-party plugin constant.
- Last finding commit: e4a6499edf0ecb97318cd24505fc380b3fbf9cca
- Proof tests: `TestAppDefinitionServiceUsesSelectedProviderNamespace`, `builds a provider-scoped default app spec path`
- Still unverified: No browser authoring flow was completed against an unknown provider id; provider scoping is proven through backend/frontend owner tests only.

### Provider Discovery And Contract Ownership
- Invariant: app-subsystem provider discovery, generated route/contract registration, and MCP tool registration must flow from provider-owned discovery paths and owner contract types, without repeated hard-coded first-party imports or shadow bridge structs.
- Last finding commit: e4a6499edf0ecb97318cd24505fc380b3fbf9cca
- Proof tests: `TestPluginAppDefinitionPackagePathsDiscoversPluginProviders`, `TestBuildFrontendHTTPOpenAPIDocumentIncludesDiscoveredAppSubsystemRoutes`, `TestNewPluginBackendMCPRuntimeIncludesUnknownProviderTools`, `TestBuildMCPToolRegistrationsKeepsFrozenToolSet`
- Still unverified: Discovery was exercised against in-repo plugin packages only; no out-of-tree third-party provider package was run through generators in this iteration.

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

## 2026-04-21 02:00:44 PDT
Fixes applied:
- Published app deployments now package the selected provider plugin and enabled plugin state, and app publish resolves the provider source path from the current runtime instead of assuming manual seeding.
- App-definition/app-spec persistence and default path metadata now scope to the selected provider id, not the first-party plugin id.
- Live app-subsystem selection now ignores `pending_restart` providers, and frontend app-subsystem operations queue and flush by capability signature so stale provider loads do not replay updates.
- Generator/runtime provider discovery now follows provider-owned discovery paths, and the app-subsystem MCP bridge uses owner `mcpx.ToolRegistration` values directly.
Tests added or upgraded:
- Added `TestServiceRuntimeAppSubsystemCapabilitiesIgnorePendingRestartProviders`, `TestAppDefinitionServiceUsesSelectedProviderNamespace`, `TestPluginAppDefinitionPackagePathsDiscoversPluginProviders`, and `TestBuildFrontendHTTPOpenAPIDocumentIncludesDiscoveredAppSubsystemRoutes`.
- Extended `TestRegisterAppDeploymentIDERoutesPublishesAppDeployment` to assert packaged provider state, and added frontend coverage for provider-scoped default app spec paths plus async app-subsystem load queueing/provider-switch drops.
Verification run:
- `./scripts/go.sh test ./internal/plugins ./plugins/setta-json-render-app-gen/backend ./cmd/setta-gen-go-type-registries ./cmd/setta-gen-http-openapi -run 'Test(ServiceRuntimeAppSubsystemCapabilitiesIgnorePendingRestartProviders|AppDefinitionServiceUsesSelectedProviderNamespace|RegisterAppDeploymentIDERoutesPublishesAppDeployment|PluginAppDefinitionPackagePathsDiscoversPluginProviders|BuildFrontendHTTPOpenAPIDocumentIncludesDiscoveredAppSubsystemRoutes)'`
- `pnpm -C frontend exec vitest run src/plugins/appSubsystem.test.tsx src/plugins/runtime.test.ts`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: attempted via `./aireset.sh`, but the affected flow did not complete because devtools Chrome backend POSTs failed with `net::ERR_ALPN_NEGOTIATION_FAILED`; session was then stopped with `./kill.sh`.
Residual risks / verification gaps:
- No successful Playwright or CDP end-to-end run covered the affected UI flow.
- Published deployment startup and unknown-provider authoring behavior were verified through owner tests, not an end-to-end browser or standalone runtime launch.
