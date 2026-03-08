package localsessions

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/process"
	"setta/internal/auth"
	"setta/internal/statefs"
)

const (
	sessionMetadataFileName = "session.json"
	sessionSecretFileName   = "secret"
	sessionSecretBytes      = 32
	sessionIDBytes          = 3
)

type RegistryOptions struct {
	SessionsRoot  string
	Now           func() time.Time
	Random        io.Reader
	PIDCreateTime func(int) *float64
}

type Registry struct {
	sessionsRoot  string
	now           func() time.Time
	random        io.Reader
	pidCreateTime func(int) *float64
}

type CreateSessionInput struct {
	WorkspaceRoot      string
	Host               string
	Port               int
	PID                int
	SettaFilesLocation string
	SettaFilesRoot     string
	RuntimeRoot        string
	SettaHome          string
	Profile            string
	ServerMode         string
}

func NewRegistry(options RegistryOptions) (*Registry, error) {
	sessionsRoot, err := statefs.NormalizePath(options.SessionsRoot, "")
	if err != nil {
		return nil, fmt.Errorf("resolve sessions root: %w", err)
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	randomReader := options.Random
	if randomReader == nil {
		randomReader = rand.Reader
	}
	pidCreateTime := options.PIDCreateTime
	if pidCreateTime == nil {
		pidCreateTime = defaultPIDCreateTime
	}
	return &Registry{
		sessionsRoot:  sessionsRoot,
		now:           now,
		random:        randomReader,
		pidCreateTime: pidCreateTime,
	}, nil
}

func (r *Registry) SessionsRoot() string {
	if r == nil {
		return ""
	}
	return r.sessionsRoot
}

func (r *Registry) CreateSession(input CreateSessionInput) (auth.SessionMetadata, error) {
	if r == nil {
		return auth.SessionMetadata{}, fmt.Errorf("session registry is required")
	}

	workspaceRoot, err := statefs.NormalizePath(input.WorkspaceRoot, "")
	if err != nil {
		return auth.SessionMetadata{}, fmt.Errorf("resolve workspace root: %w", err)
	}
	host := strings.TrimSpace(input.Host)
	if host == "" {
		return auth.SessionMetadata{}, fmt.Errorf("session host is required")
	}
	if strings.TrimSpace(input.ServerMode) == "" {
		return auth.SessionMetadata{}, fmt.Errorf("session server mode is required")
	}

	if err := os.MkdirAll(r.sessionsRoot, 0o755); err != nil {
		return auth.SessionMetadata{}, fmt.Errorf("create sessions root: %w", err)
	}

	var sessionID string
	var sessionDir string
	for {
		sessionID, err = randomHex(r.random, sessionIDBytes)
		if err != nil {
			return auth.SessionMetadata{}, fmt.Errorf("generate session id: %w", err)
		}
		sessionDir = filepath.Join(r.sessionsRoot, sessionID)
		if _, statErr := os.Stat(sessionDir); os.IsNotExist(statErr) {
			break
		} else if statErr != nil {
			return auth.SessionMetadata{}, fmt.Errorf("stat session dir: %w", statErr)
		}
	}
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		return auth.SessionMetadata{}, fmt.Errorf("create session dir: %w", err)
	}

	cleanupSessionDir := true
	defer func() {
		if cleanupSessionDir {
			_ = os.RemoveAll(sessionDir)
		}
	}()

	secretPath := filepath.Join(sessionDir, sessionSecretFileName)
	secret, err := randomBytes(r.random, sessionSecretBytes)
	if err != nil {
		return auth.SessionMetadata{}, fmt.Errorf("generate session secret: %w", err)
	}
	if err := os.WriteFile(secretPath, secret, 0o600); err != nil {
		return auth.SessionMetadata{}, fmt.Errorf("write session secret: %w", err)
	}

	metadata := auth.SessionMetadata{
		ID:                     sessionID,
		WorkspacePath:          workspaceRoot,
		WorkspacePathCanonical: workspaceRoot,
		Host:                   host,
		Port:                   input.Port,
		PID:                    input.PID,
		PIDCreateTime:          r.pidCreateTime(input.PID),
		StartedAt:              r.now().UTC(),
		SecretPath:             secretPath,
		SettaFilesLocation:     emptyToString(input.SettaFilesLocation),
		SettaFilesRoot:         emptyToString(input.SettaFilesRoot),
		RuntimeRoot:            emptyToString(input.RuntimeRoot),
		SettaHome:              emptyToString(input.SettaHome),
		Profile:                emptyToString(input.Profile),
		ServerMode:             input.ServerMode,
	}

	payload, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return auth.SessionMetadata{}, fmt.Errorf("marshal session metadata: %w", err)
	}
	payload = append(payload, '\n')
	if err := statefs.AtomicWriteFile(filepath.Join(sessionDir, sessionMetadataFileName), payload, 0o644); err != nil {
		return auth.SessionMetadata{}, fmt.Errorf("write session metadata: %w", err)
	}

	cleanupSessionDir = false
	return metadata, nil
}

func (r *Registry) LoadSecret(metadata auth.SessionMetadata) ([]byte, error) {
	secretPath, err := statefs.NormalizePath(metadata.SecretPath, "")
	if err != nil {
		return nil, fmt.Errorf("resolve session secret path: %w", err)
	}
	secret, err := os.ReadFile(secretPath)
	if err != nil {
		return nil, fmt.Errorf("read session secret: %w", err)
	}
	if len(secret) == 0 {
		return nil, fmt.Errorf("session secret must not be empty")
	}
	return secret, nil
}

func (r *Registry) DeleteSession(sessionID string) error {
	if r == nil {
		return nil
	}
	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return nil
	}
	sessionDir := filepath.Join(r.sessionsRoot, trimmedID)
	if err := os.RemoveAll(sessionDir); err != nil {
		return fmt.Errorf("delete session dir: %w", err)
	}
	return nil
}

func defaultPIDCreateTime(pid int) *float64 {
	if pid <= 0 {
		return nil
	}
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return nil
	}
	createTimeMillis, err := proc.CreateTime()
	if err != nil {
		return nil
	}
	createTimeSeconds := float64(createTimeMillis) / 1000.0
	return &createTimeSeconds
}

func randomBytes(reader io.Reader, count int) ([]byte, error) {
	buf := make([]byte, count)
	if _, err := io.ReadFull(reader, buf); err != nil {
		return nil, err
	}
	return buf, nil
}

func randomHex(reader io.Reader, count int) (string, error) {
	buf, err := randomBytes(reader, count)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func emptyToString(value string) string {
	return strings.TrimSpace(value)
}
