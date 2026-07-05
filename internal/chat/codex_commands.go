package chat

import (
	"context"
	"encoding/json"
	"fmt"

	"setta/internal/codexapp"
	"setta/internal/workspace"
)

func (harness *CodexHarness) ListCommandCapabilities(_ context.Context, request HarnessCommandListRequest) (HarnessCommandListResult, error) {
	return HarnessCommandListResult{Commands: defaultCommandDescriptors(request.ActiveRun)}, nil
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

func (harness *CodexHarness) BeginGoalOperation(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, HarnessGoalOperation, error) {
	if err := ensureCommandAvailable(request.Command, request.ActiveRun); err != nil {
		return HarnessCommandResult{}, nil, err
	}
	if !commandMayStartGoalOperation(request.Command, request.ActiveRun) {
		return HarnessCommandResult{}, nil, commandError(ChatCommandErrorMalformedCommand, "command does not start a goal operation", nil)
	}
	if err := ctx.Err(); err != nil {
		return HarnessCommandResult{}, nil, err
	}

	session, operation, thread, err := harness.startGoalOperationCommandThread(ctx, request)
	if err != nil {
		return HarnessCommandResult{}, nil, err
	}
	harness.setBackgroundTerminalThreadContext(thread.Ref.ThreadID, request.Workspace.ID, request.Conversation.ID)
	result, err := harness.executeGoalOperationStartCommand(ctx, session, operation, thread, request.Command)
	if err != nil {
		err = operation.finishStartupFailure(err)
		return HarnessCommandResult{}, nil, err
	}
	if err := operation.waitForFirstRuntimeTurn(ctx); err != nil {
		return HarnessCommandResult{}, nil, commandError(ChatCommandErrorCodexRPC, err.Error(), err)
	}
	result.ThreadRef = thread.Ref
	result.HasThreadRef = true

	return result, operation, nil
}

func (harness *CodexHarness) startGoalOperationCommandThread(ctx context.Context, request HarnessCommandRequest) (*codexapp.Session, *codexGoalOperation, codexCommandThread, error) {
	var operation *codexGoalOperation
	if threadID := linkedCodexThreadID(request.ThreadRef); threadID != "" {
		var err error
		operation, err = harness.reserveGoalOperationThread(threadID)
		if err != nil {
			return nil, nil, codexCommandThread{}, commandError(ChatCommandErrorCodexRPC, err.Error(), err)
		}
	}
	session, err := harness.manager.NewSession(ctx)
	if err != nil {
		finishGoalOperation(operation, err)
		return nil, nil, codexCommandThread{}, commandError(ChatCommandErrorCodexRPC, "start codex app-server: "+err.Error(), err)
	}
	closeSession := true
	defer func() {
		if closeSession {
			session.Close()
		}
	}()

	thread, err := harness.startOrResumeCommandThread(ctx, session, request.Workspace, request.Conversation, request.ThreadRef)
	if err != nil {
		finishGoalOperation(operation, err)
		return nil, nil, codexCommandThread{}, err
	}
	providerThread, err := readCodexGoalOperationThread(ctx, session, thread.Ref.ThreadID)
	if err != nil {
		finishGoalOperation(operation, err)
		return nil, nil, codexCommandThread{}, err
	}
	if err := validateCodexGoalOperationThread(providerThread); err != nil {
		finishGoalOperation(operation, err)
		return nil, nil, codexCommandThread{}, commandError(ChatCommandErrorCodexThread, err.Error(), err)
	}
	operation, err = harness.attachGoalOperationCommandSession(session, operation, thread)
	if err != nil {
		return nil, nil, codexCommandThread{}, err
	}
	closeSession = false

	return session, operation, thread, nil
}

func (harness *CodexHarness) executeGoalOperationStartCommand(ctx context.Context, session *codexapp.Session, operation *codexGoalOperation, thread codexCommandThread, command ChatCommand) (HarnessCommandResult, error) {
	if command.Kind != ChatCommandGoal || command.Goal == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "goal command payload is required", nil)
	}
	switch command.Goal.Action {
	case GoalCommandSet:
		return executeCodexGoalOperationSetCommand(ctx, session, operation, thread.Ref.ThreadID, command.Goal.Objective)
	case GoalCommandResume:
		return executeCodexGoalOperationResumeCommand(ctx, session, operation, thread.Ref.ThreadID, command.Goal)
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("command does not start goal operation: %s", command.Goal.Action), nil)
	}
}

