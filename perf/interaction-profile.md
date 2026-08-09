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

## phase-1-fixture — 2026-08-10T10:49:48.337Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 31.3                       | 31.3                           | 33.4                    | 10.4                   | 1           | none              |
| root-drag       | 0.5  | 2        | 34.4                       | 34.4                           | 34.1                    | 10.3                   | 1           | none              |
| root-drag       | 0.5  | 3        | 33.7                       | 33.7                           | 33                      | 10.3                   | 1           | none              |
| root-drag       | 1    | 1 (cold) | 26.8                       | 26.8                           | 16.6                    | 10.3                   | 0           | none              |
| root-drag       | 1    | 2        | 30.5                       | 30.5                           | 25.4                    | 10.3                   | 0           | none              |
| root-drag       | 1    | 3        | 30.1                       | 30.1                           | 25                      | 10.3                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 28                         | 28                             | 25.7                    | 25.3                   | 0           | none              |
| root-drag       | 2    | 2        | 21.2                       | 21.1                           | 16.8                    | 18.5                   | 0           | none              |
| root-drag       | 2    | 3        | 31.5                       | 31.5                           | 25                      | 17.7                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 57.3                       | 4.9                            | 58.4                    | 16.7                   | 1           | 1 (max 58 ms)     |
| structural-sort | 0.5  | 2        | 52.9                       | 4.6                            | 58.3                    | 16.8                   | 1           | 1 (max 54 ms)     |
| structural-sort | 0.5  | 3        | 50.1                       | 2.3                            | 50.1                    | 16.7                   | 1           | 1 (max 51 ms)     |
| structural-sort | 1    | 1 (cold) | 47.8                       | 3.1                            | 58.9                    | 16.6                   | 1           | none              |
| structural-sort | 1    | 2        | 53.4                       | 5.1                            | 58.2                    | 16.7                   | 1           | 1 (max 54 ms)     |
| structural-sort | 1    | 3        | 51.3                       | 4.2                            | 58.3                    | 16.6                   | 1           | 1 (max 52 ms)     |
| structural-sort | 2    | 1 (cold) | 47.8                       | 3.2                            | 58                      | 10.4                   | 1           | none              |
| structural-sort | 2    | 2        | 53.4                       | 4.8                            | 59.3                    | 10.4                   | 1           | 1 (max 54 ms)     |
| structural-sort | 2    | 3        | 53.5                       | 4.3                            | 58.1                    | 10.1                   | 1           | 1 (max 54 ms)     |
| nested-freeform | 0.5  | 1 (cold) | 42.8                       | 3.1                            | 50.1                    | 16.7                   | 1           | none              |
| nested-freeform | 0.5  | 2        | 47.1                       | 4.7                            | 58.1                    | 16.6                   | 1           | none              |
| nested-freeform | 0.5  | 3        | 47.9                       | 4.4                            | 58.4                    | 16.6                   | 1           | none              |
| nested-freeform | 1    | 1 (cold) | 43.3                       | 3.1                            | 50                      | 25.3                   | 1           | none              |
| nested-freeform | 1    | 2        | 45.4                       | 2.9                            | 58.3                    | 10.3                   | 1           | none              |
| nested-freeform | 1    | 3        | 47.7                       | 4.1                            | 58.4                    | 16.9                   | 1           | none              |
| nested-freeform | 2    | 1 (cold) | 42                         | 2.8                            | 50                      | 16.6                   | 1           | none              |
| nested-freeform | 2    | 2        | 46.9                       | 5                              | 59.8                    | 10.2                   | 1           | none              |
| nested-freeform | 2    | 3        | 47.3                       | 4.5                            | 49.9                    | 10.1                   | 1           | none              |

### production

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 11.5                       | 11.4                           | 25                      | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 2        | 11                         | 10.9                           | 8.9                     | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 3        | 6.3                        | 6.3                            | 8.4                     | 10.2                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 8.2                        | 8.1                            | 10                      | 10.1                   | 0           | none              |
| root-drag       | 1    | 2        | 10.2                       | 10.2                           | 9.5                     | 16.6                   | 0           | none              |
| root-drag       | 1    | 3        | 8.4                        | 8.4                            | 8.4                     | 10.3                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 7.8                        | 7.8                            | 10.1                    | 10.3                   | 0           | none              |
| root-drag       | 2    | 2        | 6.9                        | 6.8                            | 9.4                     | 10.2                   | 0           | none              |
| root-drag       | 2    | 3        | 7.8                        | 7.7                            | 10.1                    | 9.9                    | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 33.1                       | 3.4                            | 33.4                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 2        | 31.3                       | 2.8                            | 25.1                    | 16.7                   | 0           | none              |
| structural-sort | 0.5  | 3        | 25.5                       | 1.8                            | 25                      | 16.4                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 25.1                       | 2.3                            | 25                      | 10.3                   | 0           | none              |
| structural-sort | 1    | 2        | 26.3                       | 2.9                            | 16.6                    | 10.4                   | 0           | none              |
| structural-sort | 1    | 3        | 20.2                       | 3.2                            | 17.6                    | 10.3                   | 0           | none              |
| structural-sort | 2    | 1 (cold) | 23.1                       | 2                              | 25                      | 9.6                    | 0           | none              |
| structural-sort | 2    | 2        | 26.2                       | 2.6                            | 25                      | 10.3                   | 0           | none              |
| structural-sort | 2    | 3        | 27.9                       | 2.5                            | 24.9                    | 10.1                   | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 24.4                       | 2.1                            | 25                      | 10.3                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 28.1                       | 3.2                            | 24.4                    | 10.3                   | 0           | none              |
| nested-freeform | 0.5  | 3        | 28.8                       | 3.5                            | 25.1                    | 10.3                   | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 24.6                       | 2                              | 24.9                    | 10.3                   | 0           | none              |
| nested-freeform | 1    | 2        | 23.5                       | 1.5                            | 25                      | 10.3                   | 0           | none              |
| nested-freeform | 1    | 3        | 18.2                       | 2.6                            | 17.7                    | 10.3                   | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 22.9                       | 2.2                            | 25                      | 10.1                   | 0           | none              |
| nested-freeform | 2    | 2        | 26.4                       | 2.7                            | 16.6                    | 10.1                   | 0           | none              |
| nested-freeform | 2    | 3        | 29.4                       | 3.3                            | 25                      | 10.2                   | 0           | none              |

