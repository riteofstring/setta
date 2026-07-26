package conversation

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/speech"
	"setta/internal/workspace"
)

const (
	liveSideParentStarting  = "SETTA_LIVE_SIDE_PARENT_STARTING"
	liveSideParentFinished  = "SETTA_LIVE_SIDE_PARENT_FINISHED"
	liveSideContextOK       = "SETTA_LIVE_SIDE_CONTEXT_OK"
	liveSideContextFailed   = "SETTA_LIVE_SIDE_CONTEXT_MISMATCH"
	liveSideIsolationOK     = "SETTA_LIVE_SIDE_HISTORY_ISOLATED"
	liveSideIsolationFailed = "SETTA_LIVE_SIDE_HISTORY_LEAKED"
)

func TestLiveConversationServiceActiveSideLifecycle(t *testing.T) {
	requireLiveConversationCodex(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	runtime := newObservedLiveSideRuntime()
	t.Cleanup(func() {
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), time.Minute)
		defer shutdownCancel()
		if err := runtime.Shutdown(shutdownCtx); err != nil {
			t.Errorf("shutdown live agent runtime: %v", err)
		}
	})
	requireLiveConversationModels(t, ctx, runtime.Runtime)
	isolation := newLiveCarrierIsolation(t, runtime.Runtime, "sidelifecycle")

	service, workspaceID := newLiveSideConversationService(t, runtime)
	parent, err := service.CreateTopic(ctx, workspaceID, "Live active side lifecycle")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	parentID := parent.Conversation.ID
	subscription, err := service.SubscribeEvents(parent.EventCursor, workspaceID, parentID)
	if err != nil {
		t.Fatalf("SubscribeEvents: %v", err)
	}
	defer subscription.Unsubscribe()

	runLiveSideParentBaseline(t, ctx, service, subscription, workspaceID, parentID, isolation)
	activeRequest := isolation.prompt(fmt.Sprintf(
		"Before using a tool, send the public commentary marker %s. Then use the shell command tool to run `sleep 20`. Do not answer without running it. After it finishes, reply with exactly %s.",
		liveSideParentStarting,
		liveSideParentFinished,
	))
	if _, err := service.sendTestTurn(ctx, workspaceID, parentID, activeRequest); err != nil {
		t.Fatalf("SendTurn active parent: %v", err)
	}
	working := awaitLiveConversationSnapshot(
		t,
		ctx,
		service,
		subscription,
		workspaceID,
		parentID,
		"active parent command and commentary",
		func(snapshot ConversationSnapshot) bool {
			return liveParentReadyForSide(snapshot, liveSideParentStarting, "sleep 20")
		},
	)
	activeTurn := latestSnapshotTurn(working)
	if activeTurn.ProviderTurnID == nil {
		t.Fatalf("active parent turn has no provider identity: %+v", activeTurn)
	}

	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parentID)
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	assertLiveSideCreatedDuringParentTurn(t, created, side, working, activeTurn)
	startRequest, sideThread, injection := runtime.sidePreparation(t)
	assertLiveSideCarrierSnapshot(t, startRequest, sideThread, injection, activeRequest)
	frame := assertLiveSideContextFrame(t, injection, side, sideThread.ID, activeRequest)
	if !liveFrameHasCommand(frame, "sleep 20") {
		t.Fatalf("live side context omitted active command: %+v", frame.ActiveActivities)
	}

	contextPrompt := fmt.Sprintf(
		"Read the typed Setta authoritative parent-state reference injected before this turn. Reply exactly %s if its current objective is running and an active activity command contains `sleep 20`; otherwise reply exactly %s.",
		liveSideContextOK,
		liveSideContextFailed,
	)
	contextStarted, err := service.SendSideConversationTurn(ctx, workspaceID, parentID, side.ID, contextPrompt)
	if err != nil {
		t.Fatalf("SendSideConversationTurn context probe: %v", err)
	}
	contextTurnID := requireLiveActiveSideTurnID(t, contextStarted, side.ID)
	contextAnswered := awaitLiveConversationSnapshot(
		t,
		ctx,
		service,
		subscription,
		workspaceID,
		parentID,
		"side context probe",
		func(snapshot ConversationSnapshot) bool {
			return liveSideTurnCompleted(snapshot, side.ID, contextTurnID)
		},
	)
	if got := strings.TrimSpace(liveSideTurnFinalText(contextAnswered, side.ID, contextTurnID)); got != liveSideContextOK {
		t.Fatalf("live side context probe reply = %q, want %q", got, liveSideContextOK)
	}

	parentCompleted := awaitLiveConversationSnapshot(
		t,
		ctx,
		service,
		subscription,
		workspaceID,
		parentID,
		"active parent completion",
		func(snapshot ConversationSnapshot) bool {
			return snapshot.Conversation.Status == ConversationStatusIdle &&
				latestSnapshotTurn(snapshot).ID == activeTurn.ID &&
				latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
		},
	)
	currentSide, err := findSideConversation(parentCompleted, side.ID)
	if err != nil {
		t.Fatalf("find side after parent completion: %v", err)
	}
	if currentSide.ParentStatus != ConversationStatusIdle {
		t.Fatalf("side parent status = %s after parent completion, want idle", currentSide.ParentStatus)
	}
	if got := liveConversationTurnFinalText(parentCompleted, activeTurn.ID); !strings.Contains(got, liveSideParentFinished) {
		t.Fatalf("live parent final reply = %q, want the %q marker", got, liveSideParentFinished)
	}

	isolationPrompt := fmt.Sprintf(
		"Inspect only inherited assistant messages from before the side-conversation boundary. If any contains the exact literal %s, reply exactly %s. Otherwise reply exactly %s.",
		liveSideParentFinished,
		liveSideIsolationFailed,
		liveSideIsolationOK,
	)
	isolationStarted, err := service.SendSideConversationTurn(ctx, workspaceID, parentID, side.ID, isolationPrompt)
	if err != nil {
		t.Fatalf("SendSideConversationTurn isolation probe: %v", err)
	}
	isolationTurnID := requireLiveActiveSideTurnID(t, isolationStarted, side.ID)
	isolationAnswered := awaitLiveConversationSnapshot(
		t,
		ctx,
		service,
		subscription,
		workspaceID,
		parentID,
		"side inherited-history isolation probe",
		func(snapshot ConversationSnapshot) bool {
			return liveSideTurnCompleted(snapshot, side.ID, isolationTurnID)
		},
	)
	if got := strings.TrimSpace(liveSideTurnFinalText(isolationAnswered, side.ID, isolationTurnID)); got != liveSideIsolationOK {
		t.Fatalf("live side inherited-history probe reply = %q, want %q", got, liveSideIsolationOK)
	}
	if _, err := runtime.ReadThread(ctx, sideThread.ID, true); err == nil ||
		!strings.Contains(err.Error(), "ephemeral threads do not support includeTurns") {
		t.Fatalf("ephemeral side thread read error = %v, want includeTurns constraint", err)
	}
	assertLiveParentExcludesSideWork(
		t,
		isolationAnswered,
		sideConversationBoundary,
		sideInFlightContextFrameHeader,
		contextPrompt,
		liveSideContextOK,
		isolationPrompt,
		liveSideIsolationOK,
	)
	disposeLiveSideConversation(t, ctx, runtime, service, workspaceID, parentID, side, sideThread.ID)
	t.Logf(
		"full side lifecycle re-verification: the side started its own ephemeral carrier %s replayed with %d Setta items; the typed frame carried %d active activities; two isolated side turns completed; the parent completed without side history; disposal unsubscribed the ephemeral provider thread",
		sideThread.ID,
		len(injection.items),
		len(frame.ActiveActivities),
	)
}

