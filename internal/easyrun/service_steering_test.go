package easyrun

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/chat"
)

func TestServiceSteerForwardsTextToBackingHiddenRun(t *testing.T) {
	steeringText := "keep every detail\nand preserve spacing inside"
	harness := chat.NewFakeHarnessByPrompt(map[string][]chat.FakeHarnessEvent{
		"wait for steering": {
			{
				Type:      chat.FakeEventThreadLinked,
				ThreadID:  "thread_easy",
				SessionID: "session_easy",
				TurnID:    "turn_easy",
			},
			{Type: chat.FakeEventWaitForSteer},
			{Type: chat.FakeEventUserMessage, Text: steeringText},
			{Type: chat.FakeEventWaitForCancel},
		},
	})
	service, chatService := newTestServiceWithChat(t, harness)

	started, err := service.Start("workspace_api", "wait for steering")
	if err != nil {
		t.Fatalf("start easy-run: %v", err)
	}
	working := waitForEasyRunStatus(t, service, "workspace_api", started.ID, EasyRunStatusWorking)
	waitForEasyRunHarnessRef(t, chatService, "workspace_api", working.ConversationID, "turn_easy")

	steered, err := service.Steer("workspace_api", "  "+steeringText+"  ")
	if err != nil {
		t.Fatalf("steer easy-run: %v", err)
	}
	backingRunID := assertAcceptedEasyRunSteer(t, harness, working, steered, steeringText)
	message := waitForPersistedSteeringMessage(t, chatService, steered, backingRunID, steeringText)
	assertPersistedSteeringTranscript(t, chatService, steered, message, steeringText)
	assertFocusedSteeringProjection(t, service, harness, steered, message, steeringText)
	stopAndAssertHiddenEasyRun(t, service, chatService, started, steered)
}

func assertAcceptedEasyRunSteer(t *testing.T, harness *chat.FakeHarness, working EasyRun, steered EasyRun, steeringText string) string {
	t.Helper()
	if steered.ID != working.ID || steered.Status != EasyRunStatusWorking {
		t.Fatalf("steered run = %+v, want current working run %s", steered, working.ID)
	}
	if steered.CurrentFocus.Status != EasyRunFocusStatusUpdating || steered.CurrentFocus.Text != "wait for steering" {
		t.Fatalf("steered focus = %+v, want stable revision zero marked updating", steered.CurrentFocus)
	}
	requests := harness.SteeringRequests()
	if len(requests) != 1 || chatInputTextForTest(requests[0].Input) != steeringText || requests[0].RunID == "" {
		t.Fatalf("steering requests = %+v, want shared-normalized text for backing run", requests)
	}
	return requests[0].RunID
}

func assertFocusedSteeringProjection(t *testing.T, service *Service, harness *chat.FakeHarness, steered EasyRun, message chat.ChatMessage, steeringText string) {
	t.Helper()
	focused := waitForEasyRunFocus(t, service, "workspace_api", steered.ID, EasyRunFocusStatusCurrent, 0, "wait for steering")
	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read focused snapshot: %v", err)
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.ID != steered.ID {
		t.Fatalf("steered snapshot run = %+v, want %s", snapshot.LatestRun, steered.ID)
	}
	assertRevisionZeroCurrentFocus(t, focused, "wait for steering")
	if len(snapshot.Highlights) != 0 {
		t.Fatalf("steering highlights = %+v, want NOW to remain narrator-only", snapshot.Highlights)
	}
	tasks := harness.StructuredTaskRequests()
	if len(tasks) != 1 {
		t.Fatalf("steering narrator tasks = %d, want one immediate projection", len(tasks))
	}
	input := decodeNarratorTaskInputForTest(t, tasks[0])
	if input.PreviousCurrentFocus != "wait for steering" || len(input.DigestEntries) != 1 {
		t.Fatalf("steering narrator input = %+v, want previous focus and one accepted fact", input)
	}
	entry := input.DigestEntries[0]
	if entry.Source != narratorDigestSourceUserSteer || entry.Text != steeringText || entry.EventID != message.ID {
		t.Fatalf("steering narrator digest = %+v, want exact persisted user_steer", entry)
	}
}

