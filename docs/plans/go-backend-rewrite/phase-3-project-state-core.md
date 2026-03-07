# Phase 3: Project State Core

## Purpose

Phase 3 establishes the first Go-owned project-state subsystem: persisted
document shape, runtime ownership, revision tracking, and registry boundaries
that later realtime, terminal, LSP, MCP, and route work can build on.

This phase is about settling the core state contract before broad feature work
starts. It should not recreate the Python `BaseProjectManager` or treat the
Python `ProjectStateBackend` serialization as a compatibility target.

## Status

Current repo status as of 2026-03-06:

- Phase 1 foundation runtime is in place
- Phase 2 auth, mode policy, request context, and websocket auth entry points are in place
- the Go rewrite now includes `internal/projectstate` with:
  - file-backed document/store load-save behavior
  - an in-memory project runtime
  - monotonic runtime revision tracking
  - serialized mutation execution
- a main/settings runtime registry now exists and is wired into `internal/app`
- deployment overlays still live only in Python across:
  - `backend/setta/project_state/session_project_manager.py`
  - `backend/setta/project_state/project_manager_switcher.py`

## Scope

This phase should deliver:

- a Go-owned persisted project document contract
- file-backed load/save helpers for project state
- a runtime-local revision model
- a single-writer project runtime boundary
- a runtime registry for main/settings and later deployment-session overlays
- path policy hooks for project-owned artifact/code/json roots

## Non-Goals

