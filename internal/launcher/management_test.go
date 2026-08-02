package launcher

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
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

func TestManagementServiceResolveTargetCommandCanonicalizesExecutablePath(t *testing.T) {
	t.Parallel()

	executableDir := filepath.Join(t.TempDir(), "bin")
	resolvedExecutable := writeTestExecutable(t, executableDir, "setta")
	unresolvedExecutable := filepath.Join(executableDir, "..", filepath.Base(executableDir), "setta")

	service := newTestManagementService(t, unresolvedExecutable, "1.2.3", nil)

	if !reflect.DeepEqual(service.ResolveTargetCommand(), []string{resolvedExecutable}) {
		t.Fatalf("expected canonical target command [%q], got %#v", resolvedExecutable, service.ResolveTargetCommand())
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

func TestManagementServiceCollectStatusRejectsMetadataScopeMismatch(t *testing.T) {
	t.Parallel()

	executable := writeTestExecutable(t, t.TempDir(), "setta")
	service := newTestManagementService(t, executable, "1.2.3", nil)
	requestedSettaHome := filepath.Join(t.TempDir(), ".setta")
	metadataSettaHome := filepath.Join(t.TempDir(), ".setta-other")

	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{executable},
		Channel:                "manual",
		InstallSource:          LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "scope-token",
		SettaVersion:           "1.2.3",
		SettaHome:              metadataSettaHome,
		OpenMode:               LauncherOpenModeChromeApp,
		WorkspaceBehavior:      LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build mismatched metadata: %v", err)
	}
	if _, err := WriteLauncherInstallMetadata(requestedSettaHome, metadata); err != nil {
		t.Fatalf("write mismatched metadata: %v", err)
	}

	_, err = service.CollectStatus(requestedSettaHome)
	if err == nil {
		t.Fatal("expected collect status scope mismatch")
	}
	var setupErr *LauncherSetupError
	if !errors.As(err, &setupErr) {
		t.Fatalf("expected LauncherSetupError, got %T: %v", err, err)
	}
	if setupErr.Code != "LauncherMetadata" {
		t.Fatalf("expected LauncherMetadata, got %q (%v)", setupErr.Code, err)
	}
	if !strings.Contains(setupErr.Message, "does not match requested scope") {
		t.Fatalf("expected scope mismatch detail, got %q", setupErr.Message)
	}
}

func TestManagementServiceSetupRejectsMetadataScopeMismatch(t *testing.T) {
	t.Parallel()

	executable := writeTestExecutable(t, t.TempDir(), "setta")
	service := newTestManagementService(t, executable, "1.2.3", nil)
	requestedSettaHome := filepath.Join(t.TempDir(), ".setta")
	metadataSettaHome := filepath.Join(t.TempDir(), ".setta-other")

	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{executable},
		Channel:                "manual",
		InstallSource:          LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "scope-token",
		SettaVersion:           "1.2.3",
		SettaHome:              metadataSettaHome,
		OpenMode:               LauncherOpenModeChromeApp,
		WorkspaceBehavior:      LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build mismatched metadata: %v", err)
	}
	if _, err := WriteLauncherInstallMetadata(requestedSettaHome, metadata); err != nil {
		t.Fatalf("write mismatched metadata: %v", err)
	}

	_, err = service.Setup(requestedSettaHome, LauncherSetupInput{})
	if err == nil {
		t.Fatal("expected setup scope mismatch")
	}
	var setupErr *LauncherSetupError
	if !errors.As(err, &setupErr) {
		t.Fatalf("expected LauncherSetupError, got %T: %v", err, err)
	}
	if setupErr.Code != "LauncherMetadata" {
		t.Fatalf("expected LauncherMetadata, got %q (%v)", setupErr.Code, err)
	}
	if !strings.Contains(setupErr.Message, "does not match requested scope") {
		t.Fatalf("expected scope mismatch detail, got %q", setupErr.Message)
	}
}

func TestManagementServiceSetupRejectsArtifactPathsOutsideTrustedRoots(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	service := newTestManagementService(t, executable, "1.2.3", nil)
	settaHome := filepath.Join(homeDir, ".setta")
	installArtifacts := true
	outsidePath := filepath.Join(t.TempDir(), "outside", "setta-launcher")
	artifactOptions := launcherOutsideTrustedRootOptions(outsidePath)

	_, err := service.Setup(settaHome, LauncherSetupInput{
		InstallArtifacts: &installArtifacts,
		ArtifactOptions:  &artifactOptions,
	})
	if err == nil {
		t.Fatal("expected outside trusted roots error")
	}
	var setupErr *LauncherSetupError
	if !errors.As(err, &setupErr) {
		t.Fatalf("expected LauncherSetupError, got %T: %v", err, err)
	}
	if setupErr.Code != "BadRequest" {
		t.Fatalf("expected BadRequest, got %q (%v)", setupErr.Code, err)
	}
	if !strings.Contains(setupErr.Message, "outside trusted roots") {
		t.Fatalf("expected outside trusted roots detail, got %q", setupErr.Message)
	}

	status, err := service.CollectStatus(settaHome)
	if err != nil {
		t.Fatalf("collect launcher status after rejected setup: %v", err)
	}
	if status.Installed {
		t.Fatalf("expected failed setup to leave launcher uninstalled, got %#v", status)
	}
}