## phase-1-fixture-activation — 2026-08-10T10:55:10.749Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 30.2                       | 30.2                           | 40.8                    | 10.3                   | 1           | none              |
| root-drag       | 0.5  | 2        | 35.3                       | 35.3                           | 34.4                    | 10.2                   | 1           | none              |
| root-drag       | 0.5  | 3        | 32                         | 32                             | 25                      | 10.3                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 27.5                       | 27.5                           | 25                      | 16.7                   | 0           | none              |
| root-drag       | 1    | 2        | 30.4                       | 30.4                           | 26.5                    | 10.3                   | 0           | none              |
| root-drag       | 1    | 3        | 31.8                       | 31.7                           | 33.3                    | 10.3                   | 1           | none              |
| root-drag       | 2    | 1 (cold) | 25.8                       | 25.8                           | 25                      | 17.8                   | 0           | none              |
| root-drag       | 2    | 2        | 31.9                       | 31.8                           | 25.7                    | 16.9                   | 0           | none              |
| root-drag       | 2    | 3        | 30.2                       | 30.1                           | 34.3                    | 24.8                   | 1           | none              |
| structural-sort | 0.5  | 1 (cold) | 54.6                       | 4.5                            | 66.6                    | 16.9                   | 1           | 1 (max 55 ms)     |
| structural-sort | 0.5  | 2        | 55                         | 4.7                            | 58.3                    | 18.1                   | 1           | 1 (max 56 ms)     |
| structural-sort | 0.5  | 3        | 51.9                       | 4.4                            | 59.5                    | 16.3                   | 1           | 1 (max 53 ms)     |
| structural-sort | 1    | 1 (cold) | 46.7                       | 3                              | 58.6                    | 16.6                   | 1           | none              |
| structural-sort | 1    | 2        | 50.5                       | 2.8                            | 58.5                    | 18                     | 1           | 1 (max 51 ms)     |
| structural-sort | 1    | 3        | 50.5                       | 4.6                            | 59                      | 16.7                   | 1           | 1 (max 51 ms)     |
| structural-sort | 2    | 1 (cold) | 47.5                       | 3.2                            | 59.9                    | 9.9                    | 1           | none              |
| structural-sort | 2    | 2        | 43.5                       | 3.5                            | 49.6                    | 10.3                   | 1           | none              |
| structural-sort | 2    | 3        | 53.5                       | 4.2                            | 58.8                    | 10.3                   | 1           | 1 (max 54 ms)     |
| nested-freeform | 0.5  | 1 (cold) | 42.6                       | 3.1                            | 50.3                    | 16.7                   | 1           | none              |
| nested-freeform | 0.5  | 2        | 46                         | 4                              | 50.8                    | 10.3                   | 1           | none              |
| nested-freeform | 0.5  | 3        | 46                         | 4.1                            | 49.9                    | 16.7                   | 1           | none              |
| nested-freeform | 1    | 1 (cold) | 41.9                       | 3.1                            | 50.6                    | 16.6                   | 1           | none              |
| nested-freeform | 1    | 2        | 48.6                       | 5                              | 50                      | 16.7                   | 1           | none              |
| nested-freeform | 1    | 3        | 47.7                       | 4.1                            | 51.4                    | 16.7                   | 1           | none              |
| nested-freeform | 2    | 1 (cold) | 41.9                       | 3                              | 49.9                    | 15.6                   | 1           | none              |
| nested-freeform | 2    | 2        | 48.3                       | 4.9                            | 58.4                    | 17.8                   | 1           | none              |
| nested-freeform | 2    | 3        | 46.7                       | 4.5                            | 51.8                    | 10.4                   | 1           | none              |

### production

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 11.4                       | 11.3                           | 25                      | 10.4                   | 0           | none              |
| root-drag       | 0.5  | 2        | 7.4                        | 7.4                            | 10.2                    | 10.4                   | 0           | none              |
| root-drag       | 0.5  | 3        | 9.3                        | 9.2                            | 10                      | 10.2                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 7.7                        | 7.7                            | 9.8                     | 10.3                   | 0           | none              |
| root-drag       | 1    | 2        | 11.3                       | 11.2                           | 18.4                    | 10.4                   | 0           | none              |
| root-drag       | 1    | 3        | 10.5                       | 10.4                           | 9.4                     | 10.3                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 7.3                        | 7.3                            | 10.1                    | 10.2                   | 0           | none              |
| root-drag       | 2    | 2        | 8.4                        | 8.3                            | 8.5                     | 10.3                   | 0           | none              |
| root-drag       | 2    | 3        | 10.6                       | 10.6                           | 8.9                     | 10.3                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 34.3                       | 3.8                            | 33.3                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 2        | 28.1                       | 2.7                            | 26.4                    | 16.7                   | 0           | none              |
| structural-sort | 0.5  | 3        | 25.9                       | 2.2                            | 25.1                    | 16.7                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 24.5                       | 2.1                            | 25.7                    | 10.3                   | 0           | none              |
| structural-sort | 1    | 2        | 28.1                       | 2.6                            | 24.2                    | 10.4                   | 0           | none              |
| structural-sort | 1    | 3        | 27                         | 2.5                            | 25.1                    | 16.7                   | 0           | none              |
| structural-sort | 2    | 1 (cold) | 21.3                       | 1.9                            | 15.6                    | 10                     | 0           | none              |
| structural-sort | 2    | 2        | 26.6                       | 2.5                            | 24.9                    | 10.3                   | 0           | none              |
| structural-sort | 2    | 3        | 27                         | 2.5                            | 25                      | 10.2                   | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 24.2                       | 2.1                            | 25                      | 10.3                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 26.8                       | 2                              | 24.5                    | 10.2                   | 0           | none              |
| nested-freeform | 0.5  | 3        | 29.7                       | 2.6                            | 33.1                    | 10.4                   | 1           | none              |
| nested-freeform | 1    | 1 (cold) | 22.5                       | 2.1                            | 25                      | 10.4                   | 0           | none              |
| nested-freeform | 1    | 2        | 28                         | 2.7                            | 24.9                    | 15.5                   | 0           | none              |
| nested-freeform | 1    | 3        | 25.7                       | 2.3                            | 26.2                    | 10.3                   | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 24.5                       | 2                              | 25.1                    | 10.1                   | 0           | none              |
| nested-freeform | 2    | 2        | 29.3                       | 2.5                            | 25.7                    | 10.2                   | 0           | none              |
| nested-freeform | 2    | 3        | 19.2                       | 3.3                            | 9                       | 10.2                   | 0           | none              |

### Fixture validity

This `phase-1-fixture-activation` run is the first trace set that fails closed unless every cell
records all 96 pointer moves, publishes its expected workspace interaction owner, and preserves
window scroll. Both build traces contain all 27 scenario/zoom/pass cells. Runs before
`phase-1-fixture` used unstable placement and document state; retain them as historical evidence,
but do not use their dead cells for comparisons.

