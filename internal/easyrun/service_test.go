package easyrun

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/workspace"
)

func TestServiceReadSnapshotReturnsEmptySnapshotWithCurrentCursor(t *testing.T) {
	service := newTestService(t)

	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}

	if snapshot.LatestRun != nil {
		t.Fatalf("latest run = %+v, want nil", snapshot.LatestRun)
	}
	if len(snapshot.Highlights) != 0 || len(snapshot.Artifacts) != 0 {
		t.Fatalf("snapshot rails = %d highlights, %d artifacts; want empty", len(snapshot.Highlights), len(snapshot.Artifacts))
	}
	if snapshot.EventStreamCursor.StreamID != EasyRunEventStreamID || snapshot.EventStreamCursor.Sequence != 0 {
		t.Fatalf("snapshot cursor = %+v, want %s:0", snapshot.EventStreamCursor, EasyRunEventStreamID)
	}
}

func TestEventSubscriptionReplaysAfterCursorAndRequestsResyncWhenRetainedEventsAreGone(t *testing.T) {
	events, err := NewEventHub(EasyRunEventStreamID, WithEventBufferSize(1), WithEventClock(func() time.Time {
		return time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
	}))
	if err != nil {
		t.Fatalf("create event hub: %v", err)
	}
	first, err := events.Publish(NewRunUpdatedEvent(testRun("run_first")))
	if err != nil {
		t.Fatalf("publish first event: %v", err)
	}
	second, err := events.Publish(NewRunUpdatedEvent(testRun("run_second")))
	if err != nil {
		t.Fatalf("publish second event: %v", err)
	}

	subscription, err := events.Subscribe(EasyRunEventCursor{
		Sequence: first.Sequence,
		StreamID: first.StreamID,
	})
	if err != nil {
		t.Fatalf("subscribe after first: %v", err)
	}
	defer subscription.Unsubscribe()
	replayed := <-subscription.Events
	if replayed.EventID != second.EventID {
		t.Fatalf("replayed event = %+v, want %s", replayed, second.EventID)
	}

	stale, err := events.Subscribe(EasyRunEventCursor{
		Sequence: 0,
		StreamID: EasyRunEventStreamID,
	})
	if err != nil {
		t.Fatalf("subscribe stale: %v", err)
	}
	defer stale.Unsubscribe()
	resync := <-stale.Events
	if resync.Type != EasyRunEventTypeResyncRequired || resync.ResyncRequired == nil {
		t.Fatalf("stale event = %+v, want resync required", resync)
	}
	if resync.ResyncRequired.CurrentSequence != second.Sequence || resync.ResyncRequired.EarliestSequence != second.Sequence {
		t.Fatalf("resync payload = %+v, want current and earliest at second sequence", resync.ResyncRequired)
	}
}

func TestEventSubscriptionRequestsResyncWhenStreamIDChanges(t *testing.T) {
	events, err := NewEventHub(EasyRunEventStreamID+"_restarted", WithEventClock(func() time.Time {
		return time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
	}))
	if err != nil {
		t.Fatalf("create event hub: %v", err)
	}
	current, err := events.Publish(NewRunUpdatedEvent(testRun("run_recovered")))
	if err != nil {
		t.Fatalf("publish current event: %v", err)
	}

	subscription, err := events.Subscribe(EasyRunEventCursor{
		Sequence: 1,
		StreamID: EasyRunEventStreamID,
	})
	if err != nil {
		t.Fatalf("subscribe with old stream cursor: %v", err)
	}
	defer subscription.Unsubscribe()
	resync := requireEasyRunEvent(t, subscription)
	if resync.Type != EasyRunEventTypeResyncRequired || resync.ResyncRequired == nil {
		t.Fatalf("stream mismatch event = %+v, want resync required", resync)
	}
	if resync.StreamID != current.StreamID ||
		resync.ResyncRequired.CurrentStreamID != current.StreamID ||
		resync.ResyncRequired.CurrentSequence != current.Sequence ||
		resync.ResyncRequired.RequestedStreamID != EasyRunEventStreamID {
		t.Fatalf("stream mismatch resync = %+v, current = %+v", resync, current)
	}
}

