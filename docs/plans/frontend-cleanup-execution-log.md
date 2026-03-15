# Frontend Cleanup Execution Log

Append-only log of completed frontend cleanup slices.

Use [frontend/src/README.md](../../frontend/src/README.md) as the current
module map and placement guide while this cleanup progresses.

Historical note: older "Next highest-value unblocked slice" bullets record what
was locally true when that entry was written. They are useful context, but they
are not authoritative once newer hotspot rankings or ownership boundaries land
in `frontend/src/README.md` and the cleanup plans.

## 2026-03-14 14:06:02 PDT

- Slice completed: Phase 0 frontend cleanup foundation refresh
- Key files touched:
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan-index.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm exec prettier --check src/README.md ../docs/plans/frontend-cleanup-plan-index.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-cleanup-execution-log.md`
  - `git diff --check -- frontend/src/README.md docs/plans/frontend-cleanup-plan-index.md docs/plans/frontend-cleanup-plan.md docs/plans/frontend-cleanup-execution-log.md`
- Perf/CDP notes:
  - Not applicable. This slice only added navigation and ownership docs and did
    not change frontend behavior.
- Commit hash:
  - `c15e6901a456`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/ai.ts` around existing project-chat helper
    seams so chat submission, hydration, streaming, engine/config loading, and
    transcription stop sharing one action surface.

## 2026-03-14 14:16:40 PDT

- Slice completed: extracted transcription actions out of `frontend/src/state/actions/ai.ts`
- Key files touched:
  - `frontend/src/state/actions/aiTranscription.ts`
  - `frontend/src/state/actions/ai.ts`
  - `frontend/src/state/actions/aiTranscribeChatAudio.test.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
- Tests and verification run:
  - `pnpm exec vitest run src/state/actions/aiTranscribeChatAudio.test.ts src/state/actions/websocketReceive.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Section/Layouts/ChatArea.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectAISettingsTranscriptionProfileValidation.test.ts`
  - `pnpm exec prettier --check src/state/actions/aiTranscription.ts src/state/actions/ai.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Section/Layouts/ChatArea.tsx src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx src/state/actions/websocketReceive.ts src/state/actions/aiTranscribeChatAudio.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `2002d34e67d1`
- Next highest-value unblocked slice:
  - Keep splitting `frontend/src/state/actions/ai.ts` by moving engine/config
    loading plus agent-profile/prompt-template/external-agent catalog mutations
    into a dedicated settings/resource module, leaving `ai.ts` focused on chat
    submission, hydration, streaming, and stop/resume behavior.

## 2026-03-14 14:28:42 PDT

- Slice completed: extracted AI configuration and settings/resource catalogs out
  of `frontend/src/state/actions/ai.ts`
- Key files touched:
  - `frontend/src/state/actions/aiConfiguration.ts`
  - `frontend/src/state/actions/ai.ts`
  - `frontend/src/state/actions/aiConfigurationCatalogs.test.ts`
  - `frontend/src/state/actions/aiSaveLLMConfig.test.ts`
  - `frontend/src/state/actions/aiSaveLLMApiKeys.test.ts`
  - `frontend/src/state/actions/aiResourceLoadGuards.test.ts`
  - `frontend/src/state/actions/aiUpdateEngineConfig.test.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateLLMState.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm exec vitest run src/state/actions/aiSaveLLMConfig.test.ts src/state/actions/aiSaveLLMApiKeys.test.ts src/state/actions/aiResourceLoadGuards.test.ts src/state/actions/aiUpdateEngineConfig.test.ts src/state/actions/aiConfigurationCatalogs.test.ts src/state/actions/websocketReceive.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.test.ts src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx`
  - `pnpm exec prettier --check src/state/actions/aiConfiguration.ts src/state/actions/ai.ts src/state/actions/aiConfigurationCatalogs.test.ts src/state/actions/aiSaveLLMConfig.test.ts src/state/actions/aiSaveLLMApiKeys.test.ts src/state/actions/aiResourceLoadGuards.test.ts src/state/actions/aiUpdateEngineConfig.test.ts src/state/actions/websocketReceive.ts src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts src/components/Panes/Overview/ProjectLevelAI/useHydrateLLMState.ts src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `1065860f4f10`
- Next highest-value unblocked slice:
  - Keep shrinking `frontend/src/state/actions/ai.ts` by moving agent-run load,
    retry, and authoritative-update behavior into a dedicated module beside
    `agentRunUtils.ts`, leaving `ai.ts` focused on chat hydration, submission,
    streaming, and stop/resume paths.

## 2026-03-14 14:36:45 PDT

- Slice completed: extracted agent-run load/retry/reconciliation behavior out
  of `frontend/src/state/actions/ai.ts`
- Key files touched:
  - `frontend/src/state/actions/aiAgentRuns.ts`
  - `frontend/src/state/actions/aiAgentRuns.test.ts`
  - `frontend/src/state/actions/ai.ts`
  - `frontend/src/state/actions/aiResourceLoadGuards.test.ts`
  - `frontend/src/state/actions/stateMachineRuns.ts`
  - `frontend/src/state/actions/stateMachineRuns.test.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/state/hooks/useChatBranchIndex.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiAgentRuns.test.ts src/state/actions/aiResourceLoadGuards.test.ts src/state/actions/stateMachineRuns.test.ts src/state/actions/websocketReceive.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.test.ts src/components/Section/Layouts/ChatArea.test.tsx src/components/Panes/Overview/ProjectOverview/projectOverviewPolling.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiAgentRuns.ts src/state/actions/aiAgentRuns.test.ts src/state/actions/ai.ts src/state/actions/stateMachineRuns.ts src/state/actions/stateMachineRuns.test.ts src/state/actions/websocketReceive.ts src/state/actions/aiResourceLoadGuards.test.ts src/state/hooks/useChatBranchIndex.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx src/components/Section/Layouts/ChatArea.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `c0dc8c6f6f1e`
- Next highest-value unblocked slice:
  - Keep shrinking `frontend/src/state/actions/ai.ts` by moving chat hydration
    fetch/reconciliation paths into a dedicated module beside the existing
    `ProjectLevelAI` hydration helpers, leaving `ai.ts` focused on submission,
    streaming, and stop/resume behavior.

## 2026-03-14 14:48:27 PDT

- Slice completed: extracted chat hydration fetch/reconciliation behavior out of
  `frontend/src/state/actions/ai.ts`
- Key files touched:
  - `frontend/src/state/actions/aiHydration.ts`
  - `frontend/src/state/actions/aiChatSectionState.ts`
  - `frontend/src/state/actions/aiChatDetails.ts`
  - `frontend/src/state/actions/aiStopEligibleAssistantMessages.ts`
  - `frontend/src/state/actions/ai.ts`
  - `frontend/src/state/actions/aiStopProjectChat.test.ts`
  - `frontend/src/state/actions/aiWaitingForResponse.test.ts`
  - `frontend/src/state/actions/aiSectionStateSync.test.ts`
  - `frontend/src/state/actions/aiSectionResizePersistence.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.hydration.integration.test.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.test.ts`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiSectionStateSync.test.ts src/state/actions/aiSectionResizePersistence.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.hydration.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Section/Layouts/ChatArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/ai.ts src/state/actions/aiHydration.ts src/state/actions/aiChatSectionState.ts src/state/actions/aiChatDetails.ts src/state/actions/aiStopEligibleAssistantMessages.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiSectionStateSync.test.ts src/state/actions/aiSectionResizePersistence.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.hydration.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.test.ts src/components/Section/Layouts/ChatArea.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `2e9f9078bf7e`
- Next highest-value unblocked slice:
  - Keep shrinking `frontend/src/state/actions/ai.ts` by moving stop/resume and
    interruption-reconciliation behavior into a dedicated chat-control module,
    leaving `ai.ts` focused on submission, optimistic updates, and streaming.

## 2026-03-14 15:07:30 PDT

- Slice completed: extracted chat stop/resume, interruption tracking, and
  external approval/question responses out of `frontend/src/state/actions/ai.ts`
- Key files touched:
  - `frontend/src/state/actions/aiChatControls.ts`
  - `frontend/src/state/actions/aiChatState.ts`
  - `frontend/src/state/actions/aiInterruptedAssistantMessages.ts`
  - `frontend/src/state/actions/aiInterruptedAssistantMessages.test.ts`
  - `frontend/src/state/actions/ai.ts`
  - `frontend/src/state/actions/aiStopProjectChat.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/components/Chat/ApprovalCard.tsx`
  - `frontend/src/components/Chat/QuestionCard.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiInterruptedAssistantMessages.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts src/state/actions/aiAppSpecApply.test.ts src/state/actions/aiChatPromotion.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Section/Layouts/ChatArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/ai.ts src/state/actions/aiChatControls.ts src/state/actions/aiChatState.ts src/state/actions/aiInterruptedAssistantMessages.ts src/state/actions/aiInterruptedAssistantMessages.test.ts src/state/actions/aiStopProjectChat.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Section/Layouts/ChatArea.tsx src/components/Chat/ApprovalCard.tsx src/components/Chat/QuestionCard.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
  - `pnpm -C frontend exec eslint src/state/actions/ai.ts src/state/actions/aiChatControls.ts src/state/actions/aiChatState.ts src/state/actions/aiInterruptedAssistantMessages.ts src/state/actions/aiInterruptedAssistantMessages.test.ts src/state/actions/aiStopProjectChat.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Section/Layouts/ChatArea.tsx src/components/Chat/ApprovalCard.tsx src/components/Chat/QuestionCard.tsx` failed because the current frontend install is missing `@eslint/js`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `5783dfd24`
- Next highest-value unblocked slice:
  - Keep shrinking `frontend/src/state/actions/ai.ts` by moving chat
    submission/edit orchestration and pending-surface setup into a dedicated
    submission module, leaving `ai.ts` focused on streaming reducers and
    optimistic message reconciliation.

## 2026-03-14 15:21:29 PDT

- Slice completed: extracted chat submission/edit orchestration and
  surface-scoped pending draft state out of `frontend/src/state/actions/ai.ts`
- Key files touched:
  - `frontend/src/state/actions/aiChatSubmission.ts`
  - `frontend/src/state/actions/aiPendingChatState.ts`
  - `frontend/src/state/actions/aiPendingChatState.test.ts`
  - `frontend/src/state/actions/ai.ts`
  - `frontend/src/state/actions/aiSubmitMessage.test.ts`
  - `frontend/src/state/actions/aiEditedMessage.test.ts`
  - `frontend/src/state/actions/aiChatPromotion.test.ts`
  - `frontend/src/state/actions/aiWebsocketAffinitySubmit.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiPendingChatState.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiChatPromotion.test.ts src/state/actions/aiWebsocketAffinitySubmit.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/components/Section/Layouts/ChatArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/ai.ts src/state/actions/aiChatSubmission.ts src/state/actions/aiPendingChatState.ts src/state/actions/aiPendingChatState.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiChatPromotion.test.ts src/state/actions/aiWebsocketAffinitySubmit.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Section/Layouts/ChatArea.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `440ed86c5`
- Next highest-value unblocked slice:
  - Keep shrinking `frontend/src/state/actions/ai.ts` by moving streaming
    reducers plus tool-preview/app-spec patch handling into a dedicated
    streaming module, leaving `ai.ts` as a thin compatibility surface or
    retiring it entirely.

## 2026-03-14 15:29:26 PDT

- Slice completed: extracted streaming reducers plus tool-preview/app-spec
  reconciliation into `frontend/src/state/actions/aiChatStreaming.ts` and
  retired `frontend/src/state/actions/ai.ts`
- Key files touched:
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/ai.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/state/actions/aiAppSpecApply.test.ts`
  - `frontend/src/state/actions/aiAppSpecPatchPreview.test.ts`
  - `frontend/src/state/actions/aiChatPromotion.test.ts`
  - `frontend/src/state/actions/aiEditedMessage.test.ts`
  - `frontend/src/state/actions/aiSectionStreaming.test.ts`
  - `frontend/src/state/actions/aiStopProjectChat.test.ts`
  - `frontend/src/state/actions/aiStreamingPersistence.test.ts`
  - `frontend/src/state/actions/aiSubmitMessage.test.ts`
  - `frontend/src/state/actions/aiWaitingForResponse.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiAppSpecPatchPreview.test.ts src/state/actions/aiAppSpecApply.test.ts src/state/actions/aiStreamingPersistence.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiChatPromotion.test.ts src/state/actions/websocketReceive.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Section/Layouts/ChatArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatStreaming.ts src/state/actions/websocketReceive.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Section/Layouts/ChatArea.tsx src/state/actions/aiAppSpecApply.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts src/state/actions/aiChatPromotion.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiStreamingPersistence.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiWaitingForResponse.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `f893d3813f96`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/definitions.ts` into domain-owned store modules so
    new shared state stops defaulting into the single 1500-line definitions
    surface.

## 2026-03-14 15:41:24 PDT

- Slice completed: extracted the AI/chat Zustand stores and shared persist
  helper out of `frontend/src/state/definitions.ts` into
  `frontend/src/state/stores/aiStores.ts` and
  `frontend/src/state/storePersistStorage.ts`
- Key files touched:
  - `frontend/src/state/stores/aiStores.ts`
  - `frontend/src/state/storePersistStorage.ts`
  - `frontend/src/state/stores/aiStores.test.ts`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/state/aiStorePersistence.test.ts`
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/aiHydration.ts`
  - `frontend/src/state/actions/aiChatSubmission.ts`
  - `frontend/src/state/actions/aiChatControls.ts`
  - `frontend/src/state/actions/aiChatState.ts`
  - `frontend/src/state/actions/aiConfiguration.ts`
  - `frontend/src/state/actions/aiTranscription.ts`
  - `frontend/src/state/actions/aiAgentRuns.ts`
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/stateMachineRuns.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/hooks/agenticScopeHighlights.ts`
  - `frontend/src/state/hooks/useChatBranchIndex.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/aiStorePersistence.test.ts src/state/stores/aiStores.test.ts src/state/actions/aiFollow.test.ts src/state/actions/aiAgentRuns.test.ts src/state/actions/aiConfigurationCatalogs.test.ts src/state/actions/aiTranscribeChatAudio.test.ts src/state/actions/aiPendingChatState.test.ts src/state/actions/aiInterruptedAssistantMessages.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/stateMachineRuns.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/storePersistStorage.ts src/state/stores/aiStores.ts src/state/stores/aiStores.test.ts src/state/definitions.ts src/state/aiStorePersistence.test.ts src/state/actions/aiHydration.ts src/state/actions/aiChatState.ts src/state/actions/aiChatControls.ts src/state/actions/aiChatDetails.ts src/state/actions/aiFollow.ts src/state/actions/agenticScopeViolation.ts src/state/actions/aiBranches.ts src/state/actions/chatBranches.ts src/state/actions/chatBranchIndex.ts src/state/hooks/agenticScopeHighlights.ts src/state/hooks/useChatBranchIndex.ts src/state/actions/aiAgentRuns.ts src/state/actions/aiChatSubmission.ts src/state/actions/aiConfiguration.ts src/state/actions/aiTranscription.ts src/state/actions/aiPendingChatState.ts src/state/actions/aiInterruptedAssistantMessages.ts src/state/actions/aiChatStreaming.ts src/state/actions/sectionInfos.ts src/state/actions/projectChatWindowing.ts src/state/actions/stateMachineRuns.ts src/state/actions/aiFollow.test.ts src/state/actions/aiAgentRuns.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/store ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `6fa94bac7469`
- Next highest-value unblocked slice:
  - Extract the remaining app/share/session and app-preview stores out of
    `frontend/src/state/definitions.ts`, leaving `definitions.ts` as a thinner
    index around domain-owned store modules.

## 2026-03-14 15:57:45 PDT

- Slice completed: extracted app definition/config/preview stores plus
  session/share/server-mode metadata stores out of
  `frontend/src/state/definitions.ts` into
  `frontend/src/state/stores/appStores.ts` and
  `frontend/src/state/stores/sessionStores.ts`
- Key files touched:
  - `frontend/src/state/stores/appStores.ts`
  - `frontend/src/state/stores/sessionStores.ts`
  - `frontend/src/state/stores/appStores.test.ts`
  - `frontend/src/state/stores/sessionStores.test.ts`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/state/actions/app.ts`
  - `frontend/src/state/actions/share.ts`
  - `frontend/src/state/actions/project/loadProject.ts`
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Pages/App/AppPage.tsx`
  - `frontend/src/components/Pages/Project/AppPreview.tsx`
  - `frontend/src/components/Panes/Overview/ProjectConfigs.tsx`
  - `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
  - `frontend/src/components/Modals/WorkspaceSwitcherModal/WorkspaceSwitcherModal.tsx`
  - `frontend/src/components/AppHeader/ProjectNav.tsx`
  - `frontend/src/utils/endpointUtils.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/stores/appStores.test.ts src/state/stores/sessionStores.test.ts src/utils/endpointUtils.test.ts src/state/actions/serverMode.test.ts src/state/actions/project/loadProject.test.ts src/state/actions/aiAppSpecApply.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts src/components/Pages/Project/AppPreview.test.tsx src/components/Pages/App/AppPage.test.tsx src/components/App/AppRenderer.test.tsx src/components/App/AppRenderer.policy.test.tsx src/components/Panes/Overview/ProjectConfigs.test.tsx src/components/Modals/WorkspaceSwitcherModal/WorkspaceSwitcherModal.test.tsx src/components/AppHeader/ProjectNav.test.tsx src/components/Modals/FileMenuModal/utils.test.tsx src/components/AppHeader/PluginRestartBanner.test.tsx`
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/BackendLogEventsArea.test.ts`
  - `(cd frontend && git diff --name-only -- frontend/src docs/plans | grep -E '\\.(ts|tsx|md)$' | sed -e 's#^frontend/##' -e 's#^docs/#../docs/#' | xargs pnpm exec prettier --check)`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/store ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `239fa4b79`
- Next highest-value unblocked slice:
  - Extract the remaining UI-chrome/layout, browser, and local-editor stores
    out of `frontend/src/state/definitions.ts` so it can shrink toward a thin
    compatibility index instead of a shared default landing zone.

## 2026-03-14 16:06:50 PDT

- Slice completed: extracted browser and search stores out of
  `frontend/src/state/definitions.ts` into
  `frontend/src/state/stores/fileBrowserStores.ts` and
  `frontend/src/state/stores/searchStores.ts`
- Key files touched:
  - `frontend/src/state/stores/fileBrowserStores.ts`
  - `frontend/src/state/stores/searchStores.ts`
  - `frontend/src/state/stores/fileBrowserStores.test.ts`
  - `frontend/src/state/stores/searchStores.test.ts`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/state/hooks/search.ts`
  - `frontend/src/state/actions/sections/sectionParamFilter.ts`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Pages/Home/HomePage.tsx`
  - `frontend/src/components/AppHeader/SearchBar/ProjectPageSearch.tsx`
  - `frontend/src/components/AppHeader/SearchBar/HomePageSearch.tsx`
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Modals/DropzoneFilePickerModal/DropzoneFilePickerModal.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/stores/fileBrowserStores.test.ts src/state/stores/searchStores.test.ts src/components/Panes/Overview/FileBrowser/FileBrowserPane.test.ts src/components/Section/Layouts/BrowserArea.test.tsx src/components/AppHeader/SearchBar/ProjectPageSearch.test.ts src/components/Pages/Home/HomePage.test.tsx`
  - `(cd frontend && git diff --name-only -- frontend/src docs/plans | grep -E '\\.(ts|tsx|md)$' | sed -e 's#^frontend/##' -e 's#^docs/#../docs/#' | xargs pnpm exec prettier --check)`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/store ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `58e2f52a6`
- Next highest-value unblocked slice:
  - Extract the remaining UI-chrome/layout and local-editor store groups out of
    `frontend/src/state/definitions.ts`, starting with modal, notification,
    run-control, backend-log, and project-loading ownership so
    `definitions.ts` keeps shrinking toward a thin compatibility index.

## 2026-03-14 16:16:52 PDT

- Slice completed: extracted feedback and project-status stores out of
  `frontend/src/state/definitions.ts` into
  `frontend/src/state/stores/feedbackStores.ts` and
  `frontend/src/state/stores/projectStatusStores.ts`
- Key files touched:
  - `frontend/src/state/stores/feedbackStores.ts`
  - `frontend/src/state/stores/projectStatusStores.ts`
  - `frontend/src/state/stores/feedbackStores.test.ts`
  - `frontend/src/state/stores/projectStatusStores.test.ts`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/state/actions/modal.ts`
  - `frontend/src/state/actions/notifications.ts`
  - `frontend/src/state/actions/backendLogEvents.ts`
  - `frontend/src/state/actions/customRuns.ts`
  - `frontend/src/state/actions/app.ts`
  - `frontend/src/state/actions/share.ts`
  - `frontend/src/state/hooks/project.ts`
  - `frontend/src/state/hooks/share.ts`
  - `frontend/src/components/Modals/ModalContainer.tsx`
  - `frontend/src/components/AppHeader/RunButton.tsx`
  - `frontend/src/components/AppHeader/Notification.tsx`
  - `frontend/src/components/Panes/Overview/NotificationsArea.tsx`
  - `frontend/src/components/Panes/Overview/Overview.tsx`
  - `frontend/src/components/Panes/Overview/BackendLogEventsArea.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/stores/feedbackStores.test.ts src/state/stores/projectStatusStores.test.ts src/state/actions/notifications.test.ts src/state/actions/backendLogEvents.test.ts src/state/hooks/project.test.tsx src/components/Panes/Overview/NotificationsArea.test.tsx src/components/Panes/Overview/BackendLogEventsArea.test.ts src/components/Pages/Home/HomePage.test.tsx`
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/Overview.test.tsx`
  - `(cd frontend && git diff --name-only -- frontend/src docs/plans | grep -E '\\.(ts|tsx|md)$' | sed -e 's#^frontend/##' -e 's#^docs/#../docs/#' | xargs pnpm exec prettier --check)`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/store ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `bf974f4c5`
- Next highest-value unblocked slice:
  - Extract the remaining layout/local-editor store groups out of
    `frontend/src/state/definitions.ts`, starting with `useMisc`,
    `useTemporaryMiscState`, and the adjacent authoring/layout state that still
    drives section dragging, preview measurements, and embedded pane state.

## 2026-03-14 16:29:32 PDT

- Slice completed: extracted layout interaction stores out of
  `frontend/src/state/definitions.ts` into
  `frontend/src/state/stores/layoutInteractionStores.ts`
- Key files touched:
  - `frontend/src/state/stores/layoutInteractionStores.ts`
  - `frontend/src/state/stores/layoutInteractionStores.test.ts`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/state/actions/edgeHandles.ts`
  - `frontend/src/state/actions/nodeInternals.ts`
  - `frontend/src/state/actions/projectChatWindowingEphemeral.ts`
  - `frontend/src/state/hooks/sectionSizes.ts`
  - `frontend/src/state/subscriptions.ts`
  - `frontend/src/forks/xyflow/core/utils/graph.ts`
  - `frontend/src/forks/xyflow/core/container/Pane.tsx`
  - `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
  - `frontend/src/forks/xyflow/minimap/MiniMapNodes.tsx`
  - `frontend/src/forks/dnd-kit/useDropType.ts`
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Git/GitGraphWindowContent.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/stores/layoutInteractionStores.test.ts src/components/Git/GitGraphWindowContent.test.tsx src/forks/xyflow/core/container/ZoomPane.test.ts src/forks/xyflow/core/utils/graph.test.ts src/forks/xyflow/minimap/MiniMapNodes.test.tsx src/state/hooks/sectionSizes.integration.test.tsx src/state/actions/projectChatWindowing.test.ts src/state/actions/sectionInfos.test.ts src/components/Section/Container/SectionWindowSurface.test.tsx src/forks/dnd-kit/useDropType.test.ts src/forks/xyflow/core/container/Pane.test.tsx`
  - `pnpm -C frontend exec vitest run src/state/actions/project/loadProject.test.ts src/state/actions/sectionInfos.projectChatWindowingSync.test.ts`
  - `{ git diff --name-only -- frontend/src docs/plans; git ls-files --others --exclude-standard frontend/src docs/plans; } | sort -u | grep -E '\\.(ts|tsx|md)$' | sed -e 's#^frontend/##' -e 's#^docs/#../docs/#' | xargs -r pnpm -C frontend exec prettier --check`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/store ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `2d11e53d1`
- Next highest-value unblocked slice:
  - Extract the remaining persisted UI chrome and editor/runtime stores out of
    `frontend/src/state/definitions.ts`, starting with `useLocalStorage` and
    then the adjacent `useSettings`, `useWaitingForLSPResult`,
    `useTypeErrors`, and `useLspDiagnostics` ownership.

## 2026-03-14 16:42:09 PDT

- Slice completed: extracted UI preference and editor-diagnostics stores out of
  `frontend/src/state/definitions.ts` into
  `frontend/src/state/stores/uiPreferenceStores.ts` and
  `frontend/src/state/stores/editorDiagnosticsStores.ts`
- Key files touched:
  - `frontend/src/state/stores/uiPreferenceStores.ts`
  - `frontend/src/state/stores/editorDiagnosticsStores.ts`
  - `frontend/src/state/stores/uiPreferenceStores.test.ts`
  - `frontend/src/state/stores/editorDiagnosticsStores.test.ts`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/state/actions/localStorage.ts`
  - `frontend/src/state/actions/uiSettingReveal.ts`
  - `frontend/src/state/actions/lspDiagnostics.ts`
  - `frontend/src/state/actions/typeCheck.ts`
  - `frontend/src/state/actions/nameValidation.ts`
  - `frontend/src/state/hooks/lsp.ts`
  - `frontend/src/components/Panes/Overview/Overview.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Section/Layouts/CodeArea.tsx`
  - `frontend/src/forks/xyflow/controls/Controls.tsx`
  - `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/stores/uiPreferenceStores.test.ts src/state/stores/editorDiagnosticsStores.test.ts src/state/actions/localStorage.test.ts src/state/actions/uiSettingReveal.test.ts src/state/actions/projectChatThreads.test.ts src/state/actions/backendLogEvents.test.ts src/state/actions/lspDiagnostics.test.ts src/state/actions/typeCheck.test.ts src/state/actions/formatCode.test.ts src/state/actions/chatSharedEdges.test.ts src/state/actions/project/loadProject.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/sectionInfos.test.ts src/state/actions/undo.test.ts src/state/hooks/sectionSizes.integration.test.tsx src/components/Panes/Overview/Overview.test.tsx src/components/Panes/Overview/ProjectConfigs.test.tsx src/components/Panes/UiEditor/UiEditor.test.tsx src/components/AppHeader/ProjectNav.test.tsx src/components/Params/GroupContainer.test.tsx src/components/Section/Header/SectionHeader.test.tsx src/components/Section/Layouts/CodeArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Panes/Overview/NotificationsArea.test.tsx src/components/Chat/ChatMessages.lightModeToolCallSurface.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx src/forks/xyflow/core/container/Pane.test.tsx src/forks/xyflow/core/container/ZoomPane.test.ts src/forks/xyflow/minimap/MiniMapNodes.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatAuxViewState.integration.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.hydration.integration.test.tsx`
  - `pnpm -C frontend exec vitest run src/components/AppHeader/SearchBar/ProjectPageSearch.test.ts src/components/Panes/Overview/runInstructionsStateMachineControls.test.ts`
  - `pnpm -C frontend exec vitest run src/state/stores/editorDiagnosticsStores.test.ts`
  - `git diff --name-only -- frontend/src docs/plans | sed -e 's#^frontend/##' -e 's#^docs/#../docs/#' | grep -E '\\.(ts|tsx|md)$' | xargs -r pnpm -C frontend exec prettier --check`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/store ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `5b8aba179`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionInfos.ts` into clearer read/query,
    optimistic mutation, and project-chat-windowing sync modules now that
    `definitions.ts` has been reduced to a thin compatibility index.

## 2026-03-14 16:52:44 PDT

- Slice completed: extracted backend project-state reconciliation and
  project-chat windowing sync out of `frontend/src/state/actions/sectionInfos.ts`
  into `frontend/src/state/actions/sectionProjectStateSync.ts`
- Key files touched:
  - `frontend/src/state/actions/sectionProjectStateSync.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/state/actions/websocketReceive.test.ts`
  - `frontend/src/state/actions/sectionInfos.test.ts`
  - `frontend/src/state/actions/sectionInfos.projectChatWindowingSync.test.ts`
  - `frontend/src/state/actions/activeSections.test.ts`
  - `frontend/src/state/actions/aiSectionResizePersistence.test.ts`
  - `frontend/src/state/actions/aiSectionStreaming.test.ts`
  - `frontend/src/state/actions/aiStreamingPersistence.test.ts`
  - `frontend/src/state/actions/projectChatWindowing.rollback.test.ts`
  - `frontend/src/state/actions/sections/moveSections.test.ts`
  - `frontend/src/state/actions/sections/topLevelLayoutPersistence.test.ts`
  - `frontend/src/state/actions/uiSettingReveal.test.ts`
  - `frontend/src/plugins/runtime.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.test.ts src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/state/actions/activeSections.test.ts src/state/actions/aiSectionResizePersistence.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/aiStreamingPersistence.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/sections/moveSections.test.ts src/state/actions/sections/topLevelLayoutPersistence.test.ts src/state/actions/uiSettingReveal.test.ts src/state/actions/websocketReceive.test.ts src/plugins/runtime.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sectionProjectStateSync.ts src/state/actions/sectionInfos.ts src/state/actions/websocketReceive.ts src/state/actions/websocketReceive.test.ts src/state/actions/activeSections.test.ts src/state/actions/aiSectionResizePersistence.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/aiStreamingPersistence.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/state/actions/sectionInfos.test.ts src/state/actions/sections/moveSections.test.ts src/state/actions/sections/topLevelLayoutPersistence.test.ts src/state/actions/uiSettingReveal.test.ts src/plugins/runtime.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `67a936c08`
- Next highest-value unblocked slice:
  - Split the remaining `frontend/src/state/actions/sectionInfos.ts` surface
    into clearer read/effective-impl helpers and optimistic mutation commands,
    now that backend snapshot reconciliation lives in
    `frontend/src/state/actions/sectionProjectStateSync.ts`.

## 2026-03-14 17:03:37 PDT

- Slice completed: extracted shared project-state command entrypoints out of
  `frontend/src/state/actions/sectionInfos.ts` into
  `frontend/src/state/actions/projectStateCommands.ts`
- Key files touched:
  - `frontend/src/state/actions/projectStateCommands.ts`
  - `frontend/src/state/actions/projectStateCommands.test.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/state/actions/keyActivations.ts`
  - `frontend/src/state/actions/params/moveParams.ts`
  - `frontend/src/state/subscriptions.ts`
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectStateCommands.test.ts src/components/Params/GroupContainer.test.tsx src/state/actions/sectionInfos.test.ts src/state/actions/websocketReceive.test.ts src/state/actions/sections/topLevelLayoutPersistence.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectStateCommands.ts src/state/actions/projectStateCommands.test.ts src/state/actions/sectionInfos.ts src/state/actions/websocketReceive.ts src/state/actions/keyActivations.ts src/state/actions/params/moveParams.ts src/state/subscriptions.ts src/components/Params/GroupContainer.tsx src/components/Params/ParamSwitch.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `pnpm -C frontend exec tsc --noEmit`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `8bb0c0032`
- Next highest-value unblocked slice:
  - Extract the remaining optimistic update scaffolding in
    `frontend/src/state/actions/sectionInfos.ts`, especially
    `dispatchOptimisticProjectStateUpdate` and the pending-op plumbing, into a
    dedicated project-state mutation infrastructure module.

## 2026-03-14 17:14:32 PDT

- Slice completed: extracted optimistic project-state mutation scaffolding out
  of `frontend/src/state/actions/sectionInfos.ts` into
  `frontend/src/state/actions/projectStateOptimisticUpdates.ts`
- Key files touched:
  - `frontend/src/state/actions/projectStateOptimisticUpdates.ts`
  - `frontend/src/state/actions/projectStateOptimisticUpdates.test.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/projectStateCommands.ts`
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/windowSpaces.ts`
  - `frontend/src/state/actions/agenticEdges.ts`
  - `frontend/src/state/actions/aiChatSectionState.ts`
  - `frontend/src/state/actions/aiChatSubmission.ts`
  - `frontend/src/state/actions/codeUpdates.ts`
  - `frontend/src/state/actions/edges.ts`
  - `frontend/src/state/actions/params/moveParams.ts`
  - `frontend/src/state/actions/sections/moveSections.ts`
  - `frontend/src/state/actions/stateMachineEdges.ts`
  - `frontend/src/state/actions/viewModes.ts`
  - `frontend/src/state/hooks/useBrowserColumnWidth.ts`
  - `frontend/src/state/hooks/useParamColumnWidth.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectStateOptimisticUpdates.test.ts src/state/actions/projectStateCommands.test.ts src/state/actions/sections/topLevelLayoutPersistence.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/sections/moveSections.test.ts src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec vitest run src/state/actions/agenticEdges.test.ts src/state/actions/stateMachineEdges.test.ts src/state/actions/viewModes.test.ts src/state/actions/windowSpaces.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectStateOptimisticUpdates.ts src/state/actions/projectStateOptimisticUpdates.test.ts src/state/actions/projectStateCommands.ts src/state/actions/sectionInfos.ts src/state/actions/agenticEdges.ts src/state/actions/aiChatSectionState.ts src/state/actions/aiChatSubmission.ts src/state/actions/codeUpdates.ts src/state/actions/edges.ts src/state/actions/params/moveParams.ts src/state/actions/projectChatWindowing.ts src/state/actions/sections/moveSections.ts src/state/actions/stateMachineEdges.ts src/state/actions/viewModes.ts src/state/actions/windowSpaces.ts src/state/hooks/useBrowserColumnWidth.ts src/state/hooks/useParamColumnWidth.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `ff4eac616`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/uiSettingReveal.ts`, now the largest
    remaining state-action hotspot, into narrower UI-setting reveal/search
    modules without changing the authored frontend behavior.

## 2026-03-14 17:27:57 PDT

- Slice completed: split `frontend/src/state/actions/uiSettingReveal.ts` into
  focused reveal modules for execution/status helpers, mutation leases,
  pane-activation state writes, and DOM anchor/highlight behavior
- Key files touched:
  - `frontend/src/state/actions/uiSettingReveal.ts`
  - `frontend/src/state/actions/uiSettingRevealShared.ts`
  - `frontend/src/state/actions/uiSettingRevealMutations.ts`
  - `frontend/src/state/actions/uiSettingRevealActivation.ts`
  - `frontend/src/state/actions/uiSettingRevealDom.ts`
  - `frontend/src/state/actions/uiSettingRevealDom.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/uiSettingReveal.test.ts src/state/actions/uiSettingRevealDom.test.ts src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/uiSettingReveal.ts src/state/actions/uiSettingRevealShared.ts src/state/actions/uiSettingRevealMutations.ts src/state/actions/uiSettingRevealActivation.ts src/state/actions/uiSettingRevealDom.ts src/state/actions/uiSettingRevealDom.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `542e41cc9`
- Next highest-value unblocked slice:
  - Continue splitting `frontend/src/state/actions/sectionInfos.ts`, now the
    largest remaining shared-state hotspot, into clearer read/effective-impl
    helpers and top-level layout persistence ownership.

## 2026-03-14 17:36:14 PDT

