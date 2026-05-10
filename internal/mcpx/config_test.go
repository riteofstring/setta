package mcpx

import (
	"errors"
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
	if config.Transport != TransportStreamableHTTP {
		t.Fatalf("expected streamable_http transport, got %q", config.Transport)
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
      "transport": "streamable_http",
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
      "transport": "streamable_http",
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

func TestBuildSettaServerURLFormatsIPv6LiteralHosts(t *testing.T) {
	t.Parallel()

	if got := BuildSettaServerURL("2001:db8::1", 61234); got != "http://[2001:db8::1]:61234/mcp" {
		t.Fatalf("expected ipv6 literal formatting, got %q", got)
	}
}

func TestServerConfigNormalize(t *testing.T) {
	t.Parallel()

	t.Run("trims and defaults fields", func(t *testing.T) {
		t.Parallel()

		config, err := (ServerConfig{
			Transport: TransportStreamableHTTP,
			URL:       "  http://127.0.0.1:8000/mcp  ",
			CWD:       "  /tmp/workspace  ",
		}).normalize("setta")
		if err != nil {
			t.Fatalf("normalize config: %v", err)
		}
		if config.URL != "http://127.0.0.1:8000/mcp" {
			t.Fatalf("expected trimmed url, got %q", config.URL)
		}
		if config.CWD != "/tmp/workspace" {
			t.Fatalf("expected trimmed cwd, got %q", config.CWD)
		}
		if config.Encoding != "utf-8" {
			t.Fatalf("expected default encoding, got %q", config.Encoding)
		}
		if config.EncodingErrorHandler != "strict" {
			t.Fatalf("expected default encoding handler, got %q", config.EncodingErrorHandler)
		}
	})

	testCases := []struct {
		name   string
		config ServerConfig
		target error
	}{
		{
			name:   "transport required",
			config: ServerConfig{},
			target: ErrTransportRequired,
		},
		{
			name: "http transport requires url",
			config: ServerConfig{
				Transport: TransportStreamableHTTP,
			},
			target: ErrServerURLRequired,
		},
		{
			name: "stdio transport requires command",
			config: ServerConfig{
				Transport: TransportStdio,
			},
			target: ErrServerCommandRequired,
		},
		{
			name: "stdio transport rejects headers",
			config: ServerConfig{
				Transport:   TransportStdio,
				Command:     "node",
				HTTPHeaders: map[string]string{"Authorization": "Bearer token"},
			},
			target: ErrServerHTTPHeadersInvalid,
		},
		{
			name: "stdio transport rejects unsupported encoding",
			config: ServerConfig{
				Transport: TransportStdio,
				Command:   "node",
				Encoding:  "utf-16",
			},
			target: ErrServerEncodingUnsupported,
		},
		{
			name: "invalid transport keeps raw token in error",
			config: ServerConfig{
				Transport: " HTTPS ",
			},
			target: ErrTransportInvalid,
		},
	}

	for _, tt := range testCases {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := tt.config.normalize("github")
			if !errors.Is(err, tt.target) {
				t.Fatalf("expected %v, got %v", tt.target, err)
			}
		})
	}
}
