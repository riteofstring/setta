# Watch Code Plugin Extraction Plan

## Context

Watch Code currently behaves like a core IDE feature:

- Go owns the file watcher and scan planning in `internal/watchcode`.
- Go owns project-state mutation, baselining, registry updates, callable section
  creation, import maintenance, and bound-code update handling in
  `internal/projectstate`.
- App wiring starts `watchcode.Service`, syncs project config into it, resolves
  callable signatures through the LSP path, emits warning notifications, and
  broadcasts project-state updates.
- HTTP routes under `internal/httpapi` expose `/setWatchCodeEnabled` and
  `/setWatchCodeInputs`.
- The frontend owns the canvas radar button, floating settings popover, and
  OpenAPI route calls.
- UI settings currently expose Watch Code through core-owned IDs. The plugin
  extraction should replace those with plugin-owned setting IDs.

The app-subsystem extraction established a better pattern for large first-party
features: the plugin contributes feature availability and plugin-owned UI, while
Go remains the canonical owner for contracts, route shape, validation, and
correctness-sensitive runtime behavior.

This plan applies that model to Watch Code.

## Goal

Extract Watch Code into a first-party plugin package at
`plugins/setta-watch-code` while keeping Go as the source of truth for
correctness-sensitive behavior.

The target state is:

- Watch Code is unavailable unless the `setta-watch-code` plugin is active.
- The plugin owns its package metadata and user-facing frontend surface.
- Go owns scan planning, parsing, project mutation, route contracts, storage
  contracts, generated downstream surfaces, and runtime correctness.
- Watch Code declares and reports its dependency on an active Python language
  server capability, without hard-coding a specific language-server plugin.

## Non-Goals

- Do not run Watch Code project-state mutations inside an arbitrary plugin
  backend process.
- Do not expose broad plugin write access to Setta project internals just to
  support Watch Code.
- Do not duplicate parser, planner, registry, section-creation, or import logic
  in Python or TypeScript.
- Do not require `setta-basedpyright` specifically. Any active Python language
  server that satisfies the required LSP behavior should be accepted.
- Do not keep old host-owned UI imports after a plugin frontend host extension
  exists.
- Do not add backward-compatibility shims, legacy-data readers, compatibility
  windows, migration paths, dual-write paths, route aliases, or transitional
  adapters. This extraction is allowed to make a clean breaking change.
- Do not commit generated plugin frontend build output such as
  `plugins/setta-watch-code/frontend/dist/*`.

## Principles

- Keep correctness-sensitive behavior Go-owned.
- Treat the plugin as a provider and feature gate, not as a second backend
  runtime.
- Prefer a declarative capability contract over ad hoc plugin ID checks.
- Fail closed when the provider is unavailable.
- Make direct owner-boundary changes instead of compatibility layers. When an
  old core-owned surface is replaced, remove it rather than supporting both.
- Treat plugin frontend bundles as generated artifacts. Keep source, tests,
  package metadata, and build config in git; materialize `frontend/dist/*`
  during runtime-managed source builds, packaging, or explicit verification.
- Generate downstream Python and TypeScript surfaces after changing Go-owned
  route or state contracts.
- Keep LSP dependency status explicit and actionable in runtime/UI state.

## Target Shape

### Plugin Package

Add `plugins/setta-watch-code` with:

- `setta.plugin.json`
- package metadata
- optional backend probe only if the provider contract needs runtime
  declarations
- plugin-owned frontend source/build metadata once the frontend extension point
  exists
- tests and README matching the first-party plugin style
- no checked-in `frontend/dist` files

Suggested manifest direction:

```json
{
  "schemaVersion": 1,
  "id": "setta-watch-code",
  "name": "Setta Watch Code",
  "version": "0.1.0",
  "settaVersionRange": ">=0.0.0",
  "enabledByDefault": true,
  "featureCapabilities": {
    "watchCode": {
      "python": true,
      "requiresLanguageServer": true,
      "canvasControlsUi": true
    }
  },
  "capabilities": [
    "registerWatchCodeBackend"
  ]
}
```

