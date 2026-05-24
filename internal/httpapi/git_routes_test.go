package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
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
	expectedRepoRoot, err := filepath.EvalSymlinks(repoRoot)
	if err != nil {
		expectedRepoRoot = filepath.Clean(repoRoot)
	}
	if statusPayload.Repo.RepoRoot == nil || filepath.Clean(*statusPayload.Repo.RepoRoot) != expectedRepoRoot {
		t.Fatalf("expected repo root %q, got %#v", expectedRepoRoot, statusPayload.Repo.RepoRoot)
	}
	expectedHeadBranch := strings.TrimSpace(runGitRouteCommand(t, repoRoot, "rev-parse", "--abbrev-ref", "HEAD"))
	if statusPayload.Repo.HeadBranch == nil || *statusPayload.Repo.HeadBranch != expectedHeadBranch {
		t.Fatalf("expected head branch %q, got %#v", expectedHeadBranch, statusPayload.Repo.HeadBranch)
	}
	expectedHeadCommit := strings.TrimSpace(runGitRouteCommand(t, repoRoot, "rev-parse", "HEAD"))
	if statusPayload.Repo.HeadCommit == nil || *statusPayload.Repo.HeadCommit != expectedHeadCommit {
		t.Fatalf("expected head commit %q, got %#v", expectedHeadCommit, statusPayload.Repo.HeadCommit)
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

func TestRegisterGitRoutesReturnsTypedWorktrees(t *testing.T) {
	t.Parallel()

	repoRoot := initGitRouteTestRepo(t)
	worktreePath := filepath.Join(filepath.Dir(repoRoot), "setta.feature-extra")
	runGitRouteCommand(t, repoRoot, "worktree", "add", "-b", "feature-extra", worktreePath, "HEAD")
	expectedRepoRoot, err := filepath.EvalSymlinks(repoRoot)
	if err != nil {
		expectedRepoRoot = filepath.Clean(repoRoot)
	}
	expectedWorktreePath, err := filepath.EvalSymlinks(worktreePath)
	if err != nil {
		expectedWorktreePath = filepath.Clean(worktreePath)
	}

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
	if len(statusPayload.Worktrees) < 2 {
		t.Fatalf("expected worktrees in status payload, got %#v", statusPayload.Worktrees)
	}

	var foundCurrent bool
	var foundExtra bool
	for _, worktree := range statusPayload.Worktrees {
		switch filepath.Clean(worktree.Path) {
		case expectedRepoRoot:
			foundCurrent = true
			if !worktree.IsCurrent {
				t.Fatalf("expected current repo worktree, got %#v", worktree)
			}
		case expectedWorktreePath:
			foundExtra = true
			if worktree.BranchName == nil || *worktree.BranchName != "feature-extra" {
				t.Fatalf("expected feature-extra branch, got %#v", worktree)
			}
			if worktree.IsCurrent {
				t.Fatalf("expected sibling worktree to be non-current, got %#v", worktree)
			}
		}
	}
	if !foundCurrent || !foundExtra {
		t.Fatalf("expected current and extra worktrees, got %#v", statusPayload.Worktrees)
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

func TestRegisterGitRoutesRejectRepoRootAndUntrackedDirectoryPathspecs(t *testing.T) {
	t.Parallel()

	repoRoot := initGitRouteTestRepo(t)
	untrackedDir := filepath.Join(repoRoot, "new-dir")
	if err := os.MkdirAll(untrackedDir, 0o755); err != nil {
		t.Fatalf("mkdir untracked dir: %v", err)
	}
	writeGitRouteFile(t, filepath.Join(untrackedDir, "inside.txt"), "x\n")

	handler := newGitRouteTestHandler(t, config.ModeIDE, repoRoot)

	for _, requestBody := range []string{
		`{"path":".","mode":"unstaged"}`,
		`{"path":"new-dir","mode":"unstaged"}`,
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(requestBody))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected non-file diff 400 for %s, got %d with body %q", requestBody, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), "Path must point to a file.") {
			t.Fatalf("unexpected non-file response for %s: %q", requestBody, response.Body.String())
		}
	}
}

func TestRegisterGitRoutesPreserveLeadingSpacesAndEnforceSymlinkDiffPolicies(t *testing.T) {
	t.Parallel()

	repoRoot := initGitRouteTestRepo(t)
	leadingSpacePath := " leading-space.txt"
	writeGitRouteFile(t, filepath.Join(repoRoot, leadingSpacePath), "one\n")
	runGitRouteCommand(t, repoRoot, "add", leadingSpacePath)
	runGitRouteCommand(t, repoRoot, "commit", "-m", "add leading-space path")
	writeGitRouteFile(t, filepath.Join(repoRoot, leadingSpacePath), "two\n")

	specialPath := "a[1].txt"
	plainPath := "a1.txt"
	writeGitRouteFile(t, filepath.Join(repoRoot, specialPath), "one\n")
	writeGitRouteFile(t, filepath.Join(repoRoot, plainPath), "one\n")
	runGitRouteCommand(t, repoRoot, "add", specialPath, plainPath)
	runGitRouteCommand(t, repoRoot, "commit", "-m", "add special path names")
	writeGitRouteFile(t, filepath.Join(repoRoot, specialPath), "two\n")
	writeGitRouteFile(t, filepath.Join(repoRoot, plainPath), "two\n")

	outsideRoot := t.TempDir()
	oldTarget := filepath.Join(outsideRoot, "old-target.txt")
	newTarget := filepath.Join(outsideRoot, "new-target.txt")
	writeGitRouteFile(t, oldTarget, "old\n")
	writeGitRouteFile(t, newTarget, "new\n")
	trackedSymlinkPath := filepath.Join(repoRoot, "outside-link.txt")
	if err := os.Symlink(oldTarget, trackedSymlinkPath); err != nil {
		t.Fatalf("create tracked symlink: %v", err)
	}
	runGitRouteCommand(t, repoRoot, "add", "outside-link.txt")
	runGitRouteCommand(t, repoRoot, "commit", "-m", "add outside symlink")
	if err := os.Remove(trackedSymlinkPath); err != nil {
		t.Fatalf("remove tracked symlink: %v", err)
	}
	if err := os.Symlink(newTarget, trackedSymlinkPath); err != nil {
		t.Fatalf("recreate tracked symlink: %v", err)
	}

	untrackedTarget := filepath.Join(outsideRoot, "outside-target.txt")
	writeGitRouteFile(t, untrackedTarget, "outside\n")
	if err := os.Symlink(untrackedTarget, filepath.Join(repoRoot, "untracked-outside-link.txt")); err != nil {
		t.Fatalf("create untracked symlink: %v", err)
	}

	handler := newGitRouteTestHandler(t, config.ModeIDE, repoRoot)

	leadingRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(`{"path":" leading-space.txt","mode":"unstaged"}`))
	leadingRequest.Header.Set("Content-Type", "application/json")
	leadingResponse := httptest.NewRecorder()
	handler.ServeHTTP(leadingResponse, leadingRequest)
	if leadingResponse.Code != http.StatusOK {
		t.Fatalf("expected leading-space diff 200, got %d with body %q", leadingResponse.Code, leadingResponse.Body.String())
	}
	var leadingPayload gitread.DiffResponse
	if err := json.Unmarshal(leadingResponse.Body.Bytes(), &leadingPayload); err != nil {
		t.Fatalf("decode leading-space payload: %v", err)
	}
	if !strings.Contains(leadingPayload.Diff, "diff --git a/ leading-space.txt b/ leading-space.txt") || !strings.Contains(leadingPayload.Diff, "-one") || !strings.Contains(leadingPayload.Diff, "+two") {
		t.Fatalf("unexpected leading-space diff %q", leadingPayload.Diff)
	}

	specialRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(`{"path":"a[1].txt","mode":"unstaged"}`))
	specialRequest.Header.Set("Content-Type", "application/json")
	specialResponse := httptest.NewRecorder()
	handler.ServeHTTP(specialResponse, specialRequest)
	if specialResponse.Code != http.StatusOK {
		t.Fatalf("expected literal path diff 200, got %d with body %q", specialResponse.Code, specialResponse.Body.String())
	}
	var specialPayload gitread.DiffResponse
	if err := json.Unmarshal(specialResponse.Body.Bytes(), &specialPayload); err != nil {
		t.Fatalf("decode literal path payload: %v", err)
	}
	if !strings.Contains(specialPayload.Diff, "diff --git a/a[1].txt b/a[1].txt") || strings.Contains(specialPayload.Diff, "diff --git a/a1.txt b/a1.txt") {
		t.Fatalf("unexpected literal path diff %q", specialPayload.Diff)
	}

	trackedSymlinkRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(`{"path":"outside-link.txt","mode":"unstaged"}`))
	trackedSymlinkRequest.Header.Set("Content-Type", "application/json")
	trackedSymlinkResponse := httptest.NewRecorder()
	handler.ServeHTTP(trackedSymlinkResponse, trackedSymlinkRequest)
	if trackedSymlinkResponse.Code != http.StatusOK {
		t.Fatalf("expected tracked symlink diff 200, got %d with body %q", trackedSymlinkResponse.Code, trackedSymlinkResponse.Body.String())
	}
	var trackedSymlinkPayload gitread.DiffResponse
	if err := json.Unmarshal(trackedSymlinkResponse.Body.Bytes(), &trackedSymlinkPayload); err != nil {
		t.Fatalf("decode tracked symlink payload: %v", err)
	}
	if !strings.Contains(trackedSymlinkPayload.Diff, "diff --git a/outside-link.txt b/outside-link.txt") {
		t.Fatalf("unexpected tracked symlink diff %q", trackedSymlinkPayload.Diff)
	}

	untrackedSymlinkRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(`{"path":"untracked-outside-link.txt","mode":"unstaged"}`))
	untrackedSymlinkRequest.Header.Set("Content-Type", "application/json")
	untrackedSymlinkResponse := httptest.NewRecorder()
	handler.ServeHTTP(untrackedSymlinkResponse, untrackedSymlinkRequest)
	if untrackedSymlinkResponse.Code != http.StatusForbidden {
		t.Fatalf("expected untracked symlink diff 403, got %d with body %q", untrackedSymlinkResponse.Code, untrackedSymlinkResponse.Body.String())
	}
	if !strings.Contains(untrackedSymlinkResponse.Body.String(), "Symlink paths are not supported for synthesized diffs.") {
		t.Fatalf("unexpected untracked symlink response %q", untrackedSymlinkResponse.Body.String())
	}
}

