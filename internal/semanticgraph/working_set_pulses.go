package semanticgraph

import (
	"fmt"
	"sort"
)

type SemanticWorkingSetPulse struct {
	ID                  string                       `json:"id"`
	Kind                SemanticWorkingSetPulseKind  `json:"kind"`
	Status              SemanticWorkingSetStatus     `json:"status"`
	ActivityKind        SemanticActivityKind         `json:"activityKind"`
	TriggerKind         CartographerRunTriggerKind   `json:"triggerKind"`
	SourceRefs          SemanticContextSourceRefs    `json:"sourceRefs"`
	TargetEntityID      string                       `json:"targetEntityId"`
	RunID               string                       `json:"runId"`
	WindowID            string                       `json:"windowId"`
	PatchID             string                       `json:"patchId"`
	SemanticNodeIDs     []string                     `json:"semanticNodeIds"`
	SemanticEdgeIDs     []string                     `json:"semanticEdgeIds"`
	EvidenceAnchorIDs   []string                     `json:"evidenceAnchorIds"`
	PatchOperationNames []CartographerPatchOperation `json:"patchOperationNames"`
	PublicSummary       string                       `json:"publicSummary"`
	Diagnostics         []CartographerDiagnostic     `json:"diagnostics"`
	OccurredAt          string                       `json:"occurredAt"`
	UpdatedAt           string                       `json:"updatedAt"`
}

func (builder *semanticWorkingSetBuilder) recordActiveWorkflowSourcePulse(prefix string, id string, status SemanticWorkingSetStatus, trigger CartographerRunTriggerKind, refs SemanticContextSourceRefs, targetEntityID string, runID string, windowID string, patchID string, changedNodeIDs []string, changedEdgeIDs []string, operations []CartographerPatchOperation, summary string, diagnostics []CartographerDiagnostic, occurredAt string, updatedAt string) {
	if refs.WorkflowNodeID == "" && refs.RunItemID == "" {
		return
	}
	builder.recordPulse(WorkingSetPulseActiveWorkflowSource, prefix+":"+id, status, ActivityKindExploring, trigger, refs, targetEntityID, runID, windowID, patchID, changedNodeIDs, changedEdgeIDs, nil, operations, summary, diagnostics, occurredAt, updatedAt)
}

func (builder *semanticWorkingSetBuilder) recordAppliedPatchPulses(patch CartographerPatchRecord, run CartographerRun, targetEntityID string, changedNodeIDs []string, changedEdgeIDs []string, operations []CartographerPatchOperation, diagnostics []CartographerDiagnostic, updatedAt string) {
	evidenceAnchorIDs := semanticWorkingSetPatchEvidenceAnchorIDs(patch.Patch)
	switch patch.Patch.Operation {
	case CartographerPatchAttachEvidence:
		builder.recordPulse(WorkingSetPulseEvidenceAttached, "patch:"+patch.ID, WorkingSetStatusApplied, ActivityKindValidating, run.TriggerKind, patch.Patch.SourceRefs, targetEntityID, patch.RunID, patch.WindowID, patch.ID, changedNodeIDs, changedEdgeIDs, evidenceAnchorIDs, operations, patch.Patch.PublicSummary, diagnostics, patch.AppliedAt, updatedAt)
	case CartographerPatchCreateEdge:
		builder.recordPulse(WorkingSetPulseEdgeCreated, "patch:"+patch.ID, WorkingSetStatusApplied, ActivityKindValidating, run.TriggerKind, patch.Patch.SourceRefs, targetEntityID, patch.RunID, patch.WindowID, patch.ID, changedNodeIDs, changedEdgeIDs, evidenceAnchorIDs, operations, patch.Patch.PublicSummary, diagnostics, patch.AppliedAt, updatedAt)
	default:
		builder.recordPulse(WorkingSetPulseNodeUpdatedRecent, "patch:"+patch.ID, WorkingSetStatusApplied, ActivityKindValidating, run.TriggerKind, patch.Patch.SourceRefs, targetEntityID, patch.RunID, patch.WindowID, patch.ID, changedNodeIDs, changedEdgeIDs, evidenceAnchorIDs, operations, patch.Patch.PublicSummary, diagnostics, patch.AppliedAt, updatedAt)
	}
}

