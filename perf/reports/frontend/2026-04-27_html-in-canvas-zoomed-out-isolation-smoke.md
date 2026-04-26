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
- Matrix counts: 100 top-level TextBlock sections.
- Isolation variants: default, no-edges, rect-nodes, skip-transform, minimap-off, resize-observer-off.
- Gesture sample: 4 event-to-paint steps for pan and 4 event-to-paint steps for wheel zoom per graph size.
- Dataset: Go-seeded TextBlock perf projects loaded by the normal backend project-state path, using real `SectionContainer` node bodies, the active CanvasFlow renderer, and current canvas culling.
- Scripting, style, layout, task, and heap numbers come from Chrome `Performance.getMetrics` deltas around each gesture.
- Paint and composite numbers are summed from a short CDP trace around each gesture. These trace buckets are diagnostic event sums, not mutually exclusive frame budget totals.
- Raw JSON artifact, ignored by git: `perf/artifacts/frontend/html-in-canvas-pan-zoom-matrix.json`.

## Before

- Historical old-renderer baseline remains `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`.
- A same-session old xyflow matrix was not rerun here because this branch intentionally hard-deleted the active `.react-flow__viewport` / d3 renderer path before the final performance pass. Restoring that path would be compatibility work outside this branch posture.

## Current CanvasFlow Matrix

| Nodes | Variant | Gesture | FPS | Avg Input Latency | P95 Input Latency | Script | Style | Layout | Paint Trace | Composite Trace | JS Heap | Visible | Drawn | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Transform Sync | Total Paint | Timeouts |
| ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | default | pan | 104.44 | 9.33 ms | 12.20 ms | 27.30 ms | 1.34 ms | 0.53 ms | 42.68 ms | 15.81 ms | 110.08 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.40 ms | 0.10 ms | 0.50 ms | 0 |
| 100 | default | zoom | 95.92 | 10.42 ms | 16.80 ms | 5.75 ms | 0.86 ms | 0.70 ms | 42.70 ms | 14.40 ms | 119.44 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.10 ms | 0.20 ms | 0.50 ms | 0 |
| 100 | no-edges | pan | 104.99 | 9.42 ms | 12.70 ms | 25.70 ms | 0.95 ms | 0.52 ms | 41.21 ms | 14.14 ms | 130.43 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.40 ms | 0.10 ms | 0.60 ms | 0 |
| 100 | no-edges | zoom | 98.77 | 10.10 ms | 15.40 ms | 6.24 ms | 0.94 ms | 0.62 ms | 41.60 ms | 14.26 ms | 113.25 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.30 ms | 0.10 ms | 0.40 ms | 0 |
| 100 | rect-nodes | pan | 42.24 | 23.58 ms | 64.40 ms | 124.49 ms | 0.48 ms | 0.48 ms | 11.49 ms | 8.42 ms | 115.70 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0.10 ms | 0 |
| 100 | rect-nodes | zoom | 95.92 | 10.42 ms | 16.70 ms | 3.00 ms | 0.43 ms | 0.64 ms | 13.42 ms | 8.94 ms | 126.17 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0 |
| 100 | skip-transform | pan | 111.42 | 8.88 ms | 10.60 ms | 23.83 ms | 0.46 ms | 0.52 ms | 11.66 ms | 9.62 ms | 137.03 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.20 ms | 0.00 ms | 0.20 ms | 0 |
| 100 | skip-transform | zoom | 98.28 | 10.18 ms | 15.60 ms | 4.01 ms | 0.46 ms | 0.62 ms | 13.75 ms | 10.05 ms | 118.40 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.10 ms | 0.20 ms | 0.00 ms | 0.30 ms | 0 |
| 100 | minimap-off | pan | 103.09 | 9.58 ms | 13.30 ms | 22.76 ms | 0.63 ms | 0.00 ms | 36.36 ms | 11.97 ms | 129.66 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.30 ms | 0.10 ms | 0.40 ms | 0 |
| 100 | minimap-off | zoom | 115.27 | 8.67 ms | 9.60 ms | 3.88 ms | 0.66 ms | 0.00 ms | 37.38 ms | 11.95 ms | 119.53 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.20 ms | 0.20 ms | 0.40 ms | 0 |
| 100 | resize-observer-off | pan | 45.20 | 22.03 ms | 63.30 ms | 82.26 ms | 0.87 ms | 0.54 ms | 41.23 ms | 13.44 ms | 121.40 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.30 ms | 0.10 ms | 0.50 ms | 0 |
| 100 | resize-observer-off | zoom | 121.58 | 8.22 ms | 8.40 ms | 5.02 ms | 0.77 ms | 0.63 ms | 41.56 ms | 14.08 ms | 130.40 MB | 48 | 48 | 100 | 0 | 0.00 ms | 0.00 ms | 0.30 ms | 0.00 ms | 0.50 ms | 0 |

## Initial Culling Snapshot

| Nodes | Variant | Visible | Drawn | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Transform Sync |
| ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | default | 48 | 48 | 100 | 100 | 0 | 0.00 ms | 0.00 ms | 0.40 ms | 0.00 ms | 0.40 ms |
| 100 | no-edges | 48 | 48 | 100 | 100 | 0 | 0.00 ms | 0.00 ms | 0.40 ms | 0.10 ms | 0.10 ms |
| 100 | rect-nodes | 48 | 48 | 100 | 100 | 0 | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms | 0.00 ms |
| 100 | skip-transform | 48 | 48 | 100 | 100 | 0 | 0.00 ms | 0.10 ms | 0.40 ms | 0.30 ms | 0.00 ms |
| 100 | minimap-off | 48 | 48 | 100 | 100 | 0 | 0.00 ms | 0.00 ms | 0.40 ms | 0.00 ms | 0.20 ms |
| 100 | resize-observer-off | 48 | 48 | 100 | 100 | 0 | 0.00 ms | 0.00 ms | 0.30 ms | 0.10 ms | 0.20 ms |

## Decision

- Model A remains the active path: real section node bodies draw through `drawElementImage()` and pan/zoom updates stay canvas/ref-owned.
- The matrix exercises culling and canvas pan/zoom at the graph sizes listed above.
- Large graph setup now uses the Go-owned Playwright workspace seed path, so the matrix measures canvas interaction instead of thousands of section-creation route calls.
- The remaining risk is not old renderer parity. It is whether future rich-node mixes need bitmap caching or an active-node overlay if `drawElementImage()` or DOM transform sync dominates on heavier visible sets.

## Verification

- This report was generated by the opt-in Playwright perf harness above.
- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.