func stopAndAssertHiddenEasyRun(t *testing.T, service *Service, chatService *chat.Service, started EasyRun, steered EasyRun) {
	t.Helper()
	stopped, err := service.Stop("workspace_api", steered.ID)
	if err != nil {
		t.Fatalf("stop steered easy-run: %v", err)
	}
	if stopped.Status != EasyRunStatusStopped {
		stopped = waitForEasyRunStatus(t, service, "workspace_api", steered.ID, EasyRunStatusStopped)
	}
	page, err := chatService.LoadMessagePage("workspace_api", stopped.ConversationID, 0, 20)
	if err != nil {
		t.Fatalf("load hidden message page: %v", err)
	}
	assertHiddenEasyRunConversation(t, page.Conversation, started.ID)
}

func waitForEasyRunFocus(t *testing.T, service *Service, workspaceID string, easyRunID string, status EasyRunFocusStatus, revision int, text string) EasyRun {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := service.ReadSnapshot(workspaceID)
		if err != nil {
			t.Fatalf("read easy-run focus: %v", err)
		}
		if snapshot.LatestRun != nil &&
			snapshot.LatestRun.ID == easyRunID &&
			snapshot.LatestRun.CurrentFocus.Status == status &&
			snapshot.LatestRun.CurrentFocus.Revision == revision &&
			snapshot.LatestRun.CurrentFocus.Text == text {
			return *snapshot.LatestRun
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for easy-run %s focus %s revision %d text %q", easyRunID, status, revision, text)
	return EasyRun{}
}

func TestAcceptedEasyRunSteeringRetainsPersistedChatMessage(t *testing.T) {
	run := testRun("easy_run_accepted_steering")
	message := chat.ChatMessage{
		ConversationID: run.ConversationID,
		Delivery:       chat.MessageDeliverySteering,
		ID:             "message_accepted_steering",
		Parts: []chat.MessagePart{{
			ID:   "part_accepted_steering",
			Type: chat.MessagePartText,
			Text: &chat.MessageTextPart{Format: chat.TextFormatPlain, Text: "Keep the exact accepted text."},
		}},
		Role:   chat.RoleUser,
		RunID:  "run_accepted_steering",
		Status: chat.MessageStatusPending,
	}
	result := chat.SteerMessageResult{
		Conversation: chat.Conversation{
			EasyRun:     &chat.ConversationEasyRunMetadata{EasyRunID: run.ID},
			ID:          run.ConversationID,
			Internal:    true,
			WorkspaceID: run.WorkspaceID,
		},
		Run: chat.Run{
			ConversationID: run.ConversationID,
			ID:             message.RunID,
			WorkspaceID:    run.WorkspaceID,
		},
		UserMessage: message,
	}

	accepted, err := acceptedEasyRunSteeringFromChatResult(run, message.RunID, result)
	if err != nil {
		t.Fatalf("capture accepted steering: %v", err)
	}
	if accepted.run.ID != run.ID || accepted.userMessage.ID != message.ID || accepted.text != "Keep the exact accepted text." {
		t.Fatalf("accepted steering = %+v, want intact run, persisted message, and exact text", accepted)
	}

	for name, conversation := range map[string]chat.Conversation{
		"public conversation": {
			ID:          run.ConversationID,
			WorkspaceID: run.WorkspaceID,
		},
		"different easy run owner": {
			EasyRun:     &chat.ConversationEasyRunMetadata{EasyRunID: "easy_run_other"},
			ID:          run.ConversationID,
			Internal:    true,
			WorkspaceID: run.WorkspaceID,
		},
	} {
		t.Run(name, func(t *testing.T) {
			invalid := result
			invalid.Conversation = conversation
			_, err := acceptedEasyRunSteeringFromChatResult(run, message.RunID, invalid)
			if err == nil || !strings.Contains(err.Error(), "is not owned by easy-run") {
				t.Fatalf("invalid conversation ownership error = %v, want easy-run ownership rejection", err)
			}
		})
	}
}

func TestInvalidAcceptedSteeringResultMarksFocusStale(t *testing.T) {
	service, store := newTestServiceWithStore(t)
	run := testRun("easy_run_invalid_accepted_steering")
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_invalid_accepted_steering",
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}

	_, err := service.finishAcceptedSteering(run, "run_invalid_accepted_steering", chat.SteerMessageResult{})
	if err == nil || !IsAcceptedSteeringFocusUpdateError(err) || !strings.Contains(err.Error(), "persisted chat result is invalid") {
		t.Fatalf("invalid accepted result error = %v, want typed partial outcome", err)
	}
	stale := waitForEasyRunFocus(t, service, run.WorkspaceID, run.ID, EasyRunFocusStatusStale, 0, run.CurrentFocus.Text)
	if stale.NarratorStatus != EasyRunNarratorStatusDegraded {
		t.Fatalf("invalid accepted result run = %+v, want stale degraded focus", stale)
	}
}

