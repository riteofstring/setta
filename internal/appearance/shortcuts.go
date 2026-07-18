package appearance

import "fmt"

type AppearanceWorkspaceNavigationShortcut string

const (
	WorkspaceNavigationModAltArrows  AppearanceWorkspaceNavigationShortcut = "mod_alt_arrows"
	WorkspaceNavigationCtrlAltArrows AppearanceWorkspaceNavigationShortcut = "ctrl_alt_arrows"
)

var workspaceNavigationShortcutValues = []AppearanceWorkspaceNavigationShortcut{
	WorkspaceNavigationModAltArrows,
	WorkspaceNavigationCtrlAltArrows,
}

type AppearanceShortcutsSettings struct {
	WorkspaceNavigation AppearanceWorkspaceNavigationShortcut `json:"workspaceNavigation"`
}

func validateShortcutsSettings(settings AppearanceShortcutsSettings) error {
	for _, value := range workspaceNavigationShortcutValues {
		if settings.WorkspaceNavigation == value {
			return nil
		}
	}
	return fmt.Errorf("shortcuts workspace navigation shortcut is unsupported: %s", settings.WorkspaceNavigation)
}
