package externalagents

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
	"setta/internal/projectstate"

	toml "github.com/pelletier/go-toml/v2"
)

func TestCodexExecutorCompletesRunAndPersistsAssistantOutput(t *testing.T) {
	// These tests launch nested subprocess fixtures, so keep them serial.
	fixture := newCodexExecutorFixture(t, "complete")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello from Codex"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	if got := resolveRunOutputString(persisted, "threadId"); got != "thread-complete" {
		t.Fatalf("expected persisted thread id, got %q", got)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := messages[len(messages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message, got %#v", messages[len(messages)-1])
	}
	if got := extractMessageText(lastMessage); got != "Hello from Codex" {
		t.Fatalf("unexpected assistant text %q", got)
	}
	liveState, err := fixture.runtime.GetLiveChatState(result.Run.ID)
	if err != nil {
		t.Fatalf("get live chat state after completion: %v", err)
	}
	if liveState != nil {
		fixture.waitForLiveStateCleanup(t, result.Run.ID)
	}
}

func TestCodexExecutorPersistsConfigDerivedMCPStatusSnapshotWhenProbeReturnsEmpty(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "complete")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello from Codex"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	rawSnapshot, ok := persisted.Outputs[externalMCPStatusSnapshotKey].([]any)
	if !ok || len(rawSnapshot) != 1 {
		t.Fatalf("expected config-derived MCP snapshot, got %#v", persisted.Outputs)
	}
	statuses, err := fixture.runtime.ExternalRuntimeStatuses(stringPtr(result.ChatID), stringPtr(fixture.engineID))
	if err != nil {
		t.Fatalf("read external runtime statuses: %v", err)
	}
	if len(statuses) != 1 {
		t.Fatalf("expected one external runtime status, got %#v", statuses)
	}
	if statuses[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected streamable_http transport, got %#v", statuses[0])
	}
	if statuses[0].State != mcpx.RuntimeStateUnknown {
		t.Fatalf("expected unknown runtime state for config-derived snapshot, got %#v", statuses[0])
	}
	if statuses[0].ToolCount != len(fixture.settaToolNames) {
		t.Fatalf("expected config-derived tool count %d, got %#v", len(fixture.settaToolNames), statuses[0])
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorResumesExplicitThreadIDAndPersistsIt(t *testing.T) {
	// These tests launch nested subprocess fixtures, so keep them serial.
	fixture := newCodexExecutorFixture(t, "complete")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Resume this Codex thread"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
		AdditionalInputs: map[string]any{
			"threadId": "thread-explicit-resume",
		},
	})
	if err != nil {
		t.Fatalf("start codex run with explicit thread id: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	if got := resolveRunOutputString(persisted, "threadId"); got != "thread-explicit-resume" {
		t.Fatalf("expected persisted explicit thread id, got %q", got)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestBuildCodexPromptOmitsSystemAndDeveloperMessages(t *testing.T) {
	t.Parallel()

	prompt := buildCodexPrompt(map[string]any{
		"messages": []any{
			map[string]any{
				"role":    "system",
				"content": []any{map[string]any{"type": "text", "text": "System message"}},
			},
			map[string]any{
				"role":    "user",
				"content": []any{map[string]any{"type": "text", "text": "User request"}},
			},
			map[string]any{
				"role":    "assistant",
				"content": []any{map[string]any{"type": "text", "text": "Assistant reply"}},
			},
			map[string]any{
				"role":    "developer",
				"content": []any{map[string]any{"type": "text", "text": "Developer note"}},
			},
		},
		"prompt": "Extra prompt.",
	})

	if !containsText(prompt, "User:\nUser request") {
		t.Fatalf("expected user text in prompt, got %q", prompt)
	}
	if !containsText(prompt, "Assistant:\nAssistant reply") {
		t.Fatalf("expected assistant text in prompt, got %q", prompt)
	}
	if !containsText(prompt, "Extra prompt.") {
		t.Fatalf("expected extra prompt text in prompt, got %q", prompt)
	}
	if containsText(prompt, "System message") || containsText(prompt, "Developer note") || containsText(prompt, "System:\n") {
		t.Fatalf("expected system/developer messages to be omitted, got %q", prompt)
	}
}

func TestBuildCodexTurnParamsMapsPoliciesSandboxAndStructuredOutput(t *testing.T) {
	t.Parallel()

	request := StartRequest{
		ExternalConfig: externalagentconfigs.Config{
			ToolType:       externalagentconfigs.ToolTypeCodex,
			RunMode:        externalagentconfigs.RunModeAppServer,
			DefaultModel:   stringPtr("gpt-5-codex"),
			ApprovalPolicy: stringPtr("on-request"),
			SandboxPolicy:  stringPtr("workspace-write"),
		},
		Inputs: map[string]any{
			"effort":  "low",
			"summary": "auto",
			"outputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{"type": "string"},
				},
				"required": []any{"status"},
			},
		},
	}

	params, err := buildCodexTurnParams(request, "hello", "thread-1", "workspace")
	if err != nil {
		t.Fatalf("build codex turn params: %v", err)
	}

	if got := stringValue(params["approvalPolicy"]); got != "on-request" {
		t.Fatalf("expected approvalPolicy on-request, got %#v", params["approvalPolicy"])
	}
	sandboxPolicy, ok := mapValue(params["sandboxPolicy"])
	if !ok || stringValue(sandboxPolicy["type"]) != "workspaceWrite" {
		t.Fatalf("expected workspaceWrite sandbox policy, got %#v", params["sandboxPolicy"])
	}
	if got := stringValue(params["effort"]); got != "low" {
		t.Fatalf("expected effort low, got %#v", params["effort"])
	}
	if got := stringValue(params["summary"]); got != "auto" {
		t.Fatalf("expected summary auto, got %#v", params["summary"])
	}
	if got := stringValue(params["cwd"]); got != "workspace" {
		t.Fatalf("expected cwd workspace, got %#v", params["cwd"])
	}
	outputSchema, ok := mapValue(params["outputSchema"])
	if !ok || stringValue(outputSchema["type"]) != "object" {
		t.Fatalf("expected object output schema, got %#v", params["outputSchema"])
	}
	properties, ok := mapValue(outputSchema["properties"])
	if !ok {
		t.Fatalf("expected output schema properties, got %#v", outputSchema)
	}
	statusProperty, ok := mapValue(properties["status"])
	if !ok || stringValue(statusProperty["type"]) != "string" {
		t.Fatalf("expected status property type string, got %#v", properties["status"])
	}
}

func TestMapCodexApprovalPolicyNormalizesSourceAliases(t *testing.T) {
	t.Parallel()

	if got := mapCodexApprovalPolicy("untrusted", ""); got != "untrusted" {
		t.Fatalf("expected untrusted approval policy, got %q", got)
	}
	if got := mapCodexApprovalPolicy("on-failure", ""); got != "on-failure" {
		t.Fatalf("expected on-failure approval policy, got %q", got)
	}
}

func TestBuildCodexTurnParamsRejectsNonObjectOutputSchema(t *testing.T) {
	t.Parallel()

	_, err := buildCodexTurnParams(StartRequest{
		ExternalConfig: externalagentconfigs.Config{
			ToolType: externalagentconfigs.ToolTypeCodex,
			RunMode:  externalagentconfigs.RunModeAppServer,
		},
		Inputs: map[string]any{
			"outputSchema": []any{"bad"},
		},
	}, "hello", "thread-1", ".")
	if err == nil {
		t.Fatal("expected non-object outputSchema to fail")
	}
}

func TestBuildCodexApprovalStateIncludesCommandAndFileChangePayloads(t *testing.T) {
	t.Parallel()

	request := StartRequest{
		Run:             agentruns.Run{ID: "run-1"},
		ProjectConfigID: "project-1",
		ChatID:          "chat-1",
	}
	testCases := []struct {
		name        string
		payload     map[string]any
		wantID      string
		wantCommand string
		wantDiff    string
	}{
		{
			name: "command execution",
			payload: map[string]any{
				"id":     42,
				"method": "item/commandExecution/requestApproval",
				"params": map[string]any{
					"item": map[string]any{
						"type":    "commandExecution",
						"command": "rm -rf /tmp/example-dir",
						"parsedCmd": map[string]any{
							"cmd":  "rm",
							"args": []any{"-rf", "/tmp/example-dir"},
						},
					},
				},
			},
			wantID:      "42",
			wantCommand: "rm -rf /tmp/example-dir",
		},
		{
			name: "file change",
			payload: map[string]any{
				"id":     7,
				"method": "item/fileChange/requestApproval",
				"params": map[string]any{
					"item": map[string]any{
						"type": "fileChange",
						"path": "/tmp/file.txt",
						"diff": "---\n+++",
					},
				},
			},
			wantID:   "7",
			wantDiff: "---\n+++",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			approvalState, arguments, err := buildCodexApprovalState(request, testCase.payload)
			if err != nil {
				t.Fatalf("build codex approval state: %v", err)
			}
			if approvalState.ApprovalID != testCase.wantID || approvalState.RunID != "run-1" || approvalState.ProjectConfigID != "project-1" || approvalState.ChatID != "chat-1" {
				t.Fatalf("unexpected approval state %#v", approvalState)
			}
			if got := stringValue(arguments["approvalId"]); got != testCase.wantID {
				t.Fatalf("expected approvalId %q, got %#v", testCase.wantID, arguments["approvalId"])
			}
			if got := stringValue(arguments["command"]); got != testCase.wantCommand {
				t.Fatalf("expected command %q, got %#v", testCase.wantCommand, arguments["command"])
			}
			if got := stringValue(arguments["diff"]); got != testCase.wantDiff {
				t.Fatalf("expected diff %q, got %#v", testCase.wantDiff, arguments["diff"])
			}
			inputPayload, ok := mapValue(arguments["input"])
			if !ok {
				t.Fatalf("expected approval input payload, got %#v", arguments["input"])
			}
			if testCase.wantDiff != "" && stringValue(inputPayload["diff"]) != testCase.wantDiff {
				t.Fatalf("expected diff inside input payload, got %#v", inputPayload)
			}
			if testCase.wantCommand != "" && stringValue(inputPayload["command"]) != testCase.wantCommand {
				t.Fatalf("expected command inside input payload, got %#v", inputPayload)
			}
		})
	}
}

