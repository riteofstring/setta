package managedllm

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/realtime"
)

const (
	openAIProvider        = "openai"
	defaultOpenAIBaseURL  = "https://api.openai.com/v1"
	managedChatRunType    = "llm_chat"
	maxProviderErrorBytes = 4096
)

var (
	ErrProviderUnsupported    = errors.New("managed llm provider is not supported")
	ErrReasoningUnsupported   = errors.New("managed llm reasoning is not supported without explicit provider-native config")
	ErrToolsUnsupported       = errors.New("managed llm tools are not supported")
	ErrAttachmentsUnsupported = errors.New("managed llm attachments are not supported")
	ErrHistoryUnsupported     = errors.New("managed llm chat history is not supported")
	ErrAPIKeyRequired         = errors.New("managed llm api key is required")
	ErrModelRequired          = errors.New("managed llm model is required")
)

type ExecutorOptions struct {
	Live       *managedchat.LiveRuntime
	Tools      ToolClient
	HTTPClient *http.Client
}

type Executor struct {
	live       *managedchat.LiveRuntime
	tools      ToolClient
	httpClient *http.Client
}

type preparedExecution struct {
	endpoint             string
	apiKey               string
	projectConfigID      *string
	sectionID            *string
	chatID               string
	runID                string
	emitStream           bool
	requestOptions       map[string]any
	transcript           []map[string]any
	providerMessages     []map[string]any
	toolDefinitions      []map[string]any
	availableTools       map[string]mcpx.ToolDescriptor
	toolAllowlist        *toolAllowlist
	temporaryToCanonical map[string]string
}

