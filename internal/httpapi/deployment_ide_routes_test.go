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
	appdefinition "setta/internal/appsubsystem/appdefinition"
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
	SharePublisher   deployments.SharePublishService
	setPublishedAtFn func(time.Time)
}

func TestRegisterDeploymentIDERoutesPublishesShareDeploymentsAndListsLatestVersions(t *testing.T) {
	t.Parallel()

	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
	writeDeploymentIDERouteListener(t, fixture.WorkspaceRoot)
	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	firstPayload := publishDeploymentIDERouteShare(
		t,
		fixture,
		handler,
		time.Date(2026, 3, 8, 10, 0, 0, 0, time.UTC),
		`{"deploymentName":"demo-share","projectConfigId":"project-alpha","sharePolicyOverrides":{"allowRun":true,"runSnapshotMode":"always"},"listenerEntrypoint":"listeners/app.py","listenerEnabled":false}`,
		"v1",
	)
	assertDeploymentIDERouteFirstShareArtifacts(t, firstPayload)

	publishDeploymentIDERouteShare(
		t,
		fixture,
		handler,
		time.Date(2026, 3, 8, 11, 0, 0, 0, time.UTC),
		`{"deploymentName":"demo-share","projectConfigId":"project-alpha"}`,
		"v2",
	)
	assertDeploymentIDERouteMetadataList(t, handler, "/api/share/deployments/demo-share/versions", "share versions")
	assertDeploymentIDERouteLatestMetadata(t, handler, "/api/share/deployments/demo-share/latest")
	assertDeploymentIDERouteMetadataList(t, handler, "/api"+RouteShareDeployments, "share list")
}

func writeDeploymentIDERouteListener(t *testing.T, workspaceRoot string) {
	t.Helper()

	listenerPath := filepath.Join(workspaceRoot, "listeners", "app.py")
	if err := os.MkdirAll(filepath.Dir(listenerPath), 0o755); err != nil {
		t.Fatalf("mkdir listener path: %v", err)
	}
	if err := os.WriteFile(listenerPath, []byte("print('listener')\n"), 0o644); err != nil {
		t.Fatalf("write listener source: %v", err)
	}
}

func publishDeploymentIDERouteShare(
	t *testing.T,
	fixture deploymentIDERouteFixture,
	handler http.Handler,
	publishedAt time.Time,
	body string,
	expectedVersion string,
) DeploymentMetadataResponse {
	t.Helper()

	fixture.setPublishedAt(publishedAt)
	response := deploymentIDERouteJSONRequest(t, handler, http.MethodPost, "/api"+RouteShareDeployments, body)
	if response.Code != http.StatusOK {
		t.Fatalf("expected share publish 200, got %d with body %q", response.Code, response.Body.String())
	}
	payload := decodeDeploymentIDERouteMetadata(t, response, "share publish")
	if payload.DeploymentVersion != expectedVersion {
		t.Fatalf("expected share deployment version %s, got %q", expectedVersion, payload.DeploymentVersion)
	}
	return payload
}

func deploymentIDERouteJSONRequest(t *testing.T, handler http.Handler, method string, path string, body string) *httptest.ResponseRecorder {
	t.Helper()

	response := httptest.NewRecorder()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	return response
}

func decodeDeploymentIDERouteMetadata(t *testing.T, response *httptest.ResponseRecorder, label string) DeploymentMetadataResponse {
	t.Helper()

	var payload DeploymentMetadataResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode %s payload: %v", label, err)
	}
	return payload
}

func assertDeploymentIDERouteFirstShareArtifacts(t *testing.T, payload DeploymentMetadataResponse) {
	t.Helper()

	manifest, err := deployments.LoadManifest(payload.DeploymentRoot)
	if err != nil {
		t.Fatalf("load first share manifest: %v", err)
	}
	if manifest.Listener == nil || manifest.Listener.Enabled {
		t.Fatalf("expected disabled listener config in first manifest, got %#v", manifest.Listener)
	}
	if manifest.Listener.Entrypoint != "listener/app.py" {
		t.Fatalf("expected first share listener entrypoint listener/app.py, got %q", manifest.Listener.Entrypoint)
	}
	listenerContent, err := os.ReadFile(filepath.Join(payload.DeploymentRoot, "listener", "app.py"))
	if err != nil {
		t.Fatalf("read first copied share listener entrypoint: %v", err)
	}
	if string(listenerContent) != "print('listener')\n" {
		t.Fatalf("unexpected first copied share listener content %q", string(listenerContent))
	}
	policy, err := deployments.LoadPolicy(payload.DeploymentRoot)
	if err != nil {
		t.Fatalf("load first share policy: %v", err)
	}
	if !policy.AllowRun || policy.RunSnapshotMode != deployments.RunSnapshotModeAlways {
		t.Fatalf("expected first share policy override to persist, got %#v", policy)
	}
}

