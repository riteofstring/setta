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
