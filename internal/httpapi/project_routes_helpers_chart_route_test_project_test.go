package httpapi

import (
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/projectstate"
)

func chartRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"chart-section": "chart-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"chart-section": {
				ID:               "chart-section",
				Name:             "Chart Section",
				VariantIDs:       []string{"chart-variant"},
				DefaultVariantID: "chart-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"chart-variant": {ID: "chart-variant", ImplID: "chart-impl"},
			"plain-variant": {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"chart-impl": {
				ID:   "chart-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "chart-impl",
					"type":     "Chart",
					"dataPath": "seed-chart.csv",
					"chartSettings": map[string]any{
						"type":               "line",
						"xAxisColumn":        nil,
						"secondYAxisColumns": []string{"humidity"},
						"xAxisLog":           true,
						"y1AxisLog":          false,
						"y2AxisLog":          false,
					},
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize chart route project: %v", err)
	}
	return project
}

func textBlockRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"text-section":  "text-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"text-section": {
				ID:               "text-section",
				Name:             "Seed Section",
				VariantIDs:       []string{"text-variant"},
				DefaultVariantID: "text-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"text-variant": {
				ID:     "text-variant",
				ImplID: "text-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"text-impl": {
				ID:   "text-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                   "text-impl",
					"type":                 "TextBlock",
					"text":                 "# Seed Heading\n\nBody",
					"format":               "Plaintext",
					"masterFontSizePx":     14.0,
					"headingAsSectionName": false,
					"metaControlStyle":     false,
					"textDisplayMode":      "Render",
				}),
			},
			"plain-impl": {
				ID:   "plain-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":   "plain-impl",
					"type": "Chat",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize text block route project: %v", err)
	}
	return project
}

func codeFileBindingRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"code-section":  "code-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code Section",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"code-variant": {
				ID:     "code-variant",
				ImplID: "code-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":           "code-impl",
					"type":         "Code",
					"code":         "print('hello')\n",
					"codeLanguage": "python",
					"children":     []any{},
				}),
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
					Binding: &projectstate.CodeFileBinding{
						Path:       "pkg/original.py",
						AccessMode: projectstate.CodeFileAccessModeReadWrite,
					},
				},
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize code file binding route project: %v", err)
	}
	return project
}

func viewModesRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:                  "project-alpha",
		Name:                "Alpha",
		ActiveViewModeID:    "focus",
		IsEditingViewMode:   false,
		Viewport:            &projectstate.Viewport{X: 5, Y: 10, Zoom: 0.8},
		ViewportInitialized: true,
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"parent-section":     {X: 0, Y: 0, ZIndex: 0},
			"standalone-section": {X: 100, Y: 50, ZIndex: 1},
			"moving-section":     {X: 220, Y: 120, ZIndex: 2},
		},
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:        "focus",
				Name:      "Focus",
				SortIndex: 0,
				Viewport:  &projectstate.Viewport{X: 5, Y: 10, Zoom: 0.8},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"parent-section":     {X: 0, Y: 0, ZIndex: 0},
					"standalone-section": {X: 100, Y: 50, ZIndex: 1},
					"moving-section":     {X: 220, Y: 120, ZIndex: 2},
				},
				ViewportInitialized: true,
				VisibilityBySectionID: map[string]bool{
					"parent-section":     true,
					"standalone-section": true,
					"moving-section":     true,
				},
			},
		},
		SectionVariantMap: map[string]string{
			"parent-section":     "parent-variant",
			"standalone-section": "standalone-variant",
			"moving-section":     "moving-variant",
		},
		Sections: map[string]projectstate.Section{
			"parent-section": {
				ID:               "parent-section",
				Name:             "Parent Section",
				VariantIDs:       []string{"parent-variant"},
				DefaultVariantID: "parent-variant",
			},
			"standalone-section": {
				ID:               "standalone-section",
				Name:             "Standalone Section",
				VariantIDs:       []string{"standalone-variant"},
				DefaultVariantID: "standalone-variant",
			},
			"moving-section": {
				ID:               "moving-section",
				Name:             "Moving Section",
				VariantIDs:       []string{"moving-variant"},
				DefaultVariantID: "moving-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"parent-variant": {
				ID:     "parent-variant",
				ImplID: "parent-impl",
			},
			"standalone-variant": {
				ID:     "standalone-variant",
				ImplID: "standalone-impl",
			},
			"moving-variant": {
				ID:     "moving-variant",
				ImplID: "moving-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"parent-impl": {
				ID:      "parent-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "parent-impl", "type": "Group"}),
			},
			"standalone-impl": {
				ID:      "standalone-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "standalone-impl", "type": "TextBlock"}),
			},
			"moving-impl": {
				ID:      "moving-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "moving-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize view modes route project: %v", err)
	}
	return project
}

