package semanticgraph

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
)

const cartographerAutoApplyConfidenceThreshold = 0.75

type CartographerPatchEnvelopeApplicationInput struct {
	WorkspaceID               string                     `json:"workspaceId"`
	RunID                     string                     `json:"runId"`
	WindowID                  string                     `json:"windowId"`
	TriggerKind               CartographerRunTriggerKind `json:"triggerKind"`
	TargetEntityID            string                     `json:"targetEntityId"`
	SourceRefs                SemanticContextSourceRefs  `json:"sourceRefs"`
	InputBundle               CartographerInputBundle    `json:"inputBundle"`
	HarnessKind               string                     `json:"harnessKind"`
	Model                     string                     `json:"model"`
	RequestID                 string                     `json:"requestId"`
	ResponseID                string                     `json:"responseId"`
	RawHarnessResponse        json.RawMessage            `json:"rawHarnessResponse"`
	HarnessError              string                     `json:"harnessError"`
	TrajectorySummary         string                     `json:"trajectorySummary"`
	AutoApplyValidatedPatches bool                       `json:"autoApplyValidatedPatches"`
}

type CartographerPatchEnvelopeApplicationResult struct {
	Run     CartographerRun           `json:"run"`
	Patches []CartographerPatchRecord `json:"patches"`
	Events  []SemanticEvent           `json:"events"`
}

type cartographerPatchDecision struct {
	patch       CartographerPatch
	status      CartographerPatchStatus
	autoApply   bool
	diagnostics []CartographerDiagnostic
	eventCount  int
}

func (service *Service) ApplyCartographerPatchEnvelope(ctx context.Context, input CartographerPatchEnvelopeApplicationInput) (CartographerPatchEnvelopeApplicationResult, error) {
	if input.TriggerKind == "" {
		input.TriggerKind = CartographerTriggerManual
	}
	if err := service.validateCartographerPatchEnvelopeApplicationInput(ctx, input); err != nil {
		return CartographerPatchEnvelopeApplicationResult{}, err
	}
	if _, err := service.resolveWorkspace(input.WorkspaceID); err != nil {
		return CartographerPatchEnvelopeApplicationResult{}, err
	}
	now := timestamp(service.now())
	run := service.cartographerRunAuditFromPatchInput(input, now)
	if input.HarnessError != "" {
		return service.saveCartographerFailedRunAudit(ctx, run, "harness_failed", input.HarnessError, now)
	}

	envelope, err := DecodeCartographerPatchEnvelope(input.RawHarnessResponse)
	if err != nil {
		return service.saveCartographerFailedRunAudit(ctx, run, "invalid_json", err.Error(), now)
	}
	return service.applyDecodedCartographerPatchEnvelope(ctx, input, run, envelope, now)
}

func (service *Service) applyDecodedCartographerPatchEnvelope(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, run CartographerRun, envelope CartographerPatchEnvelope, now string) (CartographerPatchEnvelopeApplicationResult, error) {
	if len(envelope.Patches) == 0 {
		run.Status = CartographerRunCompleted
		run.Diagnostics = []CartographerDiagnostic{service.newCartographerDiagnostic(input.RunID, "", CartographerDiagnosticInfo, "empty_envelope", "cartographer patch envelope proposed no semantic graph mutations", "$.patches", now)}
		saved, err := service.SaveCartographerRun(ctx, run)
		return CartographerPatchEnvelopeApplicationResult{Run: saved, Patches: []CartographerPatchRecord{}, Events: []SemanticEvent{}}, err
	}
	decisions, runDiagnostics, err := service.validateCartographerPatchEnvelope(ctx, input, envelope, now)
	if err != nil {
		run.Status = CartographerRunRejected
		run.Error = err.Error()
		run.Diagnostics = runDiagnostics
		saved, saveErr := service.SaveCartographerRun(ctx, run)
		return CartographerPatchEnvelopeApplicationResult{Run: saved, Patches: []CartographerPatchRecord{}, Events: []SemanticEvent{}}, saveErr
	}
	events, eventIndexesByPatch, err := service.cartographerSemanticEventsForDecisions(ctx, input, decisions, now)
	if err != nil {
		return service.saveCartographerFailedRunAudit(ctx, run, "application_build_failed", err.Error(), now)
	}
	if err := service.assignCartographerEventIDs(events); err != nil {
		return CartographerPatchEnvelopeApplicationResult{}, err
	}
	eventIDsByPatch := eventIDsForPatchIndexes(events, eventIndexesByPatch)
	records := service.cartographerPatchRecordsFromDecisions(input, decisions, eventIDsByPatch, now)
	run.CreatedSemanticEventIDs = semanticEventIDs(events)
	run.Status = cartographerRunStatusForPatchRecords(records)
	if run.Status == CartographerRunRejected {
		run.Error = "cartographer patch validation rejected all proposed mutations"
	}

	if _, err := service.SaveCartographerRun(ctx, run); err != nil {
		return CartographerPatchEnvelopeApplicationResult{}, err
	}
	if len(records) == 0 {
		return CartographerPatchEnvelopeApplicationResult{Run: run, Patches: []CartographerPatchRecord{}, Events: []SemanticEvent{}}, nil
	}
	return service.saveCartographerPatchApplication(ctx, input, run, records, events, now)
}

