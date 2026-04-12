# Settings Graph Substrate Canary World-Space Presented-Section Culling Verdict

Date: 2026-04-08
Canonical lane: `rotaryParamCodeObjDefault`
Surface: `settings` -> `All Settings`

## Summary

- Goal: restore one trustworthy automated verdict for the landed item-`303`
  world-space presented-section culling slice on the current runtime pair.
- Result: the canonical cross-worktree motion probe exited cleanly again on
  `run-021`, so the lane is trustworthy again after the earlier post-banner
  stall.
- Reading: the verifier blocker is cleared, but the fresh verdict still names
  `presentedSceneSectionsResolve` as the dominant repeated canary owner. This
  pass does not justify opening another blind product reduction on the same
  lane without finer attribution first.

## Verification

Passed:

```bash
WORKTREE_JSON=$(./scripts/dev-runtime-info.sh --workspace /Users/jeff/Documents/_projects/setta.pixijs-graph/. --runtime-log /var/folders/h8/yx9s_2gs37d50mktlw56975m0000gn/T//codex-supervisor.hnEFcN/loop-001/run-021/worktree-ai.log) && MAIN_JSON=$(./scripts/dev-runtime-info.sh --workspace /Users/jeff/Documents/_projects/setta --runtime-log /var/folders/h8/yx9s_2gs37d50mktlw56975m0000gn/T//codex-supervisor.hnEFcN/loop-001/run-021/main-ai.log) && env PLAYWRIGHT_BASE_URL="$(printf '%s' "$WORKTREE_JSON" | jq -r '.frontendUrl')" SETTA_BACKEND_ORIGIN="$(printf '%s' "$WORKTREE_JSON" | jq -r '.backendUrl')" SETTA_BOOTSTRAP_TOKEN="$(printf '%s' "$WORKTREE_JSON" | jq -r '.bootstrapUrl | split("#token=")[1]')" SETTA_MAIN_REFERENCE_FRONTEND_URL="$(printf '%s' "$MAIN_JSON" | jq -r '.frontendUrl')" SETTA_MAIN_REFERENCE_BACKEND_ORIGIN="$(printf '%s' "$MAIN_JSON" | jq -r '.backendUrl')" SETTA_MAIN_REFERENCE_BOOTSTRAP_URL="$(printf '%s' "$MAIN_JSON" | jq -r '.bootstrapUrl')" BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm -C frontend exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts --grep 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --timeout=180000
```

Passing output:

- legacy `main`:
  - average `17.46ms`
  - max `66.6ms`
  - `44` samples
  - root DOM `7628`
  - target section DOM `132`
  - editable controls `99`
  - visible section count `46`
- worktree canary:
  - average `17.87ms`
  - max `51.9ms`
  - `43` samples
  - root DOM `135`
  - target section DOM `132`
  - editable controls `2`
  - visible section count `1`
- worktree motion attribution:
  - `presentedSceneSectionsResolve`: `40` calls, `0.6ms` total,
    `0.1ms` max, dominant owner
  - `pixiViewportPresent`: `0`
  - `interactionMiscStateSync`: `1`, `0ms` total
  - `interactionReactFlowStateSync`: `1`, `0.2ms` total
  - `reactFlowViewportPublish`: `0`
  - `reactFlowTransformSubscriptionCallback`: `0`
  - `reactFlowTransformFollowerCallback`: `0`
  - `viewportPersistenceDispatch`: `0`

CDP:

- `CDP visual check: done (fresh-context sub-agent confirmed both worktree 3076 and main 3087 /settings pages rendered Settings graph content instead of a spinner or blank shell; worktree reported canvasCount 1 / spinnerCount 0, main reported spinnerCount 0 on the read-only legacy surface)`

## Reading

- The verifier/runtime stall recorded on item `303` did not reproduce on the
  fresh `run-021` runtime pair; the canonical motion probe is trustworthy again
  on this lane.
- The landed world-space culling slice is now backed by a fresh automated
  verdict and no longer needs another verifier-only rerun by default.
- `presentedSceneSectionsResolve` remains the only repeated measured owner on
  the motion burst, so the next bounded frontier should add finer attribution
  inside that presentation path before another product reduction is attempted.
