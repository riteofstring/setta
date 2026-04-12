# Settings Graph Substrate Canary Body Visibility Mount Gate

Date: 2026-04-07
Branch: `pixijs-graph`
Target lane: normalized `settings` -> `All Settings`
Canonical target section: `rotaryParamCodeObjDefault`

## Goal

Reduce DOM body ownership on the canary without changing the visible shell
contract by mounting section bodies only when they are on-screen, active,
dragging, or still missing authoritative size.

## Instrumentation snapshot

Source:

- Playwright probe:
  `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g "settings graph substrate canary exposes live instrumentation on normalized All Settings"`

Measured snapshots from the same normalized `All Settings` run:

- auto-fit snapshot before targeted fit view:
  - mounted scene section count: `46`
  - mounted section-body count: `42`
  - Pixi drawable count: `46`
  - Pixi sync count: `2`
  - scene sync count: `3`
  - unresolved seed-cache fallback count: `0`
  - viewport zoom: `0.1`
  - visible viewport size: `720 x 828`
- focused snapshot after targeted fit view to `rotaryParamCodeObjDefault`:
  - mounted scene section count: `46`
  - mounted section-body count: `1`
  - Pixi drawable count: `46`
  - Pixi sync count: `2`
  - scene sync count: `3`
  - unresolved seed-cache fallback count: `0`
  - viewport zoom: `1.1900826446280992`
  - visible viewport size: `720 x 828`

## Reading

- The canary no longer ties DOM body ownership to the full scene count. Even the
  broad auto-fit view dropped mounted section bodies from `46` to `42`.
- The normalized targeted-fit lane now mounts only the focused section body
  while keeping all `46` scene sections and Pixi shells present, which is the
  first measured body-count reduction on this canary.
- Pixi drawable count and sync counts stayed flat across the slice, which means
  the change specifically narrowed DOM body ownership rather than shifting the
  scene-sync workload elsewhere.

## Verification

- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryController.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySurfaceRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts tests/e2e/settings/settings-view-modes.spec.ts`
- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneRuntime.test.tsx`
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g "settings graph substrate canary exposes live instrumentation on normalized All Settings"`

## Next frontier

- Use this body-count reduction as the baseline for the next product slice:
  either preserve the mount gate during pan/zoom motion checks or narrow the
  remaining `42` auto-fit bodies further if the canary still carries too much
  DOM on the wide view.
