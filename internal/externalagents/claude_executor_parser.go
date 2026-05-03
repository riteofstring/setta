package externalagents

import (
	"encoding/json"
	"errors"
	"strings"
)

type claudeEventParser struct {
	runtime                  *Runtime
	request                  StartRequest
	currentMessageID         string
	blockTypesByIndex        map[int]string
	toolUseIDsByIndex        map[int]string
	toolResultIDsByIndex     map[int]string
	toolCallArgumentsByID    map[string]string
	toolCallSeededFromInput  map[string]bool
	toolResultBuffersByID    map[string]*claudeToolResultBuffer
	pendingQuestionApprovals []string
	pendingQuestionToolCalls []string
	pendingToolResults       []claudeToolResultMetadata
}

type claudeContentBlockDelta struct {
	messageID string
	index     int
	blockType string
	deltaType string
	delta     map[string]any
}

type claudeContentBlockStart struct {
	messageID    string
	index        int
	blockType    string
	contentBlock map[string]any
}

func newClaudeEventParser(runtime *Runtime, request StartRequest) *claudeEventParser {
	return &claudeEventParser{
		runtime:                 runtime,
		request:                 request,
		blockTypesByIndex:       map[int]string{},
		toolUseIDsByIndex:       map[int]string{},
		toolResultIDsByIndex:    map[int]string{},
		toolCallArgumentsByID:   map[string]string{},
		toolCallSeededFromInput: map[string]bool{},
		toolResultBuffersByID:   map[string]*claudeToolResultBuffer{},
	}
}

func contentBlockIndex(eventPayload map[string]any) (int, bool) {
	switch value := eventPayload["index"].(type) {
	case float64:
		return int(value), true
	case int:
		return value, true
	default:
		return 0, false
	}
}

func (p *claudeEventParser) queueQuestionApproval(approvalID string) error {
	trimmedApprovalID := strings.TrimSpace(approvalID)
	if trimmedApprovalID == "" {
		return nil
	}
	if toolCallID := p.popPendingQuestionToolCall(); toolCallID != nil {
		responseID := trimmedApprovalID
		if err := p.runtime.RegisterQuestion(p.buildQuestionState(*toolCallID, &responseID)); err != nil && !errors.Is(err, ErrRunNotActive) {
			return err
		}
		return nil
	}
	p.pendingQuestionApprovals = append(p.pendingQuestionApprovals, trimmedApprovalID)
	return nil
}

func (p *claudeEventParser) popQuestionApproval() *string {
	if len(p.pendingQuestionApprovals) == 0 {
		return nil
	}
	approvalID := p.pendingQuestionApprovals[0]
	p.pendingQuestionApprovals = append([]string(nil), p.pendingQuestionApprovals[1:]...)
	return &approvalID
}

func (p *claudeEventParser) popPendingQuestionToolCall() *string {
	if len(p.pendingQuestionToolCalls) == 0 {
		return nil
	}
	toolCallID := p.pendingQuestionToolCalls[0]
	p.pendingQuestionToolCalls = append([]string(nil), p.pendingQuestionToolCalls[1:]...)
	return &toolCallID
}

func (p *claudeEventParser) takeToolResults() []claudeToolResultMetadata {
	if len(p.pendingToolResults) == 0 {
		return []claudeToolResultMetadata{}
	}
	toolResults := append([]claudeToolResultMetadata(nil), p.pendingToolResults...)
	p.pendingToolResults = nil
	return toolResults
}

func (p *claudeEventParser) handleStreamEvent(eventPayload map[string]any, state *ChatState) (bool, error) {
	switch strings.TrimSpace(stringValue(eventPayload["type"])) {
	case "message_start":
		messagePayload, ok := mapValue(eventPayload["message"])
		if !ok {
			return false, nil
		}
		messageID := strings.TrimSpace(stringValue(messagePayload["id"]))
		if messageID == "" {
			return false, nil
		}
		p.currentMessageID = messageID
		p.blockTypesByIndex = map[int]string{}
		p.toolUseIDsByIndex = map[int]string{}
		p.toolResultIDsByIndex = map[int]string{}
		upsertAssistantMessage(state, messageID, "")
		return true, nil
	case "content_block_start":
		return p.handleContentBlockStart(eventPayload, state)
	case "content_block_delta":
		return p.handleContentBlockDelta(eventPayload, state)
	case "content_block_stop":
		return p.handleContentBlockStop(eventPayload, state)
	case "message_stop":
		p.currentMessageID = ""
		p.blockTypesByIndex = map[int]string{}
		p.toolUseIDsByIndex = map[int]string{}
		p.toolResultIDsByIndex = map[int]string{}
		return false, nil
	default:
		return false, nil
	}
}