- Slice completed: extracted top-level layout queries and persistence out of
  `frontend/src/state/actions/sectionInfos.ts` into dedicated layout modules
- Key files touched:
  - `frontend/src/state/actions/topLevelSectionLayouts.ts`
  - `frontend/src/state/actions/topLevelSectionLayouts.test.ts`
  - `frontend/src/state/actions/topLevelLayoutPersistence.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/sectionInfos.test.ts`
  - `frontend/src/state/actions/sectionProjectStateSync.ts`
  - `frontend/src/state/actions/nodeInternals.ts`
  - `frontend/src/state/actions/sections/createSections.ts`
  - `frontend/src/state/actions/sections/sectionPositions.ts`
  - `frontend/src/state/actions/sections/topLevelLayoutPersistence.test.ts`
  - `frontend/src/state/actions/sections/topLevelLayoutSnapshot.test.ts`
  - `frontend/src/state/subscriptions.ts`
  - `frontend/src/utils/settaApiPresets.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.test.ts src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/state/actions/topLevelSectionLayouts.test.ts src/state/actions/sections/topLevelLayoutPersistence.test.ts src/state/actions/sections/topLevelLayoutSnapshot.test.ts`
  - `pnpm -C frontend exec vitest run src/state/actions/sections/createSections.test.ts src/state/actions/sections/createSectionsHelper.test.ts src/state/actions/sections/createSectionsHelper.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/sectionInfos.ts src/state/actions/topLevelSectionLayouts.ts src/state/actions/topLevelLayoutPersistence.ts src/state/actions/topLevelSectionLayouts.test.ts src/state/actions/sectionInfos.test.ts src/state/actions/sectionProjectStateSync.ts src/state/actions/sections/sectionPositions.ts src/state/actions/nodeInternals.ts src/state/actions/sections/createSections.ts src/state/actions/sections/topLevelLayoutPersistence.test.ts src/state/actions/sections/topLevelLayoutSnapshot.test.ts src/state/subscriptions.ts src/utils/settaApiPresets.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `1793d834d`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/windowSpaces.ts`, now the largest
    remaining shared-state hotspot, into clearer optimistic layout writes,
    bounds normalization, and persisted window-space mutation modules.

## 2026-03-14 17:46:39 PDT

- Slice completed: split `frontend/src/state/actions/windowSpaces.ts` into
  dedicated window-space persistence and snapshot modules, leaving restore
  orchestration in the main file
- Key files touched:
  - `frontend/src/state/actions/windowSpacePersistence.ts`
  - `frontend/src/state/actions/windowSpaceSnapshots.ts`
  - `frontend/src/state/actions/windowSpaces.ts`
  - `frontend/src/state/actions/windowSpaces.test.ts`
  - `frontend/src/components/Panes/Overview/WindowSpacesPane.tsx`
  - `frontend/src/components/Panes/Overview/WindowSpacesPane.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/windowSpaces.test.ts src/components/Panes/Overview/WindowSpacesPane.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/windowSpaces.ts src/state/actions/windowSpacePersistence.ts src/state/actions/windowSpaceSnapshots.ts src/state/actions/windowSpaces.test.ts src/components/Panes/Overview/WindowSpacesPane.tsx src/components/Panes/Overview/WindowSpacesPane.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `998bdbfe5`
- Next highest-value unblocked slice:
  - Continue splitting `frontend/src/state/actions/sectionInfos.ts`, now the
    largest remaining shared-state hotspot, into clearer effective-impl/read
    helpers and section metadata query modules.

## 2026-03-14 18:01:42 PDT

- Slice completed: extracted effective section/code-object resolution out of
  `frontend/src/state/actions/sectionInfos.ts` into a dedicated
  `sectionEffectiveImpls.ts` owner module
- Key files touched:
  - `frontend/src/state/actions/sectionEffectiveImpls.ts`
  - `frontend/src/state/actions/sectionEffectiveImpls.test.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/sectionInfos.test.ts`
  - `frontend/src/state/actions/activeSectionController.ts`
  - `frontend/src/state/actions/projectStateCommands.ts`
  - `frontend/src/state/actions/sectionProjectStateSync.ts`
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/aiHydration.ts`
  - `frontend/src/state/actions/aiChatSectionState.ts`
  - `frontend/src/state/actions/sections/sectionSizes.ts`
  - `frontend/src/state/actions/windowSpacePersistence.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionEffectiveImpls.test.ts src/state/actions/sectionInfos.test.ts src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/state/actions/projectStateCommands.test.ts src/state/actions/activeSectionController.test.ts src/state/actions/activeSections.test.ts src/state/actions/stateMachineEdges.test.ts src/state/actions/sections/sectionSizes.test.tsx src/state/hooks/sectionSizes.test.tsx src/state/actions/sections/moveSections.test.ts`
  - `pnpm -C frontend exec vitest run src/state/actions/aiStreamingPersistence.test.ts src/state/actions/aiSectionStateSync.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/windowSpaces.test.ts src/components/Panes/Overview/WindowSpacesPane.test.tsx`
  - `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.listRootViewMode.perf.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sectionEffectiveImpls.ts src/state/actions/sectionInfos.ts src/state/actions/activeSectionController.ts src/state/actions/projectStateCommands.ts src/state/actions/sectionProjectStateSync.ts src/state/actions/aiChatStreaming.ts src/state/actions/aiHydration.ts src/state/actions/aiChatSectionState.ts src/state/actions/sections/sectionSizes.ts src/state/actions/windowSpacePersistence.ts src/state/actions/sectionInfos.test.ts src/state/actions/sectionEffectiveImpls.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `e74a101b65c7`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/websocketReceive.ts`, now the largest
    remaining shared-state hotspot, into clearer protocol parsing, snapshot
    reconciliation, and feature-specific dispatch modules.

## 2026-03-14 18:11:02 PDT

- Slice completed: extracted incoming websocket message dispatch and
  `UISettingReveal` acknowledgment handling out of
  `frontend/src/state/actions/websocketReceive.ts` into a dedicated
  `websocketIncomingMessages.ts` owner module
- Key files touched:
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/websocketReceive.ts src/state/actions/websocketIncomingMessages.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `d72cc734cb17`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/hooks/terminals/terminal.ts`, now the largest
    remaining terminal/runtime hotspot, into clearer transport/session
    lifecycle, resize/focus wiring, and terminal event helpers.

## 2026-03-14 18:24:11 PDT

- Slice completed: split terminal hook ownership by extracting cached terminal
  websocket sessions and xterm fit/reflow behavior out of
  `frontend/src/state/hooks/terminals/terminal.ts`
- Key files touched:
  - `frontend/src/state/hooks/terminals/terminal.ts`
  - `frontend/src/state/hooks/terminals/terminalSessions.ts`
  - `frontend/src/state/hooks/terminals/terminalFit.ts`
  - `frontend/src/state/hooks/terminals/terminalSessions.test.ts`
  - `frontend/src/state/hooks/terminals/terminalFit.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/hooks/terminals/terminalSessions.test.ts src/state/hooks/terminals/terminalFit.test.ts src/components/Section/Layouts/TerminalArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/hooks/terminals/terminal.ts src/state/hooks/terminals/terminalSessions.ts src/state/hooks/terminals/terminalFit.ts src/state/hooks/terminals/terminalSessions.test.ts src/state/hooks/terminals/terminalFit.test.ts src/components/Section/Layouts/TerminalArea.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/hook ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `df2bf5dde`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/uiSettingRevealMutations.ts`, now the
    next shared-infrastructure hotspot, into clearer snapshot capture,
    rollback/finalization, and per-surface mutation helpers.

## 2026-03-14 18:31:56 PDT

- Slice completed: split UI setting reveal mutation ownership and snapshot
  rollback out of `frontend/src/state/actions/uiSettingRevealMutations.ts`
- Key files touched:
  - `frontend/src/state/actions/uiSettingRevealMutations.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationTypes.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationOwnership.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationSnapshots.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationOwnership.test.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationSnapshots.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/uiSettingRevealMutationOwnership.test.ts src/state/actions/uiSettingRevealMutationSnapshots.test.ts src/state/actions/uiSettingReveal.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/uiSettingRevealMutations.ts src/state/actions/uiSettingRevealMutationTypes.ts src/state/actions/uiSettingRevealMutationOwnership.ts src/state/actions/uiSettingRevealMutationSnapshots.ts src/state/actions/uiSettingRevealMutationOwnership.test.ts src/state/actions/uiSettingRevealMutationSnapshots.test.ts src/state/actions/uiSettingReveal.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `01ace479c`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/keyActivations.ts`, now the largest
    remaining shared-state hotspot, into clearer section-selection, reveal/focus
    shortcut, and pane/layout command modules.

## 2026-03-14 18:42:51 PDT

- Slice completed: split global key activation ownership by extracting shortcut
  parsing/input-ignore policy and key handler logic out of
  `frontend/src/state/actions/keyActivations.ts`
- Key files touched:
  - `frontend/src/state/actions/keyActivations.ts`
  - `frontend/src/state/actions/keyActivationHandlers.ts`
  - `frontend/src/state/actions/keyShortcutUtils.ts`
  - `frontend/src/state/actions/keyShortcutUtils.test.ts`
  - `frontend/src/state/actions/keyActivationHandlers.test.ts`
  - `frontend/src/state/actions/keyActivations.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/keyShortcutUtils.test.ts src/state/actions/keyActivationHandlers.test.ts src/state/actions/keyActivations.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/keyActivations.ts src/state/actions/keyActivationHandlers.ts src/state/actions/keyShortcutUtils.ts src/state/actions/keyShortcutUtils.test.ts src/state/actions/keyActivationHandlers.test.ts src/state/actions/keyActivations.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `b266d93a6`
- Next highest-value unblocked slice:
  - Split `frontend/src/utils/focusManager.ts`, now the next shared
    infrastructure hotspot, into tab-scope registration, keyboard navigation,
    section focus helpers, and canvas-specific pane movement modules.

## 2026-03-14 18:54:53 PDT

- Slice completed: split focus management ownership into dedicated registry,
  navigation, section-focus, and focusable-element helper modules
- Key files touched:
  - `frontend/src/utils/focusManager.ts`
  - `frontend/src/utils/focusManagerRegistry.ts`
  - `frontend/src/utils/focusManagerElements.ts`
  - `frontend/src/utils/focusManagerNavigation.ts`
  - `frontend/src/utils/focusManagerSections.ts`
  - `frontend/src/utils/focusManagerNavigation.test.tsx`
  - `frontend/src/utils/focusManagerSections.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/utils/focusManagerNavigation.test.tsx src/utils/focusManagerSections.test.ts src/state/actions/keyActivations.test.ts src/state/actions/keyActivationHandlers.test.ts`
  - `pnpm -C frontend exec prettier --check src/utils/focusManager.ts src/utils/focusManagerRegistry.ts src/utils/focusManagerElements.ts src/utils/focusManagerNavigation.ts src/utils/focusManagerSections.ts src/utils/focusManagerNavigation.test.tsx src/utils/focusManagerSections.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual shared-infrastructure ownership
    split and did not change frontend rendering behavior.
- Commit hash:
  - `57d14815b`
- Next highest-value unblocked slice:
  - Split `frontend/src/components/Utils/Resizable/CustomResizable.tsx`, now
    the largest remaining shared frontend hotspot, into low-level resize math,
    DOM event wiring, and window/pane-specific resize ownership.

## 2026-03-14 19:12:51 PDT

- Slice completed: split `CustomResizable` ownership into composition,
  lifecycle, sizing, and handle-chrome modules
- Key files touched:
  - `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
  - `frontend/src/components/Utils/Resizable/useCustomResizableBehavior.ts`
  - `frontend/src/components/Utils/Resizable/customResizableSizing.ts`
  - `frontend/src/components/Utils/Resizable/customResizableChrome.ts`
  - `frontend/src/components/Utils/Resizable/CustomResizable.test.ts`
  - `frontend/src/components/Utils/Resizable/customResizableChrome.test.ts`
  - `frontend/src/components/AppHeader/EditMenu.tsx`
  - `frontend/src/components/Modals/SaveLoadModal/SaveLoadModal.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Utils/Resizable/CustomResizable.test.ts src/components/Utils/Resizable/customResizableChrome.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-sizing.spec.ts`
  - `pnpm -C frontend exec prettier --check src/components/Utils/Resizable/CustomResizable.tsx src/components/Utils/Resizable/useCustomResizableBehavior.ts src/components/Utils/Resizable/customResizableSizing.ts src/components/Utils/Resizable/customResizableChrome.ts src/components/Utils/Resizable/CustomResizable.test.ts src/components/Utils/Resizable/customResizableChrome.test.ts src/components/AppHeader/EditMenu.tsx src/components/Modals/SaveLoadModal/SaveLoadModal.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - CDP visual check on `http://127.0.0.1:3000/taking_owl`: captured the live
    section screenshot and verified the rendered `CustomResizable` surface still
    exposes the expected bottom, right, and bottom-right handles with the
    expected hit areas (`500x10`, `10x165`, and `20x20`) after the split.
  - No perf report was added. This slice was an ownership refactor and did not
    materially change render structure or resize algorithms.
- Commit hash:
  - `44fc3d2b2`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/stateMachineEdges.ts`, now the largest
    remaining shared-state hotspot, into graph reads, optimistic project-state
    writes, and view/runtime-specific edge command modules.

## 2026-03-14 19:21:51 PDT

- Slice completed: split workflow edge connection rules from workflow edge
  mutation commands
- Key files touched:
  - `frontend/src/state/actions/stateMachineEdges.ts`
  - `frontend/src/state/actions/stateMachineEdgeConnections.ts`
  - `frontend/src/state/actions/stateMachineEdgeMutations.ts`
  - `frontend/src/state/actions/stateMachineEdges.test.ts`
  - `frontend/src/state/actions/stateMachineEdgeMutations.test.ts`
  - `frontend/src/state/actions/chatSharedEdges.ts`
  - `frontend/src/state/actions/chatSharedEdges.test.ts`
  - `frontend/src/state/actions/agenticEdges.ts`
  - `frontend/src/state/actions/edges.ts`
  - `frontend/src/state/actions/keyActivationHandlers.ts`
  - `frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx`
  - `frontend/src/components/Section/Container/StateMachineEdgeHandles.tsx`
  - `frontend/src/components/Panes/UiEditor/StateMachineEdgeInspector.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/stateMachineEdges.test.ts src/state/actions/stateMachineEdgeMutations.test.ts src/state/actions/chatSharedEdges.test.ts src/state/actions/keyActivationHandlers.test.ts src/forks/xyflow/core/container/StateMachineEdgeRenderer.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/stateMachineEdges.ts src/state/actions/stateMachineEdgeConnections.ts src/state/actions/stateMachineEdgeMutations.ts src/state/actions/stateMachineEdges.test.ts src/state/actions/stateMachineEdgeMutations.test.ts src/state/actions/chatSharedEdges.ts src/state/actions/chatSharedEdges.test.ts src/state/actions/agenticEdges.ts src/state/actions/edges.ts src/state/actions/keyActivationHandlers.ts src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx src/components/Section/Container/StateMachineEdgeHandles.tsx src/components/Panes/UiEditor/StateMachineEdgeInspector.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `8c3729ab4`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/websocketReceive.ts`, now the largest
    remaining shared-state hotspot, into clearer auth or reconnect lifecycle,
    bootstrap hydration, and outbound realtime dependency or upload modules.

## 2026-03-14 19:32:04 PDT

- Slice completed: split websocket lifecycle from outbound realtime send helpers
- Key files touched:
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/state/actions/websocketLifecycle.ts`
  - `frontend/src/state/actions/websocketRealtime.ts`
  - `frontend/src/state/actions/websocketRuntime.ts`
  - `frontend/src/state/actions/websocketReceive.test.ts`
  - `frontend/src/plugins/runtime.ts`
  - `frontend/src/plugins/runtime.test.ts`
  - `frontend/src/components/Pages/Share/ShareWrapper.tsx`
  - `frontend/src/components/Pages/GlobalWrapper.tsx`
  - `frontend/src/components/Pages/App/AppWrapper.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Params/ParamItems/ParamInput.tsx`
  - `frontend/src/components/Section/Layouts/MetaControlArea.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/components/Section/Layouts/DrawArea/useRealtimeDrawEmitter.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/websocketReceive.test.ts src/plugins/runtime.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/websocketRuntime.ts src/state/actions/websocketRealtime.ts src/state/actions/websocketLifecycle.ts src/state/actions/websocketReceive.ts src/state/actions/websocketReceive.test.ts src/plugins/runtime.ts src/plugins/runtime.test.ts src/components/Pages/Share/ShareWrapper.tsx src/components/Pages/GlobalWrapper.tsx src/components/Pages/App/AppWrapper.tsx src/components/App/appRegistry.tsx src/components/Params/ParamItems/ParamInput.tsx src/components/Section/Layouts/MetaControlArea.tsx src/components/Section/Layouts/ChatArea.tsx src/components/Section/Layouts/DrawArea/useRealtimeDrawEmitter.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `8ce441f30`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/keyActivations.ts`, now the largest
    remaining shared-state hotspot, into more explicit shortcut command groups
    or listener wiring helpers.

## 2026-03-14 19:42:23 PDT

- Slice completed: split key shortcut registrations from key listener wiring
- Key files touched:
  - `frontend/src/state/actions/keyActivations.ts`
  - `frontend/src/state/actions/keyShortcutRegistrations.ts`
  - `frontend/src/state/actions/keyShortcutRegistrations.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/keyShortcutRegistrations.test.ts src/state/actions/keyActivations.test.ts src/state/actions/keyActivationHandlers.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/keyActivations.ts src/state/actions/keyShortcutRegistrations.ts src/state/actions/keyShortcutRegistrations.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `8b728bfc1`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowing.ts`, now the
    largest remaining authored state hotspot, continuing from
    `projectChatWindowingAuthoritative.ts` and
    `projectChatWindowingEphemeral.ts`.

## 2026-03-14 19:53:58 PDT

- Slice completed: extracted project chat windowing write coordination
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/projectChatWindowingWrites.ts`
  - `frontend/src/state/actions/projectChatWindowing.test.ts`
  - `frontend/src/state/actions/projectChatWindowing.permissions.test.ts`
  - `frontend/src/state/actions/windowSpacePersistence.ts`
  - `frontend/src/state/actions/windowSpaces.ts`
  - `frontend/src/state/actions/windowSpaces.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/windowSpaces.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowing.ts src/state/actions/projectChatWindowingWrites.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/windowSpacePersistence.ts src/state/actions/windowSpaces.ts src/state/actions/windowSpaces.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `3dca7f8df`
- Next highest-value unblocked slice:
  - Continue splitting `frontend/src/state/actions/projectChatWindowing.ts` by
    extracting the remaining pure in-state reducers and selectors into a
    dedicated state module, leaving `projectChatWindowing.ts` focused on
    public commands and canvas boot flow.

## 2026-03-14 20:12:06 PDT

- Slice completed: extracted pure project chat windowing state ownership
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/projectChatWindowingState.ts`
  - `frontend/src/state/actions/projectChatWindowing.test.ts`
  - `frontend/src/state/actions/windowSpaces.ts`
  - `frontend/src/state/actions/windowSpaceSnapshots.ts`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - `frontend/src/components/Section/Header/SectionWindowToggleButton.tsx`
  - `frontend/src/components/Section/Header/SectionWindowToggleButton.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/windowSpaces.test.ts src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.remount.test.tsx src/components/Section/Header/SectionWindowToggleButton.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx`
  - `pnpm -C frontend exec vitest run src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/state/actions/git.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowing.ts src/state/actions/projectChatWindowingState.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/windowSpaces.ts src/state/actions/windowSpaceSnapshots.ts src/components/ChatWindowing/UnifiedChatSurface.tsx src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/Section/Header/SectionWindowToggleButton.tsx src/components/Section/Header/SectionWindowToggleButton.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `1d9d20281`
- Next highest-value unblocked slice:
  - Continue splitting `frontend/src/state/actions/projectChatWindowingState.ts`
    by separating pure section-binding selectors and normalization helpers from
    the remaining in-state mutation reducers.

## 2026-03-14 20:21:13 PDT

- Slice completed: extracted pure project chat windowing selectors and normalization
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/projectChatWindowingState.ts`
  - `frontend/src/state/actions/projectChatWindowingSelectors.ts`
  - `frontend/src/state/actions/projectChatWindowing.test.ts`
  - `frontend/src/state/actions/windowSpaces.ts`
  - `frontend/src/state/actions/windowSpaceSnapshots.ts`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - `frontend/src/components/Section/Header/SectionWindowToggleButton.tsx`
  - `frontend/src/components/Section/Header/SectionWindowToggleButton.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/windowSpaces.test.ts src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.remount.test.tsx src/components/Section/Header/SectionWindowToggleButton.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/state/actions/git.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowing.ts src/state/actions/projectChatWindowingState.ts src/state/actions/projectChatWindowingSelectors.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/windowSpaces.ts src/state/actions/windowSpaceSnapshots.ts src/components/ChatWindowing/UnifiedChatSurface.tsx src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/Section/Header/SectionWindowToggleButton.tsx src/components/Section/Header/SectionWindowToggleButton.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `75b6f81a7`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatStreaming.ts`, now the largest
    authored state hotspot, into clearer streaming reducers, tool-preview
    reconciliation, and app-spec patch handling modules.

## 2026-03-14 20:33:55 PDT

- Slice completed: extracted AI chat streaming tool-preview and app-spec handling
- Key files touched:
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/aiChatStreamingTools.ts`
  - `frontend/src/state/actions/aiChatStreamingTools.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiChatStreamingTools.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts src/state/actions/aiAppSpecApply.test.ts src/state/actions/aiStreamingPersistence.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiChatPromotion.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatStreaming.ts src/state/actions/aiChatStreamingTools.ts src/state/actions/aiChatStreamingTools.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `77b36ea9e`
- Next highest-value unblocked slice:
  - Continue splitting `frontend/src/state/actions/aiChatStreaming.ts` by
    extracting chat-section stream reconciliation and finalized-assistant merge
    helpers, leaving `receiveLLMResponseChunk` as a thinner orchestration layer.

## 2026-03-14 20:46:26 PDT

- Slice completed: extracted AI chat streaming message reducers and section-state reconciliation
- Key files touched:
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/aiChatStreamingTools.ts`
  - `frontend/src/state/actions/aiChatStreamingMessages.ts`
  - `frontend/src/state/actions/aiChatStreamingMessages.test.ts`
  - `frontend/src/state/actions/aiChatStreamingSectionState.ts`
  - `frontend/src/state/actions/aiChatStreamingSectionState.test.ts`
  - `frontend/src/state/actions/aiSectionStreaming.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiChatStreamingMessages.test.ts src/state/actions/aiChatStreamingSectionState.test.ts src/state/actions/aiChatStreamingTools.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/aiStreamingPersistence.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts src/state/actions/aiAppSpecApply.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiChatPromotion.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatStreaming.ts src/state/actions/aiChatStreamingMessages.ts src/state/actions/aiChatStreamingMessages.test.ts src/state/actions/aiChatStreamingSectionState.ts src/state/actions/aiChatStreamingSectionState.test.ts src/state/actions/aiChatStreamingTools.ts src/state/actions/aiSectionStreaming.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `92a558283`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatThreads.ts`, now the largest
    authored state hotspot, into clearer normalization/undo helpers plus
    thread/group mutation modules.

## 2026-03-14 20:54:56 PDT

- Slice completed: split project chat thread storage mutations by ownership
- Key files touched:
  - `frontend/src/state/actions/projectChatThreads.ts`
  - `frontend/src/state/actions/projectChatThreadGroupMutations.ts`
  - `frontend/src/state/actions/projectChatThreadMutations.ts`
  - `frontend/src/state/actions/projectChatThreadStorageShared.ts`
  - `frontend/src/state/actions/projectChatThreadStorageUndo.ts`
  - `frontend/src/state/actions/projectChatThreads.test.ts`
  - `frontend/src/state/actions/undo.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatThreads.test.ts src/state/actions/undo.test.ts`
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatThreads.ts src/state/actions/projectChatThreadGroupMutations.ts src/state/actions/projectChatThreadMutations.ts src/state/actions/projectChatThreadStorageUndo.ts src/state/actions/projectChatThreadStorageShared.ts src/state/actions/projectChatThreads.test.ts src/state/actions/undo.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `ef98057d9`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/git.ts`, now the largest authored state
    hotspot, into clearer repo-read helpers, branch/worktree mutations, and
    checkout/switch command modules.

## 2026-03-14 21:04:48 PDT

- Slice completed: split git graph and diff/status actions by ownership
- Key files touched:
  - `frontend/src/state/actions/git.ts`
  - `frontend/src/state/actions/gitGraph.ts`
  - `frontend/src/state/actions/gitStatusAndDiff.ts`
  - `frontend/src/state/actions/git.test.ts`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/components/Git/GitDiffOverlay.tsx`
  - `frontend/src/components/Git/GitOverlayLayer.tsx`
  - `frontend/src/components/Git/GitGraphWindowContent.tsx`
  - `frontend/src/components/Git/GitGraphWindowContent.test.tsx`
  - `frontend/src/components/Panes/Overview/Git/GitPane.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/git.test.ts src/components/Panes/Overview/Git/GitPane.test.tsx src/components/Git/GitGraphWindowContent.test.tsx src/components/Git/GitOverlayLayer.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/git.ts src/state/actions/gitGraph.ts src/state/actions/gitStatusAndDiff.ts src/state/actions/git.test.ts src/components/Git/GitGraphOverlay.tsx src/components/Git/GitDiffOverlay.tsx src/components/Git/GitOverlayLayer.tsx src/components/Git/GitGraphWindowContent.tsx src/components/Git/GitGraphWindowContent.test.tsx src/components/Panes/Overview/Git/GitPane.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `73617b893`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowingState.ts`, now the
    largest authored state hotspot, into narrower reducer groups so placement,
    focus, and bounds reducers stop living beside chat-id/title and
    section-transition reducers.

## 2026-03-14 21:15:21 PDT

- Slice completed: split project chat windowing layout reducers by ownership
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowingLayoutState.ts`
  - `frontend/src/state/actions/projectChatWindowingState.ts`
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/projectChatWindowing.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/windowSpaces.test.ts src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.remount.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/components/Section/Header/SectionWindowToggleButton.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx src/state/actions/git.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowingLayoutState.ts src/state/actions/projectChatWindowingState.ts src/state/actions/projectChatWindowing.ts src/state/actions/projectChatWindowing.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `7c0265af5`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiConfiguration.ts`, now the largest
    authored state hotspot, into narrower config/API-key mutation versus AI
    settings catalog load/mutation modules.

## 2026-03-14 21:22:42 PDT

- Slice completed: split AI configuration and settings catalog actions by ownership
- Key files touched:
  - `frontend/src/state/actions/aiLLMConfiguration.ts`
  - `frontend/src/state/actions/aiConfigurationCatalogs.ts`
  - `frontend/src/state/actions/aiConfiguration.ts`
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/state/actions/aiConfigurationCatalogs.test.ts`
  - `frontend/src/state/actions/aiSaveLLMConfig.test.ts`
  - `frontend/src/state/actions/aiSaveLLMApiKeys.test.ts`
  - `frontend/src/state/actions/aiResourceLoadGuards.test.ts`
  - `frontend/src/state/actions/aiUpdateEngineConfig.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateLLMState.ts`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiSaveLLMConfig.test.ts src/state/actions/aiSaveLLMApiKeys.test.ts src/state/actions/aiResourceLoadGuards.test.ts src/state/actions/aiUpdateEngineConfig.test.ts src/state/actions/aiConfigurationCatalogs.test.ts src/state/actions/websocketReceive.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.test.ts src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiConfiguration.ts src/state/actions/aiLLMConfiguration.ts src/state/actions/aiConfigurationCatalogs.ts src/state/actions/websocketIncomingMessages.ts src/state/actions/aiConfigurationCatalogs.test.ts src/state/actions/aiSaveLLMConfig.test.ts src/state/actions/aiSaveLLMApiKeys.test.ts src/state/actions/aiResourceLoadGuards.test.ts src/state/actions/aiUpdateEngineConfig.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts src/components/Panes/Overview/ProjectLevelAI/useHydrateLLMState.ts src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `48d60585b`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/windowSpaces.ts`, now tied for the
    largest authored/shared state hotspot, into clearer restore orchestration,
    restored-instance remapping, and saved chat-thread rebound modules.

## 2026-03-14 21:31:55 PDT

- Slice completed: split window-space restore planning and project-chat thread rebound by ownership
- Key files touched:
  - `frontend/src/state/actions/windowSpaces.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestorePlan.ts`
  - `frontend/src/state/actions/windowSpaceProjectChatThreadRestore.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts`
  - `frontend/src/state/actions/windowSpaceProjectChatThreadRestore.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/windowSpaces.test.ts src/state/actions/windowSpaceProjectChatThreadRestore.test.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/projectChatWindowing.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/windowSpaces.ts src/state/actions/windowSpaceWorkspaceRestorePlan.ts src/state/actions/windowSpaceProjectChatThreadRestore.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/windowSpaceProjectChatThreadRestore.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `78fa34ea2`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowing.ts`, now the
    largest authored/shared state hotspot, by separating the remaining public
    window command orchestration from canvas boot and tracked-surface restore
    coordination.

## 2026-03-14 21:43:24 PDT

- Slice completed: split project-chat window canvas boot and tracked git-pane
  ownership out of `frontend/src/state/actions/projectChatWindowing.ts`
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/projectChatWindowingCanvasBoot.ts`
  - `frontend/src/state/actions/projectChatWindowingTrackedGitPane.ts`
  - `frontend/src/state/actions/projectChatWindowing.test.ts`
  - `frontend/src/state/actions/gitGraph.ts`
  - `frontend/src/state/actions/git.test.ts`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx`
  - `frontend/src/components/Section/Header/SectionWindowToggleButton.tsx`
  - `frontend/src/components/Section/Header/SectionWindowToggleButton.test.tsx`
  - `frontend/src/components/Section/Container/SectionWindowPlaceholder.tsx`
  - `frontend/src/components/Section/Container/SectionWindowPlaceholder.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/git.test.ts src/components/Section/Header/SectionWindowToggleButton.test.tsx src/components/Section/Container/SectionWindowPlaceholder.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.remount.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowing.ts src/state/actions/projectChatWindowingCanvasBoot.ts src/state/actions/projectChatWindowingTrackedGitPane.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/gitGraph.ts src/state/actions/git.test.ts src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx src/components/Section/Header/SectionWindowToggleButton.tsx src/components/Section/Header/SectionWindowToggleButton.test.tsx src/components/Section/Container/SectionWindowPlaceholder.tsx src/components/Section/Container/SectionWindowPlaceholder.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `1e7a2339f`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionInfos.ts`, now the largest
    authored/shared state hotspot, by separating displayed-child tree
    derivation and section metadata/layout query ownership into narrower read
    modules.

## 2026-03-14 21:57:00 PDT

- Slice completed: split section display queries out of
  `frontend/src/state/actions/sectionInfos.ts`
- Key files touched:
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/sectionDisplayQueries.ts`
  - `frontend/src/state/actions/sectionInfos.test.ts`
  - `frontend/src/state/actions/sectionProjectStateSync.ts`
  - `frontend/src/state/actions/project/loadProject.ts`
  - `frontend/src/state/actions/activeSections.ts`
  - `frontend/src/state/subscriptions.ts`
  - `frontend/src/state/hooks/search.ts`
  - `frontend/src/utils/focusManagerElements.ts`
  - `frontend/src/forks/dnd-kit/useDropType.ts`
  - `frontend/src/forks/dnd-kit/useMoveSection.ts`
  - `frontend/src/forks/dnd-kit/dndState.ts`
  - `frontend/src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
  - `frontend/src/components/Section/Container/SectionContainer.tsx`
  - `frontend/src/components/Section/Container/ContainerWrappers.tsx`
  - `frontend/src/components/Section/Header/DeleteOrHideButton.tsx`
  - `frontend/src/components/Section/Layouts/TerminalArea.tsx`
  - `frontend/src/components/Section/Layouts/TerminalArea.test.tsx`
  - `frontend/src/components/Utils/ContextMenus/SelectionContextMenu.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.test.ts src/state/actions/project/loadProject.test.ts src/state/actions/activeSections.test.ts src/components/Section/Layouts/TerminalArea.test.tsx src/forks/dnd-kit/dndState.test.ts src/forks/dnd-kit/useDropType.test.ts`
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectOverview/projectOverviewPolling.test.ts src/components/Section/Header/SectionHeader.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/sectionInfos.ts src/state/actions/sectionDisplayQueries.ts src/state/actions/sectionInfos.test.ts src/state/actions/project/loadProject.ts src/state/actions/activeSections.ts src/state/actions/sectionProjectStateSync.ts src/state/hooks/search.ts src/state/subscriptions.ts src/utils/focusManagerElements.ts src/forks/dnd-kit/useDropType.ts src/forks/dnd-kit/useMoveSection.ts src/forks/dnd-kit/dndState.ts src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx src/components/Panes/Overview/ProjectOverview/projectOverviewPolling.test.ts src/components/Panes/Overview/RunInstructions.tsx src/components/Section/Header/DeleteOrHideButton.tsx src/components/Section/Header/SectionHeader.test.tsx src/components/Section/Layouts/TerminalArea.tsx src/components/Section/Layouts/TerminalArea.test.tsx src/components/Utils/ContextMenus/SelectionContextMenu.tsx src/components/Section/Container/SectionContainer.tsx src/components/Section/Container/ContainerWrappers.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `66abaecf9`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionEffectiveImpls.ts`, now the
    largest authored/shared state hotspot, into narrower effective-impl read
    selectors versus local impl mutation helpers.

## 2026-03-14 22:10:47 PDT

- Slice completed: split effective-impl mutation helpers out of
  `frontend/src/state/actions/sectionEffectiveImpls.ts`
- Key files touched:
  - `frontend/src/state/actions/sectionEffectiveImpls.ts`
  - `frontend/src/state/actions/sectionEffectiveImplMutations.ts`
  - `frontend/src/state/actions/sectionEffectiveImpls.test.ts`
  - `frontend/src/state/actions/sectionEffectiveImplMutations.test.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/projectStateCommands.ts`
  - `frontend/src/state/actions/aiHydration.ts`
  - `frontend/src/state/actions/aiChatSubmission.ts`
  - `frontend/src/state/actions/aiChatSectionState.ts`
  - `frontend/src/state/actions/aiChatStreamingSectionState.ts`
  - `frontend/src/state/actions/stateMachineEdgeConnections.ts`
  - `frontend/src/state/actions/sections/sectionSizes.ts`
  - `frontend/src/state/actions/sections/moveSections.ts`
  - `frontend/src/state/actions/params/moveParams.ts`
  - `frontend/src/state/hooks/useParamColumnWidth.ts`
  - `frontend/src/state/hooks/useBrowserColumnWidth.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionEffectiveImpls.test.ts src/state/actions/sectionEffectiveImplMutations.test.ts src/state/actions/projectStateCommands.test.ts src/state/actions/sections/sectionSizes.test.tsx src/state/hooks/sectionSizes.test.tsx src/state/actions/sections/moveSections.test.ts src/state/actions/aiSectionStateSync.test.ts src/state/actions/aiSectionResizePersistence.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiWebsocketAffinitySubmit.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiStopProjectChat.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sectionEffectiveImpls.ts src/state/actions/sectionEffectiveImplMutations.ts src/state/actions/sectionInfos.ts src/state/actions/projectStateCommands.ts src/state/actions/aiHydration.ts src/state/actions/aiChatStreamingSectionState.ts src/state/actions/aiChatSectionState.ts src/state/actions/stateMachineEdgeConnections.ts src/state/actions/sections/sectionSizes.ts src/state/actions/codeUpdates.ts src/state/actions/aiChatSubmission.ts src/state/actions/params/moveParams.ts src/state/actions/sections/moveSections.ts src/state/hooks/useParamColumnWidth.ts src/state/hooks/useBrowserColumnWidth.ts src/state/actions/sectionEffectiveImpls.test.ts src/state/actions/sectionEffectiveImplMutations.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `7f54f16c9`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/gitGraph.ts`, now the largest
    authored/shared state hotspot, into clearer repo-read helpers, graph
    filter state, and commit/detail selection modules.

## 2026-03-14 22:19:20 PDT

- Slice completed: split git graph loading and selection owners out of
  `frontend/src/state/actions/gitGraph.ts`
- Key files touched:
  - `frontend/src/state/actions/gitGraph.ts`
  - `frontend/src/state/actions/gitGraphLog.ts`
  - `frontend/src/state/actions/gitGraphSelection.ts`
  - `frontend/src/state/actions/gitGraphState.ts`
  - `frontend/src/state/actions/gitGraphState.test.ts`
  - `frontend/src/state/actions/git.ts`
  - `frontend/src/state/actions/git.test.ts`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/components/Git/GitGraphWindowContent.tsx`
  - `frontend/src/components/Git/GitGraphWindowContent.test.tsx`
  - `frontend/src/components/Panes/Overview/Git/GitPane.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/git.test.ts src/state/actions/gitGraphState.test.ts src/components/Git/GitGraphWindowContent.test.tsx src/components/Panes/Overview/Git/GitPane.test.tsx src/components/Git/GitGraphOverlay.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/gitGraph.ts src/state/actions/gitGraphLog.ts src/state/actions/gitGraphSelection.ts src/state/actions/gitGraphState.ts src/state/actions/git.ts src/state/actions/git.test.ts src/state/actions/gitGraphState.test.ts src/components/Git/GitGraphOverlay.tsx src/components/Git/GitGraphWindowContent.tsx src/components/Git/GitGraphWindowContent.test.tsx src/components/Panes/Overview/Git/GitPane.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `0dc87705f`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionEffectiveImpls.ts`, now the
    largest authored/shared state hotspot, by separating core effective-impl
    selectors from terminal attachment and orientation helpers.

