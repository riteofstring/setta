package managedllm

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"google.golang.org/genai"
	"setta/internal/agentruns"
	"setta/internal/mcpx"
	"setta/internal/realtime"
)

const defaultGeminiBaseURL = "https://generativelanguage.googleapis.com/"

var geminiConfigKeyAliases = map[string]string{
	"top_p":                "topP",
	"top_k":                "topK",
	"candidate_count":      "candidateCount",
	"max_output_tokens":    "maxOutputTokens",
	"max_tokens":           "maxOutputTokens",
	"stop_sequences":       "stopSequences",
	"presence_penalty":     "presencePenalty",
	"frequency_penalty":    "frequencyPenalty",
	"response_mime_type":   "responseMIMEType",
	"response_schema":      "responseSchema",
	"response_json_schema": "responseJsonSchema",
	"safety_settings":      "safetySettings",
	"tool_config":          "toolConfig",
	"thinking_config":      "thinkingConfig",
}

var geminiSkippedConfigKeys = map[string]struct{}{
	"":                    {},
	"model":               {},
	"messages":            {},
	"stream":              {},
	"api_key":             {},
	"custom_llm_provider": {},
	"api_base":            {},
	"tools":               {},
	"tool_choice":         {},
	"functions":           {},
	"function_call":       {},
	"thinking":            {},
	"thinkingConfig":      {},
}

type geminiStreamState struct {
	toolCallIndexes map[string]int
	nextToolIndex   int
}

func buildGeminiClient(request agentruns.ExecutionRequest, httpClient *http.Client) (*genai.Client, error) {
	apiKey, err := resolveGeminiAPIKey(request)
	if err != nil {
		return nil, err
	}
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey:     apiKey,
		Backend:    genai.BackendGeminiAPI,
		HTTPClient: httpClient,
		HTTPOptions: genai.HTTPOptions{
			BaseURL: resolveGeminiBaseURL(request),
		},
	})
	if err != nil {
		return nil, err
	}
	return client, nil
}

func resolveGeminiAPIKey(request agentruns.ExecutionRequest) (string, error) {
	if strings.TrimSpace(request.LLMConfig.APIKeyEnv) == "" {
		return "", fmt.Errorf(
			"%w: gemini provider requires explicit api_key_env to avoid ambient SDK env fallback",
			ErrAPIKeyRequired,
		)
	}
	return resolveAPIKey(request)
}

func resolveGeminiBaseURL(request agentruns.ExecutionRequest) string {
	baseURL := strings.TrimSpace(request.LLMConfig.BaseURL)
	if rawBaseURL, ok := request.RequestParams["api_base"]; ok {
		if explicit := strings.TrimSpace(stringValue(rawBaseURL)); explicit != "" {
			baseURL = explicit
		}
	}
	if baseURL == "" {
		baseURL = defaultGeminiBaseURL
	}
	return baseURL
}

func buildGeminiGenerateContentConfig(
	request agentruns.ExecutionRequest,
	systemPrompt string,
	toolDefinitions []map[string]any,
) (*genai.GenerateContentConfig, error) {
	config, err := decodeGeminiGenerateContentConfig(buildGeminiConfigPayload(request.RequestParams))
	if err != nil {
		return nil, err
	}
	applyGeminiSystemInstruction(config, systemPrompt)
	if err := applyGeminiToolDefinitions(config, toolDefinitions); err != nil {
		return nil, err
	}
	if err := applyGeminiThinkingSettings(config, request); err != nil {
		return nil, err
	}
	return config, nil
}

func buildGeminiConfigPayload(params map[string]any) map[string]any {
	payload := map[string]any{}
	for key, value := range params {
		normalizedKey := normalizeGeminiConfigKey(strings.TrimSpace(key))
		if shouldSkipGeminiConfigKey(normalizedKey) {
			continue
		}
		payload[normalizedKey] = cloneJSONValue(value)
	}
	return payload
}

func shouldSkipGeminiConfigKey(normalizedKey string) bool {
	_, skip := geminiSkippedConfigKeys[normalizedKey]
	return skip
}

