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

func TestBuildListenerRenderedDependencyValuesFromGraphUsesPasswordSecretLiterals(t *testing.T) {
	t.Parallel()

	paramKey := codegen.PythonCodeObjectDependencyKey("section-controls", "param-secret")
	metaKey := codegen.PythonSectionDependencyKey("section-meta")
	graph := &codegen.PythonDependencyGraph{
		Nodes: map[codegen.PythonDependencyKey]codegen.PythonDependencyNode{
			paramKey: &codegen.PythonParamNode{
				PythonDependencyNodeBase: codegen.PythonDependencyNodeBase{
					Name:             "secret",
					FullPathName:     "section__secret",
					IncludeInCodegen: true,
				},
				CodeObjectType:   "PasswordParam",
				CodeObjectImplID: "param-secret-impl",
				HasSecret:        true,
			},
			metaKey: &codegen.PythonSectionNode{
				PythonDependencyNodeBase: codegen.PythonDependencyNodeBase{
					Name:             "meta",
					FullPathName:     "section__meta",
					IncludeInCodegen: true,
				},
				SectionType:          "MetaControl",
				ControlCodeObjType:   "PasswordParam",
				ControlCodeObjImplID: "meta-secret-impl",
			},
		},
		NodeOrder: []codegen.PythonDependencyKey{paramKey, metaKey},
		PasswordSecrets: map[string]string{
			"param-secret-impl": "top-secret",
			"meta-secret-impl":  "toggle-secret",
		},
	}

	values := buildListenerRenderedDependencyValuesFromGraph(graph)
	if values == nil {
		t.Fatal("expected listener dependency values")
	}
	if len(values.Entries) != 2 {
		t.Fatalf("expected 2 rendered dependency values, got %d", len(values.Entries))
	}

	byKey := map[string]realtime.ListenerRenderedDependencyValue{}
	for _, entry := range values.Entries {
		byKey[entry.DependencyKey] = entry
	}

	if got := byKey["section-controls.param-secret"].RenderedValue; got != "\"top-secret\"" {
		t.Fatalf("expected password literal %q, got %q", "\"top-secret\"", got)
	}
	if got := byKey["section-meta"].RenderedValue; got != "\"toggle-secret\"" {
		t.Fatalf("expected meta-control password literal %q, got %q", "\"toggle-secret\"", got)
	}
}

func TestBuildListenerRenderedDependencyValuesFromGraphSkipsCycles(t *testing.T) {
	t.Parallel()

	firstKey := codegen.PythonSectionDependencyKey("section-a")
	secondKey := codegen.PythonSectionDependencyKey("section-b")
	graph := &codegen.PythonDependencyGraph{
		Nodes: map[codegen.PythonDependencyKey]codegen.PythonDependencyNode{
			firstKey: &codegen.PythonSectionNode{
				PythonDependencyNodeBase: codegen.PythonDependencyNodeBase{
					Name:             "first",
					FullPathName:     "section__first",
					IncludeInCodegen: true,
					Deps: map[codegen.PythonDependencyKey]bool{
						secondKey: true,
					},
					DepOrder: []codegen.PythonDependencyKey{secondKey},
				},
				SectionType: "Dict",
			},
			secondKey: &codegen.PythonSectionNode{
				PythonDependencyNodeBase: codegen.PythonDependencyNodeBase{
					Name:             "second",
					FullPathName:     "section__second",
					IncludeInCodegen: true,
					Deps: map[codegen.PythonDependencyKey]bool{
						firstKey: true,
					},
					DepOrder: []codegen.PythonDependencyKey{firstKey},
				},
				SectionType: "Dict",
			},
		},
		NodeOrder: []codegen.PythonDependencyKey{firstKey, secondKey},
	}

	values := buildListenerRenderedDependencyValuesFromGraph(graph)
	if values == nil {
		t.Fatal("expected listener dependency values")
	}
	if len(values.Entries) != 0 {
		t.Fatalf("expected cyclic dependency values to be skipped, got %#v", values.Entries)
	}
}
