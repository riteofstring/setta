# Settings Graph Substrate Canary Pixi Drawable Presentation Gating

Date: 2026-04-08
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: stop presenting the full scene's inactive offscreen Pixi shell drawables on the focused canary lane while preserving active/dragging continuity.
- Product slice: `SettingsGraphSubstrateCanarySectionShellPixiLayer` now uses the shared section-presentation gate and only resolves Pixi drawables for the same presented scene-section subset as the DOM shell layer.
- Guard rails:
  - active offscreen sections still keep their Pixi drawables
  - inactive offscreen sections drop out of the focused drawable set
  - focused-lane expectations now require `pixiDrawableCount < mountedSceneSectionCount` in the live canary probe

## Before

Source: Ralph item `290` focused-lane instrumentation and motion probe.

- Focused canary instrumentation:
  - mounted scene sections `46`
  - mounted section bodies `1`
  - Pixi drawables `46`
  - Pixi syncs `1`
- Legacy `main` motion probe:
  - average frame duration `16.67ms`
  - max frame duration `33.4ms`
  - root DOM nodes `7628`
  - target section DOM nodes `132`
  - editable controls `99`
  - visible section count `46`
- Worktree canary motion probe:
  - average frame duration `17.83ms`
  - max frame duration `35.0ms`
  - root DOM nodes `135`
  - target section DOM nodes `132`
  - editable controls `2`
  - visible section count `1`

## After

Verification runtime:

- worktree frontend `http://127.0.0.1:3077/`
- worktree backend `http://127.0.0.1:8077`
- reference frontend `http://127.0.0.1:3088/`
- reference backend `http://127.0.0.1:8088`

Commands:

```bash
pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx tests/e2e/settings/settings-view-modes.spec.ts

pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx

source activate.sh && env SETTA_FILES_ROOT=/Users/jeff/Documents/_projects/setta.pixijs-graph/setta_files_dev setta status --connect-info --latest --json --workspace /Users/jeff/Documents/_projects/setta.pixijs-graph/.

cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3077 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8077 SETTA_BOOTSTRAP_TOKEN='<fresh token minted from setta status>' SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3088 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8088 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<fresh main bootstrap url>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --max-failures=1 --timeout=180000
```

Results:

- Legacy `main` motion probe:
  - average frame duration `17.80ms`
  - max frame duration `84.3ms`
  - root DOM nodes `7628`
  - target section DOM nodes `132`
  - editable controls `99`
  - visible section count `46`
- Worktree canary motion probe:
  - average frame duration `20.93ms`
  - max frame duration `83.3ms`
  - root DOM nodes `135`
  - target section DOM nodes `132`
  - editable controls `2`
  - visible section count `1`

Additional verification notes:

- Focused unit coverage passed for the new Pixi gate:
  - inactive offscreen sections are removed from the drawable set
  - active offscreen sections stay mounted in the drawable set
- The worktree-only canary Playwright probe was updated to assert focused `pixiDrawableCount < mountedSceneSectionCount`, but in this live session it timed out during pane normalization before reaching those assertions.
- Fresh bootstrap tokens for the live worktree had to be minted via `setta status --connect-info --latest --json --workspace ...`; the loop-context bootstrap URL fragment was no longer reliable for repeat Playwright runs.

## Reading

- The DOM shell and Pixi shell layers now share the same presentation boundary, so focused-lane offscreen inactive sections are no longer supposed to participate in either layer.
- This slice did not produce a motion win on the current normalized pan/zoom probe. The canary kept the reduced visible section count (`1`), but average frame duration regressed from `17.83ms` to `20.93ms`.
- The remaining hotspot is still not solved by presentation gating alone. The next frontier should stay on real production cost inside the focused Pixi/scene path rather than reopening DOM shell fan-out work.
