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
	observed := newObservedNarrationKinds()
	waitForNonTerminalNarrationKind(t, observer.observations, observed, TrajectoryEventTurnStarted)
	assertObservedTrajectoryKinds(t, observed, TrajectoryEventUserInputAccepted)
	assertObservedSemanticKinds(t, observed, NarratorSemanticEventTaskStarted)

	if _, err := service.steerTestTurn(ctx, workspaceID, created.Conversation.ID, "finish observation"); err != nil {
		t.Fatalf("SteerTurn: %v", err)
	}
	terminal := waitForTerminalNarrationObservation(t, observer.observations, observed)
	assertObservedTrajectoryKinds(t, observed,
		TrajectoryEventTurnSteered,
		TrajectoryEventAgentMessageCompleted,
		TrajectoryEventActivityCompleted,
		TrajectoryEventArtifactEmitted,
		TrajectoryEventTurnCompleted,
	)
	assertNarrationObservationContains(t, terminal, TrajectoryEventTurnCompleted, true)
	assertNarrationObservationContainsSemantic(t, terminal, NarratorSemanticEventTaskCompleted, true)
	assertObservedSemanticKinds(t, observed,
		NarratorSemanticEventMeaningfulProgress,
		NarratorSemanticEventArtifactOrResultEmitted,
		NarratorSemanticEventTaskCompleted,
	)
	assertTerminalSemanticIncludesArtifact(t, terminal)
	snapshot, err := store.ReadSnapshot(ctx, workspaceID, created.Conversation.ID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	assertTerminalObservedAfterCommit(t, terminal, snapshot)
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
		for _, event := range observation.Semantic {
			if err := event.Validate(); err != nil {
				t.Fatalf("invalid semantic event: %v", err)
			}
		}
		if observation.Terminal {
			assertNarrationObservationContains(t, observation, TrajectoryEventTurnFailed, true)
			assertNarrationObservationContainsSemantic(t, observation, NarratorSemanticEventTaskFailed, true)
			return
		}
	}
}

type observedNarrationKinds struct {
	trajectory map[TrajectoryEventKind]bool
	semantic   map[NarratorSemanticEventKind]bool
}

func newObservedNarrationKinds() *observedNarrationKinds {
	return &observedNarrationKinds{
		trajectory: map[TrajectoryEventKind]bool{},
		semantic:   map[NarratorSemanticEventKind]bool{},
	}
}

func waitForNonTerminalNarrationKind(
	t *testing.T,
	observations <-chan NarrationTrajectoryObservation,
	observed *observedNarrationKinds,
	kind TrajectoryEventKind,
) {
	t.Helper()
	for !observed.trajectory[kind] {
		observation := readNarrationObservation(t, observations)
		if observation.Terminal {
			t.Fatalf("unexpected terminal observation before %s: %+v", kind, observation)
		}
		recordNarrationObservationKinds(t, observation, observed)
	}
}

func waitForTerminalNarrationObservation(
	t *testing.T,
	observations <-chan NarrationTrajectoryObservation,
	observed *observedNarrationKinds,
) NarrationTrajectoryObservation {
	t.Helper()
	for {
		observation := readNarrationObservation(t, observations)
		recordNarrationObservationKinds(t, observation, observed)
		if observation.Terminal {
			return observation
		}
	}
}

func recordNarrationObservationKinds(
	t *testing.T,
	observation NarrationTrajectoryObservation,
	observed *observedNarrationKinds,
) {
	t.Helper()
	for _, event := range observation.Trajectory {
		observed.trajectory[event.Kind] = true
	}
	for _, event := range observation.Semantic {
		if err := event.Validate(); err != nil {
			t.Fatalf("invalid semantic event: %v", err)
		}
		observed.semantic[event.Kind] = true
	}
}

func assertObservedTrajectoryKinds(
	t *testing.T,
	observed *observedNarrationKinds,
	kinds ...TrajectoryEventKind,
) {
	t.Helper()
	for _, kind := range kinds {
		if !observed.trajectory[kind] {
			t.Errorf("narration observer did not receive %s", kind)
		}
	}
}

func assertObservedSemanticKinds(
	t *testing.T,
	observed *observedNarrationKinds,
	kinds ...NarratorSemanticEventKind,
) {
	t.Helper()
	for _, kind := range kinds {
		if !observed.semantic[kind] {
			t.Errorf("narration observer did not receive semantic %s", kind)
		}
	}
}

func assertTerminalSemanticIncludesArtifact(
	t *testing.T,
	terminal NarrationTrajectoryObservation,
) {
	t.Helper()
	completed := latestSemanticEventOfKind(terminal, NarratorSemanticEventTaskCompleted)
	if completed == nil ||
		completed.TaskCompleted == nil ||
		len(completed.TaskCompleted.Artifacts) == 0 {
		t.Fatalf("terminal semantic event did not include committed artifacts: %+v", terminal.Semantic)
	}
}

func assertTerminalObservedAfterCommit(
	t *testing.T,
	terminal NarrationTrajectoryObservation,
	snapshot ConversationSnapshot,
) {
	t.Helper()
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

func assertNarrationObservationContainsSemantic(
	t *testing.T,
	observation NarrationTrajectoryObservation,
	kind NarratorSemanticEventKind,
	terminal bool,
) {
	t.Helper()
	if observation.Terminal != terminal || observation.WorkspaceID == "" ||
		observation.ConversationID == "" || observation.TurnID == "" {
		t.Fatalf("narration observation envelope = %+v", observation)
	}
	if latestSemanticEventOfKind(observation, kind) != nil {
		return
	}
	t.Fatalf("narration observation does not contain semantic %s: %+v", kind, observation)
}

func latestSemanticEventOfKind(
	observation NarrationTrajectoryObservation,
	kind NarratorSemanticEventKind,
) *NarratorSemanticEvent {
	for index := len(observation.Semantic) - 1; index >= 0; index-- {
		if observation.Semantic[index].Kind == kind &&
			observation.Semantic[index].ConversationID == observation.ConversationID &&
			observation.Semantic[index].TurnID == observation.TurnID {
			return &observation.Semantic[index]
		}
	}
	return nil
}
