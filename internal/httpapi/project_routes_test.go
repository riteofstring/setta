package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/chatsections"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/prompttemplates"
	"setta/internal/settingsstate"
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
	passwordSecrets := projectstate.NewMemoryPasswordSecretStore()
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
	passwordSecrets := projectstate.NewMemoryPasswordSecretStore()
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

	passwordSecrets := projectstate.NewMemoryPasswordSecretStore()
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

	sharedChildPayload := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["shared-child"].SharedModifier)
	if got := sharedChildPayload["value"]; got != "updated" {
		t.Fatalf("expected shared-child value updated, got %#v", got)
	}
	if got := sharedChildPayload["description"]; got != "Updated description" {
		t.Fatalf("expected shared-child description Updated description, got %#v", got)
	}

	sharedSecretPayload := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["shared-secret"].SharedModifier)
	if got := sharedSecretPayload["value"]; got != "" {
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

	passwordSecrets := projectstate.NewMemoryPasswordSecretStore()
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

func TestRegisterProjectRoutesSetWatchCodeEnabledBaselinesExistingInputs(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	watchFile := filepath.Join(workspaceRoot, "pkg", "watch_me.py")
	if err := os.MkdirAll(filepath.Dir(watchFile), 0o755); err != nil {
		t.Fatalf("mkdir watch file parent: %v", err)
	}
	if err := os.WriteFile(watchFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watch file: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:             "project-alpha",
				Name:           "Alpha",
				WatchCodeFiles: []string{"pkg/watch_me.py"},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetWatchCodeEnabled,
		strings.NewReader(`{"projectConfigId":"project-alpha","enabled":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
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
		t.Fatalf("decode latest project state payload: %v", err)
	}
	if !payload.ProjectState.ProjectConfig.WatchCodeEnabled {
		t.Fatal("expected watch code to be enabled in latest project state")
	}
	expectedBaselineKey := filepath.Clean(watchFile)
	expectedIdentity := "pkg.watch_me.existing:function"
	if got := payload.ProjectState.ProjectConfig.WatchCodeBaselineByPath[expectedBaselineKey]; !reflect.DeepEqual(got, []string{expectedIdentity}) {
		t.Fatalf("expected watch code baseline %#v, got %#v", []string{expectedIdentity}, got)
	}
}

func TestRegisterProjectRoutesSetWatchCodeInputsBaselinesOnlyNewInputs(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	existingFile := filepath.Join(workspaceRoot, "pkg", "existing.py")
	newFile := filepath.Join(workspaceRoot, "pkg", "new_watch.py")
	if err := os.MkdirAll(filepath.Dir(existingFile), 0o755); err != nil {
		t.Fatalf("mkdir pkg: %v", err)
	}
	if err := os.WriteFile(existingFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}
	if err := os.WriteFile(newFile, []byte("class Added:\n    pass\n"), 0o644); err != nil {
		t.Fatalf("write new file: %v", err)
	}

	existingBaselineKey := filepath.Clean(existingFile)
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/existing.py"},
				WatchCodeBaselineByPath: map[string][]string{
					existingBaselineKey: []string{"pkg.existing.existing:function"},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetWatchCodeInputs,
		strings.NewReader(`{"projectConfigId":"project-alpha","watchCodeFolders":[],"watchCodeFiles":["pkg/existing.py","pkg/new_watch.py"]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if !reflect.DeepEqual(project.WatchCodeFiles, []string{"pkg/existing.py", "pkg/new_watch.py"}) {
		t.Fatalf("expected normalized watch files, got %#v", project.WatchCodeFiles)
	}
	if got := project.WatchCodeBaselineByPath[existingBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.existing.existing:function"}) {
		t.Fatalf("expected existing baseline to stay unchanged, got %#v", project.WatchCodeBaselineByPath)
	}
	newBaselineKey := filepath.Clean(newFile)
	if got := project.WatchCodeBaselineByPath[newBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.new_watch.Added:class_init"}) {
		t.Fatalf("expected new baseline, got %#v", project.WatchCodeBaselineByPath)
	}
}

func TestRegisterProjectRoutesRejectsWatchCodeInputsOutsideWorkspace(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	outsideFile := filepath.Join(filepath.Dir(workspaceRoot), "outside_watch.py")
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetWatchCodeInputs,
		strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","watchCodeFolders":[],"watchCodeFiles":["%s"]}`, outsideFile)),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_watch_code_input"`) {
		t.Fatalf("expected invalid_watch_code_input error, got %q", response.Body.String())
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

func TestRegisterProjectRoutesEnablesPythonCodegenAndReturnsGeneratedSingletonSections(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	materializer, err := codegen.NewPythonMaterializer(codegen.PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:                 "project-alpha",
				Name:               "Alpha",
				TopLevelSectionIDs: []string{"section-1"},
				SectionVariantMap: map[string]string{
					"section-1": "section-variant-1",
				},
				Sections: map[string]projectstate.Section{
					"section-1": {
						ID:               "section-1",
						Name:             "Greeting",
						VariantIDs:       []string{"section-variant-1"},
						DefaultVariantID: "section-variant-1",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"section-variant-1": {
						ID:     "section-variant-1",
						ImplID: "section-impl-1",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"section-impl-1": {
						ID:   "section-impl-1",
						Kind: projectstate.SectionKind("text_block"),
						Payload: projectstate.RawJSON(
							`{"id":"section-impl-1","type":"TextBlock","text":"hello world"}`,
						),
					},
				},
				ViewModes: map[string]projectstate.ViewMode{
					"focus": {
						ID: "focus",
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, settaFilesRoot, projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
		return nil
	}), materializer, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"python","genCodePrefix":"import math","generateMetadata":true}]}`),
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
	if got := derefString(payload.SingletonSections.GenPythonCode); got != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python singleton %q, got %q", projectstate.GeneratedPythonCodeSectionID, got)
	}
	if got := derefString(payload.SingletonSections.GenPythonMetadata); got != projectstate.GeneratedPythonMetadataSectionID {
		t.Fatalf("expected generated python metadata singleton %q, got %q", projectstate.GeneratedPythonMetadataSectionID, got)
	}
	if payload.GenCodeBinding == nil {
		t.Fatal("expected generated code binding in response")
	}
	if payload.GenCodeBinding.CanonicalPath != projectstate.GeneratedPythonCodeRelativePath("Alpha") {
		t.Fatalf("unexpected generated code binding path %q", payload.GenCodeBinding.CanonicalPath)
	}

	codeVariantID := payload.ProjectConfig.SectionVariantMap[projectstate.GeneratedPythonCodeSectionID]
	codeImplID := payload.SectionVariants[codeVariantID].Impl
	codePayload := string(payload.SectionImpls[codeImplID])
	if !strings.Contains(codePayload, `"type":"GenPythonCode"`) {
		t.Fatalf("expected generated python impl payload, got %q", codePayload)
	}
	if !strings.Contains(codePayload, `state.Greeting = 'hello world'`) {
		t.Fatalf("expected generated python body assignment, got %q", codePayload)
	}

	metaVariantID := payload.ProjectConfig.SectionVariantMap[projectstate.GeneratedPythonMetadataSectionID]
	metaImplID := payload.SectionVariants[metaVariantID].Impl
	metaPayload := string(payload.SectionImpls[metaImplID])
	if !strings.Contains(metaPayload, `"type":"GenPythonMetadata"`) {
		t.Fatalf("expected generated python metadata impl payload, got %q", metaPayload)
	}
	if !strings.Contains(metaPayload, `class SettaGenMetadata:`) {
		t.Fatalf("expected generated metadata code in payload, got %q", metaPayload)
	}
}

func TestRegisterProjectRoutesSetGenCodePrefixAndSuffixPersistRuntimeState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": genCodePrefixSuffixRouteTestProject(t),
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
		route string
		body  string
	}{
		{
			route: RouteSetGenCodePrefix,
			body:  `{"projectConfigId":"project-alpha","genCodePrefix":"import math\n","frontendOpId":"frontend-op-prefix"}`,
		},
		{
			route: RouteSetGenCodeSuffix,
			body:  `{"projectConfigId":"project-alpha","genCodeSuffix":"state = CustomState()\n","frontendOpId":"frontend-op-suffix"}`,
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
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("read python target after prefix/suffix mutation: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after prefix/suffix mutation")
	}
	if config.GenCodePrefix != "import math\n" {
		t.Fatalf("expected gen code prefix import math, got %q", config.GenCodePrefix)
	}
	if config.GenCodeSuffix != "state = CustomState()\n" {
		t.Fatalf("expected gen code suffix state = CustomState(), got %q", config.GenCodeSuffix)
	}
	if project.GeneratedCodeBinding == nil {
		t.Fatal("expected generated code binding to remain reconciled")
	}
	if project.GeneratedCodeBinding.Path != projectstate.GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("unexpected generated code binding path %q", project.GeneratedCodeBinding.Path)
	}
}

func TestRegisterProjectRoutesSetGenCodePrefixAndSuffixRejectMissingPythonTarget(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": mustNormalizedProjectRouteProject(t, projectstate.Project{
				ID:   "project-alpha",
				Name: "Alpha",
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
	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetGenCodePrefix,
			body:  `{"projectConfigId":"project-alpha","genCodePrefix":"import math\n"}`,
		},
		{
			route: RouteSetGenCodeSuffix,
			body:  `{"projectConfigId":"project-alpha","genCodeSuffix":"state = CustomState()\n"}`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"project_codegen_python_target_missing"`) {
			t.Fatalf("expected project_codegen_python_target_missing for %s, got %q", requestSpec.route, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesLayoutPresentationMutationsProjectLatestState(t *testing.T) {
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

	requests := []struct {
		route string
		body  string
	}{
		{
			route: RouteSetShowParamDisplayNames,
			body:  `{"projectConfigId":"project-alpha","showParamDisplayNames":true}`,
		},
		{
			route: RouteSetActiveIDs,
			body:  `{"projectConfigId":"project-alpha","activeIds":["callable-section"]}`,
		},
		{
			route: RouteSetViewport,
			body:  `{"projectConfigId":"project-alpha","viewport":{"x":1.25,"y":2.5,"zoom":0.9}}`,
		},
		{
			route: RouteSetSectionTagColor,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","tagColor":"#123456"}`,
		},
		{
			route: RouteSetSectionStyleColor,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","styleColor":"#654321"}`,
		},
		{
			route: RouteSetGroupOverflowMode,
			body:  `{"projectConfigId":"project-alpha","sectionId":"group-section","overflowMode":true}`,
		},
		{
			route: RouteSetSectionColumnWidth,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","columnWidth":248.5}`,
		},
		{
			route: RouteSetCallableHideParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideParams":true}`,
		},
		{
			route: RouteSetSectionHideUnpinnedParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideUnpinnedParams":true}`,
		},
		{
			route: RouteSetSectionPinnedParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","pinnedParams":["param-a","param-b"]}`,
		},
		{
			route: RouteToggleMinimized,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section"}`,
		},
		{
			route: RouteTogglePositionLocks,
			body:  `{"projectConfigId":"project-alpha","sectionIds":["callable-section","plain-section"]}`,
		},
	}

	for _, requestSpec := range requests {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestSpec.route,
			strings.NewReader(requestSpec.body),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
		}
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

	if !payload.ProjectState.ProjectConfig.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true")
	}
	if !reflect.DeepEqual(payload.ProjectState.ProjectConfig.ActiveIDs, []string{"callable-section"}) {
		t.Fatalf("expected active ids [callable-section], got %#v", payload.ProjectState.ProjectConfig.ActiveIDs)
	}
	if payload.ProjectState.ProjectConfig.Viewport == nil {
		t.Fatal("expected projected viewport")
	}
	if payload.ProjectState.ProjectConfig.Viewport.X != 1.25 || payload.ProjectState.ProjectConfig.Viewport.Y != 2.5 || payload.ProjectState.ProjectConfig.Viewport.Zoom != 0.9 {
		t.Fatalf("unexpected projected viewport %#v", payload.ProjectState.ProjectConfig.Viewport)
	}
	viewMode := payload.ProjectState.ProjectConfig.ViewModes["focus"]
	if viewMode.Viewport == nil || viewMode.Viewport.X != 1.25 || viewMode.Viewport.Y != 2.5 || viewMode.Viewport.Zoom != 0.9 {
		t.Fatalf("unexpected active view mode viewport %#v", viewMode.Viewport)
	}
	if !viewMode.ViewportInitialized {
		t.Fatal("expected active view mode viewport initialized")
	}

	callableSection := payload.ProjectState.Sections["callable-section"]
	callableSharedModifier := decodeProjectRouteRawObject(t, callableSection.SharedModifier)
	if got := callableSharedModifier["tagColor"]; got != "#123456" {
		t.Fatalf("expected tagColor #123456, got %#v", got)
	}
	if got := callableSharedModifier["styleColor"]; got != "#654321" {
		t.Fatalf("expected styleColor #654321, got %#v", got)
	}
	if got := callableSharedModifier["columnWidth"]; got != 248.5 {
		t.Fatalf("expected columnWidth 248.5, got %#v", got)
	}
	if got := callableSharedModifier["hideParams"]; got != true {
		t.Fatalf("expected hideParams=true, got %#v", got)
	}
	if got := callableSharedModifier["hideUnpinnedParams"]; got != true {
		t.Fatalf("expected hideUnpinnedParams=true, got %#v", got)
	}
	if got := callableSharedModifier["isMinimized"]; got != true {
		t.Fatalf("expected isMinimized=true, got %#v", got)
	}
	if got := callableSharedModifier["positionAndSizeLocked"]; got != true {
		t.Fatalf("expected positionAndSizeLocked=true, got %#v", got)
	}
	if got := decodeProjectRouteStringArray(callableSharedModifier["pinnedParams"]); !reflect.DeepEqual(got, []string{"param-a", "param-b"}) {
		t.Fatalf("expected pinned params [param-a param-b], got %#v", got)
	}

	plainSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["plain-section"].SharedModifier)
	if got := plainSharedModifier["positionAndSizeLocked"]; got != true {
		t.Fatalf("expected plain section position lock=true, got %#v", got)
	}

	groupSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["group-section"].SharedModifier)
	if got := groupSharedModifier["overflowMode"]; got != true {
		t.Fatalf("expected group overflowMode=true, got %#v", got)
	}
}

