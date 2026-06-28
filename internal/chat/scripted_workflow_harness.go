package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type ScriptedWorkflowHarness struct {
	mu                       sync.Mutex
	approvals                map[string]chan ApprovalResponse
	commands                 []HarnessCommandRequest
	goal                     *ChatGoalState
	model                    string
	phase4ConsolidatorCounts map[string]int
	phase4ReviewerBarriers   map[string]map[string]chan struct{}
	reasoning                ReasoningEffort
	steers                   map[string]chan SteerRequest
}

type scriptedWorkflowRunner func(*ScriptedWorkflowHarness, context.Context, TurnRequest, TurnSink) (TurnCompletion, error)

type scriptedWorkflowFixture struct {
	Prompt string
	Run    scriptedWorkflowRunner
}

var scriptedWorkflowFixtures = []scriptedWorkflowFixture{
	{Prompt: "workflow hold for queue and steering", Run: (*ScriptedWorkflowHarness).workflowTurn},
	{Prompt: "workflow hold for draft event", Run: (*ScriptedWorkflowHarness).workflowDraftEventTurn},
	{Prompt: "immediate replay workflow", Run: (*ScriptedWorkflowHarness).workflowTurn},
	{Prompt: "queued follow-up from active run", Run: scriptedQueuedReply},
	{Prompt: "queued follow-up one from active run", Run: scriptedQueuedReply},
	{Prompt: "queued follow-up two from active run", Run: scriptedQueuedReply},
	{Prompt: "queued follow-up three from active run", Run: scriptedQueuedReply},
	{Prompt: "queued follow-up after cancel", Run: scriptedQueuedReply},
	{Prompt: "queued follow-up after failure", Run: scriptedQueuedReply},
	{Prompt: "cancel active workflow", Run: (*ScriptedWorkflowHarness).cancelTurn},
	{Prompt: "fail active workflow", Run: (*ScriptedWorkflowHarness).failTurn},
	{Prompt: "command approval workflow", Run: scriptedCommandApprovalTurn},
	{Prompt: "file approval workflow", Run: scriptedFileApprovalTurn},
	{Prompt: "activity feed workflow", Run: (*ScriptedWorkflowHarness).activityFeedTurn},
	{Prompt: "chat activity projection workflow", Run: (*ScriptedWorkflowHarness).activityProjectionTurn},
	{Prompt: "chat activity projection reload workflow", Run: scriptedActivityProjectionReloadTurn},
	{Prompt: "chronological transcript workflow", Run: scriptedChronologicalTranscriptTurn},
	{Prompt: "background terminal workflow", Run: scriptedBackgroundTerminalTurn},
	{Prompt: "permission approval workflow", Run: scriptedPermissionApprovalTurn},
	{Prompt: "user input approval workflow", Run: (*ScriptedWorkflowHarness).userInputApprovalTurn},
	{Prompt: "mcp elicitation form accept workflow", Run: (*ScriptedWorkflowHarness).mcpElicitationFormAcceptTurn},
	{Prompt: "mcp elicitation form cancel workflow", Run: (*ScriptedWorkflowHarness).mcpElicitationFormCancelTurn},
	{Prompt: "mcp elicitation url decline workflow", Run: (*ScriptedWorkflowHarness).mcpElicitationURLDeclineTurn},
	{Prompt: "dynamic tool workflow", Run: scriptedDynamicToolTurn},
	{Prompt: "chat performance stream", Run: scriptedPerformanceStreamTurn},
	{Prompt: "workflow result action", Run: scriptedWorkflowResultTurn},
	{Prompt: "phase4 reviewer a workflow", Run: (*ScriptedWorkflowHarness).phase4ReviewerTurn},
	{Prompt: "phase4 reviewer b workflow", Run: (*ScriptedWorkflowHarness).phase4ReviewerTurn},
	{Prompt: "phase4 reviewer c workflow", Run: (*ScriptedWorkflowHarness).phase4ReviewerTurn},
	{Prompt: "phase4 consolidator workflow", Run: (*ScriptedWorkflowHarness).phase4ConsolidatorTurn},
	{Prompt: "phase4 fix workflow", Run: scriptedPhase4FixTurn},
	{Prompt: "pre-turn model setting workflow", Run: (*ScriptedWorkflowHarness).modelSettingTurn},
	{Prompt: "model setting workflow", Run: (*ScriptedWorkflowHarness).modelSettingTurn},
}

