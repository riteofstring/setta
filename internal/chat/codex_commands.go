package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"setta/internal/codexapp"
	"setta/internal/workspace"
)

func (harness *CodexHarness) ListCommandCapabilities(_ context.Context, request HarnessCommandListRequest) (HarnessCommandListResult, error) {
	return HarnessCommandListResult{Commands: defaultCommandCapabilities(request.ActiveRun)}, nil
}

func (harness *CodexHarness) ExecuteCommand(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, error) {
	if err := ensureCommandAvailable(request.Command, request.ActiveRun); err != nil {
		return HarnessCommandResult{}, err
	}
	if request.ActiveRun != nil {
		return harness.executeActiveCommand(ctx, request)
	}
	return harness.executeIdleCommand(ctx, request)
}

type codexGoalContinuation struct {
	harness  *CodexHarness
	cleanup  func()
	session  *codexapp.Session
	threadID string

	closeOnce sync.Once
}

func (harness *CodexHarness) BeginGoalContinuation(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, HarnessGoalContinuation, error) {
	if err := ensureCommandAvailable(request.Command, request.ActiveRun); err != nil {
		return HarnessCommandResult{}, nil, err
	}
	if !commandMayStartGoalContinuation(request.Command, request.ActiveRun) {
		return HarnessCommandResult{}, nil, commandError(ChatCommandErrorMalformedCommand, "command does not start goal continuation", nil)
	}
	if err := ctx.Err(); err != nil {
		return HarnessCommandResult{}, nil, err
	}

	harness.turnMu.Lock()
	continuationCreated := false
	defer func() {
		if !continuationCreated {
			harness.turnMu.Unlock()
		}
	}()

	session, cleanup, err := harness.newCommandSession(ctx, request)
	if err != nil {
		return HarnessCommandResult{}, nil, commandError(ChatCommandErrorCodexRPC, "start codex app-server: "+err.Error(), err)
	}
	closeSession := true
	defer func() {
		if closeSession {
			cleanup()
		}
	}()
	session.AcceptUnscopedNotifications()
	session.AcceptUnscopedRequests()

	thread, err := harness.startOrResumeCommandThread(ctx, session, request.Workspace, request.ThreadRef)
	if err != nil {
		return HarnessCommandResult{}, nil, err
	}
	if err := session.OwnThread(thread.Ref.ThreadID); err != nil {
		return HarnessCommandResult{}, nil, commandError(ChatCommandErrorCodexRPC, "own codex command thread: "+err.Error(), err)
	}
	result, err := harness.executeCodexCommandRPC(ctx, session, thread.Ref.ThreadID, thread.Settings, request.Command)
	if err != nil {
		return HarnessCommandResult{}, nil, err
	}
	result.ThreadRef = thread.Ref
	result.HasThreadRef = true

	closeSession = false
	continuationCreated = true
	return result, &codexGoalContinuation{
		cleanup:  cleanup,
		harness:  harness,
		session:  session,
		threadID: thread.Ref.ThreadID,
	}, nil
}

func (continuation *codexGoalContinuation) Wait(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := ctx.Err(); err != nil {
		return TurnCompletion{}, err
	}
	continuation.harness.registerActive(request.Run.ID, continuation.session)
	continuation.harness.updateActiveTurn(request.Run.ID, continuation.threadID, "")
	defer continuation.harness.unregisterActive(request.Run.ID)

	return continuation.harness.waitForTurn(ctx, continuation.session, request.Run.ID, continuation.threadID, "", sink)
}

func (continuation *codexGoalContinuation) Close() {
	continuation.closeOnce.Do(func() {
		continuation.cleanup()
		continuation.harness.turnMu.Unlock()
	})
}

func (harness *CodexHarness) executeActiveCommand(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, error) {
	active := harness.activeTurnForCommand(request.ActiveRun.ID)
	if active == nil || active.threadID == "" {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is not available for the active run", nil)
	}
	return harness.executeCodexCommandRPC(ctx, active.session, active.threadID, codexCommandThreadSettings{}, request.Command)
}

func (harness *CodexHarness) activeTurnForCommand(runID string) *codexActiveTurn {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	active := harness.active[runID]
	if active == nil {
		return nil
	}
	return &codexActiveTurn{
		session:  active.session,
		threadID: active.threadID,
		turnID:   active.turnID,
	}
}

