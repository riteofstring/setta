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

func TestRegisterArtifactRoutesRoundTripCurrentCallerTypesAndUnsupportedUpdate(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, settaFilesRoot, binaryStore := newArtifactRouteService(t)
	handler := newArtifactRouteTestHandler(t, config.ModeIDE, authService, service)

	assertArtifactRoutesImportAndLoadCurrentCallerArtifacts(t, authService, handler, workspaceRoot, settaFilesRoot, binaryStore)
	assertArtifactRoutesUpdateDeleteAndRejectCurrentCallerArtifacts(t, authService, handler, settaFilesRoot, binaryStore)
}

func assertArtifactRoutesImportAndLoadCurrentCallerArtifacts(
	t *testing.T,
	authService *auth.Service,
	handler http.Handler,
	workspaceRoot string,
	settaFilesRoot string,
	binaryStore *binarypayload.Store,
) {
	t.Helper()

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

	chartID := "artifacts/route-chart.csv"
	chartPath := filepath.Join(settaFilesRoot, filepath.FromSlash(chartID))
	if err := os.WriteFile(chartPath, []byte("x,y\n1,2\n3,4\n"), 0o644); err != nil {
		t.Fatalf("write route chart data: %v", err)
	}
	chartLoadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadCachedChartData, strings.NewReader(`{"paths":["`+chartID+`"]}`))
	chartLoadRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, chartLoadRequest, authService)

	chartLoadResponse := httptest.NewRecorder()
	handler.ServeHTTP(chartLoadResponse, chartLoadRequest)
	if chartLoadResponse.Code != http.StatusOK {
		t.Fatalf("expected chart load 200, got %d with body %q", chartLoadResponse.Code, chartLoadResponse.Body.String())
	}

	var chartPayload []*artifacts.ChartDataArtifact
	if err := json.Unmarshal(chartLoadResponse.Body.Bytes(), &chartPayload); err != nil {
		t.Fatalf("decode chart payload: %v", err)
	}
	if len(chartPayload) != 1 || chartPayload[0] == nil {
		t.Fatalf("expected chart payload, got %#v", chartPayload)
	}
	if got := chartPayload[0].Value["x"]; len(got) != 2 || got[0].(float64) != 1 || got[1].(float64) != 3 {
		t.Fatalf("expected parsed chart column x values, got %#v", got)
	}
}

func assertArtifactRoutesUpdateDeleteAndRejectCurrentCallerArtifacts(
	t *testing.T,
	authService *auth.Service,
	handler http.Handler,
	settaFilesRoot string,
	binaryStore *binarypayload.Store,
) {
	t.Helper()
	filePath := assertArtifactRoutesUpdateCurrentCallerArtifacts(t, authService, handler, settaFilesRoot, binaryStore)
	assertArtifactRoutesDeleteAndRejectCurrentCallerArtifacts(t, authService, handler, filePath)
}

