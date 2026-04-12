package launcher

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"setta/internal/statefs"
)

const (
	artifactOwnershipMarkerBasename = ".setta-launcher-owned"
	launcherArtifactRunFlag         = "--launcher-artifact-run"
	launcherArtifactSettaFilesDir   = "setta_files"
	launcherArtifactRuntimeDir      = "runtime"
)

var defaultMacOSIconFileName = "Setta.icns"

type LauncherArtifactError struct {
	Message string
}

func (e *LauncherArtifactError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type launcherArtifactContext struct {
	TargetCommand            []string
	SettaHome                string
	ExistingManagedArtifacts map[string]string
	Options                  map[string]string
}

type artifactRemovalResult struct {
	RemovedPaths []string
	MissingPaths []string
	Errors       []string
}

func resolveLauncherArtifactSettaFilesRoot(settaHome string) (string, error) {
	launcherDir, err := resolveLauncherDir(settaHome)
	if err != nil {
		return "", err
	}
	return filepath.Join(launcherDir, launcherArtifactSettaFilesDir), nil
}

func resolveLauncherArtifactRuntimeRoot(settaHome string) (string, error) {
	launcherDir, err := resolveLauncherDir(settaHome)
	if err != nil {
		return "", err
	}
	return filepath.Join(launcherDir, launcherArtifactRuntimeDir), nil
}

func buildLauncherArtifactCommand(targetCommand []string, settaHome string) []string {
	command := append([]string(nil), targetCommand...)
	command = append(command, launcherArtifactRunFlag, "--setta-home", settaHome)
	return command
}

func artifactWritePathOptionKeys() map[string]struct{} {
	switch runtime.GOOS {
	case "darwin":
		return map[string]struct{}{"app_path": {}}
	case "windows":
		return map[string]struct{}{
			"wrapper_path":             {},
			"start_menu_shortcut_path": {},
			"desktop_shortcut_path":    {},
		}
	default:
		return map[string]struct{}{
			"applications_dir":      {},
			"wrapper_path":          {},
			"desktop_shortcut_path": {},
		}
	}
}

func currentPlatformArtifactKeys() map[string]struct{} {
	switch runtime.GOOS {
	case "darwin":
		return map[string]struct{}{"macosApp": {}}
	case "windows":
		return map[string]struct{}{
			"windowsWrapper":           {},
			"windowsStartMenuShortcut": {},
			"windowsDesktopShortcut":   {},
		}
	default:
		return map[string]struct{}{
			"linuxDesktopEntry":    {},
			"linuxWrapper":         {},
			"linuxDesktopShortcut": {},
		}
	}
}

func planCurrentPlatformArtifactPaths(context launcherArtifactContext) (map[string]string, error) {
	switch runtime.GOOS {
	case "darwin":
		return planMacOSArtifactPaths(context)
	case "windows":
		return planWindowsArtifactPaths(context)
	default:
		return planLinuxArtifactPaths(context)
	}
}

func installCurrentPlatformArtifacts(context launcherArtifactContext) (map[string]string, error) {
	switch runtime.GOOS {
	case "darwin":
		return installMacOSArtifacts(context)
	case "windows":
		return installWindowsArtifacts(context)
	default:
		return installLinuxArtifacts(context)
	}
}

func planLinuxArtifactPaths(context launcherArtifactContext) (map[string]string, error) {
	existingDesktopEntry := existingArtifactPath(context.ExistingManagedArtifacts, "linuxDesktopEntry")
	existingShortcut := existingArtifactPath(context.ExistingManagedArtifacts, "linuxDesktopShortcut")

	applicationsDir, err := resolveLinuxApplicationsDir(context.Options, existingDesktopEntry)
	if err != nil {
		return nil, err
	}
	desktopEntryName := resolveLinuxDesktopEntryName(context.Options, existingDesktopEntry)
	desktopEntryName, err = validateFileNameComponent("desktop_entry_name", desktopEntryName)
	if err != nil {
		return nil, err
	}
	desktopEntryPath, err := resolvePathLoose(filepath.Join(applicationsDir, desktopEntryName))
	if err != nil {
		return nil, err
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, &LauncherArtifactError{Message: fmt.Sprintf("resolve user home: %v", err)}
	}
	wrapperPath, err := resolvePathOptionWithExisting(
		context.Options,
		"wrapper_path",
		context.ExistingManagedArtifacts,
		"linuxWrapper",
		filepath.Join(homeDir, ".local", "share", "setta", "launcher", "setta-launcher"),
	)
	if err != nil {
		return nil, err
	}

	createDesktopShortcut, err := parseBoolOption(
		context.Options,
		"desktop_shortcut",
		existingShortcut != "",
	)
	if err != nil {
		return nil, err
	}
	return buildLinuxPlannedArtifacts(
		context,
		desktopEntryPath,
		wrapperPath,
		desktopEntryName,
		homeDir,
		createDesktopShortcut,
	)
}

func resolveLinuxApplicationsDir(options map[string]string, existingDesktopEntry string) (string, error) {
	if rawPath := strings.TrimSpace(options["applications_dir"]); rawPath != "" {
		resolvedPath, err := resolvePathLoose(rawPath)
		if err != nil {
			return "", &LauncherArtifactError{Message: fmt.Sprintf("resolve applications_dir: %v", err)}
		}
		return resolvedPath, nil
	}
	if existingDesktopEntry != "" {
		return filepath.Dir(existingDesktopEntry), nil
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", &LauncherArtifactError{Message: fmt.Sprintf("resolve user home: %v", err)}
	}
	return resolvePathLoose(filepath.Join(homeDir, ".local", "share", "applications"))
}

func resolveLinuxDesktopEntryName(options map[string]string, existingDesktopEntry string) string {
	if desktopEntryName := strings.TrimSpace(options["desktop_entry_name"]); desktopEntryName != "" {
		return desktopEntryName
	}
	if existingDesktopEntry != "" {
		return filepath.Base(existingDesktopEntry)
	}
	return "setta.desktop"
}

func buildLinuxPlannedArtifacts(
	context launcherArtifactContext,
	desktopEntryPath string,
	wrapperPath string,
	desktopEntryName string,
	homeDir string,
	createDesktopShortcut bool,
) (map[string]string, error) {
	plannedArtifacts := map[string]string{
		"linuxDesktopEntry": desktopEntryPath,
		"linuxWrapper":      wrapperPath,
	}
	if !createDesktopShortcut {
		return plannedArtifacts, nil
	}

	desktopShortcutPath, err := resolveLinuxDesktopShortcutPath(context, desktopEntryName, homeDir)
	if err != nil {
		return nil, err
	}
	plannedArtifacts["linuxDesktopShortcut"] = desktopShortcutPath
	return plannedArtifacts, nil
}

func resolveLinuxDesktopShortcutPath(
	context launcherArtifactContext,
	desktopEntryName string,
	homeDir string,
) (string, error) {
	return resolvePathOptionWithExisting(
		context.Options,
		"desktop_shortcut_path",
		context.ExistingManagedArtifacts,
		"linuxDesktopShortcut",
		filepath.Join(homeDir, "Desktop", desktopEntryName),
	)
}

func installLinuxArtifacts(context launcherArtifactContext) (map[string]string, error) {
	plannedArtifacts, err := planLinuxArtifactPaths(context)
	if err != nil {
		return nil, err
	}

	desktopEntryPath := plannedArtifacts["linuxDesktopEntry"]
	wrapperPath := plannedArtifacts["linuxWrapper"]
	appName, err := sanitizeDesktopEntryTextValue(context.Options, "app_name", "Setta")
	if err != nil {
		return nil, err
	}
	iconPath, err := resolveOptionalLinuxIconPath(context.Options["icon_path"])
	if err != nil {
		return nil, err
	}

	wrapperContent := buildUnixLauncherWrapperScript(context.TargetCommand, context.SettaHome)
	if err := writeArtifactTextFile(wrapperPath, wrapperContent, 0o755); err != nil {
		return nil, &LauncherArtifactError{Message: err.Error()}
	}
	desktopEntryContent, err := buildLinuxDesktopEntry(appName, wrapperPath, iconPath)
	if err != nil {
		return nil, err
	}
	if err := writeArtifactTextFile(desktopEntryPath, desktopEntryContent, 0o644); err != nil {
		return nil, &LauncherArtifactError{Message: err.Error()}
	}

	artifacts := map[string]string{
		"linuxDesktopEntry": desktopEntryPath,
		"linuxWrapper":      wrapperPath,
	}
	if desktopShortcutPath, ok := plannedArtifacts["linuxDesktopShortcut"]; ok {
		if err := copyArtifactFile(desktopEntryPath, desktopShortcutPath, 0o755); err != nil {
			return nil, err
		}
		artifacts["linuxDesktopShortcut"] = desktopShortcutPath
	}
	refreshLinuxDesktopDatabase(filepath.Dir(desktopEntryPath))
	return artifacts, nil
}

func planMacOSArtifactPaths(context launcherArtifactContext) (map[string]string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, &LauncherArtifactError{Message: fmt.Sprintf("resolve user home: %v", err)}
	}
	appPath, err := resolvePathOptionWithExisting(
		context.Options,
		"app_path",
		context.ExistingManagedArtifacts,
		"macosApp",
		filepath.Join(homeDir, "Applications", "Setta.app"),
	)
	if err != nil {
		return nil, err
	}
	return map[string]string{"macosApp": appPath}, nil
}

