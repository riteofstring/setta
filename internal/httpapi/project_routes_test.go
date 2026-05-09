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

func TestRegisterProjectRoutesSetVariantJSONSourceKeysRefreshesLiveTreeWithoutPersistingExistingFileSelection(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"beta\":{\"second\":2,\"first\":[1,true]}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	storePath := filepath.Join(t.TempDir(), "project.json")
	store, err := projectstate.NewStore(storePath, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceLiveRefreshRouteTestDocument(t)); err != nil {
		t.Fatalf("save initial project document: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntimeWithOptions(context.Background(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open persisted runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close persisted runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetVariantJSONSourceKeys,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","jsonSourceKeys":["beta"],"frontendOpId":"frontend-op-json-source-refresh"}`),
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
		t.Fatalf("effective payload after live json-source refresh: %v", err)
	}
	rawKeys, _ := payload["jsonSourceKeys"].([]any)
	if len(rawKeys) != 1 || rawKeys[0] != "alpha" {
		t.Fatalf("expected live jsonSourceKeys to remain [alpha], got %#v", rawKeys)
	}
	codeObjVariantMap := projectstatePayloadStringMap(payload, "codeObjVariantMap")
	if len(codeObjVariantMap) != 3 {
		t.Fatalf("expected live codeObjVariantMap size 3, got %#v", codeObjVariantMap)
	}
	if _, ok := project.CodeObjs["old-leaf"]; ok {
		t.Fatalf("expected live old-leaf to be pruned, got %#v", project.CodeObjs["old-leaf"])
	}
	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, "old-root")
	if err != nil {
		t.Fatalf("effective root payload after live refresh: %v", err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 2 {
		t.Fatalf("expected live root children [second first], got %#v", childIDs)
	}
	secondPayload, secondCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective second payload after live refresh: %v", err)
	}
	if secondCodeObj.Name != "second" {
		t.Fatalf("expected first live child to be named second, got %q", secondCodeObj.Name)
	}
	if got := projectstatePayloadString(secondPayload, "value"); got != "2" {
		t.Fatalf("expected live second child value 2, got %q", got)
	}
	firstPayload, firstCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[1])
	if err != nil {
		t.Fatalf("effective first payload after live refresh: %v", err)
	}
	if firstCodeObj.Name != "first" {
		t.Fatalf("expected second live child to be named first, got %q", firstCodeObj.Name)
	}
	if got := projectstatePayloadString(firstPayload, "value"); got != "[1,true]" {
		t.Fatalf("expected live first child value [1,true], got %q", got)
	}

	_, frontendOps, err := projectRuntime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("SnapshotAndConsumeFrontendOps after live refresh: %v", err)
	}
	if len(frontendOps.Completed) != 1 || frontendOps.Completed[0] != "frontend-op-json-source-refresh" {
		t.Fatalf("expected completed frontend op frontend-op-json-source-refresh, got %#v", frontendOps.Completed)
	}

	persistedDocument, err := store.LoadRaw(context.Background())
	if err != nil {
		t.Fatalf("LoadRaw after live json-source refresh: %v", err)
	}
	persistedProject := persistedDocument.Projects["project-alpha"]
	persistedPayload, err := persistedProject.EffectiveSectionPayload("json-section", "json-variant-a")
	if err != nil {
		t.Fatalf("persisted effective payload after live refresh: %v", err)
	}
	persistedRawKeys, _ := persistedPayload["jsonSourceKeys"].([]any)
	if len(persistedRawKeys) != 1 || persistedRawKeys[0] != "alpha" {
		t.Fatalf("expected persisted jsonSourceKeys [alpha], got %#v", persistedRawKeys)
	}
	persistedCodeObjVariantMap := projectstatePayloadStringMap(persistedPayload, "codeObjVariantMap")
	if len(persistedCodeObjVariantMap) != 2 {
		t.Fatalf("expected persisted codeObjVariantMap size 2, got %#v", persistedCodeObjVariantMap)
	}
	if _, ok := persistedProject.CodeObjs["old-leaf"]; !ok {
		t.Fatalf("expected persisted old-leaf to remain present, got %#v", persistedProject.CodeObjs)
	}
}

func TestRegisterProjectRoutesSetVariantJSONSourceKeysReassignsLiveRootWhenCurrentRootIsLeaf(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"beta\":{\"second\":2,\"first\":[1,true]}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	storePath := filepath.Join(t.TempDir(), "project.json")
	store, err := projectstate.NewStore(storePath, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceLeafRootRouteTestDocument(t)); err != nil {
		t.Fatalf("save initial project document: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntimeWithOptions(context.Background(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open persisted runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close persisted runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetVariantJSONSourceKeys,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","jsonSourceKeys":["beta"],"frontendOpId":"frontend-op-json-source-root-reassign"}`),
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
		t.Fatalf("effective payload after live json-source root reassignment: %v", err)
	}
	topLevelParamID := projectstatePayloadString(payload, "topLevelParamId")
	if topLevelParamID == "old-leaf" {
		t.Fatalf("expected live refresh to replace leaf root old-leaf, got %q", topLevelParamID)
	}
	codeObjVariantMap := projectstatePayloadStringMap(payload, "codeObjVariantMap")
	if _, ok := codeObjVariantMap["old-leaf"]; ok {
		t.Fatalf("expected old leaf root to be pruned from live map, got %#v", codeObjVariantMap)
	}
	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		t.Fatalf("effective reassigned root payload after refresh: %v", err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 2 {
		t.Fatalf("expected reassigned root children [second first], got %#v", childIDs)
	}
	secondPayload, secondCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective second payload after root reassignment: %v", err)
	}
	if secondCodeObj.Name != "second" {
		t.Fatalf("expected first child to be named second, got %q", secondCodeObj.Name)
	}
	if got := projectstatePayloadString(secondPayload, "value"); got != "2" {
		t.Fatalf("expected second child value 2, got %q", got)
	}
	firstPayload, firstCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[1])
	if err != nil {
		t.Fatalf("effective first payload after root reassignment: %v", err)
	}
	if firstCodeObj.Name != "first" {
		t.Fatalf("expected second child to be named first, got %q", firstCodeObj.Name)
	}
	if got := projectstatePayloadString(firstPayload, "value"); got != "[1,true]" {
		t.Fatalf("expected first child value [1,true], got %q", got)
	}
}

