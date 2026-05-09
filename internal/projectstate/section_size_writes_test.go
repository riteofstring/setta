package projectstate

import (
	"context"
	"encoding/json"
	"math"
	"testing"
)

func TestSectionSizeJSONUsesFrontendPayloadShape(t *testing.T) {
	t.Parallel()

	value := SectionSize{
		Width:  FixedSectionSizeValue(250),
		Height: AutoSectionSizeValue(),
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal section size: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatalf("decode marshaled section size: %v", err)
	}
	if got := payload["width"]; got != 250.0 {
		t.Fatalf("expected width payload 250, got %#v", got)
	}
	if got := payload["height"]; got != string(SectionSizeModeAuto) {
		t.Fatalf("expected height payload %q, got %#v", SectionSizeModeAuto, got)
	}

	var decoded SectionSize
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal section size: %v", err)
	}
	if decoded.Width.Auto || decoded.Width.Value != 250 {
		t.Fatalf("expected fixed width 250, got %#v", decoded.Width)
	}
	if !decoded.Height.Auto || decoded.Height.Value != 0 {
		t.Fatalf("expected auto height, got %#v", decoded.Height)
	}
}

func TestRuntimeSetSectionSizesNormalizesPolicyBounds(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newSectionSizeWriteTestDocument())
	settings := testStructuralMutationSettings(map[string]AutoLayoutSectionMinDimensions{
		"Chart": {
			MinWidth:  150,
			MinHeight: 100,
			MaxWidth:  250,
			MaxHeight: 200,
		},
	})

	snapshot, err := runtime.SetSectionSizes(context.Background(), "project-alpha", map[string]SectionSize{
		"chart-section": {
			Width:  FixedSectionSizeValue(10),
			Height: FixedSectionSizeValue(300),
		},
	}, settings)
	if err != nil {
		t.Fatalf("SetSectionSizes returned error: %v", err)
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2 after resizing chart section, got %d", snapshot.Revision)
	}

	project := snapshot.Document.Projects["project-alpha"]
	chartPayload, err := effectiveSectionPayload(project, "chart-section", "chart-variant")
	if err != nil {
		t.Fatalf("chart payload: %v", err)
	}
	size, ok := payloadObjectField(chartPayload, "size")
	if !ok {
		t.Fatalf("expected chart size payload, got %#v", chartPayload)
	}
	width, isAuto, present, err := payloadAutoLayoutSizeValue(size, "width")
	if err != nil {
		t.Fatalf("parse chart width: %v", err)
	}
	if !present || isAuto || width != 150 {
		t.Fatalf("expected clamped chart width 150, got present=%v auto=%v width=%v payload=%#v", present, isAuto, width, size)
	}
	height, isAuto, present, err := payloadAutoLayoutSizeValue(size, "height")
	if err != nil {
		t.Fatalf("parse chart height: %v", err)
	}
	if !present || isAuto || height != 200 {
		t.Fatalf("expected clamped chart height 200, got present=%v auto=%v height=%v payload=%#v", present, isAuto, height, size)
	}
}

