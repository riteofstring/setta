package chat

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

const (
	FakeEventAssistantDelta = "assistant_delta"
	FakeEventApproval       = "approval"
	FakeEventCancelled      = "cancelled"
	FakeEventError          = "error"
	FakeEventFailed         = "failed"
	FakeEventGoalUpdated    = "goal_updated"
	FakeEventRunItem        = "run_item"
	FakeEventRunItemOutput  = "run_item_output"
	FakeEventThreadLinked   = "thread_linked"
	FakeEventTrace          = "trace"
	FakeEventWaitForCancel  = "wait_for_cancel"
	FakeEventWaitForSteer   = "wait_for_steer"
)

var errUnsupportedFakeHarnessEvent = errors.New("unsupported fake harness event")

type FakeHarnessEvent struct {
	Type            string
	Text            string
	Error           string
	ThreadID        string
	SessionID       string
	TurnID          string
	ProviderItemID  string
	Stream          string
	RunItem         RunItem
	Goal            *ChatGoalState
	Approval        ApprovalRequest
	WaitForApproval bool
}

type FakeHarness struct {
	events         []FakeHarnessEvent
	eventsByPrompt map[string][]FakeHarnessEvent

	mu          sync.Mutex
	cancelled   []CancelRequest
	commands    []HarnessCommandRequest
	approvals   []ApprovalResponse
	goal        *ChatGoalState
	model       string
	reasoning   ReasoningEffort
	steering    []SteerRequest
	approvalChs map[string]chan ApprovalResponse
	steerChs    map[string]chan SteerRequest
}

func NewFakeHarness(events []FakeHarnessEvent) *FakeHarness {
	return &FakeHarness{
		events:         append([]FakeHarnessEvent{}, events...),
		eventsByPrompt: map[string][]FakeHarnessEvent{},
		approvalChs:    map[string]chan ApprovalResponse{},
		steerChs:       map[string]chan SteerRequest{},
	}
}

func NewFakeHarnessByPrompt(eventsByPrompt map[string][]FakeHarnessEvent) *FakeHarness {
	harness := NewFakeHarness(nil)
	for prompt, events := range eventsByPrompt {
		harness.eventsByPrompt[prompt] = append([]FakeHarnessEvent{}, events...)
	}
	return harness
}

func (harness *FakeHarness) StartTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	events := harness.script(request)
	harness.registerRun(request.Run.ID)
	defer harness.unregisterRun(request.Run.ID)

	for _, event := range events {
		if err := ctx.Err(); err != nil {
			return TurnCompletion{}, err
		}
		switch event.Type {
		case FakeEventCancelled:
			return TurnCompletion{Outcome: TurnOutcomeCancelled}, nil
		case FakeEventFailed:
			return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: event.Error}, nil
		}
		if err := harness.handleEvent(ctx, request, sink, event); err != nil {
			return TurnCompletion{}, err
		}
	}
	return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
}

func (harness *FakeHarness) handleEvent(ctx context.Context, request TurnRequest, sink TurnSink, event FakeHarnessEvent) error {
	err := harness.handleImmediateEvent(ctx, request, sink, event)
	if !errors.Is(err, errUnsupportedFakeHarnessEvent) {
		return err
	}
	switch event.Type {
	case FakeEventWaitForCancel:
		<-ctx.Done()
		return ctx.Err()
	case FakeEventWaitForSteer:
		_, err := harness.waitForSteer(ctx, request.Run.ID)
		return err
	default:
		return fmt.Errorf("unsupported fake harness event type %s", event.Type)
	}
}

func (harness *FakeHarness) handleImmediateEvent(ctx context.Context, request TurnRequest, sink TurnSink, event FakeHarnessEvent) error {
	switch event.Type {
	case FakeEventAssistantDelta:
		return sink.AssistantTextDelta(event.ProviderItemID, event.Text)
	case FakeEventApproval:
		return harness.handleApprovalEvent(ctx, request.Run.ID, sink, event)
	case FakeEventError:
		return errors.New(event.Error)
	case FakeEventGoalUpdated:
		harness.mu.Lock()
		harness.goal = event.Goal
		harness.mu.Unlock()
		return sink.GoalUpdated(event.Goal)
	case FakeEventRunItem:
		item := event.RunItem
		if item.ProviderItemID == "" {
			item.ProviderItemID = event.ProviderItemID
		}
		return sink.RunItemUpsert(item)
	case FakeEventRunItemOutput:
		return sink.RunItemOutputDelta(event.ProviderItemID, event.Stream, event.Text)
	case FakeEventThreadLinked:
		return sink.ThreadLinked(event.ThreadID, event.SessionID, event.TurnID)
	case FakeEventTrace:
		return sink.Trace(event.Text, event.Error)
	default:
		return errUnsupportedFakeHarnessEvent
	}
}

