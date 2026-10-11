package reviewstate

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
	"time"

	"github.com/riteofstring/setta/apps/review/backend/internal/contracts"
)

func TestStoreCreatesReplacesPublishesAndReloadsState(t *testing.T) {
	root := t.TempDir()
	store, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := store.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	initial := <-stream
	if initial.Revision != 0 || initial.ProjectID != "project-one" {
		t.Fatalf("initial state = %#v", initial)
	}
	candidate := initial
	candidate.Revision = 1
	updated, err := store.Replace(0, candidate)
	if err != nil {
		t.Fatalf("Replace() error = %v", err)
	}
	if updated.Revision != 1 {
		t.Fatalf("updated state = %#v", updated)
	}
	select {
	case published := <-stream:
		if published.Revision != 1 {
			t.Fatalf("published state = %#v", published)
		}
	case <-time.After(time.Second):
		t.Fatal("replacement was not published")
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	reloaded, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open(reload) error = %v", err)
	}
	defer reloaded.Close()
	snapshot, err := reloaded.Snapshot()
	if err != nil || snapshot.Revision != 1 {
		t.Fatalf("Snapshot() = %#v, %v", snapshot, err)
	}
}

func TestStoreRejectsConflictsWithoutChangingDurableState(t *testing.T) {
	root := t.TempDir()
	store, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	initial, _ := store.Snapshot()
	wrongRevision := initial
	wrongRevision.Revision = 2
	if _, err := store.Replace(0, wrongRevision); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("Replace(wrong revision) error = %v", err)
	}
	wrongIdentity := initial
	wrongIdentity.ProjectID = "project-two"
	wrongIdentity.Revision = 1
	if _, err := store.Replace(0, wrongIdentity); !errors.Is(err, ErrIdentityConflict) {
		t.Fatalf("Replace(wrong identity) error = %v", err)
	}
	current, err := store.Snapshot()
	if err != nil || !reflect.DeepEqual(current, initial) {
		t.Fatalf("Snapshot() = %#v, %v", current, err)
	}
}

func TestStoresRejectStaleWriterAndRefreshFromDurableState(t *testing.T) {
	root := t.TempDir()
	first, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open(first) error = %v", err)
	}
	defer first.Close()
	second, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open(second) error = %v", err)
	}
	defer second.Close()
	firstInitial, err := first.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot(first) error = %v", err)
	}
	secondInitial, err := second.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot(second) error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := second.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe(second) error = %v", err)
	}
	<-stream

	firstCandidate := firstInitial
	firstCandidate.Revision = 1
	firstCandidate.Assessments = []contracts.ExternalAssessment{testAssessment("first-writer")}
	secondCandidate := secondInitial
	secondCandidate.Revision = 1
	secondCandidate.Assessments = []contracts.ExternalAssessment{testAssessment("stale-writer")}
	if _, err := first.Replace(0, firstCandidate); err != nil {
		t.Fatalf("Replace(first) error = %v", err)
	}
	if _, err := second.Replace(0, secondCandidate); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("Replace(stale second) error = %v", err)
	}
	secondSnapshot, err := second.Snapshot()
	requireAssessmentState(t, "Snapshot(second)", secondSnapshot, err, "first-writer")
	select {
	case published := <-stream:
		requireAssessmentState(t, "published state", published, nil, "first-writer")
	case <-time.After(time.Second):
		t.Fatal("durable state was not published to stale store")
	}
	reloaded, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open(reloaded) error = %v", err)
	}
	defer reloaded.Close()
	durable, err := reloaded.Snapshot()
	requireAssessmentState(t, "Snapshot(reloaded)", durable, err, "first-writer")
}

func TestStoresSerializeConcurrentWritersAtOneRevision(t *testing.T) {
	root := t.TempDir()
	first, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open(first) error = %v", err)
	}
	defer first.Close()
	second, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open(second) error = %v", err)
	}
	defer second.Close()
	firstInitial, err := first.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot(first) error = %v", err)
	}
	secondInitial, err := second.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot(second) error = %v", err)
	}
	firstCandidate := firstInitial
	firstCandidate.Revision = 1
	firstCandidate.Assessments = []contracts.ExternalAssessment{testAssessment("first-writer")}
	secondCandidate := secondInitial
	secondCandidate.Revision = 1
	secondCandidate.Assessments = []contracts.ExternalAssessment{testAssessment("second-writer")}

	type result struct {
		assessmentID string
		err          error
	}
	start := make(chan struct{})
	results := make(chan result, 2)
	go func() {
		<-start
		_, replaceErr := first.Replace(0, firstCandidate)
		results <- result{assessmentID: "first-writer", err: replaceErr}
	}()
	go func() {
		<-start
		_, replaceErr := second.Replace(0, secondCandidate)
		results <- result{assessmentID: "second-writer", err: replaceErr}
	}()
	close(start)
	firstResult := <-results
	secondResult := <-results
	resultsByOutcome := []result{firstResult, secondResult}
	winner := ""
	conflicts := 0
	for _, outcome := range resultsByOutcome {
		switch {
		case outcome.err == nil:
			winner = outcome.assessmentID
		case errors.Is(outcome.err, ErrRevisionConflict):
			conflicts++
		default:
			t.Fatalf("Replace(%s) error = %v", outcome.assessmentID, outcome.err)
		}
	}
	if winner == "" || conflicts != 1 {
		t.Fatalf("results = %#v", resultsByOutcome)
	}
	reloaded, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open(reloaded) error = %v", err)
	}
	defer reloaded.Close()
	durable, err := reloaded.Snapshot()
	requireAssessmentState(t, "Snapshot(reloaded)", durable, err, winner)
}

func TestStoreRejectsSymlinkedStateDirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink permissions vary on Windows")
	}
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".local"), 0o755); err != nil {
		t.Fatalf("Mkdir() error = %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(root, ".local", "review")); err != nil {
		t.Fatalf("Symlink() error = %v", err)
	}
	if _, err := Open(root, "project-one"); err == nil {
		t.Fatal("Open() error = nil")
	}
}

func TestStoreRejectsAnotherProjectIdentity(t *testing.T) {
	root := t.TempDir()
	store, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if _, err := Open(root, "project-two"); !errors.Is(err, ErrIdentityConflict) {
		t.Fatalf("Open(other identity) error = %v", err)
	}
}

func testAssessment(id string) contracts.ExternalAssessment {
	return contracts.ExternalAssessment{
		Version: 1, ID: id, RequestID: "request-one", ClaimID: "claim-one", Assessment: "supported",
		Rationale: "The evidence supports this claim.", Producer: contracts.AssessmentProducer{Model: "model", Harness: "harness"}, CreatedAt: "2026-09-19T12:00:00Z",
	}
}

func requireAssessmentState(t *testing.T, label string, document Document, err error, assessmentID string) {
	t.Helper()
	if err != nil {
		t.Fatalf("%s error = %v", label, err)
	}
	if document.Revision != 1 {
		t.Fatalf("%s revision = %d", label, document.Revision)
	}
	if len(document.Assessments) != 1 {
		t.Fatalf("%s assessments = %#v", label, document.Assessments)
	}
	if document.Assessments[0].ID != assessmentID {
		t.Fatalf("%s assessment = %#v, want %q", label, document.Assessments[0], assessmentID)
	}
}
