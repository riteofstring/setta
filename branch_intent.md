# Branch Intent Summary

Compared against `go-rewrite` from merge base
`1ceabb04bf09257d8bff9a5c3c193ac8c0770f4b` using:

- `git diff --name-status go-rewrite...HEAD`
- `git diff $(git merge-base go-rewrite HEAD)..HEAD`

The branch intent is to extract Watch Code from core host UI into a
first-party plugin package while keeping Go as the owner of Watch Code runtime
behavior, validation, storage contracts, HTTP route shapes, and generated
downstream surfaces.

## Features

### 1. Watch Code is now a first-party plugin provider

- What changed: before this branch, Watch Code behaved as a core IDE feature
  with host-owned UI and always-registered core settings. After this branch,
  Watch Code is provided by the enabled-by-default `setta-watch-code` plugin.
  The plugin declares `featureCapabilities.watchCode` with `python`,
  `requiresLanguageServer`, and `canvasControlsUi`, plus explicit host
  capabilities for canvas controls, setting reveal handlers, project-state
  reads/subscriptions, and Watch Code setting mutation.
- Why this appears intentional: the new
  `docs/plans/watch-code-plugin-extraction-plan.md`, `README.md`, and
  `plugins/setta-watch-code/README.md` all state that Watch Code is a
  first-party plugin gate while Go remains the correctness owner.
- Files/endpoints/components involved:
  - `plugins/setta-watch-code/setta.plugin.json`
  - `plugins/setta-watch-code/pyproject.toml`
  - `plugins/setta-watch-code/build_backend.py`
  - `plugins/setta-watch-code/frontend/*`
  - `pyproject.toml`
  - `uv.lock`
  - `README.md`
- Default-value changes, moved/renamed flows, or relocated logic:
  - `setta-watch-code==0.1.0` is added to the top-level `defaults` extra.
  - The plugin manifest has `"enabledByDefault": true`, preserving the normal
    source-checkout/default install experience while still allowing Watch Code
    to be disabled by disabling or removing the plugin.
  - The plugin frontend points at `frontend/dist/index.js` and
    `frontend/dist/setta-watch-code-frontend.css`, but those dist files are
    build/package artifacts and are not tracked.
- Reviewer guardrail: do not "fix" Watch Code back into core availability.
  The plugin package and defaults dependency are intentional. Disabling or
  uninstalling `setta-watch-code` must make the feature unavailable.

### 2. Watch Code provider selection is explicit and fail-closed

- What changed: before, there was no Watch Code provider selection state. After
  this branch, plugin runtime responses expose
  `featureCapabilities.watchCode` and plugin status exposes
  `watchCodeSelection`. Selection states include `no_provider`,
  `disabled_provider`, `invalid_provider`, `provider_conflict`, and `active`.
  A provider without Python support is invalid, and multiple active providers
  conflict instead of being chosen implicitly.
- Why this appears intentional: new runtime tests cover missing, disabled,
  invalid, conflicting, and first-party provider cases.
- Files/endpoints/components involved:
  - `internal/plugins/runtime.go`
  - `internal/plugins/status.go`
  - `internal/plugins/types.go`
  - `internal/plugins/capability_resolution.go`
  - `internal/plugins/runtime_snapshot_view.go`
  - `backend/setta/plugins/schemas/setta.plugin.schema.json`
  - `internal/plugins/runtime_test.go`
  - `internal/plugins/manifest_schema_test.go`
- Default-value changes, moved/renamed flows, or relocated logic:
  - New manifest capabilities include `registerCanvasControl`,
    `registerSettingRevealHandler`, and `mutateWatchCodeSettings`.
  - Runtime default without a provider is an unavailable Watch Code capability,
    not an enabled core feature.
- Reviewer guardrail: preserve fail-closed provider selection. Do not add a
  hard-coded plugin ID shortcut or silently pick one provider when there is a
  conflict.

### 3. Go-owned Watch Code runtime is gated by provider availability

