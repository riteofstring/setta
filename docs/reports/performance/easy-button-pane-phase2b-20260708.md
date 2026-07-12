# Easy Button Pane Phase 2b Performance - 2026-07-08

## Scope

Phase 2b adds the Easy Button footer input, working/complete visual states,
and production-path start/stop controls. The measured surface remains DOM/CSS
only; no artifact rail rendering is active in this phase.

## Method

- Baseline: `node desktop/tests/electron/easy-button-pane-performance.test.mjs --skip-build --artifact-dir .recordings/easy-button-phase2b-baseline-current`
- After: `node desktop/tests/electron/easy-button-pane-performance.test.mjs --skip-build --artifact-dir .recordings/easy-button-phase2b-performance-after`
- Build used for after measurement: `pnpm -C desktop build`
- Harness: Electron production main/preload/renderer build, scripted workflow backend.

## Results

| State | Run | Avg FPS | p50 frame | p95 frame | p99 frame | Max frame | Long tasks | Frames over 16ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Idle | Baseline | 119.20 | 8.30ms | 8.80ms | 9.40ms | 16.70ms | 0 | 1 |
| Idle | After | 118.35 | 8.30ms | 9.30ms | 9.40ms | 17.40ms | 0 | 1 |
| Frozen | Baseline | 120.05 | 8.30ms | 9.10ms | 9.20ms | 9.30ms | 0 | 0 |
| Frozen | After | 120.06 | 8.30ms | 9.20ms | 9.30ms | 9.40ms | 0 | 0 |

## Notes

- The after run passed the existing frame budget guardrails.
- The frozen state verified `animation-play-state: paused` through the
  production Electron workflow.
- Artifacts:
  - Baseline: `.recordings/easy-button-phase2b-baseline-current`
  - After: `.recordings/easy-button-phase2b-performance-after`
