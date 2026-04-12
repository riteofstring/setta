package externalagents

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	toml "github.com/pelletier/go-toml/v2"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
	"setta/internal/tools"
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
		PermissionMode:  ChatPermissionModeMinimal,
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
	if len(state.Messages) != 1 {
		t.Fatalf("expected one assistant message, got %#v", state.Messages)
	}
	content, ok := state.Messages[0]["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected reasoning plus text content, got %#v", state.Messages[0])
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
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start rich codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	rawSnapshot, ok := persisted.Outputs[externalMCPStatusSnapshotKey].([]any)
	if !ok || len(rawSnapshot) != 1 {
		t.Fatalf("expected one persisted external MCP status, got %#v", persisted.Outputs)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	assistantFound := false
	toolResultFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		if role == "assistant" {
			if rawToolCalls, ok := message["tool_calls"].([]any); ok && len(rawToolCalls) > 0 && extractMessageText(message) == "Created the top-level section." {
				content, _ := message["content"].([]any)
				if len(content) > 0 {
					first, _ := content[0].(map[string]any)
					if stringValue(first["type"]) == "thinking" {
						assistantFound = true
					}
				}
			}
		}
		if role == "tool" && stringValue(message["tool_call_id"]) == "call-create" {
			toolResultFound = true
		}
	}
	if !assistantFound {
		t.Fatalf("expected persisted assistant message with tool call and reasoning, got %#v", messages)
	}
	if !toolResultFound {
		t.Fatalf("expected persisted tool result message, got %#v", messages)
	}
	toolResultEventFound := false
	for _, event := range persisted.Events {
		if event.Type == "tool_result" && stringValue(event.Payload["toolCallId"]) == "call-create" {
			toolResultEventFound = true
			break
		}
	}
	if !toolResultEventFound {
		t.Fatalf("expected persisted tool_result event, got %#v", persisted.Events)
	}

	statuses, err := fixture.runtime.ExternalRuntimeStatuses(stringPtr(result.ChatID), stringPtr(fixture.engineID))
	if err != nil {
		t.Fatalf("read external runtime statuses: %v", err)
	}
	if len(statuses) != 1 || statuses[0].ServerID != "setta" || statuses[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("unexpected external runtime statuses %#v", statuses)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
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
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start raw codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 5 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}

	assistantFound := false
	commandResultFound := false
	fileResultFound := false
	mcpResultFound := false
	genericResultFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		switch role {
		case "assistant":
			if extractMessageText(message) != "Raw tools finished." {
				continue
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
			assistantFound = true
		case "tool":
			switch stringValue(message["tool_call_id"]) {
			case "cmd-raw-1":
				resultPayload, _ := mapValue(message["result"])
				if stringValue(resultPayload["aggregated_output"]) != "command output\n" {
					t.Fatalf("expected buffered command output, got %#v", message)
				}
				commandResultFound = true
			case "file-raw-1":
				resultPayload, _ := mapValue(message["result"])
				if stringValue(resultPayload["diff"]) != "--- a/file.txt\n+++ b/file.txt\n" {
					t.Fatalf("expected buffered file diff, got %#v", message)
				}
				fileResultFound = true
			case "mcp-raw-1":
				if stringValue(message["tool_name"]) != "mcp__setta__echo" {
					t.Fatalf("expected normalized MCP tool name, got %#v", message)
				}
				mcpResultFound = true
			case "web-raw-1":
				if stringValue(message["tool_name"]) != "webSearch" {
					t.Fatalf("expected generic tool result, got %#v", message)
				}
				genericResultFound = true
			}
		}
	}
	if !assistantFound {
		t.Fatalf("expected assistant message with raw tool calls, got %#v", messages)
	}
	if !commandResultFound || !fileResultFound || !mcpResultFound || !genericResultFound {
		t.Fatalf("expected all raw tool result messages, got %#v", messages)
	}

	toolResultEventIDs := map[string]bool{}
	for _, event := range persisted.Events {
		if event.Type != "tool_result" {
			continue
		}
		toolResultEventIDs[stringValue(event.Payload["toolCallId"])] = true
	}
	for _, expectedID := range []string{"cmd-raw-1", "file-raw-1", "mcp-raw-1", "web-raw-1"} {
		if !toolResultEventIDs[expectedID] {
			t.Fatalf("expected raw tool_result event for %s, got %#v", expectedID, persisted.Events)
		}
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
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

	if len(state.Messages) != 1 {
		t.Fatalf("expected one merged assistant message, got %#v", state.Messages)
	}
	message := state.Messages[0]
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

type codexExecutorFixture struct {
	root           string
	configID       string
	send           *SendService
	runtime        *Runtime
	runs           *agentruns.RunStore
	profiles       *agentprofiles.Store
	engineID       string
	settaToolNames []string
}

func newCodexExecutorFixture(t *testing.T, scenario string) codexExecutorFixture {
	t.Helper()
	return newCodexExecutorFixtureWithOptions(t, scenario, codexExecutorFixtureOptions{})
}

type codexExecutorFixtureOptions struct {
	toolDispatchTimeout  time.Duration
	toolResultTimeout    time.Duration
	watchdogPollInterval time.Duration
}

func newCodexExecutorFixtureWithOptions(t *testing.T, scenario string, options codexExecutorFixtureOptions) codexExecutorFixture {
	t.Helper()

	root := t.TempDir()
	commandPath := writeCodexFixtureCommand(t, scenario)

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
	if err := configs.Write([]externalagentconfigs.Config{
		{
			ID:                 configID,
			Name:               "Codex fixture",
			ToolType:           externalagentconfigs.ToolTypeCodex,
			RunMode:            externalagentconfigs.RunModeAppServer,
			CommandPath:        &commandPath,
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		},
	}); err != nil {
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

	now := time.Date(2026, 3, 9, 10, 0, 0, 0, time.UTC)
	runtime, err := NewRuntime(RuntimeOptions{
		Runs: runs,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	settaToolRegistry := newCodexTestToolRegistry(
		t,
		"create_top_level_section",
		"getProjectState",
		"set_agentic_context",
	)
	codexExecutor, err := NewCodexExecutor(CodexExecutorOptions{
		Runs:               runs,
		Runtime:            runtime,
		WorkspaceRoot:      root,
		SettaFilesRoot:     root,
		SettaToolRegistry:  settaToolRegistry,
		CurrentSession:     &auth.CurrentSession{Metadata: auth.SessionMetadata{ID: "session-1"}, Secret: []byte("fixture-secret")},
		AuthCookieBaseName: auth.DefaultAuthCookieName,
		ProcessEnv:         llmconfig.CurrentProcessEnv(),
		TimeNow: func() time.Time {
			return now
		},
		ToolDispatchTimeout:  options.toolDispatchTimeout,
		ToolResultTimeout:    options.toolResultTimeout,
		WatchdogPollInterval: options.watchdogPollInterval,
	})
	if err != nil {
		t.Fatalf("new codex executor: %v", err)
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
				Name:      "Codex fixture",
				ToolType:  externalagentconfigs.ToolTypeCodex,
				RunMode:   externalagentconfigs.RunModeAppServer,
				Supported: true,
				Available: true,
				Issues:    []string{},
			},
		},
		Executor: NewMultiExecutor(MultiExecutorOptions{
			Codex: codexExecutor,
		}),
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new send service: %v", err)
	}

	return codexExecutorFixture{
		root:     root,
		configID: configID,
		send:     send,
		runtime:  runtime,
		runs:     runs,
		profiles: profiles,
		engineID: engineID,
		settaToolNames: []string{
			"create_top_level_section",
			"getProjectState",
			"set_agentic_context",
		},
	}
}

func newCodexTestToolRegistry(t *testing.T, names ...string) *tools.Registry {
	t.Helper()

	registry := tools.NewRegistry()
	for _, name := range names {
		if _, err := registry.Register(tools.Spec{
			Name: name,
			Metadata: tools.Metadata{
				Kind: tools.KindDiscoverable,
			},
			Handler: func(context.Context, map[string]any) (any, error) {
				return nil, nil
			},
		}); err != nil {
			t.Fatalf("register codex test tool %q: %v", name, err)
		}
	}
	return registry
}

func readCodexRuntimeConfig(t *testing.T, root string, configID string, chatID string) map[string]any {
	t.Helper()

	configPath := filepath.Join(
		root,
		codexSettingsRootName,
		"codex",
		configID,
		"sessions",
		chatID,
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
	return runtimeConfig
}

func (f codexExecutorFixture) waitForTerminalRun(t *testing.T, runID string) agentruns.Run {
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

func (f codexExecutorFixture) waitForRunUsage(t *testing.T, runID string) map[string]any {
	t.Helper()

	deadline := time.Now().Add(executorFixtureEventTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run %s while waiting for usage: %v", runID, err)
		}
		if usage, ok := run.Outputs["usage"].(map[string]any); ok && usage != nil {
			return usage
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for run %s usage payload", runID)
	return nil
}

func (f codexExecutorFixture) waitForPendingToolCall(t *testing.T, runID string, toolCallID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureEventTimeout)
	for time.Now().Before(deadline) {
		liveState, err := f.runtime.GetLiveChatState(runID)
		if err != nil {
			t.Fatalf("get live state while waiting for pending tool call: %v", err)
		}
		if liveState != nil {
			if rawArguments := strings.TrimSpace(liveState.ToolCallArguments[toolCallID]); rawArguments != "" {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for pending tool call %s on run %s", toolCallID, runID)
}

func writeCodexCompletionGuardSetting(t *testing.T, root string, enabled bool) {
	t.Helper()

	settingsStore, err := settingsstate.NewStore(filepath.Join(root, settingsstate.DefaultFileName), settingsstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open settings store: %v", err)
	}
	document, err := settingsstate.NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	document["backend"].(map[string]any)["completionGuardEnabled"] = enabled
	if err := settingsStore.Save(context.Background(), document); err != nil {
		t.Fatalf("save settings document: %v", err)
	}
}

func stringSliceValue(raw any) []string {
	switch typed := raw.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		values := make([]string, 0, len(typed))
		for _, entry := range typed {
			text, ok := entry.(string)
			if !ok {
				return nil
			}
			values = append(values, text)
		}
		return values
	default:
		return nil
	}
}

func equalStringSlices(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func (f codexExecutorFixture) waitForLiveStateCleanup(t *testing.T, runID string) {
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

func (f codexExecutorFixture) waitForPersistedExternalMCPStatusState(t *testing.T, runID string, expectedState mcpx.RuntimeState) mcpx.ServerRuntimeStatus {
	t.Helper()

	deadline := time.Now().Add(executorFixtureCleanupTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run while waiting for MCP status snapshot: %v", err)
		}
		statuses := loadExternalMCPStatusSnapshot(run.Outputs)
		if len(statuses) == 1 && statuses[0].State == expectedState {
			return statuses[0]
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for run %s MCP snapshot state %q", runID, expectedState)
	return mcpx.ServerRuntimeStatus{}
}

func (f codexExecutorFixture) waitForApproval(t *testing.T, runID string, approvalID string) {
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

func writeCodexFixtureCommand(t *testing.T, scenario string) string {
	t.Helper()

	commandPath := filepath.Join(t.TempDir(), "codex-fixture.sh")
	content := fmt.Sprintf("#!/bin/sh\nSETTA_CODEX_FIXTURE=1 SETTA_CODEX_FIXTURE_SCENARIO=%s exec %q -test.run '^TestCodexFixtureProcess$' -- \"$@\"\n", scenario, os.Args[0])
	if err := os.WriteFile(commandPath, []byte(content), 0o755); err != nil {
		t.Fatalf("write codex fixture command: %v", err)
	}
	return commandPath
}

func TestCodexFixtureProcess(t *testing.T) {
	if os.Getenv("SETTA_CODEX_FIXTURE") != "1" {
		return
	}
	if err := runCodexFixtureProcess(os.Getenv("SETTA_CODEX_FIXTURE_SCENARIO")); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	os.Exit(0)
}

func runCodexFixtureProcess(scenario string) error {
	reader := bufio.NewScanner(os.Stdin)
	reader.Buffer(make([]byte, 0, 16*1024), codexStdoutBufferSize)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()
	mcpStatusListCount := 0

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

	for reader.Scan() {
		line := strings.TrimSpace(reader.Text())
		if line == "" {
			continue
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			return fmt.Errorf("decode fixture request: %w", err)
		}
		method := stringValue(payload["method"])
		switch method {
		case "initialize":
			params, _ := mapValue(payload["params"])
			clientInfo, _ := mapValue(params["clientInfo"])
			if stringValue(clientInfo["name"]) != "setta" {
				return fmt.Errorf("expected initialize clientInfo.name setta, got %#v", clientInfo["name"])
			}
			version := stringValue(clientInfo["version"])
			if version == "" || strings.Contains(strings.ToLower(version), "rewrite") {
				return fmt.Errorf("expected initialize clientInfo.version to use the app version, got %#v", clientInfo["version"])
			}
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{}}); err != nil {
				return err
			}
		case "initialized":
		case "config/mcpServer/reload":
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{}}); err != nil {
				return err
			}
		case "thread/start":
			threadID := "thread-" + scenario
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{"threadId": threadID}}); err != nil {
				return err
			}
		case "thread/resume":
			params, _ := mapValue(payload["params"])
			threadID := stringValue(params["threadId"])
			if threadID == "" {
				threadID = "thread-" + scenario
			}
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{"threadId": threadID}}); err != nil {
				return err
			}
		case "turn/start":
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{}}); err != nil {
				return err
			}
			switch scenario {
			case "approval":
				if err := emit(map[string]any{
					"id":     42,
					"method": "item/commandExecution/requestApproval",
					"params": map[string]any{
						"item": map[string]any{
							"type":    "commandExecution",
							"command": "echo approval",
						},
					},
				}); err != nil {
					return err
				}
			case "rich":
			case "raw":
				if err := emitCodexRawTurn(writer); err != nil {
					return err
				}
				return nil
			case "env_handoff":
				codexHome := strings.TrimSpace(os.Getenv("CODEX_HOME"))
				if codexHome == "" {
					return fmt.Errorf("missing CODEX_HOME")
				}
				if _, err := os.Stat(filepath.Join(codexHome, codexConfigFileName)); err != nil {
					return fmt.Errorf("stat CODEX_HOME config: %w", err)
				}
				if err := emitAssistantTurn(writer, "assistant-env", codexHome); err != nil {
					return err
				}
				return nil
			case "usage_stream":
				if err := emitCodexThreadTokenUsageUpdated(writer, map[string]any{
					"total": map[string]any{
						"inputTokens":  11,
						"outputTokens": 2,
						"totalTokens":  13,
					},
					"last": map[string]any{
						"contextUsedTokens": 11,
					},
					"modelContextWindow": 272000,
				}); err != nil {
					return err
				}
				if err := emitAssistantTurn(writer, "assistant-usage", "HELLO"); err != nil {
					return err
				}
				return nil
			case "usage_live":
				if err := emitCodexThreadTokenUsageUpdated(writer, map[string]any{
					"total": map[string]any{
						"inputTokens":  23,
						"outputTokens": 5,
						"totalTokens":  28,
					},
					"last": map[string]any{
						"contextUsedTokens": 23,
					},
					"modelContextWindow": 400000,
				}); err != nil {
					return err
				}
				time.Sleep(200 * time.Millisecond)
				if err := emitAssistantTurn(writer, "assistant-usage-live", "HELLO"); err != nil {
					return err
				}
				return nil
			case "usage_missing":
				if err := emitAssistantTurn(writer, "assistant-usage", "HELLO"); err != nil {
					return err
				}
				return nil
			case "stalled_tool_call":
				if err := emitCodexStalledToolCall(writer); err != nil {
					return err
				}
				continue
			case "stalled_raw_tool_call":
				if err := emitCodexStalledRawToolCall(writer); err != nil {
					return err
				}
				continue
			case "slow_status":
				if err := emitAssistantTurn(writer, "assistant-slow-status", "Hello from Codex"); err != nil {
					return err
				}
			case "delayed_status":
				if err := emitAssistantTurn(writer, "assistant-delayed-status", "Hello from Codex"); err != nil {
					return err
				}
			case "late_status":
				if err := emitAssistantTurn(writer, "assistant-late-status", "Hello from Codex"); err != nil {
					return err
				}
			default:
				if err := emitAssistantTurn(writer, "assistant-1", "Hello from Codex"); err != nil {
					return err
				}
				return nil
			}
		case "mcpServerStatus/list":
			mcpStatusListCount++
			if scenario == "rich" {
				if err := emit(map[string]any{
					"id": payload["id"],
					"result": map[string]any{
						"servers": []any{
							map[string]any{
								"id":        "setta",
								"connected": true,
								"transport": "streamable_http",
								"endpoint":  "http://127.0.0.1:8000/mcp",
								"toolCount": 4,
							},
						},
					},
				}); err != nil {
					return err
				}
				if err := emitCodexRichTurn(writer); err != nil {
					return err
				}
				return nil
			}
			if scenario == "late_status" && mcpStatusListCount > 1 {
				if err := emit(map[string]any{
					"id": payload["id"],
					"result": map[string]any{
						"servers": []any{
							map[string]any{
								"id":        "setta",
								"connected": true,
								"transport": "streamable_http",
								"endpoint":  "http://127.0.0.1:8000/mcp",
								"toolCount": 4,
							},
						},
					},
				}); err != nil {
					return err
				}
				continue
			}
			if scenario == "delayed_status" {
				time.Sleep(2 * time.Second)
				if err := emit(map[string]any{
					"id": payload["id"],
					"result": map[string]any{
						"servers": []any{
							map[string]any{
								"id":        "setta",
								"connected": true,
								"transport": "streamable_http",
								"endpoint":  "http://127.0.0.1:8000/mcp",
								"toolCount": 4,
							},
						},
					},
				}); err != nil {
					return err
				}
				continue
			}
			if scenario == "slow_status" {
				time.Sleep(4 * time.Second)
			}
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{"servers": []any{}}}); err != nil {
				return err
			}
		case "thread/tokenUsage/read", "thread/read":
			return fmt.Errorf("unexpected undocumented codex usage read request: %#v", payload)
		default:
			if scenario == "approval" && payload["id"] == float64(42) {
				result, _ := mapValue(payload["result"])
				if stringValue(result["decision"]) != "accept" {
					return fmt.Errorf("unexpected approval decision: %#v", payload)
				}
				if err := emitAssistantTurn(writer, "assistant-approval", "Approval granted"); err != nil {
					return err
				}
				return nil
			}
		}
	}
	return reader.Err()
}

