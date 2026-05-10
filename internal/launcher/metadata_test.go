package launcher

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestBuildLauncherInstallMetadataDefaultsWorkspaceBehaviorAndRoundTripsFields(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	settaHome := filepath.Join(baseRoot, ".setta")
	targetExecutable := filepath.Join(baseRoot, "python")
	if err := os.WriteFile(targetExecutable, []byte("#!/usr/bin/env bash\n"), 0o755); err != nil {
		t.Fatalf("write target executable: %v", err)
	}

	lastUsedWorkspace := filepath.Join(baseRoot, "workspace")
	managedArtifact := filepath.Join(baseRoot, "Applications", "Setta.app")
	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{targetExecutable, "-m", "setta"},
		Channel:                "uv-tool",
		InstallSource:          LauncherInstallSourceUVTool,
		ArtifactOwnershipToken: "roundtrip-token",
		SettaVersion:           "1.2.3",
		SettaHome:              settaHome,
		OpenMode:               LauncherOpenModeBrowser,
		LastUsedWorkspace:      stringPointer(lastUsedWorkspace),
		ArtifactOptions:        map[string]string{"app_name": "Setta"},
		ManagedArtifacts:       map[string]string{"macosApp": managedArtifact},
	})
	if err != nil {
		t.Fatalf("build launcher metadata: %v", err)
	}
	assertDefaultLauncherWorkspaceBehavior(t, metadata)

	loaded := writeAndLoadLauncherInstallMetadata(t, settaHome, metadata)
	assertLoadedLauncherInstallMetadataRoundTrip(t, loaded, metadata)
}

func assertDefaultLauncherWorkspaceBehavior(t *testing.T, metadata LauncherInstallMetadata) {
	t.Helper()

	if metadata.WorkspaceBehavior != string(LauncherWorkspaceBehaviorDefault) {
		t.Fatalf("expected default workspace behavior %q, got %q", LauncherWorkspaceBehaviorDefault, metadata.WorkspaceBehavior)
	}
}

func writeAndLoadLauncherInstallMetadata(
	t *testing.T,
	settaHome string,
	metadata LauncherInstallMetadata,
) *LauncherInstallMetadata {
	t.Helper()

	metadataPath, err := WriteLauncherInstallMetadata(settaHome, metadata)
	if err != nil {
		t.Fatalf("write launcher metadata: %v", err)
	}
	expectedMetadataPath, err := resolveLauncherMetadataPath(settaHome)
	if err != nil {
		t.Fatalf("resolve launcher metadata path: %v", err)
	}
	if metadataPath != expectedMetadataPath {
		t.Fatalf("expected metadata path %q, got %q", expectedMetadataPath, metadataPath)
	}

	loaded, err := LoadLauncherInstallMetadata(settaHome)
	if err != nil {
		t.Fatalf("load launcher metadata: %v", err)
	}
	if loaded == nil {
		t.Fatal("expected launcher metadata to load")
	}
	return loaded
}

func assertLoadedLauncherInstallMetadataRoundTrip(
	t *testing.T,
	loaded *LauncherInstallMetadata,
	metadata LauncherInstallMetadata,
) {
	t.Helper()

	if loaded.SchemaVersion != launcherMetadataSchemaVersion {
		t.Fatalf("expected schema version %d, got %d", launcherMetadataSchemaVersion, loaded.SchemaVersion)
	}
	if !reflect.DeepEqual(loaded.TargetCommand, metadata.TargetCommand) {
		t.Fatalf("expected target command %#v, got %#v", metadata.TargetCommand, loaded.TargetCommand)
	}
	if loaded.Channel != "uv-tool" {
		t.Fatalf("expected channel uv-tool, got %q", loaded.Channel)
	}
	if loaded.InstallSource != string(LauncherInstallSourceUVTool) {
		t.Fatalf("expected install source %q, got %q", LauncherInstallSourceUVTool, loaded.InstallSource)
	}
	if loaded.ArtifactOwnershipToken != "roundtrip-token" {
		t.Fatalf("expected artifact ownership token roundtrip-token, got %q", loaded.ArtifactOwnershipToken)
	}
	if loaded.SettaVersion != "1.2.3" {
		t.Fatalf("expected setta version 1.2.3, got %q", loaded.SettaVersion)
	}
	if loaded.SettaHome != metadata.SettaHome {
		t.Fatalf("expected setta home %q, got %q", metadata.SettaHome, loaded.SettaHome)
	}
	if loaded.OpenMode != string(LauncherOpenModeBrowser) {
		t.Fatalf("expected open mode %q, got %q", LauncherOpenModeBrowser, loaded.OpenMode)
	}
	if loaded.WorkspaceBehavior != string(LauncherWorkspaceBehaviorDefault) {
		t.Fatalf("expected workspace behavior %q, got %q", LauncherWorkspaceBehaviorDefault, loaded.WorkspaceBehavior)
	}
	if loaded.LastUsedWorkspace == nil || metadata.LastUsedWorkspace == nil || *loaded.LastUsedWorkspace != *metadata.LastUsedWorkspace {
		t.Fatalf("expected last used workspace %#v, got %#v", metadata.LastUsedWorkspace, loaded.LastUsedWorkspace)
	}
	if !reflect.DeepEqual(loaded.ArtifactOptions, map[string]string{"app_name": "Setta"}) {
		t.Fatalf("expected artifact options %#v, got %#v", map[string]string{"app_name": "Setta"}, loaded.ArtifactOptions)
	}
	if !reflect.DeepEqual(loaded.ManagedArtifacts, metadata.ManagedArtifacts) {
		t.Fatalf("expected managed artifacts %#v, got %#v", metadata.ManagedArtifacts, loaded.ManagedArtifacts)
	}
}

