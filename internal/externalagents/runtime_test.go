package externalagents

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/agentruns"
	"setta/internal/backendlogs"
	"setta/internal/mcpx"
	"setta/internal/realtime"
)

type stubRunController struct {
	cancelCalls   int
	cancelErr     error
	approvalCalls []stubApprovalCall
	approvalErr   error
	toolCalls     []stubToolCall
	toolErr       error
}

type stubApprovalCall struct {
	ApprovalID string
	Approved   bool
}

type stubToolCall struct {
	ToolCallID string
	Payload    map[string]any
}

func (s *stubRunController) Cancel() error {
	s.cancelCalls++
	return s.cancelErr
}

func (s *stubRunController) SendApprovalResponse(approvalID string, approved bool) error {
	s.approvalCalls = append(s.approvalCalls, stubApprovalCall{
		ApprovalID: approvalID,
		Approved:   approved,
	})
	return s.approvalErr
}

func (s *stubRunController) SendToolResponse(toolCallID string, payload map[string]any) error {
	s.toolCalls = append(s.toolCalls, stubToolCall{
		ToolCallID: toolCallID,
		Payload:    cloneAnyMap(payload),
	})
	return s.toolErr
}

func TestRuntimeActivatesRunAndStoresLiveChatState(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	_, _ = store, runtime
	controller := &stubRunController{}
	if err := runtime.ActivateRun("run-active", controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.SetLiveChatState("run-active", ChatState{
		Messages: []map[string]any{
			{"id": "assistant-1", "role": "assistant", "content": []any{map[string]any{"type": "text", "text": "live"}}},
		},
		WaitingForResponse: true,
		ToolCallArguments:  map[string]string{"tool-call-1": "{\"path\":\"README.md\"}"},
	}); err != nil {
		t.Fatalf("set live chat state: %v", err)
	}
	state, err := runtime.GetLiveChatState("run-active")
	if err != nil {
		t.Fatalf("get live chat state: %v", err)
	}
	if state == nil || !state.WaitingForResponse {
		t.Fatalf("expected live waiting state, got %#v", state)
	}
	if got := state.ToolCallArguments["tool-call-1"]; got != "{\"path\":\"README.md\"}" {
		t.Fatalf("unexpected tool call arguments %q", got)
	}
}

func TestRuntimeWaitForRunUnblocksAfterDeactivate(t *testing.T) {
	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-wait", agentruns.RunStatusRunning)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		time.Sleep(50 * time.Millisecond)
		persisted, err := store.Load(run.ID)
		if err != nil {
			t.Errorf("load active run: %v", err)
			return
		}
		finishedAt := time.Date(2026, 3, 9, 9, 0, 1, 0, time.UTC)
		persisted.Status = agentruns.RunStatusCompleted
		persisted.FinishedAt = &finishedAt
		if err := store.Save(persisted); err != nil {
			t.Errorf("save completed run: %v", err)
			return
		}
		runtime.DeactivateRun(run.ID)
	}()

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	completed, err := runtime.WaitForRun(waitCtx, run.ID)
	if err != nil {
		t.Fatalf("wait for run: %v", err)
	}
	<-done
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run, got %#v", completed)
	}
}

func TestRuntimeStopRunCancelsControllerAndPersistsCancelledRun(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-stop", agentruns.RunStatusRunning)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.RegisterApproval(ApprovalState{
		ApprovalID:      "approval-stop",
		RunID:           run.ID,
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	}); err != nil {
		t.Fatalf("register approval: %v", err)
	}

	stopped, err := runtime.StopRun(run.ID)
	if err != nil {
		t.Fatalf("stop run: %v", err)
	}
	if stopped.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled run, got %q", stopped.Status)
	}
	if stopped.FinishedAt == nil {
		t.Fatal("expected finishedAt to be set")
	}
	if controller.cancelCalls != 1 {
		t.Fatalf("expected one cancel call, got %d", controller.cancelCalls)
	}
	persisted, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load stopped run: %v", err)
	}
	if persisted.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected persisted cancelled status, got %q", persisted.Status)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "run_cancelled" {
		t.Fatalf("expected run_cancelled event, got %#v", lastEvent)
	}
	state, err := runtime.GetLiveChatState(run.ID)
	if err != nil {
		t.Fatalf("get live chat state after stop: %v", err)
	}
	if state != nil {
		t.Fatalf("expected live state cleanup after stop, got %#v", state)
	}
	if err := runtime.RespondToApproval("approval-stop", true); !errors.Is(err, ErrApprovalNotFound) {
		t.Fatalf("expected approval cleanup after stop, got %v", err)
	}
}

