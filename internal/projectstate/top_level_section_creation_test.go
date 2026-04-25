package projectstate

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

func TestProjectCreateTopLevelSectionPrunesStaleLayoutStateAndUsesDeterministicPlacement(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "Dict",
	}, DefaultStructuralMutationSettings())
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
	if layout.X != 10 || layout.Y != 194 {
		t.Fatalf("expected deterministic placement {10 194}, got %#v", layout)
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
	} else {
		activeVariantID := project.SectionVariantMap[result.SectionID]
		createdVariant := project.SectionVariants[activeVariantID]
		if createdVariant.Name != createdSection.Name {
			t.Fatalf(
				"expected created default variant name %q to match section name, got %q",
				createdSection.Name,
				createdVariant.Name,
			)
		}
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
	}, DefaultStructuralMutationSettings())
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

func TestProjectCreateTopLevelSectionSeedsIFrameCodeDefault(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "IFrame",
	}, DefaultStructuralMutationSettings())
	if err != nil {
		t.Fatalf("create iframe top level section: %v", err)
	}

	payload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
	if err != nil {
		t.Fatalf("effective iframe payload: %v", err)
	}
	if got := payloadStringField(payload, "code"); got != "" {
		t.Fatalf("expected iframe code default to be empty string, got %q", got)
	}
}

func TestProjectCreateTopLevelSectionReturnsPanHintWhenViewportTooNarrow(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: "Alpha",
	}

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "TextBlock",
		ImplOverrides: map[string]any{
			"size": map[string]any{
				"width":  160.0,
				"height": 100.0,
			},
		},
		ViewportBounds: &ViewportBounds{
			X: 0,
			Y: 0,
			W: 100,
			H: 240,
		},
	}, DefaultStructuralMutationSettings())
	if err != nil {
		t.Fatalf("create top level section with narrow viewport: %v", err)
	}

	layout, ok := project.TopLevelSections[result.SectionID]
	if !ok {
		t.Fatalf("expected created layout, got %#v", project.TopLevelSections)
	}
	if layout.X != 124 || layout.Y != 24 {
		t.Fatalf("expected viewport-adjacent placement {124 24}, got %#v", layout)
	}
	if result.PanTo == nil {
		t.Fatal("expected pan hint when viewport is too narrow")
	}
	if result.PanTo.X != 224 || result.PanTo.Y != 74 {
		t.Fatalf("expected pan hint {224 74}, got %#v", result.PanTo)
	}
}

func TestProjectCreateTopLevelSectionUsesSettingsBackedTerminalSizeDefaults(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)
	settings := DefaultStructuralMutationSettings()
	settings.SectionDefaultsByType["Terminal"] = map[string]any{
		"size": map[string]any{
			"width":  720.0,
			"height": 220.0,
		},
	}

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "Terminal",
	}, settings)
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
	if width, ok := size["width"].(float64); !ok || width != 720 {
		t.Fatalf("expected terminal width 720, got %#v", size["width"])
	}
	if height, ok := size["height"].(float64); !ok || height != 220 {
		t.Fatalf("expected terminal height 220, got %#v", size["height"])
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
		}, DefaultStructuralMutationSettings())
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

func TestProjectCreateTopLevelSectionDefaultSizesMeetPolicyMinimums(t *testing.T) {
	t.Parallel()

	policy := defaultAutoLayoutSectionSizingPolicy()
	for _, implType := range []string{
		"Chart",
		"Draw",
		"Chat",
		"StateMachineStart",
		"StateMachineGate",
		"StateMachineEnd",
	} {
		project := testCreateTopLevelSectionProject(t)

		result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
			ImplType: implType,
		}, DefaultStructuralMutationSettings())
		if err != nil {
			t.Fatalf("create %s top level section: %v", implType, err)
		}

		payload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
		if err != nil {
			t.Fatalf("effective %s payload: %v", implType, err)
		}
		size, ok := payloadObjectField(payload, "size")
		if !ok {
			t.Fatalf("expected created %s size payload, got %#v", implType, payload)
		}

		width, ok := size["width"].(float64)
		if !ok {
			t.Fatalf("expected created %s width to be numeric, got %#v", implType, size["width"])
		}
		height, ok := size["height"].(float64)
		if !ok {
			t.Fatalf("expected created %s height to be numeric, got %#v", implType, size["height"])
		}

		mins, ok := policy.ByType[implType]
		if !ok {
			t.Fatalf("expected default sizing policy entry for %s", implType)
		}
		if width < mins.MinWidth {
			t.Fatalf("expected created %s width %.1f to meet min width %.1f", implType, width, mins.MinWidth)
		}
		if height < mins.MinHeight {
			t.Fatalf("expected created %s height %.1f to meet min height %.1f", implType, height, mins.MinHeight)
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
	}, DefaultStructuralMutationSettings())
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

