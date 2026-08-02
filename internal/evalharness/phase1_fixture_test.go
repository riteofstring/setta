package evalharness

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommittedPhase1FixtureExcludesIgnoredDeveloperState(t *testing.T) {
	repoRoot := t.TempDir()
	runPhase0ReportGit(t, repoRoot, "init", "--initial-branch=main")
	runPhase0ReportGit(t, repoRoot, "config", "user.email", "setta-eval@example.com")
	runPhase0ReportGit(t, repoRoot, "config", "user.name", "Setta Eval")
	writePhase0ReportTestFile(
		t,
		repoRoot,
		phase1FixtureRelativePath+"/.gitignore",
		"dist/\n",
	)
	writePhase0ReportTestFile(
		t,
		repoRoot,
		phase1FixtureRelativePath+"/src/server.ts",
		"committed\n",
	)
	runPhase0ReportGit(t, repoRoot, "add", "evals")
	runPhase0ReportGit(t, repoRoot, "commit", "-m", "add fixture")

	baseline, err := readCommittedPhase1Fixture(context.Background(), repoRoot)
	if err != nil {
		t.Fatalf("read committed fixture: %v", err)
	}
	baselineDigest, err := hashManifestSnapshot(baseline)
	if err != nil {
		t.Fatalf("hash committed fixture: %v", err)
	}
	ignoredPath := filepath.Join(
		repoRoot,
		filepath.FromSlash(phase1FixtureRelativePath),
		"dist",
		"server.js",
	)
	if err := os.MkdirAll(filepath.Dir(ignoredPath), 0o700); err != nil {
		t.Fatalf("create ignored fixture directory: %v", err)
	}
	if err := os.WriteFile(ignoredPath, []byte("developer build\n"), 0o600); err != nil {
		t.Fatalf("write ignored fixture artifact: %v", err)
	}

	actual, err := readCommittedPhase1Fixture(context.Background(), repoRoot)
	if err != nil {
		t.Fatalf("reread committed fixture: %v", err)
	}
	actualDigest, err := hashManifestSnapshot(actual)
	if err != nil {
		t.Fatalf("rehash committed fixture: %v", err)
	}
	if _, exists := actual["dist/server.js"]; exists {
		t.Fatal("committed fixture included ignored developer artifact")
	}
	if string(actual["src/server.ts"].Content) != "committed\n" {
		t.Fatalf("committed source = %q", actual["src/server.ts"].Content)
	}
	if actualDigest != baselineDigest {
		t.Fatalf("fixture digest changed after ignored developer state: %s != %s", actualDigest, baselineDigest)
	}
	status := runPhase0ReportGit(t, repoRoot, "status", "--short", "--ignored")
	if !strings.Contains(status, "!! evals/fixtures/typescript-service/dist/") {
		t.Fatalf("ignored developer artifact was not present in test worktree: %q", status)
	}
}
