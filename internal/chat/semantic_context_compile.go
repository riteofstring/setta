package chat

import (
	"context"

	"setta/internal/semanticcontext"
)

func (service *Service) compileSemanticContext(ctx context.Context, request semanticcontext.CompileRequest) (*semanticcontext.Delivery, error) {
	service.mu.Lock()
	compiler := service.semanticCompiler
	service.mu.Unlock()

	if compiler == nil {
		return nil, nil
	}
	delivery, err := compiler.CompileContext(ctx, request)
	if err != nil {
		return nil, err
	}
	if delivery.ContextText == "" {
		return nil, nil
	}
	return &delivery, nil
}

func (service *Service) compileSemanticContextForChatTurn(ctx context.Context, trigger semanticcontext.TriggerKind, conversation Conversation, run Run, messageID string, authoredPrompt string) (*semanticcontext.Delivery, error) {
	return service.compileSemanticContext(ctx, semanticcontext.CompileRequest{
		WorkspaceID:    conversation.WorkspaceID,
		TriggerKind:    trigger,
		AuthoredPrompt: authoredPrompt,
		SourceRefs:     semanticContextSourceRefs(conversation, run, messageID),
	})
}

func semanticContextSourceRefs(conversation Conversation, run Run, messageID string) semanticcontext.SourceRefs {
	refs := semanticcontext.SourceRefs{
		ChatConversationID: conversation.ID,
		ChatRunID:          run.ID,
		ChatMessageID:      messageID,
	}
	if conversation.Workflow != nil {
		refs.WorkflowDefinitionID = conversation.Workflow.DefinitionID
		refs.WorkflowExecutionID = conversation.Workflow.ExecutionID
		refs.WorkflowNodeID = conversation.Workflow.NodeID
		refs.WorkflowNodeExecutionID = conversation.Workflow.NodeExecutionID
	}
	return refs
}
