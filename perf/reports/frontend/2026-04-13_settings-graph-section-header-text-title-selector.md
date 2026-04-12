# Settings Graph SectionHeader text title selector

Date: 2026-04-13
Scope: mounted `SectionHeader` title-mode selector on the live `/settings` canary lane

## Why this slice

- local ranking pass favored another broad mounted section-shell owner over a
  narrow control-only selector
- `SectionHeader` is mounted on every visible section and still used
  `lodash/isEqual` for the text-block title-mode snapshot
- the subscribed inputs were already only:
  - `headingAsSectionName`
  - `format`

## Change

- replaced the `TextBlockCardTitle` selector comparator in
  `frontend/src/components/Section/Header/SectionHeader.tsx`
  from `lodash/isEqual` to `zustand/shallow`
- kept the subscribed source-of-truth fields unchanged

## Expected effect

- mounted text-block section headers should stay out of unrelated
  `useProjectState` commits without paying generic deep-equality work on every
  write
- actual text-block title-mode changes should still rerender the header
