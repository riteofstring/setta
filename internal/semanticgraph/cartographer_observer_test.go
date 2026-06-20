package semanticgraph

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

func TestCartographerObserverClosesWindowOnRunItemBoundary(t *testing.T) {
	service, store := newCartographerObserverTestService(t, CartographerObservationConfig{})
	ctx := context.Background()

	if windows, err := service.ObserveCartographerChatEvent(ctx, cartographerChatEvent(t, 1, chat.EventTypeRunItemCreated, chat.RunItemCreatedPayload{
		Item: cartographerRunItem("run_item_boundary", chat.RunItemTypeCommandExecution, chat.RunItemStatusRunning),
	})); err != nil || len(windows) != 0 {
		t.Fatalf("observe run item created windows=%+v err=%v, want open window only", windows, err)
	}

	windows, err := service.ObserveCartographerChatEvent(ctx, cartographerChatEvent(t, 2, chat.EventTypeRunItemUpdated, chat.RunItemUpdatedPayload{
		Item: cartographerRunItem("run_item_boundary", chat.RunItemTypeCommandExecution, chat.RunItemStatusCompleted),
	}))
	if err != nil {
		t.Fatalf("observe run item completed: %v", err)
	}
	if len(windows) != 1 || windows[0].Status != CartographerWindowClosed {
		t.Fatalf("closed windows = %+v, want one closed window", windows)
	}
	window := windows[0]
	if len(window.InputBundle.NewEvents) != 2 ||
		window.InputBundle.NewEvents[1].CloseReason != CartographerCloseRunItemTerminal ||
		len(window.InputBundle.ToolCalls) != 1 ||
		window.InputBundle.ToolCalls[0].RunItemID != "run_item_boundary" {
		t.Fatalf("window input = %+v, want terminal run item window", window.InputBundle)
	}
	cursor := readObserverCursor(t, store)
	if cursor.LastChatEventSequence != 2 || cursor.LastWindowID != window.ID {
		t.Fatalf("cursor = %+v, want completed chat cursor at window", cursor)
	}
	assertNoSemanticEvents(t, store, ctx)
}

func TestCartographerObserverResumesOpenWindowAfterRestart(t *testing.T) {
	store := newTestStore(t)
	resolver := associationWorkspaceResolver{root: t.TempDir()}
	ctx := context.Background()
	first := newCartographerObserverServiceForStore(t, store, resolver, CartographerObservationConfig{})
	if _, err := first.ObserveCartographerChatEvent(ctx, cartographerChatEvent(t, 1, chat.EventTypeRunItemCreated, chat.RunItemCreatedPayload{
		Item: cartographerRunItem("run_item_resume", chat.RunItemTypeCommandExecution, chat.RunItemStatusRunning),
	})); err != nil {
		t.Fatalf("observe first event: %v", err)
	}

	restarted := newCartographerObserverServiceForStore(t, store, resolver, CartographerObservationConfig{})
	windows, err := restarted.ObserveCartographerChatEvent(ctx, cartographerChatEvent(t, 2, chat.EventTypeRunItemUpdated, chat.RunItemUpdatedPayload{
		Item: cartographerRunItem("run_item_resume", chat.RunItemTypeCommandExecution, chat.RunItemStatusCompleted),
	}))
	if err != nil {
		t.Fatalf("observe after restart: %v", err)
	}
	if len(windows) != 1 || len(windows[0].InputBundle.NewEvents) != 2 {
		t.Fatalf("windows after restart = %+v, want resumed two-event window", windows)
	}
	if windows[0].InputBundle.ObservedEventRefs[0] != "chat_events:001" || windows[0].InputBundle.ObservedEventRefs[1] != "chat_events:002" {
		t.Fatalf("observed refs = %+v, want resumed refs without rereading the run", windows[0].InputBundle.ObservedEventRefs)
	}
}

