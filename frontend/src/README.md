# Frontend Source Map

This is the shortest path to "where does this behavior live?" for authored frontend
code under `frontend/src`.

Generated modules under `frontend/src/utils/generated*` are intentionally excluded
from this map. Treat them as source-of-truth protocol outputs, then add
feature-local adapters around them when the consuming surface is non-trivial.

## Current Snapshot

- Snapshot date: `2026-03-15`
- Authored TS/TSX files under `frontend/src`: `1096`
- Non-generated TS/TSX files at `1000+` lines: `41`
- Biggest current production hotspots:
  - `components/Chat/ChatMessages.tsx` (`7959`)
  - `components/ChatWindowing/ProjectChatBottomDock.tsx` (`4994`)
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
  - `components/Panes/Overview/ProjectLevelAI/*` owns project chat orchestration,
    hydration authority, starter prompts, slash command selection, skill viewers,
    and project AI settings.
  - `state/actions/aiChatStreaming.ts` owns the public streaming entrypoint
    plus managed-chat detail updates.
  - `state/actions/aiChatStreamingRouting.ts` owns placeholder filtering,
    chatId-to-section routing, stream-active tracking, section persistence, and
    scope-violation side effects for streaming chunks.
  - `state/actions/aiChatStreamingMessages.ts` owns shared message delta,
    finalized-assistant merge, and message upsert helpers used by chat streaming
    and tool-preview updates.
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
  - `state/actions/chat*.ts` owns the remaining chat merge utilities.
  - `state/actions/projectChatThreadGroupMutations.ts` owns persisted project
    chat thread group creation, rename, collapse, pin, reorder, assignment, and
    deletion behavior.
  - `state/actions/projectChatThreadMutations.ts` owns persisted per-thread
    viewed, pin, reorder, and delete behavior.
  - `state/actions/projectChatThreadStorageUndo.ts` owns the local thread/group
    delete undo stack and restoration logic.
  - `state/actions/projectChatThreads.ts` is now a thin compatibility surface
    that re-exports the thread-group, thread, and undo owners.
  - `state/actions/aiHydrationOutcome.ts` owns managed/external hydration route
    probes, outcome typing, and failure classification.
  - `state/actions/aiHydrationApply.ts` owns managed/external chat hydration
    store reconciliation plus chat-section persistence sync.
  - `state/actions/aiHydration.ts` is now the thin public hydration facade that
    composes the outcome and apply owners.
  - `state/actions/aiAgentRuns.ts` owns agent-run loading, retries, and
    single-run/update reconciliation.
  - `state/actions/aiChatSubmission.ts` owns chat submission/edit orchestration
    plus pending-surface promotion flow, while
    `state/actions/aiChatSubmissionPayload.ts` owns request payload assembly,
    app-generation request metadata, and edited-chat engine fallback
    resolution.
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
  - `state/actions/aiPendingChatState.ts` owns surface-scoped pending drafts,
    pending app-generation state, and promotion into materialized chats.
  - `state/actions/aiLLMConfiguration.ts` owns LLM config loading/saving plus
    managed API-key snapshot, conflict, and persistence behavior.
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
  - `state/actions/aiTranscription.ts` owns provider dictation decode,
    resample, chunk, and upload orchestration.
  - `state/actions/aiTranscriptionSessions.ts` owns provider session transport,
    request error handling, and chunk-size policy.
  - `state/actions/aiTranscriptionProfiles.ts` owns transcription-profile load,
    websocket/store snapshot updates, and CRUD behavior.

