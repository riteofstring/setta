# Interaction profile report

Append-only frame-pacing traces for the Setta-styled workspace UI plan, recorded by
`corepack pnpm perf:interaction` against the public `/?visual-matrix` playground route. Each
run drives out-and-back pointer drags (96 moves, ~7 ms pause between moves, release at the origin
so passes stay document-stable) for the registered gestures at 0.5x, 1x, and 2x workspace zoom,
with pass 1 cold after navigation and later passes warm. Full per-pass traces, configuration, and
environment records live next to this file in `perf/interaction-traces/`. Numbers are
machine-local evidence, not portable CI thresholds.

## baseline — 2026-08-10T07:34:03.102Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 25.7                       | 25.7                           | 32.4                    | 33.3                   | 2           | none              |
| root-drag       | 0.5  | 2        | 1.3                        | 60.5                           | 41.6                    | 33.4                   | 2           | none              |
| root-drag       | 0.5  | 3        | 2.6                        | 68.7                           | 41.6                    | 33.3                   | 2           | 1 (max 52 ms)     |
| root-drag       | 1    | 1 (cold) | 22.8                       | 22.7                           | 16.8                    | 41.7                   | 1           | none              |
| root-drag       | 1    | 2        | 1.1                        | 58                             | 41.6                    | 33.3                   | 2           | none              |
| root-drag       | 1    | 3        | 1.2                        | 58.8                           | 41.7                    | 41.6                   | 2           | 1 (max 50 ms)     |
| root-drag       | 2    | 1 (cold) | 25                         | 25                             | 24.9                    | 41.6                   | 1           | none              |
| root-drag       | 2    | 2        | 0                          | null                           | 9.2                     | 9.3                    | 0           | none              |
| root-drag       | 2    | 3        | 0                          | null                           | 9.3                     | 9.3                    | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 70.1                       | 7.7                            | 66.6                    | 9.3                    | 1           | 1 (max 71 ms)     |
| structural-sort | 0.5  | 2        | 68.7                       | 7.3                            | 58.3                    | 9.3                    | 1           | 1 (max 70 ms)     |
| structural-sort | 0.5  | 3        | 62.6                       | 5.6                            | 58.9                    | 9.4                    | 1           | 1 (max 63 ms)     |
| structural-sort | 1    | 1 (cold) | 62.5                       | 4.7                            | 58.3                    | 9.3                    | 1           | 1 (max 63 ms)     |
| structural-sort | 1    | 2        | 65.8                       | 5.8                            | 58.3                    | 9.4                    | 1           | 1 (max 67 ms)     |
| structural-sort | 1    | 3        | 69.2                       | 8.1                            | 66.6                    | 9.3                    | 1           | 1 (max 70 ms)     |
| structural-sort | 2    | 1 (cold) | 0.1                        | null                           | 8.9                     | 9.4                    | 0           | none              |
| structural-sort | 2    | 2        | 0.1                        | null                           | 9.4                     | 9.4                    | 0           | none              |
| structural-sort | 2    | 3        | 0.1                        | null                           | 9.3                     | 9.3                    | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 67.9                       | 6.8                            | 57.7                    | 9.4                    | 1           | 1 (max 68 ms)     |
| nested-freeform | 0.5  | 2        | 0.6                        | 1640                           | 9.2                     | 33.3                   | 1           | none              |
| nested-freeform | 0.5  | 3        | 0.3                        | null                           | 8.8                     | 9.4                    | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 0.2                        | null                           | 8.5                     | 9.4                    | 0           | none              |
| nested-freeform | 1    | 2        | 0.1                        | null                           | 8.9                     | 9.2                    | 0           | none              |
| nested-freeform | 1    | 3        | 0                          | null                           | 9.1                     | 9.3                    | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 0.2                        | null                           | 9.2                     | 9.2                    | 0           | none              |
| nested-freeform | 2    | 2        | 0.1                        | null                           | 9.3                     | 9.3                    | 0           | none              |
| nested-freeform | 2    | 3        | 0                          | null                           | 9.4                     | 9.4                    | 0           | none              |