func (service *Service) saveCartographerPatchApplication(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, run CartographerRun, records []CartographerPatchRecord, events []SemanticEvent, now string) (CartographerPatchEnvelopeApplicationResult, error) {
	appended, err := service.store.SaveCartographerPatchesAndAppendEvents(ctx, records, events)
	if err != nil {
		failed := run
		failed.Status = CartographerRunFailed
		failed.Error = err.Error()
		failed.CreatedSemanticEventIDs = []string{}
		failed.Diagnostics = []CartographerDiagnostic{service.newCartographerDiagnostic(input.RunID, "", CartographerDiagnosticError, "application_failed", err.Error(), "$", now)}
		_, _ = service.SaveCartographerRun(ctx, failed)
		return CartographerPatchEnvelopeApplicationResult{}, err
	}
	savedRun, ok, err := service.ReadCartographerRun(ctx, input.WorkspaceID, input.RunID)
	if err != nil {
		return CartographerPatchEnvelopeApplicationResult{}, err
	}
	if !ok {
		return CartographerPatchEnvelopeApplicationResult{}, fmt.Errorf("cartographer run %s was not persisted", input.RunID)
	}
	for index := range records {
		normalizeCartographerPatchRecord(&records[index])
	}
	return CartographerPatchEnvelopeApplicationResult{Run: savedRun, Patches: records, Events: appended}, nil
}

func (service *Service) saveCartographerFailedRunAudit(ctx context.Context, run CartographerRun, code string, message string, now string) (CartographerPatchEnvelopeApplicationResult, error) {
	run.Status = CartographerRunFailed
	run.Error = message
	run.Diagnostics = []CartographerDiagnostic{service.newCartographerDiagnostic(run.ID, "", CartographerDiagnosticError, code, message, "$", now)}
	saved, err := service.SaveCartographerRun(ctx, run)
	return CartographerPatchEnvelopeApplicationResult{Run: saved, Patches: []CartographerPatchRecord{}, Events: []SemanticEvent{}}, err
}

func (service *Service) validateCartographerPatchEnvelopeApplicationInput(ctx context.Context, input CartographerPatchEnvelopeApplicationInput) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", input.WorkspaceID, "cartographer run id", input.RunID); err != nil {
		return err
	}
	if err := requireOptionalEntityID(input.WindowID, "cartographer window id"); err != nil {
		return err
	}
	if input.TriggerKind == "" {
		input.TriggerKind = CartographerTriggerManual
	}
	if !isCartographerRunTriggerKind(input.TriggerKind) {
		return fmt.Errorf("cartographer triggerKind is unsupported: %s", input.TriggerKind)
	}
	if err := requireOptionalEntityID(input.TargetEntityID, "cartographer target entity id"); err != nil {
		return err
	}
	if err := validateContextSourceRefs(input.SourceRefs, "cartographer patch application"); err != nil {
		return err
	}
	if input.InputBundle.WorkspaceID != "" && input.InputBundle.WorkspaceID != input.WorkspaceID {
		return fmt.Errorf("cartographer input bundle workspaceId = %s, want %s", input.InputBundle.WorkspaceID, input.WorkspaceID)
	}
	return validateCartographerInputBundle(input.InputBundle, "cartographer patch application input bundle")
}

func (service *Service) cartographerRunAuditFromPatchInput(input CartographerPatchEnvelopeApplicationInput, now string) CartographerRun {
	bundle := input.InputBundle
	bundle.WorkspaceID = input.WorkspaceID
	return CartographerRun{
		ID:                      input.RunID,
		WorkspaceID:             input.WorkspaceID,
		Status:                  CartographerRunProposed,
		TriggerKind:             input.TriggerKind,
		TargetEntityID:          input.TargetEntityID,
		SourceRefs:              input.SourceRefs,
		InputBundle:             bundle,
		OutputSchema:            DefaultCartographerPatchEnvelopeSchema(),
		HarnessKind:             input.HarnessKind,
		Model:                   input.Model,
		RequestID:               input.RequestID,
		ResponseID:              input.ResponseID,
		WindowID:                input.WindowID,
		InputBundleHash:         hashJSONValue(bundle),
		InputItemCounts:         cartographerInputItemCounts(bundle),
		RawHarnessResponseHash:  hashBytes(input.RawHarnessResponse),
		TrajectorySummary:       input.TrajectorySummary,
		CreatedSemanticEventIDs: []string{},
		Diagnostics:             []CartographerDiagnostic{},
		CreatedAt:               now,
		StartedAt:               now,
		CompletedAt:             now,
		UpdatedAt:               now,
	}
}

func (service *Service) validateCartographerPatchEnvelope(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, envelope CartographerPatchEnvelope, now string) ([]cartographerPatchDecision, []CartographerDiagnostic, error) {
	ids := map[string]bool{}
	runDiagnostics := []CartographerDiagnostic{}
	decisions := make([]cartographerPatchDecision, 0, len(envelope.Patches))
	newNodeIDs := collectCartographerEnvelopeNewNodeIDs(envelope)
	for index, patch := range envelope.Patches {
		if ids[patch.ID] {
			diagnostic := service.newCartographerDiagnostic(input.RunID, patch.ID, CartographerDiagnosticError, "duplicate_patch_id", fmt.Sprintf("cartographer patch id %s is duplicated", patch.ID), fmt.Sprintf("$.patches[%d].patchId", index), now)
			runDiagnostics = append(runDiagnostics, diagnostic)
			continue
		}
		ids[patch.ID] = true
		diagnostics := service.validateCartographerPatch(ctx, input, patch, newNodeIDs, index, now)
		if input.AutoApplyValidatedPatches {
			diagnostics = append(diagnostics, service.cartographerAutomaticPatchMetadataDiagnostics(input.RunID, patch, index, now)...)
		}
		status, autoApply := cartographerPatchStatusFromDiagnostics(patch, diagnostics, input.AutoApplyValidatedPatches)
		decisions = append(decisions, cartographerPatchDecision{patch: patch, status: status, autoApply: autoApply, diagnostics: diagnostics})
	}
	if len(runDiagnostics) > 0 {
		return nil, runDiagnostics, errors.New("cartographer patch ids must be unique within the run")
	}
	if cartographerDecisionsContainRejected(decisions) {
		for index := range decisions {
			decisions[index].autoApply = false
			if decisions[index].status == CartographerPatchApplied {
				decisions[index].status = CartographerPatchPendingReview
			}
		}
	}
	return decisions, nil, nil
}

