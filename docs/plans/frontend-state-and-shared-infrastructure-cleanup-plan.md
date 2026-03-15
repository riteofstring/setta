# Frontend State And Shared Infrastructure Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).

## Goal

Make shared frontend infrastructure legible by separating read models, mutation commands, optimistic sync helpers, and DOM interaction utilities.

## Scope

- In scope:
  - `frontend/src/state/**`
  - cross-cutting infrastructure under `frontend/src/components/Utils/**`
  - non-generated shared helpers in `frontend/src/utils/**`
- Out of scope:
  - generated endpoints/types
  - deep cleanup inside `frontend/src/forks/**`, which is tracked in [frontend-forks-cleanup-plan.md](./frontend-forks-cleanup-plan.md)
  - chat-specific cleanup already covered in [frontend-cleanup-plan.md](./frontend-cleanup-plan.md)

## Status Refresh (2026-03-14)

- Unlike the later `clean-code` branch, this branch still has a shared `frontend/src/state/definitions.ts` index, but AI/chat store ownership now lives in `frontend/src/state/stores/aiStores.ts`, app runtime state now lives in `frontend/src/state/stores/appStores.ts`, session/share state now lives in `frontend/src/state/stores/sessionStores.ts`, browser state now lives in `frontend/src/state/stores/fileBrowserStores.ts`, search state now lives in `frontend/src/state/stores/searchStores.ts`, feedback state now lives in `frontend/src/state/stores/feedbackStores.ts`, project-status state now lives in `frontend/src/state/stores/projectStatusStores.ts`, layout interaction state now lives in `frontend/src/state/stores/layoutInteractionStores.ts`, UI preference/config state now lives in `frontend/src/state/stores/uiPreferenceStores.ts`, editor diagnostics state now lives in `frontend/src/state/stores/editorDiagnosticsStores.ts`, and shared persist fallback logic lives in `frontend/src/state/storePersistStorage.ts`.
- `frontend/src/state/actions/aiHydration.ts`, `frontend/src/state/actions/aiAgentRuns.ts`, `frontend/src/state/actions/aiLLMConfiguration.ts`, `frontend/src/state/actions/aiConfigurationCatalogs.ts`, `frontend/src/state/actions/aiTranscription.ts`, `frontend/src/state/actions/aiTranscriptionSessions.ts`, `frontend/src/state/actions/aiTranscriptionProfiles.ts`, `frontend/src/state/actions/aiChatSubmission.ts`, `frontend/src/state/actions/aiChatControls.ts`, `frontend/src/state/actions/aiExternalAgentStop.ts`, `frontend/src/state/actions/aiChatStopState.ts`, `frontend/src/state/actions/aiExternalAgentResponses.ts`, `frontend/src/state/actions/aiChatState.ts`, `frontend/src/state/actions/aiPendingChatState.ts`, `frontend/src/state/actions/aiInterruptedAssistantMessages.ts`, `frontend/src/state/actions/aiChatStreaming.ts`, `frontend/src/state/actions/aiChatStreamingMessages.ts`, `frontend/src/state/actions/aiChatStreamingSectionState.ts`, and `frontend/src/state/actions/aiChatStreamingTools.ts` now carry the hydration, agent-run, config/API-key, settings-catalog, transcription orchestration, transcription transport, transcription-profile, submission, chat-control, external stop/recovery, local stop-state, external approval/question response, chat-detail, pending-draft, interruption-tracking, and streaming behavior that previously lived in `frontend/src/state/actions/ai.ts`; future cleanup should keep extending those seams instead of merging behavior back.
- `frontend/src/state/actions/projectChatWindowing.ts` now delegates pure
  windowing normalization and selection to `projectChatWindowingSelectors.ts`,
  instance lifecycle to `projectChatWindowingInstanceState.ts`,
  placement/focus reducers to `projectChatWindowingPlacementState.ts`,
  dock-fraction/bounds reducers to `projectChatWindowingBoundsState.ts`,
  compatibility re-exports to `projectChatWindowingLayoutState.ts`,
  section-binding reducers to `projectChatWindowingState.ts`, canvas boot and
  DOM surface lookup to `projectChatWindowingCanvasBoot.ts`, tracked git-pane
  graph window reuse to `projectChatWindowingTrackedGitPane.ts`, public window
  lifecycle/placement/focus/bounds commands to `projectChatWindowCommands.ts`,
  title/chat-id commands plus current-windowing reads to
  `projectChatWindowMetadataCommands.ts`, section exposure and mode-transition
  commands to `projectChatWindowSectionCommands.ts`, write-state reads plus
  optimistic apply helpers to `projectChatWindowingWriteState.ts`,
  pending-mutation queueing to `projectChatWindowingWriteQueue.ts`,
  authoritative publish/replay plus send helpers to
  `projectChatWindowingWritePublish.ts`, explicit sync/flush helpers to
  `projectChatWindowingWriteSync.ts`, serialized orchestration to
  `projectChatWindowingWritePipeline.ts`, and the public mutation facade to
  `projectChatWindowingWrites.ts`, alongside
  `projectChatWindowingAuthoritative.ts` and
  `projectChatWindowingEphemeral.ts`; future cleanup should keep building on
  those seams.
