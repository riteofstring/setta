package projectstate

import (
	"errors"
	"testing"
)

func TestDocumentSetProjectNameTrimsWhitespaceAndUpdatesProject(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
			},
		},
	}

	if err := document.SetProjectName("project-alpha", "  Renamed Project  "); err != nil {
		t.Fatalf("set project name: %v", err)
	}

	if got := document.Projects["project-alpha"].Name; got != "Renamed Project" {
		t.Fatalf("expected trimmed renamed project, got %q", got)
	}
}

func TestDocumentSetProjectNameRejectsReservedName(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}

	err := document.SetProjectName("project-alpha", "home")
	if err == nil {
		t.Fatal("expected reserved-name error")
	}
	if !IsInvalidProjectNameError(err) {
		t.Fatalf("expected invalid project name error, got %v", err)
	}
}

func TestDocumentSetProjectNameRejectsSlugCollision(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "foo_bar",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
			},
		},
	}

	err := document.SetProjectName("project-beta", "foo bar")
	if err == nil {
		t.Fatal("expected slug-collision error")
	}
	if !IsInvalidProjectNameError(err) {
		t.Fatalf("expected invalid project name error, got %v", err)
	}
}

func TestDocumentSetProjectNameRequiresKnownProject(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	}

	err := document.SetProjectName("missing", "Alpha")
	if err == nil {
		t.Fatal("expected missing-project error")
	}
	if !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("expected ErrProjectNotFound, got %v", err)
	}
}
