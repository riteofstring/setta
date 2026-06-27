# Workspace Overview Drag-Scale Freeze, Free Zoom & Pan — 2026-06-26

## Scope

Third pass on the workspace overview presentation/drag work, following
`workspace-overview-freeze-and-pan-20260623.md`. Fixes three reported defects and
adds a feature:

1. **Warped drag targeting in overview.** Dragging a pane from a higher row would
   not let it drop on its own row or below the next row; it kept resolving to a
   half-height row-insert that split with the pane below.
2. **Zoom snap on drag start.** Grabbing a pane (especially a far-edge one) made
   the overview zoom jump mid-operation.
3. **No free pan/zoom.** Overview was fit-all only.

(1) and (2) share one root cause; (3) is the new capability.

## Root cause (defects 1 & 2)

The overview scale was recomputed every frame from `this.columns` in
`overviewLayoutGeometry` (`layout-engine-rendering.ts`). During a drag,
`LayoutEngine.renderFrame` temporarily swaps `this.columns` to the **preview**
columns, so a drop preview reflowed the scene and rescaled the overview:

- the visible zoom snapped (defect 2), and
- the drag's screen-pixel hit rects (frozen once at drag start) no longer lined
  up with the re-scaled panes, so targeting was offset/compressed into forced
  half-height inserts (defect 1).

Normal mode is immune because its scale is constant (1); only pane offsets reflow.

## Fix / change shape

- **Freeze the overview frame during a preview.** `renderFrame` computes the
  overview frame transform (scale, base offsets, pan bounds) from the *committed*
  columns and renders the preview pane offsets inside that frozen frame
  (`OverviewFrameTransform`). The scale/centering/pan bounds hold for the whole
  drag, restoring parity with normal mode (only offsets reflow). This alone fixes
  defects 1 & 2.
- **User zoom.** `LayoutFrameInput.overviewZoom` (store-owned, default 1) is
  applied as `clamp(fitScale * zoom, fitScale, OVERVIEW_MAX_ZOOM_SCALE)`
  (`applyOverviewZoom`, cap `0.5`). The store's `zoomOverviewBy` zooms toward the
  cursor; `panOverviewBy` and the wheel/pointer gestures route through the same
  bounds.

## Performance characteristics

Analysis (the freeze touches the per-frame overview render hot path):

| Situation | Before | After |
| --- | --- | --- |
| Steady-state overview (no drag) | one `overviewLayoutGeometry` / frame | identical; zoom adds one multiply + clamp (negligible) |
| Zoom in/out | n/a | per-pane `scale` change only — transform-only, **no re-layout** (snapshot sizing is `unscaledSnapshotBounds`, scale-independent), so a zoom costs the same as a pan |
| Active drag preview | scale recomputed from preview columns each frame → **scale changed every preview frame** (extra distinct transform values, the visible snap) | one extra `overviewLayoutMetrics` (pure math, no DOM) to compute the frozen committed frame; scale is now **stable** across preview frames → equal-or-fewer distinct transform writes |

Net: no new steady-state work; the drag path swaps a per-frame rescale for a
single pure-math frame computation and **removes** the rescale-driven transform
churn. Pixel-pan and per-pane scaling remain single `transform` writes (no box
re-layout), consistent with the prior freeze-model fix.

## Guardrails / tests added (deterministic)

- `layout-engine-overview-zoom.test.ts`: overview scale is **unchanged while a
  drop preview reflows the layout** (the core regression for 1 & 2), and the test
  proves the freeze is meaningful by committing the same move and asserting the
  scale *does* change; `overviewContentBounds` honours `overviewZoom` (grows with
  zoom, capped at `0.5`, never below fit); render emits the zoomed `scale`.
- `layout-store.test.ts`: `overviewZoom` defaults to fit, resets on re-entry,
  no-ops outside overview; clamps to `[fit, 0.5]`; zooming in opens pan room that
  fit-all did not allow; **zoom keeps the surface point under the cursor fixed**.