func TestRegisterProjectRoutesLayoutChromeUsesDeploymentOverlayWhenLayoutChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("layout_presentation", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": layoutPresentationRouteTestProject(t),
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
				post := func(route string, body string) *httptest.ResponseRecorder {
					t.Helper()
					request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					return response
				}

				for _, requestSpec := range []struct {
					route string
					body  string
				}{
					{
						route: RouteSetShowParamDisplayNames,
						body:  `{"projectConfigId":"project-alpha","showParamDisplayNames":true}`,
					},
					{
						route: RouteSetSectionTagColor,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","tagColor":"#123456"}`,
					},
					{
						route: RouteSetSectionStyleColor,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","styleColor":"#654321"}`,
					},
					{
						route: RouteSetSectionColumnWidth,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","columnWidth":248.5}`,
					},
					{
						route: RouteSetCallableHideParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideParams":true}`,
					},
					{
						route: RouteSetSectionHideUnpinnedParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideUnpinnedParams":true}`,
					},
					{
						route: RouteSetSectionPinnedParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","pinnedParams":["param-a","param-b"]}`,
					},
				} {
					response := post(requestSpec.route, requestSpec.body)
					if response.Code != http.StatusOK {
						t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
					}
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				if !overlayProject.ShowParamDisplayNames {
					t.Fatal("expected overlay ShowParamDisplayNames=true")
				}
				overlayCallableModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["callable-section"].SharedModifier)
				if got := overlayCallableModifier["tagColor"]; got != "#123456" {
					t.Fatalf("expected overlay tagColor #123456, got %#v", got)
				}
				if got := overlayCallableModifier["styleColor"]; got != "#654321" {
					t.Fatalf("expected overlay styleColor #654321, got %#v", got)
				}
				if got := overlayCallableModifier["columnWidth"]; got != 248.5 {
					t.Fatalf("expected overlay columnWidth 248.5, got %#v", got)
				}
				if got := overlayCallableModifier["hideParams"]; got != true {
					t.Fatalf("expected overlay hideParams=true, got %#v", got)
				}
				if got := overlayCallableModifier["hideUnpinnedParams"]; got != true {
					t.Fatalf("expected overlay hideUnpinnedParams=true, got %#v", got)
				}
				if got := decodeProjectRouteStringArray(overlayCallableModifier["pinnedParams"]); !reflect.DeepEqual(got, []string{"param-a", "param-b"}) {
					t.Fatalf("expected overlay pinnedParams [param-a param-b], got %#v", got)
				}

				baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
				if baseProject.ShowParamDisplayNames {
					t.Fatal("expected base ShowParamDisplayNames to remain false")
				}
				baseCallableModifier := decodeProjectRouteRawObject(t, baseProject.Sections["callable-section"].SharedModifier)
				if got := baseCallableModifier["tagColor"]; got == "#123456" {
					t.Fatalf("expected base tagColor to remain unchanged, got %#v", got)
				}
				if got := baseCallableModifier["styleColor"]; got == "#654321" {
					t.Fatalf("expected base styleColor to remain unchanged, got %#v", got)
				}
				if got := baseCallableModifier["columnWidth"]; got == 248.5 {
					t.Fatalf("expected base columnWidth to remain unchanged, got %#v", got)
				}
				if got := baseCallableModifier["hideParams"]; got == true {
					t.Fatalf("expected base hideParams to remain unchanged, got %#v", got)
				}
				if got := baseCallableModifier["hideUnpinnedParams"]; got == true {
					t.Fatalf("expected base hideUnpinnedParams to remain unchanged, got %#v", got)
				}
				if got := decodeProjectRouteStringArray(baseCallableModifier["pinnedParams"]); len(got) != 0 {
					t.Fatalf("expected base pinnedParams to remain empty, got %#v", got)
				}
			})

			t.Run("param_filter", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": sectionFilterMetaControlRouteTestProject(t),
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
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetSectionParamFilter,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"params-section","value":"   "}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetSectionParamFilter, response.Code, response.Body.String())
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				overlayParamsModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["params-section"].SharedModifier)
				if got := overlayParamsModifier["paramFilter"]; got != "   " {
					t.Fatalf("expected overlay paramFilter whitespace to persist, got %#v", got)
				}

				baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
				baseParamsModifier := decodeProjectRouteRawObject(t, baseProject.Sections["params-section"].SharedModifier)
				if got := baseParamsModifier["paramFilter"]; got == "   " {
					t.Fatalf("expected base paramFilter to remain unchanged, got %#v", got)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesLayoutChromeRejectsDeploymentPolicyWhenLayoutChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("layout_presentation", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": layoutPresentationRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				post := func(route string, body string) *httptest.ResponseRecorder {
					t.Helper()
					request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					return response
				}

				for _, requestSpec := range []struct {
					route string
					body  string
				}{
					{
						route: RouteSetShowParamDisplayNames,
						body:  `{"projectConfigId":"project-alpha","showParamDisplayNames":true}`,
					},
					{
						route: RouteSetSectionTagColor,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","tagColor":"#123456"}`,
					},
					{
						route: RouteSetSectionStyleColor,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","styleColor":"#654321"}`,
					},
					{
						route: RouteSetSectionColumnWidth,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","columnWidth":248.5}`,
					},
					{
						route: RouteSetCallableHideParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideParams":true}`,
					},
					{
						route: RouteSetSectionHideUnpinnedParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideUnpinnedParams":true}`,
					},
					{
						route: RouteSetSectionPinnedParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","pinnedParams":["param-a","param-b"]}`,
					},
				} {
					response := post(requestSpec.route, requestSpec.body)
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

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				if overlayProject.ShowParamDisplayNames {
					t.Fatal("expected rejected mutations to keep overlay ShowParamDisplayNames false")
				}
				overlayCallableModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["callable-section"].SharedModifier)
				if len(overlayCallableModifier) != 0 {
					t.Fatalf("expected rejected mutations to keep overlay callable shared modifier empty, got %#v", overlayCallableModifier)
				}
			})

			t.Run("param_filter", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": sectionFilterMetaControlRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetSectionParamFilter,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"params-section","value":"   "}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden {
					t.Fatalf("expected 403 for %s, got %d with body %q", RouteSetSectionParamFilter, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
					t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
					t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				overlayParamsModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["params-section"].SharedModifier)
				if len(overlayParamsModifier) != 0 {
					t.Fatalf("expected rejected param filter mutation to keep overlay params shared modifier empty, got %#v", overlayParamsModifier)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesMetaControlShowSectionTitleAndGroupOverflowRemainIDeOnlyInDeployment(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name    string
		project func(*testing.T) projectstate.Project
		route   string
		body    string
	}{
		{
			name:    "meta control title",
			project: sectionFilterMetaControlRouteTestProject,
			route:   RouteSetMetaControlShowSectionTitle,
			body:    `{"projectConfigId":"project-alpha","sectionId":"meta-section","showSectionTitle":true}`,
		},
		{
			name:    "group overflow",
			project: layoutPresentationRouteTestProject,
			route:   RouteSetGroupOverflowMode,
			body:    `{"projectConfigId":"project-alpha","sectionId":"group-section","overflowMode":true}`,
		},
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			for _, tc := range testCases {
				t.Run(tc.name, func(t *testing.T) {
					deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
						Mode: mode,
						Document: projectstate.Document{
							SchemaVersion:    projectstate.CurrentSchemaVersion,
							DefaultProjectID: "project-alpha",
							Projects: map[string]projectstate.Project{
								"project-alpha": tc.project(t),
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
					request := httptest.NewRequest(http.MethodPost, "/api"+tc.route, strings.NewReader(tc.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("expected 403 for %s in %s mode, got %d with body %q", tc.route, mode, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
						t.Fatalf("expected mode_forbidden for %s in %s mode, got %q", tc.route, mode, response.Body.String())
					}
				})
			}
		})
	}
}

func TestRegisterProjectRoutesSectionStructureMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionStructureRouteTestProject(t),
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

	groupResponse := post(RouteGroupSections, `{"projectConfigId":"project-alpha","sectionIds":["beta-section","alpha-section"]}`)
	if groupResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from groupSections, got %d with body %q", groupResponse.Code, groupResponse.Body.String())
	}

	groupedLatestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if groupedLatestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 grouped latest-state response, got %d with body %q", groupedLatestResponse.Code, groupedLatestResponse.Body.String())
	}

	var groupedPayload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(groupedLatestResponse.Body.Bytes(), &groupedPayload); err != nil {
		t.Fatalf("decode grouped latest project payload: %v", err)
	}

	createdGroupID := ""
	for sectionID := range groupedPayload.ProjectState.Sections {
		switch sectionID {
		case "alpha-section", "beta-section", "top-group", "top-child-a", "top-child-b", "nested-parent", "nested-group", "nested-child-a", "nested-child-b", "nested-sibling":
			continue
		default:
			createdGroupID = sectionID
		}
	}
	if createdGroupID == "" {
		t.Fatal("expected groupSections to create a new group section")
	}
	if parent := groupedPayload.ProjectState.ParentSectionMap["alpha-section"]; parent == nil || *parent != createdGroupID {
		t.Fatalf("expected alpha-section parent %q after grouping, got %#v", createdGroupID, parent)
	}
	if parent := groupedPayload.ProjectState.ParentSectionMap["beta-section"]; parent == nil || *parent != createdGroupID {
		t.Fatalf("expected beta-section parent %q after grouping, got %#v", createdGroupID, parent)
	}

	ungroupResponse := post(RouteUngroupGroups, fmt.Sprintf(`{"projectConfigId":"project-alpha","groupIds":["%s"]}`, createdGroupID))
	if ungroupResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from ungroupGroups, got %d with body %q", ungroupResponse.Code, ungroupResponse.Body.String())
	}

	deleteResponse := post(RouteDeleteSections, `{"projectConfigId":"project-alpha","sectionIds":["top-group"]}`)
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from deleteSections, got %d with body %q", deleteResponse.Code, deleteResponse.Body.String())
	}

	finalLatestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if finalLatestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 final latest-state response, got %d with body %q", finalLatestResponse.Code, finalLatestResponse.Body.String())
	}

	var finalPayload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(finalLatestResponse.Body.Bytes(), &finalPayload); err != nil {
		t.Fatalf("decode final latest project payload: %v", err)
	}

	if _, ok := finalPayload.ProjectState.Sections[createdGroupID]; ok {
		t.Fatalf("expected temporary group %q to be removed after ungroup", createdGroupID)
	}
	for _, deletedSectionID := range []string{"top-group", "top-child-a", "top-child-b"} {
		if _, ok := finalPayload.ProjectState.Sections[deletedSectionID]; ok {
			t.Fatalf("expected %q to be removed after deleteSections", deletedSectionID)
		}
		if _, ok := finalPayload.ProjectState.ProjectConfig.SectionVariantMap[deletedSectionID]; ok {
			t.Fatalf("expected %q variant mapping to be removed after deleteSections", deletedSectionID)
		}
	}
	if parent := finalPayload.ProjectState.ParentSectionMap["alpha-section"]; parent != nil {
		t.Fatalf("expected alpha-section to be top-level after ungroup, got parent %#v", parent)
	}
	if parent := finalPayload.ProjectState.ParentSectionMap["beta-section"]; parent != nil {
		t.Fatalf("expected beta-section to be top-level after ungroup, got parent %#v", parent)
	}
	if _, ok := finalPayload.ProjectState.ProjectConfig.TopLevelSections["alpha-section"]; !ok {
		t.Fatal("expected alpha-section top-level layout after ungroup")
	}
	if _, ok := finalPayload.ProjectState.ProjectConfig.TopLevelSections["beta-section"]; !ok {
		t.Fatal("expected beta-section top-level layout after ungroup")
	}
}

func TestRegisterProjectRoutesMoveSectionsPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": moveSectionsRouteTestProject(t),
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
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteMoveSections, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	reparentResponse := post(`{"projectConfigId":"project-alpha","sectionIds":["top-a","top-b"],"newParentId":"group-parent","newIndex":0}`)
	if reparentResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s reparent, got %d with body %q", RouteMoveSections, reparentResponse.Code, reparentResponse.Body.String())
	}

	paneResponse := post(`{"projectConfigId":"project-alpha","sectionIds":["terminal-section"],"newParentId":null,"newIndex":null,"positionsById":{"terminal-section":{"x":120,"y":80}}}`)
	if paneResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s pane move, got %d with body %q", RouteMoveSections, paneResponse.Code, paneResponse.Body.String())
	}

	latestResponse := httptest.NewRequest(http.MethodPost, "/api"+RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	latestResponse.Header.Set("Content-Type", "application/json")
	latestRecorder := httptest.NewRecorder()
	handler.ServeHTTP(latestRecorder, latestResponse)
	if latestRecorder.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestRecorder.Code, latestRecorder.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestRecorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	if parent := payload.ProjectState.ParentSectionMap["top-a"]; parent == nil || *parent != "group-parent" {
		t.Fatalf("expected top-a parent group-parent, got %#v", parent)
	}
	if parent := payload.ProjectState.ParentSectionMap["top-b"]; parent == nil || *parent != "group-parent" {
		t.Fatalf("expected top-b parent group-parent, got %#v", parent)
	}
	if _, ok := payload.ProjectState.ProjectConfig.TopLevelSections["top-a"]; ok {
		t.Fatal("expected top-a to leave top-level layouts")
	}
	if _, ok := payload.ProjectState.ProjectConfig.TopLevelSections["top-b"]; ok {
		t.Fatal("expected top-b to leave top-level layouts")
	}

	groupVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["group-parent"]
	groupImplID := payload.ProjectState.SectionVariants[groupVariantID].Impl
	groupPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[groupImplID])
	if got := decodeProjectRouteStringArray(groupPayload["children"]); !reflect.DeepEqual(got, []string{"top-a", "top-b", "nested-group"}) {
		t.Fatalf("expected group-parent children [top-a top-b nested-group], got %#v", got)
	}

	codeVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["code-section"]
	codeImplID := payload.ProjectState.SectionVariants[codeVariantID].Impl
	codePayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[codeImplID])
	if got := decodeProjectRouteStringArray(codePayload["children"]); len(got) != 0 {
		t.Fatalf("expected code-section children cleared after detach, got %#v", got)
	}
	if got, ok := codePayload["attachedTerminalSectionId"]; ok && got != nil && got != "" {
		t.Fatalf("expected attachedTerminalSectionId cleared after detach, got %#v", got)
	}

	if parent := payload.ProjectState.ParentSectionMap["terminal-section"]; parent != nil {
		t.Fatalf("expected terminal-section to become top-level, got parent %#v", parent)
	}
	layout, ok := payload.ProjectState.ProjectConfig.TopLevelSections["terminal-section"]
	if !ok {
		t.Fatalf("expected terminal-section layout after pane move, got %#v", payload.ProjectState.ProjectConfig.TopLevelSections)
	}
	if layout.X != 120 || layout.Y != 80 || layout.ZIndex != 2 {
		t.Fatalf("expected terminal-section layout {120 80 2}, got %#v", layout)
	}
}

func TestRegisterProjectRoutesMoveSectionsRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": moveSectionsRouteTestProject(t),
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
			body:         `{"projectConfigId":"project-alpha","sectionIds":["terminal-section"],"newParentId":null,"newIndex":null,"positionsById":{}}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"positions_invalid"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionIds":["group-parent"],"newParentId":"nested-group","newIndex":0}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"move_sections_invalid"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionIds":["top-a"],"newParentId":"group-parent","newIndex":-1}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"new_index_invalid"`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteMoveSections, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("expected %d for %s, got %d with body %q", requestSpec.expectedCode, RouteMoveSections, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("expected response body to contain %s, got %q", requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesMoveSectionsUsesDeploymentOverlayWhenLayoutChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": moveSectionsRouteTestProject(t),
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
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteMoveSections,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["top-a","top-b"],"newParentId":"group-parent","newIndex":0}`),
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
			if parent := overlayProject.Sections["top-a"].ParentSectionID; parent != "group-parent" {
				t.Fatalf("expected overlay top-a parent group-parent, got %q", parent)
			}
			if parent := overlayProject.Sections["top-b"].ParentSectionID; parent != "group-parent" {
				t.Fatalf("expected overlay top-b parent group-parent, got %q", parent)
			}
			if _, ok := overlayProject.TopLevelSections["top-a"]; ok {
				t.Fatal("expected overlay top-a to leave top-level layouts")
			}
			if _, ok := overlayProject.TopLevelSections["top-b"]; ok {
				t.Fatal("expected overlay top-b to leave top-level layouts")
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			if parent := baseProject.Sections["top-a"].ParentSectionID; parent != "" {
				t.Fatalf("expected base top-a parent to remain empty, got %q", parent)
			}
			if parent := baseProject.Sections["top-b"].ParentSectionID; parent != "" {
				t.Fatalf("expected base top-b parent to remain empty, got %q", parent)
			}
			if _, ok := baseProject.TopLevelSections["top-a"]; !ok {
				t.Fatal("expected base top-a layout to remain present")
			}
			if _, ok := baseProject.TopLevelSections["top-b"]; !ok {
				t.Fatal("expected base top-b layout to remain present")
			}
		})
	}
}

func TestRegisterProjectRoutesMoveSectionsRejectsDeploymentPolicyWhenLayoutChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": moveSectionsRouteTestProject(t),
					},
				},
				Policy: map[string]any{
					"allowLayoutChanges": false,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteMoveSections,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["top-a","top-b"],"newParentId":"group-parent","newIndex":0}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
				t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
				t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if parent := overlayProject.Sections["top-a"].ParentSectionID; parent != "" {
				t.Fatalf("expected rejected mutation to keep top-a parent empty, got %q", parent)
			}
			if parent := overlayProject.Sections["top-b"].ParentSectionID; parent != "" {
				t.Fatalf("expected rejected mutation to keep top-b parent empty, got %q", parent)
			}
		})
	}
}

func TestRegisterProjectRoutesPrepareAndPasteSectionsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-source",
		Projects: map[string]projectstate.Project{
			"project-source": copyPasteRouteSourceProject(t),
			"project-target": {
				ID:   "project-target",
				Name: "Target",
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

	prepareRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RoutePrepareSectionsForCopy,
		strings.NewReader(`{"projectConfigId":"project-source","sectionIds":["group-root"]}`),
	)
	prepareRequest.Header.Set("Content-Type", "application/json")
	prepareResponse := httptest.NewRecorder()
	handler.ServeHTTP(prepareResponse, prepareRequest)
	if prepareResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RoutePrepareSectionsForCopy, prepareResponse.Code, prepareResponse.Body.String())
	}

	var clipboard projectstate.SectionsClipboardData
	if err := json.Unmarshal(prepareResponse.Body.Bytes(), &clipboard); err != nil {
		t.Fatalf("decode prepareSectionsForCopy payload: %v", err)
	}
	if clipboard.Type != projectstate.ClipboardDataTypeSections {
		t.Fatalf("expected clipboard type %q, got %q", projectstate.ClipboardDataTypeSections, clipboard.Type)
	}
	if len(clipboard.Data.Core.Sections) != 3 {
		t.Fatalf("expected copied subtree with three sections, got %#v", clipboard.Data.Core.Sections)
	}
	if got := clipboard.Data.SectionVariantMap["group-root"]; got != "group-root-variant" {
		t.Fatalf("expected copied root active variant group-root-variant, got %q", got)
	}
	if got := clipboard.Data.SectionVariantMap["group-child-a"]; got != "group-child-a-variant-alt" {
		t.Fatalf("expected copied descendant active variant group-child-a-variant-alt, got %q", got)
	}
	if got := clipboard.Data.SectionVariantMap["group-child-b"]; got != "group-child-b-variant-default" {
		t.Fatalf("expected copied descendant active variant group-child-b-variant-default, got %q", got)
	}

	pasteBody, err := json.Marshal(PasteSectionsRequest{
		ProjectID: "project-target",
		Data:      clipboard.Data,
		Position:  projectstate.Position{X: 220, Y: 180},
		AsRef:     false,
	})
	if err != nil {
		t.Fatalf("marshal pasteSections request: %v", err)
	}
	pasteRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RoutePasteSections,
		strings.NewReader(string(pasteBody)),
	)
	pasteRequest.Header.Set("Content-Type", "application/json")
	pasteResponse := httptest.NewRecorder()
	handler.ServeHTTP(pasteResponse, pasteRequest)
	if pasteResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RoutePasteSections, pasteResponse.Code, pasteResponse.Body.String())
	}

	targetProject := projectRuntime.Snapshot().Document.Projects["project-target"]
	if len(targetProject.Sections) != 3 {
		t.Fatalf("expected three pasted sections in target project, got %#v", targetProject.Sections)
	}

	var pastedRootID string
	for sectionID, section := range targetProject.Sections {
		if section.ParentSectionID != "" {
			continue
		}
		if pastedRootID != "" {
			t.Fatalf("expected one pasted root section, got %#v", targetProject.Sections)
		}
		pastedRootID = sectionID
	}
	if pastedRootID == "" {
		t.Fatalf("expected pasted root section, got %#v", targetProject.Sections)
	}
	if pastedRootID == "group-root" {
		t.Fatalf("expected pasted root section id to be remapped, got %q", pastedRootID)
	}
	if !targetProject.HasTopLevelSection(pastedRootID) {
		t.Fatalf("expected pasted root %q to become top-level", pastedRootID)
	}
	layout, ok := targetProject.TopLevelSections[pastedRootID]
	if !ok {
		t.Fatalf("expected pasted root layout, got %#v", targetProject.TopLevelSections)
	}
	if layout.X != 220 || layout.Y != 180 || layout.ZIndex != 0 {
		t.Fatalf("expected pasted root layout {220 180 0}, got %#v", layout)
	}

	rootVariantID := targetProject.SectionVariantMap[pastedRootID]
	rootPayload, err := targetProject.EffectiveSectionPayload(pastedRootID, rootVariantID)
	if err != nil {
		t.Fatalf("resolve pasted root payload: %v", err)
	}
	children := decodeProjectRouteStringArray(rootPayload["children"])
	if len(children) != 2 {
		t.Fatalf("expected pasted group children to be preserved, got %#v", children)
	}
	for _, childID := range children {
		if childID == "group-child-a" || childID == "group-child-b" {
			t.Fatalf("expected pasted child id to be remapped, got %#v", children)
		}
		childSection := targetProject.Sections[childID]
		if childSection.ParentSectionID != pastedRootID {
			t.Fatalf("expected pasted child %q parent %q, got %#v", childID, pastedRootID, childSection)
		}
		childVariantID := targetProject.SectionVariantMap[childID]
		if childVariantID == "" {
			t.Fatalf("expected pasted child %q to keep an explicit active variant entry, got %#v", childID, targetProject.SectionVariantMap)
		}
		childPayload, err := targetProject.EffectiveSectionPayload(childID, childVariantID)
		if err != nil {
			t.Fatalf("resolve pasted child payload %q: %v", childID, err)
		}
		switch childSection.Name {
		case "Group Child A":
			if got := fmt.Sprint(childPayload["text"]); got != "Child A Alt" {
				t.Fatalf("expected pasted Group Child A active payload text %q, got %q", "Child A Alt", got)
			}
		case "Group Child B":
			if got := fmt.Sprint(childPayload["text"]); got != "Child B Default" {
				t.Fatalf("expected pasted Group Child B active payload text %q, got %q", "Child B Default", got)
			}
		default:
			t.Fatalf("unexpected pasted child section %#v", childSection)
		}
	}
}

func TestRegisterProjectRoutesPrepareAndPasteSectionsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-source",
		Projects: map[string]projectstate.Project{
			"project-source": copyPasteRouteSourceProject(t),
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
			route:        RoutePrepareSectionsForCopy,
			body:         `{"projectConfigId":"project-source","sectionIds":[""]}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"section_ids_invalid"`,
		},
		{
			route: RoutePasteSections,
			body: `{
				"projectConfigId":"project-source",
				"data":{
					"core":{
						"sections":{"bad":{"id":"bad","name":"Bad","displayName":"","variants":["bad-variant"],"defaultVariant":"bad-variant","sharedModifier":{},"unsharedKeys":[]}},
						"sectionImpls":{},
						"sectionVariants":{"bad-variant":{"id":"bad-variant","name":"Bad Variant","implId":"missing-impl","nonPresetImplIds":[],"modifier":{},"isFrozen":false}},
						"codeObjs":{},
						"codeObjImpls":{},
						"codeObjVariants":{}
					},
					"sectionVariantMap":{"bad":"bad-variant"}
				},
				"position":{"x":1,"y":2},
				"asRef":false
			}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"paste_sections_invalid"`,
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

func TestRegisterProjectRoutesPrepareSectionsForCopyUsesDeploymentOverlayRegardlessOfParamPolicy(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		for _, allowParamChanges := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s/%t", mode, allowParamChanges), func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-source",
						Projects: map[string]projectstate.Project{
							"project-source": copyPasteRouteSourceProject(t),
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
				if _, err := overlay.SetSectionVariantName(context.Background(), "project-source", "group-root-variant", "Overlay Variant"); err != nil {
					t.Fatalf("set overlay variant name: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RoutePrepareSectionsForCopy,
					strings.NewReader(`{"projectConfigId":"project-source","sectionIds":["group-root"]}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", RoutePrepareSectionsForCopy, response.Code, response.Body.String())
				}

				var clipboard projectstate.SectionsClipboardData
				if err := json.Unmarshal(response.Body.Bytes(), &clipboard); err != nil {
					t.Fatalf("decode prepareSectionsForCopy payload: %v", err)
				}
				if got := clipboard.Data.Core.SectionVariants["group-root-variant"].Name; got != "Overlay Variant" {
					t.Fatalf("expected clipboard to use overlay variant name %q, got %q", "Overlay Variant", got)
				}

				baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-source"]
				if got := baseProject.SectionVariants["group-root-variant"].Name; got != "" {
					t.Fatalf("expected base variant name unchanged, got %q", got)
				}
			})
		}
	}
}

func TestRegisterProjectRoutesChildSectionMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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

	createTerminalResponse := post(RouteCreateChildSections, `{"projectConfigId":"project-alpha","parentId":"code-section","implType":"Terminal","numChildren":1,"startIdx":0}`)
	if createTerminalResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteCreateChildSections, createTerminalResponse.Code, createTerminalResponse.Body.String())
	}
	var createTerminalPayload projectstate.CreateChildSectionsResult
	if err := json.Unmarshal(createTerminalResponse.Body.Bytes(), &createTerminalPayload); err != nil {
		t.Fatalf("decode create child response: %v", err)
	}
	if len(createTerminalPayload.SectionIDs) != 1 {
		t.Fatalf("expected one created terminal id, got %#v", createTerminalPayload.SectionIDs)
	}
	terminalID := createTerminalPayload.SectionIDs[0]

	createSiblingResponse := post(RouteCreateChildSectionsViaIncrementer, `{"projectConfigId":"project-alpha","calledBy":"child-a","implType":"TextBlock","numChildren":1}`)
	if createSiblingResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteCreateChildSectionsViaIncrementer, createSiblingResponse.Code, createSiblingResponse.Body.String())
	}
	var createSiblingPayload projectstate.CreateChildSectionsResult
	if err := json.Unmarshal(createSiblingResponse.Body.Bytes(), &createSiblingPayload); err != nil {
		t.Fatalf("decode incrementer child response: %v", err)
	}
	if len(createSiblingPayload.SectionIDs) != 1 {
		t.Fatalf("expected one created incrementer child id, got %#v", createSiblingPayload.SectionIDs)
	}
	createdSiblingID := createSiblingPayload.SectionIDs[0]

	deleteSiblingResponse := post(RouteDeleteChildSectionsViaDecrementer, `{"projectConfigId":"project-alpha","calledBy":"child-a","numChildren":1}`)
	if deleteSiblingResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteDeleteChildSectionsViaDecrementer, deleteSiblingResponse.Code, deleteSiblingResponse.Body.String())
	}
	var deleteSiblingPayload projectstate.DeleteSectionsResult
	if err := json.Unmarshal(deleteSiblingResponse.Body.Bytes(), &deleteSiblingPayload); err != nil {
		t.Fatalf("decode decrementer delete response: %v", err)
	}
	if !reflect.DeepEqual(deleteSiblingPayload.SectionIDs, []string{createdSiblingID}) {
		t.Fatalf("expected deleted child ids [%s], got %#v", createdSiblingID, deleteSiblingPayload.SectionIDs)
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	if _, ok := payload.ProjectState.Sections[terminalID]; !ok {
		t.Fatalf("expected created terminal section %q to exist", terminalID)
	}
	if parent := payload.ProjectState.ParentSectionMap[terminalID]; parent == nil || *parent != "code-section" {
		t.Fatalf("expected terminal parent code-section, got %#v", parent)
	}
	codeVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["code-section"]
	codeImplID := payload.ProjectState.SectionVariants[codeVariantID].Impl
	codePayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[codeImplID])
	if got := codePayload["attachedTerminalSectionId"]; got != terminalID {
		t.Fatalf("expected attachedTerminalSectionId %q, got %#v", terminalID, got)
	}
	if got := decodeProjectRouteStringArray(codePayload["children"]); !reflect.DeepEqual(got, []string{terminalID}) {
		t.Fatalf("expected code children [%s], got %#v", terminalID, got)
	}

	if _, ok := payload.ProjectState.Sections[createdSiblingID]; ok {
		t.Fatalf("expected created incrementer child %q to be deleted", createdSiblingID)
	}
	groupVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["group-parent"]
	groupImplID := payload.ProjectState.SectionVariants[groupVariantID].Impl
	groupPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[groupImplID])
	if got := decodeProjectRouteStringArray(groupPayload["children"]); !reflect.DeepEqual(got, []string{"child-a", "child-b"}) {
		t.Fatalf("expected group children [child-a child-b], got %#v", got)
	}
}

func TestRegisterProjectRoutesChildSectionMutationsSupportExpandedTypes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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

	createBrowserResponse := post(RouteCreateChildSections, `{"projectConfigId":"project-alpha","parentId":"group-parent","implType":"Browser","numChildren":1}`)
	if createBrowserResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for browser child create, got %d with body %q", createBrowserResponse.Code, createBrowserResponse.Body.String())
	}
	var createBrowserPayload projectstate.CreateChildSectionsResult
	if err := json.Unmarshal(createBrowserResponse.Body.Bytes(), &createBrowserPayload); err != nil {
		t.Fatalf("decode browser child create response: %v", err)
	}
	if len(createBrowserPayload.SectionIDs) != 1 {
		t.Fatalf("expected one browser child id, got %#v", createBrowserPayload.SectionIDs)
	}

	createMetaControlResponse := post(RouteCreateChildSectionsViaIncrementer, `{"projectConfigId":"project-alpha","calledBy":"child-a","implType":"MetaControl","numChildren":1}`)
	if createMetaControlResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for meta control incrementer create, got %d with body %q", createMetaControlResponse.Code, createMetaControlResponse.Body.String())
	}
	var createMetaControlPayload projectstate.CreateChildSectionsResult
	if err := json.Unmarshal(createMetaControlResponse.Body.Bytes(), &createMetaControlPayload); err != nil {
		t.Fatalf("decode meta control incrementer response: %v", err)
	}
	if len(createMetaControlPayload.SectionIDs) != 1 {
		t.Fatalf("expected one meta control child id, got %#v", createMetaControlPayload.SectionIDs)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}

	_, _, browserImpl, err := project.ResolveSection(createBrowserPayload.SectionIDs[0])
	if err != nil {
		t.Fatalf("resolve browser child: %v", err)
	}
	browserPayload := decodeProjectRouteRawObject(t, browserImpl.Payload)
	if got, _ := browserPayload["type"].(string); got != "Browser" {
		t.Fatalf("expected browser payload type Browser, got %q", got)
	}
	if got, _ := browserPayload["viewMode"].(string); got != string(projectstate.BrowserAreaViewModeList) {
		t.Fatalf("expected browser view mode %q, got %q", projectstate.BrowserAreaViewModeList, got)
	}

	_, _, metaControlImpl, err := project.ResolveSection(createMetaControlPayload.SectionIDs[0])
	if err != nil {
		t.Fatalf("resolve meta control child: %v", err)
	}
	metaControlPayload := decodeProjectRouteRawObject(t, metaControlImpl.Payload)
	if got, _ := metaControlPayload["type"].(string); got != "MetaControl" {
		t.Fatalf("expected meta control payload type MetaControl, got %q", got)
	}
	metaControlParamID, _ := metaControlPayload["metaControlParamId"].(string)
	if strings.TrimSpace(metaControlParamID) == "" {
		t.Fatalf("expected meta control child param id, got %#v", metaControlPayload)
	}
	if _, ok := project.CodeObjs[metaControlParamID]; !ok {
		t.Fatalf("expected meta control code object %q to exist, got %#v", metaControlParamID, project.CodeObjs)
	}
}

func TestRegisterProjectRoutesCreateChildSectionsSupportsSourceSingletonAndGeneratedTypes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateChildSections, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	testCases := []struct {
		name         string
		implType     string
		expectedName string
		expectedKind projectstate.SectionKind
		expectedGen  projectstate.GeneratedSectionKind
	}{
		{
			name:         "global variables",
			implType:     "GlobalVariables",
			expectedName: "Global Variables",
			expectedKind: projectstate.SectionKind("frontend"),
		},
		{
			name:         "generated python code",
			implType:     "GenPythonCode",
			expectedName: "Generated Python Code",
			expectedKind: projectstate.SectionKindGenerated,
			expectedGen:  projectstate.GeneratedSectionKindPythonCode,
		},
		{
			name:         "generated python metadata",
			implType:     "GenPythonMetadata",
			expectedName: "Generated Python Metadata",
			expectedKind: projectstate.SectionKindGenerated,
			expectedGen:  projectstate.GeneratedSectionKindPythonMetadata,
		},
	}

	for _, tc := range testCases {
		response := post(fmt.Sprintf(`{"projectConfigId":"project-alpha","parentId":"group-parent","implType":"%s","numChildren":1}`, tc.implType))
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s child create, got %d with body %q", tc.name, response.Code, response.Body.String())
		}

		var payload projectstate.CreateChildSectionsResult
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode %s child create response: %v", tc.name, err)
		}
		if len(payload.SectionIDs) != 1 {
			t.Fatalf("expected one %s child id, got %#v", tc.name, payload.SectionIDs)
		}

		project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
		if err != nil {
			t.Fatalf("project snapshot after %s child create: %v", tc.name, err)
		}
		createdSection, ok := project.Sections[payload.SectionIDs[0]]
		if !ok {
			t.Fatalf("expected created %s section %q", tc.name, payload.SectionIDs[0])
		}
		if createdSection.Name != tc.expectedName {
			t.Fatalf("expected %s child name %q, got %q", tc.name, tc.expectedName, createdSection.Name)
		}
		_, _, impl, err := project.ResolveSection(payload.SectionIDs[0])
		if err != nil {
			t.Fatalf("resolve %s child section: %v", tc.name, err)
		}
		if impl.Kind != tc.expectedKind {
			t.Fatalf("expected %s child kind %q, got %q", tc.name, tc.expectedKind, impl.Kind)
		}
		if tc.expectedKind == projectstate.SectionKindGenerated {
			if impl.Generated == nil || impl.Generated.Kind != tc.expectedGen {
				t.Fatalf("expected %s generated kind %q, got %#v", tc.name, tc.expectedGen, impl.Generated)
			}
		}

		implPayload := decodeProjectRouteRawObject(t, impl.Payload)
		if got, _ := implPayload["type"].(string); got != tc.implType {
			t.Fatalf("expected %s child payload type %q, got %#v", tc.name, tc.implType, implPayload["type"])
		}
	}
}

func TestRegisterProjectRoutesCreateChildSectionsViaIncrementerSupportsSourceDirectOnlyTypes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
		implType     string
		expectedName string
		expectedKind projectstate.SectionKind
		expectedGen  projectstate.GeneratedSectionKind
	}{
		{
			name:         "global variables",
			implType:     "GlobalVariables",
			expectedName: "Global Variables",
			expectedKind: projectstate.SectionKind("frontend"),
		},
		{
			name:         "generated python code",
			implType:     "GenPythonCode",
			expectedName: "Generated Python Code",
			expectedKind: projectstate.SectionKindGenerated,
			expectedGen:  projectstate.GeneratedSectionKindPythonCode,
		},
		{
			name:         "generated python metadata",
			implType:     "GenPythonMetadata",
			expectedName: "Generated Python Metadata",
			expectedKind: projectstate.SectionKindGenerated,
			expectedGen:  projectstate.GeneratedSectionKindPythonMetadata,
		},
	}

	for _, tc := range testCases {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteCreateChildSectionsViaIncrementer,
			strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","calledBy":"child-a","implType":"%s","numChildren":1}`, tc.implType)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for incrementer %s create, got %d with body %q", tc.name, response.Code, response.Body.String())
		}

		var payload projectstate.CreateChildSectionsResult
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode %s incrementer create response: %v", tc.name, err)
		}
		if len(payload.SectionIDs) != 1 {
			t.Fatalf("expected one %s incrementer child id, got %#v", tc.name, payload.SectionIDs)
		}

		project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
		if err != nil {
			t.Fatalf("project snapshot after incrementer %s create: %v", tc.name, err)
		}
		createdSection, ok := project.Sections[payload.SectionIDs[0]]
		if !ok {
			t.Fatalf("expected created incrementer %s section %q", tc.name, payload.SectionIDs[0])
		}
		if createdSection.Name != tc.expectedName {
			t.Fatalf("expected incrementer %s child name %q, got %q", tc.name, tc.expectedName, createdSection.Name)
		}
		_, _, impl, err := project.ResolveSection(payload.SectionIDs[0])
		if err != nil {
			t.Fatalf("resolve incrementer %s child: %v", tc.name, err)
		}
		if impl.Kind != tc.expectedKind {
			t.Fatalf("expected incrementer %s child kind %q, got %q", tc.name, tc.expectedKind, impl.Kind)
		}
		if tc.expectedKind == projectstate.SectionKindGenerated {
			if impl.Generated == nil || impl.Generated.Kind != tc.expectedGen {
				t.Fatalf("expected incrementer %s generated kind %q, got %#v", tc.name, tc.expectedGen, impl.Generated)
			}
		}
	}
}

func TestRegisterProjectRoutesCreateChildSectionsViaIncrementerRejectsTopLevelOnlyStateMachineTypes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
	for _, implType := range []string{"StateMachineStart", "StateMachineGate", "StateMachineEnd"} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteCreateChildSectionsViaIncrementer,
			strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","calledBy":"child-a","implType":"%s","numChildren":1}`, implType)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for incrementer %s child create, got %d with body %q", implType, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"child_section_mutation_invalid"`) {
			t.Fatalf("expected child_section_mutation_invalid for incrementer %s child create, got %q", implType, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesCreateChildSectionsRejectsTopLevelOnlyStateMachineTypes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
	for _, implType := range []string{"StateMachineStart", "StateMachineGate", "StateMachineEnd"} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteCreateChildSections,
			strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","parentId":"group-parent","implType":"%s","numChildren":1}`, implType)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for direct %s child create, got %d with body %q", implType, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"child_section_mutation_invalid"`) {
			t.Fatalf("expected child_section_mutation_invalid for direct %s child create, got %q", implType, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesChildSectionMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
			route:        RouteCreateChildSections,
			body:         `{"projectConfigId":"project-alpha","parentId":"","implType":"Terminal","numChildren":1}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"parent_id_required"`,
		},
		{
			route:        RouteCreateChildSections,
			body:         `{"projectConfigId":"project-alpha","parentId":"code-section","implType":"TextBlock","numChildren":1}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"child_section_mutation_invalid"`,
		},
		{
			route:        RouteCreateChildSectionsViaIncrementer,
			body:         `{"projectConfigId":"project-alpha","calledBy":"missing","implType":"TextBlock","numChildren":1}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"section_not_found"`,
		},
		{
			route:        RouteDeleteChildSectionsViaDecrementer,
			body:         `{"projectConfigId":"project-alpha","calledBy":"group-parent","numChildren":-1}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"child_section_request_invalid"`,
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

func TestRegisterProjectRoutesCreateChildSectionsRejectsDeploymentStructuralChanges(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			baselineProject := childSectionRouteTestProject(t)
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": baselineProject,
					},
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteCreateChildSections,
				strings.NewReader(`{"projectConfigId":"project-alpha","parentId":"code-section","implType":"Terminal","numChildren":1,"startIdx":0}`),
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
			if len(overlayProject.Sections) != len(baselineProject.Sections) {
				t.Fatalf("expected rejected mutation to preserve overlay section count %d, got %d", len(baselineProject.Sections), len(overlayProject.Sections))
			}
			if got := overlayProject.SectionImpls["code-impl"].Code; got == nil || len(got.Children) != 0 {
				t.Fatalf("expected code section to keep no attached children, got %#v", got)
			}
		})
	}
}

func TestRegisterProjectRoutesDeleteSectionsRejectsDeploymentStructuralChanges(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			baselineProject := sectionStructureRouteTestProject(t)
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": baselineProject,
					},
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteDeleteSections,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["top-group"]}`),
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
			if len(overlayProject.Sections) != len(baselineProject.Sections) {
				t.Fatalf("expected rejected mutation to preserve overlay section count %d, got %d", len(baselineProject.Sections), len(overlayProject.Sections))
			}
			if _, ok := overlayProject.Sections["top-group"]; !ok {
				t.Fatal("expected rejected mutation to preserve top-group in overlay")
			}
			if _, ok := overlayProject.Sections["top-child-a"]; !ok {
				t.Fatal("expected rejected mutation to preserve top-child-a in overlay")
			}
			if _, ok := overlayProject.Sections["top-child-b"]; !ok {
				t.Fatal("expected rejected mutation to preserve top-child-b in overlay")
			}
		})
	}
}

func TestRegisterProjectRoutesParamSelectionMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
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
		route string
		body  string
	}{
		{
			route: RouteToggleParamSelected,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child"}`,
		},
		{
			route: RouteToggleParamSelected,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-secret"}`,
		},
		{
			route: RouteDeleteSelectedParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoIds":["shared-child"]}`,
		},
		{
			route: RouteUnselectAllParams,
			body:  `{"projectConfigId":"project-alpha"}`,
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

	if _, ok := payload.ProjectState.CodeObjs["shared-child"]; ok {
		t.Fatal("expected shared-child code object to be deleted")
	}
	if _, ok := payload.ProjectState.CodeObjs["shared-secret"]; !ok {
		t.Fatal("expected shared-secret code object to remain")
	}

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-a"]
	dictImplID := payload.ProjectState.SectionVariants[dictVariantID].Impl
	dictPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[dictImplID])
	if got := decodeProjectRouteStringArray(dictPayload["selectedParams"]); len(got) != 0 {
		t.Fatalf("expected selectedParams to be cleared, got %#v", got)
	}
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	if _, ok := codeObjVariantMap["shared-child"]; ok {
		t.Fatalf("expected deleted param to be removed from codeObjVariantMap, got %#v", codeObjVariantMap)
	}
}