## phase-1-selection-defer — 2026-08-10T11:27:21.166Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 1.2                        | 31.8                           | 16.7                    | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 2        | 1.2                        | 23.7                           | 24                      | 10.2                   | 0           | none              |
| root-drag       | 0.5  | 3        | 1.3                        | 20                             | 24.9                    | 9.9                    | 0           | none              |
| root-drag       | 1    | 1 (cold) | 0.7                        | 40.9                           | 33.4                    | 10.3                   | 1           | none              |
| root-drag       | 1    | 2        | 1.2                        | 21                             | 24.9                    | 16.6                   | 0           | none              |
| root-drag       | 1    | 3        | 1.1                        | 21.2                           | 25                      | 17.5                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 0.8                        | 17.7                           | 24.9                    | 17.1                   | 0           | none              |
| root-drag       | 2    | 2        | 1.3                        | 21                             | 24.5                    | 17.4                   | 0           | none              |
| root-drag       | 2    | 3        | 1.2                        | 20.6                           | 24.8                    | 18.1                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 27.8                       | 4.2                            | 41.6                    | 16.6                   | 1           | none              |
| structural-sort | 0.5  | 2        | 23.2                       | 4.5                            | 34.6                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 3        | 19.2                       | 2.3                            | 25.2                    | 16.7                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 20                         | 2.8                            | 25                      | 16.7                   | 0           | none              |
| structural-sort | 1    | 2        | 19.5                       | 2.6                            | 25.1                    | 16.7                   | 0           | none              |
| structural-sort | 1    | 3        | 22.2                       | 4.1                            | 33.3                    | 16.6                   | 1           | none              |
| structural-sort | 2    | 1 (cold) | 16.5                       | 2.7                            | 25.1                    | 10                     | 0           | none              |
| structural-sort | 2    | 2        | 9.5                        | 0.9                            | 16.6                    | 9.5                    | 0           | none              |
| structural-sort | 2    | 3        | 23.8                       | 4.5                            | 33.5                    | 10.2                   | 1           | none              |
| nested-freeform | 0.5  | 1 (cold) | 20.7                       | 2.8                            | 33.3                    | 16.6                   | 1           | none              |
| nested-freeform | 0.5  | 2        | 16.1                       | 4                              | 25.2                    | 16.5                   | 0           | none              |
| nested-freeform | 0.5  | 3        | 21.3                       | 2.8                            | 34.3                    | 16.7                   | 1           | none              |
| nested-freeform | 1    | 1 (cold) | 20.8                       | 3                              | 33.4                    | 16.6                   | 1           | none              |
| nested-freeform | 1    | 2        | 23.4                       | 4.5                            | 34.3                    | 10.3                   | 1           | none              |
| nested-freeform | 1    | 3        | 24.8                       | 4.1                            | 33.7                    | 16.7                   | 1           | none              |
| nested-freeform | 2    | 1 (cold) | 21                         | 3                              | 33.6                    | 17.8                   | 1           | none              |
| nested-freeform | 2    | 2        | 25.3                       | 4.7                            | 33.8                    | 10.2                   | 1           | none              |
| nested-freeform | 2    | 3        | 21.6                       | 4.5                            | 34.5                    | 10.1                   | 1           | none              |

## phase-1-activation-offload — 2026-08-10T11:35:35.690Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 1.3                        | 32.4                           | 16.7                    | 10.2                   | 0           | none              |
| root-drag       | 0.5  | 2        | 0.8                        | 47.9                           | 33.3                    | 9.9                    | 1           | none              |
| root-drag       | 0.5  | 3        | 0.6                        | 42.6                           | 33.3                    | 10.2                   | 1           | none              |
| root-drag       | 1    | 1 (cold) | 0.6                        | 23.7                           | 16.7                    | 10.3                   | 0           | none              |
| root-drag       | 1    | 2        | 0.8                        | 46                             | 33                      | 10.3                   | 1           | none              |
| root-drag       | 1    | 3        | 0.8                        | 43.7                           | 33.1                    | 10.4                   | 1           | none              |
| root-drag       | 2    | 1 (cold) | 0.5                        | 25.5                           | 16.8                    | 17.7                   | 0           | none              |
| root-drag       | 2    | 2        | 0.8                        | 43.7                           | 26                      | 17.6                   | 0           | none              |
| root-drag       | 2    | 3        | 0.4                        | 29.5                           | 16.6                    | 17.5                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 31.3                       | 31.2                           | 41.6                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 2        | 21.3                       | 21.1                           | 34.7                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 3        | 24                         | 23.9                           | 35                      | 16.7                   | 1           | none              |
| structural-sort | 1    | 1 (cold) | 13.6                       | 13.5                           | 25                      | 17.9                   | 0           | none              |
| structural-sort | 1    | 2        | 25.1                       | 24.8                           | 32.1                    | 16.7                   | 1           | none              |
| structural-sort | 1    | 3        | 20.9                       | 20.8                           | 33.3                    | 17                     | 1           | none              |
| structural-sort | 2    | 1 (cold) | 19.2                       | 19.1                           | 33.3                    | 10.2                   | 1           | none              |
| structural-sort | 2    | 2        | 20.3                       | 20                             | 24.8                    | 10.3                   | 0           | none              |
| structural-sort | 2    | 3        | 23.3                       | 23.1                           | 33.1                    | 10.3                   | 1           | none              |
| nested-freeform | 0.5  | 1 (cold) | 18.9                       | 18.8                           | 33.5                    | 10.2                   | 1           | none              |
| nested-freeform | 0.5  | 2        | 22.5                       | 22.4                           | 33.1                    | 16.7                   | 1           | none              |
| nested-freeform | 0.5  | 3        | 20.7                       | 20.5                           | 33.4                    | 10.4                   | 1           | none              |
| nested-freeform | 1    | 1 (cold) | 20.5                       | 20.3                           | 33.3                    | 16.6                   | 1           | none              |
| nested-freeform | 1    | 2        | 20.3                       | 20.2                           | 25.1                    | 16.7                   | 0           | none              |
| nested-freeform | 1    | 3        | 23                         | 22.9                           | 33.6                    | 16.8                   | 1           | none              |
| nested-freeform | 2    | 1 (cold) | 17.4                       | 17.2                           | 25                      | 16.7                   | 0           | none              |
| nested-freeform | 2    | 2        | 21.8                       | 21.6                           | 33                      | 16.3                   | 1           | none              |
| nested-freeform | 2    | 3        | 15.7                       | 15.6                           | 26.3                    | 10.3                   | 0           | none              |

## phase-1-frame-memo — 2026-08-10T11:42:31.791Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 1                          | 28.6                           | 16.7                    | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 2        | 0.8                        | 46                             | 33.4                    | 10.2                   | 1           | none              |
| root-drag       | 0.5  | 3        | 0.8                        | 47.8                           | 33.3                    | 10.3                   | 1           | none              |
| root-drag       | 1    | 1 (cold) | 0.6                        | 40.5                           | 34.5                    | 16.6                   | 1           | none              |
| root-drag       | 1    | 2        | 0.9                        | 42.5                           | 33.5                    | 16.9                   | 1           | none              |
| root-drag       | 1    | 3        | 0.9                        | 45.8                           | 33.4                    | 18                     | 1           | none              |
| root-drag       | 2    | 1 (cold) | 0.5                        | 41.4                           | 33.3                    | 17.5                   | 1           | none              |
| root-drag       | 2    | 2        | 0.9                        | 19.4                           | 25.1                    | 17.2                   | 0           | none              |
| root-drag       | 2    | 3        | 0.7                        | 43.9                           | 25.1                    | 17.2                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 31                         | 30.8                           | 42.9                    | 17.3                   | 1           | none              |
| structural-sort | 0.5  | 2        | 22.9                       | 22.6                           | 33.3                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 3        | 24.3                       | 24.1                           | 33.4                    | 16.7                   | 1           | none              |
| structural-sort | 1    | 1 (cold) | 18.7                       | 18.5                           | 25                      | 16.7                   | 0           | none              |
| structural-sort | 1    | 2        | 23.5                       | 23.3                           | 33.3                    | 16.7                   | 1           | none              |
| structural-sort | 1    | 3        | 21.5                       | 21.3                           | 33.4                    | 16.7                   | 1           | none              |
| structural-sort | 2    | 1 (cold) | 15.9                       | 15.7                           | 33.3                    | 10.2                   | 1           | none              |
| structural-sort | 2    | 2        | 15.9                       | 15.9                           | 24.8                    | 17                     | 0           | none              |
| structural-sort | 2    | 3        | 22.9                       | 22.7                           | 33.3                    | 10.3                   | 1           | none              |
| nested-freeform | 0.5  | 1 (cold) | 19.7                       | 19.4                           | 25                      | 10.1                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 22.9                       | 22.7                           | 41.6                    | 10.3                   | 1           | none              |
| nested-freeform | 0.5  | 3        | 22.1                       | 21.9                           | 33.2                    | 10.1                   | 1           | none              |
| nested-freeform | 1    | 1 (cold) | 19.6                       | 19.5                           | 24.7                    | 16.7                   | 0           | none              |
| nested-freeform | 1    | 2        | 24.4                       | 24.2                           | 41.7                    | 10.4                   | 1           | none              |
| nested-freeform | 1    | 3        | 21.1                       | 20.9                           | 25.1                    | 10.3                   | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 18.8                       | 18.6                           | 33.4                    | 10.3                   | 1           | none              |
| nested-freeform | 2    | 2        | 23.8                       | 23.5                           | 33.5                    | 15.6                   | 1           | none              |
| nested-freeform | 2    | 3        | 18.8                       | 18.6                           | 25.3                    | 10.4                   | 0           | none              |

