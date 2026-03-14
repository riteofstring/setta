package managedllm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/mcpx"
)

const maxToolCallRounds = 8

var ErrToolLoopLimitExceeded = errors.New("managed llm tool-call loop limit exceeded")

type ToolClient interface {
	InitToolsForServers(serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor
	DiscoverableToolsForServers(serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor
	CallToolWithMeta(ctx context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (mcpx.ToolCallResult, error)
}

type toolAllowlist struct {
	toolNames     map[string]struct{}
	toolBasenames map[string]struct{}
	serverIDs     map[string]struct{}
}

type toolCallState struct {
	index          int
	id             string
	providerItemID string
	name           string
	arguments      strings.Builder
}

type toolCallAccumulator struct {
	byIndex map[int]*toolCallState
}

func newToolCallAccumulator() *toolCallAccumulator {
	return &toolCallAccumulator{
		byIndex: map[int]*toolCallState{},
	}
}

func (a *toolCallAccumulator) apply(index int, toolCallID string, providerItemID string, toolName string, argumentsDelta string) *toolCallState {
	if index < 0 {
		return nil
	}
	state, ok := a.byIndex[index]
	if !ok {
		state = &toolCallState{index: index}
		a.byIndex[index] = state
	}
	if strings.TrimSpace(toolCallID) != "" {
		state.id = strings.TrimSpace(toolCallID)
	}
	if strings.TrimSpace(providerItemID) != "" {
		state.providerItemID = strings.TrimSpace(providerItemID)
	}
	if strings.TrimSpace(toolName) != "" {
		state.name = strings.TrimSpace(toolName)
	}
	if argumentsDelta != "" {
		state.arguments.WriteString(argumentsDelta)
	}
	return state
}

func (a *toolCallAccumulator) applyResolved(index int, toolCallID string, providerItemID string, toolName string, arguments string) *toolCallState {
	state := a.apply(index, toolCallID, providerItemID, toolName, "")
	if state == nil {
		return nil
	}
	if arguments != "" {
		state.arguments.Reset()
		state.arguments.WriteString(arguments)
	}
	return state
}

func (a *toolCallAccumulator) currentArguments(index int) string {
	if a == nil {
		return ""
	}
	state, ok := a.byIndex[index]
	if !ok || state == nil {
		return ""
	}
	return state.arguments.String()
}

func (a *toolCallAccumulator) finalize() ([]map[string]any, error) {
	if a == nil || len(a.byIndex) == 0 {
		return nil, nil
	}
	indexes := make([]int, 0, len(a.byIndex))
	for index := range a.byIndex {
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)
	output := make([]map[string]any, 0, len(indexes))
	for _, index := range indexes {
		state := a.byIndex[index]
		if strings.TrimSpace(state.id) == "" {
			return nil, fmt.Errorf("%w: streamed tool call id is required", ErrToolsUnsupported)
		}
		if strings.TrimSpace(state.name) == "" {
			return nil, fmt.Errorf("%w: streamed tool name is required", ErrToolsUnsupported)
		}
		arguments, err := parseToolCallArguments(state.arguments.String())
		if err != nil {
			return nil, err
		}
		output = append(output, map[string]any{
			"id":   state.id,
			"type": "function",
			"function": map[string]any{
				"name":      state.name,
				"arguments": arguments,
			},
		})
		if strings.TrimSpace(state.providerItemID) != "" {
			output[len(output)-1]["provider_item_id"] = strings.TrimSpace(state.providerItemID)
		}
	}
	return output, nil
}

func parseToolCallArguments(raw string) (map[string]any, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return map[string]any{}, nil
	}
	var arguments map[string]any
	if err := json.Unmarshal([]byte(trimmed), &arguments); err != nil {
		return nil, fmt.Errorf("%w: invalid tool call arguments: %v", ErrToolsUnsupported, err)
	}
	if arguments == nil {
		return map[string]any{}, nil
	}
	return arguments, nil
}

func buildToolDefinitions(request agentruns.ExecutionRequest, tools ToolClient) ([]map[string]any, map[string]mcpx.ToolDescriptor, *toolAllowlist, error) {
	if len(request.MCPServerIDs) == 0 {
		return nil, nil, nil, nil
	}
	if tools == nil {
		return nil, nil, nil, fmt.Errorf("%w: MCP tool client is unavailable", ErrToolsUnsupported)
	}
	allowlist, err := normalizeToolAllowlist(request)
	if err != nil {
		return nil, nil, nil, err
	}
	serverIDs := resolveAllowedServerIDs(request.MCPServerIDs, allowlist)
	if len(serverIDs) == 0 {
		return nil, map[string]mcpx.ToolDescriptor{}, allowlist, nil
	}

	serverSet := make(map[string]struct{}, len(serverIDs))
	for _, serverID := range serverIDs {
		serverSet[serverID] = struct{}{}
	}
	combined := tools.InitToolsForServers(serverSet)
	for name, descriptor := range tools.DiscoverableToolsForServers(serverSet) {
		combined[name] = descriptor
	}
	if len(combined) == 0 {
		return nil, map[string]mcpx.ToolDescriptor{}, allowlist, nil
	}

	toolNames := make([]string, 0, len(combined))
	for name := range combined {
		if !isSupportedCompletionStatusToolName(name, request.CompletionGuardEnabled) {
			continue
		}
		if !isToolAllowed(name, allowlist, request.CompletionGuardEnabled) {
			continue
		}
		toolNames = append(toolNames, name)
	}
	sort.Strings(toolNames)

	payload := make([]map[string]any, 0, len(toolNames))
	available := make(map[string]mcpx.ToolDescriptor, len(toolNames))
	for _, name := range toolNames {
		descriptor := combined[name]
		toolPayload := map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        descriptor.NamespacedName,
				"description": descriptor.Description,
				"parameters":  cloneJSONValue(descriptor.InputSchema),
			},
		}
		payload = append(payload, toolPayload)
		available[name] = descriptor
	}
	return payload, available, allowlist, nil
}

