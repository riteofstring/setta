package conversation

import (
	"fmt"
	"strings"
)

type Provider string
type Role string
type RoleProfileScopeKind string
type ModelSelectionMode string
type ReasoningEffort = string
type ApprovalPolicy string
type ToolAccessMode string
type InvocationOutcome string

const (
	ProviderCodex Provider = "codex"

	RoleMaster    Role = "master"
	RoleAgent     Role = "agent"
	RoleNarrator  Role = "narrator"
	RoleSideAgent Role = "side_agent"

	RoleProfileScopeGlobal       RoleProfileScopeKind = "global"
	RoleProfileScopeWorkspace    RoleProfileScopeKind = "workspace"
	RoleProfileScopeConversation RoleProfileScopeKind = "conversation"

	ModelSelectionExact           ModelSelectionMode = "exact"
	ModelSelectionProviderDefault ModelSelectionMode = "provider_default"

	ReasoningEffortNone    ReasoningEffort = "none"
	ReasoningEffortMinimal ReasoningEffort = "minimal"
	ReasoningEffortLow     ReasoningEffort = "low"
	ReasoningEffortMedium  ReasoningEffort = "medium"
	ReasoningEffortHigh    ReasoningEffort = "high"
	ReasoningEffortXHigh   ReasoningEffort = "xhigh"
	ReasoningEffortMax     ReasoningEffort = "max"
	ReasoningEffortUltra   ReasoningEffort = "ultra"

	ApprovalPolicyUnlessTrusted ApprovalPolicy = "untrusted"
	ApprovalPolicyOnRequest     ApprovalPolicy = "on-request"
	ApprovalPolicyNever         ApprovalPolicy = "never"

	ToolAccessAll       ToolAccessMode = "all"
	ToolAccessAllowlist ToolAccessMode = "allowlist"
	ToolAccessNone      ToolAccessMode = "none"

	InvocationOutcomeRunning   InvocationOutcome = "running"
	InvocationOutcomeSucceeded InvocationOutcome = "succeeded"
	InvocationOutcomeFailed    InvocationOutcome = "failed"
	InvocationOutcomeCancelled InvocationOutcome = "cancelled"
)

type ModelSelection struct {
	Mode    ModelSelectionMode `json:"mode"`
	ModelID *string            `json:"modelId"`
}

type ToolAccessPolicy struct {
	Mode         ToolAccessMode `json:"mode"`
	AllowedTools []string       `json:"allowedTools"`
}

type PermissionProfile struct {
	ApprovalPolicy            ApprovalPolicy   `json:"approvalPolicy"`
	ProviderPermissionProfile string           `json:"providerPermissionProfile"`
	ToolAccess                ToolAccessPolicy `json:"toolAccess"`
	WorkspaceMutation         bool             `json:"workspaceMutation"`
	Approvals                 bool             `json:"approvals"`
}

type ContextBudget struct {
	MaxInputBytes        int `json:"maxInputBytes"`
	MaxInputTokens       int `json:"maxInputTokens"`
	ReservedOutputTokens int `json:"reservedOutputTokens"`
}

type RoleProfile struct {
	Role              Role              `json:"role"`
	Provider          Provider          `json:"provider"`
	ModelSelection    ModelSelection    `json:"modelSelection"`
	ReasoningEffort   ReasoningEffort   `json:"reasoningEffort"`
	ServiceTier       *string           `json:"serviceTier"`
	PermissionProfile PermissionProfile `json:"permissionProfile"`
	ContextBudget     ContextBudget     `json:"contextBudget"`
}

type RoleProfileOverride struct {
	ScopeKind RoleProfileScopeKind `json:"scopeKind"`
	ScopeID   string               `json:"scopeId"`
	Profile   RoleProfile          `json:"profile"`
	UpdatedAt string               `json:"updatedAt"`
}

type ResolvedInvocationSettings struct {
	ModelID           string            `json:"modelId"`
	ReasoningEffort   ReasoningEffort   `json:"reasoningEffort"`
	ServiceTier       *string           `json:"serviceTier"`
	PermissionProfile PermissionProfile `json:"permissionProfile"`
}

type InvocationContextUsage struct {
	InputBytes            int `json:"inputBytes"`
	EstimatedInputTokens  int `json:"estimatedInputTokens"`
	OutputBytes           int `json:"outputBytes"`
	EstimatedOutputTokens int `json:"estimatedOutputTokens"`
}

