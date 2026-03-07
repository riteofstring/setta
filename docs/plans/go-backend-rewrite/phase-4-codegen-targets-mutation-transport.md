# Phase 4 Codegen Targets Mutation Transport

## Purpose

This doc narrows the next step after
`docs/plans/go-backend-rewrite/phase-4-plugin-codegen-refresh-owner.md`.

Go now owns the backend worker runtime, plugin codegen materialization, and the
central main-runtime save hook that refreshes plugin codegen outputs. What is
still missing is the first real IDE mutation/save transport that can drive that
hook during ordinary editing.

The narrowest useful slice is not "all project-manager routes." It is the first
Go-owned mutation path for project codegen targets:

- mutate `projectConfig.codegenTargets` from a frontend request
- persist that mutation through the main runtime save boundary
- return authoritative updated project state instead of relying on missing
  Python-style websocket mutation broadcasts

## Status

Current repo status as of 2026-03-06:

- Go already owns:
  - persisted project-state runtime and registry boundaries in
    `internal/projectstate`
  - frontend read projection in `internal/projectview`
  - worker-backed plugin codegen runtime and materialization under
    `internal/plugins` and `internal/codegen`
  - central main-runtime post-save hook wiring for plugin codegen refresh under:
    - `internal/projectstate/runtime.go`
    - `internal/projectstate/registry.go`
    - `internal/app/app.go`
- Python still owns the IDE mutation transport for project codegen targets under:
  - `backend/setta/routers/project_manager.py`
  - `backend/setta/project_state/base_project_manager.py`
- the current frontend caller already has one narrow mutation entry point:
  - `route_set_project_config_codegen_targets(...)`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
- the current Go backend still has no IDE project-state mutation route surface
  and no Go-owned project-state mutation broadcast transport for IDE mode

## Scope

This focused plan covers:

- the first Go-owned IDE mutation route for project codegen targets
- a Go domain mutation boundary for `projectConfig.codegenTargets`
- save-through-runtime behavior that triggers the existing plugin codegen refresh
  hook
- an authoritative HTTP response path for updated frontend project state

## Non-Goals

- broad migration of the Python project-manager route family
- rebuilding Python undo/redo history or autosave debounce
- preserving Python websocket mutation-broadcast behavior as a compatibility
  contract
- first-party Python codegen generation ownership
- broad frontend store cleanup beyond the touched codegen-target caller

## Inputs

