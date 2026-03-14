package managedllm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	anthropicoption "github.com/anthropics/anthropic-sdk-go/option"
	"setta/internal/agentruns"
	"setta/internal/mcpx"
	"setta/internal/realtime"
)

const defaultAnthropicMaxTokens = 4096

func buildAnthropicClient(request agentruns.ExecutionRequest, httpClient *http.Client) (anthropic.Client, error) {
	apiKey, err := resolveAPIKey(request)
	if err != nil {
		return anthropic.Client{}, err
	}

	options := []anthropicoption.RequestOption{
		anthropicoption.WithHTTPClient(httpClient),
		anthropicoption.WithBaseURL(resolveAnthropicBaseURL(request)),
		anthropicoption.WithMaxRetries(0),
	}
	if apiKey != "" {
		options = append(options, anthropicoption.WithAPIKey(apiKey))
	}
	return newAnthropicClientWithoutEnv(options...), nil
}

func newAnthropicClientWithoutEnv(opts ...anthropicoption.RequestOption) anthropic.Client {
	return anthropic.Client{
		Options:     opts,
		Completions: anthropic.NewCompletionService(opts...),
		Messages:    anthropic.NewMessageService(opts...),
		Models:      anthropic.NewModelService(opts...),
		Beta:        anthropic.NewBetaService(opts...),
	}
}

func buildAnthropicRequestOverrides(request agentruns.ExecutionRequest) ([]anthropicoption.RequestOption, error) {
	overrides := []anthropicoption.RequestOption{}
	for key, value := range request.RequestParams {
		trimmedKey := strings.TrimSpace(key)
		switch trimmedKey {
		case "", "model", "messages", "stream", "api_key", "custom_llm_provider", "api_base", "tools", "tool_choice", "max_tokens", "thinking":
			continue
		default:
			overrides = append(overrides, anthropicoption.WithJSONSet(trimmedKey, cloneJSONValue(value)))
		}
	}
	return overrides, nil
}

func resolveAnthropicBaseURL(request agentruns.ExecutionRequest) string {
	baseURL := strings.TrimSpace(request.LLMConfig.BaseURL)
	if rawBaseURL, ok := request.RequestParams["api_base"]; ok {
		if explicit := strings.TrimSpace(stringValue(rawBaseURL)); explicit != "" {
			baseURL = explicit
		}
	}
	if baseURL == "" {
		baseURL = defaultAnthropicBase
	}
	return baseURL
}

func buildAnthropicMessageParams(
	request agentruns.ExecutionRequest,
	systemPrompt string,
	providerMessages []map[string]any,
	toolDefinitions []map[string]any,
) (anthropic.MessageNewParams, error) {
	messages, err := buildAnthropicChatMessages(providerMessages)
	if err != nil {
		return anthropic.MessageNewParams{}, err
	}

	maxTokens, err := resolveAnthropicMaxTokens(request)
	if err != nil {
		return anthropic.MessageNewParams{}, err
	}

	params := anthropic.MessageNewParams{
		MaxTokens: maxTokens,
		Messages:  messages,
		Model:     anthropic.Model(request.LLMConfig.Model),
	}
	thinkingConfig, enabled, err := resolveAnthropicThinkingConfig(request)
	if err != nil {
		return anthropic.MessageNewParams{}, err
	}
	if enabled {
		params.Thinking = thinkingConfig
	}
	if strings.TrimSpace(systemPrompt) != "" {
		params.System = []anthropic.TextBlockParam{{Text: systemPrompt}}
	}
	if len(toolDefinitions) > 0 {
		tools, err := buildAnthropicTools(toolDefinitions)
		if err != nil {
			return anthropic.MessageNewParams{}, err
		}
		params.Tools = tools
	}
	return params, nil
}

func resolveAnthropicThinkingConfig(request agentruns.ExecutionRequest) (anthropic.ThinkingConfigParamUnion, bool, error) {
	if !request.Thinking {
		return anthropic.ThinkingConfigParamUnion{}, false, nil
	}
	raw, ok := request.RequestParams["thinking"]
	if !ok {
		return anthropic.ThinkingConfigParamUnion{}, false, unsupportedThinkingError(request)
	}
	maxTokens, err := resolveAnthropicMaxTokens(request)
	if err != nil {
		return anthropic.ThinkingConfigParamUnion{}, false, err
	}
	return parseAnthropicThinkingConfig(raw, maxTokens)
}