func TestLauncherTargetValidationReportsMissingExecutable(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{filepath.Join(baseRoot, "missing-python"), "-m", "setta"},
		Channel:                "manual",
		InstallSource:          LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "validation-token",
		SettaVersion:           "1.2.3",
		SettaHome:              filepath.Join(baseRoot, ".setta"),
		OpenMode:               LauncherOpenModeBrowser,
		WorkspaceBehavior:      LauncherWorkspaceBehaviorDefault,
	})
	if err != nil {
		t.Fatalf("build launcher metadata: %v", err)
	}

	message := LauncherTargetValidationError(metadata)
	if !strings.Contains(message, "missing") {
		t.Fatalf("expected missing-target message, got %q", message)
	}
}

func TestLauncherTargetValidationReportsNonExecutableFile(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	targetExecutable := filepath.Join(baseRoot, "python")
	if err := os.WriteFile(targetExecutable, []byte("#!/usr/bin/env bash\n"), 0o644); err != nil {
		t.Fatalf("write target executable: %v", err)
	}
	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{targetExecutable, "-m", "setta"},
		Channel:                "manual",
		InstallSource:          LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "validation-token-no-exec",
		SettaVersion:           "1.2.3",
		SettaHome:              filepath.Join(baseRoot, ".setta"),
		OpenMode:               LauncherOpenModeBrowser,
		WorkspaceBehavior:      LauncherWorkspaceBehaviorDefault,
	})
	if err != nil {
		t.Fatalf("build launcher metadata: %v", err)
	}

	message := LauncherTargetValidationError(metadata)
	if !strings.Contains(message, "not executable") {
		t.Fatalf("expected not-executable message, got %q", message)
	}
}

func TestLauncherHasWindowsExecutableExtensionUsesPATHEXT(t *testing.T) {
	t.Setenv("PATHEXT", ".EXE;.CMD")
	if !launcherHasWindowsExecutableExtension("/tmp/setta-tool.EXE") {
		t.Fatal("expected EXE path to be treated as invokable")
	}
	if launcherHasWindowsExecutableExtension("/tmp/setta-tool.py") {
		t.Fatal("expected non-PATHEXT path to be rejected")
	}
}

func TestUpdateLauncherLastUsedWorkspaceIfInstalledPersistsResolvedWorkspace(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	settaHome := filepath.Join(baseRoot, ".setta")
	targetExecutable := filepath.Join(baseRoot, "python")
	if err := os.WriteFile(targetExecutable, []byte("#!/usr/bin/env bash\n"), 0o755); err != nil {
		t.Fatalf("write target executable: %v", err)
	}
	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{targetExecutable, "-m", "setta"},
		Channel:                "manual",
		InstallSource:          LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "last-used-token",
		SettaVersion:           "1.2.3",
		SettaHome:              settaHome,
		OpenMode:               LauncherOpenModeBrowser,
		WorkspaceBehavior:      LauncherWorkspaceBehaviorDefault,
	})
	if err != nil {
		t.Fatalf("build launcher metadata: %v", err)
	}
	if _, err := WriteLauncherInstallMetadata(settaHome, metadata); err != nil {
		t.Fatalf("write launcher metadata: %v", err)
	}

	workspaceRoot := filepath.Join(baseRoot, "workspace-a")
	if err := UpdateLauncherLastUsedWorkspaceIfInstalled(settaHome, workspaceRoot); err != nil {
		t.Fatalf("update last used workspace: %v", err)
	}

	loaded, err := LoadLauncherInstallMetadata(settaHome)
	if err != nil {
		t.Fatalf("load launcher metadata: %v", err)
	}
	if loaded == nil {
		t.Fatal("expected launcher metadata to load")
	}
	resolvedWorkspaceRoot, err := resolvePathLoose(workspaceRoot)
	if err != nil {
		t.Fatalf("resolve workspace root: %v", err)
	}
	if loaded.LastUsedWorkspace == nil || *loaded.LastUsedWorkspace != resolvedWorkspaceRoot {
		t.Fatalf("expected last used workspace %q, got %#v", resolvedWorkspaceRoot, loaded.LastUsedWorkspace)
	}
}

