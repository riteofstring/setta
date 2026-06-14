package semanticgraph

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

func validateCartographerRun(ctx context.Context, run CartographerRun) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	return firstCartographerValidationError(
		func() error { return validateCartographerRunIdentity(run) },
		func() error { return validateCartographerRunInput(run) },
		func() error { return validateCartographerRunAudit(run) },
		func() error { return validateCartographerGraphUsefulnessScore(run.GraphUsefulnessScore) },
		func() error {
			return validateCartographerTimestamps("cartographer run", run.CreatedAt, run.StartedAt, run.CompletedAt, run.UpdatedAt)
		},
	)
}

func validateCartographerGraphUsefulnessScore(score CartographerGraphUsefulnessScore) error {
	values := []struct {
		label string
		value int
	}{
		{label: "cartographer graph usefulness appliedPatches", value: score.AppliedPatches},
		{label: "cartographer graph usefulness noopPatches", value: score.NoopPatches},
		{label: "cartographer graph usefulness rejectedPatches", value: score.RejectedPatches},
		{label: "cartographer graph usefulness duplicateEvidencePrevented", value: score.DuplicateEvidencePrevented},
		{label: "cartographer graph usefulness activityTargetCount", value: score.ActivityTargetCount},
		{label: "cartographer graph usefulness activityCoveredTargetCount", value: score.ActivityCoveredTargetCount},
		{label: "cartographer graph usefulness activityCoveragePercent", value: score.ActivityCoveragePercent},
		{label: "cartographer graph usefulness livePulseLatencySampleCount", value: score.LivePulseLatencySampleCount},
		{label: "cartographer graph usefulness committedUpdateLatencySampleCount", value: score.CommittedUpdateLatencySampleCount},
		{label: "cartographer graph usefulness medianSourceEventToVisibleLivePulseMs", value: score.MedianSourceEventToVisibleLivePulseMs},
		{label: "cartographer graph usefulness medianSourceEventToCommittedSemanticUpdateMs", value: score.MedianSourceEventToCommittedSemanticUpdateMs},
	}
	for _, item := range values {
		if item.value < 0 {
			return fmt.Errorf("%s must not be negative: %d", item.label, item.value)
		}
	}
	if score.ActivityCoveragePercent > 100 {
		return fmt.Errorf("cartographer graph usefulness activityCoveragePercent must not exceed 100: %d", score.ActivityCoveragePercent)
	}
	if err := validateCartographerGraphUsefulnessKindCounts(score.CreatedNodesByKind, "createdNodesByKind"); err != nil {
		return err
	}
	if err := validateCartographerGraphUsefulnessKindCounts(score.CreatedEdgesByKind, "createdEdgesByKind"); err != nil {
		return err
	}
	return validateCartographerGraphUsefulnessKindCounts(score.SourceLinksBySourceKind, "sourceLinksBySourceKind")
}

func validateCartographerGraphUsefulnessKindCounts(counts []CartographerGraphUsefulnessKindCount, label string) error {
	seen := map[string]bool{}
	for index, item := range counts {
		if err := requireNonEmpty(item.Kind, "cartographer graph usefulness "+label+" kind"); err != nil {
			return err
		}
		if item.Count < 0 {
			return fmt.Errorf("cartographer graph usefulness %s[%d] count must not be negative: %d", label, index, item.Count)
		}
		if seen[item.Kind] {
			return fmt.Errorf("cartographer graph usefulness %s contains duplicate kind %s", label, item.Kind)
		}
		seen[item.Kind] = true
	}
	return nil
}

func validateCartographerRunIdentity(run CartographerRun) error {
	if err := validateStoreIDs("workspace id", run.WorkspaceID, "cartographer run id", run.ID); err != nil {
		return err
	}
	if !isCartographerRunStatus(run.Status) {
		return fmt.Errorf("cartographer run status is unsupported: %s", run.Status)
	}
	if !isCartographerRunTriggerKind(run.TriggerKind) {
		return fmt.Errorf("cartographer run triggerKind is unsupported: %s", run.TriggerKind)
	}
	if err := requireOptionalEntityID(run.TargetEntityID, "cartographer target entity id"); err != nil {
		return err
	}
	if err := validateContextSourceRefs(run.SourceRefs, "cartographer run"); err != nil {
		return err
	}
	return nil
}

func validateCartographerRunInput(run CartographerRun) error {
	return validateCartographerInputBundle(run.InputBundle, "cartographer run input bundle")
}