- `frontend/src/state/actions/sectionProjectStateSync.ts` now owns backend
  project-state reconciliation, active-section sync, viewport updates, and
  project-chat windowing coordination that previously lived in
  `frontend/src/state/actions/sectionInfos.ts`; future cleanup should keep
  importers on the dedicated sync entrypoint instead of routing snapshot
  handling back through the query/mutation surface.
- `frontend/src/state/actions/projectStateCommands.ts` now owns shared
  project-state command entrypoints for section delete/group flows, param
  selection, viewport persistence, and all-project-metadata updates that
  previously lived in `frontend/src/state/actions/sectionInfos.ts`.
- `frontend/src/state/actions/projectStateOptimisticUpdates.ts` now owns the
  pending-operation queue plus optimistic project-state mutation scaffolding
  that previously lived in `frontend/src/state/actions/sectionInfos.ts`.
- `frontend/src/state/actions/topLevelSectionLayouts.ts` now owns active-view
  top-level layout selection plus top-level layout snapshot building, and
  `frontend/src/state/actions/topLevelLayoutPersistence.ts` now owns pending-op
  reconciliation plus debounced backend persistence for top-level section
  layout writes that previously lived in `frontend/src/state/actions/sectionInfos.ts`.
- `frontend/src/state/actions/sectionEffectiveImplCore.ts` now owns effective
  section/code-object derivation, cache invalidation, and low-level entity
  lookups, while `frontend/src/state/actions/sectionEffectiveImplSelectors.ts`
  now owns typed current-section/current-code-object selectors, managed-chat
  checks, and param display-name helpers; `frontend/src/state/actions/sectionEffectiveImpls.ts`
  is now a thin compatibility facade over those owners, while
  `frontend/src/state/actions/sectionLayoutQueries.ts` now owns terminal
  attachment, section orientation, section type, and section-child queries that
  previously lived in `frontend/src/state/actions/sectionInfos.ts` and
  `frontend/src/state/actions/sectionEffectiveImpls.ts`; future cleanup should
  keep new effective-impl reads, section layout queries, and local impl writes
  on those dedicated surfaces instead of adding them back to the remaining
  metadata/query file.
- `frontend/src/state/actions/sectionDisplayQueries.ts` now owns top-level
  display selection, displayed-child tree derivation, node-map creation, DnD
  child reset, and view-mode visibility queries that previously lived in
  `frontend/src/state/actions/sectionInfos.ts`; future cleanup should keep new
  section-render/display queries on that dedicated surface instead of adding
  them back to the remaining streaming/tool-preview helper file.
- `frontend/src/state/actions/sectionStreamingMerge.ts` now owns streaming chat
  merge reconciliation for backend project-state snapshots,
  `frontend/src/state/actions/sectionShownParams.ts` now owns shown-param and
  pinned-param helpers, `frontend/src/state/actions/sectionHierarchy.ts` now
  owns ancestry/descendant helpers plus reset-to-default and parent-child
  mutation helpers, and
  `frontend/src/state/actions/sectionToolArgumentPreview.ts` now owns
  tool-preview cleanup; `frontend/src/state/actions/sectionInfos.ts` is now a
  thin compatibility facade over those dedicated surfaces.
- `frontend/src/state/actions/websocketIncomingMessages.ts` now owns frontend
  websocket payload dispatch, project/app snapshot routing, and
  `UISettingReveal` ACK handling that previously lived in
  `frontend/src/state/actions/websocketReceive.ts`; future cleanup should keep
  new incoming websocket event handlers on that dedicated module instead of
  mixing them back into socket transport and outbound realtime send logic.
- `frontend/src/state/actions/websocketBootstrap.ts` now owns socket-open
  connection registration, current-address sends, project-state or diagnostics
  bootstrap, and deployment listener-coverage bootstrap, while
  `frontend/src/state/actions/websocketAuthRecovery.ts` now owns auth-refresh
  polling plus auth-loss reconnect recovery, and
  `frontend/src/state/actions/websocketShareSessionRecovery.ts` now owns
  share-session heartbeat and share/app session restoration that previously
  lived in `frontend/src/state/actions/websocketLifecycle.ts`; future cleanup
  should keep websocket bootstrap and recovery flows on those dedicated
  surfaces instead of mixing them back into lifecycle wiring.
- `frontend/src/state/actions/windowSpacePersistence.ts` now owns saved
  window-space sort/name/delete/create mutations plus optimistic persistence,
  and `frontend/src/state/actions/windowSpaceSnapshots.ts` now owns floating
  snapshot building plus conversion back into project-chat windowing state that
  previously lived in `frontend/src/state/actions/windowSpaces.ts`.
