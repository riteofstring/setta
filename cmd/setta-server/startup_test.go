package main

import (
	"bytes"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/appsubsystem"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/plugins"
)

func TestRenderLocalStartupMessageRemoteSession(t *testing.T) {
	t.Parallel()

	message := renderLocalStartupMessage(
		auth.SessionMetadata{
			ID:                     "session-1",
			WorkspacePathCanonical: "/tmp/my project",
			Host:                   "127.0.0.1",
			Port:                   61234,
		},
		"/tmp/my project",
		"http://127.0.0.1:61234/__setta__/bootstrap#token=tok",
		"http://127.0.0.1:61234/__setta__/bootstrap",
		"tok",
		false,
		true,
	)

	if !strings.Contains(message, "Setta running (session session-1)") {
		t.Fatalf("expected session heading, got %q", message)
	}
	if !strings.Contains(message, "Bind: 127.0.0.1:61234 (remote only)") {
		t.Fatalf("expected remote-only bind hint, got %q", message)
	}
	if !strings.Contains(message, "setta connect <user@host> --workspace '/tmp/my project' --session session-1") {
		t.Fatalf("expected quoted connect command, got %q", message)
	}
	if !strings.Contains(message, "LOCAL_PORT=61000") {
		t.Fatalf("expected manual tunnel instructions, got %q", message)
	}
	if !strings.Contains(message, "Manual tunnel (no local Setta install):") {
		t.Fatalf("expected manual tunnel heading, got %q", message)
	}
	if !strings.Contains(message, "http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap#token=tok") {
		t.Fatalf("expected bootstrap fragment hint, got %q", message)
	}
	if !strings.Contains(message, "and paste: tok") {
		t.Fatalf("expected manual token entry hint, got %q", message)
	}
}

func TestRenderLocalStartupMessageAutoOpenSuppressesManualTunnelText(t *testing.T) {
	t.Parallel()

	// Once the local startup path is auto-opening the browser, the banner should
	// stop after the opening hint instead of printing the manual tunnel/bootstrap
	// instructions too.
	message := renderLocalStartupMessage(
		auth.SessionMetadata{
			ID:                     "session-1",
			WorkspacePathCanonical: "/tmp/my project",
			Host:                   "127.0.0.1",
			Port:                   61234,
		},
		"/tmp/my project",
		"http://127.0.0.1:61234/__setta__/bootstrap#token=tok",
		"http://127.0.0.1:61234/__setta__/bootstrap",
		"tok",
		true,
		true,
	)

	if !strings.Contains(message, "Opening browser to:") {
		t.Fatalf("expected auto-open banner, got %q", message)
	}
	if strings.Contains(message, "LOCAL_PORT=61000") {
		t.Fatalf("expected auto-open banner to suppress manual tunnel instructions, got %q", message)
	}
	if strings.Contains(message, "Manual tunnel (no local Setta install):") {
		t.Fatalf("expected auto-open banner to suppress remote manual instructions, got %q", message)
	}
}

func TestEmitLocalStartupOutputFallsBackWhenBrowserOpenFails(t *testing.T) {
	t.Parallel()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := emitLocalStartupOutput(
		config.Config{
			Paths: config.Paths{
				WorkspaceRoot: "/tmp/workspace",
			},
		},
		&localProcessSession{
			metadata: auth.SessionMetadata{
				ID:                     "session-1",
				WorkspacePathCanonical: "/tmp/workspace",
				Host:                   "127.0.0.1",
				Port:                   61234,
			},
			secret: []byte("secret"),
		},
		false,
		&stdout,
		&stderr,
		localStartupDependencies{
			now: func() time.Time {
				return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
			},
			mintBootstrapToken: func(string, []byte, time.Time) (string, error) {
				return "tok", nil
			},
			openBrowser: func(string) error {
				return startupAssertiveError("browser missing")
			},
			envLookup: func(string) (string, bool) {
				return "", false
			},
			stdinIsTTY: func() bool {
				return true
			},
			hasGUI: func(func(string) (string, bool)) bool {
				return true
			},
		},
	)
	if err != nil {
		t.Fatalf("emit local startup output: %v", err)
	}
	if !strings.Contains(stderr.String(), "Failed to open browser automatically. Open manually: http://127.0.0.1:61234/__setta__/bootstrap#token=tok (browser missing)") {
		t.Fatalf("expected browser fallback stderr, got %q", stderr.String())
	}
	if !strings.Contains(stdout.String(), "Bootstrap URL (recommended):") {
		t.Fatalf("expected manual bootstrap info, got %q", stdout.String())
	}
	if strings.Contains(stdout.String(), "Opening browser to:") {
		t.Fatalf("expected manual fallback output, got %q", stdout.String())
	}
}

