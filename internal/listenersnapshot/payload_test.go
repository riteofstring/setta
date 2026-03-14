package listenersnapshot

import (
	"context"
	"testing"

	"setta/internal/projectstate"
)

func TestBuildListenerSnapshotPayloadIncludesRenderedDependencyValues(t *testing.T) {
	t.Parallel()

	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-a",
		Projects: map[string]projectstate.Project{
			"project-a": {
				ID:   "project-a",
				Name: "Project A",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	name := "note"
	_, created, err := runtime.CreateTopLevelSection(
		context.Background(),
		"project-a",
		projectstate.CreateTopLevelSectionInput{
			ImplType: "TextBlock",
			Name:     &name,
		},
		projectstate.StructuralMutationSettings{},
	)
	if err != nil {
		t.Fatalf("create top-level section: %v", err)
	}
	if _, err := runtime.SetTextBlockText(context.Background(), "project-a", created.SectionID, "Hello from snapshot"); err != nil {
		t.Fatalf("set text block text: %v", err)
	}

	payload, err := BuildListenerSnapshotPayload(runtime.Snapshot().Document, "project-a")
	if err != nil {
		t.Fatalf("build listener snapshot payload: %v", err)
	}
	if payload.DependencyValues == nil {
		t.Fatal("expected dependency values in listener snapshot payload")
	}

	for _, entry := range payload.DependencyValues.Entries {
		if entry.DependencyKey != created.SectionID {
			continue
		}
		if entry.RenderedValue != "'Hello from snapshot'" {
			t.Fatalf("expected rendered dependency value %q, got %q", "'Hello from snapshot'", entry.RenderedValue)
		}
		return
	}

	t.Fatalf("expected dependency values to include section %q", created.SectionID)
}
