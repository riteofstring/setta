package settacmd

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/deployments"
	appsubsystemprovider "setta/internal/testutil/appsubsystemprovider"
	"setta/internal/testutil/firstpartyplugin"
)

func TestRunRoutesAppSubcommandAndDelegatesLatestDeployment(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	workspaceRoot := filepath.Join(tempDir, "workspace")
	settaFilesRoot := filepath.Join(tempDir, "state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-app", "v1"),
		"demo-app",
		"v1",
		deployments.TypeApp,
	)
	latestRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-app", "v3"),
		"demo-app",
		"v3",
		deployments.TypeApp,
	)
	enableSettacmdAppDeploymentRuntimePlugin(
		t,
		latestRoot,
		firstpartyplugin.AppSubsystemPluginID,
		"Setta JSON Render App Generation",
	)

	argsCapturePath := filepath.Join(tempDir, "args.txt")
	serverExecutable := writeArgumentCaptureExecutable(
		t,
		filepath.Join(tempDir, "bin", "setta-server"),
		argsCapturePath,
		0,
	)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run(
		[]string{
			"--workspace", workspaceRoot,
			"--setta-files-root", settaFilesRoot,
			"--host", "0.0.0.0",
			"--port", "61234",
			"--log-level", "debug",
			"--no-open",
			"app",
			"--deployment-name", "demo-app",
			"--latest",
		},
		RunOptions{
			Stdout: &stdout,
			Stderr: &stderr,
			CWD:    tempDir,
			EnvLookup: func(key string) (string, bool) {
				if key == "SETTA_SERVER_BIN" {
					return serverExecutable, true
				}
				return "", false
			},
		},
	)
	if err != nil {
		t.Fatalf("run app: %v", err)
	}
	if stderr.Len() != 0 {
		t.Fatalf("expected empty stderr, got %q", stderr.String())
	}

	capturedArgs, err := os.ReadFile(argsCapturePath)
	if err != nil {
		t.Fatalf("read captured args: %v", err)
	}
	if got := string(bytes.TrimSpace(capturedArgs)); got != strings.Join([]string{
		"--mode", "app",
		"--deployment-root", latestRoot,
		"--host", "0.0.0.0",
		"--port", "61234",
		"--no-open",
		"--workspace", workspaceRoot,
		"--setta-files-root", settaFilesRoot,
		"--log-level", "debug",
	}, " ") {
		t.Fatalf("unexpected delegated args %q", got)
	}
}

func TestRunAppRejectsNonAppExplicitDeploymentRoot(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	shareDeploymentRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(tempDir, "deployments", "demo-share", "v2"),
		"demo-share",
		"v2",
		deployments.TypeShare,
	)

	_, _, err := runAppCommandWithDeps(
		t,
		[]string{"--deployment-root", shareDeploymentRoot},
		globalFlags{},
		tempDir,
		startCommandDependencies{},
	)
	if err == nil {
		t.Fatal("expected non-app deployment error")
	}
	if got := DisplayError(err); got != "Deployment is not an app deployment: demo-share/v2" {
		t.Fatalf("unexpected manifest type error %q", got)
	}
}

func TestResolveAppDeploymentRootSelectsRequestedVersionFromCatalog(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	workspaceRoot := filepath.Join(tempDir, "workspace")
	settaFilesRoot := filepath.Join(tempDir, "state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-app", "v1"),
		"demo-app",
		"v1",
		deployments.TypeApp,
	)
	expectedRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-app", "v2"),
		"demo-app",
		"v2",
		deployments.TypeApp,
	)

	resolvedRoot, err := resolveDeploymentCommandRoot(
		deploymentFlags{
			deploymentName:    "demo-app",
			deploymentVersion: "v2",
		},
		globalFlags{
			workspaceRoot:  workspaceRoot,
			settaFilesRoot: settaFilesRoot,
		},
		func(string) (string, bool) {
			return "", false
		},
		tempDir,
		appCommandSpec,
	)
	if err != nil {
		t.Fatalf("resolve app deployment root: %v", err)
	}
	if resolvedRoot != expectedRoot {
		t.Fatalf("expected deployment root %q, got %q", expectedRoot, resolvedRoot)
	}
}

func TestRunAppRejectsReload(t *testing.T) {
	t.Parallel()

	_, _, err := runAppCommandWithDeps(
		t,
		[]string{"--deployment-name", "demo-app", "--latest"},
		globalFlags{reload: true},
		t.TempDir(),
		startCommandDependencies{},
	)
	if err == nil {
		t.Fatal("expected reload error")
	}
	if code := ExitCode(err); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if got := DisplayError(err); got != "App mode does not support --reload." {
		t.Fatalf("unexpected reload error %q", got)
	}
}