func TestLoadLauncherInstallMetadataRejectsNonObjectPayload(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	metadataPath, err := resolveLauncherMetadataPath(settaHome)
	if err != nil {
		t.Fatalf("resolve launcher metadata path: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(metadataPath), 0o755); err != nil {
		t.Fatalf("mkdir launcher metadata dir: %v", err)
	}
	if err := os.WriteFile(metadataPath, []byte("[]"), 0o644); err != nil {
		t.Fatalf("write launcher metadata: %v", err)
	}

	_, err = LoadLauncherInstallMetadata(settaHome)
	if err == nil {
		t.Fatal("expected invalid launcher metadata error")
	}
	var metadataErr *LauncherMetadataError
	if !errors.As(err, &metadataErr) {
		t.Fatalf("expected LauncherMetadataError, got %T (%v)", err, err)
	}
	if !strings.Contains(metadataErr.Error(), "JSON object") {
		t.Fatalf("expected JSON object error, got %q", metadataErr.Error())
	}
}

func TestBuildLauncherInstallMetadataRejectsInvalidWorkspaceBehavior(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	targetExecutable := filepath.Join(baseRoot, "python")
	if err := os.WriteFile(targetExecutable, []byte("#!/usr/bin/env bash\n"), 0o755); err != nil {
		t.Fatalf("write target executable: %v", err)
	}

	_, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{targetExecutable, "-m", "setta"},
		Channel:                "manual",
		InstallSource:          LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "workspace-behavior-token",
		SettaVersion:           "1.2.3",
		SettaHome:              filepath.Join(baseRoot, ".setta"),
		OpenMode:               LauncherOpenModeBrowser,
		WorkspaceBehavior:      LauncherWorkspaceBehavior("unexpected_behavior"),
	})
	if err == nil {
		t.Fatal("expected invalid workspace behavior error")
	}
	var metadataErr *LauncherMetadataError
	if !errors.As(err, &metadataErr) {
		t.Fatalf("expected LauncherMetadataError, got %T (%v)", err, err)
	}
	if !strings.Contains(metadataErr.Error(), "workspaceBehavior") {
		t.Fatalf("expected workspaceBehavior error, got %q", metadataErr.Error())
	}
}

func TestLoadLauncherInstallMetadataRejectsMissingSettaHome(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	metadataPath, err := resolveLauncherMetadataPath(settaHome)
	if err != nil {
		t.Fatalf("resolve launcher metadata path: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(metadataPath), 0o755); err != nil {
		t.Fatalf("mkdir launcher metadata dir: %v", err)
	}
	content := `{
  "schemaVersion": 3,
  "targetCommand": ["/usr/bin/python3", "-m", "setta"],
  "channel": "manual",
  "installSource": "unsupported",
  "artifactOwnershipToken": "missing-setta-home-token",
  "settaVersion": "1.2.3",
  "openMode": "browser",
  "workspaceBehavior": "last_used_or_prompt",
  "artifactOptions": {},
  "managedArtifacts": {}
}
`
	if err := os.WriteFile(metadataPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write launcher metadata: %v", err)
	}

	_, err = LoadLauncherInstallMetadata(settaHome)
	if err == nil {
		t.Fatal("expected missing settaHome error")
	}
	var metadataErr *LauncherMetadataError
	if !errors.As(err, &metadataErr) {
		t.Fatalf("expected LauncherMetadataError, got %T (%v)", err, err)
	}
	if !strings.Contains(metadataErr.Error(), "settaHome") {
		t.Fatalf("expected settaHome error, got %q", metadataErr.Error())
	}
}