## phase-1-noise-check — 2026-08-10T11:43:57.450Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 5 passes per zoom.

### development

| Scenario  | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag | 1    | 1 (cold) | 1.1                        | 30.4                           | 16.6                    | 10                     | 0           | none              |
| root-drag | 1    | 2        | 0.9                        | 27.3                           | 17.5                    | 10.4                   | 0           | none              |
| root-drag | 1    | 3        | 0.8                        | 45.1                           | 33.3                    | 16.2                   | 1           | none              |
| root-drag | 1    | 4        | 0.5                        | 42                             | 33.3                    | 10.3                   | 1           | none              |
| root-drag | 1    | 5        | 0.9                        | 47.1                           | 33.1                    | 10.2                   | 1           | none              |

## phase-1-frame-flush — 2026-08-10T11:46:33.311Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 1.2                        | 45.2                           | 16.7                    | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 2        | 0.9                        | 42                             | 33.2                    | 10.2                   | 1           | none              |
| root-drag       | 0.5  | 3        | 0.8                        | 36.6                           | 33.4                    | 10.3                   | 1           | none              |
| root-drag       | 1    | 1 (cold) | 0.5                        | 38.6                           | 33.4                    | 10.3                   | 1           | none              |
| root-drag       | 1    | 2        | 0.5                        | 27.8                           | 25                      | 17.5                   | 0           | none              |
| root-drag       | 1    | 3        | 0.8                        | 39                             | 33.5                    | 17                     | 1           | none              |
| root-drag       | 2    | 1 (cold) | 0.5                        | 36.9                           | 33.3                    | 16.6                   | 1           | none              |
| root-drag       | 2    | 2        | 0.9                        | 29.8                           | 25.8                    | 16.8                   | 0           | none              |
| root-drag       | 2    | 3        | 0.8                        | 39.7                           | 33.4                    | 17.4                   | 1           | none              |
| structural-sort | 0.5  | 1 (cold) | 27.2                       | 27                             | 41.7                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 2        | 23.1                       | 22.9                           | 42.7                    | 16.6                   | 1           | none              |
| structural-sort | 0.5  | 3        | 17.6                       | 17.5                           | 25                      | 15.2                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 19                         | 18.9                           | 33.4                    | 17.3                   | 1           | none              |
| structural-sort | 1    | 2        | 18                         | 17.8                           | 33.3                    | 16.7                   | 1           | none              |
| structural-sort | 1    | 3        | 23.8                       | 23.5                           | 41.4                    | 16.6                   | 1           | none              |
| structural-sort | 2    | 1 (cold) | 17.2                       | 17.1                           | 34.1                    | 10.2                   | 1           | none              |
| structural-sort | 2    | 2        | 19.3                       | 19.1                           | 25.4                    | 9.6                    | 0           | none              |
| structural-sort | 2    | 3        | 20.6                       | 20.3                           | 32.9                    | 10.3                   | 1           | none              |
| nested-freeform | 0.5  | 1 (cold) | 19.7                       | 19.5                           | 33.3                    | 16.7                   | 1           | none              |
| nested-freeform | 0.5  | 2        | 25.7                       | 25.5                           | 42.4                    | 9.8                    | 1           | none              |
| nested-freeform | 0.5  | 3        | 24.5                       | 24.3                           | 41.7                    | 10.4                   | 1           | none              |
| nested-freeform | 1    | 1 (cold) | 18.7                       | 18.6                           | 25                      | 16.3                   | 0           | none              |
| nested-freeform | 1    | 2        | 20.9                       | 20.7                           | 33.2                    | 16.7                   | 1           | none              |
| nested-freeform | 1    | 3        | 24.6                       | 24.3                           | 33.4                    | 17.7                   | 1           | none              |
| nested-freeform | 2    | 1 (cold) | 19.5                       | 19.4                           | 35                      | 10.2                   | 1           | none              |
| nested-freeform | 2    | 2        | 25.1                       | 24.9                           | 33.3                    | 10.3                   | 1           | none              |
| nested-freeform | 2    | 3        | 24.5                       | 24.4                           | 33.1                    | 16.9                   | 1           | none              |

## phase-1-frame-flush — 2026-08-10T11:48:18.834Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### production

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 1                          | 30.5                           | 16.7                    | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 2        | 0.9                        | 13.1                           | 9.8                     | 10.4                   | 0           | none              |
| root-drag       | 0.5  | 3        | 0.8                        | 13.5                           | 8.5                     | 10.3                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 0.6                        | 17.7                           | 10                      | 16.6                   | 0           | none              |
| root-drag       | 1    | 2        | 0.7                        | 18                             | 9.5                     | 15.3                   | 0           | none              |
| root-drag       | 1    | 3        | 0.8                        | 10.8                           | 9.6                     | 16.7                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 0.7                        | 17.4                           | 9.8                     | 10.2                   | 0           | none              |
| root-drag       | 2    | 2        | 0.3                        | 16.5                           | 9.9                     | 10.3                   | 0           | none              |
| root-drag       | 2    | 3        | 0.7                        | 13.7                           | 9.9                     | 10.3                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 29.1                       | 28.9                           | 33.3                    | 10.2                   | 1           | none              |
| structural-sort | 0.5  | 2        | 21.6                       | 21.5                           | 23.5                    | 9.8                    | 0           | none              |
| structural-sort | 0.5  | 3        | 21                         | 20.9                           | 16.6                    | 10.3                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 18.3                       | 18.2                           | 16.9                    | 10.3                   | 0           | none              |
| structural-sort | 1    | 2        | 21.9                       | 21.8                           | 26.3                    | 10.1                   | 0           | none              |
| structural-sort | 1    | 3        | 19.9                       | 19.6                           | 18.2                    | 10.4                   | 0           | none              |
| structural-sort | 2    | 1 (cold) | 17.7                       | 17.5                           | 17.3                    | 10.3                   | 0           | none              |
| structural-sort | 2    | 2        | 20.6                       | 20.5                           | 15.2                    | 10.1                   | 0           | none              |
| structural-sort | 2    | 3        | 23.1                       | 22.9                           | 16                      | 10.2                   | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 16.5                       | 16.4                           | 16.6                    | 10.3                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 24.3                       | 24.2                           | 24.1                    | 10.4                   | 0           | none              |
| nested-freeform | 0.5  | 3        | 24.3                       | 24.2                           | 25                      | 10.4                   | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 14.4                       | 14.3                           | 16.7                    | 10.4                   | 0           | none              |
| nested-freeform | 1    | 2        | 21.2                       | 21.1                           | 16.5                    | 10.3                   | 0           | none              |
| nested-freeform | 1    | 3        | 21.4                       | 21.2                           | 15.5                    | 10.3                   | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 15.2                       | 15.2                           | 17                      | 10.3                   | 0           | none              |
| nested-freeform | 2    | 2        | 23.2                       | 23                             | 24.9                    | 10.3                   | 0           | none              |
| nested-freeform | 2    | 3        | 22.5                       | 22.3                           | 16.6                    | 10.3                   | 0           | none              |

