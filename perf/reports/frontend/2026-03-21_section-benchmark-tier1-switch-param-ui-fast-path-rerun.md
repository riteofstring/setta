# Section Benchmark Tier 1 Switch Param UI Fast Path Rerun

Date: `2026-03-21`

Question:

- Does a specialized `ParamUI` fast path for `SwitchParam` leaf rows reduce the repeated non-CodeMirror Tier 1 row cost without changing the existing row geometry?

Implementation under test:

- Experimental change under test:
  - add a specialized `SwitchParam` path in `ParamUI`
  - avoid the generic `ParamUI` selector bundle and the text-field waiting hook for switch rows
  - keep the existing `.section-param-row`, `.section-key`, and `.section-value` geometry unchanged
- Experimental files under test:
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - `frontend/src/components/Params/ParamUIs/SwitchInput.tsx`
  - focused tests:
    - `frontend/src/components/Params/ParamUIs/SwitchInput.test.tsx`
    - `frontend/src/components/Params/ParamUIs/ParamUI.test.tsx`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-tier1-switch-param-ui-fast-path-rerun`
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
  - `pnpm -C frontend exec vitest run src/components/Params/ParamUIs/ParamUI.test.tsx src/components/Params/ParamUIs/SwitchInput.test.tsx`
    - `2` files passed
    - `3` tests passed
- Filtered typecheck while the experiment was live:
  - `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "ParamUI\\.tsx|SwitchInput\\.tsx"`
  - the only matching diagnostics left were the same pre-existing `ParamUI.tsx` baseline errors in the generic text/password paths, not in the new switch fast path
- Fresh subagent CDP check while the experiment was live:
  - `/benchmark-tier1` loaded normally at normal zoom and showed no obvious row, label, or switch layout breakage
  - `/settings` was reachable, but the subagent only saw the minimal shell (`Connected to server` plus `Home`) rather than a populated settings canvas, so visual validation there was not authoritative

Paired benchmark totals versus the recalibrated retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | recalibrated retained baseline | `436.851` | `31132.744` | `493.197` |
| `settings` | worktree experiment | `458.410` | `42324.104` | `538.338` |
| `settings` | untouched `main` | `81.222` | `31325.873` | `515.411` |
| `tier1Synthetic` | recalibrated retained baseline | `749.086` | `14593.848` | `20.243` |
| `tier1Synthetic` | worktree experiment | `740.056` | `15951.716` | `20.355` |
| `tier1Synthetic` | untouched `main` | `12.972` | `13995.101` | `17.809` |

Authoritative worktree deltas versus the recalibrated retained baseline:

| Scene | Phase | Metric | Baseline | First rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `436.851` | `458.410` | `+21.559` |
| `settings` | benchmark | `RunTask` | `31132.744` | `42324.104` | `+11191.360` |
| `settings` | benchmark | `UpdateLayoutTree` | `493.197` | `538.338` | `+45.141` |
| `settings` | overview horizontal pan slow | `Paint` | `38.267` | `44.611` | `+6.344` |
| `settings` | overview vertical pan slow | `Paint` | `61.247` | `61.147` | `-0.100` |
| `tier1Synthetic` | benchmark | `Paint` | `749.086` | `740.056` | `-9.030` |
| `tier1Synthetic` | benchmark | `RunTask` | `14593.848` | `15951.716` | `+1357.868` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `20.243` | `20.355` | `+0.112` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `124.567` | `121.159` | `-3.408` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `150.277` | `142.769` | `-7.508` |

Interpretation:

- This was not strong enough to justify a same-code confirmation rerun.
- The mandatory real `settings` target regressed immediately:
  - `Paint` went up
  - `RunTask` jumped sharply
  - `UpdateLayoutTree` also moved up
- The synthetic scene only showed a small paint improvement while still regressing `RunTask`, which is not enough to rescue the experiment.
- Strongest read:
  - a switch-only `ParamUI` fast path is too narrow to matter on the real `settings` row path
  - even that small specialization can still broaden work enough to make the real scene worse
  - the next narrow probe should not assume that “skip generic `ParamUI` work for switches” is the right Tier 1 mechanism

Conclusion:

- Reject this switch `ParamUI` fast-path experiment as a keep for `HEAD`.
- Revert the experiment after recording the docs.
- Keep the directional finding:
  - smaller specialized cuts are still the right scale
  - but the next candidate should not be switch-only `ParamUI` splitting
  - if the non-CodeMirror leaf path is mined again, it likely needs a different subtype or a different repeated mechanism than this switch fast path
