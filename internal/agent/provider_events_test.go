package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestProviderErrorNotificationUsesTypedRetryLifecycleWithoutRawMessage(t *testing.T) {
	base := providerNotificationTestBase()
	const providerDiagnostic = "DO_NOT_PERSIST_PROVIDER_DIAGNOSTIC"
	for _, testCase := range []struct {
		name      string
		willRetry bool
		state     LifecycleState
		reason    LifecycleReason
	}{
		{
			name:      "provider will retry",
			willRetry: true,
			state:     LifecycleStateRestarting,
			reason:    LifecycleReasonTurnRetrying,
		},
		{
			name:      "provider will not retry",
			willRetry: false,
			state:     LifecycleStateUnavailable,
			reason:    LifecycleReasonTurnFailed,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			events, terminal, err := normalizedProviderNotification(
				newTestRuntime(),
				providerNotificationMessage(t, codexapp.CodexNotificationError, map[string]any{
					"error":     map[string]any{"message": providerDiagnostic},
					"threadId":  base.ProviderThreadID,
					"turnId":    base.ProviderTurnID,
					"willRetry": testCase.willRetry,
				}),
				base,
			)
			if err != nil || terminal != nil || len(events) != 1 {
				t.Fatalf("normalize provider error: events=%d terminal=%v err=%v", len(events), terminal, err)
			}
			lifecycle := events[0].Lifecycle
			if lifecycle == nil || lifecycle.State != testCase.state || lifecycle.Reason != testCase.reason {
				t.Fatalf("lifecycle = %+v, want %s/%s", lifecycle, testCase.state, testCase.reason)
			}
			encoded, err := json.Marshal(events[0])
			if err != nil {
				t.Fatalf("encode lifecycle event: %v", err)
			}
			if strings.Contains(string(encoded), providerDiagnostic) {
				t.Fatal("raw provider error entered the typed lifecycle event")
			}
		})
	}
}

func TestBestEffortProviderLagDoesNotCreateLifecycleTruth(t *testing.T) {
	sink := &recordingEventSink{}
	_, terminal, err := newTestRuntime().handleProviderEvent(
		context.Background(),
		codexapp.Event{Kind: codexapp.EventLag, Lag: &codexapp.LagEvent{SkippedCount: 3}},
		providerNotificationTestBase(),
		sink,
	)
	if err != nil || terminal || len(sink.snapshot()) != 0 {
		t.Fatalf("best-effort lag produced terminal=%t events=%d err=%v", terminal, len(sink.snapshot()), err)
	}
}

func TestProviderLifecycleFailureKeepsDiagnosticsInternal(t *testing.T) {
	const providerDiagnostic = "DO_NOT_SURFACE_SESSION_DIAGNOSTIC"
	sink := &recordingEventSink{}
	_, terminal, err := newTestRuntime().handleProviderEvent(
		context.Background(),
		codexapp.Event{Kind: codexapp.EventLifecycle, Err: errors.New(providerDiagnostic)},
		providerNotificationTestBase(),
		sink,
	)
	if terminal {
		t.Fatal("provider lifecycle failure claimed a provider terminal event")
	}
	if !IsProviderLifecycleError(err) ||
		err.Error() != "Provider is temporarily unavailable. Try again." ||
		strings.Contains(err.Error(), providerDiagnostic) {
		t.Fatalf("provider lifecycle error = %v", err)
	}
	events := sink.snapshot()
	if len(events) != 1 || events[0].Lifecycle == nil ||
		events[0].Lifecycle.Reason != LifecycleReasonSessionFailed {
		t.Fatalf("provider lifecycle event = %+v", events)
	}
}

