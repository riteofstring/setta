package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/chat"
	"setta/internal/semanticcontext"
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
	ListRuns(workspaceID string, conversationID string) ([]chat.Run, error)
	LoadMessagePage(workspaceID string, conversationID string, beforeOrdinal int, limit int) (chat.MessagePage, error)
	LoadRunActivityPage(workspaceID string, runID string, limit int) (chat.RunActivityPage, error)
	SendWorkflowAgentTurn(workspaceID string, request chat.WorkflowAgentTurnRequest) (chat.SendMessageResult, error)
	SubscribeEvents(cursor chat.EventCursor) (*chat.EventSubscription, error)
	SubmitApproval(workspaceID string, conversationID string, approvalID string, approved bool, response string, answers []chat.ApprovalAnswer, cancelled bool) (chat.Run, error)
}

type CodexActionRunner struct {
	chatService      CodexChatService
	semanticCompiler semanticcontext.Compiler
}

type CodexActionRunnerDescriptor struct{}

func NewCodexActionRunner(chatService CodexChatService, compiler ...semanticcontext.Compiler) (*CodexActionRunner, error) {
	if chatService == nil {
		return nil, errors.New("codex action runner chat service is required")
	}
	runner := &CodexActionRunner{chatService: chatService}
	if len(compiler) > 0 {
		runner.semanticCompiler = compiler[0]
	}
	return runner, nil
}

func (descriptor CodexActionRunnerDescriptor) Kind() WorkflowActionKind {
	return ActionKindAgentCodex
}

func (descriptor CodexActionRunnerDescriptor) Capabilities(config WorkflowActionConfig) (RunnerCapabilities, error) {
	policy, err := workflowActionPolicyForConfig(config)
	if err != nil {
		return RunnerCapabilities{}, err
	}
	return RunnerCapabilities{
		SchemaVersion: SchemaVersion,
		RunnerKind:    ActionKindAgentCodex,
		DisplayName:   "Codex Agent",
		Operations: []RunnerOperation{
			RunnerOperationStart,
			RunnerOperationCancel,
			RunnerOperationRecover,
		},
		EmittedEvents: []RunnerEventType{
			RunnerEventAttemptStarted,
			RunnerEventTextDelta,
			RunnerEventToolCallStarted,
			RunnerEventToolCallOutput,
			RunnerEventApprovalRequested,
			RunnerEventApprovalResolved,
			RunnerEventArtifactReported,
			RunnerEventStructuredOutputReceived,
			RunnerEventAttemptCompleted,
			RunnerEventAttemptFailed,
			RunnerEventAttemptCancelled,
			RunnerEventAttemptRecoveryRequired,
		},
		OutputModes: []RunnerOutputMode{
			RunnerOutputModeSignals,
			RunnerOutputModeStructuredJSON,
			RunnerOutputModeFileRefs,
			RunnerOutputModeMetrics,
		},
		ApprovalKinds: []RunnerApprovalKind{
			RunnerApprovalKindCommand,
			RunnerApprovalKindFileChange,
			RunnerApprovalKindPermission,
			RunnerApprovalKindStructuredInput,
			RunnerApprovalKindUserInput,
		},
		Requirements: RunnerRequirements{
			Network:         RunnerRequirementNetworkRequired,
			SidecarProcess:  RunnerRequirementSidecarProcessNotUsed,
			WorkspaceAccess: RunnerRequirementWorkspaceAccessRunnerDefined,
		},
		SideEffectPolicy: policy.SideEffectPolicy,
		Recovery:         RunnerRecoveryCapabilityReconcileRefs,
		PolicyExtension: RunnerPolicyExtensionDescriptor{
			ExtensionKind:    ActionKindAgentCodex.String(),
			ExtensionVersion: 1,
		},
	}, nil
}

