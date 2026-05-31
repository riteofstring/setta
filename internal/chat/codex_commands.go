package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

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
	return harness.executeCodexCommandRPC(ctx, active.client, active.threadID, "", request.Workspace, request.Command)
}

func (harness *CodexHarness) activeTurnForCommand(runID string) *codexActiveTurn {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	active := harness.active[runID]
	if active == nil {
		return nil
	}
	return &codexActiveTurn{
		client:   active.client,
		threadID: active.threadID,
		turnID:   active.turnID,
	}
}

func (harness *CodexHarness) executeIdleCommand(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, error) {
	client, err := startJSONRPCClient(harness.config)
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "start codex app-server: "+err.Error(), err)
	}
	defer client.close()

	if err := harness.initializeCodex(ctx, client); err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, err.Error(), err)
	}
	if !commandNeedsThread(request.Command) {
		return harness.executeCodexCommandRPC(ctx, client, "", "", request.Workspace, request.Command)
	}
	thread, err := harness.startOrResumeCommandThread(ctx, client, request.Workspace, request.ThreadRef)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	result, err := harness.executeCodexCommandRPC(ctx, client, thread.Ref.ThreadID, thread.Model, request.Workspace, request.Command)
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

func (harness *CodexHarness) startOrResumeCommandThread(ctx context.Context, client *jsonRPCClient, workspaceSummary workspace.WorkspaceSummary, threadRef HarnessThreadRef) (codexCommandThread, error) {
	if threadRef.ThreadID != "" && threadRef.Status == HarnessRefLinked {
		result, err := client.call(ctx, "thread/resume", map[string]any{
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

	result, err := client.call(ctx, "thread/start", map[string]any{
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

func (harness *CodexHarness) executeCodexCommandRPC(ctx context.Context, client *jsonRPCClient, threadID string, currentModel string, workspaceSummary workspace.WorkspaceSummary, command ChatCommand) (HarnessCommandResult, error) {
	switch command.Kind {
	case ChatCommandGoal:
		return executeCodexGoalCommand(ctx, client, threadID, command)
	case ChatCommandMCP:
		return executeCodexMCPCommand(ctx, client)
	case ChatCommandModel:
		return executeCodexModelCommand(ctx, client, threadID, currentModel, command)
	case ChatCommandSkills:
		return executeCodexSkillsCommand(ctx, client, workspaceSummary)
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorUnsupportedHarness, fmt.Sprintf("codex does not support chat command kind %s", command.Kind), nil)
	}
}

func executeCodexGoalCommand(ctx context.Context, client *jsonRPCClient, threadID string, command ChatCommand) (HarnessCommandResult, error) {
	if threadID == "" {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is required for goal commands", nil)
	}
	if command.Goal == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "goal command payload is required", nil)
	}
	switch command.Goal.Action {
	case GoalCommandShow:
		raw, err := client.call(ctx, "thread/goal/get", map[string]any{"threadId": threadID})
		if err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "thread/goal/get: "+err.Error(), err)
		}
		goal, err := goalStateFromResponse(raw)
		if err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexProviderDrift, "thread/goal/get response: "+err.Error(), err)
		}
		return HarnessCommandResult{Action: ChatCommandResultDisplay, Goal: goal}, nil
	case GoalCommandSet:
		raw, err := client.call(ctx, "thread/goal/set", map[string]any{
			"objective": command.Goal.Objective,
			"status":    "active",
			"threadId":  threadID,
		})
		return goalMutationResult(raw, err, "thread/goal/set")
	case GoalCommandClear:
		_, err := client.call(ctx, "thread/goal/clear", map[string]any{"threadId": threadID})
		if err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "thread/goal/clear: "+err.Error(), err)
		}
		return HarnessCommandResult{Action: ChatCommandResultDisplay}, nil
	case GoalCommandPause, GoalCommandResume:
		raw, err := client.call(ctx, "thread/goal/set", map[string]any{
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

func executeCodexModelCommand(ctx context.Context, client *jsonRPCClient, threadID string, currentModel string, command ChatCommand) (HarnessCommandResult, error) {
	if command.Model == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "model command payload is required", nil)
	}
	switch command.Model.Action {
	case ModelCommandShowPicker:
		raw, err := client.call(ctx, "model/list", map[string]any{"includeHidden": true})
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
		_, err := client.call(ctx, "thread/settings/update", map[string]any{
			"model":    command.Model.ModelID,
			"threadId": threadID,
		})
		if err != nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "thread/settings/update: "+err.Error(), err)
		}
		appliedModel, err := waitForCodexThreadSettingsUpdated(ctx, client, threadID, command.Model.ModelID)
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

