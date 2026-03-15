# Frontend Cleanup Plan

## Goal

Make the authored frontend easy for Codex agents and humans to navigate, change, and profile without a big-bang rewrite or user-visible behavior changes.

## What "Clean" Means Here

- A contributor should be able to answer "where does this behavior live?" within a few file opens.
- Grep on feature terms should usually land on the owning file because names are concrete; if naming alone is still not enough, add a short file-level ownership comment or docstring in the code rather than another local doc.
- Render components should mostly describe UI, not also fetch data, mutate multiple stores, parse protocol payloads, and manage timers.
- State writes should happen through small, named domain commands instead of ad hoc `getState()` / `setState()` reach-through from many places.
- Expensive derivation should live in pure functions or selectors with tests, then feed lightweight React components.
- More files is fine when the root entry surface stays obvious and each nearby file has one clear concern.
- Avoid generic catch-all names such as `helpers`, `shared`, `runtime`, `viewModel`, or `utils` unless the file truly owns that single narrow cross-feature concern.
- Use comments sparingly: prefer a short top-of-file ownership note or a targeted function comment only when the code boundary is otherwise hard to infer.
- Performance work should be measured with existing Vitest/Playwright coverage plus CDP/`perf/reports` profiling for significant refactors.

## Scope

- In scope:
  - Authored frontend code under `frontend/src/**`
  - Refactors that improve readability, feature ownership, and render/update performance
- Minimal branch-level cleanup guidance for prioritization and placement rules
- Out of scope for the first pass:
  - `frontend/src/utils/generated*`
  - visual redesigns
  - backend API/schema changes
  - repo-wide folder moves before boundaries are proven

## Status Refresh (2026-03-14)

- The overall direction in this plan is still valid, but this branch is no longer at the original planning snapshot.
- Phase 0 foundation guidance now lives in these cleanup plans, and the
  append-only branch log lives in `docs/plans/frontend-cleanup-execution-log.md`.
- Some useful seams already exist and should be extended rather than recreated:
  - page routing already uses `frontend/src/components/Pages/routeConfig.ts` and `frontend/src/components/Pages/modeRouteResolver.ts`
  - app generation preview helpers already live in `frontend/src/components/Panes/Overview/App/appDraftPreview.ts`
  - project chat already has feature-local helpers such as `projectChatHydrationAuthority.ts`, `projectChatStarterPrompts.ts`, `projectChatSlashCommandSelectors.ts`, and `projectChatFocusUtils.ts`
- project chat windowing already splits behavior across `frontend/src/state/actions/projectChatWindowingDefaultBounds.ts`, `frontend/src/state/actions/projectChatWindowingStateNormalization.ts`, `frontend/src/state/actions/projectChatWindowingNormalization.ts`, `frontend/src/state/actions/projectChatWindowingSelectors.ts`, `frontend/src/state/actions/projectChatWindowingInstanceCreation.ts`, `frontend/src/state/actions/projectChatWindowingInstanceUpdates.ts`, `frontend/src/state/actions/projectChatWindowingInstanceState.ts`, `frontend/src/state/actions/projectChatWindowingPlacementState.ts`, `frontend/src/state/actions/projectChatWindowingBoundsState.ts`, `frontend/src/state/actions/projectChatWindowingLayoutState.ts`, `frontend/src/state/actions/projectChatWindowingSectionState.ts`, `frontend/src/state/actions/projectChatWindowingMetadataState.ts`, `frontend/src/state/actions/projectChatWindowingState.ts`, `frontend/src/state/actions/projectChatWindowLifecycleCommands.ts`, `frontend/src/state/actions/projectChatWindowLayoutCommands.ts`, `frontend/src/state/actions/projectChatWindowCommands.ts`, `frontend/src/state/actions/projectChatWindowMetadataCommands.ts`, `frontend/src/state/actions/projectChatWindowSectionCommands.ts`, `frontend/src/state/actions/projectChatWindowingWriteState.ts`, `frontend/src/state/actions/projectChatWindowingWriteQueue.ts`, `frontend/src/state/actions/projectChatWindowingWritePublish.ts`, `frontend/src/state/actions/projectChatWindowingWriteSync.ts`, `frontend/src/state/actions/projectChatWindowingWritePipeline.ts`, `frontend/src/state/actions/projectChatWindowingAuthoritative.ts`, `frontend/src/state/actions/projectChatWindowingEphemeralKeys.ts`, `frontend/src/state/actions/projectChatWindowingTrackedGitPaneState.ts`, `frontend/src/state/actions/projectChatWindowingEmbeddedPaneVisibility.ts`, `frontend/src/state/actions/projectChatWindowingEphemeral.ts`, and `frontend/src/state/actions/projectChatWindowingWrites.ts`
  - chat hydration fetch/reconciliation and outcome typing now live in `frontend/src/state/actions/aiHydration.ts`
  - agent-run loading, retries, and single-run reconciliation now live in `frontend/src/state/actions/aiAgentRuns.ts`
  - AI-follow tool-argument snapshot reads/writes plus backend snapshot fetch now live in `frontend/src/state/actions/aiFollowToolArguments.ts`, while tool-result highlights and scope-violation timeout orchestration now live in `frontend/src/state/actions/aiFollowHighlights.ts`
  - LLM config loading/saving now lives in `frontend/src/state/actions/aiLLMConfiguration.ts`, managed API-key snapshot/load behavior now lives in `frontend/src/state/actions/aiManagedApiKeyState.ts`, queued managed API-key persistence and conflict handling now lives in `frontend/src/state/actions/aiManagedApiKeyPersistence.ts`, `frontend/src/state/actions/aiManagedApiKeys.ts` is now a thin compatibility facade, while agent-profile, prompt-template, external-agent, external-agent-health, and engine-config catalog fetch/hydration now live in `frontend/src/state/actions/aiConfigurationCatalogLoads.ts`, shared AI catalog store writes now live in `frontend/src/state/actions/aiConfigurationCatalogState.ts`, and catalog mutations now live in `frontend/src/state/actions/aiConfigurationCatalogMutations.ts`
  - provider dictation audio decode and realtime payload prep now live in `frontend/src/state/actions/aiTranscriptionAudio.ts`, provider upload orchestration now lives in `frontend/src/state/actions/aiTranscriptionUpload.ts`, `frontend/src/state/actions/aiTranscription.ts` is now a thin compatibility facade, while session transport now lives in `frontend/src/state/actions/aiTranscriptionSessions.ts` and transcription-profile mutations now live in `frontend/src/state/actions/aiTranscriptionProfiles.ts`
  - `RunInstructions.tsx` already delegates accordion-state persistence to `runInstructionsAccordionState.ts`, runnable-code-block discovery to `runInstructionsRunnableCodeBlocks.ts`, workflow-start control discovery to `runInstructionsStateMachineControls.ts`, run snapshot/codegen target composition to `runInstructionsCodegenSections.tsx`, detailed python codegen policy UI to `runInstructionsCodegenPolicyContent.tsx`, and codegen registration/representation rules to `runInstructionsCodegenModel.ts`
- Future cleanup should continue from these seams instead of assuming every hotspot is still a single-file monolith.
- Before starting a slice, re-measure the current file and check for nearby helper modules/tests.
- Terminal hook ownership is no longer concentrated in one file: `frontend/src/state/hooks/terminals/terminal.ts`
  now handles React mount/focus orchestration while
  `terminalSessionTransport.ts` owns websocket/session bootstrap and transport
  wiring, `terminalSessions.ts` owns cached session reuse plus resize/lifecycle
  bookkeeping, and `terminalFit.ts` owns xterm fit/fallback sizing behavior.
- public stop orchestration now lives in `frontend/src/state/actions/aiChatControls.ts`,
  while external-run lookup and external stop recovery now live in
  `frontend/src/state/actions/aiExternalAgentStop.ts`

## Current State (Observed)

- The biggest readability problem is mixed responsibilities inside large files, not just file count.
- The next readability problem after file scope is oversized flat namespaces
  where too many sibling files compete as plausible entry points.
- There are 1503 authored TS/TSX files under `frontend/src`.
- There are 30 non-generated TS/TSX files at 1000+ lines; several production hotspots are still well above 1200 lines.
- Chat and project-AI code is the densest cluster:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx` at 914 lines after the local history-panel, folder-shell, and thread-row extraction
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` at 1185 lines after the local settings, engine-selection, inline-thread layout, aux-surface content, surface chrome/body, conversation-search, and thread-session extraction
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx` at 912 lines after the local skills browser, markdown viewer, path-group header, and skills view-model extraction and is no longer a top-size hotspot
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` at 1197 lines after the local docked/floating/maximized surface extraction plus the local window lifecycle extraction and is no longer a top-size hotspot
  - `frontend/src/components/Chat/ChatInput.tsx` at 999 lines after the local composer meta-controls extraction plus the local draft-session and queued-draft-stack extraction and is no longer a top-size hotspot
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx` at 63 lines after the local settings-section and manager extraction and is no longer a top-size hotspot
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` at 1019 lines after the local hydration-runtime, slash-command-authority, execution-settings, conversation-model, and hydration-session extractions and is now a follow-through project-AI coordinator
- `frontend/src/components/Chat/ChatMessages.tsx` is now 1236 lines after the local chat-owner extractions and is still one of the largest unresolved chat rendering front doors.
- The file/browser and section layout path has similar coupling:
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx` at 646 lines after the local tree-data transport/view-model, list-surface, and search-filter extraction and is no longer a top-size hotspot
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx` at 588 lines after the local preview-surface, preview-state, and folder-session extraction and is no longer a top-size hotspot
- `frontend/src/components/Section/Layouts/ChatArea.tsx` is now 42 lines after the local managed/scriptable surface, managed-history, and realtime-event extraction and is no longer a top-size hotspot.
- `frontend/src/components/Section/Layouts/TaskBoardArea.tsx` is now 614 lines after the local task-board model, toolbar, task-list view, and kanban-view extraction and is no longer a top-size hotspot.
- App/runtime and pane follow-through work remain cleanup hotspots:
  - `frontend/src/components/Git/GitGraphOverlay.tsx` at 1224 lines after the local resize-model, resize-hook, and selected-commit-pane extraction