func decodeGeminiGenerateContentConfig(payload map[string]any) (*genai.GenerateContentConfig, error) {
	config := &genai.GenerateContentConfig{}
	if len(payload) == 0 {
		return config, nil
	}
	rawPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode gemini config payload: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(rawPayload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(config); err != nil {
		return nil, fmt.Errorf("decode gemini config payload: %w", err)
	}
	return config, nil
}

func applyGeminiSystemInstruction(config *genai.GenerateContentConfig, systemPrompt string) {
	if strings.TrimSpace(systemPrompt) == "" {
		return
	}
	config.SystemInstruction = genai.NewContentFromText(systemPrompt, genai.RoleUser)
}

func applyGeminiToolDefinitions(config *genai.GenerateContentConfig, toolDefinitions []map[string]any) error {
	if len(toolDefinitions) == 0 {
		return nil
	}
	tools, err := buildGeminiTools(toolDefinitions)
	if err != nil {
		return err
	}
	config.Tools = tools
	if config.ToolConfig == nil {
		config.ToolConfig = &genai.ToolConfig{
			FunctionCallingConfig: &genai.FunctionCallingConfig{
				Mode: genai.FunctionCallingConfigModeAuto,
			},
		}
	}
	return nil
}

func applyGeminiThinkingSettings(config *genai.GenerateContentConfig, request agentruns.ExecutionRequest) error {
	thinkingConfig, enabled, err := resolveGeminiThinkingConfig(request)
	if err != nil {
		return err
	}
	if enabled {
		config.ThinkingConfig = thinkingConfig
	}
	return nil
}

func resolveGeminiThinkingConfig(request agentruns.ExecutionRequest) (*genai.ThinkingConfig, bool, error) {
	if !request.Thinking {
		return nil, false, nil
	}
	raw, ok := request.RequestParams["thinkingConfig"]
	if !ok {
		raw, ok = request.RequestParams["thinking_config"]
	}
	if !ok {
		return nil, false, unsupportedThinkingError(request)
	}
	payload, ok := cloneJSONValue(raw).(map[string]any)
	if !ok {
		return nil, false, fmt.Errorf("%w: gemini thinking_config must be an object", ErrReasoningUnsupported)
	}
	normalized := map[string]any{}
	for key, value := range payload {
		normalized[normalizeGeminiThinkingConfigKey(strings.TrimSpace(key))] = normalizeGeminiThinkingConfigValue(
			strings.TrimSpace(key),
			value,
		)
	}
	config := &genai.ThinkingConfig{}
	rawPayload, err := json.Marshal(normalized)
	if err != nil {
		return nil, false, fmt.Errorf("encode gemini thinking config payload: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(rawPayload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(config); err != nil {
		return nil, false, fmt.Errorf("%w: invalid gemini thinking_config: %v", ErrReasoningUnsupported, err)
	}
	if config.ThinkingBudget != nil && *config.ThinkingBudget < 1 {
		return nil, false, fmt.Errorf("%w: gemini thinking_budget must be positive when thinking is enabled", ErrReasoningUnsupported)
	}
	if !isValidGeminiThinkingLevel(config.ThinkingLevel) {
		return nil, false, fmt.Errorf("%w: invalid gemini thinking_level %q", ErrReasoningUnsupported, config.ThinkingLevel)
	}
	// The frontend "thinking" control expects visible reasoning output, not only
	// hidden provider-side budgeting, so request thought blocks explicitly.
	config.IncludeThoughts = true
	return config, true, nil
}

func normalizeGeminiThinkingConfigKey(key string) string {
	switch key {
	case "include_thoughts":
		return "includeThoughts"
	case "thinking_budget":
		return "thinkingBudget"
	case "thinking_level":
		return "thinkingLevel"
	default:
		return key
	}
}

func normalizeGeminiThinkingConfigValue(key string, value any) any {
	switch normalizeGeminiThinkingConfigKey(strings.TrimSpace(key)) {
	case "thinkingLevel":
		switch strings.ToLower(strings.TrimSpace(stringValue(value))) {
		case "unspecified":
			return string(genai.ThinkingLevelUnspecified)
		case "low":
			return string(genai.ThinkingLevelLow)
		case "medium":
			return string(genai.ThinkingLevelMedium)
		case "high":
			return string(genai.ThinkingLevelHigh)
		case "minimal":
			return string(genai.ThinkingLevelMinimal)
		default:
			return cloneJSONValue(value)
		}
	default:
		return cloneJSONValue(value)
	}
}

func isValidGeminiThinkingLevel(level genai.ThinkingLevel) bool {
	switch level {
	case "",
		genai.ThinkingLevelUnspecified,
		genai.ThinkingLevelLow,
		genai.ThinkingLevelMedium,
		genai.ThinkingLevelHigh,
		genai.ThinkingLevelMinimal:
		return true
	default:
		return false
	}
}

func normalizeGeminiConfigKey(key string) string {
	trimmedKey := strings.TrimSpace(key)
	if normalizedKey, ok := geminiConfigKeyAliases[trimmedKey]; ok {
		return normalizedKey
	}
	return key
}

func buildGeminiTools(toolDefinitions []map[string]any) ([]*genai.Tool, error) {
	declarations := make([]*genai.FunctionDeclaration, 0, len(toolDefinitions))
	for index, definition := range toolDefinitions {
		function, _ := definition["function"].(map[string]any)
		name := strings.TrimSpace(stringValue(function["name"]))
		if name == "" {
			return nil, fmt.Errorf("%w: tool definition %d missing function name", ErrToolsUnsupported, index)
		}
		parameters := cloneJSONValue(function["parameters"])
		if parameters == nil {
			parameters = map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			}
		}
		declaration := &genai.FunctionDeclaration{
			Name:                 name,
			ParametersJsonSchema: parameters,
		}
		if description := strings.TrimSpace(stringValue(function["description"])); description != "" {
			declaration.Description = description
		}
		declarations = append(declarations, declaration)
	}
	return []*genai.Tool{
		{
			FunctionDeclarations: declarations,
		},
	}, nil
}

func buildGeminiContents(
	baseSystemPrompt string,
	providerMessages []map[string]any,
) ([]*genai.Content, string, error) {
	systemPrompt := strings.TrimSpace(baseSystemPrompt)
	contents := make([]*genai.Content, 0, len(providerMessages))
	for index, providerMessage := range providerMessages {
		content, extraSystemPrompt, include, err := buildGeminiContent(providerMessage)
		if err != nil {
			return nil, "", fmt.Errorf("%w: gemini message %d: %v", ErrHistoryUnsupported, index, err)
		}
		if strings.TrimSpace(extraSystemPrompt) != "" {
			if systemPrompt == "" {
				systemPrompt = extraSystemPrompt
			} else {
				systemPrompt += "\n\n" + extraSystemPrompt
			}
		}
		if include {
			contents = append(contents, content)
		}
	}
	return contents, systemPrompt, nil
}

func buildGeminiContent(message map[string]any) (*genai.Content, string, bool, error) {
	role := strings.TrimSpace(stringValue(message["role"]))
	switch role {
	case "system":
		return buildGeminiSystemContent(message["content"])
	case "user":
		return buildGeminiUserContent(message["content"])
	case "assistant":
		return buildGeminiAssistantContent(message)
	case "tool":
		return buildGeminiToolContent(message)
	default:
		return nil, "", false, fmt.Errorf("unsupported role %q", role)
	}
}

func buildGeminiSystemContent(raw any) (*genai.Content, string, bool, error) {
	content, include, err := normalizeProviderMessageContent(raw)
	if err != nil {
		return nil, "", false, err
	}
	if !include {
		return nil, "", false, nil
	}
	return nil, content, false, nil
}

func buildGeminiUserContent(raw any) (*genai.Content, string, bool, error) {
	parts, err := buildGeminiUserParts(raw)
	if err != nil {
		return nil, "", false, err
	}
	if len(parts) == 0 {
		return nil, "", false, nil
	}
	return genai.NewContentFromParts(parts, genai.RoleUser), "", true, nil
}

func buildGeminiAssistantContent(message map[string]any) (*genai.Content, string, bool, error) {
	parts, err := buildGeminiAssistantParts(message)
	if err != nil {
		return nil, "", false, err
	}
	if len(parts) == 0 {
		return nil, "", false, nil
	}
	return genai.NewContentFromParts(parts, genai.RoleModel), "", true, nil
}

func buildGeminiToolContent(message map[string]any) (*genai.Content, string, bool, error) {
	part, include, err := buildGeminiToolResponsePart(message)
	if err != nil {
		return nil, "", false, err
	}
	if !include {
		return nil, "", false, nil
	}
	return genai.NewContentFromParts([]*genai.Part{part}, genai.RoleUser), "", true, nil
}

func buildGeminiUserParts(raw any) ([]*genai.Part, error) {
	list, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("message content must be a list")
	}
	parts := make([]*genai.Part, 0, len(list))
	for index, entry := range list {
		block, ok := entry.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("content block %d must be an object", index)
		}
		switch strings.TrimSpace(stringValue(block["type"])) {
		case "", "text":
			text := strings.TrimSpace(stringValue(block["text"]))
			if text != "" {
				parts = append(parts, genai.NewPartFromText(text))
			}
		case "thinking":
			continue
		default:
			return nil, fmt.Errorf("content block type %q", stringValue(block["type"]))
		}
	}
	return parts, nil
}

