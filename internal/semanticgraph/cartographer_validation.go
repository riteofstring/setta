package semanticgraph

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

func validateCartographerRun(ctx context.Context, run CartographerRun) error {
	if ctx == nil {
		return errors.New("context is required")
	}
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
	if err := validateCartographerInputBundle(run.InputBundle, "cartographer run input bundle"); err != nil {
		return err
	}
	if err := validateCartographerDiagnostics(run.Diagnostics); err != nil {
		return err
	}
	return validateCartographerTimestamps("cartographer run", run.CreatedAt, run.StartedAt, run.CompletedAt, run.UpdatedAt)
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
	if err := validateCartographerPatch(patch.Patch, patch.ID, patch.RunID, patch.WindowID); err != nil {
		return err
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

func validateCartographerPatch(patch CartographerPatch, patchID string, runID string, windowID string) error {
	if err := validateCartographerPatchIdentity(patch, patchID, runID, windowID); err != nil {
		return err
	}
	if patch.Confidence != nil && (*patch.Confidence < 0 || *patch.Confidence > 100) {
		return fmt.Errorf("cartographer patch confidence must be between 0 and 100")
	}
	if err := validateCartographerPatchOperations(patch.Operations); err != nil {
		return err
	}
	if err := validateCartographerPatchEvidence(patch.Evidence); err != nil {
		return err
	}
	if _, _, err := compactRawJSON(patch.RawEnvelope, "{}"); err != nil {
		return fmt.Errorf("cartographer patch raw envelope: %w", err)
	}
	return nil
}

func validateCartographerPatchIdentity(patch CartographerPatch, patchID string, runID string, windowID string) error {
	if patch.ID != patchID {
		return fmt.Errorf("cartographer patch id = %s, want %s", patch.ID, patchID)
	}
	if patch.RunID != runID {
		return fmt.Errorf("cartographer patch runId = %s, want %s", patch.RunID, runID)
	}
	if patch.WindowID != windowID {
		return fmt.Errorf("cartographer patch windowId = %s, want %s", patch.WindowID, windowID)
	}
	return nil
}

func validateCartographerPatchOperations(operations []CartographerPatchOperation) error {
	if len(operations) == 0 {
		return errors.New("cartographer patch operations are required")
	}
	for _, operation := range operations {
		if err := validateCartographerPatchOperation(operation); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerPatchOperation(operation CartographerPatchOperation) error {
	if err := validateStoreIDs("cartographer patch operation id", operation.ID); err != nil {
		return err
	}
	if err := requireNonEmpty(operation.Kind, "cartographer patch operation kind"); err != nil {
		return err
	}
	if err := requireOptionalEntityID(operation.TargetEntityID, "cartographer patch operation target entity id"); err != nil {
		return err
	}
	if _, _, err := compactRawJSON(operation.Payload, "{}"); err != nil {
		return fmt.Errorf("cartographer patch operation payload: %w", err)
	}
	return nil
}

func validateCartographerPatchEvidence(evidenceRefs []CartographerPatchEvidenceRef) error {
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
	}
	return nil
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
		func() error { return validateCartographerToolSummaries(bundle.ToolCalls, label) },
		func() error { return validateCartographerFileChanges(bundle.FileChanges, label) },
		func() error { return validateCartographerTestResults(bundle.TestResults, label) },
		func() error { return validateCartographerOutputSummaries(bundle.OutputSummaries, label) },
		func() error {
			return validateCartographerEventRefs(bundle.ObservedEventRefs, label+" observed event ref")
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
	if truncation.OriginalEventCount < 0 || truncation.IncludedEventCount < 0 ||
		truncation.OriginalContentBytes < 0 || truncation.IncludedContentBytes < 0 ||
		truncation.SegmentIndex < 0 || truncation.SegmentCount < 0 {
		return fmt.Errorf("%s truncation counts must not be negative", label)
	}
	if truncation.IncludedEventCount > truncation.OriginalEventCount && truncation.OriginalEventCount > 0 {
		return fmt.Errorf("%s truncation includedEventCount must not exceed originalEventCount", label)
	}
	return nil
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

func validateCartographerTimestamps(label string, values ...string) error {
	for _, value := range values {
		if value == "" {
			continue
		}
		if err := validateTimestamp(label+" timestamp", value); err != nil {
			return err
		}
	}
	return nil
}

func optionalIDsFromStrings(label string, values []string) []optionalStoreID {
	result := make([]optionalStoreID, 0, len(values))
	for _, value := range values {
		result = append(result, optionalStoreID{label: label, value: value})
	}
	return result
}

func validateCartographerEventRefs(values []string, label string) error {
	for _, value := range values {
		if err := validateCartographerEventRef(value, label); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerEventRef(value string, label string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.ContainsAny(value, " \t\r\n") {
		return fmt.Errorf("%s %q must not contain whitespace", label, value)
	}
	return nil
}

func validateCartographerWorkflowCursor(value string, label string) error {
	if value == "" {
		return nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return fmt.Errorf("%s must be <stream-id>:<sequence>: %s", label, value)
	}
	if err := validateStorageID(label+" stream id", streamID); err != nil {
		return err
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return fmt.Errorf("%s sequence must be a non-negative integer: %s", label, value)
	}
	return nil
}

func validateOutputOrdinalMap(values map[string]int, label string) error {
	for runItemID, ordinal := range values {
		if err := validateStoreIDs(label+" run item id", runItemID); err != nil {
			return err
		}
		if ordinal < 0 {
			return fmt.Errorf("%s ordinal for %s must not be negative: %d", label, runItemID, ordinal)
		}
	}
	return nil
}

func isCartographerRunStatus(status CartographerRunStatus) bool {
	switch status {
	case CartographerRunPending, CartographerRunRunning, CartographerRunCompleted, CartographerRunFailed:
		return true
	default:
		return false
	}
}

func isCartographerRunTriggerKind(kind CartographerRunTriggerKind) bool {
	switch kind {
	case CartographerTriggerManual, CartographerTriggerWorkflowWindow, CartographerTriggerWorkflowDone, CartographerTriggerExplicitRetry, CartographerTriggerExplicitReview:
		return true
	default:
		return false
	}
}

func isCartographerWindowStatus(status CartographerWindowStatus) bool {
	switch status {
	case CartographerWindowOpen, CartographerWindowClosed, CartographerWindowProcessed:
		return true
	default:
		return false
	}
}

func isCartographerSourceKind(kind CartographerSourceKind) bool {
	switch kind {
	case CartographerSourceWorkflowExecution, CartographerSourceChatRun, CartographerSourceSemanticTarget:
		return true
	default:
		return false
	}
}

func isCartographerTrajectoryEventSource(source CartographerTrajectoryEventSource) bool {
	switch source {
	case CartographerTrajectorySourceChat, CartographerTrajectorySourceWorkflow:
		return true
	default:
		return false
	}
}

func isCartographerWindowCloseReason(reason CartographerWindowCloseReason) bool {
	switch reason {
	case CartographerCloseRunItemTerminal,
		CartographerCloseApprovalRequired,
		CartographerCloseAssistantComplete,
		CartographerCloseAssistantThreshold,
		CartographerCloseOutputThreshold,
		CartographerCloseWorkflowNodeTerminal,
		CartographerCloseWorkflowRunTerminal,
		CartographerCloseQuietPeriod,
		CartographerCloseManual:
		return true
	default:
		return false
	}
}

func isCartographerPatchStatus(status CartographerPatchStatus) bool {
	switch status {
	case CartographerPatchProposed, CartographerPatchValidated, CartographerPatchRejected, CartographerPatchApplied:
		return true
	default:
		return false
	}
}

func isCartographerDiagnosticSeverity(severity CartographerDiagnosticSeverity) bool {
	switch severity {
	case CartographerDiagnosticInfo, CartographerDiagnosticWarning, CartographerDiagnosticError:
		return true
	default:
		return false
	}
}
