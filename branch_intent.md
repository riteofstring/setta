# Branch Intent

Compared against `go-rewrite` at merge base `c06b8f6fb1ad7e1fbbd4af6e0e3c94d16a9cad84` using:

- `git diff --name-status go-rewrite...HEAD`
- `git diff $(git merge-base go-rewrite HEAD)..HEAD`

This branch is primarily the standalone Watch Code plugin extraction. It intentionally removes old core-owned Watch Code surfaces instead of preserving compatibility aliases.

## Features

### Standalone `setta-watch-code` First-Party Plugin

- What changed: Watch Code was previously a core Setta feature with core frontend components, core HTTP routes, core UI settings, and core MCP tools. It is now a first-party plugin package under `plugins/setta-watch-code` with its own manifest, backend runtime, frontend bundle source, styles, tests, package metadata, and build backend.
- Why this appears intentional: `docs/plans/watch-code-plugin-extraction-plan.md` defines this as the target architecture, `README.md` now describes Watch Code as an optional first-party plugin, and the old core Watch Code surfaces are deleted rather than wrapped.
- Files/endpoints/components involved: `plugins/setta-watch-code/setta.plugin.json`, `plugins/setta-watch-code/backend/main.py`, `plugins/setta-watch-code/frontend/src/index.ts`, `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`, `plugins/setta-watch-code/frontend/src/styles.css`, `plugins/setta-watch-code/pyproject.toml`, `plugins/setta-watch-code/build_backend.py`, `README.md`, `docs/reference/watch-code.md`, `docs/guides/plugin-authoring-golden-path.md`.
- Defaults, moved flows, relocated logic: `pyproject.toml` and `uv.lock` do not include `setta-watch-code==0.1.0` in the `defaults` extra. The plugin manifest has `enabledByDefault: true` for explicit installations, declares `featureCapabilities.watchCode`, and requests `registerWatchCodeBackend`, `registerRouter`, `registerUISettings`, `registerCanvasControl`, `registerSettingRevealHandler`, `readProjectState`, and `subscribeProjectState`.
- Reviewer guardrail: Do not move Watch Code UI, routes, UI-setting registration, MCP tools, or provider selection back into core Setta unless a new product decision explicitly reverses the plugin extraction.

### Watch Code Provider Selection Is Generic And Probe-Gated

- What changed: The app no longer assumes the Watch Code provider is named `setta-watch-code` or that a manifest flag alone is enough. Provider availability is derived from plugin discovery plus backend probe output. Runtime status now reports Watch Code provider selection separately from app-subsystem selection.
- Why this appears intentional: The plugin capability resolver, backend probe validation, runtime status payloads, and tests all model `watchCodeBackend` as a real backend contract with fail-closed statuses.
- Files/endpoints/components involved: `internal/plugins/types.go`, `internal/plugins/backend_probe.go`, `internal/plugins/capability_resolution.go`, `internal/plugins/discovery.go`, `internal/plugins/runtime.go`, `internal/plugins/status.go`, `internal/plugins/runtime_snapshot_view.go`, `backend/setta/plugins/schemas/setta.plugin.schema.json`, generated OpenAPI/types under `frontend/src/openapi/http/generated` and `frontend/plugin-sdk/app-subsystem`.
- Defaults, moved flows, relocated logic: New provider statuses include `no_provider`, `disabled_provider`, `invalid_provider`, `pending_restart`, `active`, and `provider_conflict`. The selected provider ID is carried through `PluginWatchCodeCapabilities.PluginID`; Watch Code capability fields only become true for exactly one active valid provider.
- Reviewer guardrail: Do not hard-code `setta-watch-code` in host runtime behavior, and do not select a Watch Code provider from manifest data without a valid `watchCodeBackend` probe registration.

### Watch Code Runtime Starts And Stops With Provider Lifecycle

