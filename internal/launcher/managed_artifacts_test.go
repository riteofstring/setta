package launcher

import (
	"errors"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/localsessions"
)

func TestManagementServiceSetupInstallsManagedArtifactsAndRemoveCleansThemUp(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	service := newTestManagementService(t, executable, "1.2.3", nil)
	settaHome := filepath.Join(homeDir, ".setta")
	channel := "uv-tool"
	installSource := LauncherInstallSourceUVTool
	installArtifacts := true

	if _, err := service.Setup(settaHome, LauncherSetupInput{
		Channel:          &channel,
		InstallSource:    &installSource,
		InstallArtifacts: &installArtifacts,
	}); err != nil {
		t.Fatalf("setup managed launcher install: %v", err)
	}

	status, err := service.CollectStatus(settaHome)
	if err != nil {
		t.Fatalf("collect launcher status after managed setup: %v", err)
	}
	if !status.Installed {
		t.Fatalf("expected installed launcher status, got %#v", status)
	}
	if len(status.ManagedArtifacts) == 0 {
		t.Fatalf("expected managed artifacts after setup, got %#v", status.ManagedArtifacts)
	}
	if status.UpdateCapability != LauncherUpdateCapabilityInApp {
		t.Fatalf("expected in-app update capability for uv-tool managed install, got %q", status.UpdateCapability)
	}
	for key, path := range status.ManagedArtifacts {
		if _, err := os.Lstat(path); err != nil {
			t.Fatalf("expected managed artifact %s at %q to exist: %v", key, path, err)
		}
		markerPath, err := artifactOwnershipMarkerPath(path)
		if err != nil {
			t.Fatalf("resolve ownership marker for %s: %v", path, err)
		}
		if _, err := os.Lstat(markerPath); err != nil {
			t.Fatalf("expected ownership marker for %s at %q: %v", path, markerPath, err)
		}
	}

	wrapperPath := managedLauncherScriptPath(t, status.ManagedArtifacts)
	content, err := os.ReadFile(wrapperPath)
	if err != nil {
		t.Fatalf("read managed launcher script %q: %v", wrapperPath, err)
	}
	if !strings.Contains(string(content), launcherArtifactRunFlag) {
		t.Fatalf("expected managed launcher script to use %q, got:\n%s", launcherArtifactRunFlag, string(content))
	}
	if !strings.Contains(string(content), executable) {
		t.Fatalf("expected managed launcher script to reference executable %q, got:\n%s", executable, string(content))
	}

	removeResult, err := service.Remove(settaHome)
	if err != nil {
		t.Fatalf("remove managed launcher install: %v", err)
	}
	if !removeResult.MetadataRemoved {
		t.Fatalf("expected launcher metadata to be removed, got %#v", removeResult)
	}
	if len(removeResult.RemovedPaths) == 0 {
		t.Fatalf("expected removed managed artifact paths, got %#v", removeResult)
	}
	for _, path := range removeResult.RemovedPaths {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			t.Fatalf("expected removed path %q to be gone, stat err=%v", path, err)
		}
	}
	if _, err := os.Stat(removeResult.MetadataPath); !os.IsNotExist(err) {
		t.Fatalf("expected launcher metadata path %q to be removed, stat err=%v", removeResult.MetadataPath, err)
	}
}

func TestManagementServiceRemoveRejectsMissingOwnershipMarkersForManagedArtifacts(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	service := newTestManagementService(t, executable, "1.2.3", nil)
	settaHome := filepath.Join(homeDir, ".setta")
	installArtifacts := true

	if _, err := service.Setup(settaHome, LauncherSetupInput{
		InstallArtifacts: &installArtifacts,
	}); err != nil {
		t.Fatalf("setup managed launcher install: %v", err)
	}

	status, err := service.CollectStatus(settaHome)
	if err != nil {
		t.Fatalf("collect launcher status: %v", err)
	}
	if len(status.ManagedArtifacts) == 0 {
		t.Fatalf("expected managed artifacts after setup, got %#v", status.ManagedArtifacts)
	}
	artifactPath := firstManagedArtifactPath(status.ManagedArtifacts)
	markerPath, err := artifactOwnershipMarkerPath(artifactPath)
	if err != nil {
		t.Fatalf("resolve ownership marker path: %v", err)
	}
	if err := os.Remove(markerPath); err != nil {
		t.Fatalf("remove ownership marker %q: %v", markerPath, err)
	}

	_, err = service.Remove(settaHome)
	if err == nil {
		t.Fatal("expected remove to fail when ownership marker is missing")
	}
	var setupErr *LauncherSetupError
	if !errors.As(err, &setupErr) {
		t.Fatalf("expected LauncherSetupError, got %T: %v", err, err)
	}
	if setupErr.Code != "ArtifactRemovalFailed" {
		t.Fatalf("expected ArtifactRemovalFailed, got %q (%v)", setupErr.Code, err)
	}
	if _, err := os.Lstat(artifactPath); err != nil {
		t.Fatalf("expected managed artifact to remain after failed remove: %v", err)
	}
	metadataPath, err := resolveLauncherMetadataPath(settaHome)
	if err != nil {
		t.Fatalf("resolve launcher metadata path: %v", err)
	}
	if _, err := os.Stat(metadataPath); err != nil {
		t.Fatalf("expected launcher metadata to remain after failed remove: %v", err)
	}
}

