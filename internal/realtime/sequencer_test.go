package realtime

import (
	"errors"
	"testing"
)

func TestSequencerTracksIndependentProjectAndSessionScopes(t *testing.T) {
	t.Parallel()

	// Realtime ordering is per project and per share session, so each scope gets
	// an independent monotonic counter.
	sequencer := NewSequencer()

	projectAFirst, err := sequencer.Next(Scope{ProjectID: "project-a"})
	if err != nil {
		t.Fatalf("next sequence for project-a: %v", err)
	}
	projectASecond, err := sequencer.Next(Scope{ProjectID: "project-a"})
	if err != nil {
		t.Fatalf("second sequence for project-a: %v", err)
	}
	sessionAFirst, err := sequencer.Next(Scope{ProjectID: "project-a", ShareSessionID: "session-a"})
	if err != nil {
		t.Fatalf("next sequence for project-a/session-a: %v", err)
	}
	sessionBFirst, err := sequencer.Next(Scope{ProjectID: "project-a", ShareSessionID: "session-b"})
	if err != nil {
		t.Fatalf("next sequence for project-a/session-b: %v", err)
	}

	if projectAFirst != 1 || projectASecond != 2 {
		t.Fatalf("expected project-a sequences [1 2], got [%d %d]", projectAFirst, projectASecond)
	}
	if sessionAFirst != 1 || sessionBFirst != 1 {
		t.Fatalf("expected session-scoped sequences to start at 1, got [%d %d]", sessionAFirst, sessionBFirst)
	}
}

func TestSequencerResetStartsScopeBackAtOne(t *testing.T) {
	t.Parallel()

	// Force refresh should clear the relevant scope so the next realtime message
	// starts back at sequence 1.
	sequencer := NewSequencer()
	scope := Scope{ProjectID: "project-a", ShareSessionID: "session-a"}

	if _, err := sequencer.Next(scope); err != nil {
		t.Fatalf("seed scope sequence: %v", err)
	}
	if err := sequencer.Reset(scope); err != nil {
		t.Fatalf("reset scope: %v", err)
	}

	next, err := sequencer.Next(scope)
	if err != nil {
		t.Fatalf("next sequence after reset: %v", err)
	}
	if next != 1 {
		t.Fatalf("expected next sequence after reset to be 1, got %d", next)
	}
}

func TestSequencerDropShareSessionClearsMatchingSessionScopes(t *testing.T) {
	t.Parallel()

	// Share-session teardown should drop only that session's counters without
	// touching IDE-mode or other session scopes.
	sequencer := NewSequencer()
	keepScope := Scope{ProjectID: "project-a"}
	dropScopeA := Scope{ProjectID: "project-a", ShareSessionID: "session-a"}
	dropScopeB := Scope{ProjectID: "project-b", ShareSessionID: "session-a"}
	otherScope := Scope{ProjectID: "project-a", ShareSessionID: "session-b"}
	for _, scope := range []Scope{keepScope, dropScopeA, dropScopeB, otherScope} {
		if _, err := sequencer.Next(scope); err != nil {
			t.Fatalf("seed scope %v: %v", scope, err)
		}
	}

	sequencer.DropShareSession("session-a")

	if next, err := sequencer.Next(keepScope); err != nil || next != 2 {
		t.Fatalf("expected keep scope next sequence to be 2 after drop, got %d err=%v", next, err)
	}
	if next, err := sequencer.Next(otherScope); err != nil || next != 2 {
		t.Fatalf("expected other session next sequence to be 2 after drop, got %d err=%v", next, err)
	}
	if next, err := sequencer.Next(dropScopeA); err != nil || next != 1 {
		t.Fatalf("expected dropped scope A to restart at 1, got %d err=%v", next, err)
	}
	if next, err := sequencer.Next(dropScopeB); err != nil || next != 1 {
		t.Fatalf("expected dropped scope B to restart at 1, got %d err=%v", next, err)
	}
}

func TestSequencerRejectsBlankProjectID(t *testing.T) {
	t.Parallel()

	// A realtime scope without a project id is invalid because sequence ownership
	// would become ambiguous.
	sequencer := NewSequencer()

	if _, err := sequencer.Next(Scope{}); !errors.Is(err, ErrEmptyProjectID) {
		t.Fatalf("expected empty project id error, got %v", err)
	}
	if err := sequencer.Reset(Scope{}); !errors.Is(err, ErrEmptyProjectID) {
		t.Fatalf("expected empty project id error on reset, got %v", err)
	}
}
