package localsessions

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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

func TestRegistryLoadSessionsSkipsMetadataMissingServerMode(t *testing.T) {
	t.Parallel()

	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	registry, err := NewRegistry(RegistryOptions{
		SessionsRoot: sessionsRoot,
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	validSessionDir := filepath.Join(sessionsRoot, "valid")
	if err := os.MkdirAll(validSessionDir, 0o755); err != nil {
		t.Fatalf("mkdir valid session dir: %v", err)
	}
	validMetadata := auth.SessionMetadata{
		ID:         "valid-session",
		Host:       "127.0.0.1",
		Port:       61234,
		ServerMode: "ide",
		StartedAt:  time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC),
	}
	validBytes, err := json.Marshal(validMetadata)
	if err != nil {
		t.Fatalf("marshal valid metadata: %v", err)
	}
	validBytes = append(validBytes, '\n')
	if err := os.WriteFile(filepath.Join(validSessionDir, sessionMetadataFileName), validBytes, 0o644); err != nil {
		t.Fatalf("write valid metadata: %v", err)
	}

	missingModeDir := filepath.Join(sessionsRoot, "missing-mode")
	if err := os.MkdirAll(missingModeDir, 0o755); err != nil {
		t.Fatalf("mkdir missing-mode session dir: %v", err)
	}
	missingModeMetadata := auth.SessionMetadata{
		ID:        "missing-mode-session",
		Host:      "127.0.0.1",
		Port:      61235,
		StartedAt: time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC),
	}
	missingModeBytes, err := json.Marshal(missingModeMetadata)
	if err != nil {
		t.Fatalf("marshal missing-mode metadata: %v", err)
	}
	missingModeBytes = append(missingModeBytes, '\n')
	if err := os.WriteFile(filepath.Join(missingModeDir, sessionMetadataFileName), missingModeBytes, 0o644); err != nil {
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
	t.Setenv(inProcessBackendEnvVar, "")

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
	t.Setenv(inProcessBackendEnvVar, "1")

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
