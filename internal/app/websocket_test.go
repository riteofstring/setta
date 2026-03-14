package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/auth"
	"setta/internal/backendlogs"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
	"setta/internal/wsapi"
)

type appRouteEnvelope struct {
	MessageType string          `json:"messageType"`
	Content     json.RawMessage `json:"content"`
}

func TestAppServesFrontendWebsocketRoute(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

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

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	var identity realtime.FrontendIdentityContent
	foundIdentity := false
	for range 2 {
		message := readAppRouteEnvelope(t, conn)
		if message.MessageType != realtime.MessageTypeFrontendIdentity {
			continue
		}
		if err := json.Unmarshal(message.Content, &identity); err != nil {
			t.Fatalf("decode frontend identity content: %v", err)
		}
		foundIdentity = true
		break
	}
	if !foundIdentity {
		t.Fatal("expected frontend identity message from app websocket route")
	}
	if strings.TrimSpace(identity.FrontendAffinityToken) == "" {
		t.Fatal("expected non-empty frontend affinity token")
	}
}

func TestAppServesFrontendWebsocketRouteForConfiguredDevFrontendOrigin(t *testing.T) {
	t.Setenv("SETTA_DEV_FRONTEND_PORT", "3000")
	t.Setenv("SETTA_DEV_FRONTEND_SCHEME", "http")

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
			"Origin": []string{"http://127.0.0.1:3000"},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route with dev frontend origin: %v", err)
	}
	defer conn.CloseNow()

	identity := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)
	var payload realtime.FrontendIdentityContent
	if err := json.Unmarshal(identity.Content, &payload); err != nil {
		t.Fatalf("decode frontend identity content: %v", err)
	}
	if strings.TrimSpace(payload.FrontendAffinityToken) == "" {
		t.Fatal("expected non-empty frontend affinity token")
	}
}

