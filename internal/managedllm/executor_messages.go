package managedllm

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/chatattachments"
)

func shouldPersistMessage(message map[string]any) bool {
	if message == nil {
		return false
	}
	if hasMessageText(message) {
		return true
	}
	if hasMessageThinking(message) {
		return true
	}
	if hasNonEmptyToolCalls(message["tool_calls"]) {
		return true
	}
	return strings.TrimSpace(stringValue(message["role"])) == "tool"
}

func providerPayloadForMessage(provider string, message map[string]any) (map[string]any, bool, error) {
	normalized, err := normalizeTranscriptMessage(message)
	if err != nil {
		return nil, false, err
	}
	switch provider {
	case openAIProvider:
		return buildOpenAIProviderMessage(normalized)
	case anthropicProvider:
		return buildAnthropicProviderMessage(normalized)
	case geminiProvider:
		return cloneAnyMap(normalized), true, nil
	default:
		return nil, false, fmt.Errorf("%w: %q", ErrProviderUnsupported, provider)
	}
}

func (e *Executor) buildMessages(provider string, request agentruns.ExecutionRequest) ([]map[string]any, []map[string]any, []map[string]any, error) {
	transcript := []map[string]any{}
	executionTranscript := []map[string]any{}

	if rawMessages, ok := request.Inputs["messages"]; ok {
		messages, executionMessages, err := e.parseTranscriptMessages(rawMessages, strings.TrimSpace(request.ProjectConfigID))
		if err != nil {
			return nil, nil, nil, err
		}
		transcript = append(transcript, messages...)
		executionTranscript = append(executionTranscript, executionMessages...)
	}
	if rawPrompt, ok := request.Inputs["prompt"]; ok {
		prompt, ok := rawPrompt.(string)
		if !ok {
			return nil, nil, nil, fmt.Errorf("%w: prompt must be a string", agentruns.ErrInvalidRunInput)
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
			executionTranscript = append(executionTranscript, cloneMessage(userMessage))
		}
	}
	providerMessages, err := buildProviderMessages(provider, strings.TrimSpace(request.SystemPrompt), executionTranscript)
	if err != nil {
		return nil, nil, nil, err
	}
	return transcript, executionTranscript, providerMessages, nil
}

func (e *Executor) parseTranscriptMessages(raw any, projectConfigID string) ([]map[string]any, []map[string]any, error) {
	rawList, ok := raw.([]any)
	if !ok {
		return nil, nil, fmt.Errorf("%w: messages must be a list", agentruns.ErrInvalidRunInput)
	}
	transcript := make([]map[string]any, 0, len(rawList))
	executionTranscript := make([]map[string]any, 0, len(rawList))
	for index, entry := range rawList {
		message, ok := entry.(map[string]any)
		if !ok {
			return nil, nil, fmt.Errorf("%w: message %d must be an object", ErrHistoryUnsupported, index)
		}
		persisted, err := normalizePersistedTranscriptMessage(message)
		if err != nil {
			return nil, nil, err
		}
		resolved, err := e.resolveMessageAttachments(persisted, projectConfigID)
		if err != nil {
			return nil, nil, err
		}
		normalized, err := normalizeTranscriptMessage(resolved)
		if err != nil {
			return nil, nil, err
		}
		transcript = append(transcript, persisted)
		executionTranscript = append(executionTranscript, normalized)
	}
	return transcript, executionTranscript, nil
}

func (e *Executor) resolveMessageAttachments(message map[string]any, projectConfigID string) (map[string]any, error) {
	resolved := cloneMessage(message)
	if !hasNonEmptyAttachments(resolved["attachments"]) {
		return resolved, nil
	}
	if e == nil || e.attachments == nil {
		return nil, ErrAttachmentsUnsupported
	}
	attachmentPayload, err := e.attachments.BuildPayload(chatattachments.BuildPayloadRequest{
		Messages:        []map[string]any{resolved},
		ProjectConfigID: projectConfigID,
		IncludeText:     true,
	})
	if err != nil {
		return nil, err
	}
	if attachmentText := strings.TrimSpace(attachmentPayload.AttachmentText); attachmentText != "" {
		content, _ := resolved["content"].([]any)
		nextContent := make([]any, 0, len(content)+1)
		nextContent = append(nextContent, content...)
		nextContent = append(nextContent, map[string]any{
			"type": "text",
			"text": attachmentText,
		})
		resolved["content"] = nextContent
	}
	resolved["attachments"] = []any{}
	return resolved, nil
}