## baseline — 2026-08-10T07:35:19.876Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### production

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 9.1                        | 9.1                            | 17.6                    | 9.4                    | 0           | none              |
| root-drag       | 0.5  | 2        | 0.9                        | 11.6                           | 9.3                     | 9.4                    | 0           | none              |
| root-drag       | 0.5  | 3        | 2.3                        | 15.2                           | 9.2                     | 9.4                    | 0           | none              |
| root-drag       | 1    | 1 (cold) | 7                          | 6.9                            | 9.4                     | 9.4                    | 0           | none              |
| root-drag       | 1    | 2        | 1.1                        | 17.7                           | 9.1                     | 9.3                    | 0           | none              |
| root-drag       | 1    | 3        | 2.2                        | 24.8                           | 9.2                     | 9.3                    | 0           | none              |
| root-drag       | 2    | 1 (cold) | 5.5                        | 5.5                            | 9.3                     | 9.4                    | 0           | none              |
| root-drag       | 2    | 2        | 0                          | null                           | 9.3                     | 9.5                    | 0           | none              |
| root-drag       | 2    | 3        | 0.1                        | null                           | 9.3                     | 9.3                    | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 33.2                       | 3.4                            | 33.3                    | 9.4                    | 1           | none              |
| structural-sort | 0.5  | 2        | 24.8                       | 1.9                            | 25.3                    | 9.3                    | 0           | none              |
| structural-sort | 0.5  | 3        | 26.7                       | 2.1                            | 25.1                    | 9.4                    | 0           | none              |
| structural-sort | 1    | 1 (cold) | 23.9                       | 2.2                            | 16.1                    | 9.3                    | 0           | none              |
| structural-sort | 1    | 2        | 22                         | 1.6                            | 16.6                    | 9.3                    | 0           | none              |
| structural-sort | 1    | 3        | 16.9                       | 1.6                            | 9.4                     | 9.4                    | 0           | none              |
| structural-sort | 2    | 1 (cold) | 0.2                        | null                           | 9.1                     | 9.6                    | 0           | none              |
| structural-sort | 2    | 2        | 0                          | null                           | 9.3                     | 9.5                    | 0           | none              |
| structural-sort | 2    | 3        | 0.1                        | null                           | 9.3                     | 9.3                    | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 29.1                       | 2.5                            | 25                      | 9.3                    | 0           | none              |
| nested-freeform | 0.5  | 2        | 0.7                        | 1706.5                         | 9.2                     | 9.4                    | 0           | none              |
| nested-freeform | 0.5  | 3        | 0.7                        | null                           | 9.7                     | 9.4                    | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 0.1                        | null                           | 9.2                     | 9.6                    | 0           | none              |
| nested-freeform | 1    | 2        | 0                          | null                           | 9.4                     | 9.4                    | 0           | none              |
| nested-freeform | 1    | 3        | 0                          | null                           | 9.5                     | 9.4                    | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 0.1                        | null                           | 9.3                     | 9.6                    | 0           | none              |
| nested-freeform | 2    | 2        | 0                          | null                           | 9.3                     | 11.4                   | 0           | none              |
| nested-freeform | 2    | 3        | 0                          | null                           | 9.2                     | 9.4                    | 0           | none              |