func executeCodexSkillsCommand(ctx context.Context, client *jsonRPCClient, workspaceSummary workspace.WorkspaceSummary) (HarnessCommandResult, error) {
	raw, err := client.call(ctx, "skills/list", map[string]any{
		"cwds":        []string{workspaceSummary.RootPath},
		"forceReload": true,
	})
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "skills/list: "+err.Error(), err)
	}
	message, err := skillsListMessageFromResponse(raw)
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexProviderDrift, "skills/list response: "+err.Error(), err)
	}
	return HarnessCommandResult{
		Action:         ChatCommandResultDisplay,
		DisplayTitle:   "Skills",
		DisplayMessage: message,
	}, nil
}

func executeCodexMCPCommand(ctx context.Context, client *jsonRPCClient) (HarnessCommandResult, error) {
	raw, err := client.call(ctx, "mcpServerStatus/list", map[string]any{
		"detail": "toolsAndAuthOnly",
	})
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexRPC, "mcpServerStatus/list: "+err.Error(), err)
	}
	message, err := mcpStatusMessageFromResponse(raw)
	if err != nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexProviderDrift, "mcpServerStatus/list response: "+err.Error(), err)
	}
	return HarnessCommandResult{
		Action:         ChatCommandResultDisplay,
		DisplayTitle:   "MCP",
		DisplayMessage: message,
	}, nil
}

func skillsListMessageFromResponse(raw json.RawMessage) (string, error) {
	response, err := objectValue(raw, "codex skills list response")
	if err != nil {
		return "", err
	}
	entries, err := requireObjectArray(response, "data", "codex skills list response")
	if err != nil {
		return "", err
	}
	summaries, err := collectSkillSummaries(entries)
	if err != nil {
		return "", err
	}
	sort.Strings(summaries.enabled)
	return formatSkillsListMessage(summaries), nil
}

type skillsListSummaries struct {
	enabled       []string
	disabledCount int
}

func collectSkillSummaries(entries []map[string]any) (skillsListSummaries, error) {
	summaries := skillsListSummaries{}
	for entryIndex, entry := range entries {
		skills, err := requireObjectArray(entry, "skills", fmt.Sprintf("codex skills list response.data[%d]", entryIndex))
		if err != nil {
			return summaries, err
		}
		for skillIndex, skill := range skills {
			enabledSummary, enabled, err := skillSummaryFromResponse(entryIndex, skillIndex, skill)
			if err != nil {
				return summaries, err
			}
			if !enabled {
				summaries.disabledCount += 1
				continue
			}
			summaries.enabled = append(summaries.enabled, enabledSummary)
		}
	}
	return summaries, nil
}

func skillSummaryFromResponse(entryIndex int, skillIndex int, skill map[string]any) (string, bool, error) {
	label := fmt.Sprintf("codex skills list response.data[%d].skills[%d]", entryIndex, skillIndex)
	name, err := requireString(skill, "name", label)
	if err != nil {
		return "", false, err
	}
	description, err := requireStringAllowEmpty(skill, "description", label)
	if err != nil {
		return "", false, err
	}
	path, err := requireString(skill, "path", label)
	if err != nil {
		return "", false, err
	}
	enabled, err := requireBool(skill, "enabled", label)
	if err != nil {
		return "", false, err
	}
	return formatSkillSummary(name, description, path), enabled, nil
}