func installMacOSArtifacts(context launcherArtifactContext) (map[string]string, error) {
	plannedArtifacts, err := planMacOSArtifactPaths(context)
	if err != nil {
		return nil, err
	}
	appPath := plannedArtifacts["macosApp"]
	appContentsDir := filepath.Join(appPath, "Contents")
	appMacOSDir := filepath.Join(appContentsDir, "MacOS")
	appResourcesDir := filepath.Join(appContentsDir, "Resources")
	launcherBinaryPath := filepath.Join(appMacOSDir, "setta-launcher")
	infoPlistPath := filepath.Join(appContentsDir, "Info.plist")

	iconFileName, err := copyMacOSIcon(context.Options["icon_path"], appResourcesDir, context.TargetCommand)
	if err != nil {
		return nil, err
	}

	launcherContent := buildUnixLauncherWrapperScript(context.TargetCommand, context.SettaHome)
	if err := writeArtifactTextFile(launcherBinaryPath, launcherContent, 0o755); err != nil {
		return nil, &LauncherArtifactError{Message: err.Error()}
	}

	infoPlistContent, err := buildMacOSInfoPlist(iconFileName)
	if err != nil {
		return nil, err
	}
	if err := writeArtifactTextFile(infoPlistPath, infoPlistContent, 0o644); err != nil {
		return nil, &LauncherArtifactError{Message: err.Error()}
	}
	return map[string]string{"macosApp": appPath}, nil
}

