package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

func TestRegisterProjectRoutesProjectChatWindowingMutationsPersistAndTrackFrontendOps(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectChatWindowingRouteTestDocument())
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	layoutRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectChatWindowingState,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"windowing-layout-op","state":{"instancesById":{"project-chat-window-1":{"instanceId":"project-chat-window-1","placement":"floating","mode":"project_ai_mode","chatId":"chat-before","title":"Project AI"},"project-chat-window-2":{"instanceId":"project-chat-window-2","placement":"floating","mode":"section_mode","sectionIdOrNull":"section-a","title":"Section A"}},"order":["project-chat-window-2","project-chat-window-1"],"nextInstanceNumber":3}}`),
	)
	layoutRequest.Header.Set("Content-Type", "application/json")
	layoutResponse := httptest.NewRecorder()
	handler.ServeHTTP(layoutResponse, layoutRequest)
	if layoutResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 layout response, got %d with body %q", layoutResponse.Code, layoutResponse.Body.String())
	}

	var layoutPayload projectstate.ProjectChatWindowingState
	if err := json.Unmarshal(layoutResponse.Body.Bytes(), &layoutPayload); err != nil {
		t.Fatalf("decode layout response: %v", err)
	}
	if !reflect.DeepEqual(layoutPayload.Order, []string{"project-chat-window-2", "project-chat-window-1"}) {
		t.Fatalf("expected layout order [project-chat-window-2 project-chat-window-1], got %#v", layoutPayload.Order)
	}
	if layoutPayload.InstancesByID["project-chat-window-2"].Title != nil {
		t.Fatalf("expected section-bound project chat title to normalize away, got %#v", layoutPayload.InstancesByID["project-chat-window-2"].Title)
	}

	chatIDRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectChatWindowChatID,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"windowing-chat-op","instanceId":"project-chat-window-1","chatId":"chat-after"}`),
	)
	chatIDRequest.Header.Set("Content-Type", "application/json")
	chatIDResponse := httptest.NewRecorder()
	handler.ServeHTTP(chatIDResponse, chatIDRequest)
	if chatIDResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 chat-id response, got %d with body %q", chatIDResponse.Code, chatIDResponse.Body.String())
	}

	var chatIDPayload projectstate.ProjectChatWindowingState
	if err := json.Unmarshal(chatIDResponse.Body.Bytes(), &chatIDPayload); err != nil {
		t.Fatalf("decode chat-id response: %v", err)
	}
	if chatIDPayload.InstancesByID["project-chat-window-1"].ChatID == nil || *chatIDPayload.InstancesByID["project-chat-window-1"].ChatID != "chat-after" {
		t.Fatalf("expected chat-after binding, got %#v", chatIDPayload.InstancesByID["project-chat-window-1"].ChatID)
	}

	createRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateWindowSpace,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"window-space-create-op","name":"Focused Layout","state":{"windowsById":{"project-chat-window-2":{"surfaceKind":"section","sectionIdOrNull":"section-a","mode":"section_mode","normalizedBounds":{"x":0,"y":0,"width":1,"height":1}}},"order":["project-chat-window-2"]}}`),
	)
	createRequest.Header.Set("Content-Type", "application/json")
	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 create response, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	var createdWindowSpace projectstate.WindowSpaceConfig
	if err := json.Unmarshal(createResponse.Body.Bytes(), &createdWindowSpace); err != nil {
		t.Fatalf("decode create window space response: %v", err)
	}
	if createdWindowSpace.ID == "" {
		t.Fatal("expected created window space id")
	}
	if createdWindowSpace.WindowsByID == nil {
		t.Fatal("expected created window space windowsById map to be non-nil")
	}
	if createdWindowSpace.Order == nil {
		t.Fatal("expected created window space order slice to be non-nil")
	}

	renameRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetWindowSpaceName,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"window-space-rename-op","windowSpaceId":"`+createdWindowSpace.ID+`","name":"Renamed Layout"}`),
	)
	renameRequest.Header.Set("Content-Type", "application/json")
	renameResponse := httptest.NewRecorder()
	handler.ServeHTTP(renameResponse, renameRequest)
	if renameResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 rename response, got %d with body %q", renameResponse.Code, renameResponse.Body.String())
	}

	sortRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetWindowSpaceSortOrder,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"window-space-sort-op","orderedWindowSpaceIds":["`+createdWindowSpace.ID+`","space-a"]}`),
	)
	sortRequest.Header.Set("Content-Type", "application/json")
	sortResponse := httptest.NewRecorder()
	handler.ServeHTTP(sortResponse, sortRequest)
	if sortResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 sort response, got %d with body %q", sortResponse.Code, sortResponse.Body.String())
	}

	deleteRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteWindowSpace,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"window-space-delete-op","windowSpaceId":"space-a"}`),
	)
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteResponse := httptest.NewRecorder()
	handler.ServeHTTP(deleteResponse, deleteRequest)
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 delete response, got %d with body %q", deleteResponse.Code, deleteResponse.Body.String())
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
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var latestPayload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &latestPayload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	if !reflect.DeepEqual(latestPayload.CompletedOpIDs, []string{
		"windowing-layout-op",
		"windowing-chat-op",
		"window-space-create-op",
		"window-space-rename-op",
		"window-space-sort-op",
		"window-space-delete-op",
	}) {
		t.Fatalf("unexpected completed op ids %#v", latestPayload.CompletedOpIDs)
	}
	if latestPayload.ProjectState.ProjectChatWindowing.InstancesByID["project-chat-window-1"].ChatID == nil || *latestPayload.ProjectState.ProjectChatWindowing.InstancesByID["project-chat-window-1"].ChatID != "chat-after" {
		t.Fatalf("expected persisted chat-after binding, got %#v", latestPayload.ProjectState.ProjectChatWindowing.InstancesByID["project-chat-window-1"].ChatID)
	}
	if _, ok := latestPayload.ProjectState.ProjectConfig.WindowSpaces["space-a"]; ok {
		t.Fatal("expected deleted window space space-a to be absent")
	}
	renamedWindowSpace, ok := latestPayload.ProjectState.ProjectConfig.WindowSpaces[createdWindowSpace.ID]
	if !ok {
		t.Fatalf("expected created window space %q in latest state", createdWindowSpace.ID)
	}
	if renamedWindowSpace.Name != "Renamed Layout" {
		t.Fatalf("expected renamed window space, got %q", renamedWindowSpace.Name)
	}
	if renamedWindowSpace.SortIndex != 0 {
		t.Fatalf("expected renamed window space sort index 0, got %d", renamedWindowSpace.SortIndex)
	}
}

