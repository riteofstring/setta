package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"setta/internal/appsubsystem"
	"setta/internal/artifacts"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/pythonenv"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
	"setta/internal/shareartifacts"
	"setta/internal/terminals"
	"setta/internal/testutil/firstpartyplugin"
	"setta/internal/wsapi"
)

func TestAppOpensDeploymentRuntimeForShareMode(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfig(t, config.ModeShare)
	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.ProjectStates() != nil {
		t.Fatal("did not expect IDE project-state registry in share mode")
	}
	if app.deployment == nil {
		t.Fatal("expected deployment runtime in share mode")
	}
	if app.shareSessions == nil {
		t.Fatal("expected share-session store in share mode")
	}
	if app.deployment.Paths().DeploymentRoot != cfg.Paths.DeploymentRoot {
		t.Fatalf("expected deployment root %q, got %q", cfg.Paths.DeploymentRoot, app.deployment.Paths().DeploymentRoot)
	}
	if app.deployment.Paths().RuntimeRoot != cfg.Paths.RuntimeRoot {
		t.Fatalf("expected runtime root %q, got %q", cfg.Paths.RuntimeRoot, app.deployment.Paths().RuntimeRoot)
	}
	if app.deployment.Base().Snapshot().Document.DefaultProjectID != "project-alpha" {
		t.Fatalf("expected manifest default project id project-alpha, got %q", app.deployment.Base().Snapshot().Document.DefaultProjectID)
	}

	if _, err := app.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}
	if !app.shareSessions.HasSession("share-a") {
		t.Fatal("expected share-session store to expose created deployment session")
	}
}

func TestAppOpensDeploymentRuntimeForAppMode(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfigWithType(t, config.ModeApp, deployments.TypeApp)
	enableAppDeploymentRuntimePlugin(t, cfg.Paths.DeploymentRoot)
	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.deployment == nil {
		t.Fatal("expected deployment runtime in app mode")
	}
	if app.deployment.Manifest().DeploymentType != deployments.TypeApp {
		t.Fatalf("expected app deployment manifest type, got %q", app.deployment.Manifest().DeploymentType)
	}
	if app.shareSessions == nil {
		t.Fatal("expected app mode to expose deployment-backed share sessions")
	}
}

func TestAppRejectsAppModeWithoutAppSubsystemProvider(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfigWithType(t, config.ModeApp, deployments.TypeApp)
	_, err := New(cfg, observability.NewLogger(0, io.Discard))
	if !errors.Is(err, appsubsystem.ErrAppModeProviderRequired) {
		t.Fatalf("expected app mode provider-required error, got %v", err)
	}
	expectedErr := "app mode requires a single active app subsystem provider with app deployment runtime support: no app subsystem provider is active"
	if err == nil || err.Error() != expectedErr {
		t.Fatalf("expected exact app mode provider-required error %q, got %v", expectedErr, err)
	}
}

func TestAppShareModeDoesNotSeedIDEFilesOrStartIDEOnlyClients(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfig(t, config.ModeShare)
	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.SettingsState() != nil {
		t.Fatal("did not expect share mode to start settings state runtime")
	}
	if app.mcpClient != nil {
		t.Fatal("did not expect share mode to start MCP client")
	}
	if app.agentRuntime != nil {
		t.Fatal("did not expect share mode to start managed agent runtime")
	}

	if _, err := os.Stat(cfg.Paths.SettaFilesRoot); !os.IsNotExist(err) {
		t.Fatalf("expected share mode to avoid creating workspace setta_files root, got err=%v", err)
	}

	for _, path := range []string{
		filepath.Join(cfg.Paths.DeploymentRoot, settingsstate.DefaultFileName),
		filepath.Join(cfg.Paths.DeploymentRoot, projectstate.SettingsFileName),
		llmconfig.Path(cfg.Paths.DeploymentRoot),
		filepath.Join(cfg.Paths.DeploymentRoot, "llm_config.example.json"),
	} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("expected share deployment startup not to seed %q, got err=%v", path, err)
		}
	}
}

