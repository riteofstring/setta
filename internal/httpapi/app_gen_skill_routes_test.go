package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/appgenskills"
	"setta/internal/config"
	"setta/internal/modes"
)

func TestRegisterAppGenSkillRoutesListsSkills(t *testing.T) {
	t.Parallel()

	state := newAppGenSkillRouteTestState(t)
	writeAppGenSkillDoc(t, filepath.Join(state.workspaceRoot, ".agents", "skills", "ui-layout", "SKILL.md"), "# UI Layout\n\nCreate dense dashboard layouts.\n")
	handler := newAppGenSkillRouteTestHandler(t, config.ModeIDE, state.service)

	// The list route should return the current discoverable skill browser snapshot.
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetAppGenSkills, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload appgenskills.GetSkillsResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode skills response: %v", err)
	}
	if len(payload.Skills) != 1 || payload.Skills[0].SkillID != "workspace_agents_skills::ui-layout" {
		t.Fatalf("unexpected skills payload %#v", payload)
	}
	if payload.CustomSkillCreateRootPath == nil || *payload.CustomSkillCreateRootPath != filepath.Join(state.homeDir, ".agents", "skills") {
		t.Fatalf("unexpected create root %#v", payload.CustomSkillCreateRootPath)
	}
}

func TestRegisterAppGenSkillRoutesReturnsPlainNotFoundDetail(t *testing.T) {
	t.Parallel()

	state := newAppGenSkillRouteTestState(t)
	handler := newAppGenSkillRouteTestHandler(t, config.ModeIDE, state.service)

	// Missing skills should surface the plain discoverability detail the frontend already shows.
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAppGenSkillContent, strings.NewReader(`{"skillId":"workspace_agents_skills::missing-skill"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Message != "Missing SKILL.md for workspace_agents_skills::missing-skill" {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterAppGenSkillRoutesCreatesCustomSkill(t *testing.T) {
	t.Parallel()

	state := newAppGenSkillRouteTestState(t)
	handler := newAppGenSkillRouteTestHandler(t, config.ModeIDE, state.service)

	// Upsert should create a new custom skill when no skillId is provided.
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpsertAppGenCustomSkill,
		strings.NewReader(`{"skillId":null,"relativePath":"route-created","content":"# route-created\n\nBody.\n"}`),
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload appgenskills.UpsertCustomSkillResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode upsert payload: %v", err)
	}
	expectedSkillDoc := filepath.Join(state.homeDir, ".agents", "skills", "route-created", "SKILL.md")
	if payload.SkillID != "user_agents_skills::route-created" || payload.SkillDocPath != expectedSkillDoc {
		t.Fatalf("unexpected upsert payload %#v", payload)
	}
	if content, err := os.ReadFile(expectedSkillDoc); err != nil || string(content) != "# route-created\n\nBody.\n" {
		t.Fatalf("expected created skill doc, got content=%q err=%v", string(content), err)
	}
}

func TestRegisterAppGenSkillRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	state := newAppGenSkillRouteTestState(t)
	handler := newAppGenSkillRouteTestHandler(t, config.ModeShare, state.service)
	testCases := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "list", method: http.MethodGet, path: RouteGetAppGenSkills},
		{name: "read content", method: http.MethodPost, path: RouteGetAppGenSkillContent, body: `{"skillId":"workspace_agents_skills::missing-skill"}`},
		{name: "upsert", method: http.MethodPost, path: RouteUpsertAppGenCustomSkill, body: `{"skillId":null,"relativePath":"blocked","content":"# blocked"}`},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			request := httptest.NewRequest(testCase.method, "/api"+testCase.path, strings.NewReader(testCase.body))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != "mode_forbidden" {
				t.Fatalf("expected mode_forbidden, got %#v", payload)
			}
		})
	}
}

type appGenSkillRouteTestState struct {
	workspaceRoot string
	homeDir       string
	service       *appgenskills.Service
}

func newAppGenSkillRouteTestState(t *testing.T) appGenSkillRouteTestState {
	t.Helper()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	service, err := appgenskills.NewService(appgenskills.ServiceOptions{
		WorkspaceRoot: workspaceRoot,
		HomeDir:       homeDir,
		LookupEnv: func(string) (string, bool) {
			return "", false
		},
	})
	if err != nil {
		t.Fatalf("new app gen skill service: %v", err)
	}
	return appGenSkillRouteTestState{
		workspaceRoot: workspaceRoot,
		homeDir:       homeDir,
		service:       service,
	}
}

func newAppGenSkillRouteTestHandler(t *testing.T, mode config.Mode, service *appgenskills.Service) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterAppGenSkillRoutes(r, AppGenSkillRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Service:    service,
			}); err != nil {
				t.Fatalf("register app gen skill routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func writeAppGenSkillDoc(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir skill dir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write skill doc: %v", err)
	}
}