func buildGeminiAssistantParts(message map[string]any) ([]*genai.Part, error) {
	contentParts, err := buildGeminiAssistantContentParts(message["content"])
	if err != nil {
		return nil, err
	}
	toolCallParts, err := buildGeminiAssistantToolCallParts(message)
	if err != nil {
		return nil, err
	}
	return append(contentParts, toolCallParts...), nil
}

func buildGeminiAssistantContentParts(raw any) ([]*genai.Part, error) {
	content, _ := raw.([]any)
	parts := make([]*genai.Part, 0, len(content))
	for index, entry := range content {
		part, include, err := buildGeminiAssistantContentPart(index, entry)
		if err != nil {
			return nil, err
		}
		if include {
			parts = append(parts, part)
		}
	}
	return parts, nil
}

func buildGeminiAssistantContentPart(index int, entry any) (*genai.Part, bool, error) {
	block, ok := entry.(map[string]any)
	if !ok {
		return nil, false, fmt.Errorf("assistant content block %d must be an object", index)
	}
	switch strings.TrimSpace(stringValue(block["type"])) {
	case "", "text":
		part := buildGeminiAssistantTextPart(block)
		return part, part != nil, nil
	case "thinking":
		return buildGeminiAssistantThinkingPart(block)
	default:
		return nil, false, fmt.Errorf("assistant content block type %q", stringValue(block["type"]))
	}
}

