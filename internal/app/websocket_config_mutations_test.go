package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/externalagentconfigs"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/observability"
	"setta/internal/realtime"
	"setta/internal/transcriptionprofiles"
	"setta/internal/wsapi"

	"github.com/coder/websocket"
)

type appWebsocketMutationHarness struct {
	server     *httptest.Server
	authCookie *http.Cookie
	conn       *websocket.Conn
	app        *App
}

func newAppWebsocketMutationHarness(t *testing.T, cfg config.Config) appWebsocketMutationHarness {
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

	return newAppWebsocketMutationHarnessForApp(t, app)
}

func newAppWebsocketMutationHarnessForApp(t *testing.T, app *App) appWebsocketMutationHarness {
	t.Helper()

	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	t.Cleanup(func() {
		_ = conn.CloseNow()
	})
	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	return appWebsocketMutationHarness{
		server:     server,
		authCookie: authCookie,
		conn:       conn,
		app:        app,
	}
}

func postAppRouteJSONOK(t *testing.T, harness appWebsocketMutationHarness, route string, body string) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, harness.server.URL+"/api"+route, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new %s request: %v", route, err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(harness.authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post %s: %v", route, err)
	}
	if response.StatusCode != http.StatusOK {
		defer response.Body.Close()
		responseBody, _ := io.ReadAll(response.Body)
		t.Fatalf("expected %s 200, got %d with body %q", route, response.StatusCode, string(responseBody))
	}
	return response
}

func decodeAppJSONResponse[T any](t *testing.T, response *http.Response, label string) T {
	t.Helper()
	defer response.Body.Close()

	var payload T
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode %s response: %v", label, err)
	}
	return payload
}

func readAppMutationContent[T any](t *testing.T, conn *websocket.Conn, messageType realtime.ListenerMessageType, label string) T {
	t.Helper()

	envelope := readAppRouteEnvelopeUntilType(t, conn, messageType, 4)
	var payload T
	if err := json.Unmarshal(envelope.Content, &payload); err != nil {
		t.Fatalf("decode %s websocket payload: %v", label, err)
	}
	return payload
}

func TestAppEngineConfigMutationsBroadcastSnapshotUpdates(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	harness := newAppWebsocketMutationHarness(t, cfg)

	createResponse := postAppRouteJSONOK(t, harness, httpapi.RouteCreateEngineConfig, `{"name":"Codex","engineType":"external_agent","externalAgentConfigId":"external-codex"}`)
	created := decodeAppJSONResponse[agentruns.EngineConfig](t, createResponse, "create engine config")
	if created.ID == "" {
		t.Fatalf("expected created engine config id, got %#v", created)
	}

	createdSnapshot := readAppMutationContent[realtime.EngineConfigsUpdatedContent](t, harness.conn, realtime.MessageTypeEngineConfigsUpdated, "engine config create")
	createdEntry := mustFindEngineConfigSnapshotEntry(t, createdSnapshot.Configs, created.ID)
	if createdEntry.RuntimeSupport == nil || !createdEntry.RuntimeSupport.Thinking {
		t.Fatalf("expected external-agent runtime support in websocket payload, got %#v", createdEntry)
	}

	updateResponse := postAppRouteJSONOK(t, harness, httpapi.RouteUpdateEngineConfig, `{"config":{"id":"`+created.ID+`","name":"Codex Updated","engineType":"external_agent","externalAgentConfigId":"external-codex-updated"}}`)
	updateResponse.Body.Close()

	updatedSnapshot := readAppMutationContent[realtime.EngineConfigsUpdatedContent](t, harness.conn, realtime.MessageTypeEngineConfigsUpdated, "engine config update")
	updatedEntry := mustFindEngineConfigSnapshotEntry(t, updatedSnapshot.Configs, created.ID)
	if updatedEntry.Name != "Codex Updated" {
		t.Fatalf("expected updated engine config name, got %#v", updatedEntry)
	}
	if updatedEntry.ExternalAgentConfigID == nil || *updatedEntry.ExternalAgentConfigID != "external-codex-updated" {
		t.Fatalf("expected updated external agent config id, got %#v", updatedEntry)
	}

	deleteResponse := postAppRouteJSONOK(t, harness, httpapi.RouteDeleteEngineConfig, `{"configId":"`+created.ID+`"}`)
	deleteResponse.Body.Close()

	deletedSnapshot := readAppMutationContent[realtime.EngineConfigsUpdatedContent](t, harness.conn, realtime.MessageTypeEngineConfigsUpdated, "engine config delete")
	if hasEngineConfigSnapshotEntry(deletedSnapshot.Configs, created.ID) {
		t.Fatalf("expected deleted engine config %q to be absent, got %#v", created.ID, deletedSnapshot.Configs)
	}
}