func NewScriptedWorkflowHarness() *ScriptedWorkflowHarness {
	defaultModel := fakeModelOptions()[0]
	return &ScriptedWorkflowHarness{
		approvals:                map[string]chan ApprovalResponse{},
		model:                    defaultModel.Model,
		phase4ConsolidatorCounts: map[string]int{},
		phase4ReviewerBarriers:   map[string]map[string]chan struct{}{},
		reasoning:                defaultModel.DefaultReasoningEffort,
		steers:                   map[string]chan SteerRequest{},
	}
}

func (harness *ScriptedWorkflowHarness) ActiveRunCount() int {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	return len(harness.steers)
}

func (harness *ScriptedWorkflowHarness) StartTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	harness.registerRun(request.Run.ID)
	defer harness.unregisterRun(request.Run.ID)
	return harness.runScriptedTurn(ctx, request, sink)
}

func (harness *ScriptedWorkflowHarness) runScriptedTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	harness.applyInitialCodexSettings(request)

	settings, err := scriptedCodexEffectiveSettings(harness.model, harness.reasoning)
	if err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.ThreadLinked("scripted-thread-"+request.Conversation.ID, "scripted-session", "scripted-turn-"+request.Run.ID, settings); err != nil {
		return TurnCompletion{}, err
	}

	prompt := strings.TrimSpace(chatInputText(request.Input))
	for _, fixture := range scriptedWorkflowFixtures {
		if strings.EqualFold(prompt, fixture.Prompt) {
			return fixture.Run(harness, ctx, request, sink)
		}
	}
	return scriptedReply(sink, request.Run.ID, "Scripted response: "+prompt)
}

func (harness *ScriptedWorkflowHarness) RunTask(ctx context.Context, request HarnessTaskRequest) (HarnessTaskResult, error) {
	if request.TurnMode == HarnessTurnStructuredTask {
		return runScriptedStructuredHarnessTask(ctx, request)
	}
	return runConversationHarnessTask(ctx, request, harness.StartTurn)
}

func (harness *ScriptedWorkflowHarness) applyInitialCodexSettings(request TurnRequest) {
	if request.ThreadRef.ThreadID != "" && request.ThreadRef.Status == HarnessRefLinked {
		return
	}
	if request.Conversation.CodexSettings == nil {
		return
	}
	harness.mu.Lock()
	defer harness.mu.Unlock()
	if request.Conversation.CodexSettings.Model != "" {
		harness.model = request.Conversation.CodexSettings.Model
	}
	if request.Conversation.CodexSettings.ReasoningEffort != nil {
		harness.reasoning = *request.Conversation.CodexSettings.ReasoningEffort
	}
}

func scriptedCodexEffectiveSettings(model string, reasoning ReasoningEffort) (*ChatCodexEffectiveSettings, error) {
	return fakeCodexEffectiveSettings(model, reasoning)
}

func (harness *ScriptedWorkflowHarness) CancelTurn(_ context.Context, request CancelRequest) error {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	if _, ok := harness.steers[request.RunID]; !ok {
		return ErrTurnNotStarted
	}
	return nil
}

func (harness *ScriptedWorkflowHarness) SteerTurn(_ context.Context, request SteerRequest) error {
	harness.mu.Lock()
	channel := harness.steers[request.RunID]
	harness.mu.Unlock()

	if channel == nil {
		return ErrTurnNotStarted
	}
	channel <- request
	return nil
}

func (harness *ScriptedWorkflowHarness) SubmitApproval(_ context.Context, response ApprovalResponse) error {
	harness.mu.Lock()
	channel := harness.approvals[response.RunID]
	harness.mu.Unlock()

	if channel == nil {
		return fmt.Errorf("scripted approval run is not active: %s", response.RunID)
	}
	channel <- response
	return nil
}

func (harness *ScriptedWorkflowHarness) ListCommandCapabilities(_ context.Context, request HarnessCommandListRequest) (HarnessCommandListResult, error) {
	return HarnessCommandListResult{Commands: defaultCommandDescriptors(request.ActiveRun)}, nil
}

