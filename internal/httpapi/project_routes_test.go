package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

func TestRegisterProjectRoutesValidatesAndPersistsPluginCodegenTargets(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				WindowSpaces: map[string]projectstate.WindowSpaceConfig{
					"space-a": {
						ID:    "space-a",
						Name:  "Workspace",
						Order: []string{"window-a"},
						WindowsByID: map[string]projectstate.WindowSpaceWindow{
							"window-a": {
								SurfaceKind:     projectstate.WindowSpaceSurfaceKindSection,
								SectionIDOrNull: projectRouteStringPointer("section-a"),
								Mode:            projectstate.ChatWindowModeSection,
								Title:           projectRouteStringPointer("Section A"),
							},
						},
					},
				},
				ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
					InstancesByID: map[string]projectstate.ProjectChatWindowInstance{
						"instance-a": {
							Placement: projectstate.ChatWindowPlacementFloating,
							Mode:      projectstate.ChatWindowModeProjectAI,
							Title:     projectRouteStringPointer("Project AI"),
							ChatID:    projectRouteStringPointer("chat-a"),
						},
					},
					Order:              []string{"instance-a"},
					NextInstanceNumber: 2,
				},
				Sections: map[string]projectstate.Section{
					"section-a": {
						ID:   "section-a",
						Name: "Section A",
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

	validatedTargets := make([]string, 0, 1)
	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), projectstate.CodegenTargetValidatorFunc(func(_ context.Context, target projectstate.ProjectCodegenTarget) error {
		validatedTargets = append(validatedTargets, target.Language)
		return nil
	}), nil, nil)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteSetProjectConfigCodegenTargets, strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"AlphaState"}}]}`))
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
	if len(payload.ProjectConfig.CodegenTargets) != 1 {
		t.Fatalf("expected one persisted codegen target in response, got %#v", payload.ProjectConfig.CodegenTargets)
	}
	if !reflect.DeepEqual(validatedTargets, []string{"setta-fixture-backend-codegen:typescript"}) {
		t.Fatalf("expected validator call for plugin target, got %#v", validatedTargets)
	}

	snapshot := projectRuntime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if len(project.CodegenTargets) != 1 {
		t.Fatalf("expected one persisted codegen target, got %#v", project.CodegenTargets)
	}
	if project.CodegenTargets[0].Language != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("unexpected persisted codegen target %#v", project.CodegenTargets[0])
	}
	if string(project.CodegenTargets[0].Payload) != `{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"AlphaState"}}` {
		t.Fatalf("unexpected persisted codegen target payload %q", string(project.CodegenTargets[0].Payload))
	}
}

func TestRegisterProjectRoutesRejectsPluginCodegenTargetsWhenValidatorFails(t *testing.T) {
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), projectstate.CodegenTargetValidatorFunc(func(_ context.Context, target projectstate.ProjectCodegenTarget) error {
		return fmt.Errorf("%w: %s", plugins.ErrRegisteredCodegenTargetNotFound, target.Language)
	}), nil, nil)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteSetProjectConfigCodegenTargets, strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"setta-fixture-backend-codegen:typescript"}]}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_project_codegen_targets"`) {
		t.Fatalf("expected invalid_project_codegen_targets error, got %q", response.Body.String())
	}

	snapshot := projectRuntime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if len(project.CodegenTargets) != 0 {
		t.Fatalf("expected no persisted codegen targets after validator failure, got %#v", project.CodegenTargets)
	}
}