func assertArtifactRoutesUpdateCurrentCallerArtifacts(
	t *testing.T,
	authService *auth.Service,
	handler http.Handler,
	settaFilesRoot string,
	binaryStore *binarypayload.Store,
) string {
	t.Helper()

	fileRef, err := binaryStore.StoreBytes([]byte("route upload"), "text/plain", false)
	if err != nil {
		t.Fatalf("store file payload: %v", err)
	}
	fileValue, err := json.Marshal(fileRef)
	if err != nil {
		t.Fatalf("marshal file payload: %v", err)
	}
	fileUpdateRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"File","id":"artifacts/notes.txt","value":`+string(fileValue)+`}],"uploadScope":"generic"}`))
	fileUpdateRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, fileUpdateRequest, authService)

	fileUpdateResponse := httptest.NewRecorder()
	handler.ServeHTTP(fileUpdateResponse, fileUpdateRequest)
	if fileUpdateResponse.Code != http.StatusOK {
		t.Fatalf("expected file update 200, got %d with body %q", fileUpdateResponse.Code, fileUpdateResponse.Body.String())
	}

	filePath := filepath.Join(settaFilesRoot, "artifacts", "notes.txt")
	if payload, err := os.ReadFile(filePath); err != nil || string(payload) != "route upload" {
		t.Fatalf("expected updated file artifact payload, got %q err=%v", string(payload), err)
	}

	imageUpdateRef, err := binaryStore.StoreBytes([]byte("route-image-update"), "image/png", false)
	if err != nil {
		t.Fatalf("store image update payload: %v", err)
	}
	imageUpdateValue, err := json.Marshal(imageUpdateRef)
	if err != nil {
		t.Fatalf("marshal image update payload: %v", err)
	}
	imageUpdateRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"Image","id":"artifacts/updated-image.png","value":`+string(imageUpdateValue)+`}],"uploadScope":"generic"}`))
	imageUpdateRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, imageUpdateRequest, authService)

	imageUpdateResponse := httptest.NewRecorder()
	handler.ServeHTTP(imageUpdateResponse, imageUpdateRequest)
	if imageUpdateResponse.Code != http.StatusOK {
		t.Fatalf("expected image update 200, got %d with body %q", imageUpdateResponse.Code, imageUpdateResponse.Body.String())
	}

	updatedImagePath := filepath.Join(settaFilesRoot, "artifacts", "updated-image.png")
	if payload, err := os.ReadFile(updatedImagePath); err != nil || string(payload) != "route-image-update" {
		t.Fatalf("expected updated image artifact payload, got %q err=%v", string(payload), err)
	}

	updatedImageLoadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadCachedImageArtifacts, strings.NewReader(`{"paths":["artifacts/updated-image.png"]}`))
	updatedImageLoadRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, updatedImageLoadRequest, authService)

	updatedImageLoadResponse := httptest.NewRecorder()
	handler.ServeHTTP(updatedImageLoadResponse, updatedImageLoadRequest)
	if updatedImageLoadResponse.Code != http.StatusOK {
		t.Fatalf("expected updated image load 200, got %d with body %q", updatedImageLoadResponse.Code, updatedImageLoadResponse.Body.String())
	}
	var updatedImagePayload []*artifacts.ImageArtifact
	if err := json.Unmarshal(updatedImageLoadResponse.Body.Bytes(), &updatedImagePayload); err != nil {
		t.Fatalf("decode updated image payload: %v", err)
	}
	if len(updatedImagePayload) != 1 || updatedImagePayload[0] == nil {
		t.Fatalf("expected updated image payload, got %#v", updatedImagePayload)
	}
	updatedImageBytes, err := binaryStore.ReadBytes(updatedImagePayload[0].Value.ContentID)
	if err != nil {
		t.Fatalf("read updated image bytes from binary store: %v", err)
	}
	if string(updatedImageBytes) != "route-image-update" {
		t.Fatalf("expected updated image bytes, got %q", string(updatedImageBytes))
	}

	chartUpdateRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"ChartData","id":"artifacts/updated-chart.csv","value":{"x":[1,3],"label":["alpha",""]}}],"uploadScope":"generic"}`))
	chartUpdateRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, chartUpdateRequest, authService)

	chartUpdateResponse := httptest.NewRecorder()
	handler.ServeHTTP(chartUpdateResponse, chartUpdateRequest)
	if chartUpdateResponse.Code != http.StatusOK {
		t.Fatalf("expected chart update 200, got %d with body %q", chartUpdateResponse.Code, chartUpdateResponse.Body.String())
	}

	updatedChartLoadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadCachedChartData, strings.NewReader(`{"paths":["artifacts/updated-chart.csv"]}`))
	updatedChartLoadRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, updatedChartLoadRequest, authService)

	updatedChartLoadResponse := httptest.NewRecorder()
	handler.ServeHTTP(updatedChartLoadResponse, updatedChartLoadRequest)
	if updatedChartLoadResponse.Code != http.StatusOK {
		t.Fatalf("expected updated chart load 200, got %d with body %q", updatedChartLoadResponse.Code, updatedChartLoadResponse.Body.String())
	}
	var updatedChartPayload []*artifacts.ChartDataArtifact
	if err := json.Unmarshal(updatedChartLoadResponse.Body.Bytes(), &updatedChartPayload); err != nil {
		t.Fatalf("decode updated chart payload: %v", err)
	}
	if len(updatedChartPayload) != 1 || updatedChartPayload[0] == nil {
		t.Fatalf("expected updated chart payload, got %#v", updatedChartPayload)
	}
	if got := updatedChartPayload[0].Value["x"]; len(got) != 2 || got[0].(float64) != 1 || got[1].(float64) != 3 {
		t.Fatalf("expected updated chart x values, got %#v", got)
	}

	brushUpdateRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"BrushStroke","id":"artifacts/stroke.json","value":{"strokeStyle":"#000000","lineWidth":2,"lineCap":"round","points":[[1,2],"BREAK"],"globalCompositeOperation":"source-over"}},{"type":"DrawAreaLayerItemTransform","id":"artifacts/transform.json","value":{"transform":[1,0,0,1,3,4],"eraserStrokes":[]}}],"uploadScope":"generic"}`))
	brushUpdateRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, brushUpdateRequest, authService)

	brushUpdateResponse := httptest.NewRecorder()
	handler.ServeHTTP(brushUpdateResponse, brushUpdateRequest)
	if brushUpdateResponse.Code != http.StatusOK {
		t.Fatalf("expected brush/transform update 200, got %d with body %q", brushUpdateResponse.Code, brushUpdateResponse.Body.String())
	}

	brushLoadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadCachedBrushStrokes, strings.NewReader(`{"paths":["artifacts/stroke.json"]}`))
	brushLoadRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, brushLoadRequest, authService)

	brushLoadResponse := httptest.NewRecorder()
	handler.ServeHTTP(brushLoadResponse, brushLoadRequest)
	if brushLoadResponse.Code != http.StatusOK {
		t.Fatalf("expected brush load 200, got %d with body %q", brushLoadResponse.Code, brushLoadResponse.Body.String())
	}
	var brushPayload []*artifacts.JSONArtifact
	if err := json.Unmarshal(brushLoadResponse.Body.Bytes(), &brushPayload); err != nil {
		t.Fatalf("decode brush payload: %v", err)
	}
	if len(brushPayload) != 1 || brushPayload[0] == nil || !strings.Contains(string(brushPayload[0].Value), "#000000") {
		t.Fatalf("expected cached brush payload, got %#v", brushPayload)
	}

	transformLoadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadCachedDrawAreaLayerItemTransform, strings.NewReader(`{"paths":["artifacts/transform.json"]}`))
	transformLoadRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, transformLoadRequest, authService)

	transformLoadResponse := httptest.NewRecorder()
	handler.ServeHTTP(transformLoadResponse, transformLoadRequest)
	if transformLoadResponse.Code != http.StatusOK {
		t.Fatalf("expected transform load 200, got %d with body %q", transformLoadResponse.Code, transformLoadResponse.Body.String())
	}
	var transformPayload []*artifacts.JSONArtifact
	if err := json.Unmarshal(transformLoadResponse.Body.Bytes(), &transformPayload); err != nil {
		t.Fatalf("decode transform payload: %v", err)
	}
	if len(transformPayload) != 1 || transformPayload[0] == nil || !strings.Contains(string(transformPayload[0].Value), `"transform":[1,0,0,1,3,4]`) {
		t.Fatalf("expected cached transform payload, got %#v", transformPayload)
	}
	return filePath
}

