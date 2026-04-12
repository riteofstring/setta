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
	if !impl.Code.Binding.AutoBinding {
		t.Fatal("expected reconciled runner binding to be marked auto")
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
	if impl.Code.Binding.AutoBinding {
		t.Fatal("expected explicit runner binding to remain manual")
	}
}

func TestProjectNormalizedCopiesPayloadOnlyPythonCodeBindingIntoImpl(t *testing.T) {
	t.Parallel()

	project := testPythonCodeBindingProject()
	project.SectionImpls["runner-impl"] = SectionImpl{
		ID:   "runner-impl",
		Kind: SectionKindCode,
		Code: &CodeSectionImpl{
			Language: CodeLanguagePython,
		},
		Payload: mustRawJSONForBindings(t, map[string]any{
			"id":           "runner-impl",
			"type":         "Code",
			"code":         "print('runner')\n",
			"codeLanguage": "python",
			"children":     []string{},
			"codeFileBinding": map[string]any{
				"canonical_path": "code/from_payload.py",
				"access_mode":    "read_only",
				"autoBinding":    false,
			},
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
		t.Fatal("expected payload binding to populate impl state")
	}
	if got := impl.Code.Binding.Path; got != "code/from_payload.py" {
		t.Fatalf("unexpected payload binding path %q", got)
	}
	if got := impl.Code.Binding.AccessMode; got != CodeFileAccessModeReadOnly {
		t.Fatalf("unexpected payload binding access mode %q", got)
	}
	if impl.Code.Binding.AutoBinding {
		t.Fatal("expected payload binding to remain manual")
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

func TestActiveSectionPathFullNameUsesImmediateParentForNestedListRoot(t *testing.T) {
	t.Parallel()

	project := testNestedListRootPathProject(t)

	fullName, err := activeSectionPathFullName(project, "list")
	if err != nil {
		t.Fatalf("activeSectionPathFullName(list): %v", err)
	}
	if fullName != `Parent["Child"][0]` {
		t.Fatalf("expected nested list-root path %q, got %q", `Parent["Child"][0]`, fullName)
	}
}

func TestActiveSectionPathFullNameUsesListRootIndexForChildren(t *testing.T) {
	t.Parallel()

	project := testNestedListRootPathProject(t)

	fullName, err := activeSectionPathFullName(project, "leaf")
	if err != nil {
		t.Fatalf("activeSectionPathFullName(leaf): %v", err)
	}
	if fullName != `Parent["Child"][0]["Leaf"]` {
		t.Fatalf("expected list-root child path %q, got %q", `Parent["Child"][0]["Leaf"]`, fullName)
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

func TestProjectNormalizedClearsConflictingPayloadOnlyAutoBindings(t *testing.T) {
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
					"codeFileBinding": map[string]any{
						"canonical_path": "code/sections/demo_project/foo_bar.py",
						"access_mode":    "read_write",
						"autoBinding":    true,
					},
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
					"codeFileBinding": map[string]any{
						"canonical_path": "code/sections/demo_project/foo_bar.py",
						"access_mode":    "read_write",
						"autoBinding":    true,
					},
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
			t.Fatalf("expected conflicting payload auto binding to clear for %s, got %#v", sectionID, impl.Code.Binding)
		}

		payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(impl))
		if err != nil {
			t.Fatalf("payload for %s: %v", sectionID, err)
		}
		if binding, ok := payload["codeFileBinding"]; ok && binding != nil {
			t.Fatalf("expected payload auto binding to be removed for %s, got %#v", sectionID, binding)
		}
	}
}

func TestProjectMoveSectionsClearsConflictingAutoBindingsAfterNormalization(t *testing.T) {
	t.Parallel()

	project, err := testMoveConflictCodeBindingProject(t).Normalized()
	if err != nil {
		t.Fatalf("normalize initial project: %v", err)
	}

	for _, sectionID := range []string{"child-a", "child-b"} {
		_, _, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			t.Fatalf("resolve %s before move: %v", sectionID, err)
		}
		if impl.Code == nil || impl.Code.Binding == nil {
			t.Fatalf("expected auto binding for %s before move", sectionID)
		}
		if !impl.Code.Binding.AutoBinding {
			t.Fatalf("expected %s binding to be marked auto before move", sectionID)
		}
	}

	newParentID := "parent-a"
	newIndex := 1
	if err := project.MoveSections(
		MoveSectionsInput{
			SectionIDs:  []string{"child-b"},
			NewParentID: &newParentID,
			NewIndex:    &newIndex,
		},
		AutoLayoutSectionSizingPolicy{},
		0,
	); err != nil {
		t.Fatalf("move child-b into parent-a: %v", err)
	}

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize moved project: %v", err)
	}

	for _, sectionID := range []string{"child-a", "child-b"} {
		_, _, impl, err := normalized.ResolveSection(sectionID)
		if err != nil {
			t.Fatalf("resolve %s after move: %v", sectionID, err)
		}
		if impl.Code == nil {
			t.Fatalf("expected code impl for %s after move", sectionID)
		}
		if impl.Code.Binding != nil {
			t.Fatalf("expected conflicting auto binding to clear for %s, got %#v", sectionID, impl.Code.Binding)
		}
	}
}

func TestProjectMoveSectionsPreservesManualBindingWhenConflictCreated(t *testing.T) {
	t.Parallel()

	project, err := testMoveConflictCodeBindingProject(t).Normalized()
	if err != nil {
		t.Fatalf("normalize initial project: %v", err)
	}

	if err := project.SetCodeFileBinding("child-b", CodeFileBinding{
		Path:       "custom/manual_binding.py",
		AccessMode: CodeFileAccessModeReadWrite,
	}); err != nil {
		t.Fatalf("set manual binding: %v", err)
	}

	newParentID := "parent-a"
	newIndex := 1
	if err := project.MoveSections(
		MoveSectionsInput{
			SectionIDs:  []string{"child-b"},
			NewParentID: &newParentID,
			NewIndex:    &newIndex,
		},
		AutoLayoutSectionSizingPolicy{},
		0,
	); err != nil {
		t.Fatalf("move child-b into parent-a: %v", err)
	}

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize moved project: %v", err)
	}

	_, _, childAImpl, err := normalized.ResolveSection("child-a")
	if err != nil {
		t.Fatalf("resolve child-a after move: %v", err)
	}
	if childAImpl.Code == nil {
		t.Fatal("expected code impl for child-a after move")
	}
	if childAImpl.Code.Binding != nil {
		t.Fatalf("expected conflicting auto binding to clear for child-a, got %#v", childAImpl.Code.Binding)
	}

	_, _, childBImpl, err := normalized.ResolveSection("child-b")
	if err != nil {
		t.Fatalf("resolve child-b after move: %v", err)
	}
	if childBImpl.Code == nil || childBImpl.Code.Binding == nil {
		t.Fatal("expected manual binding for child-b after move")
	}
	if childBImpl.Code.Binding.Path != "custom/manual_binding.py" {
		t.Fatalf("unexpected preserved manual binding path %q", childBImpl.Code.Binding.Path)
	}
	if childBImpl.Code.Binding.AutoBinding {
		t.Fatal("expected preserved child-b binding to remain manual")
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

func testNestedListRootPathProject(t *testing.T) Project {
	t.Helper()

	return Project{
		ID:   "project-alpha",
		Name: "Demo Project",
		SectionVariantMap: map[string]string{
			"parent": "parent-variant",
			"child":  "child-variant",
			"list":   "list-variant",
			"leaf":   "leaf-variant",
		},
		Sections: map[string]Section{
			"parent": {
				ID:               "parent",
				Name:             "Parent",
				VariantIDs:       []string{"parent-variant"},
				DefaultVariantID: "parent-variant",
			},
			"child": {
				ID:               "child",
				Name:             "Child",
				ParentSectionID:  "parent",
				VariantIDs:       []string{"child-variant"},
				DefaultVariantID: "child-variant",
			},
			"list": {
				ID:               "list",
				Name:             "Items",
				ParentSectionID:  "child",
				VariantIDs:       []string{"list-variant"},
				DefaultVariantID: "list-variant",
			},
			"leaf": {
				ID:               "leaf",
				Name:             "Leaf",
				ParentSectionID:  "list",
				VariantIDs:       []string{"leaf-variant"},
				DefaultVariantID: "leaf-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"parent-variant": {ID: "parent-variant", ImplID: "parent-impl"},
			"child-variant":  {ID: "child-variant", ImplID: "child-impl"},
			"list-variant":   {ID: "list-variant", ImplID: "list-impl"},
			"leaf-variant":   {ID: "leaf-variant", ImplID: "leaf-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"parent-impl": {
				ID:      "parent-impl",
				Kind:    SectionKind("group"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "parent-impl", "type": "Group", "children": []string{"child"}}),
			},
			"child-impl": {
				ID:      "child-impl",
				Kind:    SectionKind("group"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "child-impl", "type": "Group", "children": []string{"list"}}),
			},
			"list-impl": {
				ID:      "list-impl",
				Kind:    SectionKind("list_root"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "list-impl", "type": "ListRoot", "children": []string{"leaf"}}),
			},
			"leaf-impl": {
				ID:      "leaf-impl",
				Kind:    SectionKindCode,
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "leaf-impl", "type": "Code", "codeLanguage": "python", "children": []string{}}),
			},
		},
	}
}

