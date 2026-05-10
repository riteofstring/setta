package settajsonrenderappgenbackend

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
)

type appDeploymentIDERouteFixture struct {
	SettaFilesRoot   string
	WorkspaceRoot    string
	ProjectRuntime   *projectstate.Runtime
	Catalog          *deployments.Catalog
	SharePublisher   deployments.SharePublishService
	AppPublisher     deployments.AppPublishService
	setPublishedAtFn func(time.Time)
}

type pluginAppDeploymentIDERouteInfoService struct{}

func (pluginAppDeploymentIDERouteInfoService) ServerMode(context.Context) string {
	return string(config.ModeIDE)
}

func (pluginAppDeploymentIDERouteInfoService) RuntimeInfo(context.Context) httpapi.RuntimeInfo {
	return httpapi.RuntimeInfo{Mode: string(config.ModeIDE)}
}

func (pluginAppDeploymentIDERouteInfoService) SDKRuntimeHandshake(context.Context) pythonsdkcontracts.RunningBackendVersionHandshake {
	return pythonsdkcontracts.RunningBackendVersionHandshake{}
}

func TestAppDeploymentIDERoutePublicNamesRemainFrozen(t *testing.T) {
	t.Parallel()

	if httpapi.RouteAppDeployments != "/app/deployments" {
		t.Fatalf("expected app deployments route to remain frozen, got %q", httpapi.RouteAppDeployments)
	}
	if httpapi.RouteAppDeploymentVersions != "/app/deployments/{deploymentName}/versions" {
		t.Fatalf("expected app deployment versions route to remain frozen, got %q", httpapi.RouteAppDeploymentVersions)
	}
	if httpapi.RouteAppDeploymentLatest != "/app/deployments/{deploymentName}/latest" {
		t.Fatalf("expected app deployment latest route to remain frozen, got %q", httpapi.RouteAppDeploymentLatest)
	}
}

func TestBuildFrontendHTTPOpenAPIDocumentIncludesPluginAppDeploymentIDERoutes(t *testing.T) {
	document, err := httpapi.BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		buildAppDeploymentIDERouteRegistrationsForTest,
	)
	if err != nil {
		t.Fatalf("build frontend openapi document: %v", err)
	}

	listDeployments := document.Paths[httpapi.RouteAppDeployments]
	if listDeployments == nil || listDeployments.Get == nil {
		t.Fatalf("expected %s get operation", httpapi.RouteAppDeployments)
	}
	if listDeployments.Get.OperationID != "listAppDeployments" {
		t.Fatalf("app deployments operation id = %q, want %q", listDeployments.Get.OperationID, "listAppDeployments")
	}
	if got := listDeployments.Get.Extensions["x-setta-mode-requirement"]; got != "ide" {
		t.Fatalf("app deployments mode requirement = %#v, want %q", got, "ide")
	}
	if listDeployments.Post == nil {
		t.Fatalf("expected %s post operation", httpapi.RouteAppDeployments)
	}
	if listDeployments.Post.OperationID != "publishAppDeployment" {
		t.Fatalf("app publish operation id = %q, want %q", listDeployments.Post.OperationID, "publishAppDeployment")
	}

	versions := document.Paths[httpapi.RouteAppDeploymentVersions]
	if versions == nil || versions.Get == nil {
		t.Fatalf("expected %s get operation", httpapi.RouteAppDeploymentVersions)
	}
	if versions.Get.OperationID != "listAppDeploymentVersions" {
		t.Fatalf("app versions operation id = %q, want %q", versions.Get.OperationID, "listAppDeploymentVersions")
	}

	latest := document.Paths[httpapi.RouteAppDeploymentLatest]
	if latest == nil || latest.Get == nil {
		t.Fatalf("expected %s get operation", httpapi.RouteAppDeploymentLatest)
	}
	if latest.Get.OperationID != "getAppDeploymentLatest" {
		t.Fatalf("app latest operation id = %q, want %q", latest.Get.OperationID, "getAppDeploymentLatest")
	}
}

