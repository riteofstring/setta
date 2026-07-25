package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/conversation"
	"setta/internal/httpapi"
	"setta/internal/runtimeaccounting"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimeprovider/runtimetest"
)

func TestCandidateBGatewayWorkContinuesAfterGatewayDisconnect(t *testing.T) {
	t.Setenv("SETTA_E2E_TOPIC_CODEX_TURN_DELAY_MS", "1500")
	installRuntimeMasterCodexFixture(t)
	leases := newHostedSynchronizedWorkloadLeaseManager()
	reports := newHostedObservedWorkloadLeaseReporter()
	config := testConfig(t)
	config.Version = "hosted-gateway-disconnected-work"
	config.WorkloadLeaseManager = leases
	config.WorkloadLeaseReporter = reports
	config.WorkloadLeaseTTL = 100 * time.Millisecond
	runtimeServer, runtimeReady := startRuntimeTestServer(t, config)
	defer shutdownServer(t, runtimeServer)

	dialer := &hostedRuntimeDialer{}
	dialer.SetAddress(runtimeServer.Addr())
	controlDirectory := t.TempDir()
	secretDirectory := t.TempDir()
	gateway, store, _, client, grant, _ := startHostedGateway(
		t,
		controlDirectory,
		secretDirectory,
		dialer,
		runtimeReady.BootstrapToken,
	)
	defer func() {
		if gateway != nil {
			shutdownHostedGateway(t, gateway, store)
		}
	}()

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
			Title:       "Hosted disconnected work",
		},
		http.StatusOK,
	)
	accepted := submitHostedConversationInput(
		t,
		client,
		baseURL,
		created.Conversation.ID,
		"hosted-disconnected-work",
		"complete hosted work after disconnect",
	)
	requireRuntimeLiveRouteKind(
		t,
		waitForRuntimeLiveConversationRoute(
			t,
			client,
			baseURL,
			opened.Workspace.ID,
			created.Conversation.ID,
			accepted,
		),
		conversation.ConversationRouteDecisionKindSendToParent,
	)
	waitForRuntimeLiveConversationSnapshot(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		"hosted leased turn running",
		func(snapshot conversation.ConversationSnapshot) bool {
			return len(snapshot.Turns.Turns) == 1 &&
				snapshot.Turns.Turns[0].Status == conversation.TurnStatusRunning &&
				hostedWorkloadLeaseActive(t, leases)
		},
	)

	shutdownHostedGateway(t, gateway, store)
	gateway = nil
	store = nil
	if !hostedWorkloadLeaseActive(t, leases) {
		t.Fatal("workload lease was released when the hosted gateway disconnected")
	}
	renewalsBeforeDisconnect := hostedWorkloadLeaseRenewalCount(reports.snapshot())
	reports.waitFor(t, "renewal after hosted gateway disconnect", func(actions []runtimeaccounting.EventAction) bool {
		return hostedWorkloadLeaseRenewalCount(actions) > renewalsBeforeDisconnect
	})
	reports.waitFor(t, "lease end after disconnected turn completion", func(actions []runtimeaccounting.EventAction) bool {
		return actions[len(actions)-1] == runtimeaccounting.EventEnd
	})
	if hostedWorkloadLeaseActive(t, leases) {
		t.Fatal("workload lease remained active after the disconnected turn completed")
	}

	gateway, store, _, client, _ = restartHostedGateway(
		t,
		controlDirectory,
		secretDirectory,
		dialer,
		grant.Token,
	)
	baseURL = "http://" + gateway.Addr().String()
	reconnected := postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/snapshot/read",
		httpapi.ReadConversationSnapshotRequest{
			WorkspaceID:    opened.Workspace.ID,
			ConversationID: created.Conversation.ID,
		},
		http.StatusOK,
	)
	if len(reconnected.Turns.Turns) != 1 ||
		reconnected.Turns.Turns[0].Status != conversation.TurnStatusCompleted {
		t.Fatalf("reconnected hosted turn = %+v, want one completed turn", reconnected.Turns.Turns)
	}
	reports.requireRenewedLifecycle(t)
}

