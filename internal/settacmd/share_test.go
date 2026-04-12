package settacmd

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/deployments"
	"setta/internal/projectstate"
)

func TestRunRoutesShareSubcommandAndDelegatesLatestDeployment(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	workspaceRoot := filepath.Join(tempDir, "workspace")
	settaFilesRoot := filepath.Join(tempDir, "state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-share", "v1"),
		"demo-share",
		"v1",
		deployments.TypeShare,
	)
	latestRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-share", "v3"),
		"demo-share",
		"v3",
		deployments.TypeShare,
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
			"share",
			"--deployment-name", "demo-share",
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
		t.Fatalf("run share: %v", err)
	}
	if stderr.Len() != 0 {
		t.Fatalf("expected empty stderr, got %q", stderr.String())
	}

	capturedArgs, err := os.ReadFile(argsCapturePath)
	if err != nil {
		t.Fatalf("read captured args: %v", err)
	}
	if got := string(bytes.TrimSpace(capturedArgs)); got != strings.Join([]string{
		"--mode", "share",
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

func TestRunShareRejectsMixedDeploymentSelectionFlags(t *testing.T) {
	t.Parallel()

	explicitRoot := filepath.Join(t.TempDir(), "deployment-root")
	stdout, stderr, err := runShareCommandWithDeps(
		t,
		[]string{
			"--deployment-root", explicitRoot,
			"--deployment-name", "demo-share",
			"--latest",
		},
		globalFlags{},
		t.TempDir(),
		startCommandDependencies{},
	)
	if err == nil {
		t.Fatal("expected mixed deployment selection error")
	}
	if code := ExitCode(err); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if stdout != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if got := DisplayError(err); got != "Use either --deployment-root or --deployment-name/--version/--latest." {
		t.Fatalf("unexpected validation error %q", got)
	}
}

func TestResolveShareDeploymentRootUsesExplicitRoot(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	deploymentRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(tempDir, "deployments", "demo-share", "v1"),
		"demo-share",
		"v1",
		deployments.TypeShare,
	)

	resolvedRoot, err := resolveShareDeploymentRoot(
		shareFlags{deploymentRoot: deploymentRoot},
		globalFlags{},
		func(string) (string, bool) {
			return "", false
		},
		tempDir,
	)
	if err != nil {
		t.Fatalf("resolve share deployment root: %v", err)
	}
	if resolvedRoot != deploymentRoot {
		t.Fatalf("expected deployment root %q, got %q", deploymentRoot, resolvedRoot)
	}
}

func TestResolveShareDeploymentRootRejectsMissingSelectionInputs(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	deploymentRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(tempDir, "deployments", "demo-share", "v1"),
		"demo-share",
		"v1",
		deployments.TypeShare,
	)

	testCases := []struct {
		name    string
		parsed  shareFlags
		wantErr string
	}{
		{
			name: "mixed explicit root and named selectors",
			parsed: shareFlags{
				deploymentRoot: deploymentRoot,
				deploymentName: "demo-share",
			},
			wantErr: "Use either --deployment-root or --deployment-name/--version/--latest.",
		},
		{
			name:    "missing deployment name",
			parsed:  shareFlags{},
			wantErr: "Missing --deployment-name (or use --deployment-root).",
		},
		{
			name: "missing version or latest",
			parsed: shareFlags{
				deploymentName: "demo-share",
			},
			wantErr: "Missing --version or --latest.",
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			_, err := resolveShareDeploymentRoot(
				testCase.parsed,
				globalFlags{},
				func(string) (string, bool) {
					return "", false
				},
				tempDir,
			)
			if err == nil {
				t.Fatal("expected resolveShareDeploymentRoot error")
			}
			if err.Error() != testCase.wantErr {
				t.Fatalf("resolveShareDeploymentRoot error = %q, want %q", err.Error(), testCase.wantErr)
			}
		})
	}
}

func TestRunShareRejectsInvalidVersionFormat(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	workspaceRoot := filepath.Join(tempDir, "workspace")
	settaFilesRoot := filepath.Join(tempDir, "state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-share", "v1"),
		"demo-share",
		"v1",
		deployments.TypeShare,
	)

	_, _, err := runShareCommandWithDeps(
		t,
		[]string{"--deployment-name", "demo-share", "--version", "3"},
		globalFlags{
			workspaceRoot:  workspaceRoot,
			settaFilesRoot: settaFilesRoot,
		},
		tempDir,
		startCommandDependencies{},
	)
	if err == nil {
		t.Fatal("expected invalid version error")
	}
	if got := DisplayError(err); got != "Invalid --version value. Expected vN (for example v3)." {
		t.Fatalf("unexpected invalid version error %q", got)
	}
}

func TestRunShareRejectsNonShareExplicitDeploymentRoot(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	appDeploymentRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(tempDir, "deployments", "demo-app", "v2"),
		"demo-app",
		"v2",
		deployments.TypeApp,
	)

	_, _, err := runShareCommandWithDeps(
		t,
		[]string{"--deployment-root", appDeploymentRoot},
		globalFlags{},
		tempDir,
		startCommandDependencies{},
	)
	if err == nil {
		t.Fatal("expected non-share deployment error")
	}
	if got := DisplayError(err); got != "Deployment is not a share deployment: demo-app/v2" {
		t.Fatalf("unexpected manifest type error %q", got)
	}
}

