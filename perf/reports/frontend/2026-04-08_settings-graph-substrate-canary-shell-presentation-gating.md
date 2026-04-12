# Settings Graph Substrate Canary Shell Presentation Gating

Date: 2026-04-08
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: stop mounting the full scene's inactive DOM shell wrappers on the focused canary lane while keeping active/dragging continuity and the flat Pixi redraw contract.
- Product slice: `SettingsGraphSubstrateCanarySectionsLayer` now filters inactive offscreen section shells out of the DOM presentation set instead of rendering all `46` shell wrappers on the focused lane.
- Guard rails:
  - active and dragging sections still stay mounted
  - offscreen inactive shells drop out of the DOM presentation set
  - `pixiSyncCount` stays flat through the normalized pan and toolbar zoom steps

## Before

Source: Ralph item `288` normalized motion probe on the same lane.

- Legacy `main`:
  - average frame duration `17.05ms`
  - max frame duration `50.0ms`
  - root DOM nodes `7628`
  - target section DOM nodes `132`
  - editable controls `99`
  - visible section count `46`
- Worktree canary:
  - average frame duration `20.56ms`
  - max frame duration `101ms`
  - root DOM nodes `180`
  - target section DOM nodes `132`
  - editable controls `2`
  - visible section count `46`

## After

Verification runtime:

- worktree frontend `http://127.0.0.1:3077/`
- worktree backend `http://127.0.0.1:8077`
- reference frontend `http://127.0.0.1:3088/`
- reference backend `http://127.0.0.1:8088`

Commands:

```bash
cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3077 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8077 SETTA_BOOTSTRAP_TOKEN='<fresh worktree token>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary exposes live instrumentation on normalized All Settings' --reporter=line --max-failures=1 --timeout=180000

cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3077 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8077 SETTA_BOOTSTRAP_TOKEN='<fresh worktree token>' SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3088 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8088 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<fresh main bootstrap url>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --max-failures=1 --timeout=180000
```

Results:

- Legacy `main`:
  - average frame duration `16.67ms`
  - max frame duration `33.4ms`
  - root DOM nodes `7628`
  - target section DOM nodes `132`
  - editable controls `99`
  - visible section count `46`
- Worktree canary:
  - average frame duration `17.83ms`
  - max frame duration `35.0ms`
  - root DOM nodes `135`
  - target section DOM nodes `132`
  - editable controls `2`
  - visible section count `1`

Live canary instrumentation on the focused lane stayed stable:

- mounted scene sections `46`
- mounted section bodies `1`
- Pixi drawables `46`
- Pixi syncs `1`
- scene syncs `2`
- zoom `1.1900826446280992` at focused fit, `1.428099173553719` after one toolbar zoom-in

## Reading

- The slice did not change the focused lane's body continuity or Pixi redraw behavior.
- The measurable win came from DOM presentation fan-out:
  - visible shell wrappers `46 -> 1`
  - root DOM nodes `180 -> 135`
  - average frame duration `20.56ms -> 17.83ms`
- The remaining presentation hotspot is still the full `46`-drawable Pixi shell layer, because the focused lane now mounts only one DOM shell while Pixi still renders all shell drawables.
