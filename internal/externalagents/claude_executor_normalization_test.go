package externalagents

import "testing"

func TestNormalizeClaudeToolName(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"":                        "",
		"  ":                      "",
		"mcp__setta__read_file":   "setta__read_file",
		"setta_read_file":         "setta__read_file",
		"setta__read_file":        "setta__read_file",
		"question":                askUserQuestionToolName,
		"QUESTION":                askUserQuestionToolName,
		"mcp__question":           "question",
		"github__search_repo":     "github__search_repo",
		"  mcp__github__search  ": "github__search",
	}

	for input, expected := range cases {
		if got := normalizeClaudeToolName(input); got != expected {
			t.Fatalf("normalizeClaudeToolName(%q) = %q, want %q", input, got, expected)
		}
	}
}
