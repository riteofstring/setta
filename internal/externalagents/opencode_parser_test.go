package externalagents

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestOpenCodeEventParserAccumulatesTextAndReasoningWithoutClobbering(t *testing.T) {
	t.Parallel()

	// Text and reasoning deltas should share one assistant message without overwriting each other.
	parser := newOpenCodeEventParser(nil, StartRequest{})
	state := &ChatState{Messages: []map[string]any{}, ToolCallArguments: map[string]string{}}

	changed, err := parser.handle(map[string]any{
		"type": "message.updated",
		"properties": map[string]any{
			"info": map[string]any{
				"id":   "msg-1",
				"role": "assistant",
			},
		},
	}, state)
	if err != nil || changed {
		t.Fatalf("prime assistant message changed=%v err=%v", changed, err)
	}

	changed, err = parser.handle(map[string]any{
		"type": "message.part.updated",
		"properties": map[string]any{
			"part": map[string]any{
				"id":        "part-text",
				"messageID": "msg-1",
				"type":      "text",
				"text":      "Hello",
			},
			"delta": "Hello",
		},
	}, state)
	if err != nil || !changed {
		t.Fatalf("apply text delta changed=%v err=%v", changed, err)
	}

	changed, err = parser.handle(map[string]any{
		"type": "message.part.updated",
		"properties": map[string]any{
			"part": map[string]any{
				"id":        "part-thinking",
				"messageID": "msg-1",
				"type":      "reasoning",
				"thinking":  "Thinking",
			},
			"delta": "Thinking",
		},
	}, state)
	if err != nil || !changed {
		t.Fatalf("apply thinking delta changed=%v err=%v", changed, err)
	}

	message := requireOpenCodeMessageByID(t, state, "msg-1")
	if got := extractMessageText(message); got != "Hello" {
		t.Fatalf("expected assistant text to survive, got %#v", message["content"])
	}
	content, ok := message["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected text and thinking blocks, got %#v", message["content"])
	}
	thinking, ok := content[1].(map[string]any)
	if !ok || stringValue(thinking["type"]) != "thinking" || stringValue(thinking["thinking"]) != "Thinking" {
		t.Fatalf("expected thinking block, got %#v", message["content"])
	}
}

func TestOpenCodeEventParserDeduplicatesTextSnapshotsByPartID(t *testing.T) {
	t.Parallel()

	// Snapshot replays with the same part id should not duplicate already-applied text.
	parser := newOpenCodeEventParser(nil, StartRequest{})
	state := &ChatState{Messages: []map[string]any{}, ToolCallArguments: map[string]string{}}

	_, err := parser.handle(map[string]any{
		"type": "message.updated",
		"properties": map[string]any{
			"info": map[string]any{
				"id":   "msg-2",
				"role": "assistant",
			},
		},
	}, state)
	if err != nil {
		t.Fatalf("prime assistant message: %v", err)
	}

	changed, err := parser.handle(map[string]any{
		"type": "message.part.updated",
		"properties": map[string]any{
			"part": map[string]any{
				"id":        "part-2",
				"messageID": "msg-2",
				"type":      "text",
				"text":      "Hello",
			},
			"delta": "Hello",
		},
	}, state)
	if err != nil || !changed {
		t.Fatalf("apply text delta changed=%v err=%v", changed, err)
	}

	changed, err = parser.handle(map[string]any{
		"type": "message.part.updated",
		"properties": map[string]any{
			"part": map[string]any{
				"id":        "part-2",
				"messageID": "msg-2",
				"type":      "text",
				"text":      "Hello",
			},
		},
	}, state)
	if err != nil {
		t.Fatalf("apply text snapshot: %v", err)
	}
	if changed {
		t.Fatalf("expected duplicate snapshot to be ignored, got %#v", state.Messages)
	}

	message := requireOpenCodeMessageByID(t, state, "msg-2")
	if got := extractMessageText(message); got != "Hello" {
		t.Fatalf("expected deduplicated assistant text, got %#v", message["content"])
	}
}

