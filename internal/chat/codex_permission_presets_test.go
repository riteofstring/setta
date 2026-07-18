package chat

import "testing"

func TestChatPermissionPresetsMapToCodexContracts(t *testing.T) {
	tests := []permissionPresetContractCase{
		{
			id:          ChatPermissionPresetReadOnly,
			label:       "Read Only",
			approval:    codexApprovalPolicyNever,
			permissions: codexPermissionProfileReadOnly,
		},
		{
			id:          ChatPermissionPresetDefault,
			label:       "Workspace Access",
			approval:    codexApprovalPolicyNever,
			permissions: codexPermissionProfileWorkspace,
		},
	}

	presets := BuiltinChatPermissionPresets()
	if len(presets) != len(tests) {
		t.Fatalf("presets = %+v, want %d built-ins", presets, len(tests))
	}
	for _, test := range tests {
		t.Run(string(test.id), func(t *testing.T) {
			assertPermissionPresetContract(t, test)
		})
	}
}

func TestCustomPermissionSettingsUseCustomDisplay(t *testing.T) {
	custom := chatCodexEffectivePermissionSettings(codexApprovalPolicyOnRequest, ":custom", "")
	if custom == nil || custom.Preset != nil || custom.DisplayLabel != "Custom" || custom.BuiltIn {
		t.Fatalf("custom effective permission = %+v, want custom display", custom)
	}
}

func TestMissingPermissionMetadataUsesWorkspaceAccessDisplay(t *testing.T) {
	permission := chatCodexEffectivePermissionSettings("", "", "")
	if permission == nil || permission.Preset == nil || *permission.Preset != ChatPermissionPresetDefault || permission.DisplayLabel != "Workspace Access" || !permission.BuiltIn {
		t.Fatalf("empty effective permission = %+v, want workspace access display", permission)
	}
	if permission.ApprovalPolicy != codexApprovalPolicyNever || permission.ActivePermissionProfileID != codexPermissionProfileWorkspace {
		t.Fatalf("empty effective permission = %+v, want implicit default permission fields", permission)
	}
}

func TestUnsupportedApprovalPolicyDoesNotUseCustomDisplay(t *testing.T) {
	permission := chatCodexEffectivePermissionSettings("on-failure", "", "")
	if permission != nil {
		t.Fatalf("on-failure effective permission = %+v, want no displayable permission", permission)
	}
}

func TestPermissionPresetRequiresMatchingApprovalPolicy(t *testing.T) {
	permission := chatCodexEffectivePermissionSettings(codexApprovalPolicyOnRequest, codexPermissionProfileWorkspace, "")
	if permission == nil || permission.Preset != nil || permission.DisplayLabel != "Custom" || permission.BuiltIn {
		t.Fatalf("mismatched effective permission = %+v, want custom display", permission)
	}
}

func TestChatPermissionPresetsApplyConfigRequirements(t *testing.T) {
	presets := chatPermissionPresetsForRequirements(&codexConfigRequirements{
		AllowedApprovalPolicies: []string{codexApprovalPolicyNever},
		AllowedPermissionProfiles: map[string]bool{
			codexPermissionProfileReadOnly:  false,
			codexPermissionProfileWorkspace: true,
		},
	})

	readOnly := requirePermissionPreset(t, presets, ChatPermissionPresetReadOnly)
	if !readOnly.Disabled || readOnly.DisabledReason == "" {
		t.Fatalf("read-only preset = %+v, want disabled with reason", readOnly)
	}
	defaultPreset := requirePermissionPreset(t, presets, ChatPermissionPresetDefault)
	if defaultPreset.Disabled {
		t.Fatalf("default preset = %+v, want enabled", defaultPreset)
	}
}

type permissionPresetContractCase struct {
	id          ChatPermissionPresetID
	label       string
	approval    string
	permissions string
	danger      bool
}

func assertPermissionPresetContract(t *testing.T, test permissionPresetContractCase) {
	t.Helper()
	preset, ok := chatPermissionPresetByID(test.id)
	if !ok {
		t.Fatalf("preset %s not found", test.id)
	}
	if preset.Label != test.label || preset.ApprovalPolicy != test.approval || preset.ActivePermissionProfileID != test.permissions {
		t.Fatalf("preset = %+v, want %s/%s/%s", preset, test.label, test.approval, test.permissions)
	}
	if (preset.Danger != nil) != test.danger {
		t.Fatalf("preset danger = %+v, want danger=%v", preset.Danger, test.danger)
	}
	settings, ok := chatPermissionSettingsForPreset(test.id)
	if !ok {
		t.Fatalf("settings for %s not found", test.id)
	}
	if settings.Preset != test.id || settings.ApprovalPolicy != test.approval || settings.Permissions != test.permissions {
		t.Fatalf("settings = %+v, want preset %s approval %s permissions %s", settings, test.id, test.approval, test.permissions)
	}
	effective := chatCodexEffectivePermissionSettings(test.approval, test.permissions, "")
	if effective == nil || effective.Preset == nil || *effective.Preset != test.id || effective.DisplayLabel != test.label || !effective.BuiltIn {
		t.Fatalf("effective permission = %+v, want built-in %s", effective, test.id)
	}
}

func requirePermissionPreset(t *testing.T, presets []ChatPermissionPreset, id ChatPermissionPresetID) ChatPermissionPreset {
	t.Helper()
	for _, preset := range presets {
		if preset.ID == id {
			return preset
		}
	}
	t.Fatalf("preset %s not found in %+v", id, presets)
	return ChatPermissionPreset{}
}
