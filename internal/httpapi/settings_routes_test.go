package httpapi

import (
	"bytes"
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
	"setta/internal/projectstate"
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
	backend := payload["backend"].(map[string]any)
	if got := backend["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if got := backend["autobackup"]; got != true {
		t.Fatalf("expected autobackup true, got %#v", got)
	}
	if got := backend["autobackupFreq"]; got != float64(300) {
		t.Fatalf("expected autobackupFreq 300, got %#v", got)
	}
	if got := backend["autobackupKeepLastN"]; got != float64(10) {
		t.Fatalf("expected autobackupKeepLastN 10, got %#v", got)
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

func TestRegisterSettingsRoutesSetLanguageServerSelectionPersistsPluginAndNull(t *testing.T) {
	t.Parallel()

	runtime, settingsPath := newSettingsRouteTestRuntime(t)
	handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))
	selectedPluginID := "setta-basedpyright"

	requestBody, err := json.Marshal(SetLanguageServerSelectionRequest{
		Language: "python",
		PluginID: &selectedPluginID,
	})
	if err != nil {
		t.Fatalf("marshal set language server selection payload: %v", err)
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetLanguageServerSelection,
		strings.NewReader(string(requestBody)),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected set language server selection 200, got %d with body %q", response.Code, response.Body.String())
	}

	pythonSelection, ok, err := settingsstate.LanguageServerSelectionForLanguage(runtime.Snapshot().Document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage runtime python returned error: %v", err)
	}
	if !ok || pythonSelection == nil || *pythonSelection != "setta-basedpyright" {
		t.Fatalf("expected runtime python selection setta-basedpyright, got ok=%v selection=%#v", ok, pythonSelection)
	}

	content, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read saved settings file: %v", err)
	}
	var persisted settingsstate.Document
	if err := json.Unmarshal(content, &persisted); err != nil {
		t.Fatalf("decode saved settings file: %v", err)
	}
	pythonSelection, ok, err = settingsstate.LanguageServerSelectionForLanguage(persisted, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage persisted python returned error: %v", err)
	}
	if !ok || pythonSelection == nil || *pythonSelection != "setta-basedpyright" {
		t.Fatalf("expected persisted python selection setta-basedpyright, got ok=%v selection=%#v", ok, pythonSelection)
	}

	disableBody, err := json.Marshal(SetLanguageServerSelectionRequest{
		Language: "python",
		PluginID: nil,
	})
	if err != nil {
		t.Fatalf("marshal disable language server selection payload: %v", err)
	}
	disableRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetLanguageServerSelection,
		strings.NewReader(string(disableBody)),
	)
	disableRequest.Header.Set("Content-Type", "application/json")
	disableResponse := httptest.NewRecorder()
	handler.ServeHTTP(disableResponse, disableRequest)
	if disableResponse.Code != http.StatusOK {
		t.Fatalf("expected disable language server selection 200, got %d with body %q", disableResponse.Code, disableResponse.Body.String())
	}

	pythonSelection, ok, err = settingsstate.LanguageServerSelectionForLanguage(runtime.Snapshot().Document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage runtime python after disable returned error: %v", err)
	}
	if !ok || pythonSelection != nil {
		t.Fatalf("expected explicit runtime python null selection after disable, got ok=%v selection=%#v", ok, pythonSelection)
	}
}