- `frontend/src/state/actions/windowSpaceWorkspaceRestoreReuse.ts` now owns
  floating-window reuse, owner-key resolution, and superseded-floating
  selection that previously lived in
  `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts`, while
  `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts` now owns
  restored-instance remapping, section-host collision drops, and deduped merge
  policy, `frontend/src/state/actions/windowSpaceWorkspaceRestoreLayout.ts`
  now owns the remaining workspace-restore planning and combined
  next-windowing result, `frontend/src/state/actions/windowSpaceWorkspaceRestoreVisibility.ts`
  now owns restored git-pane visibility planning, and
  `frontend/src/state/actions/windowSpaceWorkspaceRestorePlan.ts` is the thin
  composition entrypoint for those restore helpers.
- `frontend/src/state/actions/windowSpaceProjectChatThreadRestore.ts` now owns
  deployment-policy restore gating plus saved project-chat thread rebound that
  previously lived in `frontend/src/state/actions/windowSpaces.ts`.
- `frontend/src/state/actions/projectChatWindowingSelectors.ts` now owns pure
  windowing normalization, selection, and default-bounds helpers that
  previously lived in `frontend/src/state/actions/projectChatWindowingState.ts`.
- `frontend/src/state/actions/projectChatWindowingInstanceState.ts` now owns
  window-instance creation, next-instance-id allocation, and shared per-window
  update helpers, `frontend/src/state/actions/projectChatWindowingPlacementState.ts`
  now owns placement/focus reducers, and
  `frontend/src/state/actions/projectChatWindowingBoundsState.ts` now owns
  dock-fraction/bounds reducers that previously lived in
  `frontend/src/state/actions/projectChatWindowingState.ts`, while
  `frontend/src/state/actions/projectChatWindowingLayoutState.ts` is now the
  compatibility surface that re-exports those owners.
- `frontend/src/state/actions/projectChatWindowingState.ts` now owns
  section-binding, title/chat-id, and section/canvas transition reducers that
  previously lived in `frontend/src/state/actions/projectChatWindowing.ts`.
- `frontend/src/state/actions/projectChatWindowingWriteState.ts` now owns
  layout write permissions, current-windowing store access, and optimistic
  apply helpers that previously lived in
  `frontend/src/state/actions/projectChatWindowing.ts`, while
  `frontend/src/state/actions/projectChatWindowingWriteQueue.ts` now owns
  pending-mutation queueing plus write barriers and flush coordination,
  `frontend/src/state/actions/projectChatWindowingWritePublish.ts` now owns
  authoritative publish/replay plus tracked response/send helpers,
  `frontend/src/state/actions/projectChatWindowingWriteSync.ts` now owns
  explicit sync/flush helpers, and
  `frontend/src/state/actions/projectChatWindowingWritePipeline.ts` is now the
  thin serialized write orchestrator, reducing
  `frontend/src/state/actions/projectChatWindowingWrites.ts` to the public
  mutation facade.
- `frontend/src/state/actions/projectChatThreadGroupMutations.ts` now owns
  persisted project-chat thread group creation, rename, collapse, pin, reorder,
  assignment, and deletion behavior, `frontend/src/state/actions/projectChatThreadMutations.ts`
  now owns per-thread viewed, pin, reorder, and delete behavior, and
  `frontend/src/state/actions/projectChatThreadStorageUndo.ts` now owns the
  local delete undo stack and restoration logic that previously lived in
  `frontend/src/state/actions/projectChatThreads.ts`.
- `frontend/src/state/actions/gitGraphLog.ts` now owns git graph overlay boot,
  git graph/log loading, pagination, and graph filter/all-refs refresh
  behavior, `frontend/src/state/actions/gitGraphSelection.ts` now owns
  selected commit clearing plus commit details/file-diff selection, and
  `frontend/src/state/actions/gitGraphState.ts` now owns reusable graph state
  builders and current project-config lookup, while
  `frontend/src/state/actions/gitStatusAndDiff.ts` continues to own git status
  refresh, diff availability, diff overlay opening, and diff-mode switching
  that previously lived in `frontend/src/state/actions/git.ts`.
- `frontend/src/state/actions/aiChatStreamingTools.ts` now owns tool-call
  placeholder reconciliation, tool-preview store updates, preview cleanup, and
  app-spec/app-definition tool handling that previously lived in
  `frontend/src/state/actions/aiChatStreaming.ts`.
- `frontend/src/state/actions/aiChatStreamingMessages.ts` now owns shared
  message delta reducers, finalized-assistant merge helpers, and message
  upserts used by the chat streaming and tool-preview owners.
- `frontend/src/state/actions/aiChatStreamingSectionState.ts` now owns managed
  chat-section stream reconciliation plus active-branch message sync that
  previously lived in `frontend/src/state/actions/aiChatStreaming.ts`.
