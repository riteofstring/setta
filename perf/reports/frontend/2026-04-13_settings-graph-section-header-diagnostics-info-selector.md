# Settings graph section header diagnostics info selector

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`
Owner: mounted section header chrome

## Goal

Keep mounted code section headers out of unrelated `useProjectState` commits
when the diagnostics configuration for that header did not change.

## Change

- updated `frontend/src/components/Section/Header/SectionHeader.tsx` so the
  code diagnostics selector now uses `shallow` equality for the
  `{ ignoreState, language }` result instead of returning a fresh object that
  invalidated on every project-state write
- added focused profiler coverage in
  `frontend/src/components/Section/Header/SectionHeader.test.tsx` to assert a
  mounted code header does not re-commit on an unrelated project-state update
  when its diagnostics config is unchanged
- narrowed the profiled test host to the header actions strip so the regression
  measures the diagnostics selector path instead of unrelated title subtree
  subscriptions

## Why This Slice

- mounted section headers stay visible across the settings graph surface, so a
  fresh diagnostics-info object can fan unrelated project-state churn across
  many code headers even when diagnostics state is unchanged
- this stays on the live product path and reduces mounted section-chrome
  selector churn without reopening the closed probe/harness lane

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Header/SectionHeader.test.tsx`
  - passed (`1` file, `21` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Header/SectionHeader.tsx src/components/Section/Header/SectionHeader.test.tsx`
  - passed
- fresh-context headless CDP smoke on `http://127.0.0.1:3075/settings`
  - passed
  - settings shell and visible section cards/chrome rendered normally with no
    blank-screen or missing-header regression

## Reading

- before this slice, any project-state write rebuilt the
  `{ ignoreState, language }` selector result for mounted code headers, so
  unchanged diagnostics config could still trigger header commits
- `shallow` keeps that selector stable until either the ignore-state object or
  the code language actually changes
