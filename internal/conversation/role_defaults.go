package conversation

import "fmt"

const (
	DefaultAgentModelID     = "gpt-5.6-sol"
	DefaultNarratorModelID  = "gpt-5.4-mini"
	DefaultMasterModelID    = "gpt-5.6-terra"
	DefaultSideAgentModelID = "gpt-5.6-luna"
)

func DefaultRoleProfile(role Role) (RoleProfile, error) {
	profile := RoleProfile{
		Role:     role,
		Provider: ProviderCodex,
		PermissionProfile: PermissionProfile{
			ToolAccess: ToolAccessPolicy{Mode: ToolAccessAll, AllowedTools: []string{}},
		},
		ContextBudget: ContextBudget{
			MaxInputBytes:        131072,
			MaxInputTokens:       32768,
			ReservedOutputTokens: 4096,
		},
	}
	switch role {
	case RoleAgent:
		configureRoleProfile(&profile, DefaultAgentModelID, ReasoningEffortHigh, "workspace", ApprovalPolicyOnRequest, true, true)
	case RoleNarrator:
		configureRoleProfile(&profile, DefaultNarratorModelID, ReasoningEffortLow, "read-only", ApprovalPolicyNever, false, false)
		profile.PermissionProfile.ToolAccess.Mode = ToolAccessNone
		profile.ContextBudget = ContextBudget{MaxInputBytes: 65536, MaxInputTokens: 16384, ReservedOutputTokens: 2048}
	case RoleMaster:
		configureRoleProfile(&profile, DefaultMasterModelID, ReasoningEffortMedium, "restricted", ApprovalPolicyNever, false, false)
		profile.PermissionProfile.ToolAccess = ToolAccessPolicy{
			Mode: ToolAccessAllowlist,
			AllowedTools: []string{
				"ask_narrator",
				"create_conversation",
				"create_side_conversation",
				"focus_conversation",
				"fork_conversation",
				"send_to_agent",
			},
		}
	case RoleSideAgent:
		configureRoleProfile(&profile, DefaultSideAgentModelID, ReasoningEffortMedium, "read-only", ApprovalPolicyOnRequest, false, true)
	default:
		return RoleProfile{}, fmt.Errorf("unsupported default role %q", role)
	}
	if err := profile.Validate(); err != nil {
		return RoleProfile{}, err
	}
	return profile, nil
}

func configureRoleProfile(profile *RoleProfile, modelID string, effort string, providerPermission string, approval ApprovalPolicy, mutation bool, approvals bool) {
	profile.ModelSelection = ModelSelection{Mode: ModelSelectionExact, ModelID: stringPointerValue(modelID)}
	profile.ReasoningEffort = effort
	profile.PermissionProfile.ApprovalPolicy = approval
	profile.PermissionProfile.ProviderPermissionProfile = providerPermission
	profile.PermissionProfile.WorkspaceMutation = mutation
	profile.PermissionProfile.Approvals = approvals
}

func stringPointerValue(value string) *string {
	return &value
}