func TestManagementServiceRepairPreservesPreferencesAndRewritesManagedArtifacts(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	previousExecutable := writeTestExecutable(t, t.TempDir(), "previous-setta")
	currentExecutable := writeTestExecutable(t, t.TempDir(), "current-setta")
	initialService := newTestManagementService(t, previousExecutable, "0.0.1", nil)
	settaHome := filepath.Join(homeDir, ".setta")
	openMode := LauncherOpenModeBrowser
	workspaceBehavior := LauncherWorkspaceBehaviorAlwaysPrompt
	installArtifacts := true
	artifactOptions := map[string]string{"app_name": "Setta Custom"}

	if _, err := initialService.Setup(settaHome, LauncherSetupInput{
		OpenMode:          &openMode,
		WorkspaceBehavior: &workspaceBehavior,
		InstallArtifacts:  &installArtifacts,
		ArtifactOptions:   &artifactOptions,
	}); err != nil {
		t.Fatalf("setup managed launcher install: %v", err)
	}

	metadata, err := LoadLauncherInstallMetadata(settaHome)
	if err != nil {
		t.Fatalf("load launcher metadata before repair: %v", err)
	}
	if metadata == nil {
		t.Fatal("expected launcher metadata after setup")
	}
	lastUsedWorkspace := filepath.Join(homeDir, "workspace")
	metadata.LastUsedWorkspace = &lastUsedWorkspace
	if _, err := WriteLauncherInstallMetadata(settaHome, *metadata); err != nil {
		t.Fatalf("rewrite launcher metadata with last-used workspace: %v", err)
	}
	if err := os.Remove(previousExecutable); err != nil {
		t.Fatalf("remove previous executable: %v", err)
	}

	repairService := newTestManagementService(t, currentExecutable, "1.2.3", nil)
	status, err := repairService.Repair(settaHome)
	if err != nil {
		t.Fatalf("repair managed launcher install: %v", err)
	}
	if status.TargetValid == nil || !*status.TargetValid {
		t.Fatalf("expected repaired target to be valid, got %#v", status.TargetValid)
	}
	if !reflect.DeepEqual(status.TargetCommand, []string{currentExecutable}) {
		t.Fatalf("expected repaired target command [%q], got %#v", currentExecutable, status.TargetCommand)
	}
	if status.OpenMode == nil || *status.OpenMode != LauncherOpenModeBrowser {
		t.Fatalf("expected preserved open mode browser, got %#v", status.OpenMode)
	}
	if status.WorkspaceBehavior == nil || *status.WorkspaceBehavior != LauncherWorkspaceBehaviorAlwaysPrompt {
		t.Fatalf("expected preserved workspace behavior always_prompt, got %#v", status.WorkspaceBehavior)
	}
	resolvedLastUsedWorkspace, err := resolvePathLoose(lastUsedWorkspace)
	if err != nil {
		t.Fatalf("resolve expected last-used workspace: %v", err)
	}
	if status.LastUsedWorkspace == nil || *status.LastUsedWorkspace != resolvedLastUsedWorkspace {
		t.Fatalf("expected preserved last-used workspace %q, got %#v", resolvedLastUsedWorkspace, status.LastUsedWorkspace)
	}
	if !reflect.DeepEqual(status.ArtifactOptions, artifactOptions) {
		t.Fatalf("expected preserved artifact options %#v, got %#v", artifactOptions, status.ArtifactOptions)
	}
	if len(status.ManagedArtifacts) == 0 {
		t.Fatalf("expected repaired managed artifacts, got %#v", status.ManagedArtifacts)
	}

	wrapperPath := managedLauncherScriptPath(t, status.ManagedArtifacts)
	content, err := os.ReadFile(wrapperPath)
	if err != nil {
		t.Fatalf("read repaired managed launcher script %q: %v", wrapperPath, err)
	}
	if !strings.Contains(string(content), currentExecutable) {
		t.Fatalf("expected repaired launcher script to reference executable %q, got:\n%s", currentExecutable, string(content))
	}
}

