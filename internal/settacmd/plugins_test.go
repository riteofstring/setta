package settacmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Plugins list JSON should expose the Go-owned status payload over local plugin discovery.
func TestRunPluginsListJSONIncludesStatusPayload(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	workspacePluginRoot := filepath.Join(cwd, ".setta_plugins", "setta-fixture-frontend")
	writeFrontendPluginFixture(t, workspacePluginRoot, "setta-fixture-frontend", "Setta Fixture Frontend", "0.2.0")

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "list", "--json")
	if err != nil {
		t.Fatalf("run plugins list: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(stdout), &payload); err != nil {
		t.Fatalf("decode plugins list json: %v", err)
	}
	if got := payload["schemaVersion"]; got != float64(1) {
		t.Fatalf("unexpected schema version %#v", got)
	}
	if got := payload["serverMode"]; got != "ide" {
		t.Fatalf("unexpected server mode %#v", got)
	}
	pluginsPayload, ok := payload["plugins"].([]any)
	if !ok || len(pluginsPayload) != 1 {
		t.Fatalf("expected one plugin entry, got %#v", payload["plugins"])
	}
	entry, ok := pluginsPayload[0].(map[string]any)
	if !ok {
		t.Fatalf("expected plugin entry map, got %#v", pluginsPayload[0])
	}
	if got := entry["pluginId"]; got != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin id %#v", got)
	}
	if got := entry["sourceScopeLabel"]; got != "workspace" {
		t.Fatalf("unexpected source scope label %#v", got)
	}
}

// Plugins list text should include pending-restart markers, shadowed suffixes, and invalid-manifest details.
func TestRunPluginsListTextIncludesRestartShadowedAndErrors(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	workspaceFrontendRoot := filepath.Join(cwd, ".setta_plugins", "setta-fixture-frontend")
	globalFrontendRoot := filepath.Join(cwd, ".setta", "plugins", "setta-fixture-frontend")
	settaFilesBackendRoot := filepath.Join(cwd, "setta_files", "plugins", "setta-fixture-backend")
	brokenRoot := filepath.Join(cwd, "setta_files", "plugins", "broken-plugin")

	writeFrontendPluginFixture(t, workspaceFrontendRoot, "setta-fixture-frontend", "Setta Fixture Frontend", "0.2.0")
	writeFrontendPluginFixture(t, globalFrontendRoot, "setta-fixture-frontend", "Setta Fixture Frontend", "0.1.0")
	writeBackendPluginFixture(t, settaFilesBackendRoot, "setta-fixture-backend", "Setta Fixture Backend", "0.1.0")
	writeJSONFileForSettacmdTest(t, filepath.Join(cwd, "setta_files", "plugins_state.json"), map[string]any{
		"pendingRestartBackendPluginIds": []string{"setta-fixture-backend"},
	})
	if err := os.MkdirAll(brokenRoot, 0o755); err != nil {
		t.Fatalf("mkdir broken plugin root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(brokenRoot, "setta.plugin.json"), []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write broken manifest: %v", err)
	}

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "list")
	if err != nil {
		t.Fatalf("run plugins list text: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if !strings.Contains(stdout, "setta-fixture-backend 0.1.0 [pending_restart] scope=setta_files (restart required)") {
		t.Fatalf("expected pending restart line, got %q", stdout)
	}
	if !strings.Contains(stdout, "shadowed_by="+workspaceFrontendRoot) {
		t.Fatalf("expected shadowed suffix, got %q", stdout)
	}
	if !strings.Contains(stdout, "PLUGIN_MANIFEST_INVALID") {
		t.Fatalf("expected invalid manifest details, got %q", stdout)
	}
}

// Plugins rescan JSON should emit the canonical installed/active counts for the current workspace.
func TestRunPluginsRescanJSONReportsCounts(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	workspacePluginRoot := filepath.Join(cwd, ".setta_plugins", "setta-fixture-frontend")
	writeFrontendPluginFixture(t, workspacePluginRoot, "setta-fixture-frontend", "Setta Fixture Frontend", "0.1.0")

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "rescan", "--json")
	if err != nil {
		t.Fatalf("run plugins rescan: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(stdout), &payload); err != nil {
		t.Fatalf("decode plugins rescan json: %v", err)
	}
	if got := payload["installedPlugins"]; got != float64(1) {
		t.Fatalf("unexpected installed count %#v", got)
	}
	if got := payload["activePlugins"]; got != float64(1) {
		t.Fatalf("unexpected active count %#v", got)
	}
}