- What changed: The Watch Code service used to be initialized from project state in IDE mode. It now starts only when provider selection is active, stops when the provider is disabled, uninstalled, invalid, pending restart, or in conflict, and is reconciled after plugin runtime refreshes.
- Why this appears intentional: `internal/app/watch_code_capabilities.go`, `internal/app/watch_code_service_ref.go`, and `internal/app/plugin_backend_runtime_refresh.go` add explicit service/capability state with rollback on refresh failure. App tests cover no-provider, enable, disable, uninstall, and absent core route behavior.
- Files/endpoints/components involved: `internal/app/app.go`, `internal/app/app_generation_modes.go`, `internal/app/plugin_backend_runtime_refresh.go`, `internal/app/watch_code_capabilities.go`, `internal/app/watch_code_service_ref.go`, `internal/app/app_test.go`, `internal/app/plugin_backend_runtime_refresh_test.go`.
- Defaults, moved flows, relocated logic: Disabling or uninstalling the provider removes the Watch Code service and plugin backend routes but leaves stored plugin data untouched.
- Reviewer guardrail: Do not keep the Watch Code service running as a core fallback when provider selection is unavailable. Preserve the fail-closed behavior and data-preservation behavior.

### Watch Code State Moved From `Project` To Provider Plugin Data

- What changed: `Project` and `ProjectConfig` no longer carry `watchCodeEnabled`, `watchCodeFolders`, `watchCodeFiles`, `watchCodeRegistry`, or `watchCodeBaselineByPath`. Canonical persisted Watch Code state is now `Document.PluginData[providerPluginID]` with schema `{ "schemaVersion": 1, "projects": { "<projectId>": { "enabled", "folders", "files", "registry", "baselineByPath" } } }`.
- Why this appears intentional: The old fields are deleted from `internal/projectstate.Project` and `internal/projectview.ProjectConfig`, generated Python/TypeScript surfaces drop the old fields, and tests assert legacy top-level fields are ignored rather than migrated.
- Files/endpoints/components involved: `internal/projectstate/document.go`, `internal/projectstate/project_graph.go`, `internal/projectstate/watch_code_plugin_data.go`, `internal/projectstate/watch_code.go`, `internal/projectview/single_config.go`, `internal/projectview/frontend_defaults.go`, `internal/projectview/summary.go`, generated outputs under `backend/setta/types/generated`, `frontend/src/utils/generatedTypes.ts`, `frontend/generation/*`, `frontend/plugin-sdk/app-subsystem/src/generatedTypes.ts`.
- Defaults, moved flows, relocated logic: `SingleConfig` now has generic `pluginData`, defaulting to `{}`. `SingleConfig.pluginData` contains per-project plugin payloads keyed by plugin ID, not a Watch Code-specific default. There is no default `pluginData["setta-watch-code"]`; the plugin frontend supplies local false/empty defaults when its data is missing.
- Reviewer guardrail: Do not re-add top-level Watch Code project fields, generated Watch Code defaults, a specialized `WatchCodePluginProjectData` type in generic downstream contracts, or migration/dual-read behavior from the old fields.

### Plugin-Owned Watch Code HTTP Routes Via Local-Core Commands

- What changed: Core HTTP endpoints `/setWatchCodeEnabled` and `/setWatchCodeInputs` are removed from the public OpenAPI surface. The first-party plugin backend now registers `POST /plugins/<pluginId>/watch-code/enabled` and `POST /plugins/<pluginId>/watch-code/inputs`, and calls narrow Go local-core commands.
- Why this appears intentional: The route constants, request types, handlers, frontend action wrappers, generated SDK operations, and OpenAPI entries for the core routes are deleted. New local-core command constants and handlers are generated/exported for plugin backend use.
- Files/endpoints/components involved: removed from `internal/httpapi/project_routes.go`, `internal/httpapi/discovered_routes_gen.go`, `frontend/src/openapi/http/generated/sdk.gen.ts`, `frontend/src/openapi/http/generated/types.gen.ts`, `frontend/src/state/actions/project/watchCode.ts`; added in `internal/pythonsdklocalcore/watch_code_local_core.go`, `internal/pythonsdklocalcore/local_core.go`, `internal/pythonsharedconstants/generator.go`, `backend/setta/plugin_runtime/watch_code.py`, `backend/setta/types/generated/go_shared_constants.py`, `plugins/setta-watch-code/backend/main.py`.
- Defaults, moved flows, relocated logic: Local-core commands are `watch_code_get_project_data`, `watch_code_set_enabled`, `watch_code_set_inputs`, `watch_code_read_setting`, and `watch_code_write_setting`. Payloads require `settaFilesRoot`, `pluginId`, `projectConfigId`, and for mutations `workspaceRoot`.
- Reviewer guardrail: Do not reintroduce `/setWatchCodeEnabled`, `/setWatchCodeInputs`, or frontend OpenAPI callers for them. Watch Code mutation should remain plugin-route to plugin-backend to local-core.

