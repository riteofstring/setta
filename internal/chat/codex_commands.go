package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"setta/internal/codexapp"
	"setta/internal/workspace"
)

const codexSettingsUpdatedTimeout = 15 * time.Second

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

	session, err := harness.manager.NewSession(ctx)
	if err != nil {
		return HarnessCommandResult{}, nil, commandError(ChatCommandErrorCodexRPC, "start codex app-server: "+err.Error(), err)
	}
	closeSession := true
	defer func() {
		if closeSession {
			session.Close()
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
		continuation.session.Close()
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
	session, err := harness.manager.NewSession(ctx)
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "start codex app-server: "+err.Error(), err)
	}
	defer session.Close()

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
		result, err := session.Call(ctx, "thread/resume", map[string]any{
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

	result, err := session.Call(ctx, "thread/start", map[string]any{
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
	raw, err := session.Call(ctx, "config/read", map[string]any{"cwd": workspaceSummary.RootPath})
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
		return executeCodexModelCommand(ctx, session, threadID, currentSettings, command)
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
		raw, err := session.Call(ctx, "thread/goal/get", map[string]any{"threadId": threadID})
		if err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "thread/goal/get: "+err.Error(), err)
		}
		goal, err := goalStateFromResponse(raw)
		if err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexProviderDrift, "thread/goal/get response: "+err.Error(), err)
		}
		return HarnessCommandResult{Action: ChatCommandResultDisplay, Goal: goal}, nil
	case GoalCommandSet:
		raw, err := session.Call(ctx, "thread/goal/set", map[string]any{
			"objective": command.Goal.Objective,
			"status":    "active",
			"threadId":  threadID,
		})
		return goalMutationResult(raw, err, "thread/goal/set")
	case GoalCommandClear:
		_, err := session.Call(ctx, "thread/goal/clear", map[string]any{"threadId": threadID})
		if err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "thread/goal/clear: "+err.Error(), err)
		}
		return HarnessCommandResult{Action: ChatCommandResultDisplay}, nil
	case GoalCommandPause, GoalCommandResume:
		raw, err := session.Call(ctx, "thread/goal/set", map[string]any{
			"status":   command.Goal.Status,
			"threadId": threadID,
		})
		return goalMutationResult(raw, err, "thread/goal/set")
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported goal command action: %s", command.Goal.Action), nil)
	}
}

func goalMutationResult(raw json.RawMessage, rpcErr error, method string) (HarnessCommandResult, error) {
	if rpcErr != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, method+": "+rpcErr.Error(), rpcErr)
	}
	goal, err := goalStateFromResponse(raw)
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexProviderDrift, method+" response: "+err.Error(), err)
	}
	return HarnessCommandResult{Action: ChatCommandResultDisplay, Goal: goal}, nil
}

func executeCodexModelCommand(ctx context.Context, session *codexapp.Session, threadID string, currentSettings codexCommandThreadSettings, command ChatCommand) (HarnessCommandResult, error) {
	if command.Model == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "model command payload is required", nil)
	}
	switch command.Model.Action {
	case ModelCommandShowPicker:
		return executeCodexModelPickerCommand(ctx, session, currentSettings)
	case ModelCommandSet:
		return executeCodexModelSetCommand(ctx, session, threadID, currentSettings, command.Model.ModelID)
	case ModelCommandSetEffort:
		if command.Model.ReasoningEffort == nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "reasoning effort is required", nil)
		}
		return executeCodexEffortSetCommand(ctx, session, threadID, currentSettings, *command.Model.ReasoningEffort)
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported model command action: %s", command.Model.Action), nil)
	}
}