func disposeLiveSideConversation(
	t *testing.T,
	ctx context.Context,
	runtime *observedLiveSideRuntime,
	service *Service,
	workspaceID string,
	parentID string,
	side SideConversation,
	carrierThreadID string,
) {
	t.Helper()
	disposed, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parentID,
		side.ID,
	)
	if err != nil {
		t.Fatalf("DisposeSideConversation: %v", err)
	}
	disposedSide, err := findSideConversation(disposed, side.ID)
	if err != nil {
		t.Fatalf("find disposed side: %v", err)
	}
	if disposedSide.DisposedAt == nil ||
		disposedSide.ActiveTurnID != nil ||
		disposedSide.ResolvedSideAgentInvocation.Outcome != InvocationOutcomeCancelled {
		t.Fatalf("disposed live side state = %+v", disposedSide)
	}
	runtime.assertSideUnsubscribed(t, carrierThreadID)
	if disposed.Conversation.Status != ConversationStatusIdle || latestSnapshotTurn(disposed).Status != TurnStatusCompleted {
		t.Fatalf("side disposal changed completed parent: %+v", disposed.Conversation)
	}
}

type observedLiveSideRuntime struct {
	*agent.Runtime
	mu              sync.Mutex
	startRequests   []agent.StartThreadRequest
	startedThreads  []agent.Thread
	injections      []observedLiveInjection
	unsubscriptions []observedLiveUnsubscription
}

