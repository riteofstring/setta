package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/lsp"
	"setta/internal/lspcompletion"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

type stubLSPAdminService struct {
	restartDocument   *projectstate.Document
	typeCheckDocument *projectstate.Document
	typeCheckProject  string
	restartErr        error
	typeCheckErr      error
}

func (s *stubLSPAdminService) Restart(_ context.Context, document projectstate.Document) error {
	if s.restartErr != nil {
		return s.restartErr
	}
	cloned := document.Clone()
	s.restartDocument = &cloned
	return nil
}

func (s *stubLSPAdminService) TypeCheckProject(_ context.Context, document projectstate.Document, projectID string) error {
	if s.typeCheckErr != nil {
		return s.typeCheckErr
	}
	cloned := document.Clone()
	s.typeCheckDocument = &cloned
	s.typeCheckProject = projectID
	return nil
}

// The diagnostics route should return the current project-scoped payload from
// the Go-owned registry after validating that the project exists.
func TestRegisterLSPRoutesReturnsLatestDiagnosticsSnapshot(t *testing.T) {
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

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	diagnostics.UpdateCodeSection("project-alpha", "section-1", []projectstate.LSPDiagnostic{
		testHTTPAPILSPDiagnostic("fixture-ts"),
	})

	handler := newLSPRouteTestHandler(t, config.ModeIDE, projectRuntime, diagnostics, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestLSPDiagnostics,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.LSPDiagnosticsPayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode diagnostics payload: %v", err)
	}
	if payload.ProjectID != "project-alpha" {
		t.Fatalf("unexpected diagnostics project id %q", payload.ProjectID)
	}
	if len(payload.CodeSections["section-1"]) != 1 {
		t.Fatalf("expected one section diagnostic, got %#v", payload.CodeSections)
	}
}

// IDE-only diagnostics routes should stay unavailable in non-IDE modes.
func TestRegisterLSPRoutesRejectsShareModeRequests(t *testing.T) {
	t.Parallel()

	handler := newLSPRouteTestHandler(t, config.ModeShare, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestLSPDiagnostics,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	assertDetailBody(t, response.Body.Bytes(), "Deployment mode disallows language server features.")
}

// Launcher-mode diagnostics routes should preserve the source detail body
// instead of the generic Go error envelope.
func TestRegisterLSPRoutesRejectsLauncherModeRequests(t *testing.T) {
	t.Parallel()

	handler := newLSPRouteTestHandler(t, config.ModeLauncher, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestLSPDiagnostics,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	assertDetailBody(t, response.Body.Bytes(), "Launcher mode does not allow this endpoint.")
}

func TestRegisterLSPRoutesProjectRequestsReturnValidationEnvelopeForMalformedJSON(t *testing.T) {
	t.Parallel()

	projectRuntime := lspDiagnosticsMutationRouteRuntime(t)
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newLSPRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{}),
		nil,
	)

	cases := []struct {
		name string
		path string
		body string
	}{
		{
			name: "diagnostics snapshot",
			path: RouteGetLatestLSPDiagnostics,
			body: `{"projectConfigId":`,
		},
		{
			name: "text field completion",
			path: RouteTextFieldCompletion,
			body: `{"projectConfigId":"project-alpha",`,
		},
		{
			name: "diagnostics mute",
			path: RouteSetCodeSectionDiagnosticsMute,
			body: `{"projectConfigId":"project-alpha",`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+tc.path, strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			assertLSPValidationEnvelope(t, response, "")
		})
	}
}

func TestRegisterLSPRoutesProjectRequestsReturnValidationEnvelopeForMissingRequiredFields(t *testing.T) {
	t.Parallel()

	projectRuntime := lspDiagnosticsMutationRouteRuntime(t)
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newLSPRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{}),
		nil,
	)

	cases := []struct {
		name            string
		path            string
		body            string
		expectedMessage string
	}{
		{
			name:            "diagnostics snapshot missing project id",
			path:            RouteGetLatestLSPDiagnostics,
			body:            `{}`,
			expectedMessage: "projectConfigId: Field required",
		},
		{
			name:            "text field completion missing full text",
			path:            RouteTextFieldCompletion,
			body:            `{"projectConfigId":"project-alpha","sectionId":"section-1","position":1}`,
			expectedMessage: "fullText: Field required",
		},
		{
			name:            "diagnostics mute missing section id",
			path:            RouteSetCodeSectionDiagnosticsMute,
			body:            `{"projectConfigId":"project-alpha","mute":true}`,
			expectedMessage: "sectionId: Field required",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+tc.path, strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			assertLSPValidationEnvelope(t, response, tc.expectedMessage)
		})
	}
}