func (descriptor CodexActionRunnerDescriptor) ValidateConfig(config WorkflowActionConfig) []RunnerConfigDiagnostic {
	if config.Kind != ActionKindAgentCodex {
		return []RunnerConfigDiagnostic{{
			Code:    "codex_action_kind_mismatch",
			Message: fmt.Sprintf("agent.codex descriptor cannot validate action kind %q", config.Kind),
		}}
	}
	if config.Codex == nil {
		return []RunnerConfigDiagnostic{{
			Code:    "codex_action_config_required",
			Message: "agent.codex action must declare codex config",
		}}
	}
	if config.Codex.Prompt == "" {
		return []RunnerConfigDiagnostic{{
			Code:    "codex_action_prompt_required",
			Message: "agent.codex prompt is required",
		}}
	}
	return []RunnerConfigDiagnostic{}
}

func (runner *CodexActionRunner) Kind() WorkflowActionKind {
	return ActionKindAgentCodex
}

func (runner *CodexActionRunner) Capabilities(config WorkflowActionConfig) (RunnerCapabilities, error) {
	return CodexActionRunnerDescriptor{}.Capabilities(config)
}

func (runner *CodexActionRunner) ValidateConfig(config WorkflowActionConfig) []RunnerConfigDiagnostic {
	return CodexActionRunnerDescriptor{}.ValidateConfig(config)
}

func (runner *CodexActionRunner) Start(_ context.Context, request ActionStartRequest, sink RunnerEventSink) (ActionStartResult, error) {
	if request.Node.Action == nil || request.Node.Action.Codex == nil {
		return ActionStartResult{}, fmt.Errorf("agent.codex node %s has no codex config", request.Node.ID)
	}
	config := request.Node.Action.Codex
	semanticDelivery, err := runner.compileSemanticContext(request, config.Prompt)
	if err != nil {
		return ActionStartResult{}, err
	}
	turn, err := runner.chatService.SendWorkflowAgentTurn(request.WorkspaceID, chat.WorkflowAgentTurnRequest{
		DefinitionID:        request.DefinitionID,
		DefinitionVersionID: request.DefinitionVersionID,
		ExecutionID:         request.Execution.ID,
		NodeID:              request.Node.ID,
		NodeExecutionID:     request.NodeExecution.ID,
		Prompt:              config.Prompt,
		SemanticContext:     semanticDelivery,
		FreshConversation:   config.FreshConversation,
		Model:               config.Model,
		ReasoningEffort:     codexReasoningEffort(config.ReasoningEffort),
	})
	if err != nil {
		return ActionStartResult{}, err
	}
	refs := runnerRefsFromChatTurn(turn)
	if sink != nil {
		activityRefs := []WorkflowActivityRef{workflowActivityRefFromChatRun(request, turn.Run.ID)}
		payload, err := json.Marshal(RunnerAttemptStartedPayload{
			RunnerRefs:       refs,
			Capabilities:     request.Capabilities,
			InputHash:        request.InputHash,
			IdempotencyKey:   request.NodeExecution.IdempotencyKey,
			SideEffectPolicy: request.Policy.SideEffectPolicy,
			ActivityRefs:     activityRefs,
		})
		if err != nil {
			return ActionStartResult{}, err
		}
		if err := sink.EmitRunnerEvent(RunnerEvent{
			Type:    RunnerEventAttemptStarted,
			Payload: payload,
		}); err != nil {
			return ActionStartResult{}, err
		}
	}
	return ActionStartResult{RunnerRefs: refs}, nil
}