The exact vocabulary should be settled during implementation. The important
constraint is that the host reads a provider capability from plugin runtime
state instead of keying behavior directly to one hard-coded plugin ID.

### Go Feature Boundary

Add a Go-owned Watch Code provider/capability boundary, analogous to the app
subsystem capability state:

- `internal/watchcodeprovider` or `internal/watchcodefeature`
- `plugins.PluginWatchCodeCapabilities`
- `WatchCodeCapabilitiesFromSnapshot`
- app-owned runtime state such as `watchCodeCapabilityState`

The capability should capture:

- selected provider plugin ID
- whether the provider is enabled and active
- supported languages, initially `python`
- whether an LSP dependency is required
- whether the frontend surface is contributed by the plugin
- any blocked/invalid reason surfaced through plugin runtime status

Only one active first-party Watch Code provider should be selected at a time.
Conflicting providers should make the feature unavailable rather than picking
one implicitly.

### Runtime Behavior

Keep the existing Go packages as the behavioral owner, but move wiring behind
the provider capability:

- `internal/watchcode` remains the parser/planner/watcher package.
- project-state apply behavior remains Go-owned, either in
  `internal/projectstate` or in a focused Go package that still mutates
  `projectstate.Project` through typed APIs.
- app startup creates `watchcode.Service` only when Watch Code capability is
  active in IDE mode.
- project-state `AfterSave` syncs Watch Code inputs only when the service is
  present.
- code update paths apply Watch Code bound-section updates only when the
  feature is available and the project has Watch Code enabled.
- missing provider means no automatic scan/update work, but existing project
  data remains readable.

### HTTP Routes

Move Watch Code route registration out of the large project route file:

- create `internal/watchcodehttp`
- move request types and handlers for:
  - `/setWatchCodeEnabled`
  - `/setWatchCodeInputs`
- register those routes through a feature contribution only when the provider
  is active

The route behavior should remain Go-owned and continue using the standard
OpenAPI-generated frontend client. Do not replace these with bespoke plugin
HTTP wrappers.

Route responses should make feature unavailability explicit:

- provider missing or disabled: `409 feature_unavailable` or equivalent
- LSP dependency unavailable: either allow the write but report degraded runtime
  status, or reject enabling with a precise error. The preferred long-term
  behavior is to allow persisted settings but mark runtime as degraded.

### UI Settings

Move Watch Code setting entries out of the core settings registry and into a
Watch Code provider contribution.

Use plugin-owned setting IDs. Do not keep the old `core.watch_code.*` IDs as
aliases or compatibility shims.

- `plugin::setta-watch-code::enabled`
- `plugin::setta-watch-code::folders`
- `plugin::setta-watch-code::files`

They should be marked as plugin-sourced and associated with the active Watch
Code provider plugin ID. Direct reads or writes to the old core IDs should fail
as unknown settings.

### LSP Dependency

Watch Code depends on Python language-server behavior for best results, but it
should not depend on a specific provider.

The dependency model should be:

- requires active Python language server capability
- satisfied by `setta-basedpyright`, `setta-ty`, or another active Python LSP
  plugin that exposes the required language server registration
- status reported separately from provider availability

Implementation details:

- derive Python LSP status from the existing language-server selection/runtime
  state
- expose Watch Code dependency status in plugin/runtime or feature status
- show a clear UI notice when Watch Code is enabled but Python LSP is missing,
  disabled, unavailable, or pending restart
- keep tree-sitter parsed signatures as the local baseline for file-watch
  updates, and use LSP to enrich or validate when available

The preferred behavior is graceful degradation:

- parsed signatures can create/update params
- LSP can provide documentation and stronger import/call resolution
- missing LSP produces explicit status and warnings rather than silent fallback

### Frontend Plugin Surface

The current frontend plugin host supports panes, commands, top nav items,
section kinds, setting reveal handlers, and app-subsystem registration. It does
not yet provide a clean way for a plugin to place a control in the React Flow
canvas controls rail.

Add a generic frontend extension point before moving the Watch Code UI:

