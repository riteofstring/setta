package chat

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"setta/internal/workspace"
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
		WorkspaceID:      "workspace_api",
		ConversationID:   conversation.ID,
		RunID:            result.Run.ID,
		Harness:          HarnessCodex,
		Status:           RunLivenessReconciling,
		Reason:           RunLivenessReasonProviderRefPending,
		Phase:            RunLivenessPhaseWaitingForProvider,
		ActiveStatus:     runActiveStatus(RunActiveStatusWaitingForProvider, "Waiting for Codex", RunActiveHeadlineLiveness),
		Cancellable:      true,
		SteeringDisabled: "Codex has not linked a provider turn yet.",
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
		WorkspaceID:           "workspace_api",
		ConversationID:        conversation.ID,
		RunID:                 result.Run.ID,
		Harness:               HarnessCodex,
		Status:                RunLivenessAttached,
		Reason:                RunLivenessReasonProviderTurnLinked,
		Phase:                 RunLivenessPhaseAttached,
		ActiveStatus:          runActiveStatus(RunActiveStatusWorking, "Working", RunActiveHeadlineFallback),
		Cancellable:           true,
		Steerable:             true,
		ProviderThreadID:      "thread_live",
		ProviderTurnID:        "turn_live",
		LastProviderEventAt:   "2026-05-29T20:00:00Z",
		LastVisibleActivityAt: "2026-05-29T20:00:00Z",
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

func TestServiceUsesPublicReasoningHeadlineForActiveLiveness(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_reason", SessionID: "session_reason", TurnID: "turn_reason"},
		{Type: FakeEventWaitForCancel},
	}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("reason"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_reason")

	if err := service.upsertRunItem("workspace_api", conversation.ID, result.Run.ID, RunItem{
		ProviderItemID: "reason_public",
		Type:           RunItemTypeReasoning,
		Status:         RunItemStatusRunning,
		Title:          "Reasoning summary",
		Progress:       "Preparing **Mapping",
	}); err != nil {
		t.Fatalf("upsert partial reasoning item: %v", err)
	}
	_, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run with liveness ok=%v err=%v", ok, err)
	}
	if liveness.ActiveStatus != runActiveStatus(RunActiveStatusWorking, "Working", RunActiveHeadlineFallback) {
		t.Fatalf("active status for partial headline = %+v, want working fallback", liveness.ActiveStatus)
	}

	if err := service.upsertRunItem("workspace_api", conversation.ID, result.Run.ID, RunItem{
		ProviderItemID: "reason_public",
		Type:           RunItemTypeReasoning,
		Status:         RunItemStatusRunning,
		Title:          "Reasoning summary",
		Progress:       " parser modules** now that details arrived.\nChecked request flow and parser boundaries.",
	}); err != nil {
		t.Fatalf("upsert complete reasoning item: %v", err)
	}
	_, liveness, ok, err = service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run with liveness ok=%v err=%v", ok, err)
	}
	if liveness.ActiveStatus != runActiveStatus(RunActiveStatusThinking, "Mapping parser modules", RunActiveHeadlinePublicReasoning) {
		t.Fatalf("active status = %+v, want public reasoning headline", liveness.ActiveStatus)
	}
	if !liveness.Steerable || liveness.Phase != RunLivenessPhaseAttached {
		t.Fatalf("liveness = %+v, want attached steerable thinking run", *liveness)
	}

	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
}

func TestServiceIgnoresPrivateReasoningForActiveLivenessHeadline(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_private", SessionID: "session_private", TurnID: "turn_private"},
		{Type: FakeEventWaitForCancel},
	}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("private reason"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_private")

	if err := service.upsertRunItem("workspace_api", conversation.ID, result.Run.ID, RunItem{
		ProviderItemID: "reason_private",
		Type:           RunItemTypeReasoning,
		Status:         RunItemStatusRunning,
		HiddenText:     "private chain of thought",
	}); err != nil {
		t.Fatalf("upsert private reasoning item: %v", err)
	}
	_, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run with liveness ok=%v err=%v", ok, err)
	}
	if liveness.ActiveStatus != runActiveStatus(RunActiveStatusWorking, "Working", RunActiveHeadlineFallback) {
		t.Fatalf("active status = %+v, want working fallback", liveness.ActiveStatus)
	}

	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
}

