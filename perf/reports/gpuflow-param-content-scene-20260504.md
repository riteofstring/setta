# GpuFlow Param Content Scene Baseline - 2026-05-04

## Scope

Plan slice 6 first owner move: define retained param content scene metadata and derive dict param row surfaces in the GPU project scene adapter.

## Baseline Before Changes

- `DictArea` renders `ParamGroupContainer`.
- `ParamGroupContainer` measures fixed and scrolling param areas through DOM observers.
- `EdgesStrip` renders pinned/unpinned param areas.
- `ParamDndList -> GetParamSwitch -> ParamSwitch -> ParamContainer` maps every filtered visible param id to persistent React row DOM.
- `GpuFlowScene.contentSurfaces` has no retained param content scene, no row virtualization range, no hit records, and no row-derived port anchors.

## Measurement Method

Static architecture baseline plus focused unit tests for the new pure row-layout and project-scene derivation paths. Browser performance profiling is reserved for the visible renderer switch once retained row draw commands replace DOM rows.

## After This Slice

- Added a generic retained row-content scene with visible row range, projected row rects, retained draw commands, hit records, and local port anchors.
- Preserved adapter-supplied canvas content surfaces in `GpuFlowScene.contentSurfaces` with duplicate surface id validation.
- Added a project GPU adapter that derives dict param content surfaces from shown-param metadata, generated param type guards, shared filter logic, and existing param tree selectors.
- The visible DOM row renderer remains active; this slice establishes retained scene ownership data but does not yet draw rows through WebGPU or delete `ParamContainer`.

## Focused Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/retainedContentScene.test.ts src/gpuFlow/sceneLayout.test.ts src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.test.ts`
- `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "src/(gpuFlow/(retainedContentScene|scene|sceneLayout)|components/(Params/(GetParamSwitch|paramListFiltering)|Pages/Project/GpuProjectSurface/(projectGpuLayoutAdapter|projectGpuParamContentAdapter)))" || true`
