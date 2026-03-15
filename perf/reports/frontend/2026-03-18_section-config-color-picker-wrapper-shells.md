# Phase S2 Section-Config Color-Picker Wrapper Flattening

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Remove the last remaining `single-cell-container` / `single-cell-child`
wrapper contract from the shared `ColorPickerInput` callers by flattening the
UI-editor `Section Config` color wells without reopening the accepted
callable/app/draw seam or the higher `sectionChrome` baseline.

## Change

- Production seam:
  - `frontend/src/components/Panes/UiEditor/SectionConfig/SectionStyleColorSettings.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/SectionTagColorSettings.tsx`
- Focused tests:
  - `frontend/tests/e2e/editor/section-style-colors.spec.ts`
  - `frontend/tests/e2e/editor/section-color-tags.spec.ts`

Implementation:

- The `Style` color well now renders `ColorPickerInput` directly on:
  - `relative flex h-8 min-h-0 w-36 min-w-0 items-stretch`
  - no outer `single-cell-container`
- The `Color Tag` choice trigger now renders on the same wrapper contract and
  no longer keeps `single-cell-container` on the visible trigger path.
- The visible native/choice input path in the touched pane controls no longer
  depends on `single-cell-child`.

## Automated Verification

- `pnpm -C frontend exec vitest run src/components/Params/ParamUIs/ColorPickerInput.test.tsx`
  - result: `1` file passed, `2` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor/section-style-colors.spec.ts frontend/tests/e2e/editor/section-color-tags.spec.ts`
  - result: `5` passed

Added direct coverage:

- `section-style-colors.spec.ts`
  - the `Style` color well no longer exposes `single-cell-container`
  - the touched native input path no longer exposes `single-cell-child`
  - the existing style-color persistence/theme regression stays green
- `section-color-tags.spec.ts`
  - the `Color Tag` choice-trigger path no longer exposes
    `single-cell-container`
  - the touched choice-trigger path no longer exposes `single-cell-child`
  - the existing tag-dot/filter regression stays green

## CDP Compare

Control tab:

- untouched `main`
- existing DevTools tab restored to `http://127.0.0.1:3087/sleet_taking`
- disposable compare project `wood_palm` was created from that existing tab and
  removed after the read

Control read:

- `Style` still reads:
  - wrapper: `single-cell-container h-8 min-h-0 w-36 min-w-0`
  - inner shell: `single-cell-container h-8 min-h-0 w-full min-w-0`
  - visible native input: `single-cell-child ...`
  - visible control geometry: `144 x 32`
- `Color Tag` still reads:
  - wrapper: `single-cell-container h-8 min-h-0 w-full min-w-0`
  - trigger: `... single-cell-container colorpicker ...`
  - visible trigger path: `single-cell-child ...`
  - visible control geometry: `144 x 32`

Worktree tab:

- existing DevTools tab restored to `http://127.0.0.1:3011/home`
- disposable compare project `wet_strong` was created from that existing tab and
  removed after the read

Worktree read:

- `Style` now reads:
  - wrapper: `relative flex h-8 min-h-0 w-36 min-w-0 items-stretch`
  - visible native input: `absolute inset-0 flex ...`
  - no `single-cell-container`
  - no `single-cell-child`
  - visible control geometry: `144 x 32`
- `Color Tag` now reads:
  - wrapper: `relative flex h-8 min-h-0 w-36 min-w-0 items-stretch`
  - trigger: `colorpicker relative flex h-8 min-h-0 w-full min-w-0 ...`
  - no `single-cell-container`
  - no `single-cell-child`
  - visible control geometry: `144 x 32`

## Visual Check

- In the existing DevTools worktree tab, the `Style` blue color well stayed
  visually aligned with the untouched-`main` control screenshot after the
  wrapper flattening.
- In the existing DevTools worktree tab, the `Color Tag` red trigger stayed
  visually aligned with the untouched-`main` control screenshot after the
  wrapper flattening.
- The untouched-`main` control tab kept the old single-cell wrapper classes on
  both representative pane controls, providing a direct class-level control for
  the seam.

## Interpretation

- The UI-editor `Section Config` pair now joins the accepted shared
  color-picker wrapper baseline.
- The shared `ColorPickerInput` seam is exhausted for the current scope.
- The accepted callable/app/draw and MetaControl color-picker slices stay
  closed.
- The next pass should return to the remaining section-owned lower shell,
  starting with `frontend/src/components/Section/SectionParts/Search.tsx`
  rather than reopening `sectionChrome`.
