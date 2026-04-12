# Settings Graph Substrate Canary Stable Scene Snapshot No-Op Syncs

Date: 2026-04-07
Worktree: `pixijs-graph`
Canonical target section: `rotaryParamCodeObjDefault`

## Change

Stabilized the canary scene snapshot and skipped scene-store writes when both:

- resolved scene geometry is semantically unchanged
- shared-node seed cache content is semantically unchanged

This keeps semantically identical controller rerenders from fanning out into
another scene sync / node sync pass.

## Baseline before this slice

Source: Ralph item `280` normalized `All Settings` probe.

- auto-fit at zoom `0.1`: mounted scene sections `46`, mounted section bodies `0`, Pixi drawables `46`, Pixi syncs `2`, scene syncs `4`
- focused fit-view on `rotaryParamCodeObjDefault`: mounted section bodies `1`, scene syncs `4`
- after pan: mounted section bodies `1`, scene syncs `4`
- after one toolbar zoom-in: mounted section bodies `1`, scene syncs `4`

## After this slice

Measurement command:

```bash
env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g "settings graph substrate canary exposes live instrumentation on normalized All Settings"
```

Observed snapshots from the passing probe:

- auto-fit at zoom `0.1`: mounted scene sections `46`, mounted section bodies `0`, Pixi drawables `46`, Pixi syncs `2`, scene syncs `2`
- focused fit-view on `rotaryParamCodeObjDefault`: mounted section bodies `1`, scene syncs `2`
- after pan: mounted section bodies `1`, scene syncs `2`
- after one toolbar zoom-in: mounted section bodies `1`, scene syncs `2`

## Interpretation

- The same normalized canary lane now needs `2` scene syncs instead of `4`.
- Pixi drawable count and Pixi sync count stayed flat, so this slice reduced
  no-op world-geometry fan-out without changing the visible scene surface.
- The zero-body wide auto-fit lane and the focused `rotaryParamCodeObjDefault`
  body lane stayed unchanged, which keeps this slice in the intended
  invalidation-reduction lane instead of reopening body-ownership work.