func (harness *FakeHarness) handleApprovalEvent(ctx context.Context, runID string, sink TurnSink, event FakeHarnessEvent) error {
	approval := event.Approval
	if approval.Title == "" {
		approval.Title = "Approval required"
	}
	if approval.Kind == "" {
		approval.Kind = ApprovalKindPermission
	}
	if err := sink.ApprovalRequested(approval); err != nil {
		return err
	}
	if !event.WaitForApproval {
		return nil
	}
	response, err := harness.waitForApproval(ctx, runID)
	if err != nil {
		return err
	}
	return sink.ApprovalResolved(response.ApprovalID, response.Approved, response.Response)
}

func (harness *FakeHarness) CancelTurn(_ context.Context, request CancelRequest) error {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	harness.cancelled = append(harness.cancelled, request)
	return nil
}

func (harness *FakeHarness) SteerTurn(_ context.Context, request SteerRequest) error {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	harness.steering = append(harness.steering, request)
	channel, ok := harness.steerChs[request.RunID]
	if ok {
		channel <- request
	}
	return nil
}

func (harness *FakeHarness) SubmitApproval(_ context.Context, response ApprovalResponse) error {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	harness.approvals = append(harness.approvals, response)
	channel, ok := harness.approvalChs[response.RunID]
	if ok {
		channel <- response
	}
	return nil
}

func (harness *FakeHarness) ListCommandCapabilities(_ context.Context, request HarnessCommandListRequest) (HarnessCommandListResult, error) {
	return HarnessCommandListResult{Commands: defaultCommandCapabilities(request.ActiveRun)}, nil
}

func (harness *FakeHarness) ExecuteCommand(_ context.Context, request HarnessCommandRequest) (HarnessCommandResult, error) {
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
				SessionID: "fake-session",
				Status:    HarnessRefLinked,
				ThreadID:  "fake-thread-" + request.Conversation.ID,
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
		return HarnessCommandResult{}, commandError(ChatCommandErrorUnsupportedHarness, fmt.Sprintf("unsupported fake command kind: %s", request.Command.Kind), nil)
	}
}

type fakeGoalContinuation struct {
	harness *FakeHarness
}

func (harness *FakeHarness) BeginGoalContinuation(ctx context.Context, request HarnessCommandRequest) (HarnessCommandResult, HarnessGoalContinuation, error) {
	result, err := harness.ExecuteCommand(ctx, request)
	if err != nil {
		return HarnessCommandResult{}, nil, err
	}
	return result, &fakeGoalContinuation{harness: harness}, nil
}

func (continuation *fakeGoalContinuation) Wait(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	return continuation.harness.StartTurn(ctx, request, sink)
}

func (continuation *fakeGoalContinuation) Close() {}

func (harness *FakeHarness) executeGoalCommandLocked(command ChatCommand, result HarnessCommandResult) (HarnessCommandResult, error) {
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

func (harness *FakeHarness) setGoalStatusLocked(status string, threadID string) {
	if harness.goal == nil {
		harness.goal = &ChatGoalState{Objective: "", ThreadID: threadID}
	}
	harness.goal.Status = status
	if harness.goal.ThreadID == "" {
		harness.goal.ThreadID = threadID
	}
}

func (harness *FakeHarness) executeModelCommandLocked(command ChatCommand, result HarnessCommandResult) (HarnessCommandResult, error) {
	if command.Model == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "model command payload is required", nil)
	}
	switch command.Model.Action {
	case ModelCommandShowPicker:
		result.Action = ChatCommandResultModelPicker
		result.Models = fakeModelOptions()
		result.ReasoningEfforts = fakeReasoningEffortOptions()
		result.SelectedModel = harness.model
		result.SelectedReasoningEffort = reasoningEffortResult(harness.reasoning)
	case ModelCommandSet:
		harness.model = command.Model.ModelID
		result.SelectedModel = command.Model.ModelID
		result.SelectedReasoningEffort = reasoningEffortResult(harness.reasoning)
		if !result.HasThreadRef {
			result.CodexSettings = &ChatCodexSettings{
				Model:           harness.model,
				ReasoningEffort: reasoningEffortResult(harness.reasoning),
			}
		}
	case ModelCommandSetEffort:
		if command.Model.ReasoningEffort == nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "reasoning effort is required", nil)
		}
		harness.reasoning = *command.Model.ReasoningEffort
		result.SelectedModel = harness.model
		result.SelectedReasoningEffort = reasoningEffortResult(*command.Model.ReasoningEffort)
		if !result.HasThreadRef {
			result.CodexSettings = &ChatCodexSettings{
				Model:           harness.model,
				ReasoningEffort: reasoningEffortResult(harness.reasoning),
			}
		}
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported model command action: %s", command.Model.Action), nil)
	}
	return result, nil
}

