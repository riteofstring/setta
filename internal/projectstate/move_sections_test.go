package projectstate

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestRuntimeMoveSectionsMovesTopLevelSectionsIntoParentAndRemovesLayouts(t *testing.T) {
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

	newParentID := "top-group"
	newIndex := 0
	if _, err := runtime.MoveSections(
		context.Background(),
		"project-alpha",
		MoveSectionsInput{
			SectionIDs:  []string{"alpha-section", "beta-section"},
			NewParentID: &newParentID,
			NewIndex:    &newIndex,
		},
		DefaultStructuralMutationSettings(),
	); err != nil {
		t.Fatalf("MoveSections returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if got := project.Sections["alpha-section"].ParentSectionID; got != "top-group" {
		t.Fatalf("expected alpha-section parent top-group, got %q", got)
	}
	if got := project.Sections["beta-section"].ParentSectionID; got != "top-group" {
		t.Fatalf("expected beta-section parent top-group, got %q", got)
	}
	if _, ok := project.TopLevelSections["alpha-section"]; ok {
		t.Fatal("expected alpha-section to leave top-level layouts")
	}
	if _, ok := project.TopLevelSections["beta-section"]; ok {
		t.Fatal("expected beta-section to leave top-level layouts")
	}

	topGroupPayload, err := effectiveSectionPayload(project, "top-group", "top-group-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload top-group: %v", err)
	}
	if got := payloadStringArrayField(topGroupPayload, "children"); !reflect.DeepEqual(got, []string{"alpha-section", "beta-section", "top-child-a", "top-child-b"}) {
		t.Fatalf("expected top-group children [alpha-section beta-section top-child-a top-child-b], got %#v", got)
	}
}

func TestRuntimeMoveSectionsReordersSiblingsWithinTheSameParent(t *testing.T) {
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

	newParentID := "nested-parent"
	newIndex := 0
	if _, err := runtime.MoveSections(
		context.Background(),
		"project-alpha",
		MoveSectionsInput{
			SectionIDs:  []string{"nested-sibling"},
			NewParentID: &newParentID,
			NewIndex:    &newIndex,
		},
		DefaultStructuralMutationSettings(),
	); err != nil {
		t.Fatalf("MoveSections returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "nested-parent", "nested-parent-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload nested-parent: %v", err)
	}
	if got := payloadStringArrayField(payload, "children"); !reflect.DeepEqual(got, []string{"nested-sibling", "nested-group"}) {
		t.Fatalf("expected nested-parent children [nested-sibling nested-group], got %#v", got)
	}
}

func TestRuntimeMoveSectionsWithinParentKeepsSelectedBlockContiguous(t *testing.T) {
	t.Parallel()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"parent":  "parent-variant",
			"child-a": "child-a-variant",
			"child-b": "child-b-variant",
			"child-c": "child-c-variant",
			"child-d": "child-d-variant",
		},
		Sections: map[string]Section{
			"parent": {
				ID:               "parent",
				Name:             "Parent",
				VariantIDs:       []string{"parent-variant"},
				DefaultVariantID: "parent-variant",
			},
			"child-a": {
				ID:               "child-a",
				Name:             "Child A",
				ParentSectionID:  "parent",
				VariantIDs:       []string{"child-a-variant"},
				DefaultVariantID: "child-a-variant",
			},
			"child-b": {
				ID:               "child-b",
				Name:             "Child B",
				ParentSectionID:  "parent",
				VariantIDs:       []string{"child-b-variant"},
				DefaultVariantID: "child-b-variant",
			},
			"child-c": {
				ID:               "child-c",
				Name:             "Child C",
				ParentSectionID:  "parent",
				VariantIDs:       []string{"child-c-variant"},
				DefaultVariantID: "child-c-variant",
			},
			"child-d": {
				ID:               "child-d",
				Name:             "Child D",
				ParentSectionID:  "parent",
				VariantIDs:       []string{"child-d-variant"},
				DefaultVariantID: "child-d-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"parent-variant":  {ID: "parent-variant", ImplID: "parent-impl"},
			"child-a-variant": {ID: "child-a-variant", ImplID: "child-a-impl"},
			"child-b-variant": {ID: "child-b-variant", ImplID: "child-b-impl"},
			"child-c-variant": {ID: "child-c-variant", ImplID: "child-c-impl"},
			"child-d-variant": {ID: "child-d-variant", ImplID: "child-d-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"parent-impl": {
				ID:   "parent-impl",
				Kind: SectionKind("group"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "parent-impl",
					"type":     "Group",
					"children": []string{"child-a", "child-b", "child-c", "child-d"},
				}),
			},
			"child-a-impl": {
				ID:      "child-a-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-a-impl", "type": "TextBlock"}),
			},
			"child-b-impl": {
				ID:      "child-b-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-b-impl", "type": "TextBlock"}),
			},
			"child-c-impl": {
				ID:      "child-c-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-c-impl", "type": "TextBlock"}),
			},
			"child-d-impl": {
				ID:      "child-d-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-d-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize contiguous-move project: %v", err)
	}

	newParentID := "parent"
	newIndex := 1
	if err := project.MoveSections(
		MoveSectionsInput{
			SectionIDs:  []string{"child-a", "child-c"},
			NewParentID: &newParentID,
			NewIndex:    &newIndex,
		},
		DefaultStructuralMutationSettings().SectionSizingPolicy,
		DefaultStructuralMutationSettings().TerminalDefaultHeight,
	); err != nil {
		t.Fatalf("MoveSections returned error: %v", err)
	}

	payload, err := effectiveSectionPayload(project, "parent", "parent-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload parent: %v", err)
	}
	if got := payloadStringArrayField(payload, "children"); !reflect.DeepEqual(got, []string{"child-b", "child-a", "child-c", "child-d"}) {
		t.Fatalf("expected parent children [child-b child-a child-c child-d], got %#v", got)
	}
}

