package semanticgraph

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

type cartographerInputBundleRequest struct {
	workspaceID       string
	triggerKind       CartographerRunTriggerKind
	targetEntityID    string
	sourceRefs        SemanticContextSourceRefs
	runStatus         string
	terminalReason    string
	windowID          string
	windowStartCursor CartographerWindowCursor
	windowEndCursor   CartographerWindowCursor
	closeReason       CartographerWindowCloseReason
	events            []CartographerTrajectoryEvent
}

func (service *Service) newCartographerInputBundle(ctx context.Context, request cartographerInputBundleRequest) (CartographerInputBundle, error) {
	sourceKind, sourceID, err := cartographerSourceFromRefs(request.sourceRefs, request.targetEntityID)
	if err != nil {
		return CartographerInputBundle{}, err
	}
	priorSummaries, err := service.store.ListCartographerTrajectorySummaries(ctx, request.workspaceID, sourceKind, sourceID, service.cartographerConfig.PriorSummaryLimit)
	if err != nil {
		return CartographerInputBundle{}, err
	}
	evidence, activity, steering, contextPacks, nodes, edges, err := service.cartographerContextForRefs(ctx, request.workspaceID, request.sourceRefs)
	if err != nil {
		return CartographerInputBundle{}, err
	}
	bundle := CartographerInputBundle{
		WorkspaceID:         request.workspaceID,
		TriggerKind:         request.triggerKind,
		SourceRefs:          request.sourceRefs,
		TargetEntityID:      request.targetEntityID,
		RunStatus:           request.runStatus,
		TerminalReason:      request.terminalReason,
		WindowID:            request.windowID,
		WindowStartCursor:   request.windowStartCursor,
		WindowEndCursor:     request.windowEndCursor,
		NewEvents:           append([]CartographerTrajectoryEvent{}, request.events...),
		Observations:        cartographerObservationRecordsFromTrajectoryEvents(request.workspaceID, request.events),
		ExistingNodes:       nodes,
		ExistingEdges:       edges,
		Evidence:            evidence,
		Activity:            activity,
		Steering:            steering,
		ContextPacks:        contextPacks,
		TrajectorySummaries: priorSummaries,
		TokenBudget:         service.cartographerConfig.TokenBudget,
	}
	if request.closeReason != "" {
		bundle.Truncation.Reasons = appendUniqueString(bundle.Truncation.Reasons, string(request.closeReason))
	}
	if err := service.expandCartographerInputWithRetrieval(ctx, &bundle); err != nil {
		return CartographerInputBundle{}, err
	}
	normalizeCartographerInputBundle(&bundle)
	return applyCartographerInputLimits(bundle, service.cartographerConfig), nil
}

func (service *Service) cartographerContextForRefs(ctx context.Context, workspaceID string, refs SemanticContextSourceRefs) ([]SemanticEvidenceAnchor, []SemanticActivityInterval, []SemanticSteeringDirective, []SemanticContextPackRecord, []SemanticNode, []SemanticEdge, error) {
	evidence, err := service.store.loadEvidenceBySourceRefs(ctx, workspaceID, refs)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, err
	}
	activity, err := service.store.loadActivityBySourceRefs(ctx, workspaceID, refs, cartographerContextActivityLimit)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, err
	}
	steering, err := service.store.loadActiveSteeringForContext(ctx, workspaceID)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, err
	}
	contextPacks, err := service.store.ListContextPacks(ctx, SemanticContextPackFilter{
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: refs.WorkflowExecutionID,
		ChatRunID:           refs.ChatRunID,
		Limit:               service.cartographerConfig.PriorSummaryLimit,
	})
	if err != nil {
		return nil, nil, nil, nil, nil, nil, err
	}
	nodes, edges, err := service.cartographerExistingSubgraph(ctx, workspaceID, refs, evidence, activity, steering, contextPacks.Packs)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, err
	}
	return evidence, activity, steering, contextPacks.Packs, nodes, edges, nil
}

func (service *Service) cartographerExistingSubgraph(ctx context.Context, workspaceID string, refs SemanticContextSourceRefs, evidence []SemanticEvidenceAnchor, activity []SemanticActivityInterval, steering []SemanticSteeringDirective, contextPacks []SemanticContextPackRecord) ([]SemanticNode, []SemanticEdge, error) {
	graph, err := service.store.ReadGraph(ctx, workspaceID)
	if err != nil {
		return nil, nil, err
	}
	associated := cartographerAssociatedNodes(refs, evidence, activity, steering, contextPacks)
	return cartographerAssociatedSubgraph(graph, associated), cartographerAssociatedEdges(graph, associated), nil
}

func cartographerAssociatedNodes(refs SemanticContextSourceRefs, evidence []SemanticEvidenceAnchor, activity []SemanticActivityInterval, steering []SemanticSteeringDirective, contextPacks []SemanticContextPackRecord) map[string]bool {
	associated := contextAssociatedNodes(evidence, activity, steering, refs)
	for _, pack := range contextPacks {
		if pack.TargetEntityID != "" {
			associated[pack.TargetEntityID] = true
		}
		for _, item := range pack.Items {
			if item.SemanticNodeID != "" {
				associated[item.SemanticNodeID] = true
			}
		}
	}
	return associated
}

