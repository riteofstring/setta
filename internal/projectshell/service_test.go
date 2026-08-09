package projectshell

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"

	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

func newProjectShellTestSettingsRuntime(t *testing.T, document settingsstate.Document) *settingsstate.Runtime {
	t.Helper()

	store, err := settingsstate.NewStore(filepath.Join(t.TempDir(), settingsstate.DefaultFileName), settingsstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new settings store: %v", err)
	}
	if err := store.Save(t.Context(), document); err != nil {
		t.Fatalf("save settings document: %v", err)
	}
	runtime, err := settingsstate.OpenRuntime(t.Context(), store)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})
	return runtime
}

func TestServiceLoadAllProjectMetadataReturnsDefaultAndSortedMetadata(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-b",
		Projects: map[string]projectstate.Project{
			"project-b": {
				ID:   "project-b",
				Name: "beta",
			},
			"project-a": {
				ID:   "project-a",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	metadata, err := service.LoadAllProjectMetadata(context.Background())
	if err != nil {
		t.Fatalf("load all project metadata: %v", err)
	}
	if metadata.DefaultProjectConfigID == nil || *metadata.DefaultProjectConfigID != "project-b" {
		t.Fatalf("expected default project-b, got %#v", metadata.DefaultProjectConfigID)
	}
	if len(metadata.ProjectMetadata) != 2 {
		t.Fatalf("expected two metadata entries, got %#v", metadata.ProjectMetadata)
	}
	if metadata.ProjectMetadata[0].ID != "project-a" || metadata.ProjectMetadata[1].ID != "project-b" {
		t.Fatalf("unexpected metadata order %#v", metadata.ProjectMetadata)
	}
}

func TestServiceLoadProjectConfigLoadsByName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	projectConfig, err := service.LoadProjectConfig(context.Background(), "Alpha")
	if err != nil {
		t.Fatalf("load project config: %v", err)
	}
	if projectConfig.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha, got %q", projectConfig.ProjectConfig.ID)
	}
	if projectConfig.ProjectConfig.Name != "Alpha" {
		t.Fatalf("expected Alpha, got %q", projectConfig.ProjectConfig.Name)
	}
}

func TestServiceLoadProjectConfigLoadsDedicatedSettingsProjectByName(t *testing.T) {
	t.Parallel()

	mainRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open main overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := mainRuntime.Close(); err != nil {
			t.Fatalf("close main overlay runtime: %v", err)
		}
	})

	settingsDocument, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("default settings document: %v", err)
	}
	settingsDefaultsRuntime := newProjectShellTestSettingsRuntime(t, settingsDocument)
	settingsProjectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsProjectRuntime.Close(); err != nil {
			t.Fatalf("close settings overlay runtime: %v", err)
		}
	})
	if err := settingsstate.EnsureProjectRuntimeBootstrapped(
		context.Background(),
		settingsDefaultsRuntime,
		settingsProjectRuntime,
	); err != nil {
		t.Fatalf("bootstrap settings project runtime: %v", err)
	}

	service, err := NewService(ServiceOptions{
		ProjectState:         mainRuntime,
		SettingsProjectState: settingsProjectRuntime,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	projectConfig, err := service.LoadProjectConfig(context.Background(), settingsstate.SettingsProjectName)
	if err != nil {
		t.Fatalf("load settings project config: %v", err)
	}
	if projectConfig.ProjectConfig.ID != settingsstate.SettingsProjectID {
		t.Fatalf("expected settings project id %q, got %q", settingsstate.SettingsProjectID, projectConfig.ProjectConfig.ID)
	}
	if len(projectConfig.Sections) != 46 {
		t.Fatalf("expected 46 settings sections, got %d", len(projectConfig.Sections))
	}
}

func TestServiceLoadProjectConfigRequiresExactNameMatchWithoutTrim(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, err = service.LoadProjectConfig(context.Background(), " Alpha ")
	if err == nil {
		t.Fatal("expected exact-match lookup error")
	}
	if !errors.Is(err, projectstate.ErrProjectNotFound) {
		t.Fatalf("expected ErrProjectNotFound, got %v", err)
	}
}

func TestServiceLoadProjectConfigReturnsProjectNotFound(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, err = service.LoadProjectConfig(context.Background(), "Missing")
	if err == nil {
		t.Fatal("expected missing project error")
	}
	if !errors.Is(err, projectstate.ErrProjectNotFound) {
		t.Fatalf("expected ErrProjectNotFound, got %v", err)
	}
}

func TestServiceLoadProjectConfigRejectsAmbiguousName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Shared",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Shared",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, err = service.LoadProjectConfig(context.Background(), "Shared")
	if err == nil {
		t.Fatal("expected ambiguous project name error")
	}
	if !errors.Is(err, projectstate.ErrProjectNameAmbiguous) {
		t.Fatalf("expected ErrProjectNameAmbiguous, got %v", err)
	}
}