func (harness *ScriptedWorkflowHarness) ExecuteCommand(_ context.Context, request HarnessCommandRequest) (HarnessCommandResult, error) {
	if err := ensureCommandAvailable(request.Command, request.ActiveRun); err != nil {
		return HarnessCommandResult{}, err
	}
	harness.mu.Lock()
	defer harness.mu.Unlock()

	harness.commands = append(harness.commands, request)
	result := HarnessCommandResult{Action: ChatCommandResultDisplay}
	if request.ThreadRef.ThreadID != "" && request.ThreadRef.Status == HarnessRefLinked {
		result.ThreadRef = request.ThreadRef
		result.HasThreadRef = true
	}
	if request.ActiveRun == nil && commandNeedsThread(request.Command) && !commandUsesLocalCodexSettings(request.Command, request.ThreadRef) {
		ref := request.ThreadRef
		if ref.ThreadID == "" {
			ref = HarnessThreadRef{
				Harness:   HarnessCodex,
				SessionID: "scripted-session",
				Status:    HarnessRefLinked,
				ThreadID:  "scripted-thread-" + request.Conversation.ID,
			}
		}
		result.ThreadRef = ref
		result.HasThreadRef = true
	}
	switch request.Command.Kind {
	case ChatCommandGoal:
		return harness.executeGoalCommandLocked(request.Command, result)
	case ChatCommandModel:
		return harness.executeModelCommandLocked(request.Command, result)
	default:
		return HarnessCommandResult{}, fmt.Errorf("unsupported scripted command kind: %s", request.Command.Kind)
	}
}

type scriptedGoalOperation struct {
	harness *ScriptedWorkflowHarness
}

func (harness *ScriptedWorkflowHarness) BeginGoalOperation(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, HarnessGoalOperation, error) {
	result, err := harness.ExecuteCommand(ctx, request)
	if err != nil {
		return HarnessCommandResult{}, nil, err
	}
	return result, &scriptedGoalOperation{harness: harness}, nil
}

func (operation *scriptedGoalOperation) Wait(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	operation.harness.registerRun(request.Run.ID)
	defer operation.harness.unregisterRun(request.Run.ID)

	completion, err := operation.harness.runScriptedTurn(ctx, request, sink)
	if err != nil || completion.Outcome != TurnOutcomeCompleted {
		return completion, err
	}
	goal := operation.harness.completeGoal(request.ThreadRef.ThreadID)
	if goal != nil {
		if err := sink.GoalUpdated(goal); err != nil {
			return TurnCompletion{}, err
		}
	}
	return completion, nil
}

func (operation *scriptedGoalOperation) Cancel(context.Context) error { return nil }

func (operation *scriptedGoalOperation) Close() {}

func (harness *ScriptedWorkflowHarness) completeGoal(threadID string) *ChatGoalState {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	if harness.goal == nil || harness.goal.Status != "active" {
		return nil
	}
	goal := *harness.goal
	goal.Status = "complete"
	if goal.ThreadID == "" {
		goal.ThreadID = threadID
	}
	harness.goal = &goal
	return &goal
}

func (harness *ScriptedWorkflowHarness) executeGoalCommandLocked(command ChatCommand, result HarnessCommandResult) (HarnessCommandResult, error) {
	if command.Goal == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "goal command payload is required", nil)
	}
	switch command.Goal.Action {
	case GoalCommandShow:
	case GoalCommandEdit:
		result.Action = ChatCommandResultGoalEditor
	case GoalCommandSet:
		harness.goal = &ChatGoalState{Objective: command.Goal.Objective, Status: "active", ThreadID: result.ThreadRef.ThreadID}
	case GoalCommandClear:
		if harness.goal == nil {
			return HarnessCommandResult{}, noGoalCommandError(command.Goal.Action)
		}
		harness.goal = nil
	case GoalCommandPause:
		if harness.goal == nil {
			return HarnessCommandResult{}, noGoalCommandError(command.Goal.Action)
		}
		harness.setGoalStatusLocked("paused", result.ThreadRef.ThreadID)
	case GoalCommandResume:
		if harness.goal == nil {
			return HarnessCommandResult{}, noGoalCommandError(command.Goal.Action)
		}
		harness.setGoalStatusLocked("active", result.ThreadRef.ThreadID)
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported goal command action: %s", command.Goal.Action), nil)
	}
	result.Goal = harness.goal
	return result, nil
}

func (harness *ScriptedWorkflowHarness) setGoalStatusLocked(status string, threadID string) {
	if harness.goal == nil {
		harness.goal = &ChatGoalState{ThreadID: threadID}
	}
	harness.goal.Status = status
	if harness.goal.ThreadID == "" {
		harness.goal.ThreadID = threadID
	}
}

func scriptedQueuedReply(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	return scriptedReply(sink, request.Run.ID, "Queued response for "+chatInputText(request.Input)+".")
}

func scriptedCommandApprovalTurn(harness *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	return harness.decisionApprovalTurn(ctx, request, sink, scriptedCommandApproval(request.Run.ID))
}

