# Frontend Source Map

This is the shortest path to "where does this behavior live?" for authored frontend
code under `frontend/src`.

Generated modules under `frontend/src/utils/generated*` are intentionally excluded
from this map. Treat them as source-of-truth protocol outputs, then add
feature-local adapters around them when the consuming surface is non-trivial.

## Current Snapshot

- Snapshot date: `2026-03-15`
- Authored TS/TSX files under `frontend/src`: `1404`
- Non-generated TS/TSX files at `1000+` lines: `41`
- Biggest current production hotspots:
  - `components/ChatWindowing/ProjectChatBottomDock.tsx` (`3414`)
  - `components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx` (`3328`)
  - `components/Chat/ChatInput.tsx` (`3121`)
  - `plugins/runtime.ts` (`2730`)
  - `components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` (`2721`)
  - `components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx` (`2478`)
  - `components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx` (`2444`)
  - `components/Panes/Overview/FileBrowser/FileBrowserPane.tsx` (`2403`)
  - `components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` (`2379`)
  - `components/Section/Layouts/BrowserArea.tsx` (`2323`)

## Module Map

- App entry, routing, and page shell

  - `components/Pages/router.tsx` composes the route tree.
  - `components/Pages/routeConfig.ts` owns stable route ids and patterns.
  - `components/Pages/modeRouteResolver.ts` resolves IDE/share/app/launcher mode
    routing.
  - `components/Pages/AppShell.tsx` and `components/Pages/GlobalWrapper.tsx`
    wrap shared page chrome and global providers.

- Project surfaces

  - `components/Pages/Project/*` owns the main project canvas plus standalone
    project and window-space surfaces.
  - `components/AppHeader/*` owns top-level project navigation and search chrome.

- Overview panes and authoring

  - `components/Panes/Overview/*` owns overview tabs such as App, File Browser,
    Git, Plugins, Project AI, and project overview panes.
  - `components/Panes/UiEditor/*` and `components/ProjectConfigs/*` own authoring
    and configuration editors.

