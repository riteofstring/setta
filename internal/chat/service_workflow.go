package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

type WorkflowAgentTurnRequest struct {
	DefinitionID        string
	DefinitionVersionID string
	ExecutionID         string
	NodeID              string
	NodeExecutionID     string
	Prompt              string
	FreshConversation   bool
	Model               string
	ReasoningEffort     *ReasoningEffort
}

func (service *Service) SendWorkflowAgentTurn(workspaceID string, request WorkflowAgentTurnRequest) (SendMessageResult, error) {
	prompt := strings.TrimSpace(request.Prompt)
	if prompt == "" {
		return SendMessageResult{}, errors.New("workflow agent prompt is required")
	}
	if err := rejectSlashPromptForMessageEndpoint(prompt); err != nil {
		return SendMessageResult{}, err
	}
	workspaceSummary, err := service.resolveWorkspaceForRequest(workspaceID)
	if err != nil {
		return SendMessageResult{}, err
	}
	if err := validateWorkflowAgentTurnRequest(request); err != nil {
		return SendMessageResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()

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
	conversation, userMessage, assistantMessage, run, err := service.persistTurnStartForConversationLocked(conversation, prompt, MessageDeliveryNormal, now)
	if err != nil {
		return SendMessageResult{}, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	service.active[key] = activeTurn{
		assistantMessage: assistantMessage,
		cancel:           cancel,
		runID:            run.ID,
		workspaceID:      workspaceID,
	}
	turnRequest := TurnRequest{
		Workspace:    workspaceSummary,
		Conversation: conversation,
		Run:          run,
		Prompt:       prompt,
		ThreadRef:    latestHarnessRef(conversation, HarnessCodex),
	}
	go service.runHarnessTurn(ctx, turnRequest)

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
	conversations, corrupt, err := service.store.ScanConversationsAllowingCorrupt(workspaceID)
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
