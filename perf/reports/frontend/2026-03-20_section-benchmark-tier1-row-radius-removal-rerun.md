# Section Benchmark Tier 1 Row Radius Removal Rerun

Date: `2026-03-20`

Question:

- Does removing the repeated `rounded-sm` chrome from dense Tier 1 param rows and selected-row backgrounds reduce paint enough to keep as the next post-nested-guide simplification?

Implementation under test:

- Experimental change under test:
  - remove `rounded-sm` from the shared dense row shell in `frontend/src/components/Params/paramRowClassNames.ts`
  - remove `rounded-sm` from the selected-row background class assembly in `frontend/src/components/Params/ParamSwitch.tsx`
- Intended effect:
  - keep row geometry the same
  - drop one repeated rounded-corner paint treatment from the dense Tier 1 row path

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-row-radius-removal-rerun`
- retained baseline for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-nested-guide-removal-rerun`

Method:

- Same canonical scenes and same CDP replay flow as the earlier checkpoints:
  - `settings` targeting `backendArgs`
  - `tier1Synthetic` targeting `callable_00`
- Same reusable runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same live ports at the time of the paired rerun:
  - worktree:
    - frontend `http://127.0.0.1:3012`
    - CDP `http://127.0.0.1:9234`
  - untouched `main`:
    - frontend `http://127.0.0.1:3087`
    - CDP `http://127.0.0.1:9309`
- Did not run same-code confirmation reruns because the first paired matrix already regressed both canonical scenes strongly enough to fail the keep threshold.

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Params/paramRowClassNames.test.ts src/components/Params/ParamRowShell.test.tsx src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Params/ParamUIs/TextParamInput.test.tsx`
  - `8` files passed
  - `31` tests passed
- `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "paramRowClassNames\\.ts|ParamSwitch\\.tsx"`
  - still reported the existing `ParamSwitch.tsx` exact-optional-property diagnostics already present on this baseline
  - treated Vitest plus the benchmark matrix as the acceptance gate for this experiment

First paired benchmark-window totals after removing dense row radii, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18066.687` | `8.221` | `80.647` | `3822.260` | `55.770` |
| `settings` | worktree | `18033.545` | `176.823` | `77.752` | `3786.465` | `59.040` |
| `tier1Synthetic` | untouched `main` | `23201.160` | `14.993` | `26.379` | `23041.808` | `136.295` |
| `tier1Synthetic` | worktree | `22749.780` | `1009.940` | `25.989` | `21911.396` | `130.815` |

Worktree deltas versus the retained nested-guide-removal confirmation baseline:

| Scene | Phase | Metric | Before | First paired rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `176.823` | `+28.586` |
| `settings` | benchmark | `RunTask` | `3235.187` | `3786.465` | `+551.278` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `33.062` | `+4.673` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `34.645` | `+7.489` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `11.424` | `+2.628` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `10.569` | `+1.661` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `1009.940` | `+183.941` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `21911.396` | `+8639.856` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `199.788` | `+53.831` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `197.818` | `+38.373` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `46.511` | `+5.982` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `56.585` | `+13.251` |

CDP structural and visual sanity:

- Compared worktree `http://127.0.0.1:3012/settings` against untouched `main` `http://127.0.0.1:3087/settings` in headed Chrome.
- The intended structural difference was present on sampled dense rows:
  - untouched `main` sampled row class still included `rounded-sm`
  - worktree experiment sampled row class dropped `rounded-sm`
  - both sampled pages still had `316` `[data-param-row="true"]` nodes
- Representative sampled row geometry stayed close:
  - untouched `main`:
    - width: `222.158`
    - height: `8.611`
  - worktree experiment:
    - width: `226.871`
    - height: `8.537`
- No obvious broken layout or collapse showed up in the viewport compare; the visible difference was the expected loss of dense-row corner rounding.

Interpretation:

- This is not a close call.
- Removing the repeated row radius regressed both canonical scenes immediately and by a large enough margin that a confirmation rerun was not justified.
- The strongest read is:
  - the rounded row chrome is not the expensive part of the retained dense-row path
  - the removed radius likely changed compositor behavior or invalidation patterns in a way that made the repeated row surfaces worse instead of better
  - this seam should not be revisited before deeper row/body ownership or structure work

Conclusion:

- Reject this row-radius removal experiment.
- Revert the uncommitted code changes and keep the retained nested-guide-removal baseline at `HEAD`.
- Continue the next Tier 1 pass away from isolated row-corner styling tweaks and back toward:
  - deeper repeated row/body DOM simplification
  - ownership consolidation around the shared Tier 1 param stack
  - higher-leverage structural seams instead of one-style-token removals
