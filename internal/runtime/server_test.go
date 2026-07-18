package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"testing"
	"time"

	"setta/internal/conversation"
	"setta/internal/httpapi"
	"setta/internal/runtimeauth"
	"setta/internal/speech"
	"setta/internal/workspaceui/conversationpalette"
)

func TestStartReportsReadyAfterListenerIsBound(t *testing.T) {
	var stdout bytes.Buffer
	config := testConfig(t)
	config.Stdout = &stdout
	config.Version = "test"

	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}
	defer shutdownServer(t, server)

	var ready ReadyEvent
	if err := json.NewDecoder(&stdout).Decode(&ready); err != nil {
		t.Fatalf("decode ready event: %v", err)
	}
	if ready.Event != "ready" {
		t.Fatalf("ready event = %q, want ready", ready.Event)
	}
	if ready.Addr != server.Addr() {
		t.Fatalf("ready addr = %q, want %q", ready.Addr, server.Addr())
	}
	if ready.BootstrapToken == "" {
		t.Fatal("ready bootstrap token is empty")
	}
	if ready.ProtocolVersion != httpapi.ProtocolVersion {
		t.Fatalf("ready protocol version = %d, want %d", ready.ProtocolVersion, httpapi.ProtocolVersion)
	}

	response, err := http.Get("http://" + ready.Addr + "/health")
	if err != nil {
		t.Fatalf("get health from ready addr: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want %d", response.StatusCode, http.StatusOK)
	}
}

func TestRuntimeServesDurableConversationNavigator(t *testing.T) {
	config := testConfig(t)
	store, err := conversation.NewStore(config.AppDataDir)
	if err != nil {
		t.Fatalf("create conversation store: %v", err)
	}
	topic := conversation.TopicConversation{
		ID:          "conversation-runtime",
		WorkspaceID: "workspace-runtime",
		Title:       "Runtime topic",
		Status:      conversation.ConversationStatusIdle,
		CreatedAt:   "2026-07-11T20:00:00Z",
		UpdatedAt:   "2026-07-11T20:00:00Z",
	}
	resolvedNarratorVoiceID := speech.SpeechVoiceAlloy
	_, err = store.Transact(context.Background(), "seed runtime navigator", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.InsertConversation(topic); err != nil {
			return err
		}
		if err := transaction.UpsertConversationPresentationProfile(
			conversation.ConversationPresentationProfile{
				ConversationID:          topic.ID,
				PaletteSelection:        conversation.PresentationSelectionAutoDistinct,
				ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
				NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
				ResolvedNarratorVoiceID: &resolvedNarratorVoiceID,
				NarratorSpeechEnabled:   true,
				UpdatedAt:               topic.UpdatedAt,
			},
		); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "runtime-navigator-seeded",
			StreamID:    "conversation:" + topic.ID,
			Kind:        "conversation_state_changed",
			Payload:     topic,
			CommittedAt: topic.UpdatedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("seed runtime navigator: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close seeded conversation store: %v", err)
	}

	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)
	page := postRuntimeJSON[conversation.NavigatorPage](
		t,
		authenticatedRuntimeTestClient(ready.BootstrapToken, 5*time.Second),
		"http://"+server.Addr(),
		"/conversations/navigator/list",
		httpapi.ListTopicConversationsRequest{WorkspaceID: topic.WorkspaceID, Limit: 80},
		http.StatusOK,
	)
	if len(page.Items) != 1 || page.Items[0].Conversation.ID != topic.ID {
		t.Fatalf("runtime navigator page = %+v", page)
	}
}

