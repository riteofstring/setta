# Branch Intent Summary

Compared against `go-rewrite` using the merge-base diff. This branch extracts
Watch Code into a first-party plugin while keeping Go as the owner of Watch Code
runtime correctness, contracts, routes, settings, and persisted data shape.

## Features

### First-party `setta-watch-code` plugin package

- What changed: Watch Code is now represented by a first-party plugin package at
  `plugins/setta-watch-code`. Before this branch, Watch Code was a core IDE
  feature with host-owned React components and no plugin package. After this
  branch, the plugin has its own `setta.plugin.json`, `pyproject.toml`,
  `build_backend.py`, frontend package, tests, README, and manifest-declared
  frontend bundle.
- Why intentional: `docs/plans/watch-code-plugin-extraction-plan.md`,
  `docs/reference/watch-code.md`, `README.md`, packaging tests, and the plugin
  manifest all describe Watch Code as a first-party plugin provider. The package
  is also added to the default install extra.
- Files/endpoints/components involved:
  - `plugins/setta-watch-code/setta.plugin.json`
  - `plugins/setta-watch-code/pyproject.toml`
  - `plugins/setta-watch-code/build_backend.py`
  - `plugins/setta-watch-code/frontend/src/index.ts`
  - `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`
  - `plugins/setta-watch-code/frontend/src/styles.css`
  - `plugins/setta-watch-code/frontend/tests/register.test.ts`
  - `pyproject.toml`, `uv.lock`, `tests/start/test_packaged_distribution.py`
- Default-value or UX changes: `setta-watch-code==0.1.0` is added to
  `project.optional-dependencies.defaults`, so default installs still make Watch
  Code available when first-party defaults are installed. Plugin frontend
  `dist/*` files are runtime/package artifacts and are not checked in.
- Reviewer guardrail: do not move the Watch Code UI back into
  `frontend/src/components` or remove the default plugin dependency unless there
  is a new product decision. Do not check in `plugins/setta-watch-code/frontend/dist/*`.

### Generic plugin canvas controls and Watch Code plugin UI

- What changed: the host frontend now supports plugin-contributed controls in
  the React Flow canvas controls rail. Before this branch, the host imported
  `WatchCodePane` and rendered a hard-coded radar button plus popover from
  `frontend/src/forks/xyflow/controls/Controls.tsx`. After this branch,
  `Controls.tsx` renders registered plugin canvas controls, and the
  `setta-watch-code` frontend registers the radar control and settings popover.
- Why intentional: the plugin manifest requests `registerCanvasControl`,
  `registerSettingRevealHandler`, `readProjectState`, `subscribeProjectState`,
  and `mutateWatchCodeSettings`; plugin runtime tests cover registration,
  sorting, duplicate validation, and cleanup.
- Files/endpoints/components involved:
  - `frontend/src/plugins/runtime.ts`
  - `frontend/src/plugins/runtimeInternal.ts`
  - `frontend/src/plugins/runtimeShared.ts`
  - `frontend/src/forks/xyflow/controls/Controls.tsx`
  - deleted `frontend/src/components/Panes/Overview/WatchCode/WatchCodePane.tsx`
  - deleted `frontend/src/components/AppHeader/WatchCodeToggleButton.tsx`
  - `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`
- Moved/renamed UX flows: the visible radar button remains in the canvas
  controls rail, but the implementation is plugin-owned. The plugin registers
  placement `project` and order `20`; generic placements are `project`,
  `viewport`, and `utility`.
- Reviewer guardrail: do not restore host-owned Watch Code controls or a
  `WatchCodePane` compatibility path. New canvas controls should use
  `registerCanvasControl`; Watch Code reveal should stay plugin-handler based.

### Watch Code provider capability and runtime status

- What changed: Watch Code availability is now derived from plugin runtime
  capability selection. Before this branch, core runtime paths assumed Watch
  Code existed. After this branch, a provider is selected from
  `featureCapabilities.watchCode`; no provider, a disabled provider, an invalid
  provider, or multiple active providers all make the feature unavailable.