func normalizeToolAllowlist(request agentruns.ExecutionRequest) (*toolAllowlist, error) {
	if len(request.Profile.ToolAllowlist) == 0 {
		return nil, nil
	}
	availableServers := make(map[string]struct{}, len(request.MCPServerIDs))
	for _, serverID := range request.MCPServerIDs {
		trimmed := strings.TrimSpace(serverID)
		if trimmed == "" {
			continue
		}
		availableServers[trimmed] = struct{}{}
	}
	result := &toolAllowlist{
		toolNames:     map[string]struct{}{},
		toolBasenames: map[string]struct{}{},
		serverIDs:     map[string]struct{}{},
	}
	for _, entry := range request.Profile.ToolAllowlist {
		normalized := strings.TrimSpace(entry)
		if normalized == "" {
			return nil, fmt.Errorf("%w: toolAllowlist entries must be non-empty strings", ErrToolsUnsupported)
		}
		if strings.Contains(normalized, mcpx.ToolNameSeparator) {
			serverID, toolName, ok := mcpx.SplitNamespacedToolName(normalized)
			if !ok || strings.TrimSpace(serverID) == "" || strings.TrimSpace(toolName) == "" {
				return nil, fmt.Errorf("%w: invalid tool allowlist entry %q", ErrToolsUnsupported, entry)
			}
			if _, ok := availableServers[serverID]; !ok {
				return nil, fmt.Errorf("%w: unavailable MCP server %q in toolAllowlist", ErrToolsUnsupported, serverID)
			}
			result.toolNames[normalized] = struct{}{}
			result.serverIDs[serverID] = struct{}{}
			continue
		}
		if _, ok := availableServers[normalized]; ok {
			result.serverIDs[normalized] = struct{}{}
			continue
		}
		result.toolBasenames[normalized] = struct{}{}
	}
	for _, requiredToolName := range requiredInternalToolNames(request.CompletionGuardEnabled) {
		result.toolNames[requiredToolName] = struct{}{}
		serverID, _, ok := mcpx.SplitNamespacedToolName(requiredToolName)
		if ok {
			if _, present := availableServers[serverID]; present {
				result.serverIDs[serverID] = struct{}{}
			}
		}
	}
	return result, nil
}

func resolveAllowedServerIDs(serverIDs []string, allowlist *toolAllowlist) []string {
	if allowlist == nil || len(allowlist.serverIDs) == 0 {
		return cloneStringSlice(serverIDs)
	}
	filtered := make([]string, 0, len(serverIDs))
	for _, serverID := range serverIDs {
		trimmed := strings.TrimSpace(serverID)
		if trimmed == "" {
			continue
		}
		if _, ok := allowlist.serverIDs[trimmed]; !ok {
			continue
		}
		filtered = append(filtered, trimmed)
	}
	return filtered
}

func requiredInternalToolNames(completionGuardEnabled bool) []string {
	if !completionGuardEnabled {
		return nil
	}
	return []string{mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "report_completion_status")}
}

func isSupportedCompletionStatusToolName(toolName string, completionGuardEnabled bool) bool {
	if !completionGuardEnabled {
		return true
	}
	serverID, baseName, ok := mcpx.SplitNamespacedToolName(mcpx.NormalizeToolName(toolName))
	if !ok {
		return true
	}
	if baseName != "report_completion_status" {
		return true
	}
	return serverID == mcpx.DefaultServerID
}

