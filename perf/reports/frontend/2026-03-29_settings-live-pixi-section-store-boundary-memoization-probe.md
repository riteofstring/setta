# Settings Live Pixi Section-Store Boundary Memoization Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Re-measure the live Pixi generic value-row handoff after stabilizing the live
  dict-area section-store boundary so it no longer returns function-bearing
  objects from a deep-equality project-state selector.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click the visible generic value-row handoff on `defaultZoomLevel`.
  3. Capture a short DevTools performance trace around the click/open
     interaction.

## Change Under Test

- `frontend/src/components/Params/groupContainerLiveDictAreaSectionStoreBoundary.ts`
  - select pure `buildLiveDictAreaSectionState(...)` data from
    `useProjectState(..., _.isEqual)`
  - rebuild the function-bearing boundary payload with `useMemo(...)` outside
    the store selector
- `frontend/src/components/Params/groupContainerLiveDictAreaSectionBoundary.ts`
  - add `buildLiveDictAreaSectionBoundaryFromState(...)` so the hook can reuse
    the same boundary assembly without creating fresh closures inside the
    selector

## Probe

- Fresh-context Chrome DevTools MCP visual/perf check on the live worktree
  runtime.
- The page stayed authenticated and `All Settings` loaded successfully.
- The `defaultZoomLevel` handoff still opened the DOM editor overlay while the
  Pixi canary stayed mounted and visually sane.

## Observations

- Interaction summary:
  - `INP`: `54 ms`
  - input delay: `5 ms`
  - processing: `16 ms`
  - presentation delay: `33 ms`
- Relative to the earlier generic shared-floor probe
  (`2026-03-29_settings-live-pixi-value-row-shared-floor-probe.md`):
  - `INP` improved from `73 ms` to `54 ms`
  - presentation delay improved from `49 ms` to `33 ms`
- Hottest named samples in the follow-up trace were generic shared-floor work:
  - `RunTask` (`44.952 ms`)
  - `EventDispatch` (`39.279 ms`)
  - `v8.callFunction` (`39.221 ms`)
  - `RunMicrotasks` (`39.13 ms`)
  - `FunctionCall` (`39.052 ms`)
- The previous named shared section/update signal did not reappear in the top
  samples:
  - `checkIfSnapshotChanged`
  - `src/components/Params/groupContainerLiveDictAreaSectionStoreBoundary.ts`

## Verdict

- Treat the section-store boundary selector churn as reduced on this handoff
  path.
- Keep the selector/memoization split because it removes an unstable
  function-bearing selector result and is backed by both hook-level regression
  coverage and a better follow-up trace.
- The next retained-scene hotspot slice should pivot to the remaining shared
  task/event/presentation floor rather than continuing work in this boundary.

## Verification Notes

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Params/groupContainerLiveDictAreaSectionState.test.ts src/components/Params/groupContainerLiveDictAreaSectionInput.test.ts src/components/Params/groupContainerLiveDictAreaSectionBoundary.test.ts src/components/Params/groupContainerLiveDictAreaSectionStoreBoundary.test.tsx`
  - result: passed (`8 passed`)
- Playwright canary:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts`
  - result: passed (`8 passed`)
- Chrome DevTools MCP visual/perf check:
  - result: passed
  - page used: `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
