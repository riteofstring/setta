package conversation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/agent"
	"setta/internal/master"
)

type MasterModelCatalogResolver interface {
	ResolveInvocation(context.Context, agent.Invocation) (agent.ResolvedInvocation, error)
}

type MasterRoleConfigurationResolver struct {
	profiles *Store
	catalog  MasterModelCatalogResolver
}

func NewMasterRoleConfigurationResolver(
	profiles *Store,
	catalog MasterModelCatalogResolver,
) (*MasterRoleConfigurationResolver, error) {
	if profiles == nil || catalog == nil {
		return nil, errors.New("master role configuration resolver requires profile store and model catalog")
	}
	return &MasterRoleConfigurationResolver{profiles: profiles, catalog: catalog}, nil
}

func (resolver *MasterRoleConfigurationResolver) ResolveMasterRoleConfiguration(
	ctx context.Context,
) (master.RoleConfiguration, error) {
	if err := validateMasterRoleResolverRequest(resolver, ctx); err != nil {
		return master.RoleConfiguration{}, err
	}
	profile, requested, err := resolver.readRequestedMasterRole(ctx)
	if err != nil {
		return master.RoleConfiguration{}, err
	}
	catalogRequest := cloneAgentInvocation(requested)
	resolved, err := resolver.catalog.ResolveInvocation(ctx, catalogRequest)
	if err != nil {
		return master.RoleConfiguration{}, fmt.Errorf("resolve global master model: %w", err)
	}
	if err := validateMasterModelResolution(requested, resolved); err != nil {
		return master.RoleConfiguration{}, fmt.Errorf("validate global master model: %w", err)
	}
	return masterRoleConfiguration(profile, resolved)
}

func validateMasterRoleResolverRequest(
	resolver *MasterRoleConfigurationResolver,
	ctx context.Context,
) error {
	if resolver == nil || resolver.profiles == nil || resolver.catalog == nil {
		return errors.New("master role configuration resolver is unavailable")
	}
	if ctx == nil {
		return errors.New("master role configuration context is required")
	}
	return nil
}

func (resolver *MasterRoleConfigurationResolver) readRequestedMasterRole(
	ctx context.Context,
) (RoleProfile, agent.Invocation, error) {
	profile, err := resolver.profiles.ReadEffectiveGlobalRoleProfile(ctx, DefaultMasterRoleProfile())
	if err != nil {
		return RoleProfile{}, agent.Invocation{}, fmt.Errorf("read global master role profile: %w", err)
	}
	if err := validateMasterRoleProfile(profile); err != nil {
		return RoleProfile{}, agent.Invocation{}, fmt.Errorf("configure global master role: %w", err)
	}
	requested, err := providerInvocation(profile)
	if err != nil {
		return RoleProfile{}, agent.Invocation{}, err
	}
	return profile, requested, nil
}

func masterRoleConfiguration(
	profile RoleProfile,
	resolved agent.ResolvedInvocation,
) (master.RoleConfiguration, error) {
	profileJSON, err := json.Marshal(profile)
	if err != nil {
		return master.RoleConfiguration{}, fmt.Errorf("encode global master role profile: %w", err)
	}
	configuration := master.RoleConfiguration{
		RequestedProfile:   profileJSON,
		ResolvedInvocation: cloneAgentResolvedInvocation(resolved),
		MaxInputBytes:      profile.ContextBudget.MaxInputBytes,
	}
	if err := configuration.Validate(); err != nil {
		return master.RoleConfiguration{}, fmt.Errorf("validate resolved global master configuration: %w", err)
	}
	return configuration, nil
}

