package mcpx

import "testing"

// Namespacing should keep the internal `<serverId>__<toolName>` contract
// explicit so later MCP clients never depend on ambiguous bare tool names.
func TestBuildAndSplitNamespacedToolName(t *testing.T) {
	t.Parallel()

	name := BuildNamespacedToolName("github", "search_repo")
	if name != "github__search_repo" {
		t.Fatalf("unexpected namespaced tool name %q", name)
	}

	serverID, toolName, ok := SplitNamespacedToolName(name)
	if !ok {
		t.Fatal("expected split to succeed")
	}
	if serverID != "github" || toolName != "search_repo" {
		t.Fatalf("unexpected split result %q %q %v", serverID, toolName, ok)
	}
}

// Normalization should preserve the existing Setta compatibility rules for
// `mcp__` and legacy single-underscore Setta prefixes.
func TestNormalizeToolName(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"":                           "",
		"mcp__setta__read_file":      "setta__read_file",
		"setta_read_file":            "setta__read_file",
		"setta__read_file":           "setta__read_file",
		"github__search_repo":        "github__search_repo",
		"  mcp__github__search_repo": "github__search_repo",
	}

	for input, expected := range cases {
		if got := NormalizeToolName(input); got != expected {
			t.Fatalf("NormalizeToolName(%q) = %q, want %q", input, got, expected)
		}
	}
}