func TestAppShareModePluginRuntimeIgnoresHostGlobalPluginHome(t *testing.T) {
	cfg := testDeploymentConfig(t, config.ModeShare)
	repoRoot := appTestRepoRoot(t)
	hostSettaHome := filepath.Join(t.TempDir(), "host-home", ".setta")
	copyAppTestDir(
		t,
		filepath.Join(repoRoot, "tests", "fixtures", "plugins", "frontend"),
		filepath.Join(hostSettaHome, "plugins", "setta-fixture-frontend"),
	)
	t.Setenv("SETTA_HOME", hostSettaHome)

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

	request, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("get plugin runtime: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload plugins.PluginRuntimeResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if payload.List.ServerMode != config.ModeShare || payload.Status.ServerMode != config.ModeShare {
		t.Fatalf("expected share-mode plugin runtime payload, got list=%q status=%q", payload.List.ServerMode, payload.Status.ServerMode)
	}
	if len(payload.List.Plugins) != 0 || len(payload.Status.Plugins) != 0 {
		t.Fatalf("expected share-mode plugin runtime to ignore host global plugins, got list=%#v status=%#v", payload.List.Plugins, payload.Status.Plugins)
	}
}

func TestAppShareSessionStoreSupportsHTTPMiddleware(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfig(t, config.ModeShare)
	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	session, err := app.deployment.CreateSessionWithID("share-a")
	if err != nil {
		t.Fatalf("create share session: %v", err)
	}
	time.Sleep(10 * time.Millisecond)

	router := chi.NewRouter()
	router.With(httpapi.RequireShareSession(modes.Resolver{
		Policy: modes.NewPolicy(cfg.Server.Mode),
		Store:  app.shareSessions,
	})).Get("/protected", func(w http.ResponseWriter, r *http.Request) {
		info, ok := modes.RequestInfoFromRequest(r)
		if !ok {
			t.Fatal("expected mode request info in middleware-protected route")
		}
		if info.ShareSessionID != "share-a" {
			t.Fatalf("expected share session id share-a, got %q", info.ShareSessionID)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodGet, "/protected", nil)
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d with body %q", response.Code, response.Body.String())
	}

	touched, ok := app.deployment.Session("share-a")
	if !ok {
		t.Fatal("expected share session to remain after middleware request")
	}
	if !touched.LastSeenAt.After(session.LastSeenAt) {
		t.Fatalf("expected middleware request to advance last-seen time from %v to after %v", touched.LastSeenAt, session.LastSeenAt)
	}
}

func TestAppShareModeFrontendWebsocketUsesDeploymentShareSessions(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfig(t, config.ModeShare)
	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	session, err := app.deployment.CreateSessionWithID("share-a")
	if err != nil {
		t.Fatalf("create share session: %v", err)
	}
	time.Sleep(10 * time.Millisecond)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	conn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend,
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				modes.ShareSessionHeaderName: []string{"share-a"},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)
	if envelope.MessageType != realtime.MessageTypeFrontendIdentity {
		t.Fatalf("expected frontend identity message, got %q", envelope.MessageType)
	}

	var identity realtime.FrontendIdentityContent
	if err := json.Unmarshal(envelope.Content, &identity); err != nil {
		t.Fatalf("decode frontend identity content: %v", err)
	}
	if strings.TrimSpace(identity.FrontendAffinityToken) == "" {
		t.Fatal("expected frontend affinity token")
	}

	touched, ok := app.deployment.Session("share-a")
	if !ok {
		t.Fatal("expected share session after websocket connect")
	}
	if !touched.LastSeenAt.After(session.LastSeenAt) {
		t.Fatalf("expected websocket connect to advance last-seen time from %v to after %v", touched.LastSeenAt, session.LastSeenAt)
	}
}

