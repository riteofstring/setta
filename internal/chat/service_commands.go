package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/workspace"
)

func (service *Service) ListCommands(workspaceID string, conversationID string) (ChatCommandListResult, error) {
	workspaceSummary, err := service.validateConversationRequest(workspaceID, conversationID)
	if err != nil {
		return ChatCommandListResult{}, err
	}
	executor, err := service.commandExecutor()
	if err != nil {
		return ChatCommandListResult{}, err
	}

	service.mu.Lock()
	conversation, activeRun, err := service.commandConversationStateLocked(workspaceID, conversationID)
	service.mu.Unlock()
	if err != nil {
		return ChatCommandListResult{}, err
	}

	result, err := executor.ListCommandCapabilities(context.Background(), HarnessCommandListRequest{
		ActiveRun:    activeRun,
		Conversation: conversation,
		ThreadRef:    latestHarnessRef(conversation, HarnessCodex),
		Workspace:    workspaceSummary,
	})
	if err != nil {
		return ChatCommandListResult{}, err
	}
	if result.Commands == nil {
		result.Commands = []ChatCommandDescriptor{}
	}
	return ChatCommandListResult{Commands: result.Commands}, nil
}

type ChatCommandExecutionOptions struct {
	ConfirmGoalReplacement bool
}

func (service *Service) ExecuteChatCommand(workspaceID string, conversationID string, raw string) (ChatCommandExecuteResult, error) {
	return service.ExecuteChatCommandWithOptions(workspaceID, conversationID, raw, ChatCommandExecutionOptions{})
}

func (service *Service) ExecuteChatCommandWithOptions(workspaceID string, conversationID string, raw string, options ChatCommandExecutionOptions) (ChatCommandExecuteResult, error) {
	command, err := ParseChatCommand(raw)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	return service.executeChatCommand(workspaceID, conversationID, command, options)
}

func (service *Service) SetChatCodexModel(workspaceID string, conversationID string, modelID string) (ChatCommandExecuteResult, error) {
	command, err := modelSetChatCommand(modelID)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	return service.executeChatCommand(workspaceID, conversationID, command, ChatCommandExecutionOptions{})
}

func (service *Service) OpenChatCodexModelPicker(workspaceID string, conversationID string) (ChatCommandExecuteResult, error) {
	return service.executeChatCommand(workspaceID, conversationID, modelPickerChatCommand(), ChatCommandExecutionOptions{})
}

func (service *Service) SetChatCodexReasoningEffort(workspaceID string, conversationID string, effort ReasoningEffort) (ChatCommandExecuteResult, error) {
	command, err := reasoningEffortSetChatCommand(effort)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	return service.executeChatCommand(workspaceID, conversationID, command, ChatCommandExecutionOptions{})
}

func (service *Service) executeChatCommand(workspaceID string, conversationID string, command ChatCommand, options ChatCommandExecutionOptions) (ChatCommandExecuteResult, error) {
	workspaceSummary, err := service.validateConversationRequest(workspaceID, conversationID)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	executor, err := service.commandExecutor()
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}

	service.mu.Lock()
	state, err := service.prepareCommandExecutionLocked(workspaceID, conversationID, command, options)
	service.mu.Unlock()
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}

	request := commandRequest(workspaceSummary, state.conversation, state.activeRun, command)
	harnessResult, continuation, err := service.executeCommandRequest(context.Background(), executor, request, state.startGoalContinuation)
	if shouldRetryCommandWithMissingHarnessRef(command, err) {
		var refErr *HarnessRefUnavailableError
		errors.As(err, &refErr)
		if markErr := service.markHarnessRefUnavailable(workspaceID, conversationID, "", refErr); markErr != nil {
			return ChatCommandExecuteResult{}, markErr
		}

		service.mu.Lock()
		state, err = service.prepareCommandExecutionLocked(workspaceID, conversationID, command, options)
		service.mu.Unlock()
		if err != nil {
			return ChatCommandExecuteResult{}, err
		}
		request = commandRequest(workspaceSummary, state.conversation, state.activeRun, command)
		harnessResult, continuation, err = service.executeCommandRequest(context.Background(), executor, request, state.startGoalContinuation)
	}
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()
	return service.persistCommandResultLocked(workspaceSummary, workspaceID, conversationID, command, harnessResult, continuation, state.startGoalContinuation)
}

