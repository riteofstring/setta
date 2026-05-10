package projectstate

import (
	"context"
	"reflect"
	"testing"
)

func TestRuntimeGroupSectionsCreatesTopLevelGroupAndReparentsSelectedSections(t *testing.T) {
	t.Parallel()

	project := sectionStructureSelectionTestProject(t)
	originalSectionIDs := make(map[string]struct{}, len(project.Sections))
	for sectionID := range project.Sections {
		originalSectionIDs[sectionID] = struct{}{}
	}

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.GroupSections(
		context.Background(),
		"project-alpha",
		GroupSectionsInput{SectionIDs: []string{"beta-section", "alpha-section"}},
		DefaultStructuralMutationSettings(),
	); err != nil {
		t.Fatalf("GroupSections returned error: %v", err)
	}

	project = runtime.Snapshot().Document.Projects["project-alpha"]
	groupID := ""
	for sectionID := range project.Sections {
		if _, ok := originalSectionIDs[sectionID]; ok {
			continue
		}
		groupID = sectionID
		break
	}
	if groupID == "" {
		t.Fatal("expected GroupSections to create a new group section")
	}

	if got := project.Sections["alpha-section"].ParentSectionID; got != groupID {
		t.Fatalf("expected alpha-section parent %q, got %q", groupID, got)
	}
	if got := project.Sections["beta-section"].ParentSectionID; got != groupID {
		t.Fatalf("expected beta-section parent %q, got %q", groupID, got)
	}
	if _, ok := project.TopLevelSections["alpha-section"]; ok {
		t.Fatal("expected alpha-section to leave top-level layout state")
	}
	if _, ok := project.TopLevelSections["beta-section"]; ok {
		t.Fatal("expected beta-section to leave top-level layout state")
	}

	groupLayout, ok := project.TopLevelSections[groupID]
	if !ok {
		t.Fatalf("expected new group %q in top-level layouts", groupID)
	}
	if groupLayout.X != 20 || groupLayout.Y != 10 {
		t.Fatalf("expected grouped top-level layout to use min position (20,10), got %#v", groupLayout)
	}

	groupVariantID := project.SectionVariantMap[groupID]
	groupPayload, err := effectiveSectionPayload(project, groupID, groupVariantID)
	if err != nil {
		t.Fatalf("effectiveSectionPayload group: %v", err)
	}
	if got := payloadStringArrayField(groupPayload, "children"); !reflect.DeepEqual(got, []string{"alpha-section", "beta-section"}) {
		t.Fatalf("expected grouped children [alpha-section beta-section], got %#v", got)
	}
}

func TestProjectGroupSectionsCreatesChildGroupAndPreservesParentOrder(t *testing.T) {
	t.Parallel()

	project := sectionStructureSelectionTestProject(t)
	originalSectionIDs := make(map[string]struct{}, len(project.Sections))
	for sectionID := range project.Sections {
		originalSectionIDs[sectionID] = struct{}{}
	}

	if err := project.GroupSections(
		GroupSectionsInput{SectionIDs: []string{"top-child-b", "top-child-a"}},
		DefaultStructuralMutationSettings(),
	); err != nil {
		t.Fatalf("GroupSections returned error: %v", err)
	}

	groupID := ""
	for sectionID := range project.Sections {
		if _, ok := originalSectionIDs[sectionID]; ok {
			continue
		}
		groupID = sectionID
		break
	}
	if groupID == "" {
		t.Fatal("expected GroupSections to create a nested group section")
	}
	if got := project.Sections[groupID].ParentSectionID; got != "top-group" {
		t.Fatalf("expected nested group parent top-group, got %q", got)
	}
	if got := project.Sections["top-child-a"].ParentSectionID; got != groupID {
		t.Fatalf("expected top-child-a parent %q, got %q", groupID, got)
	}
	if got := project.Sections["top-child-b"].ParentSectionID; got != groupID {
		t.Fatalf("expected top-child-b parent %q, got %q", groupID, got)
	}

	parentPayload, err := effectiveSectionPayload(project, "top-group", "top-group-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload top-group: %v", err)
	}
	if got := payloadStringArrayField(parentPayload, "children"); !reflect.DeepEqual(got, []string{groupID}) {
		t.Fatalf("expected top-group children [%s], got %#v", groupID, got)
	}

	groupVariantID := project.SectionVariantMap[groupID]
	groupPayload, err := effectiveSectionPayload(project, groupID, groupVariantID)
	if err != nil {
		t.Fatalf("effectiveSectionPayload group: %v", err)
	}
	if got := payloadStringArrayField(groupPayload, "children"); !reflect.DeepEqual(got, []string{"top-child-a", "top-child-b"}) {
		t.Fatalf("expected grouped children [top-child-a top-child-b], got %#v", got)
	}
}

