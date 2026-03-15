# Frontend Sections And Params Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).

## Goal

Make section chrome and param rendering easy to change without touching measurement code, DnD internals, or unrelated section behaviors.

## Scope

- In scope:
  - `frontend/src/components/Params/**`
  - `frontend/src/components/Section/**`
  - shared section/param measurement and layout helpers
- Out of scope:
  - chat/browser/task-board layout internals already covered in [frontend-cleanup-plan.md](./frontend-cleanup-plan.md)
  - project-level page routing and pane shells

## Status Refresh (2026-03-15)

- This domain is still relatively close to the original planning snapshot for
  JSX-heavy section chrome, but section-creation state is no longer a single
  mixed file on this branch.
- `frontend/src/state/actions/sections/createSections.ts` now owns top-level
  section creation commands and empty-space add actions,
  `frontend/src/state/actions/sections/createSectionPlacement.ts` owns smart
  placement/empty-space helpers,
  `frontend/src/state/actions/sections/createSectionCatalogSectionGroups.ts`
  now owns static section/code/artifact/workflow/other presets,
  `frontend/src/state/actions/sections/createSectionCatalogControlGroups.ts`
  now owns metacontrol/embed presets,
  `frontend/src/state/actions/sections/createSectionCatalogGroupAssembly.ts`
  now owns ordered base group assembly,
  `frontend/src/state/actions/sections/createSectionCatalogStatic.ts` is now a
  thin compatibility facade,
  `frontend/src/state/actions/sections/createSectionFileOpenShared.ts` owns
  shared opened-file naming/reuse helpers,
  `frontend/src/state/actions/sections/createSectionFileOpenCommands.ts` owns
  per-impl file-open commands,
  `frontend/src/state/actions/sections/createSectionFileDropRouting.ts` owns
  drop-to-section routing, and
  `frontend/src/state/actions/sections/createSectionFileOpeners.ts` is now a
  thin compatibility facade,
  `frontend/src/state/actions/sections/createSectionImplDefaults.ts` owns
  per-impl create defaults.
- `frontend/src/state/actions/sections/moveSectionQueries.ts` now owns
  attached-terminal route selection, section-type move checks, and
  parent-resolution reads, `frontend/src/state/actions/sections/moveSectionParentState.ts`
  now owns in-state parent cleanup plus move-into-parent reducers,
  `frontend/src/state/actions/sections/moveSectionPaneState.ts` now owns pane
  node and top-level layout updates, `frontend/src/state/actions/sections/moveSectionState.ts`
  is now the thin in-state composition facade, and
  `frontend/src/state/actions/sections/moveSections.ts` remains the thin
  optimistic backend command facade.
- `frontend/src/state/actions/sectionDisplayStructure.ts` now owns top-level
  display selection, displayed-child tree derivation, node-map creation, and
  DnD child reset, `frontend/src/state/actions/sectionViewModeVisibility.ts`
  now owns active-view lookup plus visibility/render and ancestor-visibility
  queries, and `frontend/src/state/actions/sectionDisplayQueries.ts` is now
  the thin compatibility facade.
- `frontend/src/state/actions/params/paramSelectionCommands.ts` now owns
  single-param drag/drop selection normalization,
  `frontend/src/state/actions/params/paramMoveCommands.ts` now owns optimistic
  backend dispatch for direct moves plus indent or unindent commands,
  `frontend/src/state/actions/params/paramMoveKeyboardCommands.ts` now owns
  visible-sibling keyboard move planning and grouped move dispatch, and
  `frontend/src/state/actions/params/moveParams.ts` is now the thin
  compatibility facade.

## Current State (Observed)

- `frontend/src/components/Params` plus `frontend/src/components/Section` totals about 35.9k lines of authored code.
- Shared section-action ownership no longer defaults into one create surface:
  - `frontend/src/state/actions/sections/createSections.ts` is down to 140
    lines for top-level create orchestration
  - `frontend/src/state/actions/sections/createSectionFileOpenCommands.ts` is
    195 lines for per-impl file-open commands
  - `frontend/src/state/actions/sections/createSectionFileDropRouting.ts` is
    93 lines for dropped-file routing
  - `frontend/src/state/actions/sections/createSectionFileOpenShared.ts` is 82
    lines for naming/reuse helpers
  - `frontend/src/state/actions/sections/createSectionPlacement.ts` is 72
    lines for smart placement helpers
