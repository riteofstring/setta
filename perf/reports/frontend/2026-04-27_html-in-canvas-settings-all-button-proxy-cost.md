# HTML-in-Canvas Pan/Zoom Matrix

Superseded: `perf/reports/frontend/2026-04-27_html-in-canvas-settings-all-button-visual-guard.md` adds source-visual stats and reruns this matrix with corrected selectors.

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
- Isolation variants: default, node-action-button-proxies, node-action-buttons-hidden, node-buttons-hidden, rect-nodes.
- Start viewport: x=640.13, y=366.40, zoom=0.10.
- Gesture sample: 36 event-to-paint steps for pan and 36 event-to-paint steps for wheel zoom per graph size.
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

| Nodes | Variant                    | Gesture |    FPS | First Input | Last Input | Avg Input Latency | P95 Input Latency |   Settle | Settle Timeout |   Script |     Style |   Layout | Paint Trace | Composite Trace |   JS Heap | Visible | Drawn | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync | Finalizes | Durable Syncs | Total Paint | Timeouts |
| ----: | :------------------------- | :------ | -----: | ----------: | ---------: | ----------------: | ----------------: | -------: | :------------- | -------: | --------: | -------: | ----------: | --------------: | --------: | ------: | ----: | ------: | ----: | --------: | --------------: | ---------------: | ------------: | --------------: | ---------------: | -------------: | --------: | ------------: | ----------: | -------: |
|    46 | default                    | pan     |  75.81 |    14.20 ms |    9.30 ms |          13.13 ms |          17.70 ms |  9.20 ms | no             | 64.70 ms |  41.53 ms | 11.33 ms |   687.28 ms |       139.45 ms | 158.02 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.30 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | default                    | zoom    |  71.90 |     9.90 ms |   13.70 ms |          13.90 ms |          18.60 ms | 84.80 ms | no             | 65.75 ms |  67.66 ms | 12.12 ms |   713.89 ms |       144.33 ms | 156.92 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.70 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.80 ms |        0 |
|    46 | node-action-button-proxies | pan     |  78.11 |     8.90 ms |    7.90 ms |          12.77 ms |          25.10 ms |  9.00 ms | no             | 68.32 ms |  41.15 ms | 12.69 ms |   738.47 ms |       149.29 ms | 108.58 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.20 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | node-action-button-proxies | zoom    |  76.73 |     7.80 ms |   14.10 ms |          13.03 ms |          17.10 ms | 89.20 ms | no             | 64.22 ms |  68.78 ms | 12.03 ms |   727.18 ms |       145.10 ms | 108.83 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.70 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.80 ms |        0 |
|    46 | node-action-buttons-hidden | pan     | 111.56 |     3.70 ms |    2.20 ms |           8.93 ms |          17.80 ms |  6.50 ms | no             | 51.25 ms |  60.19 ms | 12.04 ms |    72.36 ms |        48.65 ms | 121.20 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.10 ms |        0 |
|    46 | node-action-buttons-hidden | zoom    | 115.46 |    15.80 ms |    8.40 ms |           8.66 ms |          13.30 ms | 95.20 ms | no             | 43.09 ms | 100.38 ms | 11.68 ms |    74.88 ms |        48.67 ms | 120.07 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | node-buttons-hidden        | pan     | 110.53 |     7.40 ms |    2.30 ms |           9.02 ms |          18.40 ms |  7.30 ms | no             | 46.37 ms |  58.16 ms | 11.98 ms |    73.39 ms |        48.57 ms | 129.09 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | node-buttons-hidden        | zoom    | 117.61 |     9.10 ms |    8.10 ms |           8.50 ms |          12.40 ms | 95.00 ms | no             | 42.70 ms | 100.42 ms | 11.69 ms |    75.32 ms |        49.02 ms | 130.63 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.30 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | rect-nodes                 | pan     | 121.54 |     4.10 ms |    8.00 ms |           8.19 ms |           9.20 ms |  9.00 ms | no             | 38.78 ms |   2.28 ms | 12.88 ms |   156.30 ms |        96.46 ms | 123.90 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.00 ms |        0 |
|    46 | rect-nodes                 | zoom    | 117.07 |    16.00 ms |    8.20 ms |           8.54 ms |          12.60 ms | 91.70 ms | no             | 33.50 ms |   3.11 ms | 13.35 ms |   173.56 ms |       100.83 ms | 124.06 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.10 ms |        0 |

## Initial Culling Snapshot

| Nodes | Variant                    | Visible | Drawn | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync |
| ----: | :------------------------- | ------: | ----: | ---------: | ------: | ----: | --------: | --------------: | ----------: | ---------------: | ------------: | --------------: | ---------------: | -------------: |
|    46 | default                    |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.10 ms |     0.70 ms |          0.50 ms |             0 |               0 |          0.00 ms |        0.00 ms |
|    46 | node-action-button-proxies |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.60 ms |          0.40 ms |             0 |               0 |          0.00 ms |        0.20 ms |
|    46 | node-action-buttons-hidden |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.10 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | node-buttons-hidden        |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.10 ms |     0.20 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | rect-nodes                 |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |

## Source Visual Snapshot

| Nodes | Variant                    | Mounted Source Nodes | Nodes With Visible Text | Visible Text Chars | Visible Button-Like | Hidden Button-Like | Visible Action Buttons | Hidden Action Buttons | Visible Accordion Buttons | Hidden Accordion Buttons |
| ----: | :------------------------- | -------------------: | ----------------------: | -----------------: | ------------------: | -----------------: | ---------------------: | --------------------: | ------------------------: | -----------------------: |
|    46 | default                    |                   36 |                      36 |             11,989 |               1,122 |                  0 |                    942 |                     0 |                        36 |                        0 |
|    46 | node-action-button-proxies |                   36 |                      36 |             11,989 |               1,122 |                201 |                    942 |                   201 |                        36 |                        0 |
|    46 | node-action-buttons-hidden |                   36 |                       0 |                  0 |                   0 |              1,122 |                      0 |                   942 |                         0 |                       36 |
|    46 | node-buttons-hidden        |                   36 |                       0 |                  0 |                   0 |              1,122 |                      0 |                   942 |                         0 |                       36 |
|    46 | rect-nodes                 |                   36 |                      36 |             11,989 |               1,122 |                  0 |                    942 |                     0 |                        36 |                        0 |

## Decision

- Model A remains the active path: real section node bodies draw through `drawElementImage()` and pan/zoom updates stay canvas/ref-owned.
- The matrix exercises culling and canvas pan/zoom at the graph sizes listed above.
- This run uses the real Settings project All Settings view rather than synthetic TextBlock sections.
- The remaining risk is not old renderer parity. It is whether future rich-node mixes need bitmap caching or an active-node overlay if `drawElementImage()` or DOM transform sync dominates on heavier visible sets.

## Verification

- This report was generated by the opt-in Playwright perf harness above.
- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.
