# Settings Graph Substrate Canary Presented-Scene Visibility Attribution Split Verdict

Date: 2026-04-08
Canonical lane: `rotaryParamCodeObjDefault`
Surface: `settings` -> `All Settings`

## Summary

- Goal: restore one trustworthy automated verdict for the landed item-`305`
  presentation-owner split on the canonical canary lane before opening
  another product reduction.
- Result: the canonical cross-worktree motion probe passed cleanly on the
  pre-recovery `run-023` runtime pair, and the new split owners no longer
  carried measurable duration on the captured motion burst.
- Reading: the required live CDP visual gate re-blocked after the one allowed
  headless `./aireset.sh` recovery, so this slice now has fresh numeric
  evidence but is not yet visually re-accepted on the refreshed live runtime.

## Verification

Passed before lifecycle recovery:

```bash
BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_BOOTSTRAP_TOKEN='SETTA_HISTORY_REDACTED' SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3087/ SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8087 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='http://127.0.0.1:8087/__setta__/bootstrap#token=SETTA_HISTORY_REDACTED' pnpm -C frontend exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts --grep 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --timeout=180000
```

Passing output:

- legacy `main`:
  - average `17.06ms`
  - max `51.9ms`
  - `44` samples
  - root DOM `7628`
  - target section DOM `132`
  - editable controls `99`
  - visible section count `46`
- worktree canary:
  - average `17.82ms`
  - max `50.4ms`
  - `44` samples
  - root DOM `135`
  - target section DOM `132`
  - editable controls `2`
  - visible section count `1`
- worktree motion attribution:
  - `interactionMiscStateSync`: `1`, `0ms` total
  - `interactionReactFlowStateSync`: `1`, `0.1ms` total, dominant owner
  - `presentedSceneSectionVisibilityFilter`: `40` calls, `0ms` total
  - `presentedSceneVisibleViewportWorldRectResolve`: `40` calls, `0ms` total
  - `pixiViewportPresent`: `0`
  - `reactFlowViewportPublish`: `0`
  - `reactFlowTransformSubscriptionCallback`: `0`
  - `reactFlowTransformFollowerCallback`: `0`
  - `viewportPersistenceDispatch`: `0`

Blocked after the required lifecycle recovery attempt:

- one bounded headless recovery was attempted because the required fresh-context
  CDP smoke could not use `chrome-devtools-mcp`:

```bash
BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh
```

- the worktree restarted successfully on backend `8076` with debug port `9297`
  and a fresh bootstrap URL, but the refreshed runtime metadata still left the
  visual gate unhealthy:
  - fresh-context CDP retry: `chrome-devtools-mcp` could not connect to Chrome
    because `http://127.0.0.1:9297/json/version` was unavailable
  - post-recovery Playwright rerun: global setup failed because the fresh
    worktree bootstrap token returned `401 Unauthorized` at
    `http://127.0.0.1:8076/__setta__/bootstrap#token=...`

CDP:

- `CDP visual check: not run (after the one allowed headless ./aireset.sh recovery, chrome-devtools-mcp still could not connect to the refreshed worktree debug Chrome at http://127.0.0.1:9297/json/version)`

## Reading

- Item `305` now has one fresh trustworthy numeric verdict on the canonical
  `rotaryParamCodeObjDefault` lane.
- The new split owners no longer dominate the measured motion burst:
  `presentedSceneVisibleViewportWorldRectResolve` and
  `presentedSceneSectionVisibilityFilter` each stayed at `40` calls but `0ms`
  total duration on the passing run.
- The only non-zero owner on that captured burst was the one-off
  `interactionReactFlowStateSync` entry (`0.1ms` total), so another blind
  reduction on the two split presentation owners is not justified by the fresh
  numeric evidence.
- Do not treat this slice as accepted yet. The next pass must restore current
  worktree CDP/bootstrap health and re-run the required visual smoke before the
  lane moves on to the next product hotspot.
