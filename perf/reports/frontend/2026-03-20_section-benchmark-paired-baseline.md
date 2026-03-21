# Section Benchmark Paired Baseline

Date: `2026-03-20`

Question:

- Establish the first standardized paired baseline for the hybrid-rendering plan on:
  - untouched `main`
  - `frontend-performance-11-hybrid-rendering`
- Use the same checked-in benchmark scenes and the same CDP replay flow for both runs.

Scenes:

- `settings`
  - route: `/settings`
  - storage kind: `settings_project`
  - benchmark target: `backendArgs`
- `tier1Synthetic`
  - route: `/benchmark-tier1`
  - storage kind: `main_project_config`
  - benchmark target: `callable_00`

Authoritative artifacts:

- worktree:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-paired-baseline/worktree-settings.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-paired-baseline/worktree-settings.summary.json`
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-paired-baseline/worktree-tier1.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-paired-baseline/worktree-tier1.summary.json`
- untouched `main`:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-paired-baseline/main-settings.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-paired-baseline/main-settings.summary.json`
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-paired-baseline/main-tier1.trace.json`
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-paired-baseline/main-tier1.summary.json`

Method:

- Canonical scenes were installed into both live state roots with:
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root <state-root>`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root <state-root>`
- Reusable CDP runner:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
- Reusable replay helper:
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
- Reusable trace summarizer:
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Live ports during this paired run:
  - worktree:
    - frontend `http://127.0.0.1:3012`
    - backend `http://127.0.0.1:8012`
    - CDP `http://127.0.0.1:9234`
  - untouched `main`:
    - frontend `http://127.0.0.1:3087`
    - backend `http://127.0.0.1:8087`
    - CDP `http://127.0.0.1:9309`
- The `settings` target was corrected from `groupSectionDefault` to `backendArgs` for this standardized run because `/settings` starts in the `Core` view mode, and `groupSectionDefault` is not visible on the initial canvas.

Target-renderer totals from the full marked benchmark window, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `17982.578` | `7.767` | `80.137` | `3846.496` | `57.106` |
| `settings` | worktree | `18033.228` | `619.310` | `69.458` | `3828.264` | `59.615` |
| `tier1Synthetic` | untouched `main` | `17416.526` | `18.947` | `27.026` | `17799.621` | `164.355` |
| `tier1Synthetic` | worktree | `20997.810` | `1533.374` | `20.319` | `22296.154` | `135.901` |

Per-phase highlights:

- `settings` overview horizontal pan slow:
  - untouched `main`: `1999.216ms` window, `0.000ms` `Paint`, `3.130ms` `UpdateLayoutTree`, `427.636ms` `RunTask`
  - worktree: `2001.970ms` window, `118.025ms` `Paint`, `2.214ms` `UpdateLayoutTree`, `505.019ms` `RunTask`
- `settings` overview vertical pan slow:
  - untouched `main`: `1998.321ms` window, `0.000ms` `Paint`, `3.495ms` `UpdateLayoutTree`, `470.881ms` `RunTask`
  - worktree: `1999.299ms` window, `121.345ms` `Paint`, `2.297ms` `UpdateLayoutTree`, `535.944ms` `RunTask`
- `settings` overview-to-detail zoom slow:
  - untouched `main`: `599.965ms` window, `0.000ms` `Paint`
  - worktree: `600.277ms` window, `24.234ms` `Paint`
- `tier1Synthetic` overview horizontal pan slow:
  - untouched `main`: `2053.920ms` window, `0.000ms` `Paint`, `5.438ms` `UpdateLayoutTree`, `3346.270ms` `RunTask`
  - worktree: `3131.964ms` window, `313.508ms` `Paint`, `3.844ms` `UpdateLayoutTree`, `4717.871ms` `RunTask`
- `tier1Synthetic` overview vertical pan slow:
  - untouched `main`: `2014.254ms` window, `0.000ms` `Paint`, `5.729ms` `UpdateLayoutTree`, `3275.802ms` `RunTask`
  - worktree: `3075.859ms` window, `323.234ms` `Paint`, `4.191ms` `UpdateLayoutTree`, `4564.534ms` `RunTask`
- `tier1Synthetic` overview-to-detail zoom slow:
  - untouched `main`: `648.071ms` window, `5.603ms` `Paint`
  - worktree: `683.330ms` window, `76.156ms` `Paint`

Interpretation:

- The standardized paired baseline reproduces the original diagnosis cleanly:
  - the worktree regression is overwhelmingly paint-heavy
  - `UpdateLayoutTree` is not the leading delta in either scene
- `settings` remains the strongest evidence:
  - worktree full-window `Paint` is `619.310ms` versus `7.767ms` on untouched `main`
  - the slow overview pans alone add roughly `118-121ms` of paint on the worktree while untouched `main` stays at `0ms`
- The new Tier 1 synthetic scene shows the same pattern at higher density:
  - worktree full-window `Paint` is `1533.374ms` versus `18.947ms` on untouched `main`
  - the slow overview pans add roughly `313-323ms` of paint on the worktree while untouched `main` again stays at `0ms`
- This baseline is strong enough to justify the next implementation step:
  - selectively restore the shared top-level shell toward the `bf6487690` grid-era behavior
  - keep the later lower-level body flattening intact
  - re-measure the same paired matrix before moving on to LOD work