func scriptedFileApprovalTurn(harness *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	return harness.decisionApprovalTurn(ctx, request, sink, scriptedFileApproval(request.Run.ID, request.Workspace.RootPath))
}

func scriptedPermissionApprovalTurn(harness *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	return harness.decisionApprovalTurn(ctx, request, sink, scriptedPermissionApproval(request.Run.ID))
}

func (harness *ScriptedWorkflowHarness) workflowTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Workflow stream started. "); err != nil {
		return TurnCompletion{}, err
	}
	steer, err := harness.waitForSteer(ctx, request.Run.ID)
	if err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Steered with "+chatInputText(steer.Input)+". "); err != nil {
		return TurnCompletion{}, err
	}
	return scriptedReply(sink, request.Run.ID, "Active workflow complete.")
}

func (harness *ScriptedWorkflowHarness) workflowDraftEventTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if _, err := harness.waitForSteer(ctx, request.Run.ID); err != nil {
		return TurnCompletion{}, err
	}
	approval := scriptedCommandApproval(request.Run.ID)
	if err := scriptedApprovalActivity(sink, request.Run.ID, approval); err != nil {
		return TurnCompletion{}, err
	}
	response, err := harness.requestAndWaitForApproval(ctx, request.Run.ID, sink, approval)
	if err != nil {
		return TurnCompletion{}, err
	}
	if !response.Approved || response.Cancelled {
		return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: "scripted approval was not approved"}, nil
	}
	return scriptedReply(sink, request.Run.ID, approval.Title+" resolved.")
}

func (harness *ScriptedWorkflowHarness) cancelTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Cancel workflow waiting. "); err != nil {
		return TurnCompletion{}, err
	}
	<-ctx.Done()
	return TurnCompletion{}, ctx.Err()
}

func (harness *ScriptedWorkflowHarness) failTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Failure workflow waiting. "); err != nil {
		return TurnCompletion{}, err
	}
	if _, err := harness.waitForSteer(ctx, request.Run.ID); err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Scripted failure surfaced. "); err != nil {
		return TurnCompletion{}, err
	}
	return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: "scripted provider failure"}, nil
}

func (harness *ScriptedWorkflowHarness) decisionApprovalTurn(ctx context.Context, request TurnRequest, sink TurnSink, approval ApprovalRequest) (TurnCompletion, error) {
	if err := scriptedApprovalActivity(sink, request.Run.ID, approval); err != nil {
		return TurnCompletion{}, err
	}
	response, err := harness.requestAndWaitForApproval(ctx, request.Run.ID, sink, approval)
	if err != nil {
		return TurnCompletion{}, err
	}
	if !response.Approved || response.Cancelled {
		return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: "scripted approval was not approved"}, nil
	}
	return scriptedReply(sink, request.Run.ID, approval.Title+" resolved.")
}

func (harness *ScriptedWorkflowHarness) activityFeedTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := scriptedActivityFeedCommand(sink, request.Run.ID, request.Workspace.RootPath); err != nil {
		return TurnCompletion{}, err
	}
	if err := scriptedActivityFeedFileChange(sink, request.Run.ID, request.Workspace.RootPath); err != nil {
		return TurnCompletion{}, err
	}
	approval := scriptedCommandApproval(request.Run.ID)
	if err := scriptedApprovalActivity(sink, request.Run.ID, approval); err != nil {
		return TurnCompletion{}, err
	}
	response, err := harness.requestAndWaitForApproval(ctx, request.Run.ID, sink, approval)
	if err != nil {
		return TurnCompletion{}, err
	}
	if !response.Approved || response.Cancelled {
		return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: "scripted activity approval was not approved"}, nil
	}
	return scriptedReply(sink, request.Run.ID, "Activity feed workflow complete.")
}

func (harness *ScriptedWorkflowHarness) userInputApprovalTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	approval := scriptedUserInputApproval(request.Run.ID)
	response, err := harness.requestAndWaitForApproval(ctx, request.Run.ID, sink, approval)
	if err != nil {
		return TurnCompletion{}, err
	}
	if response.Cancelled || len(response.Answers) == 0 {
		return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: "scripted user input was cancelled"}, nil
	}
	return scriptedReply(sink, request.Run.ID, "User input approval resolved.")
}