func TestServiceStartCreatesHiddenEasyRunAndProjectsTerminalChatRun(t *testing.T) {
	service, chatService := newTestServiceWithChat(t, chat.NewFakeHarness(nil))
	subscription, err := service.SubscribeEvents(EasyRunEventCursor{})
	if err != nil {
		t.Fatalf("subscribe easy-run events: %v", err)
	}
	defer subscription.Unsubscribe()

	run, err := service.Start("workspace_api", "build the easy button")
	if err != nil {
		t.Fatalf("start easy-run: %v", err)
	}
	assertStartedEasyRun(t, run, "build the easy button")

	workingEvent := requireEasyRunEvent(t, subscription)
	assertWorkingRunEvent(t, workingEvent)

	completed := waitForEasyRunStatus(t, service, "workspace_api", run.ID, EasyRunStatusCompleted)
	assertCompletedEasyRun(t, completed)

	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}
	assertEasyRunSnapshotWithEmptyRails(t, snapshot, completed.ID)

	page, err := chatService.LoadMessagePage("workspace_api", completed.ConversationID, 0, 20)
	if err != nil {
		t.Fatalf("load hidden message page: %v", err)
	}
	assertHiddenEasyRunConversation(t, page.Conversation, run.ID)
	publicList, err := chatService.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list public conversations: %v", err)
	}
	assertNoPublicConversations(t, publicList.Conversations)
}

func TestServiceStopCancelsBackingRunAndProjectsStoppedStatus(t *testing.T) {
	harness := chat.NewFakeHarnessByPrompt(map[string][]chat.FakeHarnessEvent{
		"wait for stop": {
			{Type: chat.FakeEventAssistantDelta, Text: "waiting"},
			{Type: chat.FakeEventWaitForCancel},
		},
	})
	service, _ := newTestServiceWithChat(t, harness)

	run, err := service.Start("workspace_api", "wait for stop")
	if err != nil {
		t.Fatalf("start easy-run: %v", err)
	}
	working := waitForEasyRunStatus(t, service, "workspace_api", run.ID, EasyRunStatusWorking)

	stopped, err := service.Stop("workspace_api", working.ID)
	if err != nil {
		t.Fatalf("stop easy-run: %v", err)
	}
	if stopped.Status != EasyRunStatusStopped {
		stopped = waitForEasyRunStatus(t, service, "workspace_api", run.ID, EasyRunStatusStopped)
	}
	if stopped.Summary == nil ||
		!strings.Contains(*stopped.Summary, "Stopped after") ||
		!strings.Contains(*stopped.Summary, "no artifacts") ||
		stopped.Error != nil ||
		stopped.ActiveAgentCount != 0 {
		t.Fatalf("stopped run = %+v, want stopped summary without error", stopped)
	}
}

func TestServiceSteerForwardsTextToBackingHiddenRun(t *testing.T) {
	harness := chat.NewFakeHarnessByPrompt(map[string][]chat.FakeHarnessEvent{
		"wait for steering": {
			{
				Type:      chat.FakeEventThreadLinked,
				ThreadID:  "thread_easy",
				SessionID: "session_easy",
				TurnID:    "turn_easy",
			},
			{Type: chat.FakeEventWaitForSteer},
			{Type: chat.FakeEventAssistantDelta, Text: "steered"},
		},
	})
	service, chatService := newTestServiceWithChat(t, harness)

	started, err := service.Start("workspace_api", "wait for steering")
	if err != nil {
		t.Fatalf("start easy-run: %v", err)
	}
	working := waitForEasyRunStatus(t, service, "workspace_api", started.ID, EasyRunStatusWorking)
	waitForEasyRunHarnessRef(t, chatService, "workspace_api", working.ConversationID, "turn_easy")

	steered, err := service.Steer("workspace_api", "  keep going  ")
	if err != nil {
		t.Fatalf("steer easy-run: %v", err)
	}
	if steered.ID != working.ID || steered.Status != EasyRunStatusWorking {
		t.Fatalf("steered run = %+v, want current working run %s", steered, working.ID)
	}
	requests := harness.SteeringRequests()
	if len(requests) != 1 || chatInputTextForTest(requests[0].Input) != "keep going" || requests[0].RunID == "" {
		t.Fatalf("steering requests = %+v, want trimmed text for backing run", requests)
	}
	completed := waitForEasyRunStatus(t, service, "workspace_api", started.ID, EasyRunStatusCompleted)
	assertCompletedEasyRun(t, completed)

	page, err := chatService.LoadMessagePage("workspace_api", completed.ConversationID, 0, 20)
	if err != nil {
		t.Fatalf("load hidden message page: %v", err)
	}
	assertHiddenEasyRunConversation(t, page.Conversation, started.ID)
}

