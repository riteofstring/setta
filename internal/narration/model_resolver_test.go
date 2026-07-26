package narration

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"setta/internal/agent"
	"setta/internal/conversation"
)

func TestModelResolverUsesIndependentLightweightNarratorDefault(t *testing.T) {
	profiles := &modelResolverProfileSource{}
	catalog := &modelResolverCatalog{}
	resolver := newTestModelResolver(t, profiles, catalog)

	resolution, err := resolver.Resolve(context.Background(), "workspace-1", "conversation-1")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	wantProfile := conversation.DefaultNarratorRoleProfile()
	if !reflect.DeepEqual(profiles.builtIn, wantProfile) || !reflect.DeepEqual(resolution.RequestedProfile, wantProfile) {
		t.Fatalf("narrator default profile = %+v/%+v, want %+v", profiles.builtIn, resolution.RequestedProfile, wantProfile)
	}
	if resolution.Invocation.Model != "gpt-5.4-mini" || resolution.Invocation.ReasoningEffort != "low" {
		t.Fatalf("narrator invocation = %+v, want gpt-5.4-mini/low", resolution.Invocation)
	}
	if resolution.Settings.ModelID != "gpt-5.4-mini" || resolution.Settings.ReasoningEffort != conversation.ReasoningEffortLow {
		t.Fatalf("narrator settings = %+v, want gpt-5.4-mini/low", resolution.Settings)
	}
	assertRestrictedNarratorInvocation(t, resolution.Invocation)

	agentProfile := conversation.DefaultAgentRoleProfile()
	if agentProfile.ModelSelection.ModelID == nil || *agentProfile.ModelSelection.ModelID == resolution.Invocation.Model {
		t.Fatalf("narrator model inherited primary agent profile: agent=%+v narrator=%+v", agentProfile, resolution)
	}
	if agentProfile.ReasoningEffort == resolution.RequestedProfile.ReasoningEffort {
		t.Fatalf("narrator effort inherited primary agent effort %s", agentProfile.ReasoningEffort)
	}
}

func TestModelResolverUsesOnlyEffectiveNarratorOverride(t *testing.T) {
	profile := conversation.DefaultNarratorRoleProfile()
	modelID := "gpt-explicit-narrator"
	tier := "priority"
	profile.ModelSelection.ModelID = &modelID
	profile.ReasoningEffort = conversation.ReasoningEffortNone
	profile.ServiceTier = &tier
	profiles := &modelResolverProfileSource{profile: &profile}
	catalog := &modelResolverCatalog{}
	resolver := newTestModelResolver(t, profiles, catalog)

	resolution, err := resolver.Resolve(context.Background(), "workspace-override", "conversation-override")
	if err != nil {
		t.Fatalf("Resolve override: %v", err)
	}
	if catalog.request.Model != modelID || catalog.request.ReasoningEffort != "none" ||
		catalog.request.ServiceTier == nil || *catalog.request.ServiceTier != tier {
		t.Fatalf("catalog request = %+v, want exact narrator override", catalog.request)
	}
	if resolution.Settings.ServiceTier == nil || *resolution.Settings.ServiceTier != tier {
		t.Fatalf("resolved service tier = %v, want %s", resolution.Settings.ServiceTier, tier)
	}
	assertRestrictedNarratorInvocation(t, resolution.Invocation)
}

func TestModelResolverUsesEffectiveNarratorProfileWithoutAWorkspace(t *testing.T) {
	profile := conversation.DefaultNarratorRoleProfile()
	modelID := "gpt-unbound-narrator"
	profile.ModelSelection.ModelID = &modelID
	profile.ContextBudget.MaxInputBytes--
	profiles := &modelResolverProfileSource{profile: &profile}
	catalog := &modelResolverCatalog{}
	resolver := newTestModelResolver(t, profiles, catalog)

	resolution, err := resolver.Resolve(
		context.Background(),
		"",
		"conversation-unbound-narrator",
	)
	if err != nil {
		t.Fatalf("Resolve unbound narrator: %v", err)
	}
	if profiles.calls != 1 || profiles.workspaceID != nil ||
		resolution.RequestedProfile.ModelSelection.ModelID == nil ||
		*resolution.RequestedProfile.ModelSelection.ModelID != modelID {
		t.Fatalf(
			"unbound narrator profile source = calls:%d workspace:%v resolution:%+v",
			profiles.calls,
			profiles.workspaceID,
			resolution,
		)
	}
}

func TestServiceAttemptContextLimitsUseEffectiveProfileWithoutAWorkspace(t *testing.T) {
	profile := conversation.DefaultNarratorRoleProfile()
	profile.ContextBudget.MaxInputBytes--
	profiles := &modelResolverProfileSource{profile: &profile}
	worker := &serviceAttemptWorker{profiles: profiles}

	limits, err := worker.contextLimits(
		context.Background(),
		"",
		"conversation-unbound-attempt",
	)
	if err != nil {
		t.Fatalf("contextLimits: %v", err)
	}
	if profiles.calls != 1 || profiles.workspaceID != nil ||
		limits.MaxInputBytes != profile.ContextBudget.MaxInputBytes {
		t.Fatalf(
			"unbound attempt limits = %+v, calls:%d workspace:%v",
			limits,
			profiles.calls,
			profiles.workspaceID,
		)
	}
}