func TestRegisterSettingsRoutesSetLanguageServerSelectionRejectsBlankPluginID(t *testing.T) {
	t.Parallel()

	runtime, _ := newSettingsRouteTestRuntime(t)
	handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))
	blankPluginID := "   "

	requestBody, err := json.Marshal(SetLanguageServerSelectionRequest{
		Language: "python",
		PluginID: &blankPluginID,
	})
	if err != nil {
		t.Fatalf("marshal invalid language server selection payload: %v", err)
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetLanguageServerSelection,
		strings.NewReader(string(requestBody)),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid language server selection 400, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestRegisterSettingsRoutesSaveAndLoadPreserveMetaControlSizingOverrides(t *testing.T) {
	t.Parallel()

	// Valid meta-control sizing overrides should round-trip through the direct
	// Go-owned settings save/load surface without being normalized away.
	runtime, settingsPath := newSettingsRouteTestRuntime(t)
	handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))

	document := runtime.Snapshot().Document
	sectionSizingPolicy := document["sectionSizingPolicy"].(map[string]any)
	metaControlByType := sectionSizingPolicy["metaControlByType"].(map[string]any)
	dropzone := metaControlByType["DropzoneParam"].(map[string]any)
	dropzone["minHeight"] = 120
	dropzone["minWidth"] = 300
	dropzone["sizeModeHeight"] = "auto_only"
	dropzone["sizeModeWidth"] = "any"

	requestBody, err := json.Marshal(SaveSettingsRequest{Settings: document})
	if err != nil {
		t.Fatalf("marshal save settings payload: %v", err)
	}
	saveRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSaveSettings,
		strings.NewReader(string(requestBody)),
	)
	saveRequest.Header.Set("Content-Type", "application/json")
	saveResponse := httptest.NewRecorder()
	handler.ServeHTTP(saveResponse, saveRequest)
	if saveResponse.Code != http.StatusOK {
		t.Fatalf("expected save settings 200, got %d with body %q", saveResponse.Code, saveResponse.Body.String())
	}

	loadResponse := httptest.NewRecorder()
	loadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadSettings, nil)
	handler.ServeHTTP(loadResponse, loadRequest)
	if loadResponse.Code != http.StatusOK {
		t.Fatalf("expected load settings 200, got %d with body %q", loadResponse.Code, loadResponse.Body.String())
	}

	var loaded settingsstate.Document
	if err := json.Unmarshal(loadResponse.Body.Bytes(), &loaded); err != nil {
		t.Fatalf("decode load settings payload: %v", err)
	}
	loadedDropzone := loaded["sectionSizingPolicy"].(map[string]any)["metaControlByType"].(map[string]any)["DropzoneParam"].(map[string]any)
	if got := loadedDropzone["minHeight"]; got != float64(120) {
		t.Fatalf("expected load minHeight 120, got %#v", got)
	}
	if got := loadedDropzone["minWidth"]; got != float64(300) {
		t.Fatalf("expected load minWidth 300, got %#v", got)
	}
	if got := loadedDropzone["sizeModeHeight"]; got != "auto_only" {
		t.Fatalf("expected load sizeModeHeight auto_only, got %#v", got)
	}
	if got := loadedDropzone["sizeModeWidth"]; got != "any" {
		t.Fatalf("expected load sizeModeWidth any, got %#v", got)
	}

	content, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read saved settings file: %v", err)
	}
	var persisted settingsstate.Document
	if err := json.Unmarshal(content, &persisted); err != nil {
		t.Fatalf("decode saved settings file: %v", err)
	}
	persistedDropzone := persisted["sectionSizingPolicy"].(map[string]any)["metaControlByType"].(map[string]any)["DropzoneParam"].(map[string]any)
	if got := persistedDropzone["minHeight"]; got != float64(120) {
		t.Fatalf("expected persisted minHeight 120, got %#v", got)
	}
	if got := persistedDropzone["minWidth"]; got != float64(300) {
		t.Fatalf("expected persisted minWidth 300, got %#v", got)
	}
	if got := persistedDropzone["sizeModeHeight"]; got != "auto_only" {
		t.Fatalf("expected persisted sizeModeHeight auto_only, got %#v", got)
	}
	if got := persistedDropzone["sizeModeWidth"]; got != "any" {
		t.Fatalf("expected persisted sizeModeWidth any, got %#v", got)
	}
}

func TestRegisterSettingsRoutesLoadReadsClaimedSlicesFromDedicatedSettingsFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	sharedSettingsPath := filepath.Join(root, settingsstate.DefaultFileName)
	dedicatedGUIPath := filepath.Join(root, "gui-settings.json")
	settingsProjectPath := filepath.Join(root, projectstate.SettingsFileName)

	defaults, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("default settings document: %v", err)
	}

	sharedDocument := defaults.Clone()
	sharedDocument["backend"].(map[string]any)["renameRefactorMode"] = "ALWAYS_RENAME"
	if err := writeSettingsRouteDocument(sharedSettingsPath, sharedDocument); err != nil {
		t.Fatalf("write shared settings document: %v", err)
	}

	dedicatedGUIDocument := defaults.Clone()
	dedicatedGUIDocument["gui"].(map[string]any)["gridColor"] = "#654321"
	if err := writeSettingsRouteDocument(dedicatedGUIPath, dedicatedGUIDocument); err != nil {
		t.Fatalf("write dedicated gui settings document: %v", err)
	}

	writeSettingsRouteProjectClaim(t, settingsProjectPath, "gui", dedicatedGUIPath)

	runtime, _ := newSettingsRouteTestRuntimeWithPaths(t, sharedSettingsPath, settingsProjectPath)
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
	if got := payload["gui"].(map[string]any)["gridColor"]; got != "#654321" {
		t.Fatalf("expected claimed gui slice from dedicated file, got %#v", got)
	}
	if got := payload["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected unclaimed backend slice from shared settings file, got %#v", got)
	}
}

