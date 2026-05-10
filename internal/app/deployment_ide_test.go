package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"
)

func TestAppIDEModePublishesAndListsShareDeploymentsOverHTTP(t *testing.T) {
	harness := newAppShareDeploymentHarness(t)

	publishPayload := publishAppShareDeployment(t, harness)
	assertAppShareDeploymentPublish(t, publishPayload)
	assertAppShareDeploymentManifest(t, publishPayload.DeploymentRoot)
	assertAppShareDeploymentList(t, harness)
}

type appShareDeploymentHarness struct {
	serverURL  string
	authCookie *http.Cookie
}

type appShareDeploymentPublishPayload struct {
	DeploymentName    string `json:"deploymentName"`
	DeploymentVersion string `json:"deploymentVersion"`
	DeploymentRoot    string `json:"deploymentRoot"`
}

type appShareDeploymentListEntry struct {
	DeploymentName    string `json:"deploymentName"`
	DeploymentVersion string `json:"deploymentVersion"`
}

func newAppShareDeploymentHarness(t *testing.T) appShareDeploymentHarness {
	t.Helper()

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)

	return appShareDeploymentHarness{
		serverURL:  server.URL,
		authCookie: newAppTestAuthCookie(t, app),
	}
}

func publishAppShareDeployment(t *testing.T, harness appShareDeploymentHarness) appShareDeploymentPublishPayload {
	t.Helper()

	publishRequest, err := http.NewRequest(
		http.MethodPost,
		harness.serverURL+"/api"+httpapi.RouteShareDeployments,
		strings.NewReader(`{"deploymentName":"demo-share","projectConfigId":"project-alpha"}`),
	)
	if err != nil {
		t.Fatalf("new publish request: %v", err)
	}
	publishRequest.Header.Set("Content-Type", "application/json")
	publishRequest.AddCookie(harness.authCookie)

	publishResponse, err := http.DefaultClient.Do(publishRequest)
	if err != nil {
		t.Fatalf("post share deployment publish: %v", err)
	}
	defer publishResponse.Body.Close()
	if publishResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(publishResponse.Body)
		t.Fatalf("expected share publish 200, got %d with body %q", publishResponse.StatusCode, string(body))
	}

	var publishPayload appShareDeploymentPublishPayload
	if err := json.NewDecoder(publishResponse.Body).Decode(&publishPayload); err != nil {
		t.Fatalf("decode share publish response: %v", err)
	}
	return publishPayload
}

func assertAppShareDeploymentPublish(t *testing.T, publishPayload appShareDeploymentPublishPayload) {
	t.Helper()

	if publishPayload.DeploymentName != "demo-share" || publishPayload.DeploymentVersion != "v1" {
		t.Fatalf("unexpected share publish payload %#v", publishPayload)
	}
}

func assertAppShareDeploymentManifest(t *testing.T, deploymentRoot string) {
	t.Helper()

	manifest, err := deployments.LoadManifest(deploymentRoot)
	if err != nil {
		t.Fatalf("load published manifest: %v", err)
	}
	if manifest.DeploymentType != deployments.TypeShare {
		t.Fatalf("expected share deployment type, got %q", manifest.DeploymentType)
	}
}

func assertAppShareDeploymentList(t *testing.T, harness appShareDeploymentHarness) {
	t.Helper()

	listRequest, err := http.NewRequest(
		http.MethodGet,
		harness.serverURL+"/api"+httpapi.RouteShareDeployments,
		nil,
	)
	if err != nil {
		t.Fatalf("new share list request: %v", err)
	}
	listRequest.AddCookie(harness.authCookie)

	listResponse, err := http.DefaultClient.Do(listRequest)
	if err != nil {
		t.Fatalf("get share deployment list: %v", err)
	}
	defer listResponse.Body.Close()
	if listResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listResponse.Body)
		t.Fatalf("expected share list 200, got %d with body %q", listResponse.StatusCode, string(body))
	}

	var listPayload []appShareDeploymentListEntry
	if err := json.NewDecoder(listResponse.Body).Decode(&listPayload); err != nil {
		t.Fatalf("decode share list response: %v", err)
	}
	if len(listPayload) != 1 {
		t.Fatalf("expected one published share deployment, got %#v", listPayload)
	}
	if listPayload[0].DeploymentName != "demo-share" || listPayload[0].DeploymentVersion != "v1" {
		t.Fatalf("unexpected share list payload %#v", listPayload)
	}
}
