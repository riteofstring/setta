package conversation

import (
	"context"
	"fmt"
	"time"

	"setta/internal/agent"
)

type preparedPublication struct {
	draft CommittedEventDraft
}

func (service *Service) publications(
	conversationID string,
	committedAt string,
	payloads ...ConversationEventPayload,
) ([]preparedPublication, error) {
	streamID, err := ConversationStreamID(conversationID)
	if err != nil {
		return nil, err
	}
	result := make([]preparedPublication, 0, len(payloads))
	for _, payload := range payloads {
		if isNilConversationEventPayload(payload) {
			return nil, fmt.Errorf("conversation publication payload is required")
		}
		id, err := service.newID("conversation_event")
		if err != nil {
			return nil, err
		}
		result = append(result, preparedPublication{draft: CommittedEventDraft{
			ID:          id,
			StreamID:    streamID,
			Kind:        string(payload.conversationEventType()),
			Payload:     payload,
			CommittedAt: committedAt,
		}})
	}
	return result, nil
}

func appendPublications(transaction *WriteTransaction, publications []preparedPublication) error {
	for _, publication := range publications {
		if _, err := transaction.AppendCommittedEvent(publication.draft); err != nil {
			return err
		}
	}
	return nil
}

func agentInvocation(profile RoleProfile) (agent.Invocation, error) {
	if err := profile.Validate(); err != nil {
		return agent.Invocation{}, err
	}
	if profile.Role != RoleAgent {
		return agent.Invocation{}, fmt.Errorf("topic turn requires agent role profile, got %s", profile.Role)
	}
	return providerInvocation(profile)
}

func providerInvocation(profile RoleProfile) (agent.Invocation, error) {
	invocation := agent.Invocation{
		ReasoningEffort: string(profile.ReasoningEffort),
		ServiceTier:     cloneStringPointer(profile.ServiceTier),
	}
	switch profile.ModelSelection.Mode {
	case ModelSelectionExact:
		invocation.Model = *profile.ModelSelection.ModelID
	case ModelSelectionProviderDefault:
		invocation.ModelSelectionProviderDefault = true
	default:
		return agent.Invocation{}, fmt.Errorf("unsupported %s model selection %q", profile.Role, profile.ModelSelection.Mode)
	}
	switch profile.PermissionProfile.ProviderPermissionProfile {
	case ":read-only":
		invocation.PermissionMode = agent.PermissionModeReadOnly
	case ":workspace":
		invocation.PermissionMode = agent.PermissionModeWorkspaceWrite
	case ":full-access":
		invocation.PermissionMode = agent.PermissionModeFullAccess
	default:
		return agent.Invocation{}, fmt.Errorf(
			"unsupported provider permission profile %q",
			profile.PermissionProfile.ProviderPermissionProfile,
		)
	}
	switch profile.PermissionProfile.ApprovalPolicy {
	case ApprovalPolicyNever:
		invocation.ApprovalMode = agent.ApprovalModeNever
	case ApprovalPolicyOnRequest:
		invocation.ApprovalMode = agent.ApprovalModeOnRequest
	case ApprovalPolicyUnlessTrusted:
		invocation.ApprovalMode = agent.ApprovalModeUntrusted
	default:
		return agent.Invocation{}, fmt.Errorf(
			"unsupported provider approval policy %q",
			profile.PermissionProfile.ApprovalPolicy,
		)
	}
	return invocation, invocation.Validate()
}

func resolvedConversationInvocation(
	id string,
	profile RoleProfile,
	resolved agent.ResolvedInvocation,
	providerTurnID string,
	startedAt string,
) ResolvedInvocation {
	return ResolvedInvocation{
		ID:        id,
		Role:      RoleAgent,
		Provider:  ProviderCodex,
		Requested: profile,
		Resolved: ResolvedInvocationSettings{
			ModelID:           resolved.Model,
			ReasoningEffort:   resolved.ReasoningEffort,
			ServiceTier:       cloneStringPointer(resolved.ServiceTier),
			PermissionProfile: profile.PermissionProfile,
		},
		ProviderReferences: InvocationProviderReferences{TurnID: &providerTurnID},
		ModelReroutes:      []InvocationModelReroute{},
		StartedAt:          startedAt,
		Outcome:            InvocationOutcomeRunning,
	}
}

func terminalInvocation(
	running ResolvedInvocation,
	outcome InvocationOutcome,
	endedAt string,
	failure *Failure,
) ResolvedInvocation {
	running.Outcome = outcome
	running.EndedAt = &endedAt
	running.Failure = failure
	return running
}

func advanceTimestamp(previous string, candidate string) string {
	previousTime, err := time.Parse(time.RFC3339Nano, previous)
	if err != nil {
		return candidate
	}
	candidateTime, err := time.Parse(time.RFC3339Nano, candidate)
	if err != nil || !candidateTime.After(previousTime) {
		return previousTime.Add(time.Nanosecond).UTC().Format(time.RFC3339Nano)
	}
	return candidate
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func (service *Service) snapshotLocked(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (ConversationSnapshot, error) {
	snapshot, err := service.store.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if snapshot.Conversation.ArchivedAt != nil {
		return ConversationSnapshot{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "archived conversations do not accept commands",
		}
	}
	return snapshot, nil
}

func validatePrimaryAgentModelResolution(
	requested agent.Invocation,
	resolved agent.ResolvedInvocation,
) error {
	if !equalAgentInvocation(requested, resolved.Requested) {
		return fmt.Errorf("provider model resolver changed the requested primary-agent invocation")
	}
	if resolved.Model == "" || resolved.ReasoningEffort == "" {
		return fmt.Errorf("provider model resolver returned incomplete primary-agent settings")
	}
	if !requested.ModelSelectionProviderDefault && resolved.Model != requested.Model {
		return fmt.Errorf("exact primary-agent model resolved as %s, want %s", resolved.Model, requested.Model)
	}
	if resolved.ReasoningEffort != requested.ReasoningEffort {
		return fmt.Errorf(
			"primary-agent reasoning effort resolved as %s, want %s",
			resolved.ReasoningEffort,
			requested.ReasoningEffort,
		)
	}
	if requested.ServiceTier != nil && !equalOptionalAgentString(requested.ServiceTier, resolved.ServiceTier) {
		return fmt.Errorf("primary-agent service tier changed during provider resolution")
	}
	if resolved.PermissionMode != requested.PermissionMode || resolved.ApprovalMode != requested.ApprovalMode {
		return fmt.Errorf("provider model resolver changed primary-agent permission or approval mode")
	}
	return nil
}

func findConversationTurn(snapshot ConversationSnapshot, turnID string) (ConversationTurn, error) {
	for _, turn := range snapshot.Turns.Turns {
		if turn.ID == turnID {
			return turn, nil
		}
	}
	return ConversationTurn{}, fmt.Errorf("%w: turn %s", ErrConversationNotFound, turnID)
}
