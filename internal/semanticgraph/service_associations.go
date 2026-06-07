package semanticgraph

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

const semanticEvidenceTextLimit = 240

type WorkflowSourceResolver interface {
	ReadDefinition(workspaceID string, definitionID string) (orchestrator.WorkflowDefinition, error)
	ReadExecution(workspaceID string, executionID string) (orchestrator.WorkflowExecution, error)
	ReadGraphProjection(workspaceID string, definitionID string, versionID string, executionID string) (orchestrator.WorkflowGraphProjection, bool, error)
}

type ChatSourceResolver interface {
	ReadMessage(workspaceID string, conversationID string, messageID string) (chat.ChatMessage, error)
	ReadRun(workspaceID string, runID string) (chat.Run, error)
	ReadRunItem(workspaceID string, runID string, runItemID string) (chat.RunItem, error)
}

type attachmentSource struct {
	evidenceSourceKind      SemanticEvidenceSourceKind
	evidenceSourceID        string
	activitySourceKind      SemanticActivitySourceKind
	activitySourceID        string
	uri                     string
	path                    string
	rangeStart              int
	rangeEnd                int
	text                    string
	summary                 string
	contentHash             string
	workflowDefinitionID    string
	workflowExecutionID     string
	workflowNodeID          string
	workflowNodeExecutionID string
	chatConversationID      string
	chatRunID               string
	chatMessageID           string
	runItemID               string
}

func (service *Service) AttachWorkflowExecution(ctx context.Context, input AttachWorkflowExecutionInput) (SemanticAttachmentResult, error) {
	if service.workflowResolver == nil {
		return SemanticAttachmentResult{}, errors.New("workflow source resolver is not configured")
	}
	execution, err := service.workflowResolver.ReadExecution(input.WorkspaceID, input.WorkflowExecutionID)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	source := attachmentSource{
		evidenceSourceKind:   EvidenceSourceWorkflowExecution,
		evidenceSourceID:     execution.ID,
		activitySourceKind:   ActivitySourceWorkflowExecution,
		activitySourceID:     execution.ID,
		summary:              workflowExecutionSummary(execution),
		workflowDefinitionID: execution.DefinitionID,
		workflowExecutionID:  execution.ID,
	}
	return service.attachSource(ctx, semanticAttachmentBase{
		workspaceID:  input.WorkspaceID,
		nodeID:       input.NodeID,
		activityKind: input.ActivityKind,
		summary:      input.Summary,
		actor:        input.Actor,
	}, source)
}

func (service *Service) AttachWorkflowNode(ctx context.Context, input AttachWorkflowNodeInput) (SemanticAttachmentResult, error) {
	if service.workflowResolver == nil {
		return SemanticAttachmentResult{}, errors.New("workflow source resolver is not configured")
	}
	source, err := service.workflowNodeAttachmentSource(input)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	return service.attachSource(ctx, semanticAttachmentBase{
		workspaceID:  input.WorkspaceID,
		nodeID:       input.NodeID,
		activityKind: input.ActivityKind,
		summary:      input.Summary,
		actor:        input.Actor,
	}, source)
}

func (service *Service) AttachChatRun(ctx context.Context, input AttachChatRunInput) (SemanticAttachmentResult, error) {
	if service.chatResolver == nil {
		return SemanticAttachmentResult{}, errors.New("chat source resolver is not configured")
	}
	run, err := service.chatResolver.ReadRun(input.WorkspaceID, input.ChatRunID)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	source := attachmentSource{
		evidenceSourceKind: EvidenceSourceChatRun,
		evidenceSourceID:   run.ID,
		activitySourceKind: ActivitySourceChatRun,
		activitySourceID:   run.ID,
		summary:            chatRunSummary(run),
		chatConversationID: run.ConversationID,
		chatRunID:          run.ID,
	}
	return service.attachSource(ctx, semanticAttachmentBase{
		workspaceID:  input.WorkspaceID,
		nodeID:       input.NodeID,
		activityKind: input.ActivityKind,
		summary:      input.Summary,
		actor:        input.Actor,
	}, source)
}

