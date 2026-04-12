# Settings Graph Minimized Data Edge Handles Selector

Date: 2026-04-13
Worktree: `pixijs-graph`

## Summary

- Replaced the mounted `MinimizedDataEdgeHandles` store selector equality from
  `lodash/isEqual` to a purpose-built port-id comparator.
- Scope of the selector stayed the same:
  - `isMinimized`
  - `edgeInputParams`
  - `edgeOutputPorts[*].id`
- This component is mounted from `SectionContainerCore` on the section shell,
  so the change removes generic deep-equality work from a broad per-section
  edge-handle subscription without changing which minimized-handle inputs it
  observes.

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/MinimizedDataEdgeHandles.test.tsx`
  - passed (`2` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Container/MinimizedDataEdgeHandles.tsx src/components/Section/Container/MinimizedDataEdgeHandles.test.tsx`
  - passed

## Notes

- Added profiler coverage proving unrelated `previewSectionVariantMap` writes do
  not re-commit mounted minimized edge handles while a real minimized output
  port change still re-renders the handle surface.
