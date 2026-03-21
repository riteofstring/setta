package externalagents

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
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
		PermissionMode:  ChatPermissionModeMinimal,
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

	settingsPath := resolveClaudeSettingsPath(fixture.config, fixture.root)
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
		PermissionMode:  ChatPermissionModeMinimal,
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
	if statuses[0].Transport != mcpx.TransportSSE {
		t.Fatalf("expected generated MCP transport sse, got %#v", statuses[0])
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		if role == "tool" && stringValue(message["tool_name"]) == codexApprovalToolName {
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
	if statuses[1].Transport != mcpx.TransportSSE {
		t.Fatalf("expected generated claude status transport sse, got %#v", statuses[1])
	}
	if statuses[1].Endpoint != fixture.executor.settaServerURL {
		t.Fatalf("expected generated claude status endpoint %q, got %#v", fixture.executor.settaServerURL, statuses[1])
	}
	if statuses[1].State != mcpx.RuntimeStateUnknown {
		t.Fatalf("expected generated claude status to remain unknown, got %#v", statuses[1])
	}
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

func TestBuildClaudeStartPayloadUsesLatestUserPrompt(t *testing.T) {
	t.Parallel()

	payload := buildClaudeStartPayload(StartRequest{
		Run: agentruns.NewRun(nil, map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "system-1",
					"role": "system",
					"content": []any{
						map[string]any{"type": "text", "text": "System prompt"},
					},
				},
				map[string]any{
					"id":   "assistant-1",
					"role": "assistant",
					"content": []any{
						map[string]any{"type": "text", "text": "Earlier reply"},
					},
				},
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Latest request"},
					},
				},
			},
			"systemPrompt": "System prompt",
		}, time.Date(2026, 3, 9, 13, 35, 0, 0, time.UTC)),
		ExternalConfig: externalagentconfigs.Config{
			ToolType: externalagentconfigs.ToolTypeClaudeCode,
			RunMode:  externalagentconfigs.RunModeSDK,
		},
		Inputs: map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "system-1",
					"role": "system",
					"content": []any{
						map[string]any{"type": "text", "text": "System prompt"},
					},
				},
				map[string]any{
					"id":   "assistant-1",
					"role": "assistant",
					"content": []any{
						map[string]any{"type": "text", "text": "Earlier reply"},
					},
				},
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Latest request"},
					},
				},
			},
			"systemPrompt": "System prompt",
		},
	}, "/tmp/workspace", map[string]string{})

	prompt := stringValue(payload["prompt"])
	if prompt != "Latest request\n" {
		t.Fatalf("expected latest user prompt with trailing newline, got %q", prompt)
	}
	if strings.Contains(prompt, "System prompt") || strings.Contains(prompt, "Earlier reply") {
		t.Fatalf("expected prompt to exclude system and assistant text, got %q", prompt)
	}
}

func TestBuildClaudeStartPayloadOmitsMaxTurnsWhenUnspecified(t *testing.T) {
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
		}, time.Date(2026, 3, 9, 13, 36, 0, 0, time.UTC)),
		ExternalConfig: externalagentconfigs.Config{
			ToolType: externalagentconfigs.ToolTypeClaudeCode,
			RunMode:  externalagentconfigs.RunModeSDK,
		},
		Inputs: map[string]any{},
	}, "/tmp/workspace", map[string]string{})

	if _, ok := payload["maxTurns"]; ok {
		t.Fatalf("expected maxTurns to be omitted when unspecified, got %#v", payload["maxTurns"])
	}
}

func TestBuildClaudeStartPayloadHonorsExplicitMaxTurns(t *testing.T) {
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
		}, time.Date(2026, 3, 9, 13, 37, 0, 0, time.UTC)),
		ExternalConfig: externalagentconfigs.Config{
			ToolType: externalagentconfigs.ToolTypeClaudeCode,
			RunMode:  externalagentconfigs.RunModeSDK,
		},
		Inputs: map[string]any{
			"maxTurns": 7,
		},
	}, "/tmp/workspace", map[string]string{})

	if got, ok := payload["maxTurns"].(int); !ok || got != 7 {
		t.Fatalf("expected explicit maxTurns=7, got %#v", payload["maxTurns"])
	}
}

