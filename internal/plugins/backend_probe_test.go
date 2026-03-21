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

func TestNormalizeBackendLanguageServerRegistrationRejectsInvalidFields(t *testing.T) {
	// Language-server registrations must fail closed on missing commands and python targets.
	pluginRoot := t.TempDir()
	testCases := []struct {
		name         string
		registration PluginRegisteredLanguageServer
		wantErr      string
	}{
		{
			name: "python-target",
			registration: PluginRegisteredLanguageServer{
				Name:     "Fixture DSL",
				Language: "python",
				Command:  "python3",
			},
			wantErr: "cannot target python",
		},
		{
			name: "missing-command",
			registration: PluginRegisteredLanguageServer{
				Name:     "Fixture DSL",
				Language: "typescript",
				Command:  "   ",
			},
			wantErr: "command is required",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", testCase.registration)
			if err == nil {
				t.Fatalf("expected invalid language-server registration %#v to fail", testCase.registration)
			}
			if !strings.Contains(err.Error(), testCase.wantErr) {
				t.Fatalf("expected error containing %q, got %v", testCase.wantErr, err)
			}
		})
	}
}

func TestNormalizeBackendLanguageServerRegistrationTreatsBlankSettingsKeyAsOmitted(t *testing.T) {
	// Blank settings keys are normalized away instead of failing the entire registration.
	pluginRoot := t.TempDir()
	settingsKey := "   "

	normalized, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", PluginRegisteredLanguageServer{
		Name:        "Fixture DSL",
		Language:    "typescript",
		Command:     "python3",
		SettingsKey: &settingsKey,
	})
	if err != nil {
		t.Fatalf("normalize backend language server registration: %v", err)
	}
	if normalized.SettingsKey != nil {
		t.Fatalf("expected blank settings key to be omitted, got %#v", normalized.SettingsKey)
	}
}

func TestDecodeBackendProbeResponseRejectsLanguageServerArgsNotArrayOfStrings(t *testing.T) {
	// Malformed language-server payloads should fail decode before they reach runtime status.
	_, err := decodeBackendProbeResponse([]byte(`{
		"schemaVersion": 1,
		"languageServers": [
			{
				"name": "Fixture DSL",
				"language": "typescript",
				"command": "python3",
				"args": "--stdio"
			}
		]
	}`))
	if err == nil {
		t.Fatal("expected malformed language-server args payload to fail decode")
	}
	if !strings.Contains(err.Error(), "args") {
		t.Fatalf("expected args decode error, got %v", err)
	}
}

func TestDecodeBackendProbeResponseRejectsUnknownLanguageServerFields(t *testing.T) {
	// Unknown language-server fields must fail decode instead of being silently ignored.
	_, err := decodeBackendProbeResponse([]byte(`{
		"schemaVersion": 1,
		"languageServers": [
			{
				"name": "Fixture DSL",
				"language": "typescript",
				"command": "python3",
				"unsupported": true
			}
		]
	}`))
	if err == nil {
		t.Fatal("expected unknown language-server field to fail decode")
	}
	if !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("expected unknown-field decode error, got %v", err)
	}
}

func TestDecodeBackendProbeResponseRejectsUnsupportedSchemaVersion(t *testing.T) {
	// Probe schema mismatches should fail closed instead of activating stale backends.
	_, err := decodeBackendProbeResponse([]byte(`{
		"schemaVersion": 999,
		"codegenTargets": [],
		"languageServers": [],
		"uiSettings": [],
		"routes": [],
		"staticDirs": [],
		"listenerEndpoints": []
	}`))
	if err == nil {
		t.Fatal("expected unsupported probe schema version to fail")
	}
	if !strings.Contains(err.Error(), "unsupported schema version") {
		t.Fatalf("expected schema version error, got %v", err)
	}
}

func TestDecodeBackendProbeResponseRejectsLeadingStdoutNoise(t *testing.T) {
	// Probe stdout is reserved for JSON, so leading logs must fail decode.
	_, err := decodeBackendProbeResponse([]byte("plugin-import-log\n{\"schemaVersion\":1}"))
	if err == nil {
		t.Fatal("expected leading stdout noise to fail decode")
	}
}
