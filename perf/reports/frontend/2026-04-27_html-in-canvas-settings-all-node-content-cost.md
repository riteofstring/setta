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
- Isolation variants: default, node-effects-off, node-controls-plain, node-controls-hidden, node-chrome-hidden, node-shell-only, node-text-only, rect-nodes.
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

| Nodes | Variant              | Gesture |    FPS | First Input | Last Input | Avg Input Latency | P95 Input Latency |    Settle | Settle Timeout |    Script |     Style |   Layout | Paint Trace | Composite Trace |   JS Heap | Visible | Drawn | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync | Finalizes | Durable Syncs | Total Paint | Timeouts |
| ----: | :------------------- | :------ | -----: | ----------: | ---------: | ----------------: | ----------------: | --------: | :------------- | --------: | --------: | -------: | ----------: | --------------: | --------: | ------: | ----: | ------: | ----: | --------: | --------------: | ---------------: | ------------: | --------------: | ---------------: | -------------: | --------: | ------------: | ----------: | -------: |
|    46 | default              | pan     |  78.11 |     8.60 ms |    7.40 ms |          12.73 ms |          17.20 ms |   9.00 ms | no             |  64.72 ms |  40.23 ms | 11.00 ms |   673.87 ms |       137.92 ms | 158.75 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.20 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | default              | zoom    |  71.41 |    11.20 ms |   13.20 ms |          14.00 ms |          20.60 ms |  90.00 ms | no             |  66.80 ms |  65.42 ms | 11.75 ms |   701.72 ms |       142.46 ms | 159.46 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.40 ms |             0 |               0 |          0.00 ms |        0.40 ms |         1 |             1 |     0.90 ms |        0 |
|    46 | node-effects-off     | pan     |  80.20 |     7.50 ms |    7.60 ms |          12.44 ms |          20.80 ms |   8.90 ms | no             |  63.63 ms |  58.67 ms | 11.28 ms |   689.25 ms |       138.10 ms | 151.16 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | node-effects-off     | zoom    |  72.16 |    14.30 ms |   14.40 ms |          13.86 ms |          16.20 ms |  89.80 ms | no             | 111.62 ms |  96.95 ms | 11.79 ms |   711.22 ms |       140.05 ms | 119.54 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.80 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.90 ms |        0 |
|    46 | node-controls-plain  | pan     |  24.25 |    33.10 ms |    8.40 ms |          41.20 ms |          49.30 ms |   9.60 ms | no             |  81.23 ms |  63.30 ms | 11.61 ms |   789.39 ms |       156.44 ms | 130.13 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.20 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.40 ms |        0 |
|    46 | node-controls-plain  | zoom    |  24.61 |     6.50 ms |   47.20 ms |          40.63 ms |          48.90 ms | 115.40 ms | no             | 115.05 ms | 104.46 ms | 11.09 ms |   817.53 ms |       157.93 ms | 114.72 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.70 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.90 ms |        0 |
|    46 | node-controls-hidden | pan     | 109.19 |    10.40 ms |    2.40 ms |           9.13 ms |          17.80 ms |   6.20 ms | no             |  46.65 ms |  60.45 ms | 11.06 ms |    74.44 ms |        49.58 ms | 126.42 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | node-controls-hidden | zoom    | 116.77 |    12.50 ms |    8.30 ms |           8.56 ms |          13.10 ms |  95.30 ms | no             |  43.66 ms |  97.06 ms | 10.75 ms |    76.16 ms |        49.73 ms | 126.54 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | node-chrome-hidden   | pan     |  91.35 |     6.10 ms |    7.50 ms |          10.91 ms |          19.70 ms |   8.50 ms | no             |  62.22 ms |  58.08 ms | 11.66 ms |   682.67 ms |       133.47 ms | 136.80 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.30 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.40 ms |        0 |
|    46 | node-chrome-hidden   | zoom    |  75.36 |    12.60 ms |   13.80 ms |          13.27 ms |          16.20 ms |  86.20 ms | no             |  61.22 ms |  98.97 ms | 11.27 ms |   685.54 ms |       135.85 ms | 141.00 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.40 ms |             0 |               0 |          0.00 ms |        0.30 ms |         1 |             1 |     0.70 ms |        0 |
|    46 | node-shell-only      | pan     |  81.23 |     6.60 ms |    7.70 ms |          12.27 ms |          20.90 ms |   8.90 ms | no             |  64.04 ms |  56.63 ms | 11.36 ms |   707.43 ms |       140.82 ms | 132.30 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.20 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | node-shell-only      | zoom    |  74.14 |     6.40 ms |   15.10 ms |          13.49 ms |          17.10 ms |  86.40 ms | no             |  63.42 ms |  98.67 ms | 11.50 ms |   720.53 ms |       143.20 ms | 134.82 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.70 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.70 ms |        0 |
|    46 | node-text-only       | pan     | 108.63 |    12.30 ms |    2.70 ms |           9.18 ms |          16.80 ms |   5.70 ms | no             |  44.95 ms |  72.32 ms | 10.85 ms |    84.64 ms |        52.98 ms | 145.03 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.00 ms |        0 |
|    46 | node-text-only       | zoom    | 116.58 |    10.20 ms |    7.50 ms |           8.57 ms |          13.10 ms |  91.60 ms | no             |  46.95 ms | 110.09 ms | 10.97 ms |    88.05 ms |        54.05 ms | 143.93 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | rect-nodes           | pan     | 118.93 |     9.80 ms |    8.40 ms |           8.38 ms |          10.10 ms |   8.20 ms | no             |  37.83 ms |   2.35 ms | 11.67 ms |   153.16 ms |        93.60 ms | 154.07 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.10 ms |        0 |
|    46 | rect-nodes           | zoom    | 116.73 |    16.10 ms |   10.20 ms |           8.56 ms |          12.50 ms |  93.00 ms | no             |  34.84 ms |   3.20 ms | 12.03 ms |   167.99 ms |        97.21 ms | 155.13 MB |      27 |    27 |      33 |     0 |   0.10 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.20 ms |        0 |

