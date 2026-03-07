# Phase 5 Watch Code Scan Diff And Manager Foundation

## Purpose

This doc narrows the active Slice 2 work from
`phase-5-watch-code-runtime-and-callable-refresh.md`.

Slice 1 is complete. Go already owns Watch Code state, route transport,
baseline-on-enable/new-input semantics, and frontend project-state hydration.

What Slice 2 still needs is the long-lived runtime owner that can turn watched
file changes into deterministic registry/baseline mutation plans before later
section-mutation and callable-refresh wiring.

## Status

Current repo status as of 2026-03-07:

- Phase 5 LSP work is complete through:
  - diagnostics
  - snapshot completion
  - diagnostics ignore-state transport
  - manual `setCallable`
  - generated-diagnostics callable auto-refetch
- Watch Code Slice 1 is complete:
  - Go persists `watchCode*` project state
  - Go exposes `setWatchCodeEnabled` / `setWatchCodeInputs`
  - Go baselines existing/new inputs without creating sections
  - frontend Watch Code controls rehydrate through `getLatestProjectState`
- Slice 2 Step 1 is now complete:
  - `internal/watchcode` now owns parser-backed Python callable discovery
  - deterministic scan/delete/move plans now exist over registry + baseline
    state
  - Slice 1 baseline parsing in `internal/projectstate/watch_code.go` now
    delegates to the shared parser owner instead of keeping a second parser
- Slice 2 Step 2 is now in progress:
  - `internal/watchcode` now owns config snapshot normalization,
    desired-watch-dir derivation, path matching, and missing-dir ancestor
    fallback
  - watcher-local pending move state and scheduled scan/delete bookkeeping now
    exist with stale-config cleanup
  - file-event routing now owns create/modify/delete/move scheduling semantics
    over the shared manager state
  - the new manager foundation keeps watcher state pure and testable before any
    fsnotify/observer integration
- the remaining active Watch Code gap is now beyond the manager/runtime owner:
  - Go now owns file update/delete callbacks into project-state apply helpers
  - section create/remove/rename and callable-refresh reuse still sit above the
    completed manager/runtime foundation

## Scope

This focused Slice 2 doc covers:

- `internal/watchcode` parser-backed callable discovery for watched Python files
- deterministic scan/delete/move planning over registry + baseline state
- watch-manager foundations for:
  - config snapshots
  - path matching
  - desired watch-dir calculation
  - debounce/delete scheduling boundaries
- refactoring the current Slice 1 baseline logic to reuse the new parser owner

## Non-Goals

- full section create/remove/rename mutation wiring in this focused doc
- `SetCallable` reuse from watcher-triggered signature changes in this focused
  doc
- inline code-section and bound code-file integration
- websocket warning notifications
- preserving Python's exact watchdog observer topology or queue layering

## Inputs

