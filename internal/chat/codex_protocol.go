package chat

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"setta/internal/codexapp"
)

func threadIDFromCodexThread(thread codexapp.Thread, label string) (string, error) {
	if thread.ID == "" {
		return "", fmt.Errorf("%s.thread.id is required", label)
	}
	return thread.ID, nil
}

func turnIDFromStartResponse(raw json.RawMessage) (string, error) {
	response, err := codexapp.DecodeTurnStartResponse(raw)
	if err != nil {
		return "", err
	}
	if response.Turn.ID == "" {
		return "", fmt.Errorf("codex turn start response.turn.id is required")
	}
	return response.Turn.ID, nil
}

func objectValue(raw json.RawMessage, label string) (map[string]any, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("%s is required", label)
	}
	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("%s must be an object: %w", label, err)
	}
	if value == nil {
		return nil, fmt.Errorf("%s must be an object", label)
	}
	return value, nil
}

func requireObject(value map[string]any, name string, label string) (map[string]any, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return nil, fmt.Errorf("%s.%s is required", label, name)
	}
	object, ok := raw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be an object", label, name)
	}
	return object, nil
}

func requireString(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", fmt.Errorf("%s.%s is required", label, name)
	}
	text, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("%s.%s must be a string", label, name)
	}
	if text == "" {
		return "", fmt.Errorf("%s.%s is required", label, name)
	}
	return text, nil
}

func requireBool(value map[string]any, name string, label string) (bool, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return false, fmt.Errorf("%s.%s is required", label, name)
	}
	flag, ok := raw.(bool)
	if !ok {
		return false, fmt.Errorf("%s.%s must be a boolean", label, name)
	}
	return flag, nil
}

func optionalString(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", nil
	}
	text, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("%s.%s must be a string", label, name)
	}
	return text, nil
}

func optionalBool(value map[string]any, name string, label string) (bool, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return false, nil
	}
	flag, ok := raw.(bool)
	if !ok {
		return false, fmt.Errorf("%s.%s must be a boolean", label, name)
	}
	return flag, nil
}

func optionalInt(value map[string]any, name string, label string) (int, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return 0, nil
	}
	number, ok := raw.(float64)
	if !ok {
		return 0, fmt.Errorf("%s.%s must be a number", label, name)
	}
	if number != float64(int(number)) {
		return 0, fmt.Errorf("%s.%s must be an integer", label, name)
	}
	return int(number), nil
}

func optionalStringArray(value map[string]any, name string, label string) ([]string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return []string{}, nil
	}
	values, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be an array", label, name)
	}
	result := make([]string, 0, len(values))
	for index, rawValue := range values {
		text, ok := rawValue.(string)
		if !ok {
			return nil, fmt.Errorf("%s.%s[%d] must be a string", label, name, index)
		}
		if text != "" {
			result = append(result, text)
		}
	}
	return result, nil
}

const mcpToolResultSummaryRuneLimit = 500

type codexThreadItemRunItemHandler func(codexapp.ThreadItem, RunItemStatus) (RunItem, error)

var codexThreadItemRunItemHandlers = map[codexapp.ThreadItemType]codexThreadItemRunItemHandler{
	codexapp.ThreadItemTypeAgentMessage:        agentMessageThreadItemRunItem,
	codexapp.ThreadItemTypePlan:                planThreadItemRunItem,
	codexapp.ThreadItemTypeReasoning:           reasoningThreadItemRunItem,
	codexapp.ThreadItemTypeCommandExecution:    commandExecutionThreadItemRunItem,
	codexapp.ThreadItemTypeFileChange:          fileChangeThreadItemRunItem,
	codexapp.ThreadItemTypeMcpToolCall:         mcpToolCallThreadItemRunItem,
	codexapp.ThreadItemTypeDynamicToolCall:     dynamicToolCallThreadItemRunItem,
	codexapp.ThreadItemTypeCollabAgentToolCall: collabAgentToolCallThreadItemRunItem,
	codexapp.ThreadItemTypeWebSearch:           webSearchThreadItemRunItem,
	codexapp.ThreadItemTypeImageView:           imageViewThreadItemRunItem,
	codexapp.ThreadItemTypeImageGeneration:     imageGenerationThreadItemRunItem,
	codexapp.ThreadItemTypeContextCompaction:   contextCompactionThreadItemRunItem,
}

