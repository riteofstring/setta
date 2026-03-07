# Phase 4 Terminal Run-Code Migration

## Purpose

This doc narrows the remaining Phase 4 terminal work to migrating
`POST /api/runCode` onto explicit Go-owned runtime boundaries.

The terminal transport slices are already in Go. The remaining work is not
another PTY route port. It is the run-command planning and dispatch path that
currently spans request policy, project-state graph access, snapshot creation,
terminal allocation, and deployment session semantics.

## Status

Current repo status as of 2026-03-06:

- Go already owns terminal runtime and transport for:
  - websocket attach/read/write/resize
  - terminal delete
  - terminal interrupt
- Go now owns the first IDE manual-run planner under:
  - `internal/runs`
- the Go IDE planner currently supports:
  - manual Python/Bash code-section command planning
  - first-party generated-entry planning from `sectionId: null`
  - explicit generated Python section selection collapsing to project-entry
    behavior
  - `never`, `ephemeral`, and `always` snapshot modes
  - section-variant overrides applied against a cloned document
  - snapshot creation from code-file bindings on disk
- the Go IDE planner currently rejects:
  - explicit plugin-generated entry runs
    - Go classifies them explicitly instead of treating them as generic
      non-runnable sections
  - `paramOverrides`
    - Go project state does not yet model params, so the planner fails explicitly instead of guessing
- the Go rewrite now includes the first IDE `runCode` HTTP transport under:
  - `internal/httpapi/terminal_routes.go`
  - `internal/runs/service.go`
- the current Go IDE `runCode` route supports:
  - manual Python/Bash code-section runs
  - first-party generated-entry runs
  - `sectionVariantOverrides` applied against a cloned document without mutating the active section map
  - explicit valid attached-terminal reuse
  - attached-terminal validation and creation against the planner-resolved variant when needed
  - non-attached generated-entry reuse of existing top-level terminals when the matching PTY session is explicitly idle
  - top-level temporary-terminal creation for non-attached generated-entry runs when no reusable session exists
  - `drawSnapshotsBySectionId` application through Go-owned binary upload, artifact writes, and draw-section state updates
  - terminal-session open/reuse plus shell-command dispatch through `internal/terminals`
  - `Started command` backend-log notifications through a Go-owned broadcaster under `internal/backendlogs`
- the current Go IDE `runCode` route still rejects:
  - `cliId`
  - `paramOverrides`
- Python still owns `POST /api/runCode` under:
  - `backend/setta/routers/terminals.py`
- Python run-code behavior is currently split across:
  - request-policy and run-count handling in `backend/setta/routers/terminals.py`
  - terminal selection and command dispatch in `backend/setta/terminals/run_code.py`
  - IDE command planning in `backend/setta/project_state/base_project_manager.py`
  - deployment/share command planning in `backend/setta/project_state/share_runtime_state.py`
- the early structural blockers are largely cleared:
- `internal/projectstate` now includes a first runnable project-graph minimum:
  - entry code block ids
  - active section variants
  - code and terminal section impl kinds
  - generated section kinds
  - code language metadata and file binding metadata
  - generated code and metadata bindings
  - project codegen target metadata
  - attached-terminal validation
  - attached-terminal and temporary-terminal mutation helpers
- Go now has the first run snapshot creation and run-command builders for IDE manual code-section runs
- Go now owns the minimal IDE draw snapshot path across:
  - `internal/binary`
  - `internal/httpapi/binary_routes.go`
  - `internal/projectstate/draw_snapshots.go`
- Go now has the first IDE `runCode` route for:
  - manual code-section runs
  - generated-entry runs with explicit idle top-level terminal reuse plus
    top-level temporary-terminal fallback
- Go now includes deployment `runCode` groundwork under:
  - `internal/deployments`
  - deployment manifest/policy loading
  - deployment-mode base runtime loading from deployment `project.json`
  - session overlay ownership
  - share-session run-count reservation and rollback primitives
- Go now wires that deployment source of truth through startup/runtime under:
  - `internal/config`
  - `cmd/setta-server`
  - `internal/app`
  - `internal/wsapi`