// Formerly menu-backed section types should create with the payload defaults the frontend expects.
func TestProjectCreateTopLevelSectionSupportsExpandedSectionTypes(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name          string
		implType      string
		implOverrides map[string]any
		assert        func(*testing.T, Project, CreateTopLevelSectionResult, map[string]any, SectionImpl)
	}{
		{
			name:     "callable",
			implType: "Callable",
			assert: func(t *testing.T, project Project, result CreateTopLevelSectionResult, payload map[string]any, impl SectionImpl) {
				t.Helper()
				if got := payloadStringField(payload, "type"); got != "Callable" {
					t.Fatalf("expected Callable payload type, got %q", got)
				}
				if got := payloadRawStringField(payload, "paramFilter"); got != "" {
					t.Fatalf("expected empty paramFilter, got %q", got)
				}
				if got := payload["callable"]; got != nil {
					t.Fatalf("expected nil callable target, got %#v", got)
				}
				if !reflect.DeepEqual(payload["pinnedParams"], []any{}) {
					t.Fatalf("expected empty pinned params, got %#v", payload["pinnedParams"])
				}
			},
		},
		{
			name:     "list root",
			implType: "ListRoot",
			assert: func(t *testing.T, project Project, result CreateTopLevelSectionResult, payload map[string]any, impl SectionImpl) {
				t.Helper()
				if got := payloadStringField(payload, "defaultChildSectionType"); got != "Callable" {
					t.Fatalf("expected default child Callable, got %q", got)
				}
				if got := payloadStringField(payload, "viewMode"); got != "default" {
					t.Fatalf("expected default view mode, got %q", got)
				}
				if !reflect.DeepEqual(payload["children"], []any{}) {
					t.Fatalf("expected empty children array, got %#v", payload["children"])
				}
			},
		},
		{
			name:     "draw",
			implType: "Draw",
			assert: func(t *testing.T, project Project, result CreateTopLevelSectionResult, payload map[string]any, impl SectionImpl) {
				t.Helper()
				if !impl.IsDraw() || impl.Draw == nil {
					t.Fatalf("expected draw impl, got %#v", impl)
				}
				rawLayers, ok := payload["layers"].([]any)
				if !ok || len(rawLayers) != 1 {
					t.Fatalf("expected one seeded draw layer, got %#v", payload["layers"])
				}
				layer, ok := rawLayers[0].(map[string]any)
				if !ok {
					t.Fatalf("expected draw layer object, got %#v", rawLayers[0])
				}
				if got := payloadRawStringField(layer, "name"); got == "" {
					t.Fatalf("expected seeded draw layer name, got %#v", layer)
				}
				if !payloadBoolField(layer, "visible") {
					t.Fatalf("expected seeded draw layer to be visible, got %#v", layer)
				}
			},
		},
		{
			name:     "browser",
			implType: "Browser",
			assert: func(t *testing.T, project Project, result CreateTopLevelSectionResult, payload map[string]any, impl SectionImpl) {
				t.Helper()
				if got := payloadStringField(payload, "viewMode"); got != string(BrowserAreaViewModeList) {
					t.Fatalf("expected browser view mode %q, got %q", BrowserAreaViewModeList, got)
				}
				size, ok := payloadObjectField(payload, "size")
				if !ok {
					t.Fatalf("expected browser size object, got %#v", payload["size"])
				}
				if width, ok := size["width"].(float64); !ok || width != 720 {
					t.Fatalf("expected browser width 720, got %#v", size["width"])
				}
				if height, ok := size["height"].(float64); !ok || height != 460 {
					t.Fatalf("expected browser height 460, got %#v", size["height"])
				}
			},
		},
		{
			name:     "generated python",
			implType: "GenPythonCode",
			assert: func(t *testing.T, project Project, result CreateTopLevelSectionResult, payload map[string]any, impl SectionImpl) {
				t.Helper()
				if !impl.IsGenerated() || impl.Generated == nil || impl.Generated.Kind != GeneratedSectionKindPythonCode {
					t.Fatalf("expected generated python impl, got %#v", impl)
				}
				if got := payloadStringField(payload, "type"); got != "GenPythonCode" {
					t.Fatalf("expected generated python payload type, got %q", got)
				}
				size, ok := payloadObjectField(payload, "size")
				if !ok {
					t.Fatalf("expected generated python size object, got %#v", payload["size"])
				}
				if width, ok := size["width"].(float64); !ok || width != 500 {
					t.Fatalf("expected generated python width 500, got %#v", size["width"])
				}
			},
		},
		{
			name:     "plugin",
			implType: "Plugin",
			implOverrides: map[string]any{
				"pluginId": "acme.plugin",
				"kind":     "inspector",
				"data": map[string]any{
					"mode": "compact",
				},
			},
			assert: func(t *testing.T, project Project, result CreateTopLevelSectionResult, payload map[string]any, impl SectionImpl) {
				t.Helper()
				if got := payloadStringField(payload, "pluginId"); got != "acme.plugin" {
					t.Fatalf("expected pluginId acme.plugin, got %q", got)
				}
				if got := payloadStringField(payload, "kind"); got != "inspector" {
					t.Fatalf("expected plugin kind inspector, got %q", got)
				}
				data, ok := payloadObjectField(payload, "data")
				if !ok {
					t.Fatalf("expected plugin data object, got %#v", payload["data"])
				}
				if got := payloadRawStringField(data, "mode"); got != "compact" {
					t.Fatalf("expected plugin data.mode compact, got %q", got)
				}
			},
		},
		{
			name:     "spreadsheet",
			implType: "Spreadsheet",
			assert: func(t *testing.T, project Project, result CreateTopLevelSectionResult, payload map[string]any, impl SectionImpl) {
				t.Helper()
				if got := payloadStringField(payload, "density"); got != string(SpreadsheetGridDensityCompact) {
					t.Fatalf("expected spreadsheet density %q, got %q", SpreadsheetGridDensityCompact, got)
				}
				if !payloadBoolField(payload, "showRowNumbers") {
					t.Fatalf("expected spreadsheet row numbers enabled, got %#v", payload)
				}
			},
		},
	}

	for _, tc := range testCases {
		project := testCreateTopLevelSectionProject(t)

		result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
			ImplType:      tc.implType,
			ImplOverrides: tc.implOverrides,
		}, DefaultStructuralMutationSettings())
		if err != nil {
			t.Fatalf("create %s top level section: %v", tc.name, err)
		}

		payload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
		if err != nil {
			t.Fatalf("effective %s payload: %v", tc.name, err)
		}
		_, _, impl, err := project.ResolveSection(result.SectionID)
		if err != nil {
			t.Fatalf("resolve %s section: %v", tc.name, err)
		}

		tc.assert(t, project, result, payload, impl)
	}
}