func (builder *semanticWorkingSetBuilder) addGraphRecencyPulses(graph SemanticGraph) {
	for _, node := range graph.Nodes {
		builder.recordPulse(WorkingSetPulseNodeUpdatedRecent, "node:"+node.ID+":"+node.UpdatedByEventID, WorkingSetStatusApplied, ActivityKindValidating, "", SemanticContextSourceRefs{}, node.ID, "", "", "", []string{node.ID}, nil, nil, nil, node.Summary, nil, node.UpdatedAt, node.UpdatedAt)
	}
	for _, anchor := range graph.SourceLinks {
		builder.recordPulse(WorkingSetPulseEvidenceAttached, "evidence:"+anchor.ID, WorkingSetStatusApplied, ActivityKindValidating, "", semanticWorkingSetSourceRefsFromEvidence(anchor), anchor.TargetEntityID, "", "", "", []string{anchor.TargetEntityID}, nil, []string{anchor.ID}, nil, anchor.Summary, nil, anchor.CreatedAt, anchor.CreatedAt)
	}
	for _, edge := range graph.Edges {
		builder.recordPulse(WorkingSetPulseEdgeCreated, "edge:"+edge.ID, WorkingSetStatusApplied, ActivityKindValidating, "", SemanticContextSourceRefs{}, edge.ToNodeID, "", "", "", []string{edge.FromNodeID, edge.ToNodeID}, []string{edge.ID}, nil, nil, firstNonEmpty(edge.Summary, edge.Label), nil, edge.CreatedAt, edge.UpdatedAt)
	}
}

func (builder *semanticWorkingSetBuilder) recordPulse(kind SemanticWorkingSetPulseKind, id string, status SemanticWorkingSetStatus, activityKind SemanticActivityKind, trigger CartographerRunTriggerKind, refs SemanticContextSourceRefs, targetEntityID string, runID string, windowID string, patchID string, semanticNodeIDs []string, semanticEdgeIDs []string, evidenceAnchorIDs []string, operations []CartographerPatchOperation, summary string, diagnostics []CartographerDiagnostic, occurredAt string, updatedAt string) {
	if kind == "" || id == "" {
		return
	}
	if activityKind == "" {
		activityKind = semanticWorkingSetActivityKindForStatus(status)
	}
	if trigger == "" {
		trigger = CartographerTriggerManual
	}
	if updatedAt == "" {
		updatedAt = occurredAt
	}
	if occurredAt == "" {
		occurredAt = updatedAt
	}
	nodeIDs := append([]string{}, semanticNodeIDs...)
	nodeIDs = appendIfNonEmpty(nodeIDs, targetEntityID)
	pulseID := fmt.Sprintf("semantic-working-set-pulse:%s:%s", kind, id)
	builder.pulsesByID[pulseID] = SemanticWorkingSetPulse{
		ID:                  pulseID,
		Kind:                kind,
		Status:              status,
		ActivityKind:        activityKind,
		TriggerKind:         trigger,
		SourceRefs:          refs,
		TargetEntityID:      targetEntityID,
		RunID:               runID,
		WindowID:            windowID,
		PatchID:             patchID,
		SemanticNodeIDs:     uniqueSortedStrings(nodeIDs),
		SemanticEdgeIDs:     uniqueSortedStrings(semanticEdgeIDs),
		EvidenceAnchorIDs:   uniqueSortedStrings(evidenceAnchorIDs),
		PatchOperationNames: uniqueCartographerPatchOperations(operations),
		PublicSummary:       summary,
		Diagnostics:         nonNilSlice(diagnostics),
		OccurredAt:          occurredAt,
		UpdatedAt:           updatedAt,
	}
}

