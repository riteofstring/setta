package conversation

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"setta/internal/master"
)

func TestStoreAcceptsMasterInputIdempotentlyWithCommittedEvent(t *testing.T) {
	store := newTestStore(t)
	workspaceID := "workspace_alpha"
	conversationID := "conversation_alpha"
	paneID := "pane_alpha"
	input := master.MasterInput{
		ID:                    "input_alpha",
		Text:                  "  Route this exact voice transcript.  ",
		Modality:              master.MasterInputModalityVoice,
		Source:                master.MasterInputSourceShell,
		SubmittedAt:           "2026-07-12T18:00:00Z",
		FocusedWorkspaceID:    &workspaceID,
		FocusedConversationID: &conversationID,
		FocusedPaneID:         &paneID,
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

func TestStoreListsBoundedRecentMasterInputsAcrossRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	for index := 1; index <= master.RecentMasterInputCapacity+5; index++ {
		input := master.MasterInput{
			ID:          fmt.Sprintf("input_%02d", index),
			Text:        fmt.Sprintf("Request %d", index),
			Modality:    master.MasterInputModalityText,
			Source:      master.MasterInputSourceShell,
			SubmittedAt: "2026-07-12T18:00:00Z",
		}
		if _, err := store.AcceptMasterInput(
			context.Background(),
			input,
			"2026-07-12T18:00:01Z",
		); err != nil {
			t.Fatalf("AcceptMasterInput(%d): %v", index, err)
		}
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() {
		if err := reopened.Close(); err != nil {
			t.Errorf("close reopened store: %v", err)
		}
	})
	history, err := reopened.ListRecentMasterInputs(context.Background())
	if err != nil {
		t.Fatalf("ListRecentMasterInputs: %v", err)
	}
	if err := history.Validate(); err != nil {
		t.Fatalf("history validation: %v", err)
	}
	if len(history.Inputs) != master.RecentMasterInputCapacity ||
		history.Inputs[0].Sequence != 6 ||
		history.Inputs[len(history.Inputs)-1].Sequence != master.RecentMasterInputCapacity+5 {
		t.Fatalf("recent history = %+v", history)
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
	_, err = store.ListRecentMasterInputs(context.Background())
	if !IsCorruptStateError(err) {
		t.Fatalf("ListRecentMasterInputs error = %T %v, want CorruptStateError", err, err)
	}
}