// Top-level meta controls should accept the same control types and defaults as change_param_impl.
func TestProjectCreateTopLevelSectionSupportsExpandedMetaControlTypes(t *testing.T) {
	t.Parallel()

	stringPtr := func(value string) *string {
		return &value
	}
	testCases := []struct {
		name            string
		controlCodeType *string
		expectedType    string
		assert          func(*testing.T, map[string]any)
	}{
		{
			name:            "default omitted",
			controlCodeType: nil,
			expectedType:    "SliderParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payload["min"]; got != float64(0) {
					t.Fatalf("expected slider min 0, got %#v", got)
				}
				if got := payload["max"]; got != float64(100) {
					t.Fatalf("expected slider max 100, got %#v", got)
				}
				if got := payloadRawStringField(payload, "value"); got != "0" {
					t.Fatalf("expected slider default value 0, got %q", got)
				}
			},
		},
		{
			name:            "code",
			controlCodeType: stringPtr("CodeParam"),
			expectedType:    "CodeParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payloadStringField(payload, "passingStyle"); got != "DEFAULT" {
					t.Fatalf("expected code param passingStyle DEFAULT, got %q", got)
				}
			},
		},
		{
			name:            "text",
			controlCodeType: stringPtr("TextParam"),
			expectedType:    "TextParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payloadStringField(payload, "uiType"); got != "plain" {
					t.Fatalf("expected text param uiType plain, got %q", got)
				}
			},
		},
		{
			name:            "date",
			controlCodeType: stringPtr("DateParam"),
			expectedType:    "DateParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payloadStringField(payload, "dateControlMode"); got != "input" {
					t.Fatalf("expected date control mode input, got %q", got)
				}
				if got := payloadStringField(payload, "dateSelectionMode"); got != "single" {
					t.Fatalf("expected date selection mode single, got %q", got)
				}
			},
		},
		{
			name:            "time",
			controlCodeType: stringPtr("TimeParam"),
			expectedType:    "TimeParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payloadStringField(payload, "timeControlMode"); got != "input" {
					t.Fatalf("expected time control mode input, got %q", got)
				}
				if got := payloadStringField(payload, "timeDisplayFormat"); got != "twenty_four_hour" {
					t.Fatalf("expected time display format twenty_four_hour, got %q", got)
				}
			},
		},
		{
			name:            "text area",
			controlCodeType: stringPtr("TextAreaParam"),
			expectedType:    "TextAreaParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payloadRawStringField(payload, "defaultVal"); got != "" {
					t.Fatalf("expected empty text area defaultVal, got %q", got)
				}
			},
		},
		{
			name:            "slider",
			controlCodeType: stringPtr("SliderParam"),
			expectedType:    "SliderParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payload["step"]; got != float64(1) {
					t.Fatalf("expected slider step 1, got %#v", got)
				}
			},
		},
		{
			name:            "rotary",
			controlCodeType: stringPtr("RotaryParam"),
			expectedType:    "RotaryParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payload["step"]; got != float64(0.1) {
					t.Fatalf("expected rotary step 0.1, got %#v", got)
				}
			},
		},
		{
			name:            "switch",
			controlCodeType: stringPtr("SwitchParam"),
			expectedType:    "SwitchParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payloadRawStringField(payload, "value"); got != "false" {
					t.Fatalf("expected switch default value false, got %q", got)
				}
			},
		},
		{
			name:            "color picker",
			controlCodeType: stringPtr("ColorPickerParam"),
			expectedType:    "ColorPickerParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payloadRawStringField(payload, "value"); got != "#ff0000" {
					t.Fatalf("expected color picker default #ff0000, got %q", got)
				}
			},
		},
		{
			name:            "dropdown",
			controlCodeType: stringPtr("DropdownParam"),
			expectedType:    "DropdownParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if !reflect.DeepEqual(payload["choices"], []any{}) {
					t.Fatalf("expected empty dropdown choices, got %#v", payload["choices"])
				}
			},
		},
		{
			name:            "password",
			controlCodeType: stringPtr("PasswordParam"),
			expectedType:    "PasswordParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got, ok := payload["hasSecret"].(bool); !ok || got {
					t.Fatalf("expected password hasSecret false, got %#v", payload["hasSecret"])
				}
			},
		},
		{
			name:            "button",
			controlCodeType: stringPtr("ButtonParam"),
			expectedType:    "ButtonParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payloadStringField(payload, "actionMode"); got != "WEBSOCKET_LISTENER" {
					t.Fatalf("expected button action mode WEBSOCKET_LISTENER, got %q", got)
				}
				if got := payloadStringField(payload, "requestMethod"); got != "POST" {
					t.Fatalf("expected button request method POST, got %q", got)
				}
			},
		},
		{
			name:            "dropzone",
			controlCodeType: stringPtr("DropzoneParam"),
			expectedType:    "DropzoneParam",
			assert: func(t *testing.T, payload map[string]any) {
				t.Helper()
				if got := payloadStringField(payload, "mode"); got != "STATEFUL" {
					t.Fatalf("expected dropzone mode STATEFUL, got %q", got)
				}
				if got := payloadStringField(payload, "placeholder"); got != "Drop a file here" {
					t.Fatalf("expected dropzone placeholder, got %q", got)
				}
			},
		},
	}

	for _, tc := range testCases {
		project := testCreateTopLevelSectionProject(t)

		input := CreateTopLevelSectionInput{
			ImplType: "MetaControl",
		}
		if tc.controlCodeType != nil {
			input.ControlCodeObjType = tc.controlCodeType
		}
		result, err := project.CreateTopLevelSection(input, DefaultStructuralMutationSettings())
		if err != nil {
			t.Fatalf("create %s meta control section: %v", tc.name, err)
		}
		if result.MetaControlParamID == nil || *result.MetaControlParamID == "" {
			t.Fatalf("expected meta control param id for %s, got %#v", tc.name, result.MetaControlParamID)
		}

		codeObjPayload, _, _, _, err := project.ResolveSectionCodeObject(
			result.SectionID,
			*result.MetaControlParamID,
		)
		if err != nil {
			t.Fatalf("resolve %s meta control code object: %v", tc.name, err)
		}
		if got := payloadStringField(codeObjPayload, "type"); got != tc.expectedType {
			t.Fatalf("expected control type %q, got %q", tc.expectedType, got)
		}

		tc.assert(t, codeObjPayload)
	}
}

