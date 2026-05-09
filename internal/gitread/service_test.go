package gitread

import (
	"context"
	"errors"
	"os"
	"path/filepath"
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
	assertGitStatusRepoMetadata(t, response, repoRoot)
	assertGitStatusEntries(t, response.Entries)
}

func assertGitStatusRepoMetadata(t *testing.T, response StatusResponse, repoRoot string) {
	t.Helper()

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
}

func assertGitStatusEntries(t *testing.T, entries []StatusEntry) {
	t.Helper()

	var stagedTracked bool
	var unstagedTracked bool
	var untrackedNew bool
	for _, entry := range entries {
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
		t.Fatalf("unexpected status entries %#v", entries)
	}
}

func TestParsePorcelainStatusHandlesRenameAndCopy(t *testing.T) {
	t.Parallel()

	output := strings.Join([]string{
		"# branch.oid abc123",
		"# branch.head main",
		"2 R. N... 100644 100644 100644 a b R100 new.txt",
		"old.txt",
		"2 C. N... 100644 100644 100644 a b C100 copy.txt",
		"source.txt",
		"? loose.txt",
		"",
	}, "\x00")

	entries := parsePorcelainStatus(output)
	if len(entries) != 3 {
		t.Fatalf("expected three parsed entries, got %#v", entries)
	}

	if entries[0].Kind != "staged" || entries[0].Path != "new.txt" || entries[0].OldPath == nil || *entries[0].OldPath != "old.txt" {
		t.Fatalf("unexpected rename entry %#v", entries[0])
	}
	if entries[1].Kind != "staged" || entries[1].Path != "copy.txt" || entries[1].OldPath == nil || *entries[1].OldPath != "source.txt" {
		t.Fatalf("unexpected copy entry %#v", entries[1])
	}
	if entries[2].Kind != "untracked" || entries[2].Path != "loose.txt" {
		t.Fatalf("unexpected untracked entry %#v", entries[2])
	}
}

func TestParsePorcelainStatusHandlesConflicts(t *testing.T) {
	t.Parallel()

	output := strings.Join([]string{
		"u DD N... 100644 100644 100644 100644 a b c conflicted.txt",
		"",
	}, "\x00")

	entries := parsePorcelainStatus(output)
	if len(entries) != 1 {
		t.Fatalf("expected one parsed entry, got %#v", entries)
	}
	if entries[0].Kind != "conflict" || entries[0].Path != "conflicted.txt" || entries[0].IndexStatus != "D" || entries[0].WorktreeStatus != "D" {
		t.Fatalf("unexpected conflict entry %#v", entries[0])
	}
}

func TestParsePorcelainStatusSkipsMalformedTrackedRecords(t *testing.T) {
	t.Parallel()

	output := strings.Join([]string{
		"1 M. too-short",
		"2 R. too-short",
		"old.txt",
		"? loose.txt",
		"",
	}, "\x00")

	entries := parsePorcelainStatus(output)
	if len(entries) != 1 {
		t.Fatalf("expected only untracked entry to survive malformed records, got %#v", entries)
	}
	if entries[0].Kind != "untracked" || entries[0].Path != "loose.txt" {
		t.Fatalf("unexpected remaining entry %#v", entries[0])
	}
}

func TestSynthesizeUntrackedDiffHandlesTextAndBinaryFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	textPath := filepath.Join(root, "note.txt")
	writeFile(t, textPath, "hello")

	textDiff, isTruncated, err := synthesizeUntrackedDiff("note.txt", textPath, false)
	if err != nil {
		t.Fatalf("text synth diff: %v", err)
	}
	if isTruncated {
		t.Fatalf("expected small text diff to avoid truncation")
	}
	if !strings.Contains(textDiff, "new file mode 100644") || !strings.Contains(textDiff, "+hello") || !strings.Contains(textDiff, "\\ No newline at end of file") {
		t.Fatalf("unexpected text synth diff %q", textDiff)
	}

	binaryPath := filepath.Join(root, "blob.bin")
	if err := os.WriteFile(binaryPath, []byte{0x00, 0x01, 0x02}, 0o644); err != nil {
		t.Fatalf("write binary file: %v", err)
	}

	binaryDiff, isTruncated, err := synthesizeUntrackedDiff("blob.bin", binaryPath, false)
	if err != nil {
		t.Fatalf("binary synth diff: %v", err)
	}
	if isTruncated {
		t.Fatalf("expected small binary diff to avoid truncation")
	}
	if !strings.Contains(binaryDiff, "GIT binary patch") || !strings.Contains(binaryDiff, "(binary file, diff omitted)") {
		t.Fatalf("unexpected binary synth diff %q", binaryDiff)
	}
}

