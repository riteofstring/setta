# Branch Intent Summary

Compared against the `go-rewrite` merge base. This summary focuses on intentional behavior and ownership changes introduced by this branch so follow-up reviews do not accidentally "fix back" the old built-in app behavior.

## Features

### 1. App subsystem extracted into a runtime-managed plugin surface

- What changed:
  Before, core backend and frontend code directly owned the JSON Render app subsystem: app-definition routes/tools, app-generation UX, App Config/App Preview/App mode pages, and app deployment publish/runtime behavior all lived under `internal/*` and `frontend/src/*`.
  After, those surfaces are owned by `plugins/setta-json-render-app-gen` and are exposed to the host through backend/frontend plugin registration points.
- Why this appears intentional:
  This is a coordinated multi-layer move, not churn. Core app files were deleted or stripped of app-specific ownership, plugin-owned replacements were added, generated contracts were updated, and the branch adds design docs explicitly describing app-subsystem extraction and third-party plugin generalization.
- Files/endpoints/components involved:
  `plugins/setta-json-render-app-gen/backend/*`
  `plugins/setta-json-render-app-gen/frontend/src/index.ts`
  `frontend/src/plugins/appSubsystem.ts`
  `frontend/src/components/Pages/router.tsx`
  `frontend/src/components/Panes/Overview/Overview.tsx`
  `frontend/src/components/Pages/MainContainerCore.tsx`
  `/getAppDefinition`
  `/setAppDefinition`
  `/validateAppDefinition`
  `/getAppCatalog`
  `/getAppGenSkills`
  `/app/deployments`
  `/app/deployments/current/session`
  `/app/deployments/{deploymentName}/{version}/state`
  `/app/deployments/{deploymentName}/{version}/project_config`
- Default-value changes, moved UX, relocated logic:
  The plugin manifest at `plugins/setta-json-render-app-gen/setta.plugin.json` sets `enabledByDefault: false`, so app surfaces are no longer assumed to be built in and always on.
  The host no longer statically imports app UI. Overview tab content, preview surface, app-mode route, and publish modal are all plugin registrations now.
  App-specific frontend stores moved out of generic host state into plugin-owned stores under `plugins/setta-json-render-app-gen/frontend/src/appSubsystem*.ts`.
- Reviewer guardrail:
  Do not move app authoring/preview/app-mode/deployment UI or transport ownership back into core host code.
  Do not make app surfaces always-on again just because the first-party provider lives in the same repo.

### 2. App subsystem provider selection generalized away from a fixed first-party plugin id

- What changed:
  Before, the runtime effectively assumed the app subsystem was the fixed plugin `setta-json-render-app-gen`.
  After, any plugin that advertises `featureCapabilities.appSubsystem` can become the single active provider, and runtime/frontend behavior follows the selected provider id rather than a hard-coded first-party id.
- Why this appears intentional:
  The runtime now publishes provider-selection status, the frontend has a dedicated app-subsystem runtime layer keyed by plugin id, tests cover unknown provider ids, and a host import guard blocks runtime host code from directly importing repo-local provider code.
- Files/endpoints/components involved:
  `internal/plugins/runtime.go`
  `internal/plugins/status.go`
  `internal/plugins/types.go`
  `frontend/src/plugins/runtime.ts`
  `frontend/src/plugins/runtimeInternal.ts`
  `frontend/src/plugins/appSubsystem.ts`
  `internal/appsubsystem/host_import_guard_test.go`
- Default-value changes, moved UX, relocated logic:
  Provider selection now explicitly distinguishes `no_provider`, `disabled_provider`, `invalid_provider`, `active`, and `provider_conflict`.
  Multiple active providers now fail closed instead of being silently tolerated.
  The frontend loads provider frontend registrations by selected plugin id from `/plugins/runtime` metadata.
- Reviewer guardrail:
  Do not restore fixed-id checks for `setta-json-render-app-gen` in runtime host code.
  Do not silently pick one provider when multiple are active. Conflict is intentionally treated as unavailable until resolved.

### 3. App-generation chat modes and slash-command UI became plugin-defined rather than host-enum-defined

- What changed:
  Before, host code owned the fixed app-generation slash commands, fixed app-generation mode enum handling, and fixed custom slash-command mode options.
  After, backend mode validation/prompt building comes from provider contributions, frontend `AppGenerationMode` is an open string, and slash commands/custom mode options/default mode come from plugin-owned generated values.
