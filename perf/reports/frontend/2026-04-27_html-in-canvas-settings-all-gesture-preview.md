# HTML-in-Canvas Pan/Zoom Matrix

Date: 2026-04-27
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow working tree
Related PR: n/a

## Goal

Record CanvasFlow pan/zoom matrix evidence after the hard HTML-in-Canvas renderer replacement.

## Method

- Runner: opt-in Playwright E2E harness `frontend/tests/e2e/canvasflow/html-in-canvas-pan-zoom-perf.spec.ts`.
- Command: `SETTA_CANVASFLOW_PERF=1 ./scripts/run-playwright-e2e.sh tests/e2e/canvasflow/html-in-canvas-pan-zoom-perf.spec.ts`.
- Browser: Chrome launched by Playwright with `--enable-blink-features=CanvasDrawElement`.
- Target: settings-all.
- Matrix counts: 46 registered CanvasFlow nodes.
- Isolation variants: default, no-edges, rect-nodes, skip-transform, minimap-off, resize-observer-off.
- Start viewport: x=640.13, y=366.40, zoom=0.10.
- Gesture sample: 36 event-to-paint steps for pan and 36 event-to-paint steps for wheel zoom per graph size.
- Dataset: Settings project, All Settings view loaded through the normal settings-project materialization path, using real rich settings `SectionContainer` node bodies and current canvas culling.
- Scripting, style, layout, task, and heap numbers come from Chrome `Performance.getMetrics` deltas around each gesture.
- Paint and composite numbers are summed from a short CDP trace around each gesture. These trace buckets are diagnostic event sums, not mutually exclusive frame budget totals.
- Raw JSON artifact, ignored by git: `perf/artifacts/frontend/html-in-canvas-pan-zoom-matrix.json`.

## Before

- Historical old-renderer baseline remains `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`.
- A same-session old xyflow matrix was not rerun here because this branch intentionally hard-deleted the active `.react-flow__viewport` / d3 renderer path before the final performance pass. Restoring that path would be compatibility work outside this branch posture.

## Current CanvasFlow Matrix

