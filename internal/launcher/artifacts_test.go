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

func TestInstallLinuxArtifactsWritesWrapperEntryAndShortcut(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	applicationsDir := filepath.Join(homeDir, "applications")
	wrapperPath := filepath.Join(homeDir, "launcher", "setta-launcher")
	desktopShortcutPath := filepath.Join(homeDir, "Desktop", "setta.desktop")
	iconPath := filepath.Join(homeDir, "setta.png")
	if err := os.WriteFile(iconPath, []byte("png"), 0o644); err != nil {
		t.Fatalf("write icon: %v", err)
	}
	settaHome := filepath.Join(homeDir, ".setta")

	artifacts, err := installLinuxArtifacts(launcherArtifactContext{
		TargetCommand:            []string{executable},
		SettaHome:                settaHome,
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"applications_dir":      applicationsDir,
			"desktop_entry_name":    "setta.desktop",
			"wrapper_path":          wrapperPath,
			"desktop_shortcut":      "true",
			"desktop_shortcut_path": desktopShortcutPath,
			"app_name":              "Setta Test",
			"icon_path":             iconPath,
		},
	})
	if err != nil {
		t.Fatalf("install linux artifacts: %v", err)
	}

	resolvedDesktopEntryPath, err := resolvePathLoose(filepath.Join(applicationsDir, "setta.desktop"))
	if err != nil {
		t.Fatalf("resolve desktop entry path: %v", err)
	}
	resolvedWrapperPath, err := resolvePathLoose(wrapperPath)
	if err != nil {
		t.Fatalf("resolve wrapper path: %v", err)
	}
	resolvedDesktopShortcutPath, err := resolvePathLoose(desktopShortcutPath)
	if err != nil {
		t.Fatalf("resolve desktop shortcut path: %v", err)
	}
	if !reflect.DeepEqual(artifacts, map[string]string{
		"linuxDesktopEntry":    resolvedDesktopEntryPath,
		"linuxWrapper":         resolvedWrapperPath,
		"linuxDesktopShortcut": resolvedDesktopShortcutPath,
	}) {
		t.Fatalf("unexpected managed artifacts %#v", artifacts)
	}

	wrapperScript, err := os.ReadFile(wrapperPath)
	if err != nil {
		t.Fatalf("read wrapper script: %v", err)
	}
	wrapperScriptText := string(wrapperScript)
	if !strings.Contains(wrapperScriptText, launcherArtifactRunFlag) {
		t.Fatalf("expected launcher wrapper to invoke %q, got:\n%s", launcherArtifactRunFlag, wrapperScriptText)
	}
	if !strings.Contains(wrapperScriptText, executable) {
		t.Fatalf("expected launcher wrapper to reference executable %q, got:\n%s", executable, wrapperScriptText)
	}
	if !strings.Contains(wrapperScriptText, "--setta-home") || !strings.Contains(wrapperScriptText, settaHome) {
		t.Fatalf("expected launcher wrapper to scope setta home %q, got:\n%s", settaHome, wrapperScriptText)
	}

	desktopEntry, err := os.ReadFile(filepath.Join(applicationsDir, "setta.desktop"))
	if err != nil {
		t.Fatalf("read desktop entry: %v", err)
	}
	desktopEntryText := string(desktopEntry)
	escapedWrapper, err := escapeDesktopExecArgument(resolvedWrapperPath)
	if err != nil {
		t.Fatalf("escape wrapper path: %v", err)
	}
	if !strings.Contains(desktopEntryText, "Name=Setta Test") {
		t.Fatalf("expected desktop entry app name, got:\n%s", desktopEntryText)
	}
	if !strings.Contains(desktopEntryText, "Exec="+escapedWrapper+" %F") {
		t.Fatalf("expected escaped wrapper exec line, got:\n%s", desktopEntryText)
	}
	resolvedIconPath, err := resolvePathLoose(iconPath)
	if err != nil {
		t.Fatalf("resolve icon path: %v", err)
	}
	if !strings.Contains(desktopEntryText, "Icon="+resolvedIconPath) {
		t.Fatalf("expected icon line for %q, got:\n%s", resolvedIconPath, desktopEntryText)
	}

	desktopShortcut, err := os.ReadFile(desktopShortcutPath)
	if err != nil {
		t.Fatalf("read desktop shortcut: %v", err)
	}
	if string(desktopShortcut) != desktopEntryText {
		t.Fatalf("expected desktop shortcut to match desktop entry, got:\n%s", string(desktopShortcut))
	}
}

