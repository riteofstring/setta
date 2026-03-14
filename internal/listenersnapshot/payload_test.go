package listenersnapshot

import (
	"context"
	"testing"

	"setta/internal/codegen"
	"setta/internal/projectstate"
	"setta/internal/realtime"
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

func TestBuildListenerDependencyCatalogFromGraphIncludesValueCodecMetadata(t *testing.T) {
	t.Parallel()

	sectionKey := codegen.PythonSectionDependencyKey("section-meta")
	paramKey := codegen.PythonCodeObjectDependencyKey("section-controls", "param-dropzone")
	graph := &codegen.PythonDependencyGraph{
		Nodes: map[codegen.PythonDependencyKey]codegen.PythonDependencyNode{
			sectionKey: &codegen.PythonSectionNode{
				PythonDependencyNodeBase: codegen.PythonDependencyNodeBase{
					Name:         "meta",
					FullPathName: "section__meta",
					Deps: map[codegen.PythonDependencyKey]bool{
						paramKey: true,
					},
					DepOrder: []codegen.PythonDependencyKey{paramKey},
				},
				SectionType:                "MetaControl",
				Representation:             projectstate.PythonSectionRepresentationFilePath,
				ControlCodeObjID:           "param-toggle",
				ControlCodeObjType:         "SwitchParam",
				ControlValueRepresentation: projectstate.PythonCodeObjValueRepresentationExpression,
			},
			paramKey: &codegen.PythonParamNode{
				PythonDependencyNodeBase: codegen.PythonDependencyNodeBase{
					Name:         "dropzone",
					FullPathName: "section__dropzone",
				},
				CodeObjectType:      "DropzoneParam",
				ValueRepresentation: projectstate.PythonCodeObjValueRepresentationFileRead,
			},
		},
		NodeOrder: []codegen.PythonDependencyKey{sectionKey, paramKey},
	}

	catalog := buildListenerDependencyCatalogFromGraph(graph)
	if catalog == nil {
		t.Fatal("expected listener dependency catalog")
	}
	if len(catalog.Entries) != 2 {
		t.Fatalf("expected 2 catalog entries, got %d", len(catalog.Entries))
	}

	byKey := map[string]realtime.ListenerDependencyCatalogEntry{}
	for _, entry := range catalog.Entries {
		byKey[entry.DependencyKey] = entry
	}

	sectionEntry, ok := byKey["section-meta"]
	if !ok {
		t.Fatal("expected section entry in listener dependency catalog")
	}
	if sectionEntry.SectionType != "MetaControl" {
		t.Fatalf("expected section type MetaControl, got %q", sectionEntry.SectionType)
	}
	if sectionEntry.Name != "meta" {
		t.Fatalf("expected section entry name meta, got %q", sectionEntry.Name)
	}
	if len(sectionEntry.Dependencies) != 1 || sectionEntry.Dependencies[0] != "section-controls.param-dropzone" {
		t.Fatalf("expected section dependencies [section-controls.param-dropzone], got %#v", sectionEntry.Dependencies)
	}
	if sectionEntry.ControlCodeObjID != "param-toggle" {
		t.Fatalf("expected control code obj id param-toggle, got %q", sectionEntry.ControlCodeObjID)
	}
	if sectionEntry.ControlCodeObjType != "SwitchParam" {
		t.Fatalf("expected control code obj type SwitchParam, got %q", sectionEntry.ControlCodeObjType)
	}
	if sectionEntry.SectionRepresentation != "file_path" {
		t.Fatalf("expected section representation file_path, got %q", sectionEntry.SectionRepresentation)
	}
	if sectionEntry.ControlValueRepresentation != "expression" {
		t.Fatalf("expected control value representation expression, got %q", sectionEntry.ControlValueRepresentation)
	}

	paramEntry, ok := byKey["section-controls.param-dropzone"]
	if !ok {
		t.Fatal("expected param entry in listener dependency catalog")
	}
	if paramEntry.CodeObjType != "DropzoneParam" {
		t.Fatalf("expected code obj type DropzoneParam, got %q", paramEntry.CodeObjType)
	}
	if paramEntry.Name != "dropzone" {
		t.Fatalf("expected param entry name dropzone, got %q", paramEntry.Name)
	}
	if paramEntry.ValueRepresentation != "file_read" {
		t.Fatalf("expected value representation file_read, got %q", paramEntry.ValueRepresentation)
	}
}
