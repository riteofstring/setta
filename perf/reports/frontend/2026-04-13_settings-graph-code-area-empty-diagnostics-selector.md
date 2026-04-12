# Settings Graph CodeArea Empty Diagnostics Selector

Date: 2026-04-13
Worktree: `pixijs-graph`

## Slice

Stabilized the mounted `CodeArea` diagnostics selector so code sections with no
diagnostics reuse one shared empty diagnostics array instead of allocating a new
`[]` on every LSP store update.

## Why

On the live settings canary, mounted code section bodies are part of the
product-facing hot path. Returning a fresh empty diagnostics array let unrelated
diagnostics churn fan into mounted code editors even when the current section's
diagnostics were unchanged.

## Regression coverage

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CodeArea.test.tsx`
  - passed
  - includes a profiler assertion that a mounted `CodeArea` with no diagnostics
    does not re-commit when another section receives diagnostics

## Reading

- This is a real mounted section-body selector reduction, not a harness-only
  pass.
- The change stays on the earliest product-facing canary gate by reducing one
  avoidable `useLspDiagnostics(...)` subscriber invalidation in the code editor
  body path.