func executeCodexModelPickerCommand(ctx context.Context, session *codexapp.Session, currentSettings codexCommandThreadSettings) (HarnessCommandResult, error) {
	raw, err := session.Call(ctx, "model/list", map[string]any{"includeHidden": true})
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "model/list: "+err.Error(), err)
	}
	models, err := modelOptionsFromResponse(raw)
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexProviderDrift, "model/list response: "+err.Error(), err)
	}
	return HarnessCommandResult{
		Action:                  ChatCommandResultModelPicker,
		Models:                  models,
		ReasoningEfforts:        reasoningEffortsForSelectedModel(models, currentSettings.Model),
		SelectedModel:           currentSettings.Model,
		SelectedReasoningEffort: reasoningEffortResult(currentSettings.ReasoningEffort),
	}, nil
}

func executeCodexModelSetCommand(ctx context.Context, session *codexapp.Session, threadID string, currentSettings codexCommandThreadSettings, modelID string) (HarnessCommandResult, error) {
	if threadID == "" {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is required to set the model", nil)
	}
	if currentSettings.Model == modelID {
		return codexSettingsCommandResult(codexCommandThreadSettings{
			Model:           modelID,
			ReasoningEffort: currentSettings.ReasoningEffort,
		}), nil
	}
	_, err := session.Call(ctx, "thread/settings/update", map[string]any{
		"model":    modelID,
		"threadId": threadID,
	})
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "thread/settings/update: "+err.Error(), err)
	}
	settings, err := waitForCodexThreadSettingsUpdated(ctx, session, threadID, codexCommandThreadSettings{Model: modelID})
	if err != nil {
		return HarnessCommandResult{}, err
	}
	return codexSettingsCommandResult(settings), nil
}

func executeCodexEffortSetCommand(ctx context.Context, session *codexapp.Session, threadID string, currentSettings codexCommandThreadSettings, effort ReasoningEffort) (HarnessCommandResult, error) {
	if threadID == "" {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is required to set reasoning effort", nil)
	}
	if currentSettings.ReasoningEffort == effort {
		return codexSettingsCommandResult(codexCommandThreadSettings{
			Model:           currentSettings.Model,
			ReasoningEffort: effort,
		}), nil
	}
	_, err := session.Call(ctx, "thread/settings/update", map[string]any{
		"effort":   string(effort),
		"threadId": threadID,
	})
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "thread/settings/update: "+err.Error(), err)
	}
	settings, err := waitForCodexThreadSettingsUpdated(ctx, session, threadID, codexCommandThreadSettings{ReasoningEffort: effort})
	if err != nil {
		return HarnessCommandResult{}, err
	}
	return codexSettingsCommandResult(settings), nil
}

func codexSettingsCommandResult(settings codexCommandThreadSettings) HarnessCommandResult {
	return HarnessCommandResult{
		Action:                  ChatCommandResultDisplay,
		SelectedModel:           settings.Model,
		SelectedReasoningEffort: reasoningEffortResult(settings.ReasoningEffort),
	}
}

func waitForCodexThreadSettingsUpdated(ctx context.Context, session *codexapp.Session, threadID string, expected codexCommandThreadSettings) (codexCommandThreadSettings, error) {
	waitCtx, cancel := context.WithTimeout(ctx, codexSettingsUpdatedTimeout)
	defer cancel()

	for {
		select {
		case <-waitCtx.Done():
			return codexCommandThreadSettings{}, commandError(
				ChatCommandErrorCodexRPC,
				fmt.Sprintf("thread/settings/update did not emit matching thread/settings/updated for thread %s: %v", threadID, waitCtx.Err()),
				waitCtx.Err(),
			)
		case event, ok := <-session.Events():
			settings, matched, err := codexSettingsUpdateFromEvent(event, ok, threadID, expected)
			if err != nil {
				return codexCommandThreadSettings{}, err
			}
			if !matched {
				continue
			}
			return settings, nil
		}
	}
}

