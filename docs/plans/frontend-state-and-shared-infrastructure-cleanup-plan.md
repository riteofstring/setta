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

## Status Refresh (2026-03-15)

- Unlike the later `clean-code` branch, this branch still has a shared `frontend/src/state/definitions.ts` index, but AI/chat store ownership now lives in `frontend/src/state/stores/aiStores.ts`, app runtime state now lives in `frontend/src/state/stores/appStores.ts`, session/share state now lives in `frontend/src/state/stores/sessionStores.ts`, browser state now lives in `frontend/src/state/stores/fileBrowserStores.ts`, search state now lives in `frontend/src/state/stores/searchStores.ts`, feedback state now lives in `frontend/src/state/stores/feedbackStores.ts`, project-status state now lives in `frontend/src/state/stores/projectStatusStores.ts`, layout interaction state now lives in `frontend/src/state/stores/layoutInteractionStores.ts`, UI preference/config state now lives in `frontend/src/state/stores/uiPreferenceStores.ts`, editor diagnostics state now lives in `frontend/src/state/stores/editorDiagnosticsStores.ts`, and shared persist fallback logic lives in `frontend/src/state/storePersistStorage.ts`.
- `frontend/src/state/actions/aiHydrationOutcome.ts`, `frontend/src/state/actions/aiHydrationApply.ts`, `frontend/src/state/actions/aiHydrationChatState.ts`, `frontend/src/state/actions/aiHydrationSectionState.ts`, `frontend/src/state/actions/aiHydration.ts`, `frontend/src/state/actions/aiAgentRuns.ts`, `frontend/src/state/actions/aiLLMConfiguration.ts`, `frontend/src/state/actions/aiManagedApiKeyState.ts`, `frontend/src/state/actions/aiManagedApiKeyPersistence.ts`, `frontend/src/state/actions/aiManagedApiKeys.ts`, `frontend/src/state/actions/aiConfigurationCatalogLoads.ts`, `frontend/src/state/actions/aiConfigurationCatalogState.ts`, `frontend/src/state/actions/aiConfigurationCatalogMutations.ts`, `frontend/src/state/actions/aiTranscriptionAudio.ts`, `frontend/src/state/actions/aiTranscriptionUpload.ts`, `frontend/src/state/actions/aiTranscription.ts`, `frontend/src/state/actions/aiTranscriptionSessions.ts`, `frontend/src/state/actions/aiTranscriptionProfiles.ts`, `frontend/src/state/actions/aiChatSubmissionMessages.ts`, `frontend/src/state/actions/aiChatSubmissionEdits.ts`, `frontend/src/state/actions/aiChatSubmissionResponse.ts`, `frontend/src/state/actions/aiChatSubmission.ts`, `frontend/src/state/actions/aiChatSubmissionRequestPayload.ts`, `frontend/src/state/actions/aiChatSubmissionPayload.ts`, `frontend/src/state/actions/aiChatControls.ts`, `frontend/src/state/actions/aiExternalAgentStop.ts`, `frontend/src/state/actions/aiChatStopState.ts`, `frontend/src/state/actions/aiExternalAgentResponses.ts`, `frontend/src/state/actions/aiChatState.ts`, `frontend/src/state/actions/aiPendingChatAppGenerationState.ts`, `frontend/src/state/actions/aiPendingChatMessageLifecycle.ts`, `frontend/src/state/actions/aiPendingChatMessageMutations.ts`, `frontend/src/state/actions/aiPendingChatMessageState.ts`, `frontend/src/state/actions/aiPendingChatState.ts`, `frontend/src/state/actions/aiInterruptedAssistantMessages.ts`, `frontend/src/state/actions/aiChatStreaming.ts`, `frontend/src/state/actions/aiChatStreamingChunkContext.ts`, `frontend/src/state/actions/aiChatStreamingSectionRouting.ts`, `frontend/src/state/actions/aiChatStreamingRouting.ts`, `frontend/src/state/actions/aiChatStreamingMessageDeltas.ts`, `frontend/src/state/actions/aiChatStreamingMessageUpserts.ts`, `frontend/src/state/actions/aiChatStreamingMessages.ts`, `frontend/src/state/actions/aiChatStreamingSectionState.ts`, `frontend/src/state/actions/aiChatStreamingToolCalls.ts`, `frontend/src/state/actions/aiChatStreamingToolPreviews.ts`, `frontend/src/state/actions/aiChatStreamingAppDefinition.ts`, and `frontend/src/state/actions/aiChatStreamingTools.ts` now carry the hydration route probes, hydration apply orchestration, hydration chat-detail reconciliation, hydration chat-section reconciliation plus persistence sync, agent-run, LLM config, managed API-key snapshot/load behavior, queued managed API-key persistence and conflict handling, managed API-key compatibility re-exports, settings-catalog, transcription audio preparation, transcription upload orchestration, transcription compatibility surface, transcription transport, transcription-profile, optimistic new-message submission, edited-message pending lifecycle, shared backend send plus hydration refresh, thin submission compatibility exports, shared submission request payload assembly, app-generation or edited-message submission preparation, chat-control, external stop/recovery, local stop-state, external approval/question response, chat-detail, pending-draft lifecycle, pending user-message mutations, pending app-generation detail, interruption-tracking, and streaming behavior that previously lived in `frontend/src/state/actions/ai.ts`; future cleanup should keep extending those seams instead of merging behavior back.
- `frontend/src/state/actions/projectChatWindowing.ts` now delegates pure
  windowing normalization and default-bounds helpers to
  `projectChatWindowingNormalization.ts`, selection reads to
  `projectChatWindowingSelectors.ts`,
  instance lifecycle to `projectChatWindowingInstanceState.ts`,
  placement/focus reducers to `projectChatWindowingPlacementState.ts`,
  dock-fraction/bounds reducers to `projectChatWindowingBoundsState.ts`,
  compatibility re-exports to `projectChatWindowingLayoutState.ts`,
  section exposure/binding and mode-transition reducers to
  `projectChatWindowingSectionState.ts`, title/chat-id reducers to
  `projectChatWindowingMetadataState.ts`, compatibility re-exports to
  `projectChatWindowingState.ts`, canvas boot and DOM surface lookup to
  `projectChatWindowingCanvasBoot.ts`, tracked git-pane graph window reuse to
  `projectChatWindowingTrackedGitPane.ts`, public window lifecycle/focus
  commands to `projectChatWindowLifecycleCommands.ts`, public
  placement/dock-fraction/bounds commands plus tracked git-pane cleanup to
  `projectChatWindowLayoutCommands.ts`, compatibility re-exports to
  `projectChatWindowCommands.ts`, title/chat-id commands plus current-windowing reads to
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
  `projectChatWindowingEphemeralKeys.ts`,
  `projectChatWindowingTrackedGitPaneState.ts`,
  `projectChatWindowingEmbeddedPaneVisibility.ts`, and
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
  now owns typed current-section/current-code-object selectors, while
  `frontend/src/state/actions/sectionFeatureSelectors.ts` now owns
  managed-chat checks and param display-name helpers; `frontend/src/state/actions/sectionEffectiveImpls.ts`
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
  websocket payload parsing and feature-specific dispatch,
  `frontend/src/state/actions/websocketIncomingProjectSnapshots.ts` now owns
  project/app snapshot routing, and
  `frontend/src/state/actions/websocketIncomingUISettingReveal.ts` now owns
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
- `frontend/src/state/actions/windowSpaceCrud.ts` now owns saved window-space
  sort/name/delete mutations plus optimistic persistence and layout rollback,
  `frontend/src/state/actions/windowSpaceSave.ts` now owns current-floating-window
  save flow plus authoritative pre-save sync,
  `frontend/src/state/actions/windowSpaceSnapshotCapture.ts` now owns floating
  snapshot building, and
  `frontend/src/state/actions/windowSpaceSnapshotRestore.ts` now owns
  conversion back into project-chat windowing state that previously lived in
  `frontend/src/state/actions/windowSpaces.ts`; `frontend/src/state/actions/windowSpacePersistence.ts`
  is now the thin compatibility facade over the narrowed owners.
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
- `frontend/src/state/actions/shareSessionState.ts` now owns share-session
  cookie or session-storage bootstrap, cached-session reuse, and
  deployment-mode initialization that previously lived in
  `frontend/src/state/actions/share.ts`, while
  `frontend/src/state/actions/shareProjectConfig.ts` now owns share
  project-config load/retry transport plus post-load hydration side effects;
  `frontend/src/state/actions/share.ts` is now the thin compatibility facade.