## 2026-03-14 22:28:59 PDT

- Slice completed: split section layout and terminal attachment queries out of
  `frontend/src/state/actions/sectionEffectiveImpls.ts`
- Key files touched:
  - `frontend/src/state/actions/sectionEffectiveImpls.ts`
  - `frontend/src/state/actions/sectionLayoutQueries.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/sectionEffectiveImpls.test.ts`
  - `frontend/src/state/actions/sectionLayoutQueries.test.ts`
  - `frontend/src/state/actions/sections/sectionSizes.ts`
  - `frontend/src/state/hooks/sectionSizes.ts`
  - `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionLayoutQueries.test.ts src/state/actions/sectionEffectiveImpls.test.ts src/state/actions/sectionInfos.listRootViewMode.perf.test.ts src/state/actions/sections/sectionSizes.test.tsx src/state/hooks/sectionSizes.test.tsx src/components/Section/Layouts/TerminalArea.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/sectionEffectiveImpls.ts src/state/actions/sectionEffectiveImpls.test.ts src/state/actions/sectionInfos.ts src/state/actions/sectionLayoutQueries.ts src/state/actions/sectionLayoutQueries.test.ts src/state/actions/sections/sectionSizes.ts src/state/hooks/sectionSizes.ts src/components/Utils/Resizable/CustomResizable.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `c65b27232`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/hooks/sectionSizes.ts`, now the largest
    authored/shared state hotspot, by separating DOM measurement/resize
    observers from size derivation and state-bridge helpers.

## 2026-03-14 22:40:49 PDT

- Slice completed: split section sizing hook ownership into dedicated
  min/max-derivation, scrollability-observer, and aspect-ratio sizing modules
- Key files touched:
  - `frontend/src/state/hooks/sectionMinMaxDims.ts`
  - `frontend/src/state/hooks/sectionScrollability.ts`
  - `frontend/src/state/hooks/sectionAspectRatioSizing.ts`
  - `frontend/src/state/hooks/sectionScrollability.test.tsx`
  - `frontend/src/state/hooks/sectionAspectRatioSizing.test.ts`
  - `frontend/src/state/hooks/sectionSizes.ts`
  - `frontend/src/state/hooks/sectionSizes.test.tsx`
  - `frontend/src/state/hooks/sectionSizes.integration.test.tsx`
  - `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
  - `frontend/src/components/Section/Layouts/CodeArea.tsx`
  - `frontend/src/components/Section/Layouts/CodeArea.test.tsx`
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/components/Section/Layouts/TextBlock.tsx`
  - `frontend/src/components/Section/Layouts/SocialArea.tsx`
  - `frontend/src/components/Section/Layouts/DrawArea/canvasUtils.ts`
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Section/Container/ContainerCore.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/hooks/sectionSizes.test.tsx src/state/hooks/sectionSizes.integration.test.tsx src/state/hooks/sectionScrollability.test.tsx src/state/hooks/sectionAspectRatioSizing.test.ts src/components/Section/Layouts/CodeArea.test.tsx src/components/Section/Layouts/BrowserArea.test.tsx src/components/Section/Layouts/ChatArea.test.tsx src/components/Section/Layouts/TextBlock.test.tsx src/components/Params/GroupContainer.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/hooks/sectionMinMaxDims.ts src/state/hooks/sectionScrollability.ts src/state/hooks/sectionScrollability.test.tsx src/state/hooks/sectionAspectRatioSizing.ts src/state/hooks/sectionAspectRatioSizing.test.ts src/state/hooks/sectionSizes.ts src/state/hooks/sectionSizes.test.tsx src/state/hooks/sectionSizes.integration.test.tsx src/components/Utils/Resizable/CustomResizable.tsx src/components/Section/Layouts/CodeArea.tsx src/components/Section/Layouts/CodeArea.test.tsx src/components/Section/Layouts/BrowserArea.tsx src/components/Section/Layouts/ChatArea.tsx src/components/Section/Layouts/TextBlock.tsx src/components/Section/Layouts/SocialArea.tsx src/components/Section/Layouts/DrawArea/canvasUtils.ts src/components/Params/GroupContainer.tsx src/components/Section/Container/ContainerCore.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/hook ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `0029cc117`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/params/moveParams.ts`, now the largest
    authored/shared state hotspot, by separating param reparenting and reorder
    queries from optimistic mutation dispatch and selection synchronization.

## 2026-03-14 23:01:08 PDT

- Slice completed: split param move selection/query helpers and optimistic
  mutation helpers away from the public command facade
- Key files touched:
  - `frontend/src/state/actions/params/paramMoveQueries.ts`
  - `frontend/src/state/actions/params/paramMoveMutations.ts`
  - `frontend/src/state/actions/params/moveParams.ts`
  - `frontend/src/state/actions/params/moveParams.test.ts`
  - `frontend/src/components/Params/ParamDndMonitor.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/params/moveParams.test.ts src/state/actions/keyActivationHandlers.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/params/moveParams.ts src/state/actions/params/paramMoveQueries.ts src/state/actions/params/paramMoveMutations.ts src/state/actions/params/moveParams.test.ts src/components/Params/ParamDndMonitor.tsx src/state/actions/keyActivationHandlers.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `c05b1fd5d`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiTranscription.ts`, now the largest
    authored/shared state hotspot, by separating provider session transport and
    transcription profile/catalog mutations from audio upload orchestration.

## 2026-03-14 23:11:38 PDT

- Slice completed: split AI transcription transport and transcription-profile
  catalog ownership away from the dictation orchestration surface
- Key files touched:
  - `frontend/src/state/actions/aiTranscription.ts`
  - `frontend/src/state/actions/aiTranscriptionSessions.ts`
  - `frontend/src/state/actions/aiTranscriptionProfiles.ts`
  - `frontend/src/state/actions/aiTranscribeChatAudio.test.ts`
  - `frontend/src/state/actions/aiTranscriptionSessions.test.ts`
  - `frontend/src/state/actions/aiTranscriptionProfiles.test.ts`
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiTranscriptionSessions.test.ts src/state/actions/aiTranscriptionProfiles.test.ts src/state/actions/aiTranscribeChatAudio.test.ts src/state/actions/websocketReceive.test.ts src/components/Panes/Overview/ProjectLevelAI/projectAISettingsTranscriptionProfileValidation.test.ts src/components/Section/Layouts/ChatArea.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiTranscription.ts src/state/actions/aiTranscriptionSessions.ts src/state/actions/aiTranscriptionProfiles.ts src/state/actions/aiTranscribeChatAudio.test.ts src/state/actions/aiTranscriptionSessions.test.ts src/state/actions/aiTranscriptionProfiles.test.ts src/state/actions/websocketIncomingMessages.ts src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `0a384bd45`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowingWrites.ts`, now the
    largest authored/shared state hotspot, by separating write coordination and
    authoritative publish flow from the remaining sync helpers.

## 2026-03-14 23:22:05 PDT

- Slice completed: split project chat windowing write-state reads and optimistic
  apply helpers from serialized write coordination and authoritative
  publish/replay flow
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowingWrites.ts`
  - `frontend/src/state/actions/projectChatWindowingWriteState.ts`
  - `frontend/src/state/actions/projectChatWindowingWritePipeline.ts`
  - `frontend/src/state/actions/projectChatWindowingWriteState.test.ts`
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/projectChatWindowingCanvasBoot.ts`
  - `frontend/src/state/actions/projectChatWindowingTrackedGitPane.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowingWriteState.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/windowSpaces.test.ts`
  - `pnpm -C frontend exec vitest run src/state/actions/git.test.ts src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/components/Section/Header/SectionWindowToggleButton.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowing.ts src/state/actions/projectChatWindowingCanvasBoot.ts src/state/actions/projectChatWindowingTrackedGitPane.ts src/state/actions/projectChatWindowingWrites.ts src/state/actions/projectChatWindowingWritePipeline.ts src/state/actions/projectChatWindowingWriteState.ts src/state/actions/projectChatWindowingWriteState.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `9d3120dc2`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sections/createSections.ts`, now the
    largest authored/shared state hotspot, by separating section creation
    orchestration from per-impl defaults and placement helpers.

## 2026-03-14 23:32:47 PDT

- Slice completed: split section creation placement/default helpers and
  file-open/drop flows away from the top-level section creation command surface
- Key files touched:
  - `frontend/src/state/actions/sections/createSections.ts`
  - `frontend/src/state/actions/sections/createSectionPlacement.ts`
  - `frontend/src/state/actions/sections/createSectionFileOpeners.ts`
  - `frontend/src/state/actions/sections/createSectionImplDefaults.ts`
  - `frontend/src/state/actions/sections/createSectionPlacement.test.ts`
  - `frontend/src/state/actions/sections/createSectionFileOpeners.test.ts`
  - `frontend/src/state/actions/sections/createSectionImplDefaults.test.ts`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Utils/FloatingBox.tsx`
  - `frontend/src/forks/xyflow/core/container/Pane.tsx`
  - `frontend/src/utils/settaApiPresets.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-sections-and-params-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sections/createSectionFileOpeners.test.ts src/state/actions/sections/createSectionImplDefaults.test.ts src/state/actions/sections/createSectionPlacement.test.ts src/state/actions/sections/createSectionsHelper.test.ts src/state/actions/sections/createSectionsHelper.test.tsx src/components/Panes/Overview/FileBrowser/FileBrowserPane.test.ts src/components/Section/Layouts/BrowserArea.test.tsx src/forks/xyflow/core/container/Pane.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/sections/createSections.ts src/state/actions/sections/createSectionPlacement.ts src/state/actions/sections/createSectionPlacement.test.ts src/state/actions/sections/createSectionFileOpeners.ts src/state/actions/sections/createSectionFileOpeners.test.ts src/state/actions/sections/createSectionImplDefaults.ts src/state/actions/sections/createSectionImplDefaults.test.ts src/state/actions/sections/createSectionsHelper.test.ts src/state/actions/sections/createSectionsHelper.test.tsx src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx src/components/Section/Layouts/BrowserArea.tsx src/components/Utils/FloatingBox.tsx src/forks/xyflow/core/container/Pane.tsx src/utils/settaApiPresets.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-sections-and-params-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `89d04ef67`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/stateMachineEdgeConnections.ts`, now the
    largest authored/shared state hotspot, by separating workflow graph reads
    and canonicalization from the remaining edge-construction helpers.

## 2026-03-14 23:46:08 PDT

- Slice completed: split workflow-edge handle normalization and workflow graph
  reads or merge helpers away from workflow connection validation and edge
  construction
- Key files touched:
  - `frontend/src/state/actions/stateMachineEdgeCanonicalization.ts`
  - `frontend/src/state/actions/stateMachineEdgeGraph.ts`
  - `frontend/src/state/actions/stateMachineEdgeConnections.ts`
  - `frontend/src/state/actions/stateMachineEdgeCanonicalization.test.ts`
  - `frontend/src/state/actions/stateMachineEdgeGraph.test.ts`
  - `frontend/src/state/actions/stateMachineEdgeMutations.ts`
  - `frontend/src/state/actions/stateMachineEdgeMutations.test.ts`
  - `frontend/src/state/actions/stateMachineEdges.ts`
  - `frontend/src/state/actions/stateMachineEdges.test.ts`
  - `frontend/src/state/actions/chatSharedEdges.ts`
  - `frontend/src/state/actions/chatSharedEdges.test.ts`
  - `frontend/src/state/actions/agenticEdges.ts`
  - `frontend/src/state/actions/edges.ts`
  - `frontend/src/components/Section/Container/StateMachineEdgeHandles.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/stateMachineEdgeCanonicalization.test.ts src/state/actions/stateMachineEdgeGraph.test.ts src/state/actions/stateMachineEdges.test.ts src/state/actions/stateMachineEdgeMutations.test.ts src/state/actions/chatSharedEdges.test.ts src/forks/xyflow/core/container/StateMachineEdgeRenderer.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/stateMachineEdgeCanonicalization.ts src/state/actions/stateMachineEdgeCanonicalization.test.ts src/state/actions/stateMachineEdgeGraph.ts src/state/actions/stateMachineEdgeGraph.test.ts src/state/actions/stateMachineEdgeConnections.ts src/state/actions/stateMachineEdgeMutations.ts src/state/actions/stateMachineEdgeMutations.test.ts src/state/actions/stateMachineEdges.ts src/state/actions/stateMachineEdges.test.ts src/state/actions/chatSharedEdges.ts src/state/actions/chatSharedEdges.test.ts src/state/actions/agenticEdges.ts src/state/actions/edges.ts src/components/Section/Container/StateMachineEdgeHandles.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `4bd92e69e`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatControls.ts`, now the largest
    authored/shared state hotspot, by separating stop/resume orchestration from
    approval/question response flows and chat-surface sync helpers.

## 2026-03-14 23:52:09 PDT

- Slice completed: split AI chat stop-state snapshots or reconciliation and
  external approval/question response transport away from stop orchestration
- Key files touched:
  - `frontend/src/state/actions/aiChatControls.ts`
  - `frontend/src/state/actions/aiChatStopState.ts`
  - `frontend/src/state/actions/aiChatStopState.test.ts`
  - `frontend/src/state/actions/aiExternalAgentResponses.ts`
  - `frontend/src/state/actions/aiExternalAgentResponses.test.ts`
  - `frontend/src/components/Chat/ApprovalCard.tsx`
  - `frontend/src/components/Chat/QuestionCard.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiChatStopState.test.ts src/state/actions/aiExternalAgentResponses.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiWaitingForResponse.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Section/Layouts/ChatArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatControls.ts src/state/actions/aiChatStopState.ts src/state/actions/aiChatStopState.test.ts src/state/actions/aiExternalAgentResponses.ts src/state/actions/aiExternalAgentResponses.test.ts src/components/Chat/ApprovalCard.tsx src/components/Chat/QuestionCard.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `73b8f88d4`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/websocketLifecycle.ts`, now the largest
    authored/shared state hotspot, by separating reconnect/auth recovery from
    socket-open bootstrap and share-session restoration.

## 2026-03-15 00:02:32 PDT

- Slice completed: split websocket socket-open bootstrap and auth/share-session
  recovery away from websocket transport lifecycle wiring
- Key files touched:
  - `frontend/src/state/actions/websocketLifecycle.ts`
  - `frontend/src/state/actions/websocketBootstrap.ts`
  - `frontend/src/state/actions/websocketBootstrap.test.ts`
  - `frontend/src/state/actions/websocketAuthRecovery.ts`
  - `frontend/src/state/actions/websocketShareSessionRecovery.ts`
  - `frontend/src/state/actions/websocketShareSessionRecovery.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/websocketBootstrap.test.ts src/state/actions/websocketShareSessionRecovery.test.ts src/state/actions/websocketReceive.test.ts src/plugins/runtime.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/websocketLifecycle.ts src/state/actions/websocketBootstrap.ts src/state/actions/websocketBootstrap.test.ts src/state/actions/websocketAuthRecovery.ts src/state/actions/websocketShareSessionRecovery.ts src/state/actions/websocketShareSessionRecovery.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `452bb3823`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowingLayoutState.ts`, now
    the largest authored/shared state hotspot, into narrower layout-instance,
    placement/focus, and bounds reducer modules.

## 2026-03-15 00:10:36 PDT

- Slice completed: split project-chat windowing layout reducers into dedicated
  instance, placement/focus, and bounds state modules
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/projectChatWindowingLayoutState.ts`
  - `frontend/src/state/actions/projectChatWindowingInstanceState.ts`
  - `frontend/src/state/actions/projectChatWindowingInstanceState.test.ts`
  - `frontend/src/state/actions/projectChatWindowingPlacementState.ts`
  - `frontend/src/state/actions/projectChatWindowingBoundsState.ts`
  - `frontend/src/state/actions/projectChatWindowingState.ts`
  - `frontend/src/state/actions/projectChatWindowingTrackedGitPane.ts`
  - `frontend/src/state/actions/projectChatWindowing.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowingInstanceState.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/windowSpaces.test.ts src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.remount.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/components/Section/Header/SectionWindowToggleButton.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx src/state/actions/git.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowing.ts src/state/actions/projectChatWindowingLayoutState.ts src/state/actions/projectChatWindowingInstanceState.ts src/state/actions/projectChatWindowingInstanceState.test.ts src/state/actions/projectChatWindowingPlacementState.ts src/state/actions/projectChatWindowingBoundsState.ts src/state/actions/projectChatWindowingState.ts src/state/actions/projectChatWindowingTrackedGitPane.ts src/state/actions/projectChatWindowing.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `f9c95ba7c`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowing.ts`, now the
    largest authored/shared state hotspot, by separating public window
    commands, section/window mode transitions, and chat-id/title mutation
    orchestration.

## 2026-03-15 00:38:17 PDT

- Slice completed: split project-chat window public commands into dedicated
  window, metadata, and section command modules
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/projectChatWindowCommands.ts`
  - `frontend/src/state/actions/projectChatWindowMetadataCommands.ts`
  - `frontend/src/state/actions/projectChatWindowSectionCommands.ts`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - `frontend/src/components/Section/Container/SectionWindowPlaceholder.tsx`
  - `frontend/src/components/Section/Header/SectionWindowToggleButton.tsx`
  - `frontend/src/state/actions/windowSpaceProjectChatThreadRestore.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/windowSpaces.test.ts src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.remount.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/components/Section/Header/SectionWindowToggleButton.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx src/state/actions/git.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowing.ts src/state/actions/projectChatWindowCommands.ts src/state/actions/projectChatWindowMetadataCommands.ts src/state/actions/projectChatWindowSectionCommands.ts src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/ChatWindowing/UnifiedChatSurface.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx src/components/Section/Container/SectionWindowPlaceholder.tsx src/components/Section/Header/SectionWindowToggleButton.tsx src/state/actions/windowSpaceProjectChatThreadRestore.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `934606a12`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/windowSpaceWorkspaceRestorePlan.ts`, now
    the largest authored/shared state hotspot, by separating restore planning
    and instance remapping from saved git-pane visibility merge policy.

## 2026-03-15 00:48:13 PDT

- Slice completed: split saved window-space restore planning into dedicated
  layout and git-pane visibility modules
- Key files touched:
  - `frontend/src/state/actions/windowSpaceWorkspaceRestorePlan.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreLayout.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreVisibility.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreVisibility.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/windowSpaceWorkspaceRestoreVisibility.test.ts src/state/actions/windowSpaces.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/windowSpaceWorkspaceRestorePlan.ts src/state/actions/windowSpaceWorkspaceRestoreLayout.ts src/state/actions/windowSpaceWorkspaceRestoreVisibility.ts src/state/actions/windowSpaceWorkspaceRestoreVisibility.test.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/windowSpaces.ts src/state/actions/windowSpaces.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `a0a48082f`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionInfos.ts`, now the largest
    authored/shared state hotspot, by separating the remaining streaming merge,
    shown-param, ancestry, and tool-preview cleanup helpers into narrower read
    or reconciliation modules.

## 2026-03-15 01:09:50 PDT

- Slice completed: split the remaining `sectionInfos.ts` helper cluster into
  dedicated section ownership modules
- Key files touched:
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/sectionStreamingMerge.ts`
  - `frontend/src/state/actions/sectionShownParams.ts`
  - `frontend/src/state/actions/sectionHierarchy.ts`
  - `frontend/src/state/actions/sectionToolArgumentPreview.ts`
  - `frontend/src/state/actions/sectionStreamingMerge.test.ts`
  - `frontend/src/state/actions/sectionShownParams.test.ts`
  - `frontend/src/state/actions/sectionHierarchy.test.ts`
  - `frontend/src/state/actions/sectionToolArgumentPreview.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionShownParams.test.ts src/state/actions/sectionHierarchy.test.ts src/state/actions/sectionToolArgumentPreview.test.ts src/state/actions/sectionStreamingMerge.test.ts src/state/actions/sectionInfos.test.ts src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/sections/moveSections.test.ts src/state/actions/activeSectionController.test.ts src/state/actions/aiFollow.test.ts src/state/actions/params/moveParams.test.ts src/components/Params/GroupContainer.test.tsx`
  - `pnpm -C frontend exec prettier --check src/README.md src/components/AppHeader/EditMenu.tsx src/components/Panes/UiEditor/SectionConfig/EdgePortsSettings.tsx src/components/Params/GroupContainer.tsx src/components/Params/ParamDndMonitor.tsx src/components/Section/Header/MenuButton/ClearValues.tsx src/components/Section/Header/MenuButton/ResetToDefaultVersion.tsx src/components/Section/SectionParts/KwargsControls.tsx src/forks/dnd-kit/adapter/useSortable.ts src/state/actions/activeSectionController.ts src/state/actions/nodeInternals.ts src/state/actions/params/paramMoveQueries.ts src/state/actions/sectionHierarchy.test.ts src/state/actions/sectionHierarchy.ts src/state/actions/sectionInfos.test.ts src/state/actions/sectionInfos.ts src/state/actions/sectionProjectStateSync.ts src/state/actions/sectionShownParams.test.ts src/state/actions/sectionShownParams.ts src/state/actions/sectionStreamingMerge.test.ts src/state/actions/sectionStreamingMerge.ts src/state/actions/sectionToolArgumentPreview.test.ts src/state/actions/sectionToolArgumentPreview.ts src/state/actions/sections/moveSections.ts src/state/actions/sections/sectionSizes.ts src/state/hooks/aiFollow.ts src/utils/tabbingLogic.ts ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `bd545b9e8`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionEffectiveImpls.ts`, now the
    largest authored/shared state hotspot, by separating core effective-impl
    derivation from the remaining typed selector helpers.

## 2026-03-15 01:20:57 PDT

- Slice completed: split effective-impl ownership into dedicated core and
  selector modules
- Key files touched:
  - `frontend/src/state/actions/sectionEffectiveImpls.ts`
  - `frontend/src/state/actions/sectionEffectiveImplCore.ts`
  - `frontend/src/state/actions/sectionEffectiveImplSelectors.ts`
  - `frontend/src/state/actions/sectionEffectiveImplCore.test.ts`
  - `frontend/src/state/actions/sectionEffectiveImplSelectors.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionEffectiveImplCore.test.ts src/state/actions/sectionEffectiveImplSelectors.test.ts src/state/actions/sectionEffectiveImplMutations.test.ts src/state/actions/sectionLayoutQueries.test.ts src/state/actions/sectionHierarchy.test.ts src/state/actions/sectionStreamingMerge.test.ts src/state/actions/projectStateCommands.test.ts src/state/actions/stateMachineEdgeGraph.test.ts src/state/actions/stateMachineEdgeMutations.test.ts src/state/actions/websocketBootstrap.test.ts src/state/actions/websocketReceive.test.ts src/state/actions/aiChatStreamingTools.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/params/moveParams.test.ts src/state/actions/activeSectionController.test.ts src/state/actions/sections/sectionSizes.test.tsx`
  - `pnpm -C frontend exec prettier --check src/README.md src/state/actions/activeSectionController.ts src/state/actions/aiChatStreaming.ts src/state/actions/aiChatStreamingTools.ts src/state/actions/aiHydration.ts src/state/actions/params/moveParams.ts src/state/actions/projectStateCommands.ts src/state/actions/sectionDisplayQueries.ts src/state/actions/sectionEffectiveImplCore.ts src/state/actions/sectionEffectiveImplCore.test.ts src/state/actions/sectionEffectiveImplMutations.ts src/state/actions/sectionEffectiveImplSelectors.ts src/state/actions/sectionEffectiveImplSelectors.test.ts src/state/actions/sectionEffectiveImpls.ts src/state/actions/sectionHierarchy.test.ts src/state/actions/sectionHierarchy.ts src/state/actions/sectionLayoutQueries.ts src/state/actions/sectionShownParams.ts src/state/actions/sectionStreamingMerge.test.ts src/state/actions/sectionStreamingMerge.ts src/state/actions/sectionToolArgumentPreview.ts src/state/actions/sections/sectionSizes.ts src/state/actions/stateMachineEdgeGraph.ts src/state/actions/stateMachineEdgeMutations.ts src/state/actions/websocketBootstrap.ts src/state/actions/websocketIncomingMessages.ts src/state/actions/websocketRealtime.ts src/state/actions/windowSpacePersistence.ts ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `9d837ee1c`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/windowSpaceWorkspaceRestoreLayout.ts`,
    now the largest authored/shared state hotspot, by separating restore
    planning and application from the remaining instance-remapping and deduped
    merge helpers.

## 2026-03-15 01:29:31 PDT

- Slice completed: split workspace restore remap and reuse helpers out of
  `windowSpaceWorkspaceRestoreLayout.ts`
- Key files touched:
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreLayout.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/windowSpaceWorkspaceRestoreRemap.test.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/windowSpaces.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/windowSpaceWorkspaceRestoreLayout.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.test.ts src/state/actions/windowSpaceWorkspaceRestorePlan.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/windowSpaceWorkspaceRestoreVisibility.ts src/state/actions/windowSpaces.ts src/state/actions/windowSpaces.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `fe4c4af7c`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sections/createSectionFileOpeners.ts`,
    now the largest authored/shared state hotspot, by separating file-open
    reuse flows from drop-routing and per-impl open helpers.

## 2026-03-15 01:36:15 PDT

- Slice completed: split section file-open ownership into shared helpers,
  per-impl open commands, and dropped-file routing
- Key files touched:
  - `frontend/src/state/actions/sections/createSectionFileOpenShared.ts`
  - `frontend/src/state/actions/sections/createSectionFileOpenCommands.ts`
  - `frontend/src/state/actions/sections/createSectionFileDropRouting.ts`
  - `frontend/src/state/actions/sections/createSectionFileOpeners.ts`
  - `frontend/src/state/actions/sections/createSectionFileOpenShared.test.ts`
  - `frontend/src/state/actions/sections/createSectionFileDropRouting.test.ts`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/forks/xyflow/core/container/Pane.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-sections-and-params-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sections/createSectionFileOpenShared.test.ts src/state/actions/sections/createSectionFileDropRouting.test.ts src/components/Panes/Overview/FileBrowser/FileBrowserPane.test.ts src/components/Section/Layouts/BrowserArea.test.tsx src/forks/xyflow/core/container/Pane.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/sections/createSectionFileOpeners.ts src/state/actions/sections/createSectionFileOpenShared.ts src/state/actions/sections/createSectionFileOpenShared.test.ts src/state/actions/sections/createSectionFileOpenCommands.ts src/state/actions/sections/createSectionFileDropRouting.ts src/state/actions/sections/createSectionFileDropRouting.test.ts src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx src/components/Section/Layouts/BrowserArea.tsx src/forks/xyflow/core/container/Pane.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-sections-and-params-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `5bf3b7937`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts`,
    now the largest authored/shared state hotspot, by separating floating-window
    reuse and owner-key resolution from the remaining instance-remapping
    helpers.

## 2026-03-15 01:40:44 PDT

- Slice completed: split saved-layout restore reuse and owner-key matching out
  of `windowSpaceWorkspaceRestoreRemap.ts`
- Key files touched:
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreReuse.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreReuse.test.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/windowSpaceWorkspaceRestoreReuse.test.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.test.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/windowSpaces.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/windowSpaceWorkspaceRestoreReuse.ts src/state/actions/windowSpaceWorkspaceRestoreReuse.test.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.test.ts src/state/actions/windowSpaceWorkspaceRestoreLayout.ts src/state/actions/windowSpaceWorkspaceRestorePlan.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/windowSpaces.ts src/state/actions/windowSpaces.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `13255d162`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowingWritePipeline.ts`,
    now the largest authored/shared state hotspot, by separating pending-mutation
    queueing from authoritative publish/replay and explicit sync/flush helpers.

## 2026-03-15 01:51:10 PDT

- Slice completed: split project chat windowing write helpers into queue,
  publish/replay, and sync owners
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowingWriteQueue.ts`
  - `frontend/src/state/actions/projectChatWindowingWritePublish.ts`
  - `frontend/src/state/actions/projectChatWindowingWriteSync.ts`
  - `frontend/src/state/actions/projectChatWindowingWritePipeline.ts`
  - `frontend/src/state/actions/projectChatWindowingWrites.ts`
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/actions/windowSpacePersistence.ts`
  - `frontend/src/state/actions/windowSpaceProjectChatThreadRestore.ts`
  - `frontend/src/state/actions/projectChatWindowing.permissions.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/windowSpaces.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowing.ts src/state/actions/projectChatWindowingWrites.ts src/state/actions/projectChatWindowingWritePipeline.ts src/state/actions/projectChatWindowingWriteQueue.ts src/state/actions/projectChatWindowingWritePublish.ts src/state/actions/projectChatWindowingWriteSync.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/windowSpacePersistence.ts src/state/actions/windowSpaceProjectChatThreadRestore.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `900c3d55d`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatControls.ts`, now the largest
    authored/shared state hotspot, by separating stop orchestration from local
    stop-state reconciliation and external approval/question response flows.

## 2026-03-15 01:59:57 PDT

- Slice completed: split external AI chat stop lookup and recovery away from
  the public project/section stop commands
- Key files touched:
  - `frontend/src/state/actions/aiChatControls.ts`
  - `frontend/src/state/actions/aiExternalAgentStop.ts`
  - `frontend/src/state/actions/aiExternalAgentStop.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiExternalAgentStop.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiWaitingForResponse.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Section/Layouts/ChatArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatControls.ts src/state/actions/aiExternalAgentStop.ts src/state/actions/aiExternalAgentStop.test.ts src/state/actions/aiStopProjectChat.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Section/Layouts/ChatArea.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `7aba6008e`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/stateMachineEdgeGraph.ts`, now the
    largest authored/shared state hotspot, by separating workflow graph reads
    and machine-group resolution from the remaining merge
    snapshot/apply/restore helpers.

## 2026-03-15 02:05:49 PDT

- Slice completed: split workflow machine-group merge snapshot/apply/restore
  helpers away from the workflow graph read surface
- Key files touched:
  - `frontend/src/state/actions/stateMachineEdgeGraph.ts`
  - `frontend/src/state/actions/stateMachineEdgeMachineGroupMerge.ts`
  - `frontend/src/state/actions/stateMachineEdgeGraph.test.ts`
  - `frontend/src/state/actions/stateMachineEdgeMachineGroupMerge.test.ts`
  - `frontend/src/state/actions/stateMachineEdgeMutations.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/stateMachineEdgeGraph.test.ts src/state/actions/stateMachineEdgeMachineGroupMerge.test.ts src/state/actions/stateMachineEdges.test.ts src/state/actions/stateMachineEdgeMutations.test.ts src/state/actions/chatSharedEdges.test.ts src/forks/xyflow/core/container/StateMachineEdgeRenderer.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/stateMachineEdgeGraph.ts src/state/actions/stateMachineEdgeMachineGroupMerge.ts src/state/actions/stateMachineEdgeGraph.test.ts src/state/actions/stateMachineEdgeMachineGroupMerge.test.ts src/state/actions/stateMachineEdgeMutations.ts src/state/actions/stateMachineEdges.test.ts src/state/actions/chatSharedEdges.test.ts src/forks/xyflow/core/container/StateMachineEdgeRenderer.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `890bfc601`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionEffectiveImplSelectors.ts`, now
    the largest authored/shared state hotspot, by separating typed
    current-section/current-code-object selectors from the remaining
    managed-chat and param display-name helpers.

## 2026-03-15 02:14:26 PDT

- Slice completed: split managed-chat authority and param display-name helpers
  away from typed effective-impl selectors
- Key files touched:
  - `frontend/src/state/actions/sectionEffectiveImplSelectors.ts`
  - `frontend/src/state/actions/sectionFeatureSelectors.ts`
  - `frontend/src/state/actions/sectionFeatureSelectors.test.ts`
  - `frontend/src/state/actions/sectionEffectiveImplSelectors.test.ts`
  - `frontend/src/state/actions/sectionEffectiveImpls.ts`
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/sections/sectionContents.ts`
  - `frontend/src/state/hooks/search.ts`
  - `frontend/src/components/Chat/sharePolicyChatAccess.ts`
  - `frontend/src/components/Section/Layouts/MetaControlArea.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/MetaControlSettings.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/EdgePortsSettings.tsx`
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/GetParamSwitch.tsx`
  - `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionEffectiveImplSelectors.test.ts src/state/actions/sectionFeatureSelectors.test.ts src/components/Chat/sharePolicyChatAccess.test.ts src/components/Params/GroupContainer.test.tsx src/components/App/AppRenderer.policy.test.tsx src/state/actions/aiSectionStreaming.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sectionEffectiveImplSelectors.ts src/state/actions/sectionFeatureSelectors.ts src/state/actions/sectionFeatureSelectors.test.ts src/state/actions/sectionEffectiveImplSelectors.test.ts src/state/actions/sectionEffectiveImpls.ts src/state/actions/aiChatStreaming.ts src/state/actions/sections/sectionContents.ts src/state/hooks/search.ts src/components/Chat/sharePolicyChatAccess.ts src/components/Section/Layouts/MetaControlArea.tsx src/components/App/appRegistry.tsx src/components/Panes/UiEditor/SectionConfig/MetaControlSettings.tsx src/components/Panes/UiEditor/SectionConfig/EdgePortsSettings.tsx src/components/Params/GroupContainer.tsx src/components/Params/GetParamSwitch.tsx src/components/Params/ParamItems/ParamTextLabel.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `baafde35c`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowCommands.ts`, now the
    largest authored/shared state hotspot, by separating public window
    lifecycle/focus commands from the remaining bounds and tracked git-pane
    coordination helpers.

## 2026-03-15 02:24:26 PDT

- Slice completed: split public project-chat window lifecycle/focus commands
  away from placement/bounds commands
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowLifecycleCommands.ts`
  - `frontend/src/state/actions/projectChatWindowLayoutCommands.ts`
  - `frontend/src/state/actions/projectChatWindowCommands.ts`
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx`
  - `frontend/src/components/Section/Container/SectionWindowPlaceholder.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/windowSpaces.test.ts src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.test.tsx src/components/Section/Container/SectionWindowPlaceholder.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowCommands.ts src/state/actions/projectChatWindowLifecycleCommands.ts src/state/actions/projectChatWindowLayoutCommands.ts src/state/actions/projectChatWindowing.ts src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx src/components/Section/Container/SectionWindowPlaceholder.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `c9f5790db`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionEffectiveImplSelectors.ts`, now
    the largest authored/shared state hotspot at 205 lines, by separating
    typed current-section/current-code-object selectors from the remaining
    managed-chat and param display-name helpers.

## 2026-03-15 02:34:03 PDT

- Slice completed: split AI chat streaming tool handling into dedicated
  tool-call, preview-store, and app-definition owners
- Key files touched:
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/aiChatStreamingSectionState.ts`
  - `frontend/src/state/actions/aiChatStreamingToolCalls.ts`
  - `frontend/src/state/actions/aiChatStreamingToolPreviews.ts`
  - `frontend/src/state/actions/aiChatStreamingAppDefinition.ts`
  - `frontend/src/state/actions/aiChatStreamingTools.ts`
  - `frontend/src/state/actions/aiChatStreamingTools.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiChatStreamingTools.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts src/state/actions/aiAppSpecApply.test.ts src/state/actions/aiStreamingPersistence.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiChatPromotion.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatStreaming.ts src/state/actions/aiChatStreamingSectionState.ts src/state/actions/aiChatStreamingTools.ts src/state/actions/aiChatStreamingAppDefinition.ts src/state/actions/aiChatStreamingToolCalls.ts src/state/actions/aiChatStreamingToolPreviews.ts src/state/actions/aiChatStreamingTools.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `1d0270be9`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiHydration.ts`, now tied for the
    largest authored/shared state hotspot at 459 lines, by separating
    route-probe/outcome classification from the remaining managed/external chat
    apply helpers.

