package settacmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunPathsEmitsJSONByDefault(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaHome := settaHomeForTest(t)

	var stdout bytes.Buffer
	err := runPaths(
		nil,
		globalFlags{
			workspaceRoot:      workspaceRoot,
			settaHome:          settaHome,
			settaFilesLocation: "local",
		},
		&stdout,
		&bytes.Buffer{},
		func(string) (string, bool) { return "", false },
		workspaceRoot,
	)
	if err != nil {
		t.Fatalf("run paths: %v", err)
	}

	var payload pathsPayload
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode paths payload: %v", err)
	}
	if payload.WorkspaceRoot != workspaceRoot {
		t.Fatalf("expected workspace root %q, got %q", workspaceRoot, payload.WorkspaceRoot)
	}
	if payload.SettaHome != settaHome {
		t.Fatalf("expected setta home %q, got %q", settaHome, payload.SettaHome)
	}
	if payload.ActiveSettaFilesMode != "local" {
		t.Fatalf("expected local active setta files mode, got %q", payload.ActiveSettaFilesMode)
	}
	if payload.SettaFilesRoot == "" {
		t.Fatal("expected setta files root in payload")
	}
	if payload.RuntimeRoot == "" {
		t.Fatal("expected runtime root in payload")
	}
	if !payload.RuntimeWithinSettaRoot {
		t.Fatal("expected runtime root to be within setta files root")
	}
	if payload.AuthCookieName != "setta_auth" {
		t.Fatalf("expected default auth cookie name, got %q", payload.AuthCookieName)
	}
}

func TestRunPathsEnvOutputIncludesResolvedRoots(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaHome := settaHomeForTest(t)
	settaFilesRoot := workspaceRoot + "/setta_files_dev"
	runtimeRoot := settaFilesRoot + "/runtime_custom"

	var stdout bytes.Buffer
	err := runPaths(
		[]string{"--env"},
		globalFlags{
			workspaceRoot:  workspaceRoot,
			settaHome:      settaHome,
			settaFilesRoot: settaFilesRoot,
			runtimeRoot:    runtimeRoot,
		},
		&stdout,
		&bytes.Buffer{},
		func(string) (string, bool) { return "", false },
		workspaceRoot,
	)
	if err != nil {
		t.Fatalf("run paths with env output: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	values := make(map[string]string, len(lines))
	for _, line := range lines {
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			t.Fatalf("unexpected env output line %q", line)
		}
		values[parts[0]] = parts[1]
	}

	if values["WORKSPACE_ROOT"] != workspaceRoot {
		t.Fatalf("expected workspace root %q, got %q", workspaceRoot, values["WORKSPACE_ROOT"])
	}
	if values["SETTA_FILES_ROOT"] != settaFilesRoot {
		t.Fatalf("expected setta files root %q, got %q", settaFilesRoot, values["SETTA_FILES_ROOT"])
	}
	if values["RUNTIME_ROOT"] != runtimeRoot {
		t.Fatalf("expected runtime root %q, got %q", runtimeRoot, values["RUNTIME_ROOT"])
	}
	if values["USES_EXPLICIT_SETTA_FILES"] != "1" {
		t.Fatalf("expected explicit setta files marker, got %q", values["USES_EXPLICIT_SETTA_FILES"])
	}
	if values["RUNTIME_WITHIN_SETTA_ROOT"] != "1" {
		t.Fatalf("expected runtime-within-setta-root marker, got %q", values["RUNTIME_WITHIN_SETTA_ROOT"])
	}
}

func TestRunPathsRejectsConflictingOutputModes(t *testing.T) {
	t.Parallel()

	err := runPaths(
		[]string{"--env", "--json"},
		globalFlags{},
		&bytes.Buffer{},
		&bytes.Buffer{},
		func(string) (string, bool) { return "", false },
		t.TempDir(),
	)
	if err == nil {
		t.Fatal("expected conflicting output mode error")
	}
	if err.Error() != "paths accepts at most one output mode flag" {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestRunPathsCWDOverrideControlsDefaultWorkspaceResolution(t *testing.T) {
	t.Parallel()

	processCWD := t.TempDir()
	resolvedCWD := filepath.Join(t.TempDir(), "workspace")
	settaHome := settaHomeForTest(t)
	if err := os.MkdirAll(resolvedCWD, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}

	var stdout bytes.Buffer
	err := runPaths(
		[]string{"--cwd", resolvedCWD},
		globalFlags{
			settaHome:          settaHome,
			settaFilesLocation: "local",
		},
		&stdout,
		&bytes.Buffer{},
		func(string) (string, bool) { return "", false },
		processCWD,
	)
	if err != nil {
		t.Fatalf("run paths with cwd override: %v", err)
	}

	var payload pathsPayload
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode paths payload: %v", err)
	}
	if payload.WorkspaceRoot != resolvedCWD {
		t.Fatalf("expected workspace root %q, got %q", resolvedCWD, payload.WorkspaceRoot)
	}
}

func TestRunPathsResolvesSanitizedAuthCookieNameFromEnv(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaHome := settaHomeForTest(t)

	var stdout bytes.Buffer
	err := runPaths(
		nil,
		globalFlags{
			workspaceRoot: workspaceRoot,
			settaHome:     settaHome,
		},
		&stdout,
		&bytes.Buffer{},
		func(key string) (string, bool) {
			if key != "SETTA_AUTH_COOKIE_NAME" {
				return "", false
			}
			return " setta auth ", true
		},
		workspaceRoot,
	)
	if err != nil {
		t.Fatalf("run paths: %v", err)
	}

	var payload pathsPayload
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode paths payload: %v", err)
	}
	if payload.AuthCookieName != "setta_auth" {
		t.Fatalf("expected sanitized auth cookie name, got %q", payload.AuthCookieName)
	}
}
