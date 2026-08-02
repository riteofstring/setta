# Restored large fluid and particle flow — 2026-08-05

## Scope

This report records the split of the artifact surface into two distinct treatments:

- **Large fluid** restores the smooth, milky analytic field captured before the fine-particle replacement.
- **Particle flow** keeps the same broad fluid character, but resolves it from the larger luminous particle bodies used by the main chat graph rather than the former fine lattice.

This supersedes the visual result described in `artifact-particulate-fluid-20260805.md`; that earlier report remains unchanged as historical measurement.

## Implementation constraints

- Large fluid again evaluates the continuous seeded sheet, seam, and undertow field directly. It contains no particle lattice.
- Particle flow is a separate artifact style with two counter-moving procedural currents.
- Its CSS-space particles resolve to approximately 5–11 px bodies, matching the main graph field, and remain stable across device-pixel ratio, viewport, and quality changes.
- Particle brightness belongs to each unbounded particle ID, so particles travel through the current instead of appearing stationary while a screen-space mask passes over them.
- Both styles remain in the existing post pass. No second canvas, framebuffer, texture upload, blur pass, or DOM animation loop was added.
- Artifact seeds remain stable per artifact. Reduced motion snaps the style transition and holds the ambient clock.

## Measurement

Workflow: `desktop/tests/electron/director-graph-artifact-profile.mjs`

Historical smooth-fluid reference: `.recordings/director-graph-artifact-profile/20260805T073912574Z/profile.json`

Result: `.recordings/director-graph-artifact-profile/20260805T082946220Z/profile.json`

Environment: Apple M2 through ANGLE Metal, 1512 × 982 CSS px, device pixel ratio 2, full quality, `one-active-workstream`.

| Surface state | CPU p95 | GPU p50 | GPU p95 | Frame delta p95 | Dropped-threshold frames | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal graph | 0.70 ms | 4.46 ms | 5.57 ms | 17.60 ms | 0 | 0 |
| Restored large fluid | 0.60 ms | 5.94 ms | 7.70 ms | 17.70 ms | 0 | 0 |
| Particle flow, primary seed | 0.60 ms | 6.54 ms | 8.70 ms | 17.60 ms | 0 | 0 |
| Particle flow, alternate seed | 0.50 ms | 6.23 ms | 8.24 ms | 17.60 ms | 0 | 0 |
| Particle flow, later frame | 0.50 ms | 6.02 ms | 8.43 ms | 17.70 ms | 0 | 0 |

The worst particle-flow capture measured 8.70 ms GPU p95, 7.97 ms below the 16.67 ms GPU frame budget. Every state recorded zero dropped-threshold frames and zero long tasks. The later-frame capture confirms that continuous generation does not add time-dependent cost.

## Visual captures

- Restored large fluid: `.recordings/director-graph-artifact-profile/20260805T082946220Z/artifact-large-fluid.png`
- Particle flow, primary seed: `.recordings/director-graph-artifact-profile/20260805T082946220Z/artifact-particle-flow-a.png`
- Particle flow, later frame: `.recordings/director-graph-artifact-profile/20260805T082946220Z/artifact-particle-flow-b.png`
- Particle flow, alternate seed: `.recordings/director-graph-artifact-profile/20260805T082946220Z/artifact-particle-flow-alternate.png`
- Pre-replacement smooth-fluid reference: `.recordings/director-graph-artifact-profile/20260805T073912574Z/artifact-fluid.png`

The restored large-fluid capture retains the same broad bright mass, central negative channel, lower fold, and milky material as the pre-replacement reference. The particle-flow captures use the larger clustered bodies visible in populated main-chat graph recordings while preserving a fluid-scale composition and continuous movement.