- `frontend/src/state/actions/uiSettingReveal.ts` is now a 360-line orchestration
  entrypoint; `uiSettingRevealMutations.ts` now owns the mutation lock plus
  high-level reveal orchestration, `uiSettingRevealMutationOwnership.ts` owns
  lease sequence and touched-field ownership, `uiSettingRevealMutationSnapshots.ts`
  owns snapshot capture and rollback application, `uiSettingRevealActivation.ts`
  owns pane/accordion activation writes, `uiSettingRevealDom.ts` owns anchor
  lookup and highlighting, and `uiSettingRevealShared.ts` owns
  execution-context/status helpers.
- `frontend/src/state/actions/keyActivations.ts` is now a 284-line listener
  orchestration entrypoint; `keyShortcutRegistrations.ts` owns grouped shortcut
  registration, `keyShortcutUtils.ts` owns shortcut parsing, event-code
  normalization, and input-ignore policy, and `keyActivationHandlers.ts` owns
  `Tab`/`Escape`, section-selection, and React Flow key-mode handlers.
- `frontend/src/state/hooks/terminals/terminal.ts` is now a 248-line React hook
  orchestration layer; `terminalSessions.ts` owns cached websocket session
  reuse and transport wiring, and `terminalFit.ts` owns xterm
  fit/fallback/reflow behavior.
- `frontend/src/utils/constants.ts` is still unsplit on this branch, so shared-infrastructure cleanup is still high leverage.
- Shared infrastructure cleanup will still cross fork boundaries at times, but if a slice becomes primarily about code under `frontend/src/forks/**` it should use the more specific companion plan instead of expanding this one.

## Current State (Observed)

- `frontend/src/state` plus shared infrastructure files in `components/Utils`
  and `utils` total about 90.1k lines of authored code in the sampled
  directories.
- The largest remaining authored state surfaces are:
  - `frontend/src/state/actions/stateMachineEdgeGraph.ts` at 286 lines
  - `frontend/src/state/actions/sectionEffectiveImplSelectors.ts` at 270 lines
  - `frontend/src/state/actions/projectChatWindowCommands.ts` at 255 lines
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts` at 198 lines
  - `frontend/src/state/actions/sections/createSectionFileOpenCommands.ts` at 195 lines
  - `frontend/src/state/actions/projectChatWindowingWriteQueue.ts` at 175 lines
  - `frontend/src/state/actions/aiExternalAgentStop.ts` at 168 lines
- The biggest shared-infrastructure hotspots in this companion-plan domain are:
  - `frontend/src/components/Utils/MediaCarousel.tsx` at 605 lines
  - `frontend/src/state/actions/stateMachineEdgeGraph.ts` at 286 lines
  - `frontend/src/state/actions/sectionEffectiveImplSelectors.ts` at 270 lines
  - `frontend/src/state/actions/projectChatWindowCommands.ts` at 255 lines
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts` at 198 lines
  - `frontend/src/state/actions/sections/createSectionFileOpenCommands.ts` at 195 lines
  - `frontend/src/state/actions/projectChatWindowingWriteQueue.ts` at 175 lines
  - `frontend/src/state/actions/aiExternalAgentStop.ts` at 168 lines
- `websocketReceive.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
- `websocketLifecycle.ts` now owns:
  - websocket transport lifecycle and reconnect behavior
  - active-socket listener wiring, replacement, and reconnect scheduling
- `websocketBootstrap.ts` now owns:
  - socket-open connection registration and current-address sends
  - project-state and diagnostics bootstrap for IDE mode
  - deployment listener-coverage bootstrap
- `websocketAuthRecovery.ts` now owns:
  - auth-refresh polling and auth-loss reconnect recovery
  - reconnect gating while authentication is missing
- `websocketShareSessionRecovery.ts` now owns:
  - share-session heartbeat sends for deployment-mode websockets
  - share/app session restoration after missing or unknown close codes
- `websocketRealtime.ts` now owns:
  - outbound realtime dependency events and section literal updates
  - binary realtime sends plus oversize upload fallback
- `websocketRuntime.ts` now owns:
  - active websocket instance and generation tracking
  - low-level JSON and binary send helpers shared by lifecycle and realtime owners
- `stateMachineEdges.ts` now owns:
  - compatibility re-exports for workflow edge callers that have not moved yet
- `stateMachineEdgeCanonicalization.ts` now owns:
  - workflow handle normalization and shared-chat workflow port canonicalization
- `stateMachineEdgeGraph.ts` now owns:
  - section-type and machine-group reads used to validate candidate connections
  - machine-group resolution plus merge snapshot or apply or restore helpers
- `stateMachineEdgeConnections.ts` now owns:
  - workflow connection validation
  - workflow edge construction from a validated connection
- `stateMachineEdgeMutations.ts` now owns:
  - workflow edge creation plus merge-aware optimistic persistence
  - workflow edge selection, deletion, and replace commands
- `CustomResizable.tsx` now owns:
  - resize-surface composition and `ResizableWithScale` wiring
  - share-capability gating and active-handle state bridging into handle chrome
- `useCustomResizableBehavior.ts` now owns:
  - resize lifecycle and double-click tracking
  - auto-size promotion, auto-clamp, and optimistic section-size persistence
  - resize event emission into shared layout-interaction state
- `customResizableSizing.ts` now owns:
  - pure clamp and auto-clamp sizing helpers
  - resize-end emission decisions that can be tested without React
- `customResizableChrome.ts` now owns:
  - resize-handle direction lookup from DOM targets
  - handle enablement, hit-area sizing, and MetaControl or attached-terminal chrome
- `sectionMinMaxDims.ts` now owns:
  - section sizing-policy reads plus measured min/max dimension derivation
  - MetaControl sizing-policy lookup and section size-mode resolution
- `sectionScrollability.ts` now owns:
  - shared ResizeObserver and MutationObserver wiring for overflow detection
  - scrollability measurement plus `onMeasure` callback dispatch
- `sectionAspectRatioSizing.ts` now owns:
  - draw-area canvas size normalization
  - social/media aspect-ratio writes and default size promotion
- `sectionSizes.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
- `paramMoveQueries.ts` now owns:
  - param selection resolution and visible-param gating
  - visible sibling grouping and movement-context derivation for keyboard moves
