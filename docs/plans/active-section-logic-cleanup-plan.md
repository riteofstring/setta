# Active Section Logic Cleanup Plan

## Goals
- Make active section behavior predictable and easy to reason about.
- Centralize rules for activating, deactivating, and multi-selecting sections.
- Reduce duplicated logic across click, focus, selection-rectangle, and navigation paths.
- Preserve existing UX unless explicitly changed (no silent behavior shifts).

## Non-goals
- Redesigning backend semantics of active IDs.
- Changing selection visuals or keyboard shortcuts beyond scope.
- Introducing new persistence formats.

## Current State Summary
Active section decisions are spread across multiple call sites:
- Section click logic: `frontend/src/components/Section/Container/utils.tsx`
- Pane click and selection rectangle: `frontend/src/forks/xyflow/core/container/Pane.tsx`
- Text input focus: `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
- Go-to section navigation: `frontend/src/state/actions/sections/sectionPositions.ts`
- Various call sites directly update active IDs via `setActiveSectionIds` or `setActiveSectionIdAndUpdateZIndex`.

Side-effects are inconsistent:
- Some paths update z-index, some do not.
- Param selection does not consistently activate the owning section.
- Multi-selection and param-selection logic are intertwined and implemented ad-hoc.

## Current Behavior Notes (pre-refactor)
- Section click:
  - Normal click sets active to `[sectionId]` and updates z-index to the highest ancestor.
  - Multi-selection toggles the section in `activeIds`, then updates z-index to the highest ancestor.
  - Param-select mode adds the section only when it already has selected params; removes it when active with no selected params; still updates z-index.
- Pane click clears active IDs; no z-index updates.
- Selection rectangle clears active IDs on mouse down, then sets active IDs to the current selection while dragging; no z-index updates.
- Text input mouse-down (CodeMirror) sets active to `[sectionId]` and updates z-index to the highest ancestor.
- `goToSection` sets active to `[sectionId]` and updates z-index for the section itself.
- Param selection toggles do not directly update active sections.

### Interaction Matrix (current)
| Interaction | Active IDs result | Z-index update |
| --- | --- | --- |
| Section click (normal) | `[sectionId]` | Highest ancestor |
| Section click (multi-select) | Toggle `sectionId` in `activeIds` | Highest ancestor |
| Section click (param-select mode) | Add if section has selected params; remove if active with none | Highest ancestor |
| Pane click | `[]` | No |
| Selection rectangle drag | `selectedNodeIds` | No |
| Text input mouse-down | `[sectionId]` | Highest ancestor |
| `goToSection` | `[sectionId]` | Section id |
| Param select/unselect | No direct change | No |

## Guiding Principles
- One place should decide the next active IDs and whether z-index changes.
- Call sites should pass only the user intent and current mode.
- Active section selection should be conservative: do not change unless intent is clear.

## Proposed Architecture
### 1) Add a centralized policy module
Create a pure, centralized policy module (no side-effects) in:
- `frontend/src/state/actions/activeSectionPolicy.ts`

Responsibilities:
- Given an interaction context, decide the next active IDs.
- Decide whether z-index should update.
- Provide a reason tag for telemetry/debugging.

Example API:
- `resolveActiveSectionChange(context): { nextActiveIds: string[]; updateZIndex: boolean }`

Context should include:
- `interaction`: "section-click" | "pane-click" | "selection-rect" | "input-focus" | "go-to" | "param-select" | "param-unselect"
- `sectionId` (if applicable)
- `isSelectingParams` and `hasSelectedParams`
- `multiSelectionActive`
- `isActiveSection`
- `activeIds` (current)

### 2) Add an effectful controller
Create `frontend/src/state/actions/activeSectionController.ts` to apply policy outcomes:
- Applies `setActiveSectionIds`
- Applies `setZIndices` when requested
- Wraps the existing optimistic update + route call logic

### 3) Migrate call sites to policy
Refactor the following to call the controller with context:
- `getOnSectionClick` (section click)
- `Pane` click and selection-rectangle updates
- `TextInputCodeMirror` focus activation
- `goToSection` navigation

### 4) Clarify param-selection behavior
Make param selection consistent with active section:
- When param selection is toggled and `isSelectingParams` is true, the owning section should become active.
- When the last selected param in a section is unselected, active state should remain unless explicitly cleared (avoid surprise deactivation).

### 5) Unify z-index updates
Define a single rule:
- Z-index updates when the active section set is changed due to a direct section interaction (click, go-to, input focus), not when active IDs are changed by selection rectangle updates.
- This avoids unnecessary `setZIndices` churn.

## Step-by-Step Plan
### Phase 1: Document current behavior
- Add a short doc section in `docs/plans/active-section-logic-cleanup-plan.md` describing current rules.
- Create a small matrix of interactions and expected results.

### Phase 2: Introduce policy + controller
- Add `activeSectionPolicy.ts` with pure functions.
- Add `activeSectionController.ts` to apply changes.
- Keep existing functions for now, but route them through the controller.

### Phase 3: Refactor call sites
- Update section click, pane click, input focus, go-to section to use the controller.
- Remove duplicated logic for toggling active IDs in those call sites.

### Phase 4: Param selection alignment
- When params are toggled, ensure owning section is active if `isSelectingParams` is true.
- Update `toggleParamSelected` or relevant call site to invoke controller.

### Phase 5: Cleanup and hardening
- Remove legacy branches that are now redundant.
- Ensure `setActiveSectionIdAndUpdateZIndex` is only used via controller.

## Risks
- Behavior drift across multiple interaction paths.
- Hidden dependencies on the exact ordering of active IDs.

Mitigation:
- Add a small manual regression checklist (see below).
- Keep changes staged by phase.

## Manual Regression Checklist
- Clicking a section selects it and updates outline + z-index.
- Clicking empty pane clears selection.
- Dragging a selection rectangle selects multiple sections.
- Param selection highlights the section and does not clear on unintended clicks.
- `goToSection` selects and focuses the section.
- Switching tabs or focusing inputs does not change active selection unexpectedly.

## Success Criteria
- Active section rules are centralized in one policy module.
- All call sites use the controller.
- No UX regressions in the manual checklist.
- Reduced duplication and fewer ad-hoc conditional branches.
