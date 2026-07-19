package conversation

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/speech"
	"setta/internal/workspace"
	"setta/internal/workspaceui/conversationpalette"
)

func TestServiceRunsDurableConversationCommandsAndReload(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created, subscription := createSubscribedServiceTopic(t, ctx, service, workspaceID)
	defer subscription.Unsubscribe()
	conversationID := created.Conversation.ID
	exerciseQueuedServiceTurns(t, ctx, service, runtime, workspaceID, conversationID, created, subscription)
	exerciseServiceApproval(t, ctx, service, runtime, workspaceID, conversationID)
	exerciseServiceCancellation(t, ctx, service, runtime, workspaceID, conversationID)
	assertReloadedServiceState(t, ctx, store, service, appDataDir, workspaceID, conversationID)
}

func TestServiceAllocatesStableDistinctVisibleConversationPalettes(t *testing.T) {
	store, service, _, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownContext)
		_ = store.Close()
	})
	ctx := context.Background()

	paletteIDs := conversationpalette.IDs()
	created := createDormantPaletteTestTopics(t, ctx, service, workspaceID, len(paletteIDs))

	exhausted := createPaletteTestTopic(t, ctx, service, workspaceID, "Palette exhausted")
	created = append(created, exhausted)
	assertDormantPaletteProfile(t, exhausted.PresentationProfile, "dormant exhausted topic")
	bindings := paletteTestPaneBindings(created)
	replacePaletteTestPaneBindings(t, store, workspaceID, bindings)
	assertDistinctVisiblePaletteProfiles(t, ctx, service, workspaceID, created, paletteIDs)
	exhausted = readPresentationTestSnapshot(
		t,
		ctx,
		service,
		workspaceID,
		exhausted.Conversation.ID,
	)
	assertExhaustedPaletteProfile(t, exhausted.PresentationProfile, created[0].Conversation.ID)

	alpha := created[0]
	remainingBindings := make([]WorkspacePaneBinding, 0, len(bindings)-1)
	for _, binding := range bindings {
		if binding.ConversationID != alpha.Conversation.ID {
			remainingBindings = append(remainingBindings, binding)
		}
	}
	replacePaletteTestPaneBindings(t, store, workspaceID, remainingBindings)
	relieved := readPresentationTestSnapshot(
		t,
		ctx,
		service,
		workspaceID,
		exhausted.Conversation.ID,
	)
	if relieved.PresentationProfile.ResolvedPaletteID != conversationpalette.ConversationPaletteSky ||
		relieved.PresentationProfile.PaletteReuse != nil {
		t.Fatalf("palette reuse did not clear after visible pressure left: %+v", relieved.PresentationProfile)
	}
}

func createDormantPaletteTestTopics(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	count int,
) []ConversationSnapshot {
	t.Helper()
	created := make([]ConversationSnapshot, 0, count)
	for index := 0; index < count; index++ {
		snapshot := createPaletteTestTopic(
			t,
			ctx,
			service,
			workspaceID,
			fmt.Sprintf("Palette %d", index+1),
		)
		assertDormantPaletteProfile(t, snapshot.PresentationProfile, fmt.Sprintf("dormant topic %d", index+1))
		created = append(created, snapshot)
	}
	return created
}

func assertDormantPaletteProfile(
	t *testing.T,
	profile ConversationPresentationProfile,
	label string,
) {
	t.Helper()
	if profile.ResolvedPaletteID != conversationpalette.ConversationPaletteSky ||
		profile.PaletteReuse != nil {
		t.Fatalf("%s presentation = %+v, want stable sky without reuse", label, profile)
	}
}

func paletteTestPaneBindings(topics []ConversationSnapshot) []WorkspacePaneBinding {
	bindings := make([]WorkspacePaneBinding, 0, len(topics)+1)
	for index, snapshot := range topics {
		bindings = append(bindings, WorkspacePaneBinding{
			PaneID:         fmt.Sprintf("pane-palette-%02d", index+1),
			ConversationID: snapshot.Conversation.ID,
		})
	}
	return bindings
}

func assertDistinctVisiblePaletteProfiles(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	topics []ConversationSnapshot,
	paletteIDs []conversationpalette.ConversationPaletteID,
) {
	t.Helper()
	for index, wantPaletteID := range paletteIDs {
		visible := readPresentationTestSnapshot(
			t,
			ctx,
			service,
			workspaceID,
			topics[index].Conversation.ID,
		)
		if visible.PresentationProfile.ResolvedPaletteID != wantPaletteID ||
			visible.PresentationProfile.PaletteReuse != nil {
			t.Fatalf(
				"visible topic %d presentation = %+v, want distinct palette %q without reuse",
				index+1,
				visible.PresentationProfile,
				wantPaletteID,
			)
		}
	}
}

