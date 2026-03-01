# All Settings DOM Simplification Plan (UX-Preserving)

## Goal
Reduce DOM size and frontend render/style/layout cost in `Settings -> All Settings` by simplifying param-row markup while preserving existing UX and behavior.

## Progress
- Completed:
  - Step 1 (`Add UX-preservation tests first`)
  - Step 2 (`Flatten non-kwarg key wrappers`)
  - Step 3 (`Collapse resize-handle markup to one interactive element`)
- Current measured impact for Step 2:
  - Total DOM elements: `9715` -> `9088` (`-6.5%`)
  - `.section-key` wrappers in non-nested rows: `627` -> `0`
  - Avg param-row subtree size: `15.35` -> `13.93` (`-9.3%`)
  - Tab switch medians (9-run harness, warmup 2):
    - `All -> Core`: elapsed `446.4 ms` -> `421.6 ms` (`-5.6%`)
    - `Core -> All`: elapsed `1044.1 ms` -> `1039.4 ms` (`-0.5%`)
- Current measured impact for Step 3 (timestamp-window harness, 9 runs, warmup 2, vs post-Step-2 baseline):
  - Total DOM elements: `9088` -> `7666` (`-15.6%`)
  - Avg param-row subtree size: `13.93` -> `11.09` (`-20.4%`)
  - Interactive resize handles: `627` (unchanged behavior count), nested handle child nodes: `0`
  - Tab switch medians:
    - `All -> Core`: elapsed `509.2 ms` -> `411.2 ms` (`-19.2%`), longtask total `202 ms` -> `124 ms` (`-38.6%`)
    - `Core -> All`: elapsed `986.7 ms` -> `944.5 ms` (`-4.3%`), longtask total `768 ms` -> `725 ms` (`-5.6%`)

## Guardrails
- No intentional UX changes.
- No loss of visible information in any section.
- No behavior changes for:
  - param editing
  - param rename
  - param selection mode
  - drag/reorder flows
  - resize-handle interaction
  - search highlighting and type-error affordances

## Baseline Snapshot (2026-03-02, All Settings)
- Total DOM elements: `9715`
- Param rows (`[data-param-row="true"]`): `697`
- Average param-row subtree size: `15.35` nodes
- Repeated row chrome:
  - `.section-key` wrappers: `627`
  - resize-handle structures: `627`
  - nested child wrappers: `70`
  - nested connector helper divs: `70`

## Scope
- In scope:
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx`
  - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - `frontend/src/components/Params/ResizeHandle.tsx`
  - targeted CSS updates for row layout/connector visuals
  - Playwright + Vitest coverage for preserved behavior
- Out of scope:
  - virtualization (`Big-Swing B`)
  - inactive read-only rendering (`Big-Swing C`)
  - section body mount deferral (`Big-Swing A`, Not Planned)

## Implementation Plan

### 1) Add UX-preservation tests first
Impact: High  
Complexity: Medium  
Confidence: High

Changes:
- Add/extend Playwright tests for:
  - click param label focuses the correct editor/input
  - editing text/code/date/time/dropdown/switch params still works
  - resize-handle drag still changes param column width
  - nested params still render correctly and remain interactive
  - type-error marker + context-menu behavior remains unchanged
- Add/extend Vitest coverage for row component structure contracts that should remain stable.

Why first:
- DOM flattening can silently break interaction hitboxes and focus routing; tests must lock behavior before markup changes.

### 2) Flatten non-kwarg key wrappers
Impact: Medium  
Complexity: Low-Medium  
Confidence: High

Changes:
- In `ParamContainer`, remove the extra `.section-key` wrapper for non-kwarg rows.
- Move required width/overflow/truncation classes directly to label components (`ParamTextLabel` / kwarg equivalent as needed).
- Keep the same visual alignment and keyboard/mouse behavior.

Why second:
- `627` repeated wrappers are low-risk DOM overhead and straightforward to remove.

### 3) Collapse resize-handle markup to one interactive element
Impact: Medium-High  
Complexity: Medium  
Confidence: Medium-High

Changes:
- Refactor `ResizeHandle` from nested shell/overlay/bar structure to one interactive element and CSS pseudo-element visuals.
- Preserve:
  - same drag affordance area
  - same hover and active visuals
  - same classes that suppress unintended section activation

Why third:
- Current handle structure repeats in hundreds of rows and is pure chrome.

### 4) Remove explicit nested connector helper nodes
Impact: Medium  
Complexity: Medium  
Confidence: Medium

Changes:
- Replace nested connector helper `<div class="absolute ...">` nodes with CSS pseudo-elements on existing containers.
- Keep nested tree readability and spacing unchanged.
- Evaluate whether one nested wrapper layer can be flattened without affecting recursive layout; only do this if tests remain green and visuals match.

Why fourth:
- Connector visuals do not require dedicated DOM nodes.

### 5) Cleanup pass and measurement
Impact: Medium  
Complexity: Low  
Confidence: High

Changes:
- Remove now-unused classes/helpers.
- Re-run All Settings profile loop and append results under `perf/reports/frontend/`.
- Compare before/after DOM node counts and trace insights.

Why fifth:
- Ensures measurable gains are captured and dead code does not remain.

## Acceptance Criteria
- `All Settings` total DOM reduced by at least `15%` from `9715` (`<= 8258`).
- Average param-row subtree size reduced from `15.35` to `<= 12.5`.
- No regression in UX-preservation Playwright tests.
- No visual regression in row alignment, nested connectors, and resize handle interaction (verified via CDP).
- No regressions in existing relevant Vitest suites for params/section rendering.

## Verification Plan
1. Baseline (before implementation):
- Capture DOM counts and param-row subtree stats in `All Settings`.
- Capture `Core -> All Settings` transition timing and long-task totals.

2. During implementation:
- Run targeted Vitest after each plan item.
- Run focused Playwright UX-preservation scenarios after each plan item.

3. Final:
- Re-run CDP measurement and compare against baseline.
- Append an after-results report under `perf/reports/frontend/` with:
  - before/after DOM counts
  - before/after timing and long-task totals
  - notes on any observed tradeoffs

## Execution Order
1. Tests first (Playwright + Vitest guardrails)
2. Flatten key wrappers
3. Collapse resize-handle markup
4. Remove connector helper nodes
5. Measure and document results
