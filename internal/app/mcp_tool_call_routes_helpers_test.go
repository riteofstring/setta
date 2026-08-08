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
	"setta/internal/projectstate"
)

type appMCPToolCallRouteFixture struct {
	app       *App
	serverURL string
	client    *http.Client
}

func newAppMCPToolCallRouteFixture(t *testing.T, cfg config.Config) appMCPToolCallRouteFixture {
	t.Helper()

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

	return appMCPToolCallRouteFixture{
		app:       app,
		serverURL: server.URL,
		client:    mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}
}

type appMCPToolCallRoutePayload struct {
	StructuredContent any  `json:"structuredContent"`
	IsError           bool `json:"isError"`
}

func callAppMCPToolCallRoute(
	t *testing.T,
	client *http.Client,
	serverURL string,
	requestBody string,
	contextLabel string,
) appMCPToolCallRoutePayload {
	t.Helper()

	response, err := client.Post(
		serverURL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(requestBody),
	)
	if err != nil {
		t.Fatalf("post %s tool call route: %v", contextLabel, err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload appMCPToolCallRoutePayload
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode %s tool call response: %v", contextLabel, err)
	}
	return payload
}

func callSuccessfulAppMCPToolCallRoute(
	t *testing.T,
	client *http.Client,
	serverURL string,
	requestBody string,
	contextLabel string,
) appMCPToolCallRoutePayload {
	t.Helper()

	payload := callAppMCPToolCallRoute(t, client, serverURL, requestBody, contextLabel)
	if payload.IsError {
		t.Fatalf("expected %s success, got %#v", contextLabel, payload.StructuredContent)
	}
	return payload
}

func mustAppMCPProject(t *testing.T, app *App, label string) projectstate.Project {
	t.Helper()

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id %s: %v", label, err)
	}
	return project
}

func assertAppMCPDiagnosticsMuted(t *testing.T, app *App) {
	t.Helper()

	project := mustAppMCPProject(t, app, "after route scoped write")
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after route scoped write: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}
}

func assertAppMCPCodeObjectName(t *testing.T, app *App, want string, label string) {
	t.Helper()

	project := mustAppMCPProject(t, app, label)
	if got := project.CodeObjs["allowed-param"].Name; got != want {
		t.Fatalf("expected code object name %s, got %q", want, got)
	}
}

func assertAppMCPParamValue(t *testing.T, app *App, want string, label string) {
	t.Helper()

	project := mustAppMCPProject(t, app, label)
	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param %s: %v", label, err)
	}
	if got := paramPayload["value"]; got != want {
		t.Fatalf("expected %s param value, got %#v", want, got)
	}
}

func assertAppMCPDiagnosticSuppression(t *testing.T, app *App) {
	t.Helper()

	project := mustAppMCPProject(t, app, "after route scoped suppression")
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after route scoped suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}
}

func assertAppMCPSectionName(t *testing.T, app *App, want string) {
	t.Helper()

	project := mustAppMCPProject(t, app, "after route set_section_name")
	if got := project.Sections["allowed-section"].Name; got != want {
		t.Fatalf("expected renamed section name, got %q", got)
	}
}

func assertAppMCPTypeErrorIgnored(t *testing.T, app *App) {
	t.Helper()

	project := mustAppMCPProject(t, app, "after route set_type_error_ignore")
	typeErrorIgnoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after route set_type_error_ignore: %v", err)
	}
	if !typeErrorIgnoreState.Params["allowed-param"] {
		t.Fatalf("expected allowed-param type-error ignore state, got %#v", typeErrorIgnoreState)
	}
}

func assertAppMCPCodeObjectDisplayName(t *testing.T, app *App, want string) {
	t.Helper()

	project := mustAppMCPProject(t, app, "after route set_code_obj_display_name")
	if got := project.CodeObjs["allowed-param"].DisplayName; got != want {
		t.Fatalf("expected display name %s, got %q", want, got)
	}
}