- Project chat windowing

  - `components/ChatWindowing/*` owns dock/window rendering, surface ids, snap
    layout helpers, and viewport math.
  - `state/actions/projectChatWindowingNormalization.ts` owns pure windowing
    normalization and default-bounds helpers.
  - `state/actions/projectChatWindowingSelectors.ts` owns section-binding and
    visible-window selector reads.
  - `state/actions/projectChatWindowingInstanceState.ts` owns window-instance
    creation, next-instance-id allocation, and per-window update helpers.
  - `state/actions/projectChatWindowingPlacementState.ts` owns placement,
    maximize/unmaximize, close/minimize/reopen, and focus reducers.
  - `state/actions/projectChatWindowingBoundsState.ts` owns dock-fraction and
    floating-bounds reducers.
  - `state/actions/projectChatWindowingLayoutState.ts` is now a thin
    compatibility surface that re-exports the instance, placement, and bounds
    owners.
  - `state/actions/projectChatWindowingState.ts` owns section-binding, title,
    chat-id, and section/canvas transition reducers.
  - `state/actions/projectChatWindowingCanvasBoot.ts` owns DOM surface lookup,
    canvas boot positioning/sizing, and the section boot flow from windowed
    chat surfaces back into the canvas.
  - `state/actions/projectChatWindowingTrackedGitPane.ts` owns tracked git-pane
    graph window reuse plus maximize/title coordination.
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
  - `state/actions/projectChatWindowingAuthoritative.ts` and
    `state/actions/projectChatWindowingEphemeral.ts` already hold narrower helper
    seams and should be extended instead of recreated elsewhere.

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

- Section rendering and params

  - `components/Section/*` owns section containers, headers, layouts, and shared
    section chrome.
  - `components/Params/*` owns param rendering and param-specific input controls.
  - `state/actions/sections/createSections.ts` now owns top-level section
    creation commands plus empty-space add actions.
  - `state/actions/sections/createSectionCatalog.ts` owns section creation
    menu types, grouped factory defaults, and `useCreateSectionsList`.
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

- Browser and file management

  - `components/Panes/Overview/FileBrowser/*` owns file browsing panes and file
    browser editors.
  - `components/Section/Layouts/BrowserArea.tsx` owns the browser section layout.
  - `utils/fileBrowser*.ts`, `utils/browserPaths.ts`, and nearby helpers own the
    pure file-browser derivation and path utilities.

