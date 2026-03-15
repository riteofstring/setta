# Frontend Sections And Params Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).

## Goal

Make section chrome and param rendering easy to change without touching measurement code, DnD internals, or unrelated section behaviors.

## Scope

- In scope:
  - `frontend/src/components/Params/**`
  - `frontend/src/components/Section/**`
  - `frontend/src/components/Section/Layouts/**`
  - shared section/param measurement and layout helpers
- Out of scope:
  - project-level chat/project-AI surfaces already covered in [frontend-chat-project-ai-windowing-cleanup-plan.md](./frontend-chat-project-ai-windowing-cleanup-plan.md)
  - project-level page routing and pane shells

## Status Refresh (2026-03-15)

- This domain is still relatively close to the original planning snapshot for
  JSX-heavy section chrome, but section-creation state is no longer a single
  mixed file on this branch.
- `frontend/src/state/actions/sections/createSections.ts` now owns top-level
  section creation commands and empty-space add actions,
  `frontend/src/state/actions/sections/createSectionPlacement.ts` owns smart
  placement/empty-space helpers,
  `frontend/src/state/actions/sections/createSectionCatalogSectionGroups.ts`
  now owns static section/code/artifact/workflow/other presets,
  `frontend/src/state/actions/sections/createSectionCatalogControlGroups.ts`
  now owns metacontrol/embed presets,
  `frontend/src/state/actions/sections/createSectionCatalogGroupAssembly.ts`
  now owns ordered base group assembly,
  `frontend/src/state/actions/sections/createSectionCatalogStatic.ts` is now a
  thin compatibility facade,
  `frontend/src/state/actions/sections/createSectionFileOpenShared.ts` owns
  shared opened-file naming/reuse helpers,
  `frontend/src/state/actions/sections/createSectionFileOpenCommands.ts` owns
  per-impl file-open commands,
  `frontend/src/state/actions/sections/createSectionFileDropRouting.ts` owns
  drop-to-section routing, and
  `frontend/src/state/actions/sections/createSectionFileOpeners.ts` is now a
  thin compatibility facade,
  `frontend/src/state/actions/sections/createSectionImplDefaults.ts` owns
  per-impl create defaults.
- `frontend/src/state/actions/sections/moveSectionQueries.ts` now owns
  attached-terminal route selection, section-type move checks, and
  parent-resolution reads, `frontend/src/state/actions/sections/moveSectionParentState.ts`
  now owns in-state parent cleanup plus move-into-parent reducers,
  `frontend/src/state/actions/sections/moveSectionPaneState.ts` now owns pane
  node and top-level layout updates, `frontend/src/state/actions/sections/moveSectionState.ts`
  is now the thin in-state composition facade, and
  `frontend/src/state/actions/sections/moveSections.ts` remains the thin
  optimistic backend command facade.
- `frontend/src/state/actions/sectionDisplayStructure.ts` now owns top-level
  display selection, displayed-child tree derivation, node-map creation, and
  DnD child reset, `frontend/src/state/actions/sectionViewModeVisibility.ts`
  now owns active-view lookup plus visibility/render and ancestor-visibility
  queries, and `frontend/src/state/actions/sectionDisplayQueries.ts` is now
  the thin compatibility facade.
- `frontend/src/state/actions/sections/sectionSizeGeometry.ts` now owns pure
  section sizing math, resize-direction helpers, and auto-size promotion
  helpers, `frontend/src/state/actions/sections/sectionSizeState.ts` now owns
  local section-size writes plus parent or sibling width propagation,
  `frontend/src/state/actions/sections/sectionSizePersistence.ts` now owns
  optimistic section-size persistence plus raw `setSectionSizes` transport, and
  `frontend/src/state/actions/sections/sectionSizes.ts` is now the thin
  compatibility facade. `frontend/src/components/Utils/Resizable/useCustomResizableBehavior.ts`
  now focuses on resize lifecycle, double-click tracking, auto-size promotion,
  and resize-event emission, while
  `frontend/src/components/Utils/Resizable/customResizableSizing.ts` owns pure
  clamp and auto-clamp plus auto-only size-mode update helpers.