func TestCandidateBGatewayConversationControls(t *testing.T) {
	installRuntimeMasterCodexFixture(t)
	config := testConfig(t)
	config.Version = "hosted-gateway-controls"
	var runtimeLogs bytes.Buffer
	config.Stderr = &runtimeLogs
	runtimeServer, runtimeReady := startRuntimeTestServer(t, config)

	dialer := &hostedRuntimeDialer{}
	dialer.SetAddress(runtimeServer.Addr())
	controlDirectory := t.TempDir()
	secretDirectory := t.TempDir()
	gateway, store, secrets, client, grant, measurements := startHostedGateway(
		t,
		controlDirectory,
		secretDirectory,
		dialer,
		runtimeReady.BootstrapToken,
	)
	defer func() {
		if gateway != nil {
			shutdownHostedGateway(t, gateway, store)
		}
		if runtimeServer != nil {
			shutdownServer(t, runtimeServer)
		}
	}()

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
	artifact := readHostedConversationArtifact(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		created.Conversation.ID,
		afterPromotion.Artifacts.Artifacts[0].ID,
	)

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

	shutdownHostedGateway(t, gateway, store)
	requireHostedGatewayMeasurement(t, measurements, "SubmitConversationInput", false)
	requireHostedGatewayMeasurement(t, measurements, "SubmitTopicConversationApproval", false)
	requireHostedGatewayMeasurement(t, measurements, "StopTopicConversationTurn", false)
	requireHostedGatewayMeasurement(t, measurements, "ReadConversationArtifact", false)
	requireHostedGatewayMeasurementsExclude(
		t,
		measurements,
		opened.Workspace.ID,
		created.Conversation.ID,
		artifact.ID,
		"steer alpha now",
		"command approval denial",
	)
	requireConversationOutcomeMeasurements(
		t,
		runtimeLogs.Bytes(),
		opened.Workspace.ID,
		created.Conversation.ID,
		artifact.ID,
		"artifact hosted queued",
		"command approval denial",
		"hold hosted cancellation",
	)
	gateway = nil
	store = nil
	shutdownServer(t, runtimeServer)
	runtimeServer = nil

	runtimeServer, runtimeReady = startRuntimeTestServer(t, config)
	dialer.SetAddress(runtimeServer.Addr())
	if err := secrets.WriteSecret(t.Context(), "hosted_runtime", []byte(runtimeReady.BootstrapToken)); err != nil {
		t.Fatal(err)
	}
	gateway, store, _, client, _ = restartHostedGateway(
		t,
		controlDirectory,
		secretDirectory,
		dialer,
		grant.Token,
	)
	baseURL = "http://" + gateway.Addr().String()
	restarted := postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/snapshot/read",
		httpapi.ReadConversationSnapshotRequest{
			WorkspaceID:    opened.Workspace.ID,
			ConversationID: created.Conversation.ID,
		},
		http.StatusOK,
	)
	requireHostedLifecycleRestartState(t, restarted)
}

func requireConversationOutcomeMeasurements(t *testing.T, encoded []byte, forbidden ...string) {
	t.Helper()
	text := string(encoded)
	for _, value := range forbidden {
		if strings.Contains(text, value) {
			t.Fatalf("conversation outcome measurement exposed %q: %s", value, text)
		}
	}
	found := map[conversation.OutcomeTimingKind]bool{}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	for {
		var measurement conversationOutcomeMeasurement
		err := decoder.Decode(&measurement)
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if measurement.Event != "conversation_outcome_timing" ||
			measurement.StartedAt.IsZero() ||
			measurement.CompletedAt.IsZero() ||
			measurement.DurationMilliseconds < 0 {
			t.Fatalf("conversation outcome measurement = %+v", measurement)
		}
		found[measurement.Kind] = true
	}
	for _, kind := range []conversation.OutcomeTimingKind{
		conversation.OutcomeTimingArtifactAvailable,
		conversation.OutcomeTimingApproval,
		conversation.OutcomeTimingCancellation,
	} {
		if !found[kind] {
			t.Fatalf("conversation outcome measurements omit %q: %s", kind, text)
		}
	}
}

type hostedSynchronizedWorkloadLeaseManager struct {
	mu      sync.Mutex
	manager *runtimetest.LeaseManager
}

func newHostedSynchronizedWorkloadLeaseManager() *hostedSynchronizedWorkloadLeaseManager {
	return &hostedSynchronizedWorkloadLeaseManager{
		manager: runtimetest.NewLeaseManager(time.Now),
	}
}

func (manager *hostedSynchronizedWorkloadLeaseManager) Acquire(
	ctx context.Context,
	request runtimeprovider.WorkloadLeaseRequest,
) (runtimeprovider.WorkloadLease, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.manager.Acquire(ctx, request)
}

func (manager *hostedSynchronizedWorkloadLeaseManager) Renew(
	ctx context.Context,
	name string,
	ttl time.Duration,
) (runtimeprovider.WorkloadLease, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.manager.Renew(ctx, name, ttl)
}

func (manager *hostedSynchronizedWorkloadLeaseManager) Inspect(
	ctx context.Context,
	name string,
) (runtimeprovider.WorkloadLease, bool, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.manager.Inspect(ctx, name)
}

func (manager *hostedSynchronizedWorkloadLeaseManager) Release(
	ctx context.Context,
	name string,
) error {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.manager.Release(ctx, name)
}

