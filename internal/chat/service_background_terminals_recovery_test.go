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

func TestServiceRecoveryPromotesInterruptedStartupBeforeFailingRun(t *testing.T) {
	dir := t.TempDir()
	store := mustStore(t, dir)
	seedInterruptedBackgroundTerminalRun(t, store)

	service := newTestService(t, dir, testResolver(t), NewFakeHarness(nil))

	assertInterruptedStartupRecoveredAsLostBackgroundTerminal(t, service)
}

func assertInterruptedStartupRecoveredAsLostBackgroundTerminal(t *testing.T, service *Service) {
	t.Helper()
	assertRecoveredBackgroundTerminalProcess(t, service)
	assertRecoveredBackgroundTerminalTranscript(t, service)
	assertRecoveredBackgroundTerminalSourceItem(t, service)
	assertRecoveredBackgroundTerminalActivityPage(t, service)
}

func assertRecoveredBackgroundTerminalProcess(t *testing.T, service *Service) {
	t.Helper()
	processes, err := service.store.ListBackgroundTerminalProcesses("workspace_api", "conversation_chat")
	if err != nil {
		t.Fatalf("list background terminals: %v", err)
	}
	if len(processes) != 1 {
		t.Fatalf("background terminals = %+v, want recovered terminal", processes)
	}
	process := processes[0]
	if process.ProviderItemID != "bg_item_recovery" || process.Status != BackgroundTerminalLost {
		t.Fatalf("recovered process = %+v, want lost promoted startup", process)
	}
	if process.CompletedAt != recoveryClockTimestamp || process.Error != backgroundTerminalLostOnRestartReason {
		t.Fatalf("recovered process terminal fields = %+v, want lost-on-restart stamp", process)
	}
	if len(process.RecentOutput) != 1 || process.RecentOutput[0] != "booted" {
		t.Fatalf("recovered process output summary = %+v, want copied pre-crash output", process.RecentOutput)
	}
}

func assertRecoveredBackgroundTerminalTranscript(t *testing.T, service *Service) {
	t.Helper()
	blocks, err := service.store.LoadTranscriptBlocks("workspace_api", "run_interrupted_bg")
	if err != nil {
		t.Fatalf("load transcript blocks: %v", err)
	}
	if markers := countBackgroundTerminalMarkerBlocks(blocks, "npm run dev"); markers != 1 {
		t.Fatalf("recovered marker blocks = %d, want 1: %v", markers, blockKinds(blocks))
	}
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindActivityItem {
			t.Fatalf("recovered promoted terminal left activity block: %+v", block)
		}
	}
}

func assertRecoveredBackgroundTerminalSourceItem(t *testing.T, service *Service) {
	t.Helper()
	item, exists, err := service.store.FindRunItemByProviderID("workspace_api", "run_interrupted_bg", "bg_item_recovery")
	if err != nil || !exists {
		t.Fatalf("load recovered source item exists=%v err=%v", exists, err)
	}
	if item.Status != RunItemStatusCompleted || item.CompletedAt == "" {
		t.Fatalf("recovered source item = %+v, want terminally marked promoted item", item)
	}
}

func assertRecoveredBackgroundTerminalActivityPage(t *testing.T, service *Service) {
	t.Helper()
	activityPage, err := service.LoadRunActivityPage("workspace_api", "run_interrupted_bg", "", 20)
	if err != nil {
		t.Fatalf("load recovered activity page: %v", err)
	}
	if len(activityPage.Items) != 0 || len(activityPage.Output) != 0 || len(activityPage.Activity) != 0 {
		t.Fatalf("recovered promoted terminal leaked into activity page: items=%+v output=%+v activity=%+v", activityPage.Items, activityPage.Output, activityPage.Activity)
	}
}

