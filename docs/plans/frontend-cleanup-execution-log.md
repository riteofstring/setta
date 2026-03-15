# Frontend Cleanup Execution Log

Append-only log of completed frontend cleanup slices.

Use [frontend/src/README.md](../../frontend/src/README.md) as the current
module map and placement guide while this cleanup progresses.

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