func assertExhaustedPaletteProfile(
	t *testing.T,
	profile ConversationPresentationProfile,
	conflictingConversationID string,
) {
	t.Helper()
	reuse := profile.PaletteReuse
	if profile.ResolvedPaletteID != conversationpalette.ConversationPaletteSky ||
		reuse == nil ||
		reuse.Reason != PresentationReuseCatalogExhausted ||
		reuse.ResolvedChoiceID != string(conversationpalette.ConversationPaletteSky) ||
		len(reuse.ConflictingConversationIDs) != 1 ||
		reuse.ConflictingConversationIDs[0] != conflictingConversationID {
		t.Fatalf("exhausted palette presentation = %+v", profile)
	}
}

func createPaletteTestTopic(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	title string,
) ConversationSnapshot {
	t.Helper()
	snapshot, err := service.CreateTopic(ctx, workspaceID, title)
	if err != nil {
		t.Fatalf("create %s topic: %v", title, err)
	}
	return snapshot
}

func replacePaletteTestPaneBindings(
	t *testing.T,
	store *Store,
	workspaceID string,
	bindings []WorkspacePaneBinding,
) {
	t.Helper()
	if err := store.ReplaceWorkspacePaneBindings(
		context.Background(),
		workspaceID,
		bindings,
		"2026-07-14T20:00:00Z",
	); err != nil {
		t.Fatalf("replace palette test pane bindings: %v", err)
	}
}

func createSubscribedServiceTopic(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
) (ConversationSnapshot, ConversationEventSubscription) {
	t.Helper()
	created, err := service.CreateTopic(ctx, workspaceID, "Durable lifecycle")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	subscription, err := service.SubscribeEvents(created.EventCursor, workspaceID, created.Conversation.ID)
	if err != nil {
		t.Fatalf("SubscribeEvents: %v", err)
	}
	return created, subscription
}

func exerciseQueuedServiceTurns(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	conversationID string,
	created ConversationSnapshot,
	subscription ConversationEventSubscription,
) {
	t.Helper()
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, "hold"); err != nil {
		t.Fatalf("SendTurn hold: %v", err)
	}
	runtime.waitForStart(t, "hold")
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWorking && latestSnapshotTurn(snapshot).Status == TurnStatusRunning
	})
	if event := readServiceEvent(t, subscription); event.Sequence <= created.EventCursor.Sequence {
		t.Fatalf("first live event sequence = %d, want after %d", event.Sequence, created.EventCursor.Sequence)
	}

	if _, err := service.queueTestTurn(ctx, workspaceID, conversationID, "queued artifact"); err != nil {
		t.Fatalf("QueueTurn: %v", err)
	}
	if _, err := service.queueTestTurn(ctx, workspaceID, conversationID, "queued artifact two"); err != nil {
		t.Fatalf("QueueTurn second: %v", err)
	}
	if _, err := service.steerTestTurn(ctx, workspaceID, conversationID, "finish held work"); err != nil {
		t.Fatalf("SteerTurn: %v", err)
	}
	runtime.waitForStart(t, "queued artifact")
	runtime.waitForStart(t, "queued artifact two")
	completed := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return len(snapshot.Turns.Turns) == 3 &&
			latestSnapshotTurn(snapshot).Status == TurnStatusCompleted &&
			len(snapshot.Queue) == 0 && len(snapshot.Artifacts.Artifacts) >= 3
	})
	if completed.Conversation.Status != ConversationStatusIdle {
		t.Fatalf("completed conversation status = %s, want idle", completed.Conversation.Status)
	}
}

func exerciseServiceApproval(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	conversationID string,
) {
	t.Helper()
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, "approval"); err != nil {
		t.Fatalf("SendTurn approval: %v", err)
	}
	runtime.waitForStart(t, "approval")
	approval := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWaitingForApproval
	})
	approvalID := latestPendingApprovalID(approval)
	if _, err := service.SubmitApproval(ctx, workspaceID, conversationID, ConversationApprovalResponse{
		ApprovalID: approvalID,
		Decision:   TrajectoryApprovalDecisionAnswered,
		Answers: []ConversationApprovalAnswer{{
			QuestionID: "scope",
			Answers:    []string{"focused"},
		}},
	}); err != nil {
		t.Fatalf("SubmitApproval: %v", err)
	}
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
}

