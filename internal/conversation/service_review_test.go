package conversation

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestQueueWhileApprovalPendingPreservesApprovalState(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Approval queue")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	conversationID := created.Conversation.ID
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, "approval"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "approval")
	waiting := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWaitingForApproval
	})
	if _, err := service.queueTestTurn(ctx, workspaceID, conversationID, "queued after approval"); err != nil {
		t.Fatalf("QueueTurn: %v", err)
	}
	queued, err := service.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	if queued.Conversation.Status != ConversationStatusWaitingForApproval || len(queued.Queue) != 1 {
		t.Fatalf("queued approval state = %s queue=%d, want waiting/1", queued.Conversation.Status, len(queued.Queue))
	}
	approvalID := latestPendingApprovalID(waiting)
	if _, err := service.SubmitApproval(ctx, workspaceID, conversationID, ConversationApprovalResponse{
		ApprovalID: approvalID,
		Decision:   TrajectoryApprovalDecisionAnswered,
		Answers: []ConversationApprovalAnswer{{
			QuestionID: "scope",
			Answers:    []string{"focused"},
		}},
	}); err != nil {
		t.Fatalf("SubmitApproval: %v", err)
	}
	runtime.waitForStart(t, "queued after approval")
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusIdle &&
			len(snapshot.Turns.Turns) == 2 &&
			latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
}

func TestApprovalSubmissionSurvivesTruncatedTrajectoryWindow(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Long approval")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	conversationID := created.Conversation.ID
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, "approval long window"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "approval long window")
	waiting := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWaitingForApproval &&
			snapshot.Trajectory.HasEarlier &&
			len(snapshot.Trajectory.Events) == MaxSnapshotTrajectoryEvents &&
			len(snapshot.PendingApprovals) == 1 &&
			snapshot.Trajectory.Events[0].Sequence > snapshot.PendingApprovals[0].SourceSequence
	})
	if lifecycleRequest, _ := approvalLifecycle(waiting, waiting.PendingApprovals[0].Approval.ID); lifecycleRequest != nil {
		t.Fatal("approval request unexpectedly remained in the bounded trajectory window")
	}
	if _, err := service.SubmitApproval(ctx, workspaceID, conversationID, ConversationApprovalResponse{
		ApprovalID: waiting.PendingApprovals[0].Approval.ID,
		Decision:   TrajectoryApprovalDecisionAnswered,
		Answers: []ConversationApprovalAnswer{{
			QuestionID: "scope",
			Answers:    []string{"focused"},
		}},
	}); err != nil {
		t.Fatalf("SubmitApproval after trajectory truncation: %v", err)
	}
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusIdle &&
			latestSnapshotTurn(snapshot).Status == TurnStatusCompleted &&
			len(snapshot.PendingApprovals) == 0
	})
}