func TestRegisterProjectRoutesReturnsLatestProjectStateEnvelope(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				WindowSpaces: map[string]projectstate.WindowSpaceConfig{
					"space-a": {
						ID:    "space-a",
						Name:  "Workspace",
						Order: []string{"window-a"},
						WindowsByID: map[string]projectstate.WindowSpaceWindow{
							"window-a": {
								SurfaceKind:     projectstate.WindowSpaceSurfaceKindSection,
								SectionIDOrNull: projectRouteStringPointer("section-a"),
								Mode:            projectstate.ChatWindowModeSection,
								Title:           projectRouteStringPointer("Section A"),
							},
						},
					},
				},
				ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
					InstancesByID: map[string]projectstate.ProjectChatWindowInstance{
						"instance-a": {
							Placement: projectstate.ChatWindowPlacementFloating,
							Mode:      projectstate.ChatWindowModeProjectAI,
							Title:     projectRouteStringPointer("Project AI"),
							ChatID:    projectRouteStringPointer("chat-a"),
						},
					},
					Order:              []string{"instance-a"},
					NextInstanceNumber: 2,
				},
				Sections: map[string]projectstate.Section{
					"section-a": {
						ID:   "section-a",
						Name: "Section A",
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project state payload: %v", err)
	}
	if payload.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha response, got %q", payload.ProjectState.ProjectConfig.ID)
	}
	if payload.ProjectState.ProjectConfig.WindowSpaces["space-a"].Name != "Workspace" {
		t.Fatalf("expected window space name Workspace, got %#v", payload.ProjectState.ProjectConfig.WindowSpaces)
	}
	if payload.ProjectState.ProjectChatWindowing.NextInstanceNumber != 2 {
		t.Fatalf("expected next instance number 2, got %d", payload.ProjectState.ProjectChatWindowing.NextInstanceNumber)
	}
	if payload.ProjectState.ProjectChatWindowing.InstancesByID["instance-a"].ChatID == nil || *payload.ProjectState.ProjectChatWindowing.InstancesByID["instance-a"].ChatID != "chat-a" {
		t.Fatalf("expected project chat window chat-a, got %#v", payload.ProjectState.ProjectChatWindowing.InstancesByID["instance-a"].ChatID)
	}
	if len(payload.CompletedOpIDs) != 0 || len(payload.PendingOpIDs) != 0 {
		t.Fatalf("expected empty op ids, got completed=%#v pending=%#v", payload.CompletedOpIDs, payload.PendingOpIDs)
	}
}

func TestRegisterProjectRoutesGetsPasswordParamValue(t *testing.T) {
	t.Parallel()

	// The Go project route should return the stored secret for active password
	// params without relying on the Python project manager path.
	passwordSecrets, err := projectstate.NewFilePasswordSecretStore(t.TempDir())
	if err != nil {
		t.Fatalf("new password secret store: %v", err)
	}
	if err := passwordSecrets.Set("shared-secret-impl", "topsecret"); err != nil {
		t.Fatalf("seed password secret: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntimeWithOptions(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
		},
	}, projectstate.RuntimeOptions{
		PasswordSecrets: passwordSecrets,
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
		"/api"+RouteGetPasswordParamValue,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-secret"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload GetPasswordParamValueResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode password param response: %v", err)
	}
	if payload.Value != "topsecret" {
		t.Fatalf("expected topsecret, got %q", payload.Value)
	}
}