func (service *Service) AttachChatMessage(ctx context.Context, input AttachChatMessageInput) (SemanticAttachmentResult, error) {
	if service.chatResolver == nil {
		return SemanticAttachmentResult{}, errors.New("chat source resolver is not configured")
	}
	message, err := service.chatResolver.ReadMessage(input.WorkspaceID, input.ChatConversationID, input.ChatMessageID)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	source := attachmentSource{
		evidenceSourceKind: EvidenceSourceChatMessage,
		evidenceSourceID:   message.ID,
		activitySourceKind: ActivitySourceChatMessage,
		activitySourceID:   message.ID,
		summary:            chatMessageSummary(message),
		text:               shortText(chatMessageText(message), semanticEvidenceTextLimit),
		chatConversationID: message.ConversationID,
		chatRunID:          message.RunID,
		chatMessageID:      message.ID,
	}
	return service.attachSource(ctx, semanticAttachmentBase{
		workspaceID:  input.WorkspaceID,
		nodeID:       input.NodeID,
		activityKind: input.ActivityKind,
		summary:      input.Summary,
		actor:        input.Actor,
	}, source)
}

func (service *Service) AttachRunItem(ctx context.Context, input AttachRunItemInput) (SemanticAttachmentResult, error) {
	if service.chatResolver == nil {
		return SemanticAttachmentResult{}, errors.New("chat source resolver is not configured")
	}
	item, err := service.chatResolver.ReadRunItem(input.WorkspaceID, input.ChatRunID, input.RunItemID)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	sourceKind := ActivitySourceRunItem
	if item.Type == chat.RunItemTypeCommandExecution {
		sourceKind = ActivitySourceCommand
	}
	source := attachmentSource{
		evidenceSourceKind: EvidenceSourceRunItem,
		evidenceSourceID:   item.ID,
		activitySourceKind: sourceKind,
		activitySourceID:   item.ID,
		summary:            chatRunItemSummary(item),
		text:               shortText(runItemEvidenceText(item), semanticEvidenceTextLimit),
		chatConversationID: item.ConversationID,
		chatRunID:          item.RunID,
		runItemID:          item.ID,
	}
	return service.attachSource(ctx, semanticAttachmentBase{
		workspaceID:  input.WorkspaceID,
		nodeID:       input.NodeID,
		activityKind: input.ActivityKind,
		summary:      input.Summary,
		actor:        input.Actor,
	}, source)
}

func (service *Service) AttachFileRange(ctx context.Context, input AttachFileRangeInput) (SemanticAttachmentResult, error) {
	workspaceSummary, err := service.resolveWorkspace(input.WorkspaceID)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	relativePath, absolutePath, err := resolveWorkspaceFilePath(workspaceSummary.RootPath, input.Path)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	if err := validateEvidenceRange(input.RangeStart, input.RangeEnd); err != nil {
		return SemanticAttachmentResult{}, err
	}
	contentHash, err := hashFile(absolutePath, sha256.New)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	source := attachmentSource{
		evidenceSourceKind: EvidenceSourceFileRange,
		activitySourceKind: ActivitySourceFileRange,
		path:               relativePath,
		rangeStart:         input.RangeStart,
		rangeEnd:           input.RangeEnd,
		summary:            fileRangeSummary(relativePath, input.RangeStart, input.RangeEnd),
		contentHash:        contentHash,
	}
	return service.attachSource(ctx, semanticAttachmentBase{
		workspaceID:  input.WorkspaceID,
		nodeID:       input.NodeID,
		activityKind: input.ActivityKind,
		summary:      input.Summary,
		actor:        input.Actor,
	}, source)
}

