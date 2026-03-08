package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/gitread"
	"setta/internal/httpapi"
	"setta/internal/observability"
)

func TestAppServesGitStatusAndDiffRoutes(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	initAppGitRepo(t, cfg.Paths.WorkspaceRoot)
	writeAppGitFile(t, filepath.Join(cfg.Paths.WorkspaceRoot, "tracked.txt"), "two\n")
	runAppGitCommand(t, cfg.Paths.WorkspaceRoot, "add", "tracked.txt")
	writeAppGitFile(t, filepath.Join(cfg.Paths.WorkspaceRoot, "tracked.txt"), "three\n")
	writeAppGitFile(t, filepath.Join(cfg.Paths.WorkspaceRoot, "new.txt"), "hello\n")

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	statusRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetGitStatus, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new status request: %v", err)
	}
	statusRequest.Header.Set("Content-Type", "application/json")
	statusRequest.AddCookie(authCookie)

	statusResponse, err := http.DefaultClient.Do(statusRequest)
	if err != nil {
		t.Fatalf("git status request: %v", err)
	}
	defer statusResponse.Body.Close()
	if statusResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(statusResponse.Body)
		t.Fatalf("expected status 200, got %d with body %q", statusResponse.StatusCode, string(body))
	}

	var statusPayload gitread.StatusResponse
	if err := json.NewDecoder(statusResponse.Body).Decode(&statusPayload); err != nil {
		t.Fatalf("decode status payload: %v", err)
	}
	var stagedTracked bool
	var unstagedTracked bool
	var untrackedNew bool
	for _, entry := range statusPayload.Entries {
		switch {
		case entry.Kind == "staged" && entry.Path == "tracked.txt":
			stagedTracked = true
		case entry.Kind == "unstaged" && entry.Path == "tracked.txt":
			unstagedTracked = true
		case entry.Kind == "untracked" && entry.Path == "new.txt":
			untrackedNew = true
		}
	}
	if !stagedTracked || !unstagedTracked || !untrackedNew {
		t.Fatalf("unexpected status payload %#v", statusPayload)
	}

	diffRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetGitDiff, strings.NewReader(`{"path":"tracked.txt","mode":"unstaged"}`))
	if err != nil {
		t.Fatalf("new diff request: %v", err)
	}
	diffRequest.Header.Set("Content-Type", "application/json")
	diffRequest.AddCookie(authCookie)

	diffResponse, err := http.DefaultClient.Do(diffRequest)
	if err != nil {
		t.Fatalf("git diff request: %v", err)
	}
	defer diffResponse.Body.Close()
	if diffResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(diffResponse.Body)
		t.Fatalf("expected diff 200, got %d with body %q", diffResponse.StatusCode, string(body))
	}

	var diffPayload gitread.DiffResponse
	if err := json.NewDecoder(diffResponse.Body).Decode(&diffPayload); err != nil {
		t.Fatalf("decode diff payload: %v", err)
	}
	if !strings.Contains(diffPayload.Diff, "-two") || !strings.Contains(diffPayload.Diff, "+three") {
		t.Fatalf("unexpected diff payload %q", diffPayload.Diff)
	}
}

func initAppGitRepo(t *testing.T, workspaceRoot string) {
	t.Helper()

	if _, err := exec.LookPath("git"); err != nil {
		t.Fatalf("git not found: %v", err)
	}
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	runAppGitCommand(t, workspaceRoot, "init")
	runAppGitCommand(t, workspaceRoot, "config", "user.email", "a@example.com")
	runAppGitCommand(t, workspaceRoot, "config", "user.name", "A")
	writeAppGitFile(t, filepath.Join(workspaceRoot, ".gitignore"), "setta_files/\n")
	runAppGitCommand(t, workspaceRoot, "add", ".gitignore")
	runAppGitCommand(t, workspaceRoot, "commit", "-m", "init")
	writeAppGitFile(t, filepath.Join(workspaceRoot, "tracked.txt"), "one\n")
	runAppGitCommand(t, workspaceRoot, "add", "tracked.txt")
	runAppGitCommand(t, workspaceRoot, "commit", "-m", "add tracked")
}

func runAppGitCommand(t *testing.T, cwd string, args ...string) string {
	t.Helper()

	command := exec.Command("git", args...)
	command.Dir = cwd
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, string(output))
	}
	return string(output)
}

func writeAppGitFile(t *testing.T, path string, contents string) {
	t.Helper()

	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write file %s: %v", path, err)
	}
}
