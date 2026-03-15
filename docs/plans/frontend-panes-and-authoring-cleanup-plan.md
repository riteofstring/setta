# Frontend Panes And Authoring Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).

## Goal

Make overview-pane and UI-authoring code easy to extend by separating pane shells, pane state models, and feature-specific editors.

## Scope

- In scope:
  - `frontend/src/components/Panes/**`
  - `frontend/src/components/Panes/Overview/FileBrowser/**`
  - `frontend/src/components/Git/**`
  - pane layout helpers that directly support pane behavior
  - file-browser helpers that directly support pane behavior
  - `frontend/src/state/hooks/uiTypes.ts`
- Out of scope:
  - chat/project-AI pane internals already covered in [frontend-cleanup-plan.md](./frontend-cleanup-plan.md)

## Status Refresh (2026-03-15)

- `AppConfigPane.tsx` is no longer the original 1700+ line monolith. It already delegates preview/draft shaping work to `frontend/src/components/Panes/Overview/App/appDraftPreview.ts`.
- `GitGraphOverlay.tsx` is still a meaningful pane-domain hotspot, but the
  resize extraction dropped it behind `PluginsPane.tsx` and
  `RunInstructions.tsx` as the default next pane-side entry surface.
- `PluginsPane.tsx` and `RunInstructions.tsx` are still large pane entry
  surfaces that contributors open before most of the deeper overview helpers.
- `RunInstructions.tsx` already has helper seams in `runInstructionsAccordionState.ts`, `runInstructionsRunnableCodeBlocks.ts`, and `runInstructionsStateMachineControls.ts`, but the main surface still carries too much orchestration.
- `FileBrowserPane.tsx` now delegates tree-data transport and tree view-model
  ownership to `useFileBrowserPaneTreeData.ts` and
  `fileBrowserPaneTreeModel.ts`, so future work in this domain should extend
  those seams instead of reintroducing transport logic into the pane shell.
- Future cleanup in this domain should continue the existing seams, but default
  to the largest pane and git entry surfaces contributors still open first:
  `PluginsPane.tsx`, `RunInstructions.tsx`, and the remaining
  `GitGraphOverlay.tsx` follow-through work, then return to
  `FileBrowserPane.tsx`, `AppConfigPane.tsx`, and authoring follow-up work.

## Current State (Observed)

