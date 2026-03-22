# Section Benchmark Tier 1 Kwargs Wrapper Collapse Rerun

Date: `2026-03-21`

Question:

- Does collapsing the extra static wrapper around the Tier 1 kwargs action strip improve the repeated section-card chrome path without changing the visible controls?

Implementation under test:

- Experimental change under test:
  - move the kwargs strip alignment onto the outer `section-args` host
  - remove the extra intermediate wrapper around the `Args` label plus action buttons
  - keep the same action buttons, icon glyph hosts, filter field, and steady-state layout contract
- Experimental files under test:
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/components/Section/SectionParts/kwargsControlsStyles.ts`
  - focused tests:
    - `frontend/src/components/Section/SectionParts/getKwargsControlsRenderModel.test.ts`
    - `frontend/src/components/Section/SectionParts/kwargsControlsStyles.test.ts`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-tier1-kwargs-wrapper-collapse-rerun`
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
  - `pnpm -C frontend exec vitest run src/components/Section/SectionParts/getKwargsControlsRenderModel.test.ts src/components/Section/SectionParts/kwargsControlsStyles.test.ts`
    - `2` files passed
    - `5` tests passed
- Filtered typecheck while the experiment was live:
  - `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "KwargsControls|kwargsControlsStyles"`
  - no matching diagnostics were emitted during the filtered check
- Fresh subagent CDP check while the experiment was live:
  - `http://127.0.0.1:3011/settings`
  - `http://127.0.0.1:3011/benchmark-tier1`
  - both pages loaded normally
  - kwargs strips looked visually normal at ordinary zoom
  - the live DOM showed the wrapper collapse: `section.section-args` no longer had the extra intermediate wrapper article between the outer strip host and the inner controls

Why this seam was chosen:

- Fresh seam discovery after the flat-row rejection pointed back at the repeated section-card/header/kwargs area.
- The narrowest static DOM cut there was:
  - remove one steady-state wrapper from every kwargs strip
  - avoid button/icon host rewiring
  - avoid another interaction-start mount/unmount path

Paired benchmark totals versus the retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | retained baseline | `148.237` | `3235.187` | `66.774` |
| `settings` | worktree experiment | `411.305` | `26868.322` | `473.547` |
| `settings` | untouched `main` | `79.649` | `30862.180` | `501.728` |
| `tier1Synthetic` | retained baseline | `825.999` | `13271.540` | `18.282` |
| `tier1Synthetic` | worktree experiment | `705.238` | `13848.719` | `18.406` |
| `tier1Synthetic` | untouched `main` | `12.746` | `13796.482` | `17.621` |

Authoritative worktree deltas versus the retained baseline:

| Scene | Phase | Metric | Before | First rerun | Confirmation rerun | Confirmation delta |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `411.305` | `416.632` | `+268.395` |
| `settings` | benchmark | `RunTask` | `3235.187` | `26868.322` | `29908.138` | `+26672.951` |
| `settings` | benchmark | `UpdateLayoutTree` | `66.774` | `473.547` | `471.926` | `+405.152` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `52.725` | `37.364` | `+8.975` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `62.065` | `58.886` | `+31.730` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `705.238` | `699.518` | `-126.481` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `13848.719` | `14159.511` | `+887.971` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `18.282` | `18.406` | `18.635` | `+0.353` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `114.234` | `116.646` | `-29.311` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `143.384` | `143.242` | `-16.203` |

Interpretation:

- The first paired matrix already showed a clear split:
  - `tier1Synthetic` paint improved
  - the mandatory real `settings` target regressed badly on `Paint`, `RunTask`, and `UpdateLayoutTree`
- The untouched `main` settings numbers also shifted sharply on this run, so the decision was not based on that noisy paired comparison alone.
- A same-code worktree-only confirmation rerun repeated the `settings` regression almost exactly, which makes the direction reliable enough to reject:
  - the real `settings` benchmark stayed far worse than the retained baseline
  - the synthetic scene kept its paint win, but not enough to offset the real-scene failure
- Strongest read:
  - even a one-wrapper static deletion inside the kwargs strip broadens aggregate work on the real `settings` route
  - the repeated section-card/header/kwargs seam is sensitive, and local wrapper deletion there is not a safe next Tier 1 mechanism

Conclusion:

- Reject this kwargs wrapper-collapse experiment as a keep for `HEAD`.
- Revert the experiment after recording the docs.
- Keep the directional finding:
  - do not spend the next Tier 1 pass on another local kwargs-strip shell deletion
  - the next static seam should move away from the repeated section-card/header/kwargs shell and back into a different dense row/body ownership path
