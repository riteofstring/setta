package gitread

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestServiceStatusReturnsNonRepoMetadataOutsideGitWorkspace(t *testing.T) {
	t.Parallel()

	service, err := NewService(ServiceOptions{WorkspaceRoot: t.TempDir()})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	response, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if response.Repo.IsGitRepo {
		t.Fatalf("expected non-repo response, got %#v", response.Repo)
	}
	if len(response.Entries) != 0 {
		t.Fatalf("expected no entries, got %#v", response.Entries)
	}
}

func TestServiceStatusParsesStagedUnstagedAndUntrackedEntries(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	writeFile(t, filepath.Join(repoRoot, "tracked.txt"), "two\n")
	runGitReadCommand(t, repoRoot, "add", "tracked.txt")
	writeFile(t, filepath.Join(repoRoot, "tracked.txt"), "three\n")
	writeFile(t, filepath.Join(repoRoot, "new.txt"), "hello\n")

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	response, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if !response.Repo.IsGitRepo {
		t.Fatalf("expected git repo response, got %#v", response.Repo)
	}
	expectedRepoRoot, err := filepath.EvalSymlinks(repoRoot)
	if err != nil {
		expectedRepoRoot = filepath.Clean(repoRoot)
	}
	if response.Repo.RepoRoot == nil || filepath.Clean(*response.Repo.RepoRoot) != expectedRepoRoot {
		t.Fatalf("expected repo root %q, got %#v", expectedRepoRoot, response.Repo.RepoRoot)
	}

	var stagedTracked bool
	var unstagedTracked bool
	var untrackedNew bool
	for _, entry := range response.Entries {
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
		t.Fatalf("unexpected status entries %#v", response.Entries)
	}
}

func TestServiceDiffReturnsStagedUnstagedAndSynthesizedUntrackedDiffs(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	writeFile(t, filepath.Join(repoRoot, "tracked.txt"), "two\n")
	runGitReadCommand(t, repoRoot, "add", "tracked.txt")
	writeFile(t, filepath.Join(repoRoot, "tracked.txt"), "three\n")
	writeFile(t, filepath.Join(repoRoot, "new.txt"), "hello\n")

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	unstaged, err := service.Diff(context.Background(), DiffRequest{
		Path: "tracked.txt",
		Mode: DiffModeUnstaged,
	})
	if err != nil {
		t.Fatalf("unstaged diff: %v", err)
	}
	if !strings.Contains(unstaged.Diff, "diff --git a/tracked.txt b/tracked.txt") || !strings.Contains(unstaged.Diff, "-two") || !strings.Contains(unstaged.Diff, "+three") {
		t.Fatalf("unexpected unstaged diff %q", unstaged.Diff)
	}

	staged, err := service.Diff(context.Background(), DiffRequest{
		Path: "tracked.txt",
		Mode: DiffModeStaged,
	})
	if err != nil {
		t.Fatalf("staged diff: %v", err)
	}
	if !strings.Contains(staged.Diff, "-one") || !strings.Contains(staged.Diff, "+two") {
		t.Fatalf("unexpected staged diff %q", staged.Diff)
	}

	untracked, err := service.Diff(context.Background(), DiffRequest{
		Path: "new.txt",
		Mode: DiffModeUnstaged,
	})
	if err != nil {
		t.Fatalf("untracked diff: %v", err)
	}
	if !strings.Contains(untracked.Diff, "new file mode 100644") || !strings.Contains(untracked.Diff, "+hello") {
		t.Fatalf("unexpected untracked diff %q", untracked.Diff)
	}
}

func TestServiceDiffUsesOldPathForStagedRename(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	runGitReadCommand(t, repoRoot, "mv", "tracked.txt", "renamed.txt")

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	oldPath := "tracked.txt"
	response, err := service.Diff(context.Background(), DiffRequest{
		Path:    "renamed.txt",
		OldPath: &oldPath,
		Mode:    DiffModeStaged,
	})
	if err != nil {
		t.Fatalf("rename diff: %v", err)
	}
	if !strings.Contains(response.Diff, "rename from tracked.txt") || !strings.Contains(response.Diff, "rename to renamed.txt") {
		t.Fatalf("unexpected rename diff %q", response.Diff)
	}
}