- `frontend/src/components/Pages/Home/HomePage.tsx` is now 451 lines after delegating gallery/list rendering to `frontend/src/components/Pages/Home/homeProjectGallery.tsx`, workspace/browser plus side-pane shells to `frontend/src/components/Pages/Home/homeWorkspaceSidePanes.tsx`, selected-project metadata rendering to `frontend/src/components/Pages/Home/homeSelectedProjectDetails.tsx`, and shared path/count helpers to `frontend/src/components/Pages/Home/homeProjectNavigation.ts`, so it is no longer a top-size hotspot.
- `frontend/src/components/App/appRegistry.tsx` is now 888 lines after the local param-input, param-controls, and param-model extraction and is no longer a top-size hotspot.
- `frontend/src/components/Panes/Overview/RunInstructions.tsx` is now 555 lines after the local codegen sections, codegen policy content, and codegen model extraction and is no longer a top-size hotspot.
- `frontend/src/plugins/runtime.ts` is now 622 lines after the local host-types, host-validation, and plugin-host extraction and is no longer a top-size hotspot.
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx` is now 607 lines after the local plugin-card, config-editor, config-schema, and shared-shell extraction and is no longer a top-size hotspot.

## Current Pivot (2026-03-15)

- Phase 0 documentation work is in place, and many of the old state monoliths
  have already been split into stable helper seams plus thin compatibility
  facades.
- The highest-value work is now the first-hop surfaces a contributor or agent
  opens first, not the already-decomposed state layer and not the chat internals
  that have already been cut down substantially.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  now delegates engine/model/config selection to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSelection.ts`
  the settings popover shell to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSettingsPopover.tsx`,
  and inline-thread layout or resize ownership to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatInlineThreadsLayout.ts`
  plus
  `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatInlineThreadsLayout.ts`,
  conversation-search text plus match stepping to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatConversationSearch.ts`,
  aux-tab/search/settings header rendering to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSurfaceChrome.tsx`,
  aux-surface routing to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatAuxViewContent.tsx`,
  engine-switch banner plus inline-thread/history/aux/core branching to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSurfaceBody.tsx`,
  draft-thread lifecycle, selected thread-group sync, engine-switch
  continuation state, and pending-chat continuity to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatThreadSession.ts`,
  and aux-tab/search tooltip or counter helpers to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSurfaceViewModel.ts`,
  so the next default work in that cluster should continue from the remaining
  larger front-door hotspots unless a same-turn follow-through cut shortens the
  remaining hydration-authority or engine-sync path.
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  now delegates root bootstrap, folder-request ownership, recursive-search
  crawl, preview URL refresh, and tree flatten/filter/sort state to
  `frontend/src/components/Panes/Overview/FileBrowser/useFileBrowserPaneTreeData.ts`
  and
  `frontend/src/components/Panes/Overview/FileBrowser/fileBrowserPaneTreeModel.ts`,
  the filter/save-search/search-scope UI to
  `frontend/src/components/Panes/Overview/FileBrowser/fileBrowserPaneSearchFilter.tsx`,
  and the header plus virtualized row surface to
  `frontend/src/components/Panes/Overview/FileBrowser/fileBrowserPaneListSurface.tsx`,
  so the next default work in that domain should continue from the remaining
  larger front-door surfaces instead of immediately re-cutting those new local
  owners.
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx` now
  delegates per-plugin card/action rendering to
  `frontend/src/components/Panes/Overview/Plugins/pluginsPanePluginCard.tsx`,
  schema-backed config and language-server settings editors to
  `frontend/src/components/Panes/Overview/Plugins/pluginsPaneConfigEditors.tsx`,
  top-level config-schema field helpers to
  `frontend/src/components/Panes/Overview/Plugins/pluginsPaneConfigSchema.ts`,
  and shared action/capability/install-summary shells to
  `frontend/src/components/Panes/Overview/Plugins/pluginsPaneShared.tsx`, so
  the next default work in that domain should continue from the remaining
  larger pane and runtime entry surfaces instead of re-cutting those new local
  plugin owners.
- `frontend/src/components/Panes/Overview/RunInstructions.tsx` now delegates
  run snapshot-mode persistence and codegen-target accordion composition to
  `frontend/src/components/Panes/Overview/runInstructionsCodegenSections.tsx`,
  detailed python codegen policy UI plus option-list state to
  `frontend/src/components/Panes/Overview/runInstructionsCodegenPolicyContent.tsx`,
  and codegen registration/representation rules to
  `frontend/src/components/Panes/Overview/runInstructionsCodegenModel.ts`, so
  the next default work in that domain should continue from the remaining
  larger pane roots instead of re-cutting those new run-instructions owners.
- `frontend/src/components/Section/Layouts/ChatArea.tsx` now delegates
  scriptable section-chat state, branch reconciliation, slash-command
  handling, and composer/message rendering to
  `frontend/src/components/Section/Layouts/chatAreaScriptableSurface.tsx`,
  managed section-chat selector scope, zero-scope banner/history/config
  gating, and managed composer/message rendering to
  `frontend/src/components/Section/Layouts/chatAreaManagedSurface.tsx` plus
  `frontend/src/components/Section/Layouts/chatAreaManagedHistory.tsx`, and
  shared send/stop realtime dependency telemetry to
  `frontend/src/components/Section/Layouts/chatAreaRealtimeEvents.ts`, so the
  next default work in that domain should continue from the remaining larger
  section-layout roots instead of re-cutting those new local chat-area owners.
- `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` now
  delegates shared action-spec builders and placement animation helpers to
  `frontend/src/components/ChatWindowing/projectChatBottomDockSurfaceHelpers.tsx`,
  the docked shell to
  `frontend/src/components/ChatWindowing/ProjectChatDockedWindowsSurface.tsx`,
  the floating shell and snap chrome to
  `frontend/src/components/ChatWindowing/ProjectChatFloatingWindowsLayer.tsx`,
  the maximized shell to
  `frontend/src/components/ChatWindowing/ProjectChatMaximizedWindowSurface.tsx`,
  and window lifecycle/focus or placement command orchestration to
  `frontend/src/components/ChatWindowing/projectChatBottomDockWindowLifecycle.ts`,
  so the next default work in that domain should continue from the remaining
  larger front-door surfaces instead of immediately re-cutting those new local
  window owners.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  now delegates the toolbar/header shell plus grouped/ungrouped folder and
  thread-row rendering to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryPanel.tsx`,
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadFolders.tsx`,
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadEntry.tsx`,
  and
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.ts`,
  so the next default work in that domain should continue from the remaining
  larger front-door surfaces instead of immediately re-cutting those new local
  history render owners.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  now delegates hydration cache keys plus retry policy to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.ts`,
  selected-thread hydration retry state, timer cleanup, and blocked-code
  orchestration to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatCoreHydrationSession.ts`,
  runtime native slash-command discovery and authority gating to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandAuthority.ts`,
  permission defaults, blocked-thread copy, and submit readiness/preflight
  gates to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.ts`,
  and conversation filtering, runtime activity, retained-image checks, prompt
  history, latest-chat selection, and branch-source prompt helpers to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatConversationModel.ts`,
  so the next default work in that domain should continue from the remaining
  larger project-chat entry surfaces instead of re-cutting those new local
  owners immediately.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
  now delegates grouped skills search/filter/selection plus the skills split
  shell to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsBrowser.tsx`,
  grouped root-path header rendering to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpPathGroupHeader.tsx`,
  markdown preview/edit rendering to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillMarkdownViewer.tsx`,
  and pure skill preview/save derivation to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsViewModel.ts`,
  so follow-through work in that domain should continue from the remaining
  larger chat/project-AI front doors unless a same-turn slice directly shortens
  the remaining MCP/runtime coordination path.
- `frontend/src/components/Section/Layouts/BrowserArea.tsx` now delegates the
  list/icon/carousel render surface to
  `frontend/src/components/Section/Layouts/BrowserAreaContentView.tsx`, preview
  URL/text-preview cache plus carousel selection to
  `frontend/src/components/Section/Layouts/useBrowserAreaPreviewState.ts`,
  browser root bootstrap, folder/history navigation, recursive filter
  crawling, and saved-search persistence to
  `frontend/src/components/Section/Layouts/useBrowserAreaFolderSession.ts`, and
  preview-kind/extension/staleness helpers to
  `frontend/src/components/Section/Layouts/browserAreaPreviewModel.ts`, so the
  next default work in that domain should continue from the remaining larger
  front-door surfaces instead of immediately re-cutting those new local browser
  owners.
- `frontend/src/plugins/runtime.ts` now delegates shared plugin-host type
  contracts, empty registry-accumulator construction, and section-kind key
  building to `frontend/src/plugins/runtimeHostTypes.ts`, capability gating,
  plugin API-path normalization, realtime payload serialization, and
  pane/section/command or top-nav registration validation to
  `frontend/src/plugins/runtimeHostValidation.ts`, plugin frontend load side
  effects, cleanup and setting-reveal handler registration, plugin host API
  assembly, and module registration to
  `frontend/src/plugins/runtimePluginHost.ts`, stable plugin-list and status
  reference reuse plus sorted section-kind, pane-tab, command, and top-nav
  derivation to `frontend/src/plugins/runtimeDerivedViews.ts`, and plugin
  project-state selector normalization, raw state selection, subscription
  equality, and cloned snapshot shaping to
  `frontend/src/plugins/runtimeProjectStateBridge.ts`, so the next default
  work should continue from the remaining larger UI front doors instead of
  re-cutting those new local runtime owners immediately.
- `frontend/src/components/Chat/ChatInput.tsx` now delegates the composer
  footer/meta row, context-left badge formatting/toggle behavior, runtime
  activity counters/dropdowns, and permission/thinking/search controls to
  `frontend/src/components/Chat/ChatInputMetaControls.tsx`, queued-draft or
  submitted-history session state plus escape clear/restore behavior to
  `frontend/src/components/Chat/chatInputDraftSession.ts`, and the queued
  draft rail shell to
  `frontend/src/components/Chat/ChatInputQueuedDraftStack.tsx`, so the next
  default work in that domain should continue from the remaining higher-value
  front-door surfaces unless a same-turn slice directly shortens one of those
  paths through `ChatInput.tsx`.
- `frontend/src/components/Pages/Home/HomePage.tsx` now delegates project
  gallery/list rendering to
  `frontend/src/components/Pages/Home/homeProjectGallery.tsx`, workspace file
  browser and side-pane shells to
  `frontend/src/components/Pages/Home/homeWorkspaceSidePanes.tsx`,
  selected-project metadata rendering to
  `frontend/src/components/Pages/Home/homeSelectedProjectDetails.tsx`, and
  shared path/count helpers to
  `frontend/src/components/Pages/Home/homeProjectNavigation.ts`, so page-domain
  follow-through should continue from the standalone project/window-space
  surfaces unless a same-turn slice directly shortens one of those new local
  home owners.