### Plugin-Owned Watch Code UI Settings And Reveal

- What changed: Core UI settings `core.watch_code.enabled`, `core.watch_code.folders`, and `core.watch_code.files` are removed. The plugin backend registers backend-owned settings with local IDs `enabled`, `folders`, and `files`, exposed as canonical setting IDs `plugin::<providerPluginId>::enabled`, `plugin::<providerPluginId>::folders`, and `plugin::<providerPluginId>::files`.
- Why this appears intentional: `internal/uisettings/core.go` removes the Watch Code core entries, `plugins/setta-watch-code/backend/main.py` registers backend UI settings, and frontend/MCP tests update to plugin IDs with no aliases.
- Files/endpoints/components involved: `internal/uisettings/core.go`, `internal/uisettings/plugins.go`, `internal/uisettings/registry.go`, `internal/uisettings/types.go`, `internal/mcpx/ui_setting_tools.go`, `internal/mcpx/server.go`, `plugins/setta-watch-code/backend/main.py`, `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`, `frontend/src/state/actions/uiSettingReveal.ts`.
- Defaults, moved flows, relocated logic: Watch Code reveal is now a plugin reveal handler keyed by `watch-code-settings`; it can run without a plugin pane tab. The old `watchCodePortalOpen` local-storage flow is removed.
- Reviewer guardrail: Do not add aliases from `core.watch_code.*` to plugin settings. Generic UI-setting tools should operate on `plugin::<provider>::*` IDs.

### Generic Plugin Canvas Controls

- What changed: The React Flow controls rail no longer hardcodes Watch Code. Plugins can now register canvas controls with placements `project`, `viewport`, or `utility`; the Watch Code plugin contributes the radar control through this generic API.
- Why this appears intentional: Plugin manifest schema, runtime host APIs, docs, and React Flow controls were all extended for `registerCanvasControl`, while the old core `WatchCodeToggleButton` and `WatchCodePane` are deleted.
- Files/endpoints/components involved: `frontend/src/plugins/runtimeInternal.ts`, `frontend/src/plugins/runtimeShared.ts`, `frontend/src/plugins/runtime.ts`, `frontend/src/forks/xyflow/controls/Controls.tsx`, `frontend/plugin-sdk/app-subsystem/types/index.d.ts`, `docs/guides/plugin-authoring-golden-path.md`, deleted `frontend/src/components/AppHeader/WatchCodeToggleButton.tsx`, deleted `frontend/src/components/Panes/Overview/WatchCode/WatchCodePane.tsx`.
- Defaults, moved flows, relocated logic: Controls sort by placement, `order`, label, plugin ID, and control ID. The first-party Watch Code control registers with placement `project` and order `20`.
- Reviewer guardrail: Keep canvas controls generic. Do not add Watch Code-specific rendering branches back to `Controls.tsx`.

### Plugin Frontend Host Can Read Plugin Data And Call Plugin Routes