func TestNormalizedProviderNotificationsCarryTypedActivityFacts(t *testing.T) {
	base := providerNotificationTestBase()
	for _, testCase := range []struct {
		name     string
		method   string
		params   any
		kind     EventKind
		activity ActivityEvent
	}{
		{
			name:   "command output progress",
			method: codexapp.CodexNotificationItemCommandExecutionOutputDelta,
			params: map[string]any{
				"delta": "listing files", "itemId": "item-command",
				"threadId": base.ProviderThreadID, "turnId": base.ProviderTurnID,
			},
			kind: EventKindActivityUpdated,
			activity: ActivityEvent{
				ProviderItemID: "item-command", Kind: ActivityKindCommand,
				Status: "in_progress", Title: "Command output updated",
			},
		},
		{
			name:   "terminal interaction",
			method: codexapp.CodexNotificationItemCommandExecutionTerminalInteraction,
			params: map[string]any{
				"itemId": "item-command", "processId": "process-7", "stdin": "hunter2\n",
				"threadId": base.ProviderThreadID, "turnId": base.ProviderTurnID,
			},
			kind: EventKindActivityUpdated,
			activity: ActivityEvent{
				ProviderItemID: "item-command", Kind: ActivityKindCommand,
				Status: "in_progress", Title: "Terminal input sent",
			},
		},
		{
			name:   "mcp tool progress",
			method: codexapp.CodexNotificationItemMcpToolCallProgress,
			params: map[string]any{
				"itemId": "item-mcp", "message": "Indexed 12 of 40 documents",
				"threadId": base.ProviderThreadID, "turnId": base.ProviderTurnID,
			},
			kind: EventKindActivityUpdated,
			activity: ActivityEvent{
				ProviderItemID: "item-mcp", Kind: ActivityKindMCPTool,
				Status: "in_progress", Title: "MCP tool progress",
				Summary: "Indexed 12 of 40 documents",
			},
		},
		{
			name:   "hook started",
			method: codexapp.CodexNotificationHookStarted,
			params: map[string]any{
				"run":      hookRunParams("running", nil),
				"threadId": base.ProviderThreadID, "turnId": base.ProviderTurnID,
			},
			kind: EventKindActivityStarted,
			activity: ActivityEvent{
				ProviderItemID: "hook-run-1", Kind: ActivityKindHook,
				Status: "running", Title: "preToolUse hook",
				Summary: "plugin · /hooks/guard.sh",
			},
		},
		{
			name:   "hook blocked",
			method: codexapp.CodexNotificationHookCompleted,
			params: map[string]any{
				"run":      hookRunParams("blocked", stringPointer("Blocked a write outside the workspace")),
				"threadId": base.ProviderThreadID, "turnId": base.ProviderTurnID,
			},
			kind: EventKindActivityCompleted,
			activity: ActivityEvent{
				ProviderItemID: "hook-run-1", Kind: ActivityKindHook,
				Status: "blocked", Title: "preToolUse hook",
				Summary: "plugin · /hooks/guard.sh · Blocked a write outside the workspace",
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			events, terminal, err := normalizedProviderNotification(
				newTestRuntime(),
				providerNotificationMessage(t, testCase.method, testCase.params),
				base,
			)
			if err != nil {
				t.Fatalf("normalize %s: %v", testCase.method, err)
			}
			if terminal != nil {
				t.Fatalf("%s produced a terminal turn result", testCase.method)
			}
			if len(events) != 1 {
				t.Fatalf("%s produced %d events, want 1", testCase.method, len(events))
			}
			event := events[0]
			if err := event.Validate(); err != nil {
				t.Fatalf("%s event is invalid: %v", testCase.method, err)
			}
			if event.Kind != testCase.kind {
				t.Fatalf("%s event kind = %q, want %q", testCase.method, event.Kind, testCase.kind)
			}
			if event.Activity == nil || !equalActivityEvents(*event.Activity, testCase.activity) {
				t.Fatalf("%s activity = %+v, want %+v", testCase.method, event.Activity, testCase.activity)
			}
			if event.ProviderEventID == nil || *event.ProviderEventID != testCase.activity.ProviderItemID {
				t.Fatalf("%s provider event id = %v, want %q", testCase.method, event.ProviderEventID, testCase.activity.ProviderItemID)
			}
		})
	}
}

func TestNormalizedHookRunOutsideATurnIsNotRunActivity(t *testing.T) {
	base := providerNotificationTestBase()
	message := providerNotificationMessage(t, codexapp.CodexNotificationHookStarted, map[string]any{
		"run":      hookRunParams("running", nil),
		"threadId": base.ProviderThreadID,
	})

	events, terminal, err := normalizedProviderNotification(newTestRuntime(), message, base)
	if err != nil {
		t.Fatalf("normalize thread-scoped hook: %v", err)
	}
	if len(events) != 0 || terminal != nil {
		t.Fatalf("thread-scoped hook produced %d events and terminal %v, want none", len(events), terminal)
	}
}

