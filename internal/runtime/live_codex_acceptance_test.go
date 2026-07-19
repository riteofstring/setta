package runtime

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"slices"
	"strings"
	"testing"
	"time"

	"setta/internal/conversation"
	"setta/internal/httpapi"
)

const (
	runtimeLiveCodexChildProcessEnvironment = "SETTA_RUNTIME_LIVE_CODEX_CHILD_PROCESS"
	runtimeLiveCodexChildAppDataEnvironment = "SETTA_RUNTIME_LIVE_CODEX_CHILD_APP_DATA"
	runtimeLiveControlCommand               = "sleep 90"
	runtimeLiveSnapshotWaitTimeout          = 2 * time.Minute
)

func TestBackendTopicConversationControlsAndRestartWithLiveCodex(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	appDataDir := t.TempDir()
	backend := startRuntimeLiveCodexBackendProcess(t, appDataDir)
	client, baseURL := runtimeLiveCodexBackendClient(backend)
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](
		t,
		client,
		baseURL,
		"/workspaces/open",
		httpapi.OpenWorkspaceRequest{RootPath: t.TempDir()},
		http.StatusOK,
	)

	steeredTopic := createRuntimeLiveTopic(t, client, baseURL, opened.Workspace.ID, "Live concurrent steering")
	cancelledTopic := createRuntimeLiveTopic(t, client, baseURL, opened.Workspace.ID, "Live concurrent cancellation")
	steeredStart := submitRuntimeLiveConversationInput(
		t,
		client,
		baseURL,
		steeredTopic.Conversation.ID,
		"live-concurrent-steer-start",
		"Continue this topic with parent-agent work. Before answering, use the shell command tool to run `"+runtimeLiveControlCommand+"`. Do not answer without running it. After it finishes, reply exactly LIVE_STEER_ORIGINAL_REPLY.",
	)
	cancelledStart := submitRuntimeLiveConversationInput(
		t,
		client,
		baseURL,
		cancelledTopic.Conversation.ID,
		"live-concurrent-cancel-start",
		"Continue this topic with parent-agent work. Before answering, use the shell command tool to run `"+runtimeLiveControlCommand+"`. Do not answer without running it. After it finishes, reply exactly LIVE_CANCEL_ORIGINAL_REPLY.",
	)
	steeredStartRoute := waitForRuntimeLiveConversationRoute(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		steeredTopic.Conversation.ID,
		steeredStart,
	)
	cancelledStartRoute := waitForRuntimeLiveConversationRoute(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		cancelledTopic.Conversation.ID,
		cancelledStart,
	)
	requireRuntimeLiveRouteKind(t, steeredStartRoute, conversation.ConversationRouteDecisionKindSendToParent)
	requireRuntimeLiveRouteKind(t, cancelledStartRoute, conversation.ConversationRouteDecisionKindSendToParent)

	steeredActive := waitForRuntimeLiveActiveCommand(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		steeredTopic.Conversation.ID,
	)
	cancelledActive := waitForRuntimeLiveActiveCommand(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		cancelledTopic.Conversation.ID,
	)
	steeredActive = readRuntimeLiveSnapshot(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		steeredTopic.Conversation.ID,
	)
	cancelledActive = readRuntimeLiveSnapshot(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		cancelledTopic.Conversation.ID,
	)
	assertRuntimeLiveConcurrentTopics(t, steeredActive, cancelledActive)
	steeredTurn := latestRuntimeLiveTurn(t, steeredActive)
	cancelledTurn := latestRuntimeLiveTurn(t, cancelledActive)

	steeringText := "Steer the active parent turn now; this is an in-progress correction, not later queued work. Replace its eventual final response with exactly LIVE_STEER_UPDATED_REPLY."
	steering := submitRuntimeLiveConversationInput(
		t,
		client,
		baseURL,
		steeredTopic.Conversation.ID,
		"live-concurrent-steer-update",
		steeringText,
	)
	steeringRoute := waitForRuntimeLiveConversationRoute(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		steeredTopic.Conversation.ID,
		steering,
	)
	steeringDecision := requireRuntimeLiveRouteKind(
		t,
		steeringRoute,
		conversation.ConversationRouteDecisionKindSteerParentTurn,
	)
	if steeringDecision.ResultingCommand.SteerParentTurn == nil ||
		steeringDecision.ResultingCommand.SteerParentTurn.TargetTurnID != steeredTurn.ID {
		t.Fatalf("live steering target = %+v, want turn %s", steeringDecision.ResultingCommand.SteerParentTurn, steeredTurn.ID)
	}
	afterSteering := readRuntimeLiveSnapshot(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		steeredTopic.Conversation.ID,
	)
	if !runtimeLiveTurnHasSteering(afterSteering, steeredTurn.ID, "LIVE_STEER_UPDATED_REPLY") {
		t.Fatalf("live steering was not persisted for turn %s", steeredTurn.ID)
	}
	otherAfterSteering := readRuntimeLiveSnapshot(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		cancelledTopic.Conversation.ID,
	)
	if latestRuntimeLiveTurn(t, otherAfterSteering).Status != conversation.TurnStatusRunning ||
		runtimeLiveTurnHasAnySteering(otherAfterSteering, cancelledTurn.ID) {
		t.Fatalf("steering leaked into concurrent topic: %+v", otherAfterSteering.Trajectory.Events)
	}

	postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/turns/stop",
		httpapi.StopTopicConversationTurnRequest{
			WorkspaceID:    opened.Workspace.ID,
			ConversationID: cancelledTopic.Conversation.ID,
		},
		http.StatusOK,
	)
	cancelledTerminal := waitForRuntimeLiveTurnStatus(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		cancelledTopic.Conversation.ID,
		cancelledTurn.ID,
		conversation.TurnStatusCancelled,
	)
	if !runtimeLiveTurnHasInterruption(
		cancelledTerminal,
		cancelledTurn.ID,
		conversation.TurnInterruptionUserRequested,
	) {
		t.Fatalf("live cancellation has no user-requested interruption: %+v", cancelledTerminal.Trajectory.Events)
	}
	steeredStillActive := readRuntimeLiveSnapshot(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		steeredTopic.Conversation.ID,
	)
	if latestRuntimeLiveTurn(t, steeredStillActive).Status != conversation.TurnStatusRunning {
		t.Fatalf("cancelling one topic changed the steered topic: %+v", latestRuntimeLiveTurn(t, steeredStillActive))
	}
	postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/turns/stop",
		httpapi.StopTopicConversationTurnRequest{
			WorkspaceID:    opened.Workspace.ID,
			ConversationID: steeredTopic.Conversation.ID,
		},
		http.StatusOK,
	)
	waitForRuntimeLiveTurnStatus(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		steeredTopic.Conversation.ID,
		steeredTurn.ID,
		conversation.TurnStatusCancelled,
	)

	restartTopic := createRuntimeLiveTopic(t, client, baseURL, opened.Workspace.ID, "Live restart reconciliation")
	restartStart := submitRuntimeLiveConversationInput(
		t,
		client,
		baseURL,
		restartTopic.Conversation.ID,
		"live-restart-start",
		"Continue this topic with parent-agent work. Before answering, use the shell command tool to run `"+runtimeLiveControlCommand+"`. Do not answer without running it. After it finishes, reply exactly LIVE_RESTART_UNEXPECTED_REPLY.",
	)
	restartRoute := waitForRuntimeLiveConversationRoute(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		restartTopic.Conversation.ID,
		restartStart,
	)
	requireRuntimeLiveRouteKind(t, restartRoute, conversation.ConversationRouteDecisionKindSendToParent)
	restartActive := waitForRuntimeLiveActiveCommand(
		t,
		client,
		baseURL,
		opened.Workspace.ID,
		restartTopic.Conversation.ID,
	)
	restartTurn := latestRuntimeLiveTurn(t, restartActive)
	providerThreadID := restartActive.ThreadBinding.ThreadID
	providerTurnID := *restartTurn.ProviderTurnID

	if err := backend.kill(); err != nil {
		t.Fatalf("crash live backend: %v", err)
	}
	restartedBackend := startRuntimeLiveCodexBackendProcess(t, appDataDir)
	restartedClient, restartedBaseURL := runtimeLiveCodexBackendClient(restartedBackend)
	reloaded := readRuntimeLiveSnapshot(
		t,
		restartedClient,
		restartedBaseURL,
		opened.Workspace.ID,
		restartTopic.Conversation.ID,
	)
	reloadedTurn := latestRuntimeLiveTurn(t, reloaded)
	if reloadedTurn.ID != restartTurn.ID || reloadedTurn.ProviderTurnID == nil ||
		*reloadedTurn.ProviderTurnID != providerTurnID || reloadedTurn.Status != conversation.TurnStatusCancelled {
		t.Fatalf("reloaded live turn = %+v, want reconciled cancellation of %s/%s", reloadedTurn, restartTurn.ID, providerTurnID)
	}
	if reloaded.Conversation.Status != conversation.ConversationStatusIdle ||
		reloaded.ThreadBinding == nil || reloaded.ThreadBinding.ThreadID != providerThreadID ||
		!runtimeLiveTurnHasInterruption(reloaded, restartTurn.ID, conversation.TurnInterruptionReconciliation) {
		t.Fatalf("reloaded live reconciliation = conversation=%+v binding=%+v trajectory=%+v", reloaded.Conversation, reloaded.ThreadBinding, reloaded.Trajectory.Events)
	}
	page := postRuntimeJSON[conversation.NavigatorPage](
		t,
		restartedClient,
		restartedBaseURL,
		"/conversations/navigator/list",
		httpapi.ListTopicConversationsRequest{WorkspaceID: opened.Workspace.ID, Limit: 80},
		http.StatusOK,
	)
	if !slices.ContainsFunc(page.Items, func(item conversation.NavigatorItem) bool {
		return item.Conversation.ID == restartTopic.Conversation.ID &&
			item.Conversation.Status == conversation.ConversationStatusIdle
	}) {
		t.Fatalf("reconciled topic is absent from reloaded navigator: %+v", page.Items)
	}
}

