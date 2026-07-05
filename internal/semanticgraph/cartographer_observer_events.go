package semanticgraph

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

type cartographerChatEventDecoder func(observedCartographerEvent, json.RawMessage) (observedCartographerEvent, error)

var cartographerChatEventDecoders = map[string]cartographerChatEventDecoder{
	chat.EventTypeMessageCreated:     decodeCartographerMessageCreated,
	chat.EventTypeMessageUpdated:     decodeCartographerMessageUpdated,
	chat.EventTypeAssistantTextDelta: decodeCartographerAssistantTextDelta,
	chat.EventTypeRunUpdated:         decodeCartographerRunUpdated,
	chat.EventTypeRunItemCreated:     decodeCartographerRunItemCreated,
	chat.EventTypeRunItemUpdated:     decodeCartographerRunItemUpdated,
	chat.EventTypeRunItemOutputDelta: decodeCartographerRunItemOutputDelta,
}

func (service *Service) cartographerObservedChatEvent(event chat.Event) (observedCartographerEvent, bool, error) {
	decode, ok := cartographerChatEventDecoders[event.Type]
	if !ok {
		return observedCartographerEvent{}, false, nil
	}
	refs, ok, err := service.cartographerChatSourceRefs(event)
	if err != nil || !ok {
		return observedCartographerEvent{}, ok, err
	}
	observed := observedCartographerEvent{
		source:      CartographerTrajectorySourceChat,
		workspaceID: event.WorkspaceID,
		eventID:     event.EventID,
		eventType:   event.Type,
		streamID:    event.StreamID,
		sequence:    event.Sequence,
		occurredAt:  event.EmittedAt,
		sourceRefs:  refs,
	}
	observed, err = decode(observed, event.Payload)
	return observed, err == nil, err
}

func decodeCartographerMessageCreated(observed observedCartographerEvent, raw json.RawMessage) (observedCartographerEvent, error) {
	var payload chat.MessageCreatedPayload
	if err := decodeCartographerPayload(raw, &payload, chat.EventTypeMessageCreated); err != nil {
		return observedCartographerEvent{}, err
	}
	return observed.withMessage(payload.Message), nil
}

func decodeCartographerMessageUpdated(observed observedCartographerEvent, raw json.RawMessage) (observedCartographerEvent, error) {
	var payload chat.MessageUpdatedPayload
	if err := decodeCartographerPayload(raw, &payload, chat.EventTypeMessageUpdated); err != nil {
		return observedCartographerEvent{}, err
	}
	return observed.withMessage(payload.Message), nil
}

func decodeCartographerAssistantTextDelta(observed observedCartographerEvent, raw json.RawMessage) (observedCartographerEvent, error) {
	var payload chat.AssistantTextDeltaPayload
	if err := decodeCartographerPayload(raw, &payload, chat.EventTypeAssistantTextDelta); err != nil {
		return observedCartographerEvent{}, err
	}
	observed.chatMessageID = payload.MessageID
	observed.content = payload.Delta
	observed.summary = "assistant text delta: " + boundedText(payload.Delta, cartographerEventSummaryLimit).text
	return observed, nil
}

func decodeCartographerRunUpdated(observed observedCartographerEvent, raw json.RawMessage) (observedCartographerEvent, error) {
	var payload chat.RunUpdatedPayload
	if err := decodeCartographerPayload(raw, &payload, chat.EventTypeRunUpdated); err != nil {
		return observedCartographerEvent{}, err
	}
	observed.run = &payload.Run
	observed.runStatus = string(payload.Run.Status)
	observed.summary = chatRunObservationSummary(payload.Run)
	observed.closeReason = chatRunCloseReason(payload.Run)
	return observed, nil
}

func decodeCartographerRunItemCreated(observed observedCartographerEvent, raw json.RawMessage) (observedCartographerEvent, error) {
	var payload chat.RunItemCreatedPayload
	if err := decodeCartographerPayload(raw, &payload, chat.EventTypeRunItemCreated); err != nil {
		return observedCartographerEvent{}, err
	}
	return observed.withRunItem(payload.Item), nil
}

func decodeCartographerRunItemUpdated(observed observedCartographerEvent, raw json.RawMessage) (observedCartographerEvent, error) {
	var payload chat.RunItemUpdatedPayload
	if err := decodeCartographerPayload(raw, &payload, chat.EventTypeRunItemUpdated); err != nil {
		return observedCartographerEvent{}, err
	}
	return observed.withRunItem(payload.Item), nil
}

