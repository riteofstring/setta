package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/chat"
)

const (
	RunnerRefChatConversation = "chat.conversation"
	RunnerRefChatRun          = "chat.run"
	RunnerRefCodexThread      = "codex.thread"
	RunnerRefCodexSession     = "codex.session"
	RunnerRefCodexTurn        = "codex.turn"
)

type CodexChatService interface {
	ActiveRun(workspaceID string, conversationID string) (chat.Run, bool, error)
	CancelActiveRun(workspaceID string, conversationID string) (chat.Run, error)
	LoadMessagePage(workspaceID string, conversationID string, beforeOrdinal int, limit int) (chat.MessagePage, error)
	LoadRunActivityPage(workspaceID string, runID string, limit int) (chat.RunActivityPage, error)
	SendWorkflowAgentTurn(workspaceID string, request chat.WorkflowAgentTurnRequest) (chat.SendMessageResult, error)
	SubscribeEvents(cursor chat.EventCursor) (*chat.EventSubscription, error)
}

type CodexActionRunner struct {
	chatService CodexChatService
}

func NewCodexActionRunner(chatService CodexChatService) (*CodexActionRunner, error) {
	if chatService == nil {
		return nil, errors.New("codex action runner chat service is required")
	}
	return &CodexActionRunner{chatService: chatService}, nil
}

func (runner *CodexActionRunner) Kind() WorkflowActionKind {
	return ActionKindAgentCodex
}

func (runner *CodexActionRunner) Start(_ context.Context, request ActionStartRequest) (ActionStartResult, error) {
	if request.Node.Action == nil || request.Node.Action.Codex == nil {
		return ActionStartResult{}, fmt.Errorf("agent.codex node %s has no codex config", request.Node.ID)
	}
	config := request.Node.Action.Codex
	turn, err := runner.chatService.SendWorkflowAgentTurn(request.WorkspaceID, chat.WorkflowAgentTurnRequest{
		DefinitionID:        request.DefinitionID,
		DefinitionVersionID: request.DefinitionVersionID,
		ExecutionID:         request.Execution.ID,
		NodeID:              request.Node.ID,
		NodeExecutionID:     request.NodeExecution.ID,
		Prompt:              config.Prompt,
		FreshConversation:   config.FreshConversation,
		Model:               config.Model,
		ReasoningEffort:     codexReasoningEffort(config.ReasoningEffort),
	})
	if err != nil {
		return ActionStartResult{}, err
	}
	return ActionStartResult{RunnerRefs: runnerRefsFromChatTurn(turn)}, nil
}

func (runner *CodexActionRunner) Cancel(_ context.Context, request ActionCancelRequest) error {
	conversationID := runnerRefValue(request.RunnerRefs, RunnerRefChatConversation)
	if conversationID == "" {
		return nil
	}
	if _, ok, err := runner.chatService.ActiveRun(request.WorkspaceID, conversationID); err != nil {
		return err
	} else if !ok {
		return nil
	}
	if _, err := runner.chatService.CancelActiveRun(request.WorkspaceID, conversationID); err != nil {
		return err
	}
	return nil
}

func codexReasoningEffort(value string) *chat.ReasoningEffort {
	if value == "" {
		return nil
	}
	effort := chat.ReasoningEffort(value)
	return &effort
}

func runnerRefsFromChatTurn(turn chat.SendMessageResult) []WorkflowActionRunnerRef {
	refs := []WorkflowActionRunnerRef{
		{Kind: RunnerRefChatConversation, ID: turn.Conversation.ID},
		{Kind: RunnerRefChatRun, ID: turn.Run.ID},
	}
	return append(refs, runnerRefsFromConversation(turn.Page.Conversation)...)
}

func runnerRefsFromConversation(conversation chat.Conversation) []WorkflowActionRunnerRef {
	ref := latestCodexHarnessRef(conversation)
	if ref.ThreadID == "" {
		return []WorkflowActionRunnerRef{}
	}
	refs := []WorkflowActionRunnerRef{{Kind: RunnerRefCodexThread, ID: ref.ThreadID}}
	if ref.SessionID != "" {
		refs = append(refs, WorkflowActionRunnerRef{Kind: RunnerRefCodexSession, ID: ref.SessionID})
	}
	if ref.LastTurnID != "" {
		refs = append(refs, WorkflowActionRunnerRef{Kind: RunnerRefCodexTurn, ID: ref.LastTurnID})
	}
	return refs
}

func latestCodexHarnessRef(conversation chat.Conversation) chat.HarnessThreadRef {
	for index := len(conversation.HarnessRefs) - 1; index >= 0; index-- {
		if conversation.HarnessRefs[index].Harness == chat.HarnessCodex {
			return conversation.HarnessRefs[index]
		}
	}
	return chat.HarnessThreadRef{}
}

func workflowActionResultFromChatRun(run chat.Run, activity chat.RunActivityPage) (WorkflowActionResult, error) {
	result := WorkflowActionResult{
		Signals:   []WorkflowActionSignal{},
		FilePaths: []string{},
	}
	switch run.Status {
	case chat.RunStatusCompleted:
		result.Status = ActionCompletionCompleted
	case chat.RunStatusFailed:
		result.Status = ActionCompletionFailed
		result.Error = run.Error
	case chat.RunStatusCancelled:
		result.Status = ActionCompletionCancelled
		result.Error = run.Error
	default:
		return WorkflowActionResult{}, fmt.Errorf("chat run %s status %s is not terminal", run.ID, run.Status)
	}
	signals, output, filePaths, err := workflowResultPayloadFromActivity(activity)
	if err != nil {
		return WorkflowActionResult{}, err
	}
	result.Signals = signals
	result.Output = output
	result.FilePaths = filePaths
	return result, nil
}

func workflowActionResultFromChatRunReconcileError(run chat.Run, message string) WorkflowActionResult {
	switch run.Status {
	case chat.RunStatusCancelled:
		return WorkflowActionResult{
			Status: ActionCompletionCancelled,
			Error:  nonEmpty(run.Error, message),
		}
	default:
		return WorkflowActionResult{
			Status: ActionCompletionFailed,
			Error:  nonEmpty(run.Error, message),
		}
	}
}

func workflowResultPayloadFromActivity(activity chat.RunActivityPage) ([]WorkflowActionSignal, json.RawMessage, []string, error) {
	for index := len(activity.Items) - 1; index >= 0; index-- {
		item := activity.Items[index]
		if item.Type != chat.RunItemTypeDynamicToolCall ||
			item.Status != chat.RunItemStatusCompleted ||
			item.Namespace != chat.SettaAgentToolNamespace ||
			item.ToolName != chat.SettaWorkflowResultAgentToolName {
			continue
		}
		payload, err := chat.DecodeSettaWorkflowResultPayload(item.Details)
		if err != nil {
			return nil, nil, nil, err
		}
		signals := make([]WorkflowActionSignal, 0, len(payload.Signals))
		for _, signal := range payload.Signals {
			signals = append(signals, WorkflowActionSignal{Name: signal.Name, Value: signal.Value})
		}
		return signals, payload.Output, append([]string{}, payload.FilePaths...), nil
	}
	return []WorkflowActionSignal{}, nil, []string{}, nil
}

func runnerRefValue(refs []WorkflowActionRunnerRef, kind string) string {
	for _, ref := range refs {
		if ref.Kind == kind {
			return ref.ID
		}
	}
	return ""
}
