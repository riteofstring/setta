package settacmd

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/plugins"
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

// Plugins list text should keep the explicit empty-state message when no plugins are discovered.
func TestRunPluginsListTextReportsNoPlugins(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "list")
	if err != nil {
		t.Fatalf("run plugins list empty text: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != "No plugins discovered." {
		t.Fatalf("expected empty-state message, got %q", stdout)
	}
}

// Bare plugins navigation should now render Go-owned usage instead of failing through Python fallback.
func TestRunPluginsHelpNavigationPrintsUsage(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins")
	if err != nil {
		t.Fatalf("run bare plugins help navigation: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if !strings.Contains(stdout, "Usage:") {
		t.Fatalf("expected usage header, got %q", stdout)
	}
	if !strings.Contains(stdout, "setta plugins <subcommand> [options]") {
		t.Fatalf("expected plugins synopsis, got %q", stdout)
	}

	helpStdout, helpStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "--help")
	if err != nil {
		t.Fatalf("run plugins --help: %v", err)
	}
	if helpStderr != "" {
		t.Fatalf("expected empty stderr, got %q", helpStderr)
	}
	if !strings.Contains(helpStdout, "Subcommands:") {
		t.Fatalf("expected subcommands section, got %q", helpStdout)
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
	if !strings.Contains(stdout, "setta-fixture-backend 0.1.0 [pending_restart] scope=setta_files components=backend (restart required)") {
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

// Plugins restart should preserve the shipped manual-only text/JSON contract in the packaged Go CLI.
func TestRunPluginsRestartTextAndJSON(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "restart")
	if err != nil {
		t.Fatalf("run plugins restart text: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if !strings.Contains(stdout, "Programmatic restart unavailable.") {
		t.Fatalf("expected unavailable message, got %q", stdout)
	}
	if !strings.Contains(stdout, "Run: setta") {
		t.Fatalf("expected manual command line, got %q", stdout)
	}
	if !strings.Contains(stdout, "Programmatic restart is not available in this runtime.") {
		t.Fatalf("expected manual reason line, got %q", stdout)
	}

	jsonStdout, jsonStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "restart", "--json")
	if err != nil {
		t.Fatalf("run plugins restart json: %v", err)
	}
	if jsonStderr != "" {
		t.Fatalf("expected empty stderr, got %q", jsonStderr)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(jsonStdout), &payload); err != nil {
		t.Fatalf("decode restart json: %v", err)
	}
	if got := payload["accepted"]; got != false {
		t.Fatalf("unexpected accepted flag %#v", got)
	}
	if got := payload["mode"]; got != "manual" {
		t.Fatalf("unexpected restart mode %#v", got)
	}
	if got := payload["command"]; got != "setta" {
		t.Fatalf("unexpected restart command %#v", got)
	}
	if got := payload["reason"]; got != "Programmatic restart is not available in this runtime." {
		t.Fatalf("unexpected restart reason %#v", got)
	}
}

// Plugins init should scaffold a plugin template that validate accepts immediately.
func TestRunPluginsInitAndValidateText(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()

	initStdout, initStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "init", "setta-cli-init-fixture", "--template", "full", "--out", cwd)
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
	if _, err := os.Stat(filepath.Join(pluginRoot, "backend", "main.go")); err != nil {
		t.Fatalf("expected Go backend scaffold file: %v", err)
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

// Plugins validate should surface manifest lookup failures through the packaged CLI error boundary.
func TestRunPluginsValidateReportsManifestError(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	invalidPluginRoot := filepath.Join(cwd, "invalid-plugin-root")
	if err := os.MkdirAll(invalidPluginRoot, 0o755); err != nil {
		t.Fatalf("mkdir invalid plugin root: %v", err)
	}

	_, _, err := runPluginsSettaCommand(t, cwd, "plugins", "validate", invalidPluginRoot)
	if err == nil {
		t.Fatal("expected plugins validate failure")
	}
	if ExitCode(err) != 1 {
		t.Fatalf("expected exit code 1, got %d", ExitCode(err))
	}
	if !strings.HasPrefix(DisplayError(err), "PLUGIN_SOURCE_MANIFEST_NOT_FOUND:") {
		t.Fatalf("expected manifest-not-found error, got %q", DisplayError(err))
	}
}

// Plugins init should scaffold a Go-backed backend template instead of rejecting backend authoring outright.
func TestRunPluginsInitSupportsBackendTemplate(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "init", "setta-cli-init-fixture", "--template", "backend", "--out", cwd)
	if err != nil {
		t.Fatalf("run backend plugins init: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	pluginRoot := filepath.Join(cwd, "setta-cli-init-fixture")
	if !strings.Contains(stdout, "Initialized plugin template at "+pluginRoot) {
		t.Fatalf("expected init output to mention plugin root, got %q", stdout)
	}
	if _, err := os.Stat(filepath.Join(pluginRoot, "backend", "go.mod")); err != nil {
		t.Fatalf("expected backend go.mod scaffold: %v", err)
	}
	if _, err := os.Stat(filepath.Join(pluginRoot, "backend", "main.go")); err != nil {
		t.Fatalf("expected backend main scaffold: %v", err)
	}

	validateStdout, validateStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "validate", pluginRoot)
	if err != nil {
		t.Fatalf("run backend plugins validate: %v", err)
	}
	if validateStderr != "" {
		t.Fatalf("expected empty stderr, got %q", validateStderr)
	}
	if !strings.Contains(validateStdout, "Plugin manifest is valid: "+pluginRoot) {
		t.Fatalf("expected validate output to mention plugin root, got %q", validateStdout)
	}
}

// Plugins validate should fail when a backend plugin no longer builds as a Go command.
func TestRunPluginsValidateRejectsInvalidGoBackend(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()

	_, _, err := runPluginsSettaCommand(t, cwd, "plugins", "init", "setta-cli-invalid-backend", "--template", "backend", "--out", cwd)
	if err != nil {
		t.Fatalf("run backend plugins init: %v", err)
	}

	pluginRoot := filepath.Join(cwd, "setta-cli-invalid-backend")
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte("package main\n\nfunc helper() {}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write invalid backend main.go: %v", err)
	}

	_, _, err = runPluginsSettaCommand(t, cwd, "plugins", "validate", pluginRoot)
	if err == nil {
		t.Fatal("expected plugins validate failure")
	}
	exitErr, ok := err.(*ExitError)
	if !ok {
		t.Fatalf("expected ExitError, got %T", err)
	}
	if exitErr.Code != 1 {
		t.Fatalf("expected exit code 1, got %d", exitErr.Code)
	}
	if !strings.Contains(exitErr.Error(), string(plugins.ServiceErrorCodeBackendBuildFailed)) {
		t.Fatalf("expected backend build failure in error, got %v", err)
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

// Plugins install should keep the Python CLI text/JSON contract while resolving real PyPI source acquisition through the shipped Go CLI.
func TestRunPluginsInstallTextAndJSON(t *testing.T) {
	t.Setenv("SETTA_PYTHON", resolveSettacmdTestPython(t))
	artifactDir := t.TempDir()
	buildLocalPyPIWheelForSettacmdTest(t, artifactDir, "setta-fixture-frontend", "0.1.0")
	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	textCWD := filepath.Join(t.TempDir(), "text-workspace")
	if err := os.MkdirAll(textCWD, 0o755); err != nil {
		t.Fatalf("mkdir text cwd: %v", err)
	}
	stdout, stderr, err := runPluginsSettaCommand(t, textCWD, "plugins", "install", "pypi:setta-fixture-frontend==0.1.0")
	if err != nil {
		t.Fatalf("run plugins install text: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	expectedSourcePath := filepath.Join(textCWD, ".setta_plugins", "setta-fixture-frontend")
	if !strings.Contains(stdout, "Installed setta-fixture-frontend 0.1.0 to workspace ("+expectedSourcePath+")") {
		t.Fatalf("unexpected text output %q", stdout)
	}
	if !strings.Contains(stdout, "Source: pypi:setta-fixture-frontend") {
		t.Fatalf("expected canonical source line, got %q", stdout)
	}

	jsonCWD := filepath.Join(t.TempDir(), "json-workspace")
	if err := os.MkdirAll(jsonCWD, 0o755); err != nil {
		t.Fatalf("mkdir json cwd: %v", err)
	}
	jsonStdout, jsonStderr, err := runPluginsSettaCommand(t, jsonCWD, "plugins", "install", "pypi:setta-fixture-frontend==0.1.0", "--json")
	if err != nil {
		t.Fatalf("run plugins install json: %v", err)
	}
	if jsonStderr != "" {
		t.Fatalf("expected empty stderr, got %q", jsonStderr)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(jsonStdout), &payload); err != nil {
		t.Fatalf("decode install json: %v", err)
	}
	if got := payload["pluginId"]; got != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin id %#v", got)
	}
	if got := payload["version"]; got != "0.1.0" {
		t.Fatalf("unexpected version %#v", got)
	}
	if got := payload["sourceScopeLabel"]; got != "workspace" {
		t.Fatalf("unexpected source scope label %#v", got)
	}
	if got := payload["canonicalSourceKey"]; got != "pypi:setta-fixture-frontend" {
		t.Fatalf("unexpected canonical source key %#v", got)
	}
	if got := payload["trustStatus"]; got != "unverified" {
		t.Fatalf("unexpected trust status %#v", got)
	}
	if got := payload["state"]; got != "active" {
		t.Fatalf("unexpected plugin state %#v", got)
	}
}

// Plugins update/pin should preserve the Python CLI wording while using the Go-owned mutation service for version retargeting.
func TestRunPluginsUpdateAndPinTextAndJSON(t *testing.T) {
	t.Setenv("SETTA_PYTHON", resolveSettacmdTestPython(t))
	artifactDir := t.TempDir()
	buildLocalPyPIWheelForSettacmdTest(t, artifactDir, "setta-fixture-frontend", "0.1.0")
	buildLocalPyPIWheelForSettacmdTest(t, artifactDir, "setta-fixture-frontend", "0.2.0")
	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	cwd := t.TempDir()
	if _, _, err := runPluginsSettaCommand(t, cwd, "plugins", "install", "pypi:setta-fixture-frontend==0.1.0", "--json"); err != nil {
		t.Fatalf("seed plugin install: %v", err)
	}

	updateStdout, updateStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "update", "setta-fixture-frontend", "--to", "0.2.0")
	if err != nil {
		t.Fatalf("run plugins update text: %v", err)
	}
	if updateStderr != "" {
		t.Fatalf("expected empty stderr, got %q", updateStderr)
	}
	if !strings.Contains(updateStdout, "Updated setta-fixture-frontend: 0.1.0 -> 0.2.0") {
		t.Fatalf("unexpected update output %q", updateStdout)
	}

	pinStdout, pinStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "pin", "setta-fixture-frontend", "0.1.0", "--json")
	if err != nil {
		t.Fatalf("run plugins pin json: %v", err)
	}
	if pinStderr != "" {
		t.Fatalf("expected empty stderr, got %q", pinStderr)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(pinStdout), &payload); err != nil {
		t.Fatalf("decode pin json: %v", err)
	}
	if got := payload["pluginId"]; got != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin id %#v", got)
	}
	if got := payload["fromVersion"]; got != "0.2.0" {
		t.Fatalf("unexpected fromVersion %#v", got)
	}
	if got := payload["toVersion"]; got != "0.1.0" {
		t.Fatalf("unexpected toVersion %#v", got)
	}
	if got := payload["restartRequired"]; got != false {
		t.Fatalf("unexpected restartRequired %#v", got)
	}
}

// Plugins lock apply should keep the Python check/apply text and JSON transport while delegating convergence to the Go service.
func TestRunPluginsLockApplyCheckTextAndApplyJSON(t *testing.T) {
	t.Setenv("SETTA_PYTHON", resolveSettacmdTestPython(t))
	artifactDir := t.TempDir()
	buildLocalPyPIWheelForSettacmdTest(t, artifactDir, "setta-fixture-frontend", "0.1.0")
	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	cwd := t.TempDir()
	lockfilePath := filepath.Join(cwd, ".setta_plugins", "plugins.lock.json")
	writeJSONFileForSettacmdTest(t, lockfilePath, map[string]any{
		"plugins": []map[string]any{
			{
				"pluginId":           "setta-fixture-frontend",
				"version":            "0.1.0",
				"canonicalSourceKey": "pypi:setta-fixture-frontend",
				"scope":              "workspace",
				"sourceSpec":         "pypi:setta-fixture-frontend==0.1.0",
				"installerBackend":   "pip",
			},
		},
	})

	checkStdout, checkStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "lock", "apply", "--check")
	if err != nil {
		t.Fatalf("run plugins lock apply check: %v", err)
	}
	if checkStderr != "" {
		t.Fatalf("expected empty stderr, got %q", checkStderr)
	}
	if !strings.Contains(checkStdout, "Lockfile: "+lockfilePath) {
		t.Fatalf("expected lockfile path, got %q", checkStdout)
	}
	if !strings.Contains(checkStdout, "Planned changes:") {
		t.Fatalf("expected planned changes header, got %q", checkStdout)
	}
	if !strings.Contains(checkStdout, "- install setta-fixture-frontend in workspace") {
		t.Fatalf("expected install planned change, got %q", checkStdout)
	}
	if !strings.Contains(checkStdout, "Applied: no") {
		t.Fatalf("expected dry-run applied=no output, got %q", checkStdout)
	}

	applyStdout, applyStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "lock", "apply", "--json")
	if err != nil {
		t.Fatalf("run plugins lock apply json: %v", err)
	}
	if applyStderr != "" {
		t.Fatalf("expected empty stderr, got %q", applyStderr)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(applyStdout), &payload); err != nil {
		t.Fatalf("decode lock apply json: %v", err)
	}
	if got := payload["lockfilePath"]; got != lockfilePath {
		t.Fatalf("unexpected lockfile path %#v", got)
	}
	if got := payload["applied"]; got != true {
		t.Fatalf("expected applied=true, got %#v", got)
	}
	plannedChanges, ok := payload["plannedChanges"].([]any)
	if !ok || len(plannedChanges) != 1 || plannedChanges[0] != "install setta-fixture-frontend in workspace" {
		t.Fatalf("unexpected planned changes %#v", payload["plannedChanges"])
	}
	if _, err := os.Stat(filepath.Join(cwd, ".setta_plugins", "setta-fixture-frontend")); err != nil {
		t.Fatalf("expected plugin root after lock apply: %v", err)
	}
}