- `frontend/src/components/Section/Layouts/TaskBoardArea.tsx` now delegates
  task due or recurrence summary formatting to
  `frontend/src/components/Section/Layouts/taskBoardTaskScheduleModel.ts`,
  schedule dropdown/editor state to
  `frontend/src/components/Section/Layouts/taskBoardTaskSchedule.tsx`,
  task/column mutations plus DnD math to
  `frontend/src/components/Section/Layouts/taskBoardAreaModel.ts`,
  toolbar chrome to
  `frontend/src/components/Section/Layouts/taskBoardAreaToolbar.tsx`,
  task-list rendering to
  `frontend/src/components/Section/Layouts/taskBoardAreaTaskListView.tsx`, and
  kanban lane/resize/task-card rendering to
  `frontend/src/components/Section/Layouts/taskBoardAreaKanbanView.tsx`, so
  future work in that domain should continue from the remaining larger layout
  front doors unless a same-turn follow-through shortens the task-board root
  again.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  now delegates accordion section routing and deployment-mode gating to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsSections.tsx`,
  guardrail persistence to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsGuardrails.tsx`,
  agent-profile CRUD to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsAgentProfiles.tsx`,
  transcription-profile CRUD plus chunk validation to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsTranscriptionProfiles.tsx`,
  prompt-template CRUD to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsPromptTemplates.tsx`,
  and external-agent configuration to
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsExternalAgents.tsx`,
  so chat/project-AI follow-through should return to the remaining larger entry
  surfaces unless one of those extracted settings owners becomes the clearest
  blocker.
- `frontend/src/components/Git/GitGraphOverlay.tsx` now delegates the
  selected-commit summary, expanded commit metadata or file list, and diff
  viewer to
  `frontend/src/components/Git/gitGraphOverlaySelectedCommitPane.tsx`, so the
  remaining git-overlay follow-through should focus on search/indexing,
  decoration models, or virtualized row ownership rather than re-expanding the
  selected-commit surface inside the root.
- Future cleanup should default to the remaining giant render-heavy entry
  surfaces, not to more taxonomic splitting of already smaller
  `state/actions` modules and not to follow-up churn in files like
  `ChatMessages.tsx` unless that directly shortens a larger caller path.
- The remaining high-leverage work is now split between a few unresolved large
  UI front doors and a small set of still-large cross-domain entry surfaces.
  Default to those before revisiting already-improved coordinators such as
  `ChatArea.tsx`, `ChatInput.tsx`, `ProjectChatBottomDock.tsx`,
  `ProjectChatSkillsMcpViewer.tsx`, `ProjectChatHistory.tsx`,
  `TaskBoardArea.tsx`, `RunInstructions.tsx`, or
  `appRegistry.tsx`.