func (service *Service) EndActivity(ctx context.Context, input EndSemanticActivityInput) (SemanticActivityEndResult, error) {
	if ctx == nil {
		return SemanticActivityEndResult{}, errors.New("context is required")
	}
	interval, actor, err := service.prepareActivityEnd(ctx, input)
	if err != nil {
		return SemanticActivityEndResult{}, err
	}
	event, err := service.semanticActivityEndEvent(input.WorkspaceID, interval, actor)
	if err != nil {
		return SemanticActivityEndResult{}, err
	}
	appended, err := service.appendEvents(ctx, []SemanticEvent{event})
	if err != nil {
		return SemanticActivityEndResult{}, err
	}
	updated, err := service.loadProjectedActivityInterval(ctx, input.WorkspaceID, interval.ID)
	if err != nil {
		return SemanticActivityEndResult{}, err
	}
	return SemanticActivityEndResult{
		WorkspaceID:    input.WorkspaceID,
		TargetEntityID: updated.TargetEntityID,
		Activity:       updated,
		Event:          appended[0],
	}, nil
}

func (service *Service) prepareActivityEnd(ctx context.Context, input EndSemanticActivityInput) (SemanticActivityInterval, SemanticAttachmentActor, error) {
	if _, err := service.resolveWorkspace(input.WorkspaceID); err != nil {
		return SemanticActivityInterval{}, SemanticAttachmentActor{}, err
	}
	if err := validateStoreIDs("activity interval id", input.ActivityIntervalID); err != nil {
		return SemanticActivityInterval{}, SemanticAttachmentActor{}, err
	}
	interval, ok, err := service.store.loadSemanticActivityIntervalByID(ctx, input.WorkspaceID, input.ActivityIntervalID)
	if err != nil {
		return SemanticActivityInterval{}, SemanticAttachmentActor{}, err
	}
	if !ok {
		return SemanticActivityInterval{}, SemanticAttachmentActor{}, fmt.Errorf("semantic activity interval %s does not exist", input.ActivityIntervalID)
	}
	if interval.EndedAt != "" {
		return SemanticActivityInterval{}, SemanticAttachmentActor{}, fmt.Errorf("semantic activity interval %s already ended", input.ActivityIntervalID)
	}
	actor, err := normalizeAttachmentActor(input.Actor)
	if err != nil {
		return SemanticActivityInterval{}, SemanticAttachmentActor{}, err
	}
	return interval, actor, nil
}

func (service *Service) semanticActivityEndEvent(workspaceID string, interval SemanticActivityInterval, actor SemanticAttachmentActor) (SemanticEvent, error) {
	payload := activityEndedPayload{IntervalID: interval.ID}
	event, err := service.semanticEvent(workspaceID, EventActivityEnded, interval.TargetEntityID, actor, payload)
	if err != nil {
		return SemanticEvent{}, err
	}
	event.WorkflowExecutionID = interval.WorkflowExecutionID
	event.RunID = interval.ChatRunID
	return event, nil
}

func (service *Service) loadProjectedActivityInterval(ctx context.Context, workspaceID string, intervalID string) (SemanticActivityInterval, error) {
	updated, ok, err := service.store.loadSemanticActivityIntervalByID(ctx, workspaceID, intervalID)
	if err != nil {
		return SemanticActivityInterval{}, err
	}
	if !ok {
		return SemanticActivityInterval{}, fmt.Errorf("semantic activity interval %s was not projected", intervalID)
	}
	return updated, nil
}

type semanticAttachmentBase struct {
	workspaceID  string
	nodeID       string
	activityKind SemanticActivityKind
	summary      string
	actor        SemanticAttachmentActor
}

type preparedSemanticAttachment struct {
	base       semanticAttachmentBase
	source     attachmentSource
	actor      SemanticAttachmentActor
	summary    string
	anchorID   string
	intervalID string
}

func (service *Service) attachSource(ctx context.Context, base semanticAttachmentBase, source attachmentSource) (SemanticAttachmentResult, error) {
	request, err := service.prepareSemanticAttachment(ctx, base, source)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	events, err := service.semanticAttachmentEvents(request)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	appended, err := service.appendEvents(ctx, events)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	return service.readSemanticAttachmentResult(ctx, request, appended)
}

