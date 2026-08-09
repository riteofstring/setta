# Large-document culling profile report

Append-only frame-pacing traces for the Setta-styled workspace UI plan, recorded by
`corepack pnpm perf:culling` against the public `/?culling-profile` playground route: a
deterministic 305-section document nested to three depths with viewport culling enabled and the
final package CSS. Each run measures sustained canvas pan through the fixture's vacant pan alley,
an Alt+wheel zoom-out/zoom-in sweep at the canvas center, an out-and-back wheel pan with the
focused "Pinned target" section held rendered far offscreen (focus pinning; a pointer pan would
move focus and release the pin), and a top-level drag of the "Drag target" section (active
pinning), in development and production builds. Pass 1 of pan,
pinned-pan, and drag cells is cold after navigation; every zoom-sweep pass renavigates so its
zoom always starts exactly at the declared level. Full per-pass traces, configuration, and
environment records live next to this file in `perf/interaction-traces/`. Numbers are
machine-local evidence, not portable CI thresholds.

## phase-4-culling — 2026-08-10T21:42:49.840Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per cell, 305 sections.

### development

| Scenario   | Zoom | Pass     | Sample    | Activation max gap (ms) | Sustained max gap (ms) | Max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms | Rendered before → after |
| ---------- | ---- | -------- | --------- | ----------------------- | ---------------------- | ------------ | ----------- | ----------------- | ----------------------- |
| pan        | 0.5  | 1 (cold) | gesture   | 24.9                    | 25.2                   | 25.2         | 0           | none              | 62 → 62                 |
| pan        | 0.5  | 2        | gesture   | 16.7                    | 41.6                   | 41.6         | 1           | none              | 62 → 62                 |
| pan        | 0.5  | 3        | gesture   | 25.2                    | 31.9                   | 31.9         | 0           | none              | 62 → 62                 |
| pan        | 1    | 1 (cold) | gesture   | 10.4                    | 10.2                   | 10.4         | 0           | none              | 14 → 14                 |
| pan        | 1    | 2        | gesture   | 9.9                     | 10.2                   | 10.2         | 0           | none              | 14 → 14                 |
| pan        | 1    | 3        | gesture   | 10.4                    | 10.4                   | 10.4         | 0           | none              | 14 → 14                 |
| zoom-sweep | 1    | 1 (cold) | sweep-out | n/a                     | n/a                    | 91.5         | 6           | 2 (max 74 ms)     | 14 → 209                |
| zoom-sweep | 1    | 1 (cold) | sweep-in  | n/a                     | n/a                    | 33.6         | 1           | none              | 209 → 14                |
| zoom-sweep | 1    | 2        | sweep-out | n/a                     | n/a                    | 91.7         | 6           | 1 (max 73 ms)     | 14 → 209                |
| zoom-sweep | 1    | 2        | sweep-in  | n/a                     | n/a                    | 25           | 0           | none              | 209 → 14                |
| zoom-sweep | 1    | 3        | sweep-out | n/a                     | n/a                    | 91.7         | 6           | 2 (max 76 ms)     | 14 → 209                |
| zoom-sweep | 1    | 3        | sweep-in  | n/a                     | n/a                    | 25.1         | 0           | none              | 209 → 14                |
| pinned-pan | 1    | 1 (cold) | wheel-pan | n/a                     | n/a                    | 24.9         | 0           | none              | 23 → 23                 |
| pinned-pan | 1    | 2        | wheel-pan | n/a                     | n/a                    | 16.5         | 0           | none              | 23 → 23                 |
| pinned-pan | 1    | 3        | wheel-pan | n/a                     | n/a                    | 25           | 0           | none              | 23 → 23                 |
| drag       | 0.5  | 1 (cold) | gesture   | 16.7                    | 9.1                    | 16.7         | 0           | none              | 64 → 64                 |
| drag       | 0.5  | 2        | gesture   | 17.5                    | 9.3                    | 17.5         | 0           | none              | 64 → 64                 |
| drag       | 0.5  | 3        | gesture   | 25.4                    | 9.4                    | 25.4         | 0           | none              | 64 → 64                 |
| drag       | 1    | 1 (cold) | gesture   | 16.7                    | 9.2                    | 16.7         | 0           | none              | 13 → 13                 |
| drag       | 1    | 2        | gesture   | 25                      | 9.3                    | 25           | 0           | none              | 13 → 13                 |
| drag       | 1    | 3        | gesture   | 17.6                    | 9.4                    | 17.6         | 0           | none              | 13 → 13                 |