func TestRegisterAppDeploymentIDERoutesPublishesAppDeployment(t *testing.T) {
	t.Parallel()

	appSpecPath := appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath()
	appSpecPayload := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(&appdefinition.AppDefinition{
		AppSpecPath: appSpecPath,
	}))
	if err := appspec.MustForPlugin("setta-json-render-app-gen").Write(fixture.SettaFilesRoot, appSpecPath, appSpecPayload); err != nil {
		t.Fatalf("write app spec: %v", err)
	}

	listenerPath := filepath.Join(fixture.WorkspaceRoot, "listeners", "app.py")
	if err := os.MkdirAll(filepath.Dir(listenerPath), 0o755); err != nil {
		t.Fatalf("mkdir app listener path: %v", err)
	}
	if err := os.WriteFile(listenerPath, []byte("print('listener')\n"), 0o644); err != nil {
		t.Fatalf("write app listener source: %v", err)
	}

	handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	fixture.setPublishedAt(time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteAppDeployments,
		strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha","appPolicyOverrides":{"allowRun":false},"listenerEntrypoint":"listeners/app.py"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected app publish 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload httpapi.DeploymentMetadataResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app publish payload: %v", err)
	}
	if payload.DeploymentVersion != "v1" {
		t.Fatalf("expected app deployment version v1, got %q", payload.DeploymentVersion)
	}
	assertPublishedAppDeploymentContents(t, payload, appSpecPath, appSpecPayload)

	fixture.setPublishedAt(time.Date(2026, 3, 8, 13, 0, 0, 0, time.UTC))
	secondResponse := httptest.NewRecorder()
	secondRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteAppDeployments,
		strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
	)
	secondRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(secondResponse, secondRequest)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second app publish 200, got %d with body %q", secondResponse.Code, secondResponse.Body.String())
	}

	var secondPayload httpapi.DeploymentMetadataResponse
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("decode second app publish payload: %v", err)
	}
	if secondPayload.DeploymentVersion != "v2" {
		t.Fatalf("expected second app deployment version v2, got %q", secondPayload.DeploymentVersion)
	}
	assertAppDeploymentVersionRoutes(t, handler)
}

func assertPublishedAppDeploymentContents(
	t *testing.T,
	payload httpapi.DeploymentMetadataResponse,
	appSpecPath string,
	appSpecPayload map[string]any,
) {
	t.Helper()

	manifest, err := deployments.LoadManifest(payload.DeploymentRoot)
	if err != nil {
		t.Fatalf("load app manifest: %v", err)
	}
	if manifest.DeploymentType != deployments.TypeApp {
		t.Fatalf("expected app deployment type, got %q", manifest.DeploymentType)
	}
	if manifest.Listener == nil || !manifest.Listener.Enabled {
		t.Fatalf("expected enabled app listener config, got %#v", manifest.Listener)
	}
	if manifest.Listener.Entrypoint != "listener/app.py" {
		t.Fatalf("expected app listener entrypoint listener/app.py, got %q", manifest.Listener.Entrypoint)
	}
	listenerContent, err := os.ReadFile(filepath.Join(payload.DeploymentRoot, "listener", "app.py"))
	if err != nil {
		t.Fatalf("read copied app listener entrypoint: %v", err)
	}
	if string(listenerContent) != "print('listener')\n" {
		t.Fatalf("unexpected copied app listener content %q", string(listenerContent))
	}
	assertPublishedAppPolicyAndDocument(t, payload.DeploymentRoot, appSpecPath)
	assertPublishedAppSpec(t, payload.DeploymentRoot, appSpecPath, appSpecPayload)
	assertPublishedAppPluginState(t, payload.DeploymentRoot)
}

