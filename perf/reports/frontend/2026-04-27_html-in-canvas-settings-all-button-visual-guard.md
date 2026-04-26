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
- Source visual stats count visible text and button-like DOM before the gesture so destructive variants cannot be mistaken for UX-preserving optimizations.
- Raw JSON artifact, ignored by git: `perf/artifacts/frontend/html-in-canvas-pan-zoom-matrix.json`.

## Before

- Historical old-renderer baseline remains `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`.
- A same-session old xyflow matrix was not rerun here because this branch intentionally hard-deleted the active `.react-flow__viewport` / d3 renderer path before the final performance pass. Restoring that path would be compatibility work outside this branch posture.

## Current CanvasFlow Matrix

| Nodes | Variant                    | Gesture |    FPS | First Input | Last Input | Avg Input Latency | P95 Input Latency |   Settle | Settle Timeout |   Script |     Style |   Layout | Paint Trace | Composite Trace |   JS Heap | Visible | Drawn | Mounted | Edges | Edge Draw | Visibility Scan | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync | Finalizes | Durable Syncs | Total Paint | Timeouts |
| ----: | :------------------------- | :------ | -----: | ----------: | ---------: | ----------------: | ----------------: | -------: | :------------- | -------: | --------: | -------: | ----------: | --------------: | --------: | ------: | ----: | ------: | ----: | --------: | --------------: | ---------------: | ------------: | --------------: | ---------------: | -------------: | --------: | ------------: | ----------: | -------: |
|    46 | default                    | pan     |  76.82 |     8.90 ms |    7.70 ms |          12.96 ms |          17.50 ms |  8.90 ms | no             | 67.10 ms |  40.64 ms | 11.34 ms |   685.56 ms |       141.53 ms | 151.43 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.30 ms |        0 |
|    46 | default                    | zoom    |  71.57 |    14.40 ms |   13.60 ms |          13.96 ms |          18.00 ms | 86.00 ms | no             | 67.19 ms |  67.30 ms | 11.58 ms |   708.05 ms |       148.61 ms | 152.09 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.60 ms |             0 |               0 |          0.00 ms |        0.20 ms |         1 |             1 |     0.80 ms |        0 |
|    46 | node-action-button-proxies | pan     |  76.79 |     7.80 ms |    7.70 ms |          12.99 ms |          24.50 ms |  9.50 ms | no             | 66.70 ms |  42.14 ms | 12.25 ms |   729.40 ms |       148.78 ms | 108.81 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | node-action-button-proxies | zoom    |  76.17 |     8.00 ms |   14.40 ms |          13.13 ms |          17.10 ms | 85.20 ms | no             | 64.92 ms |  69.17 ms | 12.02 ms |   726.31 ms |       143.99 ms | 110.21 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.80 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.80 ms |        0 |
|    46 | node-action-buttons-hidden | pan     |  93.60 |     5.70 ms |    7.70 ms |          10.65 ms |          21.40 ms |  8.70 ms | no             | 67.64 ms |  59.15 ms | 12.11 ms |   647.11 ms |       122.11 ms | 123.64 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | node-action-buttons-hidden | zoom    |  75.63 |    10.60 ms |   14.00 ms |          13.22 ms |          16.20 ms | 85.00 ms | no             | 61.25 ms | 100.74 ms | 12.21 ms |   664.32 ms |       122.97 ms | 122.00 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.60 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.60 ms |        0 |
|    46 | node-buttons-hidden        | pan     |  96.33 |     5.60 ms |    7.30 ms |          10.35 ms |          21.20 ms |  8.30 ms | no             | 62.89 ms |  56.42 ms | 12.55 ms |   628.74 ms |       120.37 ms | 132.71 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.10 ms |             0 |               0 |          0.00 ms |        0.10 ms |         1 |             1 |     0.20 ms |        0 |
|    46 | node-buttons-hidden        | zoom    |  76.94 |    11.90 ms |   14.10 ms |          12.99 ms |          15.90 ms | 85.00 ms | no             | 59.52 ms | 100.64 ms | 12.51 ms |   640.69 ms |       123.82 ms | 134.98 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.00 ms |          0.60 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.60 ms |        0 |
|    46 | rect-nodes                 | pan     | 121.75 |     3.40 ms |    8.40 ms |           8.18 ms |           8.50 ms |  8.20 ms | no             | 39.90 ms |   2.33 ms | 13.91 ms |   160.12 ms |       100.76 ms | 127.68 MB |       9 |     9 |      36 |     0 |   0.00 ms |         0.00 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.10 ms |        0 |
|    46 | rect-nodes                 | zoom    | 120.04 |     8.30 ms |    8.40 ms |           8.32 ms |           8.40 ms | 91.70 ms | no             | 33.96 ms |   3.08 ms | 13.40 ms |   166.14 ms |        97.90 ms | 128.44 MB |      27 |    27 |      33 |     0 |   0.00 ms |         0.10 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |         1 |             1 |     0.20 ms |        0 |

