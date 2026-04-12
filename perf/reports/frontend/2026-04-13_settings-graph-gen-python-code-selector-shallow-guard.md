# Settings Graph Gen Python Code Selector Shallow Guard

Date: 2026-04-13
Worktree: `pixijs-graph`

## Slice

Stabilized the mounted `GenPythonCodeAreaContent` project-state selector so the
generated-code body now subscribes to `{ code, prefix, suffix }` behind
`zustand/shallow` equality instead of accepting every unrelated project-state
write.

## Why

On the live settings canary, generated-code bodies are mounted section editors
on the hot path. The previous selector returned a fresh object with no equality
guard, so unrelated `useProjectState` writes could still fan into mounted
generated-code editors even when the actual generated code inputs were
unchanged.

## Regression coverage

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CodeArea.test.tsx`
  - passed
  - includes a profiler assertion that a mounted `GenPythonCodeArea` does not
    re-commit on an unrelated `previewSectionVariantMap` write

## Reading

- This is a real mounted section-body selector reduction, not a harness-only
  pass.
- The change stays on the earliest product-facing canary gate by removing one
  avoidable generated-code body invalidation from the live settings graph path.