func cartographerAssociatedSubgraph(graph SemanticGraph, associated map[string]bool) []SemanticNode {
	nodesByID := map[string]SemanticNode{}
	for _, node := range graph.Nodes {
		nodesByID[node.ID] = node
	}
	nodes := []SemanticNode{}
	for nodeID := range associated {
		if node, ok := nodesByID[nodeID]; ok {
			nodes = append(nodes, node)
		}
	}
	sort.Slice(nodes, func(i int, j int) bool { return nodes[i].ID < nodes[j].ID })
	return nodes
}

func cartographerAssociatedEdges(graph SemanticGraph, associated map[string]bool) []SemanticEdge {
	edges := []SemanticEdge{}
	for _, edge := range graph.Edges {
		if associated[edge.FromNodeID] || associated[edge.ToNodeID] {
			edges = append(edges, edge)
		}
	}
	sort.Slice(edges, func(i int, j int) bool { return edges[i].ID < edges[j].ID })
	return edges
}

func mergeObservedEventIntoInput(bundle *CartographerInputBundle, observed observedCartographerEvent, config CartographerObservationConfig) {
	bundle.RunStatus = firstNonEmpty(observed.runStatus, bundle.RunStatus)
	if observed.run != nil {
		bundle.PromptSummary = firstNonEmpty(observed.run.PromptSummary, bundle.PromptSummary)
	}
	bundle.Observations = append(bundle.Observations, cartographerObservationRecordsFromObserved(observed)...)
	mergeObservedChatText(bundle, observed, config)
	if observed.item != nil {
		mergeRunItemSummary(bundle, *observed.item)
	}
	if observed.outputOrdinal > 0 && observed.runItemID != "" {
		mergeOutputSummary(bundle, observed, config)
	}
}

func mergeObservedChatText(bundle *CartographerInputBundle, observed observedCartographerEvent, config CartographerObservationConfig) {
	if observed.chatMessageID != "" {
		switch observed.messageRole {
		case string(chat.RoleUser):
			bundle.PromptText = appendBoundedAggregate(bundle.PromptText, observed.content, config.MaxWindowContentBytes)
			bundle.PromptSummary = firstNonEmpty(observed.summary, bundle.PromptSummary)
		case string(chat.RoleAssistant):
			bundle.AssistantText = appendBoundedAggregate(bundle.AssistantText, observed.content, config.MaxWindowContentBytes)
			bundle.AssistantResponseSummary = assistantAggregateSummary(bundle.NewEvents)
		}
	}
}

func mergeRunItemSummary(bundle *CartographerInputBundle, item chat.RunItem) {
	if isToolLikeRunItem(item.Type) {
		bundle.ToolCalls = upsertToolSummary(bundle.ToolCalls, cartographerToolSummary(item))
	}
	if item.Type == chat.RunItemTypeFileChange || item.DiffSummary != "" || len(item.FilePaths) > 0 {
		bundle.FileChanges = upsertFileChangeSummary(bundle.FileChanges, cartographerFileChangeSummary(item))
	}
	if item.Type == chat.RunItemTypeCommandExecution {
		bundle.TestResults = upsertTestResultSummary(bundle.TestResults, cartographerTestResultSummary(item))
	}
}

func cartographerToolSummary(item chat.RunItem) CartographerToolCallSummary {
	return CartographerToolCallSummary{
		RunItemID:     item.ID,
		Type:          string(item.Type),
		Status:        string(item.Status),
		Title:         item.Title,
		Command:       item.Command,
		Cwd:           item.Cwd,
		ToolName:      item.ToolName,
		ServerName:    item.ServerName,
		ResultSummary: firstNonEmpty(item.Summary, item.Result, item.Progress),
		Error:         item.Error,
		ExitCode:      item.ExitCode,
	}
}

func cartographerFileChangeSummary(item chat.RunItem) CartographerFileChangeSummary {
	return CartographerFileChangeSummary{
		RunItemID:   item.ID,
		Status:      string(item.Status),
		FilePaths:   append([]string{}, item.FilePaths...),
		PatchStatus: item.PatchStatus,
		DiffSummary: boundedText(item.DiffSummary, cartographerEventSummaryLimit).text,
	}
}

func cartographerTestResultSummary(item chat.RunItem) CartographerTestResultSummary {
	return CartographerTestResultSummary{
		RunItemID: item.ID,
		Command:   item.Command,
		ExitCode:  item.ExitCode,
		Result:    boundedText(item.Result, cartographerEventSummaryLimit).text,
		Error:     boundedText(item.Error, cartographerEventSummaryLimit).text,
	}
}