| Nodes | Variant | Gesture | FPS | Avg Input Latency | P95 Input Latency | Script | Style | Layout | Paint Trace | Composite Trace | JS Heap | Visible | Drawn | Preview | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Transform Sync | Total Paint | Timeouts |
| ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 46 | default | pan | 106.48 | 9.35 ms | 8.50 ms | 84.79 ms | 44.19 ms | 12.37 ms | 194.79 ms | 104.41 ms | 143.25 MB | 9 | 9 | 0 | 36 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0.10 ms | 0.10 ms | 0 |
| 46 | default | zoom | 109.32 | 9.15 ms | 13.60 ms | 35.25 ms | 33.46 ms | 12.07 ms | 183.38 ms | 96.99 ms | 158.36 MB | 27 | 27 | 0 | 33 | 0 | 0.00 ms | 0.00 ms | 0.60 ms | 0.00 ms | 0.60 ms | 0 |
| 46 | no-edges | pan | 111.46 | 8.94 ms | 8.50 ms | 77.68 ms | 39.87 ms | 12.29 ms | 193.50 ms | 101.63 ms | 158.04 MB | 9 | 9 | 0 | 36 | 0 | 0.00 ms | 0.00 ms | 0.10 ms | 0.10 ms | 0.20 ms | 0 |
| 46 | no-edges | zoom | 110.74 | 9.03 ms | 17.10 ms | 33.22 ms | 32.58 ms | 12.27 ms | 186.39 ms | 97.02 ms | 104.07 MB | 27 | 27 | 0 | 33 | 0 | 0.00 ms | 0.00 ms | 0.50 ms | 0.20 ms | 0.80 ms | 0 |
| 46 | rect-nodes | pan | 118.34 | 8.41 ms | 8.70 ms | 75.42 ms | 2.24 ms | 11.18 ms | 147.91 ms | 89.75 ms | 125.84 MB | 9 | 9 | 0 | 36 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0 |
| 46 | rect-nodes | zoom | 117.00 | 8.55 ms | 12.20 ms | 33.38 ms | 2.99 ms | 11.56 ms | 161.03 ms | 91.87 ms | 113.03 MB | 27 | 27 | 0 | 33 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0 |
| 46 | skip-transform | pan | 85.35 | 11.68 ms | 14.70 ms | 91.87 ms | 2.12 ms | 10.78 ms | 147.45 ms | 108.36 ms | 112.56 MB | 9 | 9 | 0 | 36 | 0 | 0.00 ms | 0.00 ms | 0.20 ms | 0.00 ms | 0.20 ms | 0 |
| 46 | skip-transform | zoom | 73.97 | 13.52 ms | 16.90 ms | 49.86 ms | 2.91 ms | 10.81 ms | 155.81 ms | 107.16 ms | 127.12 MB | 27 | 27 | 0 | 33 | 0 | 0.00 ms | 0.00 ms | 0.60 ms | 0.00 ms | 0.60 ms | 0 |
| 46 | minimap-off | pan | 112.36 | 8.87 ms | 8.90 ms | 72.39 ms | 36.55 ms | 0.00 ms | 44.78 ms | 18.72 ms | 127.29 MB | 9 | 9 | 0 | 36 | 0 | 0.00 ms | 0.10 ms | 0.10 ms | 0.10 ms | 0.30 ms | 0 |
| 46 | minimap-off | zoom | 109.19 | 9.15 ms | 13.50 ms | 16.39 ms | 30.94 ms | 0.39 ms | 45.35 ms | 18.46 ms | 118.17 MB | 27 | 27 | 27 | 33 | 0 | 0.00 ms | 0.10 ms | 0.00 ms | 0.00 ms | 0.10 ms | 0 |
| 46 | resize-observer-off | pan | 112.61 | 8.85 ms | 8.80 ms | 76.60 ms | 38.25 ms | 12.50 ms | 193.05 ms | 101.41 ms | 139.12 MB | 9 | 9 | 0 | 36 | 0 | 0.00 ms | 0.10 ms | 0.10 ms | 0.00 ms | 0.20 ms | 0 |
| 46 | resize-observer-off | zoom | 110.02 | 9.09 ms | 13.10 ms | 31.83 ms | 32.78 ms | 12.22 ms | 187.16 ms | 97.86 ms | 125.98 MB | 27 | 27 | 0 | 33 | 0 | 0.00 ms | 0.00 ms | 0.60 ms | 0.00 ms | 0.70 ms | 0 |

## Initial Culling Snapshot

| Nodes | Variant | Visible | Drawn | Preview | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Transform Sync |
| ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 46 | default | 27 | 27 | 0 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.70 ms | 0.40 ms | 0.20 ms |
| 46 | no-edges | 27 | 27 | 0 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.50 ms | 0.30 ms | 0.10 ms |
| 46 | rect-nodes | 27 | 27 | 0 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms |
| 46 | skip-transform | 27 | 27 | 0 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.50 ms | 0.50 ms | 0.00 ms |
| 46 | minimap-off | 27 | 27 | 0 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.70 ms | 0.60 ms | 0.10 ms |
| 46 | resize-observer-off | 27 | 27 | 0 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.50 ms | 0.40 ms | 0.10 ms |

## Decision

- Model A remains the active path: real section node bodies draw through `drawElementImage()` and pan/zoom updates stay canvas/ref-owned.
- The matrix exercises culling and canvas pan/zoom at the graph sizes listed above.
- This run uses the real Settings project All Settings view rather than synthetic TextBlock sections.
- The remaining risk is not old renderer parity. It is whether future rich-node mixes need bitmap caching or an active-node overlay if `drawElementImage()` or DOM transform sync dominates on heavier visible sets.

## Verification

- This report was generated by the opt-in Playwright perf harness above.
- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.

