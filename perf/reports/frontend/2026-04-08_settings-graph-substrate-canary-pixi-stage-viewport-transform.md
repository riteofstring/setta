# Settings Graph Substrate Canary Pixi Stage Viewport Transform

Date: 2026-04-08
Area: frontend
Canonical target section: `rotaryParamCodeObjDefault`

## Goal

Stop pure canary pan/zoom updates from rebuilding the Pixi shell geometry for
every visible section when only the viewport transform changes.

## Change

- keep shell drawables in world space
- apply pan/zoom through the Pixi stage transform
- count `pixiSyncCount` only when the shell geometry is actually redrawn

## Before

Source: the focused shell-layer harness for this slice, measured against the
pre-change implementation.

- initial mount drew the shell geometry once
- a viewport-only rerender triggered another full `graphics.clear()` +
  world-geometry redraw across the same shell drawable set

## After

Measurement commands:

```bash
pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiModel.test.ts

cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_BOOTSTRAP_TOKEN='<fresh token>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes.spec.ts -g "settings graph substrate canary exposes live instrumentation on normalized All Settings" --reporter=line --max-failures=1 --timeout=120000

cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_BOOTSTRAP_TOKEN='<fresh token>' SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3087 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8087 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<fresh main bootstrap url>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g "settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary" --reporter=line --max-failures=1 --timeout=180000
```

Observed results:

- focused layer harness
  - viewport-only rerender still required one present/render, but
    `graphics.clear()` stayed at `1`
  - a real shell drawable change still advanced `graphics.clear()` to `2`
- live normalized canary instrumentation on `rotaryParamCodeObjDefault`
  - auto-fit: mounted scene sections `46`, mounted section bodies `0`, Pixi
    drawables `46`, `pixiSyncCount` `1`, scene syncs `2`, viewport `720 x 828`
    at zoom `0.1`
  - focused fit-view baseline: mounted section bodies `1`, `pixiSyncCount` `1`
    at zoom `1.1900826446280992`
  - after normalized blank-pane pan: mounted section bodies `1`,
    `pixiSyncCount` `1`
  - after one toolbar zoom-in: mounted section bodies `1`, `pixiSyncCount` `1`
    at zoom `1.428099173553719`
- normalized motion-perf probe
  - legacy `main`: average `17.40ms`, max `66.4ms`, `44` samples, `1` long
    task (`70ms`), root DOM `7628`, target section DOM `132`, editable
    controls `99`
  - worktree canary: average `18.99ms`, max `66.5ms`, `43` samples, `2` long
    tasks (`119ms` total, `69ms` max), root DOM `180`, target section DOM
    `132`, editable controls `2`

## Interpretation

- The targeted invalidation reduction landed: pan/zoom now reuses the existing
  Pixi shell geometry on the canonical lane instead of issuing another
  full-shell redraw.
- The current live canary still carries all `46` visible sections and all `46`
  Pixi drawables through the motion lane, so this slice removed redraw churn
  without reducing scene fan-out.
- The broader motion timings did not improve on this run. The canary remains in
  the same general range as `main`, but it measured slightly slower than the
  prior `2026-04-07` refresh and slightly slower than the current legacy
  reference.

## Conclusion

- Landed value:
  - viewport motion no longer forces shell-geometry redraws on the canary lane
  - the live instrumentation now makes that reduction explicit via a flat
    `pixiSyncCount`
- Remaining hotspot:
  - motion still traverses a full `46`-section / `46`-drawable scene
  - the next bounded product slice should narrow whole-scene fan-out or scene
    presentation work instead of revisiting DOM body gating

## CDP Note

Chrome DevTools MCP visual confirmation was requested separately for this slice.
See the iteration handoff/history for the final CDP result or blocker state.
