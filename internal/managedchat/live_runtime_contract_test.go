package managedchat

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"setta/internal/realtime"
	"setta/internal/tools"
)

type managedChatStreamContractFixture struct {
	Cases []managedChatStreamContractCase `json:"cases"`
}

type managedChatStreamContractCase struct {
	Name          string                     `json:"name"`
	InitialState  managedChatStreamStateCase `json:"initialState"`
	Chunks        []json.RawMessage          `json:"chunks"`
	ExpectedState managedChatStreamStateCase `json:"expectedState"`
}

type managedChatStreamStateCase struct {
	Messages           []map[string]any  `json:"messages"`
	WaitingForResponse bool              `json:"waitingForResponse"`
	ToolCallArguments  map[string]string `json:"toolCallArguments"`
}

func TestApplyStreamChunkContractCases(t *testing.T) {
	t.Parallel()

	fixture := loadManagedChatStreamContractFixture(t)
	for _, fixtureCase := range fixture.Cases {
		fixtureCase := fixtureCase
		t.Run(fixtureCase.Name, func(t *testing.T) {
			t.Parallel()

			state := ChatState{
				Messages:           cloneMessageSlice(fixtureCase.InitialState.Messages),
				ToolCallArguments:  cloneStringMap(fixtureCase.InitialState.ToolCallArguments),
				WaitingForResponse: fixtureCase.InitialState.WaitingForResponse,
			}
			nextState := &state
			for _, rawChunk := range fixtureCase.Chunks {
				chunk := decodeManagedChatStreamContractChunk(t, rawChunk)
				var err error
				nextState, err = applyStreamChunk(*nextState, chunk)
				if err != nil {
					t.Fatalf("apply stream chunk: %v", err)
				}
			}

			if nextState.WaitingForResponse != fixtureCase.ExpectedState.WaitingForResponse {
				t.Fatalf(
					"expected waitingForResponse=%t, got %t",
					fixtureCase.ExpectedState.WaitingForResponse,
					nextState.WaitingForResponse,
				)
			}
			if !reflect.DeepEqual(nextState.Messages, fixtureCase.ExpectedState.Messages) {
				t.Fatalf(
					"unexpected messages\nexpected: %s\nactual:   %s",
					mustMarshalManagedChatStreamState(t, fixtureCase.ExpectedState.Messages),
					mustMarshalManagedChatStreamState(t, nextState.Messages),
				)
			}
			if !reflect.DeepEqual(nextState.ToolCallArguments, fixtureCase.ExpectedState.ToolCallArguments) {
				t.Fatalf(
					"unexpected toolCallArguments\nexpected: %#v\nactual:   %#v",
					fixtureCase.ExpectedState.ToolCallArguments,
					nextState.ToolCallArguments,
				)
			}
		})
	}
}

func loadManagedChatStreamContractFixture(t *testing.T) managedChatStreamContractFixture {
	t.Helper()

	fixturePath := filepath.Join("..", "..", "tests", "fixtures", "llm", "managed_chat_stream_contract_cases.json")
	content, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read managed chat stream contract fixture: %v", err)
	}
	var fixture managedChatStreamContractFixture
	if err := json.Unmarshal(content, &fixture); err != nil {
		t.Fatalf("decode managed chat stream contract fixture: %v", err)
	}
	return fixture
}

