# Settings Graph Substrate Canary Instrumentation Baseline

Date: 2026-04-07
Branch: `pixijs-graph`
Target lane: normalized `settings` -> `All Settings`
Canonical target section: `rotaryParamCodeObjDefault`

## Goal

Land the first read-only canary instrumentation seam from the rewrite plan so the
live `All Settings` canary reports its current cost model without reopening the
measured-geometry cleanup lane.

## Instrumentation snapshot

Source:

- Playwright probe:
  `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g "settings graph substrate canary exposes live instrumentation on normalized All Settings"`

Measured snapshot after normalized `All Settings` preflight + targeted fit view:

- mounted scene section count: `46`
- mounted section-body count: `46`
- Pixi drawable count: `46`
- Pixi sync count: `2`
- scene sync count: `3`
- unresolved seed-cache fallback count: `0`
- viewport zoom: `1.1900826446280992`
- visible viewport size: `720 x 828`

## Reading

- The current canary still mounts one DOM body per visible `All Settings`
  section, so the section-body count and Pixi drawable count are both `46`.
- The first normalized fit-view lane only required `2` Pixi canvas syncs and `3`
  scene snapshot syncs to settle, which is a useful baseline before any
  culling/redraw narrowing work.
- `unresolved seed-cache fallback count` landed at `0` on this canary, which
  confirms the recent size-authority cleanup is not leaving visible sections in a
  measured-seed fallback state on the normalized baseline.

## Verification

- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts tests/e2e/settings/graphSubstrateParityProbe.ts tests/e2e/settings/settings-view-modes.spec.ts`
- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneRuntime.test.tsx`
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g "settings graph substrate canary exposes live instrumentation on normalized All Settings"`

## Next frontier

- Use this snapshot as the baseline when deciding whether the next renderer/perf
  slice should reduce DOM body count, narrow full-scene Pixi redraws, or deepen
  scene-owned geometry authority.
