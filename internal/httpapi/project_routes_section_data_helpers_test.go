package httpapi

import (
	"testing"

	"setta/internal/projectstate"
)

func browserSectionRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"browser-section": "browser-variant",
			"plain-section":   "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"browser-section": {
				ID:               "browser-section",
				Name:             "Browser Section",
				VariantIDs:       []string{"browser-variant"},
				DefaultVariantID: "browser-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"browser-variant": {
				ID:     "browser-variant",
				ImplID: "browser-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"browser-impl": {
				ID:   "browser-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":               "browser-impl",
					"type":             "Browser",
					"folder":           "",
					"hideColumn":       false,
					"columnWidth":      nil,
					"typesColumnWidth": nil,
					"viewMode":         "list",
					"savedSearches":    []any{},
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
		t.Fatalf("normalize browser route project: %v", err)
	}
	return project
}

func sectionDataRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"group-section":       "group-variant",
			"spreadsheet-section": "spreadsheet-variant",
			"task-board-section":  "task-board-variant",
			"image-section":       "image-variant",
			"social-section":      "social-variant",
			"plain-section":       "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"group-section": {
				ID:               "group-section",
				Name:             "Group Section",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"spreadsheet-section": {
				ID:               "spreadsheet-section",
				Name:             "Spreadsheet Section",
				VariantIDs:       []string{"spreadsheet-variant"},
				DefaultVariantID: "spreadsheet-variant",
			},
			"task-board-section": {
				ID:               "task-board-section",
				Name:             "Task Board Section",
				VariantIDs:       []string{"task-board-variant"},
				DefaultVariantID: "task-board-variant",
			},
			"image-section": {
				ID:               "image-section",
				Name:             "Image Section",
				VariantIDs:       []string{"image-variant"},
				DefaultVariantID: "image-variant",
			},
			"social-section": {
				ID:               "social-section",
				Name:             "Social Section",
				VariantIDs:       []string{"social-variant"},
				DefaultVariantID: "social-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"group-variant":       {ID: "group-variant", ImplID: "group-impl"},
			"spreadsheet-variant": {ID: "spreadsheet-variant", ImplID: "spreadsheet-impl"},
			"task-board-variant":  {ID: "task-board-variant", ImplID: "task-board-impl"},
			"image-variant":       {ID: "image-variant", ImplID: "image-impl"},
			"social-variant":      {ID: "social-variant", ImplID: "social-impl"},
			"plain-variant":       {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"group-impl": {
				ID:   "group-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                      "group-impl",
					"type":                    "Group",
					"isHorizontalOrientation": false,
					"overflowMode":            false,
				}),
			},
			"spreadsheet-impl": {
				ID:   "spreadsheet-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                         "spreadsheet-impl",
					"type":                       "Spreadsheet",
					"filePath":                   "seed.csv",
					"activeSheet":                nil,
					"readOnly":                   false,
					"showRowNumbers":             true,
					"density":                    "compact",
					"autoReloadOnExternalChange": false,
				}),
			},
			"task-board-impl": {
				ID:   "task-board-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "task-board-impl",
					"type":     "TaskBoard",
					"viewMode": "kanban",
					"columns": []map[string]any{
						{"id": "seed-column", "name": "Backlog", "color": "#3b82f6", "sortIndex": 0},
					},
					"tasks": []map[string]any{
						{
							"id":               "seed-task",
							"title":            "Seed Task",
							"description":      "",
							"completed":        false,
							"columnId":         "seed-column",
							"dueDateIso":       "",
							"recurrence":       "none",
							"recurrenceDays":   []string{},
							"recurrenceMonths": []string{},
							"recurrenceYears":  []int{},
							"sortIndex":        0,
						},
					},
				}),
			},
			"image-impl": {
				ID:   "image-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":        "image-impl",
					"type":      "Image",
					"imagePath": "/tmp/seed.png",
				}),
			},
			"social-impl": {
				ID:   "social-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":   "social-impl",
					"type": "Social",
					"url":  "https://example.com/seed",
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
		t.Fatalf("normalize section data route project: %v", err)
	}
	return project
}

func drawAreaRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"draw-section":  "draw-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"draw-section": {
				ID:               "draw-section",
				Name:             "Draw Section",
				VariantIDs:       []string{"draw-variant"},
				DefaultVariantID: "draw-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"draw-variant":  {ID: "draw-variant", ImplID: "draw-impl"},
			"plain-variant": {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"draw-impl": {
				ID:   "draw-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":   "draw-impl",
					"type": "Draw",
					"layers": []any{
						map[string]any{
							"name":         "Layer 1",
							"visible":      true,
							"layerOpacity": 1.0,
							"elements": []any{
								map[string]any{
									"type":        "BrushStroke",
									"dataPath":    "artifacts/existing-stroke.json",
									"transformId": "artifacts/existing-transform.json",
								},
							},
						},
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
		t.Fatalf("normalize draw area route project: %v", err)
	}
	return project
}
