package mcpx

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadServerConfigsDefaultsToSettaWhenFileMissing(t *testing.T) {
	t.Parallel()

	configs, err := LoadServerConfigs(
		filepath.Join(t.TempDir(), "llm_config.json"),
		LoadServerConfigsOptions{SettaServerURL: "http://127.0.0.1:8000/mcp"},
	)
	if err != nil {
		t.Fatalf("load server configs: %v", err)
	}

	config, ok := configs[DefaultServerID]
	if !ok {
		t.Fatal("expected default setta server config")
	}
	if config.Transport != TransportSSE {
		t.Fatalf("expected sse transport, got %q", config.Transport)
	}
	if config.URL != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected default setta url, got %q", config.URL)
	}
}

func TestLoadServerConfigsRewritesSettaURLAndPreservesExternalServers(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configPath := filepath.Join(root, "llm_config.json")
	payload := `{
  "configs": {
    "claude": {
      "model": "claude-sonnet",
      "provider": "anthropic"
    }
  },
  "default_config_id": "claude",
  "mcpServers": {
    "setta": {
      "transport": "sse",
      "url": "http://127.0.0.1:9999/mcp"
    },
    "github": {
      "transport": "streamable_http",
      "url": "https://example.com/mcp",
      "http_headers": {
        "Authorization": "Bearer token"
      }
    }
  }
}`
	if err := os.WriteFile(configPath, []byte(payload), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	configs, err := LoadServerConfigs(configPath, LoadServerConfigsOptions{
		SettaServerURL: "http://127.0.0.1:8000/mcp",
	})
	if err != nil {
		t.Fatalf("load server configs: %v", err)
	}

	if got := configs[DefaultServerID].URL; got != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected rewritten setta url, got %q", got)
	}
	if got := configs["github"].URL; got != "https://example.com/mcp" {
		t.Fatalf("expected github url preserved, got %q", got)
	}
	if got := configs["github"].HTTPHeaders["Authorization"]; got != "Bearer token" {
		t.Fatalf("expected github headers preserved, got %q", got)
	}
}

func TestLoadServerConfigsRejectsInvalidServerID(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configPath := filepath.Join(root, "llm_config.json")
	payload := `{
  "mcpServers": {
    "bad__id": {
      "transport": "sse",
      "url": "http://127.0.0.1:8000/mcp"
    }
  }
}`
	if err := os.WriteFile(configPath, []byte(payload), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	_, err := LoadServerConfigs(configPath, LoadServerConfigsOptions{})
	if err == nil {
		t.Fatal("expected invalid server id error")
	}
}

func TestBuildSettaServerURLNormalizesWildcardHosts(t *testing.T) {
	t.Parallel()

	if got := BuildSettaServerURL("0.0.0.0", 8000); got != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected ipv4 wildcard normalization, got %q", got)
	}
	if got := BuildSettaServerURL("::", 8000); got != "http://[::1]:8000/mcp" {
		t.Fatalf("expected ipv6 wildcard normalization, got %q", got)
	}
}