func TestServiceDiffTreatsPathspecsAsLiteralAndRejectsDirectories(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	writeFile(t, filepath.Join(repoRoot, "a[1].txt"), "one\n")
	writeFile(t, filepath.Join(repoRoot, "a1.txt"), "one\n")
	runGitReadCommand(t, repoRoot, "add", "a[1].txt", "a1.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "add special files")
	writeFile(t, filepath.Join(repoRoot, "a[1].txt"), "two\n")
	writeFile(t, filepath.Join(repoRoot, "a1.txt"), "two\n")

	nestedDir := filepath.Join(repoRoot, "dir")
	if err := os.MkdirAll(nestedDir, 0o755); err != nil {
		t.Fatalf("mkdir dir: %v", err)
	}
	writeFile(t, filepath.Join(nestedDir, "nested.txt"), "nested\n")
	runGitReadCommand(t, repoRoot, "add", "dir/nested.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "add nested")
	writeFile(t, filepath.Join(nestedDir, "nested.txt"), "changed\n")

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	response, err := service.Diff(context.Background(), DiffRequest{
		Path: "a[1].txt",
		Mode: DiffModeUnstaged,
	})
	if err != nil {
		t.Fatalf("literal diff: %v", err)
	}
	if !strings.Contains(response.Diff, "diff --git a/a[1].txt b/a[1].txt") || strings.Contains(response.Diff, "diff --git a/a1.txt b/a1.txt") {
		t.Fatalf("unexpected literal diff %q", response.Diff)
	}

	_, err = service.Diff(context.Background(), DiffRequest{
		Path: "dir",
		Mode: DiffModeUnstaged,
	})
	var serviceErr *Error
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected gitread error, got %v", err)
	}
	if serviceErr.Kind != ErrorPathNotFile || serviceErr.Message != "Path must point to a file." {
		t.Fatalf("unexpected directory error %#v", serviceErr)
	}
}

func TestServiceLogPaginatesAndPreservesDecorations(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	appendGitReadCommits(t, repoRoot, 4, "page")
	runGitReadCommand(t, repoRoot, "branch", "feature,comma")
	runGitReadCommand(t, repoRoot, "tag", "release,1")
	headHash := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	firstPage, err := service.Log(context.Background(), LogRequest{
		Rev:      "HEAD",
		AllRefs:  true,
		Offset:   0,
		PageSize: 3,
	})
	if err != nil {
		t.Fatalf("log first page: %v", err)
	}
	if firstPage.HeadBranch == nil || *firstPage.HeadBranch == "" {
		t.Fatalf("expected head branch, got %#v", firstPage.HeadBranch)
	}
	if len(firstPage.Commits) != 3 || !firstPage.HasMore || firstPage.NextOffset == nil || *firstPage.NextOffset != 3 {
		t.Fatalf("unexpected first page %#v", firstPage)
	}

	secondPage, err := service.Log(context.Background(), LogRequest{
		Rev:      "HEAD",
		AllRefs:  true,
		Offset:   *firstPage.NextOffset,
		PageSize: 3,
	})
	if err != nil {
		t.Fatalf("log second page: %v", err)
	}
	if secondPage.HeadBranch != nil {
		t.Fatalf("expected no head branch on later page, got %#v", secondPage.HeadBranch)
	}

	firstHashes := make(map[string]struct{}, len(firstPage.Commits))
	for _, commit := range firstPage.Commits {
		firstHashes[commit.Hash] = struct{}{}
	}
	for _, commit := range secondPage.Commits {
		if _, exists := firstHashes[commit.Hash]; exists {
			t.Fatalf("duplicate commit %s across pages", commit.Hash)
		}
	}

	foundDecoratedHead := false
	for _, commit := range firstPage.Commits {
		if commit.Hash != headHash {
			continue
		}
		foundDecoratedHead = true
		if !containsString(commit.Decorations, "feature,comma") || !containsString(commit.Decorations, "tag: release,1") {
			t.Fatalf("unexpected decorations %#v", commit.Decorations)
		}
	}
	if !foundDecoratedHead {
		t.Fatalf("expected head commit %s in first page %#v", headHash, firstPage.Commits)
	}
}

func TestServiceLogRejectsInvalidRevision(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, err = service.Log(context.Background(), LogRequest{
		Rev:      "does-not-exist",
		AllRefs:  false,
		Offset:   0,
		PageSize: 20,
	})

	var serviceErr *Error
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected gitread error, got %v", err)
	}
	if serviceErr.Kind != ErrorInvalidRevision || serviceErr.Message != "Invalid revision: does-not-exist" {
		t.Fatalf("unexpected revision error %#v", serviceErr)
	}
}