func TestServiceSteerRejectsWithoutActiveRun(t *testing.T) {
	service, _ := newTestServiceWithChat(t, chat.NewFakeHarness(nil))

	_, err := service.Steer("workspace_api", "keep going")
	if err == nil || !strings.Contains(err.Error(), "no active easy-run") {
		t.Fatalf("steer without active run error = %v, want active-run rejection", err)
	}

	_, err = service.Steer("workspace_api", "   ")
	if err == nil || !strings.Contains(err.Error(), "steering text is required") {
		t.Fatalf("empty steering error = %v, want text validation", err)
	}
}

func TestEmitArtifactToolPersistsAndPublishesTypedArtifact(t *testing.T) {
	service, store := newTestServiceWithStore(t)
	run := testRun("easy_run_artifact")
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_artifact",
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}
	subscription, err := service.SubscribeEvents(EasyRunEventCursor{})
	if err != nil {
		t.Fatalf("subscribe easy-run events: %v", err)
	}
	defer subscription.Unsubscribe()

	tool := NewEmitArtifactAgentTool(service)
	result, err := tool.Handler(easyRunToolContext(run, "run_artifact"), chat.AgentToolCall{
		Arguments: []byte(`{"kind":"markdown","title":"Report","kicker":"Summary","markdown":"## Done"}`),
		CallID:    "call_artifact",
		Namespace: chat.SettaAgentToolNamespace,
		Tool:      chat.SettaEmitArtifactAgentToolName,
	})
	if err != nil {
		t.Fatalf("emit artifact: %v", err)
	}
	if !result.Success || len(result.ContentItems) != 1 || !strings.Contains(result.ContentItems[0].Text, `"artifactId":"artifact_0001"`) {
		t.Fatalf("tool result = %+v, want artifact acknowledgement", result)
	}

	event := requireEasyRunEvent(t, subscription)
	if event.Type != EasyRunEventTypeArtifactCreated ||
		event.ArtifactCreated == nil ||
		event.ArtifactCreated.Artifact.Kind != EasyArtifactKindMarkdown ||
		event.ArtifactCreated.Artifact.Ordinal != 1 {
		t.Fatalf("artifact event = %+v, want markdown artifact.created", event)
	}
	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.ArtifactCount != 1 {
		t.Fatalf("snapshot run = %+v, want artifact count 1", snapshot.LatestRun)
	}
	if len(snapshot.Artifacts) != 1 ||
		snapshot.Artifacts[0].Title != "Report" ||
		snapshot.Artifacts[0].Markdown == nil ||
		snapshot.Artifacts[0].Markdown.Markdown != "## Done" {
		t.Fatalf("snapshot artifacts = %+v, want persisted markdown artifact", snapshot.Artifacts)
	}
}

func TestRecordNarratorHighlightsPersistsPublishesAndSnapshotsTypedHighlights(t *testing.T) {
	service, store := newTestServiceWithStore(t)
	run := testRun("easy_run_highlight")
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_highlight",
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}
	subscription, err := service.SubscribeEvents(EasyRunEventCursor{})
	if err != nil {
		t.Fatalf("subscribe easy-run events: %v", err)
	}
	defer subscription.Unsubscribe()

	highlights, err := service.RecordNarratorHighlights("workspace_api", run.ID, []string{
		" Scoping the deliverable ",
		"Drafting the final table",
	})
	if err != nil {
		t.Fatalf("record narrator highlights: %v", err)
	}
	assertRecordedNarratorHighlights(t, highlights)
	assertHighlightCreatedEvents(t, subscription, []string{"highlight_0001", "highlight_0002"})
	assertSnapshotHighlights(t, service, []string{"Scoping the deliverable", "Drafting the final table"})
}