func executeCodexGoalOperationSetCommand(ctx context.Context, session *codexapp.Session, operation *codexGoalOperation, threadID string, objective string) (HarnessCommandResult, error) {
	_, err := session.Call(ctx, codexapp.CodexMethodThreadGoalClear, codexapp.ThreadGoalClearParams{ThreadID: threadID})
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "thread/goal/clear: "+err.Error(), err)
	}
	if err := operation.ownThread(session, threadID); err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "own codex goal operation thread: "+err.Error(), err)
	}
	status := codexapp.ThreadGoalStatusActive
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		Objective: &objective,
		Status:    &status,
		ThreadID:  threadID,
	})
	return goalMutationResult(raw, err, codexapp.CodexMethodThreadGoalSet)
}

func executeCodexGoalOperationResumeCommand(ctx context.Context, session *codexapp.Session, operation *codexGoalOperation, threadID string, goal *GoalCommand) (HarnessCommandResult, error) {
	if _, err := requireCodexGoal(ctx, session, threadID, goal.Action); err != nil {
		return HarnessCommandResult{}, err
	}
	if err := operation.ownThread(session, threadID); err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "own codex goal operation thread: "+err.Error(), err)
	}
	status := codexapp.ThreadGoalStatusActive
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		Status:   &status,
		ThreadID: threadID,
	})
	return goalMutationResult(raw, err, codexapp.CodexMethodThreadGoalSet)
}

func (harness *CodexHarness) attachGoalOperationCommandSession(session *codexapp.Session, operation *codexGoalOperation, thread codexCommandThread) (*codexGoalOperation, error) {
	var err error
	if operation == nil {
		operation, err = harness.reserveGoalOperation(session, thread.Ref.ThreadID)
	} else if thread.Ref.ThreadID != operation.threadID {
		err = fmt.Errorf("resume codex thread %s returned thread %s", operation.threadID, thread.Ref.ThreadID)
		operation.finish(TurnCompletion{}, err)
		return nil, commandError(ChatCommandErrorCodexProviderDrift, err.Error(), err)
	} else {
		err = operation.attachSession(session)
	}
	if err != nil {
		finishGoalOperation(operation, err)
		return nil, commandError(ChatCommandErrorCodexRPC, err.Error(), err)
	}
	return operation, nil
}

func finishGoalOperation(operation *codexGoalOperation, err error) {
	if operation != nil {
		operation.finish(TurnCompletion{}, err)
	}
}

func linkedCodexThreadID(threadRef HarnessThreadRef) string {
	if threadRef.ThreadID == "" || threadRef.Status != HarnessRefLinked {
		return ""
	}
	return threadRef.ThreadID
}

func (harness *CodexHarness) executeActiveCommand(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, error) {
	active := harness.activeTurnForCommand(request.ActiveRun.ID)
	if active == nil || active.threadID == "" {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is not available for the active run", nil)
	}
	return harness.executeCodexCommandRPC(ctx, active.session, active.threadID, codexCommandThreadSettings{}, request.Command)
}

func (harness *CodexHarness) activeTurnForCommand(runID string) *codexActiveTurn {
	return harness.activeTurnSnapshot(runID)
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
		return harness.executeCodexLocalSettingsCommand(ctx, session, request)
	}
	if !commandNeedsThread(request.Command) {
		return harness.executeThreadlessCommand(ctx, session, request)
	}
	return harness.executeNewCommandThread(ctx, session, request)
}

