package semanticgraph

import (
	"context"
	"fmt"
)

func collectCartographerEnvelopeEdgeConnectedNodeIDs(envelope CartographerPatchEnvelope) map[string]bool {
	ids := map[string]bool{}
	for _, patch := range envelope.Patches {
		switch patch.Operation {
		case CartographerPatchCreateEdge:
			appendCartographerEnvelopeEdgeEndpoint(ids, patch.Payload.FromNodeID)
			appendCartographerEnvelopeEdgeEndpoint(ids, patch.Payload.ToNodeID)
		case CartographerPatchMarkResolved:
			appendCartographerEnvelopeEdgeEndpoint(ids, patch.Payload.SemanticNodeID)
			appendCartographerEnvelopeEdgeEndpoint(ids, patch.Payload.ResolutionNodeID)
		}
	}
	return ids
}

func appendCartographerEnvelopeEdgeEndpoint(ids map[string]bool, nodeID string) {
	if nodeID != "" {
		ids[nodeID] = true
	}
}

func (service *Service) validateCartographerAutomaticNodeConnectionPolicy(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, patch CartographerPatch, edgeConnectedNodeIDs map[string]bool, index int, now string) []CartographerDiagnostic {
	nodeID, ok := cartographerPatchAutomaticPolicyNodeID(patch)
	if !ok {
		return nil
	}
	diagnostics := []CartographerDiagnostic{}
	add := func(code string, message string, path string) {
		diagnostics = append(diagnostics, service.newCartographerDiagnostic(input.RunID, patch.ID, CartographerDiagnosticError, code, message, path, now))
	}
	hasConcreteEvidence, err := service.cartographerPatchHasConcreteNodeEvidence(ctx, input.WorkspaceID, patch)
	if err != nil {
		add("missing_evidence", err.Error(), fmt.Sprintf("$.patches[%d].evidenceRefs", index))
		return diagnostics
	}
	if !hasConcreteEvidence {
		add(
			"source_evidence_insufficient",
			"cartographer auto-applied node patches require granular evidence from chat_message, run_item, file_range, diff, test, workflow_node, or a specific log/document source",
			fmt.Sprintf("$.patches[%d].evidenceRefs", index),
		)
	}
	if !hasConcreteEvidence && !edgeConnectedNodeIDs[nodeID] {
		add(
			"isolated_node",
			"cartographer auto-applied node patches require a source link or a same-envelope semantic edge",
			fmt.Sprintf("$.patches[%d].payload.newNode.semanticNodeId", index),
		)
	}
	return diagnostics
}

func cartographerPatchAutomaticPolicyNodeID(patch CartographerPatch) (string, bool) {
	if !cartographerPatchCanAutoApplyByMetadata(patch) || !cartographerPatchIsLowImpactOperation(patch.Operation) {
		return "", false
	}
	if patch.Payload.NewNode == nil {
		return "", false
	}
	return patch.Payload.NewNode.SemanticNodeID, patch.Payload.NewNode.SemanticNodeID != ""
}

func cartographerPatchCanAutoApplyByMetadata(patch CartographerPatch) bool {
	return !patch.ReviewRequired && patch.Confidence != nil && *patch.Confidence >= cartographerAutoApplyConfidenceThreshold
}

func (service *Service) cartographerPatchHasConcreteNodeEvidence(ctx context.Context, workspaceID string, patch CartographerPatch) (bool, error) {
	for _, ref := range cartographerPatchAllEvidenceRefs(patch) {
		ok, err := service.cartographerPatchEvidenceRefIsConcreteSource(ctx, workspaceID, ref)
		if err != nil || ok {
			return ok, err
		}
	}
	return false, nil
}

func (service *Service) cartographerPatchEvidenceRefIsConcreteSource(ctx context.Context, workspaceID string, ref CartographerPatchEvidenceRef) (bool, error) {
	if ref.EvidenceAnchorID != "" {
		anchor, ok, err := service.store.loadSemanticEvidenceAnchorByID(ctx, workspaceID, ref.EvidenceAnchorID)
		if err != nil || !ok {
			if err != nil {
				return false, err
			}
			return false, fmt.Errorf("semantic evidence anchor %s does not exist", ref.EvidenceAnchorID)
		}
		return semanticEvidenceAnchorIsConcreteAutoSource(anchor), nil
	}
	return semanticEvidenceSourceRefIsConcreteAutoSource(ref.SourceKind, ref.SourceID), nil
}

func semanticEvidenceAnchorIsConcreteAutoSource(anchor SemanticEvidenceAnchor) bool {
	if semanticEvidenceSourceRefIsConcreteAutoSource(anchor.SourceKind, anchor.SourceID) {
		return true
	}
	switch anchor.SourceKind {
	case EvidenceSourceLog, EvidenceSourceDocument:
		return anchor.URI != "" || anchor.Path != "" || anchor.ContentHash != ""
	default:
		return false
	}
}

func semanticEvidenceSourceRefIsConcreteAutoSource(kind SemanticEvidenceSourceKind, sourceID string) bool {
	if sourceID == "" {
		return false
	}
	switch kind {
	case EvidenceSourceChatMessage,
		EvidenceSourceRunItem,
		EvidenceSourceFileRange,
		EvidenceSourceDiff,
		EvidenceSourceTest,
		EvidenceSourceWorkflowNode:
		return true
	default:
		return false
	}
}

func cartographerEvidencePayloadFromSourceRef(anchorID string, targetEntityID string, ref CartographerPatchEvidenceRef, patch CartographerPatch) evidenceAttachedPayload {
	payload := evidenceAttachedPayload{
		AnchorID:                anchorID,
		TargetEntityID:          targetEntityID,
		SourceKind:              ref.SourceKind,
		SourceID:                ref.SourceID,
		Summary:                 patch.PublicSummary,
		WorkflowDefinitionID:    patch.SourceRefs.WorkflowDefinitionID,
		WorkflowExecutionID:     patch.SourceRefs.WorkflowExecutionID,
		WorkflowNodeID:          patch.SourceRefs.WorkflowNodeID,
		WorkflowNodeExecutionID: patch.SourceRefs.WorkflowNodeExecutionID,
		ChatConversationID:      patch.SourceRefs.ChatConversationID,
		ChatRunID:               patch.SourceRefs.ChatRunID,
		ChatMessageID:           patch.SourceRefs.ChatMessageID,
		RunItemID:               patch.SourceRefs.RunItemID,
	}
	switch ref.SourceKind {
	case EvidenceSourceWorkflowExecution:
		payload.WorkflowExecutionID = firstNonEmpty(payload.WorkflowExecutionID, ref.SourceID)
	case EvidenceSourceWorkflowNode:
		payload.WorkflowNodeID = firstNonEmpty(payload.WorkflowNodeID, ref.SourceID)
	case EvidenceSourceChatRun:
		payload.ChatRunID = firstNonEmpty(payload.ChatRunID, ref.SourceID)
	case EvidenceSourceChatMessage:
		payload.ChatMessageID = firstNonEmpty(payload.ChatMessageID, ref.SourceID)
	case EvidenceSourceRunItem, EvidenceSourceFileRange, EvidenceSourceDiff, EvidenceSourceTest:
		payload.RunItemID = firstNonEmpty(payload.RunItemID, ref.SourceID)
	}
	return payload
}
