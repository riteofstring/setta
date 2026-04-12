# Settings Graph Substrate Canary Section Entry Memoization

Date: 2026-04-08
Area: frontend
Canonical target section: `rotaryParamCodeObjDefault`

## Goal

Reduce viewport-motion React fan-out on the canary section layer so pan/zoom
does not rebuild every mounted section entry when the section snapshot itself
did not change.

## Change

- memoize the per-section shell/body entry component inside
  `SettingsGraphSubstrateCanarySectionsLayer`
- keep section-body descriptors stable across viewport-only updates
- keep pointer handler props stable so unchanged section entries can stay
  memoized while the parent layer recomputes mount gating

## Measurement Commands

```bash
pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx

cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_BOOTSTRAP_TOKEN='<fresh token>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes.spec.ts -g "settings graph substrate canary exposes live instrumentation on normalized All Settings" --reporter=line --max-failures=1 --timeout=180000

cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_BOOTSTRAP_TOKEN='<fresh token>' SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3087 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8087 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<fresh main bootstrap url>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g "settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary" --reporter=line --max-failures=1 --timeout=180000
```

## Observed Results

- focused section-layer unit coverage
  - viewport-only updates kept the mocked section entry and body adapter render
    counts flat when the mount gate stayed unchanged
  - when zoom changed enough to flip the mount gate, only the affected section
    entry rerendered and the body descriptor stayed memoized
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
  - legacy `main`: average `17.05ms`, max `50.0ms`, `44` samples, `1` long
    task (`63ms`), root DOM `7628`, target section DOM `132`, editable
    controls `99`
  - worktree canary: average `20.56ms`, max `101ms`, `43` samples, `2` long
    tasks (`158ms` total, `101ms` max), root DOM `180`, target section DOM
    `132`, editable controls `2`

## Interpretation

- The targeted React fan-out reduction landed at the section-entry layer: the
  parent canary layer still rerenders for viewport updates, but unchanged
  section entries no longer need to rebuild their shell/body subtree just
  because the visible viewport changed.
- The canonical live lane remained correct and visually attached under the
  existing motion probe.
- This slice did not yield a motion win on the current cross-worktree sample.
  The measured canary run was slower than both the prior `2026-04-08`
  viewport-transform slice and the current legacy reference.

## Conclusion

- Landed value:
  - section-entry React work is narrower on viewport-only motion
  - the new unit coverage protects that memoization contract directly
- Remaining hotspot:
  - measured motion is still dominated by broader whole-scene fan-out or
    presentation work beyond this React entry rebuild path
  - the next bounded product slice should target scene-wide presentation cost,
    not reopen this memoization lane

## CDP Note

Chrome DevTools MCP visual confirmation was requested separately for this slice.
See the iteration handoff/history for the final CDP result or blocker state.