- In practice that means the next default priority order is:
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx`
- Do not pick `FileBrowserPane.tsx`, `BrowserArea.tsx`,
  `ProjectChatBottomDock.tsx`, `ProjectChatSkillsMcpViewer.tsx`,
  `ProjectChatHistory.tsx`, `ChatInput.tsx`, or `ChatMessages.tsx` as a
  default starting point while a same-domain higher-priority front door above
  remains unresolved, unless the slice directly shortens that higher-priority
  path.
- Do not pick a smaller `state/actions` or `state/hooks` split while a
  same-domain 2000+ line UI file remains, unless the lower-level extraction is
  a direct prerequisite for simplifying that larger file.
- Prefer deleting one mixed responsibility from a front-door file over doing a
  second-order split inside an already-extracted helper.
- Do not replace one giant file with another giant helper. New local owners
  should usually stay well below four digits unless a same-slice follow-up is
  already planned and documented.
- Treat the existing thin compatibility facades as acceptable transition
  surfaces for now, but do not add more facade-only hops unless the same slice
  also shrinks one of the top hotspots above.
- `frontend/src/components/Section/Layouts/TaskBoardArea.tsx` is now down to
  about 614 lines with direct boundary coverage in
  `frontend/src/components/Section/Layouts/taskBoardAreaModel.test.ts`. If a
  future slice moves more root ownership there, update that coverage in the
  same change.
- Once a root surface stabilizes, prefer reshaping oversized flat namespaces
  with clearer domain folders over adding any directory `README.md` files.
- Use [frontend-chat-project-ai-windowing-cleanup-plan.md](./frontend-chat-project-ai-windowing-cleanup-plan.md)
  for the shared chat/project-AI/windowing cluster,
  [frontend-panes-and-authoring-cleanup-plan.md](./frontend-panes-and-authoring-cleanup-plan.md)
  for `FileBrowserPane.tsx` and other overview-pane front doors, and
  [frontend-sections-and-params-cleanup-plan.md](./frontend-sections-and-params-cleanup-plan.md)
  for `BrowserArea.tsx` and related layout surfaces instead of keeping that work
  only in this core plan.

## Existing Seams To Preserve

- `frontend/src/state/actions/aiChatStreaming.ts` is now 181 lines and owns the public streaming entrypoint plus managed-chat detail updates, while `frontend/src/state/actions/aiChatStreamingChunkContext.ts` owns placeholder filtering, project/section context resolution, and chatId-to-section lookup caching, `frontend/src/state/actions/aiChatStreamingSectionRouting.ts` owns stream-active tracking, section persistence, tool-preview cleanup, and scope-violation side effects, `frontend/src/state/actions/aiChatStreamingRouting.ts` is now a thin compatibility facade, `frontend/src/state/actions/aiChatStreamingMessageDeltas.ts` owns assistant placeholder creation plus shared text/thinking delta reducers, `frontend/src/state/actions/aiChatStreamingMessageUpserts.ts` owns finalized-assistant merge plus generic message upserts and response-placeholder detection, `frontend/src/state/actions/aiChatStreamingMessages.ts` is now a thin compatibility facade, `frontend/src/state/actions/aiChatStreamingSectionState.ts` owns managed chat-section reconciliation, `frontend/src/state/actions/aiChatStreamingToolCalls.ts` owns shared tool-call placeholder/delta reducers, `frontend/src/state/actions/aiChatStreamingToolPreviews.ts` owns preview-store updates plus app-spec patch preview application, and `frontend/src/state/actions/aiChatStreamingAppDefinition.ts` owns app-definition tool result handling after retiring `frontend/src/state/actions/ai.ts`.
- `frontend/src/state/actions/chatMessageMerge.ts` now owns generic message completeness scoring plus message merge normalization, `frontend/src/state/actions/chatHydrationMerge.ts` now owns hydration-time local-vs-backend chat reconciliation for in-flight overlays, and `frontend/src/state/actions/chatMergeUtils.ts` is now the thin compatibility facade.
- `frontend/src/components/Chat/chatAssistantActivity.ts` now owns assistant activity and timeline derivation, thought-summary labels, activity-only grouping checks, and assistant or tool copy-text builders used by `frontend/src/components/Chat/ChatMessages.tsx`.
- `frontend/src/components/Chat/chatStructuredOutput.tsx` now owns structured output payload inference, diff classification, formatted tool-result text extraction, and the resizable structured-output render surface used by `frontend/src/components/Chat/ChatMessages.tsx`.
- `frontend/src/components/Chat/chatAttachmentPreviewUrls.ts` now owns message attachment collection, attachment URL lookup, stale refresh policy, and preview URL caching used by `frontend/src/components/Chat/ChatMessages.tsx`.
- `frontend/src/components/Chat/chatAttachmentPreviews.tsx` now owns attachment list rendering, preview dialog/media-carousel branching, and attachment text-preview fetch state used by `frontend/src/components/Chat/ChatMessages.tsx`.
- `frontend/src/components/Chat/chatMessageContent.tsx` now owns markdown/code rendering, inline markdown labels, streaming markdown animation wrappers, and conversation-search highlight helpers used by `frontend/src/components/Chat/ChatMessages.tsx`.
- `frontend/src/components/Chat/chatMessageRuntime.tsx` now owns idle-spinner timing, run-duration persistence, timestamps, count-badge animation, activity-label scrambling, ISO timestamp parsing, and activity thought-preview scroll behavior used by `frontend/src/components/Chat/ChatMessages.tsx`.
- `frontend/src/components/Chat/chatAssistantActivityCard.tsx` now owns the assistant activity card shell, timeline row rendering, open-all coordination, and activity-item copy wiring used by `frontend/src/components/Chat/ChatMessages.tsx`.
- `frontend/src/components/Chat/chatCopyText.ts` now owns the shared clipboard-notification helper used by `frontend/src/components/Chat/ChatMessages.tsx` and `frontend/src/components/Chat/chatAssistantActivityCard.tsx`.
- `frontend/src/components/Chat/ChatInputMetaControls.tsx` now owns the
  composer footer/meta row controls, context-left badge formatting and toggle
  behavior, runtime activity counter/dropdown shells, and
  permission/thinking/search controls used by
  `frontend/src/components/Chat/ChatInput.tsx`.
- `frontend/src/components/Chat/chatInputSubmission.ts` now owns slash-command parsing, queued-draft replay snapshots, queued-draft replay signatures, and the submit or replay state machine used by `frontend/src/components/Chat/ChatInput.tsx`.
- `frontend/src/components/Chat/chatInputDraftSession.ts` now owns queued-draft session state, submitted-history selection, escape clear/restore behavior, and queued replay continuity used by `frontend/src/components/Chat/ChatInput.tsx`, while `frontend/src/components/Chat/ChatInputQueuedDraftStack.tsx` now owns the queued-draft rail shell plus row-level restore and keyboard selection behavior.
- `frontend/src/components/Chat/useChatInputDictation.ts` now owns browser/provider dictation availability, recorder lifecycle, provider fallback policy, transcript insertion, and dictation state used by `frontend/src/components/Chat/ChatInput.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.ts` now owns grouped history derivation, master-search filtering/counts, thread ordering, agent badge labels, and placeholder text used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryDnd.ts` now owns project-chat history DnD ids, pointer geometry, drop-target resolution, and thread/group reorder math used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.ts` now owns the delete/undo tooltip copy shared by the extracted history render owners.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadEntry.tsx` now owns history thread rows, unread/working indicators, row action chrome, and thread drop-zone rendering, while `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadFolders.tsx` now owns grouped/ungrouped folder shells, inline group rename, and default new-group naming, and `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryPanel.tsx` now owns the history toolbar/header shell, empty state, and grouped/ungrouped panel composition used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSelection.ts` now owns preferred-engine selection, selected-thread engine reconciliation, engine-switch continuation guards, and LLM-unavailable messaging used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSettingsPopover.tsx` now owns the project-chat settings popover shell, dictation source options, tool quick-links, and activity-default toggles used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatInlineThreadsLayout.ts` now owns inline-thread breakpoint visibility rules, stored-width parsing, viewport/max-width clamping, and resize-transition decisions used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` and `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatInlineThreadsLayout.ts`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatInlineThreadsLayout.ts` now owns overview/chat-container width observation, inline-thread visibility sync, header-host sizing, and resize persistence used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatThreadSession.ts` now owns per-surface draft-thread lifecycle, selected thread-group reconciliation, engine-switch continuation state, and pending-chat continuity used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEmptyState.tsx` now owns workspace-root polling, python-signal probing, create-project starter prompt adaptation, and the empty-chat render shell used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.ts` now owns project-chat hydration cache keys, managed/external runtime fetches, retry scheduling, and retry-cache pruning used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatCoreHydrationSession.ts` now owns selected-thread hydration retry state, timer cleanup, and blocked-code orchestration used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.ts` now owns default permission-mode selection, blocked-thread copy, submit preflight/readiness helpers, and provider-dictation gating used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` and `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandAuthority.ts` now owns runtime native slash-command discovery, authority gating, and recognized/executable slash-command set assembly used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatConversationModel.ts` now owns conversation-search filtering, submitted prompt history, runtime activity derivation, retained-image checks, latest-chat selection, and branch-source prompt helpers used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsViewState.ts` now owns custom slash-command draft reconciliation, namespace-authority gating, and native-command status text, while `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsView.tsx` now owns slash-command engine tabs, agent-run polling, custom-command draft state, and the slash-command form/list shell used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsViewModel.ts` now owns skill preview fallback copy, raw-markdown/save gating, selected-skill draft hydration, and root-path grouping or save-state derivation used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillMarkdownViewer.tsx` now owns the skill markdown accordion shell, raw-vs-rendered preview toggle, save/reset affordances, and CodeMirror preview/edit surface used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsBrowser.tsx` now owns grouped skills search/filter rendering, selection row chrome, split-pane composition, and the extracted markdown-viewer wiring used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpPathGroupHeader.tsx` now owns the per-root path header shell used by the extracted skills browser.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsExternalAgents.tsx` now owns external-agent config selection state, tool-type/run-mode reconciliation, Claude/OpenCode validation, and the external-agent form shell used by `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`.
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.helpers.ts` now owns shared plugin capability/source formatting, config/settings draft serialization, restart planning, and action error shaping, `frontend/src/components/Panes/Overview/Plugins/pluginsPanePluginCard.tsx` now owns per-plugin card render branches, pane/command launch shells, and capability sections, `frontend/src/components/Panes/Overview/Plugins/pluginsPaneConfigEditors.tsx` now owns schema-backed plugin config editing and language-server settings editors, `frontend/src/components/Panes/Overview/Plugins/pluginsPaneConfigSchema.ts` now owns top-level config-schema field derivation plus immutable config updates, and `frontend/src/components/Panes/Overview/Plugins/pluginsPaneShared.tsx` now owns shared action-button, capability-row, and install-summary shells used by `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`.
- `frontend/src/components/Panes/Overview/FileBrowser/fileBrowserPaneTreeModel.ts` now owns file-browser tree flatten/filter/sort helpers, request-ownership tokens, path/date formatting, and Setta-badge metadata helpers, while `frontend/src/components/Panes/Overview/FileBrowser/useFileBrowserPaneTreeData.ts` now owns file-browser root bootstrap, per-folder transport state, recursive-search crawling, preview URL refresh, and navigation tree view state used by `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`.
- `frontend/src/components/Panes/Overview/FileBrowser/fileBrowserPaneListSurface.tsx` now owns the file-browser header shell, virtualized row surface, local column-width sizing, and row-level drag/drop or tooltip rendering, while `frontend/src/components/Panes/Overview/FileBrowser/fileBrowserPaneSearchFilter.tsx` now owns the filter input, save-search action, and search-scope popover used by `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx` and `frontend/src/components/Section/Layouts/BrowserArea.tsx`.
- `frontend/src/components/Section/Layouts/BrowserAreaContentView.tsx` now owns the browser section list/icon/carousel render surface, `frontend/src/components/Section/Layouts/useBrowserAreaPreviewState.ts` now owns browser preview URL loading, text-preview fetch state, and carousel selection, and `frontend/src/components/Section/Layouts/browserAreaPreviewModel.ts` now owns preview-kind, extension-badge, file-size, and stale-preview helpers used by `frontend/src/components/Section/Layouts/BrowserArea.tsx`.
- `frontend/src/components/Section/Layouts/useBrowserAreaFolderSession.ts` now owns browser root bootstrap, folder/history navigation, recursive filter crawling, path completion state, and saved-search persistence used by `frontend/src/components/Section/Layouts/BrowserArea.tsx`.
- `frontend/src/components/ChatWindowing/projectChatWindowShortcuts.ts` now owns dock-specific keyboard shortcut parsing, editable-target gating, and keydown listener wiring used by `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`.
- `frontend/src/components/ChatWindowing/projectChatBottomDockLayout.ts` now owns dock strip reservation math, visible dock-window selection, width-fitting, and minimized-pill display-mode calculations used by `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`.
- `frontend/src/components/ChatWindowing/projectChatDockResize.ts` now owns dock preview width/height state, stale-preview pruning, and dock-resize pointer-session handling used by `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`.
- `frontend/src/components/ChatWindowing/projectChatFloatingInteractions.ts` now owns floating preview bounds state, snap-preview state, viewport guardrails, and floating drag/resize or snap-resize pointer-session handling used by `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`.
- `frontend/src/components/ChatWindowing/projectChatBottomDockPillStrip.tsx` now owns minimized-pill strip responsiveness, cycle state, manager-menu shell, and strip layout animation bookkeeping used by `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`.
- `frontend/src/components/ChatWindowing/projectChatBottomDockSurfaceHelpers.tsx` now owns shared dock-window action-spec builders, placement animation classes, and shared dock/floating/maximized style helpers used by `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`.
- `frontend/src/components/ChatWindowing/ProjectChatDockedWindowsSurface.tsx`, `frontend/src/components/ChatWindowing/ProjectChatFloatingWindowsLayer.tsx`, and `frontend/src/components/ChatWindowing/ProjectChatMaximizedWindowSurface.tsx` now own the docked, floating, and maximized render shells that `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` composes.
- `frontend/src/components/ChatWindowing/projectChatBottomDockWindowLifecycle.ts` now owns dock window create/open/minimize/close/dock/maximize/restore commands, dock-cycle focus behavior, and enter/exit animation bookkeeping used by `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`.
- `frontend/src/components/ChatWindowing/projectChatWindowShell.tsx` now owns shared section/project window shell rendering, `UnifiedChatSurface` vs `GitGraphWindowContent` body selection, and header-action adaptation used by `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`.
- `frontend/src/state/actions/chatBranchState.ts` now owns branch bootstrap, active-branch fallback, and incoming-message sync, `frontend/src/state/actions/chatBranchEditing.ts` now owns edited-message history truncation plus child-branch creation, `frontend/src/state/actions/chatBranchIndexState.ts` now owns branch-index derivation from section branch records, and `frontend/src/state/actions/chatBranches.ts` is now the thin compatibility facade.
- `frontend/src/state/actions/aiHydrationOutcome.ts` now owns managed/external hydration route probes plus outcome classification, `frontend/src/state/actions/aiHydrationChatState.ts` now owns managed/external chat-detail reconciliation plus app-generation hydration, `frontend/src/state/actions/aiHydrationSectionState.ts` now owns managed/external chat-section reconciliation plus persistence sync, `frontend/src/state/actions/aiHydrationApply.ts` is now the thin apply-orchestration facade, and `frontend/src/state/actions/aiHydration.ts` is now the thin public hydration facade.
- `frontend/src/state/actions/chatHistoryEntries.ts` now owns thread-entry derivation and chat label normalization, `frontend/src/state/actions/chatHistoryProvenance.ts` now owns canonical plus scoped chat provenance resolution, `frontend/src/state/actions/chatHistoryShared.ts` now owns shared run filtering/grouping helpers, `frontend/src/state/actions/chatHistoryTypes.ts` now owns shared history filter/provenance types, and `frontend/src/state/actions/chatHistory.ts` is now a thin compatibility facade.
- `frontend/src/state/actions/agenticEdgeConnections.ts` now owns agentic-edge handle normalization, connection validation, and kind resolution, `frontend/src/state/actions/agenticEdgeShapeMutations.ts` now owns optimistic create/update shape mutations, `frontend/src/state/actions/agenticEdgeSelectionMutations.ts` now owns selection/delete flows, and `frontend/src/state/actions/agenticEdgeMutations.ts` plus `frontend/src/state/actions/agenticEdges.ts` are now thin compatibility facades.
- `frontend/src/state/actions/edgeHandleKeys.ts` now owns pure edge-handle key derivation, `frontend/src/state/actions/edgeHandleRegistration.ts` now owns registry/shared-element registration writes, `frontend/src/state/actions/edgeHandlePositionState.ts` now owns direct handle-position recompute/update helpers, `frontend/src/state/actions/edgeHandlePositionScheduler.ts` now owns RAF-batched section-scoped position refreshes, and `frontend/src/state/actions/edgeHandles.ts` is now the thin compatibility facade.
- `frontend/src/state/actions/uiSettingRevealMutationCapture.ts` now owns
  reveal snapshot capture plus failure-result assembly,
  `frontend/src/state/actions/uiSettingRevealMutationApply.ts` now owns
  high-level reveal mutation orchestration plus mismatch/failure handling,
  `frontend/src/state/actions/uiSettingRevealMutationLeaseLifecycle.ts` now
  owns mutation-lease rollback/finalization,
  `frontend/src/state/actions/uiSettingRevealMutationLock.ts` now owns
  serialized reveal mutation locking, while
  `frontend/src/state/actions/uiSettingRevealMutations.ts` is now the thin
  compatibility facade,
  `frontend/src/state/actions/uiSettingRevealMutationRecordRestore.ts` now
  owns shared owned-record revert helpers,
  `frontend/src/state/actions/uiSettingRevealMutationLocalStorageRestore.ts`
  now owns local-storage rollback,
  `frontend/src/state/actions/uiSettingRevealMutationProjectStateRestore.ts`
  now owns project-state active-section rollback,
  `frontend/src/state/actions/uiSettingRevealMutationRestore.ts` is now the
  thin restore orchestrator, and
  `frontend/src/state/actions/uiSettingRevealMutationSnapshots.ts` is now the
  thin compatibility facade.
- `frontend/src/state/actions/shareSessionStoredState.ts` now owns
  share-session cookie or session-storage reads, writes, store hydration,
  cached-session reuse, and reset behavior,
  `frontend/src/state/actions/shareSessionBootstrap.ts` now owns
  share-session ensure or initialize flows for deployment bootstrap and
  recovery, `frontend/src/state/actions/shareProjectConfig.ts` now owns share
  project-config load/retry transport plus post-load hydration side effects,
  and `frontend/src/state/actions/shareSessionState.ts` plus
  `frontend/src/state/actions/share.ts` are now thin compatibility facades.
- `frontend/src/state/actions/runCodeExecution.ts` now owns runnable-section
  guards, generated-python normalization, snapshot-mode resolution,
  attached-terminal lookup, draw snapshot collection, and backend run
  transport, `frontend/src/state/actions/runCodeControls.ts` now owns main
  run-button once or continuous toggles plus subprocess stop transport, and
  `frontend/src/state/actions/runOrImportCode.ts` is now the thin
  compatibility facade.
- `frontend/src/state/actions/activeSectionSync.ts` now owns durable
  active-section selection scheduling, flush, backend send, and authoritative
  restore behavior, `frontend/src/state/actions/activeSectionCommands.ts` now
  owns higher-level active-section commands such as clear, prune-for-view-mode,
  select-all, and top-level non-group selection, and
  `frontend/src/state/actions/activeSections.ts` is now the thin
  compatibility facade.
- `frontend/src/state/actions/aiAgentRuns.ts` now owns agent-run loading, retries, and authoritative update paths.
- `frontend/src/state/actions/aiChatSubmissionMessages.ts` now owns optimistic new-message submission, `frontend/src/state/actions/aiChatSubmissionEdits.ts` now owns edited-message pending lifecycle plus managed-section chatId reset or restore, `frontend/src/state/actions/aiChatSubmissionResponse.ts` now owns shared request send plus post-submit hydration refresh, `frontend/src/state/actions/aiChatSubmission.ts` is now a thin compatibility facade, `frontend/src/state/actions/aiChatSubmissionRequestPayload.ts` now owns execution settings, user-message construction, next-message lookup, and raw request-payload builders, `frontend/src/state/actions/aiChatSubmissionPayload.ts` now owns app-generation request metadata plus edited-message request preparation, and `frontend/src/state/actions/aiChatSubmissionEngineResolution.ts` now owns edited-chat engine resolution plus agent-run-backed fallback lookup.
- `frontend/src/state/actions/aiChatControls.ts`, `frontend/src/state/actions/aiExternalAgentStop.ts`, `frontend/src/state/actions/aiChatStopState.ts`, and `frontend/src/state/actions/aiExternalAgentResponses.ts` now own public stop orchestration, external stop/recovery, local stop snapshot/reconciliation, and external approval/question responses.
- `frontend/src/state/actions/aiChatState.ts` now owns chat-detail and pending-surface detail writes shared by submission, hydration, and controls.
- `frontend/src/state/actions/aiPendingChatAppGenerationState.ts` now owns pending-surface app-generation detail reads/writes, `frontend/src/state/actions/aiPendingChatMessageLifecycle.ts` now owns pending draft initialization, seed, clear, commit, and finalize flows, `frontend/src/state/actions/aiPendingChatMessageMutations.ts` now owns optimistic pending-surface and materialized-chat user-message apply or rollback flows plus app-generation detail updates, `frontend/src/state/actions/aiPendingChatMessageState.ts` is now the thin message-level compatibility facade, and `frontend/src/state/actions/aiPendingChatState.ts` is now a thin compatibility facade.
- `frontend/src/state/actions/aiInterruptedAssistantMessages.ts` now owns interrupted assistant message tracking and snapshot restoration.
- `frontend/src/state/actions/aiLLMConfiguration.ts` now owns LLM config loading/saving, `frontend/src/state/actions/aiManagedApiKeyState.ts` now owns managed API-key snapshot/load behavior, `frontend/src/state/actions/aiManagedApiKeyPersistence.ts` now owns queued managed API-key persistence plus conflict resolution, and `frontend/src/state/actions/aiManagedApiKeys.ts` is now the thin compatibility facade.
- `frontend/src/state/actions/aiConfigurationCatalogLoads.ts` now owns AI settings/resource catalog fetches and hydration, `frontend/src/state/actions/aiConfigurationCatalogState.ts` now owns shared AI catalog store writes, `frontend/src/state/actions/aiConfigurationCatalogMutations.ts` now owns catalog mutation transport, and `frontend/src/state/actions/aiConfigurationCatalogs.ts` is now a thin compatibility surface.
- `frontend/src/state/actions/artifactStoreUpdates.ts` now owns incoming
  websocket/store artifact reconciliation plus decoded-image cleanup,
  `frontend/src/state/actions/artifactSyncQueue.ts` now owns draw artifact save
  queueing plus debounced/forced sync transport, and
  `frontend/src/state/actions/artifacts.ts` is now a 7-line compatibility
  facade.
- `frontend/src/state/hooks/artifactTransport.ts` now owns cached
  image/chart/brush/transform load transport plus raw-image decode,
  `frontend/src/state/hooks/drawAreaArtifacts.ts` now owns draw-area artifact
  ref selection, load planning, and revision-stamp hooks, and
  `frontend/src/state/hooks/artifacts.ts` is now an 18-line compatibility
  facade.
- `frontend/src/state/actions/aiTranscriptionAudio.ts` now owns provider dictation decode, mono PCM conversion, resample, and realtime payload preparation.
- `frontend/src/state/actions/aiTranscriptionUpload.ts` now owns provider dictation session start/append/stop/cancel orchestration plus transcript assembly.
- `frontend/src/state/actions/aiTranscription.ts` is now a thin compatibility facade over those narrower dictation owners.
- `frontend/src/state/actions/aiTranscriptionSessions.ts` now owns provider session transport, request-error handling, and chunk-size policy.
- `frontend/src/state/actions/aiTranscriptionProfiles.ts` now owns transcription-profile loading, websocket/store snapshot updates, and CRUD.
- `frontend/src/state/actions/stateMachineDraftValidationGraph.ts` now owns machine-section and workflow-edge graph reads, `frontend/src/state/actions/stateMachineDraftValidationWarnings.ts` now owns draft warning detail/result assembly, and `frontend/src/state/actions/stateMachineDraftValidation.ts` now owns traversal/orchestration for workflow draft validation.
- `frontend/src/state/actions/projectChatWindowingWriteState.ts` now owns
  layout-write permissions, current-windowing store access, optimistic apply
  helpers, and local active-chat sync, while
  `frontend/src/state/actions/projectChatWindowingWriteQueue.ts` now owns
  pending-mutation queueing plus write barriers and flush coordination,
  `frontend/src/state/actions/projectChatWindowingWritePublish.ts` now owns
  authoritative publish/replay plus tracked response/send helpers,
  `frontend/src/state/actions/projectChatWindowingWriteSync.ts` now owns
  explicit sync/flush helpers, and
  `frontend/src/state/actions/projectChatWindowingWritePipeline.ts` is now the
  thin serialized write orchestrator, reducing
  `frontend/src/state/actions/projectChatWindowingWrites.ts` to a thinner
  public mutation facade.
- `frontend/src/state/actions/sections/createSections.ts` now owns top-level
  section creation commands plus empty-space add actions,
  `frontend/src/state/actions/sections/createSectionCatalogTypes.ts` now owns
  shared section creation menu types,
  `frontend/src/state/actions/sections/createSectionCatalogSectionGroups.ts`
  now owns static section/code/artifact/workflow/other presets,
  `frontend/src/state/actions/sections/createSectionCatalogControlGroups.ts`
  now owns metacontrol/embed presets,
  `frontend/src/state/actions/sections/createSectionCatalogGroupAssembly.ts`
  now owns ordered base group assembly,
  `frontend/src/state/actions/sections/createSectionCatalogStatic.ts` is now
  the thin compatibility facade, and
  `frontend/src/state/actions/sections/createSectionCatalog.ts` now owns
  hook-time singleton/codegen/plugin gating for `useCreateSectionsList`,
  `frontend/src/state/actions/sections/createSectionsHelper.ts` now owns the
  narrower post-create command path for
  `createTopLevelSectionFromImplSpecs`,
  `frontend/src/state/actions/sections/createSectionPlacement.ts` now owns
  smart placement context and empty-space placement helpers,
  `frontend/src/state/actions/sections/createSectionFileOpenShared.ts` now owns
  opened-file naming, existing-section reuse lookup, and shared focus/rename
  helpers, `frontend/src/state/actions/sections/createSectionFileOpenCommands.ts`
  now owns per-impl file-open commands,
  `frontend/src/state/actions/sections/createSectionFileDropRouting.ts` now
  owns dropped-file routing, and
  `frontend/src/state/actions/sections/createSectionFileOpeners.ts` is now a
  thin compatibility facade over those owners, while
  `frontend/src/state/actions/sections/createSectionImplDefaults.ts` now owns
  per-impl create defaults such as text-block display-mode normalization,
  reducing `frontend/src/state/actions/sections/createSections.ts` to 140
  lines.
- `frontend/src/state/actions/sections/moveSectionQueries.ts` now owns
  attached-terminal route selection, section-type move checks, and
  parent-resolution reads, `frontend/src/state/actions/sections/moveSectionParentState.ts`
  now owns in-state parent cleanup plus move-into-parent reducers,
  `frontend/src/state/actions/sections/moveSectionPaneState.ts` now owns pane
  node plus top-level layout updates,
  `frontend/src/state/actions/sections/moveSectionState.ts` is now the thin
  in-state composition facade, and
  `frontend/src/state/actions/sections/moveSections.ts` remains the thin
  optimistic backend command facade.
- `frontend/src/state/actions/stateMachineEdgeCanonicalization.ts` now owns
  workflow handle normalization and shared-chat workflow port canonicalization,
  `frontend/src/state/actions/stateMachineEdgeGraph.ts` now owns section-type
  reads plus machine-group resolution, and
  `frontend/src/state/actions/stateMachineEdgeMachineGroupMerge.ts` now owns
  merge snapshot/apply/restore helpers, while
  `frontend/src/state/actions/stateMachineEdgeConnections.ts` now owns
  workflow connection validation and edge construction, reducing
  `frontend/src/state/actions/stateMachineEdgeConnections.ts` to 165 lines.
- `frontend/src/state/actions/projectChatThreadGroupCrud.ts` now owns
  persisted project-chat thread group create/rename behavior,
  `frontend/src/state/actions/projectChatThreadGroupOrdering.ts` now owns
  collapse/pin/reorder behavior, and
  `frontend/src/state/actions/projectChatThreadGroupAssignments.ts` now owns
  assignment/delete behavior, while
  `frontend/src/state/actions/projectChatThreadGroupMutations.ts` is now a
  thin compatibility re-export surface. `frontend/src/state/actions/projectChatThreadMutations.ts`
  still owns per-thread viewed, pin, reorder, and delete behavior,
  `frontend/src/state/actions/projectChatThreadStorageUndoStack.ts` now owns
  the local delete undo stack plus per-project lookup, and
  `frontend/src/state/actions/projectChatThreadStorageUndoApply.ts` now owns
  thread/group inverse restoration writes, with
  `frontend/src/state/actions/projectChatThreadStorageUndo.ts` as the thin
  compatibility surface and
  `frontend/src/state/actions/projectChatThreads.ts` as the compatibility
  surface.
- `frontend/src/state/actions/gitGraphRefreshState.ts` now owns git graph/log
  refresh plus initial page loading,
  `frontend/src/state/actions/gitGraphPaginationRequests.ts` now owns
  load-more request gating plus transport orchestration,
  `frontend/src/state/actions/gitGraphPaginationResults.ts` now owns
  appended-page merge plus load-more error writes,
  `frontend/src/state/actions/gitGraphPaginationState.ts` is now the thin
  compatibility facade,
  `frontend/src/state/actions/gitGraphFilterState.ts` now owns graph
  filter-text writes,
  `frontend/src/state/actions/gitGraphRequestTracker.ts` now owns shared
  request-id sequencing plus stale-request suppression,
  `frontend/src/state/actions/gitGraphLoadState.ts` is now the thin
  compatibility facade,
  `frontend/src/state/actions/gitGraphOverlayActions.ts` now owns git graph
  overlay boot, graph-state seeding, manual refresh, and all-refs toggling,
  and `frontend/src/state/actions/gitGraphLog.ts` is now the thin
  compatibility facade. `frontend/src/state/actions/gitGraphSelection.ts`
  still owns selected commit clearing plus commit details/file-diff selection,
  and `frontend/src/state/actions/gitGraphState.ts` still owns reusable graph
  state builders and current project-config lookup, with
  `frontend/src/state/actions/gitGraph.ts` remaining the compatibility surface
  and keeping `frontend/src/state/actions/git.ts` as a thin git action index.
- `frontend/src/state/actions/gitStatusState.ts` now owns git status refresh
  plus diff availability derivation,
  `frontend/src/state/actions/gitDiffOverlayActions.ts` now owns diff overlay
  opening, diff hydration, diff-mode switching, and overlay close behavior,
  and `frontend/src/state/actions/gitStatusAndDiff.ts` is now the thin
  compatibility facade.
- `frontend/src/state/actions/sectionProjectStateSnapshot.ts` now owns backend
  project-state reconciliation, pending-op replay, comparable-state
  short-circuiting, and node-map derivation for authoritative project
  snapshots, `frontend/src/state/actions/sectionProjectStateActiveSync.ts`
  now owns active-section UI reconciliation from authoritative project
  snapshots, `frontend/src/state/actions/sectionProjectStateViewportSync.ts`
  now owns React Flow viewport sync plus fit-view planning, and
  `frontend/src/state/actions/sectionProjectStateWindowingSync.ts` now owns
  authoritative project-chat windowing recording plus ephemeral
  reconciliation, reducing `frontend/src/state/actions/sectionProjectStateSync.ts`
  to a thin orchestration facade and leaving
  `frontend/src/state/actions/sectionInfos.ts` at 1840 lines.
- `frontend/src/state/actions/lspDiagnosticsState.ts` now owns
  formatter-aware diagnostics merge rules plus diagnostics snapshot
  publication to the editor stores, `frontend/src/state/actions/lspDiagnosticsCommands.ts`
  now owns mute and suppressed-code transport commands for code-section
  diagnostics, and `frontend/src/state/actions/lspDiagnostics.ts` is now the
  thin compatibility facade.
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
- `frontend/src/state/actions/sectionDisplayStructure.ts` now owns top-level
  display selection, displayed-child tree derivation, node-map creation, and
  DnD child reset that previously lived in
  `frontend/src/state/actions/sectionInfos.ts`, while
  `frontend/src/state/actions/sectionViewModeVisibility.ts` now owns active
  view-mode lookup, visibility/render queries, and ancestor-visibility reads,
  and `frontend/src/state/actions/sectionDisplayQueries.ts` is now the thin
  compatibility facade, reducing `frontend/src/state/actions/sectionInfos.ts`
  further to 457 lines for the remaining streaming merge, shown-param,
  ancestry, and tool-preview cleanup surface.
- `frontend/src/state/actions/sectionStreamingMerge.ts`,
  `frontend/src/state/actions/sectionShownParams.ts`,
  `frontend/src/state/actions/sectionHierarchy.ts`, and
  `frontend/src/state/actions/sectionToolArgumentPreview.ts` now own the last
  streaming merge, shown-param, ancestry, and tool-preview cleanup helpers that
  used to live in `frontend/src/state/actions/sectionInfos.ts`, reducing
  `frontend/src/state/actions/sectionInfos.ts` to a 67-line compatibility
  facade.
- `frontend/src/state/actions/sectionEffectiveImplCore.ts` now owns effective
  section/code-object derivation, cache invalidation, and low-level
  entity lookups, while `frontend/src/state/actions/sectionEffectiveImplSelectors.ts`
  now owns typed current-section/current-code-object selectors, while
  `frontend/src/state/actions/sectionFeatureSelectors.ts` now owns managed-chat
  checks and param display-name helpers, reducing
  `frontend/src/state/actions/sectionEffectiveImpls.ts` to a 29-line
  compatibility facade; meanwhile,
  `frontend/src/state/actions/sectionStructureQueries.ts` now owns section
  orientation, section type, section-child queries, and the shared base-code
  type guard, `frontend/src/state/actions/sectionTerminalAttachmentQueries.ts`
  now owns terminal attachment and embedded-terminal queries, while
  `frontend/src/state/actions/sectionLayoutQueries.ts` is now the thin
  compatibility facade and
  `frontend/src/state/actions/sectionEffectiveImplMutations.ts` now owns the
  local impl mutation helpers for section/code-object writes.
- `frontend/src/state/hooks/sectionSizingPolicyDims.ts` now owns section
  sizing-policy reads plus size-mode resolution,
  `frontend/src/state/hooks/sectionMinMaxDims.ts` now owns the measured
  min/max dimension derivation path,
  `frontend/src/state/hooks/sectionScrollability.ts` now owns the shared
  overflow observer, and `frontend/src/state/hooks/sectionAspectRatioSizing.ts`
  now owns draw/social/media aspect-ratio sizing behavior, reducing
  `frontend/src/state/hooks/sectionSizes.ts` to a 13-line compatibility
  surface.
- `frontend/src/state/actions/sections/sectionSizeGeometry.ts` now owns pure
  section sizing math, resize-direction helpers, and auto-size promotion
  helpers, `frontend/src/state/actions/sections/sectionSizeState.ts` now owns
  local section-size writes plus width propagation,
  `frontend/src/state/actions/sections/sectionSizePersistence.ts` now owns
  optimistic section-size persistence plus raw `setSectionSizes` transport, and
  `frontend/src/state/actions/sections/sectionSizes.ts` is now the thin
  compatibility facade.
- `frontend/src/state/actions/params/paramMoveSelectionContext.ts` now owns
  selected-section resolution, visible-param gating, and movement or
  unindent context reads, `frontend/src/state/actions/params/paramMoveOrdering.ts`
  now owns parent-child ordering plus contiguous visible-sibling grouping,
  and `frontend/src/state/actions/params/paramMoveQueries.ts` is now the thin
  compatibility facade,
  `frontend/src/state/actions/params/paramMoveMutations.ts` now owns
  optimistic param reparent/reorder application plus shown-param sync,
  `frontend/src/state/actions/params/paramSelectionCommands.ts` now owns
  single-param drag/drop selection normalization,
  `frontend/src/state/actions/params/paramMoveCommands.ts` now owns optimistic
  backend dispatch for direct moves plus indent or unindent commands,
  `frontend/src/state/actions/params/paramMoveKeyboardCommands.ts` now owns
  visible-sibling keyboard move planning and grouped move dispatch, and
  `frontend/src/state/actions/params/moveParams.ts` is now the thin
  compatibility facade.
- `frontend/src/state/actions/websocketIncomingMessages.ts` now owns frontend
  websocket payload parsing plus feature-specific dispatch,
  `frontend/src/state/actions/websocketIncomingProjectSnapshots.ts` now owns
  project/app snapshot routing, and
  `frontend/src/state/actions/websocketIncomingUISettingRevealAck.ts` now owns
  inbound `UISettingReveal` ACK fallback ids plus malformed-status
  construction, `frontend/src/state/actions/websocketIncomingUISettingRevealExecution.ts`
  now owns inbound reveal execution-context creation plus mismatch
  normalization, and `frontend/src/state/actions/websocketIncomingUISettingReveal.ts`
  is now the thin orchestration facade, reducing the old websocket surface
  into a thin `websocketReceive.ts` facade plus
  `frontend/src/state/actions/websocketLifecycleState.ts` for lifecycle target
  tracking and open-status coordination,
  `frontend/src/state/actions/websocketLifecycleHandlers.ts` for active-socket
  listener wiring plus reconnect or recovery handling,
  `frontend/src/state/actions/websocketLifecycle.ts` for the public transport
  open entrypoint,
  `frontend/src/state/actions/websocketBootstrap.ts` for socket-open
  bootstrap, `frontend/src/state/actions/websocketAuthRecovery.ts` for auth
  recovery, `frontend/src/state/actions/websocketShareSessionRecovery.ts` for
  share-session heartbeat/recovery,
  `frontend/src/state/actions/websocketRealtimeDispatch.ts` for outbound
  realtime dependency events plus literal sends,
  `frontend/src/state/actions/websocketRealtimeBinary.ts` for binary send,
  oversize upload fallback, and warning throttling, and
  `frontend/src/state/actions/websocketRealtime.ts` as the thin compatibility
  facade.
- `frontend/src/state/actions/windowSpaceQueries.ts` now owns saved
  window-space sort helpers, project-config lookup, layout-mutation gating,
  and next-name derivation,
  `frontend/src/state/actions/windowSpaceMutationPersistence.ts` now owns saved
  window-space sort/name/delete mutations plus optimistic persistence and
  layout rollback,
  `frontend/src/state/actions/windowSpaceCrud.ts` is now the thin
  compatibility facade over those narrower owners,
  `frontend/src/state/actions/windowSpaceSave.ts` now owns current-floating-window
  save flow plus authoritative pre-save sync,
  `frontend/src/state/actions/windowSpaceSnapshotCapture.ts` owns floating
  snapshot building,
  `frontend/src/state/actions/windowSpaceSnapshotRestoreConversion.ts` owns
  restore conversion, `frontend/src/state/actions/windowSpaceSnapshotRestoreSectionBindings.ts`
  owns restored section-binding dedupe,
  `frontend/src/state/actions/windowSpaceSnapshotRestoreInstanceIds.ts` owns
  restored instance-id allocation and ordering helpers,
  `frontend/src/state/actions/windowSpaceSnapshotRestore.ts` is now the thin
  compatibility facade, and `frontend/src/state/actions/windowSpacePersistence.ts`
  is now the thin compatibility facade,
  `frontend/src/state/actions/windowSpaceWorkspaceRestoreReuse.ts`
  now owns floating-window reuse plus owner-key/supersede matching,
  `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts` now owns
  restored-instance remapping and deduped restore merge policy, and
  `frontend/src/state/actions/windowSpaceWorkspaceRestoreLayout.ts` now owns
  workspace-restore planning plus the combined next-windowing result,
  `frontend/src/state/actions/windowSpaceWorkspaceRestoreVisibility.ts` now owns
  restored git-pane visibility reconciliation, and
  `frontend/src/state/actions/windowSpaceWorkspaceRestorePlan.ts` is now a thin
  facade over those restore helpers, while
  `frontend/src/state/actions/windowSpaceProjectChatThreadRestore.ts` now owns
  deployment-policy restore gating plus saved project-chat thread rebound,
  reducing `frontend/src/state/actions/windowSpaces.ts` to 65 lines as a thin
  workspace-restore orchestrator.
- `frontend/src/state/actions/projectChatWindowingDefaultBounds.ts` now owns
  pure floating and docked default-bounds helpers,
  `frontend/src/state/actions/projectChatWindowingStateNormalization.ts` now
  owns pure windowing order and z-index normalization, and
  `frontend/src/state/actions/projectChatWindowingNormalization.ts` is now the
  thin compatibility re-export surface,
  `frontend/src/state/actions/projectChatWindowingSelectors.ts` now owns
  section-binding and visible-window selector reads,
  `frontend/src/state/actions/projectChatWindowingInstanceCreation.ts` now
  owns window-instance creation, next-instance-id allocation, and runtime
  floating-bounds resolution, `frontend/src/state/actions/projectChatWindowingInstanceUpdates.ts`
  now owns shared per-window normalization, z-index lookup, and update
  helpers, `frontend/src/state/actions/projectChatWindowingInstanceState.ts`
  is now the thin compatibility facade,
  `frontend/src/state/actions/projectChatWindowingPlacementState.ts` now owns
  placement/focus reducers, `frontend/src/state/actions/projectChatWindowingBoundsState.ts`
  now owns dock-fraction and bounds reducers, `frontend/src/state/actions/projectChatWindowingLayoutState.ts`
  is now a thin compatibility surface over the instance creation/update,
  placement, and bounds owners, `frontend/src/state/actions/projectChatWindowingSectionState.ts`
  now owns section exposure, section binding, and section/window mode
  transition reducers, `frontend/src/state/actions/projectChatWindowingMetadataState.ts`
  now owns title/chat-id reducers, and
  `frontend/src/state/actions/projectChatWindowingState.ts` is now the thin
  compatibility facade over those narrower state owners,
  `frontend/src/state/actions/projectChatWindowingCanvasSurface.ts` now owns
  DOM surface lookup plus canvas boot position/size resolution,
  `frontend/src/state/actions/projectChatWindowingCanvasBoot.ts` now owns the
  section boot flow and rebind orchestration,
  `frontend/src/state/actions/projectChatWindowingTrackedGitPane.ts`
  now owns tracked git-pane graph window reuse/maximize/title coordination,
  `frontend/src/state/actions/projectChatWindowLifecycleCommands.ts` now owns
  public window lifecycle/focus commands,
  `frontend/src/state/actions/projectChatWindowLayoutCommands.ts` now owns
  public placement/dock-fraction/bounds commands plus tracked git-pane cleanup
  around layout writes, and
  `frontend/src/state/actions/projectChatWindowCommands.ts` is now a thin
  compatibility surface,
  `frontend/src/state/actions/projectChatWindowMetadataCommands.ts` now owns
  title/chat-id commands plus current-windowing reads, and
  `frontend/src/state/actions/projectChatWindowSectionCommands.ts` now owns
  section exposure, undock, and section/window mode transition commands,
  `frontend/src/state/actions/projectChatWindowingWriteState.ts` now owns
  layout-write permissions plus optimistic apply helpers,
  `frontend/src/state/actions/projectChatWindowingWriteQueue.ts` now owns
  pending-mutation queueing plus write barriers and flush coordination,
  `frontend/src/state/actions/projectChatWindowingWritePublish.ts` now owns
  authoritative publish/replay plus tracked response/send helpers,
  `frontend/src/state/actions/projectChatWindowingWriteSync.ts` now owns
  explicit sync/flush helpers, and
  `frontend/src/state/actions/projectChatWindowingWritePipeline.ts` now owns
  thin serialized write orchestration, and
  `frontend/src/state/actions/projectChatWindowingWrites.ts` is now a thin
  public mutation facade, reducing
  `frontend/src/state/actions/projectChatWindowing.ts` to a 28-line
  compatibility surface.
- `frontend/src/state/hooks/terminals/terminal.ts` is down to 248 lines and now
  delegates terminal websocket/session bootstrap and transport wiring to
  `frontend/src/state/hooks/terminals/terminalSessionTransport.ts`, cached
  session reuse plus resize/lifecycle bookkeeping to
  `frontend/src/state/hooks/terminals/terminalSessions.ts`, and xterm
  fit/fallback/reflow behavior to
  `frontend/src/state/hooks/terminals/terminalFit.ts`.
- `frontend/src/state/actions/keyActivations.ts` is now a listener
  delegates pressed-key bookkeeping and stale-key cleanup to
  `frontend/src/state/actions/keyActivationPressedKeys.ts`, shortcut-info
  normalization plus keep-key-down coordination to
  `frontend/src/state/actions/keyActivationShortcutInfo.ts`, the shortcut
  command registry plus React Flow key-mode toggles to
  `frontend/src/state/actions/keyActivationCommands.ts`, grouped shortcut
  registration ownership to
  `frontend/src/state/actions/keyShortcutNavigationRegistrations.ts`,
  `frontend/src/state/actions/keyShortcutTooltipRegistrations.ts`,
  `frontend/src/state/actions/keyShortcutWorkspaceRegistrations.ts`, the thin
  compatibility surface to
  `frontend/src/state/actions/keyShortcutRegistrationGroups.ts`, and the
  remaining Tab-vs-param binding and registry composition to
  `frontend/src/state/actions/keyShortcutRegistrations.ts`, shortcut
  parsing/event-code normalization/matching to
  `frontend/src/state/actions/keyShortcutMatching.ts`, editable-target and
  input-ignore policy to
  `frontend/src/state/actions/keyShortcutInputPolicy.ts`,
  `frontend/src/state/actions/keyShortcutUtils.ts` as the thin compatibility
  facade, and `Tab`/`Escape`, section-selection, and param-shortcut dispatch
  behavior to `frontend/src/state/actions/keyActivationHandlers.ts`.
- `frontend/src/utils/focusManager.ts` is down to a thin compatibility surface
  and now delegates tab-scope registration/focus tracking to
  `frontend/src/utils/focusManagerRegistry.ts`, focusable-element/canvas-order
  helpers to `frontend/src/utils/focusManagerElements.ts`, generic scope
  traversal to `frontend/src/utils/focusManagerNavigation.ts`, and
  section/canvas focus behavior to
  `frontend/src/utils/focusManagerSections.ts`.
- `frontend/src/components/Utils/Resizable/CustomResizable.tsx` is down to 246
  lines and now delegates resize lifecycle, auto-size promotion, and
  resize-event emission to `useCustomResizableBehavior.ts`, pure clamp and
  auto-clamp plus auto-only size-mode update derivation to
  `customResizableSizing.ts`, handle chrome plus direction parsing to
  `customResizableChrome.ts`, pure section sizing math and resize-direction
  helpers to `state/actions/sections/sectionSizeGeometry.ts`, local size writes
  plus width propagation to `state/actions/sections/sectionSizeState.ts`, and
  optimistic section-size persistence to
  `state/actions/sections/sectionSizePersistence.ts`.
- `frontend/src/state/actions/stateMachineEdges.ts` is down to a 12-line
  compatibility entrypoint and now delegates workflow handle normalization to
  `stateMachineEdgeCanonicalization.ts`, workflow graph reads and machine-group
  resolution to `stateMachineEdgeGraph.ts`, merge snapshot/apply/restore
  helpers to `stateMachineEdgeMachineGroupMerge.ts`, connection validation and
  edge construction to `stateMachineEdgeConnections.ts`, and optimistic create
  or select or delete or replace commands to `stateMachineEdgeMutations.ts`.
- `frontend/src/state/actions/websocketReceive.ts` is down to a 7-line
  compatibility entrypoint and now delegates socket lifecycle, reconnect, auth,
  outbound realtime dependency events and literal sends to
  `websocketRealtimeDispatch.ts`, binary send and upload fallback behavior to
  `websocketRealtimeBinary.ts`, compatibility re-exports to
  `websocketRealtime.ts`, shared active-socket state to `websocketRuntime.ts`,
  lifecycle target/open-status state to `websocketLifecycleState.ts`,
  active-socket listener wiring plus reconnect/recovery handling to
  `websocketLifecycleHandlers.ts`, public transport open entrypoint to
  `websocketLifecycle.ts`, socket-open bootstrap to `websocketBootstrap.ts`,
  auth recovery to `websocketAuthRecovery.ts`, and share-session heartbeat or
  restoration to
  `websocketShareSessionRecovery.ts`.
- `frontend/src/state/actions/uiSettingRevealRequests.ts` now owns request-level
  reveal project/context gating plus the per-request reveal loop,
  `frontend/src/state/actions/uiSettingRevealExecution.ts` now owns
  single-target orchestration plus mutation-lease cleanup,
  `frontend/src/state/actions/uiSettingRevealPluginHandler.ts` now owns
  plugin-handler timeout polling and invocation,
  `frontend/src/state/actions/uiSettingRevealFallbackAnchor.ts` now owns
  fallback anchor lookup, scrolling, and highlight application, and
  `frontend/src/state/actions/uiSettingReveal.ts` is now the thin
  compatibility facade over those narrower reveal owners.
- `frontend/src/state/actions/uiSettingRevealPaneActivation.ts` now owns
  requested active-section selection plus pane-opening writes,
  `frontend/src/state/actions/uiSettingRevealStepActivation.ts` now owns
  watch-code portal, accordion, and project-chat-aux activation writes,
  `frontend/src/state/actions/uiSettingRevealActivationShared.ts` now owns
  shared activation helpers, and
  `frontend/src/state/actions/uiSettingRevealActivation.ts` is now the thin
  compatibility facade.
- `frontend/src/state/actions/stateMachineRunQueries.ts` now owns workflow
  run filtering, share-session scoping, and latest-run selection,
  `frontend/src/state/actions/stateMachineRunPolling.ts` now owns browser
  polling, visibility refresh, and workflow-run subscriptions,
  `frontend/src/state/actions/stateMachineRunSelection.ts` is now the thin
  compatibility facade, `frontend/src/state/actions/stateMachineRunMutations.ts`
  now owns optimistic workflow start/stop/reset commands plus
  refresh-after-mutation behavior, and
  `frontend/src/state/actions/stateMachineRuns.ts` is now the thin
  compatibility facade.
- `frontend/src/state/stores/aiStores.ts` now owns the AI/chat Zustand stores and related chat-state types.
- `frontend/src/state/stores/appStores.ts` now owns app definition/config/preview state, and `frontend/src/state/stores/sessionStores.ts` now owns share-session, server-mode, and all-project-metadata state.
- `frontend/src/state/stores/editorDiagnosticsStores.ts` now owns LSP waiting flags, type errors, LSP diagnostics, and name-validation errors used across authoring and validation flows.
- `frontend/src/state/stores/fileBrowserStores.ts` now owns the file-browser state surfaces, and `frontend/src/state/stores/searchStores.ts` now owns the home/project search stores.
- `frontend/src/state/stores/feedbackStores.ts` now owns modal, notifications, and backend-log state, and `frontend/src/state/stores/projectStatusStores.ts` now owns run-control and project-loading state.
- `frontend/src/state/stores/layoutInteractionStores.ts` now owns section refs, edge-handle registry state, temporary measurement/preview state, and ephemeral layout interaction flags shared across section dragging, sizing, minimap previews, and embedded git-pane visibility.
- `frontend/src/state/stores/uiPreferenceState.ts` now owns UI preference
  types plus default state,
  `frontend/src/state/stores/uiPreferencePersistence.ts` now owns persisted
  normalization and partialize policy, and
  `frontend/src/state/stores/uiPreferenceStores.ts` is now the thin
  persisted-store entrypoint for UI chrome preferences and shared settings
  state.
- `frontend/src/state/storePersistStorage.ts` now owns the shared persisted-storage fallback used by the extracted store modules.
- `frontend/src/state/storeDefinitions.ts` now owns the remaining local
  cross-feature store definitions, `frontend/src/state/atomicProjectStorePublication.ts`
  now owns the staged project-store publication helpers, and
  `frontend/src/state/definitions.ts` is down to a 93-line shared index/barrel
  over those local stores and the extracted domain-owned store modules.
- `frontend/src/state/activeSectionSelection.ts` now owns active-section
  selection reads/writes, snapshot sanitization, and UI-facing selection hooks;
  `frontend/src/state/activeSectionBackendSync.ts` now owns backend hydration
  ownership, pending sync bookkeeping, and backend reconciliation; and
  `frontend/src/state/activeSectionUI.ts` is now the thin compatibility facade
  over those narrower owners plus `storeDefinitions.ts`.
- `frontend/src/state/utils/chatAppGenerationDetails.ts` now owns chat
  app-generation message-state derivation, normalization, and serialization;
  `frontend/src/state/utils/chatAppGenerationAgentRuns.ts` now owns agent-run
  hydration into per-chat app-generation details; and
  `frontend/src/state/utils/chatAppGeneration.ts` is now the thin compatibility
  facade over those narrower owners.
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
<domain>/
  <FeatureRoot>.tsx
  <featureConcern>.ts
  <featureConcern>.tsx
  use<FeatureConcern>.ts
  <featureConcern>.test.ts(x)
  <featureConcern>.perf.test.ts(x)
```

