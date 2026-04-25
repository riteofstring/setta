# Make `setta-watch-code` A Standalone Plugin

## Purpose

This plan replaces the previous Watch Code extraction plan. The previous state is
not standalone enough: `setta-watch-code` is packaged like a plugin and owns a
frontend control, but Setta still owns Watch Code-specific public routes, host
frontend methods, UI-setting registration, MCP tools, generated surfaces, and
project-state defaults.

This plan is complete only when `setta-watch-code` is standalone in the same
sense as `setta-ty`, `setta-basedpyright`, and `setta-json-render-app-gen`:

- the plugin package declares the feature
- the plugin backend registers the feature
- the plugin frontend owns the UI
- the host exposes only generic plugin infrastructure plus narrow Go local-core
  engine commands
- disabling or uninstalling the plugin makes Watch Code disappear from the app
  without leaving public Watch Code routes, settings, MCP tools, or frontend host
  APIs behind

## Standalone Definition

`setta-watch-code` is standalone only if all of these statements are true:

- `plugins/setta-watch-code` contains a `backend/main.py` backend entrypoint, a
  frontend package, a manifest, package metadata, tests, and docs.
- `plugins/setta-watch-code/frontend/dist/**` is never tracked. The manifest
  may point at `frontend/dist/*`, but those files are build/package/runtime
  artifacts materialized only when needed.
- Plugin discovery selects a Watch Code provider from backend probe output, not
  from a manifest-only flag and not from hard-coded plugin ID checks.
- The active provider plugin ID is passed through every Watch Code runtime path.
  The Go runtime must not assume the provider is named `setta-watch-code`.
- The Setta frontend has no Watch Code-specific plugin host methods such as
  `setWatchCodeEnabled`, `setWatchCodeInputs`, or `mutateWatchCodeSettings`.
- The Setta HTTP OpenAPI surface has no core `/setWatchCodeEnabled` or
  `/setWatchCodeInputs` routes.
- The Setta UI-settings registry has no core Watch Code settings and no
  `internal/watchcodeuisettings` contribution.
- Watch Code settings are backend-registered plugin UI settings owned by the
  active provider plugin.
- Watch Code MCP access is provided only through generic plugin UI-setting
  tools, not through core tools named `set_watch_code_enabled`,
  `set_watch_code_inputs`, or `compare_and_set_watch_code_*`.
- `SingleConfig.pluginData` and downstream Python/TypeScript generated types are
  generic plugin data maps. They must not hard-code `setta-watch-code` or
  `WatchCodePluginProjectData` as the value type.
- The plugin frontend reads `pluginData` for `host.pluginId`, supplies its own
  local defaults, and calls plugin-owned backend routes. It must not import
  core OpenAPI Watch Code callers.
- The Go Watch Code engine is allowed to remain in `internal/watchcode` and
  related Go packages, but it is reachable only through provider-selected
  runtime wiring and local-core commands invoked by the plugin backend.
- Disabling, uninstalling, shadowing, invalidating, or conflicting the provider
  disables the Watch Code service, routes, settings, MCP tools, and frontend UI
  without deleting persisted plugin data.

## No Compatibility Rule

Do not add any backward compatibility, legacy support, migrations,
transitional adapters, compatibility aliases, fallback reads, dual writes,
route aliases, old-field readers, old-field writers, deprecated host methods, or
temporary parallel paths.

When a plugin-owned surface replaces a core-owned surface, delete the old
surface in the same implementation slice. If a test must change, update it to
assert the new standalone behavior. Do not keep the old behavior around to make
old tests pass.

Specific forbidden work:

- no migration from old top-level Watch Code fields
- no reads from old top-level Watch Code fields
- no writes to old top-level Watch Code fields
- no aliases from `core.watch_code.*` to `plugin::<pluginId>::*`
- no `/setWatchCodeEnabled` or `/setWatchCodeInputs` compatibility routes
- no frontend host methods that wrap Watch Code mutations
- no MCP tools with old Watch Code-specific names
- no hard-coded `setta-watch-code` provider key in host runtime logic
- no committed plugin frontend `dist/*` output

## Target Architecture

### Plugin Package

`plugins/setta-watch-code` must own:

- `setta.plugin.json`
- `pyproject.toml`
- `MANIFEST.in`
- `README.md`
- `backend/main.py`
- `frontend/src/*`
- frontend tests
- backend tests
- package/build tests under `tests/start`