func TestRuntimeStopRunMarksPersistedRunningRunCancelledWithoutActiveController(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-persisted", agentruns.RunStatusRunning)

	stopped, err := runtime.StopRun(run.ID)
	if err != nil {
		t.Fatalf("stop run without active controller: %v", err)
	}
	if stopped.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled status, got %q", stopped.Status)
	}
}

func TestRuntimeStopRunLeavesCompletedRunUnchanged(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-completed", agentruns.RunStatusCompleted)
	completedAt := time.Date(2026, 3, 9, 9, 0, 1, 0, time.UTC)
	run.FinishedAt = &completedAt
	run.Events = append(run.Events, agentruns.NewRunEvent("run_completed", map[string]any{}, completedAt))
	if err := store.Save(run); err != nil {
		t.Fatalf("save completed run: %v", err)
	}

	stopped, err := runtime.StopRun(run.ID)
	if err != nil {
		t.Fatalf("stop completed run: %v", err)
	}
	if stopped.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status to remain unchanged, got %q", stopped.Status)
	}

	persisted, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load completed run after stop: %v", err)
	}
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected persisted completed status, got %q", persisted.Status)
	}
	for _, event := range persisted.Events {
		if event.Type == "run_cancelled" {
			t.Fatalf("did not expect run_cancelled event on completed run, got %#v", persisted.Events)
		}
	}
}

func TestRuntimeRespondToApprovalDispatchesAndPersistsEvent(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-approval", agentruns.RunStatusRunning)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.SetLiveChatState(run.ID, ChatState{
		Messages: []map[string]any{
			{
				"id":      "approval-1",
				"role":    "assistant",
				"content": []any{},
				"tool_calls": []any{
					map[string]any{
						"id": "approval-1",
						"function": map[string]any{
							"name":      ApprovalToolName,
							"arguments": map[string]any{"approvalId": "approval-1"},
						},
					},
				},
			},
		},
		WaitingForResponse: true,
		ToolCallArguments: map[string]string{
			"approval-1": "{\"approvalId\":\"approval-1\"}",
		},
	}); err != nil {
		t.Fatalf("set live approval state: %v", err)
	}
	if err := runtime.RegisterApproval(ApprovalState{
		ApprovalID:      "approval-1",
		RunID:           run.ID,
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	}); err != nil {
		t.Fatalf("register approval: %v", err)
	}

	if err := runtime.RespondToApproval("approval-1", true); err != nil {
		t.Fatalf("respond to approval: %v", err)
	}
	if len(controller.approvalCalls) != 1 {
		t.Fatalf("expected one approval dispatch, got %#v", controller.approvalCalls)
	}
	if controller.approvalCalls[0].ApprovalID != "approval-1" || !controller.approvalCalls[0].Approved {
		t.Fatalf("unexpected approval dispatch %#v", controller.approvalCalls[0])
	}
	persisted, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load run after approval response: %v", err)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "approval_response" {
		t.Fatalf("expected approval_response event, got %#v", lastEvent)
	}
	if len(persisted.Events) < 2 || persisted.Events[len(persisted.Events)-2].Type != "tool_result" {
		t.Fatalf("expected tool_result before approval_response, got %#v", persisted.Events)
	}
	rawMessages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(rawMessages) == 0 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := rawMessages[len(rawMessages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected tool result message, got %#v", rawMessages[len(rawMessages)-1])
	}
	if lastMessage["role"] != "tool" {
		t.Fatalf("expected tool role, got %#v", lastMessage)
	}
	if lastMessage["tool_name"] != ApprovalToolName {
		t.Fatalf("expected approval tool name, got %#v", lastMessage)
	}
	if err := runtime.RespondToApproval("approval-1", true); !errors.Is(err, ErrApprovalNotFound) {
		t.Fatalf("expected approval to be removed after response, got %v", err)
	}
}

func TestRuntimeRejectsApprovalRegistrationForInactiveRun(t *testing.T) {
	t.Parallel()

	_, runtime := buildRuntimeFixture(t)
	err := runtime.RegisterApproval(ApprovalState{
		ApprovalID:      "approval-missing",
		RunID:           "run-missing",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	})
	if !errors.Is(err, ErrRunNotActive) {
		t.Fatalf("expected ErrRunNotActive, got %v", err)
	}
}

