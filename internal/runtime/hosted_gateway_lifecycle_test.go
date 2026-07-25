package runtime

import (
	"net/http"
	"testing"
	"time"

	"setta/internal/conversation"
	"setta/internal/httpapi"
)

func TestCandidateBGatewayConversationControls(t *testing.T) {
	installRuntimeMasterCodexFixture(t)
	config := testConfig(t)
	config.Version = "hosted-gateway-controls"
	runtimeServer, runtimeReady := startRuntimeTestServer(t, config)
	defer shutdownServer(t, runtimeServer)

	dialer := &hostedRuntimeDialer{}
	dialer.SetAddress(runtimeServer.Addr())
	gateway, store, _, client, _ := startHostedGateway(
		t,
		t.TempDir(),
		t.TempDir(),
		dialer,
		runtimeReady.BootstrapToken,
	)
	defer shutdownHostedGateway(t, gateway, store)

	baseURL := "http://" + gateway.Addr().String()
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](
		t,
		client,
		baseURL,
		"/workspaces/open",
		httpapi.OpenWorkspaceRequest{RootPath: t.TempDir()},
		http.StatusOK,
	)
	created := postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/create",
		httpapi.CreateTopicConversationRequest{
			WorkspaceID: opened.Workspace.ID,
			Title:       "Hosted gateway controls",
		},
		http.StatusOK,
	)

	held := submitHostedConversationInput(
		t,
		client,
		baseURL,
		created.Conversation.ID,
		"hosted-controls-held",
		"hold hosted parent",
	)
	requireRuntimeLiveRouteKind(
		t,
		waitForRuntimeLiveConversationRoute(
			t,
			client,
			baseURL,
			opened.Workspace.ID,
			created.Conversation.ID,
			held,
		),
		conversation.ConversationRouteDecisionKindSendToParent,
	)
	waitForRuntimeLiveConversationSnapshot(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		"hosted parent turn running",
		func(snapshot conversation.ConversationSnapshot) bool {
			return len(snapshot.Turns.Turns) == 1 &&
				snapshot.Turns.Turns[0].Status == conversation.TurnStatusRunning
		},
	)

	queued := submitHostedConversationInput(
		t,
		client,
		baseURL,
		created.Conversation.ID,
		"hosted-controls-queued",
		"artifact hosted queued",
	)
	requireRuntimeLiveRouteKind(
		t,
		waitForRuntimeLiveConversationRoute(
			t,
			client,
			baseURL,
			opened.Workspace.ID,
			created.Conversation.ID,
			queued,
		),
		conversation.ConversationRouteDecisionKindQueueParentTurn,
	)
	waitForRuntimeLiveConversationSnapshot(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		"hosted queued turn persisted",
		func(snapshot conversation.ConversationSnapshot) bool {
			return len(snapshot.Queue) == 1 &&
				len(snapshot.Turns.Turns) == 2 &&
				snapshot.Queue[0].TurnID == snapshot.Turns.Turns[1].ID &&
				snapshot.Turns.Turns[1].Status == conversation.TurnStatusQueued
		},
	)

	steering := submitHostedConversationInput(
		t,
		client,
		baseURL,
		created.Conversation.ID,
		"hosted-controls-steering",
		"steer alpha now",
	)
	requireRuntimeLiveRouteKind(
		t,
		waitForRuntimeLiveConversationRoute(
			t,
			client,
			baseURL,
			opened.Workspace.ID,
			created.Conversation.ID,
			steering,
		),
		conversation.ConversationRouteDecisionKindSteerParentTurn,
	)
	afterPromotion := waitForRuntimeLiveTopicTurns(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		2,
	)
	if len(afterPromotion.Queue) != 0 ||
		afterPromotion.Turns.Turns[0].Status != conversation.TurnStatusCompleted ||
		afterPromotion.Turns.Turns[1].Status != conversation.TurnStatusCompleted ||
		len(afterPromotion.Artifacts.Artifacts) != 1 {
		t.Fatalf(
			"hosted queue promotion snapshot = turns=%+v queue=%+v artifacts=%+v",
			afterPromotion.Turns.Turns,
			afterPromotion.Queue,
			afterPromotion.Artifacts.Artifacts,
		)
	}

	approvalInput := submitHostedConversationInput(
		t,
		client,
		baseURL,
		created.Conversation.ID,
		"hosted-controls-approval",
		"command approval denial",
	)
	requireRuntimeLiveRouteKind(
		t,
		waitForRuntimeLiveConversationRoute(
			t,
			client,
			baseURL,
			opened.Workspace.ID,
			created.Conversation.ID,
			approvalInput,
		),
		conversation.ConversationRouteDecisionKindSendToParent,
	)
	awaitingApproval := waitForRuntimeLiveConversationSnapshot(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		"hosted command approval",
		func(snapshot conversation.ConversationSnapshot) bool {
			return snapshot.Conversation.Status == conversation.ConversationStatusWaitingForApproval &&
				hostedPendingApprovalID(snapshot) != ""
		},
	)
	approvalID := hostedPendingApprovalID(awaitingApproval)
	postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/approvals/submit",
		httpapi.SubmitTopicConversationApprovalRequest{
			WorkspaceID:    opened.Workspace.ID,
			ConversationID: created.Conversation.ID,
			Response: conversation.ConversationApprovalResponse{
				ApprovalID: approvalID,
				Decision:   conversation.TrajectoryApprovalDecisionDenied,
				Answers:    []conversation.ConversationApprovalAnswer{},
			},
		},
		http.StatusOK,
	)
	afterDenial := waitForRuntimeLiveTopicTurns(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		3,
	)
	if afterDenial.Turns.Turns[2].Status != conversation.TurnStatusCompleted ||
		hostedPendingApprovalID(afterDenial) != "" {
		t.Fatalf("hosted denied approval snapshot = %+v", afterDenial)
	}

	cancelInput := submitHostedConversationInput(
		t,
		client,
		baseURL,
		created.Conversation.ID,
		"hosted-controls-cancel",
		"hold hosted cancellation",
	)
	requireRuntimeLiveRouteKind(
		t,
		waitForRuntimeLiveConversationRoute(
			t,
			client,
			baseURL,
			opened.Workspace.ID,
			created.Conversation.ID,
			cancelInput,
		),
		conversation.ConversationRouteDecisionKindSendToParent,
	)
	waitForRuntimeLiveConversationSnapshot(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		"hosted cancellable turn running",
		func(snapshot conversation.ConversationSnapshot) bool {
			return len(snapshot.Turns.Turns) == 4 &&
				snapshot.Turns.Turns[3].Status == conversation.TurnStatusRunning
		},
	)
	postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/turns/stop",
		httpapi.StopTopicConversationTurnRequest{
			WorkspaceID:    opened.Workspace.ID,
			ConversationID: created.Conversation.ID,
		},
		http.StatusOK,
	)
	afterCancellation := waitForRuntimeLiveTopicTurns(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		4,
	)
	if afterCancellation.Turns.Turns[3].Status != conversation.TurnStatusCancelled {
		t.Fatalf("hosted cancelled turn = %+v", afterCancellation.Turns.Turns[3])
	}

	failureInput := submitHostedConversationInput(
		t,
		client,
		baseURL,
		created.Conversation.ID,
		"hosted-controls-failure",
		"fail hosted parent",
	)
	requireRuntimeLiveRouteKind(
		t,
		waitForRuntimeLiveConversationRoute(
			t,
			client,
			baseURL,
			opened.Workspace.ID,
			created.Conversation.ID,
			failureInput,
		),
		conversation.ConversationRouteDecisionKindSendToParent,
	)
	afterFailure := waitForRuntimeLiveTopicTurns(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		5,
	)
	if afterFailure.Turns.Turns[4].Status != conversation.TurnStatusFailed ||
		afterFailure.Turns.Turns[4].Error == nil {
		t.Fatalf("hosted failed turn = %+v", afterFailure.Turns.Turns[4])
	}
}

func submitHostedConversationInput(
	t *testing.T,
	client *http.Client,
	baseURL string,
	conversationID string,
	inputID string,
	text string,
) conversation.AcceptedConversationInput {
	t.Helper()
	sourcePaneID := "hosted-gateway-pane"
	return postRuntimeJSON[conversation.AcceptedConversationInput](
		t,
		client,
		baseURL,
		"/conversations/inputs/submit",
		httpapi.SubmitConversationInputRequest{Input: conversation.ConversationInput{
			ID:             inputID,
			ConversationID: conversationID,
			SourcePaneID:   &sourcePaneID,
			Text:           text,
			Modality:       conversation.ConversationInputModalityText,
			SubmittedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		}},
		http.StatusAccepted,
	)
}

func hostedPendingApprovalID(snapshot conversation.ConversationSnapshot) string {
	for index := len(snapshot.Trajectory.Events) - 1; index >= 0; index-- {
		if approval := snapshot.Trajectory.Events[index].ApprovalRequested; approval != nil {
			return approval.Approval.ID
		}
		if snapshot.Trajectory.Events[index].ApprovalResolved != nil {
			return ""
		}
	}
	return ""
}
