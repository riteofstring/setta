package projectstate

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
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

func TestRuntimeMutateAndSavePreservesPasswordSecretStoreAcrossMutations(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	secrets := NewMemoryPasswordSecretStore()
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PasswordSecrets: secrets,
	})

	var projectID string
	var sectionID string
	var paramID string
	if _, err := runtime.MutateAndSave(context.Background(), func(document Document) (Document, error) {
		createdProjectID, _, err := document.CreateProject("bg-blue-500/60 dark:bg-blue-600/30")
		if err != nil {
			return document, err
		}
		projectID = createdProjectID
		return document, nil
	}); err != nil {
		t.Fatalf("create project through runtime: %v", err)
	}

	snapshot, err := runtime.MutateAndSave(context.Background(), func(document Document) (Document, error) {
		project, err := document.ProjectByID(projectID)
		if err != nil {
			return document, err
		}

		createdSection, err := project.CreateTopLevelSection(
			CreateTopLevelSectionInput{ImplType: "Dict"},
			DefaultStructuralMutationSettings(),
		)
		if err != nil {
			return document, err
		}
		sectionID = createdSection.SectionID

		addedParam, err := project.AddKwarg(createdSection.SectionID)
		if err != nil {
			return document, err
		}
		paramID = addedParam.CodeObjID
		if err := project.SetCodeObjectName(addedParam.CodeObjID, "secret_value"); err != nil {
			return document, err
		}
		if err := project.SetSectionCodeObjectValue(
			createdSection.SectionID,
			addedParam.CodeObjID,
			"open-sesame",
		); err != nil {
			return document, err
		}
		if err := project.ChangeParamImpl(
			createdSection.SectionID,
			addedParam.CodeObjID,
			"PasswordParam",
		); err != nil {
			return document, err
		}

		document.Projects[projectID] = project
		return document, nil
	})
	if err != nil {
		t.Fatalf("change dict param to password through runtime: %v", err)
	}

	project, err := snapshot.Document.ProjectByID(projectID)
	if err != nil {
		t.Fatalf("project by id after password mutation: %v", err)
	}
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject(sectionID, paramID)
	if err != nil {
		t.Fatalf("resolve password param after runtime mutation: %v", err)
	}
	if paramImpl.Type != "PasswordParam" {
		t.Fatalf("expected PasswordParam impl after runtime mutation, got %q", paramImpl.Type)
	}
	if !payloadBoolField(paramPayload, "hasSecret") {
		t.Fatalf("expected password param hasSecret true after runtime mutation, got %#v", paramPayload)
	}

	secret, err := secrets.Get(paramImpl.ID)
	if err != nil {
		t.Fatalf("read password secret after runtime mutation: %v", err)
	}
	if secret != "open-sesame" {
		t.Fatalf("expected migrated password secret open-sesame, got %q", secret)
	}
}

func TestRuntimeMutateAndPersistLaterReturnsBeforeSaveHooksFinish(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	started := make(chan struct{})
	release := make(chan struct{})

	runtime, err := OpenRuntimeWithOptions(context.Background(), store, RuntimeOptions{
		BeforeSave: func(context.Context, Snapshot) error {
			select {
			case <-started:
			default:
				close(started)
			}
			<-release
			return nil
		},
	})
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}

	done := make(chan Snapshot, 1)
	errs := make(chan error, 1)
	go func() {
		snapshot, mutateErr := runtime.MutateAndPersistLater(context.Background(), func(document Document) (Document, error) {
			document.Projects["project-alpha"] = Project{
				ID:   "project-alpha",
				Name: "Alpha",
			}
			document.DefaultProjectID = "project-alpha"
			return document, nil
		})
		if mutateErr != nil {
			errs <- mutateErr
			return
		}
		done <- snapshot
	}()

	var snapshot Snapshot
	select {
	case err := <-errs:
		t.Fatalf("mutate and persist later: %v", err)
	case snapshot = <-done:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected deferred mutation to return before background persistence completed")
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2 after deferred mutation, got %d", snapshot.Revision)
	}

	select {
	case <-started:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected background persistence to start")
	}

	loadedBeforeRelease, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load document before releasing save: %v", err)
	}
	if _, ok := loadedBeforeRelease.Projects["project-alpha"]; ok {
		t.Fatal("expected deferred mutation not to persist before save hooks finish")
	}

	close(release)
	if err := runtime.Close(); err != nil {
		t.Fatalf("close runtime: %v", err)
	}

	loadedAfterClose, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load document after deferred persistence: %v", err)
	}
	if _, ok := loadedAfterClose.Projects["project-alpha"]; !ok {
		t.Fatal("expected deferred mutation to persist before runtime close completes")
	}
}