func (harness *CodexHarness) executeIdleCommand(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, error) {
	session, cleanup, err := harness.newCommandSession(ctx, request)
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "start codex app-server: "+err.Error(), err)
	}
	defer cleanup()

	if commandUsesExistingThread(request.Command, request.ThreadRef) {
		return harness.executeExistingCommandThread(ctx, session, request)
	}
	if commandUsesLocalCodexSettings(request.Command, request.ThreadRef) {
		return harness.executeCodexLocalModelSettingsCommand(ctx, session, request)
	}
	if !commandNeedsThread(request.Command) {
		return harness.executeThreadlessCommand(ctx, session, request)
	}
	return harness.executeNewCommandThread(ctx, session, request)
}

func (harness *CodexHarness) executeExistingCommandThread(ctx context.Context, session *codexapp.Session, request HarnessCommandRequest) (HarnessCommandResult, error) {
	thread, err := harness.startOrResumeCommandThread(ctx, session, request.Workspace, request.ThreadRef)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	needsThread := commandNeedsThread(request.Command)
	if needsThread {
		if err := session.OwnThread(thread.Ref.ThreadID); err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "own codex command thread: "+err.Error(), err)
		}
	}
	result, err := harness.executeCodexCommandRPC(ctx, session, thread.Ref.ThreadID, thread.Settings, request.Command)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	if needsThread {
		result.ThreadRef = thread.Ref
		result.HasThreadRef = true
	}
	return result, nil
}

func (harness *CodexHarness) executeThreadlessCommand(ctx context.Context, session *codexapp.Session, request HarnessCommandRequest) (HarnessCommandResult, error) {
	settings := codexCommandThreadSettings{}
	if request.Command.Kind == ChatCommandModel {
		var err error
		settings, err = harness.effectiveCodexCommandSettings(ctx, session, request.Workspace, request.Conversation)
		if err != nil {
			return HarnessCommandResult{}, err
		}
	}
	return harness.executeCodexCommandRPC(ctx, session, "", settings, request.Command)
}

func (harness *CodexHarness) executeNewCommandThread(ctx context.Context, session *codexapp.Session, request HarnessCommandRequest) (HarnessCommandResult, error) {
	thread, err := harness.startOrResumeCommandThread(ctx, session, request.Workspace, request.ThreadRef)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	if err := session.OwnThread(thread.Ref.ThreadID); err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "own codex command thread: "+err.Error(), err)
	}
	result, err := harness.executeCodexCommandRPC(ctx, session, thread.Ref.ThreadID, thread.Settings, request.Command)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	result.ThreadRef = thread.Ref
	result.HasThreadRef = true
	return result, nil
}

func commandUsesExistingThread(command ChatCommand, threadRef HarnessThreadRef) bool {
	if threadRef.ThreadID == "" || threadRef.Status != HarnessRefLinked {
		return false
	}
	switch command.Kind {
	case ChatCommandModel:
		return command.Model != nil
	default:
		return false
	}
}

func commandUsesLocalCodexSettings(command ChatCommand, threadRef HarnessThreadRef) bool {
	if threadRef.ThreadID != "" && threadRef.Status == HarnessRefLinked {
		return false
	}
	if command.Kind != ChatCommandModel || command.Model == nil {
		return false
	}
	return command.Model.Action == ModelCommandSet || command.Model.Action == ModelCommandSetEffort
}

type codexCommandThread struct {
	Ref      HarnessThreadRef
	Settings codexCommandThreadSettings
}

type codexCommandThreadSettings struct {
	Model           string
	ReasoningEffort ReasoningEffort
}