- `frontend/src/components/Panes` totals about 52.8k lines of authored code.
- Large non-chat pane surfaces include:
  - `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx` at 2023 lines
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx` at 1908 lines
  - `frontend/src/components/Git/GitGraphOverlay.tsx` at 1550 lines after the local resize-model and resize-hook extraction
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx` at 1392 lines after the local tree-data extraction
  - `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx` at 816 lines
  - `frontend/src/components/Panes/Overview/ViewingEditingMode.tsx` at 832 lines
  - `frontend/src/components/Panes/Overview/BackendLogEventsArea.tsx` at 793 lines
  - `frontend/src/components/Panes/Overview/ProjectConfigs.tsx` at 656 lines
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx` at 1305 lines
  - `frontend/src/components/Panes/UiEditor/SectionConfig/EdgePortsSettings.tsx` at 605 lines
- `GitGraphOverlay.tsx` mixes:
  - search/indexing helpers and decoration formatting
  - virtualization and row-height caching
  - row/detail render branches
  - header/sidebar/empty-state shell composition over the new resize owners
- `PluginsPane.tsx` mixes:
  - plugin catalog and status orchestration
  - enable/disable and reload controls
  - install/update affordances
  - large render branches for different plugin states
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
- `FileBrowserPane.tsx` now focuses on:
  - selection, clipboard, and DnD behavior
  - row/header/virtualized list shells
  - file-open and workspace-action commands
  - keyboard interaction wiring
- `FileBrowserPane.tsx` is still a real hotspot, but it is now a follow-through
  coordinator in this domain rather than the default first target.
- `useFileBrowserPaneTreeData.ts` now owns:
  - root/folder transport and request ownership
  - recursive search crawling and derived tree view state
  - preview/download URL lifecycle
  - path navigation state and completion sources
- `fileBrowserPaneTreeModel.ts` now owns:
  - tree flatten/filter/sort helpers
  - request-owner tokens and Setta-badge metadata helpers
  - file/path/date formatting helpers used by the pane rows
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
5. Start with pane front doors and 2000+ entry surfaces before medium-sized authoring cleanup in the same domain.
6. Do not move a pane monolith into one new 1000+ helper file. Prefer a small pane shell plus a few clear local owners.

## Plan

1. Split `GitGraphOverlay.tsx` and the remaining giant pane roots first

- Keep `GitGraphOverlay.tsx` as the obvious git overlay entry surface.
- `gitGraphOverlayResizeModel.ts` and `useGitGraphOverlayResize.ts` now own:
  - pane split and column-resize persistence
  - resize clamp math and double-click resets
  - drag cleanup and request-animation-frame resize application
- Continue extracting clearly named owners for:
  - search/indexing and decoration view models
  - virtualized row shells and detail panes
- In the same phase, keep `PluginsPane.tsx` and `RunInstructions.tsx` ahead of
  smaller authoring surfaces when choosing the next pane-side slice.

2. Continue `FileBrowserPane.tsx` only when it shortens the main path

- Keep `FileBrowserPane.tsx` as the obvious pane entry surface.
- `useFileBrowserPaneTreeData.ts` and `fileBrowserPaneTreeModel.ts` now cover:
  - folder/root transport and stale-request handling
  - tree flattening/filter/sort view models
  - preview/download URL refresh policy
- Remaining file-browser work should extract:
  - DnD, clipboard, and open/rename command adapters
  - row/header shells and virtualization-specific render helpers
- If the slice crosses into `BrowserArea.tsx`, use the sections companion plan as
  a second plan only after the file-browser pane boundary is clear.

3. Separate pane chrome from pane content

- Split overview and UI-editor rail code from content resolution.
- Keep pane rail buttons declarative and move gating/fallback rules into dedicated selectors.
- Isolate pane-layout concerns from feature-specific content.

4. Refactor `AppConfigPane.tsx` and the remaining authoring entry surfaces

- Continue splitting into:
  - app-definition API transport
  - prompt/spec builder utilities
  - spec editing state
  - preview/validation state
  - presentational editor panels
- Keep app generation behavior explicit without hiding it inside one large component.

5. Continue splitting `RunInstructions.tsx`

- Keep `runInstructionsAccordionState.ts`,
  `runInstructionsRunnableCodeBlocks.ts`, and
  `runInstructionsStateMachineControls.ts` as the first stable seams.
- Move remaining parsing, derived state, and large render branches out of the main surface.

6. Clean up view-mode and project-config authoring

- Split `ViewingEditingMode.tsx` into:
  - view-mode list model and commands
  - project-config list model and commands
  - resizable stacked-pane shell
- Keep `WindowSpacesPane` and `ProjectConfigs` readable by moving reorder/edit rules into pure helpers.

7. Introduce explicit section-settings registries

- Replace broad section-type switches with well-named section-settings registries where it improves clarity.
- Keep `SectionConfig.tsx` as a small coordinator that asks, “which settings groups apply here?”
- Co-locate section-specific settings APIs with their pane components.

8. Make UI-editor tab rules easier to locate

- Move UI-editor tab compatibility and stored-tab selection logic into a clearly named authoring state module.
- Reduce the mental jump between `constants.ts`, `uiTypes.ts`, and `UiEditor.tsx`.

9. Document pane ownership once a root surface stabilizes

- Add short feature READMEs for:
  - git overlay
  - file browser pane
  - overview pane
  - app config pane
  - UI editor
- Include “where to add a new pane/tab/settings group” guidance.
- Do not spend a cleanup slice on README-only work while the larger pane roots
  above remain unresolved.

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
