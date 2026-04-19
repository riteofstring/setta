package settajsonrenderappgenbackend

import (
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

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"setta/internal/appsubsystem"
	"setta/internal/appsubsystem/appdefinition"
	appdefinitionhttp "setta/internal/appsubsystem/appdefinitionhttp"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/plugins"
	"setta/internal/projectstate"
)

type routeValidationErrorResponse struct {
	StatusCode int    `json:"status_code"`
	Message    string `json:"message"`
	Data       any    `json:"data"`
}

type routeCapabilityProvider struct {
	capabilities plugins.PluginAppSubsystemCapabilities
}

func (p routeCapabilityProvider) AppSubsystemCapabilities() plugins.PluginAppSubsystemCapabilities {
	return p.capabilities
}

func TestRegisterAppDefinitionRoutesReturnsCatalog(t *testing.T) {
	t.Parallel()

	handler := newAppDefinitionRouteTestHandler(t, config.ModeIDE, openAppDefinitionRouteRuntime(t))
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+httpapi.RouteGetAppCatalog, nil)
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdefinitionhttp.AppCatalogResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app catalog payload: %v", err)
	}
	if payload.ID != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %q", appspec.DefaultCatalogID, payload.ID)
	}
	if len(payload.Components) == 0 {
		t.Fatalf("expected catalog components, got %#v", payload.Components)
	}
	if payload.Components[0].Type == "" {
		t.Fatalf("expected component type, got %#v", payload.Components[0])
	}
	if len(payload.Actions) == 0 || payload.Actions[0].Name == "" {
		t.Fatalf("expected catalog actions, got %#v", payload.Actions)
	}
}

func TestAppDefinitionRoutePublicNamesRemainFrozen(t *testing.T) {
	t.Parallel()

	if httpapi.RouteGetAppCatalog != "/getAppCatalog" {
		t.Fatalf("expected get app catalog route to remain frozen, got %q", httpapi.RouteGetAppCatalog)
	}
	if httpapi.RouteGetAppDefinition != "/getAppDefinition" {
		t.Fatalf("expected get app definition route to remain frozen, got %q", httpapi.RouteGetAppDefinition)
	}
	if httpapi.RouteSetAppDefinition != "/setAppDefinition" {
		t.Fatalf("expected set app definition route to remain frozen, got %q", httpapi.RouteSetAppDefinition)
	}
	if httpapi.RouteValidateAppDefinition != "/validateAppDefinition" {
		t.Fatalf("expected validate app definition route to remain frozen, got %q", httpapi.RouteValidateAppDefinition)
	}
}

func TestBuildFrontendAPIRouteRegistrationsWithChatModesOnlyRegistersSkillRoutes(t *testing.T) {
	t.Parallel()

	document := buildAppSubsystemRouteDocumentForTest(
		t,
		plugins.PluginAppSubsystemCapabilities{
			PluginID:               ProviderPluginID,
			PluginEnabled:          true,
			AppGenerationChatModes: true,
		},
	)
	if document.Paths[httpapi.RouteGetAppGenSkills] == nil {
		t.Fatalf("expected chat-mode provider to register %s", httpapi.RouteGetAppGenSkills)
	}
	for _, routePath := range []string{
		httpapi.RouteGetAppDefinition,
		httpapi.RouteSetAppDefinition,
		httpapi.RouteValidateAppDefinition,
	} {
		if document.Paths[routePath] != nil {
			t.Fatalf("did not expect chat-only provider to register %s", routePath)
		}
	}
}

func TestBuildFrontendAPIRouteRegistrationsWithoutDeploymentCapabilityOmitsDeploymentRoutes(t *testing.T) {
	t.Parallel()

	document := buildAppSubsystemRouteDocumentForTest(
		t,
		plugins.PluginAppSubsystemCapabilities{
			PluginID:       ProviderPluginID,
			PluginEnabled:  true,
			AppAuthoringUI: true,
		},
	)
	for _, routePath := range []string{
		httpapi.RouteAppDeployments,
		httpapi.RouteAppDeploymentCurrentSession,
		httpapi.RouteAppDeploymentState,
		httpapi.RouteAppDeploymentProjectConfig,
	} {
		if document.Paths[routePath] != nil {
			t.Fatalf("did not expect deployment route %s without deployment capability", routePath)
		}
	}
}

