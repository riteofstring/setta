package runtime

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/conversation"
	"setta/internal/httpapi"
	"setta/internal/master"
	"setta/internal/workspacesession"
)

func TestBackendTopicConversationWorkflowWithLiveCodex(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 45*time.Second)
	baseURL := "http://" + server.Addr()
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	created := postRuntimeJSON[conversation.ConversationSnapshot](t, client, baseURL, "/conversations/create", httpapi.CreateTopicConversationRequest{
		WorkspaceID: opened.Workspace.ID,
		Title:       "Live topic conversation",
	}, http.StatusOK)
	if created.ThreadBinding == nil || created.ThreadBinding.ThreadID == "" {
		t.Fatalf("created live topic has no provider thread binding: %+v", created.ThreadBinding)
	}

	var latestSnapshot conversation.ConversationSnapshot
	for index, task := range []struct {
		expected string
		text     string
	}{
		{
			expected: "TOPIC_ONE_OK",
			text:     "Produce the next parent-agent topic deliverable as exactly TOPIC_ONE_OK, with no other text.",
		},
		{
			expected: "TOPIC_TWO_OK",
			text:     "Produce the next parent-agent topic deliverable as exactly TOPIC_TWO_OK, with no other text.",
		},
	} {
		accepted := postRuntimeJSON[conversation.AcceptedConversationInput](
			t,
			client,
			baseURL,
			"/conversations/inputs/submit",
			httpapi.SubmitConversationInputRequest{Input: conversation.ConversationInput{
				ID:             fmt.Sprintf("live-topic-conversation-turn-%d", index+1),
				ConversationID: created.Conversation.ID,
				Text:           task.text,
				Modality:       conversation.ConversationInputModalityText,
				SubmittedAt:    time.Now().UTC().Format(time.RFC3339Nano),
			}},
			http.StatusAccepted,
		)
		routed := waitForRuntimeLiveConversationRoute(
			t,
			client,
			baseURL,
			opened.Workspace.ID,
			created.Conversation.ID,
			accepted,
		)
		if len(routed.Decisions) != 1 ||
			routed.Decisions[0].Decision.Kind != conversation.ConversationRouteDecisionKindSendToParent {
			encoded, err := json.MarshalIndent(routed.Decisions, "", "  ")
			if err != nil {
				t.Fatalf("encode invalid live topic input route: %v", err)
			}
			t.Fatalf("live topic input route = %s, want send", encoded)
		}
		snapshot := waitForRuntimeLiveTopicTurns(
			t,
			client,
			baseURL,
			opened.Workspace.ID,
			created.Conversation.ID,
			index+1,
		)
		latestTurn := snapshot.Turns.Turns[len(snapshot.Turns.Turns)-1]
		if latestTurn.Status != conversation.TurnStatusCompleted {
			t.Fatalf("live topic turn %d status = %s, want completed", index+1, latestTurn.Status)
		}
		if !runtimeTopicTrajectoryHasCompletedText(snapshot, latestTurn.ID, task.expected) {
			t.Fatalf("live topic turn %s has no completed public agent text containing %s", latestTurn.ID, task.expected)
		}
		if !runtimeTopicHasFinalNarration(snapshot, latestTurn.ID) {
			t.Fatalf("live topic turn %s has no automatic narrator final summary", latestTurn.ID)
		}
		if snapshot.ThreadBinding == nil || snapshot.ThreadBinding.ThreadID != created.ThreadBinding.ThreadID {
			t.Fatalf("live topic provider thread changed across turns: before=%+v after=%+v", created.ThreadBinding, snapshot.ThreadBinding)
		}
		latestSnapshot = snapshot
	}

	accepted := postRuntimeJSON[conversation.AcceptedConversationInput](
		t,
		client,
		baseURL,
		"/conversations/inputs/submit",
		httpapi.SubmitConversationInputRequest{Input: conversation.ConversationInput{
			ID:             "live-topic-conversation-status",
			ConversationID: created.Conversation.ID,
			Text: "Answer as this conversation's narrator: Has the latest topic turn completed, and what did it produce? " +
				"Do not send new work to the parent agent.",
			Modality:    conversation.ConversationInputModalityText,
			SubmittedAt: time.Now().UTC().Format(time.RFC3339Nano),
		}},
		http.StatusAccepted,
	)
	routed := waitForRuntimeLiveConversationRoute(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		accepted,
	)
	assertRuntimeLiveConversationRoute(t, latestSnapshot, routed)
	question := routed.Decisions[0].ResultingCommand.AnswerAsNarrator.Question
	afterRoute := waitForRuntimeLiveNarratorStatus(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		latestSnapshot,
		question,
	)
	assertRuntimeLiveNarratorStatus(t, latestSnapshot, afterRoute, question)
	assertRuntimeLiveConversationRouteIsolation(t, latestSnapshot, afterRoute)

	masterInput := master.MasterInput{
		ID:                    "live-master-route-answer",
		Text:                  "Answer this app-global request with exactly GLOBAL_ROUTE_OK. Do not open, focus, create, modify, or send work to any topic conversation.",
		Modality:              master.MasterInputModalityText,
		Source:                master.MasterInputSourceShell,
		SubmittedAt:           time.Now().UTC().Format(time.RFC3339Nano),
		FocusedWorkspaceID:    &opened.Workspace.ID,
		FocusedConversationID: &created.Conversation.ID,
	}
	acceptedMaster := postRuntimeJSON[master.AcceptedMasterInput](
		t,
		client,
		baseURL,
		"/master/inputs/submit",
		httpapi.SubmitMasterInputRequest{Input: masterInput},
		http.StatusAccepted,
	)
	masterRoute := waitForRuntimeLiveMasterRoute(t, client, baseURL, acceptedMaster.Input.ID)
	assertRuntimeLiveMasterRoute(t, masterRoute, opened.Workspace.ID, created.Conversation.ID)
	presentation := postRuntimeJSON[master.PresentationIntent](
		t,
		client,
		baseURL,
		"/master/presentation/wait",
		httpapi.ReadMasterInputRoutingStateRequest{InputID: acceptedMaster.Input.ID},
		http.StatusOK,
	)
	if presentation.InputID != acceptedMaster.Input.ID ||
		presentation.Kind != master.PresentationIntentKindShowMasterReply ||
		presentation.ShowMasterReply == nil ||
		presentation.ShowMasterReply.ReplyKind != master.MasterReplyKindAnswer ||
		strings.TrimSpace(presentation.ShowMasterReply.Text) != "GLOBAL_ROUTE_OK" {
		encoded, err := json.MarshalIndent(presentation, "", "  ")
		if err != nil {
			t.Fatalf("encode invalid live master presentation: %v", err)
		}
		t.Fatalf("live master presentation = %s", encoded)
	}
}