func viewModesDeploymentRouteTestDocument(t *testing.T) (projectstate.Document, string) {
	t.Helper()

	project := viewModesRouteTestProject(t)
	alternateViewModeID, err := project.CreateViewMode()
	if err != nil {
		t.Fatalf("create alternate view mode: %v", err)
	}
	alternateViewMode := project.ViewModes[alternateViewModeID]
	alternateViewMode.Name = "Review"
	alternateViewMode.TopLevelSections["standalone-section"] = projectstate.TopLevelSectionLayout{X: 460, Y: 310, ZIndex: 9}
	alternateViewMode.Viewport = &projectstate.Viewport{X: 42, Y: 24, Zoom: 1.1}
	alternateViewMode.ViewportInitialized = true
	project.ViewModes[alternateViewModeID] = alternateViewMode
	project.ActiveViewModeID = "focus"
	project.IsEditingViewMode = false

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
		},
	}, alternateViewModeID
}

func sectionStructureRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	topLevelSections := map[string]projectstate.TopLevelSectionLayout{
		"alpha-section": {X: 120, Y: 40, ZIndex: 1},
		"beta-section":  {X: 20, Y: 10, ZIndex: 2},
		"top-group":     {X: 400, Y: 60, ZIndex: 3},
		"nested-parent": {X: 700, Y: 80, ZIndex: 4},
	}

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
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
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:               "focus",
				TopLevelSections: topLevelSections,
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
		Sections: map[string]projectstate.Section{
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
		SectionVariants: map[string]projectstate.SectionVariant{
			"alpha-variant":          {ID: "alpha-variant", ImplID: "alpha-impl"},
			"beta-variant":           {ID: "beta-variant", ImplID: "beta-impl"},
			"top-group-variant":      {ID: "top-group-variant", ImplID: "top-group-impl"},
			"top-child-a-variant":    {ID: "top-child-a-variant", ImplID: "top-child-a-impl"},
			"top-child-b-variant":    {ID: "top-child-b-variant", ImplID: "top-child-b-impl"},
			"nested-parent-variant":  {ID: "nested-parent-variant", ImplID: "nested-parent-impl"},
			"nested-group-variant":   {ID: "nested-group-variant", ImplID: "nested-group-impl"},
			"nested-child-a-variant": {ID: "nested-child-a-variant", ImplID: "nested-child-a-impl"},
			"nested-child-b-variant": {ID: "nested-child-b-variant", ImplID: "nested-child-b-impl"},
			"nested-sibling-variant": {ID: "nested-sibling-variant", ImplID: "nested-sibling-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"alpha-impl": {
				ID:      "alpha-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "alpha-impl", "type": "TextBlock"}),
			},
			"beta-impl": {
				ID:      "beta-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "beta-impl", "type": "TextBlock"}),
			},
			"top-group-impl": {
				ID:   "top-group-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "top-group-impl",
					"type":     "Group",
					"children": []string{"top-child-a", "top-child-b"},
				}),
			},
			"top-child-a-impl": {
				ID:      "top-child-a-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "top-child-a-impl", "type": "TextBlock"}),
			},
			"top-child-b-impl": {
				ID:      "top-child-b-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "top-child-b-impl", "type": "TextBlock"}),
			},
			"nested-parent-impl": {
				ID:   "nested-parent-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "nested-parent-impl",
					"type":     "Group",
					"children": []string{"nested-group", "nested-sibling"},
				}),
			},
			"nested-group-impl": {
				ID:   "nested-group-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "nested-group-impl",
					"type":     "Group",
					"children": []string{"nested-child-a", "nested-child-b"},
				}),
			},
			"nested-child-a-impl": {
				ID:      "nested-child-a-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "nested-child-a-impl", "type": "TextBlock"}),
			},
			"nested-child-b-impl": {
				ID:      "nested-child-b-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "nested-child-b-impl", "type": "TextBlock"}),
			},
			"nested-sibling-impl": {
				ID:      "nested-sibling-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "nested-sibling-impl", "type": "TextBlock"}),
			},
		},
	})
}

func moveSectionsRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		TopLevelSectionIDs: []string{
			"code-section",
			"group-parent",
			"top-a",
			"top-b",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"code-section": {X: 20, Y: 40, ZIndex: 0},
			"group-parent": {X: 400, Y: 60, ZIndex: 1},
			"top-a":        {X: 120, Y: 40, ZIndex: 2},
			"top-b":        {X: 220, Y: 80, ZIndex: 3},
		},
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID: "focus",
				VisibilityBySectionID: map[string]bool{
					"code-section":     true,
					"group-parent":     true,
					"nested-group":     true,
					"top-a":            true,
					"top-b":            true,
					"terminal-section": true,
				},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"code-section": {X: 20, Y: 40, ZIndex: 0},
					"group-parent": {X: 400, Y: 60, ZIndex: 1},
					"top-a":        {X: 120, Y: 40, ZIndex: 2},
					"top-b":        {X: 220, Y: 80, ZIndex: 3},
				},
			},
		},
		SectionVariantMap: map[string]string{
			"code-section":     "code-variant",
			"group-parent":     "group-variant",
			"nested-group":     "nested-group-variant",
			"top-a":            "top-a-variant",
			"top-b":            "top-b-variant",
			"terminal-section": "terminal-variant",
		},
		Sections: map[string]projectstate.Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"group-parent": {
				ID:               "group-parent",
				Name:             "Group Parent",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"nested-group": {
				ID:               "nested-group",
				Name:             "Nested Group",
				ParentSectionID:  "group-parent",
				VariantIDs:       []string{"nested-group-variant"},
				DefaultVariantID: "nested-group-variant",
			},
			"top-a": {
				ID:               "top-a",
				Name:             "Top A",
				VariantIDs:       []string{"top-a-variant"},
				DefaultVariantID: "top-a-variant",
			},
			"top-b": {
				ID:               "top-b",
				Name:             "Top B",
				VariantIDs:       []string{"top-b-variant"},
				DefaultVariantID: "top-b-variant",
			},
			"terminal-section": {
				ID:               "terminal-section",
				Name:             "Terminal",
				ParentSectionID:  "code-section",
				VariantIDs:       []string{"terminal-variant"},
				DefaultVariantID: "terminal-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"code-variant":         {ID: "code-variant", ImplID: "code-impl"},
			"group-variant":        {ID: "group-variant", ImplID: "group-impl"},
			"nested-group-variant": {ID: "nested-group-variant", ImplID: "nested-group-impl"},
			"top-a-variant":        {ID: "top-a-variant", ImplID: "top-a-impl"},
			"top-b-variant":        {ID: "top-b-variant", ImplID: "top-b-impl"},
			"terminal-variant":     {ID: "terminal-variant", ImplID: "terminal-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Code: &projectstate.CodeSectionImpl{
					Language:                  projectstate.CodeLanguagePython,
					AttachedTerminalSectionID: "terminal-section",
					Children:                  []string{"terminal-section"},
				},
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                        "code-impl",
					"type":                      "Code",
					"codeLanguage":              "python",
					"children":                  []string{"terminal-section"},
					"attachedTerminalSectionId": "terminal-section",
					"size": map[string]any{
						"width":  640.0,
						"height": 160.0,
					},
				}),
			},
			"group-impl": {
				ID:   "group-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "group-impl",
					"type":     "Group",
					"children": []string{"nested-group"},
					"size": map[string]any{
						"width":  520.0,
						"height": 220.0,
					},
				}),
			},
			"nested-group-impl": {
				ID:   "nested-group-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "nested-group-impl",
					"type":     "Group",
					"children": []string{},
				}),
			},
			"top-a-impl": {
				ID:      "top-a-impl",
				Kind:    projectstate.SectionKind("textblock"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "top-a-impl", "type": "TextBlock"}),
			},
			"top-b-impl": {
				ID:      "top-b-impl",
				Kind:    projectstate.SectionKind("textblock"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "top-b-impl", "type": "TextBlock"}),
			},
			"terminal-impl": {
				ID:       "terminal-impl",
				Kind:     projectstate.SectionKindTerminal,
				Terminal: &projectstate.TerminalSectionImpl{},
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":   "terminal-impl",
					"type": "Terminal",
					"size": map[string]any{
						"width":  640.0,
						"height": 150.0,
					},
				}),
			},
		},
	})
}

func mustProjectRouteRawJSON(t *testing.T, value map[string]any) projectstate.RawJSON {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw JSON: %v", err)
	}
	return projectstate.RawJSON(encoded)
}