func (p *claudeEventParser) handleAssistantMessage(messagePayload map[string]any, state *ChatState) (bool, error) {
	messageID := strings.TrimSpace(stringValue(messagePayload["id"]))
	if messageID == "" || findMessageIndex(state.Messages, messageID) != -1 {
		return false, nil
	}
	upsertAssistantMessage(state, messageID, "")
	rawContent, _ := messagePayload["content"].([]any)
	for _, rawEntry := range rawContent {
		if err := p.handleAssistantMessageEntry(messageID, rawEntry, state); err != nil {
			return true, err
		}
	}
	return true, nil
}

func (p *claudeEventParser) handleAssistantMessageEntry(
	messageID string,
	rawEntry any,
	state *ChatState,
) error {
	entry, ok := rawEntry.(map[string]any)
	if !ok {
		return nil
	}
	return p.applyAssistantMessageEntry(messageID, entry, state)
}

func (p *claudeEventParser) applyAssistantMessageEntry(
	messageID string,
	entry map[string]any,
	state *ChatState,
) error {
	switch strings.TrimSpace(stringValue(entry["type"])) {
	case "text":
		p.applyAssistantTextEntry(messageID, entry, state)
		return nil
	case "thinking":
		p.applyAssistantThinkingEntry(messageID, entry, state)
		return nil
	case "tool_use":
		return p.applyAssistantToolUseEntry(messageID, entry, state)
	case "tool_result":
		p.applyAssistantToolResultEntry(entry, state)
		return nil
	default:
		return nil
	}
}

func (p *claudeEventParser) applyAssistantTextEntry(messageID string, entry map[string]any, state *ChatState) {
	text := strings.TrimSpace(stringValue(entry["text"]))
	if text != "" {
		appendAssistantDelta(state, messageID, text)
	}
}

func (p *claudeEventParser) applyAssistantThinkingEntry(messageID string, entry map[string]any, state *ChatState) {
	thinking := strings.TrimSpace(stringValue(entry["thinking"]))
	summary := optionalStringValue(entry, "summary")
	signature := optionalStringValue(entry, "signature")
	if thinking != "" || summary != nil || signature != nil {
		appendAssistantThinkingUpdate(state, messageID, thinking, summary, signature)
	}
}

func (p *claudeEventParser) applyAssistantToolUseEntry(messageID string, entry map[string]any, state *ChatState) error {
	toolCallID, toolName, arguments := toolUsePayload(entry)
	if toolCallID == "" {
		return nil
	}
	setToolCallArguments(state, toolCallID, arguments)
	upsertAssistantToolCall(state, messageID, toolCallID, toolName, arguments)
	return p.registerQuestion(toolCallID, toolName)
}

func (p *claudeEventParser) applyAssistantToolResultEntry(entry map[string]any, state *ChatState) {
	metadata := buildClaudeToolResultFromContentBlock(state, entry)
	if metadata != nil {
		p.pendingToolResults = append(p.pendingToolResults, *metadata)
	}
}

func (p *claudeEventParser) handleContentBlockStart(eventPayload map[string]any, state *ChatState) (bool, error) {
	start, ok := p.parseContentBlockStart(eventPayload)
	if !ok {
		return false, nil
	}
	p.blockTypesByIndex[start.index] = start.blockType
	switch start.blockType {
	case "text":
		return start.applyTextStart(state)
	case "thinking":
		return start.applyThinkingStart(state)
	case "tool_use":
		return p.applyToolUseStart(start, state)
	case "tool_result":
		return p.applyToolResultStart(start)
	default:
		return false, nil
	}
}

func (p *claudeEventParser) parseContentBlockStart(eventPayload map[string]any) (claudeContentBlockStart, bool) {
	messageID := strings.TrimSpace(p.currentMessageID)
	if messageID == "" {
		return claudeContentBlockStart{}, false
	}
	index, ok := contentBlockIndex(eventPayload)
	if !ok {
		return claudeContentBlockStart{}, false
	}
	contentBlock, ok := mapValue(eventPayload["content_block"])
	if !ok {
		return claudeContentBlockStart{}, false
	}
	blockType := strings.TrimSpace(stringValue(contentBlock["type"]))
	if blockType == "" {
		return claudeContentBlockStart{}, false
	}
	return claudeContentBlockStart{
		messageID:    messageID,
		index:        index,
		blockType:    blockType,
		contentBlock: contentBlock,
	}, true
}

func (start claudeContentBlockStart) applyTextStart(state *ChatState) (bool, error) {
	text := stringValue(start.contentBlock["text"])
	if text == "" {
		return false, nil
	}
	appendAssistantDelta(state, start.messageID, text)
	return true, nil
}