Notes:

- This is a target shape, not a mandatory directory migration.
- A good cleanup slice may still be 4 to 8 sibling files in one directory if the entrypoint and names stay obvious.
- Add a domain subdirectory only when a flat sibling namespace is becoming harder to scan than the UI itself.
- Prefer domain folders such as `history/`, `surface/`, `settings/`, `skills-mcp/`, `windowing/`, `sections/`, `websocket/`, or `window-space/` over generic buckets such as `helpers/`, `shared/`, `runtime/`, `model/`, or `components/`.
- Do not add directory `README.md` files as a default navigation tool.
- Keep truly generic primitives in shared locations.
- Prefer explicit imports from owning modules over large barrel files.

## Phase 0: Guardrails And Mapping

- Add clear "where new code goes" rules:
  - feature-local helpers stay with the feature
  - `utils/` is reserved for low-level cross-feature helpers
  - shared store definitions and selectors must name their owning feature
- Prefer code-local guidance over docs:
  - if a root file still needs context, add a short ownership comment at the top
  - if a function has non-obvious invariants, add a targeted comment there
  - do not create folder-level README navigation maps
- If the branch does not already have one, create an append-only cleanup execution log so future agents can see which slices have already landed.
- Define file-size guidance:
  - preferred: under 500 lines for new/refactored production files
  - review threshold: 800 lines
  - exceptions must be deliberate and documented