func TestCodexExecutorPersistsUsageFromThreadTokenUsageUpdated(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "usage_stream")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Reply with exactly HELLO."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start usage codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	usage, ok := persisted.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted usage payload, got %#v", persisted.Outputs["usage"])
	}
	if int(floatValueForTest(usage["inputTokens"])) != 11 || int(floatValueForTest(usage["outputTokens"])) != 2 || int(floatValueForTest(usage["totalTokens"])) != 13 {
		t.Fatalf("unexpected prompt/completion usage %#v", usage)
	}
	if int(floatValueForTest(usage["contextUsedTokens"])) != 11 || int(floatValueForTest(usage["contextWindowTokens"])) != 272000 {
		t.Fatalf("unexpected context usage %#v", usage)
	}
	contextUsage := resolveContextUsage(persisted)
	if contextUsage == nil || contextUsage.ContextWindowTokens == nil || *contextUsage.ContextWindowTokens != 272000 || contextUsage.ContextUsedTokens == nil || *contextUsage.ContextUsedTokens != 11 {
		t.Fatalf("unexpected resolved context usage %#v", contextUsage)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorPersistsUsageDuringActiveRun(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "usage_live")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Reply with exactly HELLO."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start live usage codex run: %v", err)
	}

	usage := fixture.waitForRunUsage(t, result.Run.ID)
	if int(floatValueForTest(usage["inputTokens"])) != 23 || int(floatValueForTest(usage["outputTokens"])) != 5 {
		t.Fatalf("unexpected live usage totals %#v", usage)
	}
	if int(floatValueForTest(usage["contextUsedTokens"])) != 23 || int(floatValueForTest(usage["contextWindowTokens"])) != 400000 {
		t.Fatalf("unexpected live context usage %#v", usage)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	usage, ok := persisted.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted live usage payload, got %#v", persisted.Outputs["usage"])
	}
	if int(floatValueForTest(usage["inputTokens"])) != 23 || int(floatValueForTest(usage["outputTokens"])) != 5 {
		t.Fatalf("unexpected persisted live usage totals %#v", usage)
	}
	if int(floatValueForTest(usage["contextUsedTokens"])) != 23 || int(floatValueForTest(usage["contextWindowTokens"])) != 400000 {
		t.Fatalf("unexpected persisted live context usage %#v", usage)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorSkipsUsageWithoutThreadTokenUsageUpdated(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "usage_missing")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Reply with exactly HELLO."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start missing usage codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if _, ok := persisted.Outputs["usage"]; ok {
		t.Fatalf("expected missing usage event to be omitted, got %#v", persisted.Outputs["usage"])
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorFailsRunWhenSettaToolCallNeverStarts(t *testing.T) {
	fixture := newCodexExecutorFixtureWithOptions(t, "stalled_tool_call", codexExecutorFixtureOptions{
		toolDispatchTimeout:  75 * time.Millisecond,
		toolResultTimeout:    75 * time.Millisecond,
		watchdogPollInterval: 10 * time.Millisecond,
	})
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create a callable section."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start stalled codex run: %v", err)
	}

	fixture.waitForPendingToolCall(t, result.Run.ID, "call-stalled")
	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed status, got %#v", persisted)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "run_failed" {
		t.Fatalf("expected run_failed event, got %#v", persisted.Events)
	}
	if !strings.Contains(stringValue(lastEvent.Payload["error"]), "never received the request") {
		t.Fatalf("expected dispatch stall failure, got %#v", lastEvent.Payload)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorFailsRunWhenSettaToolCompletesButCodexNeverReturnsResult(t *testing.T) {
	fixture := newCodexExecutorFixtureWithOptions(t, "stalled_tool_call", codexExecutorFixtureOptions{
		toolDispatchTimeout:  250 * time.Millisecond,
		toolResultTimeout:    75 * time.Millisecond,
		watchdogPollInterval: 10 * time.Millisecond,
	})
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create a callable section."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start stalled codex run: %v", err)
	}

	fixture.waitForPendingToolCall(t, result.Run.ID, "call-stalled")
	fixture.runtime.RecordMCPToolInvocationStarted(result.Run.ID, "create_top_level_section")
	fixture.runtime.RecordMCPToolInvocationCompleted(result.Run.ID, "create_top_level_section")

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed status, got %#v", persisted)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "run_failed" {
		t.Fatalf("expected run_failed event, got %#v", persisted.Events)
	}
	if !strings.Contains(stringValue(lastEvent.Payload["error"]), "never returned a tool result") {
		t.Fatalf("expected result stall failure, got %#v", lastEvent.Payload)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorFailsRunWhenRawSettaToolCallNeverStarts(t *testing.T) {
	fixture := newCodexExecutorFixtureWithOptions(t, "stalled_raw_tool_call", codexExecutorFixtureOptions{
		toolDispatchTimeout:  75 * time.Millisecond,
		toolResultTimeout:    75 * time.Millisecond,
		watchdogPollInterval: 10 * time.Millisecond,
	})
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create a callable section."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start stalled raw codex run: %v", err)
	}

	fixture.waitForPendingToolCall(t, result.Run.ID, "call-stalled-raw")
	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed status, got %#v", persisted)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "run_failed" {
		t.Fatalf("expected run_failed event, got %#v", persisted.Events)
	}
	if !strings.Contains(stringValue(lastEvent.Payload["error"]), "never received the request") {
		t.Fatalf("expected dispatch stall failure, got %#v", lastEvent.Payload)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorFailsRunWhenRawSettaToolCompletesButCodexNeverReturnsResult(t *testing.T) {
	fixture := newCodexExecutorFixtureWithOptions(t, "stalled_raw_tool_call", codexExecutorFixtureOptions{
		toolDispatchTimeout:  250 * time.Millisecond,
		toolResultTimeout:    75 * time.Millisecond,
		watchdogPollInterval: 10 * time.Millisecond,
	})
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create a callable section."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start stalled raw codex run: %v", err)
	}

	fixture.waitForPendingToolCall(t, result.Run.ID, "call-stalled-raw")
	fixture.runtime.RecordMCPToolInvocationStarted(result.Run.ID, "create_top_level_section")
	fixture.runtime.RecordMCPToolInvocationCompleted(result.Run.ID, "create_top_level_section")

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed status, got %#v", persisted)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "run_failed" {
		t.Fatalf("expected run_failed event, got %#v", persisted.Events)
	}
	if !strings.Contains(stringValue(lastEvent.Payload["error"]), "never returned a tool result") {
		t.Fatalf("expected result stall failure, got %#v", lastEvent.Payload)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorIgnoresSlowMCPStatusProbeAndCompletesRun(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "slow_status")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start slow status codex run: %v", err)
	}

	// Measure only the post-start completion window so suite-wide startup jitter
	// does not masquerade as a slow optional MCP status probe.
	startedAt := time.Now()
	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if elapsed := time.Since(startedAt); elapsed >= 3500*time.Millisecond {
		t.Fatalf("expected MCP status probe timeout to stay short, run took %s", elapsed)
	}
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	rawSnapshot, ok := persisted.Outputs[externalMCPStatusSnapshotKey].([]any)
	if !ok || len(rawSnapshot) != 1 {
		t.Fatalf("expected config-derived MCP snapshot during slow probe, got %#v", persisted.Outputs)
	}
	statuses, err := fixture.runtime.ExternalRuntimeStatuses(stringPtr(result.ChatID), stringPtr(fixture.engineID))
	if err != nil {
		t.Fatalf("read external runtime statuses after slow probe: %v", err)
	}
	if len(statuses) != 1 || statuses[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected config-derived streamable_http status after slow probe, got %#v", statuses)
	}
	if statuses[0].ToolCount != len(fixture.settaToolNames) {
		t.Fatalf("expected config-derived tool count %d after slow probe, got %#v", len(fixture.settaToolNames), statuses)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorRefreshesMCPStatusAtCompletionWhenRuntimeStatusAppearsLate(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "late_status")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start late-status codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	rawSnapshot, ok := persisted.Outputs[externalMCPStatusSnapshotKey].([]any)
	if !ok || len(rawSnapshot) != 1 {
		t.Fatalf("expected MCP snapshot, got %#v", persisted.Outputs)
	}
	statuses, err := fixture.runtime.ExternalRuntimeStatuses(stringPtr(result.ChatID), stringPtr(fixture.engineID))
	if err != nil {
		t.Fatalf("read external runtime statuses after completion refresh: %v", err)
	}
	if len(statuses) != 1 {
		t.Fatalf("expected one external runtime status, got %#v", statuses)
	}
	if statuses[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("expected connected runtime state after completion refresh, got %#v", statuses[0])
	}
	if statuses[0].ToolCount != 4 {
		t.Fatalf("expected refreshed tool count 4, got %#v", statuses[0])
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorPersistsDelayedMCPStatusAfterRunCompletion(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "delayed_status")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start delayed-status codex run: %v", err)
	}

	startedAt := time.Now()
	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if elapsed := time.Since(startedAt); elapsed >= 1500*time.Millisecond {
		t.Fatalf("expected delayed MCP status probe to stay off the terminal run path, run took %s", elapsed)
	}
	rawSnapshot, ok := persisted.Outputs[externalMCPStatusSnapshotKey].([]any)
	if !ok || len(rawSnapshot) != 1 {
		t.Fatalf("expected initial MCP snapshot, got %#v", persisted.Outputs)
	}

	connectedStatus := fixture.waitForPersistedExternalMCPStatusState(
		t,
		result.Run.ID,
		mcpx.RuntimeStateConnected,
	)
	if connectedStatus.ToolCount != 4 {
		t.Fatalf("expected delayed connected tool count 4, got %#v", connectedStatus)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorWritesSessionScopedRuntimeConfig(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "complete")
	writeCodexCompletionGuardSetting(t, fixture.root, true)
	profileID := "profile-codex"
	if err := fixture.profiles.Write([]agentprofiles.Profile{{
		ID:            profileID,
		Name:          "Codex",
		ToolAllowlist: []string{"setta__getProjectState", "runTool"},
	}}); err != nil {
		t.Fatalf("write codex profile: %v", err)
	}
	baseConfigPath := filepath.Join(
		fixture.root,
		codexSettingsRootName,
		"codex",
		fixture.configID,
		codexConfigFileName,
	)
	if err := os.MkdirAll(filepath.Dir(baseConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir codex base config dir: %v", err)
	}
	baseConfig, err := toml.Marshal(map[string]any{
		"mcp_servers": map[string]any{
			"filesystem": map[string]any{
				"transport": "stdio",
				"command":   "npx @modelcontextprotocol/server-filesystem .",
			},
			"setta": map[string]any{
				"url": "http://127.0.0.1:8000/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode codex base config: %v", err)
	}
	if err := os.WriteFile(baseConfigPath, baseConfig, 0o644); err != nil {
		t.Fatalf("write codex base config: %v", err)
	}

	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello from Codex"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		AgentProfileID:  &profileID,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}

	configPath := filepath.Join(
		fixture.root,
		codexSettingsRootName,
		"codex",
		fixture.configID,
		"sessions",
		result.ChatID,
		codexConfigFileName,
	)
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read runtime codex config: %v", err)
	}
	runtimeConfig := map[string]any{}
	if err := toml.Unmarshal(content, &runtimeConfig); err != nil {
		t.Fatalf("decode runtime codex config: %v", err)
	}
	if got := stringValue(runtimeConfig["approval_policy"]); got != "on-request" {
		t.Fatalf("expected runtime approval policy, got %#v", runtimeConfig["approval_policy"])
	}
	if got := stringValue(runtimeConfig["sandbox_mode"]); got != "workspace-write" {
		t.Fatalf("expected runtime sandbox mode, got %#v", runtimeConfig["sandbox_mode"])
	}
	if got := stringValue(runtimeConfig["model_reasoning_summary"]); got != "none" {
		t.Fatalf("expected runtime reasoning summary default, got %#v", runtimeConfig["model_reasoning_summary"])
	}
	mcpServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	if _, ok := mapValue(mcpServers["filesystem"]); !ok {
		t.Fatalf("expected inherited filesystem mcp server, got %#v", mcpServers)
	}
	settaServer, ok := mapValue(mcpServers["setta"])
	if !ok || stringValue(settaServer["transport"]) != "streamable_http" || stringValue(settaServer["url"]) != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected runtime setta mcp url, got %#v", mcpServers["setta"])
	}
	headers, ok := mapValue(settaServer["http_headers"])
	if !ok {
		t.Fatalf("expected runtime setta http_headers, got %#v", settaServer["http_headers"])
	}
	cookieName, err := auth.CookieName(auth.DefaultAuthCookieName, "session-1")
	if err != nil {
		t.Fatalf("resolve auth cookie name: %v", err)
	}
	cookie := strings.TrimSpace(stringValue(headers["Cookie"]))
	if !strings.HasPrefix(cookie, cookieName+"=") {
		t.Fatalf("expected runtime auth cookie header to start with %q, got %q", cookieName+"=", cookie)
	}
	if got := stringValue(headers[mcpx.AgenticContextProjectConfigIDHeader]); got != "project-alpha" {
		t.Fatalf("expected project-config header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextChatIDHeader]); got != result.ChatID {
		t.Fatalf("expected chat header %q, got %#v", result.ChatID, headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextRunIDHeader]); got != result.Run.ID {
		t.Fatalf("expected run header %q, got %#v", result.Run.ID, headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextAllowUnscopedHeader]); got != "true" {
		t.Fatalf("expected allow-unscoped header, got %#v", headers)
	}
	if got := stringSliceValue(settaServer["enabled_tools"]); !equalStringSlices(got, []string{
		"getProjectState",
		"report_completion_status",
		"runTool",
		"set_agentic_context",
	}) {
		t.Fatalf("expected runtime enabled_tools to reflect profile allowlist and completion guard, got %#v", settaServer["enabled_tools"])
	}
	if !containsText(stringValue(runtimeConfig["developer_instructions"]), "## Runtime execution settings") {
		t.Fatalf("expected runtime developer instructions to include execution settings, got %#v", runtimeConfig["developer_instructions"])
	}
	projects, ok := mapValue(runtimeConfig["projects"])
	if !ok {
		t.Fatalf("expected runtime projects map, got %#v", runtimeConfig["projects"])
	}
	projectEntry, ok := mapValue(projects[fixture.root])
	if !ok || stringValue(projectEntry["trust_level"]) != "trusted" {
		t.Fatalf("expected trusted runtime project entry, got %#v", runtimeConfig["projects"])
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorOmitsCompletionReportToolWhenCompletionGuardDisabled(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "complete")
	writeCodexCompletionGuardSetting(t, fixture.root, false)
	profileID := "profile-codex"
	if err := fixture.profiles.Write([]agentprofiles.Profile{{
		ID:            profileID,
		Name:          "Codex",
		ToolAllowlist: []string{"setta__getProjectState", "runTool"},
	}}); err != nil {
		t.Fatalf("write codex profile: %v", err)
	}

	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello from Codex"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		AgentProfileID:  &profileID,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}

	configPath := filepath.Join(
		fixture.root,
		codexSettingsRootName,
		"codex",
		fixture.configID,
		"sessions",
		result.ChatID,
		codexConfigFileName,
	)
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read runtime codex config: %v", err)
	}
	runtimeConfig := map[string]any{}
	if err := toml.Unmarshal(content, &runtimeConfig); err != nil {
		t.Fatalf("decode runtime codex config: %v", err)
	}
	mcpServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	settaServer, ok := mapValue(mcpServers["setta"])
	if !ok {
		t.Fatalf("expected runtime setta server entry, got %#v", mcpServers["setta"])
	}
	if got := stringSliceValue(settaServer["enabled_tools"]); !equalStringSlices(got, []string{
		"getProjectState",
		"runTool",
		"set_agentic_context",
	}) {
		t.Fatalf("expected runtime enabled_tools to omit completion report tool when guard is disabled, got %#v", settaServer["enabled_tools"])
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestBuildCodexToolAllowlistReturnsNilForEmptyAllowlist(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name    string
		profile *agentprofiles.Profile
	}{
		{
			name:    "nil profile",
			profile: nil,
		},
		{
			name: "nil allowlist",
			profile: &agentprofiles.Profile{
				ToolAllowlist: nil,
			},
		},
		{
			name: "empty allowlist",
			profile: &agentprofiles.Profile{
				ToolAllowlist: []string{},
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			allowlist, err := buildCodexToolAllowlist(testCase.profile, true)
			if err != nil {
				t.Fatalf("build codex tool allowlist: %v", err)
			}
			if allowlist != nil {
				t.Fatalf("expected nil allowlist, got %#v", allowlist)
			}
		})
	}
}

func TestBuildCodexEnabledToolsUsesRegistryWhenProfileDoesNotScopeTools(t *testing.T) {
	t.Parallel()

	registry := newCodexTestToolRegistry(t, "create_top_level_section", "getProjectState", "set_agentic_context")
	got, err := buildCodexEnabledTools(nil, true, registry)
	if err != nil {
		t.Fatalf("build codex enabled tools: %v", err)
	}
	if !equalStringSlices(got, []string{"create_top_level_section", "getProjectState", "set_agentic_context"}) {
		t.Fatalf("expected registry-backed enabled tools, got %#v", got)
	}
}

func TestBuildCodexEnabledToolsUsesRegistryForAllowAllProfile(t *testing.T) {
	t.Parallel()

	registry := newCodexTestToolRegistry(t, "create_top_level_section", "getProjectState", "set_agentic_context")
	got, err := buildCodexEnabledTools(&agentprofiles.Profile{
		ToolAllowlist: []string{"setta"},
	}, false, registry)
	if err != nil {
		t.Fatalf("build codex enabled tools: %v", err)
	}
	if !equalStringSlices(got, []string{"create_top_level_section", "getProjectState", "set_agentic_context"}) {
		t.Fatalf("expected allow-all profile to resolve registry-backed enabled tools, got %#v", got)
	}
}

func TestBuildCodexToolAllowlistRejectsBlankAndForeignServerEntries(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name      string
		entries   []string
		wantError string
	}{
		{
			name:      "blank entry",
			entries:   []string{" "},
			wantError: "toolAllowlist entries must be non-empty strings",
		},
		{
			name:      "foreign server entry",
			entries:   []string{"other__tool"},
			wantError: "external tool allowlist only supports MCP server \"setta\": other__tool",
		},
		{
			name:      "foreign mcp entry",
			entries:   []string{"mcp__other__tool"},
			wantError: "external tool allowlist only supports MCP server \"setta\": mcp__other__tool",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			allowlist, err := buildCodexToolAllowlist(&agentprofiles.Profile{
				ToolAllowlist: testCase.entries,
			}, true)
			if err == nil || err.Error() != testCase.wantError {
				t.Fatalf("expected error %q, got allowlist=%#v err=%v", testCase.wantError, allowlist, err)
			}
		})
	}
}

func TestBuildCodexToolAllowlistNormalizesScopedAndAllowAllEntries(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name                   string
		entries                []string
		completionGuardEnabled bool
		wantAllowAll           bool
		wantToolNames          []string
	}{
		{
			name:                   "bare tool names",
			entries:                []string{"runTool", "getProjectState"},
			completionGuardEnabled: true,
			wantToolNames:          []string{"getProjectState", "report_completion_status", "runTool", "set_agentic_context"},
		},
		{
			name:                   "namespaced tool names",
			entries:                []string{"setta__getProjectState", "mcp__setta__runTool"},
			completionGuardEnabled: true,
			wantToolNames:          []string{"getProjectState", "report_completion_status", "runTool", "set_agentic_context"},
		},
		{
			name:                   "guard disabled omits completion report",
			entries:                []string{"setta__getProjectState", "mcp__setta__runTool"},
			completionGuardEnabled: false,
			wantToolNames:          []string{"getProjectState", "runTool", "set_agentic_context"},
		},
		{
			name:                   "server entry allows all",
			entries:                []string{"setta"},
			completionGuardEnabled: true,
			wantAllowAll:           true,
		},
		{
			name:                   "server entry overrides named tools",
			entries:                []string{"setta__runTool", "setta", "getProjectState"},
			completionGuardEnabled: true,
			wantAllowAll:           true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			allowlist, err := buildCodexToolAllowlist(&agentprofiles.Profile{
				ToolAllowlist: testCase.entries,
			}, testCase.completionGuardEnabled)
			if err != nil {
				t.Fatalf("build codex tool allowlist: %v", err)
			}
			if allowlist == nil {
				t.Fatal("expected non-nil allowlist")
			}
			if allowlist.allowAll != testCase.wantAllowAll {
				t.Fatalf("expected allowAll=%t, got %#v", testCase.wantAllowAll, allowlist)
			}
			if got := append([]string(nil), allowlist.toolNames...); !equalStringSlices(got, testCase.wantToolNames) {
				t.Fatalf("expected toolNames %#v, got %#v", testCase.wantToolNames, got)
			}
		})
	}
}

