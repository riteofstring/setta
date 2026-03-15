# Frontend Forks Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md). Use this only when a cleanup slice directly touches code under `frontend/src/forks/**`.

## Goal

Make the frontend code under `frontend/src/forks/**` easy to navigate and safe to change using the same cleanup standards as the rest of the frontend, while preserving current UX and canvas/drag performance.

## Scope

- In scope:
  - `frontend/src/forks/xyflow/**`
  - `frontend/src/forks/dnd-kit/**`
  - Local wrappers, adapters, and nearby callsites when clarifying ownership requires it
  - Documentation that explains why each fork exists, what it owns today, and where new related code should live
- Out of scope:
  - generated files
  - broad upstream version upgrades or resync work done only for cleanup
  - replacing a fork with a different library
  - behavior changes unless a concrete bug is fixed intentionally

## Status Refresh (2026-03-14)

- `frontend/src/forks/**` is a meaningful authored surface on this branch: about 111 files / 16.7k lines total.
- The forked code splits into two distinct domains:
  - `xyflow` for canvas rendering, controls, minimap, pane interaction, and edge visuals
  - `dnd-kit` for section/param drag-drop state, collision logic, sorting, and drag event adaptation
- These forks have diverged enough that cleanup does not need to preserve original library style or upstream-shaped structure. Treat them like normal authored frontend code.
- Existing behavior references already exist and should be treated as contracts during cleanup:
  - [docs/reference/dnd-kit.md](../reference/dnd-kit.md)
  - [docs/reference/edge-styles.md](../reference/edge-styles.md)
  - [docs/reference/watch-code.md](../reference/watch-code.md)
- The current hotspots include:
  - `frontend/src/forks/dnd-kit/useDropType.ts` at 833 lines
  - `frontend/src/forks/dnd-kit/adapter/collision.ts` at 616 lines
  - `frontend/src/forks/xyflow/core/container/ZoomPane.tsx` at 589 lines
  - `frontend/src/forks/xyflow/core/styles/style.css` at 501 lines
  - `frontend/src/forks/xyflow/controls/Controls.tsx` at 493 lines
  - `frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx` at 469 lines
  - `frontend/src/forks/xyflow/minimap/MiniMap.tsx` at 434 lines
  - `frontend/src/forks/dnd-kit/useMoveSection.ts` at 412 lines
- Both forks already have meaningful Vitest coverage; cleanup should extend that instead of bypassing it.

## Current State (Observed)

- The forks are now a meaningful part of the authored frontend and should not be treated as a thin patch layer over external libraries.
- Some user-facing behavior lives directly inside fork files:
  - Watch Code entry UI is mounted from `frontend/src/forks/xyflow/controls/Controls.tsx`
  - Edge family styling and semantics live in `frontend/src/forks/xyflow/core/container/*EdgeRenderer*.tsx` plus `style.css`
  - Drag activation, collision handling, and drop-type policy live in `frontend/src/forks/dnd-kit/*`
- App code depends on narrow adapter seams in some places, but there are still cleanup opportunities to make those boundaries more obvious and more local.
- Because these surfaces are highly interactive, refactors here carry higher regression risk for canvas input, drag/drop, minimap behavior, and edge rendering performance.

## Cleanup Principles

1. Apply the same readability bar as the rest of the frontend.
   Clear ownership, smaller files, explicit boundaries, and focused tests matter here just as much as anywhere else.

2. Optimize for current ownership, not library history.
   Keep logic wherever it is easiest for contributors to find, understand, and verify today.

3. Do not preserve fork structure for its own sake.
   If directory layout, naming, or file boundaries no longer serve the current codebase, refactor them like any other frontend code.

4. Prefer adapters and feature-local helpers over deep direct imports.
   App code should depend on stable local entry points instead of reaching into many deep fork internals.

5. Treat interaction performance as a hard constraint.
   Baseline and re-check drag, pan/zoom, minimap, and edge-heavy scenarios when a cleanup slice touches them.

## Plan

1. Clarify fork ownership and allowed boundaries

- Prefer clear fork-local entry modules, names, or small domain subfolders that
  make these answers obvious:
  - why the fork exists
  - what it owns today
  - where new related code should live
- Use the same placement rules as the rest of the frontend instead of preserving historical fork boundaries by default.

2. Split dnd-kit by policy vs mechanics

- Refactor hotspots such as:
  - `useDropType.ts`
  - `useMoveSection.ts`
  - `adapter/collision.ts`
  - `adapter/sorting.ts`
- Separate:
  - drag-mode and permission policy
  - collision math and ordering rules
  - temporary drag state shaping
  - event adaptation and provider wiring
- Keep local entry points clear so app code does not need to depend on scattered deep internals.

3. Split xyflow by actual responsibilities

- Refactor hotspots such as:
  - `core/container/ZoomPane.tsx`
  - `controls/Controls.tsx`
  - `core/container/AgenticEdgeRenderer.tsx`
  - `core/container/StateMachineEdgeRenderer.tsx`
  - `minimap/MiniMap.tsx`
  - `core/styles/style.css`
- Separate:
  - generic canvas/container behavior
  - controls and popover launchers
  - edge semantics and overlays
  - style tokens/selectors by actual visual responsibility

4. Reduce unnecessary app <-> fork coupling

- Audit where app code imports deep fork internals and replace those with narrower local entry points where practical.
- When a fork file is doing too many things, split or relocate logic based on current ownership clarity, not based on whether it originally came from a library.
- Avoid “cleanup” that only relocates complexity without making ownership clearer.

5. Strengthen tests and verification around fork behavior

- Extend existing Vitest coverage around extracted pure logic, collision math, graph helpers, controls, and renderer behavior.
- Add or update Playwright coverage when fork cleanup changes visible interaction flows such as canvas controls, drag/drop, minimap behavior, or edge rendering.
- Use CDP visual/performance verification for meaningful `xyflow` or `dnd-kit` refactors and append notes under `perf/reports/frontend/`.

## Risks And Mitigations

- Risk: cleanup preserves historical fork structure even when it no longer fits the codebase.
  - Mitigation: judge boundaries by present-day readability and ownership, not by library ancestry.
- Risk: moving logic out of a fork creates wide import churn without improving legibility.
  - Mitigation: extract narrow APIs first and move callers incrementally.
- Risk: interaction regressions are subtle and only show up under drag-heavy or edge-heavy usage.
  - Mitigation: keep existing tests, add targeted coverage, and run CDP verification for meaningful interaction changes.
- Risk: cleanup turns into an accidental library-upgrade/resync project.
  - Mitigation: keep upgrade work out of scope unless explicitly requested.

## Verification

- Add or update Vitest coverage for extracted helpers and fork-owned render/interaction behavior.
- Run Playwright coverage for user-visible interaction changes.
- Use CDP for visual verification on controls, minimap, and edge styling changes.
- Use CDP performance profiling for drag, pan/zoom, or large-graph cleanup slices and append meaningful results under `perf/reports/frontend/`.

## Acceptance Criteria

- Contributors can tell whether a behavior belongs in app code or fork code without opening a large cluster of files.
- The largest fork hotspots have smaller, more explicit ownership boundaries.
- App code reaches into fewer deep fork internals.
- Fork cleanup preserves current behavior and keeps interaction-heavy surfaces at least as fast as before.
