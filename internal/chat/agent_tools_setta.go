package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

const (
	SettaAgentToolNamespace          = "setta"
	SettaEmitArtifactAgentToolName   = "emit_artifact"
	SettaWorkflowResultAgentToolName = "workflow_result"
)

type SettaWorkflowResultPayload struct {
	Signals   []SettaWorkflowResultSignal `json:"signals"`
	Output    json.RawMessage             `json:"output"`
	FilePaths []string                    `json:"filePaths"`
}

type SettaWorkflowResultSignal struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

func NewSettaAgentToolRegistry(extraTools ...AgentTool) (*AgentToolRegistry, error) {
	tools := []AgentTool{settaWorkspaceContextTool(), settaWorkflowResultTool()}
	tools = append(tools, extraTools...)
	return NewAgentToolRegistry(tools...)
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
			Description: "Read the current Setta workspace, project, folder, repository, chat, conversation, run, and Codex thread context.",
			Category:    "workspace",
		},
		Handler: handleSettaWorkspaceContext,
	}
}

func settaWorkflowResultTool() AgentTool {
	allowOutputProperties := true
	return AgentTool{
		Namespace: SettaAgentToolNamespace,
		Name:      SettaWorkflowResultAgentToolName,
		InputSchema: AgentToolSchema{
			Type: AgentToolSchemaObject,
			Properties: map[string]AgentToolSchema{
				"signals": {
					Type:        AgentToolSchemaArray,
					Description: "Structured routing signals reported by this workflow action.",
					Items: &AgentToolSchema{
						Type: AgentToolSchemaObject,
						Properties: map[string]AgentToolSchema{
							"name": {
								Type:        AgentToolSchemaString,
								Description: "Signal name.",
							},
							"value": {
								Type:        AgentToolSchemaString,
								Description: "Signal value.",
							},
						},
						Required: []string{"name", "value"},
					},
				},
				"output": {
					Type:                 AgentToolSchemaObject,
					Description:          "Optional structured result payload for downstream workflow nodes.",
					AdditionalProperties: &allowOutputProperties,
				},
				"filePaths": {
					Type:        AgentToolSchemaArray,
					Description: "Workspace-relative or absolute file paths this action wants the workflow to remember.",
					Items: &AgentToolSchema{
						Type: AgentToolSchemaString,
					},
				},
			},
		},
		OutputSchema: AgentToolSchema{
			Type:        AgentToolSchemaObject,
			Description: "Acknowledgement that the workflow result was recorded.",
		},
		PermissionRequirements: []AgentToolPermissionRequirement{{
			Kind:        AgentToolPermissionReadWorkspace,
			Description: "Report structured workflow result data to Setta.",
		}},
		AuditMetadata: AgentToolAuditMetadata{
			DisplayName: "Workflow result",
			Description: "Report structured workflow routing signals, result payloads, and file references.",
			Category:    "workflow",
		},
		Handler: handleSettaWorkflowResult,
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

func handleSettaWorkflowResult(_ context.Context, call AgentToolCall) (AgentToolResult, error) {
	payload, err := DecodeSettaWorkflowResultPayload(call.Arguments)
	if err != nil {
		return AgentToolResult{}, err
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return AgentToolResult{}, fmt.Errorf("encode workflow result acknowledgement: %w", err)
	}
	return AgentToolResult{
		ContentItems: []AgentToolContentItem{{
			Type: "inputText",
			Text: string(data),
		}},
		Success: true,
	}, nil
}

func DecodeSettaWorkflowResultPayload(arguments json.RawMessage) (SettaWorkflowResultPayload, error) {
	if len(arguments) == 0 {
		return SettaWorkflowResultPayload{}, errors.New("workflow_result arguments are required")
	}
	var payload SettaWorkflowResultPayload
	if err := json.Unmarshal(arguments, &payload); err != nil {
		return SettaWorkflowResultPayload{}, fmt.Errorf("workflow_result arguments must be a JSON object: %w", err)
	}
	if payload.Signals == nil {
		payload.Signals = []SettaWorkflowResultSignal{}
	}
	if payload.FilePaths == nil {
		payload.FilePaths = []string{}
	}
	for _, signal := range payload.Signals {
		if signal.Name == "" {
			return SettaWorkflowResultPayload{}, errors.New("workflow_result signal name is required")
		}
	}
	for _, path := range payload.FilePaths {
		if path == "" {
			return SettaWorkflowResultPayload{}, errors.New("workflow_result file path must not be empty")
		}
	}
	return payload, nil
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
