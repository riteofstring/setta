package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesUndoAndRedoReturnLatestProjectState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectHistoryRouteTestDocument("Alpha"))
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	mustSetProjectHistoryRouteName(t, projectRuntime, "Beta")
	mustSetProjectHistoryRouteName(t, projectRuntime, "Gamma")

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	undoRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUndo,
		strings.NewReader(`{"projectConfigId":"project-alpha","steps":1}`),
	)
	undoRequest.Header.Set("Content-Type", "application/json")
	undoResponse := httptest.NewRecorder()
	handler.ServeHTTP(undoResponse, undoRequest)
	if undoResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 undo response, got %d with body %q", undoResponse.Code, undoResponse.Body.String())
	}

	var undoPayload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(undoResponse.Body.Bytes(), &undoPayload); err != nil {
		t.Fatalf("decode undo payload: %v", err)
	}
	if undoPayload.ProjectState.ProjectConfig.Name != "Beta" {
		t.Fatalf("expected undo to return Beta, got %q", undoPayload.ProjectState.ProjectConfig.Name)
	}

	redoRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRedo,
		strings.NewReader(`{"projectConfigId":"project-alpha","steps":1}`),
	)
	redoRequest.Header.Set("Content-Type", "application/json")
	redoResponse := httptest.NewRecorder()
	handler.ServeHTTP(redoResponse, redoRequest)
	if redoResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 redo response, got %d with body %q", redoResponse.Code, redoResponse.Body.String())
	}

	var redoPayload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(redoResponse.Body.Bytes(), &redoPayload); err != nil {
		t.Fatalf("decode redo payload: %v", err)
	}
	if redoPayload.ProjectState.ProjectConfig.Name != "Gamma" {
		t.Fatalf("expected redo to return Gamma, got %q", redoPayload.ProjectState.ProjectConfig.Name)
	}
}

func TestRegisterProjectRoutesUndoAndRedoRejectInvalidProjectPayloads(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectHistoryRouteTestDocument("Alpha"))
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
		"/api"+RouteUndo,
		strings.NewReader(`{"projectConfigId":"","steps":1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 response, got %d with body %q", response.Code, response.Body.String())
	}

	var missingProjectError errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &missingProjectError); err != nil {
		t.Fatalf("decode missing-project error: %v", err)
	}
	if missingProjectError.Error.Code != "project_config_id_required" {
		t.Fatalf("expected project_config_id_required, got %#v", missingProjectError)
	}

	notFoundRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRedo,
		strings.NewReader(`{"projectConfigId":"project-missing","steps":1}`),
	)
	notFoundRequest.Header.Set("Content-Type", "application/json")
	notFoundResponse := httptest.NewRecorder()
	handler.ServeHTTP(notFoundResponse, notFoundRequest)
	if notFoundResponse.Code != http.StatusNotFound {
		t.Fatalf("expected 404 response, got %d with body %q", notFoundResponse.Code, notFoundResponse.Body.String())
	}

	var notFoundError errorResponse
	if err := json.Unmarshal(notFoundResponse.Body.Bytes(), &notFoundError); err != nil {
		t.Fatalf("decode not-found error: %v", err)
	}
	if notFoundError.Error.Code != "project_config_not_found" {
		t.Fatalf("expected project_config_not_found, got %#v", notFoundError)
	}
}

func TestRegisterProjectRoutesUndoAndRedoUseDeploymentOverlayWithoutPolicyGate(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
			Mode:     mode,
			Document: projectHistoryRouteTestDocument("Alpha"),
			Policy: map[string]any{
				"allowParamChanges":   false,
				"allowVariantChanges": false,
				"allowLayoutChanges":  false,
				"allowLLM":            false,
			},
		})
		if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
			t.Fatalf("create share session for %s mode: %v", mode, err)
		}

		overlay, err := deploymentRuntime.Overlay("share-a")
		if err != nil {
			t.Fatalf("deployment overlay in %s mode: %v", mode, err)
		}
		mustSetProjectHistoryRouteName(t, overlay, "Beta")
		mustSetProjectHistoryRouteName(t, overlay, "Gamma")

		handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)

		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteUndo,
			strings.NewReader(`{"projectConfigId":"project-alpha","steps":1}`),
		)
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set(modes.ShareSessionHeaderName, "share-a")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 response in %s mode, got %d with body %q", mode, response.Code, response.Body.String())
		}

		var payload ProjectStateSingleConfigWithCompletedOpIDs
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode undo payload in %s mode: %v", mode, err)
		}
		if payload.ProjectState.ProjectConfig.Name != "Beta" {
			t.Fatalf("expected overlay undo to return Beta in %s mode, got %q", mode, payload.ProjectState.ProjectConfig.Name)
		}
		if deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"].Name != "Alpha" {
			t.Fatalf("expected base deployment document to stay at Alpha in %s mode, got %q", mode, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"].Name)
		}
		if overlay.Snapshot().Document.Projects["project-alpha"].Name != "Beta" {
			t.Fatalf("expected overlay document to undo to Beta in %s mode, got %q", mode, overlay.Snapshot().Document.Projects["project-alpha"].Name)
		}
	}
}

func projectHistoryRouteTestDocument(projectName string) projectstate.Document {
	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: projectName,
			},
		},
	}
}

func mustSetProjectHistoryRouteName(t *testing.T, runtime *projectstate.Runtime, projectName string) {
	t.Helper()

	if _, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID("project-alpha")
		if err != nil {
			return projectstate.Document{}, err
		}
		project.Name = projectName
		document.Projects[project.ID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("set project history route name %q: %v", projectName, err)
	}
}