- Why intentional: the branch adds Go-owned capability types and tests for
  unavailable, active, first-party, disabled, invalid, and conflicting providers.
  The manifest schema also gains `featureCapabilities.watchCode`.
- Files/endpoints/components involved:
  - `internal/plugins/types.go`
  - `internal/plugins/runtime.go`
  - `internal/plugins/status.go`
  - `internal/app/watch_code_capabilities.go`
  - `internal/app/plugin_backend_runtime_refresh.go`
  - `backend/setta/plugins/schemas/setta.plugin.schema.json`
  - generated surfaces under `frontend/generation/*`,
    `frontend/src/openapi/*/generated`, and
    `backend/setta/types/generated/go_shared_types.py`
- Default-value or relocated logic: provider selection is generic and not just a
  hard-coded plugin ID check. A provider must be active, support Python, and
  have a frontend entrypoint when it declares `canvasControlsUi`.
- Reviewer guardrail: keep provider selection fail-closed. Do not implicitly
  choose among conflicting providers, and do not allow a Watch Code provider
  that lacks Python support or required frontend assets.

### Python language-server dependency status for Watch Code

- What changed: plugin runtime responses now include explicit Watch Code Python
  language-server dependency status. Before this branch, Watch Code did not
  report this dependency as a first-class runtime status. After this branch, the
  status can be `unavailable`, `not_required`, `active`, `missing`, `disabled`,
  or `pending_restart`, and includes selected/applied plugin IDs when available.
- Why intentional: `internal/app/watch_code_language_server_dependency.go` and
  `internal/app/plugin_backend_runtime_refresh_test.go` derive the status from
  language-server selections rather than hard-coding a specific provider.
- Files/endpoints/components involved:
  - `internal/app/watch_code_language_server_dependency.go`
  - `internal/plugins/runtime.go`
  - `internal/plugins/status.go`
  - generated frontend/Python type surfaces
- Reviewer guardrail: do not replace this with a `setta-basedpyright` specific
  check. Watch Code depends on an active Python language-server capability, not
  one fixed language-server plugin.

### Plugin-owned Watch Code UI settings and MCP surface

- What changed: Watch Code settings moved from core setting IDs to plugin-owned
  setting IDs. Before this branch, the settings were
  `core.watch_code.enabled`, `core.watch_code.folders`, and
  `core.watch_code.files`, registered from `internal/uisettings/core.go`. After
  this branch, they are `plugin::setta-watch-code::enabled`,
  `plugin::setta-watch-code::folders`, and
  `plugin::setta-watch-code::files`, registered by
  `internal/watchcodeuisettings`.
- Why intentional: docs explicitly state that old `core.watch_code.*` IDs are
  not aliases. Tests verify plugin source metadata, plugin search filtering,
  plugin reveal metadata, unavailable-provider errors, and no core search
  results for Watch Code.
- Files/endpoints/components involved:
  - `internal/watchcodeuisettings/entries.go`
  - `internal/uisettings/core.go`
  - `internal/uisettings/plugins.go`
  - `internal/uisettings/registry.go`
  - `internal/mcpx/ui_setting_tools.go`
  - `internal/app/mcp_ui_settings_test.go`
  - `internal/httpapi/mcp_tool_ui_settings_test.go`
  - `docs/reference/mcp-system-overview.md`
- Moved/renamed UX flows: setting reveal now goes through plugin reveal key
  `watch-code-settings`; the plugin opens/highlights the popover itself.
- Reviewer guardrail: do not re-add `core.watch_code.*` setting IDs, aliases,
  or compatibility reads. Searches and writes should be plugin-sourced and
  unavailable with `plugin_unavailable` when the provider is inactive.

### Watch Code project data moved under `pluginData`