func (service *Service) prepareSemanticAttachment(ctx context.Context, base semanticAttachmentBase, source attachmentSource) (preparedSemanticAttachment, error) {
	if ctx == nil {
		return preparedSemanticAttachment{}, errors.New("context is required")
	}
	if _, err := service.resolveWorkspace(base.workspaceID); err != nil {
		return preparedSemanticAttachment{}, err
	}
	if err := service.requireSemanticNode(ctx, base.workspaceID, base.nodeID); err != nil {
		return preparedSemanticAttachment{}, err
	}
	if !isSemanticActivityKind(base.activityKind) {
		return preparedSemanticAttachment{}, fmt.Errorf("activity kind is unsupported: %s", base.activityKind)
	}
	actor, err := normalizeAttachmentActor(base.actor)
	if err != nil {
		return preparedSemanticAttachment{}, err
	}
	anchorID, intervalID, err := service.newSemanticAttachmentIDs()
	if err != nil {
		return preparedSemanticAttachment{}, err
	}
	return preparedSemanticAttachment{
		base:       base,
		source:     source,
		actor:      actor,
		summary:    semanticAttachmentSummary(base.summary, source.summary),
		anchorID:   anchorID,
		intervalID: intervalID,
	}, nil
}

func (service *Service) newSemanticAttachmentIDs() (string, string, error) {
	anchorID, err := service.newID("semantic_evidence")
	if err != nil {
		return "", "", fmt.Errorf("create semantic evidence id: %w", err)
	}
	intervalID, err := service.newID("semantic_activity")
	if err != nil {
		return "", "", fmt.Errorf("create semantic activity id: %w", err)
	}
	return anchorID, intervalID, nil
}

func semanticAttachmentSummary(inputSummary string, sourceSummary string) string {
	summary := strings.TrimSpace(inputSummary)
	if summary != "" {
		return summary
	}
	return sourceSummary
}

func (service *Service) semanticAttachmentEvents(request preparedSemanticAttachment) ([]SemanticEvent, error) {
	evidenceEvent, err := service.semanticEvent(request.base.workspaceID, EventEvidenceAttached, request.base.nodeID, request.actor, request.evidencePayload())
	if err != nil {
		return nil, err
	}
	activityEvent, err := service.semanticEvent(request.base.workspaceID, EventActivityStarted, request.base.nodeID, request.actor, request.activityPayload())
	if err != nil {
		return nil, err
	}
	applySemanticAttachmentSourceRefs(&evidenceEvent, request.source)
	applySemanticAttachmentSourceRefs(&activityEvent, request.source)
	return []SemanticEvent{evidenceEvent, activityEvent}, nil
}

func (request preparedSemanticAttachment) evidencePayload() evidenceAttachedPayload {
	return evidenceAttachedPayload{
		AnchorID:                request.anchorID,
		TargetEntityID:          request.base.nodeID,
		SourceKind:              request.source.evidenceSourceKind,
		SourceID:                request.source.evidenceSourceID,
		URI:                     request.source.uri,
		Path:                    request.source.path,
		RangeStart:              request.source.rangeStart,
		RangeEnd:                request.source.rangeEnd,
		Text:                    request.source.text,
		Summary:                 request.summary,
		ContentHash:             request.source.contentHash,
		WorkflowDefinitionID:    request.source.workflowDefinitionID,
		WorkflowExecutionID:     request.source.workflowExecutionID,
		WorkflowNodeID:          request.source.workflowNodeID,
		WorkflowNodeExecutionID: request.source.workflowNodeExecutionID,
		ChatConversationID:      request.source.chatConversationID,
		ChatRunID:               request.source.chatRunID,
		ChatMessageID:           request.source.chatMessageID,
		RunItemID:               request.source.runItemID,
	}
}

func (request preparedSemanticAttachment) activityPayload() activityStartedPayload {
	return activityStartedPayload{
		IntervalID:              request.intervalID,
		TargetEntityID:          request.base.nodeID,
		Kind:                    request.base.activityKind,
		Summary:                 request.summary,
		SourceKind:              request.source.activitySourceKind,
		SourceID:                request.source.activitySourceID,
		EvidenceAnchorID:        request.anchorID,
		WorkflowDefinitionID:    request.source.workflowDefinitionID,
		WorkflowExecutionID:     request.source.workflowExecutionID,
		WorkflowNodeID:          request.source.workflowNodeID,
		WorkflowNodeExecutionID: request.source.workflowNodeExecutionID,
		ChatConversationID:      request.source.chatConversationID,
		ChatRunID:               request.source.chatRunID,
		ChatMessageID:           request.source.chatMessageID,
		RunItemID:               request.source.runItemID,
		ActorKind:               request.actor.ActorKind,
		ActorID:                 request.actor.ActorID,
	}
}