func validateCartographerWindow(ctx context.Context, window CartographerWindow) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", window.WorkspaceID, "cartographer window id", window.ID, "cartographer run id", window.RunID, "cartographer source id", window.SourceID); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "cartographer cursor id", value: window.CursorID},
		{label: "cartographer summary id", value: window.SummaryID},
	}); err != nil {
		return err
	}
	if !isCartographerWindowStatus(window.Status) {
		return fmt.Errorf("cartographer window status is unsupported: %s", window.Status)
	}
	if !isCartographerSourceKind(window.SourceKind) {
		return fmt.Errorf("cartographer source kind is unsupported: %s", window.SourceKind)
	}
	if window.Sequence < 0 {
		return fmt.Errorf("cartographer window sequence must not be negative: %d", window.Sequence)
	}
	if err := validateCartographerInputBundle(window.InputBundle, "cartographer window input bundle"); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer window", window.CreatedAt, window.OpenedAt, window.ClosedAt, window.UpdatedAt)
}

func validateCartographerCursor(ctx context.Context, cursor CartographerCursor) error {
	if err := validateCartographerCursorKey(ctx, CartographerCursorKey{
		WorkspaceID:             cursor.WorkspaceID,
		WorkflowExecutionID:     cursor.WorkflowExecutionID,
		WorkflowNodeExecutionID: cursor.WorkflowNodeExecutionID,
		ChatConversationID:      cursor.ChatConversationID,
		ChatRunID:               cursor.ChatRunID,
	}); err != nil {
		return err
	}
	if err := validateStoreIDs("cartographer cursor id", cursor.ID); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "cartographer cursor last chat event stream id", value: cursor.LastChatEventStreamID},
		{label: "cartographer cursor last window id", value: cursor.LastWindowID},
	}); err != nil {
		return err
	}
	if cursor.LastChatEventSequence < 0 {
		return fmt.Errorf("cartographer cursor lastChatEventSequence must not be negative: %d", cursor.LastChatEventSequence)
	}
	if cursor.LastChatEventSequence > 0 && cursor.LastChatEventStreamID == "" {
		return errors.New("cartographer cursor lastChatEventStreamId is required when lastChatEventSequence is non-zero")
	}
	if err := validateCartographerWorkflowCursor(cursor.LastWorkflowEventCursor, "cartographer cursor lastWorkflowEventCursor"); err != nil {
		return err
	}
	if err := validateOutputOrdinalMap(cursor.LastOutputOrdinalByRunItem, "cartographer cursor lastOutputOrdinalByRunItem"); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer cursor", cursor.UpdatedAt)
}

func validateCartographerTrajectorySummary(ctx context.Context, summary CartographerTrajectorySummary) error {
	if err := validateCartographerSource(ctx, summary.WorkspaceID, summary.SourceKind, summary.SourceID); err != nil {
		return err
	}
	if err := validateStoreIDs("cartographer summary id", summary.ID, "cartographer run id", summary.RunID); err != nil {
		return err
	}
	if err := requireOptionalEntityID(summary.WindowID, "cartographer window id"); err != nil {
		return err
	}
	if err := requireNonEmpty(summary.Summary, "cartographer trajectory summary"); err != nil {
		return err
	}
	if err := validateContextSourceRefs(summary.SourceRefs, "cartographer summary"); err != nil {
		return err
	}
	if summary.ItemCount < 0 {
		return fmt.Errorf("cartographer summary itemCount must not be negative: %d", summary.ItemCount)
	}
	return validateCartographerTimestamps("cartographer summary", summary.CreatedAt)
}

func validateCartographerPatchRecord(ctx context.Context, patch CartographerPatchRecord) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", patch.WorkspaceID, "cartographer patch id", patch.ID, "cartographer run id", patch.RunID); err != nil {
		return err
	}
	if err := requireOptionalEntityID(patch.WindowID, "cartographer window id"); err != nil {
		return err
	}
	if !isCartographerPatchStatus(patch.Status) {
		return fmt.Errorf("cartographer patch status is unsupported: %s", patch.Status)
	}
	if patch.Status == CartographerPatchRejected {
		if patch.Patch.ID != patch.ID {
			return fmt.Errorf("cartographer patch patchId = %s, want %s", patch.Patch.ID, patch.ID)
		}
	} else {
		if err := validateCartographerPatch(patch.Patch, patch.ID, patch.WorkspaceID); err != nil {
			return err
		}
	}
	if err := validateCartographerValidationResult(patch.ValidationResult, patch.ID); err != nil {
		return err
	}
	if err := validateCartographerApplicationResult(patch.ApplicationResult, patch.ID); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs(optionalIDsFromStrings("cartographer created semantic event id", patch.CreatedSemanticEventIDs)); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer patch", patch.CreatedAt, patch.ValidatedAt, patch.AppliedAt)
}