func TestRuntimeHTTPServerIsAPIOnly(t *testing.T) {
	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	baseURL := "http://" + server.Addr()
	client := &http.Client{Timeout: 5 * time.Second}
	for _, path := range []string{
		"/",
		"/index.html",
		"/manifest." + "webmanifest",
		"/sw.js",
		"/icons/setta-icon.svg",
		"/workspaces/runtime-client-route",
	} {
		t.Run(path, func(t *testing.T) {
			request, err := http.NewRequest(http.MethodGet, baseURL+path, nil)
			if err != nil {
				t.Fatalf("create GET %s: %v", path, err)
			}
			response, err := client.Do(request)
			if err != nil {
				t.Fatalf("GET %s: %v", path, err)
			}
			defer response.Body.Close()
			if response.StatusCode != http.StatusNotFound {
				t.Fatalf("GET %s status = %d, want %d", path, response.StatusCode, http.StatusNotFound)
			}
		})
	}

	health := getRuntimeJSON[httpapi.BackendHealth](t, client, baseURL, "/health")
	if health != (httpapi.BackendHealth{
		OK:              true,
		Name:            httpapi.BackendName,
		Version:         "test",
		ProtocolVersion: httpapi.ProtocolVersion,
	}) {
		t.Fatalf("health payload = %+v", health)
	}

	devices := postRuntimeJSON[httpapi.ListDevicesResponse](
		t,
		authenticatedRuntimeTestClient(ready.BootstrapToken, 5*time.Second),
		baseURL,
		"/devices/list",
		httpapi.ListDevicesRequest{},
		http.StatusOK,
	)
	if len(devices.Devices) == 0 {
		t.Fatal("authenticated device list is empty, want bootstrap device session")
	}
}

func TestHTTPServerUsesBoundedReadConfiguration(t *testing.T) {
	server := newHTTPServer(DefaultConfig(), runtimeServices{})

	if server.ReadHeaderTimeout != httpReadHeaderTimeout {
		t.Fatalf("ReadHeaderTimeout = %s, want %s", server.ReadHeaderTimeout, httpReadHeaderTimeout)
	}
	if server.ReadTimeout != httpReadTimeout {
		t.Fatalf("ReadTimeout = %s, want %s", server.ReadTimeout, httpReadTimeout)
	}
	if server.MaxHeaderBytes != httpMaxHeaderBytes {
		t.Fatalf("MaxHeaderBytes = %d, want %d", server.MaxHeaderBytes, httpMaxHeaderBytes)
	}
	if server.WriteTimeout != 0 {
		t.Fatalf("WriteTimeout = %s, want zero for event streams", server.WriteTimeout)
	}
}

func TestInvalidStartupConfigurationFails(t *testing.T) {
	tests := map[string]Config{
		"empty app data":                  withAppDataDir(t, ""),
		"relative app data":               withAppDataDir(t, "relative-app-data"),
		"empty host":                      withHost(t, ""),
		"empty bootstrap":                 withBootstrapDisplayName(t, ""),
		"non numeric host":                withHost(t, "localhost"),
		"non loopback host":               withHost(t, "0.0.0.0"),
		"negative port":                   withPort(t, -1),
		"large port":                      withPort(t, 65536),
		"missing speech credential owner": withSpeechCredentialOwner(t, ""),
		"unsupported speech credential owner": withSpeechCredentialOwner(
			t,
			SpeechCredentialOwner("environment"),
		),
		"electron vault startup key":    withSpeechStartupAPIKey(t, "sk-setta-speech-runtime-test"),
		"bad server startup speech key": withServerStartupSpeechAPIKey(t, "secret value"),
		"speech test URL":               withSpeech(t, speech.OpenAIProviderConfig{BaseURL: "http://127.0.0.1:24891/v1"}),
		"empty version":                 withVersion(t, ""),
	}

	for name, config := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := Start(context.Background(), config); err == nil {
				t.Fatal("start succeeded, want error")
			}
		})
	}
}

func TestAllowRemotePermitsNonLoopbackNumericHost(t *testing.T) {
	config := testConfig(t)
	config.AllowRemote = true
	config.Host = "0.0.0.0"

	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend with allow remote: %v", err)
	}
	defer shutdownServer(t, server)
}

func TestStartAcceptsConfiguredSpeechClient(t *testing.T) {
	config := testConfig(t)
	config.SpeechCredentialOwner = SpeechCredentialOwnerServerStartup
	config.SpeechStartupAPIKey = "sk-setta-speech-runtime-test"

	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend with configured speech client: %v", err)
	}
	defer shutdownServer(t, server)
}

