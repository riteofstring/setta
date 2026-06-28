package chat

import (
	"encoding/json"
	"testing"
	"time"
)

// recoveryClockTimestamp matches the fixed clock newTestService installs, so
// recovery stamps lost terminals with this value.
const recoveryClockTimestamp = "2026-05-29T20:00:00Z"

func seedRecoveryConversation(t *testing.T, store *Store) {
	t.Helper()
	conversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "conversation_chat",
		WorkspaceID:   "workspace_api",
		Title:         "Chat",
		CreatedAt:     "2026-05-29T18:00:00Z",
		UpdatedAt:     "2026-05-29T18:00:00Z",
	}
	if err := store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
}

func seedBackgroundTerminal(t *testing.T, store *Store, id string, status BackgroundTerminalStatus) {
	t.Helper()
	process := testBackgroundTerminalProcess(id)
	process.Status = status
	process.StartedAt = "2026-05-29T19:00:00Z"
	process.UpdatedAt = "2026-05-29T19:00:00Z"
	if backgroundTerminalStatusIsTerminal(status) {
		process.CompletedAt = "2026-05-29T19:30:00Z"
	}
	if err := store.SaveBackgroundTerminalProcess(process); err != nil {
		t.Fatalf("seed terminal %s: %v", id, err)
	}
}

// TestServiceRecoversRunningBackgroundTerminalsAsLost proves the Phase 1 startup rule: persisted
// running and terminating terminals become lost (a connection-scoped provider handle cannot
// survive a restart), while already-terminal terminals are left untouched.
func TestServiceRecoversRunningBackgroundTerminalsAsLost(t *testing.T) {
	dir := t.TempDir()
	store := mustStore(t, dir)
	seedRecoveryConversation(t, store)
	seedBackgroundTerminal(t, store, "bgproc_running", BackgroundTerminalRunning)
	seedBackgroundTerminal(t, store, "bgproc_terminating", BackgroundTerminalTerminating)
	seedBackgroundTerminal(t, store, "bgproc_exited", BackgroundTerminalExited)
	seedBackgroundTerminal(t, store, "bgproc_lost", BackgroundTerminalLost)

	// Constructing the service runs startup recovery over the seeded state.
	service := newTestService(t, dir, testResolver(t), NewScriptedWorkflowHarness())

	assertLostOnRestart := func(id string) {
		t.Helper()
		process, err := service.store.LoadBackgroundTerminalProcess("workspace_api", "conversation_chat", id)
		if err != nil {
			t.Fatalf("load %s: %v", id, err)
		}
		if process.Status != BackgroundTerminalLost {
			t.Fatalf("%s status = %s, want lost", id, process.Status)
		}
		if process.Error != backgroundTerminalLostOnRestartReason {
			t.Fatalf("%s error = %q, want restart reason", id, process.Error)
		}
		if process.CompletedAt != recoveryClockTimestamp || process.UpdatedAt != recoveryClockTimestamp {
			t.Fatalf("%s timestamps not stamped by recovery clock: updatedAt=%q completedAt=%q", id, process.UpdatedAt, process.CompletedAt)
		}
	}
	assertLostOnRestart("bgproc_running")
	assertLostOnRestart("bgproc_terminating")

	exited, err := service.store.LoadBackgroundTerminalProcess("workspace_api", "conversation_chat", "bgproc_exited")
	if err != nil {
		t.Fatalf("load exited: %v", err)
	}
	if exited.Status != BackgroundTerminalExited || exited.Error != "" || exited.CompletedAt != "2026-05-29T19:30:00Z" {
		t.Fatalf("exited terminal was modified by recovery: %+v", exited)
	}

	lost, err := service.store.LoadBackgroundTerminalProcess("workspace_api", "conversation_chat", "bgproc_lost")
	if err != nil {
		t.Fatalf("load lost: %v", err)
	}
	if lost.CompletedAt != "2026-05-29T19:30:00Z" {
		t.Fatalf("already-lost terminal completedAt changed: %+v", lost)
	}
}

func TestServiceRecoveryPublishesBackgroundTerminalsReplaced(t *testing.T) {
	dir := t.TempDir()
	store := mustStore(t, dir)
	seedRecoveryConversation(t, store)
	seedBackgroundTerminal(t, store, "bgproc_running", BackgroundTerminalRunning)
	seedBackgroundTerminal(t, store, "bgproc_terminating", BackgroundTerminalTerminating)
	seedBackgroundTerminal(t, store, "bgproc_exited", BackgroundTerminalExited)

	events, err := NewEventHub(
		"event_stream_background_terminal_recovery",
		WithEventBufferSize(8),
		WithEventClock(func() time.Time {
			return mustTime(t, "2026-05-29T20:00:00Z")
		}),
	)
	if err != nil {
		t.Fatalf("new event hub: %v", err)
	}
	service, err := NewService(
		mustStore(t, dir),
		testResolver(t),
		NewScriptedWorkflowHarness(),
		WithClock(func() time.Time {
			return mustTime(t, "2026-05-29T20:00:00Z")
		}),
		WithEventHub(events),
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()

	event := receiveEventsUntil(t, subscription, func(event Event) bool {
		return event.Type == EventTypeBackgroundTerminalsReplaced
	})[0]
	var payload BackgroundTerminalsReplacedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode replaced payload: %v", err)
	}
	if len(payload.Terminals) != 3 {
		t.Fatalf("replaced terminals = %+v, want all conversation terminals", payload.Terminals)
	}
	statusByID := map[string]BackgroundTerminalStatus{}
	for _, process := range payload.Terminals {
		statusByID[process.ID] = process.Status
	}
	if statusByID["bgproc_running"] != BackgroundTerminalLost ||
		statusByID["bgproc_terminating"] != BackgroundTerminalLost ||
		statusByID["bgproc_exited"] != BackgroundTerminalExited {
		t.Fatalf("replaced terminal statuses = %+v", statusByID)
	}
}