func buildGeminiAssistantTextPart(block map[string]any) *genai.Part {
	text := strings.TrimSpace(stringValue(block["text"]))
	if text == "" {
		return nil
	}
	return genai.NewPartFromText(text)
}

func buildGeminiAssistantThinkingPart(block map[string]any) (*genai.Part, bool, error) {
	thinking := stringValue(block["thinking"])
	signature := strings.TrimSpace(stringValue(block["signature"]))
	if strings.TrimSpace(thinking) == "" && signature == "" {
		return nil, false, nil
	}
	part := &genai.Part{
		Text:    thinking,
		Thought: true,
	}
	if signature != "" {
		part.ThoughtSignature = decodeGeminiThoughtSignature(signature)
	}
	return part, true, nil
}

func buildGeminiAssistantToolCallParts(message map[string]any) ([]*genai.Part, error) {
	toolCalls := assistantToolCalls(message)
	parts := make([]*genai.Part, 0, len(toolCalls))
	for _, toolCall := range toolCalls {
		part, err := buildGeminiAssistantToolCallPart(toolCall)
		if err != nil {
			return nil, err
		}
		parts = append(parts, part)
	}
	return parts, nil
}

func buildGeminiAssistantToolCallPart(toolCall map[string]any) (*genai.Part, error) {
	toolCallID := strings.TrimSpace(stringValue(toolCall["id"]))
	function, _ := toolCall["function"].(map[string]any)
	toolName := strings.TrimSpace(stringValue(function["name"]))
	if toolCallID == "" || toolName == "" {
		return nil, fmt.Errorf("%w: gemini assistant tool call requires id and name", ErrToolsUnsupported)
	}
	arguments, _ := function["arguments"].(map[string]any)
	if arguments == nil {
		arguments = map[string]any{}
	}
	return &genai.Part{
		FunctionCall: &genai.FunctionCall{
			ID:   toolCallID,
			Name: toolName,
			Args: cloneAnyMap(arguments),
		},
	}, nil
}