- What changed: Plugin frontends can select `readProjectState({ kind: "pluginData", pluginId })`, subscribe to the same selector, and call `fetchBackendRoute(path, init)`. Watch Code uses these generic APIs instead of Watch Code-specific host methods.
- Why this appears intentional: Runtime host code validates these APIs and tests cover route normalization, capability checks, and Watch Code route calls through `fetchBackendRoute`.
- Files/endpoints/components involved: `frontend/src/plugins/runtimeInternal.ts`, `frontend/src/plugins/runtimeShared.ts`, `frontend/src/plugins/runtime.ts`, `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`, `plugins/setta-watch-code/frontend/tests/register.test.ts`.
- Defaults, moved flows, relocated logic: `fetchBackendRoute("/watch-code/enabled")` resolves to `/plugins/<pluginId>/watch-code/enabled`, includes share-session headers, uses `credentials: "include"` by default, requires a single leading slash, rejects dot segments, and validates percent encoding.
- Reviewer guardrail: Do not restore Watch Code-specific host APIs such as `setWatchCodeEnabled`, `setWatchCodeInputs`, or `mutateWatchCodeSettings`; use the generic route and plugin-data APIs.

### App-Subsystem Frontend SDK Is The Shared Frontend Utility Surface

- What changed: Many frontend utility helpers previously lived under `frontend/src/utils` or as one-line local wrappers around plugin SDK internals. The branch moves the intended shared surface into `@setta/app-subsystem-frontend-sdk` and updates frontend code to import from that package.
- Why this appears intentional: Numerous local utility files are deleted, SDK `helpers.ts`, `openapi.ts`, generated types, and `types/index.d.ts` gain exports, and guardrail tests update around the published SDK boundary.
- Files/endpoints/components involved: `frontend/plugin-sdk/app-subsystem/src/helpers.ts`, `frontend/plugin-sdk/app-subsystem/src/openapi.ts`, `frontend/plugin-sdk/app-subsystem/src/bindingRuntime.ts`, `frontend/plugin-sdk/app-subsystem/src/serverModeBoundaryPolicy.ts`, `frontend/plugin-sdk/app-subsystem/types/index.d.ts`, deleted `frontend/src/utils/{attachmentPolicy,attachments,bindingRuntime,c_addresses,deploymentPolicies,dropzone,endpointUtils,hostnames,idNameCreation,launcherOrigin,origin,runCapabilities,serverModeBoundaryPolicy,serverModeCapabilities,storage,textBlockTypography}.ts`, deleted `frontend/src/openapi/http/{requestRebuild,result}.ts`.
- Defaults, moved flows, relocated logic: The frontend app now imports `callOpenAPI`, `res200`, `getErrorDetail`, run-capability helpers, ID helpers, attachment helpers, storage helpers, server-mode boundary policy, and text typography helpers from `@setta/app-subsystem-frontend-sdk`.
- Reviewer guardrail: Do not recreate local mirror wrappers in `frontend/src/utils` when the SDK already exports the surface. Extend the SDK source first.

## Bug Fixes

### Provider Unavailability No Longer Leaves Watch Code Running Or Mutating

- What changed: Previously Watch Code could run as a core IDE service as long as project state had Watch Code settings. Now no provider means no service startup, no file watcher config, no bound-section Watch Code application, no backend routes, and no plugin UI settings.
- Why this appears intentional: New tests explicitly cover startup without a provider, provider disable, provider uninstall, pending restart, invalid provider, conflict, and removed core routes.
- Files/endpoints/components involved: `internal/app/app.go`, `internal/app/code_updates.go`, `internal/app/plugin_backend_runtime_refresh.go`, `internal/app/app_test.go`, `internal/plugins/runtime_test.go`, `internal/httpapi/project_routes_test.go`.
- Defaults, moved flows, relocated logic: Existing plugin data is preserved when the service stops or the provider disappears.
- Reviewer guardrail: Do not add fallback behavior that continues to process Watch Code from stored data when provider selection is not active.

### Watch Code LSP Dependency Is Provider-Agnostic