func TestRuntimeUngroupGroupsMovesChildrenBackToTopLevelAndParentOrder(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": sectionStructureSelectionTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.UngroupGroups(
		context.Background(),
		"project-alpha",
		UngroupGroupsInput{GroupIDs: []string{"top-group", "nested-group"}},
	); err != nil {
		t.Fatalf("UngroupGroups returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	assertUngroupDeletedGroups(t, project)
	assertUngroupedTopLevelChildren(t, project)
	assertNestedUngroupedChildren(t, project)
}

func assertUngroupDeletedGroups(t *testing.T, project Project) {
	t.Helper()

	if _, ok := project.Sections["top-group"]; ok {
		t.Fatal("expected top-group to be deleted")
	}
	if _, ok := project.Sections["nested-group"]; ok {
		t.Fatal("expected nested-group to be deleted")
	}
}

func assertUngroupedTopLevelChildren(t *testing.T, project Project) {
	t.Helper()

	for _, sectionID := range []string{"top-child-a", "top-child-b"} {
		if got := project.Sections[sectionID].ParentSectionID; got != "" {
			t.Fatalf("expected %s to become top-level, got parent %q", sectionID, got)
		}
	}
	topChildALayout := assertTopLevelLayoutAfterUngroup(t, project, "top-child-a")
	topChildBLayout := assertTopLevelLayoutAfterUngroup(t, project, "top-child-b")
	if topChildALayout.ZIndex <= 4 || topChildBLayout.ZIndex <= 4 {
		t.Fatalf("expected ungrouped top-level children to receive fresh z-indices, got %#v and %#v", topChildALayout, topChildBLayout)
	}
}

func assertTopLevelLayoutAfterUngroup(t *testing.T, project Project, sectionID string) TopLevelSectionLayout {
	t.Helper()

	layout, ok := project.TopLevelSections[sectionID]
	if !ok {
		t.Fatalf("expected %s layout after ungroup", sectionID)
	}
	if layout.X != 400 || layout.Y != 60 {
		t.Fatalf("unexpected %s layout %#v", sectionID, layout)
	}
	return layout
}

func assertNestedUngroupedChildren(t *testing.T, project Project) {
	t.Helper()

	for _, sectionID := range []string{"nested-child-a", "nested-child-b"} {
		if got := project.Sections[sectionID].ParentSectionID; got != "nested-parent" {
			t.Fatalf("expected %s parent nested-parent, got %q", sectionID, got)
		}
	}
	parentPayload, err := effectiveSectionPayload(project, "nested-parent", "nested-parent-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload nested-parent: %v", err)
	}
	if got := payloadStringArrayField(parentPayload, "children"); !reflect.DeepEqual(got, []string{"nested-child-a", "nested-child-b", "nested-sibling"}) {
		t.Fatalf("expected nested-parent children [nested-child-a nested-child-b nested-sibling], got %#v", got)
	}
}