func (harness *CodexHarness) startOrResumeCommandThread(ctx context.Context, session *codexapp.Session, workspaceSummary workspace.WorkspaceSummary, threadRef HarnessThreadRef) (codexCommandThread, error) {
	if threadRef.ThreadID != "" && threadRef.Status == HarnessRefLinked {
		result, err := session.Call(ctx, codexapp.CodexMethodThreadResume, map[string]any{
			"approvalPolicy":        "on-request",
			"approvalsReviewer":     "user",
			"cwd":                   workspaceSummary.RootPath,
			"excludeTurns":          true,
			"runtimeWorkspaceRoots": []string{workspaceSummary.RootPath},
			"threadId":              threadRef.ThreadID,
		})
		if err != nil {
			refErr := &HarnessRefUnavailableError{
				Err:      err,
				Harness:  HarnessCodex,
				ThreadID: threadRef.ThreadID,
				Message:  fmt.Sprintf("resume codex thread %s: %v", threadRef.ThreadID, err),
			}
			return codexCommandThread{}, commandError(ChatCommandErrorCodexThread, refErr.Error(), refErr)
		}
		thread, err := commandThreadFromResponse(result)
		if err != nil {
			refErr := &HarnessRefUnavailableError{
				Err:      err,
				Harness:  HarnessCodex,
				ThreadID: threadRef.ThreadID,
				Message:  fmt.Sprintf("resume codex thread %s: %v", threadRef.ThreadID, err),
			}
			return codexCommandThread{}, commandError(ChatCommandErrorCodexProviderDrift, refErr.Error(), refErr)
		}
		return thread, nil
	}

	result, err := session.Call(ctx, codexapp.CodexMethodThreadStart, map[string]any{
		"approvalPolicy":        "on-request",
		"approvalsReviewer":     "user",
		"cwd":                   workspaceSummary.RootPath,
		"runtimeWorkspaceRoots": []string{workspaceSummary.RootPath},
	})
	if err != nil {
		return codexCommandThread{}, commandError(ChatCommandErrorCodexRPC, "start codex thread: "+err.Error(), err)
	}
	thread, err := commandThreadFromResponse(result)
	if err != nil {
		return codexCommandThread{}, commandError(ChatCommandErrorCodexProviderDrift, "start codex thread response: "+err.Error(), err)
	}
	return thread, nil
}

func (harness *CodexHarness) executeCodexLocalModelSettingsCommand(ctx context.Context, session *codexapp.Session, request HarnessCommandRequest) (HarnessCommandResult, error) {
	if request.Command.Model == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "model command payload is required", nil)
	}
	settings, err := harness.effectiveCodexCommandSettings(ctx, session, request.Workspace, request.Conversation)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	switch request.Command.Model.Action {
	case ModelCommandSet:
		settings.Model = request.Command.Model.ModelID
	case ModelCommandSetEffort:
		if request.Command.Model.ReasoningEffort == nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "reasoning effort is required", nil)
		}
		settings.ReasoningEffort = *request.Command.Model.ReasoningEffort
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported local model command action: %s", request.Command.Model.Action), nil)
	}
	result := codexSettingsCommandResult(settings)
	result.CodexSettings = chatCodexSettingsFromCommandSettings(settings)
	return result, nil
}

func (harness *CodexHarness) effectiveCodexCommandSettings(ctx context.Context, session *codexapp.Session, workspaceSummary workspace.WorkspaceSummary, conversation Conversation) (codexCommandThreadSettings, error) {
	settings, err := codexCommandSettingsFromConfig(ctx, session, workspaceSummary)
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	overlayCodexConversationSettings(&settings, conversation.CodexSettings)
	return settings, nil
}

func codexCommandSettingsFromConfig(ctx context.Context, session *codexapp.Session, workspaceSummary workspace.WorkspaceSummary) (codexCommandThreadSettings, error) {
	raw, err := session.Call(ctx, codexapp.CodexMethodConfigRead, map[string]any{"cwd": workspaceSummary.RootPath})
	if err != nil {
		return codexCommandThreadSettings{}, commandError(ChatCommandErrorCodexRPC, "config/read: "+err.Error(), err)
	}
	settings, err := codexCommandSettingsFromConfigResponse(raw)
	if err != nil {
		return codexCommandThreadSettings{}, commandError(ChatCommandErrorCodexProviderDrift, "config/read response: "+err.Error(), err)
	}
	return settings, nil
}

func codexCommandSettingsFromConfigResponse(raw json.RawMessage) (codexCommandThreadSettings, error) {
	response, err := objectValue(raw, "codex config response")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	config, err := requireObject(response, "config", "codex config response")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	model, err := optionalString(config, "model", "codex config response config")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	effort, err := optionalReasoningEffort(config, "model_reasoning_effort", "codex config response config")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	return codexCommandThreadSettings{Model: model, ReasoningEffort: effort}, nil
}

