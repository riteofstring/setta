package semanticgraph

import (
	"encoding/json"
	"fmt"
)

func scanCartographerRun(scanner interface{ Scan(dest ...any) error }) (CartographerRun, error) {
	var run CartographerRun
	var inputBundleJSON string
	var outputSchemaJSON string
	var inputItemCountsJSON string
	var createdEventIDsJSON string
	var diagnosticsJSON string
	if err := scanner.Scan(
		&run.WorkspaceID,
		&run.ID,
		&run.Status,
		&run.TriggerKind,
		&run.TargetEntityID,
		&run.SourceRefs.WorkflowDefinitionID,
		&run.SourceRefs.WorkflowExecutionID,
		&run.SourceRefs.WorkflowNodeID,
		&run.SourceRefs.WorkflowNodeExecutionID,
		&run.SourceRefs.ChatConversationID,
		&run.SourceRefs.ChatRunID,
		&run.SourceRefs.ChatMessageID,
		&run.SourceRefs.RunItemID,
		&inputBundleJSON,
		&outputSchemaJSON,
		&run.HarnessKind,
		&run.Model,
		&run.RequestID,
		&run.ResponseID,
		&run.WindowID,
		&run.SourceEpochID,
		&run.SourceKey,
		&run.Priority,
		&run.LeaseOwner,
		&run.LeaseDeadline,
		&run.AttemptCount,
		&run.InputBundleHash,
		&inputItemCountsJSON,
		&run.RawHarnessResponseHash,
		&run.TrajectorySummary,
		&createdEventIDsJSON,
		&diagnosticsJSON,
		&run.CreatedAt,
		&run.StartedAt,
		&run.CompletedAt,
		&run.UpdatedAt,
		&run.Error,
	); err != nil {
		return CartographerRun{}, err
	}
	if err := unmarshalJSONColumn(inputBundleJSON, &run.InputBundle); err != nil {
		return CartographerRun{}, fmt.Errorf("decode cartographer run input bundle: %w", err)
	}
	run.OutputSchema = rawJSONFromString(outputSchemaJSON)
	if err := unmarshalJSONColumn(inputItemCountsJSON, &run.InputItemCounts); err != nil {
		return CartographerRun{}, fmt.Errorf("decode cartographer run input item counts: %w", err)
	}
	if err := unmarshalJSONColumn(createdEventIDsJSON, &run.CreatedSemanticEventIDs); err != nil {
		return CartographerRun{}, fmt.Errorf("decode cartographer run created semantic event ids: %w", err)
	}
	if err := unmarshalJSONColumn(diagnosticsJSON, &run.Diagnostics); err != nil {
		return CartographerRun{}, fmt.Errorf("decode cartographer run diagnostics: %w", err)
	}
	normalizeCartographerRun(&run)
	return run, nil
}

func scanCartographerWindow(scanner interface{ Scan(dest ...any) error }) (CartographerWindow, error) {
	var window CartographerWindow
	var inputBundleJSON string
	if err := scanner.Scan(
		&window.WorkspaceID,
		&window.ID,
		&window.RunID,
		&window.Status,
		&window.Sequence,
		&window.SourceKind,
		&window.SourceID,
		&window.CursorID,
		&window.SummaryID,
		&inputBundleJSON,
		&window.OpenedAt,
		&window.ClosedAt,
		&window.CreatedAt,
		&window.UpdatedAt,
	); err != nil {
		return CartographerWindow{}, err
	}
	if err := unmarshalJSONColumn(inputBundleJSON, &window.InputBundle); err != nil {
		return CartographerWindow{}, fmt.Errorf("decode cartographer window input bundle: %w", err)
	}
	normalizeCartographerInputBundle(&window.InputBundle)
	return window, nil
}

func scanCartographerCursor(scanner interface{ Scan(dest ...any) error }) (CartographerCursor, error) {
	var cursor CartographerCursor
	var outputOrdinalsJSON string
	if err := scanner.Scan(
		&cursor.WorkspaceID,
		&cursor.ID,
		&cursor.WorkflowExecutionID,
		&cursor.WorkflowNodeExecutionID,
		&cursor.ChatConversationID,
		&cursor.ChatRunID,
		&cursor.LastChatEventStreamID,
		&cursor.LastChatEventSequence,
		&cursor.LastWorkflowEventCursor,
		&outputOrdinalsJSON,
		&cursor.LastWindowID,
		&cursor.UpdatedAt,
	); err != nil {
		return CartographerCursor{}, err
	}
	if err := unmarshalJSONColumn(outputOrdinalsJSON, &cursor.LastOutputOrdinalByRunItem); err != nil {
		return CartographerCursor{}, fmt.Errorf("decode cartographer cursor output ordinals: %w", err)
	}
	normalizeCartographerCursor(&cursor)
	return cursor, nil
}