func mergeOutputSummary(bundle *CartographerInputBundle, observed observedCartographerEvent, config CartographerObservationConfig) {
	text := boundedText(observed.content, minPositive(config.MaxWindowContentBytes, cartographerEventSummaryLimit))
	for index := range bundle.OutputSummaries {
		existing := &bundle.OutputSummaries[index]
		if existing.RunItemID == observed.runItemID && existing.Stream == observed.outputStream {
			if existing.StartOrdinal == 0 || observed.outputOrdinal < existing.StartOrdinal {
				existing.StartOrdinal = observed.outputOrdinal
			}
			if observed.outputOrdinal > existing.EndOrdinal {
				existing.EndOrdinal = observed.outputOrdinal
			}
			existing.Summary = appendBoundedAggregate(existing.Summary, text.text, config.MaxWindowContentBytes)
			existing.Truncated = existing.Truncated || text.truncated
			return
		}
	}
	bundle.OutputSummaries = append(bundle.OutputSummaries, CartographerOutputSummary{
		RunItemID:    observed.runItemID,
		Stream:       observed.outputStream,
		StartOrdinal: observed.outputOrdinal,
		EndOrdinal:   observed.outputOrdinal,
		Summary:      text.text,
		Truncated:    text.truncated,
	})
}

func cartographerCloseReason(_ CartographerInputBundle, observed observedCartographerEvent, _ CartographerObservationConfig) CartographerWindowCloseReason {
	if reason := cartographerSemanticEpochCloseReason(observed); reason != "" {
		return reason
	}
	return ""
}

func cartographerSemanticEpochCloseReason(observed observedCartographerEvent) CartographerWindowCloseReason {
	if !isCartographerClosingReason(observed.closeReason) {
		return ""
	}
	switch observed.closeReason {
	case CartographerCloseAssistantComplete,
		CartographerCloseApprovalRequired,
		CartographerCloseWorkflowNodeTerminal,
		CartographerCloseWorkflowRunTerminal:
		return observed.closeReason
	case CartographerCloseRunItemTerminal:
		if cartographerRunItemClosesSemanticEpoch(observed) {
			return observed.closeReason
		}
		return ""
	default:
		return observed.closeReason
	}
}

func cartographerRunItemClosesSemanticEpoch(observed observedCartographerEvent) bool {
	if observed.item == nil {
		return observed.source == CartographerTrajectorySourceWorkflow
	}
	switch observed.item.Type {
	case chat.RunItemTypeCommandExecution,
		chat.RunItemTypeFileChange,
		chat.RunItemTypeDiff,
		chat.RunItemTypeApprovalReview:
		return true
	case chat.RunItemTypeDynamicToolCall:
		return observed.item.Namespace == chat.SettaAgentToolNamespace &&
			observed.item.ToolName == chat.SettaWorkflowResultAgentToolName
	default:
		return false
	}
}

func cartographerTrajectoryEventFromObserved(observed observedCartographerEvent) CartographerTrajectoryEvent {
	text := boundedText(observed.summary, cartographerEventSummaryLimit)
	contentBytes := len([]byte(observed.content))
	if contentBytes == 0 {
		contentBytes = len([]byte(observed.summary))
	}
	return CartographerTrajectoryEvent{
		Source:               observed.source,
		EventID:              observed.eventID,
		Type:                 observed.eventType,
		StreamID:             observed.streamID,
		Sequence:             observed.sequence,
		WorkflowEventCursor:  observed.workflowEventCursor,
		OccurredAt:           observed.occurredAt,
		SourceRefs:           observed.sourceRefs,
		ChatMessageID:        observed.chatMessageID,
		MessageRole:          observed.messageRole,
		MessageStatus:        observed.messageStatus,
		RunItemID:            observed.runItemID,
		RunItemType:          observed.runItemType,
		RunItemStatus:        observed.runItemStatus,
		RunStatus:            observed.runStatus,
		OutputStream:         observed.outputStream,
		OutputOrdinal:        observed.outputOrdinal,
		Summary:              text.text,
		Boundary:             isCartographerClosingReason(observed.closeReason),
		CloseReason:          cartographerSerializedCloseReason(observed.closeReason),
		OriginalContentBytes: contentBytes,
		IncludedContentBytes: len([]byte(text.text)),
		Truncated:            text.truncated,
	}
}

func cartographerObservationRecordsFromTrajectoryEvents(workspaceID string, events []CartographerTrajectoryEvent) []CartographerObservationRecord {
	records := []CartographerObservationRecord{}
	for _, event := range events {
		kind, ok := cartographerObservationKindForTrajectoryEvent(event)
		if !ok {
			continue
		}
		records = append(records, cartographerObservationRecordFromTrajectoryEvent(workspaceID, kind, event))
	}
	return records
}

func cartographerObservationKindForTrajectoryEvent(event CartographerTrajectoryEvent) (CartographerObservationKind, bool) {
	if event.MessageRole == string(chat.RoleUser) {
		return CartographerObservationPromptMessage, true
	}
	if event.Type == chat.EventTypeAssistantTextDelta {
		return CartographerObservationAssistantTextChunkAggregate, true
	}
	if event.MessageRole == string(chat.RoleAssistant) && isTerminalMessageStatusString(event.MessageStatus) {
		return CartographerObservationAssistantMessageCompleted, true
	}
	if event.RunItemType == string(chat.RunItemTypeCommandExecution) {
		switch chat.RunItemStatus(event.RunItemStatus) {
		case chat.RunItemStatusCompleted:
			return CartographerObservationCommandCompleted, true
		case chat.RunItemStatusFailed, chat.RunItemStatusCancelled:
			return CartographerObservationCommandFailed, true
		case chat.RunItemStatusPending, chat.RunItemStatusRunning:
			return CartographerObservationCommandStarted, true
		}
	}
	return cartographerWorkflowObservationKind(event.Type)
}