func TestResolveShareDeploymentRootSelectsRequestedVersionFromCatalog(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	workspaceRoot := filepath.Join(tempDir, "workspace")
	settaFilesRoot := filepath.Join(tempDir, "state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-share", "v1"),
		"demo-share",
		"v1",
		deployments.TypeShare,
	)
	expectedRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-share", "v2"),
		"demo-share",
		"v2",
		deployments.TypeShare,
	)

	resolvedRoot, err := resolveShareDeploymentRoot(
		shareFlags{
			deploymentName:    "demo-share",
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
	)
	if err != nil {
		t.Fatalf("resolve share deployment root: %v", err)
	}
	if resolvedRoot != expectedRoot {
		t.Fatalf("expected deployment root %q, got %q", expectedRoot, resolvedRoot)
	}
}

func TestResolveShareDeploymentRootSelectsLatestVersionFromCatalog(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	workspaceRoot := filepath.Join(tempDir, "workspace")
	settaFilesRoot := filepath.Join(tempDir, "state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-share", "v0"),
		"demo-share",
		"v0",
		deployments.TypeShare,
	)
	writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-share", "v2"),
		"demo-share",
		"v2",
		deployments.TypeShare,
	)
	expectedRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-share", "v3"),
		"demo-share",
		"v3",
		deployments.TypeShare,
	)

	resolvedRoot, err := resolveShareDeploymentRoot(
		shareFlags{
			deploymentName: "demo-share",
			latest:         true,
		},
		globalFlags{
			workspaceRoot:  workspaceRoot,
			settaFilesRoot: settaFilesRoot,
		},
		func(string) (string, bool) {
			return "", false
		},
		tempDir,
	)
	if err != nil {
		t.Fatalf("resolve latest share deployment root: %v", err)
	}
	if resolvedRoot != expectedRoot {
		t.Fatalf("expected latest deployment root %q, got %q", expectedRoot, resolvedRoot)
	}
}

func TestResolveShareDeploymentRootAcceptsVersionZeroFromCatalog(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	workspaceRoot := filepath.Join(tempDir, "workspace")
	settaFilesRoot := filepath.Join(tempDir, "state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	expectedRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-share", "v0"),
		"demo-share",
		"v0",
		deployments.TypeShare,
	)

	resolvedRoot, err := resolveShareDeploymentRoot(
		shareFlags{
			deploymentName:    "demo-share",
			deploymentVersion: "v0",
		},
		globalFlags{
			workspaceRoot:  workspaceRoot,
			settaFilesRoot: settaFilesRoot,
		},
		func(string) (string, bool) {
			return "", false
		},
		tempDir,
	)
	if err != nil {
		t.Fatalf("resolve share deployment root for v0: %v", err)
	}
	if resolvedRoot != expectedRoot {
		t.Fatalf("expected deployment root %q, got %q", expectedRoot, resolvedRoot)
	}
}

func TestRunShareRejectsReload(t *testing.T) {
	t.Parallel()

	_, _, err := runShareCommandWithDeps(
		t,
		[]string{"--deployment-name", "demo-share", "--latest"},
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
	if got := DisplayError(err); got != "Share mode does not support --reload." {
		t.Fatalf("unexpected reload error %q", got)
	}
}

func runShareCommandWithDeps(t *testing.T, args []string, global globalFlags, cwd string, deps startCommandDependencies) (string, string, error) {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := runShareWithDeps(args, global, nil, &stdout, &stderr, func(string) (string, bool) {
		return "", false
	}, cwd, deps)
	return stdout.String(), stderr.String(), err
}

func writeShareDeploymentFixture(t *testing.T, deploymentRoot string, deploymentName string, deploymentVersion string, deploymentType deployments.Type) string {
	t.Helper()

	projectID := "project-alpha"
	writeShareDocument(t, filepath.Join(deploymentRoot, projectstate.MainFileName), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: projectID,
		Projects: map[string]projectstate.Project{
			projectID: {
				ID:   projectID,
				Name: "Alpha",
			},
		},
	})
	writeShareJSON(t, filepath.Join(deploymentRoot, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         deploymentName,
		"deploymentType":         string(deploymentType),
		"defaultProjectConfigId": projectID,
		"deploymentVersion":      deploymentVersion,
		"createdAt":              time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC).Format(time.RFC3339Nano),
	})

	resolvedRoot, err := filepath.Abs(deploymentRoot)
	if err != nil {
		t.Fatalf("resolve deployment root: %v", err)
	}
	return filepath.Clean(resolvedRoot)
}

func writeShareDocument(t *testing.T, path string, document projectstate.Document) {
	t.Helper()

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize deployment document: %v", err)
	}
	payload, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		t.Fatalf("marshal deployment document: %v", err)
	}
	payload = append(payload, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir deployment document dir: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("write deployment document: %v", err)
	}
}

func writeShareJSON(t *testing.T, path string, payload any) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal deployment json: %v", err)
	}
	encoded = append(encoded, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir deployment json dir: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write deployment json: %v", err)
	}
}

func TestRunShareDelegatesResolvedVersionWithExpectedArgs(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	workspaceRoot := filepath.Join(tempDir, "workspace")
	settaFilesRoot := filepath.Join(tempDir, "state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	expectedRoot := writeShareDeploymentFixture(
		t,
		filepath.Join(settaFilesRoot, "deployments", "demo-share", "v2"),
		"demo-share",
		"v2",
		deployments.TypeShare,
	)

	var capturedExecutable string
	var capturedArgs []string
	err := runShareWithDeps(
		[]string{"--deployment-name", "demo-share", "--version", "v2"},
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
		t.Fatalf("run share: %v", err)
	}
	if capturedExecutable != filepath.Join(tempDir, "bin", "setta-server") {
		t.Fatalf("expected server executable, got %q", capturedExecutable)
	}
	expectedArgs := []string{
		"--mode", "share",
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