- `registerCanvasControl` or `registerProjectControl`
- stable ordering and placement metadata
- icon/button renderer support
- popover or portal host support
- project state subscription through existing plugin host APIs
- setting reveal integration for plugin-owned settings

Then move the current Watch Code UI into
`plugins/setta-watch-code/frontend`:

- radar control
- floating settings popover
- enabled toggle
- watched folders/files editor
- LSP dependency status notice
- reveal handler for `plugin::setta-watch-code::*`

Do not keep a host adapter that renders old Watch Code UI as a transitional
path. Add the generic host extension point first, then move the UI.

Do not commit the plugin frontend's generated `dist/` bundle. The manifest may
point at `frontend/dist/*`, but those files must be created by the plugin-owned
frontend build during runtime/package verification, not tracked in git.

### Persistence

There is no legacy migration requirement. Do not add read compatibility for old
project fields, dual-write code, migration windows, or transitional storage
helpers.

If this extraction changes Watch Code storage, make a direct owner change to the
new storage shape and remove the superseded top-level fields in the same slice.
The target plugin-owned document data shape is:

```json
{
  "pluginData": {
    "setta-watch-code": {
      "schemaVersion": 1,
      "projects": {
        "<projectId>": {
          "enabled": false,
          "folders": [],
          "files": [],
          "registry": {},
          "baselineByPath": {}
        }
      }
    }
  }
}
```

Rules:

- implement typed Go storage helpers for the plugin data shape
- do not load old top-level fields into the new shape
- do not keep old field reads, old field writes, or duplicate effective-state
  views
- do not preserve old project-level Watch Code JSON for compatibility
- never discard plugin data because the plugin is not currently active
- keep JSON normalization deterministic
- generate downstream Python/TypeScript surfaces from Go-owned contracts

Open question: whether Watch Code state belongs at document-level
`pluginData["setta-watch-code"].projects[projectID]` or under a future
project-scoped plugin data branch. Document-level plugin data exists today and
matches app-subsystem precedent.

## Work Plan

### Phase 0: Baseline And Invariants

Deliverables:

- inventory of current Watch Code code paths and tests
- documented behavior matrix for provider active/missing/disabled/invalid
- documented behavior matrix for Python LSP active/missing/pending restart

Tasks:

- audit `internal/watchcode`, `internal/projectstate/watch_code*.go`,
  `internal/app/code_updates.go`, `internal/app/app.go`, project routes, UI
  settings, MCP UI setting tests, and frontend Watch Code components
- identify every path that currently assumes Watch Code is core-available
- identify tests that must be preserved before extraction begins
- add any missing characterization tests before moving code

### Phase 1: Add Watch Code Provider Capability

Deliverables:

- manifest schema supports Watch Code feature capability
- plugin runtime snapshot carries Watch Code capability state
- app runtime stores selected provider capability state

Tasks:

- extend `backend/setta/plugins/schemas/setta.plugin.schema.json`
- extend `internal/plugins` manifest, discovery, status, and runtime response
  types
- add `PluginWatchCodeCapabilities` and snapshot selection logic
- add conflict/invalid tests for multiple providers and missing capability
- regenerate Go-owned Python/TypeScript surfaces affected by runtime response
  changes

Acceptance criteria:

- a fixture plugin can make Watch Code capability active
- no fixture plugin means Watch Code capability is unavailable
- conflicting providers fail closed and surface a useful runtime status

### Phase 2: Gate Runtime Behavior By Provider Capability

Deliverables:

- Watch Code runtime behavior is available only when provider capability is
  active
- Watch Code routes, service startup, and UI settings are hidden or blocked when
  provider capability is unavailable

Tasks:

- wire capability state into app startup
- start `watchcode.Service` only when capability is active
- skip Watch Code service sync when unavailable
- gate bound-section Watch Code applies in code update paths
- add route-level feature-unavailable responses
- update tests for enabled and unavailable states

Acceptance criteria:

- all current Watch Code tests pass with provider fixture active
- missing provider does not mutate project Watch Code state from file changes
- project files using the current branch's storage contract load and save safely

