# Cumulative Review
## Recurring Subsystem Invariant Matrix

### App-Generation Provenance Round-Trip
- Invariant: `appGenerationByMessageId` must preserve any non-empty provider-defined mode string across hydrate/continue/send flows; only a newly submitted turn with no requested mode defaults to `plain_chat`.
- Last finding commit: c2a1318816d510fa3f9c498bc0452bfbbc3436e8
- Proof tests: `TestNormalizeAppGenerationByMessageIDPreservesProviderDefinedModes`, `TestNormalizeSubmittedTurnAppGenerationByMessageIDPreservesExistingProviderModes`, `TestServiceStartChatPreservesProviderDefinedAppGenerationHistory`, `TestSendServicePreservesProviderDefinedAppGenerationHistory`
- Still unverified: No browser verification needed for this backend-only invariant; no live plugin-backed replay was run outside package tests.

### App-Subsystem Live Capability Dispatch
- Invariant: compiled-in app-subsystem providers must register on production boot, CLI, and generator paths through discovered provider imports; app-generation mode resolution, app HTTP routes, MCP tools, app publish wiring, and queued frontend app-subsystem operations must follow the current active registered provider without restart; any active unregistered advertiser, `pending_restart` entry, or provider conflict must fail closed, same-provider frontend refreshes must re-enter `loading` and buffer updates until the replacement registration loads, and non-chat providers must not publish app-subsystem MCP tools.
- Last finding commit: 2f6ab41b98183d8d6eb917916deb2afeb6d8a30d
- Proof tests: `TestRenderAppSubsystemProviderRegistryIncludesBlankImportsAndCapabilities`, `TestEmitAppStartupOutputRequiresAppSubsystemProvider`, `TestRunAppRequiresEnabledAppSubsystemPlugin`, `TestAppSubsystemPluginEnableWithoutRestartRefreshesRoutesAndTools`, `TestNewPluginBackendMCPRuntimeSkipsUnregisteredProvider`, `TestNewPluginBackendMCPRuntimeSkipsMixedRegisteredAndUnregisteredProviders`, `TestNewPluginBackendMCPRuntimeSkipsAppSubsystemToolsWithoutChatModes`, `TestAppSubsystemUnregisteredPluginFailsClosedWithoutCrashingStartup`, `TestServiceRuntimeAppSubsystemCapabilitiesTreatUnregisteredActiveProviderAsInvalid`, `TestServiceRuntimeAppSubsystemCapabilitiesTreatMixedRegisteredAndUnregisteredActiveProvidersAsInvalid`, `TestServiceRuntimeAppSubsystemCapabilitiesIgnorePendingRestartProviders`, `TestNewDeploymentTypeRegistryRejectsMixedRegisteredAndUnregisteredActiveProviders`, `buffers app-subsystem updates during same-provider frontend reloads keyed by refresh signature`, `exposes supported app-generation modes through a capability-gated hook`
- Still unverified: No Playwright or CDP run covered provider switching, app authoring, or published deployment startup after these fixes. Same-provider frontend reload buffering remains proven through owner tests only; the full project-shell route was still blocked by the unrelated local `loadProjectConfig` / file-browser proxy issue.

### Frontend App-Generation Replay Validation
- Invariant: historical app-generation continue/edit/redo and queued `current_registry` slash-command replay must revalidate against the live provider slash-command and app-generation-mode registry before submit; missing commands, missing modes, or tightened image requirements must block locally instead of replaying stale mode or command state.
- Last finding commit: 2f6ab41b98183d8d6eb917916deb2afeb6d8a30d
- Proof tests: `blocks continue, edit, and redo when the historical mode is missing from the current provider registry`, `replays queued custom slash commands against the refreshed registry definition`, `replays queued custom slash commands with refreshed image requirements`, `project-ai-chat-queued-current-registry-replay.spec.ts`
- Still unverified: Historical replay was covered by integration tests plus a browser harness run of `ChatInput`, but not by the full project-shell route because the unrelated local `loadProjectConfig` / file-browser proxy issue still blocked that shell.