func (start claudeContentBlockStart) applyThinkingStart(state *ChatState) (bool, error) {
	thinking := stringValue(start.contentBlock["thinking"])
	summary := optionalStringValue(start.contentBlock, "summary")
	signature := optionalStringValue(start.contentBlock, "signature")
	if thinking == "" && summary == nil && signature == nil {
		return false, nil
	}
	appendAssistantThinkingUpdate(state, start.messageID, thinking, summary, signature)
	return true, nil
}

func (p *claudeEventParser) applyToolUseStart(start claudeContentBlockStart, state *ChatState) (bool, error) {
	toolCallID, toolName, arguments := toolUsePayload(start.contentBlock)
	if toolCallID == "" {
		return false, nil
	}
	p.toolUseIDsByIndex[start.index] = toolCallID
	if len(arguments) > 0 {
		setToolCallArguments(state, toolCallID, arguments)
		if encoded, err := json.Marshal(arguments); err == nil {
			p.toolCallArgumentsByID[toolCallID] = string(encoded)
			p.toolCallSeededFromInput[toolCallID] = true
		}
	}
	upsertAssistantToolCall(state, start.messageID, toolCallID, toolName, arguments)
	if err := p.registerQuestion(toolCallID, toolName); err != nil {
		return true, err
	}
	return true, nil
}

func (p *claudeEventParser) applyToolResultStart(start claudeContentBlockStart) (bool, error) {
	toolCallID := strings.TrimSpace(stringValue(start.contentBlock["tool_use_id"]))
	if toolCallID == "" {
		return false, nil
	}
	p.toolResultIDsByIndex[start.index] = toolCallID
	appendClaudeToolResultChunk(
		p.toolResultBuffersByID,
		toolCallID,
		start.contentBlock["content"],
		boolValue(start.contentBlock["is_error"]),
	)
	return false, nil
}

func toolUsePayload(payload map[string]any) (string, string, map[string]any) {
	toolCallID := strings.TrimSpace(stringValue(payload["id"]))
	toolName := normalizeClaudeToolName(stringValue(payload["name"]))
	arguments, _ := mapValue(payload["input"])
	if arguments == nil {
		arguments = map[string]any{}
	}
	return toolCallID, toolName, arguments
}

func (p *claudeEventParser) handleContentBlockDelta(eventPayload map[string]any, state *ChatState) (bool, error) {
	delta, ok := p.parseContentBlockDelta(eventPayload)
	if !ok {
		return false, nil
	}
	switch delta.blockType {
	case "text":
		return delta.applyTextDelta(state)
	case "thinking":
		return delta.applyThinkingDelta(state)
	case "tool_use":
		return p.applyToolUseDelta(delta, state)
	case "tool_result":
		return p.applyToolResultDelta(delta)
	default:
		return false, nil
	}
}

func (p *claudeEventParser) parseContentBlockDelta(eventPayload map[string]any) (claudeContentBlockDelta, bool) {
	messageID := strings.TrimSpace(p.currentMessageID)
	if messageID == "" {
		return claudeContentBlockDelta{}, false
	}
	index, ok := contentBlockIndex(eventPayload)
	if !ok {
		return claudeContentBlockDelta{}, false
	}
	delta, ok := mapValue(eventPayload["delta"])
	if !ok {
		return claudeContentBlockDelta{}, false
	}
	return claudeContentBlockDelta{
		messageID: messageID,
		index:     index,
		blockType: p.blockTypesByIndex[index],
		deltaType: strings.TrimSpace(stringValue(delta["type"])),
		delta:     delta,
	}, true
}

func (delta claudeContentBlockDelta) applyTextDelta(state *ChatState) (bool, error) {
	if delta.deltaType != "text_delta" {
		return false, nil
	}
	text := stringValue(delta.delta["text"])
	if text == "" {
		return false, nil
	}
	appendAssistantDelta(state, delta.messageID, text)
	return true, nil
}

func (delta claudeContentBlockDelta) applyThinkingDelta(state *ChatState) (bool, error) {
	switch delta.deltaType {
	case "thinking_delta":
		thinking := stringValue(delta.delta["thinking"])
		summary := optionalStringValue(delta.delta, "summary")
		if thinking == "" && summary == nil {
			return false, nil
		}
		appendAssistantThinkingUpdate(state, delta.messageID, thinking, summary, nil)
		return true, nil
	case "signature_delta":
		signature := optionalStringValue(delta.delta, "signature")
		if signature == nil {
			return false, nil
		}
		appendAssistantThinkingUpdate(state, delta.messageID, "", nil, signature)
		return true, nil
	case "summary_delta":
		summary := optionalStringValue(delta.delta, "summary")
		if summary == nil {
			return false, nil
		}
		appendAssistantThinkingUpdate(state, delta.messageID, "", summary, nil)
		return true, nil
	default:
		return false, nil
	}
}

