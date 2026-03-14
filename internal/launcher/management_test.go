package launcher

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestManagementServiceCollectStatusReportsNotInstalled(t *testing.T) {
	t.Parallel()

	service := newTestManagementService(t, writeTestExecutable(t, t.TempDir(), "setta"), "1.2.3", nil)
	settaHome := filepath.Join(t.TempDir(), ".setta")

	status, err := service.CollectStatus(settaHome)
	if err != nil {
		t.Fatalf("collect launcher status: %v", err)
	}
	if status.Installed {
		t.Fatalf("expected launcher to be uninstalled, got %#v", status)
	}
	if status.UpdateCapability != LauncherUpdateCapabilityUnsupported {
		t.Fatalf("expected unsupported update capability, got %q", status.UpdateCapability)
	}
	if status.UpdateGuidance == nil || *status.UpdateGuidance == "" {
		t.Fatalf("expected update guidance for missing launcher, got %#v", status.UpdateGuidance)
	}
}

func TestManagementServiceSetupDefaultsFreshInstallToMetadataOnly(t *testing.T) {
	t.Parallel()

	executable := writeTestExecutable(t, t.TempDir(), "setta")
	service := newTestManagementService(t, executable, "1.2.3", nil)
	settaHome := filepath.Join(t.TempDir(), ".setta")

	if _, err := service.Setup(settaHome, LauncherSetupInput{}); err != nil {
		t.Fatalf("setup metadata-only launcher install: %v", err)
	}

	status, err := service.CollectStatus(settaHome)
	if err != nil {
		t.Fatalf("collect launcher status after setup: %v", err)
	}
	if !status.Installed {
		t.Fatalf("expected launcher to be installed, got %#v", status)
	}
	if len(status.ManagedArtifacts) != 0 {
		t.Fatalf("expected metadata-only install, got managed artifacts %#v", status.ManagedArtifacts)
	}
	if !reflect.DeepEqual(status.TargetCommand, []string{executable}) {
		t.Fatalf("expected target command [%q], got %#v", executable, status.TargetCommand)
	}
	if status.Channel == nil || *status.Channel != "manual" {
		t.Fatalf("expected default channel manual, got %#v", status.Channel)
	}
	if status.OpenMode == nil || *status.OpenMode != LauncherOpenModeChromeApp {
		t.Fatalf("expected default open mode chrome-app, got %#v", status.OpenMode)
	}
	if status.WorkspaceBehavior == nil || *status.WorkspaceBehavior != LauncherWorkspaceBehaviorDefault {
		t.Fatalf("expected default workspace behavior %q, got %#v", LauncherWorkspaceBehaviorDefault, status.WorkspaceBehavior)
	}
	if status.SettaVersion == nil || *status.SettaVersion != "1.2.3" {
		t.Fatalf("expected setta version 1.2.3, got %#v", status.SettaVersion)
	}
}