func TestRegisterGitRoutesReturnsNotRepoForDiffAndBlocksNonIDEModes(t *testing.T) {
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

	testCases := []struct {
		mode           config.Mode
		expectedDetail string
	}{
		{mode: config.ModeLauncher, expectedDetail: "Launcher mode does not allow this endpoint."},
		{mode: config.ModeShare, expectedDetail: "Deployment mode does not allow this endpoint."},
		{mode: config.ModeApp, expectedDetail: "Deployment mode does not allow this endpoint."},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(string(testCase.mode), func(t *testing.T) {
			t.Parallel()

			handler := newGitRouteTestHandler(t, testCase.mode, t.TempDir())
			statusRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitStatus, strings.NewReader("null"))
			statusRequest.Header.Set("Content-Type", "application/json")
			statusResponse := httptest.NewRecorder()
			handler.ServeHTTP(statusResponse, statusRequest)
			if statusResponse.Code != http.StatusForbidden {
				t.Fatalf("expected %s 403, got %d with body %q", testCase.mode, statusResponse.Code, statusResponse.Body.String())
			}
			if !strings.Contains(statusResponse.Body.String(), testCase.expectedDetail) {
				t.Fatalf("unexpected %s response %q", testCase.mode, statusResponse.Body.String())
			}
		})
	}
}