func exerciseServiceCancellation(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	conversationID string,
) {
	t.Helper()
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, "hold cancel"); err != nil {
		t.Fatalf("SendTurn cancel: %v", err)
	}
	runtime.waitForStart(t, "hold cancel")
	if _, err := service.StopTurn(ctx, workspaceID, conversationID); err != nil {
		t.Fatalf("StopTurn: %v", err)
	}
	terminal := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCancelled
	})
	if terminal.Conversation.Status != ConversationStatusIdle {
		t.Fatalf("cancelled conversation status = %s, want idle", terminal.Conversation.Status)
	}
}

func assertReloadedServiceState(
	t *testing.T,
	ctx context.Context,
	store *Store,
	service *Service,
	appDataDir string,
	workspaceID string,
	conversationID string,
) {
	t.Helper()
	if err := service.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}
	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	reloaded, err := reopened.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		t.Fatalf("ReadSnapshot after reload: %v", err)
	}
	if latestSnapshotTurn(reloaded).Status != TurnStatusCancelled || len(reloaded.Artifacts.Artifacts) < 2 {
		t.Fatalf("reloaded snapshot lost terminal/artifact state: %+v", reloaded)
	}
}

func newConversationServiceTestHarness(
	t *testing.T,
	appDataDir string,
	additionalOptions ...ServiceOption,
) (*Store, *Service, *serviceTestAgentRuntime, string) {
	t.Helper()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if _, err := store.EnsureMasterVoiceSelection(
		context.Background(),
		speech.DefaultMasterVoiceSelection("2026-07-11T20:00:00Z"),
	); err != nil {
		t.Fatalf("EnsureMasterVoiceSelection: %v", err)
	}
	if _, err := store.EnsureNarratorVoiceDefault(
		context.Background(),
		speech.DefaultNarratorVoiceSelection("2026-07-11T20:00:00Z"),
	); err != nil {
		t.Fatalf("EnsureNarratorVoiceDefault: %v", err)
	}
	workspaceRoot := t.TempDir()
	workspaceID := "workspace-service"
	runtime := newServiceTestAgentRuntime()
	var idMu sync.Mutex
	idCounts := map[string]int{}
	var clockMu sync.Mutex
	now := time.Date(2026, 7, 11, 20, 0, 0, 0, time.UTC)
	options := []ServiceOption{
		WithServiceIDGenerator(func(prefix string) (string, error) {
			idMu.Lock()
			defer idMu.Unlock()
			idCounts[prefix]++
			return fmt.Sprintf("%s-%d", prefix, idCounts[prefix]), nil
		}),
		WithServiceClock(func() time.Time {
			clockMu.Lock()
			defer clockMu.Unlock()
			now = now.Add(time.Second)
			return now
		}),
	}
	options = append(options, additionalOptions...)
	service, err := NewService(
		store,
		serviceTestWorkspaceResolver{summary: workspace.WorkspaceSummary{
			ID:       workspaceID,
			RootPath: filepath.Clean(workspaceRoot),
		}},
		runtime,
		options...,
	)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return store, service, runtime, workspaceID
}

type serviceTestWorkspaceResolver struct {
	summary workspace.WorkspaceSummary
}

func (resolver serviceTestWorkspaceResolver) ResolveActiveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	if id != resolver.summary.ID {
		return workspace.WorkspaceSummary{}, fmt.Errorf("workspace not active: %s", id)
	}
	return resolver.summary, nil
}

type serviceTestAgentRuntime struct {
	mu                   sync.Mutex
	controls             map[string]chan string
	controlLog           []string
	forkErr              error
	forkRequests         []agent.ForkThreadRequest
	forkResponse         *agent.Thread
	injectErr            error
	injections           []serviceTestInjection
	lastApproval         *agent.ApprovalResponse
	operationLog         []string
	resolveRequests      []agent.Invocation
	resumeRequests       []serviceTestResume
	runRequests          []agent.TurnRequest
	startRequests        []agent.StartThreadRequest
	started              chan string
	providerThreads      map[string]agent.Thread
	interruptProviderErr error
	unsubscribeErr       error
	threads              int
	turns                int
	unsubscribed         []string
}

type serviceTestInjection struct {
	threadID string
	items    []agent.InjectedTextItem
}

type serviceTestResume struct {
	threadID string
	request  agent.StartThreadRequest
}

func newServiceTestAgentRuntime() *serviceTestAgentRuntime {
	return &serviceTestAgentRuntime{
		controls:        map[string]chan string{},
		started:         make(chan string, MaxSnapshotQueuedTurns+4),
		providerThreads: map[string]agent.Thread{},
	}
}

func (runtime *serviceTestAgentRuntime) ResolveInvocation(
	_ context.Context,
	request agent.Invocation,
) (agent.ResolvedInvocation, error) {
	runtime.mu.Lock()
	runtime.resolveRequests = append(runtime.resolveRequests, request)
	runtime.mu.Unlock()
	return agent.ResolvedInvocation{
		Requested:       request,
		Model:           request.Model,
		ReasoningEffort: request.ReasoningEffort,
		ServiceTier:     request.ServiceTier,
		PermissionMode:  request.PermissionMode,
		ApprovalMode:    request.ApprovalMode,
	}, nil
}

