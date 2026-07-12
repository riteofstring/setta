# Easy Button Pane Phase 5 Working-State Performance

Date: 2026-07-09

## Scope

Phase 5 hardening extends the Easy Button performance guardrail from idle and
frozen-idle coverage to the reachable working animation state. The workflow now
starts a deterministic hidden easy run, samples the working state, freezes that
working state, verifies the glow, ring, and spinner animation play states are
paused, and then stops the run through the production Easy Button stop path.

## Method

- Baseline before the guardrail change:
  `node desktop/tests/electron/easy-button-pane-performance.test.mjs --skip-build --artifact-dir .recordings/easy-button-phase5-baseline-current`
- After:
  `node desktop/tests/electron/easy-button-pane-performance.test.mjs --skip-build --artifact-dir .recordings/easy-button-phase5-working-performance-final`
- Harness: Electron production main/preload/renderer build with
  `SETTA_E2E_CHAT_HARNESS=scripted-workflow`.
- Sample duration: 1200 ms per state.

## Results

| State | Run | Frames | Avg FPS | p50 frame | p95 frame | p99 frame | Max frame | Long tasks | Frames over 16ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Idle | Baseline | 142 | 120.17 | 8.30ms | 9.40ms | 9.70ms | 10.30ms | 0 | 0 |
| Frozen idle | Baseline | 141 | 120.06 | 8.30ms | 9.80ms | 10.10ms | 10.30ms | 0 | 0 |
| Idle | After | 142 | 119.98 | 8.30ms | 9.30ms | 9.80ms | 10.30ms | 0 | 0 |
| Working | After | 141 | 120.02 | 8.30ms | 9.60ms | 9.90ms | 10.20ms | 0 | 0 |
| Frozen working | After | 141 | 120.13 | 8.30ms | 9.70ms | 10.00ms | 10.30ms | 0 | 0 |

## Notes

- The focused performance workflow passed after adding the working-state sample.
- The working state reported the Easy Button glow, ring, and spinner animations
  as `running` before freeze.
- The frozen working state reported the glow, ring, and spinner animations as
  `paused`; the stopped terminal summary was
  `The run was stopped before finishing. Stopped after 3s - no artifacts`.
- No long tasks or frames over 16 ms were observed in the sampled states.
