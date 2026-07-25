package appearance

import "fmt"

type AppearanceWorkspaceNavigationShortcut string
type AppearanceMasterVoiceShortcut string

const (
	WorkspaceNavigationModArrows     AppearanceWorkspaceNavigationShortcut = "mod_arrows"
	WorkspaceNavigationCtrlArrows    AppearanceWorkspaceNavigationShortcut = "ctrl_arrows"
	WorkspaceNavigationModAltArrows  AppearanceWorkspaceNavigationShortcut = "mod_alt_arrows"
	WorkspaceNavigationCtrlAltArrows AppearanceWorkspaceNavigationShortcut = "ctrl_alt_arrows"
)

const (
	MasterVoiceModShiftK  AppearanceMasterVoiceShortcut = "mod_shift_k"
	MasterVoiceCtrlShiftK AppearanceMasterVoiceShortcut = "ctrl_shift_k"
	MasterVoiceAltShiftK  AppearanceMasterVoiceShortcut = "alt_shift_k"
)

var workspaceNavigationShortcutValues = []AppearanceWorkspaceNavigationShortcut{
	WorkspaceNavigationModArrows,
	WorkspaceNavigationCtrlArrows,
	WorkspaceNavigationModAltArrows,
	WorkspaceNavigationCtrlAltArrows,
}

var masterVoiceShortcutValues = []AppearanceMasterVoiceShortcut{
	MasterVoiceModShiftK,
	MasterVoiceCtrlShiftK,
	MasterVoiceAltShiftK,
}

type AppearanceShortcutsSettings struct {
	WorkspaceNavigation AppearanceWorkspaceNavigationShortcut `json:"workspaceNavigation"`
	MasterVoice         AppearanceMasterVoiceShortcut         `json:"masterVoice"`
}

func validateShortcutsSettings(settings AppearanceShortcutsSettings) error {
	if err := validateWorkspaceNavigationShortcut(settings.WorkspaceNavigation); err != nil {
		return err
	}
	if err := validateMasterVoiceShortcut(settings.MasterVoice); err != nil {
		return err
	}
	return nil
}

func validateWorkspaceNavigationShortcut(shortcut AppearanceWorkspaceNavigationShortcut) error {
	for _, value := range workspaceNavigationShortcutValues {
		if shortcut == value {
			return nil
		}
	}
	return fmt.Errorf("shortcuts workspace navigation shortcut is unsupported: %s", shortcut)
}

func validateMasterVoiceShortcut(shortcut AppearanceMasterVoiceShortcut) error {
	for _, value := range masterVoiceShortcutValues {
		if shortcut == value {
			return nil
		}
	}
	return fmt.Errorf("shortcuts master voice shortcut is unsupported: %s", shortcut)
}
