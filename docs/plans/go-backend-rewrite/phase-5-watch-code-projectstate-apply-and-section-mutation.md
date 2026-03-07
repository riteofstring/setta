# Phase 5 Watch Code Projectstate Apply And Section Mutation

## Purpose

This doc narrows the next Watch Code boundary after the completed runtime-owner
handoff in `phase-5-watch-code-file-identity-runtime-owner.md`.

Go now owns Watch Code state, route transport, parser/diff planning, manager
state, file-identity snapshots, the polling runtime owner, and IDE app
lifecycle wiring. What is still missing is the persisted project-state mutation
path above that runtime: file update/delete apply helpers, callable section
create/remove/rename behavior, and reuse of the completed callable-refresh
runtime.

## Status

Current repo status as of 2026-03-07:

- Watch Code Slice 1 is complete:
  - persisted `watchCode*` project state
  - IDE route transport
  - baseline-on-enable/new-input behavior
- Watch Code Slice 2 runtime ownership is complete:
  - parser-backed callable discovery
  - deterministic scan/delete/move plans
  - manager state and file-event routing
  - file-identity snapshots and polling runtime owner
  - IDE app startup/shutdown wiring
  - save-time sync from main project-state snapshots into the runtime owner
- Python still owns the apply/mutation layer in:
  - `backend/setta/project_state/watch_code.py`
  - `backend/setta/project_state/base_project_manager.py`
- the current active Go gap is now:
  - Go now owns file update/delete apply helpers and runtime callback wiring
    into persisted project state
  - Watch Code section create/remove/rename behavior is still Python-owned
  - watcher-triggered callable refetch still is not routed through the Go
    Watch Code apply path
  - warning notifications for unresolved signature help still are not emitted
    from Go Watch Code

## Scope

This focused doc covers:

- Go-owned `applyWatchCodeFileUpdate` / `applyWatchCodeFileDelete` equivalents
- move-aware baseline and registry rewrites on persisted project state
- callable section create/remove/rename application over the existing Watch Code
  scan/delete plans
- reuse of the completed Go callable refetch/signature-help path for
  watcher-triggered signature changes
- watcher warning notifications for unresolved signature help
- app callback wiring from `internal/watchcode.Service` into the new project
  state apply helpers

## Non-Goals

- changing Watch Code route names or frontend transport
- replacing the completed runtime owner
- non-Python Watch Code support
- deployment/share/app mode Watch Code enablement
- heuristic rename pairing or regex parsing
- broad notification-system redesign beyond reusing the existing warning
  message path

## Inputs

- `docs/reference/watch-code.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-runtime-and-callable-refresh.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-file-identity-runtime-owner.md`
- `backend/setta/project_state/watch_code.py`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_watch_code.py`
- `tests/project_state/test_auto_refetch_history.py`
- `internal/watchcode/plans.go`
- `internal/projectstate/watch_code.go`
- `internal/projectstate/callable.go`
- `internal/projectstate/callable_refetch.go`
- `internal/lspsignature/service.go`
- `internal/app/app.go`

## Current Python Behavior

The Python apply layer has four important responsibilities above the watcher
runtime:

1. move-aware file apply
   - `apply_scan_update(...)` rewrites `watchCodeBaselineByPath` and
     `watchCodeRegistry.sourcePath` when a tracked file moves, before applying
     callable diffs
2. persisted callable diff application
   - scan/delete plans create, rename, update, and remove callable sections and
     registry entries against the authoritative project snapshot
3. watcher-triggered callable refresh
   - signature changes route through `gen_code.set_callable(..., refetch=True)`
     for existing sections instead of maintaining a second param synthesis path
4. warning notifications
   - unresolved signature help produces a deduped warning notification instead
     of silently dropping the update

The rewrite implication is that the runtime owner is no longer the hard part.
The remaining hard boundary is authoritative project-state mutation.

## Working Decisions

- keep runtime callbacks thin
  - `internal/watchcode.Service` should call project-state helpers; it should
    not mutate the document directly
- keep move rewrites explicit
  - move handling should follow the source-of-truth `moved_from` data already
    produced by the runtime owner
- reuse `internal/watchcode` plans
  - do not create a second Watch Code diff engine inside `internal/projectstate`
- reuse the completed Go callable refetch path
  - signature updates should flow through the same `SetCallable` /
    `RefetchCallableParams` ownership already built for manual and
    diagnostics-triggered updates
- keep notifications explicit and deduped
  - reuse the existing frontend warning pathway instead of adding ad hoc state
- preserve persisted project-state as the product source of truth
  - runtime-local caches remain runtime bookkeeping only
- allow placeholder registry entries before section mutation lands
  - Step 1 now records additions in `watchCodeRegistry` with empty
    `sectionIds` / `sectionsCount`
  - Step 2 should treat those entries as pending callable sections instead of
    assuming every registry entry is already section-backed

## Implementation Steps

### Step 1: Projectstate File Apply Helpers

Status: complete on 2026-03-07.

Deliver:

- `internal/projectstate` helpers for:
  - apply file scan updates
  - apply file delete updates
  - move-aware baseline/registry source-path rewrites
- runtime methods that guard:
  - project existence
  - Watch Code enable state
  - Python target presence
  - watch-input matching
- focused tests for:
  - move within one config
  - move across configs
  - delete clearing baseline + registry
  - syntax-error no-op preservation

Acceptance:

- runtime callbacks can apply file updates/deletes without hidden watcher state
- move handling uses `moved_from`, not heuristics
- syntax errors preserve the last good registry state

Completed in this chunk:

- `internal/projectstate/watch_code_apply.go`
- `internal/projectstate/watch_code_apply_test.go`
- `internal/app/app.go`
- `internal/app/app_test.go`
- `internal/watchcode/service_test.go`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/watchcode ./internal/app -count=1 -timeout 180s`

### Step 2: Callable Section Mutation And Refetch Reuse

Deliver:

- Go-owned create/remove/rename helpers for callable sections driven by the
  existing Watch Code scan/delete plans
- registry entry updates for:
  - `sectionIds`
  - `sectionsCount`
  - `sourcePath`
  - canonical callable name
- reuse of the completed callable refetch path for signature changes

Acceptance:

- rename reuses existing section IDs
- removed callables delete sections only when no other variants remain
- signature changes route through the same callable synthesis path already used
  elsewhere in Go

### Step 3: App Callback Wiring, Warning Notifications, And Verification

Deliver:

- app callback wiring from `internal/watchcode.Service` into the new
  project-state apply helpers
- warning notification emission for unresolved signature help
- focused Go tests across:
  - `internal/projectstate`
  - `internal/watchcode`
  - `internal/app`

Acceptance:

- the Watch Code runtime produces persisted project-state changes end-to-end
- unresolved signature help emits one warning per callable/source until the
  state changes
- the remaining gap is narrowed to later inline-edit/bound-code-file reuse

## Verification Expectations

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/watchcode ./internal/app -count=1 -timeout 180s`
- add narrower package-level runs while developing each step
- if app callback wiring changes frontend-visible behavior later, expand into
  Playwright coverage in the existing Watch Code UI flow

## Next Recommended Step

Execute Step 2 next:

- port Go-owned section create/remove/rename helpers over the completed file
  apply path
- treat empty-section placeholder registry entries as pending callable sections
- keep warning notifications for Step 3 after callable refetch reuse lands
