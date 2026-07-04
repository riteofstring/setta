package chat

import (
	"context"
	"errors"
	"sync"
	"testing"

	"setta/internal/semanticcontext"
)

func TestServiceSteerActiveRunCompilesSemanticContextBeforeHarness(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
	})
	compiler := &recordingSemanticCompiler{
		delivery: semanticcontext.Delivery{PackID: "pack_steer", ContextText: "semantic context", ItemCount: 1},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	service.SetSemanticContextCompiler(compiler)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserMessage("workspace_api", conversation.ID, "A1")
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")

	result, err := service.SteerActiveRun("workspace_api", conversation.ID, "keep going")
	if err != nil {
		t.Fatalf("steer active: %v", err)
	}

	requests := compiler.Requests()
	if len(requests) != 1 {
		t.Fatalf("compile requests = %+v, want one steering request", requests)
	}
	request := requests[0]
	if request.TriggerKind != semanticcontext.TriggerSteering || request.AuthoredPrompt != "keep going" {
		t.Fatalf("compile request = %+v, want steering authored prompt", request)
	}
	if request.SourceRefs.ChatConversationID != conversation.ID || request.SourceRefs.ChatRunID != active.Run.ID || request.SourceRefs.ChatMessageID != result.UserMessage.ID {
		t.Fatalf("compile source refs = %+v, want chat conversation/run/message refs", request.SourceRefs)
	}
	steering := harness.SteeringRequests()
	if len(steering) != 1 {
		t.Fatalf("steering requests = %+v, want one harness request", steering)
	}
	if steering[0].Text != "keep going" || steering[0].SemanticContext == nil || steering[0].SemanticContext.PackID != "pack_steer" {
		t.Fatalf("steering request = %+v, want authored text with semantic context", steering[0])
	}
	if promptFromMessage(result.UserMessage) != "keep going" {
		t.Fatalf("stored steering prompt = %q, want authored text", promptFromMessage(result.UserMessage))
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, active.Run.ID, RunStatusCompleted)
}

func TestServiceSteerActiveRunDoesNotCallHarnessWhenSemanticContextFails(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForCancel},
	})
	compileErr := errors.New("semantic context failed")
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	service.SetSemanticContextCompiler(&recordingSemanticCompiler{err: compileErr})
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.SendUserMessage("workspace_api", conversation.ID, "A1"); err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")

	_, err = service.SteerActiveRun("workspace_api", conversation.ID, "blocked steering")
	if !errors.Is(err, compileErr) {
		t.Fatalf("steer error = %v, want compiler error", err)
	}
	if steering := harness.SteeringRequests(); len(steering) != 0 {
		t.Fatalf("steering requests = %+v, want none", steering)
	}
	messages, err := service.store.LoadMessages("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("load messages: %v", err)
	}
	steeringMessage, ok := findSteeringMessage(messages, "blocked steering")
	if !ok || steeringMessage.Status != MessageStatusError {
		t.Fatalf("steering message = %+v ok %v, want error status", steeringMessage, ok)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run cleanup: %v", err)
	}
}

func TestServiceImmediateSteeringReplayCompilesSemanticContextBeforeHarnessTurn(t *testing.T) {
	harness := NewFakeHarnessByPrompt(map[string][]FakeHarnessEvent{
		"A1": {
			{Type: FakeEventThreadLinked, ThreadID: "thread_active", SessionID: "session_fake", TurnID: "turn_active"},
			{Type: FakeEventWaitForCancel},
		},
		"S1": {
			{Type: FakeEventThreadLinked, ThreadID: "thread_replay", SessionID: "session_fake", TurnID: "turn_replay"},
			{Type: FakeEventWaitForCancel},
		},
	})
	compiler := &recordingSemanticCompiler{
		delivery: semanticcontext.Delivery{PackID: "pack_replay", ContextText: "semantic replay context", ItemCount: 1},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	service.SetSemanticContextCompiler(compiler)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserMessage("workspace_api", conversation.ID, "A1")
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_active")
	if _, err := service.SteerActiveRun("workspace_api", conversation.ID, "S1"); err != nil {
		t.Fatalf("steer active: %v", err)
	}

	result, err := service.SendSteeringImmediately("workspace_api", conversation.ID, "")
	if err != nil {
		t.Fatalf("send steering immediately: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_replay")

	requests := compiler.Requests()
	if len(requests) != 2 {
		t.Fatalf("compile requests = %+v, want steering and replay requests", requests)
	}
	if requests[0].TriggerKind != semanticcontext.TriggerSteering || requests[1].TriggerKind != semanticcontext.TriggerImmediateSteeringReplay {
		t.Fatalf("compile triggers = %s, %s; want steering then immediate replay", requests[0].TriggerKind, requests[1].TriggerKind)
	}
	replayRequest := requests[1]
	if replayRequest.AuthoredPrompt != "S1" || replayRequest.SourceRefs.ChatRunID != result.ActiveRun.ID || replayRequest.SourceRefs.ChatMessageID != result.ActiveRun.TriggerMessageID {
		t.Fatalf("replay compile request = %+v, want replay run and trigger message refs", replayRequest)
	}
	replayTurn, ok := findTurnRequest(harness.TurnRequests(), result.ActiveRun.ID)
	if !ok || replayTurn.SemanticContext == nil || replayTurn.SemanticContext.PackID != "pack_replay" || replayTurn.Prompt != "S1" {
		t.Fatalf("replay turn = %+v ok %v, want authored prompt with semantic context", replayTurn, ok)
	}
	if result.CancelledRun.ID != active.Run.ID {
		t.Fatalf("cancelled run = %s, want %s", result.CancelledRun.ID, active.Run.ID)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel replay cleanup: %v", err)
	}
}

type recordingSemanticCompiler struct {
	mu       sync.Mutex
	delivery semanticcontext.Delivery
	err      error
	requests []semanticcontext.CompileRequest
}

func (compiler *recordingSemanticCompiler) CompileContext(_ context.Context, request semanticcontext.CompileRequest) (semanticcontext.Delivery, error) {
	compiler.mu.Lock()
	defer compiler.mu.Unlock()

	compiler.requests = append(compiler.requests, request)
	if compiler.err != nil {
		return semanticcontext.Delivery{}, compiler.err
	}
	return compiler.delivery, nil
}

func (compiler *recordingSemanticCompiler) Requests() []semanticcontext.CompileRequest {
	compiler.mu.Lock()
	defer compiler.mu.Unlock()

	return append([]semanticcontext.CompileRequest{}, compiler.requests...)
}

func findSteeringMessage(messages []ChatMessage, prompt string) (ChatMessage, bool) {
	for _, message := range messages {
		if message.Role == RoleUser && message.Delivery == MessageDeliverySteering && promptFromMessage(message) == prompt {
			return message, true
		}
	}
	return ChatMessage{}, false
}

func findTurnRequest(requests []TurnRequest, runID string) (TurnRequest, bool) {
	for _, request := range requests {
		if request.Run.ID == runID {
			return request, true
		}
	}
	return TurnRequest{}, false
}