func TestRegisterProjectRoutesProjectChatWindowingMutationsRejectInvalidPayloads(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectChatWindowingRouteTestDocument())
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	layoutRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectChatWindowingState,
		strings.NewReader(`{"projectConfigId":"project-alpha","state":{"instancesById":{"project-chat-window-1":{"instanceId":"project-chat-window-1","placement":"floating","mode":"project_ai_mode","chatId":"chat-before"},"project-chat-window-2":{"instanceId":"project-chat-window-2","placement":"canvas_section","mode":"git_graph_mode"}},"order":["project-chat-window-1","project-chat-window-2"],"nextInstanceNumber":3}}`),
	)
	layoutRequest.Header.Set("Content-Type", "application/json")
	layoutResponse := httptest.NewRecorder()
	handler.ServeHTTP(layoutResponse, layoutRequest)
	if layoutResponse.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 layout response, got %d with body %q", layoutResponse.Code, layoutResponse.Body.String())
	}

	var layoutError errorResponse
	if err := json.Unmarshal(layoutResponse.Body.Bytes(), &layoutError); err != nil {
		t.Fatalf("decode layout error response: %v", err)
	}
	if layoutError.Error.Code != "invalid_project_chat_windowing" {
		t.Fatalf("expected invalid_project_chat_windowing, got %#v", layoutError)
	}

	windowSpaceRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateWindowSpace,
		strings.NewReader(`{"projectConfigId":"project-alpha","name":"Focused Layout","state":{"windowsById":{"window-a":{"surfaceKind":"section","sectionIdOrNull":"section-a","mode":"section_mode","chatId":"stale-chat"}},"order":["window-a"]}}`),
	)
	windowSpaceRequest.Header.Set("Content-Type", "application/json")
	windowSpaceResponse := httptest.NewRecorder()
	handler.ServeHTTP(windowSpaceResponse, windowSpaceRequest)
	if windowSpaceResponse.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 window-space response, got %d with body %q", windowSpaceResponse.Code, windowSpaceResponse.Body.String())
	}

	var windowSpaceError errorResponse
	if err := json.Unmarshal(windowSpaceResponse.Body.Bytes(), &windowSpaceError); err != nil {
		t.Fatalf("decode window-space error response: %v", err)
	}
	if windowSpaceError.Error.Code != "invalid_window_space_state" {
		t.Fatalf("expected invalid_window_space_state, got %#v", windowSpaceError)
	}
}

