package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

type stubInfoService struct {
	mode string
	info RuntimeInfo
}

func (s stubInfoService) ServerMode(context.Context) string {
	return s.mode
}

func (s stubInfoService) RuntimeInfo(context.Context) RuntimeInfo {
	return s.info
}

func TestHandlerServesFoundationRoutes(t *testing.T) {
	t.Parallel()

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info: stubInfoService{
			mode: "ide",
			info: RuntimeInfo{
				Mode: "ide",
				Paths: RuntimePaths{
					WorkspaceRoot:      "/tmp/workspace",
					SettaHome:          "/tmp/.setta",
					ProfileLookupHome:  "/tmp/.setta",
					SettaFilesRoot:     "/tmp/workspace/setta_files",
					SettaFilesLocation: "local",
					RuntimeRoot:        "/tmp/workspace/setta_files/runtime",
				},
				Policy: RuntimePathPolicy{
					GlobalSettaFilesBase: "/tmp/.setta/setta_files",
					AutoMode:             "create_local",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	healthResponse := httptest.NewRecorder()
	handler.ServeHTTP(healthResponse, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if healthResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", healthResponse.Code)
	}

	serverModeResponse := httptest.NewRecorder()
	handler.ServeHTTP(serverModeResponse, httptest.NewRequest(http.MethodGet, "/api/serverMode", nil))
	if serverModeResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", serverModeResponse.Code)
	}
	if strings.TrimSpace(serverModeResponse.Body.String()) != `{"mode":"ide"}` {
		t.Fatalf("unexpected server mode payload %q", serverModeResponse.Body.String())
	}

	runtimeInfoResponse := httptest.NewRecorder()
	handler.ServeHTTP(runtimeInfoResponse, httptest.NewRequest(http.MethodGet, "/api/runtimeInfo", nil))
	if runtimeInfoResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", runtimeInfoResponse.Code)
	}

	var payload RuntimeInfo
	if err := json.Unmarshal(runtimeInfoResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode runtime info: %v", err)
	}
	if payload.Paths.SettaFilesLocation != "local" {
		t.Fatalf("expected local setta files location, got %q", payload.Paths.SettaFilesLocation)
	}
}

func TestHandlerReturnsJSONNotFoundEnvelope(t *testing.T) {
	t.Parallel()

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/missing", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", response.Code)
	}
	if !strings.Contains(response.Body.String(), `"code":"not_found"`) {
		t.Fatalf("expected not_found envelope, got %q", response.Body.String())
	}
}

func TestHandlerRecoversPanics(t *testing.T) {
	t.Parallel()

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Register: func(r chi.Router) {
			r.Get("/panic", func(http.ResponseWriter, *http.Request) {
				panic("boom")
			})
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/panic", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", response.Code)
	}
	if !strings.Contains(response.Body.String(), `"code":"internal_error"`) {
		t.Fatalf("expected internal error envelope, got %q", response.Body.String())
	}
}
