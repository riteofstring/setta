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
	if createdSection, ok := project.Sections[result.SectionID]; !ok {
		t.Fatalf("expected created section %q in project state", result.SectionID)
	} else if createdSection.Name == "" {
		t.Fatal("expected created top-level section name")
	} else if _, err := validateSectionName(project, result.SectionID, createdSection.Name); err != nil {
		t.Fatalf("expected created top-level section name to remain valid, got %q with error %v", createdSection.Name, err)
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
	if codeObj.Name == "" {
		t.Fatalf("expected created meta control code object name, got %#v", codeObj)
	}
	if _, err := validateCodeObjectNameForSection(project, result.SectionID, codeObj.ID, codeObj.Name); err != nil {
		t.Fatalf("expected meta control code object name to remain valid, got %q with error %v", codeObj.Name, err)
	}

	sectionPayload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
	if err != nil {
		t.Fatalf("effective section payload: %v", err)
	}
	if got := payloadStringField(sectionPayload, "metaControlParamId"); got != *result.MetaControlParamID {
		t.Fatalf("expected meta control payload id %q, got %q", *result.MetaControlParamID, got)
	}
}

func TestProjectCreateTopLevelSectionSeedsFrontendFacingSizeDefaults(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "Terminal",
	}, defaultAutoLayoutSectionSizingPolicy())
	if err != nil {
		t.Fatalf("create terminal top level section: %v", err)
	}

	payload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
	if err != nil {
		t.Fatalf("effective terminal payload: %v", err)
	}
	size, ok := payloadObjectField(payload, "size")
	if !ok {
		t.Fatalf("expected created terminal size payload, got %#v", payload)
	}
	if width, ok := size["width"].(float64); !ok || width != 250 {
		t.Fatalf("expected terminal width 250, got %#v", size["width"])
	}
	if height, ok := size["height"].(float64); !ok || height != 150 {
		t.Fatalf("expected terminal height 150, got %#v", size["height"])
	}
}

func TestProjectCreateTopLevelSectionSeedsStateMachineDefaults(t *testing.T) {
	t.Parallel()

	cases := []struct {
		implType     string
		wantLabel    string
		wantGateType string
		wantHeight   float64
	}{
		{
			implType:   "StateMachineStart",
			wantLabel:  "Start",
			wantHeight: 96,
		},
		{
			implType:     "StateMachineGate",
			wantGateType: string(StateMachineGateTypeAND),
			wantHeight:   120,
		},
		{
			implType:   "StateMachineEnd",
			wantLabel:  "End",
			wantHeight: 96,
		},
	}

	for _, tc := range cases {
		project := testCreateTopLevelSectionProject(t)

		result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
			ImplType: tc.implType,
		}, defaultAutoLayoutSectionSizingPolicy())
		if err != nil {
			t.Fatalf("create %s top level section: %v", tc.implType, err)
		}

		payload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
		if err != nil {
			t.Fatalf("effective %s payload: %v", tc.implType, err)
		}
		if got := payloadStringField(payload, "type"); got != tc.implType {
			t.Fatalf("expected created type %q, got %q", tc.implType, got)
		}
		if got := payloadStringField(payload, "machineGroupId"); got == "" {
			t.Fatalf("expected created %s machineGroupId, got empty payload %#v", tc.implType, payload)
		}
		if tc.wantLabel != "" {
			if got := payloadStringField(payload, "label"); got != tc.wantLabel {
				t.Fatalf("expected created %s label %q, got %q", tc.implType, tc.wantLabel, got)
			}
		}
		if tc.wantGateType != "" {
			if got := payloadStringField(payload, "gateType"); got != tc.wantGateType {
				t.Fatalf("expected created %s gateType %q, got %q", tc.implType, tc.wantGateType, got)
			}
		}
		size, ok := payloadObjectField(payload, "size")
		if !ok {
			t.Fatalf("expected created %s size payload, got %#v", tc.implType, payload)
		}
		if width, ok := size["width"].(float64); !ok || width != 240 {
			t.Fatalf("expected %s width 240, got %#v", tc.implType, size["width"])
		}
		if height, ok := size["height"].(float64); !ok || height != tc.wantHeight {
			t.Fatalf("expected %s height %.0f, got %#v", tc.implType, tc.wantHeight, size["height"])
		}
	}
}