- What changed: before, IDE startup and code-update paths assumed Watch Code
  behavior was core-available. After this branch, the app initializes Watch Code
  service configs only when the selected Watch Code provider is active, and
  code updates/reloads skip Watch Code registry mutation and LSP sync when no
  provider is active.
- Why this appears intentional: tests were changed to install an explicit
  provider fixture for positive Watch Code behavior, and new negative tests
  verify that missing providers leave Watch Code state inert.
- Files/endpoints/components involved:
  - `internal/app/app.go`
  - `internal/app/app_generation_modes.go`
  - `internal/app/watch_code_capabilities.go`
  - `internal/app/code_updates.go`
  - `internal/app/plugin_backend_runtime_refresh.go`
  - `internal/app/app_test.go`
  - `internal/app/code_updates_test.go`
  - `internal/app/plugin_backend_runtime_refresh_test.go`
  - `internal/app/websocket_test.go`
- Default-value changes, moved/renamed flows, or relocated logic:
  - `watchCodeCapabilityState` now tracks selected provider capabilities.
  - Plugin runtime refresh updates and rolls back Watch Code capabilities along
    with app-subsystem capabilities when handler refresh fails.
- Reviewer guardrail: do not let code-edit or bound-code reload paths apply
  Watch Code registry/baseline mutations unless `PluginEnabled && Python` is
  true for the active provider.

### 4. Watch Code HTTP routes were extracted but kept on the same paths

- What changed: before, `/setWatchCodeEnabled` and `/setWatchCodeInputs` lived
  in the large project route file. After this branch, handlers live in
  `internal/watchcodehttp` and are registered through
  `internal/httpapi/watch_code_routes.go` as a frontend API contribution.
  The route paths and operation IDs stay the same.
- Why this appears intentional: the extraction plan explicitly calls for
  moving these routes out of `project_routes.go` while continuing to use the
  standard OpenAPI-generated frontend client.
- Files/endpoints/components involved:
  - `internal/watchcodehttp/routes.go`
  - `internal/httpapi/watch_code_routes.go`
  - `internal/httpapi/project_routes.go`
  - `internal/httpapi/project_routes_test.go`
  - `internal/httpapi/frontend_route_registrations_test.go`
  - Endpoints: `/setWatchCodeEnabled`, `/setWatchCodeInputs`
- Default-value changes, moved/renamed flows, or relocated logic:
  - OpenAPI request schemas moved from `HttpapiSetWatchCode*Request` to
    `WatchcodehttpSetWatchCode*Request`.
  - The routes now return HTTP `409` with code `feature_unavailable` when no
    active Watch Code provider is selected.
- Reviewer guardrail: preserve the route paths and OpenAPI-generated client
  usage, but do not move the handlers back into `project_routes.go` or allow
  route mutations when the provider is unavailable.

### 5. Watch Code UI settings are plugin-owned

- What changed: before, Watch Code settings were core settings named
  `core.watch_code.enabled`, `core.watch_code.folders`, and
  `core.watch_code.files`. After this branch, they are plugin settings named
  `plugin::setta-watch-code::enabled`,
  `plugin::setta-watch-code::folders`, and
  `plugin::setta-watch-code::files`.
- Why this appears intentional: the new `internal/watchcodeuisettings` package
  builds settings only from active Watch Code capabilities, and tests assert
  plugin source metadata, plugin search results, and absence from core search.
- Files/endpoints/components involved:
  - `internal/watchcodeuisettings/entries.go`
  - `internal/watchcodeuisettings/entries_test.go`
  - `internal/uisettings/core.go`
  - `internal/uisettings/plugins.go`
  - `internal/uisettings/registry.go`
  - `internal/mcpx/ui_setting_tools.go`
  - `internal/app/mcp_ui_settings_test.go`
  - `frontend/tests/e2e/overview/misc/core-ui-settings-tools.spec.ts`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Watch Code settings moved out of `NewCoreRegistry`.
  - Setting metadata is `source=plugin`, `pluginId=<provider plugin id>`,
    `strategy=plugin_handler`, and `pluginRevealKey=watch-code-settings`.
  - Missing provider hides settings from search and reports
    `plugin_unavailable` for direct reads/writes/reveals through the
    unavailable-setting provider path.