func assertPublishedAppPolicyAndDocument(t *testing.T, deploymentRoot string, appSpecPath string) {
	t.Helper()

	policy, err := deployments.LoadPolicy(deploymentRoot)
	if err != nil {
		t.Fatalf("load app policy: %v", err)
	}
	if policy.AllowRun {
		t.Fatalf("expected app policy allowRun override false, got %#v", policy)
	}

	store, err := projectstate.NewStore(filepath.Join(deploymentRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open published app store: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load published app document: %v", err)
	}
	storedDefinition := storedDocumentAppDefinition(t, document)
	if storedDefinition == nil {
		t.Fatal("expected published app definition")
	}
	if storedDefinition.AppSpecPath != appSpecPath {
		t.Fatalf("expected published app spec path %q, got %q", appSpecPath, storedDefinition.AppSpecPath)
	}
}

func assertPublishedAppSpec(
	t *testing.T,
	deploymentRoot string,
	appSpecPath string,
	appSpecPayload map[string]any,
) {
	t.Helper()

	publishedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(deploymentRoot, appSpecPath)
	if err != nil {
		t.Fatalf("read published app spec: %v", err)
	}
	encodedPublished, err := json.Marshal(publishedSpec)
	if err != nil {
		t.Fatalf("marshal published app spec: %v", err)
	}
	encodedExpected, err := json.Marshal(appSpecPayload)
	if err != nil {
		t.Fatalf("marshal expected app spec: %v", err)
	}
	if string(encodedPublished) != string(encodedExpected) {
		t.Fatalf("expected published app spec %s, got %s", string(encodedExpected), string(encodedPublished))
	}
}

func assertPublishedAppPluginState(t *testing.T, deploymentRoot string) {
	t.Helper()

	if _, err := os.Stat(filepath.Join(
		deploymentRoot,
		".setta_plugins",
		ProviderPluginID,
		"setta.plugin.json",
	)); err != nil {
		t.Fatalf("expected published deployment to package provider plugin, got %v", err)
	}
	var pluginsState plugins.PluginsStateFile
	pluginsStatePayload, err := os.ReadFile(filepath.Join(deploymentRoot, "plugins_state.json"))
	if err != nil {
		t.Fatalf("read published deployment plugins state: %v", err)
	}
	if err := json.Unmarshal(pluginsStatePayload, &pluginsState); err != nil {
		t.Fatalf("decode published deployment plugins state: %v", err)
	}
	if len(pluginsState.EnabledPluginIDs) != 1 ||
		pluginsState.EnabledPluginIDs[0] != ProviderPluginID {
		t.Fatalf("expected published deployment plugins state to enable %q, got %#v", ProviderPluginID, pluginsState)
	}
	workspaceConfig, ok := pluginsState.PluginConfigByID["workspace:"+ProviderPluginID].(map[string]any)
	if !ok || workspaceConfig["theme"] != "ocean" {
		t.Fatalf("expected published deployment workspace-scoped provider config, got %#v", pluginsState.PluginConfigByID)
	}
	if _, ok := pluginsState.PluginConfigByID["global:"+ProviderPluginID]; ok {
		t.Fatalf("expected published deployment to omit global-scoped provider config, got %#v", pluginsState.PluginConfigByID)
	}
}

func assertAppDeploymentVersionRoutes(t *testing.T, handler http.Handler) {
	t.Helper()

	versionsResponse := httptest.NewRecorder()
	versionsRequest := httptest.NewRequest(http.MethodGet, "/api/app/deployments/demo-app/versions", nil)
	handler.ServeHTTP(versionsResponse, versionsRequest)
	if versionsResponse.Code != http.StatusOK {
		t.Fatalf("expected app versions 200, got %d with body %q", versionsResponse.Code, versionsResponse.Body.String())
	}

	var versionsPayload []httpapi.DeploymentMetadataResponse
	if err := json.Unmarshal(versionsResponse.Body.Bytes(), &versionsPayload); err != nil {
		t.Fatalf("decode app versions payload: %v", err)
	}
	if len(versionsPayload) != 2 {
		t.Fatalf("expected two app versions, got %#v", versionsPayload)
	}
	if versionsPayload[0].DeploymentVersion != "v2" || versionsPayload[1].DeploymentVersion != "v1" {
		t.Fatalf("expected newest-first app versions, got %#v", versionsPayload)
	}

	latestResponse := httptest.NewRecorder()
	latestRequest := httptest.NewRequest(http.MethodGet, "/api/app/deployments/demo-app/latest", nil)
	handler.ServeHTTP(latestResponse, latestRequest)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected app latest 200, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var latestPayload httpapi.DeploymentMetadataResponse
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &latestPayload); err != nil {
		t.Fatalf("decode app latest payload: %v", err)
	}
	if latestPayload.DeploymentVersion != "v2" {
		t.Fatalf("expected latest app deployment version v2, got %q", latestPayload.DeploymentVersion)
	}

	listResponse := httptest.NewRecorder()
	listRequest := httptest.NewRequest(http.MethodGet, "/api"+httpapi.RouteAppDeployments, nil)
	handler.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected app list 200, got %d with body %q", listResponse.Code, listResponse.Body.String())
	}

	var listPayload []httpapi.DeploymentMetadataResponse
	if err := json.Unmarshal(listResponse.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("decode app list payload: %v", err)
	}
	if len(listPayload) != 2 {
		t.Fatalf("expected two app list entries, got %#v", listPayload)
	}
	if listPayload[0].DeploymentVersion != "v2" || listPayload[1].DeploymentVersion != "v1" {
		t.Fatalf("expected newest-first app list entries, got %#v", listPayload)
	}
}