- What changed: Watch Code now derives its Python language-server dependency status from active Python language-server selection instead of depending on a particular first-party language-server plugin. Missing, disabled, or pending-restart Python LSP states are reported as dependency status, but settings writes are still allowed.
- Why this appears intentional: `PluginWatchCodeLanguageServerDependencyStatus` is added to the runtime payload and `applyWatchCodeLanguageServerDependencyStatus` maps language-server selection states into Watch Code dependency states.
- Files/endpoints/components involved: `internal/app/watch_code_language_server_dependency.go`, `internal/app/plugin_backend_runtime_refresh.go`, `internal/plugins/runtime.go`, generated OpenAPI/types under `frontend/src/openapi/http/generated`, `frontend/plugin-sdk/app-subsystem`.
- Defaults, moved flows, relocated logic: Dependency statuses include `unavailable`, `not_required`, `active`, `missing`, `disabled`, and `pending_restart`.
- Reviewer guardrail: Do not special-case `setta-basedpyright` as the Watch Code dependency. Keep the dependency language-based and provider-agnostic.

### Watch Code Registry, Diagnostics, And Callable Sync Use Provider Plugin Data

- What changed: Bound-code updates, file-create/delete callbacks, callable selection, section variant deletion, generated diagnostics mapping, and notification tracking no longer read or mutate Watch Code registry/baseline fields on `Project`. They receive the active provider plugin ID and operate on provider plugin data when a provider is active.
- Why this appears intentional: The projectstate APIs now require provider plugin IDs or `WatchCodePluginProjectData` for Watch Code paths, and tests assert provider-keyed behavior.
- Files/endpoints/components involved: `internal/projectstate/watch_code_apply.go`, `internal/projectstate/watch_code_bound_sections.go`, `internal/projectstate/watch_code_callable_sections.go`, `internal/projectstate/callable.go`, `internal/projectstate/section_variant_deletion.go`, `internal/lsp/project_synchronizer.go`, `internal/app/watch_code_notifications.go`, `internal/app/code_updates.go`.
- Defaults, moved flows, relocated logic: Generic `Project.SetCallable` still works without Watch Code data; the runtime path with an active provider uses `SetCallableForWatchCodeProvider` to keep plugin registry membership in sync.
- Reviewer guardrail: Do not make generic callable or section operations recreate a core Watch Code registry. Provider-aware registry sync should remain conditional on an active provider.

### Backend UI Settings Work Without Pane Registration

- What changed: Backend-registered plugin UI settings can be exposed by `registerUISettings` without requiring `registerPane`. Schema-defined UI settings still require `registerPane`.
- Why this appears intentional: The UI-settings registry was split to load schema-defined settings only with pane capability and backend settings only with UI-settings capability. Tests assert backend-only settings are included and schema settings are omitted without `registerPane`.
- Files/endpoints/components involved: `internal/uisettings/plugins.go`, `internal/uisettings/registry.go`, `internal/uisettings/plugins_runtime_entry_test.go`, `internal/plugins/discovery.go`, `internal/plugins/backend_probe.go`, `backend/setta/plugins/schemas/setta.plugin.schema.json`.
- Defaults, moved flows, relocated logic: Plugin unavailable messages now say `registerPane or registerUISettings capability not effective`.
- Reviewer guardrail: Do not make backend UI settings depend on a pane tab. Watch Code relies on backend UI settings plus a pane-less plugin reveal handler.

### App-Subsystem SDK Validation And Build Boundary Regressions Are Fixed

- What changed: The published app-subsystem SDK now exposes the frontend helpers that app code and standalone plugins need, and `validateGeneratedParamNameInput` no longer depends on consumers passing an internal `isPythonIdentifier` callback. Keyword validation remains a distinct error from invalid identifier syntax.
- Why this appears intentional: `frontend/plugin-sdk/app-subsystem/typecheck/standalone.ts` imports and typechecks the published validation helpers; tests cover the SDK signature and Python keyword message.
- Files/endpoints/components involved: `frontend/plugin-sdk/app-subsystem/src/bindingRuntime.ts`, `frontend/plugin-sdk/app-subsystem/src/helpers.ts`, `frontend/plugin-sdk/app-subsystem/types/index.d.ts`, `frontend/src/utils/nameValidation.ts`, `frontend/src/utils/bindingRuntime.test.ts`.
- Defaults, moved flows, relocated logic: The validation options now include `label`, `pythonIdentifierStartChars`, `pythonIdentifierContinueChars`, and `pythonKeywords`; callers get label-specific messages such as `Param name cannot be a Python keyword.`
- Reviewer guardrail: Do not move this validation back to local frontend-only helpers or reintroduce a private callback-based SDK signature.