- Define a small set of allowed patterns for store access, selector creation, transport wrappers, and test placement so Codex agents are not guessing.

## Phase 1: Shrink The Remaining Front-Door Hotspots

- Start with the biggest unresolved first-hop surfaces:
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
- Use the matching companion plan for the root surface you choose.
- Remove one major mixed responsibility at a time:
  - hydration and preflight orchestration
  - large render branches and shell composition
  - toolbar or aux-view routing
  - drag/resize or virtualization interaction ownership
  - domain-specific view-model derivation
- Prefer feature-local owners next to the root file over new cross-feature
  helper layers.

## Phase 2: Continue Through The Next Cross-Domain Entry Surfaces

- Once the phase-1 roots are smaller, continue into:
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx`
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx` only when a
    same-turn follow-through shortens `useBrowserAreaFolderSession.ts`,
    `useBrowserAreaPreviewState.ts`, or `BrowserAreaContentView.tsx`
- Keep the entry surface obvious, but move clearly named responsibilities out of
  it:
  - project-chat hydration/runtime orchestration vs submission/edit handlers vs
    render branching in `ProjectChatCore.tsx`
  - tracked git-pane/window lifecycle vs floating placement/snap behavior in
    `ProjectChatBottomDock.tsx`
  - standalone window focus/z-index vs bounds/snap math vs page shell rendering
    in `StandaloneWindowSpaceSurface.tsx`