func applySemanticAttachmentSourceRefs(event *SemanticEvent, source attachmentSource) {
	event.WorkflowExecutionID = source.workflowExecutionID
	event.RunID = source.chatRunID
}

func (service *Service) readSemanticAttachmentResult(ctx context.Context, request preparedSemanticAttachment, appended []SemanticEvent) (SemanticAttachmentResult, error) {
	evidence, ok, err := service.store.loadSemanticEvidenceAnchorByID(ctx, request.base.workspaceID, request.anchorID)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	if !ok {
		return SemanticAttachmentResult{}, fmt.Errorf("semantic evidence anchor %s was not projected", request.anchorID)
	}
	activity, ok, err := service.store.loadSemanticActivityIntervalByID(ctx, request.base.workspaceID, request.intervalID)
	if err != nil {
		return SemanticAttachmentResult{}, err
	}
	if !ok {
		return SemanticAttachmentResult{}, fmt.Errorf("semantic activity interval %s was not projected", request.intervalID)
	}
	return SemanticAttachmentResult{
		WorkspaceID:    request.base.workspaceID,
		TargetEntityID: request.base.nodeID,
		Evidence:       evidence,
		Activity:       activity,
		Events:         appended,
	}, nil
}

func (service *Service) semanticEvent(workspaceID string, eventType SemanticEventType, targetEntityID string, actor SemanticAttachmentActor, payload any) (SemanticEvent, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return SemanticEvent{}, fmt.Errorf("encode %s payload: %w", eventType, err)
	}
	return SemanticEvent{
		WorkspaceID:    workspaceID,
		ActorKind:      actor.ActorKind,
		ActorID:        actor.ActorID,
		EventType:      eventType,
		TargetEntityID: targetEntityID,
		Payload:        data,
		ModelInfo:      map[string]string{},
	}, nil
}

func (service *Service) requireSemanticNode(ctx context.Context, workspaceID string, nodeID string) error {
	if err := validateStoreIDs("node id", nodeID); err != nil {
		return err
	}
	_, ok, err := service.store.loadSemanticNode(ctx, workspaceID, nodeID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("semantic node %s does not exist", nodeID)
	}
	return nil
}

func normalizeAttachmentActor(actor SemanticAttachmentActor) (SemanticAttachmentActor, error) {
	if actor.ActorKind == "" {
		actor.ActorKind = ActorKindUser
	}
	if !isSemanticActorKind(actor.ActorKind) {
		return SemanticAttachmentActor{}, fmt.Errorf("semantic attachment actor kind is unsupported: %s", actor.ActorKind)
	}
	if actor.ActorID != "" {
		if err := validateStoreIDs("semantic attachment actor id", actor.ActorID); err != nil {
			return SemanticAttachmentActor{}, err
		}
	}
	return actor, nil
}

func (service *Service) workflowNodeAttachmentSource(input AttachWorkflowNodeInput) (attachmentSource, error) {
	if input.WorkflowExecutionID != "" {
		return service.workflowNodeExecutionAttachmentSource(input)
	}
	if err := validateStoreIDs("workflow definition id", input.WorkflowDefinitionID, "workflow node id", input.WorkflowNodeID); err != nil {
		return attachmentSource{}, err
	}
	definition, err := service.workflowResolver.ReadDefinition(input.WorkspaceID, input.WorkflowDefinitionID)
	if err != nil {
		return attachmentSource{}, err
	}
	node, ok := workflowDefinitionNode(definition, input.WorkflowNodeID)
	if !ok {
		return attachmentSource{}, fmt.Errorf("workflow definition node %s does not exist", input.WorkflowNodeID)
	}
	return attachmentSource{
		evidenceSourceKind:   EvidenceSourceWorkflowNode,
		evidenceSourceID:     node.ID,
		activitySourceKind:   ActivitySourceWorkflowNode,
		activitySourceID:     node.ID,
		summary:              workflowDefinitionNodeSummary(definition, node),
		workflowDefinitionID: definition.ID,
		workflowNodeID:       node.ID,
	}, nil
}