func overlayCodexConversationSettings(settings *codexCommandThreadSettings, pending *ChatCodexSettings) {
	if pending == nil {
		return
	}
	if pending.Model != "" {
		settings.Model = pending.Model
	}
	if pending.ReasoningEffort != nil {
		settings.ReasoningEffort = *pending.ReasoningEffort
	}
}

func chatCodexSettingsFromCommandSettings(settings codexCommandThreadSettings) *ChatCodexSettings {
	return &ChatCodexSettings{
		Model:           settings.Model,
		ReasoningEffort: reasoningEffortResult(settings.ReasoningEffort),
	}
}

func (harness *CodexHarness) executeCodexCommandRPC(ctx context.Context, session *codexapp.Session, threadID string, currentSettings codexCommandThreadSettings, command ChatCommand) (HarnessCommandResult, error) {
	switch command.Kind {
	case ChatCommandGoal:
		return executeCodexGoalCommand(ctx, session, threadID, command)
	case ChatCommandModel:
		return harness.executeCodexModelCommand(ctx, session, threadID, currentSettings, command)
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorUnsupportedHarness, fmt.Sprintf("codex does not support chat command kind %s", command.Kind), nil)
	}
}

func executeCodexGoalCommand(ctx context.Context, session *codexapp.Session, threadID string, command ChatCommand) (HarnessCommandResult, error) {
	if threadID == "" {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is required for goal commands", nil)
	}
	if command.Goal == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "goal command payload is required", nil)
	}
	switch command.Goal.Action {
	case GoalCommandShow:
		return executeCodexGoalShowCommand(ctx, session, threadID)
	case GoalCommandEdit:
		return executeCodexGoalEditCommand(ctx, session, threadID)
	case GoalCommandSet:
		return executeCodexGoalSetCommand(ctx, session, threadID, command.Goal.Objective)
	case GoalCommandClear:
		return executeCodexGoalClearCommand(ctx, session, threadID, command.Goal.Action)
	case GoalCommandPause, GoalCommandResume:
		return executeCodexGoalStatusCommand(ctx, session, threadID, command.Goal)
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported goal command action: %s", command.Goal.Action), nil)
	}
}

func executeCodexGoalShowCommand(ctx context.Context, session *codexapp.Session, threadID string) (HarnessCommandResult, error) {
	goal, err := getCodexGoal(ctx, session, threadID)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	return HarnessCommandResult{Action: ChatCommandResultDisplay, Goal: goal}, nil
}

func executeCodexGoalEditCommand(ctx context.Context, session *codexapp.Session, threadID string) (HarnessCommandResult, error) {
	goal, err := getCodexGoal(ctx, session, threadID)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	return HarnessCommandResult{Action: ChatCommandResultGoalEditor, Goal: goal}, nil
}

func executeCodexGoalSetCommand(ctx context.Context, session *codexapp.Session, threadID string, objective string) (HarnessCommandResult, error) {
	status := codexapp.ThreadGoalStatusActive
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		Objective: &objective,
		Status:    &status,
		ThreadID:  threadID,
	})
	return goalMutationResult(raw, err, codexapp.CodexMethodThreadGoalSet)
}

func executeCodexGoalClearCommand(ctx context.Context, session *codexapp.Session, threadID string, action GoalCommandAction) (HarnessCommandResult, error) {
	if _, err := requireCodexGoal(ctx, session, threadID, action); err != nil {
		return HarnessCommandResult{}, err
	}
	_, err := session.Call(ctx, codexapp.CodexMethodThreadGoalClear, codexapp.ThreadGoalClearParams{ThreadID: threadID})
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "thread/goal/clear: "+err.Error(), err)
	}
	return HarnessCommandResult{Action: ChatCommandResultDisplay}, nil
}

func executeCodexGoalStatusCommand(ctx context.Context, session *codexapp.Session, threadID string, goal *GoalCommand) (HarnessCommandResult, error) {
	if _, err := requireCodexGoal(ctx, session, threadID, goal.Action); err != nil {
		return HarnessCommandResult{}, err
	}
	status := codexapp.ThreadGoalStatus(goal.Status)
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		Status:   &status,
		ThreadID: threadID,
	})
	return goalMutationResult(raw, err, codexapp.CodexMethodThreadGoalSet)
}

