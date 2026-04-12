package projectstate

import (
	"errors"
	"testing"
)

func TestDocumentNormalizedNormalizesProjectEntries(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:                   "project-alpha",
				Name:                 "Alpha",
				ProjectChatWindowing: projectChatWindowingStatePtr(DefaultProjectChatWindowingState()),
			},
		},
	}

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("Normalized returned error: %v", err)
	}

	project := normalized.Projects["project-alpha"]
	if project.Sections == nil {
		t.Fatal("expected Normalized to initialize project sections")
	}
	if project.ProjectChatWindowing == nil {
		t.Fatal("expected Normalized to preserve project chat windowing")
	}
}

func TestDocumentNormalizedRejectsProjectIDKeyMismatch(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects: map[string]Project{
			"project-alpha": {
				ID:                   "project-beta",
				Name:                 "Alpha",
				ProjectChatWindowing: projectChatWindowingStatePtr(DefaultProjectChatWindowingState()),
			},
		},
	}

	_, err := document.Normalized()
	if !errors.Is(err, ErrProjectIDKeyMismatch) {
		t.Fatalf("expected ErrProjectIDKeyMismatch, got %v", err)
	}
}

func TestDocumentNormalizedRejectsBlankDefaultProjectID(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "   ",
		Projects: map[string]Project{
			"project-alpha": {
				ID:                   "project-alpha",
				Name:                 "Alpha",
				ProjectChatWindowing: projectChatWindowingStatePtr(DefaultProjectChatWindowingState()),
			},
		},
	}

	_, err := document.Normalized()
	if !errors.Is(err, ErrDefaultProjectIDRequired) {
		t.Fatalf("expected ErrDefaultProjectIDRequired, got %v", err)
	}
}

func projectChatWindowingStatePtr(state ProjectChatWindowingState) *ProjectChatWindowingState {
	return &state
}