## phase-1-selection-store — 2026-08-10T13:02:38.238Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

Superseded: this run measured an intermediate build that had dropped `node.selected`, which broke
selected-block root dragging (caught by `workspace-selection.spec.ts`). Use the 13:07/13:09 runs
below, which restore node-level selected/draggable state through the store subscription.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 13.1                       | 13.1                           | 24.7                    | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 2        | 13.8                       | 13.7                           | 17.7                    | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 3        | 12.9                       | 12.9                           | 16.7                    | 10.2                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 10.6                       | 10.6                           | 16.6                    | 10.2                   | 0           | none              |
| root-drag       | 1    | 2        | 11.3                       | 11.2                           | 16.9                    | 16.7                   | 0           | none              |
| root-drag       | 1    | 3        | 4.3                        | 4.3                            | 10                      | 10.3                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 10.4                       | 10.4                           | 16.7                    | 16.8                   | 0           | none              |
| root-drag       | 2    | 2        | 12.4                       | 12.4                           | 16.7                    | 17.8                   | 0           | none              |
| root-drag       | 2    | 3        | 10.3                       | 10.3                           | 17.9                    | 16.9                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 32.7                       | 4.9                            | 41.8                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 2        | 29.3                       | 5.2                            | 41.6                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 3        | 28.1                       | 4.3                            | 41.6                    | 16.7                   | 1           | none              |
| structural-sort | 1    | 1 (cold) | 25.2                       | 3                              | 33.6                    | 16.7                   | 1           | none              |
| structural-sort | 1    | 2        | 27.9                       | 4.2                            | 41.7                    | 17.1                   | 1           | none              |
| structural-sort | 1    | 3        | 24.6                       | 2.3                            | 35                      | 16.5                   | 1           | none              |
| structural-sort | 2    | 1 (cold) | 24.7                       | 3.1                            | 33.2                    | 10                     | 1           | none              |
| structural-sort | 2    | 2        | 25.6                       | 3                              | 42.2                    | 10.3                   | 1           | none              |
| structural-sort | 2    | 3        | 26.4                       | 3.6                            | 33.5                    | 10.3                   | 1           | none              |
| nested-freeform | 0.5  | 1 (cold) | 22.7                       | 2.8                            | 34                      | 9.6                    | 1           | none              |
| nested-freeform | 0.5  | 2        | 29.4                       | 4.9                            | 33.3                    | 16.7                   | 1           | none              |
| nested-freeform | 0.5  | 3        | 12.2                       | 0.8                            | 16.7                    | 10.4                   | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 20.8                       | 2.8                            | 25                      | 16.7                   | 0           | none              |
| nested-freeform | 1    | 2        | 10.9                       | 0.9                            | 16.6                    | 16.7                   | 0           | none              |
| nested-freeform | 1    | 3        | 29.4                       | 4.3                            | 41.6                    | 16.7                   | 1           | none              |
| nested-freeform | 2    | 1 (cold) | 23.3                       | 3.1                            | 34.2                    | 16.4                   | 1           | none              |
| nested-freeform | 2    | 2        | 29.7                       | 5.1                            | 41.7                    | 16.7                   | 1           | none              |
| nested-freeform | 2    | 3        | 26.7                       | 3.5                            | 43.3                    | 25                     | 1           | none              |

## phase-1-selection-store — 2026-08-10T13:07:53.586Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 21                         | 20.9                           | 33.3                    | 10.2                   | 1           | none              |
| root-drag       | 0.5  | 2        | 24.6                       | 24.5                           | 17.5                    | 9.8                    | 0           | none              |
| root-drag       | 0.5  | 3        | 9.1                        | 9                              | 10.1                    | 10.2                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 19.4                       | 19.4                           | 16.7                    | 10.2                   | 0           | none              |
| root-drag       | 1    | 2        | 21.8                       | 21.7                           | 25.3                    | 10.3                   | 0           | none              |
| root-drag       | 1    | 3        | 19.4                       | 19.4                           | 16.6                    | 17.2                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 17.3                       | 17.3                           | 16.6                    | 16.9                   | 0           | none              |
| root-drag       | 2    | 2        | 19.1                       | 19.1                           | 16.5                    | 18.4                   | 0           | none              |
| root-drag       | 2    | 3        | 21.9                       | 21.8                           | 16.8                    | 16.9                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 33.6                       | 4.8                            | 41.7                    | 16.6                   | 1           | none              |
| structural-sort | 0.5  | 2        | 24.2                       | 4.4                            | 34.2                    | 16.9                   | 1           | none              |
| structural-sort | 0.5  | 3        | 25.4                       | 2.4                            | 34.4                    | 16.7                   | 1           | none              |
| structural-sort | 1    | 1 (cold) | 22                         | 2.8                            | 33.4                    | 17.6                   | 1           | none              |
| structural-sort | 1    | 2        | 29                         | 5.1                            | 41.8                    | 18.2                   | 1           | none              |
| structural-sort | 1    | 3        | 26.8                       | 3.6                            | 33.4                    | 16.7                   | 1           | none              |
| structural-sort | 2    | 1 (cold) | 23.9                       | 2.9                            | 25                      | 10.4                   | 0           | none              |
| structural-sort | 2    | 2        | 28.2                       | 4.3                            | 41.7                    | 10.1                   | 1           | none              |
| structural-sort | 2    | 3        | 26.2                       | 3.9                            | 33.9                    | 10.3                   | 1           | none              |
| nested-freeform | 0.5  | 1 (cold) | 25.7                       | 3                              | 33.4                    | 16.7                   | 1           | none              |
| nested-freeform | 0.5  | 2        | 22.9                       | 4.6                            | 33.7                    | 16.7                   | 1           | none              |
| nested-freeform | 0.5  | 3        | 27.6                       | 4                              | 41.6                    | 16.8                   | 1           | none              |
| nested-freeform | 1    | 1 (cold) | 21.2                       | 2.5                            | 34.1                    | 16.6                   | 1           | none              |
| nested-freeform | 1    | 2        | 27.6                       | 4.3                            | 43.1                    | 16.8                   | 1           | none              |
| nested-freeform | 1    | 3        | 23.2                       | 2.3                            | 33.4                    | 16.8                   | 1           | none              |
| nested-freeform | 2    | 1 (cold) | 25.6                       | 3.2                            | 33.7                    | 16.1                   | 1           | none              |
| nested-freeform | 2    | 2        | 26                         | 3.9                            | 41.9                    | 10.4                   | 1           | none              |
| nested-freeform | 2    | 3        | 27.7                       | 4.2                            | 42.6                    | 16.3                   | 1           | none              |

