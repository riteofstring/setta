package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/gitread"
	"setta/internal/modes"
)

func TestRegisterGitRoutesReturnsNonRepoStatus(t *testing.T) {
	t.Parallel()

	handler := newGitRouteTestHandler(t, config.ModeIDE, t.TempDir())
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitStatus, strings.NewReader("null"))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload gitread.StatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode status payload: %v", err)
	}
	if payload.Repo.IsGitRepo {
		t.Fatalf("expected non-repo payload, got %#v", payload.Repo)
	}
	if len(payload.Entries) != 0 {
		t.Fatalf("expected empty entries, got %#v", payload.Entries)
	}
}

func TestRegisterGitRoutesReturnsStatusAndDiff(t *testing.T) {
	t.Parallel()

	repoRoot := initGitRouteTestRepo(t)
	writeGitRouteFile(t, filepath.Join(repoRoot, "tracked.txt"), "two\n")
	runGitRouteCommand(t, repoRoot, "add", "tracked.txt")
	writeGitRouteFile(t, filepath.Join(repoRoot, "tracked.txt"), "three\n")
	writeGitRouteFile(t, filepath.Join(repoRoot, "new.txt"), "hello\n")

	handler := newGitRouteTestHandler(t, config.ModeIDE, repoRoot)

	statusRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitStatus, strings.NewReader("null"))
	statusRequest.Header.Set("Content-Type", "application/json")
	statusResponse := httptest.NewRecorder()
	handler.ServeHTTP(statusResponse, statusRequest)
	if statusResponse.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d with body %q", statusResponse.Code, statusResponse.Body.String())
	}

	var statusPayload gitread.StatusResponse
	if err := json.Unmarshal(statusResponse.Body.Bytes(), &statusPayload); err != nil {
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
		t.Fatalf("unexpected status entries %#v", statusPayload.Entries)
	}

	diffRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(`{"path":"tracked.txt","mode":"unstaged"}`))
	diffRequest.Header.Set("Content-Type", "application/json")
	diffResponse := httptest.NewRecorder()
	handler.ServeHTTP(diffResponse, diffRequest)
	if diffResponse.Code != http.StatusOK {
		t.Fatalf("expected diff 200, got %d with body %q", diffResponse.Code, diffResponse.Body.String())
	}

	var diffPayload gitread.DiffResponse
	if err := json.Unmarshal(diffResponse.Body.Bytes(), &diffPayload); err != nil {
		t.Fatalf("decode diff payload: %v", err)
	}
	if !strings.Contains(diffPayload.Diff, "-two") || !strings.Contains(diffPayload.Diff, "+three") {
		t.Fatalf("unexpected diff payload %q", diffPayload.Diff)
	}
}

func TestRegisterGitRoutesUsesOldPathForRenameAndRejectsDirectories(t *testing.T) {
	t.Parallel()

	repoRoot := initGitRouteTestRepo(t)
	runGitRouteCommand(t, repoRoot, "mv", "tracked.txt", "renamed.txt")

	handler := newGitRouteTestHandler(t, config.ModeIDE, repoRoot)

	renameRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(`{"path":"renamed.txt","oldPath":"tracked.txt","mode":"staged"}`))
	renameRequest.Header.Set("Content-Type", "application/json")
	renameResponse := httptest.NewRecorder()
	handler.ServeHTTP(renameResponse, renameRequest)
	if renameResponse.Code != http.StatusOK {
		t.Fatalf("expected rename diff 200, got %d with body %q", renameResponse.Code, renameResponse.Body.String())
	}

	var renamePayload gitread.DiffResponse
	if err := json.Unmarshal(renameResponse.Body.Bytes(), &renamePayload); err != nil {
		t.Fatalf("decode rename payload: %v", err)
	}
	if !strings.Contains(renamePayload.Diff, "rename from tracked.txt") || !strings.Contains(renamePayload.Diff, "rename to renamed.txt") {
		t.Fatalf("unexpected rename diff %q", renamePayload.Diff)
	}

	nestedDir := filepath.Join(repoRoot, "dir")
	if err := os.MkdirAll(nestedDir, 0o755); err != nil {
		t.Fatalf("mkdir dir: %v", err)
	}
	writeGitRouteFile(t, filepath.Join(nestedDir, "nested.txt"), "nested\n")
	runGitRouteCommand(t, repoRoot, "add", "dir/nested.txt")
	runGitRouteCommand(t, repoRoot, "commit", "-m", "add nested")
	writeGitRouteFile(t, filepath.Join(nestedDir, "nested.txt"), "changed\n")

	directoryRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(`{"path":"dir","mode":"unstaged"}`))
	directoryRequest.Header.Set("Content-Type", "application/json")
	directoryResponse := httptest.NewRecorder()
	handler.ServeHTTP(directoryResponse, directoryRequest)
	if directoryResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected directory diff 400, got %d with body %q", directoryResponse.Code, directoryResponse.Body.String())
	}
	if !strings.Contains(directoryResponse.Body.String(), "Path must point to a file.") {
		t.Fatalf("unexpected directory response %q", directoryResponse.Body.String())
	}
}