## phase-1 — 2026-08-10T08:38:06.371Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 26.9                       | 26.9                           | 33.3                    | 9.3                    | 1           | none              |
| root-drag       | 0.5  | 2        | 2.1                        | 37.5                           | 24.8                    | 9.4                    | 0           | none              |
| root-drag       | 0.5  | 3        | 2.2                        | 31.3                           | 25.4                    | 9.2                    | 0           | none              |
| root-drag       | 1    | 1 (cold) | 28                         | 28                             | 24.9                    | 16.8                   | 0           | none              |
| root-drag       | 1    | 2        | 2.1                        | 36.8                           | 24.9                    | 16.8                   | 0           | none              |
| root-drag       | 1    | 3        | 1.2                        | 28.6                           | 16.7                    | 25.4                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 27                         | 27                             | 25                      | 25                     | 0           | none              |
| root-drag       | 2    | 2        | 0                          | null                           | 9.3                     | 9.4                    | 0           | none              |
| root-drag       | 2    | 3        | 0.1                        | null                           | 9.2                     | 9.4                    | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 60.6                       | 7.3                            | 58.3                    | 16.6                   | 1           | 1 (max 62 ms)     |
| structural-sort | 0.5  | 2        | 41.3                       | 7.5                            | 42.1                    | 9.2                    | 1           | none              |
| structural-sort | 0.5  | 3        | 43.2                       | 8.8                            | 41.7                    | 9.4                    | 1           | none              |
| structural-sort | 1    | 1 (cold) | 62.2                       | 7.1                            | 58.3                    | 9.4                    | 1           | 1 (max 64 ms)     |
| structural-sort | 1    | 2        | 45.5                       | 10.7                           | 33.2                    | 9.2                    | 1           | none              |
| structural-sort | 1    | 3        | 42.8                       | 8.7                            | 33.2                    | 9.3                    | 1           | none              |
| structural-sort | 2    | 1 (cold) | 0.2                        | null                           | 9.3                     | 9.4                    | 0           | none              |
| structural-sort | 2    | 2        | 0.1                        | null                           | 9.2                     | 9.3                    | 0           | none              |
| structural-sort | 2    | 3        | 0                          | null                           | 9.1                     | 9.3                    | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 57.3                       | 7                              | 50.1                    | 9.2                    | 1           | 1 (max 58 ms)     |
| nested-freeform | 0.5  | 2        | 0.6                        | 1654.5                         | 9.2                     | 33.4                   | 1           | none              |
| nested-freeform | 0.5  | 3        | 0.6                        | null                           | 9.1                     | 9.3                    | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 0.3                        | null                           | 8.9                     | 9.4                    | 0           | none              |
| nested-freeform | 1    | 2        | 0                          | null                           | 9.3                     | 9.3                    | 0           | none              |
| nested-freeform | 1    | 3        | 0                          | null                           | 9.2                     | 9.4                    | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 0.3                        | null                           | 9.2                     | 9.3                    | 0           | none              |
| nested-freeform | 2    | 2        | 0                          | null                           | 9.2                     | 9.4                    | 0           | none              |
| nested-freeform | 2    | 3        | 0                          | null                           | 9.2                     | 9.3                    | 0           | none              |

### production

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 11.5                       | 11.4                           | 33.4                    | 9.3                    | 1           | none              |
| root-drag       | 0.5  | 2        | 1.7                        | 21.3                           | 9.2                     | 9.2                    | 0           | none              |
| root-drag       | 0.5  | 3        | 2.2                        | 21.6                           | 8.9                     | 9.2                    | 0           | none              |
| root-drag       | 1    | 1 (cold) | 8.5                        | 8.4                            | 9.4                     | 9.3                    | 0           | none              |
| root-drag       | 1    | 2        | 1.6                        | 13.1                           | 9                       | 9.4                    | 0           | none              |
| root-drag       | 1    | 3        | 2.1                        | 18                             | 8.9                     | 9.3                    | 0           | none              |
| root-drag       | 2    | 1 (cold) | 7.4                        | 7.4                            | 9                       | 9.3                    | 0           | none              |
| root-drag       | 2    | 2        | 0                          | null                           | 9.2                     | 9.4                    | 0           | none              |
| root-drag       | 2    | 3        | 0                          | null                           | 9.4                     | 9.3                    | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 33                         | 3.9                            | 33.4                    | 9.3                    | 1           | none              |
| structural-sort | 0.5  | 2        | 21                         | 1.7                            | 9.3                     | 9.3                    | 0           | none              |
| structural-sort | 0.5  | 3        | 21.6                       | 2.1                            | 16.7                    | 9.3                    | 0           | none              |
| structural-sort | 1    | 1 (cold) | 21.3                       | 2.4                            | 16.7                    | 9.4                    | 0           | none              |
| structural-sort | 1    | 2        | 24                         | 1.8                            | 25.5                    | 9.4                    | 0           | none              |
| structural-sort | 1    | 3        | 17.8                       | 1.3                            | 8.6                     | 9.4                    | 0           | none              |
| structural-sort | 2    | 1 (cold) | 0.3                        | null                           | 9.2                     | 9.4                    | 0           | none              |
| structural-sort | 2    | 2        | 0                          | null                           | 9.3                     | 9.3                    | 0           | none              |
| structural-sort | 2    | 3        | 0                          | null                           | 9.1                     | 9.4                    | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 25.7                       | 2.7                            | 24.3                    | 9.3                    | 0           | none              |
| nested-freeform | 0.5  | 2        | 0.5                        | 1597.1                         | 8.5                     | 16.6                   | 0           | none              |
| nested-freeform | 0.5  | 3        | 0.2                        | null                           | 9.2                     | 9.3                    | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 0.2                        | null                           | 9.1                     | 9.3                    | 0           | none              |
| nested-freeform | 1    | 2        | 0.1                        | null                           | 9.2                     | 9.3                    | 0           | none              |
| nested-freeform | 1    | 3        | 0                          | null                           | 8.5                     | 9.4                    | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 0.3                        | null                           | 9.3                     | 9.4                    | 0           | none              |
| nested-freeform | 2    | 2        | 0                          | null                           | 9                       | 9.4                    | 0           | none              |
| nested-freeform | 2    | 3        | 0                          | null                           | 8.8                     | 9.4                    | 0           | none              |

