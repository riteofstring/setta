package chat

import (
	"encoding/json"
	"testing"
)

func TestServiceProjectsActiveRunLivenessBeforeProviderRef(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("hold"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	run, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("active run with liveness: %v", err)
	}
	if !ok || run.ID != result.Run.ID {
		t.Fatalf("active run = %+v ok=%v, want %s", run, ok, result.Run.ID)
	}
	assertRunLiveness(t, liveness, RunLiveness{
		WorkspaceID:    "workspace_api",
		ConversationID: conversation.ID,
		RunID:          result.Run.ID,
		Harness:        HarnessCodex,
		Status:         RunLivenessReconciling,
		Reason:         RunLivenessReasonProviderRefPending,
		Cancellable:    true,
	})

	list, err := service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	if len(list.Conversations) != 1 {
		t.Fatalf("conversation list = %+v, want one item", list.Conversations)
	}
	assertRunLiveness(t, list.Conversations[0].ActiveRunLiveness, *liveness)

	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
}

func TestServiceProjectsAttachedLivenessAfterProviderThreadLink(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_live", SessionID: "session_live", TurnID: "turn_live"},
		{Type: FakeEventWaitForCancel},
	}))
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("link"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_live")

	_, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("active run with liveness: %v", err)
	}
	if !ok {
		t.Fatal("active run was missing after provider link")
	}
	assertRunLiveness(t, liveness, RunLiveness{
		WorkspaceID:         "workspace_api",
		ConversationID:      conversation.ID,
		RunID:               result.Run.ID,
		Harness:             HarnessCodex,
		Status:              RunLivenessAttached,
		Reason:              RunLivenessReasonProviderTurnLinked,
		Cancellable:         true,
		ProviderThreadID:    "thread_live",
		ProviderTurnID:      "turn_live",
		LastProviderEventAt: "2026-05-29T20:00:00Z",
	})

	events := receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeRunLivenessUpdated || event.RunID != result.Run.ID {
			return false
		}
		return requireRunLivenessPayload(t, event).Status == RunLivenessAttached
	})
	payload := requireRunLivenessPayload(t, requireEventType(t, events, EventTypeRunLivenessUpdated))
	if payload.Status != RunLivenessReconciling && payload.Status != RunLivenessAttached {
		t.Fatalf("first liveness event status = %q, want reconciling or attached", payload.Status)
	}

	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
}

func TestServicePublishesTerminalRunLiveness(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_done", SessionID: "session_done", TurnID: "turn_done"},
		{Type: FakeEventAssistantDelta, ProviderItemID: "answer", Text: "done"},
	}))
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("finish"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	events := receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeRunLivenessUpdated || event.RunID != result.Run.ID {
			return false
		}
		return requireRunLivenessPayload(t, event).Status == RunLivenessTerminal
	})
	terminal := requireRunLivenessPayload(t, events[len(events)-1])
	assertRunLiveness(t, &terminal, RunLiveness{
		WorkspaceID:         "workspace_api",
		ConversationID:      conversation.ID,
		RunID:               result.Run.ID,
		Harness:             HarnessCodex,
		Status:              RunLivenessTerminal,
		Reason:              RunLivenessReasonRunTerminal,
		ProviderThreadID:    "thread_done",
		ProviderTurnID:      "turn_done",
		LastProviderEventAt: "2026-05-29T20:00:00Z",
	})

	if _, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID); err != nil || ok || liveness != nil {
		t.Fatalf("active run after completion = ok %v liveness %+v err %v, want none", ok, liveness, err)
	}
	list, err := service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	if len(list.Conversations) != 1 || list.Conversations[0].ActiveRunID != "" || list.Conversations[0].ActiveRunLiveness != nil {
		t.Fatalf("conversation list after completion = %+v, want no active liveness", list.Conversations)
	}
}

func assertRunLiveness(t *testing.T, got *RunLiveness, want RunLiveness) {
	t.Helper()
	if got == nil {
		t.Fatalf("liveness was nil, want %+v", want)
	}
	if got.WorkspaceID != want.WorkspaceID ||
		got.ConversationID != want.ConversationID ||
		got.RunID != want.RunID ||
		got.Harness != want.Harness ||
		got.Status != want.Status ||
		got.Reason != want.Reason ||
		got.Retryable != want.Retryable ||
		got.Cancellable != want.Cancellable ||
		got.ProviderThreadID != want.ProviderThreadID ||
		got.ProviderTurnID != want.ProviderTurnID ||
		got.LastProviderEventAt != want.LastProviderEventAt ||
		got.LastReconciledAt != want.LastReconciledAt ||
		got.Error != want.Error {
		t.Fatalf("liveness = %+v, want %+v", *got, want)
	}
}

func requireRunLivenessPayload(t *testing.T, event Event) RunLiveness {
	t.Helper()
	var payload RunLivenessUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode liveness payload: %v", err)
	}
	return payload.Liveness
}
