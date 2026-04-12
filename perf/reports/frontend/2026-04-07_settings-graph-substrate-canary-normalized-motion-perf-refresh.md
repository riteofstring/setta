# Settings Graph Substrate Canary Normalized Motion Perf Refresh

Date: 2026-04-07
Area: frontend
Branch/Commit: `pixijs-graph` @ `db1f87e1c`
Related plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
Canonical target section: `rotaryParamCodeObjDefault`

## Goal

Refresh the normalized `All Settings` motion baseline after the April 7
body-visibility gate, scene-sync stabilization, and Pixi shell no-op redraw
suppression slices so the next product invalidation pass targets the real
remaining hotspot instead of reopening DOM-body work.

## Code Paths

- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
- `frontend/tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
- `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts`

## Scenario

- Entry point:
  - worktree canary: `http://127.0.0.1:3076/settings`
  - read-only legacy reference: `http://127.0.0.1:3087/settings`
- Project/view: `settings`, `All Settings`
- Named target section: `rotaryParamCodeObjDefault`
- Browser + OS: Playwright Chromium headless, macOS
- Notes:
  - compare panes normalized to `SETTINGS_GRAPH_COMPARE_PANE_STATE`
  - the worktree canary lane reuses the existing instrumentation probe to read
    mounted body count plus scene/Pixi sync counters on the same named target
  - the motion-perf probe reuses the same deterministic wheel sequence from the
    earlier April 5 baseline:
    - plain-wheel pan `(+160, +120)` x `6`
    - plain-wheel pan `(-160, -120)` x `6`
    - modified-wheel zoom in `(0, -180)` x `4`
    - modified-wheel zoom out `(0, +180)` x `4`

## Before

Source: `perf/reports/frontend/2026-04-05_settings-graph-substrate-normal-zoom-baseline.md`

- worktree canary
  - average frame duration: `17.00ms`
  - max frame duration: `50.1ms`
  - long tasks: `1` (`60ms`)
  - root DOM nodes: `9515`
  - target section DOM nodes: `132`

## After

Measurement commands:

```bash
cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_BOOTSTRAP_TOKEN='<fresh token>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes.spec.ts -g "settings graph substrate canary exposes live instrumentation on normalized All Settings" --reporter=line --max-failures=1 --timeout=120000

cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_BOOTSTRAP_TOKEN='<fresh token>' SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3087 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8087 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<fresh main bootstrap url>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g "settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary" --reporter=line --max-failures=1 --timeout=180000
```

Observed canary instrumentation snapshots:

- auto-fit at zoom `0.1`: mounted scene sections `46`, mounted section bodies
  `0`, Pixi drawables `46`, Pixi syncs `2`, scene syncs `2`, unresolved
  fallback `0`, viewport `720 x 828`
- focused fit-view on `rotaryParamCodeObjDefault`: mounted section bodies `1`,
  Pixi drawables `46`, Pixi syncs `2`, scene syncs `2`, zoom `1.1900826446280992`
- after normalized blank-pane pan: mounted section bodies `1`, Pixi drawables
  `46`, Pixi syncs `2`, scene syncs `2`
- after one toolbar zoom-in: mounted section bodies `1`, Pixi drawables `46`,
  Pixi syncs `2`, scene syncs `2`, zoom `1.428099173553719`

Observed normalized motion-perf metrics:

- legacy `main`
  - average frame duration: `17.05ms`
  - max frame duration: `50.0ms`
  - frame samples: `44`
  - long tasks: `1` (`61ms`)
  - root DOM nodes: `7628`
  - target section DOM nodes: `132`
  - editable controls: `99`
- worktree canary
  - average frame duration: `17.83ms`
  - max frame duration: `47.9ms`
  - frame samples: `43`
  - long tasks: `1` (`53ms`)
  - root DOM nodes: `180`
  - target section DOM nodes: `132`
  - editable controls: `2`

## Interpretation

- The canary is still not obviously slower than legacy on the normalized
  `rotaryParamCodeObjDefault` lane: average frame cost is only about `0.78ms`
  above `main`, and max frame duration is slightly lower.
- The graph-root DOM footprint is no longer the dominant story on this lane.
  Compared with the April 5 canary baseline, the worktree root dropped from
  `9515` nodes to `180`, while the wide/focused body counters now stay at `0`
  and `1`.
- The target section DOM footprint stayed flat at `132` nodes on both surfaces,
  and both surfaces now show one isolated long task. That means the next perf
  frontier is not more body culling.
- The remaining cost model is now dominated by motion-time whole-scene work:
  the canary still carries `46` visible sections and `46` Pixi drawables
  through the motion lane even though DOM body ownership is nearly eliminated.

## Conclusion

- What improved:
  - the canary now keeps the normalized lane near legacy frame cost with a tiny
    graph-root DOM footprint
  - the wide-view/focused-view counters confirm the earlier body-gating and
    no-op sync reductions are holding on the live loop-managed session
- What remains:
  - viewport motion still processes a full `46`-section / `46`-drawable scene
    on the measured lane
  - the next bounded product slice should reduce motion-time whole-scene
    recompute/redraw work rather than revisit DOM-body ownership or CDP-only
    tooling

## CDP Note

No new Chrome DevTools MCP pass was run for this report. The deferred CDP
visual/tooling debt from item `285` is unchanged, and this slice used the
existing deterministic Playwright probes to choose the next product hotspot.
