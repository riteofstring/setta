package externalagentconfigs

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestLoadCodexMCPServersFromPathSkipsUnsupportedAndMalformedEntries(t *testing.T) {
	root := t.TempDir()
	configPath := writeCodexBootstrapTestConfig(t, root, `
[mcp_servers.valid-http]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.valid-stdio]
command = "node"
args = ["server.js"]
env = { GOOD = "1" }
cwd = "/tmp/worktree"

[mcp_servers.unsupported-auth]
transport = "streamable_http"
url = "http://127.0.0.1:5000/mcp"
auth_token = "token-value"

[mcp_servers.conflict-stdio-url]
transport = "stdio"
url = "http://127.0.0.1:9000/mcp"

[mcp_servers.conflict-sse-command]
transport = "sse"
command = "node"
args = ["server.js"]

[mcp_servers]
invalid-shape = "not-an-object"

[mcp_servers.bad__id]
command = "node"
args = ["server.js"]

[mcp_servers.foo]
command = "alpha"

[mcp_servers." foo "]
command = "beta"

[mcp_servers.invalid-args]
command = "node"
args = ["server.js", 123]

[mcp_servers.invalid-env]
command = "node"
env = { GOOD = "1", BAD = 2 }

[mcp_servers.invalid-transport]
transport = 123
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.invalid-encoding]
command = "node"
encoding = 123

[mcp_servers.invalid-command]
transport = "streamable_http"
url = "http://127.0.0.1:5000/mcp"
command = 789

[mcp_servers.invalid-cwd]
command = "node"
cwd = 789

[mcp_servers.invalid-encoding-handler]
command = "node"
encoding_error_handler = "surrogateescape"

[mcp_servers.invalid-conflicting-headers]
transport = "streamable_http"
url = "http://127.0.0.1:5000/mcp"

[mcp_servers.invalid-conflicting-headers.http_headers]
Authorization = "Bearer new-token"

[mcp_servers.invalid-conflicting-headers.headers]
Authorization = "Bearer old-token"

[mcp_servers.alias-equal]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.alias-equal.http_headers]
Authorization = "Bearer same-token"

[mcp_servers.alias-equal.headers]
Authorization = "Bearer same-token"
`)

	servers := loadCodexMCPServersFromPath(configPath)
	if !reflect.DeepEqual(servers["valid-http"], map[string]any{
		"transport": "streamable_http",
		"url":       "http://127.0.0.1:3845/mcp",
	}) {
		t.Fatalf("expected valid http server to survive, got %#v", servers["valid-http"])
	}
	if !reflect.DeepEqual(servers["valid-stdio"], map[string]any{
		"transport": "stdio",
		"command":   "node",
		"args":      []string{"server.js"},
		"env":       map[string]string{"GOOD": "1"},
		"cwd":       "/tmp/worktree",
	}) {
		t.Fatalf("expected valid stdio server to survive, got %#v", servers["valid-stdio"])
	}

	for _, serverID := range []string{
		"unsupported-auth",
		"conflict-stdio-url",
		"conflict-sse-command",
		"invalid-shape",
		"bad__id",
		"foo",
		"invalid-args",
		"invalid-env",
		"invalid-transport",
		"invalid-encoding",
		"invalid-command",
		"invalid-cwd",
		"invalid-encoding-handler",
		"invalid-conflicting-headers",
		"alias-equal",
	} {
		if _, ok := servers[serverID]; ok {
			t.Fatalf("expected invalid server %q to be skipped, got %#v", serverID, servers[serverID])
		}
	}
}

func TestLoadCodexMCPServersFromPathRejectsCamelCaseRootKey(t *testing.T) {
	root := t.TempDir()
	configPath := writeCodexBootstrapTestConfig(t, root, `
[mcp_servers.alpha]
command = "alpha"

[mcpServers.alpha]
command = "beta"
`)

	servers := loadCodexMCPServersFromPath(configPath)
	if len(servers) != 0 {
		t.Fatalf("expected camel-case root key to fail closed, got %#v", servers)
	}
}

func TestValidateCodexMCPServersPayloadRejectsCamelCaseRootKey(t *testing.T) {
	err := validateCodexMCPServersPayload(map[string]any{
		"mcpServers": map[string]any{
			"alpha": map[string]any{"command": "alpha"},
		},
	})
	if err == nil {
		t.Fatal("expected validation error")
	}
	if !strings.Contains(err.Error(), "'mcpServers' is not supported. Use 'mcp_servers'.") {
		t.Fatalf("unexpected validation error %v", err)
	}
}

func TestLoadCodexMCPServerPayloadsFromConfigFailsClosedForExplicitEmptyOrWhitespaceCODEXHOME(t *testing.T) {
	root := t.TempDir()
	homeDir := filepath.Join(root, "home")
	if err := os.MkdirAll(filepath.Join(homeDir, ".codex"), 0o755); err != nil {
		t.Fatalf("mkdir fallback codex home: %v", err)
	}
	writeCodexBootstrapTestConfig(t, filepath.Join(homeDir, ".codex"), `
[mcp_servers.fallback-home-server]
transport = "streamable_http"
url = "http://127.0.0.1:9900/mcp"
`)

	for _, testCase := range []struct {
		name      string
		codexHome string
	}{
		{name: "empty", codexHome: ""},
		{name: "whitespace", codexHome: "   "},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Setenv("HOME", homeDir)
			t.Setenv("CODEX_HOME", testCase.codexHome)

			payloads := loadCodexMCPServerPayloadsFromConfig()
			if len(payloads) != 0 {
				t.Fatalf("expected explicit CODEX_HOME=%q to fail closed, got %#v", testCase.codexHome, payloads)
			}
		})
	}
}

