package semanticgraph

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"setta/internal/chat"
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
		ExistingNodes:       nodes,
		ExistingEdges:       edges,
		Evidence:            evidence,
		Activity:            activity,
		Steering:            steering,
		ContextPacks:        contextPacks,
		TrajectorySummaries: priorSummaries,
		TokenBudget:         service.cartographerConfig.TokenBudget,
	}
	normalizeCartographerInputBundle(&bundle)
	if request.closeReason != "" {
		bundle.Truncation.Reasons = appendUniqueString(bundle.Truncation.Reasons, string(request.closeReason))
	}
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
		if strings.Contains(observed.eventType, "message") && strings.Contains(observed.summary, "prompt") {
			bundle.PromptText = appendBoundedAggregate(bundle.PromptText, observed.content, config.MaxWindowContentBytes)
			bundle.PromptSummary = firstNonEmpty(observed.summary, bundle.PromptSummary)
		}
		if strings.Contains(observed.summary, "assistant") {
			bundle.AssistantText = appendBoundedAggregate(bundle.AssistantText, observed.content, config.MaxWindowContentBytes)
			bundle.AssistantResponseSummary = assistantAggregateSummary(bundle.NewEvents)
		}
	}
	if observed.eventType == chat.EventTypeAssistantTextDelta {
		bundle.AssistantText = appendBoundedAggregate(bundle.AssistantText, observed.content, config.MaxWindowContentBytes)
		bundle.AssistantResponseSummary = assistantAggregateSummary(bundle.NewEvents)
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

func cartographerCloseReason(bundle CartographerInputBundle, observed observedCartographerEvent, config CartographerObservationConfig) CartographerWindowCloseReason {
	if observed.closeReason != "" {
		return observed.closeReason
	}
	if cartographerAssistantBytes(bundle.NewEvents) >= config.AssistantThresholdBytes {
		return CartographerCloseAssistantThreshold
	}
	for _, total := range cartographerOutputBytesByRunItem(bundle.NewEvents) {
		if total >= config.OutputThresholdBytes {
			return CartographerCloseOutputThreshold
		}
	}
	return ""
}

func cartographerAssistantBytes(events []CartographerTrajectoryEvent) int {
	total := 0
	for _, event := range events {
		if event.Type == chat.EventTypeAssistantTextDelta {
			total += event.OriginalContentBytes
		}
	}
	return total
}

func cartographerOutputBytesByRunItem(events []CartographerTrajectoryEvent) map[string]int {
	outputBytes := map[string]int{}
	for _, event := range events {
		if event.RunItemID != "" && event.OutputOrdinal > 0 {
			outputBytes[event.RunItemID] += event.OriginalContentBytes
		}
	}
	return outputBytes
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
		RunItemID:            observed.runItemID,
		RunItemType:          observed.runItemType,
		RunItemStatus:        observed.runItemStatus,
		RunStatus:            observed.runStatus,
		OutputStream:         observed.outputStream,
		OutputOrdinal:        observed.outputOrdinal,
		Summary:              text.text,
		Boundary:             observed.closeReason != "",
		CloseReason:          observed.closeReason,
		OriginalContentBytes: contentBytes,
		IncludedContentBytes: len([]byte(text.text)),
		Truncated:            text.truncated,
	}
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
	for index := range bundle.OutputSummaries {
		text := boundedText(bundle.OutputSummaries[index].Summary, cartographerEventSummaryLimit)
		bundle.OutputSummaries[index].Summary = text.text
		bundle.OutputSummaries[index].Truncated = bundle.OutputSummaries[index].Truncated || text.truncated
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
		if event.Type == chat.EventTypeAssistantTextDelta || strings.Contains(event.Summary, "assistant") {
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
	for _, output := range bundle.OutputSummaries {
		total += len([]byte(output.Summary))
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