func TestRegisterGitRoutesSetsIsCappedAndStopsPaginationAtHistoryCap(t *testing.T) {
	repoRoot := initGitRouteHistoryCapRepo(t, gitreadMaxLogCount()+1)
	handler := newGitRouteTestHandler(t, config.ModeIDE, repoRoot)

	logRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetGitLog,
		strings.NewReader(`{"rev":"HEAD","allRefs":false,"offset":4990,"pageSize":50}`),
	)
	logRequest.Header.Set("Content-Type", "application/json")
	logResponse := httptest.NewRecorder()
	handler.ServeHTTP(logResponse, logRequest)
	if logResponse.Code != http.StatusOK {
		t.Fatalf("expected capped log 200, got %d with body %q", logResponse.Code, logResponse.Body.String())
	}

	var payload gitread.LogResponse
	if err := json.Unmarshal(logResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode capped log payload: %v", err)
	}
	if len(payload.Commits) != 10 {
		t.Fatalf("expected final capped page of 10 commits, got %#v", payload)
	}
	if payload.HasMore {
		t.Fatalf("expected capped log to stop pagination, got %#v", payload)
	}
	if payload.NextOffset != nil {
		t.Fatalf("expected no nextOffset once cap is reached, got %#v", payload.NextOffset)
	}
	if !payload.IsCapped {
		t.Fatalf("expected isCapped=true, got %#v", payload)
	}
}

