# Section Benchmark Tier 1 Code Leaf Grid Rerun

Date: `2026-03-20`

Question:

- Does narrowing the old explicit leaf-row grid/value contract to only top-level `CodeParam` leaves recover the earlier `settings` win without regressing the canonical `tier1Synthetic` scene?

Implementation under test:

- Experimental change under test:
  - restore an explicit grid leaf-row shell only for top-level `CodeParam` rows in:
    - `frontend/src/components/Params/ParamContainer.tsx`
  - restore direct grid-child code value roots for that narrow path in:
    - `frontend/src/components/Params/ParamItems/ParamInput.tsx`
    - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - add focused coverage for the narrow code-leaf path in:
    - `frontend/src/components/Params/ParamContainer.test.tsx`
- Intended structural effect:
  - keep the broad `textLabelLeaf` restore rejected
  - mine the promising untouched-`main` row contract only where it looked most likely to matter next
  - test whether the code-leaf subset is the part of the row contract that can help without spilling regressions onto the rest of Tier 1

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-code-leaf-grid-rerun`
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
- Focused validation while the experiment was live:
  - `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx`
    - `5` files passed
    - `10` tests passed

Live structural sanity:

- Fresh subagent CDP inspection of the live worktree `settings` page confirmed the page was rendering the expanded `All Settings` canvas rather than a blank fallback.
- No obvious overlap, clipping, or broken alignment was visible in the inspected viewport while the experiment was active.
- The visible page still read as a heavy loading/initial-state screen with a large gray canvas area and centered spinner, which fits the benchmark regression rather than contradicting it.

Paired benchmark totals versus the retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | retained baseline | `148.237` | `3235.187` | `66.774` |
| `settings` | worktree experiment | `362.208` | `29726.330` | `564.553` |
| `settings` | untouched `main` | `67.129` | `26396.928` | `269.229` |
| `tier1Synthetic` | retained baseline | `825.999` | `13271.540` | `18.282` |
| `tier1Synthetic` | worktree experiment | `682.091` | `13277.829` | `17.274` |
| `tier1Synthetic` | untouched `main` | `16.610` | `18087.059` | `24.533` |

Authoritative worktree deltas versus the retained baseline:

| Scene | Phase | Metric | Before | First rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `362.208` | `+213.971` |
| `settings` | benchmark | `RunTask` | `3235.187` | `29726.330` | `+26491.143` |
| `settings` | benchmark | `UpdateLayoutTree` | `66.774` | `564.553` | `+497.779` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `53.392` | `+25.003` |
| `settings` | overview horizontal pan slow | `RunTask` | `392.838` | `4913.851` | `+4521.013` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `47.864` | `+20.708` |
| `settings` | overview vertical pan slow | `RunTask` | `399.964` | `3660.289` | `+3260.325` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `11.623` | `+2.827` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `18.018` | `+9.110` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `682.091` | `-143.908` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `13277.829` | `+6.289` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `18.282` | `17.274` | `-1.008` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `116.784` | `-29.173` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `131.181` | `-28.264` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `33.958` | `-6.571` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `37.232` | `-6.102` |

Interpretation:

- This narrow code-only restore flips the broad-restore result in the wrong direction:
  - it helps the synthetic Tier 1 scene materially
  - but it makes the real `settings` target catastrophically worse
- The `settings` regression is too large to treat as noise:
  - aggregate `Paint`, `RunTask`, and `UpdateLayoutTree` all jump by order-of-magnitude amounts
  - every representative slow pan/zoom paint phase also regresses
- Because the real `settings` target is mandatory for this plan, no same-code confirmation rerun was justified:
  - the first paired worktree matrix is already decisively worse on the primary acceptance scene
- Strongest read:
  - top-level `CodeParam` leaf rows are not the row family driving the earlier `settings` win
  - the `settings`-useful seam is more likely in the non-code repeated value/body path, or in a different section-family-specific contract
  - the untouched-`main` row contract is still informative, but explicit leaf-grid restores should not be revisited next through another code-only subset

Conclusion:

- Reject this Tier 1 code-leaf-grid restore as a keep for `HEAD`.
- Revert the in-flight code changes after recording the docs.
- Carry forward the structural finding:
  - the next worthwhile row/body experiment should target the non-code repeated value path that still dominates `settings`, not another explicit grid/value restore for `CodeParam` leaves.

Post-revert visual note:

- Fresh subagent CDP comparison after reverting the code did not show clean full-page parity against untouched `main`:
  - `http://127.0.0.1:3087/settings` showed the `OVERVIEW` sidebar alongside the `All Settings` view
  - `http://127.0.0.1:3011/settings` still showed the canvas-only framing without that sidebar
- Treat that as a broader retained worktree-vs-main layout mismatch, not as proof that this rejected code-leaf experiment is still active.
- For this checkpoint, the actual revert proof is:
  - the experimental files are back to `HEAD`
  - the focused Vitest suite passes again on the reverted baseline
