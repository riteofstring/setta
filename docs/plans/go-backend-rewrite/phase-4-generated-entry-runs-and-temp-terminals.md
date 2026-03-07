# Phase 4 Generated Entry Runs And Temporary Terminals

## Purpose

This doc narrows the next blocked Phase 4 run-code work to the dependency chain
behind temporary-terminal fallback.

The current Go route already handles manual Python/Bash code-section runs with
attached terminals. The remaining terminal-selection slice from the earlier plan
is not independently reachable yet. In the Python product, free-terminal reuse
and temporary-terminal creation matter mainly when the run target is generated
project-entry code rather than a manual runnable code section.

This plan captures the minimum Go-owned work needed to make that path real
before implementing terminal reuse and temporary-terminal creation.

## Status

Current repo status as of 2026-03-06:

- Go already owns the current IDE manual-run path for:
  - manual Python/Bash code-section planning
  - attached-terminal reuse and ensure
  - PTY session open/reuse and command dispatch
  - draw snapshot upload/application
  - `Started command` backend-log broadcast
- the current Go planner only resolves runnable manual code sections under:
  - `internal/runs/planner.go`
- the current Go project-state model only includes:
  - code sections
  - terminal sections
  - draw sections
- the current Go project-state model does not yet include:
  - project codegen targets
  - generated code bindings
  - generated Python section kinds
  - plugin codegen target metadata
- the current Go `runCode` route therefore cannot yet represent or plan the
  frontend cases where:
  - IDE run uses generated Python entry behavior
  - app/deployment run relies on `sectionId: null` plus project entry
  - terminal selection must fall back to a free or temporary terminal because
    there is no attached code-section terminal to reuse
- the temporary-terminal branch described in
  `docs/plans/go-backend-rewrite/phase-4-terminal-run-code-migration.md` is
  therefore still missing, but adding it first would be dead code until Go can
  plan generated-entry runs

## Scope

This focused plan covers:

- identifying the minimum project-state additions needed for generated-entry run
  planning
- defining the first Go-owned planner boundary for generated Python entry runs
- sequencing terminal reuse and temporary-terminal creation only after that run
  target becomes reachable

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

That means the highest-leverage next step is not terminal fallback in
isolation. It is the minimum generated-entry run support that makes terminal
fallback reachable.

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

The third and fourth steps are what remain for Go, but they matter only once
Go can produce step 3 inputs from generated-entry planning.

## Current Go Gaps

The missing Go pieces are now clearer:

- `internal/projectstate` does not model project codegen targets
- `internal/projectstate` does not model generated Python bindings or generated
  section kinds
- `internal/runs.Planner` cannot distinguish:
  - a genuinely unsupported non-runnable section
  - a generated-entry run that should plan through codegen
- `internal/runs.Service` has no reachable branch for:
  - project/share-scoped free terminal reuse
  - temporary-terminal creation through project-state mutation
- plugin codegen has no Go runtime boundary yet

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

### Slice 3: Temporary-Terminal Fallback

Deliver:

- run-service fallback for non-attached generated-entry runs:
  - reuse a free terminal in the same `(project id, share session id)` scope
  - otherwise create a temporary terminal section in project state
  - open/reuse the matching PTY session and dispatch the planned command
- focused HTTP/app tests proving temporary terminals become visible and usable

Acceptance:

- generated-entry runs no longer require an attached terminal section
- temporary terminals are created in project state, not only in terminal runtime
- share-session scoping stays explicit

## Open Questions

- what is the smallest Go representation that can distinguish generated Python
  sections without importing the whole Python project-state shape?
- should free-terminal reuse keep Python's current child-process detection
  semantics, or should Go define a more explicit reusable-session contract at
  the terminal service boundary?
- do we want plugin-codegen runs to fail with a dedicated unsupported error code
  as soon as the planner recognizes them?

## Recommended Option

Implement first-party Python generated-entry support before temporary-terminal
fallback.

Rationale:

- it is the actual dependency making the missing terminal-selection branch
  reachable
- it keeps the next code slice focused on source-of-truth modeling instead of
  adding dead fallback logic
- it lets plugin codegen stay explicitly unsupported until Go has a real plugin
  runtime boundary

## Next Recommended Step

Start Slice 1 by extending `internal/projectstate` with the minimum generated
entry metadata for first-party Python codegen:

- model whether Python codegen is enabled for a project
- model the generated-entry binding metadata the planner needs
- add section-kind/source data that lets the planner recognize generated Python
  sections explicitly
- keep plugin codegen metadata recognized only enough to fail explicitly later