## 2026-03-15 02:40:30 PDT

- Slice completed: split AI chat hydration route probes/outcome classification
  away from managed/external hydration apply helpers
- Key files touched:
  - `frontend/src/state/actions/aiHydration.ts`
  - `frontend/src/state/actions/aiHydrationApply.ts`
  - `frontend/src/state/actions/aiHydrationOutcome.ts`
  - `frontend/src/state/actions/aiHydrationOutcome.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiHydrationOutcome.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiSectionStateSync.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.hydration.integration.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiHydration.ts src/state/actions/aiHydrationApply.ts src/state/actions/aiHydrationOutcome.ts src/state/actions/aiHydrationOutcome.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `3dea48c15`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/chatHistory.ts`, now the largest
    authored/shared state hotspot at 459 lines, by separating history paging
    fetches and selection reconciliation from the remaining persisted
    thread-history mutation helpers.

## 2026-03-15 02:50:10 PDT

- Slice completed: split chat history entry derivation away from chat
  provenance lookup and shared run-filter helpers
- Key files touched:
  - `frontend/src/state/actions/chatHistory.ts`
  - `frontend/src/state/actions/chatHistoryEntries.ts`
  - `frontend/src/state/actions/chatHistoryProvenance.ts`
  - `frontend/src/state/actions/chatHistoryShared.ts`
  - `frontend/src/state/actions/chatHistoryTypes.ts`
  - `frontend/src/state/actions/chatHistory.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/chatHistory.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationAuthority.integration.test.ts src/components/Section/Layouts/ChatArea.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePage.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/chatHistory.ts src/state/actions/chatHistoryTypes.ts src/state/actions/chatHistoryShared.ts src/state/actions/chatHistoryEntries.ts src/state/actions/chatHistoryProvenance.ts src/state/actions/chatHistory.test.ts src/components/Pages/Project/StandaloneProjectSurfacePage.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationAuthority.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx src/components/Section/Layouts/ChatArea.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `87abaa2be`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/agenticEdges.ts`, now the largest
    authored/shared state hotspot at 448 lines, by separating agentic-edge
    graph reads and canonicalization from optimistic mutation commands.

## 2026-03-15 02:57:55 PDT

- Slice completed: split agentic-edge connection normalization/validation away
  from optimistic mutation commands
- Key files touched:
  - `frontend/src/state/actions/agenticEdges.ts`
  - `frontend/src/state/actions/agenticEdgeConnections.ts`
  - `frontend/src/state/actions/agenticEdgeMutations.ts`
  - `frontend/src/state/actions/agenticEdges.test.ts`
  - `frontend/src/state/actions/chatSharedEdges.ts`
  - `frontend/src/state/actions/keyActivationHandlers.ts`
  - `frontend/src/state/actions/edges.ts`
  - `frontend/src/components/Section/Container/AgenticEdgeHandles.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - `frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/agenticEdges.test.ts src/state/actions/chatSharedEdges.test.ts src/state/actions/keyActivationHandlers.test.ts src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx src/forks/xyflow/core/container/AgenticEdgeRenderer.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/agenticEdges.ts src/state/actions/agenticEdgeConnections.ts src/state/actions/agenticEdgeMutations.ts src/state/actions/agenticEdges.test.ts src/state/actions/chatSharedEdges.ts src/state/actions/keyActivationHandlers.ts src/state/actions/edges.ts src/components/Section/Container/AgenticEdgeHandles.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `4f4d0f042`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/uiSettingRevealMutationSnapshots.ts`,
    now the largest authored/shared state hotspot at 426 lines, by separating
    reveal snapshot capture from rollback/restore application helpers.

## 2026-03-15 03:03:32 PDT

- Slice completed: split reveal snapshot capture/failure assembly away from
  rollback and owned restore application
- Key files touched:
  - `frontend/src/state/actions/uiSettingRevealMutationSnapshots.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationCapture.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationRestore.ts`
  - `frontend/src/state/actions/uiSettingRevealMutations.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationCapture.test.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationSnapshots.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/uiSettingRevealMutationCapture.test.ts src/state/actions/uiSettingRevealMutationSnapshots.test.ts src/state/actions/uiSettingRevealMutationOwnership.test.ts src/state/actions/uiSettingReveal.test.ts src/state/actions/uiSettingRevealDom.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/uiSettingRevealMutationSnapshots.ts src/state/actions/uiSettingRevealMutationCapture.ts src/state/actions/uiSettingRevealMutationRestore.ts src/state/actions/uiSettingRevealMutations.ts src/state/actions/uiSettingRevealMutationSnapshots.test.ts src/state/actions/uiSettingRevealMutationCapture.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `b5405ec3d`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatSubmission.ts`, now the largest
    authored/shared state hotspot at 423 lines, by separating request payload
    assembly from the remaining pending-surface orchestration helpers.

## 2026-03-15 03:09:46 PDT

- Slice completed: split chat request payload assembly away from pending-surface
  submission orchestration
- Key files touched:
  - `frontend/src/state/actions/aiChatSubmission.ts`
  - `frontend/src/state/actions/aiChatSubmissionPayload.ts`
  - `frontend/src/state/actions/aiChatSubmissionPayload.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiChatSubmissionPayload.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiWebsocketAffinitySubmit.test.ts src/state/actions/aiChatPromotion.test.ts src/state/actions/aiPendingChatState.test.ts`
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Section/Layouts/ChatArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatSubmission.ts src/state/actions/aiChatSubmissionPayload.ts src/state/actions/aiChatSubmissionPayload.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `c01641751`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/windowSpaceSnapshots.ts`, now the largest
    authored/shared state hotspot at 422 lines, by separating floating
    snapshot capture from restored-windowing conversion helpers.

## 2026-03-15 03:15:27 PDT

- Slice completed: split saved window-space snapshot capture away from restore
  conversion helpers
- Key files touched:
  - `frontend/src/state/actions/windowSpaceSnapshotCapture.ts`
  - `frontend/src/state/actions/windowSpaceSnapshotRestore.ts`
  - `frontend/src/state/actions/windowSpaceSnapshots.ts`
  - `frontend/src/state/actions/windowSpacePersistence.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreLayout.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreReuse.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/windowSpaces.test.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.test.ts src/state/actions/windowSpaceWorkspaceRestoreReuse.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/windowSpaceSnapshotCapture.ts src/state/actions/windowSpaceSnapshotRestore.ts src/state/actions/windowSpaceSnapshots.ts src/state/actions/windowSpacePersistence.ts src/state/actions/windowSpaceWorkspaceRestoreLayout.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.ts src/state/actions/windowSpaceWorkspaceRestoreReuse.ts src/state/actions/windowSpaces.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `a51233f59`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/keyShortcutRegistrations.ts`, now the
    largest authored/shared state hotspot at 416 lines, by separating grouped
    shortcut registration sets from the remaining Tab-versus-param binding
    decisions and registry composition helpers.

## 2026-03-15 03:21:52 PDT

- Slice completed: split grouped shortcut registration tables away from
  Tab-vs-param binding decisions and registry composition
- Key files touched:
  - `frontend/src/state/actions/keyShortcutRegistrations.ts`
  - `frontend/src/state/actions/keyShortcutRegistrations.test.ts`
  - `frontend/src/state/actions/keyShortcutRegistrationGroups.ts`
  - `frontend/src/state/actions/keyShortcutRegistrationGroups.test.ts`
  - `frontend/src/state/actions/keyShortcutRegistrationFactories.ts`
  - `frontend/src/state/actions/keyShortcutRegistrationTypes.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/keyShortcutRegistrationGroups.test.ts src/state/actions/keyShortcutRegistrations.test.ts src/state/actions/keyActivations.test.ts src/state/actions/keyActivationHandlers.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/keyShortcutRegistrationTypes.ts src/state/actions/keyShortcutRegistrationFactories.ts src/state/actions/keyShortcutRegistrationGroups.ts src/state/actions/keyShortcutRegistrationGroups.test.ts src/state/actions/keyShortcutRegistrations.ts src/state/actions/keyShortcutRegistrations.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `19bb2024e`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowingSelectors.ts`, now
    the largest authored/shared state hotspot at 410 lines, by separating pure
    normalization helpers from section-binding and visible-window selector
    reads.

## 2026-03-15 03:26:43 PDT

- Slice completed: split pure project-chat windowing normalization away from
  section-binding and visible-window selector reads
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowingNormalization.ts`
  - `frontend/src/state/actions/projectChatWindowingNormalization.test.ts`
  - `frontend/src/state/actions/projectChatWindowingSelectors.ts`
  - `frontend/src/state/actions/projectChatWindowingInstanceState.ts`
  - `frontend/src/state/actions/projectChatWindowingPlacementState.ts`
  - `frontend/src/state/actions/windowSpaceSnapshotRestore.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreLayout.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts`
  - `frontend/src/state/actions/projectChatWindowing.test.ts`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowingNormalization.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/windowSpaces.test.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/components/ChatWindowing/ProjectChatBottomDock.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowingNormalization.ts src/state/actions/projectChatWindowingNormalization.test.ts src/state/actions/projectChatWindowingSelectors.ts src/state/actions/projectChatWindowingInstanceState.ts src/state/actions/projectChatWindowingPlacementState.ts src/state/actions/windowSpaceSnapshotRestore.ts src/state/actions/windowSpaceWorkspaceRestoreLayout.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.ts src/state/actions/projectChatWindowing.test.ts src/components/ChatWindowing/ProjectChatBottomDock.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `7de07c924`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiConfigurationCatalogs.ts`, now the
    largest authored/shared state hotspot at 397 lines, by separating catalog
    fetch or hydration from mutation and store-write helpers.

## 2026-03-15 03:33:51 PDT

- Slice completed: split AI settings catalog fetch/hydration away from
  mutation transport and shared store-write helpers
- Key files touched:
  - `frontend/src/state/actions/aiConfigurationCatalogLoads.ts`
  - `frontend/src/state/actions/aiConfigurationCatalogState.ts`
  - `frontend/src/state/actions/aiConfigurationCatalogMutations.ts`
  - `frontend/src/state/actions/aiConfigurationCatalogs.ts`
  - `frontend/src/state/actions/aiConfigurationCatalogs.test.ts`
  - `frontend/src/state/actions/aiUpdateEngineConfig.test.ts`
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiConfigurationCatalogs.test.ts src/state/actions/aiUpdateEngineConfig.test.ts src/state/actions/websocketReceive.test.ts src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiConfigurationCatalogs.ts src/state/actions/aiConfigurationCatalogLoads.ts src/state/actions/aiConfigurationCatalogState.ts src/state/actions/aiConfigurationCatalogMutations.ts src/state/actions/aiConfigurationCatalogs.test.ts src/state/actions/aiUpdateEngineConfig.test.ts src/state/actions/websocketIncomingMessages.ts src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `0716ce86c`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/stateMachineDraftValidation.ts`, now the
    largest authored/shared state hotspot at 392 lines, by separating graph
    reads and validation result assembly from the remaining issue-group and
    traversal helpers.

## 2026-03-15 03:40:09 PDT

- Slice completed: split workflow draft validation graph reads away from
  warning assembly and traversal orchestration
- Key files touched:
  - `frontend/src/state/actions/stateMachineDraftValidation.ts`
  - `frontend/src/state/actions/stateMachineDraftValidationGraph.ts`
  - `frontend/src/state/actions/stateMachineDraftValidationWarnings.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/stateMachineDraftValidation.test.ts src/components/Section/Layouts/StateMachineNodeArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/stateMachineDraftValidation.ts src/state/actions/stateMachineDraftValidationGraph.ts src/state/actions/stateMachineDraftValidationWarnings.ts src/state/actions/stateMachineDraftValidation.test.ts src/components/Section/Layouts/StateMachineNodeArea.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `a4a829616`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatStreaming.ts`, now the largest
    authored/shared state hotspot at 391 lines, by separating top-level stream
    chunk routing and persistence side effects from the remaining managed-chat
    detail updates.

## 2026-03-15 03:50:09 PDT

- Slice completed: split AI chat streaming chunk routing and section
  persistence side effects away from managed-chat detail updates
- Key files touched:
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/aiChatStreamingRouting.ts`
  - `frontend/src/state/actions/aiChatStreamingRouting.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiChatStreamingRouting.test.ts src/state/actions/aiStreamingPersistence.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts src/state/actions/aiAppSpecApply.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiChatPromotion.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatStreaming.ts src/state/actions/aiChatStreamingRouting.ts src/state/actions/aiChatStreamingRouting.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `94415be0d`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/keyShortcutUtils.ts`, now the largest
    authored/shared state hotspot at 384 lines, by separating shortcut
    normalization and matching from the remaining input-ignore and editable
    target policy helpers.

## 2026-03-15 03:57:05 PDT

- Slice completed: split shortcut parsing and matching away from editable-target
  and input-ignore policy
- Key files touched:
  - `frontend/src/state/actions/keyShortcutMatching.ts`
  - `frontend/src/state/actions/keyShortcutInputPolicy.ts`
  - `frontend/src/state/actions/keyShortcutUtils.ts`
  - `frontend/src/state/actions/keyShortcutMatching.test.ts`
  - `frontend/src/state/actions/keyShortcutInputPolicy.test.ts`
  - `frontend/src/state/actions/keyActivations.ts`
  - `frontend/src/state/actions/keyActivationHandlers.ts`
  - `frontend/src/state/actions/keyShortcutRegistrations.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/keyShortcutMatching.test.ts src/state/actions/keyShortcutInputPolicy.test.ts src/state/actions/keyActivations.test.ts src/state/actions/keyActivationHandlers.test.ts src/state/actions/keyShortcutRegistrations.test.ts src/state/actions/keyShortcutRegistrationGroups.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/keyShortcutUtils.ts src/state/actions/keyShortcutMatching.ts src/state/actions/keyShortcutInputPolicy.ts src/state/actions/keyShortcutMatching.test.ts src/state/actions/keyShortcutInputPolicy.test.ts src/state/actions/keyActivations.ts src/state/actions/keyActivationHandlers.ts src/state/actions/keyShortcutRegistrations.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `a124e51de`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/chatMergeUtils.ts`, now the largest
    authored/shared state hotspot at 380 lines, by separating chat-run merge
    normalization from the remaining branch/thread reconciliation helpers.

## 2026-03-15 04:02:15 PDT

- Slice completed: split generic chat message merge normalization away from
  hydration-time local-vs-backend reconciliation
- Key files touched:
  - `frontend/src/state/actions/chatMessageMerge.ts`
  - `frontend/src/state/actions/chatHydrationMerge.ts`
  - `frontend/src/state/actions/chatMergeUtils.ts`
  - `frontend/src/state/actions/chatMessageMerge.test.ts`
  - `frontend/src/state/actions/chatHydrationMerge.test.ts`
  - `frontend/src/state/actions/aiHydrationApply.ts`
  - `frontend/src/state/actions/aiPendingChatState.ts`
  - `frontend/src/state/actions/chatBranches.ts`
  - `frontend/src/state/actions/sectionStreamingMerge.ts`
  - `frontend/src/state/actions/sectionInfos.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/chatMessageMerge.test.ts src/state/actions/chatHydrationMerge.test.ts src/state/actions/sectionStreamingMerge.test.ts src/state/actions/sectionInfos.test.ts src/state/actions/aiSectionStateSync.test.ts src/state/actions/aiStopProjectChat.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.hydration.integration.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/chatMergeUtils.ts src/state/actions/chatMessageMerge.ts src/state/actions/chatHydrationMerge.ts src/state/actions/chatMessageMerge.test.ts src/state/actions/chatHydrationMerge.test.ts src/state/actions/aiHydrationApply.ts src/state/actions/aiPendingChatState.ts src/state/actions/chatBranches.ts src/state/actions/sectionStreamingMerge.ts src/state/actions/sectionInfos.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `833d79124`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sections/createSectionsHelper.ts`, now
    the largest authored/shared state hotspot at 375 lines, by separating
    section factory defaults from the remaining section creation command
    helpers.

## 2026-03-15 04:08:29 PDT

- Slice completed: split section creation menu defaults and grouped factory
  catalog away from the post-create command helper
- Key files touched:
  - `frontend/src/state/actions/sections/createSectionCatalog.ts`
  - `frontend/src/state/actions/sections/createSectionsHelper.ts`
  - `frontend/src/state/actions/sections/createSectionCatalog.test.tsx`
  - `frontend/src/state/actions/sections/createSectionsHelper.test.tsx`
  - `frontend/src/components/AppHeader/SearchBar/ProjectPageSearch.tsx`
  - `frontend/src/components/AppHeader/SearchBar/ProjectPageSearch.test.ts`
  - `frontend/src/components/Utils/ContextMenus/PaneContextMenu.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sections/createSectionCatalog.test.tsx src/state/actions/sections/createSectionsHelper.test.tsx src/components/AppHeader/SearchBar/ProjectPageSearch.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sections/createSectionCatalog.ts src/state/actions/sections/createSectionsHelper.ts src/state/actions/sections/createSectionCatalog.test.tsx src/state/actions/sections/createSectionsHelper.test.tsx src/components/AppHeader/SearchBar/ProjectPageSearch.tsx src/components/AppHeader/SearchBar/ProjectPageSearch.test.ts src/components/Utils/ContextMenus/PaneContextMenu.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `eca4f8161`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/artifacts.ts`, now the largest
    authored/shared state hotspot at 366 lines, by separating artifact lookup
    and grouping reads from the remaining artifact mutation or visibility
    helpers.

## 2026-03-15 04:18:57 PDT

- Slice completed: split artifact websocket/store reconciliation away from draw
  artifact save queueing and flush transport
- Key files touched:
  - `frontend/src/state/actions/artifactStoreUpdates.ts`
  - `frontend/src/state/actions/artifactSyncQueue.ts`
  - `frontend/src/state/actions/artifacts.ts`
  - `frontend/src/state/actions/artifactStoreUpdates.test.ts`
  - `frontend/src/state/actions/artifactSyncQueue.test.ts`
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/state/actions/project/saveProject.ts`
  - `frontend/src/components/Section/Layouts/DrawArea/canvasUtils.ts`
  - `frontend/src/components/Section/Layouts/DrawArea/useDrawModeMouseHandlers.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/artifactStoreUpdates.test.ts src/state/actions/artifactSyncQueue.test.ts src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/artifacts.ts src/state/actions/artifactStoreUpdates.ts src/state/actions/artifactSyncQueue.ts src/state/actions/artifactStoreUpdates.test.ts src/state/actions/artifactSyncQueue.test.ts src/state/actions/websocketIncomingMessages.ts src/state/actions/project/saveProject.ts src/components/Section/Layouts/DrawArea/canvasUtils.ts src/components/Section/Layouts/DrawArea/useDrawModeMouseHandlers.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `720a53dec`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sections/moveSections.ts`, now the
    largest authored/shared state hotspot at 365 lines, by separating section
    parent-resolution and pane-placement reads from optimistic move command
    orchestration.

## 2026-03-15 04:25:44 PDT

- Slice completed: split section move route-selection reads away from in-state
  move reducers and optimistic backend command orchestration
- Key files touched:
  - `frontend/src/state/actions/sections/moveSectionQueries.ts`
  - `frontend/src/state/actions/sections/moveSectionState.ts`
  - `frontend/src/state/actions/sections/moveSections.ts`
  - `frontend/src/state/actions/sections/moveSectionQueries.test.ts`
  - `frontend/src/state/actions/sections/moveSections.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sections/moveSectionQueries.test.ts src/state/actions/sections/moveSections.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sections/moveSections.ts src/state/actions/sections/moveSectionQueries.ts src/state/actions/sections/moveSectionState.ts src/state/actions/sections/moveSections.test.ts src/state/actions/sections/moveSectionQueries.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `577ce7705`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/uiSettingRevealMutationRestore.ts`, now
    the largest authored/shared state hotspot at 362 lines, by separating
    local-storage restore and project-state restore helpers from the shared
    owned-record revert utilities.

## 2026-03-15 04:31:22 PDT

- Slice completed: split UI setting reveal rollback ownership by restore
  surface and shared owned-record revert helpers
- Key files touched:
  - `frontend/src/state/actions/uiSettingRevealMutationRecordRestore.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationLocalStorageRestore.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationProjectStateRestore.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationProjectStateRestore.test.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationRestore.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationCapture.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/uiSettingRevealMutationSnapshots.test.ts src/state/actions/uiSettingRevealMutationProjectStateRestore.test.ts src/state/actions/uiSettingRevealMutationCapture.test.ts src/state/actions/uiSettingRevealMutationOwnership.test.ts src/state/actions/uiSettingReveal.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/uiSettingRevealMutationRestore.ts src/state/actions/uiSettingRevealMutationLocalStorageRestore.ts src/state/actions/uiSettingRevealMutationProjectStateRestore.ts src/state/actions/uiSettingRevealMutationRecordRestore.ts src/state/actions/uiSettingRevealMutationCapture.ts src/state/actions/uiSettingRevealMutationSnapshots.test.ts src/state/actions/uiSettingRevealMutationProjectStateRestore.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `38f6b4d2e`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatThreadGroupMutations.ts`, now
    tied for the largest authored/shared state hotspot at 362 lines, by
    separating group CRUD and naming logic from the remaining pin/collapse/
    reorder and assignment or delete flows.

## 2026-03-15 04:40:55 PDT

- Slice completed: split persisted project-chat thread group mutations by CRUD,
  ordering, and assignment/delete ownership
- Key files touched:
  - `frontend/src/state/actions/projectChatThreadGroupCrud.ts`
  - `frontend/src/state/actions/projectChatThreadGroupOrdering.ts`
  - `frontend/src/state/actions/projectChatThreadGroupAssignments.ts`
  - `frontend/src/state/actions/projectChatThreadGroupMutations.ts`
  - `frontend/src/state/actions/projectChatThreads.ts`
  - `frontend/src/state/actions/projectChatThreads.test.ts`
  - `frontend/src/state/actions/undo.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatThreads.test.ts src/state/actions/undo.test.ts`
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatThreadGroupMutations.ts src/state/actions/projectChatThreadGroupCrud.ts src/state/actions/projectChatThreadGroupOrdering.ts src/state/actions/projectChatThreadGroupAssignments.ts src/state/actions/projectChatThreads.ts src/state/actions/projectChatThreads.test.ts src/state/actions/undo.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `93d221552`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/uiSettingReveal.ts`, now the largest
    authored/shared state hotspot at 360 lines, by separating active reveal
    orchestration from the remaining mutation launch, focus, and cleanup
    helpers.

## 2026-03-15 04:48:14 PDT

- Slice completed: split UI setting reveal request orchestration from
  single-target reveal execution and plugin fallback handling
- Key files touched:
  - `frontend/src/state/actions/uiSettingRevealRequests.ts`
  - `frontend/src/state/actions/uiSettingRevealExecution.ts`
  - `frontend/src/state/actions/uiSettingReveal.ts`
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/state/actions/uiSettingReveal.test.ts`
  - `frontend/src/state/actions/websocketReceive.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/uiSettingReveal.test.ts src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/uiSettingReveal.ts src/state/actions/uiSettingRevealRequests.ts src/state/actions/uiSettingRevealExecution.ts src/state/actions/uiSettingReveal.test.ts src/state/actions/websocketIncomingMessages.ts src/state/actions/websocketReceive.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `ac68155c0`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/stateMachineRuns.ts`, now the largest
    authored/shared state hotspot at 354 lines, by separating run-history
    reads and selection state from optimistic run mutation commands.

## 2026-03-15 04:55:02 PDT

- Slice completed: split workflow run selection/polling ownership from
  optimistic workflow run mutation commands
- Key files touched:
  - `frontend/src/state/actions/stateMachineRunSelection.ts`
  - `frontend/src/state/actions/stateMachineRunMutations.ts`
  - `frontend/src/state/actions/stateMachineRuns.ts`
  - `frontend/src/state/actions/stateMachineRuns.test.ts`
  - `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`
  - `frontend/src/components/Section/Layouts/stateMachineNodePresentation.ts`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/stateMachineRuns.test.ts src/components/Section/Layouts/StateMachineNodeArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/stateMachineRuns.ts src/state/actions/stateMachineRunSelection.ts src/state/actions/stateMachineRunMutations.ts src/state/actions/stateMachineRuns.test.ts src/components/Section/Layouts/StateMachineNodeArea.tsx src/components/Section/Layouts/stateMachineNodePresentation.ts src/components/Panes/Overview/RunInstructions.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `b06c730a2`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/gitGraphLog.ts`, now the largest
    authored/shared state hotspot at 351 lines, by separating git graph
    loading/filter state from the remaining overlay boot and all-refs refresh
    behavior.

## 2026-03-15 05:01:35 PDT

- Slice completed: split git graph loading/filter state away from overlay boot
  and all-refs refresh behavior
- Key files touched:
  - `frontend/src/state/actions/gitGraphLoadState.ts`
  - `frontend/src/state/actions/gitGraphOverlayActions.ts`
  - `frontend/src/state/actions/gitGraphLog.ts`
  - `frontend/src/state/actions/git.ts`
  - `frontend/src/state/actions/gitGraph.ts`
  - `frontend/src/state/actions/git.test.ts`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/components/Git/GitGraphWindowContent.tsx`
  - `frontend/src/components/Git/GitGraphWindowContent.test.tsx`
  - `frontend/src/components/Panes/Overview/Git/GitPane.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/git.test.ts src/components/Git/GitGraphWindowContent.test.tsx src/components/Panes/Overview/Git/GitPane.test.tsx src/components/Git/GitOverlayLayer.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/gitGraphLog.ts src/state/actions/gitGraphLoadState.ts src/state/actions/gitGraphOverlayActions.ts src/state/actions/git.test.ts src/state/actions/git.ts src/state/actions/gitGraph.ts src/components/Git/GitGraphOverlay.tsx src/components/Git/GitGraphWindowContent.tsx src/components/Git/GitGraphWindowContent.test.tsx src/components/Panes/Overview/Git/GitPane.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `d6540d5dc`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/websocketIncomingMessages.ts`, now tied
    for the largest authored/shared state hotspot at 350 lines, by separating
    message parsing/dispatch from the remaining UI-setting-reveal ACK and
    snapshot-routing helpers.

## 2026-03-15 05:13:09 PDT

- Slice completed: split inbound websocket snapshot routing and
  `UISettingReveal` ACK handling away from the frontend websocket dispatcher
- Key files touched:
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/state/actions/websocketIncomingProjectSnapshots.ts`
  - `frontend/src/state/actions/websocketIncomingProjectSnapshots.test.ts`
  - `frontend/src/state/actions/websocketIncomingUISettingReveal.ts`
  - `frontend/src/state/actions/websocketIncomingTypes.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/websocketIncomingProjectSnapshots.test.ts src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/websocketIncomingMessages.ts src/state/actions/websocketIncomingProjectSnapshots.ts src/state/actions/websocketIncomingProjectSnapshots.test.ts src/state/actions/websocketIncomingTypes.ts src/state/actions/websocketIncomingUISettingReveal.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `81f9c1b560`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatSubmissionPayload.ts`, now the
    largest authored/shared state hotspot at 350 lines, by separating base
    request payload assembly from edited-chat engine resolution and
    agent-run-backed fallback lookup.

## 2026-03-15 05:18:32 PDT

- Slice completed: split edited-chat engine resolution away from chat
  submission payload assembly
- Key files touched:
  - `frontend/src/state/actions/aiChatSubmissionPayload.ts`
  - `frontend/src/state/actions/aiChatSubmissionPayload.test.ts`
  - `frontend/src/state/actions/aiChatSubmissionEngineResolution.ts`
  - `frontend/src/state/actions/aiChatSubmissionEngineResolution.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiChatSubmissionPayload.test.ts src/state/actions/aiChatSubmissionEngineResolution.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiWebsocketAffinitySubmit.test.ts src/state/actions/aiChatPromotion.test.ts src/state/actions/aiPendingChatState.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatSubmissionPayload.ts src/state/actions/aiChatSubmissionPayload.test.ts src/state/actions/aiChatSubmissionEngineResolution.ts src/state/actions/aiChatSubmissionEngineResolution.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `8cdb25fd84`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/windowSpacePersistence.ts`, now the
    largest authored/shared state hotspot at 329 lines, by separating
    optimistic window-space CRUD helpers from the current-floating-window save
    flow, authoritative resync, and snapshot persistence path.

## 2026-03-15 05:38:56 PDT

- Slice completed: split static section creation catalog defaults away from
  hook-time create-list gating
- Key files touched:
  - `frontend/src/state/actions/sections/createSectionCatalog.ts`
  - `frontend/src/state/actions/sections/createSectionCatalogStatic.ts`
  - `frontend/src/state/actions/sections/createSectionCatalogTypes.ts`
  - `frontend/src/state/actions/sections/createSectionCatalog.test.tsx`
  - `frontend/src/state/actions/sections/createSectionCatalogStatic.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sections/createSectionCatalogStatic.test.tsx src/state/actions/sections/createSectionCatalog.test.tsx src/state/actions/sections/createSectionsHelper.test.tsx src/components/AppHeader/SearchBar/ProjectPageSearch.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sections/createSectionCatalog.ts src/state/actions/sections/createSectionCatalogStatic.ts src/state/actions/sections/createSectionCatalogTypes.ts src/state/actions/sections/createSectionCatalog.test.tsx src/state/actions/sections/createSectionCatalogStatic.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `4e6908f06f`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/app.ts`, now the largest
    authored/shared state hotspot at 319 lines, by separating app-session
    storage/bootstrap from deployment-state load/reset and project-config
    caching helpers.

## 2026-03-15 05:50:26 PDT

- Slice completed: split app-session bootstrap away from app deployment-state
  loading and reset flow
- Key files touched:
  - `frontend/src/state/actions/app.ts`
  - `frontend/src/state/actions/appSessionState.ts`
  - `frontend/src/state/actions/appDeploymentState.ts`
  - `frontend/src/state/actions/appSessionState.test.ts`
  - `frontend/src/state/actions/appDeploymentState.test.ts`
  - `frontend/src/state/actions/websocketShareSessionRecovery.ts`
  - `frontend/src/state/actions/websocketShareSessionRecovery.test.ts`
  - `frontend/src/state/hooks/app.ts`
  - `frontend/src/components/App/AppRenderer.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/appSessionState.test.ts src/state/actions/appDeploymentState.test.ts src/state/actions/websocketShareSessionRecovery.test.ts src/components/App/AppRenderer.test.tsx src/components/App/AppRenderer.policy.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/app.ts src/state/actions/appSessionState.ts src/state/actions/appDeploymentState.ts src/state/actions/appSessionState.test.ts src/state/actions/appDeploymentState.test.ts src/state/actions/websocketShareSessionRecovery.ts src/state/actions/websocketShareSessionRecovery.test.ts src/state/hooks/app.ts src/components/App/AppRenderer.tsx src/components/App/appRegistry.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `023829e8e9`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiPendingChatState.ts`, now the largest
    authored/shared state hotspot at 312 lines, by separating pending-surface
    app-generation detail reads or writes from the optimistic message apply,
    commit, and rollback flows.

## 2026-03-15 05:57:32 PDT

- Slice completed: split pending chat app-generation detail state away from
  pending draft message mutations
- Key files touched:
  - `frontend/src/state/actions/aiPendingChatState.ts`
  - `frontend/src/state/actions/aiPendingChatAppGenerationState.ts`
  - `frontend/src/state/actions/aiPendingChatMessageState.ts`
  - `frontend/src/state/actions/aiPendingChatState.test.ts`
  - `frontend/src/state/actions/aiPendingChatAppGenerationState.test.ts`
  - `frontend/src/state/actions/aiChatSubmission.ts`
  - `frontend/src/state/actions/aiChatSubmissionPayload.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiPendingChatAppGenerationState.test.ts src/state/actions/aiPendingChatState.test.ts src/state/actions/aiChatSubmissionPayload.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiChatPromotion.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiPendingChatState.ts src/state/actions/aiPendingChatAppGenerationState.ts src/state/actions/aiPendingChatMessageState.ts src/state/actions/aiPendingChatState.test.ts src/state/actions/aiPendingChatAppGenerationState.test.ts src/state/actions/aiChatSubmission.ts src/state/actions/aiChatSubmissionPayload.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `a8c1145106`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatStreamingMessages.ts`, now the
    largest authored/shared state hotspot at 308 lines, by separating shared
    message delta reducers from finalized-assistant merge or message-upsert
    helpers.

## 2026-03-15 06:04:21 PDT

- Slice completed: split shared streaming message delta reducers away from
  finalized-assistant merge and message-upsert helpers