## phase-1-selection-store — 2026-08-10T13:09:09.570Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### production

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 8.9                        | 8.8                            | 24.8                    | 10.4                   | 0           | none              |
| root-drag       | 0.5  | 2        | 3.1                        | 3                              | 8.4                     | 10.2                   | 0           | none              |
| root-drag       | 0.5  | 3        | 8.8                        | 8.8                            | 9.5                     | 10.3                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 6.5                        | 6.5                            | 9.9                     | 10.4                   | 0           | none              |
| root-drag       | 1    | 2        | 8.9                        | 8.8                            | 8.4                     | 10.3                   | 0           | none              |
| root-drag       | 1    | 3        | 7.5                        | 7.4                            | 9.7                     | 10.2                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 3.6                        | 3.5                            | 10.3                    | 16.6                   | 0           | none              |
| root-drag       | 2    | 2        | 9.3                        | 9.3                            | 8.5                     | 16.7                   | 0           | none              |
| root-drag       | 2    | 3        | 4.8                        | 4.7                            | 10.3                    | 10.4                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 31.8                       | 3.7                            | 33.3                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 2        | 27.5                       | 3                              | 25                      | 10.3                   | 0           | none              |
| structural-sort | 0.5  | 3        | 22.5                       | 1.5                            | 25                      | 16.6                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 19.7                       | 2.1                            | 26.5                    | 10.3                   | 0           | none              |
| structural-sort | 1    | 2        | 24.1                       | 2.6                            | 16.7                    | 16.2                   | 0           | none              |
| structural-sort | 1    | 3        | 21.9                       | 1.4                            | 16.7                    | 10.3                   | 0           | none              |
| structural-sort | 2    | 1 (cold) | 20.5                       | 1.9                            | 16.7                    | 10.1                   | 0           | none              |
| structural-sort | 2    | 2        | 25.1                       | 2.4                            | 25.9                    | 10.3                   | 0           | none              |
| structural-sort | 2    | 3        | 23.5                       | 2.7                            | 16.7                    | 10.4                   | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 21.6                       | 1.9                            | 25                      | 10.2                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 23.6                       | 2.6                            | 24.7                    | 10.2                   | 0           | none              |
| nested-freeform | 0.5  | 3        | 10.7                       | 0.7                            | 9.9                     | 10                     | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 19.3                       | 2                              | 16.2                    | 10.3                   | 0           | none              |
| nested-freeform | 1    | 2        | 23.7                       | 2.3                            | 17                      | 10.2                   | 0           | none              |
| nested-freeform | 1    | 3        | 24.1                       | 3.1                            | 25.6                    | 10.3                   | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 22.6                       | 2                              | 25                      | 10.3                   | 0           | none              |
| nested-freeform | 2    | 2        | 16.1                       | 2.7                            | 9.8                     | 10.1                   | 0           | none              |
| nested-freeform | 2    | 3        | 23.1                       | 2.7                            | 25.3                    | 10.3                   | 0           | none              |

## phase-1-ownership-store — 2026-08-10T13:45:17.983Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 20.1                       | 20                             | 33.3                    | 10.3                   | 1           | none              |
| root-drag       | 0.5  | 2        | 24.1                       | 24                             | 16.6                    | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 3        | 21.7                       | 21.7                           | 17.7                    | 10.2                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 18.5                       | 18.5                           | 16.6                    | 16.7                   | 0           | none              |
| root-drag       | 1    | 2        | 22.6                       | 22.5                           | 24.9                    | 10.3                   | 0           | none              |
| root-drag       | 1    | 3        | 22.1                       | 22.1                           | 16.7                    | 10.2                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 17.6                       | 17.5                           | 16.7                    | 16.7                   | 0           | none              |
| root-drag       | 2    | 2        | 23.6                       | 23.5                           | 16.6                    | 17                     | 0           | none              |
| root-drag       | 2    | 3        | 22.2                       | 22.2                           | 24.7                    | 18.4                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 33.5                       | 5.2                            | 33.4                    | 25                     | 1           | none              |
| structural-sort | 0.5  | 2        | 28                         | 4.5                            | 33.3                    | 25.1                   | 1           | none              |
| structural-sort | 0.5  | 3        | 30.1                       | 4.3                            | 42.1                    | 16.7                   | 1           | none              |
| structural-sort | 1    | 1 (cold) | 24.3                       | 2.8                            | 25                      | 16.6                   | 0           | none              |
| structural-sort | 1    | 2        | 27.5                       | 4                              | 24                      | 16.7                   | 0           | none              |
| structural-sort | 1    | 3        | 30                         | 4.2                            | 31.9                    | 16.7                   | 0           | none              |
| structural-sort | 2    | 1 (cold) | 23.9                       | 3.1                            | 24.9                    | 10.1                   | 0           | none              |
| structural-sort | 2    | 2        | 24.9                       | 2.7                            | 33.6                    | 9.5                    | 1           | none              |
| structural-sort | 2    | 3        | 27                         | 4.1                            | 24.5                    | 16.5                   | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 25.7                       | 3                              | 25.1                    | 10.4                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 27.6                       | 4                              | 33.4                    | 16.7                   | 1           | none              |
| nested-freeform | 0.5  | 3        | 29.6                       | 5.2                            | 33.2                    | 16.6                   | 1           | none              |
| nested-freeform | 1    | 1 (cold) | 24.6                       | 3.3                            | 33.9                    | 25                     | 1           | none              |
| nested-freeform | 1    | 2        | 24                         | 2.5                            | 34                      | 25.1                   | 1           | none              |
| nested-freeform | 1    | 3        | 26.6                       | 3.4                            | 25                      | 25                     | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 20.5                       | 2.7                            | 25                      | 16.5                   | 0           | none              |
| nested-freeform | 2    | 2        | 27.3                       | 3.2                            | 34.2                    | 25                     | 1           | none              |
| nested-freeform | 2    | 3        | 28.7                       | 4.2                            | 33.2                    | 16.5                   | 1           | none              |