func TestRuntimeLiveCodexBackendProcessHelper(t *testing.T) {
	if os.Getenv(runtimeLiveCodexChildProcessEnvironment) != "1" {
		return
	}
	appDataDir := os.Getenv(runtimeLiveCodexChildAppDataEnvironment)
	if appDataDir == "" {
		t.Fatal("live Codex child app data directory is required")
	}
	config := DefaultConfig()
	config.AppDataDir = appDataDir
	config.Stdout = os.Stdout
	config.Stderr = os.Stderr
	config.Version = "live-topic-acceptance"
	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start live Codex child backend: %v", err)
	}
	if err := server.Wait(); err != nil {
		t.Fatalf("wait for live Codex child backend: %v", err)
	}
}

type runtimeLiveCodexBackendProcess struct {
	command *exec.Cmd
	stderr  bytes.Buffer
	stopped bool
	ready   ReadyEvent
}

type runtimeLiveCodexReadyResult struct {
	ready ReadyEvent
	err   error
}

func startRuntimeLiveCodexBackendProcess(
	t *testing.T,
	appDataDir string,
) *runtimeLiveCodexBackendProcess {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve runtime live test executable: %v", err)
	}
	process := &runtimeLiveCodexBackendProcess{}
	process.command = exec.Command(executable, "-test.run=^TestRuntimeLiveCodexBackendProcessHelper$")
	process.command.Env = runtimeLiveCodexChildEnvironment(os.Environ(), appDataDir)
	stdout, err := process.command.StdoutPipe()
	if err != nil {
		t.Fatalf("open runtime live backend stdout: %v", err)
	}
	process.command.Stderr = &process.stderr
	if err := process.command.Start(); err != nil {
		t.Fatalf("start runtime live backend process: %v", err)
	}
	readyResult := make(chan runtimeLiveCodexReadyResult, 1)
	go func() {
		var ready ReadyEvent
		decodeErr := json.NewDecoder(stdout).Decode(&ready)
		readyResult <- runtimeLiveCodexReadyResult{ready: ready, err: decodeErr}
	}()
	select {
	case result := <-readyResult:
		if result.err != nil {
			_ = process.kill()
			t.Fatalf("decode runtime live backend readiness: %v; stderr: %s", result.err, process.stderr.String())
		}
		process.ready = result.ready
	case <-time.After(runtimeLiveSnapshotWaitTimeout):
		_ = process.kill()
		t.Fatalf("runtime live backend did not become ready; stderr: %s", process.stderr.String())
	}
	if process.ready.Event != "ready" || process.ready.Addr == "" || process.ready.BootstrapToken == "" {
		_ = process.kill()
		t.Fatalf("runtime live backend readiness is invalid: %+v", process.ready)
	}
	t.Cleanup(func() {
		if err := process.kill(); err != nil {
			t.Errorf("stop runtime live backend process: %v", err)
		}
	})
	return process
}