type commandExecutionState struct {
	conversation          Conversation
	activeRun             *Run
	startGoalContinuation bool
}

func (service *Service) prepareCommandExecutionLocked(workspaceID string, conversationID string, command ChatCommand, options ChatCommandExecutionOptions) (commandExecutionState, error) {
	conversation, activeRun, err := service.commandConversationStateLocked(workspaceID, conversationID)
	if err != nil {
		return commandExecutionState{}, err
	}
	if err := service.ensureNoCommandCancellationDrainLocked(workspaceID, conversationID); err != nil {
		return commandExecutionState{}, err
	}
	if err := ensureCommandAvailable(command, activeRun); err != nil {
		return commandExecutionState{}, err
	}
	if err := service.ensureGoalReplacementConfirmedLocked(workspaceID, conversationID, command, options); err != nil {
		return commandExecutionState{}, err
	}
	state := commandExecutionState{
		activeRun:             activeRun,
		conversation:          conversation,
		startGoalContinuation: commandMayStartGoalContinuation(command, activeRun),
	}
	if state.startGoalContinuation {
		err = service.ensureCanStartTurnLocked(workspaceID, conversationID, activeKey(workspaceID, conversationID))
	}
	return state, err
}

func (service *Service) ensureNoCommandCancellationDrainLocked(workspaceID string, conversationID string) error {
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	if !ok || active.workspaceID != workspaceID || !active.cancelDrain {
		return nil
	}
	return fmt.Errorf("conversation already has an active turn: %s", conversationID)
}

func (service *Service) ensureGoalReplacementConfirmedLocked(workspaceID string, conversationID string, command ChatCommand, options ChatCommandExecutionOptions) error {
	if command.Kind != ChatCommandGoal || command.Goal == nil || command.Goal.Action != GoalCommandSet {
		return nil
	}
	current, err := service.store.LoadGoal(workspaceID, conversationID)
	if err != nil {
		return err
	}
	if !goalReplacementRequiresConfirmation(current, command.Goal.Objective) || options.ConfirmGoalReplacement {
		return nil
	}
	return commandError(ChatCommandErrorGoalReplaceConfirm, "Replacing the current goal requires confirmation.", nil)
}

func goalReplacementRequiresConfirmation(current *ChatGoalState, objective string) bool {
	if current == nil || goalStatusIsTerminal(current.Status) {
		return false
	}
	return strings.TrimSpace(current.Objective) != strings.TrimSpace(objective)
}

func goalStatusIsTerminal(status string) bool {
	return status == "complete"
}

func (service *Service) executeCommandRequest(ctx context.Context, executor HarnessCommandExecutor, request HarnessCommandRequest, startGoalContinuation bool) (HarnessCommandResult, HarnessGoalContinuation, error) {
	if !startGoalContinuation {
		result, err := executor.ExecuteCommand(ctx, request)
		return result, nil, err
	}
	starter, ok := service.harness.(HarnessGoalContinuationStarter)
	if !ok {
		return HarnessCommandResult{}, nil, commandError(ChatCommandErrorUnsupportedHarness, "selected harness does not support goal continuation", nil)
	}
	return starter.BeginGoalContinuation(ctx, request)
}

func commandRequest(workspaceSummary workspace.WorkspaceSummary, conversation Conversation, activeRun *Run, command ChatCommand) HarnessCommandRequest {
	return HarnessCommandRequest{
		ActiveRun:    activeRun,
		Command:      command,
		Conversation: conversation,
		ThreadRef:    latestHarnessRef(conversation, HarnessCodex),
		Workspace:    workspaceSummary,
	}
}

func shouldRetryCommandWithMissingHarnessRef(command ChatCommand, err error) bool {
	if err == nil || command.Kind != ChatCommandModel {
		return false
	}
	var refErr *HarnessRefUnavailableError
	return errors.As(err, &refErr)
}

func (service *Service) commandExecutor() (HarnessCommandExecutor, error) {
	executor, ok := service.harness.(HarnessCommandExecutor)
	if !ok {
		return nil, commandError(ChatCommandErrorUnsupportedHarness, "selected harness does not support chat commands", nil)
	}
	return executor, nil
}

func (service *Service) commandConversationStateLocked(workspaceID string, conversationID string) (Conversation, *Run, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, nil, err
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, nil, err
	}
	run, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return Conversation{}, nil, err
	}
	if !ok {
		return conversation, nil, nil
	}
	return conversation, &run, nil
}