func formatSkillsListMessage(summaries skillsListSummaries) string {
	enabled := summaries.enabled
	disabledCount := summaries.disabledCount
	if len(enabled) == 0 {
		if disabledCount == 0 {
			return "No skills found for this workspace."
		}
		return fmt.Sprintf("No enabled skills found. %d disabled skill(s) are present.", disabledCount)
	}
	var builder strings.Builder
	fmt.Fprintf(&builder, "Available skills (%d enabled", len(enabled))
	if disabledCount > 0 {
		fmt.Fprintf(&builder, ", %d disabled", disabledCount)
	}
	builder.WriteString("):")
	limit := min(len(enabled), 20)
	for _, item := range enabled[:limit] {
		builder.WriteString("\n- ")
		builder.WriteString(item)
	}
	if len(enabled) > limit {
		fmt.Fprintf(&builder, "\n- ...and %d more", len(enabled)-limit)
	}
	return builder.String()
}

func formatSkillSummary(name string, description string, path string) string {
	if description == "" {
		return fmt.Sprintf("%s (%s)", name, path)
	}
	return fmt.Sprintf("%s: %s (%s)", name, description, path)
}

func mcpStatusMessageFromResponse(raw json.RawMessage) (string, error) {
	response, err := objectValue(raw, "codex mcp status response")
	if err != nil {
		return "", err
	}
	servers, err := requireObjectArray(response, "data", "codex mcp status response")
	if err != nil {
		return "", err
	}
	if len(servers) == 0 {
		return "No MCP servers configured.", nil
	}
	rows := make([]string, 0, len(servers))
	for index, server := range servers {
		label := fmt.Sprintf("codex mcp status response.data[%d]", index)
		name, err := requireString(server, "name", label)
		if err != nil {
			return "", err
		}
		authStatus, err := requireString(server, "authStatus", label)
		if err != nil {
			return "", err
		}
		tools, err := optionalObjectMap(server, "tools", label)
		if err != nil {
			return "", err
		}
		toolNames := sortedKeys(tools)
		rows = append(rows, formatMCPServerSummary(name, authStatus, toolNames))
	}
	sort.Strings(rows)
	return "MCP servers:\n- " + strings.Join(rows, "\n- "), nil
}

func formatMCPServerSummary(name string, authStatus string, toolNames []string) string {
	if len(toolNames) == 0 {
		return fmt.Sprintf("%s: auth %s, no tools", name, authStatus)
	}
	if len(toolNames) > 8 {
		return fmt.Sprintf("%s: auth %s, %d tools (%s, ...)", name, authStatus, len(toolNames), strings.Join(toolNames[:8], ", "))
	}
	return fmt.Sprintf("%s: auth %s, %d tools (%s)", name, authStatus, len(toolNames), strings.Join(toolNames, ", "))
}

func requireObjectArray(value map[string]any, name string, label string) ([]map[string]any, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return nil, fmt.Errorf("%s.%s is required", label, name)
	}
	items, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be an array", label, name)
	}
	result := make([]map[string]any, 0, len(items))
	for index, rawItem := range items {
		item, ok := rawItem.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%s.%s[%d] must be an object", label, name, index)
		}
		result = append(result, item)
	}
	return result, nil
}

func optionalObjectMap(value map[string]any, name string, label string) (map[string]any, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return map[string]any{}, nil
	}
	items, ok := raw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be an object", label, name)
	}
	return items, nil
}

func sortedKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func waitForCodexThreadSettingsUpdated(ctx context.Context, client *jsonRPCClient, threadID string, selectedModel string) (string, error) {
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
		case <-client.lifecycle.Done():
			err := client.lifecycleError("codex app-server exited before thread/settings/updated")
			return "", commandError(ChatCommandErrorCodexRPC, "thread/settings/update: "+err.Error(), err)
		case message := <-client.notifications:
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