- `paramMoveMutations.ts` now owns:
  - optimistic param reparent/reorder application
  - parent promotion and shown-param top-level order synchronization
- `moveParams.ts` now owns:
  - public param select, drag/drop move, and keyboard indent/unindent commands
  - optimistic backend dispatch for single-param and grouped param moves
- `aiTranscription.ts` now owns:
  - provider dictation decode, resample, chunk, and upload orchestration
- `aiTranscriptionSessions.ts` now owns:
  - provider session transport endpoint calls
  - transport-specific request error handling and chunk-size policy
- `aiTranscriptionProfiles.ts` now owns:
  - transcription-profile initial load and websocket/store snapshot updates
  - transcription-profile create, update, and delete behavior
- `aiChatControls.ts` now owns:
  - public project and managed-section stop orchestration
  - shared LLM stop fallback handling after optimistic local stop state
- `aiExternalAgentStop.ts` now owns:
  - external-run discovery and project-config scoping
  - external stop transport plus hydrate/recovery fallback handling
- `aiChatStopState.ts` now owns:
  - local stop snapshots for chat details, interruption state, and follow state
  - optimistic stop-state application plus stop outcome reconciliation helpers
- `aiExternalAgentResponses.ts` now owns:
  - external agent approval transport
  - external agent question response transport
- `definitions.ts` now defines 14 local `use*` stores and re-exports the extracted AI/chat, app runtime, session/share, browser, search, feedback, project-status, layout-interaction, UI-preference, and editor-diagnostics stores, which is much closer to a thin index but still leaves project-state publication, artifact data, and realtime helper ownership mixed together.
- `sectionEffectiveImplCore.ts` now owns:
  - effective-impl derivation and caching
  - low-level section/code-object entity lookups
- `sectionEffectiveImplSelectors.ts` now owns:
  - typed current-section and current-code-object selectors
  - managed-chat authority checks and param display-name helpers
- `sectionEffectiveImpls.ts` is now:
  - a thin compatibility facade over the effective-impl core and selector owners
- `sectionLayoutQueries.ts` now owns:
  - terminal attachment helpers for embedded code/terminal relationships
  - section-orientation, section-type, and section-child queries
  - compatibility-preserving `getSectionType` overloads used across existing callers
- `sectionEffectiveImplMutations.ts` now owns:
  - in-place impl mutation helpers for section/code-object writes
  - cache invalidation after shared, base-impl, or variant-modifier updates
- `sectionDisplayQueries.ts` now owns:
  - top-level display selection and displayed-child tree derivation
  - node-map creation from current layouts and effective section styling
  - DnD child reset plus view-mode visibility/render queries
- `sectionStreamingMerge.ts` now owns:
  - backend snapshot merge reconciliation for streaming chat sections
- `sectionShownParams.ts` now owns:
  - shown-param and pinned-param bucket reads and rebalancing helpers
- `sectionHierarchy.ts` now owns:
  - section ancestry and descendant queries
  - parent-child mutation helpers and reset-to-default-version commands
- `sectionToolArgumentPreview.ts` now owns:
  - tool-preview cleanup against the current project-state snapshot
- `gitGraphLog.ts` now owns:
  - git graph overlay boot and initial graph-state seeding
  - git graph/log refresh, pagination, and all-refs/filter refresh behavior
- `gitGraphSelection.ts` now owns:
  - selected-commit clearing
  - commit details and commit-file-diff request lifecycle