// Source create_section seeds fixed core names for singleton/generated families
// before falling back to memorable-name generation for ordinary sections.
func TestProjectCreateTopLevelSectionUsesSourceDefaultNamesForSingletonAndGeneratedTypes(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		implType     string
		expectedName string
	}{
		{implType: "GlobalVariables", expectedName: "Global Variables"},
		{implType: "GenPythonCode", expectedName: "Generated Python Code"},
		{implType: "GenPythonMetadata", expectedName: "Generated Python Metadata"},
		{implType: "StateMachineStart", expectedName: "State Machine Start"},
		{implType: "StateMachineGate", expectedName: "State Machine Gate"},
		{implType: "StateMachineEnd", expectedName: "State Machine End"},
	}

	for _, tc := range testCases {
		project := testCreateTopLevelSectionProject(t)

		result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
			ImplType: tc.implType,
		}, DefaultStructuralMutationSettings())
		if err != nil {
			t.Fatalf("create %s top level section: %v", tc.implType, err)
		}

		createdSection, ok := project.Sections[result.SectionID]
		if !ok {
			t.Fatalf("expected created section %q for %s", result.SectionID, tc.implType)
		}
		if createdSection.Name != tc.expectedName {
			t.Fatalf("expected %s name %q, got %q", tc.implType, tc.expectedName, createdSection.Name)
		}
	}
}