func buildGeminiToolResponsePart(message map[string]any) (*genai.Part, bool, error) {
	toolName := strings.TrimSpace(stringValue(message["tool_name"]))
	if toolName == "" {
		return nil, false, fmt.Errorf("%w: gemini tool response requires tool_name", ErrToolsUnsupported)
	}
	responsePayload := map[string]any{}
	if rawResult, ok := message["result"].(map[string]any); ok && rawResult != nil {
		responsePayload = cloneAnyMap(rawResult)
	} else {
		text, err := normalizeProviderToolResultContent(message["content"])
		if err != nil {
			return nil, false, err
		}
		if text != "" {
			responsePayload["output"] = text
		}
	}
	if len(responsePayload) == 0 {
		return nil, false, nil
	}
	return &genai.Part{
		FunctionResponse: &genai.FunctionResponse{
			ID:       strings.TrimSpace(stringValue(message["tool_call_id"])),
			Name:     toolName,
			Response: responsePayload,
		},
	}, true, nil
}

func decodeGeminiThoughtSignature(raw string) []byte {
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(raw))
	if err == nil {
		return decoded
	}
	return []byte(raw)
}

func (e *Executor) consumeGeminiStream(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	systemPrompt string,
	providerMessages []map[string]any,
	request agentruns.ExecutionRequest,
) (map[string]any, error) {
	contents, mergedSystemPrompt, err := buildGeminiContents(systemPrompt, providerMessages)
	if err != nil {
		return nil, err
	}
	config, err := buildGeminiGenerateContentConfig(request, mergedSystemPrompt, prepared.toolDefinitions)
	if err != nil {
		return nil, err
	}

	accumulator := newToolCallAccumulator()
	previewAccumulator := newToolPreviewAccumulator()
	streamState := &geminiStreamState{
		toolCallIndexes: map[string]int{},
	}
	var usage map[string]any
	for response, streamErr := range prepared.geminiClient.Models.GenerateContentStream(
		ctx,
		prepared.model,
		contents,
		config,
	) {
		if ctx.Err() != nil {
			return usage, context.Canceled
		}
		if streamErr != nil {
			return usage, wrapGeminiProviderError(streamErr)
		}
		nextUsage, err := e.processGeminiResponseChunk(
			ctx,
			response,
			prepared,
			assistantMessage,
			accumulator,
			previewAccumulator,
			streamState,
		)
		if err != nil {
			return usage, err
		}
		if nextUsage != nil {
			usage = nextUsage
		}
	}
	if finalizeErr := finalizeAssistantToolCalls(assistantMessage, accumulator); finalizeErr != nil {
		return usage, finalizeErr
	}
	return usage, nil
}

func (e *Executor) processGeminiResponseChunk(
	ctx context.Context,
	response *genai.GenerateContentResponse,
	prepared preparedExecution,
	assistantMessage map[string]any,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
	streamState *geminiStreamState,
) (map[string]any, error) {
	if response == nil {
		return nil, nil
	}
	usage := buildGeminiUsagePayload(response.UsageMetadata)
	candidate, err := geminiPrimaryCandidate(response)
	if err != nil || candidate == nil {
		return usage, err
	}
	for _, part := range candidate.Content.Parts {
		if err := e.processGeminiResponsePart(
			ctx,
			part,
			prepared,
			assistantMessage,
			accumulator,
			previewAccumulator,
			streamState,
		); err != nil {
			return usage, err
		}
	}
	return usage, nil
}