- `gitGraphState.ts` now owns:
  - current project-config lookup for graph requests
  - reusable graph and cleared-selection state builders
- `websocketIncomingMessages.ts` now owns:
  - frontend websocket payload parsing and feature-specific dispatch
  - project/app snapshot routing for inbound websocket updates
  - `UISettingReveal` ACK validation and failure-status construction
- `sectionInfos.ts` is now:
  - a thin compatibility facade that re-exports the narrower section helper owners
  - the last place carrying the legacy `updateProjectState` helper
- `sectionProjectStateSync.ts` now owns:
  - backend snapshot reconciliation
  - active-section sync from authoritative project state
  - viewport application during backend updates
  - project-chat windowing authoritative and ephemeral coordination
- `projectStateCommands.ts` now owns:
  - shared section delete/group/ungroup commands
  - param selection and unselect-all command entrypoints
  - viewport persistence dispatch
  - all-project-metadata updates from realtime snapshot handlers
- `projectStateOptimisticUpdates.ts` now owns:
  - pending-operation queue registration, acknowledgement, and removal
  - optimistic project-state dispatch with project guards
  - rollback and replay of later pending operations after failed requests
- `topLevelSectionLayouts.ts` now owns:
  - active-view top-level layout selection
  - top-level layout snapshot building from current node internals
- `topLevelLayoutPersistence.ts` now owns:
  - top-level layout pending-op reconciliation after backend snapshots
  - debounced backend layout persistence and optimistic layout snapshot writes
- `uiSettingReveal.ts` and adjacent helpers now split into:
  - `uiSettingReveal.ts` for reveal orchestration and plugin fallback flow
  - `uiSettingRevealMutations.ts` for reveal mutation lock and high-level orchestration
  - `uiSettingRevealMutationOwnership.ts` for lease sequence and touched-field ownership
  - `uiSettingRevealMutationSnapshots.ts` for snapshot capture and rollback application
  - `uiSettingRevealActivation.ts` for pane-opening and accordion/chat-aux activation writes
  - `uiSettingRevealDom.ts` for anchor lookup, scrolling, and highlight timing
  - `uiSettingRevealShared.ts` for execution-context mismatch and status builders
- `keyActivations.ts`, `keyShortcutRegistrations.ts`, `keyShortcutUtils.ts`,
  and `keyActivationHandlers.ts` now split into:
  - `keyActivations.ts` for global key-listener wiring and pressed-key bookkeeping
  - `keyShortcutRegistrations.ts` for grouped shortcut registration tables
  - `keyShortcutUtils.ts` for shortcut parsing, event-code normalization, and input-ignore policy
  - `keyActivationHandlers.ts` for `Tab`/`Escape`, section-selection, and React Flow key-mode handlers
- `windowSpacePersistence.ts` now owns:
  - saved window-space sort/name/delete/create mutations
  - optimistic persistence and layout-mutation rollback
- `windowSpaceSnapshots.ts` now owns:
  - floating window-space snapshot building
  - conversion from saved window-space state back into project-chat windowing state
- `windowSpaceWorkspaceRestoreReuse.ts` now owns:
  - floating-window reuse and owner-key resolution
  - superseded-floating selection for saved window-space restores
- `windowSpaceWorkspaceRestoreRemap.ts` now owns:
  - restored-instance remapping, section-host collision drops, and merge policy
- `windowSpaceWorkspaceRestoreLayout.ts` now owns:
  - workspace-restore planning and combined next-windowing assembly
- `windowSpaceWorkspaceRestoreVisibility.ts` now owns:
  - restored git-pane visibility planning for saved window-space restores
- `windowSpaceWorkspaceRestorePlan.ts` now owns:
  - composition of the restore-layout and restore-visibility owners
- `windowSpaceProjectChatThreadRestore.ts` now owns:
  - deployment-policy restore gating for saved chat-thread restores
  - saved project-chat thread rebound after restored layouts are applied
- `windowSpaces.ts` now owns:
  - thin workspace restore orchestration that composes restore planning and
    project-chat thread rebound helpers
- `projectChatThreads.ts`, `projectChatThreadGroupMutations.ts`,
  `projectChatThreadMutations.ts`, `projectChatThreadStorageUndo.ts`, and
  `projectChatThreadStorageShared.ts` now split into:
  - `projectChatThreads.ts` as the thin compatibility re-export surface
  - `projectChatThreadGroupMutations.ts` for persisted group-level thread storage mutations
  - `projectChatThreadMutations.ts` for per-thread viewed, pin, reorder, and delete mutations
  - `projectChatThreadStorageUndo.ts` for delete undo-stack ownership and restoration
  - `projectChatThreadStorageShared.ts` for normalization and ordering helpers shared by the mutation and undo owners