func TestManagementServiceRemoveRejectsManagedArtifactsOutsideTrustedRoots(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	service := newTestManagementService(t, executable, "1.2.3", nil)
	settaHome := filepath.Join(homeDir, ".setta")
	outsidePath := filepath.Join(t.TempDir(), "outside", "managed-artifact")

	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{executable},
		Channel:                "manual",
		InstallSource:          LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "outside-token",
		SettaVersion:           "1.2.3",
		SettaHome:              settaHome,
		OpenMode:               LauncherOpenModeChromeApp,
		WorkspaceBehavior:      LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{},
		ManagedArtifacts: map[string]string{
			launcherManagedArtifactKeyForPlatform(): outsidePath,
		},
	})
	if err != nil {
		t.Fatalf("build metadata with outside artifact: %v", err)
	}
	if _, err := WriteLauncherInstallMetadata(settaHome, metadata); err != nil {
		t.Fatalf("write metadata with outside artifact: %v", err)
	}

	_, err = service.Remove(settaHome)
	if err == nil {
		t.Fatal("expected remove to reject outside trusted roots")
	}
	var setupErr *LauncherSetupError
	if !errors.As(err, &setupErr) {
		t.Fatalf("expected LauncherSetupError, got %T: %v", err, err)
	}
	if setupErr.Code != "LauncherMetadata" {
		t.Fatalf("expected LauncherMetadata, got %q (%v)", setupErr.Code, err)
	}
	if !strings.Contains(setupErr.Message, "outside trusted roots") {
		t.Fatalf("expected outside trusted roots detail, got %q", setupErr.Message)
	}
	metadataPath, err := resolveLauncherMetadataPath(settaHome)
	if err != nil {
		t.Fatalf("resolve launcher metadata path: %v", err)
	}
	if _, err := os.Stat(metadataPath); err != nil {
		t.Fatalf("expected metadata to remain after rejected remove: %v", err)
	}
}

func TestValidatePlannedArtifactPathsRejectsDuplicatePaths(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	settaHome := filepath.Join(homeDir, ".setta")
	launcherDir, err := resolveLauncherDir(settaHome)
	if err != nil {
		t.Fatalf("resolve launcher dir: %v", err)
	}
	duplicatePath := filepath.Join(launcherDir, "duplicate-artifact")

	err = validatePlannedArtifactPaths(map[string]string{
		"artifact-a": duplicatePath,
		"artifact-b": duplicatePath,
	}, settaHome)
	if err == nil {
		t.Fatal("expected duplicate artifact paths to fail")
	}
	var setupErr *LauncherSetupError
	if !errors.As(err, &setupErr) {
		t.Fatalf("expected LauncherSetupError, got %T: %v", err, err)
	}
	if setupErr.Code != "BadRequest" {
		t.Fatalf("expected BadRequest, got %q (%v)", setupErr.Code, err)
	}
	if !strings.Contains(setupErr.Message, "must be unique") {
		t.Fatalf("expected duplicate-path detail, got %q", setupErr.Message)
	}
}

func TestManagementServiceSetupReturnsArtifactInstallFailedWhenManagedArtifactInstallFails(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	service := newTestManagementService(t, executable, "1.2.3", nil)
	settaHome := filepath.Join(homeDir, ".setta")

	optionKey, artifactPath, err := failingArtifactOptionForPlatform(homeDir)
	if err != nil {
		t.Fatalf("prepare failing artifact option: %v", err)
	}
	artifactOptions := map[string]string{optionKey: artifactPath}
	installArtifacts := true

	_, err = service.Setup(settaHome, LauncherSetupInput{
		InstallArtifacts: &installArtifacts,
		ArtifactOptions:  &artifactOptions,
	})
	if err == nil {
		t.Fatal("expected artifact install failure")
	}
	var setupErr *LauncherSetupError
	if !errors.As(err, &setupErr) {
		t.Fatalf("expected LauncherSetupError, got %T: %v", err, err)
	}
	if setupErr.Code != "ArtifactInstallFailed" {
		t.Fatalf("expected ArtifactInstallFailed, got %q (%v)", setupErr.Code, err)
	}

	status, err := service.CollectStatus(settaHome)
	if err != nil {
		t.Fatalf("collect launcher status after failed install: %v", err)
	}
	if status.Installed {
		t.Fatalf("expected failed setup to leave launcher uninstalled, got %#v", status)
	}
}