func geminiPrimaryCandidate(response *genai.GenerateContentResponse) (*genai.Candidate, error) {
	if response == nil {
		return nil, nil
	}
	if len(response.Candidates) == 0 {
		if response.PromptFeedback != nil && response.PromptFeedback.BlockReason != "" {
			return nil, fmt.Errorf(
				"managed llm provider request failed: prompt blocked (%s)",
				response.PromptFeedback.BlockReason,
			)
		}
		return nil, nil
	}
	candidate := response.Candidates[0]
	if candidate == nil || candidate.Content == nil {
		return nil, nil
	}
	return candidate, nil
}

func (e *Executor) processGeminiResponsePart(
	ctx context.Context,
	part *genai.Part,
	prepared preparedExecution,
	assistantMessage map[string]any,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
	streamState *geminiStreamState,
) error {
	if part == nil {
		return nil
	}
	switch {
	case part.FunctionCall != nil:
		return e.processGeminiFunctionCallPart(
			ctx,
			part.FunctionCall,
			prepared,
			assistantMessage,
			accumulator,
			previewAccumulator,
			streamState,
		)
	case part.Thought && (part.Text != "" || len(part.ThoughtSignature) > 0):
		return e.processGeminiThinkingPart(ctx, part, prepared, assistantMessage)
	case part.Text != "":
		return e.processGeminiTextPart(ctx, part.Text, prepared, assistantMessage)
	default:
		return nil
	}
}

func (e *Executor) processGeminiThinkingPart(
	ctx context.Context,
	part *genai.Part,
	prepared preparedExecution,
	assistantMessage map[string]any,
) error {
	signature := geminiThoughtSignatureString(part)
	if signature != "" {
		setAssistantThinkingSignatureAtIndex(assistantMessage, 0, signature)
	}
	if part.Text != "" {
		appendAssistantThinkingAtIndex(assistantMessage, 0, part.Text)
	}
	return e.emitGeminiThinkingDelta(ctx, prepared, assistantMessage, 0, part.Text, optionalStringPointer(signature))
}

func geminiThoughtSignatureString(part *genai.Part) string {
	if part == nil || len(part.ThoughtSignature) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(part.ThoughtSignature)
}

func (e *Executor) processGeminiTextPart(
	ctx context.Context,
	text string,
	prepared preparedExecution,
	assistantMessage map[string]any,
) error {
	textIndex := 0
	if hasMessageThinking(assistantMessage) {
		textIndex = 1
	}
	appendAssistantTextAtIndex(assistantMessage, textIndex, text)
	return e.emitGeminiTextDelta(ctx, prepared, assistantMessage, textIndex, text)
}

type geminiFunctionCallPayload struct {
	EncodedArguments string
	ToolCallID       string
	ToolName         string
	Index            int
}

func (e *Executor) processGeminiFunctionCallPart(
	ctx context.Context,
	functionCall *genai.FunctionCall,
	prepared preparedExecution,
	assistantMessage map[string]any,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
	streamState *geminiStreamState,
) error {
	call, err := prepareGeminiFunctionCallPayload(functionCall, streamState)
	if err != nil {
		return err
	}
	state := accumulator.apply(call.Index, call.ToolCallID, "", call.ToolName, call.EncodedArguments)
	if err := e.emitGeminiFunctionCallDelta(ctx, prepared, assistantMessage, state, call); err != nil {
		return err
	}
	return e.emitGeminiFunctionCallPreview(ctx, prepared, assistantMessage, state, previewAccumulator, call)
}

