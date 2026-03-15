package projectstate

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func TestRuntimeUndoAndRedoClampAndPersistHistory(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	if err := store.Save(context.Background(), runtimeHistoryTestDocument("project-alpha", "Alpha")); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	mustSetRuntimeProjectName(t, runtime, "project-alpha", "Beta")
	mustSetRuntimeProjectName(t, runtime, "project-alpha", "Gamma")

	undoSnapshot, err := runtime.UndoAndSave(context.Background(), "project-alpha", 10)
	if err != nil {
		t.Fatalf("undo and save runtime: %v", err)
	}
	undoProject, err := undoSnapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("load undo snapshot project: %v", err)
	}
	if undoProject.Name != "Alpha" {
		t.Fatalf("expected undo to clamp to Alpha, got %q", undoProject.Name)
	}
	if undoSnapshot.Revision != 4 {
		t.Fatalf("expected revision 4 after undo, got %d", undoSnapshot.Revision)
	}

	loadedAfterUndo, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted undo document: %v", err)
	}
	loadedUndoProject, err := loadedAfterUndo.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("load persisted undo project: %v", err)
	}
	if loadedUndoProject.Name != "Alpha" {
		t.Fatalf("expected persisted undo name Alpha, got %q", loadedUndoProject.Name)
	}

	redoSnapshot, err := runtime.RedoAndSave(context.Background(), "project-alpha", 10)
	if err != nil {
		t.Fatalf("redo and save runtime: %v", err)
	}
	redoProject, err := redoSnapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("load redo snapshot project: %v", err)
	}
	if redoProject.Name != "Gamma" {
		t.Fatalf("expected redo to clamp to Gamma, got %q", redoProject.Name)
	}
	if redoSnapshot.Revision != 5 {
		t.Fatalf("expected revision 5 after redo, got %d", redoSnapshot.Revision)
	}

	loadedAfterRedo, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted redo document: %v", err)
	}
	loadedRedoProject, err := loadedAfterRedo.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("load persisted redo project: %v", err)
	}
	if loadedRedoProject.Name != "Gamma" {
		t.Fatalf("expected persisted redo name Gamma, got %q", loadedRedoProject.Name)
	}

	noOpSnapshot, err := runtime.UndoAndSave(context.Background(), "project-alpha", 0)
	if err != nil {
		t.Fatalf("undo zero steps: %v", err)
	}
	if noOpSnapshot.Revision != redoSnapshot.Revision {
		t.Fatalf("expected zero-step undo to keep revision %d, got %d", redoSnapshot.Revision, noOpSnapshot.Revision)
	}
}

func TestRuntimeUndoAndSaveTruncatesRedoAfterNewMutation(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	if err := store.Save(context.Background(), runtimeHistoryTestDocument("project-alpha", "Alpha")); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	mustSetRuntimeProjectName(t, runtime, "project-alpha", "Beta")

	if _, err := runtime.UndoAndSave(context.Background(), "project-alpha", 1); err != nil {
		t.Fatalf("undo and save runtime: %v", err)
	}
	mustSetRuntimeProjectName(t, runtime, "project-alpha", "Delta")

	beforeRedo := runtime.Snapshot()
	redoSnapshot, err := runtime.RedoAndSave(context.Background(), "project-alpha", 1)
	if err != nil {
		t.Fatalf("redo and save runtime: %v", err)
	}
	if redoSnapshot.Revision != beforeRedo.Revision {
		t.Fatalf("expected redo after branch truncation to keep revision %d, got %d", beforeRedo.Revision, redoSnapshot.Revision)
	}

	project, err := redoSnapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("load redo snapshot project: %v", err)
	}
	if project.Name != "Delta" {
		t.Fatalf("expected redo branch to stay at Delta, got %q", project.Name)
	}
}

func TestRuntimeUndoAndRedoValidateProjectID(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntime(t, store)

	if _, err := runtime.UndoAndSave(context.Background(), "", 1); !errors.Is(err, ErrProjectIDRequired) {
		t.Fatalf("expected ErrProjectIDRequired, got %v", err)
	}
	if _, err := runtime.RedoAndSave(context.Background(), "project-missing", 1); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("expected ErrProjectNotFound, got %v", err)
	}
}

func mustSetRuntimeProjectName(t *testing.T, runtime *Runtime, projectID string, projectName string) {
	t.Helper()

	if _, err := runtime.MutateAndSave(context.Background(), func(document Document) (Document, error) {
		document.Projects[projectID] = Project{
			ID:   projectID,
			Name: projectName,
		}
		document.DefaultProjectID = projectID
		return document, nil
	}); err != nil {
		t.Fatalf("mutate and save project %q with name %q: %v", projectID, projectName, err)
	}
}

func runtimeHistoryTestDocument(projectID string, projectName string) Document {
	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: projectID,
		Projects: map[string]Project{
			projectID: {
				ID:   projectID,
				Name: projectName,
			},
		},
	}
}
