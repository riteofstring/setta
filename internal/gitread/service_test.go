package gitread

import (
	"context"
	"errors"
	"os"
	"os/exec"
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