- `frontend/src/state/actions/activeSectionSync.ts` now owns durable
  active-section selection scheduling, flush, backend send, and authoritative
  restore behavior that previously lived in
  `frontend/src/state/actions/activeSections.ts`, while
  `frontend/src/state/actions/activeSectionCommands.ts` now owns higher-level
  active-section commands such as clear, prune-for-view-mode, select-all, and
  top-level non-group selection; `frontend/src/state/actions/activeSections.ts`
  is now the thin compatibility facade.
- `frontend/src/state/actions/projectChatWindowingNormalization.ts` now owns
  pure windowing normalization and default-bounds helpers that previously
  lived in `frontend/src/state/actions/projectChatWindowingState.ts`, while
  `frontend/src/state/actions/projectChatWindowingSelectors.ts` now owns
  section-binding and visible-window selector reads.
- `frontend/src/state/actions/projectChatWindowingInstanceState.ts` now owns
  window-instance creation, next-instance-id allocation, and shared per-window
  update helpers, `frontend/src/state/actions/projectChatWindowingPlacementState.ts`
  now owns placement/focus reducers, and
  `frontend/src/state/actions/projectChatWindowingBoundsState.ts` now owns
  dock-fraction/bounds reducers that previously lived in
  `frontend/src/state/actions/projectChatWindowingState.ts`, while
  `frontend/src/state/actions/projectChatWindowingLayoutState.ts` is now the
  compatibility surface that re-exports those owners.
- `frontend/src/state/actions/projectChatWindowingSectionState.ts` now owns
  section exposure/binding plus section/window mode transition reducers that
  previously lived in `frontend/src/state/actions/projectChatWindowing.ts`,
  while `frontend/src/state/actions/projectChatWindowingMetadataState.ts` now
  owns title/chat-id reducers and
  `frontend/src/state/actions/projectChatWindowingState.ts` is now the thin
  compatibility facade over those state owners.
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
- `frontend/src/state/actions/projectChatThreadGroupCrud.ts` now owns
  persisted project-chat thread group create/rename behavior,
  `frontend/src/state/actions/projectChatThreadGroupOrdering.ts` now owns
  collapse/pin/reorder behavior, and
  `frontend/src/state/actions/projectChatThreadGroupAssignments.ts` now owns
  assignment/delete behavior, while
  `frontend/src/state/actions/projectChatThreadGroupMutations.ts` is now the
  thin compatibility surface. `frontend/src/state/actions/projectChatThreadMutations.ts`
  still owns per-thread viewed, pin, reorder, and delete behavior, and
  `frontend/src/state/actions/projectChatThreadStorageUndo.ts` still owns the
  local delete undo stack and restoration logic that previously lived in
  `frontend/src/state/actions/projectChatThreads.ts`.
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
  compatibility facade. `frontend/src/state/actions/gitGraphSelection.ts` now
  owns selected commit clearing plus commit details/file-diff selection, and
  `frontend/src/state/actions/gitGraphState.ts` now owns reusable graph state
  builders and current project-config lookup, while
  `frontend/src/state/actions/gitStatusAndDiff.ts` continues to own git status
  refresh, diff availability, diff overlay opening, and diff-mode switching
  that previously lived in `frontend/src/state/actions/git.ts`.
