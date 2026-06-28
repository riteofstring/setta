package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/semanticcontext"
	"setta/internal/workspace"
)

type WorkflowAgentTurnRequest struct {
	DefinitionID        string
	DefinitionVersionID string
	ExecutionID         string
	NodeID              string
	NodeExecutionID     string
	Prompt              string
	SemanticContext     *semanticcontext.Delivery
	FreshConversation   bool
	Model               string
	ReasoningEffort     *ReasoningEffort
}

func (service *Service) SendWorkflowAgentTurn(workspaceID string, request WorkflowAgentTurnRequest) (SendMessageResult, error) {
	prompt, workspaceSummary, err := service.validateWorkflowAgentTurn(workspaceID, request)
	if err != nil {
		return SendMessageResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()
	return service.sendWorkflowAgentTurnLocked(workspaceID, request, prompt, workspaceSummary)
}

func (service *Service) validateWorkflowAgentTurn(workspaceID string, request WorkflowAgentTurnRequest) (string, workspace.WorkspaceSummary, error) {
	prompt := strings.TrimSpace(request.Prompt)
	if prompt == "" {
		return "", workspace.WorkspaceSummary{}, errors.New("workflow agent prompt is required")
	}
	if err := rejectSlashPromptForMessageEndpoint(prompt); err != nil {
		return "", workspace.WorkspaceSummary{}, err
	}
	workspaceSummary, err := service.resolveWorkspaceForRequest(workspaceID)
	if err != nil {
		return "", workspace.WorkspaceSummary{}, err
	}
	if err := validateWorkflowAgentTurnRequest(request); err != nil {
		return "", workspace.WorkspaceSummary{}, err
	}
	return prompt, workspaceSummary, nil
}

func (service *Service) sendWorkflowAgentTurnLocked(workspaceID string, request WorkflowAgentTurnRequest, prompt string, workspaceSummary workspace.WorkspaceSummary) (SendMessageResult, error) {
	if existing, ok, err := service.existingWorkflowAgentTurnLocked(workspaceID, request); err != nil || ok {
		return existing, err
	}
	conversation, err := service.workflowAgentConversationLocked(workspaceID, request)
	if err != nil {
		return SendMessageResult{}, err
	}
	key := activeKey(workspaceID, conversation.ID)
	if err := service.ensureCanStartTurnLocked(workspaceID, conversation.ID, key); err != nil {
		return SendMessageResult{}, err
	}

	now := timestamp(service.now())
	conversation = service.prepareWorkflowAgentConversation(conversation, request, now)
	if err := service.store.SaveConversation(conversation); err != nil {
		return SendMessageResult{}, err
	}
	input := TextChatInput(prompt)
	conversation, userMessage, assistantMessage, run, err := service.persistTurnStartForConversationLocked(conversation, input, MessageDeliveryNormal, now)
	if err != nil {
		return SendMessageResult{}, err
	}
	ingest, err := service.newTranscriptIngestLocked(workspaceID, run)
	if err != nil {
		return SendMessageResult{}, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	service.active[key] = activeTurn{
		assistantMessage: assistantMessage,
		cancel:           cancel,
		runID:            run.ID,
		workspaceID:      workspaceID,
		transcript:       ingest,
	}
	deliveryInput, err := service.deliveryInputFromMessage(workspaceID, conversation.ID, userMessage)
	if err != nil {
		return SendMessageResult{}, err
	}
	turnRequest := TurnRequest{
		Workspace:       workspaceSummary,
		Conversation:    conversation,
		Run:             run,
		Input:           deliveryInput,
		SemanticContext: request.SemanticContext,
		ThreadRef:       latestHarnessRef(conversation, HarnessCodex),
	}
	if err := service.launchHarnessTurnLocked(ctx, turnRequest); err != nil {
		return SendMessageResult{}, err
	}

	page, err := service.loadMessagePageLocked(workspaceID, conversation.ID, 0, defaultPageLimit)
	if err != nil {
		return SendMessageResult{}, err
	}
	return SendMessageResult{
		Conversation:     conversation,
		UserMessage:      userMessage,
		AssistantMessage: assistantMessage,
		Run:              run,
		Page:             page,
	}, nil
}

func (service *Service) existingWorkflowAgentTurnLocked(workspaceID string, request WorkflowAgentTurnRequest) (SendMessageResult, bool, error) {
	conversation, ok, err := service.findExactWorkflowConversationLocked(workspaceID, request)
	if err != nil || !ok {
		return SendMessageResult{}, false, err
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversation.ID)
	if err != nil {
		return SendMessageResult{}, false, err
	}
	if len(runs) == 0 {
		return SendMessageResult{}, false, nil
	}
	run := runs[0]
	if err := service.validateRunAssistantMessage(workspaceID, run); err != nil {
		service.recordCorruptStateDiagnosticLocked(err, workspaceID, conversation.ID, run.ID)
		return SendMessageResult{}, false, err
	}
	userMessage, ok, err := service.store.FindMessageByID(workspaceID, conversation.ID, run.TriggerMessageID)
	if err != nil {
		return SendMessageResult{}, false, err
	}
	if !ok {
		return SendMessageResult{}, false, corruptStateErrorf(service.store.runPath(workspaceID, run.ID), "run %s trigger message %s was not found", run.ID, run.TriggerMessageID)
	}
	assistantMessage, ok, err := service.store.FindMessageByID(workspaceID, conversation.ID, run.AssistantMessageID)
	if err != nil {
		return SendMessageResult{}, false, err
	}
	if !ok {
		return SendMessageResult{}, false, corruptStateErrorf(service.store.runPath(workspaceID, run.ID), "run %s assistant message %s was not found", run.ID, run.AssistantMessageID)
	}
	page, err := service.loadMessagePageLocked(workspaceID, conversation.ID, 0, defaultPageLimit)
	if err != nil {
		return SendMessageResult{}, false, err
	}
	return SendMessageResult{
		Conversation:     conversation,
		UserMessage:      userMessage,
		AssistantMessage: assistantMessage,
		Run:              run,
		Page:             page,
	}, true, nil
}

func (service *Service) findExactWorkflowConversationLocked(workspaceID string, request WorkflowAgentTurnRequest) (Conversation, bool, error) {
	conversations, corrupt, err := service.store.scanConversationsAllowingCorrupt(workspaceID)
	if err != nil {
		return Conversation{}, false, err
	}
	if len(corrupt) > 0 {
		return Conversation{}, false, corruptFindingError(corrupt[0])
	}
	for _, conversation := range conversations {
		if conversationMatchesWorkflowNodeExecution(conversation, request) {
			return conversation, true, nil
		}
	}
	return Conversation{}, false, nil
}

func (service *Service) ListWorkflowConversations(workspaceID string) ([]Conversation, error) {
	if _, err := service.resolveWorkspaceForRequest(workspaceID); err != nil {
		return nil, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	conversations, corrupt, err := service.store.scanConversationsAllowingCorrupt(workspaceID)
	if err != nil {
		return nil, err
	}
	if len(corrupt) > 0 {
		return nil, corruptFindingError(corrupt[0])
	}
	result := make([]Conversation, 0, len(conversations))
	for _, conversation := range conversations {
		if conversation.Internal && conversation.Workflow != nil {
			result = append(result, conversation)
		}
	}
	return result, nil
}

func validateWorkflowAgentTurnRequest(request WorkflowAgentTurnRequest) error {
	if err := validateStorageID("workflow definition id", request.DefinitionID); err != nil {
		return err
	}
	if err := validateStorageID("workflow definition version id", request.DefinitionVersionID); err != nil {
		return err
	}
	if err := validateStorageID("workflow execution id", request.ExecutionID); err != nil {
		return err
	}
	if err := validateStorageID("workflow node id", request.NodeID); err != nil {
		return err
	}
	if err := validateStorageID("workflow node execution id", request.NodeExecutionID); err != nil {
		return err
	}
	if request.ReasoningEffort != nil && !validValue(*request.ReasoningEffort, reasoningEffortValues) {
		return fmt.Errorf("workflow agent reasoning effort has unsupported value %s", *request.ReasoningEffort)
	}
	return nil
}

func (service *Service) workflowAgentConversationLocked(workspaceID string, request WorkflowAgentTurnRequest) (Conversation, error) {
	if !request.FreshConversation {
		conversation, ok, err := service.findReusableWorkflowConversationLocked(workspaceID, request)
		if err != nil || ok {
			return conversation, err
		}
	}
	return service.newWorkflowAgentConversation(workspaceID, request)
}

func (service *Service) findReusableWorkflowConversationLocked(workspaceID string, request WorkflowAgentTurnRequest) (Conversation, bool, error) {
	conversations, corrupt, err := service.store.scanConversationsAllowingCorrupt(workspaceID)
	if err != nil {
		return Conversation{}, false, err
	}
	if len(corrupt) > 0 {
		return Conversation{}, false, corruptFindingError(corrupt[0])
	}
	var selected *Conversation
	for _, conversation := range conversations {
		if !conversationMatchesWorkflowNode(conversation, request) {
			continue
		}
		if selected == nil || conversation.UpdatedAt > selected.UpdatedAt || (conversation.UpdatedAt == selected.UpdatedAt && conversation.ID > selected.ID) {
			next := conversation
			selected = &next
		}
	}
	if selected == nil {
		return Conversation{}, false, nil
	}
	return *selected, true, nil
}

func conversationMatchesWorkflowNode(conversation Conversation, request WorkflowAgentTurnRequest) bool {
	return conversation.Internal &&
		conversation.Workflow != nil &&
		conversation.Workflow.DefinitionID == request.DefinitionID &&
		conversation.Workflow.DefinitionVersionID == request.DefinitionVersionID &&
		conversation.Workflow.ExecutionID == request.ExecutionID &&
		conversation.Workflow.NodeID == request.NodeID
}

func conversationMatchesWorkflowNodeExecution(conversation Conversation, request WorkflowAgentTurnRequest) bool {
	return conversationMatchesWorkflowNode(conversation, request) &&
		conversation.Workflow.NodeExecutionID == request.NodeExecutionID
}

func (service *Service) newWorkflowAgentConversation(workspaceID string, request WorkflowAgentTurnRequest) (Conversation, error) {
	id, err := service.newID("conversation")
	if err != nil {
		return Conversation{}, fmt.Errorf("create workflow conversation id: %w", err)
	}
	now := timestamp(service.now())
	return Conversation{
		SchemaVersion: SchemaVersion,
		ID:            id,
		WorkspaceID:   workspaceID,
		Title:         workflowAgentConversationTitle(request),
		Internal:      true,
		CreatedAt:     now,
		UpdatedAt:     now,
		ArchivedAt:    "",
		HarnessRefs:   []HarnessThreadRef{},
		Workflow:      workflowMetadataFromTurnRequest(request),
	}, nil
}

func (service *Service) prepareWorkflowAgentConversation(conversation Conversation, request WorkflowAgentTurnRequest, now string) Conversation {
	conversation.Internal = true
	conversation.Workflow = workflowMetadataFromTurnRequest(request)
	conversation.UpdatedAt = now
	conversation.CodexSettings = workflowCodexSettings(conversation.CodexSettings, request.Model, request.ReasoningEffort)
	if conversation.HarnessRefs == nil {
		conversation.HarnessRefs = []HarnessThreadRef{}
	}
	return conversation
}

func workflowMetadataFromTurnRequest(request WorkflowAgentTurnRequest) *ConversationWorkflowMetadata {
	return &ConversationWorkflowMetadata{
		DefinitionID:        request.DefinitionID,
		DefinitionVersionID: request.DefinitionVersionID,
		ExecutionID:         request.ExecutionID,
		NodeID:              request.NodeID,
		NodeExecutionID:     request.NodeExecutionID,
	}
}

func workflowCodexSettings(existing *ChatCodexSettings, model string, reasoning *ReasoningEffort) *ChatCodexSettings {
	if model == "" && reasoning == nil {
		return existing
	}
	settings := ChatCodexSettings{}
	if existing != nil {
		settings = *existing
	}
	if model != "" {
		settings.Model = model
	}
	if reasoning != nil {
		value := *reasoning
		settings.ReasoningEffort = &value
	}
	return &settings
}

func workflowAgentConversationTitle(request WorkflowAgentTurnRequest) string {
	if request.NodeID == "" {
		return "Workflow agent"
	}
	return "Workflow agent: " + request.NodeID
}