func TestLoadCodexMCPServerPayloadsFromConfigDoesNotFallbackWhenExplicitCODEXHOMEInvalid(t *testing.T) {
	root := t.TempDir()
	codexHome := filepath.Join(root, "codex-home")
	if err := os.MkdirAll(codexHome, 0o755); err != nil {
		t.Fatalf("mkdir codex home: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codexHome, codexConfigFileName), []byte("[mcp_servers.invalid\n"), 0o644); err != nil {
		t.Fatalf("write invalid codex home config: %v", err)
	}

	homeDir := filepath.Join(root, "home")
	if err := os.MkdirAll(filepath.Join(homeDir, ".codex"), 0o755); err != nil {
		t.Fatalf("mkdir fallback codex home: %v", err)
	}
	writeCodexBootstrapTestConfig(t, filepath.Join(homeDir, ".codex"), `
[mcp_servers.fallback-home-server]
transport = "streamable_http"
url = "http://127.0.0.1:9900/mcp"
`)

	t.Setenv("CODEX_HOME", codexHome)
	t.Setenv("HOME", homeDir)

	payloads := loadCodexMCPServerPayloadsFromConfig()
	if len(payloads) != 0 {
		t.Fatalf("expected invalid explicit CODEX_HOME config to fail closed without HOME fallback, got %#v", payloads)
	}
}

func TestParseCodexMCPServerEntryInfersTransportAndBuildsStdioPayload(t *testing.T) {
	t.Parallel()

	payload, err := parseCodexMCPServerEntry(map[string]any{
		"command": "node",
		"args":    []any{"server.js", " --watch "},
		"env": map[string]any{
			"DEBUG": "1",
		},
		"cwd": "/tmp/worktree",
	}, "alpha")
	if err != nil {
		t.Fatalf("parse codex stdio payload: %v", err)
	}

	expected := map[string]any{
		"transport": "stdio",
		"command":   "node",
		"args":      []string{"server.js", "--watch"},
		"env":       map[string]string{"DEBUG": "1"},
		"cwd":       "/tmp/worktree",
	}
	if !reflect.DeepEqual(payload, expected) {
		t.Fatalf("expected stdio payload %#v, got %#v", expected, payload)
	}
}

func TestParseCodexMCPServerEntryBuildsHTTPPayload(t *testing.T) {
	t.Parallel()

	payload, err := parseCodexMCPServerEntry(map[string]any{
		"transport": "SSE",
		"url":       "http://127.0.0.1:7000/mcp",
		"http_headers": map[string]any{
			"Authorization": "Bearer token",
		},
	}, "alpha")
	if err != nil {
		t.Fatalf("parse codex http payload: %v", err)
	}

	expected := map[string]any{
		"transport": "sse",
		"url":       "http://127.0.0.1:7000/mcp",
		"http_headers": map[string]string{
			"Authorization": "Bearer token",
		},
	}
	if !reflect.DeepEqual(payload, expected) {
		t.Fatalf("expected http payload %#v, got %#v", expected, payload)
	}
}

func TestParseCodexMCPServerEntryRejectsInvalidStdioHTTPHeaders(t *testing.T) {
	t.Parallel()

	_, err := parseCodexMCPServerEntry(map[string]any{
		"command": "node",
		"http_headers": map[string]any{
			"Authorization": "Bearer token",
		},
	}, "alpha")
	if err == nil {
		t.Fatal("expected parse error")
	}
	if err.Error() != `server "alpha" stdio transport cannot define http_headers` {
		t.Fatalf("unexpected error %v", err)
	}
}

func TestNormalizeSettaCodexMCPServerEntryUsesStreamableHTTP(t *testing.T) {
	t.Parallel()

	normalized := NormalizeSettaCodexMCPServerEntry(map[string]any{
		"transport": "stdio",
		"command":   "node",
		"args":      []string{"server.js"},
		"env":       map[string]string{"DEBUG": "1"},
		"cwd":       "/tmp/worktree",
		"http_headers": map[string]string{
			"Cookie": "session=value",
		},
		"enabled_tools": []string{"runTool"},
	}, "http://127.0.0.1:8019/mcp")

	expected := map[string]any{
		"transport": "streamable_http",
		"url":       "http://127.0.0.1:8019/mcp",
		"http_headers": map[string]string{
			"Cookie": "session=value",
		},
		"enabled_tools": []string{"runTool"},
	}
	if !reflect.DeepEqual(normalized, expected) {
		t.Fatalf("expected normalized setta entry %#v, got %#v", expected, normalized)
	}
}

func writeCodexBootstrapTestConfig(t *testing.T, root string, payload string) string {
	t.Helper()

	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("mkdir codex config root: %v", err)
	}
	path := filepath.Join(root, codexConfigFileName)
	if err := os.WriteFile(path, []byte(strings.TrimSpace(payload)+"\n"), 0o644); err != nil {
		t.Fatalf("write codex config: %v", err)
	}
	return path
}
