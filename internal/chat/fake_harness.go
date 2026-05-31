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
	FakeEventError          = "error"
	FakeEventThreadLinked   = "thread_linked"
	FakeEventTrace          = "trace"
	FakeEventWaitForCancel  = "wait_for_cancel"
)

type FakeHarnessEvent struct {
	Type            string
	Text            string
	Error           string
	ThreadID        string
	SessionID       string
	TurnID          string
	Approval        ApprovalRequest
	WaitForApproval bool
}

type FakeHarness struct {
	events []FakeHarnessEvent

	mu          sync.Mutex
	cancelled   []CancelRequest
	approvals   []ApprovalResponse
	approvalChs map[string]chan ApprovalResponse
}

func NewFakeHarness(events []FakeHarnessEvent) *FakeHarness {
	return &FakeHarness{
		events:      append([]FakeHarnessEvent{}, events...),
		approvalChs: map[string]chan ApprovalResponse{},
	}
}

func (harness *FakeHarness) StartTurn(ctx context.Context, request TurnRequest, sink TurnSink) error {
	events := harness.script(request)
	harness.registerRun(request.Run.ID)
	defer harness.unregisterRun(request.Run.ID)

	for _, event := range events {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := harness.handleEvent(ctx, request, sink, event); err != nil {
			return err
		}
	}
	return nil
}

func (harness *FakeHarness) handleEvent(ctx context.Context, request TurnRequest, sink TurnSink, event FakeHarnessEvent) error {
	switch event.Type {
	case FakeEventAssistantDelta:
		return sink.AssistantTextDelta(event.Text)
	case FakeEventApproval:
		return harness.handleApprovalEvent(ctx, request.Run.ID, sink, event)
	case FakeEventError:
		return errors.New(event.Error)
	case FakeEventThreadLinked:
		return sink.ThreadLinked(event.ThreadID, event.SessionID, event.TurnID)
	case FakeEventTrace:
		return sink.Trace(event.Text, event.Error)
	case FakeEventWaitForCancel:
		<-ctx.Done()
		return ctx.Err()
	default:
		return fmt.Errorf("unsupported fake harness event type %s", event.Type)
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

func (harness *FakeHarness) CancelledRequests() []CancelRequest {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	return append([]CancelRequest{}, harness.cancelled...)
}

func (harness *FakeHarness) ApprovalResponses() []ApprovalResponse {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	return append([]ApprovalResponse{}, harness.approvals...)
}

func (harness *FakeHarness) script(request TurnRequest) []FakeHarnessEvent {
	if len(harness.events) > 0 {
		return append([]FakeHarnessEvent{}, harness.events...)
	}
	return []FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "fake-thread-" + request.Conversation.ID, SessionID: "fake-session", TurnID: request.Run.ID},
		{Type: FakeEventAssistantDelta, Text: "Echo: "},
		{Type: FakeEventAssistantDelta, Text: request.Prompt},
	}
}

func (harness *FakeHarness) registerRun(runID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	harness.approvalChs[runID] = make(chan ApprovalResponse, 1)
}

func (harness *FakeHarness) unregisterRun(runID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	delete(harness.approvalChs, runID)
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
