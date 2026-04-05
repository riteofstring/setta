package app

import (
	"testing"

	"setta/internal/auth"
	"setta/internal/config"
)

func TestResolveSettaServerURL(t *testing.T) {
	t.Run("uses configured listener when available", func(t *testing.T) {
		cfg := config.Config{}
		cfg.Server.Host = "127.0.0.1"
		cfg.Server.Port = 8123

		got := resolveSettaServerURL(cfg, &auth.CurrentSession{
			Metadata: auth.SessionMetadata{
				Host: "127.0.0.1",
				Port: 9001,
			},
		})

		if got != "http://127.0.0.1:8123/mcp" {
			t.Fatalf("expected configured listener URL, got %q", got)
		}
	})

	t.Run("falls back to current session metadata when listener port is unset", func(t *testing.T) {
		cfg := config.Config{}
		cfg.Server.Host = "127.0.0.1"
		cfg.Server.Port = 0

		got := resolveSettaServerURL(cfg, &auth.CurrentSession{
			Metadata: auth.SessionMetadata{
				Host: "127.0.0.1",
				Port: 9001,
			},
		})

		if got != "http://127.0.0.1:9001/mcp" {
			t.Fatalf("expected session metadata URL, got %q", got)
		}
	})

	t.Run("returns empty when neither source has a valid listener", func(t *testing.T) {
		got := resolveSettaServerURL(config.Config{}, nil)

		if got != "" {
			t.Fatalf("expected empty URL, got %q", got)
		}
	})
}
