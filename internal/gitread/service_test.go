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
	expectedHeadBranch := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "--abbrev-ref", "HEAD"))
	if response.Repo.HeadBranch == nil || *response.Repo.HeadBranch != expectedHeadBranch {
		t.Fatalf("expected head branch %q, got %#v", expectedHeadBranch, response.Repo.HeadBranch)
	}
	expectedHeadCommit := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))
	if response.Repo.HeadCommit == nil || *response.Repo.HeadCommit != expectedHeadCommit {
		t.Fatalf("expected head commit %q, got %#v", expectedHeadCommit, response.Repo.HeadCommit)
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

func TestServiceStatusSetsTruncationFlagForLargeOutput(t *testing.T) {
	statusOutput := buildLargeGitStatusOutput(40000)
	service := newScriptedGitService(t, statusOutput, "", strings.Repeat("a", 40))

	response, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if !response.IsTruncated {
		t.Fatalf("expected truncated status response, got %#v", response)
	}
	if response.Repo.HeadBranch == nil || *response.Repo.HeadBranch != "main" {
		t.Fatalf("expected head branch main, got %#v", response.Repo.HeadBranch)
	}
	if response.Repo.HeadCommit == nil || *response.Repo.HeadCommit != strings.Repeat("a", 40) {
		t.Fatalf("expected head commit in truncated status response, got %#v", response.Repo.HeadCommit)
	}
	if len(response.Entries) == 0 {
		t.Fatalf("expected partial status entries to survive truncation, got %#v", response)
	}
}

func TestParseWorktreeListPorcelainMarksCurrentAndPrunable(t *testing.T) {
	t.Parallel()

	output := strings.Join([]string{
		"worktree /tmp/setta",
		"HEAD abc1234567890",
		"branch refs/heads/main",
		"",
		"worktree /tmp/setta.feature-x",
		"HEAD def0987654321",
		"detached",
		"prunable gitdir file points to non-existent location",
		"",
		"",
	}, "\x00")

	worktrees := parseWorktreeListPorcelain(output, "/tmp/setta.feature-x")
	if len(worktrees) != 2 {
		t.Fatalf("expected two worktrees, got %#v", worktrees)
	}

	if worktrees[0].Path != "/tmp/setta" || worktrees[0].DisplayName != "main" {
		t.Fatalf("unexpected first worktree %#v", worktrees[0])
	}
	if worktrees[0].BranchName == nil || *worktrees[0].BranchName != "main" {
		t.Fatalf("expected main branch, got %#v", worktrees[0].BranchName)
	}
	if worktrees[0].HeadCommit == nil || *worktrees[0].HeadCommit != "abc1234567890" {
		t.Fatalf("expected first head commit, got %#v", worktrees[0].HeadCommit)
	}
	if worktrees[0].IsCurrent || worktrees[0].IsPrunable || worktrees[0].PrunableReason != nil {
		t.Fatalf("unexpected first worktree flags %#v", worktrees[0])
	}

	if worktrees[1].Path != "/tmp/setta.feature-x" || worktrees[1].DisplayName != "feature-x" {
		t.Fatalf("unexpected second worktree %#v", worktrees[1])
	}
	if worktrees[1].BranchName != nil {
		t.Fatalf("expected detached branch, got %#v", worktrees[1].BranchName)
	}
	if worktrees[1].HeadCommit == nil || *worktrees[1].HeadCommit != "def0987654321" {
		t.Fatalf("expected second head commit, got %#v", worktrees[1].HeadCommit)
	}
	if !worktrees[1].IsCurrent || !worktrees[1].IsPrunable {
		t.Fatalf("expected current prunable worktree, got %#v", worktrees[1])
	}
	if worktrees[1].PrunableReason == nil || *worktrees[1].PrunableReason != "gitdir file points to non-existent location" {
		t.Fatalf("unexpected prunable reason %#v", worktrees[1].PrunableReason)
	}
}

func TestServiceStatusReturnsTypedWorktrees(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	worktreePath := filepath.Join(filepath.Dir(repoRoot), "setta.feature-extra")
	runGitReadCommand(t, repoRoot, "worktree", "add", "-b", "feature-extra", worktreePath, "HEAD")
	expectedRepoRoot, err := filepath.EvalSymlinks(repoRoot)
	if err != nil {
		expectedRepoRoot = filepath.Clean(repoRoot)
	}
	expectedWorktreePath, err := filepath.EvalSymlinks(worktreePath)
	if err != nil {
		expectedWorktreePath = filepath.Clean(worktreePath)
	}

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	response, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if len(response.Worktrees) < 2 {
		t.Fatalf("expected worktrees in status response, got %#v", response.Worktrees)
	}

	var foundCurrent bool
	var foundExtra bool
	for _, worktree := range response.Worktrees {
		switch filepath.Clean(worktree.Path) {
		case expectedRepoRoot:
			foundCurrent = true
			if !worktree.IsCurrent {
				t.Fatalf("expected current repo worktree flag, got %#v", worktree)
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
		t.Fatalf("expected current and extra worktrees, got %#v", response.Worktrees)
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

func TestServiceLogSetsIsCappedAndStopsPaginationAtHistoryCap(t *testing.T) {
	repoRoot := initGitReadHistoryCapRepo(t, maxLogCount+1)
	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	response, err := service.Log(context.Background(), LogRequest{
		Rev:      "HEAD",
		AllRefs:  false,
		Offset:   maxLogCount - 10,
		PageSize: 50,
	})
	if err != nil {
		t.Fatalf("log capped history: %v", err)
	}
	if len(response.Commits) != 10 {
		t.Fatalf("expected final capped page of 10 commits, got %#v", response)
	}
	if response.HasMore {
		t.Fatalf("expected capped history to stop pagination, got %#v", response)
	}
	if response.NextOffset != nil {
		t.Fatalf("expected no nextOffset once cap is reached, got %#v", response.NextOffset)
	}
	if !response.IsCapped {
		t.Fatalf("expected isCapped=true at history cap, got %#v", response)
	}
}

func TestServiceDiffAndCommitFileDiffSetTruncationFlagsForLargeOutput(t *testing.T) {
	repoRoot := initGitReadTestRepo(t)
	largePath := filepath.Join(repoRoot, "large.txt")
	originalContent := strings.Repeat("one\n", 350000)
	updatedContent := strings.Repeat("two\n", 350000)
	writeFile(t, largePath, originalContent)
	runGitReadCommand(t, repoRoot, "add", "large.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "add large file")
	writeFile(t, largePath, updatedContent)

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	diff, err := service.Diff(context.Background(), DiffRequest{
		Path: "large.txt",
		Mode: DiffModeUnstaged,
	})
	if err != nil {
		t.Fatalf("diff large file: %v", err)
	}
	if !diff.IsTruncated {
		t.Fatalf("expected truncated diff response, got %#v", diff)
	}
	if !strings.Contains(diff.Diff, "diff --git a/large.txt b/large.txt") {
		t.Fatalf("expected diff header in truncated diff, got %q", diff.Diff)
	}

	runGitReadCommand(t, repoRoot, "add", "large.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "update large file")
	commitHash := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))

	fileDiff, err := service.CommitFileDiff(context.Background(), CommitFileDiffRequest{
		CommitHash: commitHash,
		Path:       "large.txt",
	})
	if err != nil {
		t.Fatalf("commit file diff for large file: %v", err)
	}
	if !fileDiff.IsTruncated {
		t.Fatalf("expected truncated commit file diff, got %#v", fileDiff)
	}
	if !strings.Contains(fileDiff.Diff, "diff --git a/large.txt b/large.txt") {
		t.Fatalf("expected diff header in truncated commit file diff, got %q", fileDiff.Diff)
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

func TestServiceDiffRejectsAbsoluteParentAndNULPaths(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	testCases := []struct {
		path            string
		expectedMessage string
	}{
		{path: "/tmp/tracked.txt", expectedMessage: "Path must be repo-relative."},
		{path: "../tracked.txt", expectedMessage: "Path must not contain '..'."},
		{path: "bad\x00path.txt", expectedMessage: "Invalid path."},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(strings.ReplaceAll(testCase.expectedMessage, " ", "_"), func(t *testing.T) {
			t.Parallel()

			_, err := service.Diff(context.Background(), DiffRequest{
				Path: testCase.path,
				Mode: DiffModeUnstaged,
			})
			var serviceErr *Error
			if !errors.As(err, &serviceErr) {
				t.Fatalf("expected gitread error, got %v", err)
			}
			if serviceErr.Kind != ErrorInvalidRequest || serviceErr.Message != testCase.expectedMessage {
				t.Fatalf("unexpected path validation error %#v", serviceErr)
			}
		})
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

func TestServiceLogReturnsEmptyHistoryForUnbornHead(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("git"); err != nil {
		t.Fatalf("git not found: %v", err)
	}

	repoRoot := t.TempDir()
	runGitReadCommand(t, repoRoot, "init")
	runGitReadCommand(t, repoRoot, "config", "user.email", "a@example.com")
	runGitReadCommand(t, repoRoot, "config", "user.name", "A")

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	response, err := service.Log(context.Background(), LogRequest{
		Rev:      "HEAD",
		AllRefs:  false,
		Offset:   0,
		PageSize: 20,
	})
	if err != nil {
		t.Fatalf("log unborn head: %v", err)
	}
	if len(response.Commits) != 0 {
		t.Fatalf("expected no commits for unborn head, got %#v", response.Commits)
	}
	if response.HasMore {
		t.Fatalf("expected hasMore=false for unborn head, got %#v", response)
	}
	if response.NextOffset != nil {
		t.Fatalf("expected nextOffset=nil for unborn head, got %#v", response.NextOffset)
	}
	if response.IsCapped {
		t.Fatalf("expected isCapped=false for unborn head, got %#v", response)
	}
}

func TestServiceLogSanitizesDecorationsWhenFallbackRefScanTruncates(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	headHash := strings.Repeat("a", 40)
	logOutputPath := filepath.Join(t.TempDir(), "log.out")
	if err := os.WriteFile(
		logOutputPath,
		[]byte(headHash+"\x00\x00A\x00a@example.com\x001700000000\x00subject\x00%(decorate:prefix=,suffix=,separator=\x1d)\x1dfeature/local\x1d)\x00"),
		0o644,
	); err != nil {
		t.Fatalf("write log output: %v", err)
	}
	truncatedRefsPath := filepath.Join(t.TempDir(), "refs.out")
	if err := os.WriteFile(
		truncatedRefsPath,
		[]byte(strings.Repeat(headHash+"\x00\x00refs/heads/feature/local\x00\x00\n", 90000)),
		0o644,
	); err != nil {
		t.Fatalf("write truncated refs output: %v", err)
	}

	service := newCustomGitReadService(t, workspaceRoot, []string{
		"case \"${1:-}\" in",
		"  rev-parse)",
		"    if [ \"${2:-}\" = \"--show-toplevel\" ]; then",
		"      printf '%s\\n' '" + workspaceRoot + "'",
		"      exit 0",
		"    fi",
		"    if [ \"${2:-}\" = \"--abbrev-ref\" ]; then",
		"      printf 'main\\n" + headHash + "\\n'",
		"      exit 0",
		"    fi",
		"    if [ \"${2:-}\" = \"--verify\" ]; then",
		"      printf '%s\\n' '" + headHash + "'",
		"      exit 0",
		"    fi",
		"    ;;",
		"  log)",
		"    cat '" + logOutputPath + "'",
		"    exit 0",
		"    ;;",
		"  for-each-ref)",
		"    cat '" + truncatedRefsPath + "'",
		"    exit 0",
		"    ;;",
		"esac",
		"exit 1",
	})

	response, err := service.Log(context.Background(), LogRequest{
		Rev:      "HEAD",
		AllRefs:  false,
		Offset:   0,
		PageSize: 20,
	})
	if err != nil {
		t.Fatalf("log decorations fallback: %v", err)
	}
	if len(response.Commits) != 1 {
		t.Fatalf("expected one commit, got %#v", response.Commits)
	}
	decorations := response.Commits[0].Decorations
	if !containsString(decorations, "feature/local") {
		t.Fatalf("expected sanitized local ref decoration, got %#v", decorations)
	}
	for _, decoration := range decorations {
		if strings.HasPrefix(decoration, "%(decorate:prefix=,suffix=,separator=") || decoration == ")" {
			t.Fatalf("expected unexpanded decorate atoms to be stripped, got %#v", decorations)
		}
	}
}

func TestServiceCommitDetailsFallsBackWhenTruncatedMetadataIsIncomplete(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	commitHash := strings.Repeat("b", 40)
	truncatedShowPath := filepath.Join(t.TempDir(), "show.out")
	if err := os.WriteFile(
		truncatedShowPath,
		[]byte(commitHash+"\x00\x00A\x00a@example.com"+strings.Repeat("x", maxShowBytes)),
		0o644,
	); err != nil {
		t.Fatalf("write truncated show output: %v", err)
	}
	metadataFallbackPath := filepath.Join(t.TempDir(), "metadata.out")
	if err := os.WriteFile(
		metadataFallbackPath,
		[]byte(commitHash+"\x00\x00A\x00a@example.com\x001700000000\x00A\x00a@example.com\x001700000000\x00subject\x00body\x00"),
		0o644,
	); err != nil {
		t.Fatalf("write fallback metadata output: %v", err)
	}

	service := newCustomGitReadService(t, workspaceRoot, []string{
		"case \"${1:-}\" in",
		"  rev-parse)",
		"    if [ \"${2:-}\" = \"--show-toplevel\" ]; then",
		"      printf '%s\\n' '" + workspaceRoot + "'",
		"      exit 0",
		"    fi",
		"    if [ \"${2:-}\" = \"--verify\" ]; then",
		"      printf '%s\\n' '" + commitHash + "'",
		"      exit 0",
		"    fi",
		"    ;;",
		"  show)",
		"    if [ \"${6:-}\" = \"--no-patch\" ]; then",
		"      cat '" + metadataFallbackPath + "'",
		"      exit 0",
		"    fi",
		"    cat '" + truncatedShowPath + "'",
		"    exit 0",
		"    ;;",
		"esac",
		"exit 1",
	})

	response, err := service.CommitDetails(context.Background(), CommitDetailsRequest{CommitHash: commitHash})
	if err != nil {
		t.Fatalf("commit details fallback: %v", err)
	}
	if !response.IsTruncated {
		t.Fatalf("expected truncated fallback response, got %#v", response)
	}
	if response.Subject != "subject" || response.Body != "body" {
		t.Fatalf("expected fallback metadata to survive, got %#v", response)
	}
	if len(response.Files) != 0 {
		t.Fatalf("expected incomplete truncated metadata fallback to drop diff files, got %#v", response.Files)
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

func TestServiceCommitDetailsAndFileDiffRejectInvalidCommitHashes(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, err = service.CommitDetails(context.Background(), CommitDetailsRequest{CommitHash: "not-a-commit"})
	var serviceErr *Error
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected gitread error for commit details, got %v", err)
	}
	if serviceErr.Kind != ErrorInvalidCommit || serviceErr.Message != "Invalid commit hash." {
		t.Fatalf("unexpected commit-details error %#v", serviceErr)
	}

	_, err = service.CommitFileDiff(context.Background(), CommitFileDiffRequest{
		CommitHash: "not-a-commit",
		Path:       "tracked.txt",
	})
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected gitread error for commit diff, got %v", err)
	}
	if serviceErr.Kind != ErrorInvalidCommit || serviceErr.Message != "Invalid commit hash." {
		t.Fatalf("unexpected commit-diff error %#v", serviceErr)
	}
}

func TestServiceCommitDetailsSetsTruncationFlagForLargeOutput(t *testing.T) {
	commitHash := strings.Repeat("a", 40)
	showOutput := buildLargeCommitDetailsOutput(commitHash, 45000)
	service := newScriptedGitService(t, "", showOutput, commitHash)

	response, err := service.CommitDetails(context.Background(), CommitDetailsRequest{CommitHash: commitHash})
	if err != nil {
		t.Fatalf("commit details: %v", err)
	}
	if !response.IsTruncated {
		t.Fatalf("expected truncated commit details response, got %#v", response)
	}
	if response.Subject != "big commit" {
		t.Fatalf("expected commit subject to survive truncation, got %#v", response)
	}
	if len(response.Files) == 0 {
		t.Fatalf("expected partial changed-file list to survive truncation, got %#v", response)
	}
}

func TestServiceDiffAndCommitFileDiffDisableExternalDiffAndTextconv(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	externalDiffMarker := filepath.Join(t.TempDir(), "external-diff.marker")
	textconvMarker := filepath.Join(t.TempDir(), "textconv.marker")
	externalDiffScript := writeGitReadExecutableScript(t, strings.Join([]string{
		"#!/bin/sh",
		"set -eu",
		"touch '" + externalDiffMarker + "'",
		"printf 'external diff should not run\\n'",
	}, "\n"))
	textconvScript := writeGitReadExecutableScript(t, strings.Join([]string{
		"#!/bin/sh",
		"set -eu",
		"touch '" + textconvMarker + "'",
		"printf 'TEXTCONV(%s)\\n' \"$1\"",
	}, "\n"))

	writeFile(t, filepath.Join(repoRoot, ".gitattributes"), "*.txt diff=test\n")
	runGitReadCommand(t, repoRoot, "config", "diff.external", externalDiffScript)
	runGitReadCommand(t, repoRoot, "config", "diff.test.textconv", textconvScript)
	runGitReadCommand(t, repoRoot, "add", ".gitattributes")
	runGitReadCommand(t, repoRoot, "commit", "-m", "configure diff drivers")

	writeFile(t, filepath.Join(repoRoot, "tracked.txt"), "two\n")

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	diffResponse, err := service.Diff(context.Background(), DiffRequest{
		Path: "tracked.txt",
		Mode: DiffModeUnstaged,
	})
	if err != nil {
		t.Fatalf("unstaged diff: %v", err)
	}
	if !strings.Contains(diffResponse.Diff, "diff --git a/tracked.txt b/tracked.txt") || !strings.Contains(diffResponse.Diff, "-one") || !strings.Contains(diffResponse.Diff, "+two") {
		t.Fatalf("expected builtin diff patch output, got %q", diffResponse.Diff)
	}

	runGitReadCommand(t, repoRoot, "add", "tracked.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "update tracked")
	commitHash := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))

	commitDiffResponse, err := service.CommitFileDiff(context.Background(), CommitFileDiffRequest{
		CommitHash: commitHash,
		Path:       "tracked.txt",
	})
	if err != nil {
		t.Fatalf("commit file diff: %v", err)
	}
	if !strings.Contains(commitDiffResponse.Diff, "diff --git a/tracked.txt b/tracked.txt") || !strings.Contains(commitDiffResponse.Diff, "-one") || !strings.Contains(commitDiffResponse.Diff, "+two") {
		t.Fatalf("expected builtin commit file diff patch output, got %q", commitDiffResponse.Diff)
	}

	if _, err := os.Stat(externalDiffMarker); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected external diff script to stay unused, stat err=%v", err)
	}
	if _, err := os.Stat(textconvMarker); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected textconv script to stay unused, stat err=%v", err)
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

func initGitReadHistoryCapRepo(t *testing.T, totalCommits int) string {
	t.Helper()

	if _, err := exec.LookPath("git"); err != nil {
		t.Fatalf("git not found: %v", err)
	}

	repoRoot := t.TempDir()
	runGitReadCommand(t, repoRoot, "init")
	runGitReadCommand(t, repoRoot, "symbolic-ref", "HEAD", "refs/heads/main")

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

func newScriptedGitService(t *testing.T, statusOutput string, showOutput string, commitHash string) *Service {
	t.Helper()

	workspaceRoot := t.TempDir()
	statusPath := filepath.Join(t.TempDir(), "status.out")
	showPath := filepath.Join(t.TempDir(), "show.out")
	if err := os.WriteFile(statusPath, []byte(statusOutput), 0o755); err != nil {
		t.Fatalf("write scripted status output: %v", err)
	}
	if err := os.WriteFile(showPath, []byte(showOutput), 0o755); err != nil {
		t.Fatalf("write scripted show output: %v", err)
	}

	scriptPath := filepath.Join(t.TempDir(), "git.sh")
	script := strings.Join([]string{
		"#!/bin/sh",
		"set -eu",
		"while [ $# -gt 0 ]; do",
		"  case \"${1:-}\" in",
		"    -c|-C)",
		"      shift 2",
		"      ;;",
		"    --no-pager)",
		"      shift 1",
		"      ;;",
		"    *)",
		"      break",
		"      ;;",
		"  esac",
		"done",
		"case \"${1:-}\" in",
		"  rev-parse)",
		"    if [ \"${2:-}\" = \"--show-toplevel\" ]; then",
		"      printf '%s\\n' '" + workspaceRoot + "'",
		"      exit 0",
		"    fi",
		"    if [ \"${2:-}\" = \"--verify\" ]; then",
		"      printf '%s\\n' '" + commitHash + "'",
		"      exit 0",
		"    fi",
		"    ;;",
		"  status)",
		"    cat '" + statusPath + "'",
		"    exit 0",
		"    ;;",
		"  worktree)",
		"    exit 0",
		"    ;;",
		"  show)",
		"    cat '" + showPath + "'",
		"    exit 0",
		"    ;;",
		"esac",
		"exit 1",
		"",
	}, "\n")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write scripted git wrapper: %v", err)
	}

	return &Service{workspaceRoot: workspaceRoot, gitBinary: scriptPath}
}

func newCustomGitReadService(t *testing.T, workspaceRoot string, bodyLines []string) *Service {
	t.Helper()

	scriptLines := append([]string{
		"#!/bin/sh",
		"set -eu",
		"while [ $# -gt 0 ]; do",
		"  case \"${1:-}\" in",
		"    -c|-C)",
		"      shift 2",
		"      ;;",
		"    --no-pager)",
		"      shift 1",
		"      ;;",
		"    *)",
		"      break",
		"      ;;",
		"  esac",
		"done",
	}, bodyLines...)

	return &Service{
		workspaceRoot: workspaceRoot,
		gitBinary:     writeGitReadExecutableScript(t, strings.Join(scriptLines, "\n")+"\n"),
	}
}

func writeGitReadExecutableScript(t *testing.T, contents string) string {
	t.Helper()

	scriptPath := filepath.Join(t.TempDir(), "git.sh")
	if err := os.WriteFile(scriptPath, []byte(contents), 0o755); err != nil {
		t.Fatalf("write executable script: %v", err)
	}
	return scriptPath
}

func buildLargeGitStatusOutput(entryCount int) string {
	var output strings.Builder
	output.WriteString("# branch.oid ")
	output.WriteString(strings.Repeat("a", 40))
	output.WriteByte(0)
	output.WriteString("# branch.head main")
	output.WriteByte(0)
	for index := 0; index < entryCount; index++ {
		output.WriteString("? deeply/nested/")
		output.WriteString(strings.Repeat("a", 40))
		output.WriteString(strconv.Itoa(index))
		output.WriteString(".txt")
		output.WriteByte(0)
	}
	return output.String()
}

func buildLargeCommitDetailsOutput(commitHash string, fileCount int) string {
	var output strings.Builder
	fields := []string{
		commitHash,
		strings.Repeat("b", 40),
		"A",
		"a@example.com",
		"1700000000",
		"A",
		"a@example.com",
		"1700000000",
		"big commit",
		"",
	}
	for _, field := range fields {
		output.WriteString(field)
		output.WriteByte(0)
	}
	for index := 0; index < fileCount; index++ {
		path := "deeply/nested/" + strings.Repeat("a", 24) + strconv.Itoa(index) + ".txt"
		output.WriteString(":100644 100644 1111111 2222222 M")
		output.WriteByte(0)
		output.WriteString(path)
		output.WriteByte(0)
	}
	for index := 0; index < fileCount; index++ {
		path := "deeply/nested/" + strings.Repeat("a", 24) + strconv.Itoa(index) + ".txt"
		output.WriteString("1\t1\t")
		output.WriteString(path)
		output.WriteByte(0)
	}
	return output.String()
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