func TestRegisterProjectRoutesGetPasswordParamValueRejectsNonPasswordParam(t *testing.T) {
	t.Parallel()

	// Non-password params should fail with a typed caller error instead of
	// falling through to a generic internal failure.
	passwordSecrets, err := projectstate.NewFilePasswordSecretStore(t.TempDir())
	if err != nil {
		t.Fatalf("new password secret store: %v", err)
	}
	projectRuntime, err := projectstate.OpenOverlayRuntimeWithOptions(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
		},
	}, projectstate.RuntimeOptions{
		PasswordSecrets: passwordSecrets,
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
		"/api"+RouteGetPasswordParamValue,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"password_param_required"`) {
		t.Fatalf("expected password_param_required body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesParamValueAndConfigMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	passwordSecrets, err := projectstate.NewFilePasswordSecretStore(t.TempDir())
	if err != nil {
		t.Fatalf("new password secret store: %v", err)
	}
	projectRuntime, err := projectstate.OpenOverlayRuntimeWithOptions(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
		},
	}, projectstate.RuntimeOptions{
		PasswordSecrets: passwordSecrets,
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
			route: RouteSetParamEnteredValue,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child","value":"updated","frontendOpId":"frontend-op-param"}`,
		},
		{
			route: RouteSetParamEnteredValue,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-secret","value":"topsecret"}`,
		},
		{
			route: RouteUpdateParamImplConfig,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child","newConfig":{"description":"Updated description"}}`,
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

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-a"]
	dictImplID := payload.ProjectState.SectionVariants[dictVariantID].Impl
	dictPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[dictImplID])
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected dict codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	sharedChildVariantID, ok := codeObjVariantMap["shared-child"].(string)
	if !ok {
		t.Fatalf("expected shared-child variant id string, got %#v", codeObjVariantMap["shared-child"])
	}
	sharedChildImplID := payload.ProjectState.CodeObjVariants[sharedChildVariantID].Impl
	sharedChildImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjImpls[sharedChildImplID])
	if got := sharedChildImplPayload["value"]; got != "updated" {
		t.Fatalf("expected shared-child value updated, got %#v", got)
	}
	sharedChildPayload := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["shared-child"].SharedModifier)
	if got := sharedChildPayload["description"]; got != "Updated description" {
		t.Fatalf("expected shared-child description Updated description, got %#v", got)
	}

	sharedSecretPayload := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["shared-secret"].SharedModifier)
	sharedSecretVariantID, ok := codeObjVariantMap["shared-secret"].(string)
	if !ok {
		t.Fatalf("expected shared-secret variant id string, got %#v", codeObjVariantMap["shared-secret"])
	}
	sharedSecretImplID := payload.ProjectState.CodeObjVariants[sharedSecretVariantID].Impl
	sharedSecretImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjImpls[sharedSecretImplID])
	if got := sharedSecretImplPayload["value"]; got != "" {
		t.Fatalf("expected shared-secret value to stay redacted, got %#v", got)
	}
	if got := sharedSecretPayload["hasSecret"]; got != true {
		t.Fatalf("expected shared-secret hasSecret=true, got %#v", got)
	}

	passwordResponse := post(RouteGetPasswordParamValue, `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-secret"}`)
	if passwordResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 password response, got %d with body %q", passwordResponse.Code, passwordResponse.Body.String())
	}
	var passwordPayload GetPasswordParamValueResponse
	if err := json.Unmarshal(passwordResponse.Body.Bytes(), &passwordPayload); err != nil {
		t.Fatalf("decode password payload: %v", err)
	}
	if passwordPayload.Value != "topsecret" {
		t.Fatalf("expected topsecret password value, got %q", passwordPayload.Value)
	}
}

func TestRegisterProjectRoutesParamValueAndConfigMutationsRejectInvalidInputs(t *testing.T) {
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
			route:        RouteSetParamEnteredValue,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-root","value":"noop"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"param_value_mutation_unsupported"`,
		},
		{
			route:        RouteUpdateParamImplConfig,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child","newConfig":{"mode":"STATELESS"}}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"param_impl_config_invalid"`,
		},
		{
			route:        RouteUpdateParamImplConfig,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-root","newConfig":{"mode":"STATELESS"}}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"param_impl_config_invalid"`,
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

func TestRegisterProjectRoutesParamValueUsesDeploymentOverlayWhenParamChangesAllowed(t *testing.T) {
	t.Parallel()

	paramValueForProject := func(t *testing.T, project projectstate.Project, sectionID string, paramInfoID string) string {
		t.Helper()

		payload, _, _, _, err := project.ResolveSectionCodeObject(sectionID, paramInfoID)
		if err != nil {
			t.Fatalf("resolve section code object %s/%s: %v", sectionID, paramInfoID, err)
		}
		value, _ := payload["value"].(string)
		return value
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": sectionEdgeRouteTestProject(t),
					},
				},
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
				"/api"+RouteSetParamEnteredValue,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-section","paramInfoId":"added-param","value":"updated"}`),
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
			if got := paramValueForProject(t, overlayProject, "dict-section", "added-param"); got != "updated" {
				t.Fatalf("expected overlay added-param value updated, got %q", got)
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			if got := paramValueForProject(t, baseProject, "dict-section", "added-param"); got != "typed" {
				t.Fatalf("expected base added-param value typed, got %q", got)
			}
		})
	}
}

func TestRegisterProjectRoutesParamValueRejectsDeploymentPolicyWhenParamChangesDisallowed(t *testing.T) {
	t.Parallel()

	paramValueForProject := func(t *testing.T, project projectstate.Project, sectionID string, paramInfoID string) string {
		t.Helper()

		payload, _, _, _, err := project.ResolveSectionCodeObject(sectionID, paramInfoID)
		if err != nil {
			t.Fatalf("resolve section code object %s/%s: %v", sectionID, paramInfoID, err)
		}
		value, _ := payload["value"].(string)
		return value
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": sectionEdgeRouteTestProject(t),
					},
				},
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
				"/api"+RouteSetParamEnteredValue,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-section","paramInfoId":"added-param","value":"updated"}`),
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
			if got := paramValueForProject(t, overlayProject, "dict-section", "added-param"); got != "typed" {
				t.Fatalf("expected rejected overlay added-param value typed, got %q", got)
			}
		})
	}
}