func TestManagementServiceSetupCleansUpManagedArtifactsWhenMetadataWriteFails(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	service := newTestManagementService(t, executable, "1.2.3", nil)
	settaHome := filepath.Join(homeDir, ".setta")

	plannedArtifacts, err := planCurrentPlatformArtifactPaths(launcherArtifactContext{
		TargetCommand:            []string{executable},
		SettaHome:                settaHome,
		ExistingManagedArtifacts: map[string]string{},
		Options:                  map[string]string{},
	})
	if err != nil {
		t.Fatalf("plan managed artifacts: %v", err)
	}
	launcherDir, err := resolveLauncherDir(settaHome)
	if err != nil {
		t.Fatalf("resolve launcher dir: %v", err)
	}
	if err := os.MkdirAll(launcherDir, 0o755); err != nil {
		t.Fatalf("mkdir launcher dir: %v", err)
	}
	if err := os.Chmod(launcherDir, 0o555); err != nil {
		t.Fatalf("chmod launcher dir read-only: %v", err)
	}
	defer os.Chmod(launcherDir, 0o755)
	installArtifacts := true

	_, err = service.Setup(settaHome, LauncherSetupInput{
		InstallArtifacts: &installArtifacts,
	})
	if err == nil {
		t.Fatal("expected metadata write failure")
	}
	var setupErr *LauncherSetupError
	if !errors.As(err, &setupErr) {
		t.Fatalf("expected LauncherSetupError, got %T: %v", err, err)
	}
	if setupErr.Code != "LauncherMetadata" {
		t.Fatalf("expected LauncherMetadata, got %q (%v)", setupErr.Code, err)
	}
	for artifactKey, artifactPath := range plannedArtifacts {
		if _, err := os.Lstat(artifactPath); !os.IsNotExist(err) {
			t.Fatalf("expected cleanup to remove artifact %s at %q, stat err=%v", artifactKey, artifactPath, err)
		}
		markerPath := expectedOwnershipMarkerPath(artifactKey, artifactPath)
		if _, err := os.Lstat(markerPath); !os.IsNotExist(err) {
			t.Fatalf("expected cleanup to remove ownership marker for %s at %q, stat err=%v", artifactKey, markerPath, err)
		}
	}

	status, err := service.CollectStatus(settaHome)
	if err != nil {
		t.Fatalf("collect launcher status after metadata write failure: %v", err)
	}
	if status.Installed {
		t.Fatalf("expected metadata write failure to leave launcher uninstalled, got %#v", status)
	}
}

func launcherOutsideTrustedRootOptions(path string) map[string]string {
	switch runtime.GOOS {
	case "darwin":
		return map[string]string{"app_path": path}
	default:
		return map[string]string{"wrapper_path": path}
	}
}

func launcherManagedArtifactKeyForPlatform() string {
	switch runtime.GOOS {
	case "darwin":
		return "macosApp"
	case "windows":
		return "windowsWrapper"
	default:
		return "linuxWrapper"
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

func failingArtifactOptionForPlatform(homeDir string) (string, string, error) {
	switch runtime.GOOS {
	case "darwin":
		blockedPath := filepath.Join(homeDir, "Applications", "Setta.app")
		if err := os.MkdirAll(filepath.Dir(blockedPath), 0o755); err != nil {
			return "", "", err
		}
		if err := os.WriteFile(blockedPath, []byte("not an app dir"), 0o644); err != nil {
			return "", "", err
		}
		return "app_path", blockedPath, nil
	case "windows":
		blockedPath := filepath.Join(resolveEnvPathLoose("LOCALAPPDATA", filepath.Join(homeDir, "AppData", "Local")), "Setta", "Launcher", "setta-launcher.cmd")
		if err := os.MkdirAll(blockedPath, 0o755); err != nil {
			return "", "", err
		}
		return "wrapper_path", blockedPath, nil
	default:
		blockedPath := filepath.Join(homeDir, ".local", "share", "setta", "launcher", "setta-launcher")
		if err := os.MkdirAll(blockedPath, 0o755); err != nil {
			return "", "", err
		}
		return "wrapper_path", blockedPath, nil
	}
}

func expectedOwnershipMarkerPath(artifactKey string, artifactPath string) string {
	if artifactKey == "macosApp" {
		return filepath.Join(artifactPath, artifactOwnershipMarkerBasename)
	}
	return filepath.Join(filepath.Dir(artifactPath), "."+filepath.Base(artifactPath)+artifactOwnershipMarkerBasename)
}