- What changed: Watch Code persisted/project-view state moved out of
  `ProjectConfig` top-level fields. Before this branch, project JSON and
  `SingleConfig.projectConfig` exposed `watchCodeEnabled`,
  `watchCodeFolders`, `watchCodeFiles`, `watchCodeRegistry`, and
  `watchCodeBaselineByPath`. After this branch, document storage uses
  `pluginData["setta-watch-code"]` with `schemaVersion: 1` and per-project
  `enabled`, `folders`, `files`, `registry`, and `baselineByPath`; frontend
  project state receives this under `SingleConfig.pluginData`.
- Why intentional: tests assert that normalized documents store Watch Code under
  plugin data, hydrate internal runtime fields from plugin data, and ignore
  legacy top-level Watch Code fields.
- Files/endpoints/components involved:
  - `internal/projectstate/document.go`
  - `internal/projectstate/watch_code_plugin_data.go`
  - `internal/projectstate/watch_code_test.go`
  - `internal/projectview/single_config.go`
  - `internal/projectview/frontend_defaults.go`
  - `frontend/src/state/definitions.ts`
  - generated TS/Python contract outputs
- Default-value changes: frontend defaults now include
  `pluginData["setta-watch-code"] = { enabled: false, folders: [], files: [],
  registry: {}, baselineByPath: {} }`. ProjectConfig no longer has Watch Code
  defaults.
- Reviewer guardrail: do not reintroduce top-level Watch Code JSON fields or
  legacy migration/read paths. The branch intentionally ignores old top-level
  fields instead of migrating them.

### Watch Code HTTP routes extracted but route paths preserved

- What changed: `/setWatchCodeEnabled` and `/setWatchCodeInputs` were moved out
  of the large project route file into Watch Code route packages. The URL paths
  and OpenAPI-generated frontend caller surface remain the standard project
  endpoints, but handlers now enforce provider availability.
- Why intentional: `internal/httpapi/watch_code_routes.go` wraps
  `internal/watchcodehttp/routes.go`, and the OpenAPI generator explicitly
  includes these route contributions even when no app-subsystem provider is
  present.
- Files/endpoints/components involved:
  - `internal/httpapi/watch_code_routes.go`
  - `internal/watchcodehttp/routes.go`
  - `internal/httpapi/project_routes.go`
  - `cmd/setta-gen-http-openapi/main.go`
  - `frontend/src/state/actions/project/watchCode.ts`
  - endpoints `/setWatchCodeEnabled` and `/setWatchCodeInputs`
- Relocated logic: request types are now `watchcodehttp.*` aliases in
  `internal/httpapi`, and handler error mapping/broadcasting lives in
  `internal/watchcodehttp`.
- Reviewer guardrail: preserve the existing route paths and OpenAPI client
  usage. Do not replace these with bespoke plugin HTTP wrappers, and do not move
  handlers back into the general project route file.

### App-subsystem frontend SDK ownership tightened

- What changed: many host helper shims were removed from `frontend/src/utils`
  and `frontend/src/openapi/http`; callers now import SDK-owned helpers from
  `@setta/app-subsystem-frontend-sdk`. Before this branch, several files were
  one-line host re-export compatibility shims. After this branch, tests reject
  recreating those shims.
- Why intentional: app-subsystem boundary guardrail tests now assert that host
  compatibility re-export files do not exist, and the SDK exports the needed
  helpers/types directly.
- Files/endpoints/components involved:
  - deleted `frontend/src/openapi/http/requestRebuild.ts`
  - deleted `frontend/src/openapi/http/result.ts`
  - deleted helper shims such as `frontend/src/utils/attachments.ts`,
    `frontend/src/utils/bindingRuntime.ts`, `frontend/src/utils/dropzone.ts`,
    `frontend/src/utils/projectStateSelectors.ts`, and related files
  - `frontend/plugin-sdk/app-subsystem/src/helpers.ts`
  - `frontend/plugin-sdk/app-subsystem/src/openapi.ts`
  - `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`
- Reviewer guardrail: do not recreate deleted host shim files for convenience.
  Import from the SDK package or extend the SDK source/export if a helper is
  missing.

