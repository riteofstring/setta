# Settings Graph Kwargs Action Buttons Derived Selector Boundary

Date: 2026-04-13
Scope: mounted section-body kwargs action-strip subscription fan-out

## Why this slice

`KwargsControls` mounted the arg action strip and the param-filter input under
one subscription boundary. The action strip was reading the full effective
params impl, so typing into `paramFilter` could re-commit every mounted kwargs
button row even though only the filter input needed that update.

## Change

- extracted the mounted arg action strip into
  `frontend/src/components/Section/SectionParts/KwargsControls.tsx` as
  `KwargsActionButtons`
- changed the action-strip render subscription to read only derived selection
  state:
  - selected count
  - whether all selected params are edge inputs
  - whether any selected params are edge inputs
  - whether the current selection should unpin
  - deletable selected-param count
- moved full effective impl reads into click handlers so button rendering no
  longer depends on cloned array/object references from unrelated impl fields
- added focused regression coverage in
  `frontend/src/components/Section/SectionParts/KwargsControls.test.tsx`

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/SectionParts/KwargsControls.test.tsx`
  - passed (`1` file, `2` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/SectionParts/KwargsControls.tsx src/components/Section/SectionParts/KwargsControls.test.tsx`
  - passed

## Result

- unrelated `paramFilter` commits no longer re-commit the mounted kwargs action
  strip in the focused profiler test
- selection changes still re-commit the action strip, so the button disabled
  state and labels remain live on the intended lane