func parseAnthropicThinkingConfig(raw any, maxTokens int64) (anthropic.ThinkingConfigParamUnion, bool, error) {
	payload, ok := raw.(map[string]any)
	if !ok || payload == nil {
		return anthropic.ThinkingConfigParamUnion{}, false, fmt.Errorf("%w: anthropic thinking config must be an object", ErrReasoningUnsupported)
	}
	switch strings.ToLower(strings.TrimSpace(stringValue(payload["type"]))) {
	case "enabled":
		budgetTokens, err := parsePositiveInt64(payload["budget_tokens"], "thinking.budget_tokens")
		if err != nil {
			return anthropic.ThinkingConfigParamUnion{}, false, fmt.Errorf("%w: invalid anthropic thinking budget: %v", ErrReasoningUnsupported, err)
		}
		if budgetTokens < 1024 || budgetTokens >= maxTokens {
			return anthropic.ThinkingConfigParamUnion{}, false, fmt.Errorf(
				"%w: anthropic thinking budget_tokens must be at least 1024 and less than max_tokens",
				ErrReasoningUnsupported,
			)
		}
		return anthropic.ThinkingConfigParamOfEnabled(budgetTokens), true, nil
	case "adaptive":
		adaptive := anthropic.NewThinkingConfigAdaptiveParam()
		return anthropic.ThinkingConfigParamUnion{OfAdaptive: &adaptive}, true, nil
	default:
		return anthropic.ThinkingConfigParamUnion{}, false, fmt.Errorf("%w: anthropic thinking config type must be \"enabled\" or \"adaptive\"", ErrReasoningUnsupported)
	}
}

func resolveAnthropicMaxTokens(request agentruns.ExecutionRequest) (int64, error) {
	raw, ok := request.RequestParams["max_tokens"]
	if !ok {
		// The active Python/litellm path implicitly falls back to 4096 when
		// Anthropic max_tokens is omitted, so keep the same bounded default here.
		return defaultAnthropicMaxTokens, nil
	}
	return parsePositiveInt64(raw, "max_tokens")
}

func parsePositiveInt64(raw any, field string) (int64, error) {
	switch value := raw.(type) {
	case int:
		if value <= 0 {
			break
		}
		return int64(value), nil
	case int32:
		if value <= 0 {
			break
		}
		return int64(value), nil
	case int64:
		if value <= 0 {
			break
		}
		return value, nil
	case float64:
		if value <= 0 || value != float64(int64(value)) {
			break
		}
		return int64(value), nil
	case string:
		parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
		if err != nil || parsed <= 0 {
			break
		}
		return parsed, nil
	}
	return 0, fmt.Errorf("%w: invalid %s %v", agentruns.ErrInvalidRunInput, field, raw)
}

func buildAnthropicTools(toolDefinitions []map[string]any) ([]anthropic.ToolUnionParam, error) {
	tools := make([]anthropic.ToolUnionParam, 0, len(toolDefinitions))
	for index, definition := range toolDefinitions {
		function, _ := definition["function"].(map[string]any)
		name := strings.TrimSpace(stringValue(function["name"]))
		if name == "" {
			return nil, fmt.Errorf("%w: tool definition %d missing function name", ErrToolsUnsupported, index)
		}
		inputSchema, err := normalizeAnthropicToolInputSchema(function["parameters"])
		if err != nil {
			return nil, fmt.Errorf("%w: tool definition %d parameters: %v", ErrToolsUnsupported, index, err)
		}
		tool := anthropic.ToolParam{
			Name:        name,
			InputSchema: inputSchema,
		}
		if description := strings.TrimSpace(stringValue(function["description"])); description != "" {
			tool.Description = anthropic.String(description)
		}
		if deferLoading, ok := definition["defer_loading"].(bool); ok {
			tool.DeferLoading = anthropic.Bool(deferLoading)
		}
		tools = append(tools, anthropic.ToolUnionParam{OfTool: &tool})
	}
	return tools, nil
}

