package projectstate

import (
	"path/filepath"
	"reflect"
	"testing"
)

// External file reloads must update the bound section payload even when the
// binding is read-only because the source of truth for this path is the file on
// disk, not a user-initiated in-app edit.
func TestProjectSetBoundCodeSectionContentUpdatesReadOnlyBinding(t *testing.T) {
	t.Parallel()

	project := codeUpdateTestProject(t, CodeFileAccessModeReadOnly)
	didUpdate, err := project.SetBoundCodeSectionContent("section-main", "print('external')\n")
	if err != nil {
		t.Fatalf("set bound code section content: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected bound code section content update")
	}

	payload, err := effectiveSectionPayload(project, "section-main", "variant-main")
	if err != nil {
		t.Fatalf("effective section payload: %v", err)
	}
	if got := payloadRawStringField(payload, "code"); got != "print('external')\n" {
		t.Fatalf("expected updated code payload, got %q", got)
	}
}

// The bound code-file runtime should derive one deterministic path->binding map
// from the saved document so app wiring can resync the watcher after each save.
func TestPythonBoundCodeFileInputsCollectsActivePythonBindings(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()

	first := codeUpdateTestProject(t, CodeFileAccessModeReadWrite)
	first.ID = "project-alpha"
	second := codeUpdateTestProject(t, CodeFileAccessModeReadWrite)
	second.ID = "project-beta"

	inputs, err := PythonBoundCodeFileInputs(Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects: map[string]Project{
			first.ID:  first,
			second.ID: second,
		},
	}, workspaceRoot)
	if err != nil {
		t.Fatalf("python bound code file inputs: %v", err)
	}

	expected := []BoundCodeFileInput{
		{
			Path: filepath.Join(workspaceRoot, "pkg", "bound.py"),
			Bindings: []BoundCodeFileBinding{
				{ProjectID: "project-alpha", SectionID: "section-main"},
				{ProjectID: "project-beta", SectionID: "section-main"},
			},
		},
	}
	if !reflect.DeepEqual(inputs, expected) {
		t.Fatalf("expected bound code file inputs %#v, got %#v", expected, inputs)
	}
}
