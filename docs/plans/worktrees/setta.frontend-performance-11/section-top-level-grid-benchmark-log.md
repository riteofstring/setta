# Section Top-Level Grid Benchmark Log

Append-only log for comparing the current top-level section surface against the last pre-removal grid baseline.

## 2026-03-20 001

- Item: Initialize the top-level section grid benchmark plan and log.
- Status: `done`
- Details:
  - Benchmark question:
    - compare current `HEAD` `189ba8211` against `bf6487690`
    - determine whether top-level section grid removal was worth it
  - Measurement screen:
    - `/settings`
    - `All Settings`
  - Measurement loop:
    - pan forward/back
    - zoom in/out
    - resize one representative settings section out and back
  - Constraints:
    - use Chrome DevTools MCP only
    - use the existing Chrome browser windows
    - keep this log append-only
- Next action:
  - capture the current-commit settings benchmark traces before starting the `bf6487690` comparison worktree.

## 2026-03-20 002

- Item: Capture the authoritative current-vs-`bf6487690` settings benchmark pair and record the comparison.
- Status: `done`
- Details:
  - Browser / tooling:
    - Chrome DevTools MCP only
    - final comparison rerun captured after the `ai.sh` browser restart
  - Current trace used for the final comparison:
    - `perf/reports/frontend/artifacts/2026-03-20_section-top-level-grid-benchmark/current-head-settings-grid-benchmark-rerun.trace.json`
    - URL: `http://127.0.0.1:3011/settings`
  - Baseline trace:
    - `perf/reports/frontend/artifacts/2026-03-20_section-top-level-grid-benchmark/bf6487690-settings-grid-benchmark.trace.json`
    - URL: `http://127.0.0.1:3211/settings`
  - Baseline setup note:
    - the detached `bf6487690` worktree used a copied snapshot of the current worktree `setta_files_dev`
    - that avoided comparing against the tiny old default settings dataset
  - Viewport normalization:
    - both pages were normalized to internal zoom `0.1`
    - both pages replayed from `translate(637.65px, -204.6px) scale(0.1)`
  - Replay:
    - direct pan out/back
    - direct zoom in/out around a fixed focal point
    - width resize out/back on `groupSectionDefault`
  - Overall result:
    - current `HEAD` is faster on total benchmark-window time and most main-thread categories
    - current `HEAD` is much worse on `Paint`, especially during pan and zoom
  - Benchmark-window comparison:
    - duration: `4760.681ms` current vs `6250.510ms` baseline
    - `FunctionCall`: `1985.880ms` current vs `2649.507ms` baseline
    - `RunTask`: `4415.200ms` current vs `5921.250ms` baseline
    - `UpdateLayoutTree`: `226.072ms` current vs `253.680ms` baseline
    - `Paint`: `309.010ms` current vs `16.939ms` baseline
  - Report:
    - `perf/reports/frontend/2026-03-20_section-top-level-grid-benchmark.md`
- Next action:
  - use this benchmark pair to decide whether the `sectionChrome` top-level grid removal series should stay, be narrowed, or be rolled back to `bf6487690`.
