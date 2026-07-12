package conversation

import (
	"context"
	"errors"
	"testing"

	"setta/internal/agent"
)

func TestDefaultMasterRoleProfileOwnsRestrictedIndependentDefaults(t *testing.T) {
	profile := DefaultMasterRoleProfile()
	if err := validateMasterRoleProfile(profile); err != nil {
		t.Fatalf("validate default master role: %v", err)
	}
	if profile.Role != RoleMaster || profile.ModelSelection.Mode != ModelSelectionExact ||
		profile.ModelSelection.ModelID == nil || *profile.ModelSelection.ModelID != "gpt-5.6-terra" ||
		profile.ReasoningEffort != ReasoningEffortMedium || profile.ServiceTier != nil ||
		profile.PermissionProfile.ApprovalPolicy != ApprovalPolicyNever ||
		profile.PermissionProfile.ProviderPermissionProfile != ":read-only" ||
		profile.PermissionProfile.WorkspaceMutation || profile.PermissionProfile.Approvals {
		t.Fatalf("default master role = %+v", profile)
	}
	if len(profile.PermissionProfile.ToolAccess.AllowedTools) != 4 {
		t.Fatalf("default master capabilities = %+v", profile.PermissionProfile.ToolAccess)
	}
	profile.PermissionProfile.ToolAccess.AllowedTools[0] = "mutated"
	if DefaultMasterRoleProfile().PermissionProfile.ToolAccess.AllowedTools[0] != MasterToolConversationCandidatesRead {
		t.Fatal("default master role returned shared mutable capability state")
	}
	if DefaultAgentRoleProfile().ModelSelection.ModelID == nil ||
		*DefaultAgentRoleProfile().ModelSelection.ModelID == "gpt-5.6-terra" {
		t.Fatal("master default leaked into the primary agent role")
	}
}

func TestMasterRoleConfigurationResolverUsesGlobalOverrideAndExactCatalogResolution(t *testing.T) {
	store := newTestStore(t)
	override := masterRoleOverride("gpt-master-global", ReasoningEffortHigh)
	persistRoleProfileTestMutation(t, store, "set-global-master-profile", func(transaction *WriteTransaction) error {
		return transaction.UpsertRoleProfileOverride(override)
	})
	catalog := &recordingMasterCatalog{}
	resolver, err := NewMasterRoleConfigurationResolver(store, catalog)
	if err != nil {
		t.Fatalf("NewMasterRoleConfigurationResolver: %v", err)
	}

	configuration, err := resolver.ResolveMasterRoleConfiguration(context.Background())
	if err != nil {
		t.Fatalf("ResolveMasterRoleConfiguration: %v", err)
	}
	if err := validatePersistedMasterRoleConfiguration(configuration); err != nil {
		t.Fatalf("validate resolved configuration: %v", err)
	}
	if catalog.calls != 1 || catalog.request.Model != "gpt-master-global" ||
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
		t.Fatalf("pinned master invocation = %+v", pinned)
	}
}

func TestMasterRoleConfigurationRejectsUnsafeOverridesAndCatalogMutation(t *testing.T) {
	workspaceOverride := masterRoleOverride("gpt-master-workspace", ReasoningEffortMedium)
	workspaceOverride.ScopeKind = RoleProfileScopeWorkspace
	workspaceOverride.ScopeID = "workspace-1"
	if err := workspaceOverride.Validate(); err == nil {
		t.Fatal("workspace-scoped master override validated")
	}

	unsafeTool := masterRoleOverride("gpt-master-unsafe", ReasoningEffortMedium)
	unsafeTool.Profile.PermissionProfile.ToolAccess.AllowedTools = []string{"shell.execute"}
	if err := unsafeTool.Validate(); err == nil {
		t.Fatal("master override with an unowned capability validated")
	}

	store := newTestStore(t)
	catalog := &recordingMasterCatalog{mutate: func(resolved *agent.ResolvedInvocation) {
		resolved.PermissionMode = agent.PermissionModeWorkspaceWrite
	}}
	resolver, err := NewMasterRoleConfigurationResolver(store, catalog)
	if err != nil {
		t.Fatalf("NewMasterRoleConfigurationResolver: %v", err)
	}
	if _, err := resolver.ResolveMasterRoleConfiguration(context.Background()); err == nil {
		t.Fatal("master catalog permission mutation was accepted")
	}

	catalog.mutate = nil
	catalog.err = errors.New("configured model is unavailable")
	if _, err := resolver.ResolveMasterRoleConfiguration(context.Background()); !errors.Is(err, catalog.err) {
		t.Fatalf("missing model error = %v", err)
	}
}

func masterRoleOverride(modelID string, effort ReasoningEffort) RoleProfileOverride {
	profile := DefaultMasterRoleProfile()
	profile.ModelSelection = ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID}
	profile.ReasoningEffort = effort
	return RoleProfileOverride{
		ScopeKind: RoleProfileScopeGlobal,
		Profile:   profile,
		UpdatedAt: testTimeStarted,
	}
}

type recordingMasterCatalog struct {
	request agent.Invocation
	mutate  func(*agent.ResolvedInvocation)
	err     error
	calls   int
}

func (catalog *recordingMasterCatalog) ResolveInvocation(
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