- `frontend/src/state/actions/aiChatStreamingToolCalls.ts` now owns shared
  tool-call placeholder reconciliation and delta reducers used by the chat
  streaming and chat-section owners.
- `frontend/src/state/actions/aiChatStreamingToolPreviews.ts` now owns
  tool-preview store updates, preview cleanup, and app-spec patch preview
  application that previously lived in
  `frontend/src/state/actions/aiChatStreaming.ts`.
- `frontend/src/state/actions/aiChatStreamingAppDefinition.ts` now owns
  app-definition tool result handling and app-preview reset behavior that
  previously lived in `frontend/src/state/actions/aiChatStreaming.ts`.
- `frontend/src/state/actions/aiChatStreamingTools.ts` is now a thin
  compatibility facade over those narrower tool-streaming owners.
- `frontend/src/state/actions/aiChatStreamingMessageDeltas.ts` now owns
  assistant placeholder creation plus shared text/thinking delta reducers.
- `frontend/src/state/actions/aiChatStreamingMessageUpserts.ts` now owns
  finalized-assistant merge, response-placeholder detection, and generic
  message upserts used by the chat streaming and tool-preview owners.
- `frontend/src/state/actions/aiChatStreamingMessages.ts` is now a thin
  compatibility facade over those narrower streaming-message owners.
- `frontend/src/state/actions/aiChatStreamingSectionState.ts` now owns managed
  chat-section stream reconciliation plus active-branch message sync that
  previously lived in `frontend/src/state/actions/aiChatStreaming.ts`.
- `frontend/src/state/actions/aiChatStreamingChunkContext.ts` now owns
  placeholder filtering, project/section context resolution, and chatId-to-
  section lookup caching that previously lived in
  `frontend/src/state/actions/aiChatStreaming.ts`.
- `frontend/src/state/actions/aiChatStreamingSectionRouting.ts` now owns
  stream-active tracking, section persistence, tool-preview cleanup, and
  scope-violation side effects that previously lived in
  `frontend/src/state/actions/aiChatStreaming.ts`.
- `frontend/src/state/actions/aiChatStreamingRouting.ts` is now the thin
  compatibility facade over those narrower routing owners.
- `frontend/src/state/actions/artifactStoreUpdates.ts` now owns incoming
  websocket/store artifact reconciliation plus decoded-image cleanup that
  previously lived in `frontend/src/state/actions/artifacts.ts`, while
  `frontend/src/state/actions/artifactSyncQueue.ts` now owns draw artifact save
  queueing, debounced/forced sync transport, and save-conflict notifications;
  `frontend/src/state/actions/artifacts.ts` is now the thin compatibility
  facade over those owners.
- `frontend/src/state/hooks/artifactTransport.ts` now owns cached
  image/chart/brush/transform load transport plus raw-image decode that
  previously lived in `frontend/src/state/hooks/artifacts.ts`, while
  `frontend/src/state/hooks/drawAreaArtifacts.ts` now owns draw-area artifact
  ref selection, load planning, and revision-stamp hooks; `frontend/src/state/hooks/artifacts.ts`
  is now the thin compatibility facade over those hook owners.
- `frontend/src/state/actions/sections/moveSectionQueries.ts` now owns
  attached-terminal route selection, section-type move checks, and
  parent-resolution reads that previously lived in
  `frontend/src/state/actions/sections/moveSections.ts`, while
  `frontend/src/state/actions/sections/moveSectionParentState.ts` now owns
  in-state parent cleanup plus move-into-parent reducers,
  `frontend/src/state/actions/sections/moveSectionPaneState.ts` now owns pane
  layout and node updates,
  `frontend/src/state/actions/sections/moveSectionState.ts` is now the thin
  in-state composition facade, and
  `frontend/src/state/actions/sections/moveSections.ts` is now the thin
  optimistic command facade.
- `frontend/src/state/actions/aiHydrationOutcome.ts` now owns managed/external
  hydration route probes plus failure/outcome classification that previously
  lived in `frontend/src/state/actions/aiHydration.ts`.
- `frontend/src/state/actions/aiHydrationChatState.ts` now owns
  managed/external chat-detail reconciliation plus app-generation hydration,
  `frontend/src/state/actions/aiHydrationSectionState.ts` now owns
  managed/external chat-section reconciliation plus persistence sync, and
  `frontend/src/state/actions/aiHydrationApply.ts` is now the thin hydration
  apply-orchestration facade that previously lived in
  `frontend/src/state/actions/aiHydration.ts`.
- `frontend/src/state/actions/aiHydration.ts` is now the thin public hydration
  facade that composes the outcome and apply owners.