func scanCartographerTrajectorySummary(scanner interface{ Scan(dest ...any) error }) (CartographerTrajectorySummary, error) {
	var summary CartographerTrajectorySummary
	if err := scanner.Scan(
		&summary.WorkspaceID,
		&summary.ID,
		&summary.RunID,
		&summary.WindowID,
		&summary.SourceKind,
		&summary.SourceID,
		&summary.Summary,
		&summary.SourceRefs.WorkflowDefinitionID,
		&summary.SourceRefs.WorkflowExecutionID,
		&summary.SourceRefs.WorkflowNodeID,
		&summary.SourceRefs.WorkflowNodeExecutionID,
		&summary.SourceRefs.ChatConversationID,
		&summary.SourceRefs.ChatRunID,
		&summary.SourceRefs.ChatMessageID,
		&summary.SourceRefs.RunItemID,
		&summary.ItemCount,
		&summary.CreatedAt,
	); err != nil {
		return CartographerTrajectorySummary{}, err
	}
	return summary, nil
}

func scanCartographerPatchRecord(scanner interface{ Scan(dest ...any) error }) (CartographerPatchRecord, error) {
	var patch CartographerPatchRecord
	var patchJSON string
	var validationJSON string
	var applicationJSON string
	var createdEventIDsJSON string
	if err := scanner.Scan(
		&patch.WorkspaceID,
		&patch.ID,
		&patch.RunID,
		&patch.WindowID,
		&patch.Status,
		&patchJSON,
		&validationJSON,
		&applicationJSON,
		&createdEventIDsJSON,
		&patch.CreatedAt,
		&patch.ValidatedAt,
		&patch.AppliedAt,
	); err != nil {
		return CartographerPatchRecord{}, err
	}
	if err := unmarshalJSONColumn(patchJSON, &patch.Patch); err != nil {
		return CartographerPatchRecord{}, fmt.Errorf("decode cartographer patch: %w", err)
	}
	if err := unmarshalJSONColumn(validationJSON, &patch.ValidationResult); err != nil {
		return CartographerPatchRecord{}, fmt.Errorf("decode cartographer validation result: %w", err)
	}
	if err := unmarshalJSONColumn(applicationJSON, &patch.ApplicationResult); err != nil {
		return CartographerPatchRecord{}, fmt.Errorf("decode cartographer application result: %w", err)
	}
	if err := unmarshalJSONColumn(createdEventIDsJSON, &patch.CreatedSemanticEventIDs); err != nil {
		return CartographerPatchRecord{}, fmt.Errorf("decode cartographer created semantic event ids: %w", err)
	}
	normalizeCartographerPatchRecord(&patch)
	return patch, nil
}

func unmarshalJSONColumn(raw string, target any) error {
	if raw == "" {
		raw = "{}"
	}
	return json.Unmarshal([]byte(raw), target)
}

func normalizeCartographerRun(run *CartographerRun) {
	normalizeCartographerInputBundle(&run.InputBundle)
	if run.CreatedSemanticEventIDs == nil {
		run.CreatedSemanticEventIDs = []string{}
	}
	if run.Diagnostics == nil {
		run.Diagnostics = []CartographerDiagnostic{}
	}
}

func normalizeCartographerCursor(cursor *CartographerCursor) {
	if cursor.LastOutputOrdinalByRunItem == nil {
		cursor.LastOutputOrdinalByRunItem = map[string]int{}
	}
}

func normalizeCartographerPatchRecord(patch *CartographerPatchRecord) {
	if patch.CreatedSemanticEventIDs == nil {
		patch.CreatedSemanticEventIDs = []string{}
	}
	normalizeCartographerPatch(&patch.Patch)
	if patch.ValidationResult.Diagnostics == nil {
		patch.ValidationResult.Diagnostics = []CartographerDiagnostic{}
	}
	if patch.ApplicationResult.CreatedSemanticEventIDs == nil {
		patch.ApplicationResult.CreatedSemanticEventIDs = []string{}
	}
	if patch.ApplicationResult.Diagnostics == nil {
		patch.ApplicationResult.Diagnostics = []CartographerDiagnostic{}
	}
}

