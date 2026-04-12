# Settings Graph Substrate Canary Viewport-Interaction Pointer Suppression Hypothesis

Date: 2026-04-08
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: suppress inner section-body pointer/hover work during active viewport
  motion by extending the existing `useShouldDisablePointerEvents()` gate to
  also treat `viewportInteractionActive` as a pointer-lock condition.
- Product slice tested:
  `frontend/src/state/hooks/keyActivations.ts`
- Result: rejected and reverted. The canonical motion lane regressed enough that
  the change should not remain landed.

## Before

Source: Ralph item `293` on the same canonical lane.

- legacy `main`
  - average frame duration `17.80ms`
  - max frame duration `83.2ms`
  - long-task total `not recorded in that report excerpt`
  - root DOM `7628`
  - target section DOM `132`
  - visible section count `46`
- worktree canary
  - average frame duration `18.99ms`
  - max frame duration `66.7ms`
  - root DOM `135`
  - target section DOM `132`
  - visible section count `1`

## Experiment

- Temporary code change:
  - extended `useShouldDisablePointerEvents()` so
    `viewportInteractionActive` also disabled inner section pointer events
    during motion
- Temporary guard rail:
  - added a focused hook test proving the new suppression path only activated
    during viewport interaction and did not replace the older key-driven gate

## Verification

Commands run on the temporary experiment branch:

```bash
pnpm -C frontend exec prettier --check src/state/hooks/keyActivations.ts src/state/hooks/keyActivations.test.tsx

pnpm -C frontend exec vitest run src/state/hooks/keyActivations.test.tsx src/components/Section/Layouts/CodeArea.test.tsx

cd frontend && SETTA_BOOTSTRAP_TOKEN='<fresh worktree token>' PLAYWRIGHT_BASE_URL=http://127.0.0.1:3077 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8077 SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3088 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8088 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<fresh main bootstrap url>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --max-failures=1 --timeout=180000
```

Additional note:

- a worktree-only canary instrumentation rerun on the temporary experiment
  branch failed with `Target page, context or browser has been closed` during
  pane-state normalization, so no additional focused instrumentation snapshot
  was captured for this hypothesis

Observed normalized motion-perf output on the temporary experiment branch:

- legacy `main`
  - average frame duration `18.56ms`
  - max frame duration `116.8ms`
  - long-task total `185ms` across `2` long tasks
  - root DOM `7628`
  - target section DOM `132`
  - visible section count `46`
- worktree canary
  - average frame duration `21.11ms`
  - max frame duration `100.1ms`
  - long-task total `320ms` across `4` long tasks
  - root DOM `131`
  - target section DOM `128`
  - visible section count `1`

## Reading

- The experiment moved the canary in the wrong direction on the exact
  `rotaryParamCodeObjDefault` lane we care about:
  - average frame duration regressed `18.99ms -> 21.11ms`
  - long-task total increased materially
  - slow frames over both `33.3ms` and `50ms` increased
- That makes this a losing hypothesis even before worrying about the small DOM
  count change on the focused section.
- The most likely explanation is that toggling pointer-event suppression on the
  shared section surfaces introduced enough extra style/interaction work to
  outweigh any avoided hover churn on this lane.

## Conclusion

- This closes the "viewport-interaction pointer suppression" hypothesis for the
  current canonical lane.
- The temporary code and test were reverted immediately after measurement, so
  no production code from this experiment remains landed.
- The next iteration should return to a different transform-subscriber /
  shared-store mirror hotspot instead of reopening this suppression path by
  default.