// Plugins lock write should emit the canonical lockfile path/count contract in both text and JSON modes.
func TestRunPluginsLockWriteTextAndJSON(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	workspacePluginRoot := filepath.Join(cwd, ".setta_plugins", "setta-fixture-frontend")
	settaFilesPluginRoot := filepath.Join(cwd, "setta_files", "plugins", "setta-fixture-backend")
	writeFrontendPluginFixture(t, workspacePluginRoot, "setta-fixture-frontend", "Setta Fixture Frontend", "0.1.0")
	writeBackendPluginFixture(t, settaFilesPluginRoot, "setta-fixture-backend", "Setta Fixture Backend", "0.1.0")
	writeJSONFileForSettacmdTest(t, filepath.Join(cwd, "setta_files", "plugins_install_metadata.json"), map[string]any{
		"entries": map[string]any{
			"setta_files:setta-fixture-backend": map[string]any{
				"pluginId":           "setta-fixture-backend",
				"scope":              "setta_files",
				"sourceSpec":         "pypi:setta-fixture-backend==0.1.0",
				"installerBackend":   "pip",
				"canonicalSourceKey": "pypi:setta-fixture-backend",
				"sourceDigestSha256": "sha256:test-backend",
				"version":            "0.1.0",
				"history":            []any{},
			},
		},
	})

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "lock", "write")
	if err != nil {
		t.Fatalf("run plugins lock write: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	lockfilePath := filepath.Join(cwd, ".setta_plugins", "plugins.lock.json")
	if !strings.Contains(stdout, "Wrote lockfile "+lockfilePath+" with 2 plugin entries") {
		t.Fatalf("unexpected text output %q", stdout)
	}

	jsonStdout, jsonStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "lock", "write", "--json")
	if err != nil {
		t.Fatalf("run plugins lock write json: %v", err)
	}
	if jsonStderr != "" {
		t.Fatalf("expected empty stderr, got %q", jsonStderr)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(jsonStdout), &payload); err != nil {
		t.Fatalf("decode plugins lock write json: %v", err)
	}
	if got := payload["lockfilePath"]; got != lockfilePath {
		t.Fatalf("unexpected lockfile path %#v", got)
	}
	if got := payload["pluginCount"]; got != float64(2) {
		t.Fatalf("unexpected plugin count %#v", got)
	}
}