- Key files touched:
  - `frontend/src/state/actions/aiChatStreamingMessages.ts`
  - `frontend/src/state/actions/aiChatStreamingMessageDeltas.ts`
  - `frontend/src/state/actions/aiChatStreamingMessageUpserts.ts`
  - `frontend/src/state/actions/aiChatStreamingMessageDeltas.test.ts`
  - `frontend/src/state/actions/aiChatStreamingMessageUpserts.test.ts`
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/aiChatStreamingRouting.ts`
  - `frontend/src/state/actions/aiChatStreamingSectionState.ts`
  - `frontend/src/state/actions/aiChatStreamingToolCalls.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiChatStreamingMessageDeltas.test.ts src/state/actions/aiChatStreamingMessageUpserts.test.ts src/state/actions/aiSectionStreaming.test.ts src/state/actions/aiStreamingPersistence.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts src/state/actions/aiAppSpecApply.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiChatPromotion.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatStreaming.ts src/state/actions/aiChatStreamingRouting.ts src/state/actions/aiChatStreamingSectionState.ts src/state/actions/aiChatStreamingToolCalls.ts src/state/actions/aiChatStreamingMessages.ts src/state/actions/aiChatStreamingMessageDeltas.ts src/state/actions/aiChatStreamingMessageUpserts.ts src/state/actions/aiChatStreamingMessageDeltas.test.ts src/state/actions/aiChatStreamingMessageUpserts.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `a51f39f3bd`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/uiSettingRevealActivation.ts`, now the
    largest authored/shared state hotspot at 307 lines, by separating
    active-section or pane-opening writes from accordion and project-chat-aux
    activation helpers.

## 2026-03-15 05:26:34 PDT

- Slice completed: split saved window-space CRUD ownership from the
  current-floating-window save flow
- Key files touched:
  - `frontend/src/state/actions/windowSpaceCrud.ts`
  - `frontend/src/state/actions/windowSpaceSave.ts`
  - `frontend/src/state/actions/windowSpacePersistence.ts`
  - `frontend/src/state/actions/windowSpaces.ts`
  - `frontend/src/state/actions/windowSpaces.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/windowSpaces.test.ts src/components/Panes/Overview/WindowSpacesPane.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/windowSpaceCrud.ts src/state/actions/windowSpaceSave.ts src/state/actions/windowSpacePersistence.ts src/state/actions/windowSpaces.ts src/state/actions/windowSpaces.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `f77a89f8ec`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sections/createSectionCatalog.ts`, now
    tied for the largest authored/shared state hotspot at 319 lines, by
    separating static grouped section-create catalogs from hook-time
    singleton/codegen/plugin gating.

## 2026-03-15 06:15:31 PDT

- Slice completed: split UI setting reveal activation ownership into pane and
  step activation owners
- Key files touched:
  - `frontend/src/state/actions/uiSettingRevealPaneActivation.ts`
  - `frontend/src/state/actions/uiSettingRevealStepActivation.ts`
  - `frontend/src/state/actions/uiSettingRevealActivationShared.ts`
  - `frontend/src/state/actions/uiSettingRevealActivation.ts`
  - `frontend/src/state/actions/uiSettingRevealMutations.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationRecordRestore.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationProjectStateRestore.ts`
  - `frontend/src/state/actions/uiSettingRevealPaneActivation.test.ts`
  - `frontend/src/state/actions/uiSettingRevealStepActivation.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/uiSettingRevealPaneActivation.test.ts src/state/actions/uiSettingRevealStepActivation.test.ts src/state/actions/uiSettingReveal.test.ts src/state/actions/uiSettingRevealMutationOwnership.test.ts src/state/actions/uiSettingRevealMutationProjectStateRestore.test.ts`
  - `pnpm -C frontend exec vitest run src/state/actions/uiSettingRevealMutationSnapshots.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/uiSettingRevealActivation.ts src/state/actions/uiSettingRevealActivationShared.ts src/state/actions/uiSettingRevealPaneActivation.ts src/state/actions/uiSettingRevealStepActivation.ts src/state/actions/uiSettingRevealMutations.ts src/state/actions/uiSettingRevealMutationRecordRestore.ts src/state/actions/uiSettingRevealMutationProjectStateRestore.ts src/state/actions/uiSettingRevealPaneActivation.test.ts src/state/actions/uiSettingRevealStepActivation.test.ts src/state/actions/uiSettingReveal.test.ts src/state/actions/uiSettingRevealMutationOwnership.test.ts src/state/actions/uiSettingRevealMutationProjectStateRestore.test.ts src/state/actions/uiSettingRevealMutationSnapshots.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `97c5f1619`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/hooks/artifacts.ts`, now the largest
    authored/shared state hotspot at 446 lines, by separating cached artifact
    load/decode transport from draw-area artifact reference selection and
    revision-stamp hooks.

## 2026-03-15 06:31:55 PDT

- Slice completed: split artifact hook transport from draw-area artifact hooks
- Key files touched:
  - `frontend/src/state/hooks/artifactTransport.ts`
  - `frontend/src/state/hooks/drawAreaArtifacts.ts`
  - `frontend/src/state/hooks/artifacts.ts`
  - `frontend/src/state/hooks/artifactTransport.test.ts`
  - `frontend/src/state/hooks/drawAreaArtifacts.test.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Section/Layouts/ChartArea/ChartArea.tsx`
  - `frontend/src/components/Section/Layouts/DrawArea/DrawArea.tsx`
  - `frontend/src/components/Section/Layouts/ImageArea.tsx`
  - `frontend/src/state/subscriptions.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/hooks/artifactTransport.test.ts src/state/hooks/drawAreaArtifacts.test.tsx src/components/App/AppRenderer.policy.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/hooks/artifacts.ts src/state/hooks/artifactTransport.ts src/state/hooks/drawAreaArtifacts.ts src/state/hooks/artifactTransport.test.ts src/state/hooks/drawAreaArtifacts.test.tsx src/components/App/appRegistry.tsx src/components/Section/Layouts/ChartArea/ChartArea.tsx src/components/Section/Layouts/DrawArea/DrawArea.tsx src/components/Section/Layouts/ImageArea.tsx src/state/subscriptions.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/hook ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `e0eff6bb5`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/hooks/terminals/terminalSessions.ts`, now the
    largest authored/shared state hotspot at 353 lines, by separating
    websocket transport/session bootstrap from terminal lookup, buffering, and
    lifecycle bookkeeping helpers.

## 2026-03-15 06:40:18 PDT

- Slice completed: split terminal session transport from terminal session lifecycle
- Key files touched:
  - `frontend/src/state/hooks/terminals/terminalSessionTransport.ts`
  - `frontend/src/state/hooks/terminals/terminalSessionTransport.test.ts`
  - `frontend/src/state/hooks/terminals/terminalSessions.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/hooks/terminals/terminalSessionTransport.test.ts src/state/hooks/terminals/terminalSessions.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/hooks/terminals/terminalSessions.ts src/state/hooks/terminals/terminalSessionTransport.ts src/state/hooks/terminals/terminalSessionTransport.test.ts src/state/hooks/terminals/terminalSessions.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/hook ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `f976f74da3`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/hooks/sectionMinMaxDims.ts`, now the largest
    authored/shared state hotspot at 316 lines, by separating sizing-policy
    reads from measured min/max derivation helpers.

## 2026-03-15 06:46:59 PDT

- Slice completed: split section sizing-policy reads from measured min/max dims
- Key files touched:
  - `frontend/src/state/hooks/sectionSizingPolicyDims.ts`
  - `frontend/src/state/hooks/sectionMinMaxDims.ts`
  - `frontend/src/state/hooks/sectionSizes.ts`
  - `frontend/src/state/hooks/sectionAspectRatioSizing.ts`
  - `frontend/src/state/hooks/sectionSizes.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/hooks/sectionSizes.test.tsx src/state/hooks/sectionSizes.integration.test.tsx src/state/hooks/sectionAspectRatioSizing.test.ts src/components/Utils/Resizable/CustomResizable.test.ts src/components/Section/Layouts/CodeArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/hooks/sectionSizingPolicyDims.ts src/state/hooks/sectionMinMaxDims.ts src/state/hooks/sectionSizes.ts src/state/hooks/sectionAspectRatioSizing.ts src/state/hooks/sectionSizes.test.tsx src/state/hooks/sectionSizes.integration.test.tsx src/components/Utils/Resizable/CustomResizable.test.ts src/components/Section/Layouts/CodeArea.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/hook ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `d8709ecfd4`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/stores/uiPreferenceStores.ts`, now the largest
    authored/shared state hotspot at 418 lines, by separating persisted UI
    preference normalization and defaults from the persisted store creation
    surface.

## 2026-03-15 06:55:54 PDT

- Slice completed: split UI preference persistence from UI preference stores
- Key files touched:
  - `frontend/src/state/stores/uiPreferenceState.ts`
  - `frontend/src/state/stores/uiPreferencePersistence.ts`
  - `frontend/src/state/stores/uiPreferenceStores.ts`
  - `frontend/src/state/stores/uiPreferencePersistence.test.ts`
  - `frontend/src/state/stores/uiPreferenceStores.test.ts`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/state/actions/localStorage.ts`
  - `frontend/src/components/AppHeader/EditMenu.tsx`
  - `frontend/src/components/Modals/SaveLoadModal/SaveLoadModal.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/stores/uiPreferencePersistence.test.ts src/state/stores/uiPreferenceStores.test.ts src/state/actions/localStorage.test.ts src/components/Panes/paneLayout.test.ts src/components/AppHeader/ProjectNav.test.tsx`
  - `pnpm -C frontend exec vitest run src/components/Modals/SaveLoadModal/SaveLoadModal.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/stores/uiPreferenceStores.ts src/state/stores/uiPreferencePersistence.ts src/state/stores/uiPreferenceState.ts src/state/stores/uiPreferenceStores.test.ts src/state/stores/uiPreferencePersistence.test.ts src/state/definitions.ts src/state/actions/localStorage.ts src/components/AppHeader/EditMenu.tsx src/components/Modals/SaveLoadModal/SaveLoadModal.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/store ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `7c6133cd26`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/definitions.ts`, now the largest
    authored/shared state hotspot at 404 lines, by separating local standalone
    store definitions from the remaining domain re-export barrel.

## 2026-03-15 07:05:06 PDT

- Slice completed: split local store definitions from the shared definitions barrel
- Key files touched:
  - `frontend/src/state/storeDefinitions.ts`
  - `frontend/src/state/storeDefinitions.test.ts`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/state/activeSectionUI.ts`
  - `frontend/src/state/subscriptions.ts`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ListOfArtifacts.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/storeDefinitions.test.ts src/state/activeSectionUI.test.ts src/state/hooks/sectionSizes.integration.test.tsx src/state/hooks/artifactTransport.test.ts src/forks/xyflow/minimap/MiniMapNodes.test.tsx src/state/actions/project/loadProject.test.ts src/state/actions/projectStateOptimisticUpdates.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/storeDefinitions.ts src/state/definitions.ts src/state/storeDefinitions.test.ts src/state/activeSectionUI.ts src/state/subscriptions.ts src/components/Panes/UiEditor/SectionConfig/ListOfArtifacts.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/store ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `a1555997b8`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/activeSectionUI.ts`, now the largest authored/shared
    state hotspot at 364 lines, by separating active-section selection reads or
    writes from backend sync ownership and reconciliation helpers.

## 2026-03-15 07:14:17 PDT

- Slice completed: split active-section selection ownership from backend sync
  ownership
- Key files touched:
  - `frontend/src/state/activeSectionSelection.ts`
  - `frontend/src/state/activeSectionBackendSync.ts`
  - `frontend/src/state/activeSectionSelection.test.ts`
  - `frontend/src/state/activeSectionUI.test.ts`
  - `frontend/src/state/activeSectionUI.ts`
  - `frontend/src/state/actions/activeSections.ts`
  - `frontend/src/state/actions/project/loadProject.ts`
  - `frontend/src/state/actions/sectionProjectStateSync.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/activeSectionSelection.test.ts src/state/activeSectionUI.test.ts src/state/actions/activeSections.test.ts src/state/actions/project/loadProject.test.ts src/state/actions/projectStateOptimisticUpdates.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/activeSectionSelection.ts src/state/activeSectionBackendSync.ts src/state/activeSectionUI.ts src/state/activeSectionSelection.test.ts src/state/activeSectionUI.test.ts src/state/actions/activeSections.ts src/state/actions/project/loadProject.ts src/state/actions/sectionProjectStateSync.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state ownership split and did
    not change frontend rendering behavior.
- Commit hash:
  - `a73b3a237`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/storeDefinitions.ts`, now the largest
    authored/shared hotspot at 338 lines, by separating atomic project-store
    publication helpers from the remaining local cross-feature Zustand store
    definitions.

## 2026-03-15 07:21:09 PDT

- Slice completed: extracted atomic project-store publication from local store
  definitions
- Key files touched:
  - `frontend/src/state/atomicProjectStorePublication.ts`
  - `frontend/src/state/atomicProjectStorePublication.test.ts`
  - `frontend/src/state/storeDefinitions.ts`
  - `frontend/src/state/storeDefinitions.test.ts`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/state/actions/project/loadProject.ts`
  - `frontend/src/state/actions/sectionProjectStateSync.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/atomicProjectStorePublication.test.ts src/state/storeDefinitions.test.ts src/state/actions/project/loadProject.test.ts src/state/actions/projectStateOptimisticUpdates.test.ts src/state/activeSectionUI.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/atomicProjectStorePublication.ts src/state/atomicProjectStorePublication.test.ts src/state/storeDefinitions.ts src/state/storeDefinitions.test.ts src/state/definitions.ts src/state/actions/project/loadProject.ts src/state/actions/sectionProjectStateSync.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/store ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `7d5bc49d3`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/utils/chatAppGeneration.ts`, now the largest
    authored/shared hotspot at 319 lines, by separating generation payload or
    app-definition derivation from the remaining publish and prompt helpers.

## 2026-03-15 07:27:21 PDT

- Slice completed: split chat app-generation detail ownership from agent-run
  hydration
- Key files touched:
  - `frontend/src/state/utils/chatAppGenerationDetails.ts`
  - `frontend/src/state/utils/chatAppGenerationAgentRuns.ts`
  - `frontend/src/state/utils/chatAppGeneration.ts`
  - `frontend/src/state/utils/chatAppGeneration.test.ts`
  - `frontend/src/state/actions/aiAgentRuns.ts`
  - `frontend/src/state/actions/aiHydrationApply.ts`
  - `frontend/src/state/actions/aiPendingChatAppGenerationState.ts`
  - `frontend/src/state/actions/aiPendingChatMessageState.ts`
  - `frontend/src/state/actions/aiChatSubmissionPayload.ts`
  - `frontend/src/state/actions/aiChatSubmission.ts`
  - `frontend/src/state/stores/aiStores.ts`
  - `frontend/src/components/Chat/ChatInput.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/utils/chatAppGeneration.test.ts src/state/actions/aiPendingChatAppGenerationState.test.ts src/state/actions/aiPendingChatState.test.ts src/state/actions/aiChatSubmissionPayload.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiWaitingForResponse.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/utils/chatAppGeneration.ts src/state/utils/chatAppGenerationDetails.ts src/state/utils/chatAppGenerationAgentRuns.ts src/state/utils/chatAppGeneration.test.ts src/state/actions/aiAgentRuns.ts src/state/actions/aiHydrationApply.ts src/state/actions/aiPendingChatAppGenerationState.ts src/state/actions/aiPendingChatMessageState.ts src/state/actions/aiChatSubmissionPayload.ts src/state/actions/aiChatSubmission.ts src/state/stores/aiStores.ts src/components/Chat/ChatInput.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state utility ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `189e704fd`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiLLMConfiguration.ts`, now the largest
    authored/shared hotspot at 306 lines, by separating LLM config load/save
    orchestration from managed API-key snapshot and conflict handling helpers.

## 2026-03-15 07:44:07 PDT

- Slice completed: split managed API-key ownership out of
  `frontend/src/state/actions/aiLLMConfiguration.ts`
- Key files touched:
  - `frontend/src/state/actions/aiManagedApiKeys.ts`
  - `frontend/src/state/actions/aiLLMConfiguration.ts`
  - `frontend/src/state/actions/aiConfiguration.ts`
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/state/actions/aiSaveLLMApiKeys.test.ts`
  - `frontend/src/state/actions/aiResourceLoadGuards.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateLLMState.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiSaveLLMConfig.test.ts src/state/actions/aiSaveLLMApiKeys.test.ts src/state/actions/aiResourceLoadGuards.test.ts src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiManagedApiKeys.ts src/state/actions/aiLLMConfiguration.ts src/state/actions/aiConfiguration.ts src/state/actions/websocketIncomingMessages.ts src/state/actions/aiSaveLLMApiKeys.test.ts src/state/actions/aiSaveLLMConfig.test.ts src/state/actions/aiResourceLoadGuards.test.ts src/components/Panes/Overview/ProjectLevelAI/useHydrateLLMState.ts src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `83882a9f5dea07e2c6686b850a1aea6fa9cb352b`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiFollow.ts`, now the largest
    authored/shared hotspot at 304 lines, by separating tool-argument snapshot
    reads or writes from result-highlight and scope-violation timeout
    orchestration.

## 2026-03-15 07:55:50 PDT

- Slice completed: split AI-follow tool-argument snapshot ownership from
  tool-result highlight and scope-violation timeout orchestration
- Key files touched:
  - `frontend/src/state/actions/aiFollowToolArguments.ts`
  - `frontend/src/state/actions/aiFollowHighlights.ts`
  - `frontend/src/state/actions/aiFollow.ts`
  - `frontend/src/state/actions/aiFollowToolArguments.test.ts`
  - `frontend/src/state/actions/aiFollowHighlights.test.ts`
  - `frontend/src/state/actions/aiChatStopState.ts`
  - `frontend/src/state/actions/aiChatStreamingRouting.ts`
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/state/actions/websocketReceive.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiFollowToolArguments.test.ts src/state/actions/aiFollowHighlights.test.ts src/state/actions/aiChatStopState.test.ts src/state/actions/aiChatStreamingRouting.test.ts src/state/actions/websocketBootstrap.test.ts src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiFollow.ts src/state/actions/aiFollowToolArguments.ts src/state/actions/aiFollowHighlights.ts src/state/actions/aiFollowToolArguments.test.ts src/state/actions/aiFollowHighlights.test.ts src/state/actions/aiChatStopState.ts src/state/actions/aiChatStreamingRouting.ts src/state/actions/websocketIncomingMessages.ts src/state/actions/websocketReceive.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `5cbd7ae43c5fc967fc459ead74695d7d46dd1f99`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/keyActivationHandlers.ts`, now the
    largest authored/shared hotspot at 302 lines, by separating keybinding
    registration or teardown grouping from runtime activation dispatch.

## 2026-03-15 08:03:33 PDT

- Slice completed: split shortcut command ownership from keyboard-event
  dispatch in the key activation surface
- Key files touched:
  - `frontend/src/state/actions/keyActivationCommands.ts`
  - `frontend/src/state/actions/keyActivationCommands.test.ts`
  - `frontend/src/state/actions/keyActivationHandlers.ts`
  - `frontend/src/state/actions/keyShortcutRegistrationGroups.ts`
  - `frontend/src/state/actions/keyShortcutRegistrations.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/keyActivationCommands.test.ts src/state/actions/keyActivationHandlers.test.ts src/state/actions/keyActivations.test.ts src/state/actions/keyShortcutRegistrationGroups.test.ts src/state/actions/keyShortcutRegistrations.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/keyActivationCommands.ts src/state/actions/keyActivationCommands.test.ts src/state/actions/keyActivationHandlers.ts src/state/actions/keyActivationHandlers.test.ts src/state/actions/keyActivations.test.ts src/state/actions/keyShortcutRegistrationGroups.ts src/state/actions/keyShortcutRegistrationGroups.test.ts src/state/actions/keyShortcutRegistrations.ts src/state/actions/keyShortcutRegistrations.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `9a7a833d4fb18dd0ca97bfeca077c5bdfa3630c6`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiTranscription.ts`, now the largest
    authored/shared hotspot at 301 lines, by separating audio decode/resample
    and chunk preparation from provider upload orchestration.

## 2026-03-15 08:13:10 PDT

- Slice completed: split transcription audio preparation from provider upload
  orchestration
- Key files touched:
  - `frontend/src/state/actions/aiTranscriptionAudio.ts`
  - `frontend/src/state/actions/aiTranscriptionUpload.ts`
  - `frontend/src/state/actions/aiTranscription.ts`
  - `frontend/src/state/actions/aiTranscribeChatAudio.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiTranscribeChatAudio.test.ts src/state/actions/aiTranscriptionSessions.test.ts src/state/actions/aiTranscriptionProfiles.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Section/Layouts/ChatArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiTranscription.ts src/state/actions/aiTranscriptionAudio.ts src/state/actions/aiTranscriptionUpload.ts src/state/actions/aiTranscribeChatAudio.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Section/Layouts/ChatArea.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `fc11396bb0f3bd2bdead248124b395fb38c78f3f`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowingEphemeral.ts`, now
    the largest authored/shared hotspot at 299 lines, by separating ephemeral
    instance-key or tracked-window ownership from embedded git-pane visibility
    pruning and reconciliation.

## 2026-03-15 08:24:06 PDT

- Slice completed: split project chat windowing ephemeral key, tracked-window,
  and embedded git-pane visibility ownership
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowingEphemeralKeys.ts`
  - `frontend/src/state/actions/projectChatWindowingTrackedGitPaneState.ts`
  - `frontend/src/state/actions/projectChatWindowingEmbeddedPaneVisibility.ts`
  - `frontend/src/state/actions/projectChatWindowingEphemeral.ts`
  - `frontend/src/state/actions/projectChatWindowingTrackedGitPane.ts`
  - `frontend/src/state/actions/projectChatWindowLifecycleCommands.ts`
  - `frontend/src/state/actions/projectChatWindowLayoutCommands.ts`
  - `frontend/src/state/actions/projectChatWindowingWriteState.ts`
  - `frontend/src/state/actions/projectChatWindowingWrites.ts`
  - `frontend/src/state/actions/windowSpaceSnapshotCapture.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreVisibility.ts`
  - `frontend/src/components/Git/GitGraphWindowContent.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/state/actions/projectChatWindowingTrackedGitPaneState.test.ts`
  - `frontend/src/state/actions/projectChatWindowingEmbeddedPaneVisibility.test.ts`
  - `frontend/src/components/Git/GitGraphWindowContent.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowingTrackedGitPaneState.test.ts src/state/actions/projectChatWindowingEmbeddedPaneVisibility.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/project/loadProject.test.ts src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/state/actions/windowSpaceWorkspaceRestoreVisibility.test.ts src/state/actions/windowSpaces.test.ts src/components/Git/GitGraphWindowContent.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowingEphemeral.ts src/state/actions/projectChatWindowingEphemeralKeys.ts src/state/actions/projectChatWindowingTrackedGitPaneState.ts src/state/actions/projectChatWindowingEmbeddedPaneVisibility.ts src/state/actions/projectChatWindowingTrackedGitPaneState.test.ts src/state/actions/projectChatWindowingEmbeddedPaneVisibility.test.ts src/state/actions/projectChatWindowingTrackedGitPane.ts src/state/actions/projectChatWindowLifecycleCommands.ts src/state/actions/projectChatWindowLayoutCommands.ts src/state/actions/projectChatWindowingWriteState.ts src/state/actions/projectChatWindowingWrites.ts src/state/actions/windowSpaceSnapshotCapture.ts src/state/actions/windowSpaceWorkspaceRestoreVisibility.ts src/components/Git/GitGraphWindowContent.tsx src/components/Git/GitGraphWindowContent.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `127dbbc7217997316b8ee5dceda515dec72be025`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatSubmissionPayload.ts`, now the
    largest authored/shared hotspot at 297 lines, by separating shared
    user-message/request-payload assembly from app-generation and edited-chat
    submission coordination.

## 2026-03-15 08:32:59 PDT

- Slice completed: split shared chat-submission request payload assembly from
  app-generation and edited-message preparation
- Key files touched:
  - `frontend/src/state/actions/aiChatSubmissionRequestPayload.ts`
  - `frontend/src/state/actions/aiChatSubmissionRequestPayload.test.ts`
  - `frontend/src/state/actions/aiChatSubmissionPayload.ts`
  - `frontend/src/state/actions/aiChatSubmission.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiChatSubmissionRequestPayload.test.ts src/state/actions/aiChatSubmissionPayload.test.ts src/state/actions/aiChatSubmissionEngineResolution.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatSubmission.ts src/state/actions/aiChatSubmissionPayload.ts src/state/actions/aiChatSubmissionRequestPayload.ts src/state/actions/aiChatSubmissionPayload.test.ts src/state/actions/aiChatSubmissionRequestPayload.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `0c172521f139e4c697d27e768d913215456bfbfc`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/keyShortcutRegistrationGroups.ts`, now
    the largest authored/shared hotspot at 294 lines, by separating focus or
    pane-navigation registrations from project or canvas interaction shortcut
    groups.

## 2026-03-15 08:40:14 PDT

- Slice completed: split key shortcut registration ownership by navigation,
  tooltip, and workspace command domains
- Key files touched:
  - `frontend/src/state/actions/keyShortcutNavigationRegistrations.ts`
  - `frontend/src/state/actions/keyShortcutTooltipRegistrations.ts`
  - `frontend/src/state/actions/keyShortcutWorkspaceRegistrations.ts`
  - `frontend/src/state/actions/keyShortcutRegistrationGroups.ts`
  - `frontend/src/state/actions/keyShortcutRegistrations.ts`
  - `frontend/src/state/actions/keyShortcutNavigationRegistrations.test.ts`
  - `frontend/src/state/actions/keyShortcutTooltipRegistrations.test.ts`
  - `frontend/src/state/actions/keyShortcutWorkspaceRegistrations.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/keyShortcutNavigationRegistrations.test.ts src/state/actions/keyShortcutTooltipRegistrations.test.ts src/state/actions/keyShortcutWorkspaceRegistrations.test.ts src/state/actions/keyShortcutRegistrations.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/keyShortcutNavigationRegistrations.ts src/state/actions/keyShortcutTooltipRegistrations.ts src/state/actions/keyShortcutWorkspaceRegistrations.ts src/state/actions/keyShortcutRegistrationGroups.ts src/state/actions/keyShortcutRegistrations.ts src/state/actions/keyShortcutNavigationRegistrations.test.ts src/state/actions/keyShortcutTooltipRegistrations.test.ts src/state/actions/keyShortcutWorkspaceRegistrations.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `254997d76f2a1ba61e5338ca8ab95a6d6837f394`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/gitGraphLoadState.ts`, now the largest
    authored/shared hotspot at 294 lines, by separating initial-load request
    state and stale-request guards from incremental pagination merge or
    load-more error handling.

## 2026-03-15 08:50:41 PDT

- Slice completed: split git-graph refresh, pagination, filter, and request
  tracking ownership
- Key files touched:
  - `frontend/src/state/actions/gitGraphRefreshState.ts`
  - `frontend/src/state/actions/gitGraphPaginationState.ts`
  - `frontend/src/state/actions/gitGraphFilterState.ts`
  - `frontend/src/state/actions/gitGraphRequestTracker.ts`
  - `frontend/src/state/actions/gitGraphLoadState.ts`
  - `frontend/src/state/actions/gitGraphOverlayActions.ts`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/state/actions/git.test.ts`
  - `frontend/src/state/actions/gitGraphRefreshState.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/gitGraphRefreshState.test.ts src/state/actions/git.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/gitGraphFilterState.ts src/state/actions/gitGraphRequestTracker.ts src/state/actions/gitGraphRefreshState.ts src/state/actions/gitGraphPaginationState.ts src/state/actions/gitGraphLoadState.ts src/state/actions/gitGraphRefreshState.test.ts src/state/actions/gitGraphOverlayActions.ts src/state/actions/git.test.ts src/components/Git/GitGraphOverlay.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `4c47954b7c00aef02e5f95486fe0a526b65ec335`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/uiSettingRevealExecution.ts`, now the
    largest authored/shared hotspot at 287 lines, by separating mutation-lease
    execution from plugin-handler timeout polling and fallback anchor
    lookup/highlighting.

## 2026-03-15 08:58:00 PDT

- Slice completed: split UI-setting reveal execution into orchestration,
  plugin-handler, and fallback-anchor owners
- Key files touched:
  - `frontend/src/state/actions/uiSettingRevealExecution.ts`
  - `frontend/src/state/actions/uiSettingRevealPluginHandler.ts`
  - `frontend/src/state/actions/uiSettingRevealFallbackAnchor.ts`
  - `frontend/src/state/actions/uiSettingRevealPluginHandler.test.ts`
  - `frontend/src/state/actions/uiSettingRevealFallbackAnchor.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/uiSettingRevealPluginHandler.test.ts src/state/actions/uiSettingRevealFallbackAnchor.test.ts src/state/actions/uiSettingRevealDom.test.ts src/state/actions/uiSettingReveal.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/uiSettingRevealExecution.ts src/state/actions/uiSettingRevealPluginHandler.ts src/state/actions/uiSettingRevealFallbackAnchor.ts src/state/actions/uiSettingRevealPluginHandler.test.ts src/state/actions/uiSettingRevealFallbackAnchor.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `93e1d7ce3557ed9f1c1641a24250de8280378cc1`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/keyActivations.ts`, now the largest
    authored/shared hotspot at 286 lines, by separating pressed-key
    bookkeeping or stale-key cleanup from listener attachment and shortcut-info
    normalization.

## 2026-03-15 09:05:12 PDT

- Slice completed: split key activation listener wiring from pressed-key and
  shortcut-info owners
- Key files touched:
  - `frontend/src/state/actions/keyActivations.ts`
  - `frontend/src/state/actions/keyActivationPressedKeys.ts`
  - `frontend/src/state/actions/keyActivationShortcutInfo.ts`
  - `frontend/src/state/actions/keyActivationPressedKeys.test.ts`
  - `frontend/src/state/actions/keyActivationShortcutInfo.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/keyActivationPressedKeys.test.ts src/state/actions/keyActivationShortcutInfo.test.ts src/state/actions/keyActivations.test.ts src/state/actions/keyShortcutRegistrations.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/keyActivations.ts src/state/actions/keyActivationPressedKeys.ts src/state/actions/keyActivationShortcutInfo.ts src/state/actions/keyActivationPressedKeys.test.ts src/state/actions/keyActivationShortcutInfo.test.ts src/state/actions/keyActivations.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `a96c6b078a493dca0e3c95db78ddb4152ed95d30`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatStreamingRouting.ts`, now the
    largest authored/shared hotspot at 278 lines, by separating chunk-context
    or chat-id lookup resolution from per-chunk section persistence,
    tool-preview cleanup, and scope-violation notification handling.

## 2026-03-15 09:13:59 PDT

- Slice completed: split AI chat streaming routing into chunk-context and
  section-routing owners
- Key files touched:
  - `frontend/src/state/actions/aiChatStreamingChunkContext.ts`
  - `frontend/src/state/actions/aiChatStreamingSectionRouting.ts`
  - `frontend/src/state/actions/aiChatStreamingRouting.ts`
  - `frontend/src/state/actions/aiChatStreaming.ts`
  - `frontend/src/state/actions/aiChatStreamingChunkContext.test.ts`
  - `frontend/src/state/actions/aiChatStreamingSectionRouting.test.ts`
  - `frontend/src/state/actions/aiSectionStreaming.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiChatStreamingChunkContext.test.ts src/state/actions/aiChatStreamingSectionRouting.test.ts src/state/actions/aiSectionStreaming.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatStreaming.ts src/state/actions/aiChatStreamingRouting.ts src/state/actions/aiChatStreamingChunkContext.ts src/state/actions/aiChatStreamingSectionRouting.ts src/state/actions/aiChatStreamingChunkContext.test.ts src/state/actions/aiChatStreamingSectionRouting.test.ts src/state/actions/aiSectionStreaming.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `cfc51918bfb9852ff3f40a9473ce5f42e9966375`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatSubmission.ts`, now the largest
    authored/shared hotspot at 268 lines, by separating shared response-send
    plus hydration-refresh handling from pending-chat lifecycle orchestration
    and edited-section chatId reset or restore behavior.

## 2026-03-15 09:15:00 PDT

- Correction:
  - The slice commit hash for the AI chat streaming routing split is
    `cfc51918b3f393425e1cd8494b7cda2c9dcc1eae`.

## 2026-03-15 09:28:03 PDT

- Slice completed: split AI chat submission into message, edit, and response
  owners
- Key files touched:
  - `frontend/src/state/actions/aiChatSubmission.ts`
  - `frontend/src/state/actions/aiChatSubmissionMessages.ts`
  - `frontend/src/state/actions/aiChatSubmissionEdits.ts`
  - `frontend/src/state/actions/aiChatSubmissionResponse.ts`
  - `frontend/src/state/actions/aiSubmitMessage.test.ts`
  - `frontend/src/state/actions/aiEditedMessage.test.ts`
  - `frontend/src/state/actions/aiWebsocketAffinitySubmit.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiWebsocketAffinitySubmit.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Section/Layouts/ChatArea.test.tsx src/state/actions/aiChatPromotion.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiChatSubmission.ts src/state/actions/aiChatSubmissionResponse.ts src/state/actions/aiChatSubmissionMessages.ts src/state/actions/aiChatSubmissionEdits.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiWebsocketAffinitySubmit.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx src/components/Section/Layouts/ChatArea.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `45ab04360f322a3bfbeea1539b57be30adc2c666`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/gitGraphPaginationState.ts`, now the
    largest authored/shared hotspot at 204 lines, by separating load-more
    request gating from appended-page merge or load-more error-state writes.

## 2026-03-15 09:35:52 PDT

- Slice completed: split git graph pagination into request and result owners
- Key files touched:
  - `frontend/src/state/actions/gitGraphPaginationState.ts`
  - `frontend/src/state/actions/gitGraphPaginationRequests.ts`
  - `frontend/src/state/actions/gitGraphPaginationResults.ts`
  - `frontend/src/state/actions/gitGraphPaginationResults.test.ts`
  - `frontend/src/state/actions/git.test.ts`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-cleanup-execution-log.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/gitGraphPaginationResults.test.ts src/state/actions/gitGraphRefreshState.test.ts src/state/actions/git.test.ts src/components/Git/GitGraphOverlay.test.ts src/components/Git/GitGraphWindowContent.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/gitGraphPaginationState.ts src/state/actions/gitGraphPaginationRequests.ts src/state/actions/gitGraphPaginationResults.ts src/state/actions/gitGraphPaginationResults.test.ts src/state/actions/git.test.ts src/components/Git/GitGraphOverlay.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `6dfd04385ea50c355221ccbcf32df032f1ba9b8d`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/uiSettingRevealMutations.ts`, now the
    largest authored/shared hotspot at 187 lines, by separating reveal
    mutation lock or lease lifecycle from active-section or pane activation
    orchestration and mismatch/failure-result assembly.

## 2026-03-15 09:45:48 PDT

- Slice completed: split UI setting reveal mutation locking, apply flow, and
  lease lifecycle ownership
- Key files touched:
  - `frontend/src/state/actions/uiSettingRevealMutations.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationApply.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationLeaseLifecycle.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationLock.ts`
  - `frontend/src/state/actions/uiSettingRevealMutationLock.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/uiSettingRevealMutationLock.test.ts src/state/actions/uiSettingReveal.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/uiSettingRevealMutations.ts src/state/actions/uiSettingRevealMutationApply.ts src/state/actions/uiSettingRevealMutationLeaseLifecycle.ts src/state/actions/uiSettingRevealMutationLock.ts src/state/actions/uiSettingRevealMutationLock.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
  - `pnpm -C frontend exec tsc --noEmit` failed due unrelated pre-existing repo
    type errors (for example in `src/components/App/appRegistry.tsx`,
    `src/components/App/AppRenderer.policy.test.tsx`, and
    `src/utils/generatedEndpoints.ts`)
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `f672dc7a77e3ecedb7394fea61a90bdde7df3362`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/share.ts` into share-session
    storage/cache/bootstrap ownership and share project-config
    loading/retry transport so deployment session wiring stops sharing a single
    action surface.