func waitForRuntimeLiveMasterRoute(
	t *testing.T,
	client *http.Client,
	baseURL string,
	inputID string,
) master.InputRoutingState {
	t.Helper()
	deadline := time.Now().Add(2 * time.Minute)
	var last master.InputRoutingState
	for time.Now().Before(deadline) {
		last = postRuntimeJSON[master.InputRoutingState](
			t,
			client,
			baseURL,
			"/master/inputs/state/read",
			httpapi.ReadMasterInputRoutingStateRequest{InputID: inputID},
			http.StatusOK,
		)
		switch last.Status {
		case master.InputRoutingStatusDecided:
			return last
		case master.InputRoutingStatusFailed:
			t.Fatalf("live master route failed: %+v", last)
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live master route; last state = %+v", last)
	return master.InputRoutingState{}
}

func assertRuntimeLiveMasterRoute(
	t *testing.T,
	state master.InputRoutingState,
	workspaceID string,
	conversationID string,
) {
	t.Helper()
	record := state.Decision
	if !validRuntimeLiveMasterRoute(record, state.Input.Sequence, workspaceID, conversationID) {
		encoded, err := json.MarshalIndent(state, "", "  ")
		if err != nil {
			t.Fatalf("encode invalid live master route decision: %v", err)
		}
		t.Fatalf("live master route decision = %s", encoded)
	}
}

func validRuntimeLiveMasterRoute(
	record *master.RouteDecisionRecord,
	inputSequence int,
	workspaceID string,
	conversationID string,
) bool {
	if record == nil {
		return false
	}
	return validRuntimeLiveMasterAnswer(*record) &&
		validRuntimeLiveMasterContext(*record, inputSequence, workspaceID, conversationID) &&
		validRuntimeLiveMasterInvocation(record.ResolvedInvocation)
}

func validRuntimeLiveMasterAnswer(record master.RouteDecisionRecord) bool {
	return record.Decision.Kind == master.RouteDecisionKindAnswerGlobal &&
		record.Decision.AnswerGlobal != nil &&
		strings.TrimSpace(record.Decision.AnswerGlobal.Text) == "GLOBAL_ROUTE_OK" &&
		record.ResultingCommand.Kind == master.RouteDecisionKindAnswerGlobal &&
		record.ResultingCommand.AnswerGlobal != nil &&
		strings.TrimSpace(record.ResultingCommand.AnswerGlobal.Text) == "GLOBAL_ROUTE_OK"
}

func validRuntimeLiveMasterContext(
	record master.RouteDecisionRecord,
	inputSequence int,
	workspaceID string,
	conversationID string,
) bool {
	authorized := slices.ContainsFunc(record.Context.TargetAuthorities, func(target master.RouteTargetAuthority) bool {
		return target.ConversationID == conversationID && target.WorkspaceID == workspaceID
	})
	return record.Context.InputSequence == inputSequence &&
		authorized &&
		slices.Contains(record.Context.ActiveWorkspaceIDs, workspaceID)
}

func validRuntimeLiveMasterInvocation(invocation master.RouteInvocationAudit) bool {
	return invocation.Configuration.ResolvedModel == "gpt-5.6-terra" &&
		invocation.Configuration.ResolvedPermissionMode == "read_only" &&
		invocation.Configuration.ResolvedApprovalMode == "never" &&
		invocation.ProviderRequestID != "" &&
		invocation.ProviderThreadID != "" &&
		invocation.ProviderTurnID != "" &&
		invocation.InputBytes > 0 &&
		invocation.OutputBytes > 0
}

func waitForRuntimeLiveConversationRoute(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	conversationID string,
	accepted conversation.AcceptedConversationInput,
) conversation.ConversationInputRoutingState {
	t.Helper()
	deadline := time.Now().Add(2 * time.Minute)
	var last conversation.ConversationInputRoutingState
	for time.Now().Before(deadline) {
		last = postRuntimeJSON[conversation.ConversationInputRoutingState](
			t,
			client,
			baseURL,
			"/conversations/inputs/state/read",
			httpapi.ReadConversationInputRoutingStateRequest{
				WorkspaceID:    workspaceID,
				ConversationID: conversationID,
				InputID:        accepted.Input.ID,
			},
			http.StatusOK,
		)
		switch last.Input.Status {
		case conversation.ConversationInputStatusDispatched:
			return last
		case conversation.ConversationInputStatusFailed,
			conversation.ConversationInputStatusAwaitingClarification:
			t.Fatalf(
				"live conversation router did not resolve the input: failure=%+v state=%+v",
				last.Input.Failure,
				last,
			)
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live conversation route; last state = %+v", last)
	return conversation.ConversationInputRoutingState{}
}

func assertRuntimeLiveConversationRoute(
	t *testing.T,
	before conversation.ConversationSnapshot,
	state conversation.ConversationInputRoutingState,
) {
	t.Helper()
	if len(state.Decisions) != 1 {
		t.Fatalf("live conversation route decisions = %+v", state.Decisions)
	}
	record := state.Decisions[0]
	assertRuntimeLiveConversationRouteDecision(t, record)
	assertRuntimeLiveConversationRouteAudit(t, before, state, record)
}

func assertRuntimeLiveConversationRouteDecision(
	t *testing.T,
	record conversation.ConversationRouteDecisionRecord,
) {
	t.Helper()
	if record.Decision.Kind != conversation.ConversationRouteDecisionKindAnswerAsNarrator ||
		record.Decision.AnswerAsNarrator == nil ||
		strings.TrimSpace(record.Decision.AnswerAsNarrator.Question) == "" ||
		record.ResultingCommand.AnswerAsNarrator == nil {
		t.Fatalf("live conversation route decision = %+v", record)
	}
}

func assertRuntimeLiveConversationRouteAudit(
	t *testing.T,
	before conversation.ConversationSnapshot,
	state conversation.ConversationInputRoutingState,
	record conversation.ConversationRouteDecisionRecord,
) {
	t.Helper()
	audit := record.RouterContext
	allowed := false
	for _, kind := range audit.AllowedDecisionKinds {
		allowed = allowed || kind == conversation.ConversationRouteDecisionKindAnswerAsNarrator
	}
	invocation := record.ResolvedInvocation
	if !allowed || audit.InputSequence != state.Input.Sequence ||
		audit.LatestTrajectorySequence != before.Conversation.LastTrajectorySequence ||
		invocation.Role != conversation.RoleNarrator ||
		invocation.Resolved.ModelID != "gpt-5.4-mini" ||
		invocation.Resolved.PermissionProfile.ToolAccess.Mode != conversation.ToolAccessNone ||
		invocation.ContextUsage.InputBytes <= 0 || invocation.ContextUsage.OutputBytes <= 0 ||
		invocation.Outcome != conversation.InvocationOutcomeSucceeded {
		t.Fatalf("live conversation router audit = context=%+v invocation=%+v", audit, invocation)
	}
}

func assertRuntimeLiveConversationRouteIsolation(
	t *testing.T,
	before conversation.ConversationSnapshot,
	after conversation.ConversationSnapshot,
) {
	t.Helper()
	if after.Conversation.LastTrajectorySequence != before.Conversation.LastTrajectorySequence ||
		len(after.Turns.Turns) != len(before.Turns.Turns) ||
		after.ThreadBinding == nil || before.ThreadBinding == nil ||
		after.ThreadBinding.ThreadID != before.ThreadBinding.ThreadID {
		t.Fatalf("live conversation router mutated topic work: before=%+v after=%+v", before, after)
	}
}

func assertRuntimeLiveNarratorStatus(
	t *testing.T,
	before conversation.ConversationSnapshot,
	after conversation.ConversationSnapshot,
	question string,
) {
	t.Helper()
	beforeIDs := make(map[string]bool, len(before.Narration.Events))
	for _, event := range before.Narration.Events {
		beforeIDs[event.ID] = true
	}
	replies := make([]conversation.NarrationEvent, 0, 1)
	newEventKinds := make([]conversation.NarrationEventKind, 0)
	statusQuestions := make([]string, 0)
	for _, event := range after.Narration.Events {
		if beforeIDs[event.ID] {
			continue
		}
		newEventKinds = append(newEventKinds, event.Kind)
		if event.StatusReply != nil {
			statusQuestions = append(statusQuestions, event.StatusReply.Question)
		}
		if event.Kind != conversation.NarrationEventKindStatusReply ||
			event.StatusReply == nil || event.StatusReply.Question != question {
			continue
		}
		replies = append(replies, event)
	}
	if len(replies) != 1 || strings.TrimSpace(replies[0].StatusReply.Text) == "" {
		t.Fatalf(
			"live narrator matching status replies = %+v, want one; new kinds=%v status questions=%q narrator status=%s degradation=%+v",
			replies,
			newEventKinds,
			statusQuestions,
			after.NarratorState.Status,
			after.NarratorState.Degradation,
		)
	}
	reply := replies[0]
	if reply.ResolvedInvocation.Role != conversation.RoleNarrator ||
		reply.ResolvedInvocation.Resolved.ModelID != "gpt-5.4-mini" {
		t.Fatalf("live narrator invocation = %+v", reply.ResolvedInvocation)
	}
	if after.Conversation.LastTrajectorySequence != before.Conversation.LastTrajectorySequence ||
		len(after.Turns.Turns) != len(before.Turns.Turns) ||
		after.ThreadBinding == nil || before.ThreadBinding == nil ||
		after.ThreadBinding.ThreadID != before.ThreadBinding.ThreadID {
		t.Fatalf("live narrator status mutated topic work: before=%+v after=%+v", before, after)
	}
}

func waitForRuntimeLiveNarratorStatus(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	conversationID string,
	before conversation.ConversationSnapshot,
	question string,
) conversation.ConversationSnapshot {
	t.Helper()
	deadline := time.Now().Add(2 * time.Minute)
	var last conversation.ConversationSnapshot
	for time.Now().Before(deadline) {
		last = postRuntimeJSON[conversation.ConversationSnapshot](
			t,
			client,
			baseURL,
			"/conversations/snapshot/read",
			httpapi.ReadConversationSnapshotRequest{
				WorkspaceID:    workspaceID,
				ConversationID: conversationID,
			},
			http.StatusOK,
		)
		if runtimeLiveHasNewNarratorStatusReply(before, last, question) {
			return last
		}
		if last.NarratorState.Degradation != nil {
			t.Fatalf("live routed narrator status degraded: %+v", *last.NarratorState.Degradation)
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live routed narrator status; last state = %+v", last.NarratorState)
	return conversation.ConversationSnapshot{}
}

func runtimeLiveHasNewNarratorStatusReply(
	before conversation.ConversationSnapshot,
	after conversation.ConversationSnapshot,
	question string,
) bool {
	beforeIDs := make(map[string]bool, len(before.Narration.Events))
	for _, event := range before.Narration.Events {
		beforeIDs[event.ID] = true
	}
	for _, event := range after.Narration.Events {
		if !beforeIDs[event.ID] && event.Kind == conversation.NarrationEventKindStatusReply &&
			event.StatusReply != nil && event.StatusReply.Question == question &&
			strings.TrimSpace(event.StatusReply.Text) != "" {
			return true
		}
	}
	return false
}

func waitForRuntimeLiveTopicTurns(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	conversationID string,
	wantTurns int,
) conversation.ConversationSnapshot {
	t.Helper()
	deadline := time.Now().Add(2 * time.Minute)
	var last conversation.ConversationSnapshot
	for time.Now().Before(deadline) {
		last = postRuntimeJSON[conversation.ConversationSnapshot](t, client, baseURL, "/conversations/snapshot/read", httpapi.ReadConversationSnapshotRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
		}, http.StatusOK)
		if len(last.Turns.Turns) == wantTurns {
			latest := last.Turns.Turns[len(last.Turns.Turns)-1]
			terminal := latest.Status == conversation.TurnStatusCompleted ||
				latest.Status == conversation.TurnStatusFailed ||
				latest.Status == conversation.TurnStatusCancelled
			if terminal && runtimeTopicHasFinalNarration(last, latest.ID) &&
				last.NarratorState.ObservedThroughSequence == last.Conversation.LastTrajectorySequence {
				return last
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %d live topic turns; last snapshot = %+v", wantTurns, last)
	return conversation.ConversationSnapshot{}
}

func runtimeTopicTrajectoryHasCompletedText(
	snapshot conversation.ConversationSnapshot,
	turnID string,
	expected string,
) bool {
	for _, event := range snapshot.Trajectory.Events {
		if event.TurnID == nil || *event.TurnID != turnID || event.AgentMessageCompleted == nil {
			continue
		}
		if strings.Contains(event.AgentMessageCompleted.Text, expected) {
			return true
		}
	}
	return false
}

func runtimeTopicHasFinalNarration(snapshot conversation.ConversationSnapshot, turnID string) bool {
	for _, event := range snapshot.Narration.Events {
		if event.Kind != conversation.NarrationEventKindFinalSummary || event.TurnID == nil ||
			*event.TurnID != turnID || event.FinalSummary == nil {
			continue
		}
		return strings.TrimSpace(event.FinalSummary.Text) != "" &&
			event.ResolvedInvocation.Role == conversation.RoleNarrator &&
			event.ResolvedInvocation.Resolved.ModelID == "gpt-5.4-mini"
	}
	return false
}

func TestBackendAppWorkflowWithLiveCodex(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 30*time.Second)
	baseURL := "http://" + server.Addr()

	health := getRuntimeJSON[httpapi.BackendHealth](t, client, baseURL, "/health")
	if !health.OK || health.Name != httpapi.BackendName {
		t.Fatalf("health = %+v, want healthy backend", health)
	}
	_ = getRuntimeJSON[workspacesession.WorkspaceSession](t, client, baseURL, "/workspace-session")

	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	conversation := postRuntimeJSON[chat.Conversation](t, client, baseURL, "/chat/conversations/create", httpapi.CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)

	list := postRuntimeJSON[httpapi.ListConversationsResponse](t, client, baseURL, "/chat/conversations/list", httpapi.ListConversationsRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if len(list.Conversations) != 1 || list.Conversations[0].Conversation.ID != conversation.ID {
		t.Fatalf("conversation list = %+v, want newly created conversation", list.Conversations)
	}

	page := postRuntimeJSON[chat.MessagePage](t, client, baseURL, "/chat/messages/page", httpapi.GetMessagePageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Limit:          40,
	}, http.StatusOK)
	if len(page.Messages) != 0 {
		t.Fatalf("new conversation message count = %d, want 0", len(page.Messages))
	}

	active := postRuntimeJSON[httpapi.GetActiveRunResponse](t, client, baseURL, "/chat/runs/active", httpapi.GetActiveRunRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	if active.HasActiveRun {
		t.Fatalf("new conversation has active run: %+v", active.Run)
	}

	result := postRuntimeJSON[chat.SendMessageResult](t, client, baseURL, "/chat/messages/send", httpapi.SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Input:          chat.TextChatInput("hello"),
	}, http.StatusOK)
	defer cancelRuntimeActiveRunBestEffort(client, baseURL, opened.Workspace.ID, conversation.ID)

	if result.UserMessage.Role != chat.RoleUser || result.AssistantMessage.Role != chat.RoleAssistant {
		t.Fatalf("send result roles = %q/%q, want user/assistant", result.UserMessage.Role, result.AssistantMessage.Role)
	}
	if result.Run.Status != chat.RunStatusRunning {
		t.Fatalf("initial run status = %q, want running", result.Run.Status)
	}

	queued := postRuntimeJSON[chat.QueueMessageResult](t, client, baseURL, "/chat/messages/queue", httpapi.QueueChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Input:          chat.TextChatInput("write one short sentence about queueing work"),
	}, http.StatusOK)
	if queued.UserMessage.Role != chat.RoleUser || queued.UserMessage.Delivery != chat.MessageDeliveryQueued {
		t.Fatalf("queued message = %+v, want queued user message", queued.UserMessage)
	}
	if queued.Run.Status != chat.RunStatusQueued && queued.Run.Status != chat.RunStatusRunning {
		t.Fatalf("queued run status = %q, want queued or running", queued.Run.Status)
	}

	page = waitForRuntimeLiveCodexReply(t, client, baseURL, config.AppDataDir, opened.Workspace.ID, conversation.ID, result.Run.ID)
	if len(page.Messages) < 3 {
		t.Fatalf("message count = %d, want at least 3 after queueing", len(page.Messages))
	}
	if text := strings.TrimSpace(runtimeMessageText(t, page.Messages[1])); text == "" {
		t.Fatal("assistant reply was empty")
	}

	page = waitForRuntimeLiveCodexReply(t, client, baseURL, config.AppDataDir, opened.Workspace.ID, conversation.ID, queued.Run.ID)
	if len(page.Messages) != 4 {
		t.Fatalf("message count after queued turn = %d, want 4", len(page.Messages))
	}
	if text := strings.TrimSpace(runtimeMessageText(t, page.Messages[3])); text == "" {
		t.Fatal("queued assistant reply was empty")
	}
	assertRuntimeLiveCodexDurableState(t, config.AppDataDir, opened.Workspace.ID, conversation.ID)
	assertRuntimeNoCriticalDiagnostics(t, config.AppDataDir)
}

func TestBackendLiveCodexRunLivenessReconcileDuringActiveTurn(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 30*time.Second)
	baseURL := "http://" + server.Addr()

	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	conversation := postRuntimeJSON[chat.Conversation](t, client, baseURL, "/chat/conversations/create", httpapi.CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)

	const liveCommand = "sleep 12; pwd"
	const smokePhrase = "setta live liveness reconciliation smoke"
	prompt := fmt.Sprintf("Run the shell command `%s`, then reply with one short sentence containing the exact phrase %s.", liveCommand, smokePhrase)
	result := postRuntimeJSON[chat.SendMessageResult](t, client, baseURL, "/chat/messages/send", httpapi.SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Input:          chat.TextChatInput(prompt),
	}, http.StatusOK)
	defer cancelRuntimeActiveRunBestEffort(client, baseURL, opened.Workspace.ID, conversation.ID)

	if result.Run.Status != chat.RunStatusRunning {
		t.Fatalf("initial run status = %q, want running", result.Run.Status)
	}
	waitForRuntimeLiveCodexCommandRunning(t, client, baseURL, opened.Workspace.ID, result.Run.ID)

	liveness := waitForRuntimeLiveCodexReconcileStatus(t, client, baseURL, opened.Workspace.ID, conversation.ID, result.Run.ID, chat.RunLivenessReconciling)
	if liveness.Reason != chat.RunLivenessReasonWakeRecheck {
		t.Fatalf("reconciled liveness reason = %q, want %q: %+v", liveness.Reason, chat.RunLivenessReasonWakeRecheck, liveness)
	}
	if !liveness.Retryable || !liveness.Cancellable {
		t.Fatalf("reconciled liveness retryable/cancellable = %t/%t, want true/true: %+v", liveness.Retryable, liveness.Cancellable, liveness)
	}
	if liveness.ProviderThreadID == "" || liveness.ProviderTurnID == "" {
		t.Fatalf("reconciled liveness missing provider refs: %+v", liveness)
	}

	page := waitForRuntimeLiveCodexReply(t, client, baseURL, config.AppDataDir, opened.Workspace.ID, conversation.ID, result.Run.ID)
	if text := strings.TrimSpace(runtimeMessageText(t, page.Messages[len(page.Messages)-1])); !strings.Contains(text, smokePhrase) {
		t.Fatalf("assistant reply = %q, want phrase %q", text, smokePhrase)
	}
	active := postRuntimeJSON[httpapi.GetActiveRunResponse](t, client, baseURL, "/chat/runs/active", httpapi.GetActiveRunRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	if active.HasActiveRun {
		t.Fatalf("active run remained after live liveness workflow: %+v", active)
	}
	assertRuntimeNoCriticalDiagnostics(t, config.AppDataDir)
}

func TestBackendLiveCodexSilentUpstreamLossReconciliation(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	proxy := startRuntimeLiveCodexBlackholeProxy(t)
	setRuntimeEnv(t, map[string]string{
		"HTTPS_PROXY": proxy.URL(),
		"https_proxy": proxy.URL(),
		"ALL_PROXY":   proxy.URL(),
		"all_proxy":   proxy.URL(),
		"NO_PROXY":    "127.0.0.1,localhost,::1",
		"no_proxy":    "127.0.0.1,localhost,::1",
	})

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 30*time.Second)
	baseURL := "http://" + server.Addr()

	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	conversation := postRuntimeJSON[chat.Conversation](t, client, baseURL, "/chat/conversations/create", httpapi.CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)

	const liveCommand = "sleep 8; pwd"
	const smokePhrase = "setta silent upstream loss smoke"
	prompt := fmt.Sprintf("Run the shell command `%s`, then reply with one short sentence containing the exact phrase %s.", liveCommand, smokePhrase)
	result := postRuntimeJSON[chat.SendMessageResult](t, client, baseURL, "/chat/messages/send", httpapi.SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Input:          chat.TextChatInput(prompt),
	}, http.StatusOK)
	defer cancelRuntimeActiveRunBestEffort(client, baseURL, opened.Workspace.ID, conversation.ID)

	if result.Run.Status != chat.RunStatusRunning {
		t.Fatalf("initial run status = %q, want running", result.Run.Status)
	}
	waitForRuntimeLiveCodexCommandRunning(t, client, baseURL, opened.Workspace.ID, result.Run.ID)
	if !proxy.WaitForTunnel(10 * time.Second) {
		t.Skip("Codex app-server did not route upstream traffic through the live test proxy; silent upstream loss is not feasible in this environment")
	}

	proxy.Blackhole()
	waitForRuntimeLiveCodexCommandStatus(t, client, baseURL, opened.Workspace.ID, result.Run.ID, chat.RunItemStatusCompleted)

	liveness := waitForRuntimeLiveCodexReconcileStatus(t, client, baseURL, opened.Workspace.ID, conversation.ID, result.Run.ID, chat.RunLivenessReconciling)
	if liveness.Reason != chat.RunLivenessReasonWakeRecheck {
		t.Fatalf("reconciled liveness reason = %q, want %q: %+v", liveness.Reason, chat.RunLivenessReasonWakeRecheck, liveness)
	}
	if !liveness.Retryable || !liveness.Cancellable {
		t.Fatalf("reconciled liveness retryable/cancellable = %t/%t, want true/true: %+v", liveness.Retryable, liveness.Cancellable, liveness)
	}
	if liveness.ProviderThreadID == "" || liveness.ProviderTurnID == "" {
		t.Fatalf("reconciled liveness missing provider refs: %+v", liveness)
	}
	assertRuntimeLiveCodexRunStillReconciling(t, client, baseURL, opened.Workspace.ID, conversation.ID, result.Run.ID, 3*time.Second)

	cancelled := postRuntimeJSON[chat.Run](t, client, baseURL, "/chat/runs/cancel", httpapi.CancelRunRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	if cancelled.Status != chat.RunStatusCancelled {
		t.Fatalf("cancelled run status = %q, want cancelled", cancelled.Status)
	}
	waitForRuntimeNoActiveRun(t, client, baseURL, opened.Workspace.ID, conversation.ID)
	assertRuntimeNoCriticalDiagnostics(t, config.AppDataDir)
}

func TestBackendLiveCodexStaleTurnInterruptRegression(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 30*time.Second)
	baseURL := "http://" + server.Addr()

	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	conversation := postRuntimeJSON[chat.Conversation](t, client, baseURL, "/chat/conversations/create", httpapi.CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)

	const liveCommand = "sleep 20; pwd"
	prompt := fmt.Sprintf("Run the shell command `%s`, then reply with one short sentence.", liveCommand)
	result := postRuntimeJSON[chat.SendMessageResult](t, client, baseURL, "/chat/messages/send", httpapi.SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Input:          chat.TextChatInput(prompt),
	}, http.StatusOK)
	defer cancelRuntimeActiveRunBestEffort(client, baseURL, opened.Workspace.ID, conversation.ID)

	if result.Run.Status != chat.RunStatusRunning {
		t.Fatalf("initial run status = %q, want running", result.Run.Status)
	}
	waitForRuntimeLiveCodexCommandRunning(t, client, baseURL, opened.Workspace.ID, result.Run.ID)
	liveness := waitForRuntimeLiveCodexReconcileStatus(t, client, baseURL, opened.Workspace.ID, conversation.ID, result.Run.ID, chat.RunLivenessReconciling)
	if liveness.ProviderThreadID == "" || liveness.ProviderTurnID == "" {
		t.Fatalf("reconciled liveness missing provider refs: %+v", liveness)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	_, err := server.codexManager.Call(ctx, codexapp.CodexMethodTurnInterrupt, codexapp.TurnInterruptParams{
		ThreadID: liveness.ProviderThreadID,
		TurnID:   liveness.ProviderTurnID + "_stale",
	})
	cancel()
	if err == nil {
		t.Fatal("turn/interrupt with stale live Codex turn id succeeded")
	}
	var rpcErr *codexapp.RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("stale turn/interrupt error = %T %[1]v, want codex RPC error", err)
	}
	if rpcErr.Code != -32600 {
		t.Fatalf("stale turn/interrupt RPC code = %d, want -32600", rpcErr.Code)
	}
	if len(rpcErr.Data) != 0 {
		t.Fatalf("stale turn/interrupt RPC data = %s, want absent typed active turn data", string(rpcErr.Data))
	}

	active := postRuntimeJSON[httpapi.GetActiveRunResponse](t, client, baseURL, "/chat/runs/active", httpapi.GetActiveRunRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	if !active.HasActiveRun || active.Run == nil || active.Run.ID != result.Run.ID {
		t.Fatalf("active run after stale interrupt = %+v, want original active run", active)
	}

	cancelled := postRuntimeJSON[chat.Run](t, client, baseURL, "/chat/runs/cancel", httpapi.CancelRunRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	if cancelled.Status != chat.RunStatusCancelled {
		t.Fatalf("cancelled run status = %q, want cancelled", cancelled.Status)
	}
	waitForRuntimeNoActiveRun(t, client, baseURL, opened.Workspace.ID, conversation.ID)
	assertRuntimeNoCriticalDiagnostics(t, config.AppDataDir)
}

func waitForRuntimeLiveCodexReply(t *testing.T, client *http.Client, baseURL string, appDataDir string, workspaceID string, conversationID string, runID string) chat.MessagePage {
	t.Helper()

	deadline := time.Now().Add(90 * time.Second)
	var lastPage chat.MessagePage
	for time.Now().Before(deadline) {
		page := postRuntimeJSON[chat.MessagePage](t, client, baseURL, "/chat/messages/page", httpapi.GetMessagePageRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			Limit:          40,
		}, http.StatusOK)
		lastPage = page
		for _, message := range page.Messages {
			if message.RunID != runID || message.Role != chat.RoleAssistant {
				continue
			}
			switch message.Status {
			case chat.MessageStatusError:
				t.Fatalf("assistant message failed; %s", runtimeRunStateForFailure(appDataDir, workspaceID, runID))
			case chat.MessageStatusComplete:
				if strings.TrimSpace(runtimeMessageText(t, message)) == "" {
					t.Fatalf("assistant completed with an empty reply; %s", runtimeRunStateForFailure(appDataDir, workspaceID, runID))
				}
				return page
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live codex reply; %s; last page = %+v", runtimeRunStateForFailure(appDataDir, workspaceID, runID), lastPage)
	return chat.MessagePage{}
}

func waitForRuntimeLiveCodexCommandRunning(t *testing.T, client *http.Client, baseURL string, workspaceID string, runID string) chat.RunActivityPage {
	t.Helper()
	return waitForRuntimeLiveCodexCommandStatus(t, client, baseURL, workspaceID, runID, chat.RunItemStatusRunning)
}

func waitForRuntimeLiveCodexCommandStatus(t *testing.T, client *http.Client, baseURL string, workspaceID string, runID string, status chat.RunItemStatus) chat.RunActivityPage {
	t.Helper()

	deadline := time.Now().Add(90 * time.Second)
	var lastPage chat.RunActivityPage
	for time.Now().Before(deadline) {
		page := postRuntimeJSON[chat.RunActivityPage](t, client, baseURL, "/chat/runs/activity", httpapi.GetRunActivityRequest{
			WorkspaceID: workspaceID,
			RunID:       runID,
			Limit:       100,
		}, http.StatusOK)
		lastPage = page
		for _, item := range page.Items {
			if item.Type == chat.RunItemTypeCommandExecution && item.Status == status {
				return page
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live Codex command execution status %q; last activity = %+v", status, lastPage)
	return chat.RunActivityPage{}
}

func waitForRuntimeLiveCodexReconcileStatus(t *testing.T, client *http.Client, baseURL string, workspaceID string, conversationID string, runID string, status chat.RunLivenessStatus) chat.RunLiveness {
	t.Helper()

	deadline := time.Now().Add(15 * time.Second)
	var lastResult httpapi.ReconcileChatRunsResponse
	for time.Now().Before(deadline) {
		result := postRuntimeJSON[httpapi.ReconcileChatRunsResponse](t, client, baseURL, "/chat/runs/reconcile", httpapi.ReconcileChatRunsRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			Reason:         chat.RunLivenessReasonWakeRecheck,
		}, http.StatusOK)
		lastResult = result
		for _, liveness := range result.Result.Runs {
			if liveness.RunID == runID && liveness.Status == status {
				return liveness
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live Codex liveness %q; last reconcile result = %+v", status, lastResult)
	return chat.RunLiveness{}
}

func waitForRuntimeNoActiveRun(t *testing.T, client *http.Client, baseURL string, workspaceID string, conversationID string) {
	t.Helper()

	deadline := time.Now().Add(15 * time.Second)
	var lastActive httpapi.GetActiveRunResponse
	for time.Now().Before(deadline) {
		active := postRuntimeJSON[httpapi.GetActiveRunResponse](t, client, baseURL, "/chat/runs/active", httpapi.GetActiveRunRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
		}, http.StatusOK)
		lastActive = active
		if !active.HasActiveRun {
			return
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for active run to clear; last active = %+v", lastActive)
}

func assertRuntimeLiveCodexRunStillReconciling(t *testing.T, client *http.Client, baseURL string, workspaceID string, conversationID string, runID string, duration time.Duration) {
	t.Helper()

	deadline := time.Now().Add(duration)
	for time.Now().Before(deadline) {
		active := postRuntimeJSON[httpapi.GetActiveRunResponse](t, client, baseURL, "/chat/runs/active", httpapi.GetActiveRunRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
		}, http.StatusOK)
		if !active.HasActiveRun || active.Run == nil || active.Run.ID != runID {
			t.Fatalf("active run during upstream blackhole = %+v, want run %s still active", active, runID)
		}
		if active.Liveness == nil || active.Liveness.Status != chat.RunLivenessReconciling {
			t.Fatalf("active run liveness during upstream blackhole = %+v, want reconciling", active.Liveness)
		}
		time.Sleep(250 * time.Millisecond)
	}
}

func getRuntimeJSON[T any](t *testing.T, client *http.Client, baseURL string, path string) T {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, baseURL+path, nil)
	if err != nil {
		t.Fatalf("create GET %s: %v", path, err)
	}
	return doRuntimeJSON[T](t, client, request, http.StatusOK)
}

func postRuntimeJSON[T any](t *testing.T, client *http.Client, baseURL string, path string, payload any, wantStatus int) T {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal %s payload: %v", path, err)
	}
	request, err := http.NewRequest(http.MethodPost, baseURL+path, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("create POST %s: %v", path, err)
	}
	request.Header.Set("Content-Type", "application/json")
	return doRuntimeJSON[T](t, client, request, wantStatus)
}

func doRuntimeJSON[T any](t *testing.T, client *http.Client, request *http.Request, wantStatus int) T {
	t.Helper()

	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("%s %s: %v", request.Method, request.URL.Path, err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read %s response: %v", request.URL.Path, err)
	}
	if response.StatusCode != wantStatus {
		t.Fatalf("%s status = %d, want %d, body: %s", request.URL.Path, response.StatusCode, wantStatus, string(body))
	}
	var decoded T
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatalf("decode %s response: %v; body: %s", request.URL.Path, err, string(body))
	}
	return decoded
}

func cancelRuntimeActiveRunBestEffort(client *http.Client, baseURL string, workspaceID string, conversationID string) {
	body, _ := json.Marshal(httpapi.CancelRunRequest{
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
	})
	request, err := http.NewRequest(http.MethodPost, baseURL+"/chat/runs/cancel", bytes.NewReader(body))
	if err != nil {
		return
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return
	}
	_ = response.Body.Close()
}

func runtimeMessageText(t *testing.T, message chat.ChatMessage) string {
	t.Helper()

	parts := make([]string, 0, len(message.Parts))
	for _, part := range message.Parts {
		switch part.Type {
		case chat.MessagePartText:
			if part.Text == nil {
				t.Fatalf("message %s text part %s has nil text payload", message.ID, part.ID)
			}
			parts = append(parts, part.Text.Text)
		case chat.MessagePartImage:
		default:
			t.Fatalf("message %s part %s has unsupported type %q", message.ID, part.ID, part.Type)
		}
	}
	return strings.Join(parts, "")
}

func runtimeRunStateForFailure(appDataDir string, workspaceID string, runID string) string {
	path := filepath.Join(appDataDir, "workspaces", workspaceID, "runs", runID+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("read run state %s: %v", path, err)
	}
	var run chat.Run
	if err := json.Unmarshal(data, &run); err != nil {
		return fmt.Sprintf("decode run state %s: %v", path, err)
	}
	if run.Error != "" {
		return fmt.Sprintf("run status = %s, error = %s", run.Status, run.Error)
	}
	return fmt.Sprintf("run status = %s", run.Status)
}

func assertRuntimeLiveCodexDurableState(t *testing.T, appDataDir string, workspaceID string, conversationID string) {
	t.Helper()

	store, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("open chat store: %v", err)
	}
	page, err := store.LoadMessagePage(workspaceID, conversationID, 0, 40)
	if err != nil {
		t.Fatalf("load durable message page: %v", err)
	}
	if len(page.Messages) != 4 {
		t.Fatalf("durable message count = %d, want 4", len(page.Messages))
	}
	if strings.TrimSpace(runtimeMessageText(t, page.Messages[1])) == "" ||
		strings.TrimSpace(runtimeMessageText(t, page.Messages[3])) == "" {
		t.Fatalf("durable assistant messages must be non-empty: %+v", page.Messages)
	}
}

func assertRuntimeNoCriticalDiagnostics(t *testing.T, appDataDir string) {
	t.Helper()

	store, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("open chat store for diagnostics: %v", err)
	}
	diagnostics, err := store.ListDiagnostics()
	if err != nil {
		t.Fatalf("list diagnostics: %v", err)
	}
	for _, diagnostic := range diagnostics {
		if diagnostic.Severity == chat.DiagnosticSeverityCritical {
			t.Fatalf("critical diagnostic recorded during live Codex workflow: %+v", diagnostic)
		}
	}
}

func requireRuntimeLiveCodexChatGPTAuth(t *testing.T) {
	t.Helper()

	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: "codex",
			Args:    []string{"app-server", "--listen", "stdio://"},
		},
		InitializeParams: map[string]any{
			"clientInfo": map[string]any{
				"name":    "setta-live-test",
				"title":   "Setta Live Test",
				"version": "dev",
			},
		},
	})
	defer func() {
		if err := manager.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown live Codex account manager: %v", err)
		}
	}()
	service, err := codexaccount.NewService(manager, nil)
	if err != nil {
		t.Fatalf("create Codex account service: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	state, err := service.Read(ctx)
	if err != nil {
		t.Fatalf("read Codex account: %v", err)
	}
	if state.Status == codexaccount.AccountStatusUnavailable {
		t.Skipf("Codex ChatGPT auth is unavailable: %s", state.Diagnostic)
	}
	if state.Account == nil {
		t.Skip("Codex ChatGPT auth is not signed in")
	}
	switch state.Account.Type {
	case codexaccount.AccountTypeChatGPT, codexaccount.AccountTypeChatGPTAuthTokens:
		return
	case codexaccount.AccountTypeAPIKey:
		t.Skip("Codex is signed in with API-key auth; ChatGPT auth is required")
	default:
		t.Skipf("Codex account type %s is not supported for live tests", state.Account.Type)
	}
}

type runtimeLiveCodexBlackholeProxy struct {
	listener net.Listener
	done     chan struct{}

	mu         sync.Mutex
	blackholed bool
	tunnels    map[*runtimeLiveCodexProxyTunnel]struct{}

	firstTunnel     chan struct{}
	firstTunnelOnce sync.Once
}

type runtimeLiveCodexProxyTunnel struct {
	blackhole chan struct{}
}

func startRuntimeLiveCodexBlackholeProxy(t *testing.T) *runtimeLiveCodexBlackholeProxy {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen for live Codex proxy: %v", err)
	}
	proxy := &runtimeLiveCodexBlackholeProxy{
		listener:    listener,
		done:        make(chan struct{}),
		tunnels:     map[*runtimeLiveCodexProxyTunnel]struct{}{},
		firstTunnel: make(chan struct{}),
	}
	go proxy.acceptLoop()
	t.Cleanup(proxy.Close)
	return proxy
}

func (proxy *runtimeLiveCodexBlackholeProxy) URL() string {
	return "http://" + proxy.listener.Addr().String()
}

func (proxy *runtimeLiveCodexBlackholeProxy) WaitForTunnel(timeout time.Duration) bool {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-proxy.firstTunnel:
		return true
	case <-timer.C:
		return false
	case <-proxy.done:
		return false
	}
}

func (proxy *runtimeLiveCodexBlackholeProxy) Blackhole() {
	proxy.mu.Lock()
	defer proxy.mu.Unlock()

	proxy.blackholed = true
	for tunnel := range proxy.tunnels {
		closeTunnelBlackhole(tunnel)
	}
}

func (proxy *runtimeLiveCodexBlackholeProxy) Close() {
	select {
	case <-proxy.done:
		return
	default:
		close(proxy.done)
		_ = proxy.listener.Close()
	}
}

func (proxy *runtimeLiveCodexBlackholeProxy) acceptLoop() {
	for {
		conn, err := proxy.listener.Accept()
		if err != nil {
			return
		}
		go proxy.handle(conn)
	}
}

func (proxy *runtimeLiveCodexBlackholeProxy) handle(client net.Conn) {
	defer client.Close()

	reader := bufio.NewReader(client)
	request, err := http.ReadRequest(reader)
	if err != nil {
		return
	}
	if request.Body != nil {
		_ = request.Body.Close()
	}
	if request.Method != http.MethodConnect {
		_, _ = io.WriteString(client, "HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n")
		return
	}

	upstream, err := net.DialTimeout("tcp", request.Host, 10*time.Second)
	if err != nil {
		_, _ = io.WriteString(client, "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")
		return
	}
	defer upstream.Close()
	if _, err := io.WriteString(client, "HTTP/1.1 200 Connection Established\r\n\r\n"); err != nil {
		return
	}

	tunnel := proxy.registerTunnel()
	defer proxy.unregisterTunnel(tunnel)

	errc := make(chan struct{}, 2)
	go copyRuntimeLiveCodexProxyTunnel(errc, upstream, reader, tunnel.blackhole)
	go copyRuntimeLiveCodexProxyTunnel(errc, client, upstream, tunnel.blackhole)

	select {
	case <-errc:
	case <-tunnel.blackhole:
		<-proxy.done
	case <-proxy.done:
	}
}

func (proxy *runtimeLiveCodexBlackholeProxy) registerTunnel() *runtimeLiveCodexProxyTunnel {
	tunnel := &runtimeLiveCodexProxyTunnel{blackhole: make(chan struct{})}

	proxy.mu.Lock()
	proxy.tunnels[tunnel] = struct{}{}
	blackholed := proxy.blackholed
	proxy.mu.Unlock()

	proxy.firstTunnelOnce.Do(func() {
		close(proxy.firstTunnel)
	})
	if blackholed {
		closeTunnelBlackhole(tunnel)
	}
	return tunnel
}

func (proxy *runtimeLiveCodexBlackholeProxy) unregisterTunnel(tunnel *runtimeLiveCodexProxyTunnel) {
	proxy.mu.Lock()
	defer proxy.mu.Unlock()
	delete(proxy.tunnels, tunnel)
}

func closeTunnelBlackhole(tunnel *runtimeLiveCodexProxyTunnel) {
	select {
	case <-tunnel.blackhole:
	default:
		close(tunnel.blackhole)
	}
}

func copyRuntimeLiveCodexProxyTunnel(done chan<- struct{}, dst net.Conn, src io.Reader, blackhole <-chan struct{}) {
	buf := make([]byte, 32*1024)
	for {
		select {
		case <-blackhole:
			return
		default:
		}
		if conn, ok := src.(net.Conn); ok {
			_ = conn.SetReadDeadline(time.Now().Add(250 * time.Millisecond))
		}
		n, err := src.Read(buf)
		if n > 0 {
			select {
			case <-blackhole:
				return
			default:
			}
			_ = dst.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, writeErr := dst.Write(buf[:n]); writeErr != nil {
				done <- struct{}{}
				return
			}
		}
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			done <- struct{}{}
			return
		}
	}
}

func setRuntimeEnv(t *testing.T, values map[string]string) {
	t.Helper()

	for name, value := range values {
		previous, ok := os.LookupEnv(name)
		if err := os.Setenv(name, value); err != nil {
			t.Fatalf("set %s: %v", name, err)
		}
		t.Cleanup(func() {
			if ok {
				if err := os.Setenv(name, previous); err != nil {
					t.Fatalf("restore %s: %v", name, err)
				}
				return
			}
			if err := os.Unsetenv(name); err != nil {
				t.Fatalf("restore unset %s: %v", name, err)
			}
		})
	}
}

func unsetRuntimeEnv(t *testing.T, names ...string) {
	t.Helper()

	for _, name := range names {
		value, ok := os.LookupEnv(name)
		if err := os.Unsetenv(name); err != nil {
			t.Fatalf("unset %s: %v", name, err)
		}
		t.Cleanup(func() {
			if ok {
				if err := os.Setenv(name, value); err != nil {
					t.Fatalf("restore %s: %v", name, err)
				}
				return
			}
			if err := os.Unsetenv(name); err != nil {
				t.Fatalf("restore unset %s: %v", name, err)
			}
		})
	}
}