func TestAppSaveSettingsBroadcastsUpdateSettings(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

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

	authCookie := newAppTestAuthCookie(t, app)

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	// Saving settings should update the runtime snapshot and notify connected frontends.
	document := app.SettingsState().Snapshot().Document
	document["backend"].(map[string]any)["renameRefactorMode"] = "ALWAYS_RENAME"

	requestBody, err := json.Marshal(httpapi.SaveSettingsRequest{Settings: document})
	if err != nil {
		t.Fatalf("marshal save settings request: %v", err)
	}
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSaveSettings,
		strings.NewReader(string(requestBody)),
	)
	if err != nil {
		t.Fatalf("new save settings request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post save settings: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateSettings, 4)
	var websocketPayload settingsstate.Document
	if err := json.Unmarshal(envelope.Content, &websocketPayload); err != nil {
		t.Fatalf("decode websocket settings payload: %v", err)
	}
	if got := websocketPayload["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected websocket renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if got := app.SettingsState().Snapshot().Document["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected runtime renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
}

func TestAppSaveLLMConfigBroadcastsLLMUpdates(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	if err := os.WriteFile(
		llmconfig.ManagedAPIKeysPath(cfg.Paths.WorkspaceRoot),
		[]byte("ANTHROPIC_API_KEY=managed-secret\nSETTA_MANAGED_LLM_API_KEY_NAMES=[\"ANTHROPIC_API_KEY\"]\n"),
		0o644,
	); err != nil {
		t.Fatalf("seed managed api keys: %v", err)
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	payload, err := json.Marshal(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"anthropic-main": {
				ID:        "anthropic-main",
				Model:     "claude-sonnet",
				Provider:  "anthropic",
				APIKeyEnv: "ANTHROPIC_API_KEY",
			},
		},
		MCPServers:      map[string]llmconfig.ServerConfig{},
		DefaultConfigID: "anthropic-main",
	})
	if err != nil {
		t.Fatalf("marshal llm config request: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLLMConfig, strings.NewReader(string(payload)))
	if err != nil {
		t.Fatalf("new llm config request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post llm config: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	configEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLLMConfigUpdated, 4)
	var configPayload llmconfig.AllConfigs
	if err := json.Unmarshal(configEnvelope.Content, &configPayload); err != nil {
		t.Fatalf("decode llm config websocket payload: %v", err)
	}
	if configPayload.DefaultConfigID != "anthropic-main" {
		t.Fatalf("expected websocket default config id anthropic-main, got %#v", configPayload)
	}

	apiKeysEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLLMAPIKeysUpdated, 4)
	var apiKeysPayload llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(apiKeysEnvelope.Content, &apiKeysPayload); err != nil {
		t.Fatalf("decode llm api keys websocket payload: %v", err)
	}
	if got := apiKeysPayload.APIKeys["ANTHROPIC_API_KEY"]; got != "managed-secret" {
		t.Fatalf("expected managed api key refresh after config save, got %#v", apiKeysPayload)
	}
	if apiKeysPayload.Revision <= 0 {
		t.Fatalf("expected positive managed api key revision, got %#v", apiKeysPayload)
	}
}

func TestAppSetLLMAPIKeysBroadcastsRevisionedSnapshot(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-main": {
				ID:        "openai-main",
				Model:     "gpt-4o",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers:      map[string]llmconfig.ServerConfig{},
		DefaultConfigID: "openai-main",
	}); err != nil {
		t.Fatalf("seed llm config: %v", err)
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteLLMAPIKeys,
		strings.NewReader(`{"apiKeys":{"OPENAI_API_KEY":"saved-secret"},"expectedRevision":0}`),
	)
	if err != nil {
		t.Fatalf("new llm api keys request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post llm api keys: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}
	var routePayload llmconfig.ManagedAPIKeysSnapshot
	if err := json.NewDecoder(response.Body).Decode(&routePayload); err != nil {
		t.Fatalf("decode llm api keys response: %v", err)
	}
	if routePayload.Revision <= 0 {
		t.Fatalf("expected positive revision, got %#v", routePayload)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLLMAPIKeysUpdated, 4)
	var websocketPayload llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(envelope.Content, &websocketPayload); err != nil {
		t.Fatalf("decode llm api keys websocket payload: %v", err)
	}
	if got := websocketPayload.APIKeys["OPENAI_API_KEY"]; got != "saved-secret" {
		t.Fatalf("expected saved secret in websocket payload, got %#v", websocketPayload)
	}
	if websocketPayload.Revision != routePayload.Revision {
		t.Fatalf("expected websocket revision %d, got %#v", routePayload.Revision, websocketPayload)
	}
}

func TestAppSaveSettingsProjectMaterializesLiveSettings(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

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

	authCookie := newAppTestAuthCookie(t, app)

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	if _, err := app.ProjectStates().Settings().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		return appSettingsProjectMaterializerTestDocument(t), nil
	}); err != nil {
		t.Fatalf("save settings project runtime: %v", err)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateSettings, 4)
	var websocketPayload settingsstate.Document
	if err := json.Unmarshal(envelope.Content, &websocketPayload); err != nil {
		t.Fatalf("decode websocket settings payload: %v", err)
	}
	if got := websocketPayload["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected websocket renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if got := websocketPayload["backend"].(map[string]any)["autosave"]; got != false {
		t.Fatalf("expected websocket autosave false, got %#v", got)
	}

	runtimeDocument := app.SettingsState().Snapshot().Document
	if got := runtimeDocument["terminalSectionDefault"].(map[string]any)["size"].(map[string]any)["height"]; got != float64(222) {
		t.Fatalf("expected runtime terminal height 222, got %#v", got)
	}

	content, err := os.ReadFile(filepath.Join(cfg.Paths.SettaFilesRoot, settingsstate.DefaultFileName))
	if err != nil {
		t.Fatalf("read persisted settings file: %v", err)
	}
	var persisted settingsstate.Document
	if err := json.Unmarshal(content, &persisted); err != nil {
		t.Fatalf("decode persisted settings file: %v", err)
	}
	if got := persisted["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected persisted renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
}

func TestAppBroadcastsAndHydratesLSPDiagnostics(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

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

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	seedAppLSPCodeSectionProjectWithSource(t, app, "__fixture_error__\n")
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save lsp diagnostics project: %v", err)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeLSPDiagnostics, 4)
	var websocketPayload projectstate.LSPDiagnosticsPayload
	if err := json.Unmarshal(envelope.Content, &websocketPayload); err != nil {
		t.Fatalf("decode websocket diagnostics payload: %v", err)
	}
	assertAppLSPDiagnosticsPayload(t, websocketPayload)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLatestLSPDiagnostics,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	if err != nil {
		t.Fatalf("new diagnostics request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post latest diagnostics: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var routePayload projectstate.LSPDiagnosticsPayload
	if err := json.NewDecoder(response.Body).Decode(&routePayload); err != nil {
		t.Fatalf("decode route diagnostics payload: %v", err)
	}
	assertAppLSPDiagnosticsPayload(t, routePayload)
}

func appSettingsProjectMaterializerTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "settings-home",
		Projects: map[string]projectstate.Project{
			"settings-home": {
				ID:   "settings-home",
				Name: "Settings Home",
				TopLevelSectionIDs: []string{
					"backend-section",
					"terminal-section",
				},
				SectionVariantMap: map[string]string{
					"backend-section":  "backend-variant",
					"terminal-section": "terminal-variant",
				},
				Sections: map[string]projectstate.Section{
					"backend-section": {
						ID:               "backend-section",
						Name:             "backend",
						VariantIDs:       []string{"backend-variant"},
						DefaultVariantID: "backend-variant",
					},
					"terminal-section": {
						ID:               "terminal-section",
						Name:             "terminalSectionDefault",
						VariantIDs:       []string{"terminal-variant"},
						DefaultVariantID: "terminal-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"backend-variant": {
						ID:     "backend-variant",
						ImplID: "backend-impl",
					},
					"terminal-variant": {
						ID:     "terminal-variant",
						ImplID: "terminal-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"backend-impl": {
						ID:   "backend-impl",
						Kind: projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{
							"id":"backend-impl",
							"type":"Dict",
							"isJsonSource":true,
							"jsonSourceKeys":["backend"],
							"topLevelParamId":"backend-root",
							"codeObjVariantMap":{
								"backend-root":"backend-root-variant",
								"rename-setting":"rename-setting-variant",
								"autosave-setting":"autosave-setting-variant"
							}
						}`),
					},
					"terminal-impl": {
						ID:   "terminal-impl",
						Kind: projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{
							"id":"terminal-impl",
							"type":"Dict",
							"isJsonSource":true,
							"jsonSourceKeys":["terminalSectionDefault"],
							"topLevelParamId":"terminal-root",
							"codeObjVariantMap":{
								"terminal-root":"terminal-root-variant",
								"size-setting":"size-setting-variant",
								"height-setting":"height-setting-variant"
							}
						}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"backend-root": {
						ID:               "backend-root",
						Name:             "backend",
						VariantIDs:       []string{"backend-root-variant"},
						DefaultVariantID: "backend-root-variant",
					},
					"rename-setting": {
						ID:               "rename-setting",
						Name:             "renameRefactorMode",
						VariantIDs:       []string{"rename-setting-variant"},
						DefaultVariantID: "rename-setting-variant",
					},
					"autosave-setting": {
						ID:               "autosave-setting",
						Name:             "autosave",
						VariantIDs:       []string{"autosave-setting-variant"},
						DefaultVariantID: "autosave-setting-variant",
					},
					"terminal-root": {
						ID:               "terminal-root",
						Name:             "terminalSectionDefault",
						VariantIDs:       []string{"terminal-root-variant"},
						DefaultVariantID: "terminal-root-variant",
					},
					"size-setting": {
						ID:               "size-setting",
						Name:             "size",
						VariantIDs:       []string{"size-setting-variant"},
						DefaultVariantID: "size-setting-variant",
					},
					"height-setting": {
						ID:               "height-setting",
						Name:             "height",
						VariantIDs:       []string{"height-setting-variant"},
						DefaultVariantID: "height-setting-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"backend-root-variant": {
						ID:     "backend-root-variant",
						ImplID: "backend-root-impl",
					},
					"rename-setting-variant": {
						ID:     "rename-setting-variant",
						ImplID: "rename-setting-impl",
					},
					"autosave-setting-variant": {
						ID:     "autosave-setting-variant",
						ImplID: "autosave-setting-impl",
					},
					"terminal-root-variant": {
						ID:     "terminal-root-variant",
						ImplID: "terminal-root-impl",
					},
					"size-setting-variant": {
						ID:     "size-setting-variant",
						ImplID: "size-setting-impl",
					},
					"height-setting-variant": {
						ID:     "height-setting-variant",
						ImplID: "height-setting-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"backend-root-impl": {
						ID:   "backend-root-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"backend-root-impl",
							"type":"NestedParam",
							"children":["rename-setting","autosave-setting"]
						}`),
					},
					"rename-setting-impl": {
						ID:   "rename-setting-impl",
						Type: "TextParam",
						Payload: projectstate.RawJSON(`{
							"id":"rename-setting-impl",
							"type":"TextParam",
							"value":"ALWAYS_RENAME"
						}`),
					},
					"autosave-setting-impl": {
						ID:   "autosave-setting-impl",
						Type: "SwitchParam",
						Payload: projectstate.RawJSON(`{
							"id":"autosave-setting-impl",
							"type":"SwitchParam",
							"value":"false"
						}`),
					},
					"terminal-root-impl": {
						ID:   "terminal-root-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"terminal-root-impl",
							"type":"NestedParam",
							"children":["size-setting"]
						}`),
					},
					"size-setting-impl": {
						ID:   "size-setting-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"size-setting-impl",
							"type":"NestedParam",
							"children":["height-setting"]
						}`),
					},
					"height-setting-impl": {
						ID:   "height-setting-impl",
						Type: "TextParam",
						Payload: projectstate.RawJSON(`{
							"id":"height-setting-impl",
							"type":"TextParam",
							"value":"222"
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize settings project document: %v", err)
	}
	return document
}

func TestAppBroadcastsDedupedWatchCodeSignatureWarnings(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
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

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			WatchCodeEnabled: true,
			WatchCodeFolders: []projectstate.WatchCodeFolder{
				{Path: "pkg", Recursive: false},
			},
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  json.RawMessage(`{"language":"python"}`),
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed watch code project: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save watch code project: %v", err)
	}

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

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	watchFile := filepath.Join(watchDir, "missing.py")
	if err := os.WriteFile(watchFile, []byte("def MissingFunc(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write initial watch file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project) bool {
		entry, ok := project.WatchCodeRegistry["pkg.missing.MissingFunc:function"]
		return ok && len(entry.SectionIDs) == 1 && entry.SectionsCount == 1
	})

	initialSnapshot := app.ProjectStates().Main().Snapshot()
	initialHash := initialSnapshot.Document.Projects["project-alpha"].WatchCodeRegistry["pkg.missing.MissingFunc:function"].SignatureHash

	if err := os.WriteFile(watchFile, []byte("def MissingFunc(value, extra):\n    return value + extra\n"), 0o644); err != nil {
		t.Fatalf("write signature-change watch file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project) bool {
		entry, ok := project.WatchCodeRegistry["pkg.missing.MissingFunc:function"]
		return ok && entry.SignatureHash != initialHash
	})

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeNotification, 4)
	var notification realtime.NotificationContent
	if err := json.Unmarshal(envelope.Content, &notification); err != nil {
		t.Fatalf("decode notification content: %v", err)
	}
	if notification.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha warning notification, got %#v", notification)
	}
	if notification.Type != realtime.NotificationTypeWarning {
		t.Fatalf("expected warning notification type, got %#v", notification)
	}
	if notification.Message != "Watch Code could not resolve params for MissingFunc. Verify the module import path or add imports in gen code prefix." {
		t.Fatalf("unexpected warning notification %#v", notification)
	}
	if !notification.Temporary {
		t.Fatalf("expected temporary warning notification, got %#v", notification)
	}
	if notification.Timestamp == "" {
		t.Fatalf("expected warning notification timestamp, got %#v", notification)
	}

	secondSnapshot := app.ProjectStates().Main().Snapshot()
	secondHash := secondSnapshot.Document.Projects["project-alpha"].WatchCodeRegistry["pkg.missing.MissingFunc:function"].SignatureHash

	if err := os.WriteFile(watchFile, []byte("def MissingFunc(value, extra, third):\n    return value + extra + third\n"), 0o644); err != nil {
		t.Fatalf("write repeated signature-change watch file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project) bool {
		entry, ok := project.WatchCodeRegistry["pkg.missing.MissingFunc:function"]
		return ok && entry.SignatureHash != secondHash
	})

	assertNoAppRouteEnvelopeOfType(t, conn, realtime.MessageTypeNotification, 750*time.Millisecond)
}

func TestAppSetSectionNameRouteBroadcastsRenamePromptAndProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = renameRefactorServiceTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed rename refactor project: %v", err)
	}
	if _, err := app.SettingsState().Mutate(func(document settingsstate.Document) (settingsstate.Document, error) {
		next := renameRefactorSettingsDocument(t, projectstate.RenameRefactorModeAlwaysAsk)
		return next, nil
	}); err != nil {
		t.Fatalf("seed rename refactor settings: %v", err)
	}

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

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetSectionName,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"source","name":"Renamed Section","frontendOpId":"rename-op-1"}`),
	)
	if err != nil {
		t.Fatalf("new set section name request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set section name: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var (
		foundProjectUpdate bool
		foundRenamePrompt  bool
	)
	for range 6 {
		envelope := readAppRouteEnvelope(t, conn)
		switch envelope.MessageType {
		case realtime.MessageTypeUpdateFrontendProjectState:
			var content realtime.ProjectStateUpdateContent
			if err := json.Unmarshal(envelope.Content, &content); err != nil {
				t.Fatalf("decode project state update content: %v", err)
			}
			if content.ProjectState.ProjectConfig.ID != "project-alpha" {
				t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
			}
			completedRenameOp := false
			for _, completedOpID := range content.CompletedOpIDs {
				if completedOpID == "rename-op-1" {
					completedRenameOp = true
					break
				}
			}
			if !completedRenameOp {
				t.Fatalf("expected completed rename op in websocket project update, got %#v", content.CompletedOpIDs)
			}
			foundProjectUpdate = true
		case realtime.MessageTypeReturnRenameRefactorResults:
			var content realtime.RenameRefactorBroadcastContent
			if err := json.Unmarshal(envelope.Content, &content); err != nil {
				t.Fatalf("decode rename refactor content: %v", err)
			}
			if content.ProjectConfigID != "project-alpha" {
				t.Fatalf("expected project-alpha rename prompt, got %q", content.ProjectConfigID)
			}
			if content.FrontendOpID != "rename-op-1" {
				t.Fatalf("expected rename-op-1 prompt, got %q", content.FrontendOpID)
			}
			if content.RenameMode != projectstate.RenameRefactorModeAlwaysAsk {
				t.Fatalf("expected ALWAYS_ASK rename mode, got %q", content.RenameMode)
			}
			if len(content.ChangedNodeValues) != 1 {
				t.Fatalf("expected one changed node value, got %#v", content.ChangedNodeValues)
			}
			if content.ChangedNodeValues[0].NewValue != "state.Renamed_Section + state.Renamed_Section" {
				t.Fatalf("unexpected rename prompt new value %q", content.ChangedNodeValues[0].NewValue)
			}
			foundRenamePrompt = true
		}
		if foundProjectUpdate && foundRenamePrompt {
			break
		}
	}
	if !foundProjectUpdate {
		t.Fatal("expected websocket project state update after section rename")
	}
	if !foundRenamePrompt {
		t.Fatal("expected websocket rename prompt after section rename")
	}
}

func TestAppServesTerminalWebsocketRoute(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

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

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(strings.Replace(wsapi.RouteTerminalBySection, "{projectID}", "project-a", 1), "{sectionID}", "section-a", 1), &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial terminal websocket route: %v", err)
	}
	defer conn.CloseNow()

	if frame := readAppRawFrame(t, conn); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", frame)
	}
}

func TestAppServesTerminalWebsocketReconnectAndReplaysBufferedHistory(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	sessionID := terminals.BuildTerminalID("section-a", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open app terminal: %v", err)
	}

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

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + strings.Replace(strings.Replace(wsapi.RouteTerminalBySection, "{projectID}", "project-a", 1), "{sectionID}", "section-a", 1)
	headers := http.Header{
		"Cookie": []string{cookieName + "=" + token},
	}

	first, _, err := websocket.Dial(context.Background(), wsURL, &websocket.DialOptions{
		HTTPHeader: headers,
	})
	if err != nil {
		t.Fatalf("dial first terminal websocket route: %v", err)
	}

	if frame := readAppRawFrame(t, first); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", frame)
	}

	if err := first.Write(context.Background(), websocket.MessageText, []byte("first app line\n")); err != nil {
		t.Fatalf("write first terminal input: %v", err)
	}
	if output := readAppRawFrameUntilContains(t, first, "first app line", 4); !strings.Contains(output, "first app line") {
		t.Fatalf("expected terminal output to include first app line, got %q", output)
	}
	if err := first.Close(websocket.StatusNormalClosure, ""); err != nil {
		t.Fatalf("close first terminal websocket: %v", err)
	}

	if err := app.Terminals().Write(sessionID, []byte("after disconnect\n")); err != nil {
		t.Fatalf("write buffered app terminal output after disconnect: %v", err)
	}
	waitForCondition(t, func() bool {
		history, err := app.Terminals().History(sessionID)
		if err != nil {
			return false
		}
		return strings.Contains(history, "after disconnect")
	})

	second, _, err := websocket.Dial(context.Background(), wsURL, &websocket.DialOptions{
		HTTPHeader: headers,
	})
	if err != nil {
		t.Fatalf("dial second terminal websocket route: %v", err)
	}
	defer second.CloseNow()

	if frame := readAppRawFrame(t, second); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker on reconnect, got %q", frame)
	}
	replayedHistory := readAppRawFrame(t, second)
	if !strings.Contains(replayedHistory, "first app line") || !strings.Contains(replayedHistory, "after disconnect") {
		t.Fatalf("expected reattached app terminal history to include buffered output, got %q", replayedHistory)
	}
}

func TestAppServesTerminalWebsocketResizeUpdatesStoredSessionDimensions(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	sessionID := terminals.BuildTerminalID("section-a", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open app terminal: %v", err)
	}

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

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(strings.Replace(wsapi.RouteTerminalBySection, "{projectID}", "project-a", 1), "{sectionID}", "section-a", 1), &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial terminal websocket route: %v", err)
	}
	defer conn.CloseNow()

	if frame := readAppRawFrame(t, conn); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", frame)
	}

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"terminalResize","rows":31,"cols":97}`)); err != nil {
		t.Fatalf("write app terminal resize message: %v", err)
	}

	waitForCondition(t, func() bool {
		info, ok := app.Terminals().Session(sessionID)
		return ok && info.Rows == 31 && info.Columns == 97
	})

	info, ok := app.Terminals().Session(sessionID)
	if !ok {
		t.Fatal("expected app terminal session to exist after resize")
	}
	if info.Rows != 31 || info.Columns != 97 {
		t.Fatalf("expected stored app terminal size 97x31, got %dx%d", info.Columns, info.Rows)
	}
}

func TestAppServesListenerForceRefreshRoute(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.SchemaVersion = projectstate.CurrentSchemaVersion
		document.DefaultProjectID = "project-alpha"
		if document.Projects == nil {
			document.Projects = map[string]projectstate.Project{}
		}
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed listener project state: %v", err)
	}

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

	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-a", 1)+"?projectId=project-alpha",
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{cookieName + "=" + token},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		targets := app.ListenerBroadcaster().Registry().BootstrapConnectionIDs("project-alpha", "")
		if len(targets) == 1 && targets[0] == "listener-a" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if targets := app.ListenerBroadcaster().Registry().BootstrapConnectionIDs("project-alpha", ""); len(targets) != 1 || targets[0] != "listener-a" {
		t.Fatalf("expected listener bootstrap for project-alpha, got %#v", targets)
	}

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteForceRefreshListener,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	if err != nil {
		t.Fatalf("new force refresh request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post listener force refresh: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, listenerConn, realtime.MessageTypeListenerForceRefresh, 1)

	var content realtime.ListenerForceRefreshContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener force refresh content: %v", err)
	}
	if content.ProjectID != "project-alpha" {
		t.Fatalf("expected project-alpha force refresh, got %q", content.ProjectID)
	}

	var projectState projectview.SingleConfig
	if err := json.Unmarshal(content.ProjectState, &projectState); err != nil {
		t.Fatalf("decode listener force refresh project state: %v", err)
	}
	if projectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha project config, got %q", projectState.ProjectConfig.ID)
	}
}

func TestAppServesListenerCoverageRoute(t *testing.T) {
	// The real app stack should serve listener coverage from the Go registry
	// after a listener registers callbacks over the websocket route.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

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

	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-a", 1)+"?projectId=project-alpha",
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{cookieName + "=" + token},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["section-a.param-a"],"dependencyMode":"realtime_only"},"cb-b":{"dependencies":[],"dependencyMode":"always"}}}}`)); err != nil {
		t.Fatalf("write listener registration: %v", err)
	}

	if ack := readAppRouteEnvelope(t, listenerConn); ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetListenerCoverage,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	if err != nil {
		t.Fatalf("new listener coverage request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post listener coverage: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload realtime.ListenerCoverageSnapshot
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode listener coverage payload: %v", err)
	}
	if payload.ProjectID != "project-alpha" {
		t.Fatalf("expected project-alpha snapshot, got %q", payload.ProjectID)
	}
	if !payload.HasRealtimeWildcard {
		t.Fatal("expected realtime wildcard from empty dependency registration")
	}
	if len(payload.Dependencies) != 1 {
		t.Fatalf("expected 1 explicit dependency, got %#v", payload.Dependencies)
	}
	if payload.Dependencies[0] != (realtime.ListenerCoverageDependency{Type: realtime.DependencyKeyTypeSectionParam, SectionID: "section-a", CodeObjID: "param-a"}) {
		t.Fatalf("unexpected coverage dependency %#v", payload.Dependencies[0])
	}
}

