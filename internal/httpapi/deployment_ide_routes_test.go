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
	"setta/internal/appspec"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

type deploymentIDERouteFixture struct {
	SettaFilesRoot   string
	WorkspaceRoot    string
	ProjectRuntime   *projectstate.Runtime
	Catalog          *deployments.Catalog
	SharePublisher   *deployments.SharePublisher
	AppPublisher     *deployments.AppPublisher
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

	var firstPayload deploymentMetadataResponse
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

	var secondPayload deploymentMetadataResponse
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

	var versionsPayload []deploymentMetadataResponse
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

	var latestPayload deploymentMetadataResponse
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

	var listPayload []deploymentMetadataResponse
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

	var payload deploymentMetadataResponse
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
			if err := RegisterDeploymentIDERoutes(r, DeploymentIDERouteDependencies{
				ModePolicy:     modes.NewPolicy(mode),
				ProjectState:   fixture.ProjectRuntime,
				Catalog:        fixture.Catalog,
				SharePublisher: fixture.SharePublisher,
				AppPublisher:   fixture.AppPublisher,
			}); err != nil {
				t.Fatalf("register deployment ide routes: %v", err)
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
		Catalog:        catalog,
		SettaFilesRoot: settaFilesRoot,
		WorkspaceRoot:  workspaceRoot,
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

func (f deploymentIDERouteFixture) setPublishedAt(next time.Time) {
	f.setPublishedAtFn(next)
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
