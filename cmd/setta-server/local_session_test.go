package main

import (
	"context"
	"io"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/app"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/observability"
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

func TestAppNewAfterLocalSessionBootstrapConsumesStartupToken(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := config.Config{
		Server: config.Server{
			Host:     "127.0.0.1",
			Mode:     config.ModeIDE,
			LogLevel: 0,
		},
		Paths: config.Paths{
			WorkspaceRoot:         filepath.Join(tmpDir, "workspace"),
			SettaHome:             filepath.Join(tmpDir, ".setta"),
			ProfileLookupHome:     filepath.Join(tmpDir, ".setta"),
			SettaFilesRoot:        filepath.Join(tmpDir, "workspace", "setta_files"),
			ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
			RuntimeRoot:           filepath.Join(tmpDir, "workspace", "setta_files", "runtime"),
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: filepath.Join(tmpDir, ".setta", "setta_files"),
			AutoMode:             config.AutoModeCreateLocal,
		},
	}
	for _, path := range []string{
		cfg.Paths.WorkspaceRoot,
		cfg.Paths.SettaHome,
		cfg.Paths.SettaFilesRoot,
		cfg.Paths.RuntimeRoot,
	} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = listener.Addr().(*net.TCPAddr).Port

	localSession, err := maybeBootstrapLocalSession(cfg, listener)
	if err != nil {
		t.Fatalf("maybeBootstrapLocalSession returned error: %v", err)
	}
	if localSession == nil {
		t.Fatal("expected local session")
	}
	t.Cleanup(func() {
		if err := localSession.Cleanup(); err != nil {
			t.Fatalf("cleanup local session: %v", err)
		}
	})

	application, err := app.New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("app.New returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := application.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	currentSession, ok := application.Auth().CurrentSession()
	if !ok {
		t.Fatal("expected auth service current session")
	}
	if currentSession.Metadata.ID != localSession.metadata.ID {
		t.Fatalf("expected auth service session %q, got %q", localSession.metadata.ID, currentSession.Metadata.ID)
	}

	now := time.Now().UTC()
	token, err := auth.NewBootstrapTokenManager(auth.DefaultBootstrapTokenTTL, auth.NewNonceTracker()).Mint(
		localSession.metadata.ID,
		localSession.secret,
		now,
	)
	if err != nil {
		t.Fatalf("mint startup token: %v", err)
	}

	requestInfo, err := application.Auth().ConsumeBootstrapToken(token, now.Add(time.Minute))
	if err != nil {
		t.Fatalf("ConsumeBootstrapToken returned error: %v", err)
	}
	if requestInfo.SessionID != localSession.metadata.ID {
		t.Fatalf("expected request session %q, got %q", localSession.metadata.ID, requestInfo.SessionID)
	}
}