func normalizeAnthropicToolInputSchema(raw any) (anthropic.ToolInputSchemaParam, error) {
	cloned, ok := cloneJSONValue(raw).(map[string]any)
	if !ok || cloned == nil {
		return anthropic.ToolInputSchemaParam{}, fmt.Errorf("expected JSON object, got %T", raw)
	}
	schema := anthropic.ToolInputSchemaParam{}
	if properties, ok := cloned["properties"]; ok {
		schema.Properties = properties
		delete(cloned, "properties")
	}
	if required, ok := cloned["required"]; ok {
		requiredList, err := normalizeJSONStringList(required)
		if err != nil {
			return anthropic.ToolInputSchemaParam{}, err
		}
		schema.Required = requiredList
		delete(cloned, "required")
	}
	if rawType, ok := cloned["type"]; ok {
		typeValue := strings.TrimSpace(stringValue(rawType))
		if typeValue != "" && typeValue != "object" {
			return anthropic.ToolInputSchemaParam{}, fmt.Errorf("expected object type, got %q", typeValue)
		}
		delete(cloned, "type")
	}
	if len(cloned) > 0 {
		schema.ExtraFields = cloned
	}
	return schema, nil
}

func normalizeJSONStringList(raw any) ([]string, error) {
	list, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("expected array, got %T", raw)
	}
	output := make([]string, 0, len(list))
	for _, entry := range list {
		value := strings.TrimSpace(stringValue(entry))
		if value == "" {
			return nil, errors.New("array entries must be non-empty strings")
		}
		output = append(output, value)
	}
	return output, nil
}

func buildAnthropicProviderMessage(message map[string]any) (map[string]any, bool, error) {
	role := strings.TrimSpace(stringValue(message["role"]))
	switch role {
	case "system":
		return nil, false, fmt.Errorf("%w: system transcript messages are not supported for anthropic managed chats", ErrHistoryUnsupported)
	case "user":
		blocks, include, err := normalizeAnthropicMessageContent(message["content"], role)
		if err != nil {
			return nil, false, err
		}
		if !include {
			return nil, false, nil
		}
		return map[string]any{
			"role":    "user",
			"content": blocks,
		}, true, nil
	case "assistant":
		blocks, includeText, err := normalizeAnthropicMessageContent(message["content"], role)
		if err != nil {
			return nil, false, err
		}
		toolUseBlocks, hasToolUses, err := normalizeAnthropicToolUseBlocks(message["tool_calls"])
		if err != nil {
			return nil, false, err
		}
		blocks = append(blocks, toolUseBlocks...)
		if !includeText && !hasToolUses {
			return nil, false, nil
		}
		return map[string]any{
			"role":    "assistant",
			"content": blocks,
		}, true, nil
	case "tool":
		toolCallID := strings.TrimSpace(stringValue(message["tool_call_id"]))
		if toolCallID == "" {
			return nil, false, fmt.Errorf("%w: tool messages require tool_call_id", ErrToolsUnsupported)
		}
		content, err := normalizeAnthropicToolResultContent(message)
		if err != nil {
			return nil, false, err
		}
		block := map[string]any{
			"type":        "tool_result",
			"tool_use_id": toolCallID,
			"content":     content,
		}
		if isErrorValue(message["is_error"]) {
			block["is_error"] = true
		}
		return map[string]any{
			"role":    "user",
			"content": []any{block},
		}, true, nil
	default:
		return nil, false, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
	}
}

func normalizeAnthropicMessageContent(raw any, role string) ([]any, bool, error) {
	if raw == nil {
		return nil, false, nil
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, false, fmt.Errorf("%w: message content must be a list", ErrHistoryUnsupported)
	}
	blocks := make([]any, 0, len(list))
	for index, entry := range list {
		block, ok := entry.(map[string]any)
		if !ok {
			return nil, false, fmt.Errorf("%w: content block %d must be an object", ErrHistoryUnsupported, index)
		}
		switch strings.TrimSpace(stringValue(block["type"])) {
		case "", "text":
			text := stringValue(block["text"])
			if strings.TrimSpace(text) == "" {
				continue
			}
			blocks = append(blocks, map[string]any{
				"type": "text",
				"text": text,
			})
		case "thinking":
			if role != "assistant" {
				continue
			}
			signature := strings.TrimSpace(stringValue(block["signature"]))
			thinking := stringValue(block["thinking"])
			if signature == "" || strings.TrimSpace(thinking) == "" {
				continue
			}
			blocks = append(blocks, map[string]any{
				"type":      "thinking",
				"signature": signature,
				"thinking":  thinking,
			})
		default:
			return nil, false, fmt.Errorf("%w: content block type %q", ErrHistoryUnsupported, stringValue(block["type"]))
		}
	}
	return blocks, len(blocks) > 0, nil
}