type observedLiveInjection struct {
	threadID string
	items    []agent.InjectedTextItem
}

type observedLiveUnsubscription struct {
	status   agent.ThreadUnsubscribeStatus
	threadID string
}

func newObservedLiveSideRuntime() *observedLiveSideRuntime {
	return &observedLiveSideRuntime{
		Runtime: agent.NewRuntime(agent.Config{
			ExcludedEnv: []string{"OPENAI_API_KEY"},
			Version:     "live-conversation-side-lifecycle-test",
		}),
	}
}

func (runtime *observedLiveSideRuntime) StartThread(
	ctx context.Context,
	request agent.StartThreadRequest,
) (agent.Thread, error) {
	thread, err := runtime.Runtime.StartThread(ctx, request)
	if err != nil {
		return agent.Thread{}, err
	}
	runtime.mu.Lock()
	runtime.startRequests = append(runtime.startRequests, request)
	runtime.startedThreads = append(runtime.startedThreads, thread)
	runtime.mu.Unlock()
	return thread, nil
}

func (runtime *observedLiveSideRuntime) InjectItems(
	ctx context.Context,
	threadID string,
	items []agent.InjectedTextItem,
) error {
	if err := runtime.Runtime.InjectItems(ctx, threadID, items); err != nil {
		return err
	}
	copyItems := append([]agent.InjectedTextItem{}, items...)
	runtime.mu.Lock()
	runtime.injections = append(runtime.injections, observedLiveInjection{
		threadID: threadID,
		items:    copyItems,
	})
	runtime.mu.Unlock()
	return nil
}

func (runtime *observedLiveSideRuntime) UnsubscribeThreadWithStatus(
	ctx context.Context,
	threadID string,
) (agent.ThreadUnsubscribeStatus, error) {
	status, err := runtime.Runtime.UnsubscribeThreadWithStatus(ctx, threadID)
	if err != nil {
		return "", err
	}
	runtime.mu.Lock()
	runtime.unsubscriptions = append(runtime.unsubscriptions, observedLiveUnsubscription{
		status:   status,
		threadID: threadID,
	})
	runtime.mu.Unlock()
	return status, nil
}

// sidePreparation reports the carrier the side conversation was started on. The
// parent's own carrier is started first, so the side's is the second: both are
// ephemeral threads replayed from Setta state, and neither forks the other.
func (runtime *observedLiveSideRuntime) sidePreparation(
	t *testing.T,
) (agent.StartThreadRequest, agent.Thread, observedLiveInjection) {
	t.Helper()
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if len(runtime.startRequests) != 2 || len(runtime.startedThreads) != 2 || len(runtime.injections) != 2 {
		t.Fatalf(
			"live side preparation calls = starts %d/%d injections %d, want the parent carrier then the side carrier",
			len(runtime.startRequests),
			len(runtime.startedThreads),
			len(runtime.injections),
		)
	}
	injection := runtime.injections[1]
	injection.items = append([]agent.InjectedTextItem{}, injection.items...)
	return runtime.startRequests[1], runtime.startedThreads[1], injection
}

func (runtime *observedLiveSideRuntime) assertSideUnsubscribed(t *testing.T, threadID string) {
	t.Helper()
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if len(runtime.unsubscriptions) != 1 ||
		runtime.unsubscriptions[0].threadID != threadID ||
		runtime.unsubscriptions[0].status != agent.ThreadUnsubscribeStatusUnsubscribed {
		t.Fatalf("live side unsubscriptions = %+v", runtime.unsubscriptions)
	}
}

