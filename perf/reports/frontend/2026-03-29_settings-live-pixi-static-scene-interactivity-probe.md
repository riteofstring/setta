# Settings Live Pixi Static-Scene Interactivity Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Measure whether making the live dict-area Pixi scene explicitly static
  reduces the shared interaction-floor cost seen in the prior generic
  value-row handoff probe.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Use the same live Pixi value-row handoff path as the prior shared-floor
     probe when feasible.
  3. Capture a short DevTools performance trace around the handoff click.

## Change Under Test

- `frontend/src/components/Params/LiveDictAreaPixiScene.tsx`
  - force the Pixi stage into a non-interactive static-scene mode
  - disable Pixi interactive children
  - set the owned canvas to `pointer-events: none`

## Probe

- Fresh-context Chrome DevTools MCP profile on the live worktree runtime.
- The canary still rendered successfully and no obvious visual regression was
  observed while profiling.

## Observations

- Interaction summary from the captured slow `pointerdown`:
  - `INP`: `523 ms`
  - input delay: `3 ms`
  - processing: `272 ms`
  - presentation delay: `248 ms`
- Directionally, this did not show a clear improvement over the prior
  `2026-03-29_settings-live-pixi-value-row-shared-floor-probe.md` result.
- The DevTools insight output did not surface a distinct named Pixi
  hit-testing hotspot on this capture.
- The remaining latency was split between processing and presentation work,
  which suggests the dominant cost is still elsewhere in the shared
  interaction/update path.

## Verdict

- Keep the explicit static-scene configuration because the Pixi canvas is only
  acting as a visual shell in this canary and should not participate in event
  routing.
- Do not treat this change as the main performance fix for the shared-floor
  latency.
- The next hotspot slice should move to shared pointer/update work, especially:
  - `handlePointerDown` in `frontend/src/components/Pages/Project/UiPage.tsx`
  - `groupContainerLiveDictAreaSectionStoreBoundary.ts`
  - React commit/presentation work on the overlay handoff path

## Verification Notes

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Params/LiveDictAreaPixiScene.test.ts`
  - result: passed (`1 passed`)
- Playwright canary:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts`
  - result: passed (`8 passed`)
- Chrome DevTools MCP visual/perf check:
  - result: passed
  - page used: `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