func TestEnsureClaudeMCPConfigIncludesAuthAndAgenticHeaders(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 19, 18, 0, 0, 0, time.UTC)
	sectionID := "section-alpha"
	request := &StartRequest{
		Run:             agentruns.Run{ID: "run-alpha"},
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       &sectionID,
		Inputs: map[string]any{
			"frontendAffinityToken": "frontend-alpha",
			"allowUnscoped":         true,
		},
	}
	executor := &ClaudeExecutor{
		settaServerURL:     "http://127.0.0.1:8000/mcp",
		currentSession:     &auth.CurrentSession{Metadata: auth.SessionMetadata{ID: "session-1"}, Secret: []byte("session-secret")},
		authCookieBaseName: auth.DefaultAuthCookieName,
		timeNow: func() time.Time {
			return now
		},
	}

	cleanupDir, err := executor.ensureClaudeMCPConfig(request)
	if err != nil {
		t.Fatalf("ensure claude mcp config: %v", err)
	}
	defer func() {
		if strings.TrimSpace(cleanupDir) != "" {
			_ = os.RemoveAll(cleanupDir)
		}
	}()

	configPath := strings.TrimSpace(stringValue(request.Inputs["mcpConfig"]))
	if filepath.Base(configPath) != claudeMCPConfigName {
		t.Fatalf("expected generated mcp config path %q, got %q", claudeMCPConfigName, configPath)
	}
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read generated claude mcp config: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode generated claude mcp config: %v", err)
	}
	rawServers, ok := payload["mcpServers"].(map[string]any)
	if !ok {
		t.Fatalf("expected generated mcpServers map, got %#v", payload["mcpServers"])
	}
	settaServer, ok := rawServers[mcpx.DefaultServerID].(map[string]any)
	if !ok {
		t.Fatalf("expected generated setta server entry, got %#v", rawServers)
	}
	headers, ok := settaServer["headers"].(map[string]any)
	if !ok {
		t.Fatalf("expected generated setta headers, got %#v", settaServer["headers"])
	}
	cookieName, err := auth.CookieName(auth.DefaultAuthCookieName, "session-1")
	if err != nil {
		t.Fatalf("resolve auth cookie name: %v", err)
	}
	cookie := strings.TrimSpace(stringValue(headers["Cookie"]))
	if !strings.HasPrefix(cookie, cookieName+"=") {
		t.Fatalf("expected generated auth cookie header to start with %q, got %q", cookieName+"=", cookie)
	}
	if got := stringValue(headers[mcpx.AgenticContextProjectConfigIDHeader]); got != "project-alpha" {
		t.Fatalf("expected project-config header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextChatIDHeader]); got != "chat-alpha" {
		t.Fatalf("expected chat header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextRunIDHeader]); got != "run-alpha" {
		t.Fatalf("expected run header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextSectionIDHeader]); got != "section-alpha" {
		t.Fatalf("expected section header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextFrontendAffinityHeader]); got != "frontend-alpha" {
		t.Fatalf("expected frontend-affinity header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextAllowUnscopedHeader]); got != "true" {
		t.Fatalf("expected allow-unscoped header, got %#v", headers)
	}
}

func TestBuildClaudeStartPayloadAllowedToolsPrefersExplicitInputThenProfileAllowlist(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name       string
		inputTools []any
		profile    *agentprofiles.Profile
		want       []string
	}{
		{
			name:       "explicit input wins",
			inputTools: []any{"tool.explicit", " tool.trimmed "},
			profile: &agentprofiles.Profile{
				ToolAllowlist: []string{"tool.profile"},
			},
			want: []string{"tool.explicit", "tool.trimmed"},
		},
		{
			name: "profile allowlist is fallback",
			profile: &agentprofiles.Profile{
				ToolAllowlist: []string{"tool.profile", "tool.second"},
			},
			want: []string{"tool.profile", "tool.second"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			inputs := map[string]any{}
			if testCase.inputTools != nil {
				inputs["allowedTools"] = testCase.inputTools
			}
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
				Profile: testCase.profile,
				Inputs:  inputs,
			}, "/tmp/workspace", map[string]string{})

			rawAllowedTools, ok := payload["allowedTools"].([]string)
			if !ok {
				t.Fatalf("expected allowedTools payload, got %#v", payload["allowedTools"])
			}
			if strings.Join(rawAllowedTools, ",") != strings.Join(testCase.want, ",") {
				t.Fatalf("expected allowedTools %v, got %#v", testCase.want, rawAllowedTools)
			}
		})
	}
}

func TestResolveClaudeSettingsPathUsesManagedModeSpecificFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	localPath := resolveClaudeSettingsPath(externalagentconfigs.Config{
		ToolType:     externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode: externalagentconfigs.SettingsModeManagedLocal,
	}, root)
	if want := filepath.Join(root, ".claude", "settings.local.json"); localPath != want {
		t.Fatalf("expected managed-local settings path %q, got %q", want, localPath)
	}

	projectPath := resolveClaudeSettingsPath(externalagentconfigs.Config{
		ToolType:     externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode: externalagentconfigs.SettingsModeManagedProject,
	}, root)
	if want := filepath.Join(root, ".claude", "settings.json"); projectPath != want {
		t.Fatalf("expected managed-project settings path %q, got %q", want, projectPath)
	}

	readOnlyPath := resolveClaudeSettingsPath(externalagentconfigs.Config{
		ToolType:     externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode: externalagentconfigs.SettingsModeReadOnly,
	}, root)
	if readOnlyPath != "" {
		t.Fatalf("expected read-only settings mode to skip path resolution, got %q", readOnlyPath)
	}
}