### App Deployment Packaging Self-Containment
- Invariant: published app deployments must package the selected app-subsystem provider plus deployment-normalized enabled/config state so app mode can boot from the deployment without manual provider seeding or missing provider config.
- Last finding commit: ea9eb19552054e2bcef9626ef38c83004dda5459
- Proof tests: `TestRegisterAppDeploymentIDERoutesPublishesAppDeployment`, `TestServiceDeploymentSnapshotForActivePluginNormalizesConfigToWorkspaceScope`
- Still unverified: No end-to-end browser or standalone deployment startup run was completed after publish; packaging is covered by backend publish assertions only.

### Provider-Scoped App Persistence
- Invariant: app-definition persistence, app-spec storage/default paths, and provider-facing app metadata must derive from the selected provider id rather than a first-party plugin constant; `pluginData` namespaces must be canonicalized at normalization time, and provider-scoped helpers must not silently synthesize first-party default paths.
- Last finding commit: 4da45919cd990e996cb5beab49219067844937b2
- Proof tests: `TestAppDefinitionServiceUsesSelectedProviderNamespace`, `TestAppDefinitionServiceReadsCanonicalizedWhitespacePluginDataKey`, `TestDocumentNormalizedCanonicalizesPluginDataKeys`, `TestDocumentNormalizedRejectsPluginDataCanonicalKeyCollisions`, `TestBuildMCPToolRegistrationsRequiresExplicitDefaultPath`
- Still unverified: No browser authoring flow was completed against an unknown provider id; persistence and provider scoping remain proven through owner tests only.

### Provider Discovery And Contract Ownership
- Invariant: app-subsystem provider discovery, generated route/contract registration, and MCP tool registration must flow from provider-owned discovery paths and owner contract types; production and generator wiring must use discovered provider imports and capability metadata instead of repeated hard-coded first-party imports or shadow bridge structs.
- Last finding commit: 4da45919cd990e996cb5beab49219067844937b2
- Proof tests: `TestPluginAppDefinitionPackagePathsDiscoversPluginProviders`, `TestAppSubsystemProvidersFromRepoRootDiscoversManifestBackedProviders`, `TestRenderAppSubsystemProviderRegistryIncludesBlankImportsAndCapabilities`, `TestBuildFrontendHTTPOpenAPIDocumentIncludesDiscoveredAppSubsystemRoutes`, `TestBuildOpenAPIDocumentAppSubsystemRegistrationsIncludesAdditionalProviders`, `TestNewPluginBackendMCPRuntimeIncludesUnknownProviderTools`
- Still unverified: Discovery and generation were exercised against in-repo providers only; no out-of-tree third-party provider package was run end-to-end in this iteration.

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