func TestManagementServiceSetupPreservesExistingMetadataOnlyIdentityWhenFieldsOmitted(t *testing.T) {
	t.Parallel()

	currentExecutable := writeTestExecutable(t, t.TempDir(), "current-setta")
	service := newTestManagementService(t, currentExecutable, "1.2.3", nil)
	settaHome := filepath.Join(t.TempDir(), ".setta")
	previousExecutable := writeTestExecutable(t, t.TempDir(), "previous-setta")

	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{previousExecutable},
		Channel:                "uv-tool",
		InstallSource:          LauncherInstallSourceUVTool,
		ArtifactOwnershipToken: "preserve-token",
		SettaVersion:           "0.0.1",
		SettaHome:              settaHome,
		OpenMode:               LauncherOpenModeBrowser,
		WorkspaceBehavior:      LauncherWorkspaceBehaviorAlwaysPrompt,
		ArtifactOptions:        map[string]string{"app_name": "Setta Custom"},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build existing launcher metadata: %v", err)
	}
	if _, err := WriteLauncherInstallMetadata(settaHome, metadata); err != nil {
		t.Fatalf("write existing launcher metadata: %v", err)
	}

	if _, err := service.Setup(settaHome, LauncherSetupInput{}); err != nil {
		t.Fatalf("rerun setup with omitted fields: %v", err)
	}

	status, err := service.CollectStatus(settaHome)
	if err != nil {
		t.Fatalf("collect launcher status after preserving setup: %v", err)
	}
	if status.Channel == nil || *status.Channel != "uv-tool" {
		t.Fatalf("expected preserved channel uv-tool, got %#v", status.Channel)
	}
	if status.OpenMode == nil || *status.OpenMode != LauncherOpenModeBrowser {
		t.Fatalf("expected preserved open mode browser, got %#v", status.OpenMode)
	}
	if status.WorkspaceBehavior == nil || *status.WorkspaceBehavior != LauncherWorkspaceBehaviorAlwaysPrompt {
		t.Fatalf("expected preserved workspace behavior always_prompt, got %#v", status.WorkspaceBehavior)
	}
	if !reflect.DeepEqual(status.ArtifactOptions, map[string]string{"app_name": "Setta Custom"}) {
		t.Fatalf("expected preserved artifact options, got %#v", status.ArtifactOptions)
	}
	if len(status.ManagedArtifacts) != 0 {
		t.Fatalf("expected no managed artifacts after omitted installArtifacts, got %#v", status.ManagedArtifacts)
	}
	if !reflect.DeepEqual(status.TargetCommand, []string{currentExecutable}) {
		t.Fatalf("expected setup to rebind target command to current executable %q, got %#v", currentExecutable, status.TargetCommand)
	}
	if status.UpdateCapability != LauncherUpdateCapabilityInApp {
		t.Fatalf("expected in-app update capability for preserved uv-tool install, got %q", status.UpdateCapability)
	}
}

func TestManagementServiceRepairRebindsMissingTargetForMetadataOnlyInstall(t *testing.T) {
	t.Parallel()

	currentExecutable := writeTestExecutable(t, t.TempDir(), "current-setta")
	service := newTestManagementService(t, currentExecutable, "1.2.3", nil)
	settaHome := filepath.Join(t.TempDir(), ".setta")
	missingTarget := filepath.Join(t.TempDir(), "missing-setta")

	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{missingTarget},
		Channel:                "manual",
		InstallSource:          LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "repair-token",
		SettaVersion:           "0.0.1",
		SettaHome:              settaHome,
		OpenMode:               LauncherOpenModeBrowser,
		WorkspaceBehavior:      LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build repair metadata: %v", err)
	}
	if _, err := WriteLauncherInstallMetadata(settaHome, metadata); err != nil {
		t.Fatalf("write repair metadata: %v", err)
	}

	status, err := service.Repair(settaHome)
	if err != nil {
		t.Fatalf("repair metadata-only launcher install: %v", err)
	}
	if status.TargetValid == nil || !*status.TargetValid {
		t.Fatalf("expected repaired target to be valid, got %#v", status.TargetValid)
	}
	if status.TargetError != nil {
		t.Fatalf("expected repaired target error to clear, got %#v", status.TargetError)
	}
	if !reflect.DeepEqual(status.TargetCommand, []string{currentExecutable}) {
		t.Fatalf("expected repaired target command [%q], got %#v", currentExecutable, status.TargetCommand)
	}
}

