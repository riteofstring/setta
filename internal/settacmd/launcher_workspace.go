package settacmd

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/launcher"
)

func defaultLauncherRootDependencies() launcherRootDependencies {
	tokenManager := auth.NewBootstrapTokenManager(auth.DefaultBootstrapTokenTTL, auth.NewNonceTracker())
	return launcherRootDependencies{
		loadBaseConfig:           resolveLauncherCommandConfig,
		loadMetadata:             launcher.LoadLauncherInstallMetadata,
		resolveUserHome:          os.UserHomeDir,
		validateMetadataTarget:   launcher.LauncherTargetValidationError,
		resolveCurrentExecutable: os.Executable,
		resolveServerExecutable:  resolveLauncherServerExecutable,
		newSessionLauncher: func(serverExecutable string, launchTimeout time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcher.NewLocalIDESessionLauncher(launcher.LocalIDESessionLauncherOptions{
				ExecutablePath: serverExecutable,
				LaunchTimeout:  launchTimeout,
			})
		},
		now:                time.Now,
		mintBootstrapToken: tokenManager.Mint,
		updateLastUsedWorkspace: func(settaHome string, workspaceRoot string) error {
			return launcher.UpdateLauncherLastUsedWorkspaceIfInstalled(settaHome, workspaceRoot)
		},
		openURLWithMode: openURLWithLauncherMode,
	}
}

func resolveLauncherWorkspaceOption(subcommandWorkspace string, globalWorkspace string) (string, error) {
	trimmedSubcommandWorkspace := strings.TrimSpace(subcommandWorkspace)
	trimmedGlobalWorkspace := strings.TrimSpace(globalWorkspace)
	if trimmedSubcommandWorkspace == "" {
		return trimmedGlobalWorkspace, nil
	}
	if trimmedGlobalWorkspace == "" {
		return trimmedSubcommandWorkspace, nil
	}
	resolvedSubcommandWorkspace, err := resolveCLIPath(trimmedSubcommandWorkspace)
	if err != nil {
		return "", err
	}
	resolvedGlobalWorkspace, err := resolveCLIPath(trimmedGlobalWorkspace)
	if err != nil {
		return "", err
	}
	if resolvedSubcommandWorkspace != resolvedGlobalWorkspace {
		return "", fmt.Errorf("Conflicting --workspace provided at both the global CLI level and the launcher subcommand.")
	}
	return trimmedSubcommandWorkspace, nil
}

func resolveLauncherWorkspaceRoot(explicitWorkspace string, installedMetadata *launcher.LauncherInstallMetadata, resolveUserHome func() (string, error)) (string, bool, error) {
	if resolvedWorkspace, ok, err := resolveExplicitLauncherWorkspaceRoot(explicitWorkspace); ok || err != nil {
		return resolvedWorkspace, false, err
	}
	if resolvedWorkspace, ok, err := resolveMetadataLauncherWorkspaceRoot(installedMetadata); ok || err != nil {
		return resolvedWorkspace, false, err
	}
	resolvedHome, err := resolveLauncherHomeWorkspaceRoot(resolveUserHome)
	if err != nil {
		return "", false, err
	}
	return resolvedHome, true, nil
}

func resolveExplicitLauncherWorkspaceRoot(explicitWorkspace string) (string, bool, error) {
	if strings.TrimSpace(explicitWorkspace) == "" {
		return "", false, nil
	}
	resolvedWorkspace, err := resolveCLIPath(explicitWorkspace)
	if err != nil {
		return "", false, err
	}
	return resolvedWorkspace, true, nil
}

func resolveMetadataLauncherWorkspaceRoot(installedMetadata *launcher.LauncherInstallMetadata) (string, bool, error) {
	if launcherWorkspaceBehavior(installedMetadata) == launcher.LauncherWorkspaceBehaviorAlwaysPrompt {
		return "", false, nil
	}
	lastUsedWorkspace := launcherMetadataLastUsedWorkspace(installedMetadata)
	if lastUsedWorkspace == "" {
		return "", false, nil
	}
	candidate, err := resolveCLIPath(lastUsedWorkspace)
	if err != nil {
		return "", false, err
	}
	if !pathIsExistingDirectory(candidate) {
		return "", false, nil
	}
	return candidate, true, nil
}