func TestStartCanSkipBootstrapDeviceSession(t *testing.T) {
	var stdout bytes.Buffer
	config := testConfig(t)
	config.Stdout = &stdout
	config.SkipBootstrapDeviceSession = true

	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}
	shutdownServer(t, server)

	var ready ReadyEvent
	if err := json.NewDecoder(&stdout).Decode(&ready); err != nil {
		t.Fatalf("decode ready event: %v", err)
	}
	if ready.BootstrapToken != "" {
		t.Fatalf("ready bootstrap token = %q, want empty", ready.BootstrapToken)
	}

	store, err := runtimeauth.NewStore(config.AppDataDir)
	if err != nil {
		t.Fatalf("open runtime auth store: %v", err)
	}
	defer store.Close()
	sessions, err := store.ListDeviceSessions(context.Background())
	if err != nil {
		t.Fatalf("list device sessions: %v", err)
	}
	if len(sessions) != 0 {
		t.Fatalf("device sessions = %+v, want none", sessions)
	}
}

func TestGracefulShutdownStopsServing(t *testing.T) {
	server, err := Start(context.Background(), testConfig(t))
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}

	shutdownServer(t, server)

	conn, err := net.DialTimeout("tcp", server.Addr(), 100*time.Millisecond)
	if err == nil {
		conn.Close()
		t.Fatalf("dial after shutdown succeeded")
	}
}

func shutdownServer(t *testing.T, server *Server) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), DefaultConfig().ShutdownTimeout)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown backend: %v", err)
	}
	if err := server.Wait(); err != nil {
		t.Fatalf("wait for backend: %v", err)
	}
}

func startRuntimeTestServer(t *testing.T, config Config) (*Server, ReadyEvent) {
	t.Helper()

	var stdout bytes.Buffer
	config.Stdout = &stdout
	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}
	var ready ReadyEvent
	if err := json.NewDecoder(&stdout).Decode(&ready); err != nil {
		shutdownServer(t, server)
		t.Fatalf("decode ready event: %v", err)
	}
	return server, ready
}

func authenticatedRuntimeTestClient(token string, timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: runtimeTestAuthTransport{
			token: token,
			base:  http.DefaultTransport,
		},
	}
}

type runtimeTestAuthTransport struct {
	token string
	base  http.RoundTripper
}

func (transport runtimeTestAuthTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if transport.token == "" || request.Header.Get("Authorization") != "" {
		return transport.base.RoundTrip(request)
	}
	clone := request.Clone(request.Context())
	clone.Header = request.Header.Clone()
	clone.Header.Set("Authorization", "Bearer "+transport.token)
	return transport.base.RoundTrip(clone)
}

func testConfig(t *testing.T) Config {
	t.Helper()

	config := DefaultConfig()
	config.AppDataDir = t.TempDir()
	config.SpeechCredentialOwner = SpeechCredentialOwnerElectronVault
	return config
}

func withAppDataDir(t *testing.T, appDataDir string) Config {
	t.Helper()

	config := testConfig(t)
	config.AppDataDir = appDataDir
	return config
}

func withHost(t *testing.T, host string) Config {
	t.Helper()

	config := testConfig(t)
	config.Host = host
	return config
}

func withPort(t *testing.T, port int) Config {
	t.Helper()

	config := testConfig(t)
	config.Port = port
	return config
}

func withVersion(t *testing.T, version string) Config {
	t.Helper()

	config := testConfig(t)
	config.Version = version
	return config
}

func withBootstrapDisplayName(t *testing.T, displayName string) Config {
	t.Helper()

	config := testConfig(t)
	config.BootstrapDeviceDisplayName = displayName
	return config
}

func withSpeech(t *testing.T, speechConfig speech.OpenAIProviderConfig) Config {
	t.Helper()

	config := testConfig(t)
	config.Speech = speechConfig
	return config
}

func withSpeechStartupAPIKey(t *testing.T, apiKey string) Config {
	t.Helper()

	config := testConfig(t)
	config.SpeechStartupAPIKey = apiKey
	return config
}

func withServerStartupSpeechAPIKey(t *testing.T, apiKey string) Config {
	t.Helper()

	config := testConfig(t)
	config.SpeechCredentialOwner = SpeechCredentialOwnerServerStartup
	config.SpeechStartupAPIKey = apiKey
	return config
}

func withSpeechCredentialOwner(t *testing.T, owner SpeechCredentialOwner) Config {
	t.Helper()

	config := testConfig(t)
	config.SpeechCredentialOwner = owner
	return config
}
