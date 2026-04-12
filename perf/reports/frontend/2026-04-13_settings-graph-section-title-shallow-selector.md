# Settings graph section title shallow selector

Date: 2026-04-13
Worktree: `setta.pixijs-graph`
Scope: mounted section-header title subscription on the live settings canary lane

## Change

- switched `frontend/src/components/Section/Header/SectionTitle.tsx`
  `useTitleIsEditable(...)` to `zustand/shallow`
- the selector still subscribes to the same source-of-truth fields:
  `section.name` and the derived `titleIsEditable`
- added `frontend/src/components/Section/Header/SectionTitle.test.tsx`
  to prove unrelated `previewSectionVariantMap` writes do not re-commit a
  mounted title while a real section rename still does

## Why this slice

- `SectionTitle` is mounted on every section header, so an unguarded composite
  selector fans unrelated `useProjectState` writes into a very wide mounted
  surface
- this keeps the existing title/editability contract but removes the fresh
  object identity churn on unrelated commits

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Header/SectionTitle.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Section/Header/SectionTitle.tsx src/components/Section/Header/SectionTitle.test.tsx`
- headless Chrome DevTools MCP smoke on `http://127.0.0.1:3075/settings`
  confirming the settings surface still hydrates with visible section cards and
  titles
