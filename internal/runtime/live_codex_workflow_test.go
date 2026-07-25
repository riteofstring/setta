package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/conversation"
	"setta/internal/director"
	"setta/internal/httpapi"
	"setta/internal/master"
)

func TestBackendDirectorCommandCenterWithLiveCodex(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 3*time.Minute)
	baseURL := "http://" + server.Addr()
	postRuntimeJSON[httpapi.OpenWorkspaceResponse](
		t,
		client,
		baseURL,
		"/workspaces/open",
		httpapi.OpenWorkspaceRequest{RootPath: t.TempDir()},
		http.StatusOK,
	)
	receipt := postRuntimeJSON[director.DirectorReceipt](
		t,
		client,
		baseURL,
		"/director/intents/dispatch",
		httpapi.DispatchDirectorIntentRequest{Intent: director.DirectorIntent{
			Kind: director.DirectorIntentSubmit,
			Submit: &director.DirectorSubmitIntent{
				Text: "Answer this request directly with exactly DIRECTOR_LIVE_OK and no other text. " +
					"Do not create or select a workstream and do not start work.",
				Modality: director.DecisionIntentModalityText,
			},
		}},
		http.StatusOK,
	)
	if receipt.Submit == nil ||
		receipt.Submit.Decision == nil ||
		*receipt.Submit.Decision != director.DirectorDecisionAnswerDirectly ||
		strings.TrimSpace(receipt.Submit.PublicText) != "DIRECTOR_LIVE_OK" {
		encoded, err := json.MarshalIndent(receipt, "", "  ")
		if err != nil {
			t.Fatalf("encode invalid live Director receipt: %v", err)
		}
		t.Fatalf("live Director receipt = %s", encoded)
	}
}

func TestBackendTopicConversationWorkflowWithLiveCodex(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 3*time.Minute)
	baseURL := "http://" + server.Addr()
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	workspaceID := opened.Workspace.ID
	created := postRuntimeJSON[conversation.ConversationSnapshot](t, client, baseURL, "/conversations/create", httpapi.CreateTopicConversationRequest{
		WorkspaceID: &workspaceID,
		Title:       "Live topic conversation",
	}, http.StatusOK)
	if created.ThreadBinding != nil {
		t.Fatalf("created live topic eagerly linked provider thread: %+v", created.ThreadBinding)
	}

	var latestSnapshot conversation.ConversationSnapshot
	providerThreadID := ""
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
			t.Fatalf("live topic turn %d status = %s error=%+v, want completed", index+1, latestTurn.Status, latestTurn.Error)
		}
		if !runtimeTopicTrajectoryHasCompletedText(snapshot, latestTurn.ID, task.expected) {
			t.Fatalf("live topic turn %s has no completed public agent text containing %s", latestTurn.ID, task.expected)
		}
		if !runtimeTopicHasFinalNarration(snapshot, latestTurn.ID) {
			t.Fatalf("live topic turn %s has no automatic narrator final summary", latestTurn.ID)
		}
		if snapshot.ThreadBinding == nil || snapshot.ThreadBinding.ThreadID == "" {
			t.Fatalf("live topic turn %d has no provider thread binding: %+v", index+1, snapshot.ThreadBinding)
		}
		if providerThreadID == "" {
			providerThreadID = snapshot.ThreadBinding.ThreadID
		} else if snapshot.ThreadBinding.ThreadID != providerThreadID {
			t.Fatalf("live topic provider thread changed across turns: before=%s after=%+v", providerThreadID, snapshot.ThreadBinding)
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

func TestBackendTopicConversationArtifactWithLiveCodex(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	const expectedTableTitle = "Language line counts"

	config := testConfig(t)
	config.Version = "test"
	server, ready := startRuntimeTestServer(t, config)
	defer shutdownServer(t, server)

	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 3*time.Minute)
	baseURL := "http://" + server.Addr()
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	created := createRuntimeLiveTopic(t, client, baseURL, opened.Workspace.ID, "Live structured artifact")
	accepted := submitRuntimeLiveConversationInput(
		t,
		client,
		baseURL,
		created.Conversation.ID,
		"live-topic-artifact-table-first-turn",
		fmt.Sprintf("Using only this supplied dataset: Go=34, TypeScript=21, CSS=8. Create a durable user-facing table titled %s with columns language and lines, and one row per supplied language. Final prose should only confirm that the table is ready.", expectedTableTitle),
	)
	route := waitForRuntimeLiveConversationRoute(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		accepted,
	)
	requireRuntimeLiveRouteKind(t, route, conversation.ConversationRouteDecisionKindSendToParent)
	snapshot := waitForRuntimeLiveTopicTurns(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		1,
	)
	latestTurn := latestRuntimeLiveTurn(t, snapshot)
	if latestTurn.Status != conversation.TurnStatusCompleted {
		t.Fatalf("live structured table turn status = %s error=%+v, want completed", latestTurn.Status, latestTurn.Error)
	}
	metadata := runtimeLiveTableArtifactMetadataForTurn(t, snapshot, latestTurn.ID)
	artifact := postRuntimeJSON[conversation.Artifact](
		t,
		client,
		baseURL,
		"/conversations/artifacts/read",
		httpapi.ReadConversationArtifactRequest{
			WorkspaceID:    opened.Workspace.ID,
			ConversationID: created.Conversation.ID,
			ArtifactID:     metadata.ID,
		},
		http.StatusOK,
	)
	assertRuntimeLiveTableArtifact(t, latestTurn.ID, expectedTableTitle, metadata, artifact)
}