// Restart-required should report both discovered pending plugins and pending IDs that no longer have status entries.
func TestRunPluginsRestartRequiredTextAndJSON(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	settaFilesBackendRoot := filepath.Join(cwd, "setta_files", "plugins", "setta-fixture-backend")
	writeBackendPluginFixture(t, settaFilesBackendRoot, "setta-fixture-backend", "Setta Fixture Backend", "0.1.0")
	writeJSONFileForSettacmdTest(t, filepath.Join(cwd, "setta_files", "plugins_state.json"), map[string]any{
		"pendingRestartBackendPluginIds": []string{"setta-fixture-backend", "setta-fixture-missing"},
	})

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "restart-required")
	if err != nil {
		t.Fatalf("run plugins restart-required text: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if !strings.Contains(stdout, "Pending restart plugins:") {
		t.Fatalf("expected pending restart header, got %q", stdout)
	}
	if !strings.Contains(stdout, "- setta-fixture-backend (0.1.0)") {
		t.Fatalf("expected pending plugin line, got %q", stdout)
	}
	if !strings.Contains(stdout, "- setta-fixture-missing (status unavailable)") {
		t.Fatalf("expected missing-status line, got %q", stdout)
	}
	if !strings.Contains(stdout, "Manual restart command: setta") {
		t.Fatalf("expected manual restart command, got %q", stdout)
	}
	if !strings.Contains(stdout, "Programmatic restart is not available in this runtime.") {
		t.Fatalf("expected manual restart reason, got %q", stdout)
	}

	jsonStdout, jsonStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "restart-required", "--json")
	if err != nil {
		t.Fatalf("run plugins restart-required json: %v", err)
	}
	if jsonStderr != "" {
		t.Fatalf("expected empty stderr, got %q", jsonStderr)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(jsonStdout), &payload); err != nil {
		t.Fatalf("decode restart-required json: %v", err)
	}
	pendingPlugins, ok := payload["pendingPlugins"].([]any)
	if !ok || len(pendingPlugins) != 1 {
		t.Fatalf("expected one pending plugin entry, got %#v", payload["pendingPlugins"])
	}
	pendingIDsWithoutStatus, ok := payload["pendingPluginIdsWithoutStatus"].([]any)
	if !ok || len(pendingIDsWithoutStatus) != 1 || pendingIDsWithoutStatus[0] != "setta-fixture-missing" {
		t.Fatalf("unexpected pending ids without status %#v", payload["pendingPluginIdsWithoutStatus"])
	}
	restartCapability, ok := payload["restartCapability"].(map[string]any)
	if !ok {
		t.Fatalf("expected restart capability payload, got %#v", payload["restartCapability"])
	}
	if got := restartCapability["mode"]; got != "manual" {
		t.Fatalf("unexpected restart mode %#v", got)
	}
}

func runPluginsSettaCommand(t *testing.T, cwd string, args ...string) (string, string, error) {
	t.Helper()

	settaHome := filepath.Join(cwd, ".setta")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run(args, RunOptions{
		Stdout: &stdout,
		Stderr: &stderr,
		CWD:    cwd,
		Now: func() time.Time {
			return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
		},
		EnvLookup: func(key string) (string, bool) {
			if key == "SETTA_HOME" {
				return settaHome, true
			}
			return "", false
		},
	})
	return stdout.String(), stderr.String(), err
}

func writeFrontendPluginFixture(t *testing.T, root string, pluginID string, name string, version string) {
	t.Helper()

	manifest := map[string]any{
		"schemaVersion":     1,
		"id":                pluginID,
		"name":              name,
		"version":           version,
		"settaVersionRange": ">=0.0.0",
		"enabledByDefault":  true,
		"frontend": map[string]any{
			"entrypoint": "frontend/dist/index.js",
			"style":      "frontend/dist/index.css",
		},
		"capabilities": []string{
			"registerSectionKinds",
			"registerPane",
		},
	}
	writePluginFixture(t, root, manifest, map[string]string{
		"frontend/dist/index.js":  "console.log('plugin')\n",
		"frontend/dist/index.css": "body {}\n",
	})
}

func writeBackendPluginFixture(t *testing.T, root string, pluginID string, name string, version string) {
	t.Helper()

	manifest := map[string]any{
		"schemaVersion":     1,
		"id":                pluginID,
		"name":              name,
		"version":           version,
		"settaVersionRange": ">=0.0.0",
		"enabledByDefault":  true,
		"backend": map[string]any{
			"entrypoint": "backend/entrypoint.py",
		},
		"capabilities": []string{
			"registerRouter",
			"readProjectState",
		},
	}
	writePluginFixture(t, root, manifest, map[string]string{
		"backend/entrypoint.py": "def register(app):\n    return None\n",
	})
}

func writePluginFixture(t *testing.T, root string, manifest map[string]any, files map[string]string) {
	t.Helper()

	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("mkdir plugin root: %v", err)
	}
	for relativePath, content := range files {
		path := filepath.Join(root, relativePath)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir plugin file parent: %v", err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write plugin file: %v", err)
		}
	}
	writeJSONFileForSettacmdTest(t, filepath.Join(root, "setta.plugin.json"), manifest)
}

func writeJSONFileForSettacmdTest(t *testing.T, path string, payload any) {
	t.Helper()

	content, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal json payload: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir json parent: %v", err)
	}
	if err := os.WriteFile(path, append(content, '\n'), 0o644); err != nil {
		t.Fatalf("write json file: %v", err)
	}
}