func assertArtifactRoutesDeleteAndRejectCurrentCallerArtifacts(
	t *testing.T,
	authService *auth.Service,
	handler http.Handler,
	filePath string,
) {
	t.Helper()

	fileDeleteRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteArtifacts, strings.NewReader(`{"artifacts":[{"id":"artifacts/notes.txt","type":"File"}]}`))
	fileDeleteRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, fileDeleteRequest, authService)

	fileDeleteResponse := httptest.NewRecorder()
	handler.ServeHTTP(fileDeleteResponse, fileDeleteRequest)
	if fileDeleteResponse.Code != http.StatusOK {
		t.Fatalf("expected file delete 200, got %d with body %q", fileDeleteResponse.Code, fileDeleteResponse.Body.String())
	}
	if _, err := os.Stat(filePath); !os.IsNotExist(err) {
		t.Fatalf("expected file artifact to be removed, stat err=%v", err)
	}

	unsupportedRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"Unsupported","id":"artifacts/unsupported.bin","value":{"payload":true}}],"uploadScope":"generic"}`))
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

func TestRegisterArtifactRoutesImportFilesAllowsEmptyFiles(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, settaFilesRoot, _ := newArtifactRouteService(t)
	handler := newArtifactRouteTestHandler(t, config.ModeIDE, authService, service)

	emptyPath := filepath.Join(workspaceRoot, "empty.bin")
	if err := os.WriteFile(emptyPath, []byte{}, 0o644); err != nil {
		t.Fatalf("write empty workspace file: %v", err)
	}

	importRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteImportFilesToArtifacts, strings.NewReader(`{"paths":["`+emptyPath+`"],"uploadScope":"generic"}`))
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
	if len(importPayload) != 1 {
		t.Fatalf("expected one imported artifact, got %#v", importPayload)
	}
	if importPayload[0].Size != 0 {
		t.Fatalf("expected empty import size, got %#v", importPayload)
	}

	importedPath := filepath.Join(settaFilesRoot, filepath.FromSlash(importPayload[0].ID))
	payload, err := os.ReadFile(importedPath)
	if err != nil {
		t.Fatalf("read imported empty artifact: %v", err)
	}
	if len(payload) != 0 {
		t.Fatalf("expected imported empty artifact payload, got %q", string(payload))
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

func TestRegisterArtifactRoutesShareModeBlocksImportFiles(t *testing.T) {
	t.Parallel()

	service, deploymentRuntime, _, _ := newShareArtifactRouteService(t, true)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler := newShareArtifactRouteHandler(t, service, deploymentRuntime)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteImportFilesToArtifacts, strings.NewReader(`{"paths":["/tmp/ignored.txt"],"uploadScope":"generic"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden error, got %q", response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
		t.Fatalf("expected deployment-mode message, got %q", response.Body.String())
	}
}