func TestAcceptedSteeringQueuesImmediateFocusProjectionByDigestWatermark(t *testing.T) {
	firstSteer := "Include memory cost\nand keep the original comparison."
	secondSteer := "Also compare startup latency."
	harness := chat.NewFakeHarnessByPrompt(map[string][]chat.FakeHarnessEvent{
		"compare renderer approaches": {
			threadLinkedEvent(),
			{Type: chat.FakeEventWaitForSteer},
			{Type: chat.FakeEventUserMessage, Text: firstSteer},
			{Type: chat.FakeEventWaitForSteer},
			{Type: chat.FakeEventUserMessage, Text: secondSteer},
			{Type: chat.FakeEventWaitForCancel},
		},
	})
	service, chatService := newTestServiceWithChat(t, harness)
	runner := newOrderedFocusNarratorRunner()
	service.narrator = runner

	started, err := service.Start("workspace_api", "compare renderer approaches")
	if err != nil {
		t.Fatalf("start easy-run: %v", err)
	}
	waitForEasyRunHarnessRef(t, chatService, started.WorkspaceID, started.ConversationID, "turn_easy")

	first, err := service.Steer(started.WorkspaceID, firstSteer)
	if err != nil {
		t.Fatalf("first steer: %v", err)
	}
	if first.CurrentFocus.Status != EasyRunFocusStatusUpdating || first.CurrentFocus.Revision != 0 {
		t.Fatalf("first steer focus = %+v, want revision zero updating", first.CurrentFocus)
	}
	runner.WaitForRequestCount(t, 1)

	second, err := service.Steer(started.WorkspaceID, secondSteer)
	if err != nil {
		t.Fatalf("second steer: %v", err)
	}
	if second.CurrentFocus.Status != EasyRunFocusStatusUpdating || second.CurrentFocus.Revision != 0 {
		t.Fatalf("second steer focus = %+v, want older in-flight result unable to clear updating", second.CurrentFocus)
	}
	runner.ReleaseFirst()
	runner.WaitForRequestCount(t, 2)

	updating := waitForEasyRunFocus(
		t,
		service,
		started.WorkspaceID,
		started.ID,
		EasyRunFocusStatusUpdating,
		0,
		started.RequestText,
	)
	if updating.CurrentFocus.UpdatedAt != started.CurrentFocus.UpdatedAt {
		t.Fatalf("intermediate focus = %+v, want last persisted focus stable until every steer is evaluated", updating.CurrentFocus)
	}
	requests := runner.Requests()
	firstInput := decodeNarratorTaskInputForTest(t, requests[0])
	secondInput := decodeNarratorTaskInputForTest(t, requests[1])
	assertAcceptedSteeringDigest(t, firstInput, "compare renderer approaches", firstSteer)
	assertAcceptedSteeringDigest(
		t,
		secondInput,
		"Compare renderer paint and memory cost before choosing an approach.",
		secondSteer,
	)
	runner.ReleaseSecond()

	focused := waitForEasyRunFocus(
		t,
		service,
		started.WorkspaceID,
		started.ID,
		EasyRunFocusStatusCurrent,
		1,
		"Compare renderer paint, memory, and startup latency before choosing an approach.",
	)
	if focused.RequestText != "compare renderer approaches" {
		t.Fatalf("focused run request = %q, want immutable initial request", focused.RequestText)
	}
	snapshot, err := service.ReadSnapshot(started.WorkspaceID)
	if err != nil {
		t.Fatalf("read focused snapshot: %v", err)
	}
	if len(snapshot.Highlights) != 0 {
		t.Fatalf("focus projections added NOW entries: %+v", snapshot.Highlights)
	}
	if _, err := service.Stop(started.WorkspaceID, started.ID); err != nil {
		t.Fatalf("stop focused easy-run: %v", err)
	}
}

