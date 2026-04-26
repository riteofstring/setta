# HTML-in-Canvas Pan/Zoom Matrix

Date: 2026-04-28
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow working tree
Related PR: n/a

## Goal

Record CanvasFlow pan/zoom matrix evidence after the hard HTML-in-Canvas renderer replacement.

## Method

- Runner: opt-in Playwright E2E harness `frontend/tests/e2e/canvasflow/html-in-canvas-pan-zoom-perf.spec.ts`.
- Command: `SETTA_CANVASFLOW_PERF=1 SETTA_CANVASFLOW_RENDERERS=2d,webgl-texture-nodes,rect-nodes ./scripts/run-playwright-e2e.sh tests/e2e/canvasflow/html-in-canvas-pan-zoom-perf.spec.ts`.
- Browser: Chrome launched by Playwright with `--enable-blink-features=CanvasDrawElement`.
- Target: settings-all.
- Matrix counts: 46 registered CanvasFlow nodes.
- Isolation variants: default.
- Renderer plans: 2d(2d/default), webgl-texture-nodes(webgl-texture-nodes/default), rect-nodes(2d/rect-nodes).
- Start viewport: x=640.13, y=366.40, zoom=0.10.
- Gesture sample: 6 event-to-paint steps for pan and 6 event-to-paint steps for wheel zoom per graph size.
- First/last input columns isolate gesture-start and gesture-end event-to-paint latency; settle measures time until CanvasFlow marks viewport interaction inactive after pointer-up or the final wheel event.
- Dataset: Settings project, All Settings view loaded through the normal settings-project materialization path, using real rich settings `SectionContainer` node bodies and current canvas culling.
- Scripting, style, layout, task, and heap numbers come from Chrome `Performance.getMetrics` deltas around each gesture.
- Paint and composite numbers are summed from a short CDP trace around each gesture. These trace buckets are diagnostic event sums, not mutually exclusive frame budget totals.
- Node content variants are CSS-only diagnostics layered on the same mounted nodes; they progressively hide or simplify node internals without changing the CanvasFlow draw path.
- Source visual stats count visible text and button-like DOM before the gesture so destructive variants cannot be mistaken for UX-preserving optimizations.
- Raw JSON artifact, ignored by git: `perf/artifacts/frontend/html-in-canvas-pan-zoom-matrix.json`.

## Before

- Historical old-renderer baseline remains `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`.
- A same-session old xyflow matrix was not rerun here because this branch intentionally hard-deleted the active `.react-flow__viewport` / d3 renderer path before the final performance pass. Restoring that path would be compatibility work outside this branch posture.

## Current CanvasFlow Matrix