The manifest must include a backend entrypoint and explicit capabilities:

```json
{
  "schemaVersion": 1,
  "id": "setta-watch-code",
  "name": "Setta Watch Code",
  "version": "0.1.0",
  "settaVersionRange": ">=0.0.0",
  "enabledByDefault": true,
  "backend": {
    "entrypoint": "backend/main.py"
  },
  "frontend": {
    "entrypoint": "frontend/dist/index.js",
    "style": "frontend/dist/setta-watch-code-frontend.css",
    "build": {
      "packageManager": "pnpm"
    }
  },
  "featureCapabilities": {
    "watchCode": {
      "python": true,
      "requiresLanguageServer": true,
      "canvasControlsUi": true
    }
  },
  "capabilities": [
    "registerWatchCodeBackend",
    "registerRouter",
    "registerUISettings",
    "registerCanvasControl",
    "registerSettingRevealHandler",
    "readProjectState",
    "subscribeProjectState"
  ]
}
```

Ensure `registerUISettings` exists as a generic plugin capability. Do not
smuggle UI-setting registration through an unrelated capability.

### Generated Frontend Bundle Policy

`plugins/setta-watch-code/frontend/dist/**` must never be committed. This plan
uses the build-when-necessary approach. Do not add these files to git history,
even temporarily:

- source builds materialize `frontend/dist/*` during runtime-managed plugin
  frontend builds
- wheel builds materialize `frontend/dist/*` in the build workspace and package
  the resulting files into the wheel
- installed wheels contain runtime assets under the installed plugin root
- source control contains only frontend source, tests, config, package metadata,
  and build scripts

Every Codex iteration that builds the plugin frontend must clean generated
`plugins/setta-watch-code/frontend/dist/**` before committing. Tests may assert
that wheels contain dist assets, but no test may require dist assets to be
tracked in git.

### Backend Probe Contract

Add a Watch Code backend registration section to the generic backend probe
response, analogous to `appSubsystemBackend`:

```json
{
  "schemaVersion": 1,
  "watchCodeBackend": {
    "contractVersion": 1,
    "dataSchemaVersion": 1,
    "languages": ["python"],
    "requiresLanguageServer": true
  },
  "routes": [
    {"path": "/plugins/setta-watch-code/watch-code/enabled", "methods": ["POST"]},
    {"path": "/plugins/setta-watch-code/watch-code/inputs", "methods": ["POST"]}
  ],
  "uiSettings": [
    {
      "id": "enabled",
      "title": "Watch Code Enabled",
      "description": "Enable or disable Watch Code for the project.",
      "synonyms": ["watch code", "watch mode", "watch toggle"],
      "paneId": "left",
      "revealKey": "watch-code-settings",
      "mutability": "writable",
      "valueSchema": {"type": "boolean"},
      "readHandlerId": "read_enabled",
      "writeHandlerId": "write_enabled"
    },
    {
      "id": "folders",
      "title": "Watch Code Folders",
      "description": "List of folders watched by Watch Code.",
      "synonyms": ["watch folders", "watch code folders"],
      "paneId": "left",
      "revealKey": "watch-code-settings",
      "mutability": "writable",
      "valueSchema": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "path": {"type": "string"},
            "recursive": {"type": "boolean"}
          },
          "required": ["path"],
          "additionalProperties": false
        }
      },
      "readHandlerId": "read_folders",
      "writeHandlerId": "write_folders"
    },
    {
      "id": "files",
      "title": "Watch Code Files",
      "description": "List of explicit files watched by Watch Code.",
      "synonyms": ["watch files", "watch code files"],
      "paneId": "left",
      "revealKey": "watch-code-settings",
      "mutability": "writable",
      "valueSchema": {
        "type": "array",
        "items": {"type": "string"}
      },
      "readHandlerId": "read_files",
      "writeHandlerId": "write_files"
    }
  ]
}
```

Use the route path pattern `/plugins/<pluginId>/watch-code/enabled` and
`/plugins/<pluginId>/watch-code/inputs`. Use the handler IDs shown above. The
invariants below are mandatory:

- provider selection requires `watchCodeBackend` probe output
- provider selection requires matching `contractVersion`
- provider selection requires the active plugin to have
  `registerWatchCodeBackend`
- provider selection fails closed on no provider, invalid provider, disabled
  provider, pending restart, or provider conflict
