package localsessions

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/auth"
)

func TestRegistryCreateSessionWritesMetadataAndSecret(t *testing.T) {
	t.Parallel()

	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	now := time.Date(2026, time.March, 8, 10, 11, 12, 0, time.UTC)
	registry, err := NewRegistry(RegistryOptions{
		SessionsRoot: sessionsRoot,
		Now:          func() time.Time { return now },
		Random:       bytes.NewReader([]byte("abcdef0123456789abcdef0123456789abcdef0123456789")),
		PIDCreateTime: func(int) *float64 {
			value := 123.456
			return &value
		},
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	metadata, err := registry.CreateSession(CreateSessionInput{
		WorkspaceRoot:      filepath.Join(t.TempDir(), "workspace"),
		Host:               "127.0.0.1",
		Port:               61234,
		PID:                43210,
		SettaFilesLocation: "global",
		SettaFilesRoot:     "/tmp/setta-files",
		RuntimeRoot:        "/tmp/runtime",
		SettaHome:          "/tmp/.setta",
		Profile:            "dev",
		ServerMode:         "launcher",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	if metadata.ID != "616263" {
		t.Fatalf("expected session id 616263, got %q", metadata.ID)
	}
	if metadata.Host != "127.0.0.1" || metadata.Port != 61234 {
		t.Fatalf("unexpected bind metadata: %#v", metadata)
	}
	if metadata.ServerMode != "launcher" {
		t.Fatalf("expected launcher server mode, got %q", metadata.ServerMode)
	}
	if metadata.PIDCreateTime == nil || *metadata.PIDCreateTime != 123.456 {
		t.Fatalf("unexpected pid create time %#v", metadata.PIDCreateTime)
	}
	if !metadata.StartedAt.Equal(now) {
		t.Fatalf("expected started at %v, got %v", now, metadata.StartedAt)
	}

	secret, err := registry.LoadSecret(metadata)
	if err != nil {
		t.Fatalf("load secret: %v", err)
	}
	if len(secret) != sessionSecretBytes {
		t.Fatalf("expected %d secret bytes, got %d", sessionSecretBytes, len(secret))
	}

	sessionDir := filepath.Join(sessionsRoot, metadata.ID)
	metadataPath := filepath.Join(sessionDir, sessionMetadataFileName)
	metadataBytes, err := os.ReadFile(metadataPath)
	if err != nil {
		t.Fatalf("read metadata file: %v", err)
	}

	var persisted auth.SessionMetadata
	if err := json.Unmarshal(metadataBytes, &persisted); err != nil {
		t.Fatalf("decode metadata: %v", err)
	}
	if persisted.ID != metadata.ID {
		t.Fatalf("expected persisted session id %q, got %q", metadata.ID, persisted.ID)
	}
	if persisted.SecretPath != metadata.SecretPath {
		t.Fatalf("expected persisted secret path %q, got %q", metadata.SecretPath, persisted.SecretPath)
	}
}

func TestRegistryDeleteSessionRemovesSessionDirectory(t *testing.T) {
	t.Parallel()

	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	registry, err := NewRegistry(RegistryOptions{
		SessionsRoot: sessionsRoot,
		Random:       bytes.NewReader([]byte("abcdef0123456789abcdef0123456789abcdef0123456789")),
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	metadata, err := registry.CreateSession(CreateSessionInput{
		WorkspaceRoot: filepath.Join(t.TempDir(), "workspace"),
		Host:          "127.0.0.1",
		Port:          61234,
		PID:           43210,
		ServerMode:    "ide",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	if err := registry.DeleteSession(metadata.ID); err != nil {
		t.Fatalf("delete session: %v", err)
	}
	if _, err := os.Stat(filepath.Join(sessionsRoot, metadata.ID)); !os.IsNotExist(err) {
		t.Fatalf("expected session dir to be removed, stat err=%v", err)
	}
}

func TestRegistryLoadSessionsAndFindByWorkspaceAndMode(t *testing.T) {
	t.Parallel()

	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	now := time.Date(2026, time.March, 8, 10, 11, 12, 0, time.UTC)
	randomBytes := bytes.NewReader([]byte(
		"abcdef0123456789abcdef0123456789abcdef0123456789" +
			"uvwxyz0123456789uvwxyz0123456789uvwxyz0123456789",
	))
	registry, err := NewRegistry(RegistryOptions{
		SessionsRoot: sessionsRoot,
		Now: func() time.Time {
			current := now
			now = now.Add(time.Second)
			return current
		},
		Random: randomBytes,
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	first, err := registry.CreateSession(CreateSessionInput{
		WorkspaceRoot: workspaceRoot,
		Host:          "127.0.0.1",
		Port:          61234,
		PID:           111,
		ServerMode:    "launcher",
	})
	if err != nil {
		t.Fatalf("create first session: %v", err)
	}
	second, err := registry.CreateSession(CreateSessionInput{
		WorkspaceRoot: workspaceRoot,
		Host:          "127.0.0.1",
		Port:          61235,
		PID:           222,
		ServerMode:    "ide",
	})
	if err != nil {
		t.Fatalf("create second session: %v", err)
	}
	invalidDir := filepath.Join(sessionsRoot, "broken")
	if err := os.MkdirAll(invalidDir, 0o755); err != nil {
		t.Fatalf("mkdir invalid session dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(invalidDir, sessionMetadataFileName), []byte("{not-json}\n"), 0o644); err != nil {
		t.Fatalf("write invalid session metadata: %v", err)
	}

	loaded, err := registry.LoadSessions()
	if err != nil {
		t.Fatalf("load sessions: %v", err)
	}
	if len(loaded) != 2 {
		t.Fatalf("expected two valid sessions, got %#v", loaded)
	}
	if loaded[0].ID != second.ID || loaded[1].ID != first.ID {
		t.Fatalf("expected sessions sorted newest-first, got %#v", loaded)
	}

	filtered, err := registry.FindSessionsByWorkspaceAndMode(workspaceRoot, "ide")
	if err != nil {
		t.Fatalf("find sessions by workspace and mode: %v", err)
	}
	if len(filtered) != 1 || filtered[0].ID != second.ID {
		t.Fatalf("expected filtered IDE sessions to contain %q, got %#v", second.ID, filtered)
	}
}