- `frontend/src/state/actions/uiSettingRevealRequests.ts` now owns
  request-level reveal project/context gating plus the per-request reveal loop,
  `frontend/src/state/actions/uiSettingRevealExecution.ts` now owns
  single-target orchestration plus mutation-lease cleanup,
  `frontend/src/state/actions/uiSettingRevealPluginHandler.ts` now owns
  plugin-handler timeout polling and invocation,
  `frontend/src/state/actions/uiSettingRevealFallbackAnchor.ts` now owns
  fallback anchor lookup, scrolling, and highlight application, and
  `frontend/src/state/actions/uiSettingReveal.ts` is now the thin
  compatibility facade. `uiSettingRevealMutations.ts` is now the thin
  mutation compatibility facade, `uiSettingRevealMutationApply.ts` now owns
  high-level reveal mutation orchestration plus mismatch/failure handling,
  `uiSettingRevealMutationLeaseLifecycle.ts` now owns mutation-lease rollback
  and finalize behavior, `uiSettingRevealMutationLock.ts` now owns serialized
  reveal mutation locking,
  `uiSettingRevealMutationOwnership.ts` still owns lease sequence and touched-field
  ownership, `uiSettingRevealMutationCapture.ts` still owns snapshot capture
  plus failure-result assembly,
  `uiSettingRevealMutationRecordRestore.ts` still owns shared owned-record
  revert helpers, `uiSettingRevealMutationLocalStorageRestore.ts` still owns
  local-storage rollback, `uiSettingRevealMutationProjectStateRestore.ts`
  still owns project-state active-section rollback,
  `uiSettingRevealMutationRestore.ts` is still the thin restore orchestrator,
  `uiSettingRevealMutationSnapshots.ts` is still the compatibility facade,
  `uiSettingRevealPaneActivation.ts` now owns requested active-section
  selection plus pane-opening writes,
  `uiSettingRevealStepActivation.ts` now owns watch-code portal, accordion,
  and project-chat-aux activation writes,
  `uiSettingRevealActivation.ts` is now the thin compatibility facade,
  `uiSettingRevealActivationShared.ts` now owns shared activation helpers,
  `uiSettingRevealDom.ts` owns anchor lookup and highlighting, and
  `uiSettingRevealShared.ts` owns execution-context/status helpers.
- `frontend/src/state/actions/keyActivations.ts` is now a listener
  orchestration entrypoint; `keyActivationPressedKeys.ts` owns pressed-key
  bookkeeping plus stale-key cleanup,
  `keyActivationShortcutInfo.ts` owns shortcut-info normalization plus
  keep-key-down coordination, `keyActivationCommands.ts` owns the shortcut
  command registry plus React Flow key-mode toggles,
  `keyShortcutNavigationRegistrations.ts` owns focus plus pane-navigation
  registrations, `keyShortcutTooltipRegistrations.ts` owns tooltip
  registrations, `keyShortcutWorkspaceRegistrations.ts` owns creation,
  project-command, canvas, and interaction-mode registrations,
  `keyShortcutRegistrationGroups.ts` is now the thin compatibility surface,
  `keyShortcutRegistrations.ts` owns the remaining Tab-vs-param
  binding decisions plus registry composition, `keyShortcutMatching.ts` owns
  shortcut parsing, event-code normalization, and shortcut matching,
  `keyShortcutInputPolicy.ts` owns editable-target and input-ignore policy,
  `keyShortcutUtils.ts` is now the thin compatibility facade, and
  `keyActivationHandlers.ts` owns `Tab`/`Escape`, section-selection, and
  param-shortcut dispatch behavior.
- `frontend/src/state/actions/stateMachineRunSelection.ts` now owns workflow
  run filtering, latest-run selection, and browser polling/subscription
  behavior, `frontend/src/state/actions/stateMachineRunMutations.ts` now owns
  optimistic workflow start/stop/reset commands plus refresh-after-mutation
  behavior, and `frontend/src/state/actions/stateMachineRuns.ts` is now the
  thin compatibility facade.
- `frontend/src/state/hooks/terminals/terminal.ts` is now a 248-line React hook
  orchestration layer; `terminalSessionTransport.ts` now owns websocket/session
  bootstrap plus stdin/output transport wiring, `terminalSessions.ts` now owns
  cached session lookup plus resize/lifecycle bookkeeping, and
  `terminalFit.ts` owns xterm fit/fallback/reflow behavior.
- `frontend/src/utils/constants.ts` is still unsplit on this branch, so shared-infrastructure cleanup is still high leverage.
- Shared infrastructure cleanup will still cross fork boundaries at times, but if a slice becomes primarily about code under `frontend/src/forks/**` it should use the more specific companion plan instead of expanding this one.

## Current State (Observed)

- `frontend/src/state` plus shared infrastructure files in `components/Utils`
  and `utils` total about 90.1k lines of authored code in the sampled
  directories.
- The largest remaining authored state surfaces are:
  - `frontend/src/state/actions/websocketLifecycle.ts` at 244 lines
  - `frontend/src/state/actions/sectionDisplayQueries.ts` at 242 lines
  - `frontend/src/state/actions/projectChatThreadStorageUndo.ts` at 238 lines
  - `frontend/src/state/actions/projectChatWindowingNormalization.ts` at 236 lines
  - `frontend/src/state/actions/stateMachineRunSelection.ts` at 234 lines
- The biggest shared-infrastructure hotspots in this companion-plan domain are:
  - `frontend/src/components/Utils/MediaCarousel.tsx` at 605 lines
  - `frontend/src/components/Utils/FloatingBox.tsx` at 476 lines
  - `frontend/src/utils/conversationSearch.ts` at 402 lines
  - `frontend/src/components/Utils/CodeMirror/getExtensions.ts` at 336 lines
  - `frontend/src/utils/claudeTools.ts` at 330 lines
- `frontend/src/state/actions/appSessionState.ts` now owns app-session cookie
  or session-storage bootstrap, recovery, and run-count persistence,
  `frontend/src/state/actions/appDeploymentState.ts` now owns app deployment
  load/reset plus app-config cache hydration, and
  `frontend/src/state/actions/app.ts` is now a thin compatibility facade.
