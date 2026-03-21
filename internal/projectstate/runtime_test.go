package projectstate

import (
	"context"
	"errors"
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

func TestOpenRuntimeRejectsMissingPersistedProjectChatWindowingState(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestJSON(t, projectPath, map[string]any{
		"schemaVersion":    CurrentSchemaVersion,
		"defaultProjectId": "project-alpha",
		"projects": map[string]any{
			"project-alpha": map[string]any{
				"id":   "project-alpha",
				"name": "Alpha",
			},
		},
	})
	store := newTestStore(t, projectPath)

	_, err := OpenRuntime(context.Background(), store)
	if !errors.Is(err, ErrProjectChatWindowingRequired) {
		t.Fatalf("expected missing project chat windowing error, got %v", err)
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

func TestRuntimeMutateAndSavePersistsLatestQueuedMutation(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntime(t, store)

	snapshot, err := runtime.MutateAndSave(context.Background(), func(document Document) (Document, error) {
		document.Projects["project-alpha"] = Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	})
	if err != nil {
		t.Fatalf("mutate and save runtime: %v", err)
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if _, ok := loaded.Projects["project-alpha"]; !ok {
		t.Fatal("expected persisted document to include mutate-and-save result")
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2 after mutate-and-save, got %d", snapshot.Revision)
	}
}

func TestRuntimeSaveRunsAfterSaveHookWithLatestSnapshot(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	var observed Snapshot
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		AfterSave: func(_ context.Context, snapshot Snapshot) error {
			observed = snapshot
			return nil
		},
	})

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

	snapshot, err := runtime.Save(context.Background())
	if err != nil {
		t.Fatalf("save runtime: %v", err)
	}
	if observed.Revision != snapshot.Revision {
		t.Fatalf("expected after-save revision %d, got %d", snapshot.Revision, observed.Revision)
	}
	if _, ok := observed.Document.Projects["project-alpha"]; !ok {
		t.Fatal("expected after-save hook to observe persisted project-alpha state")
	}
}

func TestRuntimeSaveReturnsBeforeSaveHookErrorWithoutPersistingState(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		BeforeSave: func(context.Context, Snapshot) error {
			return errors.New("before-save failed")
		},
	})

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

	_, err := runtime.Save(context.Background())
	if err == nil || err.Error() != "before-save failed" {
		t.Fatalf("expected before-save failure, got %v", err)
	}

	loaded, loadErr := store.Load(context.Background())
	if loadErr != nil {
		t.Fatalf("load persisted document: %v", loadErr)
	}
	if _, ok := loaded.Projects["project-alpha"]; ok {
		t.Fatal("expected before-save failure to prevent persistence")
	}
}

func TestRuntimeSaveAppliesPersistedTransformWithoutChangingLiveSnapshot(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PersistedTransform: func(document Document) (Document, error) {
			project := document.Projects["project-alpha"]
			project.Name = "Persisted"
			document.Projects["project-alpha"] = project
			return document, nil
		},
	})

	if _, err := runtime.Mutate(func(document Document) (Document, error) {
		document.Projects["project-alpha"] = Project{
			ID:   "project-alpha",
			Name: "Live",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate runtime: %v", err)
	}

	snapshot, err := runtime.Save(context.Background())
	if err != nil {
		t.Fatalf("save runtime: %v", err)
	}
	if got := snapshot.Document.Projects["project-alpha"].Name; got != "Live" {
		t.Fatalf("expected live snapshot name Live, got %q", got)
	}
	if got := runtime.Snapshot().Document.Projects["project-alpha"].Name; got != "Live" {
		t.Fatalf("expected runtime state name Live, got %q", got)
	}

	loaded, loadErr := store.Load(context.Background())
	if loadErr != nil {
		t.Fatalf("load persisted document: %v", loadErr)
	}
	if got := loaded.Projects["project-alpha"].Name; got != "Persisted" {
		t.Fatalf("expected persisted name Persisted, got %q", got)
	}
}

func TestRuntimeSaveReturnsAfterSaveHookErrorAfterPersistingState(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		AfterSave: func(context.Context, Snapshot) error {
			return errors.New("after-save failed")
		},
	})

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

	_, err := runtime.Save(context.Background())
	if err == nil || err.Error() != "after-save failed" {
		t.Fatalf("expected after-save failure, got %v", err)
	}

	loaded, loadErr := store.Load(context.Background())
	if loadErr != nil {
		t.Fatalf("load persisted document: %v", loadErr)
	}
	if _, ok := loaded.Projects["project-alpha"]; !ok {
		t.Fatal("expected persisted document despite after-save failure")
	}
}

