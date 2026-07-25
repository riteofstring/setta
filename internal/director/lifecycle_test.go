package director

import (
	"testing"

	"setta/internal/conversation"
)

func TestWorkstreamLifecycleRejectsImpossibleTransitions(t *testing.T) {
	if err := ValidateWorkstreamTransition(WorkstreamStatusIdle, WorkstreamStatusRunning); err != nil {
		t.Fatalf("idle to running must be allowed: %v", err)
	}
	if err := ValidateWorkstreamTransition(WorkstreamStatusArchived, WorkstreamStatusRunning); err == nil {
		t.Fatal("an archived workstream must not become running again")
	}
	if err := ValidateWorkstreamTransition(WorkstreamStatusIdle, WorkstreamStatusAwaitingApproval); err == nil {
		t.Fatal("an idle workstream has no run that could request approval")
	}
	if err := ValidateWorkstreamTransition(WorkstreamStatusIdle, "sleeping"); err == nil {
		t.Fatal("an unknown workstream status must be rejected")
	}
	if err := ValidateInitialWorkstreamStatus(WorkstreamStatusRunning); err == nil {
		t.Fatal("a workstream must not be registered as already running")
	}
}

func TestRunLifecycleMatchesDurableTurnStatuses(t *testing.T) {
	if err := ValidateRunTransition(conversation.TurnStatusQueued, conversation.TurnStatusRunning); err != nil {
		t.Fatalf("queued to running must be allowed: %v", err)
	}
	if err := ValidateRunTransition(conversation.TurnStatusCompleted, conversation.TurnStatusRunning); err == nil {
		t.Fatal("a completed run must not restart")
	}
	if !IsTerminalRunStatus(conversation.TurnStatusFailed) {
		t.Fatal("a failed run must be terminal")
	}
	if IsTerminalRunStatus(conversation.TurnStatusRunning) {
		t.Fatal("a running run must not be terminal")
	}
}

func TestSupportingLifecyclesRejectResurrection(t *testing.T) {
	if err := ValidateQueueItemTransition(QueueItemStatusPromoted, QueueItemStatusQueued); err == nil {
		t.Fatal("a promoted queue item must not return to the queue")
	}
	if err := ValidateApprovalTransition(ApprovalStatusDenied, ApprovalStatusApproved); err == nil {
		t.Fatal("a denied approval must not become approved")
	}
	if err := ValidateResourceRequestTransition(ResourceRequestStatusResolved, ResourceRequestStatusRequested); err == nil {
		t.Fatal("a resolved resource request must not reopen")
	}
	if err := ValidateArtifactTransition(ArtifactStatusAvailable, ArtifactStatusUnresolved); err == nil {
		t.Fatal("a durable artifact must not become unresolved")
	}
	if err := ValidateArtifactTransition(ArtifactStatusDeclared, ArtifactStatusUnresolved); err != nil {
		t.Fatalf("a declared artifact that was never delivered must be unresolvable: %v", err)
	}
	if err := ValidateRecoveryTransition(RecoveryStatusUnrecoverable, RecoveryStatusRetrying); err != nil {
		t.Fatalf("the user must be able to retry an unrecoverable state: %v", err)
	}
	if err := ValidateRecoveryTransition(RecoveryStatusRecovered, RecoveryStatusRetrying); err == nil {
		t.Fatal("a recovered state must not silently retry")
	}
}

func TestSemanticNodeStatusTableCoversEveryKind(t *testing.T) {
	for _, kind := range SemanticNodeKinds() {
		statuses, err := SemanticNodeKindStatuses(kind)
		if err != nil {
			t.Fatalf("node kind %q has no status table: %v", kind, err)
		}
		if len(statuses) == 0 {
			t.Fatalf("node kind %q allows no status", kind)
		}
		for _, status := range statuses {
			if err := ValidateSemanticNodeKindStatus(kind, status); err != nil {
				t.Fatalf("node kind %q rejected its own status %q: %v", kind, status, err)
			}
		}
	}
	if err := ValidateSemanticNodeKindStatus(SemanticNodeArtifact, SemanticNodeStatusFailed); err == nil {
		t.Fatal("an artifact node must not carry a failed status")
	}
	if err := ValidateSemanticNodeTransition(SemanticNodeStatusSucceeded, SemanticNodeStatusActive); err == nil {
		t.Fatal("a succeeded node must not reactivate")
	}
	if !IsTerminalSemanticNodeStatus(SemanticNodeStatusCancelled) {
		t.Fatal("cancelled must be terminal")
	}
}