func TestRecordNarratorHighlightsEnforcesCallAndRunCaps(t *testing.T) {
	service, store := newTestServiceWithStore(t)
	run := testRun("easy_run_highlight_cap")
	existing := make([]EasyHighlight, 0, maxEasyHighlightsPerRun-1)
	for index := 1; index < maxEasyHighlightsPerRun; index++ {
		existing = append(existing, testHighlight(run.ID, index))
	}
	run.HighlightCount = len(existing)
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_highlight_cap",
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}
	if err := store.saveHighlights(run.WorkspaceID, run.ID, existing); err != nil {
		t.Fatalf("save existing highlights: %v", err)
	}

	accepted, err := service.RecordNarratorHighlights("workspace_api", run.ID, []string{"one", "two", "three"})
	if err != nil {
		t.Fatalf("record capped highlights: %v", err)
	}
	if len(accepted) != 1 || accepted[0].Text != "one" || accepted[0].Ordinal != maxEasyHighlightsPerRun {
		t.Fatalf("accepted highlights = %+v, want first text only at run cap", accepted)
	}
	overflow, err := service.RecordNarratorHighlights("workspace_api", run.ID, []string{"overflow"})
	if err != nil {
		t.Fatalf("record overflow highlight: %v", err)
	}
	if len(overflow) != 0 {
		t.Fatalf("overflow highlights = %+v, want none after run cap", overflow)
	}
	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read capped snapshot: %v", err)
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.HighlightCount != maxEasyHighlightsPerRun || len(snapshot.Highlights) != maxEasyHighlightsPerRun {
		t.Fatalf("snapshot = %+v highlights=%d, want run cap", snapshot.LatestRun, len(snapshot.Highlights))
	}
}

func TestRecordNarratorHighlightsRejectsInvalidText(t *testing.T) {
	service, store := newTestServiceWithStore(t)
	run := testRun("easy_run_highlight_invalid")
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_highlight_invalid",
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}

	_, err := service.RecordNarratorHighlights("workspace_api", run.ID, []string{"   "})
	if err == nil || !strings.Contains(err.Error(), "text is required") {
		t.Fatalf("invalid highlight error = %v, want text validation", err)
	}
	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.HighlightCount != 0 || len(snapshot.Highlights) != 0 {
		t.Fatalf("snapshot = %+v highlights=%d, want invalid output rejected", snapshot.LatestRun, len(snapshot.Highlights))
	}
}

func TestEmitArtifactToolRejectsNonEasyRunConversation(t *testing.T) {
	service := newTestService(t)
	tool := NewEmitArtifactAgentTool(service)

	_, err := tool.Handler(context.Background(), chat.AgentToolCall{
		Arguments: []byte(`{"kind":"markdown","title":"Report","markdown":"Done"}`),
	})
	if err == nil || !strings.Contains(err.Error(), "runtime is unavailable") {
		t.Fatalf("missing runtime error = %v, want loud runtime failure", err)
	}

	ctx := chat.ContextWithAgentToolRuntime(context.Background(), chat.AgentToolRuntimeContext{
		Conversation: chat.Conversation{
			ID:          "conversation_public",
			WorkspaceID: "workspace_api",
		},
		Run: chat.Run{ID: "run_public", ConversationID: "conversation_public"},
	})
	_, err = tool.Handler(ctx, chat.AgentToolCall{
		Arguments: []byte(`{"kind":"markdown","title":"Report","markdown":"Done"}`),
	})
	if err == nil || !strings.Contains(err.Error(), "only available inside an easy-run conversation") {
		t.Fatalf("public conversation error = %v, want easy-run ownership failure", err)
	}
}

func TestEmitArtifactToolValidationFailsLoudly(t *testing.T) {
	service, store := newTestServiceWithStore(t)
	run := testRun("easy_run_validation")
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_validation",
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}
	tool := NewEmitArtifactAgentTool(service)
	ctx := easyRunToolContext(run, "run_validation")

	cases := []struct {
		name      string
		arguments string
		want      string
	}{
		{
			name:      "wrong branch field",
			arguments: `{"kind":"markdown","title":"Report","markdown":"Done","rows":[]}`,
			want:      "rows is not valid",
		},
		{
			name:      "oversized markdown",
			arguments: fmt.Sprintf(`{"kind":"markdown","title":"Report","markdown":%q}`, strings.Repeat("x", maxEasyMarkdownArtifactBytes+1)),
			want:      "markdown artifact exceeds",
		},
		{
			name:      "malformed table",
			arguments: `{"kind":"table","title":"Table","columns":[{"key":"name","label":"Name"}],"rows":[["one","extra"]]}`,
			want:      "want 1",
		},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			_, err := tool.Handler(ctx, chat.AgentToolCall{Arguments: []byte(tt.arguments)})
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("emit artifact error = %v, want %q", err, tt.want)
			}
		})
	}
}