func TestRegisterProjectRoutesParamSelectionUsesDeploymentOverlayWhenParamChangesAllowed(t *testing.T) {
	t.Parallel()

	selectedParamsForProject := func(t *testing.T, project projectstate.Project) []string {
		t.Helper()

		dictVariantID := project.SectionVariantMap["dict-a"]
		dictPayload, err := project.EffectiveSectionPayload("dict-a", dictVariantID)
		if err != nil {
			t.Fatalf("effective section payload dict-a: %v", err)
		}
		return decodeProjectRouteStringArray(dictPayload["selectedParams"])
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": passwordParamRouteTestProject(t),
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

			toggleRequest := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteToggleParamSelected,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child"}`),
			)
			toggleRequest.Header.Set("Content-Type", "application/json")
			toggleRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")
			toggleResponse := httptest.NewRecorder()
			handler.ServeHTTP(toggleResponse, toggleRequest)
			if toggleResponse.Code != http.StatusOK {
				t.Fatalf("expected 200 for toggle, got %d with body %q", toggleResponse.Code, toggleResponse.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if got := selectedParamsForProject(t, overlayProject); !reflect.DeepEqual(got, []string{"shared-child"}) {
				t.Fatalf("expected overlay selectedParams [shared-child] after toggle, got %#v", got)
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			if got := selectedParamsForProject(t, baseProject); len(got) != 0 {
				t.Fatalf("expected base selectedParams to remain empty after toggle, got %#v", got)
			}

			unselectRequest := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteUnselectAllParams,
				strings.NewReader(`{"projectConfigId":"project-alpha"}`),
			)
			unselectRequest.Header.Set("Content-Type", "application/json")
			unselectRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")
			unselectResponse := httptest.NewRecorder()
			handler.ServeHTTP(unselectResponse, unselectRequest)
			if unselectResponse.Code != http.StatusOK {
				t.Fatalf("expected 200 for unselect, got %d with body %q", unselectResponse.Code, unselectResponse.Body.String())
			}

			overlayProject = overlay.Snapshot().Document.Projects["project-alpha"]
			if got := selectedParamsForProject(t, overlayProject); len(got) != 0 {
				t.Fatalf("expected overlay selectedParams to clear after unselect, got %#v", got)
			}
		})
	}
}

func TestRegisterProjectRoutesParamSelectionRejectsDeploymentPolicyWhenParamChangesDisallowed(t *testing.T) {
	t.Parallel()

	selectedParamsForProject := func(t *testing.T, project projectstate.Project) []string {
		t.Helper()

		dictVariantID := project.SectionVariantMap["dict-a"]
		dictPayload, err := project.EffectiveSectionPayload("dict-a", dictVariantID)
		if err != nil {
			t.Fatalf("effective section payload dict-a: %v", err)
		}
		return decodeProjectRouteStringArray(dictPayload["selectedParams"])
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": passwordParamRouteTestProject(t),
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

			for _, requestSpec := range []struct {
				name  string
				route string
				body  string
			}{
				{
					name:  "toggle",
					route: RouteToggleParamSelected,
					body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child"}`,
				},
				{
					name:  "unselect",
					route: RouteUnselectAllParams,
					body:  `{"projectConfigId":"project-alpha"}`,
				},
			} {
				t.Run(requestSpec.name, func(t *testing.T) {
					request := httptest.NewRequest(
						http.MethodPost,
						"/api"+requestSpec.route,
						strings.NewReader(requestSpec.body),
					)
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("expected 403 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
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
					if got := selectedParamsForProject(t, overlayProject); len(got) != 0 {
						t.Fatalf("expected rejected mutation to keep overlay selectedParams empty, got %#v", got)
					}
				})
			}
		})
	}
}

func TestRegisterProjectRoutesParamMoveMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": paramMoveRouteTestProject(t),
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
			route: RouteIndentParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-a","selected-b"]}`,
		},
		{
			route: RouteUnindentParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-b"]}`,
		},
		{
			route: RouteMoveParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-a"],"newParentId":"root-param","newIndex":0}`,
		},
		{
			route: RouteMoveParamGroups,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","moves":[{"paramIds":["selected-a"],"newParentId":"root-param","newIndex":3}]}`,
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

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-section"]
	dictImplID := payload.ProjectState.SectionVariants[dictVariantID].Impl
	dictPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[dictImplID])
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	rootSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["root-param"].SharedModifier)
	if got := decodeProjectRouteStringArray(rootSharedModifier["children"]); !reflect.DeepEqual(got, []string{"parent-param", "selected-b", "other-param", "selected-a"}) {
		t.Fatalf("expected final root order [parent-param selected-b other-param selected-a], got %#v", got)
	}

	parentVariantID, ok := codeObjVariantMap["parent-param"].(string)
	if !ok {
		t.Fatalf("expected parent-param variant id string, got %#v", codeObjVariantMap["parent-param"])
	}
	parentImplID := payload.ProjectState.CodeObjVariants[parentVariantID].Impl
	parentImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjImpls[parentImplID])
	if got := parentImplPayload["type"]; got != "NestedParam" {
		t.Fatalf("expected parent-param impl type NestedParam after indent, got %#v", got)
	}
	parentSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["parent-param"].SharedModifier)
	if got := decodeProjectRouteStringArray(parentSharedModifier["children"]); len(got) != 0 {
		t.Fatalf("expected parent-param children to be empty after move-out, got %#v", got)
	}
}

func TestRegisterProjectRoutesParamMoveMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": paramMoveRouteTestProject(t),
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
			route:        RouteIndentParams,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-a"," "]}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"param_ids_invalid"`,
		},
		{
			route:        RouteMoveParams,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-a"],"newParentId":"missing-param","newIndex":0}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"new_parent_not_found"`,
		},
		{
			route:        RouteMoveParamGroups,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-section","moves":[{"paramIds":["selected-a"],"newParentId":"selected-a","newIndex":0}]}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"param_move_invalid"`,
		},
		{
			route:        RouteMoveParams,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-a"],"newParentId":"root-param","newIndex":-1}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"new_index_invalid"`,
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

func TestRegisterProjectRoutesAddKwargPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
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

	response := post(RouteAddKwarg, `{"projectConfigId":"project-alpha","sectionId":"dict-a"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteAddKwarg, response.Code, response.Body.String())
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	sharedRootSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["shared-root"].SharedModifier)
	sharedChildren := decodeProjectRouteStringArray(sharedRootSharedModifier["children"])
	if len(sharedChildren) != 3 || sharedChildren[0] != "shared-child" || sharedChildren[1] != "shared-secret" {
		t.Fatalf("expected shared-root children to append one new param, got %#v", sharedChildren)
	}
	createdCodeObj, ok := payload.ProjectState.CodeObjs[sharedChildren[2]]
	if !ok {
		t.Fatalf("expected created shared child %q to be present in code objects", sharedChildren[2])
	}
	if createdCodeObj.Name != "" {
		t.Fatalf("expected created shared child name to start empty, got %q", createdCodeObj.Name)
	}

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-a"]
	dictImplID := payload.ProjectState.SectionVariants[dictVariantID].Impl
	dictPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[dictImplID])
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected dict codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	if _, ok := codeObjVariantMap[sharedChildren[2]]; !ok {
		t.Fatalf("expected created shared child %q to be present in codeObjVariantMap, got %#v", sharedChildren[2], codeObjVariantMap)
	}
}

func TestRegisterProjectRoutesDeleteKwargPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
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

	response := post(RouteDeleteKwarg, `{"projectConfigId":"project-alpha","sectionId":"dict-a"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteDeleteKwarg, response.Code, response.Body.String())
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	sharedRootSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["shared-root"].SharedModifier)
	if children := decodeProjectRouteStringArray(sharedRootSharedModifier["children"]); !reflect.DeepEqual(children, []string{"shared-child"}) {
		t.Fatalf("expected shared-root children [shared-child] after deleteKwarg, got %#v", children)
	}

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-a"]
	dictImplID := payload.ProjectState.SectionVariants[dictVariantID].Impl
	dictPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[dictImplID])
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected dict codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	if _, ok := codeObjVariantMap["shared-secret"]; ok {
		t.Fatalf("expected deleted shared-secret to be removed from codeObjVariantMap, got %#v", codeObjVariantMap)
	}
	if _, ok := payload.ProjectState.CodeObjs["shared-secret"]; ok {
		t.Fatalf("expected shared-secret code object to be pruned after deleteKwarg")
	}
}

func TestRegisterProjectRoutesKwargMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionEdgeRouteTestProject(t),
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
			route:        RouteAddKwarg,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"kwarg_mutation_invalid"`,
		},
		{
			route:        RouteDeleteKwarg,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"kwarg_mutation_invalid"`,
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

func TestRegisterProjectRoutesBrowserMetadataMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": browserSectionRouteTestProject(t),
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
			body:  `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"images","name":"Images","query":"png","searchScope":"local","typeFilters":{"image":true,"video":false,"audio":false,"text":false,"data":false},"color":"#ef4444","quickInfo":"Only images"},{"id":"defaults","name":"Defaults","query":"todo","color":"#3b82f6","quickInfo":""}]}`,
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

	browserSection := payload.ProjectState.Sections["browser-section"]
	browserSharedModifier := decodeProjectRouteRawObject(t, browserSection.SharedModifier)
	if browserSharedModifier["columnWidth"] != 240.5 {
		t.Fatalf("expected columnWidth 240.5, got %#v", browserSharedModifier["columnWidth"])
	}
	if browserSharedModifier["typesColumnWidth"] != 160.0 {
		t.Fatalf("expected typesColumnWidth 160.0, got %#v", browserSharedModifier["typesColumnWidth"])
	}
	if browserSharedModifier["viewMode"] != "thumbnail" {
		t.Fatalf("expected viewMode thumbnail, got %#v", browserSharedModifier["viewMode"])
	}
	if browserSharedModifier["hideColumn"] != true {
		t.Fatalf("expected hideColumn=true, got %#v", browserSharedModifier["hideColumn"])
	}

	savedSearches, ok := browserSharedModifier["savedSearches"].([]any)
	if !ok || len(savedSearches) != 2 {
		t.Fatalf("expected two saved searches, got %#v", browserSharedModifier["savedSearches"])
	}
	secondSavedSearch, ok := savedSearches[1].(map[string]any)
	if !ok {
		t.Fatalf("expected second saved search object, got %#v", savedSearches[1])
	}
	if secondSavedSearch["searchScope"] != "recursive" {
		t.Fatalf("expected blank searchScope to normalize to recursive, got %#v", secondSavedSearch["searchScope"])
	}
	secondTypeFilters, ok := secondSavedSearch["typeFilters"].(map[string]any)
	if !ok {
		t.Fatalf("expected second saved search typeFilters object, got %#v", secondSavedSearch["typeFilters"])
	}
	for _, key := range []string{"image", "video", "audio", "text", "data"} {
		if secondTypeFilters[key] != true {
			t.Fatalf("expected default type filter %s=true, got %#v", key, secondTypeFilters[key])
		}
	}
}

func TestRegisterProjectRoutesSetCodeFileBindingPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": codeFileBindingRouteTestProject(t),
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

	for _, accessMode := range []projectstate.CodeFileAccessMode{
		projectstate.CodeFileAccessModeReadWrite,
		projectstate.CodeFileAccessModeReadOnly,
		projectstate.CodeFileAccessModeWriteOnly,
	} {
		response := post(
			RouteSetCodeFileBinding,
			`{"projectConfigId":"project-alpha","sectionId":"code-section","binding":{"canonical_path":"./pkg/../pkg/`+string(accessMode)+`.py","access_mode":"`+string(accessMode)+`"}}`,
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", accessMode, response.Code, response.Body.String())
		}

		latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
		if latestResponse.Code != http.StatusOK {
			t.Fatalf("expected 200 latest-state response for %s, got %d with body %q", accessMode, latestResponse.Code, latestResponse.Body.String())
		}

		var payload ProjectStateSingleConfigWithCompletedOpIDs
		if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode latest project payload for %s: %v", accessMode, err)
		}

		codeSection := payload.ProjectState.Sections["code-section"]
		codeSharedModifier := decodeProjectRouteRawObject(t, codeSection.SharedModifier)
		rawBinding, ok := codeSharedModifier["codeFileBinding"].(map[string]any)
		if !ok {
			t.Fatalf("expected codeFileBinding object for %s, got %#v", accessMode, codeSharedModifier["codeFileBinding"])
		}
		if rawBinding["canonical_path"] != "pkg/"+string(accessMode)+".py" {
			t.Fatalf("expected canonical_path pkg/%s.py, got %#v", accessMode, rawBinding["canonical_path"])
		}
		if rawBinding["access_mode"] != string(accessMode) {
			t.Fatalf("expected access_mode %s, got %#v", accessMode, rawBinding["access_mode"])
		}
		if rawBinding["autoBinding"] != false {
			t.Fatalf("expected autoBinding=false for %s, got %#v", accessMode, rawBinding["autoBinding"])
		}

		project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
		_, _, impl, err := project.ResolveSection("code-section")
		if err != nil {
			t.Fatalf("resolve code section for %s: %v", accessMode, err)
		}
		if impl.Code == nil || impl.Code.Binding == nil {
			t.Fatalf("expected code impl binding for %s, got %#v", accessMode, impl.Code)
		}
		if impl.Code.Binding.Path != "pkg/"+string(accessMode)+".py" {
			t.Fatalf("expected impl binding path pkg/%s.py, got %q", accessMode, impl.Code.Binding.Path)
		}
		if impl.Code.Binding.AccessMode != accessMode {
			t.Fatalf("expected impl binding access mode %s, got %q", accessMode, impl.Code.Binding.AccessMode)
		}
	}
}

func TestRegisterProjectRoutesSetCodeFileBindingRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": codeFileBindingRouteTestProject(t),
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
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","binding":{"canonical_path":"pkg/plain.py","access_mode":"read_write"}}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"invalid_code_section"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionId":"code-section","binding":{"canonical_path":" ","access_mode":"read_only"}}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"code_file_binding_path_required"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionId":"code-section","binding":{"canonical_path":"pkg/invalid.py","access_mode":"execute"}}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"code_file_access_mode_invalid"`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteSetCodeFileBinding,
			strings.NewReader(requestSpec.body),
		)
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

func TestRegisterProjectRoutesBrowserMetadataMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": browserSectionRouteTestProject(t),
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
			name:                "browser_mutation_requires_browser_section",
			route:               RouteSetBrowserHideColumn,
			body:                `{"projectConfigId":"project-alpha","sectionId":"plain-section","hideColumn":true}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "browser_section_required",
			expectedMessagePart: "Section must resolve to a browser section.",
		},
		{
			name:                "view_mode_rejects_unknown_literal_at_transport",
			route:               RouteSetBrowserAreaViewMode,
			body:                `{"projectConfigId":"project-alpha","sectionId":"browser-section","viewMode":"grid"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid viewMode value "grid".`,
		},
		{
			name:                "view_mode_rejects_padded_literal_without_trimming",
			route:               RouteSetBrowserAreaViewMode,
			body:                `{"projectConfigId":"project-alpha","sectionId":"browser-section","viewMode":" thumbnail "}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid viewMode value " thumbnail ".`,
		},
		{
			name:                "saved_search_scope_rejects_unknown_literal_at_transport",
			route:               RouteSetBrowserSavedSearches,
			body:                `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"bad","searchScope":"global"}]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid searchScope value "global".`,
		},
		{
			name:                "saved_search_scope_rejects_blank_present_field",
			route:               RouteSetBrowserSavedSearches,
			body:                `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"bad","searchScope":""}]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid searchScope value "".`,
		},
		{
			name:                "saved_search_scope_rejects_padded_present_field",
			route:               RouteSetBrowserSavedSearches,
			body:                `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"bad","searchScope":" local "} ]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid searchScope value " local ".`,
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

	browserVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["browser-section"]
	browserImplID := payload.ProjectState.SectionVariants[browserVariantID].Impl
	browserImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[browserImplID])
	if got := browserImplPayload["viewMode"]; got != "list" {
		t.Fatalf("expected rejected browser view-mode requests to leave viewMode unchanged, got %#v", got)
	}
	if got := browserImplPayload["savedSearches"]; !reflect.DeepEqual(got, []any{}) {
		t.Fatalf("expected rejected saved-search requests to leave savedSearches unchanged, got %#v", got)
	}
}

func TestRegisterProjectRoutesBrowserMetadataUsesDeploymentOverlayWhenLayoutChangesAllowed(t *testing.T) {
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
					body:  `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"images","name":"Images","query":"png","searchScope":"local","typeFilters":{"image":true,"video":false,"audio":false,"text":false,"data":false},"color":"#ef4444","quickInfo":"Only images"},{"id":"defaults","name":"Defaults","query":"todo","color":"#3b82f6","quickInfo":""}]}`,
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
			overlaySharedModifier := decodeProjectRouteRawObject(t, overlay.Snapshot().Document.Projects["project-alpha"].Sections["browser-section"].SharedModifier)
			if overlaySharedModifier["columnWidth"] != 240.5 {
				t.Fatalf("expected overlay columnWidth 240.5, got %#v", overlaySharedModifier["columnWidth"])
			}
			if overlaySharedModifier["typesColumnWidth"] != 160.0 {
				t.Fatalf("expected overlay typesColumnWidth 160.0, got %#v", overlaySharedModifier["typesColumnWidth"])
			}
			if overlaySharedModifier["viewMode"] != "thumbnail" {
				t.Fatalf("expected overlay viewMode thumbnail, got %#v", overlaySharedModifier["viewMode"])
			}
			if overlaySharedModifier["hideColumn"] != true {
				t.Fatalf("expected overlay hideColumn=true, got %#v", overlaySharedModifier["hideColumn"])
			}
			overlaySavedSearches, ok := overlaySharedModifier["savedSearches"].([]any)
			if !ok || len(overlaySavedSearches) != 2 {
				t.Fatalf("expected overlay saved searches, got %#v", overlaySharedModifier["savedSearches"])
			}
			secondOverlaySavedSearch, ok := overlaySavedSearches[1].(map[string]any)
			if !ok {
				t.Fatalf("expected overlay second saved search object, got %#v", overlaySavedSearches[1])
			}
			if secondOverlaySavedSearch["searchScope"] != "recursive" {
				t.Fatalf("expected overlay blank searchScope to normalize to recursive, got %#v", secondOverlaySavedSearch["searchScope"])
			}

			baseSharedModifier := decodeProjectRouteRawObject(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"].Sections["browser-section"].SharedModifier)
			if len(baseSharedModifier) != 0 {
				t.Fatalf("expected base browser shared modifier unchanged, got %#v", baseSharedModifier)
			}
		})
	}
}

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

	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteToggleGroupOrientation,
			body:  `{"projectConfigId":"project-alpha","sectionId":"group-section"}`,
		},
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
		{
			route: RouteSetImageAreaImagePath,
			body:  `{"projectConfigId":"project-alpha","sectionId":"image-section","imagePath":"/tmp/updated.png"}`,
		},
		{
			route: RouteSetSocialURL,
			body:  `{"projectConfigId":"project-alpha","sectionId":"social-section","url":"https://example.com/watch?v=123"}`,
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
	if spreadsheetModifier["density"] != "comfortable" {
		t.Fatalf("expected spreadsheet density comfortable, got %#v", spreadsheetModifier["density"])
	}
	if spreadsheetModifier["autoReloadOnExternalChange"] != true {
		t.Fatalf("expected spreadsheet autoReloadOnExternalChange=true, got %#v", spreadsheetModifier["autoReloadOnExternalChange"])
	}

	taskBoardModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["task-board-section"].SharedModifier)
	if taskBoardModifier["viewMode"] != "task_list" {
		t.Fatalf("expected task board viewMode task_list, got %#v", taskBoardModifier["viewMode"])
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

	drawModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["draw-section"].SharedModifier)
	rawLayers, ok := drawModifier["layers"].([]any)
	if !ok || len(rawLayers) != 1 {
		t.Fatalf("expected one draw layer, got %#v", drawModifier["layers"])
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

	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetTextBlockFormat,
			body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","format":"Markdown"}`,
		},
		{
			route: RouteSetTextBlockHeadingAsSectionName,
			body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","headingAsSectionName":true}`,
		},
		{
			route: RouteSetTextBlockText,
			body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","text":"# Updated Heading\n\nBody"}`,
		},
		{
			route: RouteSetTextBlockDisplayMode,
			body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":"Edit"}`,
		},
		{
			route: RouteSetTextBlockMetaControlStyle,
			body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","metaControlStyle":true}`,
		},
		{
			route: RouteSetTextBlockMasterFontSize,
			body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","masterFontSizePx":64}`,
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

	textSection := payload.ProjectState.Sections["text-section"]
	if textSection.Name != "Updated Heading" {
		t.Fatalf("expected section name Updated Heading, got %q", textSection.Name)
	}

	textSharedModifier := decodeProjectRouteRawObject(t, textSection.SharedModifier)
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

func TestRegisterProjectRoutesSectionEdgeMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionEdgeRouteTestProject(t),
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
		route string
		body  string
	}{
		{
			route: RouteSetSectionEdgeInputs,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","edgeInputParams":[" added-param ","added-param"]}`,
		},
		{
			route: RouteSetSectionEdgeOutputs,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","edgeOutputPorts":[{"id":"new-port","accessor":"  .result  "},{"id":"new-port","accessor":".ignored"}]}`,
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

	dictSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["dict-section"].SharedModifier)
	if got := decodeProjectRouteStringArray(dictSharedModifier["edgeInputParams"]); !reflect.DeepEqual(got, []string{"added-param"}) {
		t.Fatalf("expected edgeInputParams [added-param], got %#v", got)
	}

	rawPorts, ok := dictSharedModifier["edgeOutputPorts"].([]any)
	if !ok || len(rawPorts) != 1 {
		t.Fatalf("expected one edgeOutputPort, got %#v", dictSharedModifier["edgeOutputPorts"])
	}
	portObject, ok := rawPorts[0].(map[string]any)
	if !ok {
		t.Fatalf("expected edgeOutputPorts[0] object, got %#v", rawPorts[0])
	}
	if got := portObject["id"]; got != "new-port" {
		t.Fatalf("expected edgeOutputPorts[0].id new-port, got %#v", got)
	}
	if got := portObject["accessor"]; got != ".result" {
		t.Fatalf("expected edgeOutputPorts[0].accessor .result, got %#v", got)
	}

	addedVariantID := payload.ProjectState.CodeObjs["added-param"].DefaultVariant
	if addedVariantID == nil {
		t.Fatal("expected added-param default variant to be present")
	}
	addedImplID := payload.ProjectState.CodeObjVariants[*addedVariantID].Impl
	addedPayload := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjImpls[addedImplID])
	if got := addedPayload["type"]; got != "CodeParam" {
		t.Fatalf("expected added-param to convert to CodeParam, got %#v", got)
	}
}

func TestRegisterProjectRoutesSectionEdgeMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionEdgeRouteTestProject(t),
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
			route:        RouteSetSectionEdgeInputs,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","edgeInputParams":["added-param"]}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"section_edge_io_unsupported"`,
		},
		{
			route:        RouteSetSectionEdgeOutputs,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","edgeOutputPorts":[{"id":"result","accessor":".result"}]}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"section_edge_io_unsupported"`,
		},
		{
			route:        RouteSetSectionEdgeInputs,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-section","edgeInputParams":["missing-param"]}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"param_info_not_found"`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestSpec.route,
			strings.NewReader(requestSpec.body),
		)
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

func TestRegisterProjectRoutesGraphEdgeMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": graphEdgeRouteTestProject(t),
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
	post := func(route string, body any) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+route,
			strings.NewReader(mustMarshalProjectRouteRequest(t, body)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	createResponse := post(RouteCreateEdge, map[string]any{
		"projectConfigId": "project-alpha",
		"sourceSectionId": "source-section",
		"sourceVariantId": "source-variant",
		"sourcePortId":    "result",
		"targetSectionId": "target-a",
		"targetVariantId": "target-a-variant",
		"targetPortId":    "input-a",
		"type":            "default",
	})
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 create-edge response, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.Edges) != 1 {
		t.Fatalf("expected one created edge, got %#v", project.Edges)
	}
	createdEdge := project.Edges[0]
	if createdEdge.ID == "" {
		t.Fatal("expected createEdge to generate an id")
	}
	targetAPayload, _, _, _, err := project.ResolveSectionCodeObject("target-a", "input-a")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-a/input-a after create: %v", err)
	}
	if got := targetAPayload["value"]; got != "state.Source_Call.result" {
		t.Fatalf("expected created edge expression state.Source_Call.result, got %#v", got)
	}

	label := "Primary"
	createdEdge.Label = &label
	createdEdge.Selected = true
	updateResponse := post(RouteUpdateEdge, UpdateEdgeRequest{
		ProjectID: "project-alpha",
		Edge:      createdEdge,
	})
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 update-edge response, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.Edges) != 1 {
		t.Fatalf("expected one updated edge, got %#v", project.Edges)
	}
	updatedEdge := project.Edges[0]
	if updatedEdge.Label == nil || *updatedEdge.Label != "Primary" || !updatedEdge.Selected {
		t.Fatalf("expected updated edge label/selection to persist, got %#v", updatedEdge)
	}

	reconnectResponse := post(RouteReconnectEdge, ReconnectEdgeRequest{
		ProjectID:       "project-alpha",
		EdgeID:          updatedEdge.ID,
		SourceSectionID: "source-section",
		SourceVariantID: "source-variant",
		SourcePortID:    "summary",
		TargetSectionID: "target-b",
		TargetVariantID: "target-b-variant",
		TargetPortID:    "input-b",
	})
	if reconnectResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 reconnect-edge response, got %d with body %q", reconnectResponse.Code, reconnectResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	reconnectedEdge := project.Edges[0]
	if reconnectedEdge.TargetSectionID != "target-b" || reconnectedEdge.TargetPortID != "input-b" || reconnectedEdge.SourcePortID != "summary" {
		t.Fatalf("expected reconnect to update endpoints, got %#v", reconnectedEdge)
	}
	targetAPayload, _, _, _, err = project.ResolveSectionCodeObject("target-a", "input-a")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-a/input-a after reconnect: %v", err)
	}
	if got := targetAPayload["value"]; got != "" {
		t.Fatalf("expected reconnect to clear previous target, got %#v", got)
	}
	targetBPayload, _, _, _, err := project.ResolveSectionCodeObject("target-b", "input-b")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-b/input-b after reconnect: %v", err)
	}
	if got := targetBPayload["value"]; got != "state.Source_Call" {
		t.Fatalf("expected reconnect to write state.Source_Call, got %#v", got)
	}

	reconnectedEdge.Hidden = true
	reconnectedEdge.Selected = false
	setResponse := post(RouteSetEdges, SetEdgesRequest{
		ProjectID: "project-alpha",
		Edges:     []projectstate.Edge{reconnectedEdge},
	})
	if setResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 set-edges response, got %d with body %q", setResponse.Code, setResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.Edges) != 1 || !project.Edges[0].Hidden || project.Edges[0].Selected {
		t.Fatalf("expected setEdges to persist hidden/selected flags, got %#v", project.Edges)
	}

	deleteResponse := post(RouteDeleteEdges, DeleteEdgesRequest{
		ProjectID: "project-alpha",
		EdgeIDs:   []string{reconnectedEdge.ID},
	})
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 delete-edges response, got %d with body %q", deleteResponse.Code, deleteResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.Edges) != 0 {
		t.Fatalf("expected deleteEdges to remove the edge, got %#v", project.Edges)
	}
	targetBPayload, _, _, _, err = project.ResolveSectionCodeObject("target-b", "input-b")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-b/input-b after delete: %v", err)
	}
	if got := targetBPayload["value"]; got != "" {
		t.Fatalf("expected deleteEdges to clear target-b value, got %#v", got)
	}

	createAgenticResponse := post(RouteCreateAgenticEdge, map[string]any{
		"projectConfigId": "project-alpha",
		"sourceSectionId": "chat-source",
		"targetSectionId": "chat-target",
		"kind":            "chat_chat",
	})
	if createAgenticResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 create-agentic-edge response, got %d with body %q", createAgenticResponse.Code, createAgenticResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.AgenticEdges) != 1 {
		t.Fatalf("expected one created agentic edge, got %#v", project.AgenticEdges)
	}
	createdAgenticEdge := project.AgenticEdges[0]
	if createdAgenticEdge.ID == "" || createdAgenticEdge.ContextMode != "reference_only" {
		t.Fatalf("expected createAgenticEdge to normalize id/contextMode, got %#v", createdAgenticEdge)
	}

	createdAgenticEdge.ContextMode = "inline_text"
	createdAgenticEdge.Selected = true
	updateAgenticResponse := post(RouteUpdateAgenticEdge, UpdateAgenticEdgeRequest{
		ProjectID: "project-alpha",
		Edge:      createdAgenticEdge,
	})
	if updateAgenticResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 update-agentic-edge response, got %d with body %q", updateAgenticResponse.Code, updateAgenticResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	updatedAgenticEdge := project.AgenticEdges[0]
	if updatedAgenticEdge.ContextMode != "inline_text" || !updatedAgenticEdge.Selected {
		t.Fatalf("expected updateAgenticEdge to persist contextMode/selection, got %#v", updatedAgenticEdge)
	}

	updatedAgenticEdge.Hidden = true
	setAgenticResponse := post(RouteSetAgenticEdges, SetAgenticEdgesRequest{
		ProjectID: "project-alpha",
		Edges:     []projectstate.AgenticEdge{updatedAgenticEdge},
	})
	if setAgenticResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 set-agentic-edges response, got %d with body %q", setAgenticResponse.Code, setAgenticResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.AgenticEdges) != 1 || !project.AgenticEdges[0].Hidden {
		t.Fatalf("expected setAgenticEdges to persist hidden flag, got %#v", project.AgenticEdges)
	}

	deleteAgenticResponse := post(RouteDeleteAgenticEdges, DeleteAgenticEdgesRequest{
		ProjectID: "project-alpha",
		EdgeIDs:   []string{updatedAgenticEdge.ID},
	})
	if deleteAgenticResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 delete-agentic-edges response, got %d with body %q", deleteAgenticResponse.Code, deleteAgenticResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.AgenticEdges) != 0 {
		t.Fatalf("expected deleteAgenticEdges to remove the edge, got %#v", project.AgenticEdges)
	}
}

func TestRegisterProjectRoutesGraphEdgeMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": graphEdgeRouteTestProject(t),
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

	noPythonProject := graphEdgeRouteTestProject(t)
	noPythonProject.CodegenTargets = nil
	noPythonRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": noPythonProject,
		},
	})
	if err != nil {
		t.Fatalf("open no-python overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := noPythonRuntime.Close(); err != nil {
			t.Fatalf("close no-python runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	noPythonHandler := newProjectRouteTestHandler(t, config.ModeIDE, noPythonRuntime, t.TempDir(), nil, nil, nil)

	for _, requestSpec := range []struct {
		name         string
		handler      http.Handler
		route        string
		body         any
		expectedCode int
		expectedBody string
	}{
		{
			name:    "create edge missing python target",
			handler: noPythonHandler,
			route:   RouteCreateEdge,
			body: map[string]any{
				"projectConfigId": "project-alpha",
				"sourceSectionId": "source-section",
				"sourceVariantId": "source-variant",
				"sourcePortId":    "result",
				"targetSectionId": "target-a",
				"targetVariantId": "target-a-variant",
				"targetPortId":    "input-a",
				"type":            "default",
			},
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"project_codegen_python_target_missing"`,
		},
		{
			name:    "create edge invalid target port",
			handler: handler,
			route:   RouteCreateEdge,
			body: map[string]any{
				"projectConfigId": "project-alpha",
				"sourceSectionId": "source-section",
				"sourceVariantId": "source-variant",
				"sourcePortId":    "result",
				"targetSectionId": "target-a",
				"targetVariantId": "target-a-variant",
				"targetPortId":    "missing-port",
				"type":            "default",
			},
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"edge_endpoint_invalid"`,
		},
		{
			name:    "reconnect edge missing edge",
			handler: handler,
			route:   RouteReconnectEdge,
			body: ReconnectEdgeRequest{
				ProjectID:       "project-alpha",
				EdgeID:          "missing-edge",
				SourceSectionID: "source-section",
				SourceVariantID: "source-variant",
				SourcePortID:    "result",
				TargetSectionID: "target-a",
				TargetVariantID: "target-a-variant",
				TargetPortID:    "input-a",
			},
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"edge_not_found"`,
		},
		{
			name:    "agentic edge invalid source type",
			handler: handler,
			route:   RouteCreateAgenticEdge,
			body: map[string]any{
				"projectConfigId": "project-alpha",
				"sourceSectionId": "plain-section",
				"targetSectionId": "chat-target",
				"kind":            "chat_section",
			},
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"agentic_edge_invalid"`,
		},
		{
			name:    "set agentic edges invalid context mode",
			handler: handler,
			route:   RouteSetAgenticEdges,
			body: SetAgenticEdgesRequest{
				ProjectID: "project-alpha",
				Edges: []projectstate.AgenticEdge{
					{
						ID:              "edge-invalid-context",
						SourceSectionID: "chat-source",
						TargetSectionID: "chat-target",
						Kind:            "chat_chat",
						ContextMode:     "bad-mode",
					},
				},
			},
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"agentic_edge_context_mode_invalid"`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestSpec.route,
			strings.NewReader(mustMarshalProjectRouteRequest(t, requestSpec.body)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		requestSpec.handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("%s: expected %d for %s, got %d with body %q", requestSpec.name, requestSpec.expectedCode, requestSpec.route, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("%s: expected response body to contain %s, got %q", requestSpec.name, requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesAgenticEdgesSupportDocumentedKindsAndContextModes(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		sourceID    string
		targetID    string
		kind        string
		contextMode string
	}{
		{
			name:        "chat chat reference only",
			sourceID:    "chat-source",
			targetID:    "chat-target",
			kind:        "chat_chat",
			contextMode: "reference_only",
		},
		{
			name:        "section chat summary",
			sourceID:    "source-section",
			targetID:    "chat-target",
			kind:        "section_chat",
			contextMode: "summary",
		},
		{
			name:        "chat section inline text",
			sourceID:    "chat-source",
			targetID:    "source-section",
			kind:        "chat_section",
			contextMode: "inline_text",
		},
	}

	for _, tc := range testCases {
		projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]projectstate.Project{
				"project-alpha": graphEdgeRouteTestProject(t),
			},
		})
		if err != nil {
			t.Fatalf("open overlay runtime for %s: %v", tc.name, err)
		}

		handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteCreateAgenticEdge,
			strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","sourceSectionId":"%s","targetSectionId":"%s","kind":"%s","contextMode":"%s"}`, tc.sourceID, tc.targetID, tc.kind, tc.contextMode)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			_ = projectRuntime.Close()
			t.Fatalf("expected 200 for %s agentic edge create, got %d with body %q", tc.name, response.Code, response.Body.String())
		}

		project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
		closeErr := projectRuntime.Close()
		if closeErr != nil {
			t.Fatalf("close overlay runtime for %s: %v", tc.name, closeErr)
		}
		if len(project.AgenticEdges) != 1 {
			t.Fatalf("expected one persisted %s agentic edge, got %#v", tc.name, project.AgenticEdges)
		}
		created := project.AgenticEdges[0]
		if created.Kind != tc.kind {
			t.Fatalf("expected %s kind %q, got %q", tc.name, tc.kind, created.Kind)
		}
		if created.ContextMode != tc.contextMode {
			t.Fatalf("expected %s context mode %q, got %q", tc.name, tc.contextMode, created.ContextMode)
		}
	}
}

func TestRegisterProjectRoutesAgenticEdgesRejectInvalidKindsAndMissingIDs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": graphEdgeRouteTestProject(t),
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
		name         string
		route        string
		body         string
		expectedCode int
		expectedBody string
	}{
		{
			name:         "invalid kind",
			route:        RouteCreateAgenticEdge,
			body:         `{"projectConfigId":"project-alpha","sourceSectionId":"chat-source","targetSectionId":"chat-target","kind":"chat_plain"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"agentic_edge_invalid"`,
		},
		{
			name:         "missing id",
			route:        RouteDeleteAgenticEdges,
			body:         `{"projectConfigId":"project-alpha","edgeIds":["missing-agentic-edge"]}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"agentic_edge_not_found"`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("expected %d for %s, got %d with body %q", requestSpec.expectedCode, requestSpec.name, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("expected %s body to contain %s, got %q", requestSpec.name, requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestSectionSizeValueRequestUnmarshalJSONSupportsAutoAndNumbers(t *testing.T) {
	t.Parallel()

	var autoValue sectionSizeValueRequest
	if err := json.Unmarshal([]byte(`"auto"`), &autoValue); err != nil {
		t.Fatalf("unmarshal auto value: %v", err)
	}
	if !autoValue.Auto {
		t.Fatalf("expected auto value to set Auto=true, got %#v", autoValue)
	}

	var numberValue sectionSizeValueRequest
	if err := json.Unmarshal([]byte(`240`), &numberValue); err != nil {
		t.Fatalf("unmarshal numeric value: %v", err)
	}
	if numberValue.Auto || numberValue.Value != 240 {
		t.Fatalf("expected numeric section size value 240, got %#v", numberValue)
	}

	var invalidValue sectionSizeValueRequest
	if err := json.Unmarshal([]byte(`"wide"`), &invalidValue); err == nil {
		t.Fatal("expected invalid section size string to fail")
	}

	var incompleteSize sectionSizeRequest
	if err := json.Unmarshal([]byte(`{"width":"auto"}`), &incompleteSize); err == nil {
		t.Fatal("expected incomplete section size object to fail")
	}
}

func TestRegisterProjectRoutesSetSectionSizesPersistsLatestState(t *testing.T) {
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

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetSectionSizes,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionSizes":{"code-section":{"width":600,"height":120}}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
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

	codeVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["code-section"]
	codeImplID := payload.ProjectState.SectionVariants[codeVariantID].Impl
	codeImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[codeImplID])
	codeSize, ok := codeImplPayload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected code-section size payload, got %#v", codeImplPayload)
	}
	if got := codeSize["width"]; got != float64(600) {
		t.Fatalf("expected code-section width 600, got %#v", got)
	}

	terminalVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["terminal-section"]
	terminalImplID := payload.ProjectState.SectionVariants[terminalVariantID].Impl
	terminalImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[terminalImplID])
	terminalSize, ok := terminalImplPayload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected terminal-section size payload, got %#v", terminalImplPayload)
	}
	if got := terminalSize["width"]; got != float64(600) {
		t.Fatalf("expected terminal-section width 600, got %#v", got)
	}
}

