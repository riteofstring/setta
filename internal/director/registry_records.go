package director

import (
	"fmt"

	"setta/internal/conversation"
)

// The durable records the rails act on.
//
// A pending approval, an unresolved resource request, and a produced artifact
// are app-scoped state, not graph decoration: the user must be able to answer,
// supply, or open them from anywhere in the command center. Each one is folded
// from the same durable facts the graph is projected from, so a rail and the
// graph can never disagree about what is outstanding.

// applyTrajectoryRecords records the actionable state one durable trajectory
// fact created or resolved.
func (state *registryState) applyTrajectoryRecords(
	workstream *registryWorkstream,
	event conversation.TrajectoryEvent,
) ([]registryEffect, error) {
	switch event.Kind {
	case conversation.TrajectoryEventApprovalRequested:
		return state.openApproval(workstream, event)
	case conversation.TrajectoryEventApprovalResolved:
		return state.resolveApproval(workstream, event)
	case conversation.TrajectoryEventArtifactEmitted:
		return state.declareArtifact(workstream, event)
	case conversation.TrajectoryEventTurnFailed:
		return nil, workstream.recordRunFailure(event)
	case conversation.TrajectoryEventTurnCompleted:
		// A run that finished is durable proof the workstream moved past the
		// failures before it, so offering to recover one would put a stale
		// action in front of the user.
		workstream.recoverableFailures = nil
		return nil, nil
	default:
		return nil, nil
	}
}

func (state *registryState) openApproval(
	workstream *registryWorkstream,
	event conversation.TrajectoryEvent,
) ([]registryEffect, error) {
	if event.ApprovalRequested == nil {
		return nil, missingPayload(event)
	}
	approval := event.ApprovalRequested.Approval
	if _, exists := state.approvals[approval.ID]; exists {
		return nil, fmt.Errorf("approval %s was requested twice", approval.ID)
	}
	record := &ApprovalRequest{
		ID:            approval.ID,
		WorkstreamID:  workstream.record.ID,
		RunID:         copyOptionalString(event.TurnID),
		Kind:          approval.Kind,
		Status:        ApprovalStatusPending,
		PublicSummary: firstText(approval.Title, approvalSummaryFallback),
		// A secret answer never leaves the approval surface that can redact it.
		// The record carries only that one is expected, so the rail can say why
		// the resolution is not shown.
		Secret:         hasSecretQuestion(approval.Questions),
		SourceEventIDs: []string{event.ID},
		RequestedAt:    approval.RequestedAt,
	}
	if err := ValidateApprovalRequest(*record); err != nil {
		return nil, err
	}
	state.approvals[approval.ID] = record
	state.approvalOrder = append(state.approvalOrder, approval.ID)
	workstream.unresolvedApprovals[approval.ID] = true
	return []registryEffect{{kind: effectApproval, id: approval.ID}}, nil
}

func (state *registryState) resolveApproval(
	workstream *registryWorkstream,
	event conversation.TrajectoryEvent,
) ([]registryEffect, error) {
	if event.ApprovalResolved == nil {
		return nil, missingPayload(event)
	}
	resolution := event.ApprovalResolved.Resolution
	record, exists := state.approvals[resolution.ApprovalID]
	if !exists {
		return nil, fmt.Errorf("approval %s resolved before it was requested", resolution.ApprovalID)
	}
	status, err := ApprovalStatusForDecision(resolution.Decision)
	if err != nil {
		return nil, err
	}
	if err := approvalLifecycle.validateTransition(record.Status, status); err != nil {
		return nil, err
	}
	resolvedAt := resolution.ResolvedAt
	next := *record
	next.Status = status
	next.ResolvedAt = &resolvedAt
	next.SourceEventIDs = appendUniqueStrings(record.SourceEventIDs, event.ID)
	if err := ValidateApprovalRequest(next); err != nil {
		return nil, err
	}
	*record = next
	delete(workstream.unresolvedApprovals, resolution.ApprovalID)
	return []registryEffect{{kind: effectApproval, id: resolution.ApprovalID}}, nil
}

