package httpapi

import (
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

func TestRegisterAppGenSkillRoutesListsSkillsUsesFallbackCreateRoot(t *testing.T) {
	t.Parallel()

	state := newAppGenSkillRouteTestStateWithEnv(t, testAppGenSkillRouteEnvSetup{
		agentsHome: filepath.Join(t.TempDir(), "agents-home"),
	})
	writeAppGenSkillDoc(t, filepath.Join(state.workspaceRoot, ".agents", "skills", "ui-layout", "SKILL.md"), "# UI Layout\n\nCreate dense dashboard layouts.\n")
	agentsHomeSkills := filepath.Join(state.agentsHome, "skills")
	if err := os.MkdirAll(state.agentsHome, 0o755); err != nil {
		t.Fatalf("mkdir agents home: %v", err)
	}
	if err := os.MkdirAll(agentsHomeSkills, 0o555); err != nil {
		t.Fatalf("mkdir agents home skills: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(state.homeDir, ".agents", "skills"), 0o755); err != nil {
		t.Fatalf("mkdir user skills: %v", err)
	}
	handler := newAppGenSkillRouteTestHandler(t, config.ModeIDE, state.service)

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
	expectedRoot := filepath.Join(state.homeDir, ".agents", "skills")
	if payload.CustomSkillCreateRootPath == nil || *payload.CustomSkillCreateRootPath != expectedRoot || !payload.CustomSkillCreateRootActionable {
		t.Fatalf("unexpected fallback create-root payload %#v", payload)
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

func TestRegisterAppGenSkillRoutesMapsInvalidReadBranchesTo400(t *testing.T) {
	t.Parallel()

	state := newAppGenSkillRouteTestState(t)
	writeAppGenSkillDocBytes(t, filepath.Join(state.workspaceRoot, ".agents", "skills", "bad-content", "SKILL.md"), []byte("# bad-content\n\n\xff\xfe\n"))
	protectedSkillDoc := filepath.Join(state.workspaceRoot, ".agents", "skills", "permission-denied", "SKILL.md")
	writeAppGenSkillDoc(t, protectedSkillDoc, "# permission-denied\n\nBody.\n")
	if err := os.Chmod(protectedSkillDoc, 0o000); err != nil {
		t.Fatalf("chmod protected skill doc: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(protectedSkillDoc, 0o644)
	})
	handler := newAppGenSkillRouteTestHandler(t, config.ModeIDE, state.service)

	for _, testCase := range []struct {
		name              string
		payload           string
		expectedMessage   string
		expectedSubstring string
	}{
		{
			name:            "traversal",
			payload:         `{"skillId":"workspace_agents_skills::../../outside"}`,
			expectedMessage: "Invalid skill path.",
		},
		{
			name:            "invalid utf8",
			payload:         `{"skillId":"workspace_agents_skills::bad-content"}`,
			expectedMessage: "invalid UTF-8",
		},
		{
			name:              "permission denied",
			payload:           `{"skillId":"workspace_agents_skills::permission-denied"}`,
			expectedSubstring: "permission denied",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAppGenSkillContent, strings.NewReader(testCase.payload))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != "invalid_app_gen_skill" {
				t.Fatalf("expected invalid_app_gen_skill, got %#v", payload)
			}
			if testCase.expectedMessage != "" && payload.Error.Message != testCase.expectedMessage {
				t.Fatalf("expected message %q, got %#v", testCase.expectedMessage, payload)
			}
			if testCase.expectedSubstring != "" && !strings.Contains(strings.ToLower(payload.Error.Message), testCase.expectedSubstring) {
				t.Fatalf("expected message containing %q, got %#v", testCase.expectedSubstring, payload)
			}
		})
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

func TestRegisterAppGenSkillRoutesCreateFallsBackToNextWritableRoot(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission semantics are not stable on windows")
	}

	state := newAppGenSkillRouteTestStateWithEnv(t, testAppGenSkillRouteEnvSetup{
		agentsHome: filepath.Join(t.TempDir(), "agents-home"),
	})
	if err := os.MkdirAll(state.agentsHome, 0o755); err != nil {
		t.Fatalf("mkdir agents home: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(state.agentsHome, "skills"), 0o555); err != nil {
		t.Fatalf("mkdir agents home skills: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(state.homeDir, ".agents", "skills"), 0o755); err != nil {
		t.Fatalf("mkdir user skills: %v", err)
	}
	handler := newAppGenSkillRouteTestHandler(t, config.ModeIDE, state.service)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpsertAppGenCustomSkill,
		strings.NewReader(`{"skillId":null,"relativePath":"fallback-route","content":"# fallback-route\n\nBody.\n"}`),
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
	expectedSkillDoc := filepath.Join(state.homeDir, ".agents", "skills", "fallback-route", "SKILL.md")
	if payload.SkillID != "user_agents_skills::fallback-route" || payload.SkillDocPath != expectedSkillDoc {
		t.Fatalf("expected fallback create in user root, got %#v", payload)
	}
}

func TestRegisterAppGenSkillRoutesUpsertMapsTargetErrors(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission semantics are not stable on windows")
	}

	state := newAppGenSkillRouteTestStateWithEnv(t, testAppGenSkillRouteEnvSetup{
		agentsHome: filepath.Join(t.TempDir(), "agents-home"),
	})
	writeAppGenSkillDoc(t, filepath.Join(state.workspaceRoot, ".claude", "skills", "read-only", "SKILL.md"), "# read-only\n\nBody.\n")
	writeAppGenSkillDoc(t, filepath.Join(state.workspaceRoot, ".agents", "skills", "node_modules", "hidden", "SKILL.md"), "# hidden\n\nBody.\n")
	if err := os.MkdirAll(state.agentsHome, 0o755); err != nil {
		t.Fatalf("mkdir agents home: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(state.agentsHome, "skills"), 0o555); err != nil {
		t.Fatalf("mkdir agents home skills: %v", err)
	}
	handler := newAppGenSkillRouteTestHandler(t, config.ModeIDE, state.service)

	for _, testCase := range []struct {
		name          string
		payload       string
		expectedCode  int
		expectedError string
		expectDetail  string
	}{
		{
			name:          "non-custom root",
			payload:       `{"skillId":"workspace_claude_skills::read-only","relativePath":null,"content":"# read-only\n\nUpdated.\n"}`,
			expectedCode:  http.StatusBadRequest,
			expectedError: "invalid_app_gen_custom_skill",
			expectDetail:  "Only skills under AGENTS_HOME/skills, ~/.agents/skills, or workspace .agents/skills are editable.",
		},
		{
			name:          "hidden skill id",
			payload:       `{"skillId":"workspace_agents_skills::node_modules/hidden","relativePath":null,"content":"# hidden\n\nUpdated.\n"}`,
			expectedCode:  http.StatusNotFound,
			expectedError: "app_gen_skill_not_found",
			expectDetail:  "Unknown or non-discoverable skillId: workspace_agents_skills::node_modules/hidden",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpsertAppGenCustomSkill, strings.NewReader(testCase.payload))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != testCase.expectedCode {
				t.Fatalf("expected %d, got %d with body %q", testCase.expectedCode, response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != testCase.expectedError {
				t.Fatalf("expected error code %q, got %#v", testCase.expectedError, payload)
			}
			if !strings.Contains(payload.Error.Message, testCase.expectDetail) {
				t.Fatalf("expected detail containing %q, got %#v", testCase.expectDetail, payload)
			}
		})
	}
}

func TestRegisterAppGenSkillRoutesCreateRejectsNoWritableRoots(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission semantics are not stable on windows")
	}

	state := newAppGenSkillRouteTestStateWithEnv(t, testAppGenSkillRouteEnvSetup{
		agentsHome: filepath.Join(t.TempDir(), "agents-home"),
	})
	if err := os.MkdirAll(state.agentsHome, 0o755); err != nil {
		t.Fatalf("mkdir agents home: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(state.agentsHome, "skills"), 0o555); err != nil {
		t.Fatalf("mkdir agents home skills: %v", err)
	}
	if err := os.Chmod(state.homeDir, 0o555); err != nil {
		t.Fatalf("chmod home dir: %v", err)
	}
	if err := os.Chmod(state.workspaceRoot, 0o555); err != nil {
		t.Fatalf("chmod workspace root: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(state.homeDir, 0o755)
		_ = os.Chmod(state.workspaceRoot, 0o755)
	})
	handler := newAppGenSkillRouteTestHandler(t, config.ModeIDE, state.service)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpsertAppGenCustomSkill,
		strings.NewReader(`{"skillId":null,"relativePath":"blocked-route","content":"# blocked-route\n\nBody.\n"}`),
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_app_gen_custom_skill" {
		t.Fatalf("expected invalid_app_gen_custom_skill, got %#v", payload)
	}
	if !strings.Contains(payload.Error.Message, "No writable custom skill root available.") {
		t.Fatalf("expected no-writable-root detail, got %#v", payload)
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
	agentsHome    string
	service       *appgenskills.Service
}

func newAppGenSkillRouteTestState(t *testing.T) appGenSkillRouteTestState {
	t.Helper()
	return newAppGenSkillRouteTestStateWithEnv(t, testAppGenSkillRouteEnvSetup{})
}

type testAppGenSkillRouteEnvSetup struct {
	agentsHome string
}

func newAppGenSkillRouteTestStateWithEnv(t *testing.T, setup testAppGenSkillRouteEnvSetup) appGenSkillRouteTestState {
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
		agentsHome:    setup.agentsHome,
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

func writeAppGenSkillDocBytes(t *testing.T, path string, content []byte) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir skill dir: %v", err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write raw skill doc: %v", err)
	}
}
