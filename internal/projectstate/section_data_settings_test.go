package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestRuntimeSectionDataMutationsUpdateEffectivePayload(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": sectionDataMutationTestProject(t),
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

	activeSheet := "Sheet 2"
	if _, err := runtime.SetSpreadsheetFilePath(
		context.Background(),
		"project-alpha",
		"spreadsheet-section",
		"  reports/quarterly.xlsx  ",
		&activeSheet,
	); err != nil {
		t.Fatalf("SetSpreadsheetFilePath returned error: %v", err)
	}

	projectPayload := func(sectionID string, variantID string) map[string]any {
		t.Helper()

		project := runtime.Snapshot().Document.Projects["project-alpha"]
		payload, err := effectiveSectionPayload(project, sectionID, variantID)
		if err != nil {
			t.Fatalf("effectiveSectionPayload %s: %v", sectionID, err)
		}
		return payload
	}

	for _, density := range []SpreadsheetGridDensity{
		SpreadsheetGridDensityComfortable,
		SpreadsheetGridDensityCompact,
	} {
		if _, err := runtime.SetSpreadsheetSectionSettings(
			context.Background(),
			"project-alpha",
			"spreadsheet-section",
			true,
			false,
			density,
			true,
		); err != nil {
			t.Fatalf("SetSpreadsheetSectionSettings(%s) returned error: %v", density, err)
		}
		if got := payloadRawStringField(projectPayload("spreadsheet-section", "spreadsheet-variant"), "density"); got != string(density) {
			t.Fatalf("expected density %q, got %q", density, got)
		}
	}

	todoColumnID := "todo"
	missingColumnID := "missing"
	for _, viewMode := range []TaskBoardViewMode{
		TaskBoardViewModeTaskList,
		TaskBoardViewModeKanban,
	} {
		if _, err := runtime.SetTaskBoardSectionState(
			context.Background(),
			"project-alpha",
			"task-board-section",
			viewMode,
			[]TaskBoardColumn{
				{ID: todoColumnID, Name: "Todo", Color: "#3b82f6", SortIndex: 0},
				{ID: todoColumnID, Name: "Duplicate", Color: "#ef4444", SortIndex: 1},
				{ID: "done", Name: "Done", Color: "#10b981", SortIndex: 2},
			},
			[]TaskBoardTask{
				{
					ID:               "task-1",
					Title:            "Task One",
					Description:      "",
					Completed:        false,
					ColumnID:         &todoColumnID,
					DueDateISO:       "",
					Recurrence:       "none",
					RecurrenceDays:   []string{},
					RecurrenceMonths: []string{},
					RecurrenceYears:  []int{},
					SortIndex:        0,
				},
				{
					ID:               "task-2",
					Title:            "Task Two",
					Description:      "",
					Completed:        true,
					ColumnID:         &missingColumnID,
					DueDateISO:       "",
					Recurrence:       "daily",
					RecurrenceDays:   []string{},
					RecurrenceMonths: []string{},
					RecurrenceYears:  []int{},
					SortIndex:        1,
				},
			},
		); err != nil {
			t.Fatalf("SetTaskBoardSectionState(%s) returned error: %v", viewMode, err)
		}
		if got := payloadRawStringField(projectPayload("task-board-section", "task-board-variant"), "viewMode"); got != string(viewMode) {
			t.Fatalf("expected task board viewMode %q, got %q", viewMode, got)
		}
	}

	if _, err := runtime.SetImageAreaImagePath(context.Background(), "project-alpha", "image-section", "/tmp/new-image.png"); err != nil {
		t.Fatalf("SetImageAreaImagePath returned error: %v", err)
	}
	if _, err := runtime.SetSocialURL(context.Background(), "project-alpha", "social-section", "https://example.com/watch?v=123"); err != nil {
		t.Fatalf("SetSocialURL returned error: %v", err)
	}

	spreadsheetPayload := projectPayload("spreadsheet-section", "spreadsheet-variant")
	if got := payloadRawStringField(spreadsheetPayload, "filePath"); got != "reports/quarterly.xlsx" {
		t.Fatalf("expected trimmed spreadsheet filePath, got %q", got)
	}
	if got := payloadRawStringField(spreadsheetPayload, "activeSheet"); got != "Sheet 2" {
		t.Fatalf("expected activeSheet Sheet 2, got %q", got)
	}
	if !payloadBoolField(spreadsheetPayload, "readOnly") {
		t.Fatal("expected readOnly=true")
	}
	if payloadBoolField(spreadsheetPayload, "showRowNumbers") {
		t.Fatal("expected showRowNumbers=false")
	}
	if got := payloadRawStringField(spreadsheetPayload, "density"); got != string(SpreadsheetGridDensityCompact) {
		t.Fatalf("expected final density %q, got %q", SpreadsheetGridDensityCompact, got)
	}
	if !payloadBoolField(spreadsheetPayload, "autoReloadOnExternalChange") {
		t.Fatal("expected autoReloadOnExternalChange=true")
	}

	taskBoardPayload := projectPayload("task-board-section", "task-board-variant")
	if got := payloadRawStringField(taskBoardPayload, "viewMode"); got != string(TaskBoardViewModeKanban) {
		t.Fatalf("expected final task board viewMode %q, got %q", TaskBoardViewModeKanban, got)
	}
	rawColumns, ok := taskBoardPayload["columns"].([]any)
	if !ok || len(rawColumns) != 2 {
		t.Fatalf("expected two normalized task board columns, got %#v", taskBoardPayload["columns"])
	}
	firstColumn, ok := rawColumns[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first task board column object, got %#v", rawColumns[0])
	}
	if firstColumn["name"] != "Todo" {
		t.Fatalf("expected first task board column to keep original entry, got %#v", firstColumn["name"])
	}

	rawTasks, ok := taskBoardPayload["tasks"].([]any)
	if !ok || len(rawTasks) != 2 {
		t.Fatalf("expected two task board tasks, got %#v", taskBoardPayload["tasks"])
	}
	secondTask, ok := rawTasks[1].(map[string]any)
	if !ok {
		t.Fatalf("expected second task board task object, got %#v", rawTasks[1])
	}
	if secondTask["columnId"] != nil {
		t.Fatalf("expected unknown task columnId to normalize to nil, got %#v", secondTask["columnId"])
	}

	imagePayload := projectPayload("image-section", "image-variant")
	if got := payloadRawStringField(imagePayload, "imagePath"); got != "/tmp/new-image.png" {
		t.Fatalf("expected imagePath /tmp/new-image.png, got %q", got)
	}

	socialPayload := projectPayload("social-section", "social-variant")
	if got := payloadRawStringField(socialPayload, "url"); got != "https://example.com/watch?v=123" {
		t.Fatalf("expected social url to persist, got %q", got)
	}
}