- Shared chat and project AI

  - `components/Chat/*` owns shared message rendering and composer UI.
  - `components/Chat/chatAssistantActivity.ts` owns assistant activity or
    timeline derivation, thought-summary labels, activity-only message
    grouping checks, and assistant tool-copy text assembly used by
    `components/Chat/ChatMessages.tsx`.
  - `components/Chat/chatStructuredOutput.tsx` owns structured output payload
    inference, diff classification, formatted tool-result text extraction, and
    the resizable structured-output render surface used by
    `components/Chat/ChatMessages.tsx`.
  - `components/Chat/chatAttachmentPreviewUrls.ts` owns message attachment
    collection, attachment URL lookup, stale refresh policy, and preview URL
    caching used by `components/Chat/ChatMessages.tsx`.
  - `components/Chat/chatAttachmentPreviews.tsx` owns attachment list rendering,
    preview dialog/media carousel branching, and attachment text-preview fetch
    state used by `components/Chat/ChatMessages.tsx`.
  - `components/Chat/chatMessageContent.tsx` owns markdown or code rendering,
    inline markdown labels, streaming markdown animation wrappers, and
    conversation-search highlight helpers used by
    `components/Chat/ChatMessages.tsx`.
  - `components/Chat/chatMessageRuntime.tsx` owns idle-spinner timing,
    run-duration persistence, timestamps, count-badge animation, activity-label
    scrambling, ISO timestamp parsing, and activity thought-preview scroll
    behavior used by `components/Chat/ChatMessages.tsx`.
  - `components/Chat/chatAssistantActivityCard.tsx` owns the assistant activity
    card shell, timeline row rendering, open-all coordination, and activity-item
    copy wiring used by `components/Chat/ChatMessages.tsx`.
  - `components/Chat/chatCopyText.ts` owns the shared clipboard-notification
    helper used by `components/Chat/ChatMessages.tsx` and
    `components/Chat/chatAssistantActivityCard.tsx`.
  - `components/Chat/ChatMessages.tsx` now focuses on list assembly, grouped
    activity-only message stitching, assistant/user/system bubble shells, and
    message-level interaction wiring across those local chat owners.
  - `components/Panes/Overview/ProjectLevelAI/*` owns project chat orchestration,
    hydration authority, starter prompts, slash command selection, skill viewers,
    and project AI settings.
  - `state/actions/aiChatStreaming.ts` owns the public streaming entrypoint
    plus managed-chat detail updates.
  - `state/actions/aiChatStreamingChunkContext.ts` owns placeholder filtering,
    project/section context resolution, and chatId-to-section lookup caching.
  - `state/actions/aiChatStreamingSectionRouting.ts` owns stream-active
    tracking, managed section persistence, tool-preview cleanup, and
    scope-violation side effects for streaming chunks.
  - `state/actions/aiChatStreamingRouting.ts` is now a thin compatibility
    facade over the narrower streaming routing owners.
  - `state/actions/aiChatStreamingMessageDeltas.ts` owns assistant placeholder
    creation plus shared text/thinking delta reducers.
  - `state/actions/aiChatStreamingMessageUpserts.ts` owns finalized-assistant
    merge, response-placeholder detection, and generic message upserts.
  - `state/actions/aiChatStreamingMessages.ts` is now a thin compatibility
    facade over those narrower streaming message owners.
  - `state/actions/aiChatStreamingSectionState.ts` owns chat-section stream
    reconciliation and active-branch message sync for managed chat sections.
  - `state/actions/aiChatStreamingToolCalls.ts` owns tool-call placeholder
    reconciliation plus shared tool-call delta reducers.
  - `state/actions/aiChatStreamingToolPreviews.ts` owns tool-preview store
    updates, preview cleanup, and app-spec patch preview application.
  - `state/actions/aiChatStreamingAppDefinition.ts` owns app-definition tool
    result application and app preview reset behavior.
  - `state/actions/aiChatStreamingTools.ts` is now a thin compatibility surface
    that re-exports the narrower tool-call, preview, and app-definition owners.
  - `state/actions/chatMessageMerge.ts` owns generic message completeness
    scoring and message merge normalization used across pending chat, branch,
    and section-streaming paths.
  - `state/actions/chatHydrationMerge.ts` owns hydration-time local-vs-backend
    chat reconciliation for in-flight overlays and preserved assistant content.
  - `state/actions/chatMergeUtils.ts` is now the thin compatibility facade
    over those narrower chat merge owners.
  - `state/actions/chatBranchState.ts` owns branch bootstrap, active-branch
    fallback, and incoming-message sync for managed chat sections.
  - `state/actions/chatBranchEditing.ts` owns edited-message history truncation
    plus child-branch creation from edited messages.
  - `state/actions/chatBranchIndexState.ts` owns branch-index derivation from
    section branch records.
  - `state/actions/chatBranches.ts` is now the thin compatibility facade over
    those branch owners.
  - `state/actions/projectChatThreadGroupCrud.ts` owns persisted project chat
    thread group creation and rename behavior.
  - `state/actions/projectChatThreadGroupOrdering.ts` owns persisted project
    chat thread group collapse, pin, and reorder behavior.
  - `state/actions/projectChatThreadGroupAssignments.ts` owns persisted project
    chat thread group assignment and deletion behavior.
  - `state/actions/projectChatThreadGroupMutations.ts` is now a thin
    compatibility surface that re-exports those narrower group-mutation
    owners.
  - `state/actions/projectChatThreadMutations.ts` owns persisted per-thread
    viewed, pin, reorder, and delete behavior.
  - `state/actions/projectChatThreadStorageUndoStack.ts` owns the local
    thread/group delete undo stack, stack limit, and per-project lookup.
  - `state/actions/projectChatThreadStorageUndoApply.ts` owns local thread/group
    delete undo restoration writes.
  - `state/actions/projectChatThreadStorageUndo.ts` is now the thin
    compatibility facade over those undo owners.
  - `state/actions/projectChatThreads.ts` is now a thin compatibility surface
    that re-exports the thread-group, thread, and undo owners.
  - `state/actions/aiHydrationOutcome.ts` owns managed/external hydration route
    probes, outcome typing, and failure classification.
  - `state/actions/aiHydrationChatState.ts` owns managed/external chat-detail
    reconciliation plus app-generation detail hydration.
  - `state/actions/aiHydrationSectionState.ts` owns managed/external
    chat-section reconciliation plus section-state persistence sync.
  - `state/actions/aiHydrationApply.ts` is now the thin hydration-apply
    orchestration facade over those narrower owners.
  - `state/actions/aiHydration.ts` is now the thin public hydration facade that
    composes the outcome and apply owners.
  - `state/actions/aiAgentRuns.ts` owns agent-run loading, retries, and
    single-run/update reconciliation.
  - `state/actions/aiChatSubmissionMessages.ts` owns optimistic new-message
    submit orchestration, `state/actions/aiChatSubmissionEdits.ts` owns
    edited-message pending lifecycle plus managed-section chatId reset or
    restore, `state/actions/aiChatSubmissionResponse.ts` owns shared backend
    send plus post-submit hydration refresh, `state/actions/aiChatSubmission.ts`
    is now the thin compatibility facade, `state/actions/aiChatSubmissionRequestPayload.ts`
    owns execution settings, user-message construction, next-message lookup,
    and raw request-payload builders, `state/actions/aiChatSubmissionPayload.ts`
    owns app-generation request metadata plus edited-message request
    preparation, and `state/actions/aiChatSubmissionEngineResolution.ts` owns
    edited-chat engine resolution plus agent-run-backed fallback lookup.
  - `state/actions/aiChatControls.ts` owns public stop orchestration for
    project and managed section chats plus shared LLM stop fallback handling.
  - `state/actions/aiExternalAgentStop.ts` owns external-run lookup, external
    stop transport, and external chat recovery after stop failures.
  - `state/actions/aiChatStopState.ts` owns local stop snapshots, optimistic
    waiting-state interruption updates, and follow-state restoration.
  - `state/actions/aiExternalAgentResponses.ts` owns external agent
    approval/question response transport.
  - `state/actions/aiChatState.ts` owns chat-detail and pending-surface detail
    writes shared across submission, hydration, and controls.
  - `state/actions/aiChatSectionState.ts` owns persisted chat-section state sync
    shared by hydration and section-state writes.
  - `state/actions/aiInterruptedAssistantMessages.ts` owns interrupted assistant
    message tracking and snapshot restoration.
  - `state/actions/aiFollowToolArguments.ts` owns AI-follow tool-argument
    snapshot reads, writes, and backend snapshot hydration.
  - `state/actions/aiFollowHighlights.ts` owns AI-follow tool-result
    highlights plus scope-violation timeout orchestration.
  - `state/actions/aiFollow.ts` is now a thin compatibility facade over those
    narrower AI-follow owners.
  - `state/actions/aiPendingChatAppGenerationState.ts` owns pending-surface
    app-generation detail reads and writes.
  - `state/actions/aiPendingChatMessageLifecycle.ts` owns pending draft
    initialization, seed, clear, commit, and finalize flows.
  - `state/actions/aiPendingChatMessageMutations.ts` owns optimistic
    pending-surface and materialized-chat user-message apply or rollback flows
    plus app-generation detail updates.
  - `state/actions/aiPendingChatMessageState.ts` is now the thin compatibility
    facade over those message-level pending-chat owners.
  - `state/actions/aiPendingChatState.ts` is now a thin compatibility facade
    over those narrower pending-chat owners.
  - `state/actions/aiLLMConfiguration.ts` owns LLM config loading/saving.
  - `state/actions/aiManagedApiKeyState.ts` owns managed API-key snapshot
    updates, read failure handling, and deduplicated load behavior.
  - `state/actions/aiManagedApiKeyPersistence.ts` owns managed API-key
    persistence queueing plus conflict and corruption retry handling.
  - `state/actions/aiManagedApiKeys.ts` is now the thin compatibility facade
    over those managed API-key owners.
  - `state/actions/aiConfigurationCatalogLoads.ts` owns agent-profile,
    prompt-template, external-agent, external-agent-health, and engine-config
    catalog fetch/hydration plus config-health refresh fan-out.
  - `state/actions/aiConfigurationCatalogState.ts` owns AI catalog store-write
    helpers for snapshots, mutation success, and failure state.
  - `state/actions/aiConfigurationCatalogMutations.ts` owns agent-profile,
    prompt-template, external-agent, and engine-config mutation transport.
  - `state/actions/aiConfigurationCatalogs.ts` is now a thin compatibility
    facade over the narrower catalog owners.
  - `state/actions/aiConfiguration.ts` is now a thin compatibility surface that
    re-exports the LLM/config and catalog owners.
  - `state/actions/aiTranscriptionAudio.ts` owns provider dictation decode,
    mono PCM conversion, resample, and realtime-payload preparation.
  - `state/actions/aiTranscriptionUpload.ts` owns provider dictation session
    start, append, stop, cancel, and transcript assembly orchestration.
  - `state/actions/aiTranscription.ts` is now a thin compatibility facade over
    those narrower dictation owners.
  - `state/actions/aiTranscriptionSessions.ts` owns provider session transport,
    request error handling, and chunk-size policy.
  - `state/actions/aiTranscriptionProfiles.ts` owns transcription-profile load,
    websocket/store snapshot updates, and CRUD behavior.