func emitAssistantTurn(writer *bufio.Writer, messageID string, text string) error {
	payloads := []map[string]any{
		{
			"method": "item/assistantMessage/delta",
			"params": map[string]any{
				"itemId": messageID,
				"delta":  map[string]any{"text": text},
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":      messageID,
					"type":    "assistantMessage",
					"role":    "assistant",
					"content": []any{map[string]any{"text": text}},
				},
			},
		},
		{
			"method": "turn/completed",
			"params": map[string]any{
				"status": "completed",
				"turn":   map[string]any{"status": "completed"},
			},
		},
	}
	for _, payload := range payloads {
		content, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := writer.Write(append(content, '\n')); err != nil {
			return err
		}
		if err := writer.Flush(); err != nil {
			return err
		}
	}
	return nil
}

func emitCodexThreadTokenUsageUpdated(writer *bufio.Writer, tokenUsage map[string]any) error {
	payload := map[string]any{
		"method": "thread/tokenUsage/updated",
		"params": map[string]any{
			"threadId":   "thread-usage",
			"tokenUsage": tokenUsage,
		},
	}
	content, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := writer.Write(append(content, '\n')); err != nil {
		return err
	}
	return writer.Flush()
}

func emitCodexRichTurn(writer *bufio.Writer) error {
	payloads := []map[string]any{
		{
			"type": "response_item",
			"payload": map[string]any{
				"type":      "function_call",
				"name":      "mcp__setta__create_top_level_section",
				"arguments": "{\"projectConfigId\":\"project-alpha\",\"implType\":\"Code\"}",
				"call_id":   "call-create",
			},
		},
		{
			"type": "response_item",
			"payload": map[string]any{
				"type":    "function_call_output",
				"call_id": "call-create",
				"output":  "{\"sectionId\":\"section-6\"}",
			},
		},
		{
			"type": "response_item",
			"payload": map[string]any{
				"type": "message",
				"role": "assistant",
				"content": []any{
					map[string]any{
						"type":    "reasoning",
						"summary": []any{map[string]any{"text": "Plan"}},
						"content": []any{map[string]any{"text": "Evaluate the project structure first."}},
					},
					map[string]any{
						"type": "output_text",
						"text": "Created the top-level section.",
					},
				},
			},
		},
		{
			"method": "turn/completed",
			"params": map[string]any{
				"status": "completed",
				"turn":   map[string]any{"status": "completed"},
			},
		},
	}
	for _, payload := range payloads {
		content, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := writer.Write(append(content, '\n')); err != nil {
			return err
		}
		if err := writer.Flush(); err != nil {
			return err
		}
	}
	return nil
}

