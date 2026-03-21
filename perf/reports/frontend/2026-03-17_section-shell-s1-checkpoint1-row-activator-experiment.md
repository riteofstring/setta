# Section Shell S1 Checkpoint 1 Row Activator Experiment

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Test whether the known wrapper-local geometry fix could keep callable reorder green if param drag activation moved onto an explicit row-owned out-of-flow activator.

## Attempt

Combined two local changes:

- reintroduced the wrapper-local geometry correction in:
  - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- added an explicit row-owned activator overlay in:
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamRowShell.tsx`

Attempt shape:

- keep the sortable row rect owned by the row `<article>`
- route sortable activator ownership through an out-of-flow row overlay during selection mode
- preserve the same wrapper-local `12px / 16px` key/value geometry correction that had already matched untouched `main`

No production code from this attempt was kept in the branch.

## Focused Verification

Focused Vitest stayed green under the combined local patch:

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `4` files passed, `7` tests passed

The callable reorder/indent representative still failed:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/params/callable-minimum-regression.spec.ts \
  --grep "workspace and standalone callable routes preserve reorder and tab indent behavior"
```

Observed failure under the combined patch:

- expected visible unpinned order after dragging `k` before `h`:
  - `k > h > i > j`
- actual visible order:
  - `h > k > i > j`

## Interpretation

The remaining blocker is not solved by moving initial drag activation onto an explicit row-owned overlay.

That pushes the failure boundary later than the simple activator-ownership question:

- wrapper-local descendant ownership alone was not enough
- selection-mode pointer suppression on the CodeMirror surfaces was not enough
- explicit row-owned activator overlay was also not enough

The next pass should treat this as a drag lifecycle or collision/update problem after the geometry shift, not as another surface-ownership tweak.

## Additional Code-Read Findings

- `Callable` and `GlobalVariables` already share the same row subtree through the shared param group path; the mismatch is not caused by different row markup between those section types.
- The callable representative is a row-body drag contract, not a small-handle contract: it selects and starts dragging from the row's left interior, so narrowing activation to a visible or small handle would be a behavior change.
- The adapter already exposes `setActivatorNodeRef`, but the params path currently drops that seam. That is still a low-risk ownership hook if `setNodeRef` later needs to move off the row `<article>`, but it did not rescue the current geometry patch through the out-of-flow activator experiment here.
- `labelShapeKey` is already computed in `ParamSwitch.tsx` and passed through `ParamContainer.tsx`, but it is not rendered into the DOM. That is an available row-shape-specific modifier seam for a future CSS-level correction if the drag lifecycle can be stabilized first.

## Clean-Branch Decision

- Do not land the combined row-activator plus wrapper-geometry patch.
- Keep checkpoint 1 open.
- Keep the branch on the clean committed code state.

## Next Action

Instrument the param drag lifecycle or collision/update path before trying another geometry correction, and only return to a row/CSS seam with a shape-specific hook such as `labelShapeKey` rather than another broad descendant-wrapper tweak.