func (process *runtimeLiveCodexBackendProcess) kill() error {
	if process == nil || process.stopped {
		return nil
	}
	process.stopped = true
	if process.command == nil || process.command.Process == nil {
		return errors.New("runtime live backend process was not started")
	}
	if err := process.command.Process.Kill(); err != nil {
		return fmt.Errorf("kill runtime live backend: %w; stderr: %s", err, process.stderr.String())
	}
	if err := process.command.Wait(); err == nil {
		return errors.New("runtime live backend exited successfully after a forced crash")
	}
	return nil
}

func runtimeLiveCodexChildEnvironment(environment []string, appDataDir string) []string {
	result := make([]string, 0, len(environment)+2)
	for _, entry := range environment {
		name, _, _ := strings.Cut(entry, "=")
		switch name {
		case "OPENAI_API_KEY", runtimeLiveCodexChildProcessEnvironment, runtimeLiveCodexChildAppDataEnvironment:
			continue
		default:
			result = append(result, entry)
		}
	}
	return append(
		result,
		runtimeLiveCodexChildProcessEnvironment+"=1",
		runtimeLiveCodexChildAppDataEnvironment+"="+appDataDir,
	)
}

func runtimeLiveCodexBackendClient(
	process *runtimeLiveCodexBackendProcess,
) (*http.Client, string) {
	return authenticatedRuntimeTestClient(process.ready.BootstrapToken, 3*time.Minute),
		"http://" + process.ready.Addr
}