func TestServiceSetDefaultProjectConfigPersistsAndRunsMetadataHook(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(t.Context(), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
			},
		},
	}); err != nil {
		t.Fatalf("seed project store: %v", err)
	}

	projectRuntime := openProjectShellRuntimeForTest(t, store)

	hookCalls := 0
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		AfterProjectMetadataMutation: func(_ context.Context, snapshot projectstate.Snapshot) error {
			hookCalls++
			if snapshot.Document.DefaultProjectID != "project-beta" {
				t.Fatalf("expected default project-beta, got %q", snapshot.Document.DefaultProjectID)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	if err := service.SetDefaultProjectConfig(context.Background(), "project-beta"); err != nil {
		t.Fatalf("SetDefaultProjectConfig returned error: %v", err)
	}
	if hookCalls != 1 {
		t.Fatalf("expected metadata hook once, got %d", hookCalls)
	}

	reloaded, err := store.Load(t.Context())
	if err != nil {
		t.Fatalf("reload store: %v", err)
	}
	if reloaded.DefaultProjectID != "project-beta" {
		t.Fatalf("expected persisted default project-beta, got %q", reloaded.DefaultProjectID)
	}
}

func TestServiceSetDefaultProjectConfigNoopSkipsMetadataHook(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	hookCalls := 0
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		AfterProjectMetadataMutation: func(context.Context, projectstate.Snapshot) error {
			hookCalls++
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	if err := service.SetDefaultProjectConfig(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("SetDefaultProjectConfig no-op returned error: %v", err)
	}
	if hookCalls != 0 {
		t.Fatalf("expected no metadata hook calls for no-op, got %d", hookCalls)
	}
}

func TestServiceSetProjectConfigNameRenamesProjectPersistsAndRunsHook(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(t.Context(), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed project store: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntimeWithOptions(t.Context(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	hookCalls := 0
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		AfterProjectRename: func(_ context.Context, snapshot projectstate.Snapshot, projectID string) error {
			hookCalls++
			if projectID != "project-alpha" {
				t.Fatalf("expected hook project-alpha, got %q", projectID)
			}
			if got := snapshot.Document.Projects["project-alpha"].Name; got != "Renamed Alpha" {
				t.Fatalf("expected hook snapshot renamed project, got %q", got)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	if err := service.SetProjectConfigName(context.Background(), "project-alpha", "Renamed Alpha"); err != nil {
		t.Fatalf("set project config name: %v", err)
	}
	if hookCalls != 1 {
		t.Fatalf("expected rename hook once, got %d", hookCalls)
	}

	reloaded, err := store.Load(t.Context())
	if err != nil {
		t.Fatalf("reload project store: %v", err)
	}
	if got := reloaded.Projects["project-alpha"].Name; got != "Renamed Alpha" {
		t.Fatalf("expected persisted renamed project, got %q", got)
	}
}

func TestServiceSetProjectConfigNameNoopSkipsHook(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	hookCalls := 0
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		AfterProjectRename: func(context.Context, projectstate.Snapshot, string) error {
			hookCalls++
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	if err := service.SetProjectConfigName(context.Background(), "project-alpha", "Alpha"); err != nil {
		t.Fatalf("set project config name no-op: %v", err)
	}
	if hookCalls != 0 {
		t.Fatalf("expected no hook calls for rename no-op, got %d", hookCalls)
	}
}

func TestServiceSaveProjectPersistsCurrentRuntimeAndRunsHook(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(t.Context(), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed project store: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntimeWithOptions(t.Context(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		if err := document.SetProjectName("project-alpha", "Unsaved Alpha"); err != nil {
			return projectstate.Document{}, err
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}

	hookCalls := 0
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		AfterProjectSave: func(_ context.Context, snapshot projectstate.Snapshot, projectID string) error {
			hookCalls++
			if projectID != "project-alpha" {
				t.Fatalf("expected project-alpha save hook, got %q", projectID)
			}
			if got := snapshot.Document.Projects["project-alpha"].Name; got != "Unsaved Alpha" {
				t.Fatalf("expected saved snapshot name Unsaved Alpha, got %q", got)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	if err := service.SaveProject(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("SaveProject returned error: %v", err)
	}
	if hookCalls != 1 {
		t.Fatalf("expected save hook once, got %d", hookCalls)
	}

	reloaded, err := store.Load(t.Context())
	if err != nil {
		t.Fatalf("reload store: %v", err)
	}
	if got := reloaded.Projects["project-alpha"].Name; got != "Unsaved Alpha" {
		t.Fatalf("expected persisted Unsaved Alpha, got %q", got)
	}
}

func TestServiceCreateProjectConfigSeedsSingleViewModeAndFlushesPersistenceOnRuntimeClose(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntimeWithOptions(t.Context(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	hookCalls := 0
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		AfterProjectMetadataMutation: func(_ context.Context, snapshot projectstate.Snapshot) error {
			hookCalls++
			if len(snapshot.Document.Projects) != 1 {
				t.Fatalf("expected one created project, got %#v", snapshot.Document.Projects)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	createdName, err := service.CreateProjectConfig(context.Background(), "bg-orange-500/60 dark:bg-orange-600/30")
	if err != nil {
		t.Fatalf("CreateProjectConfig returned error: %v", err)
	}
	if createdName == "" {
		t.Fatal("expected non-empty created name")
	}
	if hookCalls != 1 {
		t.Fatalf("expected metadata hook once, got %d", hookCalls)
	}

	assertCreatedProjectShellSnapshot(t, projectRuntime.Snapshot(), createdName)

	if err := projectRuntime.Close(); err != nil {
		t.Fatalf("close project runtime: %v", err)
	}

	reloaded, err := store.Load(t.Context())
	if err != nil {
		t.Fatalf("reload store: %v", err)
	}
	assertCreatedProjectShellPersistedDocument(t, reloaded, createdName)
}

func openProjectShellRuntimeForTest(t *testing.T, store *projectstate.Store) *projectstate.Runtime {
	t.Helper()

	projectRuntime, err := projectstate.OpenRuntimeWithOptions(t.Context(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})
	return projectRuntime
}

func assertCreatedProjectShellSnapshot(
	t *testing.T,
	snapshot projectstate.Snapshot,
	createdName string,
) {
	t.Helper()

	if len(snapshot.Document.Projects) != 1 {
		t.Fatalf("expected one in-memory project after create, got %#v", snapshot.Document.Projects)
	}
	project := snapshot.Document.Projects[snapshot.Document.DefaultProjectID]
	if project.Name != createdName {
		t.Fatalf("expected in-memory project name %q, got %q", createdName, project.Name)
	}
	if len(project.ViewModes) != 1 {
		t.Fatalf("expected one initial in-memory view mode, got %#v", project.ViewModes)
	}
}

func assertCreatedProjectShellPersistedDocument(
	t *testing.T,
	document projectstate.Document,
	createdName string,
) {
	t.Helper()

	if len(document.Projects) != 1 {
		t.Fatalf("expected one persisted project, got %#v", document.Projects)
	}
	persistedProject := document.Projects[document.DefaultProjectID]
	if persistedProject.Name != createdName {
		t.Fatalf("expected persisted project name %q, got %q", createdName, persistedProject.Name)
	}
	if len(persistedProject.ViewModes) != 1 {
		t.Fatalf("expected one initial view mode, got %#v", persistedProject.ViewModes)
	}
	assertEmptyCreatedProjectChatWindowing(t, persistedProject)
}

func assertEmptyCreatedProjectChatWindowing(t *testing.T, project projectstate.Project) {
	t.Helper()

	if project.ProjectChatWindowing == nil {
		t.Fatal("expected persisted project chat windowing state")
	}
	if len(project.ProjectChatWindowing.InstancesByID) != 0 {
		t.Fatalf("expected no created project chat windows, got %#v", project.ProjectChatWindowing.InstancesByID)
	}
	if !reflect.DeepEqual(project.ProjectChatWindowing.Order, []string{}) {
		t.Fatalf("expected empty created project chat window order, got %#v", project.ProjectChatWindowing.Order)
	}
	if project.ProjectChatWindowing.NextInstanceNumber != 1 {
		t.Fatalf("expected next instance number 1, got %d", project.ProjectChatWindowing.NextInstanceNumber)
	}
}

func TestServiceSaveAsNewProjectConfigWithRefsSeedsEmptyLiveWindowing(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	seedProjectShellStoreWithWindowing(t, store)

	projectRuntime := openProjectShellRuntimeForTest(t, store)

	hookCalls := 0
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		AfterProjectMetadataMutation: func(context.Context, projectstate.Snapshot) error {
			hookCalls++
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	if err := service.SaveAsNewProjectConfig(context.Background(), "project-alpha", "Cloned Alpha", true); err != nil {
		t.Fatalf("SaveAsNewProjectConfig returned error: %v", err)
	}
	if hookCalls != 1 {
		t.Fatalf("expected metadata hook once, got %d", hookCalls)
	}

	reloaded, err := store.Load(t.Context())
	if err != nil {
		t.Fatalf("reload store: %v", err)
	}
	if len(reloaded.Projects) != 2 {
		t.Fatalf("expected two persisted projects, got %#v", reloaded.Projects)
	}

	clonedProject := mustFindClonedProjectShellProject(t, reloaded, "Cloned Alpha")
	assertClonedProjectShellGraphCopied(t, clonedProject)
	assertWithRefsClonedProjectShellWindowingReset(t, clonedProject)
}

func seedProjectShellStoreWithWindowing(t *testing.T, store *projectstate.Store) {
	t.Helper()

	if err := store.Save(t.Context(), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": serviceTestProjectWithWindowing(),
		},
	}); err != nil {
		t.Fatalf("seed project store: %v", err)
	}
}

func mustFindClonedProjectShellProject(
	t *testing.T,
	document projectstate.Document,
	expectedName string,
) projectstate.Project {
	t.Helper()

	for projectID, project := range document.Projects {
		if projectID == "project-alpha" {
			continue
		}
		if project.Name == expectedName {
			return project
		}
	}
	t.Fatalf("expected cloned project in %#v", document.Projects)
	return projectstate.Project{}
}

func assertClonedProjectShellGraphCopied(t *testing.T, clonedProject projectstate.Project) {
	t.Helper()

	if clonedProject.ID == "project-alpha" {
		t.Fatalf("expected cloned project id to differ, got %#v", clonedProject)
	}
	if len(clonedProject.ViewModes) != 1 || clonedProject.ActiveViewModeID != "focus" {
		t.Fatalf("expected cloned project graph to be copied, got %#v", clonedProject)
	}
	if clonedProject.WindowSpaces["space-1"].WindowsByID["chat-window"].ChatID != nil {
		t.Fatalf("expected saved window-space chat id cleared, got %#v", clonedProject.WindowSpaces["space-1"].WindowsByID["chat-window"].ChatID)
	}
}

func assertWithRefsClonedProjectShellWindowingReset(t *testing.T, clonedProject projectstate.Project) {
	t.Helper()

	if clonedProject.ProjectChatWindowing == nil {
		t.Fatal("expected cloned live windowing state")
	}
	if len(clonedProject.ProjectChatWindowing.Order) != 0 || clonedProject.ProjectChatWindowing.NextInstanceNumber != 1 {
		t.Fatalf("expected withRefs clone to reset live windowing, got %#v", clonedProject.ProjectChatWindowing)
	}
}

func TestServiceSaveAsNewProjectConfigWithoutRefsCopiesLiveWindowingLayout(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	seedProjectShellStoreWithWindowing(t, store)

	projectRuntime := openProjectShellRuntimeForTest(t, store)

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	if err := service.SaveAsNewProjectConfig(context.Background(), "project-alpha", "Cloned Alpha", false); err != nil {
		t.Fatalf("SaveAsNewProjectConfig returned error: %v", err)
	}

	reloaded, err := store.Load(t.Context())
	if err != nil {
		t.Fatalf("reload store: %v", err)
	}

	clonedProject := mustFindClonedProjectShellProject(t, reloaded, "Cloned Alpha")
	assertWithoutRefsClonedProjectShellWindowingCopied(t, clonedProject)
}

func assertWithoutRefsClonedProjectShellWindowingCopied(t *testing.T, clonedProject projectstate.Project) {
	t.Helper()

	if clonedProject.ProjectChatWindowing == nil {
		t.Fatal("expected cloned live windowing state")
	}
	if len(clonedProject.ProjectChatWindowing.Order) != 1 || clonedProject.ProjectChatWindowing.Order[0] != "project-window" {
		t.Fatalf("expected live window order to be preserved, got %#v", clonedProject.ProjectChatWindowing.Order)
	}
	if clonedProject.ProjectChatWindowing.NextInstanceNumber != 3 {
		t.Fatalf("expected next instance number 3, got %d", clonedProject.ProjectChatWindowing.NextInstanceNumber)
	}
	clonedWindow := clonedProject.ProjectChatWindowing.InstancesByID["project-window"]
	if clonedWindow.ChatID != nil {
		t.Fatalf("expected copied live chat id cleared, got %#v", clonedWindow.ChatID)
	}
	if clonedWindow.Bounds.Width != 520 || clonedWindow.Bounds.Height != 360 {
		t.Fatalf("expected copied bounds preserved, got %#v", clonedWindow.Bounds)
	}
	if clonedProject.WindowSpaces["space-1"].WindowsByID["chat-window"].ChatID != nil {
		t.Fatalf("expected saved window-space chat id cleared, got %#v", clonedProject.WindowSpaces["space-1"].WindowsByID["chat-window"].ChatID)
	}
}

func TestServiceSaveAsNewProjectConfigRejectsInvalidName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := NewService(ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	err = service.SaveAsNewProjectConfig(context.Background(), "project-alpha", "home", false)
	if err == nil {
		t.Fatal("expected invalid name error")
	}
	if !projectstate.IsInvalidProjectNameError(err) {
		t.Fatalf("expected invalid project name error, got %v", err)
	}
}

func serviceTestProjectWithWindowing() projectstate.Project {
	return projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Alpha",
		AllowJSONSourceKeyEdits: true,
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:   "focus",
				Name: "Focus",
			},
		},
		ActiveViewModeID: "focus",
		WindowSpaces: map[string]projectstate.WindowSpaceConfig{
			"space-1": {
				ID:        "space-1",
				Name:      "Copied Layout",
				SortIndex: 0,
				Order:     []string{"chat-window"},
				WindowsByID: map[string]projectstate.WindowSpaceWindow{
					"chat-window": {
						SurfaceKind:      projectstate.WindowSpaceSurfaceKindProjectChat,
						Mode:             projectstate.ChatWindowModeProjectAI,
						Title:            serviceTestStringPointer("Project Chat"),
						ChatID:           serviceTestStringPointer("saved-chat"),
						ZIndex:           2,
						NormalizedBounds: projectstate.NormalizedFloatingWindowBounds{X: 0.1, Y: 0.2, Width: 0.5, Height: 0.4},
					},
				},
			},
		},
		ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
			InstancesByID: map[string]projectstate.ProjectChatWindowInstance{
				"project-window": {
					InstanceID: "project-window",
					Placement:  projectstate.ChatWindowPlacementFloating,
					Mode:       projectstate.ChatWindowModeProjectAI,
					Title:      serviceTestStringPointer("Project Chat"),
					ChatID:     serviceTestStringPointer("live-chat"),
					ZIndex:     4,
					Bounds: projectstate.ChatWindowBounds{
						X:      48,
						Y:      64,
						Width:  520,
						Height: 360,
					},
				},
			},
			Order:              []string{"project-window"},
			NextInstanceNumber: 3,
		},
	}
}

func serviceTestStringPointer(value string) *string {
	return &value
}

func TestServiceDeleteProjectConfigsDeletesProjectsRunsHooksAndReconcilesDefault(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(t.Context(), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-beta",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
			},
		},
	}); err != nil {
		t.Fatalf("seed project store: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntimeWithOptions(t.Context(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	deleteHookCalls := 0
	metadataHookCalls := 0
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		AfterProjectsDelete: func(_ context.Context, snapshot projectstate.Snapshot, deletedIDs []string) error {
			deleteHookCalls++
			if len(deletedIDs) != 1 || deletedIDs[0] != "project-beta" {
				t.Fatalf("unexpected deleted ids %#v", deletedIDs)
			}
			if _, ok := snapshot.Document.Projects["project-beta"]; ok {
				t.Fatalf("expected project-beta removed from snapshot, got %#v", snapshot.Document.Projects)
			}
			return nil
		},
		AfterProjectMetadataMutation: func(_ context.Context, snapshot projectstate.Snapshot) error {
			metadataHookCalls++
			if snapshot.Document.DefaultProjectID != "project-alpha" {
				t.Fatalf("expected default project-alpha, got %q", snapshot.Document.DefaultProjectID)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	if err := service.DeleteProjectConfigs(context.Background(), []string{"project-beta"}); err != nil {
		t.Fatalf("DeleteProjectConfigs returned error: %v", err)
	}
	if deleteHookCalls != 1 {
		t.Fatalf("expected delete hook once, got %d", deleteHookCalls)
	}
	if metadataHookCalls != 1 {
		t.Fatalf("expected metadata hook once, got %d", metadataHookCalls)
	}

	reloaded, err := store.Load(t.Context())
	if err != nil {
		t.Fatalf("reload store: %v", err)
	}
	if _, ok := reloaded.Projects["project-beta"]; ok {
		t.Fatalf("expected project-beta removed from store, got %#v", reloaded.Projects)
	}
	if reloaded.DefaultProjectID != "project-alpha" {
		t.Fatalf("expected default project-alpha, got %q", reloaded.DefaultProjectID)
	}
}