func TestAcceptedSteeringNarratorFailureMarksLastFocusStale(t *testing.T) {
	steeringText := "Keep the exact accepted constraint."
	harness := chat.NewFakeHarnessByPrompt(map[string][]chat.FakeHarnessEvent{
		"wait for failing focus": {
			threadLinkedEvent(),
			{Type: chat.FakeEventWaitForSteer},
			{Type: chat.FakeEventUserMessage, Text: steeringText},
			{Type: chat.FakeEventWaitForCancel},
		},
	})
	service, chatService := newTestServiceWithChat(t, harness)
	runner := &failingNarratorRunner{err: context.DeadlineExceeded}
	service.narrator = runner

	started, err := service.Start("workspace_api", "wait for failing focus")
	if err != nil {
		t.Fatalf("start easy-run: %v", err)
	}
	waitForEasyRunHarnessRef(t, chatService, started.WorkspaceID, started.ConversationID, "turn_easy")
	steered, err := service.Steer(started.WorkspaceID, steeringText)
	if err != nil {
		t.Fatalf("steer accepted run: %v", err)
	}
	if steered.CurrentFocus.Status != EasyRunFocusStatusUpdating {
		t.Fatalf("accepted steer focus = %+v, want updating before narrator failure", steered.CurrentFocus)
	}
	stale := waitForEasyRunFocus(t, service, started.WorkspaceID, started.ID, EasyRunFocusStatusStale, 0, started.RequestText)
	if stale.NarratorStatus != EasyRunNarratorStatusDegraded || stale.Status != EasyRunStatusWorking {
		t.Fatalf("stale run = %+v, want degraded presentation with working execution", stale)
	}
	requests := runner.Requests()
	if len(requests) != 1 {
		t.Fatalf("failing narrator requests = %d, want one without retry", len(requests))
	}
	assertAcceptedSteeringDigest(t, decodeNarratorTaskInputForTest(t, requests[0]), started.RequestText, steeringText)
	if _, err := service.Stop(started.WorkspaceID, started.ID); err != nil {
		t.Fatalf("stop stale-focus easy-run: %v", err)
	}
}

func TestOlderNarratorResultCannotHealAcceptedSteeringProjectionFailure(t *testing.T) {
	service, store := newTestServiceWithStore(t)
	run := testRun("easy_run_stale_focus_watermark")
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_stale_focus_watermark",
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}

	service.mu.Lock()
	state := service.narratorStateLocked(run.ID)
	state.beginCall(service.now())
	service.mu.Unlock()
	olderTarget := workingNarratorProjection{
		digestThrough:        0,
		previousCurrentFocus: run.CurrentFocus.Text,
		record: storedRunRecord{
			BackingRunID:  "run_stale_focus_watermark",
			Run:           run,
			SchemaVersion: SchemaVersion,
		},
	}
	if err := service.failAcceptedSteeringResult(run, errors.New("accepted focus projection failed")); err == nil {
		t.Fatal("mark accepted steering projection stale: expected partial-outcome error")
	}

	updated, err := service.saveWorkingNarratorProjection(olderTarget, workingNarrationResult{
		currentFocus: "An older result must not become current.",
		highlights:   []string{"An older highlight must not be added."},
	})
	if err != nil {
		t.Fatalf("discard older narrator result: %v", err)
	}
	if updated.NarratorStatus != EasyRunNarratorStatusDegraded ||
		updated.CurrentFocus.Status != EasyRunFocusStatusStale ||
		updated.CurrentFocus.Revision != 0 ||
		updated.CurrentFocus.Text != run.CurrentFocus.Text {
		t.Fatalf("run after older narrator result = %+v, want stale projection preserved", updated)
	}
	snapshot, err := service.ReadSnapshot(run.WorkspaceID)
	if err != nil {
		t.Fatalf("read stale snapshot: %v", err)
	}
	if len(snapshot.Highlights) != 0 {
		t.Fatalf("highlights after stale projection = %+v, want older narrator output discarded", snapshot.Highlights)
	}
}

