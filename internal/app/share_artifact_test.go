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
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/realtime"
	"setta/internal/wsapi"
)

func TestAppShareModeServesArtifactOverlayRoutesAndBroadcastsScopedUpdates(t *testing.T) {
	t.Parallel()

	harness := newShareArtifactRouteHarness(t)
	artifactPath := harness.updateBrushStrokeOverlay(t)

	harness.assertShareSessionLoadsOverlay(t, "share-a", artifactPath)
	harness.assertShareSessionMissesOverlay(t, "share-b", artifactPath)
	harness.assertOverlayStaysInMemory(t, artifactPath)
	harness.assertBroadcastScopedToShareA(t)
}

type shareArtifactRouteHarness struct {
	cfg       config.Config
	serverURL string
	connA     *websocket.Conn
	connB     *websocket.Conn
}

func newShareArtifactRouteHarness(t *testing.T) shareArtifactRouteHarness {
	t.Helper()

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

	if _, err := app.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share-a session: %v", err)
	}
	if _, err := app.deployment.CreateSessionWithID("share-b"); err != nil {
		t.Fatalf("create share-b session: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)

	return shareArtifactRouteHarness{
		cfg:       cfg,
		serverURL: server.URL,
		connA:     dialShareArtifactFrontend(t, server.URL, "share-a", 2),
		connB:     dialShareArtifactFrontend(t, server.URL, "share-b", 3),
	}
}

func dialShareArtifactFrontend(t *testing.T, serverURL, sessionID string, maxIdentityReads int) *websocket.Conn {
	t.Helper()

	conn, _, err := websocket.Dial(
		context.Background(),
		"ws"+strings.TrimPrefix(serverURL, "http")+wsapi.RouteFrontend,
		&websocket.DialOptions{
			HTTPHeader: http.Header{
				modes.ShareSessionHeaderName: []string{sessionID},
			},
		},
	)
	if err != nil {
		t.Fatalf("dial %s websocket: %v", sessionID, err)
	}
	t.Cleanup(func() {
		_ = conn.CloseNow()
	})
	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, maxIdentityReads)
	return conn
}