// Diagnostics ignore-state routes should persist the project-state mutation and
// immediately reapply filtering against the stored raw diagnostics payload.
func TestRegisterLSPRoutesMutatesCodeSectionDiagnosticsIgnoreState(t *testing.T) {
	t.Parallel()

	projectRuntime := lspDiagnosticsMutationRouteRuntime(t)
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	diagnostics.UpdateCodeSection("project-alpha", "section-1", []projectstate.LSPDiagnostic{
		testHTTPAPILSPDiagnostic("reportFoo"),
	})
	handler := newLSPRouteTestHandler(t, config.ModeIDE, projectRuntime, diagnostics, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetCodeSectionDiagnosticCodeSuppression,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1","code":"reportFoo","suppress":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null response body, got %q", response.Body.String())
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("resolve project from runtime snapshot: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("section-1")
	if err != nil {
		t.Fatalf("resolve section ignore state: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected persisted suppression state, got %#v", ignoreState.SuppressedCodes)
	}

	filtered := diagnostics.Snapshot("project-alpha")
	if len(filtered.CodeSections) != 0 {
		t.Fatalf("expected suppression route to clear filtered diagnostics, got %#v", filtered.CodeSections)
	}
}

// Muting should behave the same way as suppression and stay IDE-only.
func TestRegisterLSPRoutesMutesCodeSectionDiagnostics(t *testing.T) {
	t.Parallel()

	projectRuntime := lspDiagnosticsMutationRouteRuntime(t)
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	diagnostics.UpdateCodeSection("project-alpha", "section-1", []projectstate.LSPDiagnostic{
		testHTTPAPILSPDiagnostic("reportFoo"),
	})
	handler := newLSPRouteTestHandler(t, config.ModeIDE, projectRuntime, diagnostics, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetCodeSectionDiagnosticsMute,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1","mute":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("resolve project from runtime snapshot: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("section-1")
	if err != nil {
		t.Fatalf("resolve section ignore state: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected mute state to persist, got %#v", ignoreState)
	}

	filtered := diagnostics.Snapshot("project-alpha")
	if len(filtered.CodeSections) != 0 {
		t.Fatalf("expected mute route to clear filtered diagnostics, got %#v", filtered.CodeSections)
	}
}

// The current edit-menu restart action should now hit the Go-owned admin
// surface and hand it the live project document set.
func TestRegisterLSPRoutesRestartsLanguageServer(t *testing.T) {
	t.Parallel()

	projectRuntime := completionRouteTestRuntime(t)
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	admin := &stubLSPAdminService{}
	handler := newLSPRouteTestHandlerWithAdmin(
		t,
		config.ModeIDE,
		projectRuntime,
		projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{}),
		nil,
		admin,
	)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRestartLanguageServer, strings.NewReader("null"))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if admin.restartDocument == nil {
		t.Fatal("expected restart admin call")
	}
	if _, ok := admin.restartDocument.Projects["project-alpha"]; !ok {
		t.Fatalf("expected live project document, got %#v", admin.restartDocument.Projects)
	}
}

// Manual type-check should target the requested project through the Go-owned
// admin surface instead of the Python manager helper.
func TestRegisterLSPRoutesTypeChecksProject(t *testing.T) {
	t.Parallel()

	projectRuntime := completionRouteTestRuntime(t)
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	admin := &stubLSPAdminService{}
	handler := newLSPRouteTestHandlerWithAdmin(
		t,
		config.ModeIDE,
		projectRuntime,
		projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{}),
		nil,
		admin,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteTypeCheck,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if admin.typeCheckDocument == nil || admin.typeCheckProject != "project-alpha" {
		t.Fatalf("expected type-check admin call for project-alpha, got %#v / %q", admin.typeCheckDocument, admin.typeCheckProject)
	}
}

func TestRegisterLSPRoutesTypeCheckReturnsValidationEnvelopeForMalformedJSONAndMissingProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := completionRouteTestRuntime(t)
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	handler := newLSPRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{}),
		nil,
	)

	cases := []struct {
		name            string
		body            string
		expectedMessage string
	}{
		{
			name:            "malformed json",
			body:            `{"projectConfigId":`,
			expectedMessage: "",
		},
		{
			name:            "missing project id",
			body:            `{}`,
			expectedMessage: "projectConfigId: Field required",
		},
		{
			name:            "null project id",
			body:            `{"projectConfigId":null}`,
			expectedMessage: "projectConfigId: Field required",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+RouteTypeCheck, strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			assertLSPValidationEnvelope(t, response, tc.expectedMessage)
		})
	}
}

// The admin-side LSP routes follow the source full-runtime router policy:
// deployment/share and launcher failures must return a plain detail body.
func TestRegisterLSPRoutesAdminModeGuardsReturnSourceDetailBodies(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name           string
		mode           config.Mode
		path           string
		body           string
		expectedDetail string
	}{
		{
			name:           "restart share",
			mode:           config.ModeShare,
			path:           RouteRestartLanguageServer,
			body:           "null",
			expectedDetail: "Deployment mode does not allow this endpoint.",
		},
		{
			name:           "restart launcher",
			mode:           config.ModeLauncher,
			path:           RouteRestartLanguageServer,
			body:           "null",
			expectedDetail: "Launcher mode does not allow this endpoint.",
		},
		{
			name:           "type check share",
			mode:           config.ModeShare,
			path:           RouteTypeCheck,
			body:           `{"projectConfigId":"project-alpha"}`,
			expectedDetail: "Deployment mode does not allow this endpoint.",
		},
		{
			name:           "type check launcher",
			mode:           config.ModeLauncher,
			path:           RouteTypeCheck,
			body:           `{"projectConfigId":"project-alpha"}`,
			expectedDetail: "Launcher mode does not allow this endpoint.",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			handler := newLSPRouteTestHandler(t, tc.mode, nil, nil, nil)
			request := httptest.NewRequest(http.MethodPost, "/api"+tc.path, strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			assertDetailBody(t, response.Body.Bytes(), tc.expectedDetail)
		})
	}
}