func waitForRuntimeLiveMasterRoute(
	t *testing.T,
	client *http.Client,
	baseURL string,
	inputID string,
) master.InputRoutingState {
	t.Helper()
	request := httpapi.ReadMasterInputRoutingStateRequest{InputID: inputID}
	interaction := postRuntimeJSON[master.ShellInteractionState](
		t,
		client,
		baseURL,
		"/master/interaction/wait",
		request,
		http.StatusOK,
	)
	state := postRuntimeJSON[master.InputRoutingState](
		t,
		client,
		baseURL,
		"/master/inputs/state/read",
		request,
		http.StatusOK,
	)
	if interaction.Status != state.Status {
		t.Fatalf("live master shell status = %s, routing status = %s", interaction.Status, state.Status)
	}
	switch state.Status {
	case master.InputRoutingStatusDecided:
		return state
	case master.InputRoutingStatusCancelled, master.InputRoutingStatusFailed:
		t.Fatalf("live master route did not complete: %+v", state)
	default:
		t.Fatalf("live master route wait returned unsettled state: %+v", state)
	}
	return master.InputRoutingState{}
}

func runtimeLiveTableArtifactMetadataForTurn(
	t *testing.T,
	snapshot conversation.ConversationSnapshot,
	turnID string,
) conversation.ArtifactMetadata {
	t.Helper()
	var matches []conversation.ArtifactMetadata
	for _, artifact := range snapshot.Artifacts.Artifacts {
		if artifact.Kind == conversation.ArtifactKindTable && artifact.TurnID != nil && *artifact.TurnID == turnID {
			matches = append(matches, artifact)
		}
	}
	if len(matches) != 1 {
		t.Fatalf("live turn %s table artifact metadata count = %d, want 1; artifacts=%+v", turnID, len(matches), snapshot.Artifacts)
	}
	return matches[0]
}