func TestRuntimeRespondToQuestionDispatchesAndPersistsEvent(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-question", agentruns.RunStatusRunning)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.SetLiveChatState(run.ID, ChatState{
		Messages: []map[string]any{
			{
				"id":      "assistant-1",
				"role":    "assistant",
				"content": []any{},
				"tool_calls": []any{
					map[string]any{
						"id": "question-1",
						"function": map[string]any{
							"name": askUserQuestionToolName,
							"arguments": map[string]any{
								"questions": []any{
									map[string]any{"question": "Language", "options": []any{"Go", "Python"}},
								},
							},
						},
					},
				},
			},
		},
		WaitingForResponse: true,
		ToolCallArguments: map[string]string{
			"question-1": "{\"questions\":[{\"question\":\"Language\",\"options\":[\"Go\",\"Python\"]}]}",
		},
	}); err != nil {
		t.Fatalf("set live question state: %v", err)
	}
	if err := runtime.RegisterQuestion(QuestionState{
		ToolCallID:      "question-1",
		RunID:           run.ID,
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	}); err != nil {
		t.Fatalf("register question: %v", err)
	}

	answers := map[string]string{"Language": "Go"}
	if err := runtime.RespondToQuestion("question-1", answers); err != nil {
		t.Fatalf("respond to question: %v", err)
	}
	if len(controller.toolCalls) != 1 {
		t.Fatalf("expected one tool response dispatch, got %#v", controller.toolCalls)
	}
	if controller.toolCalls[0].ToolCallID != "question-1" {
		t.Fatalf("unexpected tool response dispatch %#v", controller.toolCalls[0])
	}
	if got := controller.toolCalls[0].Payload["answers"]; got == nil {
		t.Fatalf("expected answers payload, got %#v", controller.toolCalls[0].Payload)
	}
	persisted, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load run after question response: %v", err)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "question_response" {
		t.Fatalf("expected question_response event, got %#v", lastEvent)
	}
	if len(persisted.Events) < 2 || persisted.Events[len(persisted.Events)-2].Type != "tool_result" {
		t.Fatalf("expected tool_result before question_response, got %#v", persisted.Events)
	}
	rawMessages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(rawMessages) == 0 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := rawMessages[len(rawMessages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected question tool result message, got %#v", rawMessages[len(rawMessages)-1])
	}
	if lastMessage["role"] != "tool" {
		t.Fatalf("expected tool role, got %#v", lastMessage)
	}
	if lastMessage["tool_name"] != askUserQuestionToolName {
		t.Fatalf("expected question tool name, got %#v", lastMessage)
	}
	result, ok := lastMessage["result"].(map[string]any)
	if !ok {
		t.Fatalf("expected result payload, got %#v", lastMessage["result"])
	}
	answerPayload, ok := result["answers"].(map[string]any)
	if !ok || answerPayload["Language"] != "Go" {
		t.Fatalf("unexpected answers payload %#v", result)
	}
	if err := runtime.RespondToQuestion("question-1", answers); !errors.Is(err, ErrQuestionNotFound) {
		t.Fatalf("expected question to be removed after response, got %v", err)
	}
}

func TestRuntimeRespondToQuestionUsesResponseIDOverride(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-question-response-id", agentruns.RunStatusRunning)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.SetLiveChatState(run.ID, ChatState{
		Messages: []map[string]any{
			{
				"id":      "assistant-1",
				"role":    "assistant",
				"content": []any{},
				"tool_calls": []any{
					map[string]any{
						"id": "question-1",
						"function": map[string]any{
							"name":      askUserQuestionToolName,
							"arguments": map[string]any{"questions": []any{map[string]any{"question": "Language"}}},
						},
					},
				},
			},
		},
		WaitingForResponse: true,
	}); err != nil {
		t.Fatalf("set live question state: %v", err)
	}
	responseID := "approval-bridge-1"
	if err := runtime.RegisterQuestion(QuestionState{
		ToolCallID:      "question-1",
		ResponseID:      &responseID,
		RunID:           run.ID,
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	}); err != nil {
		t.Fatalf("register question: %v", err)
	}

	if err := runtime.RespondToQuestion("question-1", map[string]string{"Language": "Go"}); err != nil {
		t.Fatalf("respond to question: %v", err)
	}
	if len(controller.toolCalls) != 1 {
		t.Fatalf("expected one tool response dispatch, got %#v", controller.toolCalls)
	}
	if controller.toolCalls[0].ToolCallID != responseID {
		t.Fatalf("expected response id override %q, got %#v", responseID, controller.toolCalls[0])
	}
}

