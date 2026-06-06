package codexapp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
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
	waitForManagerState(t, manager, ManagerStateStopped)
	if value := callEcho(t, manager, "second"); value != "second" {
		t.Fatalf("second echo = %q", value)
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

func TestManagerSessionDeliveryDoesNotBlockWhenBufferIsFull(t *testing.T) {
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

	done := make(chan struct{})
	go func() {
		manager.dispatchNotification(Message{
			Method: "thread/settings/updated",
			Params: rawTestMessage(t, map[string]any{"threadId": "thread_a"}),
		})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("dispatch blocked on full session buffer")
	}
}

func TestManagerLifecycleDeliveryClosesFullSession(t *testing.T) {
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
	waitForSessionClosed(t, session)
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

func waitForSessionClosed(t *testing.T, session *Session) {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case _, ok := <-session.Events():
			if !ok {
				return
			}
		case <-deadline:
			t.Fatal("timed out waiting for session close")
		}
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
	case "exit":
		return true
	default:
		writeFakeResponse(message["id"], map[string]any{})
	}
	return false
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