- Project chat windowing

  - `components/ChatWindowing/*` owns dock/window rendering, surface ids, snap
    layout helpers, and viewport math.
  - `components/ChatWindowing/projectChatWindowShortcuts.ts` owns dock-specific
    keyboard shortcut parsing, editable-target gating, and keydown listener
    wiring used by `components/ChatWindowing/ProjectChatBottomDock.tsx`.
  - `components/ChatWindowing/projectChatBottomDockLayout.ts` owns dock strip
    reservation math, visible dock-window selection, width-fitting, and
    minimized-pill display-mode calculations used by
    `components/ChatWindowing/ProjectChatBottomDock.tsx`.
  - `components/ChatWindowing/projectChatDockResize.ts` owns dock preview
    width/height state, stale-preview pruning, and dock-resize pointer session
    handling used by `components/ChatWindowing/ProjectChatBottomDock.tsx`.
  - `components/ChatWindowing/projectChatFloatingInteractions.ts` owns
    floating preview bounds state, snap-preview state, viewport guardrails, and
    floating drag/resize or snap-resize pointer-session handling used by
    `components/ChatWindowing/ProjectChatBottomDock.tsx`.
  - `state/actions/projectChatWindowingDefaultBounds.ts` owns pure floating and
    docked default-bounds math.
  - `state/actions/projectChatWindowingStateNormalization.ts` owns order and
    z-index normalization for persisted windowing state.
  - `state/actions/projectChatWindowingNormalization.ts` is now the thin
    compatibility facade over those normalization helpers.
  - `state/actions/projectChatWindowingSelectors.ts` owns section-binding and
    visible-window selector reads.
  - `state/actions/projectChatWindowingInstanceCreation.ts` owns window-instance
    creation, next-instance-id allocation, and runtime floating-bounds
    resolution.
  - `state/actions/projectChatWindowingInstanceUpdates.ts` owns shared
    per-window normalization, z-index lookup, and update helpers.
  - `state/actions/projectChatWindowingInstanceState.ts` is now the thin
    compatibility facade over those instance owners.
  - `state/actions/projectChatWindowingPlacementState.ts` owns placement,
    maximize/unmaximize, close/minimize/reopen, and focus reducers.
  - `state/actions/projectChatWindowingBoundsState.ts` owns dock-fraction and
    floating-bounds reducers.
  - `state/actions/projectChatWindowingLayoutState.ts` is now a thin
    compatibility surface that re-exports the instance creation/update,
    placement, and bounds owners.
  - `state/actions/projectChatWindowingSectionState.ts` owns section exposure,
    section binding, and section/window mode transition reducers.
  - `state/actions/projectChatWindowingMetadataState.ts` owns title and
    chat-id reducers.
  - `state/actions/projectChatWindowingState.ts` is now a thin compatibility
    surface that re-exports the section and metadata owners.
  - `state/actions/projectChatWindowingCanvasSurface.ts` owns DOM surface
    lookup plus canvas boot positioning/sizing.
  - `state/actions/projectChatWindowingCanvasBoot.ts` owns the section boot
    flow from windowed chat surfaces back into the canvas.
  - `state/actions/projectChatWindowingTrackedGitPane.ts` owns tracked git-pane
    graph window reuse plus maximize/title coordination.
  - `state/actions/projectChatWindowingTrackedGitPaneState.ts` owns tracked
    git-pane instance-key reads/writes plus validity reconciliation.
  - `state/actions/projectChatWindowingEmbeddedPaneVisibility.ts` owns
    embedded git-pane visibility reads/writes plus authoritative prune/replace
    reconciliation.
  - `state/actions/projectChatWindowingEphemeralKeys.ts` owns project-scoped
    ephemeral window key build/parse helpers.
  - `state/actions/projectChatWindowLifecycleCommands.ts` owns public window
    lifecycle and focus commands.
  - `state/actions/projectChatWindowLayoutCommands.ts` owns public placement,
    dock-fraction, and floating-bounds commands plus tracked git-pane cleanup
    coordination around layout writes.
  - `state/actions/projectChatWindowCommands.ts` is now a thin compatibility
    surface that re-exports the lifecycle and layout command owners.
  - `state/actions/projectChatWindowMetadataCommands.ts` owns title/chat-id
    mutations plus the current-windowing store accessor.
  - `state/actions/projectChatWindowSectionCommands.ts` owns section exposure,
    undock, and section/window mode transition commands.
  - `state/actions/projectChatWindowing.ts` is now a thin compatibility surface
    that re-exports the public command owners plus write helpers.
  - `state/actions/projectChatWindowingWriteState.ts` owns layout-write
    permissions, current-windowing store access, optimistic apply helpers, and
    local sync behavior.
  - `state/actions/projectChatWindowingWriteQueue.ts` owns pending-mutation
    queueing, write barriers, and flush coordination.
  - `state/actions/projectChatWindowingWritePublish.ts` owns authoritative
    publish/replay plus tracked response/send helpers.
  - `state/actions/projectChatWindowingWriteSync.ts` owns explicit sync helpers
    and the flush facade for project-chat windowing writes.
  - `state/actions/projectChatWindowingWritePipeline.ts` now owns thin
    serialized orchestration across the write-queue and write-publish owners.
  - `state/actions/projectChatWindowingWrites.ts` is now a thinner public
    mutation facade over the write-state, write-pipeline, and write-sync
    owners.
  - `state/actions/projectChatWindowingAuthoritative.ts` owns authoritative
    snapshot publication and replay helpers.
  - `state/actions/projectChatWindowingEphemeral.ts` is now a thin
    compatibility and reconciliation surface over the narrower ephemeral key,
    tracked-window, and embedded-visibility owners.

- Workflow edges

  - `state/actions/stateMachineEdgeCanonicalization.ts` owns workflow handle
    normalization and shared-chat workflow port canonicalization.
  - `state/actions/stateMachineEdgeGraph.ts` owns section-type reads,
    machine-group reads, and connection-time machine-group resolution.
  - `state/actions/stateMachineEdgeMachineGroupMerge.ts` owns machine-group
    merge snapshot capture plus apply/restore helpers for workflow edge
    mutations.
  - `state/actions/stateMachineEdgeConnections.ts` now owns workflow
    connection validation and edge construction.
  - `state/actions/stateMachineEdgeMutations.ts` owns optimistic workflow edge
    create/select/delete/replace commands.

- Workflow draft validation

  - `state/actions/stateMachineDraftValidationGraph.ts` owns machine-section
    and workflow-edge graph reads used by draft validation.
  - `state/actions/stateMachineDraftValidationWarnings.ts` owns draft warning
    detail and result assembly.
  - `state/actions/stateMachineDraftValidation.ts` now owns workflow draft
    traversal and orchestration.

- Workflow runs

  - `state/actions/stateMachineRunQueries.ts` owns workflow run filtering,
    share-session scoping, and latest-run selection.
  - `state/actions/stateMachineRunPolling.ts` owns browser polling,
    visibility-triggered refresh, and workflow-run subscription behavior.
  - `state/actions/stateMachineRunSelection.ts` is now the thin compatibility
    facade over those read-side workflow-run owners.
  - `state/actions/stateMachineRunMutations.ts` owns optimistic workflow
    start/stop/reset commands plus refresh-after-mutation behavior.
  - `state/actions/stateMachineRuns.ts` is now the thin compatibility facade.