func TestAppListenerWebsocketDispatchesPluginListenerEndpoint(t *testing.T) {
	// The real IDE app should invoke plugin listener endpoints over the Go listener websocket and still deliver emitted dependency events.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	prepareAppPluginWorkerRuntime(t)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend")
	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "fixture-project",
		Projects: map[string]projectstate.Project{
			"fixture-project": {
				ID:   "fixture-project",
				Name: "Fixture Project",
			},
		},
	}); err != nil {
		t.Fatalf("save app project document: %v", err)
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

	authCookie := newAppTestAuthCookie(t, app)
	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-a", 1)+"?projectId=fixture-project",
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["fixture-section"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}
	if ack := readAppRouteEnvelope(t, listenerConn); ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRouterEndpointCall","content":{"projectConfigId":"fixture-project","callId":"call-1","endpointName":"fixture_listener_endpoint","payload":{"sectionId":"fixture-section","payload":"hello"}}}`)); err != nil {
		t.Fatalf("write listener router endpoint call: %v", err)
	}

	var (
		resultContent     realtime.ListenerRouterEndpointResultContent
		dependencyContent realtime.ListenerDependencyEventContent
		foundResult       bool
		foundDependency   bool
	)
	for range 4 {
		envelope := readAppRouteEnvelope(t, listenerConn)
		switch envelope.MessageType {
		case realtime.MessageTypeListenerRouterResult:
			if err := json.Unmarshal(envelope.Content, &resultContent); err != nil {
				t.Fatalf("decode listener router endpoint result: %v", err)
			}
			foundResult = true
		case realtime.MessageTypeListenerDependencyEvent:
			if err := json.Unmarshal(envelope.Content, &dependencyContent); err != nil {
				t.Fatalf("decode listener dependency event: %v", err)
			}
			foundDependency = true
		}
		if foundResult && foundDependency {
			break
		}
	}
	if !foundResult {
		t.Fatal("expected listener router endpoint result message")
	}
	if !foundDependency {
		t.Fatal("expected listener dependency event message")
	}
	if resultContent.ProjectConfigID != "fixture-project" || resultContent.CallID != "call-1" || !resultContent.OK {
		t.Fatalf("unexpected listener router endpoint result %#v", resultContent)
	}

	resultPayload, ok := resultContent.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected listener router endpoint result payload map, got %#v", resultContent.Result)
	}
	if resultPayload["ok"] != true || resultPayload["projectConfigId"] != "fixture-project" || resultPayload["sectionId"] != "fixture-section" {
		t.Fatalf("unexpected listener endpoint payload %#v", resultPayload)
	}

	if dependencyContent.ProjectID != "fixture-project" || dependencyContent.Sequence == 0 {
		t.Fatalf("unexpected dependency event content %#v", dependencyContent)
	}
	if len(dependencyContent.DependencyEvents) != 1 {
		t.Fatalf("expected one dependency event, got %#v", dependencyContent.DependencyEvents)
	}
	if dependencyContent.DependencyEvents[0].DependencyKey != "fixture-section" {
		t.Fatalf("expected fixture-section dependency key, got %#v", dependencyContent.DependencyEvents[0].DependencyKey)
	}
	if string(dependencyContent.DependencyEvents[0].Payload) != `{"type":"Literal","payload":"hello"}` {
		t.Fatalf("unexpected dependency payload %s", string(dependencyContent.DependencyEvents[0].Payload))
	}
}