func createRuntimeLiveTopic(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	title string,
) conversation.ConversationSnapshot {
	t.Helper()
	return postRuntimeJSON[conversation.ConversationSnapshot](
		t,
		client,
		baseURL,
		"/conversations/create",
		httpapi.CreateTopicConversationRequest{WorkspaceID: workspaceID, Title: title},
		http.StatusOK,
	)
}

func submitRuntimeLiveConversationInput(
	t *testing.T,
	client *http.Client,
	baseURL string,
	conversationID string,
	inputID string,
	inputText string,
) conversation.AcceptedConversationInput {
	t.Helper()
	return postRuntimeJSON[conversation.AcceptedConversationInput](
		t,
		client,
		baseURL,
		"/conversations/inputs/submit",
		httpapi.SubmitConversationInputRequest{Input: conversation.ConversationInput{
			ID:             inputID,
			ConversationID: conversationID,
			Text:           inputText,
			Modality:       conversation.ConversationInputModalityText,
			SubmittedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		}},
		http.StatusAccepted,
	)
}

func requireRuntimeLiveRouteKind(
	t *testing.T,
	state conversation.ConversationInputRoutingState,
	want conversation.ConversationRouteDecisionKind,
) conversation.ConversationRouteDecisionRecord {
	t.Helper()
	if len(state.Decisions) != 1 || state.Decisions[0].Decision.Kind != want ||
		state.Decisions[0].ResultingCommand.Kind != want {
		t.Fatalf("live route decisions = %+v, want exactly one %s", state.Decisions, want)
	}
	return state.Decisions[0]
}

func waitForRuntimeLiveActiveCommand(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	conversationID string,
) conversation.ConversationSnapshot {
	t.Helper()
	return waitForRuntimeLiveConversationSnapshot(
		t,
		client,
		baseURL,
		workspaceID,
		conversationID,
		"active provider command "+runtimeLiveControlCommand,
		func(snapshot conversation.ConversationSnapshot) bool {
			if snapshot.ThreadBinding == nil || snapshot.ThreadBinding.ThreadID == "" ||
				len(snapshot.Turns.Turns) == 0 {
				return false
			}
			turn := snapshot.Turns.Turns[len(snapshot.Turns.Turns)-1]
			if turn.Status != conversation.TurnStatusRunning || turn.ProviderTurnID == nil {
				return false
			}
			for _, event := range snapshot.Trajectory.Events {
				if event.TurnID == nil || *event.TurnID != turn.ID || event.ActivityStarted == nil ||
					event.ActivityStarted.Activity.Command == nil {
					continue
				}
				if strings.Contains(*event.ActivityStarted.Activity.Command, runtimeLiveControlCommand) {
					return true
				}
			}
			return false
		},
	)
}

func waitForRuntimeLiveTurnStatus(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	conversationID string,
	turnID string,
	want conversation.TurnStatus,
) conversation.ConversationSnapshot {
	t.Helper()
	return waitForRuntimeLiveConversationSnapshot(
		t,
		client,
		baseURL,
		workspaceID,
		conversationID,
		fmt.Sprintf("turn %s status %s", turnID, want),
		func(snapshot conversation.ConversationSnapshot) bool {
			for _, turn := range snapshot.Turns.Turns {
				if turn.ID == turnID {
					return turn.Status == want
				}
			}
			return false
		},
	)
}