- route and UI-setting registrations come from the backend probe
- route paths are plugin-owned backend routes, not core project routes

### Go Local-Core Engine Boundary

Go remains the correctness owner for parsing, scanning, registry mutation,
section creation, import maintenance, and bound-code updates. That does not make
the plugin non-standalone as long as the Go behavior is behind a narrow engine
boundary invoked by the plugin backend.

Add local-core commands for the plugin backend:

- `watch_code_get_project_data`
- `watch_code_set_enabled`
- `watch_code_set_inputs`
- `watch_code_read_setting`
- `watch_code_write_setting`

Each command payload must include:

- `settaFilesRoot`
- `pluginId`
- `projectConfigId`
- command-specific values

The command implementation must:

- use `pluginId` as the plugin-data key
- reject empty `pluginId`
- reject empty `projectConfigId`
- validate repo-relative input paths in Go
- mutate project state through production Go runtime paths
- broadcast project-state updates when called from the live app path
- never migrate, read, or write old top-level Watch Code fields

Expose generated Python constants for these commands and add a helper in
`backend/setta/plugin_runtime/watch_code.py`, exported from
`backend/setta/plugin_runtime/__init__.py`, similar to the app-subsystem helper.

### Plugin Backend Runtime

`plugins/setta-watch-code/backend/main.py` must:

- support `--setta-plugin-backend-probe`
- support `--setta-plugin-backend-runtime`
- return `watchCodeBackend`, plugin-owned routes, and plugin-owned UI settings
  from the probe
- handle `kind == "http"` for plugin-owned backend routes
- handle `kind == "ui_setting"` for backend UI setting reads/writes
- call the generated local-core commands through `setta.local_core_client`
- pass the active `pluginId` from its manifest or backend runtime context into
  every local-core payload
- return precise error objects with stable error codes

The backend must not import repo source paths. It must import only the installed
`setta` package and Python standard-library modules, as
`setta-json-render-app-gen` does.

### Plugin Frontend Runtime

`plugins/setta-watch-code/frontend` must:

- register the canvas control
- register the setting reveal handler
- read project data with
  `host.readProjectState({ kind: "pluginData", pluginId: host.pluginId })`
- subscribe to plugin data with the same plugin ID
- normalize missing plugin data locally
- call plugin-owned backend routes with `fetch` or a generic plugin backend
  route helper
- never call `host.setWatchCodeEnabled`
- never call `host.setWatchCodeInputs`
- never import `openapi/http` Watch Code callers
- never rely on frontend defaults containing `pluginData["setta-watch-code"]`

The plugin frontend can hard-code its own local setting IDs:

- `plugin::${host.pluginId}::enabled`
- `plugin::${host.pluginId}::folders`
- `plugin::${host.pluginId}::files`

Use `setta-watch-code` in the first-party plugin package files, tests, docs,
default dependency metadata, and lockfile entries. Host code must not depend on
that ID for provider selection.

### Persistence

Canonical persisted state is plugin data keyed by the active provider plugin ID:

```json
{
  "pluginData": {
    "<providerPluginId>": {
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

- no top-level Watch Code project fields
- no `ProjectConfig.watchCode*`
- no `Project.WatchCode*` exported general project fields
- no `WatchCodePluginDataKey = "setta-watch-code"` constant in host runtime
  code
- no generated Python or TypeScript type that specializes
  `ProjectPluginData` to Watch Code
- do not delete plugin data when the plugin is missing, disabled, invalid, or
  uninstalled
- do not copy data between plugin IDs
- do not migrate data from old fields

Move typed Watch Code state helpers out of generic project-view contracts and
into Watch Code engine-local packages. Good locations are `internal/watchcode`
or a focused package such as `internal/watchcodestate`. The helper APIs must
take `providerPluginID string`.

### Runtime Behavior

When exactly one active provider has a valid `watchCodeBackend` registration:

- the app starts/syncs `watchcode.Service` in IDE mode
- file watcher config comes from `pluginData[providerPluginId]`
- code-update paths apply bound-section Watch Code updates
- plugin-owned backend routes mutate settings
- plugin-owned UI settings read/write settings
- frontend plugin renders the control

When no provider is active:

- no Watch Code service starts
- no Watch Code file watch or bound-section apply runs
- no Watch Code control renders
- no Watch Code plugin UI settings are registered
- no Watch Code plugin backend routes are registered
- generic UI-setting tools cannot find Watch Code settings
- persisted plugin data is left untouched

When multiple providers are active:

- provider selection status is `provider_conflict`
- Watch Code is unavailable
- no provider is chosen implicitly
- persisted plugin data for all providers is left untouched

When a provider is active but the Python LSP dependency is missing:

- provider selection remains active
- dependency status is degraded/missing
- enabling and input writes are allowed
- file-watch behavior uses deterministic Go parser/planner behavior
- any missing LSP enrichment produces explicit status or warnings, not silent
  fallback

## Implementation Plan

### Phase 1: Add Standalone Contract Tests First

Add failing tests that describe the final standalone state before making broad
changes.

Tests to add:

- plugin runtime test: a manifest-only Watch Code plugin without backend probe
  does not activate Watch Code
- plugin runtime test: an active backend-probed Watch Code provider activates
  Watch Code
- plugin runtime test: two active backend-probed Watch Code providers produce
  provider conflict
- plugin runtime test: an active provider whose backend probe omits
  `watchCodeBackend` is invalid for Watch Code
- package test: `setta-watch-code` wheel includes `backend/main.py`, manifest,
  README, and built frontend assets
- package test: installed `setta-watch-code` has no runtime dependency on
  frontend source files, `frontend/package.json`, or `frontend/node_modules`
- frontend plugin test: the plugin registers its control without special host
  mutation methods
- route test: `/setWatchCodeEnabled` and `/setWatchCodeInputs` are absent from
  generated OpenAPI route declarations
- UI-setting test: `core.watch_code.*` settings are unknown
- MCP test: Watch Code-specific core MCP tools are absent
- data contract test: `SingleConfig.pluginData` is generic and has no default
  `setta-watch-code` entry

These tests should fail before implementation and pass only when the old
core-owned surfaces are removed.

### Phase 2: Add Generic Plugin Capability Support

Update generic plugin runtime infrastructure:

- add `registerWatchCodeBackend` to known capabilities
- add `registerUISettings` to known capabilities
- update plugin manifest schema
- update backend probe schema/decoder to include `watchCodeBackend`
- add `PluginWatchCodeBackendRegistration` with `contractVersion`,
  `dataSchemaVersion`, `languages`, and `requiresLanguageServer`
- make backend probe required when `registerWatchCodeBackend` or
  `registerUISettings` is requested
- only apply backend UI settings when `registerUISettings` is effective
- update runtime/status payloads to include Watch Code provider selection from
  backend probe output

Provider selection must use this order:

1. Ignore shadowed plugins.
2. Ignore plugins without `featureCapabilities.watchCode`.
3. Mark plugins with `featureCapabilities.watchCode` but no effective
   `registerWatchCodeBackend` as invalid providers.
4. Mark plugins with effective `registerWatchCodeBackend` but no backend as
   invalid providers.
5. Mark plugins whose backend probe fails as invalid providers.
6. Mark plugins whose backend probe omits `watchCodeBackend` as invalid
   providers.
7. Mark plugins with unsupported `contractVersion` as invalid providers.
8. Select exactly one active valid provider.
9. Fail closed on conflicts.

Do not special-case `setta-watch-code`.

### Phase 3: Move Watch Code State Out Of Generic Project Contracts

Refactor storage before moving more UI so generated downstream surfaces do not
keep exposing Watch Code as core state.

Tasks:

- remove `WatchCodeEnabled`, `WatchCodeFolders`, `WatchCodeFiles`,
  `WatchCodeRegistry`, and `WatchCodeBaselineByPath` from generic persisted and
  generated project config/view surfaces
- remove hard-coded frontend defaults for `pluginData["setta-watch-code"]`
- make `ProjectPluginData` a generic JSON map in Go, Python, and TypeScript
- add Watch Code state helpers that read/write
  `Document.PluginData[providerPluginID]`
- update Watch Code Go engine code to take `providerPluginID`
- update Watch Code Go engine code to pass typed Watch Code state explicitly
  instead of relying on generic project fields
- update project-state save/normalize paths to preserve unknown plugin data
- remove `WatchCodePluginDataKey`
- remove generated Python/TypeScript Watch Code plugin-data defaults from
  generic project defaults

Do not add migrations. If old top-level Watch Code data appears, it is ignored.

### Phase 4: Add Watch Code Local-Core Commands

Add local-core command constants and handlers:

- `watch_code_get_project_data`
- `watch_code_set_enabled`
- `watch_code_set_inputs`
- `watch_code_read_setting`
- `watch_code_write_setting`

Implementation requirements:

- commands live in the same local-core protocol used by plugin runtime helpers
- commands accept `pluginId` and `projectConfigId`
- commands load and mutate project state from `settaFilesRoot`
- commands call production Watch Code Go engine paths
- commands return JSON values matching plugin frontend/backend expectations
- errors use stable codes such as `project_config_id_required`,
  `project_config_not_found`, `invalid_watch_code_input`,
  `watch_code_provider_required`, and `internal_error`
- command tests cover queued local-core document behavior if applicable

Do not expose these commands through public HTTP/OpenAPI routes.

### Phase 5: Add The Plugin Backend

Add `plugins/setta-watch-code/backend/main.py` and a helper module under
`backend/setta/plugin_runtime/watch_code.py`.

Backend behavior:

- probe returns `watchCodeBackend`
- probe registers plugin-owned routes:
  - `POST /plugins/setta-watch-code/watch-code/enabled`
  - `POST /plugins/setta-watch-code/watch-code/inputs`
- probe registers plugin-owned UI settings:
  - local ID `enabled`
  - local ID `folders`
  - local ID `files`
- runtime `http` handler decodes route payloads, validates shape, calls local
  core, and returns HTTP responses
- runtime `ui_setting` handler maps read/write handler IDs to local-core
  commands
- backend failures include structured error codes
- backend reads its plugin ID from `setta.plugin.json` or from runtime context;
  do not duplicate the ID in multiple places

Package behavior:

- include backend in wheel
- do not include `frontend/node_modules`
- build frontend assets during plugin wheel build and runtime-managed source
  builds
- remove `plugins/setta-watch-code/frontend/dist/**` after local verification
  and before every commit
- fail package tests if source-control tracking of `frontend/dist/**` is
  required for the wheel to build

### Phase 6: Move Watch Code UI Settings To Plugin Backend

Delete core Watch Code UI-setting registration.

Tasks:

- delete `internal/watchcodeuisettings` or leave only tests proving it is gone
- remove Watch Code registration from `internal/uisettings/core.go`
- remove Watch Code-specific unavailable-setting errors from core
- rely on generic plugin backend UI-setting discovery
- update setting IDs to be built from provider plugin ID:
  - `plugin::<providerPluginId>::enabled`
  - `plugin::<providerPluginId>::folders`
  - `plugin::<providerPluginId>::files`
- update generic plugin UI-setting tests to cover Watch Code backend settings
- update MCP UI-setting tests to use generic setting tools

Do not register `core.watch_code.*`. Do not alias old IDs.

### Phase 7: Remove Core Watch Code HTTP Routes And Frontend Callers

Delete the core project API route surface:

- delete `internal/httpapi/watch_code_routes.go`
- move any still-needed validation helpers from `internal/watchcodehttp` into
  local-core command handlers, then delete `internal/watchcodehttp`
- remove `RouteSetWatchCodeEnabled`
- remove `RouteSetWatchCodeInputs`
- remove route registration from app startup and OpenAPI generation
- regenerate OpenAPI outputs
- delete `frontend/src/state/actions/project/watchCode.ts`
- remove generated `setWatchCodeEnabled` and `setWatchCodeInputs` references
- update tests that expected those routes to assert they are absent

The only HTTP routes for Watch Code after this phase are plugin-owned backend
routes registered by `plugins/setta-watch-code/backend/main.py`.

### Phase 8: Remove Watch Code-Specific Frontend Host APIs

Delete frontend plugin host special cases:

- remove `mutateWatchCodeSettings` capability
- remove `setWatchCodeEnabled` from `SettaPluginHost`
- remove `setWatchCodeInputs` from `SettaPluginHost`
- remove Watch Code payload normalizers from `frontend/src/plugins/runtimeInternal.ts`
- remove tests that exercise these host methods
- update `plugins/setta-watch-code/frontend/src/watchCodeControl.ts` to call
  plugin-owned backend routes
- keep only generic host APIs:
  - `registerCanvasControl`
  - `registerSettingRevealHandler`
  - `readProjectState`
  - `subscribeProjectState`
  - generic cleanup/context APIs

If a frontend helper for plugin backend routes is needed, add a generic helper
such as `host.fetchBackendRoute(path, init)`. It must not mention Watch Code.

### Phase 9: Move Watch Code MCP Access To Generic Plugin Settings

Delete core Watch Code MCP tools:

- `set_watch_code_enabled`
- `set_watch_code_inputs`
- `compare_and_set_watch_code_enabled`
- `compare_and_set_watch_code_folders`
- `compare_and_set_watch_code_files`

Do not replace them with Watch Code-specific aliases. Users and agents must use
the generic UI-setting tools against:

- `plugin::<providerPluginId>::enabled`
- `plugin::<providerPluginId>::folders`
- `plugin::<providerPluginId>::files`

Update MCP tests to assert the old tools are absent and generic setting tools
work when the plugin is active.

### Phase 10: Rewire Runtime Service Gating

Update app runtime wiring:

- derive active Watch Code provider from plugin runtime snapshot
- store selected provider plugin ID in Watch Code capability state
- start `watchcode.Service` only when provider selection is active
- sync watcher inputs from `pluginData[providerPluginId]`
- stop or disable service when provider becomes unavailable
- make code-update and bound-code paths call Watch Code engine only when provider
  selection is active
- make all Watch Code apply paths receive provider plugin ID
- leave plugin data untouched when the service is stopped

Update tests for:

- no provider
- disabled provider
- invalid provider
- pending-restart provider
- provider conflict
- active provider
- provider disabled after being active
- provider uninstalled after being active

### Phase 11: Keep Python LSP Dependency Provider-Agnostic

Watch Code can require a Python language server without depending on
`setta-basedpyright`.

Tasks:

- derive dependency status from active Python language-server registration
- accept `setta-basedpyright`, `setta-ty`, or any valid Python LSP plugin
- expose dependency status in Watch Code runtime capability state
- surface status to the plugin frontend through generic runtime/plugin data or a
  plugin backend route
- do not reject settings writes solely because LSP is missing
- keep parser/planner behavior deterministic without LSP

Tests:

- active provider plus active Python LSP
- active provider plus no Python LSP
- active provider plus disabled Python LSP
- active provider plus pending-restart Python LSP
- no hard-coded `setta-basedpyright` dependency

### Phase 12: Update The Plugin Frontend

The frontend plugin must become self-contained:

- keep all Watch Code UI under `plugins/setta-watch-code/frontend/src`
- use local TypeScript types for plugin-owned payloads, or generated generic
  plugin SDK types if available
- use generic project state selector APIs
- use backend route calls for mutations
- implement local default data for missing plugin data
- register setting reveal for `watch-code-settings`
- use dynamic setting IDs based on `host.pluginId`
- keep `plugins/setta-watch-code/frontend/dist/**` untracked even after running
  local build/typecheck/test commands

Tests:

- plugin registers only when required generic capabilities exist
- plugin does not require Watch Code-specific host methods
- plugin reads plugin data using `host.pluginId`
- plugin calls plugin-owned backend routes
- reveal opens/highlights plugin-owned anchors
- disabling plugin removes the canvas control

### Phase 13: Packaging And Install Verification

Update packaging:

- `pyproject.toml` includes backend entrypoint and runtime assets
- wheel build runs frontend build and includes generated dist assets
- wheel build does not require pre-existing tracked dist assets
- installed wheel root contains:
  - `setta.plugin.json`
  - `README.md`
  - `backend/main.py`
  - `frontend/dist/index.js`
  - `frontend/dist/setta-watch-code-frontend.css`
- installed wheel root does not require repo source files
- source checkout remains free of tracked `plugins/setta-watch-code/frontend/dist/**`
  files after packaging tests
- default Setta extra includes `setta-watch-code==<version>` if the product
  default remains enabled

Tests:

- build wheel from source checkout
- verify the wheel build materializes dist assets without adding them to git
- install wheel beside packaged `setta`
- discover plugin from installed wheel
- backend probe succeeds from installed wheel
- frontend assets resolve from installed wheel
- uninstalling/removing plugin makes Watch Code unavailable

## Deletion Checklist

These old surfaces must be deleted, not wrapped:

- `internal/httpapi/watch_code_routes.go`
- `internal/watchcodehttp`
- `internal/watchcodeuisettings`
- `frontend/src/state/actions/project/watchCode.ts`
- frontend plugin host methods `setWatchCodeEnabled` and `setWatchCodeInputs`
- frontend plugin capability `mutateWatchCodeSettings`
- OpenAPI operations `setWatchCodeEnabled` and `setWatchCodeInputs`
- generated route constants for `/setWatchCodeEnabled` and
  `/setWatchCodeInputs`
- core MCP Watch Code tools
- core UI settings `core.watch_code.*`
- hard-coded frontend default `pluginData["setta-watch-code"]`
- generic project-view value type `dict[str, WatchCodePluginProjectData]`
- host runtime constant `WatchCodePluginDataKey = "setta-watch-code"`

If an implementation keeps one of these, it has not completed the standalone
conversion.

## Required Negative Checks

Run these checks before considering the plan done. Adjust paths only to exclude
docs, the plugin package itself, and tests that explicitly assert absence.

No checked-in or leftover generated frontend bundle output:

```bash
dist_root="plugins/setta-watch-code/frontend/dist"
bad_dist="$(
  {
    git ls-files -- "${dist_root}"
    git diff --cached --name-only -- "${dist_root}"
    git diff --name-only -- "${dist_root}"
    if [[ -d "${dist_root}" ]]; then
      git ls-files --others --exclude-standard -- "${dist_root}"
    fi
  } | sort -u
)"
if [[ -n "${bad_dist}" ]]; then
  printf '%s\n' "Remove generated setta-watch-code frontend dist artifacts:"
  printf '%s\n' "${bad_dist}"
  exit 1
fi
```

No core routes or generated route callers:

```bash
rg -n "setWatchCodeEnabled|setWatchCodeInputs|/setWatchCodeEnabled|/setWatchCodeInputs" \
  internal/httpapi frontend/src/openapi frontend/src/state backend/setta/types/generated
```

No Watch Code-specific frontend host API:

```bash
rg -n "mutateWatchCodeSettings|setWatchCodeEnabled|setWatchCodeInputs" \
  frontend/src/plugins frontend/plugin-sdk
```

No old core settings:

```bash
rg -n "core\\.watch_code|watchcodeuisettings|plugin::setta-watch-code::" \
  internal/uisettings internal/mcpx internal/httpapi frontend/src/state
```

No hard-coded provider ID in host runtime logic:

```bash
rg -n "\"setta-watch-code\"|WatchCodePluginDataKey" \
  internal frontend/src backend/setta/types/generated \
  -g '!internal/**/_test.go' \
  -g '!frontend/src/**/*.test.ts' \
  -g '!frontend/src/**/*.test.tsx'