## wip-region-index — 2026-08-10T09:19:56.462Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario | Zoom | Pass | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| structural-sort | 0.5 | 1 (cold) | 57 | 5.1 | 75 | 9.2 | 1 | 1 (max 58 ms) |
| structural-sort | 0.5 | 2 | 18.8 | 2.3 | 33.3 | 9.4 | 1 | none |
| structural-sort | 0.5 | 3 | 23.2 | 2.5 | 33.2 | 9.4 | 1 | none |
| structural-sort | 1 | 1 (cold) | 44.9 | 2.5 | 58.3 | 9.3 | 1 | none |
| structural-sort | 1 | 2 | 22.5 | 2.5 | 33 | 9.3 | 1 | none |
| structural-sort | 1 | 3 | 20.1 | 2.3 | 33.5 | 9.2 | 1 | none |


## wip-prepare-start — 2026-08-10T09:28:21.111Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario | Zoom | Pass | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| root-drag | 0.5 | 1 (cold) | 32.9 | 32.9 | 41.7 | 10.2 | 1 | none |
| root-drag | 0.5 | 2 | 2.3 | 33.3 | 25.2 | 10.3 | 0 | none |
| root-drag | 0.5 | 3 | 2.2 | 39.5 | 24.7 | 10.3 | 0 | none |
| root-drag | 1 | 1 (cold) | 29.9 | 29.9 | 26.1 | 17.8 | 0 | none |
| root-drag | 1 | 2 | 2.2 | 39.2 | 25.1 | 18.6 | 0 | none |
| root-drag | 1 | 3 | 2 | 33.4 | 24.7 | 16.7 | 0 | none |
| structural-sort | 0.5 | 1 (cold) | 55.6 | 17.3 | 58.2 | 16.6 | 1 | 1 (max 56 ms) |
| structural-sort | 0.5 | 2 | 21.6 | 8.7 | 33.5 | 10.2 | 1 | none |
| structural-sort | 0.5 | 3 | 21.4 | 8.5 | 34.2 | 10.2 | 1 | none |
| structural-sort | 1 | 1 (cold) | 44.4 | 4.9 | 50 | 16.6 | 1 | none |
| structural-sort | 1 | 2 | 11.9 | 3.3 | 17.1 | 10.2 | 0 | none |
| structural-sort | 1 | 3 | 20.7 | 7.8 | 34.4 | 10.4 | 1 | none |


## wip-prepare-start — 2026-08-10T09:30:51.452Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### production

