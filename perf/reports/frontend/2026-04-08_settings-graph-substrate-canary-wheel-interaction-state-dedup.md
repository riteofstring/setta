# Settings Graph Substrate Canary Wheel Interaction State Dedup

Date: 2026-04-08
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: stop repeated wheel pan / modified-wheel zoom bursts from writing the
  same interaction-state booleans back into shared stores on every wheel event.
- Product slice:
  `settingsGraphSubstrateCanaryPaneInteractionController` now emits
  `syncViewportInteractionState(...)` only when the effective interaction state
  actually changes.
- Guard rails:
  - wheel pan and modified-wheel zoom still advance the viewport on every event
  - idle timeout teardown still resets the interaction state at the end of the
    burst
  - the focused canary instrumentation and normalized cross-worktree motion
    probe stay on the same canonical `rotaryParamCodeObjDefault` lane

## Before

Source: Ralph item `292` on the same canonical lane.

- worktree canary motion probe:
  - average frame duration `20.54ms`
  - max frame duration `100ms`
  - root DOM nodes `135`
  - target section DOM nodes `132`
  - editable controls `2`
  - visible section count `1`
- focused canary instrumentation:
  - auto-fit: mounted scene sections `46`, mounted section bodies `0`,
    `pixiDrawableCount` `42`, `pixiSyncCount` `1`
  - focused fit-view baseline: mounted section bodies `1`,
    `pixiDrawableCount` `1`, `pixiSyncCount` `1`
  - after normalized blank-pane pan: mounted section bodies `1`,
    `pixiDrawableCount` `2`, `pixiSyncCount` `1`
  - after one toolbar zoom-in: mounted section bodies `1`,
    `pixiDrawableCount` `2`, `pixiSyncCount` `1`

## After

Verification runtime:

- worktree frontend `http://127.0.0.1:3077/`
- worktree backend `http://127.0.0.1:8077`
- reference frontend `http://127.0.0.1:3088/`
- reference backend `http://127.0.0.1:8088`

Commands:

```bash
pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryPaneInteractionController.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryPaneInteractionController.test.ts

pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryPaneInteractionController.test.ts

cd frontend && SETTA_BOOTSTRAP_TOKEN='<fresh worktree token>' PLAYWRIGHT_BASE_URL=http://127.0.0.1:3077 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8077 BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary exposes live instrumentation on normalized All Settings' --reporter=line --max-failures=1 --timeout=180000

source activate.sh && cd frontend && SETTA_BOOTSTRAP_TOKEN='<fresh worktree token minted in the same shell>' PLAYWRIGHT_BASE_URL=http://127.0.0.1:3077 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8077 SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3088 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8088 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<fresh main bootstrap url minted in the same shell>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --max-failures=1 --timeout=180000
```

Results:

- focused controller unit coverage:
  - repeated pan-scroll wheel events keep one active-state emission until the
    idle timeout resets it
  - repeated modified-wheel zoom events keep one active-state emission until
    the idle timeout resets it
- live canary instrumentation:
  - auto-fit: mounted scene sections `46`, mounted section bodies `0`,
    `pixiDrawableCount` `42`, `pixiSyncCount` `1`
  - focused fit-view baseline: mounted section bodies `1`,
    `pixiDrawableCount` `1`, `pixiSyncCount` `1`
  - after normalized blank-pane pan: mounted section bodies `1`,
    `pixiDrawableCount` `2`, `pixiSyncCount` `1`
  - after one toolbar zoom-in: mounted section bodies `1`,
    `pixiDrawableCount` `2`, `pixiSyncCount` `1`
- normalized motion-perf output:
  - legacy `main`: average `17.80ms`, max `83.2ms`, `44` samples, root DOM
    `7628`, target section DOM `132`, editable controls `99`, visible section
    count `46`
  - worktree canary: average `18.99ms`, max `66.7ms`, `43` samples, root DOM
    `135`, target section DOM `132`, editable controls `2`, visible section
    count `1`

Additional verification notes:

- Reusing the same worktree bootstrap token for the second Playwright run
  returned `401 Unauthorized`; the cross-worktree probe passed after minting
  fresh worktree and main bootstrap URLs in the same shell invocation.

## Reading

- The focused lane now avoids redundant interaction-state writes during the
  exact 20-event wheel burst used by the normalized motion probe.
- The mounted section/body/drawable guard rails stayed unchanged, which keeps
  this slice in the viewport-sync lane rather than reopening presentation or
  redraw ownership work.
- The canonical motion sample improved materially on the worktree canary:
  `20.54ms -> 18.99ms` average frame duration, with max frame duration dropping
  from `100ms -> 66.7ms`.
- The canary is still slightly slower than legacy `main` on this runtime
  (`18.99ms` vs `17.80ms`), so the next hotspot remains deeper viewport-sync or
  scene work on the same canonical lane.