func planWindowsArtifactPaths(context launcherArtifactContext) (map[string]string, error) {
	appName, err := validateFileNameComponent("app_name", firstNonEmpty(strings.TrimSpace(context.Options["app_name"]), "Setta"))
	if err != nil {
		return nil, err
	}

	localAppData, err := resolveWindowsEnvPath("LOCALAPPDATA", filepath.Join(mustUserHomeDir(), "AppData", "Local"))
	if err != nil {
		return nil, err
	}
	programsDir, err := resolveWindowsProgramsDir()
	if err != nil {
		return nil, err
	}
	desktopDir, err := resolveWindowsDesktopDir()
	if err != nil {
		return nil, err
	}

	wrapperPath, err := resolvePathOptionWithExisting(
		context.Options,
		"wrapper_path",
		context.ExistingManagedArtifacts,
		"windowsWrapper",
		filepath.Join(localAppData, "Setta", "Launcher", "setta-launcher.cmd"),
	)
	if err != nil {
		return nil, err
	}
	startMenuShortcutPath, err := resolvePathOptionWithExisting(
		context.Options,
		"start_menu_shortcut_path",
		context.ExistingManagedArtifacts,
		"windowsStartMenuShortcut",
		filepath.Join(programsDir, appName+".lnk"),
	)
	if err != nil {
		return nil, err
	}

	existingDesktopShortcut := existingArtifactPath(context.ExistingManagedArtifacts, "windowsDesktopShortcut")
	createDesktopShortcut, err := parseBoolOption(context.Options, "desktop_shortcut", existingDesktopShortcut != "")
	if err != nil {
		return nil, err
	}
	plannedArtifacts := map[string]string{
		"windowsWrapper":           wrapperPath,
		"windowsStartMenuShortcut": startMenuShortcutPath,
	}
	if createDesktopShortcut {
		desktopShortcutPath, err := resolvePathOptionWithExisting(
			context.Options,
			"desktop_shortcut_path",
			context.ExistingManagedArtifacts,
			"windowsDesktopShortcut",
			filepath.Join(desktopDir, appName+".lnk"),
		)
		if err != nil {
			return nil, err
		}
		plannedArtifacts["windowsDesktopShortcut"] = desktopShortcutPath
	}
	return plannedArtifacts, nil
}

func installWindowsArtifacts(context launcherArtifactContext) (map[string]string, error) {
	plannedArtifacts, err := planWindowsArtifactPaths(context)
	if err != nil {
		return nil, err
	}
	wrapperPath := plannedArtifacts["windowsWrapper"]
	wrapperContent := buildWindowsLauncherWrapper(context.TargetCommand, context.SettaHome)
	if err := writeArtifactTextFile(wrapperPath, wrapperContent, 0o644); err != nil {
		return nil, &LauncherArtifactError{Message: err.Error()}
	}
	if err := createWindowsShortcut(plannedArtifacts["windowsStartMenuShortcut"], wrapperPath); err != nil {
		return nil, err
	}

	artifacts := map[string]string{
		"windowsWrapper":           wrapperPath,
		"windowsStartMenuShortcut": plannedArtifacts["windowsStartMenuShortcut"],
	}
	if desktopShortcutPath, ok := plannedArtifacts["windowsDesktopShortcut"]; ok {
		if err := createWindowsShortcut(desktopShortcutPath, wrapperPath); err != nil {
			return nil, err
		}
		artifacts["windowsDesktopShortcut"] = desktopShortcutPath
	}
	return artifacts, nil
}

func validatePlannedArtifactPaths(artifactPaths map[string]string, settaHome string) error {
	if err := validateUniqueArtifactPaths(artifactPaths, "BadRequest"); err != nil {
		return err
	}
	for _, path := range artifactPaths {
		if err := validatePathWithinTrustedRoots(path, settaHome, "BadRequest", false); err != nil {
			return err
		}
	}
	return nil
}

func computeReplacedOrRemovedArtifacts(existingManagedArtifacts map[string]string, desiredManagedArtifacts map[string]string) map[string]string {
	removedOrReplaced := make(map[string]string, 0)
	for key, existingPath := range existingManagedArtifacts {
		resolvedExistingPath, err := resolvePathLoose(existingPath)
		if err != nil {
			resolvedExistingPath = strings.TrimSpace(existingPath)
		}
		desiredPath, ok := desiredManagedArtifacts[key]
		if !ok {
			removedOrReplaced[key] = resolvedExistingPath
			continue
		}
		resolvedDesiredPath, err := resolvePathLoose(desiredPath)
		if err != nil {
			resolvedDesiredPath = strings.TrimSpace(desiredPath)
		}
		if resolvedDesiredPath != resolvedExistingPath {
			removedOrReplaced[key] = resolvedExistingPath
		}
	}
	return removedOrReplaced
}

