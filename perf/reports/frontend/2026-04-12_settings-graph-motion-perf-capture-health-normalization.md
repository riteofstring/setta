# Settings Graph Motion Perf Capture Health Normalization

Date: 2026-04-12
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: make the canonical main-reference motion probe distinguish hidden-tab
  throttling from real renderer cost before another product hypothesis is chosen.
- Slice: extend the shared motion-perf capture with visibility/focus health
  telemetry and assert those signals before frame-budget assertions.

## What changed

- Added capture-health fields to
  `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts`:
  - `pageHiddenDuringCapture`
  - `visibilityLossCount`
  - `hiddenDurationMs`
  - `focusLossCount`
  - `endedVisible`
- The capture now listens for `blur` and `visibilitychange`, accounts for any
  hidden interval that overlaps the measurement window, and cleans those
  listeners up when capture stops.
- Updated the canonical main-reference probe in
  `frontend/tests/e2e/settings/settings-view-modes-main-reference.spec.ts` to
  fail on capture-health drift before interpreting frame-time numbers.

## Verification

Commands:

```bash
pnpm -C frontend exec prettier --check tests/e2e/settings/graphSubstrateParityProbe.ts tests/e2e/settings/settings-view-modes-main-reference.spec.ts

scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-004/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-004/main-ai.log
```

Result:

- `prettier --check` passed.
- The canonical probe reached both reference and worktree motion-capture phases
  and printed capture-health metrics for both sides.
- Capture health stayed clean on both sides:
  - reference: `pageHiddenDuringCapture=false`, `visibilityLossCount=0`,
    `hiddenDurationMs=0`, `focusLossCount=0`, `endedVisible=true`
  - worktree: `pageHiddenDuringCapture=false`, `visibilityLossCount=0`,
    `hiddenDurationMs=0`, `focusLossCount=0`, `endedVisible=true`
- Measured motion output on the same fresh `run-004` pair:
  - reference legacy: average `39.01ms`, max `250ms`, `44` samples,
    `16` long tasks totaling `1222ms`
  - worktree canary: average `52.71ms`, max `499.9ms`, `43` samples,
    `7` long tasks totaling `1481ms`
- The probe failed on the existing canary perf threshold:
  `expect(worktreeResult.perf.averageFrameDurationMs).toBeLessThan(40)`.

## Reading

- The earlier anomalous slow legacy-reference number is not explained by the
  page becoming hidden or unfocused during capture on this runtime.
- On the fresh `run-004` pair, the reference side is back under the average
  threshold, so the active blocker is the worktree canary itself rather than
  read-only `main` probe health.
- The next product slice should target the now-measured canary motion cost on
  `rotaryParamCodeObjDefault`, using the new capture-health signals only as a
  guard against future throttling noise.
