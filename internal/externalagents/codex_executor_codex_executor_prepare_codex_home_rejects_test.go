package externalagents

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
)

func TestCodexExecutorPrepareCodexHomeRejectsCamelCaseMCPServersTables(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	content := strings.Join([]string{
		"[mcpServers.filesystem]",
		"url = \"http://example.test/mcp\"",
		"",
	}, "\n")
	if err := os.WriteFile(explicitConfigPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	_, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               "external-config",
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{}, nil, false, nil)
	if err == nil {
		t.Fatal("expected camel-case mcpServers tables to be rejected")
	}
	if !strings.Contains(err.Error(), "mcp_servers") || !strings.Contains(err.Error(), "mcpServers") {
		t.Fatalf("expected camel-case rejection error to mention mcp_servers and mcpServers, got %v", err)
	}
}

func TestCodexExecutorEnsureCodexLoginUsesAPIKeyWhenSessionHomeLacksAuth(t *testing.T) {
	t.Parallel()

	runtimeHome := t.TempDir()
	recordPath := filepath.Join(t.TempDir(), "login-input.txt")
	commandPath := filepath.Join(t.TempDir(), "codex-login.sh")
	script := strings.Join([]string{
		"#!/bin/sh",
		"if [ \"$1\" != \"login\" ] || [ \"$2\" != \"--with-api-key\" ]; then",
		"  echo \"unexpected args: $@\" >&2",
		"  exit 1",
		"fi",
		"IFS= read -r api_key",
		"printf '%s' \"$api_key\" > \"$SETTA_CODEX_LOGIN_RECORD_PATH\"",
		"printf '{\"access_token\":\"from-login\"}\\n' > \"$CODEX_HOME/auth.json\"",
	}, "\n")
	if err := os.WriteFile(commandPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write codex login fixture: %v", err)
	}

	executor := &CodexExecutor{}
	envMap := map[string]string{
		"CODEX_HOME":                    runtimeHome,
		"OPENAI_API_KEY":                "test-api-key",
		"SETTA_CODEX_LOGIN_RECORD_PATH": recordPath,
	}
	if err := executor.ensureCodexLogin(context.Background(), externalagentconfigs.Config{
		CommandPath: stringPtr(commandPath),
	}, t.TempDir(), envMap); err != nil {
		t.Fatalf("ensure codex login: %v", err)
	}

	recordedInput, err := os.ReadFile(recordPath)
	if err != nil {
		t.Fatalf("read recorded login input: %v", err)
	}
	if string(recordedInput) != "test-api-key" {
		t.Fatalf("expected login input to match api key, got %q", string(recordedInput))
	}
	authPayload, err := os.ReadFile(filepath.Join(runtimeHome, "auth.json"))
	if err != nil {
		t.Fatalf("read auth.json created by login: %v", err)
	}
	if string(authPayload) != "{\"access_token\":\"from-login\"}\n" {
		t.Fatalf("expected auth.json from login helper, got %q", string(authPayload))
	}
}