func (service *Service) validateCartographerPatch(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, patch CartographerPatch, newNodeIDs map[string]bool, index int, now string) []CartographerDiagnostic {
	diagnostics := []CartographerDiagnostic{}
	add := func(code string, message string, path string) {
		diagnostics = append(diagnostics, service.newCartographerDiagnostic(input.RunID, patch.ID, CartographerDiagnosticError, code, message, path, now))
	}
	if err := validateCartographerPatch(patch, patch.ID, input.WorkspaceID); err != nil {
		add("schema_invalid", err.Error(), fmt.Sprintf("$.patches[%d]", index))
		return diagnostics
	}
	if patch.WorkspaceID != input.WorkspaceID {
		add("workspace_mismatch", fmt.Sprintf("cartographer patch workspaceId = %s, want %s", patch.WorkspaceID, input.WorkspaceID), fmt.Sprintf("$.patches[%d].workspaceId", index))
	}
	if !cartographerPatchSourceRefsMatchInput(patch.SourceRefs, input.SourceRefs) {
		add("source_ref_mismatch", "cartographer patch sourceRefs must match the input bundle source refs", fmt.Sprintf("$.patches[%d].sourceRefs", index))
	}
	if err := service.validateCartographerPatchEvidenceRefs(ctx, input.WorkspaceID, input.InputBundle, cartographerPatchAllEvidenceRefs(patch), fmt.Sprintf("$.patches[%d].evidenceRefs", index)); err != nil {
		add("missing_evidence", err.Error(), fmt.Sprintf("$.patches[%d].evidenceRefs", index))
	}
	if err := service.validateCartographerPatchOperationRefs(ctx, input.WorkspaceID, patch, newNodeIDs); err != nil {
		add("unknown_ref", err.Error(), fmt.Sprintf("$.patches[%d].payload", index))
	}
	if err := validateCartographerPatchActivitySourceRef(input.InputBundle, patch); err != nil {
		add("unknown_ref", err.Error(), fmt.Sprintf("$.patches[%d].payload.activitySourceId", index))
	}
	if cartographerPatchRequiresEvidence(patch) && !cartographerPatchHasEvidence(patch) {
		add("missing_evidence", "cartographer auto-applied patches require evidence refs", fmt.Sprintf("$.patches[%d].evidenceRefs", index))
	}
	return diagnostics
}

func (service *Service) cartographerAutomaticPatchMetadataDiagnostics(runID string, patch CartographerPatch, index int, now string) []CartographerDiagnostic {
	diagnostics := []CartographerDiagnostic{}
	if patch.ReviewRequired {
		diagnostics = append(diagnostics, service.newCartographerDiagnostic(
			runID,
			patch.ID,
			CartographerDiagnosticWarning,
			"review_required_auto_applied",
			"cartographer automatic processing records reviewRequired metadata but does not block deterministic-valid patches",
			fmt.Sprintf("$.patches[%d].reviewRequired", index),
			now,
		))
	}
	if patch.Confidence != nil && *patch.Confidence < cartographerAutoApplyConfidenceThreshold {
		diagnostics = append(diagnostics, service.newCartographerDiagnostic(
			runID,
			patch.ID,
			CartographerDiagnosticWarning,
			"low_confidence_auto_applied",
			"cartographer automatic processing records low confidence metadata but does not block deterministic-valid patches",
			fmt.Sprintf("$.patches[%d].confidence", index),
			now,
		))
	}
	if !cartographerPatchIsLowImpactOperation(patch.Operation) {
		diagnostics = append(diagnostics, service.newCartographerDiagnostic(
			runID,
			patch.ID,
			CartographerDiagnosticWarning,
			"high_impact_auto_applied",
			"cartographer automatic processing records high-impact operation metadata but does not block deterministic-valid patches",
			fmt.Sprintf("$.patches[%d].operation", index),
			now,
		))
	}
	return diagnostics
}

func cartographerPatchStatusFromDiagnostics(patch CartographerPatch, diagnostics []CartographerDiagnostic, autoApplyValidated bool) (CartographerPatchStatus, bool) {
	if cartographerDiagnosticsContainError(diagnostics) {
		return CartographerPatchRejected, false
	}
	if autoApplyValidated {
		return CartographerPatchApplied, true
	}
	if !cartographerPatchIsLowRiskAutoApply(patch) {
		return CartographerPatchPendingReview, false
	}
	return CartographerPatchApplied, true
}

func cartographerDiagnosticsContainError(diagnostics []CartographerDiagnostic) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Severity == CartographerDiagnosticError {
			return true
		}
	}
	return false
}

