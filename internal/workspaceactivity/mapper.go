package workspaceactivity

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

const (
	commandPreviewLimit = 180
	messagePreviewLimit = 180
	maxFilePaths        = 12
)

type ChatRunItemContext struct {
	ConversationWorkflow *chat.ConversationWorkflowMetadata
	Event                *chat.Event
	Revision             int
}

type WorkflowEventContext struct {
	Revision       int
	StreamID       string
	StreamSequence *int
}

func ActivityRecordFromChatRunItem(item chat.RunItem, context ChatRunItemContext) (WorkspaceActivityRecord, bool, error) {
	switch item.Type {
	case chat.RunItemTypeCommandExecution:
		return commandActivityFromRunItem(item, context), true, nil
	case chat.RunItemTypeFileChange:
		return fileChangeActivityFromRunItem(item, context), true, nil
	default:
		return WorkspaceActivityRecord{}, false, nil
	}
}

func ActivityRecordsFromWorkflowEvent(event orchestrator.WorkflowEvent, context WorkflowEventContext) ([]WorkspaceActivityRecord, error) {
	records := []WorkspaceActivityRecord{}
	if record, ok := workflowStatusActivityFromEvent(event, context); ok {
		records = append(records, record)
	}
	switch event.Type {
	case orchestrator.EventRunnerApprovalRequested:
		record, err := approvalRequestedActivityFromEvent(event, context)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	case orchestrator.EventRunnerApprovalResolved:
		record, err := approvalResolvedActivityFromEvent(event, context)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, nil
}

func commandActivityFromRunItem(item chat.RunItem, context ChatRunItemContext) WorkspaceActivityRecord {
	exitCode := optionalPositiveOrZero(item.ExitCode, item.Status == chat.RunItemStatusCompleted || item.Status == chat.RunItemStatusFailed)
	durationMs := optionalPositiveOrZero(item.DurationMs, item.DurationMs > 0)
	record := baseChatRunItemRecord(item, context, ActivityKindCommand, statusFromRunItem(item.Status))
	record.Command = &WorkspaceActivityCommand{
		CommandPreview: truncateText(item.Command, commandPreviewLimit),
		Cwd:            item.Cwd,
		DurationMs:     durationMs,
		ExitCode:       exitCode,
		RunItemStatus:  item.Status,
	}
	return record
}

func fileChangeActivityFromRunItem(item chat.RunItem, context ChatRunItemContext) WorkspaceActivityRecord {
	paths, truncated := boundedStrings(item.FilePaths, maxFilePaths)
	record := baseChatRunItemRecord(item, context, ActivityKindFileChange, statusFromRunItem(item.Status))
	record.FileChange = &WorkspaceActivityFileChange{
		PathCount:      len(item.FilePaths),
		Paths:          paths,
		PathsTruncated: truncated,
		PatchStatus:    item.PatchStatus,
		RunItemStatus:  item.Status,
	}
	return record
}

func baseChatRunItemRecord(item chat.RunItem, context ChatRunItemContext, kind WorkspaceActivityKind, status WorkspaceActivityStatus) WorkspaceActivityRecord {
	provenance := WorkspaceActivityProvenance{
		ChatConversationID: item.ConversationID,
		ChatRunID:          item.RunID,
		ProviderItemID:     item.ProviderItemID,
		RunItemID:          item.ID,
	}
	if context.Event != nil {
		provenance.ChatEventID = context.Event.EventID
		provenance.ChatEventSequence = context.Event.Sequence
		provenance.ChatEventStreamID = context.Event.StreamID
	}
	if context.ConversationWorkflow != nil {
		provenance.WorkflowDefinitionID = context.ConversationWorkflow.DefinitionID
		provenance.WorkflowDefinitionVersionID = context.ConversationWorkflow.DefinitionVersionID
		provenance.WorkflowExecutionID = context.ConversationWorkflow.ExecutionID
		provenance.WorkflowNodeID = context.ConversationWorkflow.NodeID
		provenance.WorkflowNodeExecutionID = context.ConversationWorkflow.NodeExecutionID
	}
	occurredAt := firstNonEmpty(item.StartedAt, item.CreatedAt, item.CompletedAt)
	updatedAt := firstNonEmpty(item.CompletedAt, item.StartedAt, item.CreatedAt)
	return WorkspaceActivityRecord{
		ActivityID:    "chat_run_item:" + item.ID,
		DetailRef:     chatRunItemDetailRef(item),
		GraphAnchor:   anchorFromWorkflowMetadata(context.ConversationWorkflow),
		Kind:          kind,
		OccurredAt:    occurredAt,
		Provenance:    provenance,
		Revision:      context.Revision,
		SchemaVersion: SchemaVersion,
		Status:        status,
		UpdatedAt:     updatedAt,
		WorkspaceID:   item.WorkspaceID,
	}
}

func workflowStatusActivityFromEvent(event orchestrator.WorkflowEvent, context WorkflowEventContext) (WorkspaceActivityRecord, bool) {
	status, ok := statusFromWorkflowEvent(event.Type)
	if !ok {
		return WorkspaceActivityRecord{}, false
	}
	eventType := event.Type
	record := WorkspaceActivityRecord{
		ActivityID:    "workflow_event:" + event.ID,
		DetailRef:     workflowEventDetailRef(event),
		GraphAnchor:   anchorFromWorkflowEvent(event),
		Kind:          ActivityKindWorkflowStatus,
		OccurredAt:    event.CreatedAt,
		Provenance:    workflowEventProvenance(event, context),
		Revision:      context.Revision,
		SchemaVersion: SchemaVersion,
		Status:        status,
		UpdatedAt:     event.CreatedAt,
		WorkspaceID:   event.WorkspaceID,
		Workflow: &WorkspaceActivityWorkflow{
			EventID:    event.ID,
			EventType:  eventType,
			Message:    truncateText(event.Message, messagePreviewLimit),
			RunnerKind: event.RunnerKind,
		},
	}
	return record, true
}

func approvalRequestedActivityFromEvent(event orchestrator.WorkflowEvent, context WorkflowEventContext) (WorkspaceActivityRecord, error) {
	runnerEvent, err := runnerEventFromWorkflowEvent(event)
	if err != nil {
		return WorkspaceActivityRecord{}, err
	}
	var payload orchestrator.RunnerApprovalRequestedPayload
	if err := json.Unmarshal(runnerEvent.Payload, &payload); err != nil {
		return WorkspaceActivityRecord{}, fmt.Errorf("decode runner approval requested payload for %s: %w", runnerEvent.ID, err)
	}
	if payload.ApprovalID == "" {
		return WorkspaceActivityRecord{}, fmt.Errorf("runner approval requested event %s has no approval id", runnerEvent.ID)
	}
	var request chat.ApprovalRequest
	if err := json.Unmarshal(payload.Request, &request); err != nil {
		return WorkspaceActivityRecord{}, fmt.Errorf("decode chat approval request for %s: %w", runnerEvent.ID, err)
	}
	if request.ID == "" {
		request.ID = payload.ApprovalID
	}
	if request.Status == "" {
		request.Status = chat.ApprovalStatusPending
	}
	kind := request.Kind
	record := baseApprovalRecord(event, runnerEvent, context, payload.ApprovalID, approvalActivityStatus(request.Status), request.Status)
	record.Approval = &WorkspaceActivityApproval{
		ApprovalID:     payload.ApprovalID,
		CommandPreview: truncateText(request.Command, commandPreviewLimit),
		FilePath:       request.FilePath,
		Kind:           &kind,
		Permission:     request.Permission,
		Status:         request.Status,
		TargetLabel:    approvalTargetLabel(request),
		Title:          firstNonEmpty(request.Title, payload.Title),
	}
	return record, nil
}

func approvalResolvedActivityFromEvent(event orchestrator.WorkflowEvent, context WorkflowEventContext) (WorkspaceActivityRecord, error) {
	runnerEvent, err := runnerEventFromWorkflowEvent(event)
	if err != nil {
		return WorkspaceActivityRecord{}, err
	}
	var payload orchestrator.RunnerApprovalResolvedPayload
	if err := json.Unmarshal(runnerEvent.Payload, &payload); err != nil {
		return WorkspaceActivityRecord{}, fmt.Errorf("decode runner approval resolved payload for %s: %w", runnerEvent.ID, err)
	}
	status, err := decodeApprovalStatus(payload.Status)
	if err != nil {
		return WorkspaceActivityRecord{}, fmt.Errorf("decode approval resolution status for %s: %w", runnerEvent.ID, err)
	}
	record := baseApprovalRecord(event, runnerEvent, context, payload.ApprovalID, approvalActivityStatus(status), status)
	record.Approval = &WorkspaceActivityApproval{
		ApprovalID: payload.ApprovalID,
		Status:     status,
	}
	if payload.ResolvedAt != "" {
		record.UpdatedAt = payload.ResolvedAt
	}
	return record, nil
}

func baseApprovalRecord(event orchestrator.WorkflowEvent, runnerEvent orchestrator.RunnerEvent, context WorkflowEventContext, approvalID string, activityStatus WorkspaceActivityStatus, approvalStatus chat.ApprovalStatus) WorkspaceActivityRecord {
	provenance := workflowEventProvenance(event, context)
	runnerEventType := runnerEvent.Type
	provenance.RunnerEventID = runnerEvent.ID
	provenance.RunnerEventOrdinal = runnerEvent.RunnerEventOrdinal
	provenance.RunnerEventType = &runnerEventType
	return WorkspaceActivityRecord{
		ActivityID:    "workflow_approval:" + event.ExecutionID + ":" + approvalID,
		Approval:      &WorkspaceActivityApproval{ApprovalID: approvalID, Status: approvalStatus},
		DetailRef:     approvalDetailRef(event, approvalID),
		GraphAnchor:   anchorFromWorkflowEvent(event),
		Kind:          ActivityKindApproval,
		OccurredAt:    firstNonEmpty(runnerEvent.OccurredAt, event.CreatedAt),
		Provenance:    provenance,
		Revision:      context.Revision,
		SchemaVersion: SchemaVersion,
		Status:        activityStatus,
		UpdatedAt:     firstNonEmpty(runnerEvent.OccurredAt, event.CreatedAt),
		WorkspaceID:   event.WorkspaceID,
	}
}

func runnerEventFromWorkflowEvent(event orchestrator.WorkflowEvent) (orchestrator.RunnerEvent, error) {
	var details struct {
		RunnerEvent orchestrator.RunnerEvent `json:"runnerEvent"`
	}
	if err := json.Unmarshal(event.Details, &details); err != nil {
		return orchestrator.RunnerEvent{}, fmt.Errorf("decode runner event details for workflow event %s: %w", event.ID, err)
	}
	if details.RunnerEvent.ID == "" {
		return orchestrator.RunnerEvent{}, fmt.Errorf("workflow event %s has no runner event details", event.ID)
	}
	return details.RunnerEvent, nil
}

func workflowEventProvenance(event orchestrator.WorkflowEvent, context WorkflowEventContext) WorkspaceActivityProvenance {
	eventType := event.Type
	return WorkspaceActivityProvenance{
		WorkflowDefinitionID:        event.DefinitionID,
		WorkflowDefinitionVersionID: event.DefinitionVersionID,
		WorkflowEventID:             event.ID,
		WorkflowEventOrdinal:        event.Ordinal,
		WorkflowEventStreamID:       context.StreamID,
		WorkflowEventStreamSequence: context.StreamSequence,
		WorkflowEventType:           &eventType,
		WorkflowExecutionID:         event.ExecutionID,
		WorkflowNodeExecutionID:     event.NodeExecutionID,
		WorkflowNodeID:              event.NodeID,
	}
}

func chatRunItemDetailRef(item chat.RunItem) WorkspaceActivityDetailRef {
	return WorkspaceActivityDetailRef{
		ConversationID: item.ConversationID,
		Kind:           DetailKindChatRunItem,
		RunID:          item.RunID,
		RunItemID:      item.ID,
		WorkspaceID:    item.WorkspaceID,
	}
}

func workflowEventDetailRef(event orchestrator.WorkflowEvent) WorkspaceActivityDetailRef {
	return WorkspaceActivityDetailRef{
		Kind:                DetailKindWorkflowEvent,
		WorkflowEventID:     event.ID,
		WorkflowExecutionID: event.ExecutionID,
		WorkspaceID:         event.WorkspaceID,
	}
}

func approvalDetailRef(event orchestrator.WorkflowEvent, approvalID string) WorkspaceActivityDetailRef {
	return WorkspaceActivityDetailRef{
		ApprovalID:          approvalID,
		Kind:                DetailKindApproval,
		WorkflowExecutionID: event.ExecutionID,
		WorkspaceID:         event.WorkspaceID,
	}
}

func anchorFromWorkflowMetadata(metadata *chat.ConversationWorkflowMetadata) *WorkspaceActivityAnchor {
	if metadata == nil {
		return nil
	}
	kind := AnchorKindWorkflowExecution
	if metadata.NodeID != "" {
		kind = AnchorKindWorkflowNode
	}
	return &WorkspaceActivityAnchor{
		Kind:                        kind,
		WorkflowDefinitionID:        metadata.DefinitionID,
		WorkflowDefinitionVersionID: metadata.DefinitionVersionID,
		WorkflowExecutionID:         metadata.ExecutionID,
		WorkflowNodeExecutionID:     metadata.NodeExecutionID,
		WorkflowNodeID:              metadata.NodeID,
	}
}

func anchorFromWorkflowEvent(event orchestrator.WorkflowEvent) *WorkspaceActivityAnchor {
	kind := AnchorKindWorkflowExecution
	if event.NodeID != "" {
		kind = AnchorKindWorkflowNode
	}
	return &WorkspaceActivityAnchor{
		Kind:                        kind,
		WorkflowDefinitionID:        event.DefinitionID,
		WorkflowDefinitionVersionID: event.DefinitionVersionID,
		WorkflowExecutionID:         event.ExecutionID,
		WorkflowNodeExecutionID:     event.NodeExecutionID,
		WorkflowNodeID:              event.NodeID,
	}
}

func statusFromRunItem(status chat.RunItemStatus) WorkspaceActivityStatus {
	switch status {
	case chat.RunItemStatusPending:
		return ActivityStatusPending
	case chat.RunItemStatusRunning:
		return ActivityStatusRunning
	case chat.RunItemStatusCompleted:
		return ActivityStatusCompleted
	case chat.RunItemStatusFailed:
		return ActivityStatusFailed
	case chat.RunItemStatusCancelled:
		return ActivityStatusCancelled
	default:
		return ActivityStatusUnknown
	}
}

func statusFromWorkflowEvent(eventType orchestrator.WorkflowEventType) (WorkspaceActivityStatus, bool) {
	switch eventType {
	case orchestrator.EventExecutionStarted, orchestrator.EventActionStarted, orchestrator.EventRunnerAttemptStarted:
		return ActivityStatusRunning, true
	case orchestrator.EventNodeScheduled:
		return ActivityStatusPending, true
	case orchestrator.EventActionApprovalWait, orchestrator.EventActionRecoveryRequired, orchestrator.EventRunnerAttemptRecoveryRequired:
		return ActivityStatusWaitingApproval, true
	case orchestrator.EventExecutionCompleted, orchestrator.EventActionCompleted, orchestrator.EventActionRecovered, orchestrator.EventRunnerAttemptCompleted:
		return ActivityStatusCompleted, true
	case orchestrator.EventExecutionFailed, orchestrator.EventActionFailed, orchestrator.EventRunnerAttemptFailed:
		return ActivityStatusFailed, true
	case orchestrator.EventExecutionStopped, orchestrator.EventExecutionCancelled, orchestrator.EventActionCancelled, orchestrator.EventRunnerAttemptCancelled:
		return ActivityStatusCancelled, true
	default:
		return "", false
	}
}

func approvalActivityStatus(status chat.ApprovalStatus) WorkspaceActivityStatus {
	switch status {
	case chat.ApprovalStatusPending:
		return ActivityStatusWaitingApproval
	case chat.ApprovalStatusApproved:
		return ActivityStatusApproved
	case chat.ApprovalStatusDenied:
		return ActivityStatusDenied
	case chat.ApprovalStatusAnswered:
		return ActivityStatusAnswered
	case chat.ApprovalStatusCancelled:
		return ActivityStatusCancelled
	default:
		return ActivityStatusUnknown
	}
}

func decodeApprovalStatus(raw string) (chat.ApprovalStatus, error) {
	switch chat.ApprovalStatus(raw) {
	case chat.ApprovalStatusPending:
		return chat.ApprovalStatusPending, nil
	case chat.ApprovalStatusApproved:
		return chat.ApprovalStatusApproved, nil
	case chat.ApprovalStatusDenied:
		return chat.ApprovalStatusDenied, nil
	case chat.ApprovalStatusAnswered:
		return chat.ApprovalStatusAnswered, nil
	case chat.ApprovalStatusCancelled:
		return chat.ApprovalStatusCancelled, nil
	default:
		return "", fmt.Errorf("unsupported approval status %q", raw)
	}
}

func approvalTargetLabel(request chat.ApprovalRequest) string {
	switch request.Kind {
	case chat.ApprovalKindCommand:
		return truncateText(request.Command, commandPreviewLimit)
	case chat.ApprovalKindFileChange:
		return request.FilePath
	case chat.ApprovalKindPermission:
		return request.Permission
	case chat.ApprovalKindStructured:
		if request.StructuredInput != nil {
			return request.StructuredInput.ServerName
		}
	case chat.ApprovalKindUserInput:
		return request.Question
	}
	return firstNonEmpty(request.Title, request.Body)
}

func optionalPositiveOrZero(value int, include bool) *int {
	if !include {
		return nil
	}
	next := value
	return &next
}

func boundedStrings(values []string, limit int) ([]string, bool) {
	if len(values) <= limit {
		return append([]string{}, values...), false
	}
	return append([]string{}, values[:limit]...), true
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func truncateText(value string, limit int) string {
	value = strings.TrimSpace(value)
	if limit <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}