## 2026-03-15 09:51:03 PDT

- Slice completed: split share-session bootstrap/cache from share
  project-config load/retry transport
- Key files touched:
  - `frontend/src/state/actions/share.ts`
  - `frontend/src/state/actions/shareSessionState.ts`
  - `frontend/src/state/actions/shareProjectConfig.ts`
  - `frontend/src/state/actions/shareSessionState.test.ts`
  - `frontend/src/state/actions/shareProjectConfig.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/shareSessionState.test.ts src/state/actions/shareProjectConfig.test.ts src/state/actions/websocketShareSessionRecovery.test.ts`
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectConfigs.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/share.ts src/state/actions/shareSessionState.ts src/state/actions/shareProjectConfig.ts src/state/actions/shareSessionState.test.ts src/state/actions/shareProjectConfig.test.ts src/state/actions/websocketShareSessionRecovery.test.ts src/components/Panes/Overview/ProjectConfigs.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `6ec9522e01d21b9de93236507647332ce46d5729`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/activeSections.ts` so backend sync
    scheduling/flush transport stops living beside high-level selection
    commands such as clear, prune, select-all, and top-level activation.

## 2026-03-15 09:55:11 PDT

- Slice completed: split active-section durable sync from high-level selection
  commands
- Key files touched:
  - `frontend/src/state/actions/activeSections.ts`
  - `frontend/src/state/actions/activeSectionSync.ts`
  - `frontend/src/state/actions/activeSectionCommands.ts`
  - `frontend/src/state/actions/activeSectionCommands.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/activeSections.test.ts src/state/actions/activeSectionCommands.test.ts src/state/actions/activeSectionController.test.ts src/state/actions/project/loadProject.test.ts src/state/actions/uiSettingReveal.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/activeSections.ts src/state/actions/activeSectionSync.ts src/state/actions/activeSectionCommands.ts src/state/actions/activeSectionCommands.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `49cfe3c1e592294d29b0ac05ab5fb3a186ab8668`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiPendingChatMessageState.ts` so pending
    chat initialization/clear flows stop living beside optimistic
    apply/commit/rollback message mutations and app-generation detail merges.

## 2026-03-15 10:01:40 PDT

- Slice completed: split pending chat lifecycle from optimistic message
  mutations
- Key files touched:
  - `frontend/src/state/actions/aiPendingChatMessageState.ts`
  - `frontend/src/state/actions/aiPendingChatMessageLifecycle.ts`
  - `frontend/src/state/actions/aiPendingChatMessageMutations.ts`
  - `frontend/src/state/actions/aiPendingChatMessageMutations.test.ts`
  - `frontend/src/state/actions/aiPendingChatState.ts`
  - `frontend/src/state/actions/aiPendingChatState.test.ts`
  - `frontend/src/state/actions/aiChatSubmission.ts`
  - `frontend/src/state/actions/aiChatSubmissionMessages.ts`
  - `frontend/src/state/actions/aiChatSubmissionEdits.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiPendingChatState.test.ts src/state/actions/aiPendingChatMessageMutations.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiChatPromotion.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiPendingChatMessageState.ts src/state/actions/aiPendingChatMessageLifecycle.ts src/state/actions/aiPendingChatMessageMutations.ts src/state/actions/aiPendingChatMessageMutations.test.ts src/state/actions/aiPendingChatState.ts src/state/actions/aiPendingChatState.test.ts src/state/actions/aiChatSubmission.ts src/state/actions/aiChatSubmissionMessages.ts src/state/actions/aiChatSubmissionEdits.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `493963ba99d13bf93e5f9ece7a7099d8923a8f58`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiManagedApiKeys.ts` so snapshot reads,
    load/reset flows, and persistence or conflict handling stop living in one
    shared file.

## 2026-03-15 10:07:41 PDT

- Slice completed: split managed API-key snapshot/load state from persistence
  handling
- Key files touched:
  - `frontend/src/state/actions/aiManagedApiKeys.ts`
  - `frontend/src/state/actions/aiManagedApiKeyState.ts`
  - `frontend/src/state/actions/aiManagedApiKeyPersistence.ts`
  - `frontend/src/state/actions/aiLLMConfiguration.ts`
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/state/actions/aiSaveLLMApiKeys.test.ts`
  - `frontend/src/state/actions/aiResourceLoadGuards.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateLLMState.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiSaveLLMApiKeys.test.ts src/state/actions/aiResourceLoadGuards.test.ts src/state/actions/aiSaveLLMConfig.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiManagedApiKeys.ts src/state/actions/aiManagedApiKeyState.ts src/state/actions/aiManagedApiKeyPersistence.ts src/state/actions/aiLLMConfiguration.ts src/state/actions/websocketIncomingMessages.ts src/state/actions/aiSaveLLMApiKeys.test.ts src/state/actions/aiResourceLoadGuards.test.ts src/components/Panes/Overview/ProjectLevelAI/useHydrateLLMState.ts src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `7c1bb0eaf1fbbdef00fa23d152e3056b9640756e`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sections/moveSectionState.ts` so move
    planning and local section-tree updates stop living beside backend
    persistence orchestration.

## 2026-03-15 10:12:53 PDT

- Slice completed: split section move parent cleanup from pane state updates
- Key files touched:
  - `frontend/src/state/actions/sections/moveSectionState.ts`
  - `frontend/src/state/actions/sections/moveSectionParentState.ts`
  - `frontend/src/state/actions/sections/moveSectionPaneState.ts`
  - `frontend/src/state/actions/sections/moveSectionState.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-sections-and-params-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sections/moveSectionState.test.ts src/state/actions/sections/moveSections.test.ts src/state/actions/sections/moveSectionQueries.test.ts src/state/actions/sections/topLevelLayoutPersistence.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sections/moveSectionState.ts src/state/actions/sections/moveSectionParentState.ts src/state/actions/sections/moveSectionPaneState.ts src/state/actions/sections/moveSectionState.test.ts src/state/actions/sections/moveSections.ts src/state/actions/sections/moveSections.test.ts src/state/actions/sections/moveSectionQueries.test.ts src/state/actions/sections/topLevelLayoutPersistence.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md ../docs/plans/frontend-sections-and-params-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `b380696b527d0a5d9f92d81436a4be69f9bb31b8`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiHydrationApply.ts` so snapshot apply
    reducers stop living beside hydration route handling and shared side-effect
    orchestration.

## 2026-03-15 10:18:18 PDT

- Slice completed: split hydration chat state from section persistence sync
- Key files touched:
  - `frontend/src/state/actions/aiHydrationApply.ts`
  - `frontend/src/state/actions/aiHydrationChatState.ts`
  - `frontend/src/state/actions/aiHydrationSectionState.ts`
  - `frontend/src/state/actions/aiHydrationChatState.test.ts`
  - `frontend/src/state/actions/aiHydrationSectionState.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/aiHydrationChatState.test.ts src/state/actions/aiHydrationSectionState.test.ts src/state/actions/aiHydrationOutcome.test.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiSectionStateSync.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/aiHydration.ts src/state/actions/aiHydrationApply.ts src/state/actions/aiHydrationChatState.ts src/state/actions/aiHydrationSectionState.ts src/state/actions/aiHydrationChatState.test.ts src/state/actions/aiHydrationSectionState.test.ts src/state/actions/aiHydrationOutcome.ts src/state/actions/aiWaitingForResponse.test.ts src/state/actions/aiSectionStateSync.test.ts src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `354aafbd0071c97d687ae5d24190c464ea4d6a61`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/agenticEdgeMutations.ts` so edge-shape
    reducers stop living beside optimistic persistence and selection flows.

## 2026-03-15 10:24:15 PDT

- Slice completed: split agentic-edge shape mutations from selection/delete
  flows
- Key files touched:
  - `frontend/src/state/actions/agenticEdgeMutations.ts`
  - `frontend/src/state/actions/agenticEdgeShapeMutations.ts`
  - `frontend/src/state/actions/agenticEdgeSelectionMutations.ts`
  - `frontend/src/state/actions/agenticEdgeSelectionMutations.test.ts`
  - `frontend/src/state/actions/agenticEdges.test.ts`
  - `frontend/src/state/actions/chatSharedEdges.ts`
  - `frontend/src/state/actions/keyActivationCommands.ts`
  - `frontend/src/state/actions/keyActivationCommands.test.ts`
  - `frontend/src/components/Section/Container/AgenticEdgeHandles.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - `frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/agenticEdges.test.ts src/state/actions/agenticEdgeSelectionMutations.test.ts src/state/actions/chatSharedEdges.test.ts src/state/actions/keyActivationCommands.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/agenticEdgeMutations.ts src/state/actions/agenticEdgeShapeMutations.ts src/state/actions/agenticEdgeSelectionMutations.ts src/state/actions/agenticEdgeSelectionMutations.test.ts src/state/actions/agenticEdges.test.ts src/state/actions/chatSharedEdges.ts src/state/actions/keyActivationCommands.ts src/state/actions/keyActivationCommands.test.ts src/components/Section/Container/AgenticEdgeHandles.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `473bed15ae6c180144ad6875206fcb361ca06cb8`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/params/moveParams.ts` so param move
    planning and local param-tree updates stop living beside backend
    persistence orchestration.

## 2026-03-15 10:29:27 PDT

- Slice completed: split param move commands from keyboard move planning
- Key files touched:
  - `frontend/src/state/actions/params/moveParams.ts`
  - `frontend/src/state/actions/params/paramSelectionCommands.ts`
  - `frontend/src/state/actions/params/paramMoveCommands.ts`
  - `frontend/src/state/actions/params/paramMoveKeyboardCommands.ts`
  - `frontend/src/state/actions/params/moveParams.test.ts`
  - `frontend/src/components/Params/ParamDndMonitor.tsx`
  - `frontend/src/state/actions/keyActivationCommands.ts`
  - `frontend/src/state/actions/keyActivationHandlers.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-sections-and-params-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/params/moveParams.test.ts src/state/actions/keyActivationCommands.test.ts src/state/actions/keyActivationHandlers.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/params/moveParams.ts src/state/actions/params/paramSelectionCommands.ts src/state/actions/params/paramMoveCommands.ts src/state/actions/params/paramMoveKeyboardCommands.ts src/state/actions/params/moveParams.test.ts src/state/actions/keyActivationCommands.ts src/state/actions/keyActivationHandlers.ts src/components/Params/ParamDndMonitor.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-sections-and-params-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `67590124716baf9252854c3b876689ede986be1c`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/chatBranches.ts` so branch
    initialization or message-sync logic stops living beside edited-message
    branch creation and branch-index derivation helpers.

## 2026-03-15 10:33:37 PDT

- Slice completed: split chat branch state from edit and index helpers
- Key files touched:
  - `frontend/src/state/actions/chatBranches.ts`
  - `frontend/src/state/actions/chatBranchState.ts`
  - `frontend/src/state/actions/chatBranchEditing.ts`
  - `frontend/src/state/actions/chatBranchIndexState.ts`
  - `frontend/src/state/actions/chatBranchState.test.ts`
  - `frontend/src/state/actions/chatBranches.test.ts`
  - `frontend/src/state/actions/aiChatSubmissionPayload.ts`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/chatBranches.test.ts src/state/actions/chatBranchState.test.ts src/state/actions/aiChatSubmissionPayload.test.ts`
  - `pnpm -C frontend exec vitest run src/components/Section/Layouts/ChatArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/chatBranches.ts src/state/actions/chatBranchState.ts src/state/actions/chatBranchEditing.ts src/state/actions/chatBranchIndexState.ts src/state/actions/chatBranches.test.ts src/state/actions/chatBranchState.test.ts src/state/actions/aiChatSubmissionPayload.ts src/state/actions/aiChatSubmissionPayload.test.ts src/components/Section/Layouts/ChatArea.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `93a289bbf41c140ce9e842e64aca760c7ffd3765`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/websocketRealtime.ts` so literal and
    dependency-event sends stop living beside binary-upload fallback,
    oversize-warning throttling, and payload upload helpers.

## 2026-03-15 10:40:09 PDT

- Slice completed: split websocket realtime dispatch from binary upload
  fallback
- Key files touched:
  - `frontend/src/state/actions/websocketRealtime.ts`
  - `frontend/src/state/actions/websocketRealtimeDispatch.ts`
  - `frontend/src/state/actions/websocketRealtimeBinary.ts`
  - `frontend/src/state/actions/websocketRealtimeDispatch.test.ts`
  - `frontend/src/state/actions/websocketRealtimeBinary.test.ts`
  - `frontend/src/plugins/runtime.ts`
  - `frontend/src/plugins/runtime.test.ts`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Params/ParamItems/ParamInput.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/components/Section/Layouts/MetaControlArea.tsx`
  - `frontend/src/components/Section/Layouts/DrawArea/useRealtimeDrawEmitter.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/websocketRealtimeDispatch.test.ts src/state/actions/websocketRealtimeBinary.test.ts src/state/actions/websocketReceive.test.ts src/plugins/runtime.test.ts src/components/Section/Layouts/ChatArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/websocketRealtime.ts src/state/actions/websocketRealtimeDispatch.ts src/state/actions/websocketRealtimeBinary.ts src/state/actions/websocketRealtimeDispatch.test.ts src/state/actions/websocketRealtimeBinary.test.ts src/state/actions/websocketReceive.ts src/state/actions/websocketReceive.test.ts src/plugins/runtime.ts src/plugins/runtime.test.ts src/components/App/appRegistry.tsx src/components/Params/ParamItems/ParamInput.tsx src/components/Section/Layouts/ChatArea.tsx src/components/Section/Layouts/ChatArea.test.tsx src/components/Section/Layouts/MetaControlArea.tsx src/components/Section/Layouts/DrawArea/useRealtimeDrawEmitter.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `a106a5f9f060b9190dbf6ba9dff6a2721e842a4a`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sections/createSectionCatalogStatic.ts`
    so static section-family definitions stop living beside metacontrol/embed
    config defaults and top-level group assembly.

## 2026-03-15 10:45:17 PDT

- Slice completed: split section catalog defaults from group assembly
- Key files touched:
  - `frontend/src/state/actions/sections/createSectionCatalogStatic.ts`
  - `frontend/src/state/actions/sections/createSectionCatalogSectionGroups.ts`
  - `frontend/src/state/actions/sections/createSectionCatalogControlGroups.ts`
  - `frontend/src/state/actions/sections/createSectionCatalogGroupAssembly.ts`
  - `frontend/src/state/actions/sections/createSectionCatalog.ts`
  - `frontend/src/state/actions/sections/createSectionCatalogStatic.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-sections-and-params-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sections/createSectionCatalogStatic.test.tsx src/state/actions/sections/createSectionCatalog.test.tsx src/state/actions/sections/createSectionsHelper.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/sections/createSectionCatalogStatic.ts src/state/actions/sections/createSectionCatalog.ts src/state/actions/sections/createSectionCatalogSectionGroups.ts src/state/actions/sections/createSectionCatalogControlGroups.ts src/state/actions/sections/createSectionCatalogGroupAssembly.ts src/state/actions/sections/createSectionCatalogStatic.test.tsx src/state/actions/sections/createSectionCatalog.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-sections-and-params-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `5c00b3c3e61e5e4ff45e78a5e755d378b4d99b5d`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowingState.ts` so
    section binding/title-chatId reducers stop living beside section/canvas
    transition helpers.

## 2026-03-15 10:50:27 PDT

- Slice completed: split project chat windowing section and metadata state
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowingState.ts`
  - `frontend/src/state/actions/projectChatWindowingSectionState.ts`
  - `frontend/src/state/actions/projectChatWindowingMetadataState.ts`
  - `frontend/src/state/actions/projectChatWindowingMetadataState.test.ts`
  - `frontend/src/state/actions/projectChatWindowSectionCommands.ts`
  - `frontend/src/state/actions/projectChatWindowMetadataCommands.ts`
  - `frontend/src/state/actions/projectChatWindowingCanvasBoot.ts`
  - `frontend/src/state/actions/projectChatWindowingTrackedGitPane.ts`
  - `frontend/src/state/actions/projectChatWindowing.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowingMetadataState.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowingState.ts src/state/actions/projectChatWindowingSectionState.ts src/state/actions/projectChatWindowingMetadataState.ts src/state/actions/projectChatWindowingMetadataState.test.ts src/state/actions/projectChatWindowSectionCommands.ts src/state/actions/projectChatWindowMetadataCommands.ts src/state/actions/projectChatWindowingCanvasBoot.ts src/state/actions/projectChatWindowingTrackedGitPane.ts src/state/actions/projectChatWindowing.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `34dad359c80886d374045f72327717e819b216e8`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/websocketLifecycle.ts` so websocket
    connection lifecycle, reconnect timing, and listener/status coordination
    stop living in one shared file.

## 2026-03-15 10:54:49 PDT

- Slice completed: split websocket lifecycle state from handlers
- Key files touched:
  - `frontend/src/state/actions/websocketLifecycle.ts`
  - `frontend/src/state/actions/websocketLifecycleHandlers.ts`
  - `frontend/src/state/actions/websocketLifecycleState.ts`
  - `frontend/src/state/actions/websocketLifecycleState.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/websocketReceive.test.ts src/state/actions/websocketLifecycleState.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/websocketLifecycle.ts src/state/actions/websocketLifecycleHandlers.ts src/state/actions/websocketLifecycleState.ts src/state/actions/websocketLifecycleState.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `98ff6884eeb74f71e275c378f00ea0123c1f06e1`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionDisplayQueries.ts` so top-level
    section display filtering and node-map construction stop living beside
    view-mode visibility and ancestor-visibility queries.

## 2026-03-15 11:01:59 PDT

- Slice completed: split section display structure from visibility queries
- Key files touched:
  - `frontend/src/state/actions/sectionDisplayQueries.ts`
  - `frontend/src/state/actions/sectionDisplayStructure.ts`
  - `frontend/src/state/actions/sectionViewModeVisibility.ts`
  - `frontend/src/state/actions/sectionViewModeVisibility.test.ts`
  - `frontend/src/state/actions/activeSectionCommands.ts`
  - `frontend/src/state/actions/project/loadProject.ts`
  - `frontend/src/state/actions/sectionProjectStateSync.ts`
  - `frontend/src/state/hooks/search.ts`
  - `frontend/src/state/subscriptions.ts`
  - `frontend/src/forks/dnd-kit/useDropType.ts`
  - `frontend/src/forks/dnd-kit/useMoveSection.ts`
  - `frontend/src/forks/dnd-kit/dndState.ts`
  - `frontend/src/utils/focusManagerElements.ts`
  - `frontend/src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
  - `frontend/src/components/Section/Container/ContainerWrappers.tsx`
  - `frontend/src/components/Section/Container/SectionContainer.tsx`
  - `frontend/src/components/Section/Header/DeleteOrHideButton.tsx`
  - `frontend/src/components/Section/Layouts/TerminalArea.tsx`
  - `frontend/src/components/Section/Layouts/TerminalArea.test.tsx`
  - `frontend/src/components/Utils/ContextMenus/SelectionContextMenu.tsx`
  - `frontend/src/state/actions/sectionInfos.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-sections-and-params-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.test.ts src/state/actions/sectionViewModeVisibility.test.ts src/components/Section/Layouts/TerminalArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/sectionDisplayQueries.ts src/state/actions/sectionDisplayStructure.ts src/state/actions/sectionViewModeVisibility.ts src/state/actions/sectionViewModeVisibility.test.ts src/state/actions/activeSectionCommands.ts src/state/actions/project/loadProject.ts src/state/actions/sectionProjectStateSync.ts src/state/hooks/search.ts src/state/subscriptions.ts src/forks/dnd-kit/useDropType.ts src/forks/dnd-kit/useMoveSection.ts src/forks/dnd-kit/dndState.ts src/utils/focusManagerElements.ts src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx src/components/Section/Header/DeleteOrHideButton.tsx src/components/Panes/Overview/RunInstructions.tsx src/components/Section/Layouts/TerminalArea.tsx src/components/Section/Layouts/TerminalArea.test.tsx src/components/Section/Container/SectionContainer.tsx src/components/Section/Container/ContainerWrappers.tsx src/components/Utils/ContextMenus/SelectionContextMenu.tsx src/state/actions/sectionInfos.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md ../docs/plans/frontend-sections-and-params-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `943020e412b08315f778e31c33f46b1552a95014`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatThreadStorageUndo.ts` so
    undo-stack bookkeeping and target-entry lookup stop living beside
    thread/group inverse-apply restoration writes.

## 2026-03-15 11:10:08 PDT

- Slice completed: split project chat thread undo stack from restore writes
- Key files touched:
  - `frontend/src/state/actions/projectChatThreadStorageUndo.ts`
  - `frontend/src/state/actions/projectChatThreadStorageUndoStack.ts`
  - `frontend/src/state/actions/projectChatThreadStorageUndoApply.ts`
  - `frontend/src/state/actions/projectChatThreadStorageUndoStack.test.ts`
  - `frontend/src/state/actions/projectChatThreadGroupAssignments.ts`
  - `frontend/src/state/actions/projectChatThreadMutations.ts`
  - `frontend/src/state/actions/projectChatThreads.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatThreads.test.ts src/state/actions/projectChatThreadStorageUndoStack.test.ts src/state/actions/undo.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatThreadStorageUndo.ts src/state/actions/projectChatThreadStorageUndoStack.ts src/state/actions/projectChatThreadStorageUndoApply.ts src/state/actions/projectChatThreadStorageUndoStack.test.ts src/state/actions/projectChatThreadGroupAssignments.ts src/state/actions/projectChatThreadMutations.ts src/state/actions/projectChatThreads.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `9483d6928e613b7dbe99d9c4f0f04a3fb6f46fc6`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowingNormalization.ts`
    so canonical windowing normalization stops living beside storage reads,
    pane projection, and layout merge helpers.

## 2026-03-15 11:15:39 PDT

- Slice completed: split project chat windowing default bounds from state normalization
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowingDefaultBounds.ts`
  - `frontend/src/state/actions/projectChatWindowingStateNormalization.ts`
  - `frontend/src/state/actions/projectChatWindowingNormalization.ts`
  - `frontend/src/state/actions/projectChatWindowingDefaultBounds.test.ts`
  - `frontend/src/state/actions/projectChatWindowingStateNormalization.test.ts`
  - `frontend/src/state/actions/projectChatWindowingInstanceState.ts`
  - `frontend/src/state/actions/projectChatWindowingSelectors.ts`
  - `frontend/src/state/actions/projectChatWindowingPlacementState.ts`
  - `frontend/src/state/actions/windowSpaceSnapshotRestore.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreLayout.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowingDefaultBounds.test.ts src/state/actions/projectChatWindowingStateNormalization.test.ts src/state/actions/projectChatWindowingInstanceState.test.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.test.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/projectChatWindowing.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowingDefaultBounds.ts src/state/actions/projectChatWindowingStateNormalization.ts src/state/actions/projectChatWindowingNormalization.ts src/state/actions/projectChatWindowingDefaultBounds.test.ts src/state/actions/projectChatWindowingStateNormalization.test.ts src/state/actions/projectChatWindowingInstanceState.ts src/state/actions/projectChatWindowingSelectors.ts src/state/actions/projectChatWindowingPlacementState.ts src/state/actions/windowSpaceSnapshotRestore.ts src/state/actions/windowSpaceWorkspaceRestoreLayout.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.ts src/components/ChatWindowing/ProjectChatBottomDock.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `1c3b65692fd0fb071227f36eff9f68595a0f95ef`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/stateMachineRunSelection.ts` so
    active-run candidate reads stop living beside selection and clear
    mutations.

## 2026-03-15 11:19:40 PDT

- Slice completed: split workflow run queries from polling lifecycle
- Key files touched:
  - `frontend/src/state/actions/stateMachineRunQueries.ts`
  - `frontend/src/state/actions/stateMachineRunPolling.ts`
  - `frontend/src/state/actions/stateMachineRunSelection.ts`
  - `frontend/src/state/actions/stateMachineRunQueries.test.ts`
  - `frontend/src/state/actions/stateMachineRuns.ts`
  - `frontend/src/state/actions/stateMachineRunMutations.ts`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
  - `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`
  - `frontend/src/components/Section/Layouts/stateMachineNodePresentation.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/stateMachineRunQueries.test.ts src/state/actions/stateMachineRuns.test.ts src/components/Section/Layouts/StateMachineNodeArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/stateMachineRunQueries.ts src/state/actions/stateMachineRunPolling.ts src/state/actions/stateMachineRunSelection.ts src/state/actions/stateMachineRunQueries.test.ts src/state/actions/stateMachineRuns.ts src/state/actions/stateMachineRunMutations.ts src/components/Panes/Overview/RunInstructions.tsx src/components/Section/Layouts/StateMachineNodeArea.tsx src/components/Section/Layouts/stateMachineNodePresentation.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `a7e25d682aa3dc6c088d74a231367ac31b9cdc7f`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowingCanvasBoot.ts` so
    canvas-surface lookup stops living beside section-window boot and rebind
    orchestration.

## 2026-03-15 11:23:53 PDT

- Slice completed: split project chat canvas surface lookup from boot flow
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowingCanvasSurface.ts`
  - `frontend/src/state/actions/projectChatWindowingCanvasSurface.test.ts`
  - `frontend/src/state/actions/projectChatWindowingCanvasBoot.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowingCanvasSurface.test.ts src/state/actions/projectChatWindowing.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowingCanvasSurface.ts src/state/actions/projectChatWindowingCanvasBoot.ts src/state/actions/projectChatWindowingCanvasSurface.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `ca1f876c6f385bb58e8812dcf2e98d2088ac6aa2`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionLayoutQueries.ts` so
    layout-placement reads stop living beside viewport-fit, pane-layout, and
    section-container geometry helpers.

## 2026-03-15 11:28:12 PDT

- Slice completed: split section structure queries from terminal attachment helpers
- Key files touched:
  - `frontend/src/state/actions/sectionStructureQueries.ts`
  - `frontend/src/state/actions/sectionTerminalAttachmentQueries.ts`
  - `frontend/src/state/actions/sectionLayoutQueries.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
  - `frontend/src/state/actions/sectionStructureQueries.test.ts`
  - `frontend/src/state/actions/sectionTerminalAttachmentQueries.test.ts`
  - `frontend/src/state/hooks/sectionAspectRatioSizing.ts`
  - `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
  - `frontend/src/state/actions/sections/sectionSizes.ts`
  - `frontend/src/state/actions/sections/moveSectionQueries.ts`
  - `frontend/src/state/actions/sections/moveSectionParentState.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionStructureQueries.test.ts src/state/actions/sectionTerminalAttachmentQueries.test.ts src/state/actions/sections/moveSectionQueries.test.ts src/state/actions/sections/sectionSizes.test.tsx src/components/Utils/Resizable/CustomResizable.test.ts src/state/actions/sectionInfos.listRootViewMode.perf.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sectionStructureQueries.ts src/state/actions/sectionTerminalAttachmentQueries.ts src/state/actions/sectionLayoutQueries.ts src/state/actions/sectionInfos.ts src/state/actions/sectionStructureQueries.test.ts src/state/actions/sectionTerminalAttachmentQueries.test.ts src/state/hooks/sectionAspectRatioSizing.ts src/components/Utils/Resizable/CustomResizable.tsx src/state/actions/sections/sectionSizes.ts src/state/actions/sections/moveSectionQueries.ts src/state/actions/sections/moveSectionParentState.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `2d57494b93642e770858728205d763b9cf44baae`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/params/paramTree.ts` so
    param ancestry/path reads stop living beside sibling ordering, visible-tree
    traversal, and selection-navigation helpers.

## 2026-03-15 11:35:26 PDT

- Slice completed: split param tree structure from selection helpers
- Key files touched:
  - `frontend/src/state/actions/params/paramTreeStructure.ts`
  - `frontend/src/state/actions/params/paramTreeSelection.ts`
  - `frontend/src/state/actions/params/paramTree.ts`
  - `frontend/src/state/actions/params/paramTreeStructure.test.ts`
  - `frontend/src/state/actions/params/paramTreeSelection.test.ts`
  - `frontend/src/state/actions/params/paramMoveQueries.ts`
  - `frontend/src/state/actions/params/paramMoveMutations.ts`
  - `frontend/src/state/actions/params/paramMoveKeyboardCommands.ts`
  - `frontend/src/state/actions/params/paramDuplicateIndex.ts`
  - `frontend/src/components/Params/ParamDndContext.tsx`
  - `frontend/src/components/Params/ParamDndList.tsx`
  - `frontend/src/components/Params/ParamDndMonitor.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `docs/plans/frontend-sections-and-params-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/params/paramTreeStructure.test.ts src/state/actions/params/paramTreeSelection.test.ts src/state/actions/params/moveParams.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/params/paramTree.ts src/state/actions/params/paramTreeStructure.ts src/state/actions/params/paramTreeSelection.ts src/state/actions/params/paramTreeStructure.test.ts src/state/actions/params/paramTreeSelection.test.ts src/state/actions/params/paramMoveQueries.ts src/state/actions/params/paramMoveMutations.ts src/state/actions/params/paramDuplicateIndex.ts src/state/actions/params/paramMoveKeyboardCommands.ts src/components/Params/ParamDndContext.tsx src/components/Params/ParamDndList.tsx src/components/Params/ParamDndMonitor.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md ../docs/plans/frontend-sections-and-params-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `20a39e59e21d7a84185d4a70c8e211400b252d19`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/appSessionState.ts` so
    app-session bootstrap and recovery no longer live beside persistent
    run-count state updates.

## 2026-03-15 11:41:18 PDT

- Slice completed: split app session bootstrap from run-count persistence
- Key files touched:
  - `frontend/src/state/actions/appSessionStoredState.ts`
  - `frontend/src/state/actions/appSessionBootstrap.ts`
  - `frontend/src/state/actions/appSessionRunCount.ts`
  - `frontend/src/state/actions/appSessionState.ts`
  - `frontend/src/state/actions/appSessionStoredState.test.ts`
  - `frontend/src/state/actions/appSessionBootstrap.test.ts`
  - `frontend/src/state/actions/appSessionRunCount.test.ts`
  - `frontend/src/state/actions/appDeploymentState.ts`
  - `frontend/src/state/actions/websocketShareSessionRecovery.ts`
  - `frontend/src/state/actions/websocketShareSessionRecovery.test.ts`
  - `frontend/src/state/hooks/app.ts`
  - `frontend/src/components/App/AppRenderer.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/appSessionStoredState.test.ts src/state/actions/appSessionBootstrap.test.ts src/state/actions/appSessionRunCount.test.ts src/state/actions/appDeploymentState.test.ts src/state/actions/websocketShareSessionRecovery.test.ts src/components/App/AppRenderer.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/appSessionState.ts src/state/actions/appSessionStoredState.ts src/state/actions/appSessionBootstrap.ts src/state/actions/appSessionRunCount.ts src/state/actions/appSessionStoredState.test.ts src/state/actions/appSessionBootstrap.test.ts src/state/actions/appSessionRunCount.test.ts src/state/actions/appDeploymentState.ts src/state/actions/appDeploymentState.test.ts src/state/actions/websocketShareSessionRecovery.ts src/state/actions/websocketShareSessionRecovery.test.ts src/state/hooks/app.ts src/components/App/AppRenderer.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `ac642b1dbe36f5e129ba7ebf4fd97506a8169130`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/customRuns.ts` so
    custom-run storage reads and persisted mutation writes stop living beside
    sort, filter, and derived item list helpers.

## 2026-03-15 11:46:47 PDT

