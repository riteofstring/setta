package conversation

import (
	"context"
	"sync"
	"testing"
	"time"

	"setta/internal/agent"
)

func TestTopicCreationDefersProviderThreadUntilFirstParentTurn(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Lazy provider thread")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if created.ThreadBinding != nil {
		t.Fatalf("new topic thread binding = %+v, want nil", created.ThreadBinding)
	}
	if got := runtime.startThreadRequests(); len(got) != 0 {
		t.Fatalf("topic creation started provider threads: %+v", got)
	}
	if got := runtime.injectedThreadItems(); len(got) != 0 {
		t.Fatalf("topic creation materialized provider context: %+v", got)
	}

	if _, err := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "first lazy work"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "first lazy work")
	completed := assertServiceSnapshot(t, service, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return snapshot.ThreadBinding != nil && latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	binding := completed.ThreadBinding
	if binding.LastResumedAt != nil {
		t.Fatalf("newly materialized binding lastResumedAt = %v, want nil", *binding.LastResumedAt)
	}
	if binding.LastTurnID == nil || *binding.LastTurnID != latestSnapshotTurn(completed).ID {
		t.Fatalf("binding last turn id = %v, latest turn = %+v", binding.LastTurnID, latestSnapshotTurn(completed))
	}
	assertOperationOrder(t, runtime.operations(),
		"thread/start:"+binding.ThreadID,
		"thread/materialize:"+binding.ThreadID,
		"turn/start:"+binding.ThreadID+":first lazy work",
	)
	injections := runtime.injectedThreadItems()
	if len(injections) != 1 ||
		injections[0].threadID != binding.ThreadID ||
		len(injections[0].items) != 1 ||
		injections[0].items[0].Text != topicAgentThreadInitialization {
		t.Fatalf("topic materialization injections = %+v", injections)
	}
}

func TestExistingTopicBindingResumesBeforeContinuationAfterServiceRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Restart resume")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "first before restart"); err != nil {
		t.Fatalf("SendTurn first: %v", err)
	}
	runtime.waitForStart(t, "first before restart")
	first := assertServiceSnapshot(t, service, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return snapshot.ThreadBinding != nil && latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	threadID := first.ThreadBinding.ThreadID
	durableThreads := cloneServiceTestProviderThreads(runtime)
	shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := service.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown original service: %v", err)
	}

	restartedRuntime := newServiceTestAgentRuntime()
	restartedRuntime.installProviderThreads(durableThreads)
	restarted, err := NewService(
		store,
		service.workspaces,
		restartedRuntime,
		WithServiceClock(func() time.Time { return time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC) }),
	)
	if err != nil {
		t.Fatalf("NewService restarted: %v", err)
	}
	t.Cleanup(func() { cleanupReviewService(t, store, restarted) })
	if _, err := restarted.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "second after restart"); err != nil {
		t.Fatalf("SendTurn second: %v", err)
	}
	restartedRuntime.waitForStart(t, "second after restart")
	second := assertServiceSnapshot(t, restarted, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return snapshot.ThreadBinding != nil && latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	if second.ThreadBinding.ThreadID != threadID {
		t.Fatalf("provider thread changed from %s to %s", threadID, second.ThreadBinding.ThreadID)
	}
	if second.ThreadBinding.LastResumedAt == nil {
		t.Fatalf("resumed binding did not record lastResumedAt: %+v", second.ThreadBinding)
	}
	if got := restartedRuntime.startThreadRequests(); len(got) != 0 {
		t.Fatalf("restart continuation started replacement thread: %+v", got)
	}
	assertOperationOrder(t, restartedRuntime.operations(),
		"thread/resume:"+threadID,
		"turn/start:"+threadID+":second after restart",
	)
	restartedRuntime.mu.Lock()
	thread := restartedRuntime.providerThreads[threadID]
	restartedRuntime.mu.Unlock()
	if len(thread.Turns) != 2 {
		t.Fatalf("provider thread retained %d turns, want prior context plus continuation: %+v", len(thread.Turns), thread)
	}
}