func TestNormalizedProviderNotificationsRejectAnotherTurnsScope(t *testing.T) {
	base := providerNotificationTestBase()
	for _, method := range []string{
		codexapp.CodexNotificationItemCommandExecutionTerminalInteraction,
		codexapp.CodexNotificationItemMcpToolCallProgress,
		codexapp.CodexNotificationHookStarted,
		codexapp.CodexNotificationHookCompleted,
	} {
		params := map[string]any{
			"itemId": "item-other", "message": "progress", "processId": "process-7", "stdin": "x",
			"run":      hookRunParams("running", nil),
			"threadId": base.ProviderThreadID, "turnId": "provider-turn-other",
		}
		events, _, err := normalizedProviderNotification(newTestRuntime(), providerNotificationMessage(t, method, params), base)
		if err == nil {
			t.Fatalf("%s accepted another turn's scope and produced %d events", method, len(events))
		}
	}
}

func TestNormalizedThreadItemsKeepProviderActivityIdentity(t *testing.T) {
	base := providerNotificationTestBase()
	for _, testCase := range []struct {
		name     string
		item     map[string]any
		activity ActivityEvent
	}{
		{
			name: "command execution",
			item: map[string]any{
				"id": "item-command", "type": "commandExecution", "command": "rg director",
				"commandActions": []any{}, "cwd": "/workspace/setta", "processId": "process-7",
				"status": "completed", "exitCode": 0,
			},
			activity: ActivityEvent{
				ProviderItemID: "item-command", Kind: ActivityKindCommand,
				Status: "completed", Title: "rg director",
				Command: stringPointer("rg director"), CWD: stringPointer("/workspace/setta"),
				ProcessID: stringPointer("process-7"), ExitCode: intPointer(0),
			},
		},
		{
			name: "mcp tool call",
			item: map[string]any{
				"id": "item-mcp", "type": "mcpToolCall", "server": "docs", "arguments": map[string]any{},
				"tool": "search", "status": "completed",
			},
			activity: ActivityEvent{
				ProviderItemID: "item-mcp", Kind: ActivityKindMCPTool,
				Status: "completed", Title: "docs/search",
				Server: stringPointer("docs"), Tool: stringPointer("search"),
			},
		},
		{
			name: "dynamic tool call",
			item: map[string]any{
				"id": "item-dynamic", "type": "dynamicToolCall", "tool": "emit_artifact", "arguments": map[string]any{},
				"namespace": "setta", "status": "completed",
			},
			activity: ActivityEvent{
				ProviderItemID: "item-dynamic", Kind: ActivityKindDynamicTool,
				Status: "completed", Title: "setta/emit_artifact",
				Tool: stringPointer("emit_artifact"), Namespace: stringPointer("setta"),
			},
		},
		{
			name: "web search",
			item: map[string]any{"id": "item-search", "type": "webSearch", "query": "setta director"},
			activity: ActivityEvent{
				ProviderItemID: "item-search", Kind: ActivityKindWebSearch,
				Status: "completed", Title: "Web search", Summary: "setta director",
			},
		},
		{
			name: "image view",
			item: map[string]any{"id": "item-image", "type": "imageView", "path": "/tmp/mock.png"},
			activity: ActivityEvent{
				ProviderItemID: "item-image", Kind: ActivityKindImageView,
				Status: "completed", Title: "Viewed image",
			},
		},
		{
			name: "generated image keeps its saved path separate from its public label",
			item: map[string]any{
				"id": "item-generated-image", "type": "imageGeneration", "result": "created",
				"savedPath": "/tmp/generated.png", "status": "completed",
			},
			activity: ActivityEvent{
				ProviderItemID: "item-generated-image", Kind: ActivityKindImageGeneration,
				Status: "completed", Title: "Generated image", SavedPath: stringPointer("/tmp/generated.png"),
			},
		},
		{
			name: "file change keeps structured changes",
			item: map[string]any{
				"id": "item-file", "type": "fileChange", "status": "completed",
				"changes": []any{map[string]any{
					"path": "internal/director/projector.go",
					"kind": map[string]any{"type": "update", "move_path": "internal/director/projector_core.go"},
					"diff": "@@ -1 +1 @@",
				}},
			},
			activity: ActivityEvent{
				ProviderItemID: "item-file", Kind: ActivityKindFileChange,
				Status: "completed", Title: "Changed 1 file(s)",
				FileChanges: []FileChange{{
					Path: "internal/director/projector.go", Kind: FileChangeKindUpdate,
					MovePath: stringPointer("internal/director/projector_core.go"), Diff: "@@ -1 +1 @@",
				}},
			},
		},
		{
			name: "subagent keeps its provider thread in a typed field",
			item: map[string]any{
				"id": "item-subagent", "type": "subAgentActivity", "kind": "started",
				"agentPath": "reviewer", "agentThreadId": "provider-subagent-thread",
			},
			activity: ActivityEvent{
				ProviderItemID: "item-subagent", Kind: ActivityKindSubagent,
				Status: "started", Title: "reviewer",
				ProviderSubagentThreadID: stringPointer("provider-subagent-thread"),
			},
		},
		{
			name: "sleep",
			item: map[string]any{"id": "item-sleep", "type": "sleep", "durationMs": 250},
			activity: ActivityEvent{
				ProviderItemID: "item-sleep", Kind: ActivityKindSleep,
				Status: "completed", Title: "Waited", Summary: "250 ms",
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			message := providerNotificationMessage(t, codexapp.CodexNotificationItemCompleted, map[string]any{
				"completedAtMs": 1, "item": testCase.item,
				"threadId": base.ProviderThreadID, "turnId": base.ProviderTurnID,
			})
			events, _, err := normalizedProviderNotification(newTestRuntime(), message, base)
			if err != nil {
				t.Fatalf("normalize completed item: %v", err)
			}
			if len(events) != 1 {
				t.Fatalf("completed item produced %d events, want 1", len(events))
			}
			event := events[0]
			if err := event.Validate(); err != nil {
				t.Fatalf("completed item event is invalid: %v", err)
			}
			if event.Kind != EventKindActivityCompleted {
				t.Fatalf("completed item event kind = %q", event.Kind)
			}
			if event.Activity == nil {
				t.Fatal("completed item event has no activity")
			}
			if !equalActivityEvents(*event.Activity, testCase.activity) {
				t.Fatalf("activity = %+v, want %+v", *event.Activity, testCase.activity)
			}
		})
	}
}

