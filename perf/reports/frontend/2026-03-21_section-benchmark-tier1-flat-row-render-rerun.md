# Section Benchmark Tier 1 Flat Row Render Rerun

Date: `2026-03-21`

Question:

- Does flattening the recursive Tier 1 param-row expansion into a precomputed render-entry list improve the dense row path without changing the row markup contract?

Implementation under test:

- Experimental change under test:
  - precompute a flat Tier 1 row render-entry list from the visible child map before render
  - remove the recursive child expansion from `ParamSwitch`
  - keep the rendered `<article>` row contract, row ids, and sibling ordering intact
- Experimental files under test:
  - `frontend/src/components/Params/ParamDndContext.tsx`
  - `frontend/src/components/Params/ParamDndList.tsx`
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/getParamDndListRenderModel.ts`
  - focused tests:
    - `frontend/src/components/Params/getParamDndListRenderModel.test.ts`
    - `frontend/src/components/Params/GroupContainer.test.tsx`
    - `frontend/src/components/Params/ParamContainer.test.tsx`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-tier1-flat-row-render-rerun`
- retained baseline for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-nested-guide-removal-rerun`

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
- Focused automated verification while the experiment was live:
  - `pnpm -C frontend exec vitest run src/components/Params/getParamDndListRenderModel.test.ts src/components/Params/GroupContainer.test.tsx src/components/Params/ParamContainer.test.tsx`
    - `3` files passed
    - `15` tests passed
- Filtered typecheck while the experiment was live:
  - `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "src/components/Params/(ParamDndContext|ParamDndList|ParamSwitch|getParamDndListRenderModel\\.ts)"`
  - exact-optional diagnostics were still present in `frontend/src/components/Params/ParamSwitch.tsx`
  - the experiment was rejected before spending another pass on those live-only diagnostics
- Fresh subagent CDP check while the experiment was live:
  - `http://127.0.0.1:3011/settings`
  - `http://127.0.0.1:3011/benchmark-tier1`
  - repeated Tier 1 rows still rendered in a flat sibling sequence
  - no obvious normal-zoom row-stack regression was visible on either route

Why this seam was chosen:

- Fresh seam discovery moved the next Tier 1 target into the always-mounted dense row path:
  - repeated ownership was still split across:
    - `ParamDndList`
    - `ParamSwitch`
    - `ParamContainer`
    - `ParamRowShell`
  - that made row expansion the strongest next static seam after the header/kwargs motion-toggle dead end
- The narrowest first experiment was:
  - flatten expansion before render
  - keep the DOM contract unchanged
  - avoid touching value-host widgets, CodeMirror, or motion-time toggles

Paired benchmark totals versus the retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | retained baseline | `148.513` | `3267.777` | `68.701` |
| `settings` | worktree experiment | `515.349` | `33790.741` | `530.598` |
| `settings` | untouched `main` | `93.644` | `37442.585` | `575.173` |
| `tier1Synthetic` | retained baseline | `853.807` | `13243.181` | `19.763` |
| `tier1Synthetic` | worktree experiment | `882.828` | `22976.333` | `25.850` |
| `tier1Synthetic` | untouched `main` | `14.819` | `22601.723` | `27.643` |

Authoritative worktree deltas versus the retained baseline:

| Scene | Phase | Metric | Before | First rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.513` | `515.349` | `+366.836` |
| `settings` | benchmark | `RunTask` | `3267.777` | `33790.741` | `+30522.964` |
| `settings` | benchmark | `UpdateLayoutTree` | `68.701` | `530.598` | `+461.897` |
| `settings` | overview horizontal pan slow | `Paint` | `28.305` | `47.829` | `+19.524` |
| `settings` | overview vertical pan slow | `Paint` | `27.086` | `70.376` | `+43.290` |
| `tier1Synthetic` | benchmark | `Paint` | `853.807` | `882.828` | `+29.021` |
| `tier1Synthetic` | benchmark | `RunTask` | `13243.181` | `22976.333` | `+9733.152` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `19.763` | `25.850` | `+6.087` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `147.659` | `164.104` | `+16.445` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `175.256` | `180.970` | `+5.714` |

Interpretation:

- The visible DOM contract staying stable did not translate into a cheaper motion path.
- The regression is broad, not scene-specific:
  - the mandatory real `settings` benchmark regressed severely
  - the canonical `tier1Synthetic` scene also regressed
- Strongest read:
  - moving the row expansion work up-front into a precomputed render-entry list increased aggregate work instead of reducing it
  - this specific flattening mechanism is the wrong first step for the Tier 1 row seam
  - the row seam may still matter architecturally, but not through this eager render-entry expansion path

Conclusion:

- Reject this Tier 1 flat row render experiment as a keep for `HEAD`.
- Revert the experiment after recording the docs.
- Keep the directional finding:
  - the next Tier 1 pass should stay away from broad render-entry precomputation
  - if the dense row seam is mined again, it should use a narrower static deletion or ownership simplification that does not broaden paint and task costs across the whole row stack
