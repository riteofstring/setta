# Settings ParamContainer Layout Refactor Plan

## Goal

Refactor the production `ParamContainer` row layout so the Settings project's `All Settings` view uses a flatter explicit-column layout instead of the current `section-args-nested*` / `grid-cols-subgrid` row structure.

The refactor must preserve user-visible behavior while improving pan/zoom performance.

## Why This Refactor

The benchmark work on this branch isolated the dominant row-shell cost to the current production layout path inside `ParamContainer`.

Highest-confidence findings so far:

- `ParamGroupContainer` scaffolding is not the bottleneck.
- Resize handles, tooltip/error chrome, and idle sortable wiring are not the bottleneck.
- `ParamInput` plumbing is not the bottleneck.
- The strongest remaining hotspot is the current row layout strategy:
  - `section-key-value`
  - `section-lg-value`
  - `section-args-nested*`
  - nested grid/subgrid row composition
- A benchmark-only explicit two-column row layout performed materially better than the current production layout while keeping the same recursive real param tree.

## Constraints

- Preserve existing behavior for:
  - param selection
  - focus and click-to-focus on labels
  - editable param names
  - live `ParamInput` rendering
  - resize handle behavior
  - tooltip/error behavior
  - DnD row wiring
  - nested param indentation and child rendering
- Do not remove the benchmark harness. Keep it usable for before/after comparison.
- Keep the report append-only under `perf/`.

## Implementation Strategy

1. Replace the production row article layout in `ParamContainer`.
   - Remove the production reliance on `section-args-nested*` and `grid-cols-subgrid` for row composition.
   - Use explicit per-row `gridTemplateColumns` definitions with named lines so existing `section-key` / `section-value` consumers still place correctly.
2. Replace the production nested-child wrapper layout in `ParamContainer`.
   - Use explicit nested grids for child rows instead of the current `section-args-nested` helper classes.
   - Keep the visual nested connector affordance.
3. Keep live label/input components compatible.
   - Preserve the line names that `ParamNameInput`, `ParamTextLabel`, and `ParamUI` expect.
   - Adjust only the minimal row-level wrappers necessary.
4. Keep resize/error chrome compatible.
   - Update any row-only positioning assumptions that currently depend on `section-center` or other old grid-area helpers.
5. Leave benchmark stages in place.
   - The benchmark-only `param-simple-grid-shell` remains useful as a control.
   - The production stages should now reflect the refactored layout.

## Files Expected To Change

- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/ResizeHandle.tsx`
- `frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
- `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`

Potentially:

- `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`

Only if production compatibility requires small placement adjustments.

## Verification Plan

1. Structural
   - Run the existing Settings benchmark Playwright spec.
   - Confirm benchmark stages still render the expected row markers.
2. Visual
   - Use Chrome DevTools MCP on `/settings?settingsBenchmarkStage=param-structure-shell`
   - Verify `All Settings` still looks correct with:
     - top-level params
     - nested params
     - editable names
     - value widgets
3. Build
   - `pnpm -C frontend build`
4. Performance
   - Re-run CDP traces on the refactored production stages.
   - At minimum measure:
     - `param-structure-shell`
     - `param-container-shell`
     - `full`
   - Append the before/after results to the existing perf report.

## Success Criteria

- Production row layout no longer uses the old `section-args-nested*` / `grid-cols-subgrid` row composition inside `ParamContainer`.
- Benchmark and Playwright coverage still pass.
- CDP visual verification shows no visible regression in the Settings `All Settings` view.
- `param-structure-shell` improves materially versus the existing baseline.
- `full` also improves, even if the text-family widget bucket remains a secondary limit after the row-layout fix.