func cartographerPatchIsLowRiskAutoApply(patch CartographerPatch) bool {
	if patch.ReviewRequired || patch.Confidence == nil || *patch.Confidence < cartographerAutoApplyConfidenceThreshold {
		return false
	}
	return cartographerPatchIsLowImpactOperation(patch.Operation) && cartographerPatchHasEvidence(patch)
}

func cartographerPatchIsLowImpactOperation(operation CartographerPatchOperation) bool {
	switch operation {
	case CartographerPatchRecordFinding,
		CartographerPatchRecordDecision,
		CartographerPatchRecordConstraint,
		CartographerPatchRecordOpenQuestion,
		CartographerPatchAttachEvidence:
		return true
	default:
		return false
	}
}

func cartographerPatchRequiresEvidence(patch CartographerPatch) bool {
	switch patch.Operation {
	case CartographerPatchRecordFinding,
		CartographerPatchRecordDecision,
		CartographerPatchRecordConstraint,
		CartographerPatchRecordOpenQuestion,
		CartographerPatchAttachEvidence:
		return true
	default:
		return false
	}
}

func cartographerPatchHasEvidence(patch CartographerPatch) bool {
	if len(patch.EvidenceRefs) > 0 || len(patch.Payload.EvidenceRefs) > 0 {
		return true
	}
	if patch.Payload.NewNode != nil && len(patch.Payload.NewNode.EvidenceRefs) > 0 {
		return true
	}
	return false
}

func cartographerPatchAllEvidenceRefs(patch CartographerPatch) []CartographerPatchEvidenceRef {
	refs := []CartographerPatchEvidenceRef{}
	refs = append(refs, patch.EvidenceRefs...)
	refs = append(refs, patch.Payload.EvidenceRefs...)
	if patch.Payload.NewNode != nil {
		refs = append(refs, patch.Payload.NewNode.EvidenceRefs...)
	}
	if patch.Payload.TargetNode != nil {
		refs = append(refs, patch.Payload.TargetNode.EvidenceRefs...)
	}
	for _, node := range patch.Payload.NewNodes {
		refs = append(refs, node.EvidenceRefs...)
	}
	return refs
}

func validateCartographerPatchActivitySourceRef(bundle CartographerInputBundle, patch CartographerPatch) error {
	if patch.Operation != CartographerPatchStartActivity {
		return nil
	}
	if patch.Payload.ActivitySourceID == "" {
		return errors.New("cartographer patch activitySourceId is required")
	}
	if patch.Payload.ActivitySourceKind == nil {
		return errors.New("cartographer patch activitySourceKind is required")
	}
	if cartographerInputBundleHasActivitySourceRef(bundle, *patch.Payload.ActivitySourceKind, patch.Payload.ActivitySourceID) {
		return nil
	}
	return fmt.Errorf("cartographer patch references unknown activity source %s/%s", *patch.Payload.ActivitySourceKind, patch.Payload.ActivitySourceID)
}

func (service *Service) validateCartographerPatchOperationRefs(ctx context.Context, workspaceID string, patch CartographerPatch, newNodeIDs map[string]bool) error {
	validator, ok := cartographerPatchOperationRefValidators[patch.Operation]
	if !ok {
		return fmt.Errorf("cartographer patch operation is unsupported: %s", patch.Operation)
	}
	return validator(service, ctx, workspaceID, patch, newNodeIDs)
}

type cartographerPatchOperationRefValidator func(*Service, context.Context, string, CartographerPatch, map[string]bool) error

var cartographerPatchOperationRefValidators = map[CartographerPatchOperation]cartographerPatchOperationRefValidator{
	CartographerPatchRecordFinding:      validateCartographerRecordNodeRefs,
	CartographerPatchRecordDecision:     validateCartographerRecordNodeRefs,
	CartographerPatchRecordConstraint:   validateCartographerRecordNodeRefs,
	CartographerPatchRecordOpenQuestion: validateCartographerRecordNodeRefs,
	CartographerPatchAttachEvidence:     validateCartographerAttachEvidenceRefs,
	CartographerPatchCreateEdge:         validateCartographerCreateEdgeRefs,
	CartographerPatchUpdateNodeSummary:  validateCartographerExistingSemanticNodeRef,
	CartographerPatchMarkResolved:       validateCartographerMarkResolvedRefs,
	CartographerPatchStartActivity:      validateCartographerStartActivityRefs,
	CartographerPatchEndActivity:        validateCartographerEndActivityRefs,
	CartographerPatchSplitNode:          validateCartographerSplitNodeRefs,
	CartographerPatchMergeNodes:         validateCartographerMergeNodeRefs,
}

func validateCartographerRecordNodeRefs(service *Service, ctx context.Context, workspaceID string, patch CartographerPatch, _ map[string]bool) error {
	if patch.Payload.SemanticNodeID != "" {
		return service.requireSemanticNode(ctx, workspaceID, patch.Payload.SemanticNodeID)
	}
	return service.requireCartographerNewNodeDoesNotExist(ctx, workspaceID, patch.Payload.NewNode.SemanticNodeID)
}

func validateCartographerAttachEvidenceRefs(service *Service, ctx context.Context, workspaceID string, patch CartographerPatch, newNodeIDs map[string]bool) error {
	targetID := patch.Payload.TargetEntityID
	if targetID == "" {
		targetID = patch.Payload.SemanticNodeID
	}
	return service.requireSemanticEntityOrNewNode(ctx, workspaceID, targetID, newNodeIDs)
}

