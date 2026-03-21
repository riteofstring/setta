# Section Benchmark Body-Host Rerun

Date: `2026-03-20`

Question:

- After landing the first body-host seam and the first sparse local-layout restores, does the standardized paired benchmark improve enough to keep this checkpoint as a performance win?

Implementation under test:

- Added the shared section body-host seam:
  - `frontend/src/components/Section/Container/SectionBodyGate.tsx`
- Added a shared Tier 1 dense-param body seam:
  - `frontend/src/components/Section/Layouts/Tier1DenseParamSectionBody.tsx`
- Rewired shared canvas/window body mount points through the new seam:
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
- Collapsed the common Tier 1 body stack into the new seam for:
  - `frontend/src/components/Section/Layouts/CallableArea.tsx`
  - `frontend/src/components/Section/Layouts/DictArea.tsx`
  - `frontend/src/components/Section/Layouts/GlobalVariablesArea.tsx`
- Restored sparse local body layouts toward the `bf6487690` model in:
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Section/Layouts/DrawArea/DrawArea.tsx`
  - `frontend/src/components/Section/Layouts/ChartArea/ChartArea.tsx`

Rollback status relative to `bf6487690`:

- local sparse restores landed for:
  - `BrowserArea`
  - `DrawArea`
  - `ChartArea`
- no extra rollback work is currently needed for:
  - `frontend/src/components/Section/Layouts/PromptArea.tsx`
  - `frontend/src/components/Section/Layouts/TextBlock.tsx`
  - their surrounding layout already matches the older baseline closely enough for this phase
- the shared body mount points intentionally remain on the new seam instead of rolling back:
  - `SectionContainerCoreResizabe.tsx`
  - `SectionWindowSurface.tsx`
- while keeping that seam, the canvas caller still preserves the old placeholder-before-minimize ordering for externally window-bound sections

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-body-host-rerun`
- previous checkpoint for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-shell-rollback-rerun`

Method:

- Same canonical scenes and same CDP replay flow as the earlier checkpoints:
  - `settings` targeting `backendArgs`
  - `tier1Synthetic` targeting `callable_00`
- Same reusable runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same live ports:
  - worktree:
    - frontend `http://127.0.0.1:3012`
    - CDP `http://127.0.0.1:9234`
  - untouched `main`:
    - frontend `http://127.0.0.1:3087`
    - CDP `http://127.0.0.1:9309`

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/BrowserArea.test.tsx`
  - `32` tests passed

Post-report rollback verification:

- restored the old canvas placeholder-before-minimize ordering in:
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
- added focused coverage for that caller-side rollback seam:
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- reran the same focused seam suite:
  - `32` tests passed

Benchmark-window totals after landing the body-host seam, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18081.892` | `8.325` | `84.000` | `3795.938` | `57.389` |
| `settings` | worktree | `18050.301` | `191.708` | `84.169` | `4104.878` | `62.850` |
| `tier1Synthetic` | untouched `main` | `23716.498` | `14.840` | `25.939` | `23600.429` | `140.234` |
| `tier1Synthetic` | worktree | `22482.263` | `1622.944` | `26.907` | `24125.292` | `144.751` |

Worktree deltas versus the shell-rollback checkpoint:

| Scene | Phase | Metric | Before | After | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `159.227` | `191.708` | `+32.481` |
| `settings` | benchmark | `UpdateLayoutTree` | `68.796` | `84.169` | `+15.373` |
| `settings` | overview horizontal pan slow | `Paint` | `29.623` | `35.846` | `+6.223` |
| `settings` | overview vertical pan slow | `Paint` | `28.612` | `35.513` | `+6.901` |
| `settings` | overview-to-detail zoom slow | `Paint` | `11.230` | `11.703` | `+0.473` |
| `settings` | detail-to-overview zoom slow | `Paint` | `9.795` | `13.766` | `+3.971` |
| `tier1Synthetic` | benchmark | `Paint` | `1433.618` | `1622.944` | `+189.326` |
| `tier1Synthetic` | benchmark | window duration | `17550.145` | `22482.263` | `+4932.118` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `280.745` | `358.991` | `+78.246` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `319.938` | `348.334` | `+28.396` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `61.551` | `65.677` | `+4.126` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `65.669` | `78.198` | `+12.529` |

Interpretation:

- this checkpoint is useful architecturally, but it is not a performance win
- `settings` regresses modestly versus the shell-only rollback checkpoint:
  - full-window `Paint` rises from `159.227ms` to `191.708ms`
  - both slow overview pans pick up another roughly `6-7ms` of paint
- `tier1Synthetic` regresses materially:
  - full-window `Paint` rises from `1433.618ms` to `1622.944ms`
  - the benchmark window lengthens by almost `5s`
  - overview slow-pan paint rises again in both axes
- the read is:
  - keep the shared body-host seam because it deepens the ownership boundary needed for the later LOD work
  - keep the sparse local restores because they are intentionally local and do not reopen shared body contracts
  - do not pretend this checkpoint improved motion performance
  - the next gains have to come from real render-mode behavior or deeper Tier 1 body-cost reduction, not from more seam-only refactoring

CDP visual sanity:

- DevTools pages opened successfully on:
  - `http://127.0.0.1:3012/settings`
  - `http://127.0.0.1:3087/settings`
- The worktree settings page loaded and remained navigable after the seam/restores:
  - overview visible
  - section shell intact
  - no auth collapse or route failure
- A targeted worktree screenshot was captured at:
  - `perf/tmp/worktree-settings-body-host-rerun.png`
- This was a settings-page shell/body sanity check only, not a full sparse-section pixel-comparison pass.

Conclusion:

- Keep the body-host seam.
- Keep the local sparse restores that already landed.
- Record this checkpoint as a structural prerequisite, not as a performance improvement.
- Move directly into the next planned work:
  - real body render-mode behavior
  - deeper Tier 1 active-body flattening
  - continued paired reruns on `settings` and `tier1Synthetic`
