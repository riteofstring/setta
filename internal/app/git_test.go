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

	prepareAppGitStatusFixture(t, cfg.Paths.WorkspaceRoot)
	harness := startAppGitRouteHarness(t, cfg)

	statusPayload := fetchAppGitStatus(t, harness)
	assertAppGitStatusEntries(t, statusPayload)

	diffPayload := fetchAppGitDiff(t, harness, `{"path":"tracked.txt","mode":"unstaged"}`)
	if !strings.Contains(diffPayload.Diff, "-two") || !strings.Contains(diffPayload.Diff, "+three") {
		t.Fatalf("unexpected diff payload %q", diffPayload.Diff)
	}
}

func TestAppServesGitLogDetailsAndCommitFileDiffRoutes(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	initAppGitRepo(t, cfg.Paths.WorkspaceRoot)
	writeAppGitFile(t, filepath.Join(cfg.Paths.WorkspaceRoot, "rename-src.txt"), "rename\n")
	runAppGitCommand(t, cfg.Paths.WorkspaceRoot, "add", "rename-src.txt")
	runAppGitCommand(t, cfg.Paths.WorkspaceRoot, "commit", "-m", "add rename source")
	runAppGitCommand(t, cfg.Paths.WorkspaceRoot, "mv", "rename-src.txt", "rename-dst.txt")
	runAppGitCommand(t, cfg.Paths.WorkspaceRoot, "commit", "-m", "rename source to dest")
	headHash := strings.TrimSpace(runAppGitCommand(t, cfg.Paths.WorkspaceRoot, "rev-parse", "HEAD"))

	harness := startAppGitRouteHarness(t, cfg)

	logPayload := fetchAppGitLog(t, harness)
	if len(logPayload.Commits) == 0 || logPayload.Commits[0].Hash == "" {
		t.Fatalf("unexpected log payload %#v", logPayload)
	}

	detailsPayload := fetchAppGitCommitDetails(t, harness, headHash)
	if len(detailsPayload.Files) == 0 {
		t.Fatalf("expected commit files, got %#v", detailsPayload)
	}

	commitDiffPayload := fetchAppGitCommitFileDiff(t, harness, headHash)
	if !strings.Contains(commitDiffPayload.Diff, "rename from rename-src.txt") || !strings.Contains(commitDiffPayload.Diff, "rename to rename-dst.txt") {
		t.Fatalf("unexpected commit diff payload %q", commitDiffPayload.Diff)
	}
}

type appGitRouteHarness struct {
	serverURL  string
	authCookie *http.Cookie
}

func startAppGitRouteHarness(t *testing.T, cfg config.Config) appGitRouteHarness {
	t.Helper()

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
	t.Cleanup(server.Close)
	return appGitRouteHarness{
		serverURL:  server.URL,
		authCookie: newAppTestAuthCookie(t, app),
	}
}

func prepareAppGitStatusFixture(t *testing.T, workspaceRoot string) {
	t.Helper()

	initAppGitRepo(t, workspaceRoot)
	writeAppGitFile(t, filepath.Join(workspaceRoot, "tracked.txt"), "two\n")
	runAppGitCommand(t, workspaceRoot, "add", "tracked.txt")
	writeAppGitFile(t, filepath.Join(workspaceRoot, "tracked.txt"), "three\n")
	writeAppGitFile(t, filepath.Join(workspaceRoot, "new.txt"), "hello\n")
}

func fetchAppGitStatus(t *testing.T, harness appGitRouteHarness) gitread.StatusResponse {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, harness.serverURL+"/api"+httpapi.RouteGetGitStatus, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new status request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(harness.authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("git status request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected status 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload gitread.StatusResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode status payload: %v", err)
	}
	return payload
}

func assertAppGitStatusEntries(t *testing.T, statusPayload gitread.StatusResponse) {
	t.Helper()

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
}

func fetchAppGitDiff(t *testing.T, harness appGitRouteHarness, body string) gitread.DiffResponse {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, harness.serverURL+"/api"+httpapi.RouteGetGitDiff, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new diff request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(harness.authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("git diff request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected diff 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload gitread.DiffResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode diff payload: %v", err)
	}
	return payload
}

func fetchAppGitLog(t *testing.T, harness appGitRouteHarness) gitread.LogResponse {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, harness.serverURL+"/api"+httpapi.RouteGetGitLog, strings.NewReader(`{"rev":"HEAD","allRefs":false,"offset":0,"pageSize":20}`))
	if err != nil {
		t.Fatalf("new log request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(harness.authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("git log request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected log 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload gitread.LogResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode log payload: %v", err)
	}
	return payload
}

func fetchAppGitCommitDetails(t *testing.T, harness appGitRouteHarness, headHash string) gitread.CommitDetailsResponse {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, harness.serverURL+"/api"+httpapi.RouteGetGitCommitDetails, strings.NewReader(`{"commitHash":"`+headHash+`"}`))
	if err != nil {
		t.Fatalf("new details request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(harness.authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("git details request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected details 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload gitread.CommitDetailsResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode details payload: %v", err)
	}
	return payload
}

func fetchAppGitCommitFileDiff(t *testing.T, harness appGitRouteHarness, headHash string) gitread.CommitFileDiffResponse {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, harness.serverURL+"/api"+httpapi.RouteGetGitCommitFileDiff, strings.NewReader(`{"commitHash":"`+headHash+`","path":"rename-dst.txt","oldPath":"rename-src.txt"}`))
	if err != nil {
		t.Fatalf("new commit diff request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(harness.authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("git commit diff request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected commit diff 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload gitread.CommitFileDiffResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode commit diff payload: %v", err)
	}
	return payload
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