func hostedWorkloadLeaseActive(
	t *testing.T,
	manager runtimeprovider.WorkloadLeaseManager,
) bool {
	t.Helper()
	_, active, err := manager.Inspect(t.Context(), "setta-agent")
	if err != nil {
		t.Fatalf("inspect hosted workload lease: %v", err)
	}
	return active
}

type hostedObservedWorkloadLeaseReporter struct {
	mu      sync.Mutex
	actions []runtimeaccounting.EventAction
	changed chan struct{}
}

func newHostedObservedWorkloadLeaseReporter() *hostedObservedWorkloadLeaseReporter {
	return &hostedObservedWorkloadLeaseReporter{changed: make(chan struct{}, 1)}
}

func (reporter *hostedObservedWorkloadLeaseReporter) RecordTransition(
	_ context.Context,
	transition runtimeaccounting.ActivityTransition,
) error {
	if err := runtimeaccounting.ValidateWorkloadLeaseTransition(transition); err != nil {
		return err
	}
	reporter.mu.Lock()
	defer reporter.mu.Unlock()
	reporter.actions = append(reporter.actions, transition.Action)
	select {
	case reporter.changed <- struct{}{}:
	default:
	}
	return nil
}

func (reporter *hostedObservedWorkloadLeaseReporter) snapshot() []runtimeaccounting.EventAction {
	reporter.mu.Lock()
	defer reporter.mu.Unlock()
	return append([]runtimeaccounting.EventAction(nil), reporter.actions...)
}

func (reporter *hostedObservedWorkloadLeaseReporter) waitFor(
	t *testing.T,
	label string,
	matches func([]runtimeaccounting.EventAction) bool,
) {
	t.Helper()
	deadline := time.NewTimer(15 * time.Second)
	defer deadline.Stop()
	for {
		actions := reporter.snapshot()
		if len(actions) > 0 && matches(actions) {
			return
		}
		select {
		case <-reporter.changed:
		case <-deadline.C:
			t.Fatalf("timed out waiting for %s; actions = %v", label, reporter.snapshot())
		}
	}
}

func (reporter *hostedObservedWorkloadLeaseReporter) requireRenewedLifecycle(t *testing.T) {
	t.Helper()
	actions := reporter.snapshot()
	if len(actions) < 3 ||
		actions[0] != runtimeaccounting.EventBegin ||
		actions[len(actions)-1] != runtimeaccounting.EventEnd {
		t.Fatalf("hosted workload lease actions = %v, want begin, renewal(s), end", actions)
	}
	for _, action := range actions[1 : len(actions)-1] {
		if action != runtimeaccounting.EventRenew {
			t.Fatalf("hosted workload lease actions = %v, want only renewals between begin and end", actions)
		}
	}
}

func hostedWorkloadLeaseRenewalCount(actions []runtimeaccounting.EventAction) int {
	count := 0
	for _, action := range actions {
		if action == runtimeaccounting.EventRenew {
			count++
		}
	}
	return count
}

func requireHostedLifecycleRestartState(t *testing.T, snapshot conversation.ConversationSnapshot) {
	t.Helper()
	wantStatuses := []conversation.TurnStatus{
		conversation.TurnStatusCompleted,
		conversation.TurnStatusCompleted,
		conversation.TurnStatusCompleted,
		conversation.TurnStatusCancelled,
		conversation.TurnStatusFailed,
	}
	if len(snapshot.Turns.Turns) != len(wantStatuses) {
		t.Fatalf("restarted hosted turns = %+v", snapshot.Turns.Turns)
	}
	for index, want := range wantStatuses {
		if snapshot.Turns.Turns[index].Status != want {
			t.Fatalf("restarted hosted turn %d = %+v, want %s", index, snapshot.Turns.Turns[index], want)
		}
	}
	if len(snapshot.Queue) != 0 ||
		len(snapshot.Artifacts.Artifacts) != 1 ||
		hostedPendingApprovalID(snapshot) != "" ||
		!hostedApprovalResolutionPersisted(snapshot) {
		t.Fatalf(
			"restarted hosted state = queue=%+v artifacts=%+v trajectory=%+v",
			snapshot.Queue,
			snapshot.Artifacts,
			snapshot.Trajectory,
		)
	}
}

func readHostedConversationArtifact(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	conversationID string,
	artifactID string,
) conversation.Artifact {
	t.Helper()
	artifact := postRuntimeJSON[conversation.Artifact](
		t,
		client,
		baseURL,
		"/conversations/artifacts/read",
		httpapi.ReadConversationArtifactRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			ArtifactID:     artifactID,
		},
		http.StatusOK,
	)
	if artifact.ID != artifactID {
		t.Fatalf("hosted artifact = %+v", artifact)
	}
	return artifact
}

func hostedApprovalResolutionPersisted(snapshot conversation.ConversationSnapshot) bool {
	for _, event := range snapshot.Trajectory.Events {
		if event.ApprovalResolved != nil {
			return true
		}
	}
	return false
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