func TestRegisterAppDeploymentIDERoutesRebasesAbsoluteAppSpecPathAndKeepsDefaultPolicy(
	t *testing.T,
) {
	t.Parallel()

	appSpecPath := appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath()
	appSpecPayload := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(&appdefinition.AppDefinition{
		AppSpecPath: appSpecPath,
	}))
	if err := appspec.MustForPlugin("setta-json-render-app-gen").Write(fixture.SettaFilesRoot, appSpecPath, appSpecPayload); err != nil {
		t.Fatalf("write app spec: %v", err)
	}
	absoluteAppSpecPath := filepath.Join(fixture.SettaFilesRoot, filepath.FromSlash(appSpecPath))
	if _, err := fixture.ProjectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document = withStoredDocumentAppDefinition(document, mustEncodeStoredAppDefinition(t, &appdefinition.AppDefinition{
			AppSpecPath: absoluteAppSpecPath,
		}))
		return document, nil
	}); err != nil {
		t.Fatalf("set absolute app spec path: %v", err)
	}

	handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteAppDeployments,
		strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected app publish 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload httpapi.DeploymentMetadataResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app publish payload: %v", err)
	}

	policy, err := deployments.LoadPolicy(payload.DeploymentRoot)
	if err != nil {
		t.Fatalf("load app policy: %v", err)
	}
	if !policy.AllowRun {
		t.Fatalf("expected default app policy allowRun true, got %#v", policy)
	}
	if policy.AllowVariantChanges {
		t.Fatalf("expected default app policy to disable variant changes, got %#v", policy)
	}
	if policy.AllowLayoutChanges {
		t.Fatalf("expected default app policy to disable layout changes, got %#v", policy)
	}

	store, err := projectstate.NewStore(filepath.Join(payload.DeploymentRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open published app store: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load published app document: %v", err)
	}
	storedDefinition := storedDocumentAppDefinition(t, document)
	if storedDefinition == nil {
		t.Fatal("expected published app definition")
	}
	if storedDefinition.AppSpecPath != appSpecPath {
		t.Fatalf("expected published app spec path %q, got %q", appSpecPath, storedDefinition.AppSpecPath)
	}
}