func newLiveSideConversationService(
	t *testing.T,
	runtime *observedLiveSideRuntime,
) (*Service, string) {
	t.Helper()
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("close live conversation store: %v", err)
		}
	})
	if _, err := store.EnsureDirectorVoiceSelection(
		context.Background(),
		speech.DefaultDirectorVoiceSelection("2026-07-13T12:00:00Z"),
	); err != nil {
		t.Fatalf("EnsureDirectorVoiceSelection: %v", err)
	}
	if _, err := store.EnsureNarratorVoiceDefault(
		context.Background(),
		speech.DefaultNarratorVoiceSelection("2026-07-13T12:00:00Z"),
	); err != nil {
		t.Fatalf("EnsureNarratorVoiceDefault: %v", err)
	}
	workspaceID := "workspace-live-side"
	service, err := NewService(
		store,
		serviceTestWorkspaceResolver{summary: workspace.WorkspaceSummary{
			ID:       workspaceID,
			RootPath: t.TempDir(),
		}},
		runtime,
	)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := service.Shutdown(shutdownCtx); err != nil {
			t.Errorf("shutdown live conversation service: %v", err)
		}
	})
	return service, workspaceID
}

func requireLiveConversationCodex(t *testing.T) {
	t.Helper()
	if os.Getenv("SETTA_LIVE_CODEX") != "1" {
		t.Skip("set SETTA_LIVE_CODEX=1 to run the ChatGPT-authenticated Codex integration")
	}
	if _, err := exec.LookPath("codex"); err != nil {
		t.Skip("Codex CLI is unavailable")
	}
}

func requireLiveConversationModels(t *testing.T, ctx context.Context, runtime *agent.Runtime) {
	t.Helper()
	models, err := runtime.ListModels(ctx, nil, agent.MaxThreadPageSize, true)
	if err != nil {
		if liveConversationAuthUnavailable(err) {
			t.Skipf("ChatGPT authentication is unavailable: %v", err)
		}
		t.Fatalf("ListModels: %v", err)
	}
	for _, required := range []string{"gpt-5.6-sol", "gpt-5.6-luna"} {
		found := false
		for _, model := range models.Data {
			if model.ID == required {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("live model catalog does not contain required role model %s", required)
		}
	}
}

func liveConversationAuthUnavailable(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "not logged in") ||
		strings.Contains(message, "authentication") ||
		strings.Contains(message, "unauthorized") ||
		strings.Contains(message, "login required")
}

func runLiveSideParentBaseline(
	t *testing.T,
	ctx context.Context,
	service *Service,
	subscription ConversationEventSubscription,
	workspaceID string,
	parentID string,
	isolation liveCarrierIsolation,
) {
	t.Helper()
	baseline := isolation.prompt("Reply with exactly SETTA_LIVE_SIDE_BASELINE_OK.")
	if _, err := service.sendTestTurn(ctx, workspaceID, parentID, baseline); err != nil {
		t.Fatalf("SendTurn baseline: %v", err)
	}
	awaitLiveConversationSnapshot(
		t,
		ctx,
		service,
		subscription,
		workspaceID,
		parentID,
		"parent baseline completion",
		func(snapshot ConversationSnapshot) bool {
			return len(snapshot.Turns.Turns) == 1 && latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
		},
	)
}

func awaitLiveConversationSnapshot(
	t *testing.T,
	ctx context.Context,
	service *Service,
	subscription ConversationEventSubscription,
	workspaceID string,
	conversationID string,
	description string,
	done func(ConversationSnapshot) bool,
) ConversationSnapshot {
	t.Helper()
	timer := time.NewTimer(90 * time.Second)
	defer timer.Stop()
	var snapshot ConversationSnapshot
	for {
		current, err := service.ReadSnapshot(ctx, workspaceID, conversationID)
		if err != nil {
			t.Fatalf("ReadSnapshot while waiting for %s: %v", description, err)
		}
		snapshot = current
		if done(snapshot) {
			return snapshot
		}
		select {
		case <-ctx.Done():
			t.Fatalf("context ended waiting for %s: %v; snapshot=%+v", description, ctx.Err(), snapshot)
		case <-timer.C:
			t.Fatalf("timed out waiting for %s: %+v", description, snapshot)
		case _, open := <-subscription.Events():
			if !open {
				t.Fatalf("conversation event subscription closed while waiting for %s: %+v", description, snapshot)
			}
		}
	}
}

