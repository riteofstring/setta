package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	SettaAgentToolNamespace          = "setta"
	SettaWorkspaceFileReadToolName   = "read_workspace_file"
	SettaWorkflowResultAgentToolName = "workflow_result"
	settaWorkspaceFileReadMaxBytes   = 256 * 1024
)

type SettaWorkspaceFileReadPayload struct {
	Path      string `json:"path"`
	LineStart *int   `json:"lineStart"`
	LineEnd   *int   `json:"lineEnd"`
}

type SettaWorkflowResultPayload struct {
	Signals   []SettaWorkflowResultSignal `json:"signals"`
	Output    json.RawMessage             `json:"output"`
	FilePaths []string                    `json:"filePaths"`
}

type SettaWorkflowResultSignal struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

func NewSettaAgentToolRegistry() (*AgentToolRegistry, error) {
	return NewAgentToolRegistry(
		settaWorkspaceContextTool(),
		settaWorkspaceFileReadTool(),
		settaWorkflowResultTool(),
	)
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

func settaWorkspaceFileReadTool() AgentTool {
	return AgentTool{
		Namespace: SettaAgentToolNamespace,
		Name:      SettaWorkspaceFileReadToolName,
		InputSchema: AgentToolSchema{
			Type: AgentToolSchemaObject,
			Properties: map[string]AgentToolSchema{
				"path": {
					Type:        AgentToolSchemaString,
					Description: "Workspace-relative file path to read.",
				},
				"lineStart": {
					Type:        AgentToolSchemaInteger,
					Description: "Optional one-based first line to read.",
				},
				"lineEnd": {
					Type:        AgentToolSchemaInteger,
					Description: "Optional one-based last line to read, inclusive.",
				},
			},
			Required: []string{"path"},
		},
		OutputSchema: AgentToolSchema{
			Type:        AgentToolSchemaObject,
			Description: "File content excerpt from the current Setta workspace.",
		},
		PermissionRequirements: []AgentToolPermissionRequirement{{
			Kind:        AgentToolPermissionReadWorkspace,
			Description: "Read a file from the current Setta workspace.",
		}},
		FileOperation: &AgentToolFileOperation{
			Operation:          RunItemFileOperationRead,
			PathArgument:       "path",
			RangeStartArgument: "lineStart",
			RangeEndArgument:   "lineEnd",
		},
		AuditMetadata: AgentToolAuditMetadata{
			DisplayName: "Read workspace file",
			Description: "Read an explicit file path from the current Setta workspace.",
			Category:    "workspace",
		},
		Handler: handleSettaWorkspaceFileRead,
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

func handleSettaWorkspaceFileRead(ctx context.Context, call AgentToolCall) (AgentToolResult, error) {
	payload, err := DecodeSettaWorkspaceFileReadPayload(call.Arguments)
	if err != nil {
		return AgentToolResult{}, err
	}
	runtime, ok := AgentToolRuntimeFromContext(ctx)
	if !ok || runtime.Workspace.RootPath == "" {
		return AgentToolResult{}, errors.New("workspace file read context is unavailable for this tool call")
	}
	fullPath, err := resolveSettaWorkspaceFileReadPath(runtime.Workspace.RootPath, payload.Path)
	if err != nil {
		return AgentToolResult{}, err
	}
	data, err := readSettaWorkspaceFile(fullPath, payload.Path)
	if err != nil {
		return AgentToolResult{}, err
	}
	content, err := settaWorkspaceFileReadContent(string(data), payload.LineStart, payload.LineEnd)
	if err != nil {
		return AgentToolResult{}, err
	}
	resultPayload := map[string]any{
		"content": content,
		"path":    payload.Path,
	}
	if payload.LineStart != nil && payload.LineEnd != nil {
		resultPayload["lineStart"] = *payload.LineStart
		resultPayload["lineEnd"] = *payload.LineEnd
	}
	result, err := json.MarshalIndent(resultPayload, "", "  ")
	if err != nil {
		return AgentToolResult{}, fmt.Errorf("encode workspace file read result: %w", err)
	}
	return AgentToolResult{
		ContentItems: []AgentToolContentItem{{
			Type: "inputText",
			Text: string(result),
		}},
		Success: true,
	}, nil
}

func readSettaWorkspaceFile(fullPath string, requestedPath string) ([]byte, error) {
	info, err := os.Stat(fullPath)
	if err != nil {
		return nil, fmt.Errorf("stat workspace file %s: %w", requestedPath, err)
	}
	if info.IsDir() {
		return nil, fmt.Errorf("workspace file path is a directory: %s", requestedPath)
	}
	if info.Size() > settaWorkspaceFileReadMaxBytes {
		return nil, fmt.Errorf("workspace file %s is larger than %d bytes", requestedPath, settaWorkspaceFileReadMaxBytes)
	}
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, fmt.Errorf("read workspace file %s: %w", requestedPath, err)
	}
	return data, nil
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

func DecodeSettaWorkspaceFileReadPayload(arguments json.RawMessage) (SettaWorkspaceFileReadPayload, error) {
	if len(arguments) == 0 {
		return SettaWorkspaceFileReadPayload{}, errors.New("read_workspace_file arguments are required")
	}
	var payload SettaWorkspaceFileReadPayload
	if err := json.Unmarshal(arguments, &payload); err != nil {
		return SettaWorkspaceFileReadPayload{}, fmt.Errorf("read_workspace_file arguments must be a JSON object: %w", err)
	}
	if payload.Path == "" {
		return SettaWorkspaceFileReadPayload{}, errors.New("read_workspace_file path is required")
	}
	if (payload.LineStart == nil) != (payload.LineEnd == nil) {
		return SettaWorkspaceFileReadPayload{}, errors.New("read_workspace_file lineStart and lineEnd must be provided together")
	}
	if payload.LineStart != nil {
		if *payload.LineStart < 1 {
			return SettaWorkspaceFileReadPayload{}, errors.New("read_workspace_file lineStart must be positive")
		}
		if *payload.LineEnd < *payload.LineStart {
			return SettaWorkspaceFileReadPayload{}, errors.New("read_workspace_file lineEnd must be greater than or equal to lineStart")
		}
	}
	return payload, nil
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

func resolveSettaWorkspaceFileReadPath(rootPath string, requestedPath string) (string, error) {
	cleanRelativePath, err := cleanSettaWorkspaceFileReadPath(requestedPath)
	if err != nil {
		return "", err
	}
	realRoot, err := filepath.EvalSymlinks(rootPath)
	if err != nil {
		return "", fmt.Errorf("resolve workspace root: %w", err)
	}
	fullPath := filepath.Join(realRoot, cleanRelativePath)
	realPath, err := filepath.EvalSymlinks(fullPath)
	if err != nil {
		return "", fmt.Errorf("resolve workspace file %s: %w", requestedPath, err)
	}
	if err := requireSettaWorkspaceResolvedPath(realRoot, realPath, requestedPath); err != nil {
		return "", err
	}
	return realPath, nil
}

func cleanSettaWorkspaceFileReadPath(requestedPath string) (string, error) {
	if strings.ContainsRune(requestedPath, '\x00') {
		return "", errors.New("read_workspace_file path contains a NUL byte")
	}
	if filepath.IsAbs(requestedPath) {
		return "", fmt.Errorf("read_workspace_file path must be workspace-relative: %s", requestedPath)
	}
	cleanRelativePath := filepath.Clean(requestedPath)
	if settaWorkspaceRelativePathEscapes(cleanRelativePath) {
		return "", fmt.Errorf("read_workspace_file path escapes the workspace: %s", requestedPath)
	}
	return cleanRelativePath, nil
}

func requireSettaWorkspaceResolvedPath(realRoot string, realPath string, requestedPath string) error {
	relativeToRoot, err := filepath.Rel(realRoot, realPath)
	if err != nil {
		return fmt.Errorf("resolve workspace file %s relative to workspace: %w", requestedPath, err)
	}
	if settaWorkspaceRelativePathEscapes(relativeToRoot) || filepath.IsAbs(relativeToRoot) {
		return fmt.Errorf("read_workspace_file path escapes the workspace: %s", requestedPath)
	}
	return nil
}

func settaWorkspaceRelativePathEscapes(relativePath string) bool {
	return relativePath == "." || relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator))
}

func settaWorkspaceFileReadContent(content string, lineStart *int, lineEnd *int) (string, error) {
	if lineStart == nil && lineEnd == nil {
		return content, nil
	}
	if lineStart == nil || lineEnd == nil {
		return "", errors.New("read_workspace_file lineStart and lineEnd must be provided together")
	}
	lines := strings.SplitAfter(content, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	startIndex := *lineStart - 1
	endIndex := *lineEnd
	if startIndex >= len(lines) {
		return "", fmt.Errorf("read_workspace_file lineStart %d is past end of file", *lineStart)
	}
	if endIndex > len(lines) {
		return "", fmt.Errorf("read_workspace_file lineEnd %d is past end of file", *lineEnd)
	}
	return strings.Join(lines[startIndex:endIndex], ""), nil
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