func normalizeAnthropicToolUseBlocks(raw any) ([]any, bool, error) {
	if !hasNonEmptyToolCalls(raw) {
		return nil, false, nil
	}
	list, _ := raw.([]any)
	blocks := make([]any, 0, len(list))
	for index, entry := range list {
		toolCall, ok := entry.(map[string]any)
		if !ok {
			return nil, false, fmt.Errorf("%w: tool call %d must be an object", ErrToolsUnsupported, index)
		}
		toolCallID := strings.TrimSpace(stringValue(toolCall["id"]))
		if toolCallID == "" {
			return nil, false, fmt.Errorf("%w: tool call id is required", ErrToolsUnsupported)
		}
		function, _ := toolCall["function"].(map[string]any)
		toolName := strings.TrimSpace(stringValue(function["name"]))
		if toolName == "" {
			return nil, false, fmt.Errorf("%w: tool call name is required", ErrToolsUnsupported)
		}
		arguments, err := normalizeToolCallArgumentsValue(function["arguments"])
		if err != nil {
			return nil, false, err
		}
		blocks = append(blocks, map[string]any{
			"type":  "tool_use",
			"id":    toolCallID,
			"name":  toolName,
			"input": arguments,
		})
	}
	return blocks, true, nil
}

func normalizeToolCallArgumentsValue(raw any) (map[string]any, error) {
	switch value := raw.(type) {
	case nil:
		return map[string]any{}, nil
	case map[string]any:
		return cloneAnyMap(value), nil
	case string:
		return parseToolCallArguments(value)
	default:
		return nil, fmt.Errorf("%w: tool call arguments must be an object or JSON string", ErrToolsUnsupported)
	}
}

func normalizeAnthropicToolResultContent(message map[string]any) (string, error) {
	content, include, err := normalizeProviderMessageContent(message["content"])
	if err != nil {
		return "", err
	}
	if include {
		return content, nil
	}
	return normalizeProviderToolResultContent(message["result"])
}

func isErrorValue(raw any) bool {
	value, _ := raw.(bool)
	return value
}

func buildAnthropicChatMessages(providerMessages []map[string]any) ([]anthropic.MessageParam, error) {
	messages := make([]anthropic.MessageParam, 0, len(providerMessages))
	for index, providerMessage := range providerMessages {
		role := strings.TrimSpace(stringValue(providerMessage["role"]))
		blocks, err := buildAnthropicMessageBlocks(providerMessage["content"], role)
		if err != nil {
			return nil, fmt.Errorf("%w: anthropic message %d: %v", ErrHistoryUnsupported, index, err)
		}
		switch role {
		case "user":
			messages = append(messages, anthropic.NewUserMessage(blocks...))
		case "assistant":
			messages = append(messages, anthropic.NewAssistantMessage(blocks...))
		default:
			return nil, fmt.Errorf("%w: anthropic role %q", ErrHistoryUnsupported, role)
		}
	}
	return messages, nil
}