func TestRegisterProjectRoutesSetParamEnteredValueTargetsExplicitSectionVariant(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": callableRouteTestProject(t),
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

	_, createdVariant, err := projectRuntime.CreateNewSectionVariant(
		context.Background(),
		"project-alpha",
		projectstate.CreateNewSectionVariantInput{SectionID: "callable-section"},
	)
	if err != nil {
		t.Fatalf("create new section variant: %v", err)
	}
	if _, err := projectRuntime.SetSectionVariant(
		context.Background(),
		"project-alpha",
		"callable-section",
		"callable-variant-1",
	); err != nil {
		t.Fatalf("restore original section variant: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetParamEnteredValue,
		strings.NewReader(fmt.Sprintf(
			`{"projectConfigId":"project-alpha","sectionId":"callable-section","sectionVariantId":"%s","paramInfoId":"param-existing","value":"3"}`,
			createdVariant.VariantID,
		)),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]

	originalPayload, _, _, _, err := project.ResolveSectionCodeObject(
		"callable-section",
		"param-existing",
	)
	if err != nil {
		t.Fatalf("resolve original variant param payload: %v", err)
	}
	if got, _ := originalPayload["value"].(string); got != "user_value" {
		t.Fatalf("expected original variant param value user_value, got %q", got)
	}

	targetedPayload, _, _, _, err := project.ResolveSectionCodeObjectForVariant(
		"callable-section",
		createdVariant.VariantID,
		"param-existing",
	)
	if err != nil {
		t.Fatalf("resolve explicit variant param payload: %v", err)
	}
	if got, _ := targetedPayload["value"].(string); got != "3" {
		t.Fatalf("expected explicit variant param value 3, got %q", got)
	}
}

func TestRegisterProjectRoutesParamValueRejectsDeploymentCodeParamEdits(t *testing.T) {
	t.Parallel()

	paramValueForProject := func(t *testing.T, project projectstate.Project, sectionID string, paramInfoID string) string {
		t.Helper()

		payload, _, _, _, err := project.ResolveSectionCodeObject(sectionID, paramInfoID)
		if err != nil {
			t.Fatalf("resolve section code object %s/%s: %v", sectionID, paramInfoID, err)
		}
		value, _ := payload["value"].(string)
		return value
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": sectionEdgeRouteTestProject(t),
					},
				},
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
				"/api"+RouteSetParamEnteredValue,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-section","paramInfoId":"target-param","value":"updated"}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"code_param_edits_forbidden"`) {
				t.Fatalf("expected code_param_edits_forbidden body, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment mode disallows CodeParam edits.") {
				t.Fatalf("expected deployment CodeParam denial, got %q", response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if got := paramValueForProject(t, overlayProject, "dict-section", "target-param"); got != "connected" {
				t.Fatalf("expected rejected overlay target-param value connected, got %q", got)
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			if got := paramValueForProject(t, baseProject, "dict-section", "target-param"); got != "connected" {
				t.Fatalf("expected base target-param value connected, got %q", got)
			}
		})
	}
}