### Python Plugin Runtime Local-Core Surface Is Narrower

- What changed: `setta.plugin_runtime.local_core` is deleted as a generic plugin-runtime export. App-subsystem listener handling now uses `setta.local_core_client.run_local_core_command_once`, while Watch Code exposes narrow `setta.plugin_runtime.watch_code_*` helpers for its specific local-core commands.
- Why this appears intentional: The package root now exports Watch Code-specific helpers and constants, tests assert source-only typed helpers stay out of the packaged local-core client boundary, and Watch Code helper tests verify command names come from Go-owned generated constants.
- Files/endpoints/components involved: deleted `backend/setta/plugin_runtime/local_core.py`, `backend/setta/plugin_runtime/__init__.py`, `backend/setta/plugin_runtime/app_subsystem.py`, `backend/setta/plugin_runtime/watch_code.py`, `tests/plugin_runtime/test_local_core.py`, `tests/plugin_runtime/test_watch_code_plugin_backend.py`.
- Defaults, moved flows, relocated logic: Generic one-shot local-core dispatch belongs to `setta.local_core_client`; plugin-facing Watch Code operations are exported as `watch_code_get_project_data`, `watch_code_set_enabled`, `watch_code_set_inputs`, `watch_code_read_setting`, and `watch_code_write_setting`.
- Reviewer guardrail: Do not restore `setta.plugin_runtime.local_core` as a broad compatibility shim. Add narrow helper APIs for plugin-owned commands when needed.

### First-Party Plugin Packaging No Longer Requires Checked-In Frontend Dist Output

- What changed: The JSON Render app-subsystem plugin and new Watch Code plugin build frontend dist assets during wheel/source builds instead of relying on tracked generated dist files. The checked-in vendored SDK `dist/index.js` for JSON Render is removed and materialized from the canonical SDK source when needed.
- Why this appears intentional: Build backends and package scripts explicitly materialize required assets, tests assert dist is not tracked, and package tests build/install wheels from staged source trees.
- Files/endpoints/components involved: `plugins/setta-json-render-app-gen/build_backend.py`, `plugins/setta-json-render-app-gen/frontend/scripts/materialize-vendored-app-subsystem-sdk.mjs`, `plugins/setta-json-render-app-gen/frontend/package.json`, `plugins/setta-json-render-app-gen/MANIFEST.in`, `plugins/setta-watch-code/build_backend.py`, `plugins/setta-watch-code/pyproject.toml`, `tests/start/test_packaged_distribution.py`.
- Defaults, moved flows, relocated logic: `plugins/setta-json-render-app-gen/frontend/vendor/app-subsystem-frontend-sdk/dist/**` and `plugins/setta-watch-code/frontend/dist/**` should not be checked into git. Builds may use `SETTA_APP_SUBSYSTEM_FRONTEND_SDK_SOURCE_ROOT` to locate the canonical SDK source.
- Reviewer guardrail: Do not recommit generated frontend dist bundles to make packaging pass. Fix the materialization/build path instead.

## Intentional Behavior Changes To Preserve

### No Watch Code Compatibility Shims