type InvocationProviderReferences struct {
	ThreadID   *string `json:"threadId"`
	TurnID     *string `json:"turnId"`
	RequestID  *string `json:"requestId"`
	ResponseID *string `json:"responseId"`
}

type InvocationModelReroute struct {
	FromModelID string `json:"fromModelId"`
	ToModelID   string `json:"toModelId"`
	Reason      string `json:"reason"`
}

type ResolvedInvocation struct {
	ID                 string                       `json:"id"`
	Role               Role                         `json:"role"`
	Provider           Provider                     `json:"provider"`
	Requested          RoleProfile                  `json:"requested"`
	Resolved           ResolvedInvocationSettings   `json:"resolved"`
	ContextUsage       InvocationContextUsage       `json:"contextUsage"`
	ProviderReferences InvocationProviderReferences `json:"providerReferences"`
	ModelReroutes      []InvocationModelReroute     `json:"modelReroutes"`
	StartedAt          string                       `json:"startedAt"`
	EndedAt            *string                      `json:"endedAt"`
	Outcome            InvocationOutcome            `json:"outcome"`
	Failure            *Failure                     `json:"failure"`
}

func (selection ModelSelection) Validate() error {
	switch selection.Mode {
	case ModelSelectionExact:
		if err := validateOptionalIdentifier("exact model id", selection.ModelID); err != nil {
			return err
		}
		if selection.ModelID == nil {
			return fmt.Errorf("exact model selection requires model id")
		}
	case ModelSelectionProviderDefault:
		if selection.ModelID != nil {
			return fmt.Errorf("provider-default model selection must not include model id")
		}
	default:
		return fmt.Errorf("unsupported model selection mode %q", selection.Mode)
	}
	return nil
}

func (policy ToolAccessPolicy) Validate() error {
	if policy.AllowedTools == nil {
		return fmt.Errorf("tool access allowedTools must be an array, not null")
	}
	seen := map[string]bool{}
	for _, tool := range policy.AllowedTools {
		if err := validateIdentifier("allowed tool", tool); err != nil {
			return err
		}
		if seen[tool] {
			return fmt.Errorf("allowed tool %q is duplicated", tool)
		}
		seen[tool] = true
	}
	switch policy.Mode {
	case ToolAccessAll, ToolAccessNone:
		if len(policy.AllowedTools) != 0 {
			return fmt.Errorf("tool access mode %s must not include an allowlist", policy.Mode)
		}
	case ToolAccessAllowlist:
		if len(policy.AllowedTools) == 0 {
			return fmt.Errorf("tool access allowlist must not be empty")
		}
	default:
		return fmt.Errorf("unsupported tool access mode %q", policy.Mode)
	}
	return nil
}

func (profile PermissionProfile) Validate() error {
	if !validApprovalPolicy(profile.ApprovalPolicy) {
		return fmt.Errorf("unsupported approval policy %q", profile.ApprovalPolicy)
	}
	if err := validateIdentifier("provider permission profile", profile.ProviderPermissionProfile); err != nil {
		return err
	}
	if err := profile.ToolAccess.Validate(); err != nil {
		return err
	}
	if profile.ToolAccess.Mode == ToolAccessNone && profile.WorkspaceMutation {
		return fmt.Errorf("tool access mode none cannot permit workspace mutation")
	}
	if profile.ApprovalPolicy == ApprovalPolicyNever && profile.Approvals {
		return fmt.Errorf("approval policy never cannot expose approvals")
	}
	if profile.ApprovalPolicy != ApprovalPolicyNever && !profile.Approvals {
		return fmt.Errorf("approval policy %s requires approvals capability", profile.ApprovalPolicy)
	}
	return nil
}

func (budget ContextBudget) Validate() error {
	if budget.MaxInputBytes <= 0 {
		return fmt.Errorf("context budget maxInputBytes must be positive")
	}
	if budget.MaxInputTokens <= 0 {
		return fmt.Errorf("context budget maxInputTokens must be positive")
	}
	if budget.ReservedOutputTokens <= 0 {
		return fmt.Errorf("context budget reservedOutputTokens must be positive")
	}
	return nil
}

