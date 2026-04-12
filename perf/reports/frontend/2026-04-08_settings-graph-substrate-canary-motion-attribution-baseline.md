# Settings Graph Substrate Canary Motion Attribution Baseline

Date: 2026-04-08
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: add one bounded attribution seam on the canonical motion lane so the
  next product slice is chosen from measured owners instead of another blind
  transform-consumer toggle.
- Product slice:
  `settingsGraphSubstrateCanaryInstrumentation` now records per-owner motion
  attribution while the normalized motion probe is active.
- Instrumented owners:
  - `reactFlowViewportPublish`
  - `reactFlowTransformSubscriptionCallback`
  - `reactFlowTransformFollowerCallback`
  - `interactionReactFlowStateSync`
  - `interactionMiscStateSync`
  - `viewportPersistenceDispatch`

## Before

Source: Ralph items `295`, `296`, and `297` on the same canonical lane.

- The lane still had one remaining hotspot after item `293`, but the evidence
  only said "deeper transform-subscriber / shared-store mirror work."
- Three later hypotheses on that broad area were already closed without a win:
  - Pixi host-size reads during viewport presents
  - viewport-persistence debounce deferral during active motion
  - viewport-interaction pointer suppression during active motion
- No landed report yet named which concrete remaining owner dominated the
  normalized pan/zoom sequence on `rotaryParamCodeObjDefault`.

## After

Verification runtime:

- worktree frontend `http://127.0.0.1:3076/`
- worktree backend `http://127.0.0.1:8076`
- reference frontend `http://127.0.0.1:3087/`
- reference backend `http://127.0.0.1:8087`

Commands:

```bash
pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts

pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts src/state/subscriptions.ts src/state/actions/sectionInfos.ts tests/e2e/settings/graphSubstrateParityProbe.ts tests/e2e/settings/settings-view-modes-main-reference.spec.ts

pnpm -C frontend exec prettier --check tests/e2e/settings/settings-view-modes-main-reference.spec.ts

cd frontend && SETTA_BOOTSTRAP_TOKEN='<fresh worktree token>' PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3087 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8087 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<fresh main bootstrap url>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --max-failures=1 --timeout=180000
```

Results:

- unit coverage:
  - motion attribution stays idle until the capture flag is enabled
  - enabled attribution increments the selected owner count and duration totals
- normalized motion-perf output:
  - legacy `main`: average `16.62ms`, max `34.6ms`, `44` samples, root DOM
    `7628`, target section DOM `132`, editable controls `99`, visible section
    count `46`
  - worktree canary: average `17.02ms`, max `33.4ms`, `43` samples, root DOM
    `135`, target section DOM `132`, editable controls `2`, visible section
    count `1`
- worktree canary motion attribution on the measured sequence:
  - `reactFlowViewportPublish`: `20` calls, `1.6ms` total, `0.2ms` max
  - `reactFlowTransformSubscriptionCallback`: `20` calls, `0ms` total,
    `0ms` max
  - `reactFlowTransformFollowerCallback`: `20` calls, `0ms` total, `0ms` max
  - `interactionReactFlowStateSync`: `1` call, `0.1ms` total,
    `0.1ms` max
  - `interactionMiscStateSync`: `1` call, `0ms` total, `0ms` max
  - `viewportPersistenceDispatch`: `0` calls, `0ms` total, `0ms` max
- dominant canary motion attribution owner:
  - `reactFlowViewportPublish`

Additional verification notes:

- The first rerun of the canonical Playwright probe stalled after starting the
  test; the committed cleanup change skips the final `applyProjectStateUpdate`
  sync for this specific perf probe and the same command then completed in
  `24.2s`.

## Reading

- The post-item-`293` remaining hotspot is no longer "some shared-store /
  transform mirror path" in the abstract. On the canonical lane, the concrete
  dominant owner is `reactFlowViewportPublish`.
- The other currently instrumented consumers are present but small on this
  sequence:
  - the transform subscription and follower callbacks still fire `20` times,
    but they did not accumulate measurable duration on this runtime
  - interaction-state sync is now down to one write each for `useMisc` and
    `useReactFlow`
  - viewport persistence did not dispatch at all on the measured motion burst
- The next product slice should target why `reactFlowViewportPublish` still
  writes the resolved viewport into the React Flow store on every measured
  motion step, rather than reopening already-closed host-size, persistence, or
  pointer-suppression hypotheses.