func TestProjectCreateTopLevelSectionAppliesSettingsBackedTaskBoardDefaults(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)
	settings := DefaultStructuralMutationSettings()
	settings.SectionDefaultsByType["TaskBoard"] = map[string]any{
		"viewMode": "task_list",
		"columns":  nil,
	}

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "TaskBoard",
	}, settings)
	if err != nil {
		t.Fatalf("create task board top level section with settings defaults: %v", err)
	}

	payload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
	if err != nil {
		t.Fatalf("effective task board payload: %v", err)
	}
	if got := payloadStringField(payload, "viewMode"); got != string(TaskBoardViewModeTaskList) {
		t.Fatalf("expected task board viewMode %q, got %q", TaskBoardViewModeTaskList, got)
	}
	rawColumns, ok := payload["columns"].([]any)
	if !ok || len(rawColumns) != 3 {
		t.Fatalf("expected seeded task board columns, got %#v", payload["columns"])
	}
	gotNames := make([]string, 0, len(rawColumns))
	for _, rawColumn := range rawColumns {
		column, ok := rawColumn.(map[string]any)
		if !ok {
			t.Fatalf("expected task board column object, got %#v", rawColumn)
		}
		if got := payloadStringField(column, "id"); got == "" {
			t.Fatalf("expected seeded task board column id, got %#v", column)
		}
		gotNames = append(gotNames, payloadStringField(column, "name"))
	}
	if !reflect.DeepEqual(gotNames, []string{"Todo", "Doing", "Done"}) {
		t.Fatalf("expected seeded task board column names, got %#v", gotNames)
	}
}

func TestProjectCreateTopLevelSectionPreservesExplicitEmptyTaskBoardColumnsOverride(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)
	settings := DefaultStructuralMutationSettings()
	settings.SectionDefaultsByType["TaskBoard"] = map[string]any{
		"columns": nil,
	}

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "TaskBoard",
		ImplOverrides: map[string]any{
			"columns": []any{},
		},
	}, settings)
	if err != nil {
		t.Fatalf("create task board top level section with explicit empty columns override: %v", err)
	}

	payload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
	if err != nil {
		t.Fatalf("effective task board payload: %v", err)
	}
	rawColumns, ok := payload["columns"].([]any)
	if !ok {
		t.Fatalf("expected task board columns array, got %#v", payload["columns"])
	}
	if len(rawColumns) != 0 {
		t.Fatalf("expected explicit empty override to suppress default columns, got %#v", rawColumns)
	}
}