func TestManagementServiceUpdateRunsUVAndRebindsMetadataOnlyUVToolInstall(t *testing.T) {
	t.Parallel()

	currentExecutable := writeTestExecutable(t, t.TempDir(), "current-setta")
	uvBin := writeTestExecutable(t, filepath.Join(t.TempDir(), "bin"), "uv")
	uvToolBinDir := filepath.Join(t.TempDir(), "uv-tool-bin")
	if err := os.MkdirAll(uvToolBinDir, 0o755); err != nil {
		t.Fatalf("mkdir uv tool bin dir: %v", err)
	}
	updatedExecutable := writeTestExecutable(t, uvToolBinDir, "setta")

	calls := make([][]string, 0)
	service := newTestManagementService(t, currentExecutable, "9.9.9", func(args []string) (launcherCommandResult, error) {
		calls = append(calls, append([]string(nil), args...))
		switch {
		case reflect.DeepEqual(args, []string{uvBin, "tool", "install", "--upgrade", "setta"}):
			return launcherCommandResult{ExitCode: 0}, nil
		case reflect.DeepEqual(args, []string{uvBin, "tool", "dir", "--bin"}):
			return launcherCommandResult{ExitCode: 0, Stdout: uvToolBinDir + "\n"}, nil
		default:
			t.Fatalf("unexpected launcher command args %#v", args)
			return launcherCommandResult{}, nil
		}
	})
	service.which = func(name string) string {
		if name == "uv" {
			return uvBin
		}
		return ""
	}

	settaHome := filepath.Join(t.TempDir(), ".setta")
	previousExecutable := writeTestExecutable(t, t.TempDir(), "previous-setta")
	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{previousExecutable},
		Channel:                "uv-tool",
		InstallSource:          LauncherInstallSourceUVTool,
		ArtifactOwnershipToken: "update-token",
		SettaVersion:           "1.2.3",
		SettaHome:              settaHome,
		OpenMode:               LauncherOpenModeBrowser,
		WorkspaceBehavior:      LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{"app_name": "Setta"},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build update metadata: %v", err)
	}
	if _, err := WriteLauncherInstallMetadata(settaHome, metadata); err != nil {
		t.Fatalf("write update metadata: %v", err)
	}

	result, err := service.Update(settaHome, "setta")
	if err != nil {
		t.Fatalf("update metadata-only uv-tool install: %v", err)
	}
	if result.PackageSpec != "setta" {
		t.Fatalf("expected package spec setta, got %q", result.PackageSpec)
	}
	if result.FromVersion == nil || *result.FromVersion != "1.2.3" {
		t.Fatalf("expected fromVersion 1.2.3, got %#v", result.FromVersion)
	}
	if result.ToVersion == nil || *result.ToVersion != "9.9.9" {
		t.Fatalf("expected toVersion 9.9.9, got %#v", result.ToVersion)
	}
	if !reflect.DeepEqual(result.Status.TargetCommand, []string{updatedExecutable}) {
		t.Fatalf("expected updated target command [%q], got %#v", updatedExecutable, result.Status.TargetCommand)
	}
	if len(calls) != 2 {
		t.Fatalf("expected two uv calls, got %#v", calls)
	}
	if !reflect.DeepEqual(calls[0], []string{uvBin, "tool", "install", "--upgrade", "setta"}) {
		t.Fatalf("unexpected first uv call %#v", calls[0])
	}
	if !reflect.DeepEqual(calls[1], []string{uvBin, "tool", "dir", "--bin"}) {
		t.Fatalf("unexpected second uv call %#v", calls[1])
	}
}

func newTestManagementService(
	t *testing.T,
	executablePath string,
	version string,
	runCommand launcherCommandRunner,
) *ManagementService {
	t.Helper()

	service, err := NewManagementService(ManagementServiceOptions{
		ExecutablePath: executablePath,
		Version:        version,
		RunCommand:     runCommand,
	})
	if err != nil {
		t.Fatalf("new launcher management service: %v", err)
	}
	return service
}

func writeTestExecutable(t *testing.T, dir string, name string) string {
	t.Helper()

	path := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir executable dir: %v", err)
	}
	if err := os.WriteFile(path, []byte("#!/usr/bin/env bash\n"), 0o755); err != nil {
		t.Fatalf("write test executable: %v", err)
	}
	resolvedPath, err := resolvePathLoose(path)
	if err != nil {
		t.Fatalf("resolve executable path: %v", err)
	}
	return resolvedPath
}