func TestTrimToLastCompleteNULRecordDiscardsPartialTail(t *testing.T) {
	t.Parallel()

	trimmed := trimToLastCompleteNULRecord("?? a.txt\x00 M b.txt\x00?? partial")
	if trimmed != "?? a.txt\x00 M b.txt\x00" {
		t.Fatalf("unexpected trimmed output %q", trimmed)
	}
}

func TestParsePorcelainHeadBranchParsesNormalAndDetachedStates(t *testing.T) {
	t.Parallel()

	if branch := parsePorcelainHeadBranch("# branch.oid abc123\x00# branch.head main\x00"); branch != "main" {
		t.Fatalf("expected attached branch main, got %q", branch)
	}
	if branch := parsePorcelainHeadBranch("# branch.oid (initial)\x00# branch.head feature/new\x00"); branch != "feature/new" {
		t.Fatalf("expected initial branch feature/new, got %q", branch)
	}
	if branch := parsePorcelainHeadBranch("# branch.head (detached)\x00"); branch != "" {
		t.Fatalf("expected detached branch to map to empty string, got %q", branch)
	}
}

func TestParsePorcelainHeadCommitParsesOIDAndInitialState(t *testing.T) {
	t.Parallel()

	if headCommit := parsePorcelainHeadCommit("# branch.oid abc123\x00# branch.head main\x00"); headCommit != "abc123" {
		t.Fatalf("expected head commit abc123, got %q", headCommit)
	}
	if headCommit := parsePorcelainHeadCommit("# branch.oid (initial)\x00"); headCommit != "" {
		t.Fatalf("expected initial branch.oid to map to empty string, got %q", headCommit)
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

func TestServiceRunGitTruncatesStdoutAtRequestedCap(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	service := newCustomGitReadService(t, workspaceRoot, []string{
		"case \"${1:-}\" in",
		"  status)",
		"    i=0",
		"    while [ \"$i\" -lt 200 ]; do",
		"      printf '?? untracked-%03d.txt\\0' \"$i\"",
		"      i=$((i + 1))",
		"    done",
		"    exit 0",
		"    ;;",
		"esac",
		"exit 1",
	})

	result, err := service.runGit(
		context.Background(),
		workspaceRoot,
		[]string{"status"},
		statusTimeout,
		64,
		maxCommandErrBytes,
	)
	if err != nil {
		t.Fatalf("run git: %v", err)
	}
	if !result.stdoutTruncated {
		t.Fatalf("expected stdout truncation, got %#v", result)
	}
	if len([]byte(result.stdout)) > 64 {
		t.Fatalf("expected capped stdout length <= 64, got %d", len([]byte(result.stdout)))
	}
	if result.timedOut {
		t.Fatalf("expected truncation cancel, not timeout: %#v", result)
	}
}

func TestServiceRunGitTruncatesStderrAtRequestedCap(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	service := newCustomGitReadService(t, workspaceRoot, []string{
		"case \"${1:-}\" in",
		"  definitely-not-a-command)",
		"    i=0",
		"    while [ \"$i\" -lt 100 ]; do",
		"      printf 'fatal: definitely-not-a-command line %03d\\n' \"$i\" >&2",
		"      i=$((i + 1))",
		"    done",
		"    exit 1",
		"    ;;",
		"esac",
		"exit 1",
	})

	result, err := service.runGit(
		context.Background(),
		workspaceRoot,
		[]string{"definitely-not-a-command"},
		statusTimeout,
		64,
		24,
	)
	if err != nil {
		t.Fatalf("run git: %v", err)
	}
	if !result.stderrTruncated {
		t.Fatalf("expected stderr truncation, got %#v", result)
	}
	if len([]byte(result.stderr)) > 24 {
		t.Fatalf("expected capped stderr length <= 24, got %d", len([]byte(result.stderr)))
	}
	if result.timedOut {
		t.Fatalf("expected truncation cancel, not timeout: %#v", result)
	}
}

func TestServiceStatusParsesHeadMetadataFromPorcelainV2WithoutExtraRevParse(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	headCommit := strings.Repeat("a", 40)
	service := newCustomGitReadService(t, workspaceRoot, []string{
		"case \"${1:-}\" in",
		"  rev-parse)",
		"    if [ \"${2:-}\" = \"--show-toplevel\" ]; then",
		"      printf '%s\\n' '" + workspaceRoot + "'",
		"      exit 0",
		"    fi",
		"    printf 'unexpected rev-parse invocation\\n' >&2",
		"    exit 1",
		"    ;;",
		"  status)",
		"    printf '# branch.oid " + headCommit + "\\0# branch.head main\\0? tracked.txt\\0'",
		"    exit 0",
		"    ;;",
		"  worktree)",
		"    printf 'worktree " + workspaceRoot + "\\0HEAD " + headCommit + "\\0branch refs/heads/main\\0\\0'",
		"    exit 0",
		"    ;;",
		"esac",
		"exit 1",
	})

	response, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if response.Repo.HeadBranch == nil || *response.Repo.HeadBranch != "main" {
		t.Fatalf("expected head branch main, got %#v", response.Repo.HeadBranch)
	}
	if response.Repo.HeadCommit == nil || *response.Repo.HeadCommit != headCommit {
		t.Fatalf("expected head commit %q, got %#v", headCommit, response.Repo.HeadCommit)
	}
	if len(response.Entries) != 1 || response.Entries[0].Path != "tracked.txt" {
		t.Fatalf("expected tracked status entry, got %#v", response.Entries)
	}
}

func TestServiceStatusTrimsPartialTrailingRecordWhenStatusOutputEndsMidToken(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	headCommit := "abc123"
	service := newCustomGitReadService(t, workspaceRoot, []string{
		"case \"${1:-}\" in",
		"  rev-parse)",
		"    if [ \"${2:-}\" = \"--show-toplevel\" ]; then",
		"      printf '%s\\n' '" + workspaceRoot + "'",
		"      exit 0",
		"    fi",
		"    exit 1",
		"    ;;",
		"  status)",
		"    printf '# branch.oid " + headCommit + "\\0# branch.head main\\0'",
		"    printf '1 .M N... 100644 100644 100644 a b tracked.txt\\0? complete.txt\\0? partial'",
		"    exit 0",
		"    ;;",
		"  worktree)",
		"    exit 0",
		"    ;;",
		"esac",
		"exit 1",
	})

	response, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if response.Repo.HeadBranch == nil || *response.Repo.HeadBranch != "main" {
		t.Fatalf("expected head branch main, got %#v", response.Repo.HeadBranch)
	}
	if response.Repo.HeadCommit == nil || *response.Repo.HeadCommit != headCommit {
		t.Fatalf("expected head commit %q, got %#v", headCommit, response.Repo.HeadCommit)
	}
	if len(response.Entries) != 2 {
		t.Fatalf("expected only complete status entries, got %#v", response.Entries)
	}
	paths := []string{response.Entries[0].Path, response.Entries[1].Path}
	if !(paths[0] == "tracked.txt" && paths[1] == "complete.txt") && !(paths[0] == "complete.txt" && paths[1] == "tracked.txt") {
		t.Fatalf("unexpected complete status paths %#v", paths)
	}
}

func TestServiceStatusAllowsModeratelySlowRepoLookup(t *testing.T) {
	workspaceRoot := t.TempDir()
	service := newCustomGitReadService(t, workspaceRoot, []string{
		"case \"${1:-}\" in",
		"  rev-parse)",
		"    sleep 2",
		"    if [ \"${2:-}\" = \"--show-toplevel\" ]; then",
		"      printf '%s\\n' '" + workspaceRoot + "'",
		"      exit 0",
		"    fi",
		"    if [ \"${2:-}\" = \"--verify\" ]; then",
		"      printf '%s\\n' '" + strings.Repeat("a", 40) + "'",
		"      exit 0",
		"    fi",
		"    ;;",
		"  status)",
		"    printf '# branch.oid " + strings.Repeat("a", 40) + "\\0# branch.head main\\0'",
		"    exit 0",
		"    ;;",
		"  worktree)",
		"    exit 0",
		"    ;;",
		"esac",
		"exit 1",
	})

	response, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status with slow repo lookup: %v", err)
	}
	if !response.Repo.IsGitRepo {
		t.Fatalf("expected slow repo lookup to preserve git repo metadata, got %#v", response)
	}
	if response.Repo.HeadBranch == nil || *response.Repo.HeadBranch != "main" {
		t.Fatalf("expected head branch main after slow repo lookup, got %#v", response.Repo.HeadBranch)
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
	assertPorcelainWorktreeMain(t, worktrees[0])
	assertPorcelainWorktreeFeature(t, worktrees[1])
}

func assertPorcelainWorktreeMain(t *testing.T, worktree GitWorktreeEntry) {
	t.Helper()

	if worktree.Path != "/tmp/setta" || worktree.DisplayName != "main" {
		t.Fatalf("unexpected first worktree %#v", worktree)
	}
	if worktree.BranchName == nil || *worktree.BranchName != "main" {
		t.Fatalf("expected main branch, got %#v", worktree.BranchName)
	}
	if worktree.HeadCommit == nil || *worktree.HeadCommit != "abc1234567890" {
		t.Fatalf("expected first head commit, got %#v", worktree.HeadCommit)
	}
	if worktree.IsCurrent || worktree.IsPrunable || worktree.PrunableReason != nil {
		t.Fatalf("unexpected first worktree flags %#v", worktree)
	}
}

func assertPorcelainWorktreeFeature(t *testing.T, worktree GitWorktreeEntry) {
	t.Helper()

	if worktree.Path != "/tmp/setta.feature-x" || worktree.DisplayName != "feature-x" {
		t.Fatalf("unexpected second worktree %#v", worktree)
	}
	if worktree.BranchName != nil {
		t.Fatalf("expected detached branch, got %#v", worktree.BranchName)
	}
	if worktree.HeadCommit == nil || *worktree.HeadCommit != "def0987654321" {
		t.Fatalf("expected second head commit, got %#v", worktree.HeadCommit)
	}
	if !worktree.IsCurrent || !worktree.IsPrunable {
		t.Fatalf("expected current prunable worktree, got %#v", worktree)
	}
	if worktree.PrunableReason == nil || *worktree.PrunableReason != "gitdir file points to non-existent location" {
		t.Fatalf("unexpected prunable reason %#v", worktree.PrunableReason)
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

func TestServiceStatusKeepsPrimaryStatusWhenWorktreeListingFails(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	headCommit := "abc123"
	service := newCustomGitReadService(t, workspaceRoot, []string{
		"case \"${1:-}\" in",
		"  rev-parse)",
		"    if [ \"${2:-}\" = \"--show-toplevel\" ]; then",
		"      printf '%s\\n' '" + workspaceRoot + "'",
		"      exit 0",
		"    fi",
		"    exit 1",
		"    ;;",
		"  status)",
		"    printf '# branch.oid " + headCommit + "\\0# branch.head main\\0'",
		"    printf '1 .M N... 100644 100644 100644 a b tracked.txt\\0'",
		"    exit 0",
		"    ;;",
		"  worktree)",
		"    printf 'worktree failed\\n' >&2",
		"    exit 1",
		"    ;;",
		"esac",
		"exit 1",
	})

	response, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if response.Repo.HeadBranch == nil || *response.Repo.HeadBranch != "main" {
		t.Fatalf("expected head branch main, got %#v", response.Repo.HeadBranch)
	}
	if response.Repo.HeadCommit == nil || *response.Repo.HeadCommit != headCommit {
		t.Fatalf("expected head commit %q, got %#v", headCommit, response.Repo.HeadCommit)
	}
	if len(response.Entries) != 1 || response.Entries[0].Path != "tracked.txt" {
		t.Fatalf("expected tracked status entry, got %#v", response.Entries)
	}
	if len(response.Worktrees) != 0 {
		t.Fatalf("expected empty worktrees on worktree-list failure, got %#v", response.Worktrees)
	}
	if response.IsTruncated {
		t.Fatalf("expected non-truncated status response, got %#v", response)
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

func TestServiceDiffRejectsRepoRootAndUntrackedDirectoriesAsNonFiles(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	untrackedDir := filepath.Join(repoRoot, "new-dir")
	if err := os.MkdirAll(untrackedDir, 0o755); err != nil {
		t.Fatalf("mkdir untracked dir: %v", err)
	}
	writeFile(t, filepath.Join(untrackedDir, "inside.txt"), "x\n")

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	for _, path := range []string{".", "new-dir"} {
		_, err := service.Diff(context.Background(), DiffRequest{
			Path: path,
			Mode: DiffModeUnstaged,
		})
		var serviceErr *Error
		if !errors.As(err, &serviceErr) {
			t.Fatalf("expected gitread error for %q, got %v", path, err)
		}
		if serviceErr.Kind != ErrorPathNotFile || serviceErr.Message != "Path must point to a file." {
			t.Fatalf("unexpected non-file error for %q: %#v", path, serviceErr)
		}
	}
}

func TestServiceDiffPreservesLeadingSpacesAndRejectsSymlinkEscapes(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	spacedName := " leading.txt"
	writeFile(t, filepath.Join(repoRoot, spacedName), "one\n")
	runGitReadCommand(t, repoRoot, "add", spacedName)
	runGitReadCommand(t, repoRoot, "commit", "-m", "add leading-space file")
	writeFile(t, filepath.Join(repoRoot, spacedName), "two\n")

	outsideRoot := t.TempDir()
	outsidePath := filepath.Join(outsideRoot, "outside.txt")
	writeFile(t, outsidePath, "outside\n")
	symlinkName := "link-out.txt"
	if err := os.Symlink(outsidePath, filepath.Join(repoRoot, symlinkName)); err != nil {
		t.Fatalf("create symlink: %v", err)
	}

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	diffResponse, err := service.Diff(context.Background(), DiffRequest{
		Path: spacedName,
		Mode: DiffModeUnstaged,
	})
	if err != nil {
		t.Fatalf("diff leading-space path: %v", err)
	}
	if diffResponse.Path != spacedName {
		t.Fatalf("expected leading-space path to round-trip, got %#v", diffResponse)
	}
	if !strings.Contains(diffResponse.Diff, "diff --git a/ leading.txt b/ leading.txt") || !strings.Contains(diffResponse.Diff, "-one") || !strings.Contains(diffResponse.Diff, "+two") {
		t.Fatalf("expected literal leading-space diff, got %q", diffResponse.Diff)
	}

	_, err = service.Diff(context.Background(), DiffRequest{
		Path: symlinkName,
		Mode: DiffModeUnstaged,
	})
	var serviceErr *Error
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected gitread error for symlink diff, got %v", err)
	}
	if serviceErr.Kind != ErrorPathForbidden || serviceErr.Message != "Symlink paths are not supported for synthesized diffs." {
		t.Fatalf("unexpected symlink diff error %#v", serviceErr)
	}
}

func TestServiceDiffAllowsTrackedSymlinkPathspecOutsideRepo(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	outsideRoot := t.TempDir()
	oldTarget := filepath.Join(outsideRoot, "old-target.txt")
	newTarget := filepath.Join(outsideRoot, "new-target.txt")
	writeFile(t, oldTarget, "old\n")
	writeFile(t, newTarget, "new\n")

	symlinkName := "outside-link.txt"
	symlinkPath := filepath.Join(repoRoot, symlinkName)
	if err := os.Symlink(oldTarget, symlinkPath); err != nil {
		t.Fatalf("create tracked symlink: %v", err)
	}
	runGitReadCommand(t, repoRoot, "add", symlinkName)
	runGitReadCommand(t, repoRoot, "commit", "-m", "add tracked symlink")
	if err := os.Remove(symlinkPath); err != nil {
		t.Fatalf("remove tracked symlink: %v", err)
	}
	if err := os.Symlink(newTarget, symlinkPath); err != nil {
		t.Fatalf("recreate tracked symlink: %v", err)
	}

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	response, err := service.Diff(context.Background(), DiffRequest{
		Path: symlinkName,
		Mode: DiffModeUnstaged,
	})
	if err != nil {
		t.Fatalf("tracked symlink diff: %v", err)
	}
	if response.Path != symlinkName {
		t.Fatalf("expected tracked symlink path to round-trip, got %#v", response)
	}
	if !strings.Contains(response.Diff, "diff --git a/outside-link.txt b/outside-link.txt") {
		t.Fatalf("expected tracked symlink diff header, got %q", response.Diff)
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

func TestServiceLogNonInitialPageSkipsHeadBranchLookup(t *testing.T) {
	t.Parallel()

	// Later log pages should not perform the extra head-branch lookup, even though the Go
	// service still resolves the repo root per request through repoRootOrNone.
	workspaceRoot := t.TempDir()
	commandsPath := filepath.Join(t.TempDir(), "commands.log")
	logOutputPath := filepath.Join(t.TempDir(), "log.out")
	logOutput := strings.Join([]string{
		strings.Repeat("a", 40) + "\x00\x00A\x00a@example.com\x001700000000\x00subject-1\x00\x00",
		strings.Repeat("b", 40) + "\x00\x00A\x00a@example.com\x001700000001\x00subject-2\x00\x00",
	}, "")
	if err := os.WriteFile(logOutputPath, []byte(logOutput), 0o644); err != nil {
		t.Fatalf("write log output: %v", err)
	}

	service := newCustomGitReadService(t, workspaceRoot, []string{
		"printf '%s\\n' \"$*\" >> '" + commandsPath + "'",
		"case \"${1:-}\" in",
		"  rev-parse)",
		"    if [ \"${2:-}\" = \"--show-toplevel\" ]; then",
		"      printf '%s\\n' '" + workspaceRoot + "'",
		"      exit 0",
		"    fi",
		"    printf 'unexpected rev-parse invocation\\n' >&2",
		"    exit 1",
		"    ;;",
		"  log)",
		"    cat '" + logOutputPath + "'",
		"    exit 0",
		"    ;;",
		"esac",
		"exit 1",
	})

	response, err := service.Log(context.Background(), LogRequest{
		Rev:      "HEAD",
		AllRefs:  false,
		Offset:   2,
		PageSize: 2,
	})
	if err != nil {
		t.Fatalf("log later page: %v", err)
	}
	if response.HeadBranch != nil {
		t.Fatalf("expected no head branch on later page, got %#v", response.HeadBranch)
	}

	commandsRaw, err := os.ReadFile(commandsPath)
	if err != nil {
		t.Fatalf("read commands: %v", err)
	}
	commandsText := string(commandsRaw)
	if !strings.Contains(commandsText, "rev-parse --show-toplevel") {
		t.Fatalf("expected repo-root lookup command, got %q", commandsText)
	}
	if strings.Contains(commandsText, "--abbrev-ref") || strings.Contains(commandsText, " --verify ") {
		t.Fatalf("expected no head lookup or revision verification on later page, got %q", commandsText)
	}
}