func validateCartographerPatch(patch CartographerPatch, patchID string, workspaceID string) error {
	if err := validateCartographerPatchIdentity(patch, patchID, workspaceID); err != nil {
		return err
	}
	if err := validateCartographerPatchConfidence(patch); err != nil {
		return err
	}
	if err := requireNonEmpty(patch.PublicSummary, "cartographer patch public summary"); err != nil {
		return err
	}
	if containsChainOfThoughtMarker(patch.PublicSummary) {
		return errors.New("cartographer patch public summary must not contain chain-of-thought")
	}
	if !isCartographerPatchOperation(patch.Operation) {
		return fmt.Errorf("cartographer patch operation is unsupported: %s", patch.Operation)
	}
	if err := validateContextSourceRefs(patch.SourceRefs, "cartographer patch"); err != nil {
		return err
	}
	if err := validateStoreIDs("cartographer patch causation id", patch.CausationID, "cartographer patch correlation id", patch.CorrelationID); err != nil {
		return err
	}
	if patch.ModelInfo == nil {
		return errors.New("cartographer patch modelInfo must not be null")
	}
	if err := validateCartographerPatchEvidence(patch.EvidenceRefs); err != nil {
		return err
	}
	if err := validateCartographerPatchPayload(patch.Operation, patch.Payload); err != nil {
		return err
	}
	return nil
}

func validateCartographerPatchIdentity(patch CartographerPatch, patchID string, workspaceID string) error {
	if patch.ID != patchID {
		return fmt.Errorf("cartographer patch patchId = %s, want %s", patch.ID, patchID)
	}
	if patch.WorkspaceID != workspaceID {
		return fmt.Errorf("cartographer patch workspaceId = %s, want %s", patch.WorkspaceID, workspaceID)
	}
	return nil
}

func validateCartographerPatchConfidence(patch CartographerPatch) error {
	if patch.Confidence == nil {
		return errors.New("cartographer patch confidence is required")
	}
	if *patch.Confidence < 0 || *patch.Confidence > 1 {
		return fmt.Errorf("cartographer patch confidence must be between 0.0 and 1.0")
	}
	return nil
}

func validateCartographerPatchPayload(operation CartographerPatchOperation, payload CartographerPatchPayload) error {
	if err := validateCartographerPatchPayloadText(payload); err != nil {
		return err
	}
	validator, ok := cartographerPatchPayloadValidators[operation]
	if !ok {
		return fmt.Errorf("cartographer patch operation is unsupported: %s", operation)
	}
	return validator(payload)
}

var cartographerPatchPayloadValidators = map[CartographerPatchOperation]func(CartographerPatchPayload) error{
	CartographerPatchRecordFinding: func(payload CartographerPatchPayload) error {
		return validateCartographerRecordNodePayload(payload, NodeKindFinding)
	},
	CartographerPatchRecordDecision: func(payload CartographerPatchPayload) error {
		return validateCartographerRecordNodePayload(payload, NodeKindDecision)
	},
	CartographerPatchRecordConstraint: func(payload CartographerPatchPayload) error {
		return validateCartographerRecordNodePayload(payload, NodeKindConstraint)
	},
	CartographerPatchRecordOpenQuestion: func(payload CartographerPatchPayload) error {
		return validateCartographerRecordNodePayload(payload, NodeKindQuestion)
	},
	CartographerPatchUpdateNodeSummary: validateCartographerUpdateNodeSummaryPayload,
	CartographerPatchAttachEvidence:    validateCartographerAttachEvidencePayload,
	CartographerPatchCreateEdge:        validateCartographerCreateEdgePayload,
	CartographerPatchStartActivity:     validateCartographerStartActivityPayload,
	CartographerPatchEndActivity:       validateCartographerEndActivityPayload,
	CartographerPatchSplitNode:         validateCartographerSplitNodePayload,
	CartographerPatchMergeNodes:        validateCartographerMergeNodesPayload,
	CartographerPatchMarkResolved:      validateCartographerMarkResolvedPayload,
}

func validateCartographerUpdateNodeSummaryPayload(payload CartographerPatchPayload) error {
	if err := validateStoreIDs("cartographer patch semantic node id", payload.SemanticNodeID); err != nil {
		return err
	}
	return requireNonEmpty(payload.Summary, "cartographer patch node summary")
}

func validateCartographerAttachEvidencePayload(payload CartographerPatchPayload) error {
	target := payload.TargetEntityID
	if target == "" {
		target = payload.SemanticNodeID
	}
	if err := validateStoreIDs("cartographer patch evidence target entity id", target); err != nil {
		return err
	}
	return validateCartographerPatchEvidence(payload.EvidenceRefs)
}