func codexSettingsUpdateFromEvent(event codexapp.Event, ok bool, threadID string, expected codexCommandThreadSettings) (codexCommandThreadSettings, bool, error) {
	if !ok {
		err := fmt.Errorf("codex app-server session closed before thread/settings/updated")
		return codexCommandThreadSettings{}, false, commandError(ChatCommandErrorCodexRPC, "thread/settings/update: "+err.Error(), err)
	}
	if event.Kind == codexapp.EventLifecycle {
		err := fmt.Errorf("codex app-server exited before thread/settings/updated: %w", event.Err)
		return codexCommandThreadSettings{}, false, commandError(ChatCommandErrorCodexRPC, "thread/settings/update: "+err.Error(), err)
	}
	if event.Kind != codexapp.EventNotification || event.Message.Method != "thread/settings/updated" {
		return codexCommandThreadSettings{}, false, nil
	}
	settings, err := codexThreadSettingsFromNotification(event.Message, threadID)
	if err != nil {
		return codexCommandThreadSettings{}, false, commandError(ChatCommandErrorCodexProviderDrift, "thread/settings/updated notification: "+err.Error(), err)
	}
	if err := requireCodexExpectedSettings(settings, expected); err != nil {
		return codexCommandThreadSettings{}, false, err
	}
	return settings, true, nil
}

func requireCodexExpectedSettings(settings codexCommandThreadSettings, expected codexCommandThreadSettings) error {
	if expected.Model != "" && settings.Model != expected.Model {
		return commandError(
			ChatCommandErrorCodexProviderDrift,
			fmt.Sprintf("thread/settings/updated selected model %s, want %s", settings.Model, expected.Model),
			nil,
		)
	}
	if expected.ReasoningEffort != "" && settings.ReasoningEffort != expected.ReasoningEffort {
		return commandError(
			ChatCommandErrorCodexProviderDrift,
			fmt.Sprintf("thread/settings/updated selected reasoning effort %s, want %s", settings.ReasoningEffort, expected.ReasoningEffort),
			nil,
		)
	}
	return nil
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

func goalStateFromResponse(raw json.RawMessage) (*ChatGoalState, error) {
	response, err := objectValue(raw, "codex goal response")
	if err != nil {
		return nil, err
	}
	rawGoal, ok := response["goal"]
	if !ok || rawGoal == nil {
		return nil, nil
	}
	goal, ok := rawGoal.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("codex goal response.goal must be an object")
	}
	return goalStateFromObject(goal, "codex goal response goal")
}

func goalStateFromObject(goal map[string]any, label string) (*ChatGoalState, error) {
	threadID, err := requireString(goal, "threadId", label)
	if err != nil {
		return nil, err
	}
	objective, err := requireStringAllowEmpty(goal, "objective", label)
	if err != nil {
		return nil, err
	}
	status, err := requireString(goal, "status", label)
	if err != nil {
		return nil, err
	}
	if _, ok := codexThreadGoalStatuses[status]; !ok {
		return nil, fmt.Errorf("unsupported codex thread goal status: %s", status)
	}
	tokenBudget, err := optionalIntPointer(goal, "tokenBudget", label)
	if err != nil {
		return nil, err
	}
	tokensUsed, err := optionalInt(goal, "tokensUsed", label)
	if err != nil {
		return nil, err
	}
	timeUsedSeconds, err := optionalInt(goal, "timeUsedSeconds", label)
	if err != nil {
		return nil, err
	}
	createdAt, err := optionalInt(goal, "createdAt", label)
	if err != nil {
		return nil, err
	}
	updatedAt, err := optionalInt(goal, "updatedAt", label)
	if err != nil {
		return nil, err
	}
	return &ChatGoalState{
		CreatedAt:       createdAt,
		Objective:       objective,
		Status:          status,
		ThreadID:        threadID,
		TimeUsedSeconds: timeUsedSeconds,
		TokenBudget:     tokenBudget,
		TokensUsed:      tokensUsed,
		UpdatedAt:       updatedAt,
	}, nil
}