func TestRuntimeMutateAndSaveTracksFrontendOpLifecycle(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntime(t, store)

	started := make(chan struct{})
	release := make(chan struct{})
	errCh := make(chan error, 1)

	go func() {
		_, err := runtime.MutateAndSave(
			ContextWithFrontendOpID(context.Background(), "frontend-op-1"),
			func(document Document) (Document, error) {
				close(started)
				<-release
				document.Projects["project-alpha"] = Project{
					ID:   "project-alpha",
					Name: "Alpha",
				}
				document.DefaultProjectID = "project-alpha"
				return document, nil
			},
		)
		errCh <- err
	}()

	<-started

	status := runtime.FrontendOpStatus()
	if len(status.Pending) != 1 || status.Pending[0] != "frontend-op-1" {
		t.Fatalf("expected pending frontend op [frontend-op-1], got %#v", status.Pending)
	}
	if len(status.Completed) != 0 {
		t.Fatalf("expected no completed frontend ops while mutation is running, got %#v", status.Completed)
	}

	close(release)

	if err := <-errCh; err != nil {
		t.Fatalf("mutate and save runtime: %v", err)
	}

	status = runtime.FrontendOpStatus()
	if len(status.Pending) != 0 {
		t.Fatalf("expected no pending frontend ops after completion, got %#v", status.Pending)
	}
	if len(status.Completed) != 1 || status.Completed[0] != "frontend-op-1" {
		t.Fatalf("expected completed frontend op [frontend-op-1], got %#v", status.Completed)
	}

	_, consumed, err := runtime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("snapshot and consume frontend ops: %v", err)
	}
	if len(consumed.Completed) != 1 || consumed.Completed[0] != "frontend-op-1" {
		t.Fatalf("expected consumed completed frontend op [frontend-op-1], got %#v", consumed.Completed)
	}

	status = runtime.FrontendOpStatus()
	if len(status.Completed) != 0 {
		t.Fatalf("expected consumed completed frontend ops to clear, got %#v", status.Completed)
	}
}

func TestRuntimeMutateAndSaveDoesNotCompleteFailedFrontendOp(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntime(t, store)

	expectedErr := errors.New("mutation failed")
	_, err := runtime.MutateAndSave(
		ContextWithFrontendOpID(context.Background(), "frontend-op-failed"),
		func(document Document) (Document, error) {
			return document, expectedErr
		},
	)
	if !errors.Is(err, expectedErr) {
		t.Fatalf("expected mutation failure %v, got %v", expectedErr, err)
	}

	status := runtime.FrontendOpStatus()
	if len(status.Pending) != 0 {
		t.Fatalf("expected no pending frontend ops after failure, got %#v", status.Pending)
	}
	if len(status.Completed) != 0 {
		t.Fatalf("expected failed frontend op not to be marked complete, got %#v", status.Completed)
	}
}

func TestRuntimeMutationFailureDoesNotStallLaterMutations(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntime(t, store)

	expectedErr := errors.New("mutation failed")
	_, err := runtime.MutateAndSave(
		ContextWithFrontendOpID(context.Background(), "frontend-op-failed"),
		func(document Document) (Document, error) {
			return document, expectedErr
		},
	)
	if !errors.Is(err, expectedErr) {
		t.Fatalf("expected mutation failure %v, got %v", expectedErr, err)
	}

	snapshot, err := runtime.MutateAndSave(
		ContextWithFrontendOpID(context.Background(), "frontend-op-success"),
		func(document Document) (Document, error) {
			document.Projects["project-alpha"] = Project{
				ID:   "project-alpha",
				Name: "Alpha",
			}
			document.DefaultProjectID = "project-alpha"
			return document, nil
		},
	)
	if err != nil {
		t.Fatalf("mutate and save runtime after failure: %v", err)
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2 after successful follow-up mutation, got %d", snapshot.Revision)
	}
	if _, ok := snapshot.Document.Projects["project-alpha"]; !ok {
		t.Fatal("expected successful follow-up mutation to persist project-alpha")
	}

	status := runtime.FrontendOpStatus()
	if len(status.Pending) != 0 {
		t.Fatalf("expected no pending frontend ops after follow-up mutation, got %#v", status.Pending)
	}
	if len(status.Completed) != 1 || status.Completed[0] != "frontend-op-success" {
		t.Fatalf("expected only successful follow-up op to complete, got %#v", status.Completed)
	}
}

func openTestRuntime(t *testing.T, store *Store) *Runtime {
	t.Helper()

	return openTestRuntimeWithOptions(t, store, RuntimeOptions{})
}

func openTestRuntimeWithOptions(t *testing.T, store *Store, options RuntimeOptions) *Runtime {
	t.Helper()

	runtime, err := OpenRuntimeWithOptions(context.Background(), store, options)
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
