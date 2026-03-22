package launcher

import (
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestInstallMacOSArtifactsCopiesBundledIconAndWritesBundleFiles(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	appPath := filepath.Join(homeDir, "Applications", "Setta.app")
	settaHome := filepath.Join(homeDir, ".setta")

	artifacts, err := installMacOSArtifacts(launcherArtifactContext{
		TargetCommand:            []string{executable},
		SettaHome:                settaHome,
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"app_path": appPath,
		},
	})
	if err != nil {
		t.Fatalf("install macOS artifacts: %v", err)
	}

	resolvedAppPath, err := resolvePathLoose(appPath)
	if err != nil {
		t.Fatalf("resolve app path: %v", err)
	}
	if !reflect.DeepEqual(artifacts, map[string]string{"macosApp": resolvedAppPath}) {
		t.Fatalf("unexpected managed artifacts %#v", artifacts)
	}

	launcherScriptPath := filepath.Join(appPath, "Contents", "MacOS", "setta-launcher")
	infoPlistPath := filepath.Join(appPath, "Contents", "Info.plist")
	copiedIconPath := filepath.Join(appPath, "Contents", "Resources", defaultMacOSIconFileName)
	for _, path := range []string{launcherScriptPath, infoPlistPath, copiedIconPath} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected launcher artifact %q to exist: %v", path, err)
		}
	}

	sourceIconPath, err := resolveBundledMacOSIconPath([]string{executable})
	if err != nil {
		t.Fatalf("resolve bundled icon path: %v", err)
	}
	sourceIconBytes, err := os.ReadFile(sourceIconPath)
	if err != nil {
		t.Fatalf("read bundled icon: %v", err)
	}
	copiedIconBytes, err := os.ReadFile(copiedIconPath)
	if err != nil {
		t.Fatalf("read copied icon: %v", err)
	}
	if !bytes.Equal(copiedIconBytes, sourceIconBytes) {
		t.Fatal("expected copied bundled icon to match source asset")
	}

	launcherScript, err := os.ReadFile(launcherScriptPath)
	if err != nil {
		t.Fatalf("read launcher script: %v", err)
	}
	launcherScriptText := string(launcherScript)
	if !strings.Contains(launcherScriptText, launcherArtifactRunFlag) {
		t.Fatalf("expected launcher script to invoke %q, got:\n%s", launcherArtifactRunFlag, launcherScriptText)
	}
	if !strings.Contains(launcherScriptText, executable) {
		t.Fatalf("expected launcher script to reference executable %q, got:\n%s", executable, launcherScriptText)
	}
	if !strings.Contains(launcherScriptText, "--setta-home") || !strings.Contains(launcherScriptText, settaHome) {
		t.Fatalf("expected launcher script to scope setta home %q, got:\n%s", settaHome, launcherScriptText)
	}

	infoPlist, err := os.ReadFile(infoPlistPath)
	if err != nil {
		t.Fatalf("read Info.plist: %v", err)
	}
	infoPlistText := string(infoPlist)
	if !strings.Contains(infoPlistText, "CFBundleExecutable") {
		t.Fatalf("expected Info.plist to include CFBundleExecutable, got:\n%s", infoPlistText)
	}
	if !strings.Contains(infoPlistText, "CFBundleIconFile") || !strings.Contains(infoPlistText, defaultMacOSIconFileName) {
		t.Fatalf("expected Info.plist to include bundled icon %q, got:\n%s", defaultMacOSIconFileName, infoPlistText)
	}
}

func TestInstallMacOSArtifactsCopiesOptionalIcon(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	appPath := filepath.Join(homeDir, "Applications", "Setta.app")
	iconPath := filepath.Join(homeDir, "CustomSetta.icns")
	if err := os.WriteFile(iconPath, []byte("icon"), 0o644); err != nil {
		t.Fatalf("write custom icon: %v", err)
	}

	_, err := installMacOSArtifacts(launcherArtifactContext{
		TargetCommand:            []string{executable},
		SettaHome:                filepath.Join(homeDir, ".setta"),
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"app_path":  appPath,
			"icon_path": iconPath,
		},
	})
	if err != nil {
		t.Fatalf("install macOS artifacts with custom icon: %v", err)
	}

	copiedIconPath := filepath.Join(appPath, "Contents", "Resources", "CustomSetta.icns")
	copiedIconBytes, err := os.ReadFile(copiedIconPath)
	if err != nil {
		t.Fatalf("read copied custom icon: %v", err)
	}
	if string(copiedIconBytes) != "icon" {
		t.Fatalf("expected copied custom icon payload, got %q", string(copiedIconBytes))
	}
	infoPlist, err := os.ReadFile(filepath.Join(appPath, "Contents", "Info.plist"))
	if err != nil {
		t.Fatalf("read Info.plist: %v", err)
	}
	if !strings.Contains(string(infoPlist), "CustomSetta.icns") {
		t.Fatalf("expected Info.plist to reference custom icon, got:\n%s", string(infoPlist))
	}
}

