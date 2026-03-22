# Section Benchmark Tier 1 Dict Non-Code Leaf Grid Rerun

Date: `2026-03-20`

Question:

- Does restoring the old explicit leaf-row grid/value contract only for top-level Dict plain-label non-code leaves with switch/dropdown value bodies recover the real `settings` win without repeating the earlier broad restore regressions?

Implementation under test:

- Experimental change under test:
  - restore an explicit grid row shell only for top-level Dict `textLabelLeaf` rows whose value type is `SwitchParam` or `DropdownParam` in:
    - `frontend/src/components/Params/ParamContainer.tsx`
  - add focused regression coverage for that narrow Dict/non-code lane in:
    - `frontend/src/components/Params/ParamContainer.test.tsx`
- Intended structural effect:
  - stay in the non-code row family that dominates the real `settings` page
  - move the row shell back toward the old explicit grid contract without touching `CodeParam`, `TextInputCodeMirror`, or `DummyCodeMirror`
  - test a shared Dict/plain-label row contract rather than another widget-root-only tweak

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-dict-non-code-leaf-grid-rerun`
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
  - `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx`
    - `5` files passed
    - `7` tests passed

Motivation for this seam:

- Fresh subagent exploration of the live `settings` page and the checked-in fixture pointed at Dict-backed plain-label non-code leaves as the next place to mine:
  - the real page is dominated by non-code repeated rows, especially switches and dropdown-like config/value controls
  - the checked-in `settings` fixture is especially Dict-heavy in those same non-code families
- That made a Dict/non-code row-contract restore the right follow-up after the rejected `CodeParam`-only restore and the rejected switch-root collapse.

Paired benchmark totals versus the retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | retained baseline | `148.237` | `3235.187` | `66.774` |
| `settings` | worktree experiment | `438.650` | `34602.837` | `524.013` |
| `settings` | untouched `main` | `62.855` | `25686.169` | `270.551` |
| `tier1Synthetic` | retained baseline | `825.999` | `13271.540` | `18.282` |
| `tier1Synthetic` | worktree experiment | `719.639` | `14396.235` | `19.537` |
| `tier1Synthetic` | untouched `main` | `17.211` | `13908.749` | `18.784` |

Authoritative worktree deltas versus the retained baseline:

| Scene | Phase | Metric | Before | First rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `438.650` | `+290.413` |
| `settings` | benchmark | `RunTask` | `3235.187` | `34602.837` | `+31367.650` |
| `settings` | benchmark | `UpdateLayoutTree` | `66.774` | `524.013` | `+457.239` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `38.322` | `+9.933` |
| `settings` | overview horizontal pan slow | `RunTask` | `392.838` | `4220.920` | `+3828.082` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `58.424` | `+31.268` |
| `settings` | overview vertical pan slow | `RunTask` | `399.964` | `3607.158` | `+3207.194` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `16.878` | `+8.082` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `23.481` | `+14.573` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `719.639` | `-106.360` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `14396.235` | `+1124.695` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `18.282` | `19.537` | `+1.255` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `124.450` | `-21.507` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `137.731` | `-21.714` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `42.129` | `+1.600` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `38.083` | `-5.251` |

Interpretation:

- This experiment reproduces the same bad asymmetry seen in the earlier targeted restores:
  - the synthetic Tier 1 scene benefits on paint
  - the mandatory real `settings` target gets dramatically worse
- The `settings` regression is even larger than the rejected switch-root-collapse variant:
  - aggregate `Paint`, `RunTask`, and `UpdateLayoutTree` all spike sharply
  - every representative slow pan/zoom paint phase also regresses
- No same-code confirmation rerun was justified because the real-project target is already decisively worse on the first paired matrix.
- Strongest read:
  - the live/non-code/Dict diagnosis is still probably correct
  - but restoring the old explicit grid contract, even when narrowed to the right non-code row family, is still the wrong mechanism under the current branch/browser architecture
  - the next worthwhile non-code pass should stay in the Dict/plain-label lane but target the shared value-host ownership instead of any more explicit leaf-grid restores

Conclusion:

- Reject this Tier 1 Dict/non-code leaf-grid restore as a keep for `HEAD`.
- Revert the in-flight code changes after recording the docs.
- Keep the directional finding:
  - continue in the Dict/plain-label non-code row family
  - stop trying to reintroduce the old explicit leaf-grid shell
  - move the next experiment to a shared non-code value-host seam instead
