package settacmd

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/launcher"
)

func TestRunLauncherSetupStatusAndRemoveRoundTrip(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")

	setupStdout, _, setupErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "setup",
		"--json",
		"--channel", "uv-tool",
		"--install-source", "uv-tool",
		"--open-mode", "chrome-app",
		"--workspace-behavior", "always-prompt",
		"--no-install-artifacts",
	)
	if setupErr != nil {
		t.Fatalf("run launcher setup: %v", setupErr)
	}
	setupPayload := decodeJSONPayload(t, setupStdout)
	if ok := setupPayload["ok"].(bool); !ok {
		t.Fatalf("expected setup ok payload, got %#v", setupPayload)
	}
	if got := setupPayload["openMode"]; got != "chrome-app" {
		t.Fatalf("expected openMode chrome-app, got %#v", got)
	}
	if got := setupPayload["workspaceBehavior"]; got != "always_prompt" {
		t.Fatalf("expected workspaceBehavior always_prompt, got %#v", got)
	}
	if got := setupPayload["managedArtifacts"]; got == nil {
		t.Fatalf("expected managedArtifacts map, got %#v", got)
	}

	statusStdout, _, statusErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "status", "--json",
	)
	if statusErr != nil {
		t.Fatalf("run launcher status: %v", statusErr)
	}
	statusPayload := decodeJSONPayload(t, statusStdout)
	if ok := statusPayload["ok"].(bool); !ok {
		t.Fatalf("expected status ok payload, got %#v", statusPayload)
	}
	if installed := statusPayload["installed"].(bool); !installed {
		t.Fatalf("expected installed launcher, got %#v", statusPayload)
	}
	expectedMetadataPath, err := launcher.ResolveLauncherMetadataPath(settaHome)
	if err != nil {
		t.Fatalf("resolve launcher metadata path: %v", err)
	}
	if got := statusPayload["metadataPath"]; got != expectedMetadataPath {
		t.Fatalf("expected metadataPath %q, got %#v", expectedMetadataPath, got)
	}
	if got := statusPayload["channel"]; got != "uv-tool" {
		t.Fatalf("expected channel uv-tool, got %#v", got)
	}
	if got := statusPayload["updateCapability"]; got != "in_app" {
		t.Fatalf("expected updateCapability in_app, got %#v", got)
	}

	removeStdout, _, removeErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "remove", "--json",
	)
	if removeErr != nil {
		t.Fatalf("run launcher remove: %v", removeErr)
	}
	removePayload := decodeJSONPayload(t, removeStdout)
	if ok := removePayload["ok"].(bool); !ok {
		t.Fatalf("expected remove ok payload, got %#v", removePayload)
	}
	if removed := removePayload["metadataRemoved"].(bool); !removed {
		t.Fatalf("expected metadataRemoved true, got %#v", removePayload)
	}
	if removedPaths, ok := removePayload["removedPaths"].([]any); !ok || len(removedPaths) != 0 {
		t.Fatalf("expected empty removedPaths, got %#v", removePayload["removedPaths"])
	}
	if _, err := os.Stat(expectedMetadataPath); !os.IsNotExist(err) {
		t.Fatalf("expected launcher metadata to be removed, stat err=%v", err)
	}
}

func TestRunLauncherRepairRebindsMissingTarget(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	missingTarget := filepath.Join(t.TempDir(), "missing-setta")

	metadata, err := launcher.BuildLauncherInstallMetadata(launcher.LauncherInstallMetadataInput{
		TargetCommand:          []string{missingTarget},
		Channel:                "manual",
		InstallSource:          launcher.LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "repair-cli-token",
		SettaVersion:           "1.2.3",
		SettaHome:              settaHome,
		OpenMode:               launcher.LauncherOpenModeBrowser,
		WorkspaceBehavior:      launcher.LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build launcher metadata: %v", err)
	}
	if _, err := launcher.WriteLauncherInstallMetadata(settaHome, metadata); err != nil {
		t.Fatalf("write launcher metadata: %v", err)
	}

	stdout, _, runErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "repair", "--json",
	)
	if runErr != nil {
		t.Fatalf("run launcher repair: %v", runErr)
	}
	payload := decodeJSONPayload(t, stdout)
	status, ok := payload["status"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested status payload, got %#v", payload)
	}
	if statusOK := status["ok"].(bool); !statusOK {
		t.Fatalf("expected nested status ok=true, got %#v", status)
	}
	if targetValid := status["targetValid"].(bool); !targetValid {
		t.Fatalf("expected repaired targetValid true, got %#v", status)
	}
	targetCommand, ok := status["targetCommand"].([]any)
	if !ok || len(targetCommand) == 0 {
		t.Fatalf("expected targetCommand in repaired status, got %#v", status["targetCommand"])
	}
	currentExecutable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve current executable: %v", err)
	}
	resolvedCurrentExecutable, err := filepath.EvalSymlinks(currentExecutable)
	if err != nil {
		resolvedCurrentExecutable = currentExecutable
	}
	targetPath, ok := targetCommand[0].(string)
	if !ok {
		t.Fatalf("expected target command string, got %#v", targetCommand[0])
	}
	resolvedTargetPath, err := filepath.EvalSymlinks(targetPath)
	if err != nil {
		resolvedTargetPath = targetPath
	}
	if resolvedTargetPath != resolvedCurrentExecutable {
		t.Fatalf("expected repaired target command %q, got %q", resolvedCurrentExecutable, resolvedTargetPath)
	}
}

func TestRunLauncherUpdateReportsNotInstalled(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")

	stdout, _, runErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "update", "--json",
	)
	if runErr == nil {
		t.Fatal("expected launcher update failure when not installed")
	}
	if code := ExitCode(runErr); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	payload := decodeJSONPayload(t, stdout)
	errorPayload, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error payload, got %#v", payload)
	}
	if got := errorPayload["code"]; got != "LauncherNotInstalled" {
		t.Fatalf("expected LauncherNotInstalled error, got %#v", got)
	}
}

func TestRunLauncherSetupRejectsClearAndArtifactOptionsTogether(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")

	stdout, _, runErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "setup",
		"--json",
		"--artifact-option", "app_name=Setta Custom",
		"--clear-artifact-options",
	)
	if runErr == nil {
		t.Fatal("expected launcher setup validation error")
	}
	if code := ExitCode(runErr); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	payload := decodeJSONPayload(t, stdout)
	errorPayload, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error payload, got %#v", payload)
	}
	if got := errorPayload["code"]; got != "BadRequest" {
		t.Fatalf("expected BadRequest error, got %#v", got)
	}
}

func decodeJSONPayload(t *testing.T, raw string) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("decode json payload: %v\nraw=%q", err, raw)
	}
	return payload
}