func cartographerObservationRecordFromTrajectoryEvent(workspaceID string, kind CartographerObservationKind, event CartographerTrajectoryEvent) CartographerObservationRecord {
	refs := event.SourceRefs
	text := firstNonEmpty(event.Summary, event.Type)
	return CartographerObservationRecord{
		Kind:                    kind,
		Source:                  event.Source,
		EventID:                 event.EventID,
		Type:                    event.Type,
		WorkspaceID:             workspaceID,
		WorkflowDefinitionID:    refs.WorkflowDefinitionID,
		WorkflowExecutionID:     refs.WorkflowExecutionID,
		WorkflowNodeID:          refs.WorkflowNodeID,
		WorkflowNodeExecutionID: refs.WorkflowNodeExecutionID,
		ChatConversationID:      refs.ChatConversationID,
		ChatRunID:               refs.ChatRunID,
		ChatMessageID:           event.ChatMessageID,
		MessageRole:             event.MessageRole,
		MessageStatus:           event.MessageStatus,
		RunItemID:               event.RunItemID,
		RunItemType:             event.RunItemType,
		RunItemStatus:           event.RunItemStatus,
		RunStatus:               event.RunStatus,
		OutputStream:            event.OutputStream,
		OutputOrdinal:           event.OutputOrdinal,
		Summary:                 event.Summary,
		TextExcerpt:             boundedText(text, cartographerEventSummaryLimit).text,
		ContentHash:             cartographerObservationContentHash(text),
		OccurredAt:              event.OccurredAt,
	}
}

func cartographerObservationRecordsFromObserved(observed observedCartographerEvent) []CartographerObservationRecord {
	records := []CartographerObservationRecord{}
	if observed.messageRole == string(chat.RoleUser) {
		records = append(records, cartographerObservationRecordFromObserved(observed, CartographerObservationPromptMessage, observed.content))
	}
	if observed.eventType == chat.EventTypeAssistantTextDelta {
		records = append(records, cartographerObservationRecordFromObserved(observed, CartographerObservationAssistantTextChunkAggregate, observed.content))
	} else if observed.messageRole == string(chat.RoleAssistant) && isTerminalMessageStatusString(observed.messageStatus) {
		records = append(records, cartographerObservationRecordFromObserved(observed, CartographerObservationAssistantMessageCompleted, observed.content))
	}
	if observed.run != nil {
		if observed.run.PendingApproval != nil {
			records = append(records, cartographerObservationRecordFromObserved(observed, CartographerObservationApprovalRequested, observed.run.PendingApproval.Body))
		}
		if isTerminalChatRunStatus(observed.run.Status) {
			records = append(records, cartographerObservationRecordFromObserved(observed, CartographerObservationRunCompleted, firstNonEmpty(observed.run.Error, observed.run.PromptSummary)))
		}
	}
	if observed.item != nil {
		for _, kind := range cartographerRunItemObservationKinds(*observed.item) {
			records = append(records, cartographerObservationRecordFromObserved(observed, kind, observed.content))
		}
	}
	if kind, ok := cartographerWorkflowObservationKind(observed.eventType); ok {
		records = append(records, cartographerObservationRecordFromObserved(observed, kind, observed.content))
	}
	return records
}

func cartographerRunItemObservationKinds(item chat.RunItem) []CartographerObservationKind {
	kinds := cartographerRunItemObservationKindsForType(item)
	if item.DiffSummary != "" && !cartographerObservationKindsContain(kinds, CartographerObservationDiffObserved) {
		kinds = append(kinds, CartographerObservationDiffObserved)
	}
	return kinds
}

func cartographerRunItemObservationKindsForType(item chat.RunItem) []CartographerObservationKind {
	switch item.Type {
	case chat.RunItemTypeCommandExecution:
		return cartographerCommandObservationKinds(item.Status)
	case chat.RunItemTypeFileChange:
		return []CartographerObservationKind{CartographerObservationFileChangeObserved}
	case chat.RunItemTypeDiff:
		return []CartographerObservationKind{CartographerObservationDiffObserved}
	case chat.RunItemTypeApprovalReview:
		return cartographerApprovalObservationKinds(item.Status)
	default:
		return []CartographerObservationKind{}
	}
}

func cartographerCommandObservationKinds(status chat.RunItemStatus) []CartographerObservationKind {
	switch status {
	case chat.RunItemStatusCompleted:
		return []CartographerObservationKind{CartographerObservationCommandCompleted, CartographerObservationTestResultObserved}
	case chat.RunItemStatusFailed, chat.RunItemStatusCancelled:
		return []CartographerObservationKind{CartographerObservationCommandFailed, CartographerObservationTestResultObserved}
	case chat.RunItemStatusPending, chat.RunItemStatusRunning:
		return []CartographerObservationKind{CartographerObservationCommandStarted}
	default:
		return []CartographerObservationKind{}
	}
}

