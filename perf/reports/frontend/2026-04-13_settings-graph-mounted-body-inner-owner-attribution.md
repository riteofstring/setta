# Settings Graph Mounted Body Inner Owner Attribution

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`
Owner: mounted section body subtree attribution

## Goal

Split the existing canary-side `presentedSceneSectionBodySubtreeReactRender`
bucket into the next inner owners before taking another mounted-body product
reduction.

## Change

- extended
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts`
  with:
  - `presentedSceneSectionHeaderReactRender`
  - `presentedSceneSectionBodyContentReactRender`
- updated `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  so the mounted section header branch and mounted body-content branch each
  report their own `React.Profiler` durations into the shared canary motion
  snapshot
- updated:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.subscription.test.tsx`
  - the existing worktree/main-reference probe expectations under
    `frontend/tests/e2e/settings/`

## Why This Slice

- items `423` and `424` were both bounded mounted-body product hypotheses that
  did not move the dominant owner
- the plan/handoff budget for this lane says the next step should name the next
  inner owner before another product cut rather than repeating the same
  selector-pruning pattern

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Section/Container/SectionContainerCoreResizabe.subscription.test.tsx`
  - passed (`2` files, `9` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Section/Container/SectionContainerCoreResizabe.subscription.test.tsx tests/e2e/settings/settings-view-modes.spec.ts tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-050/worktree-ai.log`
  - passed (`1` Playwright test, `1.3m`)
- fresh-context headless CDP smoke on `http://127.0.0.1:3075/settings`
  - page rendered the expected loading shell rather than the mounted graph
    surface
  - visible text: `PREPARING SETTA`, `Loading settings…`,
    `Backend: Starting backend services`

## Readout

- direct-open phase sequence on the worktree:
  - `32ms app_router_loading`
  - `2345ms settings_loading`
  - `4384ms app_shell_without_surface`
  - `8360ms project_loading`
  - `20366ms surface_ready`
- canonical target stayed `rotaryParamCodeObjDefault`
- worktree canary still reached `surfaceKind: "canary"`
- dominant outer owner remained
  `presentedSceneSectionSubtreeReactRender`
  - `869.3ms` total, `208.3ms` max, `30` commits
- new inner split of the mounted body subtree:
  - `presentedSceneSectionBodyContentReactRender`
    - `527.2ms` total, `67.3ms` max, `24` commits
  - `presentedSceneSectionHeaderReactRender`
    - `202.5ms` total, `30.4ms` max, `24` commits
  - `presentedSceneSectionBodySubtreeReactRender`
    - `849.5ms` total, `104.9ms` max, `32` commits

## Reading

- the mounted body-content branch is now the named next inner owner on the
  canonical lane; the header branch is materially smaller
- the next product slice should stay inside body content rather than reopen
  default-header cleanup
- direct `/settings` smoke still lands on the loading shell first, so keep
  treating that as route-startup state instead of renderer drift