func (service *Service) workflowNodeExecutionAttachmentSource(input AttachWorkflowNodeInput) (attachmentSource, error) {
	if err := validateStoreIDs("workflow execution id", input.WorkflowExecutionID); err != nil {
		return attachmentSource{}, err
	}
	execution, err := service.workflowResolver.ReadExecution(input.WorkspaceID, input.WorkflowExecutionID)
	if err != nil {
		return attachmentSource{}, err
	}
	nodeExecution, err := workflowNodeExecutionSource(execution, input.WorkflowNodeExecutionID, input.WorkflowNodeID)
	if err != nil {
		return attachmentSource{}, err
	}
	projection, ok, err := service.workflowResolver.ReadGraphProjection(input.WorkspaceID, "", "", execution.ID)
	if err != nil {
		return attachmentSource{}, err
	}
	if !ok {
		return attachmentSource{}, fmt.Errorf("workflow graph projection for execution %s does not exist", execution.ID)
	}
	graphNode, ok := workflowProjectionNode(projection, nodeExecution.NodeID)
	if !ok {
		return attachmentSource{}, fmt.Errorf("workflow projection node %s does not exist", nodeExecution.NodeID)
	}
	return attachmentSource{
		evidenceSourceKind:      EvidenceSourceWorkflowNode,
		evidenceSourceID:        nodeExecution.ID,
		activitySourceKind:      ActivitySourceWorkflowNode,
		activitySourceID:        nodeExecution.ID,
		summary:                 workflowNodeExecutionSummary(graphNode, nodeExecution),
		workflowDefinitionID:    execution.DefinitionID,
		workflowExecutionID:     execution.ID,
		workflowNodeID:          nodeExecution.NodeID,
		workflowNodeExecutionID: nodeExecution.ID,
	}, nil
}

func workflowNodeExecutionSource(execution orchestrator.WorkflowExecution, nodeExecutionID string, nodeID string) (orchestrator.WorkflowNodeExecution, error) {
	if nodeExecutionID == "" && nodeID == "" {
		return orchestrator.WorkflowNodeExecution{}, errors.New("workflow node execution id or workflow node id is required")
	}
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecutionID != "" && nodeExecution.ID == nodeExecutionID {
			return nodeExecution, nil
		}
		if nodeExecutionID == "" && nodeExecution.NodeID == nodeID {
			return nodeExecution, nil
		}
	}
	if nodeExecutionID != "" {
		return orchestrator.WorkflowNodeExecution{}, fmt.Errorf("workflow node execution %s does not exist", nodeExecutionID)
	}
	return orchestrator.WorkflowNodeExecution{}, fmt.Errorf("workflow execution %s has no node %s", execution.ID, nodeID)
}

func workflowDefinitionNode(definition orchestrator.WorkflowDefinition, nodeID string) (orchestrator.WorkflowNode, bool) {
	for _, node := range definition.Graph.Nodes {
		if node.ID == nodeID {
			return node, true
		}
	}
	return orchestrator.WorkflowNode{}, false
}

func workflowProjectionNode(projection orchestrator.WorkflowGraphProjection, nodeID string) (orchestrator.WorkflowGraphNode, bool) {
	for _, node := range projection.Nodes {
		if node.ID == nodeID {
			return node, true
		}
	}
	return orchestrator.WorkflowGraphNode{}, false
}

func workflowExecutionSummary(execution orchestrator.WorkflowExecution) string {
	return fmt.Sprintf("Workflow execution %s is %s.", execution.ID, execution.Status)
}

