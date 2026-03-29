package externalagentconfigs

type ClaudeSettingsSource string

const (
	ClaudeSettingsSourceUser    ClaudeSettingsSource = "user"
	ClaudeSettingsSourceProject ClaudeSettingsSource = "project"
	ClaudeSettingsSourceLocal   ClaudeSettingsSource = "local"
)

type ClaudeSettingsPermissions struct {
	Allow []string `json:"allow"`
	Ask   []string `json:"ask"`
	Deny  []string `json:"deny"`
}

type ClaudeSettingsManaged struct {
	Permissions *ClaudeSettingsPermissions `json:"permissions,omitempty"`
	DefaultMode *string                    `json:"defaultMode,omitempty"`
	MCP         map[string]any             `json:"mcp,omitempty"`
}