func TestEmitArtifactToolEnforcesArtifactCap(t *testing.T) {
	service, store := newTestServiceWithStore(t)
	run := testRun("easy_run_cap")
	artifacts := make([]EasyArtifact, 0, maxEasyArtifactsPerRun)
	for index := 1; index <= maxEasyArtifactsPerRun; index++ {
		artifacts = append(artifacts, EasyArtifact{
			CreatedAt: "2026-07-08T12:00:00Z",
			EasyRunID: run.ID,
			ID:        fmt.Sprintf("artifact_existing_%02d", index),
			Kind:      EasyArtifactKindMarkdown,
			Markdown:  &EasyMarkdownArtifactPayload{Markdown: "Done"},
			Ordinal:   index,
			Title:     fmt.Sprintf("Artifact %02d", index),
		})
	}
	run.ArtifactCount = len(artifacts)
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_cap",
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}
	if err := store.saveArtifacts(run.WorkspaceID, run.ID, artifacts); err != nil {
		t.Fatalf("save artifacts: %v", err)
	}
	tool := NewEmitArtifactAgentTool(service)

	_, err := tool.Handler(easyRunToolContext(run, "run_cap"), chat.AgentToolCall{
		Arguments: []byte(`{"kind":"markdown","title":"Overflow","markdown":"Done"}`),
	})
	if err == nil || !strings.Contains(err.Error(), "already has 20 artifacts") {
		t.Fatalf("cap error = %v, want artifact cap failure", err)
	}
}

func TestServiceRejectsSecondStartInSameWorkspaceWhileWorking(t *testing.T) {
	harness := chat.NewFakeHarnessByPrompt(map[string][]chat.FakeHarnessEvent{
		"wait in first workspace": {
			{Type: chat.FakeEventWaitForCancel},
		},
		"wait in other workspace": {
			{Type: chat.FakeEventWaitForCancel},
		},
	})
	service, _ := newTestServiceWithChatResolver(t, harness, testWorkspaceResolver{
		"workspace_api": {
			DisplayName:  "api",
			ID:           "workspace_api",
			LastOpenedAt: "2026-07-08T12:00:00Z",
			RootPath:     t.TempDir(),
		},
		"workspace_other": {
			DisplayName:  "other",
			ID:           "workspace_other",
			LastOpenedAt: "2026-07-08T12:00:00Z",
			RootPath:     t.TempDir(),
		},
	})

	first, err := service.Start("workspace_api", "wait in first workspace")
	if err != nil {
		t.Fatalf("start first easy-run: %v", err)
	}
	working := waitForEasyRunStatus(t, service, "workspace_api", first.ID, EasyRunStatusWorking)

	_, err = service.Start("workspace_api", "second start should fail")
	if err == nil || !strings.Contains(err.Error(), "already working") {
		t.Fatalf("second same-workspace start error = %v, want active-run rejection", err)
	}
	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read snapshot after rejected start: %v", err)
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.ID != working.ID || snapshot.LatestRun.Status != EasyRunStatusWorking {
		t.Fatalf("snapshot after rejected start = %+v, want original working run", snapshot.LatestRun)
	}

	other, err := service.Start("workspace_other", "wait in other workspace")
	if err != nil {
		t.Fatalf("start other-workspace easy-run: %v", err)
	}
	_ = waitForEasyRunStatus(t, service, "workspace_other", other.ID, EasyRunStatusWorking)

	if _, err := service.Stop("workspace_api", first.ID); err != nil {
		t.Fatalf("stop first easy-run: %v", err)
	}
	if _, err := service.Stop("workspace_other", other.ID); err != nil {
		t.Fatalf("stop other-workspace easy-run: %v", err)
	}
}