func testMoveConflictCodeBindingProject(t *testing.T) Project {
	t.Helper()

	return Project{
		ID:   "project-alpha",
		Name: "Demo Project",
		SectionVariantMap: map[string]string{
			"parent-a": "parent-a-variant",
			"parent-b": "parent-b-variant",
			"child-a":  "child-a-variant",
			"child-b":  "child-b-variant",
		},
		Sections: map[string]Section{
			"parent-a": {
				ID:               "parent-a",
				Name:             "Group A",
				VariantIDs:       []string{"parent-a-variant"},
				DefaultVariantID: "parent-a-variant",
			},
			"parent-b": {
				ID:               "parent-b",
				Name:             "Group B",
				VariantIDs:       []string{"parent-b-variant"},
				DefaultVariantID: "parent-b-variant",
			},
			"child-a": {
				ID:               "child-a",
				Name:             "Foo Bar",
				ParentSectionID:  "parent-a",
				VariantIDs:       []string{"child-a-variant"},
				DefaultVariantID: "child-a-variant",
			},
			"child-b": {
				ID:               "child-b",
				Name:             "Foo Bar",
				ParentSectionID:  "parent-b",
				VariantIDs:       []string{"child-b-variant"},
				DefaultVariantID: "child-b-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"parent-a-variant": {ID: "parent-a-variant", ImplID: "parent-a-impl"},
			"parent-b-variant": {ID: "parent-b-variant", ImplID: "parent-b-impl"},
			"child-a-variant":  {ID: "child-a-variant", ImplID: "child-a-impl"},
			"child-b-variant":  {ID: "child-b-variant", ImplID: "child-b-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"parent-a-impl": {
				ID:      "parent-a-impl",
				Kind:    SectionKind("group"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "parent-a-impl", "type": "Group", "children": []string{"child-a"}}),
			},
			"parent-b-impl": {
				ID:      "parent-b-impl",
				Kind:    SectionKind("group"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "parent-b-impl", "type": "Group", "children": []string{"child-b"}}),
			},
			"child-a-impl": {
				ID:   "child-a-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{Language: CodeLanguagePython},
				Payload: mustRawJSONForBindings(t, map[string]any{
					"id":           "child-a-impl",
					"type":         "Code",
					"codeLanguage": "python",
					"children":     []string{},
				}),
			},
			"child-b-impl": {
				ID:   "child-b-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{Language: CodeLanguagePython},
				Payload: mustRawJSONForBindings(t, map[string]any{
					"id":           "child-b-impl",
					"type":         "Code",
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