func (runtime *serviceTestAgentRuntime) StartThread(
	_ context.Context,
	request agent.StartThreadRequest,
) (agent.Thread, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.startRequests = append(runtime.startRequests, request)
	runtime.threads++
	thread := agent.Thread{
		ID:        fmt.Sprintf("provider-thread-%d", runtime.threads),
		SessionID: fmt.Sprintf("session-%d", runtime.threads),
		CWD:       request.WorkspaceRoot,
		Model:     request.Invocation.Model,
		Ephemeral: request.Ephemeral,
	}
	runtime.providerThreads[thread.ID] = thread
	runtime.operationLog = append(runtime.operationLog, "thread/start:"+thread.ID)
	return thread, nil
}

func (runtime *serviceTestAgentRuntime) ResumeThreadWithConfiguration(
	_ context.Context,
	threadID string,
	request agent.StartThreadRequest,
) (agent.ThreadResumeResult, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.resumeRequests = append(runtime.resumeRequests, serviceTestResume{
		threadID: threadID,
		request:  request,
	})
	runtime.operationLog = append(runtime.operationLog, "thread/resume:"+threadID)
	thread, ok := runtime.providerThreads[threadID]
	if !ok {
		return agent.ThreadResumeResult{}, &agent.ProviderThreadMissingError{
			Operation: "resume agent thread",
			ThreadID:  threadID,
			Err:       fmt.Errorf("scripted provider thread %s missing", threadID),
		}
	}
	thread.CWD = request.WorkspaceRoot
	thread.Model = request.Invocation.Model
	thread.Ephemeral = request.Ephemeral
	runtime.providerThreads[threadID] = thread
	return agent.ThreadResumeResult{Thread: thread, Resumed: true}, nil
}

func (runtime *serviceTestAgentRuntime) ForkThread(
	_ context.Context,
	request agent.ForkThreadRequest,
) (agent.Thread, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.forkRequests = append(runtime.forkRequests, request)
	if runtime.forkErr != nil {
		return agent.Thread{}, runtime.forkErr
	}
	if runtime.forkResponse != nil {
		runtime.providerThreads[runtime.forkResponse.ID] = *runtime.forkResponse
		return *runtime.forkResponse, nil
	}
	runtime.threads++
	parentThreadID := request.ParentThreadID
	thread := agent.Thread{
		ID:           fmt.Sprintf("provider-thread-%d", runtime.threads),
		SessionID:    fmt.Sprintf("session-%d", runtime.threads),
		Model:        request.Invocation.Model,
		Ephemeral:    request.Ephemeral,
		ForkedFromID: &parentThreadID,
	}
	runtime.providerThreads[thread.ID] = thread
	return thread, nil
}

func (runtime *serviceTestAgentRuntime) InjectItems(
	_ context.Context,
	threadID string,
	items []agent.InjectedTextItem,
) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	copyItems := append([]agent.InjectedTextItem{}, items...)
	runtime.injections = append(runtime.injections, serviceTestInjection{threadID: threadID, items: copyItems})
	return runtime.injectErr
}

func (runtime *serviceTestAgentRuntime) MaterializeThread(
	_ context.Context,
	threadID string,
	marker string,
) error {
	runtime.mu.Lock()
	runtime.operationLog = append(runtime.operationLog, "thread/materialize:"+threadID)
	runtime.mu.Unlock()
	return runtime.InjectItems(context.Background(), threadID, []agent.InjectedTextItem{{
		Role: "user",
		Text: marker,
	}})
}