func TestServiceStartupRecoveryMarksWorkingRunsFailed(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_easy",
		Run:           testRun("easy_run_interrupted"),
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}
	completed := testRun("easy_run_completed")
	endedAt := "2026-07-08T12:01:00Z"
	completed.ActiveAgentCount = 0
	completed.EndedAt = &endedAt
	completed.Status = EasyRunStatusCompleted
	completed.Summary = stringPointer("Done in 1m0s - no artifacts")
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_completed",
		Run:           completed,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save completed run: %v", err)
	}

	restarted, err := NewService(
		store,
		WithClock(func() time.Time {
			return time.Date(2026, 7, 8, 12, 2, 0, 0, time.UTC)
		}),
	)
	if err != nil {
		t.Fatalf("create restarted service: %v", err)
	}
	t.Cleanup(restarted.CloseEvents)

	snapshot, err := restarted.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read recovered snapshot: %v", err)
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.ID != "easy_run_interrupted" {
		t.Fatalf("snapshot latest = %+v, want recovered interrupted run", snapshot.LatestRun)
	}
	assertRestartRecoveredEasyRun(t, *snapshot.LatestRun)

	persisted, err := store.loadRun("workspace_api", "easy_run_interrupted")
	if err != nil {
		t.Fatalf("load persisted recovered run: %v", err)
	}
	assertRestartRecoveredEasyRun(t, persisted.Run)

	subscription, err := restarted.SubscribeEvents(EasyRunEventCursor{})
	if err != nil {
		t.Fatalf("subscribe recovery events: %v", err)
	}
	defer subscription.Unsubscribe()
	event := requireEasyRunEvent(t, subscription)
	if event.Type != EasyRunEventTypeRunUpdated ||
		event.RunUpdated == nil ||
		event.RunUpdated.Run.ID != "easy_run_interrupted" ||
		event.RunUpdated.Run.Status != EasyRunStatusFailed {
		t.Fatalf("recovery event = %+v, want failed run update", event)
	}

	unchanged, err := store.loadRun("workspace_api", "easy_run_completed")
	if err != nil {
		t.Fatalf("load completed run: %v", err)
	}
	if unchanged.Run.Status != EasyRunStatusCompleted || unchanged.Run.Summary == nil || *unchanged.Run.Summary != "Done in 1m0s - no artifacts" {
		t.Fatalf("completed run changed during recovery: %+v", unchanged.Run)
	}
}

func newTestService(t *testing.T) *Service {
	t.Helper()
	service, _ := newTestServiceWithStore(t)
	return service
}

func newTestServiceWithStore(t *testing.T) (*Service, *Store) {
	t.Helper()
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	service, err := NewService(
		store,
		withEventStreamID(EasyRunEventStreamID),
		WithIDGenerator(testIDGenerator()),
	)
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	t.Cleanup(service.CloseEvents)
	return service, store
}

func newTestServiceWithChat(t *testing.T, harness chat.Harness) (*Service, *chat.Service) {
	t.Helper()
	return newTestServiceWithChatResolver(t, harness, testWorkspaceResolver{"workspace_api": {
		DisplayName:  "api",
		ID:           "workspace_api",
		LastOpenedAt: "2026-07-08T12:00:00Z",
		RootPath:     t.TempDir(),
	}})
}

func newTestServiceWithChatResolver(t *testing.T, harness chat.Harness, resolver testWorkspaceResolver) (*Service, *chat.Service) {
	t.Helper()
	appDataDir := t.TempDir()
	chatStore, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create chat store: %v", err)
	}
	chatService, err := chat.NewService(
		chatStore,
		resolver,
		harness,
		chat.WithClock(func() time.Time {
			return time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
		}),
		chat.WithIDGenerator(testIDGenerator()),
	)
	if err != nil {
		t.Fatalf("create chat service: %v", err)
	}
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create easy-run store: %v", err)
	}
	service, err := NewService(
		store,
		WithChatService(chatService),
		WithClock(func() time.Time {
			return time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
		}),
		withEventStreamID(EasyRunEventStreamID),
		WithIDGenerator(testIDGenerator()),
	)
	if err != nil {
		t.Fatalf("create easy-run service: %v", err)
	}
	t.Cleanup(chatService.CloseEvents)
	t.Cleanup(service.CloseEvents)
	return service, chatService
}

func testIDGenerator() func(string) (string, error) {
	counter := 0
	return func(prefix string) (string, error) {
		counter++
		return fmt.Sprintf("%s_%04d", prefix, counter), nil
	}
}

type testWorkspaceResolver map[string]workspace.WorkspaceSummary

func (resolver testWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	summary, ok := resolver[id]
	if !ok {
		return workspace.WorkspaceSummary{}, os.ErrNotExist
	}
	return summary, nil
}