- `frontend/src/state/actions/params/paramSelectionCommands.ts` now owns
  single-param drag/drop selection normalization,
  `frontend/src/state/actions/params/paramMoveCommands.ts` now owns optimistic
  backend dispatch for direct moves plus indent or unindent commands,
  `frontend/src/state/actions/params/paramMoveSelectionContext.ts` now owns
  selected-section resolution, visible-param gating, and movement or unindent
  context reads,
  `frontend/src/state/actions/params/paramMoveOrdering.ts` now owns parent-child
  ordering plus contiguous visible-sibling grouping,
  `frontend/src/state/actions/params/paramTreeStructure.ts` now owns param
  root lookup, ancestry maps, and visible tree derivation,
  `frontend/src/state/actions/params/paramTreeSelection.ts` now owns
  root-selection filtering, shared-parent lookup, descendant checks, and
  visible-to-full insertion index mapping,
  `frontend/src/state/actions/params/paramMoveQueries.ts` is now the thin
  compatibility facade,
  `frontend/src/state/actions/params/paramTree.ts` is now the thin
  compatibility facade,
  `frontend/src/state/actions/params/paramMoveKeyboardCommands.ts` now owns
  visible-sibling keyboard move planning and grouped move dispatch, and
  `frontend/src/state/actions/params/moveParams.ts` is now the thin
  compatibility facade.
- `frontend/src/components/Section/Layouts/BrowserArea.tsx` is no longer a
  single preview-heavy front door on this branch: it now delegates the
  list/icon/carousel render surface to
  `frontend/src/components/Section/Layouts/BrowserAreaContentView.tsx`,
  preview URL/text-preview cache plus carousel selection to
  `frontend/src/components/Section/Layouts/useBrowserAreaPreviewState.ts`,
  browser root bootstrap, folder/history navigation, recursive filter
  crawling, and saved-search persistence to
  `frontend/src/components/Section/Layouts/useBrowserAreaFolderSession.ts`, and
  preview-kind plus extension/staleness helpers to
  `frontend/src/components/Section/Layouts/browserAreaPreviewModel.ts`.
- `frontend/src/components/Section/Layouts/TaskBoardArea.tsx` is no longer the
  sole owner of task scheduling, board rendering, or task/column move math on
  this branch: it now delegates due or recurrence summary formatting,
  recurrence ordering, and schedule value helpers to
  `frontend/src/components/Section/Layouts/taskBoardTaskScheduleModel.ts`,
  the schedule dropdown shell plus local recurrence editor state to
  `frontend/src/components/Section/Layouts/taskBoardTaskSchedule.tsx`,
  task/column mutations plus DnD/drop-target math to
  `frontend/src/components/Section/Layouts/taskBoardAreaModel.ts`,
  the toolbar shell to
  `frontend/src/components/Section/Layouts/taskBoardAreaToolbar.tsx`,
  task-list rendering to
  `frontend/src/components/Section/Layouts/taskBoardAreaTaskListView.tsx`, and
  kanban lane/resize/task-card rendering to
  `frontend/src/components/Section/Layouts/taskBoardAreaKanbanView.tsx`.
- `frontend/src/components/Section/Layouts/ChatArea.tsx` is no longer the
  section-chat front door on this branch: it now routes between
  `frontend/src/components/Section/Layouts/chatAreaScriptableSurface.tsx` for
  scriptable section-chat state, branch, and composer ownership,
  `frontend/src/components/Section/Layouts/chatAreaManagedSurface.tsx` plus
  `frontend/src/components/Section/Layouts/chatAreaManagedHistory.tsx` for
  managed section-chat, history, and config-gating ownership, and
  `frontend/src/components/Section/Layouts/chatAreaRealtimeEvents.ts` for
  shared send/stop realtime dependency telemetry.
