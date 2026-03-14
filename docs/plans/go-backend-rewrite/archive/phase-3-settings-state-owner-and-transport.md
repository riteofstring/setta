# Phase 3 Settings State Owner And Transport

## Purpose

This doc records the next bounded implementation plan after the status/meta
read closeout: establish a real Go-owned `SettingsState` source of truth and
move the live `POST /loadSettings` and `POST /saveSettings` callers onto it.

This is not a thin route port. The current repo already has a Go-owned
settings-project runtime for `setta-settings-project.json`, but the live
frontend settings hydration and direct settings saves still use Python's
separate `SettingsFile` owner over `setta-settings.json`.

The point of this plan is to settle that boundary explicitly before adding more
transport.

## Current Status

Completed before this plan:

- Phase 3 project-state persistence/runtime ownership is landed
- the app now opens a Go-owned main project runtime and a Go-owned settings
  project runtime
- the Phase 2 status/meta closeout moved:
  - `GET /backendInitStatus`
  - `GET /authRefreshStatus`
  - `GET /settaHomeInfo`
- that closeout explicitly deferred `POST /loadSettings` because Go still had
  no dedicated `SettingsState` owner

Current repo reality:

- the first three settings-state slices are now landed:
  - `internal/settingsstate` owns embedded defaults plus a file-backed
    store/runtime over `setta-settings.json`
  - the Go app now opens that settings-state runtime separately from the
    settings project runtime
  - app-owned rename-refactor mode and callable-mismatch auto-refetch policy
    reads now come from the new settings-state owner
  - project-state structural mutation policy reads now resolve through an
    explicit settings-state query instead of parsing the settings project
    document
  - the following Go mutation surfaces now consume resolved
    `StructuralMutationSettings` from `setta-settings.json`:
    - project-state auto layout
    - section sizing writes
    - top-level section creation
    - child section creation / incrementer creation
    - code-section attached terminal normalization
  - the IDE HTTP route and MCP structural tools that depend on those policies
    now resolve them from the settings-state runtime
- the thin settings transport is now also Go-owned:
  - `POST /loadSettings`
  - `POST /saveSettings`
  - websocket `UpdateSettings` broadcast after successful save
- the explicit settings-project materialization path is now also Go-owned:
  - saving the settings-project runtime overlays its active json-source
    sections onto the current live `SettingsState` snapshot
  - the live settings runtime then persists the resulting
    `setta-settings.json` document and broadcasts websocket `UpdateSettings`
- current direct frontend callers include:
  - app-start settings hydration in
    `frontend/src/state/actions/settings.ts`
  - direct settings writes from project AI settings, plugin settings, rename
    refactor modal, and section tag color settings
- the remaining settings-project gap is no longer live settings ownership:
  it is the future reverse-projection/editor-sync work that should only land
  with a concrete Go-owned settings-project transport caller

## Scope

This plan should deliver:

- a Go-owned settings-state package and runtime over `setta-settings.json`
- an explicit source-of-truth contract for live settings hydration and save
- thin Go transport for:
  - `POST /loadSettings`
  - `POST /saveSettings`
- explicit read helpers for the settings-backed values current Go runtime code
  actually consumes
- a documented relationship between the settings-state owner and the separate
  settings-project runtime

## Non-Goals

- porting Python's `SettingsFile.find_path_for_settings_slice(...)` file-routing
  model as a compatibility requirement
- preserving multi-file settings layout or legacy slice-to-path behavior unless
  a concrete caller requires it
- broad settings-project mutation parity in the same slice
- inventing a fake `SettingsState` by reverse-parsing the existing Go settings
  project runtime