func (harness *ScriptedWorkflowHarness) mcpElicitationFormAcceptTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	approval := scriptedMCPFormApproval(request.Run.ID)
	if err := scriptedStructuredApprovalActivity(sink, approval); err != nil {
		return TurnCompletion{}, err
	}
	response, err := harness.requestAndWaitForApproval(ctx, request.Run.ID, sink, approval)
	if err != nil {
		return TurnCompletion{}, err
	}
	if !response.Approved || response.Cancelled {
		return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: "scripted mcp form was not accepted"}, nil
	}
	values := approvalValuesByQuestionID(response.Answers)
	if string(values["target"]) != `"staging"` || string(values["confirm"]) != `true` {
		return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: "scripted mcp form returned unexpected values"}, nil
	}
	return scriptedReply(sink, request.Run.ID, "MCP form accepted.")
}

func (harness *ScriptedWorkflowHarness) mcpElicitationFormCancelTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	approval := scriptedMCPFormApproval(request.Run.ID)
	if err := scriptedStructuredApprovalActivity(sink, approval); err != nil {
		return TurnCompletion{}, err
	}
	response, err := harness.requestAndWaitForApproval(ctx, request.Run.ID, sink, approval)
	if err != nil {
		return TurnCompletion{}, err
	}
	if !response.Cancelled {
		return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: "scripted mcp form was not cancelled"}, nil
	}
	return scriptedReply(sink, request.Run.ID, "MCP form cancelled.")
}

func (harness *ScriptedWorkflowHarness) mcpElicitationURLDeclineTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	approval := scriptedMCPURLApproval(request.Run.ID)
	if err := scriptedStructuredApprovalActivity(sink, approval); err != nil {
		return TurnCompletion{}, err
	}
	response, err := harness.requestAndWaitForApproval(ctx, request.Run.ID, sink, approval)
	if err != nil {
		return TurnCompletion{}, err
	}
	if response.Approved || response.Cancelled {
		return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: "scripted mcp url was not declined"}, nil
	}
	return scriptedReply(sink, request.Run.ID, "MCP url declined.")
}

func scriptedDynamicToolTurn(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	item := RunItem{
		ProviderItemID: "provider_dynamic_tool_" + request.Run.ID,
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusRunning,
		Title:          "Dynamic tool call",
		Namespace:      "setta",
		ToolName:       "fakeTool",
		Details:        json.RawMessage(`{"value":"from scripted workflow"}`),
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.RunItemOutputDelta(item.ProviderItemID, "stdout", "tool ok\n"); err != nil {
		return TurnCompletion{}, err
	}
	item.Status = RunItemStatusCompleted
	item.Result = "tool ok"
	if err := sink.RunItemUpsert(item); err != nil {
		return TurnCompletion{}, err
	}
	return scriptedReply(sink, request.Run.ID, "Dynamic tool workflow complete.")
}

func scriptedPerformanceStreamTurn(_ *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	const chunkCount = 240
	const chunkInterval = 8 * time.Millisecond
	item := RunItem{
		ProviderItemID: "provider_performance_stream_" + request.Run.ID,
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		Title:          "Performance stream",
		Command:        "scripted chat performance stream",
		Summary:        "Streaming assistant text and command output for renderer frame timing.",
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return TurnCompletion{}, err
	}
	ticker := time.NewTicker(chunkInterval)
	defer ticker.Stop()
	for index := 0; index < chunkCount; index++ {
		if index > 0 {
			select {
			case <-ctx.Done():
				return TurnCompletion{}, ctx.Err()
			case <-ticker.C:
			}
		}
		if err := sink.AssistantTextDelta(
			"scripted-assistant-"+request.Run.ID,
			fmt.Sprintf("stream chunk %03d adds repeatable transcript render pressure. ", index),
		); err != nil {
			return TurnCompletion{}, err
		}
		if index%3 == 0 {
			output := fmt.Sprintf("stdout perf line %03d: renderer output delta pressure\n", index)
			if err := sink.RunItemOutputDelta(item.ProviderItemID, "stdout", output); err != nil {
				return TurnCompletion{}, err
			}
		}
	}
	item.Status = RunItemStatusCompleted
	item.Result = fmt.Sprintf("streamed %d assistant chunks", chunkCount)
	if err := sink.RunItemUpsert(item); err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Performance stream complete."); err != nil {
		return TurnCompletion{}, err
	}
	return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
}

func scriptedWorkflowResultTurn(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	item := RunItem{
		ProviderItemID: "provider_workflow_result_" + request.Run.ID,
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusCompleted,
		Title:          "Workflow result",
		Namespace:      SettaAgentToolNamespace,
		ToolName:       SettaWorkflowResultAgentToolName,
		Details: json.RawMessage(`{
			"signals": [
				{"name": "route", "value": "yes"},
				{"name": "decision", "value": "exit"}
			],
			"output": {"summary": "scripted workflow result"},
			"filePaths": ["reports/workflow-result.md"]
		}`),
		Result: "workflow result recorded",
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return TurnCompletion{}, err
	}
	return scriptedReply(sink, request.Run.ID, "Workflow result action complete.")
}

