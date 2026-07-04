package chat

import "testing"

func TestSummarizeCommandLabel(t *testing.T) {
	cases := []struct {
		name    string
		command string
		want    string
	}{
		{"unwraps zsh wrapper for unknown command", "/bin/zsh -lc 'tokei .'", "tokei ."},
		{"unwraps bash double-quoted", `bash -c "git ls-files"`, "Listed files"},
		{"reads a file by basename", "cat internal/chat/service.go", "Read service.go"},
		{"searches for a pattern", `/bin/zsh -lc 'rg "needle" internal'`, "Searched needle"},
		{"lists a path", "ls -la src", "Listed src"},
		{"lists files with no path", "ls", "Listed files"},
		{"git grep is a search", "/bin/zsh -lc 'git grep TODO'", "Searched TODO"},
		{"pipeline summarizes the source stage", "/bin/zsh -lc 'cat foo.txt | head'", "Read foo.txt"},
		{"cd prefix uses the real command", "/bin/zsh -lc 'cd /repo && rg needle'", "Searched needle"},
		{"unknown command stays unwrapped", `/bin/zsh -lc "node -e 'process.exit(0)'"`, "node -e 'process.exit(0)'"},
		{"command without a wrapper passes through", "git status", "git status"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := summarizeCommandLabel(testCase.command); got != testCase.want {
				t.Fatalf("summarizeCommandLabel(%q) = %q, want %q", testCase.command, got, testCase.want)
			}
		})
	}
}
