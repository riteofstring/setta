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
  - a Go-owned persisted domain mutation for `projectConfig.codegenTargets`
    under:
    - `internal/projectstate/codegen_targets.go`
    - `internal/plugins/codegen_target_validator.go`
    - `internal/projectstate/runtime.go`
  - frontend read projection in `internal/projectview`
  - worker-backed plugin codegen runtime and materialization under
    `internal/plugins` and `internal/codegen`
  - central main-runtime post-save hook wiring for plugin codegen refresh under:
    - `internal/projectstate/runtime.go`
    - `internal/projectstate/registry.go`
    - `internal/app/app.go`
  - the first Go IDE mutation route plus authoritative project-state response
    path for `setProjectConfigCodegenTargets` under:
    - `internal/httpapi/project_routes.go`
    - `internal/app/app.go`
  - cleanup-only Python target removal side effects for this route under:
    - `internal/projectstate/codegen_targets.go`
    - generated Python section removal
    - generated binding cleanup
    - generated-entry `entryCodeBlockId` cleanup when it pointed at the
      generated section
    - top-level/view-mode cleanup for removed generated sections
  - frontend authoritative state application for the current project under:
    - `frontend/src/state/actions/project/codegenTargets.ts`
    - route responses now reload the current project via `loadProjectState(...)`
      instead of patching only `projectConfig.codegenTargets`
- Python still owns the broader surrounding IDE mutation transport surface under:
  - `backend/setta/routers/project_manager.py`
  - `backend/setta/project_state/base_project_manager.py`
- the current frontend caller already has one narrow mutation entry point:
  - `route_set_project_config_codegen_targets(...)`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
- the remaining Go gap in this focused area is no longer route transport
  correctness; it is first-party Python target enablement/in-place edits, which
  still require a Go-owned authoritative Python codegen/materialization path
- the current Go backend still has no broader IDE project-state mutation route
  surface and no Go-owned project-state mutation broadcast transport for IDE
  mode

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

Status:

- complete

Completed:

- added `internal/projectstate/codegen_targets.go` as the Go-owned persisted
  mutation boundary for `projectConfig.codegenTargets`
- added `Runtime.MutateAndSave(...)` in `internal/projectstate/runtime.go` so
  narrow domain mutations can persist through the existing main-runtime save
  hook without route handlers hand-editing document state
- kept plugin-target validation explicit by introducing
  `internal/plugins/codegen_target_validator.go`
  - plugin targets resolve through the existing worker-spec resolver boundary
  - Python targets bypass plugin resolver validation
- enforced the slice boundary honestly:
  - plugin-only target mutations are supported
  - unchanged existing Python targets may remain present alongside plugin target
    edits
  - any Python target add/remove/config change still fails explicitly with
    `ErrProjectCodegenPythonMutationUnsupported`
- made Python-target equality semantic instead of formatting-sensitive by
  compacting JSON payloads before comparison
- ensured duplicate-language rejection happens before plugin validation so the
  mutation contract stays source-of-truth and deterministic
- covered the slice with focused Go tests for:
  - persisted plugin-only target mutation through the main runtime save path
  - duplicate-language rejection before validator calls
  - validator-required and validator-error paths
  - explicit Python mutation rejection
  - unchanged Python target plus plugin-target mutation acceptance
  - plugin-target validator delegation to the worker-spec resolver

Tests:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntime(SetProjectCodegenTargets|MutateAndSave)' -count=1 -v`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/plugins -run 'TestProjectCodegenTargetValidator' -count=1 -v`

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

Status:

- complete

Completed:

- added `internal/httpapi/project_routes.go` as the first Go IDE mutation route
  for `setProjectConfigCodegenTargets`
- kept the transport thin:
  - route request decoding owns JSON/object/language extraction from frontend
    target payloads
  - project-state mutation semantics still flow through
    `Runtime.SetProjectCodegenTargets(...)`
  - plugin target validation still flows through the injected Go validator
- returned authoritative `projectview.SingleConfig` from the route after the
  persisted mutation instead of rebuilding Python websocket mutation broadcasts
- wired the route in `internal/app/app.go` using the existing filesystem
  worker-spec resolver and plugin target validator boundary
- verified the full end-to-end path in Go:
  - auth-gated IDE route request
  - project-state mutation/save
  - post-save plugin codegen materialization
  - authoritative project-state response payload
- updated the frontend caller in
  `frontend/src/components/Panes/Overview/RunInstructions.tsx` so it no longer
  mutates stores optimistically before the backend responds
- kept frontend adoption narrow and source-of-truth:
  - use the backend response to update `projectConfig.codegenTargets`
  - use the backend response to refresh matching metadata entries
  - avoid broad frontend store replacement until a wider Go project-state
    response/application path is ready
- covered the slice with focused tests for:
  - HTTP route success, invalid target payloads, Python-mutation rejection, and
    deployment blocking
  - app-level route registration plus plugin codegen materialization through the
    save hook
  - frontend authoritative store application from the backend response

Tests:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi ./internal/app ./internal/projectstate ./internal/plugins -count=1`
- `pnpm -C frontend exec vitest run src/state/actions/project/codegenTargets.test.ts src/state/actions/project/loadProject.test.ts`

### Slice 3: Python Disable Cleanup Side Effects

Deliver:

- Go-owned handling for the cleanup side effects required when an existing
  Python target is removed
- explicit entry-section cleanup when Python codegen is disabled
- authoritative frontend state application for the current project so removed
  generated sections disappear from the UI immediately

Acceptance:

- the route can remove an existing Python target while preserving plugin-only
  targets
- generated-entry planning no longer sees stale bindings/sections after Python
  target removal
- the frontend no longer keeps stale generated singleton state after the route
  response

Status:

- complete

Completed:

- updated `internal/projectstate/codegen_targets.go` so Go now supports the
  honest Python-target transition it can own today:
  - existing Python target removal is allowed
  - unchanged existing Python target plus plugin mutations remain allowed
  - Python target enablement and in-place edits still fail explicitly
- added cleanup of stale generated Python runtime state during target removal:
  - clear `GeneratedCodeBinding`
  - clear `GeneratedMetadataBinding`
  - clear `entryCodeBlockId` when it pointed at the generated Python section
  - remove generated Python and generated metadata sections
  - prune top-level/layout/view-mode references for removed generated sections
- updated the frontend response handler so `setProjectConfigCodegenTargets`
  applies the authoritative project state for the currently loaded project
  instead of only patching `codegenTargets`
- covered the slice with focused tests for:
  - runtime cleanup after Python target removal
  - HTTP route response/state cleanup after Python target removal
  - frontend authoritative project-state replacement for current-project
    responses

Tests:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/httpapi -count=1`
- `pnpm -C frontend exec vitest run src/state/actions/project/codegenTargets.test.ts`

## Open Questions

- whether the next slice should create a dedicated focused doc for first-party
  Python codegen runtime/enablement ownership instead of extending this
  transport doc further

## Next Recommended Step

- Split the next slice into a dedicated focused doc before more implementation.
- Scope that doc around first-party Python codegen runtime ownership:
  - authoritative generated file materialization for `setta_gen.py`
  - authoritative metadata materialization for `setta_gen_meta.py`
  - generated section creation/update when Python target enablement or metadata
    enablement occurs
  - route support for Python target enablement and in-place target edits only
    after that runtime exists
- Keep the current clean-break boundary until that lands:
  - plugin-only mutations are supported
  - unchanged existing Python target plus plugin mutations are supported
  - Python target removal cleanup is supported
  - Python target enablement and in-place edits stay explicitly blocked
