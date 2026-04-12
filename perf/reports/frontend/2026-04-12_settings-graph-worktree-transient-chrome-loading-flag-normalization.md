# Settings Graph Worktree Transient Chrome Loading Flag Normalization

Date: 2026-04-12
Worktree: `setta.pixijs-graph`
Lane: canonical `rotaryParamCodeObjDefault` main-reference probe

## Summary

- The worktree-side canonical probe was repeatedly timing out at
  `worktree: normalize compare pane state`.
- A focused live Playwright inspection on the worktree `/settings` route showed
  the actual pane state already settled:
  - overview and UI editor panes were closed
  - no pane fullscreen buttons were visible
  - the header notification faded away
  - the settings surface remained mounted and visible
- The only stale signal was `useProjectLoading.getState().projectIsLoading`,
  which stayed `true` after the settings content was already interactive.

## Change

- Moved the transient-chrome settled predicate into
  `src/components/Pages/Project/graphSubstrate/settingsGraphCompareTransientChrome.ts`.
- Updated `tests/e2e/settings/graphSubstrateParityProbe.ts` to treat compare
  pane normalization as settled when:
  - the graph surface is mounted
  - visible settings content is mounted
  - the transient header notification is gone
- Removed the previous dependency on `projectIsLoading === false` for this
  normalization step.

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphCompareTransientChrome.test.ts`
  - passed
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphCompareTransientChrome.ts src/components/Pages/Project/graphSubstrate/settingsGraphCompareTransientChrome.test.ts tests/e2e/settings/graphSubstrateParityProbe.ts`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-040/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-040/main-ai.log`
  - probe advanced past `worktree: normalize compare pane state`
  - current blocker moved to `Timed out after 30000ms during settings graph probe phase: worktree: capture initial pane state.`