func TestRegisterSettingsRoutesSaveSplitsClaimedSlicesBySettingsProjectPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	sharedSettingsPath := filepath.Join(root, settingsstate.DefaultFileName)
	dedicatedGUIPath := filepath.Join(root, "gui-settings.json")
	settingsProjectPath := filepath.Join(root, projectstate.SettingsFileName)

	writeSettingsRouteProjectClaim(t, settingsProjectPath, "gui", dedicatedGUIPath)

	runtime, _ := newSettingsRouteTestRuntimeWithPaths(t, sharedSettingsPath, settingsProjectPath)
	handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))

	document := runtime.Snapshot().Document
	document["backend"].(map[string]any)["renameRefactorMode"] = "NEVER_RENAME"
	document["gui"].(map[string]any)["gridColor"] = "#abcdef"

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

	sharedContent, err := os.ReadFile(sharedSettingsPath)
	if err != nil {
		t.Fatalf("read shared settings file: %v", err)
	}
	var sharedPayload settingsstate.Document
	if err := json.Unmarshal(sharedContent, &sharedPayload); err != nil {
		t.Fatalf("decode shared settings file: %v", err)
	}
	if got := sharedPayload["backend"].(map[string]any)["renameRefactorMode"]; got != "NEVER_RENAME" {
		t.Fatalf("expected shared settings file to keep backend slice, got %#v", got)
	}
	if _, ok := sharedPayload["gui"]; ok {
		t.Fatalf("expected claimed gui slice to be written to dedicated file instead of shared file, got %#v", sharedPayload)
	}

	dedicatedContent, err := os.ReadFile(dedicatedGUIPath)
	if err != nil {
		t.Fatalf("read dedicated gui settings file: %v", err)
	}
	var dedicatedPayload settingsstate.Document
	if err := json.Unmarshal(dedicatedContent, &dedicatedPayload); err != nil {
		t.Fatalf("decode dedicated gui settings file: %v", err)
	}
	if got := dedicatedPayload["gui"].(map[string]any)["gridColor"]; got != "#abcdef" {
		t.Fatalf("expected dedicated gui settings file to keep claimed gui slice, got %#v", got)
	}
	if _, ok := dedicatedPayload["backend"]; ok {
		t.Fatalf("expected dedicated gui settings file to contain only its claimed slice, got %#v", dedicatedPayload)
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

	// Malformed save payloads should surface through the 422 validation envelope.
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

func TestRegisterSettingsRoutesSaveRejectsUnknownTopLevelSettingsBranch(t *testing.T) {
	t.Parallel()

	// The source SettingsState root rejects unknown top-level settings branches.
	runtime, _ := newSettingsRouteTestRuntime(t)
	handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))
	before := runtime.Snapshot()

	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSaveSettings,
		strings.NewReader(`{"settings":{"unexpectedSettingsBranch":true}}`),
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
	if !strings.Contains(payload.Message, "settings.unexpectedSettingsBranch") {
		t.Fatalf("expected unexpected branch detail in %q", payload.Message)
	}
	if payload.Data != nil {
		t.Fatalf("expected nil validation data, got %#v", payload.Data)
	}

	after := runtime.Snapshot()
	if got := after.Document["backend"].(map[string]any)["renameRefactorMode"]; got != before.Document["backend"].(map[string]any)["renameRefactorMode"] {
		t.Fatalf("expected rejected save to preserve runtime snapshot, got before=%#v after=%#v", before.Document["backend"], after.Document["backend"])
	}
}