func workflowDefinitionNodeSummary(definition orchestrator.WorkflowDefinition, node orchestrator.WorkflowNode) string {
	title := strings.TrimSpace(node.Title)
	if title == "" {
		title = node.ID
	}
	return fmt.Sprintf("Workflow definition %s node %s.", definition.ID, title)
}

func workflowNodeExecutionSummary(node orchestrator.WorkflowGraphNode, execution orchestrator.WorkflowNodeExecution) string {
	title := strings.TrimSpace(node.Label)
	if title == "" {
		title = node.ID
	}
	return fmt.Sprintf("Workflow node %s execution %s is %s.", title, execution.ID, execution.Status)
}

func chatRunSummary(run chat.Run) string {
	prompt := strings.TrimSpace(run.PromptSummary)
	if prompt == "" {
		return fmt.Sprintf("Chat run %s is %s.", run.ID, run.Status)
	}
	return fmt.Sprintf("Chat run %s is %s: %s", run.ID, run.Status, shortText(prompt, semanticEvidenceTextLimit))
}

func chatMessageSummary(message chat.ChatMessage) string {
	return fmt.Sprintf("Chat %s message %s is %s.", message.Role, message.ID, message.Status)
}

func chatRunItemSummary(item chat.RunItem) string {
	title := strings.TrimSpace(item.Title)
	if title == "" {
		title = string(item.Type)
	}
	status := item.Status
	if item.Error != "" {
		return fmt.Sprintf("Run item %s %s failed: %s", item.ID, title, shortText(item.Error, semanticEvidenceTextLimit))
	}
	return fmt.Sprintf("Run item %s %s is %s.", item.ID, title, status)
}

func runItemEvidenceText(item chat.RunItem) string {
	for _, value := range []string{item.Summary, item.Command, item.Result, item.DiffSummary, item.NoticeMessage, item.Error} {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func chatMessageText(message chat.ChatMessage) string {
	parts := make([]string, 0, len(message.Parts))
	for _, part := range message.Parts {
		if part.Type == chat.MessagePartText && strings.TrimSpace(part.Text) != "" {
			parts = append(parts, part.Text)
		}
	}
	return strings.Join(parts, "\n")
}

func fileRangeSummary(path string, rangeStart int, rangeEnd int) string {
	if rangeStart == 0 && rangeEnd == 0 {
		return fmt.Sprintf("Workspace file %s.", path)
	}
	return fmt.Sprintf("Workspace file %s lines %d-%d.", path, rangeStart, rangeEnd)
}

func resolveWorkspaceFilePath(workspaceRoot string, requestedPath string) (string, string, error) {
	if strings.TrimSpace(requestedPath) == "" {
		return "", "", errors.New("file path is required")
	}
	root := filepath.Clean(workspaceRoot)
	candidate := requestedPath
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(root, candidate)
	}
	absolutePath := filepath.Clean(candidate)
	relativePath, err := filepath.Rel(root, absolutePath)
	if err != nil {
		return "", "", fmt.Errorf("resolve file path %s: %w", requestedPath, err)
	}
	if relativePath == "." || relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) || filepath.IsAbs(relativePath) {
		return "", "", fmt.Errorf("file path %s is outside workspace", requestedPath)
	}
	info, err := os.Stat(absolutePath)
	if err != nil {
		return "", "", fmt.Errorf("resolve file path %s: %w", requestedPath, err)
	}
	if info.IsDir() {
		return "", "", fmt.Errorf("file path %s is a directory", requestedPath)
	}
	return filepath.ToSlash(relativePath), absolutePath, nil
}

func hashFile(path string, newHash func() hash.Hash) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open evidence file %s: %w", path, err)
	}
	defer file.Close()
	digest := newHash()
	if _, err := io.Copy(digest, file); err != nil {
		return "", fmt.Errorf("hash evidence file %s: %w", path, err)
	}
	return "sha256:" + hex.EncodeToString(digest.Sum(nil)), nil
}

func shortText(value string, limit int) string {
	value = strings.TrimSpace(value)
	if limit <= 0 || len(value) <= limit {
		return value
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return strings.TrimSpace(string(runes[:limit]))
}
