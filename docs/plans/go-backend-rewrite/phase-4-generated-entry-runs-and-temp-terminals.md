# Phase 4 Generated Entry Runs And Temporary Terminals

## Purpose

This doc narrows the next blocked Phase 4 run-code work to the dependency chain
behind temporary-terminal fallback.

The current Go route already handles manual Python/Bash code-section runs with
attached terminals. The remaining terminal-selection slice from the earlier plan
is not independently reachable yet. In the Python product, free-terminal reuse
and temporary-terminal creation matter mainly when the run target is generated
project-entry code rather than a manual runnable code section.

This plan captures the minimum Go-owned work needed to make that path real and
to record the remaining terminal-reuse follow-up after generated-entry runs are
reachable in Go.

## Status

Current repo status as of 2026-03-06:

- Go already owns the current IDE manual-run path for:
  - manual Python/Bash code-section planning
  - attached-terminal reuse and ensure
  - PTY session open/reuse and command dispatch
  - draw snapshot upload/application
  - `Started command` backend-log broadcast
- Go project state now includes the generated-entry minimum under:
  - `internal/projectstate`
  - project codegen target metadata
  - generated code and generated metadata bindings
  - generated section kinds for first-party Python and explicit plugin-owned
    generated surfaces
- the Go planner now supports generated-entry runs under:
  - `internal/runs/planner.go`
  - `sectionId: null` resolves to generated entry when first-party Python
    codegen is enabled
  - explicit generated Python section selection collapses to project-entry
    behavior
  - explicit plugin-generated selection fails with a domain error instead of a
    generic non-runnable failure
- the Go IDE `runCode` route now executes generated-entry runs end-to-end under:
  - `internal/runs/service.go`
  - `internal/httpapi/terminal_routes.go`
  - non-attached generated-entry runs create a top-level temporary terminal in
    project state, open the matching PTY session, and dispatch the planned
    command there
- Go now reuses non-attached generated-entry terminals only when:
  - project state already contains a top-level terminal section for the same
    project/share scope
  - the matching PTY session is still live
  - the terminal runtime can prove the shell is idle by checking that the PTY
    foreground process group still belongs to the shell itself
- Go still does not reuse non-attached terminals by heuristic
  - sessions with active foreground jobs are never reused
  - terminal sections without a live reusable PTY still fall back to creating a
    new top-level temporary terminal

## Scope

This focused plan covers:

- identifying the minimum project-state additions needed for generated-entry run
  planning
- defining the first Go-owned planner boundary for generated Python entry runs
- recording the remaining reusable-terminal follow-up now that temporary
  terminal creation is reachable through the generated-entry path

## Non-Goals