func TestCodexExecutorRoutesApprovalResponsesThroughRuntime(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "approval")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Request approval before replying"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex approval run: %v", err)
	}

	fixture.waitForApproval(t, result.Run.ID, "42")
	if err := fixture.runtime.RespondToApproval("42", true); err != nil {
		t.Fatalf("respond to approval: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) == 0 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	assertCodexApprovalMessages(t, messages)
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func assertCodexApprovalMessages(t *testing.T, messages []any) {
	t.Helper()

	toolResultFound := false
	assistantFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		toolResultFound = toolResultFound || role == "tool" && stringValue(message["tool_name"]) == ApprovalToolName
		assistantFound = assistantFound || role == "assistant" && extractMessageText(message) == "Approval granted"
	}
	if !toolResultFound {
		t.Fatalf("expected persisted approval tool result, got %#v", messages)
	}
	if !assistantFound {
		t.Fatalf("expected persisted assistant follow-up, got %#v", messages)
	}
}

func TestApplyCodexResponseItemAttachesFunctionCallToFollowUpMessage(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}

	applied, toolResult, err := applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"type":      "function_call",
			"call_id":   "call-buffer-1",
			"name":      "mcp__setta__create_top_level_section",
			"arguments": "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}",
		},
	})
	if err != nil {
		t.Fatalf("apply function_call response item: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected function_call result applied=%v toolResult=%#v", applied, toolResult)
	}

	applied, toolResult, err = applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"type": "message",
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "output_text", "text": "Done"},
			},
		},
	})
	if err != nil {
		t.Fatalf("apply message response item: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected message result applied=%v toolResult=%#v", applied, toolResult)
	}
	if len(state.Messages) != 1 {
		t.Fatalf("expected one assistant message, got %#v", state.Messages)
	}
	message := state.Messages[0]
	if extractMessageText(message) != "Done" {
		t.Fatalf("unexpected assistant text %#v", message)
	}
	rawToolCalls, ok := message["tool_calls"].([]any)
	if !ok || len(rawToolCalls) != 1 {
		t.Fatalf("expected one tool call on assistant message, got %#v", message)
	}
}

func TestApplyCodexResponseItemAppendsToolResultOnce(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}
	if _, _, err := applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"type":      "function_call",
			"call_id":   "call-2",
			"name":      "mcp__setta__create_top_level_section",
			"arguments": "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}",
		},
	}); err != nil {
		t.Fatalf("apply function_call response item: %v", err)
	}

	applied, toolResult, err := applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"type":    "function_call_output",
			"call_id": "call-2",
			"output":  "{\"sectionId\":\"6\"}",
		},
	})
	if err != nil {
		t.Fatalf("apply function_call_output response item: %v", err)
	}
	assertCodexResponseItemToolResult(t, state, applied, toolResult)

	applied, toolResult, err = applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"type":    "function_call_output",
			"call_id": "call-2",
			"output":  "{\"sectionId\":\"6\"}",
		},
	})
	if err != nil {
		t.Fatalf("reapply function_call_output response item: %v", err)
	}
	if applied || toolResult != nil {
		t.Fatalf("expected duplicate tool result to be ignored, got applied=%v metadata=%#v", applied, toolResult)
	}
}

func assertCodexResponseItemToolResult(
	t *testing.T,
	state *ChatState,
	applied bool,
	toolResult *codexToolResultMetadata,
) {
	t.Helper()

	if !applied || toolResult == nil {
		t.Fatalf("expected tool result metadata, got applied=%v metadata=%#v", applied, toolResult)
	}
	if toolResult.ToolCallID != "call-2" || toolResult.ToolName != "mcp__setta__create_top_level_section" {
		t.Fatalf("unexpected tool result metadata %#v", toolResult)
	}
	if len(state.Messages) != 2 {
		t.Fatalf("expected assistant message plus tool result, got %#v", state.Messages)
	}
	lastMessage := state.Messages[len(state.Messages)-1]
	if role, _ := messageRole(lastMessage); role != "tool" {
		t.Fatalf("expected tool message, got %#v", lastMessage)
	}
	result, ok := lastMessage["result"].(map[string]any)
	if !ok || stringValue(result["sectionId"]) != "6" {
		t.Fatalf("unexpected tool result payload %#v", lastMessage)
	}
}

