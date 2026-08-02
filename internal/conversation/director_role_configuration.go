package conversation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/agent"
)

type DirectorModelCatalogResolver interface {
	ResolveInvocation(context.Context, agent.Invocation) (agent.ResolvedInvocation, error)
}

// DirectorRoleConfiguration freezes the exact provider resolution used for a
// Director provider call. The requested role profile stays canonical JSON so
// the configuration owner can validate the provider invocation against the
// profile that authorized it.
type DirectorRoleConfiguration struct {
	RequestedProfile   json.RawMessage          `json:"requestedProfile"`
	ResolvedInvocation agent.ResolvedInvocation `json:"resolvedInvocation"`
	MaxInputBytes      int                      `json:"maxInputBytes"`
}

type DirectorRoleConfigurationResolver struct {
	profiles *Store
	catalog  DirectorModelCatalogResolver
}

func NewDirectorRoleConfigurationResolver(
	profiles *Store,
	catalog DirectorModelCatalogResolver,
) (*DirectorRoleConfigurationResolver, error) {
	if profiles == nil || catalog == nil {
		return nil, errors.New("director role configuration resolver requires profile store and model catalog")
	}
	return &DirectorRoleConfigurationResolver{profiles: profiles, catalog: catalog}, nil
}

func (resolver *DirectorRoleConfigurationResolver) ResolveDirectorRoleConfiguration(
	ctx context.Context,
) (DirectorRoleConfiguration, error) {
	if err := validateDirectorRoleResolverRequest(resolver, ctx); err != nil {
		return DirectorRoleConfiguration{}, err
	}
	profile, requested, err := resolver.readRequestedDirectorRole(ctx)
	if err != nil {
		return DirectorRoleConfiguration{}, err
	}
	catalogRequest := cloneAgentInvocation(requested)
	resolved, err := resolver.catalog.ResolveInvocation(ctx, catalogRequest)
	if err != nil {
		return DirectorRoleConfiguration{}, fmt.Errorf("resolve global director model: %w", err)
	}
	if err := validateDirectorModelResolution(requested, resolved); err != nil {
		return DirectorRoleConfiguration{}, fmt.Errorf("validate global director model: %w", err)
	}
	return directorRoleConfiguration(profile, resolved)
}

func validateDirectorRoleResolverRequest(
	resolver *DirectorRoleConfigurationResolver,
	ctx context.Context,
) error {
	if resolver == nil || resolver.profiles == nil || resolver.catalog == nil {
		return errors.New("director role configuration resolver is unavailable")
	}
	if ctx == nil {
		return errors.New("director role configuration context is required")
	}
	return nil
}

func (resolver *DirectorRoleConfigurationResolver) readRequestedDirectorRole(
	ctx context.Context,
) (RoleProfile, agent.Invocation, error) {
	profile, err := resolver.profiles.ReadEffectiveGlobalRoleProfile(ctx, DefaultDirectorRoleProfile())
	if err != nil {
		return RoleProfile{}, agent.Invocation{}, fmt.Errorf("read global director role profile: %w", err)
	}
	if err := validateDirectorRoleProfile(profile); err != nil {
		return RoleProfile{}, agent.Invocation{}, fmt.Errorf("configure global director role: %w", err)
	}
	requested, err := providerInvocation(profile)
	if err != nil {
		return RoleProfile{}, agent.Invocation{}, err
	}
	return profile, requested, nil
}

func directorRoleConfiguration(
	profile RoleProfile,
	resolved agent.ResolvedInvocation,
) (DirectorRoleConfiguration, error) {
	profileJSON, err := json.Marshal(profile)
	if err != nil {
		return DirectorRoleConfiguration{}, fmt.Errorf("encode global director role profile: %w", err)
	}
	configuration := DirectorRoleConfiguration{
		RequestedProfile:   profileJSON,
		ResolvedInvocation: cloneAgentResolvedInvocation(resolved),
		MaxInputBytes:      profile.ContextBudget.MaxInputBytes,
	}
	if err := configuration.Validate(); err != nil {
		return DirectorRoleConfiguration{}, fmt.Errorf("validate resolved global director configuration: %w", err)
	}
	return configuration, nil
}