func TestRegisterProjectRoutesChangeParamImplPersistsAndHydrates(t *testing.T) {
	t.Parallel()

	passwordSecrets, err := projectstate.NewFilePasswordSecretStore(t.TempDir())
	if err != nil {
		t.Fatalf("new password secret store: %v", err)
	}
	projectRuntime, err := projectstate.OpenOverlayRuntimeWithOptions(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
		},
	}, projectstate.RuntimeOptions{
		PasswordSecrets: passwordSecrets,
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
		"/api"+RouteChangeParamImpl,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child","selectedId":"PasswordParam","frontendOpId":"frontend-op-change-param"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 change-param-impl response, got %d with body %q", response.Code, response.Body.String())
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after change-param-impl: %v", err)
	}
	sharedChildPayload, _, _, sharedChildImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve shared-child after change-param-impl: %v", err)
	}
	if sharedChildImpl.Type != "PasswordParam" {
		t.Fatalf("expected shared-child impl PasswordParam, got %q", sharedChildImpl.Type)
	}
	if got, _ := sharedChildPayload["value"].(string); got != "" {
		t.Fatalf("expected shared-child value redacted after password conversion, got %q", got)
	}
	if got, _ := sharedChildPayload["hasSecret"].(bool); !got {
		t.Fatalf("expected shared-child hasSecret=true after password conversion, got %#v", sharedChildPayload)
	}

	passwordRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetPasswordParamValue,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child"}`),
	)
	passwordRequest.Header.Set("Content-Type", "application/json")
	passwordResponse := httptest.NewRecorder()
	handler.ServeHTTP(passwordResponse, passwordRequest)
	if passwordResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 password response, got %d with body %q", passwordResponse.Code, passwordResponse.Body.String())
	}

	var passwordPayload GetPasswordParamValueResponse
	if err := json.Unmarshal(passwordResponse.Body.Bytes(), &passwordPayload); err != nil {
		t.Fatalf("decode password payload: %v", err)
	}
	if passwordPayload.Value != "seed" {
		t.Fatalf("expected migrated password value seed, got %q", passwordPayload.Value)
	}
}

