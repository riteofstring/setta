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

| Nodes | Variant | Gesture | FPS | Avg Input Latency | P95 Input Latency | Script | Style | Layout | Paint Trace | Composite Trace | JS Heap | Visible | Drawn | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Transform Sync | Total Paint | Timeouts |
| ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 46 | default | pan | 74.92 | 13.30 ms | 16.30 ms | 101.67 ms | 34.64 ms | 11.06 ms | 680.48 ms | 132.82 ms | 146.94 MB | 9 | 9 | 36 | 0 | 0.00 ms | 0.00 ms | 0.20 ms | 0.00 ms | 0.20 ms | 0 |
| 46 | default | zoom | 75.17 | 13.30 ms | 18.30 ms | 62.08 ms | 55.80 ms | 11.39 ms | 712.66 ms | 142.27 ms | 162.19 MB | 27 | 27 | 33 | 0 | 0.00 ms | 0.00 ms | 0.70 ms | 0.00 ms | 0.70 ms | 0 |
| 46 | no-edges | pan | 81.43 | 12.24 ms | 15.30 ms | 96.85 ms | 30.23 ms | 11.00 ms | 693.92 ms | 136.88 ms | 162.92 MB | 9 | 9 | 36 | 0 | 0.00 ms | 0.10 ms | 0.20 ms | 0.00 ms | 0.30 ms | 0 |
| 46 | no-edges | zoom | 74.58 | 13.40 ms | 20.80 ms | 81.12 ms | 57.36 ms | 11.61 ms | 731.98 ms | 161.85 ms | 119.72 MB | 27 | 27 | 33 | 0 | 0.00 ms | 0.00 ms | 0.50 ms | 0.10 ms | 0.60 ms | 0 |
| 46 | rect-nodes | pan | 118.34 | 8.42 ms | 10.10 ms | 76.35 ms | 2.28 ms | 11.18 ms | 151.66 ms | 92.60 ms | 141.56 MB | 9 | 9 | 36 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0.10 ms | 0 |
| 46 | rect-nodes | zoom | 116.69 | 8.56 ms | 12.50 ms | 38.90 ms | 3.05 ms | 11.61 ms | 160.20 ms | 92.36 ms | 129.80 MB | 27 | 27 | 33 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0 |
| 46 | skip-transform | pan | 83.96 | 11.88 ms | 14.90 ms | 90.49 ms | 2.18 ms | 10.78 ms | 149.43 ms | 109.21 ms | 150.06 MB | 9 | 9 | 36 | 0 | 0.00 ms | 0.00 ms | 0.20 ms | 0.00 ms | 0.20 ms | 0 |
| 46 | skip-transform | zoom | 72.80 | 13.72 ms | 16.80 ms | 55.65 ms | 3.42 ms | 12.03 ms | 167.85 ms | 115.16 ms | 143.92 MB | 27 | 27 | 33 | 0 | 0.00 ms | 0.00 ms | 0.70 ms | 0.00 ms | 0.70 ms | 0 |
| 46 | minimap-off | pan | 80.61 | 12.37 ms | 14.80 ms | 80.43 ms | 28.26 ms | 0.00 ms | 693.88 ms | 127.53 ms | 144.97 MB | 9 | 9 | 36 | 0 | 0.00 ms | 0.00 ms | 0.30 ms | 0.00 ms | 0.30 ms | 0 |
| 46 | minimap-off | zoom | 80.48 | 12.42 ms | 17.60 ms | 43.48 ms | 54.44 ms | 0.31 ms | 709.77 ms | 133.53 ms | 136.20 MB | 27 | 27 | 33 | 0 | 0.00 ms | 0.00 ms | 0.50 ms | 0.20 ms | 0.70 ms | 0 |
| 46 | resize-observer-off | pan | 75.57 | 13.19 ms | 16.80 ms | 104.83 ms | 31.28 ms | 13.10 ms | 762.57 ms | 142.11 ms | 158.19 MB | 9 | 9 | 36 | 0 | 0.00 ms | 0.00 ms | 0.10 ms | 0.10 ms | 0.30 ms | 0 |
| 46 | resize-observer-off | zoom | 76.11 | 13.14 ms | 18.60 ms | 66.45 ms | 57.02 ms | 11.75 ms | 741.76 ms | 143.19 ms | 146.33 MB | 27 | 27 | 33 | 0 | 0.00 ms | 0.00 ms | 0.60 ms | 0.10 ms | 0.80 ms | 0 |

## Initial Culling Snapshot

| Nodes | Variant | Visible | Drawn | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Transform Sync |
| ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 46 | default | 27 | 27 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.60 ms | 0.40 ms | 0.20 ms |
| 46 | no-edges | 27 | 27 | 46 | 36 | 0 | 0.00 ms | 0.10 ms | 0.60 ms | 0.40 ms | 0.10 ms |
| 46 | rect-nodes | 27 | 27 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.10 ms | 0.00 ms | 0.00 ms |
| 46 | skip-transform | 27 | 27 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.30 ms | 0.30 ms | 0.00 ms |
| 46 | minimap-off | 27 | 27 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.40 ms | 0.20 ms | 0.20 ms |
| 46 | resize-observer-off | 27 | 27 | 46 | 36 | 0 | 0.00 ms | 0.00 ms | 0.50 ms | 0.30 ms | 0.20 ms |

## Decision

- Model A remains the active path: real section node bodies draw through `drawElementImage()` and pan/zoom updates stay canvas/ref-owned.
- The matrix exercises culling and canvas pan/zoom at the graph sizes listed above.
- This run uses the real Settings project All Settings view rather than synthetic TextBlock sections.
- The remaining risk is not old renderer parity. It is whether future rich-node mixes need bitmap caching or an active-node overlay if `drawElementImage()` or DOM transform sync dominates on heavier visible sets.

## Verification

- This report was generated by the opt-in Playwright perf harness above.
- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.