func TestInstallLinuxArtifactsDoesNotDeleteExistingShortcutWhenDisabled(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	applicationsDir := filepath.Join(homeDir, "applications")
	wrapperPath := filepath.Join(homeDir, "launcher", "setta-launcher")
	desktopShortcutPath := filepath.Join(homeDir, "Desktop", "setta.desktop")
	if err := os.MkdirAll(filepath.Dir(desktopShortcutPath), 0o755); err != nil {
		t.Fatalf("mkdir desktop shortcut parent: %v", err)
	}
	if err := os.WriteFile(desktopShortcutPath, []byte("shortcut"), 0o644); err != nil {
		t.Fatalf("write existing shortcut: %v", err)
	}

	artifacts, err := installLinuxArtifacts(launcherArtifactContext{
		TargetCommand: []string{executable},
		SettaHome:     filepath.Join(homeDir, ".setta"),
		ExistingManagedArtifacts: map[string]string{
			"linuxDesktopShortcut": desktopShortcutPath,
		},
		Options: map[string]string{
			"applications_dir":   applicationsDir,
			"desktop_entry_name": "setta.desktop",
			"wrapper_path":       wrapperPath,
			"desktop_shortcut":   "false",
		},
	})
	if err != nil {
		t.Fatalf("install linux artifacts with disabled shortcut: %v", err)
	}
	if _, ok := artifacts["linuxDesktopShortcut"]; ok {
		t.Fatalf("expected linuxDesktopShortcut to be omitted, got %#v", artifacts)
	}
	content, err := os.ReadFile(desktopShortcutPath)
	if err != nil {
		t.Fatalf("read existing shortcut: %v", err)
	}
	if string(content) != "shortcut" {
		t.Fatalf("expected existing shortcut to remain untouched, got %q", string(content))
	}
}

func TestInstallLinuxArtifactsEscapesExecArgumentForSpacedWrapperPath(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	applicationsDir := filepath.Join(homeDir, "applications")
	wrapperPath := filepath.Join(homeDir, "launcher bin", "setta launcher%test")

	_, err := installLinuxArtifacts(launcherArtifactContext{
		TargetCommand:            []string{executable},
		SettaHome:                filepath.Join(homeDir, ".setta"),
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"applications_dir":   applicationsDir,
			"desktop_entry_name": "setta.desktop",
			"wrapper_path":       wrapperPath,
		},
	})
	if err != nil {
		t.Fatalf("install linux artifacts with spaced wrapper path: %v", err)
	}

	resolvedWrapperPath, err := resolvePathLoose(wrapperPath)
	if err != nil {
		t.Fatalf("resolve wrapper path: %v", err)
	}
	escapedWrapper, err := escapeDesktopExecArgument(resolvedWrapperPath)
	if err != nil {
		t.Fatalf("escape wrapper path: %v", err)
	}
	desktopEntry, err := os.ReadFile(filepath.Join(applicationsDir, "setta.desktop"))
	if err != nil {
		t.Fatalf("read desktop entry: %v", err)
	}
	if !strings.Contains(string(desktopEntry), "Exec="+escapedWrapper+" %F") {
		t.Fatalf("expected escaped exec line, got:\n%s", string(desktopEntry))
	}
}

func TestInstallLinuxArtifactsRejectsControlCharactersInAppName(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	for _, appName := range []string{
		"Setta\nInjected",
		"Setta\rInjected",
		"Setta\x1fInjected",
	} {
		t.Run(strings.NewReplacer("\n", "\\n", "\r", "\\r", "\x1f", "\\x1f").Replace(appName), func(t *testing.T) {
			homeDir := prepareLauncherArtifactTestHome(t)
			executable := writeTestExecutable(t, t.TempDir(), "setta")
			applicationsDir := filepath.Join(homeDir, "applications")
			wrapperPath := filepath.Join(homeDir, "launcher", "setta-launcher")

			_, err := installLinuxArtifacts(launcherArtifactContext{
				TargetCommand:            []string{executable},
				SettaHome:                filepath.Join(homeDir, ".setta"),
				ExistingManagedArtifacts: map[string]string{},
				Options: map[string]string{
					"applications_dir":   applicationsDir,
					"desktop_entry_name": "setta.desktop",
					"wrapper_path":       wrapperPath,
					"app_name":           appName,
				},
			})
			if err == nil {
				t.Fatal("expected control-character app name to fail")
			}
			var artifactErr *LauncherArtifactError
			if !errors.As(err, &artifactErr) {
				t.Fatalf("expected LauncherArtifactError, got %T: %v", err, err)
			}
			if !strings.Contains(artifactErr.Error(), "app_name") {
				t.Fatalf("expected app_name detail, got %q", artifactErr.Error())
			}
			if _, statErr := os.Stat(wrapperPath); !os.IsNotExist(statErr) {
				t.Fatalf("expected wrapper path to remain absent, stat err=%v", statErr)
			}
		})
	}
}