func TestModelResolverRejectsUnsafeNarratorOverridesBeforeCatalogLookup(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*conversation.RoleProfile)
		message string
	}{
		{
			name: "workspace permission",
			mutate: func(profile *conversation.RoleProfile) {
				profile.PermissionProfile.ProviderPermissionProfile = ":workspace"
			},
			message: ":read-only",
		},
		{
			name: "tools",
			mutate: func(profile *conversation.RoleProfile) {
				profile.PermissionProfile.ToolAccess.Mode = conversation.ToolAccessAll
			},
			message: "disable all tools",
		},
		{
			name: "approvals",
			mutate: func(profile *conversation.RoleProfile) {
				profile.PermissionProfile.ApprovalPolicy = conversation.ApprovalPolicyOnRequest
				profile.PermissionProfile.Approvals = true
			},
			message: "disable approvals",
		},
		{
			name: "wrong role",
			mutate: func(profile *conversation.RoleProfile) {
				profile.Role = conversation.RoleAgent
			},
			message: "requires narrator role profile",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			profile := conversation.DefaultNarratorRoleProfile()
			test.mutate(&profile)
			profiles := &modelResolverProfileSource{profile: &profile}
			catalog := &modelResolverCatalog{}
			resolver := newTestModelResolver(t, profiles, catalog)

			_, err := resolver.Resolve(context.Background(), "workspace-1", "conversation-1")
			if err == nil || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("unsafe narrator error = %v, want %q", err, test.message)
			}
			if catalog.calls != 0 {
				t.Fatalf("unsafe narrator profile reached catalog %d times", catalog.calls)
			}
		})
	}
}

func TestModelResolverFailsWithoutModelFallback(t *testing.T) {
	catalogFailure := errors.New("configured provider model gpt-5.4-mini is unavailable")
	resolver := newTestModelResolver(
		t,
		&modelResolverProfileSource{},
		&modelResolverCatalog{err: catalogFailure},
	)

	_, err := resolver.Resolve(context.Background(), "workspace-1", "conversation-1")
	if !errors.Is(err, catalogFailure) || !strings.Contains(err.Error(), "resolve narrator model") {
		t.Fatalf("catalog failure = %T %v, want preserved actionable error", err, err)
	}
}

func TestModelResolverRejectsCatalogRerouteOfExactSelection(t *testing.T) {
	catalog := &modelResolverCatalog{resolvedModel: "gpt-silent-fallback"}
	resolver := newTestModelResolver(t, &modelResolverProfileSource{}, catalog)

	_, err := resolver.Resolve(context.Background(), "workspace-1", "conversation-1")
	if err == nil || !strings.Contains(err.Error(), "exact narrator model resolved as gpt-silent-fallback") {
		t.Fatalf("silent fallback error = %v, want exact-model mismatch", err)
	}
}

func TestModelResolverRejectsCatalogReasoningFallback(t *testing.T) {
	catalog := &modelResolverCatalog{resolvedReasoningEffort: "medium"}
	resolver := newTestModelResolver(t, &modelResolverProfileSource{}, catalog)

	_, err := resolver.Resolve(context.Background(), "workspace-1", "conversation-1")
	if err == nil || !strings.Contains(err.Error(), "narrator reasoning effort resolved as medium, want low") {
		t.Fatalf("reasoning fallback error = %v, want exact-effort mismatch", err)
	}
}

func TestModelResolverRejectsCatalogMutationOfRequestedServiceTier(t *testing.T) {
	profile := conversation.DefaultNarratorRoleProfile()
	requestedTier := "priority"
	profile.ServiceTier = &requestedTier
	catalog := &modelResolverCatalog{mutatedRequestedServiceTier: "batch"}
	resolver := newTestModelResolver(t, &modelResolverProfileSource{profile: &profile}, catalog)

	_, err := resolver.Resolve(context.Background(), "workspace-1", "conversation-1")
	if err == nil || !strings.Contains(err.Error(), "changed the requested narrator invocation") {
		t.Fatalf("mutated catalog request error = %v, want immutable-request failure", err)
	}
	if profile.ServiceTier == nil || *profile.ServiceTier != requestedTier {
		t.Fatalf("requested profile service tier = %v, want %s", profile.ServiceTier, requestedTier)
	}
}

func TestModelResolverRejectsCatalogServiceTierFallback(t *testing.T) {
	profile := conversation.DefaultNarratorRoleProfile()
	requestedTier := "priority"
	profile.ServiceTier = &requestedTier
	catalog := &modelResolverCatalog{resolvedServiceTier: "batch"}
	resolver := newTestModelResolver(t, &modelResolverProfileSource{profile: &profile}, catalog)

	_, err := resolver.Resolve(context.Background(), "workspace-1", "conversation-1")
	if err == nil || !strings.Contains(err.Error(), "service tier resolved as batch, want priority") {
		t.Fatalf("service tier fallback error = %v, want actionable exact-tier mismatch", err)
	}
}