func cartographerApprovalObservationKinds(status chat.RunItemStatus) []CartographerObservationKind {
	switch status {
	case chat.RunItemStatusPending, chat.RunItemStatusRunning:
		return []CartographerObservationKind{CartographerObservationApprovalRequested}
	default:
		return []CartographerObservationKind{}
	}
}

func cartographerWorkflowObservationKind(eventType string) (CartographerObservationKind, bool) {
	switch orchestrator.WorkflowEventType(eventType) {
	case orchestrator.EventActionStarted:
		return CartographerObservationWorkflowNodeStarted, true
	case orchestrator.EventActionCompleted,
		orchestrator.EventActionFailed,
		orchestrator.EventActionCancelled,
		orchestrator.EventRunnerAttemptCompleted,
		orchestrator.EventRunnerAttemptFailed,
		orchestrator.EventRunnerAttemptCancelled,
		orchestrator.EventRunnerAttemptRecoveryRequired:
		return CartographerObservationWorkflowNodeCompleted, true
	case orchestrator.EventActionApprovalWait, orchestrator.EventRunnerApprovalRequested:
		return CartographerObservationApprovalRequested, true
	case orchestrator.EventExecutionCompleted,
		orchestrator.EventExecutionFailed,
		orchestrator.EventExecutionStopped,
		orchestrator.EventExecutionCancelled:
		return CartographerObservationRunCompleted, true
	default:
		return "", false
	}
}

func cartographerObservationRecordFromObserved(observed observedCartographerEvent, kind CartographerObservationKind, text string) CartographerObservationRecord {
	refs := observed.sourceRefs
	record := CartographerObservationRecord{
		Kind:                    kind,
		Source:                  observed.source,
		EventID:                 observed.eventID,
		Type:                    observed.eventType,
		WorkspaceID:             observed.sourceRefsWorkspaceID(),
		WorkflowDefinitionID:    refs.WorkflowDefinitionID,
		WorkflowExecutionID:     refs.WorkflowExecutionID,
		WorkflowNodeID:          refs.WorkflowNodeID,
		WorkflowNodeExecutionID: refs.WorkflowNodeExecutionID,
		ChatConversationID:      refs.ChatConversationID,
		ChatRunID:               refs.ChatRunID,
		ChatMessageID:           observed.chatMessageID,
		MessageRole:             observed.messageRole,
		MessageStatus:           observed.messageStatus,
		RunItemID:               observed.runItemID,
		RunItemType:             observed.runItemType,
		RunItemStatus:           observed.runItemStatus,
		RunStatus:               observed.runStatus,
		OutputStream:            observed.outputStream,
		OutputOrdinal:           observed.outputOrdinal,
		Summary:                 boundedText(observed.summary, cartographerEventSummaryLimit).text,
		TextExcerpt:             boundedText(firstNonEmpty(text, observed.content, observed.summary), cartographerEventSummaryLimit).text,
		OccurredAt:              observed.occurredAt,
	}
	if observed.item != nil {
		record.ProviderItemID = observed.item.ProviderItemID
		record.Command = observed.item.Command
		record.Cwd = observed.item.Cwd
		record.ExitCode = observed.item.ExitCode
		record.FilePaths = append([]string{}, observed.item.FilePaths...)
		if len(record.FilePaths) > 0 {
			record.FilePath = record.FilePaths[0]
		}
	}
	if observed.run != nil && observed.run.PendingApproval != nil {
		record.RunItemID = firstNonEmpty(record.RunItemID, observed.run.PendingApproval.RunItemID)
		record.Command = firstNonEmpty(record.Command, observed.run.PendingApproval.Command)
		if record.FilePath == "" && observed.run.PendingApproval.FilePath != "" {
			record.FilePath = observed.run.PendingApproval.FilePath
			record.FilePaths = []string{observed.run.PendingApproval.FilePath}
		}
	}
	record.ContentHash = cartographerObservationContentHash(firstNonEmpty(record.TextExcerpt, record.Summary))
	return record
}

func isTerminalMessageStatusString(status string) bool {
	return isTerminalChatMessageStatus(chat.MessageStatus(status))
}

func cartographerObservationContentHash(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	return hashBytes([]byte(text))
}

func cartographerObservationKindsContain(kinds []CartographerObservationKind, target CartographerObservationKind) bool {
	for _, kind := range kinds {
		if kind == target {
			return true
		}
	}
	return false
}

func isCartographerClosingReason(reason CartographerWindowCloseReason) bool {
	return reason != "" && reason != CartographerCloseNone
}

func cartographerSerializedCloseReason(reason CartographerWindowCloseReason) CartographerWindowCloseReason {
	if isCartographerClosingReason(reason) {
		return reason
	}
	return CartographerCloseNone
}