func (harness *CodexHarness) executeExistingCommandThread(ctx context.Context, session *codexapp.Session, request HarnessCommandRequest) (HarnessCommandResult, error) {
	thread, err := harness.startOrResumeCommandThread(ctx, session, request.Workspace, request.Conversation, request.ThreadRef)
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
	if commandReadsCodexSettings(request.Command) {
		var err error
		settings, err = harness.effectiveCodexCommandSettings(ctx, session, request.Workspace, request.Conversation)
		if err != nil {
			return HarnessCommandResult{}, err
		}
	}
	return harness.executeCodexCommandRPC(ctx, session, "", settings, request.Command)
}

func (harness *CodexHarness) executeNewCommandThread(ctx context.Context, session *codexapp.Session, request HarnessCommandRequest) (HarnessCommandResult, error) {
	thread, err := harness.startOrResumeCommandThread(ctx, session, request.Workspace, request.Conversation, request.ThreadRef)
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
	case ChatCommandPermission:
		return command.Permission != nil
	default:
		return false
	}
}

func commandUsesLocalCodexSettings(command ChatCommand, threadRef HarnessThreadRef) bool {
	if threadRef.ThreadID != "" && threadRef.Status == HarnessRefLinked {
		return false
	}
	switch command.Kind {
	case ChatCommandModel:
		return command.Model != nil && (command.Model.Action == ModelCommandSet || command.Model.Action == ModelCommandSetEffort)
	case ChatCommandPermission:
		return command.Permission != nil && command.Permission.Action == PermissionCommandSet
	default:
		return false
	}
}

func commandReadsCodexSettings(command ChatCommand) bool {
	switch command.Kind {
	case ChatCommandModel:
		return command.Model != nil
	case ChatCommandPermission:
		return command.Permission != nil
	default:
		return false
	}
}

type codexCommandThread struct {
	Ref      HarnessThreadRef
	Settings codexCommandThreadSettings
}

func (harness *CodexHarness) startOrResumeCommandThread(ctx context.Context, session *codexapp.Session, workspaceSummary workspace.WorkspaceSummary, conversation Conversation, threadRef HarnessThreadRef) (codexCommandThread, error) {
	if err := harness.configureCodexSkillRoots(ctx, session); err != nil {
		return codexCommandThread{}, commandError(ChatCommandErrorCodexRPC, err.Error(), err)
	}
	if threadRef.ThreadID != "" && threadRef.Status == HarnessRefLinked {
		return harness.resumeLinkedCommandThread(ctx, session, workspaceSummary, conversation, threadRef.ThreadID)
	}

	effectiveSettings, err := harness.effectiveCodexCommandSettings(ctx, session, workspaceSummary, conversation)
	if err != nil {
		return codexCommandThread{}, err
	}
	params, err := harness.codexThreadStartParams(workspaceSummary.RootPath)
	if err != nil {
		return codexCommandThread{}, commandError(ChatCommandErrorCodexRPC, "build codex thread start params: "+err.Error(), err)
	}
	if err := applyCodexThreadStartSettings(params, effectiveSettings); err != nil {
		return codexCommandThread{}, commandError(ChatCommandErrorCodexProviderDrift, "start codex thread request: "+err.Error(), err)
	}
	result, err := session.Call(ctx, codexapp.CodexMethodThreadStart, params)
	if err != nil {
		return codexCommandThread{}, commandError(ChatCommandErrorCodexRPC, "start codex thread: "+err.Error(), err)
	}
	thread, err := commandThreadFromStartResponse(result)
	if err != nil {
		return codexCommandThread{}, commandError(ChatCommandErrorCodexProviderDrift, "start codex thread response: "+err.Error(), err)
	}
	if err := validateCodexThreadStartPermissionSettings("start codex thread response", conversation, thread.Settings); err != nil {
		return codexCommandThread{}, commandError(ChatCommandErrorCodexProviderDrift, "start codex thread response: "+err.Error(), err)
	}
	thread.Settings = overlayCodexEffectiveSettings(thread.Settings, effectiveSettings)
	return thread, nil
}