func computeNewOrReplacedArtifacts(existingManagedArtifacts map[string]string, nextManagedArtifacts map[string]string) map[string]string {
	cleanupTargets := make(map[string]string, 0)
	for key, nextPath := range nextManagedArtifacts {
		resolvedNextPath, err := resolvePathLoose(nextPath)
		if err != nil {
			resolvedNextPath = strings.TrimSpace(nextPath)
		}
		existingPath, ok := existingManagedArtifacts[key]
		if !ok {
			cleanupTargets[key] = resolvedNextPath
			continue
		}
		resolvedExistingPath, err := resolvePathLoose(existingPath)
		if err != nil {
			resolvedExistingPath = strings.TrimSpace(existingPath)
		}
		if resolvedExistingPath != resolvedNextPath {
			cleanupTargets[key] = resolvedNextPath
		}
	}
	return cleanupTargets
}

func validateOwnedArtifactsBeforeRemoval(managedArtifacts map[string]string, ownershipToken string) []string {
	markerErrors := make([]string, 0)
	for name, pathString := range managedArtifacts {
		artifactPath, err := resolvePathLoose(pathString)
		if err != nil {
			markerErrors = append(markerErrors, fmt.Sprintf("%s: %v", pathString, err))
			continue
		}
		info, statErr := os.Lstat(artifactPath)
		if errorsIsNotExist(statErr) || info == nil {
			continue
		}
		markerError := artifactOwnershipMarkerError(name, artifactPath, ownershipToken)
		if markerError != "" {
			markerErrors = append(markerErrors, markerError)
		}
	}
	sort.Strings(markerErrors)
	return markerErrors
}

func removeOwnedArtifacts(managedArtifacts map[string]string, ownershipToken string) artifactRemovalResult {
	removedPaths := make([]string, 0)
	missingPaths := make([]string, 0)
	removalErrors := make([]string, 0)
	for name, pathString := range managedArtifacts {
		artifactPath, err := resolvePathLoose(pathString)
		if err != nil {
			removalErrors = append(removalErrors, fmt.Sprintf("%s: %v", pathString, err))
			continue
		}
		info, statErr := os.Lstat(artifactPath)
		if errorsIsNotExist(statErr) || info == nil {
			missingPaths = append(missingPaths, artifactPath)
			continue
		}
		markerError := artifactOwnershipMarkerError(name, artifactPath, ownershipToken)
		if markerError != "" {
			removalErrors = append(removalErrors, markerError)
			continue
		}
		if err := removeArtifactAndMarker(artifactPath); err != nil {
			removalErrors = append(removalErrors, fmt.Sprintf("%s: %v", artifactPath, err))
			continue
		}
		removedPaths = append(removedPaths, artifactPath)
	}
	sort.Strings(removedPaths)
	sort.Strings(missingPaths)
	sort.Strings(removalErrors)
	return artifactRemovalResult{
		RemovedPaths: removedPaths,
		MissingPaths: missingPaths,
		Errors:       removalErrors,
	}
}

func cleanupArtifactsAfterFailedMetadataWrite(managedArtifacts map[string]string) {
	for _, pathString := range managedArtifacts {
		artifactPath, err := resolvePathLoose(pathString)
		if err != nil {
			continue
		}
		if _, statErr := os.Lstat(artifactPath); errorsIsNotExist(statErr) {
			markerPath, markerErr := artifactOwnershipMarkerPath(artifactPath)
			if markerErr == nil {
				_ = os.Remove(markerPath)
			}
			continue
		}
		_ = removeArtifactAndMarker(artifactPath)
	}
}

func writeArtifactOwnershipMarkers(managedArtifacts map[string]string, ownershipToken string) error {
	for name, pathString := range managedArtifacts {
		artifactPath, err := resolvePathLoose(pathString)
		if err != nil {
			return &LauncherSetupError{
				Code:    "ArtifactInstallFailed",
				Message: fmt.Sprintf("Failed to resolve launcher artifact path %q: %v", pathString, err),
			}
		}
		if _, err := os.Lstat(artifactPath); err != nil {
			return &LauncherSetupError{
				Code:    "ArtifactInstallFailed",
				Message: fmt.Sprintf("Managed artifact does not exist after setup: %s", artifactPath),
			}
		}
		markerPath, err := artifactOwnershipMarkerPath(artifactPath)
		if err != nil {
			return &LauncherSetupError{
				Code:    "ArtifactInstallFailed",
				Message: fmt.Sprintf("Failed to resolve launcher ownership marker path for %s: %v", artifactPath, err),
			}
		}
		if err := os.MkdirAll(filepath.Dir(markerPath), 0o755); err != nil {
			return &LauncherSetupError{
				Code:    "ArtifactInstallFailed",
				Message: fmt.Sprintf("Failed to create launcher ownership marker directory for %s: %v", artifactPath, err),
			}
		}
		payload := []byte(artifactOwnershipMarkerContents(name, ownershipToken))
		if err := statefs.AtomicWriteFile(markerPath, payload, 0o644); err != nil {
			return &LauncherSetupError{
				Code:    "ArtifactInstallFailed",
				Message: fmt.Sprintf("Failed to write launcher ownership marker for %s: %v", artifactPath, err),
			}
		}
	}
	return nil
}

