package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/filebrowser"
	"setta/internal/httpapi"
	"setta/internal/observability"
)

func TestAppServesFileBrowserRoutes(t *testing.T) {
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

	filePath := cfg.Paths.WorkspaceRoot + "/notes.txt"
	if err := os.WriteFile(filePath, []byte("app file body"), 0o644); err != nil {
		t.Fatalf("write app test file: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	rootRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetFileBrowserRoot, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new root request: %v", err)
	}
	rootRequest.Header.Set("Content-Type", "application/json")
	rootRequest.AddCookie(authCookie)

	rootResponse, err := http.DefaultClient.Do(rootRequest)
	if err != nil {
		t.Fatalf("file browser root request: %v", err)
	}
	defer rootResponse.Body.Close()
	if rootResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rootResponse.Body)
		t.Fatalf("expected root 200, got %d with body %q", rootResponse.StatusCode, string(body))
	}

	var rootPayload filebrowser.RootResponse
	if err := json.NewDecoder(rootResponse.Body).Decode(&rootPayload); err != nil {
		t.Fatalf("decode root payload: %v", err)
	}
	if rootPayload.RootPath != cfg.Paths.WorkspaceRoot {
		t.Fatalf("expected root path %q, got %q", cfg.Paths.WorkspaceRoot, rootPayload.RootPath)
	}

	// The real IDE app should round-trip file content through the binary store and serve it back.
	fileContentRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetFileBrowserFileContent, strings.NewReader(`{"path":"`+filePath+`"}`))
	if err != nil {
		t.Fatalf("new file content request: %v", err)
	}
	fileContentRequest.Header.Set("Content-Type", "application/json")
	fileContentRequest.AddCookie(authCookie)

	fileContentResponse, err := http.DefaultClient.Do(fileContentRequest)
	if err != nil {
		t.Fatalf("file content request: %v", err)
	}
	defer fileContentResponse.Body.Close()
	if fileContentResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(fileContentResponse.Body)
		t.Fatalf("expected file content 200, got %d with body %q", fileContentResponse.StatusCode, string(body))
	}

	var fileContentPayload filebrowser.FileContentResponse
	if err := json.NewDecoder(fileContentResponse.Body).Decode(&fileContentPayload); err != nil {
		t.Fatalf("decode file content payload: %v", err)
	}

	binaryRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api/binary/"+fileContentPayload.ContentID, nil)
	if err != nil {
		t.Fatalf("new binary request: %v", err)
	}
	binaryRequest.AddCookie(authCookie)

	binaryResponse, err := http.DefaultClient.Do(binaryRequest)
	if err != nil {
		t.Fatalf("binary download request: %v", err)
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
	if string(binaryBody) != "app file body" {
		t.Fatalf("expected app file body, got %q", string(binaryBody))
	}
}
