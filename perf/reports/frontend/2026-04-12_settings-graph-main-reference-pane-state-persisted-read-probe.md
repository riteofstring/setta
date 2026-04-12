# Settings Graph Main-Reference Pane-State Persisted-Read Probe

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Remove the `getLocalPaneState(...)` page-side dynamic import from the
canonical main-reference performance probe's initial pane-state capture and
rerun the lane on the current runtime to see whether the repeated
`worktree: capture initial pane state` timeout was caused by that import path.

## Change

- `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts`
  now parses the persisted `setta_data` payload first via
  `readPersistedSettingsGraphLocalPaneState(...)` before falling back to the
  page-side Zustand import.
- Added focused parser coverage in
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`.

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`
  -> passed (`1` file, `3` tests)
- `pnpm -C frontend exec prettier --check tests/e2e/settings/graphSubstrateParityProbe.ts src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`
  -> passed
- `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-016/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-016/main-ai.log`
  -> still failed on the same phase:
  `Timed out after 30000ms during settings graph probe phase: worktree: capture initial pane state.`

## Reading

- This pass closes the "page-side local-storage import is the blocker"
  hypothesis for the canonical probe lane on the current runtime.
- The repeated timeout survived a persisted-state fast path, so the next
  default iteration should not spend another pass on this same probe shape.
- Sequencing should pivot back to product-side work on the existing measured
  owner `interactionReactFlowStateSync`, unless a fresh runtime later produces
  new evidence that the pane-state capture path itself changed.
