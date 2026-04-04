# Graph Substrate Rewrite Handoff

Last updated: 2026-04-02
Plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
Active history: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md`
History index: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log-index.md`
Completed summary: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md`

## Current status

- This is a fresh worktree from `main`.
- Ralph item `002` landed the first shared viewport/camera math for the rewrite:
  - added `frontend/src/components/Pages/Project/graphSubstrate/viewportTransform.ts`
  - added focused Vitest coverage for world/screen conversion, anchored zoom, and bounds fitting
  - routed existing `xyflow` point conversion, fit-to-bounds, and `setCenter` math through that helper so the current app already uses the same transform contract
- The old `setta.pixijs-rewrite` branch is research only for this effort.
- Current priority is Gate 0 basic viability on a new custom graph substrate, not polishing the old shared-page-runtime path.
- The first-order product requirement is:
  - one normal-zoom `settings` section must stay visible, attached during pan/zoom/drag, interactive, and not obviously slower than the existing DOM path
- Current live verification state:
  - targeted Vitest slice passed for the new helper module and existing `graph.ts` coverage
  - CDP smoke on the worktree bootstrap reached `/home` and `/settings` with no blank-screen regression

## Architectural stance

- Do not continue the old `xyflow` + shared-page-runtime + DOM-measured shell sync model.
- Replace the graph substrate first.
- Keep DOM section bodies/editors initially.
- Make camera/world coordinates authoritative outside `xyflow`.
- Add Pixi ownership only after the substrate itself is proven.

## Immediate next frontier

- Introduce a narrow custom graph/runtime seam for `settings` while leaving existing behavior untouched elsewhere.
- First implementation target remains:
  - one normal-zoom section on `All Settings`
  - existing DOM body
  - custom camera/drag ownership
  - no detached body drift
- Required order from here:
  - define a stable custom viewport state model that uses `viewportTransform.ts`
  - introduce a custom graph/runtime seam for the canary route
  - render one section body through that seam with DOM content
  - implement drag on the new substrate and prove the body stays attached

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
- See `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md` for maintained milestones once product slices start landing.

## History pointers

- Active history window: items `001` through `002`
- Latest item: `2026-04-02 002`
- Older history archives: none yet
