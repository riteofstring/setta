package chat

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
)

type ScriptedWorkflowHarness struct {
	mu        sync.Mutex
	approvals map[string]chan ApprovalResponse
	commands  []HarnessCommandRequest
	goal      *ChatGoalState
	model     string
	steers    map[string]chan SteerRequest
}

type scriptedWorkflowRunner func(*ScriptedWorkflowHarness, context.Context, TurnRequest, TurnSink) (TurnCompletion, error)

type scriptedWorkflowFixture struct {
	Prompt string
	Run    scriptedWorkflowRunner
}

var scriptedWorkflowFixtures = []scriptedWorkflowFixture{
	{Prompt: "workflow hold for queue and steering", Run: (*ScriptedWorkflowHarness).workflowTurn},
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
	{Prompt: "permission approval workflow", Run: scriptedPermissionApprovalTurn},
	{Prompt: "user input approval workflow", Run: (*ScriptedWorkflowHarness).userInputApprovalTurn},
	{Prompt: "model setting workflow", Run: (*ScriptedWorkflowHarness).modelSettingTurn},
}

func NewScriptedWorkflowHarness() *ScriptedWorkflowHarness {
	return &ScriptedWorkflowHarness{
		approvals: map[string]chan ApprovalResponse{},
		steers:    map[string]chan SteerRequest{},
	}
}

func (harness *ScriptedWorkflowHarness) StartTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	harness.registerRun(request.Run.ID)
	defer harness.unregisterRun(request.Run.ID)

	if err := sink.ThreadLinked("scripted-thread-"+request.Conversation.ID, "scripted-session", "scripted-turn-"+request.Run.ID); err != nil {
		return TurnCompletion{}, err
	}

	for _, fixture := range scriptedWorkflowFixtures {
		if strings.EqualFold(strings.TrimSpace(request.Prompt), fixture.Prompt) {
			return fixture.Run(harness, ctx, request, sink)
		}
	}
	return scriptedReply(sink, request.Run.ID, "Scripted response: "+request.Prompt)
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
	return HarnessCommandListResult{Commands: defaultCommandCapabilities(request.ActiveRun)}, nil
}

func (harness *ScriptedWorkflowHarness) ExecuteCommand(_ context.Context, request HarnessCommandRequest) (HarnessCommandResult, error) {
	if err := ensureCommandAvailable(request.Command, request.ActiveRun); err != nil {
		return HarnessCommandResult{}, err
	}
	harness.mu.Lock()
	defer harness.mu.Unlock()

	harness.commands = append(harness.commands, request)
	result := HarnessCommandResult{Action: ChatCommandResultDisplay}
	if request.ActiveRun == nil && commandNeedsThread(request.Command) {
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

func (harness *ScriptedWorkflowHarness) executeGoalCommandLocked(command ChatCommand, result HarnessCommandResult) (HarnessCommandResult, error) {
	if command.Goal == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "goal command payload is required", nil)
	}
	switch command.Goal.Action {
	case GoalCommandShow:
	case GoalCommandSet:
		harness.goal = &ChatGoalState{Objective: command.Goal.Objective, Status: "active", ThreadID: result.ThreadRef.ThreadID}
	case GoalCommandClear:
		harness.goal = nil
	case GoalCommandPause:
		harness.setGoalStatusLocked("paused", result.ThreadRef.ThreadID)
	case GoalCommandResume:
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

func (harness *ScriptedWorkflowHarness) executeModelCommandLocked(command ChatCommand, result HarnessCommandResult) (HarnessCommandResult, error) {
	if command.Model == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "model command payload is required", nil)
	}
	switch command.Model.Action {
	case ModelCommandShowPicker:
		result.Action = ChatCommandResultModelPicker
		result.Models = fakeModelOptions()
	case ModelCommandSet:
		harness.model = command.Model.ModelID
		result.SelectedModel = command.Model.ModelID
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported model command action: %s", command.Model.Action), nil)
	}
	return result, nil
}

func scriptedQueuedReply(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	return scriptedReply(sink, request.Run.ID, "Queued response for "+request.Prompt+".")
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
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Steered with "+steer.Text+". "); err != nil {
		return TurnCompletion{}, err
	}
	return scriptedReply(sink, request.Run.ID, "Active workflow complete.")
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

func (harness *ScriptedWorkflowHarness) modelSettingTurn(_ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	harness.mu.Lock()
	model := harness.model
	harness.mu.Unlock()
	if model == "" {
		model = "unset"
	}
	return scriptedReply(sink, request.Run.ID, "Model for next turn: "+model+".")
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
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		Title:          approval.Title,
		Command:        approval.Command,
		FilePaths:      approvalFilePaths(approval),
		Summary:        approval.Body,
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return err
	}
	return sink.RunItemOutputDelta(approval.ProviderItemID, "stdout", "scripted approval output for "+runID+"\n")
}

func approvalFilePaths(approval ApprovalRequest) []string {
	if approval.FilePath == "" {
		return nil
	}
	return []string{approval.FilePath}
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
