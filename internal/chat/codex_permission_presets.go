package chat

const (
	codexApprovalPolicyOnRequest = "on-request"
	codexApprovalPolicyNever     = "never"

	codexPermissionProfileReadOnly         = ":read-only"
	codexPermissionProfileWorkspace        = ":workspace"
	codexPermissionProfileDangerFullAccess = ":danger-full-access"
)

var chatPermissionPresets = []ChatPermissionPreset{
	{
		ID:                        ChatPermissionPresetReadOnly,
		Label:                     "Read Only",
		ShortDescription:          "Codex can read workspace files. Writes, network access, and broader filesystem access require approval.",
		ApprovalPolicy:            codexApprovalPolicyOnRequest,
		ActivePermissionProfileID: codexPermissionProfileReadOnly,
	},
	{
		ID:                        ChatPermissionPresetDefault,
		Label:                     "Ask for approval",
		ShortDescription:          "Codex can edit the workspace and run commands. Network access or broader filesystem access requires approval.",
		ApprovalPolicy:            codexApprovalPolicyOnRequest,
		ActivePermissionProfileID: codexPermissionProfileWorkspace,
	},
	{
		ID:                        ChatPermissionPresetFullAccess,
		Label:                     "Full Access",
		ShortDescription:          "Codex can access the broader filesystem and network without asking.",
		ApprovalPolicy:            codexApprovalPolicyNever,
		ActivePermissionProfileID: codexPermissionProfileDangerFullAccess,
		Danger: &ChatPermissionDangerMeta{
			RequiresConfirmation: true,
			ConfirmationTitle:    "Use Full Access?",
			ConfirmationBody:     "Full Access disables approvals and sandboxing for this chat. Codex can access the broader filesystem and network without asking.",
		},
	},
}

func BuiltinChatPermissionPresets() []ChatPermissionPreset {
	presets := make([]ChatPermissionPreset, 0, len(chatPermissionPresets))
	for _, preset := range chatPermissionPresets {
		presets = append(presets, cloneChatPermissionPreset(preset))
	}
	return presets
}

func cloneChatPermissionPreset(preset ChatPermissionPreset) ChatPermissionPreset {
	if preset.Danger != nil {
		danger := *preset.Danger
		preset.Danger = &danger
	}
	return preset
}

func chatPermissionPresetByID(id ChatPermissionPresetID) (ChatPermissionPreset, bool) {
	for _, preset := range chatPermissionPresets {
		if preset.ID == id {
			return cloneChatPermissionPreset(preset), true
		}
	}
	return ChatPermissionPreset{}, false
}

func chatPermissionSettingsForPreset(id ChatPermissionPresetID) (ChatCodexPermissionSettings, bool) {
	preset, ok := chatPermissionPresetByID(id)
	if !ok {
		return ChatCodexPermissionSettings{}, false
	}
	return ChatCodexPermissionSettings{
		Preset:         preset.ID,
		ApprovalPolicy: preset.ApprovalPolicy,
		Permissions:    preset.ActivePermissionProfileID,
	}, true
}

func chatPermissionPresetByEffectiveFields(approvalPolicy string, id string, extends string) (ChatPermissionPreset, bool) {
	if extends != "" {
		return ChatPermissionPreset{}, false
	}
	for _, preset := range chatPermissionPresets {
		if preset.ApprovalPolicy == approvalPolicy && preset.ActivePermissionProfileID == id {
			return cloneChatPermissionPreset(preset), true
		}
	}
	return ChatPermissionPreset{}, false
}

func chatCodexEffectivePermissionSettings(approvalPolicy string, activeProfileID string, activeProfileExtends string) *ChatCodexEffectivePermissionSettings {
	approvalPolicy, activeProfileID, activeProfileExtends = effectiveCodexPermissionFields(approvalPolicy, activeProfileID, activeProfileExtends)
	displayLabel := "Custom"
	builtIn := false
	var presetID *ChatPermissionPresetID
	if preset, ok := chatPermissionPresetByEffectiveFields(approvalPolicy, activeProfileID, activeProfileExtends); ok {
		displayLabel = preset.Label
		builtIn = true
		id := preset.ID
		presetID = &id
	}
	return &ChatCodexEffectivePermissionSettings{
		ApprovalPolicy:                 approvalPolicy,
		ActivePermissionProfileID:      activeProfileID,
		ActivePermissionProfileExtends: activeProfileExtends,
		DisplayLabel:                   displayLabel,
		BuiltIn:                        builtIn,
		Preset:                         presetID,
	}
}

func effectiveCodexPermissionFields(approvalPolicy string, activeProfileID string, activeProfileExtends string) (string, string, string) {
	if activeProfileID == "" && activeProfileExtends == "" && (approvalPolicy == "" || approvalPolicy == codexApprovalPolicyOnRequest) {
		return codexApprovalPolicyOnRequest, codexPermissionProfileWorkspace, ""
	}
	return approvalPolicy, activeProfileID, activeProfileExtends
}
