# 2026-04-13 settings graph state machine node area shallow selector

- Date: 2026-04-13 04:08 UTC
- Scope: live `/settings` canary attribution lane
- Target: `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`

## Why this slice

Recent iterations already removed several mounted section-body and section-header
`lodash/isEqual` selectors. Before taking another change, this pass did a local
ranking check across the remaining mounted section-body and section-shell owners.

`StateMachineNodeArea` was the clearest remaining broad body-entry candidate:

- it is a mounted section-body renderer, not a one-off header control
- its `getNodeSnapshot(sectionId)` selector only returns primitive fields
  (`type`, `machineGroupId`, `label`, `gateType`)
- the component still paid generic deep equality on every unrelated
  project-state write

## Product change

Changed the mounted workflow-node snapshot selector from `lodash/isEqual` to
`zustand/shallow` while keeping the subscribed source-of-truth fields unchanged.

## Expected effect

- reduce comparator overhead on unrelated `useProjectState` commits for mounted
  workflow-node bodies
- preserve re-renders when the actual workflow-node snapshot fields change

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/StateMachineNodeArea.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Section/Layouts/StateMachineNodeArea.tsx src/components/Section/Layouts/StateMachineNodeArea.test.tsx`

Focused regression coverage proves:

- mounted `StateMachineNodeArea` stays out of unrelated
  `previewSectionVariantMap` commits
- mounted `StateMachineNodeArea` still re-renders when its subscribed workflow
  snapshot changes