func decodeCartographerRunItemOutputDelta(observed observedCartographerEvent, raw json.RawMessage) (observedCartographerEvent, error) {
	var payload chat.RunItemOutputDeltaPayload
	if err := decodeCartographerPayload(raw, &payload, chat.EventTypeRunItemOutputDelta); err != nil {
		return observedCartographerEvent{}, err
	}
	observed.runItemID = payload.Output.RunItemID
	observed.outputStream = payload.Output.Stream
	observed.outputOrdinal = payload.Output.Ordinal
	observed.content = payload.Output.Text
	observed.summary = fmt.Sprintf("run item output delta %s#%d: %s", payload.Output.RunItemID, payload.Output.Ordinal, boundedText(payload.Output.Text, cartographerEventSummaryLimit).text)
	return observed, nil
}

var cartographerWorkflowEventTypes = map[orchestrator.WorkflowEventType]struct{}{
	orchestrator.EventExecutionStarted:               {},
	orchestrator.EventActionStarted:                  {},
	orchestrator.EventActionCompleted:                {},
	orchestrator.EventActionFailed:                   {},
	orchestrator.EventActionCancelled:                {},
	orchestrator.EventActionApprovalWait:             {},
	orchestrator.EventRunnerRefsAttached:             {},
	orchestrator.EventExecutionCompleted:             {},
	orchestrator.EventExecutionFailed:                {},
	orchestrator.EventExecutionStopped:               {},
	orchestrator.EventExecutionCancelled:             {},
	orchestrator.EventRunnerToolCallOutput:           {},
	orchestrator.EventRunnerApprovalRequested:        {},
	orchestrator.EventRunnerStructuredOutputReceived: {},
	orchestrator.EventRunnerAttemptCompleted:         {},
	orchestrator.EventRunnerAttemptFailed:            {},
	orchestrator.EventRunnerAttemptCancelled:         {},
	orchestrator.EventRunnerAttemptRecoveryRequired:  {},
}

func cartographerObservedWorkflowEvent(envelope orchestrator.WorkflowEventEnvelope) (observedCartographerEvent, bool, error) {
	event := envelope.Event
	if _, ok := cartographerWorkflowEventTypes[event.Type]; !ok {
		return observedCartographerEvent{}, false, nil
	}
	observed := observedCartographerEvent{
		workspaceID:         event.WorkspaceID,
		source:              CartographerTrajectorySourceWorkflow,
		eventID:             event.ID,
		eventType:           string(event.Type),
		streamID:            envelope.StreamID,
		sequence:            envelope.Sequence,
		workflowEventCursor: fmt.Sprintf("%s:%d", envelope.StreamID, envelope.Sequence),
		occurredAt:          event.CreatedAt,
		sourceRefs:          cartographerWorkflowSourceRefs(event),
		summary:             workflowEventObservationSummary(event),
		closeReason:         workflowEventCloseReason(event.Type),
	}
	if !isRunnerWorkflowEvent(event.Type) {
		return observed, true, nil
	}
	runnerEvent, err := decodeRunnerWorkflowEventDetails(event)
	if err != nil {
		return observedCartographerEvent{}, false, err
	}
	observed.content = string(runnerEvent.Payload)
	return observed, true, nil
}

func cartographerWorkflowSourceRefs(event orchestrator.WorkflowEvent) SemanticContextSourceRefs {
	return SemanticContextSourceRefs{
		WorkflowDefinitionID:    event.DefinitionID,
		WorkflowExecutionID:     event.ExecutionID,
		WorkflowNodeID:          event.NodeID,
		WorkflowNodeExecutionID: event.NodeExecutionID,
	}
}

func workflowEventCloseReason(eventType orchestrator.WorkflowEventType) CartographerWindowCloseReason {
	switch eventType {
	case orchestrator.EventActionApprovalWait, orchestrator.EventRunnerApprovalRequested:
		return CartographerCloseApprovalRequired
	case orchestrator.EventActionCompleted,
		orchestrator.EventActionFailed,
		orchestrator.EventActionCancelled,
		orchestrator.EventRunnerAttemptCompleted,
		orchestrator.EventRunnerAttemptFailed,
		orchestrator.EventRunnerAttemptCancelled,
		orchestrator.EventRunnerAttemptRecoveryRequired:
		return CartographerCloseWorkflowNodeTerminal
	case orchestrator.EventExecutionCompleted,
		orchestrator.EventExecutionFailed,
		orchestrator.EventExecutionStopped,
		orchestrator.EventExecutionCancelled:
		return CartographerCloseWorkflowRunTerminal
	case orchestrator.EventRunnerToolCallOutput,
		orchestrator.EventRunnerStructuredOutputReceived:
		return CartographerCloseRunItemTerminal
	default:
		return ""
	}
}

func (service *Service) enrichWorkflowObservedEventRefs(observed *observedCartographerEvent, event orchestrator.WorkflowEvent) error {
	if observed == nil || service.workflowResolver == nil || event.ExecutionID == "" || event.NodeExecutionID == "" {
		return nil
	}
	execution, err := service.workflowResolver.ReadExecution(event.WorkspaceID, event.ExecutionID)
	if err != nil {
		return err
	}
	if enrichObservedEventFromExecution(observed, execution, event.NodeExecutionID) {
		return nil
	}
	return service.enrichWorkflowObservedEventFromDetails(observed, event)
}