| Scenario | Zoom | Pass | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| root-drag | 0.5 | 1 (cold) | 11.3 | 11.3 | 16.7 | 10.2 | 0 | none |
| root-drag | 0.5 | 2 | 2.6 | 22.2 | 10.3 | 10.3 | 0 | none |
| root-drag | 0.5 | 3 | 1.8 | 21.4 | 9.4 | 10.4 | 0 | none |
| root-drag | 1 | 1 (cold) | 8.4 | 8.3 | 8.5 | 10.3 | 0 | none |
| root-drag | 1 | 2 | 0.8 | 13.5 | 10.4 | 10.4 | 0 | none |
| root-drag | 1 | 3 | 2.1 | 19.7 | 10 | 10.2 | 0 | none |
| structural-sort | 0.5 | 1 (cold) | 34.3 | 3.8 | 33.4 | 10.3 | 1 | none |
| structural-sort | 0.5 | 2 | 25.7 | 2.9 | 25 | 10.2 | 0 | none |
| structural-sort | 0.5 | 3 | 25.1 | 2.7 | 16.4 | 10.4 | 0 | none |
| structural-sort | 1 | 1 (cold) | 25.1 | 2.2 | 25.1 | 10.3 | 0 | none |
| structural-sort | 1 | 2 | 9.4 | 0.5 | 9.9 | 10.4 | 0 | none |
| structural-sort | 1 | 3 | 17.4 | 1.2 | 8.9 | 10.3 | 0 | none |


## wip-deferred-autoscroll — 2026-08-10T09:34:26.468Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario | Zoom | Pass | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| root-drag | 0.5 | 1 (cold) | 30.7 | 30.7 | 41.7 | 10.3 | 1 | none |
| root-drag | 0.5 | 2 | 2.1 | 36.2 | 24.9 | 10.3 | 0 | none |
| root-drag | 0.5 | 3 | 1.3 | 28.9 | 18 | 9.9 | 0 | none |
| root-drag | 1 | 1 (cold) | 29 | 28.9 | 25.9 | 17.7 | 0 | none |
| root-drag | 1 | 2 | 1.5 | 34.2 | 16.8 | 16.8 | 0 | none |
| root-drag | 1 | 3 | 2 | 36.1 | 24.9 | 18.2 | 0 | none |
| structural-sort | 0.5 | 1 (cold) | 53.3 | 16.7 | 66.7 | 26.5 | 1 | 1 (max 54 ms) |
| structural-sort | 0.5 | 2 | 16 | 4.9 | 33.3 | 10.3 | 1 | none |
| structural-sort | 0.5 | 3 | 18.1 | 6.3 | 33.4 | 10.2 | 1 | none |
| structural-sort | 1 | 1 (cold) | 44.1 | 4.7 | 58.7 | 16.6 | 1 | none |
| structural-sort | 1 | 2 | 20.9 | 8.4 | 33.3 | 8.4 | 1 | none |
| structural-sort | 1 | 3 | 17.8 | 6.3 | 25.1 | 10.3 | 0 | none |


## wip-no-universal-styles — 2026-08-10T09:40:07.852Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario | Zoom | Pass | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| structural-sort | 0.5 | 1 (cold) | 55.8 | 24 | 75 | 26.3 | 1 | 1 (max 57 ms) |
| structural-sort | 0.5 | 2 | 12.8 | 11.8 | 34 | 10.4 | 1 | none |
| structural-sort | 0.5 | 3 | 15.1 | 14.2 | 33.4 | 10.2 | 1 | none |
| structural-sort | 1 | 1 (cold) | 44 | 10.2 | 58.4 | 10.2 | 1 | none |
| structural-sort | 1 | 2 | 15.2 | 14.2 | 25.1 | 9.8 | 0 | none |
| structural-sort | 1 | 3 | 10.2 | 9.4 | 24.9 | 9.9 | 0 | none |


