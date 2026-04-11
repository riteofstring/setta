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
	if value, ok := parsePositiveInt64Value(raw); ok {
		return value, nil
	}
	return 0, fmt.Errorf("%w: invalid %s %v", agentruns.ErrInvalidRunInput, field, raw)
}

func parsePositiveInt64Value(raw any) (int64, bool) {
	switch value := raw.(type) {
	case int:
		return positiveSignedInt64(int64(value))
	case int32:
		return positiveSignedInt64(int64(value))
	case int64:
		return positiveSignedInt64(value)
	case float64:
		return positiveWholeFloat64(value)
	case string:
		return positiveStringInt64(value)
	default:
		return 0, false
	}
}

func positiveSignedInt64(value int64) (int64, bool) {
	if value <= 0 {
		return 0, false
	}
	return value, true
}

func positiveWholeFloat64(value float64) (int64, bool) {
	if value <= 0 || value != float64(int64(value)) {
		return 0, false
	}
	return int64(value), true
}

func positiveStringInt64(value string) (int64, bool) {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || parsed <= 0 {
		return 0, false
	}
	return parsed, true
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
		return buildAnthropicUserProviderMessage(message)
	case "assistant":
		return buildAnthropicAssistantProviderMessage(message)
	case "tool":
		return buildAnthropicToolProviderMessage(message)
	default:
		return nil, false, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
	}
}

func buildAnthropicUserProviderMessage(message map[string]any) (map[string]any, bool, error) {
	blocks, include, err := normalizeAnthropicMessageContent(message["content"], "user")
	if err != nil || !include {
		return nil, include, err
	}
	return anthropicProviderMessage("user", blocks), true, nil
}

func buildAnthropicAssistantProviderMessage(message map[string]any) (map[string]any, bool, error) {
	blocks, includeText, err := normalizeAnthropicMessageContent(message["content"], "assistant")
	if err != nil {
		return nil, false, err
	}
	toolUseBlocks, hasToolUses, err := normalizeAnthropicToolUseBlocks(message["tool_calls"])
	if err != nil {
		return nil, false, err
	}
	if !includeText && !hasToolUses {
		return nil, false, nil
	}
	return anthropicProviderMessage("assistant", append(blocks, toolUseBlocks...)), true, nil
}

func buildAnthropicToolProviderMessage(message map[string]any) (map[string]any, bool, error) {
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
	return anthropicProviderMessage("user", []any{block}), true, nil
}

func anthropicProviderMessage(role string, blocks []any) map[string]any {
	return map[string]any{
		"role":    role,
		"content": blocks,
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
		next, include, err := buildAnthropicMessageBlock(block, role)
		if err != nil {
			return nil, err
		}
		if include {
			blocks = append(blocks, next)
		}
	}
	return blocks, nil
}

func buildAnthropicMessageBlock(block map[string]any, role string) (anthropic.ContentBlockParamUnion, bool, error) {
	switch strings.TrimSpace(stringValue(block["type"])) {
	case "text", "":
		return buildAnthropicTextBlock(block)
	case "thinking":
		return buildAnthropicThinkingBlock(block, role)
	case "tool_use":
		return buildAnthropicToolUseBlock(block)
	case "tool_result":
		return buildAnthropicToolResultBlock(block)
	default:
		return anthropic.ContentBlockParamUnion{}, false, fmt.Errorf("unsupported content block type %q", stringValue(block["type"]))
	}
}

func buildAnthropicTextBlock(block map[string]any) (anthropic.ContentBlockParamUnion, bool, error) {
	text := stringValue(block["text"])
	if strings.TrimSpace(text) == "" {
		return anthropic.ContentBlockParamUnion{}, false, nil
	}
	return anthropic.NewTextBlock(text), true, nil
}

func buildAnthropicThinkingBlock(block map[string]any, role string) (anthropic.ContentBlockParamUnion, bool, error) {
	signature := strings.TrimSpace(stringValue(block["signature"]))
	thinking := stringValue(block["thinking"])
	if role != "assistant" || signature == "" || strings.TrimSpace(thinking) == "" {
		return anthropic.ContentBlockParamUnion{}, false, nil
	}
	return anthropic.NewThinkingBlock(signature, thinking), true, nil
}