func TestRegisterProjectRoutesSetSectionSizesRejectsConflictingEmbeddedWidths(t *testing.T) {
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetSectionSizes,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionSizes":{"code-section":{"width":600,"height":240},"terminal-section":{"width":500,"height":160}}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_auto_layout"`) {
		t.Fatalf("expected invalid_auto_layout body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesChildDefaultsMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childDefaultsRouteTestProject(t),
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
		route string
		body  string
	}{
		{
			route: RouteSetParentDefaultChildSectionType,
			body:  `{"projectConfigId":"project-alpha","sectionId":"group-section","defaultChildSectionType":"Dict"}`,
		},
		{
			route: RouteSetParentDefaultChildSectionType,
			body:  `{"projectConfigId":"project-alpha","sectionId":"list-root-section","defaultChildSectionType":"TextBlock"}`,
		},
		{
			route: RouteSetListRootViewMode,
			body:  `{"projectConfigId":"project-alpha","sectionId":"list-root-section","viewMode":"task_list"}`,
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

	groupSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["group-section"].SharedModifier)
	if got := groupSharedModifier["defaultChildSectionType"]; got != "Dict" {
		t.Fatalf("expected group default child Dict, got %#v", got)
	}

	listRootSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["list-root-section"].SharedModifier)
	if got := listRootSharedModifier["defaultChildSectionType"]; got != "TextBlock" {
		t.Fatalf("expected list root default child TextBlock, got %#v", got)
	}
	if got := listRootSharedModifier["viewMode"]; got != "task_list" {
		t.Fatalf("expected list root view mode task_list, got %#v", got)
	}
}

func TestRegisterProjectRoutesSetListRootViewModeSupportsDocumentedModes(t *testing.T) {
	t.Parallel()

	for _, viewMode := range []string{"default", "task_list", "kanban"} {
		projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]projectstate.Project{
				"project-alpha": childDefaultsRouteTestProject(t),
			},
		})
		if err != nil {
			t.Fatalf("open overlay runtime for %s: %v", viewMode, err)
		}

		handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteSetListRootViewMode,
			strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","sectionId":"list-root-section","viewMode":"%s"}`, viewMode)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			_ = projectRuntime.Close()
			t.Fatalf("expected 200 for list root view mode %s, got %d with body %q", viewMode, response.Code, response.Body.String())
		}

		project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
		listRootSharedModifier := decodeProjectRouteRawObject(t, project.Sections["list-root-section"].SharedModifier)
		closeErr := projectRuntime.Close()
		if closeErr != nil {
			t.Fatalf("close overlay runtime for %s: %v", viewMode, closeErr)
		}
		if got := listRootSharedModifier["viewMode"]; got != viewMode {
			t.Fatalf("expected list root shared modifier viewMode %q, got %#v", viewMode, got)
		}
	}
}

func TestRegisterProjectRoutesChildDefaultsMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childDefaultsRouteTestProject(t),
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
			route:        RouteSetParentDefaultChildSectionType,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","defaultChildSectionType":"Dict"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"default_child_section_parent_required"`,
		},
		{
			route:        RouteSetParentDefaultChildSectionType,
			body:         `{"projectConfigId":"project-alpha","sectionId":"group-section","defaultChildSectionType":"GlobalVariables"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"default_child_section_type_invalid"`,
		},
		{
			route:        RouteSetListRootViewMode,
			body:         `{"projectConfigId":"project-alpha","sectionId":"group-section","viewMode":"kanban"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"list_root_section_required"`,
		},
		{
			route:        RouteSetListRootViewMode,
			body:         `{"projectConfigId":"project-alpha","sectionId":"list-root-section","viewMode":"grid"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"list_root_view_mode_invalid"`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestSpec.route,
			strings.NewReader(requestSpec.body),
		)
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

func TestRegisterProjectRoutesSectionFilterAndMetaControlMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionFilterMetaControlRouteTestProject(t),
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
		route string
		body  string
	}{
		{
			route: RouteSetSectionParamFilter,
			body:  `{"projectConfigId":"project-alpha","sectionId":"params-section","value":"   "}`,
		},
		{
			route: RouteSetMetaControlShowSectionTitle,
			body:  `{"projectConfigId":"project-alpha","sectionId":"meta-section","showSectionTitle":true}`,
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

	paramsSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["params-section"].SharedModifier)
	if got := paramsSharedModifier["paramFilter"]; got != "   " {
		t.Fatalf("expected raw paramFilter whitespace to persist, got %#v", got)
	}

	metaSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["meta-section"].SharedModifier)
	if got := metaSharedModifier["showSectionTitle"]; got != true {
		t.Fatalf("expected showSectionTitle=true, got %#v", got)
	}
}

func TestRegisterProjectRoutesSectionFilterAndMetaControlMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionFilterMetaControlRouteTestProject(t),
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
			route:        RouteSetSectionParamFilter,
			body:         `{"projectConfigId":"project-alpha","sectionId":"code-section","value":"alpha"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"section_param_filter_unsupported"`,
		},
		{
			route:        RouteSetMetaControlShowSectionTitle,
			body:         `{"projectConfigId":"project-alpha","sectionId":"params-section","showSectionTitle":true}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"meta_control_section_required"`,
		},
		{
			route:        RouteSetGroupOverflowMode,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","overflowMode":true}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"group_section_required"`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestSpec.route,
			strings.NewReader(requestSpec.body),
		)
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

func TestRegisterProjectRoutesSetViewportReturnsInternalErrorWithoutActiveViewMode(t *testing.T) {
	t.Parallel()

	project := layoutPresentationRouteTestProject(t)
	project.ActiveViewModeID = ""
	project.ViewModes = map[string]projectstate.ViewMode{}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetViewport,
		strings.NewReader(`{"projectConfigId":"project-alpha","viewport":{"x":0,"y":0,"zoom":1}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"internal_error"`) {
		t.Fatalf("expected internal_error body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesTogglePositionLocksReturnsNotFoundForUnknownSection(t *testing.T) {
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
		"/api"+RouteTogglePositionLocks,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["missing-section"]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"section_not_found"`) {
		t.Fatalf("expected section_not_found body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesLayoutPresentationUsesDeploymentOverlayWhenLayoutChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("top_level_layout_and_viewport", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": viewModesRouteTestProject(t),
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
						route: RouteSetTopLevelSectionLayout,
						body:  `{"projectConfigId":"project-alpha","topLevelSections":{"parent-section":{"x":0,"y":0,"zIndex":0},"standalone-section":{"x":460,"y":310,"zIndex":9},"moving-section":{"x":220,"y":120,"zIndex":2}}}`,
					},
					{
						route: RouteSetViewport,
						body:  `{"projectConfigId":"project-alpha","viewport":{"x":42,"y":24,"zoom":1.1}}`,
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
				if got := overlayProject.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
					t.Fatalf("expected overlay standalone-section layout {460 310 9}, got %#v", got)
				}
				if overlayProject.Viewport == nil || overlayProject.Viewport.X != 42 || overlayProject.Viewport.Y != 24 || overlayProject.Viewport.Zoom != 1.1 {
					t.Fatalf("expected overlay viewport {42 24 1.1}, got %#v", overlayProject.Viewport)
				}

				baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
				if got := baseProject.TopLevelSections["standalone-section"]; got.X != 100 || got.Y != 50 || got.ZIndex != 1 {
					t.Fatalf("expected base standalone-section layout unchanged, got %#v", got)
				}
				if baseProject.Viewport == nil || baseProject.Viewport.X != 5 || baseProject.Viewport.Y != 10 || baseProject.Viewport.Zoom != 0.8 {
					t.Fatalf("expected base viewport unchanged, got %#v", baseProject.Viewport)
				}
			})

			t.Run("auto_layout", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": viewModesRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": true,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay before auto layout: %v", err)
				}
				before := overlay.Snapshot().Document.Projects["project-alpha"]

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteAutoLayoutTopLevelSections,
					strings.NewReader(`{"projectConfigId":"project-alpha"}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", RouteAutoLayoutTopLevelSections, response.Code, response.Body.String())
				}

				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				if autoLayoutRouteMinX(overlayProject.TopLevelSections) != autoLayoutRouteMinX(before.TopLevelSections) {
					t.Fatalf("expected overlay auto layout to preserve min x %v, got %v", autoLayoutRouteMinX(before.TopLevelSections), autoLayoutRouteMinX(overlayProject.TopLevelSections))
				}
				if autoLayoutRouteMinY(overlayProject.TopLevelSections) != autoLayoutRouteMinY(before.TopLevelSections) {
					t.Fatalf("expected overlay auto layout to preserve min y %v, got %v", autoLayoutRouteMinY(before.TopLevelSections), autoLayoutRouteMinY(overlayProject.TopLevelSections))
				}
				if overlayProject.TopLevelSections["standalone-section"] == before.TopLevelSections["standalone-section"] {
					t.Fatal("expected overlay auto layout to rewrite at least one top-level section position")
				}

				baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
				if !reflect.DeepEqual(baseProject.TopLevelSections, before.TopLevelSections) {
					t.Fatalf("expected base top-level sections unchanged, got %#v", baseProject.TopLevelSections)
				}
			})

			t.Run("section_sizes", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": sectionSizeRouteTestProject(t),
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
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetSectionSizes,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionSizes":{"code-section":{"width":600,"height":120}}}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetSectionSizes, response.Code, response.Body.String())
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				overlayCodeVariantID := overlayProject.SectionVariantMap["code-section"]
				overlayCodeImplID := overlayProject.SectionVariants[overlayCodeVariantID].ImplID
				overlayCodePayload := decodeProjectRouteRawObject(t, overlayProject.SectionImpls[overlayCodeImplID].Payload)
				overlayCodeSize := decodeProjectRouteRawObject(t, mustMarshalProjectRouteObject(t, overlayCodePayload["size"].(map[string]any)))
				if got := overlayCodeSize["width"]; got != float64(600) {
					t.Fatalf("expected overlay code-section width 600, got %#v", got)
				}
				overlayTerminalVariantID := overlayProject.SectionVariantMap["terminal-section"]
				overlayTerminalImplID := overlayProject.SectionVariants[overlayTerminalVariantID].ImplID
				overlayTerminalPayload := decodeProjectRouteRawObject(t, overlayProject.SectionImpls[overlayTerminalImplID].Payload)
				overlayTerminalSize := decodeProjectRouteRawObject(t, mustMarshalProjectRouteObject(t, overlayTerminalPayload["size"].(map[string]any)))
				if got := overlayTerminalSize["width"]; got != float64(600) {
					t.Fatalf("expected overlay terminal-section width 600, got %#v", got)
				}

				baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
				baseCodeVariantID := baseProject.SectionVariantMap["code-section"]
				baseCodeImplID := baseProject.SectionVariants[baseCodeVariantID].ImplID
				baseCodePayload := decodeProjectRouteRawObject(t, baseProject.SectionImpls[baseCodeImplID].Payload)
				baseCodeSize := decodeProjectRouteRawObject(t, mustMarshalProjectRouteObject(t, baseCodePayload["size"].(map[string]any)))
				if got := baseCodeSize["width"]; got == float64(600) {
					t.Fatalf("expected base code-section width unchanged, got %#v", got)
				}
			})

			t.Run("minimize_and_locks", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": layoutPresentationRouteTestProject(t),
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
						route: RouteToggleMinimized,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section"}`,
					},
					{
						route: RouteTogglePositionLocks,
						body:  `{"projectConfigId":"project-alpha","sectionIds":["callable-section","plain-section"]}`,
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
				overlayCallableModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["callable-section"].SharedModifier)
				if got := overlayCallableModifier["isMinimized"]; got != true {
					t.Fatalf("expected overlay callable isMinimized=true, got %#v", got)
				}
				if got := overlayCallableModifier["positionAndSizeLocked"]; got != true {
					t.Fatalf("expected overlay callable positionAndSizeLocked=true, got %#v", got)
				}
				overlayPlainModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["plain-section"].SharedModifier)
				if got := overlayPlainModifier["positionAndSizeLocked"]; got != true {
					t.Fatalf("expected overlay plain positionAndSizeLocked=true, got %#v", got)
				}

				baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
				baseCallableModifier := decodeProjectRouteRawObject(t, baseProject.Sections["callable-section"].SharedModifier)
				if got := baseCallableModifier["isMinimized"]; got == true {
					t.Fatalf("expected base callable isMinimized unchanged, got %#v", got)
				}
				if got := baseCallableModifier["positionAndSizeLocked"]; got == true {
					t.Fatalf("expected base callable positionAndSizeLocked unchanged, got %#v", got)
				}
				basePlainModifier := decodeProjectRouteRawObject(t, baseProject.Sections["plain-section"].SharedModifier)
				if got := basePlainModifier["positionAndSizeLocked"]; got == true {
					t.Fatalf("expected base plain positionAndSizeLocked unchanged, got %#v", got)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesLayoutPresentationRejectsDeploymentPolicyWhenLayoutChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			assertForbidden := func(t *testing.T, response *httptest.ResponseRecorder, route string) {
				t.Helper()
				if response.Code != http.StatusForbidden {
					t.Fatalf("expected 403 for %s, got %d with body %q", route, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
					t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
					t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
				}
			}

			t.Run("top_level_layout_and_viewport", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": viewModesRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": false,
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
						route: RouteSetTopLevelSectionLayout,
						body:  `{"projectConfigId":"project-alpha","topLevelSections":{"parent-section":{"x":0,"y":0,"zIndex":0},"standalone-section":{"x":460,"y":310,"zIndex":9},"moving-section":{"x":220,"y":120,"zIndex":2}}}`,
					},
					{
						route: RouteSetViewport,
						body:  `{"projectConfigId":"project-alpha","viewport":{"x":42,"y":24,"zoom":1.1}}`,
					},
				} {
					request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					assertForbidden(t, response, requestSpec.route)
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				if got := overlayProject.TopLevelSections["standalone-section"]; got.X != 100 || got.Y != 50 || got.ZIndex != 1 {
					t.Fatalf("expected rejected overlay layout unchanged, got %#v", got)
				}
				if overlayProject.Viewport == nil || overlayProject.Viewport.X != 5 || overlayProject.Viewport.Y != 10 || overlayProject.Viewport.Zoom != 0.8 {
					t.Fatalf("expected rejected overlay viewport unchanged, got %#v", overlayProject.Viewport)
				}
			})

			t.Run("auto_layout", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": viewModesRouteTestProject(t),
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
					t.Fatalf("deployment overlay before rejected auto layout: %v", err)
				}
				before := overlay.Snapshot().Document.Projects["project-alpha"]

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteAutoLayoutTopLevelSections,
					strings.NewReader(`{"projectConfigId":"project-alpha"}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				assertForbidden(t, response, RouteAutoLayoutTopLevelSections)

				after := overlay.Snapshot().Document.Projects["project-alpha"]
				if !reflect.DeepEqual(after.TopLevelSections, before.TopLevelSections) {
					t.Fatalf("expected rejected auto layout overlay unchanged, got %#v", after.TopLevelSections)
				}
			})

			t.Run("section_sizes", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": sectionSizeRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetSectionSizes,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionSizes":{"code-section":{"width":600,"height":120}}}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				assertForbidden(t, response, RouteSetSectionSizes)

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				overlayCodeVariantID := overlayProject.SectionVariantMap["code-section"]
				overlayCodeImplID := overlayProject.SectionVariants[overlayCodeVariantID].ImplID
				overlayCodePayload := decodeProjectRouteRawObject(t, overlayProject.SectionImpls[overlayCodeImplID].Payload)
				overlayCodeSize := decodeProjectRouteRawObject(t, mustMarshalProjectRouteObject(t, overlayCodePayload["size"].(map[string]any)))
				if got := overlayCodeSize["width"]; got == float64(600) {
					t.Fatalf("expected rejected overlay code-section width unchanged, got %#v", got)
				}
			})

			t.Run("minimize_and_locks", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": layoutPresentationRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": false,
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
						route: RouteToggleMinimized,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section"}`,
					},
					{
						route: RouteTogglePositionLocks,
						body:  `{"projectConfigId":"project-alpha","sectionIds":["callable-section","plain-section"]}`,
					},
				} {
					request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					assertForbidden(t, response, requestSpec.route)
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				overlayCallableModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["callable-section"].SharedModifier)
				if len(overlayCallableModifier) != 0 {
					t.Fatalf("expected rejected overlay callable shared modifier unchanged, got %#v", overlayCallableModifier)
				}
				overlayPlainModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["plain-section"].SharedModifier)
				if len(overlayPlainModifier) != 0 {
					t.Fatalf("expected rejected overlay plain shared modifier unchanged, got %#v", overlayPlainModifier)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesViewModeAndTopLevelLayoutMutationsPersistLatestState(t *testing.T) {
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

	// Persist an initial layout on the focus mode, then create a new mode that clones it.
	response := post(
		RouteSetTopLevelSectionLayout,
		`{"projectConfigId":"project-alpha","topLevelSections":{"parent-section":{"x":0,"y":0,"zIndex":0},"standalone-section":{"x":180,"y":90,"zIndex":4},"moving-section":{"x":220,"y":120,"zIndex":2}}}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 from setTopLevelSectionLayout, got %d with body %q", response.Code, response.Body.String())
	}

	createResponse := post(RouteCreateViewMode, `{"projectConfigId":"project-alpha"}`)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from createViewMode, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	var createdViewModeID string
	if err := json.Unmarshal(createResponse.Body.Bytes(), &createdViewModeID); err != nil {
		t.Fatalf("decode created view mode id: %v", err)
	}
	if strings.TrimSpace(createdViewModeID) == "" {
		t.Fatal("expected createViewMode to return a view mode id")
	}

	requests := []struct {
		route string
		body  string
	}{
		{
			route: RouteSetTopLevelSectionLayout,
			body:  `{"projectConfigId":"project-alpha","topLevelSections":{"parent-section":{"x":0,"y":0,"zIndex":0},"standalone-section":{"x":460,"y":310,"zIndex":9},"moving-section":{"x":220,"y":120,"zIndex":2}}}`,
		},
		{
			route: RouteSetViewModeName,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","viewModeId":"%s","name":"  Details  "}`, createdViewModeID),
		},
		{
			route: RouteToggleViewModeUserFacing,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","viewModeId":"%s"}`, createdViewModeID),
		},
		{
			route: RouteToggleViewModeTab,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","viewModeId":"%s"}`, createdViewModeID),
		},
		{
			route: RouteToggleSectionVisibility,
			body:  `{"projectConfigId":"project-alpha","sectionIds":["moving-section"]}`,
		},
		{
			route: RouteSetViewModeSortOrder,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","orderedViewModeIds":["%s","focus"]}`, createdViewModeID),
		},
		{
			route: RouteToggleIsEditingViewMode,
			body:  `{"projectConfigId":"project-alpha"}`,
		},
		{
			route: RouteSetActiveViewMode,
			body:  `{"projectConfigId":"project-alpha","activeViewModeId":"focus"}`,
		},
		{
			route: RouteSetActiveViewMode,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","activeViewModeId":"%s"}`, createdViewModeID),
		},
		{
			route: RouteDeleteViewMode,
			body:  `{"projectConfigId":"project-alpha","viewModeId":"focus"}`,
		},
	}

	for _, requestSpec := range requests {
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

	// The created mode should own the final active layout after switching and deletion.
	if got := derefString(payload.ProjectState.ProjectConfig.ActiveViewModeID); got != createdViewModeID {
		t.Fatalf("expected active view mode %q, got %q", createdViewModeID, got)
	}
	if payload.ProjectState.ProjectConfig.IsEditingViewMode {
		t.Fatal("expected toggleIsEditingViewMode to leave editing mode disabled")
	}
	if len(payload.ProjectState.ProjectConfig.ViewModes) != 1 {
		t.Fatalf("expected one remaining view mode after delete, got %d", len(payload.ProjectState.ProjectConfig.ViewModes))
	}

	viewMode := payload.ProjectState.ProjectConfig.ViewModes[createdViewModeID]
	if viewMode.Name != "Details" {
		t.Fatalf("expected view mode name Details, got %q", viewMode.Name)
	}
	if !viewMode.IsUserFacing {
		t.Fatal("expected created view mode to be user-facing")
	}
	if !viewMode.IsTab {
		t.Fatal("expected created view mode to be a tab")
	}
	if viewMode.SortIndex != 0 {
		t.Fatalf("expected created view mode sort index 0, got %d", viewMode.SortIndex)
	}
	if visible := viewMode.VisibilityBySectionID["moving-section"]; visible {
		t.Fatal("expected moving-section visibility to be toggled off in created view mode")
	}
	if got := viewMode.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
		t.Fatalf("unexpected created view mode layout %#v", got)
	}
	if got := payload.ProjectState.ProjectConfig.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
		t.Fatalf("unexpected active project layout %#v", got)
	}
}