### First-party app plugin SDK materialization

- What changed: the JSON Render app-subsystem plugin no longer tracks vendored
  SDK `dist/index.js`. Instead, its build/test flow materializes the vendored
  SDK from the canonical source SDK before building.
- Why intentional: `materialize-vendored-app-subsystem-sdk.mjs`, package
  scripts, build backend changes, and packaging tests all enforce this source
  ownership.
- Files/endpoints/components involved:
  - `plugins/setta-json-render-app-gen/build_backend.py`
  - `plugins/setta-json-render-app-gen/frontend/package.json`
  - `plugins/setta-json-render-app-gen/frontend/scripts/materialize-vendored-app-subsystem-sdk.mjs`
  - deleted `plugins/setta-json-render-app-gen/frontend/vendor/app-subsystem-frontend-sdk/dist/index.js`
  - `tests/start/test_packaged_distribution.py`
- Reviewer guardrail: keep vendored SDK dist untracked. If standalone plugin
  builds need new SDK output, materialize it from
  `frontend/plugin-sdk/app-subsystem`, not by committing generated JS.

## Bug Fixes

### Watch Code no longer mutates when no provider is active

- What changed: core route, MCP setting, service sync, and code-update paths now
  check Watch Code provider availability. Before this branch, Watch Code state
  and bound-section updates could run as core behavior. After this branch, no
  active provider means no Watch Code service startup, no route mutation, no
  UI-setting mutation, and no Watch Code bound-section apply from code updates.
- Why intentional: tests cover `409 feature_unavailable`, `plugin_unavailable`,
  unchanged project state after rejected writes, and inactive-provider code
  update behavior.
- Files/endpoints/components involved:
  - `internal/app/app.go`
  - `internal/app/code_updates.go`
  - `internal/watchcodehttp/routes.go`
  - `internal/watchcodeuisettings/entries.go`
  - `internal/httpapi/project_routes_test.go`
  - `internal/app/code_updates_test.go`
- Reviewer guardrail: do not make Watch Code behavior run just because stored
  Watch Code data exists. Runtime behavior must remain gated by an active
  provider.

### Plugin setting reveal no longer assumes a pane-backed Overview target

- What changed: reveal flow can now invoke a plugin reveal handler even when
  there is no overview tab/pane to open. Before this branch, Watch Code reveal
  had special handling for the host-owned popover and `watchCodePortalOpen`
  local-storage flag. After this branch, plugin reveal handlers can handle
  canvas-control settings directly.
- Why intentional: `uiSettingReveal` tests were updated to use
  `plugin::setta-watch-code::*`, and Watch Code plugin tests verify the reveal
  handler opens/highlights anchors in the plugin popover.
- Files/endpoints/components involved:
  - `frontend/src/state/actions/uiSettingReveal.ts`
  - `frontend/src/state/actions/uiSettingReveal.test.ts`
  - `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`
  - `frontend/src/state/definitions.ts`
- Default-value changes: `watchCodePortalOpen` was removed from local storage;
  there is no persisted/transient host flag for the plugin popover.
- Reviewer guardrail: do not re-add Watch Code-specific reveal special cases or
  `watchCodePortalOpen`. Plugin reveal should be generic and handler-driven.

### `registerSettingRevealHandler` uses its own capability

- What changed: plugin runtime registration now checks
  `registerSettingRevealHandler` instead of the pane capability when a plugin
  registers a reveal handler. Before this branch, reveal handler registration
  was effectively tied to pane registration. After this branch, a canvas-control
  plugin can register reveal handling without also registering a pane.
- Why intentional: the Watch Code plugin requires reveal handling but does not
  need a pane, and tests load reveal-handler fixtures with only the reveal
  capability.
- Files/endpoints/components involved:
  - `frontend/src/plugins/runtimeInternal.ts`
  - `frontend/src/plugins/runtime.test.ts`
  - `backend/setta/plugins/schemas/setta.plugin.schema.json`