func TestCodexEventStateTracksResponseOutputItemFunctionCalls(t *testing.T) {
	t.Parallel()

	eventState := newCodexEventState()
	startedAt := time.Date(2026, time.April, 1, 12, 0, 0, 0, time.UTC)
	eventState.notePayload("run-1", map[string]any{
		"type": "response.output_item.done",
		"item": map[string]any{
			"type":      "function_call",
			"call_id":   "call-output-item-1",
			"name":      "mcp__setta__create_top_level_section",
			"arguments": "{\"projectConfigId\":\"project-alpha\",\"implType\":\"Callable\"}",
		},
	}, nil, startedAt)

	pending, ok := eventState.pendingFunctionCalls["call-output-item-1"]
	if !ok {
		t.Fatalf("expected pending function call after response.output_item.done, got %#v", eventState.pendingFunctionCalls)
	}
	if pending.ToolName != "mcp__setta__create_top_level_section" {
		t.Fatalf("unexpected pending tool name %#v", pending)
	}
	if pending.SettaToolName != "create_top_level_section" {
		t.Fatalf("unexpected pending Setta tool name %#v", pending)
	}
	if !pending.StartedAt.Equal(startedAt) {
		t.Fatalf("unexpected pending start time %#v", pending)
	}

	eventState.notePayload("run-1", map[string]any{
		"type": "response.output_item.done",
		"item": map[string]any{
			"type":    "function_call_output",
			"call_id": "call-output-item-1",
			"output":  "{\"sectionId\":\"section-1\"}",
		},
	}, nil, startedAt.Add(time.Second))

	if _, ok := eventState.pendingFunctionCalls["call-output-item-1"]; ok {
		t.Fatalf("expected output-item function call to resolve, got %#v", eventState.pendingFunctionCalls)
	}
}

func TestApplyCodexResponseItemPreservesReasoningAndText(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}
	applied, toolResult, err := applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"id":   "msg-response-with-reasoning",
			"type": "message",
			"role": "assistant",
			"content": []any{
				map[string]any{
					"type":    "reasoning",
					"summary": []any{map[string]any{"text": "Plan"}},
					"content": []any{map[string]any{"text": "Evaluate options."}},
				},
				map[string]any{
					"type": "output_text",
					"text": "Build the navigator first.",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("apply reasoning response item: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected reasoning result applied=%v toolResult=%#v", applied, toolResult)
	}
	assertCodexReasoningAndTextMessage(t, state.Messages)
}

func assertCodexReasoningAndTextMessage(t *testing.T, messages []map[string]any) {
	t.Helper()

	if len(messages) != 1 {
		t.Fatalf("expected one assistant message, got %#v", messages)
	}
	content, ok := messages[0]["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected reasoning plus text content, got %#v", messages[0])
	}
	first, ok := content[0].(map[string]any)
	if !ok || stringValue(first["type"]) != "thinking" || stringValue(first["summary"]) != "Plan" || stringValue(first["thinking"]) != "Evaluate options." {
		t.Fatalf("unexpected thinking payload %#v", content[0])
	}
	second, ok := content[1].(map[string]any)
	if !ok || stringValue(second["type"]) != "text" || stringValue(second["text"]) != "Build the navigator first." {
		t.Fatalf("unexpected text payload %#v", content[1])
	}
}

func TestApplyCodexResponseItemUsesPayloadTextWithoutContentArray(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}
	applied, toolResult, err := applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"id":   "msg-text-fallback",
			"type": "message",
			"role": "assistant",
			"text": "Fallback assistant text.",
		},
	})
	if err != nil {
		t.Fatalf("apply text fallback response item: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected text fallback result applied=%v toolResult=%#v", applied, toolResult)
	}
	if len(state.Messages) != 1 {
		t.Fatalf("expected one assistant message, got %#v", state.Messages)
	}
	content, ok := state.Messages[0]["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected one text content entry, got %#v", state.Messages[0])
	}
	entry, ok := content[0].(map[string]any)
	if !ok || stringValue(entry["type"]) != "text" || stringValue(entry["text"]) != "Fallback assistant text." {
		t.Fatalf("unexpected text payload %#v", content[0])
	}
}

