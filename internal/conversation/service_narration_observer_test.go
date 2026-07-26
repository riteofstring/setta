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
	if _, err := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "hold"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	observedKinds := map[TrajectoryEventKind]bool{}
	for !observedKinds[TrajectoryEventTurnStarted] {
		observation := readNarrationObservation(t, observer.observations)
		if observation.Terminal {
			t.Fatalf("unexpected terminal observation before turn start: %+v", observation)
		}
		for _, event := range observation.Trajectory {
			observedKinds[event.Kind] = true
		}
	}
	if !observedKinds[TrajectoryEventUserInputAccepted] {
		t.Fatal("narration observer did not receive accepted input")
	}

	if _, err := service.steerTestTurn(ctx, workspaceID, created.Conversation.ID, "finish observation"); err != nil {
		t.Fatalf("SteerTurn: %v", err)
	}
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

func TestServiceMarksFailedProviderTurnAsTerminalNarrationObservation(t *testing.T) {
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

	created, err := service.CreateTopic(ctx, workspaceID, "Failed narration observation")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, created.Conversation.ID, "hold fail"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold fail")
	if _, err := service.steerTestTurn(ctx, workspaceID, created.Conversation.ID, "release failure"); err != nil {
		t.Fatalf("SteerTurn: %v", err)
	}
	for {
		observation := readNarrationObservation(t, observer.observations)
		if observation.Terminal {
			assertNarrationObservationContains(t, observation, TrajectoryEventTurnFailed, true)
			return
		}
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