func (harness *ScriptedWorkflowHarness) phase4ReviewerTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Phase 4 reviewer active. "); err != nil {
		return TurnCompletion{}, err
	}
	key := phase4WorkflowExecutionKey(request)
	released := harness.joinPhase4ReviewerBarrier(key, request.Run.ID)
	defer harness.leavePhase4ReviewerBarrier(key, request.Run.ID)

	select {
	case <-released:
		return scriptedReply(sink, request.Run.ID, "Phase 4 reviewer complete.")
	case <-ctx.Done():
		return TurnCompletion{}, ctx.Err()
	}
}

func (harness *ScriptedWorkflowHarness) phase4ConsolidatorTurn(_ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	decision, attempt := harness.nextPhase4ConsolidatorDecision(request)
	output, err := json.Marshal(struct {
		Attempt  int    `json:"attempt"`
		Decision string `json:"decision"`
		Summary  string `json:"summary"`
	}{
		Attempt:  attempt,
		Decision: decision,
		Summary:  "phase 4 consolidator " + decision,
	})
	if err != nil {
		return TurnCompletion{}, err
	}
	actionable := "no"
	if decision == "continue" {
		actionable = "yes"
	}
	details, err := json.Marshal(SettaWorkflowResultPayload{
		Signals: []SettaWorkflowResultSignal{
			{Name: "decision", Value: decision},
			{Name: "actionable", Value: actionable},
		},
		Output:    output,
		FilePaths: []string{"reports/phase4-consolidator.md"},
	})
	if err != nil {
		return TurnCompletion{}, err
	}
	item := RunItem{
		ProviderItemID: "provider_phase4_workflow_result_" + request.Run.ID,
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusCompleted,
		Title:          "Phase 4 workflow result",
		Namespace:      SettaAgentToolNamespace,
		ToolName:       SettaWorkflowResultAgentToolName,
		Details:        details,
		Result:         "phase 4 workflow result recorded",
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return TurnCompletion{}, err
	}
	return scriptedReply(sink, request.Run.ID, "Phase 4 consolidator "+decision+".")
}

func scriptedPhase4FixTurn(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	return scriptedReply(sink, request.Run.ID, "Phase 4 fix complete.")
}

func (harness *ScriptedWorkflowHarness) joinPhase4ReviewerBarrier(key string, runID string) <-chan struct{} {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	group := harness.phase4ReviewerBarriers[key]
	if group == nil {
		group = map[string]chan struct{}{}
		harness.phase4ReviewerBarriers[key] = group
	}
	released := make(chan struct{})
	group[runID] = released
	if len(group) >= 3 {
		for _, channel := range group {
			close(channel)
		}
		delete(harness.phase4ReviewerBarriers, key)
	}
	return released
}

func (harness *ScriptedWorkflowHarness) leavePhase4ReviewerBarrier(key string, runID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	group := harness.phase4ReviewerBarriers[key]
	if group == nil {
		return
	}
	delete(group, runID)
	if len(group) == 0 {
		delete(harness.phase4ReviewerBarriers, key)
	}
}

func (harness *ScriptedWorkflowHarness) nextPhase4ConsolidatorDecision(request TurnRequest) (string, int) {
	key := phase4WorkflowNodeKey(request)
	harness.mu.Lock()
	defer harness.mu.Unlock()

	harness.phase4ConsolidatorCounts[key]++
	attempt := harness.phase4ConsolidatorCounts[key]
	if attempt == 1 {
		return "continue", attempt
	}
	return "exit", attempt
}

func phase4WorkflowExecutionKey(request TurnRequest) string {
	if request.Conversation.Workflow == nil {
		return request.Run.ID
	}
	return request.Conversation.Workflow.ExecutionID
}

func phase4WorkflowNodeKey(request TurnRequest) string {
	if request.Conversation.Workflow == nil {
		return request.Run.ID
	}
	return request.Conversation.Workflow.ExecutionID + "/" + request.Conversation.Workflow.NodeID
}