func emitCodexStalledToolCall(writer *bufio.Writer) error {
	payload := map[string]any{
		"type": "response_item",
		"payload": map[string]any{
			"type":      "function_call",
			"name":      "mcp__setta__create_top_level_section",
			"arguments": "{\"projectConfigId\":\"project-alpha\",\"implType\":\"Callable\"}",
			"call_id":   "call-stalled",
		},
	}
	content, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := writer.Write(append(content, '\n')); err != nil {
		return err
	}
	return writer.Flush()
}

func emitCodexStalledRawToolCall(writer *bufio.Writer) error {
	payload := map[string]any{
		"method": "item/started",
		"params": map[string]any{
			"item": map[string]any{
				"id":        "call-stalled-raw",
				"type":      "mcpToolCall",
				"server":    "setta",
				"tool":      "create_top_level_section",
				"arguments": map[string]any{"projectConfigId": "project-alpha", "implType": "Callable"},
			},
		},
	}
	content, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := writer.Write(append(content, '\n')); err != nil {
		return err
	}
	return writer.Flush()
}

func emitCodexRawTurn(writer *bufio.Writer) error {
	payloads := []map[string]any{
		{
			"method": "turn/started",
			"params": map[string]any{},
		},
		{
			"method": "item/started",
			"params": map[string]any{
				"item": map[string]any{
					"id":   "assistant-raw-1",
					"type": "assistantMessage",
					"role": "assistant",
				},
			},
		},
		{
			"method": "item/started",
			"params": map[string]any{
				"item": map[string]any{
					"id":      "cmd-raw-1",
					"type":    "commandExecution",
					"command": "ls",
				},
			},
		},
		{
			"method": "item.commandExecution.outputDelta",
			"params": map[string]any{
				"itemId": "cmd-raw-1",
				"delta":  "command output\n",
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":       "cmd-raw-1",
					"type":     "commandExecution",
					"command":  "ls",
					"status":   "completed",
					"exitCode": 0,
				},
			},
		},
		{
			"method": "item/started",
			"params": map[string]any{
				"item": map[string]any{
					"id":   "file-raw-1",
					"type": "fileChange",
					"path": "/tmp/file.txt",
				},
			},
		},
		{
			"method": "item.fileChange.outputDelta",
			"params": map[string]any{
				"itemId": "file-raw-1",
				"delta":  "--- a/file.txt\n+++ b/file.txt\n",
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":     "file-raw-1",
					"type":   "fileChange",
					"path":   "/tmp/file.txt",
					"status": "completed",
				},
			},
		},
		{
			"method": "item/started",
			"params": map[string]any{
				"item": map[string]any{
					"id":        "mcp-raw-1",
					"type":      "mcpToolCall",
					"server":    "setta",
					"tool":      "echo",
					"arguments": map[string]any{"text": "ping"},
				},
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":        "mcp-raw-1",
					"type":      "mcpToolCall",
					"server":    "setta",
					"tool":      "echo",
					"arguments": map[string]any{"text": "ping"},
					"result":    map[string]any{"text": "pong"},
					"status":    "completed",
				},
			},
		},
		{
			"method": "item/started",
			"params": map[string]any{
				"item": map[string]any{
					"id":    "web-raw-1",
					"type":  "webSearch",
					"input": map[string]any{"query": "site:setta"},
				},
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":     "web-raw-1",
					"type":   "webSearch",
					"input":  map[string]any{"query": "site:setta"},
					"output": map[string]any{"status": "ok"},
					"status": "completed",
				},
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":      "assistant-raw-1",
					"type":    "assistantMessage",
					"role":    "assistant",
					"content": []any{map[string]any{"text": "Raw tools finished."}},
				},
			},
		},
		{
			"method": "turn/completed",
			"params": map[string]any{
				"status": "completed",
				"turn":   map[string]any{"status": "completed"},
			},
		},
	}
	for _, payload := range payloads {
		content, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := writer.Write(append(content, '\n')); err != nil {
			return err
		}
		if err := writer.Flush(); err != nil {
			return err
		}
	}
	return nil
}

func approvalMessagePresent(run agentruns.Run, approvalID string) bool {
	rawMessages, ok := run.Outputs["messages"].([]any)
	if !ok {
		return false
	}
	for _, rawMessage := range rawMessages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(message["id"])) != approvalID {
			continue
		}
		rawToolCalls, ok := message["tool_calls"].([]any)
		if !ok || len(rawToolCalls) == 0 {
			continue
		}
		return true
	}
	return false
}