func buildAnthropicToolUseBlock(block map[string]any) (anthropic.ContentBlockParamUnion, bool, error) {
	toolID := strings.TrimSpace(stringValue(block["id"]))
	toolName := strings.TrimSpace(stringValue(block["name"]))
	if toolID == "" || toolName == "" {
		return anthropic.ContentBlockParamUnion{}, false, fmt.Errorf("tool_use block requires id and name")
	}
	return anthropic.NewToolUseBlock(toolID, cloneJSONValue(block["input"]), toolName), true, nil
}

func buildAnthropicToolResultBlock(block map[string]any) (anthropic.ContentBlockParamUnion, bool, error) {
	toolUseID := strings.TrimSpace(stringValue(block["tool_use_id"]))
	if toolUseID == "" {
		return anthropic.ContentBlockParamUnion{}, false, fmt.Errorf("tool_result block requires tool_use_id")
	}
	content := stringValue(block["content"])
	return anthropic.NewToolResultBlock(toolUseID, content, isErrorValue(block["is_error"])), true, nil
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
		return e.processAnthropicTextBlockStart(ctx, int(event.Index), block.Text, prepared, assistantMessage)
	case anthropic.ThinkingBlock:
		return e.processAnthropicThinkingBlockStart(ctx, int(event.Index), block, prepared, assistantMessage)
	case anthropic.ToolUseBlock:
		return e.processAnthropicToolUseBlockStart(ctx, int(event.Index), block, prepared, assistantMessage, accumulator)
	default:
		return nil
	}
}

func (e *Executor) processAnthropicTextBlockStart(
	ctx context.Context,
	index int,
	text string,
	prepared preparedExecution,
	assistantMessage map[string]any,
) error {
	if text == "" {
		return nil
	}
	appendAssistantTextAtIndex(assistantMessage, index, text)
	return e.emitAnthropicTextDelta(ctx, prepared, assistantMessage, index, text)
}

func (e *Executor) processAnthropicThinkingBlockStart(
	ctx context.Context,
	index int,
	block anthropic.ThinkingBlock,
	prepared preparedExecution,
	assistantMessage map[string]any,
) error {
	signature := strings.TrimSpace(block.Signature)
	if block.Thinking == "" && signature == "" {
		return nil
	}
	if block.Thinking != "" {
		appendAssistantThinkingAtIndex(assistantMessage, index, block.Thinking)
	}
	if signature != "" {
		setAssistantThinkingSignatureAtIndex(assistantMessage, index, signature)
	}
	return e.emitAnthropicThinkingDelta(ctx, prepared, assistantMessage, index, block.Thinking, optionalString(signature))
}

func (e *Executor) processAnthropicToolUseBlockStart(
	ctx context.Context,
	index int,
	block anthropic.ToolUseBlock,
	prepared preparedExecution,
	assistantMessage map[string]any,
	accumulator *toolCallAccumulator,
) error {
	state := accumulator.apply(index, block.ID, "", block.Name, "")
	return e.emitAnthropicToolCallDelta(ctx, prepared, assistantMessage, state, "")
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
		return e.processAnthropicTextContentDelta(ctx, int(event.Index), delta.Text, prepared, assistantMessage)
	case anthropic.ThinkingDelta:
		return e.processAnthropicThinkingContentDelta(ctx, int(event.Index), delta.Thinking, prepared, assistantMessage)
	case anthropic.SignatureDelta:
		return e.processAnthropicSignatureDelta(ctx, int(event.Index), delta.Signature, prepared, assistantMessage)
	case anthropic.InputJSONDelta:
		return e.processAnthropicInputJSONDelta(
			ctx,
			int(event.Index),
			delta.PartialJSON,
			prepared,
			assistantMessage,
			accumulator,
			previewAccumulator,
		)
	default:
		return nil
	}
}

func (e *Executor) processAnthropicTextContentDelta(
	ctx context.Context,
	index int,
	text string,
	prepared preparedExecution,
	assistantMessage map[string]any,
) error {
	if text == "" {
		return nil
	}
	appendAssistantTextAtIndex(assistantMessage, index, text)
	return e.emitAnthropicTextDelta(ctx, prepared, assistantMessage, index, text)
}

