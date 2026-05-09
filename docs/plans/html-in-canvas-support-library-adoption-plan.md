# HTML-In-Canvas Support Library Adoption Plan

## Goal
Adopt small support libraries that make the HTML-in-canvas project surface more
robust without replacing Setta's Architecture 3 ownership model.

The target outcome is better correctness coverage and less hand-rolled
positioning, while preserving the existing custom GPU scene graph, retained
parameter renderer, DOM island lifecycle, texture scheduling, and
transform-only pan/zoom behavior.

## Decision Summary
Adopt in this order:

1. `fast-check` for geometry and interaction invariant tests.
2. `@axe-core/playwright` for scoped accessibility regression checks around
   DOM islands, menus, dialogs, focus order, and accessibility mirrors.
3. `@floating-ui/dom` for custom positioned UI that is not already handled by
   Radix, especially canvas-aware combobox lists, context menus, validation
   bubbles, and DOM-island anchored overlays.

Evaluate later, behind measurements or concrete feature work:

- `rbush` or `flatbush` for retained hit testing and visual-surface lookup only
  if traces show linear scans are a real input latency cost.
- `wgpu-matrix` only when renderer math grows beyond the current viewport
  tuple and simple quad/mesh transforms.
- ELK.js only for an explicit graph auto-layout feature.

Do not adopt as Architecture 3 owners:

- React Flow or XYFlow for the project surface.
- PixiJS, Konva, Fabric, or another general canvas scene framework for retained
  parameter rendering or WebGPU composition.
- dnd-kit for retained parameter drag/drop.
- Yoga for current section layout unless `sceneLayout.ts` becomes a real
  flex-like constraint engine.
- `typegpu` in the core renderer until a prototype proves it reduces real WGSL
  or binding-layout defects without creating build coupling.

## Current Repo Facts
Some recommendations are already covered by existing dependencies and local
architecture:

- Radix primitives are already used for dialogs, dropdowns, menus, popovers,
  sliders, switches, and accordions.
- Downshift already powers the shared combobox system.
- Zustand and Immer are already present.
- Playwright is already the E2E test runner.
- Retained parameter hit testing currently scans generated hit records for the
  visible or overscanned retained scene, not all canonical parameters.
- The current renderer camera uniform is a simple viewport tuple plus canvas
  size, not a general matrix stack.

This plan should therefore add only focused missing pieces, not a broad canvas
framework stack.

## Non-Negotiables
- Do not change project-canvas ownership. The scene, layout, hit records,
  texture lifecycle, and interaction controllers remain Setta-owned.
- Do not add handwritten parallel models for generated or Go-owned contracts.
- Pin all new direct frontend dependencies exactly and update lockfiles only
  through `./update_dependencies.sh`.
- Do not introduce compatibility fallbacks or silent alternative renderers.
- Do not add backward-compatibility shims, legacy support paths, migrations,
  transitional adapters, dual-read/write paths, feature-flagged old/new
  placement paths, or glue code whose purpose is only to keep both
  implementations alive during the branch.
- Make direct replacements in the feature branch. It is acceptable for the app
  to be temporarily broken while a phase is in progress, as long as the final
  phase result is coherent and verified.
- Preserve direct canvas child source hosts required by `layoutsubtree`.
- Preserve transform-only pan/zoom. Library changes must not cause viewport
  movement to request HTML paints, force React section renders, or upload all
  textures.
- Treat each adopted library as having one narrow first consumer and one
  focused verification gate.
- Do not call this plan complete until realistic browser tests exercise the
  changed frontend behavior through real pointer, wheel, keyboard, focus, and
  text input paths.

## Phase 1: Add Property-Based Geometry Tests
Add `fast-check` as a frontend dev dependency.

Initial test targets:

- `frontend/src/gpuFlow/viewportMath.ts`
  - `flowToScreenPosition` and `screenToFlowPosition` round-trip for finite
    viewport tuples and points.
  - `zoomGpuViewportAtScreenPoint` preserves the flow coordinate under the
    pointer after zoom clamping.
  - `getGpuViewportForBounds` returns finite transforms for zero and non-zero
    bounds without violating min/max zoom.
- `frontend/src/gpuFlow/retainedContentScene.ts`
  - visible retained row ranges are monotonic, clamped, and never exceed
    `rowCount`.
  - row ranges with vertical gaps include rows whose projected rect intersects
    the visible window plus overscan.