- Slice completed: split custom-run storage from execution and queries
- Key files touched:
  - `frontend/src/state/actions/customRunStorage.ts`
  - `frontend/src/state/actions/customRunQueries.ts`
  - `frontend/src/state/actions/customRunExecution.ts`
  - `frontend/src/state/actions/customRuns.ts`
  - `frontend/src/state/actions/customRunQueries.test.ts`
  - `frontend/src/state/actions/customRunStorage.test.ts`
  - `frontend/src/state/actions/customRunExecution.test.ts`
  - `frontend/src/components/AppHeader/RunButton.tsx`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/customRunQueries.test.ts src/state/actions/customRunStorage.test.ts src/state/actions/customRunExecution.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/customRuns.ts src/state/actions/customRunStorage.ts src/state/actions/customRunQueries.ts src/state/actions/customRunExecution.ts src/state/actions/customRunQueries.test.ts src/state/actions/customRunStorage.test.ts src/state/actions/customRunExecution.test.ts src/components/AppHeader/RunButton.tsx src/components/Panes/Overview/RunInstructions.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `1d6dbd24f07660ffe1f2aabc68ebf2ff907ac290`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/windowSpaceSnapshotRestore.ts` so
    saved-snapshot conversion and workspace-restore orchestration stop living
    beside active-windowing apply and selected-window restoration writes.

## 2026-03-15 11:51:09 PDT

- Slice completed: split window-space restore conversion helpers
- Key files touched:
  - `frontend/src/state/actions/windowSpaceSnapshotRestoreConversion.ts`
  - `frontend/src/state/actions/windowSpaceSnapshotRestoreSectionBindings.ts`
  - `frontend/src/state/actions/windowSpaceSnapshotRestoreInstanceIds.ts`
  - `frontend/src/state/actions/windowSpaceSnapshotRestore.ts`
  - `frontend/src/state/actions/windowSpaceSnapshotRestoreInstanceIds.test.ts`
  - `frontend/src/state/actions/windowSpaceSnapshotRestoreSectionBindings.test.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreLayout.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreRemap.ts`
  - `frontend/src/state/actions/windowSpaceWorkspaceRestoreReuse.ts`
  - `frontend/src/state/actions/windowSpaceSnapshots.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/windowSpaceSnapshotRestoreInstanceIds.test.ts src/state/actions/windowSpaceSnapshotRestoreSectionBindings.test.ts src/state/actions/windowSpaceWorkspaceRestoreReuse.test.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.test.ts src/state/actions/windowSpaceWorkspaceRestorePlan.test.ts src/state/actions/windowSpaces.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/windowSpaceSnapshotRestore.ts src/state/actions/windowSpaceSnapshotRestoreConversion.ts src/state/actions/windowSpaceSnapshotRestoreSectionBindings.ts src/state/actions/windowSpaceSnapshotRestoreInstanceIds.ts src/state/actions/windowSpaceSnapshotRestoreInstanceIds.test.ts src/state/actions/windowSpaceSnapshotRestoreSectionBindings.test.ts src/state/actions/windowSpaceWorkspaceRestoreLayout.ts src/state/actions/windowSpaceWorkspaceRestoreRemap.ts src/state/actions/windowSpaceWorkspaceRestoreReuse.ts src/state/actions/windowSpaceSnapshots.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `17e853d50a0fd0de545ce516bee5f9f46bd7cee3`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/windowSpaceCrud.ts` so
    saved window-space mutation transport and optimistic persistence rollback
    stop living beside name/order sort helpers and mutation gating.

## 2026-03-15 11:56:44 PDT

- Slice completed: split window-space queries from optimistic persistence mutations
- Key files touched:
  - `frontend/src/state/actions/windowSpaceQueries.ts`
  - `frontend/src/state/actions/windowSpaceMutationPersistence.ts`
  - `frontend/src/state/actions/windowSpaceCrud.ts`
  - `frontend/src/state/actions/windowSpacePersistence.ts`
  - `frontend/src/state/actions/windowSpaceSave.ts`
  - `frontend/src/state/actions/windowSpaces.ts`
  - `frontend/src/state/actions/windowSpaceQueries.test.ts`
  - `frontend/src/state/actions/windowSpaces.test.ts`
  - `frontend/src/components/Panes/Overview/WindowSpacesPane.tsx`
  - `frontend/src/components/Panes/Overview/WindowSpacesPane.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/windowSpaces.test.ts src/state/actions/windowSpaceQueries.test.ts src/components/Panes/Overview/WindowSpacesPane.test.tsx`
  - `pnpm -C frontend exec prettier --check src/state/actions/windowSpaceCrud.ts src/state/actions/windowSpaceQueries.ts src/state/actions/windowSpaceQueries.test.ts src/state/actions/windowSpaceMutationPersistence.ts src/state/actions/windowSpacePersistence.ts src/state/actions/windowSpaceSave.ts src/state/actions/windowSpaces.ts src/state/actions/windowSpaces.test.ts src/components/Panes/Overview/WindowSpacesPane.tsx src/components/Panes/Overview/WindowSpacesPane.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `fa2922aea378fadd2df9c0e3eb4531df25314250`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sections/sectionSizes.ts` so
    section layout sizing reducers and size-persistence scheduling stop
    sharing one action surface.

## 2026-03-15 12:06:06 PDT

- Slice completed: split section size geometry, local state writes, and persistence
- Key files touched:
  - `frontend/src/state/actions/sections/sectionSizeGeometry.ts`
  - `frontend/src/state/actions/sections/sectionSizeState.ts`
  - `frontend/src/state/actions/sections/sectionSizePersistence.ts`
  - `frontend/src/state/actions/sections/sectionSizes.ts`
  - `frontend/src/state/actions/sections/sectionSizePersistence.test.ts`
  - `frontend/src/state/actions/sections/sectionSizes.test.tsx`
  - `frontend/src/components/Utils/Resizable/customResizableSizing.ts`
  - `frontend/src/components/Utils/Resizable/useCustomResizableBehavior.ts`
  - `frontend/src/components/Section/Header/MenuButton/ToggleGroupOverflowMode.tsx`
  - `frontend/src/state/hooks/sectionAspectRatioSizing.ts`
  - `frontend/src/state/hooks/sectionSizes.integration.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-sections-and-params-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sections/sectionSizePersistence.test.ts src/state/actions/sections/sectionSizes.test.tsx src/components/Utils/Resizable/CustomResizable.test.ts src/state/hooks/sectionSizes.integration.test.tsx src/state/hooks/sectionAspectRatioSizing.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sections/sectionSizes.ts src/state/actions/sections/sectionSizeGeometry.ts src/state/actions/sections/sectionSizeState.ts src/state/actions/sections/sectionSizePersistence.ts src/state/actions/sections/sectionSizePersistence.test.ts src/state/actions/sections/sectionSizes.test.tsx src/components/Utils/Resizable/customResizableSizing.ts src/components/Utils/Resizable/useCustomResizableBehavior.ts src/components/Utils/Resizable/utils.ts src/components/Utils/Resizable/customResizableChrome.ts src/components/Utils/Resizable/CustomResizable.test.ts src/state/hooks/sectionAspectRatioSizing.ts src/state/hooks/sectionSizes.integration.test.tsx src/components/Section/Header/MenuButton/ToggleGroupOverflowMode.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-sections-and-params-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual state/action/shared-utility
    ownership split and did not change frontend rendering behavior.
- Commit hash:
  - `59a2d383a74b7ea3386b9ed2815c41c13c374651`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/websocketIncomingUISettingReveal.ts`
    so ACK routing, store writes, and activation follow-up handling stop
    sharing one websocket event surface.

## 2026-03-15 12:12:04 PDT

- Slice completed: split websocket UI setting reveal ACK routing and execution handling
- Key files touched:
  - `frontend/src/state/actions/websocketIncomingUISettingRevealAck.ts`
  - `frontend/src/state/actions/websocketIncomingUISettingRevealExecution.ts`
  - `frontend/src/state/actions/websocketIncomingUISettingReveal.ts`
  - `frontend/src/state/actions/websocketIncomingUISettingRevealAck.test.ts`
  - `frontend/src/state/actions/websocketIncomingUISettingRevealExecution.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/websocketIncomingUISettingRevealAck.test.ts src/state/actions/websocketIncomingUISettingRevealExecution.test.ts src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/websocketIncomingUISettingReveal.ts src/state/actions/websocketIncomingUISettingRevealAck.ts src/state/actions/websocketIncomingUISettingRevealExecution.ts src/state/actions/websocketIncomingUISettingRevealAck.test.ts src/state/actions/websocketIncomingUISettingRevealExecution.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual websocket/state ownership split
    and did not change frontend rendering behavior.
- Commit hash:
  - `5af09ae01a8a90f2d66b6fbbb42f2fcbd841e175`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/edgeHandles.ts` so edge handle lookup,
    drag activation, and canvas hit-target ownership stop sharing one action
    surface.

## 2026-03-15 12:20:10 PDT

- Slice completed: split edge handle registration, position state, and RAF scheduling
- Key files touched:
  - `frontend/src/state/actions/edgeHandleKeys.ts`
  - `frontend/src/state/actions/edgeHandleRegistration.ts`
  - `frontend/src/state/actions/edgeHandlePositionState.ts`
  - `frontend/src/state/actions/edgeHandlePositionScheduler.ts`
  - `frontend/src/state/actions/edgeHandles.ts`
  - `frontend/src/state/actions/edgeHandleRegistration.test.ts`
  - `frontend/src/state/actions/edgeHandlePositionState.test.ts`
  - `frontend/src/state/actions/edges.ts`
  - `frontend/src/state/actions/nodeInternals.ts`
  - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
  - `frontend/src/forks/xyflow/core/components/ConnectionLine.tsx`
  - `frontend/src/forks/xyflow/core/components/Handle/index.tsx`
  - `frontend/src/forks/xyflow/core/components/Handle/handler.ts`
  - `frontend/src/components/Section/Container/MinimizedDataEdgeHandles.tsx`
  - `frontend/src/components/Section/Container/SortableSectionContainer.tsx`
  - `frontend/src/components/Section/SectionParts/Search.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/edgeHandleRegistration.test.ts src/state/actions/edgeHandlePositionState.test.ts src/state/stores/layoutInteractionStores.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/edgeHandles.ts src/state/actions/edgeHandleKeys.ts src/state/actions/edgeHandleRegistration.ts src/state/actions/edgeHandlePositionState.ts src/state/actions/edgeHandlePositionScheduler.ts src/state/actions/edgeHandleRegistration.test.ts src/state/actions/edgeHandlePositionState.test.ts src/state/actions/edges.ts src/state/actions/nodeInternals.ts src/forks/xyflow/core/container/EdgeRenderer.tsx src/forks/xyflow/core/components/ConnectionLine.tsx src/forks/xyflow/core/components/Handle/index.tsx src/forks/xyflow/core/components/Handle/handler.ts src/components/Section/Container/MinimizedDataEdgeHandles.tsx src/components/Section/Container/SortableSectionContainer.tsx src/components/Section/SectionParts/Search.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual edge-handle/state ownership
    split and did not change frontend rendering behavior.
- Commit hash:
  - `1f6248b205795d3f1cee03ade5560429bfacdc09`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/gitStatusAndDiff.ts` so git status load,
    diff hydration, and graph/sidebar state updates stop sharing one action
    surface.

## 2026-03-15 12:24:50 PDT

- Slice completed: split git status refresh and diff overlay actions
- Key files touched:
  - `frontend/src/state/actions/gitStatusState.ts`
  - `frontend/src/state/actions/gitDiffOverlayActions.ts`
  - `frontend/src/state/actions/gitStatusAndDiff.ts`
  - `frontend/src/state/actions/gitStatusState.test.ts`
  - `frontend/src/state/actions/gitDiffOverlayActions.test.ts`
  - `frontend/src/state/actions/git.ts`
  - `frontend/src/components/Panes/Overview/Git/GitPane.tsx`
  - `frontend/src/components/Git/GitDiffOverlay.tsx`
  - `frontend/src/components/Git/GitOverlayLayer.tsx`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/gitStatusState.test.ts src/state/actions/gitDiffOverlayActions.test.ts src/state/actions/git.test.ts src/components/Panes/Overview/Git/GitPane.test.tsx src/components/Git/GitOverlayLayer.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/gitStatusAndDiff.ts src/state/actions/gitStatusState.ts src/state/actions/gitDiffOverlayActions.ts src/state/actions/gitStatusState.test.ts src/state/actions/gitDiffOverlayActions.test.ts src/state/actions/git.ts src/components/Panes/Overview/Git/GitPane.tsx src/components/Git/GitDiffOverlay.tsx src/components/Git/GitOverlayLayer.tsx src/components/Git/GitGraphOverlay.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual git state/action ownership
    split and did not change frontend rendering behavior.
- Commit hash:
  - `206c84daac9fb2f7987dd5d3baecf6bccb4d98d5`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/shareSessionState.ts` so share-session
    bootstrap and deployment-mode initialization stop living beside cached
    session reuse and cookie/session-storage reads.

## 2026-03-15 12:29:12 PDT

- Slice completed: split share-session stored state and bootstrap flows
- Key files touched:
  - `frontend/src/state/actions/shareSessionStoredState.ts`
  - `frontend/src/state/actions/shareSessionBootstrap.ts`
  - `frontend/src/state/actions/shareSessionState.ts`
  - `frontend/src/state/actions/shareSessionStoredState.test.ts`
  - `frontend/src/state/actions/shareSessionBootstrap.test.ts`
  - `frontend/src/state/actions/share.ts`
  - `frontend/src/state/actions/shareProjectConfig.ts`
  - `frontend/src/state/actions/shareProjectConfig.test.ts`
  - `frontend/src/state/actions/websocketShareSessionRecovery.ts`
  - `frontend/src/state/actions/websocketShareSessionRecovery.test.ts`
  - `frontend/src/state/hooks/share.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/shareSessionStoredState.test.ts src/state/actions/shareSessionBootstrap.test.ts src/state/actions/shareProjectConfig.test.ts src/state/actions/websocketShareSessionRecovery.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/shareSessionState.ts src/state/actions/shareSessionStoredState.ts src/state/actions/shareSessionBootstrap.ts src/state/actions/shareSessionStoredState.test.ts src/state/actions/shareSessionBootstrap.test.ts src/state/actions/share.ts src/state/actions/shareProjectConfig.ts src/state/actions/shareProjectConfig.test.ts src/state/actions/websocketShareSessionRecovery.ts src/state/actions/websocketShareSessionRecovery.test.ts src/state/hooks/share.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual share-session/state ownership
    split and did not change frontend rendering behavior.
- Commit hash:
  - `4dc318e0b57748aae0e5b6a1a5243c2cc2ae5c45`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/runOrImportCode.ts` so run-vs-import
    transport selection, loading guards, and follow-up project reload behavior
    stop sharing one action surface.

## 2026-03-15 12:37:58 PDT

- Slice completed: split run code execution from main run controls
- Key files touched:
  - `frontend/src/state/actions/runCodeExecution.ts`
  - `frontend/src/state/actions/runCodeControls.ts`
  - `frontend/src/state/actions/runOrImportCode.ts`
  - `frontend/src/state/actions/runCodeExecution.test.ts`
  - `frontend/src/state/actions/runCodeControls.test.ts`
  - `frontend/src/state/actions/customRunExecution.ts`
  - `frontend/src/state/actions/customRunExecution.test.ts`
  - `frontend/src/state/actions/keyActivationCommands.ts`
  - `frontend/src/components/AppHeader/RunButton.tsx`
  - `frontend/src/components/AppHeader/StopButton.tsx`
  - `frontend/src/components/Section/Header/RunButton.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/runCodeExecution.test.ts src/state/actions/runCodeControls.test.ts src/state/actions/customRunExecution.test.ts src/state/actions/keyActivationCommands.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/runCodeExecution.ts src/state/actions/runCodeControls.ts src/state/actions/runOrImportCode.ts src/state/actions/runCodeExecution.test.ts src/state/actions/runCodeControls.test.ts src/state/actions/customRunExecution.ts src/state/actions/customRunExecution.test.ts src/state/actions/keyActivationCommands.ts src/components/AppHeader/RunButton.tsx src/components/AppHeader/StopButton.tsx src/components/Section/Header/RunButton.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual run-action ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `eed7449a7a008d63ce6ae6ab50eb78cae4911c32`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/projectChatWindowingInstanceState.ts`
    so window instance creation, next-instance-id allocation, and shared
    per-window update helpers stop sharing one action surface.

## 2026-03-15 12:43:43 PDT

- Slice completed: split project chat window instance creation from updates
- Key files touched:
  - `frontend/src/state/actions/projectChatWindowingInstanceCreation.ts`
  - `frontend/src/state/actions/projectChatWindowingInstanceUpdates.ts`
  - `frontend/src/state/actions/projectChatWindowingInstanceState.ts`
  - `frontend/src/state/actions/projectChatWindowingInstanceCreation.test.ts`
  - `frontend/src/state/actions/projectChatWindowingInstanceUpdates.test.ts`
  - `frontend/src/state/actions/projectChatWindowingLayoutState.ts`
  - `frontend/src/state/actions/projectChatWindowingPlacementState.ts`
  - `frontend/src/state/actions/projectChatWindowingBoundsState.ts`
  - `frontend/src/state/actions/projectChatWindowingSectionState.ts`
  - `frontend/src/state/actions/projectChatWindowingMetadataState.ts`
  - `frontend/src/state/actions/projectChatWindowLifecycleCommands.ts`
  - `frontend/src/state/actions/projectChatWindowSectionCommands.ts`
  - `frontend/src/state/actions/projectChatWindowingTrackedGitPane.ts`
  - `frontend/src/state/actions/projectChatWindowing.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowingInstanceCreation.test.ts src/state/actions/projectChatWindowingInstanceUpdates.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/projectChatWindowing.rollback.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/projectChatWindowingInstanceCreation.ts src/state/actions/projectChatWindowingInstanceUpdates.ts src/state/actions/projectChatWindowingInstanceState.ts src/state/actions/projectChatWindowingInstanceCreation.test.ts src/state/actions/projectChatWindowingInstanceUpdates.test.ts src/state/actions/projectChatWindowingMetadataState.ts src/state/actions/projectChatWindowingPlacementState.ts src/state/actions/projectChatWindowingBoundsState.ts src/state/actions/projectChatWindowingSectionState.ts src/state/actions/projectChatWindowingLayoutState.ts src/state/actions/projectChatWindowLifecycleCommands.ts src/state/actions/projectChatWindowSectionCommands.ts src/state/actions/projectChatWindowingTrackedGitPane.ts src/state/actions/projectChatWindowing.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual project-chat windowing state
    ownership split and did not change frontend rendering behavior.
- Commit hash:
  - `47d797006e32723e85ca323b81438f7a250237b4`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/params/paramMoveQueries.ts` so param
    move target resolution, visible-tree insertion planning, and backend move
    payload preparation stop sharing one action surface.

## 2026-03-15 12:48:18 PDT

- Slice completed: split param move selection context from ordering helpers
- Key files touched:
  - `frontend/src/state/actions/params/paramMoveSelectionContext.ts`
  - `frontend/src/state/actions/params/paramMoveOrdering.ts`
  - `frontend/src/state/actions/params/paramMoveQueries.ts`
  - `frontend/src/state/actions/params/paramMoveCommands.ts`
  - `frontend/src/state/actions/params/paramMoveKeyboardCommands.ts`
  - `frontend/src/state/actions/params/paramMoveMutations.ts`
  - `frontend/src/state/actions/params/moveParams.test.ts`
  - `frontend/src/components/Params/ParamDndMonitor.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-sections-and-params-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/params/moveParams.test.ts src/state/actions/keyActivationCommands.test.ts src/state/actions/keyActivationHandlers.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/params/paramMoveSelectionContext.ts src/state/actions/params/paramMoveOrdering.ts src/state/actions/params/paramMoveQueries.ts src/state/actions/params/paramMoveCommands.ts src/state/actions/params/paramMoveKeyboardCommands.ts src/state/actions/params/paramMoveMutations.ts src/state/actions/params/moveParams.test.ts src/components/Params/ParamDndMonitor.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-sections-and-params-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual param move/state ownership
    split and did not change frontend rendering behavior.
- Commit hash:
  - `bd12d199fb8d98d11207396c47e4b4d0ce78468d`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/sectionProjectStateSync.ts` so backend
    project-state reconciliation, active-section sync, viewport updates, and
    project-chat windowing coordination stop sharing one action surface.

## 2026-03-15 12:56:15 PDT

- Slice completed: split project-state snapshot sync by responsibility
- Key files touched:
  - `frontend/src/state/actions/sectionProjectStateSnapshot.ts`
  - `frontend/src/state/actions/sectionProjectStateActiveSync.ts`
  - `frontend/src/state/actions/sectionProjectStateViewportSync.ts`
  - `frontend/src/state/actions/sectionProjectStateWindowingSync.ts`
  - `frontend/src/state/actions/sectionProjectStateSync.ts`
  - `frontend/src/state/actions/sectionProjectStateSnapshot.test.ts`
  - `frontend/src/state/actions/sectionProjectStateViewportSync.test.ts`
  - `frontend/src/state/actions/sectionProjectStateWindowingSync.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/sectionProjectStateSnapshot.test.ts src/state/actions/sectionProjectStateViewportSync.test.ts src/state/actions/sectionProjectStateWindowingSync.test.ts src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/state/actions/sectionInfos.test.ts src/state/actions/activeSections.test.ts src/state/actions/sections/topLevelLayoutPersistence.test.ts src/state/actions/aiSectionResizePersistence.test.ts src/state/actions/projectChatWindowing.rollback.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/sectionProjectStateSync.ts src/state/actions/sectionProjectStateSnapshot.ts src/state/actions/sectionProjectStateActiveSync.ts src/state/actions/sectionProjectStateViewportSync.ts src/state/actions/sectionProjectStateWindowingSync.ts src/state/actions/sectionProjectStateSnapshot.test.ts src/state/actions/sectionProjectStateViewportSync.test.ts src/state/actions/sectionProjectStateWindowingSync.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual project-state sync ownership
    split and did not change frontend rendering behavior.
- Commit hash:
  - `7eb1b6b75de7f7079bd82882803075c674a6f1ba`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/lspDiagnostics.ts` so formatter-aware
    diagnostics merging and snapshot publish logic stop sharing one action
    surface with mute/suppression transport commands.

## 2026-03-15 13:01:14 PDT

- Slice completed: split LSP diagnostics state updates from transport commands
- Key files touched:
  - `frontend/src/state/actions/lspDiagnosticsState.ts`
  - `frontend/src/state/actions/lspDiagnosticsCommands.ts`
  - `frontend/src/state/actions/lspDiagnostics.ts`
  - `frontend/src/state/actions/lspDiagnosticsState.test.ts`
  - `frontend/src/state/actions/lspDiagnosticsCommands.test.ts`
  - `frontend/src/state/actions/formatCode.ts`
  - `frontend/src/state/actions/formatCode.test.ts`
  - `frontend/src/state/actions/websocketBootstrap.ts`
  - `frontend/src/state/actions/websocketBootstrap.test.ts`
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/state/actions/websocketReceive.test.ts`
  - `frontend/src/state/actions/project/loadProject.ts`
  - `frontend/src/components/Section/Header/SectionHeader.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/state/actions/lspDiagnosticsState.test.ts src/state/actions/lspDiagnosticsCommands.test.ts src/state/actions/formatCode.test.ts src/state/actions/websocketBootstrap.test.ts src/state/actions/websocketReceive.test.ts`
  - `pnpm -C frontend exec vitest run src/state/actions/project/loadProject.test.ts`
  - `pnpm -C frontend exec prettier --check src/state/actions/lspDiagnostics.ts src/state/actions/lspDiagnosticsState.ts src/state/actions/lspDiagnosticsCommands.ts src/state/actions/lspDiagnosticsState.test.ts src/state/actions/lspDiagnosticsCommands.test.ts src/state/actions/formatCode.ts src/state/actions/formatCode.test.ts src/state/actions/websocketBootstrap.ts src/state/actions/websocketBootstrap.test.ts src/state/actions/websocketIncomingMessages.ts src/state/actions/project/loadProject.ts src/state/actions/websocketReceive.test.ts src/components/Section/Header/SectionHeader.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - Not applicable. This slice was a non-visual diagnostics ownership split and
    did not change frontend rendering behavior.
- Commit hash:
  - `c05c6cfcfb89d97b42fe6341e63c3c3773a7d941`
- Next highest-value unblocked slice:
  - Split `frontend/src/state/actions/aiChatSubmissionPayload.ts` so
    app-generation request metadata and edited-message submission preparation
    stop sharing one action surface.

## 2026-03-15 13:23:58 PDT

- Slice completed: extracted assistant activity or timeline derivation out of `ChatMessages.tsx`
- Why this slice now:
  - `frontend/src/components/Chat/ChatMessages.tsx` remained the largest unresolved frontend hotspot, and the assistant activity model was already a mostly pure seam. That made it a higher-value cleanup than switching to `ProjectChatBottomDock.tsx` before reducing the biggest chat render surface.
- Key files touched:
  - `frontend/src/components/Chat/chatAssistantActivity.ts`
  - `frontend/src/components/Chat/chatAssistantActivity.test.ts`
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Chat/chatAssistantActivity.test.ts src/components/Chat/ChatMessages.test.tsx src/components/Chat/ChatMessages.activityThoughtPreview.test.tsx src/components/Chat/ChatMessages.streamingAnimation.test.tsx src/components/Chat/ChatMessages.lightModeToolCallSurface.test.tsx`
  - `pnpm -C frontend exec prettier --check src/components/Chat/ChatMessages.tsx src/components/Chat/chatAssistantActivity.ts src/components/Chat/chatAssistantActivity.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - No perf report was added. This was a behavior-preserving helper extraction.
  - CDP visual verification was done through a same-origin harness that imported `ChatMessageList` directly, because the normal app shell was already blank due to an unrelated `aiConfigurationCatalogLoads.ts` import error. The harness verified the assistant activity summary row, expanded thought row, and expanded tool input or output panels.
- Commit hash:
  - `1ded321e71983f49ffdb0eafc7bbf751a9cce298`
- Next highest-value unblocked slice:
  - Split structured output and tool-call rendering out of `frontend/src/components/Chat/ChatMessages.tsx` so the top-level chat surface keeps moving toward list assembly and row composition only.

## 2026-03-15 13:36:09 PDT

- Slice completed: extracted structured output payload inference and resizable rendering out of `ChatMessages.tsx`
- Why this slice now:
  - `frontend/src/components/Chat/ChatMessages.tsx` was still the biggest unresolved UI hotspot after the assistant-activity split, and structured output/tool-call rendering was the next cohesive local seam. That made it higher value than jumping to `ProjectChatBottomDock.tsx` before removing another large mixed-responsibility branch from the top chat surface.
- Key files touched:
  - `frontend/src/components/Chat/chatStructuredOutput.tsx`
  - `frontend/src/components/Chat/chatStructuredOutput.test.tsx`
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/components/Chat/ChatMessages.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/chat-structured-output-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Chat/chatStructuredOutput.test.tsx src/components/Chat/chatAssistantActivity.test.ts src/components/Chat/ChatMessages.test.tsx src/components/Chat/ChatMessages.activityThoughtPreview.test.tsx src/components/Chat/ChatMessages.streamingAnimation.test.tsx src/components/Chat/ChatMessages.lightModeToolCallSurface.test.tsx`
  - `pnpm -C frontend exec prettier --check src/components/Chat/ChatMessages.tsx src/components/Chat/ChatMessages.test.tsx src/components/Chat/chatStructuredOutput.tsx src/components/Chat/chatStructuredOutput.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/chat-structured-output-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/chat-structured-output-2026-03-15.md` with the harness context and resize observations.
  - CDP visual verification was done through a same-origin harness that imported `ChatMessageList` directly, because the normal app shell was already blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error.
  - Verified the expanded structured-output pane at the minimum `90px` drag clamp and a near-max `617px` drag clamp on a `772px` viewport with screenshots saved under `perf/reports/frontend/`.
- Commit hash:
  - `5d56225c790e1bc27886a1836ef8d37d8e5f0dc9`
- Next highest-value unblocked slice:
  - Split attachment/media preview handling out of `frontend/src/components/Chat/ChatMessages.tsx` so attachment URL loading, text preview fetch state, and media carousel branching stop sharing the main chat render surface.

## 2026-03-15 13:48:16 PDT

- Slice completed: extracted attachment URL loading and preview rendering out of `ChatMessages.tsx`
- Why this slice now:
  - `frontend/src/components/Chat/ChatMessages.tsx` remained the largest unresolved UI hotspot after the assistant-activity and structured-output splits, and attachment/media preview handling was the next cohesive seam already localized to one render-heavy branch. That made it higher value than switching to `ProjectChatBottomDock.tsx` before removing another large mixed-responsibility path from the top chat surface.
- Key files touched:
  - `frontend/src/components/Chat/chatAttachmentPreviewUrls.ts`
  - `frontend/src/components/Chat/chatAttachmentPreviewUrls.test.ts`
  - `frontend/src/components/Chat/chatAttachmentPreviews.tsx`
  - `frontend/src/components/Chat/chatAttachmentPreviews.test.tsx`
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/components/Chat/ChatMessages.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/chat-attachment-preview-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Chat/chatAttachmentPreviewUrls.test.ts src/components/Chat/chatAttachmentPreviews.test.tsx src/components/Chat/chatStructuredOutput.test.tsx src/components/Chat/chatAssistantActivity.test.ts src/components/Chat/ChatMessages.test.tsx src/components/Chat/ChatMessages.activityThoughtPreview.test.tsx src/components/Chat/ChatMessages.streamingAnimation.test.tsx src/components/Chat/ChatMessages.lightModeToolCallSurface.test.tsx`
  - `pnpm -C frontend exec prettier --check src/components/Chat/ChatMessages.tsx src/components/Chat/ChatMessages.test.tsx src/components/Chat/chatAttachmentPreviewUrls.ts src/components/Chat/chatAttachmentPreviewUrls.test.ts src/components/Chat/chatAttachmentPreviews.tsx src/components/Chat/chatAttachmentPreviews.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/chat-attachment-preview-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/chat-attachment-preview-2026-03-15.md` with the same-origin harness context and before/after attachment-preview observations.
  - CDP visual verification was done through a same-origin harness that imported `ChatMessageList` directly, because the normal app shell was already blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error.
  - Verified the archive attachment preview flow before and after the extraction; the fallback dialog copy stayed the same and the open-dialog harness DOM node count stayed effectively flat (`83` before, `82` after). Screenshot saved under `perf/reports/frontend/chat-attachment-preview-open-2026-03-15.png`.
- Commit hash:
  - `defc62a308dee1021c9e79eb326500b83d5704cd`
- Next highest-value unblocked slice:
  - Split markdown/code message content rendering plus conversation-search highlighting out of `frontend/src/components/Chat/ChatMessages.tsx` so MarkdownContent, inline image-url rendering, and search-highlight wrappers stop sharing the top-level chat surface.

## 2026-03-15 14:14:58 PDT

- Slice completed: extracted markdown/code message rendering and conversation-search highlighting out of `ChatMessages.tsx`
- Why this slice now:
  - `frontend/src/components/Chat/ChatMessages.tsx` still had the clearest high-value local seam after the assistant-activity, structured-output, and attachment splits. Finishing the markdown/search-highlight owner in the same surface reduced one more dense render branch before switching context to `ProjectChatBottomDock.tsx`.
- Key files touched:
  - `frontend/src/components/Chat/chatMessageContent.tsx`
  - `frontend/src/components/Chat/chatMessageContent.test.tsx`
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/components/Chat/ChatMessages.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/chat-markdown-content-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Chat/chatMessageContent.test.tsx src/components/Chat/chatAttachmentPreviewUrls.test.ts src/components/Chat/chatAttachmentPreviews.test.tsx src/components/Chat/chatStructuredOutput.test.tsx src/components/Chat/chatAssistantActivity.test.ts src/components/Chat/ChatMessages.test.tsx src/components/Chat/ChatMessages.activityThoughtPreview.test.tsx src/components/Chat/ChatMessages.streamingAnimation.test.tsx src/components/Chat/ChatMessages.lightModeToolCallSurface.test.tsx`
  - `pnpm -C frontend exec prettier --check src/components/Chat/ChatMessages.tsx src/components/Chat/ChatMessages.test.tsx src/components/Chat/chatMessageContent.tsx src/components/Chat/chatMessageContent.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/chat-markdown-content-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/chat-markdown-content-2026-03-15.md` with same-origin harness before/after notes and screenshots.
  - CDP visual verification was done through a same-origin harness that imported `ChatMessageList` directly, because the normal app shell was still blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error.
  - Verified the extracted markdown surface still rendered the heading, inline code, fenced code block, and table wrapper, and that visible search highlights still skipped fenced and inline code. The harness metrics stayed flat on highlight/code/table counts and dropped from `63` to `59` nodes overall.
- Commit hash:
  - `05ed6e4ab337890f64f20a4d8fe869a1d9f33e03`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, which is now the largest remaining render-heavy hotspot and still mixes layout math, pointer resize or drag state, snap logic, animation state, tracked git-pane behavior, and render shells.

## 2026-03-15 14:24:50 PDT

- Slice completed: extracted dock keyboard shortcut parsing and keydown listener wiring out of `ProjectChatBottomDock.tsx`
- Why this slice now:
  - At the start of the slice, `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` was the highest-ranked unresolved hotspot in `frontend/src/README.md`. The dock’s global keyboard shortcut block was already a cohesive interaction seam with strong existing Playwright coverage, so pulling it into a local owner reduced mixed responsibilities in the top windowing surface without detouring into lower-level state churn.
- Key files touched:
  - `frontend/src/components/ChatWindowing/projectChatWindowShortcuts.ts`
  - `frontend/src/components/ChatWindowing/projectChatWindowShortcuts.test.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/ChatWindowing/projectChatWindowShortcuts.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.test.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts --grep "project chat keyboard shortcuts"` attempted, but global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/ChatWindowing/projectChatWindowShortcuts.ts src/components/ChatWindowing/projectChatWindowShortcuts.test.tsx tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - No perf report was added. This was a behavior-preserving interaction ownership split with no intended render-path change.
  - CDP verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank from the unrelated `aiConfigurationCatalogLoads.ts` import error.
  - The harness verified that `Shift+Escape` toggled the dock state outside the input, the same shortcut was ignored while the input was focused, and maximize or snap shortcuts still fired through the extracted owner.
- Commit hash:
  - `17df1bc55a29074417cb1331e88a7dd30709b47a`
- Next highest-value unblocked slice:
  - Split timers and streaming-animation wiring out of `frontend/src/components/Chat/ChatMessages.tsx`, which is now back to the top unresolved hotspot after `ProjectChatBottomDock.tsx` dropped to about `4759` lines.

## 2026-03-15 14:40:40 PDT

- Slice completed: extracted chat runtime timers, timestamp helpers, count-badge animation, label scrambling, and thought-preview scroll behavior out of `ChatMessages.tsx`
- Why this slice now:
  - `frontend/src/components/Chat/ChatMessages.tsx` was still one of the top unresolved render-heavy hotspots at the start of the slice, and the timer or streaming-runtime cluster was already a cohesive local seam with existing integration coverage in the chat surface. That made it higher value than switching back to `ProjectChatBottomDock.tsx` before removing one more mixed-responsibility block from the shared chat renderer.
  - After this extraction, `ProjectChatBottomDock.tsx` is once again the largest unresolved hotspot, so the default next slice shifts back there.
- Key files touched:
  - `frontend/src/components/Chat/chatMessageRuntime.tsx`
  - `frontend/src/components/Chat/chatMessageRuntime.test.tsx`
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/chat-runtime-indicators-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Chat/chatMessageRuntime.test.tsx src/components/Chat/ChatMessages.test.tsx src/components/Chat/ChatMessages.activityThoughtPreview.test.tsx src/components/Chat/ChatMessages.streamingAnimation.test.tsx src/components/Chat/ChatMessages.lightModeToolCallSurface.test.tsx src/components/Chat/chatMessageContent.test.tsx src/components/Chat/chatAssistantActivity.test.ts src/components/Chat/chatStructuredOutput.test.tsx src/components/Chat/chatAttachmentPreviewUrls.test.ts src/components/Chat/chatAttachmentPreviews.test.tsx`
  - `pnpm -C frontend exec prettier --check src/components/Chat/ChatMessages.tsx src/components/Chat/chatMessageRuntime.tsx src/components/Chat/chatMessageRuntime.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/chat-runtime-indicators-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/chat-runtime-indicators-2026-03-15.md` with the same-origin harness context and before/after runtime-indicator observations.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell was still blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified the collapsed assistant activity row still rendered the total timer, the per-thinking timer, the count badge, and the minimized thought preview with overflow auto-scroll or pinned-bottom behavior intact.
- Commit hash:
  - `4bb14f52a615f7083fba64c8d38a94d1daee2a77`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, which is again the top unresolved hotspot at about `4759` lines and still mixes layout math, pointer resize or drag state, snap logic, animation bookkeeping, tracked git-pane behavior, and render shells.

## 2026-03-15 14:57:20 PDT

- Slice completed: extracted dock layout math, visible-window selection, and minimized-pill display calculations out of `ProjectChatBottomDock.tsx`
- Why this slice now:
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` was the top unresolved hotspot at the start of the slice, and its dock layout math was already a cohesive pure seam that sat directly on the render-heavy surface.
  - This was higher value than switching to `ChatMessages.tsx` again because the dock remained larger after the shortcut split, and moving the responsive width or visibility calculations first makes the later pointer resize or drag extraction more legible instead of forcing those interactions to keep re-deriving layout state inline.
- Key files touched:
  - `frontend/src/components/ChatWindowing/projectChatBottomDockLayout.ts`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/project-chat-bottom-dock-layout-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/ChatWindowing/ProjectChatBottomDock.test.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts --grep "project chat bottom dock narrows into a single visible window and collapses chats into a menu"` attempted, but Playwright global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/ChatWindowing/projectChatBottomDockLayout.ts src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/project-chat-bottom-dock-layout-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/project-chat-bottom-dock-layout-2026-03-15.md` with same-origin harness before/after notes and screenshots.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified that the wide `900px` viewport still showed the `Review` and `Ship` dock windows with one minimized tray pill, and that the narrow `520px` viewport still collapsed all dock windows into the overflow menu with `Plan`, `Review`, and `Ship` entries.
- Commit hash:
  - `af474fffc2b5b1656702c0103065dbae0254071d`
- Next highest-value unblocked slice:
  - Simplify the pointer resize or drag state inside `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, which is still the top unresolved hotspot at about `4421` lines now that the layout calculations live in `projectChatBottomDockLayout.ts`.

## 2026-03-15 15:07:02 PDT

