## Goal

Reduce mounted section-header re-render fan-out by keeping chat follow-selection
updates scoped to the header whose follow state actually changed.

## Change

- Changed `frontend/src/components/Section/Header/SectionHeader.tsx` so
  `isFollowSelected` subscribes directly to a per-section boolean instead of
  subscribing to the whole
  `selectedSectionIdsByProjectConfigId[projectConfigId]` array and checking
  membership after render.
- Added focused profiler coverage in
  `frontend/src/components/Section/Header/SectionHeader.test.tsx` to prove:
  - a mounted chat header does not commit when an unrelated followed section is
    added
  - the same header still re-renders when its own follow-selected state flips

## Why This Slice

- Section headers are mounted chrome across the settings graph, so the old
  array-level selector could fan a follow-selection update across every mounted
  chat header in the project.
- This is a bounded selector split with a clear observable contract and avoids
  another pure handle-only micro-split.

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Header/SectionHeader.test.tsx`
  - passed (`1` file, `19` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Header/SectionHeader.tsx src/components/Section/Header/SectionHeader.test.tsx`
  - passed
- Headless CDP smoke on worktree `/settings`
  - pending at report creation time; recorded in iteration handoff/history
