package main

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/config"
	"setta/internal/localsessions"
)

const (
	sessionIDEnv    = "SETTA_SESSION_ID"
	sessionsRootEnv = "SETTA_SESSIONS_ROOT"
)

type localProcessSession struct {
	registry             *localsessions.Registry
	sessionID            string
	previousSessionID    string
	hadPreviousSessionID bool
	previousSessionsRoot string
	hadPreviousRoot      bool
}

func maybeBootstrapLocalSession(cfg config.Config, listener net.Listener) (*localProcessSession, error) {
	if !shouldBootstrapLocalSession(cfg.Server.Mode, os.LookupEnv) {
		return nil, nil
	}
	if listener == nil {
		return nil, fmt.Errorf("listener is required")
	}

	addr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		return nil, fmt.Errorf("tcp listener is required")
	}

	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(cfg.Paths.RuntimeRoot, "sessions"),
	})
	if err != nil {
		return nil, err
	}
	metadata, err := registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		Host:               cfg.Server.Host,
		Port:               addr.Port,
		PID:                os.Getpid(),
		SettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		SettaHome:          cfg.Paths.SettaHome,
		Profile:            cfg.Paths.ProfileName,
		ServerMode:         string(cfg.Server.Mode),
	})
	if err != nil {
		return nil, err
	}

	sessionID, hadSessionID := os.LookupEnv(sessionIDEnv)
	sessionsRoot, hadSessionsRoot := os.LookupEnv(sessionsRootEnv)
	if err := os.Setenv(sessionIDEnv, metadata.ID); err != nil {
		_ = registry.DeleteSession(metadata.ID)
		return nil, fmt.Errorf("set %s: %w", sessionIDEnv, err)
	}
	if err := os.Setenv(sessionsRootEnv, registry.SessionsRoot()); err != nil {
		if hadSessionID {
			_ = os.Setenv(sessionIDEnv, sessionID)
		} else {
			_ = os.Unsetenv(sessionIDEnv)
		}
		_ = registry.DeleteSession(metadata.ID)
		return nil, fmt.Errorf("set %s: %w", sessionsRootEnv, err)
	}

	return &localProcessSession{
		registry:             registry,
		sessionID:            metadata.ID,
		previousSessionID:    sessionID,
		hadPreviousSessionID: hadSessionID,
		previousSessionsRoot: sessionsRoot,
		hadPreviousRoot:      hadSessionsRoot,
	}, nil
}

func (s *localProcessSession) Cleanup() error {
	if s == nil {
		return nil
	}
	if s.hadPreviousSessionID {
		if err := os.Setenv(sessionIDEnv, s.previousSessionID); err != nil {
			return err
		}
	} else if err := os.Unsetenv(sessionIDEnv); err != nil {
		return err
	}
	if s.hadPreviousRoot {
		if err := os.Setenv(sessionsRootEnv, s.previousSessionsRoot); err != nil {
			return err
		}
	} else if err := os.Unsetenv(sessionsRootEnv); err != nil {
		return err
	}
	return s.registry.DeleteSession(s.sessionID)
}

func shouldBootstrapLocalSession(mode config.Mode, envLookup func(string) (string, bool)) bool {
	if mode != config.ModeIDE && mode != config.ModeLauncher {
		return false
	}
	if envLookup == nil {
		envLookup = os.LookupEnv
	}
	if value, ok := envLookup(sessionIDEnv); ok && strings.TrimSpace(value) != "" {
		return false
	}
	return true
}
