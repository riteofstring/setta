# Settings Graph Substrate Canary Presentation-Path Owner Verdict

Date: 2026-04-08
Canonical lane: `rotaryParamCodeObjDefault`
Surface: `settings` -> `All Settings`

## Summary

- Goal: restore one trustworthy automated verdict for the item-`301`
  presentation-path attribution seam without reopening any closed product
  hypotheses.
- Result: the canonical cross-worktree probe passed again on fresh
  runtime-info-derived tokens and named `presentedSceneSectionsResolve` as the
  current dominant measured canary owner.
- `pixiViewportPresent` stayed at `0`, and the removed React Flow viewport /
  transform-subscription owners remained `0`.

## Verification

Passed:

```bash
WORKTREE_JSON=$(./scripts/dev-runtime-info.sh --workspace /Users/jeff/Documents/_projects/setta.pixijs-graph/. --runtime-log /var/folders/h8/yx9s_2gs37d50mktlw56975m0000gn/T//codex-supervisor.hnEFcN/loop-001/run-019/worktree-ai.log) && MAIN_JSON=$(./scripts/dev-runtime-info.sh --workspace /Users/jeff/Documents/_projects/setta --runtime-log /var/folders/h8/yx9s_2gs37d50mktlw56975m0000gn/T//codex-supervisor.hnEFcN/loop-001/run-019/main-ai.log) && env PLAYWRIGHT_BASE_URL="$(printf '%s' "$WORKTREE_JSON" | jq -r '.frontendUrl')" SETTA_BACKEND_ORIGIN="$(printf '%s' "$WORKTREE_JSON" | jq -r '.backendUrl')" SETTA_BOOTSTRAP_TOKEN="$(printf '%s' "$WORKTREE_JSON" | jq -r '.bootstrapUrl | split("#token=")[1]')" SETTA_MAIN_REFERENCE_FRONTEND_URL="$(printf '%s' "$MAIN_JSON" | jq -r '.frontendUrl')" SETTA_MAIN_REFERENCE_BACKEND_ORIGIN="$(printf '%s' "$MAIN_JSON" | jq -r '.backendUrl')" SETTA_MAIN_REFERENCE_BOOTSTRAP_URL="$(printf '%s' "$MAIN_JSON" | jq -r '.bootstrapUrl')" BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm -C frontend exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts --grep 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --timeout=180000
```

Passing output:

- legacy `main`:
  - average `17.04ms`
  - max `50ms`
  - `44` samples
  - root DOM `7628`
  - target section DOM `132`
  - editable controls `99`
  - visible section count `46`
- worktree canary:
  - average `18.62ms`
  - max `66.6ms`
  - `43` samples
  - root DOM `135`
  - target section DOM `132`
  - editable controls `2`
  - visible section count `1`
- worktree motion attribution:
  - `presentedSceneSectionsResolve`: `40` calls, `0.4ms` total,
    `0.1ms` max, dominant owner
  - `pixiViewportPresent`: `0`
  - `interactionMiscStateSync`: `1`, `0ms` total
  - `interactionReactFlowStateSync`: `1`, `0.1ms` total
  - `reactFlowViewportPublish`: `0`
  - `reactFlowTransformSubscriptionCallback`: `0`
  - `reactFlowTransformFollowerCallback`: `0`
  - `viewportPersistenceDispatch`: `0`

CDP:

- `CDP visual check: done (reused item 301 fresh-context smoke confirmation because this iteration only refreshed the automated perf verdict and did not change renderer/runtime product code)`

## Reading

- The canonical verifier/runtime blocker on item `301` did not reproduce on the
  fresh `run-019` runtime pair; the same shared probe exited cleanly and printed
  a numeric verdict.
- The next measured hotspot is no longer unknown on this lane:
  `presentedSceneSectionsResolve` is now the only non-closed motion owner with
  repeated per-burst activity.
- The next bounded product slice should stay on
  `rotaryParamCodeObjDefault` and either reduce or further split
  `presentedSceneSectionsResolve`; do not reopen the already-closed React Flow,
  persistence, host-size, pointer-suppression, or Pixi viewport-present lanes
  without new contrary evidence.