func TestProjectMoveSectionsFromMultipleParentsUpdatesParentage(t *testing.T) {
	t.Parallel()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"parent-a":  "parent-a-variant",
			"parent-b":  "parent-b-variant",
			"parent-c":  "parent-c-variant",
			"child-a-1": "child-a-1-variant",
			"child-a-2": "child-a-2-variant",
			"child-b-1": "child-b-1-variant",
			"child-b-2": "child-b-2-variant",
			"child-c-1": "child-c-1-variant",
		},
		Sections: map[string]Section{
			"parent-a": {
				ID:               "parent-a",
				Name:             "Parent A",
				VariantIDs:       []string{"parent-a-variant"},
				DefaultVariantID: "parent-a-variant",
			},
			"parent-b": {
				ID:               "parent-b",
				Name:             "Parent B",
				VariantIDs:       []string{"parent-b-variant"},
				DefaultVariantID: "parent-b-variant",
			},
			"parent-c": {
				ID:               "parent-c",
				Name:             "Parent C",
				VariantIDs:       []string{"parent-c-variant"},
				DefaultVariantID: "parent-c-variant",
			},
			"child-a-1": {
				ID:               "child-a-1",
				Name:             "Child A1",
				ParentSectionID:  "parent-a",
				VariantIDs:       []string{"child-a-1-variant"},
				DefaultVariantID: "child-a-1-variant",
			},
			"child-a-2": {
				ID:               "child-a-2",
				Name:             "Child A2",
				ParentSectionID:  "parent-a",
				VariantIDs:       []string{"child-a-2-variant"},
				DefaultVariantID: "child-a-2-variant",
			},
			"child-b-1": {
				ID:               "child-b-1",
				Name:             "Child B1",
				ParentSectionID:  "parent-b",
				VariantIDs:       []string{"child-b-1-variant"},
				DefaultVariantID: "child-b-1-variant",
			},
			"child-b-2": {
				ID:               "child-b-2",
				Name:             "Child B2",
				ParentSectionID:  "parent-b",
				VariantIDs:       []string{"child-b-2-variant"},
				DefaultVariantID: "child-b-2-variant",
			},
			"child-c-1": {
				ID:               "child-c-1",
				Name:             "Child C1",
				ParentSectionID:  "parent-c",
				VariantIDs:       []string{"child-c-1-variant"},
				DefaultVariantID: "child-c-1-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"parent-a-variant":  {ID: "parent-a-variant", ImplID: "parent-a-impl"},
			"parent-b-variant":  {ID: "parent-b-variant", ImplID: "parent-b-impl"},
			"parent-c-variant":  {ID: "parent-c-variant", ImplID: "parent-c-impl"},
			"child-a-1-variant": {ID: "child-a-1-variant", ImplID: "child-a-1-impl"},
			"child-a-2-variant": {ID: "child-a-2-variant", ImplID: "child-a-2-impl"},
			"child-b-1-variant": {ID: "child-b-1-variant", ImplID: "child-b-1-impl"},
			"child-b-2-variant": {ID: "child-b-2-variant", ImplID: "child-b-2-impl"},
			"child-c-1-variant": {ID: "child-c-1-variant", ImplID: "child-c-1-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"parent-a-impl": {
				ID:   "parent-a-impl",
				Kind: SectionKind("group"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "parent-a-impl",
					"type":     "Group",
					"children": []string{"child-a-1", "child-a-2"},
				}),
			},
			"parent-b-impl": {
				ID:   "parent-b-impl",
				Kind: SectionKind("group"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "parent-b-impl",
					"type":     "Group",
					"children": []string{"child-b-1", "child-b-2"},
				}),
			},
			"parent-c-impl": {
				ID:   "parent-c-impl",
				Kind: SectionKind("group"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "parent-c-impl",
					"type":     "Group",
					"children": []string{"child-c-1"},
				}),
			},
			"child-a-1-impl": {
				ID:      "child-a-1-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-a-1-impl", "type": "TextBlock"}),
			},
			"child-a-2-impl": {
				ID:      "child-a-2-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-a-2-impl", "type": "TextBlock"}),
			},
			"child-b-1-impl": {
				ID:      "child-b-1-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-b-1-impl", "type": "TextBlock"}),
			},
			"child-b-2-impl": {
				ID:      "child-b-2-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-b-2-impl", "type": "TextBlock"}),
			},
			"child-c-1-impl": {
				ID:      "child-c-1-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-c-1-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize multi-parent move project: %v", err)
	}

	newParentID := "parent-c"
	newIndex := 0
	if err := project.MoveSections(
		MoveSectionsInput{
			SectionIDs:  []string{"child-a-1", "child-b-2"},
			NewParentID: &newParentID,
			NewIndex:    &newIndex,
		},
		DefaultStructuralMutationSettings().SectionSizingPolicy,
		DefaultStructuralMutationSettings().TerminalDefaultHeight,
	); err != nil {
		t.Fatalf("MoveSections returned error: %v", err)
	}

	parentAPayload, err := effectiveSectionPayload(project, "parent-a", "parent-a-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload parent-a: %v", err)
	}
	if got := payloadStringArrayField(parentAPayload, "children"); !reflect.DeepEqual(got, []string{"child-a-2"}) {
		t.Fatalf("expected parent-a children [child-a-2], got %#v", got)
	}

	parentBPayload, err := effectiveSectionPayload(project, "parent-b", "parent-b-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload parent-b: %v", err)
	}
	if got := payloadStringArrayField(parentBPayload, "children"); !reflect.DeepEqual(got, []string{"child-b-1"}) {
		t.Fatalf("expected parent-b children [child-b-1], got %#v", got)
	}

	parentCPayload, err := effectiveSectionPayload(project, "parent-c", "parent-c-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload parent-c: %v", err)
	}
	if got := payloadStringArrayField(parentCPayload, "children"); !reflect.DeepEqual(got, []string{"child-a-1", "child-b-2", "child-c-1"}) {
		t.Fatalf("expected parent-c children [child-a-1 child-b-2 child-c-1], got %#v", got)
	}

	if got := project.Sections["child-a-1"].ParentSectionID; got != "parent-c" {
		t.Fatalf("expected child-a-1 parent parent-c, got %q", got)
	}
	if got := project.Sections["child-b-2"].ParentSectionID; got != "parent-c" {
		t.Fatalf("expected child-b-2 parent parent-c, got %q", got)
	}
}

