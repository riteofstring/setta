package settacmd

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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

// Plugins init should scaffold a plugin template that validate accepts immediately.
func TestRunPluginsInitAndValidateText(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()

	initStdout, initStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "init", "setta-cli-init-fixture", "--template", "frontend", "--out", cwd)
	if err != nil {
		t.Fatalf("run plugins init: %v", err)
	}
	if initStderr != "" {
		t.Fatalf("expected empty stderr, got %q", initStderr)
	}

	pluginRoot := filepath.Join(cwd, "setta-cli-init-fixture")
	if !strings.Contains(initStdout, "Initialized plugin template at "+pluginRoot) {
		t.Fatalf("expected init output to mention plugin root, got %q", initStdout)
	}

	validateStdout, validateStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "validate", pluginRoot)
	if err != nil {
		t.Fatalf("run plugins validate: %v", err)
	}
	if validateStderr != "" {
		t.Fatalf("expected empty stderr, got %q", validateStderr)
	}
	if !strings.Contains(validateStdout, "Plugin manifest is valid: "+pluginRoot) {
		t.Fatalf("expected validate output to mention plugin root, got %q", validateStdout)
	}
}

// Plugins link JSON should expose the Go-owned local-link payload, including trust metadata.
func TestRunPluginsLinkJSONIncludesInstallPayload(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	sourceRoot := filepath.Join(cwd, "my-local-plugin")
	writeFrontendPluginFixture(t, sourceRoot, "setta-fixture-frontend", "Setta Fixture Frontend", "0.1.0")

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "link", sourceRoot, "--scope", "workspace", "--json")
	if err != nil {
		t.Fatalf("run plugins link: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(stdout), &payload); err != nil {
		t.Fatalf("decode plugins link json: %v", err)
	}
	if got := payload["pluginId"]; got != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin id %#v", got)
	}
	if got := payload["sourceScopeLabel"]; got != "workspace" {
		t.Fatalf("unexpected source scope label %#v", got)
	}
	if got := payload["trustStatus"]; got != "unverified" {
		t.Fatalf("unexpected trust status %#v", got)
	}
	if got := payload["state"]; got != "active" {
		t.Fatalf("unexpected plugin state %#v", got)
	}
}

// Enable/disable JSON should expose the Go-owned lifecycle payload over real plugins_state transitions.
func TestRunPluginsEnableDisableJSON(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	workspacePluginRoot := filepath.Join(cwd, ".setta_plugins", "setta-fixture-frontend")
	writeFrontendPluginFixture(t, workspacePluginRoot, "setta-fixture-frontend", "Setta Fixture Frontend", "0.1.0")

	disableStdout, disableStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "disable", "setta-fixture-frontend", "--json")
	if err != nil {
		t.Fatalf("run plugins disable: %v", err)
	}
	if disableStderr != "" {
		t.Fatalf("expected empty stderr, got %q", disableStderr)
	}

	var disabledPayload map[string]any
	if err := json.Unmarshal([]byte(disableStdout), &disabledPayload); err != nil {
		t.Fatalf("decode disable json: %v", err)
	}
	if got := disabledPayload["pluginId"]; got != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin id %#v", got)
	}
	if got := disabledPayload["state"]; got != "disabled" {
		t.Fatalf("unexpected disabled state %#v", got)
	}
	if got := disabledPayload["restartRequired"]; got != false {
		t.Fatalf("unexpected restart flag %#v", got)
	}

	enableStdout, enableStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "enable", "setta-fixture-frontend", "--json")
	if err != nil {
		t.Fatalf("run plugins enable: %v", err)
	}
	if enableStderr != "" {
		t.Fatalf("expected empty stderr, got %q", enableStderr)
	}

	var enabledPayload map[string]any
	if err := json.Unmarshal([]byte(enableStdout), &enabledPayload); err != nil {
		t.Fatalf("decode enable json: %v", err)
	}
	if got := enabledPayload["state"]; got != "active" {
		t.Fatalf("unexpected enabled state %#v", got)
	}
	if got := enabledPayload["restartRequired"]; got != false {
		t.Fatalf("unexpected restart flag %#v", got)
	}
}

