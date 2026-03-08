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
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

func TestAppServesProjectShellReadRoutes(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-beta"
		document.Projects["project-beta"] = projectstate.Project{
			ID:   "project-beta",
			Name: "Beta",
		}
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	metadataRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadAllProjectMetadata, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new metadata request: %v", err)
	}
	metadataRequest.Header.Set("Content-Type", "application/json")
	metadataRequest.AddCookie(authCookie)

	metadataResponse, err := http.DefaultClient.Do(metadataRequest)
	if err != nil {
		t.Fatalf("load all project metadata: %v", err)
	}
	defer metadataResponse.Body.Close()
	if metadataResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(metadataResponse.Body)
		t.Fatalf("expected metadata 200, got %d with body %q", metadataResponse.StatusCode, string(body))
	}

	var metadataPayload projectshell.AllProjectMetadata
	if err := json.NewDecoder(metadataResponse.Body).Decode(&metadataPayload); err != nil {
		t.Fatalf("decode metadata payload: %v", err)
	}
	if metadataPayload.DefaultProjectConfigID == nil || *metadataPayload.DefaultProjectConfigID != "project-beta" {
		t.Fatalf("expected default project-beta, got %#v", metadataPayload.DefaultProjectConfigID)
	}
	if len(metadataPayload.ProjectMetadata) != 2 {
		t.Fatalf("expected two metadata entries, got %#v", metadataPayload.ProjectMetadata)
	}
	if metadataPayload.ProjectMetadata[0].ID != "project-alpha" || metadataPayload.ProjectMetadata[1].ID != "project-beta" {
		t.Fatalf("unexpected metadata ordering %#v", metadataPayload.ProjectMetadata)
	}

	projectRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"Alpha"}`))
	if err != nil {
		t.Fatalf("new project request: %v", err)
	}
	projectRequest.Header.Set("Content-Type", "application/json")
	projectRequest.AddCookie(authCookie)

	projectResponse, err := http.DefaultClient.Do(projectRequest)
	if err != nil {
		t.Fatalf("load project config: %v", err)
	}
	defer projectResponse.Body.Close()
	if projectResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(projectResponse.Body)
		t.Fatalf("expected project config 200, got %d with body %q", projectResponse.StatusCode, string(body))
	}

	var projectPayload projectview.SingleConfig
	if err := json.NewDecoder(projectResponse.Body).Decode(&projectPayload); err != nil {
		t.Fatalf("decode project payload: %v", err)
	}
	if projectPayload.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha, got %q", projectPayload.ProjectConfig.ID)
	}
	if projectPayload.ProjectConfig.Name != "Alpha" {
		t.Fatalf("expected Alpha, got %q", projectPayload.ProjectConfig.Name)
	}
}
