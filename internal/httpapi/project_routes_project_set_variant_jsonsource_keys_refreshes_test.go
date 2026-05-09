package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesReturnsCompletedFrontendOpIDsAfterMutation(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": viewModesRouteTestProject(t),
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

	// A successful mutation should mark the frontend op completed in the next
	// hydrate payload so optimistic state can clear deterministically.
	mutateRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetViewport,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"frontend-op-1","viewport":{"x":15,"y":25,"zoom":1.25}}`),
	)
	mutateRequest.Header.Set("Content-Type", "application/json")
	mutateResponse := httptest.NewRecorder()
	handler.ServeHTTP(mutateResponse, mutateRequest)
	if mutateResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from setViewport, got %d with body %q", mutateResponse.Code, mutateResponse.Body.String())
	}

	latestRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	latestRequest.Header.Set("Content-Type", "application/json")
	latestResponse := httptest.NewRecorder()
	handler.ServeHTTP(latestResponse, latestRequest)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from getLatestProjectState, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project state payload: %v", err)
	}
	if !reflect.DeepEqual(payload.CompletedOpIDs, []string{"frontend-op-1"}) {
		t.Fatalf("expected completed frontend op id [frontend-op-1], got %#v", payload.CompletedOpIDs)
	}
	if len(payload.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending frontend op ids, got %#v", payload.PendingOpIDs)
	}
	if payload.ProjectState.ProjectConfig.Viewport == nil || payload.ProjectState.ProjectConfig.Viewport.X != 15 {
		t.Fatalf("expected updated viewport in hydrate payload, got %#v", payload.ProjectState.ProjectConfig.Viewport)
	}

	// Completed ids are one-shot metadata and should be cleared after the hydrate
	// that exposes them.
	secondLatestRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	secondLatestRequest.Header.Set("Content-Type", "application/json")
	secondLatestResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondLatestResponse, secondLatestRequest)
	if secondLatestResponse.Code != http.StatusOK {
		t.Fatalf("expected second 200 from getLatestProjectState, got %d with body %q", secondLatestResponse.Code, secondLatestResponse.Body.String())
	}
	if err := json.Unmarshal(secondLatestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode second latest project state payload: %v", err)
	}
	if len(payload.CompletedOpIDs) != 0 {
		t.Fatalf("expected completed frontend op ids to clear after hydration, got %#v", payload.CompletedOpIDs)
	}
}

func TestRegisterProjectRoutesSetCodeInvokesServiceAndReturnsOK(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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

	var captured projectRouteSetCodeCall
	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			setCode: func(_ context.Context, projectID string, sectionID string, code string) error {
				captured = projectRouteSetCodeCall{
					ProjectID: projectID,
					SectionID: sectionID,
					Code:      code,
				}
				return nil
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1","code":"print('updated')\n"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if captured != (projectRouteSetCodeCall{
		ProjectID: "project-alpha",
		SectionID: "section-1",
		Code:      "print('updated')\n",
	}) {
		t.Fatalf("unexpected setCode call %#v", captured)
	}
}

func TestRegisterProjectRoutesCreatesTopLevelPluginLanguageSection(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Code","implOverrides":{"type":"Code","codeLanguage":"FixtureDSL"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}
	if strings.TrimSpace(payload.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	_, _, impl, err := project.ResolveSection(payload.SectionID)
	if err != nil {
		t.Fatalf("resolve created section: %v", err)
	}
	if !impl.IsCode() || impl.Code == nil {
		t.Fatalf("expected created code section, got %#v", impl)
	}
	if impl.Code.Language != projectstate.CodeLanguage("fixturedsl") {
		t.Fatalf("expected plugin code language fixturedsl, got %q", impl.Code.Language)
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionSeedsWorkflowDefaults(t *testing.T) {
	t.Parallel()

	cases := []struct {
		implType     string
		wantLabel    string
		wantGateType string
	}{
		{
			implType:  "StateMachineStart",
			wantLabel: "Start",
		},
		{
			implType:     "StateMachineGate",
			wantGateType: string(projectstate.StateMachineGateTypeAND),
		},
		{
			implType:  "StateMachineEnd",
			wantLabel: "End",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.implType, func(t *testing.T) {
			t.Parallel()

			projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
				SchemaVersion:    projectstate.CurrentSchemaVersion,
				DefaultProjectID: "project-alpha",
				Projects: map[string]projectstate.Project{
					"project-alpha": {
						ID:   "project-alpha",
						Name: "Alpha",
					},
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
				"/api"+RouteCreateTopLevelSection,
				strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","implType":"%s"}`, tc.implType)),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
			}

			var payload projectstate.CreateTopLevelSectionResult
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode createTopLevelSection response: %v", err)
			}
			if strings.TrimSpace(payload.SectionID) == "" {
				t.Fatalf("expected created section id, got %#v", payload)
			}

			project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
			if err != nil {
				t.Fatalf("project snapshot: %v", err)
			}
			_, _, impl, err := project.ResolveSection(payload.SectionID)
			if err != nil {
				t.Fatalf("resolve created section: %v", err)
			}
			implPayload := decodeProjectRouteRawObject(t, impl.Payload)
			if got, _ := implPayload["type"].(string); got != tc.implType {
				t.Fatalf("expected created type %q, got %#v", tc.implType, implPayload["type"])
			}
			if got, _ := implPayload["machineGroupId"].(string); strings.TrimSpace(got) == "" {
				t.Fatalf("expected created machineGroupId for %s, got %#v", tc.implType, implPayload)
			}
			if tc.wantLabel != "" {
				if got := implPayload["label"]; got != tc.wantLabel {
					t.Fatalf("expected created label %q, got %#v", tc.wantLabel, got)
				}
			}
			if tc.wantGateType != "" {
				if got := implPayload["gateType"]; got != tc.wantGateType {
					t.Fatalf("expected created gateType %q, got %#v", tc.wantGateType, got)
				}
			}
		})
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionAppliesDefaultTaskBoardColumns(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"TaskBoard"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}
	if strings.TrimSpace(payload.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	_, _, impl, err := project.ResolveSection(payload.SectionID)
	if err != nil {
		t.Fatalf("resolve created section: %v", err)
	}
	implPayload := decodeProjectRouteRawObject(t, impl.Payload)
	rawColumns, ok := implPayload["columns"].([]any)
	if !ok || len(rawColumns) != 3 {
		t.Fatalf("expected seeded task board columns, got %#v", implPayload["columns"])
	}
	gotNames := make([]string, 0, len(rawColumns))
	for _, rawColumn := range rawColumns {
		column, ok := rawColumn.(map[string]any)
		if !ok {
			t.Fatalf("expected task board column object, got %#v", rawColumn)
		}
		if got := column["id"]; got == nil || strings.TrimSpace(fmt.Sprintf("%v", got)) == "" {
			t.Fatalf("expected seeded task board column id, got %#v", column)
		}
		gotNames = append(gotNames, fmt.Sprintf("%v", column["name"]))
	}
	if !reflect.DeepEqual(gotNames, []string{"Todo", "Doing", "Done"}) {
		t.Fatalf("expected seeded task board column names, got %#v", gotNames)
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionSupportsIFrame(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"IFrame"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	_, _, impl, err := project.ResolveSection(payload.SectionID)
	if err != nil {
		t.Fatalf("resolve created iframe section: %v", err)
	}
	implPayload := decodeProjectRouteRawObject(t, impl.Payload)
	if got, _ := implPayload["type"].(string); got != "IFrame" {
		t.Fatalf("expected created type IFrame, got %#v", implPayload["type"])
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionAppliesSnapshotViewportAndName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": mustNormalizedProjectRouteProject(t, projectstate.Project{
				ID:               "project-alpha",
				Name:             "Alpha",
				ActiveViewModeID: "focus",
				TopLevelSectionIDs: []string{
					"existing-section",
				},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"existing-section": {X: 10, Y: 20, ZIndex: 1},
				},
				ViewModes: map[string]projectstate.ViewMode{
					"focus": {
						ID: "focus",
						TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
							"existing-section": {X: 10, Y: 20, ZIndex: 1},
						},
						VisibilityBySectionID: map[string]bool{
							"existing-section": true,
						},
					},
				},
				SectionVariantMap: map[string]string{
					"existing-section": "existing-variant",
				},
				Sections: map[string]projectstate.Section{
					"existing-section": {
						ID:               "existing-section",
						Name:             "Existing",
						VariantIDs:       []string{"existing-variant"},
						DefaultVariantID: "existing-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"existing-variant": {
						ID:               "existing-variant",
						ImplID:           "existing-impl",
						NonPresetImplIDs: []string{"existing-impl"},
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"existing-impl": {
						ID:      "existing-impl",
						Kind:    projectstate.SectionKind("textblock"),
						Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "existing-impl", "type": "TextBlock"}),
					},
				},
			}),
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
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Chat","name":"Planning Chat","topLevelSections":{"existing-section":{"x":840,"y":240,"zIndex":9}},"viewportBounds":{"x":760,"y":160,"w":1200,"h":700}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}
	if strings.TrimSpace(payload.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload)
	}
	if payload.PanTo != nil {
		t.Fatalf("expected in-viewport placement without pan hint, got %#v", payload.PanTo)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	created, ok := project.Sections[payload.SectionID]
	if !ok {
		t.Fatalf("expected created section in snapshot, got %#v", project.Sections)
	}
	if created.Name != "Planning Chat" {
		t.Fatalf("expected created section name to persist, got %#v", created)
	}

	layout := project.TopLevelSections[payload.SectionID]
	if layout.X <= 400 || layout.Y < 160 {
		t.Fatalf("expected created layout near the live viewport, got %#v", layout)
	}
	existingLayout := project.TopLevelSections["existing-section"]
	if existingLayout.X != 840 || existingLayout.Y != 240 || existingLayout.ZIndex != 9 {
		t.Fatalf("expected snapshot layout update for existing section, got %#v", existingLayout)
	}
	if project.ViewModes["focus"].TopLevelSections["existing-section"].X != 840 || project.ViewModes["focus"].TopLevelSections["existing-section"].Y != 240 {
		t.Fatalf("expected active view mode layout update, got %#v", project.ViewModes["focus"].TopLevelSections["existing-section"])
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionReturnsMetaControlParamIDAndHonorsExplicitPosition(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"MetaControl","controlCodeObjType":"TextParam","position":{"x":-44,"y":91}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}
	if strings.TrimSpace(payload.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload)
	}
	if payload.MetaControlParamID == nil || strings.TrimSpace(*payload.MetaControlParamID) == "" {
		t.Fatalf("expected created meta control param id, got %#v", payload)
	}
	if payload.PanTo != nil {
		t.Fatalf("expected explicit-position create to omit pan hint, got %#v", payload.PanTo)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	layout, ok := project.TopLevelSections[payload.SectionID]
	if !ok {
		t.Fatalf("expected created layout in snapshot, got %#v", project.TopLevelSections)
	}
	if layout.X != -44 || layout.Y != 91 {
		t.Fatalf("expected explicit position {-44 91}, got %#v", layout)
	}

	_, _, impl, err := project.ResolveSection(payload.SectionID)
	if err != nil {
		t.Fatalf("resolve created section: %v", err)
	}
	implPayload := decodeProjectRouteRawObject(t, impl.Payload)
	if got, _ := implPayload["metaControlParamId"].(string); got != *payload.MetaControlParamID {
		t.Fatalf("expected created meta control payload id %q, got %#v", *payload.MetaControlParamID, implPayload["metaControlParamId"])
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionSupportsFullMetaControlTypeFamily(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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
	testCases := []struct {
		name         string
		controlType  *string
		expectedType string
	}{
		{name: "default omitted", expectedType: "SliderParam"},
		{name: "code", controlType: stringPointer("CodeParam"), expectedType: "CodeParam"},
		{name: "text", controlType: stringPointer("TextParam"), expectedType: "TextParam"},
		{name: "date", controlType: stringPointer("DateParam"), expectedType: "DateParam"},
		{name: "time", controlType: stringPointer("TimeParam"), expectedType: "TimeParam"},
		{name: "text area", controlType: stringPointer("TextAreaParam"), expectedType: "TextAreaParam"},
		{name: "slider", controlType: stringPointer("SliderParam"), expectedType: "SliderParam"},
		{name: "rotary", controlType: stringPointer("RotaryParam"), expectedType: "RotaryParam"},
		{name: "switch", controlType: stringPointer("SwitchParam"), expectedType: "SwitchParam"},
		{name: "color picker", controlType: stringPointer("ColorPickerParam"), expectedType: "ColorPickerParam"},
		{name: "dropdown", controlType: stringPointer("DropdownParam"), expectedType: "DropdownParam"},
		{name: "password", controlType: stringPointer("PasswordParam"), expectedType: "PasswordParam"},
		{name: "button", controlType: stringPointer("ButtonParam"), expectedType: "ButtonParam"},
		{name: "dropzone", controlType: stringPointer("DropzoneParam"), expectedType: "DropzoneParam"},
	}

	for _, tc := range testCases {
		requestPayload := map[string]any{
			"projectConfigId": "project-alpha",
			"implType":        "MetaControl",
		}
		if tc.controlType != nil {
			requestPayload["controlCodeObjType"] = *tc.controlType
		}
		body, err := json.Marshal(requestPayload)
		if err != nil {
			t.Fatalf("marshal %s request: %v", tc.name, err)
		}

		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteCreateTopLevelSection,
			strings.NewReader(string(body)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s meta control create, got %d with body %q", tc.name, response.Code, response.Body.String())
		}

		var payload projectstate.CreateTopLevelSectionResult
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode %s createTopLevelSection response: %v", tc.name, err)
		}
		if payload.MetaControlParamID == nil || strings.TrimSpace(*payload.MetaControlParamID) == "" {
			t.Fatalf("expected meta control param id for %s, got %#v", tc.name, payload)
		}

		project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
		if err != nil {
			t.Fatalf("project snapshot after %s meta control create: %v", tc.name, err)
		}
		codeObjPayload, _, _, _, err := project.ResolveSectionCodeObject(payload.SectionID, *payload.MetaControlParamID)
		if err != nil {
			t.Fatalf("resolve %s meta control code object: %v", tc.name, err)
		}
		if got := payloadStringField(codeObjPayload, "type"); got != tc.expectedType {
			t.Fatalf("expected %s control type %q, got %q", tc.name, tc.expectedType, got)
		}
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionReturns422ForInvalidInitialName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Chat","name":"   "}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}

	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection error response: %v", err)
	}
	if payload["detail"] != "Section name cannot be empty." {
		t.Fatalf("expected invalid section-name detail, got %#v", payload)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	if len(project.Sections) != 0 {
		t.Fatalf("expected invalid createTopLevelSection request to avoid partial state, got %#v", project.Sections)
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionRemainsIDEOnlyInDeployment(t *testing.T) {
	t.Parallel()

	assertProjectUnchanged := func(t *testing.T, project projectstate.Project) {
		t.Helper()
		if len(project.Sections) != 0 {
			t.Fatalf("expected no sections after rejected deployment createTopLevelSection, got %#v", project.Sections)
		}
		if len(project.TopLevelSectionIDs) != 0 {
			t.Fatalf("expected no top-level section ids after rejected deployment createTopLevelSection, got %#v", project.TopLevelSectionIDs)
		}
		if len(project.TopLevelSections) != 0 {
			t.Fatalf("expected no top-level layouts after rejected deployment createTopLevelSection, got %#v", project.TopLevelSections)
		}
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			for _, allowRun := range []bool{true, false} {
				t.Run(fmt.Sprintf("allowRun=%t", allowRun), func(t *testing.T) {
					deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
						Mode: mode,
						Document: projectstate.Document{
							SchemaVersion:    projectstate.CurrentSchemaVersion,
							DefaultProjectID: "project-alpha",
							Projects: map[string]projectstate.Project{
								"project-alpha": {
									ID:   "project-alpha",
									Name: "Alpha",
								},
							},
						},
						Policy: map[string]any{
							"allowRun": allowRun,
						},
					})
					if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
						t.Fatalf("create deployment session: %v", err)
					}

					handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
					request := httptest.NewRequest(
						http.MethodPost,
						"/api"+RouteCreateTopLevelSection,
						strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Terminal"}`),
					)
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("%s allowRun=%t: expected 403, got %d with body %q", mode, allowRun, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
						t.Fatalf("%s allowRun=%t: expected mode_forbidden response, got %q", mode, allowRun, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
						t.Fatalf("%s allowRun=%t: expected deployment-mode denial detail, got %q", mode, allowRun, response.Body.String())
					}

					overlay, err := deploymentRuntime.Overlay("share-a")
					if err != nil {
						t.Fatalf("deployment overlay: %v", err)
					}
					assertProjectUnchanged(t, overlay.Snapshot().Document.Projects["project-alpha"])
					assertProjectUnchanged(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"])
				})
			}
		})
	}
}

func TestRegisterProjectRoutesFormatCodeInvokesServiceAndReturnsOK(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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

	var captured projectRouteFormatCodeCall
	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			formatCode: func(_ context.Context, projectID string, sectionID string) error {
				captured = projectRouteFormatCodeCall{
					ProjectID: projectID,
					SectionID: sectionID,
				}
				return nil
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteFormatCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if captured != (projectRouteFormatCodeCall{
		ProjectID: "project-alpha",
		SectionID: "section-1",
	}) {
		t.Fatalf("unexpected formatCode call %#v", captured)
	}
}

func TestRegisterProjectRoutesFormatCodeIsBlockedInDeploymentModes(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": {
							ID:   "project-alpha",
							Name: "Alpha",
						},
					},
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteFormatCode,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1"}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected %s formatCode route to be blocked with 403, got %d with body %q", mode, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
				t.Fatalf("expected mode_forbidden response, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
				t.Fatalf("expected deployment-mode denial detail, got %q", response.Body.String())
			}
		})
	}
}

