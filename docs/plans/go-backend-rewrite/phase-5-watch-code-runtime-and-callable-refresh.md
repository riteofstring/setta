# Phase 5 Watch Code Runtime And Callable Refresh

## Purpose

This doc narrows the next bounded Phase 5 follow-up after the completed Go LSP
runtime, snapshot completion, manual `setCallable`, and generated-diagnostics
auto-refetch slices.

Go now owns the callable refresh primitives that Watch Code should reuse:

- generated Python materialization
- Python LSP session, diagnostics, completion, and signature help
- manual callable binding and param synthesis
- generated-diagnostics callable auto-refetch
- mismatch-refetch policy lookup from the Go settings runtime

What Go still does not own is the Watch Code runtime that should drive those
primitives.

## Status

Current repo status as of 2026-03-07:

- Phase 5 LSP work is complete through the signature-help follow-up slices 1
  and 2
- Slice 1 of this follow-up is now complete:
  - Go-owned project state now persists `watchCodeEnabled`,
    `watchCodeFolders`, `watchCodeFiles`, `watchCodeRegistry`, and
    `watchCodeBaselineByPath`
  - `internal/projectview` now exposes those fields to the frontend project
    snapshot
  - IDE mode now exposes Go-owned `setWatchCodeEnabled` and
    `setWatchCodeInputs` routes
  - enable/input mutations now normalize repo-relative inputs and baseline
    existing/new watched Python definitions in Go without creating sections
  - the frontend Watch Code controls now follow the authoritative
    `getLatestProjectState` hydrate path after successful mutations instead of
    assuming a Python-side websocket project-state push
- Go owns the reusable callable refresh path in:
  - `internal/lspsignature/service.go`
  - `internal/projectstate/callable.go`
  - `internal/projectstate/callable_refetch.go`
  - `internal/lsp/project_synchronizer.go`
- Python still owns the full Watch Code subsystem in:
  - `backend/setta/project_state/watch_code.py`
  - `backend/setta/project_state/code_files.py`
  - `backend/setta/project_state/base_project_manager.py`
- the current frontend already depends on Watch Code state and routes in:
  - `frontend/src/components/AppHeader/WatchCodeToggleButton.tsx`
  - `frontend/src/components/Panes/Overview/WatchCode/WatchCodePane.tsx`
  - `frontend/src/utils/generatedEndpoints.ts`
- the current Go repo now has a Watch Code runtime owner through the app
  handoff:
  - `internal/watchcode` owns parser-backed callable discovery, deterministic
    scan/delete/move planning, manager state, file-identity diffing, and the
    long-lived polling runtime
  - `internal/app` now starts and stops that runtime in IDE mode only
  - saved main project-state snapshots now sync normalized Watch Code configs
    into the runtime owner through the main runtime `AfterSave` hook

That means the active gap has narrowed past runtime ownership and into
project-state mutation application.

The active Slice 2 execution work is now narrowed in:

- `docs/plans/go-backend-rewrite/phase-5-watch-code-scan-diff-and-manager-foundation.md`
- Slice 2 Step 1 in that focused doc is now complete:
  - `internal/watchcode` owns parser-backed callable discovery and
    deterministic scan/delete/move planning
  - Slice 1 baseline parsing now reuses that shared parser owner
- Slice 2 Step 2 is now in progress:
  - `internal/watchcode` owns config snapshot normalization, desired watch-dir
    derivation, path matching, missing-dir ancestor fallback, file-event
    routing, file-identity snapshots, and the polling runtime owner
- the next focused apply/mutation doc is now in progress:
  - `docs/plans/go-backend-rewrite/phase-5-watch-code-projectstate-apply-and-section-mutation.md`
  - Step 1 there is now complete:
    - Go-owned file update/delete apply helpers now own move-aware
      registry/baseline rewrites
    - IDE app callbacks now route polling runtime updates/deletes into those
      helpers
    - additions now materialize placeholder registry entries with empty section
      lists until section mutation lands
- the remaining Slice 2/3 gap is now the section-mutation boundary:
  - section create/remove/rename still needs to move behind the new apply path
  - watcher-triggered callable refetch and warning notifications still sit
    above that boundary
- the completed runtime-owner work remains captured in:
  - `docs/plans/go-backend-rewrite/phase-5-watch-code-file-identity-runtime-owner.md`
  - file-identity snapshots remain the chosen move-detection owner
  - app lifecycle + save-time runtime sync are now complete there

## Scope

This focused follow-up covers:

- Go-owned Watch Code state fields on project state and frontend project view
- IDE-only Watch Code route transport for enable/input mutations
- repo-relative path normalization and Watch Code snapshot helpers
- robust Python top-level callable parsing for Watch Code discovery
- registry and baseline ownership in Go
- watched-file scan, delete, move, and rename handling
- callable section create/remove/rename and generated import updates
- reuse of the Go callable refresh path for signature changes
- code-section and bound code-file update integration
- watcher warning notifications when signature help cannot resolve params

## Non-Goals

- non-Python Watch Code support
- deployment/share/app mode Watch Code enablement
- preserving Python's exact watchdog topology or queue layering
- heuristic callable discovery or regex-based Python parsing
- broad notification-system redesign beyond reusing the existing frontend
  `Notification` websocket message
- broad generic filesystem-watch infrastructure beyond what Watch Code needs in
  this follow-up

## Inputs

- `docs/reference/watch-code.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `docs/plans/go-backend-rewrite/phase-5-signature-help-callable-refetch-and-param-synthesis.md`
- `backend/setta/project_state/watch_code.py`
- `backend/setta/project_state/code_files.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `tests/project_state/test_watch_code.py`
- `tests/project_state/test_auto_refetch_history.py`
- `frontend/src/components/AppHeader/WatchCodeToggleButton.tsx`
- `frontend/src/components/Panes/Overview/WatchCode/WatchCodePane.tsx`

## Current Python Behavior

The current Python Watch Code path is larger than a route pair:

1. `set_watch_code_enabled` toggles config state and baselines existing inputs
   when Watch Code is first enabled
2. `set_watch_code_inputs` normalizes repo-relative folders/files and baselines
   only new additions when Watch Code is already enabled
3. `WatchCodeManager.sync_from_backend` maintains config snapshots, watched
   directories, pending move state, and debounced scan/delete tasks
4. file scans parse top-level Python definitions/classes, diff against the
   registry/baseline, and create/remove/rename/update callable sections
5. signature changes reuse `gen_code.set_callable(..., refetch=True)`
6. unresolved signature help broadcasts a warning notification
7. inline code edits and bound code-file reloads both feed the same
   `handle_code_section_update` pathway

The important rewrite implication is that Watch Code is its own runtime owner.
It is not just "call `RefetchCallableParams` when a file changes."

## Dependency Finding

Four source-of-truth layers are still missing in Go:

1. Watch Code fields on `projectstate.Project` and `projectview.ProjectConfig`
2. Watch Code route transport for the existing frontend controls
3. a Go watch manager that owns parsing, diffing, registry/baseline updates,
   and watcher lifecycle
4. a Go code-file / inline-edit integration path that reuses the new callable
   refresh helper

Without those layers, implementing only the callable-refresh portion would
recreate Python-shaped hidden state and leave the active UI pointed at missing
transport.

## Working Decisions

- split Watch Code into its own follow-up doc
  - the remaining work is broader than the original Slice 3 wording in the
    signature-help doc
- keep Watch Code IDE-only first
  - deployment/share/app mode should stay blocked until the IDE path is stable
- preserve the current frontend route names unless a cleaner transport shape is
  clearly better
  - the existing UI already depends on `setWatchCodeEnabled` and
    `setWatchCodeInputs`
  - there is no product gain in renaming them during this migration
- use a real Python parser in Go
  - do not port Watch Code with regex or keyword heuristics
- keep registry and baseline in project state
  - watcher-local caches are fine for debounce/runtime bookkeeping only
  - product state must stay in the persisted project snapshot
- reuse the completed callable refresh primitives
  - signature-change and no-match behavior should flow through the Go
    `SetCallable` / `RefetchCallableParams` path, not a second param-synthesis
    implementation
- keep transport thin
  - routes should decode, enforce IDE-only policy, call services, and leave the
    frontend on one authoritative project-state hydrate path
- use the explicit hydrate route for Slice 1
  - the current generated frontend Watch Code endpoints still type both
    mutations as `null`
  - Go already has a dedicated `getLatestProjectState` route and no broader IDE
    project-state websocket push
  - Slice 1 should reuse that authoritative hydrate path instead of widening
    endpoint generation scope before the watcher runtime lands

## Recommended Option

Execute the Watch Code migration in three bounded slices:

1. project-state/schema and route transport foundation
2. watched-file runtime and registry/baseline diff owner
3. code-section/bound-file integration plus warning/verification finish

Rationale:

- the first slice restores the missing source-of-truth state fields and route
  transport that the existing frontend already depends on
- the second slice isolates the new fsnotify/parser/diff complexity behind a
  dedicated runtime boundary
