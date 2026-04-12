# Settings Graph Substrate Canary Screen-Space Body Viability Gate

Date: 2026-04-07
Worktree: `pixijs-graph`
Canonical target section: `rotaryParamCodeObjDefault`

## Change

Tightened the canary DOM body mount gate so inactive sections now need both:

- visible viewport overlap
- enough visible on-screen area to make a DOM body useful

Active, dragging, and unresolved-size sections still bypass the new cutoff.

## Baseline before this slice

Source: Ralph item `279` normalized `All Settings` probe.

- auto-fit at zoom `0.1`: mounted scene sections `46`, mounted section bodies `42`, Pixi drawables `46`, Pixi syncs `2`, scene syncs `3`
- focused fit-view on `rotaryParamCodeObjDefault`: mounted section bodies `1`
- after pan: mounted section bodies `2`
- after one toolbar zoom-in: mounted section bodies `2`

## After this slice

Measurement command:

```bash
cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3075 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8075 SETTA_BOOTSTRAP_TOKEN='<fresh token>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes.spec.ts -g "settings graph substrate canary exposes live instrumentation on normalized All Settings" --reporter=line --max-failures=1 --timeout=60000
```

Observed snapshots from the passing probe:

- auto-fit at zoom `0.1`: mounted scene sections `46`, mounted section bodies `0`, Pixi drawables `46`, Pixi syncs `2`, scene syncs `4`
- focused fit-view on `rotaryParamCodeObjDefault`: mounted section bodies `1`
- after pan: mounted section bodies `1`
- after one toolbar zoom-in: mounted section bodies `1`

## Interpretation

- Wide auto-fit DOM body ownership dropped from `42` to `0` without blanking the graph surface.
- The focused `rotaryParamCodeObjDefault` lane stayed at `1` mounted body through pan and zoom, so the tighter gate did not reopen the earlier blank-body motion failure.
- With wide-view DOM bodies effectively eliminated, the next likely hotspot is no longer body mount count. The remaining cost model is now dominated by whole-scene section sync / full Pixi drawable redraw behavior.
