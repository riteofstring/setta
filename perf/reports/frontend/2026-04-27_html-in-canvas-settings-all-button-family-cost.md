# HTML-in-Canvas Pan/Zoom Matrix

Superseded: `perf/reports/frontend/2026-04-27_html-in-canvas-settings-all-button-visual-guard.md` adds source-visual stats and shows the high-FPS action-button result was caused by a destructive selector that blanked source node content.

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
- Isolation variants: default, node-accordion-buttons-hidden, node-action-buttons-hidden, node-buttons-hidden, node-controls-hidden, rect-nodes.
- Start viewport: x=640.13, y=366.40, zoom=0.10.
- Gesture sample: 36 event-to-paint steps for pan and 36 event-to-paint steps for wheel zoom per graph size.
- First/last input columns isolate gesture-start and gesture-end event-to-paint latency; settle measures time until CanvasFlow marks viewport interaction inactive after pointer-up or the final wheel event.
- Dataset: Settings project, All Settings view loaded through the normal settings-project materialization path, using real rich settings `SectionContainer` node bodies and current canvas culling.
- Scripting, style, layout, task, and heap numbers come from Chrome `Performance.getMetrics` deltas around each gesture.
- Paint and composite numbers are summed from a short CDP trace around each gesture. These trace buckets are diagnostic event sums, not mutually exclusive frame budget totals.
- Node content variants are CSS-only diagnostics layered on the same mounted nodes; they progressively hide or simplify node internals without changing the CanvasFlow draw path.
- Raw JSON artifact, ignored by git: `perf/artifacts/frontend/html-in-canvas-pan-zoom-matrix.json`.

## Before

- Historical old-renderer baseline remains `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`.
- A same-session old xyflow matrix was not rerun here because this branch intentionally hard-deleted the active `.react-flow__viewport` / d3 renderer path before the final performance pass. Restoring that path would be compatibility work outside this branch posture.

## Current CanvasFlow Matrix