func artifactOwnershipMarkerContents(artifactName string, ownershipToken string) string {
	return artifactName + ":" + ownershipToken + "\n"
}

func artifactOwnershipMarkerPath(artifactPath string) (string, error) {
	resolvedArtifactPath, err := resolvePathLoose(artifactPath)
	if err != nil {
		return "", err
	}
	info, err := os.Lstat(resolvedArtifactPath)
	if err == nil && info.IsDir() && info.Mode()&os.ModeSymlink == 0 {
		return filepath.Join(resolvedArtifactPath, artifactOwnershipMarkerBasename), nil
	}
	return filepath.Join(filepath.Dir(resolvedArtifactPath), "."+filepath.Base(resolvedArtifactPath)+artifactOwnershipMarkerBasename), nil
}

func artifactOwnershipMarkerError(artifactName string, artifactPath string, ownershipToken string) string {
	markerPath, err := artifactOwnershipMarkerPath(artifactPath)
	if err != nil {
		return fmt.Sprintf("%s: failed to resolve launcher ownership marker (%v)", artifactPath, err)
	}
	content, err := os.ReadFile(markerPath)
	if errorsIsNotExist(err) {
		return fmt.Sprintf("%s: missing launcher ownership marker", artifactPath)
	}
	if err != nil {
		return fmt.Sprintf("%s: failed to read launcher ownership marker (%v)", artifactPath, err)
	}
	expected := artifactOwnershipMarkerContents(artifactName, ownershipToken)
	if string(content) != expected {
		return fmt.Sprintf("%s: launcher ownership marker did not match expected identity", artifactPath)
	}
	return ""
}

func removeArtifactAndMarker(path string) error {
	resolvedPath, err := resolvePathLoose(path)
	if err != nil {
		return err
	}
	info, err := os.Lstat(resolvedPath)
	if err != nil {
		return err
	}
	if info.IsDir() && info.Mode()&os.ModeSymlink == 0 {
		return os.RemoveAll(resolvedPath)
	}
	if err := os.Remove(resolvedPath); err != nil {
		return err
	}
	markerPath, err := artifactOwnershipMarkerPath(resolvedPath)
	if err != nil {
		return err
	}
	if err := os.Remove(markerPath); err != nil && !errorsIsNotExist(err) {
		return err
	}
	return nil
}

func buildUnixLauncherWrapperScript(targetCommand []string, settaHome string) string {
	targetArrayLiteral := shellArrayLiteral(targetCommand)
	settaHomeLiteral := shellQuote(settaHome)
	template := `#!/usr/bin/env bash
set -euo pipefail

TARGET_COMMAND=(__TARGET_ARRAY__)
SETTA_HOME=__SETTA_HOME__

show_failure_dialog() {
  local message="${1-}"
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="Setta Launch Failed" --text="${message}" --width=460 >/dev/null 2>&1 || true
    return
  fi
  if command -v kdialog >/dev/null 2>&1; then
    kdialog --error "${message}" --title "Setta Launch Failed" >/dev/null 2>&1 || true
  fi
}

run_launcher() {
  local cmd=("${TARGET_COMMAND[@]}" --launcher-artifact-run --setta-home "${SETTA_HOME}")
  if [[ $# -gt 0 && -n "${1-}" ]]; then
    cmd+=("$1")
  fi

  local output=""
  if output="$("${cmd[@]}" 2>&1)"; then
    return 0
  fi

  local exit_code=$?
  printf '%s\n' "${output}" >&2
  show_failure_dialog "Setta could not start. Open a terminal and rerun the desktop launcher to see details."
  return "${exit_code}"
}

if [[ $# -gt 0 ]]; then
  first_path="$1"
  if [[ -d "${first_path}" ]]; then
    run_launcher "${first_path}"
    exit $?
  fi
  if [[ -e "${first_path}" ]]; then
    run_launcher "$(dirname "${first_path}")"
    exit $?
  fi
fi

run_launcher
exit $?
`
	return strings.ReplaceAll(
		strings.ReplaceAll(template, "__TARGET_ARRAY__", targetArrayLiteral),
		"__SETTA_HOME__",
		settaHomeLiteral,
	)
}

