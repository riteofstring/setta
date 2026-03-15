# Frontend Cleanup Plan

## Goal

Make the authored frontend easy for Codex agents and humans to navigate, change, and profile without a big-bang rewrite or user-visible behavior changes.

## What "Clean" Means Here

- A contributor should be able to answer "where does this behavior live?" within a few file opens.
- Render components should mostly describe UI, not also fetch data, mutate multiple stores, parse protocol payloads, and manage timers.
- State writes should happen through small, named domain commands instead of ad hoc `getState()` / `setState()` reach-through from many places.
- Expensive derivation should live in pure functions or selectors with tests, then feed lightweight React components.
- Performance work should be measured with existing Vitest/Playwright coverage plus CDP/`perf/reports` profiling for significant refactors.

## Scope

- In scope:
  - Authored frontend code under `frontend/src/**`
  - Refactors that improve readability, feature ownership, and render/update performance
  - Documentation that helps agents quickly find the right file, state owner, and test entry points
- Out of scope for the first pass:
  - `frontend/src/utils/generated*`
  - visual redesigns
  - backend API/schema changes
  - repo-wide folder moves before boundaries are proven

## Status Refresh (2026-03-14)

- The overall direction in this plan is still valid, but this branch is no longer at the original planning snapshot.
- Phase 0 foundation guidance now lives in `frontend/src/README.md`, and the
  append-only branch log lives in `docs/plans/frontend-cleanup-execution-log.md`.
- Some useful seams already exist and should be extended rather than recreated:
  - page routing already uses `frontend/src/components/Pages/routeConfig.ts` and `frontend/src/components/Pages/modeRouteResolver.ts`
  - app generation preview helpers already live in `frontend/src/components/Panes/Overview/App/appDraftPreview.ts`
  - project chat already has feature-local helpers such as `projectChatHydrationAuthority.ts`, `projectChatStarterPrompts.ts`, `projectChatSlashCommandSelectors.ts`, and `projectChatFocusUtils.ts`
- project chat windowing already splits behavior across `frontend/src/state/actions/projectChatWindowingSelectors.ts`, `frontend/src/state/actions/projectChatWindowingInstanceState.ts`, `frontend/src/state/actions/projectChatWindowingPlacementState.ts`, `frontend/src/state/actions/projectChatWindowingBoundsState.ts`, `frontend/src/state/actions/projectChatWindowingLayoutState.ts`, `frontend/src/state/actions/projectChatWindowingState.ts`, `frontend/src/state/actions/projectChatWindowCommands.ts`, `frontend/src/state/actions/projectChatWindowMetadataCommands.ts`, `frontend/src/state/actions/projectChatWindowSectionCommands.ts`, `frontend/src/state/actions/projectChatWindowingWriteState.ts`, `frontend/src/state/actions/projectChatWindowingWritePipeline.ts`, `frontend/src/state/actions/projectChatWindowingAuthoritative.ts`, `frontend/src/state/actions/projectChatWindowingEphemeral.ts`, and `frontend/src/state/actions/projectChatWindowingWrites.ts`
  - chat hydration fetch/reconciliation and outcome typing now live in `frontend/src/state/actions/aiHydration.ts`
  - agent-run loading, retries, and single-run reconciliation now live in `frontend/src/state/actions/aiAgentRuns.ts`
  - LLM config/API-key handling now lives in `frontend/src/state/actions/aiLLMConfiguration.ts`, while agent-profile, prompt-template, external-agent, external-agent-health, and engine-config catalog mutations now live in `frontend/src/state/actions/aiConfigurationCatalogs.ts`
  - provider dictation orchestration now lives in `frontend/src/state/actions/aiTranscription.ts`, while session transport now lives in `frontend/src/state/actions/aiTranscriptionSessions.ts` and transcription-profile mutations now live in `frontend/src/state/actions/aiTranscriptionProfiles.ts`
  - `RunInstructions.tsx` already delegates some state/parsing work to `runInstructionsAccordionState.ts`, `runInstructionsRunnableCodeBlocks.ts`, and `runInstructionsStateMachineControls.ts`
- Future cleanup should continue from these seams instead of assuming every hotspot is still a single-file monolith.
- Before starting a slice, re-measure the current file and check for nearby helper modules/tests.
- Terminal hook ownership is no longer concentrated in one file: `frontend/src/state/hooks/terminals/terminal.ts`
  now handles React mount/focus orchestration while `terminalSessions.ts`
  owns websocket session reuse and `terminalFit.ts` owns xterm fit/fallback
  sizing behavior.