func TestRuntimeMoveSectionsAttachesAndDetachesTerminalThroughTheMoveRoute(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newAttachedTerminalWriteTestDocument())
	settings := testStructuralMutationSettingsWithTerminalHeight(222.0)

	codeSectionID := "code-section"
	terminalSectionID := "terminal-section"
	newIndex := 0
	if _, err := runtime.MoveSections(
		context.Background(),
		"project-alpha",
		MoveSectionsInput{
			SectionIDs:  []string{terminalSectionID},
			NewParentID: &codeSectionID,
			NewIndex:    &newIndex,
		},
		settings,
	); err != nil {
		t.Fatalf("attach terminal via MoveSections: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	_, _, codeImpl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve attached code section: %v", err)
	}
	if codeImpl.Code.AttachedTerminalSectionID != terminalSectionID {
		t.Fatalf("expected attached terminal id %q, got %q", terminalSectionID, codeImpl.Code.AttachedTerminalSectionID)
	}
	if !reflect.DeepEqual(codeImpl.Code.Children, []string{terminalSectionID}) {
		t.Fatalf("expected code children [%s], got %#v", terminalSectionID, codeImpl.Code.Children)
	}
	if _, ok := project.TopLevelSections[terminalSectionID]; ok {
		t.Fatalf("did not expect terminal to remain top-level after attach, got %#v", project.TopLevelSections[terminalSectionID])
	}

	positionsByID := map[string]Position{
		terminalSectionID: {X: 120, Y: 80},
	}
	if _, err := runtime.MoveSections(
		context.Background(),
		"project-alpha",
		MoveSectionsInput{
			SectionIDs:    []string{terminalSectionID},
			NewParentID:   nil,
			PositionsByID: positionsByID,
		},
		settings,
	); err != nil {
		t.Fatalf("detach terminal via MoveSections: %v", err)
	}

	project = runtime.Snapshot().Document.Projects["project-alpha"]
	_, _, codeImpl, err = project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve detached code section: %v", err)
	}
	if codeImpl.Code.AttachedTerminalSectionID != "" {
		t.Fatalf("expected cleared attached terminal id, got %q", codeImpl.Code.AttachedTerminalSectionID)
	}
	if len(codeImpl.Code.Children) != 0 {
		t.Fatalf("expected cleared code children, got %#v", codeImpl.Code.Children)
	}

	terminalSection, _, _, err := project.ResolveSection("terminal-section")
	if err != nil {
		t.Fatalf("resolve detached terminal: %v", err)
	}
	if terminalSection.ParentSectionID != "" {
		t.Fatalf("expected detached terminal to become top-level, got parent %q", terminalSection.ParentSectionID)
	}

	layout, ok := project.TopLevelSections["terminal-section"]
	if !ok {
		t.Fatalf("expected terminal-section layout after detach, got %#v", project.TopLevelSections)
	}
	if layout.X != 120 || layout.Y != 80 || layout.ZIndex != 3 {
		t.Fatalf("expected terminal-section layout {120 80 3}, got %#v", layout)
	}
}

