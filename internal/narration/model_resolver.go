package narration

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/agent"
	"setta/internal/conversation"
)

type RoleProfileSource interface {
	ReadEffectiveRoleProfile(
		context.Context,
		string,
		string,
		conversation.RoleProfile,
	) (conversation.RoleProfile, error)
}

type ModelCatalogResolver interface {
	ResolveInvocation(context.Context, agent.Invocation) (agent.ResolvedInvocation, error)
}

var (
	_ RoleProfileSource    = (*conversation.Store)(nil)
	_ ModelCatalogResolver = (*agent.Runtime)(nil)
)

// ModelResolution is the catalog-validated narrator invocation configuration.
// Invocation is passed to the provider call; RequestedProfile and Settings are
// retained for the durable invocation audit.
type ModelResolution struct {
	RequestedProfile conversation.RoleProfile
	Invocation       agent.Invocation
	Settings         conversation.ResolvedInvocationSettings
}

type ModelResolver struct {
	profiles RoleProfileSource
	catalog  ModelCatalogResolver
}

func NewModelResolver(profiles RoleProfileSource, catalog ModelCatalogResolver) (*ModelResolver, error) {
	if profiles == nil {
		return nil, errors.New("narrator role profile source is required")
	}
	if catalog == nil {
		return nil, errors.New("narrator model catalog resolver is required")
	}
	return &ModelResolver{profiles: profiles, catalog: catalog}, nil
}

// Resolve reads only the narrator role hierarchy and validates the result
// against the provider model catalog for every call. It never consults the
// primary agent profile or infers a replacement model.
func (resolver *ModelResolver) Resolve(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (ModelResolution, error) {
	if resolver == nil || resolver.profiles == nil || resolver.catalog == nil {
		return ModelResolution{}, errors.New("narrator model resolver is required")
	}
	if ctx == nil {
		return ModelResolution{}, errors.New("narrator model resolution context is required")
	}
	if err := validateIdentifier("narrator model workspace id", workspaceID); err != nil {
		return ModelResolution{}, err
	}
	if err := validateIdentifier("narrator model conversation id", conversationID); err != nil {
		return ModelResolution{}, err
	}
	profile, err := resolver.profiles.ReadEffectiveRoleProfile(
		ctx,
		workspaceID,
		conversationID,
		conversation.DefaultNarratorRoleProfile(),
	)
	if err != nil {
		return ModelResolution{}, fmt.Errorf("read narrator role profile for conversation %s: %w", conversationID, err)
	}
	invocation, err := narratorInvocation(profile)
	if err != nil {
		return ModelResolution{}, fmt.Errorf("configure narrator role profile for conversation %s: %w", conversationID, err)
	}
	resolved, err := resolver.catalog.ResolveInvocation(ctx, invocation)
	if err != nil {
		return ModelResolution{}, fmt.Errorf("resolve narrator model for conversation %s: %w", conversationID, err)
	}
	if err := validateNarratorModelResolution(invocation, resolved); err != nil {
		return ModelResolution{}, fmt.Errorf("validate narrator model for conversation %s: %w", conversationID, err)
	}
	return ModelResolution{
		RequestedProfile: profile,
		Invocation:       invocation,
		Settings: conversation.ResolvedInvocationSettings{
			ModelID:           resolved.Model,
			ReasoningEffort:   conversation.ReasoningEffort(resolved.ReasoningEffort),
			ServiceTier:       cloneOptionalString(resolved.ServiceTier),
			PermissionProfile: profile.PermissionProfile,
		},
	}, nil
}

func narratorInvocation(profile conversation.RoleProfile) (agent.Invocation, error) {
	if err := validateNarratorRoleProfile(profile); err != nil {
		return agent.Invocation{}, err
	}
	invocation := agent.Invocation{
		ReasoningEffort: string(profile.ReasoningEffort),
		ServiceTier:     cloneOptionalString(profile.ServiceTier),
		PermissionMode:  agent.PermissionModeReadOnly,
		ApprovalMode:    agent.ApprovalModeNever,
	}
	switch profile.ModelSelection.Mode {
	case conversation.ModelSelectionExact:
		invocation.Model = *profile.ModelSelection.ModelID
	case conversation.ModelSelectionProviderDefault:
		invocation.ModelSelectionProviderDefault = true
	default:
		return agent.Invocation{}, fmt.Errorf("unsupported narrator model selection %q", profile.ModelSelection.Mode)
	}
	return invocation, invocation.Validate()
}

func validateNarratorRoleProfile(profile conversation.RoleProfile) error {
	if err := profile.Validate(); err != nil {
		return err
	}
	if profile.Role != conversation.RoleNarrator {
		return fmt.Errorf("narrator resolution requires narrator role profile, got %s", profile.Role)
	}
	permission := profile.PermissionProfile
	if permission.ProviderPermissionProfile != ":read-only" {
		return fmt.Errorf(
			"narrator provider permission profile must be :read-only, got %s",
			permission.ProviderPermissionProfile,
		)
	}
	if permission.ApprovalPolicy != conversation.ApprovalPolicyNever || permission.Approvals {
		return errors.New("narrator role profile must disable approvals")
	}
	if permission.ToolAccess.Mode != conversation.ToolAccessNone || len(permission.ToolAccess.AllowedTools) != 0 {
		return errors.New("narrator role profile must disable all tools")
	}
	if permission.WorkspaceMutation {
		return errors.New("narrator role profile must disable workspace mutation")
	}
	return nil
}

func validateNarratorModelResolution(requested agent.Invocation, resolved agent.ResolvedInvocation) error {
	if !sameAgentInvocation(requested, resolved.Requested) {
		return errors.New("provider model resolver changed the requested narrator invocation")
	}
	if resolved.Model == "" {
		return errors.New("provider model resolver returned an empty narrator model")
	}
	if !requested.ModelSelectionProviderDefault && resolved.Model != requested.Model {
		return fmt.Errorf("exact narrator model resolved as %s, want %s", resolved.Model, requested.Model)
	}
	if resolved.ReasoningEffort == "" {
		return errors.New("provider model resolver returned an empty narrator reasoning effort")
	}
	if resolved.ReasoningEffort != requested.ReasoningEffort {
		return fmt.Errorf(
			"narrator reasoning effort resolved as %s, want %s",
			resolved.ReasoningEffort,
			requested.ReasoningEffort,
		)
	}
	if requested.ServiceTier != nil && !sameOptionalString(requested.ServiceTier, resolved.ServiceTier) {
		return fmt.Errorf("narrator service tier resolved as %v, want %s", resolved.ServiceTier, *requested.ServiceTier)
	}
	if resolved.PermissionMode != agent.PermissionModeReadOnly || resolved.ApprovalMode != agent.ApprovalModeNever {
		return errors.New("provider model resolver changed narrator permission or approval mode")
	}
	return nil
}

func sameAgentInvocation(left agent.Invocation, right agent.Invocation) bool {
	return left.ModelSelectionProviderDefault == right.ModelSelectionProviderDefault &&
		left.Model == right.Model &&
		left.ReasoningEffort == right.ReasoningEffort &&
		sameOptionalString(left.ServiceTier, right.ServiceTier) &&
		left.PermissionMode == right.PermissionMode &&
		left.ApprovalMode == right.ApprovalMode
}

func sameOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