- `docs/plans/go-backend-rewrite/phase-3-project-state-core.md`
- `docs/plans/go-backend-rewrite/phase-4-plugin-codegen-refresh-owner.md`
- `backend/setta/routers/project_manager.py`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_codegen_targets.py`
- `frontend/src/components/Panes/Overview/RunInstructions.tsx`
- `frontend/src/state/actions/project/loadProject.ts`
- `frontend/src/utils/generatedEndpoints.ts`

## Dependency Finding

The central save-hook slice changed the dependency graph.

The missing piece is no longer plugin execution or save ownership. The missing
piece is that nothing in Go currently performs this chain in IDE mode:

1. decode a codegen-target mutation request
2. mutate the main project runtime
3. persist through `Runtime.Save(...)`
4. project the updated authoritative project state back to the frontend

The current frontend caller updates local state optimistically after calling
`route_set_project_config_codegen_targets(...)`. That works in Python because
the backend also updates and broadcasts project state. Go does not own that
mutation-broadcast path yet.

Rebuilding Python-style mutation broadcasts first would widen scope. The
clean-break option is simpler:

- let the route return authoritative updated project state
- let the frontend load that state directly
- keep websocket mutation broadcast work deferred

## Python Reference Semantics

The current Python `set_project_config_codegen_targets(...)` path does all of
the following:

- rejects duplicate target languages
- validates plugin targets against active plugin registrations
- updates `projectConfig.codegenTargets`
- when Python codegen is disabled:
  - removes generated Python singleton sections
  - clears `entryCodeBlockId` if it pointed at the generated Python section
- when Python codegen is enabled:
  - ensures generated Python singleton sections exist
  - adds or removes generated metadata singleton sections based on the target
    config
- updates and broadcasts project state

Not all of that needs to land in one transport slice, but the Go domain
mutation must own the same source-of-truth invariants for the touched fields.

## Working Decisions

- start with `setProjectConfigCodegenTargets` as the first IDE mutation route
  above the new save hook
  - it directly exercises the plugin codegen refresh pathway we just built
  - the frontend already has a caller and UI surface for it
- do not rebuild Python websocket mutation broadcasts first
  - use an authoritative HTTP response instead
  - update the frontend caller to load the returned state snapshot
- keep the domain mutation inside `internal/projectstate`
  - route handlers should not hand-edit document fields
  - plugin target validation should flow through explicit Go services
- keep first-party Python codegen section management narrow but honest
  - if Go cannot yet regenerate Python singleton sections correctly, fail
    explicitly instead of silently pretending the mutation succeeded

## Recommended Option

Use an authoritative route response, not Python-style mutation broadcasts.

Rationale:

- Go already owns `internal/projectview`, so returning authoritative updated
  project state is straightforward.
- The current frontend caller already mutates local state optimistically, which
  is exactly the kind of non-source-of-truth behavior the rewrite should remove.
- Rebuilding Python websocket mutation broadcasts would pull in broader IDE
  transport scope before the first route is even correct.

## Proposed Go Boundaries

### `internal/projectstate`

Own:

- mutation of `projectConfig.codegenTargets`
- validation of duplicate languages and target payload shape
- any generated-section side effects that Go can honestly support now
- explicit persistence through the main runtime save boundary

Do not own:

- HTTP request decoding
- frontend response shaping

### `internal/httpapi`

Own:

- route decoding and validation
- IDE mode / deployment denial
- calling the project-state mutation service
- projecting the updated runtime snapshot through `internal/projectview`

Do not own:

- document mutation rules
- plugin worker/runtime startup

### `frontend`

Own:

- calling the new route contract
- replacing optimistic local mutation with authoritative state application

Do not own:

- synthesizing backend side effects from guessed state changes

## Implementation Slices

### Slice 1: Domain Mutation For Codegen Targets

Deliver:

- a Go-owned project-state mutation boundary for `projectConfig.codegenTargets`
- duplicate-language rejection
- explicit integration with plugin target validation
- explicit failure for unsupported Python-generated-section side effects if they
  are not yet rebuilt in Go

Acceptance:

- Go can update plugin-only codegen target lists in the main runtime
- invalid target payloads or duplicate languages fail in Go before save
- persistence flows through the existing runtime save hook

### Slice 2: IDE Route + Authoritative Project-State Response

Deliver:

- the first Go IDE mutation route for `setProjectConfigCodegenTargets`
- response payload containing updated authoritative project state
- frontend caller adoption away from optimistic local mutation

Acceptance:

- toggling plugin codegen targets from the Run Instructions UI updates frontend
  state from the backend response
- plugin codegen outputs refresh through the existing runtime save hook
- no websocket mutation broadcast dependency is required for correctness

### Slice 3: Python Codegen Section Side Effects

Deliver:

- Go-owned handling for the Python-codegen-specific generated section side
  effects that the route needs
- explicit entry-section cleanup when Python codegen is disabled

Acceptance:

- the route can safely handle mixed Python + plugin codegen target changes
- generated-entry planning keeps using source-of-truth fields after the
  mutation

## Open Questions

- whether Slice 1 should initially support only plugin-only target mutations and
  fail explicitly when Python codegen toggles are included
- whether the authoritative route response should return the full projected
  project state directly or a narrower wrapper that still contains the same
  source-of-truth payload

## Next Recommended Step

- Start Slice 1 with plugin-only target mutations first.
- Keep the response-path decision from this doc: authoritative updated project
  state over HTTP, not Python-style mutation websocket broadcasts.