- `aiChatStreaming.ts`, `aiChatStreamingMessages.ts`,
  `aiChatStreamingSectionState.ts`, and `aiChatStreamingTools.ts` now split into:
  - `aiChatStreaming.ts` for top-level chunk routing plus chat-detail side effects
  - `aiChatStreamingMessages.ts` for shared message delta and finalized-message reducers
  - `aiChatStreamingSectionState.ts` for managed chat-section reconciliation and active-branch sync
  - `aiChatStreamingTools.ts` for tool-call placeholders, preview-store updates, and app-spec/app-definition tool application
- `projectChatWindowingWriteState.ts` now owns:
  - layout write permissions and current-windowing store access
  - optimistic mutation application, local rollback boundaries, and active-chat sync
- `projectChatWindowingWriteQueue.ts` now owns:
  - pending-mutation queueing, write barriers, and flush coordination
- `projectChatWindowingWritePublish.ts` now owns:
  - authoritative publish/replay plus tracked response/send helpers
- `projectChatWindowingWriteSync.ts` now owns:
  - explicit sync helpers and the flush facade for project-chat windowing writes
- `projectChatWindowingWritePipeline.ts` now owns:
  - thin serialized orchestration across the write-queue and write-publish owners
- `projectChatWindowingWrites.ts` now owns:
  - the thin public mutation facade that composes write-state, write-pipeline, and write-sync helpers
- `sections/createSections.ts`, `sections/createSectionPlacement.ts`,
  `sections/createSectionFileOpenShared.ts`,
  `sections/createSectionFileOpenCommands.ts`,
  `sections/createSectionFileDropRouting.ts`, and
  `sections/createSectionImplDefaults.ts` now split into:
  - `createSections.ts` for top-level create orchestration and empty-space add commands
  - `createSectionPlacement.ts` for smart placement context and empty-space positioning
  - `createSectionFileOpenShared.ts` for opened-file naming, reuse lookup, and shared rename/focus helpers
  - `createSectionFileOpenCommands.ts` for per-impl file-open commands
  - `createSectionFileDropRouting.ts` for dropped-file routing into the correct open command
  - `createSectionImplDefaults.ts` for per-impl create defaults such as text-block display-mode normalization
- `projectChatWindowingCanvasBoot.ts` now owns:
  - DOM surface rect lookup for project chat windows
  - canvas boot position/size resolution from existing window surfaces
  - section boot flow that moves externalized chat windows back into the canvas
- `projectChatWindowingTrackedGitPane.ts` now owns:
  - tracked git-pane graph window reuse
  - maximize and title refresh for the pane-following git graph surface
- `projectChatWindowingSelectors.ts` now owns:
  - pure windowing normalization and section-binding selectors
  - default floating and docked bounds helpers for UI readers and reducers
- `projectChatWindowingInstanceState.ts` now owns:
  - window-instance creation and next-instance-id allocation
  - shared per-window update helpers plus floating-bounds runtime defaults
- `projectChatWindowingPlacementState.ts` now owns:
  - placement, maximize/unmaximize, close/minimize/reopen, and focus reducers
- `projectChatWindowingBoundsState.ts` now owns:
  - dock-fraction reducers
  - floating-bounds reducers for single-window and multi-window updates
- `projectChatWindowingLayoutState.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
- `projectChatWindowingState.ts` now owns:
  - section-binding, title, and chat-id reducers
  - section/canvas transition reducers that compose the instance/placement/bounds helpers
- `projectChatWindowCommands.ts` now owns:
  - public window lifecycle, placement, focus, and bounds commands
- `projectChatWindowMetadataCommands.ts` now owns:
  - title/chat-id commands plus current-windowing state reads
- `projectChatWindowSectionCommands.ts` now owns:
  - section exposure, undock, and section/window mode transition commands
- `projectChatWindowing.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
  - write-helper re-exports shared by legacy callers and tests
- `aiLLMConfiguration.ts` now owns:
  - LLM config load/save behavior
  - managed API-key snapshot updates, read failure handling, and queued write conflict resolution
- `aiConfigurationCatalogs.ts` now owns:
  - agent-profile, prompt-template, external-agent, and engine-config catalog loads and mutations
  - external-agent health loading plus external-agent-config update fan-out
- `terminal.ts`, `terminalSessions.ts`, and `terminalFit.ts` now split into:
  - `terminal.ts` for React mount, ready/focus wiring, and resize observation
  - `terminalSessions.ts` for cached websocket session reuse, stdin gating, and resize transport
  - `terminalFit.ts` for xterm fit-addon fallback logic and widen-reflow patching
- `focusManager.ts`, `focusManagerRegistry.ts`, `focusManagerElements.ts`,
  `focusManagerNavigation.ts`, and `focusManagerSections.ts` now split into:
  - `focusManager.ts` as the thin compatibility entrypoint
  - `focusManagerRegistry.ts` for tab-scope registration and focus tracking
  - `focusManagerElements.ts` for focusable-element normalization and canvas ordering helpers
  - `focusManagerNavigation.ts` for generic scope traversal and `Tab` movement
  - `focusManagerSections.ts` for section-targeted and canvas-adjacent focus movement
