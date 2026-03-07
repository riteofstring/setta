# Phase 4 Python Generated Section Sync And Route Reopen

## Purpose

This doc narrows Slice 4 after
`docs/plans/go-backend-rewrite/phase-4-python-codegen-runtime-and-enablement.md`.

Go already owns first-party Python target decode, dependency/code rendering,
metadata rendering, and save-hook file materialization.

What still blocks Python target enablement and in-place edits is the last
project-state layer:

- authoritative `GenPythonCode` / `GenPythonMetadata` section creation
- authoritative generated section payload sync for route responses and later
  project loads
- reopening the `setProjectConfigCodegenTargets` route for Python enable/edit

## Status

Current repo status as of 2026-03-06:

- Go already owns:
  - Python target decode/defaults under `internal/projectstate`
  - authoritative `setta_gen.py` / `setta_gen_meta.py` rendering and save-hook
    writes under `internal/codegen`
  - cleanup-only removal of generated Python singleton sections when the Python
    target is disabled
- Python still owns:
  - singleton section creation/deletion inside
    `set_project_config_codegen_targets`
  - mirroring generated body/meta code into singleton section payloads
- Go still lacks:
  - a project-state reconciliation path that ensures generated Python singleton
    sections exist and carry current payload content when the Python target is
    enabled or edited

## Scope

This focused plan covers:

- a Go hook interface from project-state codegen-target mutation into Python
  generated-section reconciliation
- singleton section create/update/delete for `GenPythonCode` and
  `GenPythonMetadata`
- route reopen for Python target enablement and in-place edits once that hook
  exists

## Non-Goals

- changing the save-hook materializer boundaries again
- preserving Python manager internals or impl class topology
- broad migration of unrelated section-creation or formatting routes
- synthesizing generated singleton sections in the frontend

## Inputs

- `docs/reference/codegen-targets.md`
- `docs/reference/codegen-section-policy-and-metadata.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/project_state/test_codegen_targets.py`
- `internal/projectstate/codegen_targets.go`
- `internal/projectview/single_config.go`
- `frontend/src/components/Section/Layouts/CodeArea.tsx`

## Dependency Finding

The remaining gap is not just section existence.

The frontend expects both generated singleton sections to expose `impl.code`,
and active view modes require explicit `visibilityBySectionId` entries for
visible sections. So Slice 4 must reconcile three things together:

1. singleton section shell existence
2. generated payload content (`code`, `codeFileBinding`)
3. top-level/view-mode visibility + layout presence

Doing only one or two of those would still leave Python target enable/edit
responses in an inconsistent state.

## Working Decisions

- keep project-state mutation rules in `internal/projectstate`
  - define a narrow reconciler hook interface there
- keep Python render/content generation in `internal/codegen`
  - implement the hook using the existing Go renderers and runtime password
    store reads
- treat generated section payloads as derived state
  - they should be regenerated from the Go renderers during reconciliation, not
    hand-edited or inferred from files
- create generated singleton sections as normal top-level sections with
  generated impl kinds plus frontend-shaped payloads
- add generated sections to top-level layout and all view-mode visibility/layout
  maps so the frontend does not hit missing-visibility errors

## Proposed Go Boundaries

### `internal/projectstate`

Own:

- codegen-target mutation flow
- singleton section cleanup helpers
- hook interface definition for Python generated-section reconciliation

Do not own:

- Python rendering logic
- runtime password-store reads

### `internal/codegen`

Own:

- Python generated-section reconciliation implementation over the existing Go
  renderers
- generated section payload construction from authoritative rendered outputs

Do not own:

- HTTP request decoding
- persistence orchestration

### `internal/httpapi`

Own:

- passing the reconciler into the existing route/runtime call path
- returning the authoritative updated project view

Do not own:

- section mutation rules
- renderer details

## Implementation Slices

### Slice A: Reconciler Hook + Singleton Section Sync

Deliver:

- a `projectstate` hook interface for Python generated-section reconciliation
- a `codegen` implementation that creates/updates/removes generated singleton
  sections and payloads
- focused runtime tests for Python target enable/edit flows

Acceptance:

- enabling Python creates `GenPythonCode`
- toggling `generateMetadata` creates/deletes `GenPythonMetadata`
- editing Python target settings refreshes generated section payload content

### Slice B: Route Reopen

Deliver:

- app/http wiring for the Python generated-section reconciler
- Python enable/edit route acceptance
- focused route/app tests

Acceptance:

- `setProjectConfigCodegenTargets` accepts Python enable/edit mutations
- route responses include authoritative singleton sections and payload content

## Next Recommended Step

Implement Slice A first, then reopen the route in Slice B once runtime tests are
green.