- full codegen subsystem parity in one slice
- plugin codegen execution in the first generated-entry slice
- detached-run migration
- deployment/share policy migration
- `cliId` transport

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-run-code-migration.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/session_project_manager.py`
- `backend/setta/project_state/share_runtime_state.py`
- `backend/setta/terminals/run_code.py`
- `tests/project_state/test_codegen_targets.py`
- `tests/terminals/test_run_code_attached_terminal.py`
- `frontend/src/state/actions/runOrImportCode.ts`
- `frontend/src/components/App/AppRenderer.tsx`
- `frontend/src/utils/codegenTargets.ts`

## Working Decisions

- do not implement free-terminal reuse or temporary-terminal creation in Go
  before the planner can actually produce a non-attached run target
- keep generated-entry planning under `internal/runs`
  - transport should continue passing request data only
  - terminal selection should still remain in `internal/runs.Service`
- stage first-party Python codegen before any plugin-codegen support
  - the frontend already has a clear first-party Python codegen signal
  - plugin targets can fail explicitly until Go owns a real plugin/codegen
    runtime boundary
- keep temporary terminals as explicit project-state mutations
  - no hidden service-only PTY sessions
  - user-visible temporary terminals must be created in `internal/projectstate`
- do not port Python's free-terminal reuse heuristic as-is
  - current reuse depends on PTY child-process inspection plus elapsed time
  - add an explicit reusable-session signal before Go reintroduces terminal
    reuse for non-attached runs

## Dependency Finding

The earlier Phase 4 run-code doc correctly identified temporary-terminal
fallback as remaining work, but the current Go rewrite has an additional
dependency that is now clear from the code:

- Python reaches the free-terminal / temporary-terminal branch when there is no
  attached code-section terminal to use
- in practice this happens for generated-entry runs, where:
  - the frontend sends `sectionId: null`, or
  - the frontend selects the generated Python section and then clears it to
    project-entry behavior
- the current Go planner cannot reproduce that because it only understands
  runnable manual code sections

That dependency is now cleared. Generated-entry runs are reachable in Go, and
the remaining follow-up is a better reusable-terminal source of truth.

## Current Product Semantics Inventory

### Frontend Caller Behavior

The current frontend distinguishes manual code runs from generated-entry runs:

- IDE run path in `frontend/src/state/actions/runOrImportCode.ts`
  - with Python codegen disabled:
    - running with `sectionId: null` requires a manual entry code block
  - with Python codegen enabled:
    - selecting the generated Python section collapses to `sectionId: null`
    - the backend is expected to run generated project-entry code
  - attached-terminal lookup only happens for base code sections
    - generated-entry runs therefore do not provide `terminalSectionId`
- app/deployment run path in `frontend/src/components/App/AppRenderer.tsx`
  - usually sends `sectionId: null`
  - relies on the backend entry-run planner, not an attached terminal id

### Python Planner Behavior

`BaseProjectManager.create_run_command(...)` currently does all of the
following:

- detects whether Python codegen is enabled for the project
- when codegen is disabled:
  - requires an explicit manual runnable code section or manual entry code block
- when codegen is enabled:
  - treats generated Python sections as project-entry behavior
  - builds generated Python code plus metadata
  - returns a command for the generated entry when `sectionId` is empty
- snapshots all relevant code inputs for ephemeral/always runs

### Python Terminal Selection Behavior

`backend/setta/terminals/run_code.py` currently:

1. reuses a valid attached terminal if present
2. ensures an attached terminal for manual code-section runs
3. otherwise tries to reuse a free project/share-scoped terminal
4. otherwise creates a temporary top-level terminal in project state

Go now covers step 4 for generated-entry runs through explicit temporary
terminal creation. Step 3 still remains as a follow-up because Go does not yet
have a robust reusable-terminal signal.

## Current Go Gaps

The remaining Go gaps are now narrower:

- free-terminal reuse for non-attached runs is still deferred
- plugin codegen now has a Go worker-backed execution/runtime boundary under
  `internal/plugins/codegen_runtime.go`, and the first output materializer above
  it now lives under `internal/codegen/plugin_materializer.go`
- Go now has the first persistent save-triggered refresh adoption boundary for
  those plugin-generated files under `internal/runs/service.go`, but normal
  project-state lifecycle ownership outside run-triggered saves is still
  missing
- deployment/share run policy and session-run semantics still live outside this
  slice

## Proposed Go Boundaries

### `internal/projectstate`

Add only the minimum source-of-truth fields needed for generated-entry planning:

- first-party Python codegen target presence
- generated-entry binding metadata
- enough section-kind information to distinguish generated Python sections from
  ordinary non-runnable sections

Do not add plugin execution logic here.

### `internal/runs`

Expand the planner to own:

- generated-entry target resolution
- explicit rejection of unsupported plugin-codegen entry runs
- terminal-selection policy for non-attached targets once generated-entry runs
  are planned

### `internal/terminals`

Keep ownership limited to PTY session runtime:

- list sessions by project/share scope
- later expose a reusable-session selector if `internal/runs` needs a dedicated
  helper

Do not teach this package about project-state temporary terminals.

## Implementation Slices

### Slice 1: Generated-Entry Project-State Minimum

Deliver:

- minimum Go project-state support for:
  - first-party Python codegen target detection
  - generated-entry binding metadata
  - generated Python section identification
- normalization and validation coverage for the new fields

Acceptance:

- Go can tell the difference between:
  - manual code-section runs
  - first-party generated-entry runs
  - unsupported plugin-codegen runs

Status:

- complete

Completed:

- extended `internal/projectstate` with:
  - project codegen target metadata
  - generated code and metadata bindings
  - generated section kinds
- updated run-target resolution so Go can distinguish:
  - manual code-section runs
  - first-party generated-entry runs
  - explicit plugin-generated selections that must fail

Tests:

- `internal/projectstate/run_graph_test.go`
  - generated-entry resolution from `sectionId: null`
  - explicit generated Python section collapse to entry behavior
  - plugin-generated selection classification

### Slice 2: Generated-Entry Planner Support

Deliver:

- planner support for project-entry runs when first-party Python codegen is
  enabled
- explicit unsupported errors for plugin-codegen targets
- focused planner tests for:
  - generated-entry `sectionId: null`
  - explicit generated Python section selection collapsing to entry behavior
  - codegen-disabled projects still requiring manual runnable code sections

Acceptance:

- the Go planner can return a generated-entry plan without pretending the target
  is an attached code section
- unsupported plugin-codegen runs fail explicitly with a domain error instead of
  generic non-runnable failures

Status:

- complete

Completed:

- extended `internal/runs.Planner` to:
  - plan generated-entry runs from explicit generated-Python selection or
    `sectionId: null`
  - use generated code and metadata bindings as the source of truth
  - keep snapshot behavior explicit for generated code plus manual code-file
    inputs
  - reject plugin-generated entry runs explicitly

Tests:

- `internal/runs/planner_test.go`
  - generated-entry `never` runs
  - generated-entry snapshot runs including metadata files
  - explicit generated Python section collapse
  - explicit plugin-generated rejection

### Slice 3: Temporary-Terminal Fallback

Deliver:

- run-service fallback for non-attached generated-entry runs:
  - create a temporary terminal section in project state
  - open/reuse the matching PTY session and dispatch the planned command
- focused HTTP/app tests proving temporary terminals become visible and usable

Acceptance:

- generated-entry runs no longer require an attached terminal section
- temporary terminals are created in project state, not only in terminal runtime
- share-session scoping stays explicit

Status:

- complete

Completed:

- `internal/runs.Service` now reuses an existing top-level generated-entry
  terminal when the matching project/share-scoped PTY session is provably idle
- generated-entry runs still create a top-level temporary terminal when there is
  no live reusable terminal session
- `internal/terminals.Service` now exposes an explicit reusable-session signal
  backed by PTY foreground-process-group checks instead of Python's
  child-process and elapsed-time heuristic
- focused HTTP coverage proves both:
  - generated-entry runs can reuse an existing idle top-level terminal
  - generated-entry runs still create a top-level temporary terminal when no
    reusable terminal exists

Tests:

- `internal/httpapi/terminal_routes_test.go`
  - generated-entry `POST /api/runCode` reuses an existing idle top-level
    terminal
  - generated-entry `POST /api/runCode` creates a top-level temporary terminal
    and runs the generated entry there
- `internal/terminals/service_test.go`
  - idle interactive shells are reusable
  - terminals with active foreground jobs are not reusable

## Decisions Made

- Use project-state generated bindings as the source of truth for generated-entry
  planning instead of inferring paths from filenames or section ids.
- Treat explicit plugin-generated section selection as an unsupported domain case
  now, rather than pretending it is a generic non-runnable section.
- Treat PTY foreground-process-group equality with the shell process group as
  the first Go-owned reusable-session source of truth.
- Limit non-attached generated-entry reuse to project-state top-level terminal
  sections whose live PTY sessions are explicitly idle.

## Open Questions

- Do we need an explicit project-state ownership marker if we later want to
  reuse top-level terminal sections that no longer have a live PTY session?
- Should broader non-attached terminal reuse ever include top-level terminals
  that were not created by generated-entry flows, or should that remain
  explicitly out of scope?

## Next Recommended Step

- Start Slice 4 from
  `docs/plans/go-backend-rewrite/phase-4-terminal-run-code-migration.md`:
  Go-owned deployment/share `runCode` policy and session-overlay behavior.