func TestRuntimeMutateAndPersistLaterCoalescesPendingSnapshots(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	started := make(chan struct{})
	release := make(chan struct{})
	afterSaveNames := []string{}
	var afterSaveMu sync.Mutex

	runtime, err := OpenRuntimeWithOptions(context.Background(), store, RuntimeOptions{
		BeforeSave: func(_ context.Context, snapshot Snapshot) error {
			if snapshot.Revision != 2 {
				return nil
			}
			select {
			case <-started:
			default:
				close(started)
			}
			<-release
			return nil
		},
		AfterSave: func(_ context.Context, snapshot Snapshot) error {
			afterSaveMu.Lock()
			defer afterSaveMu.Unlock()
			afterSaveNames = append(afterSaveNames, snapshot.Document.Projects["project-alpha"].Name)
			return nil
		},
	})
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}

	mutateProjectName := func(name string) error {
		_, mutateErr := runtime.MutateAndPersistLater(context.Background(), func(document Document) (Document, error) {
			document.Projects["project-alpha"] = Project{
				ID:   "project-alpha",
				Name: name,
			}
			document.DefaultProjectID = "project-alpha"
			return document, nil
		})
		return mutateErr
	}

	if err := mutateProjectName("First"); err != nil {
		t.Fatalf("queue first deferred mutation: %v", err)
	}
	select {
	case <-started:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected first deferred persistence to start")
	}
	if err := mutateProjectName("Second"); err != nil {
		t.Fatalf("queue second deferred mutation: %v", err)
	}
	if err := mutateProjectName("Third"); err != nil {
		t.Fatalf("queue third deferred mutation: %v", err)
	}

	close(release)
	if err := runtime.Close(); err != nil {
		t.Fatalf("close runtime: %v", err)
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if got := loaded.Projects["project-alpha"].Name; got != "Third" {
		t.Fatalf("expected latest deferred mutation to persist, got %q", got)
	}

	afterSaveMu.Lock()
	names := append([]string(nil), afterSaveNames...)
	afterSaveMu.Unlock()
	if len(names) != 2 {
		t.Fatalf("expected two persisted snapshots (initial blocked save and latest pending save), got %#v", names)
	}
	if names[0] != "First" || names[1] != "Third" {
		t.Fatalf("expected deferred persistence to skip the intermediate snapshot, got %#v", names)
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

func TestRuntimeCreateProjectRunsPythonCodegenSectionReconcilerWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testPythonGeneratedSectionReconciler(),
	})

	snapshot, createdProjectID, _, err := runtime.CreateProject(
		context.Background(),
		"bg-blue-500/60 dark:bg-blue-600/30",
	)
	if err != nil {
		t.Fatalf("create project through runtime: %v", err)
	}

	project, err := snapshot.Document.ProjectByID(createdProjectID)
	if err != nil {
		t.Fatalf("lookup created project: %v", err)
	}
	if len(project.TopLevelSectionIDs) != 1 || project.TopLevelSectionIDs[0] != GeneratedPythonCodeSectionID {
		t.Fatalf("expected reconciled generated python top-level section, got %#v", project.TopLevelSectionIDs)
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected reconciled generated python impl, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `python||meta=false`) {
		t.Fatalf("expected reconciled generated python payload, got %q", string(impl.Payload))
	}
}

func TestRuntimeCreateTopLevelSectionReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": testRuntimeStructuralMutationPythonProject(),
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testRuntimeStructuralMutationPythonGeneratedSectionReconciler(),
	})

	snapshot, result, err := runtime.CreateTopLevelSection(
		context.Background(),
		"project-alpha",
		CreateTopLevelSectionInput{ImplType: "Callable"},
		DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create top-level section through runtime: %v", err)
	}
	if strings.TrimSpace(result.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", result)
	}

	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	if _, ok := project.Sections[result.SectionID]; !ok {
		t.Fatalf("expected created section %q in project snapshot", result.SectionID)
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after structural mutation, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `section-count=1`) {
		t.Fatalf("expected generated python payload to include structural section count, got %q", string(impl.Payload))
	}
}

func TestRuntimeCreateChildSectionsViaIncrementerReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": testRuntimeStructuralMutationPythonProject(),
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testRuntimeStructuralMutationPythonGeneratedSectionReconciler(),
	})

	_, parentResult, err := runtime.CreateTopLevelSection(
		context.Background(),
		"project-alpha",
		CreateTopLevelSectionInput{ImplType: "ListRoot"},
		DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("seed list root through runtime: %v", err)
	}

	snapshot, result, err := runtime.CreateChildSectionsViaIncrementer(
		context.Background(),
		"project-alpha",
		CreateChildSectionsViaIncrementerInput{
			CalledBy:    parentResult.SectionID,
			ImplType:    "Callable",
			NumChildren: 1,
		},
		DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create child sections via incrementer through runtime: %v", err)
	}
	if len(result.SectionIDs) != 1 {
		t.Fatalf("expected one created child id, got %#v", result.SectionIDs)
	}

	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	if _, ok := project.Sections[result.SectionIDs[0]]; !ok {
		t.Fatalf("expected created child section %q in project snapshot", result.SectionIDs[0])
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after incrementer mutation, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `section-count=2`) {
		t.Fatalf("expected generated python payload to include updated section count, got %q", string(impl.Payload))
	}
}

func TestRuntimeSetCallableReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": testRuntimeSemanticMutationPythonProject(t),
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testRuntimeSemanticMutationPythonGeneratedSectionReconciler(),
	})

	snapshot, response, err := runtime.SetCallable(
		context.Background(),
		"project-alpha",
		"callable-section",
		"sorted",
		false,
		nil,
	)
	if err != nil {
		t.Fatalf("set callable through runtime: %v", err)
	}
	if response.CallableID == nil || *response.CallableID != "callable-2" {
		t.Fatalf("expected callable-2 response, got %#v", response.CallableID)
	}

	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after callable mutation, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `callable=sorted`) {
		t.Fatalf("expected generated python payload to include updated callable, got %q", string(impl.Payload))
	}
	if !strings.Contains(string(impl.Payload), `arg=user_value`) {
		t.Fatalf("expected generated python payload to preserve callable arg value, got %q", string(impl.Payload))
	}
}

func TestRuntimeSetSectionCodeObjectValueReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": testRuntimeSemanticMutationPythonProjectWithSelectedCallable(t),
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testRuntimeSemanticMutationPythonGeneratedSectionReconciler(),
	})

	snapshot, err := runtime.SetSectionCodeObjectValue(
		context.Background(),
		"project-alpha",
		"callable-section",
		"param-existing",
		"3",
	)
	if err != nil {
		t.Fatalf("set section code object value through runtime: %v", err)
	}

	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after param mutation, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `callable=sorted`) {
		t.Fatalf("expected generated python payload to keep selected callable, got %q", string(impl.Payload))
	}
	if !strings.Contains(string(impl.Payload), `arg=3`) {
		t.Fatalf("expected generated python payload to include updated param value, got %q", string(impl.Payload))
	}
}

func TestRuntimeSetTextBlockTextReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	project := textBlockMutationTestProject(t)
	defaultWindowing := DefaultProjectChatWindowingState()
	project.ID = "project-alpha"
	project.Name = "Alpha"
	project.CodegenTargets = []ProjectCodegenTarget{
		{Language: string(CodeLanguagePython)},
	}
	project.ProjectChatWindowing = &defaultWindowing
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	structuralReconciler := testRuntimeStructuralMutationPythonGeneratedSectionReconciler()
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: PythonCodegenSectionReconcilerFunc(func(ctx context.Context, project *Project) error {
			if err := structuralReconciler.ReconcileProjectPythonGeneratedSections(ctx, project); err != nil {
				return err
			}
			if project == nil {
				return ErrProjectNotFound
			}

			textPayload, err := effectiveSectionPayload(*project, "text-section", "text-variant")
			if err != nil {
				return err
			}
			payload, err := marshalProjectObject(map[string]any{
				"id":   GeneratedPythonCodeImplID,
				"type": "GenPythonCode",
				"code": fmt.Sprintf("text=%s", payloadRawStringField(textPayload, "text")),
			})
			if err != nil {
				return err
			}

			impl := project.SectionImpls[GeneratedPythonCodeImplID]
			impl.Payload = payload
			project.SectionImpls[GeneratedPythonCodeImplID] = impl
			return nil
		}),
	})

	snapshot, err := runtime.SetTextBlockText(
		context.Background(),
		"project-alpha",
		"text-section",
		"hello from text block",
	)
	if err != nil {
		t.Fatalf("set text block text through runtime: %v", err)
	}

	project, err = snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after text mutation, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `text=hello from text block`) {
		t.Fatalf("expected generated python payload to include updated text, got %q", string(impl.Payload))
	}
}

func testRuntimeStructuralMutationPythonProject() Project {
	defaultWindowing := DefaultProjectChatWindowingState()
	return Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{Language: string(CodeLanguagePython)},
		},
		ProjectChatWindowing: &defaultWindowing,
	}
}

func testRuntimeStructuralMutationPythonGeneratedSectionReconciler() PythonCodegenSectionReconciler {
	return PythonCodegenSectionReconcilerFunc(func(_ context.Context, project *Project) error {
		if project == nil {
			return ErrProjectNotFound
		}
		if err := project.ReconcilePythonGeneratedBindings(); err != nil {
			return err
		}

		sectionCount := 0
		for sectionID := range project.Sections {
			if sectionID == GeneratedPythonCodeSectionID || sectionID == GeneratedPythonMetadataSectionID {
				continue
			}
			sectionCount++
		}

		var bindingPayload any
		if project.GeneratedCodeBinding != nil {
			bindingPayload = map[string]any{
				"canonical_path": project.GeneratedCodeBinding.Path,
				"access_mode":    string(project.GeneratedCodeBinding.AccessMode),
				"autoBinding":    false,
			}
		}
		payload, err := marshalProjectObject(map[string]any{
			"id":              GeneratedPythonCodeImplID,
			"type":            "GenPythonCode",
			"code":            fmt.Sprintf("section-count=%d", sectionCount),
			"codeFileBinding": bindingPayload,
		})
		if err != nil {
			return err
		}

		if project.SectionVariantMap == nil {
			project.SectionVariantMap = map[string]string{}
		}
		project.SectionVariantMap[GeneratedPythonCodeSectionID] = GeneratedPythonCodeVariantID

		if project.Sections == nil {
			project.Sections = map[string]Section{}
		}
		project.Sections[GeneratedPythonCodeSectionID] = Section{
			ID:               GeneratedPythonCodeSectionID,
			Name:             GeneratedPythonCodeSectionName,
			VariantIDs:       []string{GeneratedPythonCodeVariantID},
			DefaultVariantID: GeneratedPythonCodeVariantID,
		}

		if project.SectionVariants == nil {
			project.SectionVariants = map[string]SectionVariant{}
		}
		project.SectionVariants[GeneratedPythonCodeVariantID] = SectionVariant{
			ID:     GeneratedPythonCodeVariantID,
			ImplID: GeneratedPythonCodeImplID,
		}

		if project.SectionImpls == nil {
			project.SectionImpls = map[string]SectionImpl{}
		}
		project.SectionImpls[GeneratedPythonCodeImplID] = SectionImpl{
			ID:      GeneratedPythonCodeImplID,
			Kind:    SectionKindGenerated,
			Payload: payload,
			Generated: &GeneratedSectionImpl{
				Kind: GeneratedSectionKindPythonCode,
			},
		}

		if project.TopLevelSections == nil {
			project.TopLevelSections = map[string]TopLevelSectionLayout{}
		}
		project.TopLevelSections[GeneratedPythonCodeSectionID] = TopLevelSectionLayout{}
		if !containsTopLevelSectionID(project.TopLevelSectionIDs, GeneratedPythonCodeSectionID) {
			project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, GeneratedPythonCodeSectionID)
		}

		return nil
	})
}