func (service *Service) persistCommandResultLocked(
	workspaceSummary workspace.WorkspaceSummary,
	workspaceID string,
	conversationID string,
	command ChatCommand,
	harnessResult HarnessCommandResult,
	continuation HarnessGoalContinuation,
	startGoalContinuation bool,
) (executeResult ChatCommandExecuteResult, err error) {
	continuationStarted := false
	defer func() {
		if err != nil && continuation != nil && !continuationStarted {
			continuation.Close()
		}
	}()

	conversation, now, err := service.persistCommandMetadataLocked(workspaceID, conversationID, harnessResult)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}

	result := commandResult(command, harnessResult)
	message, err := service.persistCommandMessageLocked(workspaceID, conversationID, conversation, result, now)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	if err := service.persistCommandGoalStateLocked(workspaceID, conversationID, "", command, result); err != nil {
		return ChatCommandExecuteResult{}, err
	}
	if err := service.maybeStartGoalContinuationLocked(workspaceSummary, conversationID, command, result, continuation, startGoalContinuation, &continuationStarted); err != nil {
		return ChatCommandExecuteResult{}, err
	}

	page, err := service.loadMessagePageLocked(workspaceID, conversationID, 0, defaultPageLimit)
	if err != nil {
		return ChatCommandExecuteResult{}, err
	}
	return ChatCommandExecuteResult{
		Conversation: page.Conversation,
		Message:      message,
		Page:         page,
		Result:       result,
	}, nil
}

func (service *Service) persistCommandMetadataLocked(workspaceID string, conversationID string, harnessResult HarnessCommandResult) (Conversation, string, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, "", err
	}
	now := timestamp(service.now())
	conversation, err = service.persistCommandThreadRefLocked(workspaceID, conversationID, conversation, harnessResult, now)
	if err != nil {
		return Conversation{}, "", err
	}
	conversation, err = service.persistCommandCodexMetadataLocked(workspaceID, conversationID, conversation, harnessResult, now)
	if err != nil {
		return Conversation{}, "", err
	}
	return conversation, now, nil
}

func (service *Service) maybeStartGoalContinuationLocked(
	workspaceSummary workspace.WorkspaceSummary,
	conversationID string,
	command ChatCommand,
	result ChatCommandResult,
	continuation HarnessGoalContinuation,
	startGoalContinuation bool,
	continuationStarted *bool,
) error {
	if !startGoalContinuation {
		return nil
	}
	started, err := service.startGoalContinuationLocked(workspaceSummary, conversationID, command, result, continuation)
	*continuationStarted = started
	return err
}

func (service *Service) persistCommandGoalStateLocked(workspaceID string, conversationID string, runID string, command ChatCommand, result ChatCommandResult) error {
	if command.Kind != ChatCommandGoal || command.Goal == nil {
		return nil
	}
	switch command.Goal.Action {
	case GoalCommandClear:
		return service.updateGoalStateLocked(workspaceID, conversationID, runID, nil)
	case GoalCommandShow, GoalCommandEdit, GoalCommandSet, GoalCommandPause, GoalCommandResume:
		return service.updateGoalStateLocked(workspaceID, conversationID, runID, result.Goal)
	default:
		return nil
	}
}

func commandMayStartGoalContinuation(command ChatCommand, activeRun *Run) bool {
	if activeRun != nil || command.Kind != ChatCommandGoal || command.Goal == nil {
		return false
	}
	return command.Goal.Action == GoalCommandSet || command.Goal.Action == GoalCommandResume
}