func TestShouldAutoOpenLocalStartRejectsSSHSession(t *testing.T) {
	t.Parallel()

	autoOpen := shouldAutoOpenLocalStart(
		false,
		func(key string) (string, bool) {
			if key == "SSH_CONNECTION" {
				return "1", true
			}
			return "", false
		},
		func() bool {
			return true
		},
		func(func(string) (string, bool)) bool {
			return true
		},
	)
	if autoOpen {
		t.Fatal("expected ssh session to disable auto-open")
	}
}

func TestEmitShareStartupOutputWarnsForPublicHostAndPrintsURL(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	deploymentRoot := writeShareManifest(t, filepath.Join(t.TempDir(), "deployments", "demo-share", "v3"), "demo-share", "v3")
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err = emitShareStartupOutput(
		config.Config{
			Server: config.Server{
				Host: "0.0.0.0",
			},
			Paths: config.Paths{
				DeploymentRoot: deploymentRoot,
			},
		},
		listener,
		true,
		&stdout,
		&stderr,
		shareStartupDependencies{},
	)
	if err != nil {
		t.Fatalf("emit share startup output: %v", err)
	}

	if !strings.Contains(stderr.String(), `WARNING: share mode disables auth. Binding to "0.0.0.0" may expose your deployment publicly.`) {
		t.Fatalf("expected public host warning, got %q", stderr.String())
	}
	if !strings.Contains(stdout.String(), "Starting share backend for demo-share/v3") {
		t.Fatalf("expected share startup heading, got %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "Share URL: http://0.0.0.0:") {
		t.Fatalf("expected share url output, got %q", stdout.String())
	}
}

func TestEmitShareStartupOutputFallsBackWhenBrowserOpenFails(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	deploymentRoot := writeShareManifest(t, filepath.Join(t.TempDir(), "deployments", "demo-share", "v4"), "demo-share", "v4")
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err = emitShareStartupOutput(
		config.Config{
			Server: config.Server{
				Host: "127.0.0.1",
			},
			Paths: config.Paths{
				DeploymentRoot: deploymentRoot,
			},
		},
		listener,
		false,
		&stdout,
		&stderr,
		shareStartupDependencies{
			openBrowser: func(string) error {
				return startupAssertiveError("browser missing")
			},
			envLookup: func(string) (string, bool) {
				return "", false
			},
			stdinIsTTY: func() bool {
				return true
			},
			hasGUI: func(func(string) (string, bool)) bool {
				return true
			},
		},
	)
	if err != nil {
		t.Fatalf("emit share startup output: %v", err)
	}

	if !strings.Contains(stderr.String(), "Failed to open browser automatically. Open manually: http://127.0.0.1:") {
		t.Fatalf("expected browser fallback message, got %q", stderr.String())
	}
	if strings.Contains(stderr.String(), "WARNING:") {
		t.Fatalf("expected loopback host to skip public warning, got %q", stderr.String())
	}
	if !strings.Contains(stdout.String(), "Starting share backend for demo-share/v4") {
		t.Fatalf("expected share startup heading, got %q", stdout.String())
	}
}

func TestEmitAppStartupOutputWarnsForPublicHostAndPrintsURL(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	deploymentRoot := writeDeploymentManifest(t, filepath.Join(t.TempDir(), "deployments", "demo-app", "v2"), "demo-app", "v2", deployments.TypeApp)
	enableAppDeploymentRuntimePlugin(t, deploymentRoot)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err = emitAppStartupOutput(
		config.Config{
			Server: config.Server{
				Host: "0.0.0.0",
				Mode: config.ModeApp,
			},
			Paths: config.Paths{
				DeploymentRoot: deploymentRoot,
				RuntimeRoot:    filepath.Join(deploymentRoot, "runtime"),
			},
		},
		listener,
		true,
		&stdout,
		&stderr,
		appStartupDependencies{},
	)
	if err != nil {
		t.Fatalf("emit app startup output: %v", err)
	}

	if !strings.Contains(stderr.String(), `WARNING: app mode disables auth. Binding to "0.0.0.0" may expose your deployment publicly.`) {
		t.Fatalf("expected public host warning, got %q", stderr.String())
	}
	if !strings.Contains(stdout.String(), "Starting app backend for demo-app/v2") {
		t.Fatalf("expected app startup heading, got %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "App URL: http://0.0.0.0:") {
		t.Fatalf("expected app url output, got %q", stdout.String())
	}
}

func TestEmitAppStartupOutputFallsBackWhenBrowserOpenFails(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	deploymentRoot := writeDeploymentManifest(t, filepath.Join(t.TempDir(), "deployments", "demo-app", "v3"), "demo-app", "v3", deployments.TypeApp)
	enableAppDeploymentRuntimePlugin(t, deploymentRoot)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err = emitAppStartupOutput(
		config.Config{
			Server: config.Server{
				Host: "127.0.0.1",
				Mode: config.ModeApp,
			},
			Paths: config.Paths{
				DeploymentRoot: deploymentRoot,
				RuntimeRoot:    filepath.Join(deploymentRoot, "runtime"),
			},
		},
		listener,
		false,
		&stdout,
		&stderr,
		appStartupDependencies{
			openBrowser: func(string) error {
				return startupAssertiveError("browser missing")
			},
			envLookup: func(string) (string, bool) {
				return "", false
			},
			stdinIsTTY: func() bool {
				return true
			},
			hasGUI: func(func(string) (string, bool)) bool {
				return true
			},
		},
	)
	if err != nil {
		t.Fatalf("emit app startup output: %v", err)
	}

	if !strings.Contains(stderr.String(), "Failed to open browser automatically. Open manually: http://127.0.0.1:") {
		t.Fatalf("expected browser fallback message, got %q", stderr.String())
	}
	if strings.Contains(stderr.String(), "WARNING:") {
		t.Fatalf("expected loopback host to skip public warning, got %q", stderr.String())
	}
	if !strings.Contains(stdout.String(), "Starting app backend for demo-app/v3") {
		t.Fatalf("expected app startup heading, got %q", stdout.String())
	}
}

func TestEmitAppStartupOutputRequiresAppSubsystemPlugin(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	deploymentRoot := writeDeploymentManifest(t, filepath.Join(t.TempDir(), "deployments", "demo-app", "v5"), "demo-app", "v5", deployments.TypeApp)
	err = emitAppStartupOutput(
		config.Config{
			Server: config.Server{
				Host: "127.0.0.1",
				Mode: config.ModeApp,
			},
			Paths: config.Paths{
				DeploymentRoot: deploymentRoot,
				RuntimeRoot:    filepath.Join(deploymentRoot, "runtime"),
			},
		},
		listener,
		true,
		&bytes.Buffer{},
		&bytes.Buffer{},
		appStartupDependencies{},
	)
	if err == nil {
		t.Fatal("expected app startup output to require app subsystem plugin")
	}
	if err.Error() != appsubsystem.ErrAppModePluginRequired.Error() {
		t.Fatalf("expected exact plugin-required error %q, got %v", appsubsystem.ErrAppModePluginRequired.Error(), err)
	}
}

func writeShareManifest(t *testing.T, deploymentRoot string, deploymentName string, deploymentVersion string) string {
	t.Helper()

	return writeDeploymentManifest(t, deploymentRoot, deploymentName, deploymentVersion, deployments.TypeShare)
}

func writeDeploymentManifest(t *testing.T, deploymentRoot string, deploymentName string, deploymentVersion string, deploymentType deployments.Type) string {
	t.Helper()

	payload, err := json.MarshalIndent(deployments.Manifest{
		Version:           1,
		DeploymentName:    deploymentName,
		DeploymentType:    deploymentType,
		DefaultProjectID:  "project-alpha",
		DeploymentVersion: deploymentVersion,
		CreatedAt:         time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC),
	}, "", "  ")
	if err != nil {
		t.Fatalf("marshal manifest: %v", err)
	}
	payload = append(payload, '\n')
	if err := os.MkdirAll(deploymentRoot, 0o755); err != nil {
		t.Fatalf("mkdir deployment root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(deploymentRoot, "manifest.json"), payload, 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
	return deploymentRoot
}

func enableAppDeploymentRuntimePlugin(t *testing.T, deploymentRoot string) {
	t.Helper()

	payload, err := json.MarshalIndent(map[string]any{
		"schemaVersion":     1,
		"id":                plugins.AppSubsystemPluginID,
		"name":              "Setta JSON Render App Generation",
		"version":           "0.1.0",
		"settaVersionRange": ">=0.0.0",
		"enabledByDefault":  false,
		"featureCapabilities": map[string]any{
			"appSubsystem": map[string]any{
				"appDeploymentRuntime": true,
			},
		},
		"capabilities": []string{},
	}, "", "  ")
	if err != nil {
		t.Fatalf("marshal app plugin manifest: %v", err)
	}
	payload = append(payload, '\n')
	pluginRoot := filepath.Join(deploymentRoot, ".setta_plugins", plugins.AppSubsystemPluginID)
	if err := os.MkdirAll(pluginRoot, 0o755); err != nil {
		t.Fatalf("mkdir plugin root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(pluginRoot, "setta.plugin.json"), payload, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
	}
	statePayload, err := json.MarshalIndent(map[string]any{
		"enabledPluginIds": []string{plugins.AppSubsystemPluginID},
	}, "", "  ")
	if err != nil {
		t.Fatalf("marshal plugins state: %v", err)
	}
	statePayload = append(statePayload, '\n')
	if err := os.WriteFile(filepath.Join(deploymentRoot, "plugins_state.json"), statePayload, 0o644); err != nil {
		t.Fatalf("write plugins state: %v", err)
	}
}

type startupAssertiveError string

func (e startupAssertiveError) Error() string {
	return string(e)
}