- porting the full Python project-state object graph
- preserving Python `project.json` or route compatibility
- websocket broadcast fan-out or replay behavior
- LSP diagnostics, listener emits, or MCP scope integration
- autosave UX polish and debounce behavior
- live filesystem watchers
- full share/app business rules across every route family

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-1-foundation-runtime.md`
- `docs/plans/go-backend-rewrite/phase-2-auth-modes-request-context.md`
- `docs/plans/go-backend-rewrite/testing-strategy.md`
- `docs/reference/setta-files.md`
- `backend/setta/database/db_objs.py`
- `backend/setta/database/backup.py`
- `backend/setta/project_state/history.py`
- `backend/setta/project_state/session_project_manager.py`
- `backend/setta/project_state/project_manager_switcher.py`
- `tests/database/test_dbe_project_payload_validation.py`
- `tests/database/test_backup.py`
- `tests/project_state/test_history_coalescing.py`
- `tests/project_state/test_manual_save_queue.py`
- `tests/project_state/test_share_session_project_manager.py`

## Phase 3 Working Decisions

- do not port `BaseProjectManager` or its giant dependency surface
- introduce a dedicated Go boundary under `internal/projectstate`
- keep persistence, runtime ownership, and registry concerns separate:
  - store: file I/O, schema versioning, atomic saves
  - runtime: current snapshot, revision, mutation serialization
  - registry: runtime lookup for main/settings/session-scoped overlays
- prefer a single-writer runtime loop over scattered mutable shared state
- keep the first persisted document intentionally small and Go-shaped
- persist an explicit schema version instead of inheriting Python defaults or migrations
- use `internal/statefs` for atomic writes and root-constrained path handling
- keep main project state and settings project state as separate stores from the start
- defer live watchers until the runtime/store contracts are stable

## Package Direction

The expected Phase 3 package set is:

- `internal/projectstate/document.go`
- `internal/projectstate/store.go`
- `internal/projectstate/runtime.go`
- `internal/projectstate/registry.go`
- optional later split:
  - `internal/projectstate/share.go`
  - `internal/projectstate/paths.go`

Handlers should depend on the runtime/registry layer, not read or write files
directly.

## Reference Behaviors To Preserve Conceptually

These are the useful product semantics from the Python codebase, not a demand to
copy the implementation shape:

- missing `project.json` should load as a valid empty project state
- non-object project payloads should fail fast
- project-state revisions should change whenever the current state meaningfully changes
- queued mutations should finish before a manual save persists current state
- deployment/share sessions need an overlay model instead of writing back to the base document

## Implementation Slices

### Slice 1: Persisted Document And Store

Deliver:

- initial Go-owned project document envelope
- explicit schema version field
- file-backed store load/save APIs
- missing-file bootstrap behavior for first-run workspaces
- invalid/non-object payload rejection
- atomic save path via `internal/statefs`

Acceptance:

- missing `project.json` returns a valid empty document
- invalid JSON or non-object payload fails cleanly
- save/load round-trips are stable
- writes are atomic and verified with temp-dir tests

Status:

- complete

Notes:

- Slice 1 should not attempt the full section/param schema.
- Start with the smallest persisted envelope that later slices need.
- Unowned feature subtrees can remain narrowly isolated until their subsystem is rebuilt.

Completed:

- added `internal/projectstate` with:
  - `Document`
  - `Project`
  - `Store`
- chose a deliberately small first persisted envelope:
  - `schemaVersion`
  - `defaultProjectId`
  - `projects`
- made schema ownership explicit:
  - current Go document schema version is `1`
  - missing files bootstrap to an empty Go-owned document
  - existing files without the Go schema version fail instead of being treated as Python-compatible state
- implemented file-backed load/save behavior with:
  - path normalization
  - atomic writes through `internal/statefs`
  - optional locker injection with `NoopLocker` as the current default
- fail-fast validation rules for:
  - non-object JSON payloads
  - unsupported schema versions
  - blank project ids
  - blank project names
  - default project ids that do not exist in the project map

Tests:

- focused coverage in `internal/projectstate/store_test.go` for:
  - missing-file bootstrap
  - invalid JSON rejection
  - non-object payload rejection
  - unsupported schema-version rejection
  - save/load round-trip
  - invalid default-project rejection
  - readable JSON save output
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- the full project graph schema
- backup/versioning snapshots
- runtime revision tracking
- mutation queue/single-writer runtime ownership
- main/settings registry wiring

### Slice 2: Runtime And Revision Core

Deliver:

- `ProjectRuntime` with current snapshot access
- runtime-local monotonic revision tracking
- single-writer mutation loop
- explicit save and manual-flush hooks

Acceptance:

- concurrent mutations serialize through one owner
- revisions bump when the current state changes
- latest snapshot reads do not hit the filesystem directly
- save persists the current snapshot only after queued mutations complete

Status:

- complete

Completed:

- added `ProjectRuntime` in `internal/projectstate/runtime.go`
- runtime opens from the store once and keeps the current document in memory
- chose a simple monotonic revision contract:
  - runtime starts at revision `1` after successful load
  - successful state-changing mutations bump the revision
  - no-op mutations keep the current revision
- added a serialized write queue through a dedicated runtime goroutine
- added explicit runtime hooks:
  - `Snapshot`
  - `Mutate`
  - `Flush`
  - `Save`
  - `Close`
- kept reads cheap and explicit:
  - snapshots clone the current document
  - snapshot callers cannot mutate runtime-owned state accidentally
- kept save semantics aligned with the Python reference behavior:
  - queued mutations complete before a save writes to disk
  - save writes the current in-memory snapshot through the project-state store

Tests:

- focused coverage in `internal/projectstate/runtime_test.go` for:
  - initial load and starting revision
  - revision bump vs no-op mutation behavior
  - snapshot cloning semantics
  - serialized mutation ordering
  - `Flush` waiting for pending mutation completion
  - `Save` persisting the latest queued mutation
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- panic/error supervision strategy for future richer runtime operations
- mutation coalescing or undo/redo history
- autosave debounce behavior
- registry wiring for main/settings runtimes

### Slice 3: Runtime Registry And Main/Settings Split

Deliver:

- runtime registry for main project state and settings project state
- explicit runtime lookup by logical target
- startup wiring from `internal/app`

Acceptance:

- services can resolve main vs settings runtime through a narrow interface
- settings persistence does not share files or revisions with the main project runtime
- Phase 4 can depend on a registry instead of a giant app-state singleton

Status:

- complete

Completed:

- added `internal/projectstate/registry.go`
- chose explicit main/settings persistence targets under the resolved `setta_files` root:
  - main runtime: `project.json`
  - settings runtime: `setta-settings-project.json`
- added a narrow registry interface around:
  - path resolution
  - runtime lookup by logical target
  - lifecycle ownership for both runtimes
- wired the registry into `internal/app` so the app now owns:
  - the runtime supervisor
  - the project-state registry
  - coordinated shutdown for both
- kept the app boundary explicit instead of smuggling project state through HTTP handlers or a giant mutable app-state singleton

Tests:

- focused coverage in `internal/projectstate/registry_test.go` for:
  - main/settings runtime creation
  - target lookup errors
  - separate persistence and revision behavior
- added app-level coverage in `internal/app/app_test.go` for:
  - registry wiring at startup
  - separate main/settings runtime paths and saves
  - coordinated shutdown behavior staying intact
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- deployment/share session runtime overlays
- route-level runtime resolution helpers
- settings-project seeding logic beyond the current empty Go document bootstrap

### Slice 4: Deployment Session Overlays And Path Policy Hooks

Deliver:

- share/app overlay contract for per-session project state
- explicit save policy for persistent vs session-scoped runtimes
- artifact/code/json-root normalization hooks owned by project-state code

Acceptance:

- deployment session state can diverge from the base persisted document without overwriting it
- overlay boundaries are explicit enough for later websocket/runtime work
- path validation has one source-of-truth pathway

## First Recommended Work Item

Start with Slice 4 only.

That is the highest-leverage step because the persistent/runtime/registry
layers now exist, and the remaining missing Phase 3 boundary is deployment
session overlay ownership.

Specifically:

- define how share/app sessions derive isolated runtime state from a base runtime
- keep overlay save policy explicit so deployment sessions never overwrite persistent IDE state
- add only the minimum path-policy hooks needed for later websocket/runtime work
- avoid broad route migration until the overlay boundary is settled

## Test Plan

### Unit-Level

- missing-file load returns an empty document
- non-object and invalid JSON payloads fail cleanly
- save/load round-trip for the initial document envelope
- runtime revision bump behavior
- mutation serialization behavior

### Integration-Level

- app/runtime wiring can load project runtimes from a temp workspace
- manual save persists only after queued mutations complete
- main and settings runtimes remain isolated

### Later Expansion

- backup/versioning behavior
- deployment session overlay persistence rules
- artifact/code/json path policy integration
- route-level project-state mutation coverage

## Exit Criteria

- a Go project runtime exists without LSP, MCP, or websocket fan-out dependencies
- load/save/update flows are covered by Go tests using temp directories
- revision and runtime-ownership contracts are explicit
- Phase 4 can layer realtime/websocket behavior on top of runtime hooks instead of owning state

## Open Questions

- should the first Go project document keep one file for all project configs, or split per config earlier?
- are backup snapshots part of Phase 3 proper, or should they wait until autosave/manual-save behavior is rebuilt?
- should deployment overlays reuse the same runtime type with a different save policy, or wrap the base runtime with a session layer?

Resolved In Slice 1:

- the first Go document is a single file with a small project index, not a port of Python `ProjectStateBackend`
- the store rejects schema-less legacy-looking files instead of implicitly treating them as compatible input

Resolved In Slice 2:

- runtime revision is monotonic and runtime-local rather than derived from file timestamps or persisted counters
- mutation serialization is owned by the runtime queue, not scattered across handlers or filesystem helpers
- save is an explicit runtime operation that runs after earlier queued mutations, not a direct store call from callers

Resolved In Slice 3:

- main and settings project state are separate runtimes with separate backing files from the start
- `internal/app` owns project-state registry lifecycle directly instead of leaving runtime lookup to transport code
- later phases can depend on runtime lookup by logical target rather than reconstructing file paths ad hoc

## Next Recommended Step

Implement Slice 4.

Specifically:

- add a deployment/session overlay layer on top of the current registry/runtime model
- decide whether overlays should wrap a base runtime snapshot or hydrate a session runtime directly from persisted state
- keep route migration deferred until deployment overlay ownership and save rules are explicit
