package projectstate

import (
	"reflect"
	"testing"
)

func TestDocumentProjectConfigMetadataSortsDeterministically(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-b",
		Projects: map[string]Project{
			"project-b": {
				ID:   "project-b",
				Name: "beta",
			},
			"project-a": {
				ID:   "project-a",
				Name: "Alpha",
			},
			"project-c": {
				ID:   "project-c",
				Name: "alpha",
			},
		},
	}

	metadata := document.ProjectConfigMetadata()
	expected := []ProjectConfigMetadata{
		{Name: "Alpha", ID: "project-a"},
		{Name: "alpha", ID: "project-c"},
		{Name: "beta", ID: "project-b"},
	}
	if !reflect.DeepEqual(metadata, expected) {
		t.Fatalf("unexpected project metadata order %#v", metadata)
	}
}
