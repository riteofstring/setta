# HTML-in-Canvas Pan/Zoom Matrix

Superseded: `perf/reports/frontend/2026-04-27_html-in-canvas-settings-all-button-visual-guard.md` adds source-visual stats and shows the high-FPS button-hidden result was caused by a destructive selector that blanked source node content.

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
- Isolation variants: default, node-buttons-hidden, node-comboboxes-hidden, node-text-inputs-hidden, node-native-selects-hidden, node-range-color-hidden, node-controls-hidden, rect-nodes.
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

| Nodes | Variant                    | Gesture |    FPS | First Input | Last Input | Avg Input Latency | P95 Input Latency |   Settle | Settle Timeout |   Script |     Style |   Layout | Paint Trace | Composite Trace |   JS Heap | Visible | Drawn | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync | Finalizes | Durable Syncs | Total Paint | Timeouts |
| ----: | :------------------------- | :------ | -----: | ----------: | ---------: | ----------------: | ----------------: | -------: | :------------- | -------: | --------: | -------: | ----------: | --------------: | --------: | ------: | ----: | ------: | ----: | --------: | --------------: | ---------------: | ------------: | --------------: | ---------------: | -------------: | --------: | ------------: | ----------: | -------: |
|    46 | default                    | pan     |  77.05 |     6.80 ms |    8.00 ms |          12.91 ms |          18.20 ms |  8.80 ms | no             | 65.99 ms |  41.53 ms | 11.00 ms |   677.06 ms |       140.79 ms | 150.20 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | default                    | zoom    |  71.97 |    14.20 ms |   13.70 ms |          13.88 ms |          18.20 ms | 88.80 ms | no             | 68.46 ms |  67.39 ms | 11.84 ms |   718.99 ms |       147.37 ms | 151.18 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.30 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.70 ms |        0 |
|    46 | node-buttons-hidden        | pan     | 109.56 |    10.00 ms |    2.10 ms |           9.09 ms |          17.80 ms |  6.90 ms | no             | 45.87 ms |  59.78 ms | 10.50 ms |    73.27 ms |        48.87 ms | 161.67 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | node-buttons-hidden        | zoom    | 117.30 |    11.10 ms |    8.20 ms |           8.53 ms |          12.60 ms | 95.30 ms | no             | 43.49 ms |  97.99 ms | 10.60 ms |    76.08 ms |        49.49 ms | 167.07 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | node-comboboxes-hidden     | pan     |  80.55 |     7.40 ms |    7.40 ms |          12.38 ms |          24.90 ms |  9.00 ms | no             | 66.54 ms |  61.10 ms | 11.84 ms |   714.15 ms |       143.20 ms | 109.12 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | node-comboboxes-hidden     | zoom    |  76.26 |     9.40 ms |   13.70 ms |          13.11 ms |          17.80 ms | 87.10 ms | no             | 62.73 ms |  99.11 ms | 11.00 ms |   696.72 ms |       137.74 ms | 112.12 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.70 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.70 ms |        0 |
|    46 | node-text-inputs-hidden    | pan     |  80.74 |     6.00 ms |    7.80 ms |          12.35 ms |          20.80 ms |  8.70 ms | no             | 63.31 ms |  58.58 ms | 10.92 ms |   696.53 ms |       133.76 ms | 123.27 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.10 ms |          0.20 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | node-text-inputs-hidden    | zoom    |  73.79 |    13.40 ms |   14.80 ms |          13.54 ms |          16.50 ms | 83.40 ms | no             | 63.76 ms | 103.25 ms | 10.87 ms |   714.45 ms |       137.53 ms | 121.65 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.40 ms |             0 |               0 |          0.00 ms |        0.30 ms |         1 |             1 |     0.70 ms |        0 |
|    46 | node-native-selects-hidden | pan     |  81.45 |     5.70 ms |    7.60 ms |          12.25 ms |          20.60 ms |  9.10 ms | no             | 63.89 ms |  58.07 ms | 10.98 ms |   747.34 ms |       139.37 ms | 130.96 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | node-native-selects-hidden | zoom    |  73.16 |     8.60 ms |   15.40 ms |          13.67 ms |          16.80 ms | 83.50 ms | no             | 62.56 ms | 101.48 ms | 11.31 ms |   720.31 ms |       143.44 ms | 133.82 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.10 ms |          0.60 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.90 ms |        0 |
|    46 | node-range-color-hidden    | pan     |  78.95 |     6.00 ms |    7.60 ms |          12.63 ms |          21.70 ms |  9.00 ms | no             | 70.16 ms |  59.50 ms | 11.35 ms |   700.03 ms |       141.94 ms | 124.73 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.20 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | node-range-color-hidden    | zoom    |  73.29 |     7.80 ms |   15.80 ms |          13.64 ms |          17.10 ms | 87.80 ms | no             | 63.67 ms | 101.73 ms | 11.10 ms |   705.54 ms |       144.61 ms | 127.37 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.70 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.80 ms |        0 |
|    46 | node-controls-hidden       | pan     | 107.05 |    10.30 ms |    5.60 ms |           9.31 ms |          17.40 ms |  8.00 ms | no             | 47.42 ms |  65.62 ms | 11.63 ms |    80.57 ms |        52.21 ms | 137.52 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.00 ms |        0 |
|    46 | node-controls-hidden       | zoom    | 116.92 |    11.60 ms |    8.30 ms |           8.55 ms |          13.10 ms | 94.90 ms | no             | 44.41 ms | 107.16 ms | 11.66 ms |    83.10 ms |        53.30 ms | 135.69 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.10 ms |        0 |
|    46 | rect-nodes                 | pan     | 119.24 |     9.60 ms |    7.90 ms |           8.36 ms |           9.60 ms |  8.60 ms | no             | 38.84 ms |   2.37 ms | 11.69 ms |   156.35 ms |        96.92 ms | 144.78 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.10 ms |        0 |
|    46 | rect-nodes                 | zoom    | 117.11 |    15.80 ms |    8.30 ms |           8.53 ms |          12.20 ms | 91.60 ms | no             | 32.79 ms |   3.11 ms | 11.80 ms |   167.05 ms |        97.56 ms | 146.94 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.00 ms |        0 |

