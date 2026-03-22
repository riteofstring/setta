# Section Benchmark Tier 1 Motion Secondary Chrome Rerun

Date: `2026-03-21`

Question:

- Does trimming inactive Tier 1 secondary section chrome during viewport motion help the real `settings` route without hurting the canonical `tier1Synthetic` scene?

Implementation under test:

- Experimental change under test:
  - add a shared `shouldTrimSectionSecondaryChromeOnInteraction` policy alongside the existing section body mode policy
  - apply that policy only to inactive canvas-owned Tier 1 dense-param sections while `viewportInteractionActive` is true
  - trim secondary header chrome by withholding:
    - section window toggle
    - lock
    - minimize
    - delete
  - trim the Tier 1 kwargs strip by withholding the repeated action-button cluster while keeping the filter input live
- Experimental files under test:
  - `frontend/src/components/Section/Container/sectionBodyModePolicy.ts`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - `frontend/src/components/Section/Layouts/Tier1DenseParamSectionBody.tsx`
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - focused tests:
    - `frontend/src/components/Section/Container/sectionBodyModePolicy.test.ts`
    - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
    - `frontend/src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-tier1-motion-secondary-chrome-rerun`
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
- Scene fixtures were reinstalled into both repos before tracing:
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root ../setta/setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root ../setta/setta_files_dev`
- Same browser/frontend pair used for the reruns:
  - worktree browser CDP `http://127.0.0.1:9233`
  - worktree frontend `http://127.0.0.1:3011`
  - untouched `main` browser CDP `http://127.0.0.1:9309`
  - untouched `main` frontend `http://127.0.0.1:3087`
- Focused automated verification while the experiment was live:
  - `pnpm -C frontend exec vitest run src/components/Section/Container/sectionBodyModePolicy.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx`
    - `3` files passed
    - `22` tests passed
- Filtered typecheck after the experiment:
  - `pnpm -C frontend exec tsc --noEmit --pretty false > /tmp/setta-hybrid-rendering-tsc.log 2>&1; rg "SectionContainerCoreResizabe|Tier1DenseParamSectionBody|KwargsControls|sectionBodyModePolicy" /tmp/setta-hybrid-rendering-tsc.log || true`
  - no new diagnostics in the touched files
  - the only remaining filtered hits were pre-existing baseline diagnostics in `frontend/src/components/Section/SectionParts/getKwargsControlsRenderModel.test.ts`
- Fresh subagent CDP check while the experiment was live:
  - `http://127.0.0.1:3011/settings`
  - chrome-devtools MCP was accessible
  - the live steady-state page showed the full section chrome with no obvious visual regression
  - the transient motion-state disappearance was not conclusively captured in the snapshot, which is consistent with this being a motion-only trim

Why this seam was chosen:

- Fresh live CDP inspection moved the hotspot read away from switch/dropdown host ownership and toward repeated section-card chrome:
  - `46` repeated section toolbars
  - `46` repeated args panels
  - the same 9-control chrome repeated on every visible dense section
- That made inactive motion-time secondary chrome trimming the first credible experiment on the repeated section-card/header/kwargs path without touching the row/value host seam again.

Paired benchmark totals versus the retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | retained baseline | `148.513` | `3267.777` | `68.701` |
| `settings` | worktree experiment | `403.833` | `28122.714` | `269.027` |
| `settings` | untouched `main` | `64.811` | `25687.139` | `270.204` |
| `tier1Synthetic` | retained baseline | `853.807` | `13243.181` | `19.763` |
| `tier1Synthetic` | worktree experiment | `706.819` | `14375.232` | `23.420` |
| `tier1Synthetic` | untouched `main` | `16.052` | `13676.102` | `19.561` |

Authoritative worktree deltas versus the retained baseline:

| Scene | Phase | Metric | Before | First rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.513` | `403.833` | `+255.320` |
| `settings` | benchmark | `RunTask` | `3267.777` | `28122.714` | `+24854.937` |
| `settings` | benchmark | `UpdateLayoutTree` | `68.701` | `269.027` | `+200.326` |
| `settings` | overview horizontal pan slow | `Paint` | `28.305` | `36.613` | `+8.308` |
| `settings` | overview vertical pan slow | `Paint` | `27.086` | `57.157` | `+30.071` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.843` | `16.360` | `+7.517` |
| `settings` | detail-to-overview zoom slow | `Paint` | `9.104` | `22.815` | `+13.711` |
| `tier1Synthetic` | benchmark | `Paint` | `853.807` | `706.819` | `-146.988` |
| `tier1Synthetic` | benchmark | `RunTask` | `13243.181` | `14375.232` | `+1132.051` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `19.763` | `23.420` | `+3.657` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `147.659` | `123.046` | `-24.613` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `175.256` | `133.950` | `-41.306` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `42.281` | `35.206` | `-7.075` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `42.778` | `38.001` | `-4.777` |

Interpretation:

- This experiment splits the same way several earlier dead ends did, but more clearly at the scene level:
  - `tier1Synthetic` likes the reduced motion-time paint surface
  - the mandatory real `settings` route gets dramatically worse in `Paint`, `RunTask`, and `UpdateLayoutTree`
- The likely mechanism read is stronger than the surface read:
  - the problem is not just whether repeated secondary chrome exists
  - conditional mounting and unmounting of that chrome at interaction start is itself too expensive for the real `settings` project
- The same-session untouched `main` `settings` rerun was much noisier than the older March 20 `main` baseline, so these `main` totals should be treated as session-local context rather than the primary decision input.
- That caveat does not rescue the experiment:
  - the worktree still regresses badly versus the retained worktree baseline
  - the worktree still remains far above same-session `main` on aggregate `settings` paint
- Strongest read:
  - do not keep this motion-time secondary chrome trim
  - do not spend another immediate pass on conditional React subtree toggling for repeated header/kwargs chrome
  - if the repeated section-card chrome path is revisited, it should use a mechanism that does not create large interaction-start mount/unmount churn

Conclusion:

- Reject this Tier 1 motion secondary chrome trim experiment as a keep for `HEAD`.
- Revert the in-flight code changes after recording the docs.
- Keep the directional finding:
  - the next pass can still mine the repeated section-card/header/args-body area
  - but it should do so through static DOM simplification or a cheaper representation, not by toggling secondary chrome subtrees on viewport interaction