## 2026-04-21 03:05:26 PDT
Fixes applied:
- Live app-subsystem provider selection now filters through the registered backend-owner set before surfacing capabilities, so unregistered provider advertisers fail closed as `invalid_provider` instead of crashing startup, MCP runtime construction, or app-mode registration.
- Runtime refresh rollback now restores app-subsystem capability/runtime state and pending-restart plugin state when app-handler rebuild fails during either rescan or committed refresh.
- App deployment publish now carries deployment-normalized provider plugin state from `plugins.Service`, including workspace-scoped provider config for the packaged plugin.
Tests added or upgraded:
- Added `TestServiceRuntimeAppSubsystemCapabilitiesTreatUnregisteredActiveProviderAsInvalid`, `TestServiceDeploymentSnapshotForActivePluginNormalizesConfigToWorkspaceScope`, `TestAppSubsystemUnregisteredPluginFailsClosedWithoutCrashingStartup`, `TestPluginMutationRuntimeServiceRescanRollsBackOnHandlerRefreshError`, and `TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOnHandlerRefreshError`.
- Replaced old unregistered-provider crash assertions with fail-closed coverage in `TestNewAppGenerationModeResolverTreatsUnavailableProviderAsNoop` and `TestNewPluginBackendMCPRuntimeSkipsUnregisteredProvider`, and extended `TestRegisterAppDeploymentIDERoutesPublishesAppDeployment` to assert packaged provider config.
Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceRuntimeAppSubsystemCapabilities|TestServiceDeploymentSnapshotForActivePluginNormalizesConfigToWorkspaceScope|TestServiceRuntimeActivatesFirstPartyAppSubsystemPackageManagerPlugin|TestServiceRuntimeActivatesLinkedFirstPartyAppSubsystemPluginWithRuntimeManagedComponents'`
- `./scripts/go.sh test ./internal/app -run 'Test(NewAppGenerationModeResolverTreatsUnavailableProviderAsNoop|NewPluginBackendMCPRuntime(SkipsUnregisteredProvider|IncludesUnknownProviderTools)|NewDeploymentTypeRegistry(RejectsUnregisteredProvider|IncludesUnknownProviderAppRegistration)|AppSubsystem(UnregisteredPluginFailsClosedWithoutCrashingStartup|UnknownIDPluginEnabledRestoresBackendRoutesAndTools)|Plugin(MutationRuntimeServiceRescanRollsBackOnHandlerRefreshError|BackendRuntimeRefresherRefreshRestoresPendingStateOnHandlerRefreshError))'`
- `./scripts/go.sh test ./plugins/setta-json-render-app-gen/backend -run 'TestRegisterAppDeploymentIDERoutesPublishesAppDeployment'`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: not run; no UI behavior changed in this iteration.
- `./kill.sh` to confirm no earlier `./aireset.sh` session remained active.
Residual risks / verification gaps:
- No Playwright or CDP end-to-end run covered app-subsystem authoring, provider switching, or published deployment startup after these fixes.
- Published deployment startup and unknown-provider flows remain proven through owner tests rather than browser or standalone runtime launch.

## 2026-04-21 04:03:11 PDT
Fixes applied:
- Added discovered app-subsystem provider imports and generated registry metadata so production boot paths, CLI app startup, and OpenAPI generation register compiled-in providers without direct host imports.
- Made app-subsystem HTTP/OpenAPI and MCP publication capability-scoped so chat-mode capability owns app MCP tools, authoring-only providers expose only their routes, and deployment routes publish only when deployment runtime capability is declared.
- Canonicalized `pluginData` keys during document normalization, removed dead unscoped app-definition helpers, and required an explicit default app-spec path for app-definition MCP registrations.
Tests added or upgraded:
- Added `TestAppSubsystemProvidersFromRepoRootDiscoversManifestBackedProviders`, `TestRenderAppSubsystemProviderRegistryIncludesBlankImportsAndCapabilities`, and `TestBuildOpenAPIDocumentAppSubsystemRegistrationsIncludesAdditionalProviders`.
- Added `TestNewPluginBackendMCPRuntimeSkipsAppSubsystemToolsWithoutChatModes`, `TestDocumentNormalizedCanonicalizesPluginDataKeys`, `TestDocumentNormalizedRejectsPluginDataCanonicalKeyCollisions`, `TestBuildFrontendAPIRouteRegistrationsWithChatModesOnlyRegistersSkillRoutes`, `TestBuildFrontendAPIRouteRegistrationsWithoutDeploymentCapabilityOmitsDeploymentRoutes`, `TestAppDefinitionServiceReadsCanonicalizedWhitespacePluginDataKey`, and `TestBuildMCPToolRegistrationsRequiresExplicitDefaultPath`.
Verification run:
- `./scripts/go.sh run ./cmd/setta-gen-go-type-registries`
- `./scripts/go.sh test ./cmd/setta-gen-go-type-registries ./cmd/setta-gen-http-openapi`
- `./scripts/go.sh test ./plugins/setta-json-render-app-gen/backend`
- `./scripts/go.sh test ./internal/projectstate -run 'TestDocumentNormalized(CanonicalizesPluginDataKeys|RejectsPluginDataCanonicalKeyCollisions|SupportsFrontendSourceFields|PreservesOpaquePluginDataPayload)'`
- `./scripts/go.sh test ./internal/app -run 'Test(NewPluginBackendMCPRuntime(IncludesUnknownProviderTools|SkipsUnregisteredProvider|SkipsAppSubsystemToolsWithoutChatModes)|AppSubsystemPluginEnableWithoutRestartRefreshesRoutesAndTools)'`
- `./scripts/go.sh test ./internal/settacmd -run 'TestRun(RoutesAppSubcommandAndDelegatesLatestDeployment|AppRequiresEnabledAppSubsystemPlugin)'`
- `./scripts/go.sh test ./cmd/setta-server -run 'TestEmitAppStartupOutput(WarnsForPublicHostAndPrintsURL|FallsBackWhenBrowserOpenFails|RequiresAppSubsystemProvider)'`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: not run; no frontend code changed in this iteration.
Residual risks / verification gaps:
- No successful Playwright or CDP run covered provider switching, app authoring, or published deployment startup after these fixes.
- Discovery and generation coverage still exercised only against in-repo providers.
- A broader `./scripts/go.sh test ./internal/projectstate` run still hit unrelated pre-existing failures outside the touched invariant scope.

