# 2026-04-13 settings graph text block shallow selector

- Date: 2026-04-13 04:15 UTC
- Scope: live `/settings` canary attribution lane
- Target: `frontend/src/components/Section/Layouts/TextBlock.tsx`

## Why this slice

This pass started with a local ranking check across the remaining mounted
section-body and section-shell owners still using `lodash/isEqual`.

`TextBlock` was the clearest remaining broad body-entry candidate:

- it is a mounted section-body renderer rather than a one-off header control
- its `getTextBlockText(sectionId, state)` selector only returns primitive
  fields (`format`, `masterFontSizePx`, `headingAsSectionName`,
  `metaControlStyle`, `text`)
- the component still paid generic deep equality on unrelated project-state
  writes

## Product change

Changed the mounted `TextBlock` body selector from `lodash/isEqual` to
`zustand/shallow` while keeping the subscribed source-of-truth fields
unchanged.

## Expected effect

- reduce comparator overhead on unrelated `useProjectState` commits for mounted
  text-block bodies
- preserve re-renders when the actual text-block content or formatting fields
  change

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/TextBlock.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Section/Layouts/TextBlock.tsx src/components/Section/Layouts/TextBlock.test.tsx`

Focused regression coverage proves:

- mounted `TextBlock` stays out of unrelated `previewSectionVariantMap` commits
- mounted `TextBlock` still re-renders when its subscribed text changes