func TestAcceptedSteeringReportsPartialOutcomeWhenFocusUpdateCannotPublish(t *testing.T) {
	steeringText := "The instruction still reaches the working agent."
	harness := chat.NewFakeHarnessByPrompt(map[string][]chat.FakeHarnessEvent{
		"wait for partial focus failure": {
			threadLinkedEvent(),
			{Type: chat.FakeEventWaitForSteer},
			{Type: chat.FakeEventUserMessage, Text: steeringText},
			{Type: chat.FakeEventWaitForCancel},
		},
	})
	service, chatService := newTestServiceWithChat(t, harness)
	started, err := service.Start("workspace_api", "wait for partial focus failure")
	if err != nil {
		t.Fatalf("start easy-run: %v", err)
	}
	waitForEasyRunHarnessRef(t, chatService, started.WorkspaceID, started.ConversationID, "turn_easy")
	service.CloseEvents()

	_, err = service.Steer(started.WorkspaceID, steeringText)
	if err == nil || !IsAcceptedSteeringFocusUpdateError(err) || !strings.Contains(err.Error(), "steering accepted but focus update failed") {
		t.Fatalf("partial steering error = %v, want typed accepted-focus failure", err)
	}
	run := waitForEasyRunFocus(t, service, started.WorkspaceID, started.ID, EasyRunFocusStatusStale, 0, started.RequestText)
	if run.NarratorStatus != EasyRunNarratorStatusDegraded {
		t.Fatalf("partial-outcome run = %+v, want stale degraded focus", run)
	}
	steeringRequests := harness.SteeringRequests()
	if len(steeringRequests) != 1 {
		t.Fatalf("partial-outcome steering requests = %+v, want one accepted delivery", steeringRequests)
	}
	message := waitForPersistedSteeringMessage(t, chatService, run, steeringRequests[0].RunID, steeringText)
	assertPersistedSteeringTranscript(t, chatService, run, message, steeringText)
	if tasks := harness.StructuredTaskRequests(); len(tasks) != 0 {
		t.Fatalf("partial focus failure retried narrator work: %+v", tasks)
	}
}

func TestTerminalNarratorRetriesWhenSteeringArrivesAfterItsDigestWatermark(t *testing.T) {
	service, store := newTestServiceWithStore(t)
	run := testRun("easy_run_terminal_focus_watermark")
	backingRunID := "run_terminal_focus_watermark"
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  backingRunID,
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}
	chatRun := chat.Run{
		CompletedAt:    "2026-07-08T12:01:00Z",
		ConversationID: run.ConversationID,
		ID:             backingRunID,
		Status:         chat.RunStatusCompleted,
		WorkspaceID:    run.WorkspaceID,
	}

	olderTarget, err := service.beginTerminalChatRunProjection(chatRun)
	if err != nil {
		t.Fatalf("begin older terminal narrator call: %v", err)
	}
	accepted := acceptedEasyRunSteering{
		run:  run,
		text: "Include the accepted terminal constraint.",
		userMessage: chat.ChatMessage{
			ConversationID: run.ConversationID,
			CreatedAt:      "2026-07-08T12:00:30Z",
			ID:             "message_terminal_focus_watermark",
			Ordinal:        2,
		},
	}
	updating, immediate, err := service.acceptSteeringForNarration(accepted, backingRunID)
	if err != nil {
		t.Fatalf("accept steering during terminal narration: %v", err)
	}
	if immediate != nil || updating.CurrentFocus.Status != EasyRunFocusStatusUpdating {
		t.Fatalf("accepted terminal-race focus = %+v target=%+v, want queued updating projection", updating.CurrentFocus, immediate)
	}

	intermediate, retry, err := service.saveTerminalChatRunProjection(olderTarget, chatRun, terminalNarrationResult{
		currentFocus: "Complete the original objective before the accepted terminal constraint.",
		highlights:   []string{},
		summary:      "The older terminal narrator call completed.",
	})
	if err != nil {
		t.Fatalf("save older terminal narrator call: %v", err)
	}
	if !isStableUpdatingTerminalProjection(intermediate, run.CurrentFocus) || !retry {
		t.Fatalf("older terminal result = %+v retry=%v, want working updating retry", intermediate, retry)
	}

	newerTarget, err := service.beginTerminalChatRunProjection(chatRun)
	if err != nil {
		t.Fatalf("begin terminal narrator retry: %v", err)
	}
	if !terminalRetryIncludesAcceptedSteering(newerTarget, accepted.text) {
		t.Fatalf("terminal retry digest = %+v, want exact queued accepted steer", newerTarget.digest)
	}
	completed, retry, err := service.saveTerminalChatRunProjection(newerTarget, chatRun, terminalNarrationResult{
		currentFocus: "Complete the original objective with the accepted terminal constraint.",
		highlights:   []string{},
		summary:      "The current terminal narrator call completed.",
	})
	if err != nil {
		t.Fatalf("save current terminal narrator call: %v", err)
	}
	if retry ||
		completed.Status != EasyRunStatusCompleted ||
		completed.CurrentFocus.Status != EasyRunFocusStatusCurrent ||
		completed.CurrentFocus.Revision != 1 {
		t.Fatalf("completed terminal retry = %+v retry=%v, want terminal current revision one", completed, retry)
	}
}

