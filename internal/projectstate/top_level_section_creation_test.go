package projectstate

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestProjectCreateTopLevelSectionPrunesStaleLayoutStateAndUsesDeterministicPlacement(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "Dict",
	}, defaultAutoLayoutSectionSizingPolicy())
	if err != nil {
		t.Fatalf("create top level section: %v", err)
	}

	if result.SectionID == "" {
		t.Fatal("expected created section id")
	}
	if result.MetaControlParamID != nil {
		t.Fatalf("did not expect meta control param id for Dict section, got %#v", result.MetaControlParamID)
	}
	if result.PanTo != nil {
		t.Fatalf("expected nil panTo, got %#v", result.PanTo)
	}
	if !containsString(project.TopLevelSectionIDs, result.SectionID) {
		t.Fatalf("expected created section id in top-level ids, got %#v", project.TopLevelSectionIDs)
	}
	if containsString(project.TopLevelSectionIDs, "stale-section") {
		t.Fatalf("did not expect stale-section in top-level ids, got %#v", project.TopLevelSectionIDs)
	}
	if _, ok := project.TopLevelSections["stale-section"]; ok {
		t.Fatalf("did not expect stale-section layout to survive, got %#v", project.TopLevelSections)
	}

	layout, ok := project.TopLevelSections[result.SectionID]
	if !ok {
		t.Fatalf("expected created section layout, got %#v", project.TopLevelSections)
	}
	if layout.X != 134 || layout.Y != 20 {
		t.Fatalf("expected deterministic placement {134 20}, got %#v", layout)
	}
	if layout.ZIndex != 3 {
		t.Fatalf("expected next z-index 3, got %#v", layout)
	}

	for _, viewModeID := range []string{"focus", "secondary"} {
		viewMode := project.ViewModes[viewModeID]
		if _, ok := viewMode.TopLevelSections["stale-section"]; ok {
			t.Fatalf("did not expect stale-section in %s top-level layouts, got %#v", viewModeID, viewMode.TopLevelSections)
		}
		if _, ok := viewMode.VisibilityBySectionID["stale-section"]; ok {
			t.Fatalf("did not expect stale-section in %s visibility, got %#v", viewModeID, viewMode.VisibilityBySectionID)
		}
		if _, ok := viewMode.TopLevelSections[result.SectionID]; !ok {
			t.Fatalf("expected created section in %s top-level layouts, got %#v", viewModeID, viewMode.TopLevelSections)
		}
		if !viewMode.VisibilityBySectionID[result.SectionID] {
			t.Fatalf("expected created section visible in %s, got %#v", viewModeID, viewMode.VisibilityBySectionID)
		}
	}
}

func TestProjectCreateTopLevelSectionCreatesMetaControlParamAndHonorsExplicitPosition(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)
	position := &Position{X: -44, Y: 91}
	controlType := "TextParam"

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType:           "MetaControl",
		ControlCodeObjType: &controlType,
		Position:           position,
	}, defaultAutoLayoutSectionSizingPolicy())
	if err != nil {
		t.Fatalf("create meta control top level section: %v", err)
	}

	if result.SectionID == "" {
		t.Fatal("expected created meta control section id")
	}
	if result.MetaControlParamID == nil || *result.MetaControlParamID == "" {
		t.Fatalf("expected created meta control param id, got %#v", result.MetaControlParamID)
	}
	layout := project.TopLevelSections[result.SectionID]
	if layout.X != position.X || layout.Y != position.Y {
		t.Fatalf("expected explicit position %#v, got %#v", position, layout)
	}

	codeObj, ok := project.CodeObjs[*result.MetaControlParamID]
	if !ok {
		t.Fatalf("expected created meta control code object, got %#v", project.CodeObjs)
	}
	if codeObj.Name != "control" {
		t.Fatalf("expected control code object name, got %#v", codeObj)
	}

	sectionPayload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
	if err != nil {
		t.Fatalf("effective section payload: %v", err)
	}
	if got := payloadStringField(sectionPayload, "metaControlParamId"); got != *result.MetaControlParamID {
		t.Fatalf("expected meta control payload id %q, got %q", *result.MetaControlParamID, got)
	}
}

func TestProjectCreateTopLevelSectionRejectsUnsupportedImplType(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)
	_, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "UnsupportedSection",
	}, defaultAutoLayoutSectionSizingPolicy())
	if err == nil || err.Error() == "" {
		t.Fatalf("expected unsupported impl type error, got %v", err)
	}
	if !errors.Is(err, ErrTopLevelSectionImplTypeUnsupported) {
		t.Fatalf("expected ErrTopLevelSectionImplTypeUnsupported, got %v", err)
	}
}

func testCreateTopLevelSectionProject(t *testing.T) Project {
	t.Helper()

	return Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"existing-section",
			"stale-section",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"existing-section": {
				X:      10,
				Y:      20,
				ZIndex: 2,
			},
			"stale-section": {
				X:      200,
				Y:      150,
				ZIndex: 4,
			},
		},
		SectionVariantMap: map[string]string{
			"existing-section": "existing-variant",
		},
		Sections: map[string]Section{
			"existing-section": {
				ID:               "existing-section",
				Name:             "Existing",
				VariantIDs:       []string{"existing-variant"},
				DefaultVariantID: "existing-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"existing-variant": {
				ID:               "existing-variant",
				ImplID:           "existing-impl",
				NonPresetImplIDs: []string{"existing-impl"},
			},
		},
		SectionImpls: map[string]SectionImpl{
			"existing-impl": {
				ID:      "existing-impl",
				Kind:    SectionKind("textblock"),
				Payload: mustCreateTopLevelSectionRawJSON(t, map[string]any{"id": "existing-impl", "type": "TextBlock"}),
			},
		},
		ViewModes: map[string]ViewMode{
			"focus": {
				ID:        "focus",
				Name:      "Focus",
				SortIndex: 0,
				TopLevelSections: map[string]TopLevelSectionLayout{
					"existing-section": {X: 10, Y: 20, ZIndex: 2},
					"stale-section":    {X: 200, Y: 150, ZIndex: 4},
				},
				VisibilityBySectionID: map[string]bool{
					"existing-section": true,
					"stale-section":    true,
				},
			},
			"secondary": {
				ID:        "secondary",
				Name:      "Secondary",
				SortIndex: 1,
				TopLevelSections: map[string]TopLevelSectionLayout{
					"existing-section": {X: 40, Y: 50, ZIndex: 1},
					"stale-section":    {X: 300, Y: 175, ZIndex: 2},
				},
				VisibilityBySectionID: map[string]bool{
					"existing-section": true,
					"stale-section":    true,
				},
			},
		},
	}
}

func mustCreateTopLevelSectionRawJSON(t *testing.T, value any) RawJSON {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal top-level section raw json: %v", err)
	}
	return encoded
}
