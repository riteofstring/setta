# Section Shell S1 Checkpoint 1 Selection-Mode Pointer Suppression

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Check whether the wrapper-local geometry fix could keep the callable drag surface intact if the key/value CodeMirror surfaces stopped owning pointer interaction during param-selection mode.

## Attempt

Starting from the same local wrapper path that had already restored the `GlobalVariables` row geometry, the follow-up variant changed only the direct key/value wrappers in:

- `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`

Attempt shape:

- read `isSelectingParams` from `useMisc`
- disable the key/value editors while param selection is active
- move underline painting to wrapper pseudo-elements instead of the wrapper box
- add `pointer-events-none` to the dummy/real CodeMirror surfaces during selection mode
- keep the same wrapper-local `12px / 16px` typography contract that had already recovered the shared-row compare

No production code from this attempt was kept in the branch.

## Result

The callable reorder/indent representative still failed under this narrower interaction variant.

Failing representative under the local patch:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/params/callable-minimum-regression.spec.ts \
  --grep "workspace and standalone callable routes preserve reorder and tab indent behavior"
```

Observed failure:

- expected visible unpinned order after dragging `k` before `h`:
  - `k > h > i > j`
- actual visible order under the local patch:
  - `h > k > i > j`

Focused verification observed under this reverted local patch:

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `4` files passed, `7` tests passed

## Interpretation

The blocker is not solved by wrapper-local selection-mode disabling or pointer suppression alone.

The stronger owner read now points one layer outward:

- sortable ownership is attached at the row shell path:
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamRowShell.tsx`
- selection-mode capture still lives at the row path in `ParamSwitch.tsx`
- the wrapper-local patch only changed descendant wrappers in:
  - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- suppressing pointer events on the inner CodeMirror class strings was therefore not a reliable transfer of drag ownership back to the row owner

Treat the next fix as a row-owned drag/hit-testing problem, not another wrapper-local selection/pointer-events tweak.

## Clean-Branch Decision

- Do not land the selection-mode pointer-suppression variant.
- Keep checkpoint 1 open.
- Keep the branch on the last accepted clean code state before the next lower-seam attempt.

## Next Action

Investigate deeper row-owned drag/hit-testing ownership in the shared lower row-contract path before trying another geometry correction, then rerun the shared-row compare only after the callable reorder/indent representative stays green.
