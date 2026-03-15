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

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
)

func TestRegisterSettingsRoutesReturnsCurrentSnapshot(t *testing.T) {
	t.Parallel()

	// Frontend startup hydration should receive the canonical Go-owned settings snapshot.
	runtime, _ := newSettingsRouteTestRuntime(t)
	document := runtime.Snapshot().Document
	document["backend"].(map[string]any)["renameRefactorMode"] = "ALWAYS_RENAME"
	if _, err := runtime.ReplaceAndSave(context.Background(), document); err != nil {
		t.Fatalf("seed settings runtime: %v", err)
	}

	handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadSettings, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected load settings 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload settingsstate.Document
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode load settings payload: %v", err)
	}
	if got := payload["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
}

func TestRegisterSettingsRoutesBlocksLoadOutsideFullIDE(t *testing.T) {
	t.Parallel()

	// The live settings-state transport stays behind the full IDE runtime guard.
	for _, testCase := range []struct {
		mode           config.Mode
		expectedDetail string
	}{
		{mode: config.ModeLauncher, expectedDetail: "Launcher mode does not allow this endpoint."},
		{mode: config.ModeShare, expectedDetail: "Deployment mode does not allow this endpoint."},
		{mode: config.ModeApp, expectedDetail: "Deployment mode does not allow this endpoint."},
	} {
		testCase := testCase
		t.Run(string(testCase.mode), func(t *testing.T) {
			t.Parallel()

			handler := newSettingsRouteTestHandler(t, testCase.mode, nil, nil)
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadSettings, nil)
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected load settings 403 in mode %s, got %d with body %q", testCase.mode, response.Code, response.Body.String())
			}

			var payload struct {
				Detail string `json:"detail"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode load settings error payload: %v", err)
			}
			if payload.Detail != testCase.expectedDetail {
				t.Fatalf("expected detail %q, got %#v", testCase.expectedDetail, payload)
			}
		})
	}
}

func TestRegisterSettingsRoutesSavePersistsSnapshot(t *testing.T) {
	t.Parallel()

	// Direct frontend saves should persist through the Go settings-state owner.
	runtime, settingsPath := newSettingsRouteTestRuntime(t)
	handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))

	document := runtime.Snapshot().Document
	document["backend"].(map[string]any)["renameRefactorMode"] = "NEVER_RENAME"
	document["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"] = false

	requestBody, err := json.Marshal(SaveSettingsRequest{Settings: document})
	if err != nil {
		t.Fatalf("marshal save settings payload: %v", err)
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSaveSettings,
		strings.NewReader(string(requestBody)),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected save settings 200, got %d with body %q", response.Code, response.Body.String())
	}

	if got := runtime.Snapshot().Document["backend"].(map[string]any)["renameRefactorMode"]; got != "NEVER_RENAME" {
		t.Fatalf("expected runtime renameRefactorMode NEVER_RENAME, got %#v", got)
	}

	content, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read saved settings file: %v", err)
	}
	var persisted settingsstate.Document
	if err := json.Unmarshal(content, &persisted); err != nil {
		t.Fatalf("decode saved settings file: %v", err)
	}
	if got := persisted["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"]; got != false {
		t.Fatalf("expected persisted autoRefetchCallableParamsOnLspMismatch false, got %#v", got)
	}
}

func TestRegisterSettingsRoutesBlocksSaveOutsideFullIDE(t *testing.T) {
	t.Parallel()

	// Save should follow the same launcher/deployment block as load.
	for _, testCase := range []struct {
		mode           config.Mode
		expectedDetail string
	}{
		{mode: config.ModeLauncher, expectedDetail: "Launcher mode does not allow this endpoint."},
		{mode: config.ModeShare, expectedDetail: "Share mode does not allow updating settings."},
		{mode: config.ModeApp, expectedDetail: "Share mode does not allow updating settings."},
	} {
		testCase := testCase
		t.Run(string(testCase.mode), func(t *testing.T) {
			t.Parallel()

			handler := newSettingsRouteTestHandler(t, testCase.mode, nil, nil)
			response := httptest.NewRecorder()
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSaveSettings,
				strings.NewReader(`{"settings":{}}`),
			)
			request.Header.Set("Content-Type", "application/json")
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected save settings 403 in mode %s, got %d with body %q", testCase.mode, response.Code, response.Body.String())
			}

			var payload struct {
				Detail string `json:"detail"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode save settings error payload: %v", err)
			}
			if payload.Detail != testCase.expectedDetail {
				t.Fatalf("expected detail %q, got %#v", testCase.expectedDetail, payload)
			}
		})
	}
}

