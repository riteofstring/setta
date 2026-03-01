# Pan/Zoom DOM Flattening Plan (Settings "All Settings" Benchmark)

## Goal
Improve pan/zoom responsiveness in the React Flow canvas by reducing DOM complexity.

This branch focuses on one optimization idea only:
- Flatten the DOM structure as much as possible.

## Scope
In scope:
- Removing unnecessary wrapper elements in the zoom/pan canvas path.
- Collapsing section container wrapper layers where behavior can remain identical.
- Flattening param-heavy section markup (the largest subtree in the Settings project).
- Adding measurement and test guardrails for DOM complexity and pan/zoom behavior.

Out of scope:
- Paint-style tuning (shadows, outlines, gradients).
- Background/grid rendering changes.
- Virtualization/culling.
- Event throttling/debouncing tricks.
- Behavioral UX changes.

## Benchmark Scenario
- Route: `/settings`
- View mode tab: `All Settings`
- App state source: built-in Settings project created on load.
- Heavy-content focus: sections with many params (pinned + unpinned rows).

Deterministic interaction sequence for profiling:
1. Load `/settings`.
2. Click `All Settings`.
3. Wait until `.react-flow__node` count stabilizes.
4. Perform a fixed 10-second interaction script:
   - pan left/right/up/down in the same pattern each run;
   - zoom out/in at fixed points.

## Baseline and Measurement Plan
Before refactor:
- Capture a Chrome DevTools trace with `chrome-devtools-mcp` on the scenario above.
- Record DOM complexity metrics from the live page:
  - total descendants under `.react-flow__viewport`;
  - per-node descendant count for `.react-flow__node`;
  - max descendant depth for a top-level section node;
  - total `[data-param-row="true"]` elements.
- Capture frame metrics from the same interaction trace:
  - FPS trend;
  - dropped/long frames;
  - main-thread time split (scripting/rendering/painting).

After each phase and at completion:
- Re-run the exact same scenario and compare against baseline.
- Append results to a new report in:
  - `perf/reports/frontend/<date>_settings-all-settings-dom-flattening.md`
- Keep report append-only.

## Refactor Plan (DOM Flattening Only)

### Phase 1: Canvas Shell Flattening
Targets:
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`
- `frontend/src/forks/xyflow/core/container/Pane.tsx`
- `frontend/src/forks/xyflow/core/container/Viewport.tsx`
- `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`
- `frontend/src/forks/xyflow/core/components/wrapNode.tsx`

Actions:
- Remove wrapper elements that do not own behavior, refs, or event boundaries.
- Merge adjacent wrapper layers that only exist for styling/layout.
- Keep required event boundaries for selection and pane interactions.

### Phase 2: Section Container Stack Flattening
Targets:
- `frontend/src/components/Section/Container/SectionContainer.tsx`
- `frontend/src/components/Section/Container/ContainerSwitch.tsx`
- `frontend/src/components/Section/Container/TopLevelContainer.tsx`
- `frontend/src/components/Section/Container/ContainerWrappers.tsx`
- `frontend/src/components/Section/Container/ContainerCore.tsx`
- `frontend/src/components/Section/Container/SectionContainerCore.tsx`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
- `frontend/src/components/Utils/Resizable/CustomResizable.tsx`

Actions:
- Collapse wrappers created only for composition convenience.
- Inline wrapper responsibilities into the nearest behavior-owning element.
- Preserve drag/drop, resize, focus, and active-section click behavior.
- Preserve selectors/data attributes relied on by tests and features.

### Phase 3: Param-Heavy Subtree Flattening
Targets:
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/ParamSwitch.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx`

Actions:
- Remove redundant nested wrappers around pinned/unpinned rows.
- Collapse row internals so each param row has fewer structural elements.
- Unify nested/non-nested row shells where possible to avoid duplicate wrapper patterns.
- Keep DnD hooks, resize handles, and measurement hooks (`data-param-row`, `data-params-fixed`) intact.

## Verification Plan
Automated tests to run/update:
- Existing: `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
- Add: a settings pan/zoom perf guardrail spec under `frontend/tests/e2e/settings/` that:
  - runs the All Settings scenario;
  - records DOM metrics via `page.evaluate`;
  - enforces structural budgets (non-timing) that protect flattening gains.
- Add/update Vitest coverage around helper logic introduced for DOM metrics/budgets (if helpers are added).

Manual checks with `chrome-devtools-mcp`:
- Visual correctness during pan/zoom in All Settings.
- No regressions in:
  - section selection rectangle;
  - section drag/resize handles;
  - param selection and DnD interactions.

## Risks and Mitigations
Risk:
- Wrapper removal can break event propagation for DnD/selection.
Mitigation:
- Keep behavior-owned event boundaries; verify with targeted E2E interactions.

Risk:
- CSS selectors may implicitly depend on current nesting.
Mitigation:
- Update selectors intentionally and verify against All Settings plus at least one non-settings project.

Risk:
- Layout/measurement code for param areas may depend on current container structure.
Mitigation:
- Preserve measurement anchors and data attributes; re-run param-area tests and E2E.

## Definition of Done
- DOM flattening changes landed without UX behavior changes.
- All Settings benchmark shows reduced DOM complexity vs baseline.
- Same benchmark shows improved pan/zoom frame behavior in DevTools traces.
- Relevant Playwright and Vitest coverage updated and passing.
- Performance report appended under `perf/reports/frontend/`.
