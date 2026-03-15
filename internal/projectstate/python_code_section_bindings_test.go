package projectstate

import (
	"encoding/json"
	"path"
	"testing"
)

// Missing active Python code bindings should normalize to the canonical
// project sections root so later LSP projection has a stable file path.
func TestProjectNormalizedReconcilesMissingPythonCodeBinding(t *testing.T) {
	t.Parallel()

	project, err := testPythonCodeBindingProject().Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	_, _, impl, err := project.ResolveSection("runner")
	if err != nil {
		t.Fatalf("resolve runner: %v", err)
	}
	if impl.Code == nil || impl.Code.Binding == nil {
		t.Fatal("expected runner code binding to be reconciled")
	}
	if got := impl.Code.Binding.Path; got != "code/sections/demo_project/runner.py" {
		t.Fatalf("unexpected runner binding path %q", got)
	}
	if got := impl.Code.Binding.AccessMode; got != CodeFileAccessModeReadWrite {
		t.Fatalf("unexpected runner binding access mode %q", got)
	}
}

// Existing bindings stay authoritative; the canonical reconciliation should
// fill gaps, not overwrite explicit project state.
func TestProjectNormalizedPreservesExistingPythonCodeBinding(t *testing.T) {
	t.Parallel()

	project := testPythonCodeBindingProject()
	project.SectionImpls["runner-impl"] = SectionImpl{
		ID:   "runner-impl",
		Kind: SectionKindCode,
		Code: &CodeSectionImpl{
			Language: CodeLanguagePython,
			Binding: &CodeFileBinding{
				Path:       "code/custom_runner.py",
				AccessMode: CodeFileAccessModeReadWrite,
			},
		},
		Payload: mustRawJSONForBindings(t, map[string]any{
			"id":           "runner-impl",
			"type":         "Code",
			"code":         "print('runner')\n",
			"codeLanguage": "python",
			"children":     []string{},
		}),
	}

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	_, _, impl, err := normalized.ResolveSection("runner")
	if err != nil {
		t.Fatalf("resolve runner: %v", err)
	}
	if impl.Code == nil || impl.Code.Binding == nil {
		t.Fatal("expected runner code binding to remain set")
	}
	if got := impl.Code.Binding.Path; got != "code/custom_runner.py" {
		t.Fatalf("unexpected preserved binding path %q", got)
	}
}

// Nested list-root paths need the Python-style `[index]` segment so the
// canonical file layout stays deterministic for nested code sections.
func TestProjectNormalizedUsesNestedListRootPathForPythonCodeBinding(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: "Demo Project",
		SectionVariantMap: map[string]string{
			"group":  "group-variant",
			"list":   "list-variant",
			"runner": "runner-variant",
		},
		Sections: map[string]Section{
			"group": {
				ID:               "group",
				Name:             "Root",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"list": {
				ID:               "list",
				Name:             "Items",
				ParentSectionID:  "group",
				VariantIDs:       []string{"list-variant"},
				DefaultVariantID: "list-variant",
			},
			"runner": {
				ID:               "runner",
				Name:             "Runner",
				ParentSectionID:  "list",
				VariantIDs:       []string{"runner-variant"},
				DefaultVariantID: "runner-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"group-variant":  {ID: "group-variant", ImplID: "group-impl"},
			"list-variant":   {ID: "list-variant", ImplID: "list-impl"},
			"runner-variant": {ID: "runner-variant", ImplID: "runner-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"group-impl": {
				ID:      "group-impl",
				Kind:    SectionKind("group"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "group-impl", "type": "Group", "children": []string{"list"}}),
			},
			"list-impl": {
				ID:      "list-impl",
				Kind:    SectionKind("list_root"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "list-impl", "type": "ListRoot", "children": []string{"runner"}}),
			},
			"runner-impl": {
				ID:   "runner-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{Language: CodeLanguagePython},
				Payload: mustRawJSONForBindings(t, map[string]any{
					"id":           "runner-impl",
					"type":         "Code",
					"code":         "print('runner')\n",
					"codeLanguage": "python",
					"children":     []string{},
				}),
			},
		},
	}

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	_, _, impl, err := normalized.ResolveSection("runner")
	if err != nil {
		t.Fatalf("resolve runner: %v", err)
	}
	if impl.Code == nil || impl.Code.Binding == nil {
		t.Fatal("expected nested runner binding to be reconciled")
	}
	expectedPath := path.Join("code", "sections", "demo_project", "root_0_runner.py")
	if impl.Code.Binding.Path != expectedPath {
		t.Fatalf("unexpected nested binding path %q", impl.Code.Binding.Path)
	}
}