### Phase 3: Extract Watch Code Routes

Deliverables:

- Watch Code HTTP route registration lives outside the main project route file
- frontend still consumes standard generated OpenAPI client/types

Tasks:

- create `internal/watchcodehttp`
- move route request/handler/error logic from `internal/httpapi/project_routes.go`
- register routes through an IDE feature contribution when provider is active
- use the chosen route paths and operation IDs directly; do not keep alias routes
  for old names
- update OpenAPI generation after route extraction
- update route tests to target the extracted package where practical

Acceptance criteria:

- generated OpenAPI artifacts remain in sync
- frontend action code still imports from `openapi/http`
- route behavior and websocket broadcasts are unchanged when provider is active

### Phase 4: Move UI Settings To Provider Contribution

Deliverables:

- `plugin::setta-watch-code::*` settings are registered only when Watch Code
  provider is active
- setting search/read/write/reveal semantics work through plugin-owned IDs

Tasks:

- create a Watch Code UI settings builder package
- move current setting definitions out of `internal/uisettings/core.go`
- keep read/write paths backed by Go project-state runtime methods
- associate entries with plugin source and provider plugin ID
- update MCP UI setting tests for active and unavailable provider states
- update reveal tests if setting source metadata changes

Acceptance criteria:

- `plugin::setta-watch-code::*` settings are searchable with provider active
- writes still baseline and broadcast project state correctly
- settings are unavailable with a precise error when provider is inactive
- old `core.watch_code.*` setting IDs are not registered as aliases

### Phase 5: Model LSP Dependency Status

Deliverables:

- Watch Code reports whether its Python LSP dependency is satisfied
- missing or pending-restart LSP is visible in runtime/UI state
- file-watch updates have deterministic behavior when LSP is unavailable

Tasks:

- define a Go-owned Watch Code dependency status type
- derive Python LSP availability from existing language-server runtime status
- expose dependency status to the frontend through generated runtime values or
  plugin runtime response
- ensure parser-derived signatures are used as the first local source for file
  watch updates
- keep LSP signature help as an enrichment/validation layer
- add tests for active LSP, unavailable LSP, explicit disabled LSP, and pending
  restart

Acceptance criteria:

- enabling Watch Code with no active Python LSP produces a clear status
- file-watch updates do not silently fail because LSP is missing
- no hard-coded dependency on `setta-basedpyright` exists

### Phase 6: Add Frontend Canvas-Control Extension Point

Deliverables:

- frontend plugin host supports project/canvas controls
- Watch Code can move its visible UI into plugin-owned frontend code

Tasks:

- add host API such as `registerCanvasControl`
- define control metadata, placement, ordering, icon/render behavior, and
  cleanup semantics
- expose safe project-state reads/subscriptions already available to plugin
  frontends
- add a host-provided popover/portal mounting helper or a minimal renderer
  contract for controls that open floating UI
- add validation and runtime tests in `frontend/src/plugins`
- update docs/guides/plugin-authoring-golden-path.md

Acceptance criteria:

- a fixture frontend plugin can add and remove a canvas control
- control registration is gated by an explicit manifest capability
- registrations clean up on plugin runtime refresh

### Phase 7: Move Watch Code Frontend Into Plugin

Deliverables:

- `plugins/setta-watch-code/frontend` owns the radar button and settings popover
- host frontend no longer imports Watch Code UI components directly

Tasks:

- create plugin frontend package/build metadata
- move or rewrite `WatchCodePane` and `WatchCodeToggleButton` inside the plugin
- expose any needed generated route/types through a narrow plugin frontend SDK
  or generated package boundary
- register the canvas control and setting reveal handler from the plugin
- remove host-owned Watch Code control rendering from
  `frontend/src/forks/xyflow/controls/Controls.tsx`
- remove any host local-storage state or reveal special cases that only existed
  for the old host-owned Watch Code UI