// Plugins lock navigation should now render Go-owned usage when no nested subcommand is selected yet.
func TestRunPluginsLockHelpNavigationPrintsUsage(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()

	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "lock")
	if err != nil {
		t.Fatalf("run plugins lock help navigation: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if !strings.Contains(stdout, "setta plugins lock <subcommand> [options]") {
		t.Fatalf("expected plugins lock synopsis, got %q", stdout)
	}

	helpStdout, helpStderr, err := runPluginsSettaCommand(t, cwd, "plugins", "lock", "--help")
	if err != nil {
		t.Fatalf("run plugins lock --help: %v", err)
	}
	if helpStderr != "" {
		t.Fatalf("expected empty stderr, got %q", helpStderr)
	}
	if !strings.Contains(helpStdout, "write  Write the plugins lockfile.") {
		t.Fatalf("expected lock subcommand summary, got %q", helpStdout)
	}
}

// Invalid plugins root argv should print usage once from the Go-owned plugins boundary.
func TestRunPluginsRejectsUnknownSubcommandWithUsage(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "unknown-subcommand")
	if err == nil {
		t.Fatal("expected plugins subcommand error")
	}
	if ExitCode(err) != 2 {
		t.Fatalf("expected exit code 2, got %d", ExitCode(err))
	}
	if stdout != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if strings.Count(stderr, `unknown plugins subcommand "unknown-subcommand"`) != 1 {
		t.Fatalf("expected one plugins error message, got %q", stderr)
	}
	if !strings.Contains(stderr, "setta plugins <subcommand> [options]") {
		t.Fatalf("expected plugins usage, got %q", stderr)
	}
}