func (runtime *serviceTestAgentRuntime) RunTurn(
	ctx context.Context,
	request agent.TurnRequest,
	sink agent.EventSink,
) (agent.TurnResult, error) {
	runtime.mu.Lock()
	runtime.turns++
	runtime.runRequests = append(runtime.runRequests, request)
	runtime.operationLog = append(runtime.operationLog, "turn/start:"+request.ProviderThreadID+":"+request.Text)
	providerTurnID := fmt.Sprintf("provider-turn-%d", runtime.turns)
	control := make(chan string, 1)
	runtime.controls[providerTurnID] = control
	thread := runtime.providerThreads[request.ProviderThreadID]
	thread.Turns = append(thread.Turns, agent.ThreadTurn{ID: providerTurnID, Status: "inProgress", Items: []agent.ThreadItemSummary{}})
	thread.TurnCount = len(thread.Turns)
	runtime.providerThreads[request.ProviderThreadID] = thread
	runtime.mu.Unlock()
	base := agent.Event{
		ConversationID:   request.ConversationID,
		TurnID:           request.TurnID,
		ProviderThreadID: request.ProviderThreadID,
		ProviderTurnID:   providerTurnID,
	}
	started := base
	started.Kind = agent.EventKindTurnStarted
	if err := sink.HandleAgentEvent(started); err != nil {
		return agent.TurnResult{}, err
	}
	runtime.started <- request.Text
	result, err := runtime.runTestTurnScenario(ctx, request.Text, sink, base, control)
	runtime.mu.Lock()
	thread = runtime.providerThreads[request.ProviderThreadID]
	if request.Text == "side reroute" {
		thread.Model = "gpt-5.4-mini"
	}
	for index := range thread.Turns {
		if thread.Turns[index].ID != providerTurnID {
			continue
		}
		switch result.Outcome {
		case agent.TurnOutcomeCompleted:
			thread.Turns[index].Status = "completed"
		case agent.TurnOutcomeInterrupted:
			thread.Turns[index].Status = "interrupted"
		case agent.TurnOutcomeFailed:
			thread.Turns[index].Status = "failed"
		default:
			if err != nil {
				thread.Turns[index].Status = "failed"
			}
		}
	}
	runtime.providerThreads[request.ProviderThreadID] = thread
	runtime.mu.Unlock()
	return result, err
}

func (runtime *serviceTestAgentRuntime) runTestTurnScenario(
	ctx context.Context,
	text string,
	sink agent.EventSink,
	base agent.Event,
	control <-chan string,
) (agent.TurnResult, error) {
	switch text {
	case "approval", "secret approval", "approval long window":
		postApprovalEvents := 0
		if text == "approval long window" {
			postApprovalEvents = MaxSnapshotTrajectoryEvents + 2
		}
		if err := runtime.runApprovalScenario(ctx, text == "secret approval", postApprovalEvents, sink, base, control); err != nil {
			return agent.TurnResult{}, err
		}
	case "hold side context":
		if err := runtime.emitSideContextScenario(sink, base); err != nil {
			return agent.TurnResult{}, err
		}
		return runtime.runSideContextHeldScenario(ctx, sink, base, control)
	case "subagent":
		if err := runtime.emitSubagentLifecycle(sink, base); err != nil {
			return agent.TurnResult{}, err
		}
	case "missing terminal":
		return agent.TurnResult{
			ProviderThreadID: base.ProviderThreadID,
			ProviderTurnID:   base.ProviderTurnID,
			Outcome:          agent.TurnOutcomeCompleted,
		}, nil
	case "mismatched provider scope":
		mismatched := base
		mismatched.ProviderThreadID = "provider-thread-other"
		mismatched.Kind = agent.EventKindAgentTextCompleted
		mismatched.Text = &agent.TextEvent{
			ProviderItemID: "message-mismatched",
			Text:           "must not persist",
		}
		if err := sink.HandleAgentEvent(mismatched); err != nil {
			return agent.TurnResult{}, err
		}
	case "side reroute":
		rerouted := base
		rerouted.Kind = agent.EventKindModelRerouted
		rerouted.ModelReroute = &agent.ModelRerouteEvent{
			FromModel: "gpt-5.6-luna",
			ToModel:   "gpt-5.4-mini",
			Reason:    "provider_reroute",
		}
		if err := sink.HandleAgentEvent(rerouted); err != nil {
			return agent.TurnResult{}, err
		}
	case "hold", "hold cancel", "hold fail", "hold after failure":
		return runtime.runHeldScenario(ctx, text, sink, base, control)
	}
	return runtime.emitCompletedTurn(sink, base, text)
}

