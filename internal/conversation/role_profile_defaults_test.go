package conversation

import "testing"

func TestDefaultAgentRoleProfileUsesFullAccessWithoutApprovals(t *testing.T) {
	profile := DefaultAgentRoleProfile()
	if err := validateAgentRoleProfile(profile); err != nil {
		t.Fatalf("validate default agent role: %v", err)
	}
	if profile.Role != RoleAgent ||
		profile.ModelSelection.Mode != ModelSelectionExact ||
		profile.ModelSelection.ModelID == nil ||
		*profile.ModelSelection.ModelID != "gpt-5.6-sol" ||
		profile.ReasoningEffort != ReasoningEffortHigh ||
		profile.ServiceTier != nil ||
		profile.PermissionProfile.ApprovalPolicy != ApprovalPolicyNever ||
		profile.PermissionProfile.ProviderPermissionProfile != ":full-access" ||
		profile.PermissionProfile.ToolAccess.Mode != ToolAccessAll ||
		!profile.PermissionProfile.WorkspaceMutation ||
		profile.PermissionProfile.Approvals {
		t.Fatalf("default agent role = %+v", profile)
	}
}
