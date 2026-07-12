package conversation

import (
	"context"
	"testing"
	"time"
)

func TestServicePublishesCommittedAgentLifecycleToNarrationObserver(t *testing.T) {
	observer := &recordingNarrationObserver{observations: make(chan NarrationTrajectoryObservation, 16)}
	store, service, runtime, workspaceID := newConversationServiceTestHarness(
		t,
		t.TempDir(),
		WithNarrationTrajectoryObserver(observer),
	)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	t.Cleanup(func() {
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer shutdownCancel()
		if err := service.Shutdown(shutdownCtx); err != nil {
			t.Errorf("Shutdown: %v", err)
		}
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})

	created, err := service.CreateTopic(ctx, workspaceID, "Narration observation")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.SendTurn(ctx, workspaceID, created.Conversation.ID, "hold"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	started := readNarrationObservation(t, observer.observations)
	assertNarrationObservationContains(t, started, TrajectoryEventTurnStarted, false)

	if _, err := service.SteerTurn(ctx, workspaceID, created.Conversation.ID, "finish observation"); err != nil {
		t.Fatalf("SteerTurn: %v", err)
	}
	observedKinds := map[TrajectoryEventKind]bool{}
	var terminal NarrationTrajectoryObservation
	for !terminal.Terminal {
		observation := readNarrationObservation(t, observer.observations)
		for _, event := range observation.Trajectory {
			observedKinds[event.Kind] = true
		}
		if observation.Terminal {
			terminal = observation
		}
	}
	for _, kind := range []TrajectoryEventKind{
		TrajectoryEventTurnSteered,
		TrajectoryEventAgentMessageCompleted,
		TrajectoryEventActivityCompleted,
		TrajectoryEventArtifactEmitted,
		TrajectoryEventTurnCompleted,
	} {
		if !observedKinds[kind] {
			t.Errorf("narration observer did not receive %s", kind)
		}
	}
	assertNarrationObservationContains(t, terminal, TrajectoryEventTurnCompleted, true)
	snapshot, err := store.ReadSnapshot(ctx, workspaceID, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	lastObserved := terminal.Trajectory[len(terminal.Trajectory)-1]
	if snapshot.Conversation.LastTrajectorySequence < lastObserved.Sequence ||
		latestSnapshotTurn(snapshot).Status != TurnStatusCompleted {
		t.Fatalf("observer ran before terminal state committed: observation=%+v snapshot=%+v", terminal, snapshot)
	}
}

type recordingNarrationObserver struct {
	observations chan NarrationTrajectoryObservation
}

func (observer *recordingNarrationObserver) ObserveCommittedTrajectory(
	observation NarrationTrajectoryObservation,
) {
	observer.observations <- observation
}

func readNarrationObservation(
	t *testing.T,
	observations <-chan NarrationTrajectoryObservation,
) NarrationTrajectoryObservation {
	t.Helper()
	select {
	case observation := <-observations:
		return observation
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for narration trajectory observation")
		return NarrationTrajectoryObservation{}
	}
}

func assertNarrationObservationContains(
	t *testing.T,
	observation NarrationTrajectoryObservation,
	kind TrajectoryEventKind,
	terminal bool,
) {
	t.Helper()
	if observation.Terminal != terminal || observation.WorkspaceID == "" ||
		observation.ConversationID == "" || observation.TurnID == "" {
		t.Fatalf("narration observation envelope = %+v", observation)
	}
	for _, event := range observation.Trajectory {
		if event.Kind == kind && event.ConversationID == observation.ConversationID &&
			event.TurnID != nil && *event.TurnID == observation.TurnID {
			return
		}
	}
	t.Fatalf("narration observation does not contain %s: %+v", kind, observation)
}
