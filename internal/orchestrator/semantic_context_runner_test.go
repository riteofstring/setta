package orchestrator

import (
	"context"
	"errors"
	"testing"

	"setta/internal/chat"
	"setta/internal/semanticcontext"
)

func TestCodexRunnerCompilesSemanticContextBeforeWorkflowAgentTurn(t *testing.T) {
	order := []string{}
	compiler := recordingSemanticCompiler{
		compile: func(_ context.Context, request semanticcontext.CompileRequest) (semanticcontext.Delivery, error) {
			order = append(order, "compiler")
			if request.TriggerKind != semanticcontext.TriggerWorkflowAgentStart ||
				request.SourceRefs.WorkflowExecutionID != "execution_context" ||
				request.SourceRefs.WorkflowNodeExecutionID != "node_execution_context" ||
				request.AuthoredPrompt != "workflow prompt" {
				t.Fatalf("compile request = %+v, want workflow source refs and authored prompt", request)
			}
			return semanticcontext.Delivery{PackID: "pack_context", ContextText: "Setta semantic context pack pack_context", ItemCount: 1}, nil
		},
	}
	chatClient := &recordingCodexChatClient{
		send: func(_ string, request chat.WorkflowAgentTurnRequest) (chat.SendMessageResult, error) {
			order = append(order, "chat")
			if request.SemanticContext == nil || request.SemanticContext.PackID != "pack_context" {
				t.Fatalf("workflow turn semantic context = %+v, want pack_context", request.SemanticContext)
			}
			if request.Prompt != "workflow prompt" {
				t.Fatalf("workflow turn prompt = %q, want authored prompt", request.Prompt)
			}
			return workflowTurnResultForSemanticContextTest(), nil
		},
	}
	runner, err := NewCodexActionRunner(chatClient, compiler)
	if err != nil {
		t.Fatalf("new Codex runner: %v", err)
	}

	if _, err := runner.Start(context.Background(), semanticContextActionStartRequest(), nil); err != nil {
		t.Fatalf("start runner: %v", err)
	}
	if len(order) != 2 || order[0] != "compiler" || order[1] != "chat" {
		t.Fatalf("call order = %+v, want compiler before chat", order)
	}
}

func TestCodexRunnerDoesNotStartWorkflowAgentTurnWhenSemanticContextFails(t *testing.T) {
	expected := errors.New("persist context pack failed")
	compiler := recordingSemanticCompiler{
		compile: func(context.Context, semanticcontext.CompileRequest) (semanticcontext.Delivery, error) {
			return semanticcontext.Delivery{}, expected
		},
	}
	chatClient := &recordingCodexChatClient{
		send: func(string, chat.WorkflowAgentTurnRequest) (chat.SendMessageResult, error) {
			t.Fatal("workflow agent turn started after semantic context failure")
			return chat.SendMessageResult{}, nil
		},
	}
	runner, err := NewCodexActionRunner(chatClient, compiler)
	if err != nil {
		t.Fatalf("new Codex runner: %v", err)
	}

	_, err = runner.Start(context.Background(), semanticContextActionStartRequest(), nil)
	if !errors.Is(err, expected) {
		t.Fatalf("start error = %v, want %v", err, expected)
	}
	if chatClient.sendCount != 0 {
		t.Fatalf("chat send count = %d, want 0", chatClient.sendCount)
	}
}

type recordingSemanticCompiler struct {
	compile func(context.Context, semanticcontext.CompileRequest) (semanticcontext.Delivery, error)
}

func (compiler recordingSemanticCompiler) CompileContext(ctx context.Context, request semanticcontext.CompileRequest) (semanticcontext.Delivery, error) {
	return compiler.compile(ctx, request)
}

type recordingCodexChatClient struct {
	send      func(string, chat.WorkflowAgentTurnRequest) (chat.SendMessageResult, error)
	sendCount int
}

func (client *recordingCodexChatClient) ActiveRun(string, string) (chat.Run, bool, error) {
	return chat.Run{}, false, nil
}