// declareArtifact records the result a run announced. The artifact becomes
// openable when the store durably holds it, which is its own committed fact.
func (state *registryState) declareArtifact(
	workstream *registryWorkstream,
	event conversation.TrajectoryEvent,
) ([]registryEffect, error) {
	if event.ArtifactEmitted == nil {
		return nil, missingPayload(event)
	}
	emitted := event.ArtifactEmitted
	if record, exists := state.artifacts[emitted.ArtifactID]; exists {
		next := *record
		next.SourceEventIDs = appendUniqueStrings(record.SourceEventIDs, event.ID)
		next.UpdatedAt = laterTimestamp(record.UpdatedAt, event.EmittedAt)
		if err := ValidateWorkstreamArtifact(next); err != nil {
			return nil, err
		}
		*record = next
		return []registryEffect{{kind: effectArtifact, id: emitted.ArtifactID}}, nil
	}
	record := &WorkstreamArtifact{
		ID:             emitted.ArtifactID,
		WorkstreamID:   workstream.record.ID,
		RunID:          copyOptionalString(event.TurnID),
		Kind:           emitted.Kind,
		Status:         ArtifactStatusDeclared,
		Title:          emitted.Title,
		SourceEventIDs: []string{event.ID},
		CreatedAt:      event.EmittedAt,
		UpdatedAt:      event.EmittedAt,
	}
	if err := ValidateWorkstreamArtifact(*record); err != nil {
		return nil, err
	}
	state.addArtifact(workstream, record)
	return []registryEffect{{kind: effectArtifact, id: record.ID}}, nil
}

// applyArtifactCreated marks an artifact durable. Only an artifact Setta holds
// can be opened, so availability is a separate fact from the declaration.
func (state *registryState) applyArtifactCreated(event conversation.CommittedEvent) ([]registryEffect, error) {
	payload, err := decodeCommittedPayload[conversation.ConversationArtifactCreatedEventPayload](event)
	if err != nil {
		return nil, err
	}
	metadata := payload.Artifact
	workstream, err := state.workstreamForConversation(metadata.ConversationID)
	if err != nil {
		return nil, err
	}
	record, exists := state.artifacts[metadata.ID]
	if !exists {
		record = &WorkstreamArtifact{
			ID:           metadata.ID,
			WorkstreamID: workstream.record.ID,
			RunID:        copyOptionalString(metadata.TurnID),
			Kind:         metadata.Kind,
			Status:       ArtifactStatusAvailable,
			Title:        metadata.Title,
			CreatedAt:    metadata.CreatedAt,
			UpdatedAt:    metadata.CreatedAt,
		}
	}
	next := *record
	next.Status = ArtifactStatusAvailable
	next.SourceEventIDs = appendUniqueStrings(record.SourceEventIDs, event.ID)
	next.UpdatedAt = laterTimestamp(record.UpdatedAt, event.CommittedAt)
	if err := artifactLifecycle.validateTransition(record.Status, next.Status); err != nil {
		return nil, err
	}
	if err := ValidateWorkstreamArtifact(next); err != nil {
		return nil, err
	}
	if exists {
		*record = next
	} else {
		*record = next
		state.addArtifact(workstream, record)
	}
	if err := state.refreshWorkstream(workstream, event.CommittedAt); err != nil {
		return nil, err
	}
	return []registryEffect{
		{kind: effectArtifact, id: record.ID},
		{kind: effectWorkstream, id: workstream.record.ID},
	}, nil
}

func (state *registryState) addArtifact(workstream *registryWorkstream, record *WorkstreamArtifact) {
	state.artifacts[record.ID] = record
	state.artifactOrder = append(state.artifactOrder, record.ID)
	workstream.artifactIDs = append(workstream.artifactIDs, record.ID)
}

// applyDirectorFact folds the app-scoped facts no conversation can own.
func (state *registryState) applyDirectorFact(event conversation.CommittedEvent) ([]registryEffect, error) {
	fact, err := DecodeDirectorFact(event)
	if err != nil {
		return nil, err
	}
	if fact.Kind == DirectorFactWorkstreamRegistered {
		return nil, fmt.Errorf(
			"director fact %s registers workstream %s, which the registry derives from the conversation record",
			fact.ID,
			fact.WorkstreamID,
		)
	}
	workstream, known := state.workstreams[fact.WorkstreamID]
	if !known {
		return nil, fmt.Errorf("director fact %s names unregistered workstream %s", fact.ID, fact.WorkstreamID)
	}
	if err := state.ensureProjected(workstream); err != nil {
		return nil, err
	}
	if err := state.applyProjectorEvent(ProjectorEvent{Director: &fact}); err != nil {
		return nil, err
	}
	effects, err := state.collectGraphChanges()
	if err != nil {
		return nil, err
	}
	factEffects, err := state.applyDirectorFactRecords(workstream, fact)
	if err != nil {
		return nil, err
	}
	effects = append(effects, factEffects...)
	if err := state.refreshWorkstream(workstream, directorFactChangedAt(workstream, fact)); err != nil {
		return nil, err
	}
	return append(effects, registryEffect{kind: effectWorkstream, id: workstream.record.ID}), nil
}

