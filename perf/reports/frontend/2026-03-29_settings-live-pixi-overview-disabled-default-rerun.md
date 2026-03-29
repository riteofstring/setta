# Settings Live Pixi Overview Disabled-Default Rerun (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Disable the low-zoom Pixi `overview` LOD by default while preserving the
  implementation behind an explicit opt-in.
- Re-measure the live settings canvas after the default changed so the decision
  is tied to current evidence instead of the earlier temporary forced-detail
  probe.

## Implementation

- Default behavior now stays on the `detail` path at all zoom levels.
- The overview path remains available only through:
  - `?liveDictAreaPixiOverview=enabled`
- The default-disabled gate is resolved in:
  - [`frontend/src/components/Params/liveDictAreaPixiSceneView.ts:234`](/Users/jeff/Documents/_projects/setta.pixijs-rewrite/frontend/src/components/Params/liveDictAreaPixiSceneView.ts#L234)
  - [`frontend/src/components/Params/liveDictAreaPixiScene.tsx:94`](/Users/jeff/Documents/_projects/setta.pixijs-rewrite/frontend/src/components/Params/LiveDictAreaPixiScene.tsx#L94)

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings`
- Renderer:
  - `pixi-node-body` via session storage
- Page:
  - `All Settings`
- Start transform:
  - `translate(712.4px, 409.4px) scale(0.1)`
- Interaction:
  - single `zoom in` click to `scale(0.12)`

## Observations

- Visible Pixi cards at `scale(0.1)` stayed in `detail` mode on the live page.
- Post-change trace run 1:
  - `INP`: `74 ms`
  - input delay: `1 ms`
  - processing: `0.7 ms`
  - presentation delay: `72 ms`
- Post-change trace run 2:
  - `INP`: `74 ms`
  - presentation delay remained the dominant cost

## Comparison To The Earlier LOD Probe

- Earlier temporary forced-detail runs at the same deep min-zoom step:
  - `156 ms`
  - `119 ms`
  - average: `137.5 ms`
- Earlier overview-enabled runs at the same step:
  - `155 ms`
  - `168 ms`
  - average: `161.5 ms`
- Current disabled-default rerun:
  - `74 ms`
  - `74 ms`
  - average: `74 ms`

## Verdict

- Disabling the overview mode by default did not hurt the measured low-zoom
  zoom-in path.
- On the rerun build, the current default-disabled path was materially better
  than the earlier low-zoom samples collected before the code change.
- The remaining cost is still mostly presentation/compositor delay, not event
  callback CPU.
- Keeping overview only as an explicit opt-in is the right default until a
  stronger product or performance case appears.

## Verification Notes

- Focused Vitest:
  - `pnpm -C frontend exec vitest run src/components/Params/liveDictAreaPixiSceneView.test.ts src/components/Params/LiveDictAreaPixiScene.test.ts`
  - result: passed (`39 passed`)
- Chrome DevTools MCP visual/perf check:
  - result: passed for the default-disabled live settings page
  - verified low-zoom live cards remained in `detail`
  - captured two `0.1 -> 0.12` traces on the current build