// Uninstall should keep the CLI text contract and backend restart messaging for lifecycle removals.
func TestRunPluginsUninstallTextReportsRestartRequirement(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	workspacePluginRoot := filepath.Join(cwd, ".setta_plugins", "setta-fixture-backend")
	writeBackendPluginFixture(t, workspacePluginRoot, "setta-fixture-backend", "Setta Fixture Backend", "0.1.0")

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "uninstall", "setta-fixture-backend")
	if err != nil {
		t.Fatalf("run plugins uninstall: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if !strings.Contains(stdout, "Uninstalled setta-fixture-backend from workspace scope") {
		t.Fatalf("expected uninstall summary, got %q", stdout)
	}
	if !strings.Contains(stdout, "Backend restart required.") {
		t.Fatalf("expected backend restart message, got %q", stdout)
	}
	if _, err := os.Stat(workspacePluginRoot); !os.IsNotExist(err) {
		t.Fatalf("expected plugin root removal, stat err=%v", err)
	}
}

// Rollback JSON should restore the recorded snapshot version and emit the Go-owned lower-camel payload.
func TestRunPluginsRollbackJSONRestoresSnapshot(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	workspacePluginRoot := filepath.Join(cwd, ".setta_plugins", "setta-fixture-frontend")
	writeFrontendPluginFixture(t, workspacePluginRoot, "setta-fixture-frontend", "Setta Fixture Frontend", "0.2.0")

	snapshotRoot := filepath.Join(cwd, "setta_files", "plugins_history", "workspace", "setta-fixture-frontend", "snapshot-v0.1.0")
	writeFrontendPluginFixture(t, snapshotRoot, "setta-fixture-frontend", "Setta Fixture Frontend", "0.1.0")
	writeJSONFileForSettacmdTest(t, filepath.Join(cwd, "setta_files", "plugins_install_metadata.json"), map[string]any{
		"entries": map[string]any{
			"workspace:setta-fixture-frontend": map[string]any{
				"pluginId":           "setta-fixture-frontend",
				"scope":              "workspace",
				"sourceSpec":         "pypi:setta-fixture-frontend==0.2.0",
				"canonicalSourceKey": "pypi:setta-fixture-frontend",
				"version":            "0.2.0",
				"history": []any{
					map[string]any{
						"version":            "0.1.0",
						"snapshotPath":       snapshotRoot,
						"timestampIso":       "2026-03-08T12:30:00Z",
						"sourceDigestSha256": nil,
					},
				},
			},
		},
	})

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "rollback", "setta-fixture-frontend", "--json")
	if err != nil {
		t.Fatalf("run plugins rollback: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(stdout), &payload); err != nil {
		t.Fatalf("decode rollback json: %v", err)
	}
	if got := payload["pluginId"]; got != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin id %#v", got)
	}
	if got := payload["restoredVersion"]; got != "0.1.0" {
		t.Fatalf("unexpected restored version %#v", got)
	}
	if got := payload["restartRequired"]; got != false {
		t.Fatalf("unexpected rollback restart flag %#v", got)
	}

	manifestPayload, err := os.ReadFile(filepath.Join(workspacePluginRoot, "setta.plugin.json"))
	if err != nil {
		t.Fatalf("read restored manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode restored manifest: %v", err)
	}
	if got := manifest["version"]; got != "0.1.0" {
		t.Fatalf("expected restored manifest version 0.1.0, got %#v", got)
	}
}

// Scoped lifecycle commands should reject conflicting scope selectors before touching plugin state.
func TestRunPluginsScopedLifecycleCommandsRejectConflictingScopeFlags(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()

	_, _, err := runPluginsSettaCommand(t, cwd, "plugins", "uninstall", "setta-fixture-frontend", "--scope", "workspace", "--global")
	if err == nil || DisplayError(err) != "Use either --scope or scope shortcut flags, not both." {
		t.Fatalf("expected scope/shortcut conflict error, got %v", err)
	}

	_, _, err = runPluginsSettaCommand(t, cwd, "plugins", "rollback", "setta-fixture-frontend", "--global", "--setta-files")
	if err == nil || DisplayError(err) != "Use only one of --global or --setta-files." {
		t.Fatalf("expected shortcut conflict error, got %v", err)
	}
}