func equalActivityEvents(left ActivityEvent, right ActivityEvent) bool {
	return left.ProviderItemID == right.ProviderItemID &&
		left.Kind == right.Kind &&
		left.Status == right.Status &&
		left.Title == right.Title &&
		left.Summary == right.Summary &&
		equalStringPointers(left.Command, right.Command) &&
		equalStringPointers(left.CWD, right.CWD) &&
		equalStringPointers(left.Server, right.Server) &&
		equalStringPointers(left.Tool, right.Tool) &&
		equalStringPointers(left.Namespace, right.Namespace) &&
		equalStringPointers(left.ProcessID, right.ProcessID) &&
		equalStringPointers(left.SavedPath, right.SavedPath) &&
		equalStringPointers(left.ProviderSubagentThreadID, right.ProviderSubagentThreadID) &&
		equalFileChanges(left.FileChanges, right.FileChanges) &&
		equalIntPointers(left.ExitCode, right.ExitCode)
}

func equalFileChanges(left []FileChange, right []FileChange) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index].Path != right[index].Path ||
			left[index].Kind != right[index].Kind ||
			!equalStringPointers(left[index].MovePath, right[index].MovePath) ||
			left[index].Diff != right[index].Diff {
			return false
		}
	}
	return true
}

func equalStringPointers(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

func equalIntPointers(left *int, right *int) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

func providerNotificationTestBase() Event {
	return Event{
		ConversationID:   "conversation-director",
		TurnID:           "turn-director",
		ProviderThreadID: "provider-thread-1",
		ProviderTurnID:   "provider-turn-1",
	}
}

func newTestRuntime() *Runtime {
	return NewRuntime(Config{})
}

func providerNotificationMessage(t *testing.T, method string, params any) codexapp.Message {
	t.Helper()
	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("encode %s params: %v", method, err)
	}
	return codexapp.Message{Method: method, Params: raw}
}

func hookRunParams(status string, statusMessage *string) map[string]any {
	run := map[string]any{
		"displayOrder": 0, "entries": []any{}, "eventName": "preToolUse",
		"executionMode": "sync", "handlerType": "command", "id": "hook-run-1",
		"scope": "turn", "source": "plugin", "sourcePath": "/hooks/guard.sh",
		"startedAt": 1, "status": status,
	}
	if statusMessage != nil {
		run["statusMessage"] = *statusMessage
	}
	return run
}

func intPointer(value int) *int {
	return &value
}
