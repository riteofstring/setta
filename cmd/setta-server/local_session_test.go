package main

import (
	"net"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/auth"
	"setta/internal/config"
)

func TestMaybeBootstrapLocalSessionCreatesCurrentSessionAndCleansUp(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := config.Config{
		Server: config.Server{
			Host: "127.0.0.1",
			Mode: config.ModeIDE,
		},
		Paths: config.Paths{
			WorkspaceRoot:  filepath.Join(tmpDir, "workspace"),
			SettaHome:      filepath.Join(tmpDir, ".setta"),
			SettaFilesRoot: filepath.Join(tmpDir, "setta_files"),
			RuntimeRoot:    filepath.Join(tmpDir, "runtime"),
			ProfileName:    "dev",
		},
	}
	for _, path := range []string{cfg.Paths.WorkspaceRoot, cfg.Paths.SettaHome, cfg.Paths.SettaFilesRoot, cfg.Paths.RuntimeRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	session, err := maybeBootstrapLocalSession(cfg, listener)
	if err != nil {
		t.Fatalf("bootstrap local session: %v", err)
	}
	if session == nil {
		t.Fatal("expected local session bootstrap")
	}

	currentSession, err := auth.LoadCurrentSession(auth.LoadCurrentSessionOptions{
		RuntimeRoot: cfg.Paths.RuntimeRoot,
		EnvLookup:   os.LookupEnv,
	})
	if err != nil {
		t.Fatalf("load current session: %v", err)
	}
	if currentSession == nil {
		t.Fatal("expected current session metadata")
	}
	if currentSession.Metadata.ServerMode != "ide" {
		t.Fatalf("expected ide server mode, got %q", currentSession.Metadata.ServerMode)
	}
	if currentSession.Metadata.Profile != "dev" {
		t.Fatalf("expected profile dev, got %q", currentSession.Metadata.Profile)
	}

	sessionDir := filepath.Join(cfg.Paths.RuntimeRoot, "sessions", currentSession.Metadata.ID)
	if _, err := os.Stat(sessionDir); err != nil {
		t.Fatalf("expected session dir to exist: %v", err)
	}

	if err := session.Cleanup(); err != nil {
		t.Fatalf("cleanup local session: %v", err)
	}
	if _, err := os.Stat(sessionDir); !os.IsNotExist(err) {
		t.Fatalf("expected session dir removal, stat err=%v", err)
	}
	if value := os.Getenv(sessionIDEnv); value != "" {
		t.Fatalf("expected %s to be cleared, got %q", sessionIDEnv, value)
	}
}

func TestMaybeBootstrapLocalSessionSkipsWhenSessionAlreadyExists(t *testing.T) {
	t.Setenv(sessionIDEnv, "existing")
	cfg := config.Config{
		Server: config.Server{
			Host: "127.0.0.1",
			Mode: config.ModeLauncher,
		},
		Paths: config.Paths{
			RuntimeRoot: t.TempDir(),
		},
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	session, err := maybeBootstrapLocalSession(cfg, listener)
	if err != nil {
		t.Fatalf("maybe bootstrap local session: %v", err)
	}
	if session != nil {
		t.Fatal("expected existing session env to skip bootstrap")
	}
}
