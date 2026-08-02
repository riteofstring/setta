# Workspace Overview Freeze, Ghost Overlay & Pan — 2026-06-23

## Scope

Second repair pass on the workspace presentation/drag work, addressing four
defects reported after the first drag-and-drop repair
(`workspace-drag-and-drop-20260622.md`) did not resolve them:

1. **Add-pane ghost overlay over panes.** The overview "add pane here" affordance
   (`WorkspaceOverviewGhostButton`, `z-index: 70`, `pointer-events: auto`)
   appeared on top of existing panes and intercepted the pointer events needed to
   start a drag.
2. **Frozen pane content rendered far smaller than its pane box** (visible in
   overview as tiny content in the top-left of each card), and the related
   overview/navigation flicker.
3. **Overview clipped off-screen panes** with no way to reach them.
4. (Same root as 2) content not staying frozen at the correct size during
   niri navigation / overview.

## Root causes

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Ghost overlay covers panes, blocks drag | `overviewVerticalGhostTarget` / `overviewRightGhostTarget` derive an above/below/right slot from a single hovered pane's rect; the detection band extends a full pane width/height into the neighbouring row/column, so the slot lands on a real pane. | `ghostTargetOverlapsAnyPane` rejects any candidate slot whose rect intersects an existing visible pane, so the affordance only appears in genuinely empty gutter space (`workspace-overview-ghost.ts`). |
| Frozen content tiny | `pinSnapshotRootBounds` pinned the frozen DOM clone to `getBoundingClientRect()`, which **includes** the overview `scale()` transform — so in overview the clone was pinned to the shrunken thumbnail pixel size and rendered at ~`scale` of its pane box. | `unscaledSnapshotBounds` pins to `offsetWidth`/`offsetHeight` (layout box, ignores transforms), falling back to the bounding rect for non-HTML elements (`surface-dom-content.ts`). |
| Overview clips off-screen panes | `frame-scheduler` force-zeroed overview scroll and there was no pan path; `overviewScale` keeps a readable floor (min card width), so large workspaces overflow and were simply clipped. | Pixel-pan plumbed through `LayoutFrameInput.overviewPanX/Y` → `renderOverviewLayoutFrame` (clamped to content bounds) → `WorkspaceLayoutStore.panOverviewBy` → overview wheel/trackpad routing (`handleOverviewWheelPan`). Fit-all to the readable floor is unchanged; once it overflows, the surface pans. |

## Freeze model (after)

- Pane hosts continue to lay out at full pane size and are visually scaled with a
  single `transform: scale()` write; the runtime policy freezes overview/moving
  panes to a one-shot DOM snapshot. With the size-capture fix the snapshot now
  matches the pane box, so transforms remain "free" (no re-layout, no re-render)
  during overview and niri navigation — which also removes the snapshot-popping
  flicker.
- The drag preview path was already coalesced to one update per animation frame
  (`requestAnimationFrame` + `samePaneDropTarget`) and writes the dragged host via
  `style.translate` (independent of the engine's `transform`), so no transform
  fighting was introduced.

## Overview pan bounds

`overviewLayoutMetrics` (shared by the renderer and `engine.overviewContentBounds`)
computes `scale`, content screen size, and `maxPanX/maxPanY` from the same
geometry, so the store's clamp always matches what is rendered. `maxPan` is the
distance from the edge-aligned base offset to the far content edge; it is `0` when
the content already fits, so a fitting workspace cannot be panned.

## Guardrails / tests added

- `workspace-overview-ghost.test.ts`: ghost slots are suppressed in the inter-row
  and inter-column gaps of a dense grid and only appear in empty edge space.
- `surface-dom-content.test.ts`: `unscaledSnapshotBounds` ignores the scaled
  bounding rect and uses the untransformed layout box.
- `layout-engine.test.ts`: `overviewContentBounds` reports pan room only when the
  content overflows; the overview render shifts panes by the pan amount and clamps
  over-pan.
- `layout-store.test.ts`: `panOverviewBy` clamps to bounds, no-ops outside
  overview and at the edges, and resets on entering/leaving overview.
- `workspace-interactions.test.ts`: overview wheel events route to
  `panOverviewBy` (not focus moves) and are ignored outside the workspace root.

Full `desktop` workspace-layout vitest suite passes at 272 tests (13 added across
this pass). The whole `desktop` vitest run is green (560 tests via the quality
gate).

## Still to verify in the running app

- Interactive feel of overview wheel/trackpad panning (momentum, clamp behaviour)
  on a real large workspace — the math is covered deterministically, but the
  gesture tuning should be eyeballed.
- Whether keyboard focus moves in overview should also auto-scroll the focused
  pane into view (currently only wheel/trackpad pans). Left as a follow-up.
- Chrome large-DOM profile of overview entry + pan (p95/p99 frame time, long
  tasks) to confirm the snapshot-size fix removed the overview re-layout churn.
