package projectstate

import "testing"

type generatedBaseCodeSectionTestSpec struct {
	name        string
	sectionType string
	kind        GeneratedSectionKind
}

func generatedBaseCodeSectionTestSpecs() []generatedBaseCodeSectionTestSpec {
	return []generatedBaseCodeSectionTestSpec{
		{
			name:        "generated python code",
			sectionType: "GenPythonCode",
			kind:        GeneratedSectionKindPythonCode,
		},
		{
			name:        "generated python metadata",
			sectionType: "GenPythonMetadata",
			kind:        GeneratedSectionKindPythonMetadata,
		},
	}
}

func newGeneratedBaseCodeSectionDocument(t *testing.T, spec generatedBaseCodeSectionTestSpec) Document {
	t.Helper()

	project, err := Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		TopLevelSectionIDs: []string{
			"generated-section",
			"terminal-section",
			"text-section",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"generated-section": {X: 20, Y: 40, ZIndex: 0},
			"terminal-section":  {X: 900, Y: 120, ZIndex: 1},
			"text-section":      {X: 1100, Y: 40, ZIndex: 2},
		},
		ViewModes: map[string]ViewMode{
			"focus": {
				ID:   "focus",
				Name: "Focus",
				VisibilityBySectionID: map[string]bool{
					"generated-section": true,
					"terminal-section":  true,
					"text-section":      true,
				},
				TopLevelSections: map[string]TopLevelSectionLayout{
					"generated-section": {X: 20, Y: 40, ZIndex: 0},
					"terminal-section":  {X: 900, Y: 120, ZIndex: 1},
					"text-section":      {X: 1100, Y: 40, ZIndex: 2},
				},
			},
		},
		SectionVariantMap: map[string]string{
			"generated-section": "generated-variant",
			"terminal-section":  "terminal-variant",
			"text-section":      "text-variant",
		},
		Sections: map[string]Section{
			"generated-section": {
				ID:               "generated-section",
				Name:             spec.name,
				VariantIDs:       []string{"generated-variant"},
				DefaultVariantID: "generated-variant",
			},
			"terminal-section": {
				ID:               "terminal-section",
				Name:             "Terminal",
				VariantIDs:       []string{"terminal-variant"},
				DefaultVariantID: "terminal-variant",
			},
			"text-section": {
				ID:               "text-section",
				Name:             "Text Block",
				VariantIDs:       []string{"text-variant"},
				DefaultVariantID: "text-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"generated-variant": {ID: "generated-variant", ImplID: "generated-impl"},
			"terminal-variant":  {ID: "terminal-variant", ImplID: "terminal-impl"},
			"text-variant":      {ID: "text-variant", ImplID: "text-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"generated-impl": {
				ID:   "generated-impl",
				Kind: SectionKindGenerated,
				Generated: &GeneratedSectionImpl{
					Kind: spec.kind,
				},
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "generated-impl",
					"type":     spec.sectionType,
					"children": []string{},
					"size": map[string]any{
						"width":  640.0,
						"height": 100.0,
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
						"width":  300.0,
						"height": "auto",
					},
				}),
			},
			"text-impl": {
				ID:      "text-impl",
				Kind:    SectionKind("textblock"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "text-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize generated base-code test project: %v", err)
	}

	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
}

func newGeneratedBaseCodeSectionProject(t *testing.T, spec generatedBaseCodeSectionTestSpec) Project {
	t.Helper()
	return newGeneratedBaseCodeSectionDocument(t, spec).Projects["project-alpha"]
}