func (e *Executor) processAnthropicThinkingContentDelta(
	ctx context.Context,
	index int,
	thinking string,
	prepared preparedExecution,
	assistantMessage map[string]any,
) error {
	if thinking == "" {
		return nil
	}
	appendAssistantThinkingAtIndex(assistantMessage, index, thinking)
	return e.emitAnthropicThinkingDelta(ctx, prepared, assistantMessage, index, thinking, nil)
}

func (e *Executor) processAnthropicSignatureDelta(
	ctx context.Context,
	index int,
	signature string,
	prepared preparedExecution,
	assistantMessage map[string]any,
) error {
	trimmedSignature := strings.TrimSpace(signature)
	if trimmedSignature == "" {
		return nil
	}
	setAssistantThinkingSignatureAtIndex(assistantMessage, index, trimmedSignature)
	return e.emitAnthropicThinkingDelta(ctx, prepared, assistantMessage, index, "", optionalString(trimmedSignature))
}

func (e *Executor) processAnthropicInputJSONDelta(
	ctx context.Context,
	index int,
	partialJSON string,
	prepared preparedExecution,
	assistantMessage map[string]any,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
) error {
	state := accumulator.apply(index, "", "", "", partialJSON)
	if err := e.emitAnthropicToolCallDelta(ctx, prepared, assistantMessage, state, partialJSON); err != nil {
		return err
	}
	return e.emitAnthropicToolPreview(ctx, prepared, assistantMessage, state, previewAccumulator, partialJSON)
}

func (e *Executor) emitAnthropicTextDelta(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	index int,
	text string,
) error {
	if !prepared.emitStream || text == "" {
		return nil
	}
	return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
		Type:      realtime.StreamingEventTypeDelta,
		MessageID: stringValue(assistantMessage["id"]),
		Content: []any{
			realtime.MessageTextDelta{
				Type:  realtime.MessageContentTypeTextDelta,
				Index: index,
				Text:  text,
			},
		},
	})
}

func (e *Executor) emitAnthropicThinkingDelta(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	index int,
	thinking string,
	signature *string,
) error {
	if !prepared.emitStream || (thinking == "" && signature == nil) {
		return nil
	}
	return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
		Type:      realtime.StreamingEventTypeDelta,
		MessageID: stringValue(assistantMessage["id"]),
		Content: []any{
			realtime.MessageThinkingDelta{
				Type:      realtime.MessageContentTypeThinkingDelta,
				Index:     index,
				Thinking:  thinking,
				Signature: signature,
			},
		},
	})
}

func (e *Executor) emitAnthropicToolCallDelta(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	state *toolCallState,
	argumentsDelta string,
) error {
	if !prepared.emitStream || state == nil {
		return nil
	}
	return e.applyChunk(ctx, prepared, realtime.ToolCallDeltaEvent{
		Type:           realtime.StreamingEventTypeToolCallDelta,
		MessageID:      stringValue(assistantMessage["id"]),
		ToolCallID:     strings.TrimSpace(state.id),
		ArgumentsDelta: argumentsDelta,
		ToolName:       optionalStringPointer(state.name),
	})
}

func (e *Executor) emitAnthropicToolPreview(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	state *toolCallState,
	previewAccumulator *toolPreviewAccumulator,
	partialJSON string,
) error {
	if !prepared.emitStream || state == nil {
		return nil
	}
	descriptor, ok := prepared.availableTools[mcpx.NormalizeToolName(state.name)]
	if !ok || descriptor.Metadata == nil || descriptor.Metadata.ToolArgumentPreview == nil {
		return nil
	}
	previewEvent, err := previewAccumulator.buildEvent(
		stringValue(assistantMessage["id"]),
		state,
		descriptor.Metadata.ToolArgumentPreview,
		partialJSON,
		prepared.temporaryToCanonical,
	)
	if err != nil {
		return err
	}
	if previewEvent == nil {
		return nil
	}
	return e.applyChunk(ctx, prepared, *previewEvent)
}

func optionalString(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return optionalStringPointer(value)
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
	return appendContextUsageFromRawJSON(payload, usage.RawJSON())
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
	return appendContextUsageFromRawJSON(payload, usage.RawJSON())
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