func buildWindowsLauncherWrapper(targetCommand []string, settaHome string) string {
	quotedTargetCommand := quoteCommandForCMD(targetCommand)
	quotedSettaHome := quoteForCMD(settaHome)
	return "@echo off\r\n" +
		"setlocal\r\n" +
		"set \"setta_launcher_log=%TEMP%\\setta-launcher-error-%RANDOM%%RANDOM%.log\"\r\n" +
		"if not \"%~1\"==\"\" (\r\n" +
		"  set \"first_path=%~1\"\r\n" +
		")\r\n" +
		quotedTargetCommand + " --launcher-artifact-run --setta-home " + quotedSettaHome + " \"%first_path%\" > \"%setta_launcher_log%\" 2>&1\r\n" +
		"set \"setta_launcher_exit=%ERRORLEVEL%\"\r\n" +
		"if \"%setta_launcher_exit%\"==\"0\" (\r\n" +
		"  if exist \"%setta_launcher_log%\" del /q \"%setta_launcher_log%\" >nul 2>&1\r\n" +
		"  exit /b 0\r\n" +
		")\r\n" +
		"echo Setta could not start.>&2\r\n" +
		"if exist \"%setta_launcher_log%\" type \"%setta_launcher_log%\" >&2\r\n" +
		"powershell -NoProfile -ExecutionPolicy Bypass -Command \"$msg='Setta could not start. Open PowerShell and rerun the desktop launcher to see details.'; try { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($msg,'Setta Launch Failed','OK','Error') | Out-Null } catch { }\"\r\n" +
		"exit /b %setta_launcher_exit%\r\n"
}

func buildLinuxDesktopEntry(appName string, wrapperPath string, iconPath string) (string, error) {
	escapedWrapper, err := escapeDesktopExecArgument(wrapperPath)
	if err != nil {
		return "", err
	}
	iconLine := ""
	if iconPath != "" {
		iconLine = "Icon=" + iconPath + "\n"
	}
	return "[Desktop Entry]\n" +
		"Type=Application\n" +
		"Version=1.0\n" +
		"Name=" + appName + "\n" +
		"Comment=Launch Setta\n" +
		"Exec=" + escapedWrapper + " %F\n" +
		iconLine +
		"Terminal=false\n" +
		"Categories=Development;IDE;\n" +
		"StartupNotify=true\n", nil
}

func buildMacOSInfoPlist(iconFileName string) (string, error) {
	builder := strings.Builder{}
	builder.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	builder.WriteString("<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n")
	builder.WriteString("<plist version=\"1.0\">\n")
	builder.WriteString("  <dict>\n")
	writePlistString := func(key string, value string) {
		builder.WriteString("    <key>")
		builder.WriteString(escapeXMLText(key))
		builder.WriteString("</key>\n")
		builder.WriteString("    <string>")
		builder.WriteString(escapeXMLText(value))
		builder.WriteString("</string>\n")
	}
	writePlistString("CFBundleDisplayName", "Setta")
	writePlistString("CFBundleExecutable", "setta-launcher")
	writePlistString("CFBundleIdentifier", "dev.setta.desktop")
	writePlistString("CFBundleName", "Setta")
	writePlistString("CFBundlePackageType", "APPL")
	writePlistString("CFBundleShortVersionString", "1.0")
	writePlistString("CFBundleVersion", "1")
	writePlistString("LSMinimumSystemVersion", "11.0")
	if iconFileName != "" {
		writePlistString("CFBundleIconFile", iconFileName)
	}
	builder.WriteString("  </dict>\n")
	builder.WriteString("</plist>\n")
	return builder.String(), nil
}

func copyMacOSIcon(sourcePath string, destinationDir string, targetCommand []string) (string, error) {
	resolvedSourcePath, err := resolveMacOSIconSourcePath(sourcePath, targetCommand)
	if err != nil {
		return "", err
	}
	if strings.ToLower(filepath.Ext(resolvedSourcePath)) != ".icns" {
		return "", &LauncherArtifactError{Message: "Artifact option `icon_path` must point to a .icns file."}
	}
	info, err := os.Stat(resolvedSourcePath)
	if err != nil || info == nil || !info.Mode().IsRegular() {
		return "", &LauncherArtifactError{Message: fmt.Sprintf("Icon file does not exist: %s", resolvedSourcePath)}
	}
	iconFileName, err := validateFileNameComponent("icon_path", filepath.Base(resolvedSourcePath))
	if err != nil {
		return "", err
	}
	destinationPath := filepath.Join(destinationDir, iconFileName)
	if err := copyArtifactFile(resolvedSourcePath, destinationPath, 0o644); err != nil {
		return "", err
	}
	return iconFileName, nil
}

func resolveMacOSIconSourcePath(sourcePath string, targetCommand []string) (string, error) {
	trimmedSourcePath := strings.TrimSpace(sourcePath)
	if trimmedSourcePath == "" {
		return resolveBundledMacOSIconPath(targetCommand)
	}
	resolvedSourcePath, err := resolvePathLoose(trimmedSourcePath)
	if err != nil {
		return "", &LauncherArtifactError{Message: fmt.Sprintf("resolve icon_path: %v", err)}
	}
	return resolvedSourcePath, nil
}

func resolveBundledMacOSIconPath(targetCommand []string) (string, error) {
	for _, candidatePath := range bundledMacOSIconCandidates(targetCommand) {
		info, err := os.Stat(candidatePath)
		if err == nil && info.Mode().IsRegular() {
			return candidatePath, nil
		}
	}
	return "", &LauncherArtifactError{Message: fmt.Sprintf("Bundled launcher icon is missing: %s", defaultMacOSIconFileName)}
}

