package settacmd

import (
	"fmt"
	"os"
	"strings"

	"setta/internal/config"
	"setta/internal/launcher"
)

func resolveLauncherCommandConfig(global globalFlags, cwd string, envLookup func(string) (string, bool)) (config.Config, error) {
	return config.Load(config.LoadOptions{
		CWD:       cwd,
		EnvLookup: envLookup,
		CLI: config.CLIOptions{
			WorkspaceRoot:      global.workspaceRoot,
			SettaHome:          global.settaHome,
			ProfileLookupHome:  global.profileLookupHome,
			SettaFilesRoot:     global.settaFilesRoot,
			SettaFilesLocation: global.settaFilesLocation,
			RuntimeRoot:        global.runtimeRoot,
			Profile:            global.profile,
			Mode:               string(config.ModeLauncher),
		},
	})
}

func loadLauncherManagementContext(global globalFlags, cwd string, envLookup func(string) (string, bool)) (string, *launcher.ManagementService, *launcherCommandFailure) {
	commandCfg, err := resolveLauncherCommandConfig(global, cwd, envLookup)
	if err != nil {
		return "", nil, newLauncherCommandFailure("BadRequest", err.Error(), 2)
	}
	manager, err := newLauncherManagementService()
	if err != nil {
		return "", nil, newLauncherCommandFailure("InternalError", err.Error(), 1)
	}
	return commandCfg.Paths.SettaHome, manager, nil
}

func newLauncherManagementService() (*launcher.ManagementService, error) {
	executablePath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve current executable: %w", err)
	}
	return launcher.NewManagementService(launcher.ManagementServiceOptions{
		ExecutablePath: executablePath,
	})
}

func parseLauncherArtifactOptionSpecs(specs []string, clear bool) (*map[string]string, error) {
	if clear {
		cleared := map[string]string{}
		return &cleared, nil
	}
	if len(specs) == 0 {
		return nil, nil
	}
	parsed := make(map[string]string, len(specs))
	for _, rawSpec := range specs {
		spec := strings.TrimSpace(rawSpec)
		if spec == "" {
			return nil, fmt.Errorf("artifact option entries must be non-empty")
		}
		name, value, ok := strings.Cut(spec, "=")
		if !ok {
			return nil, fmt.Errorf("artifact option entries must use NAME=VALUE format")
		}
		trimmedName := strings.TrimSpace(name)
		if trimmedName == "" {
			return nil, fmt.Errorf("artifact option names must be non-empty")
		}
		trimmedValue := strings.TrimSpace(value)
		if trimmedValue == "" {
			return nil, fmt.Errorf("artifact option values must be non-empty")
		}
		parsed[trimmedName] = trimmedValue
	}
	return &parsed, nil
}

func normalizeLauncherInstallSource(raw string) (*launcher.LauncherInstallSource, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	normalized := strings.ToLower(strings.TrimSpace(strings.ReplaceAll(raw, "-", "_")))
	switch launcher.LauncherInstallSource(normalized) {
	case launcher.LauncherInstallSourceUVTool, launcher.LauncherInstallSourceInstallerManaged, launcher.LauncherInstallSourceUnsupported:
		resolved := launcher.LauncherInstallSource(normalized)
		return &resolved, nil
	default:
		return nil, fmt.Errorf("install source must be one of: uv-tool, installer-managed, unsupported")
	}
}

func normalizeLauncherOpenMode(raw string) (*launcher.LauncherOpenMode, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch launcher.LauncherOpenMode(normalized) {
	case launcher.LauncherOpenModeBrowser, launcher.LauncherOpenModeChromeApp:
		resolved := launcher.LauncherOpenMode(normalized)
		return &resolved, nil
	default:
		return nil, fmt.Errorf("open mode must be one of: browser, chrome-app")
	}
}

func normalizeLauncherWorkspaceBehavior(raw string) (*launcher.LauncherWorkspaceBehavior, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	normalized := strings.ToLower(strings.TrimSpace(strings.ReplaceAll(raw, "-", "_")))
	switch launcher.LauncherWorkspaceBehavior(normalized) {
	case launcher.LauncherWorkspaceBehaviorLastUsedOrPrompt, launcher.LauncherWorkspaceBehaviorAlwaysPrompt:
		resolved := launcher.LauncherWorkspaceBehavior(normalized)
		return &resolved, nil
	default:
		return nil, fmt.Errorf("workspace behavior must be either 'last-used-or-prompt' or 'always-prompt'")
	}
}
