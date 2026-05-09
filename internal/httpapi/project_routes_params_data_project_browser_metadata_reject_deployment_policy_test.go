package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesBrowserMetadataRejectDeploymentPolicyWhenLayoutChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": browserSectionRouteTestProject(t),
					},
				},
				Policy: map[string]any{
					"allowLayoutChanges": false,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay before rejected browser mutations: %v", err)
			}
			before := overlay.Snapshot().Document.Projects["project-alpha"].Sections["browser-section"]

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			for _, requestSpec := range []struct {
				route string
				body  string
			}{
				{
					route: RouteSetBrowserColumnWidths,
					body:  `{"projectConfigId":"project-alpha","sectionId":"browser-section","columnWidth":240.5,"typesColumnWidth":160}`,
				},
				{
					route: RouteSetBrowserAreaViewMode,
					body:  `{"projectConfigId":"project-alpha","sectionId":"browser-section","viewMode":"thumbnail"}`,
				},
				{
					route: RouteSetBrowserHideColumn,
					body:  `{"projectConfigId":"project-alpha","sectionId":"browser-section","hideColumn":true}`,
				},
				{
					route: RouteSetBrowserSavedSearches,
					body:  `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"images","name":"Images","query":"png","searchScope":"local","typeFilters":{"image":true,"video":false,"audio":false,"text":false,"data":false},"color":"#ef4444","quickInfo":"Only images"}]}`,
				},
			} {
				request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden {
					t.Fatalf("expected 403 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
					t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
					t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
				}
			}

			after := overlay.Snapshot().Document.Projects["project-alpha"].Sections["browser-section"]
			if !reflect.DeepEqual(after, before) {
				t.Fatalf("expected rejected browser mutations to leave overlay unchanged, got %#v", after)
			}
		})
	}
}

func TestRegisterProjectRoutesSectionDataMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionDataRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	post := func(route string, body string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	latestPayload := func() ProjectStateSingleConfigWithCompletedOpIDs {
		t.Helper()

		latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
		if latestResponse.Code != http.StatusOK {
			t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
		}

		var payload ProjectStateSingleConfigWithCompletedOpIDs
		if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode latest project payload: %v", err)
		}
		return payload
	}

	response := post(RouteToggleGroupOrientation, `{"projectConfigId":"project-alpha","sectionId":"group-section"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteToggleGroupOrientation, response.Code, response.Body.String())
	}
	response = post(RouteSetSpreadsheetFilePath, `{"projectConfigId":"project-alpha","sectionId":"spreadsheet-section","filePath":"  reports/q1.xlsx  ","activeSheet":"Sheet 2"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetSpreadsheetFilePath, response.Code, response.Body.String())
	}
	for _, density := range []string{"comfortable", "compact"} {
		response = post(
			RouteSetSpreadsheetSectionSettings,
			`{"projectConfigId":"project-alpha","sectionId":"spreadsheet-section","readOnly":true,"showRowNumbers":false,"density":"`+density+`","autoReloadOnExternalChange":true}`,
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s=%s, got %d with body %q", RouteSetSpreadsheetSectionSettings, density, response.Code, response.Body.String())
		}
		spreadsheetModifier := decodeProjectRouteRawObject(t, latestPayload().ProjectState.Sections["spreadsheet-section"].SharedModifier)
		if spreadsheetModifier["density"] != density {
			t.Fatalf("expected spreadsheet density %s, got %#v", density, spreadsheetModifier["density"])
		}
	}
	for _, viewMode := range []string{"task_list", "kanban"} {
		response = post(
			RouteSetTaskBoardSectionState,
			`{"projectConfigId":"project-alpha","sectionId":"task-board-section","viewMode":"`+viewMode+`","columns":[{"id":"todo","name":"Todo","color":"#3b82f6","sortIndex":0},{"id":"todo","name":"Duplicate","color":"#ef4444","sortIndex":1},{"id":"done","name":"Done","color":"#10b981","sortIndex":2}],"tasks":[{"id":"task-1","title":"Task One","description":"","completed":false,"columnId":"todo","dueDateIso":"","recurrence":"none","recurrenceDays":[],"recurrenceMonths":[],"recurrenceYears":[],"sortIndex":0},{"id":"task-2","title":"Task Two","description":"","completed":true,"columnId":"missing","dueDateIso":"","recurrence":"daily","recurrenceDays":[],"recurrenceMonths":[],"recurrenceYears":[],"sortIndex":1}]}`,
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s=%s, got %d with body %q", RouteSetTaskBoardSectionState, viewMode, response.Code, response.Body.String())
		}
		taskBoardModifier := decodeProjectRouteRawObject(t, latestPayload().ProjectState.Sections["task-board-section"].SharedModifier)
		if taskBoardModifier["viewMode"] != viewMode {
			t.Fatalf("expected task board viewMode %s, got %#v", viewMode, taskBoardModifier["viewMode"])
		}
	}
	response = post(RouteSetImageAreaImagePath, `{"projectConfigId":"project-alpha","sectionId":"image-section","imagePath":"/tmp/updated.png"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetImageAreaImagePath, response.Code, response.Body.String())
	}
	response = post(RouteSetSocialURL, `{"projectConfigId":"project-alpha","sectionId":"social-section","url":"https://example.com/watch?v=123"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetSocialURL, response.Code, response.Body.String())
	}

	payload := latestPayload()
	groupModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["group-section"].SharedModifier)
	if groupModifier["isHorizontalOrientation"] != true {
		t.Fatalf("expected group orientation toggle to persist, got %#v", groupModifier["isHorizontalOrientation"])
	}

	spreadsheetModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["spreadsheet-section"].SharedModifier)
	if spreadsheetModifier["filePath"] != "reports/q1.xlsx" {
		t.Fatalf("expected trimmed spreadsheet filePath, got %#v", spreadsheetModifier["filePath"])
	}
	if spreadsheetModifier["activeSheet"] != "Sheet 2" {
		t.Fatalf("expected spreadsheet activeSheet Sheet 2, got %#v", spreadsheetModifier["activeSheet"])
	}
	if spreadsheetModifier["readOnly"] != true {
		t.Fatalf("expected spreadsheet readOnly=true, got %#v", spreadsheetModifier["readOnly"])
	}
	if spreadsheetModifier["showRowNumbers"] != false {
		t.Fatalf("expected spreadsheet showRowNumbers=false, got %#v", spreadsheetModifier["showRowNumbers"])
	}
	if spreadsheetModifier["density"] != "compact" {
		t.Fatalf("expected final spreadsheet density compact, got %#v", spreadsheetModifier["density"])
	}
	if spreadsheetModifier["autoReloadOnExternalChange"] != true {
		t.Fatalf("expected spreadsheet autoReloadOnExternalChange=true, got %#v", spreadsheetModifier["autoReloadOnExternalChange"])
	}

	taskBoardModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["task-board-section"].SharedModifier)
	if taskBoardModifier["viewMode"] != "kanban" {
		t.Fatalf("expected final task board viewMode kanban, got %#v", taskBoardModifier["viewMode"])
	}
	rawColumns, ok := taskBoardModifier["columns"].([]any)
	if !ok || len(rawColumns) != 2 {
		t.Fatalf("expected two normalized task board columns, got %#v", taskBoardModifier["columns"])
	}
	firstColumn, ok := rawColumns[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first task board column object, got %#v", rawColumns[0])
	}
	if firstColumn["name"] != "Todo" {
		t.Fatalf("expected first task board column to preserve original entry, got %#v", firstColumn["name"])
	}
	rawTasks, ok := taskBoardModifier["tasks"].([]any)
	if !ok || len(rawTasks) != 2 {
		t.Fatalf("expected two task board tasks, got %#v", taskBoardModifier["tasks"])
	}
	secondTask, ok := rawTasks[1].(map[string]any)
	if !ok {
		t.Fatalf("expected second task board task object, got %#v", rawTasks[1])
	}
	if secondTask["columnId"] != nil {
		t.Fatalf("expected unknown task columnId to normalize to nil, got %#v", secondTask["columnId"])
	}

	imageModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["image-section"].SharedModifier)
	if imageModifier["imagePath"] != "/tmp/updated.png" {
		t.Fatalf("expected imagePath /tmp/updated.png, got %#v", imageModifier["imagePath"])
	}

	socialModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["social-section"].SharedModifier)
	if socialModifier["url"] != "https://example.com/watch?v=123" {
		t.Fatalf("expected social url to persist, got %#v", socialModifier["url"])
	}
}

func TestRegisterProjectRoutesSectionDataMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionDataRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	post := func(route string, body string) *httptest.ResponseRecorder {
		t.Helper()

		request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	for _, requestSpec := range []struct {
		name                string
		route               string
		body                string
		expectedCode        int
		expectedErrorCode   string
		expectedMessagePart string
	}{
		{
			name:                "group_orientation_requires_group_section",
			route:               RouteToggleGroupOrientation,
			body:                `{"projectConfigId":"project-alpha","sectionId":"plain-section"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "group_section_required",
			expectedMessagePart: "Section must resolve to a group section.",
		},
		{
			name:                "spreadsheet_path_requires_spreadsheet_section",
			route:               RouteSetSpreadsheetFilePath,
			body:                `{"projectConfigId":"project-alpha","sectionId":"plain-section","filePath":"data.csv","activeSheet":null}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "spreadsheet_section_required",
			expectedMessagePart: "Section must resolve to a spreadsheet section.",
		},
		{
			name:                "spreadsheet_density_rejects_unknown_literal_at_transport",
			route:               RouteSetSpreadsheetSectionSettings,
			body:                `{"projectConfigId":"project-alpha","sectionId":"spreadsheet-section","readOnly":false,"showRowNumbers":true,"density":"dense","autoReloadOnExternalChange":false}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid density value "dense".`,
		},
		{
			name:                "spreadsheet_density_rejects_padded_literal_without_trimming",
			route:               RouteSetSpreadsheetSectionSettings,
			body:                `{"projectConfigId":"project-alpha","sectionId":"spreadsheet-section","readOnly":false,"showRowNumbers":true,"density":" comfortable ","autoReloadOnExternalChange":false}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid density value " comfortable ".`,
		},
		{
			name:                "task_board_requires_task_board_section",
			route:               RouteSetTaskBoardSectionState,
			body:                `{"projectConfigId":"project-alpha","sectionId":"plain-section","viewMode":"kanban","columns":[],"tasks":[]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "task_board_section_required",
			expectedMessagePart: "Section must resolve to a task board section.",
		},
		{
			name:                "task_board_view_mode_rejects_unknown_literal_at_transport",
			route:               RouteSetTaskBoardSectionState,
			body:                `{"projectConfigId":"project-alpha","sectionId":"task-board-section","viewMode":"calendar","columns":[],"tasks":[]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid viewMode value "calendar".`,
		},
		{
			name:                "task_board_view_mode_rejects_padded_literal_without_trimming",
			route:               RouteSetTaskBoardSectionState,
			body:                `{"projectConfigId":"project-alpha","sectionId":"task-board-section","viewMode":" task_list ","columns":[],"tasks":[]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid viewMode value " task_list ".`,
		},
		{
			name:                "image_path_requires_image_section",
			route:               RouteSetImageAreaImagePath,
			body:                `{"projectConfigId":"project-alpha","sectionId":"plain-section","imagePath":"/tmp/image.png"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "image_section_required",
			expectedMessagePart: "Section must resolve to an image section.",
		},
		{
			name:                "social_url_requires_social_section",
			route:               RouteSetSocialURL,
			body:                `{"projectConfigId":"project-alpha","sectionId":"plain-section","url":"https://example.com"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "social_section_required",
			expectedMessagePart: "Section must resolve to a social section.",
		},
	} {
		response := post(requestSpec.route, requestSpec.body)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("%s: expected %d for %s, got %d with body %q", requestSpec.name, requestSpec.expectedCode, requestSpec.route, response.Code, response.Body.String())
		}

		var payload errorResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("%s: decode error payload: %v", requestSpec.name, err)
		}
		if payload.Error.Code != requestSpec.expectedErrorCode {
			t.Fatalf("%s: expected error code %q, got %#v", requestSpec.name, requestSpec.expectedErrorCode, payload)
		}
		if !strings.Contains(payload.Error.Message, requestSpec.expectedMessagePart) {
			t.Fatalf("%s: expected error message to contain %q, got %#v", requestSpec.name, requestSpec.expectedMessagePart, payload)
		}
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	spreadsheetVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["spreadsheet-section"]
	spreadsheetImplID := payload.ProjectState.SectionVariants[spreadsheetVariantID].Impl
	spreadsheetImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[spreadsheetImplID])
	if got := spreadsheetImplPayload["density"]; got != "compact" {
		t.Fatalf("expected rejected density requests to leave spreadsheet density unchanged, got %#v", got)
	}

	taskBoardVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["task-board-section"]
	taskBoardImplID := payload.ProjectState.SectionVariants[taskBoardVariantID].Impl
	taskBoardImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[taskBoardImplID])
	if got := taskBoardImplPayload["viewMode"]; got != "kanban" {
		t.Fatalf("expected rejected task-board viewMode requests to leave viewMode unchanged, got %#v", got)
	}
}

func TestRegisterProjectRoutesSectionDataIDEMutationsAreBlockedInDeploymentModes(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": sectionDataRouteTestProject(t),
					},
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			for _, requestSpec := range []struct {
				route string
				body  string
			}{
				{
					route: RouteToggleGroupOrientation,
					body:  `{"projectConfigId":"project-alpha","sectionId":"group-section"}`,
				},
				{
					route: RouteSetImageAreaImagePath,
					body:  `{"projectConfigId":"project-alpha","sectionId":"image-section","imagePath":"/tmp/example.png"}`,
				},
				{
					route: RouteSetSocialURL,
					body:  `{"projectConfigId":"project-alpha","sectionId":"social-section","url":"https://example.com"}`,
				},
			} {
				request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden {
					t.Fatalf("%s %s: expected 403, got %d with body %q", mode, requestSpec.route, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
					t.Fatalf("%s %s: expected mode_forbidden response, got %q", mode, requestSpec.route, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
					t.Fatalf("%s %s: expected deployment-mode denial detail, got %q", mode, requestSpec.route, response.Body.String())
				}
			}
		})
	}
}

func TestRegisterProjectRoutesSectionDataUsesDeploymentOverlayWhenLayoutChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": sectionDataRouteTestProject(t),
					},
				},
				Policy: map[string]any{
					"allowLayoutChanges": true,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			for _, requestSpec := range []struct {
				route string
				body  string
			}{
				{
					route: RouteSetSpreadsheetFilePath,
					body:  `{"projectConfigId":"project-alpha","sectionId":"spreadsheet-section","filePath":"  reports/q1.xlsx  ","activeSheet":"Sheet 2"}`,
				},
				{
					route: RouteSetSpreadsheetSectionSettings,
					body:  `{"projectConfigId":"project-alpha","sectionId":"spreadsheet-section","readOnly":true,"showRowNumbers":false,"density":"comfortable","autoReloadOnExternalChange":true}`,
				},
				{
					route: RouteSetTaskBoardSectionState,
					body:  `{"projectConfigId":"project-alpha","sectionId":"task-board-section","viewMode":"task_list","columns":[{"id":"todo","name":"Todo","color":"#3b82f6","sortIndex":0},{"id":"todo","name":"Duplicate","color":"#ef4444","sortIndex":1},{"id":"done","name":"Done","color":"#10b981","sortIndex":2}],"tasks":[{"id":"task-1","title":"Task One","description":"","completed":false,"columnId":"todo","dueDateIso":"","recurrence":"none","recurrenceDays":[],"recurrenceMonths":[],"recurrenceYears":[],"sortIndex":0},{"id":"task-2","title":"Task Two","description":"","completed":true,"columnId":"missing","dueDateIso":"","recurrence":"daily","recurrenceDays":[],"recurrenceMonths":[],"recurrenceYears":[],"sortIndex":1}]}`,
				},
			} {
				request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
				}
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			overlaySpreadsheet := decodeProjectRouteRawObject(t, overlayProject.Sections["spreadsheet-section"].SharedModifier)
			if overlaySpreadsheet["filePath"] != "reports/q1.xlsx" {
				t.Fatalf("expected overlay spreadsheet filePath reports/q1.xlsx, got %#v", overlaySpreadsheet["filePath"])
			}
			if overlaySpreadsheet["activeSheet"] != "Sheet 2" {
				t.Fatalf("expected overlay spreadsheet activeSheet Sheet 2, got %#v", overlaySpreadsheet["activeSheet"])
			}
			if overlaySpreadsheet["density"] != "comfortable" {
				t.Fatalf("expected overlay spreadsheet density comfortable, got %#v", overlaySpreadsheet["density"])
			}
			if overlaySpreadsheet["autoReloadOnExternalChange"] != true {
				t.Fatalf("expected overlay spreadsheet autoReloadOnExternalChange=true, got %#v", overlaySpreadsheet["autoReloadOnExternalChange"])
			}
			overlayTaskBoard := decodeProjectRouteRawObject(t, overlayProject.Sections["task-board-section"].SharedModifier)
			if overlayTaskBoard["viewMode"] != "task_list" {
				t.Fatalf("expected overlay task board viewMode task_list, got %#v", overlayTaskBoard["viewMode"])
			}
			overlayColumns, ok := overlayTaskBoard["columns"].([]any)
			if !ok || len(overlayColumns) != 2 {
				t.Fatalf("expected overlay task board normalized columns, got %#v", overlayTaskBoard["columns"])
			}
			overlayTasks, ok := overlayTaskBoard["tasks"].([]any)
			if !ok || len(overlayTasks) != 2 {
				t.Fatalf("expected overlay task board tasks, got %#v", overlayTaskBoard["tasks"])
			}
			secondOverlayTask, ok := overlayTasks[1].(map[string]any)
			if !ok {
				t.Fatalf("expected overlay second task board task object, got %#v", overlayTasks[1])
			}
			if secondOverlayTask["columnId"] != nil {
				t.Fatalf("expected overlay unknown task columnId to normalize to nil, got %#v", secondOverlayTask["columnId"])
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			baseSpreadsheet := decodeProjectRouteRawObject(t, baseProject.Sections["spreadsheet-section"].SharedModifier)
			if len(baseSpreadsheet) != 0 {
				t.Fatalf("expected base spreadsheet shared modifier unchanged, got %#v", baseSpreadsheet)
			}
			baseTaskBoard := decodeProjectRouteRawObject(t, baseProject.Sections["task-board-section"].SharedModifier)
			if len(baseTaskBoard) != 0 {
				t.Fatalf("expected base task board shared modifier unchanged, got %#v", baseTaskBoard)
			}
		})
	}
}

func TestRegisterProjectRoutesSectionDataRejectsDeploymentPolicyWhenLayoutChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": sectionDataRouteTestProject(t),
					},
				},
				Policy: map[string]any{
					"allowLayoutChanges": false,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay before rejected section-data mutations: %v", err)
			}
			beforeSpreadsheet := overlay.Snapshot().Document.Projects["project-alpha"].Sections["spreadsheet-section"]
			beforeTaskBoard := overlay.Snapshot().Document.Projects["project-alpha"].Sections["task-board-section"]

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			for _, requestSpec := range []struct {
				route string
				body  string
			}{
				{
					route: RouteSetSpreadsheetFilePath,
					body:  `{"projectConfigId":"project-alpha","sectionId":"spreadsheet-section","filePath":"  reports/q1.xlsx  ","activeSheet":"Sheet 2"}`,
				},
				{
					route: RouteSetSpreadsheetSectionSettings,
					body:  `{"projectConfigId":"project-alpha","sectionId":"spreadsheet-section","readOnly":true,"showRowNumbers":false,"density":"comfortable","autoReloadOnExternalChange":true}`,
				},
				{
					route: RouteSetTaskBoardSectionState,
					body:  `{"projectConfigId":"project-alpha","sectionId":"task-board-section","viewMode":"task_list","columns":[],"tasks":[]}`,
				},
			} {
				request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden {
					t.Fatalf("expected 403 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
					t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
					t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
				}
			}

			afterProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if !reflect.DeepEqual(afterProject.Sections["spreadsheet-section"], beforeSpreadsheet) {
				t.Fatalf("expected rejected spreadsheet mutations to leave overlay unchanged, got %#v", afterProject.Sections["spreadsheet-section"])
			}
			if !reflect.DeepEqual(afterProject.Sections["task-board-section"], beforeTaskBoard) {
				t.Fatalf("expected rejected task-board mutations to leave overlay unchanged, got %#v", afterProject.Sections["task-board-section"])
			}
		})
	}
}

func TestRegisterProjectRoutesAppendDrawAreaLayerItemPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": drawAreaRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	post := func(body string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteAppendDrawAreaLayerItem, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	requestBody := `{"projectConfigId":"project-alpha","sectionId":"draw-section","layerIdx":0,"element":{"type":"BrushStroke","dataPath":"artifacts/new-stroke.json","transformId":"artifacts/new-transform.json"}}`
	for range 2 {
		response := post(requestBody)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 append response, got %d with body %q", response.Code, response.Body.String())
		}
	}

	latestRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	latestRequest.Header.Set("Content-Type", "application/json")
	latestResponse := httptest.NewRecorder()
	handler.ServeHTTP(latestResponse, latestRequest)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}
	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	drawVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["draw-section"]
	drawImplID := payload.ProjectState.SectionVariants[drawVariantID].Impl
	drawPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[drawImplID])
	rawLayers, ok := drawPayload["layers"].([]any)
	if !ok || len(rawLayers) != 1 {
		t.Fatalf("expected one draw layer, got %#v", drawPayload["layers"])
	}
	layer, ok := rawLayers[0].(map[string]any)
	if !ok {
		t.Fatalf("expected draw layer object, got %#v", rawLayers[0])
	}
	rawElements, ok := layer["elements"].([]any)
	if !ok || len(rawElements) != 2 {
		t.Fatalf("expected duplicate append to keep two layer elements, got %#v", layer["elements"])
	}
	appended, ok := rawElements[1].(map[string]any)
	if !ok {
		t.Fatalf("expected appended draw element object, got %#v", rawElements[1])
	}
	if appended["type"] != "BrushStroke" {
		t.Fatalf("expected appended draw element type BrushStroke, got %#v", appended["type"])
	}
	if appended["dataPath"] != "artifacts/new-stroke.json" {
		t.Fatalf("expected appended draw element dataPath, got %#v", appended["dataPath"])
	}
	if appended["transformId"] != "artifacts/new-transform.json" {
		t.Fatalf("expected appended draw element transformId, got %#v", appended["transformId"])
	}
}

func TestRegisterProjectRoutesAppendDrawAreaLayerItemRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": drawAreaRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	for _, requestSpec := range []struct {
		body         string
		expectedCode int
		expectedBody string
	}{
		{
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","layerIdx":0,"element":{"type":"BrushStroke","dataPath":"artifacts/new-stroke.json","transformId":"artifacts/new-transform.json"}}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"draw_section_required"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionId":"draw-section","layerIdx":4,"element":{"type":"BrushStroke","dataPath":"artifacts/new-stroke.json","transformId":"artifacts/new-transform.json"}}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"draw_layer_index_invalid"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionId":"draw-section","layerIdx":0,"element":{"type":"File","dataPath":"artifacts/new-file.bin","transformId":"artifacts/new-transform.json"}}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"draw_area_layer_item_type_invalid"`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteAppendDrawAreaLayerItem, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("expected %d for appendDrawAreaLayerItem, got %d with body %q", requestSpec.expectedCode, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("expected response body to contain %s, got %q", requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesChartMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": chartRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	post := func(route string, body string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetChartAreaDataPath,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","dataPath":"  artifacts/chart.csv  "}`,
		},
		{
			route: RouteSetChartSettings,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartSettings":{"type":"line","xAxisColumn":"time"},"changedSettings":["xAxisColumn"]}`,
		},
		{
			route: RouteSetChartSettings,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartSettings":{"type":"line","secondYAxisColumns":["humidity","humidity"," pressure "],"y1AxisLog":true,"y2AxisLog":true},"changedSettings":["secondYAxisColumns","y1AxisLog","y2AxisLog"]}`,
		},
		{
			route: RouteSetChartType,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartType":"scatter"}`,
		},
		{
			route: RouteSetChartSettings,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartSettings":{"type":"scatter","categoryColumn":"series","yAxisLog":true},"changedSettings":["categoryColumn","yAxisLog"]}`,
		},
	} {
		response := post(requestSpec.route, requestSpec.body)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
		}
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	chartModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["chart-section"].SharedModifier)
	if chartModifier["dataPath"] != "  artifacts/chart.csv  " {
		t.Fatalf("expected literal chart dataPath, got %#v", chartModifier["dataPath"])
	}
	rawChartSettings, ok := chartModifier["chartSettings"].(map[string]any)
	if !ok {
		t.Fatalf("expected chartSettings object, got %#v", chartModifier["chartSettings"])
	}
	if rawChartSettings["type"] != "scatter" {
		t.Fatalf("expected chartSettings.type scatter, got %#v", rawChartSettings["type"])
	}
	if rawChartSettings["xAxisColumn"] != "time" {
		t.Fatalf("expected preserved xAxisColumn time, got %#v", rawChartSettings["xAxisColumn"])
	}
	if rawChartSettings["categoryColumn"] != "series" {
		t.Fatalf("expected categoryColumn series, got %#v", rawChartSettings["categoryColumn"])
	}
	if rawChartSettings["xAxisLog"] != true {
		t.Fatalf("expected xAxisLog true, got %#v", rawChartSettings["xAxisLog"])
	}
	if rawChartSettings["yAxisLog"] != true {
		t.Fatalf("expected yAxisLog true, got %#v", rawChartSettings["yAxisLog"])
	}
	if rawChartSettings["secondYAxisColumns"] != nil {
		t.Fatalf("expected secondYAxisColumns to clear after scatter conversion, got %#v", rawChartSettings["secondYAxisColumns"])
	}
}

func TestRegisterProjectRoutesChartMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": chartRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	post := func(route string, body string) *httptest.ResponseRecorder {
		t.Helper()

		request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	for _, requestSpec := range []struct {
		name                string
		route               string
		body                string
		expectedCode        int
		expectedErrorCode   string
		expectedMessagePart string
	}{
		{
			name:                "data_path_requires_chart_section",
			route:               RouteSetChartAreaDataPath,
			body:                `{"projectConfigId":"project-alpha","sectionId":"plain-section","dataPath":"chart.csv"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "chart_section_required",
			expectedMessagePart: "Section must resolve to a chart section.",
		},
		{
			name:                "chart_type_rejects_unknown_literal_at_transport",
			route:               RouteSetChartType,
			body:                `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartType":"bar"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid chartType value "bar".`,
		},
		{
			name:                "chart_type_rejects_padded_literal_without_trimming",
			route:               RouteSetChartType,
			body:                `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartType":" scatter "}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid chartType value " scatter ".`,
		},
		{
			name:                "chart_settings_type_rejects_unknown_literal_at_transport",
			route:               RouteSetChartSettings,
			body:                `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartSettings":{"type":"bar"},"changedSettings":[]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid chartSettings.type value "bar".`,
		},
		{
			name:                "chart_settings_type_rejects_padded_literal_without_trimming",
			route:               RouteSetChartSettings,
			body:                `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartSettings":{"type":" line "},"changedSettings":[]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid chartSettings.type value " line ".`,
		},
		{
			name:                "chart_settings_field_validation_still_uses_runtime_error_path",
			route:               RouteSetChartSettings,
			body:                `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartSettings":{"type":"line","categoryColumn":"series"},"changedSettings":["categoryColumn"]}`,
			expectedCode:        http.StatusBadRequest,
			expectedErrorCode:   "chart_settings_field_invalid",
			expectedMessagePart: "chart settings field is invalid",
		},
	} {
		response := post(requestSpec.route, requestSpec.body)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("%s: expected %d for %s, got %d with body %q", requestSpec.name, requestSpec.expectedCode, requestSpec.route, response.Code, response.Body.String())
		}

		var payload errorResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("%s: decode error payload: %v", requestSpec.name, err)
		}
		if payload.Error.Code != requestSpec.expectedErrorCode {
			t.Fatalf("%s: expected error code %q, got %#v", requestSpec.name, requestSpec.expectedErrorCode, payload)
		}
		if !strings.Contains(payload.Error.Message, requestSpec.expectedMessagePart) {
			t.Fatalf("%s: expected error message to contain %q, got %#v", requestSpec.name, requestSpec.expectedMessagePart, payload)
		}
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	chartVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["chart-section"]
	chartImplID := payload.ProjectState.SectionVariants[chartVariantID].Impl
	chartImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[chartImplID])
	rawChartSettings, ok := chartImplPayload["chartSettings"].(map[string]any)
	if !ok {
		t.Fatalf("expected chartSettings object, got %#v", chartImplPayload["chartSettings"])
	}
	if got := rawChartSettings["type"]; got != "line" {
		t.Fatalf("expected rejected chart-type requests to leave chartSettings.type unchanged, got %#v", got)
	}
	if got := rawChartSettings["secondYAxisColumns"]; !reflect.DeepEqual(got, []any{"humidity"}) {
		t.Fatalf("expected rejected chart-type requests to leave secondYAxisColumns unchanged, got %#v", got)
	}
}

func TestRegisterProjectRoutesTextBlockMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": textBlockRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	post := func(route string, body string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+route,
			strings.NewReader(body),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	latestTextModifier := func() (ProjectStateSingleConfigWithCompletedOpIDs, map[string]any) {
		t.Helper()

		latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
		if latestResponse.Code != http.StatusOK {
			t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
		}

		var payload ProjectStateSingleConfigWithCompletedOpIDs
		if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode latest project payload: %v", err)
		}
		return payload, decodeProjectRouteRawObject(t, payload.ProjectState.Sections["text-section"].SharedModifier)
	}

	for _, format := range []string{"Plaintext", "Markdown"} {
		response := post(RouteSetTextBlockFormat, `{"projectConfigId":"project-alpha","sectionId":"text-section","format":"`+format+`"}`)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s=%s, got %d with body %q", RouteSetTextBlockFormat, format, response.Code, response.Body.String())
		}
		_, modifier := latestTextModifier()
		if got := modifier["format"]; got != format {
			t.Fatalf("expected format %s, got %#v", format, got)
		}
	}
	response := post(RouteSetTextBlockHeadingAsSectionName, `{"projectConfigId":"project-alpha","sectionId":"text-section","headingAsSectionName":true}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetTextBlockHeadingAsSectionName, response.Code, response.Body.String())
	}
	response = post(RouteSetTextBlockText, `{"projectConfigId":"project-alpha","sectionId":"text-section","text":"# Updated Heading\n\nBody"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetTextBlockText, response.Code, response.Body.String())
	}
	for _, displayMode := range []string{"Render", "Edit"} {
		response = post(RouteSetTextBlockDisplayMode, `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":"`+displayMode+`"}`)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s=%s, got %d with body %q", RouteSetTextBlockDisplayMode, displayMode, response.Code, response.Body.String())
		}
		_, modifier := latestTextModifier()
		if got := modifier["textDisplayMode"]; got != displayMode {
			t.Fatalf("expected textDisplayMode %s, got %#v", displayMode, got)
		}
	}
	response = post(RouteSetTextBlockMetaControlStyle, `{"projectConfigId":"project-alpha","sectionId":"text-section","metaControlStyle":true}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetTextBlockMetaControlStyle, response.Code, response.Body.String())
	}
	response = post(RouteSetTextBlockMasterFontSize, `{"projectConfigId":"project-alpha","sectionId":"text-section","masterFontSizePx":64}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetTextBlockMasterFontSize, response.Code, response.Body.String())
	}

	payload, textSharedModifier := latestTextModifier()

	textSection := payload.ProjectState.Sections["text-section"]
	if textSection.Name != "Updated Heading" {
		t.Fatalf("expected section name Updated Heading, got %q", textSection.Name)
	}

	if got := textSharedModifier["format"]; got != "Markdown" {
		t.Fatalf("expected format Markdown, got %#v", got)
	}
	if got := textSharedModifier["text"]; got != "# Updated Heading\n\nBody" {
		t.Fatalf("expected updated text, got %#v", got)
	}
	if got := textSharedModifier["textDisplayMode"]; got != "Edit" {
		t.Fatalf("expected textDisplayMode Edit, got %#v", got)
	}
	if got := textSharedModifier["headingAsSectionName"]; got != true {
		t.Fatalf("expected headingAsSectionName true, got %#v", got)
	}
	if got := textSharedModifier["metaControlStyle"]; got != true {
		t.Fatalf("expected metaControlStyle true, got %#v", got)
	}
	if got := textSharedModifier["masterFontSizePx"]; got != float64(48) {
		t.Fatalf("expected masterFontSizePx 48, got %#v", got)
	}
}

func TestRegisterProjectRoutesTextBlockMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": textBlockRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	post := func(route string, body string) *httptest.ResponseRecorder {
		t.Helper()

		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+route,
			strings.NewReader(body),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	for _, requestSpec := range []struct {
		name                string
		route               string
		body                string
		expectedCode        int
		expectedErrorCode   string
		expectedMessagePart string
	}{
		{
			name:                "text_requires_text_block_section",
			route:               RouteSetTextBlockText,
			body:                `{"projectConfigId":"project-alpha","sectionId":"plain-section","text":"hello"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "text_block_section_required",
			expectedMessagePart: "Section must resolve to a text block section.",
		},
		{
			name:                "display_mode_rejects_unknown_literal_at_transport",
			route:               RouteSetTextBlockDisplayMode,
			body:                `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":"Preview"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid textDisplayMode value "Preview".`,
		},
		{
			name:                "display_mode_rejects_padded_literal_without_trimming",
			route:               RouteSetTextBlockDisplayMode,
			body:                `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":" Edit "}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid textDisplayMode value " Edit ".`,
		},
		{
			name:                "format_rejects_unknown_literal_at_transport",
			route:               RouteSetTextBlockFormat,
			body:                `{"projectConfigId":"project-alpha","sectionId":"text-section","format":"HTML"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid format value "HTML".`,
		},
		{
			name:                "format_rejects_padded_literal_without_trimming",
			route:               RouteSetTextBlockFormat,
			body:                `{"projectConfigId":"project-alpha","sectionId":"text-section","format":" Markdown "}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid format value " Markdown ".`,
		},
	} {
		response := post(requestSpec.route, requestSpec.body)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("%s: expected %d for %s, got %d with body %q", requestSpec.name, requestSpec.expectedCode, requestSpec.route, response.Code, response.Body.String())
		}

		var payload errorResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("%s: decode error payload: %v", requestSpec.name, err)
		}
		if payload.Error.Code != requestSpec.expectedErrorCode {
			t.Fatalf("%s: expected error code %q, got %#v", requestSpec.name, requestSpec.expectedErrorCode, payload)
		}
		if !strings.Contains(payload.Error.Message, requestSpec.expectedMessagePart) {
			t.Fatalf("%s: expected error message to contain %q, got %#v", requestSpec.name, requestSpec.expectedMessagePart, payload)
		}
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	textVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["text-section"]
	textImplID := payload.ProjectState.SectionVariants[textVariantID].Impl
	textImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[textImplID])
	if got := textImplPayload["textDisplayMode"]; got != "Render" {
		t.Fatalf("expected invalid display-mode requests to leave textDisplayMode unchanged, got %#v", got)
	}
	if got := textImplPayload["format"]; got != "Plaintext" {
		t.Fatalf("expected invalid format requests to leave format unchanged, got %#v", got)
	}
}

