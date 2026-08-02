# Seeded artifact fluid and suspended grain — 2026-08-05

## Scope

This report records the performance impact of making the artifact fluid field stable-but-distinct per artifact and blending a restrained fine-grain layer into the default fluid treatment. It also records the readability adjustment from a 34% to a 54% near-black reading veil; that CSS composite adds no shader work.

The baseline and result use the same production renderer harness, Apple M2, 1512 × 982 CSS-pixel viewport, device pixel ratio 2, full quality tier, and `one-active-workstream` scenario.

## Implementation

- The artifact ID is hashed into two stable shader phases. Reopening an artifact recreates its field, while navigating to another artifact changes rotation, scale, flow direction, frequency, and phase.
- The canvas advances seed changes through its existing interruptible scalar animation path. React selects a target only; it does not update per frame.
- The fluid field evaluates one additional CSS-space 5.25 px granular cell and concentrates the suspended grain around fluid seams.
- Particle sizing remains independent of viewport and renderer resolution.
- The implementation adds one `vec2` uniform. It adds no canvas, framebuffer, texture, upload, blur pass, or DOM animation loop.
- Reduced motion snaps seed changes and continues to hold the ambient clock.

## Measurement

Workflow: `desktop/tests/electron/director-graph-artifact-profile.mjs`

Baseline capture: `.recordings/director-graph-artifact-profile/20260805T073348743Z/profile.json`

Result capture: `.recordings/director-graph-artifact-profile/20260805T073912574Z/profile.json`

| Run | Surface state | CPU p95 | GPU p50 | GPU p95 | Frame delta p95 | Dropped-threshold frames | Long tasks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | Normal graph | 0.30 ms | 2.38 ms | 6.25 ms | 17.10 ms | 0 | 0 |
| Baseline | Fluid | 0.20 ms | 4.73 ms | 7.96 ms | 16.80 ms | 0 | 0 |
| Result | Normal graph | 0.40 ms | 4.49 ms | 6.24 ms | 17.60 ms | 0 | 0 |
| Result | Fluid, primary seed | 0.40 ms | 6.66 ms | 9.07 ms | 17.60 ms | 0 | 0 |
| Result | Fluid, alternate seed | 0.40 ms | 6.66 ms | 7.57 ms | 17.60 ms | 0 | 0 |
| Result | Fine grain | 0.40 ms | 5.29 ms | 6.57 ms | 17.50 ms | 0 | 0 |

The worst seeded fluid capture remained at 9.07 ms GPU p95, 7.60 ms below the 16.67 ms GPU frame budget. The added grain increased the primary seed's paired fluid overhead from 1.70 ms to 2.83 ms GPU p95. The alternate seed measured 1.33 ms above its paired normal graph. CPU p95 tracked the paired normal graph, and every state recorded zero dropped-threshold frames and zero long tasks.

Absolute GPU timings vary between launches, so paired graph-to-fluid overhead and the absence of dropped frames are more meaningful than comparing raw p50 values between runs.

## Visual captures

- `.recordings/director-graph-artifact-profile/20260805T073912574Z/artifact-fluid.png`
- `.recordings/director-graph-artifact-profile/20260805T073912574Z/artifact-fluid-alternate.png`
- `.recordings/director-graph-artifact-profile/20260805T073912574Z/artifact-fine.png`

The two fluid captures visibly differ in composition while retaining the same milky material, restrained granular suspension, and shared halftone/CRT resolve.