func buildProviderMessages(provider string, systemPrompt string, transcript []map[string]any) ([]map[string]any, error) {
	switch provider {
	case openAIProvider:
		messages := []map[string]any{
			{
				"role":    "system",
				"content": systemPrompt,
			},
		}
		for _, message := range transcript {
			payload, include, err := buildOpenAIProviderMessage(message)
			if err != nil {
				return nil, err
			}
			if include {
				messages = append(messages, payload)
			}
		}
		return messages, nil
	case anthropicProvider:
		messages := make([]map[string]any, 0, len(transcript))
		for _, message := range transcript {
			payload, include, err := buildAnthropicProviderMessage(message)
			if err != nil {
				return nil, err
			}
			if include {
				messages = append(messages, payload)
			}
		}
		return messages, nil
	case geminiProvider:
		messages := make([]map[string]any, 0, len(transcript))
		for _, message := range transcript {
			messages = append(messages, cloneAnyMap(message))
		}
		return messages, nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrProviderUnsupported, provider)
	}
}

func normalizeTranscriptMessage(message map[string]any) (map[string]any, error) {
	normalized := cloneMessage(message)
	messageID := strings.TrimSpace(stringValue(normalized["id"]))
	if messageID == "" {
		return nil, fmt.Errorf("%w: message id is required", ErrHistoryUnsupported)
	}
	role := strings.TrimSpace(stringValue(normalized["role"]))
	switch role {
	case "system", "user", "assistant", "tool":
	default:
		return nil, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
	}
	if hasNonEmptyAttachments(normalized["attachments"]) {
		return nil, ErrAttachmentsUnsupported
	}
	if _, _, err := normalizeProviderToolCalls(normalized["tool_calls"], role); err != nil {
		return nil, err
	}
	toolCallID := strings.TrimSpace(stringValue(normalized["tool_call_id"]))
	if role == "tool" && toolCallID == "" {
		return nil, fmt.Errorf("%w: tool messages require tool_call_id", ErrToolsUnsupported)
	}
	if role != "tool" && toolCallID != "" {
		return nil, ErrToolsUnsupported
	}
	if _, _, err := normalizeProviderMessageContent(normalized["content"]); err != nil {
		return nil, err
	}
	if _, ok := normalized["attachments"]; !ok {
		normalized["attachments"] = []any{}
	}
	return normalized, nil
}

func normalizePersistedTranscriptMessage(message map[string]any) (map[string]any, error) {
	normalized := cloneMessage(message)
	messageID := strings.TrimSpace(stringValue(normalized["id"]))
	if messageID == "" {
		return nil, fmt.Errorf("%w: message id is required", ErrHistoryUnsupported)
	}
	role := strings.TrimSpace(stringValue(normalized["role"]))
	switch role {
	case "system", "user", "assistant", "tool":
	default:
		return nil, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
	}
	if _, _, err := normalizeProviderToolCalls(normalized["tool_calls"], role); err != nil {
		return nil, err
	}
	toolCallID := strings.TrimSpace(stringValue(normalized["tool_call_id"]))
	if role == "tool" && toolCallID == "" {
		return nil, fmt.Errorf("%w: tool messages require tool_call_id", ErrToolsUnsupported)
	}
	if role != "tool" && toolCallID != "" {
		return nil, ErrToolsUnsupported
	}
	if _, _, err := normalizeProviderMessageContent(normalized["content"]); err != nil {
		return nil, err
	}
	if _, ok := normalized["attachments"]; !ok {
		normalized["attachments"] = []any{}
	}
	return normalized, nil
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