func TestPrepareClaudeSettingsPreservesUserKeysForManagedProject(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	settingsPath := filepath.Join(root, ".claude", "settings.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatalf("mkdir claude settings dir: %v", err)
	}
	existingPayload, err := json.MarshalIndent(map[string]any{
		"userSetting": map[string]any{"foo": "bar"},
		"permissions": map[string]any{"allow": []string{"Old"}},
	}, "", "  ")
	if err != nil {
		t.Fatalf("encode existing claude settings: %v", err)
	}
	existingPayload = append(existingPayload, '\n')
	if err := os.WriteFile(settingsPath, existingPayload, 0o644); err != nil {
		t.Fatalf("write existing claude settings: %v", err)
	}

	executor := &ClaudeExecutor{workspaceRoot: root}
	if err := executor.prepareClaudeSettings(externalagentconfigs.Config{
		ToolType:                externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode:            externalagentconfigs.SettingsModeManagedProject,
		SettingsAllowSettaEdits: true,
		SettingsManagedBlock: &externalagentconfigs.SettingsManagedBlock{
			Claude: map[string]any{
				"permissions": map[string]any{
					"allow": []string{"New"},
					"ask":   []string{},
					"deny":  []string{},
				},
			},
		},
	}); err != nil {
		t.Fatalf("prepare claude settings: %v", err)
	}

	content, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read claude settings: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode claude settings: %v", err)
	}
	if got, ok := payload["userSetting"].(map[string]any); !ok || got["foo"] != "bar" {
		t.Fatalf("expected user keys to be preserved, got %#v", payload)
	}
	permissions, ok := payload["permissions"].(map[string]any)
	if !ok {
		t.Fatalf("expected managed permissions block, got %#v", payload)
	}
	allow, ok := permissions["allow"].([]any)
	if !ok || len(allow) != 1 || stringValue(allow[0]) != "New" {
		t.Fatalf("expected managed permissions to overwrite allow list, got %#v", permissions)
	}
}