func TestRegisterProjectRoutesAutoLayoutTopLevelSectionsPersistsLatestState(t *testing.T) {
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

	before := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAutoLayoutTopLevelSections,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if autoLayoutRouteMinX(project.TopLevelSections) != autoLayoutRouteMinX(before.TopLevelSections) {
		t.Fatalf("expected auto layout to preserve min x %v, got %v", autoLayoutRouteMinX(before.TopLevelSections), autoLayoutRouteMinX(project.TopLevelSections))
	}
	if autoLayoutRouteMinY(project.TopLevelSections) != autoLayoutRouteMinY(before.TopLevelSections) {
		t.Fatalf("expected auto layout to preserve min y %v, got %v", autoLayoutRouteMinY(before.TopLevelSections), autoLayoutRouteMinY(project.TopLevelSections))
	}
	if project.TopLevelSections["standalone-section"] == before.TopLevelSections["standalone-section"] {
		t.Fatal("expected auto layout to rewrite at least one top-level section position")
	}
	if !reflect.DeepEqual(project.TopLevelSections, project.ViewModes["focus"].TopLevelSections) {
		t.Fatal("expected auto layout to keep the active view mode layouts aligned with project layouts")
	}
}

func TestRegisterProjectRoutesAutoLayoutTopLevelSectionsReturns422ForInvalidMargin(t *testing.T) {
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAutoLayoutTopLevelSections,
		strings.NewReader(`{"projectConfigId":"project-alpha","margin":-1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_auto_layout"`) {
		t.Fatalf("expected invalid_auto_layout body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesAutoLayoutTopLevelSectionsReturns404ForMissingProject(t *testing.T) {
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAutoLayoutTopLevelSections,
		strings.NewReader(`{"projectConfigId":"missing-project"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"project_config_not_found"`) {
		t.Fatalf("expected project_config_not_found body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetActiveViewModeReturnsNotFoundForUnknownViewMode(t *testing.T) {
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetActiveViewMode,
		strings.NewReader(`{"projectConfigId":"project-alpha","activeViewModeId":"missing-view-mode"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"view_mode_not_found"`) {
		t.Fatalf("expected view_mode_not_found body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetActiveViewModeSwapsLayoutAndViewportInIDE(t *testing.T) {
	t.Parallel()

	document, alternateViewModeID := viewModesDeploymentRouteTestDocument(t)
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

	response := post(
		RouteSetActiveViewMode,
		fmt.Sprintf(`{"projectConfigId":"project-alpha","activeViewModeId":"%s"}`, alternateViewModeID),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if project.ActiveViewModeID != alternateViewModeID {
		t.Fatalf("expected active view mode %q, got %q", alternateViewModeID, project.ActiveViewModeID)
	}
	if got := project.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
		t.Fatalf("expected runtime to switch to alternate layout, got %#v", got)
	}
	if project.Viewport == nil || project.Viewport.X != 42 || project.Viewport.Y != 24 || project.Viewport.Zoom != 1.1 {
		t.Fatalf("expected runtime to switch to alternate viewport, got %#v", project.Viewport)
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	if got := derefString(payload.ProjectState.ProjectConfig.ActiveViewModeID); got != alternateViewModeID {
		t.Fatalf("expected latest-state active view mode %q, got %q", alternateViewModeID, got)
	}
	if got := payload.ProjectState.ProjectConfig.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
		t.Fatalf("expected latest-state active layout to match alternate view mode, got %#v", got)
	}
	if payload.ProjectState.ProjectConfig.Viewport == nil ||
		payload.ProjectState.ProjectConfig.Viewport.X != 42 ||
		payload.ProjectState.ProjectConfig.Viewport.Y != 24 ||
		payload.ProjectState.ProjectConfig.Viewport.Zoom != 1.1 {
		t.Fatalf("expected latest-state active viewport to match alternate view mode, got %#v", payload.ProjectState.ProjectConfig.Viewport)
	}

	viewMode := payload.ProjectState.ProjectConfig.ViewModes[alternateViewModeID]
	if !viewMode.ViewportInitialized {
		t.Fatal("expected alternate view mode viewport to remain initialized")
	}
	if viewMode.Viewport == nil || viewMode.Viewport.X != 42 || viewMode.Viewport.Y != 24 || viewMode.Viewport.Zoom != 1.1 {
		t.Fatalf("expected alternate view mode viewport to stay intact, got %#v", viewMode.Viewport)
	}
}

func TestRegisterProjectRoutesSetActiveViewModeUsesDeploymentOverlayWhenVariantChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			document, alternateViewModeID := viewModesDeploymentRouteTestDocument(t)
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:     mode,
				Document: document,
				Policy: map[string]any{
					"allowVariantChanges": true,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSetActiveViewMode,
				strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","activeViewModeId":"%s"}`, alternateViewModeID)),
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
			if overlayProject.ActiveViewModeID != alternateViewModeID {
				t.Fatalf("expected overlay active view mode %q, got %q", alternateViewModeID, overlayProject.ActiveViewModeID)
			}
			if got := overlayProject.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
				t.Fatalf("expected overlay to switch to alternate layout, got %#v", got)
			}
			if overlayProject.Viewport == nil || overlayProject.Viewport.X != 42 || overlayProject.Viewport.Y != 24 || overlayProject.Viewport.Zoom != 1.1 {
				t.Fatalf("expected overlay to switch to alternate viewport, got %#v", overlayProject.Viewport)
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			if baseProject.ActiveViewModeID != "focus" {
				t.Fatalf("expected base deployment project to stay on focus, got %q", baseProject.ActiveViewModeID)
			}
			if got := baseProject.TopLevelSections["standalone-section"]; got.X != 100 || got.Y != 50 || got.ZIndex != 1 {
				t.Fatalf("expected base deployment layout to stay unchanged, got %#v", got)
			}
		})
	}
}

func TestRegisterProjectRoutesSetActiveViewModeRejectsDeploymentPolicyWhenVariantChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			document, alternateViewModeID := viewModesDeploymentRouteTestDocument(t)
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:     mode,
				Document: document,
				Policy: map[string]any{
					"allowVariantChanges": false,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSetActiveViewMode,
				strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","activeViewModeId":"%s"}`, alternateViewModeID)),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"variant_changes_forbidden"`) {
				t.Fatalf("expected variant_changes_forbidden body, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment policy disallows variant changes.") {
				t.Fatalf("expected deployment variant policy denial, got %q", response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if overlayProject.ActiveViewModeID != "focus" {
				t.Fatalf("expected rejected mutation to keep focus active, got %q", overlayProject.ActiveViewModeID)
			}
		})
	}
}

func TestRegisterProjectRoutesToggleSectionVisibilityReturnsNotFoundForUnknownSection(t *testing.T) {
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteToggleSectionVisibility,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["missing-section"]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"section_not_found"`) {
		t.Fatalf("expected section_not_found body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetViewModeNameReturns422ForInvalidName(t *testing.T) {
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetViewModeName,
		strings.NewReader(`{"projectConfigId":"project-alpha","viewModeId":"focus","name":"settings"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"detail":"View mode name 'settings' is reserved."`) {
		t.Fatalf("expected invalid view mode detail body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetViewModeSortOrderReturns422ForDuplicateIDs(t *testing.T) {
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

	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed second view mode: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetViewModeSortOrder,
		strings.NewReader(`{"projectConfigId":"project-alpha","orderedViewModeIds":["focus","focus"]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_view_mode_sort_order"`) {
		t.Fatalf("expected invalid_view_mode_sort_order body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetViewModeSortOrderReturns404ForUnknownViewMode(t *testing.T) {
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

	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed second view mode: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetViewModeSortOrder,
		strings.NewReader(`{"projectConfigId":"project-alpha","orderedViewModeIds":["focus","missing-view-mode"]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"view_mode_not_found"`) {
		t.Fatalf("expected view_mode_not_found body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesBlocksDeploymentMode(t *testing.T) {
	t.Parallel()

	handler := newProjectRouteTestHandler(t, config.ModeShare, nil, "", nil, nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden error, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetsCallableAndPersistsUpdatedProjectState(t *testing.T) {
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

	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		projectstate.CallableSignatureResolver(&stubProjectRouteCallableSignatureResolver{
			result: projectstate.CallableSignatureResult{
				Documentation: "Sort values.",
				Status:        projectstate.SignatureHelpStatusMatched,
				Params: []projectstate.CallableParamProposal{
					{
						Name:         "iterable",
						Description:  "Values to sort.",
						PassingStyle: "POSITIONAL_ONLY",
					},
					{
						Name:         "reverse",
						DefaultValue: "False",
						Description:  "Descending order flag.",
						PassingStyle: "KEYWORD_ONLY",
					},
				},
			},
			ok: true,
		}),
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetCallable,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"callable-section","callableName":"sorted","refetchParams":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.SetCallableResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode set callable payload: %v", err)
	}
	if payload.CallableID == nil || *payload.CallableID != "callable-2" {
		t.Fatalf("expected callable-2 response, got %#v", payload.CallableID)
	}
	if payload.LSPStatus != projectstate.SignatureHelpStatusMatched {
		t.Fatalf("expected matched status, got %q", payload.LSPStatus)
	}
	if len(payload.ChildCodeObjs) != 2 {
		t.Fatalf("expected two child params, got %#v", payload.ChildCodeObjs)
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
	callableVariantID := latestPayload.ProjectState.ProjectConfig.SectionVariantMap["callable-section"]
	callableImplID := latestPayload.ProjectState.SectionVariants[callableVariantID].Impl
	callableImplPayload := string(latestPayload.ProjectState.SectionImpls[callableImplID])
	if !strings.Contains(callableImplPayload, `"callable":"callable-2"`) {
		t.Fatalf("expected callable-2 in persisted payload, got %q", callableImplPayload)
	}
}

func newProjectRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	workspaceRoot string,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
	callableResolver projectstate.CallableSignatureResolver,
	codeUpdates ...ProjectCodeUpdateService,
) http.Handler {
	return newProjectRouteTestHandlerWithRenameService(
		t,
		mode,
		projectRuntime,
		workspaceRoot,
		validator,
		pythonReconciler,
		callableResolver,
		nil,
		nil,
		codeUpdates...,
	)
}

func newProjectRouteTestHandlerWithRenameService(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	workspaceRoot string,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
	callableResolver projectstate.CallableSignatureResolver,
	chatSectionChatIDs ChatSectionChatIDService,
	renameRefactors ProjectRenameRefactorService,
	codeUpdates ...ProjectCodeUpdateService,
) http.Handler {
	t.Helper()
	if validator == nil {
		validator = projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		})
	}
	if pythonReconciler == nil {
		pythonReconciler = projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		})
	}
	var codeUpdateService ProjectCodeUpdateService
	if len(codeUpdates) > 0 {
		codeUpdateService = codeUpdates[0]
	}
	if codeUpdateService == nil {
		codeUpdateService = projectRouteCodeUpdateService{}
	}
	if renameRefactors == nil {
		renameRefactors = projectRouteRenameRefactorServiceFunc(func(context.Context, string, string, string) error {
			return nil
		})
	}
	if chatSectionChatIDs == nil {
		if projectRuntime == nil {
			chatSectionChatIDs = projectRouteChatSectionChatIDServiceFunc(func(context.Context, string, string) (*string, error) {
				return nil, nil
			})
		} else {
			runStore, err := agentruns.NewRunStore(t.TempDir())
			if err != nil {
				t.Fatalf("new chat section run store: %v", err)
			}
			chatSectionService, err := chatsections.NewService(chatsections.ServiceOptions{
				ProjectState: projectRuntime,
				Runs:         runStore,
			})
			if err != nil {
				t.Fatalf("new chat section service: %v", err)
			}
			chatSectionChatIDs = chatSectionService
		}
	}
	settingsDocument, err := settingsstate.NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := settingsstate.OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings overlay runtime: %v", err)
		}
	})

	promptTemplatesRoot := workspaceRoot
	if strings.TrimSpace(promptTemplatesRoot) == "" {
		promptTemplatesRoot = t.TempDir()
	}
	promptTemplateStore, err := prompttemplates.NewStore(promptTemplatesRoot)
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}

	var shareSessions modes.ShareSessionStore
	var deploymentRuntime *deployments.Runtime
	if mode == config.ModeShare || mode == config.ModeApp {
		deploymentRuntime = newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
			Mode: mode,
		})
		shareSessions = newTestHTTPShareSessionStore("share-a")
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterProjectRoutes(r, ProjectRouteDependencies{
				ModePolicy:                     modes.NewPolicy(mode),
				WorkspaceRoot:                  workspaceRoot,
				ProjectState:                   projectRuntime,
				PromptTemplates:                promptTemplateStore,
				ShareSessions:                  shareSessions,
				Deployment:                     deploymentRuntime,
				SettingsState:                  settingsRuntime,
				ChatSectionChatIDs:             chatSectionChatIDs,
				EdgeExpressionBuilder:          projectstate.EdgeExpressionBuilderFunc(codegen.BuildPythonEdgeExpression),
				CodegenTargetValidator:         validator,
				PythonCodegenSectionReconciler: pythonReconciler,
				CallableSignatures:             callableResolver,
				CodeUpdates:                    codeUpdateService,
				RenameRefactors:                renameRefactors,
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

func copyPasteRouteSourceProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := (projectstate.Project{
		ID:   "project-source",
		Name: "Source",
		SectionVariantMap: map[string]string{
			"group-root":    "group-root-variant",
			"group-child-a": "group-child-a-variant-alt",
			"group-child-b": "group-child-b-variant-default",
		},
		TopLevelSectionIDs: []string{"group-root"},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"group-root": {X: 40, Y: 60, ZIndex: 1},
		},
		Sections: map[string]projectstate.Section{
			"group-root": {
				ID:               "group-root",
				Name:             "Group Root",
				VariantIDs:       []string{"group-root-variant"},
				DefaultVariantID: "group-root-variant",
			},
			"group-child-a": {
				ID:               "group-child-a",
				Name:             "Group Child A",
				ParentSectionID:  "group-root",
				VariantIDs:       []string{"group-child-a-variant-default", "group-child-a-variant-alt"},
				DefaultVariantID: "group-child-a-variant-default",
			},
			"group-child-b": {
				ID:               "group-child-b",
				Name:             "Group Child B",
				ParentSectionID:  "group-root",
				VariantIDs:       []string{"group-child-b-variant-default", "group-child-b-variant-alt"},
				DefaultVariantID: "group-child-b-variant-default",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"group-root-variant":            {ID: "group-root-variant", ImplID: "group-root-impl"},
			"group-child-a-variant-default": {ID: "group-child-a-variant-default", ImplID: "group-child-a-impl-default"},
			"group-child-a-variant-alt":     {ID: "group-child-a-variant-alt", ImplID: "group-child-a-impl-alt"},
			"group-child-b-variant-default": {ID: "group-child-b-variant-default", ImplID: "group-child-b-impl-default"},
			"group-child-b-variant-alt":     {ID: "group-child-b-variant-alt", ImplID: "group-child-b-impl-alt"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"group-root-impl": {
				ID:   "group-root-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: projectstate.RawJSON(
					`{"id":"group-root-impl","type":"Group","children":["group-child-a","group-child-b"]}`,
				),
			},
			"group-child-a-impl-default": {
				ID:      "group-child-a-impl-default",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: projectstate.RawJSON(`{"id":"group-child-a-impl-default","type":"TextBlock","text":"Child A Default"}`),
			},
			"group-child-a-impl-alt": {
				ID:      "group-child-a-impl-alt",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: projectstate.RawJSON(`{"id":"group-child-a-impl-alt","type":"TextBlock","text":"Child A Alt"}`),
			},
			"group-child-b-impl-default": {
				ID:      "group-child-b-impl-default",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: projectstate.RawJSON(`{"id":"group-child-b-impl-default","type":"TextBlock","text":"Child B Default"}`),
			},
			"group-child-b-impl-alt": {
				ID:      "group-child-b-impl-alt",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: projectstate.RawJSON(`{"id":"group-child-b-impl-alt","type":"TextBlock","text":"Child B Alt"}`),
			},
		},
	}).Normalized()
	if err != nil {
		t.Fatalf("normalize copy/paste route source project: %v", err)
	}
	return project
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func decodeProjectRouteRawObject(t *testing.T, payload json.RawMessage) map[string]any {
	t.Helper()
	if len(payload) == 0 {
		return map[string]any{}
	}
	var object map[string]any
	if err := json.Unmarshal(payload, &object); err != nil {
		t.Fatalf("decode raw object %q: %v", string(payload), err)
	}
	return object
}

func payloadStringField(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	value, _ := payload[key].(string)
	return value
}

func mustMarshalProjectRouteObject(t *testing.T, value map[string]any) json.RawMessage {
	t.Helper()

	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal route test payload: %v", err)
	}
	return payload
}

func decodeProjectRouteStringArray(value any) []string {
	entries, ok := value.([]any)
	if !ok {
		return nil
	}
	output := make([]string, 0, len(entries))
	for _, entry := range entries {
		stringValue, ok := entry.(string)
		if ok {
			output = append(output, stringValue)
		}
	}
	return output
}

func autoLayoutRouteMinX(layouts map[string]projectstate.TopLevelSectionLayout) float64 {
	first := true
	minX := 0.0
	for _, layout := range layouts {
		if first || layout.X < minX {
			minX = layout.X
		}
		first = false
	}
	return minX
}

func autoLayoutRouteMinY(layouts map[string]projectstate.TopLevelSectionLayout) float64 {
	first := true
	minY := 0.0
	for _, layout := range layouts {
		if first || layout.Y < minY {
			minY = layout.Y
		}
		first = false
	}
	return minY
}

type stubProjectRouteCallableSignatureResolver struct {
	result projectstate.CallableSignatureResult
	ok     bool
	err    error
}

type projectRouteSetCodeCall struct {
	ProjectID string
	SectionID string
	Code      string
}

type projectRouteFormatCodeCall struct {
	ProjectID string
	SectionID string
}

type projectRouteCodeUpdateService struct {
	setCode    func(ctx context.Context, projectID string, sectionID string, code string) error
	formatCode func(ctx context.Context, projectID string, sectionID string) error
}

func (s projectRouteCodeUpdateService) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	if s.setCode == nil {
		return nil
	}
	return s.setCode(ctx, projectID, sectionID, code)
}

func (s projectRouteCodeUpdateService) FormatCode(ctx context.Context, projectID string, sectionID string) error {
	if s.formatCode == nil {
		return nil
	}
	return s.formatCode(ctx, projectID, sectionID)
}

type projectRouteRenameRefactorServiceFunc func(ctx context.Context, projectID string, sectionID string, name string) error

func (f projectRouteRenameRefactorServiceFunc) SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error {
	return f(ctx, projectID, sectionID, name)
}