- Section rendering and params

  - `components/Section/*` owns section containers, headers, layouts, and shared
    section chrome.
  - `components/Params/*` owns param rendering and param-specific input controls.
  - `state/actions/sections/createSections.ts` now owns top-level section
    creation commands plus empty-space add actions.
  - `state/actions/sections/createSectionCatalogTypes.ts` owns shared section
    creation menu types.
  - `state/actions/sections/createSectionCatalogSectionGroups.ts` owns static
    section/code/artifact/workflow/other creation presets.
  - `state/actions/sections/createSectionCatalogControlGroups.ts` owns static
    metacontrol and embed creation presets.
  - `state/actions/sections/createSectionCatalogGroupAssembly.ts` owns the
    ordered base group assembly for section creation menus.
  - `state/actions/sections/createSectionCatalogStatic.ts` is now the thin
    compatibility facade over those catalog owners.
  - `state/actions/sections/createSectionCatalog.ts` now owns hook-time
    singleton/codegen/plugin gating for `useCreateSectionsList`.
  - `state/actions/sections/createSectionsHelper.ts` now owns the narrower
    post-create command path for `createTopLevelSectionFromImplSpecs`.
  - `state/actions/sections/createSectionPlacement.ts` owns smart placement
    context and empty-space placement helpers for new sections.
  - `state/actions/sections/createSectionFileOpenShared.ts` owns opened-file
    naming, existing-section reuse lookup, and shared focus or rename helpers.
  - `state/actions/sections/createSectionFileOpenCommands.ts` owns per-impl
    file-open commands for code, text, image, and spreadsheet sections.
  - `state/actions/sections/createSectionFileDropRouting.ts` owns dropped-file
    routing from file metadata into the correct section-open command.
  - `state/actions/sections/createSectionFileOpeners.ts` is now a thin
    compatibility facade over those file-open owners.
  - `state/actions/sections/createSectionImplDefaults.ts` owns per-impl create
    defaults such as text-block display-mode normalization.
  - `state/actions/sections/moveSectionQueries.ts` owns attached-terminal route
    selection, section-type move checks, and parent-resolution reads for
    section-moving flows.
  - `state/actions/sections/moveSectionParentState.ts` owns in-state parent
    cleanup plus move-into-parent reducers for section-moving flows.
  - `state/actions/sections/moveSectionPaneState.ts` owns pane node and
    top-level layout updates for section-moving flows.
  - `state/actions/sections/moveSectionState.ts` is now the thin in-state
    composition facade over those move reducers.
  - `state/actions/sections/moveSections.ts` is now the thin optimistic backend
    command facade for section moves.
  - `state/actions/params/paramSelectionCommands.ts` owns single-param
    selection normalization for param drag/drop flows.
  - `state/actions/params/paramMoveCommands.ts` owns optimistic backend
    dispatch for drag/drop param moves plus indent and unindent commands.
  - `state/actions/params/paramMoveSelectionContext.ts` owns selected-section
    resolution, visible-param gating, and movement or unindent context reads
    shared by keyboard and backend param move commands.
  - `state/actions/params/paramMoveOrdering.ts` owns parent-child ordering and
    contiguous visible-sibling grouping shared by param DnD, optimistic
    mutations, and keyboard move planning.
  - `state/actions/params/paramTreeStructure.ts` owns param root lookup,
    ancestry maps, and visible param tree derivation used by param move and
    drag/drop flows.
  - `state/actions/params/paramTreeSelection.ts` owns root-selection filtering,
    shared-parent resolution, descendant checks, and visible-to-full insertion
    index mapping for param move and drag/drop flows.
  - `state/actions/params/paramMoveQueries.ts` is now the thin compatibility
    facade over the param move selection-context and ordering owners.
  - `state/actions/params/paramTree.ts` is now the thin compatibility facade
    over those param tree owners.
  - `state/actions/params/paramMoveKeyboardCommands.ts` owns visible-sibling
    keyboard move planning and grouped move dispatch for selected params.
  - `state/actions/params/moveParams.ts` is now the thin compatibility facade
    over those param move owners.

- Browser and file management

  - `components/Panes/Overview/FileBrowser/*` owns file browsing panes and file
    browser editors.
  - `components/Section/Layouts/BrowserArea.tsx` owns the browser section layout.
  - `utils/fileBrowser*.ts`, `utils/browserPaths.ts`, and nearby helpers own the
    pure file-browser derivation and path utilities.

- Git surfaces

  - `components/Panes/Overview/Git/*` and `components/Git/*` own the git pane,
    diff overlay, graph overlay, and embedded graph window UI.
  - `state/actions/gitStatusState.ts` owns git status refresh plus diff
    availability derivation.
  - `state/actions/gitDiffOverlayActions.ts` owns diff overlay opening,
    diff hydration, diff-mode switching, and overlay close behavior.
  - `state/actions/gitStatusAndDiff.ts` is now the thin compatibility facade.
  - `state/actions/gitGraphRefreshState.ts` owns git graph/log refresh and
    initial page loading, `state/actions/gitGraphPaginationRequests.ts` owns
    load-more request gating plus transport orchestration,
    `state/actions/gitGraphPaginationResults.ts` owns appended-page merge and
    load-more error writes, `state/actions/gitGraphPaginationState.ts` is now
    the thin compatibility facade, `state/actions/gitGraphFilterState.ts` owns
    graph filter writes, and `state/actions/gitGraphRequestTracker.ts` owns
    shared git-graph request-id sequencing plus stale-request suppression.
  - `state/actions/gitGraphOverlayActions.ts` owns git graph overlay boot,
    graph-state seeding, manual refresh, and all-refs toggling.
  - `state/actions/gitGraphLoadState.ts` and `state/actions/gitGraphLog.ts`
    are now thin compatibility facades.
  - `state/actions/gitGraphSelection.ts` owns selected-commit clearing plus
    commit details/file-diff selection behavior.
  - `state/actions/gitGraphState.ts` owns current project-config lookup plus
    reusable graph/selection state builders.
  - `state/actions/gitGraph.ts` is now a thin compatibility surface that
    re-exports the graph load, overlay, and selection owners.
  - `state/actions/git.ts` is now a thin compatibility surface that re-exports
    the git status/diff and graph owners.

- App runtime

  - `components/App/appRegistry.tsx` owns app runtime component registration,
    bindings, and renderer selection.
  - `components/Pages/App/*` owns app-mode shells and wrappers.

- Plugin runtime

  - `plugins/runtime.ts` owns plugin registration, capability gating, runtime
    transport, and host APIs.
  - `components/Section/Layouts/PluginArea.tsx` and
    `components/Panes/Overview/Plugins/*` render plugin-backed surfaces.