- `frontend/src/state/actions/aiPendingChatAppGenerationState.ts` now owns
  pending-surface app-generation detail reads/writes,
  `frontend/src/state/actions/aiPendingChatMessageLifecycle.ts` now owns
  pending draft initialization, seed, clear, commit, and finalize flows,
  `frontend/src/state/actions/aiPendingChatMessageMutations.ts` now owns
  optimistic pending-surface and materialized-chat user-message apply or
  rollback flows plus app-generation detail updates,
  `frontend/src/state/actions/aiPendingChatMessageState.ts` is now the thin
  message-level compatibility facade, and
  `frontend/src/state/actions/aiPendingChatState.ts` is now a thin
  compatibility facade.
- `frontend/src/state/actions/agenticEdgeConnections.ts` now owns agentic-edge
  handle normalization, connection validation, and kind resolution,
  `frontend/src/state/actions/agenticEdgeShapeMutations.ts` now owns
  optimistic create/update shape mutations,
  `frontend/src/state/actions/agenticEdgeSelectionMutations.ts` now owns
  selection/delete flows,
  `frontend/src/state/actions/agenticEdgeMutations.ts` is now a thin
  compatibility facade, and `frontend/src/state/actions/agenticEdges.ts` is
  now a thin compatibility facade.
- `frontend/src/state/actions/stateMachineDraftValidationGraph.ts` now owns
  machine-section and workflow-edge graph reads,
  `frontend/src/state/actions/stateMachineDraftValidationWarnings.ts` now owns
  warning detail/result assembly, and
  `frontend/src/state/actions/stateMachineDraftValidation.ts` now owns draft
  traversal/orchestration.
- `frontend/src/state/actions/chatHistoryEntries.ts` now owns thread-entry
  derivation and title normalization,
  `frontend/src/state/actions/chatHistoryProvenance.ts` now owns canonical and
  scoped provenance lookup, `frontend/src/state/actions/chatHistoryShared.ts`
  now owns shared run filtering/grouping helpers,
  `frontend/src/state/actions/chatHistoryTypes.ts` now owns shared history
  types, and `frontend/src/state/actions/chatHistory.ts` is now a thin
  compatibility facade.
- `frontend/src/state/actions/chatBranchState.ts` now owns branch bootstrap,
  active-branch fallback, and incoming-message sync,
  `frontend/src/state/actions/chatBranchEditing.ts` now owns edited-message
  history truncation plus child-branch creation,
  `frontend/src/state/actions/chatBranchIndexState.ts` now owns branch-index
  derivation from section branch records, and
  `frontend/src/state/actions/chatBranches.ts` is now a thin compatibility
  facade.
- `frontend/src/state/stores/uiPreferenceState.ts` now owns UI preference
  types and default state,
  `frontend/src/state/stores/uiPreferencePersistence.ts` now owns persisted
  normalization and partialize policy, and
  `frontend/src/state/stores/uiPreferenceStores.ts` is now the thin persisted
  store entrypoint.
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
- `websocketRealtimeDispatch.ts` now owns:
  - outbound realtime dependency events
  - section literal and section-param literal sends
- `websocketRealtimeBinary.ts` now owns:
  - binary realtime sends
  - oversize upload fallback and warning throttling
- `websocketRealtime.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
- `websocketRuntime.ts` now owns:
  - active websocket instance and generation tracking
  - low-level JSON and binary send helpers shared by lifecycle and realtime owners
- `stateMachineEdges.ts` now owns:
  - compatibility re-exports for workflow edge callers that have not moved yet
- `stateMachineEdgeCanonicalization.ts` now owns:
  - workflow handle normalization and shared-chat workflow port canonicalization
- `stateMachineEdgeGraph.ts` now owns:
  - section-type and machine-group reads used to validate candidate connections
  - machine-group resolution for candidate workflow connections
- `stateMachineEdgeMachineGroupMerge.ts` now owns:
  - machine-group merge snapshot capture for optimistic workflow edge creation
  - merge apply/restore helpers for workflow machine-group reconciliation
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
- `sectionSizingPolicyDims.ts` now owns:
  - section sizing-policy reads
  - MetaControl sizing-policy lookup and section size-mode resolution
- `sectionMinMaxDims.ts` now owns:
  - measured min/max dimension derivation for live section surfaces
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
- `paramSelectionCommands.ts` now owns:
  - single-param drag/drop selection normalization
- `paramMoveCommands.ts` now owns:
  - optimistic backend dispatch for direct drag/drop param moves
  - indent and unindent command orchestration
- `paramMoveKeyboardCommands.ts` now owns:
  - visible-sibling keyboard move planning
  - grouped move dispatch for selected params
- `moveParams.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
- `aiTranscriptionAudio.ts` now owns:
  - provider dictation decode, mono PCM conversion, resample, and realtime payload preparation
- `aiTranscriptionUpload.ts` now owns:
  - provider transcription session start, append, stop, and cancel orchestration
  - transcript assembly from append deltas plus final stop responses