func TestProjectCreateTopLevelSectionAppliesLayoutSnapshotViewportPlacementAndInitialName(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)
	project.ActiveViewModeID = "focus"
	name := "Planning Chat"

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "Chat",
		Name:     &name,
		TopLevelSections: map[string]TopLevelSectionLayout{
			"existing-section": {
				X:      820,
				Y:      220,
				ZIndex: 8,
			},
		},
		ViewportBounds: &ViewportBounds{
			X: 760,
			Y: 160,
			W: 1200,
			H: 700,
		},
	}, defaultAutoLayoutSectionSizingPolicy())
	if err != nil {
		t.Fatalf("create top level section with snapshot placement: %v", err)
	}

	created, ok := project.Sections[result.SectionID]
	if !ok {
		t.Fatalf("expected created section in project state, got %#v", project.Sections)
	}
	if created.Name != name {
		t.Fatalf("expected created section name %q, got %#v", name, created)
	}
	if result.PanTo != nil {
		t.Fatalf("expected in-viewport placement without pan hint, got %#v", result.PanTo)
	}

	layout, ok := project.TopLevelSections[result.SectionID]
	if !ok {
		t.Fatalf("expected created layout, got %#v", project.TopLevelSections)
	}
	if layout.X <= 400 {
		t.Fatalf("expected snapshot-aware placement near the live viewport, got %#v", layout)
	}
	if layout.X < 760 || layout.Y < 160 {
		t.Fatalf("expected created layout inside the provided viewport bounds, got %#v", layout)
	}

	existingLayout := project.TopLevelSections["existing-section"]
	if existingLayout.X != 820 || existingLayout.Y != 220 || existingLayout.ZIndex != 8 {
		t.Fatalf("expected active layout snapshot to update existing section, got %#v", existingLayout)
	}
	activeViewMode := project.ViewModes["focus"]
	if activeViewMode.TopLevelSections["existing-section"].X != 820 || activeViewMode.TopLevelSections["existing-section"].Y != 220 {
		t.Fatalf("expected active view mode layout snapshot update, got %#v", activeViewMode.TopLevelSections["existing-section"])
	}
	if project.ViewModes["secondary"].TopLevelSections["existing-section"].X != 40 || project.ViewModes["secondary"].TopLevelSections["existing-section"].Y != 50 {
		t.Fatalf("expected inactive view mode layout to remain unchanged, got %#v", project.ViewModes["secondary"].TopLevelSections["existing-section"])
	}
}

func TestProjectCreateTopLevelSectionDoesNotPersistPartialStateWhenInitialNameValidationFails(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)
	before := project.Clone()
	name := "Existing"

	_, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "Chat",
		Name:     &name,
	}, defaultAutoLayoutSectionSizingPolicy())
	if !IsInvalidSectionNameError(err) {
		t.Fatalf("expected InvalidSectionNameError, got %v", err)
	}
	if len(project.Sections) != len(before.Sections) {
		t.Fatalf("expected section count to remain unchanged, got %d want %d", len(project.Sections), len(before.Sections))
	}
	if len(project.TopLevelSections) != len(before.TopLevelSections) {
		t.Fatalf("expected top-level layouts to remain unchanged, got %#v want %#v", project.TopLevelSections, before.TopLevelSections)
	}
	if len(project.TopLevelSectionIDs) != len(before.TopLevelSectionIDs) {
		t.Fatalf("expected top-level ids to remain unchanged, got %#v want %#v", project.TopLevelSectionIDs, before.TopLevelSectionIDs)
	}
	if len(project.SectionVariantMap) != len(before.SectionVariantMap) {
		t.Fatalf("expected section variant map to remain unchanged, got %#v want %#v", project.SectionVariantMap, before.SectionVariantMap)
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

func TestProjectCreateTopLevelSectionAcceptsPluginCodeLanguage(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "Code",
		ImplOverrides: map[string]any{
			"type":         "Code",
			"codeLanguage": "FixtureDSL",
		},
	}, defaultAutoLayoutSectionSizingPolicy())
	if err != nil {
		t.Fatalf("create plugin language code section: %v", err)
	}

	_, _, impl, err := project.ResolveSection(result.SectionID)
	if err != nil {
		t.Fatalf("resolve created code section: %v", err)
	}
	if !impl.IsCode() || impl.Code == nil {
		t.Fatalf("expected code section impl, got %#v", impl)
	}
	if impl.Code.Language != CodeLanguage("fixturedsl") {
		t.Fatalf("expected normalized plugin code language, got %q", impl.Code.Language)
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