- reopening unrelated project-state transport or websocket work
- recreating Python autosave manager behavior that the current Go runtime does
  not yet own

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-2-status-meta-read-route-closeout.md`
- `docs/plans/go-backend-rewrite/archive/phase-3-project-state-core.md`
- `docs/reference/setta-files.md`
- `backend/setta/routers/settings.py`
- `backend/setta/database/settings_file.py`
- `backend/setta/project_state/settings_project.py`
- `backend/setta/database/db_objs.py`
- `backend/setta/types/generated/settings_state.py`
- `backend/setta/types/settings_state.py`
- `tests/routers/test_settings_mode_guard.py`
- `tests/project_state/test_settings_project_json_source_load.py`
- `frontend/src/state/actions/settings.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `frontend/src/components/Modals/RenameReferencesModal/RenameReferencesModal.tsx`
- `frontend/src/components/Panes/UiEditor/SectionConfig/SectionTagColorSettings.tsx`
- `frontend/src/state/actions/websocketReceive.ts`
- `internal/projectstate/settings_backend.go`
- `internal/projectstate/auto_layout.go`
- `internal/httpapi/project_routes.go`
- `internal/app/app.go`
- `internal/app/websocket_test.go`
- `internal/app/rename_refactors.go`
- `internal/mcpx/server.go`
- `internal/settingsstate/materializer.go`
- `internal/settingsstate/materializer_test.go`

## Current Python Boundary

Python currently splits settings into two different owners:

1. `SettingsFile` in `backend/setta/database/settings_file.py`
   - owns live `SettingsState` load/save behavior
   - reads and writes `setta-settings.json`
   - merges missing default keys on load
   - rejects non-object JSON payloads
   - reloads and broadcasts websocket `UpdateSettings` after save

2. settings project state in `backend/setta/project_state/settings_project.py`
   - represents settings as editable project-state sections/code-objects
   - is used to decide which settings slices map to which JSON files
   - can flush JSON-source-backed values back into settings files on save

Important implication:

- Python's settings project is not the same thing as `SettingsState`
- `route_load_settings` and `route_save_settings` talk to `SettingsFile`, not
  to the settings project manager

## Current Go Boundary

Current Go behavior is different:

- `internal/projectstate` already owns the settings project runtime for
  `setta-settings-project.json`
- `internal/settingsstate` now owns live `SettingsState` over
  `setta-settings.json`
- current Go reads for:
  - rename refactor mode
  - auto-refetch-on-LSP-mismatch
  - section sizing policy / auto-layout sizing
  now resolve from the settings-state owner instead of the settings project
  document
- thin Go transport now serves:
  - `POST /loadSettings`
  - `POST /saveSettings`
- successful settings saves now broadcast websocket `UpdateSettings`
- successful settings-project saves now materialize live settings through the
  same settings-state runtime and broadcast websocket `UpdateSettings` only
  when the live settings snapshot actually changes

Important implication:

- the current Go settings project runtime cannot be treated as a drop-in
  `SettingsState` source of truth
- doing so would couple live settings hydration to project-document parsing and
  preserve Python-shaped indirection instead of creating a clear Go boundary

## Working Decisions

- introduce a dedicated Go owner under a separate package, not inside
  `internal/projectstate`
- make `setta-settings.json` the canonical source of truth for live
  `SettingsState` hydration and direct saves
- keep the current settings project runtime as a separate editor/runtime
  concern; it is not the settings source of truth
- do not port Python's per-slice multi-file routing unless a concrete product
  need appears later
- migrate current Go runtime readers away from parsing settings values out of
  the settings project document
- when materializing settings-project saves, overlay them onto the current live
  settings snapshot instead of reconstructing live settings from the settings
  project alone
- keep transport thin; route logic should call the settings-state service and
  websocket broadcaster, not reimplement merge/persistence rules

## Recommended Design

Introduce a new `internal/settingsstate` package with four responsibilities:

1. file-backed store over `setta-settings.json`
   - missing file bootstraps to canonical defaults
   - non-object JSON fails fast
   - save is atomic through `internal/statefs`

2. runtime ownership
   - load once at startup
   - keep a current snapshot in memory
   - serialize writes through one owner
   - expose save/update hooks plus current snapshot reads

3. explicit settings queries for current Go consumers
   - rename refactor mode
   - auto-refetch callable params on LSP mismatch
   - section sizing policy / auto-layout sizing inputs
   - later settings-backed reads can be added here instead of re-parsing the
     settings project document

4. route/websocket integration
   - `POST /loadSettings` returns the current canonical snapshot
   - `POST /saveSettings` persists the new snapshot, then broadcasts
     `UpdateSettings`

Validation guidance:

- do not block the first slice on a hand-written Go port of every nested
  `SettingsState` struct
- the first owner should guarantee a canonical JSON-object shape with seeded
  defaults and explicit validation for the settings fields Go actually
  consumes today
- if deeper server-side validation becomes necessary later, add it at this
  boundary instead of falling back to settings-project parsing

## Settings Project Relationship

The clean-break direction should be:

- `setta-settings.json` is the live runtime settings source of truth
- `setta-settings-project.json` is a separate projection/editor surface

That means later settings-project work should choose an explicit sync path,
not an implicit one. Recommended rule:

- if a route is a direct settings read/write route, it goes through
  `internal/settingsstate`
- if a route edits the settings project document as project state, it can use
  `internal/projectstate`, but any persistence back into live settings must go
  through an explicit settings-state materialization step

Do not implement a heuristic backdoor where one runtime silently treats the
other as authoritative.

## Implementation Slices

### Slice 1: Settings State Store, Runtime, And Read Helpers

Status:

- completed

Deliver:

- `internal/settingsstate` store/runtime over `setta-settings.json`
- default bootstrap and missing-key merge behavior
- focused query helpers for current Go consumers
- app wiring for the new settings-state owner
- migration of current Go settings-backed reads away from
  `internal/projectstate/settings_backend.go`

Acceptance:

- missing `setta-settings.json` yields a valid default snapshot
- non-object payloads fail cleanly
- save/load round-trips preserve the canonical settings object
- rename-refactor, callable-mismatch, and auto-layout / section-sizing reads
  no longer depend on the settings project runtime document

Completed in the first foundation landing:

- added `internal/settingsstate` with:
  - embedded checked-in defaults from `internal/settingsstate/defaults.json`
  - file-backed store load/save behavior over `setta-settings.json`
  - a bounded in-memory runtime with snapshot and serialized mutation/save APIs
  - explicit read helpers for:
    - `backend.renameRefactorMode`
    - `backend.autoRefetchCallableParamsOnLspMismatch`
- added `scripts/generate_settingsstate_defaults.py` so the embedded defaults
  can be regenerated from the current Python `SettingsState` model without
  making Python a runtime dependency of the Go server
- wired the new runtime into `internal/app`
- moved app-owned rename-refactor and callable-mismatch policy reads off the
  settings project runtime document and onto the new settings-state owner

Completed in the structural settings landing:

- added a bounded `settingsstate.StructuralMutationSettingsForDocument(...)`
  query that resolves:
  - section sizing policy overrides from `sectionSizingPolicy.byType`
  - concrete terminal default height from `terminalSectionDefault.size.height`
- introduced `projectstate.StructuralMutationSettings` so project-state
  mutation APIs consume resolved settings inputs instead of raw settings
  project documents
- moved the remaining auto-layout / section-sizing policy reads used by
  project-state, HTTP auto-layout transport, and MCP structural mutations off
  the settings project runtime document and onto the settings-state owner

### Slice 2: Thin Settings Transport And Realtime Update

Status:

- completed

Deliver:

- `POST /loadSettings` in Go
- `POST /saveSettings` in Go
- websocket `UpdateSettings` broadcast after successful save
- route/app tests covering mode guards and happy paths

Acceptance:

- app-start frontend settings hydration no longer depends on Python
- direct settings writes from the current frontend callers persist through Go
- websocket-driven settings updates still reach the frontend store

Notes:

- Python currently cancels pending autosaves when `backend.autosave` is turned
  off, but the current Go runtime does not yet own that autosave subsystem.
- do not invent partial autosave behavior here; record it as deferred unless a
  later autosave owner makes it real.

Completed in the thin transport landing:

- added Go-owned `POST /loadSettings` and `POST /saveSettings` routes over the
  existing `internal/settingsstate` runtime
- kept the route layer thin by normalizing through
  `settingsstate.NormalizeRaw(...)`, persisting with the runtime owner, and
  broadcasting through the existing websocket hub
- added `realtime.MessageTypeUpdateSettings` plus a bounded Go websocket
  message builder for frontend settings updates
- wired the settings routes into `internal/app`
- added focused route tests for:
  - full-IDE mode guards
  - load snapshot reads
  - save persistence
  - invalid non-object settings payloads
