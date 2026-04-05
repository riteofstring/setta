package e2eseed

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/projectstate"
	"setta/internal/projectview"
)

func TestSeedProjectStateWritesLoadableRegistryDocuments(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := SeedProjectState(context.Background(), ProjectStateSeedOptions{
		SettaFilesRoot: root,
	}); err != nil {
		t.Fatalf("SeedProjectState returned error: %v", err)
	}

	registry, err := projectstate.OpenRegistry(context.Background(), root, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("OpenRegistry returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := registry.Close(); err != nil {
			t.Fatalf("close registry: %v", err)
		}
	})

	mainSnapshot := registry.Main().Snapshot()
	if mainSnapshot.Document.DefaultProjectID != DefaultSampleProjectID {
		t.Fatalf("expected default project id %q, got %q", DefaultSampleProjectID, mainSnapshot.Document.DefaultProjectID)
	}
	project, err := mainSnapshot.Document.ProjectByID(DefaultSampleProjectID)
	if err != nil {
		t.Fatalf("ProjectByID returned error: %v", err)
	}
	if project.Name != DefaultSampleProjectName {
		t.Fatalf("expected project name %q, got %q", DefaultSampleProjectName, project.Name)
	}
	if project.ProjectChatWindowing == nil {
		t.Fatal("expected seeded project chat windowing state")
	}
	if got := project.ProjectChatWindowing.NextInstanceNumber; got != 1 {
		t.Fatalf("expected next instance number 1, got %d", got)
	}
	if project.ActiveViewModeID == "" {
		t.Fatal("expected seeded project to have an active view mode")
	}
	if len(project.ViewModes) != 1 {
		t.Fatalf("expected seeded project to have exactly one view mode, got %d", len(project.ViewModes))
	}
	if _, ok := project.ViewModes[project.ActiveViewModeID]; !ok {
		t.Fatalf("expected active view mode %q to exist", project.ActiveViewModeID)
	}

	projectView, err := projectview.SingleConfigByProjectID(mainSnapshot.Document, DefaultSampleProjectID)
	if err != nil {
		t.Fatalf("SingleConfigByProjectID returned error: %v", err)
	}
	if projectView.ProjectConfig.ActiveViewModeID == nil || *projectView.ProjectConfig.ActiveViewModeID == "" {
		t.Fatalf("expected project view to expose an active view mode id, got %#v", projectView.ProjectConfig.ActiveViewModeID)
	}

	settingsSnapshot := registry.Settings().Snapshot()
	if settingsSnapshot.Document.SchemaVersion != projectstate.CurrentSchemaVersion {
		t.Fatalf("expected settings schema version %d, got %d", projectstate.CurrentSchemaVersion, settingsSnapshot.Document.SchemaVersion)
	}
	if len(settingsSnapshot.Document.Projects) != 0 {
		t.Fatalf("expected empty settings projects, got %d", len(settingsSnapshot.Document.Projects))
	}
}

func TestSeedProjectStateOverwritesLegacyProjectFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(root, projectstate.MainFileName),
		[]byte("{\n  \"projectConfigs\": {}\n}\n"),
		0o644,
	); err != nil {
		t.Fatalf("WriteFile main returned error: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(root, projectstate.SettingsFileName),
		[]byte("{\n  \"projectConfigs\": {}\n}\n"),
		0o644,
	); err != nil {
		t.Fatalf("WriteFile settings returned error: %v", err)
	}

	if err := SeedProjectState(context.Background(), ProjectStateSeedOptions{
		SettaFilesRoot: root,
	}); err != nil {
		t.Fatalf("SeedProjectState returned error: %v", err)
	}

	registry, err := projectstate.OpenRegistry(context.Background(), root, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("OpenRegistry returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := registry.Close(); err != nil {
			t.Fatalf("close registry: %v", err)
		}
	})

	if got := registry.Main().Snapshot().Document.DefaultProjectID; got != DefaultSampleProjectID {
		t.Fatalf("expected default project id %q, got %q", DefaultSampleProjectID, got)
	}
}