func TestRegisterProjectRoutesSetWindowSpaceNameReturns422ForInvalidName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectChatWindowingRouteTestDocument())
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
		"/api"+RouteSetWindowSpaceName,
		strings.NewReader(`{"projectConfigId":"project-alpha","windowSpaceId":"space-a","name":"bad/name"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 rename response, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode rename error response: %v", err)
	}
	if payload.Error.Code != "invalid_window_space_name" {
		t.Fatalf("expected invalid_window_space_name, got %#v", payload)
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if got := project.WindowSpaces["space-a"].Name; got != "Primary" {
		t.Fatalf("expected rejected rename to keep Primary, got %q", got)
	}
}

func TestRegisterProjectRoutesWindowSpaceRoutesReturnTyped404And422Mappings(t *testing.T) {
	t.Parallel()

	document := projectChatWindowingRouteTestDocument()
	project := document.Projects["project-alpha"]
	project.WindowSpaces["space-b"] = projectstate.WindowSpaceConfig{
		ID:        "space-b",
		Name:      "Secondary",
		SortIndex: 1,
	}
	document.Projects["project-alpha"] = project

	projectRuntime, err := projectstate.OpenOverlayRuntime(document)
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
		route        string
		body         string
		expectedCode int
		expectedBody string
	}{
		{
			name:         "rename missing window space",
			route:        RouteSetWindowSpaceName,
			body:         `{"projectConfigId":"project-alpha","windowSpaceId":"missing-space","name":"Renamed Layout"}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"window_space_not_found"`,
		},
		{
			name:         "delete missing window space",
			route:        RouteDeleteWindowSpace,
			body:         `{"projectConfigId":"project-alpha","windowSpaceId":"missing-space"}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"window_space_not_found"`,
		},
		{
			name:         "sort missing window space",
			route:        RouteSetWindowSpaceSortOrder,
			body:         `{"projectConfigId":"project-alpha","orderedWindowSpaceIds":["space-a","missing-space"]}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"window_space_not_found"`,
		},
		{
			name:         "sort duplicate window spaces",
			route:        RouteSetWindowSpaceSortOrder,
			body:         `{"projectConfigId":"project-alpha","orderedWindowSpaceIds":["space-a","space-a"]}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"invalid_window_space_sort_order"`,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+testCase.route,
				strings.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != testCase.expectedCode {
				t.Fatalf("expected %d, got %d with body %q", testCase.expectedCode, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), testCase.expectedBody) {
				t.Fatalf("expected body to contain %s, got %q", testCase.expectedBody, response.Body.String())
			}
		})
	}

	persisted := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if got := persisted.WindowSpaces["space-a"].Name; got != "Primary" {
		t.Fatalf("expected failed window-space mutations to keep Primary, got %q", got)
	}
	if got := persisted.WindowSpaces["space-a"].SortIndex; got != 0 {
		t.Fatalf("expected failed window-space mutations to keep space-a sort index 0, got %d", got)
	}
	if got := persisted.WindowSpaces["space-b"].SortIndex; got != 1 {
		t.Fatalf("expected failed window-space mutations to keep space-b sort index 1, got %d", got)
	}
}

func TestRegisterProjectRoutesProjectChatWindowingMutationsRespectDeploymentPolicy(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:     config.ModeShare,
		Document: projectChatWindowingRouteTestDocument(),
		Policy: map[string]any{
			"allowLayoutChanges": false,
			"allowLLM":           true,
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler := newProjectRouteDeploymentTestHandler(t, config.ModeShare, deploymentRuntime)

	layoutRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectChatWindowingState,
		strings.NewReader(`{"projectConfigId":"project-alpha","state":{"instancesById":{"project-chat-window-1":{"instanceId":"project-chat-window-1","placement":"floating","mode":"project_ai_mode","chatId":"chat-before"}},"order":["project-chat-window-1"],"nextInstanceNumber":2}}`),
	)
	layoutRequest.Header.Set("Content-Type", "application/json")
	layoutRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")
	layoutResponse := httptest.NewRecorder()
	handler.ServeHTTP(layoutResponse, layoutRequest)
	if layoutResponse.Code != http.StatusForbidden {
		t.Fatalf("expected 403 layout response, got %d with body %q", layoutResponse.Code, layoutResponse.Body.String())
	}
	if !strings.Contains(layoutResponse.Body.String(), "Deployment policy disallows layout changes.") {
		t.Fatalf("expected layout policy denial, got %q", layoutResponse.Body.String())
	}

	createRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateWindowSpace,
		strings.NewReader(`{"projectConfigId":"project-alpha","name":"Focused Layout","state":{"windowsById":{},"order":[]}}`),
	)
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")
	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusForbidden {
		t.Fatalf("expected 403 create response, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	chatIDRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectChatWindowChatID,
		strings.NewReader(`{"projectConfigId":"project-alpha","instanceId":"project-chat-window-1","chatId":"chat-bound"}`),
	)
	chatIDRequest.Header.Set("Content-Type", "application/json")
	chatIDRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")
	chatIDResponse := httptest.NewRecorder()
	handler.ServeHTTP(chatIDResponse, chatIDRequest)
	if chatIDResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 chat-id response, got %d with body %q", chatIDResponse.Code, chatIDResponse.Body.String())
	}

	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay: %v", err)
	}
	project := overlay.Snapshot().Document.Projects["project-alpha"]
	if project.ProjectChatWindowing.InstancesByID["project-chat-window-1"].ChatID == nil || *project.ProjectChatWindowing.InstancesByID["project-chat-window-1"].ChatID != "chat-bound" {
		t.Fatalf("expected overlay chat-bound state, got %#v", project.ProjectChatWindowing.InstancesByID["project-chat-window-1"].ChatID)
	}
}

func TestRegisterProjectRoutesProjectChatWindowChatIDRespectsDeploymentLLMPolicy(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:     config.ModeShare,
		Document: projectChatWindowingRouteTestDocument(),
		Policy: map[string]any{
			"allowLayoutChanges": false,
			"allowLLM":           false,
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler := newProjectRouteDeploymentTestHandler(t, config.ModeShare, deploymentRuntime)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectChatWindowChatID,
		strings.NewReader(`{"projectConfigId":"project-alpha","instanceId":"project-chat-window-1","chatId":"chat-bound"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403 response, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Deployment policy disallows LLM access.") {
		t.Fatalf("expected llm policy denial, got %q", response.Body.String())
	}
}