func testRuntimeSemanticMutationPythonProject(t *testing.T) Project {
	t.Helper()

	project := callableTestProject(t)
	defaultWindowing := DefaultProjectChatWindowingState()
	project.ID = "project-alpha"
	project.Name = "Alpha"
	project.CodegenTargets = []ProjectCodegenTarget{
		{Language: string(CodeLanguagePython)},
	}
	project.ProjectChatWindowing = &defaultWindowing
	return project
}

func testRuntimeSemanticMutationPythonProjectWithSelectedCallable(t *testing.T) Project {
	t.Helper()

	project := testRuntimeSemanticMutationPythonProject(t)
	if err := project.setCurrentSectionField("callable-section", "callable", "callable-2"); err != nil {
		t.Fatalf("set selected callable in semantic mutation fixture: %v", err)
	}
	return project
}

func testRuntimeSemanticMutationPythonGeneratedSectionReconciler() PythonCodegenSectionReconciler {
	structuralReconciler := testRuntimeStructuralMutationPythonGeneratedSectionReconciler()
	return PythonCodegenSectionReconcilerFunc(func(ctx context.Context, project *Project) error {
		if err := structuralReconciler.ReconcileProjectPythonGeneratedSections(ctx, project); err != nil {
			return err
		}
		if project == nil {
			return ErrProjectNotFound
		}

		renderedCode, err := testRuntimeSemanticMutationGeneratedCode(project)
		if err != nil {
			return err
		}

		var bindingPayload any
		if project.GeneratedCodeBinding != nil {
			bindingPayload = map[string]any{
				"canonical_path": project.GeneratedCodeBinding.Path,
				"access_mode":    string(project.GeneratedCodeBinding.AccessMode),
				"autoBinding":    false,
			}
		}
		payload, err := marshalProjectObject(map[string]any{
			"id":              GeneratedPythonCodeImplID,
			"type":            "GenPythonCode",
			"code":            renderedCode,
			"codeFileBinding": bindingPayload,
		})
		if err != nil {
			return err
		}

		impl := project.SectionImpls[GeneratedPythonCodeImplID]
		impl.Payload = payload
		project.SectionImpls[GeneratedPythonCodeImplID] = impl
		return nil
	})
}

func testRuntimeSemanticMutationGeneratedCode(project *Project) (string, error) {
	if project == nil {
		return "", ErrProjectNotFound
	}

	sectionPayload, err := project.currentCallableSectionPayload("callable-section")
	if err != nil {
		return "", err
	}
	callableID := payloadStringField(sectionPayload, "callable")
	if callableID == "" {
		return "callable=<none>|arg=<none>", nil
	}

	callablePayload, callableCodeObj, _, _, err := project.ResolveSectionCodeObject("callable-section", callableID)
	if err != nil {
		return "", err
	}
	childIDs := payloadStringArrayField(callablePayload, "children")
	if len(childIDs) == 0 {
		return fmt.Sprintf("callable=%s|arg=<none>", callableCodeObj.Name), nil
	}

	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("callable-section", childIDs[0])
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(
		"callable=%s|arg=%s",
		callableCodeObj.Name,
		payloadRawStringField(paramPayload, "value"),
	), nil
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