func TestProjectCreateTopLevelSectionPreservesExplicitEmptyTaskBoardSettingsColumns(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)
	settings := DefaultStructuralMutationSettings()
	settings.SectionDefaultsByType["TaskBoard"] = map[string]any{
		"viewMode": "task_list",
		"columns":  []any{},
	}

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "TaskBoard",
	}, settings)
	if err != nil {
		t.Fatalf("create task board top level section with explicit empty settings columns: %v", err)
	}

	payload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
	if err != nil {
		t.Fatalf("effective task board payload: %v", err)
	}
	if got := payloadStringField(payload, "viewMode"); got != string(TaskBoardViewModeTaskList) {
		t.Fatalf("expected task board viewMode %q, got %q", TaskBoardViewModeTaskList, got)
	}
	rawColumns, ok := payload["columns"].([]any)
	if !ok {
		t.Fatalf("expected task board columns array, got %#v", payload["columns"])
	}
	if len(rawColumns) != 0 {
		t.Fatalf("expected explicit empty settings columns to remain empty, got %#v", rawColumns)
	}
}

func TestProjectCreateTopLevelSectionAppliesSettingsBackedTextBlockHeadingName(t *testing.T) {
	t.Parallel()

	project := testCreateTopLevelSectionProject(t)
	settings := DefaultStructuralMutationSettings()
	settings.SectionDefaultsByType["TextBlock"] = map[string]any{
		"format":               "Markdown",
		"headingAsSectionName": true,
		"text":                 "# Roadmap\n\nBody",
		"size": map[string]any{
			"height": "auto",
		},
	}

	result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
		ImplType: "TextBlock",
	}, settings)
	if err != nil {
		t.Fatalf("create text block top level section with settings defaults: %v", err)
	}

	created := project.Sections[result.SectionID]
	if created.Name != "Roadmap" {
		t.Fatalf("expected heading-derived section name Roadmap, got %#v", created)
	}

	payload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
	if err != nil {
		t.Fatalf("effective text block payload: %v", err)
	}
	if got := payloadStringField(payload, "format"); got != string(TextBlockFormatMarkdown) {
		t.Fatalf("expected text block format %q, got %q", TextBlockFormatMarkdown, got)
	}
	if !payloadBoolField(payload, "headingAsSectionName") {
		t.Fatalf("expected headingAsSectionName true, got %#v", payload)
	}
	size, ok := payloadObjectField(payload, "size")
	if !ok {
		t.Fatalf("expected text block size payload, got %#v", payload)
	}
	_, isAuto, present, err := payloadAutoLayoutSizeValue(size, "height")
	if err != nil {
		t.Fatalf("parse text block height: %v", err)
	}
	if !present || !isAuto {
		t.Fatalf("expected settings-backed auto text block height, got %#v", size)
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
	}, DefaultStructuralMutationSettings())
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
	}, DefaultStructuralMutationSettings())
	if err == nil || err.Error() == "" {
		t.Fatalf("expected unsupported impl type error, got %v", err)
	}
	if !errors.Is(err, ErrTopLevelSectionImplTypeUnsupported) {
		t.Fatalf("expected ErrTopLevelSectionImplTypeUnsupported, got %v", err)
	}
}

func TestProjectCreateTopLevelSectionSupportsAllRegisteredImplTypes(t *testing.T) {
	t.Parallel()

	for _, implType := range []string{
		"Browser",
		"Callable",
		"Chart",
		"Chat",
		"Code",
		"Dict",
		"Draw",
		"GenPythonCode",
		"GenPythonMetadata",
		"GlobalVariables",
		"Group",
		"IFrame",
		"Image",
		"ListRoot",
		"MetaControl",
		"Plugin",
		"Prompt",
		"Social",
		"Spreadsheet",
		"StateMachineEnd",
		"StateMachineGate",
		"StateMachineStart",
		"TaskBoard",
		"Terminal",
		"TextBlock",
	} {
		project := testCreateTopLevelSectionProject(t)
		result, err := project.CreateTopLevelSection(CreateTopLevelSectionInput{
			ImplType: implType,
		}, DefaultStructuralMutationSettings())
		if err != nil {
			t.Fatalf("create %s top level section: %v", implType, err)
		}
		if result.SectionID == "" {
			t.Fatalf("expected created section id for %s", implType)
		}
	}
}

