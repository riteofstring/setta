package projectstate

import (
	"reflect"
	"testing"
)

func TestDocumentCreateProjectInitializesSingleViewModeAndDefault(t *testing.T) {
	t.Parallel()

	document := NewDocument()

	projectID, projectName, err := document.CreateProject("bg-blue-500/60 dark:bg-blue-600/30")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if projectName == "" {
		t.Fatal("expected non-empty created project name")
	}
	if document.DefaultProjectID != projectID {
		t.Fatalf("expected default project %q, got %q", projectID, document.DefaultProjectID)
	}
	if _, err := validateProjectName(document, projectID, projectName, false); err != nil {
		t.Fatalf("expected created project name to remain valid, got %q with error %v", projectName, err)
	}

	project, err := document.ProjectByID(projectID)
	if err != nil {
		t.Fatalf("ProjectByID returned error: %v", err)
	}
	if !project.AllowJSONSourceKeyEdits {
		t.Fatal("expected AllowJSONSourceKeyEdits to default to true")
	}
	if project.PreviewImgColor != "bg-blue-500/60 dark:bg-blue-600/30" {
		t.Fatalf("unexpected preview image color %q", project.PreviewImgColor)
	}
	if len(project.ViewModes) != 1 {
		t.Fatalf("expected one initial view mode, got %#v", project.ViewModes)
	}
	if project.ActiveViewModeID == "" {
		t.Fatal("expected active view mode id")
	}

	viewMode, ok := project.ViewModes[project.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected active view mode %q to exist", project.ActiveViewModeID)
	}
	if viewMode.Name == "" {
		t.Fatal("expected initial view mode name")
	}
	if _, err := validateViewModeName(project, project.ActiveViewModeID, viewMode.Name); err != nil {
		t.Fatalf("expected created view mode name to remain valid, got %q with error %v", viewMode.Name, err)
	}
}

func TestNextAvailableProjectNameRetriesGeneratedNamesUntilOneIsValid(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.Projects["project-1"] = Project{ID: "project-1", Name: "happy_bear"}

	attempts := 0
	projectName, err := nextAvailableProjectNameWithGenerator(document, func() (string, error) {
		attempts++
		switch attempts {
		case 1:
			return "happy_bear", nil
		case 2:
			return "home", nil
		default:
			return "calm_fox", nil
		}
	})
	if err != nil {
		t.Fatalf("nextAvailableProjectNameWithGenerator returned error: %v", err)
	}
	if projectName != "calm_fox" {
		t.Fatalf("expected calm_fox after retries, got %q", projectName)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 attempts, got %d", attempts)
	}
}

func TestDocumentCloneProjectCreatesIndependentCopy(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	sourceProjectID, _, err := document.CreateProject("bg-blue-500/60 dark:bg-blue-600/30")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	clonedProjectID, normalizedName, err := document.CloneProject(sourceProjectID, "  Cloned Project  ")
	if err != nil {
		t.Fatalf("CloneProject returned error: %v", err)
	}
	if normalizedName != "Cloned Project" {
		t.Fatalf("expected normalized cloned name, got %q", normalizedName)
	}
	if clonedProjectID == sourceProjectID {
		t.Fatalf("expected new project id, got %q", clonedProjectID)
	}

	sourceProject, err := document.ProjectByID(sourceProjectID)
	if err != nil {
		t.Fatalf("ProjectByID source returned error: %v", err)
	}
	sourceViewModeName := sourceProject.ViewModes[sourceProject.ActiveViewModeID].Name
	clonedProject, err := document.ProjectByID(clonedProjectID)
	if err != nil {
		t.Fatalf("ProjectByID clone returned error: %v", err)
	}
	if clonedProject.Name != "Cloned Project" {
		t.Fatalf("expected cloned project name, got %q", clonedProject.Name)
	}
	if len(clonedProject.ViewModes) != len(sourceProject.ViewModes) {
		t.Fatalf("expected cloned view modes %#v to match source %#v", clonedProject.ViewModes, sourceProject.ViewModes)
	}

	clonedViewMode := clonedProject.ViewModes[clonedProject.ActiveViewModeID]
	clonedViewMode.Name = "Modified Clone"
	clonedProject.ViewModes[clonedProject.ActiveViewModeID] = clonedViewMode
	document.Projects[clonedProjectID] = clonedProject

	sourceAfterMutation, err := document.ProjectByID(sourceProjectID)
	if err != nil {
		t.Fatalf("ProjectByID source after mutation returned error: %v", err)
	}
	if sourceAfterMutation.ViewModes[sourceAfterMutation.ActiveViewModeID].Name != sourceViewModeName {
		t.Fatalf("expected source project to remain unchanged, got %#v", sourceAfterMutation.ViewModes)
	}
}

