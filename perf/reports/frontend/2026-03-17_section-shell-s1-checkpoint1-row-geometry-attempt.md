# Section Shell S1 Checkpoint 1 Row Geometry Attempt

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Test whether the remaining shared-row geometry/typography mismatch could be corrected locally in the direct key/value wrappers without reopening the broader lower seam.

## Attempt

Tried a local-only wrapper adjustment in:

- `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`

Attempt shape:

- move the underline off the wrapper's real box
- give the direct `.section-key` / `.section-value` wrappers the old measured `12px / 16px` typography contract
- keep the flex row-shell contract intact

No production code from this attempt was kept in the branch.

## What Improved Under The Local Patch

The headed-browser `GlobalVariables` shared-row compare did line up under the local patch.

Worktree row under the local patch:

- row height: `24.06`
- key height: `24.06`
- value height: `24.06`
- key typography: `12px / 16px`
- value typography: `12px / 16px`

That matches the untouched `main` read closely enough to prove the geometry mismatch is locally tractable inside the wrapper layer.

Artifacts captured under the local patch:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-shared-row-compare-rerun/worktree-global-variables-shared-row.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-shared-row-compare-rerun/main-global-variables-shared-row.png`

## What Broke

The existing callable reorder/indent representative regressed under every wrapper variant tried in this pass.

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

That means the drag never took on the touched branch state.

## Control Read

To separate a new regression from a pre-existing red test, I stashed the local wrapper patch and reran the same callable representative on the clean branch state.

Control rerun after stashing the attempt:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/params/callable-minimum-regression.spec.ts \
  --grep "workspace and standalone callable routes preserve reorder and tab indent behavior"
```

Result:

- `2 passed`

Interpretation:

- the callable reorder/indent failure is caused by the attempted wrapper fix
- the current committed branch state still keeps that representative green

## Additional Verification During The Attempt

These focused suites stayed green while the local wrapper patch was present:

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `4` files passed, `7` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-params.spec.ts frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/global-variables-kwargs.spec.ts frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts`
  - result: `7` tests passed

## Decision

- Do not land the wrapper-only geometry fix from this pass.
- Keep checkpoint 1 open.
- Treat the next blocker as a lower-seam interaction problem:
  - find a way to recover the shared-row geometry/typography match without regressing the callable reorder/indent drag surface
- Do not move upward into `sectionChrome` yet.
