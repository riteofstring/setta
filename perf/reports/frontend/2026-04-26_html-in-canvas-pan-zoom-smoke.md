# HTML-in-Canvas Pan/Zoom Smoke

Date: 2026-04-26
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow working tree
Related PR: n/a

## Goal

Record the current CanvasFlow smoke state after the active graph renderer moved
to HTML-in-Canvas and after the wheel hot path moved off React's `onWheel`
handler.

This is not the full graph-size before/after matrix from
`docs/plans/html-in-canvas-pan-zoom-plan.md`. It is a checked-in smoke marker so
the next profiling pass has a known browser/runtime state.

## Scenario

- Entry point: `http://127.0.0.1:3019/keeping_hitting`
- Steps:
  - Start with `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement" ./ai.sh`.
  - Verify CanvasFlow support and renderer shape from CDP.
  - Dispatch a cancelable synthetic wheel event at the canvas center.
  - Click the CodeMirror editor inside the visible section.
- Data set / project used: local `keeping_hitting` project, one visible top-level section.
- Browser + OS: debug Chrome launched by `./ai.sh` on macOS.
- Notes: dev server build, CanvasDrawElement enabled.

## Before

- Historical baseline: `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`.
- The historical benchmark uses the old `.react-flow__viewport` DOM transform
  path and D3 zoom replay. It remains the current checked-in baseline reference
  until the full replacement matrix is rerun on matching graph sizes.

## After

- HTML-in-Canvas support:
  - `drawElementImage`: `function`
  - `canvas.requestPaint`: `function`
  - `layoutsubtree`: present
- Active renderer shape:
  - CanvasFlow canvas present.
  - `.react-flow__viewport`: absent.
  - SVG edge layer / connection line: absent.
- Initial canvas data attributes:
  - `visibleNodes=1`
  - `drawnNodes=1`
  - `registeredNodes=1`
  - `mountedNodes=1`
  - `totalPaintMs=0.10`
  - `viewportZoom=1.1810`
- Synthetic wheel zoom:
  - `defaultPrevented=true`
  - viewport custom events observed: `2`
  - viewport changed from `x=275.65 y=285.68 zoom=1.1810` to
    `x=170.27 y=265.24 zoom=1.4743`
  - no passive wheel `preventDefault` warning appeared in the console.
- CodeMirror focus smoke:
  - active element role: `textbox`
  - active element inside `.cm-editor`: `true`
- Section shell compositing workaround:
  - computed `transform=none`
  - computed `will-change=auto`

## Conclusion

- The active renderer still uses HTML-in-Canvas with no legacy transformed
  viewport or SVG edge layers on the checked route.
- Wheel zoom now runs through a native non-passive listener and can prevent the
  browser default action.
- CanvasFlow viewport changes emit a lightweight custom event for portal
  reposition subscribers without requiring per-frame React node renders.
- Full before/after profiling for 100, 500, 1,000, 2,500, and largest local
  graph sizes is still required.

## Raw Artifacts

- `/tmp/canvasflow-wheel-popover-check.png`

## Automated Perf Tests

- Existing focused Vitest coverage:
  - `frontend/src/canvasflow/canvasFlowViewport.test.ts`
  - `frontend/src/canvasflow/canvasFlowGeometry.test.ts`
  - `frontend/src/canvasflow/canvasFlowEdges.test.ts`
  - `frontend/src/canvasflow/canvasFlowDrag.test.ts`