### production

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 7.7                        | 7.6                            | 16.7                    | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 2        | 10.3                       | 10.2                           | 8.7                     | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 3        | 4.6                        | 4.6                            | 10.3                    | 10.2                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 6.6                        | 6.4                            | 8.6                     | 16.6                   | 0           | none              |
| root-drag       | 1    | 2        | 6.6                        | 6.5                            | 10.3                    | 16.7                   | 0           | none              |
| root-drag       | 1    | 3        | 7.4                        | 7.3                            | 10.2                    | 10.2                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 5.9                        | 5.8                            | 8.5                     | 10.3                   | 0           | none              |
| root-drag       | 2    | 2        | 6.4                        | 6.4                            | 8.7                     | 10.1                   | 0           | none              |
| root-drag       | 2    | 3        | 9.6                        | 9.5                            | 9.3                     | 10.3                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 28.9                       | 3.7                            | 25                      | 18.2                   | 0           | none              |
| structural-sort | 0.5  | 2        | 26.2                       | 2.9                            | 26.2                    | 10.4                   | 0           | none              |
| structural-sort | 0.5  | 3        | 23.2                       | 1.7                            | 25                      | 10.4                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 21.9                       | 2.1                            | 25                      | 10.3                   | 0           | none              |
| structural-sort | 1    | 2        | 25.8                       | 2.7                            | 26.1                    | 10.3                   | 0           | none              |
| structural-sort | 1    | 3        | 21.8                       | 1.5                            | 16.7                    | 10.3                   | 0           | none              |
| structural-sort | 2    | 1 (cold) | 19.6                       | 1.9                            | 16.6                    | 10.3                   | 0           | none              |
| structural-sort | 2    | 2        | 19.4                       | 1.4                            | 16.6                    | 10                     | 0           | none              |
| structural-sort | 2    | 3        | 18.8                       | 1.3                            | 10.2                    | 10.2                   | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 20.6                       | 2.1                            | 26.5                    | 10.4                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 26.6                       | 2.7                            | 26.3                    | 10.4                   | 0           | none              |
| nested-freeform | 0.5  | 3        | 19.4                       | 1.6                            | 16.7                    | 10.2                   | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 14.2                       | 1.1                            | 10.2                    | 10.3                   | 0           | none              |
| nested-freeform | 1    | 2        | 24.3                       | 2.7                            | 25.1                    | 10.4                   | 0           | none              |
| nested-freeform | 1    | 3        | 25.2                       | 2.9                            | 24.4                    | 10.3                   | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 21.6                       | 2.1                            | 18                      | 10.4                   | 0           | none              |
| nested-freeform | 2    | 2        | 13.1                       | 0.7                            | 9.4                     | 10.2                   | 0           | none              |
| nested-freeform | 2    | 3        | 22.1                       | 2.4                            | 25.4                    | 10.2                   | 0           | none              |

## phase-1-measured-bounds — 2026-08-10T15:14:20.989Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 21                         | 21                             | 24.9                    | 16.6                   | 0           | none              |
| root-drag       | 0.5  | 2        | 25.7                       | 25.7                           | 25.1                    | 16.7                   | 0           | none              |
| root-drag       | 0.5  | 3        | 22.3                       | 22.2                           | 16.7                    | 10.4                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 18.4                       | 18.4                           | 16.9                    | 16.8                   | 0           | none              |
| root-drag       | 1    | 2        | 23.1                       | 23.1                           | 16.7                    | 16.8                   | 0           | none              |
| root-drag       | 1    | 3        | 22.8                       | 22.7                           | 16.6                    | 10.3                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 18.3                       | 18.2                           | 16.7                    | 17                     | 0           | none              |
| root-drag       | 2    | 2        | 23.9                       | 23.8                           | 16.7                    | 24.7                   | 0           | none              |
| root-drag       | 2    | 3        | 23.2                       | 23.2                           | 24.8                    | 17.6                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 28.4                       | 5.3                            | 33.3                    | 16.7                   | 1           | none              |
| structural-sort | 0.5  | 2        | 24.8                       | 6.8                            | 25                      | 17.3                   | 0           | none              |
| structural-sort | 0.5  | 3        | 21.3                       | 4.9                            | 25                      | 16.7                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 18.1                       | 3.8                            | 26.6                    | 16.7                   | 0           | none              |
| structural-sort | 1    | 2        | 19.1                       | 2.9                            | 25                      | 16.7                   | 0           | none              |
| structural-sort | 1    | 3        | 21.9                       | 4.2                            | 25                      | 16.6                   | 0           | none              |
| structural-sort | 2    | 1 (cold) | 20.9                       | 3.8                            | 25                      | 16.7                   | 0           | none              |
| structural-sort | 2    | 2        | 22.6                       | 5.4                            | 33.4                    | 10.1                   | 1           | none              |
| structural-sort | 2    | 3        | 23.8                       | 5.5                            | 33.4                    | 10.3                   | 1           | none              |
| nested-freeform | 0.5  | 1 (cold) | 17.7                       | 3.3                            | 25                      | 23.4                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 25.4                       | 6.7                            | 34.9                    | 16.3                   | 1           | none              |
| nested-freeform | 0.5  | 3        | 21.5                       | 4                              | 25.1                    | 16.6                   | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 20.1                       | 3.9                            | 25                      | 25                     | 0           | none              |
| nested-freeform | 1    | 2        | 20.4                       | 3.6                            | 35                      | 17.2                   | 1           | none              |
| nested-freeform | 1    | 3        | 24.8                       | 5.7                            | 26.1                    | 25                     | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 21                         | 3.7                            | 25                      | 16.7                   | 0           | none              |
| nested-freeform | 2    | 2        | 22.4                       | 4.9                            | 25                      | 25                     | 0           | none              |
| nested-freeform | 2    | 3        | 23.4                       | 6.1                            | 26.4                    | 16.6                   | 0           | none              |

### production

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 9.7                        | 9.6                            | 24.9                    | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 2        | 10.9                       | 10.8                           | 8.5                     | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 3        | 5.4                        | 5.4                            | 10.3                    | 10.3                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 7.1                        | 7                              | 9.9                     | 10.3                   | 0           | none              |
| root-drag       | 1    | 2        | 6.7                        | 6.7                            | 8.5                     | 16.7                   | 0           | none              |
| root-drag       | 1    | 3        | 8.3                        | 8.3                            | 8.4                     | 16.6                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 6.4                        | 6.4                            | 9.8                     | 10.3                   | 0           | none              |
| root-drag       | 2    | 2        | 7.7                        | 7.6                            | 9.9                     | 10.2                   | 0           | none              |
| root-drag       | 2    | 3        | 9.5                        | 9.4                            | 8.9                     | 10.2                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 23.9                       | 3.9                            | 24.9                    | 16.7                   | 0           | none              |
| structural-sort | 0.5  | 2        | 18.9                       | 3.9                            | 18.2                    | 10.3                   | 0           | none              |
| structural-sort | 0.5  | 3        | 18.6                       | 4.1                            | 26.1                    | 16.6                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 16.6                       | 2.8                            | 16.9                    | 16.7                   | 0           | none              |
| structural-sort | 1    | 2        | 19.1                       | 4                              | 16.9                    | 10.3                   | 0           | none              |
| structural-sort | 1    | 3        | 19.4                       | 4                              | 15.1                    | 10.3                   | 0           | none              |
| structural-sort | 2    | 1 (cold) | 15.8                       | 2.8                            | 16.6                    | 10.2                   | 0           | none              |
| structural-sort | 2    | 2        | 18.7                       | 4.1                            | 16.9                    | 10                     | 0           | none              |
| structural-sort | 2    | 3        | 20.4                       | 4.3                            | 16.8                    | 10.1                   | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 17.1                       | 2.7                            | 16.8                    | 10.3                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 20.2                       | 4.7                            | 16.7                    | 10.3                   | 0           | none              |
| nested-freeform | 0.5  | 3        | 18.9                       | 4.3                            | 16.9                    | 10.4                   | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 17.1                       | 2.9                            | 16.8                    | 10.4                   | 0           | none              |
| nested-freeform | 1    | 2        | 19.2                       | 3.9                            | 17.1                    | 10.4                   | 0           | none              |
| nested-freeform | 1    | 3        | 21                         | 3.9                            | 17.1                    | 10.3                   | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 15.1                       | 2.7                            | 15.7                    | 10.4                   | 0           | none              |
| nested-freeform | 2    | 2        | 19.5                       | 4.7                            | 17                      | 10.3                   | 0           | none              |
| nested-freeform | 2    | 3        | 20.3                       | 4.5                            | 15.6                    | 10.3                   | 0           | none              |

