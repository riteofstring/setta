package semanticgraph

import (
	"context"
	"fmt"
	"strings"
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

func (service *Service) validateCartographerAutomaticNodeConnectionPolicy(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, patch CartographerPatch, newNodeSignatures map[string]int, edgeConnectedNodeIDs map[string]bool, index int, now string) []CartographerDiagnostic {
	nodeID, ok := cartographerPatchAutomaticPolicyNodeID(patch)
	if !ok {
		return nil
	}
	node := *patch.Payload.NewNode
	diagnostics := []CartographerDiagnostic{}
	diagnostics = append(diagnostics, service.cartographerAutomaticNodeTextDiagnostics(input, patch, node, index, now)...)
	diagnostics = append(diagnostics, service.cartographerAutomaticNodeUsefulnessDiagnostics(input, patch, node, index, now)...)
	diagnostics = append(diagnostics, service.cartographerAutomaticNodeRepeatDiagnostics(ctx, input, patch, node, newNodeSignatures, index, now)...)
	evidenceDiagnostics, hasConcreteEvidence, evidenceOK := service.cartographerAutomaticNodeEvidenceDiagnostics(ctx, input, patch, index, now)
	diagnostics = append(diagnostics, evidenceDiagnostics...)
	if evidenceOK {
		diagnostics = append(diagnostics, service.cartographerAutomaticNodeIsolationDiagnostics(input, patch, node, nodeID, edgeConnectedNodeIDs, hasConcreteEvidence, index, now)...)
	}
	return diagnostics
}

func (service *Service) cartographerAutomaticNodeUsefulnessDiagnostics(input CartographerPatchEnvelopeApplicationInput, patch CartographerPatch, node CartographerPatchNewNode, index int, now string) []CartographerDiagnostic {
	if !cartographerNewNodeHasSpecificUsefulness(node) {
		return []CartographerDiagnostic{service.cartographerAutomaticNodePolicyDiagnostic(
			input,
			patch,
			"node_usefulness_insufficient",
			"cartographer auto-applied node patches require public whyItExists and futureUse text that adds durable value beyond the label and summary",
			fmt.Sprintf("$.patches[%d].payload.newNode", index),
			now,
		)}
	}
	return nil
}

func (service *Service) cartographerAutomaticNodeTextDiagnostics(input CartographerPatchEnvelopeApplicationInput, patch CartographerPatch, node CartographerPatchNewNode, index int, now string) []CartographerDiagnostic {
	if !cartographerNewNodeHasSpecificText(node) {
		return []CartographerDiagnostic{service.cartographerAutomaticNodePolicyDiagnostic(
			input,
			patch,
			"node_too_generic",
			"cartographer auto-applied node patches require a specific label and a summary that adds detail beyond the label",
			fmt.Sprintf("$.patches[%d].payload.newNode", index),
			now,
		)}
	}
	return nil
}

func (service *Service) cartographerAutomaticNodeRepeatDiagnostics(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, patch CartographerPatch, node CartographerPatchNewNode, newNodeSignatures map[string]int, index int, now string) []CartographerDiagnostic {
	diagnostics := []CartographerDiagnostic{}
	repeatsKnownNode, err := service.cartographerNewNodeRepeatsKnownNode(ctx, input.WorkspaceID, input.InputBundle, node, newNodeSignatures)
	if err != nil {
		diagnostics = append(diagnostics, service.cartographerAutomaticNodePolicyDiagnostic(
			input,
			patch,
			"repeat_check_failed",
			err.Error(),
			fmt.Sprintf("$.patches[%d].payload.newNode", index),
			now,
		))
	}
	if repeatsKnownNode {
		diagnostics = append(diagnostics, service.cartographerAutomaticNodePolicyDiagnostic(
			input,
			patch,
			"repeated_process_note",
			"cartographer auto-applied node patches must not repeat an existing or same-envelope node label and summary",
			fmt.Sprintf("$.patches[%d].payload.newNode", index),
			now,
		))
	}
	return diagnostics
}

func (service *Service) cartographerAutomaticNodeEvidenceDiagnostics(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, patch CartographerPatch, index int, now string) ([]CartographerDiagnostic, bool, bool) {
	hasConcreteEvidence, err := service.cartographerPatchHasConcreteNodeEvidence(ctx, input.WorkspaceID, patch)
	if err != nil {
		return []CartographerDiagnostic{service.cartographerAutomaticNodePolicyDiagnostic(input, patch, "missing_evidence", err.Error(), fmt.Sprintf("$.patches[%d].evidenceRefs", index), now)}, false, false
	}
	if !hasConcreteEvidence {
		return []CartographerDiagnostic{service.cartographerAutomaticNodePolicyDiagnostic(
			input,
			patch,
			"source_evidence_insufficient",
			"cartographer auto-applied node patches require granular evidence from chat_message, run_item, file_range, diff, test, workflow_node, or a specific log/document source",
			fmt.Sprintf("$.patches[%d].evidenceRefs", index),
			now,
		)}, false, true
	}
	return nil, true, true
}

func (service *Service) cartographerAutomaticNodeIsolationDiagnostics(input CartographerPatchEnvelopeApplicationInput, patch CartographerPatch, node CartographerPatchNewNode, nodeID string, edgeConnectedNodeIDs map[string]bool, hasConcreteEvidence bool, index int, now string) []CartographerDiagnostic {
	diagnostics := []CartographerDiagnostic{}
	if !hasConcreteEvidence && !edgeConnectedNodeIDs[nodeID] {
		diagnostics = append(diagnostics, service.cartographerAutomaticNodePolicyDiagnostic(
			input,
			patch,
			"isolated_node",
			"cartographer auto-applied node patches require a source link or a same-envelope semantic edge",
			fmt.Sprintf("$.patches[%d].payload.newNode.semanticNodeId", index),
			now,
		))
	}
	if input.TriggerKind == CartographerTriggerWorkflowDone && node.Scope == CartographerPatchNodeScopeSession && !edgeConnectedNodeIDs[nodeID] {
		diagnostics = append(diagnostics, service.cartographerAutomaticNodePolicyDiagnostic(
			input,
			patch,
			"final_synthesis_isolated_session_node",
			"workflow_done final synthesis must connect session-scoped nodes with a semantic edge or leave the patch pending review",
			fmt.Sprintf("$.patches[%d].payload.newNode.semanticNodeId", index),
			now,
		))
	}
	return diagnostics
}

func (service *Service) cartographerAutomaticNodePolicyDiagnostic(input CartographerPatchEnvelopeApplicationInput, patch CartographerPatch, code string, message string, path string, now string) CartographerDiagnostic {
	return service.newCartographerDiagnostic(input.RunID, patch.ID, CartographerDiagnosticError, code, message, path, now)
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

func cartographerNewNodeHasSpecificText(node CartographerPatchNewNode) bool {
	label := normalizedCartographerNodeText(node.Label)
	summary := normalizedCartographerNodeText(node.Summary)
	if label == "" || summary == "" || label == summary {
		return false
	}
	if label == string(node.Kind) {
		return false
	}
	if cartographerNodeLabelIsGenericProcessNote(label) {
		return false
	}
	return len(strings.Fields(label)) >= 2 && len(strings.Fields(summary)) >= 4
}

func cartographerNewNodeHasSpecificUsefulness(node CartographerPatchNewNode) bool {
	label := normalizedCartographerNodeText(node.Label)
	summary := normalizedCartographerNodeText(node.Summary)
	why := normalizedCartographerNodeText(node.WhyItExists)
	future := normalizedCartographerNodeText(node.FutureUse)
	if why == "" || future == "" {
		return false
	}
	if why == label || why == summary || future == label || future == summary || future == why {
		return false
	}
	return len(strings.Fields(why)) >= 5 && len(strings.Fields(future)) >= 5
}

func cartographerNodeLabelIsGenericProcessNote(label string) bool {
	switch label {
	case "process completed",
		"result recorded",
		"task completed",
		"workflow completed",
		"workflow result recorded",
		"work completed":
		return true
	default:
		return false
	}
}

func (service *Service) cartographerNewNodeRepeatsKnownNode(ctx context.Context, workspaceID string, bundle CartographerInputBundle, node CartographerPatchNewNode, newNodeSignatures map[string]int) (bool, error) {
	signature := cartographerNewNodeSignature(node)
	if signature == "" {
		return false, nil
	}
	if newNodeSignatures[signature] > 1 {
		return true, nil
	}
	for _, existing := range bundle.ExistingNodes {
		if cartographerExistingNodeSignature(existing) == signature {
			return true, nil
		}
	}
	stored, err := service.store.loadSemanticNodes(ctx, workspaceID, "kind = ?", []any{string(node.Kind)})
	if err != nil {
		return false, fmt.Errorf("check existing semantic nodes for repeated cartographer node: %w", err)
	}
	for _, existing := range stored {
		if cartographerExistingNodeSignature(existing) == signature {
			return true, nil
		}
	}
	return false, nil
}

func cartographerPatchNewNodes(patch CartographerPatch) []CartographerPatchNewNode {
	nodes := []CartographerPatchNewNode{}
	if patch.Payload.NewNode != nil {
		nodes = append(nodes, *patch.Payload.NewNode)
	}
	if patch.Payload.TargetNode != nil {
		nodes = append(nodes, *patch.Payload.TargetNode)
	}
	nodes = append(nodes, patch.Payload.NewNodes...)
	return nodes
}

func cartographerNewNodeSignature(node CartographerPatchNewNode) string {
	label := normalizedCartographerNodeText(node.Label)
	summary := normalizedCartographerNodeText(node.Summary)
	if label == "" || summary == "" {
		return ""
	}
	return string(node.Kind) + "\n" + label + "\n" + summary
}

func cartographerExistingNodeSignature(node SemanticNode) string {
	label := normalizedCartographerNodeText(node.Label)
	summary := normalizedCartographerNodeText(node.Summary)
	if label == "" || summary == "" {
		return ""
	}
	return string(node.Kind) + "\n" + label + "\n" + summary
}

func normalizedCartographerNodeText(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
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