func TestCodexExecutorPersistsRichResponseItemsAndMCPStatusSnapshot(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "rich")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create something with Codex tools"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start rich codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	assertCodexRichPersistedOutputs(t, persisted)

	statuses, err := fixture.runtime.ExternalRuntimeStatuses(stringPtr(result.ChatID), stringPtr(fixture.engineID))
	if err != nil {
		t.Fatalf("read external runtime statuses: %v", err)
	}
	if len(statuses) != 1 || statuses[0].ServerID != "setta" || statuses[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("unexpected external runtime statuses %#v", statuses)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func assertCodexRichPersistedOutputs(t *testing.T, persisted agentruns.Run) {
	t.Helper()

	rawSnapshot, ok := persisted.Outputs[externalMCPStatusSnapshotKey].([]any)
	if !ok || len(rawSnapshot) != 1 {
		t.Fatalf("expected one persisted external MCP status, got %#v", persisted.Outputs)
	}
	messages := persistedOutputMessages(t, persisted, 2)
	assertCodexRichMessages(t, messages)
	assertCodexToolResultEvent(t, persisted.Events, "call-create")
}

func persistedOutputMessages(t *testing.T, persisted agentruns.Run, minCount int) []any {
	t.Helper()

	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < minCount {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	return messages
}

func assertCodexRichMessages(t *testing.T, messages []any) {
	t.Helper()

	assistantFound := false
	toolResultFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		assistantFound = assistantFound || codexRichAssistantMessageMatches(message, role)
		toolResultFound = toolResultFound || role == "tool" && stringValue(message["tool_call_id"]) == "call-create"
	}
	if !assistantFound {
		t.Fatalf("expected persisted assistant message with tool call and reasoning, got %#v", messages)
	}
	if !toolResultFound {
		t.Fatalf("expected persisted tool result message, got %#v", messages)
	}
}

func codexRichAssistantMessageMatches(message map[string]any, role string) bool {
	if role != "assistant" || extractMessageText(message) != "Created the top-level section." {
		return false
	}
	rawToolCalls, ok := message["tool_calls"].([]any)
	if !ok || len(rawToolCalls) == 0 {
		return false
	}
	content, _ := message["content"].([]any)
	if len(content) == 0 {
		return false
	}
	first, _ := content[0].(map[string]any)
	return stringValue(first["type"]) == "thinking"
}

func assertCodexToolResultEvent(t *testing.T, events []agentruns.RunEvent, toolCallID string) {
	t.Helper()

	for _, event := range events {
		if event.Type == "tool_result" && stringValue(event.Payload["toolCallId"]) == toolCallID {
			return
		}
	}
	t.Fatalf("expected persisted tool_result event for %s, got %#v", toolCallID, events)
}

func TestCodexExecutorPersistsRawToolItemsAndBufferedOutput(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "raw")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Run raw Codex tools"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start raw codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	assertCodexRawPersistedOutputs(t, persisted)

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func assertCodexRawPersistedOutputs(t *testing.T, persisted agentruns.Run) {
	t.Helper()

	messages := persistedOutputMessages(t, persisted, 5)
	assertCodexRawMessages(t, messages)
	for _, expectedID := range []string{"cmd-raw-1", "file-raw-1", "mcp-raw-1", "web-raw-1"} {
		assertCodexToolResultEvent(t, persisted.Events, expectedID)
	}
}

type codexRawMessageMatches struct {
	assistant bool
	command   bool
	file      bool
	mcp       bool
	generic   bool
}

func assertCodexRawMessages(t *testing.T, messages []any) {
	t.Helper()

	matches := codexRawMessageMatches{}
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		inspectCodexRawMessage(t, message, &matches)
	}
	if !matches.assistant {
		t.Fatalf("expected assistant message with raw tool calls, got %#v", messages)
	}
	if !matches.command || !matches.file || !matches.mcp || !matches.generic {
		t.Fatalf("expected all raw tool result messages, got %#v", messages)
	}
}

func inspectCodexRawMessage(t *testing.T, message map[string]any, matches *codexRawMessageMatches) {
	t.Helper()

	role, _ := messageRole(message)
	switch role {
	case "assistant":
		matches.assistant = matches.assistant || codexRawAssistantMessageMatches(t, message)
	case "tool":
		inspectCodexRawToolMessage(t, message, matches)
	}
}