func TestCodexExecutorWritesEnabledToolsForUnsetProfileFromRegistry(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "complete")

	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "List your tools"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}

	runtimeConfig := readCodexRuntimeConfig(t, fixture.root, fixture.configID, result.ChatID)
	mcpServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	settaServer, ok := mapValue(mcpServers["setta"])
	if !ok {
		t.Fatalf("expected runtime setta server entry, got %#v", mcpServers["setta"])
	}
	if got := stringSliceValue(settaServer["enabled_tools"]); !equalStringSlices(got, fixture.settaToolNames) {
		t.Fatalf("expected runtime enabled_tools %#v for unset profile, got %#v", fixture.settaToolNames, settaServer["enabled_tools"])
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorWritesEnabledToolsForAllowAllProfileFromRegistry(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "complete")
	profileID := "profile-codex"
	if err := fixture.profiles.Write([]agentprofiles.Profile{{
		ID:            profileID,
		Name:          "Codex",
		ToolAllowlist: []string{"setta"},
	}}); err != nil {
		t.Fatalf("write codex profile: %v", err)
	}

	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "List your tools"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		AgentProfileID:  &profileID,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}

	runtimeConfig := readCodexRuntimeConfig(t, fixture.root, fixture.configID, result.ChatID)
	mcpServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	settaServer, ok := mapValue(mcpServers["setta"])
	if !ok {
		t.Fatalf("expected runtime setta server entry, got %#v", mcpServers["setta"])
	}
	if got := stringSliceValue(settaServer["enabled_tools"]); !equalStringSlices(got, fixture.settaToolNames) {
		t.Fatalf("expected runtime enabled_tools %#v for allow-all profile, got %#v", fixture.settaToolNames, settaServer["enabled_tools"])
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorPassesSessionScopedCODEXHOMEToProcessEnv(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "env_handoff")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Report your runtime home"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex env-handoff run: %v", err)
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
	expectedHome := filepath.Join(
		fixture.root,
		codexSettingsRootName,
		"codex",
		fixture.configID,
		"sessions",
		result.ChatID,
	)
	if got := extractMessageText(lastMessage); got != expectedHome {
		t.Fatalf("expected assistant to report CODEX_HOME %q, got %q", expectedHome, got)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestBuildCodexMCPHeadersIncludesSectionAndFrontendAffinity(t *testing.T) {
	t.Parallel()

	sectionID := "section-alpha"
	headers, err := (&CodexExecutor{}).buildCodexMCPHeaders(StartRequest{
		Run:             agentruns.Run{ID: "run-alpha"},
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       &sectionID,
		Inputs: map[string]any{
			"frontendAffinityToken": "frontend-alpha",
			"allowUnscoped":         true,
		},
	})
	if err != nil {
		t.Fatalf("build codex mcp headers: %v", err)
	}

	if got := headers[mcpx.AgenticContextProjectConfigIDHeader]; got != "project-alpha" {
		t.Fatalf("expected project-config header, got %#v", headers)
	}
	if got := headers[mcpx.AgenticContextChatIDHeader]; got != "chat-alpha" {
		t.Fatalf("expected chat header, got %#v", headers)
	}
	if got := headers[mcpx.AgenticContextRunIDHeader]; got != "run-alpha" {
		t.Fatalf("expected run header, got %#v", headers)
	}
	if got := headers[mcpx.AgenticContextSectionIDHeader]; got != "section-alpha" {
		t.Fatalf("expected section header, got %#v", headers)
	}
	if got := headers[mcpx.AgenticContextFrontendAffinityHeader]; got != "frontend-alpha" {
		t.Fatalf("expected frontend-affinity header, got %#v", headers)
	}
	if got := headers[mcpx.AgenticContextAllowUnscopedHeader]; got != "true" {
		t.Fatalf("expected allow-unscoped header, got %#v", headers)
	}
}

func TestApplyCodexRuntimeConfigPrependsSystemPromptAheadOfExistingDeveloperInstructions(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"developer_instructions": "Base developer instructions",
	}
	applyCodexRuntimeConfig(payload, externalagentconfigs.Config{}, "/tmp/workspace", map[string]any{
		"systemPrompt": "Runtime system prompt",
	}, nil, false, nil, nil)

	if got := stringValue(payload["developer_instructions"]); got != "Runtime system prompt\n\nBase developer instructions" {
		t.Fatalf("expected system prompt to prepend existing developer instructions, got %q", got)
	}
}