func waitForEasyRunStatus(t *testing.T, service *Service, workspaceID string, easyRunID string, status EasyRunStatus) EasyRun {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := service.ReadSnapshot(workspaceID)
		if err != nil {
			t.Fatalf("read easy-run snapshot: %v", err)
		}
		if snapshot.LatestRun != nil && snapshot.LatestRun.ID == easyRunID && snapshot.LatestRun.Status == status {
			return *snapshot.LatestRun
		}
		time.Sleep(10 * time.Millisecond)
	}
	snapshot, err := service.ReadSnapshot(workspaceID)
	if err != nil {
		t.Fatalf("read final easy-run snapshot: %v", err)
	}
	t.Fatalf("latest easy-run = %+v, want %s", snapshot.LatestRun, status)
	return EasyRun{}
}

func requireEasyRunEvent(t *testing.T, subscription *EventSubscription) EasyRunEvent {
	t.Helper()
	select {
	case event := <-subscription.Events:
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for easy-run event")
		return EasyRunEvent{}
	}
}

func assertRecordedNarratorHighlights(t *testing.T, highlights []EasyHighlight) {
	t.Helper()
	if len(highlights) != 2 {
		t.Fatalf("highlights = %+v, want two narrator highlights", highlights)
	}
	if highlights[0].ID != "highlight_0001" || highlights[0].Ordinal != 1 || highlights[0].Text != "Scoping the deliverable" {
		t.Fatalf("first highlight = %+v, want trimmed first narrator highlight", highlights[0])
	}
	if highlights[1].ID != "highlight_0002" || highlights[1].Ordinal != 2 || highlights[1].Text != "Drafting the final table" {
		t.Fatalf("second highlight = %+v, want second narrator highlight", highlights[1])
	}
}

func assertHighlightCreatedEvents(t *testing.T, subscription *EventSubscription, ids []string) {
	t.Helper()
	for _, id := range ids {
		event := requireEasyRunEvent(t, subscription)
		highlight := highlightFromCreatedEvent(t, event)
		if highlight.ID != id {
			t.Fatalf("highlight event = %+v, want highlight id %s", event, id)
		}
	}
}

func highlightFromCreatedEvent(t *testing.T, event EasyRunEvent) EasyHighlight {
	t.Helper()
	if event.Type != EasyRunEventTypeHighlightCreated || event.HighlightCreated == nil {
		t.Fatalf("highlight event = %+v, want typed highlight.created event", event)
	}
	return event.HighlightCreated.Highlight
}

func assertSnapshotHighlights(t *testing.T, service *Service, texts []string) {
	t.Helper()
	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.HighlightCount != len(texts) {
		t.Fatalf("snapshot run = %+v, want highlight count %d", snapshot.LatestRun, len(texts))
	}
	if len(snapshot.Highlights) != len(texts) {
		t.Fatalf("snapshot highlights = %+v, want %d highlights", snapshot.Highlights, len(texts))
	}
	for index, text := range texts {
		if snapshot.Highlights[index].Text != text {
			t.Fatalf("snapshot highlight[%d] = %+v, want text %q", index, snapshot.Highlights[index], text)
		}
	}
}

func assertStartedEasyRun(t *testing.T, run EasyRun, requestText string) {
	t.Helper()
	if run.ID != "easy_run_0001" || run.RequestText != requestText || run.WorkspaceID != "workspace_api" {
		t.Fatalf("started run = %+v, want deterministic easy-run request", run)
	}
}

func assertWorkingRunEvent(t *testing.T, event EasyRunEvent) {
	t.Helper()
	if event.Type != EasyRunEventTypeRunUpdated || event.RunUpdated == nil {
		t.Fatalf("working event = %+v, want run update", event)
	}
	if event.RunUpdated.Run.Status != EasyRunStatusWorking {
		t.Fatalf("working event run = %+v, want working status", event.RunUpdated.Run)
	}
}

func assertCompletedEasyRun(t *testing.T, run EasyRun) {
	t.Helper()
	if run.Summary == nil || run.EndedAt == nil {
		t.Fatalf("completed run = %+v, want summary and endedAt", run)
	}
	if !strings.Contains(*run.Summary, "Done in") || !strings.Contains(*run.Summary, "no artifacts") || run.ActiveAgentCount != 0 {
		t.Fatalf("completed run = %+v, want mechanical completion summary", run)
	}
}