func TestCartographerObserverSummarizesLargeOpenWindowDeterministically(t *testing.T) {
	service, store := newCartographerObserverTestService(t, CartographerObservationConfig{
		MaxWindowEvents:         2,
		MaxWindowContentBytes:   80,
		AssistantThresholdBytes: 1000,
		OutputThresholdBytes:    1000,
	})
	ctx := context.Background()

	events := []chat.Event{
		cartographerChatEvent(t, 1, chat.EventTypeRunItemCreated, chat.RunItemCreatedPayload{Item: cartographerRunItem("run_item_large", chat.RunItemTypeCommandExecution, chat.RunItemStatusRunning)}),
		cartographerChatEvent(t, 2, chat.EventTypeAssistantTextDelta, chat.AssistantTextDeltaPayload{MessageID: "message_assistant", PartID: "part_1", Delta: "first chunk", UpdatedAt: testTimestamp(40)}),
		cartographerChatEvent(t, 3, chat.EventTypeRunItemOutputDelta, chat.RunItemOutputDeltaPayload{Output: chat.RunItemOutput{SchemaVersion: chat.SchemaVersion, ID: "output_001", RunItemID: "run_item_large", Stream: "stdout", Ordinal: 1, Text: "small output", CreatedAt: testTimestamp(41)}}),
	}
	for _, event := range events {
		if windows, err := service.ObserveCartographerChatEvent(ctx, event); err != nil || len(windows) != 0 {
			t.Fatalf("observe event %s windows=%+v err=%v, want open summarized window", event.EventID, windows, err)
		}
	}

	cursor := readObserverCursor(t, store)
	open, ok, err := store.ReadOpenCartographerWindowForCursor(ctx, testWorkspaceID, cursor.ID)
	if err != nil {
		t.Fatalf("read open window: %v", err)
	}
	if !ok {
		t.Fatal("open cartographer window not found")
	}
	if len(open.InputBundle.NewEvents) != 2 ||
		!open.InputBundle.Truncation.Summarized ||
		!strings.Contains(open.InputBundle.Truncation.DeterministicSummary, "summarized 1 earlier event") {
		t.Fatalf("open input truncation = %+v, events=%+v", open.InputBundle.Truncation, open.InputBundle.NewEvents)
	}
}

func TestCartographerObserverProcessesLongRunIncrementallyWithPriorSummaries(t *testing.T) {
	service, _ := newCartographerObserverTestService(t, CartographerObservationConfig{
		MaxWindowEvents:         10,
		MaxWindowContentBytes:   200,
		AssistantThresholdBytes: 1000,
		OutputThresholdBytes:    10,
		PriorSummaryLimit:       4,
	})
	ctx := context.Background()

	first, err := service.ObserveCartographerChatEvent(ctx, cartographerChatEvent(t, 1, chat.EventTypeRunItemOutputDelta, chat.RunItemOutputDeltaPayload{
		Output: chat.RunItemOutput{SchemaVersion: chat.SchemaVersion, ID: "output_a", RunItemID: "run_item_long_a", Stream: "stdout", Ordinal: 1, Text: "12345678901", CreatedAt: testTimestamp(42)},
	}))
	if err != nil {
		t.Fatalf("observe first output: %v", err)
	}
	if len(first) != 1 || first[0].InputBundle.TrajectorySummaries == nil {
		t.Fatalf("first threshold windows = %+v, want first closed window", first)
	}
	second, err := service.ObserveCartographerChatEvent(ctx, cartographerChatEvent(t, 2, chat.EventTypeRunItemOutputDelta, chat.RunItemOutputDeltaPayload{
		Output: chat.RunItemOutput{SchemaVersion: chat.SchemaVersion, ID: "output_b", RunItemID: "run_item_long_b", Stream: "stdout", Ordinal: 1, Text: "abcdefghijk", CreatedAt: testTimestamp(43)},
	}))
	if err != nil {
		t.Fatalf("observe second output: %v", err)
	}
	if len(second) != 1 {
		t.Fatalf("second threshold windows = %+v, want one closed window", second)
	}
	if len(second[0].InputBundle.NewEvents) != 1 || second[0].InputBundle.NewEvents[0].EventID != "chat_events:002" {
		t.Fatalf("second window events = %+v, want only new event since cursor", second[0].InputBundle.NewEvents)
	}
	if len(second[0].InputBundle.TrajectorySummaries) != 1 || second[0].InputBundle.TrajectorySummaries[0].WindowID != first[0].ID {
		t.Fatalf("second prior summaries = %+v, want prior window summary", second[0].InputBundle.TrajectorySummaries)
	}
}