func (harness *ScriptedWorkflowHarness) modelSettingTurn(_ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	harness.mu.Lock()
	model := harness.model
	reasoning := harness.reasoning
	harness.mu.Unlock()
	if model == "" {
		model = "unset"
	}
	reasoningText := "unset"
	if reasoning != "" {
		reasoningText = reasoningEffortDisplayName(reasoning)
	}
	return scriptedReply(sink, request.Run.ID, "Model for next turn: "+model+". Reasoning for next turn: "+reasoningText+".")
}

func (harness *ScriptedWorkflowHarness) requestAndWaitForApproval(ctx context.Context, runID string, sink TurnSink, approval ApprovalRequest) (ApprovalResponse, error) {
	if err := sink.ApprovalRequested(approval); err != nil {
		return ApprovalResponse{}, err
	}
	response, err := harness.waitForApproval(ctx, runID)
	if err != nil {
		return ApprovalResponse{}, err
	}
	if err := sink.ApprovalResolved(response.ApprovalID, response.Approved, response.Response); err != nil {
		return ApprovalResponse{}, err
	}
	return response, nil
}

func (harness *ScriptedWorkflowHarness) registerRun(runID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	harness.approvals[runID] = make(chan ApprovalResponse, 1)
	harness.steers[runID] = make(chan SteerRequest, 4)
}

func (harness *ScriptedWorkflowHarness) unregisterRun(runID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	delete(harness.approvals, runID)
	delete(harness.steers, runID)
}

func (harness *ScriptedWorkflowHarness) waitForApproval(ctx context.Context, runID string) (ApprovalResponse, error) {
	harness.mu.Lock()
	channel := harness.approvals[runID]
	harness.mu.Unlock()

	select {
	case response := <-channel:
		return response, nil
	case <-ctx.Done():
		return ApprovalResponse{}, ctx.Err()
	}
}

func (harness *ScriptedWorkflowHarness) waitForSteer(ctx context.Context, runID string) (SteerRequest, error) {
	harness.mu.Lock()
	channel := harness.steers[runID]
	harness.mu.Unlock()

	select {
	case request := <-channel:
		return request, nil
	case <-ctx.Done():
		return SteerRequest{}, ctx.Err()
	}
}

func scriptedReply(sink TurnSink, runID string, text string) (TurnCompletion, error) {
	if err := sink.AssistantTextDelta("scripted-assistant-"+runID, text); err != nil {
		return TurnCompletion{}, err
	}
	return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
}

func scriptedApprovalActivity(sink TurnSink, runID string, approval ApprovalRequest) error {
	item := RunItem{
		ProviderItemID: approval.ProviderItemID,
		Type:           approvalRunItemType(approval),
		Status:         RunItemStatusRunning,
		Title:          approval.Title,
		FilePaths:      approvalFilePaths(approval),
		Summary:        approval.Body,
	}
	if approval.Kind == ApprovalKindFileChange {
		item.PatchStatus = "approval_requested"
	} else {
		item.Command = approval.Command
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return err
	}
	return sink.RunItemOutputDelta(approval.ProviderItemID, "stdout", "scripted approval output for "+runID+"\n")
}

func scriptedActivityFeedCommand(sink TurnSink, runID string, rootPath string) error {
	item := RunItem{
		ProviderItemID: "provider_activity_command_" + runID,
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusCompleted,
		Title:          "Activity command",
		Command:        "printf scripted-activity",
		Cwd:            rootPath,
		ExitCode:       0,
		DurationMs:     42,
		Summary:        "Scripted typed command activity.",
	}
	return sink.RunItemUpsert(item)
}

func scriptedActivityFeedFileChange(sink TurnSink, runID string, rootPath string) error {
	item := RunItem{
		ProviderItemID: "provider_activity_file_" + runID,
		Type:           RunItemTypeFileChange,
		Status:         RunItemStatusCompleted,
		Title:          "Activity file change",
		FilePaths:      []string{filepath.Join(rootPath, "scripted-activity-file.txt")},
		PatchStatus:    "updated",
		Summary:        "Scripted typed file-change activity.",
	}
	return sink.RunItemUpsert(item)
}

func scriptedStructuredApprovalActivity(sink TurnSink, approval ApprovalRequest) error {
	item := RunItem{
		ProviderItemID: approval.ProviderItemID,
		Type:           RunItemTypeStructuredInput,
		Status:         RunItemStatusPending,
		Title:          approval.Title,
		Summary:        approval.Body,
	}
	if approval.StructuredInput != nil {
		item.ServerName = approval.StructuredInput.ServerName
		item.RequestID = approval.StructuredInput.ProviderRequestID
		item.Details = approval.StructuredInput.Schema
	}
	return sink.RunItemUpsert(item)
}

