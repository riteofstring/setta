package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/chatattachments"
	"setta/internal/projectstate"
)

type attachmentRouteSessionProvider struct {
	current *auth.CurrentSession
}

func (p attachmentRouteSessionProvider) CurrentSession() (*auth.CurrentSession, bool) {
	if p.current == nil {
		return nil, false
	}
	return p.current, true
}

func TestRegisterAttachmentRootRoutesServesDownloadedAttachment(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	artifactsRoot := filepath.Join(root, "artifacts")
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir artifacts root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactsRoot, "notes.txt"), []byte("attachment body"), 0o644); err != nil {
		t.Fatalf("write attachment: %v", err)
	}
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	service, err := chatattachments.NewService(chatattachments.ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions: attachmentRouteSessionProvider{current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-1"},
			Secret:   []byte("secret"),
		}},
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}
	payload, err := service.BuildPayload(chatattachments.BuildPayloadRequest{
		Messages: []map[string]any{
			{"attachments": []any{map[string]any{"id": "artifacts/notes.txt", "name": "notes.txt", "mimeType": "text/plain"}}},
		},
		ProjectConfigID:     "project-alpha",
		IncludeDownloadURLs: true,
	})
	if err != nil {
		t.Fatalf("build payload: %v", err)
	}
	downloadURL := payload.AttachmentURLs["artifacts/notes.txt"]
	path := strings.TrimPrefix(downloadURL, "http://127.0.0.1:8000")

	router := chi.NewRouter()
	if err := RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{Service: service}); err != nil {
		t.Fatalf("register attachment routes: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, path, nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if response.Body.String() != "attachment body" {
		t.Fatalf("expected attachment body, got %q", response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); got != "text/plain" {
		t.Fatalf("expected text/plain, got %q", got)
	}
	if got := response.Header().Get("Content-Disposition"); !strings.Contains(got, `filename="notes.txt"`) {
		t.Fatalf("expected content disposition filename, got %q", got)
	}
}

func TestRegisterAttachmentRootRoutesRejectsInvalidToken(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	service, err := chatattachments.NewService(chatattachments.ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions: attachmentRouteSessionProvider{current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-1"},
			Secret:   []byte("secret"),
		}},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}

	router := chi.NewRouter()
	if err := RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{Service: service}); err != nil {
		t.Fatalf("register attachment routes: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/attachments/invalid", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_attachment_token" {
		t.Fatalf("expected invalid_attachment_token, got %#v", payload)
	}
}

func TestRegisterAttachmentRootRoutesRequiresService(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	err := RegisterAttachmentRootRoutes(router, AttachmentRootRouteDependencies{})
	if err == nil {
		t.Fatal("expected missing service error")
	}
	if !strings.Contains(err.Error(), "attachment service is required") {
		t.Fatalf("expected missing service error, got %v", err)
	}
}