func TestRegisterAppDeploymentIDERoutesLatestRoutesFilterByDeploymentType(t *testing.T) {
	t.Parallel()

	appSpecPath := appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath()
	appSpecPayload := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(&appdefinition.AppDefinition{
		AppSpecPath: appSpecPath,
	}))
	if err := appspec.MustForPlugin("setta-json-render-app-gen").Write(fixture.SettaFilesRoot, appSpecPath, appSpecPayload); err != nil {
		t.Fatalf("write app spec: %v", err)
	}

	handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	fixture.setPublishedAt(time.Date(2026, 3, 8, 14, 0, 0, 0, time.UTC))
	shareResponse := httptest.NewRecorder()
	shareRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteShareDeployments,
		strings.NewReader(`{"deploymentName":"demo-collision","projectConfigId":"project-alpha"}`),
	)
	shareRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(shareResponse, shareRequest)
	if shareResponse.Code != http.StatusOK {
		t.Fatalf("expected share publish 200, got %d with body %q", shareResponse.Code, shareResponse.Body.String())
	}

	fixture.setPublishedAt(time.Date(2026, 3, 8, 15, 0, 0, 0, time.UTC))
	appResponse := httptest.NewRecorder()
	appRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteAppDeployments,
		strings.NewReader(`{"deploymentName":"demo-collision","projectConfigId":"project-alpha"}`),
	)
	appRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(appResponse, appRequest)
	if appResponse.Code != http.StatusOK {
		t.Fatalf("expected app publish 200, got %d with body %q", appResponse.Code, appResponse.Body.String())
	}

	shareLatestResponse := httptest.NewRecorder()
	shareLatestRequest := httptest.NewRequest(http.MethodGet, "/api/share/deployments/demo-collision/latest", nil)
	handler.ServeHTTP(shareLatestResponse, shareLatestRequest)
	if shareLatestResponse.Code != http.StatusNotFound {
		t.Fatalf("expected share latest 404 when newest root is app-only, got %d with body %q", shareLatestResponse.Code, shareLatestResponse.Body.String())
	}
	appDeploymentIDERouteErrorCode(t, shareLatestResponse, "not_found")
	if !strings.Contains(shareLatestResponse.Body.String(), "Share deployment not found") {
		t.Fatalf("expected share latest route to explain missing share deployment, got %q", shareLatestResponse.Body.String())
	}

	appLatestResponse := httptest.NewRecorder()
	appLatestRequest := httptest.NewRequest(http.MethodGet, "/api/app/deployments/demo-collision/latest", nil)
	handler.ServeHTTP(appLatestResponse, appLatestRequest)
	if appLatestResponse.Code != http.StatusOK {
		t.Fatalf("expected app latest 200, got %d with body %q", appLatestResponse.Code, appLatestResponse.Body.String())
	}

	var appLatestPayload httpapi.DeploymentMetadataResponse
	if err := json.Unmarshal(appLatestResponse.Body.Bytes(), &appLatestPayload); err != nil {
		t.Fatalf("decode app latest payload: %v", err)
	}
	appManifest, err := deployments.LoadManifest(appLatestPayload.DeploymentRoot)
	if err != nil {
		t.Fatalf("load app latest manifest: %v", err)
	}
	if appManifest.DeploymentType != deployments.TypeApp {
		t.Fatalf("expected app latest route to return app manifest, got %q", appManifest.DeploymentType)
	}
	if appLatestPayload.DeploymentVersion != "v2" {
		t.Fatalf("expected app latest route to resolve newest app deployment v2, got %q", appLatestPayload.DeploymentVersion)
	}
}

func TestRegisterAppDeploymentIDERoutesRejectUnknownFieldsOnPublish(t *testing.T) {
	t.Parallel()

	fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(nil))
	handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteAppDeployments,
		strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha","unexpected":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid publish payload 400, got %d with body %q", response.Code, response.Body.String())
	}
	appDeploymentIDERouteErrorCode(t, response, "invalid_json")
}

func TestRegisterAppDeploymentIDERoutesRejectMalformedPublishJSON(t *testing.T) {
	t.Parallel()

	fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(nil))
	handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteAppDeployments,
		strings.NewReader(`{"deploymentName":`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected malformed publish payload 400, got %d with body %q", response.Code, response.Body.String())
	}
	appDeploymentIDERouteErrorCode(t, response, "invalid_json")
}

