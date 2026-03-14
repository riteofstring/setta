package managedllm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	openai "github.com/openai/openai-go/v3"
	openaiazure "github.com/openai/openai-go/v3/azure"
	openaioption "github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/packages/param"
	"github.com/openai/openai-go/v3/responses"
	"github.com/openai/openai-go/v3/shared"
	"setta/internal/agentruns"
)

func buildOpenAIClient(request agentruns.ExecutionRequest, httpClient *http.Client) (openai.Client, error) {
	if isAzureOpenAIProvider(resolveProviderHint(request)) {
		return buildAzureOpenAIClient(request, httpClient)
	}
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

func buildAzureOpenAIClient(request agentruns.ExecutionRequest, httpClient *http.Client) (openai.Client, error) {
	apiKey, err := resolveAPIKey(request)
	if err != nil {
		return openai.Client{}, err
	}
	endpoint, err := resolveAzureEndpoint(request)
	if err != nil {
		return openai.Client{}, err
	}
	apiVersion, err := resolveAzureAPIVersion(request)
	if err != nil {
		return openai.Client{}, err
	}
	options := []openaioption.RequestOption{
		openaioption.WithHTTPClient(httpClient),
		openaiazure.WithEndpoint(endpoint, apiVersion),
		openaiazure.WithAPIKey(apiKey),
	}
	return openai.NewClient(options...), nil
}

func buildOpenAIChatRequestOverrides(request agentruns.ExecutionRequest) ([]openaioption.RequestOption, error) {
	overrides := []openaioption.RequestOption{}
	for key, value := range request.RequestParams {
		trimmedKey := strings.TrimSpace(key)
		switch trimmedKey {
		case "",
			"model",
			"messages",
			"stream",
			"stream_options",
			"api_key",
			"custom_llm_provider",
			"api_base",
			"api_version",
			"apiVersion",
			"azure_api_version",
			"azureApiVersion",
			"tools",
			"tool_choice",
			"functions",
			"function_call",
			"reasoning_effort":
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

func buildOpenAIResponseRequestOverrides(request agentruns.ExecutionRequest) []openaioption.RequestOption {
	overrides := []openaioption.RequestOption{}
	for key, value := range request.RequestParams {
		trimmedKey := strings.TrimSpace(key)
		switch trimmedKey {
		case "",
			"model",
			"messages",
			"stream",
			"stream_options",
			"api_key",
			"custom_llm_provider",
			"api_base",
			"api_version",
			"apiVersion",
			"azure_api_version",
			"azureApiVersion",
			"tools",
			"tool_choice",
			"functions",
			"function_call",
			"include",
			"reasoning",
			"reasoning_effort",
			"summary",
			"generate_summary":
			continue
		default:
			overrides = append(overrides, openaioption.WithJSONSet(trimmedKey, cloneJSONValue(value)))
		}
	}
	return overrides
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

func resolveAzureEndpoint(request agentruns.ExecutionRequest) (string, error) {
	endpoint := strings.TrimSpace(request.LLMConfig.BaseURL)
	if rawBaseURL, ok := request.RequestParams["api_base"]; ok {
		if explicit := strings.TrimSpace(stringValue(rawBaseURL)); explicit != "" {
			endpoint = explicit
		}
	}
	if endpoint == "" {
		return "", fmt.Errorf("%w: azure provider requires explicit api_base", ErrProviderConfigInvalid)
	}
	return endpoint, nil
}

func resolveAzureAPIVersion(request agentruns.ExecutionRequest) (string, error) {
	for _, key := range []string{"api_version", "apiVersion", "azure_api_version", "azureApiVersion"} {
		raw, ok := request.RequestParams[key]
		if !ok {
			continue
		}
		if explicit := strings.TrimSpace(stringValue(raw)); explicit != "" {
			return explicit, nil
		}
	}
	return "", fmt.Errorf("%w: azure provider requires explicit api_version", ErrProviderConfigInvalid)
}

func resolveThinkingReasoningEffort(request agentruns.ExecutionRequest) (shared.ReasoningEffort, bool, error) {
	if !request.Thinking {
		return "", false, nil
	}
	if isAzureOpenAIProvider(resolveProviderHint(request)) {
		return "", false, unsupportedThinkingError(request)
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
	return "", false, unsupportedThinkingError(request)
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

func isAzureOpenAIProvider(provider string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(provider)), "azure")
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

func buildOpenAIResponsesParams(
	request agentruns.ExecutionRequest,
	model string,
	systemPrompt string,
	transcript []map[string]any,
	toolDefinitions []map[string]any,
) (responses.ResponseNewParams, error) {
	inputItems, err := buildOpenAIResponseInputItems(transcript)
	if err != nil {
		return responses.ResponseNewParams{}, err
	}

	params := responses.ResponseNewParams{
		Model: shared.ResponsesModel(model),
		Store: openai.Bool(false),
	}
	if trimmedSystemPrompt := strings.TrimSpace(systemPrompt); trimmedSystemPrompt != "" {
		params.Instructions = openai.String(trimmedSystemPrompt)
	}
	if len(inputItems) > 0 {
		params.Input.OfInputItemList = inputItems
	}
	if len(toolDefinitions) > 0 {
		tools, err := buildOpenAIResponseTools(toolDefinitions)
		if err != nil {
			return responses.ResponseNewParams{}, err
		}
		params.Tools = tools
	}
	includes, err := buildOpenAIResponseIncludes(request)
	if err != nil {
		return responses.ResponseNewParams{}, err
	}
	if len(includes) > 0 {
		params.Include = includes
	}
	if request.Thinking {
		reasoning, enabled, err := buildOpenAIResponseReasoning(request)
		if err != nil {
			return responses.ResponseNewParams{}, err
		}
		if enabled {
			params.Reasoning = reasoning
		}
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

func buildOpenAIResponseInputItems(transcript []map[string]any) (responses.ResponseInputParam, error) {
	items := make(responses.ResponseInputParam, 0, len(transcript))
	for index, message := range transcript {
		role := strings.TrimSpace(stringValue(message["role"]))
		switch role {
		case "system", "user":
			content, include, err := buildOpenAIResponseInputMessageContent(message["content"])
			if err != nil {
				return nil, fmt.Errorf("%w: transcript message %d: %v", ErrHistoryUnsupported, index, err)
			}
			if include {
				items = append(items, responses.ResponseInputItemParamOfInputMessage(content, role))
			}
		case "assistant":
			messageID := strings.TrimSpace(stringValue(message["id"]))
			if messageID == "" {
				return nil, fmt.Errorf("%w: assistant message id is required", ErrHistoryUnsupported)
			}
			reasoningItems, includeReasoning, err := buildOpenAIResponseReasoningItems(
				messageID,
				message["content"],
			)
			if err != nil {
				return nil, fmt.Errorf("%w: transcript message %d: %v", ErrHistoryUnsupported, index, err)
			}
			if includeReasoning {
				items = append(items, reasoningItems...)
			}
			content, include, err := buildOpenAIResponseOutputMessageContent(message["content"])
			if err != nil {
				return nil, fmt.Errorf("%w: transcript message %d: %v", ErrHistoryUnsupported, index, err)
			}
			if include {
				items = append(items, responses.ResponseInputItemParamOfOutputMessage(
					content,
					messageID,
					responses.ResponseOutputMessageStatusCompleted,
				))
			}
			toolCalls, includeToolCalls, err := normalizeProviderToolCalls(message["tool_calls"], role)
			if err != nil {
				return nil, fmt.Errorf("%w: transcript message %d: %v", ErrToolsUnsupported, index, err)
			}
			if !includeToolCalls {
				continue
			}
			for _, toolCall := range toolCalls {
				function, _ := toolCall["function"].(map[string]any)
				items = append(items, responses.ResponseInputItemParamOfFunctionCall(
					stringValue(function["arguments"]),
					strings.TrimSpace(stringValue(toolCall["id"])),
					strings.TrimSpace(stringValue(function["name"])),
				))
			}
		case "tool":
			content, include, err := normalizeProviderMessageContent(message["content"])
			if err != nil {
				return nil, fmt.Errorf("%w: transcript message %d: %v", ErrHistoryUnsupported, index, err)
			}
			if !include {
				content, err = normalizeProviderToolResultContent(message["result"])
				if err != nil {
					return nil, fmt.Errorf("%w: transcript message %d: %v", ErrHistoryUnsupported, index, err)
				}
			}
			toolCallID := strings.TrimSpace(stringValue(message["tool_call_id"]))
			if toolCallID == "" {
				return nil, fmt.Errorf("%w: tool messages require tool_call_id", ErrToolsUnsupported)
			}
			items = append(items, responses.ResponseInputItemParamOfFunctionCallOutput(toolCallID, content))
		default:
			return nil, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
		}
	}
	return items, nil
}

func buildOpenAIResponseIncludes(request agentruns.ExecutionRequest) ([]responses.ResponseIncludable, error) {
	includes := make([]responses.ResponseIncludable, 0, 1)
	seen := map[responses.ResponseIncludable]struct{}{}
	appendInclude := func(value string) {
		trimmed := responses.ResponseIncludable(strings.TrimSpace(value))
		if trimmed == "" {
			return
		}
		if _, ok := seen[trimmed]; ok {
			return
		}
		seen[trimmed] = struct{}{}
		includes = append(includes, trimmed)
	}
	if rawInclude, ok := request.RequestParams["include"]; ok {
		switch typed := rawInclude.(type) {
		case string:
			appendInclude(typed)
		case []string:
			for _, entry := range typed {
				appendInclude(entry)
			}
		case []any:
			for index, entry := range typed {
				value, ok := entry.(string)
				if !ok {
					return nil, fmt.Errorf("%w: OpenAI Responses include[%d] must be a string", ErrProviderConfigInvalid, index)
				}
				appendInclude(value)
			}
		default:
			return nil, fmt.Errorf("%w: OpenAI Responses include must be a string or string list", ErrProviderConfigInvalid)
		}
	}
	if request.Thinking {
		appendInclude(string(responses.ResponseIncludableReasoningEncryptedContent))
	}
	return includes, nil
}

func buildOpenAIResponseInputMessageContent(raw any) (responses.ResponseInputMessageContentListParam, bool, error) {
	text, include, err := normalizeProviderMessageContent(raw)
	if err != nil {
		return nil, false, err
	}
	if !include {
		return nil, false, nil
	}
	return responses.ResponseInputMessageContentListParam{
		responses.ResponseInputContentParamOfInputText(text),
	}, true, nil
}

func buildOpenAIResponseOutputMessageContent(raw any) ([]responses.ResponseOutputMessageContentUnionParam, bool, error) {
	text, include, err := normalizeProviderMessageContent(raw)
	if err != nil {
		return nil, false, err
	}
	if !include {
		return nil, false, nil
	}
	return []responses.ResponseOutputMessageContentUnionParam{
		{
			OfOutputText: &responses.ResponseOutputTextParam{
				Text:        text,
				Annotations: []responses.ResponseOutputTextAnnotationUnionParam{},
			},
		},
	}, true, nil
}

func buildOpenAIResponseReasoningItems(
	messageID string,
	raw any,
) ([]responses.ResponseInputItemUnionParam, bool, error) {
	if raw == nil {
		return nil, false, nil
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, false, fmt.Errorf("%w: message content must be a list", ErrHistoryUnsupported)
	}
	items := []responses.ResponseInputItemUnionParam{}
	reasoningIndex := 0
	for index, entry := range list {
		block, ok := entry.(map[string]any)
		if !ok {
			return nil, false, fmt.Errorf("%w: content block %d must be an object", ErrHistoryUnsupported, index)
		}
		if strings.TrimSpace(stringValue(block["type"])) != "thinking" {
			continue
		}
		thinking := stringValue(block["thinking"])
		summary := stringValue(block["summary"])
		signature := strings.TrimSpace(stringValue(block["signature"]))
		providerItemID := strings.TrimSpace(stringValue(block["provider_item_id"]))
		if strings.TrimSpace(thinking) == "" &&
			strings.TrimSpace(summary) == "" &&
			signature == "" {
			continue
		}
		reasoning := responses.ResponseReasoningItemParam{
			ID:      openAIResponseReasoningItemID(messageID, reasoningIndex, providerItemID),
			Summary: []responses.ResponseReasoningItemSummaryParam{},
			Status:  responses.ResponseReasoningItemStatusCompleted,
		}
		if strings.TrimSpace(summary) != "" {
			reasoning.Summary = []responses.ResponseReasoningItemSummaryParam{
				{Text: summary},
			}
		}
		if strings.TrimSpace(thinking) != "" {
			reasoning.Content = []responses.ResponseReasoningItemContentParam{
				{Text: thinking},
			}
		}
		if signature != "" {
			reasoning.EncryptedContent = param.NewOpt(signature)
		}
		items = append(items, responses.ResponseInputItemUnionParam{
			OfReasoning: &reasoning,
		})
		reasoningIndex++
	}
	if len(items) == 0 {
		return nil, false, nil
	}
	return items, true, nil
}

func openAIResponseReasoningItemID(messageID string, reasoningIndex int, providerItemID string) string {
	if strings.TrimSpace(providerItemID) != "" {
		return strings.TrimSpace(providerItemID)
	}
	if reasoningIndex <= 0 {
		return messageID + "_reasoning"
	}
	return fmt.Sprintf("%s_reasoning_%d", messageID, reasoningIndex)
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

func buildOpenAIResponseTools(toolDefinitions []map[string]any) ([]responses.ToolUnionParam, error) {
	tools := make([]responses.ToolUnionParam, 0, len(toolDefinitions))
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
		tool := responses.FunctionToolParam{
			Name:       name,
			Parameters: parameters,
			Strict:     param.NewOpt(true),
		}
		if description := strings.TrimSpace(stringValue(function["description"])); description != "" {
			tool.Description = openai.String(description)
		}
		tools = append(tools, responses.ToolUnionParam{OfFunction: &tool})
	}
	return tools, nil
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

func buildOpenAIResponseReasoning(request agentruns.ExecutionRequest) (shared.ReasoningParam, bool, error) {
	effort, enabled, err := resolveThinkingReasoningEffort(request)
	if err != nil {
		return shared.ReasoningParam{}, false, err
	}
	if !enabled {
		return shared.ReasoningParam{}, false, nil
	}
	return shared.ReasoningParam{
		Effort:  effort,
		Summary: shared.ReasoningSummaryAuto,
	}, true, nil
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

func buildResponseUsagePayload(usage responses.ResponseUsage) map[string]any {
	payload := map[string]any{
		"prompt_tokens":     usage.InputTokens,
		"completion_tokens": usage.OutputTokens,
		"total_tokens":      usage.TotalTokens,
		"input_tokens":      usage.InputTokens,
		"output_tokens":     usage.OutputTokens,
	}
	if usage.InputTokensDetails.CachedTokens > 0 {
		payload["cached_input_tokens"] = usage.InputTokensDetails.CachedTokens
	}
	if usage.OutputTokensDetails.ReasoningTokens > 0 {
		payload["reasoning_output_tokens"] = usage.OutputTokensDetails.ReasoningTokens
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
