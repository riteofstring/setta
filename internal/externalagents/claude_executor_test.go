package externalagents

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
)

func TestClaudeExecutorCompletesRunAndPersistsAssistantOutput(t *testing.T) {
	// These tests launch nested subprocess fixtures, so keep them serial.
	fixture := newClaudeExecutorFixture(t, "complete")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello from Claude"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	if got := resolveRunOutputString(persisted, "sessionId"); got != "session-complete" {
		t.Fatalf("expected persisted session id, got %q", got)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := messages[len(messages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message, got %#v", messages[len(messages)-1])
	}
	if got := extractMessageText(lastMessage); got != "Hello from Claude" {
		t.Fatalf("unexpected assistant text %q", got)
	}
	usage, ok := persisted.Outputs["usage"].(map[string]any)
	if !ok || int(usage["input_tokens"].(float64)) != 12 {
		t.Fatalf("expected persisted usage payload, got %#v", persisted.Outputs["usage"])
	}

	settingsPath := externalagentconfigs.ResolveClaudeSettingsPath(fixture.config, fixture.root)
	content, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read claude settings: %v", err)
	}
	settings := map[string]any{}
	if err := json.Unmarshal(content, &settings); err != nil {
		t.Fatalf("decode claude settings: %v", err)
	}
	permissions, ok := settings["permissions"].(map[string]any)
	if !ok {
		t.Fatalf("expected permissions in managed claude settings, got %#v", settings)
	}
	allow, ok := permissions["allow"].([]any)
	if !ok || len(allow) != 1 || stringValue(allow[0]) != "Read" {
		t.Fatalf("unexpected managed claude permissions %#v", permissions)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestClaudeExecutorRunSurvivesCallerContextCancellation(t *testing.T) {
	fixture := newClaudeExecutorFixture(t, "delayed_complete")
	ctx, cancel := context.WithCancel(context.Background())
	result, err := fixture.send.StartChat(ctx, StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello from Claude after startup"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude delayed run: %v", err)
	}
	cancel()

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status after caller cancellation, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := messages[len(messages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message, got %#v", messages[len(messages)-1])
	}
	if got := extractMessageText(lastMessage); got != "Hello from Claude after delay" {
		t.Fatalf("unexpected assistant text %q", got)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestClaudeExecutorGeneratesTempMCPConfigWhenMissing(t *testing.T) {
	// This run inspects the generated Claude temp MCP config inside the fixture
	// sidecar, then exposes the path so the test can verify cleanup afterwards.
	fixture := newClaudeExecutorFixture(t, "generated_mcp_config")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Inspect the generated MCP config"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude generated-mcp run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := messages[len(messages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message, got %#v", messages[len(messages)-1])
	}
	configPath := extractMessageText(lastMessage)
	if filepath.Base(configPath) != claudeMCPConfigName {
		t.Fatalf("expected assistant message to carry generated %q path, got %q", claudeMCPConfigName, configPath)
	}
	statuses := loadExternalMCPStatusSnapshot(persisted.Outputs)
	if len(statuses) != 1 {
		t.Fatalf("expected one persisted external MCP status, got %#v", statuses)
	}
	if statuses[0].ServerID != mcpx.DefaultServerID {
		t.Fatalf("expected generated MCP status for %q, got %#v", mcpx.DefaultServerID, statuses)
	}
	if statuses[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected generated MCP transport streamable_http, got %#v", statuses[0])
	}
	if statuses[0].Endpoint != fixture.executor.settaServerURL {
		t.Fatalf("expected generated MCP endpoint %q, got %#v", fixture.executor.settaServerURL, statuses[0])
	}
	if statuses[0].State != mcpx.RuntimeStateUnknown {
		t.Fatalf("expected generated MCP status to remain unknown before runtime reports, got %#v", statuses[0])
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
	if _, err := os.Stat(configPath); !os.IsNotExist(err) {
		t.Fatalf("expected generated MCP config cleanup, stat err=%v", err)
	}
}

func TestClaudeExecutorPassesWhitelistedEnvIntoStartPayload(t *testing.T) {
	fixture := newClaudeExecutorFixture(t, "env_echo")
	if err := os.WriteFile(llmconfig.ManagedAPIKeysPath(fixture.root), []byte(strings.Join([]string{
		"PLAIN_KEY=plain-dot-env-value",
		`SETTA_MANAGED_LLM_API_KEY_NAMES=["WHITESPACE_KEY"]`,
		"WHITESPACE_KEY=managed-fallback",
		"",
	}, "\n")), 0o600); err != nil {
		t.Fatalf("write managed env payload: %v", err)
	}

	config := fixture.config
	config.EnvVarWhitelist = []string{"PROCESS_KEY", "WHITESPACE_KEY", "PLAIN_KEY", "MISSING_KEY"}
	if err := fixture.send.configs.Write([]externalagentconfigs.Config{config}); err != nil {
		t.Fatalf("rewrite external config with env whitelist: %v", err)
	}
	fixture.executor.processEnv = map[string]string{
		"PATH":           "/usr/bin",
		"HOME":           "/tmp/home",
		"PROCESS_KEY":    "process-secret",
		"WHITESPACE_KEY": "   ",
	}

	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Inspect Claude env handoff"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude env handoff run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	if got := resolveRunOutputString(persisted, "sessionId"); got != "session-env" {
		t.Fatalf("expected persisted session id, got %q", got)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := messages[len(messages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message, got %#v", messages[len(messages)-1])
	}
	if got := extractMessageText(lastMessage); got != "Env handoff ok" {
		t.Fatalf("unexpected assistant text %q", got)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestClaudeExecutorRoutesApprovalResponsesThroughRuntime(t *testing.T) {
	fixture := newClaudeExecutorFixture(t, "approval")
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
		t.Fatalf("start claude approval run: %v", err)
	}

	fixture.waitForApproval(t, result.Run.ID, "approval-1")
	if err := fixture.runtime.RespondToApproval("approval-1", true); err != nil {
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
	toolResultFound := false
	assistantFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		if role == "tool" && stringValue(message["tool_name"]) == ApprovalToolName {
			toolResultFound = true
		}
		if role == "assistant" && extractMessageText(message) == "Approval granted" {
			assistantFound = true
		}
	}
	if !toolResultFound {
		t.Fatalf("expected persisted approval tool result, got %#v", messages)
	}
	if !assistantFound {
		t.Fatalf("expected persisted assistant follow-up, got %#v", messages)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestClaudeExecutorRoutesQuestionResponsesThroughRuntime(t *testing.T) {
	fixture := newClaudeExecutorFixture(t, "question")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Ask me one question before replying"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude question run: %v", err)
	}

	fixture.waitForQuestion(t, result.Run.ID, "question-1")
	if err := fixture.runtime.RespondToQuestion("question-1", map[string]string{"Language": "Go"}); err != nil {
		t.Fatalf("respond to claude question: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	if got := resolveRunOutputString(persisted, "sessionId"); got != "session-question" {
		t.Fatalf("expected persisted session id, got %q", got)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) == 0 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	questionResultFound := false
	assistantFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		if role == "tool" && stringValue(message["tool_name"]) == askUserQuestionToolName {
			resultPayload, ok := mapValue(message["result"])
			if !ok {
				t.Fatalf("expected question result payload, got %#v", message["result"])
			}
			answers, ok := mapValue(resultPayload["answers"])
			if !ok || stringValue(answers["Language"]) != "Go" {
				t.Fatalf("unexpected question answers %#v", resultPayload)
			}
			questionResultFound = true
		}
		if role == "assistant" && extractMessageText(message) == "Chosen: Go" {
			assistantFound = true
		}
	}
	if !questionResultFound {
		t.Fatalf("expected persisted question tool result, got %#v", messages)
	}
	if !assistantFound {
		t.Fatalf("expected persisted assistant follow-up, got %#v", messages)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestClaudeExecutorRoutesMultipleQuestionResponsesThroughRuntime(t *testing.T) {
	fixture := newClaudeExecutorFixture(t, "question_multiple")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Ask me two questions before continuing"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude multi-question run: %v", err)
	}

	fixture.waitForQuestion(t, result.Run.ID, "question-1")
	if err := fixture.runtime.RespondToQuestion("question-1", map[string]string{
		"Choose a language": "Python",
		"Choose a target":   "CLI",
	}); err != nil {
		t.Fatalf("respond to claude multi-question: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) == 0 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	questionResultFound := false
	assistantFound := false
	toolCallQuestionsFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		if role == "assistant" {
			rawToolCalls, _ := message["tool_calls"].([]any)
			for _, rawToolCall := range rawToolCalls {
				toolCall, ok := rawToolCall.(map[string]any)
				if !ok {
					continue
				}
				function, _ := mapValue(toolCall["function"])
				if stringValue(function["name"]) != askUserQuestionToolName {
					continue
				}
				arguments, _ := mapValue(function["arguments"])
				rawQuestions, _ := arguments["questions"].([]any)
				if len(rawQuestions) == 2 {
					toolCallQuestionsFound = true
				}
			}
			if extractMessageText(message) == "Chosen: Python CLI" {
				assistantFound = true
			}
		}
		if role != "tool" || stringValue(message["tool_name"]) != askUserQuestionToolName {
			continue
		}
		resultPayload, ok := mapValue(message["result"])
		if !ok {
			continue
		}
		answers, ok := mapValue(resultPayload["answers"])
		if !ok {
			continue
		}
		if stringValue(answers["Choose a language"]) == "Python" && stringValue(answers["Choose a target"]) == "CLI" {
			questionResultFound = true
		}
	}
	if !toolCallQuestionsFound {
		t.Fatalf("expected assistant AskUserQuestion tool call with two prompts, got %#v", messages)
	}
	if !questionResultFound {
		t.Fatalf("expected persisted multi-question tool result, got %#v", messages)
	}
	if !assistantFound {
		t.Fatalf("expected persisted assistant follow-up for multi-question run, got %#v", messages)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestClaudeExecutorPersistsToolResultAndMCPStatusSnapshot(t *testing.T) {
	// Verify Claude rich stream events now persist tool-result messages/events
	// and keep MCP runtime status snapshots after live-run cleanup.
	fixture := newClaudeExecutorFixture(t, "tool_result_and_mcp_status")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Run a command and report MCP status"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude rich run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) == 0 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	toolResultFound := false
	assistantFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		if role == "tool" && stringValue(message["tool_call_id"]) == "toolu-1" {
			if got := stringValue(message["tool_name"]); got != "Bash" {
				t.Fatalf("unexpected claude tool result name %q", got)
			}
			if got := stringValue(message["result"]); got != "ok" {
				t.Fatalf("unexpected claude tool result payload %#v", message["result"])
			}
			toolResultFound = true
		}
		if role == "assistant" && extractMessageText(message) == "Tool completed." {
			assistantFound = true
		}
	}
	if !toolResultFound {
		t.Fatalf("expected persisted claude tool result, got %#v", messages)
	}
	if !assistantFound {
		t.Fatalf("expected persisted claude assistant follow-up, got %#v", messages)
	}
	eventFound := false
	for _, event := range persisted.Events {
		if event.Type == "tool_result" && stringValue(event.Payload["toolCallId"]) == "toolu-1" {
			eventFound = true
			break
		}
	}
	if !eventFound {
		t.Fatalf("expected persisted tool_result event, got %#v", persisted.Events)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
	statuses, err := fixture.runtime.ExternalRuntimeStatuses(&result.ChatID, &fixture.engineID)
	if err != nil {
		t.Fatalf("read claude persisted external runtime statuses: %v", err)
	}
	if len(statuses) != 2 {
		t.Fatalf("expected filesystem plus generated setta runtime status rows, got %#v", statuses)
	}
	if got := statuses[0].ServerID; got != "filesystem" {
		t.Fatalf("unexpected first claude status server id %q", got)
	}
	if statuses[0].State != mcpx.RuntimeStateError {
		t.Fatalf("expected claude runtime error state, got %#v", statuses[0])
	}
	if statuses[0].LastError == nil || *statuses[0].LastError != "spawn failed" {
		t.Fatalf("expected claude runtime last error, got %#v", statuses[0])
	}
	if got := statuses[1].ServerID; got != mcpx.DefaultServerID {
		t.Fatalf("unexpected generated claude status server id %q", got)
	}
	if statuses[1].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected generated claude status transport streamable_http, got %#v", statuses[1])
	}
	if statuses[1].Endpoint != fixture.executor.settaServerURL {
		t.Fatalf("expected generated claude status endpoint %q, got %#v", fixture.executor.settaServerURL, statuses[1])
	}
	if statuses[1].State != mcpx.RuntimeStateUnknown {
		t.Fatalf("expected generated claude status to remain unknown, got %#v", statuses[1])
	}
}

func TestClaudeExecutorPersistsThinkingBlocksAndContextWindowUsage(t *testing.T) {
	fixture := newClaudeExecutorFixture(t, "thinking_usage")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Think through this and answer"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude thinking run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	if got := resolveRunOutputString(persisted, "sessionId"); got != "session-thinking" {
		t.Fatalf("expected persisted thinking session id, got %q", got)
	}
	usage, ok := persisted.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted usage payload, got %#v", persisted.Outputs["usage"])
	}
	if int(floatValueForTest(usage["promptTokens"])) != 11 || int(floatValueForTest(usage["completionTokens"])) != 2 || int(floatValueForTest(usage["totalTokens"])) != 13 || int(floatValueForTest(usage["contextWindowTokens"])) != 4096 {
		t.Fatalf("unexpected persisted context-window usage %#v", usage)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	thinkingFound := false
	answerFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok || stringValue(message["role"]) != "assistant" {
			continue
		}
		content, _ := message["content"].([]any)
		for _, rawContent := range content {
			block, ok := rawContent.(map[string]any)
			if !ok || stringValue(block["type"]) != "thinking" {
				continue
			}
			if stringValue(block["thinking"]) == "Plan carefully." && stringValue(block["summary"]) == "Plan summary" && stringValue(block["signature"]) == "sig-think" {
				thinkingFound = true
			}
		}
		if extractMessageText(message) == "42" {
			answerFound = true
		}
	}
	if !thinkingFound {
		t.Fatalf("expected persisted thinking block, got %#v", messages)
	}
	if !answerFound {
		t.Fatalf("expected persisted assistant answer, got %#v", messages)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestClaudeExecutorSeededUnknownMCPStatusDoesNotOverridePayloadStatus(t *testing.T) {
	// Verify config-backed unknown Claude MCP rows seed first and then yield to
	// runtime-reported payload state for the same server.
	fixture := newClaudeExecutorFixture(t, "complete")
	run := agentruns.NewRun(nil, map[string]any{
		"chatId":          "chat-mcp-status",
		"engineConfigId":  fixture.engineID,
		"projectConfigId": "project-alpha",
		"runType":         RunTypeExternalAgent,
	}, time.Date(2026, 3, 9, 13, 15, 0, 0, time.UTC))
	if err := fixture.runs.Save(run); err != nil {
		t.Fatalf("save claude status seed run: %v", err)
	}
	if err := fixture.runtime.ActivateRun(run.ID, &stubRunController{}); err != nil {
		t.Fatalf("activate claude status seed run: %v", err)
	}
	defer fixture.runtime.DeactivateRun(run.ID)

	configPath := filepath.Join(t.TempDir(), "claude-mcp.json")
	if err := os.WriteFile(configPath, []byte(`{"mcpServers":{"filesystem":{"type":"stdio","command":"npx @modelcontextprotocol/server-filesystem ."}}}`), 0o644); err != nil {
		t.Fatalf("write claude mcp config: %v", err)
	}
	if err := fixture.executor.seedClaudeMCPStatuses(run.ID, configPath); err != nil {
		t.Fatalf("seed claude mcp statuses: %v", err)
	}

	statuses := fixture.runtime.MCPStatusesForRun(run.ID)
	if len(statuses) != 1 {
		t.Fatalf("expected one seeded claude status row, got %#v", statuses)
	}
	if statuses[0].State != mcpx.RuntimeStateUnknown {
		t.Fatalf("expected unknown seeded claude status, got %#v", statuses[0])
	}

	if err := fixture.runtime.UpsertMCPStatuses(run.ID, buildClaudeMCPStatuses(map[string]any{
		"type": "system_message",
		"message": map[string]any{
			"mcp_servers": []any{
				map[string]any{
					"serverId":  "filesystem",
					"connected": true,
					"transport": "stdio",
					"command":   "npx @modelcontextprotocol/server-filesystem .",
					"toolCount": 4,
				},
			},
		},
	}, fixture.executor.timeNow)); err != nil {
		t.Fatalf("upsert claude mcp payload statuses: %v", err)
	}

	statuses = fixture.runtime.MCPStatusesForRun(run.ID)
	if len(statuses) != 1 {
		t.Fatalf("expected one merged claude status row, got %#v", statuses)
	}
	if statuses[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("expected payload status to override unknown seed, got %#v", statuses[0])
	}
	if statuses[0].ToolCount != 4 {
		t.Fatalf("expected payload tool count to persist, got %#v", statuses[0])
	}
}

func TestClaudeHandleEventParsesStreamEventEnvelopeAndIgnoresDuplicatePayloads(t *testing.T) {
	t.Parallel()

	executor, parser, request, state := newClaudeParserTestFixture(t)

	changed, result, err := executor.handleEvent(request, parser, map[string]any{
		"type": "stream_event",
		"event": map[string]any{
			"type":    "message_start",
			"message": map[string]any{"id": "msg-partial", "content": []any{}},
		},
	}, state)
	if err != nil {
		t.Fatalf("handle stream_event message_start: %v", err)
	}
	if !changed || result != nil {
		t.Fatalf("expected stream_event message_start to change state without result, got changed=%v result=%#v", changed, result)
	}
	if len(state.Messages) != 1 || stringValue(state.Messages[0]["id"]) != "msg-partial" {
		t.Fatalf("expected partial assistant message, got %#v", state.Messages)
	}

	changed, result, err = executor.handleEvent(request, parser, map[string]any{
		"type": "assistant_message",
		"message": map[string]any{
			"id": "msg-partial",
			"content": []any{
				map[string]any{"type": "text", "text": "Hello"},
			},
		},
	}, state)
	if err != nil {
		t.Fatalf("handle duplicate assistant_message: %v", err)
	}
	if changed || result != nil {
		t.Fatalf("expected duplicate assistant payload to be ignored, got changed=%v result=%#v", changed, result)
	}
	if len(state.Messages) != 1 {
		t.Fatalf("expected duplicate assistant payload to leave one message, got %#v", state.Messages)
	}
	content, _ := state.Messages[0]["content"].([]any)
	if len(content) != 0 {
		t.Fatalf("expected duplicate assistant payload to leave partial content untouched, got %#v", content)
	}

	changed, result, err = executor.handleEvent(request, parser, map[string]any{
		"type":      "result",
		"sessionId": "session-partial",
		"result":    "Hello",
		"final":     true,
	}, state)
	if err != nil {
		t.Fatalf("handle result payload: %v", err)
	}
	if changed {
		t.Fatalf("expected result payload to avoid mutating partial stream state")
	}
	if result == nil || result.SessionID != "session-partial" || result.Result != "Hello" {
		t.Fatalf("expected result payload metadata, got %#v", result)
	}
	if len(state.Messages) != 1 || stringValue(state.Messages[0]["id"]) != "msg-partial" {
		t.Fatalf("expected partial message to remain intact after result payload, got %#v", state.Messages)
	}
}

func TestClaudeHandleEventAssistantMessagePersistsThinkingAndToolCalls(t *testing.T) {
	t.Parallel()

	store, _, executor, parser, request, state := newActiveClaudeParserTestFixture(t)
	changed, result, err := executor.handleEvent(request, parser, map[string]any{
		"type": "assistant_message",
		"message": map[string]any{
			"id": "msg-full-1",
			"content": []any{
				map[string]any{"type": "text", "text": "Hi"},
				map[string]any{"type": "thinking", "thinking": "Plan", "summary": "Plan summary"},
				map[string]any{
					"type":  "tool_use",
					"id":    "toolu-2",
					"name":  "Read",
					"input": map[string]any{"path": "README.md"},
				},
			},
		},
	}, state)
	if err != nil {
		t.Fatalf("handle assistant_message: %v", err)
	}
	if !changed || result != nil {
		t.Fatalf("expected assistant_message to mutate state without result, got changed=%v result=%#v", changed, result)
	}
	if err := executor.persistLiveState(request.Run.ID, *state, "", nil); err != nil {
		t.Fatalf("persist live state after assistant_message: %v", err)
	}

	assistant := assistantMessageForTest(t, state, "msg-full-1")
	if got := extractMessageText(assistant); got != "Hi" {
		t.Fatalf("unexpected assistant text %q", got)
	}
	content, _ := assistant["content"].([]any)
	if len(content) != 2 {
		t.Fatalf("expected text plus thinking content, got %#v", assistant)
	}
	thinking, _ := content[1].(map[string]any)
	if stringValue(thinking["type"]) != "thinking" || stringValue(thinking["thinking"]) != "Plan" || stringValue(thinking["summary"]) != "Plan summary" {
		t.Fatalf("unexpected thinking block %#v", content[1])
	}
	rawToolCalls, ok := assistant["tool_calls"].([]any)
	if !ok || len(rawToolCalls) != 1 {
		t.Fatalf("expected one assistant tool call, got %#v", assistant["tool_calls"])
	}
	toolCall, ok := rawToolCalls[0].(map[string]any)
	if !ok {
		t.Fatalf("expected tool call payload, got %#v", rawToolCalls[0])
	}
	if stringValue(toolCall["id"]) != "toolu-2" {
		t.Fatalf("unexpected tool call %#v", toolCall)
	}
	function, _ := mapValue(toolCall["function"])
	if stringValue(function["name"]) != "Read" {
		t.Fatalf("unexpected tool call function %#v", function)
	}
	arguments, _ := mapValue(function["arguments"])
	if stringValue(arguments["path"]) != "README.md" {
		t.Fatalf("unexpected tool call arguments %#v", arguments)
	}

	persisted, err := store.Load(request.Run.ID)
	if err != nil {
		t.Fatalf("load persisted assistant_message run: %v", err)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) == 0 {
		t.Fatalf("expected persisted live-state messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := messages[len(messages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted assistant message, got %#v", messages[len(messages)-1])
	}
	if got := extractMessageText(lastMessage); got != "Hi" {
		t.Fatalf("unexpected persisted assistant text %q", got)
	}
	rawToolCalls, ok = lastMessage["tool_calls"].([]any)
	if !ok || len(rawToolCalls) != 1 {
		t.Fatalf("expected persisted tool call, got %#v", lastMessage)
	}
}

func TestClaudeEventParserRecordsToolUseAndOverridesSeededArguments(t *testing.T) {
	t.Parallel()

	_, parser, _, state := newClaudeParserTestFixture(t)
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":    "message_start",
		"message": map[string]any{"id": "msg-tool", "content": []any{}},
	}, state); err != nil || !changed {
		t.Fatalf("message_start changed=%v err=%v", changed, err)
	}
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":  "content_block_start",
		"index": 0,
		"content_block": map[string]any{
			"type": "tool_use",
			"id":   "toolu-1",
			"name": "Read",
			"input": map[string]any{
				"path": "README.md",
			},
		},
	}, state); err != nil || !changed {
		t.Fatalf("content_block_start changed=%v err=%v", changed, err)
	}
	if !parser.toolCallSeededFromInput["toolu-1"] {
		t.Fatalf("expected tool arguments to start seeded from input")
	}
	if got := parser.toolCallArgumentsByID["toolu-1"]; !strings.Contains(got, "README.md") {
		t.Fatalf("expected seeded arguments to include README.md, got %q", got)
	}

	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":  "content_block_delta",
		"index": 0,
		"delta": map[string]any{
			"type":         "input_json_delta",
			"partial_json": "{\"path\":\"README.md\"}",
		},
	}, state); err != nil || !changed {
		t.Fatalf("content_block_delta changed=%v err=%v", changed, err)
	}
	if parser.toolCallSeededFromInput["toolu-1"] {
		t.Fatalf("expected input_json_delta to replace the seeded argument snapshot")
	}
	if got := parser.toolCallArgumentsByID["toolu-1"]; got != "{\"path\":\"README.md\"}" {
		t.Fatalf("expected raw tool arguments to reflect the streamed JSON delta, got %q", got)
	}

	assistant := assistantMessageForTest(t, state, "msg-tool")
	toolCalls, _ := assistant["tool_calls"].([]any)
	if len(toolCalls) != 1 {
		t.Fatalf("expected one assistant tool call, got %#v", assistant)
	}
	toolCall, ok := toolCalls[0].(map[string]any)
	if !ok {
		t.Fatalf("expected tool call payload, got %#v", toolCalls[0])
	}
	if got := stringValue(toolCall["id"]); got != "toolu-1" {
		t.Fatalf("unexpected tool call id %q", got)
	}
	function, _ := mapValue(toolCall["function"])
	if got := stringValue(function["name"]); got != "Read" {
		t.Fatalf("unexpected tool name %q", got)
	}
	arguments, _ := mapValue(function["arguments"])
	if got := stringValue(arguments["path"]); got != "README.md" {
		t.Fatalf("expected streamed path argument, got %#v", arguments)
	}
}

func TestClaudeEventParserDocumentedToolsPersistToolCallsAndResults(t *testing.T) {
	t.Parallel()

	toolNames := []string{
		"AskUserQuestion",
		"Bash",
		"Edit",
		"Glob",
		"Grep",
		"NotebookEdit",
		"Read",
		"Task",
		TodoWriteToolName,
		"WebFetch",
		"WebSearch",
		"Write",
		"BashOutput",
		"KillBash",
		"ExitPlanMode",
		"ListMcpResources",
		"ReadMcpResource",
	}
	for idx, toolName := range toolNames {
		t.Run(toolName, func(t *testing.T) {
			_, parser, _, state := newClaudeParserTestFixture(t)
			messageID := fmt.Sprintf("msg-%d", idx)
			toolCallID := fmt.Sprintf("toolu-%d", idx)
			if changed, err := parser.handleStreamEvent(map[string]any{
				"type":    "message_start",
				"message": map[string]any{"id": messageID, "content": []any{}},
			}, state); err != nil || !changed {
				t.Fatalf("message_start changed=%v err=%v", changed, err)
			}
			if changed, err := parser.handleStreamEvent(map[string]any{
				"type":  "content_block_start",
				"index": 0,
				"content_block": map[string]any{
					"type": "tool_use",
					"id":   toolCallID,
					"name": toolName,
					"input": map[string]any{
						"token": toolName,
					},
				},
			}, state); err != nil || !changed {
				t.Fatalf("tool_use start changed=%v err=%v", changed, err)
			}

			assistant := assistantMessageForTest(t, state, messageID)
			toolCalls, _ := assistant["tool_calls"].([]any)
			if len(toolCalls) != 1 {
				t.Fatalf("expected one tool call, got %#v", assistant)
			}
			toolCall, ok := toolCalls[0].(map[string]any)
			if !ok {
				t.Fatalf("expected tool call payload, got %#v", toolCalls[0])
			}
			function, _ := mapValue(toolCall["function"])
			if got := stringValue(function["name"]); got != toolName {
				t.Fatalf("expected tool name %q, got %#v", toolName, function["name"])
			}

			if changed, err := parser.handleStreamEvent(map[string]any{
				"type":  "content_block_start",
				"index": 1,
				"content_block": map[string]any{
					"type":        "tool_result",
					"tool_use_id": toolCallID,
					"content":     []any{map[string]any{"type": "text", "text": "ok"}},
				},
			}, state); err != nil || changed {
				t.Fatalf("tool_result start changed=%v err=%v", changed, err)
			}
			if changed, err := parser.handleStreamEvent(map[string]any{
				"type":  "content_block_stop",
				"index": 1,
			}, state); err != nil || !changed {
				t.Fatalf("tool_result stop changed=%v err=%v", changed, err)
			}
			results := parser.takeToolResults()
			if len(results) != 1 {
				t.Fatalf("expected one tool result metadata row, got %#v", results)
			}
			if results[0].ToolCallID != toolCallID || results[0].ToolName != toolName {
				t.Fatalf("unexpected tool result metadata %#v", results[0])
			}
			if got := stringValue(results[0].Result); got != "ok" {
				t.Fatalf("expected persisted tool result text, got %#v", results[0].Result)
			}

			rawMessages := state.Messages
			lastMessage := rawMessages[len(rawMessages)-1]
			if role := stringValue(lastMessage["role"]); role != "tool" {
				t.Fatalf("expected tool result message, got %#v", lastMessage)
			}
			if got := stringValue(lastMessage["tool_name"]); got != toolName {
				t.Fatalf("expected tool result message name %q, got %#v", toolName, lastMessage)
			}
		})
	}
}

func TestClaudeHandleEventApprovalRequestRegistersRuntimeApprovalAndPersistsToolCallMessage(t *testing.T) {
	t.Parallel()

	store, runtime, executor, parser, request, state := newActiveClaudeParserTestFixture(t)
	changed, _, err := executor.handleEvent(request, parser, map[string]any{
		"type":       "approval_request",
		"approvalId": "approval-1",
		"toolName":   "Bash",
		"toolType":   "bash",
		"input":      map[string]any{"command": "ls"},
	}, state)
	if err != nil || !changed {
		t.Fatalf("approval_request changed=%v err=%v", changed, err)
	}

	approvalState, ok := runtime.approvals["approval-1"]
	if !ok {
		t.Fatalf("expected runtime approval registration, got %#v", runtime.approvals)
	}
	if approvalState.RunID != request.Run.ID || approvalState.ChatID != request.ChatID {
		t.Fatalf("unexpected approval state %#v", approvalState)
	}

	assistant := assistantMessageForTest(t, state, "approval-1")
	toolCalls, _ := assistant["tool_calls"].([]any)
	if len(toolCalls) != 1 {
		t.Fatalf("expected approval tool call message, got %#v", assistant)
	}
	toolCall, ok := toolCalls[0].(map[string]any)
	if !ok {
		t.Fatalf("expected tool call payload, got %#v", toolCalls[0])
	}
	function, _ := mapValue(toolCall["function"])
	if got := stringValue(function["name"]); got != ApprovalToolName {
		t.Fatalf("expected approval tool name %q, got %#v", ApprovalToolName, function["name"])
	}
	arguments, _ := mapValue(function["arguments"])
	if got := stringValue(arguments["approvalId"]); got != "approval-1" {
		t.Fatalf("expected approval id in arguments, got %#v", arguments)
	}
	input, _ := mapValue(arguments["input"])
	if got := stringValue(input["command"]); got != "ls" {
		t.Fatalf("expected preserved approval input, got %#v", arguments)
	}

	persisted, err := store.Load(request.Run.ID)
	if err != nil {
		t.Fatalf("load run after approval request: %v", err)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "approval_request" {
		t.Fatalf("expected approval_request event, got %#v", lastEvent)
	}
	if got := stringValue(lastEvent.Payload["approvalId"]); got != "approval-1" {
		t.Fatalf("unexpected persisted approval event %#v", lastEvent.Payload)
	}
}

func TestClaudeHandleEventQuestionApprovalRequestQueuesAndPersistsEvent(t *testing.T) {
	t.Parallel()

	store, _, executor, parser, request, state := newActiveClaudeParserTestFixture(t)
	changed, _, err := executor.handleEvent(request, parser, map[string]any{
		"type":       "approval_request",
		"approvalId": "approval-1",
		"toolName":   askUserQuestionToolName,
		"toolType":   "question",
		"input": map[string]any{
			"questions": []any{map[string]any{"question": "Language", "type": "text"}},
		},
	}, state)
	if err != nil || changed {
		t.Fatalf("question approval_request changed=%v err=%v", changed, err)
	}
	if len(parser.pendingQuestionApprovals) != 1 || parser.pendingQuestionApprovals[0] != "approval-1" {
		t.Fatalf("expected queued question approval, got %#v", parser.pendingQuestionApprovals)
	}
	if len(state.Messages) != 0 {
		t.Fatalf("expected no approval placeholder message before tool call, got %#v", state.Messages)
	}

	persisted, err := store.Load(request.Run.ID)
	if err != nil {
		t.Fatalf("load run after queued question approval: %v", err)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "approval_request" {
		t.Fatalf("expected approval_request event, got %#v", lastEvent)
	}
}

func TestClaudeEventParserRegistersQuestionToolCallWithoutApprovalID(t *testing.T) {
	t.Parallel()

	_, runtime, _, parser, request, state := newActiveClaudeParserTestFixture(t)
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":    "message_start",
		"message": map[string]any{"id": "assistant-question", "content": []any{}},
	}, state); err != nil || !changed {
		t.Fatalf("message_start changed=%v err=%v", changed, err)
	}
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":  "content_block_start",
		"index": 0,
		"content_block": map[string]any{
			"type": "tool_use",
			"id":   "question-1",
			"name": askUserQuestionToolName,
			"input": map[string]any{
				"questions": []any{map[string]any{"question": "Language", "type": "text"}},
			},
		},
	}, state); err != nil || !changed {
		t.Fatalf("question tool_use changed=%v err=%v", changed, err)
	}

	questionState, ok := runtime.questions["question-1"]
	if !ok {
		t.Fatalf("expected runtime question registration, got %#v", runtime.questions)
	}
	if questionState.RunID != request.Run.ID || questionState.ChatID != request.ChatID {
		t.Fatalf("unexpected runtime question state %#v", questionState)
	}
	if questionState.ResponseID != nil {
		t.Fatalf("expected question to start without approval response id, got %#v", questionState)
	}

	assistant := assistantMessageForTest(t, state, "assistant-question")
	toolCalls, _ := assistant["tool_calls"].([]any)
	if len(toolCalls) != 1 {
		t.Fatalf("expected assistant question tool call, got %#v", assistant)
	}
	toolCall, ok := toolCalls[0].(map[string]any)
	if !ok {
		t.Fatalf("expected tool call payload, got %#v", toolCalls[0])
	}
	function, _ := mapValue(toolCall["function"])
	if got := stringValue(function["name"]); got != askUserQuestionToolName {
		t.Fatalf("expected AskUserQuestion tool call, got %#v", function)
	}
}