func TestAppShareModeFrontendWebsocketAutostartsDeploymentListenerWithBuildCallbacks(t *testing.T) {
	serverListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen app server: %v", err)
	}
	t.Cleanup(func() {
		_ = serverListener.Close()
	})

	cfg := testDeploymentConfig(t, config.ModeShare)
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = serverListener.Addr().(*net.TCPAddr).Port
	enableAppDeploymentListener(t, cfg.Paths.DeploymentRoot, `from setta.api import SettaListener

def build_callbacks(listener: SettaListener) -> None:
    return None
`)
	repoRoot := appTestRepoRoot(t)
	t.Setenv(pythonenv.InterpreterEnv, appTestWorkerPython(t, repoRoot))

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := &http.Server{Handler: app.Handler()}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.Serve(serverListener)
	}()
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		select {
		case serveErr := <-serverErrors:
			if serveErr != nil && serveErr != http.ErrServerClosed {
				t.Fatalf("serve app test server: %v", serveErr)
			}
		default:
		}
	})

	if _, err := app.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	serverURL := "http://" + serverListener.Addr().String()
	conn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(serverURL, "http")+wsapi.RouteFrontend,
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				modes.ShareSessionHeaderName: []string{"share-a"},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)
	if envelope.MessageType != realtime.MessageTypeFrontendIdentity {
		t.Fatalf("expected frontend identity message, got %q", envelope.MessageType)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		targets := app.listeners.Registry().BootstrapConnectionIDs("project-alpha", "share-a")
		if len(targets) == 1 {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}

	targets := app.listeners.Registry().BootstrapConnectionIDs("project-alpha", "share-a")
	t.Fatalf("expected autostarted deployment listener bootstrap for share-a/project-alpha, got %#v", targets)
}

func TestAppShareModeServesCurrentDeploymentSessionRoute(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfig(t, config.ModeShare)
	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	request := httptest.NewRequest(http.MethodPost, "/api"+httpapi.RouteShareDeploymentCurrentSession, nil)
	response := httptest.NewRecorder()
	app.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload httpapi.ShareDeploymentSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share session response: %v", err)
	}
	if payload.DeploymentName != "demo-share" || payload.DeploymentVersion != "v2" {
		t.Fatalf("unexpected deployment identity %#v", payload)
	}
	if payload.ShareSessionID == "" {
		t.Fatal("expected non-empty share session id")
	}
	if !app.shareSessions.HasSession(payload.ShareSessionID) {
		t.Fatal("expected current session route to create a deployment session")
	}
}

