package chat

import (
	"context"
	"encoding/json"
	"fmt"
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

func (harness *CodexHarness) executeActiveCommand(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, error) {
	active := harness.activeTurnForCommand(request.ActiveRun.ID)
	if active == nil || active.threadID == "" {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is not available for the active run", nil)
	}
	return harness.executeCodexCommandRPC(ctx, active.session, active.threadID, "", request.Command)
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

	if !commandNeedsThread(request.Command) {
		return harness.executeCodexCommandRPC(ctx, session, "", "", request.Command)
	}
	thread, err := harness.startOrResumeCommandThread(ctx, session, request.Workspace, request.ThreadRef)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	if err := session.OwnThread(thread.Ref.ThreadID); err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "own codex command thread: "+err.Error(), err)
	}
	result, err := harness.executeCodexCommandRPC(ctx, session, thread.Ref.ThreadID, thread.Model, request.Command)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	result.ThreadRef = thread.Ref
	result.HasThreadRef = true
	return result, nil
}

type codexCommandThread struct {
	Ref   HarnessThreadRef
	Model string
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
			return codexCommandThread{}, commandError(ChatCommandErrorCodexThread, fmt.Sprintf("resume codex thread %s: %v", threadRef.ThreadID, err), err)
		}
		thread, err := commandThreadFromResponse(result)
		if err != nil {
			return codexCommandThread{}, commandError(ChatCommandErrorCodexProviderDrift, "resume codex thread response: "+err.Error(), err)
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

func (harness *CodexHarness) executeCodexCommandRPC(ctx context.Context, session *codexapp.Session, threadID string, currentModel string, command ChatCommand) (HarnessCommandResult, error) {
	switch command.Kind {
	case ChatCommandGoal:
		return executeCodexGoalCommand(ctx, session, threadID, command)
	case ChatCommandModel:
		return executeCodexModelCommand(ctx, session, threadID, currentModel, command)
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

func executeCodexModelCommand(ctx context.Context, session *codexapp.Session, threadID string, currentModel string, command ChatCommand) (HarnessCommandResult, error) {
	if command.Model == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "model command payload is required", nil)
	}
	switch command.Model.Action {
	case ModelCommandShowPicker:
		raw, err := session.Call(ctx, "model/list", map[string]any{"includeHidden": true})
		if err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "model/list: "+err.Error(), err)
		}
		models, err := modelOptionsFromResponse(raw)
		if err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexProviderDrift, "model/list response: "+err.Error(), err)
		}
		return HarnessCommandResult{Action: ChatCommandResultModelPicker, Models: models}, nil
	case ModelCommandSet:
		if threadID == "" {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is required to set the model", nil)
		}
		if currentModel == command.Model.ModelID {
			return HarnessCommandResult{
				Action:        ChatCommandResultDisplay,
				SelectedModel: command.Model.ModelID,
			}, nil
		}
		_, err := session.Call(ctx, "thread/settings/update", map[string]any{
			"model":    command.Model.ModelID,
			"threadId": threadID,
		})
		if err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "thread/settings/update: "+err.Error(), err)
		}
		appliedModel, err := waitForCodexThreadSettingsUpdated(ctx, session, threadID, command.Model.ModelID)
		if err != nil {
			return HarnessCommandResult{}, err
		}
		return HarnessCommandResult{
			Action:        ChatCommandResultDisplay,
			SelectedModel: appliedModel,
		}, nil
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported model command action: %s", command.Model.Action), nil)
	}
}

func waitForCodexThreadSettingsUpdated(ctx context.Context, session *codexapp.Session, threadID string, selectedModel string) (string, error) {
	waitCtx, cancel := context.WithTimeout(ctx, codexSettingsUpdatedTimeout)
	defer cancel()

	for {
		select {
		case <-waitCtx.Done():
			return "", commandError(
				ChatCommandErrorCodexRPC,
				fmt.Sprintf("thread/settings/update did not emit thread/settings/updated for thread %s model %s: %v", threadID, selectedModel, waitCtx.Err()),
				waitCtx.Err(),
			)
		case event, ok := <-session.Events():
			if !ok {
				err := fmt.Errorf("codex app-server session closed before thread/settings/updated")
				return "", commandError(ChatCommandErrorCodexRPC, "thread/settings/update: "+err.Error(), err)
			}
			if event.Kind == codexapp.EventLifecycle {
				err := fmt.Errorf("codex app-server exited before thread/settings/updated: %w", event.Err)
				return "", commandError(ChatCommandErrorCodexRPC, "thread/settings/update: "+err.Error(), err)
			}
			if event.Kind != codexapp.EventNotification {
				continue
			}
			message := event.Message
			if message.Method != "thread/settings/updated" {
				continue
			}
			appliedModel, err := codexThreadSettingsUpdatedModel(message, threadID)
			if err != nil {
				return "", commandError(ChatCommandErrorCodexProviderDrift, "thread/settings/updated notification: "+err.Error(), err)
			}
			if appliedModel != selectedModel {
				return "", commandError(
					ChatCommandErrorCodexProviderDrift,
					fmt.Sprintf("thread/settings/updated selected model %s, want %s", appliedModel, selectedModel),
					nil,
				)
			}
			return appliedModel, nil
		}
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
	return codexCommandThread{
		Ref: HarnessThreadRef{
			Harness:   HarnessCodex,
			SessionID: sessionID,
			Status:    HarnessRefLinked,
			ThreadID:  threadID,
		},
		Model: model,
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
	threadID, err := requireString(goal, "threadId", "codex goal response goal")
	if err != nil {
		return nil, err
	}
	objective, err := requireStringAllowEmpty(goal, "objective", "codex goal response goal")
	if err != nil {
		return nil, err
	}
	status, err := requireString(goal, "status", "codex goal response goal")
	if err != nil {
		return nil, err
	}
	if _, ok := codexThreadGoalStatuses[status]; !ok {
		return nil, fmt.Errorf("unsupported codex thread goal status: %s", status)
	}
	return &ChatGoalState{
		Objective: objective,
		Status:    status,
		ThreadID:  threadID,
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
	return ChatModelOption{
		Description: description,
		DisplayName: displayName,
		Hidden:      hidden,
		ID:          id,
		IsDefault:   isDefault,
		Model:       model,
	}, nil
}