| Nodes | Renderer | Variant | Gesture | FPS | First Input | Last Input | Avg Input Latency | P95 Input Latency | Settle | Settle Timeout | Script | Style | Layout | Paint Trace | Composite Trace | JS Heap | Visible | Drawn | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Texture Uploads | Texture Upload Time | WebGL Draw | Cache Hits | Cache Misses | Texture Entries | Texture MB | Evictions | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync | Finalizes | Durable Syncs | Total Paint | Timeouts |
| ---: | :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 46 | 2d | default | pan | 95.69 | 13.60 ms | 13.90 ms | 10.05 ms | 13.90 ms | 2.90 ms | no | 13.03 ms | 0.70 ms | 1.80 ms | 26.35 ms | 21.77 ms | 147.76 MB | 27 | 27 | 36 | 0 | 0.00 ms | 0.00 ms | 0.70 ms | 0 | 0.00 ms | 0.00 ms | 0 | 0 | 0 | 0.00 MB | 0 | 0 | 0 | 0.00 ms | 0.10 ms | 1 | 0 | 0.80 ms | 0 |
| 46 | 2d | default | zoom | 102.39 | 14.30 ms | 10.90 ms | 9.75 ms | 14.30 ms | 88.90 ms | no | 10.00 ms | 0.84 ms | 1.99 ms | 25.83 ms | 21.14 ms | 159.61 MB | 27 | 27 | 36 | 0 | 0.00 ms | 0.00 ms | 0.60 ms | 0 | 0.00 ms | 0.00 ms | 0 | 0 | 0 | 0.00 MB | 0 | 0 | 0 | 0.00 ms | 0.00 ms | 1 | 1 | 0.70 ms | 0 |
| 46 | webgl-texture-nodes | default | pan | 134.83 | 1.30 ms | 10.40 ms | 7.25 ms | 10.40 ms | 7.40 ms | no | 6.85 ms | 0.58 ms | 1.69 ms | 21.25 ms | 13.19 ms | 283.07 MB | 27 | 27 | 27 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0 | 0.00 ms | 0.20 ms | 27 | 0 | 27 | 19.06 MB | 0 | 0 | 0 | 0.00 ms | 0.20 ms | 1 | 0 | 0.20 ms | 0 |
| 46 | webgl-texture-nodes | default | zoom | 135.75 | 2.40 ms | 8.20 ms | 7.35 ms | 8.60 ms | 91.20 ms | no | 5.59 ms | 0.71 ms | 1.67 ms | 20.58 ms | 12.72 ms | 266.77 MB | 27 | 27 | 27 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0 | 0.00 ms | 0.20 ms | 27 | 0 | 27 | 19.06 MB | 0 | 0 | 0 | 0.00 ms | 0.10 ms | 1 | 1 | 0.20 ms | 0 |
| 46 | rect-nodes | rect-nodes | pan | 108.30 | 11.60 ms | 8.30 ms | 8.85 ms | 11.60 ms | 8.10 ms | no | 6.25 ms | 0.77 ms | 1.85 ms | 24.98 ms | 16.07 ms | 333.40 MB | 27 | 27 | 27 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0 | 0.00 ms | 0.00 ms | 0 | 0 | 0 | 0.00 MB | 0 | 0 | 0 | 0.00 ms | 0.00 ms | 1 | 1 | 0.10 ms | 0 |
| 46 | rect-nodes | rect-nodes | zoom | 103.81 | 15.90 ms | 8.60 ms | 9.63 ms | 15.90 ms | 91.20 ms | no | 5.75 ms | 0.52 ms | 2.27 ms | 30.36 ms | 19.14 ms | 346.66 MB | 27 | 27 | 27 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0 | 0.00 ms | 0.00 ms | 0 | 0 | 0 | 0.00 MB | 0 | 0 | 0 | 0.00 ms | 0.00 ms | 1 | 1 | 0.10 ms | 0 |

## Initial Culling Snapshot

| Nodes | Renderer | Variant | Visible | Drawn | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Texture Entries | Texture MB | Texture Uploads Total | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync |
| ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 46 | 2d | default | 27 | 27 | 46 | 36 | 0 | 0.00 ms | 0.10 ms | 0.70 ms | 0.50 ms | 0 | 0.00 MB | 0 | 0 | 0 | 0.00 ms | 0.10 ms |
| 46 | webgl-texture-nodes | default | 27 | 27 | 46 | 27 | 0 | 0.00 ms | 0.00 ms | 0.10 ms | 0.00 ms | 27 | 19.06 MB | 27 | 0 | 0 | 0.00 ms | 0.10 ms |
| 46 | rect-nodes | rect-nodes | 27 | 27 | 46 | 27 | 0 | 0.00 ms | 0.00 ms | 0.20 ms | 0.00 ms | 0 | 0.00 MB | 0 | 0 | 0 | 0.00 ms | 0.00 ms |

## Source Visual Snapshot

| Nodes | Renderer | Variant | Mounted Source Nodes | Nodes With Visible Text | Visible Text Chars | Visible Button-Like | Hidden Button-Like | Visible Action Buttons | Hidden Action Buttons | Visible Accordion Buttons | Hidden Accordion Buttons |
| ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 46 | 2d | default | 36 | 36 | 11,989 | 1,122 | 0 | 942 | 0 | 36 | 0 |
| 46 | webgl-texture-nodes | default | 36 | 36 | 11,989 | 1,122 | 0 | 942 | 0 | 36 | 0 |
| 46 | rect-nodes | rect-nodes | 36 | 36 | 11,989 | 1,122 | 0 | 942 | 0 | 36 | 0 |

## Decision

- The default renderer remains `2d`; `webgl-texture-nodes` is still an opt-in renderer until broader interaction and performance gates pass.
- The matrix exercises renderer selection, culling, and canvas pan/zoom at the graph sizes listed above.
- This run uses the real Settings project All Settings view rather than synthetic TextBlock sections.
- WebGL rows are valid only when source visual stats remain comparable and texture upload deltas stay at zero during viewport-only gestures after warm-up.

## Verification

- This report was generated by the opt-in Playwright perf harness above.
- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.
