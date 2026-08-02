package codexapp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestManagerInitializesOnceForRepeatedCalls(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	if value := callEcho(t, manager, "first"); value != "first" {
		t.Fatalf("first echo = %q", value)
	}
	if value := callEcho(t, manager, "second"); value != "second" {
		t.Fatalf("second echo = %q", value)
	}
	raw, err := manager.Call(context.Background(), "initCount", map[string]any{})
	if err != nil {
		t.Fatalf("initCount: %v", err)
	}
	var response struct {
		Count int `json:"count"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		t.Fatalf("decode init count: %v", err)
	}
	if response.Count != 1 {
		t.Fatalf("initialize count = %d, want 1", response.Count)
	}
}

func TestManagerSupportsConcurrentCalls(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	const callCount = 8
	var wait sync.WaitGroup
	errors := make(chan error, callCount)
	for index := range callCount {
		wait.Add(1)
		go func() {
			defer wait.Done()
			if value := callEcho(t, manager, string(rune('a'+index))); value == "" {
				errors <- context.Canceled
			}
		}()
	}
	wait.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatalf("concurrent call failed: %v", err)
		}
	}
}

func TestManagerRestartsAfterIdleExit(t *testing.T) {
	manager := newTestManager("exit-after-echo")
	defer shutdownTestManager(t, manager)

	if value := callEcho(t, manager, "first"); value != "first" {
		t.Fatalf("first echo = %q", value)
	}
	firstGeneration := manager.Generation()
	waitForManagerState(t, manager, ManagerStateStopped)
	stoppedGeneration := manager.Generation()
	if stoppedGeneration <= firstGeneration {
		t.Fatalf("generation after idle exit = %d, want greater than %d", stoppedGeneration, firstGeneration)
	}
	if value := callEcho(t, manager, "second"); value != "second" {
		t.Fatalf("second echo = %q", value)
	}
	if restartedGeneration := manager.Generation(); restartedGeneration <= stoppedGeneration {
		t.Fatalf("generation after restart = %d, want greater than %d", restartedGeneration, stoppedGeneration)
	}
}

func TestManagerDeliversLifecycleFailureToActiveSession(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	defer session.Close()

	_, err = session.Call(context.Background(), "exit", map[string]any{})
	if err == nil || !strings.Contains(err.Error(), "codex app-server exited") {
		t.Fatalf("exit call error = %v, want app-server exit", err)
	}
	select {
	case event := <-session.Events():
		if event.Kind != EventLifecycle || event.Err == nil {
			t.Fatalf("event = %+v, want lifecycle failure", event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for lifecycle failure")
	}
}

func TestManagerDrainsNotificationsBeforeLifecycleOnExit(t *testing.T) {
	manager := newTestManager("notify-then-exit")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	defer session.Close()
	if err := session.OwnThread("thread_a"); err != nil {
		t.Fatalf("own thread: %v", err)
	}

	if _, err := session.Call(context.Background(), "notifyThenExit", map[string]any{}); err != nil {
		t.Fatalf("notifyThenExit: %v", err)
	}
	event := readSessionEvent(t, session)
	if event.Kind != EventNotification || event.Message.Method != "thread/settings/updated" {
		t.Fatalf("first event = %+v, want queued notification before lifecycle", event)
	}
	event = readSessionEvent(t, session)
	if event.Kind != EventLifecycle || event.Err == nil {
		t.Fatalf("second event = %+v, want lifecycle failure", event)
	}
}

func TestManagerRoutesNotificationToOwnedThread(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	first, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new first session: %v", err)
	}
	defer first.Close()
	if err := first.OwnThread("thread_a"); err != nil {
		t.Fatalf("own first thread: %v", err)
	}
	second, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new second session: %v", err)
	}
	defer second.Close()
	if err := second.OwnThread("thread_b"); err != nil {
		t.Fatalf("own second thread: %v", err)
	}

	manager.dispatchNotification(Message{
		Method: "thread/settings/updated",
		Params: rawTestMessage(t, map[string]any{"threadId": "thread_a"}),
	})

	event := readSessionEvent(t, first)
	if event.Kind != EventNotification || event.Message.Method != "thread/settings/updated" {
		t.Fatalf("first event = %+v, want routed notification", event)
	}
	expectNoSessionEvent(t, second)
}

func TestManagerRoutesScopedNotificationToThreadOwnerWhenTurnIsUnknown(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	defer session.Close()
	if err := session.OwnThread("thread_a"); err != nil {
		t.Fatalf("own thread: %v", err)
	}
	if err := session.OwnTurn("thread_a", "turn_a"); err != nil {
		t.Fatalf("own turn: %v", err)
	}

	manager.dispatchNotification(Message{
		Method: "turn/started",
		Params: rawTestMessage(t, map[string]any{
			"threadId": "thread_a",
			"turnId":   "turn_new",
		}),
	})

	event := readSessionEvent(t, session)
	if event.Kind != EventNotification || event.Message.Method != "turn/started" {
		t.Fatalf("event = %+v, want same-thread notification", event)
	}
}

func TestManagerDoesNotRouteScopedNotificationToUnscopedSession(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	defer session.Close()
	session.AcceptUnscopedNotifications()
	if err := session.OwnThread("thread_a"); err != nil {
		t.Fatalf("own thread: %v", err)
	}

	manager.dispatchNotification(Message{
		Method: "item/started",
		Params: rawTestMessage(t, map[string]any{
			"threadId": "thread_b",
			"turnId":   "turn_stale",
		}),
	})

	expectNoSessionEvent(t, session)
}

func TestManagerDoesNotInferTurnOwnershipForStandaloneProcessOutput(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	defer session.Close()
	if err := session.OwnTurn("thread_a", "turn_a"); err != nil {
		t.Fatalf("own turn: %v", err)
	}

	manager.dispatchNotification(Message{
		Method: CodexNotificationItemStarted,
		Params: rawTestMessage(t, map[string]any{
			"item": map[string]any{
				"id":        "command_a",
				"processId": "process_a",
				"type":      "commandExecution",
			},
			"threadId": "thread_a",
			"turnId":   "turn_a",
		}),
	})

	event := readSessionEvent(t, session)
	if event.Kind != EventNotification || event.Message.Method != CodexNotificationItemStarted {
		t.Fatalf("event = %+v, want command item start", event)
	}

	manager.dispatchNotification(Message{
		Method: CodexNotificationProcessOutputDelta,
		Params: rawTestMessage(t, map[string]any{
			"capReached":    false,
			"deltaBase64":   "b3V0Cg==",
			"processHandle": "process_a",
			"stream":        "stdout",
		}),
	})

	expectNoSessionEvent(t, session)
}

func TestManagerRoutesUnownedLegacyProcessOutputToSingleUnscopedSession(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	defer session.Close()
	session.AcceptUnscopedNotifications()

	manager.dispatchNotification(Message{
		Method: CodexNotificationProcessOutputDelta,
		Params: rawTestMessage(t, map[string]any{
			"capReached":    false,
			"deltaBase64":   "b3V0Cg==",
			"processHandle": "process_unknown",
			"stream":        "stdout",
		}),
	})

	event := readSessionEvent(t, session)
	if event.Kind != EventNotification || event.Message.Method != CodexNotificationProcessOutputDelta {
		t.Fatalf("event = %+v, want legacy process output delta", event)
	}
}

func TestManagerDoesNotBroadcastUnownedLegacyProcessOutputToMultipleUnscopedSessions(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	first, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new first session: %v", err)
	}
	defer first.Close()
	first.AcceptUnscopedNotifications()
	second, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new second session: %v", err)
	}
	defer second.Close()
	second.AcceptUnscopedNotifications()

	manager.dispatchNotification(Message{
		Method: CodexNotificationProcessOutputDelta,
		Params: rawTestMessage(t, map[string]any{
			"capReached":    false,
			"deltaBase64":   "b3V0Cg==",
			"processHandle": "process_unknown",
			"stream":        "stdout",
		}),
	})

	expectNoSessionEvent(t, first)
	expectNoSessionEvent(t, second)
}

func TestManagerRoutesRequestToSingleOwnedTurn(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	first, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new first session: %v", err)
	}
	defer first.Close()
	if err := first.OwnThread("thread_a"); err != nil {
		t.Fatalf("own first thread: %v", err)
	}
	if err := first.OwnTurn("thread_a", "turn_a"); err != nil {
		t.Fatalf("own first turn: %v", err)
	}
	second, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new second session: %v", err)
	}
	defer second.Close()
	if err := second.OwnThread("thread_b"); err != nil {
		t.Fatalf("own second thread: %v", err)
	}
	if err := second.OwnTurn("thread_b", "turn_b"); err != nil {
		t.Fatalf("own second turn: %v", err)
	}

	manager.dispatchRequest(Message{
		ID:     1,
		Method: "item/tool/call",
		Params: rawTestMessage(t, map[string]any{
			"threadId": "thread_a",
			"turnId":   "turn_a",
		}),
	})

	event := readSessionEvent(t, first)
	if event.Kind != EventRequest || event.Message.Method != "item/tool/call" {
		t.Fatalf("first event = %+v, want routed request", event)
	}
	expectNoSessionEvent(t, second)
}

func TestManagerDoesNotBroadcastRequestWithMultipleOwners(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	first, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new first session: %v", err)
	}
	defer first.Close()
	if err := first.OwnThread("thread_a"); err != nil {
		t.Fatalf("own first thread: %v", err)
	}
	second, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new second session: %v", err)
	}
	defer second.Close()
	if err := second.OwnThread("thread_a"); err != nil {
		t.Fatalf("own second thread: %v", err)
	}

	manager.dispatchRequest(Message{
		ID:     1,
		Method: "mcpServer/elicitation/request",
		Params: rawTestMessage(t, map[string]any{"threadId": "thread_a"}),
	})

	expectNoSessionEvent(t, first)
	expectNoSessionEvent(t, second)
}

func TestCodexAppServerEventClassification(t *testing.T) {
	tests := []struct {
		name    string
		message Message
		want    EventClass
	}{
		{
			name:    "assistant text delta is lossless",
			message: Message{Method: CodexNotificationItemAgentMessageDelta},
			want:    EventClassLosslessNotification,
		},
		{
			name:    "reasoning text delta is lossless",
			message: Message{Method: CodexNotificationItemReasoningTextDelta},
			want:    EventClassLosslessNotification,
		},
		{
			name:    "plan delta is lossless",
			message: Message{Method: CodexNotificationItemPlanDelta},
			want:    EventClassLosslessNotification,
		},
		{
			name:    "item completion is lossless",
			message: Message{Method: CodexNotificationItemCompleted},
			want:    EventClassLosslessNotification,
		},
		{
			name:    "turn completion is lossless",
			message: Message{Method: CodexNotificationTurnCompleted},
			want:    EventClassLosslessNotification,
		},
		{
			name:    "command exec output is best effort",
			message: Message{Method: CodexNotificationCommandExecOutputDelta},
			want:    EventClassBestEffortNotification,
		},
		{
			name:    "command execution output is best effort",
			message: Message{Method: CodexNotificationItemCommandExecutionOutputDelta},
			want:    EventClassBestEffortNotification,
		},
		{
			name:    "process output is best effort",
			message: Message{Method: CodexNotificationProcessOutputDelta},
			want:    EventClassBestEffortNotification,
		},
		{
			name:    "server request is never best effort",
			message: Message{ID: 1, Method: CodexServerRequestItemToolCall},
			want:    EventClassServerRequest,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := classifyMessage(tt.message); got != tt.want {
				t.Fatalf("classifyMessage(%s) = %s, want %s", tt.message.Method, got, tt.want)
			}
		})
	}
}

func TestManagerBestEffortOverflowDoesNotCloseSessionAndEmitsLagMarker(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	if err := session.OwnThread("thread_a"); err != nil {
		t.Fatalf("own thread: %v", err)
	}
	for range cap(session.events) {
		session.events <- Event{Kind: EventNotification}
	}

	manager.dispatchNotification(Message{
		Method: CodexNotificationItemCommandExecutionOutputDelta,
		Params: rawTestMessage(t, map[string]any{
			"delta":    "dropped\n",
			"itemId":   "item_output",
			"threadId": "thread_a",
			"turnId":   "turn_a",
		}),
	})
	if err := session.OwnTurn("thread_a", "turn_a"); err != nil {
		t.Fatalf("own turn after best-effort overflow: %v", err)
	}

	for range cap(session.events) {
		<-session.events
	}
	manager.dispatchNotification(Message{
		Method: CodexNotificationItemCommandExecutionOutputDelta,
		Params: rawTestMessage(t, map[string]any{
			"delta":    "delivered\n",
			"itemId":   "item_output",
			"threadId": "thread_a",
			"turnId":   "turn_a",
		}),
	})

	event := readSessionEvent(t, session)
	if event.Kind != EventLag || event.Lag == nil {
		t.Fatalf("event = %+v, want lag marker", event)
	}
	if event.Lag.SkippedCount != 1 ||
		event.Lag.Method != CodexNotificationItemCommandExecutionOutputDelta ||
		event.Lag.ProviderItemID != "item_output" ||
		event.Lag.ThreadID != "thread_a" ||
		event.Lag.TurnID != "turn_a" {
		t.Fatalf("lag = %+v, want skipped output metadata", event.Lag)
	}
	event = readSessionEvent(t, session)
	if event.Kind != EventNotification || event.Message.Method != CodexNotificationItemCommandExecutionOutputDelta {
		t.Fatalf("event = %+v, want delivered best-effort notification after lag", event)
	}
}

func TestManagerLosslessDispatchBlocksUntilSessionDrains(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	defer session.Close()
	if err := session.OwnThread("thread_a"); err != nil {
		t.Fatalf("own thread: %v", err)
	}
	for range cap(session.events) {
		session.events <- Event{Kind: EventNotification}
	}

	done := make(chan struct{})
	go func() {
		manager.dispatchNotification(Message{
			Method: CodexNotificationThreadSettingsUpdated,
			Params: rawTestMessage(t, map[string]any{"threadId": "thread_a"}),
		})
		close(done)
	}()

	select {
	case <-done:
		t.Fatal("lossless dispatch returned while session buffer was full")
	case <-time.After(100 * time.Millisecond):
	}
	<-session.events
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("lossless dispatch did not resume after session drained")
	}
}

func TestManagerLosslessDispatchDeliversPendingLagMarkerAfterFullQueueDrains(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	defer session.Close()
	if err := session.OwnThread("thread_a"); err != nil {
		t.Fatalf("own thread: %v", err)
	}
	for range cap(session.events) {
		session.events <- Event{Kind: EventNotification}
	}

	manager.dispatchNotification(Message{
		Method: CodexNotificationItemCommandExecutionOutputDelta,
		Params: rawTestMessage(t, map[string]any{
			"delta":    "dropped\n",
			"itemId":   "item_output",
			"threadId": "thread_a",
			"turnId":   "turn_a",
		}),
	})

	done := make(chan struct{})
	go func() {
		manager.dispatchNotification(Message{
			Method: CodexNotificationThreadSettingsUpdated,
			Params: rawTestMessage(t, map[string]any{"threadId": "thread_a"}),
		})
		close(done)
	}()

	select {
	case <-done:
		t.Fatal("lossless dispatch returned while session buffer and pending lag marker were full")
	case <-time.After(100 * time.Millisecond):
	}

	_ = readSessionEvent(t, session)
	_ = readSessionEvent(t, session)
	for range cap(session.events) - 2 {
		event := readSessionEvent(t, session)
		if event.Kind == EventLag {
			t.Fatalf("lag marker delivered before queued backlog drained: %+v", event)
		}
	}

	event := readSessionEvent(t, session)
	if event.Kind != EventLag || event.Lag == nil {
		t.Fatalf("event = %+v, want lag marker before lossless notification", event)
	}
	if event.Lag.SkippedCount != 1 || event.Lag.ProviderItemID != "item_output" {
		t.Fatalf("lag = %+v, want skipped output metadata", event.Lag)
	}
	event = readSessionEvent(t, session)
	if event.Kind != EventNotification || event.Message.Method != CodexNotificationThreadSettingsUpdated {
		t.Fatalf("event = %+v, want lossless notification after lag marker", event)
	}
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("lossless dispatch did not complete after lag marker and notification delivery")
	}
}

func TestManagerLosslessDispatchDrainsAllPendingLagMarkersBeforeCompletion(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	defer session.Close()
	if err := session.OwnTurn("thread_a", "turn_a"); err != nil {
		t.Fatalf("own turn: %v", err)
	}
	for range cap(session.events) {
		session.events <- Event{Kind: EventNotification}
	}

	for _, itemID := range []string{"item_output_a", "item_output_b"} {
		manager.dispatchNotification(Message{
			Method: CodexNotificationItemCommandExecutionOutputDelta,
			Params: rawTestMessage(t, map[string]any{
				"delta":    "dropped\n",
				"itemId":   itemID,
				"threadId": "thread_a",
				"turnId":   "turn_a",
			}),
		})
	}

	done := make(chan struct{})
	go func() {
		manager.dispatchNotification(Message{
			Method: CodexNotificationTurnCompleted,
			Params: rawTestMessage(t, map[string]any{
				"threadId": "thread_a",
				"turnId":   "turn_a",
			}),
		})
		close(done)
	}()

	select {
	case <-done:
		t.Fatal("lossless completion returned while session buffer and pending lag markers were full")
	case <-time.After(100 * time.Millisecond):
	}

	for range cap(session.events) {
		event := readSessionEvent(t, session)
		if event.Kind == EventLag {
			t.Fatalf("lag marker delivered before queued backlog drained: %+v", event)
		}
	}

	lagItems := map[string]struct{}{}
	for range 2 {
		event := readSessionEvent(t, session)
		if event.Kind != EventLag || event.Lag == nil {
			t.Fatalf("event = %+v, want lag marker before completion", event)
		}
		lagItems[event.Lag.ProviderItemID] = struct{}{}
	}
	if _, ok := lagItems["item_output_a"]; !ok {
		t.Fatalf("lag items = %v, missing first output scope", lagItems)
	}
	if _, ok := lagItems["item_output_b"]; !ok {
		t.Fatalf("lag items = %v, missing second output scope", lagItems)
	}
	event := readSessionEvent(t, session)
	if event.Kind != EventNotification || event.Message.Method != CodexNotificationTurnCompleted {
		t.Fatalf("event = %+v, want turn completion after all lag markers", event)
	}
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("lossless completion did not finish after lag markers and completion delivery")
	}
}

func TestManagerRequestOverflowReturnsOverloadAndKeepsSessionOpen(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)

	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	defer session.Close()
	if err := session.OwnTurn("thread_a", "turn_a"); err != nil {
		t.Fatalf("own turn: %v", err)
	}
	for range cap(session.events) {
		session.events <- Event{Kind: EventNotification}
	}
	var response bytes.Buffer
	message := Message{
		ID:     7,
		Method: CodexServerRequestItemToolCall,
		Params: rawTestMessage(t, map[string]any{
			"threadId": "thread_a",
			"turnId":   "turn_a",
		}),
		client: testResponseClient(&response),
	}

	manager.dispatchRequest(message)

	if err := session.OwnTurn("thread_a", "turn_a_next"); err != nil {
		t.Fatalf("own next turn after request overflow: %v", err)
	}
	assertJSONRPCErrorCode(t, response.Bytes(), jsonRPCErrorServerOverloaded)
}

func TestManagerLifecycleDeliveryWaitsForFullSessionDrain(t *testing.T) {
	manager := newTestManager("steady")
	defer shutdownTestManager(t, manager)
	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	for range cap(session.events) {
		session.events <- Event{Kind: EventNotification}
	}
	manager.mu.Lock()
	client := manager.client
	manager.mu.Unlock()
	defer client.Close()

	done := make(chan struct{})
	go func() {
		manager.handleClientDone(client)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("lifecycle dispatch blocked on full session buffer")
	}
	for range cap(session.events) {
		<-session.events
	}
	event := readSessionEvent(t, session)
	if event.Kind != EventLifecycle || event.Err == nil {
		t.Fatalf("event = %+v, want lifecycle after backlog drains", event)
	}
	session.Close()
	err = session.OwnThread("thread_after_close")
	if err == nil || !strings.Contains(err.Error(), "codex app-server exited") {
		t.Fatalf("own thread after lifecycle close = %v, want original lifecycle cause", err)
	}
}

func TestManagerShutdownClosesSession(t *testing.T) {
	manager := newTestManager("steady")
	session, err := manager.NewSession(context.Background())
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	if err := manager.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
	select {
	case _, ok := <-session.Events():
		if !ok {
			t.Fatal("session closed without lifecycle event")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for shutdown event")
	}
}

func TestJSONRPCCanceledCallIgnoresLateResponse(t *testing.T) {
	client, err := StartProcess(testProcessConfig("delayed-response"))
	if err != nil {
		t.Fatalf("start client: %v", err)
	}
	defer client.Close()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, err := client.Call(ctx, "delayedEcho", map[string]any{"value": "late"})
		done <- err
	}()
	waitForClientNotification(t, client, "delayed/received")
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("delayed call error = %v, want context canceled", err)
	}
	time.Sleep(150 * time.Millisecond)

	raw, err := client.Call(context.Background(), "echo", map[string]any{"value": "after"})
	if err != nil {
		t.Fatalf("echo after late response: %v", err)
	}
	var response struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		t.Fatalf("decode echo: %v", err)
	}
	if response.Value != "after" {
		t.Fatalf("echo value = %q, want after", response.Value)
	}
}

func TestJSONRPCCanceledCallDoesNotRetainPendingWithoutResponse(t *testing.T) {
	client, err := StartProcess(testProcessConfig("never-response"))
	if err != nil {
		t.Fatalf("start client: %v", err)
	}
	defer client.Close()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, err := client.Call(ctx, "neverEcho", map[string]any{"value": "never"})
		done <- err
	}()
	waitForClientNotification(t, client, "never/received")
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("never response call error = %v, want context canceled", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for canceled call")
	}
	requireClientPendingCount(t, client, 0)

	raw, err := client.Call(context.Background(), "echo", map[string]any{"value": "after"})
	if err != nil {
		t.Fatalf("echo after canceled no-response call: %v", err)
	}
	var response struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		t.Fatalf("decode echo: %v", err)
	}
	if response.Value != "after" {
		t.Fatalf("echo value = %q, want after", response.Value)
	}
}

func TestJSONRPCRequestQueueOverflowReturnsOverload(t *testing.T) {
	var response bytes.Buffer
	client := testResponseClient(&response)
	client.requests = make(chan Message, 1)
	client.requests <- Message{ID: 1, Method: CodexServerRequestItemToolCall}

	if err := client.routeMessage(Message{ID: 2, Method: CodexServerRequestItemToolCall, client: client}); err != nil {
		t.Fatalf("route request overflow: %v", err)
	}
	assertJSONRPCErrorCode(t, response.Bytes(), jsonRPCErrorServerOverloaded)
}

func TestJSONRPCMalformedJSONTerminatesAndReapsProcess(t *testing.T) {
	client := startProtocolFailureClient(t, "malformed-json")
	defer client.Close()

	callClientAndExpectError(t, client, "breakProtocol", "decode codex app-server message")
	requireClientProcessReaped(t, client)
}

func TestJSONRPCNonIntegerResponseIDTerminatesAndReapsProcess(t *testing.T) {
	client := startProtocolFailureClient(t, "non-integer-response-id")
	defer client.Close()

	callClientAndExpectError(t, client, "breakProtocol", "codex response id must be an integer")
	requireClientProcessReaped(t, client)
}

func TestJSONRPCUnknownResponseIDTerminatesAndReapsProcess(t *testing.T) {
	client := startProtocolFailureClient(t, "unknown-response-id")
	defer client.Close()

	callClientAndExpectError(t, client, "breakProtocol", "codex response id has no pending request")
	requireClientProcessReaped(t, client)
}

func TestJSONRPCOversizedLineTerminatesAndReapsProcess(t *testing.T) {
	client := startProtocolFailureClient(t, "oversized-line")
	defer client.Close()

	callClientAndExpectError(t, client, "breakProtocol", "token too long")
	requireClientProcessReaped(t, client)
}

func TestJSONRPCNoisyChildAfterMalformedJSONTerminatesAndReapsProcess(t *testing.T) {
	client := startProtocolFailureClient(t, "noisy-after-malformed-json")
	defer client.Close()

	callClientAndExpectError(t, client, "breakProtocol", "decode codex app-server message")
	requireClientProcessReaped(t, client)
}

func TestJSONRPCProcessCleanupIsIdempotent(t *testing.T) {
	client := startProtocolFailureClient(t, "never-response")
	done := make(chan struct{}, 3)
	for range 3 {
		go func() {
			client.Close()
			done <- struct{}{}
		}()
	}
	for range 3 {
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			t.Fatal("timed out waiting for concurrent client close")
		}
	}
	requireClientProcessReaped(t, client)
}

func TestBoundedBufferKeepsTail(t *testing.T) {
	buffer := newBoundedBuffer(5)
	if _, err := buffer.Write([]byte("abcdef")); err != nil {
		t.Fatalf("write buffer: %v", err)
	}
	got := buffer.String()
	if !strings.Contains(got, "<stderr truncated>") || !strings.HasSuffix(got, "bcdef") {
		t.Fatalf("bounded buffer = %q, want truncated tail", got)
	}
}

func TestCodexAppFakeServer(t *testing.T) {
	mode := os.Getenv("SETTA_CODEXAPP_FAKE")
	if mode == "" {
		return
	}
	runFakeAppServer(mode)
	os.Exit(0)
}

type fakeState struct {
	initCount int
}

func newTestManager(mode string) *Manager {
	return NewManager(ManagerConfig{
		Process:          testProcessConfig(mode),
		InitializeParams: map[string]any{"clientInfo": map[string]any{"name": "test"}},
	})
}

func testProcessConfig(mode string) ProcessConfig {
	return ProcessConfig{
		Args:    []string{"-test.run=TestCodexAppFakeServer", "--"},
		Command: os.Args[0],
		Env:     []string{"SETTA_CODEXAPP_FAKE=" + mode},
	}
}

func protocolFailureProcessConfig(mode string) ProcessConfig {
	config := testProcessConfig(mode)
	config.ShutdownGracePeriod = 25 * time.Millisecond
	config.ShutdownKillPeriod = 2 * time.Second
	return config
}

func startProtocolFailureClient(t *testing.T, mode string) *Client {
	t.Helper()
	client, err := StartProcess(protocolFailureProcessConfig(mode))
	if err != nil {
		t.Fatalf("start client: %v", err)
	}
	return client
}

func callClientAndExpectError(t *testing.T, client *Client, method string, want string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err := client.Call(ctx, method, map[string]any{})
	if err == nil {
		t.Fatalf("%s succeeded, want error containing %q", method, want)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("%s error = %q, want %q", method, err, want)
	}
}

func requireClientProcessReaped(t *testing.T, client *Client) {
	t.Helper()
	select {
	case <-client.Done():
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for client process completion")
	}
	if client.cmd.ProcessState == nil {
		t.Fatal("client process was not waited")
	}
}

func shutdownTestManager(t *testing.T, manager *Manager) {
	t.Helper()
	if err := manager.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown manager: %v", err)
	}
}

func callEcho(t *testing.T, manager *Manager, value string) string {
	t.Helper()
	raw, err := manager.Call(context.Background(), "echo", map[string]any{"value": value})
	if err != nil {
		t.Fatalf("echo: %v", err)
	}
	var response struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		t.Fatalf("decode echo: %v", err)
	}
	return response.Value
}

func waitForManagerState(t *testing.T, manager *Manager, want ManagerState) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		got, _ := manager.State()
		if got == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	got, err := manager.State()
	t.Fatalf("manager state = %s err=%v, want %s", got, err, want)
}

func waitForClientNotification(t *testing.T, client *Client, method string) {
	t.Helper()
	select {
	case message := <-client.Notifications():
		if message.Method != method {
			t.Fatalf("notification method = %q, want %q", message.Method, method)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for notification %s", method)
	}
}

func requireClientPendingCount(t *testing.T, client *Client, want int) {
	t.Helper()
	client.mu.Lock()
	got := len(client.pending)
	client.mu.Unlock()
	if got != want {
		t.Fatalf("pending call count = %d, want %d", got, want)
	}
}

func testResponseClient(buffer io.Writer) *Client {
	return &Client{
		stdin:    nopWriteCloser{Writer: buffer},
		protocol: newLifecycle(),
	}
}

type nopWriteCloser struct {
	io.Writer
}

func (writer nopWriteCloser) Close() error {
	return nil
}

func assertJSONRPCErrorCode(t *testing.T, data []byte, want int) {
	t.Helper()
	var response struct {
		Error *Error `json:"error"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(data), &response); err != nil {
		t.Fatalf("decode json-rpc error response %q: %v", data, err)
	}
	if response.Error == nil {
		t.Fatalf("json-rpc response = %s, want error", data)
	}
	if response.Error.Code != want {
		t.Fatalf("json-rpc error code = %d, want %d", response.Error.Code, want)
	}
}