func (f projectRouteRenameRefactorServiceFunc) AcceptRenameRefactor(context.Context, string, string) error {
	return nil
}

func (f projectRouteRenameRefactorServiceFunc) DeclineRenameRefactor(context.Context, string, string) error {
	return nil
}

type projectRouteChatSectionChatIDServiceFunc func(ctx context.Context, projectID string, sectionID string) (*string, error)

func (f projectRouteChatSectionChatIDServiceFunc) GetChatID(ctx context.Context, projectID string, sectionID string) (*string, error) {
	return f(ctx, projectID, sectionID)
}

type stubProjectRouteRenameRefactorService struct {
	setSectionNameErr error
	acceptErr         error
	declineErr        error
}

func (s *stubProjectRouteRenameRefactorService) SetSectionName(context.Context, string, string, string) error {
	return s.setSectionNameErr
}

func (s *stubProjectRouteRenameRefactorService) AcceptRenameRefactor(context.Context, string, string) error {
	return s.acceptErr
}

func (s *stubProjectRouteRenameRefactorService) DeclineRenameRefactor(context.Context, string, string) error {
	return s.declineErr
}

func (s *stubProjectRouteCallableSignatureResolver) ResolveCallableSignature(
	_ context.Context,
	_ projectstate.Project,
	_ string,
	_ string,
) (projectstate.CallableSignatureResult, bool, error) {
	return s.result, s.ok, s.err
}

func callableRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "CallSection",
				VariantIDs:       []string{"callable-variant-1"},
				DefaultVariantID: "callable-variant-1",
				UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl-1": {
				ID:   "callable-impl-1",
				Kind: projectstate.SectionKind("callable"),
				Payload: projectstate.RawJSON(`{
					"id":"callable-impl-1",
					"type":"Callable",
					"callable":"callable-1",
					"codeObjVariantMap":{
						"callable-1":"callable-variant-a",
						"callable-2":"callable-variant-b",
						"param-existing":"param-variant-existing"
					}
				}`),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-1": {
				ID:               "callable-1",
				Name:             "existing_callable",
				VariantIDs:       []string{"callable-variant-a"},
				DefaultVariantID: "callable-variant-a",
			},
			"callable-2": {
				ID:               "callable-2",
				Name:             "sorted",
				VariantIDs:       []string{"callable-variant-b"},
				DefaultVariantID: "callable-variant-b",
			},
			"param-existing": {
				ID:               "param-existing",
				Name:             "iterable",
				VariantIDs:       []string{"param-variant-existing"},
				DefaultVariantID: "param-variant-existing",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-variant-a": {
				ID:     "callable-variant-a",
				ImplID: "callable-impl-a",
			},
			"callable-variant-b": {
				ID:     "callable-variant-b",
				ImplID: "callable-impl-b",
			},
			"param-variant-existing": {
				ID:     "param-variant-existing",
				ImplID: "param-impl-existing",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-impl-a": {
				ID:      "callable-impl-a",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-impl-a","type":"CodeCallable","children":[]}`),
			},
			"callable-impl-b": {
				ID:      "callable-impl-b",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-impl-b","type":"CodeCallable","children":["param-existing"]}`),
			},
			"param-impl-existing": {
				ID:      "param-impl-existing",
				Type:    "CodeParam",
				Payload: projectstate.RawJSON(`{"id":"param-impl-existing","type":"CodeParam","value":"user_value","passingStyle":"DEFAULT"}`),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize callable route project: %v", err)
	}
	return project
}

func layoutPresentationRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID: "focus",
			},
		},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant",
			"group-section":    "group-variant",
			"plain-section":    "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable Section",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
			},
			"group-section": {
				ID:               "group-section",
				Name:             "Group Section",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant": {
				ID:     "callable-variant",
				ImplID: "callable-impl",
			},
			"group-variant": {
				ID:     "group-variant",
				ImplID: "group-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl": {
				ID:      "callable-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "callable-impl", "type": "Callable"}),
			},
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
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize layout presentation route project: %v", err)
	}
	return project
}

func sectionSizeRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		EntryCodeBlockID: "code-section",
		ActiveViewModeID: "focus",
		TopLevelSectionIDs: []string{
			"code-section",
			"chart-section",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"code-section":  {X: 20, Y: 40, ZIndex: 0},
			"chart-section": {X: 900, Y: 120, ZIndex: 1},
		},
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:   "focus",
				Name: "Focus",
				VisibilityBySectionID: map[string]bool{
					"code-section":  true,
					"chart-section": true,
				},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"code-section":  {X: 20, Y: 40, ZIndex: 0},
					"chart-section": {X: 900, Y: 120, ZIndex: 1},
				},
			},
		},
		SectionVariantMap: map[string]string{
			"code-section":     "code-variant",
			"terminal-section": "terminal-variant",
			"chart-section":    "chart-variant",
		},
		Sections: map[string]projectstate.Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"terminal-section": {
				ID:               "terminal-section",
				Name:             "Terminal",
				ParentSectionID:  "code-section",
				VariantIDs:       []string{"terminal-variant"},
				DefaultVariantID: "terminal-variant",
			},
			"chart-section": {
				ID:               "chart-section",
				Name:             "Chart",
				VariantIDs:       []string{"chart-variant"},
				DefaultVariantID: "chart-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"code-variant":     {ID: "code-variant", ImplID: "code-impl"},
			"terminal-variant": {ID: "terminal-variant", ImplID: "terminal-impl"},
			"chart-variant":    {ID: "chart-variant", ImplID: "chart-impl"},
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
					"attachedTerminalSectionId": "terminal-section",
					"children":                  []string{"terminal-section"},
					"size": map[string]any{
						"width":  420.0,
						"height": 180.0,
					},
				}),
			},
			"terminal-impl": {
				ID:       "terminal-impl",
				Kind:     projectstate.SectionKindTerminal,
				Terminal: &projectstate.TerminalSectionImpl{},
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":   "terminal-impl",
					"type": "Terminal",
					"size": map[string]any{
						"width":  420.0,
						"height": 160.0,
					},
				}),
			},
			"chart-impl": {
				ID:      "chart-impl",
				Kind:    projectstate.SectionKind("chart"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chart-impl", "type": "Chart", "size": map[string]any{"width": 180.0, "height": 180.0}}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section size route project: %v", err)
	}
	return project
}

func childDefaultsRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"group-section":     "group-variant",
			"list-root-section": "list-root-variant",
			"plain-section":     "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"group-section": {
				ID:               "group-section",
				Name:             "Group",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"list-root-section": {
				ID:               "list-root-section",
				Name:             "ListRoot",
				VariantIDs:       []string{"list-root-variant"},
				DefaultVariantID: "list-root-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"group-variant":     {ID: "group-variant", ImplID: "group-impl"},
			"list-root-variant": {ID: "list-root-variant", ImplID: "list-root-impl"},
			"plain-variant":     {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"group-impl": {
				ID:   "group-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                      "group-impl",
					"type":                    "Group",
					"defaultChildSectionType": "Callable",
					"isHorizontalOrientation": false,
					"overflowMode":            false,
				}),
			},
			"list-root-impl": {
				ID:   "list-root-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                      "list-root-impl",
					"type":                    "ListRoot",
					"children":                []string{},
					"defaultChildSectionType": "Callable",
					"viewMode":                "default",
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
		t.Fatalf("normalize child defaults route project: %v", err)
	}
	return project
}

func childSectionRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:                 "project-alpha",
		Name:               "Alpha",
		TopLevelSectionIDs: []string{"code-section", "group-parent"},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"code-section": {X: 20, Y: 20, ZIndex: 0},
			"group-parent": {X: 480, Y: 40, ZIndex: 1},
		},
		SectionVariantMap: map[string]string{
			"code-section": "code-variant",
			"group-parent": "group-variant",
			"child-a":      "child-a-variant",
			"child-b":      "child-b-variant",
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
				Name:             "Group",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"child-a": {
				ID:               "child-a",
				Name:             "Child A",
				ParentSectionID:  "group-parent",
				VariantIDs:       []string{"child-a-variant"},
				DefaultVariantID: "child-a-variant",
			},
			"child-b": {
				ID:               "child-b",
				Name:             "Child B",
				ParentSectionID:  "group-parent",
				VariantIDs:       []string{"child-b-variant"},
				DefaultVariantID: "child-b-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"code-variant":    {ID: "code-variant", ImplID: "code-impl"},
			"group-variant":   {ID: "group-variant", ImplID: "group-impl"},
			"child-a-variant": {ID: "child-a-variant", ImplID: "child-a-impl"},
			"child-b-variant": {ID: "child-b-variant", ImplID: "child-b-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
					Children: []string{},
				},
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":           "code-impl",
					"type":         "Code",
					"codeLanguage": "python",
					"children":     []string{},
					"size": map[string]any{
						"width":  420.0,
						"height": 180.0,
					},
				}),
			},
			"group-impl": {
				ID:   "group-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                      "group-impl",
					"type":                    "Group",
					"children":                []string{"child-a", "child-b"},
					"defaultChildSectionType": "Callable",
					"isHorizontalOrientation": false,
					"overflowMode":            false,
					"size": map[string]any{
						"width":  500.0,
						"height": 180.0,
					},
				}),
			},
			"child-a-impl": {
				ID:      "child-a-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "child-a-impl", "type": "TextBlock"}),
			},
			"child-b-impl": {
				ID:      "child-b-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "child-b-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize child-section route project: %v", err)
	}
	return project
}

func sectionFilterMetaControlRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"params-section": "params-variant",
			"meta-section":   "meta-variant",
			"code-section":   "code-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"params-section": {
				ID:               "params-section",
				Name:             "Params",
				VariantIDs:       []string{"params-variant"},
				DefaultVariantID: "params-variant",
			},
			"meta-section": {
				ID:               "meta-section",
				Name:             "Meta",
				VariantIDs:       []string{"meta-variant"},
				DefaultVariantID: "meta-variant",
			},
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"params-variant": {ID: "params-variant", ImplID: "params-impl"},
			"meta-variant":   {ID: "meta-variant", ImplID: "meta-impl"},
			"code-variant":   {ID: "code-variant", ImplID: "code-impl"},
			"plain-variant":  {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"params-impl": {
				ID:      "params-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "params-impl", "type": "Dict", "paramFilter": "", "codeObjVariantMap": map[string]any{}}),
			},
			"meta-impl": {
				ID:      "meta-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
			},
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
				},
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "code-impl", "type": "Code", "codeLanguage": "python", "code": "print('alpha')\n", "children": []any{}}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section filter/meta control route project: %v", err)
	}
	return project
}

func sectionEdgeRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"dict-section",
			"source-section",
			"sink-section",
			"plain-section",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"dict-section":   {X: 10, Y: 10},
			"source-section": {X: 20, Y: 20},
			"sink-section":   {X: 30, Y: 30},
			"plain-section":  {X: 40, Y: 40},
		},
		SectionVariantMap: map[string]string{
			"dict-section":   "dict-variant",
			"source-section": "source-variant",
			"sink-section":   "sink-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"dict-section": {
				ID:               "dict-section",
				Name:             "Dict",
				VariantIDs:       []string{"dict-variant"},
				DefaultVariantID: "dict-variant",
			},
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant"},
				DefaultVariantID: "source-variant",
			},
			"sink-section": {
				ID:               "sink-section",
				Name:             "Sink",
				VariantIDs:       []string{"sink-variant"},
				DefaultVariantID: "sink-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"dict-variant":   {ID: "dict-variant", ImplID: "dict-impl"},
			"source-variant": {ID: "source-variant", ImplID: "source-impl"},
			"sink-variant":   {ID: "sink-variant", ImplID: "sink-impl"},
			"plain-variant":  {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"dict-impl": {
				ID:   "dict-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "dict-impl",
					"type":            "Dict",
					"topLevelParamId": "dict-root",
					"codeObjVariantMap": map[string]string{
						"dict-root":    "dict-root-variant",
						"target-param": "target-param-variant",
						"added-param":  "added-param-variant",
					},
					"edgeInputParams": []string{"target-param"},
					"edgeOutputPorts": []map[string]any{{"id": "result", "accessor": ".old"}},
				}),
			},
			"source-impl": {
				ID:      "source-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "source-impl", "type": "TextBlock"}),
			},
			"sink-impl": {
				ID:   "sink-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "sink-impl",
					"type":            "Dict",
					"topLevelParamId": "sink-root",
					"codeObjVariantMap": map[string]string{
						"sink-root":  "sink-root-variant",
						"sink-param": "sink-param-variant",
					},
					"edgeInputParams": []string{"sink-param"},
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"dict-root": {
				ID:               "dict-root",
				Name:             "root",
				VariantIDs:       []string{"dict-root-variant"},
				DefaultVariantID: "dict-root-variant",
			},
			"target-param": {
				ID:               "target-param",
				Name:             "target",
				VariantIDs:       []string{"target-param-variant"},
				DefaultVariantID: "target-param-variant",
			},
			"added-param": {
				ID:               "added-param",
				Name:             "added",
				VariantIDs:       []string{"added-param-variant"},
				DefaultVariantID: "added-param-variant",
			},
			"sink-root": {
				ID:               "sink-root",
				Name:             "sink_root",
				VariantIDs:       []string{"sink-root-variant"},
				DefaultVariantID: "sink-root-variant",
			},
			"sink-param": {
				ID:               "sink-param",
				Name:             "sink_param",
				VariantIDs:       []string{"sink-param-variant"},
				DefaultVariantID: "sink-param-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"dict-root-variant":    {ID: "dict-root-variant", ImplID: "dict-root-impl"},
			"target-param-variant": {ID: "target-param-variant", ImplID: "target-param-impl"},
			"added-param-variant":  {ID: "added-param-variant", ImplID: "added-param-impl"},
			"sink-root-variant":    {ID: "sink-root-variant", ImplID: "sink-root-impl"},
			"sink-param-variant":   {ID: "sink-param-variant", ImplID: "sink-param-impl"},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"dict-root-impl": {
				ID:      "dict-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "dict-root-impl", "type": "NestedParam", "children": []string{"target-param", "added-param"}}),
			},
			"target-param-impl": {
				ID:      "target-param-impl",
				Type:    "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "target-param-impl", "type": "CodeParam", "coreNameEditable": true, "passingStyle": "DEFAULT", "value": "connected"}),
			},
			"added-param-impl": {
				ID:      "added-param-impl",
				Type:    "TextParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "added-param-impl", "type": "TextParam", "coreNameEditable": true, "passingStyle": "DEFAULT", "value": "typed"}),
			},
			"sink-root-impl": {
				ID:      "sink-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "sink-root-impl", "type": "NestedParam", "children": []string{"sink-param"}}),
			},
			"sink-param-impl": {
				ID:      "sink-param-impl",
				Type:    "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "sink-param-impl", "type": "CodeParam", "coreNameEditable": true, "passingStyle": "DEFAULT", "value": "connected"}),
			},
		},
		Edges: []projectstate.Edge{
			{
				ID:              "incoming-edge",
				SourceSectionID: "source-section",
				SourceVariantID: "source-variant",
				SourcePortID:    "source-port",
				TargetSectionID: "dict-section",
				TargetVariantID: "dict-variant",
				TargetPortID:    "target-param",
			},
			{
				ID:              "outgoing-edge",
				SourceSectionID: "dict-section",
				SourceVariantID: "dict-variant",
				SourcePortID:    "result",
				TargetSectionID: "sink-section",
				TargetVariantID: "sink-variant",
				TargetPortID:    "sink-param",
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section edge route project: %v", err)
	}
	return project
}

func paramMoveRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:                 "project-alpha",
		Name:               "Alpha",
		TopLevelSectionIDs: []string{"dict-section"},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"dict-section": {X: 10, Y: 20, ZIndex: 1},
		},
		SectionVariantMap: map[string]string{
			"dict-section": "dict-variant",
		},
		Sections: map[string]projectstate.Section{
			"dict-section": {
				ID:               "dict-section",
				Name:             "Dict",
				VariantIDs:       []string{"dict-variant"},
				DefaultVariantID: "dict-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"dict-variant": {ID: "dict-variant", ImplID: "dict-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"dict-impl": {
				ID:   "dict-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":              "dict-impl",
					"type":            "Dict",
					"topLevelParamId": "root-param",
					"paramFilter":     "",
					"selectedParams":  []string{},
					"edgeInputParams": []string{},
					"codeObjVariantMap": map[string]string{
						"root-param":   "root-param-variant",
						"parent-param": "parent-param-variant",
						"selected-a":   "selected-a-variant",
						"selected-b":   "selected-b-variant",
						"other-param":  "other-param-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"root-param": {
				ID:               "root-param",
				Name:             "root",
				VariantIDs:       []string{"root-param-variant"},
				DefaultVariantID: "root-param-variant",
			},
			"parent-param": {
				ID:               "parent-param",
				Name:             "parent",
				VariantIDs:       []string{"parent-param-variant"},
				DefaultVariantID: "parent-param-variant",
			},
			"selected-a": {
				ID:               "selected-a",
				Name:             "selected_a",
				VariantIDs:       []string{"selected-a-variant"},
				DefaultVariantID: "selected-a-variant",
			},
			"selected-b": {
				ID:               "selected-b",
				Name:             "selected_b",
				VariantIDs:       []string{"selected-b-variant"},
				DefaultVariantID: "selected-b-variant",
			},
			"other-param": {
				ID:               "other-param",
				Name:             "other",
				VariantIDs:       []string{"other-param-variant"},
				DefaultVariantID: "other-param-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"root-param-variant":   {ID: "root-param-variant", ImplID: "root-param-impl"},
			"parent-param-variant": {ID: "parent-param-variant", ImplID: "parent-param-impl"},
			"selected-a-variant":   {ID: "selected-a-variant", ImplID: "selected-a-impl"},
			"selected-b-variant":   {ID: "selected-b-variant", ImplID: "selected-b-impl"},
			"other-param-variant":  {ID: "other-param-variant", ImplID: "other-param-impl"},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"root-param-impl": {
				ID:      "root-param-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectRouteObject(t, map[string]any{"id": "root-param-impl", "type": "NestedParam", "children": []string{"parent-param", "selected-a", "selected-b", "other-param"}}),
			},
			"parent-param-impl": {
				ID:      "parent-param-impl",
				Type:    "CodeParam",
				Payload: mustMarshalProjectRouteObject(t, map[string]any{"id": "parent-param-impl", "type": "CodeParam", "coreNameEditable": true, "coreNameType": "TEXT", "passingStyle": "DEFAULT", "typeAnnotation": "", "value": "parent"}),
			},
			"selected-a-impl": {
				ID:      "selected-a-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectRouteObject(t, map[string]any{"id": "selected-a-impl", "type": "TextParam", "coreNameEditable": true, "coreNameType": "TEXT", "passingStyle": "DEFAULT", "typeAnnotation": "", "value": "a"}),
			},
			"selected-b-impl": {
				ID:      "selected-b-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectRouteObject(t, map[string]any{"id": "selected-b-impl", "type": "TextParam", "coreNameEditable": true, "coreNameType": "TEXT", "passingStyle": "DEFAULT", "typeAnnotation": "", "value": "b"}),
			},
			"other-param-impl": {
				ID:      "other-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectRouteObject(t, map[string]any{"id": "other-param-impl", "type": "TextParam", "coreNameEditable": true, "coreNameType": "TEXT", "passingStyle": "DEFAULT", "typeAnnotation": "", "value": "other"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize param move route test project: %v", err)
	}
	return project
}

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