## phase-4-culling — 2026-08-10T21:43:53.665Z

Environment: darwin arm64, 8 cores, Node v24.18.1, Playwright 1.62.1, CPU throttle 1x, 3 passes per cell, 305 sections.

### production

| Scenario   | Zoom | Pass     | Sample    | Activation max gap (ms) | Sustained max gap (ms) | Max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms | Rendered before → after |
| ---------- | ---- | -------- | --------- | ----------------------- | ---------------------- | ------------ | ----------- | ----------------- | ----------------------- |
| pan        | 0.5  | 1 (cold) | gesture   | 16.6                    | 16.7                   | 16.7         | 0           | none              | 62 → 62                 |
| pan        | 0.5  | 2        | gesture   | 9.1                     | 9.3                    | 9.3          | 0           | none              | 62 → 62                 |
| pan        | 0.5  | 3        | gesture   | 9                       | 9.2                    | 9.2          | 0           | none              | 62 → 62                 |
| pan        | 1    | 1 (cold) | gesture   | 8.8                     | 9.4                    | 9.4          | 0           | none              | 14 → 14                 |
| pan        | 1    | 2        | gesture   | 8.5                     | 9.2                    | 9.2          | 0           | none              | 14 → 14                 |
| pan        | 1    | 3        | gesture   | 9.3                     | 9.4                    | 9.4          | 0           | none              | 14 → 14                 |
| zoom-sweep | 1    | 1 (cold) | sweep-out | n/a                     | n/a                    | 33.3         | 1           | none              | 14 → 209                |
| zoom-sweep | 1    | 1 (cold) | sweep-in  | n/a                     | n/a                    | 15.8         | 0           | none              | 209 → 14                |
| zoom-sweep | 1    | 2        | sweep-out | n/a                     | n/a                    | 33.3         | 1           | none              | 14 → 209                |
| zoom-sweep | 1    | 2        | sweep-in  | n/a                     | n/a                    | 16.7         | 0           | none              | 209 → 14                |
| zoom-sweep | 1    | 3        | sweep-out | n/a                     | n/a                    | 33.4         | 1           | none              | 14 → 209                |
| zoom-sweep | 1    | 3        | sweep-in  | n/a                     | n/a                    | 16.7         | 0           | none              | 209 → 14                |
| pinned-pan | 1    | 1 (cold) | wheel-pan | n/a                     | n/a                    | 9.2          | 0           | none              | 23 → 23                 |
| pinned-pan | 1    | 2        | wheel-pan | n/a                     | n/a                    | 16.7         | 0           | none              | 23 → 23                 |
| pinned-pan | 1    | 3        | wheel-pan | n/a                     | n/a                    | 9.2          | 0           | none              | 23 → 23                 |
| drag       | 0.5  | 1 (cold) | gesture   | 17.2                    | 9.4                    | 17.2         | 0           | none              | 64 → 64                 |
| drag       | 0.5  | 2        | gesture   | 16.6                    | 9.3                    | 16.6         | 0           | none              | 64 → 64                 |
| drag       | 0.5  | 3        | gesture   | 8.8                     | 9.4                    | 9.4          | 0           | none              | 64 → 64                 |
| drag       | 1    | 1 (cold) | gesture   | 16.6                    | 16.6                   | 16.6         | 0           | none              | 13 → 13                 |
| drag       | 1    | 2        | gesture   | 17.5                    | 9.3                    | 17.5         | 0           | none              | 13 → 13                 |
| drag       | 1    | 3        | gesture   | 16.7                    | 9.3                    | 16.7         | 0           | none              | 13 → 13                 |
