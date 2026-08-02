package externalagentconfigs

import "strings"

const (
	ClaudeApprovalPolicyDefault           = "default"
	ClaudeApprovalPolicyAcceptEdits       = "acceptEdits"
	ClaudeApprovalPolicyPlan              = "plan"
	ClaudeApprovalPolicyBypassPermissions = "bypassPermissions"
)

var (
	defaultClaudeSettingsSources = []ClaudeSettingsSource{
		ClaudeSettingsSourceProject,
		ClaudeSettingsSourceLocal,
	}
	frontendClaudeApprovalPolicyOptions = []ExternalAgentApprovalPolicyOption{
		{Value: "", Label: "Use settings file / chat override"},
		{Value: ClaudeApprovalPolicyDefault, Label: "Default"},
		{Value: ClaudeApprovalPolicyAcceptEdits, Label: "Accept edits"},
		{Value: ClaudeApprovalPolicyPlan, Label: "Plan"},
		{Value: ClaudeApprovalPolicyBypassPermissions, Label: "YOLO (bypassPermissions)"},
	}
)

// Keep external-agent editor defaults and Claude approval-policy metadata
// Go-owned so frontend drafts do not hand-maintain backend-owned values.
type ExternalAgentApprovalPolicyOption struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type ExternalAgentUIConfigValue struct {
	DefaultClaudeAskRules        []string                            `json:"defaultClaudeAskRules"`
	DefaultClaudeSettingsSources []ClaudeSettingsSource              `json:"defaultClaudeSettingsSources"`
	ClaudeApprovalPolicyOptions  []ExternalAgentApprovalPolicyOption `json:"claudeApprovalPolicyOptions"`
}

func FrontendValueExternalAgentUIConfig() ExternalAgentUIConfigValue {
	return ExternalAgentUIConfigValue{
		DefaultClaudeAskRules:        DefaultClaudeAskRules(),
		DefaultClaudeSettingsSources: DefaultClaudeSettingsSources(),
		ClaudeApprovalPolicyOptions: append(
			[]ExternalAgentApprovalPolicyOption(nil),
			frontendClaudeApprovalPolicyOptions...,
		),
	}
}

func DefaultClaudeAskRules() []string {
	return append([]string(nil), defaultClaudeAskRules...)
}

func DefaultClaudeSettingsSources() []ClaudeSettingsSource {
	return append([]ClaudeSettingsSource(nil), defaultClaudeSettingsSources...)
}

func NormalizeClaudeApprovalPolicy(policy string) string {
	normalized := strings.TrimSpace(policy)
	if normalized == "" {
		return ""
	}
	switch normalized {
	case ClaudeApprovalPolicyDefault,
		ClaudeApprovalPolicyAcceptEdits,
		ClaudeApprovalPolicyPlan,
		ClaudeApprovalPolicyBypassPermissions:
		return normalized
	}
	switch strings.ToLower(normalized) {
	case "allow", "auto", "bypass":
		return ClaudeApprovalPolicyBypassPermissions
	case "ask", "deny", "block":
		return ClaudeApprovalPolicyDefault
	default:
		return ""
	}
}