func TestRuntimeSetSectionSizesPreservesAutoAndRejectsNonFiniteValues(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newSectionSizeWriteTestDocument())
	settings := testStructuralMutationSettings(map[string]AutoLayoutSectionMinDimensions{
		"Chart": {
			MinWidth:  150,
			MinHeight: 100,
			MaxWidth:  250,
			MaxHeight: 200,
		},
	})

	if _, err := runtime.SetSectionSizes(context.Background(), "project-alpha", map[string]SectionSize{
		"chart-section": {
			Width:  AutoSectionSizeValue(),
			Height: FixedSectionSizeValue(120),
		},
	}, settings); err != nil {
		t.Fatalf("SetSectionSizes auto width returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	chartPayload, err := effectiveSectionPayload(project, "chart-section", "chart-variant")
	if err != nil {
		t.Fatalf("chart payload after auto width: %v", err)
	}
	size, ok := payloadObjectField(chartPayload, "size")
	if !ok {
		t.Fatalf("expected chart size payload after auto width, got %#v", chartPayload)
	}
	_, isAuto, present, err := payloadAutoLayoutSizeValue(size, "width")
	if err != nil {
		t.Fatalf("parse chart auto width: %v", err)
	}
	if !present || !isAuto {
		t.Fatalf("expected chart width to stay auto, got present=%v auto=%v payload=%#v", present, isAuto, size)
	}

	_, err = runtime.SetSectionSizes(context.Background(), "project-alpha", map[string]SectionSize{
		"chart-section": {
			Width:  FixedSectionSizeValue(math.NaN()),
			Height: FixedSectionSizeValue(120),
		},
	}, settings)
	if !IsInvalidAutoLayoutError(err) {
		t.Fatalf("expected InvalidAutoLayoutError for non-finite width, got %v", err)
	}
}

func TestRuntimeSetSectionSizesKeepsEmbeddedCodeAndTerminalWidthsInLockstep(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newSectionSizeWriteTestDocument())

	firstSnapshot, err := runtime.SetSectionSizes(context.Background(), "project-alpha", map[string]SectionSize{
		"code-section": {
			Width:  FixedSectionSizeValue(600),
			Height: FixedSectionSizeValue(120),
		},
	}, DefaultStructuralMutationSettings())
	if err != nil {
		t.Fatalf("SetSectionSizes code resize returned error: %v", err)
	}

	project := firstSnapshot.Document.Projects["project-alpha"]
	assertSectionFixedSizeValue(t, project, "code-section", "code-variant", "width", 600, "after code resize")
	assertSectionFixedSizeValue(t, project, "code-section", "code-variant", "height", 238.2, "after code resize")
	assertSectionFixedSizeValue(t, project, "terminal-section", "terminal-variant", "width", 600, "after code resize")

	secondSnapshot, err := runtime.SetSectionSizes(context.Background(), "project-alpha", map[string]SectionSize{
		"terminal-section": {
			Width:  FixedSectionSizeValue(510),
			Height: FixedSectionSizeValue(160),
		},
	}, DefaultStructuralMutationSettings())
	if err != nil {
		t.Fatalf("SetSectionSizes terminal resize returned error: %v", err)
	}

	project = secondSnapshot.Document.Projects["project-alpha"]
	assertSectionFixedSizeValue(t, project, "code-section", "code-variant", "width", 510, "after terminal resize")
}

func assertSectionFixedSizeValue(
	t *testing.T,
	project Project,
	sectionID string,
	variantID string,
	field string,
	want float64,
	contextLabel string,
) {
	t.Helper()

	payload, err := effectiveSectionPayload(project, sectionID, variantID)
	if err != nil {
		t.Fatalf("%s payload %s: %v", sectionID, contextLabel, err)
	}
	size, ok := payloadObjectField(payload, "size")
	if !ok {
		t.Fatalf("expected %s size payload %s, got %#v", sectionID, contextLabel, payload)
	}
	got, isAuto, present, err := payloadAutoLayoutSizeValue(size, field)
	if err != nil {
		t.Fatalf("parse %s %s %s: %v", sectionID, field, contextLabel, err)
	}
	if !present || isAuto || got != want {
		t.Fatalf("expected %s %s %v %s, got present=%v auto=%v value=%v payload=%#v", sectionID, field, want, contextLabel, present, isAuto, got, size)
	}
}