func applyCartographerInputLimits(bundle CartographerInputBundle, config CartographerObservationConfig) CartographerInputBundle {
	config = normalizeCartographerObservationConfig(config)
	normalizeCartographerInputBundle(&bundle)
	originalEventCount := len(bundle.NewEvents)
	originalBytes := cartographerBundleContentBytes(bundle)
	bundle = applyCartographerEventCountLimit(bundle, config)
	bundle = boundCartographerInputText(bundle, config)
	includedBytes := cartographerBundleContentBytes(bundle)
	bundle.Truncation.OriginalEventCount = maxInt(bundle.Truncation.OriginalEventCount, originalEventCount)
	bundle.Truncation.IncludedEventCount = len(bundle.NewEvents)
	bundle.Truncation.OriginalContentBytes = maxInt(bundle.Truncation.OriginalContentBytes, originalBytes)
	bundle.Truncation.IncludedContentBytes = includedBytes
	if includedBytes < originalBytes {
		bundle.Truncation.Summarized = true
		bundle.Truncation.Reasons = appendUniqueString(bundle.Truncation.Reasons, "content_byte_limit")
	}
	bundle.TokenBudget = config.TokenBudget
	normalizeCartographerInputBundle(&bundle)
	return bundle
}

func applyCartographerEventCountLimit(bundle CartographerInputBundle, config CartographerObservationConfig) CartographerInputBundle {
	if len(bundle.NewEvents) <= config.MaxWindowEvents {
		return bundle
	}
	trimmed := bundle.NewEvents[:len(bundle.NewEvents)-config.MaxWindowEvents]
	bundle.NewEvents = append([]CartographerTrajectoryEvent{}, bundle.NewEvents[len(bundle.NewEvents)-config.MaxWindowEvents:]...)
	bundle.Truncation.Summarized = true
	bundle.Truncation.Reasons = appendUniqueString(bundle.Truncation.Reasons, "event_count_limit")
	bundle.Truncation.DeterministicSummary = appendBoundedAggregate(bundle.Truncation.DeterministicSummary, summarizeTrajectoryEvents(trimmed), config.MaxWindowContentBytes)
	return bundle
}

func boundCartographerInputText(bundle CartographerInputBundle, config CartographerObservationConfig) CartographerInputBundle {
	bundle.PromptText = boundedText(bundle.PromptText, minPositive(config.MaxWindowContentBytes, cartographerAggregateTextLimit)).text
	bundle.AssistantText = boundedText(bundle.AssistantText, minPositive(config.MaxWindowContentBytes, cartographerAggregateTextLimit)).text
	for index := range bundle.NewEvents {
		text := boundedText(bundle.NewEvents[index].Summary, cartographerEventSummaryLimit)
		bundle.NewEvents[index].Summary = text.text
		bundle.NewEvents[index].Truncated = bundle.NewEvents[index].Truncated || text.truncated
		bundle.NewEvents[index].IncludedContentBytes = len([]byte(text.text))
	}
	for index := range bundle.Observations {
		bundle.Observations[index].Summary = boundedText(bundle.Observations[index].Summary, cartographerEventSummaryLimit).text
		bundle.Observations[index].TextExcerpt = boundedText(bundle.Observations[index].TextExcerpt, cartographerEventSummaryLimit).text
	}
	for index := range bundle.OutputSummaries {
		text := boundedText(bundle.OutputSummaries[index].Summary, cartographerEventSummaryLimit)
		bundle.OutputSummaries[index].Summary = text.text
		bundle.OutputSummaries[index].Truncated = bundle.OutputSummaries[index].Truncated || text.truncated
	}
	if len(bundle.RetrievalResults) > defaultSemanticRetrievalLimit {
		bundle.RetrievalResults = append([]SemanticRetrievalResult{}, bundle.RetrievalResults[:defaultSemanticRetrievalLimit]...)
		bundle.Truncation.Summarized = true
		bundle.Truncation.Reasons = appendUniqueString(bundle.Truncation.Reasons, "retrieval_result_limit")
	}
	for index := range bundle.RetrievalResults {
		bundle.RetrievalResults[index].Title = boundedText(bundle.RetrievalResults[index].Title, cartographerEventSummaryLimit).text
		bundle.RetrievalResults[index].Summary = boundedText(bundle.RetrievalResults[index].Summary, cartographerEventSummaryLimit).text
		for reasonIndex := range bundle.RetrievalResults[index].Reasons {
			bundle.RetrievalResults[index].Reasons[reasonIndex] = boundedText(bundle.RetrievalResults[index].Reasons[reasonIndex], cartographerEventSummaryLimit).text
		}
	}
	return bundle
}

func advanceCartographerCursor(cursor CartographerCursor, observed observedCartographerEvent, updatedAt string) CartographerCursor {
	advanced := cursor
	normalizeCartographerCursor(&advanced)
	if observed.source == CartographerTrajectorySourceChat {
		advanced.LastChatEventStreamID = observed.streamID
		advanced.LastChatEventSequence = observed.sequence
	}
	if observed.workflowEventCursor != "" {
		advanced.LastWorkflowEventCursor = observed.workflowEventCursor
	}
	if observed.runItemID != "" && observed.outputOrdinal > 0 {
		advanced.LastOutputOrdinalByRunItem[observed.runItemID] = maxInt(advanced.LastOutputOrdinalByRunItem[observed.runItemID], observed.outputOrdinal)
	}
	advanced.UpdatedAt = updatedAt
	return advanced
}