## phase-1-idle-overlay-chrome — 2026-08-10T17:29:37.154Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### development

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 22.3                       | 22.3                           | 33.3                    | 10.4                   | 1           | none              |
| root-drag       | 0.5  | 2        | 21.9                       | 21.9                           | 25.1                    | 10.2                   | 0           | none              |
| root-drag       | 0.5  | 3        | 23                         | 23                             | 16.8                    | 10.4                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 18.6                       | 18.6                           | 16.6                    | 10.2                   | 0           | none              |
| root-drag       | 1    | 2        | 23.5                       | 23.4                           | 16.8                    | 16.7                   | 0           | none              |
| root-drag       | 1    | 3        | 22.4                       | 22.3                           | 16.6                    | 10.3                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 15.5                       | 15.4                           | 16.7                    | 18.1                   | 0           | none              |
| root-drag       | 2    | 2        | 23.3                       | 23.2                           | 24.9                    | 16.9                   | 0           | none              |
| root-drag       | 2    | 3        | 20.2                       | 20.1                           | 16.5                    | 18.4                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 28.3                       | 5.5                            | 33.3                    | 25.1                   | 1           | none              |
| structural-sort | 0.5  | 2        | 17.4                       | 6.1                            | 15.2                    | 17.6                   | 0           | none              |
| structural-sort | 0.5  | 3        | 21.7                       | 4.8                            | 25                      | 16.8                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 16.3                       | 3.7                            | 16.8                    | 16.6                   | 0           | none              |
| structural-sort | 1    | 2        | 21.8                       | 5.5                            | 24.9                    | 16.8                   | 0           | none              |
| structural-sort | 1    | 3        | 23.7                       | 5.8                            | 25                      | 16.7                   | 0           | none              |
| structural-sort | 2    | 1 (cold) | 20.4                       | 3.5                            | 24.9                    | 16.5                   | 0           | none              |
| structural-sort | 2    | 2        | 22.7                       | 6                              | 25                      | 17.6                   | 0           | none              |
| structural-sort | 2    | 3        | 21.8                       | 5.9                            | 25.2                    | 10.1                   | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 19.8                       | 3.9                            | 24.9                    | 16.8                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 23.4                       | 6.1                            | 26.3                    | 10.2                   | 0           | none              |
| nested-freeform | 0.5  | 3        | 24.2                       | 5.6                            | 33.1                    | 16.7                   | 1           | none              |
| nested-freeform | 1    | 1 (cold) | 18                         | 3.8                            | 24.7                    | 25.1                   | 0           | none              |
| nested-freeform | 1    | 2        | 19.6                       | 6.8                            | 16                      | 25                     | 0           | none              |
| nested-freeform | 1    | 3        | 19.6                       | 3.4                            | 17.4                    | 25                     | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 20.1                       | 3.8                            | 24.8                    | 25                     | 0           | none              |
| nested-freeform | 2    | 2        | 22.7                       | 5.8                            | 24.9                    | 24.9                   | 0           | none              |
| nested-freeform | 2    | 3        | 22.1                       | 5.6                            | 25                      | 16.7                   | 0           | none              |

## phase-1-idle-overlay-chrome — 2026-08-10T17:31:12.775Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per zoom.

### production

| Scenario        | Zoom | Pass     | Pointer-down handlers (ms) | First mutation after down (ms) | Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |
| --------------- | ---- | -------- | -------------------------- | ------------------------------ | ----------------------- | ---------------------- | ----------- | ----------------- |
| root-drag       | 0.5  | 1 (cold) | 9.7                        | 9.6                            | 25                      | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 2        | 7.2                        | 7.1                            | 8.5                     | 10.3                   | 0           | none              |
| root-drag       | 0.5  | 3        | 8                          | 8                              | 8.4                     | 10.2                   | 0           | none              |
| root-drag       | 1    | 1 (cold) | 6.4                        | 6.3                            | 9.8                     | 10.3                   | 0           | none              |
| root-drag       | 1    | 2        | 10.1                       | 10                             | 8.4                     | 10.2                   | 0           | none              |
| root-drag       | 1    | 3        | 8.2                        | 8.2                            | 10                      | 10.2                   | 0           | none              |
| root-drag       | 2    | 1 (cold) | 6.6                        | 6.5                            | 8.4                     | 10.2                   | 0           | none              |
| root-drag       | 2    | 2        | 9.3                        | 9.3                            | 8.5                     | 10.3                   | 0           | none              |
| root-drag       | 2    | 3        | 7.8                        | 7.7                            | 8.8                     | 10.3                   | 0           | none              |
| structural-sort | 0.5  | 1 (cold) | 27                         | 4                              | 25                      | 16.7                   | 0           | none              |
| structural-sort | 0.5  | 2        | 19                         | 4.3                            | 16.8                    | 16.7                   | 0           | none              |
| structural-sort | 0.5  | 3        | 17.7                       | 3.3                            | 16.3                    | 10.4                   | 0           | none              |
| structural-sort | 1    | 1 (cold) | 13.9                       | 2.9                            | 16.6                    | 10.3                   | 0           | none              |
| structural-sort | 1    | 2        | 21.1                       | 4.1                            | 16.7                    | 10.2                   | 0           | none              |
| structural-sort | 1    | 3        | 17.1                       | 3.1                            | 16                      | 10.2                   | 0           | none              |
| structural-sort | 2    | 1 (cold) | 16.5                       | 2.8                            | 16.7                    | 10                     | 0           | none              |
| structural-sort | 2    | 2        | 16.3                       | 2.4                            | 8.8                     | 10.1                   | 0           | none              |
| structural-sort | 2    | 3        | 19.7                       | 4.9                            | 16.5                    | 10                     | 0           | none              |
| nested-freeform | 0.5  | 1 (cold) | 16.5                       | 2.7                            | 16.6                    | 10.3                   | 0           | none              |
| nested-freeform | 0.5  | 2        | 17.3                       | 2.3                            | 16.6                    | 10                     | 0           | none              |
| nested-freeform | 0.5  | 3        | 17.7                       | 3.8                            | 15.1                    | 10.4                   | 0           | none              |
| nested-freeform | 1    | 1 (cold) | 15.7                       | 2.8                            | 17.6                    | 10.2                   | 0           | none              |
| nested-freeform | 1    | 2        | 19.2                       | 4.6                            | 16.7                    | 10.3                   | 0           | none              |
| nested-freeform | 1    | 3        | 19.3                       | 4.5                            | 16.5                    | 10.2                   | 0           | none              |
| nested-freeform | 2    | 1 (cold) | 16                         | 2.8                            | 16.3                    | 10.4                   | 0           | none              |
| nested-freeform | 2    | 2        | 18                         | 4.1                            | 17.6                    | 10.2                   | 0           | none              |
| nested-freeform | 2    | 3        | 19.8                       | 4.9                            | 15.6                    | 10.3                   | 0           | none              |