func TestModelResolverValidatesProviderDefaultCatalogSettings(t *testing.T) {
	profile := conversation.DefaultNarratorRoleProfile()
	profile.ModelSelection = conversation.ModelSelection{Mode: conversation.ModelSelectionProviderDefault}
	catalog := &modelResolverCatalog{resolvedModel: " malformed-provider-default"}
	resolver := newTestModelResolver(t, &modelResolverProfileSource{profile: &profile}, catalog)

	_, err := resolver.Resolve(context.Background(), "workspace-1", "conversation-1")
	if err == nil || !strings.Contains(err.Error(), "validate resolved narrator settings") ||
		!strings.Contains(err.Error(), "must not have surrounding whitespace") {
		t.Fatalf("malformed provider-default settings error = %v, want resolved-settings validation", err)
	}
}

func TestModelResolverValidatesConstructionAndRequests(t *testing.T) {
	catalog := &modelResolverCatalog{}
	if _, err := NewModelResolver(nil, catalog); err == nil {
		t.Fatal("NewModelResolver accepted nil profile source")
	}
	if _, err := NewModelResolver(&modelResolverProfileSource{}, nil); err == nil {
		t.Fatal("NewModelResolver accepted nil catalog")
	}
	resolver := newTestModelResolver(t, &modelResolverProfileSource{}, catalog)
	if _, err := resolver.Resolve(nil, "workspace-1", "conversation-1"); err == nil {
		t.Fatal("Resolve accepted nil context")
	}
	if _, err := resolver.Resolve(context.Background(), " workspace-1", "conversation-1"); err == nil {
		t.Fatal("Resolve accepted malformed workspace id")
	}
}

type modelResolverProfileSource struct {
	builtIn        conversation.RoleProfile
	profile        *conversation.RoleProfile
	err            error
	calls          int
	workspaceID    *string
	conversationID string
}

func (source *modelResolverProfileSource) ReadEffectiveRoleProfile(
	_ context.Context,
	workspaceID *string,
	conversationID string,
	builtIn conversation.RoleProfile,
) (conversation.RoleProfile, error) {
	source.builtIn = builtIn
	source.calls++
	source.workspaceID = nil
	if workspaceID != nil {
		value := *workspaceID
		source.workspaceID = &value
	}
	source.conversationID = conversationID
	if source.err != nil {
		return conversation.RoleProfile{}, source.err
	}
	if source.profile != nil {
		return *source.profile, nil
	}
	return builtIn, nil
}

type modelResolverCatalog struct {
	calls                       int
	err                         error
	request                     agent.Invocation
	mutatedRequestedServiceTier string
	resolvedModel               string
	resolvedReasoningEffort     string
	resolvedServiceTier         string
}

func (catalog *modelResolverCatalog) ResolveInvocation(
	_ context.Context,
	request agent.Invocation,
) (agent.ResolvedInvocation, error) {
	catalog.calls++
	if catalog.err != nil {
		return agent.ResolvedInvocation{}, catalog.err
	}
	if catalog.mutatedRequestedServiceTier != "" && request.ServiceTier != nil {
		*request.ServiceTier = catalog.mutatedRequestedServiceTier
	}
	catalog.request = request
	model := request.Model
	if request.ModelSelectionProviderDefault {
		model = "gpt-provider-default"
	}
	if catalog.resolvedModel != "" {
		model = catalog.resolvedModel
	}
	reasoningEffort := request.ReasoningEffort
	if catalog.resolvedReasoningEffort != "" {
		reasoningEffort = catalog.resolvedReasoningEffort
	}
	serviceTier := cloneOptionalString(request.ServiceTier)
	if catalog.resolvedServiceTier != "" {
		serviceTier = &catalog.resolvedServiceTier
	}
	return agent.ResolvedInvocation{
		Requested:       request,
		Model:           model,
		ReasoningEffort: reasoningEffort,
		ServiceTier:     serviceTier,
		PermissionMode:  request.PermissionMode,
		ApprovalMode:    request.ApprovalMode,
	}, nil
}

func newTestModelResolver(
	t *testing.T,
	profiles RoleProfileSource,
	catalog ModelCatalogResolver,
) *ModelResolver {
	t.Helper()
	resolver, err := NewModelResolver(profiles, catalog)
	if err != nil {
		t.Fatalf("NewModelResolver: %v", err)
	}
	return resolver
}

func assertRestrictedNarratorInvocation(t *testing.T, invocation agent.Invocation) {
	t.Helper()
	if invocation.PermissionMode != agent.PermissionModeReadOnly || invocation.ApprovalMode != agent.ApprovalModeNever {
		t.Fatalf("narrator invocation permissions = %+v, want read-only/never", invocation)
	}
}