func validateCartographerCreateEdgeRefs(service *Service, ctx context.Context, workspaceID string, patch CartographerPatch, newNodeIDs map[string]bool) error {
	if err := service.requireSemanticEntityOrNewNode(ctx, workspaceID, patch.Payload.FromNodeID, newNodeIDs); err != nil {
		return err
	}
	return service.requireSemanticEntityOrNewNode(ctx, workspaceID, patch.Payload.ToNodeID, newNodeIDs)
}

func validateCartographerExistingSemanticNodeRef(service *Service, ctx context.Context, workspaceID string, patch CartographerPatch, _ map[string]bool) error {
	return service.requireSemanticNode(ctx, workspaceID, patch.Payload.SemanticNodeID)
}

func validateCartographerMarkResolvedRefs(service *Service, ctx context.Context, workspaceID string, patch CartographerPatch, newNodeIDs map[string]bool) error {
	if err := service.requireSemanticNode(ctx, workspaceID, patch.Payload.SemanticNodeID); err != nil {
		return err
	}
	return service.requireSemanticEntityOrNewNode(ctx, workspaceID, patch.Payload.ResolutionNodeID, newNodeIDs)
}

func validateCartographerStartActivityRefs(service *Service, ctx context.Context, workspaceID string, patch CartographerPatch, newNodeIDs map[string]bool) error {
	return service.requireSemanticEntityOrNewNode(ctx, workspaceID, patch.Payload.TargetEntityID, newNodeIDs)
}

func validateCartographerEndActivityRefs(service *Service, ctx context.Context, workspaceID string, patch CartographerPatch, _ map[string]bool) error {
	_, ok, err := service.store.loadSemanticActivityIntervalByID(ctx, workspaceID, patch.Payload.ActivityID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("semantic activity interval %s does not exist", patch.Payload.ActivityID)
	}
	return nil
}

func validateCartographerSplitNodeRefs(service *Service, ctx context.Context, workspaceID string, patch CartographerPatch, _ map[string]bool) error {
	return service.requireSemanticNode(ctx, workspaceID, patch.Payload.SourceNodeID)
}

func validateCartographerMergeNodeRefs(service *Service, ctx context.Context, workspaceID string, patch CartographerPatch, _ map[string]bool) error {
	for _, nodeID := range patch.Payload.SourceNodeIDs {
		if err := service.requireSemanticNode(ctx, workspaceID, nodeID); err != nil {
			return err
		}
	}
	return service.requireCartographerNewNodeDoesNotExist(ctx, workspaceID, patch.Payload.TargetNode.SemanticNodeID)
}

func (service *Service) requireSemanticEntityOrNewNode(ctx context.Context, workspaceID string, entityID string, newNodeIDs map[string]bool) error {
	if err := validateStoreIDs("cartographer semantic entity id", entityID); err != nil {
		return err
	}
	if newNodeIDs[entityID] {
		return nil
	}
	if _, ok, err := service.store.loadSemanticNode(ctx, workspaceID, entityID); err != nil || ok {
		if err != nil {
			return err
		}
		return nil
	}
	if _, ok, err := service.store.loadSemanticEdgeByID(ctx, workspaceID, entityID); err != nil || ok {
		if err != nil {
			return err
		}
		return nil
	}
	return fmt.Errorf("semantic entity %s does not exist", entityID)
}

func (service *Service) requireCartographerNewNodeDoesNotExist(ctx context.Context, workspaceID string, nodeID string) error {
	if _, ok, err := service.store.loadSemanticNode(ctx, workspaceID, nodeID); err != nil || ok {
		if err != nil {
			return err
		}
		return fmt.Errorf("semantic node %s already exists", nodeID)
	}
	return nil
}

func (service *Service) validateCartographerPatchEvidenceRefs(ctx context.Context, workspaceID string, bundle CartographerInputBundle, refs []CartographerPatchEvidenceRef, path string) error {
	for _, ref := range refs {
		if ref.EvidenceAnchorID != "" {
			if _, ok, err := service.store.loadSemanticEvidenceAnchorByID(ctx, workspaceID, ref.EvidenceAnchorID); err != nil || ok {
				if err != nil {
					return err
				}
				continue
			}
			return fmt.Errorf("semantic evidence anchor %s does not exist", ref.EvidenceAnchorID)
		}
		if ref.SourceKind != "" && ref.SourceID != "" && cartographerInputBundleHasSourceRef(bundle, ref.SourceKind, ref.SourceID) {
			continue
		}
		return fmt.Errorf("%s references unknown source %s/%s", path, ref.SourceKind, ref.SourceID)
	}
	return nil
}

func (service *Service) cartographerSemanticEventsForDecisions(ctx context.Context, input CartographerPatchEnvelopeApplicationInput, decisions []cartographerPatchDecision, now string) ([]SemanticEvent, map[string][]int, error) {
	events := []SemanticEvent{}
	eventIndexesByPatch := map[string][]int{}
	actor := SemanticAttachmentActor{ActorKind: ActorKindCartographer, ActorID: input.RunID}
	orderedIndexes := cartographerDecisionApplicationOrder(decisions)
	for _, decisionIndex := range orderedIndexes {
		if !decisions[decisionIndex].autoApply {
			continue
		}
		patchEvents, err := service.cartographerSemanticEventsForPatch(ctx, input.WorkspaceID, actor, decisions[decisionIndex].patch)
		if err != nil {
			return nil, nil, err
		}
		for patchEventIndex := range patchEvents {
			service.decorateCartographerSemanticEvent(&patchEvents[patchEventIndex], input, decisions[decisionIndex].patch, now)
			eventIndexesByPatch[decisions[decisionIndex].patch.ID] = append(eventIndexesByPatch[decisions[decisionIndex].patch.ID], len(events))
			events = append(events, patchEvents[patchEventIndex])
		}
		decisions[decisionIndex].eventCount = len(patchEvents)
	}
	return events, eventIndexesByPatch, nil
}