| Nodes | Variant                       | Gesture |    FPS | First Input | Last Input | Avg Input Latency | P95 Input Latency |   Settle | Settle Timeout |   Script |     Style |   Layout | Paint Trace | Composite Trace |   JS Heap | Visible | Drawn | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync | Finalizes | Durable Syncs | Total Paint | Timeouts |
| ----: | :---------------------------- | :------ | -----: | ----------: | ---------: | ----------------: | ----------------: | -------: | :------------- | -------: | --------: | -------: | ----------: | --------------: | --------: | ------: | ----: | ------: | ----: | --------: | --------------: | ---------------: | ------------: | --------------: | ---------------: | -------------: | --------: | ------------: | ----------: | -------: |
|    46 | default                       | pan     |  75.06 |    13.70 ms |    7.40 ms |          13.26 ms |          19.90 ms |  9.30 ms | no             | 68.07 ms |  41.49 ms | 11.53 ms |   691.80 ms |       141.00 ms | 147.57 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | default                       | zoom    |  72.99 |     9.50 ms |   13.80 ms |          13.70 ms |          18.00 ms | 89.20 ms | no             | 67.16 ms |  68.32 ms | 11.85 ms |   719.09 ms |       146.93 ms | 146.92 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.40 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.70 ms |        0 |
|    46 | node-accordion-buttons-hidden | pan     |  88.24 |     5.90 ms |    7.70 ms |          11.29 ms |          21.20 ms |  8.60 ms | no             | 65.39 ms |  60.62 ms | 11.51 ms |   696.49 ms |       140.18 ms | 157.40 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.20 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | node-accordion-buttons-hidden | zoom    |  72.55 |     8.30 ms |   14.80 ms |          13.78 ms |          17.50 ms | 86.20 ms | no             | 64.22 ms | 101.47 ms | 11.39 ms |   706.43 ms |       141.94 ms | 162.12 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.50 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.70 ms |        0 |
|    46 | node-action-buttons-hidden    | pan     | 111.01 |     5.10 ms |    2.30 ms |           8.98 ms |          17.60 ms |  6.30 ms | no             | 51.11 ms |  59.53 ms | 10.77 ms |    72.10 ms |        49.13 ms | 136.78 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.10 ms |        0 |
|    46 | node-action-buttons-hidden    | zoom    | 115.38 |    16.20 ms |    8.30 ms |           8.67 ms |          13.30 ms | 95.20 ms | no             | 43.59 ms |  98.19 ms | 10.60 ms |    73.79 ms |        49.34 ms | 139.96 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | node-buttons-hidden           | pan     | 108.93 |    11.00 ms |    2.00 ms |           9.15 ms |          20.00 ms |  6.10 ms | no             | 46.39 ms |  58.39 ms | 10.56 ms |    73.06 ms |        49.09 ms | 130.29 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.10 ms |        0 |
|    46 | node-buttons-hidden           | zoom    | 117.46 |    10.50 ms |    8.20 ms |           8.51 ms |          12.90 ms | 95.10 ms | no             | 43.25 ms |  99.11 ms | 10.57 ms |    74.58 ms |        49.18 ms | 131.92 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.10 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | node-controls-hidden          | pan     | 109.12 |    11.40 ms |    2.20 ms |           9.13 ms |          17.60 ms |  7.00 ms | no             | 45.79 ms |  58.94 ms | 10.52 ms |    71.35 ms |        48.33 ms | 141.38 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.10 ms |        0 |
|    46 | node-controls-hidden          | zoom    | 116.47 |    12.90 ms |    8.30 ms |           8.58 ms |          12.90 ms | 95.10 ms | no             | 42.66 ms | 100.94 ms | 10.65 ms |    75.24 ms |        49.34 ms | 139.58 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | rect-nodes                    | pan     | 118.54 |    11.00 ms |    8.30 ms |           8.41 ms |           8.50 ms |  8.10 ms | no             | 38.92 ms |   2.32 ms | 11.49 ms |   152.96 ms |        94.43 ms | 147.73 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.00 ms |        0 |
|    46 | rect-nodes                    | zoom    | 117.00 |    16.00 ms |    8.40 ms |           8.54 ms |          10.90 ms | 91.40 ms | no             | 33.67 ms |   3.10 ms | 11.71 ms |   161.99 ms |        93.97 ms | 149.85 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.10 ms |        0 |

## Initial Culling Snapshot

| Nodes | Variant                       | Visible | Drawn | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync |
| ----: | :---------------------------- | ------: | ----: | ---------: | ------: | ----: | --------: | --------------: | ----------: | ---------------: | ------------: | --------------: | ---------------: | -------------: |
|    46 | default                       |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.70 ms |          0.60 ms |             0 |               0 |          0.00 ms |        0.00 ms |
|    46 | node-accordion-buttons-hidden |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.60 ms |          0.50 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | node-action-buttons-hidden    |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.20 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.00 ms |
|    46 | node-buttons-hidden           |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.20 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | node-controls-hidden          |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.10 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |
|    46 | rect-nodes                    |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |

## Decision

- The button bottleneck is non-accordion action buttons.
- Hiding accordion-style `button[data-state]` controls did not improve zoom: `72.55 FPS` versus default `72.99 FPS`.
- Hiding non-accordion action buttons moved zoom to `115.38 FPS`, close to `node-buttons-hidden` at `117.46 FPS` and `rect-nodes` at `117.00 FPS`.
- This points away from Settings accordion triggers and toward ordinary action buttons in the mounted Settings node bodies.
- Follow-up proxy test: `perf/reports/frontend/2026-04-27_html-in-canvas-settings-all-button-proxy-cost.md`.
- The proxy test checks whether preserving the same visible button content in non-button elements is enough.

## Verification

- This report was generated by the opt-in Playwright perf harness above.
- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.
