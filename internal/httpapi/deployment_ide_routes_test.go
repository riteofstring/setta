package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

type deploymentIDERouteFixture struct {
	SettaFilesRoot   string
	WorkspaceRoot    string
	ProjectRuntime   *projectstate.Runtime
	Catalog          *deployments.Catalog
	SharePublisher   deployments.SharePublishService
	AppPublisher     deployments.AppPublishService
	setPublishedAtFn func(time.Time)
}

func TestRegisterDeploymentIDERoutesPublishesShareDeploymentsAndListsLatestVersions(t *testing.T) {
	t.Parallel()

	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
	listenerPath := filepath.Join(fixture.WorkspaceRoot, "listeners", "app.py")
	if err := os.MkdirAll(filepath.Dir(listenerPath), 0o755); err != nil {
		t.Fatalf("mkdir listener path: %v", err)
	}
	if err := os.WriteFile(listenerPath, []byte("print('listener')\n"), 0o644); err != nil {
		t.Fatalf("write listener source: %v", err)
	}

	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	fixture.setPublishedAt(time.Date(2026, 3, 8, 10, 0, 0, 0, time.UTC))
	firstResponse := httptest.NewRecorder()
	firstRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteShareDeployments,
		strings.NewReader(`{"deploymentName":"demo-share","projectConfigId":"project-alpha","sharePolicyOverrides":{"allowRun":true,"runSnapshotMode":"always"},"listenerEntrypoint":"listeners/app.py","listenerEnabled":false}`),
	)
	firstRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(firstResponse, firstRequest)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first share publish 200, got %d with body %q", firstResponse.Code, firstResponse.Body.String())
	}

	var firstPayload DeploymentMetadataResponse
	if err := json.Unmarshal(firstResponse.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("decode first share publish payload: %v", err)
	}
	if firstPayload.DeploymentVersion != "v1" {
		t.Fatalf("expected first share deployment version v1, got %q", firstPayload.DeploymentVersion)
	}

	firstManifest, err := deployments.LoadManifest(firstPayload.DeploymentRoot)
	if err != nil {
		t.Fatalf("load first share manifest: %v", err)
	}
	if firstManifest.Listener == nil || firstManifest.Listener.Enabled {
		t.Fatalf("expected disabled listener config in first manifest, got %#v", firstManifest.Listener)
	}
	if firstManifest.Listener.Entrypoint != "listener/app.py" {
		t.Fatalf("expected first share listener entrypoint listener/app.py, got %q", firstManifest.Listener.Entrypoint)
	}
	firstListenerContent, err := os.ReadFile(filepath.Join(firstPayload.DeploymentRoot, "listener", "app.py"))
	if err != nil {
		t.Fatalf("read first copied share listener entrypoint: %v", err)
	}
	if string(firstListenerContent) != "print('listener')\n" {
		t.Fatalf("unexpected first copied share listener content %q", string(firstListenerContent))
	}
	firstPolicy, err := deployments.LoadPolicy(firstPayload.DeploymentRoot)
	if err != nil {
		t.Fatalf("load first share policy: %v", err)
	}
	if !firstPolicy.AllowRun || firstPolicy.RunSnapshotMode != deployments.RunSnapshotModeAlways {
		t.Fatalf("expected first share policy override to persist, got %#v", firstPolicy)
	}

	fixture.setPublishedAt(time.Date(2026, 3, 8, 11, 0, 0, 0, time.UTC))
	secondResponse := httptest.NewRecorder()
	secondRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteShareDeployments,
		strings.NewReader(`{"deploymentName":"demo-share","projectConfigId":"project-alpha"}`),
	)
	secondRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(secondResponse, secondRequest)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second share publish 200, got %d with body %q", secondResponse.Code, secondResponse.Body.String())
	}

	var secondPayload DeploymentMetadataResponse
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("decode second share publish payload: %v", err)
	}
	if secondPayload.DeploymentVersion != "v2" {
		t.Fatalf("expected second share deployment version v2, got %q", secondPayload.DeploymentVersion)
	}

	versionsResponse := httptest.NewRecorder()
	versionsRequest := httptest.NewRequest(http.MethodGet, "/api/share/deployments/demo-share/versions", nil)
	handler.ServeHTTP(versionsResponse, versionsRequest)
	if versionsResponse.Code != http.StatusOK {
		t.Fatalf("expected share versions 200, got %d with body %q", versionsResponse.Code, versionsResponse.Body.String())
	}

	var versionsPayload []DeploymentMetadataResponse
	if err := json.Unmarshal(versionsResponse.Body.Bytes(), &versionsPayload); err != nil {
		t.Fatalf("decode share versions payload: %v", err)
	}
	if len(versionsPayload) != 2 {
		t.Fatalf("expected two share versions, got %#v", versionsPayload)
	}
	if versionsPayload[0].DeploymentVersion != "v2" || versionsPayload[1].DeploymentVersion != "v1" {
		t.Fatalf("expected newest-first share versions, got %#v", versionsPayload)
	}

	latestResponse := httptest.NewRecorder()
	latestRequest := httptest.NewRequest(http.MethodGet, "/api/share/deployments/demo-share/latest", nil)
	handler.ServeHTTP(latestResponse, latestRequest)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected share latest 200, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var latestPayload DeploymentMetadataResponse
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &latestPayload); err != nil {
		t.Fatalf("decode share latest payload: %v", err)
	}
	if latestPayload.DeploymentVersion != "v2" {
		t.Fatalf("expected latest share deployment version v2, got %q", latestPayload.DeploymentVersion)
	}

	listResponse := httptest.NewRecorder()
	listRequest := httptest.NewRequest(http.MethodGet, "/api"+RouteShareDeployments, nil)
	handler.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected share list 200, got %d with body %q", listResponse.Code, listResponse.Body.String())
	}

	var listPayload []DeploymentMetadataResponse
	if err := json.Unmarshal(listResponse.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("decode share list payload: %v", err)
	}
	if len(listPayload) != 2 {
		t.Fatalf("expected two share list entries, got %#v", listPayload)
	}
	if listPayload[0].DeploymentVersion != "v2" || listPayload[1].DeploymentVersion != "v1" {
		t.Fatalf("expected newest-first share list entries, got %#v", listPayload)
	}
}