func (builder *semanticWorkingSetBuilder) finishPulses() {
	pulses := make([]SemanticWorkingSetPulse, 0, len(builder.pulsesByID))
	for _, pulse := range builder.pulsesByID {
		pulses = append(pulses, pulse)
	}
	sort.Slice(pulses, func(left int, right int) bool {
		leftPulse := pulses[left]
		rightPulse := pulses[right]
		if semanticWorkingSetPulsePriority(leftPulse) != semanticWorkingSetPulsePriority(rightPulse) {
			return semanticWorkingSetPulsePriority(leftPulse) > semanticWorkingSetPulsePriority(rightPulse)
		}
		if leftPulse.UpdatedAt != rightPulse.UpdatedAt {
			return leftPulse.UpdatedAt > rightPulse.UpdatedAt
		}
		return leftPulse.ID < rightPulse.ID
	})
	if len(pulses) > builder.filter.Limit {
		pulses = pulses[:builder.filter.Limit]
	}
	builder.workingSet.Pulses = pulses
}

func semanticWorkingSetPulsePriority(pulse SemanticWorkingSetPulse) int {
	if semanticWorkingSetStatusIsActive(pulse.Status) {
		return 1000 + semanticWorkingSetStatusRank(pulse.Status)
	}
	switch pulse.Kind {
	case WorkingSetPulseNodeUpdatedRecent, WorkingSetPulseEvidenceAttached, WorkingSetPulseEdgeCreated:
		return 500 + semanticWorkingSetPulseKindRank(pulse.Kind)
	default:
		return semanticWorkingSetPulseKindRank(pulse.Kind)
	}
}

func semanticWorkingSetPulseKindRank(kind SemanticWorkingSetPulseKind) int {
	switch kind {
	case WorkingSetPulsePatchProposed:
		return 70
	case WorkingSetPulseCartographerRunning:
		return 60
	case WorkingSetPulseCartographerObserving:
		return 50
	case WorkingSetPulseActiveWorkflowSource:
		return 40
	case WorkingSetPulseEdgeCreated:
		return 30
	case WorkingSetPulseEvidenceAttached:
		return 20
	case WorkingSetPulseNodeUpdatedRecent:
		return 10
	default:
		return 0
	}
}

func semanticWorkingSetPatchEvidenceAnchorIDs(patch CartographerPatch) []string {
	anchorIDs := []string{patch.Payload.EvidenceAnchorID}
	for _, ref := range patch.EvidenceRefs {
		anchorIDs = append(anchorIDs, ref.EvidenceAnchorID)
	}
	for _, ref := range patch.Payload.EvidenceRefs {
		anchorIDs = append(anchorIDs, ref.EvidenceAnchorID)
	}
	if patch.Payload.NewNode != nil {
		for _, ref := range patch.Payload.NewNode.EvidenceRefs {
			anchorIDs = append(anchorIDs, ref.EvidenceAnchorID)
		}
	}
	if patch.Payload.TargetNode != nil {
		for _, ref := range patch.Payload.TargetNode.EvidenceRefs {
			anchorIDs = append(anchorIDs, ref.EvidenceAnchorID)
		}
	}
	for _, node := range patch.Payload.NewNodes {
		for _, ref := range node.EvidenceRefs {
			anchorIDs = append(anchorIDs, ref.EvidenceAnchorID)
		}
	}
	return uniqueSortedStrings(anchorIDs)
}

func semanticWorkingSetSourceRefsFromEvidence(anchor SemanticEvidenceAnchor) SemanticContextSourceRefs {
	return SemanticContextSourceRefs{
		WorkflowDefinitionID:    anchor.WorkflowDefinitionID,
		WorkflowExecutionID:     anchor.WorkflowExecutionID,
		WorkflowNodeID:          anchor.WorkflowNodeID,
		WorkflowNodeExecutionID: anchor.WorkflowNodeExecutionID,
		ChatConversationID:      anchor.ChatConversationID,
		ChatRunID:               anchor.ChatRunID,
		ChatMessageID:           anchor.ChatMessageID,
		RunItemID:               anchor.RunItemID,
	}
}
