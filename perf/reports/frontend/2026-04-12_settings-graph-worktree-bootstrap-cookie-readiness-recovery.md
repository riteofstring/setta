# Settings graph worktree bootstrap cookie-readiness recovery

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Recover the worktree-only motion probe after the bootstrap/global-setup path
regressed on a shell selector that does not always render before auth is
already established.

## Slice

- extracted the global-setup URL matching helper into
  `frontend/tests/e2e/globalSetupUtils.ts`
- added `waitForAuthenticatedShellReady(...)` so Playwright global setup now
  treats either of these as success on the expected frontend URL:
  - `.setta-titlebar-offset` is attached
  - a `setta_auth_*` cookie already exists in the browser context
- kept the existing expected-URL polling in `frontend/tests/e2e/global-setup.ts`
  and replaced the unconditional `.setta-titlebar-offset` wait with the new
  readiness helper

## Verification

- `pnpm -C frontend exec prettier --check tests/e2e/global-setup.ts tests/e2e/globalSetupUtils.ts`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-048/worktree-ai.log`
  - passed (`1` test, `1.9m`)

## Result

- the worktree-only `rotaryParamCodeObjDefault` motion probe is healthy again
- fresh numeric sample on the canonical lane:
  - dominant owner: `interactionMiscStateSync`
  - `interactionMiscStateSync`: `9` calls, `8.1ms` total
  - `pixiDrawableModelResolve`: `36` calls, `1.6ms` total
  - `presentedSceneSectionVisibilityFilter`: `40` calls, `3.0ms` total
  - `presentedSceneBodyMountFilter`: `40` calls, `0.1ms` total
  - `interactionReactFlowStateSync`: `0` calls, `0ms`
  - `reactFlowViewportPublish`: `0` calls, `0ms`

## Reading

- on this runtime, bootstrap can establish auth before the frontend shell
  mounts the titlebar selector; the auth cookie is the more robust readiness
  signal for global setup
- this restores the numeric verification path for item `358` without reopening
  the closed cross-worktree probe lane
- the next product-side frontier remains inside the measured
  `interactionMiscStateSync` owner unless a new live reading moves the ranking