func buildAnthropicMessageBlocks(raw any, role string) ([]anthropic.ContentBlockParamUnion, error) {
	list, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("content must be a list, got %T", raw)
	}
	blocks := make([]anthropic.ContentBlockParamUnion, 0, len(list))
	for index, entry := range list {
		block, ok := entry.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("content block %d must be an object", index)
		}
		switch strings.TrimSpace(stringValue(block["type"])) {
		case "text", "":
			text := stringValue(block["text"])
			if strings.TrimSpace(text) == "" {
				continue
			}
			blocks = append(blocks, anthropic.NewTextBlock(text))
		case "thinking":
			signature := strings.TrimSpace(stringValue(block["signature"]))
			thinking := stringValue(block["thinking"])
			if role != "assistant" || signature == "" || strings.TrimSpace(thinking) == "" {
				continue
			}
			blocks = append(blocks, anthropic.NewThinkingBlock(signature, thinking))
		case "tool_use":
			toolID := strings.TrimSpace(stringValue(block["id"]))
			toolName := strings.TrimSpace(stringValue(block["name"]))
			if toolID == "" || toolName == "" {
				return nil, fmt.Errorf("tool_use block requires id and name")
			}
			blocks = append(blocks, anthropic.NewToolUseBlock(toolID, cloneJSONValue(block["input"]), toolName))
		case "tool_result":
			toolUseID := strings.TrimSpace(stringValue(block["tool_use_id"]))
			if toolUseID == "" {
				return nil, fmt.Errorf("tool_result block requires tool_use_id")
			}
			content := stringValue(block["content"])
			blocks = append(blocks, anthropic.NewToolResultBlock(toolUseID, content, isErrorValue(block["is_error"])))
		default:
			return nil, fmt.Errorf("unsupported content block type %q", stringValue(block["type"]))
		}
	}
	return blocks, nil
}

func (e *Executor) consumeAnthropicStream(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	requestBody anthropic.MessageNewParams,
) (map[string]any, error) {
	var usage map[string]any
	accumulator := newToolCallAccumulator()
	previewAccumulator := newToolPreviewAccumulator()
	accumulated := anthropic.Message{}

	stream := prepared.anthropicClient.Messages.NewStreaming(ctx, requestBody, prepared.anthropicRequestOpts...)
	for stream.Next() {
		if ctx.Err() != nil {
			return usage, context.Canceled
		}
		event := stream.Current()
		if err := accumulated.Accumulate(event); err != nil {
			return usage, fmt.Errorf("accumulate anthropic stream: %w", err)
		}
		nextUsage, err := e.processAnthropicEvent(ctx, event, prepared, assistantMessage, accumulator, previewAccumulator)
		if err != nil {
			return usage, err
		}
		if nextUsage != nil {
			usage = nextUsage
		}
	}
	if err := stream.Err(); err != nil {
		return usage, wrapAnthropicProviderError(err)
	}
	if finalUsage := buildAnthropicUsagePayload(accumulated.Usage); finalUsage != nil {
		usage = finalUsage
	}
	if err := finalizeAnthropicAssistantToolCalls(assistantMessage, &accumulated, accumulator); err != nil {
		return usage, err
	}
	return usage, nil
}

func (e *Executor) processAnthropicEvent(
	ctx context.Context,
	event anthropic.MessageStreamEventUnion,
	prepared preparedExecution,
	assistantMessage map[string]any,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
) (map[string]any, error) {
	switch typed := event.AsAny().(type) {
	case anthropic.MessageStartEvent:
		return buildAnthropicUsagePayload(typed.Message.Usage), nil
	case anthropic.MessageDeltaEvent:
		return buildAnthropicDeltaUsagePayload(typed.Usage), nil
	case anthropic.ContentBlockStartEvent:
		return nil, e.processAnthropicContentBlockStart(ctx, typed, prepared, assistantMessage, accumulator)
	case anthropic.ContentBlockDeltaEvent:
		return nil, e.processAnthropicContentBlockDelta(ctx, typed, prepared, assistantMessage, accumulator, previewAccumulator)
	default:
		return nil, nil
	}
}