- What changed: The branch intentionally deletes old Watch Code route names, host methods, MCP tool names, core setting IDs, and top-level project fields instead of supporting both old and new surfaces.
- Why this appears intentional: The extraction plan has a "No Compatibility Rule", and tests assert absence of old routes/tools/fields.
- Files/endpoints/components involved: deleted core routes in `internal/httpapi/project_routes.go`, deleted frontend action `frontend/src/state/actions/project/watchCode.ts`, removed OpenAPI operations in `frontend/src/openapi/http/generated/*`, removed core UI settings in `internal/uisettings/core.go`, removed MCP handlers in `internal/mcpx/server.go`.
- Defaults, moved flows, relocated logic: Old `/setWatchCode*`, `core.watch_code.*`, and `set_watch_code_*` surfaces are gone.
- Reviewer guardrail: Do not add aliases, fallback reads, fallback writes, migrations, or dual paths unless explicitly requested as compatibility work.

### Canonical Watch Code Setting IDs Changed

- What changed: Setting IDs moved from `core.watch_code.enabled`, `core.watch_code.folders`, and `core.watch_code.files` to `plugin::<providerPluginId>::enabled`, `plugin::<providerPluginId>::folders`, and `plugin::<providerPluginId>::files`.
- Why this appears intentional: Backend registrations, UI reveal tests, MCP UI-setting tests, docs, and the plugin frontend all use plugin-scoped IDs.
- Files/endpoints/components involved: `plugins/setta-watch-code/backend/main.py`, `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`, `internal/projectstate/watch_code_plugin_data.go`, `internal/mcpx/ui_setting_tools_test.go`, `frontend/src/state/actions/uiSettingReveal.test.ts`, `frontend/tests/e2e/overview/layout/watch-code-pane.spec.ts`.
- Defaults, moved flows, relocated logic: The plugin frontend builds IDs with `host.pluginId`, so provider replacement changes the setting namespace.
- Reviewer guardrail: Do not hard-code `plugin::setta-watch-code::*` in host runtime code or restore `core.watch_code.*` aliases.

### Watch Code UI Flow Moved Out Of Overview/Core React

- What changed: Watch Code no longer has a core Overview pane or core `WatchCodePane` component. The first screen entry is a plugin-contributed canvas control that opens a plugin-owned floating settings panel.
- Why this appears intentional: Core components/tests were deleted and plugin frontend owns rendering, mutation, local defaults, route calls, and reveal highlighting.
- Files/endpoints/components involved: deleted `frontend/src/components/Panes/Overview/WatchCode/WatchCodePane.tsx`, deleted `frontend/src/components/AppHeader/WatchCodeToggleButton.tsx`, `frontend/src/forks/xyflow/controls/Controls.tsx`, `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`, `plugins/setta-watch-code/frontend/src/styles.css`.
- Defaults, moved flows, relocated logic: The old session-local `watchCodePortalOpen` state is removed; the plugin opens/closes its own portal imperatively and handles Escape, outside click, resize, scroll, mobile width, and setting reveal highlighting.
- Reviewer guardrail: Do not re-add a core Overview tab or local-storage-driven Watch Code portal state.

### Plugin Data Is Preserved Across Provider Unavailability

- What changed: Disabling, uninstalling, invalidating, or losing the provider stops Watch Code surfaces but does not delete `Document.PluginData[providerPluginID]`.
- Why this appears intentional: App tests explicitly assert data remains after provider disable/uninstall, and `setWatchCodePluginData` only deletes empty project data when the mutation itself produces emptiness.
- Files/endpoints/components involved: `internal/app/app_test.go`, `internal/projectstate/watch_code_plugin_data.go`, `internal/app/plugin_backend_runtime_refresh.go`, `internal/plugins/runtime.go`.
- Defaults, moved flows, relocated logic: Stored state is keyed by provider plugin ID; data is not copied between plugin IDs and not migrated from old fields.
- Reviewer guardrail: Do not clean up Watch Code plugin data as part of plugin disable/uninstall/runtime unavailability unless a new explicit data-deletion feature is added.

### Provider Fail-Closed Status Is Product Behavior