func TestRegisterGitRoutesReturnsNotRepoForDiffAndBlocksLauncherMode(t *testing.T) {
	t.Parallel()

	nonRepoHandler := newGitRouteTestHandler(t, config.ModeIDE, t.TempDir())
	diffRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(`{"path":"tracked.txt","mode":"unstaged"}`))
	diffRequest.Header.Set("Content-Type", "application/json")
	diffResponse := httptest.NewRecorder()
	nonRepoHandler.ServeHTTP(diffResponse, diffRequest)
	if diffResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected non-repo diff 400, got %d with body %q", diffResponse.Code, diffResponse.Body.String())
	}
	if !strings.Contains(diffResponse.Body.String(), "Current workspace is not a git repository.") {
		t.Fatalf("unexpected non-repo diff response %q", diffResponse.Body.String())
	}

	launcherHandler := newGitRouteTestHandler(t, config.ModeLauncher, t.TempDir())
	statusRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitStatus, strings.NewReader("null"))
	statusRequest.Header.Set("Content-Type", "application/json")
	statusResponse := httptest.NewRecorder()
	launcherHandler.ServeHTTP(statusResponse, statusRequest)
	if statusResponse.Code != http.StatusForbidden {
		t.Fatalf("expected launcher 403, got %d with body %q", statusResponse.Code, statusResponse.Body.String())
	}
	if !strings.Contains(statusResponse.Body.String(), "Launcher mode does not allow this endpoint.") {
		t.Fatalf("unexpected launcher response %q", statusResponse.Body.String())
	}
}

func TestRegisterGitRoutesReturnsLogDetailsAndCommitFileDiff(t *testing.T) {
	t.Parallel()

	repoRoot := initGitRouteTestRepo(t)
	writeGitRouteFile(t, filepath.Join(repoRoot, "rename-src.txt"), "rename\n")
	runGitRouteCommand(t, repoRoot, "add", "rename-src.txt")
	runGitRouteCommand(t, repoRoot, "commit", "-m", "add rename source")
	runGitRouteCommand(t, repoRoot, "mv", "rename-src.txt", "rename-dst.txt")
	runGitRouteCommand(t, repoRoot, "commit", "-m", "rename source to dest")
	headHash := strings.TrimSpace(runGitRouteCommand(t, repoRoot, "rev-parse", "HEAD"))

	handler := newGitRouteTestHandler(t, config.ModeIDE, repoRoot)

	logRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitLog, strings.NewReader(`{"rev":"HEAD","allRefs":false,"offset":0,"pageSize":20}`))
	logRequest.Header.Set("Content-Type", "application/json")
	logResponse := httptest.NewRecorder()
	handler.ServeHTTP(logResponse, logRequest)
	if logResponse.Code != http.StatusOK {
		t.Fatalf("expected log 200, got %d with body %q", logResponse.Code, logResponse.Body.String())
	}

	var logPayload gitread.LogResponse
	if err := json.Unmarshal(logResponse.Body.Bytes(), &logPayload); err != nil {
		t.Fatalf("decode log payload: %v", err)
	}
	if len(logPayload.Commits) == 0 || logPayload.Commits[0].Hash == "" {
		t.Fatalf("unexpected log payload %#v", logPayload)
	}

	detailsRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitCommitDetails, strings.NewReader(`{"commitHash":"`+headHash+`"}`))
	detailsRequest.Header.Set("Content-Type", "application/json")
	detailsResponse := httptest.NewRecorder()
	handler.ServeHTTP(detailsResponse, detailsRequest)
	if detailsResponse.Code != http.StatusOK {
		t.Fatalf("expected details 200, got %d with body %q", detailsResponse.Code, detailsResponse.Body.String())
	}

	var detailsPayload gitread.CommitDetailsResponse
	if err := json.Unmarshal(detailsResponse.Body.Bytes(), &detailsPayload); err != nil {
		t.Fatalf("decode details payload: %v", err)
	}
	foundRename := false
	for _, file := range detailsPayload.Files {
		if file.Path == "rename-dst.txt" {
			foundRename = true
			break
		}
	}
	if !foundRename {
		t.Fatalf("expected rename file in %#v", detailsPayload.Files)
	}

	commitDiffRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitCommitFileDiff, strings.NewReader(`{"commitHash":"`+headHash+`","path":"rename-dst.txt","oldPath":"rename-src.txt"}`))
	commitDiffRequest.Header.Set("Content-Type", "application/json")
	commitDiffResponse := httptest.NewRecorder()
	handler.ServeHTTP(commitDiffResponse, commitDiffRequest)
	if commitDiffResponse.Code != http.StatusOK {
		t.Fatalf("expected commit diff 200, got %d with body %q", commitDiffResponse.Code, commitDiffResponse.Body.String())
	}

	var commitDiffPayload gitread.CommitFileDiffResponse
	if err := json.Unmarshal(commitDiffResponse.Body.Bytes(), &commitDiffPayload); err != nil {
		t.Fatalf("decode commit diff payload: %v", err)
	}
	if !strings.Contains(commitDiffPayload.Diff, "rename from rename-src.txt") || !strings.Contains(commitDiffPayload.Diff, "rename to rename-dst.txt") {
		t.Fatalf("unexpected commit diff payload %q", commitDiffPayload.Diff)
	}
}