func TestRuntimeReturnsPersistedTerminalRunWithoutCancel(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-complete", agentruns.RunStatusCompleted)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}

	stopped, err := runtime.StopRun(run.ID)
	if err != nil {
		t.Fatalf("stop completed run: %v", err)
	}
	if stopped.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run to remain completed, got %q", stopped.Status)
	}
	if controller.cancelCalls != 0 {
		t.Fatalf("expected no cancel call for completed run, got %d", controller.cancelCalls)
	}
}

func TestRuntimeExternalRuntimeStatusesReturnsActiveStatuses(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-status-active", agentruns.RunStatusRunning)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}

	now := time.Date(2026, 3, 9, 9, 15, 0, 0, time.UTC)
	if err := runtime.UpsertMCPStatuses(run.ID, []mcpx.ServerRuntimeStatus{
		{
			ServerID:        "setta",
			Source:          externalMCPStatusSource,
			Transport:       mcpx.TransportStreamableHTTP,
			Endpoint:        "http://127.0.0.1:8000/mcp",
			State:           mcpx.RuntimeStateConnected,
			LastAttemptAt:   &now,
			LastConnectedAt: &now,
			ToolCount:       4,
		},
	}); err != nil {
		t.Fatalf("upsert mcp status: %v", err)
	}

	statuses, err := runtime.ExternalRuntimeStatuses(stringPtr("chat-alpha"), stringPtr("engine-alpha"))
	if err != nil {
		t.Fatalf("external runtime statuses: %v", err)
	}
	if len(statuses) != 1 {
		t.Fatalf("expected one external status, got %#v", statuses)
	}
	if statuses[0].ServerID != "setta" || statuses[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("unexpected external status %#v", statuses[0])
	}
}

func TestRuntimeStopRunPersistsMCPStatusSnapshot(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-status-stop", agentruns.RunStatusRunning)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}

	if err := runtime.UpsertMCPStatuses(run.ID, []mcpx.ServerRuntimeStatus{
		{
			ServerID:  "setta",
			Source:    externalMCPStatusSource,
			Transport: mcpx.TransportStreamableHTTP,
			Endpoint:  "http://127.0.0.1:8000/mcp",
			State:     mcpx.RuntimeStateConnected,
			ToolCount: 4,
		},
	}); err != nil {
		t.Fatalf("upsert mcp status: %v", err)
	}

	if _, err := runtime.StopRun(run.ID); err != nil {
		t.Fatalf("stop run: %v", err)
	}

	persisted, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load stopped run: %v", err)
	}
	rawSnapshot, ok := persisted.Outputs[externalMCPStatusSnapshotKey].([]any)
	if !ok || len(rawSnapshot) != 1 {
		t.Fatalf("expected persisted mcp snapshot, got %#v", persisted.Outputs)
	}

	statuses, err := runtime.ExternalRuntimeStatuses(stringPtr("chat-alpha"), stringPtr("engine-alpha"))
	if err != nil {
		t.Fatalf("external runtime statuses after stop: %v", err)
	}
	if len(statuses) != 1 || statuses[0].ServerID != "setta" {
		t.Fatalf("unexpected persisted external statuses %#v", statuses)
	}
}