## Initial Culling Snapshot

| Nodes | Variant              | Visible | Drawn | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync |
| ----: | :------------------- | ------: | ----: | ---------: | ------: | ----: | --------: | --------------: | ----------: | ---------------: | ------------: | --------------: | ---------------: | -------------: |
|    46 | default              |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.70 ms |          0.30 ms |             0 |               0 |          0.00 ms |        0.30 ms |
|    46 | node-effects-off     |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.60 ms |          0.60 ms |             0 |               0 |          0.00 ms |        0.00 ms |
|    46 | node-controls-plain  |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.90 ms |          0.70 ms |             0 |               0 |          0.00 ms |        0.00 ms |
|    46 | node-controls-hidden |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.20 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | node-chrome-hidden   |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.60 ms |          0.30 ms |             0 |               0 |          0.00 ms |        0.30 ms |
|    46 | node-shell-only      |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.60 ms |          0.30 ms |             0 |               0 |          0.00 ms |        0.30 ms |
|    46 | node-text-only       |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.20 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | rect-nodes           |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |

## Decision

- The dominant Settings All Settings cost is control rendering inside HTML-backed nodes.
- `node-controls-hidden` moved zoom from `71.41 FPS` to `116.77 FPS`, essentially matching the `rect-nodes` ceiling at `116.73 FPS`.
- `node-text-only` also matched the rect ceiling, which confirms the lower bound is reachable through the same HTML-in-canvas node path when expensive descendants are not painted.
- `node-effects-off`, `node-chrome-hidden`, and `node-shell-only` did not materially improve zoom FPS, so section chrome, shadows, transitions, and broad body content are not the primary continuous pan/zoom limit in this view.
- `node-controls-plain` was worse at about `24 FPS`, so blanket CSS restyling or native appearance suppression is not a viable optimization by itself.
- Next production target: identify the specific settings control families causing HTML-in-canvas snapshot cost, then replace only non-active, zoomed-out controls with visual equivalents or cached control surfaces while keeping active/focused controls live.

## Verification

- This report was generated by the opt-in Playwright perf harness above.
- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.
