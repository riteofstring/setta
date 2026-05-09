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

func TestServiceLogReportsCapBoundaryAndHighOffsetBehavior(t *testing.T) {
	t.Parallel()

	// At the history cap boundary the log should expose the final partial page, stop
	// pagination once older history exists beyond the cap, and avoid claiming a cap in
	// small repos that have no hidden history beyond that boundary.
	cappedRepo := initGitReadHistoryCapRepo(t, maxLogCount+1)
	cappedService, err := NewService(ServiceOptions{WorkspaceRoot: cappedRepo})
	if err != nil {
		t.Fatalf("new capped service: %v", err)
	}

	first, err := cappedService.Log(context.Background(), LogRequest{
		Rev:      "HEAD",
		AllRefs:  false,
		Offset:   maxLogCount - 5,
		PageSize: 4,
	})
	if err != nil {
		t.Fatalf("capped log first page: %v", err)
	}
	if len(first.Commits) != 4 || !first.HasMore || first.NextOffset == nil || *first.NextOffset != maxLogCount-1 || first.IsCapped {
		t.Fatalf("unexpected capped first page %#v", first)
	}

	second, err := cappedService.Log(context.Background(), LogRequest{
		Rev:      "HEAD",
		AllRefs:  false,
		Offset:   maxLogCount - 1,
		PageSize: 4,
	})
	if err != nil {
		t.Fatalf("capped log second page: %v", err)
	}
	if len(second.Commits) != 1 || second.HasMore || second.NextOffset != nil || !second.IsCapped {
		t.Fatalf("unexpected capped second page %#v", second)
	}

	beyond, err := cappedService.Log(context.Background(), LogRequest{
		Rev:      "HEAD",
		AllRefs:  false,
		Offset:   maxLogCount + 99,
		PageSize: 4,
	})
	if err != nil {
		t.Fatalf("capped log beyond page: %v", err)
	}
	if len(beyond.Commits) != 0 || beyond.HasMore || beyond.NextOffset != nil || !beyond.IsCapped {
		t.Fatalf("unexpected capped beyond page %#v", beyond)
	}

	smallRepo := initGitReadTestRepo(t)
	smallService, err := NewService(ServiceOptions{WorkspaceRoot: smallRepo})
	if err != nil {
		t.Fatalf("new small service: %v", err)
	}

	smallBeyond, err := smallService.Log(context.Background(), LogRequest{
		Rev:      "HEAD",
		AllRefs:  false,
		Offset:   maxLogCount + 99,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("small log beyond page: %v", err)
	}
	if len(smallBeyond.Commits) != 0 || smallBeyond.HasMore || smallBeyond.NextOffset != nil || smallBeyond.IsCapped {
		t.Fatalf("unexpected small-repo beyond page %#v", smallBeyond)
	}
}

func TestServiceLogFallsBackWhenDecorateAtomIsUnexpanded(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	headHash := strings.Repeat("a", 40)
	logOutputPath := filepath.Join(t.TempDir(), "log.out")
	if err := os.WriteFile(
		logOutputPath,
		[]byte(headHash+"\x00\x00A\x00a@example.com\x001700000000\x00subject\x00%(decorate:prefix=,suffix=,separator=\x1d)\x00"),
		0o644,
	); err != nil {
		t.Fatalf("write log output: %v", err)
	}
	refsPath := filepath.Join(t.TempDir(), "refs.out")
	if err := os.WriteFile(
		refsPath,
		[]byte(
			headHash+"\x00\x00refs/heads/main\x00\x00\n"+
				headHash+"\x00\x00refs/tags/release,1\x00\x00\n",
		),
		0o644,
	); err != nil {
		t.Fatalf("write refs output: %v", err)
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
		"    cat '" + refsPath + "'",
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
	if !containsString(decorations, "HEAD -> main") || !containsString(decorations, "main") || !containsString(decorations, "tag: release,1") {
		t.Fatalf("expected fallback decorations, got %#v", decorations)
	}
	for _, decoration := range decorations {
		if strings.HasPrefix(decoration, "%(decorate:prefix=,suffix=,separator=") {
			t.Fatalf("expected unexpanded decorate atom to be replaced, got %#v", decorations)
		}
	}
}

func TestServiceLogRejectsInvalidRevision(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	testCases := []struct {
		name            string
		rev             string
		offset          int
		expectedMessage string
	}{
		{name: "unknown", rev: "does-not-exist", offset: 0, expectedMessage: "Invalid revision: does-not-exist"},
		{name: "high_offset_unknown", rev: "does-not-exist", offset: maxLogCount + 99, expectedMessage: "Invalid revision: does-not-exist"},
		{name: "option_like", rev: "-n1", offset: 0, expectedMessage: "Invalid revision."},
		{name: "contains_nul", rev: "HEAD\x00evil", offset: 0, expectedMessage: "Invalid revision."},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			_, err := service.Log(context.Background(), LogRequest{
				Rev:      testCase.rev,
				AllRefs:  false,
				Offset:   testCase.offset,
				PageSize: 20,
			})

			var serviceErr *Error
			if !errors.As(err, &serviceErr) {
				t.Fatalf("expected gitread error, got %v", err)
			}
			if serviceErr.Kind != ErrorInvalidRevision || serviceErr.Message != testCase.expectedMessage {
				t.Fatalf("unexpected revision error %#v", serviceErr)
			}
		})
	}
}