func TestFrontendSectionImplDefaultValueExposeGoOwnedCodeSectionDefaults(t *testing.T) {
	t.Parallel()

	defaultValue, err := FrontendSectionImplDefaultValue("Code")
	if err != nil {
		t.Fatalf("FrontendSectionImplDefaultValue(Code) error = %v", err)
	}
	defaults, ok := defaultValue.(FrontendCodeSectionImpl)
	if !ok {
		t.Fatalf("expected FrontendCodeSectionImpl, got %T", defaultValue)
	}
	if got := defaults.Type; got != FrontendSectionTypeCode {
		t.Fatalf("expected section type %q, got %#v", FrontendSectionTypeCode, got)
	}
	if got := defaults.Code; got != "" {
		t.Fatalf("expected empty code default, got %#v", got)
	}
	if defaults.CodeFileBinding != nil {
		t.Fatalf("expected nil codeFileBinding default, got %#v", defaults.CodeFileBinding)
	}
	if got := defaults.CodeLanguage; got != "python" {
		t.Fatalf("expected python code language default, got %#v", got)
	}

	_, err = FrontendSectionImplDefaultValue("UnsupportedSection")
	if !errors.Is(err, ErrTopLevelSectionImplTypeUnsupported) {
		t.Fatalf("expected unsupported impl type error, got %v", err)
	}
}

func TestFrontendSectionImplDefaultValueProjectChartUnionDefaults(t *testing.T) {
	t.Parallel()

	defaultValue, err := FrontendSectionImplDefaultValue("Chart")
	if err != nil {
		t.Fatalf("FrontendSectionImplDefaultValue(Chart) error = %v", err)
	}
	defaults, ok := defaultValue.(FrontendChartSectionImpl)
	if !ok {
		t.Fatalf("expected FrontendChartSectionImpl, got %T", defaultValue)
	}
	if got := defaults.Type; got != FrontendSectionTypeChart {
		t.Fatalf("expected section type %q, got %#v", FrontendSectionTypeChart, got)
	}
	chartSettings := chartSettingsPayloadObject(defaults.ChartSettings)
	if got := chartSettings["type"]; got != string(ChartTypeLine) {
		t.Fatalf("expected chart type %q, got %#v", ChartTypeLine, got)
	}
	if _, exists := chartSettings["categoryColumn"]; exists {
		t.Fatalf("did not expect scatter-only categoryColumn in frontend defaults, got %#v", chartSettings["categoryColumn"])
	}
	values, ok := chartSettings["secondYAxisColumns"].([]any)
	if !ok {
		t.Fatalf("expected secondYAxisColumns array, got %#v", chartSettings["secondYAxisColumns"])
	}
	if len(values) != 0 {
		t.Fatalf("expected empty secondYAxisColumns array, got %#v", values)
	}
}

func TestFrontendSectionImplDefaultValueTaskBoardInitializesSlices(t *testing.T) {
	t.Parallel()

	defaultValue, err := FrontendSectionImplDefaultValue("TaskBoard")
	if err != nil {
		t.Fatalf("FrontendSectionImplDefaultValue(TaskBoard) error = %v", err)
	}
	defaults, ok := defaultValue.(FrontendTaskBoardSectionImpl)
	if !ok {
		t.Fatalf("expected FrontendTaskBoardSectionImpl, got %T", defaultValue)
	}
	if defaults.Columns == nil {
		t.Fatal("expected task board columns default to initialize to an empty slice")
	}
	if len(defaults.Columns) != 0 {
		t.Fatalf("expected empty task board columns default, got %#v", defaults.Columns)
	}
	if defaults.Tasks == nil {
		t.Fatal("expected task board tasks default to initialize to an empty slice")
	}
	if len(defaults.Tasks) != 0 {
		t.Fatalf("expected empty task board tasks default, got %#v", defaults.Tasks)
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
	}, DefaultStructuralMutationSettings())
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