func TestCleanupExpiredDeploymentSessionsDropsTerminalAndRealtimeState(t *testing.T) {
	t.Parallel()
	skipIfAppTerminalPTYUnsupported(t)

	deploymentRoot := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	writeAppDeploymentFixture(t, deploymentRoot, deployments.TypeShare)

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: deploymentRoot,
		RuntimeRoot:    runtimeRoot,
		Now: func() time.Time {
			return now
		},
		SessionTTL: 30 * time.Second,
	})
	if err != nil {
		t.Fatalf("open deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close deployment runtime: %v", err)
		}
	})

	terminalService, err := terminals.New(terminals.Options{
		Logger: observability.NewLogger(0, io.Discard),
	})
	if err != nil {
		t.Fatalf("new terminal service: %v", err)
	}
	t.Cleanup(func() {
		if err := terminalService.Close(context.Background()); err != nil {
			t.Fatalf("close terminal service: %v", err)
		}
	})

	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create expired session: %v", err)
	}
	if _, err := deploymentRuntime.CreateSessionWithID("share-b"); err != nil {
		t.Fatalf("create active session: %v", err)
	}

	if _, _, err := terminalService.Open(terminals.OpenOptions{
		ID:             terminals.BuildTerminalID("section-a", "share-a"),
		ProjectID:      "project-alpha",
		ShareSessionID: "share-a",
		AllowInput:     false,
		Command:        quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open expired-session terminal: %v", err)
	}
	if _, _, err := terminalService.Open(terminals.OpenOptions{
		ID:             terminals.BuildTerminalID("section-b", "share-b"),
		ProjectID:      "project-alpha",
		ShareSessionID: "share-b",
		AllowInput:     false,
		Command:        quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open active-session terminal: %v", err)
	}

	sequencer := realtime.NewSequencer()
	listenerBroadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}),
		Sequencer:    sequencer,
	})
	binaryStore, err := binarypayload.NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}
	shareArtifactService, err := shareartifacts.NewService(shareartifacts.ServiceOptions{
		Deployment:  deploymentRuntime,
		BinaryStore: binaryStore,
	})
	if err != nil {
		t.Fatalf("new share artifact service: %v", err)
	}
	overlayPath := filepath.Join(deploymentRoot, "artifacts", "cleanup-stroke.json")
	if err := os.MkdirAll(filepath.Dir(overlayPath), 0o755); err != nil {
		t.Fatalf("mkdir overlay artifact parent: %v", err)
	}
	if err := os.WriteFile(overlayPath, []byte("{\n  \"strokeStyle\": \"#111111\"\n}\n"), 0o644); err != nil {
		t.Fatalf("write overlay disk artifact: %v", err)
	}
	overlayValue := json.RawMessage(`{"strokeStyle":"#000000","lineWidth":2,"lineCap":"butt"}`)
	if _, err := shareArtifactService.Update(context.Background(), "share-a", artifacts.UpdateRequest{
		Artifacts: []artifacts.RawArtifact{{
			Type:  artifacts.ArtifactTypeBrushStroke,
			ID:    overlayPath,
			Value: &overlayValue,
		}},
		UploadScope: artifacts.UploadScopeGeneric,
	}); err != nil {
		t.Fatalf("seed share overlay: %v", err)
	}
	if _, err := sequencer.Next(realtime.Scope{ProjectID: "project-alpha", ShareSessionID: "share-a"}); err != nil {
		t.Fatalf("seed expired-session sequence: %v", err)
	}
	if _, err := sequencer.Next(realtime.Scope{ProjectID: "project-alpha", ShareSessionID: "share-b"}); err != nil {
		t.Fatalf("seed active-session sequence: %v", err)
	}

	now = now.Add(45 * time.Second)
	if err := deploymentRuntime.TouchSession("share-b"); err != nil {
		t.Fatalf("touch active session: %v", err)
	}
	now = now.Add(29 * time.Second)

	cleanupCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	expiredIDs, err := cleanupExpiredDeploymentSessions(cleanupCtx, deploymentRuntime, terminalService, listenerBroadcaster, shareArtifactService)
	if err != nil {
		t.Fatalf("cleanup expired deployment sessions: %v", err)
	}
	if len(expiredIDs) != 1 || expiredIDs[0] != "share-a" {
		t.Fatalf("expected only share-a to expire, got %#v", expiredIDs)
	}
	if deploymentRuntime.HasSession("share-a") {
		t.Fatal("did not expect expired share session to remain")
	}
	if !deploymentRuntime.HasSession("share-b") {
		t.Fatal("expected active share session to remain")
	}
	if _, ok := terminalService.Session(terminals.BuildTerminalID("section-a", "share-a")); ok {
		t.Fatal("did not expect expired share-session terminal to remain")
	}
	if _, ok := terminalService.Session(terminals.BuildTerminalID("section-b", "share-b")); !ok {
		t.Fatal("expected active share-session terminal to remain")
	}
	if next, err := sequencer.Next(realtime.Scope{ProjectID: "project-alpha", ShareSessionID: "share-a"}); err != nil || next != 1 {
		t.Fatalf("expected expired share-session sequence to restart at 1, got %d err=%v", next, err)
	}
	if next, err := sequencer.Next(realtime.Scope{ProjectID: "project-alpha", ShareSessionID: "share-b"}); err != nil || next != 2 {
		t.Fatalf("expected active share-session sequence next value to be 2, got %d err=%v", next, err)
	}

	loaded, err := shareArtifactService.LoadCachedBrushStrokes(context.Background(), "share-a", artifacts.LoadCachedPathsRequest{
		Paths: []string{overlayPath},
	})
	if err != nil {
		t.Fatalf("load overlay after cleanup: %v", err)
	}
	if len(loaded) != 1 || loaded[0] == nil {
		t.Fatalf("expected disk artifact after cleanup, got %#v", loaded)
	}
	if strings.Contains(string(loaded[0].Value), "#000000") || !strings.Contains(string(loaded[0].Value), "#111111") {
		t.Fatalf("expected share overlay to be dropped after cleanup, got %#v", loaded[0])
	}
}

