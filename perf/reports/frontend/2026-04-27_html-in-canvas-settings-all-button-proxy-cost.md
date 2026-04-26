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
- Isolation variants: default, node-action-button-proxies, node-action-buttons-hidden, node-buttons-hidden, rect-nodes.
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

| Nodes | Variant                    | Gesture |    FPS | First Input | Last Input | Avg Input Latency | P95 Input Latency |   Settle | Settle Timeout |    Script |     Style |   Layout | Paint Trace | Composite Trace |   JS Heap | Visible | Drawn | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync | Finalizes | Durable Syncs | Total Paint | Timeouts |
| ----: | :------------------------- | :------ | -----: | ----------: | ---------: | ----------------: | ----------------: | -------: | :------------- | --------: | --------: | -------: | ----------: | --------------: | --------: | ------: | ----: | ------: | ----: | --------: | --------------: | ---------------: | ------------: | --------------: | ---------------: | -------------: | --------: | ------------: | ----------: | -------: |
|    46 | default                    | pan     |  76.32 |    10.40 ms |    7.50 ms |          13.04 ms |          17.60 ms |  9.80 ms | no             |  66.04 ms |  41.89 ms | 11.62 ms |   688.59 ms |       140.82 ms | 159.33 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.20 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | default                    | zoom    |  72.20 |     8.40 ms |   13.30 ms |          13.84 ms |          19.00 ms | 91.80 ms | no             | 110.97 ms |  69.19 ms | 11.86 ms |   721.04 ms |       147.51 ms | 170.24 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.80 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     1.00 ms |        0 |
|    46 | node-action-button-proxies | pan     |  79.17 |     6.00 ms |    7.80 ms |          12.60 ms |          16.90 ms |  9.10 ms | no             |  65.23 ms |  37.20 ms | 12.20 ms |   704.21 ms |       143.37 ms | 152.05 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.20 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.40 ms |        0 |
|    46 | node-action-button-proxies | zoom    |  75.00 |     6.90 ms |   13.80 ms |          13.33 ms |          16.20 ms | 88.80 ms | no             |  65.53 ms |  69.04 ms | 12.37 ms |   730.56 ms |       145.01 ms | 110.62 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.50 ms |             0 |               0 |          0.00 ms |        0.30 ms |         1 |             1 |     0.80 ms |        0 |
|    46 | node-action-buttons-hidden | pan     | 106.73 |    11.30 ms |    8.00 ms |           9.33 ms |          16.70 ms |  8.00 ms | no             |  51.20 ms |  62.11 ms | 12.32 ms |    73.92 ms |        49.56 ms | 122.45 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.10 ms |        0 |
|    46 | node-action-buttons-hidden | zoom    | 115.57 |    15.60 ms |    8.40 ms |           8.65 ms |          13.30 ms | 95.10 ms | no             |  43.91 ms | 100.07 ms | 11.72 ms |    75.44 ms |        49.69 ms | 121.71 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | node-buttons-hidden        | pan     | 108.93 |    11.30 ms |    2.10 ms |           9.15 ms |          19.70 ms |  6.30 ms | no             |  45.71 ms |  58.10 ms | 11.70 ms |    71.79 ms |        48.22 ms | 130.80 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.10 ms |        0 |
|    46 | node-buttons-hidden        | zoom    | 117.34 |    10.70 ms |    8.60 ms |           8.52 ms |          12.80 ms | 94.90 ms | no             |  43.99 ms | 100.23 ms | 11.70 ms |    75.83 ms |        49.94 ms | 131.52 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.10 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | rect-nodes                 | pan     | 118.42 |    11.20 ms |    8.30 ms |           8.41 ms |           9.90 ms |  8.20 ms | no             |  39.79 ms |   2.28 ms | 12.72 ms |   154.96 ms |        95.07 ms | 123.99 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.00 ms |        0 |
|    46 | rect-nodes                 | zoom    | 116.96 |    16.20 ms |    8.20 ms |           8.54 ms |          13.00 ms | 91.50 ms | no             |  34.08 ms |   2.98 ms | 13.40 ms |   169.27 ms |        98.97 ms | 125.65 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.10 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.20 ms |        0 |

## Initial Culling Snapshot

| Nodes | Variant                    | Visible | Drawn | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync |
| ----: | :------------------------- | ------: | ----: | ---------: | ------: | ----: | --------: | --------------: | ----------: | ---------------: | ------------: | --------------: | ---------------: | -------------: |
|    46 | default                    |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.10 ms |     0.60 ms |          0.40 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | node-action-button-proxies |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.60 ms |          0.30 ms |             0 |               0 |          0.00 ms |        0.20 ms |
|    46 | node-action-buttons-hidden |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.10 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | node-buttons-hidden        |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.20 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.20 ms |
|    46 | rect-nodes                 |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.10 ms |     0.10 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |

## Decision

- Replacing non-accordion action buttons with visible div proxies using the same content and classes does not materially improve continuous zoom.
- `node-action-button-proxies` measured `75.00 FPS`, close to default `72.20 FPS`.
- Hiding the same action buttons measured `115.57 FPS`, close to `rect-nodes` at `116.96 FPS`.
- Therefore the bottleneck is not just native `<button>` element semantics. The visible action-button subtree and styling are enough to keep Chromium's HTML-in-canvas snapshot path slow.
- A production fix cannot simply swap buttons to same-looking divs. It needs either a truly cheaper zoomed-out action-control representation, fewer visible action controls in zoomed-out Settings nodes, or a real bitmap/texture cache path.

## Verification

- This report was generated by the opt-in Playwright perf harness above.
- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.