func TestInstallLinuxArtifactsRejectsControlCharactersInIconPath(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	applicationsDir := filepath.Join(homeDir, "applications")
	wrapperPath := filepath.Join(homeDir, "launcher", "setta-launcher")
	iconPath := filepath.Join(homeDir, "bad\nXDG-OPEN=1.png")
	if err := os.WriteFile(iconPath, []byte("png"), 0o644); err != nil {
		t.Fatalf("write invalid icon path: %v", err)
	}

	_, err := installLinuxArtifacts(launcherArtifactContext{
		TargetCommand:            []string{executable},
		SettaHome:                filepath.Join(homeDir, ".setta"),
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"applications_dir":   applicationsDir,
			"desktop_entry_name": "setta.desktop",
			"wrapper_path":       wrapperPath,
			"icon_path":          iconPath,
		},
	})
	if err == nil {
		t.Fatal("expected control-character icon path to fail")
	}
	var artifactErr *LauncherArtifactError
	if !errors.As(err, &artifactErr) {
		t.Fatalf("expected LauncherArtifactError, got %T: %v", err, err)
	}
	if !strings.Contains(artifactErr.Error(), "icon_path") {
		t.Fatalf("expected icon_path detail, got %q", artifactErr.Error())
	}
	if _, statErr := os.Stat(wrapperPath); !os.IsNotExist(statErr) {
		t.Fatalf("expected wrapper path to remain absent, stat err=%v", statErr)
	}
}

func TestInstallLinuxArtifactsRejectsPathLikeDesktopEntryName(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	homeDir := prepareLauncherArtifactTestHome(t)
	executable := writeTestExecutable(t, t.TempDir(), "setta")
	applicationsDir := filepath.Join(homeDir, "applications")
	wrapperPath := filepath.Join(homeDir, "launcher", "setta-launcher")

	_, err := installLinuxArtifacts(launcherArtifactContext{
		TargetCommand:            []string{executable},
		SettaHome:                filepath.Join(homeDir, ".setta"),
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"applications_dir":   applicationsDir,
			"desktop_entry_name": "../setta.desktop",
			"wrapper_path":       wrapperPath,
		},
	})
	if err == nil {
		t.Fatal("expected path-like desktop entry name to fail")
	}
	var artifactErr *LauncherArtifactError
	if !errors.As(err, &artifactErr) {
		t.Fatalf("expected LauncherArtifactError, got %T: %v", err, err)
	}
	if !strings.Contains(artifactErr.Error(), "desktop_entry_name") {
		t.Fatalf("expected desktop_entry_name detail, got %q", artifactErr.Error())
	}
	if _, statErr := os.Stat(wrapperPath); !os.IsNotExist(statErr) {
		t.Fatalf("expected wrapper path to remain absent, stat err=%v", statErr)
	}
}

