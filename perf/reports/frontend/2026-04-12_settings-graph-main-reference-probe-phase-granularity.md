# Settings Graph Main-Reference Probe Phase Granularity

Date: 2026-04-12
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: stop the canonical perf probe from collapsing multiple worktree
  normalization actions into one opaque timeout bucket.
- Slice: split `captureNormalizedMotionPerf(...)` setup into distinct probe
  phases for:
  - target-page focus
  - initial layout restore
  - compare-pane normalization
  - active-section clearing
  - active view mode + viewport reset

## Verification

Commands:

```bash
pnpm -C frontend exec prettier --check tests/e2e/settings/settings-view-modes-main-reference.spec.ts

BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-006/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-006/main-ai.log
```

Results:

- `prettier --check` passed.
- The canonical probe rerun did not reach the new worktree normalize subphases
  because the read-only `main` bootstrap regressed first:
  - `reference: open settings` timed out after the readiness poll kept seeing
    `graphSurfaceMounted=false`, `settingsContentMounted=false`, and
    `projectIsLoading=true`

## Reading

- This slice did not change renderer/product behavior; it tightens the probe so
  the next setup timeout on the worktree side points at one concrete normalize
  step instead of the old coarse `worktree: normalize surface` bucket.
- The fresh `run-006` blocker is no longer the earlier reference-side DOM
  inflation theory; it is a renewed read-only `main` startup/readiness failure
  before motion capture begins.
