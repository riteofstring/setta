package conversation

import (
	"context"
	"errors"
	"testing"

	"setta/internal/agent"
)

func TestDefaultDirectorRoleProfileOwnsRestrictedIndependentDefaults(t *testing.T) {
	profile := DefaultDirectorRoleProfile()
	if err := validateDirectorRoleProfile(profile); err != nil {
		t.Fatalf("validate default director role: %v", err)
	}
	if profile.Role != RoleDirector || profile.ModelSelection.Mode != ModelSelectionExact ||
		profile.ModelSelection.ModelID == nil || *profile.ModelSelection.ModelID != "gpt-5.6-sol" ||
		profile.ReasoningEffort != ReasoningEffortHigh || profile.ServiceTier != nil ||
		profile.PermissionProfile.ApprovalPolicy != ApprovalPolicyNever ||
		profile.PermissionProfile.ProviderPermissionProfile != ":read-only" ||
		profile.PermissionProfile.ToolAccess.Mode != ToolAccessNone ||
		len(profile.PermissionProfile.ToolAccess.AllowedTools) != 0 ||
		profile.PermissionProfile.WorkspaceMutation || profile.PermissionProfile.Approvals {
		t.Fatalf("default director role = %+v", profile)
	}
	agentProfile := DefaultAgentRoleProfile()
	if agentProfile.Role != RoleAgent || agentProfile.ModelSelection.ModelID == nil ||
		agentProfile.PermissionProfile.ProviderPermissionProfile == profile.PermissionProfile.ProviderPermissionProfile ||
		!agentProfile.PermissionProfile.WorkspaceMutation {
		t.Fatal("director default leaked into the primary agent role")
	}
}

func TestDirectorRoleConfigurationResolverUsesGlobalOverrideAndExactCatalogResolution(t *testing.T) {
	store := newTestStore(t)
	override := directorRoleOverride("gpt-director-global", ReasoningEffortHigh)
	persistRoleProfileTestMutation(t, store, "set-global-director-profile", func(transaction *WriteTransaction) error {
		return transaction.UpsertRoleProfileOverride(override)
	})
	catalog := &recordingDirectorCatalog{}
	resolver, err := NewDirectorRoleConfigurationResolver(store, catalog)
	if err != nil {
		t.Fatalf("NewDirectorRoleConfigurationResolver: %v", err)
	}

	configuration, err := resolver.ResolveDirectorRoleConfiguration(context.Background())
	if err != nil {
		t.Fatalf("ResolveDirectorRoleConfiguration: %v", err)
	}
	if err := configuration.Validate(); err != nil {
		t.Fatalf("validate resolved configuration: %v", err)
	}
	if catalog.calls != 1 || catalog.request.Model != "gpt-director-global" ||
		catalog.request.ReasoningEffort != ReasoningEffortHigh ||
		catalog.request.PermissionMode != agent.PermissionModeReadOnly ||
		catalog.request.ApprovalMode != agent.ApprovalModeNever {
		t.Fatalf("catalog request = %+v calls=%d", catalog.request, catalog.calls)
	}
	pinned, err := configuration.PinnedInvocation()
	if err != nil {
		t.Fatalf("PinnedInvocation: %v", err)
	}
	if pinned.Model != catalog.request.Model || pinned.ReasoningEffort != catalog.request.ReasoningEffort {
		t.Fatalf("pinned director invocation = %+v", pinned)
	}
}

func TestDirectorRoleConfigurationRejectsUnsafeOverridesAndCatalogMutation(t *testing.T) {
	workspaceOverride := directorRoleOverride("gpt-director-workspace", ReasoningEffortMedium)
	workspaceOverride.ScopeKind = RoleProfileScopeWorkspace
	workspaceOverride.ScopeID = "workspace-1"
	if err := workspaceOverride.Validate(); err == nil {
		t.Fatal("workspace-scoped director override validated")
	}

	unsafeTool := directorRoleOverride("gpt-director-unsafe", ReasoningEffortMedium)
	unsafeTool.Profile.PermissionProfile.ToolAccess = ToolAccessPolicy{
		Mode:         ToolAccessAllowlist,
		AllowedTools: []string{"shell.execute"},
	}
	if err := unsafeTool.Validate(); err == nil {
		t.Fatal("director override with tool access validated")
	}

	store := newTestStore(t)
	catalog := &recordingDirectorCatalog{mutate: func(resolved *agent.ResolvedInvocation) {
		resolved.PermissionMode = agent.PermissionModeWorkspaceWrite
	}}
	resolver, err := NewDirectorRoleConfigurationResolver(store, catalog)
	if err != nil {
		t.Fatalf("NewDirectorRoleConfigurationResolver: %v", err)
	}
	if _, err := resolver.ResolveDirectorRoleConfiguration(context.Background()); err == nil {
		t.Fatal("director catalog permission mutation was accepted")
	}

	catalog.mutate = nil
	catalog.err = errors.New("configured model is unavailable")
	if _, err := resolver.ResolveDirectorRoleConfiguration(context.Background()); !errors.Is(err, catalog.err) {
		t.Fatalf("missing model error = %v", err)
	}
}

func directorRoleOverride(modelID string, effort ReasoningEffort) RoleProfileOverride {
	profile := DefaultDirectorRoleProfile()
	profile.ModelSelection = ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID}
	profile.ReasoningEffort = effort
	return RoleProfileOverride{
		ScopeKind: RoleProfileScopeGlobal,
		Profile:   profile,
		UpdatedAt: testTimeStarted,
	}
}

type recordingDirectorCatalog struct {
	request agent.Invocation
	mutate  func(*agent.ResolvedInvocation)
	err     error
	calls   int
}

func (catalog *recordingDirectorCatalog) ResolveInvocation(
	_ context.Context,
	request agent.Invocation,
) (agent.ResolvedInvocation, error) {
	catalog.calls++
	catalog.request = cloneAgentInvocation(request)
	if catalog.err != nil {
		return agent.ResolvedInvocation{}, catalog.err
	}
	resolved := agent.ResolvedInvocation{
		Requested:       cloneAgentInvocation(request),
		Model:           request.Model,
		ReasoningEffort: request.ReasoningEffort,
		ServiceTier:     cloneStringPointer(request.ServiceTier),
		PermissionMode:  request.PermissionMode,
		ApprovalMode:    request.ApprovalMode,
	}
	if catalog.mutate != nil {
		catalog.mutate(&resolved)
	}
	return resolved, nil
}