- Git surfaces

  - `components/Panes/Overview/Git/*` and `components/Git/*` own the git pane,
    diff overlay, graph overlay, and embedded graph window UI.
  - `state/actions/gitStatusAndDiff.ts` owns git status refresh, diff
    availability, diff overlay opening, and diff-mode switching.
  - `state/actions/gitGraphLog.ts` owns git graph overlay boot, graph/log
    loading, pagination, and graph filter/all-refs refresh behavior.
  - `state/actions/gitGraphSelection.ts` owns selected-commit clearing plus
    commit details/file-diff selection behavior.
  - `state/actions/gitGraphState.ts` owns current project-config lookup plus
    reusable graph/selection state builders.
  - `state/actions/gitGraph.ts` is now a thin compatibility surface that
    re-exports the log and selection owners.
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

  - `state/definitions.ts` is now the shared index for the remaining
    cross-feature Zustand stores plus the atomic project-store publication
    helpers on this branch. It is down to `404` lines after moving the AI/chat,
    app runtime, session/share, browser, search, feedback/status,
    layout-interaction, UI-preference, and editor-diagnostics clusters into
    domain-owned modules.
  - `state/stores/aiStores.ts` owns the AI/chat Zustand stores and chat-specific
    store types such as `ChatDetails`, `ChatBranchInfo`, and
    `ProjectChatCustomSlashCommand`.
  - `state/stores/appStores.ts` owns app definition/config/preview state used by
    app-mode rendering, app preview, and app deployment surfaces.
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
  - `state/stores/searchStores.ts` owns home-page search plus project search
    state used by the header search surfaces and param search highlighting.
  - `state/stores/sessionStores.ts` owns share-session, server-mode, and
    all-project-metadata state used across IDE/share/app/launcher flows.
  - `state/stores/uiPreferenceStores.ts` owns persisted UI chrome preferences
    plus shared settings state used by panes, shortcuts, minimap/grid behavior,
    and project-chat local preference surfaces.
  - `state/storePersistStorage.ts` owns the shared persisted-storage fallback
    used by the persisted store modules.
  - `state/actions/*` owns named mutation and query helpers, with shared chat
    helpers split across `aiHydration.ts`, `aiHydrationApply.ts`,
    `aiHydrationOutcome.ts`, `aiAgentRuns.ts`,
    `aiChatSubmission.ts`, `aiChatControls.ts`, `aiExternalAgentStop.ts`,
    `aiChatStopState.ts`, `aiExternalAgentResponses.ts`, `aiChatState.ts`,
    `aiChatSectionState.ts`, and `aiPendingChatState.ts`.
  - `state/actions/sectionProjectStateSync.ts` owns backend project-state
    reconciliation, active-section sync, viewport updates, and project-chat
    windowing coordination for authoritative project snapshots.
  - `state/actions/sectionDisplayQueries.ts` owns top-level display selection,
    displayed-child tree derivation, node-map creation, DnD child reset, and
    view-mode visibility queries used by section rendering and project-state
    bootstrap flows.
  - `state/actions/projectStateCommands.ts` owns the shared project-state
    command entrypoints for section delete/group flows, param selection,
    viewport persistence, and all-project-metadata updates.
  - `state/actions/projectStateOptimisticUpdates.ts` owns the pending-operation
    queue and optimistic project-state mutation scaffolding used by shared state
    action modules.
  - `state/actions/websocketIncomingMessages.ts` owns frontend websocket
    payload dispatch, project/app snapshot routing, and `UISettingReveal` ACK
    handling.
  - `state/actions/websocketReceive.ts` is now a thin compatibility facade.
  - `state/actions/websocketLifecycle.ts` owns socket transport lifecycle,
    active-socket listener wiring, replacement, and reconnect scheduling.
  - `state/actions/websocketBootstrap.ts` owns socket-open connection
    registration, current-address send, project-state or diagnostics bootstrap,
    and deployment listener-coverage bootstrap.
  - `state/actions/websocketAuthRecovery.ts` owns auth-refresh polling,
    auth-loss recovery, and reconnect gating during authentication recovery.
  - `state/actions/websocketShareSessionRecovery.ts` owns share-session
    heartbeat sends plus share/app session restoration after websocket close
    codes.
  - `state/actions/websocketRealtime.ts` owns outbound realtime dependency
    events, section literal or binary sends, and binary upload fallback.
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
  - `state/actions/sectionLayoutQueries.ts` owns terminal attachment, section
    orientation, section type, and section-child queries that still depend on
    effective-impl selectors but no longer live beside the core derivation
    helpers.
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
  - `state/actions/windowSpacePersistence.ts` owns saved window-space sort/name/
    delete/create mutations plus optimistic persistence flow.
  - `state/actions/windowSpaceSnapshotCapture.ts` owns floating window-space
    snapshot building.
  - `state/actions/windowSpaceSnapshotRestore.ts` owns conversion from saved
    window-space state back into project-chat windowing state.
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
    orchestration and pressed-key bookkeeping;
    `state/actions/keyShortcutRegistrationGroups.ts` owns the grouped shortcut
    registration tables, `keyShortcutRegistrations.ts` owns the remaining
    Tab-vs-param binding decisions plus registry composition,
    `keyShortcutMatching.ts` owns shortcut parsing, event-code normalization,
    and shortcut matching, `keyShortcutInputPolicy.ts` owns editable-target and
    input-ignore policy, `keyShortcutUtils.ts` is now the thin compatibility
    facade, and
    `keyActivationHandlers.ts` owns `Tab`/`Escape`, section selection, and
    React Flow key-mode handlers.
  - `state/actions/uiSettingReveal.ts` now just orchestrates reveal requests;
    `uiSettingRevealMutations.ts` owns the mutation lock plus high-level reveal
    orchestration, `uiSettingRevealMutationOwnership.ts` owns lease sequence and
    touched-field ownership, `uiSettingRevealMutationCapture.ts` owns snapshot
    capture plus failure-result assembly, `uiSettingRevealMutationRestore.ts`
    owns rollback and owned restore application,
    `uiSettingRevealMutationSnapshots.ts` is now the compatibility facade,
    `uiSettingRevealActivation.ts` owns pane activation writes,
    `uiSettingRevealDom.ts` owns DOM anchor/highlight behavior, and
    `uiSettingRevealShared.ts` owns execution-status helpers.
  - `state/hooks/sectionMinMaxDims.ts` owns section sizing-policy reads plus
    measured min/max dimension derivation for section surfaces.
  - `state/hooks/sectionScrollability.ts` owns the shared overflow observer used
    by Browser, Chat, TextBlock, Group, and params surfaces.
  - `state/hooks/sectionAspectRatioSizing.ts` owns draw/social/media aspect-ratio
    sizing writes and draw-canvas size normalization.
  - `state/hooks/sectionSizes.ts` is now a thin compatibility surface that
    re-exports the narrower hook owners.
  - `state/hooks/terminals/terminal.ts` now just orchestrates terminal mount,
    ready/focus wiring, and resize observation; `terminalSessions.ts` owns
    cached terminal websocket sessions, and `terminalFit.ts` owns xterm
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
- `state/actions/windowSpaceWorkspaceRestoreReuse.ts` now owns the saved-layout
  reuse-owner matching rules, so any follow-up there should stay local to
  restore owner-key helpers instead of regrowing the remap or layout planners.
