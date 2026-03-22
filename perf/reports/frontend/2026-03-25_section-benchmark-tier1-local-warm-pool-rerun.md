# 2026-03-25 Section Benchmark Tier1 Local Warm Pool Rerun

## Question

- Does a wider local Tier 1 warm/visible image-preview pool stabilize the second-pass pan/zoom image path without regressing the canonical `settings` and `tier1Synthetic` benchmark matrix beyond the retained queued-image checkpoint?

## Probe Under Test

- Keep/reject probe commit:
  - `f627e4848` `Stabilize local Tier 1 image previews across pan sessions`
- Revert commit after the benchmark reject:
  - `c37cdc24e` `Revert "Stabilize local Tier 1 image previews across pan sessions"`
- Artifact root:
  - `perf/reports/frontend/artifacts/2026-03-25_section-benchmark-tier1-local-warm-pool-rerun`

## What Changed

- Split Tier 1 preview retention from overlay visibility:
  - local preview candidacy moved into `SectionBodyGate`
  - warm intent stayed active briefly after a pan ended
  - preview capture scheduling became priority-ordered instead of arbitrary effect order
- The widened follow-up under test broadened the local pool further:
  - `previewWarmMaxSections: 32`
  - `previewOverlayMaxVisibleSections: 32`
- The product-fidelity goal stayed the same:
  - no handcrafted simplified placeholder subtree
  - only faithful cached SnapDOM image overlays

## Verification Before Benchmark

- Focused automated verification on the probe:
  - `pnpm -C frontend exec vitest run src/components/Section/Container/sectionBodyModePolicy.test.ts src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionPreview.test.tsx`
    - `3` files passed
    - `18` tests passed
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-pan-zoom-preview.spec.ts`
    - passed twice after the widened local pool landed
  - filtered `tsc` on `SectionBodyGate`, `Tier1DenseParamSectionPreview`, `sectionBodyModePolicy`, and `settings-pan-zoom-preview` returned no matching diagnostics
- Fresh CDP sanity pass from a fresh-context sub-agent:
  - worktree frontend `http://127.0.0.1:3011`
  - checked `/settings` and `/benchmark-tier1`
  - no obvious simplified-placeholder fallback observed
  - no obvious hitching, tearing, or zoom/pan visual regression observed in the quick pass

## Benchmark Setup

- Browser/frontend pairs used for the rerun:
  - worktree browser CDP `http://127.0.0.1:9233`
  - worktree frontend `http://127.0.0.1:3011`
  - untouched `main` browser CDP `http://127.0.0.1:9309`
  - untouched `main` frontend `http://127.0.0.1:3087`
- Canonical scenes reinstalled immediately before the rerun:
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root ../setta/setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root ../setta/setta_files_dev`
- Benchmark runner:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`

## Paired Benchmark Totals Versus Untouched `main`

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | untouched `main` | `102.157` | `40245.969` | `637.577` |
| `settings` | worktree local warm pool | `558.527` | `39356.489` | `626.431` |
| `tier1Synthetic` | untouched `main` | `35.487` | `28674.555` | `37.028` |
| `tier1Synthetic` | worktree local warm pool | `1384.112` | `28370.467` | `34.342` |

## Authoritative Worktree Deltas Versus Untouched `main`

| Scene | Phase | Metric | Untouched `main` | Worktree | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `102.157` | `558.527` | `+456.370` |
| `settings` | benchmark | `RunTask` | `40245.969` | `39356.489` | `-889.480` |
| `settings` | benchmark | `UpdateLayoutTree` | `637.577` | `626.431` | `-11.146` |
| `settings` | overview horizontal pan slow | `Paint` | `0.000` | `53.496` | `+53.496` |
| `settings` | overview vertical pan slow | `Paint` | `0.000` | `73.392` | `+73.392` |
| `settings` | overview-to-detail zoom slow | `Paint` | `6.435` | `22.943` | `+16.508` |
| `settings` | detail-to-overview zoom slow | `Paint` | `7.130` | `26.799` | `+19.669` |
| `tier1Synthetic` | benchmark | `Paint` | `35.487` | `1384.112` | `+1348.625` |
| `tier1Synthetic` | benchmark | `RunTask` | `28674.555` | `28370.467` | `-304.088` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `37.028` | `34.342` | `-2.686` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `0.000` | `188.835` | `+188.835` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `0.000` | `230.265` | `+230.265` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `7.346` | `65.939` | `+58.593` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `7.941` | `104.422` | `+96.481` |

## Worktree Deltas Versus The Retained Queued-Image Checkpoint

Retained queued-image checkpoint reference:

- `settings`
  - benchmark: `Paint 434.401`, `RunTask 29680.224`, `UpdateLayoutTree 493.593`
  - slow motion paint: `42.497`, `57.981`, `17.843`, `22.539`
- `tier1Synthetic`
  - benchmark: `Paint 762.591`, `RunTask 14109.314`, `UpdateLayoutTree 20.719`
  - slow motion paint: `125.234`, `153.553`, `37.403`, `39.140`

| Scene | Phase | Metric | Retained baseline | Local warm pool | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `434.401` | `558.527` | `+124.126` |
| `settings` | benchmark | `RunTask` | `29680.224` | `39356.489` | `+9676.265` |
| `settings` | benchmark | `UpdateLayoutTree` | `493.593` | `626.431` | `+132.838` |
| `settings` | overview horizontal pan slow | `Paint` | `42.497` | `53.496` | `+10.999` |
| `settings` | overview vertical pan slow | `Paint` | `57.981` | `73.392` | `+15.411` |
| `settings` | overview-to-detail zoom slow | `Paint` | `17.843` | `22.943` | `+5.100` |
| `settings` | detail-to-overview zoom slow | `Paint` | `22.539` | `26.799` | `+4.260` |
| `tier1Synthetic` | benchmark | `Paint` | `762.591` | `1384.112` | `+621.521` |
| `tier1Synthetic` | benchmark | `RunTask` | `14109.314` | `28370.467` | `+14261.153` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `20.719` | `34.342` | `+13.623` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `125.234` | `188.835` | `+63.601` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `153.553` | `230.265` | `+76.712` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `37.403` | `65.939` | `+28.536` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `39.140` | `104.422` | `+65.282` |

## Interpretation

- The widened local warm/visible pool did stabilize the test path enough to get repeat Playwright passes, and it kept the no-placeholder fidelity requirement intact.
- It still fails the benchmark gate decisively:
  - it is much worse than untouched `main` on both canonical scenes
  - it is also materially worse than the retained queued-image checkpoint on every paint metric that matters here
  - `tier1Synthetic` is especially bad:
    - benchmark `Paint` regressed by `+621.521ms` versus the retained queued-image checkpoint
    - overview vertical pan slow `Paint` regressed by `+76.712ms`
    - detail-to-overview zoom slow `Paint` regressed by `+65.282ms`
- The best read is that broadening the local pool reduced overlay scarcity at the cost of reintroducing too many live image surfaces, so the benchmark paid the price in paint and task time again.

## Decision

- Reject the widened local warm/visible pool probe.
- Restore the branch to the prior queued-image checkpoint.
- Do not treat this rerun as plan completion.