// Diagnostics-setting routes use a narrower share-mode detail than the
// completion/snapshot routes while keeping the same launcher detail body.
func TestRegisterLSPRoutesMutationModeGuardsReturnSourceDetailBodies(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name           string
		mode           config.Mode
		expectedDetail string
	}{
		{
			name:           "share",
			mode:           config.ModeShare,
			expectedDetail: "Deployment mode disallows diagnostics settings.",
		},
		{
			name:           "launcher",
			mode:           config.ModeLauncher,
			expectedDetail: "Launcher mode does not allow this endpoint.",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			handler := newLSPRouteTestHandler(t, tc.mode, nil, nil, nil)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSetCodeSectionDiagnosticsMute,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1","mute":true}`),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			assertDetailBody(t, response.Body.Bytes(), tc.expectedDetail)
		})
	}
}

func newLSPRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	diagnostics *projectstate.LSPDiagnosticsRegistry,
	completions *lspcompletion.Service,
) http.Handler {
	return newLSPRouteTestHandlerWithAdmin(
		t,
		mode,
		projectRuntime,
		diagnostics,
		completions,
		nil,
	)
}

func newLSPRouteTestHandlerWithAdmin(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	diagnostics *projectstate.LSPDiagnosticsRegistry,
	completions *lspcompletion.Service,
	admin LSPAdminService,
) http.Handler {
	t.Helper()

	if mode == config.ModeIDE && completions == nil {
		var err error
		completions, err = lspcompletion.NewService(lspcompletion.ServiceOptions{
			SettaFilesRoot: t.TempDir(),
			LSPService:     lsp.NewService(&lsp.Session{}),
		})
		if err != nil {
			t.Fatalf("new completion service: %v", err)
		}
	}
	if mode == config.ModeIDE && admin == nil {
		admin = &stubLSPAdminService{}
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterLSPRoutes(r, LSPRouteDependencies{
				ModePolicy:   modes.NewPolicy(mode),
				ProjectState: projectRuntime,
				Diagnostics:  diagnostics,
				Completions:  completions,
				Admin:        admin,
			}); err != nil {
				t.Fatalf("register lsp routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func assertLSPValidationEnvelope(t *testing.T, response *httptest.ResponseRecorder, expectedMessage string) {
	t.Helper()

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}

	var payload validationErrorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode validation envelope: %v", err)
	}
	if payload.StatusCode != 10422 {
		t.Fatalf("expected validation status code 10422, got %#v", payload)
	}
	if expectedMessage == "" {
		if payload.Message == "" {
			t.Fatalf("expected validation message, got %#v", payload)
		}
	} else if payload.Message != expectedMessage {
		t.Fatalf("expected validation message %q, got %#v", expectedMessage, payload)
	}
	if payload.Data != nil {
		t.Fatalf("expected nil validation data, got %#v", payload.Data)
	}
}

func lspDiagnosticsMutationRouteRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				SectionVariantMap: map[string]string{
					"section-1": "variant-1",
				},
				Sections: map[string]projectstate.Section{
					"section-1": {
						ID:               "section-1",
						Name:             "Section",
						VariantIDs:       []string{"variant-1"},
						DefaultVariantID: "variant-1",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"variant-1": {
						ID:     "variant-1",
						ImplID: "impl-1",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"impl-1": {
						ID:   "impl-1",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: projectstate.RawJSON(`{
							"id":"impl-1",
							"type":"Code",
							"code":"print('hello')\n",
							"codeLanguage":"python",
							"children":[]
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize lsp diagnostics mutation document: %v", err)
	}

	runtime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	return runtime
}

func testHTTPAPILSPDiagnostic(code string) projectstate.LSPDiagnostic {
	severity := 1
	source := "fixture-ts-lsp"
	uri := "file:///tmp/example.py"
	return projectstate.LSPDiagnostic{
		Message:  "Fixture TypeScript diagnostic",
		Severity: &severity,
		Code:     code,
		Source:   &source,
		Range: projectstate.LSPDiagnosticRange{
			Start: projectstate.LSPDiagnosticPosition{Line: 0, Character: 0},
			End:   projectstate.LSPDiagnosticPosition{Line: 0, Character: 1},
		},
		URI: &uri,
	}
}

func assertDetailBody(t *testing.T, body []byte, expected string) {
	t.Helper()

	var payload struct {
		Detail string `json:"detail"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode detail body: %v", err)
	}
	if payload.Detail != expected {
		t.Fatalf("expected detail %q, got %#v", expected, payload)
	}
}