func (harness *CodexHarness) resumeLinkedCommandThread(ctx context.Context, session *codexapp.Session, workspaceSummary workspace.WorkspaceSummary, conversation Conversation, threadID string) (codexCommandThread, error) {
	params, err := codexThreadResumeParams(workspaceSummary.RootPath, threadID, conversation)
	if err != nil {
		refErr := codexThreadResumeUnavailableError(threadID, err)
		return codexCommandThread{}, commandError(ChatCommandErrorCodexProviderDrift, refErr.Error(), refErr)
	}
	result, err := session.Call(ctx, codexapp.CodexMethodThreadResume, params)
	if err != nil {
		refErr := codexThreadResumeUnavailableError(threadID, err)
		return codexCommandThread{}, commandError(ChatCommandErrorCodexThread, refErr.Error(), refErr)
	}
	thread, err := commandThreadFromResumeResponse(result)
	if err != nil {
		refErr := codexThreadResumeUnavailableError(threadID, err)
		return codexCommandThread{}, commandError(ChatCommandErrorCodexProviderDrift, refErr.Error(), refErr)
	}
	if err := validateCodexThreadResumePermissionSettings("resume codex thread response", conversation, thread.Settings); err != nil {
		refErr := codexThreadResumeUnavailableError(threadID, err)
		return codexCommandThread{}, commandError(ChatCommandErrorCodexProviderDrift, refErr.Error(), refErr)
	}
	return thread, nil
}

func (harness *CodexHarness) executeCodexLocalSettingsCommand(ctx context.Context, session *codexapp.Session, request HarnessCommandRequest) (HarnessCommandResult, error) {
	settings, err := harness.effectiveCodexCommandSettings(ctx, session, request.Workspace, request.Conversation)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	switch request.Command.Kind {
	case ChatCommandModel:
		return harness.executeCodexLocalModelSettingsCommand(ctx, session, request.Command, settings)
	case ChatCommandPermission:
		return harness.executeCodexLocalPermissionSettingsCommand(ctx, session, request.Command, settings)
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorUnsupportedHarness, fmt.Sprintf("unsupported local codex settings command kind: %s", request.Command.Kind), nil)
	}
}

func (harness *CodexHarness) executeCodexLocalModelSettingsCommand(ctx context.Context, session *codexapp.Session, command ChatCommand, settings codexCommandThreadSettings) (HarnessCommandResult, error) {
	if command.Model == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "model command payload is required", nil)
	}
	switch command.Model.Action {
	case ModelCommandSet:
		settings.Model = command.Model.ModelID
	case ModelCommandSetEffort:
		if command.Model.ReasoningEffort == nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "reasoning effort is required", nil)
		}
		settings.ReasoningEffort = *command.Model.ReasoningEffort
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported local model command action: %s", command.Model.Action), nil)
	}
	pendingSettings := settings
	settings, err := harness.codexCommandSettingsWithDisplayLabels(ctx, session, settings)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	result := codexSettingsCommandResult(settings)
	result.CodexSettings = chatCodexSettingsFromCommandSettings(pendingSettings)
	return result, nil
}

func (harness *CodexHarness) executeCodexLocalPermissionSettingsCommand(ctx context.Context, session *codexapp.Session, command ChatCommand, settings codexCommandThreadSettings) (HarnessCommandResult, error) {
	if command.Permission == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "permission command payload is required", nil)
	}
	if command.Permission.Action != PermissionCommandSet {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported local permission command action: %s", command.Permission.Action), nil)
	}
	preset, err := enabledChatPermissionPresetForSession(ctx, session, command.Permission.Preset)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	settings.ApprovalPolicy = preset.ApprovalPolicy
	settings.ActivePermissionProfileID = preset.ActivePermissionProfileID
	settings.ActivePermissionProfileExtends = ""
	pendingSettings := settings
	settings, err = harness.codexCommandSettingsWithDisplayLabels(ctx, session, settings)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	result := codexSettingsCommandResult(settings)
	result.CodexSettings = chatCodexSettingsFromCommandSettings(pendingSettings)
	return result, nil
}