func (client *recordingCodexChatClient) ActiveRunWithLiveness(string, string) (chat.Run, *chat.RunLiveness, bool, error) {
	return chat.Run{}, nil, false, nil
}

func (client *recordingCodexChatClient) CancelActiveRun(string, string) (chat.Run, error) {
	return chat.Run{}, nil
}

func (client *recordingCodexChatClient) CancelActiveRunByID(string, string, string) (chat.Run, error) {
	return chat.Run{}, nil
}

func (client *recordingCodexChatClient) ListRuns(string, string) ([]chat.Run, error) {
	return nil, nil
}

func (client *recordingCodexChatClient) LoadMessagePage(string, string, int, int) (chat.MessagePage, error) {
	return chat.MessagePage{}, nil
}

func (client *recordingCodexChatClient) LoadRunActivityPage(string, string, string, int) (chat.RunActivityPage, error) {
	return chat.RunActivityPage{}, nil
}

func (client *recordingCodexChatClient) LoadRunActivityItems(string, string) ([]chat.RunItem, error) {
	return nil, nil
}

func (client *recordingCodexChatClient) LoadRunItemOutputPage(string, string, string, int, int) (chat.RunItemOutputPage, error) {
	return chat.RunItemOutputPage{}, nil
}

func (client *recordingCodexChatClient) LoadRunTranscriptPage(string, string, int, int) (chat.RunTranscriptPage, error) {
	return chat.RunTranscriptPage{}, nil
}

func (client *recordingCodexChatClient) ReconcileActiveRunByID(context.Context, string, string, string, chat.RunLivenessReason) (chat.RunLivenessReconciliationResult, error) {
	return chat.RunLivenessReconciliationResult{}, nil
}

func (client *recordingCodexChatClient) SendWorkflowAgentTurn(workspaceID string, request chat.WorkflowAgentTurnRequest) (chat.SendMessageResult, error) {
	client.sendCount++
	return client.send(workspaceID, request)
}

func (client *recordingCodexChatClient) SteerActiveRunInputByID(string, string, string, chat.ChatInput) (chat.SteerMessageResult, error) {
	return chat.SteerMessageResult{}, nil
}

func (client *recordingCodexChatClient) SubscribeEvents(chat.EventCursor) (*chat.EventSubscription, error) {
	return nil, nil
}

func (client *recordingCodexChatClient) SubmitApproval(string, string, string, bool, string, []chat.ApprovalAnswer, bool) (chat.Run, error) {
	return chat.Run{}, nil
}

func semanticContextActionStartRequest() ActionStartRequest {
	actionKind := ActionKindAgentCodex
	return ActionStartRequest{
		WorkspaceID:         "workspace_context",
		DefinitionID:        "definition_context",
		DefinitionVersionID: "version_context",
		Execution: WorkflowExecution{
			ID:                  "execution_context",
			DefinitionID:        "definition_context",
			DefinitionVersionID: "version_context",
		},
		Node: WorkflowNode{
			ID:   "workflow_node_context",
			Kind: NodeKindAction,
			Action: &WorkflowActionConfig{
				Kind: actionKind,
				Codex: &WorkflowCodexActionConfig{
					Prompt: "workflow prompt",
				},
			},
		},
		NodeExecution: WorkflowNodeExecution{
			ID:         "node_execution_context",
			NodeID:     "workflow_node_context",
			ActionKind: &actionKind,
		},
	}
}

func workflowTurnResultForSemanticContextTest() chat.SendMessageResult {
	conversation := chat.Conversation{
		ID:          "conversation_context",
		WorkspaceID: "workspace_context",
	}
	run := chat.Run{
		ID:             "run_context",
		WorkspaceID:    "workspace_context",
		ConversationID: conversation.ID,
		Status:         chat.RunStatusRunning,
	}
	return chat.SendMessageResult{
		Conversation: conversation,
		Run:          run,
		Page:         chat.MessagePage{Conversation: conversation},
	}
}