func mustMarshalProjectRouteRequest(t *testing.T, value any) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal project route request: %v", err)
	}
	return string(encoded)
}

func passwordParamRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"dict-a": "dict-a-variant",
		},
		Sections: map[string]projectstate.Section{
			"dict-a": {
				ID:               "dict-a",
				Name:             "Dict A",
				VariantIDs:       []string{"dict-a-variant"},
				DefaultVariantID: "dict-a-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"dict-a-variant": {
				ID:     "dict-a-variant",
				ImplID: "dict-a-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"dict-a-impl": {
				ID:   "dict-a-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "dict-a-impl",
					"type":            "Dict",
					"selectedParams":  []string{},
					"topLevelParamId": "shared-root",
					"codeObjVariantMap": map[string]string{
						"shared-root":   "shared-root-variant",
						"shared-child":  "shared-child-variant",
						"shared-secret": "shared-secret-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"shared-root": {
				ID:               "shared-root",
				Name:             "root",
				VariantIDs:       []string{"shared-root-variant"},
				DefaultVariantID: "shared-root-variant",
			},
			"shared-child": {
				ID:               "shared-child",
				Name:             "child",
				VariantIDs:       []string{"shared-child-variant"},
				DefaultVariantID: "shared-child-variant",
			},
			"shared-secret": {
				ID:               "shared-secret",
				Name:             "secret",
				VariantIDs:       []string{"shared-secret-variant"},
				DefaultVariantID: "shared-secret-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"shared-root-variant": {
				ID:     "shared-root-variant",
				ImplID: "shared-root-impl",
			},
			"shared-child-variant": {
				ID:     "shared-child-variant",
				ImplID: "shared-child-impl",
			},
			"shared-secret-variant": {
				ID:     "shared-secret-variant",
				ImplID: "shared-secret-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"shared-root-impl": {
				ID:      "shared-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "shared-root-impl", "type": "NestedParam", "children": []string{"shared-child", "shared-secret"}}),
			},
			"shared-child-impl": {
				ID:      "shared-child-impl",
				Type:    "TextParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "shared-child-impl", "type": "TextParam", "value": "seed", "coreNameEditable": true}),
			},
			"shared-secret-impl": {
				ID:      "shared-secret-impl",
				Type:    "PasswordParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "shared-secret-impl", "type": "PasswordParam", "value": ""}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize password route test project: %v", err)
	}
	return project
}

func metaControlParamRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"meta-section": "meta-variant",
		},
		Sections: map[string]projectstate.Section{
			"meta-section": {
				ID:               "meta-section",
				Name:             "Meta",
				VariantIDs:       []string{"meta-variant"},
				DefaultVariantID: "meta-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"meta-variant": {
				ID:     "meta-variant",
				ImplID: "meta-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"meta-impl": {
				ID:   "meta-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                 "meta-impl",
					"type":               "MetaControl",
					"metaControlParamId": "meta-param",
					"codeObjVariantMap": map[string]string{
						"meta-param": "meta-param-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"meta-param": {
				ID:               "meta-param",
				Name:             "meta_param",
				VariantIDs:       []string{"meta-param-variant"},
				DefaultVariantID: "meta-param-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"meta-param-variant": {
				ID:     "meta-param-variant",
				ImplID: "meta-param-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"meta-param-impl": {
				ID:      "meta-param-impl",
				Type:    "TextParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "meta-param-impl", "type": "TextParam", "value": "seed"}),
			},
		},
	})
}

func genCodePrefixSuffixRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  projectstate.RawJSON(`{"language":"python","generateMetadata":true}`),
			},
		},
	})
}

func graphEdgeRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  projectstate.RawJSON(`{"language":"python"}`),
			},
		},
		TopLevelSectionIDs: []string{
			"source-section",
			"target-a",
			"target-b",
			"chat-source",
			"chat-target",
			"plain-section",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"source-section": {X: 10, Y: 10},
			"target-a":       {X: 20, Y: 20},
			"target-b":       {X: 30, Y: 30},
			"chat-source":    {X: 40, Y: 40},
			"chat-target":    {X: 50, Y: 50},
			"plain-section":  {X: 60, Y: 60},
		},
		SectionVariantMap: map[string]string{
			"source-section": "source-variant",
			"target-a":       "target-a-variant",
			"target-b":       "target-b-variant",
			"chat-source":    "chat-source-variant",
			"chat-target":    "chat-target-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source Call",
				VariantIDs:       []string{"source-variant"},
				DefaultVariantID: "source-variant",
			},
			"target-a": {
				ID:               "target-a",
				Name:             "Target A",
				VariantIDs:       []string{"target-a-variant"},
				DefaultVariantID: "target-a-variant",
			},
			"target-b": {
				ID:               "target-b",
				Name:             "Target B",
				VariantIDs:       []string{"target-b-variant"},
				DefaultVariantID: "target-b-variant",
			},
			"chat-source": {
				ID:               "chat-source",
				Name:             "Chat Source",
				VariantIDs:       []string{"chat-source-variant"},
				DefaultVariantID: "chat-source-variant",
			},
			"chat-target": {
				ID:               "chat-target",
				Name:             "Chat Target",
				VariantIDs:       []string{"chat-target-variant"},
				DefaultVariantID: "chat-target-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"source-variant":      {ID: "source-variant", ImplID: "source-impl"},
			"target-a-variant":    {ID: "target-a-variant", ImplID: "target-a-impl"},
			"target-b-variant":    {ID: "target-b-variant", ImplID: "target-b-impl"},
			"chat-source-variant": {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"chat-target-variant": {ID: "chat-target-variant", ImplID: "chat-target-impl"},
			"plain-variant":       {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"source-impl": {
				ID:   "source-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "source-impl",
					"type":     "Callable",
					"callable": "source-callable",
					"codeObjVariantMap": map[string]string{
						"source-callable": "source-callable-variant",
					},
					"edgeOutputPorts": []map[string]any{
						{"id": "result", "accessor": ".result"},
						{"id": "summary", "accessor": ""},
					},
				}),
			},
			"target-a-impl": {
				ID:   "target-a-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "target-a-impl",
					"type":            "Dict",
					"topLevelParamId": "target-a-root",
					"codeObjVariantMap": map[string]string{
						"target-a-root": "target-a-root-variant",
						"input-a":       "input-a-variant",
					},
					"edgeInputParams": []string{"input-a"},
				}),
			},
			"target-b-impl": {
				ID:   "target-b-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "target-b-impl",
					"type":            "Dict",
					"topLevelParamId": "target-b-root",
					"codeObjVariantMap": map[string]string{
						"target-b-root": "target-b-root-variant",
						"input-b":       "input-b-variant",
					},
					"edgeInputParams": []string{"input-b"},
				}),
			},
			"chat-source-impl": {
				ID:      "chat-source-impl",
				Kind:    projectstate.SectionKind("chat"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-source-impl", "type": "Chat"}),
			},
			"chat-target-impl": {
				ID:      "chat-target-impl",
				Kind:    projectstate.SectionKind("chat"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-target-impl", "type": "Chat"}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"source-callable": {
				ID:               "source-callable",
				Name:             "source_callable",
				VariantIDs:       []string{"source-callable-variant"},
				DefaultVariantID: "source-callable-variant",
			},
			"target-a-root": {
				ID:               "target-a-root",
				Name:             "target_a_root",
				VariantIDs:       []string{"target-a-root-variant"},
				DefaultVariantID: "target-a-root-variant",
			},
			"input-a": {
				ID:               "input-a",
				Name:             "input_a",
				VariantIDs:       []string{"input-a-variant"},
				DefaultVariantID: "input-a-variant",
			},
			"target-b-root": {
				ID:               "target-b-root",
				Name:             "target_b_root",
				VariantIDs:       []string{"target-b-root-variant"},
				DefaultVariantID: "target-b-root-variant",
			},
			"input-b": {
				ID:               "input-b",
				Name:             "input_b",
				VariantIDs:       []string{"input-b-variant"},
				DefaultVariantID: "input-b-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"source-callable-variant": {ID: "source-callable-variant", ImplID: "source-callable-impl"},
			"target-a-root-variant":   {ID: "target-a-root-variant", ImplID: "target-a-root-impl"},
			"input-a-variant":         {ID: "input-a-variant", ImplID: "input-a-impl"},
			"target-b-root-variant":   {ID: "target-b-root-variant", ImplID: "target-b-root-impl"},
			"input-b-variant":         {ID: "input-b-variant", ImplID: "input-b-impl"},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"source-callable-impl": {
				ID:      "source-callable-impl",
				Type:    "CodeCallable",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "source-callable-impl", "type": "CodeCallable", "children": []string{}}),
			},
			"target-a-root-impl": {
				ID:      "target-a-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "target-a-root-impl", "type": "NestedParam", "children": []string{"input-a"}}),
			},
			"input-a-impl": {
				ID:      "input-a-impl",
				Type:    "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "input-a-impl", "type": "CodeParam", "value": "seed-a"}),
			},
			"target-b-root-impl": {
				ID:      "target-b-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "target-b-root-impl", "type": "NestedParam", "children": []string{"input-b"}}),
			},
			"input-b-impl": {
				ID:      "input-b-impl",
				Type:    "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "input-b-impl", "type": "CodeParam", "value": "seed-b"}),
			},
		},
	})
}

func sectionVariantDeletionRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return sectionVariantRouteTestProject(t, true)
}

func sectionVariantRouteTestProject(t *testing.T, allowJSONSourceKeyEdits bool) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Alpha",
		AllowJSONSourceKeyEdits: allowJSONSourceKeyEdits,
		SectionVariantMap: map[string]string{
			"source-section": "source-variant-b",
			"json-section":   "json-variant-a",
			"code-section":   "code-variant",
		},
		Sections: map[string]projectstate.Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant-a", "source-variant-b"},
				DefaultVariantID: "source-variant-b",
			},
			"json-section": {
				ID:               "json-section",
				Name:             "JSON Source",
				VariantIDs:       []string{"json-variant-a", "json-variant-b"},
				DefaultVariantID: "json-variant-a",
			},
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"source-variant-a": {
				ID:     "source-variant-a",
				ImplID: "source-impl-a",
			},
			"source-variant-b": {
				ID:     "source-variant-b",
				ImplID: "source-impl-b",
			},
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				ImplID: "json-impl-b",
			},
			"code-variant": {
				ID:     "code-variant",
				ImplID: "code-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"source-impl-a": {
				ID:      "source-impl-a",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "source-impl-a", "type": "TextBlock"}),
			},
			"source-impl-b": {
				ID:      "source-impl-b",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "source-impl-b", "type": "TextBlock"}),
			},
			"json-impl-a": {
				ID:      "json-impl-a",
				Kind:    projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "json-impl-a", "type": "Dict", "isJsonSource": true, "jsonSourceKeys": []string{"config"}}),
			},
			"json-impl-b": {
				ID:      "json-impl-b",
				Kind:    projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "json-impl-b", "type": "Dict", "configLanguage": "python", "jsonSourceKeys": []string{}}),
			},
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
				},
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "code-impl", "type": "Code", "codeLanguage": "python", "children": []string{}}),
			},
		},
	})
}

func sectionVariantAgenticEdgeRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"chat-source": "chat-source-variant",
			"chat-target": "chat-target-chat-variant",
		},
		AgenticEdges: []projectstate.AgenticEdge{
			{
				ID:              "agentic-edge-1",
				SourceSectionID: "chat-source",
				TargetSectionID: "chat-target",
				Kind:            "chat_chat",
				ContextMode:     "reference_only",
			},
		},
		Sections: map[string]projectstate.Section{
			"chat-source": {
				ID:               "chat-source",
				Name:             "Chat Source",
				VariantIDs:       []string{"chat-source-variant"},
				DefaultVariantID: "chat-source-variant",
			},
			"chat-target": {
				ID:               "chat-target",
				Name:             "Chat Target",
				VariantIDs:       []string{"chat-target-chat-variant", "chat-target-text-variant"},
				DefaultVariantID: "chat-target-chat-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"chat-source-variant":      {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"chat-target-chat-variant": {ID: "chat-target-chat-variant", ImplID: "chat-target-chat-impl"},
			"chat-target-text-variant": {ID: "chat-target-text-variant", ImplID: "chat-target-text-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"chat-source-impl": {
				ID:      "chat-source-impl",
				Kind:    projectstate.SectionKind("chat"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-source-impl", "type": "Chat"}),
			},
			"chat-target-chat-impl": {
				ID:      "chat-target-chat-impl",
				Kind:    projectstate.SectionKind("chat"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-target-chat-impl", "type": "Chat"}),
			},
			"chat-target-text-impl": {
				ID:      "chat-target-text-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-target-text-impl", "type": "TextBlock"}),
			},
		},
	})
}

func jsonSourceLiveRefreshRouteTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project := mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
			InstancesByID: map[string]projectstate.ProjectChatWindowInstance{},
			Order:         []string{},
		},
		SectionVariantMap: map[string]string{
			"json-section": "json-variant-a",
		},
		Sections: map[string]projectstate.Section{
			"json-section": {
				ID:               "json-section",
				Name:             "JSON Source",
				VariantIDs:       []string{"json-variant-a"},
				DefaultVariantID: "json-variant-a",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "json-impl-a",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root",
					"codeObjVariantMap": map[string]any{
						"old-root": "old-root-variant",
						"old-leaf": "old-leaf-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"old-root": {
				ID:               "old-root",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant"},
				DefaultVariantID: "old-root-variant",
			},
			"old-leaf": {
				ID:               "old-leaf",
				Name:             "one",
				VariantIDs:       []string{"old-leaf-variant"},
				DefaultVariantID: "old-leaf-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"old-root-variant": {
				ID:               "old-root-variant",
				ImplID:           "old-root-impl",
				NonPresetImplIDs: []string{"old-root-impl"},
			},
			"old-leaf-variant": {
				ID:               "old-leaf-variant",
				ImplID:           "old-leaf-impl",
				NonPresetImplIDs: []string{"old-leaf-impl"},
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"old-root-impl": {
				ID:   "old-root-impl",
				Type: "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "old-root-impl",
					"type":     "NestedParam",
					"children": []string{"old-leaf"},
				}),
			},
			"old-leaf-impl": {
				ID:   "old-leaf-impl",
				Type: "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":    "old-leaf-impl",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
		},
	})

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
}

func jsonSourceLeafRootRouteTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	document := jsonSourceLiveRefreshRouteTestDocument(t)
	project := document.Projects["project-alpha"]

	leafRoot := project.CodeObjs["old-leaf"]
	leafRoot.Name = "alpha"
	project.CodeObjs["old-leaf"] = leafRoot
	delete(project.CodeObjs, "old-root")
	delete(project.CodeObjVariants, "old-root-variant")
	delete(project.CodeObjImpls, "old-root-impl")
	project.SectionImpls["json-impl-a"] = projectstate.SectionImpl{
		ID:   "json-impl-a",
		Kind: projectstate.SectionKind("dict"),
		Payload: mustProjectRouteRawJSON(t, map[string]any{
			"id":              "json-impl-a",
			"type":            "Dict",
			"isJsonSource":    true,
			"configLanguage":  "json",
			"jsonSourceKeys":  []string{"alpha"},
			"topLevelParamId": "old-leaf",
			"codeObjVariantMap": map[string]any{
				"old-leaf": "old-leaf-variant",
			},
		}),
	}
	document.Projects["project-alpha"] = project
	return document
}

func jsonSourceSharedRouteTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project := mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
			InstancesByID: map[string]projectstate.ProjectChatWindowInstance{},
			Order:         []string{},
		},
		SectionVariantMap: map[string]string{
			"json-section-a": "json-variant-a",
			"json-section-b": "json-variant-b",
		},
		Sections: map[string]projectstate.Section{
			"json-section-a": {
				ID:               "json-section-a",
				Name:             "JSON Source A",
				VariantIDs:       []string{"json-variant-a"},
				DefaultVariantID: "json-variant-a",
			},
			"json-section-b": {
				ID:               "json-section-b",
				Name:             "JSON Source B",
				VariantIDs:       []string{"json-variant-b"},
				DefaultVariantID: "json-variant-b",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				ImplID: "json-impl-b",
				Name:   "data/source.json",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "json-impl-a",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root-a",
					"codeObjVariantMap": map[string]any{
						"old-root-a": "old-root-variant-a",
						"old-leaf-a": "old-leaf-variant-a",
					},
				}),
			},
			"json-impl-b": {
				ID:   "json-impl-b",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "json-impl-b",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root-b",
					"codeObjVariantMap": map[string]any{
						"old-root-b": "old-root-variant-b",
						"old-leaf-b": "old-leaf-variant-b",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"old-root-a": {
				ID:               "old-root-a",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant-a"},
				DefaultVariantID: "old-root-variant-a",
			},
			"old-leaf-a": {
				ID:               "old-leaf-a",
				Name:             "target-leaf",
				VariantIDs:       []string{"old-leaf-variant-a"},
				DefaultVariantID: "old-leaf-variant-a",
			},
			"old-root-b": {
				ID:               "old-root-b",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant-b"},
				DefaultVariantID: "old-root-variant-b",
			},
			"old-leaf-b": {
				ID:               "old-leaf-b",
				Name:             "peer-leaf",
				VariantIDs:       []string{"old-leaf-variant-b"},
				DefaultVariantID: "old-leaf-variant-b",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"old-root-variant-a": {
				ID:               "old-root-variant-a",
				ImplID:           "old-root-impl-a",
				NonPresetImplIDs: []string{"old-root-impl-a"},
			},
			"old-leaf-variant-a": {
				ID:               "old-leaf-variant-a",
				ImplID:           "old-leaf-impl-a",
				NonPresetImplIDs: []string{"old-leaf-impl-a"},
			},
			"old-root-variant-b": {
				ID:               "old-root-variant-b",
				ImplID:           "old-root-impl-b",
				NonPresetImplIDs: []string{"old-root-impl-b"},
			},
			"old-leaf-variant-b": {
				ID:               "old-leaf-variant-b",
				ImplID:           "old-leaf-impl-b",
				NonPresetImplIDs: []string{"old-leaf-impl-b"},
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"old-root-impl-a": {
				ID:   "old-root-impl-a",
				Type: "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "old-root-impl-a",
					"type":     "NestedParam",
					"children": []string{"old-leaf-a"},
				}),
			},
			"old-leaf-impl-a": {
				ID:   "old-leaf-impl-a",
				Type: "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":    "old-leaf-impl-a",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
			"old-root-impl-b": {
				ID:   "old-root-impl-b",
				Type: "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "old-root-impl-b",
					"type":     "NestedParam",
					"children": []string{"old-leaf-b"},
				}),
			},
			"old-leaf-impl-b": {
				ID:   "old-leaf-impl-b",
				Type: "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":    "old-leaf-impl-b",
					"type":  "CodeParam",
					"value": "2",
				}),
			},
		},
	})

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
}