func (runtime *serviceTestAgentRuntime) emitSideContextScenario(
	sink agent.EventSink,
	base agent.Event,
) error {
	reasoning := base
	reasoning.Kind = agent.EventKindReasoningSummary
	reasoning.Text = &agent.TextEvent{
		ProviderItemID: "provider-reasoning-side-context",
		Text:           "PRIVATE_REASONING_MUST_NOT_ENTER_SIDE_CONTEXT",
	}
	if err := sink.HandleAgentEvent(reasoning); err != nil {
		return err
	}
	explanation := "Inspect the active parent state without changing it."
	plan := base
	plan.Kind = agent.EventKindPlanChanged
	plan.Plan = &agent.PlanEvent{
		Explanation: &explanation,
		Steps: []agent.PlanStep{
			{Step: "Inspect authoritative state", Status: "inProgress"},
			{Step: "Finish parent work", Status: "pending"},
		},
	}
	if err := sink.HandleAgentEvent(plan); err != nil {
		return err
	}
	artifact := base
	artifact.Kind = agent.EventKindActivityCompleted
	artifact.Activity = &agent.ActivityEvent{
		ProviderItemID: "provider-artifact-side-context",
		Kind:           agent.ActivityKindArtifact,
		Status:         "completed",
		Title:          "Side context result",
		Summary:        "/tmp/side-context-result.md",
	}
	if err := sink.HandleAgentEvent(artifact); err != nil {
		return err
	}
	activity := base
	activity.Kind = agent.EventKindActivityStarted
	activity.Activity = &agent.ActivityEvent{
		ProviderItemID: "provider-command-side-context",
		Kind:           agent.ActivityKindCommand,
		Status:         "inProgress",
		Title:          "sleep 12",
	}
	if err := sink.HandleAgentEvent(activity); err != nil {
		return err
	}
	activity.Kind = agent.EventKindActivityUpdated
	activity.Activity.Summary = "Waiting for the active parent command."
	if err := sink.HandleAgentEvent(activity); err != nil {
		return err
	}
	approval := base
	approval.Kind = agent.EventKindApprovalRequested
	approval.Approval = &agent.ApprovalRequest{
		ID:             "provider-approval-side-context",
		ProviderItemID: "provider-approval-item-side-context",
		Kind:           agent.ApprovalKindCommand,
		Title:          "Allow inspection",
		Body:           "Approve the parent inspection command.",
		Command:        "inspect parent",
	}
	return sink.HandleAgentEvent(approval)
}

func (runtime *serviceTestAgentRuntime) runSideContextHeldScenario(
	ctx context.Context,
	sink agent.EventSink,
	base agent.Event,
	control <-chan string,
) (agent.TurnResult, error) {
	for {
		select {
		case action := <-control:
			switch action {
			case "steer":
				continue
			case "interrupt":
				return runtime.emitTerminal(sink, base, agent.TurnOutcomeInterrupted)
			default:
				return agent.TurnResult{}, fmt.Errorf("unsupported side context control %q", action)
			}
		case <-ctx.Done():
			return agent.TurnResult{}, ctx.Err()
		}
	}
}

