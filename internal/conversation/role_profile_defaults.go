package conversation

// DefaultAgentRoleProfile is the release-owned primary topic-agent profile.
// Role defaults live together so one role cannot silently inherit another
// role's model, effort, permissions, or context budget.
func DefaultAgentRoleProfile() RoleProfile {
	modelID := "gpt-5.6-sol"
	return RoleProfile{
		Role:            RoleAgent,
		Provider:        ProviderCodex,
		ModelSelection:  ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID},
		ReasoningEffort: ReasoningEffortHigh,
		PermissionProfile: PermissionProfile{
			ApprovalPolicy:            ApprovalPolicyOnRequest,
			ProviderPermissionProfile: ":workspace",
			ToolAccess:                ToolAccessPolicy{Mode: ToolAccessAll, AllowedTools: []string{}},
			WorkspaceMutation:         true,
			Approvals:                 true,
		},
		ContextBudget: ContextBudget{
			MaxInputBytes:        256 * 1024,
			MaxInputTokens:       64 * 1024,
			ReservedOutputTokens: 8 * 1024,
		},
	}
}

// DefaultNarratorRoleProfile is deliberately exact and lightweight. Narrator
// calls receive only supplied context and cannot use tools, mutate a workspace,
// or request approvals.
func DefaultNarratorRoleProfile() RoleProfile {
	modelID := "gpt-5.4-mini"
	return RoleProfile{
		Role:            RoleNarrator,
		Provider:        ProviderCodex,
		ModelSelection:  ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID},
		ReasoningEffort: ReasoningEffortLow,
		PermissionProfile: PermissionProfile{
			ApprovalPolicy:            ApprovalPolicyNever,
			ProviderPermissionProfile: ":read-only",
			ToolAccess:                ToolAccessPolicy{Mode: ToolAccessNone, AllowedTools: []string{}},
		},
		ContextBudget: ContextBudget{
			MaxInputBytes:        64 * 1024,
			MaxInputTokens:       16 * 1024,
			ReservedOutputTokens: 2 * 1024,
		},
	}
}

// DefaultSideAgentRoleProfile is independent from both the primary agent and
// narrator. Side agents can inspect inherited workspace context, but their
// provider sandbox cannot mutate the workspace.
func DefaultSideAgentRoleProfile() RoleProfile {
	modelID := "gpt-5.6-luna"
	return RoleProfile{
		Role:            RoleSideAgent,
		Provider:        ProviderCodex,
		ModelSelection:  ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID},
		ReasoningEffort: ReasoningEffortMedium,
		PermissionProfile: PermissionProfile{
			ApprovalPolicy:            ApprovalPolicyOnRequest,
			ProviderPermissionProfile: ":read-only",
			ToolAccess:                ToolAccessPolicy{Mode: ToolAccessAll, AllowedTools: []string{}},
			WorkspaceMutation:         false,
			Approvals:                 true,
		},
		ContextBudget: ContextBudget{
			MaxInputBytes:        256 * 1024,
			MaxInputTokens:       64 * 1024,
			ReservedOutputTokens: 8 * 1024,
		},
	}
}