func decodeManagedChatStreamContractChunk(t *testing.T, rawChunk json.RawMessage) any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(rawChunk, &payload); err != nil {
		t.Fatalf("decode contract chunk: %v", err)
	}
	chunkType := realtime.StreamingEventType(stringValue(payload["type"]))
	switch chunkType {
	case realtime.StreamingEventTypeMessageStart:
		message, err := normalizeMessage(payload["message"])
		if err != nil {
			t.Fatalf("normalize message start payload: %v", err)
		}
		return realtime.MessageStartEvent{
			Type:    chunkType,
			Message: message,
		}
	case realtime.StreamingEventTypeDelta:
		return realtime.MessageDeltaEvent{
			Type:      chunkType,
			MessageID: stringValue(payload["message_id"]),
			Content:   decodeManagedChatStreamMessageDeltaContent(t, payload["content"]),
		}
	case realtime.StreamingEventTypeMessageFinalized:
		message, err := normalizeMessage(payload["message"])
		if err != nil {
			t.Fatalf("normalize finalized message payload: %v", err)
		}
		return realtime.MessageFinalizedEvent{
			Type:    chunkType,
			Message: message,
		}
	case realtime.StreamingEventTypeMessageStop:
		return realtime.MessageStopEvent{
			Type:      chunkType,
			MessageID: stringValue(payload["message_id"]),
		}
	case realtime.StreamingEventTypeToolCallDelta:
		return realtime.ToolCallDeltaEvent{
			Type:           chunkType,
			MessageID:      stringValue(payload["message_id"]),
			ToolCallID:     stringValue(payload["tool_call_id"]),
			ToolName:       optionalStringValue(payload["tool_name"]),
			ArgumentsDelta: stringValue(payload["arguments_delta"]),
		}
	case realtime.StreamingEventTypeToolArgumentPreview:
		return realtime.ToolArgumentPreviewDeltaEvent{
			Type:            chunkType,
			MessageID:       stringValue(payload["message_id"]),
			ToolCallID:      stringValue(payload["tool_call_id"]),
			ToolName:        stringValue(payload["tool_name"]),
			ArgumentsDelta:  stringValue(payload["arguments_delta"]),
			PreviewKind:     tools.PreviewKind(stringValue(payload["preview_kind"])),
			TargetIDsByType: realtime.NewToolArgumentPreviewTargetIDsFromMap(decodePreviewTargetIDsByType(payload)),
		}
	case realtime.StreamingEventTypeToolResult:
		result, err := normalizeMessage(payload["result"])
		if err != nil {
			t.Fatalf("normalize tool result payload: %v", err)
		}
		return realtime.ToolResultEvent{
			Type:   chunkType,
			Result: result,
		}
	default:
		t.Fatalf("unsupported contract chunk type %q", chunkType)
		return nil
	}
}

func decodeManagedChatStreamMessageDeltaContent(t *testing.T, rawValue any) []any {
	t.Helper()

	rawContent, _ := rawValue.([]any)
	content := make([]any, 0, len(rawContent))
	for _, rawEntry := range rawContent {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			t.Fatalf("message delta content entry must be an object, got %T", rawEntry)
		}
		index, ok := extractInt(entry["index"])
		if !ok {
			index = 0
		}
		switch stringValue(entry["type"]) {
		case realtime.MessageContentTypeTextDelta:
			content = append(content, realtime.MessageTextDelta{
				Type:  realtime.MessageContentTypeTextDelta,
				Index: index,
				Text:  stringValue(entry["text"]),
			})
		case realtime.MessageContentTypeThinkingDelta:
			content = append(content, decodeManagedChatStreamThinkingDelta(entry, index))
		default:
			t.Fatalf("unsupported message delta content type %q", stringValue(entry["type"]))
		}
	}
	return content
}

func decodeManagedChatStreamThinkingDelta(entry map[string]any, index int) realtime.MessageThinkingDelta {
	var summary *string
	if rawSummary, exists := entry["summary"]; exists {
		summary = optionalString(rawSummary)
	}
	var signature *string
	if rawSignature, exists := entry["signature"]; exists {
		signature = optionalString(rawSignature)
	}
	return realtime.MessageThinkingDelta{
		Type:      realtime.MessageContentTypeThinkingDelta,
		Index:     index,
		Thinking:  stringValue(entry["thinking"]),
		Summary:   summary,
		Signature: signature,
	}
}

func decodePreviewTargetIDsByType(payload map[string]any) map[string][]string {
	targetIDsByType := map[string][]string{}
	rawTargetIDs, ok := payload["target_ids_by_type"].(map[string]any)
	if !ok {
		return targetIDsByType
	}
	for rawType, rawIDs := range rawTargetIDs {
		idList, ok := rawIDs.([]any)
		if !ok {
			continue
		}
		targetIDsByType[rawType] = decodePreviewTargetIDList(idList)
	}
	return targetIDsByType
}

func decodePreviewTargetIDList(idList []any) []string {
	values := make([]string, 0, len(idList))
	for _, rawID := range idList {
		value := stringValue(rawID)
		if value == "" {
			continue
		}
		values = append(values, value)
	}
	return values
}

func optionalStringValue(value any) *string {
	if value == nil {
		return nil
	}
	str := stringValue(value)
	return &str
}

func mustMarshalManagedChatStreamState(t *testing.T, messages []map[string]any) string {
	t.Helper()

	content, err := json.Marshal(messages)
	if err != nil {
		t.Fatalf("marshal managed chat stream state: %v", err)
	}
	return string(content)
}
