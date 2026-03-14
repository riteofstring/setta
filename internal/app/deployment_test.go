package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"setta/internal/artifacts"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/shareartifacts"
	"setta/internal/terminals"
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
	if app.DeploymentRuntime() == nil {
		t.Fatal("expected deployment runtime in share mode")
	}
	if app.ShareSessions() == nil {
		t.Fatal("expected share-session store in share mode")
	}
	if app.DeploymentRuntime().Paths().DeploymentRoot != cfg.Paths.DeploymentRoot {
		t.Fatalf("expected deployment root %q, got %q", cfg.Paths.DeploymentRoot, app.DeploymentRuntime().Paths().DeploymentRoot)
	}
	if app.DeploymentRuntime().Paths().RuntimeRoot != cfg.Paths.RuntimeRoot {
		t.Fatalf("expected runtime root %q, got %q", cfg.Paths.RuntimeRoot, app.DeploymentRuntime().Paths().RuntimeRoot)
	}
	if app.DeploymentRuntime().Base().Snapshot().Document.DefaultProjectID != "project-alpha" {
		t.Fatalf("expected manifest default project id project-alpha, got %q", app.DeploymentRuntime().Base().Snapshot().Document.DefaultProjectID)
	}

	if _, err := app.DeploymentRuntime().CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}
	if !app.ShareSessions().HasSession("share-a") {
		t.Fatal("expected share-session store to expose created deployment session")
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

	session, err := app.DeploymentRuntime().CreateSessionWithID("share-a")
	if err != nil {
		t.Fatalf("create share session: %v", err)
	}
	time.Sleep(10 * time.Millisecond)

	router := chi.NewRouter()
	router.With(httpapi.RequireShareSession(modes.Resolver{
		Policy: modes.NewPolicy(cfg.Server.Mode),
		Store:  app.ShareSessions(),
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

	touched, ok := app.DeploymentRuntime().Session("share-a")
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

	session, err := app.DeploymentRuntime().CreateSessionWithID("share-a")
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

	touched, ok := app.DeploymentRuntime().Session("share-a")
	if !ok {
		t.Fatal("expected share session after websocket connect")
	}
	if !touched.LastSeenAt.After(session.LastSeenAt) {
		t.Fatalf("expected websocket connect to advance last-seen time from %v to after %v", touched.LastSeenAt, session.LastSeenAt)
	}
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
	if !app.ShareSessions().HasSession(payload.ShareSessionID) {
		t.Fatal("expected current session route to create a deployment session")
	}
}

func TestCleanupExpiredDeploymentSessionsDropsTerminalAndRealtimeState(t *testing.T) {
	t.Parallel()
	skipIfAppTerminalPTYUnsupported(t)

	deploymentRoot := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	writeAppDeploymentFixture(t, deploymentRoot)

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
	if current, ok := sequencer.Current(realtime.Scope{ProjectID: "project-alpha", ShareSessionID: "share-a"}); ok || current != 0 {
		t.Fatalf("expected expired share-session sequence to be removed, got %d ok=%t", current, ok)
	}
	if current, ok := sequencer.Current(realtime.Scope{ProjectID: "project-alpha", ShareSessionID: "share-b"}); !ok || current != 1 {
		t.Fatalf("expected active share-session sequence to remain, got %d ok=%t", current, ok)
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

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	deploymentRoot := filepath.Join(tmpDir, "deployments", "demo-share", "v2")
	runtimeRoot := filepath.Join(tmpDir, "deployment_runtime", "demo-share", "v2")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeAppDeploymentFixture(t, deploymentRoot)

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

func writeAppDeploymentFixture(t *testing.T, deploymentRoot string) {
	t.Helper()

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
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v2",
	})
	writeAppJSON(t, filepath.Join(deploymentRoot, "policy.json"), map[string]any{
		"allowRun": true,
	})
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