- Go now also wires deployment `runCode` through that source of truth under:
  - `internal/httpapi/terminal_routes.go`
  - `internal/runs/service.go`
  - deployment policy enforcement
  - share-session overlay planning
  - `share_runs/<session>` snapshot roots
- Go does not yet have a `cliId` output transport equivalent
- Go now exposes current deployment session bootstrap and expiry cleanup under:
  - `internal/httpapi/deployment_routes.go`
  - `internal/app/deployment_cleanup.go`
- deployment share/app state + project-config transport still relies on Python,
  because Go does not yet own a frontend-facing project-state payload for those
  routes
- Go still does not model project-state params, so `paramOverrides` remain intentionally unsupported in the Go planner

## Scope

This focused plan covers:

- inventorying the current run-code product semantics
- defining the Go-owned service boundary for run-command planning and dispatch
- identifying the minimum Go project-state capabilities required before route migration
- sequencing the first implementation slices for `POST /api/runCode`

## Non-Goals

- porting detached run routes in this slice:
  - `POST /api/runDetached`
  - `POST /api/getRunStatus`
  - `POST /api/cancelRun`
- preserving Python route internals or manager shapes
- solving full project-state parity beyond what the run path needs first
- implementing the `cliId` branch in the first Go run-code slice
- shipping deployment/share `runCode` before Go owns deployment policy and session overlay semantics

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-transport-migration.md`
- `docs/plans/go-backend-rewrite/testing-strategy.md`
- `docs/reference/share-policy-flags.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `backend/setta/routers/terminals.py`
- `backend/setta/terminals/run_code.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/session_project_manager.py`
- `backend/setta/project_state/share_runtime_state.py`
- `backend/setta/runtime/context.py`
- `backend/setta/share/policy.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/routers/runs.py`
- `tests/terminals/test_run_code_attached_terminal.py`
- `tests/project_state/test_run_overrides.py`
- `tests/project_state/test_share_project_manager.py`
- `tests/routers/test_share_policy_routes.py`
- `frontend/src/state/actions/runOrImportCode.ts`
- `frontend/src/components/App/AppRenderer.tsx`

## Working Decisions

- do not fold run orchestration into `internal/terminals`
  - terminal runtime should continue owning PTY sessions, attachments, input, resize, delete, and interrupt
  - run-command planning and target-session selection need their own service boundary
- treat project-state graph access as a dependency, not an implementation detail
  - transport code should never decide which terminal is valid or which code section is runnable by guessing
- keep the first Go `POST /api/runCode` response body minimal
  - current frontend callers treat HTTP `200` as success and rely on side effects for everything else
- use project-state structure as the source of truth for attached-terminal validation
  - a terminal id is valid for a run only if the code section still points at it and the parent/child/type relationship is correct
- do not create temporary terminals as service-only PTY sessions
  - temporary terminals are user-visible product state and must flow through a project-state mutation path
- do not port Python's free-terminal reuse heuristic directly
  - Go needs an explicit reusable-terminal source of truth instead of child-process and elapsed-time checks
- defer the `cliId` branch until there is a real Go consumer for CLI streaming
- stage IDE manual-run support before deployment/share run support
  - deployment remains blocked on Go-owned policy and overlay session state

## Current Product Semantics Inventory

### Request Contract

`RunCodeRequest` currently includes:

- `projectConfigId`
- `sectionId`
- `terminalSectionId`
- `cliId`
- `runSnapshotMode`
- `drawSnapshotsBySectionId`
- `sectionVariantOverrides`
- `paramOverrides`

The current frontend callers use only a subset:

- IDE run path in `frontend/src/state/actions/runOrImportCode.ts`
  - passes `projectConfigId`
  - passes `sectionId`
  - passes an already-attached `terminalSectionId` if one exists
  - always passes `cliId: null`
  - may pass `runSnapshotMode`
  - may pass `drawSnapshotsBySectionId`
- deployment/app run path in `frontend/src/components/App/AppRenderer.tsx`
  - passes `projectConfigId`
  - passes `sectionId`
  - may pass `sectionVariantOverrides`
  - may pass `paramOverrides`
  - does not rely on `terminalSectionId` or `cliId`