- Slice completed: extracted dock preview width/height state and dock-resize pointer-session handling out of `ProjectChatBottomDock.tsx`
- Why this slice now:
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` remained the top unresolved hotspot at the start of the slice, and the dock-only resize path was the next cohesive interaction seam after keyboard shortcuts and layout math had already moved out.
  - This was higher value than switching back to `ChatMessages.tsx` because the dock was still larger, and isolating dock-resize state first removes one full pointer-interaction branch before tackling the more entangled floating drag or snap preview logic.
- Key files touched:
  - `frontend/src/components/ChatWindowing/projectChatDockResize.ts`
  - `frontend/src/components/ChatWindowing/projectChatDockResize.test.ts`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/project-chat-bottom-dock-resize-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/ChatWindowing/projectChatDockResize.test.ts src/components/ChatWindowing/ProjectChatBottomDock.test.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts --grep "project chat bottom dock auto-creates a chat and supports creating additional windows"` attempted, but Playwright global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/ChatWindowing/projectChatDockResize.ts src/components/ChatWindowing/projectChatDockResize.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/project-chat-bottom-dock-resize-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/project-chat-bottom-dock-resize-2026-03-15.md` with same-origin harness before/after notes and screenshots.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified that a bottom-right resize still clamped the dock window from `460x430` down to `280x220`, and that a fresh larger drag still expanded the same dock window to `720x610` without clipping the composer or window controls.
- Commit hash:
  - `d82bfd943f1f67ff03949731d754842b8c4b73a1`
- Next highest-value unblocked slice:
  - Simplify the floating drag/resize and snap-preview state inside `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, which is still the top unresolved hotspot at about `4227` lines now that dock shortcuts, layout math, and dock-resize state live in their own local owners.

## 2026-03-15 15:24 PDT

- Slice completed: extracted floating preview state, snap-preview state, viewport guardrails, and floating drag/resize or snap-resize pointer handling out of `ProjectChatBottomDock.tsx`
- Why this slice now:
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` was still the top unresolved hotspot at the start of the slice, and the floating interaction path was the next cohesive branch after dock shortcuts, dock layout math, and dock-resize state had already moved into local owners.
  - This was higher value than switching back to `ChatMessages.tsx` before finishing the dock because the floating interaction block still mixed batched preview state, snap-preview state, viewport guardrails, and multiple pointer-session paths directly inside the same render-heavy surface.
- Key files touched:
  - `frontend/src/components/ChatWindowing/projectChatFloatingInteractions.ts`
  - `frontend/src/components/ChatWindowing/projectChatFloatingInteractions.test.ts`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/project-chat-floating-interactions-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/ChatWindowing/projectChatFloatingInteractions.test.ts src/components/ChatWindowing/ProjectChatBottomDock.test.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts --grep "project chat floating windows keep titlebar and minimum visibility guardrails across drag and viewport changes"` attempted, but Playwright global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/ChatWindowing/projectChatFloatingInteractions.ts src/components/ChatWindowing/projectChatFloatingInteractions.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/project-chat-floating-interactions-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/project-chat-floating-interactions-2026-03-15.md` with same-origin harness before/after notes and screenshots.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified that dragging a floating window toward the top-left edge still surfaced the `top_left` snap ghost zone, that a free-floating bottom-right resize still expanded a window from `420x320` to `592x452`, and that quarter-snapped windows still exposed one vertical plus one horizontal snap-resize handle with the same `660/540` split after a `60px` drag.
- Commit hash:
  - `d84c33f8a3d973e9c47c50e24a99b3d609a85494`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Chat/ChatMessages.tsx`, which is now back to the top unresolved hotspot at about `3920` lines now that `ProjectChatBottomDock.tsx` has dropped to about `3414` lines.

## 2026-03-15 16:04:39 PDT

- Slice completed: extracted the assistant activity card shell and timeline row rendering out of `ChatMessages.tsx`
- Why this slice now:
  - At the start of the slice, `frontend/src/components/Chat/ChatMessages.tsx` was still the top-ranked unresolved hotspot in `frontend/src/README.md`, and the duplicated assistant-activity card shell was the clearest remaining local render seam.
  - This was higher value than switching back to `ProjectChatBottomDock.tsx` one slice earlier because finishing the active chat render surface removed duplicated activity-card composition, moved most of the activity-row render stack into a local owner, and materially changed the hotspot ranking for the next turn.
- Key files touched:
  - `frontend/src/components/Chat/chatAssistantActivityCard.tsx`
  - `frontend/src/components/Chat/chatAssistantActivityCard.test.tsx`
  - `frontend/src/components/Chat/chatCopyText.ts`
  - `frontend/src/components/Chat/chatMessageContent.tsx`
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/chat-assistant-activity-card-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Chat/chatAssistantActivityCard.test.tsx src/components/Chat/chatAssistantActivity.test.ts src/components/Chat/chatMessageContent.test.tsx src/components/Chat/ChatMessages.test.tsx src/components/Chat/ChatMessages.activityThoughtPreview.test.tsx src/components/Chat/ChatMessages.streamingAnimation.test.tsx src/components/Chat/ChatMessages.lightModeToolCallSurface.test.tsx`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/chat-tool-calls.spec.ts --grep "groups consecutive thoughts, actions, and tool calls under one parent activity accordion"` attempted, but Playwright global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/Chat/ChatMessages.tsx src/components/Chat/chatAssistantActivityCard.tsx src/components/Chat/chatAssistantActivityCard.test.tsx src/components/Chat/chatCopyText.ts src/components/Chat/chatMessageContent.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/chat-assistant-activity-card-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/chat-assistant-activity-card-2026-03-15.md` with same-origin harness before/after notes.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified that the grouped activity-only run still merged with the trailing assistant bubble, and that the expanded harness kept the same structural footprint before and after the extraction (`130` total DOM nodes and `46` activity-subtree nodes).
- Commit hash:
  - `b2aa7e4f3f0d16ea4fd57a0e744ebc8730258c2f`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, which is now back to the top unresolved hotspot at about `3414` lines after `ChatMessages.tsx` dropped to about `1236` lines.

## 2026-03-15 16:22:58 PDT

- Slice completed: extracted minimized-pill strip responsiveness, cycle state, manager-menu shell, and strip layout animation bookkeeping out of `ProjectChatBottomDock.tsx`
- Why this slice now:
  - At the start of the slice, `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` was still the top unresolved hotspot in `frontend/src/README.md`, and the minimized-pill strip was the remaining cohesive local owner after dock shortcuts, layout math, dock resize, and floating interactions had already moved out.
  - This was higher value than jumping to `ProjectChatHistory.tsx` immediately because the dock still had one large self-contained render/interaction seam left in the same file, and finishing that local boundary reduced cross-layer jumping without reopening a second giant surface before the current one stabilized.
- Key files touched:
  - `frontend/src/components/ChatWindowing/projectChatBottomDockPillStrip.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockPillStrip.test.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/project-chat-bottom-dock-pill-strip-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/ChatWindowing/projectChatBottomDockPillStrip.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.test.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts --grep "project chat bottom dock narrows into a single visible window and collapses chats into a menu"` attempted, but Playwright global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/ChatWindowing/projectChatBottomDockPillStrip.tsx src/components/ChatWindowing/projectChatBottomDockPillStrip.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/project-chat-bottom-dock-pill-strip-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/project-chat-bottom-dock-pill-strip-2026-03-15.md` with same-origin harness before/after notes.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified that a wide `900px` viewport still showed the `Plan`, `Review`, `Ship`, and `Launch` minimized pills with the create button and manager trigger intact, and that a narrow `500px` viewport still collapsed the strip into the manager trigger with four reopen rows after opening the menu.
- Commit hash:
  - `8b11ee3b97741f216a2004e87f5a5eab51d01345`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`, which is now the top unresolved hotspot at about `3328` lines after `ProjectChatBottomDock.tsx` dropped to about `2860` lines.

## 2026-03-15 16:37:14 PDT

- Slice completed: extracted grouped history derivation, master-search filtering/counts, thread ordering, agent badge labels, and placeholder text out of `ProjectChatHistory.tsx`
- Why this slice now:
  - At the start of the slice, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx` was the top unresolved hotspot in `frontend/src/README.md`, and the stacked derived-state block was the clearest feature-local seam.
  - This reduced mixed responsibilities in the render-heavy history surface without broad directory churn: `ProjectChatHistory.tsx` now consumes one memoized local view-model owner instead of carrying the whole grouping/search/order pipeline inline.
- Key files touched:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/project-chat-history-view-model-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-hydration-provenance.spec.ts --grep "project ai thread history excludes runs from other projects"` attempted, but Playwright global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/project-chat-history-view-model-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/project-chat-history-view-model-2026-03-15.md` with same-origin harness before/after notes and the post-slice screenshot.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified that the unfiltered seeded history still rendered `2` group rows, `5` visible thread entries, and `209` history-panel nodes after the extraction, and that entering `deploy` still produced the expected `1/2` search counter with the two matching rows (`Deploy release notes` and `Plan onboarding docs`).
- Commit hash:
  - `14c52dd34928403e01b2b4d526ba571b5fc8f56a`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Chat/ChatInput.tsx`, which is now the top unresolved hotspot at about `3121` lines after `ProjectChatHistory.tsx` dropped to about `2933` lines.

## 2026-03-15 16:52:56 PDT

- Slice completed: extracted slash-command parsing, queued-draft replay snapshots, replay signatures, and the submit or replay state machine out of `ChatInput.tsx`
- Why this slice now:
  - At the start of the slice, `frontend/src/components/Chat/ChatInput.tsx` was the top unresolved hotspot in `frontend/src/README.md`, and the slash-command plus queued-draft replay path was the clearest feature-local boundary with shared callers in both `ProjectChatCore.tsx` and `ChatArea.tsx`.
  - This was higher value than jumping back to `ProjectChatHistory.tsx` immediately because it removed a whole composer submission state machine from the active chat surface without reopening a second giant UI file before the current chat seam stabilized.
- Key files touched:
  - `frontend/src/components/Chat/chatInputSubmission.ts`
  - `frontend/src/components/Chat/chatInputSubmission.test.ts`
  - `frontend/src/components/Chat/ChatInput.tsx`
  - `frontend/src/components/Chat/ChatInput.test.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandAuthority.integration.test.ts`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/chat-input-submission-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Chat/chatInputSubmission.test.ts src/components/Chat/ChatInput.test.tsx src/components/Chat/ChatInput.submit.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandAuthority.integration.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.hydration.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.workspaceRoot.integration.test.tsx`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-app-generation-slash-commands.spec.ts --grep "project ai chat replays queued /app-json through the same app-generation path"` attempted, but Playwright global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/Chat/ChatInput.tsx src/components/Chat/chatInputSubmission.ts src/components/Chat/ChatInput.test.tsx src/components/Chat/chatInputSubmission.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Section/Layouts/ChatArea.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandAuthority.integration.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/chat-input-submission-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/chat-input-submission-2026-03-15.md` with same-origin harness before or after notes.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified that the slash-suggestion path stayed at `49` harness DOM nodes with one `/app-json` suggestion button, and that the queued `/app-json dashboard for support ops` draft path still produced one queued draft row at `58` harness DOM nodes after pressing `Enter` while `waitingForResponse` stayed `true`.
- Commit hash:
  - `7531af18974c827204f650bd4e592d2ec42d8c98`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`, which is now the top unresolved hotspot at about `2933` lines after `ChatInput.tsx` dropped to about `2597` lines.

## 2026-03-15 17:07:45 PDT

- Slice completed: extracted project-chat history DnD ids, pointer helpers, drop-target resolution, and thread/group reorder math out of `ProjectChatHistory.tsx`
- Why this slice now:
  - At the start of the slice, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx` was still the top unresolved hotspot in `frontend/src/README.md` at about `2933` lines, just ahead of `ProjectChatBottomDock.tsx`.
  - The DnD path was the clearest remaining feature-local seam in the history surface after the view-model extraction: it removed about `636` lines of mixed interaction math without broad render churn, which was higher value than switching to `ProjectChatBottomDock.tsx` or `plugins/runtime.ts` before finishing the current history boundary.
- Key files touched:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryDnd.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryDnd.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/project-chat-history-dnd-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryDnd.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-hydration-provenance.spec.ts --grep "project ai thread history excludes runs from other projects"` attempted, but Playwright global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryDnd.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryDnd.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/project-chat-history-dnd-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/project-chat-history-dnd-2026-03-15.md` with same-origin harness before/after notes.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified that the unfiltered seeded history still rendered `2` group rows, `5` visible thread entries, and the ungrouped section after the extraction, with the history-panel subtree effectively flat at `210 -> 211` nodes.
- Commit hash:
  - `db6634790465cd9fd80e255d7af15659394e4427`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, which is now the top unresolved hotspot at about `2860` lines after `ProjectChatHistory.tsx` dropped to about `2297` lines.

## 2026-03-15 17:25:22 PDT

- Slice completed: extracted shared project-vs-section window shell rendering, body selection, and header-action adaptation out of `ProjectChatBottomDock.tsx`
- Why this slice now:
  - At the start of the slice, `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` was the top unresolved hotspot in `frontend/src/README.md` at about `2860` lines.
  - The duplicated shell adapter layer across docked, floating, and maximized windows was the clearest remaining feature-local seam after shortcuts, layout math, dock resize, floating interactions, and minimized-pill strip behavior had already moved into local owners.
  - This was higher value than switching to `ChatInput.tsx` or `ProjectChatHistory.tsx` immediately because it removed one more large mixed-responsibility render branch from the same dock surface and dropped `ProjectChatBottomDock.tsx` below the next UI hotspot tier before changing domains.
- Key files touched:
  - `frontend/src/components/ChatWindowing/projectChatWindowShell.tsx`
  - `frontend/src/components/ChatWindowing/projectChatWindowShell.test.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/project-chat-bottom-dock-shells-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/ChatWindowing/projectChatWindowShell.test.tsx src/components/ChatWindowing/projectChatBottomDockPillStrip.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.test.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts --grep "project chat floating windows keep titlebar and minimum visibility guardrails across drag and viewport changes"` attempted, but Playwright global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/ChatWindowing/projectChatWindowShell.tsx src/components/ChatWindowing/projectChatWindowShell.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/project-chat-bottom-dock-shells-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/project-chat-bottom-dock-shells-2026-03-15.md` with the historical same-origin harness baseline, the post-slice rerun, and before/after screenshots.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified that the seeded shell still rendered `2` dock panels (`dock-review`, `dock-ship`), `2` floating windows (`float-debug`, `float-graph`), `1` maximized window (`max-plan`), and `0` tray pills after the extraction.
- Commit hash:
  - `e747763a41c786f2940683fb63c4afa7fa18c142`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Chat/ChatInput.tsx`, which is now the next default UI priority and a larger unresolved chat surface at about `2597` lines after `ProjectChatBottomDock.tsx` dropped to about `2400` lines.

## 2026-03-15 17:42:11 PDT

- Slice completed: extracted browser/provider dictation lifecycle, provider fallback policy, transcript insertion, and dictation state out of `ChatInput.tsx`
- Why this slice now:
  - At the start of the slice, `frontend/src/components/Chat/ChatInput.tsx` was still the next default UI priority in the current cleanup pivot and remained one of the larger unresolved chat surfaces at about `2597` lines.
  - The dictation/transcription path was the clearest remaining feature-local seam after submission or queued-draft replay had already moved into `chatInputSubmission.ts`: it carried its own browser/provider capability checks, recorder lifecycle, fallback policy, cleanup, and transcript insertion without needing broader composer rewrites.
  - This was higher value than jumping back to `ProjectChatHistory.tsx` immediately because it removed another cohesive interaction subsystem from the active chat surface and dropped `ChatInput.tsx` to about `2117` lines before changing domains again.
- Key files touched:
  - `frontend/src/components/Chat/useChatInputDictation.ts`
  - `frontend/src/components/Chat/useChatInputDictation.test.tsx`
  - `frontend/src/components/Chat/ChatInput.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/chat-input-dictation-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Chat/useChatInputDictation.test.tsx src/components/Chat/ChatInput.test.tsx src/components/Chat/ChatInput.submit.test.tsx`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-app-generation-slash-commands.spec.ts --grep "project ai chat replays queued /app-json through the same app-generation path"` attempted, but Playwright global setup failed because the app shell is still blocked by the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
  - `pnpm -C frontend exec prettier --check src/components/Chat/ChatInput.tsx src/components/Chat/useChatInputDictation.ts src/components/Chat/useChatInputDictation.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/chat-input-dictation-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/chat-input-dictation-2026-03-15.md` with the same-origin harness baseline notes, the post-slice rerun, and before/after screenshots.
  - CDP visual verification was done through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell remained blank due to the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing).
  - Verified that the composer still rendered `Mic`, `Send message`, `context left 25%`, `1 background terminal active`, and `2 subagents active`, and that clicking the mic control still switched it to `Stop Mic` with the listening status row visible in the accessibility tree.
- Commit hash:
  - `61a70646a6748aae5a62b668662338a74d1dda43`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`, which is now the next unresolved default-priority chat/project-AI hotspot at about `2297` lines after `ChatInput.tsx` dropped to about `2117` lines.

## 2026-03-15 18:09:36 PDT

- Slice completed: extracted the project-chat settings popover surface and
  engine-selection rules out of `ProjectChat.tsx`
- Why this slice now:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
    was still the highest-priority project-AI front-door surface in the current
    cleanup order, even after earlier chat/windowing slices reduced other files.
  - The settings popover plus engine/model/config selection rules were the
    clearest remaining feature-local seam inside that entry surface: they mixed
    render-heavy toolbar UI with thread-engine reconciliation and default-engine
    selection logic.
  - This was higher value than jumping straight to `ProjectChatCore.tsx` or
    `ProjectAISettings.tsx` because it cut `ProjectChat.tsx` from about `2721`
    lines to about `2091` while making the settings owner obvious from the
    caller.
- Key files touched:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSettingsPopover.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSelection.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSelection.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatThreadVisibility.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSwitchContinuation.integration.test.ts`
  - `frontend/src/state/actions/websocketIncomingMessages.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/projectChatThreadVisibility.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSwitchContinuation.integration.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSelection.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx`
  - `pnpm -C frontend exec vitest run src/state/actions/websocketReceive.test.ts src/state/actions/aiConfigurationCatalogs.test.ts`
  - `pnpm -C frontend exec prettier --check src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatSettingsPopover.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSelection.ts src/components/Panes/Overview/ProjectLevelAI/projectChatThreadVisibility.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSwitchContinuation.integration.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatEngineSelection.test.ts src/state/actions/websocketIncomingMessages.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - No perf report was added because this slice was a behavior-preserving
    ownership extraction without meaningful render-path changes.
  - CDP visual verification was done on `http://127.0.0.1:3002/desert_wise`
    after fixing the unrelated app-shell boot blocker in
    `websocketIncomingMessages.ts`.
  - Verified that the `Project AI Settings` popover still opens from the
    project chat toolbar, shows the engine/transcription/microphone/model/tools
    and activity controls, and that the `Skills` quick-link still routes into
    the aux view.
- Commit hash:
  - `9788f9be9903b8835618f26a1c66c5eb248adcca`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`,
    which is now the next default-priority front-door surface in the same
    project-AI path after `ProjectChat.tsx` delegated settings and engine
    selection to local owners.

## 2026-03-15 18:21:49 PDT

- Slice completed: extracted the project-chat empty-state workspace-root
  preflight and starter-prompt ownership out of `ProjectChatCore.tsx`
- Why this slice now:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
    was the next default-priority front-door surface after the `ProjectChat.tsx`
    settings and engine-selection extraction.
  - The empty-chat branch was the clearest remaining feature-local seam in that
    entry surface: it mixed workspace-root polling, python-signal probing,
    create-project prompt adaptation, and render-heavy starter-button UI into a
    file that also owns hydration, slash-command authority, and submit/edit
    orchestration.
  - This was higher value than jumping ahead to `ProjectAISettings.tsx` or
    `FileBrowserPane.tsx` because it removed one named mixed responsibility from
    the active project-AI front door and cut `ProjectChatCore.tsx` from about
    `2381` lines to about `2089` while making the new owner obvious from the
    caller.
- Key files touched:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEmptyState.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatEmptyState.workspaceRoot.integration.test.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.hydration.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatEmptyState.workspaceRoot.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatStarterPrompts.test.ts src/components/Panes/Overview/ProjectLevelAI/workspacePythonSignals.test.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-root-scan.spec.ts --grep "project chat avoids overlapping root scans while a folder request is in flight|project chat keeps create-project starter visible when a new root scan cannot resolve python signals"`
  - `pnpm -C frontend exec prettier --check src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatEmptyState.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatEmptyState.workspaceRoot.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - No perf report was added because this slice was a behavior-preserving
    ownership extraction without meaningful render-path changes.
  - CDP visual verification was done on `http://127.0.0.1:3002/desert_wise`.
  - Verified that both the overview-pane and docked-window empty states still
    rendered the `CREATE PROJECT`, `SUMMARIZE CODEBASE`, and `PLAN NEXT STEPS`
    buttons, and that clicking the overview-pane `CREATE PROJECT` button still
    submitted the full starter prompt while the docked window remained on the
    untouched empty-state surface.
- Commit hash:
  - `18ca451fb1805b30d450c5532d45a6764be8c8ff`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`,
    which is now the next unresolved default-priority front-door hotspot in the
    same project-AI path after `ProjectChatCore.tsx` delegated empty-state
    workspace preflight to a local owner.

## 2026-03-15 18:33:38 PDT

- Slice completed: extracted the external-agent settings surface out of
  `ProjectAISettings.tsx`
- Why this slice now:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
    was still the next unresolved project-AI front-door surface after the
    `ProjectChatCore.tsx` empty-state extraction.
  - The external-agent branch was its largest cohesive mixed responsibility: it
    combined per-config selection state, tool-type/run-mode reconciliation,
    Claude/OpenCode-specific validation, managed-settings assembly, and a
    render-heavy form shell inside the same entry surface that also owns
    accordion composition, deployment-mode gating, guardrails, and the other
    settings managers.
  - This was higher value than jumping ahead to
    `ProjectChatSkillsMcpViewer.tsx` or `FileBrowserPane.tsx` because it
    removed one whole settings subsystem from the active project-AI front door,
    cut `ProjectAISettings.tsx` from about `2444` lines to about `1471`, and
    made the external-agent owner obvious from the caller.
- Key files touched:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsExternalAgents.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsExternalAgents.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsFormControls.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsFormUtils.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/projectAISettingsExternalAgents.test.ts src/components/Panes/Overview/ProjectLevelAI/projectAISettingsTranscriptionProfileValidation.test.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/plugins/plugin-external-agent.spec.ts`
  - `pnpm -C frontend exec prettier --check src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx src/components/Panes/Overview/ProjectLevelAI/projectAISettingsExternalAgents.tsx src/components/Panes/Overview/ProjectLevelAI/projectAISettingsExternalAgents.test.ts src/components/Panes/Overview/ProjectLevelAI/projectAISettingsFormControls.tsx src/components/Panes/Overview/ProjectLevelAI/projectAISettingsFormUtils.ts src/components/Panes/Overview/ProjectLevelAI/projectAISettingsTranscriptionProfileValidation.test.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `git diff --check`
- Perf/CDP notes:
  - No perf report was added because this slice was a behavior-preserving
    ownership extraction without meaningful render-path changes.
  - CDP visual verification was done on `http://127.0.0.1:3002/desert_wise`.
  - Verified that the Project AI Settings surface still opens from the project
    chat toolbar, that the `EXTERNAL AGENTS` accordion still renders the
    existing agent list plus full Claude form fields, that `New External Agent`
    still opens a blank draft form, and that switching the new draft to
    `opencode` still reveals the OpenCode permission and MCP JSON fields.
- Commit hash:
  - `aadaf0a572d95c24281781abeb7e508fdacf8389`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`,
    which is now the largest unresolved project-AI front-door hotspot after
    `ProjectAISettings.tsx` delegated external-agent settings to a local owner.

## 2026-03-15 18:50:34 PDT

- Slice completed: extracted the slash-commands surface out of
  `ProjectChatSkillsMcpViewer.tsx`
- Why this slice now:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
    was still a `2478`-line front-door project-AI hotspot after the
    `ProjectAISettings.tsx` external-agent extraction.
  - The `slash_commands` branch was its clearest remaining feature-local seam:
    it combined engine-tab selection, agent-run polling, native-command
    authority handling, custom slash-command draft state, and a large render
    branch inside the same file that also owns the skills browser and MCP
    runtime viewer.
  - This was higher value than jumping straight to
    `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
    because it removed one whole user-facing mode from the active project-AI
    entry surface, cut `ProjectChatSkillsMcpViewer.tsx` to about `1661` lines,
    and made the slash-command owner obvious from the caller.
- Key files touched:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsView.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsViewState.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsViewState.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/project-chat-slash-commands-view-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsViewState.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.perf.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerSkillUpsert.integration.test.ts`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-skills-mcp-viewer.spec.ts --grep "project ai chat can open slash commands in a dedicated side view|project ai chat keeps custom slash commands available without engine configs|project ai chat only fetches agent runs for slash commands"`
  - `pnpm -C frontend exec prettier --check src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/project-chat-slash-commands-view-2026-03-15.md src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsView.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsViewState.ts src/components/Panes/Overview/ProjectLevelAI/projectChatSlashCommandsViewState.test.ts`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/project-chat-slash-commands-view-2026-03-15.md`
    with the baseline and rerun notes for the same `AI Settings -> Slash Commands`
    tab-switch interaction.
  - DevTools inline trace summary for that interaction reported `244ms` observed
    INP before the extraction and `140ms` after, so the slice did not regress
    the slash-view switch path.
  - CDP visual verification was done on `http://127.0.0.1:3002/desert_wise`.
  - Verified that the extracted slash view still renders the custom-command
    form plus engine tabs, that entering a command and prompt still enables the
    `Add slash command` action, and that the unsaved draft survives
    `Slash Commands -> Skills -> Slash Commands`.
- Commit hash:
  - `4fecd1b19b4243c4f6ea4b0b84d86539a0e14ff4`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`,
    which is now the highest unresolved front-door hotspot in
    `frontend/src/README.md` after `ProjectChatSkillsMcpViewer.tsx` delegated
    slash-command ownership to a local view owner.

## 2026-03-15 19:07:57 PDT

- Slice completed: extracted the file-browser tree-data transport and view
  model out of `FileBrowserPane.tsx`
- Why this slice now:
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
    was still the highest unresolved front-door hotspot in the current README
    and cleanup-plan priority order after the project-AI slash-command
    extraction.
  - The tree-data branch was its clearest mixed responsibility: it combined
    root bootstrap, per-folder request ownership, recursive-search crawling,
    preview URL refresh, tree flatten/filter/sort derivation, and navigation
    view state inside the same entry surface that also owns transfer commands,
    keyboard handling, and row/filter render shells.
  - This was higher value than jumping ahead to
    `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` because
    it removed one whole transport/view-model subsystem from the active
    file-browser front door, cut `FileBrowserPane.tsx` from about `2403` lines
    to about `1392`, and made the new tree-data owners obvious from the caller.
- Key files touched:
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  - `frontend/src/components/Panes/Overview/FileBrowser/fileBrowserPaneTreeModel.ts`
  - `frontend/src/components/Panes/Overview/FileBrowser/useFileBrowserPaneTreeData.ts`
  - `frontend/src/components/Panes/Overview/FileBrowser/useFileBrowserPaneTreeData.integration.test.tsx`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.test.ts`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-panes-and-authoring-cleanup-plan.md`
  - `perf/reports/frontend/file-browser-pane-tree-data-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/FileBrowser/FileBrowserPane.test.ts src/components/Panes/Overview/FileBrowser/useFileBrowserPaneTreeData.integration.test.tsx src/components/Panes/Overview/FileBrowser/FileBrowserWorkspace.test.ts src/components/Panes/Overview/FileBrowser/FileBrowserUniversalPreview.test.ts src/components/Section/Layouts/BrowserArea.test.tsx`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/file-browser/browser-path-navigation.spec.ts frontend/tests/e2e/file-browser/browser-transfer-and-drop.spec.ts --grep "overview file browser shows dotfiles and supports breadcrumb up-navigation|browser sections support breadcrumb and go-up navigation|browser list moves files/folders by drag and ignores file shortcuts while filter is focused"`
  - `pnpm -C frontend exec prettier --check src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx src/components/Panes/Overview/FileBrowser/FileBrowserPane.test.ts src/components/Panes/Overview/FileBrowser/fileBrowserPaneTreeModel.ts src/components/Panes/Overview/FileBrowser/useFileBrowserPaneTreeData.ts src/components/Panes/Overview/FileBrowser/useFileBrowserPaneTreeData.integration.test.tsx src/components/Section/Layouts/BrowserArea.test.tsx src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-panes-and-authoring-cleanup-plan.md ../perf/reports/frontend/file-browser-pane-tree-data-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/file-browser-pane-tree-data-2026-03-15.md`
    with the before/after CDP trace for the same overview explorer interaction.
  - DevTools inline trace summary for `Expand folder frontend` reported `80ms`
    observed INP before the extraction and `83ms` after, so the slice stayed
    effectively flat on the measured interaction.
  - CDP visual verification was done on `http://127.0.0.1:3002/desert_wise`.
  - Verified that the overview explorer still loads the workspace root,
    expands `frontend` to reveal nested rows like `src`, and keeps the search
    scope popover anchored with both `Recursive search` and `Local search`
    options visible.
- Commit hash:
  - `f36f09857edf5b1e6f2a0150c27bdb8f7f997b00`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`,
    which is now the next unresolved default-priority front-door hotspot after
    `FileBrowserPane.tsx` delegated tree-data ownership to feature-local
    owners.

## 2026-03-15 19:24:05 PDT

- Slice completed: extracted the project-chat docked, floating, and maximized
  window render shells out of `ProjectChatBottomDock.tsx`
- Why this slice now:
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` was
    still the active default-priority front-door hotspot in the README and
    windowing companion plan after the file-browser tree-data slice.
  - Its largest remaining mixed responsibility was no longer the interaction
    math but the placement-shell rendering itself: docked panels, floating
    windows, maximized windows, and their repeated action-spec assembly still
    lived inline inside the main coordinator.
  - This was higher value than jumping ahead to
    `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
    because the existing dock-layout, resize, floating-interaction, pill-strip,
    and shared-window-shell seams already made it possible to remove one whole
    render responsibility cleanly in one turn, cutting
    `ProjectChatBottomDock.tsx` from about `2400` lines to about `1658`.
- Key files touched:
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockTypes.ts`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockSurfaceHelpers.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatDockedWindowsSurface.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatFloatingWindowsLayer.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatMaximizedWindowSurface.tsx`
  - `frontend/src/components/ChatWindowing/projectChatBottomDockSurfaceHelpers.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/project-chat-bottom-dock-window-surfaces-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/ChatWindowing/projectChatBottomDockSurfaceHelpers.test.tsx src/components/ChatWindowing/ProjectChatBottomDock.test.ts src/components/ChatWindowing/projectChatBottomDockPillStrip.test.tsx src/components/ChatWindowing/projectChatWindowShell.test.tsx`
  - `pnpm -C frontend exec vite build`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts --grep "project chat bottom dock auto-creates a chat and supports creating additional windows|project chat windows support floating drag/resize, z-order focus, and maximize restore"`
  - `pnpm -C frontend exec prettier --check src/components/ChatWindowing/ProjectChatBottomDock.tsx src/components/ChatWindowing/ProjectChatDockedWindowsSurface.tsx src/components/ChatWindowing/ProjectChatFloatingWindowsLayer.tsx src/components/ChatWindowing/ProjectChatMaximizedWindowSurface.tsx src/components/ChatWindowing/projectChatBottomDockSurfaceHelpers.tsx src/components/ChatWindowing/projectChatBottomDockSurfaceHelpers.test.tsx src/components/ChatWindowing/projectChatBottomDockTypes.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/project-chat-bottom-dock-window-surfaces-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/project-chat-bottom-dock-window-surfaces-2026-03-15.md`
    with the before/after CDP trace for the same docked-window undock flow.
  - DevTools inline trace summary for `Undock Chat Window 1` reported `344ms`
    observed INP before the extraction and `362ms` after; that stayed in the
    same range for this single headed-CDP run and did not show a visible
    regression.
  - CDP visual verification was done on `http://127.0.0.1:3002/desert_wise`.
  - Verified that the extracted floating window still renders after undocking,
    maximizing from that floating surface still shows the restore/dock controls,
    and the canvas-visibility toggle still appears while maximized.
- Commit hash:
  - `611db33dbf27b5c01e8280e3fa0538445ef0096c`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`,
    which is now the next unresolved default-priority front-door hotspot in the
    README and chat/windowing companion plan after `ProjectChatBottomDock.tsx`
    delegated the placement shells to local owners.

## 2026-03-15 19:50:44 PDT

- Slice completed: extracted the project-chat history render owners out of
  `ProjectChatHistory.tsx`
- Why this slice now:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
    was still the top unresolved same-domain front-door hotspot in the README
    and chat/windowing companion plan after the dock-window surface slice.
  - The existing history view-model and DnD seams already handled derivation
    and interaction math, so the highest-value remaining responsibility was the
    render tree itself: toolbar/header shell, empty state, grouped/ungrouped
    folder shells, and thread-row chrome still lived inline in the coordinator.
  - This was higher value than jumping straight to
    `frontend/src/components/Section/Layouts/BrowserArea.tsx` because it
    removed one whole mixed responsibility from the active project-AI entry
    surface in a single slice and cut `ProjectChatHistory.tsx` from about
    `2297` lines to about `914`.
- Key files touched:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryPanel.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadFolders.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadEntry.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.test.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryPanel.test.tsx`
  - `frontend/src/README.md`
  - `docs/plans/frontend-cleanup-plan.md`
  - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md`
  - `perf/reports/frontend/project-chat-history-render-owners-2026-03-15.md`
- Tests and verification run:
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryPanel.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryViewModel.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryDnd.test.ts`
  - `pnpm -C frontend exec vite build`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-threads.spec.ts --grep "project ai shows styled empty state when no threads exist|project ai threads render folder groups and keep pinned scopes separate|project ai conversation search dedupes duplicate terms and ignores code-only matches"`
  - `pnpm -C frontend exec prettier --check src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryPanel.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadFolders.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryThreadEntry.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryPanel.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHistoryCopy.ts src/README.md ../docs/plans/frontend-cleanup-plan.md ../docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md ../perf/reports/frontend/project-chat-history-render-owners-2026-03-15.md`
  - `git diff --check`
- Perf/CDP notes:
  - Added `perf/reports/frontend/project-chat-history-render-owners-2026-03-15.md`
    with the before/after CDP trace for the same history-toolbar interaction.
  - DevTools inline trace summary for `Hide thread engine badges` reported
    `45ms` observed INP before the extraction and `32ms` after, with `0.00`
    CLS in both runs.
  - CDP visual verification was done on `http://127.0.0.1:3002/desert_wise`.
  - Verified that the extracted history toolbar still renders in the thread
    header, `New Group` still creates an editable group row, and the
    ungrouped thread list still renders beneath the new group shell.
- Commit hash:
  - `97d908b2e2d3f378531f6d286105b5c331d22380`
- Next highest-value unblocked slice:
  - Simplify `frontend/src/components/Section/Layouts/BrowserArea.tsx`, which
    is now the top unresolved default-priority front-door hotspot in the README
    and cleanup plan after `ProjectChatHistory.tsx` delegated the history panel
    and row render shells to local owners.