func isStableUpdatingTerminalProjection(run EasyRun, previous EasyCurrentFocus) bool {
	return run.Status == EasyRunStatusWorking &&
		run.CurrentFocus.Status == EasyRunFocusStatusUpdating &&
		run.CurrentFocus.Revision == previous.Revision &&
		run.CurrentFocus.Text == previous.Text
}

func terminalRetryIncludesAcceptedSteering(target terminalChatRunProjection, text string) bool {
	return len(target.digest) == 1 &&
		target.digest[0].Source == narratorDigestSourceUserSteer &&
		target.digest[0].Text == text &&
		target.previousCurrentFocus == "Complete the original objective before the accepted terminal constraint."
}

func TestOlderTerminalNarratorResultCannotHealAcceptedSteeringProjectionFailure(t *testing.T) {
	service, store := newTestServiceWithStore(t)
	run := testRun("easy_run_terminal_stale_focus")
	backingRunID := "run_terminal_stale_focus"
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  backingRunID,
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}
	chatRun := chat.Run{
		CompletedAt:    "2026-07-08T12:01:00Z",
		ConversationID: run.ConversationID,
		ID:             backingRunID,
		Status:         chat.RunStatusCompleted,
		WorkspaceID:    run.WorkspaceID,
	}
	target, err := service.beginTerminalChatRunProjection(chatRun)
	if err != nil {
		t.Fatalf("begin terminal narrator call: %v", err)
	}
	if err := service.failAcceptedSteeringResult(run, errors.New("accepted focus projection failed")); err == nil {
		t.Fatal("mark accepted steering projection stale: expected partial-outcome error")
	}

	completed, retry, err := service.saveTerminalChatRunProjection(target, chatRun, terminalNarrationResult{
		currentFocus: "An older terminal result must not become current.",
		highlights:   []string{"An older terminal highlight must not be added."},
		summary:      "An older terminal summary must not be used.",
	})
	if err != nil {
		t.Fatalf("discard older terminal narrator result: %v", err)
	}
	if retry ||
		completed.Status != EasyRunStatusCompleted ||
		completed.NarratorStatus != EasyRunNarratorStatusDegraded ||
		completed.CurrentFocus.Status != EasyRunFocusStatusStale ||
		completed.CurrentFocus.Revision != 0 ||
		completed.CurrentFocus.Text != run.CurrentFocus.Text ||
		completed.Summary == nil ||
		!strings.HasPrefix(*completed.Summary, "Done in") {
		t.Fatalf("completed run after older narrator result = %+v retry=%v, want stale focus and mechanical summary", completed, retry)
	}
	snapshot, err := service.ReadSnapshot(run.WorkspaceID)
	if err != nil {
		t.Fatalf("read completed stale snapshot: %v", err)
	}
	if len(snapshot.Highlights) != 0 {
		t.Fatalf("terminal highlights after stale projection = %+v, want older narrator output discarded", snapshot.Highlights)
	}
}

func assertAcceptedSteeringDigest(t *testing.T, input narratorTaskInput, previousFocus string, text string) {
	t.Helper()
	if input.PreviousCurrentFocus != previousFocus || len(input.DigestEntries) != 1 {
		t.Fatalf("narrator input = %+v, want previous focus %q and one entry", input, previousFocus)
	}
	entry := input.DigestEntries[0]
	if entry.Source != narratorDigestSourceUserSteer || entry.Text != text || entry.EventID == "" {
		t.Fatalf("narrator digest = %+v, want exact persisted user_steer %q", entry, text)
	}
}

type orderedFocusNarratorRunner struct {
	firstStarted  chan struct{}
	releaseFirst  chan struct{}
	releaseSecond chan struct{}

	mu       sync.Mutex
	requests []chat.HarnessTaskRequest
}

func newOrderedFocusNarratorRunner() *orderedFocusNarratorRunner {
	return &orderedFocusNarratorRunner{
		firstStarted:  make(chan struct{}, 1),
		releaseFirst:  make(chan struct{}),
		releaseSecond: make(chan struct{}),
	}
}