func TestCodexExecutorPrepareCodexHomePrefersExplicitBaseConfigPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configID := "external-config"
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	explicitConfig, err := toml.Marshal(map[string]any{
		"mcp_servers": map[string]any{
			"explicit": map[string]any{
				"url": "http://explicit.example/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode explicit codex config: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, explicitConfig, 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}

	canonicalConfigPath := filepath.Join(root, codexSettingsRootName, "codex", configID, codexConfigFileName)
	if err := os.MkdirAll(filepath.Dir(canonicalConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir canonical config dir: %v", err)
	}
	canonicalConfig, err := toml.Marshal(map[string]any{
		"mcp_servers": map[string]any{
			"canonical": map[string]any{
				"url": "http://canonical.example/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode canonical codex config: %v", err)
	}
	if err := os.WriteFile(canonicalConfigPath, canonicalConfig, 0o644); err != nil {
		t.Fatalf("write canonical codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               configID,
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(runtimeHome, codexConfigFileName))
	if err != nil {
		t.Fatalf("read runtime codex config: %v", err)
	}
	runtimeConfig := map[string]any{}
	if err := toml.Unmarshal(content, &runtimeConfig); err != nil {
		t.Fatalf("decode runtime codex config: %v", err)
	}
	mcpServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	if _, ok := mapValue(mcpServers["explicit"]); !ok {
		t.Fatalf("expected explicit-path mcp server to be preserved, got %#v", mcpServers)
	}
	if _, ok := mcpServers["canonical"]; ok {
		t.Fatalf("expected canonical home config to be ignored when explicit path is set, got %#v", mcpServers)
	}
}

func TestCodexExecutorPrepareCodexHomeCopiesAuthFileIntoSessionHome(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, []byte("model = \"gpt-5\"\n"), 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}
	authPayload := []byte("{\"access_token\":\"secret\"}\n")
	if err := os.WriteFile(filepath.Join(filepath.Dir(explicitConfigPath), "auth.json"), authPayload, 0o600); err != nil {
		t.Fatalf("write explicit codex auth file: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               "external-config",
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	runtimeAuthPayload, err := os.ReadFile(filepath.Join(runtimeHome, "auth.json"))
	if err != nil {
		t.Fatalf("read runtime auth.json: %v", err)
	}
	if string(runtimeAuthPayload) != string(authPayload) {
		t.Fatalf("expected copied auth payload %q, got %q", string(authPayload), string(runtimeAuthPayload))
	}
}

func TestCodexExecutorPrepareCodexHomeLeavesExplicitSourceConfigUnchanged(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	sourceConfig, err := toml.Marshal(map[string]any{
		"developer_instructions": "Base instructions",
		"mcp_servers": map[string]any{
			"explicit": map[string]any{
				"url": "http://explicit.example/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode explicit codex config: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, sourceConfig, 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               "external-config",
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{
		"systemPrompt": "Runtime prompt",
	}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	runtimeConfigPayload, err := os.ReadFile(filepath.Join(runtimeHome, codexConfigFileName))
	if err != nil {
		t.Fatalf("read runtime codex config: %v", err)
	}
	runtimeConfig := map[string]any{}
	if err := toml.Unmarshal(runtimeConfigPayload, &runtimeConfig); err != nil {
		t.Fatalf("decode runtime codex config: %v", err)
	}
	if got := stringValue(runtimeConfig["developer_instructions"]); got != "Runtime prompt\n\nBase instructions" {
		t.Fatalf("expected merged developer instructions, got %q", got)
	}
	runtimeMCPServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	if _, ok := mapValue(runtimeMCPServers["explicit"]); !ok {
		t.Fatalf("expected explicit mcp server in runtime config, got %#v", runtimeMCPServers)
	}

	sourceConfigAfter, err := os.ReadFile(explicitConfigPath)
	if err != nil {
		t.Fatalf("read explicit codex config after prepare: %v", err)
	}
	if string(sourceConfigAfter) != string(sourceConfig) {
		t.Fatalf("expected explicit source config to stay unchanged, got %q", string(sourceConfigAfter))
	}
}

func TestCodexExecutorPrepareCodexHomeLeavesCanonicalConfigBytesUnchanged(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configID := "external-config"
	canonicalConfigPath := filepath.Join(root, codexSettingsRootName, "codex", configID, codexConfigFileName)
	if err := os.MkdirAll(filepath.Dir(canonicalConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir canonical config dir: %v", err)
	}
	canonicalConfig, err := toml.Marshal(map[string]any{
		"developer_instructions": "Canonical instructions",
		"model":                  "gpt-5",
	})
	if err != nil {
		t.Fatalf("encode canonical codex config: %v", err)
	}
	if err := os.WriteFile(canonicalConfigPath, canonicalConfig, 0o644); err != nil {
		t.Fatalf("write canonical codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	_, err = executor.prepareCodexHome(externalagentconfigs.Config{
		ID:           configID,
		SettingsMode: externalagentconfigs.SettingsModeReadOnly,
	}, "chat-1", root, map[string]any{
		"systemPrompt": "Runtime prompt",
	}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	canonicalConfigAfter, err := os.ReadFile(canonicalConfigPath)
	if err != nil {
		t.Fatalf("read canonical codex config after prepare: %v", err)
	}
	if string(canonicalConfigAfter) != string(canonicalConfig) {
		t.Fatalf("expected canonical config bytes to stay unchanged, got %q", string(canonicalConfigAfter))
	}
}

func TestCodexExecutorPrepareCodexHomeDoesNotCreateMissingCanonicalConfigInManagedLocalNoEditMode(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configID := "external-config"
	canonicalConfigPath := filepath.Join(root, codexSettingsRootName, "codex", configID, codexConfigFileName)

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:                      configID,
		SettingsMode:            externalagentconfigs.SettingsModeManagedLocal,
		SettingsAllowSettaEdits: false,
	}, "chat-1", root, map[string]any{}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	if _, err := os.Stat(canonicalConfigPath); !os.IsNotExist(err) {
		t.Fatalf("expected canonical config to remain absent, stat err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(runtimeHome, codexConfigFileName)); err != nil {
		t.Fatalf("expected session-scoped runtime config to exist, stat err=%v", err)
	}
}

func TestCodexExecutorPrepareCodexHomeRejectsCamelCaseMCPServersRootKey(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, []byte("mcpServers = {}\n"), 0o644); err != nil {
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
		t.Fatal("expected camel-case mcpServers root to be rejected")
	}
	if !strings.Contains(err.Error(), "mcp_servers") || !strings.Contains(err.Error(), "mcpServers") {
		t.Fatalf("expected camel-case rejection error to mention mcp_servers and mcpServers, got %v", err)
	}
}