func seedInterruptedBackgroundTerminalRun(t *testing.T, store *Store) {
	t.Helper()
	seedRecoveryConversation(t, store)
	if err := store.SaveMessage("workspace_api", ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_recovery_user",
		ConversationID: "conversation_chat",
		RunID:          "run_interrupted_bg",
		Role:           RoleUser,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        1,
		CreatedAt:      "2026-05-29T19:00:00Z",
		UpdatedAt:      "2026-05-29T19:00:00Z",
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			ID:   "part_recovery_user",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   "start dev server",
				Format: TextFormatPlain,
			},
		}},
	}); err != nil {
		t.Fatalf("save user message: %v", err)
	}
	if err := store.SaveMessage("workspace_api", ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_recovery_assistant",
		ConversationID: "conversation_chat",
		RunID:          "run_interrupted_bg",
		Role:           RoleAssistant,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        2,
		CreatedAt:      "2026-05-29T19:00:00Z",
		UpdatedAt:      "2026-05-29T19:00:00Z",
		Status:         MessageStatusStreaming,
		Parts: []MessagePart{{
			ID:   "part_recovery_assistant",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   "",
				Format: TextFormatMarkdown,
			},
		}},
	}); err != nil {
		t.Fatalf("save assistant message: %v", err)
	}
	if err := store.SaveRun(Run{
		SchemaVersion:      SchemaVersion,
		ID:                 "run_interrupted_bg",
		WorkspaceID:        "workspace_api",
		ConversationID:     "conversation_chat",
		TriggerMessageID:   "message_recovery_user",
		AssistantMessageID: "message_recovery_assistant",
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          "2026-05-29T19:00:00Z",
		PromptSummary:      "start dev server",
	}); err != nil {
		t.Fatalf("save run: %v", err)
	}
	source := RunItemCommandSourceUnifiedExecStartup
	if err := store.SaveRunItem(RunItem{
		SchemaVersion:  SchemaVersion,
		ID:             "run_item_recovery_bg",
		WorkspaceID:    "workspace_api",
		ConversationID: "conversation_chat",
		RunID:          "run_interrupted_bg",
		ProviderItemID: "bg_item_recovery",
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		CreatedAt:      "2026-05-29T19:00:00Z",
		Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
			Command:   "npm run dev",
			Cwd:       "/tmp/workspace",
			ProcessID: "proc_recovery_bg",
			Source:    &source,
		}),
	}); err != nil {
		t.Fatalf("save run item: %v", err)
	}
	if err := store.SaveRunItemOutput("workspace_api", "run_interrupted_bg", RunItemOutput{
		SchemaVersion: SchemaVersion,
		ID:            "run_item_output_recovery_bg",
		RunItemID:     "run_item_recovery_bg",
		Stream:        "stdout",
		Ordinal:       1,
		Text:          "booted\n",
		CreatedAt:     "2026-05-29T19:00:01Z",
	}); err != nil {
		t.Fatalf("save run item output: %v", err)
	}
	if err := store.SaveTranscriptBlock("workspace_api", "run_interrupted_bg", TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               "transcript_block_recovery_bg",
		ConversationID:   "conversation_chat",
		RunID:            "run_interrupted_bg",
		Kind:             TranscriptBlockKindActivityItem,
		Ordinal:          1,
		RunAnchorOrdinal: 1,
		Status:           TranscriptBlockStatusStreaming,
		CreatedAt:        "2026-05-29T19:00:00Z",
		UpdatedAt:        "2026-05-29T19:00:00Z",
		Activity: &ActivityItemBlockProjection{
			SourceRunItemID: "run_item_recovery_bg",
			Type:            RunItemTypeCommandExecution,
			Status:          RunItemStatusRunning,
			HasDetails:      true,
			HasOutput:       true,
			Details: RunActivityDetailsProjection{
				Command:   "npm run dev",
				Cwd:       "/tmp/workspace",
				ProcessID: "proc_recovery_bg",
				CommandExecution: &RunItemCommandExecutionDetails{
					Command:   "npm run dev",
					Cwd:       "/tmp/workspace",
					ProcessID: "proc_recovery_bg",
					Source:    &source,
				},
			},
		},
	}); err != nil {
		t.Fatalf("save transcript block: %v", err)
	}
}