func TestConcurrentFirstParentSubmissionsCreateOneProviderThread(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Concurrent first submissions")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var submissions sync.WaitGroup
	for index := 0; index < 2; index++ {
		submissions.Add(1)
		go func() {
			defer submissions.Done()
			<-start
			_, sendErr := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "hold")
			errs <- sendErr
		}()
	}
	close(start)
	submissions.Wait()
	close(errs)
	successes := 0
	conflicts := 0
	for sendErr := range errs {
		switch {
		case sendErr == nil:
			successes++
		case IsCommandConflict(sendErr):
			conflicts++
		default:
			t.Fatalf("concurrent first submission error = %T %v", sendErr, sendErr)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent first submissions successes/conflicts = %d/%d, want 1/1", successes, conflicts)
	}
	runtime.waitForStart(t, "hold")
	if got := runtime.startThreadRequests(); len(got) != 1 {
		t.Fatalf("concurrent first submissions started %d provider threads: %+v", len(got), got)
	}
	if _, err := service.StopTurn(ctx, workspaceID, created.Conversation.ID); err != nil {
		t.Fatalf("StopTurn: %v", err)
	}
}

func TestMissingHistoricalProviderThreadFailsWithoutReplacementOrReplay(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Missing historical thread")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "historical foundation"); err != nil {
		t.Fatalf("SendTurn first: %v", err)
	}
	runtime.waitForStart(t, "historical foundation")
	first := assertServiceSnapshot(t, service, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return snapshot.ThreadBinding != nil && latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	threadID := first.ThreadBinding.ThreadID
	shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := service.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown original service: %v", err)
	}

	restartedRuntime := newServiceTestAgentRuntime()
	restarted, err := NewService(store, service.workspaces, restartedRuntime)
	if err != nil {
		t.Fatalf("NewService restarted: %v", err)
	}
	t.Cleanup(func() { cleanupReviewService(t, store, restarted) })
	_, err = restarted.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "must not replay")
	if err == nil {
		t.Fatal("SendTurn with missing historical provider thread succeeded")
	}
	if !agent.IsProviderThreadMissing(err) {
		t.Fatalf("SendTurn error = %T %v, want provider thread missing", err, err)
	}
	failed := assertServiceSnapshot(t, restarted, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusFailed
	})
	if failed.ThreadBinding == nil || failed.ThreadBinding.ThreadID != threadID {
		t.Fatalf("missing provider replaced binding: before=%s after=%+v", threadID, failed.ThreadBinding)
	}
	if failed.ThreadBinding.Status != ThreadBindingStatusMissing {
		t.Fatalf("missing provider binding status = %s, want %s", failed.ThreadBinding.Status, ThreadBindingStatusMissing)
	}
	turn := latestSnapshotTurn(failed)
	if turn.Error == nil || turn.Error.Code != "provider_thread_missing" || turn.Error.Retryable {
		t.Fatalf("missing provider failure = %+v", turn.Error)
	}
	if got := restartedRuntime.startThreadRequests(); len(got) != 0 {
		t.Fatalf("missing provider started replacement thread: %+v", got)
	}
	if got := restartedRuntime.turnRequests(); len(got) != 0 {
		t.Fatalf("missing provider replayed input to provider: %+v", got)
	}
	assertOperationOrder(t, restartedRuntime.operations(), "thread/resume:"+threadID)
}

func assertOperationOrder(t *testing.T, operations []string, want ...string) {
	t.Helper()
	position := 0
	for _, operation := range operations {
		if position < len(want) && operation == want[position] {
			position++
		}
	}
	if position != len(want) {
		t.Fatalf("operation order = %v, want subsequence %v", operations, want)
	}
}

func cloneServiceTestProviderThreads(runtime *serviceTestAgentRuntime) map[string]agent.Thread {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	result := make(map[string]agent.Thread, len(runtime.providerThreads))
	for id, thread := range runtime.providerThreads {
		result[id] = cloneServiceTestProviderThread(thread)
	}
	return result
}

func cloneServiceTestProviderThread(thread agent.Thread) agent.Thread {
	copy := thread
	copy.Turns = append([]agent.ThreadTurn{}, thread.Turns...)
	for turnIndex := range copy.Turns {
		copy.Turns[turnIndex].Items = append([]agent.ThreadItemSummary{}, thread.Turns[turnIndex].Items...)
	}
	return copy
}

func (runtime *serviceTestAgentRuntime) installProviderThreads(threads map[string]agent.Thread) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.providerThreads = make(map[string]agent.Thread, len(threads))
	for id, thread := range threads {
		runtime.providerThreads[id] = cloneServiceTestProviderThread(thread)
		runtime.threads++
	}
}