func TestRegisterArtifactRoutesShareModeUpdatesAndLoadsOverlay(t *testing.T) {
	t.Parallel()

	service, deploymentRuntime, deploymentRoot, binaryStore := newShareArtifactRouteService(t, true)
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

	chartPath := filepath.Join(deploymentRoot, "artifacts", "chart.csv")
	if err := os.WriteFile(chartPath, []byte("x,y\n1,2\n3,4\n"), 0o644); err != nil {
		t.Fatalf("write share chart data: %v", err)
	}

	chartLoadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadCachedChartData, strings.NewReader(`{"paths":["`+chartPath+`"]}`))
	chartLoadRequest.Header.Set("Content-Type", "application/json")
	chartLoadRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")

	chartLoadResponse := httptest.NewRecorder()
	handler.ServeHTTP(chartLoadResponse, chartLoadRequest)
	if chartLoadResponse.Code != http.StatusOK {
		t.Fatalf("expected share chart load 200, got %d with body %q", chartLoadResponse.Code, chartLoadResponse.Body.String())
	}

	var chartPayload []*artifacts.ChartDataArtifact
	if err := json.Unmarshal(chartLoadResponse.Body.Bytes(), &chartPayload); err != nil {
		t.Fatalf("decode share chart payload: %v", err)
	}
	if len(chartPayload) != 1 || chartPayload[0] == nil {
		t.Fatalf("expected share chart payload, got %#v", chartPayload)
	}
	if chartPayload[0].ID != "artifacts/chart.csv" {
		t.Fatalf("expected normalized share chart id, got %#v", chartPayload[0])
	}
	if got := chartPayload[0].Value["x"]; len(got) != 2 || got[0].(float64) != 1 || got[1].(float64) != 3 {
		t.Fatalf("expected parsed share chart column x values, got %#v", got)
	}

	fileRef, err := binaryStore.StoreBytes([]byte("share upload"), "text/plain", false)
	if err != nil {
		t.Fatalf("store share file payload: %v", err)
	}
	fileValue, err := json.Marshal(fileRef)
	if err != nil {
		t.Fatalf("marshal share file payload: %v", err)
	}
	fileUpdateRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"File","id":"artifacts/notes.txt","value":`+string(fileValue)+`}],"uploadScope":"chat"}`))
	fileUpdateRequest.Header.Set("Content-Type", "application/json")
	fileUpdateRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")

	fileUpdateResponse := httptest.NewRecorder()
	handler.ServeHTTP(fileUpdateResponse, fileUpdateRequest)
	if fileUpdateResponse.Code != http.StatusOK {
		t.Fatalf("expected share file update 200, got %d with body %q", fileUpdateResponse.Code, fileUpdateResponse.Body.String())
	}

	fileDeleteRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteArtifacts, strings.NewReader(`{"artifacts":[{"id":"artifacts/notes.txt","type":"File"}]}`))
	fileDeleteRequest.Header.Set("Content-Type", "application/json")
	fileDeleteRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")

	fileDeleteResponse := httptest.NewRecorder()
	handler.ServeHTTP(fileDeleteResponse, fileDeleteRequest)
	if fileDeleteResponse.Code != http.StatusOK {
		t.Fatalf("expected share file delete 200, got %d with body %q", fileDeleteResponse.Code, fileDeleteResponse.Body.String())
	}

	shareFilePath := filepath.Join(deploymentRoot, "artifacts", "notes.txt")
	if payload, err := os.ReadFile(shareFilePath); err == nil && string(payload) != "" {
		t.Fatalf("expected share file delete to stay overlay-only, disk payload was %q", string(payload))
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

func TestRegisterArtifactRoutesShareModeRejectsCachedLoadsOutsideAllowedRoots(t *testing.T) {
	t.Parallel()

	service, deploymentRuntime, _, _ := newShareArtifactRouteService(t, true)
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler := newShareArtifactRouteHandler(t, service, deploymentRuntime)

	loadRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadCachedBrushStrokes, strings.NewReader(`{"paths":["manifest.json"]}`))
	loadRequest.Header.Set("Content-Type", "application/json")
	loadRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")

	loadResponse := httptest.NewRecorder()
	handler.ServeHTTP(loadResponse, loadRequest)
	if loadResponse.Code != http.StatusForbidden {
		t.Fatalf("expected share load 403, got %d with body %q", loadResponse.Code, loadResponse.Body.String())
	}
	if !strings.Contains(loadResponse.Body.String(), "artifact_path_forbidden") {
		t.Fatalf("expected artifact_path_forbidden code, got %q", loadResponse.Body.String())
	}
	if !strings.Contains(loadResponse.Body.String(), "deployment artifacts, json_sources, or code roots") {
		t.Fatalf("expected allowed-root error detail, got %q", loadResponse.Body.String())
	}
}

func TestRegisterArtifactRoutesShareModeRejectsPolicyDenied(t *testing.T) {
	t.Parallel()

	service, deploymentRuntime, deploymentRoot, _ := newShareArtifactRouteService(t, false)
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

func TestRegisterArtifactRoutesUpdateAppliesChatMimePolicyWithoutRestrictingGenericScope(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	uploadPolicies := &artifacts.UploadPolicies{
		Chat: artifacts.ScopeUploadPolicy{
			MaxFileBytes:        10,
			MaxFileLabel:        "10 bytes",
			AllowedMimePrefixes: []string{"text/"},
		},
		Generic: artifacts.ScopeUploadPolicy{
			MaxFileBytes: 10,
			MaxFileLabel: "10 bytes",
		},
	}
	service, _, settaFilesRoot, binaryStore := newArtifactRouteServiceWithPolicies(t, uploadPolicies)
	handler := newArtifactRouteTestHandler(t, config.ModeIDE, authService, service)

	imageRef, err := binaryStore.StoreBytes([]byte("12345"), "image/png", false)
	if err != nil {
		t.Fatalf("store image payload: %v", err)
	}
	imageValue, err := json.Marshal(imageRef)
	if err != nil {
		t.Fatalf("marshal image payload: %v", err)
	}

	disallowedRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"File","id":"artifacts/image.png","value":`+string(imageValue)+`}],"uploadScope":"chat"}`))
	disallowedRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, disallowedRequest, authService)

	disallowedResponse := httptest.NewRecorder()
	handler.ServeHTTP(disallowedResponse, disallowedRequest)
	if disallowedResponse.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("expected 415, got %d with body %q", disallowedResponse.Code, disallowedResponse.Body.String())
	}
	var disallowedPayload errorResponse
	if err := json.Unmarshal(disallowedResponse.Body.Bytes(), &disallowedPayload); err != nil {
		t.Fatalf("decode disallowed mime error payload: %v", err)
	}
	if disallowedPayload.Error.Code != "artifact_mime_not_allowed" {
		t.Fatalf("expected artifact_mime_not_allowed, got %#v", disallowedPayload)
	}

	allowedRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"File","id":"artifacts/image.png","value":`+string(imageValue)+`}],"uploadScope":"generic"}`))
	allowedRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, allowedRequest, authService)

	allowedResponse := httptest.NewRecorder()
	handler.ServeHTTP(allowedResponse, allowedRequest)
	if allowedResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", allowedResponse.Code, allowedResponse.Body.String())
	}

	artifactPath := filepath.Join(settaFilesRoot, "artifacts", "image.png")
	payload, err := os.ReadFile(artifactPath)
	if err != nil {
		t.Fatalf("read generic-scope artifact payload: %v", err)
	}
	if string(payload) != "12345" {
		t.Fatalf("expected generic-scope artifact bytes to persist, got %q", string(payload))
	}
}

func TestRegisterArtifactRoutesMapUploadPolicyErrors(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	uploadPolicies := &artifacts.UploadPolicies{
		Chat: artifacts.ScopeUploadPolicy{
			MaxFileBytes: 5,
			MaxFileLabel: "5 bytes",
		},
		Generic: artifacts.ScopeUploadPolicy{
			MaxFileBytes:        10,
			MaxFileLabel:        "10 bytes",
			AllowedMimePrefixes: []string{"image/"},
		},
	}
	service, workspaceRoot, _, binaryStore := newArtifactRouteServiceWithPolicies(t, uploadPolicies)
	handler := newArtifactRouteTestHandler(t, config.ModeIDE, authService, service)

	disallowedPath := filepath.Join(workspaceRoot, "notes.txt")
	if err := os.WriteFile(disallowedPath, []byte("12345"), 0o644); err != nil {
		t.Fatalf("write disallowed import file: %v", err)
	}
	importRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteImportFilesToArtifacts, strings.NewReader(`{"paths":["`+disallowedPath+`"],"uploadScope":"generic"}`))
	importRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, importRequest, authService)

	importResponse := httptest.NewRecorder()
	handler.ServeHTTP(importResponse, importRequest)
	if importResponse.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("expected 415, got %d with body %q", importResponse.Code, importResponse.Body.String())
	}
	var importPayload errorResponse
	if err := json.Unmarshal(importResponse.Body.Bytes(), &importPayload); err != nil {
		t.Fatalf("decode import error payload: %v", err)
	}
	if importPayload.Error.Code != "artifact_mime_not_allowed" {
		t.Fatalf("expected artifact_mime_not_allowed, got %#v", importPayload)
	}

	oversizedRef, err := binaryStore.StoreBytes([]byte("123456"), "text/plain", false)
	if err != nil {
		t.Fatalf("store oversized update payload: %v", err)
	}
	oversizedValue, err := json.Marshal(oversizedRef)
	if err != nil {
		t.Fatalf("marshal oversized update payload: %v", err)
	}
	updateRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateArtifacts, strings.NewReader(`{"artifacts":[{"type":"File","id":"artifacts/too-big.txt","value":`+string(oversizedValue)+`}],"uploadScope":"chat"}`))
	updateRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, updateRequest, authService)

	updateResponse := httptest.NewRecorder()
	handler.ServeHTTP(updateResponse, updateRequest)
	if updateResponse.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}
	var updatePayload errorResponse
	if err := json.Unmarshal(updateResponse.Body.Bytes(), &updatePayload); err != nil {
		t.Fatalf("decode update error payload: %v", err)
	}
	if updatePayload.Error.Code != "artifact_payload_too_large" {
		t.Fatalf("expected artifact_payload_too_large, got %#v", updatePayload)
	}
}

func TestRegisterArtifactRoutesMapImportFilePathErrors(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, workspaceRoot, _, _ := newArtifactRouteService(t)
	handler := newArtifactRouteTestHandler(t, config.ModeIDE, authService, service)

	missingPath := filepath.Join(workspaceRoot, "missing.txt")
	missingRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteImportFilesToArtifacts, strings.NewReader(`{"paths":["`+missingPath+`"],"uploadScope":"generic"}`))
	missingRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, missingRequest, authService)

	missingResponse := httptest.NewRecorder()
	handler.ServeHTTP(missingResponse, missingRequest)
	if missingResponse.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing import path, got %d with body %q", missingResponse.Code, missingResponse.Body.String())
	}
	var missingPayload errorResponse
	if err := json.Unmarshal(missingResponse.Body.Bytes(), &missingPayload); err != nil {
		t.Fatalf("decode missing import error payload: %v", err)
	}
	if missingPayload.Error.Code != "artifact_path_not_found" {
		t.Fatalf("expected artifact_path_not_found, got %#v", missingPayload)
	}

	directoryPath := filepath.Join(workspaceRoot, "folder")
	if err := os.MkdirAll(directoryPath, 0o755); err != nil {
		t.Fatalf("mkdir import directory fixture: %v", err)
	}
	directoryRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteImportFilesToArtifacts, strings.NewReader(`{"paths":["`+directoryPath+`"],"uploadScope":"generic"}`))
	directoryRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, directoryRequest, authService)

	directoryResponse := httptest.NewRecorder()
	handler.ServeHTTP(directoryResponse, directoryRequest)
	if directoryResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for directory import path, got %d with body %q", directoryResponse.Code, directoryResponse.Body.String())
	}
	var directoryPayload errorResponse
	if err := json.Unmarshal(directoryResponse.Body.Bytes(), &directoryPayload); err != nil {
		t.Fatalf("decode directory import error payload: %v", err)
	}
	if directoryPayload.Error.Code != "artifact_path_not_file" {
		t.Fatalf("expected artifact_path_not_file, got %#v", directoryPayload)
	}
}

func newArtifactRouteService(t *testing.T) (*artifacts.Service, string, string, *binarypayload.Store) {
	t.Helper()

	return newArtifactRouteServiceWithPolicies(t, nil)
}

func newArtifactRouteServiceWithPolicies(t *testing.T, uploadPolicies *artifacts.UploadPolicies) (*artifacts.Service, string, string, *binarypayload.Store) {
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
		UploadPolicies: uploadPolicies,
	})
	if err != nil {
		t.Fatalf("new artifact service: %v", err)
	}
	return service, workspaceRoot, settaFilesRoot, binaryStore
}

func newShareArtifactRouteService(t *testing.T, allowParamChanges bool) (*shareartifacts.Service, *deployments.Runtime, string, *binarypayload.Store) {
	t.Helper()

	return newShareArtifactRouteServiceWithPolicies(t, allowParamChanges, nil)
}

func newShareArtifactRouteServiceWithPolicies(t *testing.T, allowParamChanges bool, uploadPolicies *artifacts.UploadPolicies) (*shareartifacts.Service, *deployments.Runtime, string, *binarypayload.Store) {
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
		Deployment:     deploymentRuntime,
		BinaryStore:    binaryStore,
		UploadPolicies: uploadPolicies,
	})
	if err != nil {
		t.Fatalf("new share artifact service: %v", err)
	}
	return service, deploymentRuntime, deploymentRoot, binaryStore
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

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:                   "project-alpha",
				Name:                 "Alpha",
				ProjectChatWindowing: &defaultWindowing,
			},
		},
	}
	writeHTTPDeploymentDocument(t, filepath.Join(deploymentRoot, projectstate.MainFileName), document)
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
