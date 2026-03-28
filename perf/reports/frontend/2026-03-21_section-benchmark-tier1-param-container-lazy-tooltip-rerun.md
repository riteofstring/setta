# Section Benchmark Tier 1 ParamContainer Lazy Tooltip Rerun

Date: `2026-03-21`

Question:

- Does resolving `ParamContainer` tooltip content lazily on hover improve the dense row metadata path without changing the visible row contract?

Implementation under test:

- Experimental change under test:
  - remove tooltip-only store reads from `ParamContainer` render
  - resolve row tooltip pages lazily from project state on hover instead
  - keep the row shell, label/value layout, resize handle, and error chrome unchanged
- Experimental files under test:
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Utils/FloatingBox.tsx`
  - focused tests:
    - `frontend/src/components/Params/ParamContainer.test.tsx`
    - `frontend/src/components/Section/SectionParts/getKwargsControlsRenderModel.test.ts`
    - `frontend/src/components/Section/SectionParts/kwargsControlsStyles.test.ts`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-tier1-param-container-lazy-tooltip-rerun`
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
  - `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Section/SectionParts/getKwargsControlsRenderModel.test.ts src/components/Section/SectionParts/kwargsControlsStyles.test.ts`
    - `3` files passed
    - `7` tests passed
- Filtered typecheck while the experiment was live:
  - `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "ParamContainer|FloatingBox"`
  - no matching diagnostics were emitted during the filtered check
- Fresh subagent CDP check while the experiment was live:
  - `http://127.0.0.1:3011/settings`
  - `http://127.0.0.1:3011/benchmark-tier1`
  - both pages loaded normally
  - ordinary-zoom row layout looked intact
  - no obvious breakage was visible in row hover, label, or value structure

Why this seam was chosen:

- After the kwargs-shell rejection, fresh seam discovery moved the next Tier 1 target back into the dense row/body ownership path.
- The narrowest first step in that cluster was:
  - stop subscribing `ParamContainer` to tooltip-only row metadata during render
  - keep row DOM and value-host geometry intact
  - avoid another shell-deletion pass in section-card chrome

Paired benchmark totals versus the retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | retained baseline | `148.237` | `3235.187` | `66.774` |
| `settings` | worktree experiment | `421.940` | `29832.987` | `474.498` |
| `settings` | untouched `main` | `81.720` | `31158.223` | `509.211` |
| `tier1Synthetic` | retained baseline | `825.999` | `13271.540` | `18.282` |
| `tier1Synthetic` | worktree experiment | `723.708` | `14501.568` | `23.030` |
| `tier1Synthetic` | untouched `main` | `12.753` | `14140.672` | `18.007` |

Authoritative worktree deltas versus the retained baseline:

| Scene | Phase | Metric | Before | First rerun | Confirmation rerun | Confirmation delta |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `421.940` | `415.111` | `+266.874` |
| `settings` | benchmark | `RunTask` | `3235.187` | `29832.987` | `30081.420` | `+26846.233` |
| `settings` | benchmark | `UpdateLayoutTree` | `66.774` | `474.498` | `478.980` | `+412.206` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `42.706` | `36.226` | `+7.837` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `58.981` | `59.439` | `+32.283` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `723.708` | `716.475` | `-109.524` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `14501.568` | `14250.819` | `+979.279` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `18.282` | `23.030` | `19.020` | `+0.738` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `111.844` | `116.214` | `-29.743` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `150.756` | `145.537` | `-13.908` |

Interpretation:

- The first paired matrix again showed the now-familiar split:
  - `tier1Synthetic` paint improved
  - the mandatory real `settings` scene regressed badly on `Paint`, `RunTask`, and `UpdateLayoutTree`
- Untouched `main` moved sharply again on the same paired run, so the decision was not based on that noisy comparison alone.
- A same-code worktree-only confirmation rerun repeated the `settings` regression closely enough to reject:
  - the real `settings` benchmark stayed far worse than the retained baseline
  - the synthetic scene kept a paint win, but still paid more aggregate task work
- Strongest read:
  - tooltip-only row metadata is not the dominant reason the real `settings` row path is expensive
  - lazy tooltip resolution alone is too narrow to rescue the dense row metadata seam

Conclusion:

- Reject this lazy-tooltip `ParamContainer` experiment as a keep for `HEAD`.
- Revert the experiment after recording the docs.
- Keep the directional finding:
  - the non-kwargs row/body seam still looks more promising than section-card chrome
  - but the next pass should deepen the row metadata ownership change beyond tooltip-only lazy resolution, likely around the broader `ParamSwitch -> ParamContainer` split