func TestRuntimeSetSectionSizesRejectsConflictingEmbeddedWidths(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newSectionSizeWriteTestDocument())

	_, err := runtime.SetSectionSizes(context.Background(), "project-alpha", map[string]SectionSize{
		"code-section": {
			Width:  FixedSectionSizeValue(600),
			Height: FixedSectionSizeValue(240),
		},
		"terminal-section": {
			Width:  FixedSectionSizeValue(500),
			Height: FixedSectionSizeValue(160),
		},
	}, DefaultStructuralMutationSettings())
	if !IsInvalidAutoLayoutError(err) {
		t.Fatalf("expected InvalidAutoLayoutError for conflicting embedded widths, got %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	codePayload, payloadErr := effectiveSectionPayload(project, "code-section", "code-variant")
	if payloadErr != nil {
		t.Fatalf("code payload after conflicting resize: %v", payloadErr)
	}
	codeSize, ok := payloadObjectField(codePayload, "size")
	if !ok {
		t.Fatalf("expected code size payload after conflicting resize, got %#v", codePayload)
	}
	codeWidth, _, _, parseErr := payloadAutoLayoutSizeValue(codeSize, "width")
	if parseErr != nil {
		t.Fatalf("parse code width after conflicting resize: %v", parseErr)
	}
	if codeWidth != 420 {
		t.Fatalf("expected conflicting write to leave code width unchanged at 420, got %v", codeWidth)
	}
}

func newSectionSizeWriteTestDocument() Document {
	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				EntryCodeBlockID: "code-section",
				ActiveViewModeID: "focus",
				TopLevelSectionIDs: []string{
					"code-section",
					"chart-section",
				},
				TopLevelSections: map[string]TopLevelSectionLayout{
					"code-section":  {X: 20, Y: 40, ZIndex: 0},
					"chart-section": {X: 900, Y: 120, ZIndex: 1},
				},
				ViewModes: map[string]ViewMode{
					"focus": {
						ID:   "focus",
						Name: "Focus",
						VisibilityBySectionID: map[string]bool{
							"code-section":  true,
							"chart-section": true,
						},
						TopLevelSections: map[string]TopLevelSectionLayout{
							"code-section":  {X: 20, Y: 40, ZIndex: 0},
							"chart-section": {X: 900, Y: 120, ZIndex: 1},
						},
					},
				},
				SectionVariantMap: map[string]string{
					"code-section":     "code-variant",
					"terminal-section": "terminal-variant",
					"chart-section":    "chart-variant",
				},
				Sections: map[string]Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Code",
						VariantIDs:       []string{"code-variant"},
						DefaultVariantID: "code-variant",
					},
					"terminal-section": {
						ID:               "terminal-section",
						Name:             "Terminal",
						ParentSectionID:  "code-section",
						VariantIDs:       []string{"terminal-variant"},
						DefaultVariantID: "terminal-variant",
					},
					"chart-section": {
						ID:               "chart-section",
						Name:             "Chart",
						VariantIDs:       []string{"chart-variant"},
						DefaultVariantID: "chart-variant",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"code-variant":     {ID: "code-variant", ImplID: "code-impl"},
					"terminal-variant": {ID: "terminal-variant", ImplID: "terminal-impl"},
					"chart-variant":    {ID: "chart-variant", ImplID: "chart-impl"},
				},
				SectionImpls: map[string]SectionImpl{
					"code-impl": {
						ID:   "code-impl",
						Kind: SectionKindCode,
						Code: &CodeSectionImpl{
							Language:                  CodeLanguagePython,
							AttachedTerminalSectionID: "terminal-section",
							Children:                  []string{"terminal-section"},
						},
						Payload: mustMarshalProjectObject(map[string]any{
							"id":                        "code-impl",
							"type":                      "Code",
							"codeLanguage":              "python",
							"attachedTerminalSectionId": "terminal-section",
							"children":                  []string{"terminal-section"},
							"size": map[string]any{
								"width":  420.0,
								"height": 180.0,
							},
						}),
					},
					"terminal-impl": {
						ID:       "terminal-impl",
						Kind:     SectionKindTerminal,
						Terminal: &TerminalSectionImpl{},
						Payload: mustMarshalProjectObject(map[string]any{
							"id":   "terminal-impl",
							"type": "Terminal",
							"size": map[string]any{
								"width":  420.0,
								"height": 160.0,
							},
						}),
					},
					"chart-impl": {
						ID:      "chart-impl",
						Kind:    SectionKind("chart"),
						Payload: mustMarshalProjectObject(map[string]any{"id": "chart-impl", "type": "Chart", "size": map[string]any{"width": 180.0, "height": 180.0}}),
					},
				},
			},
		},
	}
}

func TestNormalizeSectionSizeValueRejectsNonFiniteValues(t *testing.T) {
	t.Parallel()

	_, err := normalizeSectionSizeValue("chart-section", "width", FixedSectionSizeValue(math.Inf(1)), 0, 100)
	if !IsInvalidAutoLayoutError(err) {
		t.Fatalf("expected InvalidAutoLayoutError, got %v", err)
	}
}