func projectstatePayloadString(payload map[string]any, key string) string {
	value, _ := payload[key].(string)
	return value
}

func projectstatePayloadStringArray(payload map[string]any, key string) []string {
	rawEntries, _ := payload[key].([]any)
	output := make([]string, 0, len(rawEntries))
	for _, rawEntry := range rawEntries {
		entry, ok := rawEntry.(string)
		if !ok || strings.TrimSpace(entry) == "" {
			continue
		}
		output = append(output, entry)
	}
	return output
}

func projectstatePayloadStringMap(payload map[string]any, key string) map[string]string {
	rawEntries, _ := payload[key].(map[string]any)
	output := make(map[string]string, len(rawEntries))
	for entryKey, rawValue := range rawEntries {
		value, ok := rawValue.(string)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		output[entryKey] = value
	}
	return output
}

func projectstatePayloadBool(payload map[string]any, key string) bool {
	value, _ := payload[key].(bool)
	return value
}

func assertProjectRouteJSONSourceFreshValue(t *testing.T, project projectstate.Project, codeObjVariantMap map[string]string, topLevelParamID string) {
	t.Helper()

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		t.Fatalf("effective root payload after json-source check: %v", err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 1 {
		t.Fatalf("expected one refreshed child, got %#v", childIDs)
	}
	childPayload, childCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective child payload after json-source check: %v", err)
	}
	if childCodeObj.Name != "fresh" {
		t.Fatalf("expected child name fresh, got %q", childCodeObj.Name)
	}
	if got := projectstatePayloadString(childPayload, "value"); got != "2" {
		t.Fatalf("expected child value 2, got %q", got)
	}
}

func assertProjectRouteJSONSourceOldLeafValue(t *testing.T, project projectstate.Project, codeObjVariantMap map[string]string, topLevelParamID string, expectedName string, expectedValue string) {
	t.Helper()

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		t.Fatalf("effective root payload after persisted json-source check: %v", err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 1 {
		t.Fatalf("expected one persisted child, got %#v", childIDs)
	}
	childPayload, childCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective child payload after persisted json-source check: %v", err)
	}
	if childCodeObj.Name != expectedName {
		t.Fatalf("expected child name %q, got %q", expectedName, childCodeObj.Name)
	}
	if got := projectstatePayloadString(childPayload, "value"); got != expectedValue {
		t.Fatalf("expected child value %q, got %q", expectedValue, got)
	}
}

func mustNormalizedProjectRouteProject(t *testing.T, project projectstate.Project) projectstate.Project {
	t.Helper()

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project route project: %v", err)
	}
	return normalized
}

func projectRouteStringPointer(value string) *string {
	return &value
}
