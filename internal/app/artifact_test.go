package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/artifacts"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
)

func TestAppServesArtifactRoutes(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	workspaceFile := filepath.Join(cfg.Paths.WorkspaceRoot, "app-import.txt")
	if err := os.WriteFile(workspaceFile, []byte("app import"), 0o644); err != nil {
		t.Fatalf("write workspace import file: %v", err)
	}

	importRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteImportFilesToArtifacts, strings.NewReader(`{"paths":["`+workspaceFile+`"],"uploadScope":"generic"}`))
	if err != nil {
		t.Fatalf("new import request: %v", err)
	}
	importRequest.Header.Set("Content-Type", "application/json")
	importRequest.AddCookie(authCookie)

	importResponse, err := http.DefaultClient.Do(importRequest)
	if err != nil {
		t.Fatalf("import request: %v", err)
	}
	defer importResponse.Body.Close()
	if importResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(importResponse.Body)
		t.Fatalf("expected import 200, got %d with body %q", importResponse.StatusCode, string(body))
	}

	var imported []artifacts.ImportFilesResponseItem
	if err := json.NewDecoder(importResponse.Body).Decode(&imported); err != nil {
		t.Fatalf("decode import payload: %v", err)
	}
	if len(imported) != 1 {
		t.Fatalf("expected one imported artifact, got %#v", imported)
	}
	importedPath := filepath.Join(cfg.Paths.SettaFilesRoot, filepath.FromSlash(imported[0].ID))
	if payload, err := os.ReadFile(importedPath); err != nil || string(payload) != "app import" {
		t.Fatalf("expected app imported payload, got %q err=%v", string(payload), err)
	}

	imageID := "artifacts/app-preview.png"
	imagePath := filepath.Join(cfg.Paths.SettaFilesRoot, filepath.FromSlash(imageID))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("mkdir image parent: %v", err)
	}
	if err := os.WriteFile(imagePath, []byte("app-image"), 0o644); err != nil {
		t.Fatalf("write app image: %v", err)
	}

	loadRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadCachedImageArtifacts, strings.NewReader(`{"paths":["`+imageID+`"]}`))
	if err != nil {
		t.Fatalf("new load request: %v", err)
	}
	loadRequest.Header.Set("Content-Type", "application/json")
	loadRequest.AddCookie(authCookie)

	loadResponse, err := http.DefaultClient.Do(loadRequest)
	if err != nil {
		t.Fatalf("load request: %v", err)
	}
	defer loadResponse.Body.Close()
	if loadResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadResponse.Body)
		t.Fatalf("expected load 200, got %d with body %q", loadResponse.StatusCode, string(body))
	}

	var images []*artifacts.ImageArtifact
	if err := json.NewDecoder(loadResponse.Body).Decode(&images); err != nil {
		t.Fatalf("decode image payload: %v", err)
	}
	if len(images) != 1 || images[0] == nil {
		t.Fatalf("expected image payload, got %#v", images)
	}

	binaryRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api/binary/"+images[0].Value.ContentID, nil)
	if err != nil {
		t.Fatalf("new binary request: %v", err)
	}
	binaryRequest.AddCookie(authCookie)

	binaryResponse, err := http.DefaultClient.Do(binaryRequest)
	if err != nil {
		t.Fatalf("binary request: %v", err)
	}
	defer binaryResponse.Body.Close()
	if binaryResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(binaryResponse.Body)
		t.Fatalf("expected binary 200, got %d with body %q", binaryResponse.StatusCode, string(body))
	}
	binaryBody, err := io.ReadAll(binaryResponse.Body)
	if err != nil {
		t.Fatalf("read binary body: %v", err)
	}
	if string(binaryBody) != "app-image" {
		t.Fatalf("expected app image bytes, got %q", string(binaryBody))
	}

	contentID := uploadArtifactBinary(t, server.URL, authCookie, []byte("delete me"), "delete.txt")
	updateBody := `{"artifacts":[{"type":"File","id":"artifacts/delete.txt","value":{"contentId":"` + contentID + `","byteLength":9,"mimeType":"text/plain"}}],"uploadScope":"generic"}`
	updateRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteUpdateArtifacts, strings.NewReader(updateBody))
	if err != nil {
		t.Fatalf("new update request: %v", err)
	}
	updateRequest.Header.Set("Content-Type", "application/json")
	updateRequest.AddCookie(authCookie)

	updateResponse, err := http.DefaultClient.Do(updateRequest)
	if err != nil {
		t.Fatalf("update request: %v", err)
	}
	defer updateResponse.Body.Close()
	if updateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(updateResponse.Body)
		t.Fatalf("expected update 200, got %d with body %q", updateResponse.StatusCode, string(body))
	}

	deleteRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteArtifacts, strings.NewReader(`{"artifacts":[{"id":"artifacts/delete.txt","type":"File"}]}`))
	if err != nil {
		t.Fatalf("new delete request: %v", err)
	}
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteRequest.AddCookie(authCookie)

	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected delete 200, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	deletedPath := filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts", "delete.txt")
	if _, err := os.Stat(deletedPath); !os.IsNotExist(err) {
		t.Fatalf("expected deleted artifact to be removed, stat err=%v", err)
	}
}

func uploadArtifactBinary(t *testing.T, serverURL string, authCookie *http.Cookie, payload []byte, filename string) string {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	fileWriter, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := fileWriter.Write(payload); err != nil {
		t.Fatalf("write multipart payload: %v", err)
	}
	if err := writer.WriteField("durable", "false"); err != nil {
		t.Fatalf("write durable field: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RouteBinaryUpload, &body)
	if err != nil {
		t.Fatalf("new binary upload request: %v", err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("binary upload request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected binary upload 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payloadRef struct {
		ContentID string `json:"contentId"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payloadRef); err != nil {
		t.Fatalf("decode binary upload payload: %v", err)
	}
	return payloadRef.ContentID
}
