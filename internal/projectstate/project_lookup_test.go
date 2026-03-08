package projectstate

import (
	"errors"
	"testing"
)

func TestDocumentProjectIDByNameReturnsMatchedID(t *testing.T) {
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

	projectID, err := document.ProjectIDByName("Alpha")
	if err != nil {
		t.Fatalf("project id by name: %v", err)
	}
	if projectID != "project-alpha" {
		t.Fatalf("expected project-alpha, got %q", projectID)
	}
}

func TestDocumentProjectIDByNameRejectsBlankName(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	}

	_, err := document.ProjectIDByName(" ")
	if err == nil {
		t.Fatal("expected blank project name error")
	}
	if !errors.Is(err, ErrProjectLookupNameRequired) {
		t.Fatalf("expected ErrProjectLookupNameRequired, got %v", err)
	}
}

func TestDocumentProjectIDByNameReturnsProjectNotFound(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}

	_, err := document.ProjectIDByName("Missing")
	if err == nil {
		t.Fatal("expected missing project error")
	}
	if !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("expected ErrProjectNotFound, got %v", err)
	}
}

func TestDocumentProjectIDByNameRejectsAmbiguousName(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Shared",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Shared",
			},
		},
	}

	_, err := document.ProjectIDByName("Shared")
	if err == nil {
		t.Fatal("expected ambiguous project name error")
	}
	if !errors.Is(err, ErrProjectNameAmbiguous) {
		t.Fatalf("expected ErrProjectNameAmbiguous, got %v", err)
	}
}