// Package-manager uninstall should stay Go-owned while rejecting externally managed plugin removal with the canonical service code.
func TestRunPluginsPackageManagerUninstallRejectsExternallyManagedPlugin(t *testing.T) {
	cwd := t.TempDir()
	sitePackages := installPackageManagerDistributionFixtureForSettacmdTest(t, "setta-fixture-frontend", "0.1.0")
	t.Setenv("PYTHONPATH", sitePackages)

	_, _, err := runPluginsSettaCommand(t, cwd, "plugins", "uninstall", "setta-fixture-frontend", "--scope", "setta_files")
	if err == nil {
		t.Fatal("expected package-manager uninstall error")
	}
	if DisplayError(err) != "PLUGIN_MANAGED_EXTERNALLY: Plugin setta-fixture-frontend is managed by a Python package manager. Use uv/pip/Poetry to uninstall it." {
		t.Fatalf("unexpected package-manager uninstall error %q", DisplayError(err))
	}
}

func runPluginsSettaCommand(t *testing.T, cwd string, args ...string) (string, string, error) {
	t.Helper()

	settaHome := filepath.Join(cwd, ".setta")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	pythonWrapper := writeSettacmdTestPythonWrapper(t)

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
			if key == "SETTA_PYTHON" {
				return pythonWrapper, true
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

func writeSettacmdTestPythonWrapper(t *testing.T) string {
	t.Helper()

	actualPython := resolveSettacmdTestPython(t)
	wrapperPath := filepath.Join(t.TempDir(), "python-wrapper")
	if runtime.GOOS == "windows" {
		wrapperPath += ".cmd"
		if err := os.WriteFile(wrapperPath, []byte("@echo off\r\n\""+actualPython+"\" -S %*\r\n"), 0o755); err != nil {
			t.Fatalf("write python wrapper: %v", err)
		}
		return wrapperPath
	}
	if err := os.WriteFile(wrapperPath, []byte("#!/bin/sh\nexec \""+actualPython+"\" -S \"$@\"\n"), 0o755); err != nil {
		t.Fatalf("write python wrapper: %v", err)
	}
	return wrapperPath
}

func resolveSettacmdTestPython(t *testing.T) string {
	t.Helper()

	repoRoot := settacmdTestRepoRoot(t)
	candidates := []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
		"python3",
		"python",
	}
	if runtime.GOOS == "windows" {
		candidates = append([]string{
			filepath.Join(repoRoot, ".venv", "Scripts", "python.exe"),
		}, candidates...)
	}
	for _, candidate := range candidates {
		if strings.Contains(candidate, string(filepath.Separator)) {
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
			continue
		}
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved
		}
	}
	t.Fatal("python interpreter not found for settacmd plugin tests")
	return ""
}

func settacmdTestRepoRoot(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve settacmd test file path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func installPackageManagerDistributionFixtureForSettacmdTest(t *testing.T, packageName string, version string) string {
	t.Helper()

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	pluginRoot := filepath.Join(sitePackages, strings.ReplaceAll(packageName, "-", "_"))
	writeFrontendPluginFixture(t, pluginRoot, packageName, "Setta Fixture Frontend", version)

	distInfoName := strings.ReplaceAll(packageName, "-", "_") + "-" + version + ".dist-info"
	distInfoRoot := filepath.Join(sitePackages, distInfoName)
	if err := os.MkdirAll(distInfoRoot, 0o755); err != nil {
		t.Fatalf("mkdir dist-info root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distInfoRoot, "METADATA"), []byte(strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: " + packageName,
		"Version: " + version,
		"Summary: Setta fixture plugin",
		"",
	}, "\n")), 0o644); err != nil {
		t.Fatalf("write metadata: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distInfoRoot, "RECORD"), []byte(strings.Join([]string{
		filepath.ToSlash(filepath.Join(strings.ReplaceAll(packageName, "-", "_"), "setta.plugin.json")) + ",,",
		filepath.ToSlash(filepath.Join(distInfoName, "METADATA")) + ",,",
		filepath.ToSlash(filepath.Join(distInfoName, "RECORD")) + ",,",
		"",
	}, "\n")), 0o644); err != nil {
		t.Fatalf("write record: %v", err)
	}
	return sitePackages
}
