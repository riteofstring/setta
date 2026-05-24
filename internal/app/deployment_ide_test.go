package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"
)

func TestAppIDEModePublishesAndListsShareDeploymentsOverHTTP(t *testing.T) {
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
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	publishRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteShareDeployments,
		strings.NewReader(`{"deploymentName":"demo-share","projectConfigId":"project-alpha"}`),
	)
	if err != nil {
		t.Fatalf("new publish request: %v", err)
	}
	publishRequest.Header.Set("Content-Type", "application/json")
	publishRequest.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	publishResponse, err := http.DefaultClient.Do(publishRequest)
	if err != nil {
		t.Fatalf("post share deployment publish: %v", err)
	}
	defer publishResponse.Body.Close()
	if publishResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(publishResponse.Body)
		t.Fatalf("expected share publish 200, got %d with body %q", publishResponse.StatusCode, string(body))
	}

	var publishPayload struct {
		DeploymentName    string `json:"deploymentName"`
		DeploymentVersion string `json:"deploymentVersion"`
		DeploymentRoot    string `json:"deploymentRoot"`
	}
	if err := json.NewDecoder(publishResponse.Body).Decode(&publishPayload); err != nil {
		t.Fatalf("decode share publish response: %v", err)
	}
	if publishPayload.DeploymentName != "demo-share" || publishPayload.DeploymentVersion != "v1" {
		t.Fatalf("unexpected share publish payload %#v", publishPayload)
	}

	manifest, err := deployments.LoadManifest(publishPayload.DeploymentRoot)
	if err != nil {
		t.Fatalf("load published manifest: %v", err)
	}
	if manifest.DeploymentType != deployments.TypeShare {
		t.Fatalf("expected share deployment type, got %q", manifest.DeploymentType)
	}

	listRequest, err := http.NewRequest(
		http.MethodGet,
		server.URL+"/api"+httpapi.RouteShareDeployments,
		nil,
	)
	if err != nil {
		t.Fatalf("new share list request: %v", err)
	}
	listRequest.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	listResponse, err := http.DefaultClient.Do(listRequest)
	if err != nil {
		t.Fatalf("get share deployment list: %v", err)
	}
	defer listResponse.Body.Close()
	if listResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listResponse.Body)
		t.Fatalf("expected share list 200, got %d with body %q", listResponse.StatusCode, string(body))
	}

	var listPayload []struct {
		DeploymentName    string `json:"deploymentName"`
		DeploymentVersion string `json:"deploymentVersion"`
	}
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