- Reviewer guardrail: keep reveal-handler capability independent from panes.
  Do not require pane registration as a proxy for reveal support.

### OpenAPI generation keeps Watch Code endpoints discoverable

- What changed: the OpenAPI generator now appends Watch Code route
  registrations separately from app-subsystem route registrations. Before this
  branch, generated route contribution was app-subsystem centric. After this
  branch, Watch Code routes remain in generated HTTP artifacts even without an
  app-subsystem provider.
- Why intentional: `cmd/setta-gen-http-openapi/main_test.go` explicitly asserts
  both Watch Code route paths are present.
- Files/endpoints/components involved:
  - `cmd/setta-gen-http-openapi/main.go`
  - `cmd/setta-gen-http-openapi/main_test.go`
  - `frontend/generation/http_openapi/openapi.json`
  - `frontend/src/openapi/http/generated/types.gen.ts`
- Reviewer guardrail: keep Watch Code route registration in the document build.
  Do not let these endpoints disappear from generated clients.

### Local-core command shim removed from `setta.plugin_runtime`

- What changed: `backend/setta/plugin_runtime/local_core.py` was deleted, and
  app-subsystem backend dispatch now imports `LocalCoreCommandError` and
  `run_local_core_command_once` directly from `setta.local_core_client`. Before
  this branch, `setta.plugin_runtime` re-exported a compatibility wrapper.
- Why intentional: packaging tests were updated to exclude
  `plugin_runtime/local_core.py` and to assert the packaged boundary uses
  `setta.local_core_client`.
- Files/endpoints/components involved:
  - deleted `backend/setta/plugin_runtime/local_core.py`
  - `backend/setta/plugin_runtime/__init__.py`
  - `backend/setta/plugin_runtime/app_subsystem.py`
  - `tests/plugin_runtime/test_local_core.py`
  - `tests/start/test_packaged_distribution.py`
- Reviewer guardrail: do not restore `setta.plugin_runtime.run_local_core_command`
  as a compatibility shim unless a new compatibility requirement is explicitly
  accepted.

## Intentional Behavior Changes To Preserve

### Watch Code is unavailable without an active provider, but default installs add one

- What changed: the product default is still to have Watch Code available in a
  normal defaults install, but the runtime no longer treats Watch Code as an
  unconditional core feature. Without the `setta-watch-code` provider, routes
  and settings fail closed.
- Why intentional: `pyproject.toml` and `uv.lock` add the default dependency,
  while provider-gating tests assert unavailable behavior when the provider is
  absent.
- Files/endpoints/components involved:
  - `pyproject.toml`
  - `uv.lock`
  - `internal/app/app_generation_modes.go`
  - `internal/app/watch_code_capabilities.go`
  - `internal/watchcodehttp/routes.go`
- Reviewer guardrail: preserve both halves of this decision. Do not make Watch
  Code unconditional again, and do not remove it from defaults without deciding
  that default installs should lose Watch Code.

### Old Watch Code setting IDs and storage fields are intentionally not compatible

- What changed: old `core.watch_code.*` settings and old project-level
  `watchCode*` JSON fields are removed rather than kept as aliases or migrated.
- Why intentional: docs and tests explicitly say not to register aliases and to
  ignore legacy top-level fields.
- Files/endpoints/components involved:
  - `docs/reference/watch-code.md`
  - `internal/uisettings/core.go`
  - `internal/watchcodeuisettings/entries.go`
  - `internal/projectstate/watch_code_plugin_data.go`
  - `internal/projectstate/watch_code_test.go`
- Reviewer guardrail: do not add silent compatibility fallbacks, dual reads,
  aliases, or migration windows for these old surfaces unless a new decision is
  made.

### Frontend project state now exposes plugin-owned Watch Code data through `pluginData`

- What changed: frontend code that needs Watch Code state should read
  `projectState.pluginData["setta-watch-code"]`, not
  `projectState.projectConfig.watchCode*`. The plugin runtime also supports a
  `readProjectState({ kind: "pluginData", pluginId })` selector for plugins.
