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

## 2026-03-20 003

- Item: Re-test the settings benchmark with the machine idle to see whether the current-branch paint spike was environmental noise.
- Status: `done`
- Details:
  - Browser / tooling:
    - Chrome DevTools MCP only
    - same `ai.sh` Chrome instance
    - detached baseline server restarted from `/private/tmp/setta-top-level-grid-bf6487690`
  - Fresh current trace:
    - `perf/reports/frontend/artifacts/2026-03-20_section-top-level-grid-benchmark/current-head-settings-grid-benchmark-idle-rerun.trace.json`
    - URL: `http://127.0.0.1:3011/settings`
  - Fresh baseline save:
    - attempted, but the DevTools trace recorder wedged after the first retest pair
    - the fresh baseline trace did not persist to disk even though the page replay completed
    - the earlier authoritative baseline trace remains the comparison anchor
  - Geometry / replay notes:
    - both tabs still normalized to `translate(637.65px, -204.6px) scale(0.1)`
    - both tabs still started from the same visible `groupSectionDefault` geometry around `55.7px x 35.2px`
    - no-trace geometry probes showed `bf6487690` still reached the `73.7px` target width with an `18px` synthetic drag
    - current `HEAD` needed a `72px` synthetic drag to reach the same `73.7px` visible width
  - Fresh current paint totals, using the same trace-event parser between user timing marks:
    - benchmark `Paint`: `246.521ms`
    - pan `Paint`: `154.612ms`
    - zoom `Paint`: `62.849ms`
    - resize `Paint`: `29.060ms`
  - Current-vs-current read:
    - benchmark `Paint` improved from `309.010ms` to `246.521ms` (`-20.2%`)
    - pan `Paint` improved from `191.542ms` to `154.612ms` (`-19.3%`)
    - zoom `Paint` improved from `92.499ms` to `62.849ms` (`-32.1%`)
  - Interpretation:
    - some of the earlier paint spike was likely machine-noise or transient background work
    - the paint regression did not disappear
    - even the idle rerun leaves current `HEAD` far above the earlier baseline paint profile, especially in pan and zoom
- Next action:
  - treat the paint regression as real unless a fully fresh geometry-matched baseline rerun disproves it after a DevTools recorder reset.

## 2026-03-20 004

- Item: Save the settings top-level grid benchmark replay and trace summary flow as checked-in scripts.
- Status: `done`
- Details:
  - Added reusable replay helper:
    - `perf/scripts/settingsTopLevelGridBenchmarkReplay.js`
    - exports the exact browser-side replay function and prints it when run with `node`
  - Added reusable trace summarizer:
    - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
    - parses the `section-grid-*` user timing marks and sums the same trace-event totals used in the report
  - Replay semantics now explicitly include:
    - a full horizontal sweep across the project width at a zoomed-in pan scale
    - a reset
    - a full vertical sweep across the project height at the same pan scale
    - a fit-to-project to detail zoom pass
    - a smaller detail zoom pulse
    - a calibrated resize pass on `groupSectionDefault`
  - Browser smoke run:
    - executed the saved replay helper on `http://127.0.0.1:3011/settings`
    - confirmed `section-grid-horizontal-pan-*`, `section-grid-vertical-pan-*`, `section-grid-full-zoom-*`, `section-grid-detail-zoom-*`, and `section-grid-resize-*` marks all fired
    - confirmed the vertical sweep no longer collapsed at fit scale
- Next action:
  - use the saved replay helper for the next fresh current-vs-`bf6487690` trace pair instead of pasting ad hoc benchmark code from chat history.