func TestRuntimeSectionDataMutationsRejectInvalidTargetsAndValues(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": sectionDataMutationTestProject(t),
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

	if _, err := runtime.SetSpreadsheetFilePath(context.Background(), "project-alpha", "plain-section", "data.csv", nil); !errors.Is(err, ErrSpreadsheetSectionRequired) {
		t.Fatalf("expected ErrSpreadsheetSectionRequired, got %v", err)
	}
	if _, err := runtime.SetSpreadsheetSectionSettings(
		context.Background(),
		"project-alpha",
		"spreadsheet-section",
		false,
		true,
		SpreadsheetGridDensity("dense"),
		false,
	); !errors.Is(err, ErrSpreadsheetGridDensityInvalid) {
		t.Fatalf("expected ErrSpreadsheetGridDensityInvalid, got %v", err)
	}
	if _, err := runtime.SetTaskBoardSectionState(
		context.Background(),
		"project-alpha",
		"plain-section",
		TaskBoardViewModeKanban,
		nil,
		nil,
	); !errors.Is(err, ErrTaskBoardSectionRequired) {
		t.Fatalf("expected ErrTaskBoardSectionRequired, got %v", err)
	}
	if _, err := runtime.SetTaskBoardSectionState(
		context.Background(),
		"project-alpha",
		"task-board-section",
		TaskBoardViewMode("calendar"),
		nil,
		nil,
	); !errors.Is(err, ErrTaskBoardViewModeInvalid) {
		t.Fatalf("expected ErrTaskBoardViewModeInvalid, got %v", err)
	}
	if _, err := runtime.SetImageAreaImagePath(context.Background(), "project-alpha", "plain-section", "/tmp/image.png"); !errors.Is(err, ErrImageSectionRequired) {
		t.Fatalf("expected ErrImageSectionRequired, got %v", err)
	}
	if _, err := runtime.SetSocialURL(context.Background(), "project-alpha", "plain-section", "https://example.com"); !errors.Is(err, ErrSocialSectionRequired) {
		t.Fatalf("expected ErrSocialSectionRequired, got %v", err)
	}
}

func sectionDataMutationTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"spreadsheet-section": "spreadsheet-variant",
			"task-board-section":  "task-board-variant",
			"image-section":       "image-variant",
			"social-section":      "social-variant",
			"plain-section":       "plain-variant",
		},
		Sections: map[string]Section{
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
		SectionVariants: map[string]SectionVariant{
			"spreadsheet-variant": {ID: "spreadsheet-variant", ImplID: "spreadsheet-impl"},
			"task-board-variant":  {ID: "task-board-variant", ImplID: "task-board-impl"},
			"image-variant":       {ID: "image-variant", ImplID: "image-impl"},
			"social-variant":      {ID: "social-variant", ImplID: "social-impl"},
			"plain-variant":       {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"spreadsheet-impl": {
				ID:   "spreadsheet-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
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
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "task-board-impl",
					"type":     "TaskBoard",
					"viewMode": "kanban",
					"columns": []map[string]any{
						{"id": "seed-column", "name": "Backlog", "color": "#3b82f6", "sortIndex": 0},
					},
					"tasks": []map[string]any{
						{
							"id":               "seed-task",
							"title":            "Seed",
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
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":        "image-impl",
					"type":      "Image",
					"imagePath": "/tmp/seed.png",
				}),
			},
			"social-impl": {
				ID:   "social-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "social-impl",
					"type": "Social",
					"url":  "https://example.com/seed",
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section data project: %v", err)
	}
	return project
}
