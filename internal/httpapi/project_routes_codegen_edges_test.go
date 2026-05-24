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
	"setta/internal/projectview"
)

func TestRegisterProjectRoutesCodeObjectNameAndDisplayNameMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
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
			route: RouteSetCodeObjName,
			body:  `{"projectConfigId":"project-alpha","codeObjId":"shared-child","name":"renamed_key","frontendOpId":"frontend-op-code-obj-name"}`,
		},
		{
			route: RouteSetCodeObjDisplayName,
			body:  `{"projectConfigId":"project-alpha","codeObjId":"shared-child","displayName":"Renamed Key","frontendOpId":"frontend-op-code-obj-display"}`,
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

	if got := payload.ProjectState.CodeObjs["shared-child"].Name; got != "renamed_key" {
		t.Fatalf("expected shared-child name renamed_key, got %q", got)
	}
	if got := payload.ProjectState.CodeObjs["shared-child"].DisplayName; got != "Renamed Key" {
		t.Fatalf("expected shared-child display name Renamed Key, got %q", got)
	}
}

func TestRegisterProjectRoutesMetaControlParamRenamePersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": metaControlParamRouteTestProject(t),
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

	response := post(RouteSetCodeObjName, `{"projectConfigId":"project-alpha","codeObjId":"meta-param","name":"control_name","frontendOpId":"frontend-op-meta-control-name"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	if got := payload.ProjectState.CodeObjs["meta-param"].Name; got != "control_name" {
		t.Fatalf("expected meta-param name control_name, got %q", got)
	}
}

func TestRegisterProjectRoutesCodeObjectNameAndDisplayNameMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
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
		route        string
		body         string
		expectedCode int
		expectedBody string
	}{
		{
			route:        RouteSetCodeObjName,
			body:         `{"projectConfigId":"project-alpha","codeObjId":"shared-child","name":"secret"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"detail":"Param name \"secret\" already exists under this parent."`,
		},
		{
			route:        RouteSetCodeObjName,
			body:         `{"projectConfigId":"project-alpha","codeObjId":"missing-code-obj","name":"renamed_key"}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"code_obj_not_found"`,
		},
		{
			route:        RouteSetCodeObjDisplayName,
			body:         `{"projectConfigId":"project-alpha","codeObjId":"","displayName":"Renamed Key"}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"code_obj_id_required"`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("expected %d for %s, got %d with body %q", requestSpec.expectedCode, requestSpec.route, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("expected response body to contain %s, got %q", requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesCodeSectionAttachedTerminalPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionSizeRouteTestProject(t),
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
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteSetCodeSectionAttachedTerminal, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}
	latestState := func() ProjectStateSingleConfigWithCompletedOpIDs {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 latest-state response, got %d with body %q", response.Code, response.Body.String())
		}
		var payload ProjectStateSingleConfigWithCompletedOpIDs
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode latest project payload: %v", err)
		}
		return payload
	}

	detachResponse := post(`{"projectConfigId":"project-alpha","sectionId":"code-section","terminalSectionId":null,"frontendOpId":"frontend-op-detach-terminal"}`)
	if detachResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 detach response, got %d with body %q", detachResponse.Code, detachResponse.Body.String())
	}

	detached := latestState()
	detachedCodeVariantID := detached.ProjectState.ProjectConfig.SectionVariantMap["code-section"]
	detachedCodeImplID := detached.ProjectState.SectionVariants[detachedCodeVariantID].Impl
	detachedCodeImplPayload := decodeProjectRouteRawObject(t, detached.ProjectState.SectionImpls[detachedCodeImplID])
	if got := detachedCodeImplPayload["attachedTerminalSectionId"]; got != nil {
		t.Fatalf("expected cleared attachedTerminalSectionId after detach, got %#v", got)
	}
	if got := detachedCodeImplPayload["children"]; !reflect.DeepEqual(got, []any{}) {
		t.Fatalf("expected cleared code children after detach, got %#v", got)
	}
	if got := detached.ProjectState.ParentSectionMap["terminal-section"]; got != nil {
		t.Fatalf("expected detached terminal to become top-level, got parent %#v", *got)
	}
	if _, ok := detached.ProjectState.ProjectConfig.TopLevelSections["terminal-section"]; !ok {
		t.Fatalf("expected detached terminal top-level layout, got %#v", detached.ProjectState.ProjectConfig.TopLevelSections)
	}

	attachResponse := post(`{"projectConfigId":"project-alpha","sectionId":"code-section","terminalSectionId":"terminal-section","frontendOpId":"frontend-op-attach-terminal"}`)
	if attachResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 attach response, got %d with body %q", attachResponse.Code, attachResponse.Body.String())
	}

	attached := latestState()
	attachedCodeVariantID := attached.ProjectState.ProjectConfig.SectionVariantMap["code-section"]
	attachedCodeImplID := attached.ProjectState.SectionVariants[attachedCodeVariantID].Impl
	attachedCodeImplPayload := decodeProjectRouteRawObject(t, attached.ProjectState.SectionImpls[attachedCodeImplID])
	if got := attachedCodeImplPayload["attachedTerminalSectionId"]; got != "terminal-section" {
		t.Fatalf("expected attached terminal id terminal-section, got %#v", got)
	}
	if got := attachedCodeImplPayload["children"]; !reflect.DeepEqual(got, []any{"terminal-section"}) {
		t.Fatalf("expected code children [terminal-section], got %#v", got)
	}
	if got := attached.ProjectState.ParentSectionMap["terminal-section"]; got == nil || *got != "code-section" {
		t.Fatalf("expected attached terminal parent code-section, got %#v", got)
	}
	if _, ok := attached.ProjectState.ProjectConfig.TopLevelSections["terminal-section"]; ok {
		t.Fatalf("did not expect attached terminal top-level layout, got %#v", attached.ProjectState.ProjectConfig.TopLevelSections["terminal-section"])
	}
}

func TestRegisterProjectRoutesCodeSectionAttachedTerminalRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionSizeRouteTestProject(t),
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
			body:         `{"projectConfigId":"project-alpha","sectionId":"code-section","terminalSectionId":"chart-section"}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"invalid_terminal_section"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionId":"terminal-section","terminalSectionId":"terminal-section"}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"invalid_code_section"`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteSetCodeSectionAttachedTerminal, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("expected %d, got %d with body %q", requestSpec.expectedCode, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("expected response body to contain %s, got %q", requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesCodeSectionAttachedTerminalRejectsDeploymentStructuralChanges(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": sectionSizeRouteTestProject(t),
					},
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSetCodeSectionAttachedTerminal,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","terminalSectionId":null}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"structural_changes_forbidden"`) {
				t.Fatalf("expected structural_changes_forbidden body, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment mode disallows structural changes.") {
				t.Fatalf("expected deployment structural denial, got %q", response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			overlayCodeVariantID := overlayProject.SectionVariantMap["code-section"]
			overlayCodeImplID := overlayProject.SectionVariants[overlayCodeVariantID].ImplID
			overlayCodeImpl := overlayProject.SectionImpls[overlayCodeImplID].Code
			if overlayCodeImpl == nil || overlayCodeImpl.AttachedTerminalSectionID != "terminal-section" {
				t.Fatalf("expected rejected mutation to keep overlay attachment, got %#v", overlayCodeImpl)
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			baseCodeVariantID := baseProject.SectionVariantMap["code-section"]
			baseCodeImplID := baseProject.SectionVariants[baseCodeVariantID].ImplID
			baseCodeImpl := baseProject.SectionImpls[baseCodeImplID].Code
			if baseCodeImpl == nil || baseCodeImpl.AttachedTerminalSectionID != "terminal-section" {
				t.Fatalf("expected base attachment to stay unchanged, got %#v", baseCodeImpl)
			}
		})
	}
}