func testDeploymentConfig(t *testing.T, mode config.Mode) config.Config {
	t.Helper()
	return testDeploymentConfigWithType(t, mode, deployments.TypeShare)
}

func testDeploymentConfigWithType(
	t *testing.T,
	mode config.Mode,
	deploymentType deployments.Type,
) config.Config {
	t.Helper()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	deploymentName := "demo-share"
	if deploymentType == deployments.TypeApp {
		deploymentName = "demo-app"
	}
	deploymentRoot := filepath.Join(tmpDir, "deployments", deploymentName, "v2")
	runtimeRoot := filepath.Join(tmpDir, "deployment_runtime", deploymentName, "v2")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeAppDeploymentFixture(t, deploymentRoot, deploymentType)

	return config.Config{
		Server: config.Server{
			Mode:     mode,
			LogLevel: 0,
		},
		Paths: config.Paths{
			WorkspaceRoot:         workspaceRoot,
			DeploymentRoot:        deploymentRoot,
			SettaHome:             settaHome,
			ProfileLookupHome:     settaHome,
			SettaFilesRoot:        settaFilesRoot,
			ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
			RuntimeRoot:           runtimeRoot,
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: filepath.Join(settaHome, "setta_files"),
			AutoMode:             config.AutoModeCreateLocal,
		},
	}
}

func writeAppDeploymentFixture(
	t *testing.T,
	deploymentRoot string,
	deploymentType deployments.Type,
) {
	t.Helper()

	deploymentName := "demo-share"
	if deploymentType == deployments.TypeApp {
		deploymentName = "demo-app"
	}
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-beta",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
			},
		},
	}
	writeAppProjectDocument(t, filepath.Join(deploymentRoot, projectstate.MainFileName), document)
	writeAppJSON(t, filepath.Join(deploymentRoot, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         deploymentName,
		"deploymentType":         deploymentType,
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v2",
	})
	writeAppJSON(t, filepath.Join(deploymentRoot, "policy.json"), map[string]any{
		"allowRun": true,
	})
}

func enableAppDeploymentRuntimePlugin(t *testing.T, deploymentRoot string) {
	t.Helper()

	enableAppDeploymentRuntimePluginWithID(
		t,
		deploymentRoot,
		firstpartyplugin.AppSubsystemPluginID,
		firstpartyplugin.AppSubsystemPluginID,
	)
}

func enableAppDeploymentRuntimePluginWithID(
	t *testing.T,
	deploymentRoot string,
	sourcePluginID string,
	targetPluginID string,
) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	pluginRoot := filepath.Join(deploymentRoot, ".setta_plugins", targetPluginID)
	copyAppTestDir(t, filepath.Join(repoRoot, "plugins", sourcePluginID), pluginRoot)
	rewriteAppPluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["id"] = targetPluginID
	})
	writeAppJSON(t, filepath.Join(deploymentRoot, "plugins_state.json"), map[string]any{
		"enabledPluginIds": []string{targetPluginID},
	})
}

func enableAppDeploymentListener(t *testing.T, deploymentRoot string, entrypointContent string) {
	t.Helper()

	writeAppJSON(t, filepath.Join(deploymentRoot, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v2",
		"listener": map[string]any{
			"entrypoint": "listener/app.py",
			"enabled":    true,
		},
	})
	if err := os.MkdirAll(filepath.Join(deploymentRoot, "listener"), 0o755); err != nil {
		t.Fatalf("mkdir app deployment listener dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(deploymentRoot, "listener", "app.py"), []byte(entrypointContent), 0o644); err != nil {
		t.Fatalf("write app deployment listener entrypoint: %v", err)
	}
}

func writeAppProjectDocument(t *testing.T, path string, document projectstate.Document) {
	t.Helper()

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize app deployment document: %v", err)
	}
	writeAppJSONBytes(t, path, normalized)
}

func writeAppJSON(t *testing.T, path string, payload any) {
	t.Helper()
	writeAppJSONBytes(t, path, payload)
}

func writeAppJSONBytes(t *testing.T, path string, payload any) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal app deployment json: %v", err)
	}
	encoded = append(encoded, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir app deployment dir: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write app deployment file: %v", err)
	}
}