func (service *Service) cartographerRecordNodeEvents(ctx context.Context, workspaceID string, actor SemanticAttachmentActor, patch CartographerPatch) ([]SemanticEvent, error) {
	targetID := patch.Payload.SemanticNodeID
	events := []SemanticEvent{}
	if patch.Payload.NewNode != nil {
		targetID = patch.Payload.NewNode.SemanticNodeID
		payload := nodeCreatedPayload{
			NodeID:  patch.Payload.NewNode.SemanticNodeID,
			Kind:    patch.Payload.NewNode.Kind,
			Label:   patch.Payload.NewNode.Label,
			Summary: patch.Payload.NewNode.Summary,
		}
		event, err := service.semanticEvent(workspaceID, EventNodeCreated, targetID, actor, payload)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
		nodeEvidence, err := service.cartographerEvidenceEvents(ctx, workspaceID, actor, targetID, cartographerPatchAllEvidenceRefs(patch), patch)
		if err != nil {
			return nil, err
		}
		events = append(events, nodeEvidence...)
		return events, nil
	}
	evidenceEvents, err := service.cartographerEvidenceEvents(ctx, workspaceID, actor, targetID, cartographerPatchAllEvidenceRefs(patch), patch)
	if err != nil {
		return nil, err
	}
	return append(events, evidenceEvents...), nil
}