## Current State (Observed)

- The biggest readability problem is mixed responsibilities inside large files, not just file count.
- There are 1038 authored TS/TSX files under `frontend/src`.
- There are 41 non-generated TS/TSX files at 1000+ lines; several production hotspots are well above 2000 lines.
- Chat and project-AI code is the densest cluster:
  - `frontend/src/components/Chat/ChatMessages.tsx` at 7959 lines
  - `frontend/src/components/Chat/ChatInput.tsx` at 3121 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` at 2721 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` at 2379 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx` at 3328 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx` at 2478 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx` at 2445 lines
- `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` at 4990 lines
- The file/browser and section layout path has similar coupling:
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx` at 2325 lines
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx` at 2403 lines
  - `frontend/src/components/Section/Layouts/ChatArea.tsx` at 1975 lines
  - `frontend/src/components/Section/Layouts/TaskBoardArea.tsx` at 2304 lines
- App and plugin runtime remain cleanup hotspots:
  - `frontend/src/plugins/runtime.ts` at 2730 lines
  - `frontend/src/components/App/appRegistry.tsx` at 1756 lines
- `frontend/src/state/actions/aiChatStreaming.ts` is now 391 lines and owns top-level streaming chunk routing plus chat-detail side effects, while `frontend/src/state/actions/aiChatStreamingMessages.ts` owns shared message delta/finalized reducers, `frontend/src/state/actions/aiChatStreamingSectionState.ts` owns managed chat-section reconciliation, and `frontend/src/state/actions/aiChatStreamingTools.ts` owns tool-preview stores, tool-call placeholder reconciliation, and app-spec/app-definition tool handling after retiring `frontend/src/state/actions/ai.ts`.
- `frontend/src/state/actions/aiHydration.ts` now owns chat fetch/reconciliation and hydration outcome classification.
- `frontend/src/state/actions/aiAgentRuns.ts` now owns agent-run loading, retries, and authoritative update paths.
- `frontend/src/state/actions/aiChatSubmission.ts` now owns chat submission/edit orchestration and backend request payload assembly.
- `frontend/src/state/actions/aiChatControls.ts`, `frontend/src/state/actions/aiChatStopState.ts`, and `frontend/src/state/actions/aiExternalAgentResponses.ts` now own stop orchestration, local stop snapshot/reconciliation, and external approval/question responses.
- `frontend/src/state/actions/aiChatState.ts` now owns chat-detail and pending-surface detail writes shared by submission, hydration, and controls.
- `frontend/src/state/actions/aiPendingChatState.ts` now owns surface-scoped pending drafts, pending app-generation state, and promotion into materialized chats.
- `frontend/src/state/actions/aiInterruptedAssistantMessages.ts` now owns interrupted assistant message tracking and snapshot restoration.
- `frontend/src/state/actions/aiLLMConfiguration.ts` now owns LLM config/API-key handling plus managed API-key conflict resolution and snapshot updates.
- `frontend/src/state/actions/aiConfigurationCatalogs.ts` now owns the AI settings/resource catalogs for agent profiles, prompt templates, external agents, external-agent health, and engine configs, reducing `frontend/src/state/actions/aiConfiguration.ts` to a thin compatibility surface.
- `frontend/src/state/actions/aiTranscription.ts` now owns provider dictation decode, resample, chunk, and upload orchestration.
- `frontend/src/state/actions/aiTranscriptionSessions.ts` now owns provider session transport, request-error handling, and chunk-size policy.
- `frontend/src/state/actions/aiTranscriptionProfiles.ts` now owns transcription-profile loading, websocket/store snapshot updates, and CRUD.
- `frontend/src/state/actions/projectChatWindowingWriteState.ts` now owns
  layout-write permissions, current-windowing store access, optimistic apply
  helpers, and local active-chat sync, while
  `frontend/src/state/actions/projectChatWindowingWritePipeline.ts` now owns
  serialized write coordination, authoritative publish/replay, and explicit
  sync/flush helpers, reducing
  `frontend/src/state/actions/projectChatWindowingWrites.ts` to a thinner
  public mutation facade.
- `frontend/src/state/actions/sections/createSections.ts` now owns top-level
  section creation commands plus empty-space add actions,
  `frontend/src/state/actions/sections/createSectionPlacement.ts` now owns
  smart placement context and empty-space placement helpers,
  `frontend/src/state/actions/sections/createSectionFileOpeners.ts` now owns
  file-open/drop-to-section routing plus reuse flows, and
  `frontend/src/state/actions/sections/createSectionImplDefaults.ts` now owns
  per-impl create defaults such as text-block display-mode normalization,
  reducing `frontend/src/state/actions/sections/createSections.ts` to 140
  lines.
- `frontend/src/state/actions/stateMachineEdgeCanonicalization.ts` now owns
  workflow handle normalization and shared-chat workflow port canonicalization,
  `frontend/src/state/actions/stateMachineEdgeGraph.ts` now owns section-type
  reads plus machine-group resolution and merge helpers, and
  `frontend/src/state/actions/stateMachineEdgeConnections.ts` now owns
  workflow connection validation and edge construction, reducing
  `frontend/src/state/actions/stateMachineEdgeConnections.ts` to 165 lines.
- `frontend/src/state/actions/projectChatThreadGroupMutations.ts` now owns
  persisted project-chat thread group creation, rename, collapse, pin, reorder,
  assignment, and deletion behavior, `frontend/src/state/actions/projectChatThreadMutations.ts`
  now owns per-thread viewed, pin, reorder, and delete behavior, and
  `frontend/src/state/actions/projectChatThreadStorageUndo.ts` now owns the
  local delete undo stack and restoration logic, reducing
  `frontend/src/state/actions/projectChatThreads.ts` to a 20-line compatibility
  surface.
- `frontend/src/state/actions/gitGraphLog.ts` now owns git graph overlay boot,
  git graph/log loading, pagination, and graph filter/all-refs refresh
  behavior, `frontend/src/state/actions/gitGraphSelection.ts` now owns selected
  commit clearing plus commit details/file-diff selection, and
  `frontend/src/state/actions/gitGraphState.ts` now owns reusable graph state
  builders and current project-config lookup, reducing
  `frontend/src/state/actions/gitGraph.ts` to a 13-line compatibility surface
  and keeping `frontend/src/state/actions/git.ts` as a thin git action index.
- `frontend/src/state/actions/sectionProjectStateSync.ts` now owns backend
  project-state reconciliation, active-section sync, viewport updates, and
  project-chat windowing coordination, reducing
  `frontend/src/state/actions/sectionInfos.ts` to 1840 lines.
- `frontend/src/state/actions/projectStateCommands.ts` now owns shared
  project-state command entrypoints for section delete/group flows, param
  selection, viewport persistence, and all-project-metadata updates, reducing
  `frontend/src/state/actions/sectionInfos.ts` further to 1674 lines.
- `frontend/src/state/actions/projectStateOptimisticUpdates.ts` now owns the
  pending-operation queue and optimistic project-state mutation scaffolding,
  reducing `frontend/src/state/actions/sectionInfos.ts` further to 1530 lines.
- `frontend/src/state/actions/topLevelSectionLayouts.ts` and
  `frontend/src/state/actions/topLevelLayoutPersistence.ts` now own
  active-view layout selection, top-level layout snapshot building, pending-op
  reconciliation, and debounced layout persistence, reducing
  `frontend/src/state/actions/sectionInfos.ts` further to 1308 lines.
- `frontend/src/state/actions/sectionDisplayQueries.ts` now owns top-level
  display selection, displayed-child tree derivation, node-map creation, DnD
  child reset, and view-mode visibility queries that previously lived in
  `frontend/src/state/actions/sectionInfos.ts`, reducing
  `frontend/src/state/actions/sectionInfos.ts` further to 457 lines for the
  remaining streaming merge, shown-param, ancestry, and tool-preview cleanup
  surface.
- `frontend/src/state/actions/sectionEffectiveImpls.ts` now owns effective
  section/code-object resolution, typed current-section/code-object selectors,
  and effective-impl cache helpers, while
  `frontend/src/state/actions/sectionLayoutQueries.ts` now owns terminal
  attachment, section orientation, section type, and section-child queries and
  `frontend/src/state/actions/sectionEffectiveImplMutations.ts` now owns the
  local impl mutation helpers for section/code-object writes, reducing the
  core effective-impl selector surface to 423 lines.
- `frontend/src/state/hooks/sectionMinMaxDims.ts` now owns section sizing-policy
  reads plus measured min/max dimension derivation,
  `frontend/src/state/hooks/sectionScrollability.ts` now owns the shared
  overflow observer, and `frontend/src/state/hooks/sectionAspectRatioSizing.ts`
  now owns draw/social/media aspect-ratio sizing behavior, reducing
  `frontend/src/state/hooks/sectionSizes.ts` to a 13-line compatibility
  surface.
- `frontend/src/state/actions/params/paramMoveQueries.ts` now owns param
  selection resolution, visible-sibling grouping, and movement-context reads,
  `frontend/src/state/actions/params/paramMoveMutations.ts` now owns
  optimistic param reparent/reorder application plus shown-param sync, and
  `frontend/src/state/actions/params/moveParams.ts` is down to 250 lines for
  public select/move/indent or unindent command orchestration.
- `frontend/src/state/actions/websocketIncomingMessages.ts` now owns frontend
  websocket payload dispatch, project/app snapshot routing, and
  `UISettingReveal` ACK handling, reducing
  the old websocket surface into a thin `websocketReceive.ts` facade plus
  `frontend/src/state/actions/websocketLifecycle.ts` for transport wiring,
  `frontend/src/state/actions/websocketBootstrap.ts` for socket-open
  bootstrap, `frontend/src/state/actions/websocketAuthRecovery.ts` for auth
  recovery, `frontend/src/state/actions/websocketShareSessionRecovery.ts` for
  share-session heartbeat/recovery, and
  `frontend/src/state/actions/websocketRealtime.ts` for outbound realtime send
  or upload behavior.
- `frontend/src/state/actions/windowSpacePersistence.ts` now owns saved
  window-space sort/name/delete/create mutations plus optimistic persistence,
  `frontend/src/state/actions/windowSpaceSnapshots.ts` owns floating
  snapshot/restore conversion, `frontend/src/state/actions/windowSpaceWorkspaceRestorePlan.ts`
  now owns workspace-restore planning plus restored-instance remapping, and
  `frontend/src/state/actions/windowSpaceProjectChatThreadRestore.ts` now owns
  deployment-policy restore gating plus saved project-chat thread rebound,
  reducing `frontend/src/state/actions/windowSpaces.ts` to 65 lines as a thin
  workspace-restore orchestrator.
- `frontend/src/state/actions/projectChatWindowingSelectors.ts` now owns pure
  windowing normalization, selection, and default-bounds helpers,
  `frontend/src/state/actions/projectChatWindowingInstanceState.ts` now owns
  window-instance creation plus per-window update helpers,
  `frontend/src/state/actions/projectChatWindowingPlacementState.ts` now owns
  placement/focus reducers, `frontend/src/state/actions/projectChatWindowingBoundsState.ts`
  now owns dock-fraction and bounds reducers, `frontend/src/state/actions/projectChatWindowingLayoutState.ts`
  is now a thin compatibility surface, and `frontend/src/state/actions/projectChatWindowingState.ts` now owns
  section-binding, title/chat-id, and section/canvas transition reducers,
  `frontend/src/state/actions/projectChatWindowingCanvasBoot.ts` now owns DOM
  surface lookup plus canvas boot flow, `frontend/src/state/actions/projectChatWindowingTrackedGitPane.ts`
  now owns tracked git-pane graph window reuse/maximize/title coordination,
  `frontend/src/state/actions/projectChatWindowCommands.ts` now owns public
  window lifecycle, placement, focus, and bounds commands,
  `frontend/src/state/actions/projectChatWindowMetadataCommands.ts` now owns
  title/chat-id commands plus current-windowing reads, and
  `frontend/src/state/actions/projectChatWindowSectionCommands.ts` now owns
  section exposure, undock, and section/window mode transition commands,
  `frontend/src/state/actions/projectChatWindowingWriteState.ts` now owns
  layout-write permissions plus optimistic apply helpers,
  `frontend/src/state/actions/projectChatWindowingWritePipeline.ts` now owns
  serialized write coordination and authoritative publish/replay, and
  `frontend/src/state/actions/projectChatWindowingWrites.ts` is now a thin
  public mutation facade, reducing
  `frontend/src/state/actions/projectChatWindowing.ts` to a 28-line
  compatibility surface.
- `frontend/src/state/hooks/terminals/terminal.ts` is down to 248 lines and now
  delegates terminal websocket-session caching/transport to
  `frontend/src/state/hooks/terminals/terminalSessions.ts` and xterm
  fit/fallback/reflow behavior to
  `frontend/src/state/hooks/terminals/terminalFit.ts`.
- `frontend/src/state/actions/keyActivations.ts` is down to 284 lines and now
  delegates grouped shortcut registration to
  `frontend/src/state/actions/keyShortcutRegistrations.ts`, shortcut
  parsing/input-ignore policy to
  `frontend/src/state/actions/keyShortcutUtils.ts`, and `Tab`/`Escape`,
  section-selection, and React Flow key-mode handlers to
  `frontend/src/state/actions/keyActivationHandlers.ts`.
- `frontend/src/utils/focusManager.ts` is down to a thin compatibility surface
  and now delegates tab-scope registration/focus tracking to
  `frontend/src/utils/focusManagerRegistry.ts`, focusable-element/canvas-order
  helpers to `frontend/src/utils/focusManagerElements.ts`, generic scope
  traversal to `frontend/src/utils/focusManagerNavigation.ts`, and
  section/canvas focus behavior to
  `frontend/src/utils/focusManagerSections.ts`.
- `frontend/src/components/Utils/Resizable/CustomResizable.tsx` is down to 246
  lines and now delegates resize lifecycle and optimistic section-size
  persistence to `useCustomResizableBehavior.ts`, pure clamp and auto-clamp
  decisions to `customResizableSizing.ts`, and handle chrome plus direction
  parsing to `customResizableChrome.ts`.
- `frontend/src/state/actions/stateMachineEdges.ts` is down to a 12-line
  compatibility entrypoint and now delegates workflow handle normalization to
  `stateMachineEdgeCanonicalization.ts`, machine-group resolution and merge
  helpers to `stateMachineEdgeGraph.ts`, connection validation and edge
  construction to `stateMachineEdgeConnections.ts`, and optimistic create or
  select or delete or replace commands to `stateMachineEdgeMutations.ts`.
- `frontend/src/state/actions/websocketReceive.ts` is down to a 7-line
  compatibility entrypoint and now delegates socket lifecycle, reconnect, auth,
  outbound realtime dependency or binary send behavior to
  `websocketRealtime.ts`, shared active-socket state to `websocketRuntime.ts`,
  transport wiring to `websocketLifecycle.ts`, socket-open bootstrap to
  `websocketBootstrap.ts`, auth recovery to `websocketAuthRecovery.ts`, and
  share-session heartbeat or restoration to
  `websocketShareSessionRecovery.ts`.
- `frontend/src/state/actions/uiSettingReveal.ts` is down to 360 lines and now
  delegates reveal mutation orchestration, lease ownership, snapshot rollback,
  pane activation, DOM anchor/highlight helpers, and execution-status utilities
  to `uiSettingRevealMutations.ts`,
  `uiSettingRevealMutationOwnership.ts`,
  `uiSettingRevealMutationSnapshots.ts`, `uiSettingRevealActivation.ts`,
  `uiSettingRevealDom.ts`, and `uiSettingRevealShared.ts`.
- `frontend/src/state/stores/aiStores.ts` now owns the AI/chat Zustand stores and related chat-state types.
- `frontend/src/state/stores/appStores.ts` now owns app definition/config/preview state, and `frontend/src/state/stores/sessionStores.ts` now owns share-session, server-mode, and all-project-metadata state.
- `frontend/src/state/stores/editorDiagnosticsStores.ts` now owns LSP waiting flags, type errors, LSP diagnostics, and name-validation errors used across authoring and validation flows.
- `frontend/src/state/stores/fileBrowserStores.ts` now owns the file-browser state surfaces, and `frontend/src/state/stores/searchStores.ts` now owns the home/project search stores.
- `frontend/src/state/stores/feedbackStores.ts` now owns modal, notifications, and backend-log state, and `frontend/src/state/stores/projectStatusStores.ts` now owns run-control and project-loading state.
- `frontend/src/state/stores/layoutInteractionStores.ts` now owns section refs, edge-handle registry state, temporary measurement/preview state, and ephemeral layout interaction flags shared across section dragging, sizing, minimap previews, and embedded git-pane visibility.
- `frontend/src/state/stores/uiPreferenceStores.ts` now owns persisted UI chrome preferences plus shared settings state used by panes, shortcuts, minimap/grid behavior, and project-chat local preference surfaces.
- `frontend/src/state/storePersistStorage.ts` now owns the shared persisted-storage fallback used by the extracted store modules.
- `frontend/src/state/definitions.ts` is down to 404 lines with 14 local `use*` stores plus thin domain re-exports for AI/chat, app, session/share, browser, search, feedback, project-status, layout-interaction, UI-preference, and editor-diagnostics state.
- Components and hooks frequently import generated endpoints/types and large action modules directly, which increases context switching and makes it harder for agents to see the true domain boundary.
- Direct store reach-through is common enough that mutation paths are not obvious from component names alone.

## Guiding Principles

1. Prefer feature ownership over file-type ownership.
   Each feature should have an obvious home for UI, selectors, commands, transport helpers, and tests.

2. Prefer small explicit APIs over broad shared modules.
   New code should depend on a narrow feature surface, not on large catch-all modules.

3. Separate pure derivation from effects and rendering.
   If logic can be tested without React, move it out of the component tree.

4. Keep generated code as the source of truth, but wrap it.
   Use typed feature-local adapters around generated routes/types instead of pulling `route_*` calls deep into leaf components.

5. Avoid big-bang moves.
   Refactor one hotspot at a time, keep behavior stable, and only move files after a smaller API boundary has settled.

6. Measure performance before and after meaningful refactors.
   For high-impact surfaces, append results under `perf/reports/frontend/` and use CDP profiling to confirm the cleanup did not regress large-DOM behavior.

## Target Shape

For major hotspots, aim for a feature-local shape like this:

```text
<feature>/
  README.md
  components/
  hooks/
  selectors/
  commands/
  api/
  model/
  *.test.ts(x)
  *.perf.test.ts(x)