func TestAppRunCodeDrawSnapshotsBroadcastBinaryListenerRealtimeEvent(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

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
	authCookie := &http.Cookie{
		Name:  cookieName,
		Value: token,
	}

	listenerConn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(wsapi.RouteListenerByID, "{listenerID}", "listener-a", 1)+"?projectId=project-alpha",
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				"Cookie": []string{cookieName + "=" + token},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial listener websocket route: %v", err)
	}
	defer listenerConn.CloseNow()

	if err := listenerConn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerRegister","content":{"callbacks":{"cb-a":{"dependencies":["draw-section"],"dependencyMode":"realtime_only"}}}}`)); err != nil {
		t.Fatalf("write listener register message: %v", err)
	}

	ack := readAppRouteEnvelope(t, listenerConn)
	if ack.MessageType != realtime.MessageTypeListenerRegisterAck {
		t.Fatalf("expected listener register ack, got %q", ack.MessageType)
	}

	uploadBody, uploadContentType := buildAppBinaryUploadBody(t, []byte("listener-snapshot"), "")
	uploadRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteBinaryUpload, uploadBody)
	if err != nil {
		t.Fatalf("new binary upload request: %v", err)
	}
	uploadRequest.Header.Set("Content-Type", uploadContentType)
	uploadRequest.AddCookie(authCookie)

	uploadResponse, err := http.DefaultClient.Do(uploadRequest)
	if err != nil {
		t.Fatalf("post binary upload: %v", err)
	}
	defer uploadResponse.Body.Close()
	if uploadResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uploadResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", uploadResponse.StatusCode, string(body))
	}

	var ref binarypayload.ContentRef
	if err := json.NewDecoder(uploadResponse.Body).Decode(&ref); err != nil {
		t.Fatalf("decode binary upload response: %v", err)
	}

	runRequestBody, err := json.Marshal(httpapi.RunCodeRequest{
		ProjectID:       "project-alpha",
		SectionID:       "code-section",
		RunSnapshotMode: "never",
		DrawSnapshotsBySectionID: map[string]binarypayload.ContentRef{
			"draw-section": ref,
		},
	})
	if err != nil {
		t.Fatalf("marshal run code request: %v", err)
	}

	runRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(string(runRequestBody)))
	if err != nil {
		t.Fatalf("new run code request: %v", err)
	}
	runRequest.Header.Set("Content-Type", "application/json")
	runRequest.AddCookie(authCookie)

	runResponse, err := http.DefaultClient.Do(runRequest)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer runResponse.Body.Close()
	if runResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", runResponse.StatusCode, string(body))
	}

	envelope, payload := readAppBinaryEnvelope(t, listenerConn)
	if envelope.MessageType != realtime.MessageTypeListenerRealtimeEvent {
		t.Fatalf("expected listener realtime event, got %q", envelope.MessageType)
	}
	if string(payload) != "listener-snapshot" {
		t.Fatalf("expected listener snapshot payload, got %q", string(payload))
	}

	var content realtime.ListenerRealtimeEventContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode listener realtime event content: %v", err)
	}
	if content.ProjectID != "project-alpha" {
		t.Fatalf("expected project-alpha event, got %q", content.ProjectID)
	}
	if content.ShareSessionID != "" {
		t.Fatalf("expected empty share session id, got %q", content.ShareSessionID)
	}
	if content.Sequence != 1 {
		t.Fatalf("expected sequence 1, got %d", content.Sequence)
	}
	if len(content.Deltas) != 1 {
		t.Fatalf("expected 1 delta, got %d", len(content.Deltas))
	}
	if content.Deltas[0].Dependency != "draw-section" {
		t.Fatalf("expected draw-section dependency, got %q", content.Deltas[0].Dependency)
	}

	var value struct {
		Type    string                   `json:"type"`
		Payload binarypayload.ContentRef `json:"payload"`
	}
	if err := json.Unmarshal(content.Deltas[0].Value, &value); err != nil {
		t.Fatalf("decode binary dependency value: %v", err)
	}
	if value.Type != realtime.DependencyValueTypeBinary {
		t.Fatalf("expected binary dependency value type, got %q", value.Type)
	}
	if value.Payload != ref {
		t.Fatalf("expected binary ref %#v, got %#v", ref, value.Payload)
	}

	if _, err := app.BinaryStore().ReadBytes(ref.ContentID); !errors.Is(err, binarypayload.ErrPayloadNotFound) {
		t.Fatalf("expected draw snapshot payload to be deleted after broadcast, got %v", err)
	}
}