func runItemFromCodexItem(item codexapp.ThreadItem, status RunItemStatus) (RunItem, error) {
	handler, ok := codexThreadItemRunItemHandlers[item.Type]
	if !ok {
		return RunItem{}, fmt.Errorf("unsupported codex ThreadItem type for run item projection: %s", item.Type)
	}
	return handler(item, status)
}

func agentMessageThreadItemRunItem(item codexapp.ThreadItem, status RunItemStatus) (RunItem, error) {
	if item.AgentMessage == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return agentMessageRunItem(*item.AgentMessage, status)
}

func planThreadItemRunItem(item codexapp.ThreadItem, status RunItemStatus) (RunItem, error) {
	if item.Plan == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return planRunItem(*item.Plan, status)
}

func reasoningThreadItemRunItem(item codexapp.ThreadItem, status RunItemStatus) (RunItem, error) {
	if item.Reasoning == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return reasoningRunItem(*item.Reasoning, status)
}

func commandExecutionThreadItemRunItem(item codexapp.ThreadItem, status RunItemStatus) (RunItem, error) {
	if item.CommandExecution == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return commandExecutionRunItem(*item.CommandExecution, item.Raw, status)
}

func fileChangeThreadItemRunItem(item codexapp.ThreadItem, status RunItemStatus) (RunItem, error) {
	if item.FileChange == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return fileChangeRunItem(*item.FileChange, status)
}

func mcpToolCallThreadItemRunItem(item codexapp.ThreadItem, _ RunItemStatus) (RunItem, error) {
	if item.McpToolCall == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return mcpToolCallRunItem(*item.McpToolCall)
}

func dynamicToolCallThreadItemRunItem(item codexapp.ThreadItem, _ RunItemStatus) (RunItem, error) {
	if item.DynamicToolCall == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return dynamicToolCallRunItem(*item.DynamicToolCall)
}

func collabAgentToolCallThreadItemRunItem(item codexapp.ThreadItem, _ RunItemStatus) (RunItem, error) {
	if item.CollabAgentToolCall == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return collabAgentToolCallRunItem(*item.CollabAgentToolCall)
}

func webSearchThreadItemRunItem(item codexapp.ThreadItem, status RunItemStatus) (RunItem, error) {
	if item.WebSearch == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return webSearchRunItem(*item.WebSearch, status)
}

func imageViewThreadItemRunItem(item codexapp.ThreadItem, status RunItemStatus) (RunItem, error) {
	if item.ImageView == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return imageViewRunItem(*item.ImageView, status)
}

func imageGenerationThreadItemRunItem(item codexapp.ThreadItem, _ RunItemStatus) (RunItem, error) {
	if item.ImageGeneration == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return imageGenerationRunItem(*item.ImageGeneration)
}

func contextCompactionThreadItemRunItem(item codexapp.ThreadItem, status RunItemStatus) (RunItem, error) {
	if item.ContextCompaction == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return contextCompactionRunItem(*item.ContextCompaction, status)
}

func missingCodexThreadItemVariant(itemType codexapp.ThreadItemType) error {
	return fmt.Errorf("codex ThreadItem %s missing generated variant payload", itemType)
}

func agentMessageRunItem(item codexapp.AgentMessageThreadItem, status RunItemStatus) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex agentMessage item.id")
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeAgentMessage,
		Status:         status,
		Title:          "Assistant message",
		Summary:        item.Text,
	}, nil
}

func planRunItem(item codexapp.PlanThreadItem, status RunItemStatus) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex plan item.id")
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypePlan,
		Status:         status,
		Title:          "Plan update",
		Summary:        item.Text,
	}, nil
}

func reasoningRunItem(item codexapp.ReasoningThreadItem, status RunItemStatus) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex reasoning item.id")
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeReasoning,
		Status:         status,
		Title:          "Reasoning summary",
		Summary:        strings.Join(nonEmptyStrings(item.Summary), "\n"),
	}, nil
}