func requireCodexGoal(ctx context.Context, session *codexapp.Session, threadID string, action GoalCommandAction) (*ChatGoalState, error) {
	goal, err := getCodexGoal(ctx, session, threadID)
	if err != nil {
		return nil, err
	}
	if goal == nil {
		return nil, noGoalCommandError(action)
	}
	return goal, nil
}

func getCodexGoal(ctx context.Context, session *codexapp.Session, threadID string) (*ChatGoalState, error) {
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadGoalGet, codexapp.ThreadGoalGetParams{ThreadID: threadID})
	if err != nil {
		return nil, commandError(ChatCommandErrorCodexRPC, "thread/goal/get: "+err.Error(), err)
	}
	goal, err := goalStateFromGetResponse(raw)
	if err != nil {
		return nil, commandError(ChatCommandErrorCodexProviderDrift, "thread/goal/get response: "+err.Error(), err)
	}
	return goal, nil
}

func goalMutationResult(raw json.RawMessage, rpcErr error, method string) (HarnessCommandResult, error) {
	if rpcErr != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, method+": "+rpcErr.Error(), rpcErr)
	}
	goal, err := goalStateFromSetResponse(raw)
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexProviderDrift, method+" response: "+err.Error(), err)
	}
	return HarnessCommandResult{Action: ChatCommandResultDisplay, Goal: goal}, nil
}

func (harness *CodexHarness) executeCodexModelCommand(ctx context.Context, session *codexapp.Session, threadID string, currentSettings codexCommandThreadSettings, command ChatCommand) (HarnessCommandResult, error) {
	if command.Model == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "model command payload is required", nil)
	}
	switch command.Model.Action {
	case ModelCommandShowPicker:
		return executeCodexModelPickerCommand(ctx, session, currentSettings)
	case ModelCommandSet:
		return harness.executeCodexModelSetCommand(ctx, session, threadID, currentSettings, command.Model.ModelID)
	case ModelCommandSetEffort:
		if command.Model.ReasoningEffort == nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "reasoning effort is required", nil)
		}
		return harness.executeCodexEffortSetCommand(ctx, session, threadID, currentSettings, *command.Model.ReasoningEffort)
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported model command action: %s", command.Model.Action), nil)
	}
}

func executeCodexModelPickerCommand(ctx context.Context, session *codexapp.Session, currentSettings codexCommandThreadSettings) (HarnessCommandResult, error) {
	models, err := listCodexModelOptions(ctx, session)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	return HarnessCommandResult{
		Action:                  ChatCommandResultModelPicker,
		Models:                  models,
		ReasoningEfforts:        reasoningEffortsForSelectedModel(models, currentSettings.Model),
		SelectedModel:           currentSettings.Model,
		SelectedReasoningEffort: reasoningEffortResult(currentSettings.ReasoningEffort),
	}, nil
}

func listCodexModelOptions(ctx context.Context, session *codexapp.Session) ([]ChatModelOption, error) {
	includeHidden := false
	var cursor *string
	models := []ChatModelOption{}
	for {
		raw, err := session.Call(ctx, codexapp.CodexMethodModelList, codexapp.ModelListParams{
			Cursor:        cursor,
			IncludeHidden: &includeHidden,
		})
		if err != nil {
			return nil, commandError(ChatCommandErrorCodexRPC, "model/list: "+err.Error(), err)
		}
		page, err := modelListResponseFromResponse(raw)
		if err != nil {
			return nil, commandError(ChatCommandErrorCodexProviderDrift, "model/list response: "+err.Error(), err)
		}
		for index, item := range page.Data {
			model, err := modelOptionFromCodex(item, index)
			if err != nil {
				return nil, commandError(ChatCommandErrorCodexProviderDrift, "model/list response: "+err.Error(), err)
			}
			if model.Hidden {
				continue
			}
			models = append(models, model)
		}
		if page.NextCursor == nil || *page.NextCursor == "" {
			return models, nil
		}
		cursor = page.NextCursor
	}
}