- the third slice reuses the already-completed callable refresh path instead of
  widening Slice 1 into every watcher trigger at once

## Proposed Go Boundaries

### `internal/watchcode`

Own:

- Watch Code path normalization and config snapshots
- Python callable parsing for Watch Code discovery
- registry/baseline diffing
- fsnotify observer lifecycle, debounce, and watched-directory management
- scan/delete/move orchestration and watcher-local no-match notification
  deduping

Do not own:

- HTTP decoding
- persisted project-state writes
- raw LSP signature-help framing

### `internal/projectstate`

Own:

- Watch Code fields on persisted project state
- mutation helpers for:
  - enable/input changes
  - registry/baseline updates
  - section create/remove/rename helpers used by Watch Code
- callable refresh reuse points

Do not own:

- long-lived filesystem observers
- route policy

### `internal/httpapi`

Own:

- IDE-only `setWatchCodeEnabled` and `setWatchCodeInputs` route gating
- request decoding and error mapping
- authoritative project-state response payloads

Do not own:

- parsing logic
- watcher lifecycle
- callable synthesis semantics

### `internal/app`

Own:

- Watch Code runtime construction and shutdown
- wiring Watch Code to project-state save/update hooks, websocket delivery, and
  code-file refresh boundaries

Do not own:

- parser logic
- project-state mutation rules

## Implementation Slices

### Slice 1: Watch Code State And Transport Foundation

Status: complete

Deliver:

- add `watchCodeEnabled`, `watchCodeFolders`, `watchCodeFiles`,
  `watchCodeRegistry`, and `watchCodeBaselineByPath` to Go-owned project state
  and frontend project view
- add normalization helpers for repo-relative Watch Code inputs
- add IDE-only `setWatchCodeEnabled` and `setWatchCodeInputs` routes in Go
- add baseline helpers for:
  - enable-time existing-input scans
  - baselining only new inputs when Watch Code is already enabled
- keep responses authoritative so the existing frontend controls work without
  local mutation replay

Acceptance:

- the existing Watch Code UI can load/persist config against Go
- enabling Watch Code records a baseline without auto-creating sections
- adding new watched inputs while enabled baselines only the additions
- outside-repo inputs fail explicitly

### Slice 2: Watch File Runtime And Registry Diff Owner

Deliver:

- `internal/watchcode` manager with:
  - Python callable parsing
  - registry/baseline diffing
  - scan/delete/move handling
  - callable section create/remove/rename behavior
  - generated import update behavior
- app/runtime wiring for fsnotify observer startup and shutdown
- focused tests for baseline skip, new callable creation, rename, move, and
  delete behavior

Acceptance:

- watched-file changes create/remove/rename callable sections deterministically
- existing baseline data prevents retroactive section creation
- registry source paths stay correct after moves/renames

### Slice 3: Code-Section And Bound-File Refresh Finish

Deliver:

- inline code-section edits routed through the Go Watch Code manager
- bound code-file reload integration routed through the same manager
- signature-change refreshes reuse Go `RefetchCallableParams`
- no-match watcher warnings broadcast through the existing frontend
  `Notification` websocket path
- focused frontend verification for the Watch Code controls once Go transport is
  live

Acceptance:

- Watch Code refreshes from watched files, inline edits, and bound code files
  all reuse the same Go owner
- signature-help no-match warnings stay source-of-truth-driven, not heuristic
- existing Watch Code UI works end-to-end against the Go backend

## Verification Expectations

For Slice 1 implementation, require at minimum:

- Go unit tests for Watch Code input normalization and baseline helpers
- HTTP route tests for IDE-only gating and authoritative hydrate payloads
- frontend coverage for the Watch Code controls once the Go routes land

Completed for Slice 1:

- `./scripts/go.sh test ./internal/projectstate ./internal/projectview ./internal/httpapi -count=1 -timeout 180s`
- `pnpm -C frontend exec vitest run src/state/actions/project/watchCode.test.ts src/components/AppHeader/WatchCodeToggleButton.test.tsx`

For later slices, add:

- parser/diff tests for function/class discovery
- file move/delete/rename integration tests
- code-section update and bound-file reload integration tests
- notification delivery tests for unresolved params

## Open Questions

- which Go Python parser package is the best fit for stable top-level callable
  discovery without shelling out to Python
- whether Watch Code should own its own fsnotify observer entirely or coordinate
  with a later shared file-watch service once one exists

## Next Recommended Step

Continue with:

- `phase-5-watch-code-scan-diff-and-manager-foundation.md`
- execute its Step 1 parser/diff foundation before wiring the long-lived watch
  manager and later section mutation behavior
