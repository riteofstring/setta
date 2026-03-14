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
	"setta/internal/artifacts"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/shareartifacts"
)

func TestRegisterArtifactRoutesRoundTripAndUnsupportedUpdate(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, settaFilesRoot, binaryStore := newArtifactRouteService(t)
	handler := newArtifactRouteTestHandler(t, config.ModeIDE, authService, service)

	workspaceFile := filepath.Join(workspaceRoot, "source.txt")
	if err := os.WriteFile(workspaceFile, []byte("route import"), 0o644); err != nil {
		t.Fatalf("write workspace file: %v", err)
	}

	importBody := `{"paths":["` + workspaceFile + `"],"uploadScope":"generic"}`
	importRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteImportFilesToArtifacts, strings.NewReader(importBody))
	importRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, importRequest, authService)

	importResponse := httptest.NewRecorder()
	handler.ServeHTTP(importResponse, importRequest)
	if importResponse.Code != http.StatusOK {
		t.Fatalf("expected import 200, got %d with body %q", importResponse.Code, importResponse.Body.String())
	}

	var importPayload []artifacts.ImportFilesResponseItem
	if err := json.Unmarshal(importResponse.Body.Bytes(), &importPayload); err != nil {
		t.Fatalf("decode import payload: %v", err)
	}
	if len(importPayload) != 1 || !strings.HasPrefix(importPayload[0].ID, "artifacts/") {
		t.Fatalf("expected imported artifact id, got %#v", importPayload)
	}
	importedPath := filepath.Join(settaFilesRoot, filepath.FromSlash(importPayload[0].ID))
	if payload, err := os.ReadFile(importedPath); err != nil || string(payload) != "route import" {
		t.Fatalf("expected imported artifact payload, got %q err=%v", string(payload), err)
	}

	imageID := "artifacts/route-preview.png"
	imagePath := filepath.Join(settaFilesRoot, filepath.FromSlash(imageID))
	if err := os.WriteFile(imagePath, []byte("route-image"), 0o644); err != nil {
		t.Fatalf("write route image: %v", err)
	}
	loadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadCachedImageArtifacts, strings.NewReader(`{"paths":["`+imageID+`"]}`))
	loadRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, loadRequest, authService)

	loadResponse := httptest.NewRecorder()
	handler.ServeHTTP(loadResponse, loadRequest)
	if loadResponse.Code != http.StatusOK {
		t.Fatalf("expected load 200, got %d with body %q", loadResponse.Code, loadResponse.Body.String())
	}

	var imagePayload []*artifacts.ImageArtifact
	if err := json.Unmarshal(loadResponse.Body.Bytes(), &imagePayload); err != nil {
		t.Fatalf("decode image payload: %v", err)
	}
	if len(imagePayload) != 1 || imagePayload[0] == nil {
		t.Fatalf("expected image payload, got %#v", imagePayload)
	}
	imageBytes, err := binaryStore.ReadBytes(imagePayload[0].Value.ContentID)
	if err != nil {
		t.Fatalf("read image bytes from binary store: %v", err)
	}
	if string(imageBytes) != "route-image" {
		t.Fatalf("expected route image bytes, got %q", string(imageBytes))
	}

	unsupportedRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"Image","id":"artifacts/unsupported.png","value":{"contentId":"x","byteLength":1}}],"uploadScope":"generic"}`))
	unsupportedRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, unsupportedRequest, authService)

	unsupportedResponse := httptest.NewRecorder()
	handler.ServeHTTP(unsupportedResponse, unsupportedRequest)
	if unsupportedResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected unsupported update 400, got %d with body %q", unsupportedResponse.Code, unsupportedResponse.Body.String())
	}
	if !strings.Contains(unsupportedResponse.Body.String(), "unsupported_artifact_type") {
		t.Fatalf("expected unsupported artifact code, got %q", unsupportedResponse.Body.String())
	}
}

func TestRegisterArtifactRoutesBlocksLauncherMode(t *testing.T) {
	t.Parallel()

	handler := newArtifactRouteTestHandler(t, config.ModeLauncher, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteImportFilesToArtifacts, strings.NewReader(`{"paths":[],"uploadScope":"generic"}`))
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Launcher mode does not allow this endpoint.") {
		t.Fatalf("expected launcher-mode message, got %q", response.Body.String())
	}
}

func TestRegisterArtifactRoutesShareModeUpdatesAndLoadsOverlay(t *testing.T) {
	t.Parallel()

	service, deploymentRuntime, deploymentRoot := newShareArtifactRouteService(t, true)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler := newShareArtifactRouteHandler(t, service, deploymentRuntime)

	artifactPath := filepath.Join(deploymentRoot, "artifacts", "stroke.json")
	if err := os.MkdirAll(filepath.Dir(artifactPath), 0o755); err != nil {
		t.Fatalf("mkdir artifact parent: %v", err)
	}
	if err := os.WriteFile(artifactPath, []byte("{\n  \"strokeStyle\": \"#111111\"\n}\n"), 0o644); err != nil {
		t.Fatalf("write disk artifact: %v", err)
	}

	updateRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"BrushStroke","id":"`+artifactPath+`","value":{"strokeStyle":"#000000","lineWidth":2,"lineCap":"butt"}}],"uploadScope":"generic"}`))
	updateRequest.Header.Set("Content-Type", "application/json")
	updateRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")

	updateResponse := httptest.NewRecorder()
	handler.ServeHTTP(updateResponse, updateRequest)
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected share update 200, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}

	loadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadCachedBrushStrokes, strings.NewReader(`{"paths":["`+artifactPath+`"]}`))
	loadRequest.Header.Set("Content-Type", "application/json")
	loadRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")

	loadResponse := httptest.NewRecorder()
	handler.ServeHTTP(loadResponse, loadRequest)
	if loadResponse.Code != http.StatusOK {
		t.Fatalf("expected share load 200, got %d with body %q", loadResponse.Code, loadResponse.Body.String())
	}

	var payload []*artifacts.JSONArtifact
	if err := json.Unmarshal(loadResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share load payload: %v", err)
	}
	if len(payload) != 1 || payload[0] == nil {
		t.Fatalf("expected share overlay artifact, got %#v", payload)
	}
	if payload[0].ID != "artifacts/stroke.json" || !strings.Contains(string(payload[0].Value), "#000000") {
		t.Fatalf("unexpected share overlay payload %#v", payload[0])
	}

	transformRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadCachedDrawAreaLayerItemTransform, strings.NewReader(`{"paths":[]}`))
	transformRequest.Header.Set("Content-Type", "application/json")
	transformRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")

	transformResponse := httptest.NewRecorder()
	handler.ServeHTTP(transformResponse, transformRequest)
	if transformResponse.Code != http.StatusOK {
		t.Fatalf("expected draw-area load path 200, got %d with body %q", transformResponse.Code, transformResponse.Body.String())
	}
}