func TestInstallWindowsArtifactsWritesWrapperAndShortcuts(t *testing.T) {
	homeDir := prepareWindowsLauncherArtifactEnv(t)
	installFakePowerShell(t)

	wrapperPath := filepath.Join(homeDir, "wrapper", "setta-launcher.cmd")
	startMenuShortcutPath := filepath.Join(homeDir, "start-menu", "Setta Test.lnk")
	desktopShortcutPath := filepath.Join(homeDir, "desktop", "Setta Test.lnk")
	settaHome := filepath.Join(homeDir, "setta-home")

	artifacts, err := installWindowsArtifacts(launcherArtifactContext{
		TargetCommand:            []string{`C:\Python\python.exe`, "-m", "setta"},
		SettaHome:                settaHome,
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"app_name":                 "Setta Test",
			"wrapper_path":             wrapperPath,
			"start_menu_shortcut_path": startMenuShortcutPath,
			"desktop_shortcut":         "true",
			"desktop_shortcut_path":    desktopShortcutPath,
		},
	})
	if err != nil {
		t.Fatalf("install windows artifacts: %v", err)
	}

	resolvedWrapperPath, err := resolvePathLoose(wrapperPath)
	if err != nil {
		t.Fatalf("resolve wrapper path: %v", err)
	}
	resolvedStartMenuShortcutPath, err := resolvePathLoose(startMenuShortcutPath)
	if err != nil {
		t.Fatalf("resolve start-menu shortcut path: %v", err)
	}
	resolvedDesktopShortcutPath, err := resolvePathLoose(desktopShortcutPath)
	if err != nil {
		t.Fatalf("resolve desktop shortcut path: %v", err)
	}
	if !reflect.DeepEqual(artifacts, map[string]string{
		"windowsWrapper":           resolvedWrapperPath,
		"windowsStartMenuShortcut": resolvedStartMenuShortcutPath,
		"windowsDesktopShortcut":   resolvedDesktopShortcutPath,
	}) {
		t.Fatalf("unexpected managed artifacts %#v", artifacts)
	}

	wrapperScript, err := os.ReadFile(wrapperPath)
	if err != nil {
		t.Fatalf("read wrapper script: %v", err)
	}
	wrapperScriptText := string(wrapperScript)
	if !strings.Contains(wrapperScriptText, launcherArtifactRunFlag) {
		t.Fatalf("expected windows wrapper to invoke %q, got:\n%s", launcherArtifactRunFlag, wrapperScriptText)
	}
	if !strings.Contains(wrapperScriptText, quoteCommandForCMD([]string{`C:\Python\python.exe`, "-m", "setta"})) {
		t.Fatalf("expected wrapper to reference quoted target command, got:\n%s", wrapperScriptText)
	}
	if !strings.Contains(wrapperScriptText, "--setta-home "+quoteForCMD(settaHome)) {
		t.Fatalf("expected wrapper to scope setta home %q, got:\n%s", settaHome, wrapperScriptText)
	}
	if !strings.Contains(wrapperScriptText, "Setta could not start.") {
		t.Fatalf("expected failure guidance in wrapper, got:\n%s", wrapperScriptText)
	}

	for _, shortcutPath := range []string{startMenuShortcutPath, desktopShortcutPath} {
		shortcutContent, err := os.ReadFile(shortcutPath)
		if err != nil {
			t.Fatalf("read shortcut %q: %v", shortcutPath, err)
		}
		if string(shortcutContent) != resolvedWrapperPath {
			t.Fatalf("expected shortcut %q to target %q, got %q", shortcutPath, resolvedWrapperPath, string(shortcutContent))
		}
	}
}

func TestInstallWindowsArtifactsQuotesForwardedPath(t *testing.T) {
	homeDir := prepareWindowsLauncherArtifactEnv(t)
	installFakePowerShell(t)

	wrapperPath := filepath.Join(homeDir, "wrapper", "setta-launcher.cmd")
	startMenuShortcutPath := filepath.Join(homeDir, "start-menu", "Setta Test.lnk")

	_, err := installWindowsArtifacts(launcherArtifactContext{
		TargetCommand:            []string{`C:\Python\python.exe`, "-m", "setta"},
		SettaHome:                filepath.Join(homeDir, "setta-home"),
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"app_name":                 "Setta Test",
			"wrapper_path":             wrapperPath,
			"start_menu_shortcut_path": startMenuShortcutPath,
		},
	})
	if err != nil {
		t.Fatalf("install windows artifacts: %v", err)
	}

	wrapperScript, err := os.ReadFile(wrapperPath)
	if err != nil {
		t.Fatalf("read wrapper script: %v", err)
	}
	wrapperScriptText := string(wrapperScript)
	if !strings.Contains(wrapperScriptText, "\"%first_path%\"") {
		t.Fatalf("expected forwarded path to stay quoted, got:\n%s", wrapperScriptText)
	}
	if strings.Contains(wrapperScriptText, " %first_path% >") {
		t.Fatalf("expected forwarded path to avoid unquoted form, got:\n%s", wrapperScriptText)
	}
}