func TestServiceLogTruncatedWithoutParsedCommitsStopsPagination(t *testing.T) {
	t.Parallel()

	// If a truncated log payload contains no complete commit records, pagination should
	// stop instead of advertising a looping next page with zero parsed commits.
	workspaceRoot := t.TempDir()
	logOutputPath := filepath.Join(t.TempDir(), "log.out")
	repeatCount := maxLogBytes/len("partial-record-without-delimiters") + 2
	if err := os.WriteFile(logOutputPath, []byte(strings.Repeat("partial-record-without-delimiters", repeatCount)), 0o644); err != nil {
		t.Fatalf("write truncated log output: %v", err)
	}

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
		Offset:   1,
		PageSize: 2,
	})
	if err != nil {
		t.Fatalf("truncated log page: %v", err)
	}
	if len(response.Commits) != 0 || response.HasMore || response.NextOffset != nil {
		t.Fatalf("expected empty non-looping truncated page, got %#v", response)
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

func TestServiceCommitDetailsParsesTabPathsAndRenameNumstat(t *testing.T) {
	t.Parallel()

	// Commit details should preserve literal tabs in paths and pair pure-rename numstat
	// records with the renamed destination path when `git show -z` emits NUL delimiters.
	repoRoot := initGitReadTestRepo(t)

	tabPath := "tab\tname.txt"
	writeFile(t, filepath.Join(repoRoot, tabPath), "tab\n")
	runGitReadCommand(t, repoRoot, "add", tabPath)
	runGitReadCommand(t, repoRoot, "commit", "-m", "add tab path")
	tabCommit := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))

	writeFile(t, filepath.Join(repoRoot, "rename-src.txt"), "rename\n")
	runGitReadCommand(t, repoRoot, "add", "rename-src.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "add rename source")
	runGitReadCommand(t, repoRoot, "mv", "rename-src.txt", "rename-dst.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "rename source to dest")
	renameCommit := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	tabDetails, err := service.CommitDetails(context.Background(), CommitDetailsRequest{CommitHash: tabCommit})
	if err != nil {
		t.Fatalf("tab commit details: %v", err)
	}

	var tabEntry *CommitChangedFile
	for index := range tabDetails.Files {
		if tabDetails.Files[index].Path == tabPath {
			tabEntry = &tabDetails.Files[index]
			break
		}
	}
	if tabEntry == nil {
		t.Fatalf("expected tab path in %#v", tabDetails.Files)
	}
	if tabEntry.Status != "A" || tabEntry.Additions == nil || *tabEntry.Additions != 1 || tabEntry.Deletions == nil || *tabEntry.Deletions != 0 {
		t.Fatalf("unexpected tab path entry %#v", *tabEntry)
	}
	if tabDetails.IsTruncated {
		t.Fatalf("expected non-truncated tab-path details, got %#v", tabDetails)
	}

	renameDetails, err := service.CommitDetails(context.Background(), CommitDetailsRequest{CommitHash: renameCommit})
	if err != nil {
		t.Fatalf("rename commit details: %v", err)
	}

	var renameEntry *CommitChangedFile
	for index := range renameDetails.Files {
		if renameDetails.Files[index].Path == "rename-dst.txt" {
			renameEntry = &renameDetails.Files[index]
			break
		}
	}
	if renameEntry == nil {
		t.Fatalf("expected rename entry in %#v", renameDetails.Files)
	}
	if renameEntry.OldPath == nil || *renameEntry.OldPath != "rename-src.txt" || !strings.HasPrefix(renameEntry.Status, "R") {
		t.Fatalf("unexpected rename entry %#v", *renameEntry)
	}
	if renameEntry.Additions == nil || *renameEntry.Additions != 0 || renameEntry.Deletions == nil || *renameEntry.Deletions != 0 {
		t.Fatalf("expected pure rename numstat counts to stay zero, got %#v", *renameEntry)
	}
	if renameDetails.IsTruncated {
		t.Fatalf("expected non-truncated rename details, got %#v", renameDetails)
	}
}

func TestServiceCommitDetailsUsesSingleGitShowCall(t *testing.T) {
	t.Parallel()

	// Commit details should verify the commit hash once, then build the payload from a
	// single `git show --raw --numstat -z` subprocess so the route does not pay extra latency.
	workspaceRoot := t.TempDir()
	commitHash := strings.Repeat("c", 40)
	showArgsPath := filepath.Join(t.TempDir(), "show.args")
	showCountPath := filepath.Join(t.TempDir(), "show.count")
	showPayloadPath := filepath.Join(t.TempDir(), "show.out")
	showPayload := commitHash + "\x00" + strings.Repeat("b", 40) + "\x00A\x00a@example.com\x001700000000\x00A\x00a@example.com\x001700000000\x00subject\x00body\x00" +
		":100644 100644 1111111 2222222 M\x00tracked.txt\x00" +
		"1\t0\ttracked.txt\x00"
	if err := os.WriteFile(showPayloadPath, []byte(showPayload), 0o644); err != nil {
		t.Fatalf("write show payload: %v", err)
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
		"    count=0",
		"    if [ -f '" + showCountPath + "' ]; then",
		"      count=$(cat '" + showCountPath + "')",
		"    fi",
		"    count=$((count + 1))",
		"    printf '%s' \"$count\" > '" + showCountPath + "'",
		"    printf '%s\\n' \"$@\" > '" + showArgsPath + "'",
		"    cat '" + showPayloadPath + "'",
		"    exit 0",
		"    ;;",
		"esac",
		"exit 1",
	})

	response, err := service.CommitDetails(context.Background(), CommitDetailsRequest{CommitHash: commitHash})
	if err != nil {
		t.Fatalf("commit details: %v", err)
	}

	showCountRaw, err := os.ReadFile(showCountPath)
	if err != nil {
		t.Fatalf("read show count: %v", err)
	}
	if strings.TrimSpace(string(showCountRaw)) != "1" {
		t.Fatalf("expected one git show invocation, got %q", string(showCountRaw))
	}

	showArgsRaw, err := os.ReadFile(showArgsPath)
	if err != nil {
		t.Fatalf("read show args: %v", err)
	}
	showArgs := strings.Split(strings.TrimSpace(string(showArgsRaw)), "\n")
	for _, expectedArg := range []string{"--no-ext-diff", "--no-textconv", "--raw", "--numstat", "-z"} {
		if !containsString(showArgs, expectedArg) {
			t.Fatalf("expected show args %#v to include %q", showArgs, expectedArg)
		}
	}
	if response.CommitHash != commitHash || response.Subject != "subject" || response.IsTruncated {
		t.Fatalf("unexpected commit details response %#v", response)
	}
	if len(response.Files) != 1 || response.Files[0].Path != "tracked.txt" {
		t.Fatalf("expected tracked file in commit details, got %#v", response.Files)
	}
}