func prepareGeminiFunctionCallPayload(functionCall *genai.FunctionCall, streamState *geminiStreamState) (geminiFunctionCallPayload, error) {
	if functionCall == nil {
		return geminiFunctionCallPayload{}, nil
	}
	toolName := strings.TrimSpace(functionCall.Name)
	if toolName == "" {
		return geminiFunctionCallPayload{}, fmt.Errorf("%w: gemini function call name is required", ErrToolsUnsupported)
	}
	toolCallID := strings.TrimSpace(functionCall.ID)
	if toolCallID == "" {
		toolCallID = fmt.Sprintf("gemini-tool-call-%d", streamState.nextToolIndex)
	}
	arguments := cloneAnyMap(functionCall.Args)
	if arguments == nil {
		arguments = map[string]any{}
	}
	encodedArguments, err := json.Marshal(arguments)
	if err != nil {
		return geminiFunctionCallPayload{}, fmt.Errorf("%w: encode gemini tool call arguments: %v", ErrToolsUnsupported, err)
	}
	return geminiFunctionCallPayload{
		EncodedArguments: string(encodedArguments),
		ToolCallID:       toolCallID,
		ToolName:         toolName,
		Index:            streamState.toolCallIndex(toolCallID),
	}, nil
}

func (e *Executor) emitGeminiFunctionCallDelta(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	state *toolCallState,
	call geminiFunctionCallPayload,
) error {
	if !prepared.emitStream || state == nil {
		return nil
	}
	if err := e.applyChunk(ctx, prepared, realtime.ToolCallDeltaEvent{
		Type:           realtime.StreamingEventTypeToolCallDelta,
		MessageID:      stringValue(assistantMessage["id"]),
		ToolCallID:     call.ToolCallID,
		ArgumentsDelta: call.EncodedArguments,
		ToolName:       optionalStringPointer(call.ToolName),
	}); err != nil {
		return err
	}
	return nil
}

func (e *Executor) emitGeminiFunctionCallPreview(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	state *toolCallState,
	previewAccumulator *toolPreviewAccumulator,
	call geminiFunctionCallPayload,
) error {
	if !prepared.emitStream || state == nil {
		return nil
	}
	descriptor, ok := prepared.availableTools[mcpx.NormalizeToolName(call.ToolName)]
	if !ok || descriptor.Metadata == nil || descriptor.Metadata.ToolArgumentPreview == nil {
		return nil
	}
	previewEvent, err := previewAccumulator.buildEvent(
		stringValue(assistantMessage["id"]),
		state,
		descriptor.Metadata.ToolArgumentPreview,
		call.EncodedArguments,
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

func (s *geminiStreamState) toolCallIndex(toolCallID string) int {
	if index, ok := s.toolCallIndexes[toolCallID]; ok {
		return index
	}
	index := s.nextToolIndex
	s.toolCallIndexes[toolCallID] = index
	s.nextToolIndex++
	return index
}

func (e *Executor) emitGeminiTextDelta(
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

func (e *Executor) emitGeminiThinkingDelta(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	index int,
	thinking string,
	signature *string,
) error {
	if !prepared.emitStream || (thinking == "" && (signature == nil || strings.TrimSpace(*signature) == "")) {
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

func buildGeminiUsagePayload(usage *genai.GenerateContentResponseUsageMetadata) map[string]any {
	if usage == nil {
		return nil
	}
	payload := map[string]any{
		"prompt_tokens":     usage.PromptTokenCount,
		"completion_tokens": usage.CandidatesTokenCount,
		"total_tokens":      usage.TotalTokenCount,
		"input_tokens":      usage.PromptTokenCount,
		"output_tokens":     usage.CandidatesTokenCount,
	}
	if usage.ToolUsePromptTokenCount > 0 {
		payload["tool_use_prompt_tokens"] = usage.ToolUsePromptTokenCount
	}
	if usage.ThoughtsTokenCount > 0 {
		payload["reasoning_output_tokens"] = usage.ThoughtsTokenCount
	}
	return payload
}

func wrapGeminiProviderError(err error) error {
	if err == nil {
		return nil
	}
	var apiErr genai.APIError
	if errors.As(err, &apiErr) {
		detail := strings.TrimSpace(apiErr.Message)
		if detail == "" {
			detail = strings.TrimSpace(apiErr.Status)
		}
		if detail == "" {
			detail = fmt.Sprintf("gemini request failed with status %d", apiErr.Code)
		}
		return fmt.Errorf("managed llm provider request failed: %s", detail)
	}
	return fmt.Errorf("managed llm provider request failed: %w", err)
}