func bundledMacOSIconCandidates(targetCommand []string) []string {
	candidates := make([]string, 0, 8)
	seen := map[string]struct{}{}
	appendCandidate := func(candidatePath string) {
		if strings.TrimSpace(candidatePath) == "" {
			return
		}
		if _, ok := seen[candidatePath]; ok {
			return
		}
		seen[candidatePath] = struct{}{}
		candidates = append(candidates, candidatePath)
	}

	if len(targetCommand) > 0 {
		if resolvedExecutablePath, err := resolvePathLoose(targetCommand[0]); err == nil {
			for parentDir := filepath.Dir(resolvedExecutablePath); ; parentDir = filepath.Dir(parentDir) {
				appendCandidate(filepath.Join(parentDir, "launcher_artifacts", "assets", defaultMacOSIconFileName))
				nextParent := filepath.Dir(parentDir)
				if nextParent == parentDir {
					break
				}
			}
		}
	}

	if _, currentFilePath, _, ok := runtime.Caller(0); ok {
		appendCandidate(filepath.Join(filepath.Dir(currentFilePath), "..", "..", "backend", "setta", "launcher_artifacts", "assets", defaultMacOSIconFileName))
	}
	return candidates
}

func resolveOptionalLinuxIconPath(rawValue string) (string, error) {
	trimmedValue := strings.TrimSpace(rawValue)
	if trimmedValue == "" {
		return "", nil
	}
	resolvedPath, err := resolvePathLoose(trimmedValue)
	if err != nil {
		return "", &LauncherArtifactError{Message: fmt.Sprintf("resolve icon_path: %v", err)}
	}
	if err := validateTextValueWithoutControlCharacters("icon_path", resolvedPath); err != nil {
		return "", err
	}
	info, err := os.Stat(resolvedPath)
	if err != nil || info == nil || !info.Mode().IsRegular() {
		return "", &LauncherArtifactError{Message: fmt.Sprintf("Icon file does not exist: %s", resolvedPath)}
	}
	return resolvedPath, nil
}

func refreshLinuxDesktopDatabase(applicationsDir string) {
	executablePath, err := exec.LookPath("update-desktop-database")
	if err != nil {
		return
	}
	cmd := exec.Command(executablePath, applicationsDir)
	cmd.Stdout = nil
	cmd.Stderr = nil
	_ = cmd.Run()
}

func createWindowsShortcut(shortcutPath string, targetPath string) error {
	powershellPath, err := exec.LookPath("powershell")
	if err != nil {
		powershellPath, err = exec.LookPath("pwsh")
	}
	if err != nil {
		return &LauncherArtifactError{Message: "PowerShell is required to create Windows launcher shortcuts."}
	}
	script := strings.Join([]string{
		"param([string]$ShortcutPath,[string]$TargetPath)",
		"$shortcutDir = Split-Path -Parent $ShortcutPath",
		"if ($shortcutDir) { New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null }",
		"$wshShell = New-Object -ComObject WScript.Shell",
		"$shortcut = $wshShell.CreateShortcut($ShortcutPath)",
		"$shortcut.TargetPath = $TargetPath",
		"$shortcut.WorkingDirectory = Split-Path -Parent $TargetPath",
		"$shortcut.Description = 'Launch Setta'",
		"$shortcut.Save()",
	}, ";")
	result, err := defaultLauncherCommandRunner([]string{
		powershellPath,
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-Command",
		script,
		"-ShortcutPath",
		shortcutPath,
		"-TargetPath",
		targetPath,
	})
	if err != nil {
		return &LauncherArtifactError{Message: fmt.Sprintf("Failed to create Windows shortcut: %v", err)}
	}
	if result.ExitCode != 0 {
		return &LauncherArtifactError{Message: fmt.Sprintf("Failed to create Windows shortcut: %s", formatLauncherCommandFailure(result))}
	}
	return nil
}

func writeArtifactTextFile(path string, content string, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create artifact parent directory: %w", err)
	}
	return statefs.AtomicWriteFile(path, []byte(content), mode)
}

func copyArtifactFile(sourcePath string, destinationPath string, mode os.FileMode) error {
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		return &LauncherArtifactError{Message: fmt.Sprintf("copy artifact file: %v", err)}
	}
	if err := os.MkdirAll(filepath.Dir(destinationPath), 0o755); err != nil {
		return &LauncherArtifactError{Message: fmt.Sprintf("copy artifact file: %v", err)}
	}
	if err := statefs.AtomicWriteFile(destinationPath, content, mode); err != nil {
		return &LauncherArtifactError{Message: fmt.Sprintf("copy artifact file: %v", err)}
	}
	return nil
}

func sanitizeDesktopEntryTextValue(options map[string]string, key string, fallback string) (string, error) {
	value := fallback
	if rawValue, ok := options[key]; ok {
		value = rawValue
	}
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue == "" {
		return "", &LauncherArtifactError{Message: fmt.Sprintf("Artifact option `%s` must be non-empty.", key)}
	}
	for _, char := range trimmedValue {
		if char < 0x20 || char == 0x7f {
			return "", &LauncherArtifactError{Message: fmt.Sprintf("Artifact option `%s` must not contain control characters.", key)}
		}
	}
	return trimmedValue, nil
}

