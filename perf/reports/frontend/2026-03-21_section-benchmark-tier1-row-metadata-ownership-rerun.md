# Section Benchmark Tier 1 Row Metadata Ownership Rerun

Date: `2026-03-21`

Question:

- Does moving row name/tooltip ownership upward into `ParamSwitch`, while making `ParamContainer` and `ParamTextLabel` render-only, reduce the always-mounted Tier 1 row cost enough to keep as a retained simplification?

Implementation under test:

- Experimental change under test:
  - resolve the row display name in `ParamSwitch`
  - pass tooltip title/content into `ParamContainer` instead of letting it re-subscribe to project state
  - make `ParamTextLabel` render the provided label text instead of re-subscribing
  - keep `.section-param-row`, `.section-key`, and `.section-value` geometry unchanged
- Experimental files under test:
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx`
  - focused tests:
    - `frontend/src/components/Params/ParamContainer.test.tsx`
    - `frontend/src/components/Params/ParamItems/ParamTextLabel.test.tsx`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-tier1-row-metadata-ownership-rerun`
- recalibrated retained baseline for comparison:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-retained-baseline-rerun`

Method:

- Same reusable benchmark runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same canonical scene pair:
  - `settings` on the authoritative `All Settings` view
  - `tier1Synthetic`
- Same browser/frontend pair used for the reruns:
  - worktree browser CDP `http://127.0.0.1:9233`
  - worktree frontend `http://127.0.0.1:3011`
  - untouched `main` browser CDP `http://127.0.0.1:9309`
  - untouched `main` frontend `http://127.0.0.1:3087`
- Reinstalled `tier1Synthetic` into both state roots immediately before the rerun:
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root ../setta/setta_files_dev`
- Focused automated verification while the experiment was live:
  - `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Params/ParamItems/ParamTextLabel.test.tsx`
    - `2` files passed
    - `2` tests passed
- Filtered typecheck while the experiment was live:
  - `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "ParamContainer\\.tsx|ParamTextLabel\\.tsx|ParamSwitch\\.tsx"`
  - no matching diagnostics were emitted during the filtered check
- Fresh subagent CDP check while the experiment was live:
  - `http://127.0.0.1:3011/settings`
  - `http://127.0.0.1:3011/benchmark-tier1`
  - both routes loaded successfully at normal zoom
  - no obvious row or label layout breakage was visible in the snapshot inspection

Paired benchmark totals versus the recalibrated retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | recalibrated retained baseline | `436.851` | `31132.744` | `493.197` |
| `settings` | worktree experiment | `422.064` | `30311.332` | `484.959` |
| `settings` | untouched `main` | `88.967` | `33616.295` | `560.207` |
| `tier1Synthetic` | recalibrated retained baseline | `749.086` | `14593.848` | `20.243` |
| `tier1Synthetic` | worktree experiment | `723.553` | `14227.327` | `18.925` |
| `tier1Synthetic` | untouched `main` | `14.608` | `15428.033` | `21.569` |

Authoritative worktree deltas versus the recalibrated retained baseline:

| Scene | Phase | Metric | Baseline | First rerun | Confirmation rerun | Confirmation delta |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `436.851` | `422.064` | `472.841` | `+35.990` |
| `settings` | benchmark | `RunTask` | `31132.744` | `30311.332` | `35644.759` | `+4512.015` |
| `settings` | benchmark | `UpdateLayoutTree` | `493.197` | `484.959` | `566.455` | `+73.258` |
| `settings` | overview horizontal pan slow | `Paint` | `38.267` | `38.241` | `42.246` | `+3.979` |
| `settings` | overview vertical pan slow | `Paint` | `61.247` | `57.526` | `67.545` | `+6.298` |
| `tier1Synthetic` | benchmark | `Paint` | `749.086` | `723.553` | `963.770` | `+214.684` |
| `tier1Synthetic` | benchmark | `RunTask` | `14593.848` | `14227.327` | `17968.749` | `+3374.901` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `20.243` | `18.925` | `396.144` | `+375.901` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `124.567` | `111.503` | `232.891` | `+108.324` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `150.277` | `136.957` | `185.837` | `+35.560` |

Interpretation:

- The first paired matrix looked like a real win:
  - both canonical worktree scenes improved on `Paint`, `RunTask`, and `UpdateLayoutTree`
  - `settings` improved, not just the synthetic scene
- The same-code confirmation rerun did not hold that result:
  - `settings` moved back above the recalibrated retained baseline on every tracked benchmark metric
  - `tier1Synthetic` regressed very hard, especially on `UpdateLayoutTree` and overview-pan paint
- Strongest read:
  - broad row-metadata ownership relocation across all Tier 1 rows is too unstable to keep
  - even though the first pass reduced duplicated subscriptions in a plausible way, the confirmation rerun shows it can broaden work sharply on the real row path and catastrophically on the synthetic scene
  - that makes it another non-robust retained simplification rather than a dependable baseline improvement

Conclusion:

- Reject this row-metadata-ownership experiment as a keep for `HEAD`.
- Revert the experiment after recording the docs.
- Keep the directional finding:
  - the next Tier 1 cut should stay away from kwargs-shell trimming
  - but it also should not broaden ownership changes across every row at once
  - the next probe should be narrower and more specialized inside the existing row geometry, most likely a top-level non-CodeMirror `textLabelLeaf` fast path for specific switch/dropdown-heavy rows
