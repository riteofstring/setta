package settacmd

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/localsessions"
)

func TestRunBackupsListJSONSorted(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	backupDir := filepath.Join(cwd, "setta_files", "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("mkdir backup dir: %v", err)
	}
	paths := []string{
		filepath.Join(backupDir, "backup_20251231_235959_999999.json"),
		filepath.Join(backupDir, "backup_20260101_000000_000002.json"),
		filepath.Join(backupDir, "backup_20260101_000000_000001.json"),
		filepath.Join(backupDir, "backup_latest.json"),
	}
	for index, path := range paths {
		if err := os.WriteFile(path, []byte{byte('0' + index)}, 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	stdout, stderr, err := runBackupsSettaCommand(t, cwd, "", "backups", "list", "--json")
	if err != nil {
		t.Fatalf("run backups list: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	var payload []map[string]any
	if err := json.Unmarshal([]byte(stdout), &payload); err != nil {
		t.Fatalf("decode json payload: %v", err)
	}
	if len(payload) != 3 {
		t.Fatalf("expected 3 listed backups, got %d", len(payload))
	}
	if got := payload[0]["path"]; got != filepath.Join(backupDir, "backup_20260101_000000_000002.json") {
		t.Fatalf("unexpected first backup path %#v", got)
	}
	if got := payload[2]["index"]; got != float64(3) {
		t.Fatalf("unexpected last backup index %#v", got)
	}
}

func TestRunBackupsListRejectsInvalidLimit(t *testing.T) {
	t.Parallel()

	_, _, err := runBackupsSettaCommand(t, t.TempDir(), "", "backups", "list", "--limit", "0")
	if err == nil {
		t.Fatal("expected invalid limit error")
	}
	if code := ExitCode(err); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if got := DisplayError(err); got != "--limit must be >= 1" {
		t.Fatalf("unexpected limit error %q", got)
	}
}

func TestRunBackupsRestoreLatestOverwritesProjectAndStashes(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	projectPath := filepath.Join(cwd, "setta_files", "project.json")
	backupDir := filepath.Join(cwd, "setta_files", "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("mkdir backup dir: %v", err)
	}
	if err := os.WriteFile(projectPath, []byte("OLD"), 0o644); err != nil {
		t.Fatalf("write project: %v", err)
	}
	backupPath := filepath.Join(backupDir, "backup_20260101_000000_000000.json")
	if err := os.WriteFile(backupPath, []byte("NEW"), 0o644); err != nil {
		t.Fatalf("write backup: %v", err)
	}

	stdout, stderr, err := runBackupsSettaCommand(t, cwd, "", "backups", "restore", "--latest", "--yes")
	if err != nil {
		t.Fatalf("run backups restore: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	projectBytes, err := os.ReadFile(projectPath)
	if err != nil {
		t.Fatalf("read project: %v", err)
	}
	if string(projectBytes) != "NEW" {
		t.Fatalf("expected restored project content, got %q", string(projectBytes))
	}
	stashes, err := filepath.Glob(filepath.Join(backupDir, "restore_stash_*.json"))
	if err != nil {
		t.Fatalf("glob stashes: %v", err)
	}
	if len(stashes) != 1 {
		t.Fatalf("expected 1 stash, got %d", len(stashes))
	}
	stashBytes, err := os.ReadFile(stashes[0])
	if err != nil {
		t.Fatalf("read stash: %v", err)
	}
	if string(stashBytes) != "OLD" {
		t.Fatalf("expected stash content OLD, got %q", string(stashBytes))
	}
	if !strings.Contains(stdout, "Restored "+projectPath+" from "+backupPath) {
		t.Fatalf("expected restore output, got %q", stdout)
	}
}

func TestRunBackupsRestoreRefusesWhenSessionRunningUnlessForced(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	projectPath := filepath.Join(cwd, "setta_files", "project.json")
	backupDir := filepath.Join(cwd, "setta_files", "backups")
	sessionsRoot := filepath.Join(cwd, "setta_files", "runtime", "sessions")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("mkdir backup dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(sessionsRoot), 0o755); err != nil {
		t.Fatalf("mkdir runtime root: %v", err)
	}
	if err := os.WriteFile(projectPath, []byte("OLD"), 0o644); err != nil {
		t.Fatalf("write project: %v", err)
	}
	backupPath := filepath.Join(backupDir, "backup_20260101_000000_000000.json")
	if err := os.WriteFile(backupPath, []byte("NEW"), 0o644); err != nil {
		t.Fatalf("write backup: %v", err)
	}

	pythonExecutable := resolvePythonExecutable(t)
	process := exec.Command(pythonExecutable, "-c", "import time; time.sleep(60)", "setta.server:app")
	if err := process.Start(); err != nil {
		t.Fatalf("start subprocess: %v", err)
	}
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{SessionsRoot: sessionsRoot})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}
	session, err := registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot: cwd,
		Host:          "127.0.0.1",
		Port:          61234,
		PID:           process.Process.Pid,
		ServerMode:    "ide",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	defer func() {
		_ = registry.DeleteSession(session.ID)
		if process.Process != nil {
			_ = process.Process.Kill()
			_, _ = process.Process.Wait()
		}
	}()

	_, _, err = runBackupsSettaCommand(t, cwd, "", "backups", "restore", "--latest", "--yes")
	if err == nil {
		t.Fatal("expected active session restore refusal")
	}
	if !strings.Contains(DisplayError(err), "Refusing to restore") {
		t.Fatalf("unexpected restore refusal %q", DisplayError(err))
	}

	_, _, err = runBackupsSettaCommand(t, cwd, "", "backups", "restore", "--latest", "--yes", "--force")
	if err != nil {
		t.Fatalf("forced restore: %v", err)
	}
}

func TestRunBackupsRestoreCancelsWithoutYes(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	projectPath := filepath.Join(cwd, "setta_files", "project.json")
	backupDir := filepath.Join(cwd, "setta_files", "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("mkdir backup dir: %v", err)
	}
	if err := os.WriteFile(projectPath, []byte("OLD"), 0o644); err != nil {
		t.Fatalf("write project: %v", err)
	}
	backupPath := filepath.Join(backupDir, "backup_20260101_000000_000000.json")
	if err := os.WriteFile(backupPath, []byte("NEW"), 0o644); err != nil {
		t.Fatalf("write backup: %v", err)
	}

	stdout, stderr, err := runBackupsSettaCommand(t, cwd, "n\n", "backups", "restore", "--latest")
	if err != nil {
		t.Fatalf("run backups restore cancel: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	projectBytes, err := os.ReadFile(projectPath)
	if err != nil {
		t.Fatalf("read project: %v", err)
	}
	if string(projectBytes) != "OLD" {
		t.Fatalf("expected project to remain unchanged, got %q", string(projectBytes))
	}
	if !strings.Contains(stdout, "Cancelled.") {
		t.Fatalf("expected cancelled output, got %q", stdout)
	}
}

func runBackupsSettaCommand(t *testing.T, cwd string, stdinText string, args ...string) (string, string, error) {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run(args, RunOptions{
		Stdout: &stdout,
		Stderr: &stderr,
		Stdin:  strings.NewReader(stdinText),
		CWD:    cwd,
		Now: func() time.Time {
			return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
		},
		EnvLookup: func(string) (string, bool) { return "", false },
	})
	return stdout.String(), stderr.String(), err
}

func resolvePythonExecutable(t *testing.T) string {
	t.Helper()

	for _, candidate := range []string{"python3", "python"} {
		path, err := exec.LookPath(candidate)
		if err == nil {
			return path
		}
	}
	t.Fatal("python executable not found")
	return ""
}
