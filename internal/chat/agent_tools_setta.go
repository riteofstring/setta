package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

const SettaAgentToolNamespace = "setta"

func NewSettaAgentToolRegistry() (*AgentToolRegistry, error) {
	return NewAgentToolRegistry(settaWorkspaceContextTool())
}

func mustNewSettaAgentToolRegistry() *AgentToolRegistry {
	registry, err := NewSettaAgentToolRegistry()
	if err != nil {
		panic("create default Setta agent tools: " + err.Error())
	}
	return registry
}

func settaWorkspaceContextTool() AgentTool {
	return AgentTool{
		Namespace: SettaAgentToolNamespace,
		Name:      "workspace_context",
		InputSchema: AgentToolSchema{
			Type:        AgentToolSchemaObject,
			Description: "No input is required.",
		},
		OutputSchema: AgentToolSchema{
			Type:        AgentToolSchemaObject,
			Description: "Current Setta workspace, conversation, run, and Codex thread context.",
		},
		PermissionRequirements: []AgentToolPermissionRequirement{{
			Kind:        AgentToolPermissionReadWorkspace,
			Description: "Read the current Setta workspace and chat context.",
		}},
		AuditMetadata: AgentToolAuditMetadata{
			DisplayName: "Workspace context",
			Description: "Read the current Setta workspace, conversation, run, and Codex thread context.",
			Category:    "workspace",
		},
		Handler: handleSettaWorkspaceContext,
	}
}

func handleSettaWorkspaceContext(ctx context.Context, call AgentToolCall) (AgentToolResult, error) {
	if err := requireEmptyAgentToolArguments(call.Arguments, "workspace_context"); err != nil {
		return AgentToolResult{}, err
	}
	runtime, ok := AgentToolRuntimeFromContext(ctx)
	if !ok || runtime.Workspace.ID == "" || runtime.Conversation.ID == "" || runtime.Run.ID == "" {
		return AgentToolResult{}, errors.New("workspace context is unavailable for this tool call")
	}
	payload := map[string]any{
		"codex": map[string]string{
			"threadId": runtime.ThreadID,
			"turnId":   runtime.TurnID,
		},
		"conversation": map[string]any{
			"id":            runtime.Conversation.ID,
			"title":         runtime.Conversation.Title,
			"workspaceId":   runtime.Conversation.WorkspaceID,
			"codexSettings": runtime.Conversation.CodexSettings,
			"harnessRefs":   runtime.Conversation.HarnessRefs,
			"lastUpdatedAt": runtime.Conversation.UpdatedAt,
			"createdAt":     runtime.Conversation.CreatedAt,
			"archivedAt":    runtime.Conversation.ArchivedAt,
			"schemaVersion": runtime.Conversation.SchemaVersion,
		},
		"run": map[string]any{
			"id":                 runtime.Run.ID,
			"status":             runtime.Run.Status,
			"promptSummary":      runtime.Run.PromptSummary,
			"assistantMessageId": runtime.Run.AssistantMessageID,
			"triggerMessageId":   runtime.Run.TriggerMessageID,
			"startedAt":          runtime.Run.StartedAt,
		},
		"workspace": map[string]string{
			"id":           runtime.Workspace.ID,
			"rootPath":     runtime.Workspace.RootPath,
			"displayName":  runtime.Workspace.DisplayName,
			"lastOpenedAt": runtime.Workspace.LastOpenedAt,
		},
	}
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return AgentToolResult{}, fmt.Errorf("encode workspace context: %w", err)
	}
	return AgentToolResult{
		ContentItems: []AgentToolContentItem{{
			Type: "inputText",
			Text: string(data),
		}},
		Success: true,
	}, nil
}

func requireEmptyAgentToolArguments(arguments json.RawMessage, toolName string) error {
	if len(arguments) == 0 {
		return fmt.Errorf("%s arguments are required", toolName)
	}
	var values map[string]json.RawMessage
	if err := json.Unmarshal(arguments, &values); err != nil {
		return fmt.Errorf("%s arguments must be a JSON object: %w", toolName, err)
	}
	if len(values) > 0 {
		return fmt.Errorf("%s does not accept arguments", toolName)
	}
	return nil
}