- added an app websocket test proving `saveSettings` updates the runtime owner
  and pushes `UpdateSettings` to a connected frontend

### Slice 3: Settings Project Materialization Boundary

Status:

- completed for the current bounded scope

Deliver:

- an explicit follow-on decision and implementation for how settings-project
  edits materialize back into `SettingsState`
- tests proving that settings-project JSON-source edits now flow through the
  same live settings owner instead of the old Python-only flush path

Acceptance:

- one owner is clearly canonical for runtime settings
- settings-project editing no longer relies on Python-only materialization
  paths

Completed:

- added `settingsstate.ApplySettingsProjectDocument(...)` as the explicit
  materializer from the saved settings-project document into the canonical live
  settings document
- chose an overlay strategy instead of rebuilding from defaults or from the
  settings-project document alone:
  - the materializer starts from the current live settings snapshot
  - active settings-project json-source sections then overwrite only the paths
    they currently own
  - unchanged/missing sections therefore do not clobber unrelated live
    settings values
- wired the settings-project runtime `AfterSave` hook in `internal/app` so a
  settings-project save now:
  - materializes through `internal/settingsstate`
  - persists `setta-settings.json`
  - broadcasts websocket `UpdateSettings` when the live snapshot changed
- added focused tests for:
  - unit-level json-source materialization into `settingsstate.Document`
  - app-level save-hook integration proving settings-project saves update the
    live settings runtime, persist `setta-settings.json`, and push
    `UpdateSettings` to a connected frontend

## Verification Targets

- `./scripts/go.sh test ./internal/settingsstate -count=1`
- `./scripts/go.sh test ./internal/app -run 'Settings' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Settings' -count=1`
- targeted updates to current project-state tests that still depend on settings
  project document reads
- `./scripts/go.sh test ./... -run '^$'`

## Decisions Made

- treat this as a Phase 3 source-of-truth problem, not a generic route
  migration
- do not use the settings project runtime as a stand-in for live
  `SettingsState`
- prefer a dedicated Go settings-state owner over copying Python's settings
  slice-to-file indirection
- use an embedded checked-in `defaults.json` generated from the current
  `SettingsState` model as the runtime seed for now, instead of making Go
  depend on Python at runtime or hand-porting the full nested schema up front
- do not introduce a heuristic or implicit cross-runtime authority rule:
  settings-project saves call an explicit materializer into the live settings
  owner, and future reverse sync should be another explicit slice when a real
  Go caller exists

## Progress Notes

- 2026-03-09: reranked the remaining small live frontend routes after the
  status/meta closeout and confirmed that `loadSettings`/`saveSettings` are the
  next real caller-backed gap.
- 2026-03-09: confirmed from Python that `SettingsState` lives behind
  `SettingsFile` and `setta-settings.json`, while the settings project is a
  separate editable projection/materialization path.
- 2026-03-09: confirmed from Go that current settings-backed reads still parse
  values from the settings project runtime document, so a direct route port
  would leave dual truth.
- 2026-03-09: landed the first settings-state foundation slice with a dedicated
  `internal/settingsstate` owner plus app-owned rename-refactor and
  callable-mismatch policy reads moved onto it.
- 2026-03-09: landed the structural settings follow-on so project-state
  auto-layout / section sizing mutations plus HTTP and MCP callers now resolve
  canonical settings from `setta-settings.json` instead of the settings
  project runtime document.
- 2026-03-09: landed Slice 2 so Go now owns `POST /loadSettings`,
  `POST /saveSettings`, and websocket `UpdateSettings` broadcast for the live
  frontend settings hydration/save path.
- 2026-03-09: landed Slice 3 so settings-project saves now materialize active
  json-source sections back into the Go-owned live settings runtime and
  persist/broadcast through the same `setta-settings.json` owner.

## Next Recommended Step

- no further Phase 3 settings-state ownership work is required for the current
  direct frontend surface
- if a future Go-owned settings-project load/save transport is introduced,
  pair it with an explicit reverse projection from live settings into the
  settings-project runtime so editor freshness remains explicit instead of
  heuristic