func (profile RoleProfile) Validate() error {
	if !validRole(profile.Role) {
		return fmt.Errorf("unsupported role %q", profile.Role)
	}
	if profile.Provider != ProviderCodex {
		return fmt.Errorf("role %s has unsupported provider %q", profile.Role, profile.Provider)
	}
	if err := profile.ModelSelection.Validate(); err != nil {
		return fmt.Errorf("role %s model selection: %w", profile.Role, err)
	}
	if strings.TrimSpace(string(profile.ReasoningEffort)) == "" {
		return fmt.Errorf("role %s reasoning effort is required", profile.Role)
	}
	if err := validateOptionalIdentifier("role service tier", profile.ServiceTier); err != nil {
		return err
	}
	if err := profile.PermissionProfile.Validate(); err != nil {
		return fmt.Errorf("role %s permission profile: %w", profile.Role, err)
	}
	if err := profile.ContextBudget.Validate(); err != nil {
		return fmt.Errorf("role %s: %w", profile.Role, err)
	}
	return nil
}

func (override RoleProfileOverride) Validate() error {
	switch override.ScopeKind {
	case RoleProfileScopeGlobal:
		if override.ScopeID != "" {
			return fmt.Errorf("global role profile override scope id must be empty")
		}
	case RoleProfileScopeWorkspace, RoleProfileScopeConversation:
		if err := validateIdentifier("role profile override scope id", override.ScopeID); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported role profile scope %q", override.ScopeKind)
	}
	if err := override.Profile.Validate(); err != nil {
		return err
	}
	if override.Profile.Role == RoleMaster {
		if override.ScopeKind != RoleProfileScopeGlobal {
			return fmt.Errorf("master role profile override must use global scope")
		}
		if err := validateMasterRoleProfile(override.Profile); err != nil {
			return fmt.Errorf("master role profile override: %w", err)
		}
	}
	_, err := validateTimestamp("role profile override updatedAt", override.UpdatedAt)
	return err
}

func (settings ResolvedInvocationSettings) Validate() error {
	if err := validateIdentifier("resolved invocation model id", settings.ModelID); err != nil {
		return err
	}
	if strings.TrimSpace(string(settings.ReasoningEffort)) == "" {
		return fmt.Errorf("resolved invocation reasoning effort is required")
	}
	if err := validateOptionalIdentifier("resolved invocation service tier", settings.ServiceTier); err != nil {
		return err
	}
	return settings.PermissionProfile.Validate()
}

func (usage InvocationContextUsage) Validate() error {
	if usage.InputBytes < 0 || usage.EstimatedInputTokens < 0 || usage.OutputBytes < 0 || usage.EstimatedOutputTokens < 0 {
		return fmt.Errorf("invocation context usage values must be non-negative")
	}
	return nil
}

func (references InvocationProviderReferences) Validate() error {
	for _, field := range []struct {
		label string
		value *string
	}{
		{label: "invocation provider thread id", value: references.ThreadID},
		{label: "invocation provider turn id", value: references.TurnID},
		{label: "invocation provider request id", value: references.RequestID},
		{label: "invocation provider response id", value: references.ResponseID},
	} {
		if err := validateOptionalIdentifier(field.label, field.value); err != nil {
			return err
		}
	}
	return nil
}

func (reroute InvocationModelReroute) Validate() error {
	if err := validateIdentifier("model reroute from model id", reroute.FromModelID); err != nil {
		return err
	}
	if err := validateIdentifier("model reroute to model id", reroute.ToModelID); err != nil {
		return err
	}
	if reroute.FromModelID == reroute.ToModelID {
		return fmt.Errorf("model reroute must change model id")
	}
	return validateIdentifier("model reroute reason", reroute.Reason)
}

func (invocation ResolvedInvocation) Validate() error {
	if err := validateInvocationIdentityAndSettings(invocation); err != nil {
		return err
	}
	if err := validateInvocationReroutes(invocation); err != nil {
		return err
	}
	timeline, err := validateInvocationTimeline(invocation)
	if err != nil {
		return err
	}
	if invocation.Failure != nil {
		if err := invocation.Failure.Validate(); err != nil {
			return fmt.Errorf("invocation %s failure: %w", invocation.ID, err)
		}
	}
	return validateInvocationLifecycle(invocation, timeline.hasEnded)
}

