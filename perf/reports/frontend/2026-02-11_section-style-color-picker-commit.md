# Section Style Color Picker Commit-on-Release

Date: 2026-02-11
Area: frontend
Code paths touched:
- frontend/src/components/Panes/UiEditor/SectionConfig/SectionStyleColorSettings.tsx
- frontend/src/components/Params/ParamUIs/ColorPickerInput.tsx
- frontend/tests/e2e/editor/section-style-colors.spec.ts

## Scenario
- Project page with a selected section and the Section Config "Style" color input visible.
- Synthetic drag-like interaction: dispatch 40 `input` events across different hex colors, then 1 final `change` event.
- Measure:
  - number of `/api/setSectionStyleColor` requests emitted during the interaction,
  - DevTools performance trace insight summary for forced reflow in that interaction window.

## Before (baseline)
Environment:
- Chrome DevTools MCP trace on `http://127.0.0.1:3062/making_light`
- No CPU/network throttling

Results:
- Style update requests for one drag sequence: **40 POSTs** to `/api/setSectionStyleColor`.
- DevTools insight: **ForcedReflow** present.
  - Reported total reflow time: **1,027 ms**.
  - Top stack included `dispatchDiscreteEvent` and lodash `eq` from state equality checks.

Notes:
- Each drag step committed global + backend state, creating avoidable render + network pressure.

## After
Implementation change:
- Section style color now previews locally on `input` and commits global/backend state only on native `change` (release/finalize).

Results (same scenario):
- Style update requests for one drag sequence: **1 POST** to `/api/setSectionStyleColor`.
- DevTools trace: **no forced-reflow insight reported** for the measured window.

## Automated guardrail
- Added Playwright coverage in `frontend/tests/e2e/editor/section-style-colors.spec.ts`:
  - `commits section style color once after color-drag preview`
  - Simulates multi-step preview inputs + one finalize change.
  - Asserts backend commit count is exactly 1 and final style color persists.

## Rerun (after real-time preview propagation + themed panels/connectors)
Environment:
- Chrome DevTools MCP trace on `http://127.0.0.1:3062/making_light`
- No CPU/network throttling

Actions:
- Dispatched 40 `input` events on the style color picker (preview phase) then 1 `change` event (commit phase).
- Separately verified preview-only inputs (no `change`) still update section chrome in real time.

Results:
- End-to-end drag + commit sequence emitted **1 POST** to `/api/setSectionStyleColor`.
- Preview-only inputs emitted **0 additional POSTs** to `/api/setSectionStyleColor`.
- Preview remained real-time (example preview state reached `#3366ff` with immediate section bg/border update in the same frame window).
- DevTools trace insight: **ForcedReflow** present with reported total reflow time **30 ms**.
  - Top stack still points at `dispatchDiscreteEvent`; reported frames included `useCodeAreaHeight` and lodash `eq`.
  - This is substantially below the original baseline and appears unrelated to per-input backend commits.