- Shared state

  - `state/storeDefinitions.ts` now owns the remaining local cross-feature
    Zustand stores on this branch, while
    `state/atomicProjectStorePublication.ts` owns the staged
    project/node/active-section publication helpers and `state/definitions.ts`
    stays a `93`-line shared index and compatibility barrel over those local
    stores and the extracted domain-owned store modules.
  - `state/activeSectionSelection.ts` owns active-section selection reads,
    writes, snapshot sanitization, and UI-facing selection hooks.
  - `state/activeSectionBackendSync.ts` owns active-section backend hydration
    ownership, pending sync bookkeeping, and backend reconciliation helpers.
  - `state/activeSectionUI.ts` is now the thin compatibility facade over those
    narrower active-section owners plus `state/storeDefinitions.ts`.
  - `state/utils/chatAppGenerationDetails.ts` owns chat app-generation
    message-state derivation, normalization, and serialization, while
    `state/utils/chatAppGenerationAgentRuns.ts` owns agent-run hydration back
    into per-chat app-generation details and `state/utils/chatAppGeneration.ts`
    is now the thin compatibility facade over both.
  - `state/stores/aiStores.ts` owns the AI/chat Zustand stores and chat-specific
    store types such as `ChatDetails`, `ChatBranchInfo`, and
    `ProjectChatCustomSlashCommand`.
  - `state/stores/appStores.ts` owns app definition/config/preview state used by
    app-mode rendering, app preview, and app deployment surfaces.
  - `state/actions/appSessionStoredState.ts` owns app-session cookie or
    session-storage reads, writes, store hydration, and reset behavior.
  - `state/actions/appSessionBootstrap.ts` owns app-session ensure or
    initialize flows for app-mode bootstrap and recovery.
  - `state/actions/appSessionRunCount.ts` owns app-session run-count
    increments plus persisted session snapshot updates.
  - `state/actions/appSessionState.ts` is now the thin compatibility facade
    over those app-session owners.
  - `state/actions/shareSessionStoredState.ts` owns share-session cookie or
    session-storage reads, writes, store hydration, cached-session reuse, and
    reset behavior.
  - `state/actions/shareSessionBootstrap.ts` owns share-session ensure or
    initialize flows for deployment bootstrap and recovery.
  - `state/actions/shareSessionState.ts` is now the thin compatibility facade
    over those share-session owners.
  - `state/actions/shareProjectConfig.ts` owns share project-config
    load/retry transport plus post-load hydration side effects.
  - `state/actions/share.ts` is now the thin compatibility facade over those
    narrower share-mode owners.
  - `state/actions/activeSectionSync.ts` owns durable active-section selection
    scheduling, flush, backend send, and authoritative restore behavior.
  - `state/actions/activeSectionCommands.ts` owns higher-level active-section
    commands such as clear, prune-for-view-mode, select-all, and top-level
    non-group selection.
  - `state/actions/activeSections.ts` is now the thin compatibility facade
    over those active-section owners.
  - `state/actions/appDeploymentState.ts` owns app deployment load or reset flow
    plus app-config cache hydration.
  - `state/actions/app.ts` is now the thin compatibility facade over those
    narrower app owners.
  - `state/stores/editorDiagnosticsStores.ts` owns LSP waiting flags, type
    errors, LSP diagnostics, and name-validation errors shared across section
    authoring, formatting, and validation surfaces.
  - `state/stores/feedbackStores.ts` owns modal, notifications, and backend-log
    store state used across shell and overview surfaces.
  - `state/stores/fileBrowserStores.ts` owns the standalone, home-page,
    browser-section, and dropzone file-browser state surfaces.
  - `state/stores/layoutInteractionStores.ts` owns section refs, edge-handle
    registry state, temporary section measurement/preview state, and the
    ephemeral layout interaction flags shared across section dragging, sizing,
    minimap previews, and embedded project-chat git panes.
  - `state/stores/projectStatusStores.ts` owns run-control and project-loading
    status shared across run actions and route/deployment loading flows.
  - `state/actions/customRunStorage.ts` owns local custom-run reads and
    persisted mutation writes, including default run seeding and per-run
    authoring updates.
  - `state/actions/customRunQueries.ts` owns custom-run filtered list and
    lookup helpers used by run controls and authoring surfaces.
  - `state/actions/customRunExecution.ts` owns once/continuous custom-run
    execution plus run-control coordination.
  - `state/actions/customRuns.ts` is now the thin compatibility facade over
    those custom-run owners.
  - `state/actions/runCodeExecution.ts` owns runnable-section guards,
    generated-python normalization, snapshot-mode resolution,
    attached-terminal lookup, draw snapshot collection, and backend run
    transport.
  - `state/actions/runCodeControls.ts` owns main run-button once/continuous
    toggles plus subprocess stop transport.
  - `state/actions/runOrImportCode.ts` is now the thin compatibility facade
    over those run owners.
  - `state/stores/searchStores.ts` owns home-page search plus project search
    state used by the header search surfaces and param search highlighting.
  - `state/stores/sessionStores.ts` owns share-session, server-mode, and
    all-project-metadata state used across IDE/share/app/launcher flows.
  - `state/stores/uiPreferenceState.ts` owns UI preference types and default
    state, `state/stores/uiPreferencePersistence.ts` owns persisted
    normalization and partialize policy, and `state/stores/uiPreferenceStores.ts`
    is now the thin persisted store entrypoint for UI chrome preferences and
    shared settings state.
  - `state/storePersistStorage.ts` owns the shared persisted-storage fallback
    used by the persisted store modules.
  - `state/actions/*` owns named mutation and query helpers, with shared chat
    helpers split across `aiHydration.ts`, `aiHydrationApply.ts`,
    `aiHydrationChatState.ts`, `aiHydrationSectionState.ts`,
    `aiHydrationOutcome.ts`, `aiAgentRuns.ts`,
    `aiChatSubmissionMessages.ts`, `aiChatSubmissionEdits.ts`,
    `aiChatSubmissionResponse.ts`, `aiChatSubmission.ts`,
    `aiChatControls.ts`, `aiExternalAgentStop.ts`, `aiChatStopState.ts`,
    `aiExternalAgentResponses.ts`, `aiChatState.ts`,
    `aiChatSectionState.ts`, `aiPendingChatAppGenerationState.ts`,
    `aiPendingChatMessageLifecycle.ts`, `aiPendingChatMessageMutations.ts`,
    `aiPendingChatMessageState.ts`, and `aiPendingChatState.ts`.
  - `state/actions/sectionProjectStateSnapshot.ts` owns backend project-state
    reconciliation, pending-op replay, comparable-state short-circuiting, and
    node-map derivation for authoritative project snapshots.
  - `state/actions/sectionProjectStateActiveSync.ts` owns active-section UI
    reconciliation from authoritative project snapshots.
  - `state/actions/sectionProjectStateViewportSync.ts` owns React Flow
    viewport synchronization and fit-view planning for authoritative project
    snapshots.
  - `state/actions/sectionProjectStateWindowingSync.ts` owns authoritative
    project-chat windowing recording plus ephemeral follow-up reconciliation.
  - `state/actions/sectionProjectStateSync.ts` is now the thin orchestration
    facade over those project-state snapshot owners.
  - `state/actions/lspDiagnosticsState.ts` owns formatter-aware diagnostics
    merge rules plus diagnostics snapshot publication to the editor stores.
  - `state/actions/lspDiagnosticsCommands.ts` owns mute and suppressed-code
    transport commands for code-section diagnostics.
  - `state/actions/lspDiagnostics.ts` is now the thin compatibility facade
    over those diagnostics owners.
  - `state/actions/sectionDisplayStructure.ts` owns top-level display
    selection, displayed-child tree derivation, node-map creation, and DnD
    child reset used by section rendering and project-state bootstrap flows.
  - `state/actions/sectionViewModeVisibility.ts` owns active-view lookup,
    visibility/read gating, and ancestor-visibility queries for section
    rendering.
  - `state/actions/sectionDisplayQueries.ts` is now the thin compatibility
    facade over those section display owners.
  - `state/actions/projectStateCommands.ts` owns the shared project-state
    command entrypoints for section delete/group flows, param selection,
    viewport persistence, and all-project-metadata updates.
  - `state/actions/projectStateOptimisticUpdates.ts` owns the pending-operation
    queue and optimistic project-state mutation scaffolding used by shared state
    action modules.
  - `state/actions/artifactStoreUpdates.ts` owns incoming artifact snapshot
    reconciliation plus decoded-image cache cleanup for websocket/store-driven
    artifact updates.
  - `state/actions/artifactSyncQueue.ts` owns draw artifact save queueing,
    debounced flush transport, and conflict/skipped save notifications.
  - `state/actions/artifacts.ts` is now a thin compatibility facade over the
    narrower artifact update and sync owners.
  - `state/hooks/artifactTransport.ts` owns cached image/chart/brush/transform
    load transport plus raw-image decode.
  - `state/hooks/drawAreaArtifacts.ts` owns draw-area artifact ref selection,
    load planning, and revision-stamp hooks.
  - `state/hooks/artifacts.ts` is now a thin compatibility facade over those
    narrowed artifact hook owners.
  - `state/actions/websocketIncomingMessages.ts` owns frontend websocket
    payload parsing and feature-specific dispatch.
  - `state/actions/websocketIncomingProjectSnapshots.ts` owns project/app
    snapshot routing for inbound websocket updates.
  - `state/actions/websocketIncomingUISettingRevealAck.ts` owns inbound
    `UISettingReveal` ACK fallback ids, malformed-status construction, and
    result sends.
  - `state/actions/websocketIncomingUISettingRevealExecution.ts` owns inbound
    `UISettingReveal` execution-context creation, async store writes, and
    post-run websocket or project mismatch normalization.
  - `state/actions/websocketIncomingUISettingReveal.ts` is now the thin
    orchestration facade over those narrower inbound reveal owners.
  - `state/actions/websocketReceive.ts` is now a thin compatibility facade.
  - `state/actions/websocketLifecycleState.ts` owns last/current websocket
    target tracking plus open-connection status used by reconnect flows.
  - `state/actions/websocketLifecycleHandlers.ts` owns active-socket listener
    wiring, transport error handling, replacement teardown, and reconnect or
    recovery scheduling.
  - `state/actions/websocketLifecycle.ts` owns the public socket-open
    entrypoint plus route/url selection before delegating to those lifecycle
    owners.
  - `state/actions/websocketBootstrap.ts` owns socket-open connection
    registration, current-address send, project-state or diagnostics bootstrap,
    and deployment listener-coverage bootstrap.
  - `state/actions/websocketAuthRecovery.ts` owns auth-refresh polling,
    auth-loss recovery, and reconnect gating during authentication recovery.
  - `state/actions/websocketShareSessionRecovery.ts` owns share-session
    heartbeat sends plus share/app session restoration after websocket close
    codes.
  - `state/actions/websocketRealtimeDispatch.ts` owns outbound realtime
    dependency events plus section literal sends.
  - `state/actions/websocketRealtimeBinary.ts` owns binary realtime sends,
    oversize upload fallback, and warning throttling.
  - `state/actions/websocketRealtime.ts` is now the thin compatibility facade
    over the realtime dispatch and binary owners.
  - `state/actions/websocketRuntime.ts` owns the shared active-socket runtime
    state and low-level websocket send helpers used by the lifecycle and
    realtime owners.
  - `state/actions/sectionEffectiveImplCore.ts` owns effective section/code-object
    derivation, cache invalidation, and low-level entity lookups.
  - `state/actions/sectionEffectiveImplSelectors.ts` owns typed current-section
    and current-code-object selectors built on the effective-impl core.
  - `state/actions/sectionFeatureSelectors.ts` owns managed-chat authority
    checks and param display-name selectors derived from the effective-impl
    selector surface.
  - `state/actions/sectionEffectiveImpls.ts` is now a thin compatibility facade
    over the effective-impl core, typed selector, and feature-selector owners.
  - `state/actions/sectionStructureQueries.ts` owns section orientation,
    section type, section-child queries, and the shared base-code type guard.
  - `state/actions/sectionTerminalAttachmentQueries.ts` owns terminal
    attachment and embedded-terminal queries for code-section layouts.
  - `state/actions/sectionLayoutQueries.ts` is now the thin compatibility
    facade over those layout-query owners.
  - `state/actions/sectionEffectiveImplMutations.ts` owns low-level
    section/code-object impl mutation helpers and cache invalidation for local
    impl writes.
  - `state/actions/sectionStreamingMerge.ts` owns streaming chat merge
    reconciliation for backend project-state snapshots.
  - `state/actions/sectionShownParams.ts` owns shown-param and pinned-param
    bucket helpers used by param layout and section config surfaces.
  - `state/actions/sectionHierarchy.ts` owns section ancestry, descendants,
    parent-child mutation helpers, and reset-to-default-version commands.
  - `state/actions/sectionToolArgumentPreview.ts` owns tool-preview cleanup
    against the current project-state snapshot.
  - `state/actions/sectionInfos.ts` is now a thin compatibility facade over the
    narrower section helper owners.
  - `state/actions/topLevelSectionLayouts.ts` owns active-view top-level layout
    selection plus layout snapshot building from current node internals.
  - `state/actions/topLevelLayoutPersistence.ts` owns pending-op reconciliation
    and debounced backend persistence for top-level section layout writes.
  - `state/actions/windowSpaceQueries.ts` owns saved window-space sort,
    project-config lookup, layout-mutation gating, and next-name derivation.
  - `state/actions/windowSpaceMutationPersistence.ts` owns saved window-space
    sort/name/delete mutations plus optimistic persistence and rollback.
  - `state/actions/windowSpaceCrud.ts` is now a thin compatibility facade over
    those narrower read and mutation owners.
  - `state/actions/windowSpaceSave.ts` owns current-floating-window save flow,
    authoritative pre-save resync, and saved window-space snapshot
    persistence.
  - `state/actions/windowSpacePersistence.ts` is now a thin compatibility
    facade over the narrowed window-space query, mutation, and save owners.
  - `state/actions/windowSpaceSnapshotCapture.ts` owns floating window-space
    snapshot building.
  - `state/actions/windowSpaceSnapshotRestoreConversion.ts` owns conversion
    from saved window-space state back into project-chat windowing state.
  - `state/actions/windowSpaceSnapshotRestoreSectionBindings.ts` owns restored
    section-binding dedupe for saved window-space restores.
  - `state/actions/windowSpaceSnapshotRestoreInstanceIds.ts` owns restored
    project-chat window instance-id allocation and stable instance ordering
    helpers.
  - `state/actions/windowSpaceSnapshotRestore.ts` is now the thin
    compatibility facade over those restore owners.
  - `state/actions/windowSpaceSnapshots.ts` is now a thin compatibility facade
    over the narrower snapshot owners.
  - `state/actions/windowSpaceWorkspaceRestoreReuse.ts` owns floating-window
    reuse, owner-key resolution, and superseded-floating selection for saved
    window-space restores.
  - `state/actions/windowSpaceWorkspaceRestoreRemap.ts` owns restored-instance
    remapping, section-host collision drops, and deduped restore merge policy.
  - `state/actions/windowSpaceWorkspaceRestoreLayout.ts` owns workspace-restore
    planning and the combined next-windowing result for saved window spaces.
  - `state/actions/windowSpaceWorkspaceRestoreVisibility.ts` owns restored
    git-pane visibility reconciliation for saved window-space restores.
  - `state/actions/windowSpaceWorkspaceRestorePlan.ts` is now a thin facade
    that composes the restore-layout and visibility owners.
  - `state/actions/windowSpaceProjectChatThreadRestore.ts` owns deployment-
    policy restore gating plus saved project-chat thread rebound after layout
    restore.
  - `state/actions/windowSpaces.ts` now owns thin workspace-restore
    orchestration for saved window spaces.
  - `state/actions/keyActivations.ts` now just owns global key-listener
    orchestration, `state/actions/keyActivationPressedKeys.ts` owns
    pressed-key bookkeeping and stale-key cleanup,
    `state/actions/keyActivationShortcutInfo.ts` owns shortcut-info
    normalization plus keep-key-down coordination,
    `state/actions/keyActivationCommands.ts` owns the shortcut command
    registry plus React Flow key-mode toggles,
    `state/actions/keyShortcutNavigationRegistrations.ts` owns focus and
    pane-navigation shortcut registrations,
    `state/actions/keyShortcutTooltipRegistrations.ts` owns tooltip shortcut
    registrations, `state/actions/keyShortcutWorkspaceRegistrations.ts` owns
    creation, project-command, canvas, and interaction-mode registrations,
    `state/actions/keyShortcutRegistrationGroups.ts` is now the thin
    compatibility surface, `keyShortcutRegistrations.ts` owns the remaining
    Tab-vs-param binding decisions plus registry composition,
    `keyShortcutMatching.ts` owns shortcut parsing, event-code normalization,
    and shortcut matching, `keyShortcutInputPolicy.ts` owns editable-target and
    input-ignore policy, `keyShortcutUtils.ts` is now the thin compatibility
    facade, and
    `keyActivationHandlers.ts` owns `Tab`/`Escape`, section selection, and
    param-shortcut dispatch behavior.
  - `state/actions/uiSettingRevealRequests.ts` owns request-level reveal
    project/context gating plus the per-request reveal loop.
  - `state/actions/uiSettingRevealExecution.ts` owns single-target reveal
    orchestration plus mutation-lease rollback/finalization,
    `uiSettingRevealPluginHandler.ts` owns plugin-handler timeout polling and
    invocation, and `uiSettingRevealFallbackAnchor.ts` owns fallback anchor
    lookup, scrolling, and highlight application.
  - `state/actions/uiSettingReveal.ts` is now the thin compatibility facade
    for reveal requests, while `uiSettingRevealMutations.ts` is now the thin
    mutation compatibility facade, `uiSettingRevealMutationApply.ts` owns
    high-level reveal mutation orchestration plus mismatch/failure handling,
    `uiSettingRevealMutationLeaseLifecycle.ts` owns mutation-lease rollback
    and finalize behavior, `uiSettingRevealMutationLock.ts` owns serialized
    reveal mutation locking,
    `uiSettingRevealMutationOwnership.ts` owns lease sequence and touched-field
    ownership, `uiSettingRevealMutationCapture.ts` owns snapshot capture plus
    failure-result assembly,
    `uiSettingRevealMutationRecordRestore.ts` owns shared owned-record revert
    helpers, `uiSettingRevealMutationLocalStorageRestore.ts` owns
    local-storage rollback, `uiSettingRevealMutationProjectStateRestore.ts`
    owns project-state active-section rollback, and
    `uiSettingRevealMutationRestore.ts` is now the thin restore orchestrator.
  - `state/actions/uiSettingRevealMutationSnapshots.ts` is now the
    compatibility facade, `uiSettingRevealPaneActivation.ts` owns requested
    active-section selection plus pane-opening writes,
    `uiSettingRevealStepActivation.ts` owns watch-code portal, accordion, and
    project-chat-aux activation writes, `uiSettingRevealActivation.ts` is now
    the thin compatibility facade, `uiSettingRevealActivationShared.ts` owns
    shared activation helpers, `uiSettingRevealDom.ts` owns DOM
    anchor/highlight behavior, and `uiSettingRevealShared.ts` owns
    execution-status helpers.
  - `state/hooks/sectionSizingPolicyDims.ts` owns section sizing-policy reads
    and section size-mode resolution, while
    `state/hooks/sectionMinMaxDims.ts` owns the measured min/max dimension
    derivation path for section surfaces.
  - `state/hooks/sectionScrollability.ts` owns the shared overflow observer used
    by Browser, Chat, TextBlock, Group, and params surfaces.
  - `state/hooks/sectionAspectRatioSizing.ts` owns draw/social/media aspect-ratio
    sizing writes and draw-canvas size normalization.
  - `state/actions/sections/sectionSizeGeometry.ts` owns pure section sizing
    math, resize-direction helpers, and auto-size promotion helpers.
  - `state/actions/sections/sectionSizeState.ts` owns local section-size writes
    plus parent or sibling width propagation.
  - `state/actions/sections/sectionSizePersistence.ts` owns optimistic
    persisted section-size writes and raw `setSectionSizes` transport.
  - `state/actions/sections/sectionSizes.ts` is now the thin compatibility
    facade over those narrower section-size owners.
  - `state/hooks/sectionSizes.ts` is now a thin compatibility surface that
    re-exports the narrower hook owners.
  - `state/hooks/terminals/terminal.ts` now just orchestrates terminal mount,
    ready/focus wiring, and resize observation; `terminalSessionTransport.ts`
    owns websocket/session bootstrap plus stdin/output transport wiring,
    `terminalSessions.ts` owns cached session lookup, resize buffering, and
    lifecycle bookkeeping, and `terminalFit.ts` owns xterm
    fit/fallback/reflow behavior.
  - `utils/focusManager.ts` is now just the compatibility entrypoint;
    `focusManagerRegistry.ts` owns tab-scope registration plus focus tracking,
    `focusManagerNavigation.ts` owns generic scope traversal, and
    `focusManagerSections.ts` owns section/canvas focus helpers while
    `focusManagerElements.ts` owns focusable-element normalization and canvas
    ordering helpers.
  - `state/hooks/*` owns reusable hooks layered on top of stores and actions.
  - `state/types/*` and `state/utils/*` own state-local models and helper logic.