## Phase 3: Revisit Already-Improved Coordinators Only When They Shorten The Main Path

- Follow-through surfaces such as
  `ProjectChatSkillsMcpViewer.tsx`,
  `ProjectChatCore.tsx`,
  `ProjectChatHistory.tsx`,
  `ChatInput.tsx`,
  `ChatMessages.tsx`,
  `HomePage.tsx`,
  and `RunInstructions.tsx`
  still matter, but they are no longer the default starting points.
- Only continue there when:
  - the slice directly shortens a higher-priority root surface, or
  - an extracted helper has become the new real mixed-responsibility bottleneck.
- Do not spend a turn polishing smaller state/action modules in these domains
  unless that extraction is required to simplify the larger caller in the same
  change.

## Phase 4: Tighten Shared Store And Command Boundaries Only From Caller Pain

- Keep making store ownership more explicit, but only where a large UI surface
  still suffers from unclear read/write boundaries.
- Prefer:
  - named selectors close to the owning store
  - named command modules for writes
  - fewer ad hoc `getState()` / `setState()` calls inside JSX-heavy surfaces
- Do not take a state-only slice just to split an already small module or to
  create another thin compatibility facade.

## Phase 5: Reshape Oversized Flat Namespaces

- Once a feature root becomes meaningfully smaller and its boundaries hold
  across a few slices, reshape the surrounding namespace if it is still too
  flat to scan quickly.
