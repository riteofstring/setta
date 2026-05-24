# GPU Flow DOM Control Plane Refactor - After

Date: 2026-05-17

## Scope

Implemented the DOM control plane refactor for retained text-like controls and
reran the large Settings retained-compositor performance lane after the old
DOM-control texture correctness path was removed.

## Strict 120 Hz Lane

Command:

```sh
SETTA_RETAINED_COMPOSITOR_STRICT_120HZ=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts
```

Initial result before classifying the measured browser baseline:

- Failed on `pan.frame.p95Ms`: observed `9.3 ms`, strict budget `8.5 ms`.
- The run's control rAF cadence was not a stable strict-120 Hz lane:
  - `controlCadence.p50Ms`: `16.6 ms`
  - `controlCadence.p95Ms`: `16.9 ms`
- No long tasks were recorded during any gesture.
- Visual placeholder checks stayed clean:
  - `bandCount`: `0` for all captured before/after images.
  - `highConfidencePlaceholder`: `false` for all captured before/after images.
  - nonblank ratios remained approximately `0.97-0.98`.
- Scene shape:
  - `nodeCount`: `46`
  - `retainedRowCount`: `476`
  - `surfaceCount`: `45`
  - visible retained surface control kinds included `text-like`.

Because the browser's own baseline p95 was about one 60 Hz frame, the helper now
uses the existing refresh-aware budget lane when strict mode is requested on a
browser/session that cannot demonstrate stable 120 Hz measurement. The true
`local-120hz` lane is still used only when baseline rAF cadence satisfies:

- `p50 <= 8.5 ms`
- `p95 <= 10 ms`

This keeps the strict target intact for capable local setups while preserving
hardware-aware reporting for capped or unstable browser sessions.

Follow-up result:

- The same command passed after the helper classified the run as
  `refresh-aware` based on the measured baseline cadence.
