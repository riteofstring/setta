# Phase 5 Watch Code File Identity Runtime Owner

## Purpose

This doc narrows the next bounded Watch Code step after the completed manager
foundation in `phase-5-watch-code-scan-diff-and-manager-foundation.md`.

Manager state, scan/delete/move planning, path matching, and file-event routing
are now owned in Go. What is still missing is the concrete runtime owner that
can turn real filesystem changes into those manager events and later project
state mutations.

## Why A New Focused Doc Exists

The earlier Slice 2 handoff said "add the concrete observer/file watcher
adapter". That wording is now too loose.

The current Python behavior depends on a source-of-truth move event with both
`src_path` and `dest_path`. The manager and scan planner already encode that:

- move destinations should keep tracked registry/baseline state
- moves between configs should split into source delete + destination scan
- renames should stay deterministic instead of falling back to content matching

The standard Go watcher option (`fsnotify`) does not expose a portable
destination path pair for file renames. Implementing move correlation by timing,
filename similarity, or content hashing would be heuristic and is explicitly out
of bounds for this rewrite.

That means the next step is not just "wire fsnotify into the manager". The next
step is choosing and implementing a robust runtime owner that preserves move
semantics without heuristics.

## Status

Current repo status as of 2026-03-07:

- Watch Code Slice 1 is complete:
  - persisted `watchCode*` state
  - IDE route transport
  - baseline-on-enable/new-input behavior
- Watch Code Slice 2 manager foundation is complete through:
  - parser-backed Python callable discovery
  - deterministic scan/delete/move plans
  - shared Slice 1 baseline parser reuse
  - config snapshot normalization
  - desired watch-dir derivation
  - missing-dir ancestor fallback
  - pending move and scheduled scan/delete state
  - file-event routing semantics over manager state
- the remaining active Watch Code gap is now the runtime owner itself:
  - no concrete watcher adapter is running in Go
  - no Go service currently converts real filesystem activity into manager work
  - no Go service currently drains scheduled scans/deletes into later apply
    callbacks

## Recommended Option

Use a Go-owned polling snapshot runtime with stable file identities.

Rationale:

- it preserves explicit move semantics without heuristic pairing
- it keeps recursive folder behavior straightforward
- it fits the clean service boundary already planned for `internal/watchcode`
- it avoids overcommitting to `fsnotify` rename behavior that does not satisfy
  the product requirement

Concretely:

- maintain a snapshot of tracked Python files under the configured watch inputs
- record a stable file identity per file
  - same identity + different path => move
  - same path + different metadata/content hash => modify
  - missing identity/path => delete
  - new identity/path => create
- feed the resulting events through the existing `internal/watchcode.Manager`
  instead of inventing a second mutation path

## Scope

This focused doc covers:

- the concrete `internal/watchcode` runtime owner
- tracked file snapshot state
- stable file identity collection
- polling loop / debounce cadence ownership
- recursive/non-recursive input scanning
- runtime draining of scheduled scans/deletes into callbacks

## Non-Goals

- final project-state section mutation wiring
- callable refresh reuse from watcher-triggered signature changes
- UI transport changes
- heuristic move pairing
- changing the current manager plan semantics

## Inputs

- `docs/reference/watch-code.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-runtime-and-callable-refresh.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-scan-diff-and-manager-foundation.md`
- `backend/setta/project_state/watch_code.py`
- `tests/project_state/test_watch_code.py`
- `internal/watchcode/manager.go`
- `internal/watchcode/plans.go`

## Working Decisions

- do not add heuristic move detection over `fsnotify`
- keep the manager as the only owner of Watch Code event semantics
- let the runtime owner detect file changes; let the manager translate them into
  scans/deletes/pending moves
- keep runtime callbacks thin and explicit
  - `OnFileUpdate`
  - `OnFileDelete`
- keep app wiring explicit
  - startup from the main IDE app only
  - sync from authoritative saved project-state snapshots
  - clean shutdown with the app runtime

## Implementation Steps

### Step 1: File Snapshot And Identity Foundation

Deliver:

- tracked file snapshot model in `internal/watchcode`
- stable file identity collection for tracked Python files
- snapshot diff that emits create/modify/delete/move events
- focused unit tests for:
  - rename within one watched folder
  - move across configs
  - recursive folder additions
  - ignored dir exclusion

Acceptance:

- moves are derived from stable identities, not timing or content heuristics
- recursive/non-recursive scans match the current manager semantics

### Step 2: Polling Runtime Owner

Deliver:

- long-lived Watch Code runtime service in `internal/watchcode`
- periodic scan loop over the tracked snapshot model
- manager event routing integration
- draining scheduled scans/deletes into explicit callbacks

Acceptance:

- real filesystem edits trigger manager work with deterministic ordering
- runtime shutdown is explicit and test-covered

### Step 3: App Wiring Handoff

Deliver:

- IDE app startup/shutdown wiring for the runtime owner
- sync from saved main project-state snapshots into the runtime service
- updated phase docs describing the next boundary for project-state mutation

Acceptance:

- the remaining work is narrowed to project-state apply callbacks and later
  callable-refresh/section-mutation reuse

## Verification Expectations

- `internal/watchcode` unit tests for snapshot diff + identity handling
- `internal/watchcode` integration tests with real temp filesystem edits against
  the polling runtime
- `internal/app` tests proving startup, sync, and shutdown wiring once Step 3
  lands

## Next Recommended Step

Execute Step 1 next:

- add the tracked file snapshot model and stable identity collector
- prove move detection from file identity, not watcher heuristics
- keep app wiring and project-state callbacks out of that first slice
