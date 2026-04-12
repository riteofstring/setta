# 2026-04-14 Settings Graph Pane State Local Storage Fast Path

- canonical lane: `rotaryParamCodeObjDefault`
- goal: recover the shared worktree probe after `getLocalPaneState(...)`
  started timing out while waiting on `page.context().storageState()`
  during compare-pane preflight
- support slice:
  - make `getLocalPaneState(...)` read persisted `setta_data` directly from the
    live page `localStorage` first
  - keep the existing in-page zustand-store read as the main fallback when the
    persisted pane state is absent
  - demote the browser-context `storageState()` snapshot path to a final
    fallback instead of the default first read

## Focused verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`
  - passed (`1` file, `11` tests)
- `pnpm -C frontend exec prettier --check tests/e2e/settings/graphSubstrateParityProbe.ts src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.ts src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`
  - passed

## Live canonical probe

- first rerun after the code change reused a stale bootstrap token and failed in
  Playwright global setup with `401 Unauthorized`; refreshed the worktree token
  from the current session and reran the same probe
- rerun with fresh runtime facts:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3075 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8075 SETTA_BOOTSTRAP_TOKEN='<fresh token>' pnpm -C frontend exec playwright test tests/e2e/settings/settings-view-modes.spec.ts --grep 'settings graph worktree performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on the live canary' --reporter=line --timeout=180000`
  - passed (`1` Playwright test, `1.3m`)

## Readout

- this slice is a probe-health recovery, not a product perf win claim
- fresh readout on the recovered lane:
  - `presentedSceneSectionSubtreeReactRender`
    `1351.1ms total` / `402.3ms max`
  - `presentedSceneSectionBodySubtreeReactRender`
    `1333.8ms total` / `153.0ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `708.6ms total` / `93.8ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `668.1ms total` / `89.8ms max`
  - `presentedSceneSectionParamInputReactRender`
    `375.3ms total` / `13.0ms max`
  - `longTaskTotalDurationMs`
    `1811`
  - `averageFrameDurationMs`
    `58.33`

## Reading

- the canonical probe is trustworthy again on the current worktree after the
  local-storage fast path
- keep canonical target section `rotaryParamCodeObjDefault`
- the remaining dominant owner is still
  `presentedSceneSectionSubtreeReactRender`, so the next pass should return to
  attribution or a bounded production cut inside that subtree rather than more
  pane-state recovery work