func (harness *FakeHarness) CancelledRequests() []CancelRequest {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	return append([]CancelRequest{}, harness.cancelled...)
}

func (harness *FakeHarness) CommandRequests() []HarnessCommandRequest {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	return append([]HarnessCommandRequest{}, harness.commands...)
}

func (harness *FakeHarness) ApprovalResponses() []ApprovalResponse {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	return append([]ApprovalResponse{}, harness.approvals...)
}

func (harness *FakeHarness) SteeringRequests() []SteerRequest {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	return append([]SteerRequest{}, harness.steering...)
}

func (harness *FakeHarness) script(request TurnRequest) []FakeHarnessEvent {
	if events, ok := harness.eventsByPrompt[request.Prompt]; ok {
		return append([]FakeHarnessEvent{}, events...)
	}
	if len(harness.events) > 0 {
		return append([]FakeHarnessEvent{}, harness.events...)
	}
	return []FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "fake-thread-" + request.Conversation.ID, SessionID: "fake-session", TurnID: request.Run.ID},
		{Type: FakeEventAssistantDelta, Text: "Echo: "},
		{Type: FakeEventAssistantDelta, Text: request.Prompt},
	}
}

func fakeModelOptions() []ChatModelOption {
	return []ChatModelOption{
		{
			Description:               "Fast scripted test model.",
			DisplayName:               "Scripted Fast",
			Hidden:                    false,
			ID:                        "scripted-fast-catalog-id",
			IsDefault:                 true,
			Model:                     "scripted-fast",
			DefaultReasoningEffort:    ReasoningEffortMedium,
			SupportedReasoningEfforts: fakeReasoningEffortOptions(),
		},
		{
			Description:               "Careful scripted test model.",
			DisplayName:               "Scripted Careful",
			Hidden:                    false,
			ID:                        "scripted-careful",
			IsDefault:                 false,
			Model:                     "scripted-careful",
			DefaultReasoningEffort:    ReasoningEffortMedium,
			SupportedReasoningEfforts: fakeReasoningEffortOptions(),
		},
	}
}

func fakeReasoningEffortOptions() []ChatReasoningEffortOption {
	return []ChatReasoningEffortOption{
		{
			Description: "Fast responses with lighter reasoning.",
			DisplayName: reasoningEffortDisplayName(ReasoningEffortLow),
			Effort:      ReasoningEffortLow,
		},
		{
			Description: "Balances speed and reasoning depth for everyday tasks.",
			DisplayName: reasoningEffortDisplayName(ReasoningEffortMedium),
			Effort:      ReasoningEffortMedium,
			IsDefault:   true,
		},
		{
			Description: "Greater reasoning depth for complex problems.",
			DisplayName: reasoningEffortDisplayName(ReasoningEffortHigh),
			Effort:      ReasoningEffortHigh,
		},
		{
			Description: "Extra high reasoning depth for complex problems.",
			DisplayName: reasoningEffortDisplayName(ReasoningEffortXHigh),
			Effort:      ReasoningEffortXHigh,
		},
	}
}

func (harness *FakeHarness) registerRun(runID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	harness.approvalChs[runID] = make(chan ApprovalResponse, 1)
	harness.steerChs[runID] = make(chan SteerRequest, 8)
}

func (harness *FakeHarness) unregisterRun(runID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	delete(harness.approvalChs, runID)
	delete(harness.steerChs, runID)
}

func (harness *FakeHarness) waitForApproval(ctx context.Context, runID string) (ApprovalResponse, error) {
	harness.mu.Lock()
	channel := harness.approvalChs[runID]
	harness.mu.Unlock()

	select {
	case response := <-channel:
		return response, nil
	case <-ctx.Done():
		return ApprovalResponse{}, ctx.Err()
	}
}

func (harness *FakeHarness) waitForSteer(ctx context.Context, runID string) (SteerRequest, error) {
	harness.mu.Lock()
	channel := harness.steerChs[runID]
	harness.mu.Unlock()

	select {
	case request := <-channel:
		return request, nil
	case <-ctx.Done():
		return SteerRequest{}, ctx.Err()
	}
}