func liveParentReadyForSide(snapshot ConversationSnapshot, commentary string, command string) bool {
	if snapshot.Conversation.Status != ConversationStatusWorking || len(snapshot.Turns.Turns) == 0 {
		return false
	}
	turn := latestSnapshotTurn(snapshot)
	if turn.Status != TurnStatusRunning || turn.ProviderTurnID == nil {
		return false
	}
	foundCommentary := false
	foundCommand := false
	for _, event := range snapshot.Trajectory.Events {
		if event.AgentMessageCompleted != nil && strings.Contains(event.AgentMessageCompleted.Text, commentary) {
			foundCommentary = true
		}
		if event.ActivityStarted != nil && event.ActivityStarted.Activity.Command != nil &&
			strings.Contains(*event.ActivityStarted.Activity.Command, command) {
			foundCommand = true
		}
	}
	return foundCommentary && foundCommand
}

func assertLiveSideCreatedDuringParentTurn(
	t *testing.T,
	created ConversationSnapshot,
	side SideConversation,
	working ConversationSnapshot,
	activeTurn ConversationTurn,
) {
	t.Helper()
	if created.Conversation.Status != ConversationStatusWorking ||
		latestSnapshotTurn(created).ID != activeTurn.ID ||
		latestSnapshotTurn(created).Status != TurnStatusRunning ||
		side.ParentConversationID != created.Conversation.ID ||
		side.DecisionSource != BranchDecisionSourceConversationRouter ||
		side.Status != SideConversationStatusActive ||
		side.ParentStatus != ConversationStatusWorking ||
		side.SourceTrajectorySequence < working.Conversation.LastTrajectorySequence ||
		side.SourceTrajectorySequence > created.Conversation.LastTrajectorySequence ||
		side.SourceTurnID == nil ||
		*side.SourceTurnID != activeTurn.ID {
		t.Fatalf("live side was not bound to the active parent turn: side=%+v parent=%+v", side, created.Conversation)
	}
}

func assertLiveSideCarrierSnapshot(
	t *testing.T,
	request agent.StartThreadRequest,
	thread agent.Thread,
	injection observedLiveInjection,
	activeRequest string,
) {
	t.Helper()
	if !request.Ephemeral {
		t.Fatalf("live side carrier request = %+v", request)
	}
	if request.Invocation.Model != "gpt-5.6-luna" ||
		request.Invocation.ModelSelectionProviderDefault ||
		request.Invocation.ReasoningEffort != "medium" ||
		request.Invocation.PermissionMode != agent.PermissionModeReadOnly ||
		request.Invocation.ApprovalMode != agent.ApprovalModeNever {
		t.Fatalf("live side invocation = %+v", request.Invocation)
	}
	if request.DeveloperInstructions != sideAgentDeveloperInstructions {
		t.Fatalf("live side developer instructions = %q", request.DeveloperInstructions)
	}
	if !thread.Ephemeral || thread.ForkedFromID != nil {
		t.Fatalf("live side carrier response = %+v", thread)
	}
	// The parent context the side reads is what Setta replayed, not provider
	// history: the running request reaches the side through the typed frame, and
	// parent output produced after the boundary never does.
	if liveInjectionContains(injection, activeRequest) {
		t.Fatalf("live side replay repeated the running parent request as history: %+v", injection.items)
	}
	if liveInjectionContains(injection, liveSideParentFinished) {
		t.Fatalf("live side replay included later parent output: %+v", injection.items)
	}
}

func liveInjectionContains(injection observedLiveInjection, text string) bool {
	for _, item := range injection.items {
		if item.Role != "developer" && strings.Contains(item.Text, text) {
			return true
		}
	}
	return false
}

