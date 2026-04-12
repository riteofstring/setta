# Settings graph interaction misc-state sync attribution transition guard

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce the remaining `interactionMiscStateSync` hot-path work by skipping the
measured misc-store sync entirely when the effective `isPanScrolling` boolean
did not change.

## Slice

- changed
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts`
  so `syncViewportInteractionState(...)` computes the next pan-scrolling flag
  first and returns before entering `interactionMiscStateSync` attribution when
  the misc store already has the same value
- kept the existing root `data-viewport-interaction-active` attribute mirror in
  place so visible interaction state still updates exactly as before
- expanded
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  so the repeated interaction-sync sequence now proves both:
  - only two misc-store writes occur for the two real boolean transitions
  - `interactionMiscStateSync` attribution count also stays at `2`

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  - passed (`1` file, `11` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-049/worktree-ai.log`
  - failed before the live motion lane could capture attribution
  - blocker:
    `waitForInitialSettingsGraphReady(...)` timed out after `30000ms`
  - failure point:
    `frontend/tests/e2e/settings/settings-view-modes.spec.ts:5112`
- fresh-context headless CDP check on `http://127.0.0.1:3075/settings`
  - page stayed on the authenticated loading shell:
    `PREPARING SETTA`, `Loading settings…`, `Backend: Starting backend services`
  - graph surface was not visibly rendered

## Result

- the product slice is landed and unit-verified
- the measured owner now avoids both the misc-store write and the attribution
  timing wrapper on repeated no-op interaction syncs
- the live worktree-only perf readout for this exact reduction remains deferred
  because the current runtime never reached a healthy settings surface

## Reading

- this is another real product-side reduction inside the current dominant owner
  rather than more harness-only churn
- the current blocker is runtime health on direct `/settings`, not the motion
  lane itself: both Playwright and CDP stalled on the same loading-shell state
- the next pass should either recover the worktree settings surface to a
  healthy mounted canary and rerun the same `rotaryParamCodeObjDefault` probe,
  or, if that runtime remains unhealthy, move to the next measurable product
  owner without reopening broad oracle/setup work