func (harness *CodexHarness) executeCodexModelSetCommand(ctx context.Context, session *codexapp.Session, threadID string, currentSettings codexCommandThreadSettings, modelID string) (HarnessCommandResult, error) {
	if threadID == "" {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is required to set the model", nil)
	}
	if currentSettings.Model == modelID {
		return codexSettingsCommandResult(codexCommandThreadSettings{
			Model:           modelID,
			ReasoningEffort: currentSettings.ReasoningEffort,
		}), nil
	}
	settings := codexCommandThreadSettings{
		Model:           modelID,
		ReasoningEffort: currentSettings.ReasoningEffort,
	}
	if err := harness.callThreadSettingsUpdate(ctx, session, codexapp.ThreadSettingsUpdateParams{
		Model:    &modelID,
		ThreadID: threadID,
	}); err != nil {
		return HarnessCommandResult{}, err
	}
	return codexSettingsCommandResult(settings), nil
}

func (harness *CodexHarness) executeCodexEffortSetCommand(ctx context.Context, session *codexapp.Session, threadID string, currentSettings codexCommandThreadSettings, effort ReasoningEffort) (HarnessCommandResult, error) {
	if threadID == "" {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is required to set reasoning effort", nil)
	}
	if currentSettings.ReasoningEffort == effort {
		return codexSettingsCommandResult(codexCommandThreadSettings{
			Model:           currentSettings.Model,
			ReasoningEffort: effort,
		}), nil
	}
	codexEffort := codexapp.ReasoningEffort(effort)
	settings := codexCommandThreadSettings{
		Model:           currentSettings.Model,
		ReasoningEffort: effort,
	}
	if err := harness.callThreadSettingsUpdate(ctx, session, codexapp.ThreadSettingsUpdateParams{
		Effort:   &codexEffort,
		ThreadID: threadID,
	}); err != nil {
		return HarnessCommandResult{}, err
	}
	return codexSettingsCommandResult(settings), nil
}

func (harness *CodexHarness) callThreadSettingsUpdate(ctx context.Context, session *codexapp.Session, params codexapp.ThreadSettingsUpdateParams) error {
	_, err := session.Call(ctx, codexapp.CodexMethodThreadSettingsUpdate, params)
	if err == nil {
		return nil
	}
	return commandError(
		ChatCommandErrorCodexRPC,
		"thread/settings/update is required for linked Codex model settings: "+err.Error(),
		err,
	)
}

func codexSettingsCommandResult(settings codexCommandThreadSettings) HarnessCommandResult {
	return HarnessCommandResult{
		Action:                  ChatCommandResultDisplay,
		SelectedModel:           settings.Model,
		SelectedReasoningEffort: reasoningEffortResult(settings.ReasoningEffort),
	}
}

func commandThreadFromResponse(raw json.RawMessage) (codexCommandThread, error) {
	response, err := objectValue(raw, "codex thread response")
	if err != nil {
		return codexCommandThread{}, err
	}
	thread, err := requireObject(response, "thread", "codex thread response")
	if err != nil {
		return codexCommandThread{}, err
	}
	threadID, err := requireString(thread, "id", "codex thread response thread")
	if err != nil {
		return codexCommandThread{}, err
	}
	sessionID, err := optionalString(thread, "sessionId", "codex thread response thread")
	if err != nil {
		return codexCommandThread{}, err
	}
	model, err := requireString(response, "model", "codex thread response")
	if err != nil {
		return codexCommandThread{}, err
	}
	effort, err := optionalReasoningEffort(response, "reasoningEffort", "codex thread response")
	if err != nil {
		return codexCommandThread{}, err
	}
	return codexCommandThread{
		Ref: HarnessThreadRef{
			Harness:   HarnessCodex,
			SessionID: sessionID,
			Status:    HarnessRefLinked,
			ThreadID:  threadID,
		},
		Settings: codexCommandThreadSettings{
			Model:           model,
			ReasoningEffort: effort,
		},
	}, nil
}

func goalStateFromGetResponse(raw json.RawMessage) (*ChatGoalState, error) {
	var response codexapp.ThreadGoalGetResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("codex goal response must match protocol: %w", err)
	}
	if response.Goal == nil {
		return nil, nil
	}
	return goalStateFromCodex(*response.Goal)
}

func goalStateFromSetResponse(raw json.RawMessage) (*ChatGoalState, error) {
	var response codexapp.ThreadGoalSetResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("codex goal response must match protocol: %w", err)
	}
	return goalStateFromCodex(response.Goal)
}