func newProjectRouteDeploymentTestHandler(
	t *testing.T,
	mode config.Mode,
	deploymentRuntime *deployments.Runtime,
) http.Handler {
	t.Helper()

	settingsDocument, err := settingsstate.NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := settingsstate.OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterProjectRoutes(r, ProjectRouteDependencies{
				ModePolicy:    modes.NewPolicy(mode),
				ShareSessions: deploymentRuntime,
				Deployment:    deploymentRuntime,
				SettingsState: settingsRuntime,
			}); err != nil {
				t.Fatalf("register project routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func projectChatWindowingRouteTestDocument() projectstate.Document {
	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				Sections: map[string]projectstate.Section{
					"section-a": {
						ID:   "section-a",
						Name: "Section A",
					},
				},
				WindowSpaces: map[string]projectstate.WindowSpaceConfig{
					"space-a": {
						ID:        "space-a",
						Name:      "Primary",
						SortIndex: 0,
					},
				},
				ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
					InstancesByID: map[string]projectstate.ProjectChatWindowInstance{
						"project-chat-window-1": {
							InstanceID: "project-chat-window-1",
							Placement:  projectstate.ChatWindowPlacementFloating,
							Mode:       projectstate.ChatWindowModeProjectAI,
							Title:      projectRouteStringPointer("Project AI"),
							ChatID:     projectRouteStringPointer("chat-before"),
						},
					},
					Order:              []string{"project-chat-window-1"},
					NextInstanceNumber: 2,
				},
			},
		},
	}
}