func validateCartographerCreateEdgePayload(payload CartographerPatchPayload) error {
	if err := validateOptionalStoreIDs([]optionalStoreID{{label: "cartographer patch edge id", value: payload.EdgeID}}); err != nil {
		return err
	}
	if payload.EdgeKind == nil {
		return errors.New("cartographer patch edge kind is required")
	}
	if !isSemanticEdgeKind(*payload.EdgeKind) {
		return fmt.Errorf("cartographer patch edge kind is unsupported: %s", *payload.EdgeKind)
	}
	return validateStoreIDs("cartographer patch from node id", payload.FromNodeID, "cartographer patch to node id", payload.ToNodeID)
}

func validateCartographerStartActivityPayload(payload CartographerPatchPayload) error {
	if err := validateOptionalStoreIDs([]optionalStoreID{{label: "cartographer patch activity id", value: payload.ActivityID}}); err != nil {
		return err
	}
	if payload.ActivityKind == nil {
		return errors.New("cartographer patch activity kind is required")
	}
	if !isSemanticActivityKind(*payload.ActivityKind) {
		return fmt.Errorf("cartographer patch activity kind is unsupported: %s", *payload.ActivityKind)
	}
	if payload.ActivitySourceKind == nil {
		return errors.New("cartographer patch activity source kind is required")
	}
	if !isSemanticActivitySourceKind(*payload.ActivitySourceKind) {
		return fmt.Errorf("cartographer patch activity source kind is unsupported: %s", *payload.ActivitySourceKind)
	}
	return validateStoreIDs("cartographer patch activity target entity id", payload.TargetEntityID)
}

func validateCartographerEndActivityPayload(payload CartographerPatchPayload) error {
	return validateStoreIDs("cartographer patch activity id", payload.ActivityID)
}

func validateCartographerSplitNodePayload(payload CartographerPatchPayload) error {
	if err := validateStoreIDs("cartographer patch source node id", payload.SourceNodeID); err != nil {
		return err
	}
	return validateCartographerPatchNewNodes(payload.NewNodes, "cartographer patch split new node")
}

func validateCartographerMergeNodesPayload(payload CartographerPatchPayload) error {
	if err := validateCartographerPatchNodeIDs(payload.SourceNodeIDs, "cartographer patch merge source node id"); err != nil {
		return err
	}
	if payload.TargetNode == nil {
		return errors.New("cartographer patch merge targetNode is required")
	}
	return validateCartographerPatchNewNode(*payload.TargetNode, "cartographer patch merge target node")
}

func validateCartographerMarkResolvedPayload(payload CartographerPatchPayload) error {
	if err := validateStoreIDs("cartographer patch resolved semantic node id", payload.SemanticNodeID); err != nil {
		return err
	}
	if payload.ResolutionNodeID == "" {
		return errors.New("cartographer patch resolutionNodeId is required")
	}
	return validateStoreIDs("cartographer patch resolution node id", payload.ResolutionNodeID)
}

func validateCartographerRecordNodePayload(payload CartographerPatchPayload, kind SemanticNodeKind) error {
	if payload.SemanticNodeID == "" && payload.NewNode == nil {
		return errors.New("cartographer patch record payload requires semanticNodeId or newNode")
	}
	if payload.SemanticNodeID != "" && payload.NewNode != nil {
		return errors.New("cartographer patch record payload must not include both semanticNodeId and newNode")
	}
	if payload.SemanticNodeID != "" {
		return validateStoreIDs("cartographer patch semantic node id", payload.SemanticNodeID)
	}
	if err := validateCartographerPatchNewNode(*payload.NewNode, "cartographer patch new node"); err != nil {
		return err
	}
	if payload.NewNode.Kind != kind {
		return fmt.Errorf("cartographer patch new node kind = %s, want %s", payload.NewNode.Kind, kind)
	}
	return nil
}

func validateCartographerPatchNewNode(node CartographerPatchNewNode, label string) error {
	if err := validateStoreIDs(label+" semantic node id", node.SemanticNodeID); err != nil {
		return err
	}
	if !isSemanticNodeKind(node.Kind) {
		return fmt.Errorf("%s kind is unsupported: %s", label, node.Kind)
	}
	if err := requireNonEmpty(node.Label, label+" label"); err != nil {
		return err
	}
	if err := requireNonEmpty(node.Summary, label+" summary"); err != nil {
		return err
	}
	if !isCartographerPatchNodeScope(node.Scope) {
		return fmt.Errorf("%s scope is unsupported: %s", label, node.Scope)
	}
	return validateCartographerPatchEvidence(node.EvidenceRefs)
}