- `frontend/src/gpuFlow/retainedContentHitTest.ts`
  - hit results are clipped by both surface rect and clip rect.
  - later hit records win only when they actually contain the point.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuParamDragAdapter.ts`
  - visible insertion points map to canonical insertion indexes without moving
    hidden descendants out of order.
  - no-op drops and descendant-parent drops are rejected.

Implementation notes:

- Keep generated cases bounded to realistic dimensions and row counts so tests
  stay fast under Vitest.
- Use production functions directly. Do not duplicate the implementation logic
  to compute expected results.
- Prefer model-level invariants over snapshot-heavy expected arrays.

Verification:

- `pnpm -C frontend exec vitest run <new-or-touched-test-files>`
- `./scripts/quality/check.sh` before merging the final change set.
- These tests are necessary but not sufficient. They do not close the plan
  without the realistic browser coverage in the later phases.

## Phase 2: Add Scoped Accessibility Regression Checks
Add `@axe-core/playwright` as a frontend dev dependency.

Initial scope:

- DOM islands for retained text inputs, textareas, password fields, date/time
  fields, dropzones, and parameter name editing.
- Shared combobox popups rendered in canvas-aware portal roots.
- Radix menus, popovers, and dialogs opened from the project surface.
- Any accessibility mirror used for retained canvas controls.

Implementation approach:

- Add a small Playwright helper under `frontend/tests/e2e/` that runs axe on a
  scoped root instead of the whole app shell.
- Disable rules only when the reason is narrow, documented, and tied to a
  known canvas/DOM-island constraint.
- Assert focus ownership before and after axe checks so the test also catches
  broken DOM-island activation.

Suggested first specs:

- retained text input island opens, receives focus, passes scoped axe, commits,
  and returns interaction ownership to the canvas.
- retained password input island exposes the reveal control with an accessible
  name and preserves keyboard navigation.
- combobox popup opened from a retained/native island has a valid input/listbox
  relationship.
- retained date/time and dropzone islands can be opened and dismissed using the
  same pointer and keyboard flows a user would use.

Verification:

- `./scripts/run-playwright-e2e.sh <new-spec>`
- CDP visual verification for any UI behavior changed while adding coverage.

## Phase 3: Replace Manual Floating Placement Selectively
Add `@floating-ui/dom` as the first positioning dependency. Prefer this over
`@floating-ui/react` initially because Setta already has React/Radix primitives
and mostly needs deterministic positioning utilities for custom canvas-aware
portals.

Create a shared positioning wrapper, likely under:

`frontend/src/gpuFlow/portals/floatingPosition.ts`

The wrapper should support:

- real element references
- virtual references for retained canvas hit rects and flow-space anchors
- viewport-root and canvas-root portal coordinate spaces
- offset, flip, shift, and size constraints
- reposition on scroll, resize, and GPU viewport transform changes
- explicit cleanup of observers/listeners

First consumers:

1. `frontend/src/components/Utils/Combobox/ComboboxParts.tsx`
   - Replace manual list placement with the wrapper for the owned combobox list
     path. Do not keep a temporary old/new placement switch.
   - Preserve Downshift ownership and current shared combobox API.
2. `frontend/src/components/Utils/ContextMenus/ContextMenuCore.tsx`
   - Replace manual viewport edge clamping with virtual-point positioning.
   - Remove the local edge-clamping code once the Floating UI path owns
     placement.
   - Preserve existing Radix dropdown ownership and keyboard behavior.
3. Retained DOM-island validation or helper popovers, if present in the active
   UI path.

Testing:

- Unit tests for the wrapper with virtual references and portal roots.
- Existing combobox placement tests updated to assert flip/shift behavior.
- A focused Playwright test opening a canvas-aware combobox before and after
  pan/zoom, proving it remains anchored and visible.
- A focused Playwright test opening a context menu near each viewport edge,
  selecting an item by keyboard and pointer, and proving the menu stays visible
  without stealing later canvas input.
- A focused Playwright test that activates a retained DOM island, opens an
  anchored helper/popup if applicable, pans or zooms the canvas, and verifies
  focus and placement remain correct.

Verification:

- `pnpm -C frontend exec vitest run frontend/src/components/Utils/Combobox/ComboboxList.test.tsx`
- Relevant focused Playwright spec if user-visible placement changes.
- CDP visual check for changed popover/combobox/context-menu behavior.

## Phase 4: Baseline Retained Hit Testing Before Spatial Indexing
Do not add `rbush` or `flatbush` immediately. First collect evidence.

Add or extend diagnostics around retained hit testing:

- number of retained content surfaces considered
- hit record count per tested retained scene
- time spent in retained hit testing per pointer event
- time spent rebuilding retained scenes and hit records
- pointer event rate during scroll, drag, and ranged-control interaction

Run measurements on:

- dense settings sections
- large parameter lists with nested rows
- active retained popups
- retained drag/drop with auto-scroll
- many visible DOM section surfaces with edge labels

Decision gate:

- If query time dominates and scenes change incrementally, prototype `rbush`.
- If rebuilds happen per committed scene/frame and query time is still high,
  prototype `flatbush`.
- If scan time stays below the input-latency budget, keep the current array scan
  and avoid the dependency.

Prototype requirements:

- Build the index as a derived surface artifact, not as canonical scene state.
- Preserve hit stacking order semantics.
- Keep tests proving overlap precedence, clipping, and popup hit ordering.
- Record before/after numbers in `perf/` as append-only reports.
- If an index is adopted, remove the old scan path from production code instead
  of retaining it as a fallback. Tests may keep simple reference checks in test
  code when they assert behavior rather than duplicate implementation.

## Phase 5: Defer Renderer Math Libraries Until Needed
Do not add `wgpu-matrix` for the current camera path. The current renderer only
needs viewport x/y/zoom, canvas width, and canvas height.

Reconsider `wgpu-matrix` when one of these becomes true:

- mesh/effect surfaces need multiple composed transforms
- camera projection expands beyond the current 2D viewport contract
- clip, quad, or effect math starts duplicating matrix operations across
  renderer modules
- tests need canonical matrix helpers to avoid hand-written math drift

If adopted:

- keep the viewport tuple as the public `GpuFlow` contract
- isolate matrix usage inside renderer/effect modules
- add tests proving WebGPU clip-space conversion matches existing viewport
  semantics

## Phase 6: Defer Auto-Layout Libraries To Feature Work
Do not add ELK.js as infrastructure. Add it only for an explicit auto-layout
feature where the user expects graph/port-aware placement.

If that feature is approved:

- keep canonical graph/project state Go-owned where relevant
- treat ELK output as proposed layout positions, not as owner state
- commit final positions through existing project backend routes
- test deterministic output for pinned, locked, nested, and port-constrained
  sections

Do not use Dagre unless the feature is intentionally limited to simple directed
graph layout without nested ports or compound nodes.

## Phase 7: Optional TypeGPU Prototype
Only prototype `typegpu` after there is a concrete renderer pain point, such as
recurring bind-group layout mistakes, WGSL struct drift, or shader-resource
bugs not caught by current tests.

Prototype constraints:

- one isolated renderer module only
- no broad build-system commitment
- compare bundle/build impact and test ergonomics
- keep raw WebGPU code as the baseline until the prototype proves value

Exit criteria:

- documented defect class it prevents
- lower or equal implementation complexity in the prototype module
- no regression in renderer initialization, build speed, or browser support

## Dependency Update Procedure
For any phase that adds a package:

1. Add the exact direct dependency version.
2. Use `./update_dependencies.sh` so lockfile changes are intentional.
3. Run the focused tests for the first consumer.
4. Run `./scripts/quality/check.sh` before merging.
5. Record any substantial performance result in `perf/` as an append-only
   report.

## Realistic Frontend Verification Gate
The plan is not finished until the frontend is tested through realistic user
workflows, not only isolated unit tests or implementation-level scene fixtures.

Required Playwright coverage:

- Open a project surface with retained parameters, pan and zoom the canvas, then
  open and use a shared combobox from a canvas-aware portal.
- Open context menus near all viewport edges, use both keyboard and pointer
  selection, dismiss them, and confirm canvas click/drag input still works.
- Activate retained DOM islands for text, password, date/time, and dropzone
  controls; type or interact with them; commit or dismiss; then verify focus
  and canvas ownership return correctly.
- Scroll a dense retained parameter section, open retained popups, use ranged
  controls, and confirm hit testing still targets the visible control after
  pan/zoom.
- Perform parameter drag/drop in a retained surface after using the new
  positioned overlays, proving no overlay state blocks retained interaction.
- Exercise the same flows in light and dark themes when visual styling or
  portal placement is touched.

Required CDP checks:

- Visual check for combobox placement before and after pan/zoom.
- Visual check for context-menu edge flipping/shifting.
- Visual check for at least one retained DOM island and anchored popup/helper.
- Performance or frame diagnostics check confirming normal pan/zoom stays
  transform-only.

These tests should use real pointer, wheel, keyboard, focus, and text-input
events. Avoid direct UI-store mutation for the behavior under test. Setup may
use backend or project APIs, but the tested behavior must follow user-visible
paths.

## Acceptance Criteria
This adoption effort is complete when:

- `fast-check` covers the highest-risk viewport, retained-row, hit-test, and
  drag/drop invariants.
- Scoped axe coverage exists for the first DOM-island and canvas-aware popup
  flows.
- At least one manual-positioned custom popup path has moved to the shared
  Floating UI wrapper without changing the component ownership model.
- Retained hit testing has a measurement-backed decision: keep scan, use
  `rbush`, or use `flatbush`.
- No general canvas scene framework owns Architecture 3 rendering or
  interaction.
- Pan/zoom performance reports still show transform-only behavior.
- The realistic frontend verification gate has passed with Playwright and CDP
  coverage for the changed user paths.
- The final branch has no legacy placement path, transitional compatibility
  adapter, or old/new feature flag left behind for this work.
