package settingsstate

import (
	"encoding/json"
	"reflect"
	"testing"

	"setta/internal/projectstate"
)

func TestBuildProjectDocumentMatchesSettingsShellContract(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}

	projectDocument, err := BuildProjectDocument(settingsDocument)
	if err != nil {
		t.Fatalf("build settings project document: %v", err)
	}

	project, err := projectDocument.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id: %v", err)
	}
	if project.Name != SettingsProjectName {
		t.Fatalf("expected settings project name %q, got %q", SettingsProjectName, project.Name)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected settings shell to show param display names")
	}
	if project.AllowJSONSourceKeyEdits {
		t.Fatal("did not expect settings shell to allow JSON source key edits")
	}
	if len(project.TopLevelSectionIDs) != 46 {
		t.Fatalf("expected 46 top-level sections, got %d", len(project.TopLevelSectionIDs))
	}
	if len(project.Sections) != 46 {
		t.Fatalf("expected 46 sections, got %d", len(project.Sections))
	}
	if len(project.ViewModes) != 5 {
		t.Fatalf("expected 5 settings view modes, got %d", len(project.ViewModes))
	}
	if project.ActiveViewModeID != "settings-core" {
		t.Fatalf("expected active view mode settings-core, got %q", project.ActiveViewModeID)
	}
	if len(project.TopLevelSections) != 46 {
		t.Fatalf("expected shared settings layout to include 46 sections, got %d", len(project.TopLevelSections))
	}

	expectedCountsByView := map[string]int{
		"All Settings":                        46,
		"Core":                                5,
		"Param Defaults":                      13,
		"Section Defaults Content and Media":  10,
		"Section Defaults Structure and Code": 12,
	}
	for _, viewMode := range project.ViewModes {
		expectedCount, ok := expectedCountsByView[viewMode.Name]
		if !ok {
			t.Fatalf("unexpected settings view mode %q", viewMode.Name)
		}
		visibleCount := 0
		for _, visible := range viewMode.VisibilityBySectionID {
			if visible {
				visibleCount++
			}
		}
		if visibleCount != expectedCount {
			t.Fatalf("expected %q to expose %d visible sections, got %d", viewMode.Name, expectedCount, visibleCount)
		}
	}

	roundTripDocument, err := ApplySettingsProjectDocument(settingsDocument, projectDocument)
	if err != nil {
		t.Fatalf("apply settings project document: %v", err)
	}
	if !reflect.DeepEqual(roundTripDocument, settingsDocument) {
		t.Fatalf("expected settings round-trip to preserve defaults, got %#v", roundTripDocument)
	}
}

func TestEnsureProjectRuntimeBootstrappedSeedsDedicatedSettingsProject(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id: %v", err)
	}
	if project.Name != SettingsProjectName {
		t.Fatalf("expected settings project name %q, got %q", SettingsProjectName, project.Name)
	}
	if len(project.Sections) != 46 {
		t.Fatalf("expected 46 settings sections, got %d", len(project.Sections))
	}
}

func TestRefreshProjectRuntimeFromSettingsHydratesLiveValuesAndPreservesActiveViewMode(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	if _, err := projectRuntime.MutateAndSave(t.Context(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects[SettingsProjectID]
		project.ActiveViewModeID = "settings-all"
		document.Projects[SettingsProjectID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("set active view mode: %v", err)
	}

	if _, err := settingsRuntime.MutateAndSave(t.Context(), func(document Document) (Document, error) {
		document["backend"].(map[string]any)["renameRefactorMode"] = "NEVER_RENAME"
		return document, nil
	}); err != nil {
		t.Fatalf("update live settings runtime: %v", err)
	}

	if err := RefreshProjectRuntimeFromSettings(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("refresh settings project runtime: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id after refresh: %v", err)
	}
	if project.ActiveViewModeID != "settings-all" {
		t.Fatalf("expected active view mode settings-all, got %q", project.ActiveViewModeID)
	}
	if got := settingsProjectCodeObjValue(t, project, "settings-codeobj-impl__backend__backend__renameRefactorMode"); got != "NEVER_RENAME" {
		t.Fatalf("expected renameRefactorMode NEVER_RENAME, got %q", got)
	}
}

func TestRefreshProjectRuntimeFromSettingsRepairsMissingRequiredViewMode(t *testing.T) {
	t.Parallel()

	settingsDocument, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})

	if err := EnsureProjectRuntimeBootstrapped(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("ensure settings project runtime bootstrapped: %v", err)
	}

	if _, err := projectRuntime.MutateAndSave(t.Context(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects[SettingsProjectID]
		delete(project.ViewModes, "settings-all")
		project.ActiveViewModeID = "settings-param-defaults"
		project.IsEditingViewMode = true
		project.Viewport = &projectstate.Viewport{X: 80, Y: 40, Zoom: 1.3}
		project.ViewportInitialized = true
		document.Projects[SettingsProjectID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("delete required view mode: %v", err)
	}

	if err := RefreshProjectRuntimeFromSettings(t.Context(), settingsRuntime, projectRuntime); err != nil {
		t.Fatalf("refresh settings project runtime: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("project by id after refresh: %v", err)
	}
	if len(project.ViewModes) != 5 {
		t.Fatalf("expected 5 repaired settings view modes, got %d", len(project.ViewModes))
	}
	if _, ok := project.ViewModes["settings-all"]; !ok {
		t.Fatal("expected missing required settings-all view mode to be restored")
	}
	if project.ActiveViewModeID != "settings-param-defaults" {
		t.Fatalf("expected active view mode settings-param-defaults, got %q", project.ActiveViewModeID)
	}
	if project.IsEditingViewMode {
		t.Fatal("expected view-edit mode to reset to false after repair")
	}
	if project.Viewport != nil {
		t.Fatalf("expected repaired project viewport to be reset from rebuilt active tab, got %#v", project.Viewport)
	}
	if project.ViewportInitialized {
		t.Fatal("expected repaired project viewportInitialized to be false")
	}
	activeViewMode := project.ViewModes[project.ActiveViewModeID]
	if !reflect.DeepEqual(project.TopLevelSections, activeViewMode.TopLevelSections) {
		t.Fatalf("expected active view mode layout to be reprojected onto project layout")
	}
}

func settingsProjectCodeObjValue(t *testing.T, project projectstate.Project, implID string) string {
	t.Helper()

	impl, ok := project.CodeObjImpls[implID]
	if !ok {
		t.Fatalf("expected code object impl %q", implID)
	}
	var payload struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(impl.Payload, &payload); err != nil {
		t.Fatalf("decode code object impl payload %q: %v", implID, err)
	}
	return payload.Value
}