func TestRegisterAppDeploymentIDERoutesMapAppPublishValidationErrors(t *testing.T) {
	t.Parallel()

	t.Run("app definition required", func(t *testing.T) {
		fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(nil))
		handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

		response := httptest.NewRecorder()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+httpapi.RouteAppDeployments,
			strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
		)
		request.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected app-definition-required 400, got %d with body %q", response.Code, response.Body.String())
		}
		appDeploymentIDERouteErrorCode(t, response, "app_definition_required")
	})

	t.Run("app spec path required", func(t *testing.T) {
		fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(&appdefinition.AppDefinition{}))
		handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

		response := httptest.NewRecorder()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+httpapi.RouteAppDeployments,
			strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
		)
		request.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected app-spec-path-required 400, got %d with body %q", response.Code, response.Body.String())
		}
		appDeploymentIDERouteErrorCode(t, response, "app_spec_path_required")
	})

	t.Run("app spec not found", func(t *testing.T) {
		fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(&appdefinition.AppDefinition{
			AppSpecPath: appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(),
		}))
		handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

		response := httptest.NewRecorder()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+httpapi.RouteAppDeployments,
			strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
		)
		request.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected app-spec-not-found 400, got %d with body %q", response.Code, response.Body.String())
		}
		appDeploymentIDERouteErrorCode(t, response, "app_spec_not_found")
	})

	t.Run("invalid app spec", func(t *testing.T) {
		fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(&appdefinition.AppDefinition{
			AppSpecPath: appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(),
		}))
		handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

		appSpecPath, err := appspec.MustForPlugin("setta-json-render-app-gen").ResolvePath(fixture.SettaFilesRoot, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
		if err != nil {
			t.Fatalf("resolve app spec path: %v", err)
		}
		if err := os.MkdirAll(filepath.Dir(appSpecPath), 0o755); err != nil {
			t.Fatalf("mkdir app spec dir: %v", err)
		}
		if err := os.WriteFile(appSpecPath, []byte("{not-json}\n"), 0o644); err != nil {
			t.Fatalf("write invalid app spec: %v", err)
		}

		response := httptest.NewRecorder()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+httpapi.RouteAppDeployments,
			strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
		)
		request.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected invalid-app-spec 400, got %d with body %q", response.Code, response.Body.String())
		}
		appDeploymentIDERouteErrorCode(t, response, "invalid_app_spec")
	})
}

func TestRegisterAppDeploymentIDERoutesRejectInvalidAppPublishPolicy(t *testing.T) {
	t.Parallel()

	fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(&appdefinition.AppDefinition{
		AppSpecPath: appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(),
	}))
	if err := appspec.MustForPlugin("setta-json-render-app-gen").Write(fixture.SettaFilesRoot, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(), map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}); err != nil {
		t.Fatalf("write app spec: %v", err)
	}

	handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+httpapi.RouteAppDeployments,
		strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha","appPolicyOverrides":{"runSnapshotMode":"never"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid policy 400, got %d with body %q", response.Code, response.Body.String())
	}
	appDeploymentIDERouteErrorCode(t, response, "invalid_deployment_policy")
}