func validateInvocationIdentityAndSettings(invocation ResolvedInvocation) error {
	if err := validateIdentifier("invocation id", invocation.ID); err != nil {
		return err
	}
	if !validRole(invocation.Role) {
		return fmt.Errorf("invocation %s has unsupported role %q", invocation.ID, invocation.Role)
	}
	if invocation.Provider != ProviderCodex {
		return fmt.Errorf("invocation %s has unsupported provider %q", invocation.ID, invocation.Provider)
	}
	if err := invocation.Requested.Validate(); err != nil {
		return fmt.Errorf("invocation %s requested profile: %w", invocation.ID, err)
	}
	if invocation.Requested.Role != invocation.Role || invocation.Requested.Provider != invocation.Provider {
		return fmt.Errorf("invocation %s requested role/provider does not match invocation", invocation.ID)
	}
	if err := invocation.Resolved.Validate(); err != nil {
		return fmt.Errorf("invocation %s resolved settings: %w", invocation.ID, err)
	}
	if err := invocation.ContextUsage.Validate(); err != nil {
		return fmt.Errorf("invocation %s: %w", invocation.ID, err)
	}
	if err := invocation.ProviderReferences.Validate(); err != nil {
		return fmt.Errorf("invocation %s: %w", invocation.ID, err)
	}
	return nil
}

func validateInvocationReroutes(invocation ResolvedInvocation) error {
	if invocation.ModelReroutes == nil {
		return fmt.Errorf("invocation %s model reroutes must be an array, not null", invocation.ID)
	}
	for index, reroute := range invocation.ModelReroutes {
		if err := reroute.Validate(); err != nil {
			return fmt.Errorf("invocation %s model reroute %d: %w", invocation.ID, index, err)
		}
		if index == 0 && reroute.FromModelID != invocation.Resolved.ModelID {
			return fmt.Errorf("invocation %s first model reroute starts from %q, want resolved model %q", invocation.ID, reroute.FromModelID, invocation.Resolved.ModelID)
		}
		if index > 0 && invocation.ModelReroutes[index-1].ToModelID != reroute.FromModelID {
			return fmt.Errorf("invocation %s model reroutes are not contiguous at index %d", invocation.ID, index)
		}
	}
	return nil
}

type invocationTimeline struct {
	hasEnded bool
}

func validateInvocationTimeline(invocation ResolvedInvocation) (invocationTimeline, error) {
	startedAt, err := validateTimestamp("invocation startedAt", invocation.StartedAt)
	if err != nil {
		return invocationTimeline{}, err
	}
	endedAt, hasEnded, err := optionalTimestamp("invocation endedAt", invocation.EndedAt)
	if err != nil {
		return invocationTimeline{}, err
	}
	if hasEnded && endedAt.Before(startedAt) {
		return invocationTimeline{}, fmt.Errorf("invocation %s endedAt precedes startedAt", invocation.ID)
	}
	return invocationTimeline{hasEnded: hasEnded}, nil
}

func validateInvocationLifecycle(invocation ResolvedInvocation, hasEnded bool) error {
	switch invocation.Outcome {
	case InvocationOutcomeRunning:
		return validateRunningInvocation(invocation, hasEnded)
	case InvocationOutcomeSucceeded, InvocationOutcomeCancelled:
		return validateSuccessfulOrCancelledInvocation(invocation, hasEnded)
	case InvocationOutcomeFailed:
		return validateFailedInvocation(invocation, hasEnded)
	default:
		return fmt.Errorf("invocation %s has unsupported outcome %q", invocation.ID, invocation.Outcome)
	}
}

func validateRunningInvocation(invocation ResolvedInvocation, hasEnded bool) error {
	if hasEnded || invocation.Failure != nil {
		return fmt.Errorf("running invocation %s contains terminal state", invocation.ID)
	}
	return nil
}

func validateSuccessfulOrCancelledInvocation(invocation ResolvedInvocation, hasEnded bool) error {
	if !hasEnded || invocation.Failure != nil {
		return fmt.Errorf("%s invocation %s must have end time and no failure", invocation.Outcome, invocation.ID)
	}
	return nil
}

func validateFailedInvocation(invocation ResolvedInvocation, hasEnded bool) error {
	if !hasEnded || invocation.Failure == nil {
		return fmt.Errorf("failed invocation %s must have end time and failure", invocation.ID)
	}
	return nil
}

func validRole(role Role) bool {
	switch role {
	case RoleMaster, RoleAgent, RoleNarrator, RoleSideAgent:
		return true
	default:
		return false
	}
}

func validApprovalPolicy(policy ApprovalPolicy) bool {
	switch policy {
	case ApprovalPolicyUnlessTrusted, ApprovalPolicyOnRequest, ApprovalPolicyNever:
		return true
	default:
		return false
	}
}