- Reviewer guardrail: do not re-add `core.watch_code.*` entries or aliases.
  Follow-up reviews should update callers to the plugin IDs rather than
  restoring core IDs.

### 6. Watch Code state moved to document plugin data

- What changed: before, Watch Code state was persisted and surfaced as
  top-level project/project-config fields (`watchCodeEnabled`,
  `watchCodeFolders`, `watchCodeFiles`, `watchCodeRegistry`,
  `watchCodeBaselineByPath`). After this branch, the persisted shape is
  `Document.PluginData["setta-watch-code"]` with schema version `1` and a
  per-project payload containing `enabled`, `folders`, `files`, `registry`, and
  `baselineByPath`. Runtime Go structs still expose internal fields, but they
  are `json:"-"` and are hydrated from plugin data.
- Why this appears intentional: docs/reference/watch-code.md documents the new
  shape, tests assert that legacy top-level fields are ignored, and generated
  Python/TypeScript surfaces remove `ProjectConfig.watchCode*`.
- Files/endpoints/components involved:
  - `internal/projectstate/document.go`
  - `internal/projectstate/watch_code_plugin_data.go`
  - `internal/projectstate/watch_code_test.go`
  - `internal/projectview/single_config.go`
  - `internal/projectview/frontend_defaults.go`
  - `internal/projectview/single_config_test.go`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/utils/generatedTypes.ts`
  - `backend/setta/types/generated/go_shared_types.py`
  - `frontend/src/openapi/*/generated/types.gen.ts`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Frontend default `SingleConfig` now includes
    `pluginData["setta-watch-code"]` with `enabled=false`, empty `folders`,
    empty `files`, empty `registry`, and empty `baselineByPath`.
  - `ProjectConfig` no longer carries Watch Code fields in generated
    frontend/Python contracts.
  - Legacy top-level Watch Code JSON fields are not migrated into plugin data.
- Reviewer guardrail: do not restore top-level `watchCode*` JSON fields, do not
  add dual-write or migration shims, and do not discard existing plugin data
  merely because the provider is inactive.

### 7. The frontend plugin host gained generic canvas controls

- What changed: before, the React Flow controls rail had a hard-coded Watch
  Code radar button and a React-owned Watch Code portal. After this branch,
  plugins can register canvas controls through `registerCanvasControl`, with
  placement values `project`, `viewport`, and `utility`, stable ordering, and
  imperative renderer `mount`/`update`/`unmount` lifecycle hooks.
- Why this appears intentional: plugin authoring docs now describe project
  canvas controls, and frontend runtime tests cover capability gating,
  registration validation, sorting, cleanup, and runtime refresh behavior.
- Files/endpoints/components involved:
  - `frontend/src/plugins/runtime.ts`
  - `frontend/src/plugins/runtimeInternal.ts`
  - `frontend/src/plugins/runtimeShared.ts`
  - `frontend/src/forks/xyflow/controls/Controls.tsx`
  - `frontend/src/plugins/runtime.test.ts`
  - `docs/guides/plugin-authoring-golden-path.md`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Canvas controls sort by placement, `order`, label, plugin ID, and control
    ID.
  - `Controls.tsx` renders plugin controls between existing control groups
    instead of owning Watch Code-specific state.
- Reviewer guardrail: do not reintroduce hard-coded feature buttons into the
  controls rail when a plugin canvas control is the intended extension point.

### 8. The Watch Code frontend moved into the plugin

- What changed: before, `WatchCodeToggleButton.tsx` and `WatchCodePane.tsx`
  were host React components imported by `Controls.tsx`. After this branch,
  the plugin frontend at `plugins/setta-watch-code/frontend/src` registers a
  `watch-code` canvas control, renders the radar button and floating settings
  panel imperatively, subscribes to `pluginData["setta-watch-code"]`, and calls
  host-provided Watch Code mutation methods.
- Why this appears intentional: the old host components and tests are deleted,
  the plugin frontend has its own Vitest coverage, and E2E tests now look for
  plugin-owned setting anchors.
- Files/endpoints/components involved:
  - Deleted:
    `frontend/src/components/AppHeader/WatchCodeToggleButton.tsx`
  - Deleted:
    `frontend/src/components/Panes/Overview/WatchCode/WatchCodePane.tsx`
  - Added:
    `plugins/setta-watch-code/frontend/src/index.ts`
  - Added:
    `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`
  - Added:
    `plugins/setta-watch-code/frontend/src/styles.css`
  - Updated:
    `frontend/src/forks/xyflow/controls/Controls.tsx`
  - Updated:
    `frontend/tests/e2e/overview/layout/watch-code-pane.spec.ts`
- Default-value changes, moved/renamed flows, or relocated logic:
  - The plugin control ID is `watch-code`, placement is `project`, and order is
    `20`.
  - Setting anchors changed from `core.watch_code.*` to
    `plugin::setta-watch-code::*`.
  - The portal remains transient UI state, but it is no longer stored in host
    Zustand local storage as `watchCodePortalOpen`.
- Reviewer guardrail: do not restore host-owned Watch Code React components,
  `watchCodePortalOpen`, or the old core setting anchors.

### 9. Watch Code Python language-server dependency is visible and provider-agnostic

- What changed: before, Watch Code did not expose a dedicated provider-agnostic
  dependency status for Python LSP availability. After this branch, Watch Code
  runtime capabilities include `languageServerDependency` with language,
  required flag, status, message, selected/applied plugin IDs, and
  `restartRequired`.
- Why this appears intentional: new tests cover active Python LSP, missing LSP,
  disabled LSP, and pending-restart LSP. The extraction plan explicitly says
  not to require `setta-basedpyright` specifically.
- Files/endpoints/components involved:
  - `internal/app/watch_code_language_server_dependency.go`
  - `internal/app/plugin_backend_runtime_refresh.go`
  - `internal/plugins/runtime.go`
  - `internal/app/plugin_backend_runtime_refresh_test.go`
  - Generated OpenAPI/non-HTTP shared types in `frontend/generation/*`,
    `frontend/src/openapi/*`, and `backend/setta/types/generated/*`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Status values include `unavailable`, `not_required`, `active`, `missing`,
    `disabled`, and `pending_restart`.
  - Dependency resolution reads the selected language-server runtime status for
    `python`; it does not key on a specific plugin ID.
- Reviewer guardrail: do not hard-code `setta-basedpyright` as the Watch Code
  dependency. Preserve provider-agnostic Python language-server status.

### 10. Generated contracts were updated from Go-owned sources

- What changed: generated OpenAPI and shared frontend/Python contracts now
  include Watch Code provider selection, language-server dependency status,
  plugin-data project state, and the relocated route request types. They remove
  top-level Watch Code fields from `ProjectConfig`.
- Why this appears intentional: generated artifacts changed alongside Go owner
  types and route registration tests. `cmd/setta-gen-http-openapi` now includes
  Watch Code route contributions independently of app-subsystem provider
  discovery.
- Files/endpoints/components involved:
  - `cmd/setta-gen-http-openapi/main.go`
  - `cmd/setta-gen-http-openapi/main_test.go`
  - `frontend/generation/http_openapi/openapi.json`
  - `frontend/generation/non_http_shared/*`
  - `frontend/src/openapi/http/generated/types.gen.ts`
  - `frontend/src/openapi/non_http/generated/types.gen.ts`
  - `frontend/plugin-sdk/app-subsystem/*`
  - `internal/frontendbindings/*_gen.go`
  - `internal/sharedtypes/*_gen.go`
- Default-value changes, moved/renamed flows, or relocated logic:
  - `SingleConfig.pluginData` is a generated required frontend field.
  - `ProjectPluginData` and `WatchCodePluginProjectData` have generated
    frontend defaults.
  - `/setWatchCodeEnabled` and `/setWatchCodeInputs` remain generated HTTP
    routes even though route ownership moved.
- Reviewer guardrail: do not hand-edit generated surfaces or add handwritten
  parallel Watch Code types. Extend the Go-owned source and regenerate instead.

### 11. Plugin package builds materialize frontend artifacts at package time

- What changed: before, there was no Watch Code plugin package. After this
  branch, the Watch Code plugin builds its frontend bundle during wheel/editable
  builds and packages only runtime-managed assets. The JSON Render app plugin
  also stopped tracking the vendored app-subsystem SDK `dist/` bundle and now
  materializes it from the canonical SDK source during prepare/build/sdist
  flows.
- Why this appears intentional: packaging tests assert wheel contents,
  install locations, defaults extras, source builds without preexisting dist,
  and absence of tracked generated dist files.
- Files/endpoints/components involved:
  - `plugins/setta-watch-code/build_backend.py`
  - `plugins/setta-watch-code/MANIFEST.in`
  - `plugins/setta-json-render-app-gen/build_backend.py`
  - `plugins/setta-json-render-app-gen/frontend/scripts/materialize-vendored-app-subsystem-sdk.mjs`
  - `plugins/setta-json-render-app-gen/frontend/package.json`
  - `tests/start/test_packaged_distribution.py`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Watch Code wheel installs under `setta-watch-code/` with
    `setta.plugin.json`, `README.md`, and `frontend/dist/*`.
  - `plugins/setta-watch-code/frontend/dist/**` and
    `plugins/setta-json-render-app-gen/frontend/vendor/app-subsystem-frontend-sdk/dist/**`
    are intentionally untracked.
- Reviewer guardrail: do not check generated plugin frontend bundles back into
  git. Keep package-time materialization and source-build coverage.

## Bug Fixes

### 1. Missing Watch Code provider no longer mutates project state

- What changed: before, Watch Code mutation routes and code-update paths could
  run as core behavior. After this branch, missing/inactive provider paths are
  inert: routes reject with `409 feature_unavailable`, code edits still update
  code content, but they do not sync LSP or mutate Watch Code registry/baseline
  state.
- Why this appears intentional: new tests assert route rejection, inert code
  updates, and unchanged state without a provider.
- Files/endpoints/components involved:
  - `internal/watchcodehttp/routes.go`
  - `internal/httpapi/project_routes_test.go`
  - `internal/app/app_test.go`
  - `internal/app/code_updates.go`
  - `internal/app/code_updates_test.go`
- Default-value changes, moved/renamed flows, or relocated logic:
  - The unavailable provider response code is `feature_unavailable`.
  - Existing plugin data remains readable; the feature simply does not run.
- Reviewer guardrail: do not convert this back to a silent success or a core
  mutation path. Unavailable provider must fail closed.

### 2. Watch Code UI settings now fail as plugin unavailable instead of unknown or core

- What changed: before, Watch Code settings were core entries. After moving
  them to a plugin contribution, direct reads/writes/reveals for
  `plugin::setta-watch-code::*` without an active provider now return a
  structured `plugin_unavailable` error and do not mutate state. Searches hide
  unavailable Watch Code settings.
- Why this appears intentional: `UnavailableSettingProvider` was added to
  scoped UI setting registries and wired through the MCP server.
- Files/endpoints/components involved:
  - `internal/uisettings/plugins.go`
  - `internal/uisettings/registry.go`
  - `internal/watchcodeuisettings/entries.go`
  - `internal/mcpx/ui_setting_tools.go`
  - `internal/app/mcp_ui_settings_test.go`
- Default-value changes, moved/renamed flows, or relocated logic:
  - `NewScopedRegistry` now accepts unavailable setting providers even when
    plugin runtime is absent.
- Reviewer guardrail: preserve the explicit unavailable-setting error path so
  MCP callers get actionable failures instead of stale core IDs or generic
  unknown-setting errors.

### 3. Plugin setting reveals can be handled without a pane tab

- What changed: before, plugin reveal handling assumed a plugin pane tab had to
  exist before a reveal handler could run. After this branch, a
  `plugin_handler` reveal with `paneId=null` and `overviewTabKey=null` can run,
  which is required for canvas-control-owned settings like Watch Code.
- Why this appears intentional: frontend reveal tests add a case for a plugin
  reveal handler that is not backed by a pane tab.
- Files/endpoints/components involved:
  - `frontend/src/state/actions/uiSettingReveal.ts`
  - `frontend/src/state/actions/uiSettingReveal.test.ts`
  - `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Watch Code reveal no longer opens a host Overview tab or host portal.
  - The plugin reveal handler opens the plugin popover and highlights the
    plugin-owned setting anchor.
- Reviewer guardrail: do not restore pane-tab requirements for all plugin
  reveal handlers. Canvas-control settings must stay revealable without a pane.

### 4. Frontend project-state comparison now includes plugin data

- What changed: before, frontend state comparison did not include
  `pluginData`, which could cause plugin-data-only project updates to be
  treated as non-substantive. After this branch, `pluginData` participates in
  `getComparableProjectState`.
- Why this appears intentional: optimistic rollback tests were updated to place
  Watch Code enabled state under plugin data and assert that it survives
  unrelated view-mode/window-space changes.
- Files/endpoints/components involved:
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/viewModes.test.ts`
  - `frontend/src/state/actions/windowSpaces.test.ts`
  - `frontend/src/state/actions/websocketReceive.test.ts`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Watch Code updates now arrive through `SingleConfig.pluginData` rather than
    `projectConfig.watchCode*`.
- Reviewer guardrail: keep `pluginData` in comparable project-state snapshots.
  Removing it can drop Watch Code and future plugin-owned state updates.

### 5. OpenAPI generation keeps Watch Code routes even without app-subsystem providers

- What changed: before, the OpenAPI generator route contribution path was
  app-subsystem-focused. After this branch, Watch Code route contributions are
  included even when no app-subsystem provider capabilities are merged.
- Why this appears intentional: `cmd/setta-gen-http-openapi/main_test.go` adds
  coverage that `/setWatchCodeEnabled` and `/setWatchCodeInputs` appear in the
  generated document.
- Files/endpoints/components involved:
  - `cmd/setta-gen-http-openapi/main.go`
  - `cmd/setta-gen-http-openapi/main_test.go`
  - `frontend/generation/http_openapi/openapi.json`
- Default-value changes, moved/renamed flows, or relocated logic:
  - The generator function was generalized from app-subsystem-only route
    registrations to all frontend route contributions needed for the document.
- Reviewer guardrail: do not make Watch Code OpenAPI generation depend on
  app-subsystem provider discovery.

### 6. First-party plugin source/package builds no longer rely on checked-in generated bundles

- What changed: before, the JSON Render app plugin carried a checked-in
  vendored SDK `dist/index.js`. After this branch, build scripts materialize
  the SDK dist from `frontend/plugin-sdk/app-subsystem`, and Watch Code follows
  the same runtime-managed artifact principle for its frontend dist.
- Why this appears intentional: tests assert staged source trees can rebuild,
  sdists include source/build inputs, wheels contain runtime assets, and git
  does not track generated dist outputs.
- Files/endpoints/components involved:
  - `plugins/setta-json-render-app-gen/frontend/scripts/materialize-vendored-app-subsystem-sdk.mjs`
  - `plugins/setta-json-render-app-gen/build_backend.py`
  - `plugins/setta-json-render-app-gen/frontend/package.json`
  - `plugins/setta-watch-code/build_backend.py`
  - `tests/start/test_packaged_distribution.py`
- Default-value changes, moved/renamed flows, or relocated logic:
  - `prepare-sdk` and `prepare-build-deps` were added to the JSON Render plugin
    frontend package scripts.
  - `plugins/setta-json-render-app-gen/frontend/vendor/app-subsystem-frontend-sdk/dist/index.js`
    is deleted from git.
- Reviewer guardrail: do not restore checked-in generated dist just to satisfy
  local builds. Fix package/source build inputs instead.

## Intentional Behavior Changes To Preserve

### 1. Watch Code state belongs under `pluginData["setta-watch-code"]`

- What changed: top-level project/project-config Watch Code fields were removed
  from JSON and generated public contracts. The Go runtime still uses internal
  fields for implementation, but persistence and frontend state are plugin
  data.
- Why this appears intentional: the extraction plan explicitly rejects legacy
  migrations, dual writes, and compatibility readers. Tests assert legacy fields
  are ignored and absent from generated frontend JSON.
- Files/endpoints/components involved:
  - `internal/projectstate/watch_code_plugin_data.go`
  - `internal/projectstate/document.go`
  - `internal/projectview/single_config.go`
  - `frontend/src/utils/generatedTypes.ts`
  - `backend/setta/types/generated/go_shared_types.py`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Default frontend plugin data for `setta-watch-code` is always present with
    disabled/empty values.
- Reviewer guardrail: do not add compatibility shims for old
  `watchCodeEnabled`, `watchCodeFolders`, `watchCodeFiles`,
  `watchCodeRegistry`, or `watchCodeBaselineByPath` fields.

### 2. The canonical Watch Code setting IDs are plugin IDs

- What changed: canonical setting IDs moved from `core.watch_code.*` to
  `plugin::setta-watch-code::*`, and reveal targets moved from DOM anchors in
  host panes to plugin reveal handlers.
- Why this appears intentional: docs, MCP tests, frontend reveal tests, and E2E
  tests all use the plugin IDs.
- Files/endpoints/components involved:
  - `docs/reference/mcp-system-overview.md`
  - `docs/reference/watch-code.md`
  - `internal/watchcodeuisettings/entries.go`
  - `frontend/tests/e2e/overview/misc/core-ui-settings-tools.spec.ts`
  - `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Watch Code settings are plugin-sourced and reveal through
    `watch-code-settings`.
- Reviewer guardrail: do not reintroduce `core.watch_code.*` aliases or make
  follow-up tests pass by mapping old IDs to new ones.

### 3. Provider unavailability is a product-visible state, not a hidden fallback

- What changed: Watch Code can be unavailable because no provider is installed,
  the provider is disabled, the provider is invalid, or multiple providers
  conflict. Routes/settings/runtime state surface that explicitly.
- Why this appears intentional: provider selection status is generated into
  runtime/status APIs and covered by runtime tests.
- Files/endpoints/components involved:
  - `internal/plugins/runtime.go`
  - `internal/plugins/status.go`
  - `internal/watchcodehttp/routes.go`
  - `internal/watchcodeuisettings/entries.go`
  - `frontend/src/plugins/runtime.ts`
- Default-value changes, moved/renamed flows, or relocated logic:
  - No-provider default is `pluginEnabled=false`, `python=false`, and
    `providerSelection.status=no_provider`.
- Reviewer guardrail: do not add silent fallbacks that keep Watch Code running
  without an active provider.

### 4. Go remains the owner of Watch Code correctness

- What changed: the plugin owns package metadata and UI, but parsing, planning,
  file watching, route validation, project-state mutation, baselining,
  registry updates, generated contracts, and endpoint shapes remain in Go.
- Why this appears intentional: the plan and README both describe the plugin as
  a provider/gate, not a second backend runtime.
- Files/endpoints/components involved:
  - Go owners under `internal/app`, `internal/projectstate`,
    `internal/watchcodehttp`, `internal/watchcodeuisettings`, and
    `internal/plugins`
  - Plugin UI/package under `plugins/setta-watch-code`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Plugin frontend calls host-provided `setWatchCodeEnabled` and
    `setWatchCodeInputs`; it does not implement Watch Code mutation logic.
- Reviewer guardrail: do not duplicate planner/parser/storage logic in
  TypeScript or Python for convenience.

### 5. Watch Code routes keep their public paths while ownership moves

- What changed: `/setWatchCodeEnabled` and `/setWatchCodeInputs` keep their
  public route paths and operation IDs, but handler code moved from
  `internal/httpapi/project_routes.go` into `internal/watchcodehttp`.
- Why this appears intentional: frontend callers still use generated OpenAPI
  routes, and route registration tests assert operation IDs.
- Files/endpoints/components involved:
  - `internal/watchcodehttp/routes.go`
  - `internal/httpapi/watch_code_routes.go`
  - `frontend/src/openapi/http/generated/*`
  - `frontend/src/state/actions/project/watchCode.ts`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Request type names changed because the Go owner package changed.
- Reviewer guardrail: do not add alias routes or bespoke plugin HTTP wrappers.
  Keep the standard OpenAPI client and current paths.

### 6. The host controls rail is now a plugin extension surface

- What changed: Watch Code's radar control is no longer a core React control.
  `Controls.tsx` hosts plugin canvas controls and the Watch Code plugin
  contributes its own control.
- Why this appears intentional: host-side Watch Code components were deleted
  and plugin runtime tests validate the new extension point.
- Files/endpoints/components involved:
  - `frontend/src/forks/xyflow/controls/Controls.tsx`
  - `frontend/src/plugins/runtimeInternal.ts`
  - `frontend/src/plugins/runtimeShared.ts`
  - `plugins/setta-watch-code/frontend/src/index.ts`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Valid canvas control placements are `project`, `viewport`, and `utility`.
  - Watch Code uses `placement="project"` and `order=20`.
- Reviewer guardrail: do not restore the deleted host Watch Code UI or
  `watchCodePortalOpen`; add future controls through `registerCanvasControl`.

### 7. Plugin frontend dist artifacts are generated, not source

- What changed: plugin frontend bundles are built during plugin package/source
  workflows and are intentionally not checked in.
- Why this appears intentional: the extraction plan, plugin READMEs, manifest
  packaging tests, and `git ls-files` tests all reinforce this.
- Files/endpoints/components involved:
  - `plugins/setta-watch-code/build_backend.py`
  - `plugins/setta-watch-code/MANIFEST.in`
  - `plugins/setta-json-render-app-gen/build_backend.py`
  - `tests/start/test_packaged_distribution.py`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Watch Code `MANIFEST.in` prunes `frontend/dist` and `frontend/node_modules`
    from sdist inputs while wheel builds produce and package `frontend/dist`.
- Reviewer guardrail: do not commit `plugins/setta-watch-code/frontend/dist/**`
  or `plugins/setta-json-render-app-gen/frontend/vendor/app-subsystem-frontend-sdk/dist/**`.

### 8. Watch Code must not depend on a specific Python LSP plugin

- What changed: the branch reports Watch Code's Python language-server
  dependency from the active language-server selection state rather than
  checking for one provider ID.
- Why this appears intentional: tests use provider-agnostic selected/applied
  plugin IDs, including `setta-basedpyright` and `setta-ty` examples, and the
  plan explicitly allows any active Python language server.
- Files/endpoints/components involved:
  - `internal/app/watch_code_language_server_dependency.go`
  - `internal/plugins/runtime.go`
  - Generated runtime types under `frontend/src/openapi/*`
- Default-value changes, moved/renamed flows, or relocated logic:
  - Missing/disabled/pending-restart Python LSP states are surfaced separately
    from Watch Code provider availability.
- Reviewer guardrail: do not hard-code `setta-basedpyright` or hide missing LSP
  behind silent fallback behavior.
