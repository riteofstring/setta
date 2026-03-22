# Section Benchmark Tier 1 Nested Guide Removal Rerun

Date: `2026-03-20`

Question:

- Does removing the nested Tier 1 row-guide chrome and its dynamic `:has(...)` continuation rule buy a real pan/zoom win after the accepted row-containment checkpoint?

Implementation under test:

- Simplified nested Tier 1 row chrome in:
  - `frontend/src/components/Params/paramRowClassNames.ts`
  - `frontend/index.css`
- Behavior change under test:
  - keep nested row indentation
  - remove the per-row nested guide pseudo-element
  - remove the `.section-param-row[data-param-nested-child=\"true\"]:has(...)::before` continuation rule
- This is an intentional visual simplification for dense param rows, not a preview-policy change.

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-nested-guide-removal-rerun`
- previous accepted checkpoint for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-row-containment-rerun`

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
- As with the earlier row-containment checkpoint, I also ran same-code worktree confirmation reruns for both scenes and stored those summaries in the same artifact root:
  - `worktree-settings-confirmation.summary.json`
  - `worktree-tier1-confirmation.summary.json`

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Params/ParamRowShell.test.tsx src/components/Params/paramRowClassNames.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Container/sectionBodyModePolicy.test.ts`
  - `9` files passed
  - `34` tests passed

First paired benchmark-window totals after removing nested row-guide chrome, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18065.669` | `6.931` | `68.596` | `3252.071` | `49.793` |
| `settings` | worktree | `18051.537` | `148.513` | `68.701` | `3267.777` | `57.211` |
| `tier1Synthetic` | untouched `main` | `17249.640` | `13.387` | `19.556` | `14804.194` | `115.431` |
| `tier1Synthetic` | worktree | `17100.889` | `853.807` | `19.763` | `13243.181` | `106.473` |

Worktree deltas versus the retained row-containment confirmation baseline:

| Scene | Phase | Metric | Before | First paired rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `167.804` | `148.513` | `-19.291` |
| `settings` | benchmark | `RunTask` | `3421.807` | `3267.777` | `-154.030` |
| `settings` | overview horizontal pan slow | `Paint` | `30.700` | `28.305` | `-2.395` |
| `settings` | overview vertical pan slow | `Paint` | `31.076` | `27.086` | `-3.990` |
| `settings` | overview-to-detail zoom slow | `Paint` | `10.463` | `8.843` | `-1.620` |
| `settings` | detail-to-overview zoom slow | `Paint` | `11.938` | `9.104` | `-2.834` |
| `tier1Synthetic` | benchmark | `Paint` | `842.503` | `853.807` | `+11.304` |
| `tier1Synthetic` | benchmark | `RunTask` | `13582.872` | `13243.181` | `-339.691` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `146.179` | `147.659` | `+1.480` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `166.679` | `175.256` | `+8.577` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `46.346` | `42.281` | `-4.065` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.756` | `42.778` | `-0.978` |

Worktree confirmation rerun versus the same retained row-containment baseline:

| Scene | Phase | Metric | Before | Confirmation rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `167.804` | `148.237` | `-19.567` |
| `settings` | benchmark | `RunTask` | `3421.807` | `3235.187` | `-186.620` |
| `settings` | overview horizontal pan slow | `Paint` | `30.700` | `28.389` | `-2.311` |
| `settings` | overview vertical pan slow | `Paint` | `31.076` | `27.156` | `-3.920` |
| `settings` | overview-to-detail zoom slow | `Paint` | `10.463` | `8.796` | `-1.667` |
| `settings` | detail-to-overview zoom slow | `Paint` | `11.938` | `8.908` | `-3.030` |
| `tier1Synthetic` | benchmark | `Paint` | `842.503` | `825.999` | `-16.504` |
| `tier1Synthetic` | benchmark | `RunTask` | `13582.872` | `13271.540` | `-311.332` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `146.179` | `145.957` | `-0.222` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `166.679` | `159.445` | `-7.234` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `46.346` | `40.529` | `-5.817` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.756` | `43.334` | `-0.422` |

Interpretation:

- This checkpoint is another keep.
- The paired rerun already made `settings` clearly better than the retained row-containment baseline.
- The first paired `tier1Synthetic` sample was close enough to the retained baseline that it was worth confirming, but the same-code confirmation rerun resolves that ambiguity in the right direction:
  - aggregate `Paint` improves by `16.504ms`
  - aggregate `RunTask` improves by `311.332ms`
  - vertical overview pan `Paint` improves by `7.234ms`
  - overview-to-detail zoom `Paint` improves by `5.817ms`
- Read:
  - the nested guide chrome was still part of the repeated Tier 1 motion cost
  - the dynamic `:has(...)` continuation rule was not worth its styling and paint complexity on dense param stacks
  - dense-row indentation alone is enough to preserve hierarchy recognition for this benchmark target

CDP visual sanity:

- Compared worktree `http://127.0.0.1:3012/settings` and untouched `main` `http://127.0.0.1:3087/settings` in headed Chrome.
- The expected visible difference is present:
  - nested dense-param rows keep indentation
  - the thin left-side nested guide cue is gone on the worktree
- No broken layout, collapse, or overlap showed up in the viewport screenshots.

Conclusion:

- Keep the nested-guide removal at `HEAD`.
- Treat it as the next accepted Tier 1 live-body paint simplification after row containment.
- The next Tier 1 slice should continue this same class of work:
  - remove or simplify repeated dense-row paint chrome
  - and avoid reintroducing styling complexity that is not paying for itself on the canonical scenes.
