# Graph Substrate Rewrite Handoff

Last updated: 2026-04-02
Plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
Active history: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md`
History index: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log-index.md`
Completed summary: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md`

## Current status

- This is a fresh worktree from `main`.
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
  - targeted Vitest passed for `settingsGraphSubstrateCanaryModel.test.ts`
  - targeted Playwright passed for `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
  - CDP visual check passed on a fresh lifecycle session:
    - `http://127.0.0.1:3076/settings`
    - `graph-substrate-canary` visible
    - exactly one `graph-substrate-canary-section` visible
    - surface not blank
    - `.react-flow__pane` absent on `All Settings`
  - note: the inherited bootstrap token was stale at the start of CDP verification; one allowed `./aireset.sh` recovery produced a fresh session and the follow-up CDP check passed

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
  - custom drag ownership
  - no detached body drift
- Required order from here:
  - keep the current custom viewport state model and `UIPage` seam
  - implement top-level section drag on the canary surface without falling back to `xyflow` drag ownership
  - prove the DOM body stays attached during that drag
  - then add custom pan/zoom on the same surface

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
- See `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md` for maintained milestones once product slices start landing.

## History pointers

- Active history window: items `001` through `003`
- Latest item: `2026-04-02 003`
- Older history archives: none yet