func goalStateFromCodex(goal codexapp.ThreadGoal) (*ChatGoalState, error) {
	status := string(goal.Status)
	if _, ok := codexThreadGoalStatuses[status]; !ok {
		return nil, fmt.Errorf("unsupported codex thread goal status: %s", status)
	}
	return &ChatGoalState{
		CreatedAt:       goal.CreatedAt,
		Objective:       goal.Objective,
		Status:          status,
		ThreadID:        goal.ThreadID,
		TimeUsedSeconds: goal.TimeUsedSeconds,
		TokenBudget:     goal.TokenBudget,
		TokensUsed:      goal.TokensUsed,
		UpdatedAt:       goal.UpdatedAt,
	}, nil
}

func modelListResponseFromResponse(raw json.RawMessage) (codexapp.ModelListResponse, error) {
	var response codexapp.ModelListResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return codexapp.ModelListResponse{}, fmt.Errorf("codex model list response must match protocol: %w", err)
	}
	if response.Data == nil {
		return codexapp.ModelListResponse{}, fmt.Errorf("codex model list response.data is required")
	}
	return response, nil
}

func modelOptionFromCodex(item codexapp.Model, index int) (ChatModelOption, error) {
	label := fmt.Sprintf("codex model list response.data[%d]", index)
	if item.ID == "" {
		return ChatModelOption{}, fmt.Errorf("%s.id is required", label)
	}
	if item.Model == "" {
		return ChatModelOption{}, fmt.Errorf("%s.model is required", label)
	}
	if item.DisplayName == "" {
		return ChatModelOption{}, fmt.Errorf("%s.displayName is required", label)
	}
	defaultReasoningEffort := ReasoningEffort(item.DefaultReasoningEffort)
	if !validValue(defaultReasoningEffort, reasoningEffortValues) {
		return ChatModelOption{}, fmt.Errorf("%s.defaultReasoningEffort has unsupported reasoning effort %s", label, item.DefaultReasoningEffort)
	}
	supportedReasoningEfforts, err := reasoningEffortOptionsFromCodex(item.SupportedReasoningEfforts, defaultReasoningEffort, label)
	if err != nil {
		return ChatModelOption{}, err
	}
	return ChatModelOption{
		DefaultReasoningEffort:    defaultReasoningEffort,
		Description:               item.Description,
		DisplayName:               item.DisplayName,
		Hidden:                    item.Hidden,
		ID:                        item.ID,
		IsDefault:                 item.IsDefault,
		Model:                     item.Model,
		SupportedReasoningEfforts: supportedReasoningEfforts,
	}, nil
}

func reasoningEffortOptionsFromCodex(items []codexapp.ReasoningEffortOption, defaultEffort ReasoningEffort, label string) ([]ChatReasoningEffortOption, error) {
	options := make([]ChatReasoningEffortOption, 0, len(items))
	for index, option := range items {
		optionLabel := fmt.Sprintf("%s.supportedReasoningEfforts[%d]", label, index)
		effort := ReasoningEffort(option.ReasoningEffort)
		if !validValue(effort, reasoningEffortValues) {
			return nil, fmt.Errorf("%s.reasoningEffort has unsupported reasoning effort %s", optionLabel, option.ReasoningEffort)
		}
		options = append(options, ChatReasoningEffortOption{
			Description: option.Description,
			DisplayName: reasoningEffortDisplayName(effort),
			Effort:      effort,
			IsDefault:   effort == defaultEffort,
		})
	}
	return options, nil
}

func reasoningEffortsForSelectedModel(models []ChatModelOption, selectedModel string) []ChatReasoningEffortOption {
	for _, model := range models {
		if selectedModel != "" && model.Model == selectedModel {
			return model.SupportedReasoningEfforts
		}
	}
	for _, model := range models {
		if selectedModel == "" && model.IsDefault {
			return model.SupportedReasoningEfforts
		}
	}
	if len(models) == 0 {
		return []ChatReasoningEffortOption{}
	}
	return models[0].SupportedReasoningEfforts
}

func optionalReasoningEffort(value map[string]any, name string, label string) (ReasoningEffort, error) {
	raw, err := optionalString(value, name, label)
	if err != nil {
		return "", err
	}
	if raw == "" {
		return "", nil
	}
	effort := ReasoningEffort(raw)
	if !validValue(effort, reasoningEffortValues) {
		return "", fmt.Errorf("%s.%s has unsupported reasoning effort %s", label, name, raw)
	}
	return effort, nil
}