func approvalFilePaths(approval ApprovalRequest) []string {
	if approval.FilePath == "" {
		return nil
	}
	return []string{approval.FilePath}
}

func approvalRunItemType(approval ApprovalRequest) RunItemType {
	if approval.Kind == ApprovalKindFileChange {
		return RunItemTypeFileChange
	}
	return RunItemTypeCommandExecution
}

func scriptedCommandApproval(runID string) ApprovalRequest {
	return ApprovalRequest{
		ID:             "approval_command_" + runID,
		ProviderItemID: "provider_command_" + runID,
		Kind:           ApprovalKindCommand,
		Title:          "Command approval",
		Body:           "Approve the scripted command.",
		Command:        "printf scripted-command",
	}
}

func scriptedFileApproval(runID string, rootPath string) ApprovalRequest {
	return ApprovalRequest{
		ID:             "approval_file_" + runID,
		ProviderItemID: "provider_file_" + runID,
		Kind:           ApprovalKindFileChange,
		Title:          "File change approval",
		Body:           "Approve the scripted file change.",
		FilePath:       filepath.Join(rootPath, "scripted-file.txt"),
	}
}

func scriptedPermissionApproval(runID string) ApprovalRequest {
	return ApprovalRequest{
		ID:             "approval_permission_" + runID,
		ProviderItemID: "provider_permission_" + runID,
		Kind:           ApprovalKindPermission,
		Title:          "Permission approval",
		Body:           "Approve the scripted permission.",
		Permission:     "network access for deterministic workflow test",
	}
}

func scriptedUserInputApproval(runID string) ApprovalRequest {
	return ApprovalRequest{
		ID:    "approval_user_input_" + runID,
		Kind:  ApprovalKindUserInput,
		Title: "User input approval",
		Body:  "Answer the scripted question.",
		Questions: []ApprovalQuestion{{
			ID:       "scripted_answer",
			Header:   "Answer",
			Question: "What should the scripted workflow continue with?",
			Options:  []string{},
		}},
	}
}

func scriptedMCPFormApproval(runID string) ApprovalRequest {
	input := StructuredInputRequest{
		ProviderRequestID: "provider_mcp_form_" + runID,
		ThreadID:          "scripted-thread",
		TurnID:            "scripted-turn-" + runID,
		ServerName:        "deploy",
		Mode:              StructuredInputModeForm,
		Message:           "Provide deploy settings.",
		Schema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"target": {
					"type": "string",
					"title": "Target",
					"description": "Deployment target",
					"enum": ["staging", "production"]
				},
				"confirm": {
					"type": "boolean",
					"title": "Confirm",
					"description": "Confirm deployment",
					"default": false
				}
			},
			"required": ["target", "confirm"]
		}`),
		Meta: json.RawMessage(`{"source":"scripted-workflow"}`),
	}
	return ApprovalRequest{
		ID:              "approval_mcp_form_" + runID,
		ProviderItemID:  input.ProviderRequestID,
		Kind:            ApprovalKindStructured,
		Title:           "MCP input requested: deploy",
		Body:            input.Message,
		Question:        input.Message,
		Options:         []string{},
		Questions:       []ApprovalQuestion{},
		StructuredInput: &input,
	}
}

func scriptedMCPURLApproval(runID string) ApprovalRequest {
	input := StructuredInputRequest{
		ProviderRequestID: "provider_mcp_url_" + runID,
		ThreadID:          "scripted-thread",
		TurnID:            "scripted-turn-" + runID,
		ServerName:        "accounts",
		Mode:              StructuredInputModeURL,
		Message:           "Authorize the scripted account.",
		URL:               "https://example.test/login",
		ElicitationID:     "scripted-elicitation-" + runID,
		Meta:              json.RawMessage(`{"source":"scripted-workflow"}`),
	}
	return ApprovalRequest{
		ID:              "approval_mcp_url_" + runID,
		ProviderItemID:  input.ProviderRequestID,
		Kind:            ApprovalKindStructured,
		Title:           "MCP input requested: accounts",
		Body:            input.Message,
		Question:        input.Message,
		Options:         []string{},
		Questions:       []ApprovalQuestion{},
		StructuredInput: &input,
	}
}

func approvalValuesByQuestionID(answers []ApprovalAnswer) map[string]json.RawMessage {
	values := map[string]json.RawMessage{}
	for _, answer := range answers {
		if answer.QuestionID == "" || answer.Value == nil {
			continue
		}
		values[answer.QuestionID] = append(json.RawMessage{}, (*answer.Value)...)
	}
	return values
}
