# Easy Button Pane Phase B Swirl Performance

Date: 2026-07-09

## Scope

Phase B of `docs/plans/easy-button-pixel-match-20260709.md` replaces the working
state's rotating ring and `LoaderCircle` spinner with the mockup's swirl field:
three `mix-blend-mode: screen` conic layers and a radial core, rotating under a
static `blur(30px) saturate(1.3)` on the container.

The swirl is the first genuinely expensive thing this pane paints — the blur
re-rasterizes a ~540x540 CSS-px region whose children animate — and every
previous Easy Button performance report measured a pane with **no swirl**. This
re-baselines the focused workflow across that change.

## Method

- Baseline (`b1edd3e96`, ring + spinner, no swirl):
  `node desktop/tests/electron/easy-button-pane-performance.test.mjs --skip-build --artifact-dir .recordings/easy-button-phaseB-baseline`
- After (swirl):
  `node desktop/tests/electron/easy-button-pane-performance.test.mjs --skip-build --artifact-dir .recordings/easy-button-phaseB-after3`
- Harness: Electron production main/preload/renderer build with
  `SETTA_E2E_CHAT_HARNESS=scripted-workflow`.
- Sample duration: 1200 ms per state.

Two changes to the workflow were needed for the numbers to mean anything:

1. **Samples wait for the swirl's 1600 ms crossfade to settle.** A 1200 ms sample
   taken the moment a state lands would end before the fade did, so the guardrail
   would have measured the crossfade and never the steady state a user sits in.
   Sampled opacities: working `0.850`, complete `0.208`.
2. **A `complete` sample was added.** The terminal state is where the pane rests
   after every run — potentially for hours — and the swirl keeps rotating there.
   It was previously unmeasured. Freeze still has to be verified against a
   *running* swirl, so the workflow now stops one run to sample `complete` and
   starts a second one to freeze.

## Results

| State | Run | Frames | Avg FPS | p50 frame | p95 frame | p99 frame | Max frame | Long tasks | Frames over 16ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Idle | Baseline | 142 | 120.00 | 8.3ms | 8.8ms | 9.1ms | 9.3ms | 0 | 0 |
| Idle | After | 142 | 120.03 | 8.3ms | 9.0ms | 9.3ms | 9.3ms | 0 | 0 |
| Working | Baseline | 141 | 120.03 | 8.3ms | 9.0ms | 9.3ms | 9.3ms | 0 | 0 |
| Working | After | 141 | 120.08 | 8.3ms | 8.8ms | 9.2ms | 9.3ms | 0 | 0 |
| Complete | Baseline | — | — | — | — | — | — | — | — |
| Complete | After | 141 | 120.00 | 8.3ms | 8.9ms | 9.2ms | 9.3ms | 0 | 0 |
| Frozen working | Baseline | 141 | 120.00 | 8.3ms | 8.9ms | 9.2ms | 9.4ms | 0 | 0 |
| Frozen working | After | 141 | 120.08 | 8.3ms | 8.9ms | 9.2ms | 9.3ms | 0 | 0 |

The baseline has no `complete` row because that state had nothing to sample
before the swirl existed.

p95 deltas against baseline: idle `+0.20ms`, working `-0.20ms`, frozen `+0.00ms`.

## Verdict

Inside budget on every count: p95 frame stays well under 16 ms, no long tasks, no
frames over 16 ms, and the worst p95 regression is `+0.20ms` against an allowance
of roughly 1 ms. The mitigation ladder in the plan (scope `will-change` -> shrink
the blur radius -> drop layer 3 -> pre-blurred sprite) was **not** needed. Only
the `will-change` scoping was applied, and that was always part of the design
rather than a mitigation.

## Notes

- **Working got marginally faster than the spinner it replaced** (`-0.20ms` p95).
  The swirl animates only `transform` on layers that are promoted while working,
  whereas the old spinner rotated an inline SVG and the ring animated a border.
  The delta is inside run-to-run noise; the honest claim is "no regression", not
  "an improvement".
- **Idle is free by construction, not by luck.** `opacity: 0` does not stop a CSS
  animation — Chromium keeps ticking the rotations and compositing the layers —
  so the swirl's rotations and `breathe` are `animation-play-state: paused` at
  idle, and `will-change: transform` is scoped to the working state alone. The
  perf test asserts this directly (`assertEasyButtonIdleSwirlPaused`) rather than
  inferring it from the frame budget: a paused-at-idle claim that only surfaces
  as a frame number is one refactor away from being silently false. The `+0.20ms`
  idle delta is therefore not animation cost; idle paints one extra composited
  (static, `opacity: 0`) subtree.
- **The terminal state animates forever, and that is now measured.** `complete`
  keeps all three layers running at stretched periods (54s / 87s / 123s) and
  drops the `will-change: transform` promotion that working gets. It measured
  `8.9ms` p95 with zero long tasks — indistinguishable from working — so Chromium
  composites the transform animations without the hint, as expected. Had this
  gone the other way it would have been the strongest argument for pausing the
  swirl at `complete` too, which the mockup does not do.
- **Freeze covers the swirl for free.** The existing
  `[data-surface-frozen="true"] ... { animation-play-state: paused !important }`
  rule already reaches the swirl's descendants, verified by
  `assertEasyButtonAnimationsPaused` on the frozen working state. The swirl's
  opacity *transition* is not paused by freeze — freeze pauses animations, not
  transitions — which is harmless because the transition is finite.
- The stopped terminal summary was
  `The run was stopped before finishing. Stopped after 3s - no artifacts`.