func TestRegisterProjectRoutesSetVariantJSONSourceKeysKeepsLoadedTreeWhenBackingFileDisappears(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	sourcePath := filepath.Join(workspaceRoot, "data", "source.json")
	if err := os.WriteFile(sourcePath, []byte("{\"alpha\":{\"fresh\":2}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	storePath := filepath.Join(t.TempDir(), "project.json")
	store, err := projectstate.NewStore(storePath, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceSharedRouteTestDocument(t)); err != nil {
		t.Fatalf("save initial project document: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntimeWithOptions(context.Background(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open persisted runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close persisted runtime: %v", err)
		}
	})
	if _, err := projectRuntime.MutateWithContext(
		context.Background(),
		func(document projectstate.Document) (projectstate.Document, error) {
			if err := document.LoadAllJSONSourceVariantsFromDisk(workspaceRoot); err != nil {
				return document, err
			}
			return document, nil
		},
	); err != nil {
		t.Fatalf("startup-like json-source load: %v", err)
	}
	if err := os.Remove(sourcePath); err != nil {
		t.Fatalf("remove json source payload: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetVariantJSONSourceKeys,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section-a","variantId":"json-variant-a","jsonSourceKeys":["alpha"],"frontendOpId":"frontend-op-json-source-missing-noop"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective target payload after missing-file reload: %v", err)
	}
	peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("effective peer payload after missing-file reload: %v", err)
	}
	if projectstatePayloadBool(targetPayload, "jsonSourceMissing") {
		t.Fatal("expected target missing flag to remain false")
	}
	if projectstatePayloadBool(peerPayload, "jsonSourceMissing") {
		t.Fatal("expected peer missing flag to remain false")
	}
	assertProjectRouteJSONSourceFreshValue(t, project, projectstatePayloadStringMap(targetPayload, "codeObjVariantMap"), projectstatePayloadString(targetPayload, "topLevelParamId"))
	assertProjectRouteJSONSourceFreshValue(t, project, projectstatePayloadStringMap(peerPayload, "codeObjVariantMap"), projectstatePayloadString(peerPayload, "topLevelParamId"))

	_, frontendOps, err := projectRuntime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("SnapshotAndConsumeFrontendOps after missing-file reload: %v", err)
	}
	if len(frontendOps.Completed) != 1 || frontendOps.Completed[0] != "frontend-op-json-source-missing-noop" {
		t.Fatalf("expected completed frontend op frontend-op-json-source-missing-noop, got %#v", frontendOps.Completed)
	}

	persistedDocument, err := store.LoadRaw(context.Background())
	if err != nil {
		t.Fatalf("LoadRaw after missing-file reload: %v", err)
	}
	persistedProject := persistedDocument.Projects["project-alpha"]
	persistedTargetPayload, err := persistedProject.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("persisted target payload after missing-file reload: %v", err)
	}
	persistedPeerPayload, err := persistedProject.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("persisted peer payload after missing-file reload: %v", err)
	}
	if projectstatePayloadBool(persistedTargetPayload, "jsonSourceMissing") {
		t.Fatal("expected persisted target missing flag to remain false")
	}
	if projectstatePayloadBool(persistedPeerPayload, "jsonSourceMissing") {
		t.Fatal("expected persisted peer missing flag to remain false")
	}
	assertProjectRouteJSONSourceOldLeafValue(t, persistedProject, projectstatePayloadStringMap(persistedTargetPayload, "codeObjVariantMap"), projectstatePayloadString(persistedTargetPayload, "topLevelParamId"), "target-leaf", "1")
	assertProjectRouteJSONSourceOldLeafValue(t, persistedProject, projectstatePayloadStringMap(persistedPeerPayload, "codeObjVariantMap"), projectstatePayloadString(persistedPeerPayload, "topLevelParamId"), "peer-leaf", "2")
}