- `docs/reference/watch-code.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-runtime-and-callable-refresh.md`
- `backend/setta/project_state/watch_code.py`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_watch_code.py`
- `internal/projectstate/watch_code.go`

## Current Python Behavior

The Python Watch Code manager currently mixes three distinct responsibilities:

1. parsing watched Python files into canonical callable records
2. planning scan/delete/move effects over registry + baseline state
3. owning observer sync, pending-move bookkeeping, and debounced file-event
   execution

Go already covered the persisted state and route transport in Slice 1, but it
still does not have those runtime owners separated out.

## Working Decisions

- use `tree-sitter-python` in Go for watched-file callable discovery
  - do not shell out to Python or recreate the parser with regex
- split parser/diff logic from project-state mutation logic
  - `internal/watchcode` should produce source-of-truth callable records and
    update plans
  - `internal/projectstate` should remain the owner of persisted mutation
    application
- keep plans deterministic
  - sort identities and rename candidates so watcher behavior is stable and
    testable
- port move/delete planning explicitly
  - do not hide move semantics inside observer code
  - model source-path rewrites and baseline migration directly
- reuse the new parser owner in Slice 1 baseline logic immediately
  - avoid keeping two separate Python callable parsers in Go

## Implementation Steps

### Step 1: Parser And Diff Foundation

Status: complete on 2026-03-07.

Deliver:

- `internal/watchcode` callable model and `tree-sitter` parser for:
  - top-level `def`
  - top-level `async def`
  - top-level `class` via `__init__`
- canonical identity/module/symbol/signature/body derivation
- deterministic scan/delete/move plan builders over registry + baseline state
- refactor Slice 1 baseline code to reuse the shared parser

Acceptance:

- syntax errors short-circuit with an explicit parsed/not-parsed result instead
  of mutating registry state heuristically
- rename candidates are matched by kind + signature hash + body hash
- delete/move plans are deterministic and test-covered

### Step 2: Watch Manager Foundation

Status: in progress.

Deliver:

- `internal/watchcode` manager state for:
  - config snapshots
  - pending moves
  - desired watch-dir calculation
  - path matching for file/folder inputs
  - debounced scan/delete scheduling
- focused tests for recursive/non-recursive watch-dir matching and pending-dir
  ancestor fallback

Acceptance:

- desired watch dirs are derived from Slice 1 persisted inputs only
- recursive toggles and missing-dir ancestor fallback are deterministic
- file-event routing does not require section mutation wiring yet

Completed in this chunk:

- `internal/watchcode/manager.go`
- `internal/watchcode/manager_test.go`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/watchcode -count=1 -timeout 180s`

Still open in Step 2:

- concrete observer/file watcher integration over the new manager state
- runtime application of scheduled scans/deletes/pending moves ahead of later
  section mutation wiring

That remaining runtime-owner step is now narrowed in:

- `docs/plans/go-backend-rewrite/phase-5-watch-code-file-identity-runtime-owner.md`
- the new focused doc records why heuristic rename pairing is out of bounds and
  why file-identity snapshots are the recommended runtime owner
- Step 1 in that runtime-owner doc is now complete:
  - tracked file snapshots and stable file identities now exist
  - move detection is now proven from file identity instead of watcher
    heuristics
- Step 2 in that runtime-owner doc is now complete:
  - the long-lived polling runtime owner now exists
  - diffed file events now drain through the shared manager into callbacks

### Step 3: Runtime Wiring Handoff

Status: complete on 2026-03-07.

Deliver:

- a clear handoff from the manager foundation into later project-state mutation
  application
- updated Watch Code phase docs reflecting what remains for section mutation and
  callable refresh reuse

Acceptance:

- the remaining Slice 2/3 work is narrowed to runtime application and later
  integration hooks

Completed in this chunk:

- `internal/projectstate/watch_code.go`
- `internal/watchcode/service.go`
- `internal/app/app.go`
- `internal/app/app_test.go`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/watchcode ./internal/app -count=1 -timeout 180s`

## Verification Expectations

For Step 1 implementation, require at minimum:

- `internal/watchcode` unit tests for parsing identities/kinds/signatures and
  scan/delete/move planning
- regression coverage showing Slice 1 baselining reuses the shared parser

Completed in this chunk:

- `internal/watchcode/python_callables.go`
- `internal/watchcode/plans.go`
- `internal/watchcode/python_callables_test.go`
- `internal/watchcode/plans_test.go`
- `internal/projectstate/watch_code.go`
- `internal/projectstate/watch_code_test.go`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/watchcode ./internal/projectstate -count=1 -timeout 180s`

For Step 2, add:

- manager tests for path matching, desired watch-dir computation, and pending
  dir behavior

## Next Recommended Step

Execute the next focused doc:

- `docs/plans/go-backend-rewrite/phase-5-watch-code-projectstate-apply-and-section-mutation.md`
- Step 1 there is now complete:
  - Go-owned file update/delete apply helpers now sit behind the completed
    runtime callbacks
- execute Step 2 next:
  - port callable section create/remove/rename over that apply path
  - keep warning notification and inline-edit integration for later slices in
    that doc