func (e *Executor) processAnthropicContentBlockStart(
	ctx context.Context,
	event anthropic.ContentBlockStartEvent,
	prepared preparedExecution,
	assistantMessage map[string]any,
	accumulator *toolCallAccumulator,
) error {
	switch block := event.ContentBlock.AsAny().(type) {
	case anthropic.TextBlock:
		if block.Text == "" {
			return nil
		}
		appendAssistantTextAtIndex(assistantMessage, int(event.Index), block.Text)
		if !prepared.emitStream {
			return nil
		}
		return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
			Type:      realtime.StreamingEventTypeDelta,
			MessageID: stringValue(assistantMessage["id"]),
			Content: []any{
				realtime.MessageTextDelta{
					Type:  realtime.MessageContentTypeTextDelta,
					Index: int(event.Index),
					Text:  block.Text,
				},
			},
		})
	case anthropic.ThinkingBlock:
		if block.Thinking == "" && strings.TrimSpace(block.Signature) == "" {
			return nil
		}
		if block.Thinking != "" {
			appendAssistantThinkingAtIndex(assistantMessage, int(event.Index), block.Thinking)
		}
		if strings.TrimSpace(block.Signature) != "" {
			setAssistantThinkingSignatureAtIndex(assistantMessage, int(event.Index), block.Signature)
		}
		if !prepared.emitStream {
			return nil
		}
		var signature *string
		if strings.TrimSpace(block.Signature) != "" {
			signature = optionalStringPointer(block.Signature)
		}
		return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
			Type:      realtime.StreamingEventTypeDelta,
			MessageID: stringValue(assistantMessage["id"]),
			Content: []any{
				realtime.MessageThinkingDelta{
					Type:      realtime.MessageContentTypeThinkingDelta,
					Index:     int(event.Index),
					Thinking:  block.Thinking,
					Signature: signature,
				},
			},
		})
	case anthropic.ToolUseBlock:
		state := accumulator.apply(int(event.Index), block.ID, block.Name, "")
		if !prepared.emitStream || state == nil {
			return nil
		}
		return e.applyChunk(ctx, prepared, realtime.ToolCallDeltaEvent{
			Type:           realtime.StreamingEventTypeToolCallDelta,
			MessageID:      stringValue(assistantMessage["id"]),
			ToolCallID:     strings.TrimSpace(state.id),
			ArgumentsDelta: "",
			ToolName:       optionalStringPointer(state.name),
		})
	default:
		return nil
	}
}

func (e *Executor) processAnthropicContentBlockDelta(
	ctx context.Context,
	event anthropic.ContentBlockDeltaEvent,
	prepared preparedExecution,
	assistantMessage map[string]any,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
) error {
	switch delta := event.Delta.AsAny().(type) {
	case anthropic.TextDelta:
		text := delta.Text
		if text == "" {
			return nil
		}
		appendAssistantTextAtIndex(assistantMessage, int(event.Index), text)
		if !prepared.emitStream {
			return nil
		}
		return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
			Type:      realtime.StreamingEventTypeDelta,
			MessageID: stringValue(assistantMessage["id"]),
			Content: []any{
				realtime.MessageTextDelta{
					Type:  realtime.MessageContentTypeTextDelta,
					Index: int(event.Index),
					Text:  text,
				},
			},
		})
	case anthropic.ThinkingDelta:
		if delta.Thinking == "" {
			return nil
		}
		appendAssistantThinkingAtIndex(assistantMessage, int(event.Index), delta.Thinking)
		if !prepared.emitStream {
			return nil
		}
		return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
			Type:      realtime.StreamingEventTypeDelta,
			MessageID: stringValue(assistantMessage["id"]),
			Content: []any{
				realtime.MessageThinkingDelta{
					Type:     realtime.MessageContentTypeThinkingDelta,
					Index:    int(event.Index),
					Thinking: delta.Thinking,
				},
			},
		})
	case anthropic.SignatureDelta:
		signature := strings.TrimSpace(delta.Signature)
		if signature == "" {
			return nil
		}
		setAssistantThinkingSignatureAtIndex(assistantMessage, int(event.Index), signature)
		if !prepared.emitStream {
			return nil
		}
		return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
			Type:      realtime.StreamingEventTypeDelta,
			MessageID: stringValue(assistantMessage["id"]),
			Content: []any{
				realtime.MessageThinkingDelta{
					Type:      realtime.MessageContentTypeThinkingDelta,
					Index:     int(event.Index),
					Thinking:  "",
					Signature: optionalStringPointer(signature),
				},
			},
		})
	case anthropic.InputJSONDelta:
		state := accumulator.apply(int(event.Index), "", "", delta.PartialJSON)
		if !prepared.emitStream || state == nil {
			return nil
		}
		if err := e.applyChunk(ctx, prepared, realtime.ToolCallDeltaEvent{
			Type:           realtime.StreamingEventTypeToolCallDelta,
			MessageID:      stringValue(assistantMessage["id"]),
			ToolCallID:     strings.TrimSpace(state.id),
			ArgumentsDelta: delta.PartialJSON,
			ToolName:       optionalStringPointer(state.name),
		}); err != nil {
			return err
		}
		descriptor, ok := prepared.availableTools[mcpx.NormalizeToolName(state.name)]
		if !ok || descriptor.Metadata == nil || descriptor.Metadata.ToolArgumentPreview == nil {
			return nil
		}
		previewEvent, err := previewAccumulator.buildEvent(
			stringValue(assistantMessage["id"]),
			state,
			descriptor.Metadata.ToolArgumentPreview,
			delta.PartialJSON,
			prepared.temporaryToCanonical,
		)
		if err != nil || previewEvent == nil {
			return err
		}
		return e.applyChunk(ctx, prepared, *previewEvent)
	default:
		return nil
	}
}