func TestApprovalIsValidatedBeforeProviderSubmissionAndSecretsAreRedacted(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Secret approval")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	conversationID := created.Conversation.ID
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, "secret approval"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "secret approval")
	waiting := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWaitingForApproval
	})
	approvalID := latestPendingApprovalID(waiting)

	_, err = service.SubmitApproval(ctx, workspaceID, conversationID, ConversationApprovalResponse{
		ApprovalID: approvalID,
		Decision:   TrajectoryApprovalDecisionApproved,
		Answers:    []ConversationApprovalAnswer{},
	})
	if err == nil {
		t.Fatal("structured approval accepted a non-answer decision")
	}
	if runtime.submittedApproval() != nil {
		t.Fatal("invalid structured approval reached the provider")
	}
	secretValue := "private-approval-answer"
	_, err = service.SubmitApproval(ctx, workspaceID, conversationID, ConversationApprovalResponse{
		ApprovalID: approvalID,
		Decision:   TrajectoryApprovalDecisionAnswered,
		Answers: []ConversationApprovalAnswer{{
			QuestionID: "scope",
			Answers:    []string{secretValue},
		}},
	})
	if err == nil {
		t.Fatal("secret structured approval accepted a value outside its allowed options")
	}
	if strings.Contains(err.Error(), secretValue) {
		t.Fatalf("secret structured approval error exposed the answer: %v", err)
	}
	if runtime.submittedApproval() != nil {
		t.Fatal("invalid secret structured approval reached the provider")
	}

	if _, err := service.SubmitApproval(ctx, workspaceID, conversationID, ConversationApprovalResponse{
		ApprovalID: approvalID,
		Decision:   TrajectoryApprovalDecisionAnswered,
		Answers: []ConversationApprovalAnswer{{
			QuestionID: "scope",
			Answers:    []string{"focused"},
		}},
	}); err != nil {
		t.Fatalf("SubmitApproval: %v", err)
	}
	providerResponse := runtime.submittedApproval()
	if providerResponse == nil || len(providerResponse.Answers) != 1 || providerResponse.Answers[0].Answers[0] != "focused" {
		t.Fatalf("provider approval response = %+v", providerResponse)
	}
	completed := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	request, resolution := approvalLifecycle(completed, approvalID)
	if request == nil || len(request.Questions) != 1 || !request.Questions[0].Secret {
		t.Fatalf("secret approval request was not preserved: %+v", request)
	}
	if resolution == nil || !resolution.SecretsRedacted || len(resolution.Answers) != 0 {
		t.Fatalf("durable secret approval resolution = %+v", resolution)
	}
}

func TestControlValidatesWorkspaceBeforeProviderSideEffect(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Scoped controls")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	conversationID := created.Conversation.ID
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, "hold cancel"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold cancel")
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusRunning
	})

	if _, err := service.StopTurn(ctx, "workspace-other", conversationID); err == nil {
		t.Fatal("cross-workspace stop unexpectedly succeeded")
	}
	if controls := runtime.controlsSent(); len(controls) != 0 {
		t.Fatalf("cross-workspace stop reached provider: %v", controls)
	}
	if _, err := service.StopTurn(ctx, workspaceID, conversationID); err != nil {
		t.Fatalf("StopTurn: %v", err)
	}
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCancelled
	})
}

func TestFullQueueSnapshotRetainsControllableRunningTurn(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Full queue")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	conversationID := created.Conversation.ID
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, "hold cancel"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold cancel")
	var full ConversationSnapshot
	for index := 0; index < MaxSnapshotQueuedTurns; index++ {
		full, err = service.queueTestTurn(ctx, workspaceID, conversationID, "hold cancel")
		if err != nil {
			t.Fatalf("QueueTurn %d: %v", index, err)
		}
	}
	if len(full.Queue) != MaxSnapshotQueuedTurns || len(full.Turns.Turns) != MaxSnapshotTurns {
		t.Fatalf("full queue snapshot turns=%d queue=%d", len(full.Turns.Turns), len(full.Queue))
	}
	if _, err := findRunningTurn(full); err != nil {
		t.Fatal(err)
	}
	if _, err := service.queueTestTurn(ctx, workspaceID, conversationID, "overflow"); !IsCommandConflict(err) {
		t.Fatalf("overflow QueueTurn error = %v, want conflict", err)
	}
	if _, err := service.StopTurn(ctx, workspaceID, conversationID); err != nil {
		t.Fatalf("StopTurn with full queue: %v", err)
	}
	runtime.waitForStart(t, "hold cancel")
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWorking &&
			len(snapshot.Queue) == MaxSnapshotQueuedTurns-1 &&
			len(snapshot.Turns.Turns) == MaxSnapshotTurns &&
			countTurnStatus(snapshot, TurnStatusCancelled) == 1 &&
			countTurnStatus(snapshot, TurnStatusRunning) == 1
	})
}