```

Notes:

- This is a target shape, not a mandatory first-step directory migration.
- Keep truly generic primitives in shared locations.
- Prefer explicit imports from owning modules over large barrel files.

## Phase 0: Guardrails And Mapping

- Create or refresh a short frontend module map doc that tells agents where chat, project chat, browser/file management, app runtime, plugin runtime, and shared stores live.
- Add clear "where new code goes" rules:
  - feature-local helpers stay with the feature
  - `utils/` is reserved for low-level cross-feature helpers
  - shared store definitions and selectors must name their owning feature
- If the branch does not already have one, create an append-only cleanup execution log so future agents can see which slices have already landed.
- Define file-size guidance:
  - preferred: under 500 lines for new/refactored production files
  - review threshold: 800 lines
  - exceptions must be deliberate and documented
- Define a small set of allowed patterns for store access, selector creation, transport wrappers, and test placement so Codex agents are not guessing.

## Phase 1: Split The Chat Domain First

- Start with the highest-traffic shared path:
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/components/Chat/ChatInput.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  - `frontend/src/state/actions/aiChatStreaming.ts`
- Keep existing feature-local helpers in `frontend/src/components/Panes/Overview/ProjectLevelAI/` and adjacent chat directories as stable seams instead of folding behavior back into the large surface files.
- Break `ChatMessages.tsx` into distinct modules:
  - message content rendering
  - assistant activity/timeline rendering
  - structured output formatting
  - attachment preview/loading
  - copy/export helpers
  - timers and animation hooks
- Break `ChatInput.tsx` into:
  - composer state
  - attachment handling
  - slash command resolution
  - dictation/transcription controls
  - presentational subcomponents
- Continue splitting streaming-heavy chat action modules into domain commands with obvious names such as:
  - chat submission/editing
  - chat hydration
  - chat streaming reducers
  - agent runs
  - engine/config loading
  - transcription
- Keep the existing chat virtualization work aligned with this phase by treating [chat-message-list-virtualization-plan.md](./chat-message-list-virtualization-plan.md) as part of the same chat cleanup track.

## Phase 2: Make Store Ownership Obvious

- Split `frontend/src/state/definitions.ts` by domain or add domain-local store modules that re-export the minimal surface needed by callers.
- Add selectors next to stores so components read derived data through named helpers instead of reconstructing it inline.
- Reduce component-level `useStore.getState()` / `useStore.setState()` calls, especially in render-heavy UI surfaces.
- Prefer named command functions for mutations so the write path is easy to locate.
- Keep Zustand, but tighten access patterns instead of introducing a new state library.

## Phase 3: Simplify Project Chat Windowing

- Refactor `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` and `frontend/src/state/actions/projectChatWindowing.ts`.
- Continue from the existing selector/instance-state/placement-state/bounds-state/layout-state/state/write-state/write-pipeline/authoritative/ephemeral helper seams in `projectChatWindowingSelectors.ts`, `projectChatWindowingInstanceState.ts`, `projectChatWindowingPlacementState.ts`, `projectChatWindowingBoundsState.ts`, `projectChatWindowingLayoutState.ts`, `projectChatWindowingState.ts`, `projectChatWindowingWriteState.ts`, `projectChatWindowingWritePipeline.ts`, `projectChatWindowingWrites.ts`, `projectChatWindowingAuthoritative.ts`, and `projectChatWindowingEphemeral.ts` instead of re-splitting from scratch.
- Separate:
  - layout math
  - pointer/keyboard interaction state
  - persisted windowing mutations
  - render shells
  - animation state
- Move reusable calculations into pure modules with focused tests.
- Keep performance front and center for drag/resize and large multi-window scenarios.

## Phase 4: Clean Up File Browser And Section Layouts

- Refactor:
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/components/Section/Layouts/TaskBoardArea.tsx`
- Separate data loading/filtering/preview resolution from rendering.
- Keep virtualization and large-folder behavior explicit and measurable.
- Push expensive path/filter/search derivation into tested helpers/selectors before React render.
- Reduce wrapper depth where possible to keep DOM shape flatter.