func TestRegisterSettingsRoutesSaveRejectsTypedInvalidNestedSettings(t *testing.T) {
	t.Parallel()

	// The live save route should reject typed-invalid settings on the current Go-owned save surface.
	for _, testCase := range []struct {
		name           string
		mutate         func(settingsstate.Document)
		expectedDetail string
	}{
		{
			name: "backend rename enum",
			mutate: func(document settingsstate.Document) {
				document["backend"].(map[string]any)["renameRefactorMode"] = "MAYBE"
			},
			expectedDetail: "backend.renameRefactorMode",
		},
		{
			name: "shortcuts string field",
			mutate: func(document settingsstate.Document) {
				document["shortcuts"].(map[string]any)["searchShortcut"] = false
			},
			expectedDetail: "shortcuts.searchShortcut",
		},
		{
			name: "gui snap grid length",
			mutate: func(document settingsstate.Document) {
				document["gui"].(map[string]any)["snapGrid"] = []any{15}
			},
			expectedDetail: "gui.snapGrid",
		},
		{
			name: "gui color choices element",
			mutate: func(document settingsstate.Document) {
				document["gui"].(map[string]any)["sectionTagColorChoices"] = []any{
					map[string]any{"color": 7, "description": "Broken"},
				}
			},
			expectedDetail: "gui.sectionTagColorChoices.0.color",
		},
		{
			name: "section sizing meta control enum",
			mutate: func(document settingsstate.Document) {
				document["sectionSizingPolicy"].(map[string]any)["metaControlByType"].(map[string]any)["DropdownParam"].(map[string]any)["sizeModeHeight"] = "sometimes"
			},
			expectedDetail: "sectionSizingPolicy.metaControlByType.DropdownParam.sizeModeHeight",
		},
		{
			name: "language server root object",
			mutate: func(document settingsstate.Document) {
				document["languageServer"] = false
			},
			expectedDetail: "languageServer",
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			runtime, _ := newSettingsRouteTestRuntime(t)
			handler := newSettingsRouteTestHandler(t, config.ModeIDE, runtime, realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}))
			before := runtime.Snapshot()
			document, err := settingsstate.DefaultDocument()
			if err != nil {
				t.Fatalf("default settings document: %v", err)
			}
			testCase.mutate(document)
			body, err := json.Marshal(map[string]any{"settings": document})
			if err != nil {
				t.Fatalf("marshal settings request: %v", err)
			}
			response := httptest.NewRecorder()
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSaveSettings,
				bytes.NewReader(body),
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
			if !strings.Contains(payload.Message, testCase.expectedDetail) {
				t.Fatalf("expected validation detail %q in %q", testCase.expectedDetail, payload.Message)
			}
			if payload.Data != nil {
				t.Fatalf("expected nil validation data, got %#v", payload.Data)
			}

			after := runtime.Snapshot()
			if got := after.Document["backend"].(map[string]any)["renameRefactorMode"]; got != before.Document["backend"].(map[string]any)["renameRefactorMode"] {
				t.Fatalf("expected rejected save to preserve runtime snapshot, got before=%#v after=%#v", before.Document["backend"], after.Document["backend"])
			}
		})
	}
}

func newSettingsRouteTestRuntime(t *testing.T) (*settingsstate.Runtime, string) {
	t.Helper()

	settingsPath := filepath.Join(t.TempDir(), settingsstate.DefaultFileName)
	return newSettingsRouteTestRuntimeWithPaths(t, settingsPath, "")
}

func newSettingsRouteTestRuntimeWithPaths(t *testing.T, settingsPath string, settingsProjectPath string) (*settingsstate.Runtime, string) {
	t.Helper()

	store, err := settingsstate.NewStore(settingsPath, settingsstate.StoreOptions{
		SettingsProjectPath: settingsProjectPath,
	})
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

func newSettingsRouteTestRuntimeWithDocument(t *testing.T, document settingsstate.Document) (*settingsstate.Runtime, string) {
	t.Helper()

	settingsPath := filepath.Join(t.TempDir(), settingsstate.DefaultFileName)
	store, err := settingsstate.NewStore(settingsPath, settingsstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new settings store: %v", err)
	}
	if err := store.Save(t.Context(), document); err != nil {
		t.Fatalf("save settings document: %v", err)
	}
	runtime, err := settingsstate.OpenRuntime(t.Context(), store)
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

func writeSettingsRouteProjectClaim(
	t *testing.T,
	settingsProjectPath string,
	claimedSlice string,
	claimedPath string,
) {
	t.Helper()

	sharedSettingsPath := filepath.Join(filepath.Dir(settingsProjectPath), settingsstate.DefaultFileName)
	settingsRuntime, _ := newSettingsRouteTestRuntimeWithPaths(t, sharedSettingsPath, "")
	settingsProjectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsProjectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})
	if err := settingsstate.EnsureProjectRuntimeBootstrapped(context.Background(), settingsRuntime, settingsProjectRuntime); err != nil {
		t.Fatalf("bootstrap settings project runtime: %v", err)
	}
	settingsProjectDocument := settingsProjectRuntime.Snapshot().Document
	project, err := settingsProjectDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("settings project by id: %v", err)
	}
	variantID := ""
	for sectionID, section := range project.Sections {
		if section.Name != claimedSlice {
			continue
		}
		variantID = project.SectionVariantMap[sectionID]
		break
	}
	if variantID == "" {
		t.Fatalf("missing settings section for claimed slice %q", claimedSlice)
	}
	variant := project.SectionVariants[variantID]
	variant.Name = claimedPath
	project.SectionVariants[variantID] = variant
	settingsProjectDocument.Projects[settingsstate.SettingsProjectID] = project

	store, err := projectstate.NewStore(settingsProjectPath, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new settings project store: %v", err)
	}
	if err := store.Save(context.Background(), settingsProjectDocument); err != nil {
		t.Fatalf("save settings project document: %v", err)
	}
}

func writeSettingsRouteDocument(path string, payload map[string]any) error {
	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(content, '\n'), 0o644)
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
				PluginRuntime: &stubPluginRuntimeUpdateService{
					response: newTestPluginRuntimeResponse(),
				},
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
