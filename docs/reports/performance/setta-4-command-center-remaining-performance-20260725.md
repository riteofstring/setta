# Setta 4 Command Center - Remaining Integrated Performance Rows

Date: 2026-07-25

## Scope

This report records the remaining repository-actionable Phase 4 integrated
performance rows for the production Director command-center shell:

- navigation among 100 workstreams at laptop and emulated 4K tiers
- ten minutes of sustained activity and memory observation at laptop
- restart and durable replay at laptop and harness-standard tiers

The run uses the existing `director-command-center-performance` Electron
workflow and scripted Codex provider. It does not seek physical 4K, 6K, or phone
hardware, credentials, GUI-only setup, remote access, or side-by-side review on
representative real displays.

## Production Fixes

- The command-center renderer no longer treats selected workstream id changes as
  graph-buffer identity changes. The WebGL2 canvas receives a stable app-scoped
  packed graph id, so selection changes update chrome and rails without forcing
  graph replacement or buffer reset.
- Selection-only Director intents no longer preempt speech playback, enqueue
  receipt playback, or toggle the submit/action busy state.
- The workstream switch signal tear is stable DOM driven by view-state
  attributes instead of an element mounted and unmounted on every selection.
- The live command-center pixel probe now accepts sparse one-node live graphs
  across tiers by requiring peak energy, a non-medium peak cell, and at least
  two occupied cells in the fixed 32x32 grid. Cleared non-preserved buffers still
  fail because their peak and occupied-cell values are zero.

## Commands

```sh
pnpm -C desktop build
node desktop/tests/electron/director-command-center-performance.test.mjs \
  --skip-build \
  --keep-artifacts \
  --scenario navigate-100-workstreams
node desktop/tests/electron/director-command-center-performance.test.mjs \
  --skip-build \
  --keep-artifacts \
  --scenario restart-durable-replay
node desktop/tests/electron/director-command-center-performance.test.mjs \
  --skip-build \
  --keep-artifacts \
  --scenario sustained-activity
```

## Results

All selected rows passed.

| Tier / scenario                       | Frames |       p95 / p99 / max | Long tasks | Frames >50 ms | DOM | Dots |
| ------------------------------------- | -----: | --------------------: | ---------: | ------------: | --: | ---: |
| Laptop / navigate 100 workstreams     |     61 | 10.3 / 10.4 / 10.4 ms |          0 |             0 | 169 |   19 |
| 4K / navigate 100 workstreams         |     60 | 10.2 / 10.3 / 10.3 ms |          0 |             0 | 182 |   19 |
| Laptop / restart durable replay       |     58 |  9.4 / 10.0 / 10.3 ms |          0 |             0 | 110 |    1 |
| Harness / restart durable replay      |     60 |   9.0 / 9.6 / 9.6 ms  |          0 |             0 | 110 |    1 |
| Laptop / sustained activity, 10 min   | 72,021 | 10.0 / 10.3 / 10.5 ms |          0 |             0 | 163 |    1 |

The sustained row retained no measured heap growth beyond the workflow's
reported 9.54 MB start, peak, and end values. The 100-workstream rows preserved
the 19-dot visible workstream bound. Every row passed the canvas pixel probe and
finished with a clean renderer console.

Artifacts:

- navigation among 100 workstreams:
  `.recordings/director-command-center-performance/20260725T132628684Z/`
- restart and durable replay:
  `.recordings/director-command-center-performance/20260725T132652397Z/`
- ten-minute sustained activity:
  `.recordings/director-command-center-performance/20260725T130725587Z/`

## Remaining Phase 4 Work

The repository-actionable integrated performance rows are complete. Phase 4
still needs the side-by-side mockup fidelity review and any review-driven polish.
Physical 4K, 6K, and phone hardware measurements and side-by-side review on
representative real displays remain release gates; they were not retried in this
repository-only pass.
