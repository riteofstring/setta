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

## Addendum: Embedded Popover and Data Edge Smoke

Date: 2026-04-26
Branch/Commit: go-rewrite-canvas-replace-xyflow working tree

### Scenario

- Entry point: `http://127.0.0.1:3019/keeping_hitting`
- Startup: `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement" ./ai.sh`
- Added temporary local sections in the active dev project for browser smoke only:
  - one Draw section for real DrawArea toolbar popovers
  - two Dict sections with one data edge between a source output port and a target edge-input param
- Browser + OS: debug Chrome launched by `./ai.sh` on macOS.

### Results

- HTML-in-Canvas support stayed active:
  - `drawElementImage`: `function`
  - `canvas.requestPaint`: `function`
  - `layoutsubtree`: present
- Active renderer shape stayed canvas-only:
  - `.react-flow__viewport`: `0`
  - `.react-flow__pane`: `0`
  - old SVG edge layers: `0`
- Canvas dataset after adding smoke sections:
  - `visibleNodes=4`
  - `drawnNodes=4`
  - `registeredNodes=4`
  - `mountedNodes=4`
  - `totalPaintMs=0.10` to `0.30` in the sampled paint snapshots
- DrawArea Radix popover:
  - opened a real DrawArea brush settings popover (`Opacity`, `Size`, `Brush Shape`)
  - synthetic wheel zoom returned `defaultPrevented=true`
  - CanvasFlow viewport changed from `x=363.87 y=248.80 zoom=0.9852` to `x=423.17 y=269.82 zoom=0.8114`
  - shared popover reposition path emitted one `scroll` and one `resize` signal
  - Radix wrapper moved from `translate(776.5px, 407px)` to `translate(740.5px, 407.5px)`, tracking the transformed trigger
- CodeMirror focus:
  - clicking the generated Python editor focused a CodeMirror element
  - active element role: `textbox`
  - active element inside `.cm-editor`: `true`
- Data edge browser smoke:
  - data-edge source and target handles rendered with `canvas-flow__handle` classes
  - old SVG data edge layer count stayed `0`
  - direct canvas edge hit selection changed the edge from `selected=false` to `selected=true`
  - direct canvas source-endpoint hit started reconnect state with the opposite target handle:
    - `sectionId=35394b88d16923c2699bbdf05b8c54e8`
    - `handleId=1654fe1435996f58fb265421ad948ba8`
    - `type=target`

Synthetic pointer events in CDP do not create an active browser pointer capture,
so the selection/reconnect smoke patched `setPointerCapture` and
`releasePointerCapture` to no-op for the programmatic event dispatch. The edge
hit testing and store state transitions were still exercised through the
CanvasFlow canvas event path. A physical browser gesture pass should still be
used before treating reconnect UX as fully audited.

### Follow-up

- This addendum validates embedded popover repositioning and data-edge canvas
  hit state on a small graph.
- The full 100 / 500 / 1,000 / 2,500 / largest-local graph performance matrix is
  still not recorded.