func TestRegisterProjectRoutesSectionVariantMutationsUseDeploymentOverlayWhenVariantChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": sectionVariantRouteTestProject(t, true),
					},
				},
				Policy: map[string]any{
					"allowVariantChanges": true,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			doRequest := func(route string, body string) *httptest.ResponseRecorder {
				t.Helper()
				request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				return response
			}

			createResponse := doRequest(
				RouteCreateNewSectionVariant,
				`{"projectConfigId":"project-alpha","sectionId":"source-section","frontendOpId":"frontend-op-create-variant"}`,
			)
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
				response := doRequest(requestSpec.route, requestSpec.body)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
				}
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if _, ok := overlayProject.SectionVariants[created.VariantID]; !ok {
				t.Fatalf("expected created overlay variant %q to persist", created.VariantID)
			}
			if got := overlayProject.SectionVariantMap["source-section"]; got != "source-variant-a" {
				t.Fatalf("expected overlay active variant source-variant-a, got %q", got)
			}
			if got := overlayProject.Sections["source-section"].DefaultVariantID; got != "source-variant-a" {
				t.Fatalf("expected overlay default variant source-variant-a, got %q", got)
			}
			if got := overlayProject.Sections["source-section"].VariantIDs; len(got) != 3 || got[0] != "source-variant-a" || got[1] != created.VariantID || got[2] != "source-variant-b" {
				t.Fatalf("expected overlay source-section variants [source-variant-a %s source-variant-b], got %#v", created.VariantID, got)
			}
			if got := overlayProject.SectionVariants["source-variant-a"].Name; got != "Renamed Variant" {
				t.Fatalf("expected overlay source-variant-a name Renamed Variant, got %q", got)
			}
			if !overlayProject.SectionVariants["source-variant-a"].IsFrozen {
				t.Fatal("expected overlay source-variant-a to be frozen after toggle")
			}
			overlayPayload, err := overlayProject.EffectiveSectionPayload("json-section", "json-variant-b")
			if err != nil {
				t.Fatalf("overlay effective payload after json-source mutations: %v", err)
			}
			overlayIsJSONSource, _ := overlayPayload["isJsonSource"].(bool)
			if !overlayIsJSONSource {
				t.Fatal("expected overlay json-variant-b payload to enable json source")
			}
			overlayConfigLanguage, _ := overlayPayload["configLanguage"].(string)
			if overlayConfigLanguage != "json" {
				t.Fatalf("expected overlay json-variant-b configLanguage json, got %q", overlayConfigLanguage)
			}
			overlayRawKeys, _ := overlayPayload["jsonSourceKeys"].([]any)
			if len(overlayRawKeys) != 2 || overlayRawKeys[0] != "config" || overlayRawKeys[1] != "nested" {
				t.Fatalf("expected overlay json-variant-b jsonSourceKeys [config nested], got %#v", overlayRawKeys)
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			if _, ok := baseProject.SectionVariants[created.VariantID]; ok {
				t.Fatalf("expected base project not to persist created variant %q", created.VariantID)
			}
			if got := baseProject.SectionVariantMap["source-section"]; got != "source-variant-b" {
				t.Fatalf("expected base active variant source-variant-b, got %q", got)
			}
			if got := baseProject.Sections["source-section"].DefaultVariantID; got != "source-variant-b" {
				t.Fatalf("expected base default variant source-variant-b, got %q", got)
			}
			if got := baseProject.Sections["source-section"].VariantIDs; len(got) != 2 || got[0] != "source-variant-a" || got[1] != "source-variant-b" {
				t.Fatalf("expected base source-section variants unchanged, got %#v", got)
			}
			if got := baseProject.SectionVariants["source-variant-a"].Name; got != "" {
				t.Fatalf("expected base source-variant-a name unchanged, got %q", got)
			}
			if baseProject.SectionVariants["source-variant-a"].IsFrozen {
				t.Fatal("expected base source-variant-a frozen flag unchanged")
			}
			basePayload, err := baseProject.EffectiveSectionPayload("json-section", "json-variant-b")
			if err != nil {
				t.Fatalf("base effective payload after overlay json-source mutations: %v", err)
			}
			baseIsJSONSource, _ := basePayload["isJsonSource"].(bool)
			if baseIsJSONSource {
				t.Fatal("expected base json-variant-b payload to remain non-json-source")
			}
			baseConfigLanguage, _ := basePayload["configLanguage"].(string)
			if baseConfigLanguage != "python" {
				t.Fatalf("expected base json-variant-b configLanguage python, got %q", baseConfigLanguage)
			}
			baseRawKeys, _ := basePayload["jsonSourceKeys"].([]any)
			if len(baseRawKeys) != 0 {
				t.Fatalf("expected base json-variant-b jsonSourceKeys unchanged, got %#v", baseRawKeys)
			}
		})
	}
}