- There is no longer a 1000+ line section-layout entry surface in this domain.
  If follow-through work returns here, it should shorten
  `frontend/src/components/Section/Layouts/BrowserArea.tsx` together with one
  of its sharp local owners instead of reopening the shared section or param
  infrastructure first.
- Shared section/param infrastructure such as `GroupContainer.tsx`,
  `ParamUI.tsx`, and `SectionHeader.tsx` still matters, but it is now support
  work unless it directly shortens one of those layout roots.

## Current State (Observed)

- `frontend/src/components/Params` plus `frontend/src/components/Section` totals about 35.9k lines of authored code.
- Shared section-action ownership no longer defaults into one create surface:
  - `frontend/src/state/actions/sections/createSections.ts` is down to 140
    lines for top-level create orchestration
  - `frontend/src/state/actions/sections/createSectionFileOpenCommands.ts` is
    195 lines for per-impl file-open commands
  - `frontend/src/state/actions/sections/createSectionFileDropRouting.ts` is
    93 lines for dropped-file routing
  - `frontend/src/state/actions/sections/createSectionFileOpenShared.ts` is 82
    lines for naming/reuse helpers
  - `frontend/src/state/actions/sections/createSectionPlacement.ts` is 72
    lines for smart placement helpers
- Main shared hotspots include:
  - `frontend/src/components/Section/Layouts/DrawArea/useDrawModeMouseHandlers.ts` at 1039 lines
  - `frontend/src/components/Params/GroupContainer.tsx` at 995 lines
  - `frontend/src/components/Params/ParamUIs/TextParamInput.tsx` at 944 lines
  - `frontend/src/components/Section/Layouts/CodeArea.tsx` at 934 lines
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx` at 737 lines
  - `frontend/src/components/Section/Header/SectionHeader.tsx` at 735 lines
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx` at 588 lines as
    the browser-section coordinator over `BrowserAreaContentView.tsx`,
    `useBrowserAreaPreviewState.ts`, `useBrowserAreaFolderSession.ts`, and
    `browserAreaPreviewModel.ts`
- `frontend/src/components/Section/Layouts/ChatArea.tsx` is now 42 lines and
  acts as a thin managed-vs-scriptable branch router over
  `chatAreaManagedSurface.tsx`, `chatAreaManagedHistory.tsx`,
  `chatAreaScriptableSurface.tsx`, and `chatAreaRealtimeEvents.ts`.
- `frontend/src/components/Section/Layouts/TaskBoardArea.tsx` is now 614 lines
  and acts as the task-board coordinator over `taskBoardAreaModel.ts` for
  task/column mutations plus DnD math, `taskBoardAreaToolbar.tsx` for the
  toolbar shell, `taskBoardAreaTaskListView.tsx` for list rendering, and
  `taskBoardAreaKanbanView.tsx` for lane/resize/card rendering.
- `BrowserArea.tsx` is now 588 lines after the local preview-state and
  folder-session extraction and is no longer a default starting point while
  larger cross-domain front doors remain unresolved.
- `GroupContainer.tsx` mixes:
  - pinned/unpinned param rendering
  - DnD setup
  - resize and measurement observers
  - temporary-state writes
  - section-style presentation
- `ParamUI.tsx` acts as a central switchboard for many param types while also handling:
  - store reads and type-guard selection
  - permissions/deployment behavior
  - password reveal logic
  - date/time/dropzone-specific config extraction
- `SectionHeader.tsx` mixes:
  - size measurement
  - diagnostics UI
  - follow-mode selection state
  - menu/run/minimize/title/button composition
  - section-type-specific behavior
- The section system also spreads shared complexity across:
  - section containers
  - header controls
  - section-part helpers
  - per-layout interaction handlers
- The result is that adding a new param control or a new section-header action often requires touching shared files that already carry unrelated behavior.