- Shared UI infrastructure

  - `components/Utils/*` owns reusable UI primitives, comboboxes, CodeMirror
    wrappers, floating/resizable helpers, and context menu infrastructure.
  - `utils/*` is reserved for low-level cross-feature helpers and protocol glue,
    not feature-specific ownership.

- Forks
  - `forks/dnd-kit/*` and `forks/xyflow/*` are vendored or adapted fork surfaces.
  - If a cleanup slice primarily lives under `frontend/src/forks/**`, use
    `docs/plans/frontend-forks-cleanup-plan.md` before expanding the slice.

## Where New Code Goes

- Keep helpers, selectors, adapters, and tests with the owning feature first. If
  a behavior only exists for `ProjectLevelAI`, it should start there rather than
  in `utils/`.
- Prefer `state/stores/*` for domain-owned Zustand modules. Only extend
  `state/definitions.ts` when the state is truly cross-feature or when a thin
  shared re-export improves discovery. Feature-local derived reads should stay
  beside the owning feature as selectors or pure helpers.
- Add named command functions for mutations. Avoid new ad hoc
  `useStore.getState()` or `setState()` reach-through from render-heavy
  components when an owning command module can hold the write path instead.
- Put non-trivial generated endpoint usage behind a feature-local adapter or
  helper instead of spreading `route_*` calls through leaf render components.
