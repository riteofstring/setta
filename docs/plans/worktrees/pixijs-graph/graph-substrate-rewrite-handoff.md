# Graph Substrate Rewrite Handoff

Last updated: 2026-04-02
Plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
Active history: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md`
History index: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log-index.md`
Completed summary: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md`

## Current status

- This is a fresh worktree from `main`.
- Ralph item `004` landed the first real custom drag ownership inside the `settings` graph-substrate canary:
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now owns one top-level section drag locally on the canary surface
  - the canary pins its selected section while dragging so the visible card does not swap to a different top-left candidate mid-move
  - the section body/shell now move together through a canary-local position override and commit back through the existing top-level layout persistence path on release
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` now prefers live `nodeInternals` geometry and can keep a preferred visible section selected during drag
  - `frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts` now no-ops cleanly when custom-substrate routes have transform state but no legacy `d3Zoom` / `d3Selection`
  - added `frontend/src/forks/xyflow/core/hooks/useViewportHelper.test.ts` for the null-d3 guard
  - updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` so the canary drag test finds a valid draggable point, verifies drag state/motion, and restores layout + active view mode after itself
- Ralph item `003` landed the first real `settings` graph-substrate canary at the nearest meaningful composition boundary:
  - `frontend/src/components/Pages/Project/UiPage.tsx` now chooses between legacy `ReactFlow` and a new `settings`/`All Settings` canary path
  - added `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx`
  - added `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts`
  - the canary renders one DOM-backed top-level section through a custom viewport transform instead of `xyflow`
  - the canary syncs the shared `useReactFlow` zoom/transform state so existing section internals still read the right zoom on that slice
  - legacy `ReactFlow` still owns every other route/view mode
- Ralph item `002` remains the transform/math foundation underneath that canary:
  - `frontend/src/components/Pages/Project/graphSubstrate/viewportTransform.ts`
  - focused Vitest coverage for world/screen conversion, anchored zoom, and bounds fitting
  - existing `xyflow` point conversion, fit-to-bounds, and `setCenter` math routed through that helper
- The old `setta.pixijs-rewrite` branch is research only for this effort.
- Current priority is Gate 0 basic viability on a new custom graph substrate, not polishing the old shared-page-runtime path.
- The first-order product requirement is:
  - one normal-zoom `settings` section must stay visible, attached during pan/zoom/drag, interactive, and not obviously slower than the existing DOM path
- Current live verification state:
  - targeted Vitest passed for:
    - `src/forks/xyflow/core/hooks/useViewportHelper.test.ts`
    - `src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts`
    - `src/components/Pages/Project/graphSubstrate/viewportTransform.test.ts`
  - targeted Playwright passed for `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
  - CDP visual check passed on the current worktree session:
    - `http://127.0.0.1:3075/settings`
    - `graph-substrate-canary` visible
    - `.react-flow__pane` absent on `All Settings`
    - canary drag completed with the section body still attached to the shell/header during drag and after release
    - no route crash or error boundary after release

## Architectural stance

- Do not continue the old `xyflow` + shared-page-runtime + DOM-measured shell sync model.
- Replace the graph substrate first.
- Keep DOM section bodies/editors initially.
- Make camera/world coordinates authoritative outside `xyflow`.
- Add Pixi ownership only after the substrate itself is proven.

## Immediate next frontier

- The `UIPage` seam-lift lane is complete:
  - `UIPage` is now the first real implementation selector between legacy `xyflow` and the new custom substrate canary
  - do not spend another iteration pushing this seam through more pure-forwarding layers
- The next production frontier is inside the new canary itself:
  - one normal-zoom section on `All Settings`
  - existing DOM body
  - custom pan/zoom ownership
  - no detached body drift or zoom-related error paths
- Required order from here:
  - keep the current custom viewport state model and `UIPage` seam
  - drag ownership is now in place on the canary surface
  - next implement custom pan/zoom on the same surface without falling back to `xyflow` pane ownership
  - prove the DOM body stays attached during pan/zoom as well, with no visual blur/blockiness or route-level crash paths

## Explicit deferrals

- no tiny-card or low-zoom appearance work
- no Pixi body rendering first
- no `pixiui` adoption first
- no harness-only slices unless they directly unblock the current custom-substrate slice

## Durable completed work

- This worktree now contains:
  - loop/bootstrap setup plus the fresh rewrite plan set
  - the first pure graph-substrate viewport transform helper module
  - existing `xyflow` point/fit/center callsites routed through that helper
  - a `settings`/`All Settings` `UIPage` canary seam that swaps out `ReactFlow`
  - a first custom graph-surface canary that renders one DOM-backed top-level section through the shared transform contract
  - the first custom canary drag ownership slice plus a null-safe shared viewport helper path for non-`xyflow` routes
- See `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md` for maintained milestones once product slices start landing.

## History pointers

 - Active history window: items `001` through `004`
 - Latest item: `2026-04-02 004`
- Older history archives: none yet
