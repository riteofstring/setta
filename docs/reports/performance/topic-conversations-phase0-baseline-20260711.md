# Topic Conversations Phase 0 Easy Button Baseline

Date: 2026-07-11

## Scope

This is the pre-cutover functional and working-state frontend performance
baseline required by Phase 0 of
`docs/plans/topic-conversations-global-master-narrator-20260711.md`. It records
the current production Electron/main/preload/renderer/HTTP/store behavior before
the conversation architecture changes begin. It is not a mockup-parity gate and
does not claim any future topic-conversation, narrator, master, or active-turn
fork behavior.

Baseline source revision:
`693db159de1cf4f3fb87e9c11a65a05b93d29af7`.

Environment:

- macOS 26.5.1 (25F80), arm64
- production Electron build from `pnpm -C desktop build`
- scripted provider selected through
  `SETTA_E2E_CHAT_HARNESS=scripted-workflow`
- temporary app data and disposable workspace fixtures owned by the Electron
  harness

Repo-local artifacts:

- `.recordings/topic-conversations-phase0/easy-button-workflow-20260711`
- `.recordings/topic-conversations-phase0/easy-button-performance-20260711`

The recording directories are local diagnostic artifacts and are intentionally
not committed. Their `summary.json`, structured logs, screenshots, HTTP trace,
IPC trace, and renderer event trace were present and inspected when this report
was written.

## Functional baseline

Command:

```bash
node desktop/tests/electron/easy-button-pane-workflow.test.mjs \
  --skip-build \
  --keep-artifacts \
  --artifact-dir \
  .recordings/topic-conversations-phase0/easy-button-workflow-20260711
```

Result: passed.

The owner workflow exercised the production paths for:

- toolbar and keyboard-shortcut pane opening, pane close, and layout reload
- sequential Easy Run completion and restoration of terminal projection
- in-flight steering with lossless trigger/steering chat records and focus
  revision presentation
- narrator degradation without stopping the primary run, plus a partial
  steering outcome
- typed table, chart, file, and link artifacts and the artifact-cap failure
  path
- long request layout on desktop and compact/mobile presentation
- working and terminal narrator highlights, stopping a working run, reduced
  motion, and frozen-pane animation behavior
- rejection of a second workspace-global Easy Run while one is active
- backend restart during active work and explicit failed recovery presentation

The one-active-run rejection is intentionally recorded as current behavior, not
as target behavior. Phase 2 and Phase 3 replace it with per-conversation
serialization and cross-conversation concurrency.

## Performance method

Command:

```bash
node desktop/tests/electron/easy-button-pane-performance.test.mjs \
  --skip-build \
  --keep-artifacts \
  --artifact-dir \
  .recordings/topic-conversations-phase0/easy-button-performance-20260711
```

Result: passed.

The production workflow sampled each state for 1,200 ms using the browser frame
sampler. The guard uses the observed 120 Hz frame budget of 8.33 ms, permits a
p95 multiplier of 1.35 and p99 multiplier of 2, requires at least 20 frames per
sample, and rejects long tasks or material frame stalls.

| State          | Frames | Average FPS |     p50 |     p95 |     p99 |     Max | Long tasks | Frames over 16 ms |
| -------------- | -----: | ----------: | ------: | ------: | ------: | ------: | ---------: | ----------------: |
| Idle           |    143 |      120.01 | 8.30 ms | 8.80 ms | 9.20 ms | 9.20 ms |          0 |                 0 |
| Working        |    142 |      120.07 | 8.30 ms | 9.10 ms | 9.30 ms | 9.40 ms |          0 |                 0 |
| Complete       |    142 |      120.06 | 8.30 ms | 9.00 ms | 9.20 ms | 9.30 ms |          0 |                 0 |
| Frozen working |    142 |      119.99 | 8.30 ms | 8.90 ms | 9.10 ms | 9.30 ms |          0 |                 0 |

The working sample had the Easy Button glow and swirl animations running. The
frozen working sample reported the glow, breathe, and all three swirl layer
animations as paused. The terminal sample was reached by stopping the scripted
working run and rendered: “The run was stopped before finishing. Stopped after
3 seconds with no artifacts.”

## Comparison boundary

The after-cutover performance report must compare against these same
production-path measurements while adding the plan's new stress dimensions:

- multiple independently working Easy Button panes
- interleaved conversation event streams and batched keyed store application
- duplicate views of one conversation
- large conversation trajectories and a virtualized, paged navigator
- hidden/snapshot pane behavior during work
- global capture stability across pane churn and global playback arbitration

This baseline covers the current singleton Easy Button only. It therefore
cannot prove the future multi-conversation budgets, but it fixes the current
frame-time and functional reference without making visual mockup fidelity an
acceptance criterion.
