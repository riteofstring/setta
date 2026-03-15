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
- `PluginsPane.tsx` is no longer a 2000-line first-hop pane surface. It now
  delegates per-plugin card rendering to
  `frontend/src/components/Panes/Overview/Plugins/pluginsPanePluginCard.tsx`,
  config/settings editors to
  `frontend/src/components/Panes/Overview/Plugins/pluginsPaneConfigEditors.tsx`,
  config-schema helpers to
  `frontend/src/components/Panes/Overview/Plugins/pluginsPaneConfigSchema.ts`,
  and shared shells to
  `frontend/src/components/Panes/Overview/Plugins/pluginsPaneShared.tsx`.
- `RunInstructions.tsx` is no longer a 1900-line pane-side front door. It now
  delegates run snapshot/codegen target composition to
  `frontend/src/components/Panes/Overview/runInstructionsCodegenSections.tsx`,
  detailed python codegen policy UI to
  `frontend/src/components/Panes/Overview/runInstructionsCodegenPolicyContent.tsx`,
  and codegen registration/representation rules to
  `frontend/src/components/Panes/Overview/runInstructionsCodegenModel.ts`.
- `GitGraphOverlay.tsx` is now the default pane-side entry surface in this
  companion plan.
- `FileBrowserPane.tsx` now delegates tree-data transport and tree view-model
  ownership to `useFileBrowserPaneTreeData.ts` and
  `fileBrowserPaneTreeModel.ts`, so future work in this domain should extend
  those seams instead of reintroducing transport logic into the pane shell.
- Future cleanup in this domain should continue the existing seams, but default
  to the largest pane and git entry surfaces contributors still open first:
  `GitGraphOverlay.tsx`, then return to `FileBrowserPane.tsx`,
  `AppConfigPane.tsx`, and authoring follow-up work.

## Current State (Observed)

- `frontend/src/components/Panes` totals about 52.8k lines of authored code.
- Large non-chat pane surfaces include:
  - `frontend/src/components/Git/GitGraphOverlay.tsx` at 1550 lines after the local resize-model and resize-hook extraction
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx` at 1399 lines after the local tree-data extraction
  - `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx` at 816 lines
  - `frontend/src/components/Panes/Overview/ViewingEditingMode.tsx` at 832 lines
  - `frontend/src/components/Panes/Overview/BackendLogEventsArea.tsx` at 793 lines
  - `frontend/src/components/Panes/Overview/ProjectConfigs.tsx` at 656 lines
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx` at 1305 lines
  - `frontend/src/components/Panes/UiEditor/SectionConfig/EdgePortsSettings.tsx` at 605 lines
- `frontend/src/components/Panes/Overview/RunInstructions.tsx` is now 555
  lines after the local codegen sections, codegen policy content, and codegen
  model extraction and is no longer the default pane-side hotspot.
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx` is now 607
  lines after the local plugin-card, config-editor, config-schema, and
  shared-shell extraction and is no longer the default pane-side hotspot.
- `GitGraphOverlay.tsx` mixes:
  - search/indexing helpers and decoration formatting
  - virtualization and row-height caching
  - row/detail render branches
  - header/sidebar/empty-state shell composition over the new resize owners
- `PluginsPane.tsx` local owners now divide responsibilities as follows:
  - `pluginsPanePluginCard.tsx` owns per-plugin action/render branches,
    capability sections, pane/command launch shells, and config/settings
    composition.
  - `pluginsPaneConfigEditors.tsx` owns schema-backed plugin config editing
    and language-server settings editors.
  - `pluginsPaneConfigSchema.ts` owns top-level config-schema field derivation,
    supported primitive detection, enum/UI-hint helpers, and immutable config
    updates.
  - `pluginsPaneShared.tsx` owns shared action-button, capability-row, and
    install-summary shells.
  - `PluginsPane.tsx` now focuses on runtime/install/rescan/restart
    orchestration, busy-state tracking, active-plugin list mapping, and
    discovery-table composition.
- `RunInstructions.tsx` local owners now divide responsibilities as follows:
  - `runInstructionsCodegenSections.tsx` owns run snapshot-mode persistence,
    codegen-target enablement, orphaned-target cleanup, and accordion item
    composition.
  - `runInstructionsCodegenPolicyContent.tsx` owns generated-metadata toggles,
    section allowlist/default/override controls, code-obj default/override
    controls, and option-list state.
  - `runInstructionsCodegenModel.ts` owns plugin target dedupe/sort rules and
    section/code-obj representation option mapping.
  - `RunInstructions.tsx` now focuses on share/deployment gating, accordion
    persistence, workflow/custom-run/add-from-code-block composition, and the
    overview-pane scroll shell.
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
7. Prefer pane-domain names over generic buckets like `helpers`, `shared`, or `viewModel`. More files is fine if the owning pane and neighboring modules stay obvious.
8. When pane directories become too flat to scan, prefer stable pane-domain subfolders over directory `README.md` files.

## Plan

1. Split the remaining giant pane roots first

- Keep `GitGraphOverlay.tsx` as the obvious git overlay entry surface.
- `gitGraphOverlayResizeModel.ts` and `useGitGraphOverlayResize.ts` now own:
  - pane split and column-resize persistence
  - resize clamp math and double-click resets
  - drag cleanup and request-animation-frame resize application
- Continue extracting clearly named owners for:
  - search/indexing and decoration view models
  - virtualized row shells and detail panes
- `PluginsPane.tsx` now delegates:
  - per-plugin card/action rendering to `pluginsPanePluginCard.tsx`
  - schema-backed config and language-server settings editors to `pluginsPaneConfigEditors.tsx`
  - top-level config-schema field helpers to `pluginsPaneConfigSchema.ts`
  - shared action/capability/install-summary shells to `pluginsPaneShared.tsx`
- In the same phase, keep the remaining `GitGraphOverlay.tsx` follow-through
  work ahead of smaller authoring surfaces when choosing the next pane-side
  slice.

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

5. Only continue `RunInstructions.tsx` when a slice shortens the root again

- Keep `runInstructionsAccordionState.ts`,
  `runInstructionsRunnableCodeBlocks.ts`,
  `runInstructionsStateMachineControls.ts`,
  `runInstructionsCodegenSections.tsx`,
  `runInstructionsCodegenPolicyContent.tsx`, and
  `runInstructionsCodegenModel.ts` as the current stable seams.
- If follow-through work is still needed, keep it focused on the remaining
  workflow/custom-run/add-from-code-block ownership rather than rebuilding a
  large codegen helper.

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

9. Add pane-domain subfolders only when a stabilized dense area still needs them

- Add pane-domain subfolders only when grep plus naming still leaves multiple
  plausible entry points for:
  - git overlay
  - file browser pane
  - overview pane
  - app config pane
  - UI editor
- Do not spend a cleanup slice on docs-only work while the larger pane roots
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