// directorFactChangedAt is when the fact changed the workstream's own work.
// Selection is the exception: it changes which workstream the app is showing,
// not the work. Stamping it would make the selected workstream the most recently
// changed one, so the recency-ordered list the user navigates would reshuffle
// under every selection — including the one the keystroke just made.
func directorFactChangedAt(workstream *registryWorkstream, fact DirectorFactEvent) string {
	if fact.Kind == DirectorFactWorkstreamSelected {
		return workstream.record.UpdatedAt
	}
	return fact.EmittedAt
}

func (state *registryState) applyDirectorFactRecords(
	workstream *registryWorkstream,
	fact DirectorFactEvent,
) ([]registryEffect, error) {
	switch fact.Kind {
	case DirectorFactWorkstreamSelected:
		selected := fact.WorkstreamID
		state.selected = &selected
		return []registryEffect{{kind: effectSelection, id: selected}}, nil
	case DirectorFactWorkstreamResourceBound:
		return state.bindWorkstreamResource(workstream, fact)
	case DirectorFactDecisionCommitted:
		state.recordCommittedDecision(fact)
		return nil, nil
	case DirectorFactRecoveryAttempted:
		workstream.resolveRunFailure(fact.RecoveryAttempted.FailureEventID)
		return nil, nil
	case DirectorFactResourceRequestOpened:
		return state.openResourceRequest(workstream, fact)
	case DirectorFactResourceRequestResolved:
		return state.resolveResourceRequest(workstream, fact)
	default:
		return nil, nil
	}
}

// bindWorkstreamResource attaches a resource the user supplied. A folderless
// workstream that gains a folder is still the same workstream: the binding
// changes what it can reach, not which work it is.
func (state *registryState) bindWorkstreamResource(
	workstream *registryWorkstream,
	fact DirectorFactEvent,
) ([]registryEffect, error) {
	binding := fact.WorkstreamResourceBound.Binding
	if binding.Kind != WorkstreamResourceKindFolder {
		return nil, fmt.Errorf("director fact %s binds an unknown resource kind %q", fact.ID, binding.Kind)
	}
	workstream.record.ResourceScope = WorkstreamResourceScope{
		Kind:   WorkstreamResourceScopeFolder,
		Folder: binding.Folder,
	}
	workstream.record.ResourceBindings = append(workstream.record.ResourceBindings, binding)
	return nil, nil
}

func (state *registryState) openResourceRequest(
	workstream *registryWorkstream,
	fact DirectorFactEvent,
) ([]registryEffect, error) {
	payload := fact.ResourceRequestOpened
	if _, exists := state.resources[payload.RequestID]; exists {
		return nil, fmt.Errorf("resource request %s was opened twice", payload.RequestID)
	}
	record := &ResourceRequest{
		ID:             payload.RequestID,
		WorkstreamID:   workstream.record.ID,
		RunID:          copyOptionalString(fact.RunID),
		Kind:           payload.Kind,
		Status:         ResourceRequestStatusRequested,
		PublicSummary:  payload.PublicSummary,
		SourceEventIDs: []string{fact.ID},
		RequestedAt:    fact.EmittedAt,
	}
	if err := ValidateResourceRequest(*record); err != nil {
		return nil, err
	}
	state.resources[payload.RequestID] = record
	state.resourceOrder = append(state.resourceOrder, payload.RequestID)
	workstream.unresolvedResources[payload.RequestID] = true
	return []registryEffect{{kind: effectResource, id: payload.RequestID}}, nil
}

func (state *registryState) resolveResourceRequest(
	workstream *registryWorkstream,
	fact DirectorFactEvent,
) ([]registryEffect, error) {
	payload := fact.ResourceRequestResolved
	record, exists := state.resources[payload.RequestID]
	if !exists {
		return nil, fmt.Errorf("resource request %s resolved before it was opened", payload.RequestID)
	}
	if err := resourceRequestLifecycle.validateTransition(record.Status, payload.Status); err != nil {
		return nil, err
	}
	resolvedAt := fact.EmittedAt
	next := *record
	next.Status = payload.Status
	next.ResolvedBinding = payload.Binding
	next.ResolvedAt = &resolvedAt
	next.SourceEventIDs = appendUniqueStrings(record.SourceEventIDs, fact.ID)
	if err := ValidateResourceRequest(next); err != nil {
		return nil, err
	}
	*record = next
	delete(workstream.unresolvedResources, payload.RequestID)
	return []registryEffect{{kind: effectResource, id: payload.RequestID}}, nil
}

func hasSecretQuestion(questions []conversation.TrajectoryApprovalQuestion) bool {
	for _, question := range questions {
		if question.Secret {
			return true
		}
	}
	return false
}