func TestServiceUpdatesAttachedLivenessFreshnessOnProviderEvents(t *testing.T) {
	now := mustTime(t, "2026-05-29T20:00:00Z")
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fresh", SessionID: "session_fresh", TurnID: "turn_fresh"},
		{Type: FakeEventWaitForCancel},
	}))
	service.now = func() time.Time { return now }
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("fresh"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fresh")

	now = now.Add(2 * time.Minute)
	if err := service.appendAssistantDelta("workspace_api", conversation.ID, result.Run.ID, "answer", "fresh activity"); err != nil {
		t.Fatalf("append assistant delta: %v", err)
	}
	_, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run with liveness ok=%v err=%v", ok, err)
	}
	if liveness.LastProviderEventAt != "2026-05-29T20:02:00Z" || liveness.LastVisibleActivityAt != "2026-05-29T20:02:00Z" {
		t.Fatalf("freshness timestamps = provider %q visible %q, want updated provider event time", liveness.LastProviderEventAt, liveness.LastVisibleActivityAt)
	}

	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
}

func TestServiceMarksInactiveAttachedRunStalled(t *testing.T) {
	now := mustTime(t, "2026-05-29T20:00:00Z")
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_stale", SessionID: "session_stale", TurnID: "turn_stale"},
		{Type: FakeEventWaitForCancel},
	}))
	service.now = func() time.Time { return now }
	service.freshnessBudget = 10 * time.Millisecond
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("stale"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_stale")
	now = now.Add(time.Minute)

	stalled := waitForRunLiveness(t, subscription, result.Run.ID, RunLivenessReconciling, RunLivenessReasonProviderInactive)
	assertRunLiveness(t, &stalled, RunLiveness{
		WorkspaceID:           "workspace_api",
		ConversationID:        conversation.ID,
		RunID:                 result.Run.ID,
		Harness:               HarnessCodex,
		Status:                RunLivenessReconciling,
		Reason:                RunLivenessReasonProviderInactive,
		Phase:                 RunLivenessPhaseStalled,
		ActiveStatus:          runActiveStatus(RunActiveStatusStalled, "Waiting for Codex activity", RunActiveHeadlineLiveness),
		Retryable:             true,
		Cancellable:           true,
		SteeringDisabled:      "Codex has not emitted activity recently.",
		ProviderThreadID:      "thread_stale",
		ProviderTurnID:        "turn_stale",
		LastProviderEventAt:   "2026-05-29T20:00:00Z",
		LastVisibleActivityAt: "2026-05-29T20:00:00Z",
		LastReconciledAt:      "2026-05-29T20:01:00Z",
	})

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
		WorkspaceID:           "workspace_api",
		ConversationID:        conversation.ID,
		RunID:                 result.Run.ID,
		Harness:               HarnessCodex,
		Status:                RunLivenessTerminal,
		Reason:                RunLivenessReasonRunTerminal,
		Phase:                 RunLivenessPhaseTerminal,
		ActiveStatus:          runActiveStatus(RunActiveStatusFinished, "Finished", RunActiveHeadlineTerminal),
		SteeringDisabled:      "The run has finished.",
		ProviderThreadID:      "thread_done",
		ProviderTurnID:        "turn_done",
		LastProviderEventAt:   "2026-05-29T20:00:00Z",
		LastVisibleActivityAt: "2026-05-29T20:00:00Z",
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

func TestServiceProviderLifecycleErrorReconcilesWithProviderRestartedReason(t *testing.T) {
	harness := newProviderRestartLifecycleHarness()
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("restart"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	restarted := waitForProviderRestartedLiveness(t, subscription, result.Run.ID)
	assertRunLiveness(t, &restarted, RunLiveness{
		WorkspaceID:           "workspace_api",
		ConversationID:        conversation.ID,
		RunID:                 result.Run.ID,
		Harness:               HarnessCodex,
		Status:                RunLivenessReconciling,
		Reason:                RunLivenessReasonProviderRestarted,
		Phase:                 RunLivenessPhaseReconnecting,
		ActiveStatus:          runActiveStatus(RunActiveStatusReconnecting, "Reconnecting", RunActiveHeadlineLiveness),
		Retryable:             true,
		Cancellable:           true,
		SteeringDisabled:      "Setta is reconnecting to Codex.",
		ProviderThreadID:      "thread_restart",
		ProviderTurnID:        "turn_restart",
		LastProviderEventAt:   "2026-05-29T20:00:00Z",
		LastVisibleActivityAt: "2026-05-29T20:00:00Z",
		LastReconciledAt:      "2026-05-29T20:00:00Z",
	})
	assertProviderRestartReconcileRequest(t, harness)
	assertActiveRunLiveness(t, service, conversation.ID, restarted)
	assertSnapshotPreservesProviderRestartReason(t, service, conversation.ID)
	assertProviderRestartPartialAssistantText(t, service, conversation.ID)

	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
}

func TestServiceRetryableProviderTurnErrorMarksStreamResync(t *testing.T) {
	harness := newProviderTurnErrorHarness(ProviderTurnError{
		Message:        "response stream disconnected before completion",
		CodexErrorKind: "responseStreamDisconnected",
		Retryable:      true,
		StreamFailure:  true,
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("retrying stream"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	liveness := waitForRunLiveness(t, subscription, result.Run.ID, RunLivenessReconciling, RunLivenessReasonStreamResync)
	if !liveness.Retryable || !liveness.Cancellable || liveness.Error != "response stream disconnected before completion" {
		t.Fatalf("retryable stream liveness = %+v", liveness)
	}
	assertActiveRunLiveness(t, service, conversation.ID, liveness)
	assertProviderTurnErrorDiagnostic(t, service, conversation.ID, result.Run.ID, "codex_turn_error_retrying", DiagnosticSeverityWarning)
	assertProviderTurnErrorPartialAssistantText(t, service, conversation.ID)
	assertProviderStreamLifecycleActivity(t, service, conversation.ID, result.Run.ID, providerStreamLifecycleActivityAssertion{
		title:          "Codex connection retrying",
		itemStatus:     RunItemStatusRunning,
		message:        "response stream disconnected before completion",
		willRetry:      true,
		livenessStatus: RunLivenessReconciling,
		livenessReason: RunLivenessReasonStreamResync,
	})

	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
}

func TestServiceNonRetryableStreamTurnErrorMarksActiveRunLost(t *testing.T) {
	harness := newProviderTurnErrorHarness(ProviderTurnError{
		Message:        "stream disconnected before completion",
		CodexErrorKind: "responseStreamDisconnected",
		StreamFailure:  true,
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("lost stream"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	liveness := waitForRunLiveness(t, subscription, result.Run.ID, RunLivenessLost, RunLivenessReasonProviderUnavailable)
	if !liveness.Retryable || !liveness.Cancellable || liveness.Error != "stream disconnected before completion" {
		t.Fatalf("lost stream liveness = %+v", liveness)
	}
	assertActiveRunLiveness(t, service, conversation.ID, liveness)
	assertProviderTurnErrorDiagnostic(t, service, conversation.ID, result.Run.ID, "codex_stream_error", DiagnosticSeverityCritical)
	assertProviderTurnErrorPartialAssistantText(t, service, conversation.ID)
	assertProviderStreamLifecycleActivity(t, service, conversation.ID, result.Run.ID, providerStreamLifecycleActivityAssertion{
		title:          "Codex stream failed",
		itemStatus:     RunItemStatusFailed,
		message:        "stream disconnected before completion",
		willRetry:      false,
		livenessStatus: RunLivenessLost,
		livenessReason: RunLivenessReasonProviderUnavailable,
	})

	run, err := service.store.LoadRun("workspace_api", result.Run.ID)
	if err != nil {
		t.Fatalf("load run: %v", err)
	}
	if run.Status != RunStatusRunning {
		t.Fatalf("run status = %q, want active running run", run.Status)
	}
	snapshot, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonSnapshotLoad)
	if err != nil {
		t.Fatalf("snapshot reconcile after stream loss: %v", err)
	}
	if len(snapshot.Runs) != 1 ||
		snapshot.Runs[0].Status != RunLivenessLost ||
		snapshot.Runs[0].Reason != RunLivenessReasonProviderUnavailable {
		t.Fatalf("snapshot reconcile liveness = %+v, want preserved lost stream state", snapshot.Runs)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
}

func waitForProviderRestartedLiveness(t *testing.T, subscription *EventSubscription, runID string) RunLiveness {
	t.Helper()
	return waitForRunLiveness(t, subscription, runID, RunLivenessReconciling, RunLivenessReasonProviderRestarted)
}

func waitForRunLiveness(t *testing.T, subscription *EventSubscription, runID string, status RunLivenessStatus, reason RunLivenessReason) RunLiveness {
	t.Helper()
	events := receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeRunLivenessUpdated || event.RunID != runID {
			return false
		}
		liveness := requireRunLivenessPayload(t, event)
		return liveness.Status == status && liveness.Reason == reason
	})
	return requireRunLivenessPayload(t, events[len(events)-1])
}

func assertProviderRestartReconcileRequest(t *testing.T, harness *providerRestartLifecycleHarness) {
	t.Helper()
	var request HarnessRunLivenessRequest
	select {
	case request = <-harness.reconciled:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for provider restart liveness reconciliation")
	}
	if request.ThreadID != "thread_restart" || request.TurnID != "turn_restart" {
		t.Fatalf("reconcile request = %+v, want linked provider refs", request)
	}
}

func assertActiveRunLiveness(t *testing.T, service *Service, conversationID string, want RunLiveness) {
	t.Helper()
	_, activeLiveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversationID)
	if err != nil || !ok {
		t.Fatalf("active run after provider restart ok=%v err=%v", ok, err)
	}
	assertRunLiveness(t, activeLiveness, want)
}

func assertSnapshotPreservesProviderRestartReason(t *testing.T, service *Service, conversationID string) {
	t.Helper()
	snapshot, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversationID, RunLivenessReasonSnapshotLoad)
	if err != nil {
		t.Fatalf("snapshot reconcile after provider restart: %v", err)
	}
	if len(snapshot.Runs) != 1 || snapshot.Runs[0].Reason != RunLivenessReasonProviderRestarted {
		t.Fatalf("snapshot reconcile liveness = %+v, want provider restart reason preserved", snapshot.Runs)
	}
}

func assertProviderRestartPartialAssistantText(t *testing.T, service *Service, conversationID string) {
	t.Helper()
	assertAssistantFirstText(t, service, conversationID, "partial before restart")
}

func assertProviderTurnErrorPartialAssistantText(t *testing.T, service *Service, conversationID string) {
	t.Helper()
	assertAssistantFirstText(t, service, conversationID, "partial before provider error")
}

func assertAssistantFirstText(t *testing.T, service *Service, conversationID string, want string) {
	t.Helper()
	page, err := service.LoadMessagePage("workspace_api", conversationID, 0, 20)
	if err != nil {
		t.Fatalf("load message page: %v", err)
	}
	if len(page.Messages) < 2 ||
		len(page.Messages[1].Parts) == 0 ||
		page.Messages[1].Parts[0].Text == nil ||
		page.Messages[1].Parts[0].Text.Text != want {
		t.Fatalf("page messages = %+v, want preserved assistant text %q", page.Messages, want)
	}
}

func assertProviderTurnErrorDiagnostic(t *testing.T, service *Service, conversationID string, runID string, code string, severity DiagnosticSeverity) {
	t.Helper()
	diagnostics, err := service.ListDiagnostics("workspace_api", conversationID, runID)
	if err != nil {
		t.Fatalf("list diagnostics: %v", err)
	}
	for _, diagnostic := range diagnostics {
		if diagnostic.Code == code && diagnostic.Severity == severity {
			return
		}
	}
	t.Fatalf("diagnostics = %+v, want %s/%s", diagnostics, code, severity)
}

type providerStreamLifecycleActivityAssertion struct {
	title          string
	itemStatus     RunItemStatus
	message        string
	willRetry      bool
	livenessStatus RunLivenessStatus
	livenessReason RunLivenessReason
}

func assertProviderStreamLifecycleActivity(t *testing.T, service *Service, conversationID string, runID string, want providerStreamLifecycleActivityAssertion) {
	t.Helper()

	page, err := service.LoadRunActivityPage("workspace_api", runID, "", 20)
	if err != nil {
		t.Fatalf("load run activity: %v", err)
	}
	for _, activity := range page.Activity {
		if activity.Type != RunItemTypeProviderStreamLifecycle {
			continue
		}
		if activity.Title != want.title || activity.Status != want.itemStatus {
			t.Fatalf("provider stream activity = %+v, want title %q status %s", activity, want.title, want.itemStatus)
		}
		details := activity.Details.ProviderStreamLifecycle
		if details == nil {
			t.Fatalf("provider stream activity details missing: %+v", activity.Details)
		}
		if details.Message != want.message ||
			details.CodexErrorKind != "responseStreamDisconnected" ||
			details.WillRetry != want.willRetry ||
			!details.StreamFailure ||
			details.LivenessStatus != want.livenessStatus ||
			details.LivenessReason != want.livenessReason ||
			details.ProviderThreadID != "thread_provider_error" ||
			details.ProviderTurnID != "turn_provider_error" {
			t.Fatalf("provider stream details = %+v, want message %q retry %t liveness %s/%s", *details, want.message, want.willRetry, want.livenessStatus, want.livenessReason)
		}
		return
	}
	t.Fatalf("run %s activity = %+v, want provider stream lifecycle row for conversation %s", runID, page.Activity, conversationID)
}

type providerRestartLifecycleHarness struct {
	reconciled chan HarnessRunLivenessRequest
}

func newProviderRestartLifecycleHarness() *providerRestartLifecycleHarness {
	return &providerRestartLifecycleHarness{reconciled: make(chan HarnessRunLivenessRequest, 1)}
}

func (harness *providerRestartLifecycleHarness) StartTurn(_ context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.ThreadLinked("thread_restart", "session_restart", "turn_restart", nil); err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.AssistantTextDelta("answer", "partial before restart"); err != nil {
		return TurnCompletion{}, err
	}
	return TurnCompletion{}, &HarnessProviderLifecycleError{
		Err:     errors.New("codex app-server exited"),
		Message: "codex app-server exited before turn completed",
		Reason:  RunLivenessReasonProviderRestarted,
	}
}

func (harness *providerRestartLifecycleHarness) ReconcileRunLiveness(_ context.Context, request HarnessRunLivenessRequest) (HarnessRunLivenessResult, error) {
	harness.reconciled <- request
	return HarnessRunLivenessResult{
		ThreadID:     request.ThreadID,
		ThreadStatus: HarnessThreadRuntimeActive,
		TurnID:       request.TurnID,
		TurnFound:    true,
		TurnStatus:   HarnessTurnRuntimeInProgress,
	}, nil
}

func (harness *providerRestartLifecycleHarness) CancelTurn(context.Context, CancelRequest) error {
	return ErrTurnNotStarted
}

func (harness *providerRestartLifecycleHarness) SteerTurn(context.Context, SteerRequest) error {
	return ErrTurnNotStarted
}

func (harness *providerRestartLifecycleHarness) SubmitApproval(context.Context, ApprovalResponse) error {
	return nil
}

func (harness *providerRestartLifecycleHarness) ResolveCodexEffectiveSettings(context.Context, workspace.WorkspaceSummary, Conversation) (*ChatCodexEffectiveSettings, error) {
	return nil, nil
}

type providerTurnErrorHarness struct {
	providerError ProviderTurnError
}

func newProviderTurnErrorHarness(providerError ProviderTurnError) *providerTurnErrorHarness {
	return &providerTurnErrorHarness{providerError: providerError}
}

func (harness *providerTurnErrorHarness) StartTurn(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.ThreadLinked("thread_provider_error", "session_provider_error", "turn_provider_error", nil); err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.AssistantTextDelta("answer", "partial before provider error"); err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.ProviderTurnError(harness.providerError); err != nil {
		return TurnCompletion{}, err
	}
	<-ctx.Done()
	return TurnCompletion{}, ctx.Err()
}

func (harness *providerTurnErrorHarness) CancelTurn(context.Context, CancelRequest) error {
	return nil
}

func (harness *providerTurnErrorHarness) ReconcileRunLiveness(_ context.Context, request HarnessRunLivenessRequest) (HarnessRunLivenessResult, error) {
	return HarnessRunLivenessResult{
		ThreadID:     request.ThreadID,
		ThreadStatus: HarnessThreadRuntimeActive,
		TurnID:       request.TurnID,
		TurnFound:    true,
		TurnStatus:   HarnessTurnRuntimeInProgress,
	}, nil
}

func (harness *providerTurnErrorHarness) SteerTurn(context.Context, SteerRequest) error {
	return ErrTurnNotStarted
}

func (harness *providerTurnErrorHarness) SubmitApproval(context.Context, ApprovalResponse) error {
	return nil
}

func (harness *providerTurnErrorHarness) ResolveCodexEffectiveSettings(context.Context, workspace.WorkspaceSummary, Conversation) (*ChatCodexEffectiveSettings, error) {
	return nil, nil
}

func assertRunLiveness(t *testing.T, got *RunLiveness, want RunLiveness) {
	t.Helper()
	if got == nil {
		t.Fatalf("liveness was nil, want %+v", want)
	}
	if !reflect.DeepEqual(*got, want) {
		t.Fatalf("liveness = %+v, want %+v", *got, want)
	}
}

func runActiveStatus(kind RunActiveStatusKind, headline string, source RunActiveHeadlineSource) RunActiveStatus {
	return RunActiveStatus{Kind: kind, Headline: headline, HeadlineSource: source}
}

func requireRunLivenessPayload(t *testing.T, event Event) RunLiveness {
	t.Helper()
	var payload RunLivenessUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode liveness payload: %v", err)
	}
	return payload.Liveness
}