func TestRegisterProjectRoutesTextBlockMutationsUseDeploymentOverlayWhenPolicyAllows(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("text_uses_param_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": textBlockRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowParamChanges":  true,
						"allowLayoutChanges": false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetTextBlockText,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"text-section","text":"# Overlay Heading\n\nBody"}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetTextBlockText, response.Code, response.Body.String())
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayText := decodeProjectRouteRawObject(t, overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"].SharedModifier)
				if got := overlayText["text"]; got != "# Overlay Heading\n\nBody" {
					t.Fatalf("expected overlay text update, got %#v", got)
				}

				baseText := decodeProjectRouteRawObject(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"].Sections["text-section"].SharedModifier)
				if got := baseText["text"]; got != nil {
					t.Fatalf("expected base text block modifier unchanged, got %#v", got)
				}
			})

			t.Run("layout_uses_layout_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": textBlockRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowParamChanges":  false,
						"allowLayoutChanges": true,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				for _, requestSpec := range []struct {
					route string
					body  string
				}{
					{
						route: RouteSetTextBlockDisplayMode,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":"Edit"}`,
					},
					{
						route: RouteSetTextBlockFormat,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","format":"Markdown"}`,
					},
					{
						route: RouteSetTextBlockMasterFontSize,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","masterFontSizePx":64}`,
					},
				} {
					request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusOK {
						t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
					}
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayText := decodeProjectRouteRawObject(t, overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"].SharedModifier)
				if got := overlayText["textDisplayMode"]; got != "Edit" {
					t.Fatalf("expected overlay textDisplayMode Edit, got %#v", got)
				}
				if got := overlayText["format"]; got != "Markdown" {
					t.Fatalf("expected overlay format Markdown, got %#v", got)
				}
				if got := overlayText["masterFontSizePx"]; got != float64(48) {
					t.Fatalf("expected overlay masterFontSizePx 48, got %#v", got)
				}

				baseText := decodeProjectRouteRawObject(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"].Sections["text-section"].SharedModifier)
				if len(baseText) != 0 {
					t.Fatalf("expected base text block modifier unchanged, got %#v", baseText)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesTextBlockMutationsRejectDeploymentPolicyWhenDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("text_rejects_param_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": textBlockRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowParamChanges":  false,
						"allowLayoutChanges": true,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay before rejected text mutation: %v", err)
				}
				before := overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"]

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetTextBlockText,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"text-section","text":"# Forbidden Heading\n\nBody"}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden {
					t.Fatalf("expected 403 for %s, got %d with body %q", RouteSetTextBlockText, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"param_changes_forbidden"`) {
					t.Fatalf("expected param_changes_forbidden body, got %q", response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment policy disallows param changes.") {
					t.Fatalf("expected deployment param policy denial, got %q", response.Body.String())
				}

				after := overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"]
				if !reflect.DeepEqual(after, before) {
					t.Fatalf("expected rejected text mutation to leave overlay unchanged, got %#v", after)
				}
			})

			t.Run("layout_rejects_layout_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": textBlockRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowParamChanges":  true,
						"allowLayoutChanges": false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay before rejected layout mutations: %v", err)
				}
				before := overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"]

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				for _, requestSpec := range []struct {
					route string
					body  string
				}{
					{
						route: RouteSetTextBlockDisplayMode,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":"Edit"}`,
					},
					{
						route: RouteSetTextBlockFormat,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","format":"Markdown"}`,
					},
					{
						route: RouteSetTextBlockMasterFontSize,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","masterFontSizePx":64}`,
					},
				} {
					request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("expected 403 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
						t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
					}
					if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
						t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
					}
				}

				after := overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"]
				if !reflect.DeepEqual(after, before) {
					t.Fatalf("expected rejected layout mutations to leave overlay unchanged, got %#v", after)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesTextBlockParamPolicyAppliesToAllProjectConfigs(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			projectBeta := textBlockRouteTestProject(t)
			projectBeta.ID = "project-beta"
			projectBeta.Name = "Beta"

			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": textBlockRouteTestProject(t),
						"project-beta":  projectBeta,
					},
				},
				Policy: map[string]any{
					"allowParamChanges":  false,
					"allowLayoutChanges": true,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay before rejected text mutation: %v", err)
			}
			before := overlay.Snapshot().Document.Projects["project-beta"].Sections["text-section"]

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSetTextBlockText,
				strings.NewReader(`{"projectConfigId":"project-beta","sectionId":"text-section","text":"blocked"}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403 for %s on project-beta, got %d with body %q", RouteSetTextBlockText, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"param_changes_forbidden"`) {
				t.Fatalf("expected param_changes_forbidden body for project-beta, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment policy disallows param changes.") {
				t.Fatalf("expected deployment param policy denial for project-beta, got %q", response.Body.String())
			}

			after := overlay.Snapshot().Document.Projects["project-beta"].Sections["text-section"]
			if !reflect.DeepEqual(after, before) {
				t.Fatalf("expected rejected project-beta text mutation to leave overlay unchanged, got %#v", after)
			}

			baseProjectBeta := deploymentRuntime.Base().Snapshot().Document.Projects["project-beta"].Sections["text-section"]
			if !reflect.DeepEqual(baseProjectBeta, before) {
				t.Fatalf("expected base project-beta section unchanged, got %#v", baseProjectBeta)
			}
		})
	}
}

func TestRegisterProjectRoutesSetSectionColumnWidthRejectsUnsupportedSection(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": layoutPresentationRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetSectionColumnWidth,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"plain-section","columnWidth":180}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"section_param_column_width_unsupported"`) {
		t.Fatalf("expected section_param_column_width_unsupported body, got %q", response.Body.String())
	}
}