## 2026-04-21 05:33:20 PDT
Fixes applied:
- Made app-subsystem capability selection fail closed when a registered provider is active alongside any unregistered active advertiser.
- Revalidated historical app-generation replay and queued `current_registry` slash-command replay against the live provider registry before submit, including refreshed image requirements.
- Keyed same-provider app-subsystem frontend reloads by refresh signature so the subsystem re-enters `loading` and buffers backend updates until the replacement registration finishes loading.
Tests added or upgraded:
- Added `TestServiceRuntimeAppSubsystemCapabilitiesTreatMixedRegisteredAndUnregisteredActiveProvidersAsInvalid`, `TestNewPluginBackendMCPRuntimeSkipsMixedRegisteredAndUnregisteredProviders`, and `TestNewDeploymentTypeRegistryRejectsMixedRegisteredAndUnregisteredActiveProviders`.
- Added `blocks continue, edit, and redo when the historical mode is missing from the current provider registry`, `replays queued custom slash commands against the refreshed registry definition`, `replays queued custom slash commands with refreshed image requirements`, `buffers app-subsystem updates during same-provider frontend reloads keyed by refresh signature`, and `project-ai-chat-queued-current-registry-replay.spec.ts`.
Verification run:
- `./scripts/go.sh test ./internal/plugins ./internal/app -run 'Test(ServiceRuntimeAppSubsystemCapabilitiesTreatMixedRegisteredAndUnregisteredActiveProvidersAsInvalid|NewPluginBackendMCPRuntimeSkipsMixedRegisteredAndUnregisteredProviders|NewDeploymentTypeRegistryRejectsMixedRegisteredAndUnregisteredActiveProviders)'`
- `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.appGenerationCompatibility.integration.test.tsx src/components/Chat/ChatInput.submit.test.tsx src/plugins/appSubsystem.test.tsx src/plugins/runtime.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-queued-current-registry-replay.spec.ts`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: successful Playwright replay run plus CDP harness verification in the prior `./aireset.sh` session; `./kill.sh` then confirmed that session was stopped.
Residual risks / verification gaps:
- The full project-shell route still hit an unrelated local `loadProjectConfig` / file-browser proxy issue, so browser verification covered the `ChatInput` owner surface rather than the full project page.
- No end-to-end browser run in this iteration covered provider switching, app authoring, or published deployment startup.
