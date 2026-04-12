# Settings Graph Main-Reference Post-Readiness Stall Classification

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Slice

Split the canonical `capture motion perf` probe phase into explicit inner
subphases so a fresh rerun can say whether the current blocker is inside
capture startup, wheel replay, capture stop, or somewhere earlier in the test.

## Files

- `frontend/tests/e2e/settings/settings-view-modes-main-reference.spec.ts`

## Verification

- `pnpm -C frontend exec prettier --write tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - formatted the updated spec
- `pnpm -C frontend exec prettier --check tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - passed
- `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-010/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-010/main-ai.log`
  - logged:
    - `settings-graph-probe-phase-start reference: bootstrap page`
    - `settings-graph-probe-phase-start reference: open settings`
    - `settings-graph-reference-open-settings-progress` at `69ms`,
      `1618ms`, and `29677ms`
  - the final readiness snapshot still reached mounted `All Settings` on
    read-only `main`:
    - `graphSurfaceMounted=true`
    - `settingsContentMounted=true`
    - `projectIsLoading=false`
    - `legacyPaneCount=1`
    - `visibleArticleCount=323`
  - after that snapshot, the probe emitted no new
    `settings-graph-probe-phase-start` lines for any
    `reference: bring target page to front`, `reference: restore initial view
    mode layout`, `reference: capture motion perf: ...`, or matching worktree
    phases during an additional bounded wait window, so the run was terminated
    manually instead of reaching the perf payload

## Reading

- The current blocker is narrower than the prior coarse `capture motion perf`
  label suggested.
- On this runtime, the canonical probe now proves the stall happens after the
  read-only `main` page becomes visually ready but before
  `captureNormalizedMotionPerf(...)` logs its first phase.
- That means the next bounded investigation should target the synchronous setup
  immediately after `bootstrapReferenceSettingsPage(referencePage)` returns:
  project-config id lookup, project-state fetch, or named-section resolution,
  rather than the wheel replay or motion-capture stop path.