func validateMasterRoleProfile(profile RoleProfile) error {
	if err := profile.Validate(); err != nil {
		return err
	}
	if profile.Role != RoleMaster {
		return fmt.Errorf("master resolution requires master role profile, got %s", profile.Role)
	}
	permission := profile.PermissionProfile
	if permission.ProviderPermissionProfile != ":read-only" || permission.WorkspaceMutation {
		return errors.New("master role profile must use read-only provider permission without workspace mutation")
	}
	if permission.ApprovalPolicy != ApprovalPolicyNever || permission.Approvals {
		return errors.New("master role profile must disable approvals")
	}
	if permission.ToolAccess.Mode != ToolAccessAllowlist || len(permission.ToolAccess.AllowedTools) == 0 {
		return errors.New("master role profile requires a non-empty strict Setta tool allowlist")
	}
	for _, tool := range permission.ToolAccess.AllowedTools {
		if !isMasterToolAllowed(tool) {
			return fmt.Errorf("master role profile requests unsupported Setta capability %q", tool)
		}
	}
	return nil
}

func isMasterToolAllowed(tool string) bool {
	switch tool {
	case MasterToolConversationCandidatesRead,
		MasterToolConversationStatusRead,
		MasterToolConversationCommandPropose,
		MasterToolPresentationIntentPropose:
		return true
	default:
		return false
	}
}

func validateMasterModelResolution(
	requested agent.Invocation,
	resolved agent.ResolvedInvocation,
) error {
	if !equalAgentInvocation(requested, resolved.Requested) {
		return errors.New("provider model resolver changed the requested master invocation")
	}
	if resolved.Model == "" || resolved.ReasoningEffort == "" {
		return errors.New("provider model resolver returned incomplete master settings")
	}
	if !requested.ModelSelectionProviderDefault && resolved.Model != requested.Model {
		return fmt.Errorf("exact master model resolved as %s, want %s", resolved.Model, requested.Model)
	}
	if requested.ReasoningEffort != resolved.ReasoningEffort {
		return fmt.Errorf("master reasoning effort resolved as %s, want %s", resolved.ReasoningEffort, requested.ReasoningEffort)
	}
	if requested.ServiceTier != nil && !equalOptionalAgentString(requested.ServiceTier, resolved.ServiceTier) {
		return errors.New("master service tier changed during provider resolution")
	}
	if resolved.PermissionMode != agent.PermissionModeReadOnly || resolved.ApprovalMode != agent.ApprovalModeNever {
		return errors.New("provider model resolver changed master permission or approval mode")
	}
	return nil
}

func validatePersistedMasterRoleConfiguration(configuration master.RoleConfiguration) error {
	if err := configuration.Validate(); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(configuration.RequestedProfile))
	decoder.DisallowUnknownFields()
	var profile RoleProfile
	if err := decoder.Decode(&profile); err != nil {
		return fmt.Errorf("decode master requested role profile: %w", err)
	}
	if err := validateMasterRoleProfile(profile); err != nil {
		return err
	}
	requested, err := providerInvocation(profile)
	if err != nil {
		return err
	}
	if !equalAgentInvocation(requested, configuration.ResolvedInvocation.Requested) {
		return errors.New("persisted master requested profile does not match provider invocation")
	}
	if configuration.MaxInputBytes != profile.ContextBudget.MaxInputBytes {
		return errors.New("persisted master input budget does not match requested profile")
	}
	return validateMasterModelResolution(requested, configuration.ResolvedInvocation)
}

func equalAgentInvocation(left agent.Invocation, right agent.Invocation) bool {
	return left.ModelSelectionProviderDefault == right.ModelSelectionProviderDefault &&
		left.Model == right.Model &&
		left.ReasoningEffort == right.ReasoningEffort &&
		equalOptionalAgentString(left.ServiceTier, right.ServiceTier) &&
		left.PermissionMode == right.PermissionMode &&
		left.ApprovalMode == right.ApprovalMode
}

func equalOptionalAgentString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func cloneAgentInvocation(invocation agent.Invocation) agent.Invocation {
	invocation.ServiceTier = cloneStringPointer(invocation.ServiceTier)
	return invocation
}

func cloneAgentResolvedInvocation(invocation agent.ResolvedInvocation) agent.ResolvedInvocation {
	invocation.Requested = cloneAgentInvocation(invocation.Requested)
	invocation.ServiceTier = cloneStringPointer(invocation.ServiceTier)
	return invocation
}
