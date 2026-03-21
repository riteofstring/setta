# Section Benchmark Tier 1 Leaf Grid Text Value Rerun

Date: `2026-03-20`

Question:

- Does restoring the old explicit leaf-row grid contract for dense `textLabelLeaf` rows recover enough paint performance to keep as the next Tier 1 checkpoint after the shared area-level handle win?

Implementation under test:

- Experimental change under test:
  - restore an explicit grid row shell for top-level `textLabelLeaf` rows in:
    - `frontend/src/components/Params/ParamContainer.tsx`
  - restore direct grid-child text value roots for that leaf-row path in:
    - `frontend/src/components/Params/ParamItems/ParamInput.tsx`
    - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - add focused regression coverage for the new leaf-row path in:
    - `frontend/src/components/Params/ParamContainer.test.tsx`
- Intended structural effect:
  - move dense text leaf rows back toward the faster `main` row contract
  - make the inactive text/code dummy root a direct grid child again instead of living under the newer `.section-value` wrapper
  - keep the current nested/parent row path unchanged

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-leaf-grid-text-value-rerun`
- retained baseline for comparison:
  - same-harness baseline control captured by temporarily stashing only the in-flight experiment files and rerunning:
    - `baseline-worktree-settings.*`
    - `baseline-worktree-tier1.*`

Method:

- Same reusable benchmark runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same canonical scene pair:
  - `settings` on the authoritative `All Settings` view
  - `tier1Synthetic`
- Same browser connection used for the paired reruns:
  - browser CDP `http://127.0.0.1:9234`
  - worktree frontend `http://127.0.0.1:3012`
  - untouched `main` frontend `http://127.0.0.1:3087`
- Validation before the reruns:
  - `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Params/GroupContainer.test.tsx src/components/Params/ParamColumnResizeHandle.test.tsx`
    - `7` files passed
    - `20` tests passed
- Filtered `tsc` still reported the same longstanding baseline diagnostics in this seam; it was not treated as the acceptance gate for this checkpoint.

Live structural sanity:

- On the worktree `All Settings` page while the experiment was active:
  - sampled `aspectRatio` leaf row became:
    - label host `.section-key`
    - direct dummy value root `.section-value`
    - direct underline span `.section-value`
  - the row itself restored the explicit inline grid contract:
    - `grid-template-columns: minmax(min-content, var(--param-column-width, 200px)) 0.75rem minmax(0, 1fr)`
    - `grid-template-areas: "key center-gutter value"`
- Sampled live DOM counts on the worktree `All Settings` page changed from the retained baseline shape:
  - before:
    - total DOM nodes: `7929`
    - direct `.section-param-row > .section-value` wrappers: `682`
  - experimental:
    - total DOM nodes: `8611`
    - direct `.section-param-row > .section-value` wrappers: `0`
    - direct `ParamInput` roots carrying `section-value`: `468`
- This confirms the structural restore was real; the question is only whether the benchmark matrix justifies keeping it.

Initial paired rerun totals after restoring the leaf-row grid contract:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | retained baseline | `423.902` | `28886.001` | `278.567` |
| `settings` | worktree experiment | `312.551` | `29923.051` | `278.949` |
| `settings` | untouched `main` | `75.480` | `36168.704` | `332.237` |
| `tier1Synthetic` | retained baseline | `710.373` | `13974.591` | `19.059` |
| `tier1Synthetic` | worktree experiment | `773.594` | `14553.185` | `20.402` |
| `tier1Synthetic` | untouched `main` | `13.200` | `14215.307` | `20.601` |

Initial worktree deltas versus the retained baseline:

| Scene | Phase | Metric | Before | First rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `423.902` | `312.551` | `-111.351` |
| `settings` | benchmark | `RunTask` | `28886.001` | `29923.051` | `+1037.050` |
| `settings` | overview horizontal pan slow | `Paint` | `42.257` | `28.833` | `-13.424` |
| `settings` | overview vertical pan slow | `Paint` | `59.090` | `45.850` | `-13.240` |
| `settings` | overview-to-detail zoom slow | `Paint` | `16.084` | `11.977` | `-4.107` |
| `settings` | detail-to-overview zoom slow | `Paint` | `22.285` | `16.345` | `-5.940` |
| `tier1Synthetic` | benchmark | `Paint` | `710.373` | `773.594` | `+63.221` |
| `tier1Synthetic` | benchmark | `RunTask` | `13974.591` | `14553.185` | `+578.594` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `119.160` | `126.479` | `+7.319` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `135.277` | `144.563` | `+9.286` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `35.449` | `40.032` | `+4.583` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `37.697` | `44.219` | `+6.522` |

Confirmation reruns:

- `settings` was rerun sequentially and confirmed the same strong paint win:
  - benchmark `Paint`: `423.902 -> 313.774` (`-110.128`)
  - benchmark `RunTask`: `28886.001 -> 29858.162` (`+972.161`)
  - overview horizontal pan slow `Paint`: `42.257 -> 29.120` (`-13.137`)
  - overview vertical pan slow `Paint`: `59.090 -> 45.411` (`-13.679`)
  - overview-to-detail zoom slow `Paint`: `16.084 -> 11.901` (`-4.183`)
  - detail-to-overview zoom slow `Paint`: `22.285 -> 17.071` (`-5.214`)
- `tier1Synthetic` had one contaminated confirmation attempt caused by overlapping `Tracing.start`; that trace is not used for the decision.
- `tier1Synthetic` was then rerun sequentially and still regressed versus the retained baseline:
  - benchmark `Paint`: `710.373 -> 729.765` (`+19.392`)
  - benchmark `RunTask`: `13974.591 -> 14155.305` (`+180.714`)
  - benchmark `UpdateLayoutTree`: `19.059 -> 19.256` (`+0.197`)
  - overview horizontal pan slow `Paint`: `119.160 -> 121.089` (`+1.929`)
  - overview vertical pan slow `Paint`: `135.277 -> 143.412` (`+8.135`)
  - overview-to-detail zoom slow `Paint`: `35.449 -> 36.268` (`+0.819`)
  - detail-to-overview zoom slow `Paint`: `37.697 -> 39.440` (`+1.743`)

Interpretation:

- The row-contract restore is a real structural move back toward `main`, and it clearly helps the real `settings` target.
- It does not justify keeping as-is because the canonical `tier1Synthetic` scene still regresses after a clean sequential confirmation rerun.
- The regression is much smaller than the `settings` win, but it is still directionally wrong on the required Tier 1 synthetic benchmark.
- Strongest read:
  - the old leaf text grid contract is promising for the `settings` row family specifically
  - but restoring it globally for every dense `textLabelLeaf` row is too broad
  - the next attempt should narrow the row-contract restore to the section families or value variants that match the `settings` win, instead of applying it across the whole Tier 1 text leaf path in one step

Conclusion:

- Reject this broad Tier 1 leaf-grid text-value restore as a keep for `HEAD`.
- Revert the in-flight code changes after recording the docs.
- Keep the structural finding:
  - `main` and the worktree still differ materially in row-layout contract
  - that contract difference is worth revisiting in a narrower, scene-specific follow-up

Post-revert visual sanity:

- Fresh subagent CDP verification checked:
  - `http://127.0.0.1:3012/settings`
  - `http://127.0.0.1:3087/settings`
- Both pages were switched to `All Settings` before inspection.
- `groupSectionDefault` was present on both pages, and no obvious retained-baseline layout or alignment regression stood out in the current worktree versus untouched `main`.
