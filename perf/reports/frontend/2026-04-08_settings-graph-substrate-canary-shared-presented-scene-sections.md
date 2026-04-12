# Settings Graph Substrate Canary Shared Presented Scene Sections

Date: 2026-04-08
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: stop recomputing the same presented section subset independently in the DOM shell layer and the Pixi shell layer during focused pan/zoom on the canary surface.
- Product slice: `SettingsGraphSubstrateCanary` now resolves the presented scene-section subset once at the composition boundary and passes that same stable subset to both renderer layers.
- Guard rails:
  - the existing section-presentation rules stay unchanged
  - the DOM body mount gate still runs inside the DOM layer
  - the focused-lane drawable/body instrumentation probes stay green

## Before

Source: Ralph item `291` on the same normalized motion lane.

- Worktree canary motion probe:
  - average frame duration `20.93ms`
  - max frame duration `83.3ms`
  - root DOM nodes `135`
  - target section DOM nodes `132`
  - editable controls `2`
  - visible section count `1`
- Focused canary instrumentation:
  - mounted scene sections `46`
  - mounted section bodies `1`
  - focused `pixiDrawableCount` was already reduced below scene count by the presentation gate

## After

Verification runtime:

- worktree frontend `http://127.0.0.1:3076/`
- worktree backend `http://127.0.0.1:8076`
- reference frontend `http://127.0.0.1:3087/`
- reference backend `http://127.0.0.1:8087`

Commands:

```bash
pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx

pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx

source activate.sh && env SETTA_FILES_ROOT=/Users/jeff/Documents/_projects/setta.pixijs-graph/setta_files_dev setta status --connect-info --latest --json --workspace /Users/jeff/Documents/_projects/setta.pixijs-graph/.

cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_BOOTSTRAP_TOKEN='<fresh token minted from setta status>' SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3087 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8087 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<loop main bootstrap url>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --max-failures=1 --timeout=180000

cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_BOOTSTRAP_TOKEN='<fresh token minted from setta status>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary exposes live instrumentation on normalized All Settings' --reporter=line --max-failures=1 --timeout=180000
```

Results:

- Legacy `main` motion probe:
  - average frame duration `17.79ms`
  - max frame duration `81.5ms`
  - root DOM nodes `7628`
  - target section DOM nodes `132`
  - editable controls `99`
  - visible section count `46`
- Worktree canary motion probe:
  - average frame duration `20.54ms`
  - max frame duration `100ms`
  - root DOM nodes `135`
  - target section DOM nodes `132`
  - editable controls `2`
  - visible section count `1`
- Live canary instrumentation:
  - auto-fit: mounted scene sections `46`, mounted section bodies `0`, `pixiDrawableCount` `42`, `pixiSyncCount` `1`
  - focused fit-view baseline: mounted section bodies `1`, `pixiDrawableCount` `1`, `pixiSyncCount` `1`
  - after normalized blank-pane pan: mounted section bodies `1`, `pixiDrawableCount` `2`, `pixiSyncCount` `1`
  - after one toolbar zoom-in: mounted section bodies `1`, `pixiDrawableCount` `2`, `pixiSyncCount` `1`

Additional verification notes:

- The first worktree-only Playwright attempt failed because the bootstrap token had gone stale and the bootstrap route returned `401 Unauthorized`.
- Retrying the same spec with a fresh token minted via `setta status --connect-info --latest --json --workspace ...` passed on the live `3076/8076` runtime.

## Reading

- This slice removed duplicate full-scene presentation filtering from the hot path by making the canary composition boundary the single owner of the presented subset decision for both renderer layers.
- The shared subset is now explicit in tests and in the focused live instrumentation, but the motion win is still small: `20.93ms -> 20.54ms` average on the trusted cross-worktree probe.
- The focused lane remains slower than the legacy reference even though the canary still keeps only `1` visible section and `1-2` focused Pixi drawables during the motion probe.
- The next frontier should stay on deeper focused Pixi/scene or viewport-sync work, not another presentation-boundary hop.