func TestRegisterProjectRoutesMixedParamPolicyRoutesRemainIDEOnlyInDeployment(t *testing.T) {
	t.Parallel()

	requestSpecs := []struct {
		name  string
		route string
		body  string
	}{
		{
			name:  "set_code",
			route: RouteSetCode,
			body:  `{"projectConfigId":"project-alpha","sectionId":"code-section","code":"print('blocked')\n"}`,
		},
		{
			name:  "format_code",
			route: RouteFormatCode,
			body:  `{"projectConfigId":"project-alpha","sectionId":"code-section"}`,
		},
		{
			name:  "set_callable",
			route: RouteSetCallable,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","callableName":"sorted","refetchParams":false}`,
		},
		{
			name:  "set_gen_code_prefix",
			route: RouteSetGenCodePrefix,
			body:  `{"projectConfigId":"project-alpha","genCodePrefix":"import math\n"}`,
		},
		{
			name:  "set_gen_code_suffix",
			route: RouteSetGenCodeSuffix,
			body:  `{"projectConfigId":"project-alpha","genCodeSuffix":"state = CustomState()\n"}`,
		},
		{
			name:  "append_draw_area_layer_item",
			route: RouteAppendDrawAreaLayerItem,
			body:  `{"projectConfigId":"project-alpha","sectionId":"draw-section","layerIdx":0,"element":{"type":"BrushStroke","dataPath":"artifacts/new-stroke.json","transformId":"artifacts/new-transform.json"}}`,
		},
		{
			name:  "set_image_area_image_path",
			route: RouteSetImageAreaImagePath,
			body:  `{"projectConfigId":"project-alpha","sectionId":"image-section","imagePath":"image.png"}`,
		},
		{
			name:  "set_chart_area_data_path",
			route: RouteSetChartAreaDataPath,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","dataPath":"artifacts/chart.csv"}`,
		},
		{
			name:  "set_chart_type",
			route: RouteSetChartType,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartType":"scatter"}`,
		},
		{
			name:  "set_chart_settings",
			route: RouteSetChartSettings,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartSettings":{"type":"scatter","categoryColumn":"series"},"changedSettings":["categoryColumn"]}`,
		},
		{
			name:  "add_kwarg",
			route: RouteAddKwarg,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section"}`,
		},
		{
			name:  "delete_kwarg",
			route: RouteDeleteKwarg,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section"}`,
		},
		{
			name:  "get_password_param_value",
			route: RouteGetPasswordParamValue,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramInfoId":"password-param"}`,
		},
	}

	projectSnapshotJSON := func(t *testing.T, project projectstate.Project) string {
		t.Helper()

		raw, err := json.Marshal(project)
		if err != nil {
			t.Fatalf("marshal project snapshot: %v", err)
		}
		return string(raw)
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			for _, allowParamChanges := range []bool{false, true} {
				t.Run(fmt.Sprintf("allow_param_changes=%t", allowParamChanges), func(t *testing.T) {
					for _, requestSpec := range requestSpecs {
						t.Run(requestSpec.name, func(t *testing.T) {
							deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
								Mode: mode,
								Document: projectstate.Document{
									SchemaVersion:    projectstate.CurrentSchemaVersion,
									DefaultProjectID: "project-alpha",
									Projects: map[string]projectstate.Project{
										"project-alpha": {
											ID:   "project-alpha",
											Name: "Alpha",
										},
									},
								},
								Policy: map[string]any{
									"allowParamChanges": allowParamChanges,
								},
							})
							if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
								t.Fatalf("create deployment session: %v", err)
							}

							overlay, err := deploymentRuntime.Overlay("share-a")
							if err != nil {
								t.Fatalf("deployment overlay: %v", err)
							}
							beforeOverlay := projectSnapshotJSON(t, overlay.Snapshot().Document.Projects["project-alpha"])
							beforeBase := projectSnapshotJSON(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"])

							handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
							request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
							request.Header.Set("Content-Type", "application/json")
							request.Header.Set(modes.ShareSessionHeaderName, "share-a")
							response := httptest.NewRecorder()
							handler.ServeHTTP(response, request)
							if response.Code != http.StatusForbidden {
								t.Fatalf(
									"%s allowParamChanges=%t %s: expected 403, got %d with body %q",
									mode,
									allowParamChanges,
									requestSpec.route,
									response.Code,
									response.Body.String(),
								)
							}
							if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
								t.Fatalf(
									"%s allowParamChanges=%t %s: expected mode_forbidden response, got %q",
									mode,
									allowParamChanges,
									requestSpec.route,
									response.Body.String(),
								)
							}
							if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
								t.Fatalf(
									"%s allowParamChanges=%t %s: expected deployment-mode denial detail, got %q",
									mode,
									allowParamChanges,
									requestSpec.route,
									response.Body.String(),
								)
							}

							afterOverlay := projectSnapshotJSON(t, overlay.Snapshot().Document.Projects["project-alpha"])
							if afterOverlay != beforeOverlay {
								t.Fatalf(
									"%s allowParamChanges=%t %s: expected rejected request to leave overlay unchanged, got before=%s after=%s",
									mode,
									allowParamChanges,
									requestSpec.route,
									beforeOverlay,
									afterOverlay,
								)
							}
							afterBase := projectSnapshotJSON(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"])
							if afterBase != beforeBase {
								t.Fatalf(
									"%s allowParamChanges=%t %s: expected rejected request to leave base unchanged, got before=%s after=%s",
									mode,
									allowParamChanges,
									requestSpec.route,
									beforeBase,
									afterBase,
								)
							}
						})
					}
				})
			}
		})
	}
}