func assertDeploymentIDERouteMetadataList(t *testing.T, handler http.Handler, path string, label string) {
	t.Helper()

	response := deploymentIDERouteJSONRequest(t, handler, http.MethodGet, path, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected %s 200, got %d with body %q", label, response.Code, response.Body.String())
	}
	var payload []DeploymentMetadataResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode %s payload: %v", label, err)
	}
	if len(payload) != 2 {
		t.Fatalf("expected two %s entries, got %#v", label, payload)
	}
	if payload[0].DeploymentVersion != "v2" || payload[1].DeploymentVersion != "v1" {
		t.Fatalf("expected newest-first %s entries, got %#v", label, payload)
	}
}

func assertDeploymentIDERouteLatestMetadata(t *testing.T, handler http.Handler, path string) {
	t.Helper()

	response := deploymentIDERouteJSONRequest(t, handler, http.MethodGet, path, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected share latest 200, got %d with body %q", response.Code, response.Body.String())
	}
	payload := decodeDeploymentIDERouteMetadata(t, response, "share latest")
	if payload.DeploymentVersion != "v2" {
		t.Fatalf("expected latest share deployment version v2, got %q", payload.DeploymentVersion)
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

func TestDeploymentTypeLabelUsesGenericTypeNames(t *testing.T) {
	t.Parallel()

	if got := deploymentTypeLabel(deployments.TypeShare); got != "Share" {
		t.Fatalf("expected Share label, got %q", got)
	}
	if got := deploymentTypeLabel(deployments.Type("plugin-app")); got != "Plugin-app" {
		t.Fatalf("expected generic plugin label, got %q", got)
	}
}

func TestRegisterDeploymentIDERoutesRejectUnknownFieldsOnSharePublish(t *testing.T) {
	t.Parallel()

	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteShareDeployments,
		strings.NewReader(`{"deploymentName":"demo-share","projectConfigId":"project-alpha","unexpected":true}`),
	)
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
}

func TestRegisterDeploymentIDERoutesRejectMalformedSharePublishJSON(t *testing.T) {
	t.Parallel()

	fixture := newDeploymentIDERouteFixture(t, deploymentIDERouteDocument(nil))
	handler := newDeploymentIDERouteTestHandler(t, config.ModeIDE, fixture)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteShareDeployments,
		strings.NewReader(`{"deploymentName":`),
	)
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected malformed publish payload 400, got %d with body %q", response.Code, response.Body.String())
	}
	deploymentIDERouteErrorCode(t, response, "invalid_json")
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
			name:            "share versions invalid deployment name",
			path:            "/api/share/deployments/%20/versions",
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
			name:            "share latest missing deployment",
			path:            "/api/share/deployments/missing/latest",
			expectedCode:    http.StatusNotFound,
			expectedErrCode: "not_found",
			expectedMessage: "Share deployment not found: missing",
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
	return deploymentIDERouteFixture{
		SettaFilesRoot: settaFilesRoot,
		WorkspaceRoot:  workspaceRoot,
		ProjectRuntime: projectRuntime,
		Catalog:        catalog,
		SharePublisher: sharePublisher,
		setPublishedAtFn: func(next time.Time) {
			publishedAt = next
		},
	}
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

func deploymentIDERouteDocument(appDefinition *appdefinition.AppDefinition) projectstate.Document {
	return appdefinition.MustStorageForPlugin("setta-json-render-app-gen").WithStoredDocumentAppDefinition(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}, encodeDeploymentIDERouteAppDefinition(appDefinition))
}

func encodeDeploymentIDERouteAppDefinition(
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