func (service *Service) startGoalContinuationLocked(workspaceSummary workspace.WorkspaceSummary, conversationID string, command ChatCommand, result ChatCommandResult, continuation HarnessGoalContinuation) (bool, error) {
	prompt, ok := goalContinuationPrompt(command, result.Goal)
	if !ok {
		if continuation != nil {
			continuation.Close()
		}
		return false, nil
	}
	if continuation == nil {
		return false, commandError(ChatCommandErrorUnsupportedHarness, "goal continuation was not started by the harness", nil)
	}
	key := activeKey(workspaceSummary.ID, conversationID)
	if err := service.ensureCanStartTurnLocked(workspaceSummary.ID, conversationID, key); err != nil {
		return false, err
	}

	now := timestamp(service.now())
	conversation, _, assistantMessage, run, err := service.persistTurnStartWithDeliveryLocked(workspaceSummary.ID, conversationID, prompt, MessageDeliveryGoal, now)
	if err != nil {
		return false, err
	}
	ingest, err := service.newTranscriptIngestLocked(workspaceSummary.ID, run)
	if err != nil {
		return false, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	service.active[key] = activeTurn{
		assistantMessage: assistantMessage,
		cancel:           cancel,
		goalContinuation: continuation,
		runID:            run.ID,
		workspaceID:      workspaceSummary.ID,
		transcript:       ingest,
	}
	request := TurnRequest{
		Workspace:    workspaceSummary,
		Conversation: conversation,
		Run:          run,
		Prompt:       prompt,
		ThreadRef:    latestHarnessRef(conversation, HarnessCodex),
	}
	go service.runHarnessGoalContinuation(ctx, request, continuation)
	return true, nil
}

func goalContinuationPrompt(command ChatCommand, goal *ChatGoalState) (string, bool) {
	if command.Goal == nil || goal == nil || goal.Status != "active" {
		return "", false
	}
	switch command.Goal.Action {
	case GoalCommandSet, GoalCommandResume:
	default:
		return "", false
	}
	objective := strings.TrimSpace(goal.Objective)
	if objective == "" {
		objective = strings.TrimSpace(command.Goal.Objective)
	}
	return objective, objective != ""
}

func (service *Service) persistCommandThreadRefLocked(workspaceID string, conversationID string, conversation Conversation, harnessResult HarnessCommandResult, now string) (Conversation, error) {
	if !harnessResult.HasThreadRef {
		return conversation, nil
	}
	conversation = commandConversationWithThreadRef(conversation, harnessResult.ThreadRef, now)
	if err := service.store.SaveConversation(conversation); err != nil {
		return Conversation{}, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, ""); err != nil {
		return Conversation{}, err
	}
	return conversation, nil
}

func (service *Service) persistCommandCodexMetadataLocked(workspaceID string, conversationID string, conversation Conversation, harnessResult HarnessCommandResult, now string) (Conversation, error) {
	changed := false
	if harnessResult.CodexSettings != nil {
		conversation.CodexSettings = harnessResult.CodexSettings
		changed = true
	}
	if harnessResult.CodexEffectiveSettings != nil {
		conversation.CodexEffectiveSettings = harnessResult.CodexEffectiveSettings
		changed = true
	}
	if !changed {
		return conversation, nil
	}
	conversation.UpdatedAt = now
	if err := service.store.SaveConversation(conversation); err != nil {
		return Conversation{}, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, ""); err != nil {
		return Conversation{}, err
	}
	return conversation, nil
}

func (service *Service) persistCommandMessageLocked(workspaceID string, conversationID string, conversation Conversation, result ChatCommandResult, now string) (*ChatMessage, error) {
	if result.Action == ChatCommandResultDisplay {
		commandMessage, err := service.newCommandMessage(workspaceID, conversationID, result.Message, now)
		if err != nil {
			return nil, err
		}
		conversation.UpdatedAt = now
		if err := service.store.SaveMessage(workspaceID, commandMessage); err != nil {
			return nil, err
		}
		if err := service.store.SaveConversation(conversation); err != nil {
			return nil, err
		}
		if _, err := service.events.Publish(NewMessageCreatedEvent(workspaceID, conversationID, "", commandMessage)); err != nil {
			return nil, err
		}
		if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, ""); err != nil {
			return nil, err
		}
		return &commandMessage, nil
	}
	return nil, nil
}

func commandConversationWithThreadRef(conversation Conversation, ref HarnessThreadRef, now string) Conversation {
	ref.Harness = HarnessCodex
	ref.Status = HarnessRefLinked
	ref.LastResumedAt = now
	if ref.CreatedAt == "" {
		ref.CreatedAt = now
	}
	upsertHarnessRef(&conversation.HarnessRefs, ref)
	conversation.UpdatedAt = now
	return conversation
}