func TestRegisterSettingsRoutesRejectsNonObjectSettingsPayload(t *testing.T) {
	t.Parallel()

	// Save should fail fast when the settings root is not a JSON object.
	runtime, _ := newSettingsRouteTestRuntime(t)
	handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSaveSettings,
		strings.NewReader(`{"settings":["not","an","object"]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected save settings 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid settings response: %v", err)
	}
	if payload.Error.Code != "invalid_settings" {
		t.Fatalf("expected invalid_settings, got %q", payload.Error.Code)
	}
}

func TestRegisterSettingsRoutesSaveMalformedJSONReturnsValidationEnvelope(t *testing.T) {
	t.Parallel()

	// The source FastAPI route surfaced malformed save payloads through the 422 validation envelope.
	runtime, _ := newSettingsRouteTestRuntime(t)
	handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSaveSettings,
		strings.NewReader(`{"settings":`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected save settings 422, got %d with body %q", response.Code, response.Body.String())
	}

	var payload validationErrorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode validation envelope: %v", err)
	}
	if payload.StatusCode != 10422 {
		t.Fatalf("expected validation status code 10422, got %#v", payload)
	}
	if payload.Message == "" {
		t.Fatalf("expected validation message, got %#v", payload)
	}
	if payload.Data != nil {
		t.Fatalf("expected nil validation data, got %#v", payload.Data)
	}
}

func TestRegisterSettingsRoutesSaveMissingSettingsFieldReturnsValidationEnvelope(t *testing.T) {
	t.Parallel()

	// The source request model rejects missing required `settings` before route logic runs.
	runtime, _ := newSettingsRouteTestRuntime(t)
	handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))

	for _, body := range []string{`{}`, `{"settings":null}`} {
		response := httptest.NewRecorder()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteSaveSettings,
			strings.NewReader(body),
		)
		request.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnprocessableEntity {
			t.Fatalf("expected save settings 422, got %d with body %q", response.Code, response.Body.String())
		}

		var payload validationErrorResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode validation envelope: %v", err)
		}
		if payload.StatusCode != 10422 {
			t.Fatalf("expected validation status code 10422, got %#v", payload)
		}
		if payload.Message == "" {
			t.Fatalf("expected validation message, got %#v", payload)
		}
		if payload.Data != nil {
			t.Fatalf("expected nil validation data, got %#v", payload.Data)
		}
	}
}

func newSettingsRouteTestRuntime(t *testing.T) (*settingsstate.Runtime, string) {
	t.Helper()

	settingsPath := filepath.Join(t.TempDir(), settingsstate.DefaultFileName)
	store, err := settingsstate.NewStore(settingsPath, settingsstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new settings store: %v", err)
	}
	runtime, err := settingsstate.OpenRuntime(context.Background(), store)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})
	return runtime, settingsPath
}

func newSettingsRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	runtime *settingsstate.Runtime,
	websocketHub *realtime.WebsocketHub,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterSettingsRoutes(r, SettingsRouteDependencies{
				ModePolicy:    modes.NewPolicy(mode),
				SettingsState: runtime,
				WebsocketHub:  websocketHub,
			}); err != nil {
				t.Fatalf("register settings routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new settings route handler: %v", err)
	}
	return handler
}