### Route-Level Behavior

`route_run_code` currently does all of the following:

- enforces `allowRun`
- reserves a deployment-session run slot when `allowMultipleRuns=false`
- validates deployment override requests against share policy:
  - variant overrides require `allowVariantChanges`
  - param overrides require `allowParamChanges`
  - deployment always blocks CodeParam edits
- rolls back a reserved single-run slot if run startup fails
- increments the session run count after successful startup when the policy allows multiple runs
- broadcasts a backend log event with message `Started command`

### Command Planning Behavior

The current Python planners do more than shell-string concatenation:

- resolve the effective run target:
  - explicit `sectionId`
  - otherwise `entryCodeBlockId`
  - generated Python sections collapse to project-level entry behavior
- reject non-runnable code languages
  - only Python and Bash are runnable today
- flush or snapshot code files before execution
- update draw snapshots before planning the command
- apply `sectionVariantOverrides` and `paramOverrides` without mutating the base project state
- treat deployment/share runs differently from IDE runs:
  - deployment always snapshots from session-scoped state
  - `runSnapshotMode=never` is rejected for deployments
  - deployment snapshot roots live under the runtime root and are scoped by share session id

### Terminal Selection And Dispatch Behavior

The current run dispatcher follows this sequence:

1. If `cliId` is present, stream the command to a CLI client instead of a terminal.
2. Else, if `terminalSectionId` is present and still valid for the target code section, reuse it.
3. Else, if the target is a code section, ensure it has an attached terminal and use that.
4. Else, try to reuse a free terminal for the same project/share-session scope.
5. Else, create a temporary terminal section in project state and run there.

Important details:

- an invalid `terminalSectionId` is ignored rather than treated as fatal
- attached-terminal validity is structural, not just `terminal id exists`
- temporary terminal creation is a project-state mutation and a PTY allocation
- terminal reuse is scoped by `(project id, share session id)`

### Frontend Expectations

Current frontend consumers do not need a rich HTTP response from `runCode`.
What they do need is the set of side effects:

- terminal output reaches an attached or temporary terminal
- temporary terminals become visible through project-state updates
- deployment run-button UI can treat `200` as success and update local run-count UI
- policy failures surface as request errors instead of silent no-ops

## Current Go Gaps

The remaining gaps are no longer basic transport or project-graph modeling.
The open work is now concentrated in the higher-level run semantics:

- Go does not yet have a robust reusable-terminal pathway for non-attached runs
- Go does not yet have a `cliId` output transport equivalent
- Go does not yet have deployment/share run policy ownership for:
  - `allowRun`
  - `allowMultipleRuns`
  - per-session run-count reservation and rollback
- Go still does not model project-state params, so `paramOverrides` remain intentionally unsupported

These are real dependencies, not optional refinements.

## Proposed Go Boundaries

### `internal/terminals`

Keep ownership limited to terminal runtime concerns:

- open/reuse/list/delete terminal sessions
- attach output/history
- write input
- resize
- interrupt
- dispatch a shell command into an existing session once a caller has chosen the session

This package should not decide which section is runnable or whether a terminal
section is structurally valid for a code section.

### New `internal/runs`

Add a dedicated run orchestration package that owns:

- request normalization for `runCode`
- target section resolution
- attached-terminal validation through project-state data
- terminal selection:
  - explicit attached terminal
  - ensured attached terminal
  - temporary terminal allocation
- run-command dispatch onto terminals
- later reuse by detached-run work

Suggested service shape:

- `Planner`
  - depends on a project-state runtime API
  - returns a typed run plan, not just a shell string
- `Dispatcher`
  - depends on `internal/terminals`
  - executes a run plan against a terminal session

### Expanded `internal/projectstate`

The next dependency is not a route. It is a richer project-state model with the
minimum runnable graph needed by the run path:

- project configs with `entryCodeBlockId`
- sections and parent/child relationships
- active variants
- code section implementations with runnable language metadata
- terminal section implementations
- attached terminal linkage
- code file binding metadata
- mutations for:
  - ensuring an attached terminal
  - creating a temporary terminal

The first run-code slice should depend on explicit typed APIs here rather than
raw `map[string]any` traversal.