- `constants.ts` at 301 lines is a grab bag for:
  - routes
  - pane/tab enums
  - z-indexes
  - DOM class names
  - measurement key builders
- Shared UI infrastructure like `PaneContainer.tsx`, pane layout helpers, floating-box helpers, and focus management currently span multiple cross-cutting concerns, which makes edits feel riskier than they should.

## Cleanup Principles

1. Separate reads from writes.
   Selectors/query helpers should be distinct from mutation commands.

2. Separate domain state from cross-domain plumbing.
   Optimistic sync, websocket reconciliation, and DOM interaction helpers should not hide inside feature query files.

3. Make store ownership explicit.
   New code should depend on the smallest store surface possible.

4. Keep shared infrastructure small and layered.
   Routing constants, layout constants, measurement keys, and interaction-class names do not belong in one catch-all module.

## Plan

1. Split store definitions by domain

- Break `definitions.ts` into domain-owned store modules or thin domain re-export modules.
- Group stores by areas such as:
  - project state
  - UI chrome/layout
  - AI/chat state
  - temporary measurement state
  - share/session state
- Keep a minimal index only if it improves discovery without hiding ownership.

2. Split `stateMachineEdgeGraph.ts` into narrower workflow graph helpers

- Separate workflow graph reads and machine-group resolution from the remaining
  merge snapshot/apply/restore helpers.
- Keep naming explicit so agents can tell whether they are calling a workflow
  graph query, a merge helper, or an edge mutation command.

3. Normalize optimistic mutation infrastructure

- Create a consistent pattern for optimistic frontend mutations used by:
  - section mutations
  - window spaces
  - related layout/state features
- Continue routing new optimistic write paths through
  `projectStateOptimisticUpdates.ts` instead of rebuilding queue or rollback
  helpers inside feature query modules.
- Reuse seams that already exist in `projectChatWindowingSelectors.ts`, `projectChatWindowingInstanceState.ts`, `projectChatWindowingPlacementState.ts`, `projectChatWindowingBoundsState.ts`, `projectChatWindowingLayoutState.ts`, `projectChatWindowingState.ts`, `projectChatWindowingWriteState.ts`, `projectChatWindowingWriteQueue.ts`, `projectChatWindowingWritePublish.ts`, `projectChatWindowingWriteSync.ts`, `projectChatWindowingWritePipeline.ts`, `projectChatWindowingWrites.ts`, `projectChatWindowingAuthoritative.ts`, and `projectChatWindowingEphemeral.ts` where they fit instead of introducing parallel patterns.
- Avoid each domain hand-rolling slightly different optimistic update scaffolding.

4. Split cross-cutting interaction utilities

- Keep `focusManager.ts` as a thin re-export only, and route new tab-scope
  registration, navigation policy, and section/canvas focus work into
  `focusManagerRegistry.ts`, `focusManagerNavigation.ts`,
  `focusManagerSections.ts`, or `focusManagerElements.ts` instead of rebuilding
  a monolith.
- Split `constants.ts` into domain constants:
  - routes
  - panes/tabs
  - DOM interaction classes
  - measurement key builders
  - app chrome z-index/layout constants

5. Tighten shared component infrastructure

- Keep `PaneContainer`, pane layout helpers, floating-box helpers, and similar utilities small and composable.
- Make it obvious which layer owns:
  - viewport sizing
  - persisted pane state
  - DOM resize wrappers
  - focus behavior

6. Add domain READMEs and import guidance

- Document:
  - where new store state belongs
  - when to add a selector vs a command
  - when `utils/` is appropriate vs feature-local helpers
- Prefer explicit module imports over “just import from whichever mega-file already has something close”.

## Risks And Mitigations

- Risk: moving shared infrastructure causes widespread import churn.
  - Mitigation: split APIs first, then move files after callers depend on the new boundaries.
- Risk: over-normalizing state patterns makes simple features harder to implement.
  - Mitigation: keep abstractions minimal and only standardize what is already repeated.
- Risk: optimistic update helpers become too generic to understand.
  - Mitigation: retain domain-specific command entry points even if shared helpers exist underneath.

## Verification

- Add or update Vitest coverage for:
  - query helpers/selectors
  - optimistic mutation scaffolds
  - focus/navigation helpers
  - constants/key-builder behavior
- Run relevant UI tests where shared infrastructure changes affect panes, section focus, or layout persistence.
- Use CDP verification when infrastructure refactors affect visible pane/layout behavior.

## Acceptance Criteria

- Contributors can identify the owner of a piece of shared state or UI infrastructure quickly.
- Read helpers and mutation commands are no longer mixed inside the same giant modules by default.
- Shared infrastructure files are smaller and grouped by actual responsibility.
- Cross-cutting utilities stop being default dumping grounds for unrelated frontend behavior.