func commandExecutionRunItem(item codexapp.CommandExecutionThreadItem, raw json.RawMessage, defaultStatus RunItemStatus) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex commandExecution item.id")
	if err != nil {
		return RunItem{}, err
	}
	command, err := requireCodexStringValue(item.Command, "codex commandExecution item.command")
	if err != nil {
		return RunItem{}, err
	}
	cwd, err := requireCodexStringValue(item.CWD, "codex commandExecution item.cwd")
	if err != nil {
		return RunItem{}, err
	}
	status, err := mapCodexItemStatusWithDefault(string(item.Status), defaultStatus)
	if err != nil {
		return RunItem{}, err
	}
	if rawFieldIsNull(raw, "source") {
		return RunItem{}, fmt.Errorf("codex commandExecution item.source must be a non-empty CommandExecutionSource")
	}
	source, err := codexRunItemCommandSource(item.Source)
	if err != nil {
		return RunItem{}, err
	}
	processID := stringPtrValue(item.ProcessId)
	if source != nil && *source == RunItemCommandSourceUnifiedExecStartup && processID == "" {
		return RunItem{}, fmt.Errorf("codex unifiedExecStartup item processId is required")
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeCommandExecution,
		Status:         status,
		Command:        command,
		Cwd:            cwd,
		ExitCode:       intPtrValue(item.ExitCode),
		DurationMs:     intPtrValue(item.DurationMs),
		ProcessID:      processID,
		Source:         source,
	}, nil
}

func fileChangeRunItem(item codexapp.FileChangeThreadItem, defaultStatus RunItemStatus) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex fileChange item.id")
	if err != nil {
		return RunItem{}, err
	}
	status, err := mapCodexItemStatusWithDefault(string(item.Status), defaultStatus)
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeFileChange,
		Status:         status,
		PatchStatus:    string(item.Status),
	}, nil
}

func mcpToolCallRunItem(item codexapp.McpToolCallThreadItem) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex mcpToolCall item.id")
	if err != nil {
		return RunItem{}, err
	}
	serverName, err := requireCodexStringValue(item.Server, "codex mcpToolCall item.server")
	if err != nil {
		return RunItem{}, err
	}
	toolName, err := requireCodexStringValue(item.Tool, "codex mcpToolCall item.tool")
	if err != nil {
		return RunItem{}, err
	}
	status, err := mapCodexItemStatusWithDefault(string(item.Status), RunItemStatusRunning)
	if err != nil {
		return RunItem{}, err
	}
	details, err := mcpToolCallDetails(item, serverName, toolName)
	if err != nil {
		return RunItem{}, err
	}
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		return RunItem{}, fmt.Errorf("marshal mcpToolCall details: %w", err)
	}
	result, err := mcpToolResultSummary(item.Result)
	if err != nil {
		return RunItem{}, err
	}
	errorMessage := ""
	if item.Error != nil {
		errorMessage = item.Error.Message
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeMCPToolCall,
		Status:         status,
		ServerName:     serverName,
		ToolName:       toolName,
		DurationMs:     intPtrValue(item.DurationMs),
		Result:         result,
		Error:          errorMessage,
		Details:        detailsJSON,
	}, nil
}

func dynamicToolCallRunItem(item codexapp.DynamicToolCallThreadItem) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex dynamicToolCall item.id")
	if err != nil {
		return RunItem{}, err
	}
	toolName, err := requireCodexStringValue(item.Tool, "codex dynamicToolCall item.tool")
	if err != nil {
		return RunItem{}, err
	}
	status, err := mapCodexItemStatusWithDefault(string(item.Status), RunItemStatusRunning)
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeDynamicToolCall,
		Status:         status,
		ToolName:       toolName,
		Namespace:      stringPtrValue(item.Namespace),
		DurationMs:     intPtrValue(item.DurationMs),
	}, nil
}

func collabAgentToolCallRunItem(item codexapp.CollabAgentToolCallThreadItem) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex collabAgentToolCall item.id")
	if err != nil {
		return RunItem{}, err
	}
	toolName, err := requireCodexStringValue(string(item.Tool), "codex collabAgentToolCall item.tool")
	if err != nil {
		return RunItem{}, err
	}
	status, err := mapCodexItemStatusWithDefault(string(item.Status), RunItemStatusRunning)
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeCollabAgentToolCall,
		Status:         status,
		ToolName:       toolName,
	}, nil
}