func (runtime *serviceTestAgentRuntime) runApprovalScenario(
	ctx context.Context,
	secret bool,
	postApprovalEvents int,
	sink agent.EventSink,
	base agent.Event,
	control <-chan string,
) error {
	approval := base
	approval.Kind = agent.EventKindApprovalRequested
	approval.Approval = &agent.ApprovalRequest{
		ID: "approval-" + base.ProviderTurnID, ProviderItemID: "approval-item", Kind: agent.ApprovalKindUserInput,
		Title: "Scope", Body: "Choose scope", Questions: []agent.ApprovalQuestion{{
			ID: "scope", Header: "Scope", Question: "Which scope?", Options: []string{"focused"}, Secret: secret,
		}},
	}
	if err := sink.HandleAgentEvent(approval); err != nil {
		return err
	}
	for index := 0; index < postApprovalEvents; index++ {
		progress := base
		progress.Kind = agent.EventKindAgentTextDelta
		progress.Text = &agent.TextEvent{
			ProviderItemID: fmt.Sprintf("approval-progress-%03d", index),
			Text:           "waiting",
		}
		if err := sink.HandleAgentEvent(progress); err != nil {
			return err
		}
	}
	select {
	case <-control:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (runtime *serviceTestAgentRuntime) runHeldScenario(
	ctx context.Context,
	text string,
	sink agent.EventSink,
	base agent.Event,
	control <-chan string,
) (agent.TurnResult, error) {
	var action string
	select {
	case action = <-control:
	case <-ctx.Done():
		return agent.TurnResult{}, ctx.Err()
	}
	if action == "interrupt" {
		return runtime.emitTerminal(sink, base, agent.TurnOutcomeInterrupted)
	}
	if text != "hold fail" {
		return runtime.emitCompletedTurn(sink, base, text)
	}
	message := "scripted held failure"
	terminal := base
	terminal.Kind = agent.EventKindTurnTerminal
	terminal.Terminal = &agent.TerminalEvent{Outcome: agent.TurnOutcomeFailed, Error: &message}
	if err := sink.HandleAgentEvent(terminal); err != nil {
		return agent.TurnResult{}, err
	}
	return agent.TurnResult{
		ProviderThreadID: base.ProviderThreadID,
		ProviderTurnID:   base.ProviderTurnID,
		Outcome:          agent.TurnOutcomeFailed,
	}, nil
}

func (runtime *serviceTestAgentRuntime) emitSubagentLifecycle(
	sink agent.EventSink,
	base agent.Event,
) error {
	for _, status := range []string{"started", "interacted", "interrupted"} {
		event := base
		event.Kind = agent.EventKindActivityCompleted
		event.Activity = &agent.ActivityEvent{
			ProviderItemID: "subagent-item-" + status,
			Kind:           agent.ActivityKindSubagent,
			Status:         status,
			Title:          "reviewer",
			Summary:        "provider-subagent-thread",
		}
		if err := sink.HandleAgentEvent(event); err != nil {
			return err
		}
	}
	return nil
}

func (runtime *serviceTestAgentRuntime) emitCompletedTurn(
	sink agent.EventSink,
	base agent.Event,
	text string,
) (agent.TurnResult, error) {
	message := base
	message.Kind = agent.EventKindAgentTextCompleted
	message.Text = &agent.TextEvent{ProviderItemID: "message-" + base.ProviderTurnID, Text: "completed " + text}
	if err := sink.HandleAgentEvent(message); err != nil {
		return agent.TurnResult{}, err
	}
	artifact := base
	artifact.Kind = agent.EventKindActivityCompleted
	artifact.Activity = &agent.ActivityEvent{
		ProviderItemID: "artifact-" + base.ProviderTurnID,
		Kind:           agent.ActivityKindArtifact,
		Status:         "completed",
		Title:          "Result file",
		Summary:        "/tmp/result-" + base.ProviderTurnID + ".md",
	}
	if err := sink.HandleAgentEvent(artifact); err != nil {
		return agent.TurnResult{}, err
	}
	return runtime.emitTerminal(sink, base, agent.TurnOutcomeCompleted)
}

func (runtime *serviceTestAgentRuntime) emitTerminal(
	sink agent.EventSink,
	base agent.Event,
	outcome agent.TurnOutcome,
) (agent.TurnResult, error) {
	terminal := base
	terminal.Kind = agent.EventKindTurnTerminal
	terminal.Terminal = &agent.TerminalEvent{Outcome: outcome}
	if err := sink.HandleAgentEvent(terminal); err != nil {
		return agent.TurnResult{}, err
	}
	return agent.TurnResult{
		ProviderThreadID: base.ProviderThreadID,
		ProviderTurnID:   base.ProviderTurnID,
		Outcome:          outcome,
	}, nil
}

func (runtime *serviceTestAgentRuntime) SteerTurn(_ context.Context, request agent.TurnControlRequest) error {
	runtime.signal(request.ProviderTurnID, "steer")
	return nil
}

func (runtime *serviceTestAgentRuntime) InterruptTurn(_ context.Context, request agent.TurnControlRequest) error {
	runtime.signal(request.ProviderTurnID, "interrupt")
	return nil
}

func (runtime *serviceTestAgentRuntime) InterruptProviderTurn(_ context.Context, threadID string, turnID string) error {
	runtime.mu.Lock()
	if runtime.interruptProviderErr != nil {
		err := runtime.interruptProviderErr
		runtime.mu.Unlock()
		return err
	}
	control := runtime.controls[turnID]
	thread := runtime.providerThreads[threadID]
	for index := range thread.Turns {
		if thread.Turns[index].ID == turnID {
			thread.Turns[index].Status = "interrupted"
		}
	}
	runtime.providerThreads[threadID] = thread
	runtime.controlLog = append(runtime.controlLog, turnID+":provider-interrupt")
	runtime.mu.Unlock()
	if control != nil {
		control <- "interrupt"
	}
	return nil
}

func (runtime *serviceTestAgentRuntime) ReconcileTurn(
	_ context.Context,
	threadID string,
	turnID string,
) (agent.TurnResult, bool, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	thread, ok := runtime.providerThreads[threadID]
	if !ok {
		return agent.TurnResult{}, false, fmt.Errorf("provider thread %s was not found", threadID)
	}
	for _, turn := range thread.Turns {
		if turn.ID != turnID {
			continue
		}
		result := agent.TurnResult{ProviderThreadID: threadID, ProviderTurnID: turnID}
		switch turn.Status {
		case "inProgress":
			return result, true, nil
		case "completed":
			result.Outcome = agent.TurnOutcomeCompleted
		case "interrupted":
			result.Outcome = agent.TurnOutcomeInterrupted
		case "failed":
			message := "scripted provider turn failed"
			result.Outcome = agent.TurnOutcomeFailed
			result.Error = &message
		default:
			return agent.TurnResult{}, false, fmt.Errorf("unsupported provider turn status %s", turn.Status)
		}
		return result, false, nil
	}
	return agent.TurnResult{}, false, fmt.Errorf("provider turn %s was not found", turnID)
}

func (runtime *serviceTestAgentRuntime) SubmitApproval(response agent.ApprovalResponse) error {
	runtime.mu.Lock()
	copy := response
	runtime.lastApproval = &copy
	runtime.mu.Unlock()
	providerTurnID := response.RequestID[len("approval-"):]
	runtime.signal(providerTurnID, "approval")
	return nil
}

func (runtime *serviceTestAgentRuntime) UnsubscribeThread(_ context.Context, threadID string) error {
	_, err := runtime.UnsubscribeThreadWithStatus(context.Background(), threadID)
	return err
}

func (runtime *serviceTestAgentRuntime) UnsubscribeThreadWithStatus(
	_ context.Context,
	threadID string,
) (agent.ThreadUnsubscribeStatus, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.unsubscribeErr != nil {
		return "", runtime.unsubscribeErr
	}
	runtime.unsubscribed = append(runtime.unsubscribed, threadID)
	if _, ok := runtime.providerThreads[threadID]; !ok {
		return agent.ThreadUnsubscribeStatusNotLoaded, nil
	}
	return agent.ThreadUnsubscribeStatusUnsubscribed, nil
}

func (runtime *serviceTestAgentRuntime) signal(providerTurnID string, value string) {
	runtime.mu.Lock()
	control := runtime.controls[providerTurnID]
	runtime.controlLog = append(runtime.controlLog, providerTurnID+":"+value)
	runtime.mu.Unlock()
	control <- value
}

func (runtime *serviceTestAgentRuntime) controlsSent() []string {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]string{}, runtime.controlLog...)
}