- `state/actions/agenticEdgeConnections.ts` now owns agentic-edge handle
  normalization, connection validation, and kind resolution, while
  `state/actions/agenticEdgeMutations.ts` now owns optimistic create/update/
  delete/selection commands; follow-up cleanup there should stay local to one
  of those owners instead of regrowing `state/actions/agenticEdges.ts`.
- `state/actions/uiSettingRevealMutationCapture.ts` now owns reveal snapshot
  capture plus failure-result assembly, while
  `state/actions/uiSettingRevealMutationRestore.ts` now owns rollback and owned
  restore helpers; follow-up cleanup there should stay local to one of those
  owners instead of regrowing `state/actions/uiSettingRevealMutationSnapshots.ts`.
- `state/actions/aiChatSubmission.ts` and
  `state/actions/aiChatSubmissionPayload.ts` now split pending-surface
  submission orchestration from request payload assembly; follow-up cleanup
  there should stay local to one of those owners instead of regrowing the old
  `ai.ts` surface.
- `state/actions/windowSpaceSnapshotCapture.ts` and
  `state/actions/windowSpaceSnapshotRestore.ts` now split saved workspace
  snapshot building from restore conversion helpers, so follow-up cleanup there
  should stay local to those owners instead of regrowing
  `state/actions/windowSpaces.ts`.
- `state/actions/sectionFeatureSelectors.ts` should keep owning managed-chat
  authority and param display-name selectors instead of regrowing
  `state/actions/sectionEffectiveImplSelectors.ts`.
- `state/actions/sectionStreamingMerge.ts`,
  `state/actions/sectionShownParams.ts`, `state/actions/sectionHierarchy.ts`,
  and `state/actions/sectionToolArgumentPreview.ts` should stay feature-local
  and avoid regrowing `state/actions/sectionInfos.ts`.
- `state/actions/websocketLifecycle.ts`, `websocketBootstrap.ts`,
  `websocketAuthRecovery.ts`, and `websocketShareSessionRecovery.ts` now split
  transport, bootstrap, auth recovery, and share-session restoration, so any
  future websocket cleanup should keep extending those owners instead of
  rebuilding the facade
- `components/Utils/Resizable/CustomResizable.tsx` now delegates resize
  lifecycle and optimistic persistence to
  `components/Utils/Resizable/useCustomResizableBehavior.ts`, pure clamp/auto-
  clamp decisions to `components/Utils/Resizable/customResizableSizing.ts`, and
  handle chrome plus direction parsing to
  `components/Utils/Resizable/customResizableChrome.ts`; follow-up work here
  should stay local to one of those owners instead of growing the composition
  surface again
- shared project chat surfaces under `components/Chat/*`,
  `components/Panes/Overview/ProjectLevelAI/*`, and `components/ChatWindowing/*`