func TestRunAppDelegatesResolvedVersionWithExpectedArgs(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	workspaceRoot := filepath.Join(tempDir, "workspace")
	settaFilesRoot := filepath.Join(tempDir, "state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	expectedRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-app", "v2"),
		"demo-app",
		"v2",
		deployments.TypeApp,
	)
	enableSettacmdAppDeploymentRuntimePlugin(
		t,
		expectedRoot,
		firstpartyplugin.AppSubsystemPluginID,
		"Setta JSON Render App Generation",
	)

	var capturedExecutable string
	var capturedArgs []string
	err := runAppWithDeps(
		[]string{"--deployment-name", "demo-app", "--version", "v2"},
		globalFlags{
			workspaceRoot:     workspaceRoot,
			settaFilesRoot:    settaFilesRoot,
			profileLookupHome: filepath.Join(tempDir, ".setta"),
		},
		nil,
		io.Discard,
		io.Discard,
		func(string) (string, bool) {
			return "", false
		},
		tempDir,
		startCommandDependencies{
			resolveCurrentExecutable: func() (string, error) {
				return filepath.Join(tempDir, "bin", "setta"), nil
			},
			resolveServerExecutable: func(string, func(string) (string, bool)) (string, error) {
				return filepath.Join(tempDir, "bin", "setta-server"), nil
			},
			runServer: func(serverExecutable string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
				capturedExecutable = serverExecutable
				capturedArgs = append([]string(nil), args...)
				return nil
			},
		},
	)
	if err != nil {
		t.Fatalf("run app: %v", err)
	}
	if capturedExecutable != filepath.Join(tempDir, "bin", "setta-server") {
		t.Fatalf("expected server executable, got %q", capturedExecutable)
	}
	expectedArgs := []string{
		"--mode", "app",
		"--deployment-root", expectedRoot,
		"--host", "127.0.0.1",
		"--port", "0",
		"--workspace", workspaceRoot,
		"--profile-lookup-home", filepath.Join(tempDir, ".setta"),
		"--setta-files-root", settaFilesRoot,
	}
	if len(capturedArgs) != len(expectedArgs) {
		t.Fatalf("expected %d args, got %d: %#v", len(expectedArgs), len(capturedArgs), capturedArgs)
	}
	for index, expected := range expectedArgs {
		if capturedArgs[index] != expected {
			t.Fatalf("expected arg %d to be %q, got %q", index, expected, capturedArgs[index])
		}
	}
}

func TestRunAppRequiresEnabledAppSubsystemPlugin(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	workspaceRoot := filepath.Join(tempDir, "workspace")
	settaFilesRoot := filepath.Join(tempDir, "state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-app", "v2"),
		"demo-app",
		"v2",
		deployments.TypeApp,
	)

	_, _, err := runAppCommandWithDeps(
		t,
		[]string{"--deployment-name", "demo-app", "--version", "v2"},
		globalFlags{
			workspaceRoot:  workspaceRoot,
			settaFilesRoot: settaFilesRoot,
		},
		tempDir,
		startCommandDependencies{},
	)
	if err == nil {
		t.Fatal("expected app command to reject unavailable plugin")
	}
	if code := ExitCode(err); code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	expectedErr := "app mode requires a single active app subsystem provider with app deployment runtime support: no app subsystem provider is active"
	if got := DisplayError(err); got != expectedErr {
		t.Fatalf("expected exact provider-required error %q, got %q", expectedErr, got)
	}
}

func TestRunAppSupportsUnknownIDAppSubsystemPlugin(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	deploymentRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(tempDir, "deployments", "demo-app", "v7"),
		"demo-app",
		"v7",
		deployments.TypeApp,
	)
	enableSettacmdAppDeploymentRuntimePlugin(
		t,
		deploymentRoot,
		appsubsystemprovider.PluginID,
		"Unknown-id app subsystem fixture",
	)

	var capturedExecutable string
	var capturedArgs []string
	err := runAppWithDeps(
		[]string{"--deployment-root", deploymentRoot},
		globalFlags{
			profileLookupHome: filepath.Join(tempDir, ".setta"),
		},
		nil,
		io.Discard,
		io.Discard,
		func(string) (string, bool) {
			return "", false
		},
		tempDir,
		startCommandDependencies{
			resolveCurrentExecutable: func() (string, error) {
				return filepath.Join(tempDir, "bin", "setta"), nil
			},
			resolveServerExecutable: func(string, func(string) (string, bool)) (string, error) {
				return filepath.Join(tempDir, "bin", "setta-server"), nil
			},
			runServer: func(serverExecutable string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
				capturedExecutable = serverExecutable
				capturedArgs = append([]string(nil), args...)
				return nil
			},
		},
	)
	if err != nil {
		t.Fatalf("run app: %v", err)
	}
	if capturedExecutable != filepath.Join(tempDir, "bin", "setta-server") {
		t.Fatalf("expected server executable, got %q", capturedExecutable)
	}
	expectedArgs := []string{
		"--mode", "app",
		"--deployment-root", deploymentRoot,
		"--host", "127.0.0.1",
		"--port", "0",
		"--profile-lookup-home", filepath.Join(tempDir, ".setta"),
	}
	if len(capturedArgs) != len(expectedArgs) {
		t.Fatalf("expected %d args, got %d: %#v", len(expectedArgs), len(capturedArgs), capturedArgs)
	}
	for index, expected := range expectedArgs {
		if capturedArgs[index] != expected {
			t.Fatalf("expected arg %d to be %q, got %q", index, expected, capturedArgs[index])
		}
	}
}

func runAppCommandWithDeps(t *testing.T, args []string, global globalFlags, cwd string, deps startCommandDependencies) (string, string, error) {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := runAppWithDeps(args, global, nil, &stdout, &stderr, func(string) (string, bool) {
		return "", false
	}, cwd, deps)
	return stdout.String(), stderr.String(), err
}

func enableSettacmdAppDeploymentRuntimePlugin(t *testing.T, deploymentRoot string, pluginID string, pluginName string) {
	t.Helper()

	writeJSONFileForSettacmdTest(t, filepath.Join(deploymentRoot, ".setta_plugins", pluginID, "setta.plugin.json"), map[string]any{
		"schemaVersion":     1,
		"id":                pluginID,
		"name":              pluginName,
		"version":           "0.1.0",
		"settaVersionRange": ">=0.0.0",
		"enabledByDefault":  false,
		"featureCapabilities": map[string]any{
			"appSubsystem": map[string]any{
				"appDeploymentRuntime": true,
			},
		},
		"capabilities": []string{},
	})
	writeJSONFileForSettacmdTest(t, filepath.Join(deploymentRoot, "plugins_state.json"), map[string]any{
		"enabledPluginIds": []string{pluginID},
	})
}