func resolveLauncherRunOpenMode(rawOpenMode string, installedMetadata *launcher.LauncherInstallMetadata) (launcher.LauncherOpenMode, error) {
	if strings.TrimSpace(rawOpenMode) != "" {
		normalized, err := normalizeLauncherOpenMode(rawOpenMode)
		if err != nil {
			return "", err
		}
		return *normalized, nil
	}
	if installedMetadata != nil && strings.TrimSpace(installedMetadata.OpenMode) != "" {
		return launcher.LauncherOpenMode(installedMetadata.OpenMode), nil
	}
	return launcher.LauncherOpenModeChromeApp, nil
}

func effectiveLauncherWorkspaceBehavior(installedMetadata *launcher.LauncherInstallMetadata) string {
	return string(launcherWorkspaceBehavior(installedMetadata))
}

func launcherWorkspaceBehavior(installedMetadata *launcher.LauncherInstallMetadata) launcher.LauncherWorkspaceBehavior {
	if installedMetadata != nil && strings.TrimSpace(installedMetadata.WorkspaceBehavior) != "" {
		return launcher.LauncherWorkspaceBehavior(installedMetadata.WorkspaceBehavior)
	}
	return launcher.LauncherWorkspaceBehaviorDefault
}

func launcherMetadataLastUsedWorkspace(installedMetadata *launcher.LauncherInstallMetadata) string {
	if installedMetadata == nil || installedMetadata.LastUsedWorkspace == nil {
		return ""
	}
	return strings.TrimSpace(*installedMetadata.LastUsedWorkspace)
}

func pathIsExistingDirectory(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func resolveLauncherHomeWorkspaceRoot(resolveUserHome func() (string, error)) (string, error) {
	homeDir, err := resolveUserHome()
	if err != nil {
		return "", fmt.Errorf("resolve user home: %w", err)
	}
	resolvedHome, err := resolveCLIPath(homeDir)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(resolvedHome)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("Home directory is not a directory: %s", resolvedHome)
	}
	return resolvedHome, nil
}

func normalizeLauncherRunSettaFilesLocation(rawLocation string, settaFilesRoot string, profile string) *string {
	trimmedLocation := strings.ToLower(strings.TrimSpace(rawLocation))
	switch {
	case trimmedLocation != "":
		if strings.TrimSpace(settaFilesRoot) != "" && trimmedLocation == string(config.FilesLocationAuto) {
			return nil
		}
		return stringPointer(trimmedLocation)
	case strings.TrimSpace(settaFilesRoot) != "", strings.TrimSpace(profile) != "":
		return nil
	default:
		auto := string(config.FilesLocationAuto)
		return &auto
	}
}

func appendBootstrapURLFragmentParam(rawURL string, key string, value string) (string, error) {
	trimmedURL := strings.TrimSpace(rawURL)
	if trimmedURL == "" {
		return "", fmt.Errorf("bootstrap url is required")
	}
	if strings.TrimSpace(key) == "" {
		return "", fmt.Errorf("bootstrap fragment key is required")
	}
	parts := strings.SplitN(trimmedURL, "#", 2)
	fragmentValues, err := parseFragmentValues(trimmedURL)
	if err != nil {
		return "", err
	}
	fragmentValues.Set(strings.TrimSpace(key), strings.TrimSpace(value))
	if len(parts) == 1 {
		return parts[0] + "#" + fragmentValues.Encode(), nil
	}
	return parts[0] + "#" + fragmentValues.Encode(), nil
}

func parseFragmentValues(rawURL string) (url.Values, error) {
	parts := strings.SplitN(strings.TrimSpace(rawURL), "#", 2)
	if len(parts) != 2 || strings.TrimSpace(parts[1]) == "" {
		return url.Values{}, nil
	}
	values, err := url.ParseQuery(parts[1])
	if err != nil {
		return nil, fmt.Errorf("parse bootstrap fragment query: %w", err)
	}
	return values, nil
}