func (runner *CodexActionRunner) compileSemanticContext(request ActionStartRequest, authoredPrompt string) (*semanticcontext.Delivery, error) {
	if runner.semanticCompiler == nil {
		return nil, nil
	}
	delivery, err := runner.semanticCompiler.CompileContext(context.Background(), semanticcontext.CompileRequest{
		WorkspaceID:    request.WorkspaceID,
		TriggerKind:    semanticcontext.TriggerWorkflowAgentStart,
		AuthoredPrompt: authoredPrompt,
		SourceRefs: semanticcontext.SourceRefs{
			WorkflowDefinitionID:    request.DefinitionID,
			WorkflowExecutionID:     request.Execution.ID,
			WorkflowNodeID:          request.Node.ID,
			WorkflowNodeExecutionID: request.NodeExecution.ID,
		},
	})
	if err != nil {
		return nil, err
	}
	if delivery.ContextText == "" {
		return nil, nil
	}
	return &delivery, nil
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

func (runner *CodexActionRunner) Signal(_ context.Context, _ ActionSignalRequest) (ActionSignalResult, error) {
	return ActionSignalResult{}, errors.New("agent.codex runner does not support signal")
}

func (runner *CodexActionRunner) Recover(_ context.Context, request ActionRecoverRequest, sink RunnerEventSink) (ActionRecoverResult, error) {
	conversationID := runnerRefValue(request.RunnerRefs, RunnerRefChatConversation)
	runID := runnerRefValue(request.RunnerRefs, RunnerRefChatRun)
	if conversationID == "" || runID == "" {
		return runner.codexManualRecoveryRequired(request, sink, "agent.codex recovery requires committed chat conversation and run refs")
	}
	page, err := runner.chatService.LoadMessagePage(request.WorkspaceID, conversationID, 0, 1)
	if err != nil {
		return runner.codexManualRecoveryRequired(request, sink, fmt.Sprintf("load workflow-owned chat conversation: %v", err))
	}
	runs, err := runner.chatService.ListRuns(request.WorkspaceID, conversationID)
	if err != nil {
		return runner.codexManualRecoveryRequired(request, sink, fmt.Sprintf("load workflow-owned chat runs: %v", err))
	}
	run, ok := chatRunByID(runs, runID)
	if !ok {
		return runner.codexManualRecoveryRequired(request, sink, fmt.Sprintf("workflow-owned chat run %s was not found", runID))
	}
	owner := workflowRunOwner{
		conversation:  page.Conversation,
		execution:     request.Execution,
		nodeExecution: request.NodeExecution,
	}
	refs := workflowRunRefs(run, page.Conversation)
	switch run.Status {
	case chat.RunStatusQueued, chat.RunStatusRunning:
		if run.PendingApproval != nil {
			pending := workflowPendingApprovalFromChatRun(owner, run)
			events, err := runnerEventsFromChatApprovalRequest(owner, run, pending)
			if err != nil {
				return ActionRecoverResult{}, err
			}
			if err := emitRunnerEvents(sink, events); err != nil {
				return ActionRecoverResult{}, err
			}
			return ActionRecoverResult{
				Outcome:    RunnerRecoveryOutcomeRecoveredRunning,
				Result:     &WorkflowActionResult{Status: ActionCompletionRequiresApproval, PendingApproval: pending},
				RunnerRefs: refs,
				Message:    "reattached workflow-owned Codex run waiting for approval",
			}, nil
		}
		return ActionRecoverResult{
			Outcome:    RunnerRecoveryOutcomeRecoveredRunning,
			RunnerRefs: refs,
			Message:    "reattached workflow-owned Codex run",
		}, nil
	case chat.RunStatusCompleted, chat.RunStatusFailed, chat.RunStatusCancelled:
		return runner.recoverTerminalCodexRun(owner, run, refs, sink)
	default:
		return runner.codexManualRecoveryRequired(request, sink, fmt.Sprintf("unsupported workflow-owned chat run status %s", run.Status))
	}
}

func (runner *CodexActionRunner) recoverTerminalCodexRun(owner workflowRunOwner, run chat.Run, refs []WorkflowActionRunnerRef, sink RunnerEventSink) (ActionRecoverResult, error) {
	activity, err := runner.chatService.LoadRunActivityPage(run.WorkspaceID, run.ID, 1000)
	var result WorkflowActionResult
	if err != nil {
		result = workflowActionResultFromChatRunReconcileError(run, fmt.Sprintf("load chat run activity: %v", err))
	} else {
		result, err = workflowActionResultFromChatRun(run, activity)
		if err != nil {
			result = workflowActionResultFromChatRunReconcileError(run, fmt.Sprintf("decode workflow result: %v", err))
		}
	}
	events, err := runnerEventsFromTerminalChatRun(owner, result)
	if err != nil {
		return ActionRecoverResult{}, err
	}
	if err := emitRunnerEvents(sink, events); err != nil {
		return ActionRecoverResult{}, err
	}
	return ActionRecoverResult{
		Outcome:    recoveryOutcomeFromActionResult(result),
		Result:     &result,
		RunnerRefs: refs,
		Message:    fmt.Sprintf("reconciled terminal workflow-owned Codex run %s", run.ID),
	}, nil
}

func (runner *CodexActionRunner) codexManualRecoveryRequired(request ActionRecoverRequest, sink RunnerEventSink, message string) (ActionRecoverResult, error) {
	sideEffectPolicy := codexSideEffectPolicy()
	if request.NodeExecution.SideEffectPolicy != nil {
		sideEffectPolicy = *request.NodeExecution.SideEffectPolicy
	}
	payload, err := json.Marshal(RunnerAttemptRecoveryRequiredPayload{
		Outcome:          RunnerRecoveryOutcomeManualRecoveryRequired,
		Message:          message,
		SideEffectPolicy: sideEffectPolicy,
	})
	if err != nil {
		return ActionRecoverResult{}, fmt.Errorf("encode Codex recovery-required event: %w", err)
	}
	if sink != nil {
		if err := sink.EmitRunnerEvent(RunnerEvent{
			Type:    RunnerEventAttemptRecoveryRequired,
			Payload: payload,
		}); err != nil {
			return ActionRecoverResult{}, err
		}
	}
	return ActionRecoverResult{
		Outcome:    RunnerRecoveryOutcomeManualRecoveryRequired,
		RunnerRefs: append([]WorkflowActionRunnerRef{}, request.RunnerRefs...),
		Message:    message,
	}, nil
}

func chatRunByID(runs []chat.Run, runID string) (chat.Run, bool) {
	for _, run := range runs {
		if run.ID == runID {
			return run, true
		}
	}
	return chat.Run{}, false
}

func emitRunnerEvents(sink RunnerEventSink, events []RunnerEvent) error {
	if sink == nil {
		return nil
	}
	for _, event := range events {
		if err := sink.EmitRunnerEvent(event); err != nil {
			return err
		}
	}
	return nil
}

func recoveryOutcomeFromActionResult(result WorkflowActionResult) RunnerRecoveryOutcome {
	switch result.Status {
	case ActionCompletionCompleted:
		return RunnerRecoveryOutcomeRecoveredCompleted
	case ActionCompletionCancelled, ActionCompletionFailed:
		return RunnerRecoveryOutcomeRecoveredFailed
	default:
		return RunnerRecoveryOutcomeManualRecoveryRequired
	}
}

func (kind WorkflowActionKind) String() string {
	return string(kind)
}

func workflowActivityRefFromChatRun(request ActionStartRequest, runID string) WorkflowActivityRef {
	return WorkflowActivityRef{
		SchemaVersion:   SchemaVersion,
		ID:              request.NodeExecution.ID + "_chat_run_activity",
		WorkspaceID:     request.WorkspaceID,
		ExecutionID:     request.Execution.ID,
		NodeExecutionID: request.NodeExecution.ID,
		Kind:            RunnerRefChatRun,
		Ref:             runID,
		Metadata:        json.RawMessage(`{}`),
		CreatedAt:       request.NodeExecution.StartedAt,
		UpdatedAt:       request.NodeExecution.StartedAt,
	}
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
		details, ok := item.DynamicToolCallDetails()
		if item.Type != chat.RunItemTypeDynamicToolCall ||
			item.Status != chat.RunItemStatusCompleted ||
			!ok ||
			details.Namespace != chat.SettaAgentToolNamespace ||
			details.ToolName != chat.SettaWorkflowResultAgentToolName {
			continue
		}
		payload, err := chat.DecodeSettaWorkflowResultPayload(details.Arguments)
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

func runnerEventsFromChatApprovalRequest(owner workflowRunOwner, run chat.Run, pending *WorkflowPendingApproval) ([]RunnerEvent, error) {
	if pending == nil {
		return nil, errors.New("chat run has no pending approval")
	}
	sideEffectPolicy, err := nodeExecutionSideEffectPolicy(owner.nodeExecution)
	if err != nil {
		return nil, err
	}
	request, err := json.Marshal(pending.Approval)
	if err != nil {
		return nil, fmt.Errorf("encode approval request: %w", err)
	}
	approvalKind, err := runnerApprovalKindFromChat(pending.Approval.Kind)
	if err != nil {
		return nil, err
	}
	operation, err := approvalOperation(pending.Approval)
	if err != nil {
		return nil, err
	}
	payload, err := json.Marshal(RunnerApprovalRequestedPayload{
		ApprovalID:       pending.ApprovalID,
		ApprovalKind:     approvalKind,
		Title:            pending.Approval.Title,
		Request:          request,
		Operation:        operation,
		SideEffectPolicy: sideEffectPolicy,
	})
	if err != nil {
		return nil, fmt.Errorf("encode runner approval request: %w", err)
	}
	return []RunnerEvent{{
		WorkspaceID:     run.WorkspaceID,
		ExecutionID:     owner.execution.ID,
		NodeID:          owner.nodeExecution.NodeID,
		NodeExecutionID: owner.nodeExecution.ID,
		RunnerKind:      ActionKindAgentCodex,
		Type:            RunnerEventApprovalRequested,
		Payload:         payload,
	}}, nil
}

func runnerEventsFromTerminalChatRun(owner workflowRunOwner, result WorkflowActionResult) ([]RunnerEvent, error) {
	events := []RunnerEvent{}
	if result.Status == ActionCompletionCompleted && (len(result.Signals) > 0 || result.Output != nil || len(result.FilePaths) > 0 || result.ExitCode != nil) {
		payload, err := json.Marshal(RunnerStructuredOutputPayload{
			SchemaName:    "setta.workflow_result",
			SchemaVersion: 1,
			Output:        result.Output,
			Signals:       result.Signals,
			FilePaths:     result.FilePaths,
			ExitCode:      result.ExitCode,
		})
		if err != nil {
			return nil, fmt.Errorf("encode runner structured output: %w", err)
		}
		events = append(events, RunnerEvent{
			WorkspaceID:     owner.execution.WorkspaceID,
			ExecutionID:     owner.execution.ID,
			NodeID:          owner.nodeExecution.NodeID,
			NodeExecutionID: owner.nodeExecution.ID,
			RunnerKind:      ActionKindAgentCodex,
			Type:            RunnerEventStructuredOutputReceived,
			Payload:         payload,
		})
	}
	terminalEvent, err := terminalRunnerEventFromActionResult(owner, result)
	if err != nil {
		return nil, err
	}
	events = append(events, terminalEvent)
	return events, nil
}

func terminalRunnerEventFromActionResult(owner workflowRunOwner, result WorkflowActionResult) (RunnerEvent, error) {
	event := RunnerEvent{
		WorkspaceID:     owner.execution.WorkspaceID,
		ExecutionID:     owner.execution.ID,
		NodeID:          owner.nodeExecution.NodeID,
		NodeExecutionID: owner.nodeExecution.ID,
		RunnerKind:      ActionKindAgentCodex,
	}
	var payload []byte
	var err error
	switch result.Status {
	case ActionCompletionCompleted:
		event.Type = RunnerEventAttemptCompleted
		payload, err = json.Marshal(RunnerAttemptCompletedPayload{
			Status:    result.Status,
			Output:    result.Output,
			Signals:   result.Signals,
			FilePaths: result.FilePaths,
			ExitCode:  result.ExitCode,
			Metrics:   json.RawMessage(`{}`),
		})
	case ActionCompletionFailed:
		event.Type = RunnerEventAttemptFailed
		payload, err = json.Marshal(RunnerAttemptFailedPayload{
			ErrorCode: "chat_run_failed",
			Message:   result.Error,
			Retryable: false,
			Metrics:   json.RawMessage(`{}`),
		})
	case ActionCompletionCancelled:
		event.Type = RunnerEventAttemptCancelled
		payload, err = json.Marshal(RunnerAttemptCancelledPayload{
			Reason:  "chat_run_cancelled",
			Message: result.Error,
			Metrics: json.RawMessage(`{}`),
		})
	default:
		return RunnerEvent{}, fmt.Errorf("unsupported terminal action status %q", result.Status)
	}
	if err != nil {
		return RunnerEvent{}, fmt.Errorf("encode runner terminal event: %w", err)
	}
	event.Payload = payload
	return event, nil
}

func runnerEventFromApprovalResolution(target workflowApprovalTarget, approvalID string, approved bool, response string, answers []chat.ApprovalAnswer, cancelled bool, resolvedAt string) (RunnerEvent, error) {
	if target.nodeExecution.Result == nil || target.nodeExecution.Result.PendingApproval == nil {
		return RunnerEvent{}, fmt.Errorf("node execution %s has no pending approval result", target.nodeExecution.ID)
	}
	status, err := resolvedApprovalStatus(target.nodeExecution.Result.PendingApproval.Approval.Kind, approved, cancelled)
	if err != nil {
		return RunnerEvent{}, err
	}
	payload, err := json.Marshal(RunnerApprovalResolvedPayload{
		ApprovalID: approvalID,
		Status:     string(status),
		Approved:   approved,
		Response:   response,
		Answers:    answers,
		ResolvedAt: resolvedAt,
	})
	if err != nil {
		return RunnerEvent{}, fmt.Errorf("encode runner approval resolution: %w", err)
	}
	return RunnerEvent{
		WorkspaceID:     target.execution.WorkspaceID,
		ExecutionID:     target.execution.ID,
		NodeID:          target.nodeExecution.NodeID,
		NodeExecutionID: target.nodeExecution.ID,
		RunnerKind:      ActionKindAgentCodex,
		Type:            RunnerEventApprovalResolved,
		Payload:         payload,
	}, nil
}

func resolvedApprovalStatus(kind chat.ApprovalKind, approved bool, cancelled bool) (chat.ApprovalStatus, error) {
	switch {
	case cancelled:
		return chat.ApprovalStatusCancelled, nil
	case kind == chat.ApprovalKindUserInput:
		return chat.ApprovalStatusAnswered, nil
	case approved:
		return chat.ApprovalStatusApproved, nil
	case kind == chat.ApprovalKindCommand || kind == chat.ApprovalKindFileChange || kind == chat.ApprovalKindPermission || kind == chat.ApprovalKindStructured:
		return chat.ApprovalStatusDenied, nil
	default:
		return "", fmt.Errorf("unsupported chat approval kind %q", kind)
	}
}

func nodeExecutionSideEffectPolicy(nodeExecution WorkflowNodeExecution) (SideEffectPolicy, error) {
	if nodeExecution.SideEffectPolicy == nil {
		return SideEffectPolicy{}, fmt.Errorf("node execution %s has no side effect policy", nodeExecution.ID)
	}
	return *nodeExecution.SideEffectPolicy, nil
}

func runnerApprovalKindFromChat(kind chat.ApprovalKind) (RunnerApprovalKind, error) {
	switch kind {
	case chat.ApprovalKindCommand:
		return RunnerApprovalKindCommand, nil
	case chat.ApprovalKindFileChange:
		return RunnerApprovalKindFileChange, nil
	case chat.ApprovalKindPermission:
		return RunnerApprovalKindPermission, nil
	case chat.ApprovalKindStructured:
		return RunnerApprovalKindStructuredInput, nil
	case chat.ApprovalKindUserInput:
		return RunnerApprovalKindUserInput, nil
	default:
		return "", fmt.Errorf("unsupported chat approval kind %q", kind)
	}
}

func approvalOperation(approval chat.ApprovalRequest) (string, error) {
	switch approval.Kind {
	case chat.ApprovalKindCommand:
		return approval.Command, nil
	case chat.ApprovalKindFileChange:
		return approval.FilePath, nil
	case chat.ApprovalKindPermission:
		return approval.Permission, nil
	case chat.ApprovalKindStructured:
		if approval.StructuredInput != nil {
			return approval.StructuredInput.ServerName, nil
		}
		return "", fmt.Errorf("structured approval %s has no structured input", approval.ID)
	case chat.ApprovalKindUserInput:
		return approval.Question, nil
	default:
		return "", fmt.Errorf("unsupported chat approval kind %q", approval.Kind)
	}
}

func runnerRefValue(refs []WorkflowActionRunnerRef, kind string) string {
	for _, ref := range refs {
		if ref.Kind == kind {
			return ref.ID
		}
	}
	return ""
}