func TestRegisterProjectRoutesChangeParamImplRejectsInvalidSelection(t *testing.T) {
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteChangeParamImpl,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child","selectedId":"ButtonParam"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 change-param-impl response, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"change_param_impl_invalid"`) {
		t.Fatalf("expected change_param_impl_invalid response body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesDeleteSectionVariantOrAskReturnsWorkspacePathForJSONSourceVariant(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir workspace data: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantDeletionRouteTestProject(t),
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteSectionVariantOrAsk,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var filepathPayload string
	if err := json.Unmarshal(response.Body.Bytes(), &filepathPayload); err != nil {
		t.Fatalf("decode filepath payload: %v", err)
	}
	if filepathPayload != filepath.Join(workspaceRoot, "data", "source.json") {
		t.Fatalf("expected json-source filepath %q, got %q", filepath.Join(workspaceRoot, "data", "source.json"), filepathPayload)
	}
	if _, ok := projectRuntime.Snapshot().Document.Projects["project-alpha"].SectionVariants["json-variant-a"]; !ok {
		t.Fatal("did not expect prompt-only route to delete the json-source variant")
	}
}

func TestRegisterProjectRoutesDeleteSectionVariantOrAskDeletesNonJSONSourceVariant(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantDeletionRouteTestProject(t),
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteSectionVariantOrAsk,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-b"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null delete response body, got %q", response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	sourceSection := project.Sections["source-section"]
	if !reflect.DeepEqual(sourceSection.VariantIDs, []string{"source-variant-a"}) {
		t.Fatalf("expected source-section variants [source-variant-a], got %#v", sourceSection.VariantIDs)
	}
	if got := project.SectionVariantMap["source-section"]; got != "source-variant-a" {
		t.Fatalf("expected active source-section variant source-variant-a, got %q", got)
	}
}

func TestRegisterProjectRoutesDeleteSectionVariantOrAskBroadcastsProjectStateUpdate(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantDeletionRouteTestProject(t),
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

	websocketHub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	handler := newProjectRouteTestHandlerWithWebsocketHub(
		t,
		config.ModeIDE,
		projectRuntime,
		workspaceRoot,
		websocketHub,
		nil,
		nil,
		nil,
	)
	websocketServer := newTranscriptionProfileRouteTestWebsocketServer(t, websocketHub)
	defer websocketServer.Close()

	websocketClient := dialTranscriptionProfileRouteTestWebsocketClient(t, websocketServer.URL)
	defer websocketClient.CloseNow()
	waitForTranscriptionProfileRouteTestHubConnection(t, websocketHub, "frontend-a")

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteSectionVariantOrAsk,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-b"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	update := readProjectRouteTestProjectStateUpdate(t, websocketClient)
	if got := update.ProjectState.ProjectConfig.SectionVariantMap["source-section"]; got != "source-variant-a" {
		t.Fatalf("expected websocket source-section variant source-variant-a, got %q", got)
	}
	if _, ok := update.ProjectState.SectionVariants["source-variant-b"]; ok {
		t.Fatalf("expected deleted source-variant-b to be absent from websocket project state, got %#v", update.ProjectState.SectionVariants)
	}
}

func TestRegisterProjectRoutesDeleteJSONSourceFileAndVariantDeletesWorkspaceFileAndVariant(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	targetPath := filepath.Join(workspaceRoot, "data", "source.json")
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("mkdir json-source parent: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(`{"ok":true}`), 0o644); err != nil {
		t.Fatalf("seed json-source file: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantDeletionRouteTestProject(t),
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteJSONSourceFileAndVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","filepath":"`+targetPath+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if _, err := os.Stat(targetPath); !os.IsNotExist(err) {
		t.Fatalf("expected json-source file to be removed, stat err=%v", err)
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	jsonSection := project.Sections["json-section"]
	if !reflect.DeepEqual(jsonSection.VariantIDs, []string{"json-variant-b"}) {
		t.Fatalf("expected json-section variants [json-variant-b], got %#v", jsonSection.VariantIDs)
	}
	if got := project.SectionVariantMap["json-section"]; got != "json-variant-b" {
		t.Fatalf("expected active json-section variant json-variant-b, got %q", got)
	}
	if _, ok := project.SectionVariants["json-variant-a"]; ok {
		t.Fatal("did not expect deleted json-source variant to remain in project state")
	}
}

func TestRegisterProjectRoutesDeleteJSONSourceFileAndVariantBroadcastsProjectStateUpdate(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	targetPath := filepath.Join(workspaceRoot, "data", "source.json")
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("mkdir json-source parent: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(`{"ok":true}`), 0o644); err != nil {
		t.Fatalf("seed json-source file: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantDeletionRouteTestProject(t),
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

	websocketHub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	handler := newProjectRouteTestHandlerWithWebsocketHub(
		t,
		config.ModeIDE,
		projectRuntime,
		workspaceRoot,
		websocketHub,
		nil,
		nil,
		nil,
	)
	websocketServer := newTranscriptionProfileRouteTestWebsocketServer(t, websocketHub)
	defer websocketServer.Close()

	websocketClient := dialTranscriptionProfileRouteTestWebsocketClient(t, websocketServer.URL)
	defer websocketClient.CloseNow()
	waitForTranscriptionProfileRouteTestHubConnection(t, websocketHub, "frontend-a")

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteJSONSourceFileAndVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","filepath":"`+targetPath+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	update := readProjectRouteTestProjectStateUpdate(t, websocketClient)
	if got := update.ProjectState.ProjectConfig.SectionVariantMap["json-section"]; got != "json-variant-b" {
		t.Fatalf("expected websocket json-section variant json-variant-b, got %q", got)
	}
	if _, ok := update.ProjectState.SectionVariants["json-variant-a"]; ok {
		t.Fatalf("expected deleted json-variant-a to be absent from websocket project state, got %#v", update.ProjectState.SectionVariants)
	}
}

func TestRegisterProjectRoutesDeleteJSONSourceFileAndVariantRejectsPathsOutsideWorkspaceRoot(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	project := sectionVariantDeletionRouteTestProject(t)
	jsonVariant := project.SectionVariants["json-variant-a"]
	jsonVariant.Name = "../outside.json"
	project.SectionVariants["json-variant-a"] = jsonVariant
	project = mustNormalizedProjectRouteProject(t, project)

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteJSONSourceFileAndVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","filepath":"../outside.json"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"filepath_forbidden"`) {
		t.Fatalf("expected filepath_forbidden body, got %q", response.Body.String())
	}
	if _, ok := projectRuntime.Snapshot().Document.Projects["project-alpha"].SectionVariants["json-variant-a"]; !ok {
		t.Fatal("did not expect forbidden filepath request to delete the json-source variant")
	}
}

func TestRegisterProjectRoutesSectionVariantMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantRouteTestProject(t, true),
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

	createRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateNewSectionVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"source-section","frontendOpId":"frontend-op-create-variant"}`),
	)
	createRequest.Header.Set("Content-Type", "application/json")
	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for createNewSectionVariant, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	var created CreateNewSectionVariantResponse
	if err := json.Unmarshal(createResponse.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode createNewSectionVariant response: %v", err)
	}
	if strings.TrimSpace(created.VariantID) == "" {
		t.Fatal("expected createNewSectionVariant to return a variant id")
	}

	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetSectionVariant,
			body:  `{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-a","frontendOpId":"frontend-op-set-variant"}`,
		},
		{
			route: RouteSetDefaultSectionVariant,
			body:  `{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-a","frontendOpId":"frontend-op-set-default"}`,
		},
		{
			route: RouteSetSectionVariantSortOrder,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","sectionId":"source-section","orderedVariantIds":["source-variant-a",%q,"source-variant-b"],"frontendOpId":"frontend-op-sort-variants"}`, created.VariantID),
		},
		{
			route: RouteSetSectionVariantName,
			body:  `{"projectConfigId":"project-alpha","variantId":"source-variant-a","name":"Renamed Variant","frontendOpId":"frontend-op-rename-variant"}`,
		},
		{
			route: RouteToggleVariantFrozen,
			body:  `{"projectConfigId":"project-alpha","variantId":"source-variant-a","frontendOpId":"frontend-op-freeze-variant"}`,
		},
		{
			route: RouteToggleVariantJSONSource,
			body:  `{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-b","frontendOpId":"frontend-op-toggle-json-source"}`,
		},
		{
			route: RouteSetVariantJSONSourceKeys,
			body:  `{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-b","jsonSourceKeys":["config","nested"],"frontendOpId":"frontend-op-json-source-keys"}`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
		}
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if _, ok := project.SectionVariants[created.VariantID]; !ok {
		t.Fatalf("expected created variant %q to persist in project state", created.VariantID)
	}
	if got := project.SectionVariantMap["source-section"]; got != "source-variant-a" {
		t.Fatalf("expected source-section active variant source-variant-a, got %q", got)
	}
	if got := project.Sections["source-section"].DefaultVariantID; got != "source-variant-a" {
		t.Fatalf("expected source-section default variant source-variant-a, got %q", got)
	}
	if got := project.Sections["source-section"].VariantIDs; len(got) != 3 || got[0] != "source-variant-a" || got[1] != created.VariantID || got[2] != "source-variant-b" {
		t.Fatalf("expected source-section variants [source-variant-a %s source-variant-b], got %#v", created.VariantID, got)
	}
	if got := project.SectionVariants["source-variant-a"].Name; got != "Renamed Variant" {
		t.Fatalf("expected source-variant-a name Renamed Variant, got %q", got)
	}
	if !project.SectionVariants["source-variant-a"].IsFrozen {
		t.Fatal("expected source-variant-a to be frozen after toggle")
	}

	payload, err := project.EffectiveSectionPayload("json-section", "json-variant-b")
	if err != nil {
		t.Fatalf("effective payload after json-source mutations: %v", err)
	}
	isJSONSource, _ := payload["isJsonSource"].(bool)
	if !isJSONSource {
		t.Fatal("expected json-variant-b payload to enable json source")
	}
	configLanguage, _ := payload["configLanguage"].(string)
	if configLanguage != "json" {
		t.Fatalf("expected json-variant-b configLanguage json, got %q", configLanguage)
	}
	rawKeys, _ := payload["jsonSourceKeys"].([]any)
	if len(rawKeys) != 2 || rawKeys[0] != "config" || rawKeys[1] != "nested" {
		t.Fatalf("expected json-variant-b jsonSourceKeys [config nested], got %#v", rawKeys)
	}
}

