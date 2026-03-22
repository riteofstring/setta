# Project Mutation Latency Plan

Date: 2026-03-24
Branch: `go-rewrite` (`88cf75eba`)

## Goal

Reduce the user-visible latency of three interactive flows on the Go rewrite:

- creating a new project from the home page
- creating sections on the project canvas
- clicking list incrementer/decrementer controls

The target is not "make Go faster than Python in theory". The target is to remove
avoidable synchronous work from the hot path so the Go rewrite stops doing more
per interaction than `main`.

## Current Findings

### 1. Interactive mutations currently persist synchronously

The Go runtime hot path uses `MutateAndSave`, which applies the mutation and then
persists the snapshot before returning. That means every structural click waits on
full-document persistence.

This is visible in:

- `internal/projectstate/runtime.go`
- `internal/projectshell/service.go`

The Python backend on `main` does not use that same shape for interactive project
state mutations. It updates in-memory state, broadcasts, and relies on autosave /
save orchestration separately.

### 2. Top-level section creation does extra work on this branch

The frontend currently does:

1. `createTopLevelSection`
2. `getLatestProjectState`
3. full frontend project-state replacement

That is an extra backend round trip and extra frontend store work that `main`
does not currently pay for the same action.

This is visible in:

- `frontend/src/state/actions/sections/createSections.ts`

### 3. Incrementer/decrementer routes rebuild a full frontend project view

The Go websocket update path converts the backend document into a fresh frontend
project payload on each mutation broadcast:

- `internal/httpapi/project_routes.go`
- `internal/projectview/single_config.go`

That means even a tiny subtree change pays a whole-project projection cost.

### 4. Observed request costs already line up with the complaint

Recent `backend.log` timings show:

- `createProjectConfig`: about 267 ms
- `createTopLevelSection`: about 37 ms
- `createChildSectionsViaIncrementer`: about 43-55 ms
- `deleteChildSectionsViaDecrementer`: about 36-47 ms

The same log also shows that section creation commonly triggers follow-up
mutations such as `setActiveIds` and `setTopLevelSectionLayout`, which are
additional persisted writes on the same interaction path.

## Plan

### Phase 1. Capture a clean baseline

- Measure the three target flows with CDP and the existing request log:
  - New Project from home
  - top-level section creation
  - list incrementer/decrementer
- Record the baseline in `perf/reports/fullstack/`.

### Phase 2. Remove synchronous persistence from the hot path

- Introduce a runtime mutation path that:
  - applies the mutation
  - updates revision / in-memory snapshot
  - returns immediately
  - schedules persistence out of band
- Keep explicit save operations (`Save`, manual save, app-definition compare-and-set
  flows that intentionally persist immediately) on the synchronous path.
- Ensure the deferred persistence path is serialized and write-coalesced so rapid
  UI interactions do not enqueue redundant full saves.

### Phase 3. Switch interactive mutation owners to the deferred path

- Move the specific user-facing flows called out here to the deferred-persist path:
  - project creation
  - structural section creation
  - incrementer/decrementer child mutations
  - closely-related follow-up layout/selection mutations that fire as part of the
    same UX loop

### Phase 4. Remove the extra top-level section refresh

- Restore a reliable live-update path for top-level section creation so the
  frontend does not need to call `getLatestProjectState` immediately after
  `createTopLevelSection`.
- Prefer a robust source-of-truth path:
  - either websocket broadcast with completed op ids
  - or a route response that already includes the authoritative updated project
    state
- Do not keep both pathways active for the same interaction unless required.

### Phase 5. Add regression coverage

- Go tests for deferred persistence behavior and correctness.
- App/websocket tests that ensure the live project-state update still arrives for
  section creation and incrementer/decrementer flows.
- Frontend tests for the create-section action so we do not regress back to an
  unnecessary full-state refetch.

### Phase 6. Re-measure and report

- Re-run the exact same CDP scenarios from Phase 1.
- Append the after measurements to the perf report.
- Confirm the latency improvement and note any tradeoffs (for example eventual
  save timing versus immediate disk persistence).

## Success Criteria

- New Project no longer spends most of its time in synchronous create/persist work.
- Creating a section no longer does an immediate `getLatestProjectState` follow-up.
- Incrementer/decrementer interactions feel materially faster and remain live.
- Persistence remains correct and deterministic.
- Tests cover the new deferred-persistence behavior.