- What changed: Multiple active Watch Code providers, pending-restart providers, invalid providers, and disabled providers all make Watch Code unavailable instead of picking one implicitly.
- Why this appears intentional: Runtime selection tracks active, disabled, invalid, pending-restart, and conflicting plugin IDs and tests assert the resulting unavailable capability state.
- Files/endpoints/components involved: `internal/plugins/runtime.go`, `internal/plugins/status.go`, `internal/app/watch_code_capabilities.go`, `internal/plugins/runtime_test.go`.
- Defaults, moved flows, relocated logic: `ProviderActive()` requires `PluginEnabled`, `Python`, and a non-empty selected plugin ID.
- Reviewer guardrail: Do not add tie-breakers or silent fallbacks for conflicts, pending restarts, or invalid providers.

### Generic Plugin UI Settings Are Capability-Gated

- What changed: Backend UI settings are only applied for plugins with effective `registerUISettings`, while schema/config UI settings remain tied to `registerPane`.
- Why this appears intentional: `applyBackendProbeRegistrations` only copies backend UI settings when `registerUISettings` is effective, and the registry separately decides which contribution sources to load.
- Files/endpoints/components involved: `internal/plugins/discovery.go`, `internal/plugins/backend_probe.go`, `internal/uisettings/plugins.go`, `backend/setta/plugins/schemas/setta.plugin.schema.json`, docs in `docs/guides/plugin-authoring-golden-path.md`.
- Defaults, moved flows, relocated logic: `registerUISettings` now makes backend probe required.
- Reviewer guardrail: Do not allow backend UI settings to leak from plugins that did not get `registerUISettings`, and do not require pane registration for backend-only settings.

### Shared Frontend Helpers Should Stay SDK-Owned

- What changed: Frontend app code now depends on the app-subsystem SDK for helpers that standalone plugins also need, including OpenAPI result handling, request rebuild, run capability checks, generated-name validation, server-mode boundaries, storage, host/origin helpers, attachment policies, text block typography, and ID creation.
- Why this appears intentional: Deleted local wrappers and broad import rewrites eliminate duplicated helper surfaces; the SDK type declaration file exports the same public API for packaged plugin builds.
- Files/endpoints/components involved: `frontend/plugin-sdk/app-subsystem/src/*`, `frontend/plugin-sdk/app-subsystem/types/index.d.ts`, `frontend/src/**/*.ts(x)` imports from `@setta/app-subsystem-frontend-sdk`, deleted local utility wrapper files under `frontend/src/utils`.
- Defaults, moved flows, relocated logic: Standalone plugin builds consume the vendored/package SDK surface, not repo-root frontend internals.
- Reviewer guardrail: When a helper is missing, add it to the SDK/generator owner. Do not create new local mirrors under `frontend/src/utils` for shared SDK behavior.

### Generated Contract Changes Are Intentional Outputs

- What changed: OpenAPI and non-HTTP generated outputs remove core Watch Code route/types, add generic `pluginData`, add Watch Code provider capability/status types, and update app-subsystem SDK generated declarations.
- Why this appears intentional: The generated outputs line up with Go owner changes and plugin SDK changes, and the branch updates generator code where needed instead of handwritten downstream declarations.
- Files/endpoints/components involved: `frontend/generation/http_openapi/openapi.json`, `frontend/generation/non_http_shared/*`, `frontend/src/openapi/http/generated/*`, `frontend/src/openapi/non_http/generated/types.gen.ts`, `frontend/plugin-sdk/app-subsystem/generation/http_openapi/openapi.json`, `frontend/plugin-sdk/app-subsystem/src/openapi/http/generated/types.gen.ts`, `backend/setta/types/generated/*`, `internal/frontendbindings/*`, `cmd/setta-gen-http-openapi/main.go`.
- Defaults, moved flows, relocated logic: `ProjectviewSingleConfig.pluginData` is now part of generated contracts; `ProjectviewProjectConfig` no longer exposes Watch Code fields.
- Reviewer guardrail: Do not hand-edit generated artifacts to restore old Watch Code types/routes. Change Go owners/generators and regenerate.
