# Settings graph worktree-only motion probe

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Bypass the unstable cross-worktree bootstrap/global-setup lane and recover one
fresh numeric motion-attribution reading on the live worktree canary only.

## Slice

- added a dedicated worktree-only Playwright probe in
  `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
  for the normalized `All Settings` `rotaryParamCodeObjDefault` pan/zoom lane
- added `scripts/run-settings-graph-worktree-probe.sh` so the probe resolves
  current runtime facts from `dev-runtime-info.sh` before running
- tightened `frontend/tests/e2e/global-setup.ts` so bootstrap waits for the
  expected authenticated shell URL by polling the current page URL instead of
  relying on a navigation event that can already be missed on this runtime

## Verification

- `pnpm -C frontend exec prettier --check tests/e2e/global-setup.ts tests/e2e/settings/settings-view-modes.spec.ts`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-046/worktree-ai.log`
  - passed (`1` test, `1.4m`)

## Result

- fresh live worktree reading on the canonical lane:
  - dominant owner: `interactionMiscStateSync`
  - `interactionMiscStateSync`: `11` calls, `1.0ms` total
  - `interactionReactFlowStateSync`: `0` calls, `0ms` total
  - `pixiDrawableModelResolve`: `36` calls, `0.8ms` total
  - `presentedSceneBodyMountFilter`: `40` calls, `0.5ms` total
  - `presentedSceneSectionVisibilityFilter`: `40` calls, `0.5ms` total
  - `reactFlowViewportPublish`: `0`
  - `reactFlowTransformSubscriptionCallback`: `0`
  - `reactFlowTransformFollowerCallback`: `0`
- probe health reading:
  - the live worktree can now produce a fresh numeric attribution sample
    without the read-only `main` bootstrap lane
  - the old global-setup `page.waitForURL(...)` stall was probe-health debt,
    not a renderer regression on the worktree canary

## Reading

- this slice closes the immediate measurement blocker that remained after item
  `356`
- the next product-side frontier should follow the new live ranking instead of
  continuing blind `interactionReactFlowStateSync` micro-splits
- the next bounded investigation should isolate the concrete mounted surfaces or
  shared writes inside `interactionMiscStateSync`, with `pixiDrawableModelResolve`
  and presented-scene filters as the current secondary residuals