func assertEasyRunSnapshotWithEmptyRails(t *testing.T, snapshot EasyRunSnapshot, easyRunID string) {
	t.Helper()
	if snapshot.LatestRun == nil || snapshot.LatestRun.ID != easyRunID {
		t.Fatalf("snapshot = %+v, want latest run %s", snapshot, easyRunID)
	}
	if len(snapshot.Highlights) != 0 || len(snapshot.Artifacts) != 0 {
		t.Fatalf("snapshot = %+v, want empty rails", snapshot)
	}
}

func assertHiddenEasyRunConversation(t *testing.T, conversation chat.Conversation, easyRunID string) {
	t.Helper()
	if !conversation.Internal || conversation.Workflow != nil {
		t.Fatalf("hidden conversation = %+v, want internal easy-run owner only", conversation)
	}
	if conversation.EasyRun == nil || conversation.EasyRun.EasyRunID != easyRunID {
		t.Fatalf("hidden conversation = %+v, want easy-run id %s", conversation, easyRunID)
	}
}

func assertNoPublicConversations(t *testing.T, conversations []chat.ConversationListItem) {
	t.Helper()
	if len(conversations) != 0 {
		t.Fatalf("public conversations = %+v, want hidden easy-run omitted", conversations)
	}
}

func waitForEasyRunHarnessRef(t *testing.T, chatService *chat.Service, workspaceID string, conversationID string, turnID string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		page, err := chatService.LoadMessagePage(workspaceID, conversationID, 0, 20)
		if err != nil {
			t.Fatalf("load hidden message page: %v", err)
		}
		for _, ref := range page.Conversation.HarnessRefs {
			if ref.LastTurnID == turnID {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for hidden harness turn %s", turnID)
}

func chatInputTextForTest(input chat.ChatInput) string {
	parts := make([]string, 0, len(input.Parts))
	for _, part := range input.Parts {
		if part.Type == chat.MessagePartText && part.Text != nil {
			parts = append(parts, part.Text.Text)
		}
	}
	return strings.Join(parts, "\n")
}

func easyRunToolContext(run EasyRun, backingRunID string) context.Context {
	return chat.ContextWithAgentToolRuntime(context.Background(), chat.AgentToolRuntimeContext{
		Workspace: workspace.WorkspaceSummary{
			ID:          run.WorkspaceID,
			DisplayName: "api",
			RootPath:    "/tmp/workspace",
		},
		Conversation: chat.Conversation{
			ID:          run.ConversationID,
			Internal:    true,
			WorkspaceID: run.WorkspaceID,
			EasyRun:     &chat.ConversationEasyRunMetadata{EasyRunID: run.ID},
		},
		Run: chat.Run{
			ID:             backingRunID,
			ConversationID: run.ConversationID,
			WorkspaceID:    run.WorkspaceID,
		},
		ThreadID: "thread_" + backingRunID,
		TurnID:   "turn_" + backingRunID,
	})
}

func assertRestartRecoveredEasyRun(t *testing.T, run EasyRun) {
	t.Helper()
	if run.Status != EasyRunStatusFailed ||
		run.EndedAt == nil ||
		*run.EndedAt != "2026-07-08T12:02:00Z" ||
		run.Error == nil ||
		*run.Error != easyRunInterruptedOnRestartReason ||
		run.Summary == nil ||
		!strings.Contains(*run.Summary, "Failed after 2m0s") ||
		!strings.Contains(*run.Summary, easyRunInterruptedOnRestartReason) ||
		!strings.Contains(*run.Summary, "no artifacts") ||
		run.ActiveAgentCount != 0 {
		t.Fatalf("recovered run = %+v, want failed restart projection", run)
	}
}

func testRun(id string) EasyRun {
	return EasyRun{
		ActiveAgentCount: 1,
		ArtifactCount:    0,
		ConversationID:   "conversation_" + id,
		ID:               id,
		NarratorStatus:   EasyRunNarratorStatusOK,
		RequestText:      "Do the work",
		StartedAt:        "2026-07-08T12:00:00Z",
		Status:           EasyRunStatusWorking,
		WorkspaceID:      "workspace_api",
	}
}

func testHighlight(easyRunID string, ordinal int) EasyHighlight {
	return EasyHighlight{
		At:        fmt.Sprintf("2026-07-08T12:00:%02dZ", ordinal),
		EasyRunID: easyRunID,
		ID:        fmt.Sprintf("highlight_existing_%02d", ordinal),
		Ordinal:   ordinal,
		Text:      fmt.Sprintf("Existing highlight %02d", ordinal),
	}
}