func TestRegisterGitRoutesSetTruncationFlagsForLargeDiffAndCommitFileDiff(t *testing.T) {
	repoRoot := initGitRouteTestRepo(t)
	largePath := filepath.Join(repoRoot, "large.txt")
	originalContent := strings.Repeat("one\n", 350000)
	updatedContent := strings.Repeat("two\n", 350000)
	writeGitRouteFile(t, largePath, originalContent)
	runGitRouteCommand(t, repoRoot, "add", "large.txt")
	runGitRouteCommand(t, repoRoot, "commit", "-m", "add large file")
	writeGitRouteFile(t, largePath, updatedContent)

	handler := newGitRouteTestHandler(t, config.ModeIDE, repoRoot)

	diffRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(`{"path":"large.txt","mode":"unstaged"}`))
	diffRequest.Header.Set("Content-Type", "application/json")
	diffResponse := httptest.NewRecorder()
	handler.ServeHTTP(diffResponse, diffRequest)
	if diffResponse.Code != http.StatusOK {
		t.Fatalf("expected large diff 200, got %d with body %q", diffResponse.Code, diffResponse.Body.String())
	}

	var diffPayload gitread.DiffResponse
	if err := json.Unmarshal(diffResponse.Body.Bytes(), &diffPayload); err != nil {
		t.Fatalf("decode large diff payload: %v", err)
	}
	if !diffPayload.IsTruncated {
		t.Fatalf("expected truncated diff payload, got %#v", diffPayload)
	}
	if !strings.Contains(diffPayload.Diff, "diff --git a/large.txt b/large.txt") {
		t.Fatalf("expected diff header in truncated route diff, got %q", diffPayload.Diff)
	}

	runGitRouteCommand(t, repoRoot, "add", "large.txt")
	runGitRouteCommand(t, repoRoot, "commit", "-m", "update large file")
	commitHash := strings.TrimSpace(runGitRouteCommand(t, repoRoot, "rev-parse", "HEAD"))

	commitDiffRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitCommitFileDiff, strings.NewReader(`{"commitHash":"`+commitHash+`","path":"large.txt"}`))
	commitDiffRequest.Header.Set("Content-Type", "application/json")
	commitDiffResponse := httptest.NewRecorder()
	handler.ServeHTTP(commitDiffResponse, commitDiffRequest)
	if commitDiffResponse.Code != http.StatusOK {
		t.Fatalf("expected large commit diff 200, got %d with body %q", commitDiffResponse.Code, commitDiffResponse.Body.String())
	}

	var commitDiffPayload gitread.CommitFileDiffResponse
	if err := json.Unmarshal(commitDiffResponse.Body.Bytes(), &commitDiffPayload); err != nil {
		t.Fatalf("decode large commit diff payload: %v", err)
	}
	if !commitDiffPayload.IsTruncated {
		t.Fatalf("expected truncated commit diff payload, got %#v", commitDiffPayload)
	}
	if !strings.Contains(commitDiffPayload.Diff, "diff --git a/large.txt b/large.txt") {
		t.Fatalf("expected diff header in truncated commit diff payload, got %q", commitDiffPayload.Diff)
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

func TestRegisterGitRoutesCommitFileDiffTreatsPathspecsAsLiteralAndRejectsDirectories(t *testing.T) {
	t.Parallel()

	repoRoot := initGitRouteTestRepo(t)
	specialPath := "a[1].txt"
	plainPath := "a1.txt"
	writeGitRouteFile(t, filepath.Join(repoRoot, specialPath), "one\n")
	writeGitRouteFile(t, filepath.Join(repoRoot, plainPath), "one\n")
	runGitRouteCommand(t, repoRoot, "add", specialPath, plainPath)
	runGitRouteCommand(t, repoRoot, "commit", "-m", "add literal files")
	writeGitRouteFile(t, filepath.Join(repoRoot, specialPath), "two\n")
	writeGitRouteFile(t, filepath.Join(repoRoot, plainPath), "two\n")
	runGitRouteCommand(t, repoRoot, "add", specialPath, plainPath)
	runGitRouteCommand(t, repoRoot, "commit", "-m", "update literal files")
	literalCommit := strings.TrimSpace(runGitRouteCommand(t, repoRoot, "rev-parse", "HEAD"))

	nestedDir := filepath.Join(repoRoot, "dir")
	if err := os.MkdirAll(nestedDir, 0o755); err != nil {
		t.Fatalf("mkdir dir: %v", err)
	}
	writeGitRouteFile(t, filepath.Join(nestedDir, "nested.txt"), "nested\n")
	runGitRouteCommand(t, repoRoot, "add", "dir/nested.txt")
	runGitRouteCommand(t, repoRoot, "commit", "-m", "add nested")
	directoryCommit := strings.TrimSpace(runGitRouteCommand(t, repoRoot, "rev-parse", "HEAD"))

	spacedDir := filepath.Join(repoRoot, " dir")
	if err := os.MkdirAll(spacedDir, 0o755); err != nil {
		t.Fatalf("mkdir spaced dir: %v", err)
	}
	writeGitRouteFile(t, filepath.Join(spacedDir, "inside.txt"), "inside\n")
	runGitRouteCommand(t, repoRoot, "add", " dir/inside.txt")
	runGitRouteCommand(t, repoRoot, "commit", "-m", "add spaced directory")
	spacedDirectoryCommit := strings.TrimSpace(runGitRouteCommand(t, repoRoot, "rev-parse", "HEAD"))

	handler := newGitRouteTestHandler(t, config.ModeIDE, repoRoot)

	literalRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitCommitFileDiff, strings.NewReader(`{"commitHash":"`+literalCommit+`","path":"a[1].txt"}`))
	literalRequest.Header.Set("Content-Type", "application/json")
	literalResponse := httptest.NewRecorder()
	handler.ServeHTTP(literalResponse, literalRequest)
	if literalResponse.Code != http.StatusOK {
		t.Fatalf("expected literal commit file diff 200, got %d with body %q", literalResponse.Code, literalResponse.Body.String())
	}
	var literalPayload gitread.CommitFileDiffResponse
	if err := json.Unmarshal(literalResponse.Body.Bytes(), &literalPayload); err != nil {
		t.Fatalf("decode literal commit diff payload: %v", err)
	}
	if !strings.Contains(literalPayload.Diff, "diff --git a/a[1].txt b/a[1].txt") || strings.Contains(literalPayload.Diff, "diff --git a/a1.txt b/a1.txt") {
		t.Fatalf("unexpected literal commit diff payload %q", literalPayload.Diff)
	}

	for _, testCase := range []struct {
		requestBody string
	}{
		{requestBody: `{"commitHash":"` + directoryCommit + `","path":"dir"}`},
		{requestBody: `{"commitHash":"` + spacedDirectoryCommit + `","path":" dir"}`},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitCommitFileDiff, strings.NewReader(testCase.requestBody))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected directory commit file diff 400 for %s, got %d with body %q", testCase.requestBody, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), "Path must point to a file.") {
			t.Fatalf("unexpected directory commit file diff response for %s: %q", testCase.requestBody, response.Body.String())
		}
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

	nulLogRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitLog, strings.NewReader("{\"rev\":\"HEAD\\u0000evil\",\"allRefs\":false,\"offset\":0,\"pageSize\":20}"))
	nulLogRequest.Header.Set("Content-Type", "application/json")
	nulLogResponse := httptest.NewRecorder()
	handler.ServeHTTP(nulLogResponse, nulLogRequest)
	if nulLogResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected NUL revision 400, got %d with body %q", nulLogResponse.Code, nulLogResponse.Body.String())
	}
	if !strings.Contains(nulLogResponse.Body.String(), "Invalid revision.") {
		t.Fatalf("unexpected NUL revision response %q", nulLogResponse.Body.String())
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

func TestRegisterGitRoutesPreserveLogSubjectsContainingASCIIFieldSeparators(t *testing.T) {
	t.Parallel()

	repoRoot := initGitRouteTestRepo(t)
	specialSubject := "subject-with-\x1f-unit-and-\x1e-record"
	writeGitRouteFile(t, filepath.Join(repoRoot, "separator-subject.txt"), "separator\n")
	runGitRouteCommand(t, repoRoot, "add", "separator-subject.txt")
	runGitRouteCommand(t, repoRoot, "commit", "-m", specialSubject)

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
	for _, commit := range logPayload.Commits {
		if commit.Subject == specialSubject {
			return
		}
	}
	t.Fatalf("expected subject %q in log payload %#v", specialSubject, logPayload.Commits)
}

func TestRegisterGitRoutesRejectRepoEscapePathsAndInvalidCommitHashes(t *testing.T) {
	t.Parallel()

	repoRoot := initGitRouteTestRepo(t)
	handler := newGitRouteTestHandler(t, config.ModeIDE, repoRoot)

	diffRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitDiff, strings.NewReader(`{"path":"../tracked.txt","mode":"unstaged"}`))
	diffRequest.Header.Set("Content-Type", "application/json")
	diffResponse := httptest.NewRecorder()
	handler.ServeHTTP(diffResponse, diffRequest)
	if diffResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid path 400, got %d with body %q", diffResponse.Code, diffResponse.Body.String())
	}
	if !strings.Contains(diffResponse.Body.String(), `"code":"invalid_request"`) || !strings.Contains(diffResponse.Body.String(), "Path must not contain '..'.") {
		t.Fatalf("unexpected invalid path response %q", diffResponse.Body.String())
	}

	detailsRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitCommitDetails, strings.NewReader(`{"commitHash":"not-a-commit"}`))
	detailsRequest.Header.Set("Content-Type", "application/json")
	detailsResponse := httptest.NewRecorder()
	handler.ServeHTTP(detailsResponse, detailsRequest)
	if detailsResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid commit 400, got %d with body %q", detailsResponse.Code, detailsResponse.Body.String())
	}
	if !strings.Contains(detailsResponse.Body.String(), `"code":"invalid_commit_hash"`) || !strings.Contains(detailsResponse.Body.String(), "Invalid commit hash.") {
		t.Fatalf("unexpected invalid commit response %q", detailsResponse.Body.String())
	}

	commitDiffRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitCommitFileDiff, strings.NewReader(`{"commitHash":"not-a-commit","path":"tracked.txt"}`))
	commitDiffRequest.Header.Set("Content-Type", "application/json")
	commitDiffResponse := httptest.NewRecorder()
	handler.ServeHTTP(commitDiffResponse, commitDiffRequest)
	if commitDiffResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid commit diff 400, got %d with body %q", commitDiffResponse.Code, commitDiffResponse.Body.String())
	}
	if !strings.Contains(commitDiffResponse.Body.String(), `"code":"invalid_commit_hash"`) || !strings.Contains(commitDiffResponse.Body.String(), "Invalid commit hash.") {
		t.Fatalf("unexpected invalid commit diff response %q", commitDiffResponse.Body.String())
	}
}