func enrichObservedEventFromExecution(observed *observedCartographerEvent, execution orchestrator.WorkflowExecution, nodeExecutionID string) bool {
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.ID != nodeExecutionID {
			continue
		}
		observed.sourceRefs.ChatConversationID = firstNonEmpty(observed.sourceRefs.ChatConversationID, workflowRunnerRefValue(nodeExecution.RunnerRefs, orchestrator.RunnerRefChatConversation))
		observed.sourceRefs.ChatRunID = firstNonEmpty(observed.sourceRefs.ChatRunID, workflowRunnerRefValue(nodeExecution.RunnerRefs, orchestrator.RunnerRefChatRun))
		return true
	}
	return false
}

func (service *Service) enrichWorkflowObservedEventFromDetails(observed *observedCartographerEvent, event orchestrator.WorkflowEvent) error {
	if event.Type != orchestrator.EventRunnerRefsAttached {
		return nil
	}
	var details struct {
		RunnerRefs []orchestrator.WorkflowActionRunnerRef `json:"runnerRefs"`
	}
	if err := json.Unmarshal(event.Details, &details); err != nil {
		return fmt.Errorf("decode workflow runner refs attached details %s: %w", event.ID, err)
	}
	observed.sourceRefs.ChatConversationID = firstNonEmpty(observed.sourceRefs.ChatConversationID, workflowRunnerRefValue(details.RunnerRefs, orchestrator.RunnerRefChatConversation))
	observed.sourceRefs.ChatRunID = firstNonEmpty(observed.sourceRefs.ChatRunID, workflowRunnerRefValue(details.RunnerRefs, orchestrator.RunnerRefChatRun))
	return nil
}

func workflowRunnerRefValue(refs []orchestrator.WorkflowActionRunnerRef, kind string) string {
	for _, ref := range refs {
		if ref.Kind == kind {
			return ref.ID
		}
	}
	return ""
}

func (service *Service) cartographerChatSourceRefs(event chat.Event) (SemanticContextSourceRefs, bool, error) {
	if event.WorkspaceID == "" || event.ConversationID == "" || event.RunID == "" {
		return SemanticContextSourceRefs{}, false, nil
	}
	refs := SemanticContextSourceRefs{
		ChatConversationID: event.ConversationID,
		ChatRunID:          event.RunID,
	}
	if service.chatResolver == nil {
		return refs, true, nil
	}
	conversation, err := service.chatResolver.ReadConversation(event.WorkspaceID, event.ConversationID)
	if err != nil {
		return SemanticContextSourceRefs{}, false, err
	}
	if conversation.Workflow != nil {
		refs.WorkflowDefinitionID = conversation.Workflow.DefinitionID
		refs.WorkflowExecutionID = conversation.Workflow.ExecutionID
		refs.WorkflowNodeID = conversation.Workflow.NodeID
		refs.WorkflowNodeExecutionID = conversation.Workflow.NodeExecutionID
	}
	return refs, true, nil
}

func (observed observedCartographerEvent) withMessage(message chat.ChatMessage) observedCartographerEvent {
	observed.chatMessageID = message.ID
	observed.sourceRefs.ChatMessageID = message.ID
	text := chatMessageText(message)
	observed.content = text
	switch message.Role {
	case chat.RoleUser:
		observed.summary = "user/workflow prompt message: " + boundedText(text, cartographerEventSummaryLimit).text
	case chat.RoleAssistant:
		observed.summary = "assistant message " + string(message.Status) + ": " + boundedText(text, cartographerEventSummaryLimit).text
		if isTerminalChatMessageStatus(message.Status) {
			observed.closeReason = CartographerCloseAssistantComplete
		}
	default:
		observed.summary = string(message.Role) + " message " + string(message.Status)
	}
	return observed
}

func (observed observedCartographerEvent) withRunItem(item chat.RunItem) observedCartographerEvent {
	observed.item = &item
	observed.runItemID = item.ID
	observed.runItemType = string(item.Type)
	observed.runItemStatus = string(item.Status)
	observed.sourceRefs.RunItemID = item.ID
	observed.summary = chatRunItemObservationSummary(item)
	content := []string{item.Summary, item.Result, item.Error}
	if details, ok := item.MCPToolCallDetails(); ok {
		content = []string{item.Summary, details.ResultSummary, details.Progress, details.Error}
	} else if details, ok := item.FileChangeDetails(); ok {
		content = []string{item.Summary, chatFileChangeDetailSummary(details)}
	} else if details, ok := item.DiffDetails(); ok {
		content = []string{item.Summary, chatDiffDetailSummary(details)}
	}
	observed.content = strings.Join(content, "\n")
	observed.closeReason = chatRunItemCloseReason(item)
	return observed
}