func TestRegisterGitRoutesMapsInvalidRevisionAndMissingCommitDiff(t *testing.T) {
	t.Parallel()

	repoRoot := initGitRouteTestRepo(t)
	headHash := strings.TrimSpace(runGitRouteCommand(t, repoRoot, "rev-parse", "HEAD"))
	handler := newGitRouteTestHandler(t, config.ModeIDE, repoRoot)

	logRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitLog, strings.NewReader(`{"rev":"does-not-exist","allRefs":false,"offset":0,"pageSize":20}`))
	logRequest.Header.Set("Content-Type", "application/json")
	logResponse := httptest.NewRecorder()
	handler.ServeHTTP(logResponse, logRequest)
	if logResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid revision 400, got %d with body %q", logResponse.Code, logResponse.Body.String())
	}
	if !strings.Contains(logResponse.Body.String(), "Invalid revision: does-not-exist") {
		t.Fatalf("unexpected invalid revision response %q", logResponse.Body.String())
	}

	commitDiffRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitCommitFileDiff, strings.NewReader(`{"commitHash":"`+headHash+`","path":"missing.txt"}`))
	commitDiffRequest.Header.Set("Content-Type", "application/json")
	commitDiffResponse := httptest.NewRecorder()
	handler.ServeHTTP(commitDiffResponse, commitDiffRequest)
	if commitDiffResponse.Code != http.StatusNotFound {
		t.Fatalf("expected missing commit diff 404, got %d with body %q", commitDiffResponse.Code, commitDiffResponse.Body.String())
	}
	if !strings.Contains(commitDiffResponse.Body.String(), "File is not part of this commit diff.") {
		t.Fatalf("unexpected missing commit diff response %q", commitDiffResponse.Body.String())
	}
}

func newGitRouteTestHandler(t *testing.T, mode config.Mode, workspaceRoot string) http.Handler {
	t.Helper()

	var service *gitread.Service
	var err error
	if mode == config.ModeIDE {
		service, err = gitread.NewService(gitread.ServiceOptions{WorkspaceRoot: workspaceRoot})
		if err != nil {
			t.Fatalf("new git service: %v", err)
		}
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterGitRoutes(r, GitRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Git:        service,
			}); err != nil {
				t.Fatalf("register git routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func initGitRouteTestRepo(t *testing.T) string {
	t.Helper()

	if _, err := exec.LookPath("git"); err != nil {
		t.Fatalf("git not found: %v", err)
	}

	repoRoot := t.TempDir()
	runGitRouteCommand(t, repoRoot, "init")
	runGitRouteCommand(t, repoRoot, "config", "user.email", "a@example.com")
	runGitRouteCommand(t, repoRoot, "config", "user.name", "A")
	writeGitRouteFile(t, filepath.Join(repoRoot, ".gitignore"), "setta_files/\n")
	runGitRouteCommand(t, repoRoot, "add", ".gitignore")
	runGitRouteCommand(t, repoRoot, "commit", "-m", "init")
	writeGitRouteFile(t, filepath.Join(repoRoot, "tracked.txt"), "one\n")
	runGitRouteCommand(t, repoRoot, "add", "tracked.txt")
	runGitRouteCommand(t, repoRoot, "commit", "-m", "add tracked")
	return repoRoot
}

func runGitRouteCommand(t *testing.T, cwd string, args ...string) string {
	t.Helper()

	command := exec.Command("git", args...)
	command.Dir = cwd
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, string(output))
	}
	return string(output)
}

func writeGitRouteFile(t *testing.T, path string, contents string) {
	t.Helper()

	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write file %s: %v", path, err)
	}
}
