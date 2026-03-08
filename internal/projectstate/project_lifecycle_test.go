package projectstate

import "testing"

func TestDocumentCreateProjectInitializesSingleViewModeAndDefault(t *testing.T) {
	t.Parallel()

	document := NewDocument()

	projectID, projectName, err := document.CreateProject("bg-blue-500/60 dark:bg-blue-600/30")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if projectName != "Project" {
		t.Fatalf("expected created project name Project, got %q", projectName)
	}
	if document.DefaultProjectID != projectID {
		t.Fatalf("expected default project %q, got %q", projectID, document.DefaultProjectID)
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
	if viewMode.Name != "View Mode" {
		t.Fatalf("expected initial view mode name View Mode, got %q", viewMode.Name)
	}
}

func TestDocumentCreateProjectUsesNextAvailableProjectName(t *testing.T) {
	t.Parallel()

	document := NewDocument()
	document.Projects["project-1"] = Project{ID: "project-1", Name: "Project"}
	document.Projects["project-2"] = Project{ID: "project-2", Name: "Project 2"}
	document.DefaultProjectID = "project-1"

	_, projectName, err := document.CreateProject("bg-orange-500/60 dark:bg-orange-600/30")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if projectName != "Project 3" {
		t.Fatalf("expected Project 3, got %q", projectName)
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
	if sourceAfterMutation.ViewModes[sourceAfterMutation.ActiveViewModeID].Name != "View Mode" {
		t.Fatalf("expected source project to remain unchanged, got %#v", sourceAfterMutation.ViewModes)
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