- `aiTranscription.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
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
- `storeDefinitions.ts` now owns the remaining local cross-feature Zustand
  stores plus artifact data and realtime helper ownership,
  `atomicProjectStorePublication.ts` now owns staged project-state, node, and
  active-section publication, and `definitions.ts` is now the thin shared
  barrel over those local stores and the extracted AI/chat, app runtime,
  session/share, browser, search, feedback, project-status,
  layout-interaction, UI-preference, and editor-diagnostics stores.
- `activeSectionSelection.ts` now owns:
  - active-section selection reads and writes
  - project-snapshot active-id sanitization
  - UI-facing active-section selector hooks
- `activeSectionBackendSync.ts` now owns:
  - backend hydration ownership
  - pending backend sync bookkeeping
  - backend reconciliation and authoritative restore helpers
- `activeSectionUI.ts` is now the thin compatibility facade over
  `activeSectionSelection.ts`, `activeSectionBackendSync.ts`, and
  `storeDefinitions.ts`.
- `chatAppGenerationDetails.ts` now owns:
  - chat app-generation message-state derivation
  - app-generation context normalization
  - per-message serialization and deserialization helpers
- `chatAppGenerationAgentRuns.ts` now owns:
  - agent-run hydration into per-chat app-generation details
  - run input parsing for app-generation provenance
- `chatAppGeneration.ts` is now the thin compatibility facade over
  `chatAppGenerationDetails.ts` and `chatAppGenerationAgentRuns.ts`.
- `sectionEffectiveImplCore.ts` now owns:
  - effective-impl derivation and caching
  - low-level section/code-object entity lookups
- `sectionEffectiveImplSelectors.ts` now owns:
  - typed current-section and current-code-object selectors
- `sectionFeatureSelectors.ts` now owns:
  - managed-chat authority checks
  - param display-name helpers
- `sectionEffectiveImpls.ts` is now:
  - a thin compatibility facade over the effective-impl core, typed selector, and feature-selector owners
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
- `gitGraphRefreshState.ts` now owns:
  - git graph/log refresh and initial page loading
- `gitGraphPaginationRequests.ts` now owns:
  - load-more request gating and transport orchestration
- `gitGraphPaginationResults.ts` now owns:
  - appended-page merge and load-more error writes
- `gitGraphPaginationState.ts` is now:
  - the thin compatibility facade
- `gitGraphFilterState.ts` now owns:
  - git graph filter-text writes
- `gitGraphRequestTracker.ts` now owns:
  - shared git-graph request-id sequencing
  - stale-request suppression across refresh and load-more flows
- `gitGraphLoadState.ts` is now:
  - the thin compatibility facade
- `gitGraphOverlayActions.ts` now owns:
  - git graph overlay boot and initial graph-state seeding
  - manual graph refresh and all-refs toggling
- `gitGraphLog.ts` is now:
  - the thin compatibility facade
- `gitGraphSelection.ts` now owns:
  - selected-commit clearing
  - commit details and commit-file-diff request lifecycle
- `gitGraphState.ts` now owns:
  - current project-config lookup for graph requests
  - reusable graph and cleared-selection state builders
- `websocketIncomingMessages.ts` now owns:
  - frontend websocket payload parsing and feature-specific dispatch
- `websocketIncomingProjectSnapshots.ts` now owns:
  - project/app snapshot routing for inbound websocket updates
- `websocketIncomingUISettingReveal.ts` now owns:
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
  - `uiSettingRevealRequests.ts` for request-level reveal project/context gating and the per-request reveal loop
  - `uiSettingRevealExecution.ts` for single-target orchestration and mutation-lease cleanup
  - `uiSettingRevealPluginHandler.ts` for plugin-handler timeout polling and invocation
  - `uiSettingRevealFallbackAnchor.ts` for fallback anchor lookup, scrolling, and highlight application
  - `uiSettingReveal.ts` as the thin compatibility facade
  - `uiSettingRevealMutations.ts` as the thin mutation compatibility facade
  - `uiSettingRevealMutationApply.ts` for high-level reveal mutation orchestration plus mismatch/failure handling
  - `uiSettingRevealMutationLeaseLifecycle.ts` for mutation-lease rollback and finalize behavior
  - `uiSettingRevealMutationLock.ts` for serialized reveal mutation locking
  - `uiSettingRevealMutationOwnership.ts` for lease sequence and touched-field ownership
  - `uiSettingRevealMutationCapture.ts` for snapshot capture plus failure-result assembly
  - `uiSettingRevealMutationRestore.ts` as the thin restore orchestrator
  - `uiSettingRevealMutationSnapshots.ts` as the compatibility facade
  - `uiSettingRevealPaneActivation.ts` for requested active-section selection plus pane-opening writes
  - `uiSettingRevealStepActivation.ts` for watch-code portal, accordion, and project-chat-aux activation writes
  - `uiSettingRevealActivation.ts` as the thin compatibility facade
  - `uiSettingRevealActivationShared.ts` for shared activation helpers
  - `uiSettingRevealDom.ts` for anchor lookup, scrolling, and highlight timing
  - `uiSettingRevealShared.ts` for execution-context mismatch and status builders
- `stateMachineRuns.ts` and adjacent helpers now split into:
  - `stateMachineRunSelection.ts` for workflow run filtering, latest-run selection, and browser polling/subscription behavior
  - `stateMachineRunMutations.ts` for optimistic workflow start/stop/reset commands plus refresh-after-mutation behavior
  - `stateMachineRuns.ts` as the thin compatibility facade
- `keyActivations.ts`, `keyActivationPressedKeys.ts`,
  `keyActivationShortcutInfo.ts`, `keyActivationCommands.ts`,
  `keyShortcutNavigationRegistrations.ts`,
  `keyShortcutTooltipRegistrations.ts`,
  `keyShortcutWorkspaceRegistrations.ts`,
  `keyShortcutRegistrationGroups.ts`, `keyShortcutRegistrations.ts`,
  `keyShortcutMatching.ts`, `keyShortcutInputPolicy.ts`,
  `keyShortcutUtils.ts`, and `keyActivationHandlers.ts` now split into:
  - `keyActivations.ts` for global key-listener wiring
  - `keyActivationPressedKeys.ts` for pressed-key bookkeeping and stale-key cleanup
  - `keyActivationShortcutInfo.ts` for shortcut-info normalization and keep-key-down coordination
  - `keyActivationCommands.ts` for the shortcut command registry and React Flow key-mode toggles
  - `keyShortcutNavigationRegistrations.ts` for focus and pane-navigation shortcut registrations
  - `keyShortcutTooltipRegistrations.ts` for tooltip shortcut registrations
  - `keyShortcutWorkspaceRegistrations.ts` for creation, project-command, canvas, and interaction-mode registrations
  - `keyShortcutRegistrationGroups.ts` as the thin compatibility facade
  - `keyShortcutRegistrations.ts` for Tab-vs-param binding decisions and registry composition
  - `keyShortcutMatching.ts` for shortcut parsing, event-code normalization, and shortcut matching
  - `keyShortcutInputPolicy.ts` for editable-target and input-ignore policy
  - `keyShortcutUtils.ts` as the thin compatibility facade
  - `keyActivationHandlers.ts` for `Tab`/`Escape`, section-selection, and param-shortcut dispatch behavior
- `chatMessageMerge.ts`, `chatHydrationMerge.ts`, and `chatMergeUtils.ts` now
  split into:
  - `chatMessageMerge.ts` for generic message completeness scoring and message merge normalization
  - `chatHydrationMerge.ts` for hydration-time local-vs-backend chat reconciliation and preserved assistant streaming content
  - `chatMergeUtils.ts` as the thin compatibility facade
- `chatBranchState.ts`, `chatBranchEditing.ts`, `chatBranchIndexState.ts`, and
  `chatBranches.ts` now split into:
  - `chatBranchState.ts` for branch bootstrap, active-branch fallback, and incoming-message sync
  - `chatBranchEditing.ts` for edited-message history truncation and child-branch creation
  - `chatBranchIndexState.ts` for branch-index derivation from section branch records
  - `chatBranches.ts` as the thin compatibility facade
- `windowSpaceCrud.ts` now owns:
  - saved window-space sort/name/delete mutations
  - optimistic persistence and layout-mutation rollback
- `windowSpaceSave.ts` now owns:
  - current-floating-window save flow
  - authoritative pre-save resync and saved window-space persistence
- `windowSpacePersistence.ts` is now:
  - a thin compatibility facade over the narrowed window-space CRUD and save owners
- `windowSpaceSnapshotCapture.ts` now owns:
  - floating window-space snapshot building
- `windowSpaceSnapshotRestore.ts` now owns:
  - conversion from saved window-space state back into project-chat windowing state
- `windowSpaceSnapshots.ts` is now:
  - a thin compatibility facade over the snapshot capture and restore owners
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
- `projectChatThreads.ts`, `projectChatThreadGroupCrud.ts`,
  `projectChatThreadGroupOrdering.ts`,
  `projectChatThreadGroupAssignments.ts`,
  `projectChatThreadGroupMutations.ts`, `projectChatThreadMutations.ts`,
  `projectChatThreadStorageUndo.ts`, and `projectChatThreadStorageShared.ts`
  now split into:
  - `projectChatThreads.ts` as the thin compatibility re-export surface
  - `projectChatThreadGroupCrud.ts` for persisted group create/rename mutations
  - `projectChatThreadGroupOrdering.ts` for collapse/pin/reorder mutations
  - `projectChatThreadGroupAssignments.ts` for assignment/delete mutations
  - `projectChatThreadGroupMutations.ts` as the thin compatibility re-export surface
  - `projectChatThreadMutations.ts` for per-thread viewed, pin, reorder, and delete mutations
  - `projectChatThreadStorageUndo.ts` for delete undo-stack ownership and restoration
  - `projectChatThreadStorageShared.ts` for normalization and ordering helpers shared by the mutation and undo owners
- `aiChatStreaming.ts`, `aiChatStreamingRouting.ts`,
  `aiChatStreamingMessageDeltas.ts`, `aiChatStreamingMessageUpserts.ts`,
  `aiChatStreamingMessages.ts`, `aiChatStreamingSectionState.ts`,
  `aiChatStreamingToolCalls.ts`, `aiChatStreamingToolPreviews.ts`,
  `aiChatStreamingAppDefinition.ts`, and `aiChatStreamingTools.ts` now split
  into:
  - `aiChatStreaming.ts` for the public streaming entrypoint plus managed-chat detail updates
  - `aiChatStreamingChunkContext.ts` for placeholder filtering, project/section context resolution, and chatId-to-section lookup caching
  - `aiChatStreamingSectionRouting.ts` for stream-active tracking, section persistence, tool-preview cleanup, and scope-violation side effects
  - `aiChatStreamingRouting.ts` as the thin compatibility facade
  - `aiChatStreamingMessageDeltas.ts` for assistant placeholder creation plus shared text/thinking delta reducers
  - `aiChatStreamingMessageUpserts.ts` for finalized-assistant merge, response-placeholder detection, and generic message upserts
  - `aiChatStreamingMessages.ts` as the thin compatibility facade
  - `aiChatStreamingSectionState.ts` for managed chat-section reconciliation and active-branch sync
  - `aiChatStreamingToolCalls.ts` for tool-call placeholders and shared delta reducers
  - `aiChatStreamingToolPreviews.ts` for preview-store updates, preview cleanup, and app-spec patch preview application
  - `aiChatStreamingAppDefinition.ts` for app-definition tool result application
  - `aiChatStreamingTools.ts` as the thin compatibility facade
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
  `sections/createSectionCatalog.ts`,
  `sections/createSectionCatalogSectionGroups.ts`,
  `sections/createSectionCatalogControlGroups.ts`,
  `sections/createSectionCatalogGroupAssembly.ts`,
  `sections/createSectionCatalogStatic.ts`,
  `sections/createSectionCatalogTypes.ts`, `sections/createSectionsHelper.ts`,
  `sections/createSectionFileOpenShared.ts`,
  `sections/createSectionFileOpenCommands.ts`,
  `sections/createSectionFileDropRouting.ts`, and
  `sections/createSectionImplDefaults.ts` now split into:
  - `createSections.ts` for top-level create orchestration and empty-space add commands
  - `createSectionCatalogTypes.ts` for shared section creation menu types
  - `createSectionCatalogSectionGroups.ts` for static section/code/artifact/workflow/other presets
  - `createSectionCatalogControlGroups.ts` for metacontrol/embed presets
  - `createSectionCatalogGroupAssembly.ts` for ordered base group assembly
  - `createSectionCatalogStatic.ts` as the thin compatibility facade
  - `createSectionCatalog.ts` for hook-time singleton/codegen/plugin gating in `useCreateSectionsList`
  - `createSectionsHelper.ts` for the narrowed post-create command path for `createTopLevelSectionFromImplSpecs`
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
- `projectChatWindowingTrackedGitPaneState.ts` now owns:
  - tracked git-pane instance-key reads and writes
  - tracked git-pane validity reconciliation against authoritative window state
- `projectChatWindowingEmbeddedPaneVisibility.ts` now owns:
  - embedded git-pane visibility reads and toggles
  - project-scoped replace and authoritative prune reconciliation
- `projectChatWindowingEphemeralKeys.ts` now owns:
  - project-scoped ephemeral window key build and parse helpers
- `projectChatWindowingNormalization.ts` now owns:
  - pure windowing normalization
  - default floating and docked bounds helpers for UI readers and reducers
- `projectChatWindowingSelectors.ts` now owns:
  - section-binding and visible-window selector reads
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
- `projectChatWindowingSectionState.ts` now owns:
  - section exposure/binding reducers
  - section/canvas transition reducers that compose the instance/placement/bounds helpers
- `projectChatWindowingMetadataState.ts` now owns:
  - title and chat-id reducers
- `projectChatWindowingState.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
- `projectChatWindowLifecycleCommands.ts` now owns:
  - public window lifecycle and focus commands