func cartographerEventAlreadyObserved(cursor CartographerCursor, observed observedCartographerEvent) bool {
	if observed.source == CartographerTrajectorySourceChat &&
		cursor.LastChatEventStreamID == observed.streamID &&
		observed.sequence > 0 &&
		observed.sequence <= cursor.LastChatEventSequence {
		return true
	}
	if observed.workflowEventCursor != "" {
		_, observedSequence := splitCartographerCursorSequence(observed.workflowEventCursor)
		_, cursorSequence := splitCartographerCursorSequence(cursor.LastWorkflowEventCursor)
		if observedSequence > 0 && observedSequence <= cursorSequence {
			return true
		}
	}
	if observed.runItemID != "" && observed.outputOrdinal > 0 {
		if cursor.LastOutputOrdinalByRunItem[observed.runItemID] >= observed.outputOrdinal {
			return true
		}
	}
	return false
}

func cartographerWindowCursorFromCursor(cursor CartographerCursor) CartographerWindowCursor {
	normalizeCartographerCursor(&cursor)
	return CartographerWindowCursor{
		ChatEventStreamID:      cursor.LastChatEventStreamID,
		ChatEventSequence:      cursor.LastChatEventSequence,
		WorkflowEventCursor:    cursor.LastWorkflowEventCursor,
		OutputOrdinalByRunItem: copyIntMap(cursor.LastOutputOrdinalByRunItem),
	}
}

func cartographerCursorKeyFromSourceRefs(refs SemanticContextSourceRefs) CartographerCursorKey {
	return CartographerCursorKey{
		WorkflowExecutionID:     refs.WorkflowExecutionID,
		WorkflowNodeExecutionID: refs.WorkflowNodeExecutionID,
		ChatConversationID:      refs.ChatConversationID,
		ChatRunID:               refs.ChatRunID,
	}
}

func cartographerSourceFromRefs(refs SemanticContextSourceRefs, targetEntityID string) (CartographerSourceKind, string, error) {
	if refs.WorkflowExecutionID != "" {
		return CartographerSourceWorkflowExecution, refs.WorkflowExecutionID, nil
	}
	if refs.ChatRunID != "" {
		return CartographerSourceChatRun, refs.ChatRunID, nil
	}
	if targetEntityID != "" {
		return CartographerSourceSemanticTarget, targetEntityID, nil
	}
	return "", "", errors.New("cartographer source requires workflow execution id, chat run id, or semantic target id")
}

func cartographerSourceFromManualRequest(request CartographerManualWindowRequest) (CartographerSourceKind, string, error) {
	return cartographerSourceFromRefs(request.SourceRefs, request.TargetEntityID)
}

func cartographerTrajectorySummaryFromWindow(summaryID string, window CartographerWindow, input CartographerInputBundle, createdAt string) CartographerTrajectorySummary {
	return CartographerTrajectorySummary{
		ID:          summaryID,
		WorkspaceID: window.WorkspaceID,
		RunID:       window.RunID,
		WindowID:    window.ID,
		SourceKind:  window.SourceKind,
		SourceID:    window.SourceID,
		Summary:     boundedText(cartographerWindowSummary(input), cartographerTrajectorySummaryLimit).text,
		SourceRefs:  input.SourceRefs,
		ItemCount:   len(input.NewEvents),
		CreatedAt:   createdAt,
	}
}

func cartographerWindowSummary(input CartographerInputBundle) string {
	parts := []string{}
	if input.PromptSummary != "" {
		parts = append(parts, input.PromptSummary)
	}
	if input.AssistantResponseSummary != "" {
		parts = append(parts, input.AssistantResponseSummary)
	}
	for _, event := range input.NewEvents {
		if event.Summary != "" {
			parts = append(parts, event.Summary)
		}
	}
	if len(parts) == 0 {
		return "Manual cartographer current-progress window."
	}
	return strings.Join(parts, " | ")
}

func validateManualCartographerWindowRequest(request CartographerManualWindowRequest) error {
	if err := validateStoreIDs("workspace id", request.WorkspaceID); err != nil {
		return err
	}
	if request.TriggerKind != "" && !isCartographerRunTriggerKind(request.TriggerKind) {
		return fmt.Errorf("cartographer manual triggerKind is unsupported: %s", request.TriggerKind)
	}
	if err := requireOptionalEntityID(request.TargetEntityID, "cartographer manual target entity id"); err != nil {
		return err
	}
	if err := validateContextSourceRefs(request.SourceRefs, "cartographer manual window"); err != nil {
		return err
	}
	if request.TargetEntityID == "" && request.SourceRefs.WorkflowExecutionID == "" && request.SourceRefs.ChatRunID == "" {
		return errors.New("cartographer manual window requires workflowExecutionId, chatRunId, or targetEntityId")
	}
	return nil
}

