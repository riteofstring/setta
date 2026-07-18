package chat

type PermissionCommandAction string
type ChatPermissionPresetID string

const (
	PermissionCommandShowPicker PermissionCommandAction = "show_picker"
	PermissionCommandSet        PermissionCommandAction = "set"

	ChatPermissionPresetReadOnly ChatPermissionPresetID = "read-only"
	ChatPermissionPresetDefault  ChatPermissionPresetID = "default"
)

var (
	permissionCommandActionValues = []PermissionCommandAction{
		PermissionCommandShowPicker,
		PermissionCommandSet,
	}
	chatPermissionPresetIDValues = []ChatPermissionPresetID{
		ChatPermissionPresetReadOnly,
		ChatPermissionPresetDefault,
	}
)

type ChatCodexPermissionSettings struct {
	Preset         ChatPermissionPresetID `json:"preset"`
	ApprovalPolicy string                 `json:"approvalPolicy"`
	Permissions    string                 `json:"permissions"`
}

type ChatCodexEffectivePermissionSettings struct {
	ApprovalPolicy                 string                  `json:"approvalPolicy"`
	ActivePermissionProfileID      string                  `json:"activePermissionProfileId"`
	ActivePermissionProfileExtends string                  `json:"activePermissionProfileExtends"`
	DisplayLabel                   string                  `json:"displayLabel"`
	BuiltIn                        bool                    `json:"builtIn"`
	Preset                         *ChatPermissionPresetID `json:"preset"`
}

type PermissionCommand struct {
	Action    PermissionCommandAction `json:"action"`
	Preset    ChatPermissionPresetID  `json:"preset"`
	Confirmed bool                    `json:"confirmed"`
}

type ChatPermissionPreset struct {
	ID                        ChatPermissionPresetID    `json:"id"`
	Label                     string                    `json:"label"`
	ShortDescription          string                    `json:"shortDescription"`
	ApprovalPolicy            string                    `json:"approvalPolicy"`
	ActivePermissionProfileID string                    `json:"activePermissionProfileId"`
	Danger                    *ChatPermissionDangerMeta `json:"danger"`
	Disabled                  bool                      `json:"disabled"`
	DisabledReason            string                    `json:"disabledReason"`
}

type ChatPermissionDangerMeta struct {
	RequiresConfirmation bool   `json:"requiresConfirmation"`
	ConfirmationTitle    string `json:"confirmationTitle"`
	ConfirmationBody     string `json:"confirmationBody"`
}
