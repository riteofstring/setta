# Phase 0 Geometry-Index Baseline

This is append-only measurement evidence for the package-owned shared geometry index. It records
observed behavior; it does not introduce an arbitrary timing gate. Future entries should add a new
dated section and retain earlier results for comparison.

## 2026-08-08: all-depth geometry consumers

Command: `corepack pnpm perf:geometry`

Environment: Node 24.18.1, Darwin arm64.

Fixture: 2,000 measured frames comprising 200 roots with nine direct children each. The benchmark
runs 500 alternating partial/full marquee queries, 500 two-frame combined-bounds reads, and 1,000
incremental registration updates.

| Operation                         | Observed total |
| --------------------------------- | -------------: |
| Register 2,000 frames             |       2.522 ms |
| Run 500 all-frame marquee queries |      39.564 ms |
| Run 500 combined-bounds reads     |       0.852 ms |
| Apply 1,000 incremental updates   |       0.754 ms |

The run produced 3,000 subscription notifications: one for each initial registration and one for
each incremental update. Checksums (`72,065` marquee matches and `92,000` aggregate bounds height)
keep the measured work observable and make fixture drift apparent.

This baseline covers the framework-neutral index only. It does not claim browser render timing,
drag-frame timing, or a stable cross-machine budget. Later Phase 0 evidence still needs browser
render-count and high-frequency interaction measurements before the phase gate can close.
