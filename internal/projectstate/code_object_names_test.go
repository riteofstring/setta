package projectstate

import "testing"

// Callable-style params should keep Python-identifier validation authoritative
// in projectstate so MCP can pass raw names through.
func TestProjectSetCodeObjectNameRejectsInvalidCallableParamFormat(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	err := project.SetCodeObjectName("callable-param", "invalid name")
	if !IsInvalidCodeObjectNameError(err) {
		t.Fatalf("expected InvalidCodeObjectNameError, got %v", err)
	}
	if err == nil || err.Error() != "Param name must be a valid Python identifier." {
		t.Fatalf("unexpected callable param name error: %v", err)
	}
}

// Python-backed param validation needs explicit coverage for the documented
// keyword, soft-keyword, path, and control-character cases the Python suite
// already treated as source-of-truth behavior.
func TestProjectSetCodeObjectNameRejectsDocumentedCallableParamEdgeCases(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		input       string
		expectedErr string
	}{
		{
			name:        "empty_after_trim",
			input:       "   ",
			expectedErr: "Param name cannot be empty.",
		},
		{
			name:        "python_keyword",
			input:       "class",
			expectedErr: "Param name cannot be a Python keyword.",
		},
		{
			name:        "python_soft_keyword",
			input:       "type",
			expectedErr: "Param name cannot be a Python keyword.",
		},
		{
			name:        "unicode_identifier",
			input:       "cafe\u0301",
			expectedErr: "Param name must be a valid Python identifier.",
		},
		{
			name:        "path_separator",
			input:       "bad/name",
			expectedErr: "Param name cannot include path separators.",
		},
		{
			name:        "dotdot_segment",
			input:       "bad..name",
			expectedErr: "Param name cannot include '..' path segments.",
		},
		{
			name:        "control_character",
			input:       "bad\nname",
			expectedErr: "Param name cannot include control characters.",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			project := codeObjectNameTestProject(t)
			err := project.SetCodeObjectName("callable-param", testCase.input)
			if !IsInvalidCodeObjectNameError(err) {
				t.Fatalf("expected InvalidCodeObjectNameError, got %v", err)
			}
			if err == nil || err.Error() != testCase.expectedErr {
				t.Fatalf("unexpected callable param name error: %v", err)
			}
		})
	}
}

// Duplicate sibling checks still matter for param-bearing sections, so a
// rename must reject a second child with the same parent-scoped name.
func TestProjectSetCodeObjectNameRejectsDuplicateSiblingName(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	err := project.SetCodeObjectName("shared-child", "other")
	if !IsInvalidCodeObjectNameError(err) {
		t.Fatalf("expected InvalidCodeObjectNameError, got %v", err)
	}
	if err == nil || err.Error() != `Param name "other" already exists under this parent.` {
		t.Fatalf("unexpected duplicate sibling error: %v", err)
	}
}

// Shared code objects should be renamed once through the canonical code-object
// core even when multiple active sections reference the same variant map.
func TestProjectSetCodeObjectNameUpdatesSharedParamAcrossSections(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.SetCodeObjectName("shared-child", "shared_param"); err != nil {
		t.Fatalf("set shared code object name: %v", err)
	}
	if got := project.CodeObjs["shared-child"].Name; got != "shared_param" {
		t.Fatalf("expected shared code object name shared_param, got %q", got)
	}
}

// Meta-control renames should stay format-only instead of inheriting duplicate
// hierarchy checks from param-bearing sections.
func TestProjectSetCodeObjectNameAllowsMetaControlFormatRename(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.SetCodeObjectName("meta-param", "control_name"); err != nil {
		t.Fatalf("set meta control code object name: %v", err)
	}
	if got := project.CodeObjs["meta-param"].Name; got != "control_name" {
		t.Fatalf("expected meta control code object name control_name, got %q", got)
	}
}

// Editable kwargs intentionally allow blank names so the UI can keep the
// placeholder editing state without forcing a generated param name.
func TestProjectSetCodeObjectNameAllowsEmptyEditableKwarg(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.SetCodeObjectName("editable-kwarg", "   "); err != nil {
		t.Fatalf("set editable kwarg code object name: %v", err)
	}
	if got := project.CodeObjs["editable-kwarg"].Name; got != "" {
		t.Fatalf("expected editable kwarg code object name to stay empty, got %q", got)
	}
}