func TestRegisterAppDefinitionRoutesGetsStoredDefinition(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	setTestAppDefinition(t, runtime, appdefinition.SetInput{
		AppSpec: map[string]any{
			"root": "root",
			"elements": map[string]any{
				"root": map[string]any{
					"key":  "root",
					"type": "Stack",
				},
			},
		},
	})

	handler := newAppDefinitionRouteTestHandler(t, config.ModeIDE, runtime)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+httpapi.RouteGetAppDefinition, strings.NewReader(`{}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdefinition.ReadResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode get app definition payload: %v", err)
	}
	if payload.AppDefinition == nil {
		t.Fatalf("expected app definition metadata, got %#v", payload)
	}
	if payload.AppDefinition.AppSpecPath != appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath() {
		t.Fatalf("expected app spec path %q, got %q", appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(), payload.AppDefinition.AppSpecPath)
	}
	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(payload.AppSpec, storedSpec) {
		t.Fatalf("expected stored app spec %#v, got %#v", storedSpec, payload.AppSpec)
	}
}

func buildAppSubsystemRouteDocumentForTest(
	t *testing.T,
	capabilities plugins.PluginAppSubsystemCapabilities,
) *huma.OpenAPI {
	t.Helper()

	document, err := httpapi.BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		func(deps httpapi.FrontendAPIRouteDependencies) httpapi.FrontendAPIRouteRegistrations {
			registrations, buildErr := appsubsystem.BuildFrontendAPIRouteRegistrations(
				appsubsystem.FrontendRouteRegistrationOptions{
					Capabilities:       routeCapabilityProvider{capabilities: capabilities},
					ModePolicy:         deps.Project.ModePolicy,
					ProjectState:       deps.Project.ProjectState,
					AppGenSkill:        deps.AppGenSkill,
					ShareDeploymentIDE: deps.ShareDeploymentIDE,
					AppDeployment: httpapi.DeploymentRouteDependencies{
						ModePolicy: modes.NewPolicy(config.ModeApp),
					},
				},
			)
			if buildErr != nil {
				t.Fatalf("build app subsystem route registrations: %v", buildErr)
			}
			return registrations
		},
	)
	if err != nil {
		t.Fatalf("build app subsystem route document: %v", err)
	}
	return document
}

func TestRegisterAppDefinitionRoutesReturnsNilSpecWhenStoredFileMissing(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	setTestAppDefinition(t, runtime, appdefinition.SetInput{
		AppSpec: map[string]any{
			"root": "root",
			"elements": map[string]any{
				"root": map[string]any{
					"key":  "root",
					"type": "Stack",
				},
			},
		},
	})
	if err := os.Remove(filepath.Join(root, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())); err != nil {
		t.Fatalf("remove stored app spec: %v", err)
	}

	handler := newAppDefinitionRouteTestHandler(t, config.ModeIDE, runtime)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+httpapi.RouteGetAppDefinition, strings.NewReader(`{}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdefinition.ReadResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode missing-file get app definition payload: %v", err)
	}
	if payload.AppDefinition == nil {
		t.Fatalf("expected app definition metadata, got %#v", payload)
	}
	if payload.AppDefinition.AppSpecPath != appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath() {
		t.Fatalf("expected app spec path %q, got %q", appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(), payload.AppDefinition.AppSpecPath)
	}
	if payload.AppSpec != nil {
		t.Fatalf("expected nil app spec for missing stored file, got %#v", payload.AppSpec)
	}
}