## Cleanup Principles

1. Shared section chrome should be modular and policy-driven.
2. Param rendering should use explicit registries/adapters instead of one ever-growing control switch.
3. Measurement and observer logic should live outside JSX-heavy render files.
4. Container hierarchy should be as flat as possible without losing behavior.
5. High-DOM section surfaces must keep performance guardrails during cleanup.
6. More feature-local files are fine when the owning layout surface stays obvious; avoid routing layout-specific logic into generic shared helper buckets too early.

## Plan

1. Simplify the layout-heavy front doors first

- `BrowserArea.tsx` is now a follow-through-only layout coordinator; if this
  domain is revisited, shorten it together with
  `useBrowserAreaFolderSession.ts`, `useBrowserAreaPreviewState.ts`, or
  `BrowserAreaContentView.tsx` in the same turn.
- `TaskBoardArea.tsx` only when a same-turn follow-through shortens the
  remaining root coordinator or one of its local owners
- Continue through `chatAreaManagedSurface.tsx` or
  `chatAreaScriptableSurface.tsx` only when a same-turn slice directly
  shortens one of those local section-chat owners.
- Move clearly named responsibilities out of those files:
  - task/column commands vs DnD math vs board presentation
  - preview/data loading vs render shells
- Keep new owners feature-local to the layout surface instead of routing through
  generic shared helpers too early.

2. Extract measurement and observer logic where it supports those roots

- Move section header height tracking, param-area measurement, and pinned/unpinned observer logic into dedicated hooks/modules.
- Keep render files focused on composition and styling once the measurements are computed elsewhere.

3. Split param rendering by control family

- Turn `ParamUI.tsx` into a small dispatcher over explicit control modules.
- Co-locate each control’s:
  - selector/config adapter
  - rendering component
  - authoring/config editor
  - tests
- Keep shared permission/deployment rules in a small shared param policy layer.

4. Separate section chrome from section-specific actions

- Break `SectionHeader.tsx` into:
  - shared header shell
  - title/tag/follow controls
  - diagnostics controls
  - section action groups
- Make it obvious where to add a new control without editing a long mixed-responsibility file.

5. Simplify group/container infrastructure

- Reduce the amount of layout, DnD, measurement, and render logic living in `GroupContainer.tsx`.
- Standardize the boundaries between:
  - section container
  - section header
  - param area
  - layout body

6. Apply the same boundaries to the next shared infrastructure surfaces

- After shared section/param infrastructure is split, follow through on:
  - `CodeArea.tsx`
  - `useDrawModeMouseHandlers.ts`
  - draw/meta-control shared infrastructure
- Prefer pure interaction helpers and selector-backed state access over large in-component orchestration.
- If a slice starts from `TaskBoardArea.tsx`, add direct Vitest coverage for the
  extracted task/column ownership boundary as part of the same change.

## Risks And Mitigations

- Risk: subtle focus, keyboard, or measurement regressions.
  - Mitigation: extract helpers with focused tests before changing render structure.
- Risk: param-control registry becomes too abstract.
  - Mitigation: keep each param type’s registration close to the actual control implementation.
- Risk: DOM changes affect large-canvas performance.
  - Mitigation: profile before/after for section-heavy surfaces and keep DOM flattening as an explicit goal.

## Verification

- Add or update Vitest coverage for:
  - measurement helpers
  - param control policy/dispatch
  - section header control visibility and behavior
  - layout interaction helpers
- Use CDP profiling for significant section-container or render-structure refactors.
- Add performance notes under `perf/reports/frontend/` when shared section surfaces are materially refactored.

## Acceptance Criteria

- A new param control can be added without editing a large central switch full of unrelated logic.
- Shared section chrome has clear extension points for diagnostics, follow mode, title actions, and measurement.
- Measurement code no longer dominates section render files.
- The section system is easier to navigate because common concerns have stable, explicit ownership boundaries.