func TestRegisterGitRoutesPreserveStatusAndCommitDetailsTruncationFlags(t *testing.T) {
	t.Parallel()

	repoRoot := "/tmp/setta"
	headCommit := strings.Repeat("a", 40)
	service := stubGitReadService{
		statusResponse: gitread.StatusResponse{
			Repo: gitread.RepoInfo{
				IsGitRepo:  true,
				RepoRoot:   &repoRoot,
				HeadBranch: ptrString("main"),
				HeadCommit: &headCommit,
			},
			Entries:     []gitread.StatusEntry{{Path: "large.txt", Kind: "unstaged"}},
			IsTruncated: true,
			Worktrees:   []gitread.GitWorktreeEntry{},
		},
		commitDetailsResponse: gitread.CommitDetailsResponse{
			RepoRoot:       repoRoot,
			CommitHash:     headCommit,
			Subject:        "big commit",
			Files:          []gitread.CommitChangedFile{{Path: "large.txt", Status: "M"}},
			IsTruncated:    true,
			AuthorName:     "A",
			AuthorEmail:    "a@example.com",
			CommitterName:  "A",
			CommitterEmail: "a@example.com",
		},
	}
	handler := newGitRouteTestHandlerWithService(t, config.ModeIDE, service)

	statusRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitStatus, strings.NewReader("null"))
	statusRequest.Header.Set("Content-Type", "application/json")
	statusResponse := httptest.NewRecorder()
	handler.ServeHTTP(statusResponse, statusRequest)
	if statusResponse.Code != http.StatusOK {
		t.Fatalf("expected truncated status 200, got %d with body %q", statusResponse.Code, statusResponse.Body.String())
	}
	var statusPayload gitread.StatusResponse
	if err := json.Unmarshal(statusResponse.Body.Bytes(), &statusPayload); err != nil {
		t.Fatalf("decode truncated status payload: %v", err)
	}
	if !statusPayload.IsTruncated {
		t.Fatalf("expected status transport to preserve isTruncated, got %#v", statusPayload)
	}

	detailsRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteGetGitCommitDetails, strings.NewReader(`{"commitHash":"`+headCommit+`"}`))
	detailsRequest.Header.Set("Content-Type", "application/json")
	detailsResponse := httptest.NewRecorder()
	handler.ServeHTTP(detailsResponse, detailsRequest)
	if detailsResponse.Code != http.StatusOK {
		t.Fatalf("expected truncated commit details 200, got %d with body %q", detailsResponse.Code, detailsResponse.Body.String())
	}
	var detailsPayload gitread.CommitDetailsResponse
	if err := json.Unmarshal(detailsResponse.Body.Bytes(), &detailsPayload); err != nil {
		t.Fatalf("decode truncated commit details payload: %v", err)
	}
	if !detailsPayload.IsTruncated {
		t.Fatalf("expected commit-details transport to preserve isTruncated, got %#v", detailsPayload)
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

func newGitRouteTestHandlerWithService(t *testing.T, mode config.Mode, service GitReadService) http.Handler {
	t.Helper()

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

func initGitRouteHistoryCapRepo(t *testing.T, totalCommits int) string {
	t.Helper()

	if _, err := exec.LookPath("git"); err != nil {
		t.Fatalf("git not found: %v", err)
	}

	repoRoot := t.TempDir()
	runGitRouteCommand(t, repoRoot, "init")
	runGitRouteCommand(t, repoRoot, "symbolic-ref", "HEAD", "refs/heads/main")

	var stream strings.Builder
	stream.WriteString("blob\nmark :1\ndata 5\nseed\n\n")
	for index := 0; index < totalCommits; index++ {
		commitMark := index + 2
		message := "commit-" + strconv.Itoa(index)
		timestamp := strconv.Itoa(1700000000 + index)
		stream.WriteString("commit refs/heads/main\n")
		stream.WriteString("mark :" + strconv.Itoa(commitMark) + "\n")
		stream.WriteString("author A <a@example.com> " + timestamp + " +0000\n")
		stream.WriteString("committer A <a@example.com> " + timestamp + " +0000\n")
		stream.WriteString("data " + strconv.Itoa(len(message)) + "\n")
		stream.WriteString(message + "\n")
		if index > 0 {
			stream.WriteString("from :" + strconv.Itoa(commitMark-1) + "\n")
		}
		if index == 0 {
			stream.WriteString("M 100644 :1 tracked.txt\n")
		}
		stream.WriteString("\n")
	}

	command := exec.Command("git", "fast-import", "--quiet")
	command.Dir = repoRoot
	command.Stdin = strings.NewReader(stream.String())
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git fast-import: %v\n%s", err, string(output))
	}
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

func gitreadMaxLogCount() int {
	return 5000
}

type stubGitReadService struct {
	statusResponse         gitread.StatusResponse
	statusErr              error
	diffResponse           gitread.DiffResponse
	diffErr                error
	logResponse            gitread.LogResponse
	logErr                 error
	commitDetailsResponse  gitread.CommitDetailsResponse
	commitDetailsErr       error
	commitFileDiffResponse gitread.CommitFileDiffResponse
	commitFileDiffErr      error
}

func (s stubGitReadService) Status(context.Context) (gitread.StatusResponse, error) {
	return s.statusResponse, s.statusErr
}

func (s stubGitReadService) Diff(context.Context, gitread.DiffRequest) (gitread.DiffResponse, error) {
	return s.diffResponse, s.diffErr
}

func (s stubGitReadService) Log(context.Context, gitread.LogRequest) (gitread.LogResponse, error) {
	return s.logResponse, s.logErr
}

func (s stubGitReadService) CommitDetails(context.Context, gitread.CommitDetailsRequest) (gitread.CommitDetailsResponse, error) {
	return s.commitDetailsResponse, s.commitDetailsErr
}

func (s stubGitReadService) CommitFileDiff(context.Context, gitread.CommitFileDiffRequest) (gitread.CommitFileDiffResponse, error) {
	return s.commitFileDiffResponse, s.commitFileDiffErr
}

func ptrString(value string) *string {
	return &value
}

func writeGitRouteFile(t *testing.T, path string, contents string) {
	t.Helper()

	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write file %s: %v", path, err)
	}
}