func TestCartographerObserverClosesQuietWindow(t *testing.T) {
	service, _ := newCartographerObserverTestService(t, CartographerObservationConfig{})
	ctx := context.Background()
	if _, err := service.ObserveCartographerChatEvent(ctx, cartographerChatEvent(t, 1, chat.EventTypeRunItemCreated, chat.RunItemCreatedPayload{
		Item: cartographerRunItem("run_item_quiet", chat.RunItemTypeCommandExecution, chat.RunItemStatusRunning),
	})); err != nil {
		t.Fatalf("observe open event: %v", err)
	}
	windows, err := service.CloseQuietCartographerWindows(ctx, testTimestamp(99))
	if err != nil {
		t.Fatalf("close quiet windows: %v", err)
	}
	if len(windows) != 1 || windows[0].InputBundle.NewEvents[len(windows[0].InputBundle.NewEvents)-1].CloseReason != CartographerCloseQuietPeriod {
		t.Fatalf("quiet windows = %+v, want quiet close reason", windows)
	}
}

func TestManualCartographerWindowBuildsCurrentProgressWithoutSemanticMutation(t *testing.T) {
	service, store := newCartographerObserverTestService(t, CartographerObservationConfig{})
	ctx := context.Background()
	window, err := service.BuildManualCartographerWindow(ctx, CartographerManualWindowRequest{
		WorkspaceID:    testWorkspaceID,
		TargetEntityID: "node_manual_target",
		Summary:        "Review current semantic target progress.",
	})
	if err != nil {
		t.Fatalf("build manual cartographer window: %v", err)
	}
	if window.Status != CartographerWindowClosed ||
		window.SourceKind != CartographerSourceSemanticTarget ||
		window.InputBundle.NewEvents[0].CloseReason != CartographerCloseManual {
		t.Fatalf("manual window = %+v, want closed semantic target manual window", window)
	}
	assertNoSemanticEvents(t, store, ctx)
}

func newCartographerObserverTestService(t *testing.T, config CartographerObservationConfig) (*Service, *Store) {
	t.Helper()
	store := newTestStore(t)
	service := newCartographerObserverServiceForStore(t, store, associationWorkspaceResolver{root: t.TempDir()}, config)
	return service, store
}

func newCartographerObserverServiceForStore(t *testing.T, store *Store, resolver associationWorkspaceResolver, config CartographerObservationConfig) *Service {
	t.Helper()
	service, err := NewService(
		store,
		resolver,
		WithIDGenerator(countingIDGenerator()),
		WithClock(fixedCartographerObserverClock()),
		WithChatSourceResolver(fakeChatResolver{conversation: cartographerWorkflowConversation()}),
		WithWorkflowSourceResolver(fakeWorkflowResolver{execution: cartographerWorkflowExecution()}),
		WithCartographerObservationConfig(config),
	)
	if err != nil {
		t.Fatalf("new cartographer observer service: %v", err)
	}
	return service
}

func cartographerChatEvent(t *testing.T, sequence int, eventType string, payload any) chat.Event {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal chat payload: %v", err)
	}
	return chat.Event{
		SchemaVersion:  chat.EventSchemaVersion,
		StreamID:       "chat_events",
		Sequence:       sequence,
		EventID:        "chat_events:" + threeDigit(sequence),
		Type:           eventType,
		EmittedAt:      testTimestamp(40 + sequence),
		WorkspaceID:    testWorkspaceID,
		ConversationID: "chat_conversation_cartographer",
		RunID:          "chat_run_cartographer",
		Payload:        raw,
	}
}

