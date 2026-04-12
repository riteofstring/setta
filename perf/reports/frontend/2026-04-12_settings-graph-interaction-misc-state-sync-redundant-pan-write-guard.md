# Settings graph interactionMiscStateSync redundant pan-write guard

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce the current dominant `interactionMiscStateSync` owner on the live
worktree canary by skipping redundant `useMisc.isPanScrolling` writes when the
viewport interaction state has not actually changed.

## Slice

- changed
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts`
  so `syncViewportInteractionState(...)` computes the next pan-scrolling flag
  once, mirrors the root interaction attribute as before, and returns early
  before `useMisc.setState(...)` when the misc store already holds the same
  boolean
- added focused coverage in
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  proving repeated interaction-sync calls only write the misc store on the two
  actual transitions (`false -> true`, `true -> false`)

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  - passed (`1` file, `11` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-047/worktree-ai.log`
  - failed twice, including after one bounded worktree lifecycle recovery
    through `./aireset.sh`
  - failure stayed in Playwright global setup waiting for
    `.setta-titlebar-offset`
  - current URL at failure stayed parked at
    `http://127.0.0.1:3075/?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8075`
- headless Chrome DevTools MCP smoke on `http://127.0.0.1:3075/settings`
  - passed
  - the live settings graph surface and surrounding chrome rendered with no
    obvious blank/collapsed graph region

## Result

- this slice removes redundant misc-store fan-out from the measured dominant
  owner without changing visible interaction-state mirroring on the canary root
- live numeric before/after attribution could not be captured in this
  iteration because the worktree Playwright bootstrap lane regressed back to
  the unauthenticated shell stall even after the allowed recovery attempt

## Reading

- the product-side target remains correct: `interactionMiscStateSync` was the
  last measured dominant owner on the canonical worktree lane, and redundant
  `isPanScrolling` writes were one concrete shared-write hotspot inside it
- the next iteration should either:
  - restore a trustworthy worktree-only numeric probe on the same lane so this
    reduction can be measured, or
  - if the probe path remains unavailable, continue with the next concrete
    `interactionMiscStateSync` shared write only if it can be named directly
    from product code instead of reopening generic probe churn