// Sections that collide after slug sanitization should stay unbound rather than
// racing for the same canonical file path.
func TestProjectNormalizedLeavesConflictingPythonCodeBindingsUnset(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: "Demo Project",
		SectionVariantMap: map[string]string{
			"first":  "first-variant",
			"second": "second-variant",
		},
		Sections: map[string]Section{
			"first": {
				ID:               "first",
				Name:             "Foo Bar",
				VariantIDs:       []string{"first-variant"},
				DefaultVariantID: "first-variant",
			},
			"second": {
				ID:               "second",
				Name:             "foo_bar",
				VariantIDs:       []string{"second-variant"},
				DefaultVariantID: "second-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"first-variant":  {ID: "first-variant", ImplID: "first-impl"},
			"second-variant": {ID: "second-variant", ImplID: "second-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"first-impl": {
				ID:   "first-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{Language: CodeLanguagePython},
				Payload: mustRawJSONForBindings(t, map[string]any{
					"id":           "first-impl",
					"type":         "Code",
					"code":         "print('first')\n",
					"codeLanguage": "python",
					"children":     []string{},
				}),
			},
			"second-impl": {
				ID:   "second-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{Language: CodeLanguagePython},
				Payload: mustRawJSONForBindings(t, map[string]any{
					"id":           "second-impl",
					"type":         "Code",
					"code":         "print('second')\n",
					"codeLanguage": "python",
					"children":     []string{},
				}),
			},
		},
	}

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	for _, sectionID := range []string{"first", "second"} {
		_, _, impl, err := normalized.ResolveSection(sectionID)
		if err != nil {
			t.Fatalf("resolve %s: %v", sectionID, err)
		}
		if impl.Code == nil {
			t.Fatalf("expected code impl for %s", sectionID)
		}
		if impl.Code.Binding != nil {
			t.Fatalf("expected conflicting binding to stay unset for %s, got %#v", sectionID, impl.Code.Binding)
		}
	}
}

// File-backed Python sections without inline payload code should still surface
// their canonical bindings without claiming an empty inline source.
func TestProjectActivePythonCodeSectionFilesPreserveDiskBackedSource(t *testing.T) {
	t.Parallel()

	project := testPythonCodeBindingProject()
	project.SectionImpls["runner-impl"] = SectionImpl{
		ID:   "runner-impl",
		Kind: SectionKindCode,
		Code: &CodeSectionImpl{
			Language: CodeLanguagePython,
			Binding: &CodeFileBinding{
				Path:       "code/run.py",
				AccessMode: CodeFileAccessModeReadWrite,
			},
		},
	}

	files, err := project.ActivePythonCodeSectionFiles()
	if err != nil {
		t.Fatalf("active python code section files: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("expected one active python code file, got %d", len(files))
	}
	if files[0].Binding.Path != "code/run.py" {
		t.Fatalf("unexpected binding path %q", files[0].Binding.Path)
	}
	if files[0].HasInlineCode {
		t.Fatal("expected disk-backed code section to omit inline code")
	}
	if files[0].Code != "" {
		t.Fatalf("expected empty inline code for disk-backed section, got %q", files[0].Code)
	}
}

// Missing active non-Python code bindings should follow the same deterministic
// canonical sections layout, with the extension derived from codeLanguage.
func TestProjectNormalizedReconcilesMissingPluginCodeBinding(t *testing.T) {
	t.Parallel()

	project := testPythonCodeBindingProject()
	project.SectionImpls["runner-impl"] = SectionImpl{
		ID:   "runner-impl",
		Kind: SectionKindCode,
		Code: &CodeSectionImpl{
			Language: CodeLanguage("FixtureDSL"),
		},
		Payload: mustRawJSONForBindings(t, map[string]any{
			"id":           "runner-impl",
			"type":         "Code",
			"code":         "fixture.value()\n",
			"codeLanguage": "FixtureDSL",
			"children":     []string{},
		}),
	}

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	_, _, impl, err := normalized.ResolveSection("runner")
	if err != nil {
		t.Fatalf("resolve runner: %v", err)
	}
	if impl.Code == nil || impl.Code.Binding == nil {
		t.Fatal("expected plugin code binding to be reconciled")
	}
	if got := impl.Code.Language; got != CodeLanguage("fixturedsl") {
		t.Fatalf("expected normalized plugin language, got %q", got)
	}
	if got := impl.Code.Binding.Path; got != "code/sections/demo_project/runner.fixturedsl" {
		t.Fatalf("unexpected plugin binding path %q", got)
	}
}

func testPythonCodeBindingProject() Project {
	return Project{
		ID:   "project-alpha",
		Name: "Demo Project",
		SectionVariantMap: map[string]string{
			"runner": "runner-variant",
		},
		Sections: map[string]Section{
			"runner": {
				ID:               "runner",
				Name:             "Runner",
				VariantIDs:       []string{"runner-variant"},
				DefaultVariantID: "runner-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"runner-variant": {
				ID:     "runner-variant",
				ImplID: "runner-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"runner-impl": {
				ID:   "runner-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
				},
				Payload: mustRawJSONForBindings(nil, map[string]any{
					"id":           "runner-impl",
					"type":         "Code",
					"code":         "print('runner')\n",
					"codeLanguage": "python",
					"children":     []string{},
				}),
			},
		},
	}
}

func mustRawJSONForBindings(t *testing.T, value map[string]any) RawJSON {
	if t != nil {
		t.Helper()
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		if t != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		panic(err)
	}
	return RawJSON(encoded)
}
