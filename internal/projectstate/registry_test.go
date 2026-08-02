package projectstate

import (
	"context"
	"path/filepath"
	"testing"
)

func TestOpenRegistryCreatesMainAndSettingsRuntimes(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	registry := openTestRegistry(t, root)

	if registry.Main() == nil {
		t.Fatal("expected main runtime")
	}
	if registry.Settings() == nil {
		t.Fatal("expected settings runtime")
	}

	paths := registry.Paths()
	if paths.Main != filepath.Join(root, MainFileName) {
		t.Fatalf("expected main path %q, got %q", filepath.Join(root, MainFileName), paths.Main)
	}
	if paths.Settings != filepath.Join(root, SettingsFileName) {
		t.Fatalf("expected settings path %q, got %q", filepath.Join(root, SettingsFileName), paths.Settings)
	}
}

func TestRegistryKeepsMainAndSettingsRuntimesSeparate(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	registry := openTestRegistry(t, root)

	mainSnapshot, err := registry.Main().Mutate(func(document Document) (Document, error) {
		document.Projects["project-alpha"] = Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	})
	if err != nil {
		t.Fatalf("mutate main runtime: %v", err)
	}
	if mainSnapshot.Revision != 2 {
		t.Fatalf("expected main revision 2, got %d", mainSnapshot.Revision)
	}

	settingsSnapshot := registry.Settings().Snapshot()
	if settingsSnapshot.Revision != 1 {
		t.Fatalf("expected settings revision 1, got %d", settingsSnapshot.Revision)
	}
	if len(settingsSnapshot.Document.Projects) != 0 {
		t.Fatalf("expected settings runtime to stay empty, got %d projects", len(settingsSnapshot.Document.Projects))
	}

	if _, err := registry.Main().Save(context.Background()); err != nil {
		t.Fatalf("save main runtime: %v", err)
	}
	if _, err := registry.Settings().Mutate(func(document Document) (Document, error) {
		document.Projects["settings-home"] = Project{
			ID:   "settings-home",
			Name: "Settings Home",
		}
		document.DefaultProjectID = "settings-home"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate settings runtime: %v", err)
	}
	if _, err := registry.Settings().Save(context.Background()); err != nil {
		t.Fatalf("save settings runtime: %v", err)
	}

	mainStore := newTestStore(t, registry.Paths().Main)
	settingsStore := newTestStore(t, registry.Paths().Settings)

	mainDocument, err := mainStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load main document: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load settings document: %v", err)
	}

	if _, ok := mainDocument.Projects["project-alpha"]; !ok {
		t.Fatal("expected project-alpha in main document")
	}
	if _, ok := mainDocument.Projects["settings-home"]; ok {
		t.Fatal("did not expect settings-home in main document")
	}
	if _, ok := settingsDocument.Projects["settings-home"]; !ok {
		t.Fatal("expected settings-home in settings document")
	}
	if _, ok := settingsDocument.Projects["project-alpha"]; ok {
		t.Fatal("did not expect project-alpha in settings document")
	}
}

func TestOpenRegistryWithOptionsRunsMainAfterSaveHookOnlyForMainRuntime(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	mainCalls := 0
	settingsCalls := 0
	registry, err := OpenRegistryWithOptions(context.Background(), root, StoreOptions{}, RegistryOptions{
		MainRuntime: RuntimeOptions{
			AfterSave: func(context.Context, Snapshot) error {
				mainCalls++
				return nil
			},
		},
		SettingsRuntime: RuntimeOptions{
			AfterSave: func(context.Context, Snapshot) error {
				settingsCalls++
				return nil
			},
		},
	})
	if err != nil {
		t.Fatalf("open registry with options: %v", err)
	}
	t.Cleanup(func() {
		if err := registry.Close(); err != nil {
			t.Fatalf("close registry: %v", err)
		}
	})

	if _, err := registry.Main().Mutate(func(document Document) (Document, error) {
		document.Projects["project-alpha"] = Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate main runtime: %v", err)
	}
	if _, err := registry.Settings().Mutate(func(document Document) (Document, error) {
		document.Projects["settings-home"] = Project{
			ID:   "settings-home",
			Name: "Settings Home",
		}
		document.DefaultProjectID = "settings-home"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate settings runtime: %v", err)
	}

	if _, err := registry.Main().Save(context.Background()); err != nil {
		t.Fatalf("save main runtime: %v", err)
	}
	if _, err := registry.Settings().Save(context.Background()); err != nil {
		t.Fatalf("save settings runtime: %v", err)
	}

	if mainCalls != 1 {
		t.Fatalf("expected one main after-save call, got %d", mainCalls)
	}
	if settingsCalls != 1 {
		t.Fatalf("expected one settings after-save call, got %d", settingsCalls)
	}
}

func openTestRegistry(t *testing.T, root string) *Registry {
	t.Helper()

	registry, err := OpenRegistryWithOptions(context.Background(), root, StoreOptions{}, RegistryOptions{})
	if err != nil {
		t.Fatalf("open registry: %v", err)
	}
	t.Cleanup(func() {
		if err := registry.Close(); err != nil {
			t.Fatalf("close registry: %v", err)
		}
	})
	return registry
}