func TestServiceCommitDetailsAndFileDiffCoverRenamesAndHistoricalPaths(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	writeFile(t, filepath.Join(repoRoot, "rename-src.txt"), "rename\n")
	runGitReadCommand(t, repoRoot, "add", "rename-src.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "add rename source")
	runGitReadCommand(t, repoRoot, "mv", "rename-src.txt", "rename-dst.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "rename source to dest")
	renameCommit := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))

	swapPath := filepath.Join(repoRoot, "swap-path")
	writeFile(t, swapPath, "v1\n")
	runGitReadCommand(t, repoRoot, "add", "swap-path")
	runGitReadCommand(t, repoRoot, "commit", "-m", "add swap-path file")
	fileCommit := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))
	if err := os.Remove(swapPath); err != nil {
		t.Fatalf("remove swap-path: %v", err)
	}
	if err := os.MkdirAll(swapPath, 0o755); err != nil {
		t.Fatalf("mkdir swap-path directory: %v", err)
	}
	writeFile(t, filepath.Join(swapPath, "nested.txt"), "dir now\n")
	runGitReadCommand(t, repoRoot, "add", "-A")
	runGitReadCommand(t, repoRoot, "commit", "-m", "replace file with directory")

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	details, err := service.CommitDetails(context.Background(), CommitDetailsRequest{CommitHash: renameCommit})
	if err != nil {
		t.Fatalf("commit details: %v", err)
	}
	foundRename := false
	for _, file := range details.Files {
		if file.Path != "rename-dst.txt" {
			continue
		}
		foundRename = true
		if file.OldPath == nil || *file.OldPath != "rename-src.txt" || !strings.HasPrefix(file.Status, "R") {
			t.Fatalf("unexpected rename file %#v", file)
		}
	}
	if !foundRename {
		t.Fatalf("expected rename file in %#v", details.Files)
	}

	oldPath := "rename-src.txt"
	renameDiff, err := service.CommitFileDiff(context.Background(), CommitFileDiffRequest{
		CommitHash: renameCommit,
		Path:       "rename-dst.txt",
		OldPath:    &oldPath,
	})
	if err != nil {
		t.Fatalf("commit file diff rename: %v", err)
	}
	if !strings.Contains(renameDiff.Diff, "rename from rename-src.txt") || !strings.Contains(renameDiff.Diff, "rename to rename-dst.txt") {
		t.Fatalf("unexpected rename diff %q", renameDiff.Diff)
	}

	historicalDiff, err := service.CommitFileDiff(context.Background(), CommitFileDiffRequest{
		CommitHash: fileCommit,
		Path:       "swap-path",
	})
	if err != nil {
		t.Fatalf("historical file diff: %v", err)
	}
	if !strings.Contains(historicalDiff.Diff, "diff --git a/swap-path b/swap-path") {
		t.Fatalf("unexpected historical diff %q", historicalDiff.Diff)
	}

	_, err = service.CommitFileDiff(context.Background(), CommitFileDiffRequest{
		CommitHash: fileCommit,
		Path:       "tracked.txt",
	})
	var serviceErr *Error
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected gitread error, got %v", err)
	}
	if serviceErr.Kind != ErrorNotFound || serviceErr.Message != "File is not part of this commit diff." {
		t.Fatalf("unexpected missing diff error %#v", serviceErr)
	}
}

func initGitReadTestRepo(t *testing.T) string {
	t.Helper()

	if _, err := exec.LookPath("git"); err != nil {
		t.Fatalf("git not found: %v", err)
	}

	repoRoot := t.TempDir()
	runGitReadCommand(t, repoRoot, "init")
	runGitReadCommand(t, repoRoot, "config", "user.email", "a@example.com")
	runGitReadCommand(t, repoRoot, "config", "user.name", "A")
	writeFile(t, filepath.Join(repoRoot, ".gitignore"), "setta_files/\n")
	runGitReadCommand(t, repoRoot, "add", ".gitignore")
	runGitReadCommand(t, repoRoot, "commit", "-m", "init")
	writeFile(t, filepath.Join(repoRoot, "tracked.txt"), "one\n")
	runGitReadCommand(t, repoRoot, "add", "tracked.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "add tracked")
	return repoRoot
}

func runGitReadCommand(t *testing.T, cwd string, args ...string) string {
	t.Helper()

	command := exec.Command("git", args...)
	command.Dir = cwd
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, string(output))
	}
	return string(output)
}

func writeFile(t *testing.T, path string, contents string) {
	t.Helper()

	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write file %s: %v", path, err)
	}
}

func appendGitReadCommits(t *testing.T, cwd string, count int, prefix string) {
	t.Helper()

	for index := 0; index < count; index++ {
		writeFile(t, filepath.Join(cwd, "tracked.txt"), prefix+"-"+strconv.Itoa(index)+"\n")
		runGitReadCommand(t, cwd, "add", "tracked.txt")
		runGitReadCommand(t, cwd, "commit", "-m", prefix+"-"+strconv.Itoa(index))
	}
}
