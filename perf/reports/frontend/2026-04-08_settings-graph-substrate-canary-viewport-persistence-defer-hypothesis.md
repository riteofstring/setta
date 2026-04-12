# Settings Graph Substrate Canary Viewport Persistence Defer Hypothesis

Date: 2026-04-08
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: test whether the remaining canary motion cost comes from scheduling the
  debounced shared viewport persistence work on every mirrored wheel tick.
- Temporary product slice:
  - defer `debouncedDispatchViewportUpdate()` while
    `viewportInteractionActive` stays true
  - cancel any pending debounce when the interaction starts
  - schedule one debounced persistence write after the interaction settles
- Result: no meaningful win on the canonical motion probe, so the temporary
  product/test change was reverted.

## Temporary Change

- `frontend/src/state/subscriptions.ts`
  - introduced a temporary transform-subscription helper that deferred viewport
    persistence scheduling until interactive wheel/pan bursts finished
- `frontend/src/state/subscriptions.test.ts`
  - temporary unit coverage for the deferred scheduling logic
- Final landed state:
  - both files were reverted after live verification showed no motion win

## Measurement Commands

```bash
pnpm -C frontend exec vitest run src/state/subscriptions.test.ts

cd frontend && SETTA_BOOTSTRAP_TOKEN='<fresh worktree token>' PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3087 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8087 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<fresh main bootstrap url>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --max-failures=1 --timeout=180000
```

## Before

Source: Ralph item `295` on the same canonical lane.

- legacy `main`: average `17.80ms`, max `83.3ms`, `44` samples, long-task
  total `144ms`
- worktree canary: average `18.99ms`, max `66.7ms`, `43` samples, long-task
  total `187ms`

## After

Verification runtime:

- worktree frontend `http://127.0.0.1:3076/`
- worktree backend `http://127.0.0.1:8076`
- reference frontend `http://127.0.0.1:3087/`
- reference backend `http://127.0.0.1:8087`

Observed normalized motion-perf output on the temporary branch:

- legacy `main`: average `17.80ms`, max `82.4ms`, `44` samples, long-task
  total `155ms`
- worktree canary: average `18.99ms`, max `83.4ms`, `43` samples, long-task
  total `150ms`

Additional observed guard rails:

- visible section count stayed `46` on legacy and `1` on the canary
- root DOM node count stayed `7628` on legacy and `135` on the canary
- section DOM node count stayed `132` on both sides

## Reading

- Deferring the debounced viewport persistence scheduling during active motion
  did not move the measured average frame duration on the canonical lane.
- Long-task total shifted slightly, but the canary max frame duration regressed
  versus the previous canary sample, so this does not count as a meaningful
  motion win.
- This closes the "per-tick viewport persistence scheduling" hypothesis for the
  current lane. The remaining hotspot is deeper than the persistence debounce
  path.

## Conclusion

- The temporary viewport-persistence deferral experiment is reverted.
- Do not reopen this hypothesis by default unless a future trace shows the
  debounce scheduling path dominating the motion lane.
- The next bounded product slice should target a different remaining
  viewport-sync / shared-store consumer on the same `rotaryParamCodeObjDefault`
  lane.