func isToolAllowed(toolName string, allowlist *toolAllowlist, completionGuardEnabled bool) bool {
	normalizedToolName := mcpx.NormalizeToolName(toolName)
	serverID, baseName, ok := mcpx.SplitNamespacedToolName(normalizedToolName)
	if completionGuardEnabled && ok && baseName == "report_completion_status" && serverID != mcpx.DefaultServerID {
		return false
	}
	if allowlist == nil {
		return true
	}
	if _, ok := allowlist.toolNames[normalizedToolName]; ok {
		return true
	}
	if ok {
		if _, ok := allowlist.toolBasenames[baseName]; ok {
			return true
		}
		if _, ok := allowlist.serverIDs[serverID]; ok {
			return true
		}
	}
	return false
}

func buildToolRequestMeta(request agentruns.ExecutionRequest, toolName string) map[string]any {
	if !strings.HasPrefix(mcpx.NormalizeToolName(toolName), mcpx.DefaultServerID+mcpx.ToolNameSeparator) {
		return nil
	}
	meta := map[string]any{
		"projectConfigId": request.ProjectConfigID,
	}
	if trimmed := strings.TrimSpace(request.ChatID); trimmed != "" {
		meta["chatId"] = trimmed
	}
	if request.SectionID != nil && strings.TrimSpace(*request.SectionID) != "" {
		meta["sectionId"] = strings.TrimSpace(*request.SectionID)
	}
	if affinity, ok := request.Inputs["frontendAffinityToken"].(string); ok {
		if trimmed := strings.TrimSpace(affinity); trimmed != "" {
			meta["frontendAffinityToken"] = trimmed
		}
	}
	if allowUnscoped, ok := request.Inputs["allowUnscoped"].(bool); ok && allowUnscoped {
		meta["allowUnscoped"] = true
	}
	return meta
}

func buildMissingToolResult(toolName string) mcpx.ToolCallResult {
	message := fmt.Sprintf(
		"MCP tool '%s' is not registered. Call '%s' to find the correct tool name.",
		toolName,
		mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "search_mcp_tools"),
	)
	return mcpx.ToolCallResult{
		IsError: true,
		StructuredContent: map[string]any{
			"error":     message,
			"tool_name": toolName,
		},
		Text: message,
	}
}

func buildDisallowedToolResult(toolName string) mcpx.ToolCallResult {
	message := fmt.Sprintf("MCP tool '%s' is not allowed for this chat.", toolName)
	return mcpx.ToolCallResult{
		IsError: true,
		StructuredContent: map[string]any{
			"error":     message,
			"tool_name": toolName,
		},
		Text: message,
	}
}

func buildToolResultMessage(toolCallID string, toolName string, arguments map[string]any, result mcpx.ToolCallResult) map[string]any {
	message := map[string]any{
		"id":           "tool-result-" + strings.TrimSpace(toolCallID),
		"role":         "tool",
		"tool_call_id": strings.TrimSpace(toolCallID),
		"tool_name":    strings.TrimSpace(toolName),
		"arguments":    cloneAnyMap(arguments),
		"is_error":     result.IsError,
		"content":      []any{},
	}
	resultPayload := map[string]any{
		"isError": result.IsError,
	}
	if result.StructuredContent != nil {
		resultPayload["structuredContent"] = cloneJSONValue(result.StructuredContent)
	}
	if strings.TrimSpace(result.Text) != "" {
		resultPayload["text"] = result.Text
		message["content"] = []any{
			map[string]any{
				"type": "text",
				"text": result.Text,
			},
		}
	} else if result.StructuredContent != nil {
		if encoded, err := json.Marshal(result.StructuredContent); err == nil {
			resultPayload["text"] = string(encoded)
			message["content"] = []any{
				map[string]any{
					"type": "text",
					"text": string(encoded),
				},
			}
		}
	}
	message["result"] = resultPayload
	return message
}

func assistantToolCalls(message map[string]any) []map[string]any {
	rawToolCalls, _ := message["tool_calls"].([]any)
	output := make([]map[string]any, 0, len(rawToolCalls))
	for _, rawToolCall := range rawToolCalls {
		toolCall, ok := rawToolCall.(map[string]any)
		if !ok {
			continue
		}
		output = append(output, cloneAnyMap(toolCall))
	}
	return output
}

func cloneToolCallMaps(toolCalls []map[string]any) []map[string]any {
	if toolCalls == nil {
		return nil
	}
	cloned := make([]map[string]any, 0, len(toolCalls))
	for _, toolCall := range toolCalls {
		cloned = append(cloned, cloneAnyMap(toolCall))
	}
	return cloned
}

func cloneStringSlice(values []string) []string {
	if values == nil {
		return nil
	}
	cloned := make([]string, 0, len(values))
	for _, value := range values {
		cloned = append(cloned, value)
	}
	return cloned
}