func (h shareArtifactRouteHarness) updateBrushStrokeOverlay(t *testing.T) string {
	t.Helper()

	artifactPath := filepath.Join(h.cfg.Paths.DeploymentRoot, "artifacts", "stroke.json")
	if err := os.MkdirAll(filepath.Dir(artifactPath), 0o755); err != nil {
		t.Fatalf("mkdir artifact parent: %v", err)
	}

	updateRequest, err := http.NewRequest(http.MethodPost, h.serverURL+"/api"+httpapi.RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"BrushStroke","id":"`+artifactPath+`","value":{"strokeStyle":"#000000","lineWidth":2,"lineCap":"butt"}}],"uploadScope":"generic"}`))
	if err != nil {
		t.Fatalf("new update request: %v", err)
	}
	updateRequest.Header.Set("Content-Type", "application/json")
	updateRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")

	updateResponse, err := http.DefaultClient.Do(updateRequest)
	if err != nil {
		t.Fatalf("update request: %v", err)
	}
	defer updateResponse.Body.Close()
	if updateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(updateResponse.Body)
		t.Fatalf("expected update 200, got %d with body %q", updateResponse.StatusCode, string(body))
	}
	return artifactPath
}

func (h shareArtifactRouteHarness) assertShareSessionLoadsOverlay(t *testing.T, sessionID, artifactPath string) {
	t.Helper()

	loadARequest, err := http.NewRequest(http.MethodPost, h.serverURL+"/api"+httpapi.RouteLoadCachedBrushStrokes, strings.NewReader(`{"paths":["`+artifactPath+`"]}`))
	if err != nil {
		t.Fatalf("new %s load request: %v", sessionID, err)
	}
	loadARequest.Header.Set("Content-Type", "application/json")
	loadARequest.Header.Set(modes.ShareSessionHeaderName, sessionID)

	loadAResponse, err := http.DefaultClient.Do(loadARequest)
	if err != nil {
		t.Fatalf("%s load request: %v", sessionID, err)
	}
	defer loadAResponse.Body.Close()
	if loadAResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadAResponse.Body)
		t.Fatalf("expected %s load 200, got %d with body %q", sessionID, loadAResponse.StatusCode, string(body))
	}

	var loadAPayload []*struct {
		ID    string          `json:"id"`
		Value json.RawMessage `json:"value"`
	}
	if err := json.NewDecoder(loadAResponse.Body).Decode(&loadAPayload); err != nil {
		t.Fatalf("decode share-a load payload: %v", err)
	}
	if len(loadAPayload) != 1 || loadAPayload[0] == nil {
		t.Fatalf("expected share-a overlay payload, got %#v", loadAPayload)
	}
	if loadAPayload[0].ID != "artifacts/stroke.json" || !strings.Contains(string(loadAPayload[0].Value), "#000000") {
		t.Fatalf("unexpected share-a load payload %#v", loadAPayload[0])
	}
}

func (h shareArtifactRouteHarness) assertShareSessionMissesOverlay(t *testing.T, sessionID, artifactPath string) {
	t.Helper()

	loadBRequest, err := http.NewRequest(http.MethodPost, h.serverURL+"/api"+httpapi.RouteLoadCachedBrushStrokes, strings.NewReader(`{"paths":["`+artifactPath+`"]}`))
	if err != nil {
		t.Fatalf("new %s load request: %v", sessionID, err)
	}
	loadBRequest.Header.Set("Content-Type", "application/json")
	loadBRequest.Header.Set(modes.ShareSessionHeaderName, sessionID)

	loadBResponse, err := http.DefaultClient.Do(loadBRequest)
	if err != nil {
		t.Fatalf("%s load request: %v", sessionID, err)
	}
	defer loadBResponse.Body.Close()
	if loadBResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadBResponse.Body)
		t.Fatalf("expected %s load 200, got %d with body %q", sessionID, loadBResponse.StatusCode, string(body))
	}

	var loadBPayload []*struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(loadBResponse.Body).Decode(&loadBPayload); err != nil {
		t.Fatalf("decode share-b load payload: %v", err)
	}
	if len(loadBPayload) != 1 || loadBPayload[0] != nil {
		t.Fatalf("expected share-b to miss overlay payload, got %#v", loadBPayload)
	}
}

func (h shareArtifactRouteHarness) assertOverlayStaysInMemory(t *testing.T, artifactPath string) {
	t.Helper()

	if _, err := os.Stat(artifactPath); !os.IsNotExist(err) {
		t.Fatalf("expected share update to stay in memory, stat err=%v", err)
	}
}

func (h shareArtifactRouteHarness) assertBroadcastScopedToShareA(t *testing.T) {
	t.Helper()

	envelope := readAppRouteEnvelopeUntilType(t, h.connA, realtime.MessageTypeUpdateArtifacts, 4)
	var broadcast realtime.UpdateArtifactsContent
	if err := json.Unmarshal(envelope.Content, &broadcast); err != nil {
		t.Fatalf("decode update artifacts broadcast: %v", err)
	}
	if broadcast.UpdateType != "update" || len(broadcast.Artifacts) != 1 {
		t.Fatalf("unexpected update artifacts broadcast %#v", broadcast)
	}
	artifact, ok := broadcast.Artifacts[0].(map[string]any)
	if !ok {
		t.Fatalf("expected artifact object, got %#v", broadcast.Artifacts[0])
	}
	if artifact["id"] != "artifacts/stroke.json" {
		t.Fatalf("expected normalized broadcast id, got %#v", artifact)
	}

	assertNoAppRouteEnvelopeOfType(t, h.connB, realtime.MessageTypeUpdateArtifacts, 300*time.Millisecond)
}
