package plugins

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalizeBackendProbeResponseRejectsInvalidRoutePaths(t *testing.T) {
	// Backend route registrations must fail closed on traversal, empty, and whitespace segments.
	pluginRoot := t.TempDir()
	testCases := map[string]string{
		"missing-leading-slash": "../escape",
		"empty-segment":         "/foo//bar",
		"encoded-traversal":     "/%2e%2e/escape",
		"whitespace":            "/with space",
	}

	for name, invalidPath := range testCases {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeBackendProbeResponse(pluginRoot, "setta-fixture-backend", backendProbeResponse{
				Routes: []PluginRegisteredBackendRoute{{
					Path:    invalidPath,
					Methods: []string{"GET"},
				}},
			})
			if err == nil {
				t.Fatalf("expected invalid route path %q to fail", invalidPath)
			}
			if !strings.Contains(err.Error(), "route 0: route path") {
				t.Fatalf("expected route path validation error, got %v", err)
			}
		})
	}
}

func TestNormalizeBackendProbeResponseRejectsInvalidStaticDirRoutePrefixes(t *testing.T) {
	// Backend static-dir registrations must reject invalid URL prefixes before route mounting.
	pluginRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(pluginRoot, "backend", "static"), 0o755); err != nil {
		t.Fatalf("mkdir backend static dir: %v", err)
	}
	testCases := map[string]string{
		"missing-leading-slash-traversal": "../escape",
		"encoded-traversal":               "/%2e%2e/escape",
		"empty-segment":                   "fixture//nested",
		"whitespace":                      "fixture with spaces",
	}

	for name, invalidPrefix := range testCases {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeBackendProbeResponse(pluginRoot, "setta-fixture-backend-static-router", backendProbeResponse{
				StaticDirs: []PluginRegisteredStaticDir{{
					RoutePrefix: invalidPrefix,
					Dir:         "backend/static",
				}},
			})
			if err == nil {
				t.Fatalf("expected invalid static dir route prefix %q to fail", invalidPrefix)
			}
			if !strings.Contains(err.Error(), "static dir 0: routePrefix") {
				t.Fatalf("expected static dir routePrefix validation error, got %v", err)
			}
		})
	}
}

func TestNormalizeBackendLanguageServerRegistrationResolvesPluginRelativeCommand(t *testing.T) {
	// Plugin language-server commands should resolve ./ paths against the plugin root.
	pluginRoot := t.TempDir()
	commandPath := filepath.Join(pluginRoot, "backend", "fixture-language-server.sh")
	if err := os.MkdirAll(filepath.Dir(commandPath), 0o755); err != nil {
		t.Fatalf("mkdir language server command dir: %v", err)
	}
	if err := os.WriteFile(commandPath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write language server command: %v", err)
	}

	normalized, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", PluginRegisteredLanguageServer{
		Name:     "Fixture DSL",
		Language: "TypeScript",
		Command:  "./backend/fixture-language-server.sh",
		Args:     []string{"--stdio"},
	})
	if err != nil {
		t.Fatalf("normalize backend language server registration: %v", err)
	}
	if normalized.Command != commandPath {
		t.Fatalf("expected plugin-relative command to resolve to %q, got %q", commandPath, normalized.Command)
	}
}

func TestNormalizeBackendLanguageServerRegistrationPreservesCustomSettingsKey(t *testing.T) {
	// Plugin language-server registrations should keep trimmed custom settings keys.
	pluginRoot := t.TempDir()
	settingsKey := " fixtureDslLanguageServer "

	normalized, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", PluginRegisteredLanguageServer{
		Name:        "Fixture DSL",
		Language:    "FixtureDSL",
		Command:     "python3",
		Args:        []string{"--stdio"},
		SettingsKey: &settingsKey,
	})
	if err != nil {
		t.Fatalf("normalize backend language server registration: %v", err)
	}
	if normalized.Language != "fixturedsl" {
		t.Fatalf("expected normalized language id fixturedsl, got %q", normalized.Language)
	}
	if normalized.SettingsKey == nil || *normalized.SettingsKey != "fixtureDslLanguageServer" {
		t.Fatalf("expected custom settings key to be preserved, got %#v", normalized.SettingsKey)
	}
}
