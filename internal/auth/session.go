package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	sessionIDEnv    = "SETTA_SESSION_ID"
	sessionsRootEnv = "SETTA_SESSIONS_ROOT"
)

type SessionMetadata struct {
	ID                     string    `json:"id"`
	WorkspacePath          string    `json:"workspacePath"`
	WorkspacePathCanonical string    `json:"workspacePathCanonical"`
	Host                   string    `json:"host"`
	Port                   int       `json:"port"`
	PID                    int       `json:"pid"`
	PIDCreateTime          *float64  `json:"pidCreateTime"`
	StartedAt              time.Time `json:"startedAt"`
	SecretPath             string    `json:"secretPath"`
	SettaFilesLocation     string    `json:"settaFilesLocation"`
	SettaFilesRoot         string    `json:"settaFilesRoot"`
	RuntimeRoot            string    `json:"runtimeRoot"`
	SettaHome              string    `json:"settaHome"`
	Profile                string    `json:"profile"`
	ServerMode             string    `json:"serverMode"`
}

type CurrentSession struct {
	Metadata SessionMetadata
	Secret   []byte
}

type LoadCurrentSessionOptions struct {
	RuntimeRoot string
	EnvLookup   func(string) (string, bool)
}

func LoadCurrentSession(opts LoadCurrentSessionOptions) (*CurrentSession, error) {
	envLookup := opts.EnvLookup
	if envLookup == nil {
		envLookup = os.LookupEnv
	}

	sessionID := lookupTrimmed(envLookup, sessionIDEnv)
	if sessionID == "" {
		return nil, nil
	}

	sessionsRoot, err := resolveSessionsRoot(opts.RuntimeRoot, envLookup)
	if err != nil {
		return nil, err
	}

	metadataPath := filepath.Join(sessionsRoot, sessionID, "session.json")
	metadataBytes, err := os.ReadFile(metadataPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read session metadata: %w", err)
	}

	var metadata SessionMetadata
	if err := json.Unmarshal(metadataBytes, &metadata); err != nil {
		return nil, fmt.Errorf("decode session metadata: %w", err)
	}
	if err := validateSessionMetadata(metadata, sessionID); err != nil {
		return nil, err
	}

	secretBytes, err := os.ReadFile(metadata.SecretPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read session secret: %w", err)
	}
	if len(secretBytes) == 0 {
		return nil, errors.New("session secret must not be empty")
	}

	return &CurrentSession{
		Metadata: metadata,
		Secret:   secretBytes,
	}, nil
}

func resolveSessionsRoot(runtimeRoot string, envLookup func(string) (string, bool)) (string, error) {
	if raw := lookupTrimmed(envLookup, sessionsRootEnv); raw != "" {
		resolved, err := filepath.Abs(raw)
		if err != nil {
			return "", fmt.Errorf("resolve sessions root: %w", err)
		}
		return resolved, nil
	}

	if strings.TrimSpace(runtimeRoot) == "" {
		return "", errors.New("runtime root is required to resolve sessions root")
	}

	resolvedRuntimeRoot, err := filepath.Abs(runtimeRoot)
	if err != nil {
		return "", fmt.Errorf("resolve runtime root: %w", err)
	}
	return filepath.Join(resolvedRuntimeRoot, "sessions"), nil
}

func validateSessionMetadata(metadata SessionMetadata, expectedSessionID string) error {
	if strings.TrimSpace(metadata.ID) == "" {
		return errors.New("session metadata id is required")
	}
	if metadata.ID != expectedSessionID {
		return fmt.Errorf("session metadata id mismatch: expected %q, got %q", expectedSessionID, metadata.ID)
	}
	if !filepath.IsAbs(metadata.SecretPath) {
		return fmt.Errorf("session secret path must be absolute for session %q", metadata.ID)
	}
	if strings.TrimSpace(metadata.ServerMode) == "" {
		return fmt.Errorf("session server mode is required for session %q", metadata.ID)
	}
	return nil
}

func lookupTrimmed(envLookup func(string) (string, bool), key string) string {
	value, ok := envLookup(key)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}