func TestFailedTurnKeepsQueuedPromotionWorking(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Failure promotion")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	conversationID := created.Conversation.ID
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, "hold fail"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold fail")
	if _, err := service.queueTestTurn(ctx, workspaceID, conversationID, "hold after failure"); err != nil {
		t.Fatalf("QueueTurn: %v", err)
	}
	if _, err := service.steerTestTurn(ctx, workspaceID, conversationID, "release failure"); err != nil {
		t.Fatalf("SteerTurn: %v", err)
	}
	runtime.waitForStart(t, "hold after failure")
	promoted := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWorking &&
			len(snapshot.Queue) == 0 &&
			countTurnStatus(snapshot, TurnStatusFailed) == 1 &&
			countTurnStatus(snapshot, TurnStatusRunning) == 1
	})
	if promoted.Conversation.Status != ConversationStatusWorking {
		t.Fatalf("promoted conversation status = %s", promoted.Conversation.Status)
	}
	if _, err := service.StopTurn(ctx, workspaceID, conversationID); err != nil {
		t.Fatalf("StopTurn promoted work: %v", err)
	}
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusIdle && latestSnapshotTurn(snapshot).Status == TurnStatusCancelled
	})
}

func TestSubagentActivityProjectsTypedLifecycle(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Subagent lifecycle")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "subagent"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "subagent")
	completed := assertServiceSnapshot(t, service, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	want := map[TrajectoryEventKind]bool{
		TrajectoryEventSubagentStarted:   false,
		TrajectoryEventSubagentUpdated:   false,
		TrajectoryEventSubagentCompleted: false,
	}
	for _, event := range completed.Trajectory.Events {
		if _, ok := want[event.Kind]; ok {
			want[event.Kind] = true
		}
	}
	for kind, found := range want {
		if !found {
			t.Errorf("typed subagent trajectory is missing %s", kind)
		}
	}
}

func TestRuntimeCompletionRequiresDurableTerminalNotification(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Missing terminal")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "missing terminal"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "missing terminal")
	failed := assertServiceSnapshot(t, service, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusFailed
	})
	if message := latestSnapshotTurn(failed).Error.Message; message != "agent runtime ended without a durable terminal event" {
		t.Fatalf("missing-terminal failure = %q", message)
	}
}

func TestProviderEventScopeMismatchFailsTurnWithoutPersistingEvent(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	created, err := service.CreateTopic(ctx, workspaceID, "Provider scope")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "mismatched provider scope"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "mismatched provider scope")
	failed := assertServiceSnapshot(t, service, workspaceID, created.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusFailed
	})
	for _, event := range failed.Trajectory.Events {
		if event.AgentMessageCompleted != nil && event.AgentMessageCompleted.Text == "must not persist" {
			t.Fatal("mismatched provider event was persisted")
		}
	}
}

func newReviewServiceHarness(t *testing.T) (*Store, *Service, *serviceTestAgentRuntime, string) {
	t.Helper()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() { cleanupReviewService(t, store, service) })
	return store, service, runtime, workspaceID
}

func cleanupReviewService(t *testing.T, store *Store, service *Service) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := service.Shutdown(ctx); err != nil {
		t.Errorf("Shutdown: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Errorf("Close store: %v", err)
	}
}

func approvalLifecycle(
	snapshot ConversationSnapshot,
	approvalID string,
) (*TrajectoryApprovalRequest, *TrajectoryApprovalResolution) {
	var request *TrajectoryApprovalRequest
	var resolution *TrajectoryApprovalResolution
	for _, event := range snapshot.Trajectory.Events {
		if event.ApprovalRequested != nil && event.ApprovalRequested.Approval.ID == approvalID {
			copy := event.ApprovalRequested.Approval
			request = &copy
		}
		if event.ApprovalResolved != nil && event.ApprovalResolved.Resolution.ApprovalID == approvalID {
			copy := event.ApprovalResolved.Resolution
			resolution = &copy
		}
	}
	return request, resolution
}

func findRunningTurn(snapshot ConversationSnapshot) (ConversationTurn, error) {
	for _, turn := range snapshot.Turns.Turns {
		if turn.Status == TurnStatusRunning {
			return turn, nil
		}
	}
	return ConversationTurn{}, fmt.Errorf("bounded snapshot omitted its running turn")
}

func countTurnStatus(snapshot ConversationSnapshot, status TurnStatus) int {
	count := 0
	for _, turn := range snapshot.Turns.Turns {
		if turn.Status == status {
			count++
		}
	}
	return count
}