func (service *Service) cartographerEvidenceEvents(ctx context.Context, workspaceID string, actor SemanticAttachmentActor, targetEntityID string, refs []CartographerPatchEvidenceRef, patch CartographerPatch) ([]SemanticEvent, error) {
	events := make([]SemanticEvent, 0, len(refs))
	for _, ref := range refs {
		payload, err := service.cartographerEvidencePayloadFromRef(ctx, workspaceID, targetEntityID, ref, patch)
		if err != nil {
			return nil, err
		}
		event, err := service.semanticEvent(workspaceID, EventEvidenceAttached, targetEntityID, actor, payload)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

func (service *Service) cartographerEvidencePayloadFromRef(ctx context.Context, workspaceID string, targetEntityID string, ref CartographerPatchEvidenceRef, patch CartographerPatch) (evidenceAttachedPayload, error) {
	anchorID, err := service.newID("semantic_evidence")
	if err != nil {
		return evidenceAttachedPayload{}, fmt.Errorf("create cartographer evidence id: %w", err)
	}
	if ref.EvidenceAnchorID != "" {
		anchor, ok, err := service.store.loadSemanticEvidenceAnchorByID(ctx, workspaceID, ref.EvidenceAnchorID)
		if err != nil {
			return evidenceAttachedPayload{}, err
		}
		if !ok {
			return evidenceAttachedPayload{}, fmt.Errorf("semantic evidence anchor %s does not exist", ref.EvidenceAnchorID)
		}
		return evidenceAttachedPayload{
			AnchorID:                anchorID,
			TargetEntityID:          targetEntityID,
			SourceKind:              anchor.SourceKind,
			SourceID:                anchor.SourceID,
			URI:                     anchor.URI,
			Path:                    anchor.Path,
			RangeStart:              anchor.RangeStart,
			RangeEnd:                anchor.RangeEnd,
			Text:                    anchor.Text,
			Summary:                 anchor.Summary,
			ContentHash:             anchor.ContentHash,
			WorkflowDefinitionID:    anchor.WorkflowDefinitionID,
			WorkflowExecutionID:     anchor.WorkflowExecutionID,
			WorkflowNodeID:          anchor.WorkflowNodeID,
			WorkflowNodeExecutionID: anchor.WorkflowNodeExecutionID,
			ChatConversationID:      anchor.ChatConversationID,
			ChatRunID:               anchor.ChatRunID,
			ChatMessageID:           anchor.ChatMessageID,
			RunItemID:               anchor.RunItemID,
			ReassignedFromAnchorID:  anchor.ID,
		}, nil
	}
	return evidenceAttachedPayload{
		AnchorID:       anchorID,
		TargetEntityID: targetEntityID,
		SourceKind:     ref.SourceKind,
		SourceID:       ref.SourceID,
		Summary:        patch.PublicSummary,
	}, nil
}

func (service *Service) decorateCartographerSemanticEvent(event *SemanticEvent, input CartographerPatchEnvelopeApplicationInput, patch CartographerPatch, now string) {
	event.RunID = input.RunID
	event.WorkflowExecutionID = input.SourceRefs.WorkflowExecutionID
	event.CausationID = patch.CausationID
	event.CorrelationID = patch.CorrelationID
	event.ObservedAt = now
	event.ModelInfo = map[string]string{
		"cartographer_patch_id":  patch.ID,
		"cartographer_operation": string(patch.Operation),
	}
	for key, value := range patch.ModelInfo {
		event.ModelInfo[key] = value
	}
}

func (service *Service) assignCartographerEventIDs(events []SemanticEvent) error {
	for index := range events {
		if events[index].EventID != "" {
			continue
		}
		id, err := service.newID("semantic_event")
		if err != nil {
			return fmt.Errorf("create semantic event id: %w", err)
		}
		events[index].EventID = id
	}
	return nil
}

func (service *Service) cartographerPatchRecordsFromDecisions(input CartographerPatchEnvelopeApplicationInput, decisions []cartographerPatchDecision, eventIDsByPatch map[string][]string, now string) []CartographerPatchRecord {
	records := make([]CartographerPatchRecord, 0, len(decisions))
	for _, decision := range decisions {
		eventIDs := eventIDsByPatch[decision.patch.ID]
		if eventIDs == nil {
			eventIDs = []string{}
		}
		diagnostics := decision.diagnostics
		if diagnostics == nil {
			diagnostics = []CartographerDiagnostic{}
		}
		validation := CartographerPatchValidationResult{
			PatchID:     decision.patch.ID,
			Accepted:    decision.status != CartographerPatchRejected,
			Diagnostics: diagnostics,
			ValidatedAt: now,
		}
		application := CartographerPatchApplicationResult{
			PatchID:                 decision.patch.ID,
			Applied:                 decision.status == CartographerPatchApplied,
			CreatedSemanticEventIDs: eventIDs,
			Diagnostics:             []CartographerDiagnostic{},
			AppliedAt:               "",
		}
		appliedAt := ""
		if application.Applied {
			application.AppliedAt = now
			appliedAt = now
		}
		records = append(records, CartographerPatchRecord{
			WorkspaceID:             input.WorkspaceID,
			ID:                      decision.patch.ID,
			RunID:                   input.RunID,
			WindowID:                input.WindowID,
			Status:                  decision.status,
			Patch:                   decision.patch,
			ValidationResult:        validation,
			ApplicationResult:       application,
			CreatedSemanticEventIDs: eventIDs,
			CreatedAt:               now,
			ValidatedAt:             now,
			AppliedAt:               appliedAt,
		})
	}
	return records
}

func (service *Service) newCartographerDiagnostic(runID string, patchID string, severity CartographerDiagnosticSeverity, code string, message string, path string, now string) CartographerDiagnostic {
	id, err := service.newID("cartographer_diagnostic")
	if err != nil {
		id = "cartographer_diagnostic_error"
	}
	return CartographerDiagnostic{
		ID:        id,
		RunID:     runID,
		PatchID:   patchID,
		Severity:  severity,
		Code:      code,
		Message:   message,
		Path:      path,
		CreatedAt: now,
	}
}

func cartographerRunStatusForPatchRecords(records []CartographerPatchRecord) CartographerRunStatus {
	applied := false
	pending := false
	rejected := false
	for _, record := range records {
		switch record.Status {
		case CartographerPatchApplied:
			applied = true
		case CartographerPatchPendingReview, CartographerPatchProposed, CartographerPatchValidated:
			pending = true
		case CartographerPatchRejected:
			rejected = true
		}
	}
	if applied {
		return CartographerRunApplied
	}
	if rejected {
		return CartographerRunRejected
	}
	if pending {
		return CartographerRunProposed
	}
	return CartographerRunRejected
}

func cartographerDecisionsContainRejected(decisions []cartographerPatchDecision) bool {
	for _, decision := range decisions {
		if decision.status == CartographerPatchRejected {
			return true
		}
	}
	return false
}

func collectCartographerEnvelopeNewNodeIDs(envelope CartographerPatchEnvelope) map[string]bool {
	ids := map[string]bool{}
	for _, patch := range envelope.Patches {
		if patch.Payload.NewNode != nil {
			ids[patch.Payload.NewNode.SemanticNodeID] = true
		}
		if patch.Payload.TargetNode != nil {
			ids[patch.Payload.TargetNode.SemanticNodeID] = true
		}
		for _, node := range patch.Payload.NewNodes {
			ids[node.SemanticNodeID] = true
		}
	}
	return ids
}

func cartographerPatchSourceRefsMatchInput(patchRefs SemanticContextSourceRefs, inputRefs SemanticContextSourceRefs) bool {
	patchValues := []struct {
		patch string
		input string
	}{
		{patch: patchRefs.WorkflowDefinitionID, input: inputRefs.WorkflowDefinitionID},
		{patch: patchRefs.WorkflowExecutionID, input: inputRefs.WorkflowExecutionID},
		{patch: patchRefs.WorkflowNodeID, input: inputRefs.WorkflowNodeID},
		{patch: patchRefs.WorkflowNodeExecutionID, input: inputRefs.WorkflowNodeExecutionID},
		{patch: patchRefs.ChatConversationID, input: inputRefs.ChatConversationID},
		{patch: patchRefs.ChatRunID, input: inputRefs.ChatRunID},
		{patch: patchRefs.ChatMessageID, input: inputRefs.ChatMessageID},
		{patch: patchRefs.RunItemID, input: inputRefs.RunItemID},
	}
	nonEmpty := false
	for _, item := range patchValues {
		if item.patch == "" {
			continue
		}
		nonEmpty = true
		if item.patch != item.input {
			return false
		}
	}
	return nonEmpty
}

func cartographerInputBundleHasSourceRef(bundle CartographerInputBundle, kind SemanticEvidenceSourceKind, sourceID string) bool {
	return cartographerInputBundleHasDirectSourceRef(bundle, kind, sourceID) ||
		cartographerInputBundleHasObservedSourceRef(bundle, kind, sourceID) ||
		cartographerInputBundleEvidenceHasSourceRef(bundle, kind, sourceID)
}

func cartographerInputBundleHasActivitySourceRef(bundle CartographerInputBundle, kind SemanticActivitySourceKind, sourceID string) bool {
	evidenceKind, ok := evidenceSourceKindForActivitySourceKind(kind)
	if !ok {
		return false
	}
	return cartographerInputBundleHasSourceRef(bundle, evidenceKind, sourceID)
}

func evidenceSourceKindForActivitySourceKind(kind SemanticActivitySourceKind) (SemanticEvidenceSourceKind, bool) {
	switch kind {
	case ActivitySourceWorkflowExecution:
		return EvidenceSourceWorkflowExecution, true
	case ActivitySourceWorkflowNode:
		return EvidenceSourceWorkflowNode, true
	case ActivitySourceChatRun:
		return EvidenceSourceChatRun, true
	case ActivitySourceChatMessage:
		return EvidenceSourceChatMessage, true
	case ActivitySourceRunItem, ActivitySourceCommand:
		return EvidenceSourceRunItem, true
	case ActivitySourceFileRange:
		return EvidenceSourceFileRange, true
	case ActivitySourceTest:
		return EvidenceSourceTest, true
	case ActivitySourceDiff:
		return EvidenceSourceDiff, true
	default:
		return "", false
	}
}

func cartographerInputBundleHasDirectSourceRef(bundle CartographerInputBundle, kind SemanticEvidenceSourceKind, sourceID string) bool {
	switch kind {
	case EvidenceSourceWorkflowExecution:
		return sourceID == bundle.SourceRefs.WorkflowExecutionID
	case EvidenceSourceWorkflowNode:
		return sourceID == bundle.SourceRefs.WorkflowNodeID || sourceID == bundle.SourceRefs.WorkflowNodeExecutionID
	case EvidenceSourceChatRun:
		return sourceID == bundle.SourceRefs.ChatRunID
	case EvidenceSourceChatMessage:
		return sourceID == bundle.SourceRefs.ChatMessageID
	default:
		return false
	}
}

func cartographerInputBundleHasObservedSourceRef(bundle CartographerInputBundle, kind SemanticEvidenceSourceKind, sourceID string) bool {
	switch kind {
	case EvidenceSourceRunItem:
		return cartographerTrajectoryEventsHaveRunItem(bundle.NewEvents, sourceID) ||
			cartographerToolCallsHaveRunItem(bundle.ToolCalls, sourceID)
	case EvidenceSourceFileRange:
		return cartographerFileChangesHaveRunItem(bundle.FileChanges, sourceID)
	case EvidenceSourceTest:
		return cartographerTestResultsHaveRunItem(bundle.TestResults, sourceID)
	case EvidenceSourceDiff:
		return cartographerFileChangesHaveRunItem(bundle.FileChanges, sourceID)
	case EvidenceSourcePrompt, EvidenceSourceLog, EvidenceSourceDocument:
		return stringSliceContains(bundle.ObservedEventRefs, sourceID)
	default:
		return false
	}
}

func cartographerInputBundleEvidenceHasSourceRef(bundle CartographerInputBundle, kind SemanticEvidenceSourceKind, sourceID string) bool {
	for _, evidence := range bundle.Evidence {
		if evidence.SourceKind == kind && evidence.SourceID == sourceID {
			return true
		}
	}
	return false
}

func cartographerTrajectoryEventsHaveRunItem(events []CartographerTrajectoryEvent, runItemID string) bool {
	for _, event := range events {
		if event.RunItemID == runItemID {
			return true
		}
	}
	return false
}

func cartographerToolCallsHaveRunItem(items []CartographerToolCallSummary, runItemID string) bool {
	for _, item := range items {
		if item.RunItemID == runItemID {
			return true
		}
	}
	return false
}

func cartographerFileChangesHaveRunItem(items []CartographerFileChangeSummary, runItemID string) bool {
	for _, item := range items {
		if item.RunItemID == runItemID {
			return true
		}
	}
	return false
}

func cartographerTestResultsHaveRunItem(items []CartographerTestResultSummary, runItemID string) bool {
	for _, item := range items {
		if item.RunItemID == runItemID {
			return true
		}
	}
	return false
}

func stringSliceContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func eventIDsForPatchIndexes(events []SemanticEvent, indexes map[string][]int) map[string][]string {
	result := map[string][]string{}
	for patchID, eventIndexes := range indexes {
		for _, index := range eventIndexes {
			result[patchID] = append(result[patchID], events[index].EventID)
		}
	}
	return result
}

func semanticEventIDs(events []SemanticEvent) []string {
	ids := make([]string, 0, len(events))
	for _, event := range events {
		ids = append(ids, event.EventID)
	}
	return ids
}

func cartographerInputItemCounts(bundle CartographerInputBundle) CartographerInputItemCounts {
	return CartographerInputItemCounts{
		NewEvents:           len(bundle.NewEvents),
		ToolCalls:           len(bundle.ToolCalls),
		FileChanges:         len(bundle.FileChanges),
		TestResults:         len(bundle.TestResults),
		OutputSummaries:     len(bundle.OutputSummaries),
		ExistingNodes:       len(bundle.ExistingNodes),
		ExistingEdges:       len(bundle.ExistingEdges),
		Evidence:            len(bundle.Evidence),
		Activity:            len(bundle.Activity),
		Steering:            len(bundle.Steering),
		ContextPacks:        len(bundle.ContextPacks),
		TrajectorySummaries: len(bundle.TrajectorySummaries),
		ObservedEventRefs:   len(bundle.ObservedEventRefs),
	}
}

func hashJSONValue(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return hashBytes(data)
}

func hashBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}
