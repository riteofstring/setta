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
- Python still owns `POST /api/runCode` under:
  - `backend/setta/routers/terminals.py`
- Python run-code behavior is currently split across:
  - request-policy and run-count handling in `backend/setta/routers/terminals.py`
  - terminal selection and command dispatch in `backend/setta/terminals/run_code.py`
  - IDE command planning in `backend/setta/project_state/base_project_manager.py`
  - deployment/share command planning in `backend/setta/project_state/share_runtime_state.py`
- Current Go gaps are structural:
- `internal/projectstate` now includes a first runnable project-graph minimum:
  - entry code block ids
  - active section variants
  - code and terminal section impl kinds
  - code language metadata and file binding metadata
  - attached-terminal validation
  - attached-terminal and temporary-terminal mutation helpers
- Go does not yet have run snapshot creation or run-command builders
- Go does not yet have a backend-log event sink for run start notifications
- Go does not yet have a `cliId` output transport equivalent
- Go does not yet have the deployment/share `allowRun` and `allowMultipleRuns` source of truth needed for the deployment run path

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

The route cannot move to Go yet because the missing pieces are below transport:

- `internal/projectstate` does not yet model:
  - `entryCodeBlockId`
  - section graphs
  - active variants
  - code section implementations or languages
  - terminal section implementations
  - attached terminal ids
  - code file bindings
- Go does not yet have a run planner that can:
  - snapshot runnable files
  - build Python or Bash commands
  - apply per-run overrides against a copied state
- Go does not yet have a project-state mutation path for:
  - `ensure_code_section_attached_terminal_for_run`
  - `create_temporary_terminal`
- Go does not yet have deployment/share run policy ownership for:
  - `allowRun`
  - `allowMultipleRuns`
  - per-session run-count reservation and rollback

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

- should the first Go run planner support generated Python project-entry runs immediately, or start with manual runnable code sections only?
- do we need backend-log broadcast parity in the first route slice, or can that land one slice later if terminal output already proves the run started?
- does any real Go migration consumer need the `cliId` branch before detached-run work starts?

## Recommended Option

Start with manual Python/Bash code-section runs in IDE mode before generated
Python entry runs.

Rationale:

- Go currently has no codegen subsystem at all
- manual code sections exercise the critical new boundaries without dragging in a
  second large dependency
- the temporary-terminal and attached-terminal behaviors can still be rebuilt
  cleanly on top of the new run planner

## Next Recommended Step

Implement Slice 2:

- add `internal/runs` for IDE-mode run planning
- start with manual Python/Bash code-section command planning and override application
- keep generated project-entry runs and deployment/share policy work deferred until the planner boundary is stable
