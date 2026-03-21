package projectstate

import "testing"

// Section renames should normalize the submitted name once in projectstate so
// later transport can reuse the same mutation without route-local trimming.
func TestProjectSetSectionNameTrimsAndUpdatesSection(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)
	if err := project.SetSectionName("target", "  Renamed Section  "); err != nil {
		t.Fatalf("set section name: %v", err)
	}
	if got := project.Sections["target"].Name; got != "Renamed Section" {
		t.Fatalf("expected trimmed section name, got %q", got)
	}
}

// Format validation should stay authoritative in projectstate instead of
// letting invalid names through to later rename transport work.
func TestProjectSetSectionNameRejectsDocumentedFormatFailures(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name  string
		input string
	}{
		{
			name:  "path_separator",
			input: "bad/name",
		},
		{
			name:  "dotdot_segment",
			input: "bad..name",
		},
		{
			name:  "empty_after_trim",
			input: "   ",
		},
		{
			name:  "control_character",
			input: "bad\nname",
		},
		{
			name:  "leading_dot",
			input: ".dog",
		},
		{
			name:  "invalid_character",
			input: "bad#name",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			project := sectionNameTestProject(t)
			err := project.SetSectionName("target", testCase.input)
			if !IsInvalidSectionNameError(err) {
				t.Fatalf("expected InvalidSectionNameError, got %v", err)
			}
			if got := project.Sections["target"].Name; got != "Target" {
				t.Fatalf("expected rejected rename to keep Target, got %q", got)
			}
		})
	}
}

// Section names do not reserve route words, so valid names like Chat_ should
// still be accepted even though other namespaces reserve similar values.
func TestProjectSetSectionNameAllowsDocumentedValidNames(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)
	if err := project.SetSectionName("target", "Chat_"); err != nil {
		t.Fatalf("set section name Chat_: %v", err)
	}
	if got := project.Sections["target"].Name; got != "Chat_" {
		t.Fatalf("expected Chat_ section name, got %q", got)
	}
}

// Sibling names are still exact-parent scoped, so a rename should reject a
// duplicate under the same parent even when the rest of the project differs.
func TestProjectSetSectionNameRejectsDuplicateSiblingName(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)
	err := project.SetSectionName("child", "Sibling")
	if !IsInvalidSectionNameError(err) {
		t.Fatalf("expected InvalidSectionNameError, got %v", err)
	}
	if err == nil || err.Error() != `Section name "Sibling" already exists under this parent.` {
		t.Fatalf("unexpected duplicate sibling error: %v", err)
	}
}

// Top-level names that only differ before Python identifier sanitization should
// still conflict because generated Python state uses the sanitized name.
func TestProjectSetSectionNameRejectsTopLevelIdentifierConflict(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)
	err := project.SetSectionName("target", "Foo Bar")
	if !IsInvalidSectionNameError(err) {
		t.Fatalf("expected InvalidSectionNameError, got %v", err)
	}
	if err == nil || err.Error() != "Section name conflicts with another top-level name after Python identifier sanitization." {
		t.Fatalf("unexpected top-level identifier conflict error: %v", err)
	}
}

func TestProjectSetSectionNameRejectsTopLevelSlugCollisionCaseInsensitive(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)
	existing := project.Sections["existing"]
	existing.Name = "Foo"
	project.Sections["existing"] = existing

	err := project.SetSectionName("target", "foo")
	if !IsInvalidSectionNameError(err) {
		t.Fatalf("expected InvalidSectionNameError, got %v", err)
	}
	if err == nil || err.Error() != `Section path slug "foo" conflicts with another section.` {
		t.Fatalf("unexpected top-level slug conflict error: %v", err)
	}
}

// A parent rename can invalidate a descendant path slug, so validation needs to
// check full-path collisions rather than only the renamed section itself.
func TestProjectSetSectionNameRejectsDescendantSlugConflict(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)
	err := project.SetSectionName("group", "alpha")
	if !IsInvalidSectionNameError(err) {
		t.Fatalf("expected InvalidSectionNameError, got %v", err)
	}
	if err == nil || err.Error() != `Section path slug "alpha_beta" conflicts with another section.` {
		t.Fatalf("unexpected descendant slug conflict error: %v", err)
	}
}

func sectionNameTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"target":   "target-variant",
			"existing": "existing-variant",
			"group":    "group-variant",
			"child":    "child-variant",
			"sibling":  "sibling-variant",
			"blocker":  "blocker-variant",
		},
		Sections: map[string]Section{
			"target": {
				ID:               "target",
				Name:             "Target",
				VariantIDs:       []string{"target-variant"},
				DefaultVariantID: "target-variant",
			},
			"existing": {
				ID:               "existing",
				Name:             "Foo_Bar",
				VariantIDs:       []string{"existing-variant"},
				DefaultVariantID: "existing-variant",
			},
			"group": {
				ID:               "group",
				Name:             "Parent",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"child": {
				ID:               "child",
				Name:             "beta",
				ParentSectionID:  "group",
				VariantIDs:       []string{"child-variant"},
				DefaultVariantID: "child-variant",
			},
			"sibling": {
				ID:               "sibling",
				Name:             "Sibling",
				ParentSectionID:  "group",
				VariantIDs:       []string{"sibling-variant"},
				DefaultVariantID: "sibling-variant",
			},
			"blocker": {
				ID:               "blocker",
				Name:             "alpha beta",
				VariantIDs:       []string{"blocker-variant"},
				DefaultVariantID: "blocker-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"target-variant":   {ID: "target-variant", ImplID: "target-impl"},
			"existing-variant": {ID: "existing-variant", ImplID: "existing-impl"},
			"group-variant":    {ID: "group-variant", ImplID: "group-impl"},
			"child-variant":    {ID: "child-variant", ImplID: "child-impl"},
			"sibling-variant":  {ID: "sibling-variant", ImplID: "sibling-impl"},
			"blocker-variant":  {ID: "blocker-variant", ImplID: "blocker-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"target-impl": {
				ID:      "target-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "target-impl", "type": "TextBlock"}),
			},
			"existing-impl": {
				ID:      "existing-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "existing-impl", "type": "TextBlock"}),
			},
			"group-impl": {
				ID:      "group-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "group-impl", "type": "Group", "children": []string{"child", "sibling"}}),
			},
			"child-impl": {
				ID:      "child-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "child-impl", "type": "TextBlock"}),
			},
			"sibling-impl": {
				ID:      "sibling-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "sibling-impl", "type": "TextBlock"}),
			},
			"blocker-impl": {
				ID:      "blocker-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustRawJSONForBindings(t, map[string]any{"id": "blocker-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section name test project: %v", err)
	}

	return project
}
