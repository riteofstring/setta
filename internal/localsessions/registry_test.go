package localsessions

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
)

const registryHelperEnvVar = "SETTA_REGISTRY_TEST_HELPER"

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
	if len(secret) != SessionSecretBytes {
		t.Fatalf("expected %d secret bytes, got %d", SessionSecretBytes, len(secret))
	}

	sessionDir := filepath.Join(sessionsRoot, metadata.ID)
	metadataPath := filepath.Join(sessionDir, SessionMetadataFileName)
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

func TestRegistryDeleteSessionRemovesExtraFiles(t *testing.T) {
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

	sessionDir := filepath.Join(sessionsRoot, metadata.ID)
	extraPath := filepath.Join(sessionDir, "extra.txt")
	if err := os.WriteFile(extraPath, []byte("extra"), 0o644); err != nil {
		t.Fatalf("write extra file: %v", err)
	}

	if err := registry.DeleteSession(metadata.ID); err != nil {
		t.Fatalf("delete session: %v", err)
	}
	if _, err := os.Stat(sessionDir); !os.IsNotExist(err) {
		t.Fatalf("expected session dir with extra files to be removed, stat err=%v", err)
	}
}

func TestRegistryCreateSessionRetriesExistingSessionID(t *testing.T) {
	t.Parallel()

	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	if err := os.MkdirAll(filepath.Join(sessionsRoot, "616263"), 0o755); err != nil {
		t.Fatalf("mkdir existing session dir: %v", err)
	}
	registry, err := NewRegistry(RegistryOptions{
		SessionsRoot: sessionsRoot,
		Random:       bytes.NewReader([]byte("abcdefuvwxyz0123456789abcdef0123456789abcdef")),
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	metadata, err := registry.CreateSession(CreateSessionInput{
		WorkspaceRoot: filepath.Join(t.TempDir(), "workspace"),
		Host:          "127.0.0.1",
		Port:          61234,
		PID:           43210,
		ServerMode:    "launcher",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if metadata.ID != "646566" {
		t.Fatalf("expected retried session id 646566, got %q", metadata.ID)
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
	if err := os.WriteFile(filepath.Join(invalidDir, SessionMetadataFileName), []byte("{not-json}\n"), 0o644); err != nil {
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

func TestRegistryLoadSessionsSkipsMetadataMissingServerMode(t *testing.T) {
	t.Parallel()

	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	registry, err := NewRegistry(RegistryOptions{
		SessionsRoot: sessionsRoot,
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	validSessionDir := filepath.Join(sessionsRoot, "valid")
	if err := os.MkdirAll(validSessionDir, 0o755); err != nil {
		t.Fatalf("mkdir valid session dir: %v", err)
	}
	validSecretPath := filepath.Join(validSessionDir, SessionSecretFileName)
	if err := os.WriteFile(validSecretPath, []byte("secret"), 0o600); err != nil {
		t.Fatalf("write valid secret: %v", err)
	}
	validMetadata := auth.SessionMetadata{
		ID:                     "valid-session",
		WorkspacePath:          workspaceRoot,
		WorkspacePathCanonical: workspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61234,
		SecretPath:             validSecretPath,
		ServerMode:             "ide",
		StartedAt:              time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC),
	}
	validBytes, err := json.Marshal(validMetadata)
	if err != nil {
		t.Fatalf("marshal valid metadata: %v", err)
	}
	validBytes = append(validBytes, '\n')
	if err := os.WriteFile(filepath.Join(validSessionDir, SessionMetadataFileName), validBytes, 0o644); err != nil {
		t.Fatalf("write valid metadata: %v", err)
	}

	missingModeDir := filepath.Join(sessionsRoot, "missing-mode")
	if err := os.MkdirAll(missingModeDir, 0o755); err != nil {
		t.Fatalf("mkdir missing-mode session dir: %v", err)
	}
	missingModeSecretPath := filepath.Join(missingModeDir, SessionSecretFileName)
	if err := os.WriteFile(missingModeSecretPath, []byte("secret"), 0o600); err != nil {
		t.Fatalf("write missing-mode secret: %v", err)
	}
	missingModeMetadata := auth.SessionMetadata{
		ID:                     "missing-mode-session",
		WorkspacePath:          workspaceRoot,
		WorkspacePathCanonical: workspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61235,
		SecretPath:             missingModeSecretPath,
		StartedAt:              time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC),
	}
	missingModeBytes, err := json.Marshal(missingModeMetadata)
	if err != nil {
		t.Fatalf("marshal missing-mode metadata: %v", err)
	}
	missingModeBytes = append(missingModeBytes, '\n')
	if err := os.WriteFile(filepath.Join(missingModeDir, SessionMetadataFileName), missingModeBytes, 0o644); err != nil {
		t.Fatalf("write missing-mode metadata: %v", err)
	}

	loaded, err := registry.LoadSessions()
	if err != nil {
		t.Fatalf("load sessions: %v", err)
	}
	if len(loaded) != 1 {
		t.Fatalf("expected one valid session after skipping missing server mode metadata, got %#v", loaded)
	}
	if loaded[0].ID != validMetadata.ID {
		t.Fatalf("expected valid session %q, got %#v", validMetadata.ID, loaded[0])
	}
}

func TestRegistryLoadSessionsSkipsMetadataMissingCanonicalWorkspaceOrRelativeSecretPath(t *testing.T) {
	t.Parallel()

	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	registry, err := NewRegistry(RegistryOptions{
		SessionsRoot: sessionsRoot,
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	// Launcher and CLI session lookup should never surface malformed session
	// metadata that the source Python registry would skip up front.
	validSessionDir := filepath.Join(sessionsRoot, "valid")
	if err := os.MkdirAll(validSessionDir, 0o755); err != nil {
		t.Fatalf("mkdir valid session dir: %v", err)
	}
	validMetadata := auth.SessionMetadata{
		ID:                     "valid-session",
		WorkspacePath:          workspaceRoot,
		WorkspacePathCanonical: workspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61234,
		SecretPath:             filepath.Join(validSessionDir, SessionSecretFileName),
		ServerMode:             "ide",
		StartedAt:              time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC),
	}
	validBytes, err := json.Marshal(validMetadata)
	if err != nil {
		t.Fatalf("marshal valid metadata: %v", err)
	}
	validBytes = append(validBytes, '\n')
	if err := os.WriteFile(filepath.Join(validSessionDir, SessionMetadataFileName), validBytes, 0o644); err != nil {
		t.Fatalf("write valid metadata: %v", err)
	}

	missingCanonicalDir := filepath.Join(sessionsRoot, "missing-canonical")
	if err := os.MkdirAll(missingCanonicalDir, 0o755); err != nil {
		t.Fatalf("mkdir missing-canonical session dir: %v", err)
	}
	missingCanonicalMetadata := auth.SessionMetadata{
		ID:            "missing-canonical-session",
		WorkspacePath: workspaceRoot,
		Host:          "127.0.0.1",
		Port:          61235,
		SecretPath:    filepath.Join(missingCanonicalDir, SessionSecretFileName),
		ServerMode:    "ide",
		StartedAt:     time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC),
	}
	missingCanonicalBytes, err := json.Marshal(missingCanonicalMetadata)
	if err != nil {
		t.Fatalf("marshal missing-canonical metadata: %v", err)
	}
	missingCanonicalBytes = append(missingCanonicalBytes, '\n')
	if err := os.WriteFile(filepath.Join(missingCanonicalDir, SessionMetadataFileName), missingCanonicalBytes, 0o644); err != nil {
		t.Fatalf("write missing-canonical metadata: %v", err)
	}

	relativeSecretDir := filepath.Join(sessionsRoot, "relative-secret")
	if err := os.MkdirAll(relativeSecretDir, 0o755); err != nil {
		t.Fatalf("mkdir relative-secret session dir: %v", err)
	}
	relativeSecretMetadata := auth.SessionMetadata{
		ID:                     "relative-secret-session",
		WorkspacePath:          workspaceRoot,
		WorkspacePathCanonical: workspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61236,
		SecretPath:             "secret",
		ServerMode:             "launcher",
		StartedAt:              time.Date(2026, time.March, 8, 12, 2, 0, 0, time.UTC),
	}
	relativeSecretBytes, err := json.Marshal(relativeSecretMetadata)
	if err != nil {
		t.Fatalf("marshal relative-secret metadata: %v", err)
	}
	relativeSecretBytes = append(relativeSecretBytes, '\n')
	if err := os.WriteFile(filepath.Join(relativeSecretDir, SessionMetadataFileName), relativeSecretBytes, 0o644); err != nil {
		t.Fatalf("write relative-secret metadata: %v", err)
	}

	loaded, err := registry.LoadSessions()
	if err != nil {
		t.Fatalf("load sessions: %v", err)
	}
	if len(loaded) != 1 {
		t.Fatalf("expected one valid session after skipping invalid metadata, got %#v", loaded)
	}
	if loaded[0].ID != validMetadata.ID {
		t.Fatalf("expected valid session %q, got %#v", validMetadata.ID, loaded[0])
	}
}

func TestRegistryLoadSessionsSkipsRelativeSecretPathMetadata(t *testing.T) {
	t.Parallel()

	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	registry, err := NewRegistry(RegistryOptions{
		SessionsRoot: sessionsRoot,
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	sessionDir := filepath.Join(sessionsRoot, "relative-secret")
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sessionDir, SessionSecretFileName), []byte("secret"), 0o600); err != nil {
		t.Fatalf("write secret: %v", err)
	}
	metadata := auth.SessionMetadata{
		ID:                     "relative-secret",
		WorkspacePath:          filepath.Join(t.TempDir(), "workspace"),
		WorkspacePathCanonical: filepath.Join(t.TempDir(), "workspace"),
		Host:                   "127.0.0.1",
		Port:                   61234,
		PID:                    12345,
		SecretPath:             SessionSecretFileName,
		ServerMode:             "ide",
		StartedAt:              time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC),
	}
	metadataBytes, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("marshal metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(sessionDir, SessionMetadataFileName), metadataBytes, 0o644); err != nil {
		t.Fatalf("write metadata: %v", err)
	}

	loaded, err := registry.LoadSessions()
	if err != nil {
		t.Fatalf("load sessions: %v", err)
	}
	if len(loaded) != 0 {
		t.Fatalf("expected relative secret-path metadata to be skipped, got %#v", loaded)
	}
	if _, err := os.Stat(sessionDir); err != nil {
		t.Fatalf("expected session dir to remain on skipped relative secret path, stat err=%v", err)
	}
}

func TestRegistryLoadSecretRejectsRelativeSecretPath(t *testing.T) {
	t.Parallel()

	registry, err := NewRegistry(RegistryOptions{
		SessionsRoot: filepath.Join(t.TempDir(), "sessions"),
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	_, err = registry.LoadSecret(auth.SessionMetadata{
		ID:         "relative-secret",
		SecretPath: SessionSecretFileName,
		ServerMode: "ide",
	})
	if err == nil {
		t.Fatal("expected relative secret path to fail closed")
	}
	if !strings.Contains(err.Error(), "absolute") {
		t.Fatalf("expected absolute-path error, got %v", err)
	}
}

func TestIsSessionActiveRecognizesSettaProcessSignatures(t *testing.T) {
	for _, basename := range registryRecognizedProcessNames() {
		basename := basename
		t.Run(basename, func(t *testing.T) {
			session := startRegistryHelperProcess(t, basename)
			if !IsSessionActive(session) {
				t.Fatalf("expected %q helper process to count as active Setta session", basename)
			}
		})
	}
}

func TestFilterActiveSessionsPrunesNonSettaProcesses(t *testing.T) {
	settaSession := startRegistryHelperProcess(t, registryRecognizedProcessNames()[0])
	otherSession := startRegistryHelperProcess(t, registryProcessName("unit-test"))

	filtered := FilterActiveSessions([]auth.SessionMetadata{settaSession, otherSession})
	if len(filtered) != 1 {
		t.Fatalf("expected one active Setta session, got %#v", filtered)
	}
	if filtered[0].PID != settaSession.PID {
		t.Fatalf("expected Setta process PID %d, got %#v", settaSession.PID, filtered)
	}
}

func TestIsSessionActiveRejectsCurrentPIDWithoutInProcessFlag(t *testing.T) {
	t.Setenv(InProcessBackendEnvVar, "")

	session := auth.SessionMetadata{
		ID:            "current-process",
		PID:           os.Getpid(),
		PIDCreateTime: defaultPIDCreateTime(os.Getpid()),
	}
	if IsSessionActive(session) {
		t.Fatal("expected current test process to be rejected without in-process mode enabled")
	}
}

func TestIsSessionActiveKeepsCurrentPIDWithInProcessFlag(t *testing.T) {
	t.Setenv(InProcessBackendEnvVar, "1")

	session := auth.SessionMetadata{
		ID:            "current-process",
		PID:           os.Getpid(),
		PIDCreateTime: defaultPIDCreateTime(os.Getpid()),
	}
	if !IsSessionActive(session) {
		t.Fatal("expected current test process to stay active when in-process mode is enabled")
	}
}

func TestRegistryProcessHelper(t *testing.T) {
	if os.Getenv(registryHelperEnvVar) != "1" {
		return
	}
	time.Sleep(30 * time.Second)
}

func registryRecognizedProcessNames() []string {
	if runtime.GOOS == "windows" {
		return []string{"setta.exe", "setta-server.exe"}
	}
	return []string{"setta", "setta-script.py", "setta-server"}
}

func registryProcessName(base string) string {
	if runtime.GOOS == "windows" && filepath.Ext(base) == "" {
		return base + ".exe"
	}
	return base
}

func startRegistryHelperProcess(t *testing.T, basename string) auth.SessionMetadata {
	t.Helper()

	sourcePath, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	sourceBytes, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("read test executable: %v", err)
	}

	targetPath := filepath.Join(t.TempDir(), basename)
	if err := os.WriteFile(targetPath, sourceBytes, 0o755); err != nil {
		t.Fatalf("write helper executable: %v", err)
	}

	cmd := exec.Command(targetPath, "-test.run=TestRegistryProcessHelper")
	cmd.Env = append(os.Environ(), registryHelperEnvVar+"=1")
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start helper process %q: %v", basename, err)
	}
	t.Cleanup(func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	})

	return auth.SessionMetadata{
		ID:            basename,
		PID:           cmd.Process.Pid,
		PIDCreateTime: defaultPIDCreateTime(cmd.Process.Pid),
	}
}