## Initial Culling Snapshot

| Nodes | Variant                    | Visible | Drawn | Registered | Mounted | Edges | Edge Draw | Visibility Scan | Total Paint | drawElementImage | Snapshot Hits | Snapshot Misses | Snapshot Capture | Transform Sync |
| ----: | :------------------------- | ------: | ----: | ---------: | ------: | ----: | --------: | --------------: | ----------: | ---------------: | ------------: | --------------: | ---------------: | -------------: |
|    46 | default                    |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.10 ms |     0.80 ms |          0.50 ms |             0 |               0 |          0.00 ms |        0.10 ms |
|    46 | node-action-button-proxies |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.70 ms |          0.70 ms |             0 |               0 |          0.00 ms |        0.00 ms |
|    46 | node-action-buttons-hidden |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.60 ms |          0.20 ms |             0 |               0 |          0.00 ms |        0.20 ms |
|    46 | node-buttons-hidden        |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.50 ms |          0.30 ms |             0 |               0 |          0.00 ms |        0.20 ms |
|    46 | rect-nodes                 |      27 |    27 |         46 |      36 |     0 |   0.00 ms |         0.00 ms |     0.10 ms |          0.00 ms |             0 |               0 |          0.00 ms |        0.00 ms |

## Source Visual Snapshot

| Nodes | Variant                    | Mounted Source Nodes | Nodes With Visible Text | Visible Text Chars | Visible Button-Like | Hidden Button-Like | Visible Action Buttons | Hidden Action Buttons | Visible Accordion Buttons | Hidden Accordion Buttons |
| ----: | :------------------------- | -------------------: | ----------------------: | -----------------: | ------------------: | -----------------: | ---------------------: | --------------------: | ------------------------: | -----------------------: |
|    46 | default                    |                   36 |                      36 |             11,989 |               1,122 |                  0 |                    942 |                     0 |                        36 |                        0 |
|    46 | node-action-button-proxies |                   36 |                      36 |             11,989 |               1,122 |                201 |                    942 |                   201 |                        36 |                        0 |
|    46 | node-action-buttons-hidden |                   36 |                      36 |             11,989 |                 906 |                216 |                    726 |                   216 |                        36 |                        0 |
|    46 | node-buttons-hidden        |                   36 |                      36 |             11,989 |                 870 |                252 |                    726 |                   216 |                         0 |                       36 |
|    46 | rect-nodes                 |                   36 |                      36 |             11,989 |               1,122 |                  0 |                    942 |                     0 |                        36 |                        0 |

## Decision

- The earlier high-FPS button-hidden result was a destructive benchmark artifact.
- The new source visual snapshot shows why: selector variants must be checked for visible text and visible button-like source content before interpreting FPS.
- With corrected selectors that preserve visible source text, hiding real action buttons only moved zoom from `71.57 FPS` to `75.63 FPS`.
- Hiding all real buttons only moved zoom to `76.94 FPS`, while preserving the same `11,989` visible text characters.
- Visible action-button div proxies also stayed near default at `76.17 FPS`.
- The prior `~115 FPS` result came from a broad `[role=button]` selector that effectively blanked the source node content. It is not evidence for a UX-preserving button optimization.
- Treat earlier button-family reports as superseded by this visual-guarded run.

## Verification

- This report was generated by the opt-in Playwright perf harness above.
- The harness asserts HTML-in-Canvas support, absence of `.react-flow__viewport`, absence of old SVG edge layers, the expected registered node count for each matrix size, and nonzero canvas draws after each gesture.