- Reserve `components/Utils/*` for reusable primitives with clear cross-feature
  ownership. Do not move feature logic there just because it is shared by two
  nearby files.
- Keep fork-specific adapters close to the fork or consuming feature instead of
  burying them in generic helpers.

## Guardrails

- Preferred size for new or refactored production files: under `500` lines.
- Review threshold: `800` lines. Crossing it should be deliberate, with helper
  seams or a follow-up cleanup path already identified.
- Prefer pure `select*`, `build*`, `resolve*`, or `compute*` helpers for heavy
  derivation so tests can run without React.
- Put tests beside the code as `*.test.ts(x)` or `*.perf.test.ts(x)`. Use
  Playwright under `frontend/tests/e2e/` for user-facing flows.
- Keep `utils/` low-level. If a helper needs project-chat semantics, store
  knowledge, or pane ownership context, it likely belongs closer to that feature.

## Likely Next Cleanup Slices

- `state/actions/sections/createSectionFileOpenCommands.ts` now owns the
  remaining per-impl file-open command cluster, so any follow-up there should
  stay local to opened-file section commands instead of regrowing the drop
  router or `state/actions/sections/createSections.ts`.
- `state/actions/chatHistoryEntries.ts`,
  `state/actions/chatHistoryProvenance.ts`,
  `state/actions/chatHistoryShared.ts`, and
  `state/actions/chatHistoryTypes.ts` now split thread-entry derivation,
  provenance lookups, shared run filtering/grouping, and shared history types,
  so follow-up cleanup there should stay local to one of those owners instead
  of regrowing `state/actions/chatHistory.ts`.
- `state/actions/chatBranchState.ts`,
  `state/actions/chatBranchEditing.ts`, and
  `state/actions/chatBranchIndexState.ts` now split branch bootstrap or
  message-sync behavior, edited-message branch creation, and branch-index
  derivation, so follow-up cleanup there should stay local to one of those
  owners instead of regrowing `state/actions/chatBranches.ts`.