## wip-owned-drag-styles — 2026-08-10T09:44:35.386Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario | Zoom | Pass | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| root-drag | 0.5 | 1 (cold) | 30.6 | 30.5 | 41.6 | 10.3 | 1 | none |
| root-drag | 0.5 | 2 | 2.3 | 40.3 | 24.9 | 15.3 | 0 | none |
| root-drag | 0.5 | 3 | 2.2 | 41.2 | 25.2 | 10.3 | 0 | none |
| root-drag | 1 | 1 (cold) | 22.1 | 22 | 26.2 | 17.6 | 0 | none |
| root-drag | 1 | 2 | 2.3 | 37.2 | 25.9 | 17.9 | 0 | none |
| root-drag | 1 | 3 | 1.2 | 36.3 | 16.8 | 17.4 | 0 | none |
| structural-sort | 0.5 | 1 (cold) | 50 | 22.9 | 58.7 | 16.7 | 1 | 1 (max 51 ms) |
| structural-sort | 0.5 | 2 | 15.4 | 14.6 | 33.2 | 10.3 | 1 | none |
| structural-sort | 0.5 | 3 | 15.2 | 14.3 | 33.4 | 10.1 | 1 | none |
| structural-sort | 1 | 1 (cold) | 44 | 12.4 | 50.2 | 16.7 | 1 | none |
| structural-sort | 1 | 2 | 14.9 | 14.1 | 34.5 | 9.9 | 1 | none |
| structural-sort | 1 | 3 | 16 | 15.2 | 25.3 | 9.9 | 0 | none |


## wip-owned-drag-styles — 2026-08-10T09:46:14.828Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### production

| Scenario | Zoom | Pass | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| root-drag | 0.5 | 1 (cold) | 11 | 11 | 16.6 | 10.3 | 0 | none |
| root-drag | 0.5 | 2 | 2.8 | 20.8 | 10.1 | 10.2 | 0 | none |
| root-drag | 0.5 | 3 | 2.1 | 20 | 10 | 10.3 | 0 | none |
| root-drag | 1 | 1 (cold) | 8.2 | 8.1 | 10.1 | 10.4 | 0 | none |
| root-drag | 1 | 2 | 1.9 | 21 | 9.9 | 10.3 | 0 | none |
| root-drag | 1 | 3 | 0.5 | 10.5 | 8.4 | 10.3 | 0 | none |
| structural-sort | 0.5 | 1 (cold) | 33.2 | 3.6 | 34.7 | 16.7 | 1 | none |
| structural-sort | 0.5 | 2 | 24.4 | 2.9 | 24.9 | 10.3 | 0 | none |
| structural-sort | 0.5 | 3 | 19 | 1.4 | 16.3 | 10.3 | 0 | none |
| structural-sort | 1 | 1 (cold) | 23.6 | 2.4 | 25.5 | 16.7 | 0 | none |
| structural-sort | 1 | 2 | 26.6 | 2.7 | 25.1 | 10.3 | 0 | none |
| structural-sort | 1 | 3 | 24.7 | 2.3 | 25.4 | 10.2 | 0 | none |


## wip-owned-drag-styles-v2 — 2026-08-10T09:47:31.007Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### production

| Scenario | Zoom | Pass | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| root-drag | 0.5 | 1 (cold) | 11 | 10.9 | 16.6 | 10.3 | 0 | none |
| root-drag | 0.5 | 2 | 2.6 | 19.5 | 9.6 | 10.3 | 0 | none |
| root-drag | 0.5 | 3 | 1.3 | 17 | 9.4 | 10.3 | 0 | none |
| root-drag | 1 | 1 (cold) | 7.7 | 7.7 | 9.2 | 10.3 | 0 | none |
| root-drag | 1 | 2 | 2 | 19.7 | 10.1 | 10.3 | 0 | none |
| root-drag | 1 | 3 | 2.1 | 23 | 9.9 | 10.4 | 0 | none |
| structural-sort | 0.5 | 1 (cold) | 30.6 | 23.4 | 33.4 | 18.1 | 1 | none |
| structural-sort | 0.5 | 2 | 14.3 | 13.5 | 16.4 | 10.2 | 0 | none |
| structural-sort | 0.5 | 3 | 12 | 11.1 | 17.7 | 10.3 | 0 | none |
| structural-sort | 1 | 1 (cold) | 16.4 | 10.7 | 16.7 | 10.3 | 0 | none |
| structural-sort | 1 | 2 | 13.9 | 13.1 | 16.7 | 10.3 | 0 | none |
| structural-sort | 1 | 3 | 10 | 9.4 | 8.4 | 10.2 | 0 | none |