func TestDocumentSaveAsNewProjectConfigWithRefsClearsSavedChatIDsAndResetsLiveWindowing(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = testSaveAsNewProjectConfigSourceProject()

	clonedProjectID, normalizedName, err := document.SaveAsNewProjectConfig(
		"project-alpha",
		"  Copied With Refs  ",
		true,
	)
	if err != nil {
		t.Fatalf("SaveAsNewProjectConfig returned error: %v", err)
	}
	if normalizedName != "Copied With Refs" {
		t.Fatalf("expected normalized cloned name, got %q", normalizedName)
	}
	if clonedProjectID == "project-alpha" {
		t.Fatalf("expected new project id, got %q", clonedProjectID)
	}

	clonedProject, err := document.ProjectByID(clonedProjectID)
	if err != nil {
		t.Fatalf("ProjectByID clone returned error: %v", err)
	}
	if clonedProject.ProjectChatWindowing == nil {
		t.Fatal("expected cloned live windowing state")
	}
	if !reflect.DeepEqual(*clonedProject.ProjectChatWindowing, DefaultProjectChatWindowingState()) {
		t.Fatalf("expected withRefs clone to seed empty live windowing, got %#v", clonedProject.ProjectChatWindowing)
	}

	clonedWindowSpace := clonedProject.WindowSpaces["space-1"]
	if clonedWindowSpace.WindowsByID["project-window"].ChatID != nil {
		t.Fatalf("expected saved project-chat binding cleared, got %#v", clonedWindowSpace.WindowsByID["project-window"].ChatID)
	}
	if clonedWindowSpace.WindowsByID["section-window"].ChatID != nil {
		t.Fatalf("expected saved section-chat binding cleared, got %#v", clonedWindowSpace.WindowsByID["section-window"].ChatID)
	}
	if clonedWindowSpace.WindowsByID["section-window"].SectionIDOrNull == nil || *clonedWindowSpace.WindowsByID["section-window"].SectionIDOrNull != "chat-section" {
		t.Fatalf("expected saved section binding to stay project-scoped, got %#v", clonedWindowSpace.WindowsByID["section-window"].SectionIDOrNull)
	}
	if _, ok := clonedProject.Sections["chat-section"]; !ok {
		t.Fatalf("expected cloned project to retain project-scoped section ids, got %#v", clonedProject.Sections)
	}
}

func TestDocumentSaveAsNewProjectConfigWithoutRefsCopiesLiveWindowingAndClearsChatIDs(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = testSaveAsNewProjectConfigSourceProject()

	clonedProjectID, normalizedName, err := document.SaveAsNewProjectConfig(
		"project-alpha",
		"Copied Without Refs",
		false,
	)
	if err != nil {
		t.Fatalf("SaveAsNewProjectConfig returned error: %v", err)
	}
	if normalizedName != "Copied Without Refs" {
		t.Fatalf("expected normalized cloned name, got %q", normalizedName)
	}

	clonedProject, err := document.ProjectByID(clonedProjectID)
	if err != nil {
		t.Fatalf("ProjectByID clone returned error: %v", err)
	}
	if clonedProject.ProjectChatWindowing == nil {
		t.Fatal("expected cloned live windowing state")
	}
	if !reflect.DeepEqual(clonedProject.ProjectChatWindowing.Order, []string{"project-window", "section-window"}) {
		t.Fatalf("expected live window order to be preserved, got %#v", clonedProject.ProjectChatWindowing.Order)
	}
	if clonedProject.ProjectChatWindowing.NextInstanceNumber != 3 {
		t.Fatalf("expected next instance number 3, got %d", clonedProject.ProjectChatWindowing.NextInstanceNumber)
	}

	projectWindow := clonedProject.ProjectChatWindowing.InstancesByID["project-window"]
	if projectWindow.ChatID != nil {
		t.Fatalf("expected copied project chat id to be cleared, got %#v", projectWindow.ChatID)
	}
	if projectWindow.Bounds.Width != 520 || projectWindow.Bounds.Height != 360 {
		t.Fatalf("expected live project-chat bounds to be preserved, got %#v", projectWindow.Bounds)
	}

	sectionWindow := clonedProject.ProjectChatWindowing.InstancesByID["section-window"]
	if sectionWindow.ChatID != nil {
		t.Fatalf("expected copied section chat id to be cleared, got %#v", sectionWindow.ChatID)
	}
	if sectionWindow.SectionIDOrNull == nil || *sectionWindow.SectionIDOrNull != "chat-section" {
		t.Fatalf("expected copied section binding to stay valid within the cloned project, got %#v", sectionWindow.SectionIDOrNull)
	}
	if _, ok := clonedProject.Sections["chat-section"]; !ok {
		t.Fatalf("expected cloned project to retain project-scoped section ids, got %#v", clonedProject.Sections)
	}

	clonedWindowSpace := clonedProject.WindowSpaces["space-1"]
	if clonedWindowSpace.WindowsByID["project-window"].ChatID != nil {
		t.Fatalf("expected saved project-chat binding cleared, got %#v", clonedWindowSpace.WindowsByID["project-window"].ChatID)
	}
	if clonedWindowSpace.WindowsByID["section-window"].ChatID != nil {
		t.Fatalf("expected saved section-chat binding cleared, got %#v", clonedWindowSpace.WindowsByID["section-window"].ChatID)
	}
}