- `state/actions/windowSpaceWorkspaceRestoreReuse.ts` now owns the saved-layout
  reuse-owner matching rules, so any follow-up there should stay local to
  restore owner-key helpers instead of regrowing the remap or layout planners.
- `state/actions/agenticEdgeConnections.ts` now owns agentic-edge handle
  normalization, connection validation, and kind resolution,
  `state/actions/agenticEdgeShapeMutations.ts` now owns optimistic
  create/update shape mutations, `state/actions/agenticEdgeSelectionMutations.ts`
  now owns selection/delete flows, and
  `state/actions/agenticEdgeMutations.ts` plus `state/actions/agenticEdges.ts`
  are now thin compatibility facades; follow-up cleanup there should stay
  local to one of those owners instead of regrowing
  `state/actions/agenticEdges.ts`.
- `state/actions/edgeHandleKeys.ts` now owns pure edge-handle key derivation,
  `state/actions/edgeHandleRegistration.ts` now owns registry/shared-element
  registration writes, `state/actions/edgeHandlePositionState.ts` now owns
  direct handle-position recompute/update helpers, and
  `state/actions/edgeHandlePositionScheduler.ts` now owns RAF-batched
  section-scoped position refreshes. `state/actions/edgeHandles.ts` is now a
  thin compatibility facade, so follow-up cleanup there should stay local to
  one of those owners instead of regrowing `state/actions/edgeHandles.ts`.
- `state/actions/uiSettingRevealMutationCapture.ts` now owns reveal snapshot
  capture plus failure-result assembly, while
  `state/actions/uiSettingRevealMutationApply.ts` now owns high-level reveal
  mutation orchestration plus mismatch/failure handling,
  `state/actions/uiSettingRevealMutationLeaseLifecycle.ts` now owns
  mutation-lease rollback/finalization, and
  `state/actions/uiSettingRevealMutationLock.ts` now owns serialized reveal
  mutation locking. `state/actions/uiSettingRevealMutations.ts` is now a thin
  compatibility facade over those owners, while
  `state/actions/uiSettingRevealMutationLocalStorageRestore.ts`,
  `state/actions/uiSettingRevealMutationProjectStateRestore.ts`, and
  `state/actions/uiSettingRevealMutationRecordRestore.ts` now own the narrowed
  rollback helpers with `state/actions/uiSettingRevealMutationRestore.ts` as
  the thin orchestrator; follow-up cleanup there should stay local to one of
  those owners instead of regrowing
  `state/actions/uiSettingRevealMutationSnapshots.ts`.
- `state/actions/aiChatSubmissionMessages.ts`,
  `state/actions/aiChatSubmissionEdits.ts`,
  `state/actions/aiChatSubmissionResponse.ts`,
  `state/actions/aiChatSubmission.ts`,
  `state/actions/aiChatSubmissionRequestPayload.ts`,
  `state/actions/aiChatSubmissionPayload.ts`, and
  `state/actions/aiChatSubmissionEngineResolution.ts` now split optimistic
  new-message submission, edited-message pending lifecycle, shared backend send
  plus hydration refresh, thin compatibility exports, shared request-payload
  assembly, app-generation or edited-message request preparation, and
  edited-chat engine fallback resolution; follow-up cleanup there should stay
  local to one of those owners instead of regrowing the old `ai.ts` surface.
- `state/actions/windowSpaceSnapshotCapture.ts` and
  `state/actions/windowSpaceSnapshotRestoreConversion.ts`,
  `state/actions/windowSpaceSnapshotRestoreSectionBindings.ts`,
  `state/actions/windowSpaceSnapshotRestoreInstanceIds.ts`, and
  `state/actions/windowSpaceSnapshotRestore.ts` now split saved workspace
  snapshot building, restore conversion, section-binding dedupe, instance-id
  restore helpers, and compatibility re-exports, so follow-up cleanup there
  should stay local to those owners instead of regrowing
  `state/actions/windowSpaces.ts`.
- `state/actions/params/paramTreeStructure.ts`,
  `state/actions/params/paramTreeSelection.ts`, and
  `state/actions/params/paramTree.ts` now split param ancestry/tree derivation
  from selection and insertion helpers, so follow-up param DnD cleanup should
  stay local to those owners instead of regrowing the old shared tree module.
- `state/actions/appSessionStoredState.ts`,
  `state/actions/appSessionBootstrap.ts`,
  `state/actions/appSessionRunCount.ts`, and
  `state/actions/appSessionState.ts` now split app-session stored-state
  hydration or reset, bootstrap or recovery entrypoints, run-count persistence,
  and compatibility re-exports, so follow-up app-mode cleanup should stay local
  to those owners instead of regrowing the old shared session module.
- `state/actions/customRunStorage.ts`,
  `state/actions/customRunQueries.ts`,
  `state/actions/customRunExecution.ts`, and
  `state/actions/customRuns.ts` now split local custom-run persistence, run
  list derivation, execution or continuous-run control, and compatibility
  re-exports, so follow-up run-surface cleanup should stay local to those
  owners instead of regrowing the old shared custom-run module.
- `state/actions/runCodeExecution.ts`,
  `state/actions/runCodeControls.ts`, and
  `state/actions/runOrImportCode.ts` now split backend run payload assembly
  from main-run and stop controls plus compatibility re-exports, so follow-up
  run-surface cleanup should stay local to those owners instead of regrowing
  the old mixed run action module.
- `state/actions/sectionFeatureSelectors.ts` should keep owning managed-chat
  authority and param display-name selectors instead of regrowing
  `state/actions/sectionEffectiveImplSelectors.ts`.
- `state/actions/sectionStreamingMerge.ts`,
  `state/actions/sectionShownParams.ts`, `state/actions/sectionHierarchy.ts`,
  and `state/actions/sectionToolArgumentPreview.ts` should stay feature-local
  and avoid regrowing `state/actions/sectionInfos.ts`.
- `state/actions/websocketLifecycleState.ts`,
  `websocketLifecycleHandlers.ts`, `websocketLifecycle.ts`,
  `websocketBootstrap.ts`, `websocketAuthRecovery.ts`, and
  `websocketShareSessionRecovery.ts` now split lifecycle state, listener or
  reconnect handling, public open transport, bootstrap, auth recovery, and
  share-session restoration, so any future websocket cleanup should keep
  extending those owners instead of rebuilding the facade
- `components/Utils/Resizable/CustomResizable.tsx` now delegates resize
  lifecycle, auto-size promotion, and resize-event emission to
  `components/Utils/Resizable/useCustomResizableBehavior.ts`, pure clamp/auto-
  clamp plus auto-only size-mode update derivation to
  `components/Utils/Resizable/customResizableSizing.ts`, handle chrome plus
  direction parsing to `components/Utils/Resizable/customResizableChrome.ts`,
  pure section sizing math and resize-direction helpers to
  `state/actions/sections/sectionSizeGeometry.ts`, local size writes plus width
  propagation to `state/actions/sections/sectionSizeState.ts`, and optimistic
  section-size persistence to `state/actions/sections/sectionSizePersistence.ts`;
  follow-up work here should stay local to one of those owners instead of
  growing the composition surface again
- shared project chat surfaces under `components/Chat/*`,
  `components/Panes/Overview/ProjectLevelAI/*`, and `components/ChatWindowing/*`