func TestRuntimeToggleParamSelectedAndUnselectAllParamsPersistSelectionState(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": codeObjectNameTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.ToggleParamSelected(
		context.Background(),
		"project-alpha",
		ToggleParamSelectedInput{
			SectionID:   "dict-a",
			ParamInfoID: "shared-child",
		},
	); err != nil {
		t.Fatalf("ToggleParamSelected dict-a returned error: %v", err)
	}
	if _, err := runtime.ToggleParamSelected(
		context.Background(),
		"project-alpha",
		ToggleParamSelectedInput{
			SectionID:   "callable-section",
			ParamInfoID: "callable-param",
		},
	); err != nil {
		t.Fatalf("ToggleParamSelected callable-section returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if got := selectedParamsForSection(t, project, "dict-a"); !reflect.DeepEqual(got, []string{"shared-child"}) {
		t.Fatalf("expected dict-a selected params [shared-child], got %#v", got)
	}
	if got := selectedParamsForSection(t, project, "callable-section"); !reflect.DeepEqual(got, []string{"callable-param"}) {
		t.Fatalf("expected callable-section selected params [callable-param], got %#v", got)
	}

	if _, err := runtime.UnselectAllParams(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("UnselectAllParams returned error: %v", err)
	}
	project = runtime.Snapshot().Document.Projects["project-alpha"]
	if got := selectedParamsForSection(t, project, "dict-a"); len(got) != 0 {
		t.Fatalf("expected dict-a selected params cleared, got %#v", got)
	}
	if got := selectedParamsForSection(t, project, "callable-section"); len(got) != 0 {
		t.Fatalf("expected callable-section selected params cleared, got %#v", got)
	}
}

func selectedParamsForSection(t *testing.T, project Project, sectionID string) []string {
	t.Helper()
	variantID := project.SectionVariantMap[sectionID]
	payload, err := effectiveSectionPayload(project, sectionID, variantID)
	if err != nil {
		t.Fatalf("effectiveSectionPayload %s: %v", sectionID, err)
	}
	return payloadStringArrayField(payload, "selectedParams")
}