func TestInstallMacOSArtifactsWritesXMLSafeInfoPlistForIconNames(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	appPath := filepath.Join(homeDir, "Applications", "Setta.app")
	iconPath := filepath.Join(homeDir, "bad&name.icns")
	if err := os.WriteFile(iconPath, []byte("icon"), 0o644); err != nil {
		t.Fatalf("write custom icon: %v", err)
	}

	_, err := installMacOSArtifacts(launcherArtifactContext{
		TargetCommand:            []string{executable},
		SettaHome:                filepath.Join(homeDir, ".setta"),
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"app_path":  appPath,
			"icon_path": iconPath,
		},
	})
	if err != nil {
		t.Fatalf("install macOS artifacts with XML-sensitive icon name: %v", err)
	}

	infoPlist, err := os.ReadFile(filepath.Join(appPath, "Contents", "Info.plist"))
	if err != nil {
		t.Fatalf("read Info.plist: %v", err)
	}
	decoder := xml.NewDecoder(bytes.NewReader(infoPlist))
	for {
		if _, err := decoder.Token(); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			t.Fatalf("expected Info.plist to remain parseable XML: %v\n%s", err, string(infoPlist))
		}
	}
	if !strings.Contains(string(infoPlist), "bad&amp;name.icns") {
		t.Fatalf("expected escaped icon name in Info.plist, got:\n%s", string(infoPlist))
	}
}

func TestInstallMacOSArtifactsRejectsControlCharactersInIconName(t *testing.T) {
	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	appPath := filepath.Join(homeDir, "Applications", "Setta.app")
	iconPath := filepath.Join(homeDir, "bad\nname.icns")
	if err := os.WriteFile(iconPath, []byte("icon"), 0o644); err != nil {
		t.Fatalf("write invalid icon file: %v", err)
	}

	_, err := installMacOSArtifacts(launcherArtifactContext{
		TargetCommand:            []string{executable},
		SettaHome:                filepath.Join(homeDir, ".setta"),
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"app_path":  appPath,
			"icon_path": iconPath,
		},
	})
	if err == nil {
		t.Fatal("expected control-character icon name to fail")
	}
	var artifactErr *LauncherArtifactError
	if !errors.As(err, &artifactErr) {
		t.Fatalf("expected LauncherArtifactError, got %T: %v", err, err)
	}
	if !strings.Contains(artifactErr.Error(), "icon_path") {
		t.Fatalf("expected icon_path error detail, got %q", artifactErr.Error())
	}
}

func TestInstallMacOSArtifactsFailsWhenBundledIconMissing(t *testing.T) {
	previousDefaultIcon := defaultMacOSIconFileName
	defaultMacOSIconFileName = "MissingSetta.icns"
	defer func() {
		defaultMacOSIconFileName = previousDefaultIcon
	}()

	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")

	_, err := installMacOSArtifacts(launcherArtifactContext{
		TargetCommand:            []string{executable},
		SettaHome:                filepath.Join(homeDir, ".setta"),
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"app_path": filepath.Join(homeDir, "Applications", "Setta.app"),
		},
	})
	if err == nil {
		t.Fatal("expected missing bundled icon failure")
	}
	var artifactErr *LauncherArtifactError
	if !errors.As(err, &artifactErr) {
		t.Fatalf("expected LauncherArtifactError, got %T: %v", err, err)
	}
	if !strings.Contains(artifactErr.Error(), "MissingSetta.icns") {
		t.Fatalf("expected missing icon detail, got %q", artifactErr.Error())
	}
}