func TestRegisterDeploymentIDERoutesSharePublishUsesLatestRuntimeSnapshot(t *testing.T) {
	t.Parallel()

	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
	storePath := filepath.Join(t.TempDir(), projectstate.MainFileName)
	store, err := projectstate.NewStore(storePath, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new persisted project store: %v", err)
	}
	if err := store.Save(context.Background(), deploymentIDERouteDocument(nil)); err != nil {
		t.Fatalf("seed persisted project store: %v", err)
	}

	persistedRuntime, err := projectstate.OpenRuntimeWithOptions(context.Background(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open persisted project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := persistedRuntime.Close(); err != nil {
			t.Fatalf("close persisted project runtime: %v", err)
		}
	})
	fixture.ProjectRuntime = persistedRuntime

	if _, err := fixture.ProjectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.ShowParamDisplayNames = true
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("mutate runtime snapshot: %v", err)
	}
	persistedDocument, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted project store: %v", err)
	}
	if persistedDocument.Projects["project-alpha"].ShowParamDisplayNames {
		t.Fatal("did not expect unsaved runtime mutation to reach the persisted project store")
	}

	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteShareDeployments,
		strings.NewReader(`{"deploymentName":"demo-share","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected share publish 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload DeploymentMetadataResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share publish payload: %v", err)
	}

	publishedStore, err := projectstate.NewStore(filepath.Join(payload.DeploymentRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open published share store: %v", err)
	}
	document, err := publishedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load published share document: %v", err)
	}
	if !document.Projects["project-alpha"].ShowParamDisplayNames {
		t.Fatal("expected share publish route to persist the latest runtime mutation")
	}
}

func TestRegisterDeploymentIDERoutesPublishesAppDeployment(t *testing.T) {
	t.Parallel()

	appSpecPath := appspec.DefaultPath()
	appSpecPayload := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(&projectstate.AppDefinition{
		AppSpecPath: appSpecPath,
	}))
	if err := appspec.Write(fixture.SettaFilesRoot, appSpecPath, appSpecPayload); err != nil {
		t.Fatalf("write app spec: %v", err)
	}

	listenerPath := filepath.Join(fixture.WorkspaceRoot, "listeners", "app.py")
	if err := os.MkdirAll(filepath.Dir(listenerPath), 0o755); err != nil {
		t.Fatalf("mkdir app listener path: %v", err)
	}
	if err := os.WriteFile(listenerPath, []byte("print('listener')\n"), 0o644); err != nil {
		t.Fatalf("write app listener source: %v", err)
	}

	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	fixture.setPublishedAt(time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppDeployments,
		strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha","appPolicyOverrides":{"allowRun":false},"listenerEntrypoint":"listeners/app.py"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected app publish 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload DeploymentMetadataResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app publish payload: %v", err)
	}
	if payload.DeploymentVersion != "v1" {
		t.Fatalf("expected app deployment version v1, got %q", payload.DeploymentVersion)
	}

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

	policy, err := deployments.LoadPolicy(payload.DeploymentRoot)
	if err != nil {
		t.Fatalf("load app policy: %v", err)
	}
	if policy.AllowRun {
		t.Fatalf("expected app policy allowRun override false, got %#v", policy)
	}

	store, err := projectstate.NewStore(filepath.Join(payload.DeploymentRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open published app store: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load published app document: %v", err)
	}
	if document.AppDefinition == nil {
		t.Fatal("expected published app definition")
	}
	if document.AppDefinition.AppSpecPath != appSpecPath {
		t.Fatalf("expected published app spec path %q, got %q", appSpecPath, document.AppDefinition.AppSpecPath)
	}

	publishedSpec, err := appspec.Read(payload.DeploymentRoot, appSpecPath)
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

	fixture.setPublishedAt(time.Date(2026, 3, 8, 13, 0, 0, 0, time.UTC))
	secondResponse := httptest.NewRecorder()
	secondRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppDeployments,
		strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
	)
	secondRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(secondResponse, secondRequest)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second app publish 200, got %d with body %q", secondResponse.Code, secondResponse.Body.String())
	}

	var secondPayload DeploymentMetadataResponse
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("decode second app publish payload: %v", err)
	}
	if secondPayload.DeploymentVersion != "v2" {
		t.Fatalf("expected second app deployment version v2, got %q", secondPayload.DeploymentVersion)
	}

	versionsResponse := httptest.NewRecorder()
	versionsRequest := httptest.NewRequest(http.MethodGet, "/api/app/deployments/demo-app/versions", nil)
	handler.ServeHTTP(versionsResponse, versionsRequest)
	if versionsResponse.Code != http.StatusOK {
		t.Fatalf("expected app versions 200, got %d with body %q", versionsResponse.Code, versionsResponse.Body.String())
	}

	var versionsPayload []DeploymentMetadataResponse
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

	var latestPayload DeploymentMetadataResponse
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &latestPayload); err != nil {
		t.Fatalf("decode app latest payload: %v", err)
	}
	if latestPayload.DeploymentVersion != "v2" {
		t.Fatalf("expected latest app deployment version v2, got %q", latestPayload.DeploymentVersion)
	}

	listResponse := httptest.NewRecorder()
	listRequest := httptest.NewRequest(http.MethodGet, "/api"+RouteAppDeployments, nil)
	handler.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected app list 200, got %d with body %q", listResponse.Code, listResponse.Body.String())
	}

	var listPayload []DeploymentMetadataResponse
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

func TestRegisterDeploymentIDERoutesLatestRoutesFilterByDeploymentType(t *testing.T) {
	t.Parallel()

	appSpecPath := appspec.DefaultPath()
	appSpecPayload := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(&projectstate.AppDefinition{
		AppSpecPath: appSpecPath,
	}))
	if err := appspec.Write(fixture.SettaFilesRoot, appSpecPath, appSpecPayload); err != nil {
		t.Fatalf("write app spec: %v", err)
	}

	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	fixture.setPublishedAt(time.Date(2026, 3, 8, 14, 0, 0, 0, time.UTC))
	shareResponse := httptest.NewRecorder()
	shareRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteShareDeployments,
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
		"/api"+RouteAppDeployments,
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
	deploymentIDERouteErrorCode(t, shareLatestResponse, "not_found")
	if !strings.Contains(shareLatestResponse.Body.String(), "Share deployment not found") {
		t.Fatalf("expected share latest route to explain missing share deployment, got %q", shareLatestResponse.Body.String())
	}

	appLatestResponse := httptest.NewRecorder()
	appLatestRequest := httptest.NewRequest(http.MethodGet, "/api/app/deployments/demo-collision/latest", nil)
	handler.ServeHTTP(appLatestResponse, appLatestRequest)
	if appLatestResponse.Code != http.StatusOK {
		t.Fatalf("expected app latest 200, got %d with body %q", appLatestResponse.Code, appLatestResponse.Body.String())
	}

	var appLatestPayload DeploymentMetadataResponse
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

func TestRegisterDeploymentIDERoutesRejectUnknownFieldsOnPublish(t *testing.T) {
	t.Parallel()

	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	tests := []struct {
		name string
		path string
		body string
	}{
		{
			name: "share publish",
			path: "/api" + RouteShareDeployments,
			body: `{"deploymentName":"demo-share","projectConfigId":"project-alpha","unexpected":true}`,
		},
		{
			name: "app publish",
			path: "/api" + RouteAppDeployments,
			body: `{"deploymentName":"demo-app","projectConfigId":"project-alpha","unexpected":true}`,
		},
	}

	for _, testCase := range tests {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, testCase.path, strings.NewReader(testCase.body))
			request.Header.Set("Content-Type", "application/json")
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected invalid publish payload 400, got %d with body %q", response.Code, response.Body.String())
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode invalid publish response: %v", err)
			}
			if payload.Error.Code != "invalid_json" {
				t.Fatalf("expected invalid_json error code, got %#v", payload)
			}
		})
	}
}

func TestRegisterDeploymentIDERoutesRejectMalformedPublishJSON(t *testing.T) {
	t.Parallel()

	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	tests := []struct {
		name string
		path string
		body string
	}{
		{
			name: "share publish",
			path: "/api" + RouteShareDeployments,
			body: `{"deploymentName":`,
		},
		{
			name: "app publish",
			path: "/api" + RouteAppDeployments,
			body: `{"deploymentName":`,
		},
	}

	for _, testCase := range tests {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, testCase.path, strings.NewReader(testCase.body))
			request.Header.Set("Content-Type", "application/json")
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected malformed publish payload 400, got %d with body %q", response.Code, response.Body.String())
			}
			deploymentIDERouteErrorCode(t, response, "invalid_json")
		})
	}
}

func TestRegisterDeploymentIDERoutesMapSharePublishValidationErrors(t *testing.T) {
	t.Parallel()

	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	for _, testCase := range []struct {
		name         string
		body         string
		expectedCode int
		errorCode    string
	}{
		{
			name:         "missing project config",
			body:         `{"deploymentName":"demo-share","projectConfigId":"missing-project"}`,
			expectedCode: http.StatusNotFound,
			errorCode:    "project_config_not_found",
		},
		{
			name:         "invalid deployment name",
			body:         `{"deploymentName":"demo/share","projectConfigId":"project-alpha"}`,
			expectedCode: http.StatusBadRequest,
			errorCode:    "invalid_deployment_name",
		},
		{
			name:         "invalid deployment policy",
			body:         `{"deploymentName":"demo-share","projectConfigId":"project-alpha","sharePolicyOverrides":{"runSnapshotMode":"never"}}`,
			expectedCode: http.StatusBadRequest,
			errorCode:    "invalid_deployment_policy",
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api"+RouteShareDeployments, strings.NewReader(testCase.body))
			request.Header.Set("Content-Type", "application/json")
			handler.ServeHTTP(response, request)
			if response.Code != testCase.expectedCode {
				t.Fatalf("expected share publish %d, got %d with body %q", testCase.expectedCode, response.Code, response.Body.String())
			}
			deploymentIDERouteErrorCode(t, response, testCase.errorCode)
		})
	}

	entries, err := fixture.Catalog.List(context.Background(), deployments.TypeShare)
	if err != nil {
		t.Fatalf("list share deployments after rejected publishes: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected rejected share publishes to leave the catalog empty, got %#v", entries)
	}
}

func TestRegisterDeploymentIDERoutesMapAppPublishValidationErrors(t *testing.T) {
	t.Parallel()

	t.Run("app definition required", func(t *testing.T) {
		fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
		handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

		response := httptest.NewRecorder()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteAppDeployments,
			strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
		)
		request.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected app-definition-required 400, got %d with body %q", response.Code, response.Body.String())
		}
		deploymentIDERouteErrorCode(t, response, "app_definition_required")
	})

	t.Run("app spec path required", func(t *testing.T) {
		fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(&projectstate.AppDefinition{}))
		handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

		response := httptest.NewRecorder()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteAppDeployments,
			strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
		)
		request.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected app-spec-path-required 400, got %d with body %q", response.Code, response.Body.String())
		}
		deploymentIDERouteErrorCode(t, response, "app_spec_path_required")
	})

	t.Run("app spec not found", func(t *testing.T) {
		fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(&projectstate.AppDefinition{
			AppSpecPath: appspec.DefaultPath(),
		}))
		handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

		response := httptest.NewRecorder()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteAppDeployments,
			strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
		)
		request.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected app-spec-not-found 400, got %d with body %q", response.Code, response.Body.String())
		}
		deploymentIDERouteErrorCode(t, response, "app_spec_not_found")
	})

	t.Run("invalid app spec", func(t *testing.T) {
		fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(&projectstate.AppDefinition{
			AppSpecPath: appspec.DefaultPath(),
		}))
		handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

		appSpecPath, err := appspec.ResolvePath(fixture.SettaFilesRoot, appspec.DefaultPath())
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
			"/api"+RouteAppDeployments,
			strings.NewReader(`{"deploymentName":"demo-app","projectConfigId":"project-alpha"}`),
		)
		request.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected invalid-app-spec 400, got %d with body %q", response.Code, response.Body.String())
		}
		deploymentIDERouteErrorCode(t, response, "invalid_app_spec")
	})
}

func TestRegisterDeploymentIDERoutesMapCatalogReadErrors(t *testing.T) {
	t.Parallel()

	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	tests := []struct {
		name            string
		path            string
		expectedCode    int
		expectedErrCode string
		expectedMessage string
		expectEmptyList bool
	}{
		{
			name:            "share versions missing deployment",
			path:            "/api/share/deployments/missing/versions",
			expectedCode:    http.StatusOK,
			expectEmptyList: true,
		},
		{
			name:            "app versions missing deployment",
			path:            "/api/app/deployments/missing/versions",
			expectedCode:    http.StatusOK,
			expectEmptyList: true,
		},
		{
			name:            "share versions invalid deployment name",
			path:            "/api/share/deployments/%20/versions",
			expectedCode:    http.StatusBadRequest,
			expectedErrCode: "invalid_deployment_name",
			expectedMessage: deployments.ErrDeploymentNameRequired.Error(),
		},
		{
			name:            "app versions invalid deployment name",
			path:            "/api/app/deployments/%20/versions",
			expectedCode:    http.StatusBadRequest,
			expectedErrCode: "invalid_deployment_name",
			expectedMessage: deployments.ErrDeploymentNameRequired.Error(),
		},
		{
			name:            "share latest invalid deployment name",
			path:            "/api/share/deployments/%20/latest",
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
			name:            "share latest missing deployment",
			path:            "/api/share/deployments/missing/latest",
			expectedCode:    http.StatusNotFound,
			expectedErrCode: "not_found",
			expectedMessage: "Share deployment not found: missing",
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
				var payload []DeploymentMetadataResponse
				if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
					t.Fatalf("decode empty catalog list response: %v", err)
				}
				if len(payload) != 0 {
					t.Fatalf("expected empty catalog list, got %#v", payload)
				}
				return
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode catalog error response: %v", err)
			}
			if payload.Error.Code != testCase.expectedErrCode {
				t.Fatalf("expected error code %q, got %#v", testCase.expectedErrCode, payload)
			}
			if payload.Error.Message != testCase.expectedMessage {
				t.Fatalf("expected error message %q, got %#v", testCase.expectedMessage, payload)
			}
		})
	}
}

func TestRegisterDeploymentIDERoutesIsNotMountedOutsideIDEMode(t *testing.T) {
	t.Parallel()

	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
	handler := newDeploymentIDERouteTestHandler(t, config.ModeShare, fixture)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteShareDeployments, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected share-mode IDE route request to return 404, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode not found payload: %v", err)
	}
	if payload.Error.Code != "not_found" {
		t.Fatalf("expected not_found error code, got %q", payload.Error.Code)
	}
}

func newDeploymentIDERouteTestHandler(t *testing.T, mode config.Mode, fixture deploymentIDERouteFixture) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info: stubInfoService{
			mode: string(mode),
			info: RuntimeInfo{Mode: string(mode)},
		},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterShareDeploymentIDERoutes(r, ShareDeploymentIDERouteDependencies{
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

func newDeploymentIDERouteFixture(t *testing.T, document projectstate.Document) deploymentIDERouteFixture {
	t.Helper()

	if document.SchemaVersion == 0 {
		document = deploymentIDERouteDocument(nil)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open deployment ide project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close deployment ide project runtime: %v", err)
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
	appPublisher, err := deployments.NewAppPublisher(deployments.AppPublisherOptions{
		Catalog:              catalog,
		SettaFilesRoot:       settaFilesRoot,
		WorkspaceRoot:        workspaceRoot,
		AppDefinitionService: deploymentIDETestAppDefinitionService{runtime: projectRuntime},
		Now: func() time.Time {
			return publishedAt
		},
	})
	if err != nil {
		t.Fatalf("new app publisher: %v", err)
	}

	return deploymentIDERouteFixture{
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

type deploymentIDETestAppDefinitionService struct {
	runtime *projectstate.Runtime
}

func (s deploymentIDETestAppDefinitionService) GetAppDefinition(_ context.Context) (projectstate.AppDefinitionReadResult, error) {
	return projectstate.AppDefinitionReadResult{}, nil
}

func (s deploymentIDETestAppDefinitionService) GetEffectiveAppDefinition(_ context.Context) (projectstate.AppDefinition, error) {
	return projectstate.AppDefinition{}, nil
}

func (s deploymentIDETestAppDefinitionService) GetEffectiveAppSpecPath(_ context.Context) (string, error) {
	return "", nil
}

func (s deploymentIDETestAppDefinitionService) GetEffectiveAppThemeMode(_ context.Context) (string, error) {
	return "", nil
}

func (s deploymentIDETestAppDefinitionService) ValidateAppDefinition(
	_ context.Context,
	input projectstate.ValidateAppDefinitionInput,
) (projectstate.AppDefinitionValidationResult, error) {
	current := projectstate.AppDefinition{}
	if s.runtime != nil && s.runtime.Snapshot().Document.AppDefinition != nil {
		current = s.runtime.Snapshot().Document.AppDefinition.Clone()
	}
	if strings.TrimSpace(current.AppSpecVersion) == "" {
		current.AppSpecVersion = "v1"
	}
	if strings.TrimSpace(current.CatalogID) == "" {
		current.CatalogID = appspec.DefaultCatalogID
	}

	definition, err := deploymentIDETestAppspecDefinition(current)
	if err != nil {
		return projectstate.AppDefinitionValidationResult{}, err
	}
	validationErrors, warnings := appspec.ValidateDefinitionPayload(input.AppSpec, definition)
	if validationErrors == nil {
		validationErrors = []appspec.AppValidationIssue{}
	}
	if warnings == nil {
		warnings = []appspec.AppValidationIssue{}
	}
	return projectstate.AppDefinitionValidationResult{
		Errors:       deploymentIDETestValidationIssues(validationErrors),
		Warnings:     deploymentIDETestValidationIssues(warnings),
		Capabilities: deploymentIDETestValidationCapabilities(appspec.BuildCapabilities(definition)),
	}, nil
}

func (s deploymentIDETestAppDefinitionService) SetAppDefinition(_ context.Context, _ projectstate.SetAppDefinitionInput) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, nil
}

func (s deploymentIDETestAppDefinitionService) StreamAppDefinition(_ context.Context, _ projectstate.StreamAppDefinitionInput) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, nil
}

func (s deploymentIDETestAppDefinitionService) UpdateAppDefinition(_ context.Context, _ any) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, nil
}

func (s deploymentIDETestAppDefinitionService) CompareAndSetAppDefinitionCatalogID(_ context.Context, _ string, _ *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, nil
}

func (s deploymentIDETestAppDefinitionService) CompareAndSetAppDefinitionSpecVersion(_ context.Context, _ string, _ *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, nil
}

func (s deploymentIDETestAppDefinitionService) CompareAndSetAppDefinitionSpecPath(_ context.Context, _ string, _ *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, nil
}

func (s deploymentIDETestAppDefinitionService) CompareAndSetAppDefinitionThemeMode(_ context.Context, _ string, _ *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, nil
}

func deploymentIDETestValidationIssues(
	issues []appspec.AppValidationIssue,
) []projectstate.AppDefinitionValidationIssue {
	if len(issues) == 0 {
		return []projectstate.AppDefinitionValidationIssue{}
	}
	converted := make([]projectstate.AppDefinitionValidationIssue, 0, len(issues))
	for _, issue := range issues {
		converted = append(converted, projectstate.AppDefinitionValidationIssue{
			Message:     issue.Message,
			ElementKey:  issue.ElementKey,
			ElementType: issue.ElementType,
		})
	}
	return converted
}

func deploymentIDETestValidationCapabilities(
	capabilities appspec.AppCapabilities,
) projectstate.AppDefinitionCapabilities {
	features := make(map[string]bool, len(capabilities.Features))
	for key, enabled := range capabilities.Features {
		features[key] = enabled
	}
	return projectstate.AppDefinitionCapabilities{
		CatalogID:          capabilities.CatalogID,
		CatalogVersion:     capabilities.CatalogVersion,
		AppSpecVersion:     capabilities.AppSpecVersion,
		ThemeSchemaVersion: capabilities.ThemeSchemaVersion,
		Features:           features,
	}
}

func deploymentIDETestAppspecDefinition(definition projectstate.AppDefinition) (appspec.Definition, error) {
	dataBindings, err := deploymentIDETestDecodeJSONObject(definition.DataBindings, "appDefinition.dataBindings")
	if err != nil {
		return appspec.Definition{}, err
	}
	actions, err := deploymentIDETestDecodeJSONObject(definition.Actions, "appDefinition.actions")
	if err != nil {
		return appspec.Definition{}, err
	}
	theme, err := deploymentIDETestDecodeJSONObject(definition.Theme, "appDefinition.theme")
	if err != nil {
		return appspec.Definition{}, err
	}
	assets, err := deploymentIDETestDecodeJSONArray(definition.Assets, "appDefinition.assets")
	if err != nil {
		return appspec.Definition{}, err
	}
	return appspec.Definition{
		AppSpecVersion: definition.AppSpecVersion,
		CatalogID:      definition.CatalogID,
		ActionMap:      actions,
		DataBindings:   dataBindings,
		Theme:          theme,
		Assets:         assets,
	}, nil
}

func deploymentIDETestDecodeJSONObject(raw projectstate.RawJSON, field string) (map[string]any, error) {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil, nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	if value == nil {
		return nil, nil
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, nil
	}
	return object, nil
}

func deploymentIDETestDecodeJSONArray(raw projectstate.RawJSON, field string) ([]any, error) {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil, nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	if value == nil {
		return nil, nil
	}
	array, ok := value.([]any)
	if !ok {
		return nil, nil
	}
	return array, nil
}

func (f deploymentIDERouteFixture) setPublishedAt(next time.Time) {
	f.setPublishedAtFn(next)
}

func deploymentIDERouteErrorCode(t *testing.T, response *httptest.ResponseRecorder, code string) {
	t.Helper()

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode deployment ide error response: %v", err)
	}
	if payload.Error.Code != code {
		t.Fatalf("expected error code %q, got %#v", code, payload)
	}
}

func deploymentIDERouteDocument(appDefinition *projectstate.AppDefinition) projectstate.Document {
	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		AppDefinition:    appDefinition,
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
}