## Initial Culling Snapshot

| Nodes | Variant                    | Visible | Drawn | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync |
| ----: | :------------------------- | ------: | ----: | ---------: | ------: | ----: | --------: | --------------: | ----------: | ---------------: | ------------: | --------------: | ---------------: | -------------: |
|    46 | default                    |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.10 ms |     0.70 ms |          0.60 ms |             0 |               0 |          0.00 ms |        0.00 ms |
|    46 | node-buttons-hidden        |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.20 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |
|    46 | node-comboboxes-hidden     |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.50 ms |          0.40 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | node-text-inputs-hidden    |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.70 ms |          0.50 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | node-native-selects-hidden |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.60 ms |          0.30 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | node-range-color-hidden    |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.60 ms |          0.50 ms |             0 |               0 |          0.00 ms |        0.00 ms |
|    46 | node-controls-hidden       |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.10 ms |     0.30 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | rect-nodes                 |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |

## Decision

- The dominant Settings All Settings control family is buttons, not text fields, comboboxes, native selects, range inputs, color inputs, or checkboxes.
- `node-buttons-hidden` moved zoom from `71.97 FPS` to `117.30 FPS`, matching `rect-nodes` at `117.11 FPS`.
- `node-controls-hidden` was essentially the same as `node-buttons-hidden`, which means other controls add little once buttons are removed from the snapshot.
- Hiding comboboxes, text inputs, native selects, and range/color inputs individually left zoom near the default range.
- Follow-up button split: `perf/reports/frontend/2026-04-27_html-in-canvas-settings-all-button-family-cost.md`.

## Verification

- This report was generated by the opt-in Playwright perf harness above.
- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.