func waitForRuntimeLiveConversationSnapshot(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	conversationID string,
	description string,
	condition func(conversation.ConversationSnapshot) bool,
) conversation.ConversationSnapshot {
	t.Helper()
	if condition == nil {
		t.Fatal("runtime live snapshot condition is required")
	}
	last := readRuntimeLiveSnapshot(t, client, baseURL, workspaceID, conversationID)
	if condition(last) {
		return last
	}
	ctx, cancel := context.WithTimeout(context.Background(), runtimeLiveSnapshotWaitTimeout)
	defer cancel()
	query := url.Values{}
	query.Set("workspaceId", workspaceID)
	query.Set("conversationId", conversationID)
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		baseURL+"/conversations/events?"+query.Encode(),
		nil,
	)
	if err != nil {
		t.Fatalf("create runtime live conversation event request: %v", err)
	}
	request.Header.Set(
		"Last-Event-ID",
		fmt.Sprintf("%s:%d", last.EventCursor.StreamID, last.EventCursor.Sequence),
	)
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("subscribe to runtime live conversation events: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 64*1024))
		t.Fatalf("conversation event stream status = %d, want %d, body: %s", response.StatusCode, http.StatusOK, string(body))
	}
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		if !strings.HasPrefix(scanner.Text(), "id: ") {
			continue
		}
		last = readRuntimeLiveSnapshot(t, client, baseURL, workspaceID, conversationID)
		if condition(last) {
			return last
		}
	}
	if ctx.Err() != nil {
		t.Fatalf(
			"timed out waiting for live %s; conversation=%s status=%s turns=%d trajectory=%d narration=%d",
			description,
			conversationID,
			last.Conversation.Status,
			len(last.Turns.Turns),
			len(last.Trajectory.Events),
			len(last.Narration.Events),
		)
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("read runtime live conversation events while waiting for %s: %v", description, err)
	}
	t.Fatalf("runtime live conversation event stream closed while waiting for %s", description)
	return conversation.ConversationSnapshot{}
}

func readRuntimeLiveSnapshot(
	t *testing.T,
	client *http.Client,
	baseURL string,
	workspaceID string,
	conversationID string,
) conversation.ConversationSnapshot {
	t.Helper()
	return postRuntimeJSON[conversation.ConversationSnapshot](
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
}

func latestRuntimeLiveTurn(
	t *testing.T,
	snapshot conversation.ConversationSnapshot,
) conversation.ConversationTurn {
	t.Helper()
	if len(snapshot.Turns.Turns) == 0 {
		t.Fatalf("live topic %s has no turns", snapshot.Conversation.ID)
	}
	return snapshot.Turns.Turns[len(snapshot.Turns.Turns)-1]
}

func assertRuntimeLiveConcurrentTopics(
	t *testing.T,
	first conversation.ConversationSnapshot,
	second conversation.ConversationSnapshot,
) {
	t.Helper()
	firstTurn := latestRuntimeLiveTurn(t, first)
	secondTurn := latestRuntimeLiveTurn(t, second)
	if first.Conversation.WorkspaceID != second.Conversation.WorkspaceID ||
		first.Conversation.ID == second.Conversation.ID ||
		firstTurn.Status != conversation.TurnStatusRunning ||
		secondTurn.Status != conversation.TurnStatusRunning ||
		first.ThreadBinding == nil || second.ThreadBinding == nil ||
		first.ThreadBinding.ThreadID == second.ThreadBinding.ThreadID ||
		firstTurn.ProviderTurnID == nil || secondTurn.ProviderTurnID == nil ||
		*firstTurn.ProviderTurnID == *secondTurn.ProviderTurnID {
		t.Fatalf("live topics are not concurrently isolated: first=%+v/%+v second=%+v/%+v", first.Conversation, firstTurn, second.Conversation, secondTurn)
	}
}

func runtimeLiveTurnHasSteering(
	snapshot conversation.ConversationSnapshot,
	turnID string,
	marker string,
) bool {
	for _, event := range snapshot.Trajectory.Events {
		if event.TurnID != nil && *event.TurnID == turnID && event.TurnSteered != nil &&
			strings.Contains(event.TurnSteered.Input.Text, marker) {
			return true
		}
	}
	return false
}

func runtimeLiveTurnHasAnySteering(
	snapshot conversation.ConversationSnapshot,
	turnID string,
) bool {
	return runtimeLiveTurnHasSteering(snapshot, turnID, "")
}

func runtimeLiveTurnHasInterruption(
	snapshot conversation.ConversationSnapshot,
	turnID string,
	reason conversation.TurnInterruptionReason,
) bool {
	for _, event := range snapshot.Trajectory.Events {
		if event.TurnID != nil && *event.TurnID == turnID && event.TurnInterrupted != nil &&
			event.TurnInterrupted.Reason == reason {
			return true
		}
	}
	return false
}