func TestClaudeEventParserRegistersQuestionToolCallWithQueuedApprovalID(t *testing.T) {
	t.Parallel()

	_, runtime, _, parser, request, state := newActiveClaudeParserTestFixture(t)
	if err := parser.queueQuestionApproval("approval-1"); err != nil {
		t.Fatalf("queue question approval: %v", err)
	}
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":    "message_start",
		"message": map[string]any{"id": "assistant-question", "content": []any{}},
	}, state); err != nil || !changed {
		t.Fatalf("message_start changed=%v err=%v", changed, err)
	}
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":  "content_block_start",
		"index": 0,
		"content_block": map[string]any{
			"type": "tool_use",
			"id":   "question-1",
			"name": askUserQuestionToolName,
			"input": map[string]any{
				"questions": []any{map[string]any{"question": "Language", "type": "text"}},
			},
		},
	}, state); err != nil || !changed {
		t.Fatalf("question tool_use changed=%v err=%v", changed, err)
	}

	questionState, ok := runtime.questions["question-1"]
	if !ok {
		t.Fatalf("expected runtime question registration, got %#v", runtime.questions)
	}
	if questionState.ResponseID == nil || *questionState.ResponseID != "approval-1" {
		t.Fatalf("expected queued approval id to attach to question, got %#v", questionState)
	}
	if len(parser.pendingQuestionApprovals) != 0 || len(parser.pendingQuestionToolCalls) != 0 {
		t.Fatalf("expected question approval queues to drain, got approvals=%#v toolCalls=%#v", parser.pendingQuestionApprovals, parser.pendingQuestionToolCalls)
	}
	if questionState.RunID != request.Run.ID {
		t.Fatalf("unexpected runtime question state %#v", questionState)
	}
}

