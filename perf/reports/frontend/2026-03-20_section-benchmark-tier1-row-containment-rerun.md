# Section Benchmark Tier 1 Row Containment Rerun

Date: `2026-03-20`

Question:

- Does adding row-level layout containment to the Tier 1 dense-param body stack reduce live body paint enough to keep as the next accepted post-preview checkpoint?

Implementation under test:

- Added layout containment to the shared Tier 1 row shell CSS in:
  - `frontend/index.css`
- The containment rollout is intentionally narrow:
  - `.section-param-row`
  - `.section-param-row > .section-key.param-row-label`
  - `.section-param-row > .section-key-value.param-row-label`
  - `.section-param-row > .section-value`
- No preview-policy broadening was included in this checkpoint.
- No pane-aware offscreen skip behavior was included in this checkpoint.

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-row-containment-rerun`
- previous accepted checkpoint for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-preview-rerun`

Method:

- Same canonical scenes and same CDP replay flow as the earlier checkpoints:
  - `settings` targeting `backendArgs`
  - `tier1Synthetic` targeting `callable_00`
- Same reusable runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same live ports at the time of the first paired rerun:
  - worktree:
    - frontend `http://127.0.0.1:3012`
    - CDP `http://127.0.0.1:9234`
  - untouched `main`:
    - frontend `http://127.0.0.1:3087`
    - CDP `http://127.0.0.1:9309`
- Because the first paired `settings` sample looked noisier than the accompanying `tier1Synthetic` result, I also ran a same-code worktree confirmation rerun for both scenes and stored those summaries in the same artifact root:
  - `worktree-settings-confirmation.summary.json`
  - `worktree-tier1-confirmation.summary.json`

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Params/ParamRowShell.test.tsx src/components/Params/paramRowClassNames.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Container/sectionBodyModePolicy.test.ts`
  - `9` files passed
  - `34` tests passed

First paired benchmark-window totals after landing row containment, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18118.482` | `8.301` | `86.321` | `3922.609` | `58.017` |
| `settings` | worktree | `18232.540` | `199.573` | `82.603` | `3874.692` | `62.800` |
| `tier1Synthetic` | untouched `main` | `23683.204` | `15.814` | `26.277` | `23936.763` | `148.562` |
| `tier1Synthetic` | worktree | `23450.180` | `1036.116` | `26.045` | `23033.465` | `140.520` |

Worktree deltas versus the previous accepted preview checkpoint:

| Scene | Phase | Metric | Before | First paired rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `191.084` | `199.573` | `+8.489` |
| `settings` | benchmark | `RunTask` | `4259.584` | `3874.692` | `-384.892` |
| `settings` | overview horizontal pan slow | `Paint` | `37.061` | `36.664` | `-0.397` |
| `settings` | overview vertical pan slow | `Paint` | `36.854` | `37.233` | `+0.379` |
| `settings` | overview-to-detail zoom slow | `Paint` | `11.182` | `12.245` | `+1.063` |
| `settings` | detail-to-overview zoom slow | `Paint` | `13.405` | `11.947` | `-1.458` |
| `tier1Synthetic` | benchmark | `Paint` | `1611.081` | `1036.116` | `-574.965` |
| `tier1Synthetic` | benchmark | `RunTask` | `23785.273` | `23033.465` | `-751.808` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `381.501` | `215.950` | `-165.551` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `332.993` | `196.758` | `-136.235` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `60.975` | `45.827` | `-15.148` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `73.311` | `60.707` | `-12.604` |

Worktree confirmation rerun versus the same previous preview checkpoint:

| Scene | Phase | Metric | Before | Confirmation rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `191.084` | `167.804` | `-23.280` |
| `settings` | benchmark | `RunTask` | `4259.584` | `3421.807` | `-837.777` |
| `settings` | overview horizontal pan slow | `Paint` | `37.061` | `30.700` | `-6.361` |
| `settings` | overview vertical pan slow | `Paint` | `36.854` | `31.076` | `-5.778` |
| `settings` | overview-to-detail zoom slow | `Paint` | `11.182` | `10.463` | `-0.719` |
| `settings` | detail-to-overview zoom slow | `Paint` | `13.405` | `11.938` | `-1.467` |
| `tier1Synthetic` | benchmark | `Paint` | `1611.081` | `842.503` | `-768.578` |
| `tier1Synthetic` | benchmark | `RunTask` | `23785.273` | `13582.872` | `-10202.401` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `381.501` | `146.179` | `-235.322` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `332.993` | `166.679` | `-166.314` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `60.975` | `46.346` | `-14.629` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `73.311` | `43.756` | `-29.555` |

Interpretation:

- This is the first post-preview iteration that clearly helps the canonical Tier 1 synthetic scene instead of just moving noise around.
- The first paired `settings` sample is mixed:
  - aggregate `Paint` regresses by `8.489ms`
  - aggregate `RunTask` improves by `384.892ms`
  - the slow overview pans are effectively flat
- The same code on the confirmation rerun is materially better on `settings`:
  - aggregate `Paint` improves by `23.280ms`
  - aggregate `RunTask` improves by `837.777ms`
  - both slow overview pans improve by more than `5ms` paint
- `tier1Synthetic` improves strongly even on the first paired rerun and improves further on confirmation:
  - aggregate `Paint` improves by `574.965ms` on the first paired pass
  - aggregate `Paint` improves by `768.578ms` on confirmation
  - both overview pan phases improve by well over `100ms` paint
- Read:
  - row-level layout containment is worth keeping
  - this is live body-cost reduction, not a preview-policy trick
  - the result is directionally consistent with the earlier March 7 finding that the row/param structure shell is the dominant steady-state Tier 1 hot path

CDP visual sanity:

- DevTools opened successfully on:
  - `http://127.0.0.1:3012/settings`
- The worktree settings page still loaded and remained navigable after the containment change.
- A viewport screenshot showed the expected overview pane, settings cards, and chat window with no obvious collapse or overlap.

Conclusion:

- Keep the row-containment checkpoint at `HEAD`.
- Treat it as the first accepted deeper Tier 1 live body-cost reduction after the rejected stronger-preview and offscreen-skip dead ends.
- The next Tier 1 slice should continue on the same class of change:
  - reduce live row/body paint or DOM cost further
  - and avoid reintroducing broader preview gating experiments unless they help both canonical scenes.
