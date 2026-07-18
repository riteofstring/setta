package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

const (
	SettaAgentToolNamespace          = "setta"
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

func NewSettaAgentToolRegistry() (*AgentToolRegistry, error) {
	return NewAgentToolRegistry(settaMoveToTrashTool(), settaWorkspaceContextTool(), settaWorkflowResultTool())
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

func settaMoveToTrashTool() AgentTool {
	additionalProperties := false
	return AgentTool{
		Namespace: SettaAgentToolNamespace,
		Name:      "move_to_trash",
		InputSchema: AgentToolSchema{
			Type: AgentToolSchemaObject,
			Properties: map[string]AgentToolSchema{
				"path": {
					Type:        AgentToolSchemaString,
					Description: "Workspace-relative or absolute path to move to the operating system trash or recycle bin.",
				},
			},
			Required:             []string{"path"},
			AdditionalProperties: &additionalProperties,
		},
		OutputSchema: AgentToolSchema{
			Type:        AgentToolSchemaObject,
			Description: "The workspace path moved to the operating system trash or recycle bin.",
		},
		PermissionRequirements: []AgentToolPermissionRequirement{{
			Kind:        AgentToolPermissionWriteWorkspace,
			Description: "Move an item inside the current workspace to the operating system trash or recycle bin.",
		}},
		AuditMetadata: AgentToolAuditMetadata{
			DisplayName: "Move to trash",
			Description: "Move one workspace file or directory to the operating system trash or recycle bin after enforcing the workspace boundary.",
			Category:    "workspace",
		},
		Handler: handleSettaMoveToTrash,
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

type settaMoveToTrashArguments struct {
	Path string `json:"path"`
}

func handleSettaMoveToTrash(ctx context.Context, call AgentToolCall) (AgentToolResult, error) {
	arguments, err := decodeSettaMoveToTrashArguments(call.Arguments)
	if err != nil {
		return AgentToolResult{}, err
	}
	runtimeContext, ok := AgentToolRuntimeFromContext(ctx)
	if !ok || runtimeContext.Workspace.RootPath == "" {
		return AgentToolResult{}, errors.New("workspace context is unavailable for this tool call")
	}
	target, err := resolveWorkspaceTrashTarget(runtimeContext.Workspace.RootPath, arguments.Path)
	if err != nil {
		return AgentToolResult{}, err
	}
	if err := movePathToOperatingSystemTrash(ctx, target); err != nil {
		return AgentToolResult{}, err
	}
	payload, err := json.Marshal(map[string]string{"path": target})
	if err != nil {
		return AgentToolResult{}, fmt.Errorf("encode move-to-trash result: %w", err)
	}
	return AgentToolResult{
		ContentItems: []AgentToolContentItem{{Type: "inputText", Text: string(payload)}},
		Success:      true,
	}, nil
}

func decodeSettaMoveToTrashArguments(arguments json.RawMessage) (settaMoveToTrashArguments, error) {
	if len(arguments) == 0 {
		return settaMoveToTrashArguments{}, errors.New("move_to_trash arguments are required")
	}
	decoder := json.NewDecoder(bytes.NewReader(arguments))
	decoder.DisallowUnknownFields()
	var payload settaMoveToTrashArguments
	if err := decoder.Decode(&payload); err != nil {
		return settaMoveToTrashArguments{}, fmt.Errorf("move_to_trash arguments must be a JSON object with only path: %w", err)
	}
	if err := ensureJSONDocumentEnded(decoder); err != nil {
		return settaMoveToTrashArguments{}, fmt.Errorf("move_to_trash arguments must contain one JSON object: %w", err)
	}
	if payload.Path == "" {
		return settaMoveToTrashArguments{}, errors.New("move_to_trash path is required")
	}
	return payload, nil
}

func ensureJSONDocumentEnded(decoder *json.Decoder) error {
	var extra any
	err := decoder.Decode(&extra)
	if errors.Is(err, io.EOF) {
		return nil
	}
	if err != nil {
		return err
	}
	return errors.New("unexpected trailing JSON value")
}

func resolveWorkspaceTrashTarget(workspaceRoot string, requestedPath string) (string, error) {
	if !filepath.IsAbs(workspaceRoot) {
		return "", fmt.Errorf("workspace root must be absolute: %q", workspaceRoot)
	}
	resolvedRoot, err := filepath.EvalSymlinks(filepath.Clean(workspaceRoot))
	if err != nil {
		return "", fmt.Errorf("resolve workspace root %s: %w", workspaceRoot, err)
	}
	rootInfo, err := os.Stat(resolvedRoot)
	if err != nil {
		return "", fmt.Errorf("read workspace root %s: %w", resolvedRoot, err)
	}
	if !rootInfo.IsDir() {
		return "", fmt.Errorf("workspace root is not a directory: %s", resolvedRoot)
	}
	target := requestedPath
	if !filepath.IsAbs(target) {
		target = filepath.Join(resolvedRoot, target)
	}
	target = filepath.Clean(target)
	if target == resolvedRoot {
		return "", errors.New("move_to_trash cannot move the workspace root")
	}
	resolvedParent, err := filepath.EvalSymlinks(filepath.Dir(target))
	if err != nil {
		return "", fmt.Errorf("resolve move_to_trash parent for %s: %w", requestedPath, err)
	}
	if !pathWithinRoot(resolvedRoot, resolvedParent) {
		return "", fmt.Errorf("move_to_trash path is outside the workspace: %s", requestedPath)
	}
	resolvedTarget := filepath.Join(resolvedParent, filepath.Base(target))
	if _, err := os.Lstat(resolvedTarget); err != nil {
		return "", fmt.Errorf("read move_to_trash path %s: %w", requestedPath, err)
	}
	return resolvedTarget, nil
}

func pathWithinRoot(root string, path string) bool {
	relative, err := filepath.Rel(root, path)
	if err != nil || filepath.IsAbs(relative) {
		return false
	}
	return relative != ".." && !filepathHasParentPrefix(relative)
}

func filepathHasParentPrefix(path string) bool {
	return len(path) > 3 && path[:3] == ".."+string(filepath.Separator)
}

func movePathToOperatingSystemTrash(ctx context.Context, path string) error {
	command, args, err := operatingSystemTrashCommand(path)
	if err != nil {
		return err
	}
	output, err := exec.CommandContext(ctx, command, args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("move %s to trash with %s: %w: %s", path, command, err, bytes.TrimSpace(output))
	}
	return nil
}

func operatingSystemTrashCommand(path string) (string, []string, error) {
	return trashCommandForOperatingSystem(runtime.GOOS, path, exec.LookPath)
}

func trashCommandForOperatingSystem(goos string, path string, lookPath func(string) (string, error)) (string, []string, error) {
	switch goos {
	case "darwin":
		if command, err := lookPath("trash"); err == nil {
			return command, []string{"--", path}, nil
		}
		return "/usr/bin/osascript", []string{
			"-e", "on run argv",
			"-e", "tell application \"Finder\" to delete (POSIX file (item 1 of argv))",
			"-e", "end run",
			path,
		}, nil
	case "linux":
		if command, err := lookPath("gio"); err == nil {
			return command, []string{"trash", "--", path}, nil
		}
		if command, err := lookPath("trash-put"); err == nil {
			return command, []string{"--", path}, nil
		}
		return "", nil, errors.New("move_to_trash requires gio or trash-put on Linux")
	case "windows":
		command, err := lookPath("powershell.exe")
		if err != nil {
			return "", nil, errors.New("move_to_trash requires powershell.exe on Windows")
		}
		script := `Add-Type -AssemblyName Microsoft.VisualBasic; $item = Get-Item -LiteralPath $args[0] -Force; if ($item.PSIsContainer) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($item.FullName, 'OnlyErrorDialogs', 'SendToRecycleBin') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($item.FullName, 'OnlyErrorDialogs', 'SendToRecycleBin') }`
		return command, []string{"-NoProfile", "-NonInteractive", "-Command", script, path}, nil
	default:
		return "", nil, fmt.Errorf("move_to_trash is unsupported on %s", goos)
	}
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