func TestOpenCodeEventParserPersistsToolCallArgumentsAndTerminalResult(t *testing.T) {
	t.Parallel()

	// Tool parts should keep JSON arguments, upsert the assistant tool call, and append one terminal tool result.
	parser := newOpenCodeEventParser(nil, StartRequest{})
	state := &ChatState{Messages: []map[string]any{}, ToolCallArguments: map[string]string{}}

	_, err := parser.handle(map[string]any{
		"type": "message.updated",
		"properties": map[string]any{
			"info": map[string]any{
				"id":   "msg-3",
				"role": "assistant",
			},
		},
	}, state)
	if err != nil {
		t.Fatalf("prime assistant message: %v", err)
	}

	changed, err := parser.handle(map[string]any{
		"type": "message.part.updated",
		"properties": map[string]any{
			"part": map[string]any{
				"type":      "tool",
				"messageID": "msg-3",
				"callID":    "call-1",
				"tool":      "bash",
				"state": map[string]any{
					"status": "pending",
					"input":  map[string]any{"command": "echo hi"},
					"raw":    "echo hi",
				},
			},
		},
	}, state)
	if err != nil || !changed {
		t.Fatalf("apply tool delta changed=%v err=%v", changed, err)
	}
	if results := parser.takeToolResults(); len(results) != 0 {
		t.Fatalf("expected pending tool part to omit terminal result, got %#v", results)
	}

	message := requireOpenCodeMessageByID(t, state, "msg-3")
	rawToolCalls, ok := message["tool_calls"].([]any)
	if !ok || len(rawToolCalls) != 1 {
		t.Fatalf("expected one assistant tool call, got %#v", message["tool_calls"])
	}
	toolCall, ok := rawToolCalls[0].(map[string]any)
	if !ok {
		t.Fatalf("expected tool call payload, got %#v", rawToolCalls[0])
	}
	function, ok := mapValue(toolCall["function"])
	if !ok || stringValue(function["name"]) != "bash" {
		t.Fatalf("expected bash tool call, got %#v", toolCall)
	}
	arguments, ok := mapValue(function["arguments"])
	if !ok || stringValue(arguments["command"]) != "echo hi" {
		t.Fatalf("expected structured tool arguments, got %#v", function["arguments"])
	}

	encoded := strings.TrimSpace(state.ToolCallArguments["call-1"])
	if encoded == "" {
		t.Fatalf("expected raw JSON tool arguments, got %#v", state.ToolCallArguments)
	}
	parsed := map[string]any{}
	if err := json.Unmarshal([]byte(encoded), &parsed); err != nil {
		t.Fatalf("decode stored tool arguments: %v", err)
	}
	if stringValue(parsed["command"]) != "echo hi" {
		t.Fatalf("expected stored command argument, got %#v", parsed)
	}

	changed, err = parser.handle(map[string]any{
		"type": "message.part.updated",
		"properties": map[string]any{
			"part": map[string]any{
				"type":      "tool",
				"messageID": "msg-3",
				"callID":    "call-1",
				"tool":      "bash",
				"state": map[string]any{
					"status": "completed",
					"input":  map[string]any{"command": "echo hi"},
					"output": "done",
				},
			},
		},
	}, state)
	if err != nil || !changed {
		t.Fatalf("apply completed tool payload changed=%v err=%v", changed, err)
	}

	results := parser.takeToolResults()
	if len(results) != 1 {
		t.Fatalf("expected one terminal tool result, got %#v", results)
	}
	if results[0].ToolCallID != "call-1" || results[0].ToolName != "bash" || stringValue(results[0].Result) != "done" || results[0].IsError {
		t.Fatalf("unexpected tool result metadata %#v", results[0])
	}
	if _, ok := state.ToolCallArguments["call-1"]; ok {
		t.Fatalf("expected terminal tool result to clear raw arguments, got %#v", state.ToolCallArguments)
	}

	toolMessage := requireOpenCodeToolResultMessage(t, state, "call-1")
	if stringValue(toolMessage["tool_name"]) != "bash" || stringValue(toolMessage["tool_call_id"]) != "call-1" {
		t.Fatalf("unexpected tool result message %#v", toolMessage)
	}
	if stringValue(toolMessage["result"]) != "done" {
		t.Fatalf("expected persisted tool output, got %#v", toolMessage["result"])
	}
}

