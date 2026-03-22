package devworktree

import "testing"

func TestDeriveNameMatchesSettaWorktreeConvention(t *testing.T) {
	t.Parallel()

	// Keep the public badge naming stable for the main worktree and named worktrees.
	testCases := []struct {
		name     string
		repoRoot string
		expected string
	}{
		{name: "main worktree", repoRoot: "/tmp/setta", expected: "main"},
		{name: "feature worktree", repoRoot: "/tmp/setta.feature-x", expected: "feature-x"},
		{name: "named worktree", repoRoot: "/tmp/setta.feature-cleanup", expected: "feature-cleanup"},
		{name: "other repo name", repoRoot: "/tmp/custom-app", expected: "custom-app"},
		{name: "empty path", repoRoot: "   ", expected: ""},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			if got := DeriveName(testCase.repoRoot); got != testCase.expected {
				t.Fatalf("expected derived worktree name %q, got %q", testCase.expected, got)
			}
		})
	}
}

func TestResolveActiveNameReturnsEmptyWhenNoCandidateResolves(t *testing.T) {
	t.Parallel()

	got := resolveActiveName([]string{"/missing", "   ", "/later"}, func(string) (string, bool) {
		return "", false
	})
	if got != "" {
		t.Fatalf("expected empty active worktree name, got %q", got)
	}
}

func TestResolveActiveNameUsesFirstResolvableCandidate(t *testing.T) {
	t.Parallel()

	// The active name resolver should stop at the first git root it can resolve.
	got := resolveActiveName([]string{"/missing", "/repo", "/later"}, func(candidate string) (string, bool) {
		switch candidate {
		case "/missing":
			return "", false
		case "/repo":
			return "/tmp/setta.status-routes", true
		default:
			return "", false
		}
	})
	if got != "status-routes" {
		t.Fatalf("expected first resolved worktree name, got %q", got)
	}
}