func TestRegisterAppDeploymentIDERoutesMapCatalogReadErrors(t *testing.T) {
	t.Parallel()

	fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(nil))
	handler := newAppDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	tests := []struct {
		name            string
		path            string
		expectedCode    int
		expectedErrCode string
		expectedMessage string
		expectEmptyList bool
	}{
		{
			name:            "app versions missing deployment",
			path:            "/api/app/deployments/missing/versions",
			expectedCode:    http.StatusOK,
			expectEmptyList: true,
		},
		{
			name:            "app versions invalid deployment name",
			path:            "/api/app/deployments/%20/versions",
			expectedCode:    http.StatusBadRequest,
			expectedErrCode: "invalid_deployment_name",
			expectedMessage: deployments.ErrDeploymentNameRequired.Error(),
		},
		{
			name:            "app latest invalid deployment name",
			path:            "/api/app/deployments/%20/latest",
			expectedCode:    http.StatusBadRequest,
			expectedErrCode: "invalid_deployment_name",
			expectedMessage: deployments.ErrDeploymentNameRequired.Error(),
		},
		{
			name:            "app latest missing deployment",
			path:            "/api/app/deployments/missing/latest",
			expectedCode:    http.StatusNotFound,
			expectedErrCode: "not_found",
			expectedMessage: "App deployment not found: missing",
		},
	}

	for _, testCase := range tests {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, testCase.path, nil)
			handler.ServeHTTP(response, request)
			if response.Code != testCase.expectedCode {
				t.Fatalf("expected catalog read %d, got %d with body %q", testCase.expectedCode, response.Code, response.Body.String())
			}
			if testCase.expectEmptyList {
				var payload []httpapi.DeploymentMetadataResponse
				if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
					t.Fatalf("decode empty catalog list response: %v", err)
				}
				if len(payload) != 0 {
					t.Fatalf("expected empty catalog list, got %#v", payload)
				}
				return
			}
			appDeploymentIDERouteErrorCodeAndMessage(t, response, testCase.expectedErrCode, testCase.expectedMessage)
		})
	}
}

func TestRegisterAppDeploymentIDERoutesIsNotMountedOutsideIDEMode(t *testing.T) {
	t.Parallel()

	fixture := newAppDeploymentIDERouteFixture(t, appDeploymentIDERouteDocument(nil))
	handler := newAppDeploymentIDERouteTestHandler(t, config.ModeShare, fixture)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+httpapi.RouteAppDeployments, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected non-IDE app deployment route request to return 404, got %d with body %q", response.Code, response.Body.String())
	}
	appDeploymentIDERouteErrorCode(t, response, "not_found")
}

func buildAppDeploymentIDERouteRegistrationsForTest(
	deps httpapi.FrontendAPIRouteDependencies,
) httpapi.FrontendAPIRouteRegistrations {
	return httpapi.FrontendAPIRouteRegistrations{
		Deployment: []httpapi.FrontendAPIRouteContribution{
			{
				Family: "app deployment ide",
				Register: func(router chi.Router) error {
					return RegisterAppDeploymentIDERoutes(router, AppDeploymentIDERouteDependencies{
						ModePolicy:   deps.ShareDeploymentIDE.ModePolicy,
						ProjectState: deps.ShareDeploymentIDE.ProjectState,
						Catalog:      deps.ShareDeploymentIDE.Catalog,
					})
				},
			},
		},
	}
}