func TestAppRunCodeBroadcastsBackendLogEvent(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

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

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never"}`))
	if err != nil {
		t.Fatalf("new run code request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, backendlogs.MessageTypeBackendLogEvent, 4)

	var event backendlogs.Event
	if err := json.Unmarshal(envelope.Content, &event); err != nil {
		t.Fatalf("decode backend log event: %v", err)
	}
	if event.ID == "" {
		t.Fatal("expected backend log event id")
	}
	if event.ProjectID == nil || *event.ProjectID != "project-alpha" {
		t.Fatalf("expected project-alpha backend log event, got %#v", event.ProjectID)
	}
	if event.Severity != backendlogs.SeverityInfo {
		t.Fatalf("expected info backend log severity, got %q", event.Severity)
	}
	if event.Message != "Started command" {
		t.Fatalf("expected Started command backend log message, got %q", event.Message)
	}
	if event.Timestamp == "" {
		t.Fatal("expected backend log timestamp")
	}
}

func prepareCurrentSession(t *testing.T, cfg config.Config) {
	t.Helper()

	sessionID := "abc123"
	t.Setenv("SETTA_SESSION_ID", sessionID)

	sessionDir := filepath.Join(cfg.Paths.RuntimeRoot, "sessions", sessionID)
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	secretPath := filepath.Join(sessionDir, "secret")
	if err := os.WriteFile(secretPath, []byte("test-secret"), 0o600); err != nil {
		t.Fatalf("write session secret: %v", err)
	}

	metadata := auth.SessionMetadata{
		ID:                     sessionID,
		WorkspacePath:          cfg.Paths.WorkspaceRoot,
		WorkspacePathCanonical: cfg.Paths.WorkspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61234,
		PID:                    os.Getpid(),
		StartedAt:              time.Unix(1_700_000_000, 0).UTC(),
		SecretPath:             secretPath,
		RuntimeRoot:            cfg.Paths.RuntimeRoot,
		ServerMode:             string(cfg.Server.Mode),
	}
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		t.Fatalf("marshal session metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(sessionDir, "session.json"), metadataBytes, 0o644); err != nil {
		t.Fatalf("write session metadata: %v", err)
	}
}

func readAppRouteEnvelope(t *testing.T, conn *websocket.Conn) appRouteEnvelope {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read app websocket message: %v", err)
	}

	var envelope appRouteEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode app websocket message: %v", err)
	}
	return envelope
}