func (service *Service) newCommandMessage(workspaceID string, conversationID string, text string, now string) (ChatMessage, error) {
	messageID, err := service.newID("message")
	if err != nil {
		return ChatMessage{}, fmt.Errorf("create command message id: %w", err)
	}
	partID, err := service.newID("part")
	if err != nil {
		return ChatMessage{}, fmt.Errorf("create command message part id: %w", err)
	}
	ordinal, err := service.store.NextMessageOrdinal(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, err
	}
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             messageID,
		ConversationID: conversationID,
		RunID:          "",
		Role:           RoleCommand,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        ordinal,
		CreatedAt:      now,
		UpdatedAt:      now,
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			ID:     partID,
			Type:   MessagePartText,
			Text:   text,
			Format: TextFormatPlain,
		}},
	}, nil
}

func commandResult(command ChatCommand, harnessResult HarnessCommandResult) ChatCommandResult {
	action := harnessResult.Action
	if action == "" {
		action = ChatCommandResultDisplay
	}
	result := ChatCommandResult{
		Action:                  action,
		ComposerDraft:           commandComposerDraft(command, harnessResult),
		Goal:                    harnessResult.Goal,
		Kind:                    command.Kind,
		Models:                  nonNilModels(harnessResult.Models),
		Raw:                     command.Raw,
		ReasoningEfforts:        nonNilReasoningEfforts(harnessResult.ReasoningEfforts),
		SelectedModel:           harnessResult.SelectedModel,
		SelectedReasoningEffort: harnessResult.SelectedReasoningEffort,
	}
	result.Title, result.Message = commandResultText(command, result)
	if harnessResult.CapabilityDiagnostic != "" {
		result.Message = strings.TrimSpace(result.Message + " " + harnessResult.CapabilityDiagnostic)
	}
	return result
}

func commandComposerDraft(command ChatCommand, harnessResult HarnessCommandResult) string {
	if harnessResult.Action != ChatCommandResultGoalEditor || command.Kind != ChatCommandGoal || command.Goal == nil {
		return ""
	}
	name, ok := chatCommandNameBySlashKind(ChatSlashCommandGoal)
	if !ok {
		return ""
	}
	objective := ""
	if harnessResult.Goal != nil {
		objective = strings.TrimSpace(harnessResult.Goal.Objective)
	}
	if objective == "" {
		return name + " "
	}
	return name + " " + objective
}

func nonNilModels(models []ChatModelOption) []ChatModelOption {
	if models == nil {
		return []ChatModelOption{}
	}
	return models
}

func nonNilReasoningEfforts(efforts []ChatReasoningEffortOption) []ChatReasoningEffortOption {
	if efforts == nil {
		return []ChatReasoningEffortOption{}
	}
	return efforts
}

func commandResultText(command ChatCommand, result ChatCommandResult) (string, string) {
	switch command.Kind {
	case ChatCommandGoal:
		return goalCommandResultText(command, result.Goal)
	case ChatCommandModel:
		return modelCommandResultText(command, result)
	default:
		return "Command", "Command completed."
	}
}

func goalCommandResultText(command ChatCommand, goal *ChatGoalState) (string, string) {
	if command.Goal == nil {
		return "Goal", "Goal command completed."
	}
	switch command.Goal.Action {
	case GoalCommandShow:
		if goal == nil {
			return "Goal", "No goal set. Usage: /goal <objective>, /goal edit, /goal pause, /goal resume, /goal clear."
		}
		return "Goal", fmt.Sprintf("Goal is %s: %s", goal.Status, goal.Objective)
	case GoalCommandEdit:
		if goal == nil {
			return "Goal", "Edit goal."
		}
		return "Goal", "Edit goal: " + goal.Objective
	case GoalCommandSet:
		return "Goal", "Goal set: " + command.Goal.Objective
	case GoalCommandClear:
		return "Goal", "Goal cleared."
	case GoalCommandPause:
		return "Goal", "Goal paused."
	case GoalCommandResume:
		return "Goal", "Goal resumed."
	default:
		return "Goal", "Goal command completed."
	}
}

func modelCommandResultText(command ChatCommand, result ChatCommandResult) (string, string) {
	if command.Model == nil {
		return "Model", "Model command completed."
	}
	switch command.Model.Action {
	case ModelCommandShowPicker:
		return "Model", "Choose a model."
	case ModelCommandSet:
		return "Model", "Model set: " + result.SelectedModel
	case ModelCommandSetEffort:
		if result.SelectedReasoningEffort == nil {
			return "Model", "Reasoning set."
		}
		return "Model", "Reasoning set: " + reasoningEffortDisplayName(*result.SelectedReasoningEffort)
	default:
		return "Model", "Model command completed."
	}
}