func newAppDeploymentIDERouteTestHandler(
	t *testing.T,
	mode config.Mode,
	fixture appDeploymentIDERouteFixture,
) http.Handler {
	t.Helper()

	handler, err := httpapi.NewHandler(httpapi.Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       pluginAppDeploymentIDERouteInfoService{},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := httpapi.RegisterShareDeploymentIDERoutes(r, httpapi.ShareDeploymentIDERouteDependencies{
				ModePolicy:     modes.NewPolicy(mode),
				ProjectState:   fixture.ProjectRuntime,
				Catalog:        fixture.Catalog,
				SharePublisher: fixture.SharePublisher,
			}); err != nil {
				t.Fatalf("register share deployment ide routes: %v", err)
			}
			if err := RegisterAppDeploymentIDERoutes(r, AppDeploymentIDERouteDependencies{
				ModePolicy:   modes.NewPolicy(mode),
				ProjectState: fixture.ProjectRuntime,
				Catalog:      fixture.Catalog,
				AppPublisher: fixture.AppPublisher,
			}); err != nil {
				t.Fatalf("register app deployment ide routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newAppDeploymentIDERouteFixture(
	t *testing.T,
	document projectstate.Document,
) appDeploymentIDERouteFixture {
	t.Helper()

	if document.SchemaVersion == 0 {
		document = appDeploymentIDERouteDocument(nil)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open app deployment ide project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close app deployment ide project runtime: %v", err)
		}
	})

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	publishedAt := time.Date(2026, 3, 8, 9, 0, 0, 0, time.UTC)

	catalogRoot, err := deployments.DefaultCatalogRoot(settaFilesRoot)
	if err != nil {
		t.Fatalf("default deployment catalog root: %v", err)
	}
	catalog, err := deployments.NewCatalog(deployments.CatalogOptions{Root: catalogRoot})
	if err != nil {
		t.Fatalf("new deployment catalog: %v", err)
	}
	sharePublisher, err := deployments.NewSharePublisher(deployments.SharePublisherOptions{
		Catalog:        catalog,
		SettaFilesRoot: settaFilesRoot,
		WorkspaceRoot:  workspaceRoot,
		Now: func() time.Time {
			return publishedAt
		},
	})
	if err != nil {
		t.Fatalf("new share publisher: %v", err)
	}
	appPublisher, err := NewAppPublishService(deployments.AppPublisherOptions{
		Catalog:        catalog,
		SettaFilesRoot: settaFilesRoot,
		WorkspaceRoot:  workspaceRoot,
		PackageProviderPlugin: func(targetRoot string) (deployments.AppProviderPackageState, error) {
			if err := plugins.CopyDirectoryTree(appDeploymentIDEProviderSourcePath(t), targetRoot); err != nil {
				return deployments.AppProviderPackageState{}, err
			}
			if err := plugins.EnsureRuntimeManagedPluginFrontendAssetsForRoot(targetRoot); err != nil {
				return deployments.AppProviderPackageState{}, err
			}
			return deployments.AppProviderPackageState{
				EnabledPluginIDs: []string{ProviderPluginID},
				PluginConfigByID: map[string]any{
					"workspace:" + ProviderPluginID: map[string]any{
						"theme": "ocean",
					},
				},
			}, nil
		},
		Now: func() time.Time {
			return publishedAt
		},
	}, ProviderPluginID)
	if err != nil {
		t.Fatalf("new app publisher: %v", err)
	}

	return appDeploymentIDERouteFixture{
		SettaFilesRoot: settaFilesRoot,
		WorkspaceRoot:  workspaceRoot,
		ProjectRuntime: projectRuntime,
		Catalog:        catalog,
		SharePublisher: sharePublisher,
		AppPublisher:   appPublisher,
		setPublishedAtFn: func(next time.Time) {
			publishedAt = next
		},
	}
}

func (f appDeploymentIDERouteFixture) setPublishedAt(next time.Time) {
	f.setPublishedAtFn(next)
}

func appDeploymentIDEProviderSourcePath(t *testing.T) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve app deployment IDE test path")
	}
	return filepath.Clean(
		filepath.Join(
			filepath.Dir(currentFile),
			"..",
			"..",
			"..",
			"plugins",
			ProviderPluginID,
		),
	)
}

func appDeploymentIDERouteErrorCode(t *testing.T, response *httptest.ResponseRecorder, code string) {
	t.Helper()
	appDeploymentIDERouteErrorCodeAndMessage(t, response, code, "")
}

func appDeploymentIDERouteErrorCodeAndMessage(
	t *testing.T,
	response *httptest.ResponseRecorder,
	code string,
	message string,
) {
	t.Helper()

	var payload struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app deployment ide error response: %v", err)
	}
	if payload.Error.Code != code {
		t.Fatalf("expected error code %q, got %#v", code, payload)
	}
	if message != "" && payload.Error.Message != message {
		t.Fatalf("expected error message %q, got %#v", message, payload)
	}
}

func appDeploymentIDERouteDocument(appDefinition *appdefinition.AppDefinition) projectstate.Document {
	return withStoredDocumentAppDefinition(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}, encodeAppDeploymentIDERouteAppDefinition(appDefinition))
}

func encodeAppDeploymentIDERouteAppDefinition(
	appDefinition *appdefinition.AppDefinition,
) projectstate.RawJSON {
	if appDefinition == nil {
		return nil
	}
	encoded, err := json.Marshal(appDefinition)
	if err != nil {
		panic(err)
	}
	return projectstate.RawJSON(encoded)
}