- `overview-wheel-gesture.test.ts`: wheel classification matrix (pinch / modifier
  / line-mode / coarse notch → zoom; smooth / fractional / horizontal → pan) and
  the deltaY→factor mapping.
- `workspace-interactions.test.ts`: overview wheels route to zoom vs pan per
  classification (cursor mapped into stage space), pan unchanged for trackpad.
- `frame-scheduler.test.ts`: `overviewZoom` threaded into the overview frame input
  and the zoom-endpoint cache key.

Full `desktop` vitest run is green (585 tests; +17 added across this pass).

## Follow-up pass: drop-preview box + live add-pane preview

Two further overview affordances, both built to the same "settle to zero cost"
rule:

### Drag drop-preview box
A faint box marks the exact landing slot while dragging a pane. The presentation
engine positions one reused overlay element at the dragged pane's *engine-computed*
preview item rect (insert) or the swap target's rect (swap), each frame a drag is
already rendering — no extra layout passes, no new elements per frame. Hidden
unless a drop target is resolved.

### Live "add pane" preview (replaces the predicted ghost)
Hovering an overview add-slot now reflows the overview to the **real** post-add
layout and lands the "+" affordance on the exact slot, so the hover and the result
are identical. Performance model (the hard requirement was 120fps):

| Concern | Safeguard |
| --- | --- |
| Per-`pointermove` cost | The preview is (re)computed **only when the resolved slot changes** (`previewInsertFrame` returns false / does not notify for the same slot). |
| Oscillation (reflow shifts panes under the cursor → re-resolves → reflow…) | Hover is resolved against **frozen committed pane frames** captured on first activation (`captureOverviewPaneFrames`), so the reflow can never change the resolved slot. Live frames are read only to *start* a preview, never while one is held. |
| Continuous rendering | The insert preview is **not** in the scheduler's "moving" path (not a zoom, reorder-preview, or drag/pan session), so the scheduler renders one frame per slot change and then idles. CSS (`[data-insert-previewing]`) eases the single reflow on the GPU — zero extra JS frames. |
| Exactness / leaks | The reflow runs the **real** `openPaneNearPane` on a deep-copied snapshot of engine state and restores it in a `finally`; the placeholder is never rendered (the affordance marks its slot) and nothing is committed. No id/sequence leak (asserted by tests). |

Net at rest (hovering a settled slot, or overview idle): 0 JS frames, 0 layout
work. One bounded reflow computation per slot change.

### Guardrails added
- `layout-engine-overview-zoom.test.ts`: a previewed insert reflows the existing
  panes, never renders the placeholder, and **restores engine state** (no commit /
  no leak); `overviewInsertPreviewBounds` returns the exact slot rect without
  leaking.
- `layout-store.test.ts`: `previewInsertFrame` exposes the slot target, is a no-op
  for the same slot / outside overview, and clears on overview exit.
- `presentation-engine.test.ts`: the drop-preview box sits at the previewed slot
  (insert) and the swap target, and hides when no drop is resolved.

Full `desktop` workspace-layout vitest run is green (304 tests). The wider desktop
suite is green apart from two unrelated, timing-flaky main/preload IPC tests that
pass in isolation.

## Still to verify in the running app

- Live Chrome / Electron large-DOM profile of overview entry + drag + zoom + pan
  (p95/p99 frame time, long tasks) to confirm the analytical no-regression. This
  pass records the analysis + deterministic guardrails; the Electron benchmark
  (`tests/electron/pane-drag-drop-benchmark-performance.test.mjs`) requires
  `pnpm build`, currently blocked by **pre-existing** branch typecheck failures in
  `pane-drag-reorder.ts` (unrelated to this change). Re-run once the branch
  typecheck is green.
- Gesture feel: the wheel-vs-trackpad heuristic thresholds (`overview-wheel-gesture.ts`)
  and the zoom sensitivity should be eyeballed on real hardware (mouse + trackpad).
