# Settings Graph Substrate Canary Presented-Scene Visibility Overlap Fast Path

Date: 2026-04-08
Canonical lane: `rotaryParamCodeObjDefault`
Surface: `settings` -> `All Settings`

## Summary

- Goal: test one bounded product reduction on the current
  `presentedSceneSectionVisibilityFilter` owner by replacing shell visibility
  intersection-object churn with a direct overlap fast path.
- Result: the canonical cross-worktree motion probe still passed cleanly on the
  pre-recovery `run-025` runtime pair, but the canary lane remained effectively
  unchanged.
- Reading: this closes one micro-optimization hypothesis on the current owner;
  it is not a measured win on the canonical lane.

## Landed slice

- `settingsGraphSubstrateCanarySectionPresentation.ts`
  - returns the full section list immediately when viewport culling is
    unavailable
  - uses a direct world-rect overlap check for presented shell visibility
    instead of allocating an intersection rect for that boolean-only path
  - keeps the body-mount threshold logic unchanged
- `settingsGraphSubstrateCanarySectionPresentation.test.ts`
  - guards the no-authoritative-bounds presented-subset case
  - guards the edge-touching shell-offscreen case

## Verification

Passed:

```bash
pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx
pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts
BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3075/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8075 SETTA_BOOTSTRAP_TOKEN='<run-025 worktree token>' SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3087/ SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8087 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<run-025 main bootstrap url>' pnpm -C frontend exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts --grep 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --timeout=180000
```

Passing output:

- legacy `main`:
  - average `17.04ms`
  - max `48ms`
  - `44` samples
  - root DOM `7628`
  - target section DOM `132`
  - editable controls `99`
  - visible section count `46`
- worktree canary:
  - average `17.05ms`
  - max `33.2ms`
  - `43` samples
  - root DOM `135`
  - target section DOM `132`
  - editable controls `2`
  - visible section count `1`
- worktree motion attribution:
  - `presentedSceneSectionVisibilityFilter`: `40` calls, `0.3ms` total,
    `0.1ms` max, still dominant
  - `interactionMiscStateSync`: `1`, `0.1ms` total
  - `interactionReactFlowStateSync`: `1`, `0.1ms` total
  - `presentedSceneVisibleViewportWorldRectResolve`: `40` calls, `0ms` total
  - `pixiViewportPresent`: `0`
  - `reactFlowViewportPublish`: `0`
  - `reactFlowTransformSubscriptionCallback`: `0`
  - `reactFlowTransformFollowerCallback`: `0`
  - `viewportPersistenceDispatch`: `0`

Blocked visual gate after the one allowed recovery:

- attempted bounded recovery:

```bash
BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh
```

- refreshed worktree runtime after recovery:
  - frontend `http://127.0.0.1:3076/`
  - backend `http://127.0.0.1:8076`
  - debug port `9298`
- required CDP retry still failed:
  - direct `chrome-devtools-mcp` calls in the main session timed out with
    `Network.enable timed out`
  - a fresh-context sub-agent could not use `chrome-devtools-mcp` because that
    tool was not exposed inside the spawned agent session

CDP:

- `CDP visual check: not run (after the one allowed headless ./aireset.sh recovery, direct chrome-devtools-mcp calls still failed with Network.enable timed out on the refreshed worktree debug Chrome at :9298)`

## Reading

- The direct overlap fast path did not move the canonical
  `rotaryParamCodeObjDefault` motion lane in a measurable way.
- Treat this slice as one closed product hypothesis on the current owner, not
  as a lane win.
- The next fresh iteration should restart the worktree lifecycle and close the
  blocked CDP visual gate for this landed slice before opening another product
  reduction on a different owner.
