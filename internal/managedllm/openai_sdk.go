package managedllm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	openai "github.com/openai/openai-go/v3"
	openaioption "github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/shared"
	"setta/internal/agentruns"
)

func buildOpenAIClient(request agentruns.ExecutionRequest, httpClient *http.Client) (openai.Client, error) {
	apiKey, err := resolveAPIKey(request)
	if err != nil {
		return openai.Client{}, err
	}

	options := []openaioption.RequestOption{
		openaioption.WithHTTPClient(httpClient),
		openaioption.WithBaseURL(resolveOpenAIBaseURL(request)),
	}
	if apiKey != "" {
		options = append(options, openaioption.WithAPIKey(apiKey))
	}
	return openai.NewClient(options...), nil
}

func buildOpenAIRequestOverrides(request agentruns.ExecutionRequest) ([]openaioption.RequestOption, error) {
	overrides := []openaioption.RequestOption{}
	for key, value := range request.RequestParams {
		trimmedKey := strings.TrimSpace(key)
		switch trimmedKey {
		case "", "model", "messages", "stream", "stream_options", "api_key", "custom_llm_provider", "api_base", "tools", "tool_choice", "functions", "function_call", "reasoning_effort":
			continue
		default:
			overrides = append(overrides, openaioption.WithJSONSet(trimmedKey, cloneJSONValue(value)))
		}
	}

	reasoningEffort, enabled, err := resolveThinkingReasoningEffort(request)
	if err != nil {
		return nil, err
	}
	if enabled {
		overrides = append(overrides, openaioption.WithJSONSet("reasoning_effort", string(reasoningEffort)))
	} else if rawReasoningEffort, ok := request.RequestParams["reasoning_effort"]; ok {
		overrides = append(overrides, openaioption.WithJSONSet("reasoning_effort", cloneJSONValue(rawReasoningEffort)))
	}
	return overrides, nil
}

func resolveOpenAIBaseURL(request agentruns.ExecutionRequest) string {
	baseURL := strings.TrimSpace(request.LLMConfig.BaseURL)
	if rawBaseURL, ok := request.RequestParams["api_base"]; ok {
		if explicit := strings.TrimSpace(stringValue(rawBaseURL)); explicit != "" {
			baseURL = explicit
		}
	}
	if baseURL == "" {
		baseURL = defaultOpenAIBaseURL
	}
	return baseURL
}

func resolveThinkingReasoningEffort(request agentruns.ExecutionRequest) (shared.ReasoningEffort, bool, error) {
	if !request.Thinking {
		return "", false, nil
	}
	if effort, ok, err := extractExplicitReasoningEffort(request.RequestParams); err != nil {
		return "", false, err
	} else if ok {
		return effort, true, nil
	}

	modelName := strings.TrimSpace(request.LLMConfig.Model)
	provider := resolveProviderHint(request)
	if shouldEnableReasoningOverride(modelName, provider) {
		return shared.ReasoningEffortHigh, true, nil
	}

	providerDisplay := provider
	if strings.TrimSpace(providerDisplay) == "" {
		providerDisplay = "default"
	}
	return "", false, fmt.Errorf(
		"%w: thinking is not supported for model %q via provider %q",
		ErrReasoningUnsupported,
		modelName,
		providerDisplay,
	)
}

func extractExplicitReasoningEffort(params map[string]any) (shared.ReasoningEffort, bool, error) {
	if params == nil {
		return "", false, nil
	}
	raw, ok := params["reasoning_effort"]
	if !ok {
		return "", false, nil
	}
	effort, err := parseReasoningEffort(raw)
	if err != nil {
		return "", false, err
	}
	return effort, true, nil
}

func parseReasoningEffort(raw any) (shared.ReasoningEffort, error) {
	value := strings.TrimSpace(stringValue(raw))
	switch shared.ReasoningEffort(value) {
	case shared.ReasoningEffortNone,
		shared.ReasoningEffortMinimal,
		shared.ReasoningEffortLow,
		shared.ReasoningEffortMedium,
		shared.ReasoningEffortHigh,
		shared.ReasoningEffortXhigh:
		return shared.ReasoningEffort(value), nil
	default:
		return "", fmt.Errorf("%w: invalid reasoning_effort %q", ErrReasoningUnsupported, value)
	}
}

func resolveProviderHint(request agentruns.ExecutionRequest) string {
	if rawProvider, ok := request.RequestParams["custom_llm_provider"]; ok {
		if provider := strings.TrimSpace(stringValue(rawProvider)); provider != "" {
			return strings.ToLower(provider)
		}
	}
	return strings.ToLower(strings.TrimSpace(request.LLMConfig.Provider))
}

func shouldEnableReasoningOverride(modelName string, provider string) bool {
	normalizedModel := strings.ToLower(strings.TrimSpace(modelName))
	normalizedProvider := strings.ToLower(strings.TrimSpace(provider))
	if !isOpenAIReasoningModel(normalizedModel) {
		return false
	}
	return normalizedProvider == "" || isOpenAIProvider(normalizedProvider)
}