func TestPersistExternalAgentRunFailureBroadcastsBackendLogEvent(t *testing.T) {
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	server := newRuntimeBackendLogTestServer(t, hub)
	defer server.Close()

	frontend := dialRuntimeBackendLogClient(t, server.URL, "frontend-a")
	defer frontend.CloseNow()
	waitForRuntimeBackendLogConnection(t, hub, "frontend-a")

	store, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	logService, err := backendlogs.NewService(backendlogs.ServiceOptions{
		Logger:       logger,
		WebsocketHub: hub,
		EnvLookup: func(key string) (string, bool) {
			if key == "SETTA_UI_LOG_LEVEL" {
				return "info", true
			}
			return "", false
		},
		IDGenerator: func() string {
			return "backend-log-id"
		},
		TimeNow: func() time.Time {
			return time.Date(2026, time.March, 9, 9, 5, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new backend log service: %v", err)
	}
	runtime, err := NewRuntime(RuntimeOptions{
		Runs:        store,
		BackendLogs: logService,
		Logger:      logger,
		TimeNow: func() time.Time {
			return time.Date(2026, time.March, 9, 9, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	run := newPersistedRuntimeRun(t, store, "run-failure", agentruns.RunStatusRunning)

	failed, err := persistExternalAgentRunFailure(
		store,
		runtime,
		func() time.Time {
			return time.Date(2026, time.March, 9, 9, 10, 0, 0, time.UTC)
		},
		run.ID,
		errors.New("signal: killed"),
		[]string{"process exited unexpectedly"},
	)
	if err != nil {
		t.Fatalf("persist external agent run failure: %v", err)
	}
	if failed.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed status, got %#v", failed)
	}

	envelope := readRuntimeBackendLogEnvelope(t, frontend)
	if envelope.MessageType != string(realtime.WebsocketMessageTypeBackendLogEvent) {
		t.Fatalf("expected backend log event message type, got %q", envelope.MessageType)
	}
	var event backendlogs.Event
	if err := json.Unmarshal(envelope.Content, &event); err != nil {
		t.Fatalf("decode backend log event: %v", err)
	}
	if event.Severity != backendlogs.SeverityError {
		t.Fatalf("expected error severity, got %#v", event)
	}
	if event.ProjectID == nil || *event.ProjectID != "project-alpha" {
		t.Fatalf("expected project-alpha backend log event, got %#v", event.ProjectID)
	}
	if !strings.Contains(event.Message, "External agent run failed (engine-alpha): signal: killed") {
		t.Fatalf("expected run failure message, got %q", event.Message)
	}
	if !strings.Contains(event.Message, "process exited unexpectedly") {
		t.Fatalf("expected stderr details in backend log message, got %q", event.Message)
	}
}

func buildRuntimeFixture(t *testing.T) (*agentruns.RunStore, *Runtime) {
	t.Helper()

	store, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	runtime, err := NewRuntime(RuntimeOptions{
		Runs: store,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	return store, runtime
}

func newPersistedRuntimeRun(t *testing.T, store *agentruns.RunStore, runID string, status agentruns.RunStatus) agentruns.Run {
	t.Helper()

	now := time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC)
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-alpha",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-alpha",
		"messages":        []any{},
	}, now)
	run.ID = runID
	run.Status = status
	if status != agentruns.RunStatusRunning {
		finishedAt := now.Add(time.Minute)
		run.FinishedAt = &finishedAt
	}
	if err := store.Save(run); err != nil {
		t.Fatalf("save persisted runtime run: %v", err)
	}
	return run
}

type runtimeBackendLogEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

func newRuntimeBackendLogTestServer(t *testing.T, hub *realtime.WebsocketHub) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()

		connection, err := hub.Connect(r.Context(), conn, realtime.ConnectParams{
			ID:                   r.URL.Query().Get("id"),
			Type:                 realtime.ConnectionType(r.URL.Query().Get("type")),
			BroadcastConnections: false,
		})
		if err != nil {
			return
		}
		defer hub.Disconnect(context.Background(), connection.ID, false)
		<-r.Context().Done()
	})
	return httptest.NewServer(mux)
}

func dialRuntimeBackendLogClient(t *testing.T, serverURL string, id string) *websocket.Conn {
	t.Helper()

	parsedURL, err := url.Parse(serverURL)
	if err != nil {
		t.Fatalf("parse test server url: %v", err)
	}
	parsedURL.Scheme = "ws"
	parsedURL.Path = "/ws"
	query := parsedURL.Query()
	query.Set("id", id)
	query.Set("type", string(realtime.ConnectionTypeFrontend))
	parsedURL.RawQuery = query.Encode()

	conn, _, err := websocket.Dial(context.Background(), parsedURL.String(), nil)
	if err != nil {
		t.Fatalf("dial runtime backend log client: %v", err)
	}
	return conn
}

func waitForRuntimeBackendLogConnection(t *testing.T, hub *realtime.WebsocketHub, id string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, ok := hub.Connection(id); ok {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for backend log connection %q", id)
}

func readRuntimeBackendLogEnvelope(t *testing.T, conn *websocket.Conn) runtimeBackendLogEnvelope {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read runtime backend log websocket payload: %v", err)
	}
	var envelope runtimeBackendLogEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode runtime backend log envelope: %v", err)
	}
	return envelope
}