- keep visual behavior stable across desktop/mobile
- run vitest and Playwright coverage for the moved UI
- run chrome-devtools visual verification for the Watch Code popover
- verify `git ls-files -- 'plugins/setta-watch-code/frontend/dist/**'` prints
  nothing before committing

Acceptance criteria:

- disabling the plugin removes the Watch Code control without breaking canvas
  controls
- enabling the plugin restores the control and settings UI
- setting reveal for `plugin::setta-watch-code::*` opens/highlights the
  plugin-owned UI
- no `plugins/setta-watch-code/frontend/dist/*` files are tracked

### Phase 8: Move Persistence To Plugin Data

Deliverables:

- Watch Code state is stored in `pluginData["setta-watch-code"]`
- old project-level Watch Code fields are removed, not migrated
- generated downstream surfaces reflect the Go-owned storage contract

Tasks:

- add typed Go storage helpers for Watch Code plugin data
- remove old top-level Watch Code project fields from the persisted/runtime
  contract in the same change
- update compare-and-set and route mutation methods to write plugin data
- do not add load fallbacks, dual writes, compatibility readers, or transitional
  normalizers for the old fields
- update frontend/Python generated types
- update docs/reference/watch-code.md

Acceptance criteria:

- saving writes canonical plugin data
- disabled/missing provider does not erase plugin data
- frontend receives the new generated Watch Code state shape
- old top-level Watch Code fields are absent from generated surfaces

### Phase 9: Packaging, Install, And Defaults

Deliverables:

- `setta-watch-code` is a first-party plugin package
- local dev install includes it through the intended first-party flow
- defaults preserve current user-facing behavior

Tasks:

- add plugin package metadata and README
- update `dev_install.sh` or defaults install profile as needed
- add validation fixtures for package-manager and source-checkout installs
- add plugin install/runtime tests
- update README and plugin authoring docs

Acceptance criteria:

- source-checkout dev installs discover the plugin
- package-managed installs discover the plugin
- disabling the plugin disables Watch Code cleanly

## Testing Plan

Go tests:

- `internal/watchcode` parser/planner/watcher tests
- project-state storage contract tests
- route extraction tests
- app startup/gating tests
- plugin runtime capability tests
- LSP dependency status tests
- websocket broadcast tests for file-created/file-deleted flows

Frontend tests:

- plugin runtime host tests for canvas-control registration
- Watch Code plugin frontend tests
- setting reveal tests for plugin-owned Watch Code UI
- route action tests using generated OpenAPI client

E2E and visual verification:

- Watch Code control appears only when provider is active
- popover layout works on desktop and mobile
- enabling Watch Code baselines existing callables
- creating/deleting watched Python definitions updates callable sections
- missing Python LSP shows explicit degraded status

Generation and quality:

- run `./gcf.sh` when route contracts, generated frontend bindings, Python
  shared types, or plugin runtime response types change
- run targeted Go tests during each phase
- run `./check_quality.sh` before merging the full extraction

## Acceptance Criteria

- Watch Code is represented by a first-party plugin in `plugins/setta-watch-code`.
- Provider availability is determined by plugin runtime capability state.
- Go remains the owner of Watch Code behavior and project mutations.
- Routes and settings are available only when the provider is active.
- The frontend Watch Code control and popover are plugin-owned.
- Python LSP dependency status is explicit and provider-agnostic.
- Generated Python and TypeScript surfaces are updated from Go-owned contracts.
- Disabling or uninstalling the plugin leaves plugin-owned data intact and makes
  the feature inert.
- No backward-compatibility shims, legacy support, migrations, transitional
  adapters, dual paths, or checked-in `plugins/setta-watch-code/frontend/dist/*`
  artifacts remain.

## Suggested Execution Order

1. Add provider capability plumbing.
2. Gate runtime services behind the active provider.
3. Extract routes and UI settings.
4. Add LSP dependency status and degraded-mode behavior.
5. Add frontend canvas-control plugin API.
6. Move the frontend UI into `plugins/setta-watch-code`.
7. Move persistence into plugin data without migration or compatibility paths.
8. Finish packaging, docs, and full verification.