func modelOptionsFromResponse(raw json.RawMessage) ([]ChatModelOption, error) {
	response, err := objectValue(raw, "codex model list response")
	if err != nil {
		return nil, err
	}
	rawData, ok := response["data"]
	if !ok || rawData == nil {
		return nil, fmt.Errorf("codex model list response.data is required")
	}
	items, ok := rawData.([]any)
	if !ok {
		return nil, fmt.Errorf("codex model list response.data must be an array")
	}
	models := make([]ChatModelOption, 0, len(items))
	for index, rawItem := range items {
		item, ok := rawItem.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("codex model list response.data[%d] must be an object", index)
		}
		model, err := modelOptionFromObject(item, index)
		if err != nil {
			return nil, err
		}
		models = append(models, model)
	}
	return models, nil
}

func modelOptionFromObject(item map[string]any, index int) (ChatModelOption, error) {
	label := fmt.Sprintf("codex model list response.data[%d]", index)
	id, err := requireString(item, "id", label)
	if err != nil {
		return ChatModelOption{}, err
	}
	model, err := requireString(item, "model", label)
	if err != nil {
		return ChatModelOption{}, err
	}
	displayName, err := requireString(item, "displayName", label)
	if err != nil {
		return ChatModelOption{}, err
	}
	description, err := requireStringAllowEmpty(item, "description", label)
	if err != nil {
		return ChatModelOption{}, err
	}
	hidden, err := requireBool(item, "hidden", label)
	if err != nil {
		return ChatModelOption{}, err
	}
	isDefault, err := requireBool(item, "isDefault", label)
	if err != nil {
		return ChatModelOption{}, err
	}
	defaultReasoningEffort, err := requireReasoningEffort(item, "defaultReasoningEffort", label)
	if err != nil {
		return ChatModelOption{}, err
	}
	supportedReasoningEfforts, err := reasoningEffortOptionsFromObject(item, defaultReasoningEffort, label)
	if err != nil {
		return ChatModelOption{}, err
	}
	return ChatModelOption{
		DefaultReasoningEffort:    defaultReasoningEffort,
		Description:               description,
		DisplayName:               displayName,
		Hidden:                    hidden,
		ID:                        id,
		IsDefault:                 isDefault,
		Model:                     model,
		SupportedReasoningEfforts: supportedReasoningEfforts,
	}, nil
}

func reasoningEffortOptionsFromObject(item map[string]any, defaultEffort ReasoningEffort, label string) ([]ChatReasoningEffortOption, error) {
	rawSupported, ok := item["supportedReasoningEfforts"]
	if !ok || rawSupported == nil {
		return nil, fmt.Errorf("%s.supportedReasoningEfforts is required", label)
	}
	items, ok := rawSupported.([]any)
	if !ok {
		return nil, fmt.Errorf("%s.supportedReasoningEfforts must be an array", label)
	}
	options := make([]ChatReasoningEffortOption, 0, len(items))
	for index, rawOption := range items {
		option, ok := rawOption.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%s.supportedReasoningEfforts[%d] must be an object", label, index)
		}
		optionLabel := fmt.Sprintf("%s.supportedReasoningEfforts[%d]", label, index)
		effort, err := requireReasoningEffort(option, "reasoningEffort", optionLabel)
		if err != nil {
			return nil, err
		}
		description, err := requireStringAllowEmpty(option, "description", optionLabel)
		if err != nil {
			return nil, err
		}
		options = append(options, ChatReasoningEffortOption{
			Description: description,
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

func requireReasoningEffort(value map[string]any, name string, label string) (ReasoningEffort, error) {
	raw, err := requireString(value, name, label)
	if err != nil {
		return "", err
	}
	effort := ReasoningEffort(raw)
	if !validValue(effort, reasoningEffortValues) {
		return "", fmt.Errorf("%s.%s has unsupported reasoning effort %s", label, name, raw)
	}
	return effort, nil
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