func TestManagementServiceUpdateRewritesManagedUVToolInstall(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	currentExecutable := writeTestExecutable(t, t.TempDir(), "current-setta")
	uvBin := writeTestExecutable(t, filepath.Join(t.TempDir(), "bin"), "uv")
	uvToolBinDir := filepath.Join(t.TempDir(), "uv-tool-bin")
	if err := os.MkdirAll(uvToolBinDir, 0o755); err != nil {
		t.Fatalf("mkdir uv tool dir: %v", err)
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

	settaHome := filepath.Join(homeDir, ".setta")
	channel := "uv-tool"
	installSource := LauncherInstallSourceUVTool
	installArtifacts := true
	if _, err := service.Setup(settaHome, LauncherSetupInput{
		Channel:          &channel,
		InstallSource:    &installSource,
		InstallArtifacts: &installArtifacts,
	}); err != nil {
		t.Fatalf("setup managed uv-tool launcher install: %v", err)
	}

	result, err := service.Update(settaHome, "setta")
	if err != nil {
		t.Fatalf("update managed uv-tool launcher install: %v", err)
	}
	if result.ToVersion == nil || *result.ToVersion != "9.9.9" {
		t.Fatalf("expected updated version 9.9.9, got %#v", result.ToVersion)
	}
	if len(result.Status.ManagedArtifacts) == 0 {
		t.Fatalf("expected managed artifacts after update, got %#v", result.Status.ManagedArtifacts)
	}

	wrapperPath := managedLauncherScriptPath(t, result.Status.ManagedArtifacts)
	content, err := os.ReadFile(wrapperPath)
	if err != nil {
		t.Fatalf("read managed launcher script %q after update: %v", wrapperPath, err)
	}
	if !strings.Contains(string(content), updatedExecutable) {
		t.Fatalf("expected updated launcher script to reference executable %q, got:\n%s", updatedExecutable, string(content))
	}
	if len(calls) != 2 {
		t.Fatalf("expected two uv calls, got %#v", calls)
	}
}

func TestArtifactLauncherReusesExistingLauncherSessionAndOpensBrowser(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	artifactLauncher, err := NewArtifactLauncher(ArtifactLaunchOptions{
		ExecutablePath: executable,
		UserHomeDir: func() (string, error) {
			return homeDir, nil
		},
	})
	if err != nil {
		t.Fatalf("new artifact launcher: %v", err)
	}

	cfg, err := artifactLauncher.loadLauncherConfig(filepath.Join(homeDir, ".setta"))
	if err != nil {
		t.Fatalf("load launcher artifact config: %v", err)
	}
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(cfg.Paths.RuntimeRoot, "sessions"),
	})
	if err != nil {
		t.Fatalf("new session registry: %v", err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen for launcher session: %v", err)
	}
	defer listener.Close()

	tcpAddr := listener.Addr().(*net.TCPAddr)
	session, err := registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		Host:               "127.0.0.1",
		Port:               tcpAddr.Port,
		PID:                os.Getpid(),
		SettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		SettaHome:          cfg.Paths.SettaHome,
		ServerMode:         string(config.ModeLauncher),
	})
	if err != nil {
		t.Fatalf("create launcher session: %v", err)
	}

	var openedURL string
	artifactLauncher.openBrowser = func(rawURL string) error {
		openedURL = rawURL
		return nil
	}
	result, err := artifactLauncher.Launch(cfg.Paths.SettaHome)
	if err != nil {
		t.Fatalf("launch artifact against existing session: %v", err)
	}
	if result.StartedNew {
		t.Fatalf("expected existing session reuse, got %#v", result)
	}
	if result.SessionID != session.ID {
		t.Fatalf("expected reused session id %q, got %#v", session.ID, result)
	}
	expectedURL := "http://127.0.0.1:" + strconv.Itoa(tcpAddr.Port) + "/?setta_home=" + url.QueryEscape(cfg.Paths.SettaHome)
	if openedURL != expectedURL {
		t.Fatalf("expected opened launcher URL %q, got %q", expectedURL, openedURL)
	}
}

func prepareLauncherArtifactTestHome(t *testing.T) string {
	t.Helper()

	homeDir := filepath.Join(t.TempDir(), "home")
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		t.Fatalf("mkdir test home: %v", err)
	}
	switch runtime.GOOS {
	case "windows":
		t.Setenv("USERPROFILE", homeDir)
		t.Setenv("APPDATA", filepath.Join(homeDir, "AppData", "Roaming"))
		t.Setenv("LOCALAPPDATA", filepath.Join(homeDir, "AppData", "Local"))
	default:
		t.Setenv("HOME", homeDir)
	}
	return homeDir
}

func firstManagedArtifactPath(managedArtifacts map[string]string) string {
	keys := make([]string, 0, len(managedArtifacts))
	for key := range managedArtifacts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return managedArtifacts[keys[0]]
}

func managedLauncherScriptPath(t *testing.T, managedArtifacts map[string]string) string {
	t.Helper()

	switch runtime.GOOS {
	case "darwin":
		appPath, ok := managedArtifacts["macosApp"]
		if !ok {
			t.Fatalf("expected macosApp managed artifact, got %#v", managedArtifacts)
		}
		return filepath.Join(appPath, "Contents", "MacOS", "setta-launcher")
	case "windows":
		wrapperPath, ok := managedArtifacts["windowsWrapper"]
		if !ok {
			t.Fatalf("expected windowsWrapper managed artifact, got %#v", managedArtifacts)
		}
		return wrapperPath
	default:
		wrapperPath, ok := managedArtifacts["linuxWrapper"]
		if !ok {
			t.Fatalf("expected linuxWrapper managed artifact, got %#v", managedArtifacts)
		}
		return wrapperPath
	}
}