func cartographerRunItem(id string, itemType chat.RunItemType, status chat.RunItemStatus) chat.RunItem {
	return chat.RunItem{
		SchemaVersion:  chat.SchemaVersion,
		ID:             id,
		WorkspaceID:    testWorkspaceID,
		ConversationID: "chat_conversation_cartographer",
		RunID:          "chat_run_cartographer",
		Type:           itemType,
		Status:         status,
		CreatedAt:      testTimestamp(40),
		StartedAt:      testTimestamp(41),
		CompletedAt:    testTimestamp(42),
		Title:          "Run item " + id,
		Summary:        "Executed focused check",
		Command:        "./scripts/go.sh test ./internal/semanticgraph",
		Cwd:            "/workspace",
		Result:         "ok",
		DiffSummary:    "No file changes",
	}
}

func cartographerWorkflowConversation() chat.Conversation {
	return chat.Conversation{
		SchemaVersion: chat.SchemaVersion,
		ID:            "chat_conversation_cartographer",
		WorkspaceID:   testWorkspaceID,
		Title:         "Workflow agent",
		Internal:      true,
		Workflow: &chat.ConversationWorkflowMetadata{
			DefinitionID:        "workflow_definition_cartographer",
			DefinitionVersionID: "workflow_version_cartographer",
			ExecutionID:         "workflow_execution_cartographer",
			NodeID:              "workflow_node_cartographer",
			NodeExecutionID:     "workflow_node_execution_cartographer",
		},
	}
}

func cartographerWorkflowExecution() orchestrator.WorkflowExecution {
	actionKind := orchestrator.ActionKindAgentCodex
	return orchestrator.WorkflowExecution{
		SchemaVersion:       orchestrator.SchemaVersion,
		ID:                  "workflow_execution_cartographer",
		WorkspaceID:         testWorkspaceID,
		DefinitionID:        "workflow_definition_cartographer",
		DefinitionVersionID: "workflow_version_cartographer",
		Status:              orchestrator.ExecutionStatusRunning,
		NodeExecutions: []orchestrator.WorkflowNodeExecution{{
			SchemaVersion: orchestrator.SchemaVersion,
			ID:            "workflow_node_execution_cartographer",
			ExecutionID:   "workflow_execution_cartographer",
			NodeID:        "workflow_node_cartographer",
			Status:        orchestrator.NodeExecutionStatusRunning,
			ActionKind:    &actionKind,
			RunnerKind:    &actionKind,
			RunnerRefs: []orchestrator.WorkflowActionRunnerRef{
				{Kind: orchestrator.RunnerRefChatConversation, ID: "chat_conversation_cartographer"},
				{Kind: orchestrator.RunnerRefChatRun, ID: "chat_run_cartographer"},
			},
		}},
	}
}

func readObserverCursor(t *testing.T, store *Store) CartographerCursor {
	t.Helper()
	cursor, ok, err := store.ReadCartographerCursor(context.Background(), CartographerCursorKey{
		WorkspaceID:             testWorkspaceID,
		WorkflowExecutionID:     "workflow_execution_cartographer",
		WorkflowNodeExecutionID: "workflow_node_execution_cartographer",
		ChatConversationID:      "chat_conversation_cartographer",
		ChatRunID:               "chat_run_cartographer",
	})
	if err != nil {
		t.Fatalf("read observer cursor: %v", err)
	}
	if !ok {
		t.Fatal("observer cursor not found")
	}
	return cursor
}

func fixedCartographerObserverClock() func() time.Time {
	now, err := time.Parse(time.RFC3339Nano, testTimestamp(50))
	if err != nil {
		panic(err)
	}
	return func() time.Time { return now }
}