func readAppBinaryEnvelope(t *testing.T, conn *websocket.Conn) (appRouteEnvelope, []byte) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	messageType, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read app websocket frame: %v", err)
	}
	if messageType != websocket.MessageBinary {
		t.Fatalf("expected binary websocket frame, got %d", messageType)
	}

	header, binaryPayload, err := realtime.DecodeBinaryFrame(payload)
	if err != nil {
		t.Fatalf("decode app binary frame: %v", err)
	}

	var envelope appRouteEnvelope
	if err := json.Unmarshal(header, &envelope); err != nil {
		t.Fatalf("decode app binary envelope: %v", err)
	}
	return envelope, binaryPayload
}

func readAppRouteEnvelopeUntilType(t *testing.T, conn *websocket.Conn, messageType string, maxReads int) appRouteEnvelope {
	t.Helper()

	for range maxReads {
		envelope := readAppRouteEnvelope(t, conn)
		if envelope.MessageType == messageType {
			return envelope
		}
	}
	t.Fatalf("did not receive app websocket message type %q within %d reads", messageType, maxReads)
	return appRouteEnvelope{}
}

func assertNoAppRouteEnvelopeOfType(t *testing.T, conn *websocket.Conn, messageType string, timeout time.Duration) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), remaining)
		_, payload, err := conn.Read(ctx)
		cancel()
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				return
			}
			t.Fatalf("read app websocket message: %v", err)
		}

		var envelope appRouteEnvelope
		if err := json.Unmarshal(payload, &envelope); err != nil {
			t.Fatalf("decode app websocket message: %v", err)
		}
		if envelope.MessageType == messageType {
			t.Fatalf("did not expect app websocket message type %q within %s", messageType, timeout)
		}
	}
}