func isOpenAIReasoningModel(modelName string) bool {
	alias := strings.TrimSpace(modelName)
	if alias == "" {
		return false
	}
	if slash := strings.LastIndex(alias, "/"); slash >= 0 {
		alias = alias[slash+1:]
	}
	normalizedAlias := strings.ToLower(alias)
	return strings.HasPrefix(normalizedAlias, "o1") ||
		strings.HasPrefix(normalizedAlias, "o3") ||
		strings.HasPrefix(normalizedAlias, "o4") ||
		strings.HasPrefix(normalizedAlias, "gpt-5")
}

func isOpenAIProvider(provider string) bool {
	return strings.Contains(provider, "openai") || strings.Contains(provider, "azure")
}

func buildOpenAIChatCompletionParams(
	model string,
	providerMessages []map[string]any,
	toolDefinitions []map[string]any,
) (openai.ChatCompletionNewParams, error) {
	messages, err := buildOpenAIChatMessages(providerMessages)
	if err != nil {
		return openai.ChatCompletionNewParams{}, err
	}

	params := openai.ChatCompletionNewParams{
		Messages: messages,
		Model:    shared.ChatModel(model),
		StreamOptions: openai.ChatCompletionStreamOptionsParam{
			IncludeUsage: openai.Bool(true),
		},
	}
	if len(toolDefinitions) > 0 {
		tools, err := buildOpenAIChatTools(toolDefinitions)
		if err != nil {
			return openai.ChatCompletionNewParams{}, err
		}
		params.Tools = tools
	}
	return params, nil
}

func buildOpenAIProviderMessage(message map[string]any) (map[string]any, bool, error) {
	role := strings.TrimSpace(stringValue(message["role"]))
	payload := map[string]any{"role": role}
	switch role {
	case "system", "user":
		content, include, err := normalizeProviderMessageContent(message["content"])
		if err != nil {
			return nil, false, err
		}
		payload["content"] = content
		return payload, include, nil
	case "assistant":
		content, include, err := normalizeProviderMessageContent(message["content"])
		if err != nil {
			return nil, false, err
		}
		toolCalls, hasToolCalls, err := normalizeProviderToolCalls(message["tool_calls"], role)
		if err != nil {
			return nil, false, err
		}
		payload["content"] = providerContentValue(content)
		if hasToolCalls {
			payload["tool_calls"] = messagesToAnyList(toolCalls)
			return payload, true, nil
		}
		return payload, include, nil
	case "tool":
		content, include, err := normalizeProviderMessageContent(message["content"])
		if err != nil {
			return nil, false, err
		}
		if !include {
			fallback, fallbackErr := normalizeProviderToolResultContent(message["result"])
			if fallbackErr != nil {
				return nil, false, fallbackErr
			}
			content = fallback
		}
		toolCallID := strings.TrimSpace(stringValue(message["tool_call_id"]))
		if toolCallID == "" {
			return nil, false, fmt.Errorf("%w: tool messages require tool_call_id", ErrToolsUnsupported)
		}
		payload["content"] = content
		payload["tool_call_id"] = toolCallID
		return payload, true, nil
	default:
		return nil, false, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
	}
}

func buildOpenAIChatMessages(providerMessages []map[string]any) ([]openai.ChatCompletionMessageParamUnion, error) {
	messages := make([]openai.ChatCompletionMessageParamUnion, 0, len(providerMessages))
	for index, providerMessage := range providerMessages {
		role := strings.TrimSpace(stringValue(providerMessage["role"]))
		switch role {
		case "system":
			messages = append(messages, openai.SystemMessage(stringValue(providerMessage["content"])))
		case "user":
			messages = append(messages, openai.UserMessage(stringValue(providerMessage["content"])))
		case "assistant":
			assistantMessage, err := buildOpenAIAssistantMessage(providerMessage)
			if err != nil {
				return nil, fmt.Errorf("%w: assistant message %d: %v", ErrHistoryUnsupported, index, err)
			}
			messages = append(messages, assistantMessage)
		case "tool":
			toolCallID := strings.TrimSpace(stringValue(providerMessage["tool_call_id"]))
			if toolCallID == "" {
				return nil, fmt.Errorf("%w: tool message %d requires tool_call_id", ErrToolsUnsupported, index)
			}
			messages = append(messages, openai.ToolMessage(stringValue(providerMessage["content"]), toolCallID))
		default:
			return nil, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
		}
	}
	return messages, nil
}

