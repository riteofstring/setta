# Phase S2 Shared Color-Picker Wrapper Flattening

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Remove the remaining shared `single-cell-container` / `single-cell-child`
wrapper contract from the non-MetaControl color-picker consumers without
reopening the accepted MetaControl lower shell or the higher `sectionChrome`
baseline.

## Change

- Production seam:
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Section/Layouts/DrawArea/DrawAreaControls.tsx`
- Focused tests:
  - `frontend/tests/e2e/params/color-picker-param-shell.spec.ts`
  - `frontend/tests/e2e/app/app-mode-colorpicker-dropzone-theme.spec.ts`
  - `frontend/tests/e2e/sections/draw-color-picker-shell.spec.ts`

Implementation:

- The shared callable param wrapper now uses:
  - `section-value relative flex ... items-stretch`
  - no wrapper-level `single-cell-container`
- The mirrored app-mode wrapper now uses the same flex shell and no longer
  carries `single-cell-container` on the shared choice-trigger path.
- The draw toolbar color wrapper now uses:
  - `relative flex h-full ... items-stretch`
  - no wrapper-level `single-cell-container`
- The visible color-input contract on the touched shared paths now rides the
  shared absolute inset native-input shell instead of the old
  `single-cell-child` overlay helper.

## Automated Verification

- `pnpm -C frontend exec vitest run src/components/Params/ParamUIs/ColorPickerInput.test.tsx`
  - result: `1` file passed, `2` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/color-picker-param-shell.spec.ts frontend/tests/e2e/app/app-mode-colorpicker-dropzone-theme.spec.ts frontend/tests/e2e/sections/draw-color-picker-shell.spec.ts`
  - result: `3` passed

Added direct coverage:

- `color-picker-param-shell.spec.ts`
  - callable color picker keeps the native input inside the compact value shell
  - the callable row no longer exposes the old single-cell wrapper helpers
- `app-mode-colorpicker-dropzone-theme.spec.ts`
  - app-mode themed choice trigger no longer exposes the old single-cell
    wrapper helpers
- `draw-color-picker-shell.spec.ts`
  - draw toolbar color picker no longer exposes the old single-cell wrapper
    helpers
  - the visible control stays inside the toolbar bounds

## CDP Compare

Control tab:

- untouched `main`
- existing DevTools tab: `http://127.0.0.1:3087/dry_saying`
- disposable compare project created from the existing tab and removed after the
  read

Control read:

- callable color-param wrapper still reads:
  - `section-value single-cell-container ...`
  - visible input path still reads `single-cell-child ...`
- draw toolbar color wrapper still reads:
  - `single-cell-container justify-self-start self-center min-w-8 max-w-48 h-full`
  - visible input path still reads `single-cell-child ...`

Worktree tab:

- existing DevTools tab: `http://127.0.0.1:3011/brewing_safe`
- disposable compare project created from the existing tab and removed after the
  read

Worktree read:

- callable color-param wrapper now reads:
  - `section-value relative flex ... items-stretch`
  - visible input path: `absolute inset-0 flex ...`
- draw toolbar color wrapper now reads:
  - `relative flex h-full min-h-0 min-w-8 max-w-48 ... items-stretch`
  - visible input path: `absolute inset-0 flex ...`
- the mirrored app-mode wrapper in `appRegistry.tsx` now uses the same shared
  flex shell and is guarded by the strengthened app-mode Playwright spec

## Visual Check

- In the existing DevTools worktree tab, the callable green color well stayed
  inside the compact value row after the wrapper flattening.
- In the existing DevTools worktree tab, the draw-toolbar red color well stayed
  aligned with the neighboring draw controls after the wrapper flattening.
- The untouched-`main` control tab kept the old single-cell shell contracts on
  both representative paths, giving a direct class-level control for the seam.

## Interpretation

- The shared color-picker wrapper seam is now accepted for:
  - `ParamUI.tsx`
  - `appRegistry.tsx`
  - `DrawAreaControls.tsx`
- The accepted MetaControl lower shell stays closed.
- The current shared callable/app/draw color-picker inventory is exhausted.
- The only remaining `ColorPickerInput` callers still carrying single-cell
  helpers are the out-of-scope UI-editor pane pair:
  - `frontend/src/components/Panes/UiEditor/SectionConfig/SectionStyleColorSettings.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/SectionTagColorSettings.tsx`
- The next planning decision is whether that pane family joins this plan or the
  work returns to the next remaining section-owned lower seam.