## Phase 5: Simplify App And Plugin Runtime Surfaces

- Refactor:
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/plugins/runtime.ts`
- Separate runtime registry concerns from renderers, bindings, capability checks, and markdown/media helpers.
- Document the extension points clearly so agents know where to add new runtime component types or plugin hooks.

## Phase 6: Put Documentation Next To Code

- Add short `README.md` files for the major feature roots touched during cleanup.
- Each README should answer:
  - what this feature owns
  - main entry components
  - primary stores/selectors/commands
  - generated API dependencies
  - most relevant tests
- This is high leverage for Codex agents because it reduces "search the tree until something looks right" work.

## Verification Strategy

- For each substantial refactor:
  - add or update Vitest coverage around extracted pure logic and selectors
  - add or update Playwright coverage for user-facing flows when the surface is interactive
  - run CDP profiling/visual verification when the refactor touches UI behavior or performance-sensitive rendering
  - append before/after notes to `perf/reports/frontend/` for meaningful performance changes
- Prefer stable performance guardrails such as DOM size, render counts, selector churn, or virtualization behavior over fragile timing-only assertions.

## Success Criteria

- Major frontend features have obvious entry points, state owners, and mutation paths.
- New contributors and coding agents can usually identify the right file to change without opening a large cluster of unrelated files.
- Large shared surfaces no longer combine transport, state mutation, heavy derivation, and rendering in a single file.
- Render-heavy flows remain at least as fast as today, with before/after profiling recorded for significant refactors.
- The repo gains durable local guidance so future code does not collapse back into mega-files.

## Recommended Execution Order

1. Refresh or add the module map, placement rules, and execution log if they are missing or stale on the branch.
2. Tackle whichever shared hotspot is currently the biggest blocker for agent legibility, usually `state/actions/aiChatStreaming.ts`, the shared chat UI surfaces, or `state/definitions.ts`.
3. Continue the project chat windowing split from the existing `projectChatWindowingSelectors.ts`, `projectChatWindowingInstanceState.ts`, `projectChatWindowingPlacementState.ts`, `projectChatWindowingBoundsState.ts`, `projectChatWindowingLayoutState.ts`, `projectChatWindowingState.ts`, `projectChatWindowingWriteState.ts`, `projectChatWindowingWritePipeline.ts`, `projectChatWindowingWrites.ts`, `projectChatWindowingAuthoritative.ts`, and `projectChatWindowingEphemeral.ts` seams.
4. Clean up file browser and section layout hotspots.
5. Work through the remaining page, pane, and runtime hotspots from the companion plans.
6. Add feature READMEs as each area stabilizes.

## Notes

- Do not start with a repo-wide `features/` migration. Prove the boundaries first, then move files if the new structure is clearly better.
- Generated endpoints/types should remain the source of truth; the cleanup should make them easier to consume, not replace them.
- If a refactor meaningfully changes performance-sensitive surfaces, baseline first with CDP and keep the results in `perf/`.
