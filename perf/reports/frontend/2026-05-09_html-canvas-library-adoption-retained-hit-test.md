# HTML-In-Canvas Library Adoption Retained Hit-Test Decision

Date: 2026-05-09

## Scope

This report records the retained hit-testing decision for
`docs/plans/html-in-canvas-support-library-adoption-plan.md`.

The implementation added diagnostics around retained scene builds and retained
hit tests, then exercised the changed frontend paths through realistic browser
coverage. No spatial-index package was adopted in this phase.

## Decision

Keep the current retained hit-test array scan.

The realistic Playwright flow records retained hit-test samples while panning,
zooming, scrolling retained parameter content, opening retained popups, using a
ranged control, and dragging retained parameters. The test asserts:

- retained pointer samples include `wheel` and `pointerdown`
- retained scene-build and hit-test diagnostics are present
- 95th percentile retained hit-test duration remains below 8 ms
- tested hit-record counts are non-zero
- retained drag/drop still preserves the expected visible parameter order

That gives evidence for the current scan path on the exercised retained
workflows. `rbush` or `flatbush` should remain deferred until traces show query
time dominating the input budget.

## Verification

Focused Vitest:

```text
pnpm -C frontend exec vitest run \
  src/gpuFlow/viewportMath.test.ts \
  src/gpuFlow/retainedContentScene.test.ts \
  src/gpuFlow/retainedContentScene.properties.test.ts \
  src/gpuFlow/retainedContentHitTest.test.ts \
  src/components/Pages/Project/GpuProjectSurface/projectGpuParamDragAdapter.test.ts \
  src/state/actions/params/paramTree.test.ts \
  src/gpuFlow/portals/floatingPosition.test.ts \
  src/components/Utils/Combobox/ComboboxList.test.tsx \
  src/components/Utils/ContextMenus/ContextMenuCore.test.tsx
```

Result: 9 files passed, 55 tests passed.

Realistic Playwright coverage:

```text
./scripts/run-playwright-e2e.sh gpu-flow/html-canvas-library-adoption.spec.ts
```

Result: 4 tests passed in 24.0 seconds.

TypeScript:

```text
pnpm -C frontend exec tsc --noEmit --pretty false
```

Result: the full repo check still reports pre-existing unrelated TypeScript
errors. A filtered pass over the touched adoption files produced no matching
errors after the local fixes.

## CDP Checks

The live app was inspected at `http://127.0.0.1:3019/settings` with
CanvasDrawElement/WebGPU Chrome flags enabled.

- Command palette combobox opened after pan/zoom with `role="combobox"` and a
  `role="listbox"` popup. The popup rect was `318.18,31.5 360x384`, fully
  inside the 1200x672 viewport.
- Context menu was opened near top, right, bottom, and left viewport edges. The
  Floating UI rects stayed fully inside the viewport on all four checks; the
  menu exposed `role="dialog"` and `aria-label="Create section"`.
- A retained text-like parameter row opened a retained DOM island with id
  `param-control:settings-section__browserSectionDefault:settings-codeobj__browserSectionDefault__browserSectionDefault__columnWidth`.
- A narrow pan/zoom probe after the surface was quiet changed the viewport from
  `x=89.3,y=-1146.7,zoom=1` to `x=191.9,y=-905.6,zoom=0.8` and recorded zero
  `HTMLCanvasElement.requestPaint` calls. The probe saw transform mutations on
  retained source surfaces during the viewport movement.

## Follow-Up Gate

Reconsider `rbush` or `flatbush` only if a future append-only report shows
retained hit-test query time, rather than scene rebuild or texture work, is the
dominant input-latency cost.