// Dict root params also permit empty names because the dict namespace is
// explicit through the section structure rather than the param label itself.
func TestProjectSetCodeObjectNameAllowsEmptyDictRoot(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.SetCodeObjectName("shared-root", "   "); err != nil {
		t.Fatalf("set dict root code object name: %v", err)
	}
	if got := project.CodeObjs["shared-root"].Name; got != "" {
		t.Fatalf("expected dict root code object name to stay empty, got %q", got)
	}
}

func TestProjectNormalizedAllowsEmptyEditableKwargAndDictRootNames(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)

	if err := project.SetCodeObjectName("editable-kwarg", "   "); err != nil {
		t.Fatalf("set editable kwarg code object name: %v", err)
	}
	if err := project.SetCodeObjectName("shared-root", "   "); err != nil {
		t.Fatalf("set dict root code object name: %v", err)
	}

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project with empty editable kwarg and dict root names: %v", err)
	}
	if got := normalized.CodeObjs["editable-kwarg"].Name; got != "" {
		t.Fatalf("expected normalized editable kwarg name to stay empty, got %q", got)
	}
	if got := normalized.CodeObjs["shared-root"].Name; got != "" {
		t.Fatalf("expected normalized dict root name to stay empty, got %q", got)
	}
}

// Dict-backed params intentionally skip Python identifier and path-shape rules
// so JSON-like keys can round-trip without backend rewrites.
func TestProjectSetCodeObjectNameAllowsDocumentedDictParamFormats(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name  string
		input string
	}{
		{
			name:  "punctuation",
			input: "user-id@v2",
		},
		{
			name:  "path_like_key",
			input: "foo/bar..baz",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			project := codeObjectNameTestProject(t)
			if err := project.SetCodeObjectName("shared-child", testCase.input); err != nil {
				t.Fatalf("set dict param code object name: %v", err)
			}
			if got := project.CodeObjs["shared-child"].Name; got != testCase.input {
				t.Fatalf("expected dict param code object name %q, got %q", testCase.input, got)
			}
		})
	}
}

// Even dict-like params still reject control characters because those are not
// valid names anywhere in the backend.
func TestProjectSetCodeObjectNameRejectsDictParamControlCharacters(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	err := project.SetCodeObjectName("shared-child", "bad\nname")
	if !IsInvalidCodeObjectNameError(err) {
		t.Fatalf("expected InvalidCodeObjectNameError, got %v", err)
	}
	if err == nil || err.Error() != "Param name cannot include control characters." {
		t.Fatalf("unexpected dict param control-character error: %v", err)
	}
}

func codeObjectNameTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{Language: "python"},
		},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant",
			"dict-a":           "dict-a-variant",
			"dict-b":           "dict-b-variant",
			"meta-section":     "meta-variant",
		},
		Sections: map[string]Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
			},
			"dict-a": {
				ID:               "dict-a",
				Name:             "Dict A",
				VariantIDs:       []string{"dict-a-variant"},
				DefaultVariantID: "dict-a-variant",
			},
			"dict-b": {
				ID:               "dict-b",
				Name:             "Dict B",
				VariantIDs:       []string{"dict-b-variant"},
				DefaultVariantID: "dict-b-variant",
			},
			"meta-section": {
				ID:               "meta-section",
				Name:             "Meta",
				VariantIDs:       []string{"meta-variant"},
				DefaultVariantID: "meta-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"callable-variant": {ID: "callable-variant", ImplID: "callable-impl"},
			"dict-a-variant":   {ID: "dict-a-variant", ImplID: "dict-a-impl"},
			"dict-b-variant":   {ID: "dict-b-variant", ImplID: "dict-b-impl"},
			"meta-variant":     {ID: "meta-variant", ImplID: "meta-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"callable-impl": {
				ID:      "callable-impl",
				Kind:    SectionKind("callable"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "callable-impl", "type": "Callable", "callable": "callable-root", "codeObjVariantMap": map[string]string{"callable-root": "callable-root-variant", "callable-param": "callable-param-variant", "editable-kwarg": "editable-kwarg-variant"}}),
			},
			"dict-a-impl": {
				ID:      "dict-a-impl",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "dict-a-impl", "type": "Dict", "topLevelParamId": "shared-root", "codeObjVariantMap": map[string]string{"shared-root": "shared-root-variant", "shared-child": "shared-child-variant", "shared-other": "shared-other-variant"}}),
			},
			"dict-b-impl": {
				ID:      "dict-b-impl",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "dict-b-impl", "type": "Dict", "topLevelParamId": "shared-root", "codeObjVariantMap": map[string]string{"shared-root": "shared-root-variant", "shared-child": "shared-child-variant", "shared-other": "shared-other-variant"}}),
			},
			"meta-impl": {
				ID:      "meta-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "meta-impl", "type": "MetaControl", "metaControlParamId": "meta-param", "codeObjVariantMap": map[string]string{"meta-param": "meta-param-variant"}}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"callable-root": {
				ID:               "callable-root",
				Name:             "callable_root",
				VariantIDs:       []string{"callable-root-variant"},
				DefaultVariantID: "callable-root-variant",
			},
			"callable-param": {
				ID:               "callable-param",
				Name:             "callable_param",
				VariantIDs:       []string{"callable-param-variant"},
				DefaultVariantID: "callable-param-variant",
			},
			"editable-kwarg": {
				ID:               "editable-kwarg",
				Name:             "editable_kwarg",
				VariantIDs:       []string{"editable-kwarg-variant"},
				DefaultVariantID: "editable-kwarg-variant",
			},
			"shared-root": {
				ID:               "shared-root",
				Name:             "shared_root",
				VariantIDs:       []string{"shared-root-variant"},
				DefaultVariantID: "shared-root-variant",
			},
			"shared-child": {
				ID:               "shared-child",
				Name:             "shared_child",
				VariantIDs:       []string{"shared-child-variant"},
				DefaultVariantID: "shared-child-variant",
			},
			"shared-other": {
				ID:               "shared-other",
				Name:             "other",
				VariantIDs:       []string{"shared-other-variant"},
				DefaultVariantID: "shared-other-variant",
			},
			"meta-param": {
				ID:               "meta-param",
				Name:             "meta_param",
				VariantIDs:       []string{"meta-param-variant"},
				DefaultVariantID: "meta-param-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"callable-root-variant":  {ID: "callable-root-variant", ImplID: "callable-root-impl"},
			"callable-param-variant": {ID: "callable-param-variant", ImplID: "callable-param-impl"},
			"editable-kwarg-variant": {ID: "editable-kwarg-variant", ImplID: "editable-kwarg-impl"},
			"shared-root-variant":    {ID: "shared-root-variant", ImplID: "shared-root-impl"},
			"shared-child-variant":   {ID: "shared-child-variant", ImplID: "shared-child-impl"},
			"shared-other-variant":   {ID: "shared-other-variant", ImplID: "shared-other-impl"},
			"meta-param-variant":     {ID: "meta-param-variant", ImplID: "meta-param-impl"},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"callable-root-impl": {
				ID:      "callable-root-impl",
				Type:    "CodeCallable",
				Payload: mustMarshalProjectObject(map[string]any{"id": "callable-root-impl", "type": "CodeCallable", "children": []string{"callable-param", "editable-kwarg"}}),
			},
			"callable-param-impl": {
				ID:      "callable-param-impl",
				Type:    "CodeParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "callable-param-impl", "type": "CodeParam", "coreNameEditable": false, "passingStyle": "DEFAULT", "value": "seed"}),
			},
			"editable-kwarg-impl": {
				ID:      "editable-kwarg-impl",
				Type:    "CodeParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "editable-kwarg-impl", "type": "CodeParam", "coreNameEditable": true, "passingStyle": "KWARG", "value": "seed"}),
			},
			"shared-root-impl": {
				ID:      "shared-root-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "shared-root-impl", "type": "NestedParam", "children": []string{"shared-child", "shared-other"}}),
			},
			"shared-child-impl": {
				ID:      "shared-child-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "shared-child-impl", "type": "TextParam", "value": "1"}),
			},
			"shared-other-impl": {
				ID:      "shared-other-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "shared-other-impl", "type": "TextParam", "value": "2"}),
			},
			"meta-param-impl": {
				ID:      "meta-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "meta-param-impl", "type": "TextParam", "value": "3"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize code object name test project: %v", err)
	}
	return project
}
