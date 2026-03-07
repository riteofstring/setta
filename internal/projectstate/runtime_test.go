package projectstate

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestOpenRuntimeLoadsCurrentDocumentAndRevision(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	initial := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), initial); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	snapshot := runtime.Snapshot()

	if snapshot.Revision != 1 {
		t.Fatalf("expected initial revision 1, got %d", snapshot.Revision)
	}
	if snapshot.Document.DefaultProjectID != "project-alpha" {
		t.Fatalf("expected default project-alpha, got %q", snapshot.Document.DefaultProjectID)
	}
}

func TestRuntimeMutateBumpsRevisionOnlyWhenStateChanges(t *testing.T) {
	t.Parallel()

	runtime := openTestRuntime(t, newTestStore(t, filepath.Join(t.TempDir(), "project.json")))

	firstSnapshot, err := runtime.Mutate(func(document Document) (Document, error) {
		document.Projects["project-alpha"] = Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	})
	if err != nil {
		t.Fatalf("mutate runtime: %v", err)
	}
	if firstSnapshot.Revision != 2 {
		t.Fatalf("expected revision 2 after first change, got %d", firstSnapshot.Revision)
	}

	secondSnapshot, err := runtime.Mutate(func(document Document) (Document, error) {
		return document, nil
	})
	if err != nil {
		t.Fatalf("mutate runtime without changes: %v", err)
	}
	if secondSnapshot.Revision != firstSnapshot.Revision {
		t.Fatalf("expected no-op mutation to keep revision %d, got %d", firstSnapshot.Revision, secondSnapshot.Revision)
	}
}

func TestRuntimeSnapshotReturnsClone(t *testing.T) {
	t.Parallel()

	runtime := openTestRuntime(t, newTestStore(t, filepath.Join(t.TempDir(), "project.json")))
	if _, err := runtime.Mutate(func(document Document) (Document, error) {
		document.Projects["project-alpha"] = Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate runtime: %v", err)
	}

	snapshot := runtime.Snapshot()
	snapshot.Document.Projects["project-beta"] = Project{
		ID:   "project-beta",
		Name: "Beta",
	}

	nextSnapshot := runtime.Snapshot()
	if _, ok := nextSnapshot.Document.Projects["project-beta"]; ok {
		t.Fatal("expected snapshot mutation to leave runtime state untouched")
	}
}

func TestRuntimeMutationsSerializeInSubmissionOrder(t *testing.T) {
	t.Parallel()

	runtime := openTestRuntime(t, newTestStore(t, filepath.Join(t.TempDir(), "project.json")))

	startedA := make(chan struct{})
	releaseA := make(chan struct{})
	startedB := make(chan struct{})
	doneA := make(chan error, 1)
	doneB := make(chan error, 1)

	go func() {
		_, err := runtime.Mutate(func(document Document) (Document, error) {
			close(startedA)
			<-releaseA
			document.Projects["project-alpha"] = Project{
				ID:   "project-alpha",
				Name: "Alpha",
			}
			document.DefaultProjectID = "project-alpha"
			return document, nil
		})
		doneA <- err
	}()

	<-startedA

	go func() {
		_, err := runtime.Mutate(func(document Document) (Document, error) {
			close(startedB)
			document.Projects["project-beta"] = Project{
				ID:   "project-beta",
				Name: "Beta",
			}
			return document, nil
		})
		doneB <- err
	}()

	select {
	case <-startedB:
		t.Fatal("expected second mutation to wait for the first mutation to finish")
	case <-time.After(50 * time.Millisecond):
	}

	close(releaseA)

	if err := <-doneA; err != nil {
		t.Fatalf("first mutation failed: %v", err)
	}
	if err := <-doneB; err != nil {
		t.Fatalf("second mutation failed: %v", err)
	}

	snapshot, err := runtime.Flush()
	if err != nil {
		t.Fatalf("flush runtime: %v", err)
	}
	if snapshot.Revision != 3 {
		t.Fatalf("expected revision 3 after two changes, got %d", snapshot.Revision)
	}
	if _, ok := snapshot.Document.Projects["project-alpha"]; !ok {
		t.Fatal("expected project-alpha after serialized mutations")
	}
	if _, ok := snapshot.Document.Projects["project-beta"]; !ok {
		t.Fatal("expected project-beta after serialized mutations")
	}
}

func TestRuntimeFlushWaitsForPendingMutation(t *testing.T) {
	t.Parallel()

	runtime := openTestRuntime(t, newTestStore(t, filepath.Join(t.TempDir(), "project.json")))

	started := make(chan struct{})
	release := make(chan struct{})

	go func() {
		_, _ = runtime.Mutate(func(document Document) (Document, error) {
			close(started)
			<-release
			document.Projects["project-alpha"] = Project{
				ID:   "project-alpha",
				Name: "Alpha",
			}
			document.DefaultProjectID = "project-alpha"
			return document, nil
		})
	}()

	<-started

	result := make(chan Snapshot, 1)
	errs := make(chan error, 1)
	go func() {
		snapshot, err := runtime.Flush()
		if err != nil {
			errs <- err
			return
		}
		result <- snapshot
	}()

	select {
	case <-result:
		t.Fatal("expected flush to wait for the pending mutation")
	case err := <-errs:
		t.Fatalf("flush failed early: %v", err)
	case <-time.After(50 * time.Millisecond):
	}

	close(release)

	select {
	case err := <-errs:
		t.Fatalf("flush failed: %v", err)
	case snapshot := <-result:
		if _, ok := snapshot.Document.Projects["project-alpha"]; !ok {
			t.Fatal("expected flush snapshot to include the completed mutation")
		}
	}
}

func TestRuntimeSavePersistsLatestQueuedMutation(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntime(t, store)

	started := make(chan struct{})
	release := make(chan struct{})

	go func() {
		_, _ = runtime.Mutate(func(document Document) (Document, error) {
			close(started)
			<-release
			document.Projects["project-alpha"] = Project{
				ID:   "project-alpha",
				Name: "Alpha",
			}
			document.DefaultProjectID = "project-alpha"
			return document, nil
		})
	}()

	<-started

	done := make(chan Snapshot, 1)
	errs := make(chan error, 1)
	go func() {
		snapshot, err := runtime.Save(context.Background())
		if err != nil {
			errs <- err
			return
		}
		done <- snapshot
	}()

	select {
	case <-done:
		t.Fatal("expected save to wait for the pending mutation")
	case err := <-errs:
		t.Fatalf("save failed early: %v", err)
	case <-time.After(50 * time.Millisecond):
	}

	close(release)

	var snapshot Snapshot
	select {
	case err := <-errs:
		t.Fatalf("save failed: %v", err)
	case snapshot = <-done:
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if _, ok := loaded.Projects["project-alpha"]; !ok {
		t.Fatal("expected persisted document to include the queued mutation")
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2 after save, got %d", snapshot.Revision)
	}
}

func openTestRuntime(t *testing.T, store *Store) *Runtime {
	t.Helper()

	runtime, err := OpenRuntime(context.Background(), store)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return runtime
}