func escapeDesktopExecArgument(rawValue string) (string, error) {
	if strings.ContainsAny(rawValue, "\n\r") {
		return "", &LauncherArtifactError{Message: "Launcher wrapper path must not contain newline characters."}
	}
	replacer := strings.NewReplacer(
		"\\", "\\\\",
		"\"", "\\\"",
		"$", "\\$",
		"`", "\\`",
		"%", "%%",
	)
	return "\"" + replacer.Replace(rawValue) + "\"", nil
}

func parseBoolOption(options map[string]string, key string, defaultValue bool) (bool, error) {
	rawValue, ok := options[key]
	if !ok {
		return defaultValue, nil
	}
	switch strings.ToLower(strings.TrimSpace(rawValue)) {
	case "1", "true", "yes", "on":
		return true, nil
	case "0", "false", "no", "off":
		return false, nil
	default:
		return false, &LauncherArtifactError{Message: fmt.Sprintf("Artifact option `%s` must be one of: true/false, 1/0, yes/no, on/off.", key)}
	}
}

func resolvePathOptionWithExisting(
	options map[string]string,
	optionKey string,
	existingManagedArtifacts map[string]string,
	existingKey string,
	defaultPath string,
) (string, error) {
	if rawValue := strings.TrimSpace(options[optionKey]); rawValue != "" {
		return resolvePathLoose(rawValue)
	}
	if existingPath := existingArtifactPath(existingManagedArtifacts, existingKey); existingPath != "" {
		return existingPath, nil
	}
	return resolvePathLoose(defaultPath)
}

func existingArtifactPath(existingManagedArtifacts map[string]string, key string) string {
	rawPath := strings.TrimSpace(existingManagedArtifacts[key])
	if rawPath == "" {
		return ""
	}
	resolvedPath, err := resolvePathLoose(rawPath)
	if err != nil {
		return rawPath
	}
	return resolvedPath
}

func validateFileNameComponent(optionKey string, rawValue string) (string, error) {
	normalizedValue := strings.TrimSpace(rawValue)
	if normalizedValue == "" {
		return "", &LauncherArtifactError{Message: fmt.Sprintf("Artifact option `%s` must be non-empty.", optionKey)}
	}
	if err := validateTextValueWithoutControlCharacters(optionKey, normalizedValue); err != nil {
		return "", err
	}
	if normalizedValue == "." || normalizedValue == ".." {
		return "", &LauncherArtifactError{Message: fmt.Sprintf("Artifact option `%s` must not contain parent/self references.", optionKey)}
	}
	if strings.ContainsAny(normalizedValue, `/\`) {
		return "", &LauncherArtifactError{Message: fmt.Sprintf("Artifact option `%s` must be a file name, not a path.", optionKey)}
	}
	if filepath.Base(normalizedValue) != normalizedValue {
		return "", &LauncherArtifactError{Message: fmt.Sprintf("Artifact option `%s` must be a file name, not a path.", optionKey)}
	}
	return normalizedValue, nil
}

func validateTextValueWithoutControlCharacters(optionKey string, value string) error {
	for _, char := range value {
		if char < 0x20 || char == 0x7f {
			return &LauncherArtifactError{Message: fmt.Sprintf("Artifact option `%s` must not contain control characters.", optionKey)}
		}
	}
	return nil
}

func escapeXMLText(rawValue string) string {
	var buffer bytes.Buffer
	_ = xml.EscapeText(&buffer, []byte(rawValue))
	return buffer.String()
}

func shellArrayLiteral(parts []string) string {
	quoted := make([]string, 0, len(parts))
	for _, part := range parts {
		quoted = append(quoted, shellQuote(part))
	}
	return strings.Join(quoted, " ")
}

func shellQuote(rawValue string) string {
	return "'" + strings.ReplaceAll(rawValue, "'", `'"'"'`) + "'"
}

func quoteCommandForCMD(parts []string) string {
	quoted := make([]string, 0, len(parts))
	for _, part := range parts {
		quoted = append(quoted, quoteForCMD(part))
	}
	return strings.Join(quoted, " ")
}

func quoteForCMD(rawValue string) string {
	return strconv.Quote(rawValue)
}

func resolveWindowsEnvPath(envVar string, fallback string) (string, error) {
	if rawValue := strings.TrimSpace(os.Getenv(envVar)); rawValue != "" {
		return resolvePathLoose(rawValue)
	}
	return resolvePathLoose(fallback)
}

func resolveWindowsProgramsDir() (string, error) {
	homeDir := mustUserHomeDir()
	basePath, err := resolveWindowsEnvPath("APPDATA", filepath.Join(homeDir, "AppData", "Roaming"))
	if err != nil {
		return "", err
	}
	return resolvePathLoose(filepath.Join(basePath, "Microsoft", "Windows", "Start Menu", "Programs"))
}

func resolveWindowsDesktopDir() (string, error) {
	homeDir := mustUserHomeDir()
	basePath, err := resolveWindowsEnvPath("USERPROFILE", homeDir)
	if err != nil {
		return "", err
	}
	return resolvePathLoose(filepath.Join(basePath, "Desktop"))
}

func mustUserHomeDir() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return string(os.PathSeparator)
	}
	return homeDir
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func errorsIsNotExist(err error) bool {
	return err != nil && os.IsNotExist(err)
}
