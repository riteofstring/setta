package managedllm

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/agentruns"
)

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
	_, ok, err := extractExplicitReasoningEffort(params)
	return err == nil && ok
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
	temporaryToCanonical := make(map[string]string, len(canonicalToTemporary)*2)
	for canonicalID, temporaryID := range canonicalToTemporary {
		trimmedCanonicalID := strings.TrimSpace(canonicalID)
		if trimmedCanonicalID != "" {
			temporaryToCanonical[trimmedCanonicalID] = trimmedCanonicalID
		}
		trimmedTemporaryID := strings.TrimSpace(temporaryID)
		if trimmedTemporaryID == "" {
			continue
		}
		temporaryToCanonical[trimmedTemporaryID] = trimmedCanonicalID
	}
	return temporaryToCanonical, nil
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
	appendAssistantTextAtIndex(message, 0, delta)
}

func setAssistantTextAtIndex(message map[string]any, index int, text string) {
	if strings.TrimSpace(text) == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "text")
	block["text"] = text
	message["content"] = content
}

func appendAssistantTextAtIndex(message map[string]any, index int, delta string) {
	if strings.TrimSpace(delta) == "" && delta == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "text")
	block["text"] = stringValue(block["text"]) + delta
	message["content"] = content
}

func appendAssistantThinkingAtIndex(message map[string]any, index int, delta string) {
	if strings.TrimSpace(delta) == "" && delta == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "thinking")
	block["thinking"] = stringValue(block["thinking"]) + delta
	message["content"] = content
}

func setAssistantThinkingTextAtIndex(message map[string]any, index int, thinking string) {
	if strings.TrimSpace(thinking) == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "thinking")
	block["thinking"] = thinking
	message["content"] = content
}

func setAssistantThinkingSummaryAtIndex(message map[string]any, index int, summary string) {
	if strings.TrimSpace(summary) == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "thinking")
	block["summary"] = summary
	message["content"] = content
}

func setAssistantThinkingSignatureAtIndex(message map[string]any, index int, signature string) {
	if strings.TrimSpace(signature) == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "thinking")
	block["signature"] = signature
	message["content"] = content
}

func setAssistantThinkingProviderItemIDAtIndex(message map[string]any, index int, providerItemID string) {
	if strings.TrimSpace(providerItemID) == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "thinking")
	block["provider_item_id"] = providerItemID
	message["content"] = content
}

func setAssistantProviderMessageID(message map[string]any, providerMessageID string) {
	if message == nil {
		return
	}
	trimmed := strings.TrimSpace(providerMessageID)
	if trimmed == "" {
		return
	}
	message["provider_message_id"] = trimmed
}

func setAssistantProviderMessagePhase(message map[string]any, phase string) {
	if message == nil {
		return
	}
	trimmed := strings.TrimSpace(phase)
	if trimmed == "" {
		return
	}
	message["provider_message_phase"] = trimmed
}

func setAssistantProviderMessageContentType(message map[string]any, contentType string) {
	if message == nil {
		return
	}
	trimmed := strings.TrimSpace(contentType)
	if trimmed == "" {
		return
	}
	message["provider_message_content_type"] = trimmed
}

func ensureAssistantContentBlock(message map[string]any, index int, blockType string) ([]any, map[string]any) {
	content, _ := message["content"].([]any)
	if index < 0 {
		index = len(content)
	}
	for len(content) <= index {
		content = append(content, map[string]any{})
	}
	block, _ := content[index].(map[string]any)
	block = cloneAnyMap(block)
	if block == nil || strings.TrimSpace(stringValue(block["type"])) != blockType {
		block = map[string]any{
			"type": blockType,
		}
		switch blockType {
		case "text":
			block["text"] = ""
		case "thinking":
			block["thinking"] = ""
		}
	}
	content[index] = block
	return content, block
}

func currentAssistantTextAtIndex(message map[string]any, index int) string {
	return currentAssistantBlockStringAtIndex(message, index, "text", "text")
}

func currentAssistantThinkingTextAtIndex(message map[string]any, index int) string {
	return currentAssistantBlockStringAtIndex(message, index, "thinking", "thinking")
}

func currentAssistantThinkingSignatureAtIndex(message map[string]any, index int) string {
	return currentAssistantBlockStringAtIndex(message, index, "thinking", "signature")
}

func currentAssistantBlockStringAtIndex(message map[string]any, index int, blockType string, field string) string {
	content, _ := message["content"].([]any)
	if index < 0 || index >= len(content) {
		return ""
	}
	block, _ := content[index].(map[string]any)
	if block == nil || strings.TrimSpace(stringValue(block["type"])) != blockType {
		return ""
	}
	return stringValue(block[field])
}

func authoritativeResponseReplacementSuffix(current string, final string) string {
	if final == "" || current == final {
		return ""
	}
	if current == "" {
		return final
	}
	if strings.HasPrefix(final, current) {
		return strings.TrimPrefix(final, current)
	}
	return ""
}

func compactAssistantContent(message map[string]any) {
	if message == nil {
		return
	}
	content, _ := message["content"].([]any)
	if len(content) == 0 {
		return
	}
	compacted := make([]any, 0, len(content))
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		switch strings.TrimSpace(stringValue(block["type"])) {
		case "text":
			if strings.TrimSpace(stringValue(block["text"])) == "" {
				continue
			}
		case "thinking":
			if strings.TrimSpace(stringValue(block["thinking"])) == "" &&
				strings.TrimSpace(stringValue(block["summary"])) == "" &&
				strings.TrimSpace(stringValue(block["signature"])) == "" {
				continue
			}
		default:
			continue
		}
		compacted = append(compacted, cloneAnyMap(block))
	}
	message["content"] = compacted
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

func hasMessageThinking(message map[string]any) bool {
	content, ok := message["content"].([]any)
	if !ok {
		return false
	}
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(block["type"])) != "thinking" {
			continue
		}
		if strings.TrimSpace(stringValue(block["thinking"])) != "" ||
			strings.TrimSpace(stringValue(block["summary"])) != "" ||
			strings.TrimSpace(stringValue(block["signature"])) != "" {
			return true
		}
	}
	return false
}

func hasThinkingBlock(message map[string]any) bool {
	content, ok := message["content"].([]any)
	if !ok {
		return false
	}
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(block["type"])) == "thinking" {
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