func readAppRawFrame(t *testing.T, conn *websocket.Conn) string {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read app websocket frame: %v", err)
	}
	return string(payload)
}

func readAppRawFrameUntilContains(t *testing.T, conn *websocket.Conn, needle string, maxReads int) string {
	t.Helper()

	buffer := strings.Builder{}
	for range maxReads {
		frame := readAppRawFrame(t, conn)
		buffer.WriteString(frame)
		if strings.Contains(buffer.String(), needle) {
			return buffer.String()
		}
	}

	t.Fatalf("did not receive app terminal output containing %q within %d reads; collected output: %q", needle, maxReads, buffer.String())
	return ""
}

func waitForCondition(t *testing.T, check func() bool) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition did not become true before timeout")
}

func assertAppLSPDiagnosticsPayload(t *testing.T, payload projectstate.LSPDiagnosticsPayload) {
	t.Helper()

	if payload.ProjectID != "project-alpha" {
		t.Fatalf("unexpected diagnostics project id %q", payload.ProjectID)
	}
	sectionDiagnostics := payload.CodeSections["runner"]
	if len(sectionDiagnostics) != 1 {
		t.Fatalf("expected one runner diagnostic, got %#v", payload.CodeSections)
	}
	if sectionDiagnostics[0].Message != "Fixture TypeScript diagnostic" {
		t.Fatalf("unexpected diagnostic message %q", sectionDiagnostics[0].Message)
	}
	if sectionDiagnostics[0].Code != "fixture-ts" {
		t.Fatalf("unexpected diagnostic code %#v", sectionDiagnostics[0].Code)
	}
}