func TestRegisterAppDefinitionRoutesValidatesDefinition(t *testing.T) {
	t.Parallel()

	handler := newAppDefinitionRouteTestHandler(t, config.ModeIDE, openAppDefinitionRouteRuntime(t))
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteValidateAppDefinition,
		strings.NewReader(`{"appSpec":{"root":"root","elements":{"root":{"key":"root","type":"Stack"}}}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdefinition.ValidationResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode validate app definition payload: %v", err)
	}
	if len(payload.Errors) != 0 {
		t.Fatalf("expected no validation errors, got %#v", payload.Errors)
	}
	if payload.Capabilities.CatalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %q", appspec.DefaultCatalogID, payload.Capabilities.CatalogID)
	}
}

func TestRegisterAppDefinitionRoutesPersistsDefinition(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	handler := newAppDefinitionRouteTestHandler(t, config.ModeIDE, runtime)
	customPath := appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json")
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteSetAppDefinition,
		strings.NewReader(fmt.Sprintf(`{
			"appSpec":{"root":"root","elements":{"root":{"key":"root","type":"Stack"}}},
			"appSpecPath":"%s",
			"appSpecVersion":"v2",
			"catalogId":"setta.app.default",
			"theme":{"mode":"dark"}
		}`, customPath)),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdefinition.MutationResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode set app definition payload: %v", err)
	}
	if payload.AppDefinition == nil {
		t.Fatalf("expected persisted app definition, got %#v", payload)
	}
	if payload.AppDefinition.AppSpecPath != customPath {
		t.Fatalf("expected app spec path %q, got %q", customPath, payload.AppDefinition.AppSpecPath)
	}
	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, customPath)
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(payload.AppSpec, storedSpec) {
		t.Fatalf("expected stored app spec %#v, got %#v", storedSpec, payload.AppSpec)
	}
}

func TestRegisterAppDefinitionRoutesRejectsInvalidSetInput(t *testing.T) {
	t.Parallel()

	handler := newAppDefinitionRouteTestHandler(t, config.ModeIDE, openAppDefinitionRouteRuntime(t))
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteSetAppDefinition,
		strings.NewReader(`{"appSpec":{"root":"root","elements":{"root":{"key":"root","type":"Stack"}}},"catalogId":"unknown.catalog"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	var payload struct {
		Detail string `json:"detail"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid set payload: %v", err)
	}
	if !strings.Contains(payload.Detail, "unknown catalog") {
		t.Fatalf("expected unknown catalog detail, got %#v", payload)
	}
}

func TestRegisterAppDefinitionRoutesBlocksDeploymentModesWithStructuralDetail(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		mode := mode
		t.Run(string(mode), func(t *testing.T) {
			t.Parallel()

			handler := newAppDefinitionRouteTestHandler(t, mode, openAppDefinitionRouteRuntime(t))
			request := httptest.NewRequest(http.MethodPost, "/api"+httpapi.RouteGetAppDefinition, strings.NewReader(`{}`))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}

			var payload struct {
				Detail string `json:"detail"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode deployment detail payload: %v", err)
			}
			if payload.Detail != "Deployment mode disallows structural changes." {
				t.Fatalf("expected deployment structural detail, got %#v", payload)
			}
		})
	}
}

func TestRegisterAppDefinitionRoutesAllowsCatalogOutsideIDE(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeIDE, config.ModeLauncher, config.ModeShare, config.ModeApp} {
		mode := mode
		t.Run(string(mode), func(t *testing.T) {
			t.Parallel()

			handler := newAppDefinitionRouteTestHandler(t, mode, nil)
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api"+httpapi.RouteGetAppCatalog, nil)
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
			}
		})
	}
}