func validateCartographerPatchNewNodes(nodes []CartographerPatchNewNode, label string) error {
	if len(nodes) == 0 {
		return fmt.Errorf("%ss are required", label)
	}
	for _, node := range nodes {
		if err := validateCartographerPatchNewNode(node, label); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerPatchNodeIDs(nodeIDs []string, label string) error {
	if len(nodeIDs) == 0 {
		return fmt.Errorf("%ss are required", label)
	}
	for _, nodeID := range nodeIDs {
		if err := validateStoreIDs(label, nodeID); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerPatchPayloadText(payload CartographerPatchPayload) error {
	texts := []struct {
		label string
		value string
	}{
		{label: "cartographer patch payload summary", value: payload.Summary},
		{label: "cartographer patch payload label", value: payload.Label},
	}
	if payload.NewNode != nil {
		texts = append(texts,
			struct {
				label string
				value string
			}{label: "cartographer patch new node label", value: payload.NewNode.Label},
			struct {
				label string
				value string
			}{label: "cartographer patch new node summary", value: payload.NewNode.Summary},
		)
	}
	if payload.TargetNode != nil {
		texts = append(texts,
			struct {
				label string
				value string
			}{label: "cartographer patch target node label", value: payload.TargetNode.Label},
			struct {
				label string
				value string
			}{label: "cartographer patch target node summary", value: payload.TargetNode.Summary},
		)
	}
	for index := range payload.NewNodes {
		texts = append(texts,
			struct {
				label string
				value string
			}{label: "cartographer patch split node label", value: payload.NewNodes[index].Label},
			struct {
				label string
				value string
			}{label: "cartographer patch split node summary", value: payload.NewNodes[index].Summary},
		)
	}
	for _, item := range texts {
		if len(item.value) > 4096 {
			return fmt.Errorf("%s must not contain large raw content", item.label)
		}
		if containsChainOfThoughtMarker(item.value) {
			return fmt.Errorf("%s must not contain chain-of-thought", item.label)
		}
	}
	return nil
}

func validateCartographerPatchEvidence(evidenceRefs []CartographerPatchEvidenceRef) error {
	if evidenceRefs == nil {
		return errors.New("cartographer patch evidenceRefs must not be null")
	}
	for _, evidence := range evidenceRefs {
		if evidence.SourceKind != "" && !isSemanticEvidenceSourceKind(evidence.SourceKind) {
			return fmt.Errorf("cartographer patch evidence sourceKind is unsupported: %s", evidence.SourceKind)
		}
		if err := validateOptionalStoreIDs([]optionalStoreID{
			{label: "cartographer patch evidence source id", value: evidence.SourceID},
			{label: "cartographer patch evidence anchor id", value: evidence.EvidenceAnchorID},
		}); err != nil {
			return err
		}
		if evidence.SourceID == "" && evidence.EvidenceAnchorID == "" {
			return errors.New("cartographer patch evidence ref requires sourceId or evidenceAnchorId")
		}
	}
	return nil
}

func validateCartographerInputItemCounts(counts CartographerInputItemCounts) error {
	values := []struct {
		label string
		value int
	}{
		{label: "cartographer input item count newEvents", value: counts.NewEvents},
		{label: "cartographer input item count observations", value: counts.Observations},
		{label: "cartographer input item count toolCalls", value: counts.ToolCalls},
		{label: "cartographer input item count fileChanges", value: counts.FileChanges},
		{label: "cartographer input item count testResults", value: counts.TestResults},
		{label: "cartographer input item count outputSummaries", value: counts.OutputSummaries},
		{label: "cartographer input item count existingNodes", value: counts.ExistingNodes},
		{label: "cartographer input item count existingEdges", value: counts.ExistingEdges},
		{label: "cartographer input item count evidence", value: counts.Evidence},
		{label: "cartographer input item count activity", value: counts.Activity},
		{label: "cartographer input item count steering", value: counts.Steering},
		{label: "cartographer input item count contextPacks", value: counts.ContextPacks},
		{label: "cartographer input item count retrievalResults", value: counts.RetrievalResults},
		{label: "cartographer input item count trajectorySummaries", value: counts.TrajectorySummaries},
		{label: "cartographer input item count observedEventRefs", value: counts.ObservedEventRefs},
	}
	for _, item := range values {
		if item.value < 0 {
			return fmt.Errorf("%s must not be negative: %d", item.label, item.value)
		}
	}
	return nil
}

func containsChainOfThoughtMarker(value string) bool {
	normalized := strings.ToLower(value)
	return strings.Contains(normalized, "chain-of-thought") ||
		strings.Contains(normalized, "chain of thought") ||
		strings.Contains(normalized, "chain_of_thought") ||
		strings.Contains(normalized, "chainofthought")
}

func validateCartographerValidationResult(result CartographerPatchValidationResult, patchID string) error {
	if result.PatchID == "" {
		return nil
	}
	if result.PatchID != patchID {
		return fmt.Errorf("cartographer validation patchId = %s, want %s", result.PatchID, patchID)
	}
	if err := validateCartographerDiagnostics(result.Diagnostics); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer validation result", result.ValidatedAt)
}

func validateCartographerApplicationResult(result CartographerPatchApplicationResult, patchID string) error {
	if result.PatchID == "" {
		return nil
	}
	if result.PatchID != patchID {
		return fmt.Errorf("cartographer application patchId = %s, want %s", result.PatchID, patchID)
	}
	if err := validateOptionalStoreIDs(optionalIDsFromStrings("cartographer application created semantic event id", result.CreatedSemanticEventIDs)); err != nil {
		return err
	}
	if err := validateCartographerDiagnostics(result.Diagnostics); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer application result", result.AppliedAt)
}

func validateCartographerInputBundle(bundle CartographerInputBundle, label string) error {
	return firstCartographerValidationError(
		func() error { return validateCartographerInputIdentity(bundle, label) },
		func() error { return validateCartographerInputWindow(bundle, label) },
		func() error { return validateCartographerInputContent(bundle, label) },
		func() error { return validateCartographerInputBudget(bundle, label) },
	)
}

func firstCartographerValidationError(checks ...func() error) error {
	for _, check := range checks {
		if err := check(); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerInputIdentity(bundle CartographerInputBundle, label string) error {
	if bundle.WorkspaceID != "" {
		if err := validateStoreIDs(label+" workspace id", bundle.WorkspaceID); err != nil {
			return err
		}
	}
	if bundle.TriggerKind != "" && !isCartographerRunTriggerKind(bundle.TriggerKind) {
		return fmt.Errorf("%s triggerKind is unsupported: %s", label, bundle.TriggerKind)
	}
	if err := requireOptionalEntityID(bundle.TargetEntityID, label+" target entity id"); err != nil {
		return err
	}
	if err := validateContextSourceRefs(bundle.SourceRefs, label); err != nil {
		return err
	}
	return validateOptionalStoreIDs([]optionalStoreID{{label: label + " window id", value: bundle.WindowID}})
}

func validateCartographerInputWindow(bundle CartographerInputBundle, label string) error {
	if err := validateCartographerWindowCursor(bundle.WindowStartCursor, label+" windowStartCursor"); err != nil {
		return err
	}
	return validateCartographerWindowCursor(bundle.WindowEndCursor, label+" windowEndCursor")
}

func validateCartographerInputContent(bundle CartographerInputBundle, label string) error {
	return firstCartographerValidationError(
		func() error { return validateCartographerTrajectoryEvents(bundle.NewEvents, label) },
		func() error { return validateCartographerObservationRecords(bundle.Observations, label) },
		func() error { return validateCartographerToolSummaries(bundle.ToolCalls, label) },
		func() error { return validateCartographerFileChanges(bundle.FileChanges, label) },
		func() error { return validateCartographerTestResults(bundle.TestResults, label) },
		func() error { return validateCartographerOutputSummaries(bundle.OutputSummaries, label) },
		func() error {
			return validateSemanticRetrievalResults(bundle.RetrievalResults, label+" retrievalResults")
		},
		func() error {
			return validateCartographerEventRefs(bundle.ObservedEventRefs, label+" observed event ref")
		},
	)
}

func validateCartographerObservationRecords(observations []CartographerObservationRecord, label string) error {
	for index, observation := range observations {
		itemLabel := fmt.Sprintf("%s observations[%d]", label, index)
		if err := validateCartographerObservationRecord(observation, itemLabel); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerObservationRecord(observation CartographerObservationRecord, label string) error {
	return firstCartographerValidationError(
		func() error {
			if !isCartographerObservationKind(observation.Kind) {
				return fmt.Errorf("%s kind is unsupported: %s", label, observation.Kind)
			}
			if !isCartographerTrajectoryEventSource(observation.Source) {
				return fmt.Errorf("%s source is unsupported: %s", label, observation.Source)
			}
			return requireNonEmpty(observation.Type, label+" type")
		},
		func() error {
			return validateContextSourceRefs(SemanticContextSourceRefs{
				WorkflowDefinitionID:    observation.WorkflowDefinitionID,
				WorkflowExecutionID:     observation.WorkflowExecutionID,
				WorkflowNodeID:          observation.WorkflowNodeID,
				WorkflowNodeExecutionID: observation.WorkflowNodeExecutionID,
				ChatConversationID:      observation.ChatConversationID,
				ChatRunID:               observation.ChatRunID,
				ChatMessageID:           observation.ChatMessageID,
				RunItemID:               observation.RunItemID,
			}, label)
		},
		func() error {
			if observation.EventID != "" {
				if err := validateCartographerEventRef(observation.EventID, label+" eventId"); err != nil {
					return err
				}
			}
			return validateOptionalStoreIDs([]optionalStoreID{{label: label + " workspaceId", value: observation.WorkspaceID}})
		},
		func() error {
			if observation.RangeStart < 0 || observation.RangeEnd < 0 {
				return fmt.Errorf("%s range values must not be negative", label)
			}
			if observation.OutputOrdinal < 0 {
				return fmt.Errorf("%s outputOrdinal must not be negative: %d", label, observation.OutputOrdinal)
			}
			return nil
		},
		func() error {
			if observation.OccurredAt != "" {
				return validateTimestamp(label+" occurredAt", observation.OccurredAt)
			}
			return nil
		},
	)
}

func validateCartographerInputBudget(bundle CartographerInputBundle, label string) error {
	if bundle.TokenBudget < 0 {
		return fmt.Errorf("%s tokenBudget must not be negative: %d", label, bundle.TokenBudget)
	}
	return validateCartographerInputTruncation(bundle.Truncation, label)
}

func validateCartographerCursorKey(ctx context.Context, key CartographerCursorKey) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", key.WorkspaceID); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "workflow execution id", value: key.WorkflowExecutionID},
		{label: "workflow node execution id", value: key.WorkflowNodeExecutionID},
		{label: "chat conversation id", value: key.ChatConversationID},
		{label: "chat run id", value: key.ChatRunID},
	}); err != nil {
		return err
	}
	if key.WorkflowExecutionID == "" && key.ChatRunID == "" {
		return errors.New("cartographer cursor requires workflowExecutionId or chatRunId")
	}
	if key.WorkflowNodeExecutionID != "" && key.WorkflowExecutionID == "" {
		return errors.New("cartographer cursor workflowExecutionId is required when workflowNodeExecutionId is set")
	}
	if key.ChatRunID != "" && key.ChatConversationID == "" {
		return errors.New("cartographer cursor chatConversationId is required when chatRunId is set")
	}
	return nil
}

func validateCartographerWindowCursor(cursor CartographerWindowCursor, label string) error {
	if cursor.ChatEventSequence < 0 {
		return fmt.Errorf("%s chatEventSequence must not be negative: %d", label, cursor.ChatEventSequence)
	}
	if cursor.ChatEventSequence > 0 && cursor.ChatEventStreamID == "" {
		return fmt.Errorf("%s chatEventStreamId is required when chatEventSequence is non-zero", label)
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{{label: label + " chatEventStreamId", value: cursor.ChatEventStreamID}}); err != nil {
		return err
	}
	if err := validateCartographerWorkflowCursor(cursor.WorkflowEventCursor, label+" workflowEventCursor"); err != nil {
		return err
	}
	return validateOutputOrdinalMap(cursor.OutputOrdinalByRunItem, label+" outputOrdinalByRunItem")
}

func validateCartographerTrajectoryEvents(events []CartographerTrajectoryEvent, label string) error {
	for index, event := range events {
		itemLabel := fmt.Sprintf("%s newEvents[%d]", label, index)
		if err := validateCartographerTrajectoryEvent(event, itemLabel); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerTrajectoryEvent(event CartographerTrajectoryEvent, label string) error {
	return firstCartographerValidationError(
		func() error { return validateCartographerTrajectoryEventIdentity(event, label) },
		func() error { return validateCartographerTrajectoryEventNumbers(event, label) },
		func() error { return validateCartographerTrajectoryEventRefs(event, label) },
		func() error { return validateCartographerTrajectoryEventBoundary(event, label) },
	)
}

func validateCartographerTrajectoryEventIdentity(event CartographerTrajectoryEvent, label string) error {
	if !isCartographerTrajectoryEventSource(event.Source) {
		return fmt.Errorf("%s source is unsupported: %s", label, event.Source)
	}
	if err := validateCartographerEventRef(event.EventID, label+" eventId"); err != nil {
		return err
	}
	return requireNonEmpty(event.Type, label+" type")
}

func validateCartographerTrajectoryEventNumbers(event CartographerTrajectoryEvent, label string) error {
	if event.Sequence < 0 {
		return fmt.Errorf("%s sequence must not be negative: %d", label, event.Sequence)
	}
	if event.OutputOrdinal < 0 {
		return fmt.Errorf("%s outputOrdinal must not be negative: %d", label, event.OutputOrdinal)
	}
	if event.OriginalContentBytes < 0 || event.IncludedContentBytes < 0 {
		return fmt.Errorf("%s content byte counts must not be negative", label)
	}
	return nil
}

func validateCartographerTrajectoryEventRefs(event CartographerTrajectoryEvent, label string) error {
	if err := validateContextSourceRefs(event.SourceRefs, label); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: label + " streamId", value: event.StreamID},
		{label: label + " chatMessageId", value: event.ChatMessageID},
		{label: label + " runItemId", value: event.RunItemID},
	}); err != nil {
		return err
	}
	return validateCartographerWorkflowCursor(event.WorkflowEventCursor, label+" workflowEventCursor")
}

func validateCartographerTrajectoryEventBoundary(event CartographerTrajectoryEvent, label string) error {
	if event.OccurredAt != "" {
		if err := validateTimestamp(label+" occurredAt", event.OccurredAt); err != nil {
			return err
		}
	}
	if event.CloseReason != "" && !isCartographerWindowCloseReason(event.CloseReason) {
		return fmt.Errorf("%s closeReason is unsupported: %s", label, event.CloseReason)
	}
	return nil
}

func validateCartographerToolSummaries(items []CartographerToolCallSummary, label string) error {
	for index, item := range items {
		if err := validateStoreIDs(fmt.Sprintf("%s toolCalls[%d] runItemId", label, index), item.RunItemID); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerFileChanges(items []CartographerFileChangeSummary, label string) error {
	for index, item := range items {
		if err := validateStoreIDs(fmt.Sprintf("%s fileChanges[%d] runItemId", label, index), item.RunItemID); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerTestResults(items []CartographerTestResultSummary, label string) error {
	for index, item := range items {
		if err := validateStoreIDs(fmt.Sprintf("%s testResults[%d] runItemId", label, index), item.RunItemID); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerOutputSummaries(items []CartographerOutputSummary, label string) error {
	for index, item := range items {
		itemLabel := fmt.Sprintf("%s outputSummaries[%d]", label, index)
		if err := validateStoreIDs(itemLabel+" runItemId", item.RunItemID); err != nil {
			return err
		}
		if item.StartOrdinal < 0 || item.EndOrdinal < 0 {
			return fmt.Errorf("%s ordinals must not be negative", itemLabel)
		}
		if item.EndOrdinal < item.StartOrdinal {
			return fmt.Errorf("%s endOrdinal must be >= startOrdinal", itemLabel)
		}
	}
	return nil
}

func validateCartographerInputTruncation(truncation CartographerInputTruncation, label string) error {
	for _, count := range cartographerInputTruncationCountValues(truncation) {
		if count < 0 {
			return fmt.Errorf("%s truncation counts must not be negative", label)
		}
	}
	if truncation.IncludedEventCount > truncation.OriginalEventCount && truncation.OriginalEventCount > 0 {
		return fmt.Errorf("%s truncation includedEventCount must not exceed originalEventCount", label)
	}
	for _, counts := range []CartographerInputItemCounts{truncation.OriginalItemCounts, truncation.IncludedItemCounts, truncation.DroppedItemCounts} {
		if err := validateCartographerInputItemCounts(counts); err != nil {
			return err
		}
	}
	return nil
}

func cartographerInputTruncationCountValues(truncation CartographerInputTruncation) []int {
	return []int{
		truncation.OriginalEventCount,
		truncation.IncludedEventCount,
		truncation.OriginalContentBytes,
		truncation.IncludedContentBytes,
		truncation.FoldedWindowCount,
		truncation.SerializedInputBytes,
		truncation.SerializedInputCharacterCount,
		truncation.InputBudgetCharacters,
		truncation.StructuredTaskCharacterLimit,
		truncation.SegmentIndex,
		truncation.SegmentCount,
	}
}

func validateCartographerDiagnostics(diagnostics []CartographerDiagnostic) error {
	for _, diagnostic := range diagnostics {
		if err := validateStoreIDs("cartographer diagnostic id", diagnostic.ID, "cartographer diagnostic run id", diagnostic.RunID); err != nil {
			return err
		}
		if err := requireOptionalEntityID(diagnostic.PatchID, "cartographer diagnostic patch id"); err != nil {
			return err
		}
		if !isCartographerDiagnosticSeverity(diagnostic.Severity) {
			return fmt.Errorf("cartographer diagnostic severity is unsupported: %s", diagnostic.Severity)
		}
		if err := requireNonEmpty(diagnostic.Code, "cartographer diagnostic code"); err != nil {
			return err
		}
		if err := requireNonEmpty(diagnostic.Message, "cartographer diagnostic message"); err != nil {
			return err
		}
		if err := validateCartographerTimestamps("cartographer diagnostic", diagnostic.CreatedAt); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerSource(ctx context.Context, workspaceID string, sourceKind CartographerSourceKind, sourceID string) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "cartographer source id", sourceID); err != nil {
		return err
	}
	if !isCartographerSourceKind(sourceKind) {
		return fmt.Errorf("cartographer source kind is unsupported: %s", sourceKind)
	}
	return nil
}