func finalizeAnthropicAssistantToolCalls(message map[string]any, accumulated *anthropic.Message, accumulator *toolCallAccumulator) error {
	if err := finalizeAssistantToolCalls(message, accumulator); err == nil && hasNonEmptyToolCalls(message["tool_calls"]) {
		return nil
	}
	if accumulated == nil {
		return nil
	}
	toolCalls, err := extractAnthropicToolCalls(accumulated.Content)
	if err != nil {
		return err
	}
	if len(toolCalls) > 0 {
		message["tool_calls"] = messagesToAnyList(toolCalls)
	}
	return nil
}

func extractAnthropicToolCalls(content []anthropic.ContentBlockUnion) ([]map[string]any, error) {
	toolCalls := []map[string]any{}
	for _, block := range content {
		toolUse, ok := block.AsAny().(anthropic.ToolUseBlock)
		if !ok {
			continue
		}
		arguments := map[string]any{}
		trimmedInput := strings.TrimSpace(string(toolUse.Input))
		if trimmedInput != "" && trimmedInput != "null" {
			if err := json.Unmarshal(toolUse.Input, &arguments); err != nil {
				return nil, fmt.Errorf("%w: invalid tool call arguments: %v", ErrToolsUnsupported, err)
			}
		}
		toolCalls = append(toolCalls, map[string]any{
			"id":   strings.TrimSpace(toolUse.ID),
			"type": "function",
			"function": map[string]any{
				"name":      strings.TrimSpace(toolUse.Name),
				"arguments": arguments,
			},
		})
	}
	return toolCalls, nil
}

func buildAnthropicUsagePayload(usage anthropic.Usage) map[string]any {
	if usage.InputTokens == 0 && usage.OutputTokens == 0 {
		return nil
	}
	payload := map[string]any{
		"prompt_tokens":     usage.InputTokens,
		"completion_tokens": usage.OutputTokens,
		"total_tokens":      usage.InputTokens + usage.OutputTokens,
		"input_tokens":      usage.InputTokens,
		"output_tokens":     usage.OutputTokens,
	}
	if usage.CacheReadInputTokens > 0 {
		payload["cached_input_tokens"] = usage.CacheReadInputTokens
	}
	if usage.CacheCreationInputTokens > 0 {
		payload["cache_creation_input_tokens"] = usage.CacheCreationInputTokens
	}
	return payload
}

func buildAnthropicDeltaUsagePayload(usage anthropic.MessageDeltaUsage) map[string]any {
	if usage.InputTokens == 0 && usage.OutputTokens == 0 {
		return nil
	}
	payload := map[string]any{
		"prompt_tokens":     usage.InputTokens,
		"completion_tokens": usage.OutputTokens,
		"total_tokens":      usage.InputTokens + usage.OutputTokens,
		"input_tokens":      usage.InputTokens,
		"output_tokens":     usage.OutputTokens,
	}
	if usage.CacheReadInputTokens > 0 {
		payload["cached_input_tokens"] = usage.CacheReadInputTokens
	}
	if usage.CacheCreationInputTokens > 0 {
		payload["cache_creation_input_tokens"] = usage.CacheCreationInputTokens
	}
	return payload
}

func wrapAnthropicProviderError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.Canceled) {
		return context.Canceled
	}
	var apiErr *anthropic.Error
	if errors.As(err, &apiErr) {
		detail := strings.TrimSpace(apiErr.Error())
		if detail == "" {
			detail = "Anthropic request failed."
		}
		return fmt.Errorf("managed llm provider request failed: %s", detail)
	}
	return fmt.Errorf("managed llm provider request failed: %w", err)
}