func TestRegisterAppDefinitionRoutesAllowsLauncherModeWhenRuntimePresent(t *testing.T) {
	t.Parallel()

	handler := newAppDefinitionRouteTestHandler(t, config.ModeLauncher, openAppDefinitionRouteRuntime(t))
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteValidateAppDefinition,
		strings.NewReader(`{"appSpec":{"root":"root","elements":{"root":{"key":"root","type":"Stack"}}}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestRegisterAppDefinitionRoutesReturns404DetailWhenProjectManagerUnavailable(t *testing.T) {
	t.Parallel()

	handler := newAppDefinitionRouteTestHandler(t, config.ModeLauncher, nil)
	request := httptest.NewRequest(http.MethodPost, "/api"+httpapi.RouteGetAppDefinition, strings.NewReader(`{}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}

	var payload struct {
		Detail string `json:"detail"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode missing manager payload: %v", err)
	}
	if payload.Detail != "Project manager not available." {
		t.Fatalf("expected missing manager detail, got %#v", payload)
	}
}

func TestRegisterAppDefinitionRoutesMalformedJSONReturnsValidationEnvelope(t *testing.T) {
	t.Parallel()

	handler := newAppDefinitionRouteTestHandler(t, config.ModeIDE, openAppDefinitionRouteRuntime(t))

	for _, testCase := range []struct {
		name  string
		route string
		body  string
	}{
		{name: "get", route: httpapi.RouteGetAppDefinition, body: `{"frontendOpId":`},
		{name: "validate", route: httpapi.RouteValidateAppDefinition, body: `{"appSpec":`},
		{name: "set", route: httpapi.RouteSetAppDefinition, body: `{"appSpec":`},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+testCase.route, strings.NewReader(testCase.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
			}

			var payload routeValidationErrorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode validation envelope: %v", err)
			}
			if payload.StatusCode != 10422 {
				t.Fatalf("expected validation status code 10422, got %#v", payload)
			}
			if payload.Message == "" {
				t.Fatalf("expected validation message, got %#v", payload)
			}
			if payload.Data != nil {
				t.Fatalf("expected nil validation data, got %#v", payload.Data)
			}
		})
	}
}

func TestRegisterAppDefinitionRoutesValidateAndSetMissingAppSpecReturnValidationEnvelope(t *testing.T) {
	t.Parallel()

	handler := newAppDefinitionRouteTestHandler(t, config.ModeIDE, openAppDefinitionRouteRuntime(t))

	for _, testCase := range []struct {
		name  string
		route string
		body  string
	}{
		{name: "validate_missing", route: httpapi.RouteValidateAppDefinition, body: `{}`},
		{name: "validate_null", route: httpapi.RouteValidateAppDefinition, body: `{"appSpec":null}`},
		{name: "set_missing", route: httpapi.RouteSetAppDefinition, body: `{}`},
		{name: "set_null", route: httpapi.RouteSetAppDefinition, body: `{"appSpec":null}`},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api"+testCase.route, strings.NewReader(testCase.body))
			request.Header.Set("Content-Type", "application/json")
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
			}

			var payload routeValidationErrorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode validation envelope: %v", err)
			}
			if payload.StatusCode != 10422 {
				t.Fatalf("expected validation status code 10422, got %#v", payload)
			}
			if payload.Message == "" {
				t.Fatalf("expected validation message, got %#v", payload)
			}
			if payload.Data != nil {
				t.Fatalf("expected nil validation data, got %#v", payload.Data)
			}
		})
	}
}

func newAppDefinitionRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
) http.Handler {
	t.Helper()

	handler, err := httpapi.NewHandler(httpapi.Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       httpapi.NewConfigInfoService(config.Config{Server: config.Server{Mode: mode}}, ""),
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := appdefinitionhttp.RegisterRoutes(r, appdefinitionhttp.RouteDependencies{
				ModePolicy:   modes.NewPolicy(mode),
				ProjectState: projectRuntime,
				PluginID:     ProviderPluginID,
			}); err != nil {
				t.Fatalf("register app definition routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new app definition route handler: %v", err)
	}
	return handler
}

func openAppDefinitionRouteRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()

	_, runtime := openPersistedPluginAppDefinitionRuntime(t)
	return runtime
}

func TestBuildFrontendHTTPOpenAPIDocumentIncludesPluginAppDefinitionRoutes(t *testing.T) {
	document, err := httpapi.BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		buildAppDefinitionRouteRegistrationsForTest,
	)
	if err != nil {
		t.Fatalf("build frontend openapi document: %v", err)
	}

	getAppCatalog := document.Paths[httpapi.RouteGetAppCatalog].Get
	if getAppCatalog == nil {
		t.Fatalf("expected %s get operation", httpapi.RouteGetAppCatalog)
	}
	if getAppCatalog.OperationID != "getAppCatalog" {
		t.Fatalf("get app catalog operation id = %q, want %q", getAppCatalog.OperationID, "getAppCatalog")
	}

	getAppDefinition := document.Paths[httpapi.RouteGetAppDefinition].Post
	if getAppDefinition == nil {
		t.Fatalf("expected %s post operation", httpapi.RouteGetAppDefinition)
	}
	if getAppDefinition.OperationID != "getAppDefinition" {
		t.Fatalf("get app definition operation id = %q, want %q", getAppDefinition.OperationID, "getAppDefinition")
	}
	if got := getAppDefinition.Extensions["x-setta-mode-requirement"]; got != "not-deployment" {
		t.Fatalf("get app definition mode requirement = %#v, want %q", got, "not-deployment")
	}
	if got := getAppDefinition.Responses["200"].Content["application/json"].Schema.Ref; got != "#/components/schemas/AppsubsystemAppdefinitionReadResult" {
		t.Fatalf("get app definition response schema ref = %q, want %q", got, "#/components/schemas/AppsubsystemAppdefinitionReadResult")
	}

	setAppDefinition := document.Paths[httpapi.RouteSetAppDefinition].Post
	if setAppDefinition == nil {
		t.Fatalf("expected %s post operation", httpapi.RouteSetAppDefinition)
	}
	if setAppDefinition.OperationID != "setAppDefinition" {
		t.Fatalf("set app definition operation id = %q, want %q", setAppDefinition.OperationID, "setAppDefinition")
	}
	if got := setAppDefinition.Responses["200"].Content["application/json"].Schema.Ref; got != "#/components/schemas/AppsubsystemAppdefinitionMutationResult" {
		t.Fatalf("set app definition response schema ref = %q, want %q", got, "#/components/schemas/AppsubsystemAppdefinitionMutationResult")
	}

	validateAppDefinition := document.Paths[httpapi.RouteValidateAppDefinition].Post
	if validateAppDefinition == nil {
		t.Fatalf("expected %s post operation", httpapi.RouteValidateAppDefinition)
	}
	if validateAppDefinition.OperationID != "validateAppDefinition" {
		t.Fatalf("validate app definition operation id = %q, want %q", validateAppDefinition.OperationID, "validateAppDefinition")
	}
	if got := validateAppDefinition.Responses["200"].Content["application/json"].Schema.Ref; got != "#/components/schemas/AppsubsystemAppdefinitionValidationResult" {
		t.Fatalf("validate app definition response schema ref = %q, want %q", got, "#/components/schemas/AppsubsystemAppdefinitionValidationResult")
	}
	if schema := document.Components.Schemas.SchemaFromRef("#/components/schemas/AppsubsystemAppdefinitionAppDefinition"); schema == nil {
		t.Fatal("expected plugin-owned app definition schema in HTTP OpenAPI document")
	}
	if schema := document.Components.Schemas.SchemaFromRef("#/components/schemas/AppsubsystemAppdefinitionhttpSetAppDefinitionRequest"); schema == nil {
		t.Fatal("expected app-definition request schema to use the neutral app subsystem HTTP owner path")
	}
	if schema := document.Components.Schemas.SchemaFromRef("#/components/schemas/AppsubsystemAppdefinitionhttpValidateAppDefinitionRequest"); schema == nil {
		t.Fatal("expected app-definition validation schema to use the neutral app subsystem HTTP owner path")
	}
	if schema := document.Components.Schemas.SchemaFromRef("#/components/schemas/ProjectstateAppDefinition"); schema != nil {
		t.Fatalf("did not expect host projectstate app definition schema in HTTP OpenAPI document, got %#v", schema)
	}
	if schema := document.Components.Schemas.SchemaFromRef("#/components/schemas/ProjectstateAppRoute"); schema != nil {
		t.Fatalf("did not expect host projectstate app route schema in HTTP OpenAPI document, got %#v", schema)
	}
}

func buildAppDefinitionRouteRegistrationsForTest(
	deps httpapi.FrontendAPIRouteDependencies,
) httpapi.FrontendAPIRouteRegistrations {
	return httpapi.FrontendAPIRouteRegistrations{
		Project: []httpapi.FrontendAPIRouteContribution{
			{
				Family: "app definition",
				Register: func(router chi.Router) error {
					return appdefinitionhttp.RegisterRoutes(router, appdefinitionhttp.RouteDependencies{
						ModePolicy:   deps.Project.ModePolicy,
						ProjectState: deps.Project.ProjectState,
						PluginID:     ProviderPluginID,
					})
				},
			},
		},
	}
}