func TestServiceCommitDetailsPreservesControlSeparatorBytes(t *testing.T) {
	t.Parallel()

	// Commit details metadata is NUL-delimited, so legacy ASCII unit/record separator
	// bytes inside the subject/body should survive unchanged.
	repoRoot := initGitReadTestRepo(t)
	specialSubject := "subject-with-\x1f-unit-and-\x1e-record"
	specialBody := "body-line-1\x1fwith-unit\nbody-line-2\x1erecord"
	writeFile(t, filepath.Join(repoRoot, "separator-body.txt"), "separator-body\n")
	runGitReadCommand(t, repoRoot, "add", "separator-body.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", specialSubject, "-m", specialBody)
	commitHash := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	details, err := service.CommitDetails(context.Background(), CommitDetailsRequest{CommitHash: commitHash})
	if err != nil {
		t.Fatalf("commit details: %v", err)
	}
	if details.Subject != specialSubject {
		t.Fatalf("expected subject %q, got %#v", specialSubject, details)
	}
	if details.Body != specialBody {
		t.Fatalf("expected body %q, got %#v", specialBody, details)
	}
}

func TestServiceCommitFileDiffTreatsPathspecsAsLiteralAndRejectsDirectories(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadTestRepo(t)
	specialPath := "a[1].txt"
	plainPath := "a1.txt"
	writeFile(t, filepath.Join(repoRoot, specialPath), "one\n")
	writeFile(t, filepath.Join(repoRoot, plainPath), "one\n")
	runGitReadCommand(t, repoRoot, "add", specialPath, plainPath)
	runGitReadCommand(t, repoRoot, "commit", "-m", "add literal files")
	writeFile(t, filepath.Join(repoRoot, specialPath), "two\n")
	writeFile(t, filepath.Join(repoRoot, plainPath), "two\n")
	runGitReadCommand(t, repoRoot, "add", specialPath, plainPath)
	runGitReadCommand(t, repoRoot, "commit", "-m", "update literal files")
	literalCommit := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))

	nestedDir := filepath.Join(repoRoot, "dir")
	if err := os.MkdirAll(nestedDir, 0o755); err != nil {
		t.Fatalf("mkdir dir: %v", err)
	}
	writeFile(t, filepath.Join(nestedDir, "nested.txt"), "nested\n")
	runGitReadCommand(t, repoRoot, "add", "dir/nested.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "add nested")
	directoryCommit := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))

	spacedDir := filepath.Join(repoRoot, " dir")
	if err := os.MkdirAll(spacedDir, 0o755); err != nil {
		t.Fatalf("mkdir spaced dir: %v", err)
	}
	writeFile(t, filepath.Join(spacedDir, "inside.txt"), "inside\n")
	runGitReadCommand(t, repoRoot, "add", " dir/inside.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "add spaced directory")
	spacedDirectoryCommit := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	literalDiff, err := service.CommitFileDiff(context.Background(), CommitFileDiffRequest{
		CommitHash: literalCommit,
		Path:       specialPath,
	})
	if err != nil {
		t.Fatalf("literal commit file diff: %v", err)
	}
	if !strings.Contains(literalDiff.Diff, "diff --git a/a[1].txt b/a[1].txt") || strings.Contains(literalDiff.Diff, "diff --git a/a1.txt b/a1.txt") {
		t.Fatalf("unexpected literal commit diff %q", literalDiff.Diff)
	}

	for _, testCase := range []struct {
		path       string
		commitHash string
	}{
		{path: "dir", commitHash: directoryCommit},
		{path: " dir", commitHash: spacedDirectoryCommit},
	} {
		_, err := service.CommitFileDiff(context.Background(), CommitFileDiffRequest{
			CommitHash: testCase.commitHash,
			Path:       testCase.path,
		})
		var serviceErr *Error
		if !errors.As(err, &serviceErr) {
			t.Fatalf("expected gitread error for %q, got %v", testCase.path, err)
		}
		if serviceErr.Kind != ErrorPathNotFile || serviceErr.Message != "Path must point to a file." {
			t.Fatalf("unexpected directory pathspec error for %q: %#v", testCase.path, serviceErr)
		}
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

func TestServiceCommitDetailsAndFileDiffAcceptSHA256LengthHashesWhenGitVerifies(t *testing.T) {
	t.Parallel()

	repoRoot := initGitReadSHA256Repo(t)
	writeFile(t, filepath.Join(repoRoot, "tracked.txt"), "one\n")
	runGitReadCommand(t, repoRoot, "add", "tracked.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "add tracked")
	writeFile(t, filepath.Join(repoRoot, "tracked.txt"), "two\n")
	runGitReadCommand(t, repoRoot, "add", "tracked.txt")
	runGitReadCommand(t, repoRoot, "commit", "-m", "update tracked")
	commitHash := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "HEAD"))
	if len(commitHash) != 64 {
		t.Fatalf("expected sha256-length commit hash, got %q", commitHash)
	}

	service, err := NewService(ServiceOptions{WorkspaceRoot: repoRoot})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	details, err := service.CommitDetails(context.Background(), CommitDetailsRequest{CommitHash: commitHash})
	if err != nil {
		t.Fatalf("commit details: %v", err)
	}
	if details.CommitHash != commitHash {
		t.Fatalf("expected verified sha256 hash %q, got %#v", commitHash, details)
	}
	if len(details.Files) != 1 || details.Files[0].Path != "tracked.txt" {
		t.Fatalf("expected tracked file in sha256 commit details, got %#v", details.Files)
	}

	diffResponse, err := service.CommitFileDiff(context.Background(), CommitFileDiffRequest{
		CommitHash: commitHash,
		Path:       "tracked.txt",
	})
	if err != nil {
		t.Fatalf("commit file diff: %v", err)
	}
	if diffResponse.CommitHash != commitHash {
		t.Fatalf("expected verified sha256 hash on diff response, got %#v", diffResponse)
	}
	if !strings.Contains(diffResponse.Diff, "diff --git a/tracked.txt b/tracked.txt") || !strings.Contains(diffResponse.Diff, "-one") || !strings.Contains(diffResponse.Diff, "+two") {
		t.Fatalf("expected sha256 commit diff patch output, got %q", diffResponse.Diff)
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

func initGitReadSHA256Repo(t *testing.T) string {
	t.Helper()

	if _, err := exec.LookPath("git"); err != nil {
		t.Fatalf("git not found: %v", err)
	}

	repoRoot := t.TempDir()
	runGitReadCommand(t, repoRoot, "init", "--object-format=sha256")
	if format := strings.TrimSpace(runGitReadCommand(t, repoRoot, "rev-parse", "--show-object-format")); format != "sha256" {
		t.Fatalf("expected sha256 object format, got %q", format)
	}
	runGitReadCommand(t, repoRoot, "config", "user.email", "a@example.com")
	runGitReadCommand(t, repoRoot, "config", "user.name", "A")
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