func (harness *CodexHarness) executeCodexCommandRPC(ctx context.Context, session *codexapp.Session, threadID string, currentSettings codexCommandThreadSettings, command ChatCommand) (HarnessCommandResult, error) {
	switch command.Kind {
	case ChatCommandGoal:
		return executeCodexGoalCommand(ctx, session, threadID, command)
	case ChatCommandModel:
		return harness.executeCodexModelCommand(ctx, session, threadID, currentSettings, command)
	case ChatCommandPermission:
		return harness.executeCodexPermissionCommand(ctx, session, threadID, currentSettings, command)
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
	settings, err := codexCommandSettingsWithDisplayLabelsFromModels(currentSettings, models)
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexProviderDrift, "model/list response: "+err.Error(), err)
	}
	return HarnessCommandResult{
		Action:                  ChatCommandResultModelPicker,
		CodexEffectiveSettings:  chatCodexEffectiveSettingsFromCommandSettings(settings),
		Models:                  models,
		ReasoningEfforts:        reasoningEffortsForSelectedModel(models, settings.Model),
		SelectedModel:           settings.Model,
		SelectedReasoningEffort: reasoningEffortResult(settings.ReasoningEffort),
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
	settings := currentSettings
	settings.Model = modelID
	settings, err := harness.codexCommandSettingsWithDisplayLabels(ctx, session, settings)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	if currentSettings.Model == modelID {
		return codexSettingsCommandResult(settings), nil
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
	codexEffort := codexapp.ReasoningEffort(effort)
	settings := currentSettings
	settings.ReasoningEffort = effort
	settings, err := harness.codexCommandSettingsWithDisplayLabels(ctx, session, settings)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	if currentSettings.ReasoningEffort == effort {
		return codexSettingsCommandResult(settings), nil
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
		"thread/settings/update is required for linked Codex settings: "+err.Error(),
		err,
	)
}

func codexSettingsCommandResult(settings codexCommandThreadSettings) HarnessCommandResult {
	permission := chatCodexEffectivePermissionSettings(settings.ApprovalPolicy, settings.ActivePermissionProfileID, settings.ActivePermissionProfileExtends)
	return HarnessCommandResult{
		Action:                   ChatCommandResultDisplay,
		CodexSettings:            chatCodexSettingsFromCommandSettings(settings),
		CodexEffectiveSettings:   chatCodexEffectiveSettingsFromCommandSettings(settings),
		CurrentPermission:        permission,
		SelectedModel:            settings.Model,
		SelectedPermissionPreset: selectedPermissionPresetResult(permission),
		SelectedReasoningEffort:  reasoningEffortResult(settings.ReasoningEffort),
	}
}

func commandThreadFromStartResponse(raw json.RawMessage) (codexCommandThread, error) {
	response, err := codexapp.DecodeThreadStartResponse(raw)
	if err != nil {
		return codexCommandThread{}, err
	}
	return commandThreadFromCodexResponse(response.Thread, response.Model, response.ReasoningEffort, response.ApprovalPolicy, response.ActivePermissionProfile, "codex thread start response")
}

func commandThreadFromResumeResponse(raw json.RawMessage) (codexCommandThread, error) {
	response, err := codexapp.DecodeThreadResumeResponse(raw)
	if err != nil {
		return codexCommandThread{}, err
	}
	return commandThreadFromCodexResponse(response.Thread, response.Model, response.ReasoningEffort, response.ApprovalPolicy, response.ActivePermissionProfile, "codex thread resume response")
}

func readCodexGoalOperationThread(ctx context.Context, session *codexapp.Session, threadID string) (codexapp.Thread, error) {
	includeTurns := false
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadRead, codexapp.ThreadReadParams{
		IncludeTurns: &includeTurns,
		ThreadID:     threadID,
	})
	if err != nil {
		return codexapp.Thread{}, commandError(ChatCommandErrorCodexRPC, "thread/read: "+err.Error(), err)
	}
	response, err := codexapp.DecodeThreadReadResponse(raw)
	if err != nil {
		return codexapp.Thread{}, commandError(ChatCommandErrorCodexProviderDrift, "thread/read response: "+err.Error(), err)
	}
	if response.Thread.ID != threadID {
		err := fmt.Errorf("thread/read returned thread %s, want %s", response.Thread.ID, threadID)
		return codexapp.Thread{}, commandError(ChatCommandErrorCodexProviderDrift, err.Error(), err)
	}
	return response.Thread, nil
}