func codexRawAssistantMessageMatches(t *testing.T, message map[string]any) bool {
	t.Helper()

	if extractMessageText(message) != "Raw tools finished." {
		return false
	}
	rawToolCalls, ok := message["tool_calls"].([]any)
	if !ok || len(rawToolCalls) != 4 {
		t.Fatalf("expected four tool calls on raw assistant message, got %#v", message)
	}
	expectedNames := map[string]string{
		"cmd-raw-1":  codexCommandExecutionToolName,
		"file-raw-1": codexFileChangeToolName,
		"mcp-raw-1":  "mcp__setta__echo",
		"web-raw-1":  "webSearch",
	}
	for _, rawToolCall := range rawToolCalls {
		toolCall, ok := rawToolCall.(map[string]any)
		if !ok {
			continue
		}
		toolCallID := stringValue(toolCall["id"])
		function, _ := mapValue(toolCall["function"])
		if expectedNames[toolCallID] != stringValue(function["name"]) {
			t.Fatalf("unexpected raw tool call payload %#v", toolCall)
		}
	}
	return true
}

func inspectCodexRawToolMessage(t *testing.T, message map[string]any, matches *codexRawMessageMatches) {
	t.Helper()

	switch stringValue(message["tool_call_id"]) {
	case "cmd-raw-1":
		resultPayload, _ := mapValue(message["result"])
		if stringValue(resultPayload["aggregated_output"]) != "command output\n" {
			t.Fatalf("expected buffered command output, got %#v", message)
		}
		matches.command = true
	case "file-raw-1":
		resultPayload, _ := mapValue(message["result"])
		if stringValue(resultPayload["diff"]) != "--- a/file.txt\n+++ b/file.txt\n" {
			t.Fatalf("expected buffered file diff, got %#v", message)
		}
		matches.file = true
	case "mcp-raw-1":
		if stringValue(message["tool_name"]) != "mcp__setta__echo" {
			t.Fatalf("expected normalized MCP tool name, got %#v", message)
		}
		matches.mcp = true
	case "web-raw-1":
		if stringValue(message["tool_name"]) != "webSearch" {
			t.Fatalf("expected generic tool result, got %#v", message)
		}
		matches.generic = true
	}
}

func TestApplyCodexStreamEventReusesSyntheticToolMessageForAssistantDelta(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}
	eventState := newCodexEventState()

	applied, toolResult, err := applyCodexStreamEvent(state, eventState, map[string]any{
		"method": "item/started",
		"params": map[string]any{
			"item": map[string]any{
				"id":        "mcp-raw-attach",
				"type":      "mcpToolCall",
				"server":    "setta",
				"tool":      "echo",
				"arguments": map[string]any{"text": "ping"},
			},
		},
	})
	if err != nil {
		t.Fatalf("apply raw MCP start: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected raw MCP start result applied=%v toolResult=%#v", applied, toolResult)
	}

	applied, toolResult, err = applyCodexStreamEvent(state, eventState, map[string]any{
		"method": "item/assistantMessage/delta",
		"params": map[string]any{
			"itemId": "assistant-real-1",
			"delta":  map[string]any{"text": "Attached text"},
		},
	})
	if err != nil {
		t.Fatalf("apply assistant delta after synthetic tool message: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected assistant delta result applied=%v toolResult=%#v", applied, toolResult)
	}
	assertCodexAdoptedSyntheticToolMessage(t, state.Messages)
}

func assertCodexAdoptedSyntheticToolMessage(t *testing.T, messages []map[string]any) {
	t.Helper()

	if len(messages) != 1 {
		t.Fatalf("expected one merged assistant message, got %#v", messages)
	}
	message := messages[0]
	if stringValue(message["id"]) != "assistant-real-1" {
		t.Fatalf("expected synthetic message id to be adopted, got %#v", message)
	}
	if extractMessageText(message) != "Attached text" {
		t.Fatalf("expected assistant delta text to land on adopted message, got %#v", message)
	}
	rawToolCalls, ok := message["tool_calls"].([]any)
	if !ok || len(rawToolCalls) != 1 {
		t.Fatalf("expected adopted tool call on assistant message, got %#v", message)
	}
}
