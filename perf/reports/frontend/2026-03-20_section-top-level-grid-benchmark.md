# Section Top-Level Grid Benchmark

Date: `2026-03-20`

Question:

- Compare current `HEAD` `189ba8211` against `bf6487690`, the last commit before the `sectionChrome` top-level grid removal series started.
- Use the dense settings canvas to decide whether removing the top-level section grid was actually worth it.

Authoritative traces:

- current `HEAD` rerun:
  - `perf/reports/frontend/artifacts/2026-03-20_section-top-level-grid-benchmark/current-head-settings-grid-benchmark-rerun.trace.json`
  - URL: `http://127.0.0.1:3011/settings`
- baseline `bf6487690`:
  - `perf/reports/frontend/artifacts/2026-03-20_section-top-level-grid-benchmark/bf6487690-settings-grid-benchmark.trace.json`
  - URL: `http://127.0.0.1:3211/settings`

Superseded artifact:

- `perf/reports/frontend/artifacts/2026-03-20_section-top-level-grid-benchmark/current-head-settings-grid-benchmark.trace.json`
  - captured before the `ai.sh` browser restart
  - kept for traceability, but not used for the final comparison

Method:

- Chrome DevTools MCP only, inside the `ai.sh` Chrome instance.
- The `bf6487690` dev instance ran from `/private/tmp/setta-top-level-grid-bf6487690`.
- The baseline instance used a copied snapshot of the current worktree `setta_files_dev` so both traces ran against the same settings data shape.
- Both pages were normalized to internal zoom `0.1` before replay.
- Both pages then used the same direct viewport transform seed:
  - `translate(637.65px, -204.6px) scale(0.1)`
- Replay marks:
  - `section-grid-benchmark-start`
  - `section-grid-pan-start` / `section-grid-pan-end`
  - `section-grid-zoom-start` / `section-grid-zoom-end`
  - `section-grid-resize-start` / `section-grid-resize-end`
  - `section-grid-benchmark-end`
- Replay steps:
  - pan out and back with `12 + 12` direct viewport transform frames
  - zoom in and out with `6 + 6` direct viewport transform frames around a fixed focal point
  - resize `groupSectionDefault` width out by `18` screen pixels, then back

Representative geometry check:

- Both traces started from the same visible `groupSectionDefault` shell geometry:
  - `x 697.65`
  - `y 131.40`
  - `width 55.2-55.7`
  - `height 35.2`
- Both traces expanded the representative section to about `73.7px` width mid-replay and returned it to about `55.7px`.

Target-renderer totals from the marked benchmark window, in milliseconds:

| Branch | Window duration | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `bf6487690` | `6250.510` | `2649.507` | `253.680` | `26.373` | `16.939` | `5921.250` | `291.753` | `917.521` | `304.376` | `107.433` |
| current `HEAD` | `4760.681` | `1985.880` | `226.072` | `23.700` | `309.010` | `4415.200` | `251.512` | `714.382` | `221.834` | `95.750` |

Per-phase highlights:

- Pan:
  - `bf6487690`: `1838.541ms` window, `1742.261ms` `RunTask`, `4.702ms` `UpdateLayoutTree`, `0.000ms` `Paint`
  - current `HEAD`: `1345.703ms` window, `1253.324ms` `RunTask`, `2.819ms` `UpdateLayoutTree`, `191.542ms` `Paint`
- Zoom:
  - `bf6487690`: `963.645ms` window, `854.006ms` `RunTask`, `1.634ms` `UpdateLayoutTree`, `0.000ms` `Paint`
  - current `HEAD`: `754.840ms` window, `641.474ms` `RunTask`, `1.559ms` `UpdateLayoutTree`, `92.499ms` `Paint`
- Resize:
  - `bf6487690`: `3366.868ms` window, `2620.176ms` `FunctionCall`, `247.344ms` `UpdateLayoutTree`, `16.939ms` `Paint`
  - current `HEAD`: `2578.919ms` window, `1984.836ms` `FunctionCall`, `221.694ms` `UpdateLayoutTree`, `24.969ms` `Paint`

DevTools summary:

- `CLS 0.00` on both authoritative traces.
- Both traces surfaced `ForcedReflow`.

Interpretation:

- The current top-level `windowFlow` shell is materially faster on total interaction-window length:
  - benchmark window: `-1489.829ms` (`-23.8%`)
  - pan window: `-492.838ms` (`-26.8%`)
  - zoom window: `-208.805ms` (`-21.7%`)
  - resize window: `-787.949ms` (`-23.4%`)
- The current shell also wins on most of the heavier main-thread categories:
  - `FunctionCall`: `-663.627ms` overall (`-25.1%`)
  - `RunTask`: `-1506.050ms` overall (`-25.4%`)
  - `UpdateLayoutTree`: `-27.608ms` overall (`-10.9%`)
  - `EventDispatch`: `-40.241ms` overall (`-13.8%`)
  - `TimerFire`: `-203.139ms` overall (`-22.1%`)
  - `FireAnimationFrame`: `-82.542ms` overall (`-27.1%`)
  - `Commit`: `-11.683ms` overall (`-10.9%`)
- But the current shell also shows a clear paint regression:
  - overall `Paint`: `309.010ms` vs `16.939ms`
  - pan `Paint`: `191.542ms` vs `0.000ms`
  - zoom `Paint`: `92.499ms` vs `0.000ms`
  - resize `Paint`: `24.969ms` vs `16.939ms`

Conclusion:

- This benchmark does not support a simple “revert immediately” read.
- The current top-level shell reduces overall main-thread time and shortens the representative settings pan/zoom/resize windows by roughly `22-26%`.
- But the win is not clean:
  - the old grid shell stays much cheaper in `Paint`
  - the current shell appears to trade less scripting / invalidation work for more raster work during pan and zoom
- Practical read:
  - the top-level removal is not a clear enough slam-dunk to justify continuing that direction aggressively
  - nested one-cell grid removal still looks like the higher-confidence cleanup
  - if the team wants to keep the top-level `windowFlow` direction, the next question is no longer “is it faster overall?” but “why did `Paint` get so much worse?”