func TestDocumentDeleteProjectsReconcilesDefaultProject(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-beta"
	document.Projects["project-beta"] = Project{ID: "project-beta", Name: "Beta"}
	document.Projects["project-alpha"] = Project{ID: "project-alpha", Name: "Alpha"}

	deletedIDs, err := document.DeleteProjects([]string{"project-beta", "project-beta"})
	if err != nil {
		t.Fatalf("DeleteProjects returned error: %v", err)
	}
	if len(deletedIDs) != 1 || deletedIDs[0] != "project-beta" {
		t.Fatalf("unexpected deleted ids %#v", deletedIDs)
	}
	if document.DefaultProjectID != "project-alpha" {
		t.Fatalf("expected default project-alpha, got %q", document.DefaultProjectID)
	}
	if _, ok := document.Projects["project-beta"]; ok {
		t.Fatalf("expected project-beta to be removed, got %#v", document.Projects)
	}

	deletedIDs, err = document.DeleteProjects([]string{"project-alpha"})
	if err != nil {
		t.Fatalf("DeleteProjects all returned error: %v", err)
	}
	if len(deletedIDs) != 1 || deletedIDs[0] != "project-alpha" {
		t.Fatalf("unexpected deleted ids after second delete %#v", deletedIDs)
	}
	if document.DefaultProjectID != "" {
		t.Fatalf("expected default project id to clear, got %q", document.DefaultProjectID)
	}
}

func TestDocumentSetDefaultProjectIDTrimsWhitespaceAndUpdatesDefault(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects["project-alpha"] = Project{ID: "project-alpha", Name: "Alpha"}
	document.Projects["project-beta"] = Project{ID: "project-beta", Name: "Beta"}

	if err := document.SetDefaultProjectID("  project-beta  "); err != nil {
		t.Fatalf("SetDefaultProjectID returned error: %v", err)
	}
	if document.DefaultProjectID != "project-beta" {
		t.Fatalf("expected default project-beta, got %q", document.DefaultProjectID)
	}
}

func testSaveAsNewProjectConfigSourceProject() Project {
	return Project{
		ID:   "project-alpha",
		Name: "Alpha",
		Sections: map[string]Section{
			"chat-section": {
				ID:   "chat-section",
				Name: "Chat Section",
			},
		},
		WindowSpaces: map[string]WindowSpaceConfig{
			"space-1": {
				ID:        "space-1",
				Name:      "Copied Layout",
				SortIndex: 0,
				Order:     []string{"project-window", "section-window"},
				WindowsByID: map[string]WindowSpaceWindow{
					"project-window": {
						SurfaceKind:      WindowSpaceSurfaceKindProjectChat,
						Mode:             ChatWindowModeProjectAI,
						Title:            stringPointer("Project Chat"),
						ChatID:           stringPointer("source-project-chat"),
						ZIndex:           3,
						NormalizedBounds: NormalizedFloatingWindowBounds{X: 0.1, Y: 0.2, Width: 0.5, Height: 0.4},
					},
					"section-window": {
						SurfaceKind:      WindowSpaceSurfaceKindSection,
						Mode:             ChatWindowModeSection,
						SectionIDOrNull:  stringPointer("chat-section"),
						Title:            stringPointer("Section Chat"),
						ChatID:           stringPointer("source-section-chat"),
						ZIndex:           4,
						NormalizedBounds: NormalizedFloatingWindowBounds{X: 0.2, Y: 0.3, Width: 0.4, Height: 0.5},
					},
				},
			},
		},
		ProjectChatWindowing: &ProjectChatWindowingState{
			InstancesByID: map[string]ProjectChatWindowInstance{
				"project-window": {
					InstanceID: "project-window",
					Placement:  ChatWindowPlacementFloating,
					Mode:       ChatWindowModeProjectAI,
					Title:      stringPointer("Project Chat"),
					ChatID:     stringPointer("live-project-chat"),
					ZIndex:     5,
					Bounds: ChatWindowBounds{
						X:      48,
						Y:      64,
						Width:  520,
						Height: 360,
					},
				},
				"section-window": {
					InstanceID:      "section-window",
					Placement:       ChatWindowPlacementFloating,
					Mode:            ChatWindowModeSection,
					SectionIDOrNull: stringPointer("chat-section"),
					Title:           stringPointer("Section Chat"),
					ChatID:          stringPointer("live-section-chat"),
					ZIndex:          6,
					Bounds: ChatWindowBounds{
						X:      640,
						Y:      96,
						Width:  420,
						Height: 320,
					},
				},
			},
			Order:              []string{"project-window", "section-window"},
			NextInstanceNumber: 3,
		},
	}
}

func TestDocumentSetDefaultProjectIDRequiresKnownProject(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.Projects["project-alpha"] = Project{ID: "project-alpha", Name: "Alpha"}

	err := document.SetDefaultProjectID("missing")
	if err == nil {
		t.Fatal("expected missing project error")
	}
	if err != ErrProjectNotFound && err.Error() == "" {
		t.Fatalf("expected project not found error, got %v", err)
	}
}