func buildOpenAIAssistantMessage(providerMessage map[string]any) (openai.ChatCompletionMessageParamUnion, error) {
	assistant := openai.ChatCompletionAssistantMessageParam{}
	content := strings.TrimSpace(stringValue(providerMessage["content"]))
	if content != "" {
		assistant.Content.OfString = openai.String(content)
	}

	toolCalls, err := buildOpenAIAssistantToolCalls(providerMessage["tool_calls"])
	if err != nil {
		return openai.ChatCompletionMessageParamUnion{}, err
	}
	if len(toolCalls) > 0 {
		assistant.ToolCalls = toolCalls
	}
	return openai.ChatCompletionMessageParamUnion{OfAssistant: &assistant}, nil
}

func buildOpenAIAssistantToolCalls(raw any) ([]openai.ChatCompletionMessageToolCallUnionParam, error) {
	if !hasNonEmptyToolCalls(raw) {
		return nil, nil
	}
	list, _ := raw.([]any)
	toolCalls := make([]openai.ChatCompletionMessageToolCallUnionParam, 0, len(list))
	for index, entry := range list {
		toolCall, ok := entry.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%w: assistant tool call %d must be an object", ErrToolsUnsupported, index)
		}
		toolCallID := strings.TrimSpace(stringValue(toolCall["id"]))
		if toolCallID == "" {
			return nil, fmt.Errorf("%w: assistant tool call id is required", ErrToolsUnsupported)
		}
		function, _ := toolCall["function"].(map[string]any)
		toolName := strings.TrimSpace(stringValue(function["name"]))
		if toolName == "" {
			return nil, fmt.Errorf("%w: assistant tool call name is required", ErrToolsUnsupported)
		}
		arguments, _ := function["arguments"].(map[string]any)
		if arguments == nil {
			arguments = map[string]any{}
		}
		encodedArguments, err := json.Marshal(arguments)
		if err != nil {
			return nil, fmt.Errorf("%w: encode assistant tool call arguments: %v", ErrToolsUnsupported, err)
		}

		toolCalls = append(toolCalls, openai.ChatCompletionMessageToolCallUnionParam{
			OfFunction: &openai.ChatCompletionMessageFunctionToolCallParam{
				ID: toolCallID,
				Function: openai.ChatCompletionMessageFunctionToolCallFunctionParam{
					Name:      toolName,
					Arguments: string(encodedArguments),
				},
			},
		})
	}
	return toolCalls, nil
}

func buildOpenAIChatTools(toolDefinitions []map[string]any) ([]openai.ChatCompletionToolUnionParam, error) {
	tools := make([]openai.ChatCompletionToolUnionParam, 0, len(toolDefinitions))
	for index, definition := range toolDefinitions {
		function, _ := definition["function"].(map[string]any)
		name := strings.TrimSpace(stringValue(function["name"]))
		if name == "" {
			return nil, fmt.Errorf("%w: tool definition %d missing function name", ErrToolsUnsupported, index)
		}
		parameters, err := normalizeOpenAIFunctionParameters(function["parameters"])
		if err != nil {
			return nil, fmt.Errorf("%w: tool definition %d parameters: %v", ErrToolsUnsupported, index, err)
		}

		functionDefinition := shared.FunctionDefinitionParam{
			Name:       name,
			Parameters: parameters,
		}
		if description := strings.TrimSpace(stringValue(function["description"])); description != "" {
			functionDefinition.Description = openai.String(description)
		}
		tools = append(tools, openai.ChatCompletionFunctionTool(functionDefinition))
	}
	return tools, nil
}

func normalizeOpenAIFunctionParameters(raw any) (openai.FunctionParameters, error) {
	if raw == nil {
		return nil, errors.New("missing function parameters")
	}
	cloned, ok := cloneJSONValue(raw).(map[string]any)
	if !ok || cloned == nil {
		return nil, fmt.Errorf("expected JSON object, got %T", raw)
	}
	return openai.FunctionParameters(cloned), nil
}

func buildCompletionUsagePayload(usage openai.CompletionUsage) map[string]any {
	payload := map[string]any{
		"prompt_tokens":     usage.PromptTokens,
		"completion_tokens": usage.CompletionTokens,
		"total_tokens":      usage.TotalTokens,
		"input_tokens":      usage.PromptTokens,
		"output_tokens":     usage.CompletionTokens,
	}
	if usage.PromptTokensDetails.CachedTokens > 0 {
		payload["cached_input_tokens"] = usage.PromptTokensDetails.CachedTokens
	}
	if usage.CompletionTokensDetails.ReasoningTokens > 0 {
		payload["reasoning_output_tokens"] = usage.CompletionTokensDetails.ReasoningTokens
	}
	return payload
}

func wrapOpenAIProviderError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.Canceled) {
		return context.Canceled
	}
	var apiErr *openai.Error
	if errors.As(err, &apiErr) {
		detail := strings.TrimSpace(apiErr.Error())
		if detail == "" {
			detail = "OpenAI request failed."
		}
		return fmt.Errorf("managed llm provider request failed: %s", detail)
	}
	return fmt.Errorf("managed llm provider request failed: %w", err)
}
