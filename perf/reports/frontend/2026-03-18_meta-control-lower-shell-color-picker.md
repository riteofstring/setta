# Phase S2 MetaControl Lower Shell Color-Picker Flattening

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Remove the last lower MetaControl `single-cell-container` /
`single-cell-child` shell from the color-picker path without reopening the
accepted higher `sectionChrome` baseline or the already accepted lower
MetaControl date/time, password, and text/code shells.

## Change

- Production seam:
  - `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.tsx`
  - `frontend/src/components/Params/ParamUIs/ColorPickerInput.tsx`
- Focused tests:
  - `frontend/src/components/Params/ParamUIs/ColorPickerInput.test.tsx`
  - `frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts`
  - `frontend/tests/e2e/app/app-mode-colorpicker-dropzone-theme.spec.ts`

Implementation:

- The MetaControl color wrapper no longer uses:
  - `single-cell-container`
  - `single-cell-child`
- The MetaControl lower shell is now:
  - `section-value relative flex ... items-stretch`
  - `colorpicker relative flex ...`
- The shared `ColorPickerInput` no longer depends on grid-overlay helper
  classes for either rendering path:
  - native input path:
    - centered icon restored with an absolute overlay
    - native input fills the shell with an absolute inset contract
  - choice-trigger path:
    - swatch background is now an absolute underlay
    - visible label/chevron row is now a relative flex overlay
- The compact green MetaControl color well keeps the same pill-like outer shell
  after the class removal.

## Automated Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx src/components/Params/ParamUIs/ColorPickerInput.test.tsx`
  - result: `2` files passed, `11` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts frontend/tests/e2e/app/app-mode-colorpicker-dropzone-theme.spec.ts`
  - result: `14` passed

Added direct coverage:

- `ColorPickerInput.test.tsx`
  - native input path no longer renders the single-cell overlay helpers
  - choice-trigger path no longer renders the single-cell overlay helpers
- `meta-control-date-time-modes.spec.ts`
  - strengthened the existing text-area guardrail so the live CodeMirror editor
    must stay inside the compact section shell after activation
  - added a MetaControl color-picker guardrail for the native color-well path:
    - no lower single-cell classes
    - input stays inside the compact section bounds
- `app-mode-colorpicker-dropzone-theme.spec.ts`
  - stayed green, giving end-to-end coverage to the shared choice-trigger
    rendering path under app theming

## CDP Compare

Control page:

- untouched `main`
- existing DevTools window: `http://127.0.0.1:3087/baking_tide`
- representative section: native MetaControl color well

Control read:

- lower shell still contains:
  - `single-cell-container`
  - `single-cell-child`
- geometry:
  - node bounds: `202 x 34`
  - shell bounds: `198 x 28`
  - native input bounds: `198 x 28`
- class read:
  - shell: `nodrag section-value single-cell-container ...`
  - input: `single-cell-child flex ...`

Worktree page:

- existing DevTools worktree window: `http://127.0.0.1:3011/young_staying`
- representative section: native MetaControl color well

Worktree read:

- lower shell now contains:
  - `section-value`
  - `relative`
  - `flex`
  - `items-stretch`
- lower shell no longer contains:
  - `single-cell-container`
  - `single-cell-child`
- geometry:
  - node bounds: `202 x 34`
  - shell bounds: `198 x 28`
  - native input bounds: `200 x 30`
- class read:
  - shell: `nodrag section-value relative flex ... items-stretch`
  - input: `absolute inset-0 flex !h-full min-h-7 !w-full ...`

## Visual check

- DevTools element screenshots of the untouched-`main` and worktree color
  wells stayed visually aligned on the touched native-input path:
  - same compact green rounded shell
  - same centered picker glyph
  - no visible overflow outside the `202 x 34` MetaControl node

## Interpretation

- The lower MetaControl color-picker shell is now accepted on the flex/absolute
  baseline.
- The lower MetaControl seam is exhausted for the current scope:
  - date/time: accepted
  - password: accepted
  - text/code: accepted
  - color-picker: accepted
- The next lower wrappers to inventory before reopening higher seams are the
  shared color-picker consumers outside MetaControl:
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Section/Layouts/DrawArea/DrawAreaControls.tsx`
