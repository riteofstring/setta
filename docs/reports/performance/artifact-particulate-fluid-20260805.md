# Particulate artifact fluid — 2026-08-05

## Scope

This report records the replacement of the artifact field's smooth milky fill with a seeded particle lattice. Dense particles now describe the large fluid folds, while a brighter sparse subset remains suspended in their dark gaps. The final CRT/halftone resolve is unchanged.

The artifact reading veil also moved from 54% to 68% near-black and its header from 90% to 95%. Those CSS composite changes add no shader work.

## Implementation constraints

- The analytic flow remains a low-cost density field.
- One CSS-space 4.25–5.75 px lattice resolves both the dense structure particles and sparse suspended grains.
- The implementation reuses the single hash evaluation previously spent on suspended grain; it adds no procedural pass.
- Particle scale remains stable across viewport size, device-pixel ratio, and renderer quality.
- There is still one canvas, framebuffer, post pass, and artifact seed uniform, with no texture upload or blur sampling.

## Measurement

Workflow: `desktop/tests/electron/director-graph-artifact-profile.mjs`

Baseline: `.recordings/director-graph-artifact-profile/20260805T073912574Z/profile.json`

Result: `.recordings/director-graph-artifact-profile/20260805T081010733Z/profile.json`

Environment: Apple M2 through ANGLE Metal, 1512 × 982 CSS px, device pixel ratio 2, full quality, `one-active-workstream`.

| Run | Surface state | CPU p95 | GPU p50 | GPU p95 | Frame delta p95 | Dropped-threshold frames | Long tasks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | Normal graph | 0.40 ms | 4.49 ms | 6.24 ms | 17.60 ms | 0 | 0 |
| Baseline | Fluid, primary seed | 0.40 ms | 6.66 ms | 9.07 ms | 17.60 ms | 0 | 0 |
| Baseline | Fluid, alternate seed | 0.40 ms | 6.66 ms | 7.57 ms | 17.60 ms | 0 | 0 |
| Result | Normal graph | 0.40 ms | 3.89 ms | 5.93 ms | 17.40 ms | 0 | 0 |
| Result | Particulate fluid, primary seed | 0.30 ms | 5.01 ms | 6.78 ms | 17.50 ms | 0 | 0 |
| Result | Particulate fluid, alternate seed | 0.30 ms | 6.59 ms | 8.48 ms | 17.50 ms | 0 | 0 |

The worst seeded result measured 8.48 ms GPU p95, 8.19 ms below the 16.67 ms GPU frame budget. CPU p95 remained below the paired normal graph, with zero dropped-threshold frames and zero long tasks. Absolute GPU timings vary between launches; the result's worst paired fluid overhead was 2.56 ms.

## Visual captures

- `.recordings/director-graph-artifact-profile/20260805T081010733Z/artifact-fluid.png`
- `.recordings/director-graph-artifact-profile/20260805T081010733Z/artifact-fluid-alternate.png`

Both captures visibly retain their large seeded flow composition, but the material is now made from particles rather than a continuous bright sheet.