func sectionStructureSelectionTestProject(t *testing.T) Project {
	t.Helper()

	topLevelSections := map[string]TopLevelSectionLayout{
		"alpha-section": {X: 120, Y: 40, ZIndex: 1},
		"beta-section":  {X: 20, Y: 10, ZIndex: 2},
		"top-group":     {X: 400, Y: 60, ZIndex: 3},
		"nested-parent": {X: 700, Y: 80, ZIndex: 4},
	}
	project, err := Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		TopLevelSectionIDs: []string{
			"alpha-section",
			"beta-section",
			"top-group",
			"nested-parent",
		},
		TopLevelSections: topLevelSections,
		ViewModes: map[string]ViewMode{
			"focus": {
				ID:               "focus",
				TopLevelSections: cloneTopLevelSectionsMap(topLevelSections),
				VisibilityBySectionID: map[string]bool{
					"alpha-section":  true,
					"beta-section":   true,
					"top-group":      true,
					"top-child-a":    true,
					"top-child-b":    true,
					"nested-parent":  true,
					"nested-group":   true,
					"nested-child-a": true,
					"nested-child-b": true,
					"nested-sibling": true,
				},
			},
		},
		SectionVariantMap: map[string]string{
			"alpha-section":  "alpha-variant",
			"beta-section":   "beta-variant",
			"top-group":      "top-group-variant",
			"top-child-a":    "top-child-a-variant",
			"top-child-b":    "top-child-b-variant",
			"nested-parent":  "nested-parent-variant",
			"nested-group":   "nested-group-variant",
			"nested-child-a": "nested-child-a-variant",
			"nested-child-b": "nested-child-b-variant",
			"nested-sibling": "nested-sibling-variant",
		},
		Sections: map[string]Section{
			"alpha-section": {
				ID:               "alpha-section",
				Name:             "Alpha Section",
				VariantIDs:       []string{"alpha-variant"},
				DefaultVariantID: "alpha-variant",
			},
			"beta-section": {
				ID:               "beta-section",
				Name:             "Beta Section",
				VariantIDs:       []string{"beta-variant"},
				DefaultVariantID: "beta-variant",
			},
			"top-group": {
				ID:               "top-group",
				Name:             "Top Group",
				VariantIDs:       []string{"top-group-variant"},
				DefaultVariantID: "top-group-variant",
			},
			"top-child-a": {
				ID:               "top-child-a",
				Name:             "Top Child A",
				ParentSectionID:  "top-group",
				VariantIDs:       []string{"top-child-a-variant"},
				DefaultVariantID: "top-child-a-variant",
			},
			"top-child-b": {
				ID:               "top-child-b",
				Name:             "Top Child B",
				ParentSectionID:  "top-group",
				VariantIDs:       []string{"top-child-b-variant"},
				DefaultVariantID: "top-child-b-variant",
			},
			"nested-parent": {
				ID:               "nested-parent",
				Name:             "Nested Parent",
				VariantIDs:       []string{"nested-parent-variant"},
				DefaultVariantID: "nested-parent-variant",
			},
			"nested-group": {
				ID:               "nested-group",
				Name:             "Nested Group",
				ParentSectionID:  "nested-parent",
				VariantIDs:       []string{"nested-group-variant"},
				DefaultVariantID: "nested-group-variant",
			},
			"nested-child-a": {
				ID:               "nested-child-a",
				Name:             "Nested Child A",
				ParentSectionID:  "nested-group",
				VariantIDs:       []string{"nested-child-a-variant"},
				DefaultVariantID: "nested-child-a-variant",
			},
			"nested-child-b": {
				ID:               "nested-child-b",
				Name:             "Nested Child B",
				ParentSectionID:  "nested-group",
				VariantIDs:       []string{"nested-child-b-variant"},
				DefaultVariantID: "nested-child-b-variant",
			},
			"nested-sibling": {
				ID:               "nested-sibling",
				Name:             "Nested Sibling",
				ParentSectionID:  "nested-parent",
				VariantIDs:       []string{"nested-sibling-variant"},
				DefaultVariantID: "nested-sibling-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"alpha-variant":         {ID: "alpha-variant", ImplID: "alpha-impl"},
			"beta-variant":          {ID: "beta-variant", ImplID: "beta-impl"},
			"top-group-variant":     {ID: "top-group-variant", ImplID: "top-group-impl"},
			"top-child-a-variant":   {ID: "top-child-a-variant", ImplID: "top-child-a-impl"},
			"top-child-b-variant":   {ID: "top-child-b-variant", ImplID: "top-child-b-impl"},
			"nested-parent-variant": {ID: "nested-parent-variant", ImplID: "nested-parent-impl"},
			"nested-group-variant":  {ID: "nested-group-variant", ImplID: "nested-group-impl"},
			"nested-child-a-variant": {
				ID:     "nested-child-a-variant",
				ImplID: "nested-child-a-impl",
			},
			"nested-child-b-variant": {
				ID:     "nested-child-b-variant",
				ImplID: "nested-child-b-impl",
			},
			"nested-sibling-variant": {
				ID:     "nested-sibling-variant",
				ImplID: "nested-sibling-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"alpha-impl": {
				ID:      "alpha-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "alpha-impl", "type": "TextBlock"}),
			},
			"beta-impl": {
				ID:      "beta-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "beta-impl", "type": "TextBlock"}),
			},
			"top-group-impl": {
				ID:   "top-group-impl",
				Kind: SectionKind("group"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "top-group-impl",
					"type":     "Group",
					"children": []string{"top-child-a", "top-child-b"},
				}),
			},
			"top-child-a-impl": {
				ID:      "top-child-a-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "top-child-a-impl", "type": "TextBlock"}),
			},
			"top-child-b-impl": {
				ID:      "top-child-b-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "top-child-b-impl", "type": "TextBlock"}),
			},
			"nested-parent-impl": {
				ID:   "nested-parent-impl",
				Kind: SectionKind("group"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "nested-parent-impl",
					"type":     "Group",
					"children": []string{"nested-group", "nested-sibling"},
				}),
			},
			"nested-group-impl": {
				ID:   "nested-group-impl",
				Kind: SectionKind("group"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "nested-group-impl",
					"type":     "Group",
					"children": []string{"nested-child-a", "nested-child-b"},
				}),
			},
			"nested-child-a-impl": {
				ID:      "nested-child-a-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "nested-child-a-impl", "type": "TextBlock"}),
			},
			"nested-child-b-impl": {
				ID:      "nested-child-b-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "nested-child-b-impl", "type": "TextBlock"}),
			},
			"nested-sibling-impl": {
				ID:      "nested-sibling-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "nested-sibling-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section structure selection test project: %v", err)
	}
	return project
}