func assertRuntimeLiveTableArtifact(
	t *testing.T,
	turnID string,
	expectedTitle string,
	metadata conversation.ArtifactMetadata,
	artifact conversation.Artifact,
) {
	t.Helper()
	if metadata.TurnID == nil || *metadata.TurnID != turnID ||
		artifact.TurnID == nil || *artifact.TurnID != turnID {
		t.Fatalf("live table artifact turn IDs: want %s metadata=%+v artifact=%+v", turnID, metadata, artifact)
	}
	if metadata.ID != artifact.ID ||
		metadata.ConversationID != artifact.ConversationID ||
		metadata.Kind != artifact.Kind ||
		metadata.Title != artifact.Title ||
		metadata.Title != expectedTitle ||
		artifact.Title != expectedTitle ||
		artifact.Kind != conversation.ArtifactKindTable ||
		artifact.Table == nil ||
		!runtimeLiveArtifactTableContains(artifact.Table, "Go", "34") ||
		!runtimeLiveArtifactTableContains(artifact.Table, "TypeScript", "21") ||
		!runtimeLiveArtifactTableContains(artifact.Table, "CSS", "8") {
		t.Fatalf("live table artifact metadata=%+v artifact=%+v", metadata, artifact)
	}
}

func runtimeLiveArtifactTableContains(table *conversation.TableArtifactPayload, language string, lines string) bool {
	if table == nil {
		return false
	}
	for _, row := range table.Rows {
		if len(row) >= 2 && strings.EqualFold(strings.TrimSpace(row[0]), language) &&
			strings.TrimSpace(row[1]) == lines {
			return true
		}
	}
	return false
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
		targetWorkspaceID, ok := target.ResourceScope.FolderWorkspaceID()
		return target.ConversationID == conversationID && ok && targetWorkspaceID == workspaceID
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
		invocation.ProviderTurnID != ""
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
	state := postRuntimeJSON[conversation.ConversationInputRoutingState](
		t,
		client,
		baseURL,
		"/conversations/inputs/state/wait",
		httpapi.ReadConversationInputRoutingStateRequest{
			WorkspaceID:    &workspaceID,
			ConversationID: conversationID,
			InputID:        accepted.Input.ID,
		},
		http.StatusOK,
	)
	switch state.Input.Status {
	case conversation.ConversationInputStatusDispatched:
		return state
	case conversation.ConversationInputStatusFailed,
		conversation.ConversationInputStatusAwaitingClarification:
		t.Fatalf(
			"live conversation router did not resolve the input: failure=%+v state=%+v",
			state.Input.Failure,
			state,
		)
	default:
		t.Fatalf("live conversation route wait returned unsettled state: %+v", state)
	}
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
	return waitForRuntimeLiveConversationSnapshot(
		t,
		client,
		baseURL,
		workspaceID,
		conversationID,
		"routed narrator status",
		func(snapshot conversation.ConversationSnapshot) bool {
			if snapshot.NarratorState.Degradation != nil {
				t.Fatalf("live routed narrator status degraded: %+v", *snapshot.NarratorState.Degradation)
			}
			return runtimeLiveHasNewNarratorStatusReply(before, snapshot, question)
		},
	)
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
	return waitForRuntimeLiveConversationSnapshot(
		t,
		client,
		baseURL,
		workspaceID,
		conversationID,
		fmt.Sprintf("%d terminal topic turns with final narration", wantTurns),
		func(snapshot conversation.ConversationSnapshot) bool {
			if len(snapshot.Turns.Turns) != wantTurns {
				return false
			}
			latest := snapshot.Turns.Turns[len(snapshot.Turns.Turns)-1]
			terminal := latest.Status == conversation.TurnStatusCompleted ||
				latest.Status == conversation.TurnStatusFailed ||
				latest.Status == conversation.TurnStatusCancelled
			return terminal && runtimeTopicHasFinalNarration(snapshot, latest.ID) &&
				snapshot.NarratorState.ObservedThroughSequence == snapshot.Conversation.LastTrajectorySequence
		},
	)
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

func requireRuntimeLiveCodexChatGPTAuth(t *testing.T) {
	t.Helper()
	if os.Getenv("SETTA_LIVE_CODEX") != "1" {
		t.Skip("set SETTA_LIVE_CODEX=1 to run the ChatGPT-authenticated Codex integration")
	}

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
	service, err := codexaccount.NewService(manager)
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