func TestRegisterProjectRoutesSetSectionNameReturns422ForInvalidName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
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

	handler := newProjectRouteTestHandlerWithRenameService(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		nil,
		&stubProjectRouteRenameRefactorService{
			setSectionNameErr: &projectstate.InvalidSectionNameError{
				Message: "Section name cannot include path separators.",
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetSectionName,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1","name":"bad/name","frontendOpId":"frontend-op-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"detail":"Section name cannot include path separators."`) {
		t.Fatalf("expected invalid section detail response, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesAcceptRenameRefactorReturns404WhenPendingMissing(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
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

	handler := newProjectRouteTestHandlerWithRenameService(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		nil,
		&stubProjectRouteRenameRefactorService{
			acceptErr: fmt.Errorf("%w: rename-op-1", projectstate.ErrRenameRefactorPendingNotFound),
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAcceptRenameRefactor,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"rename-op-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"rename_refactor_not_found"`) {
		t.Fatalf("expected rename_refactor_not_found response, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesDeclineRenameRefactorForwardsPayloadAndReturnsOK(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
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

	renameService := &stubProjectRouteRenameRefactorService{}
	handler := newProjectRouteTestHandlerWithRenameService(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		nil,
		renameService,
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeclineRenameRefactor,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"rename-op-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if renameService.declineProjectID != "project-alpha" || renameService.declineFrontendOpID != "rename-op-1" {
		t.Fatalf("expected decline handler to forward payload, got project=%q frontendOp=%q", renameService.declineProjectID, renameService.declineFrontendOpID)
	}
}

func TestRegisterProjectRoutesDeclineRenameRefactorReturns409WhenProjectMismatches(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
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

	handler := newProjectRouteTestHandlerWithRenameService(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		nil,
		&stubProjectRouteRenameRefactorService{
			declineErr: fmt.Errorf("%w: frontend op rename-op-1 belongs to project-beta", projectstate.ErrRenameRefactorProjectMismatch),
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeclineRenameRefactor,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"rename-op-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"rename_refactor_project_mismatch"`) {
		t.Fatalf("expected rename_refactor_project_mismatch response, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesRenameRefactorRoutesRemainIDEOnlyInDeployment(t *testing.T) {
	t.Parallel()

	assertProjectUnchanged := func(t *testing.T, project projectstate.Project) {
		t.Helper()
		if len(project.Sections) != 0 {
			t.Fatalf("expected no sections after rejected rename-refactor route, got %#v", project.Sections)
		}
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			for _, requestSpec := range []struct {
				route string
				body  string
			}{
				{
					route: RouteAcceptRenameRefactor,
					body:  `{"projectConfigId":"project-alpha"}`,
				},
				{
					route: RouteDeclineRenameRefactor,
					body:  `{"projectConfigId":"project-alpha"}`,
				},
			} {
				t.Run(requestSpec.route, func(t *testing.T) {
					deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
						Mode: mode,
						Document: projectstate.Document{
							SchemaVersion: projectstate.CurrentSchemaVersion,
							Projects: map[string]projectstate.Project{
								"project-alpha": {ID: "project-alpha", Name: "Alpha"},
							},
						},
					})
					if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
						t.Fatalf("create deployment session: %v", err)
					}

					handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
					request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("expected 403 for %s in %s mode, got %d with body %q", requestSpec.route, mode, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
						t.Fatalf("expected mode_forbidden for %s in %s mode, got %q", requestSpec.route, mode, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
						t.Fatalf("expected deployment-mode denial detail for %s in %s mode, got %q", requestSpec.route, mode, response.Body.String())
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

func TestRegisterProjectRoutesSetCodeReturnsForbiddenForReadOnlyBinding(t *testing.T) {
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

	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			setCode: func(context.Context, string, string, string) error {
				return fmt.Errorf("%w: %q", projectstate.ErrCodeSectionReadOnly, "section-1")
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
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"code_section_read_only"`) {
		t.Fatalf("expected read-only error body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesFormatCodeReturnsForbiddenForReadOnlyBinding(t *testing.T) {
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

	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			formatCode: func(context.Context, string, string) error {
				return fmt.Errorf("%w: %q", projectstate.ErrCodeSectionReadOnly, "section-1")
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
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"code_section_read_only"`) {
		t.Fatalf("expected read-only error body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesFormatCodeReturns422ForInvalidTarget(t *testing.T) {
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

	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			formatCode: func(context.Context, string, string) error {
				return projectstate.NewFormatCodeError("Format code only supports Python code sections.")
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
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_format_code"`) {
		t.Fatalf("expected invalid_format_code response, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesExcludesCoreWatchCodeRoutes(t *testing.T) {
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
	for _, routePath := range []string{
		"/setWatchCodeEnabled",
		"/setWatchCodeInputs",
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+routePath,
			strings.NewReader(`{"projectConfigId":"project-alpha"}`),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNotFound {
			t.Fatalf("expected %s to return 404, got %d with body %q", routePath, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"not_found"`) {
			t.Fatalf("expected not_found response for %s, got %q", routePath, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesSetsTypeErrorIgnore(t *testing.T) {
	t.Parallel()

	projectRuntime := completionRouteTestRuntime(t)
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetTypeErrorIgnore,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"callable-section","paramInfoId":"param-1","ignoreTypeErrors":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set type error ignore: %v", err)
	}
	ignoreState, err := project.TypeErrorIgnoreStateForSection("callable-section")
	if err != nil {
		t.Fatalf("type error ignore state: %v", err)
	}
	if !ignoreState.Params["param-1"] {
		t.Fatalf("expected param-1 ignore state, got %#v", ignoreState)
	}
}

func TestRegisterProjectRoutesSetTypeErrorIgnoreRespectsDeploymentParamPolicy(t *testing.T) {
	t.Parallel()

	seedRuntime := completionRouteTestRuntime(t)
	t.Cleanup(func() {
		if err := seedRuntime.Close(); err != nil {
			t.Fatalf("close seed runtime: %v", err)
		}
	})
	document := seedRuntime.Snapshot().Document

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:     mode,
				Document: document.Clone(),
				Policy: map[string]any{
					"allowParamChanges": true,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSetTypeErrorIgnore,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"callable-section","paramInfoId":"param-1","ignoreTypeErrors":true}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			overlayIgnoreState, err := overlayProject.TypeErrorIgnoreStateForSection("callable-section")
			if err != nil {
				t.Fatalf("overlay type error ignore state: %v", err)
			}
			if !overlayIgnoreState.Params["param-1"] {
				t.Fatalf("expected overlay param-1 ignore state, got %#v", overlayIgnoreState)
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			baseIgnoreState, err := baseProject.TypeErrorIgnoreStateForSection("callable-section")
			if err != nil {
				t.Fatalf("base type error ignore state: %v", err)
			}
			if baseIgnoreState.Params["param-1"] {
				t.Fatalf("expected base project to remain unchanged, got %#v", baseIgnoreState)
			}
		})
	}
}

func TestRegisterProjectRoutesSetTypeErrorIgnoreRejectsDeploymentWhenParamChangesForbidden(t *testing.T) {
	t.Parallel()

	seedRuntime := completionRouteTestRuntime(t)
	t.Cleanup(func() {
		if err := seedRuntime.Close(); err != nil {
			t.Fatalf("close seed runtime: %v", err)
		}
	})
	document := seedRuntime.Snapshot().Document

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:     mode,
				Document: document.Clone(),
				Policy: map[string]any{
					"allowParamChanges": false,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSetTypeErrorIgnore,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"callable-section","paramInfoId":"param-1","ignoreTypeErrors":true}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"param_changes_forbidden"`) {
				t.Fatalf("expected param_changes_forbidden body, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment policy disallows param changes.") {
				t.Fatalf("expected deployment param policy denial, got %q", response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			overlayIgnoreState, err := overlayProject.TypeErrorIgnoreStateForSection("callable-section")
			if err != nil {
				t.Fatalf("overlay type error ignore state: %v", err)
			}
			if overlayIgnoreState.Params["param-1"] {
				t.Fatalf("expected overlay project to remain unchanged, got %#v", overlayIgnoreState)
			}
		})
	}
}

func TestRegisterProjectRoutesDisablesPythonCodegenAndReturnsCleanedProjectState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  projectstate.RawJSON(`{"language":"python","generateMetadata":true}`),
					},
				},
				GeneratedCodeBinding: &projectstate.CodeFileBinding{
					Path:       "code/sections/alpha/setta_gen.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				GeneratedMetadataBinding: &projectstate.CodeFileBinding{
					Path:       "code/sections/alpha/setta_gen_meta.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				EntryCodeBlockID:   "gen-python-section",
				TopLevelSectionIDs: []string{"manual-section", "gen-python-section", "gen-python-metadata-section"},
				SectionVariantMap: map[string]string{
					"manual-section":              "manual-variant",
					"gen-python-section":          "gen-python-variant",
					"gen-python-metadata-section": "gen-python-metadata-variant",
				},
				Sections: map[string]projectstate.Section{
					"manual-section": {
						ID:               "manual-section",
						Name:             "Manual",
						VariantIDs:       []string{"manual-variant"},
						DefaultVariantID: "manual-variant",
					},
					"gen-python-section": {
						ID:               "gen-python-section",
						Name:             "Generated Python",
						VariantIDs:       []string{"gen-python-variant"},
						DefaultVariantID: "gen-python-variant",
					},
					"gen-python-metadata-section": {
						ID:               "gen-python-metadata-section",
						Name:             "Generated Python Metadata",
						VariantIDs:       []string{"gen-python-metadata-variant"},
						DefaultVariantID: "gen-python-metadata-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"manual-variant": {
						ID:     "manual-variant",
						ImplID: "manual-impl",
					},
					"gen-python-variant": {
						ID:     "gen-python-variant",
						ImplID: "gen-python-impl",
					},
					"gen-python-metadata-variant": {
						ID:     "gen-python-metadata-variant",
						ImplID: "gen-python-metadata-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"manual-impl": {
						ID:   "manual-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
					},
					"gen-python-impl": {
						ID:   "gen-python-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPythonCode,
						},
					},
					"gen-python-metadata-impl": {
						ID:   "gen-python-metadata-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPythonMetadata,
						},
					},
				},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
		return nil
	}), nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectview.SingleConfig
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode project state payload: %v", err)
	}
	if len(payload.ProjectConfig.CodegenTargets) != 0 {
		t.Fatalf("expected codegen targets to be cleared, got %#v", payload.ProjectConfig.CodegenTargets)
	}
	if payload.ProjectConfig.EntryCodeBlockID != nil {
		t.Fatalf("expected entry code block id to be cleared, got %q", *payload.ProjectConfig.EntryCodeBlockID)
	}
	if payload.SingletonSections.GenPythonCode != nil {
		t.Fatalf("expected generated python singleton to be cleared, got %q", *payload.SingletonSections.GenPythonCode)
	}
	if payload.SingletonSections.GenPythonMetadata != nil {
		t.Fatalf("expected generated python metadata singleton to be cleared, got %q", *payload.SingletonSections.GenPythonMetadata)
	}
	if payload.GenCodeBinding != nil {
		t.Fatalf("expected generated code binding to be cleared, got %#v", payload.GenCodeBinding)
	}

	snapshot := projectRuntime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if _, ok := project.Sections["gen-python-section"]; ok {
		t.Fatal("expected generated python section to be removed from runtime state")
	}
}

func TestRegisterProjectRoutesRejectsInvalidCodegenTargetPayload(t *testing.T) {
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
		return nil
	}), nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[[]]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_project_codegen_targets"`) {
		t.Fatalf("expected invalid_project_codegen_targets error, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesRejectsPythonCodegenTargetsWithUnknownFieldAs422(t *testing.T) {
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

	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
		nil,
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"python","unexpected":true}]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_project_codegen_targets"`) {
		t.Fatalf("expected invalid_project_codegen_targets error, got %q", response.Body.String())
	}

	snapshot := projectRuntime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if len(project.CodegenTargets) != 0 {
		t.Fatalf("expected no persisted codegen targets after validation failure, got %#v", project.CodegenTargets)
	}
}

func TestRegisterProjectRoutesRejectsPythonCodegenTargetsWithInvalidNestedPolicyAs422(t *testing.T) {
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

	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
		nil,
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"python","sectionPolicy":{"unknownField":true}}]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_project_codegen_targets"`) {
		t.Fatalf("expected invalid_project_codegen_targets error, got %q", response.Body.String())
	}

	snapshot := projectRuntime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if len(project.CodegenTargets) != 0 {
		t.Fatalf("expected no persisted codegen targets after validation failure, got %#v", project.CodegenTargets)
	}
}
