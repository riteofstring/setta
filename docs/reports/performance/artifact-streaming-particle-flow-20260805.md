# Streaming artifact particle flow — 2026-08-05

## Scope

This report records the replacement of the screen-anchored particulate artifact field with continuously generated particle streams. The artifact choices are now `particle-flow` and `fluid`; the fine-grain option and implementation were removed directly. Particle flow is the default, and Fluid restores the earlier broad milky field.

## Motion model

- Two deterministic CSS-space particle layers move in opposite vertical directions.
- Particle cells are 13–18 CSS px with variable 5–11 CSS px bodies, matching the authored point-size range of the main graph medium.
- Seeded speed varies from 12–22 CSS px per second, with continuous horizontal meander and a smaller cross-current.
- Vertical particle coordinates are unbounded. Each integer cell entering beyond the viewport hashes to a new particle, so there is no finite texture edge or screen-sized repeated tile.
- Broad fluid density belongs to the unbounded particle ID. Particles carry their brightness while moving instead of remaining fixed and lighting up when a field passes over them.
- Artifact IDs still provide stable variation, and switching artifacts smoothly advances the seed uniforms.
- Reduced motion freezes the local artifact clock through the existing canvas policy.

The implementation remains in the existing post pass and adds no canvas, framebuffer, texture, upload, blur sample, DOM animation loop, or per-frame React state.

## Measurement

Workflow: `desktop/tests/electron/director-graph-artifact-profile.mjs`

Baseline: `.recordings/director-graph-artifact-profile/20260805T081010733Z/profile.json`

Result: `.recordings/director-graph-artifact-profile/20260805T082946220Z/profile.json`

Environment: Apple M2 through ANGLE Metal, 1512 × 982 CSS px, device pixel ratio 2, full quality, `one-active-workstream`.

| Run | Surface state | CPU p95 | GPU p50 | GPU p95 | Frame delta p95 | Dropped-threshold frames | Long tasks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | Normal graph | 0.40 ms | 3.89 ms | 5.93 ms | 17.40 ms | 0 | 0 |
| Baseline | Screen-anchored particulate fluid, primary seed | 0.30 ms | 5.01 ms | 6.78 ms | 17.50 ms | 0 | 0 |
| Baseline | Screen-anchored particulate fluid, alternate seed | 0.30 ms | 6.59 ms | 8.48 ms | 17.50 ms | 0 | 0 |
| Result | Normal graph | 0.70 ms | 4.46 ms | 5.57 ms | 17.60 ms | 0 | 0 |
| Result | Particle flow, primary seed | 0.60 ms | 6.54 ms | 8.70 ms | 17.60 ms | 0 | 0 |
| Result | Particle flow, same seed later | 0.50 ms | 6.02 ms | 8.43 ms | 17.70 ms | 0 | 0 |
| Result | Particle flow, alternate seed | 0.50 ms | 6.23 ms | 8.24 ms | 17.60 ms | 0 | 0 |
| Result | Restored large fluid | 0.60 ms | 5.94 ms | 7.70 ms | 17.70 ms | 0 | 0 |

The worst particle-flow capture measured 8.70 ms GPU p95, 7.97 ms below the 16.67 ms GPU frame budget. CPU p95 stayed below the paired graph result, and every state recorded zero dropped-threshold frames and zero long tasks.

## Motion and visual captures

- `.recordings/director-graph-artifact-profile/20260805T082946220Z/artifact-particle-flow-a.png`
- `.recordings/director-graph-artifact-profile/20260805T082946220Z/artifact-particle-flow-b.png`
- `.recordings/director-graph-artifact-profile/20260805T082946220Z/artifact-particle-flow-alternate.png`
- `.recordings/director-graph-artifact-profile/20260805T082946220Z/artifact-large-fluid.png`

The first two frames use the same artifact seed and are separated by one 4.3-second profile run. Their whole-frame SSIM is 0.502, confirming substantial motion between captures. The alternate seed changes the large flow composition, while the final capture verifies the restored broad fluid option.