func TestClaudeHandleEventQuestionApprovalAttachesToPreviouslyRegisteredToolCall(t *testing.T) {
	t.Parallel()

	store, runtime, executor, parser, request, state := newActiveClaudeParserTestFixture(t)
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":    "message_start",
		"message": map[string]any{"id": "assistant-question", "content": []any{}},
	}, state); err != nil || !changed {
		t.Fatalf("message_start changed=%v err=%v", changed, err)
	}
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":  "content_block_start",
		"index": 0,
		"content_block": map[string]any{
			"type": "tool_use",
			"id":   "question-1",
			"name": askUserQuestionToolName,
			"input": map[string]any{
				"questions": []any{map[string]any{"question": "Language", "type": "text"}},
			},
		},
	}, state); err != nil || !changed {
		t.Fatalf("question tool_use changed=%v err=%v", changed, err)
	}
	registered := runtime.questions["question-1"]
	if registered.ResponseID != nil {
		t.Fatalf("expected initial question registration without approval id, got %#v", registered)
	}

	changed, _, err := executor.handleEvent(request, parser, map[string]any{
		"type":       "approval_request",
		"approvalId": "approval-1",
		"toolName":   askUserQuestionToolName,
		"toolType":   "question",
		"input": map[string]any{
			"questions": []any{map[string]any{"question": "Language", "type": "text"}},
		},
	}, state)
	if err != nil || changed {
		t.Fatalf("late question approval changed=%v err=%v", changed, err)
	}

	questionState := runtime.questions["question-1"]
	if questionState.ResponseID == nil || *questionState.ResponseID != "approval-1" {
		t.Fatalf("expected late approval id to attach to existing question, got %#v", questionState)
	}
	if len(parser.pendingQuestionApprovals) != 0 || len(parser.pendingQuestionToolCalls) != 0 {
		t.Fatalf("expected late question approval queues to drain, got approvals=%#v toolCalls=%#v", parser.pendingQuestionApprovals, parser.pendingQuestionToolCalls)
	}

	persisted, err := store.Load(request.Run.ID)
	if err != nil {
		t.Fatalf("load run after late question approval: %v", err)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "approval_request" {
		t.Fatalf("expected persisted approval_request event, got %#v", lastEvent)
	}
}

