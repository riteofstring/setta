package projectstate

import (
	"context"
	"math"
	"testing"
)

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
	codePayload, err := effectiveSectionPayload(project, "code-section", "code-variant")
	if err != nil {
		t.Fatalf("code payload after code resize: %v", err)
	}
	codeSize, ok := payloadObjectField(codePayload, "size")
	if !ok {
		t.Fatalf("expected code size payload after code resize, got %#v", codePayload)
	}
	codeWidth, isAuto, present, err := payloadAutoLayoutSizeValue(codeSize, "width")
	if err != nil {
		t.Fatalf("parse code width after code resize: %v", err)
	}
	if !present || isAuto || codeWidth != 600 {
		t.Fatalf("expected code width 600 after code resize, got present=%v auto=%v width=%v payload=%#v", present, isAuto, codeWidth, codeSize)
	}
	codeHeight, isAuto, present, err := payloadAutoLayoutSizeValue(codeSize, "height")
	if err != nil {
		t.Fatalf("parse code height after code resize: %v", err)
	}
	if !present || isAuto || codeHeight != 238.2 {
		t.Fatalf("expected embedded code height 238.2 after code resize, got present=%v auto=%v height=%v payload=%#v", present, isAuto, codeHeight, codeSize)
	}

	terminalPayload, err := effectiveSectionPayload(project, "terminal-section", "terminal-variant")
	if err != nil {
		t.Fatalf("terminal payload after code resize: %v", err)
	}
	terminalSize, ok := payloadObjectField(terminalPayload, "size")
	if !ok {
		t.Fatalf("expected terminal size payload after code resize, got %#v", terminalPayload)
	}
	terminalWidth, isAuto, present, err := payloadAutoLayoutSizeValue(terminalSize, "width")
	if err != nil {
		t.Fatalf("parse terminal width after code resize: %v", err)
	}
	if !present || isAuto || terminalWidth != 600 {
		t.Fatalf("expected terminal width 600 after code resize, got present=%v auto=%v width=%v payload=%#v", present, isAuto, terminalWidth, terminalSize)
	}

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
	codePayload, err = effectiveSectionPayload(project, "code-section", "code-variant")
	if err != nil {
		t.Fatalf("code payload after terminal resize: %v", err)
	}
	codeSize, ok = payloadObjectField(codePayload, "size")
	if !ok {
		t.Fatalf("expected code size payload after terminal resize, got %#v", codePayload)
	}
	codeWidth, isAuto, present, err = payloadAutoLayoutSizeValue(codeSize, "width")
	if err != nil {
		t.Fatalf("parse code width after terminal resize: %v", err)
	}
	if !present || isAuto || codeWidth != 510 {
		t.Fatalf("expected code width 510 after terminal resize, got present=%v auto=%v width=%v payload=%#v", present, isAuto, codeWidth, codeSize)
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