func validateObservedCartographerEvent(observed observedCartographerEvent) error {
	if observed.sourceRefsWorkspaceID() == "" {
		return errors.New("cartographer observed event workspace id is required")
	}
	if !isCartographerTrajectoryEventSource(observed.source) {
		return fmt.Errorf("cartographer observed event source is unsupported: %s", observed.source)
	}
	if err := validateCartographerEventRef(observed.eventID, "cartographer observed event id"); err != nil {
		return err
	}
	if err := requireNonEmpty(observed.eventType, "cartographer observed event type"); err != nil {
		return err
	}
	if err := validateContextSourceRefs(observed.sourceRefs, "cartographer observed event"); err != nil {
		return err
	}
	key := cartographerCursorKeyFromSourceRefs(observed.sourceRefs)
	key.WorkspaceID = observed.sourceRefsWorkspaceID()
	return validateCartographerCursorKey(context.Background(), key)
}

func (observed observedCartographerEvent) sourceRefsWorkspaceID() string {
	if observed.workspaceID != "" {
		return observed.workspaceID
	}
	if observed.item != nil {
		return observed.item.WorkspaceID
	}
	if observed.run != nil {
		return observed.run.WorkspaceID
	}
	return ""
}

func assistantAggregateSummary(events []CartographerTrajectoryEvent) string {
	count := 0
	bytes := 0
	for _, event := range events {
		if event.Type == chat.EventTypeAssistantTextDelta || event.MessageRole == string(chat.RoleAssistant) {
			count++
			bytes += event.OriginalContentBytes
		}
	}
	if count == 0 {
		return ""
	}
	return fmt.Sprintf("assistant response accumulated across %d event(s), %d byte(s)", count, bytes)
}

func upsertToolSummary(items []CartographerToolCallSummary, summary CartographerToolCallSummary) []CartographerToolCallSummary {
	for index := range items {
		if items[index].RunItemID == summary.RunItemID {
			items[index] = summary
			return items
		}
	}
	return append(items, summary)
}

func upsertFileChangeSummary(items []CartographerFileChangeSummary, summary CartographerFileChangeSummary) []CartographerFileChangeSummary {
	for index := range items {
		if items[index].RunItemID == summary.RunItemID {
			items[index] = summary
			return items
		}
	}
	return append(items, summary)
}

func upsertTestResultSummary(items []CartographerTestResultSummary, summary CartographerTestResultSummary) []CartographerTestResultSummary {
	for index := range items {
		if items[index].RunItemID == summary.RunItemID {
			items[index] = summary
			return items
		}
	}
	return append(items, summary)
}

func appendBoundedAggregate(existing string, next string, limit int) string {
	next = strings.TrimSpace(next)
	if next == "" {
		return existing
	}
	if existing != "" {
		next = existing + "\n" + next
	}
	return boundedText(next, limit).text
}

type boundedTextResult struct {
	text      string
	truncated bool
}

func boundedText(value string, byteLimit int) boundedTextResult {
	value = strings.TrimSpace(value)
	if byteLimit <= 0 || len([]byte(value)) <= byteLimit {
		return boundedTextResult{text: value}
	}
	data := []byte(value)
	if byteLimit > len(data) {
		byteLimit = len(data)
	}
	truncated := string(data[:byteLimit])
	for !utf8.ValidString(truncated) && len(truncated) > 0 {
		truncated = truncated[:len(truncated)-1]
	}
	return boundedTextResult{text: strings.TrimSpace(truncated), truncated: true}
}

func cartographerBundleContentBytes(bundle CartographerInputBundle) int {
	total := len([]byte(bundle.PromptText)) + len([]byte(bundle.AssistantText)) + len([]byte(bundle.PromptSummary)) + len([]byte(bundle.AssistantResponseSummary))
	for _, event := range bundle.NewEvents {
		total += event.OriginalContentBytes
	}
	for _, observation := range bundle.Observations {
		total += len([]byte(observation.Summary)) + len([]byte(observation.TextExcerpt))
	}
	for _, output := range bundle.OutputSummaries {
		total += len([]byte(output.Summary))
	}
	for _, result := range bundle.RetrievalResults {
		total += len([]byte(result.Title)) + len([]byte(result.Summary))
		for _, reason := range result.Reasons {
			total += len([]byte(reason))
		}
	}
	return total
}

func summarizeTrajectoryEvents(events []CartographerTrajectoryEvent) string {
	if len(events) == 0 {
		return ""
	}
	counts := map[string]int{}
	for _, event := range events {
		counts[event.Type]++
	}
	keys := make([]string, 0, len(counts))
	for key := range counts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s=%d", key, counts[key]))
	}
	return fmt.Sprintf("summarized %d earlier event(s): %s", len(events), strings.Join(parts, ", "))
}

func appendUniqueString(values []string, value string) []string {
	if value == "" {
		return values
	}
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func minPositive(a int, b int) int {
	if a <= 0 {
		return b
	}
	if b <= 0 {
		return a
	}
	if a < b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

func copyIntMap(input map[string]int) map[string]int {
	copied := map[string]int{}
	for key, value := range input {
		copied[key] = value
	}
	return copied
}

func splitCartographerCursorSequence(cursor string) (string, int) {
	streamID, sequenceText, ok := strings.Cut(cursor, ":")
	if !ok {
		return "", 0
	}
	var sequence int
	_, _ = fmt.Sscanf(sequenceText, "%d", &sequence)
	return streamID, sequence
}