func TestPrepareClaudeSettingsReadOnlySkipsWrites(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	executor := &ClaudeExecutor{workspaceRoot: root}
	if err := executor.prepareClaudeSettings(externalagentconfigs.Config{
		ToolType:     externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode: externalagentconfigs.SettingsModeReadOnly,
	}); err != nil {
		t.Fatalf("prepare read-only claude settings: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, ".claude")); !os.IsNotExist(err) {
		t.Fatalf("expected read-only settings mode to skip writes, stat err=%v", err)
	}
}

type claudeExecutorFixture struct {
	root     string
	config   externalagentconfigs.Config
	executor *ClaudeExecutor
	send     *SendService
	runtime  *Runtime
	runs     *agentruns.RunStore
	engineID string
}

func newClaudeExecutorFixture(t *testing.T, scenario string) claudeExecutorFixture {
	t.Helper()

	root := t.TempDir()
	pythonCommand := writeClaudeFixtureCommand(t, scenario)
	sidecarPath := filepath.Join(t.TempDir(), "claude-sidecar.py")
	if err := os.WriteFile(sidecarPath, []byte("# fixture sidecar placeholder\n"), 0o644); err != nil {
		t.Fatalf("write claude sidecar placeholder: %v", err)
	}

	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	configs, err := externalagentconfigs.NewStore(root)
	if err != nil {
		t.Fatalf("new external config store: %v", err)
	}
	runs, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	profiles, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}

	configID := "external-config"
	approvalPolicy := "default"
	config := externalagentconfigs.Config{
		ID:                      configID,
		Name:                    "Claude fixture",
		ToolType:                externalagentconfigs.ToolTypeClaudeCode,
		RunMode:                 externalagentconfigs.RunModeSDK,
		ApprovalPolicy:          &approvalPolicy,
		SettingsMode:            externalagentconfigs.SettingsModeManagedLocal,
		SettingsAllowSettaEdits: true,
		WorkingDirStrategy:      externalagentconfigs.WorkingDirStrategyProjectRoot,
		SettingsManagedBlock: &externalagentconfigs.SettingsManagedBlock{
			Claude: map[string]any{
				"permissions": map[string]any{
					"allow": []any{"Read"},
					"ask":   []any{"Bash"},
					"deny":  []any{},
				},
			},
		},
	}
	if err := configs.Write([]externalagentconfigs.Config{config}); err != nil {
		t.Fatalf("write external configs: %v", err)
	}
	engineID := "engine-external"
	if err := engines.Write([]agentruns.EngineConfig{
		{
			ID:                    engineID,
			Name:                  "External Engine",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: &configID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	now := time.Date(2026, 3, 9, 13, 0, 0, 0, time.UTC)
	runtime, err := NewRuntime(RuntimeOptions{
		Runs: runs,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	claudeExecutor, err := NewClaudeExecutor(ClaudeExecutorOptions{
		Runs:               runs,
		Runtime:            runtime,
		WorkspaceRoot:      root,
		SettaServerURL:     mcpx.BuildSettaServerURL("127.0.0.1", 8000),
		CurrentSession:     &auth.CurrentSession{Metadata: auth.SessionMetadata{ID: "session-1"}, Secret: []byte("fixture-secret")},
		AuthCookieBaseName: auth.DefaultAuthCookieName,
		ProcessEnv:         llmconfig.CurrentProcessEnv(),
		PythonCommand:      pythonCommand,
		SidecarPath:        sidecarPath,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new claude executor: %v", err)
	}
	send, err := NewSendService(SendServiceOptions{
		ProjectState: projectRuntime,
		Engines:      engines,
		Runs:         runs,
		Profiles:     profiles,
		Configs:      configs,
		Runtime:      runtime,
		Preflight: stubPreflightChecker{
			status: externalagentconfigs.Status{
				ConfigID:  configID,
				Name:      "Claude fixture",
				ToolType:  externalagentconfigs.ToolTypeClaudeCode,
				RunMode:   externalagentconfigs.RunModeSDK,
				Supported: true,
				Available: true,
				Issues:    []string{},
			},
		},
		Executor: NewMultiExecutor(MultiExecutorOptions{
			Claude: claudeExecutor,
		}),
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new send service: %v", err)
	}

	return claudeExecutorFixture{
		root:     root,
		config:   config,
		executor: claudeExecutor,
		send:     send,
		runtime:  runtime,
		runs:     runs,
		engineID: engineID,
	}
}

func (f claudeExecutorFixture) waitForTerminalRun(t *testing.T, runID string) agentruns.Run {
	t.Helper()

	deadline := time.Now().Add(executorFixtureTerminalTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run %s: %v", runID, err)
		}
		if run.Status == agentruns.RunStatusCompleted || run.Status == agentruns.RunStatusFailed || run.Status == agentruns.RunStatusCancelled {
			return run
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for run %s to reach a terminal state", runID)
	return agentruns.Run{}
}

func (f claudeExecutorFixture) waitForLiveStateCleanup(t *testing.T, runID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureCleanupTimeout)
	for time.Now().Before(deadline) {
		liveState, err := f.runtime.GetLiveChatState(runID)
		if err != nil {
			t.Fatalf("get live state during cleanup wait: %v", err)
		}
		if liveState == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live state cleanup on %s", runID)
}

func (f claudeExecutorFixture) waitForApproval(t *testing.T, runID string, approvalID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureEventTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run while waiting for approval: %v", err)
		}
		if approvalMessagePresent(run, approvalID) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for approval %s", approvalID)
}

func (f claudeExecutorFixture) waitForQuestion(t *testing.T, runID string, toolCallID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureEventTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run while waiting for question: %v", err)
		}
		if questionToolCallPresent(run, toolCallID) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for question %s", toolCallID)
}

func writeClaudeFixtureCommand(t *testing.T, scenario string) string {
	t.Helper()

	commandPath := filepath.Join(t.TempDir(), "claude-fixture.sh")
	content := fmt.Sprintf("#!/bin/sh\nSETTA_CLAUDE_FIXTURE=1 SETTA_CLAUDE_FIXTURE_SCENARIO=%s exec %q -test.run '^TestClaudeFixtureProcess$' -- \"$@\"\n", scenario, os.Args[0])
	if err := os.WriteFile(commandPath, []byte(content), 0o755); err != nil {
		t.Fatalf("write claude fixture command: %v", err)
	}
	return commandPath
}

func TestClaudeFixtureProcess(t *testing.T) {
	if os.Getenv("SETTA_CLAUDE_FIXTURE") != "1" {
		return
	}
	if err := runClaudeFixtureProcess(os.Getenv("SETTA_CLAUDE_FIXTURE_SCENARIO")); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	os.Exit(0)
}

func runClaudeFixtureProcess(scenario string) error {
	reader := bufio.NewScanner(os.Stdin)
	reader.Buffer(make([]byte, 0, 16*1024), claudeStdoutBufferSize)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	readPayload := func() (map[string]any, error) {
		for reader.Scan() {
			line := strings.TrimSpace(reader.Text())
			if line == "" {
				continue
			}
			payload := map[string]any{}
			if err := json.Unmarshal([]byte(line), &payload); err != nil {
				return nil, fmt.Errorf("decode fixture payload: %w", err)
			}
			return payload, nil
		}
		if err := reader.Err(); err != nil {
			return nil, err
		}
		return nil, io.EOF
	}

	emit := func(payload map[string]any) error {
		content, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := writer.Write(append(content, '\n')); err != nil {
			return err
		}
		return writer.Flush()
	}

	startPayload, err := readPayload()
	if err != nil {
		return err
	}
	if strings.TrimSpace(stringValue(startPayload["type"])) != "start" {
		return fmt.Errorf("expected start payload, got %#v", startPayload)
	}

	switch scenario {
	case "generated_mcp_config":
		configPath := strings.TrimSpace(stringValue(startPayload["mcpConfigPath"]))
		if configPath == "" {
			return fmt.Errorf("expected generated mcpConfigPath, got %#v", startPayload)
		}
		if filepath.Base(configPath) != claudeMCPConfigName {
			return fmt.Errorf("expected generated mcpConfigPath basename %q, got %q", claudeMCPConfigName, filepath.Base(configPath))
		}
		content, err := os.ReadFile(configPath)
		if err != nil {
			return fmt.Errorf("read generated claude mcp config: %w", err)
		}
		payload := map[string]any{}
		if err := json.Unmarshal(content, &payload); err != nil {
			return fmt.Errorf("decode generated claude mcp config: %w", err)
		}
		rawServers, ok := payload["mcpServers"].(map[string]any)
		if !ok {
			return fmt.Errorf("expected generated mcpServers map, got %#v", payload["mcpServers"])
		}
		settaServer, ok := rawServers[mcpx.DefaultServerID].(map[string]any)
		if !ok {
			return fmt.Errorf("expected generated setta mcp server entry, got %#v", rawServers)
		}
		if got := strings.TrimSpace(stringValue(settaServer["type"])); got != "sse" {
			return fmt.Errorf("expected generated setta transport sse, got %#v", settaServer)
		}
		if got := strings.TrimSpace(stringValue(settaServer["url"])); got != "http://127.0.0.1:8000/mcp" {
			return fmt.Errorf("expected generated setta url, got %#v", settaServer)
		}
		if err := emitClaudeAssistantTurn(emit, "session-generated-mcp", "assistant-generated-mcp", configPath); err != nil {
			return err
		}
		return emit(map[string]any{
			"type":      "result",
			"sessionId": "session-generated-mcp",
			"isError":   false,
			"result":    "ok",
			"usage":     map[string]any{"input_tokens": 5, "output_tokens": 3},
		})
	case "env_echo":
		rawEnv, ok := startPayload["env"].(map[string]any)
		if !ok {
			return fmt.Errorf("expected env payload, got %#v", startPayload["env"])
		}
		if got := strings.TrimSpace(stringValue(rawEnv["PROCESS_KEY"])); got != "process-secret" {
			return fmt.Errorf("expected process key passthrough, got %#v", rawEnv["PROCESS_KEY"])
		}
		if got := strings.TrimSpace(stringValue(rawEnv["WHITESPACE_KEY"])); got != "managed-fallback" {
			return fmt.Errorf("expected managed fallback for whitespace key, got %#v", rawEnv["WHITESPACE_KEY"])
		}
		if _, ok := rawEnv["PLAIN_KEY"]; ok {
			return fmt.Errorf("expected plain dotenv-only key to stay excluded, got %#v", rawEnv["PLAIN_KEY"])
		}
		if _, ok := rawEnv["MISSING_KEY"]; ok {
			return fmt.Errorf("expected missing key to stay excluded, got %#v", rawEnv["MISSING_KEY"])
		}
		if err := emitClaudeAssistantTurn(emit, "session-env", "assistant-env", "Env handoff ok"); err != nil {
			return err
		}
		return emit(map[string]any{
			"type":      "result",
			"sessionId": "session-env",
			"isError":   false,
			"result":    "ok",
			"usage":     map[string]any{"input_tokens": 4, "output_tokens": 3},
		})
	case "approval":
		if err := emit(map[string]any{
			"type":       "approval_request",
			"approvalId": "approval-1",
			"toolName":   "Bash",
			"toolType":   "command",
			"input":      map[string]any{"command": "echo approval"},
		}); err != nil {
			return err
		}
		payload, err := readPayload()
		if err != nil {
			return err
		}
		if strings.TrimSpace(stringValue(payload["type"])) != "approval_response" {
			return fmt.Errorf("expected approval_response, got %#v", payload)
		}
		if strings.TrimSpace(stringValue(payload["approvalId"])) != "approval-1" || payload["approved"] != true {
			return fmt.Errorf("unexpected approval response %#v", payload)
		}
		if err := emitClaudeAssistantTurn(emit, "session-approval", "assistant-approval", "Approval granted"); err != nil {
			return err
		}
		return emit(map[string]any{
			"type":      "result",
			"sessionId": "session-approval",
			"isError":   false,
			"result":    "ok",
			"usage":     map[string]any{"input_tokens": 6, "output_tokens": 4},
		})
	case "question":
		if err := emit(map[string]any{
			"type":       "approval_request",
			"approvalId": "approval-1",
			"toolName":   askUserQuestionToolName,
			"toolType":   "question",
			"input": map[string]any{
				"questions": []any{map[string]any{"question": "Language", "type": "text"}},
			},
		}); err != nil {
			return err
		}
		if err := emit(map[string]any{
			"type":      "stream_event",
			"sessionId": "session-question",
			"event": map[string]any{
				"type":    "message_start",
				"message": map[string]any{"id": "assistant-question", "content": []any{}},
			},
		}); err != nil {
			return err
		}
		if err := emit(map[string]any{
			"type":      "stream_event",
			"sessionId": "session-question",
			"event": map[string]any{
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
			},
		}); err != nil {
			return err
		}
		payload, err := readPayload()
		if err != nil {
			return err
		}
		if strings.TrimSpace(stringValue(payload["type"])) != "tool_response" {
			return fmt.Errorf("expected tool_response, got %#v", payload)
		}
		if strings.TrimSpace(stringValue(payload["toolCallId"])) != "approval-1" {
			return fmt.Errorf("expected question response to use approval id, got %#v", payload)
		}
		if err := emitClaudeAssistantTurn(emit, "session-question", "assistant-follow-up", "Chosen: Go"); err != nil {
			return err
		}
		return emit(map[string]any{
			"type":      "result",
			"sessionId": "session-question",
			"isError":   false,
			"result":    "ok",
			"usage":     map[string]any{"input_tokens": 7, "output_tokens": 5},
		})
	case "tool_result_and_mcp_status":
		for _, payload := range []map[string]any{
			{
				"type":      "stream_event",
				"sessionId": "session-tool-result",
				"event": map[string]any{
					"type":    "message_start",
					"message": map[string]any{"id": "assistant-tool-1", "content": []any{}},
				},
			},
			{
				"type":      "stream_event",
				"sessionId": "session-tool-result",
				"event": map[string]any{
					"type":  "content_block_start",
					"index": 0,
					"content_block": map[string]any{
						"type": "tool_use",
						"id":   "toolu-1",
						"name": "Bash",
						"input": map[string]any{
							"command": "ls",
						},
					},
				},
			},
			{
				"type":      "system_message",
				"sessionId": "session-tool-result",
				"message": map[string]any{
					"subtype": "mcp_status",
					"mcp_servers": []any{
						map[string]any{
							"serverId":  "filesystem",
							"status":    "failed",
							"transport": "stdio",
							"command":   "npx @modelcontextprotocol/server-filesystem .",
							"error":     "spawn failed",
						},
					},
				},
			},
			{
				"type":      "stream_event",
				"sessionId": "session-tool-result",
				"event": map[string]any{
					"type":  "content_block_stop",
					"index": 0,
				},
			},
			{
				"type":      "stream_event",
				"sessionId": "session-tool-result",
				"event": map[string]any{
					"type":  "content_block_start",
					"index": 1,
					"content_block": map[string]any{
						"type":        "tool_result",
						"tool_use_id": "toolu-1",
						"content":     []any{map[string]any{"type": "text", "text": "ok"}},
					},
				},
			},
			{
				"type":      "stream_event",
				"sessionId": "session-tool-result",
				"event": map[string]any{
					"type":  "content_block_stop",
					"index": 1,
				},
			},
			{
				"type":      "stream_event",
				"sessionId": "session-tool-result",
				"event": map[string]any{
					"type": "message_stop",
				},
			},
		} {
			if err := emit(payload); err != nil {
				return err
			}
		}
		if err := emitClaudeAssistantTurn(emit, "session-tool-result", "assistant-tool-summary", "Tool completed."); err != nil {
			return err
		}
		return emit(map[string]any{
			"type":      "result",
			"sessionId": "session-tool-result",
			"isError":   false,
			"result":    "ok",
			"usage":     map[string]any{"input_tokens": 9, "output_tokens": 6},
		})
	default:
		if err := emitClaudeAssistantTurn(emit, "session-complete", "assistant-1", "Hello from Claude"); err != nil {
			return err
		}
		return emit(map[string]any{
			"type":      "result",
			"sessionId": "session-complete",
			"isError":   false,
			"result":    "ok",
			"usage":     map[string]any{"input_tokens": 12, "output_tokens": 8},
		})
	}
}

func emitClaudeAssistantTurn(
	emit func(map[string]any) error,
	sessionID string,
	messageID string,
	text string,
) error {
	payloads := []map[string]any{
		{
			"type":      "stream_event",
			"sessionId": sessionID,
			"event": map[string]any{
				"type":    "message_start",
				"message": map[string]any{"id": messageID, "content": []any{}},
			},
		},
		{
			"type":      "stream_event",
			"sessionId": sessionID,
			"event": map[string]any{
				"type":  "content_block_start",
				"index": 0,
				"content_block": map[string]any{
					"type": "text",
					"text": text,
				},
			},
		},
		{
			"type":      "stream_event",
			"sessionId": sessionID,
			"event": map[string]any{
				"type": "message_stop",
			},
		},
	}
	for _, payload := range payloads {
		if err := emit(payload); err != nil {
			return err
		}
	}
	return nil
}