func TestRegisterProjectRoutesSectionVariantMutationsRejectDeploymentPolicyWhenVariantChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": sectionVariantRouteTestProject(t, true),
					},
				},
				Policy: map[string]any{
					"allowVariantChanges": false,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay before rejected variant mutations: %v", err)
			}
			before := overlay.Snapshot().Document.Projects["project-alpha"]

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			assertForbidden := func(t *testing.T, response *httptest.ResponseRecorder, route string) {
				t.Helper()
				if response.Code != http.StatusForbidden {
					t.Fatalf("expected 403 for %s, got %d with body %q", route, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"variant_changes_forbidden"`) {
					t.Fatalf("expected variant_changes_forbidden body, got %q", response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment policy disallows variant changes.") {
					t.Fatalf("expected deployment variant policy denial, got %q", response.Body.String())
				}
			}

			for _, requestSpec := range []struct {
				route string
				body  string
			}{
				{
					route: RouteCreateNewSectionVariant,
					body:  `{"projectConfigId":"project-alpha","sectionId":"source-section","frontendOpId":"frontend-op-create-variant"}`,
				},
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
					body:  `{"projectConfigId":"project-alpha","sectionId":"source-section","orderedVariantIds":["source-variant-a","source-variant-b"],"frontendOpId":"frontend-op-sort-variants"}`,
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
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				assertForbidden(t, response, requestSpec.route)
			}

			after := overlay.Snapshot().Document.Projects["project-alpha"]
			if !reflect.DeepEqual(after, before) {
				t.Fatalf("expected rejected overlay variant mutations to leave project unchanged, got %#v", after)
			}
		})
	}
}

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