- Main shared hotspots include:
  - `frontend/src/components/Params/GroupContainer.tsx` at 999 lines
  - `frontend/src/components/Params/ParamUIs/TextParamInput.tsx` at 944 lines
  - `frontend/src/components/Section/Layouts/CodeArea.tsx` at 934 lines
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx` at 736 lines
  - `frontend/src/components/Section/Header/SectionHeader.tsx` at 735 lines
  - `frontend/src/components/Section/Layouts/DrawArea/useDrawModeMouseHandlers.ts` at 1039 lines
- `GroupContainer.tsx` mixes:
  - pinned/unpinned param rendering
  - DnD setup
  - resize and measurement observers
  - temporary-state writes
  - section-style presentation
- `ParamUI.tsx` acts as a central switchboard for many param types while also handling:
  - store reads and type-guard selection
  - permissions/deployment behavior
  - password reveal logic
  - date/time/dropzone-specific config extraction
- `SectionHeader.tsx` mixes:
  - size measurement
  - diagnostics UI
  - follow-mode selection state
  - menu/run/minimize/title/button composition
  - section-type-specific behavior
- The section system also spreads shared complexity across:
  - section containers
  - header controls
  - section-part helpers
  - per-layout interaction handlers
- The result is that adding a new param control or a new section-header action often requires touching shared files that already carry unrelated behavior.

## Cleanup Principles

1. Shared section chrome should be modular and policy-driven.
2. Param rendering should use explicit registries/adapters instead of one ever-growing control switch.
3. Measurement and observer logic should live outside JSX-heavy render files.
4. Container hierarchy should be as flat as possible without losing behavior.
5. High-DOM section surfaces must keep performance guardrails during cleanup.

## Plan

1. Extract measurement and observer logic first

- Move section header height tracking, param-area measurement, and pinned/unpinned observer logic into dedicated hooks/modules.
- Keep render files focused on composition and styling once the measurements are computed elsewhere.

2. Split param rendering by control family

- Turn `ParamUI.tsx` into a small dispatcher over explicit control modules.
- Co-locate each control’s:
  - selector/config adapter
  - rendering component
  - authoring/config editor
  - tests
- Keep shared permission/deployment rules in a small shared param policy layer.

3. Separate section chrome from section-specific actions

- Break `SectionHeader.tsx` into:
  - shared header shell
  - title/tag/follow controls
  - diagnostics controls
  - section action groups
- Make it obvious where to add a new control without editing a long mixed-responsibility file.

4. Simplify group/container infrastructure

- Reduce the amount of layout, DnD, measurement, and render logic living in `GroupContainer.tsx`.
- Standardize the boundaries between:
  - section container
  - section header
  - param area
  - layout body

5. Apply the same boundaries to the next layout-heavy surfaces

- After shared section/param infrastructure is split, follow through on:
  - `CodeArea.tsx`
  - `useDrawModeMouseHandlers.ts`
  - draw/meta-control shared infrastructure
- Prefer pure interaction helpers and selector-backed state access over large in-component orchestration.

## Risks And Mitigations

- Risk: subtle focus, keyboard, or measurement regressions.
  - Mitigation: extract helpers with focused tests before changing render structure.
- Risk: param-control registry becomes too abstract.
  - Mitigation: keep each param type’s registration close to the actual control implementation.
- Risk: DOM changes affect large-canvas performance.
  - Mitigation: profile before/after for section-heavy surfaces and keep DOM flattening as an explicit goal.

## Verification

- Add or update Vitest coverage for:
  - measurement helpers
  - param control policy/dispatch
  - section header control visibility and behavior
  - layout interaction helpers
- Use CDP profiling for significant section-container or render-structure refactors.
- Add performance notes under `perf/reports/frontend/` when shared section surfaces are materially refactored.

## Acceptance Criteria

- A new param control can be added without editing a large central switch full of unrelated logic.
- Shared section chrome has clear extension points for diagnostics, follow mode, title actions, and measurement.
- Measurement code no longer dominates section render files.
- The section system is easier to navigate because common concerns have stable, explicit ownership boundaries.
