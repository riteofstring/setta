package localsessions

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/process"
	"setta/internal/auth"
	"setta/internal/statefs"
)

const (
	SessionMetadataFileName = "session.json"
	SessionSecretFileName   = "secret"
	SessionSecretBytes      = 32
	sessionIDBytes          = 3
	InProcessBackendEnvVar  = "SETTA_IN_PROCESS_BACKEND"
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

var recognizedSessionProcessBasenames = map[string]struct{}{
	"setta":            {},
	"setta.exe":        {},
	"setta-script.py":  {},
	"setta-server":     {},
	"setta-server.exe": {},
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

	workspaceRoot, host, err := validateCreateSessionInput(input)
	if err != nil {
		return auth.SessionMetadata{}, err
	}
	sessionID, sessionDir, err := r.createSessionDir()
	if err != nil {
		return auth.SessionMetadata{}, err
	}

	cleanupSessionDir := true
	defer func() {
		if cleanupSessionDir {
			_ = os.RemoveAll(sessionDir)
		}
	}()

	secretPath, err := writeSessionSecret(r.random, sessionDir)
	if err != nil {
		return auth.SessionMetadata{}, err
	}
	metadata := r.buildSessionMetadata(input, workspaceRoot, host, sessionID, secretPath)
	if err := writeSessionMetadata(sessionDir, metadata); err != nil {
		return auth.SessionMetadata{}, err
	}

	cleanupSessionDir = false
	return metadata, nil
}

func (r *Registry) LoadSecret(metadata auth.SessionMetadata) ([]byte, error) {
	if err := validatePersistedSessionSecretMetadata(metadata); err != nil {
		return nil, err
	}
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

func (r *Registry) LoadSessions() ([]auth.SessionMetadata, error) {
	if r == nil {
		return nil, fmt.Errorf("session registry is required")
	}

	entries, err := os.ReadDir(r.sessionsRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return []auth.SessionMetadata{}, nil
		}
		return nil, fmt.Errorf("read sessions root: %w", err)
	}

	sessions := make([]auth.SessionMetadata, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		metadataPath := filepath.Join(r.sessionsRoot, entry.Name(), SessionMetadataFileName)
		metadataBytes, err := os.ReadFile(metadataPath)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("read session metadata: %w", err)
		}

		var metadata auth.SessionMetadata
		if err := json.Unmarshal(metadataBytes, &metadata); err != nil {
			continue
		}
		if err := validatePersistedSessionLookupMetadata(metadata); err != nil {
			continue
		}
		sessions = append(sessions, metadata)
	}

	sort.Slice(sessions, func(i int, j int) bool {
		return sessions[i].StartedAt.After(sessions[j].StartedAt)
	})
	return sessions, nil
}