func TestClaudeEventParserPreservesThinkingSummaryAndSignatureDeltas(t *testing.T) {
	t.Parallel()

	_, parser, _, state := newClaudeParserTestFixture(t)
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":    "message_start",
		"message": map[string]any{"id": "msg-think", "content": []any{}},
	}, state); err != nil || !changed {
		t.Fatalf("message_start changed=%v err=%v", changed, err)
	}
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":  "content_block_start",
		"index": 0,
		"content_block": map[string]any{
			"type":      "thinking",
			"thinking":  "Plan",
			"summary":   "Plan summary",
			"signature": "sig-1",
		},
	}, state); err != nil || !changed {
		t.Fatalf("thinking start changed=%v err=%v", changed, err)
	}
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":  "content_block_delta",
		"index": 0,
		"delta": map[string]any{
			"type":     "thinking_delta",
			"thinking": " next",
			"summary":  "Next summary",
		},
	}, state); err != nil || !changed {
		t.Fatalf("thinking delta changed=%v err=%v", changed, err)
	}
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":  "content_block_delta",
		"index": 0,
		"delta": map[string]any{
			"type":      "signature_delta",
			"signature": "sig-2",
		},
	}, state); err != nil || !changed {
		t.Fatalf("signature delta changed=%v err=%v", changed, err)
	}
	if changed, err := parser.handleStreamEvent(map[string]any{
		"type":  "content_block_delta",
		"index": 0,
		"delta": map[string]any{
			"type":    "summary_delta",
			"summary": "Final summary",
		},
	}, state); err != nil || !changed {
		t.Fatalf("summary delta changed=%v err=%v", changed, err)
	}

	assistant := assistantMessageForTest(t, state, "msg-think")
	content, _ := assistant["content"].([]any)
	if len(content) != 1 {
		t.Fatalf("expected one thinking block, got %#v", assistant)
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected thinking content block, got %#v", content[0])
	}
	if got := stringValue(thinkingBlock["type"]); got != "thinking" {
		t.Fatalf("expected thinking block type, got %#v", thinkingBlock)
	}
	if got := stringValue(thinkingBlock["thinking"]); got != "Plan next" {
		t.Fatalf("expected merged thinking text, got %#v", thinkingBlock)
	}
	if got := stringValue(thinkingBlock["summary"]); got != "Final summary" {
		t.Fatalf("expected final thinking summary, got %#v", thinkingBlock)
	}
	if got := stringValue(thinkingBlock["signature"]); got != "sig-2" {
		t.Fatalf("expected final thinking signature, got %#v", thinkingBlock)
	}
}

func TestBuildClaudeStartPayloadPassesThroughMCPConfigPath(t *testing.T) {
	t.Parallel()

	payload := buildClaudeStartPayload(StartRequest{
		Run: agentruns.NewRun(nil, map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Hello"},
					},
				},
			},
		}, time.Date(2026, 3, 9, 13, 30, 0, 0, time.UTC)),
		ExternalConfig: externalagentconfigs.Config{
			ToolType: externalagentconfigs.ToolTypeClaudeCode,
			RunMode:  externalagentconfigs.RunModeSDK,
		},
		Inputs: map[string]any{
			"mcpConfig": "/tmp/runtime-claude.mcp.json",
		},
	}, "/tmp/workspace", map[string]string{})

	if got := stringValue(payload["mcpConfigPath"]); got != "/tmp/runtime-claude.mcp.json" {
		t.Fatalf("expected mcpConfigPath passthrough, got %#v", payload["mcpConfigPath"])
	}
}
