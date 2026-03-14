# Phase 4 Python Generated Section Sync And Route Reopen

## Purpose

This doc narrows Slice 4 after
`docs/plans/go-backend-rewrite/archive/phase-4-python-codegen-runtime-and-enablement.md`.

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
  - project-state reconciliation for authoritative `GenPythonCode` /
    `GenPythonMetadata` singleton sections during Python target enable/edit
  - deterministic generated singleton ids, impl payload sync, and view-mode
    visibility/layout population for generated sections
  - route/app wiring that reopens Python target enablement and edits through
    the Go-owned `setProjectConfigCodegenTargets` flow
- Python now serves only as reference material for this slice; the runtime
  source of truth is Go
- Remaining follow-up after this slice is frontend/browser verification of the
  reopened Python target flow, not more backend ownership inside this slice
- Automated frontend verification and headed CDP confirmation for that
  follow-up are now in place

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

Status:

- complete

Completed 2026-03-06:

- added a narrow `projectstate.PythonCodegenSectionReconciler` hook to the
  codegen-target mutation path
- fixed target-mutation ordering so reconciliation runs against the next Python
  target, not the previous in-memory target list
- implemented reconciliation in `internal/codegen.PythonMaterializer` using the
  Go-owned renderer/runtime-password path
- synchronized generated singleton section payloads from authoritative rendered
  outputs:
  - `GenPythonCode.code` stores the generated body only
  - `GenPythonMetadata.code` stores authoritative metadata module output
  - `codeFileBinding` mirrors the canonical write-only generated binding
- made generated singleton section reconciliation authoritative for:
  - deterministic section/variant/impl ids
  - top-level section membership
  - view-mode visibility/layout presence
  - metadata-section removal when `generateMetadata` is false
- added focused coverage in:
  - `internal/projectstate/codegen_targets_test.go`
  - `internal/codegen/python_materializer_test.go`

### Slice B: Route Reopen

Deliver:

- app/http wiring for the Python generated-section reconciler
- Python enable/edit route acceptance
- focused route/app tests

Acceptance:

- `setProjectConfigCodegenTargets` accepts Python enable/edit mutations
- route responses include authoritative singleton sections and payload content

Status:

- complete

Completed 2026-03-06:

- threaded the Python generated-section reconciler through
  `internal/httpapi/project_routes.go` and `internal/app/app.go`
- reopened Python target enable/edit transport by routing the mutation through
  the same Go-owned reconciliation + save-hook materialization path
- added focused route/app coverage proving:
  - Python enable/edit now returns authoritative singleton sections and impl
    payloads
  - the main runtime still materializes `setta_gen.py` / `setta_gen_meta.py`
    on save after route mutations
  - plugin-only target validation behavior remains unchanged

## Follow-up Verification

Completed 2026-03-07:

- added stable frontend selectors for the Run Instructions Python codegen
  toggle, metadata toggle, Python-disabled policy message, and the section /
  code-object override controls in
  `frontend/src/components/Panes/Overview/RunInstructions.tsx`
- added real Playwright coverage in
  `frontend/tests/e2e/overview/codegen/python-codegen-target.spec.ts`
  covering:
  - Python target disable -> generated code singleton removal and persistence
  - Python target re-enable -> generated code singleton restoration and
    persistence
  - metadata toggle on/off -> generated metadata singleton creation/removal and
    persistence
  - section override add/edit/remove persistence through Run Instructions
  - code-object override add/edit/remove persistence through Run Instructions
- verified that the frontend now observes the authoritative backend response
  rather than leaving stale generated-section nodes on the canvas after target
  edits
- completed headed chrome-devtools-mcp verification for the same Run
  Instructions flow using a temporary project with seeded TextBlock and
  MetaControl/CodeParam sections
  - confirmed section override add -> `exclude` -> remove updates the visible
    policy controls and the rendered generated Python body in the generated
    section editor
  - confirmed code-object override add -> `string` -> remove updates the visible
    policy controls and the rendered generated Python body in the generated
    section editor

Verification run:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/codegen/python-codegen-target.spec.ts`
- headed `chrome-devtools-mcp` pass against `http://127.0.0.1:3000/<temp-project>`

## Next Recommended Step

This follow-up is complete. Return to the rewrite roadmap and select the next
Phase 4 or later work item that is not blocked on external verification.