func webSearchRunItem(item codexapp.WebSearchThreadItem, status RunItemStatus) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex webSearch item.id")
	if err != nil {
		return RunItem{}, err
	}
	query, err := requireCodexStringValue(item.Query, "codex webSearch item.query")
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeWebSearch,
		Status:         status,
		Summary:        query,
	}, nil
}

func imageViewRunItem(item codexapp.ImageViewThreadItem, status RunItemStatus) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex imageView item.id")
	if err != nil {
		return RunItem{}, err
	}
	path, err := requireCodexStringValue(string(item.Path), "codex imageView item.path")
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeImageView,
		Status:         status,
		FilePaths:      []string{path},
	}, nil
}

func imageGenerationRunItem(item codexapp.ImageGenerationThreadItem) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex imageGeneration item.id")
	if err != nil {
		return RunItem{}, err
	}
	status, err := mapCodexItemStatusWithDefault(item.Status, RunItemStatusRunning)
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeImageGeneration,
		Status:         status,
		Result:         item.Result,
	}, nil
}

func contextCompactionRunItem(item codexapp.ContextCompactionThreadItem, status RunItemStatus) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex contextCompaction item.id")
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeContextCompaction,
		Status:         status,
		Title:          "Context compaction",
	}, nil
}

// codexRunItemCommandSource maps the Codex app-server CommandExecutionSource
// discriminator. An absent source is nil. A present source must be a valid enum
// value; empty or unknown values are provider protocol drift.
func codexRunItemCommandSource(source *codexapp.CommandExecutionSource) (*RunItemCommandSource, error) {
	if source == nil {
		return nil, nil
	}
	if *source == "" {
		return nil, fmt.Errorf("codex commandExecution item.source must be a non-empty CommandExecutionSource")
	}
	mapped, err := mapCodexCommandSource(string(*source))
	if err != nil {
		return nil, err
	}
	return &mapped, nil
}

var codexCommandSourceByCodexSource = map[string]RunItemCommandSource{
	"agent":                  RunItemCommandSourceAgent,
	"userShell":              RunItemCommandSourceUserShell,
	"unifiedExecStartup":     RunItemCommandSourceUnifiedExecStartup,
	"unifiedExecInteraction": RunItemCommandSourceUnifiedExecInteraction,
}

func mapCodexCommandSource(source string) (RunItemCommandSource, error) {
	mapped, ok := codexCommandSourceByCodexSource[source]
	if !ok {
		return "", fmt.Errorf("unsupported codex command execution source: %s", source)
	}
	return mapped, nil
}

// Codex app-server 0.135.0 item status values observed from the app-server
// protocol source and exercised by the local protocol fixtures.
var codexRunItemStatusByCodexStatus = map[string]RunItemStatus{
	"completed":   RunItemStatusCompleted,
	"declined":    RunItemStatusCancelled,
	"failed":      RunItemStatusFailed,
	"inProgress":  RunItemStatusRunning,
	"interrupted": RunItemStatusCancelled,
	"succeeded":   RunItemStatusCompleted,
}

func mapCodexItemStatusWithDefault(status string, defaultStatus RunItemStatus) (RunItemStatus, error) {
	if status == "" {
		return defaultStatus, nil
	}
	return mapCodexItemStatus(status)
}

func requireCodexStringValue(value string, label string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("%s is required", label)
	}
	return value, nil
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func intPtrValue(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func nonEmptyStrings(values []string) []string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		if value != "" {
			parts = append(parts, value)
		}
	}
	return parts
}

func mcpToolCallDetails(item codexapp.McpToolCallThreadItem, serverName string, toolName string) (RunItemMCPToolCallDetails, error) {
	appContext, err := rawJSONFromOptionalValue(item.AppContext, "codex mcpToolCall item.appContext")
	if err != nil {
		return RunItemMCPToolCallDetails{}, err
	}
	result, err := mcpToolResultDetails(item.Result)
	if err != nil {
		return RunItemMCPToolCallDetails{}, err
	}
	errorMessage := ""
	if item.Error != nil {
		errorMessage = item.Error.Message
	}
	return RunItemMCPToolCallDetails{
		ServerName:        serverName,
		ToolName:          toolName,
		Arguments:         cloneRawMessage(item.Arguments),
		AppContext:        appContext,
		PluginID:          stringPtrValue(item.PluginId),
		MCPAppResourceURI: stringPtrValue(item.McpAppResourceUri),
		Result:            result,
		Error:             errorMessage,
	}, nil
}