// Invalid plugins lock argv should print usage once from the Go-owned lock boundary.
func TestRunPluginsLockRejectsUnknownSubcommandWithUsage(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	stdout, stderr, err := runPluginsSettaCommand(t, cwd, "plugins", "lock", "unknown-subcommand")
	if err == nil {
		t.Fatal("expected plugins lock subcommand error")
	}
	if ExitCode(err) != 2 {
		t.Fatalf("expected exit code 2, got %d", ExitCode(err))
	}
	if stdout != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if strings.Count(stderr, `unknown plugins lock subcommand "unknown-subcommand"`) != 1 {
		t.Fatalf("expected one plugins lock error message, got %q", stderr)
	}
	if !strings.Contains(stderr, "setta plugins lock <subcommand> [options]") {
		t.Fatalf("expected plugins lock usage, got %q", stderr)
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

// Install should keep failing closed on the removed legacy environment flag
// and scope value even though the Go parser no longer emits Click wording.
func TestRunPluginsInstallRejectsLegacyEnvironmentFlags(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()

	_, _, err := runPluginsSettaCommand(t, cwd, "plugins", "install", "pypi:setta-fixture-frontend==0.1.0", "--environment")
	if err == nil || DisplayError(err) != `unknown option "--environment"` {
		t.Fatalf("expected removed environment flag error, got %v", err)
	}

	_, _, err = runPluginsSettaCommand(t, cwd, "plugins", "install", "pypi:setta-fixture-frontend==0.1.0", "--scope", "environment")
	if err == nil || DisplayError(err) != `Invalid plugin scope: "environment"` {
		t.Fatalf("expected invalid environment scope error, got %v", err)
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

// Packaged plugin commands should still surface persisted plugins_state load failures as typed CLI errors.
func TestRunPluginsCommandsSurfaceInvalidPluginsStateErrors(t *testing.T) {
	cases := []struct {
		name    string
		args    []string
		prepare func(t *testing.T, cwd string)
	}{
		{
			name: "list",
			args: []string{"plugins", "list"},
		},
		{
			name: "rescan",
			args: []string{"plugins", "rescan"},
		},
		{
			name: "restart_required",
			args: []string{"plugins", "restart-required"},
		},
		{
			name: "install",
			args: []string{"plugins", "install", "pypi:setta-fixture-frontend==0.1.0", "--scope", "workspace", "--installer", "pip"},
			prepare: func(t *testing.T, cwd string) {
				t.Helper()

				artifactDir := t.TempDir()
				buildLocalPyPIWheelForSettacmdTest(t, artifactDir, "setta-fixture-frontend", "0.1.0")
				t.Setenv("SETTA_PYTHON", resolveSettacmdTestPython(t))
				t.Setenv("PIP_NO_INDEX", "1")
				t.Setenv("PIP_FIND_LINKS", artifactDir)
			},
		},
		{
			name: "uninstall",
			args: []string{"plugins", "uninstall", "setta-fixture-missing"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cwd := t.TempDir()
			if tc.prepare != nil {
				tc.prepare(t, cwd)
			}
			if err := os.MkdirAll(filepath.Join(cwd, "setta_files"), 0o755); err != nil {
				t.Fatalf("mkdir setta_files root: %v", err)
			}
			if err := os.WriteFile(filepath.Join(cwd, "setta_files", "plugins_state.json"), []byte("{invalid-json"), 0o644); err != nil {
				t.Fatalf("seed invalid plugins_state.json: %v", err)
			}

			_, _, err := runPluginsSettaCommand(t, cwd, tc.args...)
			if err == nil {
				t.Fatal("expected command failure")
			}
			if ExitCode(err) != 1 {
				t.Fatalf("expected exit code 1, got %d", ExitCode(err))
			}
			if !strings.HasPrefix(DisplayError(err), "PLUGIN_STATE_INVALID: Invalid plugins state file:") {
				t.Fatalf("unexpected plugins state error %q", DisplayError(err))
			}
		})
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
				if value, ok := os.LookupEnv(key); ok {
					return value, true
				}
				return pythonWrapper, true
			}
			return os.LookupEnv(key)
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
			"entrypoint": "backend/main.go",
		},
		"capabilities": []string{},
	}
	writePluginFixture(t, root, manifest, map[string]string{
		"backend/go.mod":  "module example.com/" + pluginID + "/backend\n\ngo 1.26.0\n",
		"backend/main.go": "package main\n\nimport (\n\t\"encoding/json\"\n\t\"fmt\"\n\t\"os\"\n\t\"strings\"\n)\n\nconst (\n\tbackendProbeArg = \"--setta-plugin-backend-probe\"\n\tbackendRuntimeArg = \"--setta-plugin-backend-runtime\"\n)\n\ntype runtimeRequest struct {\n\tSchemaVersion int    `json:\"schemaVersion\"`\n\tKind          string `json:\"kind\"`\n}\n\ntype runtimeResponse struct {\n\tSchemaVersion   int            `json:\"schemaVersion\"`\n\tListenerEndpoint map[string]any `json:\"listenerEndpoint,omitempty\"`\n\tHTTP            map[string]any `json:\"http,omitempty\"`\n}\n\nfunc main() {\n\tif len(os.Args) != 2 {\n\t\treturn\n\t}\n\tswitch os.Args[1] {\n\tcase backendProbeArg:\n\t\tpayload := map[string]any{\n\t\t\t\"schemaVersion\": 1,\n\t\t\t\"codegenTargets\": []map[string]any{},\n\t\t\t\"routes\": []map[string]any{},\n\t\t\t\"staticDirs\": []map[string]any{},\n\t\t\t\"listenerEndpoints\": []map[string]any{},\n\t\t}\n\t\tif err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {\n\t\t\t_, _ = fmt.Fprintf(os.Stderr, \"encode backend probe: %v\\n\", err)\n\t\t\tos.Exit(1)\n\t\t}\n\tcase backendRuntimeArg:\n\t\tvar request runtimeRequest\n\t\tdecoder := json.NewDecoder(os.Stdin)\n\t\tdecoder.DisallowUnknownFields()\n\t\tif err := decoder.Decode(&request); err != nil {\n\t\t\t_, _ = fmt.Fprintf(os.Stderr, \"decode backend runtime request: %v\\n\", err)\n\t\t\tos.Exit(1)\n\t\t}\n\t\tresponse := runtimeResponse{SchemaVersion: 1}\n\t\tswitch strings.TrimSpace(request.Kind) {\n\t\tcase \"http\":\n\t\t\tresponse.HTTP = map[string]any{\"statusCode\": 404, \"headers\": map[string][]string{}}\n\t\tcase \"listener_endpoint\":\n\t\t\tresponse.ListenerEndpoint = map[string]any{\"result\": nil}\n\t\tdefault:\n\t\t\t_, _ = fmt.Fprintf(os.Stderr, \"unsupported backend runtime kind %q\\n\", request.Kind)\n\t\t\tos.Exit(1)\n\t\t}\n\t\tif err := json.NewEncoder(os.Stdout).Encode(response); err != nil {\n\t\t\t_, _ = fmt.Fprintf(os.Stderr, \"encode backend runtime response: %v\\n\", err)\n\t\t\tos.Exit(1)\n\t\t}\n\t}\n}\n",
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

func buildLocalPyPIWheelForSettacmdTest(t *testing.T, artifactDir string, packageName string, version string) string {
	t.Helper()

	sourceRoot := filepath.Join(t.TempDir(), "plugin-root")
	writeFrontendPluginFixture(t, sourceRoot, packageName, "Setta Fixture Frontend", version)

	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		t.Fatalf("mkdir artifact dir: %v", err)
	}
	wheelName := fmt.Sprintf("%s-%s-py3-none-any.whl", strings.ReplaceAll(packageName, "-", "_"), version)
	artifactPath := filepath.Join(artifactDir, wheelName)

	file, err := os.Create(artifactPath)
	if err != nil {
		t.Fatalf("create wheel artifact: %v", err)
	}
	archive := zip.NewWriter(file)
	err = filepath.Walk(sourceRoot, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		relativePath, err := filepath.Rel(sourceRoot, path)
		if err != nil {
			return err
		}
		writer, err := archive.Create(filepath.ToSlash(relativePath))
		if err != nil {
			return err
		}
		payload, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		_, err = writer.Write(payload)
		return err
	})
	if err != nil {
		t.Fatalf("write wheel payload: %v", err)
	}

	distInfoName := fmt.Sprintf("%s-%s.dist-info", strings.ReplaceAll(packageName, "-", "_"), version)
	metadataWriter, err := archive.Create(filepath.ToSlash(filepath.Join(distInfoName, "METADATA")))
	if err != nil {
		t.Fatalf("create wheel metadata: %v", err)
	}
	if _, err := metadataWriter.Write([]byte(strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: " + packageName,
		"Version: " + version,
		"Summary: Setta fixture plugin",
		"",
	}, "\n"))); err != nil {
		t.Fatalf("write wheel metadata: %v", err)
	}
	wheelWriter, err := archive.Create(filepath.ToSlash(filepath.Join(distInfoName, "WHEEL")))
	if err != nil {
		t.Fatalf("create wheel manifest: %v", err)
	}
	if _, err := wheelWriter.Write([]byte(strings.Join([]string{
		"Wheel-Version: 1.0",
		"Generator: settacmd-tests",
		"Root-Is-Purelib: true",
		"Tag: py3-none-any",
		"",
	}, "\n"))); err != nil {
		t.Fatalf("write wheel manifest: %v", err)
	}
	recordWriter, err := archive.Create(filepath.ToSlash(filepath.Join(distInfoName, "RECORD")))
	if err != nil {
		t.Fatalf("create wheel record: %v", err)
	}
	if _, err := recordWriter.Write([]byte("")); err != nil {
		t.Fatalf("write wheel record: %v", err)
	}

	if err := archive.Close(); err != nil {
		t.Fatalf("close wheel archive: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close wheel file: %v", err)
	}
	return artifactPath
}