func TestInstallWindowsArtifactsRejectsPathLikeAppName(t *testing.T) {
	homeDir := prepareWindowsLauncherArtifactEnv(t)
	installFakePowerShell(t)

	wrapperPath := filepath.Join(homeDir, "wrapper", "setta-launcher.cmd")

	_, err := installWindowsArtifacts(launcherArtifactContext{
		TargetCommand:            []string{`C:\Python\python.exe`, "-m", "setta"},
		SettaHome:                filepath.Join(homeDir, "setta-home"),
		ExistingManagedArtifacts: map[string]string{},
		Options: map[string]string{
			"app_name":     `..\Setta Test`,
			"wrapper_path": wrapperPath,
		},
	})
	if err == nil {
		t.Fatal("expected path-like app name to fail")
	}
	var artifactErr *LauncherArtifactError
	if !errors.As(err, &artifactErr) {
		t.Fatalf("expected LauncherArtifactError, got %T: %v", err, err)
	}
	if !strings.Contains(artifactErr.Error(), "app_name") {
		t.Fatalf("expected app_name detail, got %q", artifactErr.Error())
	}
	if _, statErr := os.Stat(wrapperPath); !os.IsNotExist(statErr) {
		t.Fatalf("expected wrapper path to remain absent, stat err=%v", statErr)
	}
}

func TestInstallWindowsArtifactsKeepsExistingDesktopShortcutWhenDisabled(t *testing.T) {
	homeDir := prepareWindowsLauncherArtifactEnv(t)
	installFakePowerShell(t)

	wrapperPath := filepath.Join(homeDir, "wrapper", "setta-launcher.cmd")
	startMenuShortcutPath := filepath.Join(homeDir, "start-menu", "Setta Test.lnk")
	existingDesktopShortcutPath := filepath.Join(homeDir, "desktop", "Setta Test.lnk")
	if err := os.MkdirAll(filepath.Dir(existingDesktopShortcutPath), 0o755); err != nil {
		t.Fatalf("mkdir existing desktop shortcut parent: %v", err)
	}
	if err := os.WriteFile(existingDesktopShortcutPath, []byte("shortcut"), 0o644); err != nil {
		t.Fatalf("write existing desktop shortcut: %v", err)
	}

	artifacts, err := installWindowsArtifacts(launcherArtifactContext{
		TargetCommand: []string{`C:\Python\python.exe`, "-m", "setta"},
		SettaHome:     filepath.Join(homeDir, "setta-home"),
		ExistingManagedArtifacts: map[string]string{
			"windowsDesktopShortcut": existingDesktopShortcutPath,
		},
		Options: map[string]string{
			"app_name":                 "Setta Test",
			"wrapper_path":             wrapperPath,
			"start_menu_shortcut_path": startMenuShortcutPath,
			"desktop_shortcut":         "false",
		},
	})
	if err != nil {
		t.Fatalf("install windows artifacts with disabled desktop shortcut: %v", err)
	}
	if _, ok := artifacts["windowsDesktopShortcut"]; ok {
		t.Fatalf("expected windowsDesktopShortcut to be omitted, got %#v", artifacts)
	}
	content, err := os.ReadFile(existingDesktopShortcutPath)
	if err != nil {
		t.Fatalf("read existing desktop shortcut: %v", err)
	}
	if string(content) != "shortcut" {
		t.Fatalf("expected existing desktop shortcut to remain untouched, got %q", string(content))
	}
}

func prepareWindowsLauncherArtifactEnv(t *testing.T) string {
	t.Helper()

	homeDir := filepath.Join(t.TempDir(), "windows-home")
	t.Setenv("LOCALAPPDATA", filepath.Join(homeDir, "LocalAppData"))
	t.Setenv("APPDATA", filepath.Join(homeDir, "AppData"))
	t.Setenv("USERPROFILE", filepath.Join(homeDir, "UserProfile"))
	return homeDir
}

func installFakePowerShell(t *testing.T) {
	t.Helper()

	dir := t.TempDir()
	path := filepath.Join(dir, "powershell")
	script := `#!/bin/sh
set -eu
shortcut_path=""
target_path=""
while [ "$#" -gt 0 ]; do
	case "$1" in
		-ShortcutPath)
			shortcut_path="$2"
			shift 2
			;;
		-TargetPath)
			target_path="$2"
			shift 2
			;;
		*)
			shift
			;;
	esac
done
mkdir -p "$(dirname "$shortcut_path")"
printf '%s' "$target_path" > "$shortcut_path"
`
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake powershell: %v", err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
}
