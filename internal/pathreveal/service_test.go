package pathreveal

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"testing"
	"time"

	"setta/internal/appgenskills"
)

func TestRevealUsesPlatformRevealCommandForWorkspaceFiles(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := t.TempDir()
	targetPath := filepath.Join(workspaceRoot, "notes.txt")
	if err := os.WriteFile(targetPath, []byte("notes"), 0o644); err != nil {
		t.Fatalf("write target file: %v", err)
	}
	logPath := filepath.Join(t.TempDir(), "command.json")
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		LookPath: func(name string) (string, error) {
			return name, nil
		},
		CommandContext: pathRevealTestCommandContext(logPath, 0, "", ""),
		GOOS:           "darwin",
		Timeout:        time.Second,
	})
	if err != nil {
		t.Fatalf("new path reveal service: %v", err)
	}

	if err := service.Reveal(context.Background(), targetPath); err != nil {
		t.Fatalf("reveal workspace path: %v", err)
	}

	command := readPathRevealCommandLog(t, logPath)
	if want := []string{"open", "-R", resolvePathRevealTestPath(t, targetPath)}; !reflect.DeepEqual(command, want) {
		t.Fatalf("expected reveal command %#v, got %#v", want, command)
	}
}

func TestRevealRejectsPathsOutsideAllowedRoots(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := t.TempDir()
	outsidePath := filepath.Join(t.TempDir(), "outside.txt")
	if err := os.WriteFile(outsidePath, []byte("outside"), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		LookPath: func(name string) (string, error) {
			return name, nil
		},
		CommandContext: pathRevealTestCommandContext(filepath.Join(t.TempDir(), "unused.json"), 0, "", ""),
		GOOS:           "darwin",
		Timeout:        time.Second,
	})
	if err != nil {
		t.Fatalf("new path reveal service: %v", err)
	}

	err = service.Reveal(context.Background(), outsidePath)
	var routeErr *Error
	if !errorsAs(err, &routeErr) {
		t.Fatalf("expected typed error, got %v", err)
	}
	if routeErr.Kind != ErrorInvalidRequest {
		t.Fatalf("expected invalid request error, got %#v", routeErr)
	}
	if routeErr.Message != "Path is outside allowed reveal roots." {
		t.Fatalf("unexpected error message %q", routeErr.Message)
	}
}

func TestRevealRejectsMissingPathsOutsideAllowedRootsWithoutLeakingExistence(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := t.TempDir()
	missingOutsidePath := filepath.Join(t.TempDir(), "outside", "missing.txt")
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		LookPath: func(name string) (string, error) {
			return name, nil
		},
		CommandContext: pathRevealTestCommandContext(filepath.Join(t.TempDir(), "unused.json"), 0, "", ""),
		GOOS:           "darwin",
		Timeout:        time.Second,
	})
	if err != nil {
		t.Fatalf("new path reveal service: %v", err)
	}

	err = service.Reveal(context.Background(), missingOutsidePath)
	var routeErr *Error
	if !errorsAs(err, &routeErr) {
		t.Fatalf("expected typed error, got %v", err)
	}
	if routeErr.Kind != ErrorInvalidRequest {
		t.Fatalf("expected invalid request error, got %#v", routeErr)
	}
	if routeErr.Message != "Path is outside allowed reveal roots." {
		t.Fatalf("unexpected error message %q", routeErr.Message)
	}
}

func TestRevealAllowsSkillRoots(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := t.TempDir()
	homeDir := t.TempDir()
	agentsHome := filepath.Join(t.TempDir(), "agents-home")
	skillDocPath := filepath.Join(agentsHome, "skills", "demo", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(skillDocPath), 0o755); err != nil {
		t.Fatalf("mkdir skill dir: %v", err)
	}
	if err := os.WriteFile(skillDocPath, []byte("# Demo"), 0o644); err != nil {
		t.Fatalf("write skill doc: %v", err)
	}
	skills, err := appgenskills.NewService(appgenskills.ServiceOptions{
		WorkspaceRoot: workspaceRoot,
		HomeDir:       homeDir,
		LookupEnv: func(key string) (string, bool) {
			if key == "AGENTS_HOME" {
				return agentsHome, true
			}
			return "", false
		},
	})
	if err != nil {
		t.Fatalf("new app gen skills service: %v", err)
	}
	logPath := filepath.Join(t.TempDir(), "command.json")
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		Skills:         skills,
		LookPath: func(name string) (string, error) {
			return name, nil
		},
		CommandContext: pathRevealTestCommandContext(logPath, 0, "", ""),
		GOOS:           "linux",
		Timeout:        time.Second,
	})
	if err != nil {
		t.Fatalf("new path reveal service: %v", err)
	}

	if err := service.Reveal(context.Background(), skillDocPath); err != nil {
		t.Fatalf("reveal skill path: %v", err)
	}
	command := readPathRevealCommandLog(t, logPath)
	if want := []string{"xdg-open", filepath.Dir(resolvePathRevealTestPath(t, skillDocPath))}; !reflect.DeepEqual(command, want) {
		t.Fatalf("expected skill reveal command %#v, got %#v", want, command)
	}
}

func TestPathRevealHelperProcess(t *testing.T) {
	if os.Getenv("SETTA_PATH_REVEAL_HELPER") != "1" {
		return
	}

	args := os.Args
	separator := -1
	for i, arg := range args {
		if arg == "--" {
			separator = i
			break
		}
	}
	if separator == -1 || len(args) < separator+6 {
		os.Exit(2)
	}

	logPath := args[separator+1]
	exitCode, err := strconv.Atoi(args[separator+2])
	if err != nil {
		os.Exit(2)
	}
	stdoutText := args[separator+3]
	stderrText := args[separator+4]
	command := args[separator+5:]
	payload, err := json.Marshal(command)
	if err != nil {
		os.Exit(2)
	}
	if err := os.WriteFile(logPath, payload, 0o644); err != nil {
		os.Exit(2)
	}
	if stdoutText != "" {
		_, _ = os.Stdout.WriteString(stdoutText)
	}
	if stderrText != "" {
		_, _ = os.Stderr.WriteString(stderrText)
	}
	os.Exit(exitCode)
}

func pathRevealTestCommandContext(
	logPath string,
	exitCode int,
	stdoutText string,
	stderrText string,
) func(context.Context, string, ...string) *exec.Cmd {
	return func(ctx context.Context, name string, args ...string) *exec.Cmd {
		commandArgs := []string{
			"-test.run=TestPathRevealHelperProcess",
			"--",
			logPath,
			strconv.Itoa(exitCode),
			stdoutText,
			stderrText,
			name,
		}
		commandArgs = append(commandArgs, args...)
		cmd := exec.CommandContext(ctx, os.Args[0], commandArgs...)
		cmd.Env = append(os.Environ(), "SETTA_PATH_REVEAL_HELPER=1")
		return cmd
	}
}

func readPathRevealCommandLog(t *testing.T, path string) []string {
	t.Helper()

	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read command log: %v", err)
	}
	var command []string
	if err := json.Unmarshal(payload, &command); err != nil {
		t.Fatalf("decode command log: %v", err)
	}
	return command
}

func resolvePathRevealTestPath(t *testing.T, path string) string {
	t.Helper()

	resolvedPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return path
	}
	return resolvedPath
}

func errorsAs(err error, target **Error) bool {
	if err == nil {
		return false
	}
	typed, ok := err.(*Error)
	if !ok {
		return false
	}
	*target = typed
	return true
}
