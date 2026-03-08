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

- live frontend callers still hit Python for:
  - `POST /loadSettings`
  - `POST /saveSettings`
- current direct frontend callers include:
  - app-start settings hydration in
    `frontend/src/state/actions/settings.ts`
  - direct settings writes from project AI settings, plugin settings, rename
    refactor modal, and section tag color settings
- current Go subsystems still read a few settings-backed values from the
  settings project runtime document, not from a dedicated `SettingsState`
  service

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
- `docs/plans/go-backend-rewrite/phase-2-status-meta-read-route-closeout.md`
- `docs/plans/go-backend-rewrite/phase-3-project-state-core.md`
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
- `internal/app/rename_refactors.go`
- `internal/mcpx/server.go`

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
- current Go reads for:
  - rename refactor mode
  - auto-refetch-on-LSP-mismatch
  - section sizing policy / auto-layout sizing
  still parse those values from the settings project document
- there is no Go-owned owner for `setta-settings.json`
- there is no Go-owned `POST /loadSettings` or `POST /saveSettings`

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
- rename-refactor and auto-layout reads no longer depend on the settings
  project runtime document

### Slice 2: Thin Settings Transport And Realtime Update

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

### Slice 3: Settings Project Materialization Boundary

Deliver:

- an explicit follow-on decision and implementation for how settings-project
  edits materialize back into `SettingsState`
- tests proving that settings-project JSON-source edits and direct settings
  saves do not create dual truth

Acceptance:

- one owner is clearly canonical for runtime settings
- settings-project editing no longer relies on Python-only materialization
  paths

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

## Next Recommended Step

- implement Slice 1 first:
  - add `internal/settingsstate`
  - wire it into app startup
  - migrate current Go settings-backed reads to explicit helpers on that owner
- only after that lands, move `POST /loadSettings` and `POST /saveSettings`
  into Go