func rawJSONFromOptionalValue(value any, label string) (json.RawMessage, error) {
	if value == nil {
		return nil, nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("marshal %s: %w", label, err)
	}
	return data, nil
}

func mcpToolResultDetails(result *codexapp.McpToolCallResult) (*RunItemMCPToolResult, error) {
	if result == nil {
		return nil, nil
	}
	return &RunItemMCPToolResult{
		Content:           cloneRawMessages(result.Content),
		StructuredContent: cloneRawMessage(result.StructuredContent),
		Meta:              cloneRawMessage(result.Meta),
	}, nil
}

func cloneRawMessages(values []json.RawMessage) []json.RawMessage {
	if values == nil {
		return nil
	}
	cloned := make([]json.RawMessage, 0, len(values))
	for _, value := range values {
		cloned = append(cloned, cloneRawMessage(value))
	}
	return cloned
}

type mcpResultContentBlock struct {
	Type string  `json:"type"`
	Text *string `json:"text"`
}

func mcpToolResultSummary(result *codexapp.McpToolCallResult) (string, error) {
	if result == nil {
		return "", nil
	}
	texts := []string{}
	nonTextCounts := map[string]int{}
	for index, raw := range result.Content {
		block, err := mcpResultContentBlockFromRaw(raw, index)
		if err != nil {
			return "", err
		}
		if block.Type == "text" {
			texts = append(texts, *block.Text)
			continue
		}
		nonTextCounts[block.Type]++
	}
	parts := []string{}
	if text := boundedTextSummary(texts, mcpToolResultSummaryRuneLimit); text != "" {
		parts = append(parts, text)
	}
	parts = append(parts, nonTextContentSummaries(nonTextCounts)...)
	if rawJSONPresent(result.StructuredContent) {
		parts = append(parts, "structured content present")
	}
	return strings.Join(parts, "\n"), nil
}

func mcpResultContentBlockFromRaw(raw json.RawMessage, index int) (mcpResultContentBlock, error) {
	var block mcpResultContentBlock
	if err := json.Unmarshal(raw, &block); err != nil {
		return mcpResultContentBlock{}, fmt.Errorf("codex mcpToolCall.result.content[%d] must be an object: %w", index, err)
	}
	if block.Type == "" {
		return mcpResultContentBlock{}, fmt.Errorf("codex mcpToolCall.result.content[%d].type is required", index)
	}
	if block.Type == "text" && block.Text == nil {
		return mcpResultContentBlock{}, fmt.Errorf("codex mcpToolCall.result.content[%d].text is required", index)
	}
	return block, nil
}

func boundedTextSummary(texts []string, limit int) string {
	var builder strings.Builder
	written := 0
	for _, text := range texts {
		if text == "" {
			continue
		}
		if builder.Len() > 0 {
			if !writeBoundedRune(&builder, '\n', limit, &written) {
				return builder.String()
			}
		}
		for _, char := range text {
			if !writeBoundedRune(&builder, char, limit, &written) {
				return builder.String()
			}
		}
	}
	return builder.String()
}

func writeBoundedRune(builder *strings.Builder, char rune, limit int, written *int) bool {
	if *written >= limit {
		if !strings.HasSuffix(builder.String(), "...") {
			builder.WriteString("...")
		}
		return false
	}
	builder.WriteRune(char)
	*written = *written + 1
	return true
}

func nonTextContentSummaries(counts map[string]int) []string {
	if len(counts) == 0 {
		return nil
	}
	kinds := make([]string, 0, len(counts))
	for kind := range counts {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)
	summaries := make([]string, 0, len(kinds))
	for _, kind := range kinds {
		count := counts[kind]
		label := kind + " content block"
		if count != 1 {
			label += "s"
		}
		summaries = append(summaries, fmt.Sprintf("%d %s", count, label))
	}
	return summaries
}

func rawJSONPresent(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) > 0 && !bytes.Equal(trimmed, []byte("null"))
}

func rawFieldIsNull(raw json.RawMessage, field string) bool {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return false
	}
	value, ok := fields[field]
	return ok && bytes.Equal(bytes.TrimSpace(value), []byte("null"))
}