func TestOpenCodeEventParserGenericPayloadKeepsSamePayloadTextAndNormalizedToolAliases(t *testing.T) {
	t.Parallel()

	// Same-payload assistant text, tool calls, and tool results should persist together with normalized Setta aliases.
	parser := newOpenCodeEventParser(nil, StartRequest{})
	state := &ChatState{Messages: []map[string]any{}, ToolCallArguments: map[string]string{}}

	changed, err := parser.handle(map[string]any{
		"id":   "msg-4",
		"text": "Task A is done.",
		"tool_call": map[string]any{
			"id":        "tool-report-4",
			"name":      "setta_report_completion_status",
			"arguments": "{}",
		},
		"tool_call_id": "tool-report-4",
		"tool_name":    "setta_report_completion_status",
		"result": map[string]any{
			"structuredContent": map[string]any{
				"completionIntent":     true,
				"requiresVerification": true,
			},
		},
	}, state)
	if err != nil || !changed {
		t.Fatalf("apply same-payload event changed=%v err=%v", changed, err)
	}

	message := requireOpenCodeMessageByID(t, state, "msg-4")
	if got := extractMessageText(message); got != "Task A is done." {
		t.Fatalf("expected assistant text to survive same payload, got %#v", message["content"])
	}
	rawToolCalls, ok := message["tool_calls"].([]any)
	if !ok || len(rawToolCalls) != 1 {
		t.Fatalf("expected normalized tool call, got %#v", message["tool_calls"])
	}
	toolCall, ok := rawToolCalls[0].(map[string]any)
	if !ok {
		t.Fatalf("expected tool call payload, got %#v", rawToolCalls[0])
	}
	function, ok := mapValue(toolCall["function"])
	if !ok || stringValue(function["name"]) != "setta__report_completion_status" {
		t.Fatalf("expected normalized tool alias, got %#v", toolCall)
	}

	results := parser.takeToolResults()
	if len(results) != 1 || results[0].ToolName != "setta__report_completion_status" || results[0].ToolCallID != "tool-report-4" {
		t.Fatalf("expected normalized tool result metadata, got %#v", results)
	}

	if len(state.Messages) != 2 {
		t.Fatalf("expected assistant message plus tool result, got %#v", state.Messages)
	}
	toolMessage := requireOpenCodeToolResultMessage(t, state, "tool-report-4")
	if stringValue(toolMessage["tool_name"]) != "setta__report_completion_status" {
		t.Fatalf("expected normalized tool result alias, got %#v", toolMessage)
	}
}

func TestOpenCodeEventParserCompletedMessageUpdatedDoesNotFinalizeStateDirectly(t *testing.T) {
	t.Parallel()

	// Go finalizes OpenCode runs on process exit, so completed message.updated payloads should not synthesize parser-only terminal state.
	parser := newOpenCodeEventParser(nil, StartRequest{})
	state := &ChatState{Messages: []map[string]any{}, ToolCallArguments: map[string]string{}}

	_, err := parser.handle(map[string]any{
		"type": "message.updated",
		"properties": map[string]any{
			"info": map[string]any{
				"id":   "msg-5",
				"role": "assistant",
			},
		},
	}, state)
	if err != nil {
		t.Fatalf("prime assistant message: %v", err)
	}
	_, err = parser.handle(map[string]any{
		"type": "message.part.updated",
		"properties": map[string]any{
			"part": map[string]any{
				"id":        "part-5",
				"messageID": "msg-5",
				"type":      "text",
				"text":      "Hello",
			},
			"delta": "Hello",
		},
	}, state)
	if err != nil {
		t.Fatalf("apply text delta: %v", err)
	}

	changed, err := parser.handle(map[string]any{
		"type": "message.updated",
		"properties": map[string]any{
			"info": map[string]any{
				"id":   "msg-5",
				"role": "assistant",
				"time": map[string]any{"completed": 2},
			},
		},
	}, state)
	if err != nil {
		t.Fatalf("apply completed message update: %v", err)
	}
	if changed {
		t.Fatalf("expected completed message update to defer finalization to process exit, got %#v", state.Messages)
	}
	if results := parser.takeToolResults(); len(results) != 0 {
		t.Fatalf("expected no terminal tool results, got %#v", results)
	}

	message := requireOpenCodeMessageByID(t, state, "msg-5")
	if got := extractMessageText(message); got != "Hello" {
		t.Fatalf("expected assistant text to remain unchanged, got %#v", message["content"])
	}
}

func requireOpenCodeMessageByID(t *testing.T, state *ChatState, messageID string) map[string]any {
	t.Helper()

	index := findMessageIndex(state.Messages, messageID)
	if index == -1 {
		t.Fatalf("expected message %q in %#v", messageID, state.Messages)
	}
	return state.Messages[index]
}

func requireOpenCodeToolResultMessage(t *testing.T, state *ChatState, toolCallID string) map[string]any {
	t.Helper()

	for _, message := range state.Messages {
		role, err := messageRole(message)
		if err != nil || role != "tool" {
			continue
		}
		if stringValue(message["tool_call_id"]) == toolCallID {
			return message
		}
	}
	t.Fatalf("expected tool result message for %q in %#v", toolCallID, state.Messages)
	return nil
}
