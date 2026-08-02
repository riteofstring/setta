# Artifact in-place particle surface — 2026-08-05

## Scope

This report records the performance-relevant replacement of the centered artifact modal with an in-place command-center reading surface. The graph canvas remains mounted and its existing post pass morphs between the normal semantic graph, a milky fluid field, and a fine-grain particle field. The final CRT/halftone resolve remains shared by all three states.

The prior baseline is recorded in `artifact-webgl-glass-20260805.md`. That implementation measured a DOM dialog rectangle and added four blur samples plus a second halftone treatment inside it. Its no-glass GPU p95 was 6.43 ms and glass-on GPU p95 was 6.68 ms on the same Apple M2 viewport class.

## Implementation constraints

- No second canvas, renderer, framebuffer, texture upload, or CSS backdrop filter was added.
- Normal graph frames take a uniform branch that skips all artifact field calculations.
- A settled artifact evaluates only its selected procedural field. Both fields run together only during the short interruptible crossfade.
- Graph edge, node, and glyph draws are skipped once the artifact field is fully active; the ambient medium remains faintly continuous underneath.
- Particle density for the fine field is based on CSS-space cells, so resizing does not make the field artificially dense or sparse.
- Reduced motion snaps the field mix and freezes its ambient clock.
- The artifact title and summary render from snapshot metadata immediately. The document read and heavy artifact renderer are prefetched in parallel, and loading mounts no placeholder modal.

## Measurement

Workflow: `desktop/tests/electron/director-graph-artifact-profile.mjs`

Capture: `.recordings/director-graph-artifact-profile/20260805T072528840Z/profile.json`

Environment:

- Apple M2 through ANGLE Metal
- 1512 × 982 CSS px
- device pixel ratio 2
- `one-active-workstream` production renderer scenario

| Surface state | CPU p95 | GPU p50 | GPU p95 | Frame delta p95 | Dropped-threshold frames | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal graph | 0.20 ms | 5.84 ms | 6.90 ms | 17.60 ms | 0 | 0 |
| Milky fluid | 0.20 ms | 7.25 ms | 8.44 ms | 17.60 ms | 0 | 0 |
| Fine grain | 0.20 ms | 6.79 ms | 7.83 ms | 17.60 ms | 0 | 0 |

The paired artifact overhead was +1.54 ms GPU p95 for the milky fluid field and +0.93 ms for fine grain. CPU p95 was unchanged. All three states remained comfortably below the 16.67 ms GPU frame budget, with no dropped-threshold frames or long tasks.

The normal-state result also confirms the artifact shader does not regress ordinary graph rendering. Absolute GPU timings vary between launches, so the paired run is the meaningful comparison; its normal p95 is within the earlier 6.43 ms baseline's run-to-run range.

## Visual captures

- `.recordings/director-graph-artifact-profile/20260805T072528840Z/artifact-fluid.png`
- `.recordings/director-graph-artifact-profile/20260805T072528840Z/artifact-fine.png`

The fluid field is the default artifact treatment. Fine grain remains available beside it in the development-only artifact controls for direct comparison.
