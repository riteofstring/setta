# 2026-03-25 Section Benchmark Tier1 Pane Locality Rerun

## Question

- Does limiting Tier 1 image-preview warming to sections overlapping the visible pane plus a small warm gutter materially improve the canonical `settings` and `tier1Synthetic` benchmark matrix without reintroducing the unacceptable simplified placeholder fallback?

## Probe Under Test

- Keep/reject probe commit:
  - `606814701` `Localize Tier 1 preview warming to the visible pane`
- Revert commit after the benchmark reject:
  - `ae5c3824a` `Revert "Localize Tier 1 preview warming to the visible pane"`
- Artifact root:
  - `perf/reports/frontend/artifacts/2026-03-25_section-benchmark-tier1-pane-locality-rerun`

## What Changed

- Kept the faithful SnapDOM image-preview path:
  - no handcrafted simplified placeholder subtree
  - live section bodies still stayed mounted under the preview overlay path
- Replaced the prior global ranked warm/overlay candidate logic with a narrower per-node locality test:
  - overlays only for sections overlapping the visible pane
  - warm capture only for sections in the pane or a small warm gutter
  - cached preview data retained when a section fell back to `far`
- The intent was to cut active image-surface breadth without reintroducing preview eviction churn.

## Verification Before Benchmark

- Focused automated verification on the pane-locality probe:
  - `pnpm -C frontend exec vitest run src/components/Section/Container/sectionBodyModePolicy.test.ts src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionPreview.test.tsx`
    - `3` files passed
    - `19` tests passed
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-pan-zoom-preview.spec.ts`
    - `1` test passed
  - filtered `tsc` on `SectionBodyGate`, `Tier1DenseParamSectionPreview`, `sectionBodyModePolicy`, and `settings-pan-zoom-preview` returned no matching diagnostics
- Fresh CDP sanity pass from a fresh-context sub-agent:
  - worktree frontend `http://127.0.0.1:3011`
  - checked `/settings` and `/benchmark-tier1`
  - no old simplified-placeholder fallback observed
  - no obvious broad overlay leakage observed in the short pass
  - no obvious hitching or tearing observed in the short pass

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
| `settings` | untouched `main` | `87.540` | `33712.755` | `556.290` |
| `settings` | worktree pane locality | `563.464` | `40450.694` | `689.011` |
| `tier1Synthetic` | untouched `main` | `20.421` | `16834.033` | `24.483` |
| `tier1Synthetic` | worktree pane locality | `928.813` | `15948.319` | `24.245` |

## Authoritative Worktree Deltas Versus Untouched `main`

| Scene | Phase | Metric | Untouched `main` | Worktree | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `87.540` | `563.464` | `+475.924` |
| `settings` | benchmark | `RunTask` | `33712.755` | `40450.694` | `+6737.939` |
| `settings` | benchmark | `UpdateLayoutTree` | `556.290` | `689.011` | `+132.721` |
| `settings` | overview horizontal pan slow | `Paint` | `0.000` | `64.192` | `+64.192` |
| `settings` | overview vertical pan slow | `Paint` | `0.000` | `74.568` | `+74.568` |
| `settings` | overview-to-detail zoom slow | `Paint` | `5.856` | `18.309` | `+12.453` |
| `settings` | detail-to-overview zoom slow | `Paint` | `5.560` | `29.947` | `+24.387` |
| `tier1Synthetic` | benchmark | `Paint` | `20.421` | `928.813` | `+908.392` |
| `tier1Synthetic` | benchmark | `RunTask` | `16834.033` | `15948.319` | `-885.714` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `24.483` | `24.245` | `-0.238` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `0.000` | `156.736` | `+156.736` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `0.000` | `181.874` | `+181.874` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `4.162` | `43.247` | `+39.085` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `5.423` | `61.100` | `+55.677` |

## Worktree Deltas Versus The Retained Queued-Image Checkpoint

Retained queued-image checkpoint reference:

- `settings`
  - benchmark: `Paint 434.401`, `RunTask 29680.224`, `UpdateLayoutTree 493.593`
  - slow motion paint: `42.497`, `57.981`, `17.843`, `22.539`
- `tier1Synthetic`
  - benchmark: `Paint 762.591`, `RunTask 14109.314`, `UpdateLayoutTree 20.719`
  - slow motion paint: `125.234`, `153.553`, `37.403`, `39.140`

| Scene | Phase | Metric | Retained baseline | Pane locality | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `434.401` | `563.464` | `+129.063` |
| `settings` | benchmark | `RunTask` | `29680.224` | `40450.694` | `+10770.470` |
| `settings` | benchmark | `UpdateLayoutTree` | `493.593` | `689.011` | `+195.418` |
| `settings` | overview horizontal pan slow | `Paint` | `42.497` | `64.192` | `+21.695` |
| `settings` | overview vertical pan slow | `Paint` | `57.981` | `74.568` | `+16.587` |
| `settings` | overview-to-detail zoom slow | `Paint` | `17.843` | `18.309` | `+0.466` |
| `settings` | detail-to-overview zoom slow | `Paint` | `22.539` | `29.947` | `+7.408` |
| `tier1Synthetic` | benchmark | `Paint` | `762.591` | `928.813` | `+166.222` |
| `tier1Synthetic` | benchmark | `RunTask` | `14109.314` | `15948.319` | `+1839.005` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `20.719` | `24.245` | `+3.526` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `125.234` | `156.736` | `+31.502` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `153.553` | `181.874` | `+28.321` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `37.403` | `43.247` | `+5.844` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `39.140` | `61.100` | `+21.960` |

## Interpretation

- The pane-locality probe preserved the product-fidelity requirement:
  - no simplified placeholder regression reappeared
  - the fresh CDP pass still looked visually correct in a short manual check
- It still fails the benchmark gate decisively:
  - both canonical scenes remain much worse than untouched `main`
  - it is also materially worse than the retained queued-image checkpoint on the benchmark paint budget and most motion paint phases
- `settings` regressed notably against the retained queued-image checkpoint:
  - benchmark `Paint` got `+129.063ms` worse
  - benchmark `RunTask` got `+10770.470ms` worse
  - overview horizontal pan slow `Paint` got `+21.695ms` worse
- `tier1Synthetic` also regressed materially against the retained queued-image checkpoint:
  - benchmark `Paint` got `+166.222ms` worse
  - overview horizontal pan slow `Paint` got `+31.502ms` worse
  - detail-to-overview zoom slow `Paint` got `+21.960ms` worse
- Best current read:
  - narrowing warm/overlay locality alone is not enough when the runtime still flips substantial live content back into motion on the active path
  - the short CDP pass did not reveal an obvious visual problem, but the authoritative benchmark still shows the motion-paint budget getting worse rather than better

## Decision

- Reject the pane-locality probe.
- Restore the branch to the prior faithful queued-image checkpoint.
- Do not treat this rerun as plan completion.