func readSessionEvent(t *testing.T, session *Session) Event {
	t.Helper()
	select {
	case event, ok := <-session.Events():
		if !ok {
			t.Fatal("session closed before event")
		}
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for session event")
	}
	return Event{}
}

func expectNoSessionEvent(t *testing.T, session *Session) {
	t.Helper()
	select {
	case event, ok := <-session.Events():
		t.Fatalf("unexpected session event = %+v ok=%t", event, ok)
	case <-time.After(100 * time.Millisecond):
	}
}

func rawTestMessage(t *testing.T, value any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw message: %v", err)
	}
	return data
}

func runFakeAppServer(mode string) {
	scanner := bufio.NewScanner(os.Stdin)
	state := fakeState{}
	for scanner.Scan() {
		var message map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			panic(err)
		}
		if handleFakeMessage(mode, &state, message) {
			return
		}
	}
}

func handleFakeMessage(mode string, state *fakeState, message map[string]any) bool {
	switch message["method"] {
	case "initialize":
		state.initCount++
		writeFakeResponse(message["id"], map[string]any{"ok": true})
	case "initialized":
	case "echo":
		params, _ := message["params"].(map[string]any)
		writeFakeResponse(message["id"], map[string]any{"value": params["value"]})
		return mode == "exit-after-echo"
	case "delayedEcho":
		params, _ := message["params"].(map[string]any)
		writeFakeNotification("delayed/received", map[string]any{})
		time.Sleep(50 * time.Millisecond)
		writeFakeResponse(message["id"], map[string]any{"value": params["value"]})
	case "neverEcho":
		writeFakeNotification("never/received", map[string]any{})
	case "initCount":
		writeFakeResponse(message["id"], map[string]any{"count": state.initCount})
	case "notifyThenExit":
		writeFakeResponse(message["id"], map[string]any{"ok": true})
		writeFakeNotification("thread/settings/updated", map[string]any{"threadId": "thread_a"})
		return true
	case "exit":
		return true
	case "breakProtocol":
		writeFakeProtocolFailure(mode)
	default:
		writeFakeResponse(message["id"], map[string]any{})
	}
	return false
}

func writeFakeProtocolFailure(mode string) {
	switch mode {
	case "malformed-json":
		_, _ = os.Stdout.Write([]byte("{not-json\n"))
	case "non-integer-response-id":
		writeFakeMessage(map[string]any{"id": "not-an-int", "result": map[string]any{}})
	case "unknown-response-id":
		writeFakeResponse(999, map[string]any{})
	case "oversized-line":
		_, _ = os.Stdout.Write([]byte(strings.Repeat("x", 17*1024*1024) + "\n"))
	case "noisy-after-malformed-json":
		writeNoisyMalformedProtocolForever()
	}
}

func writeNoisyMalformedProtocolForever() {
	_, _ = os.Stdout.Write([]byte("{not-json\n"))
	payload := []byte(`{"method":"thread/settings/updated","params":{}}` + "\n")
	for {
		if _, err := os.Stdout.Write(payload); err != nil {
			os.Exit(0)
		}
	}
}

func writeFakeResponse(id any, result any) {
	writeFakeMessage(map[string]any{"id": id, "result": result})
}

func writeFakeNotification(method string, params any) {
	writeFakeMessage(map[string]any{"method": method, "params": params})
}

func writeFakeMessage(payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	os.Stdout.Write(append(data, '\n'))
}