func (r *Registry) FindSessionsByWorkspaceAndMode(workspaceRoot string, serverMode string) ([]auth.SessionMetadata, error) {
	if r == nil {
		return nil, fmt.Errorf("session registry is required")
	}
	resolvedWorkspaceRoot, err := statefs.NormalizePath(workspaceRoot, "")
	if err != nil {
		return nil, fmt.Errorf("resolve workspace root: %w", err)
	}
	trimmedMode := strings.TrimSpace(serverMode)
	sessions, err := r.LoadSessions()
	if err != nil {
		return nil, err
	}

	matches := make([]auth.SessionMetadata, 0, len(sessions))
	for _, session := range sessions {
		if trimmedMode != "" && session.ServerMode != trimmedMode {
			continue
		}
		resolvedSessionWorkspace, err := statefs.NormalizePath(session.WorkspacePathCanonical, "")
		if err != nil {
			continue
		}
		if resolvedSessionWorkspace != resolvedWorkspaceRoot {
			continue
		}
		matches = append(matches, session)
	}
	return matches, nil
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

func validatePersistedSessionLookupMetadata(metadata auth.SessionMetadata) error {
	if strings.TrimSpace(metadata.ID) == "" {
		return fmt.Errorf("session id is required")
	}
	if strings.TrimSpace(metadata.WorkspacePathCanonical) == "" {
		return fmt.Errorf("session canonical workspace path is required for session %q", metadata.ID)
	}
	if strings.TrimSpace(metadata.ServerMode) == "" {
		return fmt.Errorf("session server mode is required for session %q", metadata.ID)
	}
	if !filepath.IsAbs(strings.TrimSpace(metadata.SecretPath)) {
		return fmt.Errorf("session secret path must be absolute for session %q", metadata.ID)
	}
	return nil
}

func validatePersistedSessionSecretMetadata(metadata auth.SessionMetadata) error {
	if strings.TrimSpace(metadata.ID) == "" {
		return fmt.Errorf("session id is required")
	}
	if !filepath.IsAbs(strings.TrimSpace(metadata.SecretPath)) {
		return fmt.Errorf("session secret path must be absolute for session %q", metadata.ID)
	}
	return nil
}

func FilterActiveSessions(sessions []auth.SessionMetadata) []auth.SessionMetadata {
	filtered := make([]auth.SessionMetadata, 0, len(sessions))
	for _, session := range sessions {
		if !IsSessionActive(session) {
			continue
		}
		filtered = append(filtered, session)
	}
	return filtered
}

func IsSessionActive(session auth.SessionMetadata) bool {
	proc, ok := lookupActiveSessionProcess(session.PID)
	if !ok {
		return false
	}
	if !sessionCreateTimeMatches(proc, session.PIDCreateTime) {
		return false
	}
	cmdline, err := proc.CmdlineSlice()
	if err != nil {
		return true
	}
	if len(cmdline) == 0 {
		return isCurrentInProcessSession(session.PID)
	}
	return sessionCommandLineLooksLikeSetta(cmdline) || isCurrentInProcessSession(session.PID)
}

func inProcessBackendEnabled() bool {
	raw, ok := os.LookupEnv(InProcessBackendEnvVar)
	if !ok {
		return false
	}
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	if trimmed == "" {
		return false
	}
	return trimmed != "0" && trimmed != "false" && trimmed != "no"
}

func validateCreateSessionInput(input CreateSessionInput) (string, string, error) {
	workspaceRoot, err := statefs.NormalizePath(input.WorkspaceRoot, "")
	if err != nil {
		return "", "", fmt.Errorf("resolve workspace root: %w", err)
	}
	host := strings.TrimSpace(input.Host)
	if host == "" {
		return "", "", fmt.Errorf("session host is required")
	}
	if strings.TrimSpace(input.ServerMode) == "" {
		return "", "", fmt.Errorf("session server mode is required")
	}
	return workspaceRoot, host, nil
}

func (r *Registry) createSessionDir() (string, string, error) {
	if err := os.MkdirAll(r.sessionsRoot, 0o755); err != nil {
		return "", "", fmt.Errorf("create sessions root: %w", err)
	}
	for {
		sessionID, err := randomHex(r.random, sessionIDBytes)
		if err != nil {
			return "", "", fmt.Errorf("generate session id: %w", err)
		}
		sessionDir := filepath.Join(r.sessionsRoot, sessionID)
		if err := os.Mkdir(sessionDir, 0o755); err != nil {
			if os.IsExist(err) {
				continue
			}
			return "", "", fmt.Errorf("create session dir: %w", err)
		}
		return sessionID, sessionDir, nil
	}
}

func writeSessionSecret(random io.Reader, sessionDir string) (string, error) {
	secretPath := filepath.Join(sessionDir, SessionSecretFileName)
	secret, err := randomBytes(random, SessionSecretBytes)
	if err != nil {
		return "", fmt.Errorf("generate session secret: %w", err)
	}
	if err := os.WriteFile(secretPath, secret, 0o600); err != nil {
		return "", fmt.Errorf("write session secret: %w", err)
	}
	return secretPath, nil
}

func (r *Registry) buildSessionMetadata(
	input CreateSessionInput,
	workspaceRoot string,
	host string,
	sessionID string,
	secretPath string,
) auth.SessionMetadata {
	return auth.SessionMetadata{
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
}

func writeSessionMetadata(sessionDir string, metadata auth.SessionMetadata) error {
	payload, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal session metadata: %w", err)
	}
	payload = append(payload, '\n')
	if err := statefs.AtomicWriteFile(filepath.Join(sessionDir, SessionMetadataFileName), payload, 0o644); err != nil {
		return fmt.Errorf("write session metadata: %w", err)
	}
	return nil
}

func lookupActiveSessionProcess(pid int) (*process.Process, bool) {
	if pid <= 0 {
		return nil, false
	}
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return nil, false
	}
	return proc, true
}

func sessionCreateTimeMatches(proc *process.Process, expected *float64) bool {
	if expected == nil {
		return true
	}
	createTimeMillis, err := proc.CreateTime()
	if err != nil {
		return false
	}
	return float64(createTimeMillis)/1000.0 == *expected
}

func isCurrentInProcessSession(pid int) bool {
	return pid == os.Getpid() && inProcessBackendEnabled()
}

func sessionCommandLineLooksLikeSetta(cmdline []string) bool {
	if len(cmdline) == 0 {
		return false
	}
	if sessionProcessBasenameRecognized(cmdline[0]) {
		return true
	}
	for _, item := range cmdline[1:] {
		if sessionProcessBasenameRecognized(item) || sessionInvocationArgumentRecognized(item) {
			return true
		}
	}
	return false
}

func sessionProcessBasenameRecognized(value string) bool {
	_, ok := recognizedSessionProcessBasenames[strings.ToLower(filepath.Base(value))]
	return ok
}

func sessionInvocationArgumentRecognized(value string) bool {
	lowered := strings.ToLower(strings.TrimSpace(value))
	return lowered == "setta" || strings.HasPrefix(lowered, "setta.") || strings.HasPrefix(lowered, "setta:")
}
