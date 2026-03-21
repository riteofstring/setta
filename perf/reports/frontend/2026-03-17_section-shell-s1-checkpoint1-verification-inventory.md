# Section Shell S1 Checkpoint 1 Verification Inventory

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Turn the plan's generic “verify `Callable` / `Dict` / `GlobalVariables` / floated param section / `MetaControl`” requirement into a concrete inventory of reusable assets and missing evidence.

## Shared Consumer Map

For the row-contract checkpoint, the relevant section-type ownership is:

- `Callable`:
  - `SectionAreaSwitch` -> `CallableArea`
  - `CallableArea` -> `KwargsControls` + `ParamGroupContainer`
- `Dict`:
  - `SectionAreaSwitch` -> `DictArea`
  - `DictArea` -> `KwargsControls` + `ParamGroupContainer`
- `GlobalVariables`:
  - `SectionAreaSwitch` -> `GlobalVariablesArea`
  - `GlobalVariablesArea` -> `KwargsControls` + `ParamGroupContainer`

Those three section types therefore share the same lower row chain:

- `ParamGroupContainer`
- `ParamDndList`
- `ParamSwitch`
- `ParamContainer`
- `ParamRowShell`

The floated/window path does not change that lower row chain by default:

- `SectionWindowSurface` still routes the body through `SectionAreaSwitch`
- only the host shell changes unless a caller supplies `bodyOverride`

`MetaControl` remains only a contrast surface:

- `SectionAreaSwitch` routes it to `MetaControlArea`
- `MetaControlArea` renders `MetaControlContent` / `MetaControlNode`
- it does not consume `ParamGroupContainer`, `ParamDndList`, `ParamSwitch`, `ParamContainer`, or `ParamRowShell`

## Reusable Automated Assets

### `Callable`

- Shared backend helper:
  - `frontend/tests/e2e/helpers.ts:createCallableSection(...)`
- Existing Playwright canvas representatives:
  - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
  - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - `frontend/tests/e2e/params/callable-params.spec.ts`
- Existing standalone/window representative:
  - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts:openStandaloneSectionSurface(...)`
- Existing unit shell read:
  - `frontend/src/components/Section/Layouts/CallableArea.test.tsx`

### `Dict`

- Existing Playwright canvas representatives:
  - `frontend/tests/e2e/params/dict-kwargs.spec.ts`
  - `frontend/tests/e2e/params/edge-input-args-selection.spec.ts`
- Existing unit shell read:
  - `frontend/src/components/Section/Layouts/DictArea.test.tsx`

### `GlobalVariables`

- Existing unit shell read:
  - `frontend/src/components/Section/Layouts/GlobalVariablesArea.test.tsx`
- Current gap:
  - no direct Playwright row-contract representative identified in the current tree

### `MetaControl` contrast only

- Existing Playwright contrast spec:
  - `frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts`
- Existing unit contrast spec:
  - `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`

## What This Means

- The next checkpoint pass does not need a new callable harness.
- The next checkpoint pass does not need a new dict harness.
- The immediate missing evidence is a direct `GlobalVariables` Playwright/CDP representative for the shared row contract.
- The floated/window representative currently exists only on the callable route, even though the default window host preserves the same lower row path for the shared param sections.

## Next Step

- Add or adapt a direct `GlobalVariables` row-contract representative.
- Then use it together with the existing callable/dict assets to close the declared cross-section verification set for checkpoint 1.
- Keep `MetaControl` as a contrast surface only.
