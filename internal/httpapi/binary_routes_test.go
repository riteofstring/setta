package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/modes"
)

func TestRegisterBinaryRoutesStoresUploadedPayload(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	store, err := binarypayload.NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterBinaryRoutes(r, BinaryRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Store:      store,
			}); err != nil {
				t.Fatalf("register binary routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	body, contentType := buildBinaryUploadRequestBody(t, []byte("snapshot-bytes"), "false")
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteBinaryUpload, body)
	request.Header.Set("Content-Type", contentType)
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var ref binarypayload.ContentRef
	if err := json.NewDecoder(response.Body).Decode(&ref); err != nil {
		t.Fatalf("decode binary upload response: %v", err)
	}
	if ref.ContentID == "" {
		t.Fatal("expected content id")
	}
	if ref.ByteLength != int64(len("snapshot-bytes")) {
		t.Fatalf("expected byte length %d, got %d", len("snapshot-bytes"), ref.ByteLength)
	}

	payload, err := store.ReadBytes(ref.ContentID)
	if err != nil {
		t.Fatalf("read uploaded payload: %v", err)
	}
	if string(payload) != "snapshot-bytes" {
		t.Fatalf("expected uploaded payload bytes, got %q", string(payload))
	}

	metadataPath := filepath.Join(store.Root(), ref.ContentID+".json")
	metadataContent, err := os.ReadFile(metadataPath)
	if err != nil {
		t.Fatalf("read uploaded metadata: %v", err)
	}
	var metadata struct {
		Durable bool `json:"durable"`
	}
	if err := json.Unmarshal(metadataContent, &metadata); err != nil {
		t.Fatalf("decode uploaded metadata: %v", err)
	}
	if metadata.Durable {
		t.Fatalf("expected durable=false metadata, got %#v", metadata)
	}
}

func TestRegisterBinaryRoutesRejectsInvalidDurableFlag(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	store, err := binarypayload.NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterBinaryRoutes(r, BinaryRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Store:      store,
			}); err != nil {
				t.Fatalf("register binary routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	body, contentType := buildBinaryUploadRequestBody(t, []byte("snapshot-bytes"), "not-a-bool")
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteBinaryUpload, body)
	request.Header.Set("Content-Type", contentType)
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_form_value"`) {
		t.Fatalf("expected invalid_form_value error, got %q", response.Body.String())
	}
}

func TestRegisterBinaryRoutesRejectsOversizedPayload(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	store, err := binarypayload.NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterBinaryRoutes(r, BinaryRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Store:      store,
			}); err != nil {
				t.Fatalf("register binary routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	oversizedPayload := bytes.Repeat([]byte("a"), int(binarypayload.DefaultMaxUploadBytes)+1)
	body, contentType := buildBinaryUploadRequestBody(t, oversizedPayload, "true")
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteBinaryUpload, body)
	request.Header.Set("Content-Type", contentType)
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode oversized error payload: %v", err)
	}
	if payload.Error.Code != "binary_payload_too_large" {
		t.Fatalf("expected binary_payload_too_large, got %#v", payload)
	}
	if payload.Error.Message != payloadTooLargeMessage(binarypayload.DefaultMaxUploadBytes) {
		t.Fatalf("unexpected oversized error payload %#v", payload)
	}
}

func TestRegisterBinaryRoutesServesDownloadedPayload(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	store, err := binarypayload.NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}
	ref, err := store.StoreBytes([]byte("download-body"), "text/plain", false)
	if err != nil {
		t.Fatalf("store payload: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterBinaryRoutes(r, BinaryRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Store:      store,
			}); err != nil {
				t.Fatalf("register binary routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	// Binary download should stream the stored payload bytes back over the Go route.
	request := httptest.NewRequest(http.MethodGet, "/api/binary/"+ref.ContentID, nil)
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if body := response.Body.String(); body != "download-body" {
		t.Fatalf("expected downloaded body %q, got %q", "download-body", body)
	}
	if got := response.Header().Get("Content-Type"); !strings.Contains(got, "text/plain") {
		t.Fatalf("expected text/plain content type, got %q", got)
	}
}

func TestRegisterBinaryRoutesRejectsInvalidDownloadContentID(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	store, err := binarypayload.NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterBinaryRoutes(r, BinaryRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Store:      store,
			}); err != nil {
				t.Fatalf("register binary routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/binary/..", nil)
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_binary_content_id"`) {
		t.Fatalf("expected invalid_binary_content_id error, got %q", response.Body.String())
	}
}

func TestRegisterBinaryRoutesReturnNotFoundForUnknownDownloadContentID(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	store, err := binarypayload.NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterBinaryRoutes(r, BinaryRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Store:      store,
			}); err != nil {
				t.Fatalf("register binary routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/binary/missing-content-id", nil)
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"binary_payload_not_found"`) {
		t.Fatalf("expected binary_payload_not_found error, got %q", response.Body.String())
	}
}

func TestRegisterBinaryRoutesBlocksDeploymentMode(t *testing.T) {
	t.Parallel()

	store, err := binarypayload.NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			if err := RegisterBinaryRoutes(r, BinaryRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeShare),
				Store:      store,
			}); err != nil {
				t.Fatalf("register binary routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	body, contentType := buildBinaryUploadRequestBody(t, []byte("snapshot-bytes"), "false")
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteBinaryUpload, body)
	request.Header.Set("Content-Type", contentType)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden error, got %q", response.Body.String())
	}
}

func buildBinaryUploadRequestBody(t *testing.T, payload []byte, durable string) (*bytes.Buffer, string) {
	t.Helper()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	fileWriter, err := writer.CreateFormFile("file", "snapshot.png")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := fileWriter.Write(payload); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.WriteField("durable", durable); err != nil {
		t.Fatalf("write durable field: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	return body, writer.FormDataContentType()
}