func (p *claudeEventParser) applyToolUseDelta(delta claudeContentBlockDelta, state *ChatState) (bool, error) {
	if delta.deltaType != "input_json_delta" {
		return false, nil
	}
	toolCallID := strings.TrimSpace(p.toolUseIDsByIndex[delta.index])
	if toolCallID == "" {
		return false, nil
	}
	partialJSON := stringValue(delta.delta["partial_json"])
	if partialJSON == "" {
		return false, nil
	}
	if p.toolCallSeededFromInput[toolCallID] {
		p.toolCallArgumentsByID[toolCallID] = ""
		p.toolCallSeededFromInput[toolCallID] = false
	}
	p.toolCallArgumentsByID[toolCallID] += partialJSON
	parsed, ok := decodeJSONObject(p.toolCallArgumentsByID[toolCallID])
	if !ok {
		return false, nil
	}
	setToolCallArguments(state, toolCallID, parsed)
	upsertAssistantToolCall(state, delta.messageID, toolCallID, "", parsed)
	return true, nil
}

func (p *claudeEventParser) applyToolResultDelta(delta claudeContentBlockDelta) (bool, error) {
	if delta.deltaType != "text_delta" {
		return false, nil
	}
	toolCallID := strings.TrimSpace(p.toolResultIDsByIndex[delta.index])
	if toolCallID == "" {
		return false, nil
	}
	appendClaudeToolResultChunk(p.toolResultBuffersByID, toolCallID, delta.delta["text"], false)
	return false, nil
}

func (p *claudeEventParser) handleContentBlockStop(eventPayload map[string]any, state *ChatState) (bool, error) {
	index, ok := contentBlockIndex(eventPayload)
	if !ok {
		return false, nil
	}
	switch p.blockTypesByIndex[index] {
	case "tool_use":
		toolCallID := strings.TrimSpace(p.toolUseIDsByIndex[index])
		if toolCallID == "" {
			return false, nil
		}
		parsed, ok := decodeJSONObject(p.toolCallArgumentsByID[toolCallID])
		if !ok {
			return false, nil
		}
		messageID := strings.TrimSpace(p.currentMessageID)
		if messageID == "" {
			return false, nil
		}
		setToolCallArguments(state, toolCallID, parsed)
		upsertAssistantToolCall(state, messageID, toolCallID, "", parsed)
		return true, nil
	case "tool_result":
		toolCallID := strings.TrimSpace(p.toolResultIDsByIndex[index])
		if toolCallID == "" {
			return false, nil
		}
		buffer := p.toolResultBuffersByID[toolCallID]
		delete(p.toolResultIDsByIndex, index)
		delete(p.toolResultBuffersByID, toolCallID)
		if buffer == nil {
			return false, nil
		}
		metadata := applyClaudeToolResult(state, toolCallID, buffer.Text, buffer.IsError)
		if metadata == nil {
			return false, nil
		}
		p.pendingToolResults = append(p.pendingToolResults, *metadata)
		return true, nil
	default:
		return false, nil
	}
}

func (p *claudeEventParser) registerQuestion(toolCallID string, toolName string) error {
	if toolName != askUserQuestionToolName {
		return nil
	}
	state := p.buildQuestionState(toolCallID, p.popQuestionApproval())
	if state.ResponseID == nil {
		p.pendingQuestionToolCalls = append(p.pendingQuestionToolCalls, toolCallID)
	}
	if err := p.runtime.RegisterQuestion(state); err != nil && !errors.Is(err, ErrRunNotActive) {
		return err
	}
	return nil
}

func (p *claudeEventParser) buildQuestionState(toolCallID string, responseID *string) QuestionState {
	return QuestionState{
		ToolCallID:      toolCallID,
		RunID:           p.request.Run.ID,
		ProjectConfigID: p.request.ProjectConfigID,
		ChatID:          p.request.ChatID,
		SectionID:       cloneOptionalString(p.request.SectionID),
		ResponseID:      cloneOptionalString(responseID),
	}
}

func decodeJSONObject(raw string) (map[string]any, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return map[string]any{}, true
	}
	parsed := map[string]any{}
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return nil, false
	}
	return parsed, true
}

func optionalStringValue(payload map[string]any, key string) *string {
	if payload == nil {
		return nil
	}
	raw, ok := payload[key]
	if !ok {
		return nil
	}
	value := stringValue(raw)
	return &value
}
