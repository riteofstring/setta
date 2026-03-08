package chatattachments

import (
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/projectstate"
)

type staticSessionProvider struct {
	current *auth.CurrentSession
}

func (p staticSessionProvider) CurrentSession() (*auth.CurrentSession, bool) {
	if p.current == nil {
		return nil, false
	}
	return p.current, true
}

func TestBuildPayloadShapesAdapterAttachmentInputs(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	artifactsRoot := filepath.Join(root, "artifacts")
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir artifacts root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactsRoot, "notes.txt"), []byte("Hello from attachment."), 0o644); err != nil {
		t.Fatalf("write text attachment: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactsRoot, "image.png"), []byte("png-bytes"), 0o644); err != nil {
		t.Fatalf("write image attachment: %v", err)
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
	service, err := NewService(ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions: staticSessionProvider{current: &auth.CurrentSession{
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

	payload, err := service.BuildPayload(BuildPayloadRequest{
		Messages: []map[string]any{
			{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello"},
				},
				"attachments": []any{
					map[string]any{"id": "artifacts/notes.txt", "name": "notes.txt", "mimeType": "text/plain"},
					map[string]any{"id": "artifacts/image.png", "name": "image.png", "mimeType": "image/png"},
					map[string]any{"id": "artifacts/notes.txt", "name": "notes-dupe.txt", "mimeType": "text/plain"},
				},
			},
		},
		ProjectConfigID:     "project-alpha",
		IncludeText:         true,
		IncludeTextNoImages: true,
		IncludeDownloadURLs: true,
	})
	if err != nil {
		t.Fatalf("build payload: %v", err)
	}
	if !strings.Contains(payload.AttachmentText, "[Attachment: notes.txt]") {
		t.Fatalf("expected text attachment block, got %q", payload.AttachmentText)
	}
	if !strings.Contains(payload.AttachmentText, "Hello from attachment.") {
		t.Fatalf("expected attachment contents, got %q", payload.AttachmentText)
	}
	if !strings.Contains(payload.AttachmentText, "[Attachment: image.png]") {
		t.Fatalf("expected image placeholder in attachmentText, got %q", payload.AttachmentText)
	}
	if strings.Contains(payload.AttachmentTextNoImages, "image.png") {
		t.Fatalf("expected image placeholder to be omitted from attachmentTextNoImages, got %q", payload.AttachmentTextNoImages)
	}
	if len(payload.AttachmentURLs) != 2 {
		t.Fatalf("expected deduped attachment URLs, got %#v", payload.AttachmentURLs)
	}
	parsed, err := url.Parse(payload.AttachmentURLs["artifacts/notes.txt"])
	if err != nil {
		t.Fatalf("parse attachment URL: %v", err)
	}
	if parsed.Scheme != "http" || parsed.Host != "127.0.0.1:8000" {
		t.Fatalf("unexpected attachment URL %#v", parsed)
	}
	if !strings.HasPrefix(parsed.Path, "/api/attachments/") {
		t.Fatalf("unexpected attachment path %q", parsed.Path)
	}
}

func TestBuildPayloadRequiresCurrentSessionForDownloadURLs(t *testing.T) {
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
	service, err := NewService(ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions:       staticSessionProvider{},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}

	_, err = service.BuildPayload(BuildPayloadRequest{
		Messages: []map[string]any{
			{"attachments": []any{map[string]any{"id": "artifacts/notes.txt", "name": "notes.txt"}}},
		},
		ProjectConfigID:     "project-alpha",
		IncludeDownloadURLs: true,
	})
	if !errors.Is(err, ErrAttachmentTokenUnavailable) {
		t.Fatalf("expected session error, got %v", err)
	}
}

func TestDownloadServesArtifactContentForValidToken(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	artifactsRoot := filepath.Join(root, "artifacts")
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir artifacts root: %v", err)
	}
	content := []byte("attachment body")
	if err := os.WriteFile(filepath.Join(artifactsRoot, "notes.txt"), content, 0o644); err != nil {
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
	now := time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC)
	service, err := NewService(ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions: staticSessionProvider{current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-1"},
			Secret:   []byte("secret"),
		}},
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}

	payload, err := service.BuildPayload(BuildPayloadRequest{
		Messages: []map[string]any{
			{"attachments": []any{map[string]any{"id": "artifacts/notes.txt", "name": "notes.txt", "mimeType": "text/plain"}}},
		},
		ProjectConfigID:     "project-alpha",
		IncludeDownloadURLs: true,
	})
	if err != nil {
		t.Fatalf("build payload: %v", err)
	}
	parsed, err := url.Parse(payload.AttachmentURLs["artifacts/notes.txt"])
	if err != nil {
		t.Fatalf("parse attachment URL: %v", err)
	}
	result, err := service.Download(strings.TrimPrefix(parsed.Path, "/api/attachments/"))
	if err != nil {
		t.Fatalf("download attachment: %v", err)
	}
	if string(result.Content) != string(content) {
		t.Fatalf("expected attachment content %q, got %q", string(content), string(result.Content))
	}
	if result.MediaType != "text/plain" {
		t.Fatalf("expected text/plain media type, got %q", result.MediaType)
	}
	if result.Filename != "notes.txt" {
		t.Fatalf("expected notes.txt filename, got %q", result.Filename)
	}
}

func TestDownloadRejectsInvalidToken(t *testing.T) {
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
	service, err := NewService(ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions: staticSessionProvider{current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-1"},
			Secret:   []byte("secret"),
		}},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}

	if _, err := service.Download("invalid"); !errors.Is(err, ErrInvalidAttachmentToken) {
		t.Fatalf("expected invalid token error, got %v", err)
	}
}