func normalizeCartographerPatch(patch *CartographerPatch) {
	if patch.EvidenceRefs == nil {
		patch.EvidenceRefs = []CartographerPatchEvidenceRef{}
	}
	normalizeCartographerPatchPayload(&patch.Payload)
	normalizeCartographerPatchModelInfo(patch)
}

func normalizeCartographerPatchPayload(payload *CartographerPatchPayload) {
	payload.EvidenceRefs = nonNilSlice(payload.EvidenceRefs)
	payload.NewNodes = nonNilSlice(payload.NewNodes)
	payload.SourceNodeIDs = nonNilSlice(payload.SourceNodeIDs)
	normalizeCartographerPatchPayloadNodes(payload)
	payload.Reassignments.Edges = nonNilSlice(payload.Reassignments.Edges)
	payload.Reassignments.Evidence = nonNilSlice(payload.Reassignments.Evidence)
	payload.Reassignments.Activity = nonNilSlice(payload.Reassignments.Activity)
	payload.Reassignments.Steering = nonNilSlice(payload.Reassignments.Steering)
	payload.Reassignments.Layout = nonNilSlice(payload.Reassignments.Layout)
}

func normalizeCartographerPatchPayloadNodes(payload *CartographerPatchPayload) {
	for index := range payload.NewNodes {
		if payload.NewNodes[index].EvidenceRefs == nil {
			payload.NewNodes[index].EvidenceRefs = []CartographerPatchEvidenceRef{}
		}
	}
	if payload.NewNode != nil && payload.NewNode.EvidenceRefs == nil {
		payload.NewNode.EvidenceRefs = []CartographerPatchEvidenceRef{}
	}
	if payload.TargetNode != nil && payload.TargetNode.EvidenceRefs == nil {
		payload.TargetNode.EvidenceRefs = []CartographerPatchEvidenceRef{}
	}
}

func normalizeCartographerPatchModelInfo(patch *CartographerPatch) {
	if patch.ModelInfo == nil {
		patch.ModelInfo = map[string]string{}
	}
}

func normalizeCartographerInputBundle(bundle *CartographerInputBundle) {
	normalizeCartographerWindowCursorMap(&bundle.WindowStartCursor)
	normalizeCartographerWindowCursorMap(&bundle.WindowEndCursor)
	bundle.NewEvents = nonNilSlice(bundle.NewEvents)
	for index := range bundle.NewEvents {
		if bundle.NewEvents[index].CloseReason == "" {
			bundle.NewEvents[index].CloseReason = CartographerCloseNone
		}
	}
	bundle.Observations = nonNilSlice(bundle.Observations)
	for index := range bundle.Observations {
		bundle.Observations[index].FilePaths = nonNilSlice(bundle.Observations[index].FilePaths)
	}
	bundle.ToolCalls = nonNilSlice(bundle.ToolCalls)
	bundle.FileChanges = nonNilSlice(bundle.FileChanges)
	bundle.TestResults = nonNilSlice(bundle.TestResults)
	bundle.OutputSummaries = nonNilSlice(bundle.OutputSummaries)
	bundle.ExistingNodes = nonNilSlice(bundle.ExistingNodes)
	bundle.ExistingEdges = nonNilSlice(bundle.ExistingEdges)
	bundle.Evidence = nonNilSlice(bundle.Evidence)
	bundle.Activity = nonNilSlice(bundle.Activity)
	bundle.Steering = nonNilSlice(bundle.Steering)
	bundle.ContextPacks = nonNilSlice(bundle.ContextPacks)
	bundle.TrajectorySummaries = nonNilSlice(bundle.TrajectorySummaries)
	bundle.ObservedEventRefs = nonNilSlice(bundle.ObservedEventRefs)
	bundle.Truncation.Reasons = nonNilSlice(bundle.Truncation.Reasons)
}

func normalizeCartographerWindowCursorMap(cursor *CartographerWindowCursor) {
	cursor.OutputOrdinalByRunItem = nonNilIntMap(cursor.OutputOrdinalByRunItem)
}

func nonNilSlice[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}

func nonNilIntMap(items map[string]int) map[string]int {
	if items == nil {
		return map[string]int{}
	}
	return items
}