func validateCodexGoalOperationThread(thread codexapp.Thread) error {
	if thread.Ephemeral {
		return fmt.Errorf("codex goal operation requires a persisted non-ephemeral thread; thread %s is ephemeral", thread.ID)
	}
	if thread.Path == nil || *thread.Path == "" {
		return fmt.Errorf("codex goal operation requires a persisted thread path for thread %s", thread.ID)
	}
	status, err := codexThreadStatusType(thread.Status, "codex goal operation thread status")
	if err != nil {
		return err
	}
	if status != "idle" {
		return fmt.Errorf("codex goal operation requires idle thread %s, status is %s", thread.ID, status)
	}
	return nil
}

func codexThreadStatusType(raw json.RawMessage, label string) (string, error) {
	status, err := objectValue(raw, label)
	if err != nil {
		return "", err
	}
	return requireString(status, "type", label)
}

func commandThreadFromCodexResponse(thread codexapp.Thread, model string, responseEffort *codexapp.ReasoningEffort, approvalPolicy codexapp.AskForApproval, activePermissionProfile *codexapp.ActivePermissionProfile, label string) (codexCommandThread, error) {
	threadID, err := threadIDFromCodexThread(thread, label)
	if err != nil {
		return codexCommandThread{}, err
	}
	if model == "" {
		return codexCommandThread{}, fmt.Errorf("%s.model is required", label)
	}
	effort := ReasoningEffort("")
	if responseEffort != nil {
		effort = ReasoningEffort(*responseEffort)
		if !validValue(effort, reasoningEffortValues) {
			return codexCommandThread{}, fmt.Errorf("%s.reasoningEffort has unsupported reasoning effort %s", label, effort)
		}
	}
	appliedApprovalPolicy := codexApprovalPolicyString(approvalPolicy)
	if err := validateSettaCodexApprovalPolicy(appliedApprovalPolicy, label+".approvalPolicy"); err != nil {
		return codexCommandThread{}, err
	}
	return codexCommandThread{
		Ref: HarnessThreadRef{
			Harness:   HarnessCodex,
			SessionID: thread.SessionId,
			Status:    HarnessRefLinked,
			ThreadID:  threadID,
		},
		Settings: codexCommandThreadSettings{
			Model:                          model,
			ReasoningEffort:                effort,
			ApprovalPolicy:                 appliedApprovalPolicy,
			ActivePermissionProfileID:      activePermissionProfileID(activePermissionProfile),
			ActivePermissionProfileExtends: activePermissionProfileExtends(activePermissionProfile),
		},
	}, nil
}

func goalStateFromGetResponse(raw json.RawMessage) (*ChatGoalState, error) {
	response, err := codexapp.DecodeThreadGoalGetResponse(raw)
	if err != nil {
		return nil, err
	}
	if response.Goal == nil {
		return nil, nil
	}
	return goalStateFromCodex(*response.Goal)
}

func goalStateFromSetResponse(raw json.RawMessage) (*ChatGoalState, error) {
	response, err := codexapp.DecodeThreadGoalSetResponse(raw)
	if err != nil {
		return nil, err
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
	return codexapp.DecodeModelListResponse(raw)
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
		SupportsImages:            codexModelSupportsImages(item),
		SupportedReasoningEfforts: supportedReasoningEfforts,
	}, nil
}

func codexModelSupportsImages(item codexapp.Model) bool {
	for _, modality := range item.InputModalities {
		if modality == codexapp.InputModalityImage {
			return true
		}
	}
	return false
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
