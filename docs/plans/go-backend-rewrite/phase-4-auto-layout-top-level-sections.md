# Phase 4 Auto Layout Top-Level Sections

## Purpose

This doc narrows the next missing Go-owned IDE mutation slice after the
completed top-level layout persistence and view-mode lifecycle work.

The remaining adjacent gap is `autoLayoutTopLevelSections`. Unlike the
previous slice, this route is not just transport. It owns:

- top-level section size resolution
- settings-backed fallback dimensions for `auto` section sizes
- the packing algorithm that rewrites top-level layout coordinates

That makes it a separate bounded slice instead of a small follow-on handler.

## Status

Current repo status as of 2026-03-07:

- the focused Watch Code docs are complete
- the focused `runCode` `paramOverrides` doc is complete
- the focused project layout/presentation transport doc is complete
- the focused project view-mode and top-level layout mutation doc is complete
- Go already owns:
  - read-side project transport in `internal/projectstate` and
    `internal/projectview`
  - write-side top-level layout persistence via
    `setTopLevelSectionLayout`
  - settings-runtime storage as a separate runtime under
    `internal/projectstate.Registry`
- Go does not yet own:
  - the `autoLayoutTopLevelSections` route
- Go now owns:
  - section-sizing-policy lookup for layout fallback dimensions
  - the top-level auto-layout packing algorithm

## Scope

This focused plan covers:

- Go-owned top-level auto-layout mutation behavior
- settings-backed minimum-dimension lookup needed for `auto` section sizes
- thin IDE HTTP transport for `autoLayoutTopLevelSections`
- focused Go tests for runtime sizing/packing behavior and route envelopes

## Non-Goals

- broad settings transport or full `SettingsState` schema migration
- structural section create/delete/move transport
- `setSectionName`
- exact Python `rpack` parity as a compatibility requirement
- share/deployment policy transport in the same slice

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-project-view-mode-and-top-level-layout-mutation-transport.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/routers/project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/types/settings_state.py`
- `backend/setta/project_state/settings_project.py`
- `tests/types/test_section_sizing_normalization.py`
- `tests/routers/test_share_policy_routes.py`
- `frontend/src/state/actions/sections/sectionPositions.ts`

## Dependency Finding

Current inspection shows three separate concerns hidden behind the one Python
route:

- project-state mutation:
  - load the active top-level layouts
  - rewrite coordinates in one mutation
- dimension resolution:
  - use explicit layout `w`/`h` when present
  - otherwise use effective impl `size.width` / `size.height`
  - when impl size is `auto`, fall back to section-sizing policy minimums
- packing:
  - arrange rectangles without overlap
  - preserve the pre-layout minimum `x`/`y` origin after packing

The first concern belongs in main project-state runtime ownership. The second
depends on the settings runtime, but only for one narrow read pathway. The
third is the actual algorithm boundary and should stay local to this slice.

## Working Decisions

- keep the HTTP layer thin
  - decode request
  - validate `projectConfigId`
  - call one Go-owned mutation boundary
- keep settings access narrow
  - do not port the full settings manager surface for this slice
  - resolve only the section-sizing-policy minimums needed by auto layout
- use authoritative state for dimensions
  - explicit layout `w`/`h` wins
  - otherwise effective impl size wins
  - otherwise settings-backed minimum dimensions win
- keep the packing algorithm deterministic and documented
  - exact Python `rpack` parity is not required
  - the Go algorithm must still avoid overlap and preserve origin anchoring
- do not hardcode route-local layout assumptions
  - projectstate owns the algorithm and size resolution

## Proposed Go Boundary

### `internal/projectstate`

Own:

- settings-backed sizing-policy lookup with schema-default fallback
- section dimension resolution for auto layout
- top-level rectangle packing and origin preservation
- document/runtime mutation for `autoLayoutTopLevelSections`

Do not own:

- HTTP decoding
- share/deployment policy enforcement

### `internal/httpapi`

Own:

- IDE route registration for `autoLayoutTopLevelSections`
- request decoding and margin validation
- mapping explicit auto-layout errors to stable HTTP envelopes

Do not own:

- packing behavior
- settings traversal semantics

## Implementation Slices

### Slice 1: Settings-Backed Auto Layout Runtime

Deliver:

- Go settings helper(s) to resolve section-sizing-policy minimum dimensions from
  the settings runtime document, with schema-default fallback when no settings
  project exists yet
- Go project/document/runtime mutations for `autoLayoutTopLevelSections`
- deterministic packing that:
  - uses explicit layout dimensions first
  - falls back to effective impl size values
  - falls back to settings-backed minimum dimensions for `auto`
  - preserves the prior minimum `x`/`y` origin after packing
- focused runtime tests for:
  - `auto` size fallback
  - explicit `w`/`h` override behavior
  - negative-margin validation
  - non-overlapping rewritten layouts

Acceptance:

- the packing algorithm lives behind Go project-state ownership
- no route-local settings traversal or size math exists
- empty or missing settings runtime still produces stable default behavior

Status:

- completed 2026-03-07

### Slice 2: IDE Route Transport

Deliver:

- route registration and handler for `autoLayoutTopLevelSections`
- focused HTTP tests for:
  - happy-path layout rewrite
  - invalid margin failure mapping
  - missing project failure mapping

Acceptance:

- the frontend can call the existing generated endpoint against a Go-owned
  handler
- transport stays thin and explicit

Status:

- pending

## Open Questions

- whether a small third-party rectangle-packing package is worth adding for
  this one slice, or whether a local deterministic packer is the cleaner
  long-term ownership choice
- whether later section-size mutation transport should reuse the same settings
  fallback helper introduced here

## Completed Work

Completed 2026-03-07:

- added Go-owned settings-backed sizing-policy resolution in
  `internal/projectstate/auto_layout.go`
- added Go-owned top-level auto-layout mutation and deterministic packing in
  `internal/projectstate/auto_layout.go`
- added focused runtime coverage in
  `internal/projectstate/auto_layout_test.go`
- confirmed:
  - explicit layout `w`/`h` wins
  - impl `size.width` / `size.height` is used when present
  - `auto` size falls back to settings-backed minimums
  - rewritten layouts preserve the prior minimum `x`/`y` origin
  - active view-mode top-level layouts stay aligned through
    `setTopLevelSectionLayout`

Verification:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 180s`

## Next Recommended Step

- Implement Slice 2 next.
- Keep transport thin by passing the settings runtime through one narrow
  dependency into the project routes.