func (runtime *serviceTestAgentRuntime) durableForkRequests() []agent.ForkThreadRequest {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]agent.ForkThreadRequest{}, runtime.forkRequests...)
}

func (runtime *serviceTestAgentRuntime) sideForkRequests() []agent.ForkThreadRequest {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	requests := make([]agent.ForkThreadRequest, 0)
	for _, request := range runtime.forkRequests {
		if request.Ephemeral {
			requests = append(requests, request)
		}
	}
	return requests
}

func (runtime *serviceTestAgentRuntime) invocationResolutions() []agent.Invocation {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]agent.Invocation{}, runtime.resolveRequests...)
}

func (runtime *serviceTestAgentRuntime) turnRequests() []agent.TurnRequest {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]agent.TurnRequest{}, runtime.runRequests...)
}

func (runtime *serviceTestAgentRuntime) startThreadRequests() []agent.StartThreadRequest {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]agent.StartThreadRequest{}, runtime.startRequests...)
}

func (runtime *serviceTestAgentRuntime) operations() []string {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]string{}, runtime.operationLog...)
}

func (runtime *serviceTestAgentRuntime) unsubscribedThreads() []string {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]string{}, runtime.unsubscribed...)
}

func (runtime *serviceTestAgentRuntime) injectedThreadItems() []serviceTestInjection {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	result := make([]serviceTestInjection, 0, len(runtime.injections))
	for _, injection := range runtime.injections {
		result = append(result, serviceTestInjection{
			threadID: injection.threadID,
			items:    append([]agent.InjectedTextItem{}, injection.items...),
		})
	}
	return result
}

func (runtime *serviceTestAgentRuntime) submittedApproval() *agent.ApprovalResponse {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.lastApproval == nil {
		return nil
	}
	copy := *runtime.lastApproval
	return &copy
}

func (runtime *serviceTestAgentRuntime) waitForStart(t *testing.T, text string) {
	t.Helper()
	select {
	case got := <-runtime.started:
		if got != text {
			t.Fatalf("started turn text = %q, want %q", got, text)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for turn %q to start", text)
	}
}

func assertServiceSnapshot(
	t *testing.T,
	service *Service,
	workspaceID string,
	conversationID string,
	done func(ConversationSnapshot) bool,
) ConversationSnapshot {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		snapshot, err := service.ReadSnapshot(context.Background(), workspaceID, conversationID)
		if err != nil {
			t.Fatalf("ReadSnapshot: %v", err)
		}
		if done(snapshot) {
			return snapshot
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for snapshot state: %+v", snapshot)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func latestSnapshotTurn(snapshot ConversationSnapshot) ConversationTurn {
	return snapshot.Turns.Turns[len(snapshot.Turns.Turns)-1]
}

func latestPendingApprovalID(snapshot ConversationSnapshot) string {
	if len(snapshot.PendingApprovals) == 0 {
		return ""
	}
	return snapshot.PendingApprovals[len(snapshot.PendingApprovals)-1].Approval.ID
}

func readServiceEvent(t *testing.T, subscription ConversationEventSubscription) ConversationEvent {
	t.Helper()
	select {
	case event := <-subscription.Events():
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for conversation event")
		return ConversationEvent{}
	}
}