## Implementation Slices

### Slice 0: Planning And Inventory

Deliver:

- a dedicated Phase 4 run-code migration plan
- explicit inventory of the current Python run-code boundary
- a recommended Go package split for planning versus dispatch

Acceptance:

- the plan names the actual dependencies that block route migration
- the plan keeps `internal/terminals` narrow
- the next implementation step is clear and dependency-ordered

Status:

- complete

Completed:

- added this focused plan doc
- inventoried the Python run-code route, planner, and deployment policy dependencies
- confirmed that the current Go gap is primarily project-state and run planning, not transport

### Slice 1: Runnable Project Graph Minimum

Deliver:

- expand Go project-state modeling to answer the questions required by `runCode`
- add typed helpers to:
  - resolve the effective run target
  - validate attached-terminal relationships
  - identify runnable code sections and languages
- add mutations for:
  - ensuring an attached terminal
  - creating a temporary terminal

Acceptance:

- run-related decisions can be made from Go state without Python helpers
- attached-terminal validation is structural and typed
- temporary terminal creation flows through Go project-state mutation APIs

Status:

- complete

Completed:

- expanded `internal/projectstate` beyond project ids and names to include the first runnable graph minimum:
  - entry code block ids
  - sections
  - active variants
  - code and terminal section impls
  - code language metadata
  - code file binding metadata
- added typed run-facing helpers for:
  - resolving the effective run target from explicit section id or project entry section
  - identifying runnable code implementations
  - validating attached-terminal structure without Python helpers
- added Go project-state mutations for:
  - ensuring an attached terminal for a code section
  - creating a temporary top-level terminal
- kept the work scoped to project-state ownership:
  - no HTTP route changes yet
  - no run planner yet
  - no deployment/share policy port yet

Tests:

- `internal/projectstate/run_graph_test.go`
  - entry-code-block target resolution
  - runnable-language detection
  - attached-terminal structural validation
  - attached-terminal creation and reuse
  - temporary-terminal creation
- `./scripts/go.sh test ./internal/projectstate`
- full Go suite passes with `./scripts/go.sh test ./...`

### Slice 2: IDE Run Planner

Deliver:

- new `internal/runs` planner for IDE mode
- manual Python/Bash code-section command planning
- per-run override application against a copied state
- snapshot creation for the first supported run path

Acceptance:

- the planner does not mutate base state when applying run overrides
- invalid override keys and unknown variants fail explicitly
- the planner stays independent from HTTP transport

Notes:

- generated Python project-entry runs should stay deferred until Go owns enough
  codegen state to build them robustly
- `paramOverrides` remain deferred until Go project state owns parameter graphs;
  the planner should reject them explicitly instead of implementing a heuristic
  partial port

Status:

- complete for the current IDE caller surface

Completed:

- added `internal/runs/planner.go`
- added a transport-independent IDE planner that:
  - resolves the effective manual run target from `internal/projectstate`
  - applies section-variant overrides against a cloned document
  - promotes `runSnapshotMode=never` to `ephemeral` when overrides require an isolated snapshot
  - plans direct-file Python and Bash commands without depending on HTTP transport
- added snapshot creation for manual code-section runs:
  - `ephemeral` snapshots land under the runtime root
  - `always` snapshots land under `setta_files/code`
  - snapshot contents come from code-file bindings on disk
- made the first Go override boundary explicit:
  - unknown sections and unknown/mismatched variants fail explicitly
  - malformed param override keys fail explicitly
  - well-formed `paramOverrides` are rejected until Go owns parameter state

Tests:

- `internal/runs/planner_test.go`
  - direct-file planning for `runSnapshotMode=never`
  - snapshot creation for `ephemeral`
  - non-mutating section-variant overrides
  - explicit invalid override failures
  - explicit `paramOverrides` rejection
- `./scripts/go.sh test ./internal/runs`

### Slice 3: IDE Terminal Run Transport

Deliver:

- `POST /api/runCode` in Go for the first supported IDE path
- route-level selection of:
  - explicit valid attached terminal
  - ensured attached terminal
  - temporary terminal allocation