- Good candidates after stabilization include:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/`
  - `frontend/src/components/Chat/`
  - `frontend/src/components/ChatWindowing/`
  - `frontend/src/state/actions/`
- Prefer stable domain folders over documentation:
  - `history/`, `surface/`, `settings/`, `skills-mcp/`
  - `windowing/`, `window-space/`, `websocket/`, `sections/`
- Keep the public entry surface obvious after moving files. A subdirectory is a
  win only if it reduces the number of plausible first hops.
- Do not spend a cleanup slice on docs-only churn while large front-door
  hotspots remain.

## Verification Strategy

- For each substantial refactor:
  - add or update Vitest coverage around extracted pure logic and selectors
  - add or update Playwright coverage for user-facing flows when the surface is interactive
  - run CDP profiling/visual verification when the refactor touches UI behavior or performance-sensitive rendering
  - append before/after notes to `perf/reports/frontend/` for meaningful performance changes
- Prefer stable performance guardrails such as DOM size, render counts, selector churn, or virtualization behavior over fragile timing-only assertions.

## Success Criteria

- Major frontend features have obvious entry points, state owners, and mutation paths.
- New contributors and coding agents can usually identify the right file to change from grep, names, and nearby tests without opening a large cluster of unrelated files.
- Large shared surfaces no longer combine transport, state mutation, heavy derivation, and rendering in a single file.
- Render-heavy flows remain at least as fast as today, with before/after profiling recorded for significant refactors.
- The repo gains durable naming, folder boundaries, and placement guidance so
  future code does not collapse back into mega-files, giant flat namespaces, or
  generic helper buckets.

## Recommended Execution Order

1. Refresh the cleanup plans or execution log only if they are missing, stale,
   or changed by your slice. Do not treat doc churn as a substitute for sharper
   file names, clearer subfolders, and colocated tests.
2. Choose the highest unresolved UI hotspot from the current tree and the
   companion plans,
   usually `components/Chat/ChatMessages.tsx`,
   `components/Git/GitGraphOverlay.tsx`,
   `components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`,
   `components/Pages/Project/StandaloneWindowSpaceSurface.tsx`,
   `components/Section/Layouts/BrowserArea.tsx`, or
   `components/ChatWindowing/ProjectChatBottomDock.tsx`.
3. Only choose a smaller `state/actions` or `state/hooks` slice when it is a
   direct prerequisite for simplifying one of those larger hotspots or when it
   deletes a now-unnecessary compatibility surface after callers have
   converged.
4. Continue into already-improved coordinators such as
   `ProjectChatSkillsMcpViewer.tsx`, `ProjectChat.tsx`,
   `ProjectChatHistory.tsx`, `ChatInput.tsx`, or `BrowserArea.tsx` only after
   the larger same-domain front doors above are materially smaller, or when
   the same-turn slice directly shortens them.
5. Add domain subfolders in oversized flat namespaces only after each area
   stabilizes and only when they make the next edit path more obvious.

## Notes

- Do not start with a repo-wide `features/` migration. Prove the boundaries first, then move files if the new structure is clearly better.
- Generated endpoints/types should remain the source of truth; the cleanup should make them easier to consume, not replace them.
- If a refactor meaningfully changes performance-sensitive surfaces, baseline first with CDP and keep the results in `perf/`.