func TestRuntimeMoveSectionsMoveToPaneAssignsFreshMonotonicZIndices(t *testing.T) {
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

	if _, err := runtime.MoveSections(
		context.Background(),
		"project-alpha",
		MoveSectionsInput{
			SectionIDs: []string{"top-child-a"},
			PositionsByID: map[string]Position{
				"top-child-a": {X: 5, Y: 5},
			},
		},
		DefaultStructuralMutationSettings(),
	); err != nil {
		t.Fatalf("move top-child-a to pane: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	firstLayout, ok := project.TopLevelSections["top-child-a"]
	if !ok {
		t.Fatalf("expected top-child-a layout after pane move, got %#v", project.TopLevelSections)
	}
	if firstLayout.ZIndex != 5 {
		t.Fatalf("expected top-child-a zIndex 5, got %#v", firstLayout)
	}

	if _, err := runtime.MoveSections(
		context.Background(),
		"project-alpha",
		MoveSectionsInput{
			SectionIDs: []string{"top-child-b"},
			PositionsByID: map[string]Position{
				"top-child-b": {X: 15, Y: 15},
			},
		},
		DefaultStructuralMutationSettings(),
	); err != nil {
		t.Fatalf("move top-child-b to pane: %v", err)
	}

	project = runtime.Snapshot().Document.Projects["project-alpha"]
	secondLayout, ok := project.TopLevelSections["top-child-b"]
	if !ok {
		t.Fatalf("expected top-child-b layout after pane move, got %#v", project.TopLevelSections)
	}
	if secondLayout.ZIndex != 6 {
		t.Fatalf("expected top-child-b zIndex 6, got %#v", secondLayout)
	}
}

func TestRuntimeMoveSectionsRejectsDescendantParent(t *testing.T) {
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

	newParentID := "nested-group"
	newIndex := 0
	_, err = runtime.MoveSections(
		context.Background(),
		"project-alpha",
		MoveSectionsInput{
			SectionIDs:  []string{"nested-parent"},
			NewParentID: &newParentID,
			NewIndex:    &newIndex,
		},
		DefaultStructuralMutationSettings(),
	)
	if !errors.Is(err, ErrMoveSectionsNewParentDescendant) {
		t.Fatalf("expected ErrMoveSectionsNewParentDescendant, got %v", err)
	}
}

func TestRuntimeMoveSectionsRejectsSelectedParent(t *testing.T) {
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

	newParentID := "top-group"
	newIndex := 0
	_, err = runtime.MoveSections(
		context.Background(),
		"project-alpha",
		MoveSectionsInput{
			SectionIDs:  []string{"top-group"},
			NewParentID: &newParentID,
			NewIndex:    &newIndex,
		},
		DefaultStructuralMutationSettings(),
	)
	if !errors.Is(err, ErrMoveSectionsNewParentSelected) {
		t.Fatalf("expected ErrMoveSectionsNewParentSelected, got %v", err)
	}
}

func TestRuntimeMoveSectionsRejectsNewIndexOutOfRange(t *testing.T) {
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

	newParentID := "top-group"
	newIndex := 3
	_, err = runtime.MoveSections(
		context.Background(),
		"project-alpha",
		MoveSectionsInput{
			SectionIDs:  []string{"top-child-a"},
			NewParentID: &newParentID,
			NewIndex:    &newIndex,
		},
		DefaultStructuralMutationSettings(),
	)
	if !errors.Is(err, ErrMoveSectionsNewIndexOutOfRange) {
		t.Fatalf("expected ErrMoveSectionsNewIndexOutOfRange, got %v", err)
	}
}
