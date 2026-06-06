package chat

import (
	"fmt"
	"sort"
)

const (
	codexDynamicToolNameMaxLength      = 128
	codexDynamicToolNamespaceMaxLength = 64
)

var codexReservedDynamicToolNamespaces = map[string]struct{}{
	"api_tool":            {},
	"browser":             {},
	"computer":            {},
	"container":           {},
	"file_search":         {},
	"functions":           {},
	"image_gen":           {},
	"multi_tool_use":      {},
	"python":              {},
	"python_user_visible": {},
	"submodel_delegator":  {},
	"terminal":            {},
	"tool_search":         {},
	"web":                 {},
}

type codexDynamicToolSpec struct {
	Namespace    string         `json:"namespace"`
	Name         string         `json:"name"`
	Description  string         `json:"description"`
	InputSchema  map[string]any `json:"inputSchema"`
	DeferLoading bool           `json:"deferLoading,omitempty"`
}

func (harness *CodexHarness) codexThreadStartParams(workspaceRoot string) (map[string]any, error) {
	params := map[string]any{
		"approvalPolicy":        "on-request",
		"approvalsReviewer":     "user",
		"cwd":                   workspaceRoot,
		"developerInstructions": codexDeveloperInstructions(),
		"runtimeWorkspaceRoots": []string{workspaceRoot},
	}
	specs, err := codexDynamicToolSpecs(harness.config.Tools)
	if err != nil {
		return nil, err
	}
	if len(specs) > 0 {
		params["dynamicTools"] = specs
	}
	return params, nil
}

func codexThreadResumeParams(workspaceRoot string, threadID string) map[string]any {
	return map[string]any{
		"approvalPolicy":        "on-request",
		"approvalsReviewer":     "user",
		"cwd":                   workspaceRoot,
		"excludeTurns":          true,
		"runtimeWorkspaceRoots": []string{workspaceRoot},
		"threadId":              threadID,
	}
}

func codexDynamicToolSpecs(registry *AgentToolRegistry) ([]codexDynamicToolSpec, error) {
	tools := registry.Tools()
	specs := make([]codexDynamicToolSpec, 0, len(tools))
	for _, tool := range tools {
		spec, err := codexDynamicToolSpecFromAgentTool(tool)
		if err != nil {
			return nil, err
		}
		specs = append(specs, spec)
	}
	return specs, nil
}

func codexDynamicToolSpecFromAgentTool(tool AgentTool) (codexDynamicToolSpec, error) {
	if tool.Namespace != SettaAgentToolNamespace {
		return codexDynamicToolSpec{}, fmt.Errorf("codex dynamic tool %s must use namespace %q, got %q", tool.Name, SettaAgentToolNamespace, tool.Namespace)
	}
	if err := validateCodexDynamicToolIdentifier(tool.Name, "name", codexDynamicToolNameMaxLength); err != nil {
		return codexDynamicToolSpec{}, fmt.Errorf("codex dynamic tool %s: %w", agentToolKey(tool.Namespace, tool.Name), err)
	}
	if err := validateCodexDynamicToolIdentifier(tool.Namespace, "namespace", codexDynamicToolNamespaceMaxLength); err != nil {
		return codexDynamicToolSpec{}, fmt.Errorf("codex dynamic tool %s: %w", agentToolKey(tool.Namespace, tool.Name), err)
	}
	if _, reserved := codexReservedDynamicToolNamespaces[tool.Namespace]; reserved {
		return codexDynamicToolSpec{}, fmt.Errorf("codex dynamic tool %s uses reserved namespace %q", tool.Name, tool.Namespace)
	}
	return codexDynamicToolSpec{
		Namespace:    tool.Namespace,
		Name:         tool.Name,
		Description:  tool.AuditMetadata.Description,
		InputSchema:  codexDynamicToolJSONSchema(tool.InputSchema),
		DeferLoading: tool.DeferLoading,
	}, nil
}

func validateCodexDynamicToolIdentifier(value string, label string, maxLength int) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if len(value) > maxLength {
		return fmt.Errorf("%s is longer than %d characters", label, maxLength)
	}
	for _, char := range []byte(value) {
		if isCodexDynamicToolIdentifierByte(char) {
			continue
		}
		return fmt.Errorf("%s contains unsupported character %q", label, char)
	}
	return nil
}

func isCodexDynamicToolIdentifierByte(char byte) bool {
	return char >= 'a' && char <= 'z' ||
		char >= 'A' && char <= 'Z' ||
		char >= '0' && char <= '9' ||
		char == '_' ||
		char == '-'
}

func codexDynamicToolJSONSchema(schema AgentToolSchema) map[string]any {
	result := map[string]any{
		"type": string(schema.Type),
	}
	if schema.Title != "" {
		result["title"] = schema.Title
	}
	if schema.Description != "" {
		result["description"] = schema.Description
	}
	if len(schema.Enum) > 0 {
		values := append([]string{}, schema.Enum...)
		result["enum"] = values
	}
	if len(schema.Required) > 0 {
		result["required"] = append([]string{}, schema.Required...)
	}
	if schema.Type == AgentToolSchemaObject {
		result["additionalProperties"] = false
		result["properties"] = codexDynamicToolJSONSchemaProperties(schema.Properties)
	}
	if schema.Type == AgentToolSchemaArray && schema.Items != nil {
		result["items"] = codexDynamicToolJSONSchema(*schema.Items)
	}
	return result
}

func codexDynamicToolJSONSchemaProperties(properties map[string]AgentToolSchema) map[string]any {
	result := map[string]any{}
	names := make([]string, 0, len(properties))
	for name := range properties {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		result[name] = codexDynamicToolJSONSchema(properties[name])
	}
	return result
}
