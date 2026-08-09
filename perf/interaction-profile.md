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

## phase-1-region-index — 2026-08-10T10:04:49.886Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| structural-sort | 0.5  | 1 (cold) | 47.4                       | 4.1                            | 67.8                    | 25.1                   | 1           | none              |
| structural-sort | 0.5  | 2        | 26.1                       | 4.6                            | 43                      | 10.2                   | 1           | none              |
| structural-sort | 0.5  | 3        | 26.2                       | 4.4                            | 33.9                    | 9.5                    | 1           | none              |
| structural-sort | 1    | 1 (cold) | 50.7                       | 3.3                            | 59.7                    | 16.7                   | 1           | 1 (max 51 ms)     |
| structural-sort | 1    | 2        | 25.1                       | 4.1                            | 41.5                    | 10.3                   | 1           | none              |
| structural-sort | 1    | 3        | 25.8                       | 4.8                            | 33.4                    | 10.2                   | 1           | none              |

## phase-1-region-index — 2026-08-10T10:05:10.954Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### production

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| structural-sort | 0.5  | 1 (cold) | 34.8                       | 3.9                            | 50                      | 10.3                   | 1           | none              |
| structural-sort | 0.5  | 2        | 25.1                       | 3                              | 23.6                    | 10.2                   | 0           | none              |
| structural-sort | 0.5  | 3        | 24.2                       | 2.9                            | 25.6                    | 10.3                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 25.5                       | 2.1                            | 25                      | 10.3                   | 0           | none              |
| structural-sort | 1    | 2        | 24.4                       | 2.7                            | 25                      | 10.2                   | 0           | none              |
| structural-sort | 1    | 3        | 23.3                       | 1.7                            | 16.7                    | 10.3                   | 0           | none              |