func chatRunCloseReason(run chat.Run) CartographerWindowCloseReason {
	if run.PendingApproval != nil {
		return CartographerCloseApprovalRequired
	}
	if isTerminalChatRunStatus(run.Status) {
		return CartographerCloseWorkflowRunTerminal
	}
	return ""
}

func chatRunItemCloseReason(item chat.RunItem) CartographerWindowCloseReason {
	if item.Type == chat.RunItemTypeApprovalReview && item.Status == chat.RunItemStatusRunning {
		return CartographerCloseApprovalRequired
	}
	if isTerminalChatRunItemStatus(item.Status) {
		return CartographerCloseRunItemTerminal
	}
	return ""
}

func decodeCartographerPayload(raw json.RawMessage, target any, eventType string) error {
	if err := json.Unmarshal(raw, target); err != nil {
		return fmt.Errorf("decode %s payload for cartographer observer: %w", eventType, err)
	}
	return nil
}

func decodeRunnerWorkflowEventDetails(event orchestrator.WorkflowEvent) (orchestrator.RunnerEvent, error) {
	var details struct {
		RunnerEvent orchestrator.RunnerEvent `json:"runnerEvent"`
	}
	if err := json.Unmarshal(event.Details, &details); err != nil {
		return orchestrator.RunnerEvent{}, fmt.Errorf("decode workflow runner event details %s: %w", event.ID, err)
	}
	if details.RunnerEvent.Type == "" {
		return orchestrator.RunnerEvent{}, fmt.Errorf("workflow runner event details %s missing runnerEvent", event.ID)
	}
	return details.RunnerEvent, nil
}

func isRunnerWorkflowEvent(eventType orchestrator.WorkflowEventType) bool {
	return strings.HasPrefix(string(eventType), "runner.")
}

func chatRunObservationSummary(run chat.Run) string {
	if run.PendingApproval != nil {
		return fmt.Sprintf("chat run %s waiting for %s approval %s", run.ID, run.PendingApproval.Kind, run.PendingApproval.ID)
	}
	if run.Error != "" {
		return fmt.Sprintf("chat run %s %s: %s", run.ID, run.Status, run.Error)
	}
	return fmt.Sprintf("chat run %s %s: %s", run.ID, run.Status, run.PromptSummary)
}

func chatRunItemObservationSummary(item chat.RunItem) string {
	parts := []string{fmt.Sprintf("run item %s %s %s", item.ID, item.Type, item.Status)}
	values := []string{item.Title, item.Summary, item.Progress, item.Result, item.Error}
	if details, ok := item.MCPToolCallDetails(); ok {
		values = []string{firstNonEmpty(item.Title, details.DisplayTitle), item.Summary, details.Progress, details.ResultSummary, details.Error}
	} else if details, ok := item.FileChangeDetails(); ok {
		values = []string{item.Title, item.Summary, chatFileChangeDetailSummary(details)}
	} else if details, ok := item.DiffDetails(); ok {
		values = []string{item.Title, item.Summary, chatDiffDetailSummary(details)}
	}
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			parts = append(parts, strings.TrimSpace(value))
		}
	}
	return boundedText(strings.Join(parts, ": "), cartographerEventSummaryLimit).text
}

func workflowEventObservationSummary(event orchestrator.WorkflowEvent) string {
	if event.Message != "" {
		return fmt.Sprintf("%s: %s", event.Type, event.Message)
	}
	return string(event.Type)
}

func isTerminalChatRunStatus(status chat.RunStatus) bool {
	switch status {
	case chat.RunStatusCompleted, chat.RunStatusFailed, chat.RunStatusCancelled:
		return true
	default:
		return false
	}
}

func isTerminalChatMessageStatus(status chat.MessageStatus) bool {
	switch status {
	case chat.MessageStatusComplete, chat.MessageStatusCancelled, chat.MessageStatusError:
		return true
	default:
		return false
	}
}

func isTerminalChatRunItemStatus(status chat.RunItemStatus) bool {
	switch status {
	case chat.RunItemStatusCompleted, chat.RunItemStatusFailed, chat.RunItemStatusCancelled:
		return true
	default:
		return false
	}
}

func isToolLikeRunItem(itemType chat.RunItemType) bool {
	switch itemType {
	case chat.RunItemTypeCommandExecution,
		chat.RunItemTypeMCPToolCall,
		chat.RunItemTypeCollabAgentToolCall,
		chat.RunItemTypeWebSearch,
		chat.RunItemTypeImageView,
		chat.RunItemTypeImageGeneration,
		chat.RunItemTypeTerminalInteraction,
		chat.RunItemTypeStructuredInput:
		return true
	default:
		return false
	}
}