func assertLiveSideContextFrame(
	t *testing.T,
	injection observedLiveInjection,
	side SideConversation,
	carrierThreadID string,
	activeRequest string,
) SideInFlightContextFrame {
	t.Helper()
	if injection.threadID != carrierThreadID {
		t.Fatalf("live side context injection thread = %q, want %q", injection.threadID, carrierThreadID)
	}
	items := injection.items
	if len(items) < 2 {
		t.Fatalf("live side injected items = %+v", items)
	}
	// The Setta replay of the parent comes first; the last two items are always
	// the boundary that ends it and the typed frame the side reads.
	boundary := items[len(items)-2]
	context := items[len(items)-1]
	if boundary.Role != "user" || boundary.Text != sideConversationBoundary || context.Role != "developer" {
		t.Fatalf("live side injected items = %+v", items)
	}
	prefix := sideInFlightContextFrameHeader + "\n"
	if !strings.HasPrefix(context.Text, prefix) {
		t.Fatalf("live side context header drifted: %q", context.Text)
	}
	var frame SideInFlightContextFrame
	if err := json.Unmarshal([]byte(strings.TrimPrefix(context.Text, prefix)), &frame); err != nil {
		t.Fatalf("decode live side context frame: %v", err)
	}
	if err := frame.Validate(); err != nil {
		t.Fatalf("validate live side context frame: %v", err)
	}
	if frame.SourceTrajectorySequence != side.SourceTrajectorySequence ||
		frame.CurrentObjective == nil ||
		frame.CurrentObjective.Input.Text != activeRequest ||
		frame.CurrentObjective.Status != TurnStatusRunning {
		t.Fatalf("live side context frame = %+v, side=%+v", frame, side)
	}
	return frame
}

func liveFrameHasCommand(frame SideInFlightContextFrame, command string) bool {
	for _, activity := range frame.ActiveActivities {
		if activity.Command != nil && strings.Contains(*activity.Command, command) {
			return true
		}
	}
	return false
}

func requireLiveActiveSideTurnID(t *testing.T, snapshot ConversationSnapshot, sideID string) string {
	t.Helper()
	side, err := findSideConversation(snapshot, sideID)
	if err != nil {
		t.Fatalf("find active live side: %v", err)
	}
	if side.ActiveTurnID == nil {
		t.Fatalf("live side turn did not become active: %+v", side)
	}
	return *side.ActiveTurnID
}

func liveSideTurnCompleted(snapshot ConversationSnapshot, sideID string, turnID string) bool {
	side, err := findSideConversation(snapshot, sideID)
	if err != nil || side.ActiveTurnID != nil {
		return false
	}
	for _, event := range snapshot.SideEvents.Events {
		if event.SideConversationID == sideID &&
			event.Event.TurnID != nil &&
			*event.Event.TurnID == turnID &&
			event.Event.Kind == TrajectoryEventTurnCompleted {
			return true
		}
	}
	return false
}

func liveSideTurnFinalText(snapshot ConversationSnapshot, sideID string, turnID string) string {
	text := ""
	for _, event := range snapshot.SideEvents.Events {
		if event.SideConversationID == sideID &&
			event.Event.TurnID != nil &&
			*event.Event.TurnID == turnID &&
			event.Event.AgentMessageCompleted != nil {
			text = event.Event.AgentMessageCompleted.Text
		}
	}
	return text
}

func liveConversationTurnFinalText(snapshot ConversationSnapshot, turnID string) string {
	text := ""
	for _, event := range snapshot.Trajectory.Events {
		if event.TurnID != nil &&
			*event.TurnID == turnID &&
			event.AgentMessageCompleted != nil {
			text = event.AgentMessageCompleted.Text
		}
	}
	return text
}

// assertLiveParentExcludesSideWork proves side work never entered the parent
// conversation. It reads Setta's own record rather than the parent's provider
// thread: the durable conversation is what the next carrier replays, so keeping
// it clean is what keeps side work out of the parent for good.
func assertLiveParentExcludesSideWork(
	t *testing.T,
	parent ConversationSnapshot,
	forbidden ...string,
) {
	t.Helper()
	for _, text := range forbidden {
		if liveParentTrajectoryContains(parent, text) {
			t.Fatalf("side work %q contaminated the parent conversation", text)
		}
	}
}

func liveParentTrajectoryContains(snapshot ConversationSnapshot, text string) bool {
	for _, event := range snapshot.Trajectory.Events {
		if event.UserInputAccepted != nil && strings.Contains(event.UserInputAccepted.Input.Text, text) {
			return true
		}
		if event.TurnSteered != nil && strings.Contains(event.TurnSteered.Input.Text, text) {
			return true
		}
		if event.AgentMessageCompleted != nil && strings.Contains(event.AgentMessageCompleted.Text, text) {
			return true
		}
	}
	return false
}