func TestRegisterArtifactRoutesShareModeRejectsPolicyDenied(t *testing.T) {
	t.Parallel()

	service, deploymentRuntime, deploymentRoot := newShareArtifactRouteService(t, false)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler := newShareArtifactRouteHandler(t, service, deploymentRuntime)
	artifactPath := filepath.Join(deploymentRoot, "artifacts", "stroke.json")
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"BrushStroke","id":"`+artifactPath+`","value":{"strokeStyle":"#000000"}}],"uploadScope":"generic"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "artifact_policy_denied") {
		t.Fatalf("expected artifact policy denied code, got %q", response.Body.String())
	}
}

func newArtifactRouteService(t *testing.T) (*artifacts.Service, string, string, *binarypayload.Store) {
	t.Helper()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaFilesRoot := filepath.Join(root, "setta_files")
	artifactsRoot := filepath.Join(settaFilesRoot, "artifacts")
	for _, path := range []string{workspaceRoot, settaFilesRoot, artifactsRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	binaryStore, err := binarypayload.NewStore(filepath.Join(root, "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}
	service, err := artifacts.NewService(artifacts.ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		ArtifactsRoot:  artifactsRoot,
		BinaryStore:    binaryStore,
	})
	if err != nil {
		t.Fatalf("new artifact service: %v", err)
	}
	return service, workspaceRoot, settaFilesRoot, binaryStore
}

func newShareArtifactRouteService(t *testing.T, allowParamChanges bool) (*shareartifacts.Service, *deployments.Runtime, string) {
	t.Helper()

	root := t.TempDir()
	deploymentRoot := filepath.Join(root, "deployment")
	runtimeRoot := filepath.Join(root, "runtime")
	writeShareArtifactRouteFixture(t, deploymentRoot, allowParamChanges)

	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: deploymentRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("open deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close deployment runtime: %v", err)
		}
	})

	binaryStore, err := binarypayload.NewStore(filepath.Join(root, "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}
	service, err := shareartifacts.NewService(shareartifacts.ServiceOptions{
		Deployment:  deploymentRuntime,
		BinaryStore: binaryStore,
	})
	if err != nil {
		t.Fatalf("new share artifact service: %v", err)
	}
	return service, deploymentRuntime, deploymentRoot
}

func newArtifactRouteTestHandler(t *testing.T, mode config.Mode, authService *auth.Service, service *artifacts.Service) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterArtifactRoutes(r, ArtifactRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Artifacts:  service,
			}); err != nil {
				t.Fatalf("register artifact routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newShareArtifactRouteHandler(t *testing.T, service *shareartifacts.Service, deploymentRuntime *deployments.Runtime) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(config.ModeShare), info: RuntimeInfo{Mode: string(config.ModeShare)}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			if err := RegisterArtifactRoutes(r, ArtifactRouteDependencies{
				ModePolicy:     modes.NewPolicy(config.ModeShare),
				ShareSessions:  deploymentRuntime,
				ShareArtifacts: service,
			}); err != nil {
				t.Fatalf("register share artifact routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func writeShareArtifactRouteFixture(t *testing.T, deploymentRoot string, allowParamChanges bool) {
	t.Helper()

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	writeShareArtifactRouteJSON(t, filepath.Join(deploymentRoot, projectstate.MainFileName), document)
	writeShareArtifactRouteJSON(t, filepath.Join(deploymentRoot, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "share-artifacts",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v1",
	})
	writeShareArtifactRouteJSON(t, filepath.Join(deploymentRoot, "policy.json"), map[string]any{
		"allowParamChanges": allowParamChanges,
		"allowRun":          true,
	})
}

func writeShareArtifactRouteJSON(t *testing.T, path string, payload any) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal fixture json: %v", err)
	}
	encoded = append(encoded, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir fixture parent: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write fixture json: %v", err)
	}
}
