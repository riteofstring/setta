# Direct settings open phase classification

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`

## Goal

Classify which direct `/settings` startup phase a fresh worktree page is
actually waiting on before the normalized canary lane runs, so fresh CDP checks
do not treat the transient loading shell as unexplained renderer drift.

## Code paths touched

- `frontend/src/App.tsx`
- `frontend/src/components/Pages/GlobalWrapper.tsx`
- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphDirectOpenState.ts`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Slice

- added explicit direct-open phase markers to the app-router suspense fallback
  and the global app loading shell
- added a small shared direct-open phase resolver so test/probe code reads the
  same state model instead of inferring from loading copy
- updated the worktree settings readiness wait to log phase transitions and
  report the last classified phase on timeout

## Verification

- `pnpm -C frontend exec vitest run src/App.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphDirectOpenState.test.ts`
  - passed (`7` tests)
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-046/worktree-ai.log`
  - passed (`1` Playwright test, `58.1s`)

## Readout

- fresh direct `/settings` open on the live worktree reported this sequence
  before the canary lane executed:
  - `67ms`: `app_router_loading`
  - `2456ms`: `settings_loading`
  - `4000ms`: `app_shell_without_surface`
  - `7938ms`: `project_loading`
  - `22362ms`: `surface_ready`
- the worktree probe still reached the same canary lane and target section
  `rotaryParamCodeObjDefault`
- the post-open motion capture still named
  `presentedSceneSectionSubtreeReactRender` as the dominant owner
  (`913.9999999403954ms` total, `273.40000000596046ms` max)
- the previously closed `reactFlowViewportPublish` owner stayed at `0`

## Reading

- the fresh direct-open stall is not a single indefinite app-router fallback;
  it steps through distinct startup owners and does eventually reach the canary
  on this runtime
- the largest visible delay before a surface is ready now sits between
  `project_loading` and `surface_ready`, not in the initial suspense fallback
- the next default frontier should use the new phase markers during CDP checks,
  then pivot back to the measured canary owner
  `presentedSceneSectionSubtreeReactRender` unless fresh visual evidence shows a
  new product blocker
