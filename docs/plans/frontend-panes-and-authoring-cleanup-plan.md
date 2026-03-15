# Frontend Panes And Authoring Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).

## Goal

Make overview-pane and UI-authoring code easy to extend by separating pane shells, pane state models, and feature-specific editors.

## Scope

- In scope:
  - `frontend/src/components/Panes/**`
  - pane layout helpers that directly support pane behavior
  - `frontend/src/state/hooks/uiTypes.ts`
- Out of scope:
  - chat/project-AI pane internals already covered in [frontend-cleanup-plan.md](./frontend-cleanup-plan.md)
  - file-browser pane internals already covered in [frontend-cleanup-plan.md](./frontend-cleanup-plan.md)

## Status Refresh (2026-03-14)

- `AppConfigPane.tsx` is no longer the original 1700+ line monolith. It already delegates preview/draft shaping work to `frontend/src/components/Panes/Overview/App/appDraftPreview.ts`.
- `RunInstructions.tsx` already has helper seams in `runInstructionsAccordionState.ts`, `runInstructionsRunnableCodeBlocks.ts`, and `runInstructionsStateMachineControls.ts`, but the main surface still carries too much orchestration.
- Future cleanup in this domain should continue those seams instead of starting over from the original snapshot.

## Current State (Observed)

- `frontend/src/components/Panes` totals about 52.8k lines of authored code.
- Large non-chat pane surfaces include:
  - `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx` at 816 lines
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx` at 1903 lines
  - `frontend/src/components/Panes/Overview/ViewingEditingMode.tsx` at 832 lines
  - `frontend/src/components/Panes/Overview/BackendLogEventsArea.tsx` at 793 lines
  - `frontend/src/components/Panes/Overview/ProjectConfigs.tsx` at 656 lines
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx` at 1305 lines
  - `frontend/src/components/Panes/UiEditor/SectionConfig/EdgePortsSettings.tsx` at 605 lines
- `Overview.tsx` owns:
  - icon rail rendering
  - plugin tab resolution
  - deployment/share gating
  - tab fallback rules
  - content switching
- `AppConfigPane.tsx` mixes:
  - backend transport
  - app catalog/definition fetch and save
  - prompt generation
  - app-spec parsing and patch application
  - validation and preview behavior
  - generation-mode UI state
- The existing `appDraftPreview.ts` split is a good start, but transport, generation, persistence, and validation are still coupled in the main surface.
- `RunInstructions.tsx` still mixes parsed-content rendering, accordion state, runnable controls, and higher-level overview-pane orchestration even after the first helper extractions.
- `ViewingEditingMode.tsx` mixes:
  - view-mode mutation commands
  - resize behavior
  - window-space composition
  - project-config composition
  - editing/reorder UI
- `UiEditor.tsx` is not large on its own, but its real complexity is spread across:
  - `state/hooks/uiTypes.ts`
  - `SectionConfig.tsx`
  - many section-specific settings panes
- The authoring path is readable only after mentally joining pane rail code, local-storage tab state, section-type compatibility constants, and many per-section settings files.

## Cleanup Principles

1. Pane shells should coordinate layout and tab selection, not own feature logic.
2. Each authoring surface should expose a small domain API:
   - selectors/read model
   - commands/mutations
   - presentational components
3. “Registry” style code is acceptable when it reduces giant switches and makes ownership explicit.
4. Generated route/type usage should be wrapped by pane-local APIs before it reaches leaf UI.

## Plan

1. Separate pane chrome from pane content

- Split overview and UI-editor rail code from content resolution.
- Keep pane rail buttons declarative and move gating/fallback rules into dedicated selectors.
- Isolate pane-layout concerns from feature-specific content.

2. Refactor `AppConfigPane.tsx` into feature modules

- Continue splitting into:
  - app-definition API transport
  - prompt/spec builder utilities
  - spec editing state
  - preview/validation state
  - presentational editor panels
- Keep app generation behavior explicit without hiding it inside one large component.

3. Continue splitting `RunInstructions.tsx`

- Keep `runInstructionsAccordionState.ts`, `runInstructionsRunnableCodeBlocks.ts`, and `runInstructionsStateMachineControls.ts` as the first stable seams.
- Move remaining parsing, derived state, and large render branches out of the main surface.

4. Clean up view-mode and project-config authoring

- Split `ViewingEditingMode.tsx` into:
  - view-mode list model and commands
  - project-config list model and commands
  - resizable stacked-pane shell
- Keep `WindowSpacesPane` and `ProjectConfigs` readable by moving reorder/edit rules into pure helpers.

5. Introduce explicit section-settings registries

- Replace broad section-type switches with well-named section-settings registries where it improves clarity.
- Keep `SectionConfig.tsx` as a small coordinator that asks, “which settings groups apply here?”
- Co-locate section-specific settings APIs with their pane components.

6. Make UI-editor tab rules easier to locate

- Move UI-editor tab compatibility and stored-tab selection logic into a clearly named authoring state module.
- Reduce the mental jump between `constants.ts`, `uiTypes.ts`, and `UiEditor.tsx`.

7. Document pane ownership

- Add short feature READMEs for:
  - overview pane
  - app config pane
  - UI editor
- Include “where to add a new pane/tab/settings group” guidance.

## Risks And Mitigations

- Risk: tab fallback behavior changes subtly in deployment/share mode.
  - Mitigation: add selector tests around tab availability and fallback selection.
- Risk: registry indirection makes simple cases harder to trace.
  - Mitigation: keep registries explicit and local to the owning feature.
- Risk: App generation cleanup accidentally changes prompt/spec behavior.
  - Mitigation: extract pure builder/validation helpers first and lock behavior with tests.

## Verification

- Add or update Vitest coverage for:
  - pane tab availability/fallback
  - view-mode/project-config reorder helpers
  - app-spec and prompt builder utilities
  - UI-editor tab resolution
- Run CDP visual checks for any pane-shell or authoring-layout changes.
- Add Playwright coverage when editor workflows change materially.

## Acceptance Criteria

- Pane shells are small enough to read without opening multiple unrelated feature files.
- App generation, run instructions, and section authoring behavior are split into obvious domain modules.
- Adding a pane tab or a section-settings group has one clear entry point.
- Tab gating and fallback rules are testable without rendering the entire pane tree.