func (runner *orderedFocusNarratorRunner) RunTask(ctx context.Context, request chat.HarnessTaskRequest) (chat.HarnessTaskResult, error) {
	runner.mu.Lock()
	callIndex := len(runner.requests)
	runner.requests = append(runner.requests, request)
	runner.mu.Unlock()
	input := narratorTaskInput{}
	if request.StructuredTask != nil {
		_ = json.Unmarshal(request.StructuredTask.Input, &input)
	}
	if input.Terminal {
		return narratorHarnessResult(map[string]any{
			"currentFocus": input.PreviousCurrentFocus,
			"highlights":   []string{},
			"summary":      "The ordered focus run was stopped.",
		})
	}
	if callIndex == 0 {
		runner.firstStarted <- struct{}{}
		select {
		case <-ctx.Done():
			return chat.HarnessTaskResult{}, ctx.Err()
		case <-runner.releaseFirst:
		}
		return narratorHarnessResult(map[string]any{
			"currentFocus": "Compare renderer paint and memory cost before choosing an approach.",
			"highlights":   []string{},
			"summary":      "",
		})
	}
	select {
	case <-ctx.Done():
		return chat.HarnessTaskResult{}, ctx.Err()
	case <-runner.releaseSecond:
	}
	return narratorHarnessResult(map[string]any{
		"currentFocus": "Compare renderer paint, memory, and startup latency before choosing an approach.",
		"highlights":   []string{},
		"summary":      "",
	})
}

func (runner *orderedFocusNarratorRunner) WaitForRequestCount(t *testing.T, count int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if len(runner.Requests()) >= count {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %d ordered focus narrator requests", count)
}

func (runner *orderedFocusNarratorRunner) ReleaseFirst() {
	close(runner.releaseFirst)
}

func (runner *orderedFocusNarratorRunner) ReleaseSecond() {
	close(runner.releaseSecond)
}

func (runner *orderedFocusNarratorRunner) Requests() []chat.HarnessTaskRequest {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	return append([]chat.HarnessTaskRequest{}, runner.requests...)
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

func waitForPersistedSteeringMessage(t *testing.T, chatService *chat.Service, run EasyRun, backingRunID string, text string) chat.ChatMessage {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		page, err := chatService.LoadMessagePage(run.WorkspaceID, run.ConversationID, 0, 20)
		if err != nil {
			t.Fatalf("load hidden steering page: %v", err)
		}
		for _, message := range page.Messages {
			if message.Delivery != chat.MessageDeliverySteering || chatMessageTextForTest(message) != text {
				continue
			}
			if message.Role != chat.RoleUser || message.RunID != backingRunID {
				t.Fatalf("persisted steering message = %+v, want user steering for %s", message, backingRunID)
			}
			if message.Status != chat.MessageStatusComplete {
				continue
			}
			return message
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for persisted steering text %q", text)
	return chat.ChatMessage{}
}

func assertPersistedSteeringTranscript(t *testing.T, chatService *chat.Service, run EasyRun, message chat.ChatMessage, text string) {
	t.Helper()
	page, err := chatService.LoadMessagePage(run.WorkspaceID, run.ConversationID, 0, 20)
	if err != nil {
		t.Fatalf("load hidden steering transcript: %v", err)
	}
	for _, block := range page.Blocks {
		if block.UserMessage == nil || block.UserMessage.MessageID != message.ID {
			continue
		}
		if block.Kind != chat.TranscriptBlockKindUserMessage ||
			block.UserMessage.Role != chat.RoleUser ||
			block.UserMessage.Delivery != chat.MessageDeliverySteering ||
			block.UserMessage.Status != chat.MessageStatusComplete ||
			messagePartsTextForTest(block.UserMessage.Parts) != text {
			t.Fatalf("persisted steering block = %+v, want exact complete steering message", block)
		}
		return
	}
	t.Fatalf("hidden transcript does not contain steering message %s", message.ID)
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

func chatMessageTextForTest(message chat.ChatMessage) string {
	return messagePartsTextForTest(message.Parts)
}

func messagePartsTextForTest(parts []chat.MessagePart) string {
	texts := make([]string, 0, len(parts))
	for _, part := range parts {
		if part.Type == chat.MessagePartText && part.Text != nil {
			texts = append(texts, part.Text.Text)
		}
	}
	return strings.Join(texts, "\n")
}