func TestAppTranscriptionProfileMutationsBroadcastTranscriptionProfilesUpdated(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:       "openai-file",
				Model:    "whisper-1",
				Provider: "openai",
			},
			"openai-whisper-1": {
				ID:       "openai-whisper-1",
				Model:    "whisper-1",
				Provider: "openai",
			},
			"openai-realtime": {
				ID:       "openai-realtime",
				Model:    "gpt-4o-transcribe",
				Provider: "openai",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("seed llm config: %v", err)
	}
	harness := newAppWebsocketMutationHarness(t, cfg)

	createResponse := postAppRouteJSONOK(t, harness, httpapi.RouteCreateTranscriptionProfile, `{"name":"Realtime","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":1200}`)
	created := decodeAppJSONResponse[transcriptionprofiles.Profile](t, createResponse, "create transcription profile")

	createSnapshot := readAppMutationContent[realtime.TranscriptionProfilesUpdatedContent](t, harness.conn, realtime.MessageTypeTranscriptionProfilesUpdated, "transcription profile create")
	_ = mustFindTranscriptionProfileSnapshotEntry(t, createSnapshot.Profiles, created.ID)

	updateResponse := postAppRouteJSONOK(t, harness, httpapi.RouteUpdateTranscriptionProfile, `{"profile":{"id":"`+created.ID+`","name":"Realtime v2","transcriptionLlmConfigId":"openai-realtime","transportMode":"realtime","chunkMs":1600}}`)
	updateResponse.Body.Close()

	updatedSnapshot := readAppMutationContent[realtime.TranscriptionProfilesUpdatedContent](t, harness.conn, realtime.MessageTypeTranscriptionProfilesUpdated, "transcription profile update")
	updatedEntry := mustFindTranscriptionProfileSnapshotEntry(t, updatedSnapshot.Profiles, created.ID)
	if updatedEntry.Name != "Realtime v2" {
		t.Fatalf("expected updated transcription profile name, got %#v", updatedEntry)
	}

	deleteResponse := postAppRouteJSONOK(t, harness, httpapi.RouteDeleteTranscriptionProfile, `{"profileId":"`+created.ID+`"}`)
	deleteResponse.Body.Close()

	deletedSnapshot := readAppMutationContent[realtime.TranscriptionProfilesUpdatedContent](t, harness.conn, realtime.MessageTypeTranscriptionProfilesUpdated, "transcription profile delete")
	if hasTranscriptionProfileSnapshotEntry(deletedSnapshot.Profiles, created.ID) {
		t.Fatalf("expected deleted transcription profile %q to be absent, got %#v", created.ID, deletedSnapshot.Profiles)
	}
}

func mustFindEngineConfigSnapshotEntry(t *testing.T, configs []agentruns.EngineConfig, configID string) agentruns.EngineConfig {
	t.Helper()

	for _, config := range configs {
		if config.ID == configID {
			return config
		}
	}
	t.Fatalf("expected engine config %q in snapshot, got %#v", configID, configs)
	return agentruns.EngineConfig{}
}

func hasEngineConfigSnapshotEntry(configs []agentruns.EngineConfig, configID string) bool {
	for _, config := range configs {
		if config.ID == configID {
			return true
		}
	}
	return false
}

func mustFindExternalAgentConfigSnapshotEntry(t *testing.T, configs []externalagentconfigs.Config, configID string) externalagentconfigs.Config {
	t.Helper()

	for _, config := range configs {
		if config.ID == configID {
			return config
		}
	}
	t.Fatalf("expected external agent config %q in snapshot, got %#v", configID, configs)
	return externalagentconfigs.Config{}
}

func hasExternalAgentConfigSnapshotEntry(configs []externalagentconfigs.Config, configID string) bool {
	for _, config := range configs {
		if config.ID == configID {
			return true
		}
	}
	return false
}

func mustFindTranscriptionProfileSnapshotEntry(t *testing.T, profiles []transcriptionprofiles.Profile, profileID string) transcriptionprofiles.Profile {
	t.Helper()

	for _, profile := range profiles {
		if profile.ID == profileID {
			return profile
		}
	}
	t.Fatalf("expected transcription profile %q in snapshot, got %#v", profileID, profiles)
	return transcriptionprofiles.Profile{}
}

func hasTranscriptionProfileSnapshotEntry(profiles []transcriptionprofiles.Profile, profileID string) bool {
	for _, profile := range profiles {
		if profile.ID == profileID {
			return true
		}
	}
	return false
}