func requireStringAllowEmpty(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", fmt.Errorf("%s.%s is required", label, name)
	}
	text, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("%s.%s must be a string", label, name)
	}
	return text, nil
}

func mapCodexItemStatus(status string) (RunItemStatus, error) {
	itemStatus, ok := codexRunItemStatusByCodexStatus[status]
	if !ok {
		return "", fmt.Errorf("unsupported codex item status: %s", status)
	}
	return itemStatus, nil
}

func jsonSummary(value map[string]any) (string, error) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", fmt.Errorf("summarize codex JSON object: %w", err)
	}
	return string(data), nil
}

func jsonSummaryAny(value any) (string, error) {
	if value == nil {
		return "", nil
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", fmt.Errorf("summarize codex JSON value: %w", err)
	}
	return string(data), nil
}

func questionOptions(question map[string]any, label string) ([]string, error) {
	raw, ok := question["options"]
	if !ok || raw == nil {
		return []string{}, nil
	}
	rawOptions, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%s.options must be an array", label)
	}
	options := make([]string, 0, len(rawOptions))
	for index, rawOption := range rawOptions {
		option, ok := rawOption.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%s.options[%d] must be an object", label, index)
		}
		optionLabel, err := requireString(option, "label", fmt.Sprintf("%s.options[%d]", label, index))
		if err != nil {
			return nil, err
		}
		options = append(options, optionLabel)
	}
	return options, nil
}

func userInputQuestions(params map[string]any) ([]ApprovalQuestion, string, string, []string, error) {
	rawQuestions, err := requireQuestionArray(params)
	if err != nil {
		return nil, "", "", nil, err
	}
	questions := make([]ApprovalQuestion, 0, len(rawQuestions))
	for index, raw := range rawQuestions {
		question, err := approvalQuestionFromCodex(raw, index)
		if err != nil {
			return nil, "", "", nil, err
		}
		questions = append(questions, question)
	}
	title, body, options := userInputSummary(questions)
	return questions, title, body, options, nil
}

func requireQuestionArray(params map[string]any) ([]any, error) {
	raw, ok := params["questions"]
	if !ok || raw == nil {
		return nil, errors.New("codex user input approval.questions is required")
	}
	rawQuestions, ok := raw.([]any)
	if !ok {
		return nil, errors.New("codex user input approval.questions must be an array")
	}
	if len(rawQuestions) == 0 {
		return nil, errors.New("codex user input approval.questions must not be empty")
	}
	return rawQuestions, nil
}

func approvalQuestionFromCodex(raw any, index int) (ApprovalQuestion, error) {
	question, ok := raw.(map[string]any)
	if !ok {
		return ApprovalQuestion{}, fmt.Errorf("codex user input approval.questions[%d] must be an object", index)
	}
	label := fmt.Sprintf("codex user input approval.questions[%d]", index)
	id, err := requireString(question, "id", label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	text, err := requireString(question, "question", label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	header, err := optionalString(question, "header", label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	options, err := questionOptions(question, label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	isOther, err := optionalBool(question, "isOther", label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	isSecret, err := optionalBool(question, "isSecret", label)
	if err != nil {
		return ApprovalQuestion{}, err
	}
	return ApprovalQuestion{
		ID:       id,
		Header:   header,
		Question: text,
		Options:  options,
		IsOther:  isOther,
		IsSecret: isSecret,
	}, nil
}

func userInputSummary(questions []ApprovalQuestion) (string, string, []string) {
	first := questions[0]
	title := "User input requested"
	if first.Header != "" {
		title = first.Header
	}
	return title, first.Question, first.Options
}

func turnErrorMessage(turn map[string]any) (string, error) {
	rawError, err := requireObject(turn, "error", "codex failed turn")
	if err != nil {
		return "", err
	}
	return requireString(rawError, "message", "codex failed turn error")
}

func requestIDString(id any) (string, error) {
	switch value := id.(type) {
	case string:
		if value == "" {
			return "", errors.New("codex request id is required")
		}
		return value, nil
	case float64:
		if value != float64(int(value)) {
			return "", fmt.Errorf("codex request id must be an integer: %v", value)
		}
		return strconv.Itoa(int(value)), nil
	default:
		return "", fmt.Errorf("codex request id must be a string or integer: %T", id)
	}
}
