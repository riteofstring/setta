# Settings graph section header empty diagnostics selector

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`
Owner: mounted section header chrome

## Goal

Keep mounted code section headers with no diagnostics out of unrelated
`useLspDiagnostics` commits.

## Change

- updated `frontend/src/components/Section/Header/SectionHeader.tsx` so the
  empty diagnostics selector result is a shared constant instead of a fresh
  `[]` allocation on every store update
- added focused profiler coverage in
  `frontend/src/components/Section/Header/SectionHeader.test.tsx` to assert a
  mounted code header with no diagnostics does not re-commit when another
  section receives diagnostics

## Why This Slice

- mounted section headers are always present on the settings graph surface, so
  an unstable empty-array selector can fan unrelated diagnostics churn across
  many visible sections
- this is a real product-side selector reduction on section chrome, not a
  harness-only change

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Header/SectionHeader.test.tsx`
  - passed (`1` file, `20` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Header/SectionHeader.tsx src/components/Section/Header/SectionHeader.test.tsx`
  - passed

## Reading

- the previous selector returned a new empty array whenever the current code
  section had no diagnostics, so unrelated diagnostics-store updates could
  still force header commits
- the shared empty-array contract keeps the current selector output stable
  until the current section actually gains diagnostics