func validateDirectorRoleProfile(profile RoleProfile) error {
	if err := profile.Validate(); err != nil {
		return err
	}
	if profile.Role != RoleDirector {
		return fmt.Errorf("director resolution requires director role profile, got %s", profile.Role)
	}
	permission := profile.PermissionProfile
	if permission.ProviderPermissionProfile != ":read-only" || permission.WorkspaceMutation {
		return errors.New("director role profile must use read-only provider permission without workspace mutation")
	}
	if permission.ApprovalPolicy != ApprovalPolicyNever || permission.Approvals {
		return errors.New("director role profile must disable approvals")
	}
	if permission.ToolAccess.Mode != ToolAccessNone {
		return errors.New("director role profile must disable all tools")
	}
	return nil
}

func validateDirectorModelResolution(
	requested agent.Invocation,
	resolved agent.ResolvedInvocation,
) error {
	if !equalAgentInvocation(requested, resolved.Requested) {
		return errors.New("provider model resolver changed the requested director invocation")
	}
	if resolved.Model == "" || resolved.ReasoningEffort == "" {
		return errors.New("provider model resolver returned incomplete director settings")
	}
	if !requested.ModelSelectionProviderDefault && resolved.Model != requested.Model {
		return fmt.Errorf("exact director model resolved as %s, want %s", resolved.Model, requested.Model)
	}
	if requested.ReasoningEffort != resolved.ReasoningEffort {
		return fmt.Errorf("director reasoning effort resolved as %s, want %s", resolved.ReasoningEffort, requested.ReasoningEffort)
	}
	if requested.ServiceTier != nil && !equalOptionalAgentString(requested.ServiceTier, resolved.ServiceTier) {
		return errors.New("director service tier changed during provider resolution")
	}
	if resolved.PermissionMode != agent.PermissionModeReadOnly || resolved.ApprovalMode != agent.ApprovalModeNever {
		return errors.New("provider model resolver changed director permission or approval mode")
	}
	return nil
}

func (configuration DirectorRoleConfiguration) Validate() error {
	canonical, profile, err := canonicalDirectorRoleProfile(configuration.RequestedProfile)
	if err != nil {
		return err
	}
	if !bytes.Equal(canonical, configuration.RequestedProfile) {
		return errors.New("director requested role profile must be canonical JSON")
	}
	if err := validateDirectorRoleProfile(profile); err != nil {
		return err
	}
	requested, err := providerInvocation(profile)
	if err != nil {
		return err
	}
	if !equalAgentInvocation(requested, configuration.ResolvedInvocation.Requested) {
		return errors.New("director requested profile does not match provider invocation")
	}
	if configuration.MaxInputBytes != profile.ContextBudget.MaxInputBytes {
		return errors.New("director input budget does not match requested profile")
	}
	return validateDirectorModelResolution(requested, configuration.ResolvedInvocation)
}

func (configuration DirectorRoleConfiguration) PinnedInvocation() (agent.Invocation, error) {
	if err := configuration.Validate(); err != nil {
		return agent.Invocation{}, err
	}
	resolved := configuration.ResolvedInvocation
	return agent.Invocation{
		Model:           resolved.Model,
		ReasoningEffort: resolved.ReasoningEffort,
		ServiceTier:     cloneStringPointer(resolved.ServiceTier),
		PermissionMode:  agent.PermissionModeReadOnly,
		ApprovalMode:    agent.ApprovalModeNever,
	}, nil
}

// RequestedRoleProfile returns the canonical production profile that
// authorized this resolved Director call. Provider adapters use it when they
// create the durable invocation that is correlated with the call.
func (configuration DirectorRoleConfiguration) RequestedRoleProfile() (RoleProfile, error) {
	if err := configuration.Validate(); err != nil {
		return RoleProfile{}, err
	}
	_, profile, err := canonicalDirectorRoleProfile(configuration.RequestedProfile)
	return profile, err
}

func canonicalDirectorRoleProfile(raw json.RawMessage) (json.RawMessage, RoleProfile, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, RoleProfile{}, errors.New("director requested role profile is required")
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &object); err != nil || object == nil {
		return nil, RoleProfile{}, errors.New("director requested role profile must be a JSON object")
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, trimmed); err != nil {
		return nil, RoleProfile{}, fmt.Errorf("compact director requested role profile: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(compact.Bytes()))
	decoder.DisallowUnknownFields()
	var profile RoleProfile
	if err := decoder.Decode(&profile); err != nil {
		return nil, RoleProfile{}, fmt.Errorf("decode director requested role profile: %w", err)
	}
	return append(json.RawMessage{}, compact.Bytes()...), profile, nil
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