- command dispatch into the chosen terminal session
- backend-log start notification for the run

Acceptance:

- transport stays thin
- temporary terminals become visible through project-state mutation, not only in terminal runtime
- focused app-stack tests cover route success and failure paths

Status:

- in progress

Completed:

- added `internal/runs/service.go`
- added `internal/backendlogs/service.go`
- added the minimal binary/draw-snapshot runtime pieces in:
  - `internal/binary/store.go`
  - `internal/httpapi/binary_routes.go`
  - `internal/projectstate/draw_snapshots.go`
- added the first Go-owned `POST /api/runCode` handler in:
  - `internal/httpapi/terminal_routes.go`
  - `internal/app/app.go`
- kept the transport boundary narrow:
  - the handlers validate the current unsupported payload edges
  - `internal/runs.Service` owns planner invocation, attached-terminal reuse/ensure, PTY session open/reuse, and command dispatch
- implemented the first IDE transport behaviors:
  - `sectionVariantOverrides` now flow through the Go route into the planner
  - terminal validation and ensure now target the planner-resolved variant instead of the active base-state variant
  - explicit valid attached terminals are reused
  - missing attached terminals are created through Go project-state mutation before dispatch
  - generated-entry runs now reuse existing top-level terminals only when the
    matching PTY session is provably idle
  - generated-entry runs still create a top-level temporary terminal when there
    is no reusable PTY session
  - terminal sessions are opened lazily through `internal/terminals`
  - planned commands use explicit executable paths resolved from the host instead of assuming `python` is on the shell PATH
  - draw snapshot payloads are uploaded through a Go-owned binary store and applied before planning the command
  - draw snapshot artifacts are written under the Go-owned artifacts root and persisted back into draw-section state
  - successful dispatch now logs and broadcasts the Go-owned equivalent of Python's `Started command` backend log event
- added focused coverage in:
  - `internal/backendlogs/service_test.go`
  - `internal/httpapi/binary_routes_test.go`
  - `internal/httpapi/terminal_routes_test.go`
  - `internal/app/app_test.go`
  - `internal/app/websocket_test.go`

Tests:

- `./scripts/go.sh test ./internal/binary ./internal/projectstate ./internal/runs ./internal/httpapi ./internal/app`

Deferred Within Slice 3:

- temporary terminal allocation for non-attached/manual-non-code targets
- `cliId` output transport

Dependency Note:

- the remaining temporary-terminal path is not independently reachable yet in Go
- the current planner only returns runnable manual code sections, which always
  flow through attached-terminal ensure
- generated-entry run support is now tracked in:
  - `docs/plans/go-backend-rewrite/phase-4-generated-entry-runs-and-temp-terminals.md`

### Slice 4: Deployment/Share Run Support

Deliver:

- Go-owned deployment/share `allowRun` enforcement for `runCode`
- Go-owned `allowMultipleRuns` reservation and rollback behavior
- session-scoped snapshot planning for deployment runs
- deployment override validation against share policy

Acceptance:

- deployment runs use session-scoped state and snapshot roots
- single-run policy behavior matches the documented product rule
- the implementation is explicitly share-session-scoped

Blocked On:

- Go-owned deployment policy source of truth
- Go-owned session overlay state with runnable project graphs

## Open Questions

- does any real Go migration consumer need the `cliId` branch before detached-run work starts?
- how much of deployment/share run policy should move with the next slice versus waiting for more share-runtime consolidation?

## Recommended Option

Start Slice 4: deployment/share `runCode` policy and session-overlay behavior.

Rationale:

- the IDE path now covers both attached-terminal code runs and generated-entry
  terminal selection without relying on Python heuristics
- the remaining product gap for `runCode` is no longer terminal allocation, it
  is deployment/share policy ownership
- `cliId` remains lower leverage until there is a real Go-owned consumer for it

## Next Recommended Step

Continue with the focused deployment state-route follow-up doc:

- `docs/plans/go-backend-rewrite/phase-4-deployment-state-routes-and-projectstate-transport.md`

Immediate target:

- verify share/app frontend bootstrap and config switching against the new
  Go-owned deployment routes, then only widen backend work if a concrete
  transport mismatch appears