func TestRegisterProjectRoutesSetSectionVariantPrunesInvalidAgenticEdges(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantAgenticEdgeRouteTestProject(t),
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
		"/api"+RouteSetSectionVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"chat-target","variantId":"chat-target-text-variant"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for setSectionVariant, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if got := project.SectionVariantMap["chat-target"]; got != "chat-target-text-variant" {
		t.Fatalf("expected chat-target active variant chat-target-text-variant, got %q", got)
	}
	if len(project.AgenticEdges) != 0 {
		t.Fatalf("expected invalid agentic edges to be pruned, got %#v", project.AgenticEdges)
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

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	if len(payload.ProjectState.ProjectConfig.AgenticEdges) != 0 {
		t.Fatalf("expected latest project state to omit pruned agentic edges, got %#v", payload.ProjectState.ProjectConfig.AgenticEdges)
	}
}

func TestRegisterProjectRoutesSectionVariantMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantRouteTestProject(t, false),
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
			route:        RouteSetSectionVariantSortOrder,
			body:         `{"projectConfigId":"project-alpha","sectionId":"missing-section","orderedVariantIds":["source-variant-a","source-variant-b"]}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"section_not_found"`,
		},
		{
			route:        RouteSetSectionVariantSortOrder,
			body:         `{"projectConfigId":"project-alpha","sectionId":"source-section","orderedVariantIds":["source-variant-a","missing-variant"]}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"variant_not_found"`,
		},
		{
			route:        RouteSetSectionVariantSortOrder,
			body:         `{"projectConfigId":"project-alpha","sectionId":"source-section","orderedVariantIds":["source-variant-a","source-variant-a"]}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"variant_sort_order_invalid"`,
		},
		{
			route:        RouteToggleVariantJSONSource,
			body:         `{"projectConfigId":"project-alpha","sectionId":"code-section","variantId":"code-variant"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"dict_section_required"`,
		},
		{
			route:        RouteSetVariantJSONSourceKeys,
			body:         `{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-b","jsonSourceKeys":["config"]}`,
			expectedCode: http.StatusForbidden,
			expectedBody: `"code":"json_source_key_edits_disabled"`,
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

func TestRegisterProjectRoutesSetVariantJSONSourceKeysValidatesExistingFilesAndMarksMissingFiles(t *testing.T) {
	t.Parallel()

	t.Run("rejects missing path in existing file", func(t *testing.T) {
		workspaceRoot := t.TempDir()
		if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
			t.Fatalf("mkdir data: %v", err)
		}
		if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"config\":{\"nested\":{}},\"leaf\":1}\n"), 0o644); err != nil {
			t.Fatalf("write json source file: %v", err)
		}

		projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
			SchemaVersion: projectstate.CurrentSchemaVersion,
			Projects: map[string]projectstate.Project{
				"project-alpha": sectionVariantRouteTestProject(t, true),
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

		handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteSetVariantJSONSourceKeys,
			strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","jsonSourceKeys":["missing"]}`),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"json_source_keys_path_not_found"`) {
			t.Fatalf("expected json_source_keys_path_not_found code, got %q", response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `jsonSourceKeys path not found: missing`) {
			t.Fatalf("expected missing-path detail, got %q", response.Body.String())
		}
	})

	t.Run("rejects leaf target in existing file", func(t *testing.T) {
		workspaceRoot := t.TempDir()
		if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
			t.Fatalf("mkdir data: %v", err)
		}
		if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"config\":{\"nested\":{}},\"leaf\":1}\n"), 0o644); err != nil {
			t.Fatalf("write json source file: %v", err)
		}

		projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
			SchemaVersion: projectstate.CurrentSchemaVersion,
			Projects: map[string]projectstate.Project{
				"project-alpha": sectionVariantRouteTestProject(t, true),
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

		handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteSetVariantJSONSourceKeys,
			strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","jsonSourceKeys":["leaf"]}`),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"json_source_keys_object_required"`) {
			t.Fatalf("expected json_source_keys_object_required code, got %q", response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `jsonSourceKeys must resolve to an object: leaf`) {
			t.Fatalf("expected leaf-object detail, got %q", response.Body.String())
		}
	})

	t.Run("accepts missing file and marks section missing", func(t *testing.T) {
		workspaceRoot := t.TempDir()

		projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
			SchemaVersion: projectstate.CurrentSchemaVersion,
			Projects: map[string]projectstate.Project{
				"project-alpha": sectionVariantRouteTestProject(t, true),
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

		handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteSetVariantJSONSourceKeys,
			strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","jsonSourceKeys":["config"]}`),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
		}

		project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
		payload, err := project.EffectiveSectionPayload("json-section", "json-variant-a")
		if err != nil {
			t.Fatalf("effective payload after json-source key edit: %v", err)
		}
		rawKeys, _ := payload["jsonSourceKeys"].([]any)
		if len(rawKeys) != 1 || rawKeys[0] != "config" {
			t.Fatalf("expected json-variant-a jsonSourceKeys [config], got %#v", rawKeys)
		}
		jsonSourceMissing, _ := payload["jsonSourceMissing"].(bool)
		if !jsonSourceMissing {
			t.Fatal("expected missing json source file to set jsonSourceMissing")
		}
	})
}