type openAIStreamChunk struct {
	Choices []struct {
		Index int `json:"index"`
		Delta struct {
			Content   any                   `json:"content"`
			ToolCalls []openAIToolCallDelta `json:"tool_calls"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Usage map[string]any `json:"usage"`
}

type openAIToolCallDelta struct {
	Index    int    `json:"index"`
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments any    `json:"arguments"`
	} `json:"function"`
}

func NewExecutor(options ExecutorOptions) *Executor {
	httpClient := options.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Executor{
		live:       options.Live,
		tools:      options.Tools,
		httpClient: httpClient,
	}
}

func (e *Executor) Execute(ctx context.Context, request agentruns.ExecutionRequest) (agentruns.ExecutionResult, error) {
	prepared, err := e.prepareExecution(request)
	if err != nil {
		return agentruns.ExecutionResult{}, err
	}
	return e.executeConversation(ctx, prepared, request)
}

func (e *Executor) Validate(request agentruns.ExecutionRequest) error {
	return validateReasoningRequest(request)
}

func (e *Executor) prepareExecution(request agentruns.ExecutionRequest) (preparedExecution, error) {
	provider := strings.ToLower(strings.TrimSpace(request.LLMConfig.Provider))
	if provider != openAIProvider {
		return preparedExecution{}, fmt.Errorf("%w: %q", ErrProviderUnsupported, provider)
	}
	if strings.TrimSpace(request.LLMConfig.Model) == "" {
		return preparedExecution{}, ErrModelRequired
	}
	if err := validateReasoningRequest(request); err != nil {
		return preparedExecution{}, err
	}

	endpoint, err := resolveChatCompletionsEndpoint(request)
	if err != nil {
		return preparedExecution{}, err
	}
	apiKey, err := resolveAPIKey(request)
	if err != nil {
		return preparedExecution{}, err
	}

	transcript, providerMessages, err := buildMessages(request)
	if err != nil {
		return preparedExecution{}, err
	}
	toolDefinitions, availableTools, allowlist, err := buildToolDefinitions(request, e.tools)
	if err != nil {
		return preparedExecution{}, err
	}
	temporaryToCanonical, err := resolveTemporaryToCanonical(request)
	if err != nil {
		return preparedExecution{}, err
	}

	requestOptions := map[string]any{
		"model":  request.LLMConfig.Model,
		"stream": true,
		"stream_options": map[string]any{
			"include_usage": true,
		},
	}
	for key, value := range request.RequestParams {
		switch strings.TrimSpace(key) {
		case "", "model", "messages", "stream", "stream_options", "api_key", "custom_llm_provider", "api_base", "tools", "tool_choice", "functions", "function_call":
			continue
		default:
			requestOptions[key] = cloneJSONValue(value)
		}
	}

	return preparedExecution{
		endpoint:             endpoint,
		apiKey:               apiKey,
		projectConfigID:      optionalStringPointer(request.ProjectConfigID),
		sectionID:            cloneStringPointer(request.SectionID),
		chatID:               strings.TrimSpace(request.ChatID),
		runID:                strings.TrimSpace(request.Run.ID),
		emitStream:           shouldEmitManagedChatStream(request),
		requestOptions:       requestOptions,
		transcript:           transcript,
		providerMessages:     providerMessages,
		toolDefinitions:      toolDefinitions,
		availableTools:       availableTools,
		toolAllowlist:        allowlist,
		temporaryToCanonical: temporaryToCanonical,
	}, nil
}

func validateReasoningRequest(request agentruns.ExecutionRequest) error {
	if request.Thinking && !hasExplicitReasoningConfig(request.RequestParams) {
		return ErrReasoningUnsupported
	}
	return nil
}

func (e *Executor) executeConversation(ctx context.Context, prepared preparedExecution, request agentruns.ExecutionRequest) (agentruns.ExecutionResult, error) {
	transcript := cloneMessageSlice(prepared.transcript)
	providerMessages := cloneMessageSlice(prepared.providerMessages)
	toolCalls := []map[string]any{}
	var usage map[string]any

	for round := 0; round < maxToolCallRounds; round++ {
		assistantMessage := newAssistantMessage()
		turnUsage, err := e.executeTurn(ctx, prepared, assistantMessage, providerMessages)
		if turnUsage != nil {
			usage = turnUsage
		}
		if err != nil {
			if shouldPersistMessage(assistantMessage) {
				transcript = append(transcript, cloneMessage(assistantMessage))
			}
			result := e.buildResult(transcript, toolCalls, usage)
			if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
				return result, context.Canceled
			}
			return result, err
		}

		if shouldPersistMessage(assistantMessage) {
			transcript = append(transcript, cloneMessage(assistantMessage))
			providerPayload, include, payloadErr := providerPayloadForMessage(assistantMessage)
			if payloadErr != nil {
				return e.buildResult(transcript, toolCalls, usage), payloadErr
			}
			if include {
				providerMessages = append(providerMessages, providerPayload)
			}
		}

		assistantTurnToolCalls := assistantToolCalls(assistantMessage)
		if len(assistantTurnToolCalls) == 0 {
			return e.buildResult(transcript, toolCalls, usage), nil
		}
		toolCalls = append(toolCalls, cloneToolCallMaps(assistantTurnToolCalls)...)

		toolMessages, providerToolMessages, toolErr := e.executeToolCalls(ctx, prepared, request, assistantTurnToolCalls)
		if toolErr != nil {
			return e.buildResult(transcript, toolCalls, usage), toolErr
		}
		for _, toolMessage := range toolMessages {
			transcript = append(transcript, cloneMessage(toolMessage))
		}
		providerMessages = append(providerMessages, providerToolMessages...)
	}

	return e.buildResult(transcript, toolCalls, usage), ErrToolLoopLimitExceeded
}

func (e *Executor) executeTurn(ctx context.Context, prepared preparedExecution, assistantMessage map[string]any, providerMessages []map[string]any) (map[string]any, error) {
	requestBody := cloneAnyMap(prepared.requestOptions)
	requestBody["messages"] = messagesToAnyList(providerMessages)
	if len(prepared.toolDefinitions) > 0 {
		requestBody["tools"] = messagesToAnyList(prepared.toolDefinitions)
	}

	if prepared.emitStream {
		if err := e.applyChunk(ctx, prepared, realtime.MessageStartEvent{
			Type:    realtime.StreamingEventTypeMessageStart,
			Message: cloneMessage(assistantMessage),
		}); err != nil {
			return nil, err
		}
	}

	body, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("encode managed llm request: %w", err)
	}
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, prepared.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create managed llm request: %w", err)
	}
	httpRequest.Header.Set("Authorization", "Bearer "+prepared.apiKey)
	httpRequest.Header.Set("Content-Type", "application/json")

	response, err := e.httpClient.Do(httpRequest)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			if err := e.finishStream(ctx, prepared, assistantMessage, true); err != nil {
				return nil, err
			}
			return nil, context.Canceled
		}
		return nil, fmt.Errorf("send managed llm request: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		bodyBytes, _ := io.ReadAll(io.LimitReader(response.Body, maxProviderErrorBytes))
		detail := strings.TrimSpace(string(bodyBytes))
		if detail == "" {
			detail = response.Status
		}
		return nil, fmt.Errorf("managed llm provider request failed: %s", detail)
	}

	usage, err := e.consumeSSE(ctx, response.Body, prepared, assistantMessage)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			if finishErr := e.finishStream(ctx, prepared, assistantMessage, true); finishErr != nil {
				return usage, finishErr
			}
			return usage, context.Canceled
		}
		return usage, err
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		if err := e.finishStream(ctx, prepared, assistantMessage, true); err != nil {
			return usage, err
		}
		return usage, context.Canceled
	}
	if err := e.finishStream(ctx, prepared, assistantMessage, false); err != nil {
		return usage, err
	}
	return usage, nil
}

func (e *Executor) consumeSSE(ctx context.Context, reader io.Reader, prepared preparedExecution, assistantMessage map[string]any) (map[string]any, error) {
	buffered := bufio.NewReader(reader)
	lines := []string{}
	var usage map[string]any
	accumulator := newToolCallAccumulator()
	previewAccumulator := newToolPreviewAccumulator()

	for {
		select {
		case <-ctx.Done():
			return usage, context.Canceled
		default:
		}

		line, err := buffered.ReadString('\n')
		if len(line) > 0 {
			trimmedLine := strings.TrimRight(line, "\r\n")
			if trimmedLine == "" {
				done, nextUsage, processErr := e.processSSEEvent(ctx, lines, prepared, assistantMessage, accumulator, previewAccumulator)
				if nextUsage != nil {
					usage = nextUsage
				}
				if processErr != nil {
					return usage, processErr
				}
				lines = lines[:0]
				if done {
					if finalizeErr := finalizeAssistantToolCalls(assistantMessage, accumulator); finalizeErr != nil {
						return usage, finalizeErr
					}
					return usage, nil
				}
			} else {
				lines = append(lines, trimmedLine)
			}
		}

		if err == nil {
			continue
		}
		if errors.Is(err, io.EOF) {
			if len(lines) == 0 {
				if finalizeErr := finalizeAssistantToolCalls(assistantMessage, accumulator); finalizeErr != nil {
					return usage, finalizeErr
				}
				return usage, nil
			}
			done, nextUsage, processErr := e.processSSEEvent(ctx, lines, prepared, assistantMessage, accumulator, previewAccumulator)
			if nextUsage != nil {
				usage = nextUsage
			}
			if processErr != nil {
				return usage, processErr
			}
			if done {
				if finalizeErr := finalizeAssistantToolCalls(assistantMessage, accumulator); finalizeErr != nil {
					return usage, finalizeErr
				}
				return usage, nil
			}
			if finalizeErr := finalizeAssistantToolCalls(assistantMessage, accumulator); finalizeErr != nil {
				return usage, finalizeErr
			}
			return usage, nil
		}
		return usage, fmt.Errorf("read managed llm stream: %w", err)
	}
}

func (e *Executor) processSSEEvent(ctx context.Context, lines []string, prepared preparedExecution, assistantMessage map[string]any, accumulator *toolCallAccumulator, previewAccumulator *toolPreviewAccumulator) (bool, map[string]any, error) {
	if len(lines) == 0 {
		return false, nil, nil
	}
	data := collectSSEData(lines)
	if data == "" {
		return false, nil, nil
	}
	if data == "[DONE]" {
		return true, nil, nil
	}

	var chunk openAIStreamChunk
	if err := json.Unmarshal([]byte(data), &chunk); err != nil {
		return false, nil, fmt.Errorf("decode managed llm stream chunk: %w", err)
	}
	if chunk.Usage != nil {
		usage := cloneAnyMap(chunk.Usage)
		return false, usage, nil
	}
	for _, choice := range chunk.Choices {
		text := normalizeChunkText(choice.Delta.Content)
		if text != "" {
			appendAssistantText(assistantMessage, text)
		}
		if prepared.emitStream && text != "" {
			if err := e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
				Type:      realtime.StreamingEventTypeDelta,
				MessageID: stringValue(assistantMessage["id"]),
				Content: []any{
					realtime.MessageTextDelta{
						Type:  realtime.MessageContentTypeTextDelta,
						Index: 0,
						Text:  text,
					},
				},
			}); err != nil {
				return false, nil, err
			}
		}
		for _, toolCall := range choice.Delta.ToolCalls {
			argumentsDelta := stringValue(toolCall.Function.Arguments)
			state := accumulator.apply(toolCall.Index, toolCall.ID, toolCall.Function.Name, argumentsDelta)
			if !prepared.emitStream || state == nil {
				continue
			}
			var toolName *string
			if strings.TrimSpace(state.name) != "" {
				toolName = optionalStringPointer(state.name)
			}
			if err := e.applyChunk(ctx, prepared, realtime.ToolCallDeltaEvent{
				Type:           realtime.StreamingEventTypeToolCallDelta,
				MessageID:      stringValue(assistantMessage["id"]),
				ToolCallID:     strings.TrimSpace(state.id),
				ArgumentsDelta: argumentsDelta,
				ToolName:       toolName,
			}); err != nil {
				return false, nil, err
			}
			descriptor, ok := prepared.availableTools[mcpx.NormalizeToolName(state.name)]
			if !ok || descriptor.Metadata == nil || descriptor.Metadata.ToolArgumentPreview == nil {
				continue
			}
			previewEvent, err := previewAccumulator.buildEvent(
				stringValue(assistantMessage["id"]),
				state,
				descriptor.Metadata.ToolArgumentPreview,
				argumentsDelta,
				prepared.temporaryToCanonical,
			)
			if err != nil {
				return false, nil, err
			}
			if previewEvent == nil {
				continue
			}
			if err := e.applyChunk(ctx, prepared, *previewEvent); err != nil {
				return false, nil, err
			}
		}
	}
	return false, nil, nil
}

func (e *Executor) applyChunk(ctx context.Context, prepared preparedExecution, chunk any) error {
	if e.live == nil || !prepared.emitStream {
		return nil
	}
	return e.live.ApplyChunk(ctx, managedchat.StreamChunkParams{
		RunID:           prepared.runID,
		ChatID:          prepared.chatID,
		ProjectConfigID: cloneStringPointer(prepared.projectConfigID),
		SectionID:       cloneStringPointer(prepared.sectionID),
		Chunk:           chunk,
	})
}

func (e *Executor) buildResult(transcript []map[string]any, toolCalls []map[string]any, usage map[string]any) agentruns.ExecutionResult {
	outputs := map[string]any{
		"messages": messagesToAnyList(transcript),
	}
	if usage != nil {
		outputs["usage"] = cloneAnyMap(usage)
	}
	return agentruns.ExecutionResult{
		Outputs:   outputs,
		ToolCalls: cloneToolCallMaps(toolCalls),
	}
}

func (e *Executor) finishStream(ctx context.Context, prepared preparedExecution, assistantMessage map[string]any, cancelled bool) error {
	if !prepared.emitStream {
		return nil
	}
	if err := e.applyChunk(ctx, prepared, realtime.MessageStopEvent{
		Type:      realtime.StreamingEventTypeMessageStop,
		MessageID: stringValue(assistantMessage["id"]),
	}); err != nil {
		return err
	}
	if cancelled && !shouldPersistMessage(assistantMessage) {
		return nil
	}
	return e.applyChunk(ctx, prepared, realtime.MessageFinalizedEvent{
		Type:    realtime.StreamingEventTypeMessageFinalized,
		Message: cloneMessage(assistantMessage),
	})
}

func finalizeAssistantToolCalls(message map[string]any, accumulator *toolCallAccumulator) error {
	if message == nil || accumulator == nil {
		return nil
	}
	toolCalls, err := accumulator.finalize()
	if err != nil {
		return err
	}
	if len(toolCalls) == 0 {
		return nil
	}
	message["tool_calls"] = messagesToAnyList(toolCalls)
	return nil
}

func (e *Executor) executeToolCalls(ctx context.Context, prepared preparedExecution, request agentruns.ExecutionRequest, toolCalls []map[string]any) ([]map[string]any, []map[string]any, error) {
	toolMessages := make([]map[string]any, 0, len(toolCalls))
	providerMessages := make([]map[string]any, 0, len(toolCalls))
	for _, toolCall := range toolCalls {
		toolCallID := strings.TrimSpace(stringValue(toolCall["id"]))
		function, _ := toolCall["function"].(map[string]any)
		toolName := strings.TrimSpace(stringValue(function["name"]))
		arguments, _ := function["arguments"].(map[string]any)
		if arguments == nil {
			arguments = map[string]any{}
		}

		var result mcpx.ToolCallResult
		if toolName == "" {
			result = buildMissingToolResult(toolName)
		} else if prepared.availableTools != nil {
			if _, ok := prepared.availableTools[mcpx.NormalizeToolName(toolName)]; !ok {
				result = buildMissingToolResult(toolName)
			} else if !isToolAllowed(toolName, prepared.toolAllowlist, request.CompletionGuardEnabled) {
				result = buildDisallowedToolResult(toolName)
			} else {
				if e.tools == nil {
					return nil, nil, fmt.Errorf("%w: MCP tool client is unavailable", ErrToolsUnsupported)
				}
				resultValue, err := e.tools.CallToolWithMeta(ctx, toolName, cloneAnyMap(arguments), buildToolRequestMeta(request, toolName))
				if err != nil {
					return nil, nil, fmt.Errorf("execute managed MCP tool %q: %w", toolName, err)
				}
				result = resultValue
			}
		} else {
			result = buildDisallowedToolResult(toolName)
		}

		toolMessage := buildToolResultMessage(toolCallID, toolName, arguments, result)
		toolMessages = append(toolMessages, toolMessage)
		if prepared.emitStream {
			if err := e.applyChunk(ctx, prepared, realtime.ToolResultEvent{
				Type:   realtime.StreamingEventTypeToolResult,
				Result: cloneMessage(toolMessage),
			}); err != nil {
				return nil, nil, err
			}
		}

		payload, include, err := providerPayloadForMessage(toolMessage)
		if err != nil {
			return nil, nil, err
		}
		if include {
			providerMessages = append(providerMessages, payload)
		}
	}
	return toolMessages, providerMessages, nil
}

func shouldPersistMessage(message map[string]any) bool {
	if message == nil {
		return false
	}
	if hasMessageText(message) {
		return true
	}
	if hasNonEmptyToolCalls(message["tool_calls"]) {
		return true
	}
	return strings.TrimSpace(stringValue(message["role"])) == "tool"
}

func providerPayloadForMessage(message map[string]any) (map[string]any, bool, error) {
	_, payload, include, err := normalizeTranscriptMessage(message)
	return payload, include, err
}

func buildMessages(request agentruns.ExecutionRequest) ([]map[string]any, []map[string]any, error) {
	systemPrompt := strings.TrimSpace(request.SystemPrompt)
	providerMessages := []map[string]any{
		{
			"role":    "system",
			"content": systemPrompt,
		},
	}
	transcript := []map[string]any{}

	if rawMessages, ok := request.Inputs["messages"]; ok {
		messages, providerPayloads, err := parseTranscriptMessages(rawMessages)
		if err != nil {
			return nil, nil, err
		}
		transcript = append(transcript, messages...)
		providerMessages = append(providerMessages, providerPayloads...)
	}
	if rawPrompt, ok := request.Inputs["prompt"]; ok {
		prompt, ok := rawPrompt.(string)
		if !ok {
			return nil, nil, fmt.Errorf("%w: prompt must be a string", agentruns.ErrInvalidRunInput)
		}
		trimmed := strings.TrimSpace(prompt)
		if trimmed != "" {
			userMessage := map[string]any{
				"id":   newMessageID("user"),
				"role": "user",
				"content": []any{
					map[string]any{
						"type": "text",
						"text": trimmed,
					},
				},
				"attachments": []any{},
			}
			transcript = append(transcript, cloneMessage(userMessage))
			providerMessages = append(providerMessages, map[string]any{
				"role":    "user",
				"content": trimmed,
			})
		}
	}

	return transcript, providerMessages, nil
}

func parseTranscriptMessages(raw any) ([]map[string]any, []map[string]any, error) {
	rawList, ok := raw.([]any)
	if !ok {
		return nil, nil, fmt.Errorf("%w: messages must be a list", agentruns.ErrInvalidRunInput)
	}
	transcript := make([]map[string]any, 0, len(rawList))
	providerPayloads := make([]map[string]any, 0, len(rawList))
	for index, entry := range rawList {
		message, ok := entry.(map[string]any)
		if !ok {
			return nil, nil, fmt.Errorf("%w: message %d must be an object", ErrHistoryUnsupported, index)
		}
		normalized, payload, include, err := normalizeTranscriptMessage(message)
		if err != nil {
			return nil, nil, err
		}
		transcript = append(transcript, normalized)
		if include {
			providerPayloads = append(providerPayloads, payload)
		}
	}
	return transcript, providerPayloads, nil
}

func normalizeTranscriptMessage(message map[string]any) (map[string]any, map[string]any, bool, error) {
	normalized := cloneMessage(message)
	messageID := strings.TrimSpace(stringValue(normalized["id"]))
	if messageID == "" {
		return nil, nil, false, fmt.Errorf("%w: message id is required", ErrHistoryUnsupported)
	}
	role := strings.TrimSpace(stringValue(normalized["role"]))
	switch role {
	case "system", "user", "assistant", "tool":
	default:
		return nil, nil, false, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
	}
	if hasNonEmptyAttachments(normalized["attachments"]) {
		return nil, nil, false, ErrAttachmentsUnsupported
	}
	toolCalls, hasToolCalls, err := normalizeProviderToolCalls(normalized["tool_calls"], role)
	if err != nil {
		return nil, nil, false, err
	}
	toolCallID := strings.TrimSpace(stringValue(normalized["tool_call_id"]))
	if role == "tool" && toolCallID == "" {
		return nil, nil, false, fmt.Errorf("%w: tool messages require tool_call_id", ErrToolsUnsupported)
	}
	if role != "tool" && toolCallID != "" {
		return nil, nil, false, ErrToolsUnsupported
	}
	content, include, err := normalizeProviderMessageContent(normalized["content"])
	if err != nil {
		return nil, nil, false, err
	}
	if _, ok := normalized["attachments"]; !ok {
		normalized["attachments"] = []any{}
	}
	payload := map[string]any{"role": role}
	switch role {
	case "assistant":
		payload["content"] = providerContentValue(content)
		if hasToolCalls {
			payload["tool_calls"] = messagesToAnyList(toolCalls)
			return normalized, payload, true, nil
		}
		return normalized, payload, include, nil
	case "tool":
		providerContent := content
		if !include {
			fallback, fallbackErr := normalizeProviderToolResultContent(normalized["result"])
			if fallbackErr != nil {
				return nil, nil, false, fallbackErr
			}
			providerContent = fallback
			include = strings.TrimSpace(providerContent) != ""
		}
		payload["content"] = providerContent
		payload["tool_call_id"] = toolCallID
		return normalized, payload, true, nil
	default:
		payload["content"] = content
		return normalized, payload, include, nil
	}
}

func normalizeProviderMessageContent(raw any) (string, bool, error) {
	if raw == nil {
		return "", false, nil
	}
	list, ok := raw.([]any)
	if !ok {
		return "", false, fmt.Errorf("%w: message content must be a list", ErrHistoryUnsupported)
	}
	parts := make([]string, 0, len(list))
	for index, entry := range list {
		block, ok := entry.(map[string]any)
		if !ok {
			return "", false, fmt.Errorf("%w: content block %d must be an object", ErrHistoryUnsupported, index)
		}
		switch strings.TrimSpace(stringValue(block["type"])) {
		case "", "text":
			text := strings.TrimSpace(stringValue(block["text"]))
			if text != "" {
				parts = append(parts, text)
			}
		case "thinking":
			continue
		default:
			return "", false, fmt.Errorf("%w: content block type %q", ErrHistoryUnsupported, stringValue(block["type"]))
		}
	}
	if len(parts) == 0 {
		return "", false, nil
	}
	return strings.Join(parts, "\n\n"), true, nil
}

func normalizeProviderToolCalls(raw any, role string) ([]map[string]any, bool, error) {
	if !hasNonEmptyToolCalls(raw) {
		return nil, false, nil
	}
	if role != "assistant" {
		return nil, false, ErrToolsUnsupported
	}
	list, _ := raw.([]any)
	toolCalls := make([]map[string]any, 0, len(list))
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
		arguments, _ := function["arguments"].(map[string]any)
		if arguments == nil {
			arguments = map[string]any{}
		}
		encodedArguments, err := json.Marshal(arguments)
		if err != nil {
			return nil, false, fmt.Errorf("%w: encode tool call arguments: %v", ErrToolsUnsupported, err)
		}
		toolCalls = append(toolCalls, map[string]any{
			"id":   toolCallID,
			"type": "function",
			"function": map[string]any{
				"name":      toolName,
				"arguments": string(encodedArguments),
			},
		})
	}
	return toolCalls, true, nil
}

func normalizeProviderToolResultContent(raw any) (string, error) {
	if raw == nil {
		return "", nil
	}
	switch value := raw.(type) {
	case map[string]any:
		if text := strings.TrimSpace(stringValue(value["text"])); text != "" {
			return text, nil
		}
	case string:
		if strings.TrimSpace(value) != "" {
			return value, nil
		}
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return "", fmt.Errorf("%w: encode tool result content: %v", ErrHistoryUnsupported, err)
	}
	return string(encoded), nil
}

func providerContentValue(content string) any {
	if strings.TrimSpace(content) == "" {
		return nil
	}
	return content
}

func resolveChatCompletionsEndpoint(request agentruns.ExecutionRequest) (string, error) {
	baseURL := strings.TrimSpace(request.LLMConfig.BaseURL)
	if rawBaseURL, ok := request.RequestParams["api_base"]; ok {
		if explicit := strings.TrimSpace(stringValue(rawBaseURL)); explicit != "" {
			baseURL = explicit
		}
	}
	if baseURL == "" {
		baseURL = defaultOpenAIBaseURL
	}
	joined, err := url.JoinPath(baseURL, "chat/completions")
	if err != nil {
		return "", fmt.Errorf("resolve managed llm endpoint: %w", err)
	}
	return joined, nil
}

func resolveAPIKey(request agentruns.ExecutionRequest) (string, error) {
	keyName := strings.TrimSpace(request.LLMConfig.APIKeyEnv)
	if keyName == "" {
		return "", nil
	}
	value := strings.TrimSpace(request.APIKeys[keyName])
	if value == "" {
		return "", fmt.Errorf("%w: %s", ErrAPIKeyRequired, keyName)
	}
	return value, nil
}

func hasExplicitReasoningConfig(params map[string]any) bool {
	if params == nil {
		return false
	}
	if _, ok := params["reasoning_effort"]; ok {
		return true
	}
	if _, ok := params["reasoning"]; ok {
		return true
	}
	return false
}

func shouldEmitManagedChatStream(request agentruns.ExecutionRequest) bool {
	if strings.TrimSpace(request.ChatID) == "" || strings.TrimSpace(request.Run.ID) == "" {
		return false
	}
	return strings.TrimSpace(stringValue(request.Inputs["runType"])) == managedChatRunType
}

func resolveTemporaryToCanonical(request agentruns.ExecutionRequest) (map[string]string, error) {
	if request.TemporaryIDs == nil {
		return nil, nil
	}
	canonicalToTemporary, err := request.TemporaryIDs.Snapshot()
	if err != nil {
		return nil, fmt.Errorf("snapshot temporary ids: %w", err)
	}
	temporaryToCanonical := make(map[string]string, len(canonicalToTemporary))
	for canonicalID, temporaryID := range canonicalToTemporary {
		trimmedTemporaryID := strings.TrimSpace(temporaryID)
		if trimmedTemporaryID == "" {
			continue
		}
		temporaryToCanonical[trimmedTemporaryID] = canonicalID
	}
	return temporaryToCanonical, nil
}

func collectSSEData(lines []string) string {
	values := make([]string, 0, len(lines))
	for _, line := range lines {
		switch {
		case strings.HasPrefix(line, "data:"):
			values = append(values, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		case strings.HasPrefix(line, ":"):
			continue
		}
	}
	return strings.Join(values, "\n")
}

func normalizeChunkText(raw any) string {
	switch value := raw.(type) {
	case string:
		return value
	case []any:
		parts := make([]string, 0, len(value))
		for _, entry := range value {
			block, ok := entry.(map[string]any)
			if !ok {
				continue
			}
			if strings.TrimSpace(stringValue(block["type"])) != "text" {
				continue
			}
			text := stringValue(block["text"])
			if text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "")
	default:
		return ""
	}
}

func newAssistantMessage() map[string]any {
	return map[string]any{
		"id":          newMessageID("assistant"),
		"role":        "assistant",
		"content":     []any{},
		"attachments": []any{},
		"tool_calls":  nil,
	}
}

func appendAssistantText(message map[string]any, delta string) {
	if strings.TrimSpace(delta) == "" && delta == "" {
		return
	}
	content, _ := message["content"].([]any)
	if len(content) == 0 {
		content = append(content, map[string]any{
			"type": "text",
			"text": "",
		})
	}
	block, ok := content[0].(map[string]any)
	if !ok || strings.TrimSpace(stringValue(block["type"])) != "text" {
		block = map[string]any{
			"type": "text",
			"text": "",
		}
		if len(content) == 0 {
			content = append(content, block)
		} else {
			content[0] = block
		}
	}
	block["text"] = stringValue(block["text"]) + delta
	message["content"] = content
}

func hasMessageText(message map[string]any) bool {
	content, ok := message["content"].([]any)
	if !ok {
		return false
	}
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(block["type"])) != "text" {
			continue
		}
		if strings.TrimSpace(stringValue(block["text"])) != "" {
			return true
		}
	}
	return false
}

func hasNonEmptyAttachments(raw any) bool {
	list, ok := raw.([]any)
	return ok && len(list) > 0
}

func hasNonEmptyToolCalls(raw any) bool {
	list, ok := raw.([]any)
	return ok && len(list) > 0
}

func newMessageID(prefix string) string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return prefix + "_fallback"
	}
	return prefix + "_" + hex.EncodeToString(bytes)
}

func optionalStringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func stringValue(raw any) string {
	value, _ := raw.(string)
	return value
}

func cloneMessage(message map[string]any) map[string]any {
	return cloneAnyMap(message)
}

func cloneMessageSlice(messages []map[string]any) []map[string]any {
	if messages == nil {
		return nil
	}
	cloned := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		cloned = append(cloned, cloneMessage(message))
	}
	return cloned
}

func messagesToAnyList(messages []map[string]any) []any {
	list := make([]any, 0, len(messages))
	for _, message := range messages {
		list = append(list, cloneMessage(message))
	}
	return list
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = cloneJSONValue(value)
	}
	return cloned
}

func cloneJSONValue(value any) any {
	if value == nil {
		return nil
	}
	content, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var cloned any
	if err := json.Unmarshal(content, &cloned); err != nil {
		return value
	}
	return cloned
}