- Why intentional: generated types, defaults, state definitions, and plugin
  runtime tests all align on `pluginData`.
- Files/endpoints/components involved:
  - `internal/projectview/single_config.go`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/plugins/runtimeInternal.ts`
  - `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`
- Reviewer guardrail: do not add frontend fallback reads from
  `projectConfig.watchCode*`. Use `pluginData` and update generated surfaces if
  the contract changes.

### Go remains the Watch Code behavior owner

- What changed: even though Watch Code is plugin-gated and the UI is
  plugin-owned, parsing, scan planning, validation, project-state mutation,
  baselining, route contracts, settings mutation, and persistence remain in Go.
- Why intentional: docs and package boundaries state that the plugin is a
  provider/UI surface, not a second backend runtime for Watch Code correctness.
- Files/endpoints/components involved:
  - `internal/projectstate/*watch_code*`
  - `internal/watchcodehttp/routes.go`
  - `internal/watchcodeuisettings/entries.go`
  - `internal/app/code_updates.go`
  - `plugins/setta-watch-code/frontend/src/watchCodeControl.ts`
- Reviewer guardrail: do not duplicate Watch Code parser/planner/registry or
  project mutation logic in TypeScript or Python. Extend Go-owned contracts and
  regenerate downstream surfaces instead.

### Watch Code endpoints stay standard OpenAPI project routes

- What changed: the plugin UI calls host-provided mutation methods that use the
  standard generated OpenAPI client for `/setWatchCodeEnabled` and
  `/setWatchCodeInputs`. The endpoints are not plugin-private bespoke routes.
- Why intentional: `frontend/src/state/actions/project/watchCode.ts` still
  imports generated OpenAPI request functions, and `internal/httpapi` keeps the
  public route constants.
- Files/endpoints/components involved:
  - `frontend/src/state/actions/project/watchCode.ts`
  - `frontend/src/plugins/runtimeInternal.ts`
  - `internal/httpapi/watch_code_routes.go`
  - `internal/watchcodehttp/routes.go`
- Reviewer guardrail: do not route Watch Code mutations through ad hoc plugin
  fetch code or plugin-specific endpoint wrappers.

### Removed host SDK compatibility files should stay removed

- What changed: host imports were moved to `@setta/app-subsystem-frontend-sdk`
  and deleted one-line re-export files are now prohibited by tests.
- Why intentional: this prevents parallel host-owned definitions of SDK helper
  behavior and keeps generated/helper ownership inside the SDK package.
- Files/endpoints/components involved:
  - `frontend/src/plugins/appSubsystemBuildBoundaryGuardrails.test.ts`
  - `frontend/plugin-sdk/app-subsystem/src/helpers.ts`
  - `frontend/plugin-sdk/app-subsystem/types/index.d.ts`
  - deleted `frontend/src/utils/*` shim files
- Reviewer guardrail: if a follow-up needs one of these helpers, export it from
  the SDK owner. Do not restore a host shim or duplicate implementation.

### Generated artifacts reflect Go-owned contract moves

- What changed: generated TS/Python/OpenAPI artifacts were regenerated to expose
  Watch Code provider capabilities, plugin data, route request type relocation,
  and SDK helper exports.
- Why intentional: these generated files align downstream surfaces with the
  Go-owned contract changes in `internal/plugins`, `internal/projectstate`,
  `internal/projectview`, and `internal/watchcodehttp`.
- Files/endpoints/components involved:
  - `frontend/generation/http_openapi/openapi.json`
  - `frontend/generation/non_http_shared/*`
  - `frontend/src/openapi/http/generated/*`
  - `frontend/src/openapi/non_http/generated/types.gen.ts`
  - `backend/setta/types/generated/go_shared_types.py`
  - `frontend/src/utils/generatedTypes.ts`
- Reviewer guardrail: do not manually edit generated outputs to recover old
  fields or names. Change the Go-owned source/generator path and regenerate.
