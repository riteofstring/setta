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
	HTTPClient *http.Client
}

type Executor struct {
	live       *managedchat.LiveRuntime
	httpClient *http.Client
}

type preparedExecution struct {
	endpoint         string
	apiKey           string
	projectConfigID  *string
	sectionID        *string
	chatID           string
	runID            string
	emitStream       bool
	requestBody      map[string]any
	transcript       []map[string]any
	assistantMessage map[string]any
}

type openAIStreamChunk struct {
	Choices []struct {
		Index int `json:"index"`
		Delta struct {
			Content any `json:"content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Usage map[string]any `json:"usage"`
}

func NewExecutor(options ExecutorOptions) *Executor {
	httpClient := options.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Executor{
		live:       options.Live,
		httpClient: httpClient,
	}
}

func (e *Executor) Execute(ctx context.Context, request agentruns.ExecutionRequest) (agentruns.ExecutionResult, error) {
	prepared, err := e.prepareExecution(request)
	if err != nil {
		return agentruns.ExecutionResult{}, err
	}

	if prepared.emitStream {
		if err := e.applyChunk(ctx, prepared, realtime.MessageStartEvent{
			Type:    realtime.StreamingEventTypeMessageStart,
			Message: cloneMessage(prepared.assistantMessage),
		}); err != nil {
			return agentruns.ExecutionResult{}, err
		}
	}

	result, execErr := e.executeStream(ctx, prepared)
	if execErr == nil {
		if prepared.emitStream {
			if err := e.applyChunk(ctx, prepared, realtime.MessageStopEvent{
				Type:      realtime.StreamingEventTypeMessageStop,
				MessageID: stringValue(prepared.assistantMessage["id"]),
			}); err != nil {
				return agentruns.ExecutionResult{}, err
			}
			if err := e.applyChunk(ctx, prepared, realtime.MessageFinalizedEvent{
				Type:    realtime.StreamingEventTypeMessageFinalized,
				Message: cloneMessage(prepared.assistantMessage),
			}); err != nil {
				return agentruns.ExecutionResult{}, err
			}
		}
		return result, nil
	}

	if errors.Is(execErr, context.Canceled) {
		if prepared.emitStream {
			if err := e.applyChunk(ctx, prepared, realtime.MessageStopEvent{
				Type:      realtime.StreamingEventTypeMessageStop,
				MessageID: stringValue(prepared.assistantMessage["id"]),
			}); err != nil {
				return result, err
			}
			if hasMessageText(prepared.assistantMessage) {
				if err := e.applyChunk(ctx, prepared, realtime.MessageFinalizedEvent{
					Type:    realtime.StreamingEventTypeMessageFinalized,
					Message: cloneMessage(prepared.assistantMessage),
				}); err != nil {
					return result, err
				}
			}
		}
		return result, execErr
	}
	return result, execErr
}

func (e *Executor) prepareExecution(request agentruns.ExecutionRequest) (preparedExecution, error) {
	provider := strings.ToLower(strings.TrimSpace(request.LLMConfig.Provider))
	if provider != openAIProvider {
		return preparedExecution{}, fmt.Errorf("%w: %q", ErrProviderUnsupported, provider)
	}
	if strings.TrimSpace(request.LLMConfig.Model) == "" {
		return preparedExecution{}, ErrModelRequired
	}
	if len(request.MCPServerIDs) > 0 {
		return preparedExecution{}, fmt.Errorf("%w: %s", ErrToolsUnsupported, strings.Join(request.MCPServerIDs, ", "))
	}
	if request.Thinking && !hasExplicitReasoningConfig(request.RequestParams) {
		return preparedExecution{}, ErrReasoningUnsupported
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
	assistantMessage := newAssistantMessage()

	requestBody := map[string]any{
		"model":    request.LLMConfig.Model,
		"messages": providerMessages,
		"stream":   true,
		"stream_options": map[string]any{
			"include_usage": true,
		},
	}
	for key, value := range request.RequestParams {
		switch strings.TrimSpace(key) {
		case "", "model", "messages", "stream", "stream_options", "api_key", "custom_llm_provider", "api_base":
			continue
		case "tools", "tool_choice", "functions", "function_call":
			return preparedExecution{}, fmt.Errorf("%w: request param %q", ErrToolsUnsupported, key)
		default:
			requestBody[key] = cloneJSONValue(value)
		}
	}

	return preparedExecution{
		endpoint:         endpoint,
		apiKey:           apiKey,
		projectConfigID:  optionalStringPointer(request.ProjectConfigID),
		sectionID:        cloneStringPointer(request.SectionID),
		chatID:           strings.TrimSpace(request.ChatID),
		runID:            strings.TrimSpace(request.Run.ID),
		emitStream:       shouldEmitManagedChatStream(request),
		requestBody:      requestBody,
		transcript:       transcript,
		assistantMessage: assistantMessage,
	}, nil
}

func (e *Executor) executeStream(ctx context.Context, prepared preparedExecution) (agentruns.ExecutionResult, error) {
	body, err := json.Marshal(prepared.requestBody)
	if err != nil {
		return agentruns.ExecutionResult{}, fmt.Errorf("encode managed llm request: %w", err)
	}
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, prepared.endpoint, bytes.NewReader(body))
	if err != nil {
		return agentruns.ExecutionResult{}, fmt.Errorf("create managed llm request: %w", err)
	}
	httpRequest.Header.Set("Authorization", "Bearer "+prepared.apiKey)
	httpRequest.Header.Set("Content-Type", "application/json")

	response, err := e.httpClient.Do(httpRequest)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			return e.buildResult(prepared, nil), context.Canceled
		}
		return agentruns.ExecutionResult{}, fmt.Errorf("send managed llm request: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		bodyBytes, _ := io.ReadAll(io.LimitReader(response.Body, maxProviderErrorBytes))
		detail := strings.TrimSpace(string(bodyBytes))
		if detail == "" {
			detail = response.Status
		}
		return agentruns.ExecutionResult{}, fmt.Errorf("managed llm provider request failed: %s", detail)
	}

	usage, err := e.consumeSSE(ctx, response.Body, prepared)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			return e.buildResult(prepared, usage), context.Canceled
		}
		return e.buildResult(prepared, usage), err
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		return e.buildResult(prepared, usage), context.Canceled
	}
	return e.buildResult(prepared, usage), nil
}

func (e *Executor) consumeSSE(ctx context.Context, reader io.Reader, prepared preparedExecution) (map[string]any, error) {
	buffered := bufio.NewReader(reader)
	lines := []string{}
	var usage map[string]any

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
				done, nextUsage, processErr := e.processSSEEvent(ctx, lines, prepared)
				if nextUsage != nil {
					usage = nextUsage
				}
				if processErr != nil {
					return usage, processErr
				}
				lines = lines[:0]
				if done {
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
				return usage, nil
			}
			done, nextUsage, processErr := e.processSSEEvent(ctx, lines, prepared)
			if nextUsage != nil {
				usage = nextUsage
			}
			if processErr != nil {
				return usage, processErr
			}
			if done {
				return usage, nil
			}
			return usage, nil
		}
		return usage, fmt.Errorf("read managed llm stream: %w", err)
	}
}

func (e *Executor) processSSEEvent(ctx context.Context, lines []string, prepared preparedExecution) (bool, map[string]any, error) {
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
		if text == "" {
			continue
		}
		appendAssistantText(prepared.assistantMessage, text)
		if prepared.emitStream {
			if err := e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
				Type:      realtime.StreamingEventTypeDelta,
				MessageID: stringValue(prepared.assistantMessage["id"]),
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

func (e *Executor) buildResult(prepared preparedExecution, usage map[string]any) agentruns.ExecutionResult {
	outputMessages := cloneMessageSlice(prepared.transcript)
	if hasMessageText(prepared.assistantMessage) {
		outputMessages = append(outputMessages, cloneMessage(prepared.assistantMessage))
	}
	outputs := map[string]any{
		"messages": messagesToAnyList(outputMessages),
	}
	if usage != nil {
		outputs["usage"] = cloneAnyMap(usage)
	}
	return agentruns.ExecutionResult{
		Outputs: outputs,
	}
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
	case "system", "user", "assistant":
	default:
		return nil, nil, false, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
	}
	if hasNonEmptyAttachments(normalized["attachments"]) {
		return nil, nil, false, ErrAttachmentsUnsupported
	}
	if hasNonEmptyToolCalls(normalized["tool_calls"]) {
		return nil, nil, false, ErrToolsUnsupported
	}
	if strings.TrimSpace(stringValue(normalized["tool_call_id"])) != "" {
		return nil, nil, false, ErrToolsUnsupported
	}
	content, include, err := normalizeProviderMessageContent(normalized["content"])
	if err != nil {
		return nil, nil, false, err
	}
	if _, ok := normalized["attachments"]; !ok {
		normalized["attachments"] = []any{}
	}
	payload := map[string]any{
		"role":    role,
		"content": content,
	}
	return normalized, payload, include, nil
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