```

Expected allowed non-plugin occurrences after cleanup:

- docs
- package/default dependency metadata
- tests that assert absence or first-party packaging
- plugin package files under `plugins/setta-watch-code`
- generated lockfile entries

If host runtime code still needs to mention the first-party plugin ID, the
provider boundary is not generic enough.

## Verification Commands

Run focused tests as each phase lands, then final verification:

```bash
./scripts/run_go_tests.sh
source activate.sh && ./scripts/run_backend_tests.sh
pnpm -C plugins/setta-watch-code/frontend typecheck
pnpm -C plugins/setta-watch-code/frontend test
pnpm -C plugins/setta-watch-code/frontend build
pnpm -C frontend exec vitest run frontend/src/plugins
./gcf.sh
./check_quality.sh
```

For UI work, run Chrome DevTools visual verification for:

- plugin enabled and control visible
- plugin disabled and control absent
- popover open on desktop
- popover open on mobile
- setting reveal highlights enabled/folders/files rows

## Final Acceptance Criteria

The conversion is done only when all of these are true:

- `setta-watch-code` has a packaged backend entrypoint.
- Watch Code provider selection requires backend probe output.
- A fixture plugin with a different plugin ID can satisfy the Watch Code backend
  contract in tests.
- The first-party plugin works from an installed wheel without repo source.
- Disabling or uninstalling the plugin removes Watch Code UI, routes, settings,
  MCP access, service startup, and code-update behavior.
- No core `/setWatchCode*` route exists.
- No frontend `setWatchCode*` host method exists.
- No `mutateWatchCodeSettings` capability exists.
- No core Watch Code UI-setting registration exists.
- No core Watch Code MCP tool exists.
- Generic plugin data surfaces do not hard-code Watch Code types or defaults.
- The Go Watch Code engine takes provider plugin ID explicitly.
- Existing plugin data is preserved when the plugin is unavailable.
- There are no compatibility shims, aliases, migrations, dual paths, fallback
  reads, fallback writes, or transitional adapters.
