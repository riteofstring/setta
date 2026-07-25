package conversation

import (
	"context"
	"errors"
	"sync"
	"testing"

	"setta/internal/master"
)

func TestStoreAcceptsMasterInputIdempotentlyWithCommittedEvent(t *testing.T) {
	store := newTestStore(t)
	workspaceID := "workspace_alpha"
	conversationID := "conversation_alpha"
	input := master.MasterInput{
		ID:                    "input_alpha",
		Text:                  "  Route this exact voice transcript.  ",
		Modality:              master.MasterInputModalityVoice,
		Source:                master.MasterInputSourceShell,
		SubmittedAt:           "2026-07-12T18:00:00Z",
		FocusedWorkspaceID:    &workspaceID,
		FocusedConversationID: &conversationID,
	}

	accepted, err := store.AcceptMasterInput(
		context.Background(),
		input,
		"2026-07-12T18:00:01Z",
	)
	if err != nil {
		t.Fatalf("AcceptMasterInput: %v", err)
	}
	if accepted.Sequence != 1 || !master.EqualInputs(accepted.Input, input) {
		t.Fatalf("accepted input = %+v", accepted)
	}

	duplicate, err := store.AcceptMasterInput(
		context.Background(),
		input,
		"2026-07-12T18:00:09Z",
	)
	if err != nil {
		t.Fatalf("duplicate AcceptMasterInput: %v", err)
	}
	if duplicate.AcceptedAt != accepted.AcceptedAt || duplicate.Sequence != accepted.Sequence {
		t.Fatalf("duplicate = %+v, want original %+v", duplicate, accepted)
	}
	if got := countRows(t, store, "master_inputs"); got != 1 {
		t.Fatalf("master input rows = %d, want 1", got)
	}

	events, err := store.ReadCommittedStreamEvents(
		context.Background(),
		master.InputStreamID,
		0,
		10,
	)
	if err != nil {
		t.Fatalf("ReadCommittedStreamEvents: %v", err)
	}
	if len(events) != 1 || events[0].Kind != master.InputAcceptedEventKind {
		t.Fatalf("events = %+v, want one accepted event", events)
	}

	workspaceID = "mutated"
	stored, found, err := store.ReadMasterInput(context.Background(), input.ID)
	if err != nil {
		t.Fatalf("ReadMasterInput: %v", err)
	}
	if !found || *stored.Input.FocusedWorkspaceID != "workspace_alpha" {
		t.Fatalf("stored input = %+v found=%v", stored, found)
	}
}

func TestStoreRejectsChangedMasterInputIdempotencyKey(t *testing.T) {
	store := newTestStore(t)
	input := master.MasterInput{
		ID:          "input_conflict",
		Text:        "First request",
		Modality:    master.MasterInputModalityVoice,
		Source:      master.MasterInputSourceShell,
		SubmittedAt: "2026-07-12T18:00:00Z",
	}
	if _, err := store.AcceptMasterInput(context.Background(), input, "2026-07-12T18:00:01Z"); err != nil {
		t.Fatalf("AcceptMasterInput: %v", err)
	}
	input.Text = "Changed request"
	_, err := store.AcceptMasterInput(context.Background(), input, "2026-07-12T18:00:02Z")
	if !master.IsInputConflict(err) {
		t.Fatalf("changed duplicate error = %T %v, want InputConflictError", err, err)
	}
	if got := countRows(t, store, "master_inputs"); got != 1 {
		t.Fatalf("master input rows = %d, want 1", got)
	}
}

func TestStoreSerializesConcurrentDuplicateMasterInputAcceptance(t *testing.T) {
	store := newTestStore(t)
	input := master.MasterInput{
		ID:          "input_concurrent",
		Text:        "Concurrent retry",
		Modality:    master.MasterInputModalityVoice,
		Source:      master.MasterInputSourceShell,
		SubmittedAt: "2026-07-12T18:00:00Z",
	}
	const callers = 24
	results := make(chan error, callers)
	var wait sync.WaitGroup
	for range callers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			accepted, err := store.AcceptMasterInput(
				context.Background(),
				input,
				"2026-07-12T18:00:01Z",
			)
			if err == nil && accepted.Sequence != 1 {
				err = errors.New("duplicate acceptance returned a different sequence")
			}
			results <- err
		}()
	}
	wait.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatalf("concurrent acceptance: %v", err)
		}
	}
	if got := countRows(t, store, "master_inputs"); got != 1 {
		t.Fatalf("master input rows = %d, want 1", got)
	}
}

func TestStoreClassifiesMalformedMasterInputAsCorruptState(t *testing.T) {
	store := newTestStore(t)
	input := master.MasterInput{
		ID:          "input_corrupt",
		Text:        "Corrupt after acceptance",
		Modality:    master.MasterInputModalityVoice,
		Source:      master.MasterInputSourceShell,
		SubmittedAt: "2026-07-12T18:00:00Z",
	}
	if _, err := store.AcceptMasterInput(context.Background(), input, "2026-07-12T18:00:01Z"); err != nil {
		t.Fatalf("AcceptMasterInput: %v", err)
	}
	if _, err := store.writer.ExecContext(
		context.Background(),
		`UPDATE master_inputs SET accepted_at = 'invalid' WHERE id = ?`,
		input.ID,
	); err != nil {
		t.Fatalf("corrupt master input: %v", err)
	}
	_, _, err := store.ReadMasterInput(context.Background(), input.ID)
	if !IsCorruptStateError(err) {
		t.Fatalf("ReadMasterInput error = %T %v, want CorruptStateError", err, err)
	}
	_, err = store.ReadActiveMasterShellInteraction(context.Background())
	if !IsCorruptStateError(err) {
		t.Fatalf("ReadActiveMasterShellInteraction error = %T %v, want CorruptStateError", err, err)
	}
}