- Why this appears intentional:
  `frontend/src/components/Chat/appGenerationSlashCommands.ts` was deleted, new generic app-generation mode resolver code was added under `internal/chatmodes`, host-generated app mode enums/options were removed, and plugin-owned frontend value exports now define the app chat UI surface.
- Files/endpoints/components involved:
  `internal/chatmodes/app_generation.go`
  `plugins/setta-json-render-app-gen/backend/chatmodes/chat_mode_contributions.go`
  `plugins/setta-json-render-app-gen/backend/frontend_value_exports.go`
  `plugins/setta-json-render-app-gen/frontend/src/appSubsystemChatUi.ts`
  `frontend/src/components/Chat/chatComposerControls.ts`
  `frontend/src/components/Chat/chatInputHelpers.ts`
  `frontend/src/state/types/appGenerationMode.ts`
  `frontend/src/state/utils/chatAppGeneration.ts`
  `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
- Default-value changes, moved UX, relocated logic:
  When no provider is active, the only built-in fallback custom slash-command mode is `plain_chat`; app-specific modes disappear.
  Image-required mode checks now come from provider metadata instead of checking a hard-coded host enum member.
  Custom slash-command mode labels/defaults now come from plugin-owned `AppSubsystemChatUIConfig`, not shared host config.
- Reviewer guardrail:
  Do not re-freeze app generation behind a host-owned enum or hard-coded `JSON Render` command list.
  Future app-generation commands/modes should come from provider metadata/resolvers, not shared host constants.

### 4. App-definition persistence and app deployment runtime were relocated behind plugin-owned contracts

- What changed:
  Before, `internal/projectstate` owned `Document.AppDefinition`, app-definition read/write/stream/compare-and-set helpers, and core deployment code owned app publish/runtime behavior directly.
  After, project documents carry plugin-scoped raw payloads under `pluginData`, plugin-owned appdefinition services perform persisted mutations, and app deployment runtime is opened through generic deployment type registrations.
- Why this appears intentional:
  The old `internal/projectstate/app_definition_*` files were deleted, `projectstate.Document` was reshaped, generic persisted mutation support was added, and plugin-owned appdefinition/app publish/deployment registration packages were added.
- Files/endpoints/components involved:
  `internal/projectstate/document.go`
  `internal/projectstate/persisted_mutation.go`
  `plugins/setta-json-render-app-gen/backend/appdefinition/*`
  `plugins/setta-json-render-app-gen/backend/app_publish_service.go`
  `plugins/setta-json-render-app-gen/backend/deployment_type_registration.go`
  `internal/deployments/type_registry.go`
  `internal/app/deployment_type_registry.go`
- Default-value changes, moved UX, relocated logic:
  App-definition metadata now lives in `project.json.pluginData["setta-json-render-app-gen"]` instead of top-level `project.json.appDefinition`.
  App-definition compare-and-set/settings logic moved into the plugin-owned appdefinition runtime and plugin-contributed UI settings.
  App deployment startup/opening now resolves a registered deployment type from mode + manifest instead of hard-coding app/share branches.
- Reviewer guardrail:
  Do not reintroduce `Document.AppDefinition`, core-owned app-definition compare/set helpers, or direct app publish/runtime owners in core unless a new decision explicitly re-centralizes ownership.

### 5. Generators and shared contracts now intentionally discover plugin-owned app schemas and value exports

- What changed:
  Before, generated frontend/shared contract discovery assumed app-specific contracts lived in core packages.
  After, generation paths discover app-specific contracts/value exports from plugin-owned packages under `plugins/`, and HTTP OpenAPI generation includes plugin-contributed route registrations.
- Why this appears intentional:
  `cmd/setta-gen-go-type-registries` now scans plugin packages, `cmd/setta-gen-http-openapi` builds OpenAPI with contributed route registrations, shared value exports now pull app chat UI config from the plugin backend, and schema naming/tests were updated to assert plugin-prefixed app schemas.
- Files/endpoints/components involved:
  `cmd/setta-gen-go-type-registries/main.go`
  `cmd/setta-gen-http-openapi/main.go`
  `internal/httpapi/openapi_document_builder.go`
  `internal/frontendbindings/discovered_contract_names_gen.go`
  `internal/sharedvalueexports/discovered_value_exports_gen.go`
  `frontend/generation/http_openapi/openapi.json`
  `frontend/generation/non_http_shared/*`
- Default-value changes, moved UX, relocated logic:
  App-specific shared values such as `AppSpecPatchPolicyConfig` and `AppSubsystemChatUIConfig` are now exported from the plugin backend rather than generic host helpers.
  Plugin-owned app request/response schemas now carry plugin-prefixed generated names instead of core `projectstate` app schema names.
- Reviewer guardrail:
  Do not move plugin-owned app contracts back into generic host-owned packages just to reduce generated diff size. The ownership move is intentional.

## Bug Fixes

### 1. App mode and app publish UI now disappear or fail clearly when no provider can serve them

- What changed:
  Before, the File menu and modal container always assumed app deployment UI existed, and `/app` routed through statically imported app pages.
  After, `Publish App Deployment` only appears when a provider registers an app deployment modal, the modal renderer is provider-driven, and `/app` shows a reasoned "App Mode Unavailable" surface when no eligible provider exists.
- Why this appears intentional:
  The change spans route bootstrapping, modal rendering, menu visibility, runtime capability plumbing, and dedicated tests for app-subsystem runtime behavior.
- Files/endpoints/components involved:
  `frontend/src/components/AppHeader/FileMenu.tsx`
  `frontend/src/components/Modals/ModalContainer.tsx`
  `frontend/src/components/Pages/router.tsx`
  `frontend/src/plugins/appSubsystem.ts`
- Reviewer guardrail:
  Do not restore unconditional app publish menu items or unconditional `/app` component imports that bypass provider availability checks.

### 2. Historical app-generation threads now stay viewable but block broken edit/replay flows when the plugin is unavailable

- What changed:
  Before, historical app-generation turns could flow into edit/redo paths even if no app subsystem was loaded, which risked replaying an app-generation thread as if it were plain chat.
  After, those threads still hydrate, but edit/redo is explicitly blocked with a warning unless app-generation slash commands are available or still loading; plain-chat history remains editable.
- Why this appears intentional:
  The branch adds a dedicated compatibility integration test and a specific user-facing blocked-reason message instead of silently falling through.
- Files/endpoints/components involved:
  `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatCoreUtils.ts`
  `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.appGenerationCompatibility.integration.test.tsx`
- Reviewer guardrail:
  Do not remove this block and allow replay without an app subsystem provider. The branch intentionally prefers an explicit warning over silently changing the meaning of a historical app-generation turn.

### 3. App-generation image-attachment requirements and slash-command replay now follow provider metadata instead of hard-coded mode names

- What changed:
  Before, host logic special-cased `json_render_with_image` and a fixed set of app slash-command actions.
  After, the frontend asks the active app provider which modes require images, and queued slash-command replay treats app-generation commands as runtime-registry-driven rather than matching a host-owned action enum.
- Why this appears intentional:
  Host enum parsing was removed, app slash-command helpers were deleted from host code, provider metadata now carries `requiresImageAttachment`/custom mode data, and backend mode validation goes through a shared resolver.
- Files/endpoints/components involved:
  `frontend/src/components/Chat/chatComposerControls.ts`
  `frontend/src/components/Chat/chatInputHelpers.ts`
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatCoreUtils.ts`
  `frontend/src/state/types/appGenerationMode.ts`
  `plugins/setta-json-render-app-gen/frontend/src/appSubsystemChatUi.ts`
  `internal/managedchat/service.go`
  `internal/externalagents/send.go`
- Reviewer guardrail:
  Do not re-hardcode host checks against the old enum/action list. Image requirements and mode handling are intentionally provider-defined now.

### 4. Third-party language-server plugins can now request runtime search-path injection without hard-coded plugin ids

- What changed:
  Before, required runtime path injection was special-cased for `setta-basedpyright` and `setta-ty` only.
  After, plugin backend probe results can declare `runtimeSearchPathsKey`, and the host merges runtime paths for any plugin registration that provides that metadata, including unknown plugin ids.
- Why this appears intentional:
  Probe schema changed, first-party plugin backends were updated to emit the metadata, and a new test covers an unknown plugin id receiving injected runtime paths.
- Files/endpoints/components involved:
  `internal/plugins/language_servers.go`
  `internal/plugins/backend_probe.go`
  `internal/plugins/types.go`
  `plugins/setta-basedpyright/backend/main.py`
  `plugins/setta-ty/backend/main.py`
  `internal/plugins/language_servers_test.go`
- Reviewer guardrail:
  Do not reintroduce plugin-id switch statements for runtime path injection. The metadata-driven contract is the intended fix.

### 5. Plugin runtime changes now keep app-subsystem capabilities and frontend operations in sync

- What changed:
  Before, app-subsystem availability depended on older runtime refresh assumptions and host-owned state, which made app capability state easier to stale out during plugin operations.
  After, plugin install/link/enable/disable/update flows rescan and resync app-subsystem capabilities, and the frontend app-subsystem runtime queues app-specific operations until the provider frontend registration finishes loading.
- Why this appears intentional:
  Capability sync was threaded through backend plugin mutation runtime services, frontend runtime now synchronizes app-subsystem registration after every runtime payload, and app-subsystem runtime state has explicit pending-operation handling.
- Files/endpoints/components involved:
  `internal/app/plugin_backend_runtime_refresh.go`
  `frontend/src/plugins/runtime.ts`
  `frontend/src/plugins/appSubsystem.ts`
- Reviewer guardrail:
  Do not remove the capability resync or queued-operation handling as "cleanup". It is intentional protection against stale provider state and dropped app-definition/app-preview updates during plugin/runtime transitions.

## Intentional Behavior Changes To Preserve

### 1. App subsystem availability is now fail-closed by design

- Preserve:
  No provider, disabled provider, invalid provider, or multiple active providers should mean no app HTTP routes, no app MCP tools, no app slash commands, no App Config/App Preview/App mode UI, and no app deployment runtime.
- Evidence/files:
  `internal/plugins/runtime.go`
  `frontend/src/plugins/appSubsystem.ts`
  `internal/appsubsystem/deployment_runtime.go`
  `plugins/setta-json-render-app-gen/backend/registrations.go`
- Reviewer guardrail:
  Do not "helpfully" keep stale app surfaces visible when provider selection is unresolved. Unavailable is the intended default state.

### 2. The runtime host boundary must stay provider-contract based, not first-party-path based

- Preserve:
  Runtime host code should not directly import `plugins/setta-json-render-app-gen/...` or statically reference its frontend bundle outside plugin-owned code, generators, or tests.
- Evidence/files:
  `internal/appsubsystem/host_import_guard_test.go`
  `frontend/src/plugins/runtimeInternal.ts`
  `frontend/src/plugins/appSubsystem.ts`
- Reviewer guardrail:
  Do not restore repo-local frontend imports or direct backend imports in runtime host code just because the first-party provider lives in the same repository.

### 3. App-specific contracts are intentionally plugin-owned now

- Preserve:
  App-definition request/response types, app validation issues/capabilities, app chat UI config, and app patch-policy exports now come from plugin-owned packages and plugin-prefixed generated schema names.
- Evidence/files:
  `plugins/setta-json-render-app-gen/backend/appdefinition/*`
  `plugins/setta-json-render-app-gen/backend/appdefinitionhttp/contracts.go`
  `plugins/setta-json-render-app-gen/backend/frontend_value_exports.go`
  `cmd/setta-gen-http-openapi/main.go`
  `cmd/setta-gen-go-type-registries/main.go`
- Reviewer guardrail:
  Do not move these contracts back into `internal/projectstate`, generic shared frontend config, or host-generated type aliases unless ownership is intentionally reversed.

### 4. App deployment startup and CLI preflight should fail loudly when app runtime support is unavailable

- Preserve:
  `setta app` and app deployment startup now require a single active app subsystem provider with `appDeploymentRuntime`. They should not fall back to share behavior or partially start.
- Evidence/files:
  `internal/settacmd/app.go`
  `cmd/setta-server/startup.go`
  `internal/appsubsystem/deployment_runtime.go`
  `internal/app/deployment_type_registry.go`
- Reviewer guardrail:
  Do not weaken these preflights into silent fallbacks.

### 5. Route paths stayed stable while ownership moved

- Preserve:
  The branch intentionally keeps existing app route paths stable even though registration moved into plugin code:
  `/getAppDefinition`
  `/setAppDefinition`
  `/validateAppDefinition`
  `/getAppCatalog`
  `/getAppGenSkills`
  `/app/deployments`
  `/app/deployments/current/session`
  `/app/deployments/{deploymentName}/{version}/state`
  `/app/deployments/{deploymentName}/{version}/project_config`
- Evidence/files:
  `plugins/setta-json-render-app-gen/backend/app_definition_routes_test.go`
  `plugins/setta-json-render-app-gen/backend/app_deployment_ide_routes_test.go`
  `plugins/setta-json-render-app-gen/backend/app_deployment_routes_test.go`
- Reviewer guardrail:
  Do not interpret plugin ownership as permission to churn public route strings. The intentional change is ownership and gating, not endpoint renaming.