- `projectChatWindowLayoutCommands.ts` now owns:
  - public placement commands
  - dock-fraction and floating-bounds commands
  - tracked git-pane cleanup coordination around layout writes
- `projectChatWindowCommands.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
- `projectChatWindowMetadataCommands.ts` now owns:
  - title/chat-id commands plus current-windowing state reads
- `projectChatWindowSectionCommands.ts` now owns:
  - section exposure, undock, and section/window mode transition commands
- `projectChatWindowing.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
  - write-helper re-exports shared by legacy callers and tests
- `projectChatWindowingEphemeral.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
  - tracked-window and embedded-visibility reconciliation composition
- `aiLLMConfiguration.ts` now owns:
  - LLM config load/save behavior
- `aiManagedApiKeyState.ts` now owns:
  - managed API-key snapshot updates, read failure handling, and in-flight load deduplication
- `aiManagedApiKeyPersistence.ts` now owns:
  - queued managed API-key writes plus revision-conflict and corrupt-store retry handling
- `aiManagedApiKeys.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
- `aiFollowToolArguments.ts` now owns:
  - AI-follow tool-argument snapshot reads, writes, and backend snapshot hydration
- `aiFollowHighlights.ts` now owns:
  - AI-follow tool-result highlights and scope-violation timeout orchestration
