## Goal

Reduce mounted section-shell re-render fan-out by keeping agentic
scope-highlight updates scoped to the section whose read/write highlight state
actually changed.

## Change

- Changed `frontend/src/components/Section/Container/SectionContainerCore.tsx`
  so the mounted shell subscribes to per-section `isReadScope` /
  `isWriteScope` booleans instead of subscribing to the entire
  `readSectionIdsByProjectConfigId[projectConfigId]` and
  `writeSectionIdsByProjectConfigId[projectConfigId]` maps.
- Added focused profiler coverage in
  `frontend/src/components/Section/Container/SectionContainerCore.test.tsx`
  to prove:
  - a mounted section shell does not commit when an unrelated section gains a
    scope highlight
  - the same shell still re-renders when its own scope highlight changes from
    read to write

## Why This Slice

- `SectionContainerCore` is mounted section chrome on the settings graph, so
  the previous map-level selector could fan an unrelated scope-highlight update
  across every mounted shell in the project.
- This keeps the slice on a wide section-surface boundary instead of another
  small edge/control-only subscription split.

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainerCore.test.tsx`
  - passed (`1` file, `2` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Container/SectionContainerCore.tsx src/components/Section/Container/SectionContainerCore.test.tsx`
  - passed
- Headless CDP smoke on worktree `/settings`
  - `/settings` loaded successfully
  - settings graph surface rendered with populated section shells
  - no obvious blank graph region, layout collapse, or missing section shell
    surface was observed