- `aiFollow.ts` now owns:
  - compatibility re-exports for callers that have not moved yet
- `aiConfigurationCatalogLoads.ts` now owns:
  - agent-profile, prompt-template, external-agent, and engine-config catalog fetch/hydration
  - external-agent health loading plus external-agent-config update fan-out
- `aiConfigurationCatalogState.ts` now owns:
  - shared AI catalog snapshot writes
  - mutation success and failure store updates
- `aiConfigurationCatalogMutations.ts` now owns:
  - agent-profile, prompt-template, external-agent, and engine-config mutation transport
- `terminal.ts`, `terminalSessionTransport.ts`, `terminalSessions.ts`, and
  `terminalFit.ts` now split into:
  - `terminal.ts` for React mount, ready/focus wiring, and resize observation
  - `terminalSessionTransport.ts` for websocket/session bootstrap plus stdin/output transport wiring
  - `terminalSessions.ts` for cached session reuse, resize buffering, and lifecycle bookkeeping
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

2. Keep project-chat window command ownership explicit

- `projectChatWindowLifecycleCommands.ts` should keep owning public lifecycle
  and focus commands instead of regrowing placement or bounds helpers.
- `projectChatWindowLayoutCommands.ts` should keep owning public placement and
  bounds commands plus tracked git-pane cleanup instead of regrowing
  section/window transitions or write coordination.
- `projectChatWindowCommands.ts` should stay a thin compatibility surface until
  importers have fully moved to the narrower command owners.

3. Normalize optimistic mutation infrastructure

- Create a consistent pattern for optimistic frontend mutations used by:
  - section mutations
  - window spaces
  - related layout/state features
- Continue routing new optimistic write paths through
  `projectStateOptimisticUpdates.ts` instead of rebuilding queue or rollback
  helpers inside feature query modules.
- Reuse seams that already exist in `projectChatWindowingNormalization.ts`, `projectChatWindowingSelectors.ts`, `projectChatWindowingInstanceState.ts`, `projectChatWindowingPlacementState.ts`, `projectChatWindowingBoundsState.ts`, `projectChatWindowingLayoutState.ts`, `projectChatWindowingSectionState.ts`, `projectChatWindowingMetadataState.ts`, `projectChatWindowingState.ts`, `projectChatWindowingWriteState.ts`, `projectChatWindowingWriteQueue.ts`, `projectChatWindowingWritePublish.ts`, `projectChatWindowingWriteSync.ts`, `projectChatWindowingWritePipeline.ts`, `projectChatWindowingWrites.ts`, `projectChatWindowingAuthoritative.ts`, `projectChatWindowingEphemeralKeys.ts`, `projectChatWindowingTrackedGitPaneState.ts`, `projectChatWindowingEmbeddedPaneVisibility.ts`, and `projectChatWindowingEphemeral.ts` where they fit instead of introducing parallel patterns.
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
